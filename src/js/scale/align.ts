// The scale of a second value axis, on the right. Arithmetic only, as in `axis.ts`.
import { niceStep, type Scale, ticksOf } from "./axis";

const EPSILON = 1e-9;

// The ends of the scales of two value axes come from about this many steps, whatever the height.
export const REFERENCE_STEPS = 5;

/** The next nice step: 1, 2, 2.5, 5, 10 and so on. Not a multiple of the one before, as only the number of steps is fixed. */
const nextStep = (step: number): number => {
	const power = 10 ** Math.floor(Math.log10(step) + EPSILON);
	const leading = Math.round((step / power) * 10) / 10;
	return Number(((leading < 2 ? 2 : leading < 2.5 ? 2.5 : leading < 5 ? 5 : 10) * power).toPrecision(12));
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

	const whole = (value: number) => Math.abs(value - Math.round(value)) < 1e-6;

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

// ---------------------------------------------------------------------------------------------------------------------------------

/** Whether a step is 1, 2, 2.5, 4 or 5 times a power of ten. */
const isNice = (step: number): boolean => {
	const power = 10 ** Math.floor(Math.log10(step) + EPSILON);
	const leading = step / power;
	return [1, 2, 2.5, 4, 5, 10].some((nice) => Math.abs(leading - nice) < 1e-6);
};

/** The numbers of steps from 1 to 20 where both scales get a nice step and zero stays a tick. */
const stepCountsOf = (left: Scale, right: Scale): number[] => {
	const counts: number[] = [];

	for (let steps = 1; steps <= 20; steps++) {
		const leftStep = Number(((left.max - left.min) / steps).toPrecision(12));
		const rightStep = Number(((right.max - right.min) / steps).toPrecision(12));
		const zeroOnTick = Math.abs(left.min / leftStep - Math.round(left.min / leftStep)) < 1e-6;
		if (isNice(leftStep) && isNice(rightStep) && zeroOnTick) counts.push(steps);
	}

	return counts;
};

/** Both scales from zero to a nice number above their largest value, as if each were alone. */
const separateEnds = (left: Scale, rightValues: number[]): { left: Scale; right: Scale } | null => {
	if (left.min !== 0 || rightValues.some((value) => value < 0)) return null;
	const top = Math.max(0, ...rightValues) || 1;
	const step = niceStep(top, REFERENCE_STEPS);
	const right = scaleFrom(0, Math.max(1, Math.ceil(top / step - EPSILON)), step);
	return { left, right };
};

/**
 * Two aligned scales whose ends do not depend on the height, so the lines keep their places against each other when the chart
 * resizes. `leftFor` gives the left scale for about a number of steps. Of the ends that fit, the ones that split evenly into
 * the most numbers of steps from 2 to 10 win. `wanted` only sets how many gridlines there are.
 */
export const steadyScales = (
	leftFor: (count: number) => Scale,
	rightValues: number[],
	wanted: number
): { left: Scale; right: Scale; aligned: boolean } => {
	const options: { left: Scale; right: Scale }[] = [];

	for (const count of [REFERENCE_STEPS, 4, 6, 3]) {
		const left = leftFor(count);
		const aligned = alignScales(left, rightValues);
		if (!aligned.aligned) continue;
		options.push(aligned);
		const separate = separateEnds(left, rightValues);
		if (separate) options.push(separate);
	}

	if (!options.length) return alignScales(leftFor(REFERENCE_STEPS), rightValues);

	const score = (option: { left: Scale; right: Scale }) => {
		const counts = stepCountsOf(option.left, option.right);
		return counts.filter((steps) => steps >= 2 && steps <= 10).length;
	};

	const best = options.reduce((chosen, option) => (score(option) > score(chosen) ? option : chosen));

	const most = Math.max(1, Math.floor(wanted + EPSILON));
	const steps = stepCountsOf(best.left, best.right).filter((count) => count <= most).at(-1) ?? 1;
	const leftStep = Number(((best.left.max - best.left.min) / steps).toPrecision(12));
	const rightStep = Number(((best.right.max - best.right.min) / steps).toPrecision(12));

	return {
		left: { ...best.left, step: leftStep, ticks: ticksOf(best.left.min, best.left.max, leftStep) },
		right: { ...best.right, step: rightStep, ticks: ticksOf(best.right.min, best.right.max, rightStep) },
		aligned: true,
	};
};
