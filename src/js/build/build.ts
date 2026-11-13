import { note } from "../annotations/note";
import {
	AXIS_CLASS,
	TICK_CLASS,
	CATEGORIES_CLASS,
	CENTRE_CLASS,
	type Config,
	LEGEND_CLASS,
	NAME_CLASS,
	PLOT_CLASS,
	VALUES_CLASS,
	LIBRARY_NAME,
	SR_CLASS,
	VALUE_CLASS,
} from "../config";
import { decimalsIn, largest } from "../shared/format";
import { markerOf } from "../draw/markers";
import { stackTotal } from "../shared/stacks";
import { readSeries, readTable } from "./read-table";
import { htmlEl, svgEl } from "../draw/svg";
import { debug } from "../shared/debug";
import { makeControls, planSteps, stepTo } from "../show/steps";
import { attachTooltip, releaseTooltip } from "../show/tooltip";
import { attachCrosshair } from "../show/crosshair/attach";
import { writeNumber } from "../shared/numbers";
import type { ChartState, Motion, Series } from "../types";
import { ANNOTATIONS, CHARTS } from "../charts/registry";
import { animated, axisRight, shapeOf, turnedOn } from "../shared/settings";
import { settleMasks } from "../show/shown";
import { tableOf } from "../shared/table";

/** Three passes: keys, then every text element, then geometry. Geometry makes no text, so a translation script that sweeps once finds it all. */

const textBefore = (node: Node): string => {
	let text = "";
	for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) {
		text = (sibling.textContent ?? "") + text;
		if (text.trim()) break;
	}
	return text.trim();
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
	const table = tableOf(figure);
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
	const table = tableOf(figure);
	if (table && !named(table) && !table.querySelector(":scope > caption")) link(table);
};

/** Every six lines the points start again, with the next line style: 24 looks. */
const LINE_ROUNDS = [null, "dashed", "dotted", "dash-dot"] as const;

/** The look of each next line, unless its column header has its own: from `data-chart-lines`, the `lines` option, or else the 24 looks. Over columns, only the lines count. */
const lineStyles = (figure: HTMLElement, series: Series[], kind: string, config: Config): void => {
	const asked = figure.closest("[data-chart-lines]")?.getAttribute("data-chart-lines");
	let order = config.lines;
	if (asked) {
		try {
			order = JSON.parse(asked);
		} catch {
			console.warn(`[${LIBRARY_NAME}] data-chart-lines needs a JSON list, such as [{"marker":"none"}].`, figure);
		}
	}
	const lines = kind === "line" || kind === "area" ? series : series.filter((one) => one.chart);
	lines.forEach((one, k) => {
		if (!order?.length) {
			one.line ??= LINE_ROUNDS[Math.floor(k / 6) % LINE_ROUNDS.length];
			return;
		}
		const style = order[k % order.length];
		one.marker ??= style.marker || style.open !== undefined ? [style.marker, style.open ? "open" : "filled"].filter(Boolean).join(" ") : null;
		if (one.line === null && style.line !== "solid") one.line = style.line ?? null;
	});
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
			tableOf(figure)
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
	// A line over the columns: `data-chart="line"` on a header, in a chart that takes it, and not on every header.
	if (series.some((one) => one.chart)) {
		const problem = !type.lines
			? `A ${kind} chart cannot draw a series as a line.`
			: series.every((one) => one.chart)
				? `Every series has data-chart="line", so the chart is a line chart: set data-chart="line" on the figure.`
				: null;
		if (problem) {
			console.warn(`[${LIBRARY_NAME}] ${problem}`);
			series = series.map((one) => ({ ...one, chart: null }));
		}
	}
	lineStyles(figure, series, kind, config);
	const lined = series.some((one) => one.chart);
	const several = series.length > 1;
	// How many lines or bars share the colour steps, so the last is not too light.
	if (several) figure.style.setProperty("--_series-count", String(series.length));

	const stackAsked = figure.hasAttribute("data-chart-stack");
	if (stackAsked && !type.stackable)
		console.warn(`[${LIBRARY_NAME}] A ${kind} chart cannot be stacked.`);
	if (stackAsked && lined) console.warn(`[${LIBRARY_NAME}] A chart with a line cannot be stacked.`);
	const stacked = stackAsked && !!type.stackable && several && !lined;

	// Hidden from screen readers: they read the table, which has the same numbers and names.
	const plot = document.createElement("div");
	plot.className = PLOT_CLASS;
	plot.setAttribute("aria-hidden", "true");
	const svg = svgEl("svg", { role: "presentation", focusable: "false" });
	plot.appendChild(svg);
	// The chart goes where the table is, so the author decides what is above and under it, such as a summary.
	const spot = figure.querySelector(":scope > table");
	const put = (node: HTMLElement) => (spot ? spot.before(node) : figure.append(node));
	put(plot);

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
			if (type.numbers === false && (s || i)) node.dataset.place = "none";
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
	const lineSeries = series.filter((one) => one.chart);
	const names = several && !type.columns
		? series.map((one, s) => {
				const node = htmlEl(NAME_CLASS, legend ?? plot);
				if (legend) node.dataset.place = "legend";
				const swatch = one.chart ? undefined : (type.legend ?? type.swatch);
				if (swatch) node.dataset.swatch = swatch;
				node.textContent = one.name;
				// A step line has no points, so its legend sample has none.
				if (!swatch && shapeOf(figure, config) !== "step") {
					// Over columns, a line takes its marker as the first of the lines, as it does on the chart.
					const marker = one.chart ? markerOf(lineSeries, lineSeries.indexOf(one)) : markerOf(series, s);
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
		// The short name, if the row has one; its key then ends in `-short`, so a translation script gives it a short name too.
		span.textContent = row.short ?? row.label;
		if (row.key && config.langattribute) span.setAttribute(config.langattribute, row.short ? `${row.key}-short` : row.key);
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
	// How many slices share the colour steps, for a range from one colour to another.
	if (type.centre) figure.style.setProperty("--_slice-count", String(slice));
	if (beside) plot.appendChild(categories);
	else put(categories);
	if (legend) put(legend);

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
				right: false,
			}
		: valueAxis || (!type.centre && turnedOn(figure, "data-chart-grid", config.grid))
			? { titles: [], ticks: htmlEl(`${TICK_CLASS}s`, plot), numbers: valueAxis, right: type.categories !== "beside" && axisRight(figure, config) }
			: null;
	type.text?.({ figure, plot, rows, series, config });

	// A chart that steps (`data-fragment`) builds a step at a time, from left to right. Without animation it is shown whole.
	// A scatter chart has one step: the whole chart arrives together, after its axes and a quadrant, with `data-fragment` on the figure.
	const plan = animated(figure, config) ? planSteps(figure, Boolean(type.axes)) : null;
	if (type.axes && tableOf(figure)?.querySelector("tbody [data-fragment], thead [data-fragment]"))
		debug.log(`A ${kind} chart has one step, with data-fragment on the figure; its rows and columns have no steps of their own.`, figure);
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
	if (controls) put(controls);

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
	// A row with a cell in a column with `data-note` gets a note on a chart with its rows across. The note is in the table,
	// with its row, so it is not written again for screen readers.
	if (!beside && !type.centre && !type.axes)
		for (const [i, row] of rows.entries()) {
			if (!row.note) continue;
			const spec = document.createElement("span");
			spec.dataset.annotation = "note";
			spec.dataset.row = String(i + 1);
			spec.textContent = row.note;
			if (row.noteKey) spec.setAttribute("data-i18n", row.noteKey);
			annotations.push({ spec, type: note, badge: note.create(spec, plot), series: 0, after: rows.length });
		}

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
		pointOf: null,
		crossingOf: null,
		crosshair: null,
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
	const tooltip = own === "false" ? false : own === "auto" || own === "crosshair" ? own : own !== null ? true : config.tooltip;
	// A crosshair is for a line or an area; another chart gets the tooltip.
	if (tooltip === "crosshair" && (kind === "line" || kind === "area")) attachCrosshair(state);
	else if (tooltip) attachTooltip(state, config, tooltip === "auto");
	relabel(state, config);
	return state;
};

const MOTIONS: Record<string, Motion> = { grow: "grow", sweep: "sweep" };

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

/** Numbers are reformatted in place, so a language change costs no redraw. */
export const relabel = (state: ChartState, config: Config): void => {
	const values = [...state.seriesValues.flat(), ...state.totals, ...(state.totalCell ? [state.totalCell] : [])];
	for (const node of state.centre ? [...values, state.centre] : values) {
		if (node.dataset.missing !== undefined) node.textContent = node.dataset.missing;
		else writeNumber(node, node.dataset.decimals ? Number(node.dataset.decimals) : state.decimals, config.locale);
	}
};

/** Removes what `build` added, so the chart can be built again. */
export const unbuild = (state: ChartState): void => {
	releaseTooltip(state);
	state.crosshair?.hide();
	state.plot.remove();
	state.categories[0]?.parentElement?.remove();
	state.figure.querySelector(`:scope > .${LEGEND_CLASS}`)?.remove();
	state.controls?.remove();
};
