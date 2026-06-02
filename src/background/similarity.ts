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
}

interface SimilarityCandidate {
	textContent: string;
	embedding: number[];
	cssSelector: string;
	xpathSelector: string;
	tagName?: string;
	metadata?: CandidateMetadata;
}

interface RankedCandidate {
	textContent: string;
	cssSelector: string;
	xpathSelector: string;
	score: number;
	confidence: "HIGH" | "MEDIUM" | "LOW";
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

// ───────────────────────────────────────────────
// Main ranking function
// ───────────────────────────────────────────────

/**
 * Signal weights for the multi-signal ranking.
 * These can be tuned for different accuracy profiles.
 */
const WEIGHTS = {
	embedding:       0.40,   // Semantic similarity (cosine)
	tagMatch:        0.10,   // HTML tag match
	textLength:      0.15,   // Text length similarity
	depth:           0.08,   // DOM depth similarity
	leaf:            0.15,   // Leaf element preference
	ancestorContext: 0.12,   // Ancestor structural context overlap
};

/**
 * Compares candidates to a stored embedding using a multi-signal weighted
 * scoring algorithm, then ranks them in descending order of score.
 *
 * Signals used:
 * 1. Cosine similarity (embedding) — semantic meaning
 * 2. Tag name match — structural type
 * 3. Text length ratio — size similarity
 * 4. DOM depth similarity — positional context
 * 5. Leaf element preference — precision indicator
 * 6. Ancestor context overlap — structural neighborhood
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
				const signals = {
					embedding: Math.max(0, embeddingScore), // clamp negative similarities
					tagMatch: tagMatchScore(storedFieldContext.tagName, c.tagName || ""),
					textLength: textLengthScore(storedFieldContext.textLength, c.metadata.textLength),
					depth: depthScore(storedFieldContext.depth, c.metadata.depth),
					leaf: leafScore(storedFieldContext.isLeaf, c.metadata.isLeaf),
					ancestorContext: ancestorContextScore(
						storedFieldContext.ancestorContext,
						c.metadata.ancestorContext,
					),
				};

				// Weighted combination
				const combinedScore =
					signals.embedding * WEIGHTS.embedding +
					signals.tagMatch * WEIGHTS.tagMatch +
					signals.textLength * WEIGHTS.textLength +
					signals.depth * WEIGHTS.depth +
					signals.leaf * WEIGHTS.leaf +
					signals.ancestorContext * WEIGHTS.ancestorContext;

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
			};
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, 10); // return top 10 candidates
}
