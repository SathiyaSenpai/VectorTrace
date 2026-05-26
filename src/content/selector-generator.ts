/**
 * Checks if an element is inside a cross-origin iframe.
 * If accessing parent document properties throws an exception, it is cross-origin.
 */
function isCrossOriginIframe(element: HTMLElement): boolean {
	try {
		const win = element.ownerDocument?.defaultView;
		if (win && win.parent !== win) {
			// Trigger browser security check
			const _ = win.parent.document;
			return false;
		}
	} catch (_e) {
		return true;
	}
	return false;
}

/**
 * Returns the case-sensitive tag name for SVG elements,
 * or lowercase tag name for HTML elements.
 */
function getTagName(element: Element): string {
	const isSvg = element.namespaceURI === "http://www.w3.org/2000/svg";
	return isSvg ? element.tagName : element.tagName.toLowerCase();
}

/**
 * Helper to generate a full CSS selector path starting from HTML.
 */
function generateFullPathSelector(element: HTMLElement): string {
	const path: string[] = [];
	let current: Element | null = element;
	const doc = element.ownerDocument;

	while (current && current !== doc.body && current !== doc.documentElement) {
		const tagName = getTagName(current);
		let nth = 1;
		let hasSiblingsWithSameTag = false;

		let sib = current.previousElementSibling;
		while (sib) {
			if (sib.tagName === current.tagName) {
				nth++;
			}
			sib = sib.previousElementSibling;
		}

		sib = current.nextElementSibling;
		while (sib) {
			if (sib.tagName === current.tagName) {
				hasSiblingsWithSameTag = true;
				break;
			}
			sib = sib.nextElementSibling;
		}

		const segment = hasSiblingsWithSameTag || nth > 1 ? `${tagName}:nth-of-type(${nth})` : tagName;
		path.unshift(segment);
		current = current.parentElement;
	}

	if (current === doc.body) {
		path.unshift("body");
	} else {
		path.unshift("html");
	}
	return path.join(" > ");
}

/**
 * Truncates a CSS selector path to remain under 500 characters,
 * while verifying that the shortened selector remains unique to the target element.
 */
function truncateCSSSelector(selector: string, target: HTMLElement): string {
	if (selector.length <= 500) {
		return selector;
	}

	const parts = selector.split(" > ");
	while (parts.length > 1) {
		parts.shift();
		const candidate = parts.join(" > ");
		if (candidate.length <= 500) {
			try {
				const resolved = target.ownerDocument.querySelector(candidate);
				if (resolved === target) {
					return candidate;
				}
			} catch (_e) {
				// Ignore selector errors during trial
			}
		}
	}

	return selector.slice(0, 500);
}

/**
 * Evaluates an XPath expression and returns the matched node.
 */
function evaluateXPath(xpath: string, doc: Document): Node | null {
	try {
		return doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
			.singleNodeValue;
	} catch (_e) {
		return null;
	}
}

/**
 * Truncates an XPath expression to remain under 500 characters,
 * trying to make it relative (starting with //) and verifying uniqueness.
 */
function truncateXPath(xpath: string, target: HTMLElement): string {
	if (xpath.length <= 500) {
		return xpath;
	}

	const subParts = xpath.replace(/^\/html\/body\//, "").split("/");
	while (subParts.length > 1) {
		subParts.shift();
		const candidate = `//${subParts.join("/")}`;
		if (candidate.length <= 500) {
			if (evaluateXPath(candidate, target.ownerDocument) === target) {
				return candidate;
			}
		}
	}

	return xpath.slice(0, 500);
}

/**
 * Helper to escape CSS identifiers. Falls back to a regex-based escape
 * if CSS.escape is not defined (e.g. in test environments like JSDOM).
 */
function escapeCSSIdentifier(val: string): string {
	if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
		return CSS.escape(val);
	}
	return val.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

/**
 * Generates a unique CSS Selector for the given element.
 */
export function generateCSSSelector(element: HTMLElement): string | null {
	if (isCrossOriginIframe(element)) {
		return null;
	}

	const doc = element.ownerDocument;

	// 1. Unique ID strategy
	if (element.id) {
		try {
			const escapedId = escapeCSSIdentifier(element.id);
			const selector = `#${escapedId}`;
			if (doc.querySelectorAll(selector).length === 1) {
				return truncateCSSSelector(selector, element);
			}
		} catch (_e) {
			// Skip and fall back if id escape fails
		}
	}

	// 2. Unique data-* attributes strategy
	for (const attr of Array.from(element.attributes)) {
		if (attr.name.startsWith("data-")) {
			try {
				const tagName = getTagName(element);
				const selector = `${tagName}[${attr.name}="${escapeCSSIdentifier(attr.value)}"]`;
				if (doc.querySelectorAll(selector).length === 1) {
					return truncateCSSSelector(selector, element);
				}
			} catch (_e) {
				// Skip and try other attribute
			}
		}
	}

	// 3. Nearest ancestor with ID strategy
	const path: string[] = [];
	let current: Element | null = element;

	while (current && current !== doc.body && current !== doc.documentElement) {
		if (current.id) {
			try {
				const escapedId = escapeCSSIdentifier(current.id);
				const selector = `#${escapedId}`;
				if (doc.querySelectorAll(selector).length === 1) {
					path.unshift(selector);
					break;
				}
			} catch (_e) {
				// Continue walking up
			}
		}

		const tagName = getTagName(current);
		let nth = 1;
		let hasSiblingsWithSameTag = false;

		let sib = current.previousElementSibling;
		while (sib) {
			if (sib.tagName === current.tagName) {
				nth++;
			}
			sib = sib.previousElementSibling;
		}

		sib = current.nextElementSibling;
		while (sib) {
			if (sib.tagName === current.tagName) {
				hasSiblingsWithSameTag = true;
				break;
			}
			sib = sib.nextElementSibling;
		}

		const segment = hasSiblingsWithSameTag || nth > 1 ? `${tagName}:nth-of-type(${nth})` : tagName;
		path.unshift(segment);

		current = current.parentElement;
	}

	// Prepend root tags if we did not break early with an ID
	if (current === doc.body) {
		path.unshift("body");
	} else if (current === doc.documentElement) {
		path.unshift("html");
	}

	let generatedSelector = path.join(" > ");

	// 4. Validate querySelector returns the original element.
	// If it doesn't, fall back to a full path.
	try {
		const matched = doc.querySelector(generatedSelector);
		if (matched !== element) {
			generatedSelector = generateFullPathSelector(element);
		}
	} catch (_e) {
		generatedSelector = generateFullPathSelector(element);
	}

	return truncateCSSSelector(generatedSelector, element);
}

/**
 * Generates a unique XPath expression for the given element.
 */
export function generateXPath(element: HTMLElement): string | null {
	if (isCrossOriginIframe(element)) {
		return null;
	}

	const doc = element.ownerDocument;

	if (element === doc.body) {
		return "/html/body";
	}
	if (element === doc.documentElement) {
		return "/html";
	}

	const segments: string[] = [];
	let current: Element | null = element;

	// Walk up to document.body
	while (current && current !== doc.body && current !== doc.documentElement) {
		let count = 0;
		let index = 1;
		const parent = current.parentNode;

		if (parent) {
			let child = parent.firstChild;
			while (child) {
				if (
					child.nodeType === Node.ELEMENT_NODE &&
					(child as Element).tagName === current.tagName
				) {
					count++;
					if (child === current) {
						index = count;
					}
				}
				child = child.nextSibling;
			}
		}

		const tagName = getTagName(current);
		let segment = tagName;
		if (count > 1) {
			segment += `[${index}]`;
		}
		segments.unshift(segment);

		current = parent as Element | null;
	}

	const xpath = `/html/body/${segments.join("/")}`;

	// Validate xpath evaluation returns the original element.
	const matchedNode = evaluateXPath(xpath, doc);
	if (matchedNode !== element) {
		// Fallback to strict indexed XPath at every level
		const strictSegments: string[] = [];
		let strictCurrent: Element | null = element;

		while (strictCurrent && strictCurrent !== doc.body && strictCurrent !== doc.documentElement) {
			let index = 1;
			const parent = strictCurrent.parentNode;
			if (parent) {
				let child = parent.firstChild;
				while (child && child !== strictCurrent) {
					if (
						child.nodeType === Node.ELEMENT_NODE &&
						(child as Element).tagName === strictCurrent.tagName
					) {
						index++;
					}
					child = child.nextSibling;
				}
			}
			const tagName = getTagName(strictCurrent);
			strictSegments.unshift(`${tagName}[${index}]`);
			strictCurrent = parent as Element | null;
		}
		return truncateXPath(`/html/body/${strictSegments.join("/")}`, element);
	}

	return truncateXPath(xpath, element);
}
