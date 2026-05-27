import { describe, expect, it } from "vitest";
import { cosineSimilarity, rankCandidates } from "./similarity";

describe("Similarity Utilities", () => {
	describe("cosineSimilarity", () => {
		it("should compute similarity correctly for identical vectors", () => {
			const a = [1, 0, 0];
			const b = [1, 0, 0];
			expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
		});

		it("should compute similarity correctly for orthogonal vectors", () => {
			const a = [1, 0, 0];
			const b = [0, 1, 0];
			expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
		});

		it("should compute similarity correctly for opposite vectors", () => {
			const a = [1, 0, 0];
			const b = [-1, 0, 0];
			expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
		});

		it("should throw error if vector lengths differ", () => {
			expect(() => cosineSimilarity([1], [1, 2])).toThrow("Vectors must have same length");
		});

		it("should return 0 for zero vectors", () => {
			expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
		});
	});

	describe("rankCandidates", () => {
		it("should rank candidate text segments by similarity", () => {
			const stored = [1, 0];
			const candidates = [
				{
					textContent: "poor match",
					embedding: [0, 1],
					cssSelector: ".poor",
					xpathSelector: "/poor",
				},
				{
					textContent: "exact match",
					embedding: [1, 0],
					cssSelector: ".exact",
					xpathSelector: "/exact",
				},
				{
					textContent: "partial match",
					embedding: [Math.SQRT1_2, Math.SQRT1_2],
					cssSelector: ".part",
					xpathSelector: "/part",
				},
			];

			const ranked = rankCandidates(stored, candidates);

			expect(ranked.length).toBe(3);
			expect(ranked[0].textContent).toBe("exact match");
			expect(ranked[0].score).toBeCloseTo(1.0);
			expect(ranked[0].confidence).toBe("HIGH");

			expect(ranked[1].textContent).toBe("partial match");
			expect(ranked[1].score).toBeCloseTo(Math.SQRT1_2);
			expect(ranked[1].confidence).toBe("MEDIUM");

			expect(ranked[2].textContent).toBe("poor match");
			expect(ranked[2].score).toBeCloseTo(0.0);
			expect(ranked[2].confidence).toBe("LOW");
		});
	});
});
