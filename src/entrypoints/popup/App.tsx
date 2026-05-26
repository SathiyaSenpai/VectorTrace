import { useCallback, useEffect, useState } from "react";
import { getAllEmbeddings } from "../../shared/idb-store";
import type { FieldDefinition, Schema } from "../../shared/types";

export default function App() {
	const [localSchema, setLocalSchema] = useState<Schema | null>(null);
	const [idbFields, setIdbFields] = useState<FieldDefinition[]>([]);
	const [status, setStatus] = useState<string>("Ready");

	const refreshData = useCallback(async () => {
		try {
			// Fetch schema from chrome.storage.local
			const allStorage = await chrome.storage.local.get(null);
			const schemaKey = Object.keys(allStorage).find((k) => k.startsWith("schema_"));
			if (schemaKey) {
				setLocalSchema(allStorage[schemaKey] as Schema);
			} else {
				setLocalSchema(null);
			}

			// Fetch embeddings from IndexedDB
			const fields = await getAllEmbeddings();
			setIdbFields(fields);
		} catch (err) {
			console.error("Failed to load debug storage:", err);
		}
	}, []);

	useEffect(() => {
		refreshData();

		// Set up listener to refresh popup UI automatically when a field selection succeeds
		const listener = (message: MessageType) => {
			if (message.type === "FIELD_SELECTED") {
				setStatus("Selection captured! Processing...");
				setTimeout(() => {
					refreshData();
					setStatus("Ready");
				}, 500);
			}
		};

		chrome.runtime.onMessage.addListener(listener);
		return () => {
			chrome.runtime.onMessage.removeListener(listener);
		};
	}, [refreshData]);

	const handleSelectElement = async () => {
		try {
			setStatus("Click an element on the page...");
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (!tab?.id) {
				setStatus("Error: No active tab found");
				return;
			}

			// Inject content script if not already loaded (standard WXT development safety)
			await chrome.tabs.sendMessage(tab.id, {
				type: "START_SELECTION",
				schemaId: "test-schema-id",
			});
		} catch (err) {
			console.error("Failed to start selection:", err);
			setStatus("Make sure to refresh the page first.");
		}
	};

	const handleClearAll = async () => {
		try {
			setStatus("Clearing database...");
			// Clear chrome.storage.local
			await chrome.storage.local.clear();

			// Clear IndexedDB
			const { deleteFieldsBySchema } = await import("../../shared/idb-store");
			await deleteFieldsBySchema("test-schema-id");

			await refreshData();
			setStatus("Ready");
		} catch (err) {
			console.error(err);
			setStatus("Clear failed");
		}
	};

	return (
		<div className="flex flex-col p-6 bg-slate-900 text-slate-100 min-w-[380px] font-sans">
			<div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
				<h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
					VectorTrace Debugger
				</h1>
				<span
					className={`text-xs px-2.5 py-1 rounded-full font-medium ${
						status.includes("Click")
							? "bg-amber-500/20 text-amber-300 animate-pulse"
							: status.includes("captured")
								? "bg-green-500/20 text-green-300"
								: "bg-slate-800 text-slate-400"
					}`}
				>
					{status}
				</span>
			</div>

			<div className="flex gap-2 mb-6">
				<button
					type="button"
					onClick={handleSelectElement}
					className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-md transition duration-150 ease-in-out cursor-pointer text-center text-sm"
				>
					Pick Element
				</button>
				<button
					type="button"
					onClick={handleClearAll}
					className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition duration-150 ease-in-out cursor-pointer text-sm"
				>
					Reset
				</button>
			</div>

			{/* Section: Chrome Local Storage */}
			<div className="mb-5 bg-slate-800/40 p-4 rounded-xl border border-slate-800">
				<h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
					chrome.storage.local (Schema metadata)
				</h2>
				{localSchema ? (
					<div className="space-y-2">
						<div className="text-xs text-indigo-300 font-medium truncate">
							Schema: {localSchema.name} ({localSchema.schemaId.substring(0, 8)}...)
						</div>
						<div className="max-h-[100px] overflow-y-auto space-y-1.5 pr-1">
							{localSchema.fields.map((f) => (
								<div key={f.fieldId} className="bg-slate-800 p-2 rounded text-xs space-y-0.5">
									<div className="flex justify-between font-semibold text-slate-300">
										<span className="text-indigo-400">Selector:</span>
										<span className="truncate max-w-[180px]">{f.cssSelector}</span>
									</div>
									<div className="flex justify-between text-[11px] text-slate-400">
										<span>Embedding size:</span>
										<span className="font-mono text-amber-400 font-semibold">
											{f.embedding.length} items
										</span>
									</div>
								</div>
							))}
						</div>
					</div>
				) : (
					<div className="text-xs text-slate-500 italic">No schema metadata stored yet.</div>
				)}
			</div>

			{/* Section: IndexedDB Storage */}
			<div className="bg-slate-800/40 p-4 rounded-xl border border-slate-800">
				<h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
					IndexedDB (Heavy embedding vectors)
				</h2>
				{idbFields.length > 0 ? (
					<div className="max-h-[140px] overflow-y-auto space-y-2 pr-1">
						{idbFields.map((f) => (
							<div
								key={f.fieldId}
								className="bg-slate-850 p-2.5 rounded border border-slate-750 text-xs"
							>
								<div className="text-slate-300 font-medium mb-1 truncate">
									Text: <span className="text-cyan-300">"{f.textContent}"</span>
								</div>
								<div className="grid grid-cols-2 gap-1 text-[11px] text-slate-400">
									<div>
										ID: <span className="font-mono">{f.fieldId.substring(0, 8)}...</span>
									</div>
									<div className="text-right">
										Vector size:{" "}
										<span className="font-mono text-green-400 font-bold">
											{f.embedding.length} dimensions
										</span>
									</div>
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="text-xs text-slate-500 italic">No embeddings in IndexedDB.</div>
				)}
			</div>
		</div>
	);
}
