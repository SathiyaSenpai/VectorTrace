import { useCallback, useEffect, useState } from "react";
import {
	getAllSchemas,
	saveSchema,
	deleteSchema as storageDeleteSchema,
	updateSchemaField,
} from "../../shared/chrome-storage";
import type { FieldDefinition, MessageType, Schema } from "../../shared/types";

export function useSchema() {
	const [schema, setSchema] = useState<Schema | null>(null);
	const [url, setUrl] = useState<string>("");
	const [loading, setLoading] = useState<boolean>(true);
	const [lastAddedFieldId, setLastAddedFieldId] = useState<string | null>(null);
	const [isPickerActive, setIsPickerActive] = useState<boolean>(false);

	const loadSchema = useCallback(async (currentUrl: string) => {
		if (!currentUrl) return;
		setLoading(true);
		try {
			const allSchemas = await getAllSchemas();
			const found = allSchemas.find((s) => s.url === currentUrl);
			setSchema(found || null);
		} catch (err) {
			console.error("Failed to load schema:", err);
		} finally {
			setLoading(false);
		}
	}, []);

	// Synchronize URL and Schema on mount
	useEffect(() => {
		let active = true;

		const init = async () => {
			try {
				const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
				const tabUrl = tab?.url || "";
				if (active) {
					setUrl(tabUrl);
					await loadSchema(tabUrl);
				}
			} catch (err) {
				console.error("Failed to query active tab:", err);
				if (active) setLoading(false);
			}
		};

		init();

		return () => {
			active = false;
		};
	}, [loadSchema]);

	// Listen for FIELD_SELECTED messages to refresh the schema state
	useEffect(() => {
		if (!url) return;

		const messageListener = (message: MessageType) => {
			if (message.type === "FIELD_SELECTED") {
				// Delay slightly to ensure background database writes complete
				setTimeout(async () => {
					await loadSchema(url);
					setLastAddedFieldId(message.field.fieldId);
					setTimeout(() => setLastAddedFieldId(null), 3000);
				}, 600);
			} else if (message.type === "PICKER_CANCELLED") {
				setIsPickerActive(false);
			}
		};

		chrome.runtime.onMessage.addListener(messageListener);
		return () => {
			chrome.runtime.onMessage.removeListener(messageListener);
		};
	}, [url, loadSchema]);

	const createSchema = async (name: string) => {
		if (!url) return;
		const newSchema: Schema = {
			schemaId: crypto.randomUUID(),
			name: name.trim() || "Untitled Schema",
			url,
			fields: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		await saveSchema(newSchema);
		setSchema(newSchema);
	};

	const deleteSchema = async () => {
		if (!schema) return;
		await storageDeleteSchema(schema.schemaId);

		// Clean up fields in IndexedDB as well
		const { deleteFieldsBySchema } = await import("../../shared/idb-store");
		await deleteFieldsBySchema(schema.schemaId);
		setSchema(null);
	};

	const updateSchemaName = async (name: string) => {
		if (!schema) return;
		const updatedSchema: Schema = {
			...schema,
			name: name.trim() || "Untitled Schema",
			updatedAt: Date.now(),
		};
		await saveSchema(updatedSchema);
		setSchema(updatedSchema);
	};

	const updateFieldLabel = async (fieldId: string, label: string) => {
		if (!schema) return;
		await updateSchemaField(schema.schemaId, fieldId, { label: label.trim() });

		// Map the state change locally to avoid layout shift
		setSchema((prev) => {
			if (!prev) return null;
			return {
				...prev,
				fields: prev.fields.map((f) => (f.fieldId === fieldId ? { ...f, label: label.trim() } : f)),
				updatedAt: Date.now(),
			};
		});
	};

	const removeField = async (fieldId: string) => {
		if (!schema) return;
		const updatedFields = schema.fields.filter((f) => f.fieldId !== fieldId);
		const updatedSchema: Schema = {
			...schema,
			fields: updatedFields,
			updatedAt: Date.now(),
		};
		await saveSchema(updatedSchema);

		const { deleteFieldEmbedding } = await import("../../shared/idb-store");
		await deleteFieldEmbedding(fieldId);

		setSchema(updatedSchema);
	};

	const reorderFields = async (orderedFields: FieldDefinition[]) => {
		if (!schema) return;
		const updatedSchema: Schema = {
			...schema,
			fields: orderedFields,
			updatedAt: Date.now(),
		};
		await saveSchema(updatedSchema);
		setSchema(updatedSchema);
	};

	const isRestricted =
		url.startsWith("chrome://") ||
		url.startsWith("chrome-extension://") ||
		url.startsWith("about:") ||
		url.startsWith("devtools://") ||
		url.startsWith("edge://") ||
		url.startsWith("view-source:");

	return {
		schema,
		url,
		loading,
		isRestricted,
		createSchema,
		deleteSchema,
		updateSchemaName,
		updateFieldLabel,
		removeField,
		reorderFields,
		lastAddedFieldId,
		isPickerActive,
		setIsPickerActive,
		reloadSchema: () => loadSchema(url),
	};
}
