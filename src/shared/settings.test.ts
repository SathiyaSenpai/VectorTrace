import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHealingSettings } from "./settings";

const mockStorage: Record<string, unknown> = {};

(globalThis as typeof globalThis & { chrome: typeof chrome }).chrome = {
	storage: {
		local: {
			get: vi.fn().mockImplementation((keys) => {
				if (Array.isArray(keys)) {
					const res: Record<string, unknown> = {};
					for (const k of keys) {
						res[k] = mockStorage[k];
					}
					return Promise.resolve(res);
				}
				return Promise.resolve({});
			}),
		},
	},
} as unknown as typeof chrome;

describe("settings", () => {
	beforeEach(() => {
		for (const key of Object.keys(mockStorage)) {
			delete mockStorage[key];
		}
		vi.clearAllMocks();
	});

	it("returns sensible defaults when nothing is stored", async () => {
		const settings = await getHealingSettings();
		expect(settings.autoHeal).toBe(false);
		expect(settings.confidenceThreshold).toBe(0.7);
	});

	it("returns stored values when present", async () => {
		mockStorage.autoHeal = true;
		mockStorage.confidenceThreshold = 0.85;

		const settings = await getHealingSettings();
		expect(settings.autoHeal).toBe(true);
		expect(settings.confidenceThreshold).toBe(0.85);
	});

	it("ignores malformed stored values and falls back to defaults", async () => {
		mockStorage.autoHeal = "yes"; // wrong type
		mockStorage.confidenceThreshold = "high"; // wrong type

		const settings = await getHealingSettings();
		expect(settings.autoHeal).toBe(false);
		expect(settings.confidenceThreshold).toBe(0.7);
	});
});
