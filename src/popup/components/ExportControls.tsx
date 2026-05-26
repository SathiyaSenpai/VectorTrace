import type { ExtractionResult } from "../../shared/types";

interface ExportControlsProps {
	schemaName: string;
	result: ExtractionResult;
	theme?: "dark" | "sakura";
}

export function ExportControls({ schemaName, result, theme = "dark" }: ExportControlsProps) {
	const isSakura = theme === "sakura";

	const handleExportJson = () => {
		const jsonString = JSON.stringify(result, null, 2);
		const blob = new Blob([jsonString], { type: "application/json;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		const cleanSchemaName = schemaName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
		link.setAttribute("href", url);
		link.setAttribute("download", `vectortrace-${cleanSchemaName}-${result.timestamp}.json`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	const handleExportCsv = () => {
		const headers = "Label,Value,Status\n";
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
		const cleanSchemaName = schemaName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
		link.setAttribute("href", url);
		link.setAttribute("download", `vectortrace-${cleanSchemaName}-${result.timestamp}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	const btnClass = isSakura
		? "flex-1 px-3 py-2 bg-white border border-[#f5c2c8] text-[#7d6767] hover:bg-[#fae6e8]/40 font-semibold text-xs rounded-lg transition duration-150 ease-in-out cursor-pointer flex items-center justify-center gap-1.5"
		: "flex-1 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-semibold text-xs rounded-lg transition duration-150 ease-in-out cursor-pointer flex items-center justify-center gap-1.5";

	return (
		<div className="flex gap-2 w-full transition-colors duration-300 ease-in-out">
			<button type="button" onClick={handleExportJson} className={btnClass}>
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
					<title>JSON Icon</title>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
				</svg>
				Export JSON
			</button>
			<button type="button" onClick={handleExportCsv} className={btnClass}>
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
					<title>CSV Icon</title>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
				</svg>
				Export CSV
			</button>
		</div>
	);
}
