import { describe, expect, it } from "vitest";
import { matchUrl, normalizeUrl } from "./url-matcher";

describe("url-matcher", () => {
	it("should normalize urls correctly", () => {
		expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
		expect(normalizeUrl("https://example.com/news?p=2")).toBe("https://example.com/news");
		expect(normalizeUrl("HTTPS://EXAMPLE.COM/NEWS/")).toBe("https://example.com/news");
	});

	it("should match exact or normalized URLs", () => {
		expect(
			matchUrl("https://news.ycombinator.com/", undefined, "https://news.ycombinator.com"),
		).toBe(true);
		expect(
			matchUrl(
				"https://news.ycombinator.com/news?p=2",
				undefined,
				"https://news.ycombinator.com/news",
			),
		).toBe(true);
		expect(
			matchUrl("https://news.ycombinator.com/", undefined, "https://news.ycombinator.com/news"),
		).toBe(false);
	});

	it("should match simple glob patterns with wildcards", () => {
		expect(
			matchUrl(
				"https://example.com",
				"https://*.ycombinator.com/*",
				"https://news.ycombinator.com/news?p=2",
			),
		).toBe(true);
		expect(
			matchUrl(
				"https://example.com",
				"https://example.com/posts/*",
				"https://example.com/posts/123",
			),
		).toBe(true);
		expect(
			matchUrl("https://example.com", "https://example.com/posts/*", "https://example.com/news"),
		).toBe(false);
	});
});
