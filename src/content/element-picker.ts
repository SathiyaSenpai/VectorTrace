export class ElementPicker {
	private onSelect: (element: HTMLElement) => void;
	private active = false;
	private overlay: HTMLDivElement | null = null;
	private tooltip: HTMLDivElement | null = null;
	private originalBodyCursor = "";

	constructor(options: { onSelect: (element: HTMLElement) => void }) {
		this.onSelect = options.onSelect;
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
	// deactivate the picker 
	public deactivate(): void {
		if (!this.active) return;
		this.active = false;
		document.body.style.cursor = this.originalBodyCursor;
		document.body.removeEventListener("mouseover", this.handleMouseOver, true);
		document.body.removeEventListener("mousemove", this.handleMouseMove, true);
		document.body.removeEventListener("click", this.handleClick, true);
		document.removeEventListener("keydown", this.handleKeyDown, true);

		this.cleanupElements();
	}
	// create the overlay and tooltip elements
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
		// overlay element append
		document.body.appendChild(this.overlay);
		// tooltip element create and styles
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
	}

	private cleanupElements(): void {
		if (this.overlay?.parentNode) {
			this.overlay.parentNode.removeChild(this.overlay);
		}
		if (this.tooltip?.parentNode) {
			this.tooltip.parentNode.removeChild(this.tooltip);
		}
		this.overlay = null;
		this.tooltip = null;
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
			let text = target.tagName.toLowerCase();
			if (target.classList.length > 0) {
				text += `.${target.classList[0]}`;
			}
			this.tooltip.textContent = text;
			this.tooltip.style.display = "block";
		}
	};

	private handleMouseMove = (event: MouseEvent): void => {
		if (this.tooltip && this.tooltip.style.display === "block") {
			this.tooltip.style.left = `${event.clientX + 15}px`;
			this.tooltip.style.top = `${event.clientY + 15}px`;
		}
	};

	private handleClick = (event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();

		const target = event.target as HTMLElement;
		if (
			target &&
			target !== document.body &&
			target !== document.documentElement &&
			!target.hasAttribute("data-vectortrace")
		) {
			const selectedElement = target;
			this.deactivate();
			this.onSelect(selectedElement);
		}
	};
	// esc key
	private handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") {
			this.deactivate();
		}
	};
}
