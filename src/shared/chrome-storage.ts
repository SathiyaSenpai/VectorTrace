import type { FieldDefinition, Schema } from "./types";

/**
 * Saves a schema to chrome.storage.local under the key "schema_{schemaId}".
 *
 * @param schema - The schema object to save.
 * @returns A promise that resolves when the save operation is complete.
 * @throws Will log and re-throw any errors encountered during the operation.
 */
export async function saveSchema(schema: Schema): Promise<void> {
	// Store field metadata only (no full embedding data) in chrome.storage.local
	const strippedFields = schema.fields.map((field) => ({
		...field,
		embedding: [],
	}));
	const strippedSchema = {
		...schema,
		fields: strippedFields,
	};
	const key = `schema_${schema.schemaId}`;
	try {
		await chrome.storage.local.set({ [key]: strippedSchema });
	} catch (error) {
		console.error(`Error saving schema with ID ${schema.schemaId}:`, error);
		throw error;
	}
}

/**
 * Retrieves a schema from chrome.storage.local by its ID.
 *
 * @param schemaId - The unique identifier of the schema.
 * @returns A promise that resolves to the Schema object if found, or null if not found.
 * @throws Will log and re-throw any errors encountered during the operation.
 */
export async function getSchema(schemaId: string): Promise<Schema | null> {
	const key = `schema_${schemaId}`;
	try {
		const result = await chrome.storage.local.get(key);
		return (result[key] as Schema) ?? null;
	} catch (error) {
		console.error(`Error getting schema with ID ${schemaId}:`, error);
		throw error;
	}
}

/**
 * Retrieves all schemas from chrome.storage.local.
 * It fetches all keys and filters for those starting with "schema_".
 *
 * @returns A promise that resolves to an array of Schema objects.
 * @throws Will log and re-throw any errors encountered during the operation.
 */
export async function getAllSchemas(): Promise<Schema[]> {
	try {
		const allItems = await chrome.storage.local.get(null);
		const schemas: Schema[] = [];

		for (const key of Object.keys(allItems)) {
			if (key.startsWith("schema_")) {
				schemas.push(allItems[key] as Schema);
			}
		}

		return schemas;
	} catch (error) {
		console.error("Error getting all schemas:", error);
		throw error;
	}
}

/**
 * Deletes a schema from chrome.storage.local by its ID.
 *
 * @param schemaId - The unique identifier of the schema to delete.
 * @returns A promise that resolves when the delete operation is complete.
 * @throws Will log and re-throw any errors encountered during the operation.
 */
export async function deleteSchema(schemaId: string): Promise<void> {
	const key = `schema_${schemaId}`;
	try {
		await chrome.storage.local.remove(key);
	} catch (error) {
		console.error(`Error deleting schema with ID ${schemaId}:`, error);
		throw error;
	}
}

/**
 * Updates a single field within an existing schema in chrome.storage.local.
 *
 * @param schemaId - The unique identifier of the parent schema.
 * @param fieldId - The unique identifier of the field to update.
 * @param updates - A partial FieldDefinition object containing the fields to update.
 * @returns A promise that resolves when the update and save operations are complete.
 * @throws Will log and re-throw any errors encountered if the schema/field is missing or during storage operations.
 */
export async function updateSchemaField(
	schemaId: string,
	fieldId: string,
	updates: Partial<FieldDefinition>,
): Promise<void> {
	try {
		const schema = await getSchema(schemaId);
		if (!schema) {
			throw new Error(`Schema with ID ${schemaId} not found`);
		}

		const fieldIndex = schema.fields.findIndex((f) => f.fieldId === fieldId);
		if (fieldIndex === -1) {
			throw new Error(`Field with ID ${fieldId} not found in schema ${schemaId}`);
		}

		schema.fields[fieldIndex] = {
			...schema.fields[fieldIndex],
			...updates,
		};
		schema.updatedAt = Date.now();

		await saveSchema(schema);
	} catch (error) {
		console.error(`Error updating field ${fieldId} in schema ${schemaId}:`, error);
		throw error;
	}
}
