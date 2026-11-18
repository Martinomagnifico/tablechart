// The marks of the drawing: a shape moves, a path changes its shape, a new mark fades in, and a mark that is gone fades out.
import type { ChartState } from "../../types";
import { drift, fadeIn, fadeOut, move, type Reshape, reshape } from "./animate";
import { type Drift, onBaseline } from "./drift";
import { type Mapping, mapBox, mapPath, pathsBetween } from "./paths";
import { boxOf, markKey, marksOf, type Snapshot } from "./snapshot";

/** Moves the marks of the new drawing from where they were in `before`. */
export const morphMarks = (before: Snapshot, state: ChartState, mapping: Mapping, baseline: Drift, duration: number): void => {
	// How many marks with a key were found again, so the second mark with a key matches the second one before.
	const used = new Map<string, number>();
	const changes: Reshape[] = [];

	// A copy of a mark that is gone stays where it was in the old drawing.
	const matrix = (shiftX: number, shiftY: number) =>
		`matrix(${mapping.scaleX},0,0,${mapping.scaleY},${mapping.shiftX + shiftX},${mapping.shiftY + shiftY})`;
	const inOldPlace = (ghost: Element) => {
		ghost.setAttribute("transform", `${matrix(0, 0)} ${ghost.getAttribute("transform") ?? ""}`.trim());
	};

	// A column that is gone moves with the baseline while it fades, so no gap opens under it.
	const goAway = (old: Element) => {
		const ghost = fadeOut(old, state.svg, duration, true, inOldPlace);
		const moves = baseline.x || baseline.y;
		if (moves && onBaseline(old) && !old.hasAttribute("transform")) drift(ghost, matrix(0, 0), matrix(baseline.x, baseline.y), duration);
	};

	for (const element of marksOf(state)) {
		const key = markKey(element);
		const index = used.get(key) ?? 0;
		used.set(key, index + 1);
		const old = before.marks.get(key)?.[index];
		const path = element.getAttribute("d");

		if (!old) {
			fadeIn(element, duration);
			// A new column comes up with the baseline, from where the baseline was.
			const moves = baseline.x || baseline.y;
			if (moves && onBaseline(element) && !element.hasAttribute("transform")) {
				drift(element, `translate(${-baseline.x}px, ${-baseline.y}px)`, "none", duration, false);
			}
			continue;
		}

		if (element.tagName === "path" && old.path && path) {
			const from = mapPath(old.path, mapping);
			if (from === path) continue;
			const at = pathsBetween(from, path);
			if (at) changes.push({ path: element, at });
			else {
				goAway(old.element);
				fadeIn(element, duration);
			}
			continue;
		}

		if (element.tagName !== "path") {
			const box = boxOf(element);
			if (old.box && box) move(element, mapBox(old.box, mapping), box, duration);
		}
	}

	// What was there before and is not found again.
	for (const [key, list] of before.marks) {
		for (const old of list.slice(used.get(key) ?? 0)) goAway(old.element);
	}

	reshape(changes, duration);
};
