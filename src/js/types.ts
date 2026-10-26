import type { Config } from "./config";
import type { Squeeze } from "./functions/scale";
import type { StepPlan } from "./steps";

/** How a line or an area runs from one point to the next. */
export type Shape = "straight" | "step" | "smooth";
/** How a chart builds: each element grows from zero, or the chart is revealed in one movement. */
export type Motion = "grow" | "sweep";

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
	/** `data-group` on the header: the cells name a group, such as "Predefined". */
	group: boolean;
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
	/** Across: on a chart with two axes, and the value scale of a bar chart, set by its drawing. */
	x?: (value: number) => number;
	/** The plot inside the axes, on a chart with axes. */
	frame?: [number, number, number, number];
	/** A chart that knows better which row is pointed at sets this, in screen pixels from the plot's corner. */
	rowAt?: (x: number, y: number) => number | null;
	/** A CSS length set on the figure, such as `--tablechart-marker-size`, in viewBox units. */
	length: (name: string, fallback: string) => number | null;
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
	/** The break itself, for a chart that makes a scale of its own, such as a bar chart. */
	squeeze: Squeeze | null;
	/** The empty space where the scale jumps, in viewBox units. */
	breakGap: number;
	/** The range of the value axis, on a chart with an axis or gridlines; a chart that makes its own scale reaches it. */
	domain: [number, number] | null;
	/** Where a bar chart is cut across, in viewBox units; set by its drawing. */
	breakX?: number;
	labels: "outside" | "inside";
	/** Where a number inside its bar goes, from `--tablechart-value-align`; null for the chart's own default. */
	insideAlign: "start" | "center" | "end" | null;
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
	/** The labels of annotations placed so far, as left, top, width and height, so the next one finds room. */
	taken: [number, number, number, number][];
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
	/** A stack is a running sum, so each line follows the one under it; otherwise values below zero stack down from zero. */
	running?: boolean;
	totals?: boolean;
	/** The sample in front of a legend name when it is not a line; the legend shows only when asked. */
	swatch?: "box";
	categories?: "under" | "beside";
	series?: boolean;
	/** The value columns are the fields of one mark, such as x and y, rather than series: no names for them. */
	columns?: boolean;
	/** An axis across and an axis up, from the first two value columns, with their headers as titles. */
	axes?: boolean;
	/** False: no numbers on the chart. They stay out of the layout, which costs a lot with many rows. */
	numbers?: false;
	/** Text of its own, made with the rest of the text so a translation script finds it, such as a legend. */
	text?: (input: { figure: HTMLElement; plot: HTMLElement; rows: Row[]; series: Series[]; config: Config }) => void;
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
	/** The lines of the tooltip of a row. Default: each value with the name of its series, and the total of a stack. */
	tooltip?: (state: ChartState, index: number, config: Config) => TooltipLine[];
}

/** One line of a tooltip, under the name of the row. */
export interface TooltipLine {
	/** The name of the series; empty for a chart with one series. */
	name: string;
	value: string;
	/** A small key in the colour of the series. */
	colour?: string;
	/** The shape of that key, as in the legend: a line with its point, or a box. */
	sample?: { marker: string | null; open: boolean; line: string | null; box: boolean };
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
	/** The axis titles and the place for the numbers along the axes. Without `numbers`, only for gridlines. */
	axes: { titles: HTMLElement[]; ticks: HTMLElement; numbers: boolean } | null;
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
	/** The steps of a chart that steps (`data-fragment`); null for one that does not. */
	plan: StepPlan | null;
	/** How many steps are shown. */
	step: number;
	/** The Previous and Next buttons, if Tablechart made them. */
	controls: HTMLElement | null;
	checks: Check[];
}
