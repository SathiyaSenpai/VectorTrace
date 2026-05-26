let creating: Promise<void> | null = null; // A global promise to avoid race conditions when creating the offscreen document

/**
 * Ensures the offscreen document is created and active.
 */
async function setupOffscreenDocument(): Promise<void> {
	const offscreenUrl = chrome.runtime.getURL("offscreen.html");

	// Check if the document already exists
	// @ts-expect-error
	if (typeof chrome.offscreen.getContexts === "function") {
		// @ts-expect-error
		const contexts = await chrome.offscreen.getContexts({
			contextTypes: ["OFFSCREEN_DOCUMENT"],
			documentUrls: [offscreenUrl],
		});
		if (contexts.length > 0) return;
	} else {
		// Fallback checking open window clients
		const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
		for (const client of clients) {
			if (client.url === offscreenUrl) return;
		}
	}

	if (creating) {
		await creating;
		return;
	}

	creating = chrome.offscreen.createDocument({
		url: "offscreen.html",
		reasons: ["DOM_PARSER" as chrome.offscreen.Reason],
		justification: "Run WebAssembly embedding pipeline in window/document context",
	});

	await creating;
	creating = null;
}

/**
 * Delegate embedding generation to the Offscreen Document.
 * This completely keeps the heavy WASM module execution and window dependencies out of the service worker.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
	const startTime = Date.now();
	console.log(
		`[embedding-pipeline] Requesting embedding from offscreen for: "${text.substring(0, 30)}..."`,
	);

	await setupOffscreenDocument();

	return new Promise((resolve, reject) => {
		chrome.runtime.sendMessage(
			{
				type: "OFFSCREEN_GENERATE_EMBEDDING",
				text,
			},
			(response) => {
				const duration = Date.now() - startTime;
				if (chrome.runtime.lastError) {
					console.error(
						"[embedding-pipeline] runtime.sendMessage error:",
						chrome.runtime.lastError,
					);
					return reject(new Error(chrome.runtime.lastError.message));
				}
				if (response?.error) {
					console.error("[embedding-pipeline] offscreen script returned error:", response.error);
					return reject(new Error(response.error));
				}
				if (!response?.embedding) {
					console.error("[embedding-pipeline] offscreen returned invalid response:", response);
					return reject(new Error("No embedding returned from offscreen document"));
				}
				console.log(`[embedding-pipeline] Offscreen embedding received in ${duration}ms`);
				resolve(response.embedding);
			},
		);
	});
}
