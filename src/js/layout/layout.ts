import { bar } from "../charts/bar";
import { column } from "../charts/column";
import { area, line } from "../charts/line";
import {
	AREA_CLASS,
	BREAK_GAP,
	GRID_CLASS,
	HEAD_CLASS,
	LINE_CLASS,
	type Config,
	LEGEND_CLASS,
	NAME_CLASS,
	PLACED_CLASS,
	HOLE_CLASS,
	QUADRANT_CLASS,
	REFERENCE_CLASS,
	SERIES_CLASS,
	LIBRARY_NAME,
	SHOWN_CLASS,
	VIEWBOX_WIDTH,
} from "../config";
import { largest } from "../shared/format";
import { stackReach, stackTotal } from "../shared/stacks";
import { keepInside, thinOut } from "./labels";
import { measureAll, sizeOf } from "./measure";
import { along as alongScale, reachOf, squeezeOf } from "../scale/scale";
import { clipAround, cutOut, roundEnds, short, svgEl } from "../draw/svg";
import type { Scale } from "../scale/axis";
import type { Box } from "./collision";
import { inkInside, inkNames, measureSurface } from "../colour/colour";
import { applySteps } from "../show/steps";
import { drawFrame, frameScalesOf, placeFrame, placeValueAxis, valueAxisOf } from "./chart-axes";
import { agree, remember } from "./chart-group";
import { fitNames, lineUpNames } from "./names";
import { cornerOf, cssLength, heightRange } from "../shared/settings";
import type { ChartState, Geometry, Row, ValuePick } from "../types";
import { lineAround, linesIn, piecesIn, piecesOf } from "./gaps";
import { shapeOf } from "../shared/settings";
import { takeMasksOff } from "../show/shown";

// A CSS length in viewBox units, or null if it is not a length, such as `none`.
const insideAlign = (figure: HTMLElement): Geometry["insideAlign"] => {
	const style = getComputedStyle(figure);
	const asked = style.getPropertyValue("--tablechart-value-align").trim();
	return asked === "start" || asked === "center" || asked === "end" ? asked : null;
};

/** Where the numbers of columns and bars go. With a line over the columns, inside them where they fit, as the line takes the room above. */
const labelsOf = (figure: HTMLElement, config: Config, withLine: boolean): Geometry["labels"] =>
	figure.dataset.chartLabels === "inside" || (figure.dataset.chartLabels !== "outside" && (config.labels === "inside" || withLine))
		? "inside"
		: "outside";

const barMax = (figure: HTMLElement, unit: number): number =>
	cssLength(figure, unit, "--tablechart-bar-max", "60px") ?? Number.POSITIVE_INFINITY;

/** A hole for each text that is shown, the height of its letters, with the timing of its text so it arrives with it. */
const textHoles = (plot: HTMLElement, unit: number) => {
	const box = plot.getBoundingClientRect();
	const scale = VIEWBOX_WIDTH / box.width;
	// The height of the letters, not of the line: the line height over the size of the text.
	const style = getComputedStyle(plot);
	const lines = Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize) || 1.2;
	return (node: HTMLElement): SVGElement[] => {
		if (node.dataset.place === "none" || node.hidden || node.hasAttribute("data-left-out")) return [];
		const r = node.getBoundingClientRect();
		const tall = (r.height * scale) / lines;
		// Such as `--i` and `--step`.
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
	};
};

const VALUE_KEYS = ["first", "last", "highest", "lowest", "outliers"];

/** `data-chart-values`, such as `auto`, `none` or `first last`: which values a line shows. `none` is the empty set. */
const pickOf = (figure: HTMLElement, config: Config): ValuePick => {
	const words = (figure.getAttribute("data-chart-values") ?? config.values).trim().toLowerCase().split(/\s+/).filter(Boolean);
	for (const word of words)
		if (!["auto", "all", "none", ...VALUE_KEYS].includes(word))
			console.warn(`[${LIBRARY_NAME}] data-chart-values knows no "${word}". It takes auto, all, none, ${VALUE_KEYS.join(", ")}.`);
	const keys = words.filter((word) => VALUE_KEYS.includes(word));
	if (words.includes("all")) return { mode: "all", keys: [] };
	if (words.includes("none")) return { mode: "set", keys: [] };
	if (words.includes("auto") || !keys.length) return { mode: "auto", keys: keys.length ? keys : VALUE_KEYS };
	return { mode: "set", keys };
};

const TABLES = ["never", "auto", "print", "always"];

/**
 * Where the table and the summary are shown: on screen, in print, or in print when numbers are left out. Read at each layout,
 * so a page that changes `data-chart-table` or `data-chart-summary` only needs `refresh()`. The table is already right under the chart.
 */
const showTable = ({ figure, rows, series }: ChartState, config: Config): void => {
	const asked = figure.getAttribute("data-chart-table");
	const table = asked && TABLES.includes(asked) ? asked : config.table;
	if (table === "never") figure.removeAttribute("data-table");
	else figure.setAttribute("data-table", table);
	const summary = figure.getAttribute("data-chart-summary");
	figure.setAttribute("data-summary", summary && TABLES.includes(summary) ? summary : config.summary);
	// With more values than `tablelimit`, a table is too long to print with `auto`: the summary is printed instead.
	figure.toggleAttribute("data-long", rows.length * series.filter((one) => !one.group).length > config.tablelimit);
};

/** Pass 3. Needs layout; makes no text, only places it. */
export const layout = (state: ChartState, config: Config): boolean => {
	remember(state, config);
	const done = layoutOne(state, config);
	if (done) agree(state.figure, layoutOne);
	return done;
};

const layoutOne = (state: ChartState, config: Config): boolean => {
	const { plot, svg, rows, type, values, series, seriesValues, names, annotations } = state;
	showTable(state, config);
	// With an end colour, lines and slices go from the first colour to the end colour, rather than lighter towards the background.
	const style = getComputedStyle(state.figure);
	state.figure.toggleAttribute("data-series-range", !!style.getPropertyValue("--tablechart-series-color-end").trim());
	state.figure.toggleAttribute("data-slice-range", !!style.getPropertyValue("--tablechart-slice-color-end").trim());
	// A figure's own `data-chart-aspect` beats the kind's and the page's.
	const ownAspect = Number.parseFloat(state.figure.dataset.chartAspect ?? "");
	const aspect = ownAspect > 0 ? ownAspect : (type.aspect ?? config.aspect);

	// The value axis of a column, bar or line chart. Its numbers are measured first, as they take room beside the plot, or under a bar chart.
	const sideways = type.categories === "beside";
	const along = state.axes && !type.axes ? state.axes : null;
	let valueScale: Scale | null = null;
	if (along) {
		valueScale = valueAxisOf(state, config, along, aspect);
		if (!valueScale) return false;
	}

	const widthPx = plot.clientWidth;
	if (!widthPx) return false;

	// viewBox units per screen pixel.
	const unit = VIEWBOX_WIDTH / widthPx;
	const [least, most] = heightRange(state.figure, unit);
	const shaped = Math.min(VIEWBOX_WIDTH * aspect, most);

	plot.classList.add(PLACED_CLASS);
	// Undo what the last layout did to the size of the text, then read every size at once, before anything is placed.
	// Without numbers on the chart, only the first is measured, for the room above.
	const shown = type.numbers === false ? values.slice(0, 1) : [...seriesValues.flat(), ...state.totals];
	for (const node of shown) {
		delete node.dataset.place;
		node.removeAttribute("data-left-out");
		node.removeAttribute("data-cut");
	}
	plot.style.removeProperty("--_fit");
	// Grouped numbers are smaller. Marked before they are measured, so the first layout measures them as every later one does.
	plot.toggleAttribute("data-grouped", !!type.groups && !state.stacked && series.filter((one) => !one.chart && !one.group).length > 1);
	state.categories[0]?.parentElement?.style.removeProperty("--_beside");

	// The numbers along the axes, for a first guess at the room. Once they are measured, some may be left out.
	const axes = type.axes ? state.axes : null;
	const scales = axes ? frameScalesOf(state, config, axes, shaped, unit, widthPx) : [];
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
	if (type.numbers === false && values[0]) values[0].dataset.place = "none";
	const badgeHeight = annotations[0]?.badge ? sizeOf(annotations[0].badge).height * unit : 0;
	// Never less than `--tablechart-min-height` (200px), or what the kind needs: rows that need more than the maximum get it.
	const height = Math.max(
		shaped,
		least,
		state.agreed?.height ?? 0,
		type.minHeight?.({
			labelHeight,
			nameHeight: Math.max(0, largest(state.categories.map((name) => sizeOf(name).height))) * unit,
			unit,
			rows: rows.length,
			series: series.length,
			stacked: state.stacked,
			labels: labelsOf(state.figure, config, series.some((one) => one.chart)),
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
	const { extent, depth, steps } = reachOf(
		segments,
		rows.flatMap((row) => row.cells.slice(0, series.length).map((cell) => cell.value)),
		state.stacked ? rows.map((row) => stackReach(row, series.length, type.running)) : null
	);

	const lineSeries = series.flatMap((one, s) => (one.chart ? [s] : []));
	// A line over the columns has its numbers above its points, which needs more room.
	// Notes are at the top, over the marks.
	const noteRoom = rows.some((row) => row.note) ? badgeHeight + 4 * unit : 0;
	const headroom = Math.max(type.headroom?.(room) ?? labelHeight, lineSeries.length ? (line.headroom?.(room) ?? 0) : 0) + noteRoom;
	const floor = 2 * unit + (type.footroom?.(room) ?? 0) + (depth < 0 ? labelHeight + 4 * unit : 0);
	const top = Math.max(headroom, state.agreed?.room ?? 0);
	const foot = Math.max(floor, state.agreed?.floor ?? 0);

	const plotHeight = height - top - foot;
	// With an axis or gridlines, the scale of the axis; a value beyond it is still shown whole.
	const ceiling = Math.max(valueScale ? Math.max(valueScale.max, extent) : extent * 1.02, state.agreed?.ceiling ?? 0);
	const bottom = Math.min(valueScale ? Math.min(valueScale.min, depth) : depth * 1.02, state.agreed?.bottom ?? 0);

	// The break squeezes `data-from` to `data-to` into `data-size` of the plot; `data-at` is the old spelling of `data-from`.
	const breakSpec = annotations.find(
		(a) => a.spec.getAttribute("data-annotation") === "axis-break"
	)?.spec;
	const read = (name: string): number | null => {
		const value = Number.parseFloat(breakSpec?.getAttribute(name) ?? "");
		return Number.isFinite(value) ? value : null;
	};
	const { squeeze: compress, problems } = squeezeOf({
		from: read("data-from") ?? read("data-at"),
		to: read("data-to"),
		size: breakSpec?.getAttribute("data-size") ?? null,
		ceiling,
		extent,
		depth,
		breakable: !!type.breakable,
		segments,
	});
	for (const problem of problems) console.warn(`[${LIBRARY_NAME}] ${problem}`);
	const breakAt = compress ? compress.gap : null;
	state.measured = [column, bar, line, area].includes(type) && !compress && !steps ? { height, room: top, floor: foot, ceiling, bottom } : null;

	// The empty space where the scale jumps: `--tablechart-break-gap`, or 1.3% of the width if not set.
	const breakGap = (compress && cssLength(state.figure, unit, "--tablechart-break-gap", "")) ?? BREAK_GAP;
	// Full scale below and above the break, compressed through it.
	const base = height - foot;
	const span = ceiling - bottom || 1;
	let y: (value: number) => number = compress
		? (value) => base - alongScale(value, ceiling, plotHeight, compress, breakGap)
		: (value) => base - ((value - bottom) / span) * plotHeight;
	// The plot inside the axes: room for the titles and the numbers on the left and at the foot.
	let x: Geometry["x"];
	let frame: Geometry["frame"];
	let shownTicks: number[][] = [];
	if (axes) ({ frame, x, y, shownTicks } = placeFrame(axes, ticks, scales, height, unit));

	// The bands give up the room the widest series name needs.
	const pick = pickOf(state.figure, config);
	const shape = shapeOf(state.figure, config);
	// With a chosen set, the last numbers go next to the names, so a line that ends close to another keeps its own number.
	const numbersAtEnd = !!type.running && names.length > 0 && !state.stacked && shape !== "step" && pick.mode === "set" && pick.keys.includes("last");
	const endNumbers = numbersAtEnd ? largest(seriesValues.flat().map((label) => sizeOf(label).width)) * unit : 0;
	const gutter = names.length
		? largest(names.map((name) => sizeOf(name).width)) * unit + 12 * unit + endNumbers
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
	if (frame && x) drawFrame(state, config, frame, x, y, shownTicks, unit);

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
		barRadius: cornerOf(state.figure, unit, "--tablechart-bar-radius"),
		sliceRadius: cornerOf(state.figure, unit, "--tablechart-slice-radius"),
		height,
		unit,
		labelHeight,
		badgeHeight,
		after: rows.length,
		note: 0,
		labels: labelsOf(state.figure, config, lineSeries.length > 0),
		insideAlign: insideAlign(state.figure),
		breakAt,
		squeeze: compress,
		breakGap,
		domain: state.agreed ? [bottom, ceiling] : valueScale ? [valueScale.min, valueScale.max] : null,
		stacked: state.stacked,
		shape,
		pick,
		numbersAtEnd,
		totals: state.totals,
		svg,
		plot,
		values,
		series,
		own: series.map((_one, s) => s),
		seriesValues,
		names,
		categories: state.categories,
		centre: state.centre,
		config,
		checks: state.checks,
		taken: [],
		lineHoles: [],
	};

	// How many elements start one after the other, so the stagger can shrink under `--tablechart-animation-max`.
	plot.style.setProperty("--count", String(Math.max(1, ...rows.map((row) => row.slot + 1))));
	// A row as if one series were the only one, for an annotation on it, or the columns of a chart with a line.
	const only = (s: number) => {
		const pick = <T extends Row>(row: T): T => ({ ...row, ...(row.cells[s] ?? row.cells[0]) });
		return {
			rows: rows.map(pick),
			segments: segments.map((seg) => {
				const picked = pick(seg);
				return seg.kind === "bar" ? { ...picked, to: picked.value } : picked;
			}),
			values: seriesValues[s],
		};
	};
	if (lineSeries.length) {
		// The columns first, then the line over them, in the same bands.
		const bars = series.flatMap((one, s) => (one.chart ? [] : [s]));
		type.draw({ ...geo, own: bars, ...(bars.length === 1 && only(bars[0])) });
		line.draw({ ...geo, own: lineSeries });
	} else type.draw(geo);
	if (geo.rowAt) state.rowAt = geo.rowAt;
	state.pointOf = geo.pointOf ?? null;
	// A name comes with the end of the marks: on a chart that builds in fewer stagger steps than it has rows, such as a line, sooner.
	const staggered = Number(plot.style.getPropertyValue("--count")) || rows.length;
	for (const name of state.figure.querySelectorAll<HTMLElement>(`.${NAME_CLASS}`))
		name.style.setProperty("--i", String(Math.min(rows[rows.length - 1].slot, staggered - 1)));
	// Numbers that overlap, such as on a long line, are thinned out. Grouped and stacked numbers have rules of their own.
	if (!state.stacked && !plot.hasAttribute("data-grouped"))
		for (const labels of seriesValues) {
			keepInside(labels, unit, VIEWBOX_WIDTH);
			thinOut(labels, unit, VIEWBOX_WIDTH, height);
		}

	// The numbers along the value axis, fewer where two would touch, and none in the cut of a broken scale.
	if (along && valueScale) placeValueAxis(state, config, along, valueScale, sideways && geo.x ? geo.x : y, compress, height, unit, gutter);

	for (const [n, annotation] of annotations.entries()) {
		annotation.badge?.setAttribute("data-note", String(n + 1));
		// An annotation on another series reads that series as if it were the only one.
		const s = annotation.series;
		annotation.type.draw(annotation.spec, annotation.badge, {
			...geo,
			// On a stacked chart, an annotation reads the totals.
			...(state.stacked && {
				rows: stackedRows,
				...(state.totals.length && { values: state.totals }),
			}),
			...(s > 0 && !state.stacked && only(s)),
			// Without steps, commentary comes when the marks are done: no later than their stagger steps.
			after: state.plan ? annotation.after : Math.min(annotation.after, Number(plot.style.getPropertyValue("--count")) || annotation.after),
			note: n + 1,
		});
	}

	// Before anything reads styles, so new marks start at their step and do not transition to it.
	applySteps(state);
	// A legend comes with its first name, so its box is never empty. With steps, a name in no step is there with the axes.
	for (const legend of state.figure.querySelectorAll<HTMLElement>(`.${LEGEND_CLASS}`)) {
		const names = Array.from(legend.children) as HTMLElement[];
		if (state.plan) for (const name of names) if (!name.style.getPropertyValue("--step")) name.style.setProperty("--i", "0");
		const steps = names.map((name) => Number.parseFloat(name.style.getPropertyValue("--step")));
		legend.style.setProperty("--i", String(Math.min(...names.map((name) => Number(name.style.getPropertyValue("--i")) || 0))));
		if (steps.length && steps.every(Number.isFinite)) legend.style.setProperty("--step", String(Math.min(...steps)));
		else legend.style.removeProperty("--step");
	}

	fitNames(state, config, height, unit);

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
	// The lines of a quadrant are there from the start, as the gridlines are, and get their gaps the same way.
	const framing = [...(grid ? [grid] : []), ...svg.querySelectorAll<SVGElement>(`:scope > .${QUADRANT_CLASS}`)];
	const holeUnder = textHoles(plot, unit);
	// A growing line keeps its holes in the mask, which follows it as it grows.
	const grows = state.figure.getAttribute("data-animate") === "grow";
	const crossing = seriesValues.flat().filter((label) => label.hasAttribute("data-cut")).flatMap(holeUnder);
	// The numbers of a line over columns are holes in the columns under them, as a badge is.
	const numberHoles = [...lineSeries.flatMap((s) => seriesValues[s].flatMap(holeUnder)), ...(grows ? crossing : [])];
	if (framing.length || references.length) {
		const texts = [...seriesValues.flat(), ...state.totals, ...(type.categories === "beside" ? state.categories : [])];
		const under = texts.flatMap(holeUnder);
		// A line is left out where it crosses text, rather than masked: under a mask, Safari draws everything again on each frame.
		// A reference line also around its own label.
		const boxOf = (rect: SVGElement): Box => ["x", "y", "width", "height"].map((name) => Number(rect.getAttribute(name))) as Box;
		for (const line of references) lineAround(line, [...under, ...holes].map(boxOf));
		for (const path of framing) {
			// Around each badge too, rather than under its mask, which only comes once the marks are still.
			const gaps = [...under, ...holes];
			const lines = linesIn(path);
			path.setAttribute("d", lines.map(([x1, y1, x2, y2]) => piecesOf(x1, y1, x2, y2, gaps.map(boxOf))).join(""));
			// Over each gap, the piece of line it leaves out, with the timing and step of its text: it fades as the text arrives.
			// Under a badge it goes at once as the badge arrives, so the line never runs through it.
			for (const rect of gaps) {
				const d = piecesIn(lines, boxOf(rect));
				const gap = rect.dataset.for === "badge" ? "badge" : "";
				if (d) path.after(svgEl("path", { class: path.getAttribute("class") ?? GRID_CLASS, "data-gap": gap, d, style: rect.getAttribute("style") ?? "" }));
			}
		}
	}
	// A trend or a bracket is drawn while the chart builds, so it is kept out of each badge by a clip, from the start: it stops at the
	// badge rather than running through it until the mask comes. Its arrowhead too.
	clipAround(svg, holes, VIEWBOX_WIDTH, height, Array.from(svg.querySelectorAll<SVGElement>(`.${LINE_CLASS}, .${HEAD_CLASS}`)));
	// The holes in the lines and areas, under open markers and values that cross a line, are there as the lines arrive.
	// A line has its own clip as it sweeps in, so it gets a group for this one.
	if (!grows && (geo.lineHoles.length || crossing.length)) {
		const lines = Array.from(svg.querySelectorAll<SVGElement>(`.${SERIES_CLASS}`)).map((path) => {
			const group = svgEl("g", {});
			path.before(group);
			group.append(path);
			return group;
		});
		clipAround(svg, [...geo.lineHoles, ...crossing], VIEWBOX_WIDTH, height, [...lines, ...svg.querySelectorAll<SVGElement>(`.${AREA_CLASS}`)]);
	}
	// What is kept out of the badges another way stays out of that group: under its mask, a line that is drawn or fades would make
	// Safari draw the whole group again on each frame. And the mask would wait for it.
	const loose = [REFERENCE_CLASS, QUADRANT_CLASS, LINE_CLASS, HEAD_CLASS, GRID_CLASS];
	cutOut(svg, [...holes, ...numberHoles], VIEWBOX_WIDTH, height, undefined, loose.map((name) => `.${name}`).join(", "));
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

	if (geo.barRadius) roundEnds(svg, geo.barRadius);
	measureSurface(state.figure);
	inkInside(state.figure);
	inkNames(state.figure);
	lineUpNames(state.figure);
	return true;
};
