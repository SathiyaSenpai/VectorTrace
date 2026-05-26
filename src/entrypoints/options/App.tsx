import { useCallback, useEffect, useRef, useState } from "react";
import { deleteSchema, getAllSchemas, saveSchema } from "../../shared/chrome-storage";
import {
	deleteFieldsBySchema,
	getAllEmbeddings,
	getDB,
	saveFieldEmbedding,
} from "../../shared/idb-store";
import type { FieldDefinition, Schema } from "../../shared/types";

export default function App() {
	const [schemas, setSchemas] = useState<Schema[]>([]);
	const [loading, setLoading] = useState(true);
	const [storageBytes, setStorageBytes] = useState(0);
	const [embeddingCount, setEmbeddingCount] = useState(0);

	// Custom Toast Alert State
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

	// Gemini Settings Mock Shell State
	const [geminiKey, setGeminiKey] = useState("");
	const [showGeminiKey, setShowGeminiKey] = useState(false);
	const [autoHeal, setAutoHeal] = useState(false);
	const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);

	// Modals & Confirmations State
	const [deleteSchemaId, setDeleteSchemaId] = useState<string | null>(null);
	const [showClearConfirm, setShowClearConfirm] = useState(false);
	const [clearConfirmText, setClearConfirmText] = useState("");

	// File Inputs
	const importSingleRef = useRef<HTMLInputElement>(null);
	const importAllRef = useRef<HTMLInputElement>(null);

	// Load all settings & schemas
	const loadData = useCallback(async () => {
		setLoading(true);
		try {
			// Get schemas
			const list = await getAllSchemas();
			setSchemas(list);

			// Get storage metrics
			if (chrome.storage?.local?.getBytesInUse) {
				chrome.storage.local.getBytesInUse(null, (bytes) => {
					setStorageBytes(bytes);
				});
			}

			const db = await getDB();
			const count = await db.count("embeddings");
			setEmbeddingCount(count);

			// Get Gemini Settings
			const data = await chrome.storage.local.get(["geminiKey", "autoHeal", "confidenceThreshold"]);
			if (data.geminiKey) setGeminiKey(data.geminiKey);
			if (data.autoHeal !== undefined) setAutoHeal(data.autoHeal);
			if (data.confidenceThreshold !== undefined) setConfidenceThreshold(data.confidenceThreshold);
		} catch (err) {
			console.error("Failed to load settings data:", err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	// Delete Schema Action
	const handleDeleteSchema = async () => {
		if (!deleteSchemaId) return;
		try {
			await deleteSchema(deleteSchemaId);
			await deleteFieldsBySchema(deleteSchemaId);
			await loadData();
			showToast("Schema deleted successfully", "success");
		} catch {
			showToast("Failed to delete schema", "error");
		} finally {
			setDeleteSchemaId(null);
		}
	};

	// Save Gemini Settings
	const handleSaveGeminiKey = async (val: string) => {
		setGeminiKey(val);
		await chrome.storage.local.set({ geminiKey: val });
	};

	// Reset All Data Action
	const handleClearAllData = async () => {
		if (clearConfirmText !== "DELETE") {
			showToast("Confirmation text must match 'DELETE'", "error");
			return;
		}
		try {
			await chrome.storage.local.clear();
			const db = await getDB();
			await db.clear("embeddings");
			setClearConfirmText("");
			setShowClearConfirm(false);
			await loadData();
			showToast("Database reset successfully", "success");
		} catch {
			showToast("Failed to clear database", "error");
		}
	};

	// Single Schema Export
	const handleExportSchema = async (schema: Schema) => {
		try {
			const db = await getDB();
			const fullFields = await Promise.all(
				schema.fields.map(async (field) => {
					const idbField = await db.get("embeddings", field.fieldId);
					return {
						...field,
						embedding: idbField?.embedding || [],
					};
				}),
			);

			const exportData = {
				version: "1.0",
				exportedAt: new Date().toISOString(),
				schema: {
					...schema,
					fields: fullFields,
				},
			};

			const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${schema.name.toLowerCase().replace(/\s+/g, "_")}.vectortrace.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			showToast("Schema exported successfully", "success");
		} catch {
			showToast("Failed to export schema", "error");
		}
	};

	// Single Schema Import
	const handleImportSchemaFile = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async (event) => {
			try {
				const json = JSON.parse(event.target?.result as string);
				if (json.version !== "1.0" || !json.schema) {
					throw new Error("Invalid schema format version");
				}

				const importedSchema: Schema = json.schema;
				importedSchema.schemaId = crypto.randomUUID();
				importedSchema.updatedAt = Date.now();

				// Save schema metadata
				await saveSchema(importedSchema);

				// Save embeddings to IndexedDB
				for (const field of importedSchema.fields) {
					const embeddingField: FieldDefinition = {
						...field,
						schemaId: importedSchema.schemaId,
						timestamp: Date.now(),
					};
					await saveFieldEmbedding(embeddingField);
				}

				showToast("Schema imported successfully!", "success");
				await loadData();
			} catch (err) {
				showToast(
					`Failed to import schema: ${err instanceof Error ? err.message : "Invalid JSON"}`,
					"error",
				);
			} finally {
				if (importSingleRef.current) importSingleRef.current.value = "";
			}
		};
		reader.readAsText(file);
	};

	// Export All Data
	const handleExportAll = async () => {
		try {
			const schemasList = await getAllSchemas();
			const embeddingsList = await getAllEmbeddings();

			const exportData = {
				version: "1.0",
				exportedAt: new Date().toISOString(),
				schemas: schemasList,
				embeddings: embeddingsList,
			};

			const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "vectortrace_backup.json";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			showToast("All data exported successfully", "success");
		} catch {
			showToast("Failed to export all data", "error");
		}
	};

	// Import All Data Backup
	const handleImportAllFile = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async (event) => {
			try {
				const json = JSON.parse(event.target?.result as string);
				if (json.version !== "1.0" || !json.schemas || !json.embeddings) {
					throw new Error("Invalid backup format version");
				}

				// Import schemas
				for (const s of json.schemas) {
					await saveSchema(s);
				}

				// Import embeddings
				for (const emb of json.embeddings) {
					await saveFieldEmbedding(emb);
				}

				showToast("All data and schemas restored successfully!", "success");
				await loadData();
			} catch (err) {
				showToast(
					`Failed to import backup: ${err instanceof Error ? err.message : "Invalid JSON"}`,
					"error",
				);
			} finally {
				if (importAllRef.current) importAllRef.current.value = "";
			}
		};
		reader.readAsText(file);
	};

	return (
		<div className="min-h-screen bg-gray-900 text-gray-100 font-sans py-12 px-4 selection:bg-blue-600/30">
			<div className="max-w-2xl mx-auto flex flex-col gap-8">
				{/* Top Branding Header */}
				<div className="flex items-center justify-between border-b border-gray-800 pb-5">
					<div className="flex items-center gap-3">
						<div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-blue-500/10">
							VT
						</div>
						<div>
							<h1 className="text-xl font-black tracking-wider text-white">VECTORTRACE</h1>
							<p className="text-xs text-gray-400">Settings and Schema Management Center</p>
						</div>
					</div>
					<div className="text-right">
						<span className="text-xs font-mono px-2 py-1 rounded bg-gray-800 text-gray-400 border border-gray-700/60">
							v0.1.0
						</span>
					</div>
				</div>

				{/* Section 1: Schema Manager */}
				<div className="bg-gray-800 rounded-xl border border-gray-700 p-6 flex flex-col gap-4 shadow-xl shadow-black/10">
					<div className="flex items-center justify-between border-b border-gray-700 pb-3">
						<h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
							📋 Schema Manager
						</h2>
						<button
							type="button"
							onClick={() => importSingleRef.current?.click()}
							className="text-xs px-3 py-1.5 font-bold rounded-lg border border-blue-500 text-blue-400 hover:bg-blue-500/10 transition cursor-pointer"
						>
							Import Schema (.json)
						</button>
						<input
							type="file"
							ref={importSingleRef}
							onChange={handleImportSchemaFile}
							accept=".json"
							className="hidden"
						/>
					</div>

					{loading ? (
						<div className="py-8 flex flex-col items-center gap-2">
							<div className="w-6 h-6 border-2 border-t-transparent border-blue-500 rounded-full animate-spin" />
							<span className="text-xs text-gray-550 font-semibold">Loading schemas...</span>
						</div>
					) : schemas.length === 0 ? (
						<div className="py-10 text-center flex flex-col items-center gap-2">
							<span className="text-2xl">📭</span>
							<p className="text-xs font-bold">No scrapers configured yet</p>
							<p className="text-[11px] text-gray-500 max-w-sm leading-normal">
								Visit websites and use the VectorTrace extension popup to create schema layouts.
							</p>
						</div>
					) : (
						<div className="flex flex-col gap-3">
							{schemas.map((s) => (
								<div
									key={s.schemaId}
									className="flex items-center justify-between p-3.5 rounded-lg border border-gray-700/60 bg-gray-900/40 hover:scale-[1.005] transition-transform duration-150"
								>
									<div className="flex flex-col min-w-0 pr-4">
										<span className="text-xs font-bold text-white truncate max-w-[280px]">
											{s.name}
										</span>
										<a
											href={s.url}
											target="_blank"
											rel="noreferrer"
											className="text-[10px] text-blue-400 font-mono truncate max-w-[280px] hover:underline mt-0.5"
										>
											{s.url}
										</a>
										<div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500 font-medium">
											<span>🏷️ {s.fields.length} Fields</span>
											<span>⏰ Updated: {new Date(s.updatedAt).toLocaleString()}</span>
										</div>
									</div>

									<div className="flex items-center gap-2 flex-shrink-0">
										<button
											type="button"
											onClick={() => handleExportSchema(s)}
											className="text-[10px] px-2.5 py-1.5 font-bold rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 transition cursor-pointer"
											title="Export Schema Layout"
										>
											Export
										</button>
										<button
											type="button"
											onClick={() => setDeleteSchemaId(s.schemaId)}
											className="text-[10px] px-2.5 py-1.5 font-bold rounded bg-red-950/20 hover:bg-red-500/10 border border-red-900/30 text-red-400 transition cursor-pointer"
											title="Delete Schema"
										>
											Delete
										</button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Section 2: Data Management */}
				<div className="bg-gray-800 rounded-xl border border-gray-700 p-6 flex flex-col gap-4 shadow-xl shadow-black/10">
					<h2 className="text-sm font-bold text-white uppercase tracking-wider border-b border-gray-700 pb-3">
						💾 Data Management
					</h2>
					<div className="grid grid-cols-2 gap-4">
						<div className="p-4 rounded-lg bg-gray-900/40 border border-gray-750 flex flex-col justify-between">
							<div>
								<h3 className="text-xs font-bold text-white">Full Backup Export</h3>
								<p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
									Download all schemas and semantic embeddings into a single file.
								</p>
							</div>
							<button
								type="button"
								onClick={handleExportAll}
								className="mt-4 w-full text-xs py-2 font-bold rounded-lg bg-blue-600 hover:bg-blue-500 transition cursor-pointer text-center text-white"
							>
								Export All Data
							</button>
						</div>

						<div className="p-4 rounded-lg bg-gray-900/40 border border-gray-750 flex flex-col justify-between">
							<div>
								<h3 className="text-xs font-bold text-white">Restore Backup</h3>
								<p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
									Import schemas and weights from a VectorTrace backup file.
								</p>
							</div>
							<button
								type="button"
								onClick={() => importAllRef.current?.click()}
								className="mt-4 w-full text-xs py-2 font-bold rounded-lg border border-gray-700 hover:bg-gray-800 transition cursor-pointer text-center text-gray-300"
							>
								Import Backup File
							</button>
							<input
								type="file"
								ref={importAllRef}
								onChange={handleImportAllFile}
								accept=".json"
								className="hidden"
							/>
						</div>
					</div>

					{/* Storage Usage info */}
					<div className="flex items-center justify-between p-3.5 rounded-lg border border-gray-750 bg-gray-900/40 mt-2 text-xs">
						<div className="flex flex-col gap-0.5">
							<span className="font-semibold text-white">Storage Utilization</span>
							<span className="text-[10px] text-gray-550">
								IndexedDB handles semantic vectors; local storage handles metadata configurations.
							</span>
						</div>
						<div className="text-right font-mono font-bold text-gray-400">
							<div>Local config: {Math.round((storageBytes / 1024) * 10) / 10} KB</div>
							<div>Vector DB store: {embeddingCount} items</div>
						</div>
					</div>

					{/* Clear Database button */}
					<div className="border-t border-gray-750 pt-4 flex justify-end">
						<button
							type="button"
							onClick={() => setShowClearConfirm(true)}
							className="text-xs px-4 py-2 font-bold rounded-lg bg-red-600 hover:bg-red-500 transition cursor-pointer text-white shadow shadow-red-500/10"
						>
							Wipe Database Settings
						</button>
					</div>
				</div>

				{/* Section 3: AI Settings Shell */}
				<div className="bg-gray-800 rounded-xl border border-gray-700 p-6 flex flex-col gap-4 shadow-xl shadow-black/10">
					<div className="flex items-center justify-between border-b border-gray-700 pb-3">
						<h2 className="text-sm font-bold text-white uppercase tracking-wider">
							🤖 AI Settings
						</h2>
						<span className="text-[9px] font-mono uppercase bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded border border-blue-900/50">
							v0.2.0 Preview
						</span>
					</div>

					<div className="flex flex-col gap-4">
						{/* Gemini API Key */}
						<div className="flex flex-col gap-1.5">
							<div className="flex items-center justify-between">
								<label className="text-xs font-bold text-white" htmlFor="geminiKey">
									Gemini API Key
								</label>
								<button
									type="button"
									onClick={() => setShowGeminiKey(!showGeminiKey)}
									className="text-[10px] text-gray-400 hover:text-white transition"
								>
									{showGeminiKey ? "Hide key" : "Show key"}
								</button>
							</div>
							<div className="flex gap-2">
								<input
									id="geminiKey"
									type={showGeminiKey ? "text" : "password"}
									placeholder="AI Key configuration..."
									value={geminiKey}
									onChange={(e) => handleSaveGeminiKey(e.target.value)}
									className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
								/>
								<button
									type="button"
									disabled
									className="text-xs px-3.5 py-2 rounded-lg bg-gray-700 border border-gray-600 text-gray-500 font-bold cursor-not-allowed"
									title="Coming in v0.2.0"
								>
									Test Key
								</button>
							</div>
						</div>

						{/* Configuration fields */}
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-1">
								<span className="text-xs font-bold text-gray-400">Auto-Heal Selector</span>
								<div className="flex items-center gap-2 mt-1 opacity-50 cursor-not-allowed">
									<input
										id="autoHealCheckbox"
										type="checkbox"
										checked={autoHeal}
										disabled
										className="rounded border-gray-750 bg-gray-900 focus:ring-0 text-blue-600"
									/>
									<label
										htmlFor="autoHealCheckbox"
										className="text-[11px] text-gray-550 select-none"
									>
										Heal without prompt
									</label>
								</div>
							</div>

							<div className="flex flex-col gap-1.5">
								<div className="flex justify-between text-xs text-gray-400">
									<label htmlFor="confidenceSlider" className="font-bold">
										Confidence Threshold
									</label>
									<span className="font-mono">{Math.round(confidenceThreshold * 100)}%</span>
								</div>
								<input
									id="confidenceSlider"
									type="range"
									min="0.3"
									max="0.95"
									step="0.05"
									value={confidenceThreshold}
									disabled
									className="w-full opacity-50 cursor-not-allowed accent-blue-500 mt-1"
								/>
							</div>
						</div>
					</div>
				</div>

				{/* Section 4: About */}
				<div className="bg-gray-800 rounded-xl border border-gray-700 p-6 flex flex-col gap-4 shadow-xl shadow-black/10 text-xs">
					<h2 className="text-sm font-bold text-white uppercase tracking-wider border-b border-gray-700 pb-3">
						💡 About VectorTrace
					</h2>
					<div className="flex flex-col gap-3 text-gray-400 leading-relaxed">
						<p>
							VectorTrace is an open-source, local-first web scraper extension. By employing
							semantic text embeddings running completely in browser memory via Transformers,
							VectorTrace heals broken page selectors automatically when layout structures change.
						</p>
						<p className="font-bold text-gray-300">
							🔒 Privacy Statement: 100% local processing. No user data, scrapers, page text, or
							embeddings leave your browser.
						</p>
						<div className="flex items-center gap-4 mt-2 border-t border-gray-700/60 pt-4 font-semibold">
							<a
								href="https://github.com/SathiyaSenpai/VectorTrace"
								target="_blank"
								rel="noreferrer"
								className="text-blue-400 hover:underline"
							>
								GitHub Repository
							</a>
							<span className="text-gray-650">•</span>
							<a
								href="https://github.com/SathiyaSenpai/VectorTrace/blob/main/CONTRIBUTING.md"
								target="_blank"
								rel="noreferrer"
								className="text-blue-400 hover:underline"
							>
								CONTRIBUTING.md
							</a>
							<span className="text-gray-650">•</span>
							<a
								href="https://github.com/SathiyaSenpai/VectorTrace/issues"
								target="_blank"
								rel="noreferrer"
								className="text-blue-400 hover:underline"
							>
								Report a Bug
							</a>
						</div>
						<div className="mt-2 text-[10px] text-gray-550">License: AGPL-3.0-only</div>
					</div>
				</div>
			</div>

			{/* MODALS */}

			{/* Delete Schema Modal */}
			{deleteSchemaId && (
				<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
					<div className="bg-gray-800 border border-gray-700 rounded-xl p-5 w-full max-w-sm shadow-2xl flex flex-col gap-4">
						<div>
							<h3 className="text-sm font-bold text-white">Delete Schema Layout?</h3>
							<p className="text-xs text-gray-400 mt-1 leading-normal">
								Are you sure you want to delete this schema? All associated field tracking
								configurations and embeddings will be permanently wiped.
							</p>
						</div>
						<div className="flex justify-end gap-2.5">
							<button
								type="button"
								onClick={() => setDeleteSchemaId(null)}
								className="text-xs px-3.5 py-2 font-bold rounded-lg border border-gray-700 hover:bg-gray-700 text-gray-300 transition cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleDeleteSchema}
								className="text-xs px-4 py-2 font-bold rounded-lg bg-red-600 hover:bg-red-500 text-white transition cursor-pointer"
							>
								Delete Schema
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Clear All Data Modal */}
			{showClearConfirm && (
				<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
					<div className="bg-gray-800 border border-gray-700 rounded-xl p-5 w-full max-w-sm shadow-2xl flex flex-col gap-4">
						<div>
							<h3 className="text-sm font-bold text-white">Wipe Database & Settings?</h3>
							<p className="text-xs text-gray-400 mt-1 leading-normal">
								This will wipe all schemas, options configurations, and cached local embeddings.
								This cannot be undone.
							</p>
							<p className="text-xs font-bold text-red-400 mt-2">Type "DELETE" below to confirm:</p>
						</div>

						<input
							type="text"
							value={clearConfirmText}
							onChange={(e) => setClearConfirmText(e.target.value)}
							placeholder="Type DELETE"
							className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-red-500"
						/>

						<div className="flex justify-end gap-2.5">
							<button
								type="button"
								onClick={() => {
									setShowClearConfirm(false);
									setClearConfirmText("");
								}}
								className="text-xs px-3.5 py-2 font-bold rounded-lg border border-gray-700 hover:bg-gray-700 text-gray-300 transition cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleClearAllData}
								className="text-xs px-4 py-2 font-bold rounded-lg bg-red-600 hover:bg-red-500 text-white transition cursor-pointer disabled:bg-red-600/40 disabled:text-white/40 disabled:cursor-not-allowed"
								disabled={clearConfirmText !== "DELETE"}
							>
								Wipe Database
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Toast Notifications */}
			{toast && (
				<div
					className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 px-4 py-2.5 rounded-lg text-xs font-bold shadow-2xl transition-all duration-300 z-50 flex items-center gap-2 border animate-bounce ${
						toast.type === "success"
							? "bg-green-950/90 border-green-800/40 text-green-300"
							: toast.type === "error"
								? "bg-red-950/90 border-red-800/40 text-red-300"
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
