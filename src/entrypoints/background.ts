import { generateEmbedding } from "../background/embedding-pipeline";
import { rankCandidates } from "../background/similarity";
import { getSchema, saveSchema } from "../shared/chrome-storage";
import { saveFieldEmbedding } from "../shared/idb-store";
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

async function handleMessage(
	message: MessageType,
	sendResponse: (response?: unknown) => void,
): Promise<void> {
	try {
		if (message.type === "GENERATE_EMBEDDING") {
			const start = Date.now();
			const embedding = await generateEmbedding(message.text);
			console.log(`[background] GENERATE_EMBEDDING finished in ${Date.now() - start}ms`);
			sendResponse({ embedding });
		} else if (message.type === "COMPUTE_SIMILARITY") {
			const start = Date.now();
			// Generate embeddings for all candidate text strings
			const candidatesList = await Promise.all(
				message.candidateTexts.map(async (text) => {
					const embedding = await generateEmbedding(text);
					return {
						text,
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
			const embedding = await generateEmbedding(message.field.textContent);
			const completeField = {
				...message.field,
				embedding,
			};

			// Save the complete field embedding to IndexedDB
			await saveFieldEmbedding(completeField);

			// Load schema from chrome.storage.local (or initialize if not present)
			let schema = await getSchema(message.field.schemaId);
			if (!schema) {
				let tabUrl = "";
				try {
					const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
					tabUrl = tab?.url || "";
				} catch (_e) {
					// Fallback if tab queries fail in this context
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
		} else {
			// Other messages (e.g. START_SELECTION) are routed to content scripts or other targets
			sendResponse({ error: "Unhandled message type in background script" });
		}
	} catch (error) {
		console.error("[background] Error handling message:", error);
		sendResponse({ error: (error as Error).message });
	}
}
