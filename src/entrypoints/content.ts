import { ElementPicker } from "../content/element-picker";
import { generateCSSSelector, generateXPath } from "../content/selector-generator";
import { enumeratePageElements, extractFields } from "../content/text-extractor";
import { getSchema } from "../shared/chrome-storage";
import { consumePendingHeals } from "../shared/heal-tracker";
import type { ExtractionResult, MessageType } from "../shared/types";

declare global {
	interface Window {
		__vtHighlightClear?: (() => void) | null;
	}
}

export default defineContentScript({
	matches: ["<all_urls>"],
	main() {
		console.log("[content] content script loaded");

		const picker = new ElementPicker({
			onSelect: (element) => {
				const text = element.textContent?.trim() || "";
				const cssSelector = generateCSSSelector(element) || "";
				const xpathSelector = generateXPath(element) || "";

				console.log("[content] Selected element textContent:", text);
				console.log("[content] Generated CSS selector:", cssSelector);
				console.log("[content] Generated XPath:", xpathSelector);

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
							tagName: element.tagName.toLowerCase(),
							timestamp: Date.now(),
						},
					} as MessageType,
					(response) => {
						console.log("[content] FIELD_SELECTED response received:", response);
						if (chrome.runtime.lastError) {
							console.error("[content] FIELD_SELECTED runtime error:", chrome.runtime.lastError);
						}
					},
				);
			},
			onDeactivate: () => {
				chrome.runtime.sendMessage({
					type: "PICKER_CANCELLED",
				} as MessageType);
			},
		});

		let activeSchemaId = "";

		chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
			if (message.type === "GET_PICKER_STATUS") {
				sendResponse({ isActive: picker.isActive() });
			} else if (message.type === "START_SELECTION") {
				activeSchemaId = message.schemaId;
				picker.activate();
				sendResponse({ success: true });
			} else if (message.type === "RUN_EXTRACTION") {
				handleRunExtraction(message.schemaId, sendResponse);
				return true;
			} else if (message.type === "ENUMERATE_PAGE") {
				console.log(`[content] Received page enumeration request: "${message.type}"`);
				const candidates = enumeratePageElements();
				console.log(`[content] Enumerated ${candidates.length} candidate elements on the page.`);
				chrome.runtime.sendMessage({
					type: "CANDIDATES_FOUND",
					candidates,
				} as MessageType);
				sendResponse({ candidates });
			} else if (message.type === "HIGHLIGHT_ELEMENT") {
				highlightElement(message.cssSelector);
				sendResponse({ success: true });
			} else if (message.type === "REMOVE_HIGHLIGHT") {
				removeHighlight();
				sendResponse({ success: true });
			}
		});

		async function handleRunExtraction(
			schemaId: string,
			sendResponse: (response?: unknown) => void,
		) {
			try {
				console.log(`[content] RUN_EXTRACTION requested for schemaId: ${schemaId}`);
				const schema = await getSchema(schemaId);
				if (!schema) {
					throw new Error(`Schema with ID ${schemaId} not found`);
				}
				console.log(
					`[content] Found schema: "${schema.name}" with ${schema.fields.length} fields. Running extraction...`,
				);
				// Pass full field data including textContent and tagName for identity verification
				const fieldInputs = schema.fields.map((f) => ({
					fieldId: f.fieldId,
					label: f.label,
					cssSelector: f.cssSelector,
					xpathSelector: f.xpathSelector,
					textContent: f.textContent,
					tagName: f.tagName || "",
				}));
				const results = await extractFields(fieldInputs);

				// If any of these fields were just healed, flag the successful ones as HEALED
				// (instead of plain OK) so the popup can show the "from -> to" heal badge.
				const pendingHeals = await consumePendingHeals(results.map((r) => r.fieldId));

				const extractionResult: ExtractionResult = {
					schemaId,
					url: window.location.href,
					timestamp: Date.now(),
					fields: results.map((r) => {
						const heal = pendingHeals[r.fieldId];
						// Only promote to HEALED when the healed selector actually resolved this run.
						if (heal && r.status === "OK") {
							return {
								fieldId: r.fieldId,
								label: r.label,
								value: r.value,
								status: "HEALED" as const,
								healedFrom: heal.healedFrom,
								healedTo: heal.healedTo,
							};
						}
						return {
							fieldId: r.fieldId,
							label: r.label,
							value: r.value,
							status: r.status,
							storedText: r.storedText,
						};
					}),
				};
				console.log("[content] EXTRACTION_COMPLETE result:", extractionResult);
				chrome.runtime.sendMessage({
					type: "EXTRACTION_COMPLETE",
					result: extractionResult,
				} as MessageType);
				sendResponse({ success: true, result: extractionResult });
			} catch (err) {
				console.error("[content] Extraction failed:", err);
				sendResponse({ error: (err as Error).message });
			}
		}

		function highlightElement(selector: string) {
			removeHighlight();

			let el: Element | null = null;
			try {
				el = document.querySelector(selector);
			} catch (err) {
				console.error("[content] Invalid selector for highlighting:", selector, err);
			}
			if (!el) return;

			const rect = el.getBoundingClientRect();
			const scrollY = window.scrollY;
			const scrollX = window.scrollX;

			const overlay = document.createElement("div");
			overlay.id = "vectortrace-highlight-overlay";
			overlay.style.position = "absolute";
			overlay.style.top = `${rect.top + scrollY}px`;
			overlay.style.left = `${rect.left + scrollX}px`;
			overlay.style.width = `${rect.width}px`;
			overlay.style.height = `${rect.height}px`;
			overlay.style.border = "3px solid #22c55e";
			overlay.style.backgroundColor = "rgba(34, 197, 94, 0.25)";
			overlay.style.borderRadius = "4px";
			overlay.style.pointerEvents = "none";
			overlay.style.zIndex = "2147483647";
			overlay.style.boxShadow = "0 0 15px rgba(34, 197, 94, 0.5)";
			overlay.style.transition = "all 0.3s ease";

			document.body.appendChild(overlay);

			let pulseState = true;
			const interval = setInterval(() => {
				if (!overlay.parentNode) {
					clearInterval(interval);
					return;
				}
				overlay.style.boxShadow = pulseState
					? "0 0 25px rgba(34, 197, 94, 0.8)"
					: "0 0 10px rgba(34, 197, 94, 0.4)";
				pulseState = !pulseState;
			}, 750);

			const timeout = setTimeout(() => {
				removeHighlight();
			}, 3000);

			window.__vtHighlightClear = () => {
				clearInterval(interval);
				clearTimeout(timeout);
				overlay.remove();
			};
		}

		function removeHighlight() {
			if (window.__vtHighlightClear) {
				window.__vtHighlightClear();
				window.__vtHighlightClear = null;
			}
			const existing = document.getElementById("vectortrace-highlight-overlay");
			if (existing) {
				existing.remove();
			}
		}
	},
});
