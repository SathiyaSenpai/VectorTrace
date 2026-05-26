import { ElementPicker } from "../content/element-picker";
import type { MessageType } from "../shared/types";

export default defineContentScript({
	matches: ["<all_urls>"],
	main() {
		console.log("VectorTrace content loaded");

		const picker = new ElementPicker({
			onSelect: (element) => {
				const text = element.textContent?.trim() || "";
				console.log("Selected element textContent:", text);

				chrome.runtime.sendMessage({
					type: "FIELD_SELECTED",
					field: {
						fieldId: crypto.randomUUID(),
						schemaId: activeSchemaId,
						label: "",
						cssSelector: "",
						xpathSelector: "",
						textContent: text,
						timestamp: Date.now(),
					},
				} as MessageType);
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
