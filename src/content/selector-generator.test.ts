// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { generateCSSSelector, generateXPath } from "./selector-generator";

describe("Selector Generator", () => {
	it("should generate CSS selector for element with unique ID", () => {
		const div = document.createElement("div");
		div.id = "unique-id-123";
		document.body.appendChild(div);

		const selector = generateCSSSelector(div);
		expect(selector).toBe("#unique-id-123");
		expect(document.querySelector(selector as string)).toBe(div);

		document.body.removeChild(div);
	});

	it("should generate CSS selector for element with unique data attribute", () => {
		const div = document.createElement("div");
		div.setAttribute("data-testid", "submit-btn");
		document.body.appendChild(div);

		const selector = generateCSSSelector(div);
		expect(selector).toBe('div[data-testid="submit-btn"]');
		expect(document.querySelector(selector as string)).toBe(div);

		document.body.removeChild(div);
	});

	it("should generate sibling-aware child-combinator CSS selector path", () => {
		const container = document.createElement("div");
		container.id = "main-container";

		const p1 = document.createElement("p");
		const p2 = document.createElement("p"); // Target
		const span = document.createElement("span");
		p2.appendChild(span);

		container.appendChild(p1);
		container.appendChild(p2);
		document.body.appendChild(container);

		const selector = generateCSSSelector(span);
		expect(selector).toBe("#main-container > p:nth-of-type(2) > span");
		expect(document.querySelector(selector as string)).toBe(span);

		document.body.removeChild(container);
	});

	it("should generate XPath for element correctly", () => {
		const container = document.createElement("div");
		const p1 = document.createElement("p");
		const p2 = document.createElement("p"); // Target

		container.appendChild(p1);
		container.appendChild(p2);
		document.body.appendChild(container);

		const xpath = generateXPath(p2);
		// Prepend /html/body/ since container is in body
		expect(xpath).toContain("/html/body/div");
		expect(xpath).toContain("/p[2]");

		const evaluator = document.evaluate(
			xpath as string,
			document,
			null,
			XPathResult.FIRST_ORDERED_NODE_TYPE,
			null,
		);
		expect(evaluator.singleNodeValue).toBe(p2);

		document.body.removeChild(container);
	});

	it("should preserve case sensitivity for SVG elements", () => {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
		svg.appendChild(clipPath);
		document.body.appendChild(svg);

		const cssSelector = generateCSSSelector(clipPath);
		// SVG tagName (clipPath) should retain its exact case, not lowercased to clippath
		expect(cssSelector).toContain("clipPath");

		const xpath = generateXPath(clipPath);
		expect(xpath).toContain("clipPath");

		document.body.removeChild(svg);
	});
});
