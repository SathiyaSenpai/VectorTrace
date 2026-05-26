export default defineContentScript({
	matches: ["<all_urls>"],
	main() {
		console.log("VectorTrace content loaded");
	},
});
