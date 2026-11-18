// A transform turns a response in a structure of its own into one that Tablechart reads.
import type { Config } from "../../config";

export type Transform = (data: unknown) => unknown;

export type Chosen = { name: string; run: Transform } | { name: null } | { missing: string };

/** The transform for a figure: its `data-chart-transform`, or else the `transform` option. `"none"` reads the response as it is. */
export const transformFor = (figure: HTMLElement, config: Config): Chosen => {
	const name = figure.getAttribute("data-chart-transform") ?? config.transform ?? "none";
	if (name === "none" || name === "") return { name: null };
	const run = config.transforms?.[name];
	if (typeof run !== "function") return { missing: name };
	return { name, run };
};
