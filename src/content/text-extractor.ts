import type { ExtractionStatus } from "../shared/types";
import { generateCSSSelector, generateXPath } from "./selector-generator";

export function querySelectorDeep(
	selector: string,
	root: Document | Element | ShadowRoot = document,
): Element | null {
	if (!selector.includes(">>>")) {
		try {
			return root.querySelector(selector);
		} catch {
			return null;
		}
	}
	const parts = selector.split(">>>").map((p) => p.trim());
	let current: Element | null = null;
	for (const part of parts) {
		if (!current) {
			try {
				current = root.querySelector(part);
			} catch {
				return null;
			}
		} else {
			const targetRoot = current.shadowRoot || current;
			try {
				current = targetRoot.querySelector(part);
			} catch {
				return null;
			}
		}
		if (!current) return null;
	}
	return current;
}

function waitForElement(selector: string, timeout = 1000): Promise<Element | null> {
	return new Promise((resolve) => {
		const el = querySelectorDeep(selector);
		if (el) return resolve(el);

		const observer = new MutationObserver(() => {
			const elMutated = querySelectorDeep(selector);
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

function isPageEffectivelyEmpty(): boolean {
	if (!document.body) return true;
	const text = (document.body.innerText || document.body.textContent)?.trim() || "";
	return text.length < 20;
}

export function isElementHidden(element: Element): boolean {
	// Modern browser standard check (Chrome 105+, Edge, Safari, Firefox)
	if (typeof element.checkVisibility === "function") {
		try {
			return !element.checkVisibility({
				checkOpacity: true,
				checkVisibilityCSS: true,
			});
		} catch {
			// Fallback if checkVisibility fails on detached/virtual node
		}
	}

	const htmlEl = element as HTMLElement;
	const style = window.getComputedStyle(htmlEl);
	if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
		return true;
	}

	if (window.navigator?.userAgent?.includes("jsdom")) {
		return false;
	}

	const isSvg =
		element.namespaceURI === "http://www.w3.org/2000/svg" ||
		(typeof SVGElement !== "undefined" && element instanceof SVGElement);
	const isDisplayContents = style.display === "contents";

	// SVG elements and display:contents have null offsetParent by spec even when fully visible
	if (!isSvg && !isDisplayContents) {
		if (htmlEl.offsetParent === null && htmlEl.tagName !== "BODY" && htmlEl.tagName !== "HTML") {
			if (style.position !== "fixed" && style.position !== "sticky") {
				return true;
			}
		}
	}
	return false;
}

function normalizeText(s: string): string {
	return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function isTextMatch(stored: string, extracted: string): boolean {
	if (!stored || !extracted) return !stored && !extracted;

	const a = normalizeText(stored);
	const b = normalizeText(extracted);

	if (a === b) return true;

	// Only allow substring match when shorter string is ≥50% of longer (prevents "new" matching "new york times...")
	const shorterLen = Math.min(a.length, b.length);
	const longerLen = Math.max(a.length, b.length);
	if (shorterLen >= longerLen * 0.5 && (a.includes(b) || b.includes(a))) return true;

	// Prefix match requires ≥90% overlap AND minimum 30 chars to avoid unrelated-string false positives
	const shorter = a.length <= b.length ? a : b;
	const longer = a.length <= b.length ? b : a;
	if (shorter.length >= 30) {
		const prefixLen = Math.floor(shorter.length * 0.9);
		if (longer.startsWith(shorter.slice(0, prefixLen))) return true;
	}

	return false;
}

function findElementOnPage(storedText: string, storedTagName: string): Element | null {
	if (!storedText || !document.body) return null;

	const normalizedStored = normalizeText(storedText);
	const tag = storedTagName?.toLowerCase() || "";

	const elements: Element[] = [];
	const roots: (Element | ShadowRoot)[] = [document.body];
	const visitedRoots = new Set<Element | ShadowRoot>();

	while (roots.length > 0) {
		const currentRoot = roots.shift();
		if (!currentRoot || visitedRoots.has(currentRoot)) continue;
		visitedRoots.add(currentRoot);

		const els = tag ? currentRoot.querySelectorAll(tag) : currentRoot.querySelectorAll("*");

		for (let i = 0; i < els.length; i++) {
			const el = els[i];
			elements.push(el);
			if (el.shadowRoot && !visitedRoots.has(el.shadowRoot)) {
				roots.push(el.shadowRoot);
			}
		}
	}

	const visibleElements: { el: Element; text: string }[] = [];
	for (let i = 0; i < elements.length; i++) {
		const el = elements[i];
		if (el.hasAttribute("data-vectortrace")) continue;
		try {
			if (isElementHidden(el)) continue;
		} catch {
			continue;
		}
		const elText = normalizeText(el.textContent?.trim() || "");
		if (!elText) continue;
		visibleElements.push({ el, text: elText });
	}

	// Collect all matching candidates then pick the best one
	// (first match is wrong on pages like HN where same text appears in link + row container)
	const exactMatches: { el: Element; text: string }[] = [];
	const fuzzyMatches: { el: Element; text: string }[] = [];

	for (const { el, text } of visibleElements) {
		if (text === normalizedStored) {
			exactMatches.push({ el, text });
		} else if (storedText.trim().length >= 10 && isTextMatch(storedText, text)) {
			fuzzyMatches.push({ el, text });
		}
	}

	// Pick best: prefer matching tagName, then smallest textContent (most leaf-like/specific)
	const pickBest = (matches: { el: Element; text: string }[]): Element | null => {
		if (matches.length === 0) return null;
		if (matches.length === 1) return matches[0].el;
		const withTag = tag ? matches.filter((m) => m.el.tagName.toLowerCase() === tag) : [];
		const pool = withTag.length > 0 ? withTag : matches;
		pool.sort((a, b) => (a.el.textContent?.length ?? 0) - (b.el.textContent?.length ?? 0));
		return pool[0].el;
	};

	return pickBest(exactMatches) ?? pickBest(fuzzyMatches);
}

export interface ExtractFieldInput {
	fieldId: string;
	label: string;
	cssSelector: string;
	xpathSelector: string;
	textContent: string;
	tagName: string;
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

export async function extractFields(fields: ExtractFieldInput[]): Promise<ExtractFieldResult[]> {
	const pageEmpty = isPageEffectivelyEmpty();

	return Promise.all(
		fields.map(async (field) => {
			if (pageEmpty) {
				return {
					fieldId: field.fieldId,
					label: field.label,
					value: "",
					status: "EMPTY_PAGE" as const,
				};
			}

			let element: Element | null = null;
			const isTest = typeof process !== "undefined" && process.env.NODE_ENV === "test";
			const timeout = isTest ? 50 : 3000;

			if (field.cssSelector) {
				try {
					element = await waitForElement(field.cssSelector, timeout);
				} catch (err) {
					console.error(`Invalid CSS selector for field "${field.label || field.fieldId}":`, err);
				}
			}

			if (!element && field.xpathSelector) {
				try {
					element = await waitForXpath(field.xpathSelector, timeout);
				} catch (err) {
					console.error(`Invalid XPath selector for field "${field.label || field.fieldId}":`, err);
				}
			}

			if (element) {
				if (isElementHidden(element)) {
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

				const tagOk = !storedTag || currentTag === storedTag;
				const textOk = !field.textContent || isTextMatch(field.textContent, extractedText);

				if (tagOk && textOk) {
					return {
						fieldId: field.fieldId,
						label: field.label,
						value: extractedText,
						status: "OK" as const,
					};
				}

				// Only fallback to searching the whole page if the tag drifted or if storedText
				// is sufficiently long/distinctive (e.g. paragraphs shifted by nth-of-type changes).
				// For short texts (prices, counts, short status) where the expected tag still matches,
				// the content has genuinely updated and should not match a random duplicate elsewhere.
				const isLongOrDistinctive = (field.textContent || "").trim().length >= 20;
				if (!tagOk || isLongOrDistinctive) {
					const pageMatch = findElementOnPage(field.textContent, field.tagName);
					if (pageMatch) {
						return {
							fieldId: field.fieldId,
							label: field.label,
							value: pageMatch.textContent?.trim() || "",
							status: "OK" as const,
						};
					}
				}

				if (!tagOk) {
					return {
						fieldId: field.fieldId,
						label: field.label,
						value: extractedText,
						status: "TAG_CHANGED" as const,
						storedText: field.textContent,
					};
				}

				return {
					fieldId: field.fieldId,
					label: field.label,
					value: extractedText,
					status: "TEXT_CONTENT_CHANGED" as const,
					storedText: field.textContent,
				};
			}

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
 * Extracts only the direct (own) text content of an element, excluding text
 * from child elements. This produces much more precise embeddings for
 * elements that are containers — e.g. a <td> with a link inside it
 * should yield the link's text, not the entire row.
 */
function getOwnText(el: HTMLElement): string {
	let ownText = "";
	for (let i = 0; i < el.childNodes.length; i++) {
		const child = el.childNodes[i];
		if (child.nodeType === Node.TEXT_NODE) {
			ownText += child.textContent || "";
		}
	}
	return ownText.trim();
}

/**
 * Checks if the element is a "leaf" from a text perspective:
 * either it has no child elements, or all of its text comes from
 * direct text nodes (child elements have negligible text).
 */
export function isLeafTextElement(el: HTMLElement): boolean {
	if (el.children.length === 0 && !el.shadowRoot) return true;
	const fullText = (el.textContent || "").trim();
	const ownText = getOwnText(el);
	// If own text accounts for most of the content, treat as leaf
	if (fullText.length > 0 && ownText.length / fullText.length >= 0.8 && !el.shadowRoot) return true;
	return false;
}

/**
 * Computes the DOM depth of an element relative to document.body.
 */
export function getDomDepth(el: Element): number {
	let depth = 0;
	let current: Element | null = el;
	while (current && current !== document.body && current !== document.documentElement) {
		depth++;
		if (current.parentElement) {
			current = current.parentElement;
		} else {
			const root = current.getRootNode?.();
			if (root && root !== current && "host" in root) {
				current = (root as ShadowRoot).host as Element;
			} else {
				current = null;
			}
		}
	}
	return depth;
}

const UTILITY_EXACT_NAMES = new Set([
	"flex",
	"inline-flex",
	"grid",
	"inline-grid",
	"block",
	"inline-block",
	"inline",
	"relative",
	"absolute",
	"fixed",
	"sticky",
	"static",
	"hidden",
	"border",
	"rounded",
	"shadow",
	"transition",
	"transform",
	"container",
	"row",
	"col",
	"clearfix",
	"truncate",
	"antialiased",
]);

const UTILITY_PREFIX_REGEX =
	/^(p[xytblr]?|m[xytblr]?|w|h|min-w|min-h|max-w|max-h|gap|space-[xy]|items|justify|content|self|text|font|bg|border|rounded|shadow|opacity|z|overflow|cursor|leading|tracking|transition|duration|ease|col-span|row-span|grid-cols|grid-rows)-/i;

function isUtilityClass(cls: string): boolean {
	const lower = cls.toLowerCase();
	const parts = lower.split(":");
	const baseClass = parts[parts.length - 1] || lower;
	if (UTILITY_EXACT_NAMES.has(baseClass)) return true;
	if (UTILITY_PREFIX_REGEX.test(baseClass)) return true;
	return false;
}

/**
 * Collects relevant class names and data attributes from the element
 * and its nearest ancestors (up to 3 levels) for structural context matching.
 * Utility styling classes (Tailwind/Bootstrap layout, spacing, colors) are filtered
 * out so only semantic, component-identifying classes are kept.
 */
export function getAncestorContext(el: Element, levels = 3): string[] {
	const ctx: string[] = [];
	let current: Element | null = el;
	for (let i = 0; i < levels && current && current !== document.body; i++) {
		// Collect class names, filtering out generic layout/utility classes
		if (current.className && typeof current.className === "string") {
			for (const cls of current.className.split(/\s+/)) {
				if (cls && cls.length > 1 && cls.length < 50 && !isUtilityClass(cls)) {
					ctx.push(cls);
				}
			}
		}
		// Collect data-* attributes
		for (const attr of Array.from(current.attributes)) {
			if (attr.name.startsWith("data-") && attr.name !== "data-vectortrace") {
				ctx.push(`${attr.name}=${attr.value}`);
			}
		}
		if (current.parentElement) {
			current = current.parentElement;
		} else {
			const root = current.getRootNode?.();
			if (root && root !== current && "host" in root) {
				current = (root as ShadowRoot).host as Element;
			} else {
				current = null;
			}
		}
	}
	return ctx;
}

export interface EnumeratedElement {
	text: string;
	cssSelector: string;
	xpathSelector: string;
	tagName: string;
	/** DOM depth relative to body */
	depth: number;
	/** Whether this is a leaf text element */
	isLeaf: boolean;
	/** Text length for structural comparison */
	textLength: number;
	/** Ancestor context classes/attributes for structural matching */
	ancestorContext: string[];
}

const INTERACTIVE_OR_SEMANTIC_CONTAINERS = new Set([
	"a",
	"button",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"label",
	"p",
	"summary",
]);

export function enumeratePageElements(): EnumeratedElement[] {
	if (!document.body) return [];

	const candidates: { text: string; element: HTMLElement; isLeaf: boolean }[] = [];

	const roots: (Element | ShadowRoot)[] = [document.body];
	const visitedRoots = new Set<Element | ShadowRoot>();

	while (roots.length > 0) {
		const currentRoot = roots.shift();
		if (!currentRoot || visitedRoots.has(currentRoot)) continue;
		visitedRoots.add(currentRoot);

		const walker = document.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT, {
			acceptNode(node) {
				const el = node as HTMLElement;
				const tag = el.tagName?.toLowerCase() || "";
				if (["script", "style", "noscript", "meta", "head"].includes(tag)) {
					return NodeFilter.FILTER_REJECT;
				}
				if (el.hasAttribute?.("data-vectortrace")) {
					return NodeFilter.FILTER_REJECT;
				}
				if (isElementHidden(el)) {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});

		let node = walker.nextNode();
		while (node) {
			const el = node as HTMLElement;
			if (el.shadowRoot && !visitedRoots.has(el.shadowRoot)) {
				roots.push(el.shadowRoot);
			}

			const isLeaf = isLeafTextElement(el);
			const text = (el.innerText ?? el.textContent)?.trim() || "";

			if (text.length >= 2) {
				candidates.push({ text, element: el, isLeaf });
			}
			node = walker.nextNode();
		}
	}

	// === IMPROVED DEDUPLICATION ===
	// Instead of deduplicating by text and losing elements, we keep both
	// leaf and parent elements but prefer leaf elements. We use a two-pass
	// approach:
	// 1. Collect all leaf elements first (these are most precise)
	// 2. Add parent/container elements only if they provide unique text
	//    or represent interactive/semantic containers (a, button, headings, etc.)

	const leafCandidates: { text: string; element: HTMLElement; isLeaf: boolean }[] = [];
	const nonLeafCandidates: { text: string; element: HTMLElement; isLeaf: boolean }[] = [];

	for (const cand of candidates) {
		if (cand.isLeaf) {
			leafCandidates.push(cand);
		} else {
			nonLeafCandidates.push(cand);
		}
	}

	// Do not deduplicate leaf elements by text — same text at different DOM positions
	// (e.g. multiple "100 points" spans on HN) must all be kept as separate candidates.
	// We only deduplicate by element reference (tree walker already ensures uniqueness).
	const leafTexts = new Set<string>();

	// Build final results: leaf elements first (priority), then non-leaf
	const results: EnumeratedElement[] = [];

	// Process all leaf elements without text-based deduplication
	for (const { text, element } of leafCandidates) {
		leafTexts.add(text);
		const cssSelector = generateCSSSelector(element) || "";
		const xpathSelector = generateXPath(element) || "";
		results.push({
			text,
			cssSelector,
			xpathSelector,
			tagName: element.tagName.toLowerCase(),
			depth: getDomDepth(element),
			isLeaf: true,
			textLength: text.length,
			ancestorContext: getAncestorContext(element),
		});
	}

	// Non-leaf deduplication: keep unique text, or distinct interactive/semantic containers
	const nonLeafMap = new Map<string, HTMLElement>();
	for (const cand of nonLeafCandidates) {
		const tag = cand.element.tagName.toLowerCase();
		const isSemanticContainer = INTERACTIVE_OR_SEMANTIC_CONTAINERS.has(tag);
		if (leafTexts.has(cand.text) && !isSemanticContainer) continue;
		const dedupeKey = isSemanticContainer ? `${tag}:${cand.text}` : cand.text;
		const existing = nonLeafMap.get(dedupeKey);
		if (existing) {
			if (existing.contains(cand.element)) {
				nonLeafMap.set(dedupeKey, cand.element);
			}
		} else {
			nonLeafMap.set(dedupeKey, cand.element);
		}
	}

	// Process non-leaf elements (capped to avoid explosion)
	let nonLeafCount = 0;
	const maxNonLeaf = 200;
	for (const [text, element] of nonLeafMap) {
		if (nonLeafCount >= maxNonLeaf) break;
		const cssSelector = generateCSSSelector(element) || "";
		const xpathSelector = generateXPath(element) || "";
		results.push({
			text,
			cssSelector,
			xpathSelector,
			tagName: element.tagName.toLowerCase(),
			depth: getDomDepth(element),
			isLeaf: false,
			textLength: text.length,
			ancestorContext: getAncestorContext(element),
		});
		nonLeafCount++;
	}

	// Cap total at 800 (increased from 500 for more coverage)
	return results.slice(0, 800);
}
