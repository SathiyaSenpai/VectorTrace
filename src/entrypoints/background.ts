import { generateEmbedding } from "../background/embedding-pipeline";
import {
	rankCandidates,
	type StoredFieldContext,
} from "../background/similarity";
import { getSchema, saveSchema } from "../shared/chrome-storage";
import { getFieldEmbedding, saveFieldEmbedding } from "../shared/idb-store";
import { sendMessageWithRetry } from "../shared/messaging";
import type { MessageType } from "../shared/types";

export default defineBackground({
	type: "module",
	main() {
		console.log("[background] service worker loaded");

		chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
			// Keep the message channel open by returning true, delegating task execution to an async function.
			handleMessage(message, sendResponse);
			return true;
		});
	},
});

// LRU cache with max-size eviction to prevent unbounded memory growth
// (session can process thousands of embeddings across multiple large pages)
class LRUEmbeddingCache {
	private map = new Map<string, number[]>();
	private readonly maxSize: number;

	constructor(maxSize: number) {
		this.maxSize = maxSize;
	}

	get(key: string): number[] | undefined {
		if (!this.map.has(key)) return undefined;
		const value = this.map.get(key)!;
		// Re-insert to mark as most recently used
		this.map.delete(key);
		this.map.set(key, value);
		return value;
	}

	set(key: string, value: number[]): void {
		if (this.map.has(key)) {
			this.map.delete(key);
		} else if (this.map.size >= this.maxSize) {
			// Evict least recently used (oldest entry in Map insertion order)
			const firstKey = this.map.keys().next().value;
			if (firstKey !== undefined) this.map.delete(firstKey);
		}
		this.map.set(key, value);
	}
}

function getEmbeddingCacheKey(text: string): string {
	return text.replace(/\s+/g, " ").trim().slice(0, 512);
}

const sessionEmbeddingCache = new LRUEmbeddingCache(2000);

async function handleMessage(
	message: MessageType,
	sendResponse: (response?: unknown) => void,
): Promise<void> {
	try {
		if (message.type === "GENERATE_EMBEDDING") {
			const start = Date.now();
			const cacheKey = getEmbeddingCacheKey(message.text);
			let embedding = sessionEmbeddingCache.get(cacheKey);
			if (!embedding) {
				embedding = await generateEmbedding(message.text);
				sessionEmbeddingCache.set(cacheKey, embedding);
			}
			console.log(`[background] GENERATE_EMBEDDING finished in ${Date.now() - start}ms`);
			sendResponse({ embedding });
		} else if (message.type === "COMPUTE_SIMILARITY") {
			const start = Date.now();
			// Generate embeddings for all candidate text strings
			const candidatesList = await Promise.all(
				message.candidateTexts.map(async (text) => {
					let embedding = sessionEmbeddingCache.get(text);
					if (!embedding) {
						embedding = await generateEmbedding(text);
						sessionEmbeddingCache.set(text, embedding);
					}
					return {
						textContent: text,
						embedding,
						cssSelector: "",
						xpathSelector: "",
					};
				}),
			);
			const ranked = rankCandidates(message.storedEmbedding, candidatesList);
			console.log(`[background] COMPUTE_SIMILARITY finished in ${Date.now() - start}ms`);
			sendResponse({ candidates: ranked });
		} else if (message.type === "FIELD_SELECTED") {
			const start = Date.now();
			// Generate embedding for the field's text content
			const cacheKey = getEmbeddingCacheKey(message.field.textContent);
			let embedding = sessionEmbeddingCache.get(cacheKey);
			if (!embedding) {
				embedding = await generateEmbedding(message.field.textContent);
				sessionEmbeddingCache.set(cacheKey, embedding);
			}
			const completeField = {
				...message.field,
				embedding,
			};

			// Save the complete field embedding to IndexedDB
			await saveFieldEmbedding(completeField);

			// Load schema from chrome.storage.local (or initialize if not present)
			let schema = await getSchema(message.field.schemaId);
			if (!schema) {
				let tabUrl = message.field.url || "";
				if (!tabUrl) {
					try {
						const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
						tabUrl = tab?.url || "";
					} catch (_e) {
						// Fallback if tab queries fail in this context
					}
				}

				schema = {
					schemaId: message.field.schemaId,
					name: "Untitled Schema",
					url: tabUrl,
					fields: [],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				};
			}

			// Upsert field definition inside the schema fields array
			const existingIndex = schema.fields.findIndex((f) => f.fieldId === completeField.fieldId);
			if (existingIndex !== -1) {
				schema.fields[existingIndex] = completeField;
			} else {
				schema.fields.push(completeField);
			}
			schema.updatedAt = Date.now();

			// Save back using our chrome-storage wrapper (which automatically strips embeddings for storage limits)
			await saveSchema(schema);

			// Save last added field metadata so the popup can show the badge even after reopen
			await chrome.storage.local.set({
				lastAddedFieldId: completeField.fieldId,
				lastAddedFieldTime: Date.now(),
			});

			console.log(`[background] FIELD_SELECTED saved in ${Date.now() - start}ms`);
			sendResponse({ success: true });
		} else if (message.type === "FIND_CANDIDATES") {
			const start = Date.now();
			const { fieldId } = message;

			// 1. Load stored embedding + field metadata
			const field = await getFieldEmbedding(fieldId);
			if (!field?.embedding) {
				throw new Error(`Embedding not found for fieldId: ${fieldId}`);
			}

			// Build stored field context for multi-signal ranking
			// Use ground-truth structural metadata saved at field-definition time
			const storedFieldContext: StoredFieldContext = {
				tagName: field.tagName || "",
				textLength: (field.textContent || "").length,
				depth: field.depth ?? -1,
				isLeaf: field.isLeaf ?? true,
				ancestorContext: field.ancestorContext ?? [],
				cssSelector: field.cssSelector || "",
			};

			// 2. Ask content script for page elements (with structural metadata)
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (!tab?.id) {
				throw new Error("No active tab found");
			}

			console.log("[background] Requesting ENUMERATE_PAGE from content script...");
			type EnumeratedCandidate = {
				text: string;
				cssSelector: string;
				xpathSelector: string;
				tagName: string;
				depth?: number;
				isLeaf?: boolean;
				textLength?: number;
				ancestorContext?: string[];
			};
			const response = (await sendMessageWithRetry(tab.id, {
				type: "ENUMERATE_PAGE",
			})) as { candidates?: EnumeratedCandidate[] } | undefined;

			const candidates = response?.candidates;
			if (!candidates || !Array.isArray(candidates)) {
				throw new Error("No candidates returned from the content script");
			}

			console.log(
				`[background] Received ${candidates.length} candidates from content script. Processing embeddings in chunks of 25...`,
			);

			// 3. Batch generate embeddings (chunks of 25)
			const chunkSize = 25;
			const candidatesWithEmbeddings: {
				textContent: string;
				cssSelector: string;
				xpathSelector: string;
				tagName: string;
				embedding: number[];
				metadata?: {
					depth: number;
					isLeaf: boolean;
					textLength: number;
					ancestorContext: string[];
				};
			}[] = [];
			const total = candidates.length;

			for (let i = 0; i < total; i += chunkSize) {
				const chunk = candidates.slice(i, i + chunkSize);
				const results = await Promise.all(
					chunk.map(async (cand) => {
						try {
							// Cache by normalized key (first 512 chars) to match what actually
							// gets embedded — avoids cache misses and redundant embedding calls
							const cacheKey = getEmbeddingCacheKey(cand.text);
							let embedding = sessionEmbeddingCache.get(cacheKey);
							if (!embedding) {
								embedding = await generateEmbedding(cand.text);
								sessionEmbeddingCache.set(cacheKey, embedding);
							}
							return {
								textContent: cand.text,
								cssSelector: cand.cssSelector,
								xpathSelector: cand.xpathSelector,
								tagName: cand.tagName || "",
								embedding,
								// Pass structural metadata for multi-signal ranking
								metadata:
									cand.depth !== undefined
										? {
												depth: cand.depth,
												isLeaf: cand.isLeaf ?? true,
												textLength: cand.textLength ?? cand.text.length,
												ancestorContext: cand.ancestorContext ?? [],
											}
										: undefined,
							};
						} catch (err) {
							console.error(`[background] Failed to embed text chunk: "${cand.text}"`, err);
							return null;
						}
					}),
				);

				// No early-exit — all candidates must be scored so multi-signal ranking
				// can find the best overall candidate, not just the first high-embedding-score one
				for (const res of results) {
					if (res) candidatesWithEmbeddings.push(res);
				}

				// Send progress back to popup runtime
				chrome.runtime
					.sendMessage({
						type: "SEARCH_PROGRESS",
						current: Math.min(i + chunkSize, total),
						total,
					})
					.catch(() => {
						// Ignore errors if popup closed
					});
			}

			// 4. Rank candidates using multi-signal algorithm
			console.log("[background] Ranking candidates with multi-signal algorithm...");
			const ranked = rankCandidates(field.embedding, candidatesWithEmbeddings, storedFieldContext);

			console.log(`[background] FIND_CANDIDATES finished in ${Date.now() - start}ms`);
			sendResponse({ candidates: ranked });
		} else if (message.type === "RUN_EXTRACTION") {
			const start = Date.now();
			const { schemaId } = message;

			// Find the active tab in current window
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (!tab?.id) {
				throw new Error("No active tab found");
			}

			console.log(
				`[background] Forwarding RUN_EXTRACTION to tab ${tab.id} for schemaId: ${schemaId}`,
			);

			// Send message to content script of the active tab using retry mechanism
			const response = (await sendMessageWithRetry(tab.id, {
				type: "RUN_EXTRACTION",
				schemaId,
			})) as { error?: string; result?: unknown } | undefined;

			if (response?.error) {
				throw new Error(response.error);
			}

			console.log(`[background] RUN_EXTRACTION finished in ${Date.now() - start}ms`);
			sendResponse(response);
		} else {
			// Other messages (e.g. START_SELECTION) are routed to content scripts or other targets
			sendResponse({ error: "Unhandled message type in background script" });
		}
	} catch (error) {
		console.error("[background] Error handling message:", error);
		sendResponse({ error: (error as Error).message });
	}
}
