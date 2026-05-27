import { generateCSSSelector, generateXPath } from "./selector-generator";

/**
 * Utility function to wait for a CSS selector to appear in the DOM.
 */
function waitForElement(selector: string, timeout = 1000): Promise<Element | null> {
	return new Promise((resolve) => {
		const el = document.querySelector(selector);
		if (el) return resolve(el);

		const observer = new MutationObserver(() => {
			const elMutated = document.querySelector(selector);
			if (elMutated) {
				observer.disconnect();
				clearTimeout(timer);
				resolve(elMutated);
			}
		});

		observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

		const timer = setTimeout(() => {
			observer.disconnect();
			resolve(null);
		}, timeout);
	});
}

/**
 * Utility function to wait for an XPath selector to appear in the DOM.
 */
function waitForXpath(xpath: string, timeout = 1000): Promise<Element | null> {
	return new Promise((resolve) => {
		const evaluate = () => {
			try {
				const xPathResult = document.evaluate(
					xpath,
					document,
					null,
					XPathResult.FIRST_ORDERED_NODE_TYPE,
					null,
				);
				return xPathResult.singleNodeValue as Element | null;
			} catch {
				return null;
			}
		};

		const el = evaluate();
		if (el) return resolve(el);

		const observer = new MutationObserver(() => {
			const elMutated = evaluate();
			if (elMutated) {
				observer.disconnect();
				clearTimeout(timer);
				resolve(elMutated);
			}
		});

		observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

		const timer = setTimeout(() => {
			observer.disconnect();
			resolve(null);
		}, timeout);
	});
}

/**
 * Extracts the values of the defined fields from the current page.
 * Evaluates CSS selectors first, falling back to XPath selectors if not found.
 * Supports asynchronous wait for selectors using MutationObservers.
 *
 * @param fields - Array of fields to extract, each containing CSS and XPath selectors.
 * @returns Array of extracted field values with their status.
 */
export async function extractFields(
	fields: { fieldId: string; label: string; cssSelector: string; xpathSelector: string }[],
): Promise<{ fieldId: string; label: string; value: string; status: "OK" | "SELECTOR_BROKEN" }[]> {
	return Promise.all(
		fields.map(async (field) => {
			let element: Element | null = null;

			if (field.cssSelector) {
				try {
					element = await waitForElement(field.cssSelector, 1000);
				} catch (err) {
					console.error(`Invalid CSS selector for field "${field.label || field.fieldId}":`, err);
				}
			}

			if (!element && field.xpathSelector) {
				try {
					element = await waitForXpath(field.xpathSelector, 1000);
				} catch (err) {
					console.error(`Invalid XPath selector for field "${field.label || field.fieldId}":`, err);
				}
			}

			if (element) {
				return {
					fieldId: field.fieldId,
					label: field.label,
					value: element.textContent?.trim() || "",
					status: "OK" as const,
				};
			}
			return {
				fieldId: field.fieldId,
				label: field.label,
				value: "",
				status: "SELECTOR_BROKEN" as const,
			};
		}),
	);
}

/**
 * Enumerates elements in the current page to retrieve candidates for semantic replacement.
 * Uses TreeWalker to collect non-empty text nodes from visible HTML elements.
 *
 * @returns Array of deduplicated, trimmed text nodes with CSS/XPath selectors, limited to top 500.
 */
export function enumeratePageElements(): {
	text: string;
	cssSelector: string;
	xpathSelector: string;
}[] {
	if (!document.body) return [];

	const candidates: { text: string; element: HTMLElement }[] = [];

	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
		acceptNode(node) {
			const el = node as HTMLElement;
			const tag = el.tagName.toLowerCase();
			if (["script", "style", "noscript", "meta", "head"].includes(tag)) {
				return NodeFilter.FILTER_REJECT;
			}
			if (el.hasAttribute("data-vectortrace")) {
				return NodeFilter.FILTER_REJECT;
			}
			return NodeFilter.FILTER_ACCEPT;
		},
	});

	let node = walker.nextNode();
	while (node) {
		const el = node as HTMLElement;
		const text = el.textContent?.trim() || "";
		// Skip empty text or text shorter than 2 characters
		if (text.length >= 2) {
			candidates.push({ text, element: el });
		}
		node = walker.nextNode();
	}

	// Deduplicate by textContent (keep first occurrence)
	const seenTexts = new Set<string>();
	const uniqueCandidates: { text: string; element: HTMLElement }[] = [];
	for (const candidate of candidates) {
		if (!seenTexts.has(candidate.text)) {
			seenTexts.add(candidate.text);
			uniqueCandidates.push(candidate);
		}
	}

	// Sort by textContent length descending
	uniqueCandidates.sort((a, b) => b.text.length - a.text.length);

	// Take top 500 candidates
	const topCandidates = uniqueCandidates.slice(0, 500);

	// Generate CSS & XPath selectors
	const results: { text: string; cssSelector: string; xpathSelector: string }[] = [];
	for (const candidate of topCandidates) {
		const cssSelector = generateCSSSelector(candidate.element) || "";
		const xpathSelector = generateXPath(candidate.element) || "";
		results.push({
			text: candidate.text,
			cssSelector,
			xpathSelector,
		});
	}

	return results;
}
