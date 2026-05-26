import { defineConfig } from "wxt";
import { onnxBundlePlugin } from "./plugins/vite-plugin-onnx-bundle";

// See https://wxt.dev/api/config.html
export default defineConfig({
	srcDir: "src",
	modules: ["@wxt-dev/module-react"],
	manifest: {
		name: "VectorTrace",
		description: "Point-and-click web scraper with semantic change detection",
		permissions: ["activeTab", "storage", "scripting", "tabs", "offscreen"],
		host_permissions: ["<all_urls>"],
		web_accessible_resources: [
			{
				resources: ["transformers/*"],
				matches: ["<all_urls>"],
			},
		],
		content_security_policy: {
			extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https://huggingface.co https://cdn-lfs.huggingface.co https://*.huggingface.co https://*.hf.co https://*.amazonaws.com https://*.cloudfront.net;",
		},
	},
	vite: () => ({
		plugins: [onnxBundlePlugin()],
	}),
});
