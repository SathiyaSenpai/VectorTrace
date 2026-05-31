/**
 * Simple performance timing logger for tracking execution times.
 */
export class PerfLogger {
	private timers = new Map<string, number>();

	/**
	 * Starts a timer with the given label.
	 */
	start(label: string): void {
		this.timers.set(label, performance.now());
	}

	/**
	 * Ends the timer and logs the duration.
	 * @returns The duration in milliseconds.
	 */
	end(label: string): number {
		const startTime = this.timers.get(label);
		if (startTime === undefined) {
			console.warn(`[PerfLogger] Timer "${label}" does not exist.`);
			return 0;
		}

		const duration = performance.now() - startTime;
		this.timers.delete(label);

		console.log(`⏱️ [Perf] ${label} took ${duration.toFixed(2)}ms`);
		return duration;
	}

	/**
	 * Wraps an async function with timing logic.
	 */
	async track<T>(label: string, fn: () => Promise<T>): Promise<T> {
		this.start(label);
		try {
			return await fn();
		} finally {
			this.end(label);
		}
	}
}

// Global instance for convenience
export const perfLogger = new PerfLogger();
