export const PLUGIN_ID = "tablechart";

// The stylesheet uses these names only, so a renamed `selector` keeps its styling.
export const PLOT_CLASS = "tablechart-plot";
export const CATEGORIES_CLASS = "tablechart-categories";
export const VALUE_CLASS = "tablechart-value";
export const BAR_CLASS = "tablechart-bar";
export const PIECE_CLASS = "tablechart-piece";
export const RULE_CLASS = "tablechart-rule";
export const CONNECTOR_CLASS = "tablechart-connector";
export const LINE_CLASS = "tablechart-line";
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
export const POINTER_CLASS = "tablechart-pointer";
export const SR_CLASS = "tablechart-sr";
export const SHOWN_CLASS = "is-shown";
// A chart in a sequence that has not had its turn: the whole figure waits hidden.
export const QUEUED_CLASS = "tablechart-queued";

// The plot is drawn in these units and scaled by the viewBox.
export const VIEWBOX_WIDTH = 1000;

// The gap a broken scale leaves where it jumps, in viewBox units; the scale and the mark both use it.
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
	/** Animate a chart when it builds. */
	animate: boolean;
	/** Where a column's number goes: on the bar, or inside it. A figure overrides it with `data-chart-labels`. */
	labels: "outside" | "inside";
	/** Names of several lines in a legend instead of at the end of each line. A figure overrides it with `data-chart-legend`. */
	legend: boolean;
	/** Pointing at a row shows numbers that were left out for lack of room. A figure turns it off with `data-chart-hover="false"`. */
	hover: boolean;
	/** The name of the total that a donut without a total row works out, for screen readers. */
	totallabel: string;
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
	labels: "outside",
	legend: false,
	hover: true,
	totallabel: "Total",
	threshold: 0.5,
	replay: false,
	langattribute: "data-i18n",
};
