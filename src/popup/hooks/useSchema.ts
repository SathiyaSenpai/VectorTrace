import { useCallback, useEffect, useState } from "react";
import {
	getAllSchemas,
	saveSchema,
	deleteSchema as storageDeleteSchema,
	updateSchemaField,
} from "../../shared/chrome-storage";
import type { FieldDefinition, MessageType, Schema } from "../../shared/types";
import { matchUrl } from "../../shared/url-matcher";

export function useSchema() {
	const [schema, setSchema] = useState<Schema | null>(null);
	const [matchingSchemas, setMatchingSchemas] = useState<Schema[]>([]);
	const [url, setUrl] = useState<string>("");
	const [loading, setLoading] = useState<boolean>(true);
	const [lastAddedFieldId, setLastAddedFieldId] = useState<string | null>(null);
	const [isPickerActive, setIsPickerActive] = useState<boolean>(false);

	const loadSchema = useCallback(async (currentUrl: string, selectSchemaId?: string) => {
		if (!currentUrl) return;
		setLoading(true);
		try {
			const allSchemas = await getAllSchemas();
			const matched = allSchemas.filter((s) => matchUrl(s.url, s.urlPattern, currentUrl));
			setMatchingSchemas(matched);

			if (selectSchemaId) {
				const found = matched.find((s) => s.schemaId === selectSchemaId);
				setSchema(found || matched[0] || null);
			} else {
				setSchema((prev) => {
					if (prev) {
						const found = matched.find((s) => s.schemaId === prev.schemaId);
						if (found) return found;
					}
					return matched[0] || null;
				});
			}
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

	// Check picker state in the content script on mount
	useEffect(() => {
		const checkPickerStatus = async () => {
			try {
				const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
				if (tab?.id) {
					chrome.tabs.sendMessage(tab.id, { type: "GET_PICKER_STATUS" }, (response) => {
						if (response?.isActive) {
							setIsPickerActive(true);
						}
					});
				}
			} catch (_err) {
				// Content script not yet loaded or doesn't support the message
			}
		};
		checkPickerStatus();
	}, []);

	// Track the "NEW" badge duration across extension reopenings
	useEffect(() => {
		let isMounted = true;
		chrome.storage.local.get(["lastAddedFieldId", "lastAddedFieldTime"], (data) => {
			if (!isMounted) return;
			if (data.lastAddedFieldId && data.lastAddedFieldTime) {
				const elapsed = Date.now() - data.lastAddedFieldTime;
				const duration = 15000; // Keep badge visible for 15 seconds
				if (elapsed < duration) {
					setLastAddedFieldId(data.lastAddedFieldId);
					const remaining = duration - elapsed;
					const timer = setTimeout(() => {
						if (isMounted) {
							setLastAddedFieldId(null);
							chrome.storage.local.remove(["lastAddedFieldId", "lastAddedFieldTime"]);
						}
					}, remaining);
					return () => clearTimeout(timer);
				} else {
					chrome.storage.local.remove(["lastAddedFieldId", "lastAddedFieldTime"]);
				}
			}
		});
		return () => {
			isMounted = false;
		};
	}, []);

	// Listen for FIELD_SELECTED messages to refresh the schema state
	useEffect(() => {
		if (!url) return;

		const messageListener = (message: MessageType) => {
			if (message.type === "FIELD_SELECTED") {
				// Delay slightly to ensure background database writes complete
				setTimeout(async () => {
					await loadSchema(url, schema?.schemaId);
				}, 600);
			} else if (message.type === "PICKER_CANCELLED") {
				setIsPickerActive(false);
			}
		};

		chrome.runtime.onMessage.addListener(messageListener);
		return () => {
			chrome.runtime.onMessage.removeListener(messageListener);
		};
	}, [url, loadSchema, schema?.schemaId]);

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
		await loadSchema(url, newSchema.schemaId);
	};

	const deleteSchema = async () => {
		if (!schema) return;
		await storageDeleteSchema(schema.schemaId);

		// Clean up fields in IndexedDB as well
		const { deleteFieldsBySchema } = await import("../../shared/idb-store");
		await deleteFieldsBySchema(schema.schemaId);

		await loadSchema(url);
	};

	const updateSchemaName = async (name: string) => {
		if (!schema) return;
		const updatedSchema: Schema = {
			...schema,
			name: name.trim() || "Untitled Schema",
			updatedAt: Date.now(),
		};
		await saveSchema(updatedSchema);
		await loadSchema(url, schema.schemaId);
	};

	const updateFieldLabel = async (fieldId: string, label: string) => {
		if (!schema) return;
		await updateSchemaField(schema.schemaId, fieldId, { label: label.trim() });
		await loadSchema(url, schema.schemaId);
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

		await loadSchema(url, schema.schemaId);
	};

	const reorderFields = async (orderedFields: FieldDefinition[]) => {
		if (!schema) return;
		const updatedSchema: Schema = {
			...schema,
			fields: orderedFields,
			updatedAt: Date.now(),
		};
		await saveSchema(updatedSchema);
		await loadSchema(url, schema.schemaId);
	};

	const selectSchema = useCallback(
		async (schemaId: string) => {
			await loadSchema(url, schemaId);
		},
		[url, loadSchema],
	);

	const isRestricted =
		url.startsWith("chrome://") ||
		url.startsWith("chrome-extension://") ||
		url.startsWith("about:") ||
		url.startsWith("devtools://") ||
		url.startsWith("edge://") ||
		url.startsWith("view-source:");

	return {
		schema,
		matchingSchemas,
		url,
		loading,
		isRestricted,
		createSchema,
		deleteSchema,
		updateSchemaName,
		updateFieldLabel,
		removeField,
		reorderFields,
		selectSchema,
		lastAddedFieldId,
		isPickerActive,
		setIsPickerActive,
		reloadSchema: () => loadSchema(url, schema?.schemaId),
	};
}
