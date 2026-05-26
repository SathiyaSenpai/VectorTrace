import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Vite plugin to copy ONNX WebAssembly files from node_modules/onnxruntime-web/dist/
 * to the build output directory so they are bundled with the extension.
 */
export function onnxBundlePlugin(): Plugin {
	let outDir = "";

	return {
		name: "vite-plugin-onnx-bundle",
		configResolved(config) {
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
				if (file.endsWith(".wasm")) {
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
