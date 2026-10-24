import { axisBreak } from "./annotations/axis-break";
import { bracket } from "./annotations/bracket";
import { reference } from "./annotations/reference";
import { trend } from "./annotations/trend";
import { bar } from "./charts/bar";
import { column } from "./charts/column";
import { donut } from "./charts/donut";
import { area, line } from "./charts/line";
import { waterfall } from "./charts/waterfall";
import {
	AXIS_CLASS,
	BREAK_GAP,
	GRID_CLASS,
	TICK_CLASS,
	CATEGORIES_CLASS,
	CENTRE_CLASS,
	type Config,
	LEGEND_CLASS,
	NAME_CLASS,
	PLACED_CLASS,
	PLOT_CLASS,
	HOLE_CLASS,
	VALUES_CLASS,
	REFERENCE_CLASS,
	LIBRARY_NAME,
	SR_CLASS,
	MINUS_CLASS,
	SHOWN_CLASS,
	VALUE_CLASS,
	VIEWBOX_WIDTH,
} from "./config";
import { decimalsIn, largest, splitSign } from "./functions/format";
import { markerOf } from "./functions/markers";
import { stackReach, stackTotal } from "./functions/groups";
import { fitTogether } from "./functions/labels";
import { measureAll, sizeOf } from "./functions/measure";
import type { Squeeze } from "./functions/scale";
import { readSeries, readTable } from "./functions/read-table";
import { cutOut, htmlEl, placeAt, short, svgEl } from "./functions/svg";
import { niceStep, readScale, type Scale, scaleOf, thin, ticksOf } from "./functions/axis";
import type { Box } from "./functions/collision";
import { debug } from "./functions/debug";
import { applySteps, makeControls, planSteps, stepTo } from "./steps";
import { attachTooltip, releaseTooltip } from "./tooltip";
import type { AnnotationType, ChartState, ChartType, Geometry, Motion, Row, Shape } from "./types";

const CHARTS: Record<string, ChartType> = { area, bar, column, donut, line, waterfall };
/** Adds a chart type for `data-chart="name"`, such as one from `@martinomagnifico/tablechart/additional-types`, before `init()`. */
export const addType = (name: string, type: ChartType): void => {
	CHARTS[name] = type;
};
const ANNOTATIONS: Record<string, AnnotationType> = { "axis-break": axisBreak, trend, bracket, reference };
export const ANNOTATION_NAMES = Object.keys(ANNOTATIONS);

/** Three passes: keys, then every text element, then geometry. Geometry makes no text, so a translation script that sweeps once finds it all. */

const textBefore = (node: Node): string => {
	let text = "";
	for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) {
		text = (sibling.textContent ?? "") + text;
		if (text.trim()) break;
	}
	return text.trim();
};

const SHAPES: readonly Shape[] = ["straight", "step", "smooth"];

/** The path of a straight line in pieces, without the parts that cross `boxes`, so its gaps need no mask. */
const piecesOf = (x1: number, y1: number, x2: number, y2: number, boxes: Box[]): string => {
	const across = y1 === y2;
	const [from, to, at] = across ? [Math.min(x1, x2), Math.max(x1, x2), y1] : [Math.min(y1, y2), Math.max(y1, y2), x1];
	const cuts = boxes
		.filter(([x, y, w, h]) => (across ? y <= at && at <= y + h : x <= at && at <= x + w))
		.map(([x, y, w, h]) => (across ? [x, x + w] : [y, y + h]))
		.sort((a, b) => a[0] - b[0]);
	const pieces: [number, number][] = [];
	let start = from;
	for (const [a, b] of cuts) {
		if (a > start) pieces.push([start, Math.min(a, to)]);
		start = Math.max(start, b);
	}
	if (start < to) pieces.push([start, to]);
	return pieces.map(([a, b]) => (across ? `M${short(a)},${short(at)}H${short(b)}` : `M${short(at)},${short(a)}V${short(b)}`)).join("");
};

/** A straight `line` as a path in pieces around `boxes`. */
const lineAround = (line: SVGElement, boxes: Box[]): void => {
	const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((name) => Number(line.getAttribute(name)));
	const path = svgEl("path", { d: piecesOf(x1, y1, x2, y2, boxes) });
	for (const { name, value } of Array.from(line.attributes)) if (!/^[xy][12]$/.test(name)) path.setAttribute(name, value);
	line.replaceWith(path);
};

/** The straight lines of a path (`M x,y H x` or `V y`), as their ends. */
const linesIn = (path: SVGElement): [number, number, number, number][] =>
	Array.from((path.getAttribute("d") ?? "").matchAll(/M(-?[\d.]+),(-?[\d.]+)([HV])(-?[\d.]+)/g), ([, x, y, axis, end]) =>
		axis === "H" ? [+x, +y, +end, +y] : [+x, +y, +x, +end]
	);

/** The parts of the straight lines in `path` that lie in `box`, as a path; empty if none do. */
const piecesIn = (lines: [number, number, number, number][], [x, y, w, h]: Box): string =>
	lines
		.map(([x1, y1, x2, y2]) =>
			y1 === y2
				? y <= y1 && y1 <= y + h && Math.max(x1, x) < Math.min(x2, x + w)
					? `M${short(Math.max(x1, x))},${short(y1)}H${short(Math.min(x2, x + w))}`
					: ""
				: x <= x1 && x1 <= x + w && Math.max(y1, y) < Math.min(y2, y + h)
					? `M${short(x1)},${short(Math.max(y1, y))}V${short(Math.min(y2, y + h))}`
					: ""
		)
		.join("");

/** A figure's own `data-chart-…`, on unless it says `false`, or else the option. */
const turnedOn = (figure: HTMLElement, name: string, option: boolean): boolean => {
	const own = figure.getAttribute(name);
	return own === null ? option : own !== "false";
};

/** Whether a chart builds with animation: `data-chart-animate="false"` on the figure, or the `animate` option, turns it off. */
export const animated = (figure: HTMLElement, config: Config): boolean =>
	Boolean(config.animate) && figure.getAttribute("data-chart-animate") !== "false";

/** A figure's own `data-chart-shape`, or else the option. */
const shapeOf = (figure: HTMLElement, config: Config): Shape => {
	const asked = figure.dataset.chartShape as Shape | undefined;
	if (asked && SHAPES.includes(asked)) return asked;
	return SHAPES.includes(config.shape) ? config.shape : "straight";
};

/** A hidden full stop before each line break in the title, so a screen reader pauses there. */
const pauseLines = (caption: HTMLElement): void => {
	for (const br of caption.querySelectorAll("br")) {
		if (br.previousElementSibling?.classList.contains(SR_CLASS)) continue;
		if (/[.!?:;,…]$/.test(textBefore(br))) continue;
		const stop = document.createElement("span");
		stop.className = SR_CLASS;
		stop.textContent = ". ";
		br.before(stop);
	}
};

/** A total row in a donut's table, so screen readers read the total with its name. */
const addTotalRow = (figure: HTMLElement, centre: HTMLElement, config: Config): HTMLElement | null => {
	const table = figure.querySelector("table");
	if (!table) return null;
	const made = table.querySelector<HTMLElement>("tfoot [data-chart-total]");
	if (made) {
		made.dataset.value = centre.dataset.value ?? "0";
		return made;
	}
	const row = (table.tFoot ?? table.createTFoot()).insertRow();
	const name = document.createElement("th");
	name.scope = "row";
	name.textContent = config.totallabel;
	const keys = figure.getAttribute("data-chart-keys");
	if (keys && config.langattribute) name.setAttribute(config.langattribute, `${keys}-total`);
	const cell = row.insertCell();
	cell.setAttribute("data-chart-total", "");
	cell.dataset.value = centre.dataset.value ?? "0";
	row.prepend(name);
	return cell;
};

let captions = 0;

/** The title names the figure and its table, for screen readers. A name of their own is kept. */
const nameTable = (figure: HTMLElement): void => {
	const caption = figure.querySelector<HTMLElement>(":scope > figcaption");
	if (!caption) return;
	pauseLines(caption);
	const named = (element: Element) => element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");
	const link = (element: Element) => {
		if (!caption.id) caption.id = `tablechart-caption-${++captions}`;
		element.setAttribute("aria-labelledby", caption.id);
	};
	// Not every browser names a figure after its figcaption; a div may not have a name.
	if (figure.tagName === "FIGURE" && !named(figure)) link(figure);
	const table = figure.querySelector("table");
	if (table && !named(table) && !table.querySelector(":scope > caption")) link(table);
};

/** Pass 2: everything a reader will read, before a translation script looks. */
export const build = (
	figure: HTMLElement,
	config: Config,
	asKind: string | null = null
): ChartState | null => {
	// `asKind` builds the chart as another kind, such as a column chart as a bar chart on a narrow screen.
	const kind = asKind ?? (figure.getAttribute("data-chart") || "column");
	const type = CHARTS[kind];
	if (!type) {
		console.warn(
			`[${LIBRARY_NAME}] Unknown chart type "${kind}". Known types: ${Object.keys(CHARTS).join(", ")}.`
		);
		figure.setAttribute("data-chart-empty", "");
		return null;
	}

	const rows = readTable(figure, config.langattribute);
	if (!rows.length) {
		console.warn(
			figure.querySelector("table")
				? `[${LIBRARY_NAME}] A chart has no rows in its table, so there is nothing to draw.`
				: `[${LIBRARY_NAME}] A chart has no table, so there is nothing to draw.`,
			figure
		);
		figure.setAttribute("data-chart-empty", "");
		return null;
	}

	nameTable(figure);

	let series = readSeries(figure, rows, config.langattribute);
	if (series.length > 1 && !type.series && !type.columns) {
		console.warn(
			`[${LIBRARY_NAME}] A ${kind} chart uses only the first of its ${series.length} value columns.`
		);
		series = series.slice(0, 1);
	}
	const several = series.length > 1;
	// How many lines or bars share the colour steps, so the last is not too light.
	if (several) figure.style.setProperty("--_series-count", String(series.length));

	const stackAsked = figure.hasAttribute("data-chart-stack");
	if (stackAsked && !type.stackable)
		console.warn(`[${LIBRARY_NAME}] A ${kind} chart cannot be stacked.`);
	const stacked = stackAsked && !!type.stackable && several;

	// Hidden from screen readers: they read the table, which has the same numbers and names.
	const plot = document.createElement("div");
	plot.className = PLOT_CLASS;
	plot.setAttribute("aria-hidden", "true");
	const svg = svgEl("svg", { role: "presentation", focusable: "false" });
	plot.appendChild(svg);
	figure.appendChild(plot);

	// The marks take their decimal places from the marks alone; the middle keeps the total's own.
	const marked = type.centre ? rows.filter((r) => !r.isTotal) : rows;
	const decimals = Math.max(
		0,
		largest(marked.flatMap((r) => r.cells.slice(0, series.length).map((c) => decimalsIn(c.number))))
	);

	const columnDecimals = series.map((_one, s) => Math.max(0, largest(rows.map((r) => decimalsIn(r.cells[s]?.number ?? "")))));
	// All numbers in one element, so a chart without steps can fade them in at once.
	const numbers = document.createElement("div");
	numbers.className = VALUES_CLASS;
	plot.appendChild(numbers);
	const seriesValues = series.map((_one, s) =>
		rows.map((row, i) => {
			const cell = row.cells[s] ?? row.cells[0];
			const node = htmlEl(VALUE_CLASS, numbers);
			node.classList.add(...row.classes);
			node.dataset.value = String(cell.value);
			if (cell.prefix) node.dataset.prefix = cell.prefix;
			if (cell.suffix) node.dataset.suffix = cell.suffix;
			if (cell.missing) node.dataset.missing = cell.raw;
			if (several) node.dataset.series = String(s + 1);
			// The fields of a mark, such as x and y, each keep the decimal places of their own column.
			if (type.columns) node.dataset.decimals = String(columnDecimals[s]);
			node.dataset.row = String(i + 1);
			node.style.setProperty("--i", String(row.slot));
			return node;
		})
	);
	const values = seriesValues[0];

	const totals =
		stacked && type.totals
			? rows.map((row, i) => {
					const node = htmlEl(VALUE_CLASS, numbers);
					node.classList.add(...row.classes);
					node.dataset.kind = "total";
					node.dataset.row = String(i + 1);
					node.dataset.value = String(stackTotal(row, series.length));
					const first = row.cells[0];
					if (first.prefix) node.dataset.prefix = first.prefix;
					if (first.suffix) node.dataset.suffix = first.suffix;
					node.style.setProperty("--i", String(row.slot));
					return node;
				})
			: [];

	const last = rows[rows.length - 1];
	const focused = series.some((one) => one.focus);
	const legendAsked = figure.getAttribute("data-chart-legend");
	const legend =
		several &&
		!type.columns &&
		(legendAsked === null ? config.legend || type.legend !== undefined : legendAsked !== "false")
			? document.createElement("div")
			: null;
	if (legend) {
		legend.className = LEGEND_CLASS;
		legend.setAttribute("aria-hidden", "true");
		legend.inert = true;
	}
	const names = several && !type.columns
		? series.map((one, s) => {
				const node = htmlEl(NAME_CLASS, legend ?? plot);
				if (legend) node.dataset.place = "legend";
				const swatch = type.legend ?? type.swatch;
				if (swatch) node.dataset.swatch = swatch;
				node.textContent = one.name;
				// A step line has no points, so its legend sample has none.
				if (!swatch && shapeOf(figure, config) !== "step") {
					const marker = markerOf(series, s);
					node.dataset.marker = marker.shape;
					node.toggleAttribute("data-open", marker.open);
				}
				if (one.line && !swatch) node.dataset.line = one.line;
				if (one.key && config.langattribute) node.setAttribute(config.langattribute, one.key);
				node.dataset.series = String(s + 1);
				node.style.setProperty("--n", String(s));
				node.style.setProperty("--palette", `var(--tablechart-color-${s + 1})`);
				node.style.setProperty("--m", focused && !one.focus ? "1" : "0");
				node.style.setProperty("--i", String(last.slot));
				return node;
			})
		: [];

	// Made with the rest of the text, so a translation script finds it; `relabel` fills it.
	const centre = type.centre ? htmlEl(CENTRE_CLASS, plot) : null;
	if (centre) {
		const stated = rows.find((row) => row.isTotal);
		const whole = stated
			? stated.value
			: rows.reduce((sum, row) => sum + Math.abs(row.value), 0);
		centre.dataset.value = String(whole);
		if (stated) centre.dataset.decimals = String(decimalsIn(stated.number));
	}

	// A total that Tablechart works out is added to the table, so screen readers read it.
	const totalCell = centre && !rows.some((row) => row.isTotal) ? addTotalRow(figure, centre, config) : null;

	// Beside means inside the plot, and the chart places each name itself.
	const beside = type.categories === "beside";
	const categories = document.createElement("div");
	categories.className = CATEGORIES_CLASS;
	// `inert` as well as `aria-hidden`: Safari with VoiceOver reads the names otherwise.
	categories.setAttribute("aria-hidden", "true");
	categories.inert = true;
	if (beside) categories.dataset.place = "beside";
	else if (type.centre) categories.dataset.place = "key";
	categories.style.setProperty("--_columns", String(rows.length));
	let slice = 0;
	for (const [i, row] of rows.entries()) {
		const span = document.createElement("span");
		span.classList.add(...row.classes);
		span.textContent = row.label;
		if (row.key && config.langattribute) span.setAttribute(config.langattribute, row.key);
		if (type.centre) {
			span.dataset.kind = row.isTotal ? "total" : "slice";
			if (!row.isTotal) {
				span.dataset.slice = String(slice + 1);
				span.style.setProperty("--n", String(slice));
				span.style.setProperty("--palette", `var(--tablechart-color-${slice + 1})`);
				slice += 1;
			}
		}
		span.style.setProperty("--i", String(row.slot));
		span.dataset.row = String(i + 1);
		categories.appendChild(span);
	}
	(beside ? plot : figure).appendChild(categories);
	if (legend) figure.appendChild(legend);

	// The headers of the first two value columns are the titles of the axes; layout makes the numbers along them.
	const fields = series.filter((one) => !one.group);
	// Off by default on the other types: `data-chart-axis` adds the numbers along the value axis, `data-chart-grid` the gridlines.
	const valueAxis = !type.axes && !type.centre && turnedOn(figure, "data-chart-axis", config.axis);
	const axes = type.axes
		? {
				titles: fields.slice(0, 2).map((one, s) => {
					const title = htmlEl(`${AXIS_CLASS}-title`, plot);
					title.dataset.axis = s ? "y" : "x";
					title.textContent = one.name;
					if (one.key && config.langattribute) title.setAttribute(config.langattribute, one.key);
					return title;
				}),
				ticks: htmlEl(`${TICK_CLASS}s`, plot),
				numbers: true,
			}
		: valueAxis || (!type.centre && turnedOn(figure, "data-chart-grid", config.grid))
			? { titles: [], ticks: htmlEl(`${TICK_CLASS}s`, plot), numbers: valueAxis }
			: null;
	type.text?.({ figure, plot, rows, series, config });

	// A chart that steps (`data-fragment`) builds a step at a time, from left to right. Without animation it is shown whole.
	const plan = animated(figure, config) && !type.axes ? planSteps(figure) : null;
	if (type.axes && figure.querySelector("[data-fragment]")) debug.log(`A ${kind} chart has no steps, so it is shown whole.`, figure);
	if (plan) figure.setAttribute("data-steps", "");
	const keys = figure.getAttribute("data-chart-keys");
	const controls =
		plan && config.controls
			? makeControls(
					{ previous: config.previouslabel, next: config.nextlabel, hint: config.stephint },
					{ previous: keys && `${keys}-previous`, next: keys && `${keys}-next`, hint: keys && `${keys}-step` },
					config.langattribute
				)
			: null;
	if (controls) figure.appendChild(controls);

	// The table under the chart, on screen, in print, or in print when numbers are left out.
	const asked = figure.getAttribute("data-chart-table");
	const table = asked && TABLES.includes(asked) ? asked : config.table;
	if (table === "never") figure.removeAttribute("data-table");
	else {
		figure.setAttribute("data-table", table);
		const own = figure.querySelector(":scope > table");
		if (own) figure.append(own);
	}

	const annotations = Array.from(figure.querySelectorAll<HTMLElement>("[data-annotation]"))
		.map((spec) => {
			const name = spec.getAttribute("data-annotation") as string;
			const annotationType = ANNOTATIONS[name];
			if (!annotationType) {
				console.warn(
					`[${LIBRARY_NAME}] Unknown annotation "${name}". Known annotations: ${Object.keys(ANNOTATIONS).join(", ")}.`
				);
				return null;
			}
			const asked = Number.parseInt(spec.getAttribute("data-series") ?? "1", 10);
			const index = asked >= 1 && asked <= series.length ? asked - 1 : 0;
			if (asked !== index + 1)
				console.warn(
					`[${LIBRARY_NAME}] An annotation reads line ${asked}, which is not there; it reads line 1.`
				);
			return {
				spec,
				type: annotationType,
				badge: annotationType.create(spec, plot),
				series: index,
				after: rows.length,
			};
		})
		.filter((a): a is NonNullable<typeof a> => a !== null);

	if (animated(figure, config)) figure.setAttribute("data-animate", motionOf(figure, kind, config, Boolean(plan)));

	const state: ChartState = {
		figure,
		plot,
		svg,
		rows,
		decimals,
		type,
		values,
		series,
		seriesValues,
		names: legend ? [] : names,
		categories: Array.from(categories.children) as HTMLElement[],
		centre,
		axes,
		stacked,
		totals,
		totalCell,
		rowAt: null,
		rowBox: null,
		annotations,
		checks: [],
		plan,
		step: 0,
		controls,
	};
	// Once every mark has moved into place, the masks that waited are put on.
	const settle = () => settleMasks(figure, svg);
	svg.addEventListener("transitionend", settle);
	svg.addEventListener("transitioncancel", settle);
	controls?.addEventListener("click", (event) => {
		const go = (event.target as Element).closest("button")?.dataset.go;
		if (go) stepTo(state, state.step + (go === "next" ? 1 : -1));
	});
	stepTo(state, 0, true);
	const own = figure.getAttribute("data-chart-tooltip");
	const tooltip = own === "false" ? false : own === "auto" ? "auto" : own !== null ? true : config.tooltip;
	if (tooltip) attachTooltip(state, config, tooltip === "auto");
	relabel(state, config);
	return state;
};

const MOTIONS: Record<string, Motion> = { grow: "grow", sweep: "sweep" };
const TABLES = ["never", "auto", "print", "always"];

/**
 * How a chart builds: the figure's `data-chart-animate`, or else the option, or else the default of its kind.
 * A line or area sweeps by default; a donut and a waterfall grow, and can sweep; columns and bars only grow.
 * A line or area with steps sweeps.
 */
const motionOf = (figure: HTMLElement, kind: string, config: Config, steps: boolean): Motion => {
	const lines = kind === "line" || kind === "area";
	const asked: Motion | undefined = MOTIONS[figure.getAttribute("data-chart-animate") ?? ""] ?? MOTIONS[String(config.animate)];
	if (lines) return steps ? "sweep" : (asked ?? "sweep");
	return kind === "donut" || kind === "waterfall" ? (asked ?? "grow") : "grow";
};

// A CSS length in viewBox units, or null if it is not a length, such as `none`.
const insideAlign = (figure: HTMLElement): Geometry["insideAlign"] => {
	const style = getComputedStyle(figure);
	const asked = style.getPropertyValue("--tablechart-value-align").trim();
	return asked === "start" || asked === "center" || asked === "end" ? asked : null;
};

const cssLength = (figure: HTMLElement, unit: number, name: string, fallback: string) => {
	const style = getComputedStyle(figure);
	const raw = style.getPropertyValue(name).trim() || fallback;
	const match = raw.match(/^(\d+(?:\.\d+)?)(px|%|em|rem)$/);
	if (!match) return null;
	const amount = Number(match[1]);
	if (match[2] === "%") return (amount / 100) * VIEWBOX_WIDTH;
	const size =
		match[2] === "em"
			? Number.parseFloat(style.fontSize)
			: match[2] === "rem"
				? Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
				: 1;
	return amount * size * unit;
};

const barMax = (figure: HTMLElement, unit: number): number =>
	cssLength(figure, unit, "--tablechart-bar-max", "60px") ?? Number.POSITIVE_INFINITY;


/** Pass 3. Needs layout; makes no text, only places it. */
export const layout = (state: ChartState, config: Config): boolean => {
	const { plot, svg, rows, type, values, series, seriesValues, names, annotations } = state;
	// A figure's own `data-chart-aspect` beats the kind's and the page's.
	const ownAspect = Number.parseFloat(state.figure.dataset.chartAspect ?? "");
	const aspect = ownAspect > 0 ? ownAspect : (type.aspect ?? config.aspect);

	// The value axis of a column, bar or line chart. Its numbers are measured first, as they take room beside the plot, or under a bar chart.
	const sideways = type.categories === "beside";
	const along = state.axes && !type.axes ? state.axes : null;
	const namesUnder = sideways ? null : state.categories[0]?.parentElement;
	let valueScale: Scale | null = null;
	if (along) {
		plot.style.margin = "";
		if (namesUnder) namesUnder.style.marginLeft = "";
		const guess = plot.clientWidth;
		if (!guess) return false;
		// As the scale does: a step of a waterfall is a size, so only where the steps start and end counts.
		const segs = type.segments?.(rows) ?? [];
		const all = state.stacked
			? rows.flatMap((row) => Object.values(stackReach(row, series.length, type.running)))
			: segs.some((s) => s.kind === "up" || s.kind === "down")
				? segs.flatMap((s) => [s.from, s.to])
				: rows.flatMap((row) => row.cells.slice(0, series.length).filter((cell) => !cell.missing).map((cell) => cell.value));
		const min = Math.min(0, -largest(all.map((value) => -value)));
		const max = Math.max(0, largest(all));
		const font = Number.parseFloat(getComputedStyle(plot).fontSize) || 16;
		// The scale ends on a number of the axis, or where `data-chart-scale` says; three numbers or more are the numbers themselves.
		const { chartScaleY, chartScale } = state.figure.dataset;
		const own = readScale(chartScaleY ?? chartScale);
		if (own && own.length > 2) valueScale = { min: own[0], max: own[own.length - 1], step: 0, ticks: own };
		else {
			const [from, to] = own ?? [min, max];
			const step = niceStep(to - from, Math.max((sideways ? guess / 9 : (guess * aspect) / 3) / font, 2));
			const round = (value: number, up: boolean) => (own ? value : Number(((up ? Math.ceil : Math.floor)(value / step - 1e-9 * (up ? 1 : -1)) * step).toPrecision(12)));
			const lo = round(from, false);
			const hi = round(to, true);
			valueScale = { min: lo, max: hi, step, ticks: ticksOf(lo, hi, step) };
		}
		along.ticks.textContent = "";
		const first = rows.find((row) => !row.missing);
		const places = largest(valueScale.ticks.map((value) => decimalsIn(String(value))));
		for (const value of valueScale.ticks) {
			const tick = htmlEl(TICK_CLASS, along.ticks);
			tick.dataset.value = String(value);
			tick.dataset.place = "none";
			if (first?.prefix) tick.dataset.prefix = first.prefix;
			if (first?.suffix) tick.dataset.suffix = first.suffix;
			writeNumber(tick, places, config.locale);
		}
		if (along.numbers) {
			const ticks = Array.from(along.ticks.children) as HTMLElement[];
			for (const tick of ticks) delete tick.dataset.place;
			measureAll(ticks);
			if (sideways) plot.style.marginBottom = `${(ticks[0] ? sizeOf(ticks[0]).height : 0) + 6}px`;
			else {
				plot.style.marginLeft = `${largest([0, ...ticks.map((tick) => sizeOf(tick).width)]) + 10}px`;
				if (namesUnder) namesUnder.style.marginLeft = plot.style.marginLeft;
			}
		}
	}

	const widthPx = plot.clientWidth;
	if (!widthPx) return false;

	// viewBox units per screen pixel.
	const unit = VIEWBOX_WIDTH / widthPx;
	const shaped = VIEWBOX_WIDTH * aspect;

	plot.classList.add(PLACED_CLASS);
	// Undo what the last layout did to the size of the text, then read every size at once, before anything is placed.
	for (const node of [...seriesValues.flat(), ...state.totals]) delete node.dataset.place;
	plot.style.removeProperty("--_fit");
	state.categories[0]?.parentElement?.style.removeProperty("--_beside");

	// The numbers along the axes, for a first guess at the room. Once they are measured, some may be left out.
	const axes = type.axes ? state.axes : null;
	let scales: Scale[] = [];
	if (axes) {
		const font = Number.parseFloat(getComputedStyle(plot).fontSize) || 16;
		const fields = series.flatMap((one, s) => (one.group ? [] : [s])).slice(0, 2);
		const drawn = rows.filter((row) => fields.every((s) => row.cells[s] && !row.cells[s].missing));
		const { chartScaleX, chartScaleY, chartScale } = state.figure.dataset;
		const asked = [readScale(chartScaleX), readScale(chartScaleY ?? chartScale)];
		scales = fields.map((s, k) =>
			scaleOf(
				drawn.length ? drawn.map((row) => row.cells[s].value) : [0, 1],
				Math.max(k ? shaped / unit / (font * 4) : widthPx / (font * 9), 4),
				asked[k]
			)
		);
		axes.ticks.textContent = "";
		scales.forEach((scale, k) => {
			const first = drawn[0]?.cells[fields[k]];
			const places = largest(scale.ticks.map((value) => decimalsIn(String(value))));
			for (const value of scale.ticks) {
				const tick = htmlEl(TICK_CLASS, axes.ticks);
				tick.dataset.axis = k ? "y" : "x";
				tick.dataset.value = String(value);
				if (first?.prefix) tick.dataset.prefix = first.prefix;
				if (first?.suffix) tick.dataset.suffix = first.suffix;
				writeNumber(tick, places, config.locale);
			}
		});
	}
	const ticks = axes ? (Array.from(axes.ticks.children) as HTMLElement[]) : [];
	measureAll([
		...seriesValues.flat(),
		...state.totals,
		...names,
		...state.categories,
		...annotations.map((a) => a.badge),
		...(axes?.titles ?? []),
		...ticks,
	]);

	const labelHeight = (values[0] ? sizeOf(values[0]).height : 0) * unit;
	const badgeHeight = annotations[0]?.badge ? sizeOf(annotations[0].badge).height * unit : 0;
	// Never less than `--tablechart-min-height` (200px), or what the kind needs.
	const height = Math.max(
		shaped,
		cssLength(state.figure, unit, "--tablechart-min-height", "200px") ?? 0,
		type.minHeight?.({
			labelHeight,
			nameHeight: Math.max(0, largest(state.categories.map((name) => sizeOf(name).height))) * unit,
			unit,
			rows: rows.length,
			series: series.length,
			stacked: state.stacked,
		}) ?? 0
	);

	// In a stacked chart a row's value is its total, so an annotation reads the top of its stack.
	const stackedRows = state.stacked
		? rows.map((row) => {
				const value = stackTotal(row, series.length);
				return { ...row, value, cells: row.cells.map((cell, s) => (s === 0 ? { ...cell, value } : cell)) };
			})
		: rows;
	const segments = (
		type.segments ??
		((r) => r.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const })))
	)(state.stacked ? stackedRows.map((row) => ({ ...row, cells: [row.cells[0]] })) : rows);

	const room = {
		labelHeight,
		badgeHeight,
		hasAnnotations: annotations.length > 0,
		unit,
		series: series.length,
		focused: series.some((one) => one.focus),
		stacked: state.stacked,
	};
	const reach = (pick: (list: number[]) => number) =>
		state.stacked
			? pick(rows.map((row) => stackReach(row, series.length, type.running).top))
			: pick([
					...segments.flatMap((s) => [s.from, s.to, s.value]),
					...rows.flatMap((row) => row.cells.slice(0, series.length).map((cell) => cell.value)),
				]);
	const extent = Math.max(reach(largest), 0);
	// Below zero the scale goes as far down as the lowest value, with room under it for its number.
	// A step of a waterfall is a size, not a place, so there only where the steps start and end counts.
	const steps = segments.some((s) => s.kind === "up" || s.kind === "down");
	const places = steps
		? segments.flatMap((s) => [s.from, s.to])
		: state.stacked
			? rows.map((row) => stackReach(row, series.length, type.running).bottom)
			: rows.flatMap((row) => row.cells.slice(0, series.length).map((cell) => cell.value));
	const depth = Math.min(-largest(places.map((value) => -value)), 0);

	const headroom = type.headroom?.(room) ?? labelHeight;
	const floor = 2 * unit + (type.footroom?.(room) ?? 0) + (depth < 0 ? labelHeight + 4 * unit : 0);
	const top = headroom;

	const plotHeight = height - top - floor;
	// With an axis or gridlines, the scale of the axis; a value beyond it is still shown whole.
	const ceiling = valueScale ? Math.max(valueScale.max, extent) : extent * 1.02;
	const bottom = valueScale ? Math.min(valueScale.min, depth) : depth * 1.02;

	// The break squeezes `data-from` to `data-to` into `data-size` of the plot; `data-at` is the old spelling of `data-from`.
	const breakSpec = annotations.find(
		(a) => a.spec.getAttribute("data-annotation") === "axis-break"
	)?.spec;
	const read = (name: string): number | null => {
		const value = Number.parseFloat(breakSpec?.getAttribute(name) ?? "");
		return Number.isFinite(value) ? value : null;
	};
	const fromAsked = read("data-from") ?? read("data-at");
	const toAsked = read("data-to");

	let compress: Squeeze | null = null;
	if (breakSpec && (fromAsked !== null || toAsked !== null)) {
		const lo = fromAsked ?? 0;
		const hi = toAsked ?? ceiling;
		// The zigzag goes where the compressed part meets the part at full scale.
		const gap = toAsked === null ? lo : fromAsked === null ? hi : (lo + hi) / 2;

		const sizeAsked = breakSpec.getAttribute("data-size");
		const sizeMatch = sizeAsked?.match(/^\s*(\d+(?:\.\d+)?)\s*%\s*$/);
		if (sizeAsked !== null && !sizeMatch) {
			console.warn(
				`[${LIBRARY_NAME}] data-size="${sizeAsked}" is not a percentage, such as 30%. Using the default.`
			);
		}
		const share = Math.min(
			Math.max(sizeMatch ? Number(sizeMatch[1]) / 100 : toAsked === null ? 0.22 : 0.3, 0.05),
			0.8
		);

		// Compressing any part of a floating step would make its height lie.
		const floats = segments.filter(
			(s) =>
				(s.kind === "up" || s.kind === "down") &&
				Math.max(s.from, s.to) > lo &&
				Math.min(s.from, s.to) < hi
		);

		if (!type.breakable) {
			console.warn(`[${LIBRARY_NAME}] This kind of chart cannot break its scale.`);
		} else if (depth < 0) {
			console.warn(`[${LIBRARY_NAME}] A chart with values below zero cannot break its scale.`);
		} else if (lo < 0 || hi <= lo || hi > ceiling || (lo === 0 && hi === ceiling)) {
			console.warn(
				`[${LIBRARY_NAME}] A break from ${lo} to ${hi} does not fit a scale that runs from 0 to ${extent}.`
			);
		} else if (floats.length) {
			console.warn(
				`[${LIBRARY_NAME}] A break from ${lo} to ${hi} would cut a step that floats. Keep it below or above the steps.`
			);
		} else {
			compress = { lo, hi, gap, share };
		}
	}
	const breakAt = compress ? compress.gap : null;

	// The empty space where the scale jumps: `--tablechart-break-gap`, or 1.3% of the width if not set.
	const breakGap = (compress && cssLength(state.figure, unit, "--tablechart-break-gap", "")) ?? BREAK_GAP;
	// Full scale below and above the break, compressed through it.
	const base = height - floor;
	const span = ceiling - bottom || 1;
	let y: (value: number) => number = (value) => base - ((value - bottom) / span) * plotHeight;
	if (compress) {
		const { lo, hi, gap, share } = compress;
		const squeezed = plotHeight * share;
		const density = (plotHeight - squeezed - breakGap) / (lo + (ceiling - hi));
		const perValue = squeezed / (hi - lo);
		y = (value) => {
			if (value <= lo) return base - value * density;
			if (value <= gap) return base - lo * density - (value - lo) * perValue;
			if (value <= hi) return base - lo * density - (value - lo) * perValue - breakGap;
			return base - lo * density - squeezed - breakGap - (value - hi) * density;
		};
	}
	// The plot inside the axes: room for the titles and the numbers on the left and at the foot.
	let x: Geometry["x"];
	let frame: Geometry["frame"];
	let shownTicks: number[][] = [];
	if (axes) {
		const gap = 6 * unit;
		const [titleX, titleY] = axes.titles;
		const width = (node?: HTMLElement) => (node ? sizeOf(node).width * unit : 0);
		const tall = (node?: HTMLElement) => (node ? sizeOf(node).height * unit : 0);
		const across = ticks.filter((tick) => tick.dataset.axis === "x");
		const up = ticks.filter((tick) => tick.dataset.axis === "y");
		const tickHeight = tall(ticks[0]);
		const left = width(titleY) + largest([0, ...up.map(width)]) + 2 * gap;
		const top = tickHeight / 2;
		frame = [left, top, VIEWBOX_WIDTH - left - largest([0, ...across.map(width)]) / 2, height - top - tall(titleX) - tickHeight - 2 * gap];
		const [fx, fy, fw, fh] = frame;
		const [sx, sy] = scales;
		const scaleX = (value: number) => fx + ((value - sx.min) / (sx.max - sx.min || 1)) * fw;
		const scaleY = (value: number) => fy + fh - ((value - sy.min) / (sy.max - sy.min || 1)) * fh;
		x = scaleX;
		y = scaleY;
		// Fewer numbers where two would touch.
		const widthAt = (value: number) => width(across.find((tick) => Number(tick.dataset.value) === value));
		shownTicks = [
			thin(sx, (list) => list.every((v, k) => !k || scaleX(v) - scaleX(list[k - 1]) > (widthAt(v) + widthAt(list[k - 1])) / 2 + gap)).ticks,
			thin(sy, (list) => list.every((v, k) => !k || scaleY(list[k - 1]) - scaleY(v) > tickHeight + gap / 2)).ticks,
		];
		for (const tick of ticks) {
			const value = Number(tick.dataset.value);
			const k = tick.dataset.axis === "x" ? 0 : 1;
			const shown = shownTicks[k].includes(value);
			tick.dataset.place = shown ? (k ? "before" : "below") : "none";
			if (shown) placeAt(tick, k ? fx - gap : scaleX(value), k ? scaleY(value) : fy + fh + gap, VIEWBOX_WIDTH, height);
		}
		if (titleX) placeAt(titleX, fx + fw / 2, height - tall(titleX), VIEWBOX_WIDTH, height);
		if (titleY) placeAt(titleY, 0, fy + fh / 2, VIEWBOX_WIDTH, height);
	}

	// The bands give up the room the widest series name needs.
	const gutter = names.length
		? largest(names.map((name) => sizeOf(name).width)) * unit + 12 * unit
		: 0;
	const under = state.categories[0]?.parentElement;
	if (under) under.style.paddingRight = gutter ? `${(gutter / VIEWBOX_WIDTH) * 100}%` : "";
	const band = (VIEWBOX_WIDTH - gutter) / rows.length;
	const cx = (i: number) => (i + 0.5) * band;

	const inRange = (i: number) => (i >= 0 && i < rows.length ? i : null);
	state.rowAt = type.centre
		? null
		: type.categories === "beside"
			? (_x, py) => inRange(Math.floor((py * unit) / (height / rows.length)))
			: (px) => inRange(Math.floor((px * unit) / band));
	const across = (band / VIEWBOX_WIDTH) * 100;
	const down = 100 / rows.length;
	state.rowBox =
		type.categories === "beside"
			? (i) => [0, i * down, 100, down]
			: (i) => [i * across, 0, across, 100];

	svg.setAttribute("viewBox", `0 0 ${VIEWBOX_WIDTH} ${short(height)}`);
	svg.textContent = ""; // geometry only; no text lives in here

	// The axes, with a short mark at each number, and gridlines if asked.
	if (frame && x) {
		const [fx, fy, fw, fh] = frame;
		const [across, up] = shownTicks;
		const scaleX = x;
		if (turnedOn(state.figure, "data-chart-grid", config.grid))
			svg.appendChild(
				svgEl("path", {
					class: GRID_CLASS,
					d: [...across.map((v) => `M${short(scaleX(v))},${short(fy)}V${short(fy + fh)}`), ...up.map((v) => `M${short(fx)},${short(y(v))}H${short(fx + fw)}`)].join(""),
				})
			);
		svg.appendChild(
			svgEl("path", {
				class: AXIS_CLASS,
				d: [
					`M${short(fx)},${short(fy)}V${short(fy + fh)}H${short(fx + fw)}`,
					...across.map((v) => `M${short(scaleX(v))},${short(fy + fh)}v${short(4 * unit)}`),
					...up.map((v) => `M${short(fx)},${short(y(v))}h${short(-4 * unit)}`),
				].join(""),
			})
		);
	}

	state.checks = [];
	const geo: Geometry = {
		rows,
		segments,
		cx,
		y,
		x,
		frame,
		length: (name, fallback) => cssLength(state.figure, unit, name, fallback),
		barWidth: Math.min(band * config.barfill, barMax(state.figure, unit)),
		barMax: barMax(state.figure, unit),
		height,
		unit,
		labelHeight,
		badgeHeight,
		after: rows.length,
		note: 0,
		labels:
			state.figure.dataset.chartLabels === "inside" ||
			(state.figure.dataset.chartLabels !== "outside" && config.labels === "inside")
				? "inside"
				: "outside",
		insideAlign: insideAlign(state.figure),
		breakAt,
		squeeze: compress,
		breakGap,
		domain: valueScale ? [valueScale.min, valueScale.max] : null,
		stacked: state.stacked,
		shape: shapeOf(state.figure, config),
		totals: state.totals,
		svg,
		plot,
		values,
		series,
		seriesValues,
		names,
		categories: state.categories,
		centre: state.centre,
		config,
		checks: state.checks,
		taken: [],
	};

	// How many elements start one after the other, so the stagger can shrink under `--tablechart-animation-max`.
	plot.style.setProperty("--count", String(Math.max(1, ...rows.map((row) => row.slot + 1))));
	type.draw(geo);
	if (geo.rowAt) state.rowAt = geo.rowAt;

	// The numbers along the value axis, fewer where two would touch, and none in the cut of a broken scale.
	if (along && valueScale) {
		const gap = 6 * unit;
		const at = sideways && geo.x ? geo.x : y;
		const ticks = Array.from(along.ticks.children) as HTMLElement[];
		const size = (value: number) => sizeOf(ticks.find((tick) => Number(tick.dataset.value) === value) ?? ticks[0]);
		const shown = thin(valueScale, (list) =>
			list.every((v, k) =>
				!k || (sideways ? at(v) - at(list[k - 1]) > ((size(v).width + size(list[k - 1]).width) / 2) * unit + gap : at(list[k - 1]) - at(v) > size(v).height * unit + gap / 2)
			)
		).ticks.filter((v) => !compress || v <= compress.lo || v >= compress.hi);
		for (const tick of ticks) {
			const value = Number(tick.dataset.value);
			const on = along.numbers && shown.includes(value);
			tick.dataset.place = on ? (sideways ? "below" : "before") : "none";
			if (on) placeAt(tick, sideways ? at(value) : -gap, sideways ? height + gap : at(value), VIEWBOX_WIDTH, height);
		}
		const end = VIEWBOX_WIDTH - gutter;
		// Under the marks.
		if (turnedOn(state.figure, "data-chart-grid", config.grid))
			svg.prepend(
				svgEl("path", {
					class: GRID_CLASS,
					d: shown.map((v) => (sideways ? `M${short(at(v))},0V${short(height)}` : `M0,${short(at(v))}H${short(end)}`)).join(""),
				})
			);
		if (along.numbers)
			svg.appendChild(
				svgEl("path", {
					class: AXIS_CLASS,
					d: [
						sideways ? `M${short(at(valueScale.min))},${short(height)}H${short(at(valueScale.max))}` : `M0,${short(at(valueScale.max))}V${short(at(valueScale.min))}`,
						...shown.map((v) => (sideways ? `M${short(at(v))},${short(height)}v${short(4 * unit)}` : `M0,${short(at(v))}h${short(-4 * unit)}`)),
					].join(""),
				})
			);
	}

	for (const [n, annotation] of annotations.entries()) {
		annotation.badge?.setAttribute("data-note", String(n + 1));
		// An annotation on another series reads that series as if it were the only one.
		const s = annotation.series;
		const pick = <T extends Row>(row: T): T => ({ ...row, ...(row.cells[s] ?? row.cells[0]) });
		annotation.type.draw(annotation.spec, annotation.badge, {
			...geo,
			// On a stacked chart, an annotation reads the totals.
			...(state.stacked && {
				rows: stackedRows,
				...(state.totals.length && { values: state.totals }),
			}),
			...(s > 0 && !state.stacked && {
				rows: rows.map(pick),
				segments: segments.map((seg) => {
					const picked = pick(seg);
					return seg.kind === "bar" ? { ...picked, to: picked.value } : picked;
				}),
				values: seriesValues[s],
			}),
			// Without steps, commentary comes when the marks are done: no later than their stagger steps.
			after: state.plan ? annotation.after : Math.min(annotation.after, Number(plot.style.getPropertyValue("--count")) || annotation.after),
			note: n + 1,
		});
	}

	// Before anything reads styles, so new marks start at their step and do not transition to it.
	applySteps(state);

	// Names under the plot shrink together, down to 70%, if one is wider than its column.
	const nameRow = state.categories[0]?.parentElement;
	if (nameRow && type.categories !== "beside" && !type.centre) {
		fitTogether(
			nameRow,
			state.categories.filter((name) => name.offsetParent !== null),
			(name) => ({ size: name.scrollWidth, room: name.clientWidth }),
			"--_name-fit"
		);
	}

	// A badge is a hole in the marks under it, so the background shows through.
	const holes = annotations.flatMap(({ badge }) => {
		if (!(badge instanceof HTMLElement) || !badge.offsetWidth) return [];
		const width = badge.offsetWidth * unit;
		const tall = badge.offsetHeight * unit;
		const x = (Number.parseFloat(badge.style.left) / 100) * VIEWBOX_WIDTH;
		const top = (Number.parseFloat(badge.style.top) / 100) * height;
		const radius = getComputedStyle(badge).borderTopLeftRadius;
		const share = radius.endsWith("%") ? Number.parseFloat(radius) / 100 : null;
		const px = (Number.parseFloat(radius) || 0) * unit;
		return [
			svgEl("rect", {
				class: HOLE_CLASS,
				"data-for": "badge",
				"data-note": badge.dataset.note ?? "",
				x: x - width / 2,
				y: top - tall / 2,
				width,
				height: tall,
				rx: share === null ? px : width * share,
				ry: share === null ? px : tall * share,
				style: ["--after", "--step"]
					.map((name) => badge.style.getPropertyValue(name) && `${name}:${badge.style.getPropertyValue(name)}`)
					.filter(Boolean)
					.join("; "),
			}),
		];
	});
	// The gridlines stop a little before each number and name on the chart, and go on after it, so the text reads on any background.
	// Reference lines too, so a line across a chart stops at the names and numbers it would cross.
	const grid = svg.querySelector<SVGElement>(`.${GRID_CLASS}`);
	const references = Array.from(svg.querySelectorAll<SVGElement>(`.${REFERENCE_CLASS}`));
	if (grid || references.length) {
		const box = plot.getBoundingClientRect();
		const scale = VIEWBOX_WIDTH / box.width;
		// The height of the letters, not of the line: the line height over the size of the text.
		const style = getComputedStyle(plot);
		const lines = Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize) || 1.2;
		const texts = [...seriesValues.flat(), ...state.totals, ...(type.categories === "beside" ? state.categories : [])];
		const under = texts.flatMap((node) => {
			if (node.dataset.place === "none" || node.hidden || node.hasAttribute("data-left-out")) return [];
			const r = node.getBoundingClientRect();
			const tall = (r.height * scale) / lines;
			// With the timing of its text, such as `--i` and `--step`, so the gap arrives with it.
			const timing = Array.from(node.style).filter((name) => name.startsWith("--")).map((name) => `${name}:${node.style.getPropertyValue(name)}`);
			return r.width
				? [
						svgEl("rect", {
							class: HOLE_CLASS,
							"data-for": "text",
							x: (r.left - box.left) * scale - 3 * unit,
							y: (r.top - box.top) * scale + (r.height * scale - tall) / 2 - unit,
							width: r.width * scale + 6 * unit,
							height: tall + 2 * unit,
							style: timing.join("; "),
						}),
					]
				: [];
		});
		// A line is left out where it crosses text, rather than masked: under a mask, Safari draws everything again on each frame.
		// A reference line also around its own label. With steps, the grid keeps a mask, so each gap can arrive at its step.
		const boxOf = (rect: SVGElement): Box => ["x", "y", "width", "height"].map((name) => Number(rect.getAttribute(name))) as Box;
		for (const line of references) lineAround(line, [...under, ...holes].map(boxOf));
		if (grid && state.plan) cutOut(svg, under, VIEWBOX_WIDTH, height, [grid]);
		else if (grid) {
			const lines = linesIn(grid);
			grid.setAttribute("d", lines.map(([x1, y1, x2, y2]) => piecesOf(x1, y1, x2, y2, under.map(boxOf))).join(""));
			// Over each gap, the piece of gridline it leaves out, with the timing of its text: it fades as the text arrives.
			for (const rect of under) {
				const d = piecesIn(lines, boxOf(rect));
				if (d) grid.after(svgEl("path", { class: GRID_CLASS, "data-gap": "", d, style: rect.getAttribute("style") ?? "" }));
			}
		}
	}
	// A reference line stays out of that group: under its mask, a fade would make Safari draw the whole group again on each frame.
	cutOut(svg, holes, VIEWBOX_WIDTH, height, undefined, `.${REFERENCE_CLASS}`);
	// Under a mask, Safari draws everything again on every frame, so every mask waits while the marks still have to build.
	if (state.figure.hasAttribute("data-animate") && !state.figure.hasAttribute("data-steps") && !state.figure.classList.contains(SHOWN_CLASS))
		takeMasksOff(svg);

	// A number that is not shown, for lack of room or by design, so `data-chart-table="auto"` prints the table.
	// A cell without a number, such as "n/a", has nothing to leave out; nor has a donut's total, which is in the middle.
	const skip = (label: HTMLElement) =>
		label.dataset.missing !== undefined || (type.centre && rows[Number(label.dataset.row) - 1]?.isTotal);
	const seen = (label: HTMLElement) => label.dataset.place !== "none" && !label.hasAttribute("data-left-out");
	// On a step chart, one number stands for the rows that share its value.
	const covered = (label: HTMLElement, all: HTMLElement[]) => {
		const row = Number(label.dataset.row);
		return all.some((one) => seen(one) && Number(one.dataset.row) <= row && row <= Number(one.dataset.rowEnd ?? one.dataset.row));
	};
	// A chart whose values are the fields of a mark, such as a scatter, shows names rather than numbers.
	state.figure.toggleAttribute(
		"data-left-out",
		(type.columns ? [state.categories] : [...seriesValues, state.totals]).some((all) => all.some((label) => !skip(label) && !seen(label) && !covered(label, all)))
	);

	return true;
};

/** Numbers are reformatted in place, so a language change costs no redraw. */
export const relabel = (state: ChartState, config: Config): void => {
	const values = [...state.seriesValues.flat(), ...state.totals, ...(state.totalCell ? [state.totalCell] : [])];
	for (const node of state.centre ? [...values, state.centre] : values) {
		if (node.dataset.missing !== undefined) node.textContent = node.dataset.missing;
		else writeNumber(node, node.dataset.decimals ? Number(node.dataset.decimals) : state.decimals, config.locale);
	}
};

/** The number in `data-value`, in the locale, with the text around it. */
const writeNumber = (node: HTMLElement, places: number, locale?: string): void => {
	const { prefix = "", suffix = "" } = node.dataset;
	const [sign, rest] = splitSign(Number.parseFloat(node.dataset.value || "0"), places, locale);
	node.textContent = prefix + (prefix ? sign : "") + rest + suffix;
	// A leading minus is set apart, so it can hang outside a centred number.
	if (sign && !prefix) {
		const minus = document.createElement("span");
		minus.className = MINUS_CLASS;
		minus.textContent = sign;
		node.prepend(minus);
	}
};

/** Removes what `build` added, so the chart can be built again. */
export const unbuild = (state: ChartState): void => {
	releaseTooltip(state);
	state.plot.remove();
	state.categories[0]?.parentElement?.remove();
	state.figure.querySelector(`:scope > .${LEGEND_CLASS}`)?.remove();
	state.controls?.remove();
};

/** One class, `is-shown`, starts the whole build. */
export const setShown = (state: ChartState, shown: boolean): void => {
	// The marks move back without masks too, and wait for them again on the next build.
	if (!shown && !state.figure.hasAttribute("data-steps")) takeMasksOff(state.svg);
	state.figure.classList.toggle(SHOWN_CLASS, shown);
	// A build without transitions, such as one shown before its first frame, gets its masks too.
	if (shown) requestAnimationFrame(() => requestAnimationFrame(() => settleMasks(state.figure, state.svg)));
};

/** Puts the masks on once a shown chart has nothing left to move. */
const settleMasks = (figure: HTMLElement, svg: SVGSVGElement): void => {
	if (figure.classList.contains(SHOWN_CLASS) && !svg.getAnimations({ subtree: true }).length) putMasksOn(svg);
};

/** Takes the masks of holes off until the build is done, such as when a chart is hidden. `putMasksOn` puts them back. A donut keeps the mask of its gaps. */
export const takeMasksOff = (svg: SVGSVGElement): void => {
	for (const group of svg.querySelectorAll<SVGElement>('[mask^="url(#tablechart-cut-"]')) {
		group.dataset.mask = group.getAttribute("mask") ?? "";
		group.removeAttribute("mask");
	}
};

/** Puts on the masks that waited for the build, at once, such as for print. */
export const putMasksOn = (svg: SVGSVGElement): void => {
	for (const group of svg.querySelectorAll<SVGElement>("[data-mask]")) {
		group.setAttribute("mask", group.dataset.mask ?? "");
		group.removeAttribute("data-mask");
	}
};
