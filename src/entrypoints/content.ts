import { ElementPicker } from "../content/element-picker";
import { generateCSSSelector, generateXPath } from "../content/selector-generator";
import { enumeratePageElements, extractFields } from "../content/text-extractor";
import { getSchema } from "../shared/chrome-storage";
import type { MessageType } from "../shared/types";

export default defineContentScript({
	matches: ["<all_urls>"],
	main() {
		console.log("VectorTrace content loaded");

		const picker = new ElementPicker({
			onSelect: (element) => {
				const text = element.textContent?.trim() || "";
				const cssSelector = generateCSSSelector(element) || "";
				const xpathSelector = generateXPath(element) || "";

				console.log("Selected element textContent:", text);
				console.log("Generated CSS selector:", cssSelector);
				console.log("Generated XPath:", xpathSelector);

				chrome.runtime.sendMessage(
					{
						type: "FIELD_SELECTED",
						field: {
							fieldId: crypto.randomUUID(),
							schemaId: activeSchemaId,
							label: "",
							url: window.location.href,
							cssSelector,
							xpathSelector,
							textContent: text,
							timestamp: Date.now(),
						},
					} as MessageType,
					(response) => {
						console.log("FIELD_SELECTED response received:", response);
						if (chrome.runtime.lastError) {
							console.error("FIELD_SELECTED runtime error:", chrome.runtime.lastError);
						}
					},
				);
			},
		});

		let activeSchemaId = "";

		chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
			if (message.type === "START_SELECTION") {
				activeSchemaId = message.schemaId;
				picker.activate();
				sendResponse({ success: true });
			} else if (message.type === "RUN_EXTRACTION") {
				handleRunExtraction(message.schemaId, sendResponse);
				return true;
			} else if (message.type === "FIND_CANDIDATES" || message.type === "ENUMERATE_PAGE") {
				console.log(`[VectorTrace] Received page enumeration request: "${message.type}"`);
				const candidates = enumeratePageElements();
				console.log(
					`[VectorTrace] Enumerated ${candidates.length} candidate elements on the page.`,
				);
				chrome.runtime.sendMessage({
					type: "CANDIDATES_FOUND",
					candidates,
				} as MessageType);
				sendResponse({ candidates });
			}
		});

		async function handleRunExtraction(
			schemaId: string,
			sendResponse: (response?: unknown) => void,
		) {
			try {
				console.log(`[VectorTrace] RUN_EXTRACTION requested for schemaId: ${schemaId}`);
				const schema = await getSchema(schemaId);
				if (!schema) {
					throw new Error(`Schema with ID ${schemaId} not found`);
				}
				console.log(
					`[VectorTrace] Found schema: "${schema.name}" with ${schema.fields.length} fields. Running extraction...`,
				);
				const results = extractFields(schema.fields);
				const extractionResult = {
					schemaId,
					url: window.location.href,
					timestamp: Date.now(),
					fields: results.map((r) => ({
						fieldId: r.fieldId,
						label: r.label,
						value: r.value,
						status: r.status,
					})),
				};
				console.log("[VectorTrace] EXTRACTION_COMPLETE result:", extractionResult);
				chrome.runtime.sendMessage({
					type: "EXTRACTION_COMPLETE",
					result: extractionResult,
				} as MessageType);
				sendResponse({ success: true, result: extractionResult });
			} catch (err) {
				console.error("[VectorTrace] Extraction failed:", err);
				sendResponse({ error: (err as Error).message });
			}
		}
	},
});
