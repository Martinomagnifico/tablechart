// Charts in a `data-chart-group` with `data-chart-group-scale`: they agree on one scale and, per line of the page, one height.
import type { Config } from "../config";
import type { ChartState } from "../types";
import { largest } from "./format";

/** The charts of the group of this figure, and whether they share one scale. */
const groupOf = (figure: HTMLElement) => {
	const holder = figure.closest<HTMLElement>("[data-chart-group]");
	if (!holder) return null;
	const name = holder.getAttribute("data-chart-group");
	const holders = name ? Array.from(document.querySelectorAll<HTMLElement>(`[data-chart-group="${CSS.escape(name)}"]`)) : [holder];
	const figures = holders.flatMap((one) => (one.matches("figure") ? [one] : Array.from(one.querySelectorAll<HTMLElement>("figure"))));
	return { figures, shared: holders.some((one) => one.hasAttribute("data-chart-group-scale")) };
};

const laidOut = new WeakMap<HTMLElement, { state: ChartState; config: Config }>();

const agreedOn = new WeakMap<HTMLElement, string>();

let agreeing = false;

/** Charts of a group with `data-chart-group-scale` lay out once to measure, and then again with one scale, and per line of the page one height. */
export const agree = (figure: HTMLElement, layoutOne: (state: ChartState, config: Config) => boolean): void => {
	const group = groupOf(figure);
	if (!group?.shared || agreeing) return;
	const members = group.figures.flatMap((one) => laidOut.get(one) ?? []).filter(({ state }) => state.plot.clientWidth);
	const signature = members.map(({ state }) => `${state.plot.clientWidth}:${state.rows.map((row) => row.cells.map((cell) => cell.value)).join()}`).join("|");
	const first = group.figures[0];
	if (agreedOn.get(first) === signature) return;
	agreedOn.set(first, signature);
	agreeing = true;
	for (const { state, config } of members) {
		state.agreed = undefined;
		layoutOne(state, config);
	}
	const measured = members.flatMap(({ state }) => (state.measured ? [{ state, ...state.measured, top: state.figure.getBoundingClientRect().top }] : []));
	const ceiling = largest(measured.map((one) => one.ceiling));
	const bottom = -largest(measured.map((one) => -one.bottom));
	for (const one of measured) {
		// Within a few pixels is the same line of the page.
		const line = measured.filter((other) => Math.abs(other.top - one.top) < 4);
		one.state.agreed = {
			ceiling,
			bottom,
			height: largest(line.map((other) => other.height)),
			room: largest(line.map((other) => other.room)),
			floor: largest(line.map((other) => other.floor)),
		};
	}
	for (const { state, config } of members) layoutOne(state, config);
	agreeing = false;
};

/** Keeps a chart that was laid out, so its group can lay it out again. */
export const remember = (state: ChartState, config: Config): void => {
	laidOut.set(state.figure, { state, config });
};
