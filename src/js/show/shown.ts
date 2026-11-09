import {
	AT_ONCE_CLASS,
	BUILT_CLASS,
	SHOWN_CLASS,
} from "../config";
import type { ChartState } from "../types";

/**
 * One class, `is-shown`, starts the whole build. `atOnce` skips it: the chart lands at its end, or back at its start,
 * without transitions, such as a chart in view when the page opens, or one hidden where nobody sees it.
 */
export const setShown = (state: ChartState, shown: boolean, atOnce = false): void => {
	// The marks move back without masks too, and wait for them again on the next build.
	if (!shown && !state.figure.hasAttribute("data-steps")) takeMasksOff(state.svg);
	state.figure.classList.remove(BUILT_CLASS);
	if (atOnce) {
		state.figure.classList.add(AT_ONCE_CLASS);
		state.figure.classList.toggle(SHOWN_CLASS, shown);
		// Read now, so the end is what the next frame starts from, and taking the class off starts nothing.
		void state.figure.offsetWidth;
		if (shown) putMasksOn(state.svg);
		state.figure.classList.toggle(BUILT_CLASS, shown);
		requestAnimationFrame(() => state.figure.classList.remove(AT_ONCE_CLASS));
		return;
	}
	state.figure.classList.toggle(SHOWN_CLASS, shown);
	// A build without transitions, such as one shown before its first frame, gets its masks too.
	if (shown)
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				settleMasks(state.figure, state.svg);
				whenBuilt(state.figure);
			})
		);
};

/** Marks a shown chart as built once every transition of its build has ended, or was cut short. */
const whenBuilt = (figure: HTMLElement): void => {
	const running = figure.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined));
	void Promise.all(running).then(() => {
		if (figure.classList.contains(SHOWN_CLASS)) figure.classList.add(BUILT_CLASS);
	});
};

/**
 * Puts the masks on once what they cover has nothing left to move, such as the bars under a badge. Not the whole chart: the
 * badge, its line and its gap arrive after the marks, and each hole in a mask switches on with its badge, by its own timing.
 */
export const settleMasks = (figure: HTMLElement, svg: SVGSVGElement): void => {
	if (!figure.classList.contains(SHOWN_CLASS)) return;
	const covered = Array.from(svg.querySelectorAll<SVGElement>("[data-mask]"));
	if (covered.every((group) => !group.getAnimations({ subtree: true }).length)) putMasksOn(svg);
};

/** Takes the masks of holes off until the build is done, such as when a chart is hidden. `putMasksOn` puts them back. A donut keeps the mask of its gaps. */
export const takeMasksOff = (svg: SVGSVGElement): void => {
	for (const group of svg.querySelectorAll<SVGElement>('[mask^="url(#tablechart-cut-"]')) {
		group.dataset.mask = group.getAttribute("mask") ?? "";
		group.removeAttribute("mask");
	}
};

/** Puts on the masks that waited for the build, at once, such as for print. */
export const putMasksOn = (svg: SVGSVGElement): void => {
	for (const group of svg.querySelectorAll<SVGElement>("[data-mask]")) {
		group.setAttribute("mask", group.dataset.mask ?? "");
		group.removeAttribute("data-mask");
	}
};
