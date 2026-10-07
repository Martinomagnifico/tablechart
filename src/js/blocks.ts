/** Building blocks under `init()`: `prepare`, `build`, `layout`, then `setShown`. Imported as `@martinomagnifico/tablechart/core`. */
export { build, layout, relabel, setShown, unbuild } from "./core";
export { entranceOf, prepare } from "./init";
export { adoptTables, loadSources, readMarkdownRows } from "./functions/sources";
export { assignKeys } from "./functions/read-table";
export {
	type Config,
	defaultConfig,
	PLACED_CLASS,
	PLOT_CLASS,
	QUEUED_CLASS,
	SHOWN_CLASS,
} from "./config";
export type { ChartState, Row, Series } from "./types";
