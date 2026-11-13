// The axes of a chart: their scales, numbers and gridlines. The arithmetic of a scale is in `axis.ts`.
import { AXIS_CLASS, AXIS_GAP, type Config, GRID_CLASS, TICK_CLASS, VIEWBOX_WIDTH } from "../config";
import type { ChartState, Geometry } from "../types";
import { niceStep, readScale, type Scale, scaleOf, thin, ticksOf } from "../scale/axis";
import { decimalsIn, largest } from "../shared/format";
import { stackReach } from "../shared/stacks";
import { measureAll, sizeOf } from "./measure";
import { writeNumber } from "../shared/numbers";
import type { Squeeze } from "../scale/scale";
import { heightRange, turnedOn } from "../shared/settings";
import { htmlEl, placeAt, short, svgEl } from "../draw/svg";

type ChartAxes = NonNullable<ChartState["axes"]>;

/** The value axis of a column, bar or line chart: its scale and numbers, and the room beside the plot or under a bar chart. Null without a width. */
export const valueAxisOf = (state: ChartState, config: Config, along: ChartAxes, aspect: number): Scale | null => {
	const { plot, rows, type, series } = state;
	const sideways = type.categories === "beside";
	const namesUnder = sideways ? null : state.categories[0]?.parentElement;
	let valueScale: Scale;
	plot.style.margin = "";
	if (namesUnder) namesUnder.style.margin = "";
	const guess = plot.clientWidth;
	if (!guess) return null;
	// As the scale does: a step of a waterfall is a size, so only where the steps start and end counts.
	const segs = type.segments?.(rows) ?? [];
	const all = state.stacked
		? rows.flatMap((row) => Object.values(stackReach(row, series.length, type.running)))
		: segs.some((s) => s.kind === "up" || s.kind === "down")
			? segs.flatMap((s) => [s.from, s.to])
			: rows.flatMap((row) => row.cells.slice(0, series.length).filter((cell) => !cell.missing).map((cell) => cell.value));
	// A chart whose scale floats fits its values; the others reach zero.
	const zero = type.floats ? [] : [0];
	const min = Math.min(...zero, -largest(all.map((value) => -value)));
	const max = Math.max(...zero, largest(all));
	const font = Number.parseFloat(getComputedStyle(plot).fontSize) || 16;
	// The scale ends on a number of the axis, or where `data-chart-scale` says; three numbers or more are the numbers themselves.
	const { chartScaleY, chartScale } = state.figure.dataset;
	const own = readScale(chartScaleY ?? chartScale);
	if (own && own.length > 2) valueScale = { min: own[0], max: own[own.length - 1], step: 0, ticks: own };
	else {
		const [from, to] = own ?? [Math.min(min, state.agreed?.bottom ?? min), Math.max(max, state.agreed?.ceiling ?? max)];
		const step = niceStep(to - from, Math.max((sideways ? guess / 9 : Math.min(guess * aspect, heightRange(state.figure, 1)[1]) / 3) / font, 2));
		const round = (value: number, up: boolean) => (own ? value : Number(((up ? Math.ceil : Math.floor)(value / step - 1e-9 * (up ? 1 : -1)) * step).toPrecision(12)));
		const lo = round(from, false);
		const hi = round(to, true);
		valueScale = { min: lo, max: hi, step, ticks: ticksOf(lo, hi, step) };
	}
	along.ticks.textContent = "";
	const first = rows.find((row) => !row.missing);
	// A scale that floats, as for prices, writes its numbers as the table does, so a value at the pointer fits beside it.
	const written = type.floats ? rows.flatMap((row) => row.cells.slice(0, series.length).map((cell) => decimalsIn(cell.number))) : [];
	const places = largest([...valueScale.ticks.map((value) => decimalsIn(String(value))), ...written]);
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
			const side = along.right ? "marginRight" : "marginLeft";
			plot.style[side] = `${largest([0, ...ticks.map((tick) => sizeOf(tick).width)]) + 10}px`;
			if (namesUnder) namesUnder.style[side] = plot.style[side];
		}
	}
	return valueScale;
};

/** The scales and numbers of a chart with two axes, for a first guess at the room. Once they are measured, some may be left out. */
export const frameScalesOf = (state: ChartState, config: Config, axes: ChartAxes, shaped: number, unit: number, widthPx: number): Scale[] => {
	const { plot, rows, series } = state;
	const font = Number.parseFloat(getComputedStyle(plot).fontSize) || 16;
	const fields = series.flatMap((one, s) => (one.group ? [] : [s])).slice(0, 2);
	const drawn = rows.filter((row) => fields.every((s) => row.cells[s] && !row.cells[s].missing));
	const { chartScaleX, chartScaleY, chartScale } = state.figure.dataset;
	const asked = [readScale(chartScaleX), readScale(chartScaleY ?? chartScale)];
	const scales = fields.map((s, k) =>
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
	return scales;
};

/** The plot inside two axes: room for the titles and the numbers on the left and at the foot, and fewer numbers where two would touch. */
export const placeFrame = (axes: ChartAxes, ticks: HTMLElement[], scales: Scale[], height: number, unit: number) => {
	const gap = AXIS_GAP * unit;
	const [titleX, titleY] = axes.titles;
	const width = (node?: HTMLElement) => (node ? sizeOf(node).width * unit : 0);
	const tall = (node?: HTMLElement) => (node ? sizeOf(node).height * unit : 0);
	const across = ticks.filter((tick) => tick.dataset.axis === "x");
	const up = ticks.filter((tick) => tick.dataset.axis === "y");
	const tickHeight = tall(ticks[0]);
	const left = width(titleY) + largest([0, ...up.map(width)]) + 2 * gap;
	const top = tickHeight / 2;
	const frame: NonNullable<Geometry["frame"]> = [left, top, VIEWBOX_WIDTH - left - largest([0, ...across.map(width)]) / 2, height - top - tall(titleX) - tickHeight - 2 * gap];
	const [fx, fy, fw, fh] = frame;
	const [sx, sy] = scales;
	const scaleX = (value: number) => fx + ((value - sx.min) / (sx.max - sx.min || 1)) * fw;
	const scaleY = (value: number) => fy + fh - ((value - sy.min) / (sy.max - sy.min || 1)) * fh;
	// Fewer numbers where two would touch.
	const widthAt = (value: number) => width(across.find((tick) => Number(tick.dataset.value) === value));
	const shownTicks = [
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
	return { frame, x: scaleX, y: scaleY, shownTicks };
};

/** The axes of a chart with two axes, with a short mark at each number, and gridlines if asked. */
export const drawFrame = (state: ChartState, config: Config, frame: NonNullable<Geometry["frame"]>, scaleX: (value: number) => number, y: (value: number) => number, shownTicks: number[][], unit: number): void => {
	const { svg } = state;
	const [fx, fy, fw, fh] = frame;
	const [across, up] = shownTicks;
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
};

/** The numbers along the value axis, fewer where two would touch, and none in the cut of a broken scale; the gridlines and the line of the axis. */
export const placeValueAxis = (state: ChartState, config: Config, along: ChartAxes, valueScale: Scale, at: (value: number) => number, compress: Squeeze | null, height: number, unit: number, gutter: number): void => {
	const { svg, type } = state;
	const sideways = type.categories === "beside";
	const gap = AXIS_GAP * unit;
	const ticks = Array.from(along.ticks.children) as HTMLElement[];
	const size = (value: number) => sizeOf(ticks.find((tick) => Number(tick.dataset.value) === value) ?? ticks[0]);
	const shown = thin(valueScale, (list) =>
		list.every((v, k) =>
			!k || (sideways ? at(v) - at(list[k - 1]) > ((size(v).width + size(list[k - 1]).width) / 2) * unit + gap : at(list[k - 1]) - at(v) > size(v).height * unit + gap / 2)
		)
	).ticks.filter((v) => !compress || v <= compress.lo || v >= compress.hi);
	// On the right, the axis is past the names at the ends of the lines, and the gridlines reach it.
	const right = along.right && !sideways;
	const edge = right ? VIEWBOX_WIDTH : 0;
	for (const tick of ticks) {
		const value = Number(tick.dataset.value);
		const on = along.numbers && shown.includes(value);
		tick.dataset.place = on ? (sideways ? "below" : right ? "after" : "before") : "none";
		if (on) placeAt(tick, sideways ? at(value) : right ? edge + gap : -gap, sideways ? height + gap : at(value), VIEWBOX_WIDTH, height);
	}
	const end = right && along.numbers ? VIEWBOX_WIDTH : VIEWBOX_WIDTH - gutter;
	// Under the marks.
	if (turnedOn(state.figure, "data-chart-grid", config.grid))
		svg.prepend(
			svgEl("path", {
				class: GRID_CLASS,
				d: shown.map((v) => (sideways ? `M${short(at(v))},0V${short(height)}` : `M0,${short(at(v))}H${short(end)}`)).join(""),
			})
		);
	// Down to the line under the chart, also where a line chart keeps room under its lowest numbers.
	const rule = Number(svg.querySelector(".tablechart-rule")?.getAttribute("y1"));
	const foot = Math.max(at(valueScale.min), Number.isFinite(rule) ? rule : 0);
	if (along.numbers)
		svg.appendChild(
			svgEl("path", {
				class: AXIS_CLASS,
				d: [
					sideways ? `M${short(at(valueScale.min))},${short(height)}H${short(at(valueScale.max))}` : `M${edge},${short(at(valueScale.max))}V${short(foot)}`,
					...shown.map((v) => (sideways ? `M${short(at(v))},${short(height)}v${short(4 * unit)}` : `M${edge},${short(at(v))}h${short((right ? 4 : -4) * unit)}`)),
				].join(""),
			})
		);
};
