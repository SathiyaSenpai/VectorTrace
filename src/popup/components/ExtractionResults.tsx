import { useState } from "react";
import type { ExtractionResult, ExtractionStatus } from "../../shared/types";
import { ExportControls } from "./ExportControls";

type ExtractionResultsProps = {
	schemaName: string;
	result: ExtractionResult;
	onBack: () => void;
	onFindReplacement?: (fieldId: string) => Promise<void>;
	onReExtract?: () => Promise<void>;
	theme?: "dark" | "sakura";
};

/** Human-readable, single-line diagnosis for each extraction status. */
const STATUS_DIAGNOSIS: Record<ExtractionStatus, string> = {
	OK: "Selector resolved and the text matches what was captured.",
	HEALED: "Selector was repaired automatically and now resolves.",
	SELECTOR_BROKEN: "Selector matched nothing — the element is missing from the DOM.",
	TEXT_CONTENT_CHANGED:
		"Selector resolved a different element — the text drifted from the stored content.",
	ELEMENT_HIDDEN: "Selector resolved a hidden element (display:none / visibility:hidden).",
	EMPTY_PAGE: "The page appears empty, blocked, or still loading.",
};

export function ExtractionResults({
	schemaName,
	result,
	onBack,
	onFindReplacement,
	onReExtract,
	theme = "dark",
}: ExtractionResultsProps) {
	const [healingStatus, setHealingStatus] = useState<Record<string, string>>({});
	const [isReExtracting, setIsReExtracting] = useState(false);

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

	const handleReExtract = async () => {
		if (!onReExtract || isReExtracting) return;
		setIsReExtracting(true);
		try {
			await onReExtract();
		} catch (err) {
			console.error("Re-extraction failed:", err);
		} finally {
			setIsReExtracting(false);
		}
	};

	// Aggregate per-status counts for the health summary banner.
	const counts = result.fields.reduce<Record<ExtractionStatus, number>>(
		(acc, f) => {
			acc[f.status] = (acc[f.status] ?? 0) + 1;
			return acc;
		},
		{
			OK: 0,
			HEALED: 0,
			SELECTOR_BROKEN: 0,
			TEXT_CONTENT_CHANGED: 0,
			ELEMENT_HIDDEN: 0,
			EMPTY_PAGE: 0,
		},
	);
	const totalFields = result.fields.length;
	const problemCount = counts.SELECTOR_BROKEN + counts.TEXT_CONTENT_CHANGED + counts.ELEMENT_HIDDEN;

	// One-line overall diagnosis for the summary banner.
	let summaryHeadline: string;
	let summaryTone: "ok" | "warn" | "error";
	if (counts.EMPTY_PAGE === totalFields && totalFields > 0) {
		summaryHeadline = STATUS_DIAGNOSIS.EMPTY_PAGE;
		summaryTone = "error";
	} else if (problemCount > 0) {
		summaryHeadline = `${problemCount} of ${totalFields} field${
			totalFields === 1 ? "" : "s"
		} need attention.`;
		summaryTone = "warn";
	} else if (counts.HEALED > 0) {
		summaryHeadline = `All fields resolved — ${counts.HEALED} auto-repaired this run.`;
		summaryTone = "ok";
	} else {
		summaryHeadline = "All fields extracted successfully.";
		summaryTone = "ok";
	}

	const isSakura = theme === "sakura";
	const formattedTime = new Date(result.timestamp).toLocaleString();

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
	const contentChangedBadgeClass = isSakura
		? "bg-orange-500/20 text-orange-700 border-orange-500/10"
		: "bg-orange-500/20 text-orange-300 border-orange-500/10";
	const hiddenBadgeClass = isSakura
		? "bg-gray-400/20 text-gray-600 border-gray-400/10"
		: "bg-gray-500/20 text-gray-400 border-gray-500/10";
	const emptyPageBadgeClass = isSakura
		? "bg-gray-400/20 text-gray-600 border-gray-400/10"
		: "bg-gray-500/20 text-gray-400 border-gray-500/10";

	// Healed tooltip info helper
	const getHealedTooltip = (f: { status: string; healedFrom?: string; healedTo?: string }) => {
		if (f.status === "HEALED" && f.healedFrom && f.healedTo) {
			return `${f.healedFrom} → ${f.healedTo}`;
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
				<div className="flex items-center gap-2">
					{onReExtract && (
						<button
							type="button"
							onClick={handleReExtract}
							disabled={isReExtracting}
							className={`px-2.5 py-1 text-xs rounded border transition duration-150 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${
								isSakura
									? "bg-white border-[#f5c2c8] text-[#d65b70] hover:bg-[#fae6e8]/40"
									: "bg-gray-800 border-gray-700 text-blue-300 hover:bg-gray-700"
							}`}
							title="Re-run extraction on the current page"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="10"
								height="10"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								className={isReExtracting ? "animate-spin" : ""}
							>
								<title>Re-extract Icon</title>
								<polyline points="23 4 23 10 17 10" />
								<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
							</svg>
							{isReExtracting ? "Running..." : "Re-run"}
						</button>
					)}
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
			</div>

			{/* Field Health Summary Banner */}
			{totalFields > 0 && (
				<div
					className={`rounded-lg border px-3 py-2 flex flex-col gap-1.5 ${
						summaryTone === "ok"
							? isSakura
								? "bg-[#eef6ed] border-[#cfe3cb] text-[#4c5f47]"
								: "bg-emerald-950/40 border-emerald-800/40 text-emerald-300"
							: summaryTone === "warn"
								? isSakura
									? "bg-[#fff5e8] border-[#f5d9b0] text-[#9a6a1f]"
									: "bg-amber-950/40 border-amber-800/40 text-amber-300"
								: isSakura
									? "bg-[#fff2f2] border-[#f8d7da] text-[#c92437]"
									: "bg-red-950/40 border-red-800/40 text-red-300"
					}`}
				>
					<div className="flex items-center gap-1.5">
						<span>{summaryTone === "ok" ? "✅" : summaryTone === "warn" ? "⚠️" : "❌"}</span>
						<span className="text-[11px] font-bold leading-tight">{summaryHeadline}</span>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{counts.OK > 0 && (
							<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/15 border border-green-500/20 text-green-500">
								✅ {counts.OK} OK
							</span>
						)}
						{counts.HEALED > 0 && (
							<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/20 text-yellow-500">
								🩹 {counts.HEALED} Healed
							</span>
						)}
						{counts.TEXT_CONTENT_CHANGED > 0 && (
							<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/20 text-orange-500">
								⚠️ {counts.TEXT_CONTENT_CHANGED} Drifted
							</span>
						)}
						{counts.SELECTOR_BROKEN > 0 && (
							<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-500/20 text-red-500">
								❌ {counts.SELECTOR_BROKEN} Broken
							</span>
						)}
						{counts.ELEMENT_HIDDEN > 0 && (
							<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-500/15 border border-gray-500/20 text-gray-400">
								👁️ {counts.ELEMENT_HIDDEN} Hidden
							</span>
						)}
						{counts.EMPTY_PAGE > 0 && (
							<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-500/15 border border-gray-500/20 text-gray-400">
								📄 {counts.EMPTY_PAGE} Empty
							</span>
						)}
					</div>
				</div>
			)}

			{/* Results Table */}
			<div className="flex-1 overflow-y-auto max-h-[220px] pr-1 custom-scrollbar">
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
										<div className="flex items-center justify-between gap-1 group w-full">
											<span className="truncate select-text flex-1">
												{f.value || <span className="text-gray-500 italic">[empty]</span>}
											</span>
											{f.value && (
												<button
													type="button"
													onClick={() => {
														navigator.clipboard.writeText(f.value).catch((err) => {
															console.error("Failed to copy value:", err);
														});
													}}
													className="opacity-0 group-hover:opacity-100 transition text-gray-500 hover:text-gray-300 ml-1 flex-shrink-0 cursor-pointer"
													title="Copy value"
												>
													📋
												</button>
											)}
											{f.status === "TEXT_CONTENT_CHANGED" && (
												<div className="flex flex-col items-center gap-1">
													<span
														className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border cursor-help ${contentChangedBadgeClass}`}
														title={`Text changed — Expected: "${f.storedText?.slice(0, 80) || ""}" but got: "${f.value?.slice(0, 80) || ""}"`}
													>
														<span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
														⚠️ DRIFTED
													</span>
													<button
														type="button"
														onClick={() => handleFind(f.fieldId)}
														className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition duration-150 text-white ${
															isSakura
																? "bg-[#f68799] hover:bg-[#e26275]"
																: "bg-orange-600 hover:bg-orange-500"
														}`}
													>
														{healingStatus[f.fieldId] || "Find Replacement"}
													</button>
												</div>
											)}
											{f.status === "ELEMENT_HIDDEN" && (
												<span
													className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border cursor-help ${hiddenBadgeClass}`}
													title="Selector matched an element, but it is hidden (display:none / visibility:hidden)"
												>
													<span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
													👁️ HIDDEN
												</span>
											)}
											{f.status === "EMPTY_PAGE" && (
												<span
													className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border cursor-help ${emptyPageBadgeClass}`}
													title="The page appears empty, blocked, or still loading"
												>
													<span className="w-1.5 h-1.5 rounded-full bg-gray-400" />📄 EMPTY
												</span>
											)}
										</div>
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
