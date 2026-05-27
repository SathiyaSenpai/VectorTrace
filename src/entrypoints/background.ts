import { generateEmbedding } from "../background/embedding-pipeline";
import { rankCandidates } from "../background/similarity";
import { getSchema, saveSchema } from "../shared/chrome-storage";
import { getFieldEmbedding, saveFieldEmbedding } from "../shared/idb-store";
import { sendMessageWithRetry } from "../shared/messaging";
import type { MessageType } from "../shared/types";

export default defineBackground({
	type: "module",
	main() {
		console.log("VectorTrace background loaded");

		chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
			// Keep the message channel open by returning true, delegating task execution to an async function.
			handleMessage(message, sendResponse);
			return true;
		});
	},
});

const sessionEmbeddingCache = new Map<string, number[]>();

async function handleMessage(
	message: MessageType,
	sendResponse: (response?: unknown) => void,
): Promise<void> {
	try {
		if (message.type === "GENERATE_EMBEDDING") {
			const start = Date.now();
			let embedding = sessionEmbeddingCache.get(message.text);
			if (!embedding) {
				embedding = await generateEmbedding(message.text);
				sessionEmbeddingCache.set(message.text, embedding);
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
			let embedding = sessionEmbeddingCache.get(message.field.textContent);
			if (!embedding) {
				embedding = await generateEmbedding(message.field.textContent);
				sessionEmbeddingCache.set(message.field.textContent, embedding);
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
			console.log(`[background] FIELD_SELECTED saved in ${Date.now() - start}ms`);
			sendResponse({ success: true });
		} else if (message.type === "FIND_CANDIDATES") {
			const start = Date.now();
			const { fieldId } = message;

			// 1. Load stored embedding
			const field = await getFieldEmbedding(fieldId);
			if (!field?.embedding) {
				throw new Error(`Embedding not found for fieldId: ${fieldId}`);
			}

			// 2. Ask content script for page elements
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (!tab?.id) {
				throw new Error("No active tab found");
			}

			console.log("[background] Requesting ENUMERATE_PAGE from content script...");
			const response = (await sendMessageWithRetry(tab.id, {
				type: "ENUMERATE_PAGE",
			})) as
				| { candidates?: { text: string; cssSelector: string; xpathSelector: string }[] }
				| undefined;

			const candidates = response?.candidates;
			if (!candidates || !Array.isArray(candidates)) {
				throw new Error("No candidates returned from the content script");
			}

			console.log(
				`[background] Received ${candidates.length} candidates from content script. Processing embeddings in chunks of 25...`,
			);

			// 3. Batch generate embeddings (chunks of 25)
			const chunkSize = 25;
			const candidatesWithEmbeddings = [];
			const total = candidates.length;

			for (let i = 0; i < total; i += chunkSize) {
				const chunk = candidates.slice(i, i + chunkSize);
				const results = await Promise.all(
					chunk.map(async (cand) => {
						try {
							let embedding = sessionEmbeddingCache.get(cand.text);
							if (!embedding) {
								embedding = await generateEmbedding(cand.text);
								sessionEmbeddingCache.set(cand.text, embedding);
							}
							return {
								textContent: cand.text,
								cssSelector: cand.cssSelector,
								xpathSelector: cand.xpathSelector,
								embedding,
							};
						} catch (err) {
							console.error(`[background] Failed to embed text chunk: "${cand.text}"`, err);
							return null;
						}
					}),
				);

				for (const res of results) {
					if (res) {
						candidatesWithEmbeddings.push(res);
					}
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

			// 4. Rank candidates by similarity
			console.log("[background] Ranking candidates...");
			const ranked = rankCandidates(field.embedding, candidatesWithEmbeddings);

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
