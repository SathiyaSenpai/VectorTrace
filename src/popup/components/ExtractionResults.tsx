import { useState } from "react";
import type { ExtractionResult } from "../../shared/types";
import { ExportControls } from "./ExportControls";

interface ExtractionResultsProps {
	schemaName: string;
	result: ExtractionResult;
	onBack: () => void;
	onFindReplacement?: (fieldId: string) => Promise<void>;
	theme?: "dark" | "sakura";
}

export function ExtractionResults({
	schemaName,
	result,
	onBack,
	onFindReplacement,
	theme = "dark",
}: ExtractionResultsProps) {
	const [healingStatus, setHealingStatus] = useState<Record<string, string>>({});

	const handleFind = async (fieldId: string) => {
		if (!onFindReplacement) return;
		setHealingStatus((prev) => ({ ...prev, [fieldId]: "Healing..." }));
		try {
			await onFindReplacement(fieldId);
			setHealingStatus((prev) => ({ ...prev, [fieldId]: "Flow started" }));
			setTimeout(() => {
				setHealingStatus((prev) => {
					const updated = { ...prev };
					delete updated[fieldId];
					return updated;
				});
			}, 3000);
		} catch (_err) {
			setHealingStatus((prev) => ({ ...prev, [fieldId]: "Failed" }));
			setTimeout(() => {
				setHealingStatus((prev) => {
					const updated = { ...prev };
					delete updated[fieldId];
					return updated;
				});
			}, 3000);
		}
	};

	const isSakura = theme === "sakura";
	const formattedTime = new Date(result.timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	// Theme Styles
	const mainBgClass = isSakura ? "bg-[#fff7f7] text-[#3a2d2d]" : "bg-gray-900 text-gray-100";
	const titleTextClass = isSakura
		? "bg-gradient-to-r from-[#f68799] to-[#798c73] bg-clip-text text-transparent"
		: "bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent";
	const borderClass = isSakura ? "border-[#fbc5c5]" : "border-gray-700";
	const trHoverClass = isSakura ? "hover:bg-[#fae6e8]/20" : "hover:bg-gray-800/50";
	const tableHeaderClass = isSakura
		? "bg-[#fae6e8] text-[#8a7272] border-[#fbc5c5]"
		: "bg-gray-800 text-gray-300 border-gray-700";
	const subTextColor = isSakura ? "text-[#8a7272]" : "text-gray-400";
	const valueTextClass = isSakura
		? "text-[#554040] bg-[#fffbfb] border-[#fae6e8]"
		: "text-gray-300 bg-gray-950/60 border-gray-800";
	const fieldTextClass = isSakura ? "text-[#3a2d2d]" : "text-gray-200";

	// Status badge styles
	const okBadgeClass = isSakura
		? "bg-[#798c73]/20 text-[#4c5f47] border-[#798c73]/15"
		: "bg-green-500/20 text-green-300 border-green-500/10";
	const healedBadgeClass = isSakura
		? "bg-yellow-500/20 text-yellow-800 border-yellow-500/10"
		: "bg-yellow-500/20 text-yellow-300 border-yellow-500/10";
	const brokenBadgeClass = isSakura
		? "bg-red-500/20 text-red-700 border-red-500/10"
		: "bg-red-500/20 text-red-300 border-red-500/10";

	// Healed tooltip info helper
	const getHealedTooltip = (f: { status: string; healedFrom?: string; healedTo?: string }) => {
		if (f.status === "HEALED" && f.healedFrom && f.healedTo) {
			return `Healed from broken selector!\nOld: ${f.healedFrom}\nNew: ${f.healedTo}`;
		}
		return "Selector automatically restored";
	};

	return (
		<div
			className={`w-[380px] min-h-[400px] flex flex-col font-sans p-4 gap-4 select-none transition-colors duration-300 ease-in-out ${mainBgClass}`}
		>
			{/* Top Header */}
			<div className={`flex items-center justify-between border-b pb-3 ${borderClass}`}>
				<div className="flex flex-col">
					<h2 className={`text-base font-bold ${titleTextClass}`}>Extraction Results</h2>
					<span className={`text-[10px] ${subTextColor}`}>Extracted at {formattedTime}</span>
				</div>
				<button
					type="button"
					onClick={onBack}
					className={`px-2.5 py-1 text-xs rounded border transition duration-150 flex items-center gap-1 ${
						isSakura
							? "bg-white border-[#f5c2c8] text-[#7d6767] hover:bg-[#fae6e8]/40"
							: "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
					}`}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="10"
						height="10"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="3"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<title>Back Icon</title>
						<line x1="19" y1="12" x2="5" y2="12" />
						<polyline points="12 19 5 12 12 5" />
					</svg>
					Back
				</button>
			</div>

			{/* Results Table */}
			<div className="flex-1 overflow-y-auto max-h-[220px] pr-1">
				<table className="w-full text-sm text-left border-collapse">
					<thead>
						<tr
							className={`border-b uppercase text-xs tracking-wider font-semibold ${tableHeaderClass}`}
						>
							<th className="py-2 px-2.5">Field Label</th>
							<th className="py-2 px-2.5">Value</th>
							<th className="py-2 px-2.5 text-center">Status</th>
						</tr>
					</thead>
					<tbody>
						{result.fields.length === 0 ? (
							<tr>
								<td colSpan={3} className="text-center py-8 text-xs text-gray-500 italic">
									No fields were extracted.
								</td>
							</tr>
						) : (
							result.fields.map((f) => (
								<tr
									key={f.fieldId}
									className={`border-b transition duration-150 ease-in-out ${trHoverClass} ${borderClass}`}
								>
									<td
										className={`py-2 px-2.5 font-medium truncate max-w-[85px] ${fieldTextClass}`}
										title={f.label}
									>
										{f.label || `Field (${f.fieldId.slice(0, 4)})`}
									</td>
									<td
										className={`py-2 px-2.5 font-mono break-all max-w-[130px] border rounded text-xs ${valueTextClass}`}
										title={f.value}
									>
										{f.value || <span className="text-gray-500 italic">[empty]</span>}
									</td>
									<td className="py-2 px-2.5 text-center">
										<div className="flex flex-col items-center justify-center gap-1">
											{f.status === "OK" && (
												<span
													className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border cursor-default ${okBadgeClass}`}
													title="Successfully Extracted"
												>
													<span className="w-1.5 h-1.5 rounded-full bg-green-400" />✅ OK
												</span>
											)}
											{f.status === "HEALED" && (
												<span
													className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border cursor-help ${healedBadgeClass}`}
													title={getHealedTooltip(f)}
												>
													<span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
													⚠️ HEALED
												</span>
											)}
											{f.status === "SELECTOR_BROKEN" && (
												<div className="flex flex-col items-center gap-1">
													<span
														className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border cursor-default ${brokenBadgeClass}`}
														title="Selector Broken"
													>
														<span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />❌
														BROKEN
													</span>
													<button
														type="button"
														onClick={() => handleFind(f.fieldId)}
														className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition duration-150 text-white ${
															isSakura
																? "bg-[#f68799] hover:bg-[#e26275]"
																: "bg-red-600 hover:bg-red-500"
														}`}
													>
														{healingStatus[f.fieldId] || "Find Replacement"}
													</button>
												</div>
											)}
										</div>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{/* Bottom Export Controls */}
			<div className={`pt-3 border-t mt-auto ${borderClass}`}>
				<ExportControls schemaName={schemaName} result={result} theme={theme} />
			</div>
		</div>
	);
}
