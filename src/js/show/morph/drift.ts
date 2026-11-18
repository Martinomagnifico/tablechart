// How far the baseline moves, so columns and their numbers that fade out move with it instead of leaving a gap.
import { BAR_CLASS, PIECE_CLASS, RULE_CLASS } from "../../config";
import type { ChartState } from "../../types";
import { type Mapping, mapBox } from "./paths";
import { boxOf, type Snapshot } from "./snapshot";

export interface Drift {
	x: number;
	y: number;
}

/** The move of the baseline, in units of the new drawing: up or down under columns, sideways beside bars. */
export const baselineDrift = (before: Snapshot, state: ChartState, mapping: Mapping): Drift => {
	const oldRule = [...before.marks].find(([key]) => key.startsWith(`${RULE_CLASS}|`))?.[1][0];
	const newRule = state.svg.querySelector(`.${RULE_CLASS}`);
	const newBox = newRule ? boxOf(newRule) : null;
	if (!oldRule?.box || !newBox) return { x: 0, y: 0 };

	const [oldX, oldY, oldWidth] = mapBox(oldRule.box, mapping);
	const [newX, newY] = newBox;
	// A rule across the chart moves up or down; a rule from top to bottom moves sideways.
	const across = oldWidth > 0;
	return across ? { x: 0, y: newY - oldY } : { x: newX - oldX, y: 0 };
};

/** Whether a mark stands on the baseline, as a column, a bar or a part of a stack does. */
export const onBaseline = (element: Element): boolean =>
	element.classList.contains(BAR_CLASS) || element.classList.contains(PIECE_CLASS);

/** Whether a number belongs to a column, a bar or a part of a stack, by the keys of the marks of its drawing. */
export const isColumnNumber = (markKeys: Iterable<string>, text: HTMLElement): boolean => {
	const rowAndSeries = `|${text.dataset.row ?? ""}|${text.dataset.series ?? ""}|`;
	for (const key of markKeys) {
		const column = key.startsWith(`${BAR_CLASS}|`) || key.startsWith(`${PIECE_CLASS}|`);
		if (column && key.includes(rowAndSeries)) return true;
	}
	return false;
};
