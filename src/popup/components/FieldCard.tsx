import { useState } from "react";
import type { FieldDefinition } from "../../shared/types";

interface FieldCardProps {
	field: Omit<FieldDefinition, "embedding">;
	status?: "OK" | "SELECTOR_BROKEN" | "HEALED";
	value?: string;
	onUpdateLabel: (fieldId: string, label: string) => void;
	onDelete: (fieldId: string) => void;
}

export function FieldCard({
	field,
	status = "OK",
	value,
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

	return (
		<div className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-gray-650 transition duration-150 ease-in-out flex flex-col gap-1.5 w-full">
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
							className="w-full bg-gray-900 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-gray-100 focus:outline-none"
						/>
					) : (
						<div className="flex items-center gap-1.5 w-full">
							<button
								type="button"
								onClick={() => setIsEditing(true)}
								className="text-sm font-semibold text-gray-100 hover:text-blue-400 cursor-pointer truncate max-w-[200px] text-left block"
								title="Click to rename"
							>
								{field.label || `Field (${field.fieldId.slice(0, 4)})`}
							</button>
							<button
								type="button"
								onClick={() => setIsEditing(true)}
								className="text-gray-500 hover:text-gray-300 p-0.5 transition-colors flex-shrink-0"
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
						className="text-gray-400 hover:text-red-500 p-1 rounded transition duration-150"
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
				className="font-mono text-[10.5px] text-gray-500 truncate select-all cursor-help"
				title={`Selector: ${field.cssSelector}\nXPath: ${field.xpathSelector}`}
			>
				{field.cssSelector}
			</div>

			{/* Text Content Preview */}
			<div className="text-xs text-gray-400 truncate italic bg-gray-900/40 px-2 py-1 rounded border border-gray-800/60 mt-0.5">
				"{previewText.length > 50 ? `${previewText.slice(0, 50)}...` : previewText}"
			</div>
		</div>
	);
}
