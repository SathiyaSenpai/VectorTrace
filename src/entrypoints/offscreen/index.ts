import { env, type FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";

// Configure Transformers.js to load ONNX WASM from local extension files.
if (env.backends?.onnx) {
	env.backends.onnx.wasm = env.backends.onnx.wasm || {};
	env.backends.onnx.wasm.wasmPaths = {
		wasm: chrome.runtime.getURL("transformers/ort-wasm-simd-threaded.wasm"),
		mjs: chrome.runtime.getURL("transformers/ort-wasm-simd-threaded.mjs"),
	};
	// We can use proxy and multithreading because we are inside a normal page context!
	env.backends.onnx.wasm.proxy = true;
}

// Disable remote model loading — we want it to download once and cache.
env.allowLocalModels = false;

let embeddingPipeline: FeatureExtractionPipeline | null = null;
let initPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
	if (embeddingPipeline) return embeddingPipeline;
	if (initPromise) return initPromise;

	initPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
		dtype: "q8",
		device: "wasm",
	});

	embeddingPipeline = await initPromise;
	initPromise = null;
	return embeddingPipeline;
}

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "OFFSCREEN_GENERATE_EMBEDDING") {
		(async () => {
			try {
				const startTime = Date.now();
				const pipe = await getEmbeddingPipeline();
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
