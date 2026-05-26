import { useEffect, useState } from "react";
import { ExtractionResults } from "../../popup/components/ExtractionResults";
import { SchemaEditor } from "../../popup/components/SchemaEditor";
import { useExtraction } from "../../popup/hooks/useExtraction";
import { useSchema } from "../../popup/hooks/useSchema";

export default function App() {
	const {
		schema,
		url,
		loading,
		createSchema,
		deleteSchema,
		updateSchemaName,
		updateFieldLabel,
		removeField,
	} = useSchema();

	const { extractionResult, setExtractionResult, runExtraction } = useExtraction();

	const [activeTab, setActiveTab] = useState<"SCHEMA" | "RESULTS" | "SETTINGS">("SCHEMA");
	const [theme, setTheme] = useState<"dark" | "sakura">("dark");

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
	};

	// Reset storage handler
	const handleResetDatabase = async () => {
		if (
			window.confirm(
				"Are you sure you want to delete all VectorTrace schemas? This cannot be undone.",
			)
		) {
			await chrome.storage.local.clear();
			window.location.reload();
		}
	};

	const handleRunExtraction = async () => {
		if (!schema) return;
		await runExtraction(schema.schemaId);
		// Auto-switch to Results tab when extraction completes
		setActiveTab("RESULTS");
	};

	const handleFindReplacement = async (fieldId: string) => {
		if (!schema) return;
		try {
			await chrome.runtime.sendMessage({
				type: "FIND_CANDIDATES",
				fieldId,
				schemaId: schema.schemaId,
			});
		} catch (err) {
			console.error("[VectorTrace] Failed to trigger replacement finder:", err);
		}
	};

	const isSakura = theme === "sakura";

	// Theme Styling Mapping
	const containerClass = isSakura ? "bg-[#fff7f7] text-[#3a2d2d]" : "bg-gray-900 text-gray-100";
	const headerClass = isSakura ? "bg-[#fcdfe2] border-[#fbc5c5]" : "bg-gray-950 border-gray-800";
	const tabClass = isSakura ? "bg-[#fae6e8]/45 border-[#fbc5c5]" : "bg-gray-950/45 border-gray-800";
	const logoBoxClass = isSakura
		? "bg-gradient-to-tr from-[#f68799] to-[#ffdce3] border-[#fbc5c5] font-black"
		: "bg-gradient-to-tr from-blue-600 to-cyan-500 border-cyan-400/20";
	const logoTextClass = isSakura
		? "bg-gradient-to-r from-[#f68799] to-[#d65b70] bg-clip-text text-transparent"
		: "bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent";
	const versionClass = isSakura ? "text-[#8a7272]" : "text-gray-500";
	const spinnerBorderClass = isSakura ? "border-[#f68799]" : "border-blue-500";
	const loadingTextClass = isSakura ? "text-[#8a7272]" : "text-gray-500";

	// Tab Button Styles
	const getTabBtnClass = (tab: typeof activeTab) => {
		const base =
			"flex-1 text-center py-2 text-xs font-semibold border-b-2 transition-all duration-300 ease-in-out cursor-pointer";
		if (activeTab === tab) {
			return isSakura
				? `${base} text-[#f68799] border-[#f68799] font-black bg-[#fae6e8]/20`
				: `${base} text-blue-400 border-blue-400 font-black bg-gray-850/20`;
		}
		return isSakura
			? `${base} text-[#8a7272] border-transparent hover:text-[#d65b70]`
			: `${base} text-gray-400 border-transparent hover:text-gray-200`;
	};

	return (
		<div
			className={`w-[380px] min-h-[400px] flex flex-col font-sans select-none transition-colors duration-300 ease-in-out ${containerClass}`}
		>
			{/* Top App Bar */}
			<div
				className={`px-4 py-2.5 border-b flex items-center justify-between transition-colors duration-300 ease-in-out ${headerClass}`}
			>
				<div className="flex items-center gap-2">
					<div
						className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs shadow-sm border ${logoBoxClass}`}
					>
						{isSakura ? "🌸" : "VT"}
					</div>
					<h1 className={`text-sm font-black tracking-wider ${logoTextClass}`}>VECTORTRACE</h1>
				</div>

				<div className="flex items-center gap-3">
					<span className={`text-[10px] font-mono tracking-widest uppercase ${versionClass}`}>
						v0.1.0
					</span>
				</div>
			</div>

			{/* Tab Navigation */}
			<div className={`flex border-b transition-colors duration-300 ease-in-out ${tabClass}`}>
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
			</div>

			{/* Main Content Area */}
			<div className="flex-1 flex flex-col min-h-0">
				{loading ? (
					/* Spinner State */
					<div className="flex-1 flex flex-col justify-center items-center gap-3 py-16">
						<div
							className={`w-7 h-7 rounded-full border-2 border-t-transparent animate-spin ${spinnerBorderClass}`}
						/>
						<span className={`text-xs font-semibold tracking-wide ${loadingTextClass}`}>
							Loading Schema...
						</span>
					</div>
				) : activeTab === "SCHEMA" ? (
					/* Schema Editor Tab */
					<SchemaEditor
						schema={schema}
						url={url}
						createSchema={createSchema}
						deleteSchema={deleteSchema}
						updateSchemaName={updateSchemaName}
						updateFieldLabel={updateFieldLabel}
						removeField={removeField}
						extractionResult={extractionResult}
						setExtractionResult={setExtractionResult}
						onShowResults={() => setActiveTab("RESULTS")}
						theme={theme}
						onExtract={handleRunExtraction}
					/>
				) : activeTab === "RESULTS" ? (
					/* Extraction Results Tab */
					extractionResult ? (
						<ExtractionResults
							schemaName={schema?.name || "Schema"}
							result={extractionResult}
							onBack={() => setActiveTab("SCHEMA")}
							onFindReplacement={handleFindReplacement}
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
									Configure your fields in the Schema tab and click Extract to fetch page values.
								</p>
							</div>
						</div>
					)
				) : (
					/* Settings Tab */
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
				)}
			</div>
		</div>
	);
}
