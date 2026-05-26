import { useEffect, useState } from "react";
import { ExtractionResults } from "../../popup/components/ExtractionResults";
import { SchemaEditor } from "../../popup/components/SchemaEditor";
import { useSchema } from "../../popup/hooks/useSchema";
import type { ExtractionResult } from "../../shared/types";

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

	const [view, setView] = useState<"EDITOR" | "RESULTS">("EDITOR");
	const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
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

	const isSakura = theme === "sakura";

	// Theme Styling Mapping
	const containerClass = isSakura ? "bg-[#fff7f7] text-[#3a2d2d]" : "bg-gray-900 text-gray-100";
	const headerClass = isSakura ? "bg-[#fcdfe2] border-[#fbc5c5]" : "bg-gray-950 border-gray-800";
	const logoBoxClass = isSakura
		? "bg-gradient-to-tr from-[#f68799] to-[#ffdce3] border-[#fbc5c5] font-black"
		: "bg-gradient-to-tr from-blue-600 to-cyan-500 border-cyan-400/20";
	const logoTextClass = isSakura
		? "bg-gradient-to-r from-[#f68799] to-[#d65b70] bg-clip-text text-transparent"
		: "bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent";
	const versionClass = isSakura ? "text-[#8a7272]" : "text-gray-500";
	const spinnerBorderClass = isSakura ? "border-[#f68799]" : "border-blue-500";
	const loadingTextClass = isSakura ? "text-[#8a7272]" : "text-gray-500";

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
					{/* Custom Sliding Toggle Switch */}
					<button
						type="button"
						role="switch"
						aria-checked={isSakura}
						onClick={toggleTheme}
						className={`w-9 h-5 rounded-full relative transition-colors duration-300 ease-in-out focus:outline-none flex items-center px-0.5 border ${
							isSakura ? "bg-[#fae6e8] border-[#fbc5c5]" : "bg-gray-800 border-gray-700"
						}`}
						title={isSakura ? "Switch to Dark Theme" : "Switch to Sakura (Calm Light Theme)"}
					>
						<span
							className={`w-3.5 h-3.5 rounded-full transition-transform duration-300 ease-in-out shadow flex items-center justify-center text-[9px] leading-none ${
								isSakura ? "translate-x-4 bg-[#f68799]" : "translate-x-0 bg-yellow-400"
							}`}
						>
							{isSakura ? "🌸" : "🌙"}
						</span>
					</button>

					<span className={`text-[10px] font-mono tracking-widest uppercase ${versionClass}`}>
						v0.1.0
					</span>
				</div>
			</div>

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
			) : view === "RESULTS" && extractionResult ? (
				/* Extraction Results Screen */
				<ExtractionResults
					result={extractionResult}
					onBack={() => setView("EDITOR")}
					theme={theme}
				/>
			) : (
				/* Editor / Schema View */
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
					onShowResults={() => setView("RESULTS")}
					theme={theme}
				/>
			)}
		</div>
	);
}
