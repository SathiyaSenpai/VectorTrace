// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { enumeratePageElements, extractFields } from "./text-extractor";

/**
 * These tests simulate the real example.com DOM structure and the exact
 * user-reported bug scenarios. The key principle being tested:
 *
 *   "Only flag elements that are ACTUALLY broken.
 *    If the element is still on the page with the same content,
 *    it must show OK — even if a positional selector drifted."
 */
describe("text-extractor engine", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	// ─────────────────────────────────────────────────────
	//  Core extraction — basic happy paths
	// ─────────────────────────────────────────────────────

	describe("extractFields — basic", () => {
		it("should extract field using CSS selector", async () => {
			document.body.innerHTML = `<h1 class="title">Hello World! This is a longer string to avoid empty page.</h1>`;
			const results = await extractFields([
				{
					fieldId: "f1",
					label: "Heading",
					cssSelector: ".title",
					xpathSelector: "//h1",
					textContent: "Hello World! This is a longer string to avoid empty page.",
					tagName: "h1",
				},
			]);
			expect(results).toHaveLength(1);
			expect(results[0].status).toBe("OK");
			expect(results[0].value).toBe("Hello World! This is a longer string to avoid empty page.");
		});

		it("should fall back to XPath if CSS selector returns null", async () => {
			document.body.innerHTML = `<div><span id="price">19.99 is the price of this very long item to avoid empty page</span></div>`;
			const results = await extractFields([
				{
					fieldId: "f2",
					label: "Price",
					cssSelector: ".non-existent",
					xpathSelector: "//span[@id='price']",
					textContent: "19.99 is the price of this very long item to avoid empty page",
					tagName: "span",
				},
			]);
			expect(results[0].status).toBe("OK");
		});

		it("should return SELECTOR_BROKEN if element is truly gone from the page", async () => {
			document.body.innerHTML = `<div>some content that is sufficiently long enough to avoid being treated as an empty page</div>`;
			const results = await extractFields([
				{
					fieldId: "f3",
					label: "Broken",
					cssSelector: ".missing",
					xpathSelector: "//span[@class='missing']",
					textContent: "This text does not exist anywhere on this page at all",
					tagName: "span",
				},
			]);
			expect(results[0].status).toBe("SELECTOR_BROKEN");
		});

		it("should handle invalid/malformed selectors gracefully", async () => {
			document.body.innerHTML = `<div>content that is sufficiently long enough to avoid being treated as an empty page</div>`;
			const results = await extractFields([
				{
					fieldId: "f4",
					label: "Malformed",
					cssSelector: "invalid:::selector",
					xpathSelector: "///invalid/xpath",
					textContent: "Text that absolutely does not exist on this page whatsoever",
					tagName: "div",
				},
			]);
			expect(results[0].status).toBe("SELECTOR_BROKEN");
		});

		it("should return EMPTY_PAGE when document has no meaningful text", async () => {
			document.body.innerHTML = "";
			const results = await extractFields([
				{
					fieldId: "f5",
					label: "Anything",
					cssSelector: ".whatever",
					xpathSelector: "//div",
					textContent: "Some stored content",
					tagName: "div",
				},
			]);
			expect(results[0].status).toBe("EMPTY_PAGE");
		});

		it("should work with empty tagName for backward compatibility", async () => {
			document.body.innerHTML = `<h1 class="title">Hello World! This is a longer string to avoid empty page.</h1>`;
			const results = await extractFields([
				{
					fieldId: "f6",
					label: "Legacy",
					cssSelector: ".title",
					xpathSelector: "//h1",
					textContent: "Hello World! This is a longer string to avoid empty page.",
					tagName: "",
				},
			]);
			expect(results[0].status).toBe("OK");
		});
	});

	// ─────────────────────────────────────────────────────
	//  Bug #1: Change <h1> to <p> → only the changed one should error
	// ─────────────────────────────────────────────────────

	describe("Bug #1 — h1 tag changed to p", () => {
		it("should NOT flag untouched <p> elements when <h1> becomes <p>", async () => {
			// BEFORE: <h1>Example Domain</h1> <p>Long para 1...</p> <p>More info...</p>
			// User selected all 3 and stored them.
			// AFTER: Someone changed the <h1> to <p> in the DOM.
			// Now there are 3 <p> elements. The nth-of-type indices shifted.
			document.body.innerHTML = `
				<div>
					<p>Example Domain</p>
					<p>This domain is for use in illustrative examples in documents. You may use this domain in literature without prior coordination or asking for permission.</p>
					<p>More information about this domain can be found at the IANA website.</p>
				</div>
			`;

			const results = await extractFields([
				{
					fieldId: "heading",
					label: "Heading",
					// This selector will fail because there's no <h1> anymore
					cssSelector: "body > div > h1",
					xpathSelector: "/html/body/div/h1",
					textContent: "Example Domain",
					tagName: "h1",
				},
				{
					fieldId: "para1",
					label: "Description",
					// This was p:nth-of-type(1) which NOW points to "Example Domain" (wrong!)
					cssSelector: "body > div > p:nth-of-type(1)",
					xpathSelector: "/html/body/div/p[1]",
					textContent: "This domain is for use in illustrative examples in documents. You may use this domain in literature without prior coordination or asking for permission.",
					tagName: "p",
				},
				{
					fieldId: "para2",
					label: "More Info",
					// This was p:nth-of-type(2) which NOW points to the old p1 text (wrong!)
					cssSelector: "body > div > p:nth-of-type(2)",
					xpathSelector: "/html/body/div/p[2]",
					textContent: "More information about this domain can be found at the IANA website.",
					tagName: "p",
				},
			]);

			const heading = results.find((r) => r.fieldId === "heading")!;
			const para1 = results.find((r) => r.fieldId === "para1")!;
			const para2 = results.find((r) => r.fieldId === "para2")!;

			// The <h1> selector is broken AND the text "Example Domain" exists as a <p>
			// not as <h1> → the h1 element is genuinely gone
			expect(heading.status).not.toBe("OK");

			// para1 & para2: their selectors shifted, but the PAGE SEARCH should find
			// the original elements still on the page → OK
			expect(para1.status).toBe("OK");
			expect(para2.status).toBe("OK");
		});
	});

	// ─────────────────────────────────────────────────────
	//  Bug #2: Change <p> to <h1> → only the changed one should error
	// ─────────────────────────────────────────────────────

	describe("Bug #2 — p tag changed to h1", () => {
		it("should NOT flag untouched elements when one <p> becomes <h1>", async () => {
			// BEFORE: <h1>Example Domain</h1> <p>Long para...</p> <p>More info...</p>
			// User selected all 3.
			// AFTER: The first <p> was changed to <h1>.
			document.body.innerHTML = `
				<div>
					<h1>Example Domain</h1>
					<h1>This domain is for use in illustrative examples in documents. You may use this domain in literature without prior coordination or asking for permission.</h1>
					<p>More information about this domain can be found at the IANA website.</p>
				</div>
			`;

			const results = await extractFields([
				{
					fieldId: "heading",
					label: "Heading",
					cssSelector: "body > div > h1",
					xpathSelector: "/html/body/div/h1",
					textContent: "Example Domain",
					tagName: "h1",
				},
				{
					fieldId: "para1",
					label: "Description",
					// Original selector was p:nth-of-type(1), but this element is now <h1>
					cssSelector: "body > div > p:nth-of-type(1)",
					xpathSelector: "/html/body/div/p[1]",
					textContent: "This domain is for use in illustrative examples in documents. You may use this domain in literature without prior coordination or asking for permission.",
					tagName: "p",
				},
				{
					fieldId: "para2",
					label: "More Info",
					// Original p:nth-of-type(2) — only 1 <p> left, so this might resolve wrong or not at all
					cssSelector: "body > div > p:nth-of-type(2)",
					xpathSelector: "/html/body/div/p[2]",
					textContent: "More information about this domain can be found at the IANA website.",
					tagName: "p",
				},
			]);

			const heading = results.find((r) => r.fieldId === "heading")!;
			const para1 = results.find((r) => r.fieldId === "para1")!;
			const para2 = results.find((r) => r.fieldId === "para2")!;

			// heading: <h1> still exists with same text → OK
			expect(heading.status).toBe("OK");

			// para1: was <p>, now <h1>. The original <p> with this text is GONE.
			// Page search for <p> + this text → not found → should error
			expect(para1.status).not.toBe("OK");

			// para2: "More information..." is still a <p> on the page → OK
			expect(para2.status).toBe("OK");
		});
	});

	// ─────────────────────────────────────────────────────
	//  Bug #3: Text changes with numbers
	// ─────────────────────────────────────────────────────

	describe("Bug #3 — text content changes", () => {
		it("should detect genuinely different text as TEXT_CONTENT_CHANGED", async () => {
			document.body.innerHTML = `
				<div>
					<h1 class="title">Completely different headline that was not the original content at all</h1>
					<p>Filler text to avoid empty page detection in the extraction engine.</p>
				</div>
			`;

			const results = await extractFields([
				{
					fieldId: "h1-field",
					label: "Heading",
					cssSelector: ".title",
					xpathSelector: "//h1",
					textContent: "The original captured headline from definition time long ago",
					tagName: "h1",
				},
			]);

			expect(results[0].status).toBe("TEXT_CONTENT_CHANGED");
		});

		it("should detect element text becoming empty as TEXT_CONTENT_CHANGED", async () => {
			document.body.innerHTML = `<div><span class="price"></span> lots of surrounding text to keep the page non-empty for the detector</div>`;
			const results = await extractFields([
				{
					fieldId: "price",
					label: "Price",
					cssSelector: ".price",
					xpathSelector: "//span[@class='price']",
					textContent: "$19.99 was the originally captured price value and description",
					tagName: "span",
				},
			]);
			expect(results[0].status).toBe("TEXT_CONTENT_CHANGED");
		});
	});

	// ─────────────────────────────────────────────────────
	//  TAG_CHANGED detection
	// ─────────────────────────────────────────────────────

	describe("TAG_CHANGED — structural drift", () => {
		it("should return TAG_CHANGED when selector resolves to different tag and original is gone", async () => {
			// The .item selector finds a <span>, but we stored <p>
			// AND there's no <p> with this text on the page
			document.body.innerHTML = `
				<div>
					<span class="item">Some text content that is long enough for the page to not be considered empty</span>
				</div>
			`;
			const results = await extractFields([
				{
					fieldId: "tag-drift",
					label: "Item",
					cssSelector: ".item",
					xpathSelector: "//span[@class='item']",
					textContent: "Some text content that is long enough for the page to not be considered empty",
					tagName: "p", // Stored as <p> but the element is actually <span>
				},
			]);
			expect(results[0].status).toBe("TAG_CHANGED");
		});
	});

	// ─────────────────────────────────────────────────────
	//  Page search fallback — selector broken but element exists
	// ─────────────────────────────────────────────────────

	describe("Page search fallback", () => {
		it("should return OK when selector is broken but element still exists on page", async () => {
			// The selector is completely wrong, but the element with matching
			// tag + text is still present on the page
			document.body.innerHTML = `
				<div>
					<h2>Product Title That Is Quite Long Enough To Pass All Checks</h2>
					<p>Some description text that is long enough to not trigger empty page detection.</p>
				</div>
			`;
			const results = await extractFields([
				{
					fieldId: "title",
					label: "Title",
					cssSelector: ".nonexistent-class",
					xpathSelector: "//div[@class='nonexistent']",
					textContent: "Product Title That Is Quite Long Enough To Pass All Checks",
					tagName: "h2",
				},
			]);
			expect(results[0].status).toBe("OK");
			expect(results[0].value).toBe("Product Title That Is Quite Long Enough To Pass All Checks");
		});

		it("should return SELECTOR_BROKEN when element is truly gone from the page", async () => {
			document.body.innerHTML = `
				<div>
					<p>Some completely unrelated text that is long enough to avoid empty page detection.</p>
				</div>
			`;
			const results = await extractFields([
				{
					fieldId: "gone",
					label: "Gone",
					cssSelector: ".nonexistent",
					xpathSelector: "//h2",
					textContent: "This text definitely does not appear anywhere on this page at all",
					tagName: "h2",
				},
			]);
			expect(results[0].status).toBe("SELECTOR_BROKEN");
		});

		it("should handle selector pointing to wrong element by finding correct one via page search", async () => {
			// Selector p:nth-of-type(1) points to "Alpha" but we stored "Beta".
			// "Beta" still exists as a <p> on the page → OK
			document.body.innerHTML = `
				<div>
					<p>Alpha text which is long enough to distinguish from the beta paragraph content</p>
					<p>Beta text which is the content we originally stored for this field definition</p>
				</div>
			`;
			const results = await extractFields([
				{
					fieldId: "beta",
					label: "Beta",
					// Selector points to the first <p> ("Alpha"), not our element
					cssSelector: "body > div > p:nth-of-type(1)",
					xpathSelector: "/html/body/div/p[1]",
					textContent: "Beta text which is the content we originally stored for this field definition",
					tagName: "p",
				},
			]);
			// Page search finds "Beta" in a <p> → OK
			expect(results[0].status).toBe("OK");
			expect(results[0].value).toContain("Beta");
		});
	});

	// ─────────────────────────────────────────────────────
	//  Edge cases
	// ─────────────────────────────────────────────────────

	describe("Edge cases", () => {
		it("should handle multiple fields with shifted selectors independently", async () => {
			// 5 paragraph elements. The first was removed. Selectors shift for the rest.
			document.body.innerHTML = `
				<div>
					<p>BRAVO element content uniquely identified by this specific bravo string</p>
					<p>CHARLIE element content uniquely identified by this specific charlie string</p>
					<p>DELTA element content uniquely identified by this specific delta string</p>
					<p>ECHO element content uniquely identified by this specific echo string</p>
				</div>
			`;
			const results = await extractFields([
				{
					fieldId: "p1",
					label: "Para 1",
					cssSelector: "body > div > p:nth-of-type(1)",
					xpathSelector: "/html/body/div/p[1]",
					textContent: "ALPHA element content uniquely identified by this specific alpha string",
					tagName: "p",
				},
				{
					fieldId: "p2",
					label: "Para 2",
					cssSelector: "body > div > p:nth-of-type(2)",
					xpathSelector: "/html/body/div/p[2]",
					textContent: "BRAVO element content uniquely identified by this specific bravo string",
					tagName: "p",
				},
				{
					fieldId: "p3",
					label: "Para 3",
					cssSelector: "body > div > p:nth-of-type(3)",
					xpathSelector: "/html/body/div/p[3]",
					textContent: "CHARLIE element content uniquely identified by this specific charlie string",
					tagName: "p",
				},
			]);

			const p1 = results.find((r) => r.fieldId === "p1")!;
			const p2 = results.find((r) => r.fieldId === "p2")!;
			const p3 = results.find((r) => r.fieldId === "p3")!;

			// p1: Text "ALPHA..." is gone from the page → error
			expect(p1.status).not.toBe("OK");

			// p2 & p3: Their text still exists on the page → OK
			expect(p2.status).toBe("OK");
			expect(p3.status).toBe("OK");
		});

		it("should handle whitespace-only differences as OK", async () => {
			document.body.innerHTML = `
				<div>
					<p class="desc">Hello   World   with   extra    spaces   and   padding   text</p>
					<p>Filler to avoid empty page detection in the extraction engine test.</p>
				</div>
			`;
			const results = await extractFields([
				{
					fieldId: "ws",
					label: "WS",
					cssSelector: ".desc",
					xpathSelector: "//p[@class='desc']",
					textContent: "Hello World with extra spaces and padding text",
					tagName: "p",
				},
			]);
			expect(results[0].status).toBe("OK");
		});
	});

	// ─────────────────────────────────────────────────────
	//  enumeratePageElements
	// ─────────────────────────────────────────────────────

	describe("enumeratePageElements", () => {
		it("should collect visible elements excluding scripts, styles, and vectortrace overlays", () => {
			document.body.innerHTML = `
				<div class="card">
					<h2>Card Title</h2>
					<p>Some description text here.</p>
					<span>a</span>
					<script>console.log('exclude me')</script>
					<style>.exclude { color: red; }</style>
					<div data-vectortrace="overlay">picker overlay</div>
				</div>
			`;

			const elements = enumeratePageElements();
			const texts = elements.map((e) => e.text);

			expect(texts).toContain("Card Title");
			expect(texts).toContain("Some description text here.");
			expect(texts).not.toContain("a");
			expect(texts).not.toContain("console.log('exclude me')");
			expect(texts).not.toContain("picker overlay");
		});

		it("should sort by text length ascending", () => {
			document.body.innerHTML = `
				<p>Three</p>
				<p>Seventeen</p>
				<p>Thirty-three</p>
			`;

			const elements = enumeratePageElements();
			const texts = elements.map((e) => e.text);
			const filtered = texts.filter((t) => ["Three", "Seventeen", "Thirty-three"].includes(t));
			expect(filtered).toEqual(["Three", "Seventeen", "Thirty-three"]);
		});

		it("should skip invisible elements", () => {
			document.body.innerHTML = `
				<p style="display: none;">Invisible Display</p>
				<p style="visibility: hidden;">Invisible Visibility</p>
				<p style="opacity: 0;">Invisible Opacity</p>
				<p>Visible Element</p>
			`;

			const elements = enumeratePageElements();
			const texts = elements.map((e) => e.text);

			expect(texts).toContain("Visible Element");
			expect(texts).not.toContain("Invisible Display");
			expect(texts).not.toContain("Invisible Visibility");
			expect(texts).not.toContain("Invisible Opacity");
		});

		it("should include tagName for each enumerated element", () => {
			document.body.innerHTML = `
				<h1>Main Heading</h1>
				<p>A paragraph element</p>
				<span>A span element</span>
			`;

			const elements = enumeratePageElements();
			const h1 = elements.find((e) => e.text === "Main Heading");
			const p = elements.find((e) => e.text === "A paragraph element");
			const span = elements.find((e) => e.text === "A span element");

			expect(h1?.tagName).toBe("h1");
			expect(p?.tagName).toBe("p");
			expect(span?.tagName).toBe("span");
		});
	});
});
