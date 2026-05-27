import { useCallback, useEffect, useRef, useState } from "react";
import type { ExtractionResult, FieldDefinition, Schema } from "../../shared/types";
import { sendMessageWithRetry } from "../utils/messaging";
import { FieldCard } from "./FieldCard";

interface SchemaEditorProps {
	schema: Schema | null;
	url: string;
	createSchema: (name: string) => Promise<void>;
	deleteSchema: () => Promise<void>;
	updateSchemaName: (name: string) => Promise<void>;
	updateFieldLabel: (fieldId: string, label: string) => Promise<void>;
	removeField: (fieldId: string) => Promise<void>;
	reorderFields: (fields: FieldDefinition[]) => Promise<void>;
	lastAddedFieldId: string | null;
	isPickerActive: boolean;
	setIsPickerActive: (active: boolean) => void;
	extractionResult: ExtractionResult | null;
	setExtractionResult: (res: ExtractionResult | null) => void;
	onShowResults: () => void;
	theme?: "dark" | "sakura";
	onExtract?: () => Promise<void>;
}

export function SchemaEditor({
	schema,
	url,
	createSchema,
	deleteSchema,
	updateSchemaName,
	updateFieldLabel,
	removeField,
	reorderFields,
	lastAddedFieldId,
	isPickerActive,
	setIsPickerActive,
	extractionResult,
	setExtractionResult,
	onShowResults,
	theme = "dark",
	onExtract,
}: SchemaEditorProps) {
	const [schemaNameText, setSchemaNameText] = useState(schema?.name || "");
	const [isEditingName, setIsEditingName] = useState(false);
	const [newSchemaName, setNewSchemaName] = useState("");
	const [statusMessage, setStatusMessage] = useState("");
	// ── Pointer-based Drag & Drop ───────────────────────────────────────────────
	const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
	const fieldsListRef = useRef<HTMLUListElement>(null);
	const [localFields, setLocalFields] = useState<FieldDefinition[]>(schema?.fields || []);
	const localFieldsRef = useRef(localFields);

	useEffect(() => {
		localFieldsRef.current = localFields;
	}, [localFields]);

	// Internal refs that don't need to cause re-renders
	const dragState = useRef<{
		active: boolean;
		fieldId: string;
		fieldIndex: number;
		currentY: number;
	} | null>(null);

	useEffect(() => {
		if (schema?.fields) {
			setLocalFields(schema.fields);
		}
	}, [schema?.fields]);

	const dragScrollLoop = useRef<number | null>(null);

	// Recompute target slot based on current pointer Y, accounting for scroll position and scrollDelta
	const computeTargetIndex = useCallback((clientY: number, scrollDelta: number) => {
		const list = fieldsListRef.current;
		if (!list) return -1;
		if (!dragState.current) return -1;

		const fromId = dragState.current.fieldId;
		const currentFields = localFieldsRef.current;
		const fromIndex = currentFields.findIndex((f) => f.fieldId === fromId);
		if (fromIndex === -1) return -1;

		// We only allow swapping with the immediate neighbor above or below
		// Check neighbor above:
		if (fromIndex > 0) {
			const neighborAboveId = currentFields[fromIndex - 1].fieldId;
			const neighborAbove = list.querySelector(
				`li[data-field-id="${neighborAboveId}"]`,
			) as HTMLElement;
			if (neighborAbove) {
				const rect = neighborAbove.getBoundingClientRect();
				// Shift midpoint by -scrollDelta to account for synchronous scrolling
				const mid = rect.top + rect.height / 2 - scrollDelta;
				if (clientY < mid) {
					return fromIndex - 1;
				}
			}
		}

		// Check neighbor below:
		if (fromIndex < currentFields.length - 1) {
			const neighborBelowId = currentFields[fromIndex + 1].fieldId;
			const neighborBelow = list.querySelector(
				`li[data-field-id="${neighborBelowId}"]`,
			) as HTMLElement;
			if (neighborBelow) {
				const rect = neighborBelow.getBoundingClientRect();
				// Shift midpoint by -scrollDelta to account for synchronous scrolling
				const mid = rect.top + rect.height / 2 - scrollDelta;
				if (clientY > mid) {
					return fromIndex + 1;
				}
			}
		}

		return fromIndex;
	}, []);

	// A function that is called continuously to handle scrolling and reordering
	const updateDragPosition = useCallback(() => {
		if (!dragState.current?.active) return;

		const list = fieldsListRef.current;
		if (list) {
			const rect = list.getBoundingClientRect();
			const y = dragState.current.currentY;
			const edgeZone = 40; // px zone at top/bottom of list
			const relY = y - rect.top;

			let scrollDelta = 0;
			if (relY < edgeZone) {
				// Scroll up - speed scales with drag distance outside boundary
				const intensity = Math.max(0, (edgeZone - relY) / edgeZone);
				scrollDelta = -Math.min(25, Math.round(intensity * 12));
			} else if (relY > rect.height - edgeZone) {
				// Scroll down - speed scales with drag distance outside boundary
				const intensity = Math.max(0, (relY - (rect.height - edgeZone)) / edgeZone);
				scrollDelta = Math.min(25, Math.round(intensity * 12));
			}

			if (scrollDelta !== 0) {
				list.scrollTop += scrollDelta;
			}

			// Recompute target slot
			const targetIndex = computeTargetIndex(y, scrollDelta);
			if (targetIndex >= 0) {
				setLocalFields((prev) => {
					const fromIndex = prev.findIndex((f) => f.fieldId === dragState.current?.fieldId);
					if (fromIndex === -1 || fromIndex === targetIndex) return prev;
					const next = [...prev];
					const [moved] = next.splice(fromIndex, 1);
					next.splice(targetIndex, 0, moved);
					localFieldsRef.current = next; // Update ref synchronously to prevent frame race conditions
					return next;
				});
			}
		}

		dragScrollLoop.current = requestAnimationFrame(updateDragPosition);
	}, [computeTargetIndex]);

	// Clean up animation frame loop on unmount
	useEffect(() => {
		return () => {
			if (dragScrollLoop.current !== null) {
				cancelAnimationFrame(dragScrollLoop.current);
			}
		};
	}, []);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent, fieldId: string, fieldIndex: number) => {
			// Only respond to primary button (left click)
			if (e.button !== 0) return;

			// Do not start drag if clicking interactive elements inside the card
			const target = e.target as HTMLElement;
			if (
				target.closest("button") ||
				target.closest("input") ||
				target.closest("select") ||
				target.closest("textarea") ||
				target.contentEditable === "true"
			) {
				return;
			}

			e.preventDefault();

			dragState.current = {
				active: true,
				fieldId,
				fieldIndex,
				currentY: e.clientY,
			};
			setDraggedFieldId(fieldId);

			if (dragScrollLoop.current === null) {
				dragScrollLoop.current = requestAnimationFrame(updateDragPosition);
			}
		},
		[updateDragPosition],
	);

	// Global pointer listeners to handle drag coordinates and release robustly
	useEffect(() => {
		if (!draggedFieldId) return;

		const handleGlobalPointerMove = (e: PointerEvent) => {
			if (dragState.current?.active) {
				dragState.current.currentY = e.clientY;
			}
		};

		const handleGlobalPointerUp = () => {
			if (!dragState.current?.active) return;
			if (dragScrollLoop.current !== null) {
				cancelAnimationFrame(dragScrollLoop.current);
				dragScrollLoop.current = null;
			}
			dragState.current = null;
			setDraggedFieldId(null);
			setLocalFields((current) => {
				reorderFields(current);
				return current;
			});
		};

		window.addEventListener("pointermove", handleGlobalPointerMove);
		window.addEventListener("pointerup", handleGlobalPointerUp);
		window.addEventListener("pointercancel", handleGlobalPointerUp);

		return () => {
			window.removeEventListener("pointermove", handleGlobalPointerMove);
			window.removeEventListener("pointerup", handleGlobalPointerUp);
			window.removeEventListener("pointercancel", handleGlobalPointerUp);
		};
	}, [draggedFieldId, reorderFields]);

	// Scroll wheel support while dragging
	useEffect(() => {
		const list = fieldsListRef.current;
		if (!list) return;
		const handleWheel = (e: WheelEvent) => {
			if (dragState.current?.active) {
				list.scrollTop += e.deltaY;
			}
		};
		list.addEventListener("wheel", handleWheel, { passive: true });
		return () => list.removeEventListener("wheel", handleWheel);
	}, []);

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		const name = newSchemaName.trim() || "Untitled Schema";
		await createSchema(name);
		setNewSchemaName("");
	};

	const handleSaveName = async () => {
		setIsEditingName(false);
		const name = schemaNameText.trim();
		if (name && name !== schema?.name) {
			await updateSchemaName(name);
		} else {
			setSchemaNameText(schema?.name || "");
		}
	};

	useEffect(() => {
		if (!isPickerActive && statusMessage === "Click an element on the page...") {
			setStatusMessage("");
		}
	}, [isPickerActive, statusMessage]);

	const handleAddField = async () => {
		if (!schema || isPickerActive) return;
		try {
			setIsPickerActive(true);
			setStatusMessage("Click an element on the page...");
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (tab?.id) {
				await sendMessageWithRetry(tab.id, {
					type: "START_SELECTION",
					schemaId: schema.schemaId,
				});
			}
		} catch (err) {
			console.error("Start selection failed:", err);
			setStatusMessage("Error starting picker");
			setIsPickerActive(false);
			setTimeout(() => setStatusMessage(""), 3000);
		}
	};

	const handleRunExtraction = async () => {
		if (!schema) return;
		if (onExtract) {
			try {
				await onExtract();
				onShowResults();
			} catch (err) {
				console.error("Run extraction failed:", err);
			}
			return;
		}

		try {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (tab?.id) {
				const response = (await sendMessageWithRetry(tab.id, {
					type: "RUN_EXTRACTION",
					schemaId: schema.schemaId,
				})) as { error?: string; result?: ExtractionResult } | undefined;
				if (response?.result) {
					setExtractionResult(response.result);
					onShowResults();
				}
			}
		} catch (err) {
			console.error("Run extraction failed:", err);
		}
	};

	// Theme Styles
	const isSakura = theme === "sakura";
	const mainBgClass = isSakura ? "bg-[#fff7f7] text-[#3a2d2d]" : "bg-gray-900 text-gray-100";
	const headerBarClass = isSakura
		? "bg-[#fae6e8] border-[#fbc5c5] text-[#8a7272]"
		: "bg-gray-950 border-gray-800 text-gray-400";
	const statusBadgeClass = isSakura
		? "text-[#d65b70] bg-[#fcdfe2]"
		: "text-blue-400 bg-blue-500/10";
	const emptyIconClass = isSakura
		? "bg-[#f68799]/10 text-[#f68799] border-[#f68799]/20"
		: "bg-blue-500/10 text-blue-400 border-blue-500/20";
	const inputClass = isSakura
		? "bg-white border-[#f5c2c8] focus:border-[#f68799] text-[#3a2d2d] placeholder-gray-400"
		: "bg-gray-800 border-gray-700 focus:border-blue-500 text-gray-100 placeholder-gray-500";
	const actionBtnClass = isSakura
		? "bg-[#f68799] hover:bg-[#e26275] text-white shadow-sm"
		: "bg-blue-600 hover:bg-blue-500 text-white shadow";
	const borderClass = isSakura ? "border-[#fbc5c5]" : "border-gray-800";
	const deleteSchemaBtnClass = isSakura
		? "text-[#8a7272] hover:text-red-500 bg-white border-[#f5c2c8]"
		: "text-gray-550 hover:text-red-500 bg-gray-800 border-gray-700/60";
	const addFieldBtnClass = isSakura
		? "bg-[#f68799] hover:bg-[#e26275] disabled:bg-gray-250/20 disabled:text-gray-400 text-white disabled:cursor-not-allowed"
		: "bg-blue-600 hover:bg-blue-500 disabled:bg-gray-850 disabled:text-gray-600 text-white disabled:cursor-not-allowed";
	const extractBtnClass = isSakura
		? "bg-[#798c73] hover:bg-[#687a63] disabled:bg-gray-250/20 disabled:text-gray-400 text-white disabled:cursor-not-allowed"
		: "bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-850 disabled:text-gray-600 text-white disabled:cursor-not-allowed";
	const headingTextHoverClass = isSakura
		? "text-[#3a2d2d] hover:text-[#f68799]"
		: "text-gray-100 hover:text-blue-400";
	const inputRenameClass = isSakura
		? "bg-white border-[#f68799] text-[#3a2d2d]"
		: "bg-gray-950 border-blue-500 text-gray-100";
	const subTextColor = isSakura ? "text-[#8a7272]" : "text-gray-500";

	return (
		<div
			className={`w-[380px] min-h-[400px] flex flex-col font-sans select-none transition-colors duration-300 ease-in-out ${mainBgClass}`}
		>
			{/* Header / URL bar */}
			<div
				className={`px-4 py-2 border-b flex items-center justify-between text-xs select-all transition-colors duration-300 ease-in-out ${headerBarClass}`}
			>
				<span className="truncate flex items-center gap-1.5 max-w-[280px]">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<title>Browser URL Icon</title>
						<circle cx="12" cy="12" r="10" />
						<line x1="2" y1="12" x2="22" y2="12" />
						<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
					</svg>
					{url}
				</span>
				{statusMessage && (
					<span
						className={`text-[10px] font-medium animate-pulse ml-2 flex-shrink-0 px-1.5 py-0.5 rounded ${statusBadgeClass}`}
					>
						{statusMessage}
					</span>
				)}
			</div>

			{!schema ? (
				/* CREATE SCHEMA VIEW */
				<div className="flex-1 flex flex-col justify-center items-center px-6 py-8 text-center gap-4">
					<div
						className={`w-12 h-12 rounded-full flex items-center justify-center border ${emptyIconClass}`}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<title>Add Icon</title>
							<path d="M12 5v14M5 12h14" />
						</svg>
					</div>
					<div>
						<h2 className="text-sm font-semibold">No Schema Configured</h2>
						<p className={`text-xs mt-1 max-w-[220px] leading-normal ${subTextColor}`}>
							Click 'Create Schema' to get started
						</p>
					</div>

					<form onSubmit={handleCreate} className="w-full flex flex-col gap-2 mt-2">
						<input
							type="text"
							placeholder="e.g., HackerNews Scraper"
							value={newSchemaName}
							onChange={(e) => setNewSchemaName(e.target.value)}
							className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none transition-colors ${inputClass}`}
						/>
						<button
							type="submit"
							className={`w-full font-semibold text-xs py-2 px-4 rounded-lg shadow transition duration-150 ease-in-out cursor-pointer ${actionBtnClass}`}
						>
							Create Schema
						</button>
					</form>
				</div>
			) : (
				/* SCHEMA DETAILS VIEW */
				<div className="flex-1 flex flex-col p-4 gap-4">
					{/* Inline Editable Schema Name & Delete Schema */}
					<div className={`flex items-center justify-between gap-3 border-b pb-3 ${borderClass}`}>
						<div className="flex-1 min-w-0">
							{isEditingName ? (
								<input
									type="text"
									value={schemaNameText}
									onChange={(e) => setSchemaNameText(e.target.value)}
									onBlur={handleSaveName}
									onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
									// biome-ignore lint/a11y/noAutofocus: Standard inline schema renaming behavior
									autoFocus
									className={`w-full border rounded px-2 py-1 text-sm focus:outline-none font-bold ${inputRenameClass}`}
								/>
							) : (
								<div className="flex items-center gap-2 w-full">
									<button
										type="button"
										onClick={() => {
											setSchemaNameText(schema.name);
											setIsEditingName(true);
										}}
										className={`text-base font-bold truncate cursor-pointer text-left block max-w-[220px] ${headingTextHoverClass}`}
										title="Click to rename schema"
									>
										{schema.name}
									</button>
									<button
										type="button"
										onClick={() => {
											setSchemaNameText(schema.name);
											setIsEditingName(true);
										}}
										className="text-gray-550 hover:text-gray-300 transition-colors flex-shrink-0"
										title="Rename Schema"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											<title>Rename Icon</title>
											<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
										</svg>
									</button>
								</div>
							)}
						</div>

						<button
							type="button"
							onClick={deleteSchema}
							className={`p-1.5 rounded border transition duration-150 ease-in-out flex-shrink-0 ${deleteSchemaBtnClass}`}
							title="Delete full schema"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<title>Delete Schema Icon</title>
								<polyline points="3 6 5 6 21 6" />
								<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
							</svg>
						</button>
					</div>

					<ul
						ref={fieldsListRef}
						className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-[220px] px-2.5 py-1 list-none m-0 custom-scrollbar"
					>
						{localFields.length === 0 ? (
							<div className="flex-1 flex flex-col justify-center items-center text-center py-8 gap-2">
								<span className="text-lg">🖱️</span>
								<span className={`text-[11px] leading-normal max-w-[200px] ${subTextColor}`}>
									Click 'Add Field' then click any element on the page
								</span>
							</div>
						) : (
							localFields.map((field, index) => {
								const fieldResult = extractionResult?.fields.find(
									(rf) => rf.fieldId === field.fieldId,
								);

								return (
									<li
										key={field.fieldId}
										data-field-id={field.fieldId}
										onPointerDown={(e) => handlePointerDown(e, field.fieldId, index)}
										onPointerMove={handlePointerMove}
										onPointerUp={handlePointerUp}
										onPointerCancel={handlePointerUp}
										style={{ touchAction: "none", userSelect: "none" }}
										className={`cursor-grab active:cursor-grabbing transition-all duration-150 relative rounded-lg ${
											draggedFieldId === field.fieldId
												? theme === "sakura"
													? "scale-[1.02] z-50 opacity-95 shadow-[0_0_15px_rgba(246,135,153,0.45)]"
													: "scale-[1.02] z-50 opacity-95 shadow-[0_0_15px_rgba(59,130,246,0.45)]"
												: "opacity-100 z-0"
										}`}
									>
										<FieldCard
											field={field}
											status={fieldResult?.status}
											value={fieldResult?.value}
											theme={theme}
											onUpdateLabel={updateFieldLabel}
											onDelete={removeField}
											isJustAdded={lastAddedFieldId === field.fieldId}
										/>
									</li>
								);
							})
						)}
					</ul>

					{/* Action Buttons */}
					<div className={`flex gap-2 pt-2 mt-auto border-t ${borderClass}`}>
						<button
							type="button"
							onClick={handleAddField}
							disabled={isPickerActive}
							className={`flex-1 font-semibold text-xs py-2 px-3 rounded-lg shadow-md transition duration-150 ease-in-out cursor-pointer flex items-center justify-center gap-1.5 ${addFieldBtnClass}`}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<title>Add Field Icon</title>
								<line x1="12" y1="5" x2="12" y2="19" />
								<line x1="5" y1="12" x2="19" y2="12" />
							</svg>
							Add Field
						</button>
						<button
							type="button"
							onClick={handleRunExtraction}
							disabled={schema.fields.length === 0 || isPickerActive}
							className={`flex-1 font-semibold text-xs py-2 px-3 rounded-lg shadow-md transition duration-150 ease-in-out cursor-pointer flex items-center justify-center gap-1.5 ${extractBtnClass}`}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<title>Extract Icon</title>
								<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
							</svg>
							Extract
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
