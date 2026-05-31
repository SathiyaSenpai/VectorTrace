import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumePendingHeals, recordPendingHeal } from "./heal-tracker";

const mockStorage: Record<string, unknown> = {};

(globalThis as typeof globalThis & { chrome: typeof chrome }).chrome = {
	storage: {
		local: {
			get: vi.fn().mockImplementation((keys) => {
				if (keys === null) {
					return Promise.resolve(mockStorage);
				}
				if (typeof keys === "string") {
					return Promise.resolve({ [keys]: mockStorage[keys] });
				}
				if (Array.isArray(keys)) {
					const res: Record<string, unknown> = {};
					for (const k of keys) {
						res[k] = mockStorage[k];
					}
					return Promise.resolve(res);
				}
				return Promise.resolve({});
			}),
			set: vi.fn().mockImplementation((items) => {
				for (const [k, v] of Object.entries(items)) {
					mockStorage[k] = v;
				}
				return Promise.resolve();
			}),
			remove: vi.fn().mockImplementation((keys) => {
				if (typeof keys === "string") {
					delete mockStorage[keys];
				} else if (Array.isArray(keys)) {
					for (const k of keys) {
						delete mockStorage[k];
					}
				}
				return Promise.resolve();
			}),
		},
	},
} as unknown as typeof chrome;

describe("heal-tracker", () => {
	beforeEach(() => {
		for (const key of Object.keys(mockStorage)) {
			delete mockStorage[key];
		}
		vi.clearAllMocks();
	});

	it("records a pending heal and consumes it exactly once", async () => {
		await recordPendingHeal("field-1", ".old-selector", ".new-selector");

		const consumed = await consumePendingHeals(["field-1"]);
		expect(consumed["field-1"]).toBeDefined();
		expect(consumed["field-1"].healedFrom).toBe(".old-selector");
		expect(consumed["field-1"].healedTo).toBe(".new-selector");

		// Second consume should return nothing — it was already cleared.
		const consumedAgain = await consumePendingHeals(["field-1"]);
		expect(consumedAgain["field-1"]).toBeUndefined();
	});

	it("only consumes the requested field IDs and leaves others intact", async () => {
		await recordPendingHeal("field-1", ".a", ".b");
		await recordPendingHeal("field-2", ".c", ".d");

		const consumed = await consumePendingHeals(["field-1"]);
		expect(consumed["field-1"]).toBeDefined();
		expect(consumed["field-2"]).toBeUndefined();

		// field-2 should still be present for a later consume.
		const remaining = await consumePendingHeals(["field-2"]);
		expect(remaining["field-2"]).toBeDefined();
		expect(remaining["field-2"].healedTo).toBe(".d");
	});

	it("returns an empty map when there are no pending heals", async () => {
		const consumed = await consumePendingHeals(["unknown-field"]);
		expect(consumed).toEqual({});
	});
});
