// The scale of a second value axis, on the right. Arithmetic only, as in `axis.ts`.
import { niceStep, type Scale, ticksOf } from "./axis";

const EPSILON = 1e-9;

/** The next nice step: 1, 2, 2.5, 5, 10 and so on. Not a multiple of the one before, as only the number of steps is fixed. */
const nextStep = (step: number): number => {
	const power = 10 ** Math.floor(Math.log10(step) + EPSILON);
	const m = Math.round((step / power) * 10) / 10;
	return Number(((m < 2 ? 2 : m < 2.5 ? 2.5 : m < 5 ? 5 : 10) * power).toPrecision(12));
};

/** How many steps the values need below zero and above it. */
const stepsOf = (values: number[], step: number): [number, number] => [
	Math.max(0, Math.ceil(-Math.min(0, ...values) / step - EPSILON)),
	Math.max(0, Math.ceil(Math.max(0, ...values) / step - EPSILON)),
];

const scaleFrom = (below: number, above: number, step: number): Scale => {
	const min = Number((-below * step).toPrecision(12));
	const max = Number((above * step).toPrecision(12));
	return { min, max, step, ticks: ticksOf(min, max, step) };
};

/** A scale of its own for `values`, with about as many steps as `left`, and zero in it. */
const ownScale = (left: Scale, values: number[]): Scale => {
	const count = Math.max(2, left.ticks.length - 1);
	const span = Math.max(0, ...values) - Math.min(0, ...values) || 1;
	const step = niceStep(span, count);
	const [below, above] = stepsOf(values, step);
	return scaleFrom(below, Math.max(above, 1), step);
};

/**
 * The scales of the left and the right axis, with zero and every tick at the same height, so one set of gridlines serves both.
 * The left may get a step more below zero or above it. A left scale the author set with ticks of their own, or without zero, keeps
 * its ticks, and the right gets a scale of its own.
 */
export const alignScales = (left: Scale, rightValues: number[]): { left: Scale; right: Scale; aligned: boolean } => {
	const values = rightValues.length ? rightValues : [0, 1];
	const below = -left.min / left.step;
	const above = left.max / left.step;
	const whole = (n: number) => Math.abs(n - Math.round(n)) < 1e-6;
	if (!left.step || left.min > 0 || left.max < 0 || !whole(below) || !whole(above))
		return { left, right: ownScale(left, values), aligned: false };
	const [leftBelow, leftAbove] = [Math.round(below), Math.round(above)];
	const count = Math.max(1, leftBelow + leftAbove);
	const span = Math.max(0, ...values) - Math.min(0, ...values) || 1;
	let step = niceStep(span, count);
	// At most one step more than the left has; a larger step always fits in the end.
	for (let tries = 0; tries < 40; tries++) {
		const [rightBelow, rightAbove] = stepsOf(values, step);
		const down = Math.max(leftBelow, rightBelow);
		const up = Math.max(leftAbove, rightAbove, 1);
		if (down + up <= count + 1) return { left: scaleFrom(down, up, left.step), right: scaleFrom(down, up, step), aligned: true };
		step = nextStep(step);
	}
	return { left, right: ownScale(left, values), aligned: false };
};
