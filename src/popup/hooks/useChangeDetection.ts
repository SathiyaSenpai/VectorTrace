import { useCallback, useState } from "react";
import { getSchema, updateSchemaField } from "../../shared/chrome-storage";
import { recordPendingHeal } from "../../shared/heal-tracker";
import type { MessageType, SimilarityCandidate } from "../../shared/types";

export function useChangeDetection(schemaId: string | undefined, onSchemaUpdated?: () => void) {
	const [candidates, setCandidates] = useState<SimilarityCandidate[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [progress, setProgress] = useState({ current: 0, total: 0 });

	const findCandidates = useCallback(
		async (fieldId: string) => {
			if (!schemaId) return;
			setIsSearching(true);
			setCandidates([]);
			setProgress({ current: 0, total: 0 });

			// Set up listener for batch embedding generation progress
			const progressListener = (message: MessageType) => {
				if (message.type === "SEARCH_PROGRESS") {
					setProgress({
						current: message.current,
						total: message.total,
					});
				}
			};
			chrome.runtime.onMessage.addListener(progressListener);

			try {
				console.log(`[useChangeDetection] Starting candidate search for field: ${fieldId}...`);
				const response = await chrome.runtime.sendMessage({
					type: "FIND_CANDIDATES",
					fieldId,
					schemaId,
				});

				if (response?.error) {
					throw new Error(response.error);
				}

				if (response?.candidates) {
					setCandidates(response.candidates as SimilarityCandidate[]);
				}
			} catch (err) {
				console.error("[useChangeDetection] Error finding candidates:", err);
				throw err;
			} finally {
				chrome.runtime.onMessage.removeListener(progressListener);
				setIsSearching(false);
			}
		},
		[schemaId],
	);

	const acceptCandidate = useCallback(
		async (fieldId: string, candidate: SimilarityCandidate) => {
			if (!schemaId) return;
			try {
				console.log(`[useChangeDetection] Accepting candidate for field ${fieldId}:`, candidate);

				// 0. Capture the field's current (broken) selector before we overwrite it,
				//    so the upcoming re-extraction can report a precise from -> to heal.
				let previousSelector = "";
				try {
					const schema = await getSchema(schemaId);
					const existingField = schema?.fields.find((f) => f.fieldId === fieldId);
					previousSelector = existingField?.cssSelector || "";
				} catch (lookupErr) {
					console.warn(
						"[useChangeDetection] Could not read previous selector for heal record:",
						lookupErr,
					);
				}

				// 1. Generate embedding for the new text content in background
				const response = await chrome.runtime.sendMessage({
					type: "GENERATE_EMBEDDING",
					text: candidate.textContent,
				});

				const embedding = response?.embedding;
				if (!embedding) {
					throw new Error("Failed to generate embedding for the accepted candidate text");
				}

				// 2. Update schema local storage (and IndexedDB via updateSchemaField hook)
				await updateSchemaField(schemaId, fieldId, {
					cssSelector: candidate.cssSelector,
					xpathSelector: candidate.xpathSelector,
					textContent: candidate.textContent,
					embedding,
				});

				// 3. Record the heal so the next extraction flags this field as HEALED.
				await recordPendingHeal(fieldId, previousSelector, candidate.cssSelector);

				console.log("[useChangeDetection] Candidate successfully accepted and storage updated.");

				if (onSchemaUpdated) {
					onSchemaUpdated();
				}
			} catch (err) {
				console.error("[useChangeDetection] Error accepting candidate:", err);
				throw err;
			}
		},
		[schemaId, onSchemaUpdated],
	);

	return {
		candidates,
		isSearching,
		progress,
		findCandidates,
		acceptCandidate,
	};
}
