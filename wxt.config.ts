import { defineConfig } from "wxt";
import { onnxBundlePlugin } from "./plugins/vite-plugin-onnx-bundle";

// See https://wxt.dev/api/config.html
export default defineConfig({
	srcDir: "src",
	modules: ["@wxt-dev/module-react"],
	manifest: {
		name: "VectorTrace",
		description: "Point-and-click web scraper with semantic change detection",
		permissions: ["activeTab", "storage", "scripting", "tabs"],
		host_permissions: ["<all_urls>"],
		web_accessible_resources: [
			{
				resources: ["transformers/*"],
				matches: ["<all_urls>"],
			},
		],
	},
	vite: () => ({
		plugins: [onnxBundlePlugin()],
	}),
});
