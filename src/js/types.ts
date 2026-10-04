import type { Config } from "./config";

/** One value cell of the source table. */
export interface Cell {
	/** The cell exactly as written. */
	raw: string;
	/** The number in the cell as written, so its decimal places survive. Empty
	 * when the cell holds no number. */
	number: string;
	/** Whatever the cell says around its number, such as a % or the * of a
	 * footnote. It is kept on the label, either side of the formatted number. */
	prefix: string;
	suffix: string;
	/** The cell holds no number, such as "n/a": the row has no mark, and its label
	 * says what the cell does. Its value counts as zero wherever one is needed. */
	missing: boolean;
	value: number;
}

/** One row of the source table. Its own value is its first cell's. */
export interface Row extends Cell {
	/** The category label, as authored. */
	label: string;
	/** Its translation key, authored or generated. */
	key: string | null;
	/** Every value cell in the row, one per series. The first is the row's own. */
	cells: Cell[];
	/** The classes on the row in the table. They are copied to its bar, slice,
	 * number and name, so one class styles everything drawn for the row. */
	classes: string[];
	/** A row marked `data-kind="total"` is a total. */
	isTotal: boolean;
	/** Where it is in the run that animates with it: the stagger counts from here. */
	slot: number;
}

/**
 * A value column of the source table. A table with one is a chart with one series,
 * and its header is not read; with more, the header names each one.
 */
export interface Series {
	/** The column's header, as authored. Empty when the table has no header. */
	name: string;
	/** Its translation key, authored or generated. */
	key: string | null;
	/** `data-kind="focus"` on the header, or a bold one in Markdown: the series the
	 * chart is about. The others are shown fainter. */
	focus: boolean;
	/** `data-marker` on the header: the point of its line, such as `square` or
	 * `diamond open`. Null for the point its place gives it. */
	marker: string | null;
	/** `data-line` on the header: a dashed or dotted line. Null for a solid one. */
	line: "dashed" | "dotted" | null;
}

/** A row once a chart has worked out where it goes. */
export interface Segment extends Row {
	from: number;
	to: number;
	kind: "bar" | "up" | "down" | "total";
}

/**
 * What a chart hands to the drawing pass, and to any annotation on it. Scales
 * only, no pixel positions, so an annotation follows the data.
 */
export interface Geometry {
	rows: Row[];
	segments: Segment[];
	/** Centre of a band, in viewBox units. */
	cx: (index: number) => number;
	/** A value's height, in viewBox units. */
	y: (value: number) => number;
	/** Bar width, in viewBox units. */
	barWidth: number;
	/** The widest a bar may be, in viewBox units, from `--tablechart-bar-max`. */
	barMax: number;
	/** viewBox height. */
	height: number;
	/** viewBox units per screen pixel, for anything that should look the same at any size. */
	unit: number;
	/** Measured height of a value label, in viewBox units. */
	labelHeight: number;
	/** Measured height of a badge, in viewBox units. Zero when the chart has none. */
	badgeHeight: number;
	/** How many stagger steps the data itself takes, so commentary can land after it. */
	after: number;
	/** For an annotation: its number in the figure, counted from 1. Each of its
	 * marks gets it as `data-note`. Zero for the chart itself. */
	note: number;
	/** Where the break's mark goes, as a value: the scale jumps just above it. Null
	 * when the scale runs straight through. */
	breakAt: number | null;
	/** Where the numbers on the marks go, by the figure's say or the page's. */
	labels: "outside" | "inside";
	/** `data-chart-stack` on the figure: the series of a row are drawn on top of
	 * each other, the first at the bottom. */
	stacked: boolean;
	/** `data-chart-shape` on the figure: "step" holds each value until the next
	 * point. For line and area charts. */
	shape: "straight" | "step";
	/** The total of each row of a stacked chart, in row order. Empty when the chart
	 * is not stacked or its kind shows no totals. */
	totals: HTMLElement[];
	svg: SVGSVGElement;
	plot: HTMLElement;
	/** The value labels, in row order. Created earlier; a chart only places them. */
	values: HTMLElement[];
	/** The value columns. A chart kind that draws only one is given only one. */
	series: Series[];
	/** The value labels of each series, in row order. The first is `values`. */
	seriesValues: HTMLElement[][];
	/** The name of each series, to be placed by its marks. Empty with one series. */
	names: HTMLElement[];
	/** The category names, in row order. A chart that keeps them beside its marks
	 * places these too; one that keeps them under the plot never touches them. */
	categories: HTMLElement[];
	/** The number in the middle, for a chart kind that has one. */
	centre: HTMLElement | null;
	config: Config;
	/** Numbers an annotation worked out, against the numbers the author wrote. */
	checks: Check[];
}

/** An authored figure next to the one the data implies. */
export interface Check {
	label: string;
	computed: number;
	stated: number;
	agrees: boolean;
}

/** A chart kind: it reserves room for its text, then draws its own marks. */
export interface ChartType {
	/** Height as a share of width, when the page's own aspect does not suit. A
	 * donut needs a squarer box than a row of columns does. */
	aspect?: number;
	/** This kind has a middle, so a row marked as a total belongs in it rather
	 * than among the marks. */
	centre?: boolean;
	/** A break in the scale means something here: its bars stand on the baseline,
	 * or, for a waterfall, its totals do and its floating steps keep clear of the
	 * break, which the scale checks for. */
	breakable?: boolean;
	/** `data-chart-stack` works for this kind. */
	stackable?: boolean;
	/** A stacked chart of this kind shows the total of each row. */
	totals?: boolean;
	/** The sample in front of a name in the legend, when it is not a line. A kind
	 * with `legend` always has a legend; one with only `swatch` has one when asked. */
	swatch?: "box";
	/** Where the category names go: in a row under the plot, or beside the marks,
	 * which is what a chart whose bars run sideways needs. */
	categories?: "under" | "beside";
	/** This kind draws every value column, not only the first. */
	series?: boolean;
	/** With several series, the names go in a legend whatever the options say, with
	 * a sample of this shape: a square for bars. */
	legend?: "box";
	/** Extra headroom above the tallest bar, in viewBox units. */
	headroom?: (geo: HeadroomInput) => number;
	/** The least height this kind needs, in viewBox units, whatever its shape. */
	minHeight?: (input: {
		labelHeight: number;
		/** The height of the tallest category name, which can wrap onto several lines. */
		nameHeight: number;
		unit: number;
		rows: number;
		series: number;
		stacked: boolean;
	}) => number;
	/** Room under the baseline, for numbers that hang below a mark near it. */
	footroom?: (geo: HeadroomInput) => number;
	/** Lay out the rows. Default is one bar per row from the baseline. */
	segments?: (rows: Row[]) => Segment[];
	draw: (geo: Geometry) => void;
}

export interface HeadroomInput {
	labelHeight: number;
	badgeHeight: number;
	hasAnnotations: boolean;
	unit: number;
	/** How many series the chart draws, and whether one of them is in focus. */
	series: number;
	focused: boolean;
	stacked: boolean;
}

/**
 * An annotation in two halves, because the two need different moments.
 * `create` runs before anything is laid out, so anything translatable exists in the DOM
 * by the time a translation plugin takes its one sweep of the page. `draw` runs
 * once the figure has a width, and only ever places what `create` already made.
 */
export interface AnnotationType {
	create: (spec: HTMLElement, plot: HTMLElement) => HTMLElement | null;
	draw: (spec: HTMLElement, badge: HTMLElement | null, geo: Geometry) => void;
}

export interface ChartState {
	figure: HTMLElement;
	plot: HTMLElement;
	svg: SVGSVGElement;
	rows: Row[];
	decimals: number;
	type: ChartType;
	values: HTMLElement[];
	series: Series[];
	seriesValues: HTMLElement[][];
	names: HTMLElement[];
	categories: HTMLElement[];
	/** The number in the middle of a donut. Null for a chart that has no middle. */
	centre: HTMLElement | null;
	stacked: boolean;
	totals: HTMLElement[];
	/** The cell of the total row Tablechart adds to a donut's table, if it adds one. */
	totalCell: HTMLElement | null;
	/** The row at a point in the plot, in screen pixels from its corner, or null.
	 * Set by the layout; null for a chart whose rows are not side by side. */
	rowAt: ((x: number, y: number) => number | null) | null;
	/** Where a row is in the plot, as percentages: left, top, width and height. */
	rowBox: ((index: number) => [number, number, number, number]) | null;
	annotations: {
		spec: HTMLElement;
		type: AnnotationType;
		badge: HTMLElement | null;
		/** The line it reads, as a position from 0. `data-series` counts from 1; the first line when left out. */
		series: number;
		/** How many stagger steps it waits, so it lands after the data. */
		after: number;
	}[];
	checks: Check[];
}
