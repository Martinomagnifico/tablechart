// The numbers along an axis. Arithmetic only: the tick labels are measured with the rest of the text.
import { largest } from "./format";

export interface Scale {
	min: number;
	max: number;
	/** 0 when the author set the ticks. */
	step: number;
	ticks: number[];
}

// Twelve significant digits, so 0.1 + 0.2 is 0.3 on an axis.
const tidy = (value: number): number => Number(value.toPrecision(12));

/** A step of 1, 2 or 5 times a power of ten, so that about `count` steps cover `span`. */
export const niceStep = (span: number, count: number): number => {
	const raw = span / Math.max(1, count) || 1;
	const power = 10 ** Math.floor(Math.log10(raw));
	const m = raw / power;
	// The nearest of 1, 2, 5 and 10, as a ratio.
	return tidy((m < 1.42 ? 1 : m < 3.17 ? 2 : m < 7.08 ? 5 : 10) * power);
};

/** The multiples of `step` from `min` to `max`. */
export const ticksOf = (min: number, max: number, step: number): number[] => {
	const ticks: number[] = [];
	for (let k = Math.ceil(min / step - 1e-9); k * step <= max + step * 1e-9; k++) ticks.push(tidy(k * step));
	return ticks;
};

/** The next larger step of 1, 2 or 5 times a power of ten that is a multiple of `base`, so its ticks are among those of `base`. */
export const coarser = (step: number, base = step): number => {
	do {
		const m = Math.round(step / 10 ** Math.floor(Math.log10(step) + 1e-9));
		step = tidy(step * (m === 2 ? 2.5 : 2));
	} while (Math.abs(step / base - Math.round(step / base)) > 1e-9);
	return step;
};

/** `data-chart-scale`: two numbers are the range, three or more are the ticks. Null for anything else. */
export const readScale = (text: string | null | undefined): number[] | null => {
	const numbers = (text ?? "").trim().split(/\s+/).map(Number.parseFloat);
	return numbers.length > 1 && numbers.every(Number.isFinite) ? numbers.sort((a, b) => a - b) : null;
};

/** From the data with a little room either side, or as the author asked, with about `count` ticks. */
export const scaleOf = (values: number[], count: number, asked: number[] | null): Scale => {
	if (asked && asked.length > 2) return { min: asked[0], max: asked[asked.length - 1], step: 0, ticks: asked };
	let min = asked?.[0] ?? -largest(values.map((value) => -value));
	let max = asked?.[1] ?? largest(values);
	if (!asked) {
		const pad = (max - min || Math.abs(max) || 1) * 0.05;
		min -= pad;
		max += pad;
	}
	const step = niceStep(max - min, count);
	return { min, max, step, ticks: ticksOf(min, max, step) };
};

/** Fewer ticks until `fits` agrees; the author's own ticks stay as they are. */
export const thin = (scale: Scale, fits: (ticks: number[]) => boolean): Scale => {
	let { step, ticks } = scale;
	while (step && ticks.length > 2 && !fits(ticks)) {
		step = coarser(step, scale.step);
		ticks = ticksOf(scale.min, scale.max, step);
	}
	return { ...scale, step, ticks };
};
