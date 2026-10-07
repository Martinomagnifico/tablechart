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
	PLUGIN_ID,
	POINTER_CLASS,
	SR_CLASS,
	SHOWN_CLASS,
	VALUE_CLASS,
	VIEWBOX_WIDTH,
} from "./config";
import { decimalsIn, formatValue } from "./functions/format";
import { markerOf } from "./functions/markers";
import { stackTotal } from "./functions/groups";
import { fitTogether } from "./functions/labels";
import { readSeries, readTable } from "./functions/read-table";
import { cutOut, htmlEl, svgEl } from "./functions/svg";
import type { AnnotationType, ChartState, ChartType, Geometry, Row, Shape } from "./types";

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
			`[${PLUGIN_ID}] Unknown chart type "${kind}". Known types: ${Object.keys(CHARTS).join(", ")}.`
		);
		return null;
	}

	const rows = readTable(figure, config.langattribute);
	if (!rows.length) {
		console.warn(
			`[${PLUGIN_ID}] A chart has no rows in its table, so there is nothing to draw.`
		);
		return null;
	}

	nameTable(figure);

	let series = readSeries(figure, rows, config.langattribute);
	if (series.length > 1 && !type.series) {
		console.warn(
			`[${PLUGIN_ID}] A ${kind} chart draws one series; only the first of the table's ${series.length} value columns is used.`
		);
		series = series.slice(0, 1);
	}
	const several = series.length > 1;
	// How many lines or bars share the colour steps, so the last is not too light.
	if (several) figure.style.setProperty("--tablechart-series-count", String(series.length));

	const stackAsked = figure.hasAttribute("data-chart-stack");
	if (stackAsked && !type.stackable)
		console.warn(`[${PLUGIN_ID}] A ${kind} chart cannot be stacked.`);
	const stacked = stackAsked && !!type.stackable && several;
	if (
		stacked &&
		rows.some((row) => row.cells.slice(0, series.length).some((cell) => cell.value < 0))
	)
		console.warn(
			`[${PLUGIN_ID}] A stacked chart has a value below zero. It takes no room in the stack.`
		);

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
		...marked.flatMap((r) => r.cells.slice(0, series.length).map((c) => decimalsIn(c.number)))
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
	categories.style.setProperty("--tablechart-columns", String(rows.length));
	let slice = 0;
	for (const row of rows) {
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
		span.dataset.row = String(rows.indexOf(row) + 1);
		categories.appendChild(span);
	}
	(beside ? plot : figure).appendChild(categories);
	if (legend) figure.appendChild(legend);

	const annotations = Array.from(figure.querySelectorAll<HTMLElement>("[data-annotation]"))
		.map((spec) => {
			const name = spec.getAttribute("data-annotation") as string;
			const annotationType = ANNOTATIONS[name];
			if (!annotationType) {
				console.warn(
					`[${PLUGIN_ID}] Unknown annotation "${name}". Known annotations: ${Object.keys(ANNOTATIONS).join(", ")}.`
				);
				return null;
			}
			const asked = Number.parseInt(spec.getAttribute("data-series") ?? "1", 10);
			const index = asked >= 1 && asked <= series.length ? asked - 1 : 0;
			if (asked !== index + 1)
				console.warn(
					`[${PLUGIN_ID}] An annotation reads line ${asked}, which the chart does not have; it reads the first.`
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

	if (config.animate) figure.setAttribute("data-animate", "");

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
	};
	if (config.hover && figure.getAttribute("data-chart-hover") !== "false") pointAt(state);
	relabel(state, config);
	return state;
};

// A CSS length in viewBox units, or null if it is not a length, such as `none`.
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
	const labelHeight = (values[0]?.offsetHeight || 0) * unit;
	const badgeHeight = annotations[0]?.badge
		? (annotations[0].badge as HTMLElement).offsetHeight * unit
		: 0;
	// Never less than `--tablechart-min-height` (200px), or what the kind needs.
	const height = Math.max(
		shaped,
		cssLength(state.figure, unit, "--tablechart-min-height", "200px") ?? 0,
		type.minHeight?.({
			labelHeight,
			nameHeight: Math.max(0, ...state.categories.map((name) => name.offsetHeight)) * unit,
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
	const headroom = type.headroom?.(room) ?? labelHeight;
	const floor = 2 * unit + (type.footroom?.(room) ?? 0);
	const top = headroom;

	const extent = state.stacked
		? Math.max(...stackedRows.map((row) => row.value), 0)
		: Math.max(
				...segments.flatMap((s) => [s.from, s.to, s.value]),
				...rows.flatMap((row) => row.cells.slice(0, series.length).map((cell) => cell.value))
			);
	const plotHeight = height - top - floor;
	const ceiling = extent * 1.02;

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

	let compress: { lo: number; hi: number; gap: number; share: number } | null = null;
	if (breakSpec && (fromAsked !== null || toAsked !== null)) {
		const lo = fromAsked ?? 0;
		const hi = toAsked ?? ceiling;
		// The zigzag goes where the compressed part meets the part at full scale.
		const gap = toAsked === null ? lo : fromAsked === null ? hi : (lo + hi) / 2;

		const sizeAsked = breakSpec.getAttribute("data-size");
		const sizeMatch = sizeAsked?.match(/^\s*(\d+(?:\.\d+)?)\s*%\s*$/);
		if (sizeAsked !== null && !sizeMatch) {
			console.warn(
				`[${PLUGIN_ID}] data-size="${sizeAsked}" is not a percentage, such as 30%. Using the default.`
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
			console.warn(`[${PLUGIN_ID}] This kind of chart cannot break its scale.`);
		} else if (lo < 0 || hi <= lo || hi > ceiling || (lo === 0 && hi === ceiling)) {
			console.warn(
				`[${PLUGIN_ID}] A break from ${lo} to ${hi} does not fit a scale that runs from 0 to ${extent}.`
			);
		} else if (floats.length) {
			console.warn(
				`[${PLUGIN_ID}] A break from ${lo} to ${hi} would cut a step that floats. Keep it below or above the steps.`
			);
		} else {
			compress = { lo, hi, gap, share };
		}
	}
	const breakAt = compress ? compress.gap : null;

	// Full scale below and above the break, compressed through it.
	const base = height - floor;
	let y: (value: number) => number = (value) => base - (value / ceiling) * plotHeight;
	if (compress) {
		const { lo, hi, gap, share } = compress;
		const squeezed = plotHeight * share;
		const density = (plotHeight - squeezed - BREAK_GAP) / (lo + (ceiling - hi));
		const perValue = squeezed / (hi - lo);
		y = (value) => {
			if (value <= lo) return base - value * density;
			if (value <= gap) return base - lo * density - (value - lo) * perValue;
			if (value <= hi) return base - lo * density - (value - lo) * perValue - BREAK_GAP;
			return base - lo * density - squeezed - BREAK_GAP - (value - hi) * density;
		};
	}
	// The bands give up the room the widest series name needs.
	const gutter = names.length
		? Math.max(...names.map((name) => name.offsetWidth)) * unit + 12 * unit
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

	svg.setAttribute("viewBox", `0 0 ${VIEWBOX_WIDTH} ${height}`);
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
		breakAt,
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

	type.draw(geo);

	// Names under the plot shrink together, down to 70%, if one is wider than its column.
	const nameRow = state.categories[0]?.parentElement;
	if (nameRow && type.categories !== "beside" && !type.centre) {
		fitTogether(
			nameRow,
			state.categories.filter((name) => name.offsetParent !== null),
			(name) => ({ size: name.scrollWidth, room: name.clientWidth }),
			"--tablechart-name-fit"
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
			after: annotation.after,
			note: n + 1,
		});
	}

	// A callout is a hole in the marks under it, so the background shows through.
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
				style: ["--after"]
					.map((name) => badge.style.getPropertyValue(name) && `${name}:${badge.style.getPropertyValue(name)}`)
					.filter(Boolean)
					.join("; "),
			}),
		];
	});
	cutOut(svg, holes, VIEWBOX_WIDTH, height);

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
		node.textContent = prefix + formatValue(value, places, config.locale) + suffix;
	}
};

/** Removes what `build` added, so the chart can be built again. */
export const unbuild = (state: ChartState): void => {
	state.plot.remove();
	state.categories[0]?.parentElement?.remove();
	state.figure.querySelector(`:scope > .${LEGEND_CLASS}`)?.remove();
};

/** One class, `is-shown`, starts the whole build. */
export const setShown = (state: ChartState, shown: boolean): void => {
	state.figure.classList.toggle(SHOWN_CLASS, shown);
	// A chart that builds again has its numbers arrive in turn again.
	if (!shown) state.plot.removeAttribute("data-pointed");
};

/** Pointing at a row shows its numbers that were left out for lack of room. */
const pointAt = (state: ChartState): void => {
	const { plot } = state;
	const labels = () => [...state.seriesValues.flat(), ...state.totals];
	const covers = (label: HTMLElement, row: number) => {
		const from = Number(label.dataset.row);
		const to = Number(label.dataset.rowEnd ?? from);
		return row >= from && row <= to;
	};
	plot.setAttribute("data-hover", "");
	// A faint band behind the row that is pointed at.
	const band = document.createElement("div");
	band.className = POINTER_CLASS;
	plot.prepend(band);
	const clear = () => {
		plot.removeAttribute("data-active");
		for (const label of labels()) label.removeAttribute("data-active");
	};
	const activate = (event: PointerEvent) => {
		if (!plot.classList.contains(PLACED_CLASS) || !state.rowAt) return;
		const box = plot.getBoundingClientRect();
		// The plot can be scaled with a CSS transform.
		const scale = box.width / plot.offsetWidth || 1;
		const index = state.rowAt((event.clientX - box.left) / scale, (event.clientY - box.top) / scale);
		const row = index === null ? null : index + 1;
		const shown = (label: HTMLElement) => label.dataset.place !== "none";
		const mine = row === null ? [] : labels().filter((label) => covers(label, row) && shown(label));
		const hidden = labels().some((label) => label.hasAttribute("data-left-out") && shown(label));
		if (!hidden || !mine.length) return clear();
		// From now on, numbers show and hide at once, not in turn.
		plot.setAttribute("data-pointed", "");
		plot.setAttribute("data-active", String(row));
		const [left, top, width, height] = state.rowBox?.((row as number) - 1) ?? [0, 0, 0, 0];
		Object.assign(band.style, { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` });
		for (const label of labels()) label.toggleAttribute("data-active", mine.includes(label));
	};
	plot.addEventListener("pointermove", activate);
	plot.addEventListener("pointerdown", activate);
	plot.addEventListener("pointerleave", (event) => {
		// A tap ends with the pointer leaving; the numbers stay until the next tap.
		if (event.pointerType === "mouse") clear();
	});
	document.addEventListener("pointerdown", (event) => {
		if (!plot.contains(event.target as Node)) clear();
	});
};
