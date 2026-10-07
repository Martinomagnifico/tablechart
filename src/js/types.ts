import type { Config } from "./config";

/** How a line or an area runs from one point to the next. */
export type Shape = "straight" | "step" | "smooth";

export interface Cell {
	raw: string;
	/** As written, so its decimal places survive. Empty when the cell holds no number. */
	number: string;
	/** Text around the number, such as `%` or a footnote `*`, kept either side of the formatted number. */
	prefix: string;
	suffix: string;
	/** No number, such as "n/a": no mark, and the label says what the cell says. Counts as zero. */
	missing: boolean;
	value: number;
}

export interface Row extends Cell {
	label: string;
	key: string | null;
	cells: Cell[];
	/** Copied to everything drawn for the row, so one class styles all of it. */
	classes: string[];
	isTotal: boolean;
	/** The stagger counts from here. */
	slot: number;
}

export interface Series {
	name: string;
	key: string | null;
	/** `data-kind="focus"`, or bold in Markdown: the others are shown fainter. */
	focus: boolean;
	/** `data-marker` on the header, such as `square` or `diamond open`. */
	marker: string | null;
	line: "dashed" | "dotted" | null;
}

export interface Segment extends Row {
	from: number;
	to: number;
	kind: "bar" | "up" | "down" | "total";
}

/** Scales only, no pixel positions, so an annotation follows the data. */
export interface Geometry {
	rows: Row[];
	segments: Segment[];
	cx: (index: number) => number;
	y: (value: number) => number;
	barWidth: number;
	barMax: number;
	height: number;
	/** viewBox units per screen pixel. */
	unit: number;
	labelHeight: number;
	badgeHeight: number;
	/** How many stagger steps the data takes, so commentary can land after it. */
	after: number;
	/** An annotation's number in the figure, from 1, set as `data-note` on its marks. Zero for the chart. */
	note: number;
	/** Where the break's mark goes, as a value. Null when the scale runs straight through. */
	breakAt: number | null;
	labels: "outside" | "inside";
	stacked: boolean;
	shape: Shape;
	/** Empty when the chart is not stacked or its kind shows no totals. */
	totals: HTMLElement[];
	svg: SVGSVGElement;
	plot: HTMLElement;
	/** Made by `build`; a chart only places them. */
	values: HTMLElement[];
	series: Series[];
	seriesValues: HTMLElement[][];
	/** Empty with one series. */
	names: HTMLElement[];
	/** A chart with its names beside the marks places these; one with them under the plot does not. */
	categories: HTMLElement[];
	centre: HTMLElement | null;
	config: Config;
	/** Numbers an annotation worked out, against the ones the author wrote. */
	checks: Check[];
}

export interface Check {
	label: string;
	computed: number;
	stated: number;
	agrees: boolean;
}

export interface ChartType {
	aspect?: number;
	/** A row marked as a total goes in the middle rather than among the marks. */
	centre?: boolean;
	/** A break in the scale works here; a waterfall keeps its floating steps clear of it. */
	breakable?: boolean;
	stackable?: boolean;
	totals?: boolean;
	/** The sample in front of a legend name when it is not a line; the legend shows only when asked. */
	swatch?: "box";
	categories?: "under" | "beside";
	series?: boolean;
	/** With several series, always a legend, with a sample of this shape. */
	legend?: "box";
	headroom?: (geo: HeadroomInput) => number;
	minHeight?: (input: {
		labelHeight: number;
		nameHeight: number;
		unit: number;
		rows: number;
		series: number;
		stacked: boolean;
	}) => number;
	/** Room under the baseline for numbers that hang below a mark near it. */
	footroom?: (geo: HeadroomInput) => number;
	/** Default: one bar per row from the baseline. */
	segments?: (rows: Row[]) => Segment[];
	draw: (geo: Geometry) => void;
}

export interface HeadroomInput {
	labelHeight: number;
	badgeHeight: number;
	hasAnnotations: boolean;
	unit: number;
	series: number;
	focused: boolean;
	stacked: boolean;
}

/** `create` runs before layout, so a translation script finds its text; `draw` only places it. */
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
	centre: HTMLElement | null;
	stacked: boolean;
	totals: HTMLElement[];
	totalCell: HTMLElement | null;
	/** In screen pixels from the plot's corner. Null for a chart whose rows are not side by side. */
	rowAt: ((x: number, y: number) => number | null) | null;
	/** As percentages: left, top, width and height. */
	rowBox: ((index: number) => [number, number, number, number]) | null;
	annotations: {
		spec: HTMLElement;
		type: AnnotationType;
		badge: HTMLElement | null;
		/** From 0; `data-series` counts from 1. */
		series: number;
		after: number;
	}[];
	checks: Check[];
}
