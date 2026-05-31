import { useCallback, useEffect, useState } from "react";
import { ChangeDetection } from "../../popup/components/ChangeDetection";
import { ExtractionResults } from "../../popup/components/ExtractionResults";
import { SchemaEditor } from "../../popup/components/SchemaEditor";
import { useAutoHeal } from "../../popup/hooks/useAutoHeal";
import { useExtraction } from "../../popup/hooks/useExtraction";
import { useSchema } from "../../popup/hooks/useSchema";
import { getDB } from "../../shared/idb-store";
import type { FieldDefinition } from "../../shared/types";

export default function App() {
	const {
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
		reloadSchema,
	} = useSchema();

	const { extractionResult, setExtractionResult, isExtracting, runExtraction } = useExtraction();
	const { attemptAutoHeal } = useAutoHeal(schema?.schemaId);

	const [activeTab, setActiveTab] = useState<"SCHEMA" | "RESULTS" | "SETTINGS" | "HEALING">(
		"SCHEMA",
	);
	const [healingField, setHealingField] = useState<FieldDefinition | null>(null);
	const [theme, setTheme] = useState<"dark" | "sakura">("dark");
	const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
	const [toast, setToast] = useState<{
		message: string;
		type: "success" | "error" | "info";
	} | null>(null);

	const showToast = useCallback(
		(message: string, type: "success" | "error" | "info" = "success") => {
			setToast({ message, type });
			setTimeout(() => {
				setToast(null);
			}, 3000);
		},
		[],
	);

	// Listen for model download progress
	useEffect(() => {
		const listener = (message: { type: string; progress?: number }) => {
			if (message.type === "MODEL_DOWNLOAD_PROGRESS" && message.progress !== undefined) {
				setDownloadProgress(message.progress);
			} else if (message.type === "MODEL_DOWNLOAD_COMPLETE") {
				setDownloadProgress(null);
			}
		};
		chrome.runtime.onMessage.addListener(listener);
		return () => {
			chrome.runtime.onMessage.removeListener(listener);
		};
	}, []);

	// Load stored theme on mount
	useEffect(() => {
		chrome.storage.local.get("theme", (data) => {
			if (data.theme === "sakura") {
				setTheme("sakura");
			}
		});
	}, []);

	// Toggle theme handler
	const toggleTheme = () => {
		const newTheme = theme === "dark" ? "sakura" : "dark";
		setTheme(newTheme);
		chrome.storage.local.set({ theme: newTheme });
		showToast(`Switched to ${newTheme} theme`, "info");
	};

	// Reset storage handler
	const handleResetDatabase = async () => {
		if (
			window.confirm(
				"Are you sure you want to delete all VectorTrace scrapers? This cannot be undone.",
			)
		) {
			const currentTheme = theme;
			await chrome.storage.local.clear();
			await chrome.storage.local.set({ theme: currentTheme });

			const db = await getDB();
			await db.clear("embeddings");

			setExtractionResult(null);
			reloadSchema();

			showToast("Database reset successfully", "success");
		}
	};

	const handleRunExtraction = async () => {
		if (!schema) return;
		// Auto-switch to Results tab when extraction runs
		setActiveTab("RESULTS");
		try {
			const result = await runExtraction(schema.schemaId);
			showToast("Extraction complete", "success");

			// Optional auto-heal pass: silently repair broken/drifted fields when the
			// user has enabled it in Settings and a candidate clears the threshold.
			if (result) {
				try {
					const healSummary = await attemptAutoHeal(result);
					if (healSummary.healed) {
						await reloadSchema();
						await runExtraction(schema.schemaId);
						showToast(
							`Auto-healed ${healSummary.healedCount} field${
								healSummary.healedCount === 1 ? "" : "s"
							}`,
							"success",
						);
					}
				} catch (healErr) {
					console.error("Auto-heal pass failed:", healErr);
				}
			}
		} catch (err) {
			console.error("Extraction failed:", err);
			showToast("Extraction failed", "error");
		}
	};

	const handleFindReplacement = async (fieldId: string) => {
		if (!schema) return;
		const targetField = schema.fields.find((f) => f.fieldId === fieldId);
		if (targetField) {
			setHealingField(targetField);
			setActiveTab("HEALING");
		}
	};

	const handleAcceptCandidate = async () => {
		await reloadSchema();
		setHealingField(null);
		setActiveTab("RESULTS");
		showToast("Selector healed successfully!", "success");

		if (schema) {
			setTimeout(async () => {
				try {
					await runExtraction(schema.schemaId);
				} catch (err) {
					console.error("Re-extraction failed after healing:", err);
				}
			}, 400);
		}
	};

	const isSakura = theme === "sakura";

	// Theme Styling Mapping
	const containerClass = isSakura ? "bg-[#fff7f7] text-[#3a2d2d]" : "bg-gray-900 text-gray-100";
	const tabClass = isSakura ? "bg-[#fae6e8]/45 border-[#fbc5c5]" : "bg-gray-950/45 border-gray-800";
	const loadingTextClass = isSakura ? "text-[#8a7272]" : "text-gray-500";

	// Tab Button Styles
	const getTabBtnClass = (tab: typeof activeTab) => {
		const base =
			"flex-1 text-center py-2.5 text-xs font-semibold transition-all duration-300 ease-in-out cursor-pointer border-b border-transparent";
		if (activeTab === tab) {
			return isSakura
				? `${base} text-[#f68799] font-black bg-[#fae6e8]/20`
				: `${base} text-blue-400 font-black bg-gray-850/20`;
		}
		return isSakura
			? `${base} text-[#8a7272] hover:text-[#d65b70]`
			: `${base} text-gray-400 hover:text-gray-200`;
	};

	return (
		<div
			className={`w-[380px] min-h-[400px] flex flex-col font-sans select-none transition-colors duration-300 ease-in-out ${containerClass} theme-${theme}`}
		>
			{/* Top App Bar with Gradient */}
			<div
				className={`px-4 py-3 border-b flex flex-col transition-all duration-300 ${
					isSakura
						? "bg-gradient-to-r from-[#ffdce3] to-[#f68799] border-[#fbc5c5]"
						: "bg-gradient-to-r from-blue-600 to-purple-600 border-purple-800"
				}`}
			>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div
							className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black border ${
								isSakura
									? "bg-white/80 border-pink-200 text-[#d65b70]"
									: "bg-white/15 border-white/20 text-white"
							}`}
						>
							🌸
						</div>
						<h1 className="text-sm font-black tracking-wider text-white">VECTORTRACE</h1>
					</div>
					<div className="flex items-center gap-2">
						<span
							className={`text-[9px] font-mono tracking-widest uppercase ${
								isSakura ? "text-[#a04e5d]" : "text-blue-200"
							}`}
						>
							v0.1.0
						</span>
						<button
							type="button"
							onClick={() => chrome.runtime.openOptionsPage()}
							className="text-white/80 hover:text-white transition cursor-pointer p-0.5 rounded hover:bg-white/10 text-xs leading-none"
							title="Open Settings"
						>
							⚙️
						</button>
					</div>
				</div>
				<span
					className={`text-[10px] font-semibold mt-0.5 ${
						isSakura ? "text-pink-900/70" : "text-blue-100/70"
					}`}
				>
					Semantic Web Scraper
				</span>
			</div>

			{/* Schema Picker Dropdown if any schema exists */}
			{!isRestricted && !loading && matchingSchemas.length > 0 && (
				<div
					className={`px-4 py-1.5 border-b flex items-center justify-between transition-colors duration-300 ${
						isSakura
							? "bg-[#fff0f2] border-[#fbc5c5] text-[#7d6767]"
							: "bg-gray-950 border-gray-800 text-gray-400"
					}`}
				>
					<span className="text-[9px] font-extrabold tracking-wider uppercase">Scraper Scope:</span>
					<div className="relative flex items-center">
						<select
							value={schema?.schemaId || "NEW_SCHEMA"}
							onChange={(e) => selectSchema(e.target.value)}
							className={`text-[10px] font-bold py-0.5 pl-2 pr-6 rounded border appearance-none outline-none cursor-pointer transition-all duration-300 ${
								isSakura
									? "bg-white border-[#f5c2c8] text-[#3a2d2d] focus:border-[#f68799]"
									: "bg-gray-900 border-gray-700 text-gray-200 focus:border-blue-500"
							}`}
						>
							{matchingSchemas.map((s) => (
								<option key={s.schemaId} value={s.schemaId}>
									{s.name} ({s.fields.length} {s.fields.length === 1 ? "field" : "fields"})
								</option>
							))}
							<option value="NEW_SCHEMA" className="italic text-green-600 font-bold">
								+ Create New Schema
							</option>
						</select>
						<span className="pointer-events-none absolute right-2 text-[8px] opacity-70">▼</span>
					</div>
				</div>
			)}

			{/* Tab Navigation with sliding indicator */}
			{activeTab !== "HEALING" && (
				<div
					className={`flex relative border-b transition-colors duration-300 ease-in-out ${tabClass}`}
				>
					<button
						type="button"
						onClick={() => setActiveTab("SCHEMA")}
						className={getTabBtnClass("SCHEMA")}
					>
						Schema
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("RESULTS")}
						className={getTabBtnClass("RESULTS")}
					>
						Results
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("SETTINGS")}
						className={getTabBtnClass("SETTINGS")}
					>
						Settings
					</button>

					{/* Active tab sliding bar */}
					<div
						className={`absolute bottom-0 h-0.5 transition-all duration-300 ease-in-out ${
							isSakura ? "bg-[#f68799]" : "bg-blue-500"
						}`}
						style={{
							width: "33.33%",
							left: activeTab === "SCHEMA" ? "0%" : activeTab === "RESULTS" ? "33.33%" : "66.66%",
						}}
					/>
				</div>
			)}

			{/* Main Content Area */}
			<div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
				{isRestricted ? (
					/* Restricted URL Warning */
					<div className="flex-1 flex flex-col justify-center items-center text-center p-6 gap-3">
						<span className="text-3xl">⚠️</span>
						<h3 className="text-sm font-bold">System Page Detected</h3>
						<p className={`text-xs px-4 leading-normal ${loadingTextClass}`}>
							VectorTrace cannot scrape system pages or extensions. Please open a regular website to
							get started.
						</p>
					</div>
				) : loading ? (
					/* Schema loading: skeleton shimmer animation (3 gray bars pulsing) */
					<div className="flex-1 flex flex-col p-4 gap-4 animate-pulse">
						<div className={`h-6 w-2/3 rounded ${isSakura ? "bg-[#fae6e8]" : "bg-gray-800"}`} />
						<div className="flex flex-col gap-3 mt-4">
							<div className={`h-16 rounded-lg ${isSakura ? "bg-[#fae6e8]" : "bg-gray-800"}`} />
							<div className={`h-16 rounded-lg ${isSakura ? "bg-[#fae6e8]" : "bg-gray-800"}`} />
							<div className={`h-16 rounded-lg ${isSakura ? "bg-[#fae6e8]" : "bg-gray-800"}`} />
						</div>
					</div>
				) : isExtracting ? (
					/* Extraction running: animated dots "Extracting..." with a progress ring */
					<div className="flex-1 flex flex-col justify-center items-center gap-4 py-16">
						<div className="relative w-12 h-12">
							<svg className="animate-spin w-full h-full" viewBox="0 0 36 36">
								<title>Extracting Ring</title>
								<circle
									className={isSakura ? "text-[#fae6e8]" : "text-gray-850"}
									stroke="currentColor"
									strokeWidth="3.5"
									fill="none"
									cx="18"
									cy="18"
									r="16"
								/>
								<circle
									className={isSakura ? "text-[#f68799]" : "text-blue-500"}
									stroke="currentColor"
									strokeWidth="3.5"
									strokeDasharray="60, 100"
									strokeLinecap="round"
									fill="none"
									cx="18"
									cy="18"
									r="16"
								/>
							</svg>
						</div>
						<span className={`text-xs font-semibold animate-pulse ${loadingTextClass}`}>
							Extracting...
						</span>
					</div>
				) : (
					<div
						className="flex flex-1 w-[400%] transition-transform duration-300 ease-in-out"
						style={{
							transform:
								activeTab === "SCHEMA"
									? "translateX(0%)"
									: activeTab === "RESULTS"
										? "translateX(-25%)"
										: activeTab === "SETTINGS"
											? "translateX(-50%)"
											: "translateX(-75%)",
						}}
					>
						{/* Panel 0: SCHEMA */}
						<div className="w-1/4 flex-shrink-0 flex flex-col min-h-0">
							<SchemaEditor
								schema={schema}
								url={url}
								createSchema={createSchema}
								deleteSchema={deleteSchema}
								updateSchemaName={updateSchemaName}
								updateFieldLabel={updateFieldLabel}
								removeField={removeField}
								reorderFields={reorderFields}
								lastAddedFieldId={lastAddedFieldId}
								isPickerActive={isPickerActive}
								setIsPickerActive={setIsPickerActive}
								extractionResult={extractionResult}
								setExtractionResult={setExtractionResult}
								onShowResults={() => setActiveTab("RESULTS")}
								theme={theme}
								onExtract={handleRunExtraction}
							/>
						</div>

						{/* Panel 1: RESULTS */}
						<div className="w-1/4 flex-shrink-0 flex flex-col min-h-0">
							{extractionResult ? (
								<ExtractionResults
									schemaName={schema?.name || "Schema"}
									result={extractionResult}
									onBack={() => setActiveTab("SCHEMA")}
									onFindReplacement={handleFindReplacement}
									onReExtract={handleRunExtraction}
									theme={theme}
								/>
							) : (
								<div className="flex-1 flex flex-col justify-center items-center text-center p-6 gap-2">
									<div
										className={`w-10 h-10 rounded-full flex items-center justify-center border ${
											isSakura
												? "bg-[#f68799]/10 border-[#f68799]/20 text-[#f68799]"
												: "bg-gray-800/40 border-gray-700 text-gray-400"
										}`}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2.5"
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											<title>Empty Results Icon</title>
											<line x1="22" y1="12" x2="2" y2="12" />
											<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
										</svg>
									</div>
									<div>
										<h3 className="text-xs font-bold">No Data Extracted</h3>
										<p className={`text-[11px] mt-1 ${loadingTextClass}`}>
											Run extraction to see results here
										</p>
									</div>
								</div>
							)}
						</div>

						{/* Panel 2: SETTINGS */}
						<div className="w-1/4 flex-shrink-0 flex flex-col min-h-0">
							<div
								className={`flex-1 flex flex-col p-4 gap-4 transition-colors duration-300 ease-in-out ${containerClass}`}
							>
								<h3 className="text-sm font-bold border-b pb-2 tracking-wide border-gray-800/30">
									Extension Settings
								</h3>
								<div className="flex flex-col gap-3">
									{/* Theme Settings row */}
									<div
										className={`flex items-center justify-between p-3 rounded-lg border ${
											isSakura ? "bg-white border-[#f5c2c8]" : "bg-gray-800 border-gray-700"
										}`}
									>
										<div className="flex flex-col gap-0.5">
											<span className="text-xs font-semibold">Sakura Theme</span>
											<span className={`text-[10px] ${loadingTextClass}`}>
												Enable quiet cherry-blossom light UI
											</span>
										</div>
										<button
											type="button"
											role="switch"
											aria-checked={isSakura}
											onClick={toggleTheme}
											className={`w-9 h-5 rounded-full relative transition-colors duration-300 ease-in-out focus:outline-none flex items-center px-0.5 border ${
												isSakura ? "bg-[#fae6e8] border-[#fbc5c5]" : "bg-gray-900 border-gray-800"
											}`}
										>
											<span
												className={`w-3.5 h-3.5 rounded-full transition-transform duration-300 ease-in-out shadow flex items-center justify-center text-[9px] leading-none ${
													isSakura ? "translate-x-4 bg-[#f68799]" : "translate-x-0 bg-yellow-400"
												}`}
											>
												{isSakura ? "🌸" : "🌙"}
											</span>
										</button>
									</div>

									{/* Database Settings row */}
									<div
										className={`flex items-center justify-between p-3 rounded-lg border ${
											isSakura ? "bg-white border-[#f5c2c8]" : "bg-gray-800 border-gray-700"
										}`}
									>
										<div className="flex flex-col gap-0.5">
											<span className="text-xs font-semibold">Reset Database</span>
											<span className={`text-[10px] ${loadingTextClass}`}>
												Wipe all saved scrapers and fields
											</span>
										</div>
										<button
											type="button"
											onClick={handleResetDatabase}
											className={`text-[10px] px-2.5 py-1.5 font-bold rounded-lg border transition duration-150 ${
												isSakura
													? "bg-white border-[#f5c2c8] text-red-500 hover:bg-red-50/50"
													: "bg-gray-950 border-gray-800 text-red-400 hover:bg-red-950/20"
											}`}
										>
											Reset
										</button>
									</div>
								</div>

								{/* System Info footer */}
								<div className="mt-auto text-center py-2 flex flex-col gap-0.5">
									<span
										className={`text-[10px] font-mono uppercase tracking-wider ${loadingTextClass}`}
									>
										VectorTrace System Engine
									</span>
									<span className="text-[9px] text-gray-500">v0.1.0 • Under AGPLv3 License</span>
								</div>
							</div>
						</div>

						{/* Panel 3: HEALING */}
						<div className="w-1/4 flex-shrink-0 flex flex-col min-h-0">
							{schema && healingField ? (
								<ChangeDetection
									schemaId={schema.schemaId}
									field={healingField}
									onAccept={handleAcceptCandidate}
									onCancel={() => {
										setHealingField(null);
										setActiveTab("RESULTS");
									}}
									theme={theme}
								/>
							) : (
								<div className="flex-1 flex flex-col justify-center items-center text-center p-6 gap-2">
									<span className="text-xs text-gray-550">No Selector Breakdown Detected</span>
								</div>
							)}
						</div>
					</div>
				)}
			</div>
			{downloadProgress !== null && (
				<div
					className={`p-2 border-t text-[10px] font-bold flex items-center justify-between transition-all duration-300 animate-pulse ${
						isSakura
							? "bg-[#fae6e8] border-[#fbc5c5] text-[#d65b70]"
							: "bg-blue-950/80 border-blue-900/40 text-blue-300"
					}`}
				>
					<span>🤖 Loading AI Model...</span>
					<span>{Math.round(downloadProgress)}%</span>
				</div>
			)}
			{toast && (
				<div
					className={`fixed bottom-4 left-1/2 px-4 py-2 rounded-lg text-[10px] font-bold shadow-lg transition-all duration-300 z-50 flex items-center gap-2 border animate-slide-up ${
						toast.type === "success"
							? isSakura
								? "bg-[#ffdce3] border-[#fbc5c5] text-[#d65b70]"
								: "bg-green-950/90 border-green-800/40 text-green-300"
							: toast.type === "error"
								? isSakura
									? "bg-[#fff2f2] border-[#f8d7da] text-[#c92437]"
									: "bg-red-950/90 border-red-800/40 text-red-300"
								: isSakura
									? "bg-[#e8f4fd] border-[#bee5eb] text-[#17a2b8]"
									: "bg-blue-950/90 border-blue-800/40 text-blue-300"
					}`}
				>
					<span>{toast.type === "success" ? "✅" : toast.type === "error" ? "❌" : "ℹ️"}</span>
					<span>{toast.message}</span>
				</div>
			)}
		</div>
	);
}
