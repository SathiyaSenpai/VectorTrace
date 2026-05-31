export interface FieldDefinition {
	fieldId: string; // crypto.randomUUID()
	schemaId: string; // parent schema reference
	label: string; // user-given name like "Price" or "Title"
	url: string; // page URL where field was defined
	cssSelector: string; // generated CSS selector
	xpathSelector: string; // XPath fallback
	textContent: string; // extracted text at definition time
	tagName: string; // lowercase HTML tag name at definition time (e.g. "h1", "p", "span")
	embedding: number[]; // 384-dim Float32Array converted to number[]
	timestamp: number; // Date.now() at definition time
}

export interface Schema {
	schemaId: string; // crypto.randomUUID()
	name: string; // user-given schema name
	url: string; // page URL where schema was defined
	urlPattern?: string; // glob or pattern matching rules
	fields: FieldDefinition[]; // ordered list of fields
	createdAt: number;
	updatedAt: number;
}

export interface SimilarityCandidate {
	textContent: string;
	cssSelector: string;
	xpathSelector: string;
	score: number; // cosine similarity 0-1
	confidence: "HIGH" | "MEDIUM" | "LOW";
	element?: Element; // only available in content script context
}

/**
 * Extraction status codes — each tells the user a different story.
 * OK              = selector found, text matches stored content
 * SELECTOR_BROKEN = selector returns null (element missing from DOM)
 * TEXT_CONTENT_CHANGED = selector found an element, but text doesn't match stored content
 *                        (likely a sibling shifted into the selector's position)
 * TAG_CHANGED     = selector found an element, but its tag name differs from the stored tag
 *                    (structural drift — e.g. the <h1> became a <p> due to DOM reordering)
 * ELEMENT_HIDDEN  = selector found an element, but it is hidden (display:none, visibility:hidden)
 * EMPTY_PAGE      = document.body has no meaningful text content at all
 * HEALED          = selector was previously broken and has been auto-repaired
 */
export type ExtractionStatus =
	| "OK"
	| "SELECTOR_BROKEN"
	| "TEXT_CONTENT_CHANGED"
	| "TAG_CHANGED"
	| "ELEMENT_HIDDEN"
	| "EMPTY_PAGE"
	| "HEALED";

export interface ExtractionResult {
	schemaId: string;
	url: string;
	timestamp: number;
	fields: {
		fieldId: string;
		label: string;
		value: string;
		status: ExtractionStatus;
		healedFrom?: string; // original broken selector
		healedTo?: string; // new working selector
		storedText?: string; // the text that was stored at definition time (for TEXT_CONTENT_CHANGED)
	}[];
}

// Message types for chrome.runtime.sendMessage
export type MessageType =
	| { type: "GENERATE_EMBEDDING"; text: string }
	| {
			type: "COMPUTE_SIMILARITY";
			storedEmbedding: number[];
			candidateTexts: string[];
	  }
	| { type: "START_SELECTION"; schemaId: string }
	| { type: "FIELD_SELECTED"; field: Omit<FieldDefinition, "embedding"> }
	| { type: "RUN_EXTRACTION"; schemaId: string }
	| { type: "EXTRACTION_COMPLETE"; result: ExtractionResult }
	| {
			type: "FIND_CANDIDATES";
			fieldId: string;
			schemaId: string;
	  }
	| {
			type: "SEARCH_PROGRESS";
			current: number;
			total: number;
	  }
	| { type: "ENUMERATE_PAGE" }
	| { type: "HIGHLIGHT_ELEMENT"; cssSelector: string }
	| { type: "REMOVE_HIGHLIGHT" }
	| {
			type: "CANDIDATES_FOUND";
			candidates: { text: string; cssSelector: string; xpathSelector: string; tagName: string }[];
	  }
	| { type: "OFFSCREEN_GENERATE_EMBEDDING"; text: string }
	| { type: "MODEL_DOWNLOAD_PROGRESS"; progress: number }
	| { type: "MODEL_DOWNLOAD_COMPLETE" }
	| { type: "PICKER_CANCELLED" }
	| { type: "GET_PICKER_STATUS" };
