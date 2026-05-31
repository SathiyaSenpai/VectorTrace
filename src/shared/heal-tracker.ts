const PENDING_HEALS_KEY = "vt_pending_heals";

export type PendingHeal = {
	fieldId: string;
	healedFrom: string;
	healedTo: string;
	timestamp: number;
};

type PendingHealMap = Record<string, PendingHeal>;

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
