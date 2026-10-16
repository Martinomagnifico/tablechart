import { axisBreak } from "./annotations/axis-break";
import { bracket } from "./annotations/bracket";
import { trend } from "./annotations/trend";
import { bar } from "./charts/bar";
import { column } from "./charts/column";
import { donut } from "./charts/donut";
import { area, line } from "./charts/line";
import { waterfall } from "./charts/waterfall";
import {
	BREAK_GAP,
	CATEGORIES_CLASS,
	CENTRE_CLASS,
	type Config,
	LEGEND_CLASS,
	NAME_CLASS,
	PLACED_CLASS,
	PLOT_CLASS,
	HOLE_CLASS,
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
import { cutOut, htmlEl, short, svgEl } from "./functions/svg";
import { applySteps, makeControls, planSteps, stepTo } from "./steps";
import { attachTooltip, releaseTooltip } from "./tooltip";
import type { AnnotationType, ChartState, ChartType, Geometry, Motion, Row, Shape } from "./types";

const CHARTS: Record<string, ChartType> = { area, bar, column, donut, line, waterfall };
const ANNOTATIONS: Record<string, AnnotationType> = { "axis-break": axisBreak, trend, bracket };
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
	if (series.length > 1 && !type.series) {
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

	const seriesValues = series.map((_one, s) =>
		rows.map((row, i) => {
			const cell = row.cells[s] ?? row.cells[0];
			const node = htmlEl(VALUE_CLASS, plot);
			node.classList.add(...row.classes);
			node.dataset.value = String(cell.value);
			if (cell.prefix) node.dataset.prefix = cell.prefix;
			if (cell.suffix) node.dataset.suffix = cell.suffix;
			if (cell.missing) node.dataset.missing = cell.raw;
			if (several) node.dataset.series = String(s + 1);
			node.dataset.row = String(i + 1);
			node.style.setProperty("--i", String(row.slot));
			return node;
		})
	);
	const values = seriesValues[0];

	const totals =
		stacked && type.totals
			? rows.map((row, i) => {
					const node = htmlEl(VALUE_CLASS, plot);
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
		(legendAsked === null ? config.legend || type.legend !== undefined : legendAsked !== "false")
			? document.createElement("div")
			: null;
	if (legend) {
		legend.className = LEGEND_CLASS;
		legend.setAttribute("aria-hidden", "true");
		legend.inert = true;
	}
	const names = several
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

	// A chart that steps (`data-fragment`) builds a step at a time, from left to right. Without animation it is shown whole.
	const plan = config.animate ? planSteps(figure) : null;
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

	if (config.animate) figure.setAttribute("data-animate", motionOf(figure, kind, config, Boolean(plan)));

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
	controls?.addEventListener("click", (event) => {
		const go = (event.target as Element).closest("button")?.dataset.go;
		if (go) stepTo(state, state.step + (go === "next" ? 1 : -1));
	});
	stepTo(state, 0, true);
	// `hover` and `data-chart-hover` are the old names.
	const own = figure.getAttribute("data-chart-tooltip") ?? figure.getAttribute("data-chart-hover");
	const tooltip = own === "false" ? false : own === "auto" ? "auto" : own !== null ? true : config.hover === false ? false : config.tooltip;
	if (tooltip) attachTooltip(state, config, tooltip === "auto");
	relabel(state, config);
	return state;
};

const MOTIONS: Record<string, Motion> = { grow: "grow", sweep: "sweep" };
const TABLES = ["never", "auto", "print", "always"];
// `up` and `across` are the old names of `grow` and `sweep`, for lines and areas.
const LINE_MOTIONS: Record<string, Motion> = { ...MOTIONS, up: "grow", across: "sweep" };

/**
 * How a chart builds: the figure's `data-chart-animate`, or else the option, or else the default of its kind.
 * A line or area sweeps by default; a donut and a waterfall grow, and can sweep; columns and bars only grow.
 * A line or area with steps sweeps. The old names `up` and `across` were only for lines and areas.
 */
const motionOf = (figure: HTMLElement, kind: string, config: Config, steps: boolean): Motion => {
	const lines = kind === "line" || kind === "area";
	const names = lines ? LINE_MOTIONS : MOTIONS;
	const asked: Motion | undefined = names[figure.getAttribute("data-chart-animate") ?? ""] ?? names[String(config.animate)];
	if (lines) return steps ? "sweep" : (asked ?? "sweep");
	return kind === "donut" || kind === "waterfall" ? (asked ?? "grow") : "grow";
};

// A CSS length in viewBox units, or null if it is not a length, such as `none`.
const insideAlign = (figure: HTMLElement): Geometry["insideAlign"] => {
	const style = getComputedStyle(figure);
	const asked = (style.getPropertyValue("--tablechart-value-align") || style.getPropertyValue("--tablechart-inside-align")).trim();
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

	const widthPx = plot.clientWidth;
	if (!widthPx) return false;

	// viewBox units per screen pixel.
	const unit = VIEWBOX_WIDTH / widthPx;
	// A figure's own `data-chart-aspect` beats the kind's and the page's.
	const ownAspect = Number.parseFloat(state.figure.dataset.chartAspect ?? "");
	const shaped = VIEWBOX_WIDTH * (ownAspect > 0 ? ownAspect : (type.aspect ?? config.aspect));

	plot.classList.add(PLACED_CLASS);
	// Undo what the last layout did to the size of the text, then read every size at once, before anything is placed.
	for (const node of [...seriesValues.flat(), ...state.totals]) delete node.dataset.place;
	plot.style.removeProperty("--_fit");
	state.categories[0]?.parentElement?.style.removeProperty("--_beside");
	measureAll([...seriesValues.flat(), ...state.totals, ...names, ...state.categories, ...annotations.map((a) => a.badge)]);

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
	const ceiling = extent * 1.02;
	const bottom = depth * 1.02;

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

	state.checks = [];
	const geo: Geometry = {
		rows,
		segments,
		cx,
		y,
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
	};

	// How many elements start one after the other, so the stagger can shrink under `--tablechart-animation-max`.
	plot.style.setProperty("--count", String(Math.max(1, ...rows.map((row) => row.slot + 1))));
	type.draw(geo);

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
			after: annotation.after,
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
	cutOut(svg, holes, VIEWBOX_WIDTH, height);

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
	state.figure.toggleAttribute(
		"data-left-out",
		[...seriesValues, state.totals].some((all) => all.some((label) => !skip(label) && !seen(label) && !covered(label, all)))
	);

	return true;
};

/** Numbers are reformatted in place, so a language change costs no redraw. */
export const relabel = (state: ChartState, config: Config): void => {
	const values = [...state.seriesValues.flat(), ...state.totals, ...(state.totalCell ? [state.totalCell] : [])];
	for (const node of state.centre ? [...values, state.centre] : values) {
		const { missing, prefix = "", suffix = "" } = node.dataset;
		if (missing !== undefined) {
			node.textContent = missing;
			continue;
		}
		const value = Number.parseFloat(node.dataset.value || "0");
		const places = node.dataset.decimals ? Number(node.dataset.decimals) : state.decimals;
		const [sign, rest] = splitSign(value, places, config.locale);
		node.textContent = prefix + (prefix ? sign : "") + rest + suffix;
		// A leading minus is set apart, so it can hang outside a centred number.
		if (sign && !prefix) {
			const minus = document.createElement("span");
			minus.className = MINUS_CLASS;
			minus.textContent = sign;
			node.prepend(minus);
		}
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
	state.figure.classList.toggle(SHOWN_CLASS, shown);
};
