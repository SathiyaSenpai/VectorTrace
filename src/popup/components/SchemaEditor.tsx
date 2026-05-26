import { useState } from "react";
import type { ExtractionResult, Schema } from "../../shared/types";
import { FieldCard } from "./FieldCard";

interface SchemaEditorProps {
	schema: Schema | null;
	url: string;
	createSchema: (name: string) => Promise<void>;
	deleteSchema: () => Promise<void>;
	updateSchemaName: (name: string) => Promise<void>;
	updateFieldLabel: (fieldId: string, label: string) => Promise<void>;
	removeField: (fieldId: string) => Promise<void>;
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

	const handleAddField = async () => {
		if (!schema) return;
		try {
			setStatusMessage("Click an element on the page...");
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (tab?.id) {
				await chrome.tabs.sendMessage(tab.id, {
					type: "START_SELECTION",
					schemaId: schema.schemaId,
				});
			}
		} catch (err) {
			console.error("Start selection failed:", err);
			setStatusMessage("Error starting picker");
			setTimeout(() => setStatusMessage(""), 3000);
		}
	};

	const handleRunExtraction = async () => {
		if (!schema) return;
		if (onExtract) {
			setStatusMessage("Running extraction...");
			try {
				await onExtract();
				setStatusMessage("Extraction complete");
				setTimeout(() => {
					setStatusMessage("");
					onShowResults();
				}, 600);
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : "Failed";
				setStatusMessage(`Error: ${errMsg}`);
				setTimeout(() => setStatusMessage(""), 3000);
			}
			return;
		}

		try {
			setStatusMessage("Running extraction...");
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (tab?.id) {
				const response = await chrome.tabs.sendMessage(tab.id, {
					type: "RUN_EXTRACTION",
					schemaId: schema.schemaId,
				});
				if (response?.result) {
					setExtractionResult(response.result);
					setStatusMessage("Extraction complete");
					setTimeout(() => {
						setStatusMessage("");
						onShowResults();
					}, 600);
				} else if (response?.error) {
					setStatusMessage(`Error: ${response.error}`);
				}
			}
		} catch (err) {
			console.error("Run extraction failed:", err);
			setStatusMessage("Failed. Is content script loaded?");
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
		? "bg-[#f68799] hover:bg-[#e26275] text-white"
		: "bg-blue-600 hover:bg-blue-500 text-white";
	const extractBtnClass = isSakura
		? "bg-[#798c73] hover:bg-[#687a63] disabled:bg-gray-250/20 disabled:text-gray-400 text-white"
		: "bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-850 disabled:text-gray-600 text-white";
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
						<p className={`text-xs mt-1 ${subTextColor}`}>
							Create a schema to start mapping and tracking point-and-click elements on this page.
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

					{/* Fields List */}
					<div className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-[220px] pr-1">
						{schema.fields.length === 0 ? (
							<div
								className={`flex-1 flex flex-col justify-center items-center text-center py-6 italic text-xs ${subTextColor}`}
							>
								No fields selected yet.
								<span className="block mt-1 text-[11px] opacity-70">
									Click "Add Field" below to begin point-and-click.
								</span>
							</div>
						) : (
							schema.fields.map((field) => {
								const fieldResult = extractionResult?.fields.find(
									(rf) => rf.fieldId === field.fieldId,
								);

								return (
									<FieldCard
										key={field.fieldId}
										field={field}
										status={fieldResult?.status}
										value={fieldResult?.value}
										theme={theme}
										onUpdateLabel={updateFieldLabel}
										onDelete={removeField}
									/>
								);
							})
						)}
					</div>

					{/* Action Buttons */}
					<div className={`flex gap-2 pt-2 mt-auto border-t ${borderClass}`}>
						<button
							type="button"
							onClick={handleAddField}
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
							disabled={schema.fields.length === 0}
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
