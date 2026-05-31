import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	deleteSchema,
	getAllSchemas,
	getSchema,
	saveSchema,
	updateSchemaField,
} from "./chrome-storage";
import type { Schema } from "./types";

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

describe("chrome-storage wrapper", () => {
	beforeEach(() => {
		// Clear mock storage
		for (const key of Object.keys(mockStorage)) {
			delete mockStorage[key];
		}
		vi.clearAllMocks();
	});

	const mockSchema: Schema = {
		schemaId: "test-schema-id",
		name: "Test Schema",
		url: "https://example.com",
		fields: [
			{
				fieldId: "field-1",
				schemaId: "test-schema-id",
				label: "Title",
				url: "https://example.com",
				cssSelector: "h1",
				xpathSelector: "//h1",
				textContent: "Hello",
				embedding: [0.1, 0.2, 0.3],
				timestamp: 123456789,
			},
		],
		createdAt: 123456789,
		updatedAt: 123456789,
	};

	it("should save and retrieve a schema correctly", async () => {
		await saveSchema(mockSchema);
		expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);

		const retrieved = await getSchema("test-schema-id");
		const expectedSchema = {
			...mockSchema,
			fields: mockSchema.fields.map((f) => ({ ...f, embedding: [] })),
		};
		expect(retrieved).toEqual(expectedSchema);
	});

	it("should return null if schema is not found", async () => {
		const retrieved = await getSchema("non-existent");
		expect(retrieved).toBeNull();
	});

	it("should get all schemas correctly", async () => {
		await saveSchema(mockSchema);
		const secondSchema: Schema = {
			...mockSchema,
			schemaId: "second-schema-id",
			name: "Second Schema",
		};
		await saveSchema(secondSchema);

		// Add unrelated storage key
		await chrome.storage.local.set({ unrelated_key: "some-data" });

		const schemas = await getAllSchemas();
		expect(schemas).toHaveLength(2);
		const expectedFirst = {
			...mockSchema,
			fields: mockSchema.fields.map((f) => ({ ...f, embedding: [] })),
		};
		const expectedSecond = {
			...secondSchema,
			fields: secondSchema.fields.map((f) => ({ ...f, embedding: [] })),
		};
		expect(schemas).toContainEqual(expectedFirst);
		expect(schemas).toContainEqual(expectedSecond);
	});

	it("should delete a schema correctly", async () => {
		await saveSchema(mockSchema);
		await deleteSchema("test-schema-id");
		const retrieved = await getSchema("test-schema-id");
		expect(retrieved).toBeNull();
	});

	it("should update a schema field correctly", async () => {
		await saveSchema(mockSchema);
		const timestampBefore = mockSchema.updatedAt;

		await updateSchemaField("test-schema-id", "field-1", {
			textContent: "Updated Hello",
			cssSelector: "h2",
		});

		const updated = await getSchema("test-schema-id");
		expect(updated).not.toBeNull();
		expect(updated?.fields[0].textContent).toBe("Updated Hello");
		expect(updated?.fields[0].cssSelector).toBe("h2");
		expect(updated?.fields[0].xpathSelector).toBe("//h1");
		expect(updated?.updatedAt).toBeGreaterThanOrEqual(timestampBefore);
	});

	it("should throw error when updating a field in non-existent schema", async () => {
		await expect(
			updateSchemaField("non-existent", "field-1", { textContent: "test" }),
		).rejects.toThrow("Schema with ID non-existent not found");
	});

	it("should throw error when updating non-existent field in schema", async () => {
		await saveSchema(mockSchema);
		await expect(
			updateSchemaField("test-schema-id", "non-existent-field", {
				textContent: "test",
			}),
		).rejects.toThrow("Field with ID non-existent-field not found");
	});
});
