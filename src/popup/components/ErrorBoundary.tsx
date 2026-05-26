import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
	children?: ReactNode;
	theme?: "dark" | "sakura";
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	public state: State = {
		hasError: false,
		error: null,
	};

	public static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("VectorTrace Uncaught exception:", error, errorInfo);
	}

	private handleReset = async () => {
		try {
			await chrome.storage.local.clear();
			window.location.reload();
		} catch (err) {
			console.error("Failed to clear storage:", err);
		}
	};

	public render() {
		if (this.state.hasError) {
			const isSakura = this.props.theme === "sakura";
			return (
				<div
					className={`w-[380px] min-h-[400px] flex flex-col justify-center items-center p-6 text-center font-sans ${
						isSakura ? "bg-[#fff7f7] text-[#3a2d2d]" : "bg-gray-900 text-gray-100"
					}`}
				>
					<span className="text-3xl mb-2">💥</span>
					<h2 className="text-sm font-bold text-red-500">Something went wrong</h2>
					<p
						className={`text-xs mt-2 leading-relaxed max-w-[300px] ${
							isSakura ? "text-[#8a7272]" : "text-gray-400"
						}`}
					>
						VectorTrace encountered an unexpected error:{" "}
						{this.state.error?.message || "Unknown error"}
					</p>
					<div className="flex gap-2.5 mt-6 w-full px-4">
						<button
							type="button"
							onClick={() => window.location.reload()}
							className={`flex-1 text-xs py-2 font-bold rounded-lg transition border ${
								isSakura
									? "bg-white border-[#f5c2c8] text-[#3a2d2d]"
									: "bg-gray-800 border-gray-700 text-gray-200"
							}`}
						>
							Reload Popup
						</button>
						<button
							type="button"
							onClick={this.handleReset}
							className="flex-1 text-xs py-2 font-bold rounded-lg bg-red-600 hover:bg-red-500 text-white transition"
						>
							Reset Extension
						</button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
