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

interface SimilarityCandidate {
	textContent: string;
	embedding: number[];
	cssSelector: string;
	xpathSelector: string;
}

interface RankedCandidate {
	textContent: string;
	cssSelector: string;
	xpathSelector: string;
	score: number;
	confidence: "HIGH" | "MEDIUM" | "LOW";
}

/**
 * Compares candidates to a stored embedding using cosine similarity,
 * then ranks them in descending order of score.
 */
export function rankCandidates(
	storedEmbedding: number[],
	candidates: SimilarityCandidate[],
): RankedCandidate[] {
	return candidates
		.map((c) => {
			const score = cosineSimilarity(storedEmbedding, c.embedding);
			const confidence =
				score >= 0.85 ? ("HIGH" as const) : score >= 0.6 ? ("MEDIUM" as const) : ("LOW" as const);
			return {
				text: c.text,
				cssSelector: c.cssSelector,
				xpathSelector: c.xpathSelector,
				score,
				confidence,
			};
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, 10); // return top 10 candidates
}
