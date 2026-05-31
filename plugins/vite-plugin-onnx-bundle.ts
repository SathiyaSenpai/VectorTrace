import fs from "node:fs";
import path from "node:path";

/**
 * Minimal structural type describing the resolved Vite config we read inside the
 * plugin. We avoid importing the full `Plugin`/`ResolvedConfig` types from `vite`
 * because `vite` is only a transitive dependency of WXT (not a direct dependency),
 * so its type declarations are not resolvable from the project root tsconfig.
 * This structural shape is enough for the single field we consume.
 */
type ResolvedViteConfigLike = {
	build: {
		outDir: string;
	};
};

/**
 * Minimal structural type describing the Vite plugin object we return.
 * WXT's `vite()` config accepts any object matching the Vite plugin contract,
 * so a structural type keeps us type-safe without the heavyweight `vite` import.
 */
type ViteBundlePlugin = {
	name: string;
	configResolved(config: ResolvedViteConfigLike): void;
	closeBundle(): Promise<void>;
};

/**
 * Vite plugin to copy ONNX WebAssembly files from node_modules/onnxruntime-web/dist/
 * to the build output directory so they are bundled with the extension.
 *
 * @returns A Vite-compatible plugin object that copies `.wasm`/`.mjs` runtime files.
 */
export function onnxBundlePlugin(): ViteBundlePlugin {
	let outDir = "";

	return {
		name: "vite-plugin-onnx-bundle",
		configResolved(config: ResolvedViteConfigLike) {
			outDir = config.build.outDir;
		},
		async closeBundle() {
			if (!outDir) {
				console.error("[onnx-bundle-plugin] build output directory is not resolved.");
				return;
			}

			const targetDir = path.resolve(outDir, "transformers");
			const srcDir = path.resolve(process.cwd(), "node_modules/onnxruntime-web/dist");

			if (!fs.existsSync(srcDir)) {
				console.error(`[onnx-bundle-plugin] Source directory not found: ${srcDir}`);
				return;
			}

			if (!fs.existsSync(targetDir)) {
				fs.mkdirSync(targetDir, { recursive: true });
			}

			const files = fs.readdirSync(srcDir);
			let copiedCount = 0;

			for (const file of files) {
				if (file.endsWith(".wasm") || file.endsWith(".mjs")) {
					const srcPath = path.join(srcDir, file);
					const destPath = path.join(targetDir, file);
					await fs.promises.copyFile(srcPath, destPath);
					console.log(`[onnx-bundle-plugin] Copied ${file} to ${destPath}`);
					copiedCount++;
				}
			}

			console.log(`[onnx-bundle-plugin] Successfully copied ${copiedCount} WASM files.`);
		},
	};
}
