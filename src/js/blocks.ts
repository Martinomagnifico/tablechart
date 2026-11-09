/** Building blocks under `init()`: `prepare`, `build`, `layout`, then `setShown`. Imported as `@martinomagnifico/tablechart/core`. */
export { addType } from "./charts/registry";
export { build, relabel, unbuild } from "./build/build";
export { layout } from "./layout/layout";
export { setShown } from "./show/shown";
export { stepTo, type StepPlan } from "./show/steps";
export { entranceOf, prepare } from "./show/init";
export { adoptTables, loadSources, readMarkdownRows } from "./build/sources";
export { assignKeys } from "./build/read-table";
export { checkContrast, checkTextContrast } from "./colour/contrast";
export {
	AT_ONCE_CLASS,
	type Config,
	defaultConfig,
	PLACED_CLASS,
	PLOT_CLASS,
	PRINTING_CLASS,
	QUEUED_CLASS,
	SHOWN_CLASS,
} from "./config";
export type { ChartState, ChartType, Row, Series } from "./types";
