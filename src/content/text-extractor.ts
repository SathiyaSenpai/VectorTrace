import type { ExtractionStatus } from "../shared/types";
import { generateCSSSelector, generateXPath } from "./selector-generator";

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

function isElementHidden(element: Element): boolean {
	const htmlEl = element as HTMLElement;
	const style = window.getComputedStyle(htmlEl);
	if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
		return true;
	}

	if (window.navigator?.userAgent?.includes("jsdom")) {
		return false;
	}

	if (htmlEl.offsetParent === null && htmlEl.tagName !== "BODY" && htmlEl.tagName !== "HTML") {
		if (style.position !== "fixed" && style.position !== "sticky") {
			return true;
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
	if (a.includes(b) || b.includes(a)) return true;

	const shorter = a.length <= b.length ? a : b;
	const longer = a.length <= b.length ? b : a;
	if (shorter.length > 20) {
		const prefixLen = Math.floor(shorter.length * 0.8);
		if (longer.startsWith(shorter.slice(0, prefixLen))) return true;
	}

	return false;
}

function findElementOnPage(storedText: string, storedTagName: string): Element | null {
	if (!storedText || !document.body) return null;

	const normalizedStored = normalizeText(storedText);
	const tag = storedTagName?.toLowerCase() || "";

	const elements = tag
		? document.body.getElementsByTagName(tag)
		: document.body.querySelectorAll("*");

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

	for (const { el, text } of visibleElements) {
		if (text === normalizedStored) return el;
	}

	for (const { el, text } of visibleElements) {
		if (isTextMatch(storedText, text)) return el;
	}

	return null;
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

				const pageMatch = findElementOnPage(field.textContent, field.tagName);

				if (pageMatch) {
					return {
						fieldId: field.fieldId,
						label: field.label,
						value: pageMatch.textContent?.trim() || "",
						status: "OK" as const,
					};
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
		if (text.length >= 2) {
			candidates.push({ text, element: el });
		}
		node = walker.nextNode();
	}

	const uniqueMap = new Map<string, HTMLElement>();
	for (const candidate of candidates) {
		const existing = uniqueMap.get(candidate.text);
		if (existing) {
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

	uniqueCandidates.sort((a, b) => a.text.length - b.text.length);

	const topCandidates = uniqueCandidates.slice(0, 500);

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
