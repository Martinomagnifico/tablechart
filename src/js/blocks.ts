/**
 * The building blocks under `init()` and `create()`, for an integration that
 * decides itself when a chart is built, laid out and shown, such as a plugin for
 * a presentation. Imported as `@martinomagnifico/tablechart/core`.
 *
 * The order is always the same:
 *
 * 1. `prepare` turns elements into figures with a table, and adds translation keys.
 * 2. `build` makes every element of one chart, with its text. It needs no layout.
 * 3. `layout` places everything, once the chart has a width. It makes no text, so
 *    it can run again whenever the width changes.
 * 4. `setShown` starts the animation, or shows the chart whole.
 *
 * `relabel` formats the numbers again, for example after a language change, and
 * `unbuild` removes what `build` made, so a chart can be built again.
 */
export { build, layout, relabel, setShown, unbuild } from "./core";
export { prepare } from "./init";
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
