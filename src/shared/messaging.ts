/**
 * Sends a message to a content script in a tab with automatic retry and script injection.
 * If the connection fails, it attempts to inject `content-scripts/content.js` via
 * `chrome.scripting.executeScript`, waits briefly, and retries the message up to 3 times.
 *
 * @param tabId - The ID of the target tab.
 * @param message - The message payload to send.
 * @param options - Optional sendMessage settings.
 * @returns Promise resolving to the message response.
 */
export async function sendMessageWithRetry(
	tabId: number,
	message: { type: string; [key: string]: unknown },
	options?: chrome.tabs.MessageSendOptions,
): Promise<unknown> {
	let attempts = 0;
	const maxAttempts = 3;

	while (attempts < maxAttempts) {
		try {
			return await chrome.tabs.sendMessage(tabId, message, options);
		} catch (error) {
			attempts++;
			const errMessage = error instanceof Error ? error.message : String(error);
			console.warn(
				`[messaging] Attempt ${attempts} failed to send message to tab ${tabId}:`,
				errMessage,
			);

			const isConnectionError =
				errMessage.includes("Could not establish connection") ||
				errMessage.includes("Receiving end does not exist");

			if (isConnectionError && attempts < maxAttempts) {
				console.log(`[messaging] Injecting content script into tab ${tabId} and retrying...`);
				try {
					await chrome.scripting.executeScript({
						target: { tabId },
						files: ["content-scripts/content.js"],
					});
					// Wait a moment for the script to load and boot
					await new Promise((resolve) => setTimeout(resolve, 300));
				} catch (injectError) {
					console.error("[messaging] Failed to auto-inject content script:", injectError);
				}
			} else if (attempts >= maxAttempts) {
				throw error;
			}
		}
	}
}
