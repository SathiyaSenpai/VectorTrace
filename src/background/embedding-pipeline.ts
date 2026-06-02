// Global promise to prevent race condition when creating the offscreen doc
let creating: Promise<void> | null = null;

type ServiceWorkerLike = {
	clients?: {
		matchAll(options: {
			includeUncontrolled: boolean;
			type: "window";
		}): Promise<ReadonlyArray<{ url: string }>>;
	};
};

// Check if offscreen doc already exists
async function offscreenDocumentExists(offscreenUrl: string): Promise<boolean> {
	const runtimeWithContexts = chrome.runtime as typeof chrome.runtime & {
		getContexts?: (filter: {
			contextTypes: string[];
			documentUrls: string[];
		}) => Promise<unknown[]>;
	};

	if (typeof runtimeWithContexts.getContexts === "function") {
		try {
			const contexts = await runtimeWithContexts.getContexts({
				contextTypes: ["OFFSCREEN_DOCUMENT"],
				documentUrls: [offscreenUrl],
			});
			return contexts.length > 0;
		} catch (err) {
			console.warn("[embedding-pipeline] getContexts failed, falling back to clients:", err);
		}
	}

	const sw = self as unknown as ServiceWorkerLike;
	if (sw.clients) {
		try {
			const clients = await sw.clients.matchAll({ includeUncontrolled: true, type: "window" });
			return clients.some((client) => client.url === offscreenUrl);
		} catch (err) {
			console.warn("[embedding-pipeline] clients.matchAll failed:", err);
		}
	}

	return false;
}

// Ensures offscreen document is open. Safe to call concurrently.
async function setupOffscreenDocument(): Promise<void> {
	const offscreenUrl = chrome.runtime.getURL("offscreen.html");

	if (await offscreenDocumentExists(offscreenUrl)) {
		return;
	}

	if (creating) {
		await creating;
		return;
	}

	creating = chrome.offscreen
		.createDocument({
			url: "offscreen.html",
			reasons: ["DOM_PARSER" as chrome.offscreen.Reason],
			justification: "Run WebAssembly embedding pipeline in window/document context",
		})
		.then(() => undefined)
		.catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes("Only a single offscreen document")) {
				return;
			}
			throw err;
		});

	try {
		await creating;
	} finally {
		creating = null;
	}
}

const EMBEDDING_TIMEOUT_MS = 60_000;

type OffscreenEmbeddingResponse = {
	embedding?: number[];
	error?: string;
};

// Requests embedding from offscreen document (WASM requires DOM context in MV3)
export async function generateEmbedding(text: string): Promise<number[]> {
	const truncated = text.slice(0, 512);
	const startTime = Date.now();
	console.log(
		`[embedding-pipeline] Requesting embedding from offscreen for: "${truncated.substring(0, 30)}..."`,
	);

	await setupOffscreenDocument();

	return new Promise<number[]>((resolve, reject) => {
		let settled = false;

		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			console.error(
				`[embedding-pipeline] Embedding request timed out after ${EMBEDDING_TIMEOUT_MS}ms`,
			);
			reject(new Error("Embedding request timed out (offscreen document unresponsive)"));
		}, EMBEDDING_TIMEOUT_MS);

		chrome.runtime.sendMessage(
			{
				type: "OFFSCREEN_GENERATE_EMBEDDING",
				text: truncated,
			},
			(response: OffscreenEmbeddingResponse | undefined) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);

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
