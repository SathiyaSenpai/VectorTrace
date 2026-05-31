// A global promise to avoid race conditions when creating the offscreen document.
let creating: Promise<void> | null = null;

/**
 * `self` inside the MV3 service worker is a `ServiceWorkerGlobalScope`, which exposes
 * `clients`. The default DOM `Window` typings used in the bundler context do not, so we
 * describe the minimal shape we rely on for the fallback existence check.
 */
type ServiceWorkerLike = {
	clients?: {
		matchAll(options: {
			includeUncontrolled: boolean;
			type: "window";
		}): Promise<ReadonlyArray<{ url: string }>>;
	};
};

/**
 * Determines whether an offscreen document for the given URL already exists.
 * Prefers the modern `chrome.runtime.getContexts` API and falls back to the
 * service-worker `clients` API on older Chrome builds.
 *
 * @param offscreenUrl - The fully-qualified URL of the offscreen document.
 * @returns A promise resolving to `true` if an offscreen document already exists.
 */
async function offscreenDocumentExists(offscreenUrl: string): Promise<boolean> {
	// Modern API (Chrome 116+): query existing extension contexts directly.
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

	// Fallback for older Chrome: inspect open window clients.
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

/**
 * Ensures the offscreen document is created and active. Safe to call repeatedly:
 * concurrent callers share a single creation promise, and an already-open document
 * short-circuits immediately. If Chrome silently tore the document down, the next
 * call transparently recreates it.
 *
 * @returns A promise that resolves once the offscreen document is guaranteed to exist.
 */
async function setupOffscreenDocument(): Promise<void> {
	const offscreenUrl = chrome.runtime.getURL("offscreen.html");

	if (await offscreenDocumentExists(offscreenUrl)) {
		return;
	}

	// Another caller is already creating the document — await the same promise.
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
			// Chrome throws if a document already exists (race between existence check
			// and creation). Treat that specific case as success; rethrow anything else.
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

/**
 * Maximum time to wait for the offscreen document to return an embedding before
 * giving up. The first call also triggers a one-time model download/warm-up, so the
 * window is generous; subsequent calls resolve in tens of milliseconds.
 */
const EMBEDDING_TIMEOUT_MS = 60_000;

/** Shape of the response returned by the offscreen embedding handler. */
type OffscreenEmbeddingResponse = {
	embedding?: number[];
	error?: string;
};

/**
 * Delegate embedding generation to the Offscreen Document. This keeps the heavy WASM
 * module execution and `window` dependencies out of the service worker, which is not
 * allowed to evaluate WebAssembly with a DOM context under Manifest V3.
 *
 * @param text - The text to embed. Truncated to 200 characters to bound model latency.
 * @returns A promise resolving to the 384-dimensional embedding as a `number[]`.
 * @throws If the offscreen document errors, returns no embedding, or times out.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
	const truncated = text.slice(0, 200);
	const startTime = Date.now();
	console.log(
		`[embedding-pipeline] Requesting embedding from offscreen for: "${truncated.substring(0, 30)}..."`,
	);

	await setupOffscreenDocument();

	return new Promise<number[]>((resolve, reject) => {
		let settled = false;

		// Watchdog: if the offscreen document was torn down mid-flight the callback may
		// never fire, which would otherwise leave the caller hanging forever.
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
