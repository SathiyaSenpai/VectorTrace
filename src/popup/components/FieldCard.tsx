import { useState } from "react";
import type { FieldDefinition } from "../../shared/types";

interface FieldCardProps {
	field: Omit<FieldDefinition, "embedding">;
	status?: "OK" | "SELECTOR_BROKEN" | "HEALED";
	value?: string;
	theme?: "dark" | "sakura";
	onUpdateLabel: (fieldId: string, label: string) => void;
	onDelete: (fieldId: string) => void;
}

export function FieldCard({
	field,
	status = "OK",
	value,
	theme = "dark",
	onUpdateLabel,
	onDelete,
}: FieldCardProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [labelText, setLabelText] = useState(field.label || `Field (${field.fieldId.slice(0, 4)})`);

	const handleSave = () => {
		setIsEditing(false);
		const trimmed = labelText.trim();
		if (trimmed && trimmed !== field.label) {
			onUpdateLabel(field.fieldId, trimmed);
		} else {
			setLabelText(field.label || `Field (${field.fieldId.slice(0, 4)})`);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			handleSave();
		} else if (e.key === "Escape") {
			setIsEditing(false);
			setLabelText(field.label || `Field (${field.fieldId.slice(0, 4)})`);
		}
	};

	const previewText = value !== undefined ? value : field.textContent;

	// Theme classes
	const isSakura = theme === "sakura";
	const cardClass = isSakura
		? "bg-white border-[#f5c2c8] hover:border-[#f68799] text-[#3a2d2d]"
		: "bg-gray-800 border-gray-700 hover:border-gray-650 text-gray-100";
	const inputClass = isSakura
		? "bg-white border-[#f68799] text-[#3a2d2d] focus:outline-none"
		: "bg-gray-900 border-blue-500 text-gray-100 focus:outline-none";
	const labelHoverClass = isSakura
		? "text-[#3a2d2d] hover:text-[#f68799]"
		: "text-gray-100 hover:text-blue-400";
	const editIconColor = isSakura ? "text-[#8a7272]" : "text-gray-500";
	const selectorClass = isSakura ? "text-[#8a7272]" : "text-gray-550";
	const previewClass = isSakura
		? "bg-[#fff8f8] border-[#fae6e8] text-[#554040]"
		: "bg-gray-900/40 border-gray-800/60 text-gray-400";
	const deleteBtnClass = isSakura
		? "text-[#8a7272] hover:text-red-500 hover:bg-[#fae6e8]/40"
		: "text-gray-400 hover:text-red-500 hover:bg-gray-750";

	return (
		<div
			className={`rounded-lg p-3 border transition duration-150 ease-in-out flex flex-col gap-1.5 w-full ${cardClass}`}
		>
			<div className="flex items-center justify-between gap-2">
				{/* Inline Edit Label */}
				<div className="flex-1 min-w-0">
					{isEditing ? (
						<input
							type="text"
							value={labelText}
							onChange={(e) => setLabelText(e.target.value)}
							onBlur={handleSave}
							onKeyDown={handleKeyDown}
							// biome-ignore lint/a11y/noAutofocus: Standard inline text renaming behavior
							autoFocus
							className={`w-full border rounded px-1.5 py-0.5 text-xs ${inputClass}`}
						/>
					) : (
						<div className="flex items-center gap-1.5 w-full">
							<button
								type="button"
								onClick={() => setIsEditing(true)}
								className={`text-sm font-semibold cursor-pointer truncate max-w-[200px] text-left block ${labelHoverClass}`}
								title="Click to rename"
							>
								{field.label || `Field (${field.fieldId.slice(0, 4)})`}
							</button>
							<button
								type="button"
								onClick={() => setIsEditing(true)}
								className={`${editIconColor} hover:text-gray-300 p-0.5 transition-colors flex-shrink-0`}
								title="Edit label"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="11"
									height="11"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<title>Edit Label</title>
									<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
								</svg>
							</button>
						</div>
					)}
				</div>

				<div className="flex items-center gap-2">
					{/* Status Dot */}
					<span
						className={`w-2.5 h-2.5 rounded-full inline-block flex-shrink-0 ${
							status === "SELECTOR_BROKEN" ? "bg-red-500 animate-pulse" : "bg-green-500"
						}`}
						title={`Selector Status: ${status}`}
					/>

					{/* Delete Button */}
					<button
						type="button"
						onClick={() => onDelete(field.fieldId)}
						className={`p-1 rounded transition duration-150 ${deleteBtnClass}`}
						title="Delete field"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<title>Delete Field</title>
							<path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
						</svg>
					</button>
				</div>
			</div>

			{/* CSS Selector */}
			<div
				className={`font-mono text-[10.5px] truncate select-all cursor-help ${selectorClass}`}
				title={`Selector: ${field.cssSelector}\nXPath: ${field.xpathSelector}`}
			>
				{field.cssSelector}
			</div>

			{/* Text Content Preview */}
			<div className={`text-xs truncate italic px-2 py-1 rounded border mt-0.5 ${previewClass}`}>
				"{previewText.length > 50 ? `${previewText.slice(0, 50)}...` : previewText}"
			</div>
		</div>
	);
}
