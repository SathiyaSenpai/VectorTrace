import { env, pipeline } from "@huggingface/transformers";

// Configure Transformers.js to load ONNX WASM from local extension files.
// Use a string prefix so onnxruntime-web constructs all filenames itself.
if (env.backends?.onnx) {
	env.backends.onnx.wasm = env.backends.onnx.wasm || {};
	env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("transformers/");
	// numThreads=1 prevents ort from spawning a Worker thread (workers cannot resolve extension URLs)
	env.backends.onnx.wasm.numThreads = 1;
	// Disable proxying — we are already in a document context, no proxy needed
	env.backends.onnx.wasm.proxy = false;
}

// Disable remote model loading — we want it to download once and cache.
env.allowLocalModels = false;

// biome-ignore lint/suspicious/noExplicitAny: Registry can contain various pipeline types
const pipelines: Record<string, any> = {};
// biome-ignore lint/suspicious/noExplicitAny: Registry can contain various pipeline types
const initPromises: Record<string, Promise<any>> = {};

// biome-ignore lint/suspicious/noExplicitAny: Generic task pipeline return type
async function getPipeline(task: string, modelId: string): Promise<any> {
	const cacheKey = `${task}:${modelId}`;
	if (pipelines[cacheKey]) return pipelines[cacheKey];
	if (initPromises[cacheKey]) return initPromises[cacheKey];

	initPromises[cacheKey] = pipeline(task, modelId, {
		dtype: "q8",
		device: "wasm",
		progress_callback: (data: { status: string; progress: number }) => {
			if (data.status === "progress") {
				chrome.runtime
					.sendMessage({
						type: "MODEL_DOWNLOAD_PROGRESS",
						progress: data.progress,
					})
					.catch(() => {});
			}
		},
	});

	pipelines[cacheKey] = await initPromises[cacheKey];
	chrome.runtime
		.sendMessage({
			type: "MODEL_DOWNLOAD_COMPLETE",
		})
		.catch(() => {});
	delete initPromises[cacheKey];
	return pipelines[cacheKey];
}

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "OFFSCREEN_GENERATE_EMBEDDING") {
		(async () => {
			try {
				const startTime = Date.now();
				const pipe = await getPipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
				const output = await pipe(message.text, { pooling: "mean", normalize: true });
				const duration = Date.now() - startTime;
				console.log(`[offscreen] Embedding generated in ${duration}ms`);
				const embedding = Array.from(output.data as Float32Array);
				sendResponse({ embedding });
			} catch (error) {
				console.error("[offscreen] Error generating embedding:", error);
				sendResponse({ error: (error as Error).message });
			}
		})();
		return true; // Keep message channel open for async response
	}
});
