import { describe, expect, it } from "vitest";
import { cosineSimilarity, rankCandidates, type StoredFieldContext } from "./similarity";

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

	describe("rankCandidates (embedding-only fallback)", () => {
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

	describe("rankCandidates (multi-signal)", () => {
		const storedContext: StoredFieldContext = {
			tagName: "span",
			textLength: 10,
			depth: 5,
			isLeaf: true,
			ancestorContext: ["score", "subtext"],
		};

		it("should rank a structurally matching leaf candidate higher than a non-leaf with same embedding", () => {
			const stored = [1, 0];
			const candidates = [
				{
					textContent: "parent container text with lots of extra content",
					embedding: [1, 0], // same embedding score
					cssSelector: ".parent",
					xpathSelector: "/parent",
					tagName: "div",
					metadata: {
						depth: 2,
						isLeaf: false,
						textLength: 80,
						ancestorContext: ["wrapper"],
					},
				},
				{
					textContent: "100 points",
					embedding: [0.95, 0.31], // slightly lower embedding score
					cssSelector: ".score > span",
					xpathSelector: "/score/span",
					tagName: "span",
					metadata: {
						depth: 5,
						isLeaf: true,
						textLength: 10,
						ancestorContext: ["score", "subtext"],
					},
				},
			];

			const ranked = rankCandidates(stored, candidates, storedContext);

			// The leaf candidate with matching tag, depth, and ancestor context
			// should rank above the non-leaf even though embedding score is slightly lower
			expect(ranked[0].textContent).toBe("100 points");
			expect(ranked[0].confidence).toBe("HIGH");
		});

		it("should apply tag match bonus correctly", () => {
			const stored = [1, 0];
			const candidates = [
				{
					textContent: "text A",
					embedding: [0.9, 0.44], // slightly lower embedding
					cssSelector: ".a",
					xpathSelector: "/a",
					tagName: "span", // exact tag match
					metadata: {
						depth: 5,
						isLeaf: true,
						textLength: 10,
						ancestorContext: ["score"],
					},
				},
				{
					textContent: "text B",
					embedding: [0.95, 0.31], // slightly higher embedding
					cssSelector: ".b",
					xpathSelector: "/b",
					tagName: "div", // wrong tag
					metadata: {
						depth: 5,
						isLeaf: true,
						textLength: 10,
						ancestorContext: ["score"],
					},
				},
			];

			const ranked = rankCandidates(stored, candidates, storedContext);

			// Tag match + other structural signals should push "text A" higher
			expect(ranked[0].textContent).toBe("text A");
		});

		it("should penalize large text length divergence", () => {
			const stored = [1, 0];
			const candidates = [
				{
					textContent: "short text",
					embedding: [0.85, 0.53], // moderate embedding
					cssSelector: ".short",
					xpathSelector: "/short",
					tagName: "span",
					metadata: {
						depth: 5,
						isLeaf: true,
						textLength: 10, // matching stored length
						ancestorContext: ["score"],
					},
				},
				{
					textContent: "very long text that is way longer than what we stored originally and contains many extra words",
					embedding: [0.9, 0.44], // higher embedding
					cssSelector: ".long",
					xpathSelector: "/long",
					tagName: "span",
					metadata: {
						depth: 5,
						isLeaf: true,
						textLength: 95, // very different from stored length of 10
						ancestorContext: ["score"],
					},
				},
			];

			const ranked = rankCandidates(stored, candidates, storedContext);

			// Even though the long text has higher embedding score,
			// the text length penalty should push the short matching one higher
			expect(ranked[0].textContent).toBe("short text");
		});

		it("should reward ancestor context overlap", () => {
			const stored = [0.7, 0.7];
			const candidates = [
				{
					textContent: "candidate A",
					embedding: [0.7, 0.7], // identical embedding
					cssSelector: ".a",
					xpathSelector: "/a",
					tagName: "span",
					metadata: {
						depth: 5,
						isLeaf: true,
						textLength: 10,
						ancestorContext: ["score", "subtext"], // matches stored context
					},
				},
				{
					textContent: "candidate B",
					embedding: [0.7, 0.7], // identical embedding
					cssSelector: ".b",
					xpathSelector: "/b",
					tagName: "span",
					metadata: {
						depth: 5,
						isLeaf: true,
						textLength: 10,
						ancestorContext: ["header", "nav"], // no overlap with stored
					},
				},
			];

			const ranked = rankCandidates(stored, candidates, storedContext);

			// Candidate A with matching ancestor context should rank higher
			expect(ranked[0].textContent).toBe("candidate A");
		});

		it("should still work when metadata is missing (fallback to embedding-only)", () => {
			const stored = [1, 0];
			const candidates = [
				{
					textContent: "no metadata",
					embedding: [1, 0],
					cssSelector: ".x",
					xpathSelector: "/x",
					// no metadata property
				},
			];

			const ranked = rankCandidates(stored, candidates, storedContext);

			expect(ranked.length).toBe(1);
			expect(ranked[0].score).toBeCloseTo(1.0);
			expect(ranked[0].confidence).toBe("HIGH");
		});
	});
});
