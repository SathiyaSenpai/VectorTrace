import { useState } from "react";
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

	return (
		<div className="w-[380px] min-h-[400px] bg-gray-900 text-gray-100 flex flex-col font-sans select-none">
			{/* Top App Bar */}
			<div className="px-4 py-3 bg-gray-950 border-b border-gray-800 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-black text-xs shadow-md border border-cyan-400/20">
						VT
					</div>
					<h1 className="text-sm font-bold tracking-wider bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
						VECTORTRACE
					</h1>
				</div>
				<span className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">
					v0.1.0
				</span>
			</div>

			{loading ? (
				/* Spinner State */
				<div className="flex-1 flex flex-col justify-center items-center gap-3 py-16">
					<div className="w-7 h-7 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
					<span className="text-xs text-gray-500 font-medium tracking-wide">Loading Schema...</span>
				</div>
			) : view === "RESULTS" && extractionResult ? (
				/* Extraction Results Screen */
				<ExtractionResults result={extractionResult} onBack={() => setView("EDITOR")} />
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
				/>
			)}
		</div>
	);
}
