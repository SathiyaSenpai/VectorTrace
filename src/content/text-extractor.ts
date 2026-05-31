import type { ExtractionStatus } from "../shared/types";
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
 * Checks whether `document.body` has meaningful text content.
 * Returns true if the page is effectively empty (e.g. blocked, loading, error page).
 */
function isPageEffectivelyEmpty(): boolean {
	if (!document.body) return true;
	// JSDOM doesn't support innerText, so fallback to textContent
	const text = (document.body.innerText || document.body.textContent)?.trim() || "";
	// A page with fewer than 20 characters of visible text is considered empty
	return text.length < 20;
}

/**
 * Checks whether an element is visually hidden.
 */
function isElementHidden(element: Element): boolean {
	const htmlEl = element as HTMLElement;
	const style = window.getComputedStyle(htmlEl);
	if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
		return true;
	}

	// JSDOM does not perform layout calculations, so offsetParent is always null.
	// We skip the offsetParent check if we are in a testing environment.
	if (window.navigator?.userAgent?.includes("jsdom")) {
		return false;
	}

	// offsetParent is null for hidden elements (except body/html)
	if (htmlEl.offsetParent === null && htmlEl.tagName !== "BODY" && htmlEl.tagName !== "HTML") {
		// Double-check with computed style — position:fixed elements also have null offsetParent
		if (style.position !== "fixed" && style.position !== "sticky") {
			return true;
		}
	}
	return false;
}

// ─────────────────────────────────────────────────────────────
//  Text normalization & matching
// ─────────────────────────────────────────────────────────────

/**
 * Normalizes a string for comparison: collapses whitespace, trims, lowercases.
 */
function normalizeText(s: string): string {
	return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Checks whether two text strings represent the same element content.
 *
 * This is used ONLY to verify that a selector-resolved element is the
 * SAME element we originally captured — it's an identity check, not a
 * content-change detector.
 *
 * INTENTIONALLY STRICT: We only accept exact normalized match, or
 * one string being a substring of the other (handles minor additions/
 * truncation). If this returns false, the extractor falls through to
 * the page search fallback which handles shifted selectors.
 *
 * Being too lenient here (e.g. Jaccard similarity) causes false matches
 * between different sentences that share common words.
 */
function isTextMatch(stored: string, extracted: string): boolean {
	if (!stored || !extracted) return !stored && !extracted;

	const a = normalizeText(stored);
	const b = normalizeText(extracted);

	// Exact normalized match
	if (a === b) return true;

	// One string fully contains the other.
	// Handles truncation, minor additions, trailing timestamps, etc.
	if (a.includes(b) || b.includes(a)) return true;

	return false;
}

// ─────────────────────────────────────────────────────────────
//  Page search — the key to eliminating false positives
// ─────────────────────────────────────────────────────────────

/**
 * Searches the live DOM for a visible element that matches the stored identity
 * (same tag name + same text content). This is the fallback when a positional
 * selector (nth-of-type) resolves to the wrong element or doesn't resolve at all.
 *
 * Returns the matching element, or null if the element truly isn't on the page.
 */
function findElementOnPage(storedText: string, storedTagName: string): Element | null {
	if (!storedText || !document.body) return null;

	const normalizedStored = normalizeText(storedText);
	const tag = storedTagName?.toLowerCase() || "";

	// If we have a tag name, search only elements of that type (fast path)
	// Otherwise fall back to scanning all elements
	const elements = tag
		? document.body.getElementsByTagName(tag)
		: document.body.querySelectorAll("*");

	for (let i = 0; i < elements.length; i++) {
		const el = elements[i];

		// Skip VectorTrace's own overlay elements
		if (el.hasAttribute("data-vectortrace")) continue;

		// Skip invisible elements
		try {
			if (isElementHidden(el)) continue;
		} catch {
			continue;
		}

		const elText = normalizeText(el.textContent?.trim() || "");
		if (!elText) continue;

		// Exact normalized text match
		if (elText === normalizedStored) return el;
	}

	return null;
}

// ─────────────────────────────────────────────────────────────
//  Extraction engine
// ─────────────────────────────────────────────────────────────

export interface ExtractFieldInput {
	fieldId: string;
	label: string;
	cssSelector: string;
	xpathSelector: string;
	textContent: string; // stored text from definition time — used for identity verification
	tagName: string; // stored HTML tag name from definition time — used for structural drift detection
}

export interface ExtractFieldResult {
	fieldId: string;
	label: string;
	value: string;
	status: ExtractionStatus;
	storedText?: string;
	healedFrom?: string;
	healedTo?: string;
}

/**
 * Extracts the values of the defined fields from the current page.
 *
 * The detection algorithm works in three phases per field:
 *
 * Phase 1 — Selector resolution
 *   Try CSS selector, fall back to XPath.
 *
 * Phase 2 — Identity verification
 *   If the selector resolved an element, verify it's the SAME element we
 *   originally captured by checking tag name + text content match.
 *   If both match → OK (the easy happy path).
 *
 * Phase 3 — Page search fallback (the key to eliminating false positives)
 *   If the selector didn't resolve, OR resolved to the WRONG element
 *   (different tag or different text), we do NOT immediately flag an error.
 *   Instead, we search the live page for a visible element with the
 *   SAME tag name AND SAME text content.
 *
 *   - If found → the element is still fine, just the positional selector
 *     drifted (e.g. nth-of-type shifted because a sibling was added/removed).
 *     Return OK with the found element's text.
 *
 *   - If NOT found → the element is truly gone/changed.
 *     Return the appropriate error status.
 */
export async function extractFields(fields: ExtractFieldInput[]): Promise<ExtractFieldResult[]> {
	const pageEmpty = isPageEffectivelyEmpty();

	return Promise.all(
		fields.map(async (field) => {
			// ── EMPTY PAGE ──
			if (pageEmpty) {
				return {
					fieldId: field.fieldId,
					label: field.label,
					value: "",
					status: "EMPTY_PAGE" as const,
				};
			}

			// ── PHASE 1: Selector resolution ──
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

			// ── PHASE 2: Identity verification ──
			if (element) {
				// Check visibility
				if (isElementHidden(element)) {
					// Before flagging hidden, check if the element still exists elsewhere visibly
					const pageMatch = findElementOnPage(field.textContent, field.tagName);
					if (pageMatch) {
						return {
							fieldId: field.fieldId,
							label: field.label,
							value: pageMatch.textContent?.trim() || "",
							status: "OK" as const,
						};
					}
					return {
						fieldId: field.fieldId,
						label: field.label,
						value: "",
						status: "ELEMENT_HIDDEN" as const,
					};
				}

				const extractedText = element.textContent?.trim() || "";
				const currentTag = element.tagName.toLowerCase();
				const storedTag = field.tagName?.toLowerCase() || "";

				// Check tag match (only if we have a stored tag)
				const tagOk = !storedTag || currentTag === storedTag;

				// Check text match (only if we have stored text)
				const textOk = !field.textContent || isTextMatch(field.textContent, extractedText);

				// ── Happy path: selector → right element ──
				if (tagOk && textOk) {
					return {
						fieldId: field.fieldId,
						label: field.label,
						value: extractedText,
						status: "OK" as const,
					};
				}

				// ── Mismatch: selector resolved to WRONG element ──
				// This is the critical path. DON'T immediately flag as broken.
				// Instead, search the page for our original element.
				const pageMatch = findElementOnPage(field.textContent, field.tagName);

				if (pageMatch) {
					// Original element still exists on the page!
					// The selector just drifted due to nth-of-type shifts or similar.
					// Return OK — the element is fine.
					return {
						fieldId: field.fieldId,
						label: field.label,
						value: pageMatch.textContent?.trim() || "",
						status: "OK" as const,
					};
				}

				// The element is truly gone. Report the specific failure.
				if (!tagOk) {
					return {
						fieldId: field.fieldId,
						label: field.label,
						value: extractedText,
						status: "TAG_CHANGED" as const,
						storedText: field.textContent,
					};
				}

				// Tag is OK but text is completely different and original not found
				return {
					fieldId: field.fieldId,
					label: field.label,
					value: extractedText,
					status: "TEXT_CONTENT_CHANGED" as const,
					storedText: field.textContent,
				};
			}

			// ── PHASE 3: Selector didn't resolve — search the page ──
			// The CSS & XPath both returned null. The element might still be on
			// the page at a different position. Search by identity before giving up.
			const pageMatch = findElementOnPage(field.textContent, field.tagName);

			if (pageMatch) {
				return {
					fieldId: field.fieldId,
					label: field.label,
					value: pageMatch.textContent?.trim() || "",
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
	tagName: string;
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
			const style = window.getComputedStyle(el);
			if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
				return NodeFilter.FILTER_REJECT;
			}
			// Skip bounding rect check in test environments where layout engine is not present
			const isTest = typeof process !== "undefined" && process.env.NODE_ENV === "test";
			if (!isTest) {
				const rect = el.getBoundingClientRect();
				if (rect.width === 0 && rect.height === 0) {
					return NodeFilter.FILTER_REJECT;
				}
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

	// Deduplicate by textContent, preferring deeper leaf nodes
	const uniqueMap = new Map<string, HTMLElement>();
	for (const candidate of candidates) {
		const existing = uniqueMap.get(candidate.text);
		if (existing) {
			// If the existing stored element is an ancestor of the current element,
			// it means the current candidate is a deeper leaf node with the exact same text.
			// We should prefer the deeper node for a more precise selector.
			if (existing.contains(candidate.element)) {
				uniqueMap.set(candidate.text, candidate.element);
			}
		} else {
			uniqueMap.set(candidate.text, candidate.element);
		}
	}

	const uniqueCandidates = Array.from(uniqueMap.entries()).map(([text, element]) => ({
		text,
		element,
	}));

	// Sort by textContent length ascending
	uniqueCandidates.sort((a, b) => a.text.length - b.text.length);

	// Take top 500 candidates
	const topCandidates = uniqueCandidates.slice(0, 500);

	// Generate CSS & XPath selectors
	const results: { text: string; cssSelector: string; xpathSelector: string; tagName: string }[] = [];
	for (const candidate of topCandidates) {
		const cssSelector = generateCSSSelector(candidate.element) || "";
		const xpathSelector = generateXPath(candidate.element) || "";
		results.push({
			text: candidate.text,
			cssSelector,
			xpathSelector,
			tagName: candidate.element.tagName.toLowerCase(),
		});
	}

	return results;
}
