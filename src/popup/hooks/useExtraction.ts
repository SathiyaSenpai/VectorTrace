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
			// Set up listener to wait for EXTRACTION_COMPLETE broadcast
			const extractionPromise = new Promise<ExtractionResult>((resolve, reject) => {
				const listener = (message: unknown) => {
					const msg = message as { type: string; result?: ExtractionResult };
					if (
						msg.type === "EXTRACTION_COMPLETE" &&
						msg.result &&
						msg.result.schemaId === schemaId
					) {
						chrome.runtime.onMessage.removeListener(listener);
						resolve(msg.result);
					}
				};
				chrome.runtime.onMessage.addListener(listener);

				// 15 seconds safety timeout
				setTimeout(() => {
					chrome.runtime.onMessage.removeListener(listener);
					reject(new Error("Extraction timed out waiting for EXTRACTION_COMPLETE"));
				}, 15000);
			});

			// Send message to background script
			const response = (await chrome.runtime.sendMessage({
				type: "RUN_EXTRACTION",
				schemaId,
			})) as { error?: string; success?: boolean } | undefined;

			if (response?.error) {
				throw new Error(response.error);
			}

			const result = await extractionPromise;
			setExtractionResult(result);
			return result;
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to run extraction";
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
