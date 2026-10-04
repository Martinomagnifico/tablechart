// The plugin id, and the prefix on anything this plugin prints to the console.
export const PLUGIN_ID = "tablechart";

// Written onto what Tablechart builds, whatever the page called the figure. The
// stylesheet uses these names only, so a renamed `selector` never takes the
// styling with it. They are not options: a name nobody can change is the point.
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
// Text for screen readers only, such as the pause between a title and a subtitle.
export const SR_CLASS = "tablechart-sr";
export const SHOWN_CLASS = "is-shown";
// On a chart in a sequence that has not had its turn yet: the whole figure, its
// caption and its baseline too, waits hidden rather than only its marks.
export const QUEUED_CLASS = "tablechart-queued";

// The plot is drawn in these units and then scaled by the viewBox, so nothing in
// the drawing code has to know how wide the figure ended up on screen.
export const VIEWBOX_WIDTH = 1000;

// How much of the plot a broken scale leaves empty where it jumps, in viewBox
// units. The scale leaves the gap and the mark fills it, so both have to agree.
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
	/**
	 * Locale for number formatting. Left unset, the document's own language is
	 * used and followed when it changes, so a translated page reformats itself.
	 */
	locale?: string;
	/** Animate a chart when it builds. */
	animate: boolean;
	/**
	 * Where a column's number goes: `outside`, standing on the bar, or `inside`,
	 * in the middle of it, in the bar's own ink. A bar too short to hold its
	 * number keeps it outside. A figure says otherwise with `data-chart-labels`.
	 */
	labels: "outside" | "inside";
	/**
	 * Where the names of the lines go, in a chart with several lines: `false` puts
	 * each name at the end of its line, `true` puts them all in a legend under the
	 * chart. A figure says otherwise with `data-chart-legend`, or
	 * `data-chart-legend="false"`.
	 */
	legend: boolean;
	/**
	 * If a chart has numbers that were left out because there is no room for them,
	 * pointing at a row, or tapping it, shows the numbers of that row. The other
	 * numbers are hidden for that time. A figure turns it off with
	 * `data-chart-hover="false"`.
	 */
	hover: boolean;
	/** The name of the total that a donut without a total row works out, for screen readers. */
	totallabel: string;
	/** How much of a chart must be in view before it builds, from 0 to 1. */
	threshold: number;
	/** Build again each time a chart scrolls back into view, not only the first time. */
	replay: boolean;
	/**
	 * The attribute that holds translation keys, for a translation script. A figure
	 * with `data-chart-keys` gets translation keys on its names. `false` turns them off.
	 */
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
