import { useEffect, useState } from "react";
import type { ExtractionResult, MessageType } from "../../shared/types";

export function useExtraction() {
	const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
	const [isExtracting, setIsExtracting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const listener = (message: MessageType) => {
			if (message.type === "EXTRACTION_COMPLETE" && message.result) {
				setExtractionResult(message.result);
			}
		};
		chrome.runtime.onMessage.addListener(listener);
		return () => {
			chrome.runtime.onMessage.removeListener(listener);
		};
	}, []);

	const runExtraction = async (schemaId: string): Promise<ExtractionResult | null> => {
		setIsExtracting(true);
		setError(null);
		try {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (!tab?.id) {
				throw new Error("No active web page tab found");
			}

			// Send message to content script of the active tab
			const response = await chrome.tabs.sendMessage(tab.id, {
				type: "RUN_EXTRACTION",
				schemaId,
			});

			if (response?.error) {
				throw new Error(response.error);
			}

			if (response?.result) {
				setExtractionResult(response.result);
				return response.result as ExtractionResult;
			}

			throw new Error("Empty response returned from extraction service");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to trigger extraction script";
			setError(msg);
			throw err;
		} finally {
			setIsExtracting(false);
		}
	};

	return {
		extractionResult,
		setExtractionResult,
		isExtracting,
		error,
		runExtraction,
	};
}
