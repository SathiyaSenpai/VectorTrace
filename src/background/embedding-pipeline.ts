import { env, type FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";

// Configure Transformers.js to load ONNX WASM from local extension files.
if (env.backends?.onnx?.wasm) {
	env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("transformers/");
	// Disable proxying to web workers and force single-threaded execution to prevent ServiceWorkerGlobalScope dynamic import() errors.
	env.backends.onnx.wasm.proxy = false;
	env.backends.onnx.wasm.numThreads = 1;
}

// Disable remote model loading — we want it to download once and cache.
env.allowLocalModels = false;

let embeddingPipeline: FeatureExtractionPipeline | null = null;
let initPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Lazy-initializes the embedding pipeline.
 * CRITICAL: Must be called in every message handler because
 * MV3 service workers can be suspended at any time, destroying
 * the pipeline instance.
 */
export async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
	if (embeddingPipeline) return embeddingPipeline;

	// Prevent multiple parallel initializations
	if (initPromise) return initPromise;

	initPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
		dtype: "q8", // quantized for smaller size
		device: "wasm",
	});

	embeddingPipeline = await initPromise;
	initPromise = null;
	return embeddingPipeline;
}

/**
 * Generate a 384-dimensional embedding for the given text.
 * Returns a regular number[] array (not Float32Array) for JSON serialization.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
	const startTime = Date.now();
	console.log(`[embedding-pipeline] Generating embedding for text: "${text.substring(0, 30)}..."`);
	const pipe = await getEmbeddingPipeline();
	const output = await pipe(text, { pooling: "mean", normalize: true });
	const duration = Date.now() - startTime;
	console.log(`[embedding-pipeline] Embedding generated in ${duration}ms`);
	return Array.from(output.data as Float32Array);
}
