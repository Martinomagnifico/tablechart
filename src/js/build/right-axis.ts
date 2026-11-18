import { AXIS_CLASS, type Config, TICK_CLASS } from "../config";
import { htmlEl } from "../draw/svg";
import type { RightAxis, Series } from "../types";

/** The title of an axis: the names of its series, made with the rest of the text so a translation script finds them. */
const titleOf = (plot: HTMLElement, side: "left" | "right", series: Series[], config: Config): HTMLElement => {
	const title = htmlEl(`${AXIS_CLASS}-title`, plot);
	title.dataset.axis = side;
	for (const [k, one] of series.entries()) {
		if (k) title.append(", ");
		const name = document.createElement("span");
		name.textContent = one.name;
		if (one.key && config.langattribute) name.setAttribute(config.langattribute, one.key);
		title.append(name);
	}
	return title;
};

/** The numbers of the right axis and a title over each axis, on a chart with series on both sides. */
export const makeRightAxis = (plot: HTMLElement, series: Series[], config: Config): RightAxis => ({
	ticks: htmlEl(`${TICK_CLASS}s`, plot),
	titles: [
		titleOf(plot, "left", series.filter((one) => one.axis !== "right"), config),
		titleOf(plot, "right", series.filter((one) => one.axis === "right"), config),
	],
	series: series.flatMap((one, s) => (one.axis === "right" ? [s] : [])),
	scale: null,
	aligned: false,
});
