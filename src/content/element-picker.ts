export class ElementPicker {
	private onSelect: (element: HTMLElement) => void;
	private onDeactivate?: () => void;
	private active = false;
	private overlay: HTMLDivElement | null = null;
	private tooltip: HTMLDivElement | null = null;
	private closeButton: HTMLButtonElement | null = null;
	private originalBodyCursor = "";

	constructor(options: { onSelect: (element: HTMLElement) => void; onDeactivate?: () => void }) {
		this.onSelect = options.onSelect;
		this.onDeactivate = options.onDeactivate;
	}

	public activate(): void {
		if (this.active) return;
		this.active = true;
		this.originalBodyCursor = document.body.style.cursor;
		document.body.style.cursor = "crosshair";
		this.createElements();
		document.body.addEventListener("mouseover", this.handleMouseOver, true);
		document.body.addEventListener("mousemove", this.handleMouseMove, true);
		document.body.addEventListener("click", this.handleClick, true);
		document.addEventListener("keydown", this.handleKeyDown, true);
	}

	public deactivate(): void {
		if (!this.active) return;
		this.active = false;
		document.body.style.cursor = this.originalBodyCursor;
		document.body.removeEventListener("mouseover", this.handleMouseOver, true);
		document.body.removeEventListener("mousemove", this.handleMouseMove, true);
		document.body.removeEventListener("click", this.handleClick, true);
		document.removeEventListener("keydown", this.handleKeyDown, true);

		this.cleanupElements();
		if (this.onDeactivate) {
			this.onDeactivate();
		}
	}

	private createElements(): void {
		this.overlay = document.createElement("div");
		this.overlay.setAttribute("data-vectortrace", "overlay");
		Object.assign(this.overlay.style, {
			position: "fixed",
			zIndex: "2147483647",
			pointerEvents: "none",
			backgroundColor: "rgba(59, 130, 246, 0.3)",
			border: "2px solid #3b82f6",
			borderRadius: "2px",
			transition: "all 0.05s ease",
			display: "none",
		});
		document.body.appendChild(this.overlay);

		this.tooltip = document.createElement("div");
		this.tooltip.setAttribute("data-vectortrace", "tooltip");
		Object.assign(this.tooltip.style, {
			position: "fixed",
			zIndex: "2147483647",
			pointerEvents: "none",
			backgroundColor: "#1e293b",
			color: "#ffffff",
			padding: "4px 8px",
			borderRadius: "4px",
			fontSize: "12px",
			fontFamily: "sans-serif",
			border: "1px solid #3b82f6",
			display: "none",
			boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
		});
		document.body.appendChild(this.tooltip);

		this.closeButton = document.createElement("button");
		this.closeButton.setAttribute("data-vectortrace", "close-button");
		this.closeButton.setAttribute("title", "Exit Selection Mode (Esc)");

		Object.assign(this.closeButton.style, {
			position: "fixed",
			top: "20px",
			right: "20px",
			width: "40px",
			height: "40px",
			borderRadius: "50%",
			border: "1px solid rgba(255, 255, 255, 0.15)",
			backgroundColor: "rgba(30, 41, 59, 0.85)",
			color: "#ffffff",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			cursor: "pointer",
			zIndex: "2147483647",
			boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
			backdropFilter: "blur(8px)",
			transition: "all 0.2s ease-in-out",
			padding: "0",
			outline: "none",
		});

		this.closeButton.innerHTML = `
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
				<line x1="18" y1="6" x2="6" y2="18"></line>
				<line x1="6" y1="6" x2="18" y2="18"></line>
			</svg>
		`;

		this.closeButton.addEventListener("mouseenter", () => {
			if (this.closeButton) {
				this.closeButton.style.backgroundColor = "rgba(239, 68, 68, 0.9)";
				this.closeButton.style.borderColor = "rgba(239, 68, 68, 0.2)";
				this.closeButton.style.transform = "scale(1.08)";
			}
		});

		this.closeButton.addEventListener("mouseleave", () => {
			if (this.closeButton) {
				this.closeButton.style.backgroundColor = "rgba(30, 41, 59, 0.85)";
				this.closeButton.style.borderColor = "rgba(255, 255, 255, 0.15)";
				this.closeButton.style.transform = "scale(1)";
			}
		});

		document.body.appendChild(this.closeButton);
	}

	private cleanupElements(): void {
		if (this.overlay?.parentNode) {
			this.overlay.parentNode.removeChild(this.overlay);
		}
		if (this.tooltip?.parentNode) {
			this.tooltip.parentNode.removeChild(this.tooltip);
		}
		if (this.closeButton?.parentNode) {
			this.closeButton.parentNode.removeChild(this.closeButton);
		}
		this.overlay = null;
		this.tooltip = null;
		this.closeButton = null;
	}

	private handleMouseOver = (event: MouseEvent): void => {
		const target = event.target as HTMLElement;
		if (
			!target ||
			target === document.body ||
			target === document.documentElement ||
			target.hasAttribute("data-vectortrace")
		) {
			return;
		}

		if (this.overlay) {
			const rect = target.getBoundingClientRect();
			Object.assign(this.overlay.style, {
				left: `${rect.left}px`,
				top: `${rect.top}px`,
				width: `${rect.width}px`,
				height: `${rect.height}px`,
				display: "block",
			});
		}

		if (this.tooltip) {
			const preview = target.textContent?.trim().slice(0, 40) || "";
			const tag = target.tagName.toLowerCase();
			this.tooltip.textContent = preview ? `"${preview}"` : tag;
			this.tooltip.style.display = "block";
		}
	};

	private handleMouseMove = (event: MouseEvent): void => {
		if (
			this.tooltip &&
			this.tooltip.style.display === "block" &&
			this.tooltip.textContent !== "✓ Captured!"
		) {
			this.tooltip.style.left = `${event.clientX + 15}px`;
			this.tooltip.style.top = `${event.clientY + 15}px`;
		}
	};

	private handleClick = (event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();

		const target = event.target as HTMLElement;

		// If clicking the close button or something inside it, deactivate and exit
		if (target && (target === this.closeButton || this.closeButton?.contains(target))) {
			this.deactivate();
			return;
		}

		if (
			target &&
			target !== document.body &&
			target !== document.documentElement &&
			!target.hasAttribute("data-vectortrace")
		) {
			const selectedElement = target;
			this.flashOverlay();
			this.onSelect(selectedElement);
		}
	};

	private flashOverlay(): void {
		if (!this.overlay) return;

		const originalBG = "rgba(59, 130, 246, 0.3)";
		const originalBorder = "2px solid #3b82f6";

		Object.assign(this.overlay.style, {
			backgroundColor: "rgba(16, 185, 129, 0.45)",
			border: "2px solid #10b981",
		});

		if (this.tooltip) {
			const originalText = this.tooltip.textContent;
			this.tooltip.textContent = "✓ Captured!";
			this.tooltip.style.backgroundColor = "#10b981";
			this.tooltip.style.borderColor = "#047857";

			setTimeout(() => {
				if (this.tooltip && this.tooltip.textContent === "✓ Captured!") {
					this.tooltip.style.backgroundColor = "#1e293b";
					this.tooltip.style.borderColor = "#3b82f6";
					if (originalText) this.tooltip.textContent = originalText;
				}
			}, 600);
		}

		setTimeout(() => {
			if (this.overlay) {
				Object.assign(this.overlay.style, {
					backgroundColor: originalBG,
					border: originalBorder,
				});
			}
		}, 300);
	}

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") {
			this.deactivate();
		}
	};
}
