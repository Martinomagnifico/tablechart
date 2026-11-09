import type { Segment } from "../types";
import { largest } from "../shared/format";

/** A break in the scale: values from `lo` to `hi` get `share` of the length, and the cut is at `gap`. */
export interface Squeeze {
	lo: number;
	hi: number;
	gap: number;
	share: number;
}

/** How far along a scale of `length` a value lands, from 0 at the start: at full scale, but squeezed by a break, with `cut` left empty where it is cut. */
export const along = (value: number, ceiling: number, length: number, squeeze: Squeeze | null, cut: number): number => {
	if (!squeeze) return (value / ceiling) * length;
	const { lo, hi, gap, share } = squeeze;
	const squeezed = length * share;
	const density = (length - squeezed - cut) / (lo + (ceiling - hi));
	const perValue = squeezed / (hi - lo);
	if (value <= lo) return value * density;
	if (value <= gap) return lo * density + (value - lo) * perValue;
	if (value <= hi) return lo * density + (value - lo) * perValue + cut;
	return lo * density + squeezed + cut + (value - hi) * density;
};

/** How far a chart reaches above and below zero. A step of a waterfall is a size, so there only where the steps start and end counts. */
export const reachOf = (
	segments: Segment[],
	values: number[],
	stacks: { top: number; bottom: number }[] | null
): { extent: number; depth: number; steps: boolean } => {
	const steps = segments.some((s) => s.kind === "up" || s.kind === "down");
	const tops = stacks ? stacks.map((stack) => stack.top) : [...segments.flatMap((s) => [s.from, s.to, s.value]), ...values];
	const lows = steps ? segments.flatMap((s) => [s.from, s.to]) : stacks ? stacks.map((stack) => stack.bottom) : values;
	return { extent: Math.max(largest(tops), 0), depth: Math.min(-largest(lows.map((value) => -value)), 0), steps };
};

/** The break a chart asks for, or what is wrong with it. `size` is the text of `data-size`. */
export const squeezeOf = (ask: {
	from: number | null;
	to: number | null;
	size: string | null;
	ceiling: number;
	extent: number;
	depth: number;
	breakable: boolean;
	segments: Segment[];
}): { squeeze: Squeeze | null; problems: string[] } => {
	const { from, to, size, ceiling, extent, depth, breakable, segments } = ask;
	const problems: string[] = [];
	if (from === null && to === null) return { squeeze: null, problems };
	const lo = from ?? 0;
	const hi = to ?? ceiling;
	// The zigzag goes where the compressed part meets the part at full scale.
	const gap = to === null ? lo : from === null ? hi : (lo + hi) / 2;
	const percent = size?.match(/^\s*(\d+(?:\.\d+)?)\s*%\s*$/);
	if (size !== null && !percent) problems.push(`data-size="${size}" is not a percentage, such as 30%. Using the default.`);
	const share = Math.min(Math.max(percent ? Number(percent[1]) / 100 : to === null ? 0.22 : 0.3, 0.05), 0.8);
	// Compressing any part of a floating step would make its height lie.
	const floats = segments.some((s) => (s.kind === "up" || s.kind === "down") && Math.max(s.from, s.to) > lo && Math.min(s.from, s.to) < hi);
	if (!breakable) problems.push("This kind of chart cannot break its scale.");
	else if (depth < 0) problems.push("A chart with values below zero cannot break its scale.");
	else if (lo < 0 || hi <= lo || hi > ceiling || (lo === 0 && hi === ceiling)) problems.push(`A break from ${lo} to ${hi} does not fit a scale that runs from 0 to ${extent}.`);
	else if (floats) problems.push(`A break from ${lo} to ${hi} would cut a step that floats. Keep it below or above the steps.`);
	else return { squeeze: { lo, hi, gap, share }, problems };
	return { squeeze: null, problems };
};
