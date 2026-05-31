import { env, type FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";

// The single model we run. Kept as a constant so the warm-up and request handler
// always agree on the exact task/model pair (and therefore share one cached pipeline).
const EMBEDDING_TASK = "feature-extraction" as const;
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

// Configure Transformers.js to load ONNX WASM from local extension files.
// Use a string prefix so onnxruntime-web constructs all filenames itself.
// NOTE: `env.backends.onnx.wasm` is a read-only reference, so we mutate its fields
// in place rather than reassigning the whole object.
if (env.backends?.onnx?.wasm) {
	env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("transformers/");
	// numThreads=1 prevents ort from spawning a Worker thread (workers cannot resolve extension URLs)
	env.backends.onnx.wasm.numThreads = 1;
	// Disable proxying — we are already in a document context, no proxy needed
	env.backends.onnx.wasm.proxy = false;
}

// Disable remote model loading — we want it to download once and cache.
env.allowLocalModels = false;

// Cached feature-extraction pipeline and its in-flight initialization promise.
let embeddingPipeline: FeatureExtractionPipeline | null = null;
let embeddingInit: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Lazily creates (and caches) the feature-extraction pipeline. Concurrent callers
 * share the same initialization promise so the model is only loaded once.
 *
 * @returns A promise resolving to the ready-to-use feature-extraction pipeline.
 */
async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
	if (embeddingPipeline) return embeddingPipeline;
	if (embeddingInit) return embeddingInit;

	embeddingInit = pipeline(EMBEDDING_TASK, EMBEDDING_MODEL, {
		dtype: "q8",
		device: "wasm",
		progress_callback: (data: { status: string; progress?: number }) => {
			if (data.status === "progress" && typeof data.progress === "number") {
				chrome.runtime
					.sendMessage({
						type: "MODEL_DOWNLOAD_PROGRESS",
						progress: data.progress,
					})
					.catch(() => {
						// Popup may be closed — ignore.
					});
			}
		},
	}) as Promise<FeatureExtractionPipeline>;

	try {
		embeddingPipeline = await embeddingInit;
		chrome.runtime.sendMessage({ type: "MODEL_DOWNLOAD_COMPLETE" }).catch(() => {
			// Popup may be closed — ignore.
		});
		return embeddingPipeline;
	} finally {
		embeddingInit = null;
	}
}

/**
 * Generates a normalized, mean-pooled embedding for the supplied text.
 *
 * @param text - The input text to embed.
 * @returns A promise resolving to the embedding as a plain `number[]`.
 */
async function generateEmbedding(text: string): Promise<number[]> {
	const pipe = await getEmbeddingPipeline();
	const output = await pipe(text, { pooling: "mean", normalize: true });
	return Array.from(output.data as Float32Array);
}

// Listen for messages from the service worker.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "OFFSCREEN_GENERATE_EMBEDDING") {
		(async () => {
			try {
				const startTime = Date.now();
				const embedding = await generateEmbedding(message.text);
				console.log(`[offscreen] Embedding generated in ${Date.now() - startTime}ms`);
				sendResponse({ embedding });
			} catch (error) {
				console.error("[offscreen] Error generating embedding:", error);
				sendResponse({ error: (error as Error).message });
			}
		})();
		return true; // Keep message channel open for async response.
	}
	return undefined;
});

/**
 * Self-initializing warm-up.
 *
 * Chrome can recreate the offscreen document at any time (e.g. after the service
 * worker is suspended/revived, or after the document is torn down for inactivity).
 * Whenever this script runs we kick off model initialization in the background so the
 * very first real embedding request does not pay the full cold-start cost. The model
 * download/warm-up only happens once per document lifetime thanks to the cached
 * pipeline above; a failure here is non-fatal and simply means the next request
 * retries lazily.
 */
(async () => {
	try {
		console.log("[offscreen] Document initialized — warming up embedding model...");
		await getEmbeddingPipeline();
		console.log("[offscreen] Embedding model warm-up complete.");
	} catch (error) {
		console.error("[offscreen] Model warm-up failed (will retry lazily on demand):", error);
	}
})();
