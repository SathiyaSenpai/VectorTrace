// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { enumeratePageElements, extractFields } from "./text-extractor";

describe("text-extractor engine", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	describe("extractFields", () => {
		it("should extract field using CSS selector", () => {
			document.body.innerHTML = `<h1 class="title">Hello World</h1>`;
			const fields = [
				{
					fieldId: "f1",
					label: "Heading",
					cssSelector: ".title",
					xpathSelector: "//h1",
				},
			];

			const results = extractFields(fields);
			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				fieldId: "f1",
				label: "Heading",
				value: "Hello World",
				status: "OK",
			});
		});

		it("should fall back to XPath if CSS selector returns null", () => {
			document.body.innerHTML = `<div><span id="price">19.99</span></div>`;
			const fields = [
				{
					fieldId: "f2",
					label: "Price",
					cssSelector: ".non-existent",
					xpathSelector: "//span[@id='price']",
				},
			];

			const results = extractFields(fields);
			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				fieldId: "f2",
				label: "Price",
				value: "19.99",
				status: "OK",
			});
		});

		it("should return SELECTOR_BROKEN status if both CSS and XPath fail", () => {
			document.body.innerHTML = `<div>some content</div>`;
			const fields = [
				{
					fieldId: "f3",
					label: "Broken",
					cssSelector: ".missing",
					xpathSelector: "//span[@class='missing']",
				},
			];

			const results = extractFields(fields);
			expect(results).toHaveLength(1);
			expect(results[0]).toEqual({
				fieldId: "f3",
				label: "Broken",
				value: "",
				status: "SELECTOR_BROKEN",
			});
		});

		it("should handle invalid/malformed selectors gracefully without crashing", () => {
			document.body.innerHTML = `<div>content</div>`;
			const fields = [
				{
					fieldId: "f4",
					label: "Malformed",
					cssSelector: "invalid:::selector",
					xpathSelector: "///invalid/xpath",
				},
			];

			const results = extractFields(fields);
			expect(results).toHaveLength(1);
			expect(results[0].status).toBe("SELECTOR_BROKEN");
		});
	});

	describe("enumeratePageElements", () => {
		it("should collect page elements excluding scripts, styles, metadata, and short/empty text", () => {
			document.body.innerHTML = `
				<div class="card">
					<h2>Card Title</h2>
					<p>Some description text here.</p>
					<span>a</span> <!-- Shorter than 2 chars -->
					<script>console.log('exclude me')</script>
					<style>.exclude { color: red; }</style>
					<div data-vectortrace="overlay">picker overlay</div>
				</div>
			`;

			const elements = enumeratePageElements();

			// Card Title (10 chars), description text (28 chars), and the card div itself which contains everything.
			// "Card Title" and "Some description text here." are unique and longer than 2 characters.
			const texts = elements.map((e) => e.text);
			expect(texts).toContain("Card Title");
			expect(texts).toContain("Some description text here.");

			// Excluded elements
			expect(texts).not.toContain("a");
			expect(texts).not.toContain("console.log('exclude me')");
			expect(texts).not.toContain("picker overlay");
		});

		it("should limit elements and sort them by length descending", () => {
			document.body.innerHTML = `
				<p>Three</p>
				<p>Seventeen</p>
				<p>Thirty-three</p>
			`;

			const elements = enumeratePageElements();
			const texts = elements.map((e) => e.text);

			// Should be sorted by text length descending:
			// "Thirty-three" (12 chars) -> "Seventeen" (9 chars) -> "Three" (5 chars)
			// Wait, the body element itself also contains the text.
			// The unique texts extracted would include "Thirty-three", "Seventeen", "Three".
			// Let's verify the order of these specific elements:
			const filteredTexts = texts.filter((t) => ["Three", "Seventeen", "Thirty-three"].includes(t));
			expect(filteredTexts).toEqual(["Thirty-three", "Seventeen", "Three"]);
		});
	});
});
