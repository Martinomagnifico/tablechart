import { PLUGIN_ID } from "../config";

/** Messages for whoever is working on a page, shown only with `debug: true`. */
export const debug = {
	enabled: false,
	log(...args: unknown[]): void {
		if (debug.enabled) console.log(`[${PLUGIN_ID}]`, ...args);
	},
	/** Runs `work`, and with `debug: true` says how long it took, with a warning above 50 ms. */
	timed<T>(what: string, figure: HTMLElement, work: () => T): T {
		if (!debug.enabled) return work();
		const start = performance.now();
		const result = work();
		const ms = performance.now() - start;
		const rows = figure.querySelectorAll("tbody tr").length;
		if (ms > 50) console.warn(`[${PLUGIN_ID}] ${what} took ${ms.toFixed(1)} ms for ${rows} rows, more than 50 ms.`, figure);
		else debug.log(`${what} took ${ms.toFixed(1)} ms for ${rows} rows.`, figure);
		return result;
	},
};
