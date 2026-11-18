// The second value axis of a chart, on the right, for the series with `data-axis="right"` on their header.
import { type Config, VIEWBOX_WIDTH } from "../config";
import type { Scale } from "../scale/axis";
import type { ChartState, RightAxis } from "../types";
import { placeAt } from "../draw/svg";
import { placeValueAxis } from "./chart-axes";
import { sizeOf } from "./measure";
import { largest } from "../shared/format";

/** Only the numbers on the side of zero where the series of the axis have values: no rainfall below zero. Gridlines stay. */
const numberedFor = (state: ChartState, series: number[]) => {
	const values = state.rows.flatMap((row) =>
		series.flatMap((seriesIndex) => {
			const cell = row.cells[seriesIndex];
			return cell && !cell.missing ? [cell.value] : [];
		})
	);

	const below = values.some((value) => value < 0);
	const above = values.some((value) => value > 0) || !below;
	return (value: number) => (value >= 0 || below) && (value <= 0 || above);
};

/** The scale of the right axis, from the bottom of the plot to its top, on the same heights as the left. */
export const rightScaleOf = (right: RightAxis, left: Scale, y: (value: number) => number): ((value: number) => number) => {
	const scale = right.scale as Scale;
	const bottom = y(left.min);
	const top = y(left.max);
	const span = scale.max - scale.min || 1;
	return (value) => bottom - ((value - scale.min) / span) * (bottom - top);
};

/** Both value axes: the left one with the gridlines, the right one with its numbers at the same heights. Then a title over each. */
export const placeBothAxes = (
	state: ChartState,
	config: Config,
	along: NonNullable<ChartState["axes"]>,
	left: Scale,
	y: (value: number) => number,
	yRight: (value: number) => number,
	height: number,
	unit: number,
	gutter: number
): void => {
	const right = state.rightAxis as RightAxis;
	const leftSeries = state.series.flatMap((_one, seriesIndex) => (right.series.includes(seriesIndex) ? [] : [seriesIndex]));
	const shown = placeValueAxis(state, config, along, left, y, null, height, unit, gutter, { numbered: numberedFor(state, leftSeries) });

	// Where the scales are aligned, the right shows the ticks at the places of those shown on the left.
	const scale = right.scale as Scale;
	const same = right.aligned ? scale.ticks.filter((_value, index) => shown.includes(left.ticks[index])) : undefined;

	placeValueAxis(state, config, { titles: [], ticks: right.ticks, numbers: true, right: true }, scale, yRight, null, height, unit, gutter, {
		shown: same,
		numbered: numberedFor(state, right.series),
		grid: false,
	});

	const [leftTitle, rightTitle] = right.titles;

	const margin = (side: "marginLeft" | "marginRight") => (Number.parseFloat(state.plot.style[side]) || 0) * unit;

	// At the top, in the room the layout keeps for them over the marks and their numbers.
	const level = largest(right.titles.map((title) => sizeOf(title).height)) * unit + 2 * unit;
	placeAt(leftTitle, -margin("marginLeft"), level, VIEWBOX_WIDTH, height);
	placeAt(rightTitle, VIEWBOX_WIDTH + margin("marginRight"), level, VIEWBOX_WIDTH, height);
};
