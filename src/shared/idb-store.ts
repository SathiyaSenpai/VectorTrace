import { type IDBPDatabase, openDB } from "idb";
import type { FieldDefinition } from "./types";

const DB_NAME = "vectortrace-db";
const DB_VERSION = 1;

let dbInstance: IDBPDatabase | null = null;

/**
 * Lazy-initializes and retrieves the IndexedDB connection instance.
 * If the database or object store is not yet initialized, creates them during the upgrade hook.
 *
 * @returns A promise resolving to the IDBPDatabase instance.
 */
export async function getDB(): Promise<IDBPDatabase> {
	if (dbInstance) return dbInstance;

	dbInstance = await openDB(DB_NAME, DB_VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains("embeddings")) {
				const store = db.createObjectStore("embeddings", {
					keyPath: "fieldId",
				});
				// Create indices to facilitate search and cleanups
				store.createIndex("by-schema", "schemaId", { unique: false });
				store.createIndex("by-url", "url", { unique: false });
				store.createIndex("by-timestamp", "timestamp", { unique: false });
			}
		},
	});

	return dbInstance;
}

/**
 * Saves a field definition containing the generated text embedding to the IndexedDB store.
 *
 * @param field - The complete FieldDefinition object to save.
 */
export async function saveFieldEmbedding(field: FieldDefinition): Promise<void> {
	const db = await getDB();
	await db.put("embeddings", field);
}

/**
 * Retrieves a single field definition from the IndexedDB store by its field ID.
 *
 * @param fieldId - The unique identifier of the field.
 * @returns A promise resolving to the FieldDefinition or undefined if not found.
 */
export async function getFieldEmbedding(fieldId: string): Promise<FieldDefinition | undefined> {
	const db = await getDB();
	return await db.get("embeddings", fieldId);
}

/**
 * Retrieves all field definitions associated with a specific schema ID.
 * Uses the 'by-schema' index for fast querying.
 *
 * @param schemaId - The unique parent schema ID.
 * @returns A promise resolving to an array of FieldDefinition objects.
 */
export async function getFieldsBySchema(schemaId: string): Promise<FieldDefinition[]> {
	const db = await getDB();
	return await db.getAllFromIndex("embeddings", "by-schema", schemaId);
}

/**
 * Deletes a single field embedding record from IndexedDB by its field ID.
 *
 * @param fieldId - The unique field identifier to delete.
 */
export async function deleteFieldEmbedding(fieldId: string): Promise<void> {
	const db = await getDB();
	await db.delete("embeddings", fieldId);
}

/**
 * Deletes all field definitions and their associated embeddings matching a specific schema ID.
 *
 * @param schemaId - The unique schema ID whose fields should be deleted.
 */
export async function deleteFieldsBySchema(schemaId: string): Promise<void> {
	const db = await getDB();
	const fields = await getFieldsBySchema(schemaId);
	const tx = db.transaction("embeddings", "readwrite");
	for (const field of fields) {
		await tx.store.delete(field.fieldId);
	}
	await tx.done;
}

/**
 * Retrieves all records from the 'embeddings' store. Primarily intended for debugging, export, or reporting purposes.
 *
 * @returns A promise resolving to all FieldDefinition objects currently in store.
 */
export async function getAllEmbeddings(): Promise<FieldDefinition[]> {
	const db = await getDB();
	return await db.getAll("embeddings");
}
