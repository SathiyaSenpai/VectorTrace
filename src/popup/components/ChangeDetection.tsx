import { useEffect } from "react";
import type { FieldDefinition, SimilarityCandidate } from "../../shared/types";
import { useChangeDetection } from "../hooks/useChangeDetection";
import { sendMessageWithRetry } from "../utils/messaging";

type ChangeDetectionProps = {
	schemaId: string;
	field: FieldDefinition;
	onAccept: () => void;
	onCancel: () => void;
	theme?: "dark" | "sakura";
};

export function ChangeDetection({
	schemaId,
	field,
	onAccept,
	onCancel,
	theme = "dark",
}: ChangeDetectionProps) {
	const { candidates, isSearching, progress, findCandidates, acceptCandidate } = useChangeDetection(
		schemaId,
		onAccept,
	);

	// Automatically trigger search on mount
	useEffect(() => {
		findCandidates(field.fieldId);
	}, [field.fieldId, findCandidates]);

	const isSakura = theme === "sakura";

	// Trigger preview on web page
	const handlePreview = async (candidate: SimilarityCandidate) => {
		try {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (tab?.id) {
				await sendMessageWithRetry(tab.id, {
					type: "HIGHLIGHT_ELEMENT",
					cssSelector: candidate.cssSelector,
				});
			}
		} catch (err) {
			console.error("Failed to send highlight instruction:", err);
		}
	};

	const handleAccept = async (candidate: SimilarityCandidate) => {
		try {
			await acceptCandidate(field.fieldId, candidate);
		} catch (err) {
			console.error("Failed to accept candidate:", err);
		}
	};

	// Progress percentage
	const progressPercent =
		progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

	// Theme classes mapping
	const bgClass = isSakura ? "bg-[#fff7f7] text-[#3a2d2d]" : "bg-gray-900 text-gray-100";
	const cardBg = isSakura ? "bg-white border-[#f5c2c8]" : "bg-gray-800 border-gray-700";
	const progressBg = isSakura ? "bg-[#fae6e8]" : "bg-gray-950";
	const progressFill = isSakura
		? "bg-gradient-to-r from-[#ffdce3] to-[#f68799]"
		: "bg-gradient-to-r from-blue-600 to-cyan-500";
	const badgeHigh = isSakura
		? "bg-green-100 text-green-700 border-green-200"
		: "bg-green-500/20 text-green-400 border border-green-500/30";
	const badgeMedium = isSakura
		? "bg-yellow-100 text-yellow-700 border-yellow-200"
		: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
	const badgeLow = isSakura
		? "bg-red-100 text-red-700 border-red-200"
		: "bg-red-500/20 text-red-400 border border-red-500/30";

	// Filter candidates by score > 0.4
	const filteredCandidates = candidates.filter((c) => c.score > 0.4);

	return (
		<div className={`flex-1 flex flex-col p-4 gap-4 ${bgClass}`}>
			{/* Top Header */}
			<div className="flex flex-col gap-1">
				<div className="flex items-center justify-between">
					<h3 className="text-xs font-black uppercase tracking-wider">🔍 Selector Recovery</h3>
					<button
						type="button"
						onClick={onCancel}
						className={`text-[10px] px-2 py-1 font-bold rounded-lg border transition ${
							isSakura
								? "bg-white border-[#f5c2c8] text-[#8a7272] hover:bg-[#fae6e8]/40"
								: "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700"
						}`}
					>
						Cancel
					</button>
				</div>
				<p className="text-xs font-bold leading-tight">
					Finding replacement for:{" "}
					<span className={isSakura ? "text-[#d65b70]" : "text-blue-400"}>
						{field.label || "Untitled Field"}
					</span>
				</p>
				{field.textContent && (
					<div
						className={`p-2 rounded-lg text-[10px] italic border max-h-[48px] overflow-y-auto ${
							isSakura ? "bg-[#fae6e8]/30 border-[#f5c2c8]" : "bg-gray-950/40 border-gray-800"
						}`}
					>
						Original content: "{field.textContent}"
					</div>
				)}
			</div>

			{/* Loading / Progress State */}
			{isSearching && (
				<div className="flex-1 flex flex-col justify-center items-center gap-4 py-8">
					<div className="flex flex-col items-center gap-1.5 w-full max-w-[280px]">
						<div className="flex justify-between w-full text-[10px] font-semibold">
							<span>Analyzing page elements...</span>
							<span>
								{progress.current}/{progress.total}
							</span>
						</div>
						<div className={`w-full h-2 rounded-full overflow-hidden ${progressBg}`}>
							<div
								className={`h-full rounded-full transition-all duration-300 ${progressFill}`}
								style={{ width: `${progressPercent}%` }}
							/>
						</div>
					</div>
					<span className="text-[10px] text-gray-500 animate-pulse">
						Generating embeddings & ranking candidates...
					</span>
				</div>
			)}

			{/* Search Completed */}
			{!isSearching && (
				<div className="flex-1 flex flex-col min-h-0">
					{filteredCandidates.length > 0 ? (
						<div className="flex-col flex gap-2">
							<span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
								Top Candidates ({filteredCandidates.length})
							</span>
							<div className="flex-1 max-h-[250px] overflow-y-auto flex flex-col gap-2.5 pr-1">
								{filteredCandidates.map((cand) => {
									let badgeClass = badgeLow;
									if (cand.confidence === "HIGH") badgeClass = badgeHigh;
									else if (cand.confidence === "MEDIUM") badgeClass = badgeMedium;

									return (
										<div
											key={cand.cssSelector}
											className={`flex flex-col gap-2 p-3 rounded-lg border shadow-sm transition hover:scale-[1.01] duration-150 ${cardBg}`}
										>
											<div className="flex items-center justify-between">
												<span
													className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${badgeClass}`}
												>
													{cand.confidence}
												</span>
												<span className="text-xs font-black text-right">
													{Math.round(cand.score * 1000) / 10}% match
												</span>
											</div>

											{/* Text Snippet Preview */}
											<p
												className={`text-[11px] leading-relaxed line-clamp-2 ${
													isSakura ? "text-[#5c4a4a]" : "text-gray-300"
												}`}
											>
												"{cand.textContent.substring(0, 100)}"
											</p>

											{/* Selector code */}
											<div
												className={`text-[9px] font-mono p-1.5 rounded border overflow-x-auto whitespace-nowrap scrollbar-thin ${
													isSakura
														? "bg-[#fae6e8]/30 border-[#f5c2c8]"
														: "bg-gray-950/50 border-gray-800"
												}`}
											>
												{cand.cssSelector}
											</div>

											{/* Action row */}
											<div className="flex gap-2">
												<button
													type="button"
													onClick={() => handlePreview(cand)}
													className={`flex-1 text-[10px] py-1.5 font-bold rounded-lg border transition ${
														isSakura
															? "bg-white border-[#f5c2c8] text-[#8a7272] hover:bg-[#fae6e8]/45"
															: "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
													}`}
												>
													👁️ Preview
												</button>
												<button
													type="button"
													onClick={() => handleAccept(cand)}
													className={`flex-1 text-[10px] py-1.5 font-bold rounded-lg text-white transition ${
														isSakura
															? "bg-[#f68799] hover:bg-[#d65b70] shadow-sm border border-[#e5677a]"
															: "bg-blue-600 hover:bg-blue-500 shadow-sm border border-blue-700"
													}`}
												>
													✅ Accept
												</button>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					) : (
						<div className="flex-1 flex flex-col justify-center items-center text-center p-6 gap-2">
							<div className="text-xl">⚠️</div>
							<p className="text-xs font-bold leading-tight">No match found</p>
							<p className="text-[10px] text-gray-500 max-w-[240px]">
								No similar elements found. Try manually selecting a new element using the Element
								Picker.
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
