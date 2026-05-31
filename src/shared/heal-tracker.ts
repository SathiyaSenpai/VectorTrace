/**
 * Heal tracking utilities.
 *
 * When the user accepts a healing candidate we update the field's selector, but the
 * subsequent re-extraction runs in the content script and has no inherent knowledge
 * that a heal just occurred. To bridge that gap we persist a short-lived "pending heal"
 * record (old selector -> new selector, keyed by fieldId) in `chrome.storage.local`.
 * The next extraction reads these records, stamps the affected fields with the
 * `HEALED` status (including `healedFrom`/`healedTo`), and then consumes them so the
 * badge only shows for the run immediately following the heal.
 */

const PENDING_HEALS_KEY = "vt_pending_heals";

/** A single recorded heal: which selector broke and what replaced it. */
export type PendingHeal = {
	fieldId: string;
	healedFrom: string;
	healedTo: string;
	timestamp: number;
};

type PendingHealMap = Record<string, PendingHeal>;

/**
 * Reads the current map of pending heals from local storage.
 *
 * @returns A promise resolving to the fieldId-keyed map of pending heals (empty if none).
 */
async function readPendingHeals(): Promise<PendingHealMap> {
	try {
		const data = await chrome.storage.local.get(PENDING_HEALS_KEY);
		const raw = data[PENDING_HEALS_KEY];
		if (raw && typeof raw === "object") {
			return raw as PendingHealMap;
		}
	} catch (err) {
		console.error("[heal-tracker] Failed to read pending heals:", err);
	}
	return {};
}

/**
 * Records that a field's selector was healed, so the next extraction can flag it as `HEALED`.
 *
 * @param fieldId - The unique identifier of the healed field.
 * @param healedFrom - The previous (broken) CSS selector.
 * @param healedTo - The new CSS selector that replaced it.
 * @returns A promise that resolves once the record has been persisted.
 */
export async function recordPendingHeal(
	fieldId: string,
	healedFrom: string,
	healedTo: string,
): Promise<void> {
	try {
		const heals = await readPendingHeals();
		heals[fieldId] = {
			fieldId,
			healedFrom,
			healedTo,
			timestamp: Date.now(),
		};
		await chrome.storage.local.set({ [PENDING_HEALS_KEY]: heals });
	} catch (err) {
		console.error("[heal-tracker] Failed to record pending heal:", err);
	}
}

/**
 * Consumes (reads and then clears) the pending heals for the supplied field IDs.
 * Any field IDs not present in the map are simply ignored.
 *
 * @param fieldIds - The field identifiers to look up and consume.
 * @returns A promise resolving to the consumed pending heals, keyed by fieldId.
 */
export async function consumePendingHeals(fieldIds: string[]): Promise<PendingHealMap> {
	try {
		const heals = await readPendingHeals();
		const consumed: PendingHealMap = {};
		let mutated = false;

		for (const fieldId of fieldIds) {
			if (heals[fieldId]) {
				consumed[fieldId] = heals[fieldId];
				delete heals[fieldId];
				mutated = true;
			}
		}

		if (mutated) {
			await chrome.storage.local.set({ [PENDING_HEALS_KEY]: heals });
		}

		return consumed;
	} catch (err) {
		console.error("[heal-tracker] Failed to consume pending heals:", err);
		return {};
	}
}
