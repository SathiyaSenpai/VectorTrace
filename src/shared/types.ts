export interface FieldDefinition {
	fieldId: string; // crypto.randomUUID()
	schemaId: string; // parent schema reference
	label: string; // user-given name like "Price" or "Title"
	cssSelector: string; // generated CSS selector
	xpathSelector: string; // XPath fallback
	textContent: string; // extracted text at definition time
	embedding: number[]; // 384-dim Float32Array converted to number[]
	timestamp: number; // Date.now() at definition time
}

export interface Schema {
	schemaId: string; // crypto.randomUUID()
	name: string; // user-given schema name
	url: string; // page URL where schema was defined
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

export interface ExtractionResult {
	schemaId: string;
	url: string;
	timestamp: number;
	fields: {
		fieldId: string;
		label: string;
		value: string;
		status: "OK" | "SELECTOR_BROKEN" | "HEALED";
		healedFrom?: string; // original broken selector
		healedTo?: string; // new working selector
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
			pageTexts: { text: string; cssSelector: string; xpathSelector: string }[];
	  };
