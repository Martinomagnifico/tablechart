// When a series is turned off or on in a legend: what stays moves from where it was, what is new fades in, what is gone fades out.
import type { ChartState } from "../../types";
import { baselineDrift } from "./drift";
import { morphMarks } from "./marks";
import { morphNames } from "./names";
import { mapBetween } from "./paths";
import { frameOf, type Snapshot } from "./snapshot";
import { morphTexts } from "./texts";

export { type Snapshot, snapshot } from "./snapshot";

// A time from CSS, such as `0.4s` or `400ms`, in milliseconds.
const milliseconds = (text: string, fallback: number): number => {
	const value = Number.parseFloat(text);
	if (!Number.isFinite(value)) return fallback;
	return text.trim().endsWith("ms") ? value : value * 1000;
};

/** How long a move takes: the time of one element of the build, at the speed of the chart. */
export const moveTime = (figure: HTMLElement): number => {
	const style = getComputedStyle(figure);
	const speed = Number.parseFloat(style.getPropertyValue("--tablechart-animation-speed")) || 1;
	return milliseconds(style.getPropertyValue("--tablechart-animation-element-duration"), 400) / speed;
};

/** Moves the marks and numbers of the new layout from where they were in `before`. */
export const morph = (before: Snapshot, state: ChartState): void => {
	const duration = moveTime(state.figure);
	const frame = frameOf(state);
	const mapping = mapBetween(before.frame, frame);
	const baseline = baselineDrift(before, state, mapping);
	morphMarks(before, state, mapping, baseline, duration);
	morphTexts(before, state, frame, baseline, duration);
	morphNames(before, state, duration);
};
