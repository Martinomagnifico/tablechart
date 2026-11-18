// The names of the rows, such as months: each moves from where it was on the screen to its new place.
import type { ChartState } from "../../types";
import { drift } from "./animate";
import type { Snapshot } from "./snapshot";

/** Moves each name of a row from where it was in `before`. */
export const morphNames = (before: Snapshot, state: ChartState, duration: number): void => {
	for (const [index, name] of state.categories.entries()) {
		const old = before.names[index];
		if (!old) continue;

		const now = name.getBoundingClientRect();
		const shiftX = old.left - now.left;
		const shiftY = old.top - now.top;
		if (Math.abs(shiftX) < 0.5 && Math.abs(shiftY) < 0.5) continue;

		// Its own transform, such as the centring on its place, stays under the move.
		const transform = getComputedStyle(name).transform;
		const own = transform === "none" ? "" : transform;
		drift(name, `translate(${shiftX}px, ${shiftY}px) ${own}`.trim(), own || "none", duration, false);
	}
};
