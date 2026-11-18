// The numbers on the marks and along the axes: a number moves, a new one fades in, and one that is gone fades out.
import { TICK_CLASS, VALUES_CLASS } from "../../config";
import type { ChartState } from "../../types";
import { drift, fadeIn, fadeOut, slide } from "./animate";
import { type Drift, isColumnNumber } from "./drift";
import { type Frame, markKey, marksOf, type Snapshot, textKey, textsOf } from "./snapshot";

/** Moves the numbers of the new layout from where they were in `before`. */
export const morphTexts = (before: Snapshot, state: ChartState, frame: Frame, baseline: Drift, duration: number): void => {
	// An old place, in percent of the old plot, as a share of the new plot.
	const from = before.frame.plot;
	const to = frame.plot;

	const left = (value: string): string => {
		const pixels = from.left + (Number.parseFloat(value) / 100) * from.width - to.left;
		return `${(pixels / (to.width || 1)) * 100}%`;
	};

	const top = (value: string): string => {
		const pixels = from.top + (Number.parseFloat(value) / 100) * from.height - to.top;
		return `${(pixels / (to.height || 1)) * 100}%`;
	};

	// The move of the baseline in pixels, for the numbers of columns that come or go.
	const moves = baseline.x || baseline.y;
	const shiftX = baseline.x * frame.scaleX;
	const shiftY = baseline.y * frame.scaleY;
	const newKeys = marksOf(state).map(markKey);

	const seen = new Set<string>();

	for (const element of textsOf(state)) {
		const key = textKey(element);
		seen.add(key);
		const old = before.texts.get(key);

		if (!old) {
			fadeIn(element, duration);

			// A number of a new column comes up with it, from where the baseline was.
			if (moves && isColumnNumber(newKeys, element)) {
				const transform = getComputedStyle(element).transform;
				const own = transform === "none" ? "" : transform;
				drift(element, `translate(${-shiftX}px, ${-shiftY}px) ${own}`.trim(), own || "none", duration, false);
			}

			continue;
		}

		const start = { left: left(old.left), top: top(old.top) };
		const moved = start.left !== element.style.left || start.top !== element.style.top;
		if (moved) slide(element, start, duration);
	}

	const values = state.plot.querySelector(`.${VALUES_CLASS}`) ?? state.plot;

	// The boxes of the numbers along the axes are as large as the plot, so any of them takes a number of either side.
	const ticks = state.plot.querySelector(`.${TICK_CLASS}s`);

	for (const [key, old] of before.texts) {
		if (seen.has(key)) continue;
		const into = old.element.classList.contains(TICK_CLASS) ? ticks : values;
		if (!into) continue;

		const ghost = fadeOut(old.element, into, duration, false, (copy) => {
			(copy as HTMLElement).style.left = left(old.left);
			(copy as HTMLElement).style.top = top(old.top);
		});

		// A number of a column that is gone moves with the baseline, as its column does.
		if (moves && into === values && isColumnNumber(before.marks.keys(), old.element)) {
			const shift = `translate(${shiftX}px, ${shiftY}px)`;

			// Its own transform, such as the centring on its place, read from the copy, which is on the page.
			const transform = getComputedStyle(ghost).transform;
			const own = transform === "none" ? "" : transform;
			drift(ghost, own || "none", `${shift} ${own}`.trim(), duration);
		}
	}
};
