import { useState } from "react";
import type { ExtractionResult } from "../../shared/types";

interface ExtractionResultsProps {
	result: ExtractionResult;
	onBack: () => void;
	theme?: "dark" | "sakura";
}

export function ExtractionResults({ result, onBack, theme = "dark" }: ExtractionResultsProps) {
	const [statusMsg, setStatusMsg] = useState("");

	const handleCopyJson = async () => {
		try {
			await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
			setStatusMsg("JSON copied!");
			setTimeout(() => setStatusMsg(""), 2000);
		} catch (err) {
			console.error("Failed to copy JSON:", err);
			setStatusMsg("Failed to copy JSON");
			setTimeout(() => setStatusMsg(""), 2000);
		}
	};

	const handleDownloadCsv = () => {
		try {
			const headers = "Field,Value,Status\n";
			const rows = result.fields
				.map((f) => {
					const escapedLabel = f.label.replace(/"/g, '""');
					const escapedValue = f.value.replace(/"/g, '""');
					return `"${escapedLabel}","${escapedValue}","${f.status}"`;
				})
				.join("\n");

			const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.setAttribute("href", url);
			link.setAttribute("download", `extraction_results_${result.timestamp}.csv`);
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);

			setStatusMsg("CSV downloaded!");
			setTimeout(() => setStatusMsg(""), 2000);
		} catch (err) {
			console.error("Failed to download CSV:", err);
			setStatusMsg("Download failed");
			setTimeout(() => setStatusMsg(""), 2000);
		}
	};

	// Theme Styles
	const isSakura = theme === "sakura";
	const mainBgClass = isSakura ? "bg-[#fff7f7] text-[#3a2d2d]" : "bg-gray-900 text-gray-100";
	const titleTextClass = isSakura
		? "bg-gradient-to-r from-[#f68799] to-[#798c73] bg-clip-text text-transparent"
		: "bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent";
	const statusBadgeClass = isSakura
		? "text-[#798c73] bg-[#798c73]/10"
		: "text-emerald-400 bg-emerald-500/10";
	const tableHeaderClass = isSakura
		? "border-[#fbc5c5] text-[#8a7272] bg-[#fae6e8]/40"
		: "border-gray-800 text-gray-400 bg-gray-950/40";
	const borderClass = isSakura ? "border-[#fbc5c5]" : "border-gray-800";
	const trHoverClass = isSakura ? "hover:bg-[#fae6e8]/20" : "hover:bg-gray-850/40";
	const fieldTextClass = isSakura ? "text-[#3a2d2d]" : "text-gray-200";
	const valueTextClass = isSakura
		? "text-[#554040] bg-[#fffbfb] border-[#fae6e8]/60"
		: "text-gray-300 bg-gray-900/60 border-gray-800";
	const okBadgeClass = isSakura
		? "bg-[#798c73]/20 text-[#4c5f47] border-[#798c73]/15"
		: "bg-green-500/20 text-green-300 border-green-500/10";
	const healedBadgeClass = isSakura
		? "bg-yellow-500/20 text-yellow-800 border-yellow-500/10"
		: "bg-yellow-500/20 text-yellow-300 border-yellow-500/10";
	const brokenBadgeClass = isSakura
		? "bg-red-500/20 text-red-700 border-red-500/10"
		: "bg-red-500/20 text-red-300 border-red-500/10";
	const backBtnClass = isSakura
		? "bg-white border-[#f5c2c8] text-[#7d6767] hover:bg-[#fae6e8]/40"
		: "bg-gray-800 hover:bg-gray-700 text-gray-300";
	const copyBtnClass = isSakura
		? "bg-[#f68799] hover:bg-[#e26275] text-white"
		: "bg-blue-600 hover:bg-blue-500 text-white";
	const downloadBtnClass = isSakura
		? "bg-[#798c73] hover:bg-[#687a63] text-white"
		: "bg-emerald-600 hover:bg-emerald-500 text-white";

	return (
		<div
			className={`w-[380px] min-h-[400px] flex flex-col font-sans p-4 gap-4 select-none transition-colors duration-300 ease-in-out ${mainBgClass}`}
		>
			{/* Top Header */}
			<div className={`flex items-center justify-between border-b pb-3 ${borderClass}`}>
				<h2 className={`text-base font-bold ${titleTextClass}`}>Extraction Results</h2>
				{statusMsg && (
					<span
						className={`text-[10px] px-2 py-0.5 rounded font-medium animate-pulse ${statusBadgeClass}`}
					>
						{statusMsg}
					</span>
				)}
			</div>

			{/* Results List / Table */}
			<div className="flex-1 overflow-y-auto max-h-[260px] pr-1">
				<table className="w-full text-left border-collapse">
					<thead>
						<tr
							className={`border-b text-[10px] uppercase tracking-wider font-semibold ${tableHeaderClass}`}
						>
							<th className="py-2 px-2.5">Field</th>
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
							result.fields.map((f, idx) => (
								<tr
									key={f.fieldId}
									className={`border-b text-xs transition duration-150 ease-in-out ${trHoverClass} ${borderClass} ${
										idx % 2 === 1 && isSakura ? "bg-[#fffbfb]" : ""
									}`}
								>
									<td
										className={`py-2.5 px-2.5 font-medium truncate max-w-[90px] ${fieldTextClass}`}
										title={f.label}
									>
										{f.label || `Field (${f.fieldId.slice(0, 4)})`}
									</td>
									<td
										className={`py-2.5 px-2.5 font-mono break-all max-w-[140px] border rounded ${valueTextClass}`}
										title={f.value}
									>
										{f.value || <span className="text-gray-500 italic">[empty]</span>}
									</td>
									<td className="py-2.5 px-2.5 text-center">
										{f.status === "OK" && (
											<span
												className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border cursor-default ${okBadgeClass}`}
												title="Successfully Extracted"
											>
												✅ OK
											</span>
										)}
										{f.status === "HEALED" && (
											<span
												className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border cursor-help ${healedBadgeClass}`}
												title={`Healed from broken selector!\nFrom: ${f.healedFrom}\nTo: ${f.healedTo}`}
											>
												⚠️ HEALED
											</span>
										)}
										{f.status === "SELECTOR_BROKEN" && (
											<span
												className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border cursor-default animate-pulse ${brokenBadgeClass}`}
												title="Selector Broken & Healing Failed"
											>
												❌ BROKEN
											</span>
										)}
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{/* Buttons Bar */}
			<div className={`flex gap-2 pt-2 border-t mt-auto ${borderClass}`}>
				<button
					type="button"
					onClick={onBack}
					className={`px-3 py-2 font-semibold text-xs rounded-lg transition duration-150 ease-in-out cursor-pointer flex items-center justify-center gap-1.5 ${backBtnClass}`}
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
						<title>Back Icon</title>
						<line x1="19" y1="12" x2="5" y2="12" />
						<polyline points="12 19 5 12 12 5" />
					</svg>
					Back
				</button>
				<button
					type="button"
					onClick={handleCopyJson}
					className={`flex-1 px-3 py-2 font-semibold text-xs rounded-lg shadow-md transition duration-150 ease-in-out cursor-pointer flex items-center justify-center gap-1.5 ${copyBtnClass}`}
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
						<title>Copy Icon</title>
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
					</svg>
					Copy JSON
				</button>
				<button
					type="button"
					onClick={handleDownloadCsv}
					className={`flex-1 px-3 py-2 font-semibold text-xs rounded-lg shadow-md transition duration-150 ease-in-out cursor-pointer flex items-center justify-center gap-1.5 ${downloadBtnClass}`}
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
						<title>Download Icon</title>
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
					</svg>
					Download CSV
				</button>
			</div>
		</div>
	);
}
