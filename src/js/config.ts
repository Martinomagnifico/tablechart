import type { Motion } from "./types";

export const LIBRARY_NAME = "tablechart";

// The stylesheet uses these names only, so a renamed `selector` keeps its styling.
export const PLOT_CLASS = "tablechart-plot";
export const CATEGORIES_CLASS = "tablechart-categories";
export const VALUE_CLASS = "tablechart-value";
export const BAR_CLASS = "tablechart-bar";
export const PIECE_CLASS = "tablechart-piece";
export const RULE_CLASS = "tablechart-rule";
export const CONNECTOR_CLASS = "tablechart-connector";
export const LINE_CLASS = "tablechart-line";
export const REFERENCE_CLASS = "tablechart-reference";
export const HEAD_CLASS = "tablechart-head";
export const BADGE_CLASS = "tablechart-badge";
export const BADGE_CAPTION_CLASS = "tablechart-caption";
export const SLICE_CLASS = "tablechart-slice";
export const DIVIDE_CLASS = "tablechart-divide";
export const SERIES_CLASS = "tablechart-series";
export const AREA_CLASS = "tablechart-area";
export const AREA_FILL_CLASS = "tablechart-area-fill";
export const NAME_CLASS = "tablechart-name";
export const LEGEND_CLASS = "tablechart-legend";
export const POINT_CLASS = "tablechart-point";
export const HOLE_CLASS = "tablechart-hole";
export const CENTRE_CLASS = "tablechart-centre";
export const LEADER_CLASS = "tablechart-leader";
export const BREAK_CLASS = "tablechart-break";
export const PLACED_CLASS = "is-placed";
export const SR_CLASS = "tablechart-sr";
export const MINUS_CLASS = "tablechart-minus";
export const SHOWN_CLASS = "is-shown";
export const PRINTING_CLASS = "is-printing";
// A chart in a sequence that has not had its turn: the whole figure waits hidden.
export const QUEUED_CLASS = "tablechart-queued";
export const CONTROLS_CLASS = "tablechart-controls";
export const AXIS_CLASS = "tablechart-axis";
export const TICK_CLASS = "tablechart-tick";
export const GRID_CLASS = "tablechart-grid";

// The plot is drawn in these units and scaled by the viewBox.
export const VIEWBOX_WIDTH = 1000;

// The empty space where a broken scale jumps, in viewBox units: 1.3% of the width. `--tablechart-break-gap` sets another.
export const BREAK_GAP = 13;

export interface Config {
	/** Which elements Tablechart turns into charts. */
	selector: string;
	/** Height of the plot as a share of its width. */
	aspect: number;
	/** Share of a band that a bar fills. */
	barfill: number;
	/** Share of a donut's radius that the ring itself takes. */
	ringfill: number;
	/** Locale for numbers. Unset, the document's language is used and followed when it changes. */
	locale?: string;
	/** Animate a chart when it builds. `"grow"` grows each element from zero, `"sweep"` reveals the chart in one movement; a figure overrides it with `data-chart-animate`, also with `"false"`. */
	animate: boolean | Motion;
	/** How far an animated parent is in before its chart builds: 0 when it starts moving, 1 when it is in. A figure overrides it with `data-chart-entrance`. */
	entrance: number;
	/** Where a column's number goes: on the bar, or inside it. A figure overrides it with `data-chart-labels`. */
	labels: "outside" | "inside";
	/** How a line or area runs between points: `straight`, `step` or `smooth`. A figure overrides it with `data-chart-shape`. */
	shape: "straight" | "step" | "smooth";
	/** Names of several lines in a legend instead of at the end of each line. A figure overrides it with `data-chart-legend`. */
	legend: boolean;
	/** Numbers along the value axis of a column, bar, line, area or waterfall chart. A figure overrides it with `data-chart-axis`. */
	axis: boolean;
	/** Gridlines across the plot at each number of the axis. A figure overrides it with `data-chart-grid`. */
	grid: boolean;
	/** The name of each marker beside it, on a scatter chart. A figure overrides it with `data-chart-names`. */
	names: boolean;
	/** A tooltip with the values of a row that is pointed at or tapped: `"auto"`, the default, only on a chart that does not show all its numbers; `true` always; `false` never. A figure overrides it with `data-chart-tooltip`. */
	tooltip: boolean | "auto";
	/** Where the tooltip goes in the page: an element or a selector, `body` by default. In a scaled element, such as the slides of a presentation, the tooltip has their scale. */
	tooltipparent: HTMLElement | string | null;
	/** The table under the chart: `"always"`, only in `"print"`, in print when numbers are left out (`"auto"`), or `"never"`. A figure overrides it with `data-chart-table`. */
	table: "never" | "auto" | "print" | "always";
	/** The name of the total that a donut without a total row works out, for screen readers. */
	totallabel: string;
	/** Previous and Next buttons under a chart that steps (`data-fragment`). `false` leaves them out, for buttons of your own. */
	controls: boolean;
	/** The text of the Previous button. */
	previouslabel: string;
	/** The text of the Next button. */
	nextlabel: string;
	/** Read by screen readers after the text of each button, so they know it only changes the chart. */
	stephint: string;
	/** How much of a chart must be in view before it builds, from 0 to 1. */
	threshold: number;
	/** Build again each time a chart scrolls back into view, not only the first time. */
	replay: boolean;
	/** The attribute for translation keys, for a translation script. `false` turns keys off. */
	langattribute: string | false;
	/** Show messages in the console for whoever is working on the page. */
	debug?: boolean;
}

export const defaultConfig: Config = {
	selector: "[data-chart]",
	aspect: 0.38,
	barfill: 0.58,
	ringfill: 0.42,
	animate: true,
	entrance: 0.5,
	labels: "outside",
	shape: "straight",
	legend: false,
	axis: false,
	grid: false,
	names: true,
	tooltip: "auto",
	tooltipparent: null,
	table: "never",
	totallabel: "Total",
	controls: true,
	previouslabel: "Previous",
	nextlabel: "Next",
	stephint: "step of the chart",
	threshold: 0.5,
	replay: false,
	langattribute: "data-i18n",
};
