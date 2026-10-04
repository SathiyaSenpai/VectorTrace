/**
 * Computes the cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error("Vectors must have same length");
	}
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
}

/** Structural metadata about a candidate element, sent from content script. */
export interface CandidateMetadata {
	depth: number;
	isLeaf: boolean;
	textLength: number;
	ancestorContext: string[];
}

/** Structural metadata about the stored field we're matching against. */
export interface StoredFieldContext {
	tagName: string;
	textLength: number;
	depth: number;
	isLeaf: boolean;
	ancestorContext: string[];
	cssSelector?: string;
}

interface SimilarityCandidate {
	textContent: string;
	embedding: number[];
	cssSelector: string;
	xpathSelector: string;
	tagName?: string;
	metadata?: CandidateMetadata;
}

export interface RankedCandidate {
	textContent: string;
	cssSelector: string;
	xpathSelector: string;
	score: number;
	confidence: "HIGH" | "MEDIUM" | "LOW";
	tagName?: string;
	depth?: number;
	isLeaf?: boolean;
	ancestorContext?: string[];
}

// ───────────────────────────────────────────────
// Signal computation helpers
// ───────────────────────────────────────────────

/**
 * Tag match bonus: rewards candidates whose HTML tag matches the stored field's tag.
 * Returns 1.0 for exact match, 0.5 for related tags, 0.0 for mismatch.
 */
function tagMatchScore(storedTag: string, candidateTag: string): number {
	if (!storedTag || !candidateTag) return 0.5; // neutral if unknown
	const a = storedTag.toLowerCase();
	const b = candidateTag.toLowerCase();
	if (a === b) return 1.0;
	// Related tag groups
	const headings = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
	const inline = new Set(["span", "a", "em", "strong", "b", "i", "small", "label"]);
	const block = new Set(["div", "p", "section", "article", "main", "li", "td", "th"]);
	if ((headings.has(a) && headings.has(b)) ||
		(inline.has(a) && inline.has(b)) ||
		(block.has(a) && block.has(b))) {
		return 0.7;
	}
	return 0.0;
}

/**
 * Text length ratio: how similar is the candidate's text length to the stored field's.
 * Returns 1.0 for identical lengths, decaying toward 0 as they diverge.
 */
function textLengthScore(storedLen: number, candidateLen: number): number {
	if (storedLen === 0 && candidateLen === 0) return 1.0;
	if (storedLen === 0 || candidateLen === 0) return 0.0;
	const ratio = Math.min(storedLen, candidateLen) / Math.max(storedLen, candidateLen);
	// Apply a power curve to penalize large divergences more heavily
	return Math.pow(ratio, 0.5);
}

/**
 * DOM depth similarity: rewards candidates at a similar depth in the DOM tree.
 * Returns 1.0 for same depth, decaying as depth difference increases.
 */
function depthScore(storedDepth: number, candidateDepth: number): number {
	if (storedDepth < 0 || candidateDepth < 0) return 0.5; // neutral if unknown
	const diff = Math.abs(storedDepth - candidateDepth);
	// Gaussian-like decay: score = exp(-diff²/8)
	return Math.exp(-(diff * diff) / 8);
}

/**
 * Leaf match bonus: strongly prefer leaf elements when the stored field was a leaf,
 * and vice versa.
 */
function leafScore(storedIsLeaf: boolean, candidateIsLeaf: boolean): number {
	if (storedIsLeaf && candidateIsLeaf) return 1.0;
	if (storedIsLeaf && !candidateIsLeaf) return 0.2;  // heavy penalty for non-leaf when we want leaf
	if (!storedIsLeaf && candidateIsLeaf) return 0.7;   // slight bonus — leaves are generally safer
	return 0.8; // both non-leaf: neutral-ish
}

/**
 * Ancestor context overlap: measures how many ancestor classes/attributes
 * the candidate shares with the stored field's ancestors.
 * Returns a value between 0 and 1 based on Jaccard similarity.
 */
function ancestorContextScore(storedCtx: string[], candidateCtx: string[]): number {
	if (storedCtx.length === 0 && candidateCtx.length === 0) return 0.5; // neutral
	if (storedCtx.length === 0 || candidateCtx.length === 0) return 0.3;
	const setA = new Set(storedCtx);
	const setB = new Set(candidateCtx);
	let intersection = 0;
	for (const item of setA) {
		if (setB.has(item)) intersection++;
	}
	const union = new Set([...storedCtx, ...candidateCtx]).size;
	return union === 0 ? 0.5 : intersection / union;
}

function selectorTokens(sel: string): Set<string> {
	if (!sel) return new Set();
	const segments = sel.split(/[\s>+~]+/);
	const tokens = new Set<string>();
	for (const seg of segments) {
		const trimmed = seg.trim().toLowerCase();
		if (!trimmed) continue;
		tokens.add(trimmed);
		const parts = trimmed.match(/[#.]?[a-zA-Z0-9_-]+|:[a-zA-Z0-9_-]+(?:\([^)]*\))?/g);
		if (parts) {
			for (const p of parts) tokens.add(p);
		}
	}
	return tokens;
}

/**
 * Selector path similarity: rewards candidates that share structural path segments,
 * IDs, or classes with the original selector. Critical for disambiguating repeated
 * list/table elements (e.g. Hacker News rows or product grids).
 */
function selectorSimilarityScore(storedSel: string, candidateSel: string): number {
	if (!storedSel || !candidateSel) return 0.5; // neutral if unknown
	if (storedSel === candidateSel) return 1.0;
	const setA = selectorTokens(storedSel);
	const setB = selectorTokens(candidateSel);
	if (setA.size === 0 || setB.size === 0) return 0.5;

	let intersection = 0;
	for (const token of setA) {
		if (setB.has(token)) intersection++;
	}
	const union = new Set([...setA, ...setB]).size;
	return union === 0 ? 0.5 : intersection / union;
}

// ───────────────────────────────────────────────
// Main ranking function
// ───────────────────────────────────────────────

/**
 * Signal weights for the multi-signal ranking.
 * Semantic embedding is the primary anchor (0.50), supported by positional selector
 * proximity and structural indicators.
 */
const WEIGHTS = {
	embedding:          0.50,   // Semantic similarity (cosine)
	selectorSimilarity: 0.15,   // Positional / subtree proximity to original selector
	tagMatch:           0.10,   // HTML tag match
	textLength:         0.10,   // Text length similarity
	leaf:               0.08,   // Leaf element preference
	ancestorContext:    0.05,   // Ancestor structural context overlap
	depth:              0.02,   // DOM depth similarity
};

/**
 * Compares candidates to a stored embedding using a multi-signal weighted
 * scoring algorithm with semantic gating, then ranks them in descending order of score.
 *
 * Signals used:
 * 1. Cosine similarity (embedding) — semantic meaning
 * 2. Selector path similarity — positional and structural proximity
 * 3. Tag name match — structural type
 * 4. Text length ratio — size similarity
 * 5. Leaf element preference — precision indicator
 * 6. Ancestor context overlap — structural neighborhood
 * 7. DOM depth similarity — vertical tree position
 *
 * When no storedFieldContext is provided, falls back to embedding-only ranking
 * (backward compatible with existing callers).
 */
export function rankCandidates(
	storedEmbedding: number[],
	candidates: SimilarityCandidate[],
	storedFieldContext?: StoredFieldContext,
): RankedCandidate[] {
	return candidates
		.map((c) => {
			const embeddingScore = cosineSimilarity(storedEmbedding, c.embedding);

			// If we have structural context, compute multi-signal score
			if (storedFieldContext && c.metadata) {
				const rawEmbedding = Math.max(0, embeddingScore);
				// Semantic gate: heavily damp structural contribution when semantic match is weak (<0.30)
				// to prevent completely unrelated strings from outscoring real matches via structural coincidence.
				const semanticGate = rawEmbedding < 0.30 ? Math.max(0, rawEmbedding / 0.30) : 1.0;

				const signals = {
					tagMatch: tagMatchScore(storedFieldContext.tagName, c.tagName || ""),
					textLength: textLengthScore(storedFieldContext.textLength, c.metadata.textLength),
					selectorSimilarity: selectorSimilarityScore(
						storedFieldContext.cssSelector || "",
						c.cssSelector || "",
					),
					depth: depthScore(storedFieldContext.depth, c.metadata.depth),
					leaf: leafScore(storedFieldContext.isLeaf, c.metadata.isLeaf),
					ancestorContext: ancestorContextScore(
						storedFieldContext.ancestorContext,
						c.metadata.ancestorContext,
					),
				};

				// Weighted structural combination
				const structuralScore =
					signals.selectorSimilarity * WEIGHTS.selectorSimilarity +
					signals.tagMatch * WEIGHTS.tagMatch +
					signals.textLength * WEIGHTS.textLength +
					signals.depth * WEIGHTS.depth +
					signals.leaf * WEIGHTS.leaf +
					signals.ancestorContext * WEIGHTS.ancestorContext;

				// Combined score with semantic gating
				const combinedScore = rawEmbedding * WEIGHTS.embedding + structuralScore * semanticGate;

				// Confidence thresholds adjusted for multi-signal scores
				// Multi-signal max is 1.0, typical good match is 0.65-0.85
				const confidence =
					combinedScore >= 0.70
						? ("HIGH" as const)
						: combinedScore >= 0.50
							? ("MEDIUM" as const)
							: ("LOW" as const);

				return {
					textContent: c.textContent,
					cssSelector: c.cssSelector,
					xpathSelector: c.xpathSelector,
					score: combinedScore,
					confidence,
					tagName: c.tagName,
					depth: c.metadata.depth,
					isLeaf: c.metadata.isLeaf,
					ancestorContext: c.metadata.ancestorContext,
				};
			}

			// Fallback: embedding-only ranking (backward compatible)
			const confidence =
				embeddingScore >= 0.85
					? ("HIGH" as const)
					: embeddingScore >= 0.6
						? ("MEDIUM" as const)
						: ("LOW" as const);
			return {
				textContent: c.textContent,
				cssSelector: c.cssSelector,
				xpathSelector: c.xpathSelector,
				score: embeddingScore,
				confidence,
				tagName: c.tagName,
				depth: c.metadata?.depth,
				isLeaf: c.metadata?.isLeaf,
				ancestorContext: c.metadata?.ancestorContext,
			};
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, 10); // return top 10 candidates
}
