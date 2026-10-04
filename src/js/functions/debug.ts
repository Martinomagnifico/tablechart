import { PLUGIN_ID } from "../config";

/** Messages for whoever is working on a page, shown only with `debug: true`. */
export const debug = {
	enabled: false,
	log(...args: unknown[]): void {
		if (debug.enabled) console.log(`[${PLUGIN_ID}]`, ...args);
	},
};
