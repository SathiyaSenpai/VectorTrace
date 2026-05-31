/**
 * Typed accessors for user-configurable extension settings stored in
 * `chrome.storage.local`. Centralizing these keeps reads/writes consistent and
 * provides sensible defaults when a value has never been set.
 */

/** User settings that influence the self-healing behaviour. */
export type HealingSettings = {
	/** When true, the popup auto-applies the best candidate after extraction. */
	autoHeal: boolean;
	/** Minimum cosine-similarity confidence (0-1) required to auto-apply a candidate. */
	confidenceThreshold: number;
};

const DEFAULT_HEALING_SETTINGS: HealingSettings = {
	autoHeal: false,
	confidenceThreshold: 0.7,
};

/**
 * Reads the current healing settings, falling back to defaults for missing values.
 *
 * @returns A promise resolving to the resolved {@link HealingSettings}.
 */
export async function getHealingSettings(): Promise<HealingSettings> {
	try {
		const data = await chrome.storage.local.get(["autoHeal", "confidenceThreshold"]);
		return {
			autoHeal:
				typeof data.autoHeal === "boolean" ? data.autoHeal : DEFAULT_HEALING_SETTINGS.autoHeal,
			confidenceThreshold:
				typeof data.confidenceThreshold === "number"
					? data.confidenceThreshold
					: DEFAULT_HEALING_SETTINGS.confidenceThreshold,
		};
	} catch (err) {
		console.error("[settings] Failed to read healing settings:", err);
		return { ...DEFAULT_HEALING_SETTINGS };
	}
}
