import { BAR_CLASS, PIECE_CLASS } from "../config";
import { timing } from "./timing";
import { svgEl, withRow } from "./svg";
import type { Cell, Geometry, Row } from "../types";

/** One bar of a group: where it starts across the band, how wide it is, and its cell. */
export interface GroupBar {
	series: number;
	offset: number;
	cell: Cell;
}

/**
 * The bars of one row of a grouped chart, side by side in the row's band. A group
 * takes 70% of the band, the gap between two bars is 15% of a bar, and no bar is
 * wider than `--tablechart-bar-max`.
 */
export const groupLayout = (band: number, count: number, barMax: number) => {
	const gap = 0.15;
	const size = Math.min((band * 0.7) / (count + (count - 1) * gap), barMax);
	const total = count * size + (count - 1) * size * gap;
	return {
		size,
		gap: size * gap,
		/** Where bar `s` starts, from the middle of the band. */
		offset: (s: number) => -total / 2 + s * size * (1 + gap),
	};
};

/** What tells one series from another on a bar, as for lines: its colour. */
export const seriesMark = (geo: Geometry, row: Row, s: number) => {
	const one = geo.series[s];
	const focused = geo.series.some((other) => other.focus);
	const muted = focused && !one.focus;
	return {
		"data-series": s + 1,
		...(muted && { "data-muted": "" }),
		style: `--n:${s}; --m:${muted ? 1 : 0}; --palette:var(--tablechart-color-${s + 1}); ${timing("--i", row.slot)}`,
	};
};

/** One piece of a stack: where it starts and ends, as values, and its cell. */
export interface StackPiece {
	from: number;
	to: number;
	cell: Cell;
}

/**
 * The pieces of one row of a stacked chart, the first series at the bottom. A
 * missing value, or one below zero, takes no room.
 */
export const stackOf = (row: Row, count: number): StackPiece[] => {
	let sum = 0;
	return Array.from({ length: count }, (_, s) => {
		const cell = row.cells[s] ?? row.cells[0];
		const from = sum;
		if (!cell.missing && cell.value > 0) sum += cell.value;
		return { from, to: sum, cell };
	});
};

/** The total of one row of a stacked chart. */
export const stackTotal = (row: Row, count: number): number =>
	stackOf(row, count).at(-1)?.to ?? 0;

/**
 * The colour of a series, on a number that stands inside one of its pieces, so
 * its ink can be worked out from the fill.
 */
export const inkOf = (label: HTMLElement, geo: Geometry, s: number): void => {
	const focused = geo.series.some((one) => one.focus);
	label.style.setProperty("--n", String(s));
	label.style.setProperty("--m", focused && !geo.series[s].focus ? "1" : "0");
	label.style.setProperty("--palette", `var(--tablechart-color-${s + 1})`);
};

/**
 * The marks of one stack: its pieces in one group, which grows as one bar.
 * `attrs` goes on the group, such as `data-grow`. Returns a function that draws
 * piece `s` with the given shape.
 */
export const stackMarks = (
	geo: Geometry,
	row: Row,
	i: number,
	attrs: Record<string, string | number> = {}
) => {
	const bar = { class: withRow(BAR_CLASS, row), "data-kind": "bar", "data-row": i + 1, ...attrs };
	const group = svgEl("g", { ...bar, "data-stack": "", style: timing("--i", row.slot) });
	geo.svg.appendChild(group);
	return (s: number, shape: Record<string, string | number>) => {
		group.appendChild(svgEl("rect", { ...shape, class: withRow(PIECE_CLASS, row), ...seriesMark(geo, row, s) }));
	};
};
