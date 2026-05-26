import { ElementPicker } from "../content/element-picker";
import { generateCSSSelector, generateXPath } from "../content/selector-generator";
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

		chrome.runtime.onMessage.addListener((message: MessageType) => {
			if (message.type === "START_SELECTION") {
				activeSchemaId = message.schemaId;
				picker.activate();
			}
		});
	},
});
