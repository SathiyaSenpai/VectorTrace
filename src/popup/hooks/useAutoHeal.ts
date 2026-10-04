import { useCallback } from "react";
import { getSchema, updateSchemaField } from "../../shared/chrome-storage";
import { recordPendingHeal } from "../../shared/heal-tracker";
import { getHealingSettings } from "../../shared/settings";
import type { ExtractionResult, SimilarityCandidate } from "../../shared/types";

const HEALABLE_STATUSES = new Set(["SELECTOR_BROKEN", "TEXT_CONTENT_CHANGED", "TAG_CHANGED"]);

export type AutoHealResult = {
	healed: boolean;
	healedCount: number;
	skippedCount: number;
};

export function useAutoHeal(schemaId: string | undefined) {
	const attemptAutoHeal = useCallback(
		async (result: ExtractionResult): Promise<AutoHealResult> => {
			const summary: AutoHealResult = { healed: false, healedCount: 0, skippedCount: 0 };
			if (!schemaId) return summary;

			const settings = await getHealingSettings();
			if (!settings.autoHeal) return summary;

			const brokenFields = result.fields.filter((f) => HEALABLE_STATUSES.has(f.status));
			if (brokenFields.length === 0) return summary;

			console.log(
				`[autoheal] Auto-heal enabled. Attempting to repair ${brokenFields.length} field(s) at >= ${Math.round(
					settings.confidenceThreshold * 100,
				)}% confidence.`,
			);

			for (const field of brokenFields) {
				try {
					const response = (await chrome.runtime.sendMessage({
						type: "FIND_CANDIDATES",
						fieldId: field.fieldId,
						schemaId,
					})) as { error?: string; candidates?: SimilarityCandidate[] } | undefined;

					if (response?.error) {
						console.warn(
							`[autoheal] Candidate search failed for ${field.fieldId}:`,
							response.error,
						);
						summary.skippedCount++;
						continue;
					}

					const best = response?.candidates?.[0];
					if (!best || best.score < settings.confidenceThreshold) {
						console.log(
							`[autoheal] No candidate cleared threshold for "${field.label || field.fieldId}".`,
						);
						summary.skippedCount++;
						continue;
					}

					let previousSelector = "";
					const schema = await getSchema(schemaId);
					previousSelector =
						schema?.fields.find((f) => f.fieldId === field.fieldId)?.cssSelector || "";

					const embedResponse = (await chrome.runtime.sendMessage({
						type: "GENERATE_EMBEDDING",
						text: best.textContent,
					})) as { embedding?: number[]; error?: string } | undefined;

					if (!embedResponse?.embedding) {
						console.warn(`[autoheal] Failed to embed candidate text for ${field.fieldId}.`);
						summary.skippedCount++;
						continue;
					}

					await updateSchemaField(schemaId, field.fieldId, {
						cssSelector: best.cssSelector,
						xpathSelector: best.xpathSelector,
						textContent: best.textContent,
						tagName: best.tagName,
						depth: best.depth,
						isLeaf: best.isLeaf,
						ancestorContext: best.ancestorContext,
						embedding: embedResponse.embedding,
					});

					await recordPendingHeal(field.fieldId, previousSelector, best.cssSelector);

					summary.healedCount++;
					console.log(
						`[autoheal] Auto-healed "${field.label || field.fieldId}" at ${Math.round(
							best.score * 100,
						)}% confidence.`,
					);
				} catch (err) {
					console.error(`[autoheal] Error auto-healing field ${field.fieldId}:`, err);
					summary.skippedCount++;
				}
			}

			summary.healed = summary.healedCount > 0;
			return summary;
		},
		[schemaId],
	);

	return { attemptAutoHeal };
}
