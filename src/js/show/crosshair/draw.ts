import { AXIS_GAP, VIEWBOX_WIDTH } from "../../config";
import { inkerOf, rgbOf } from "../../colour/colour";
import { placeAt, svgEl } from "../../draw/svg";
import { spread } from "../../layout/labels";
import { tableOf } from "../../shared/table";
import type { ChartState } from "../../types";

const CLASS = "tablechart-crosshair";

/** Takes the crosshair of a chart away. */
export const clearCrosshair = (state: ChartState): void => {
	for (const old of state.figure.querySelectorAll(`.${CLASS}, .${CLASS}-labels`)) old.remove();
};

// The colour of a line, from its stroke.
const colourOf = (state: ChartState, series: number): string => {
	const line = state.svg.querySelector(state.series.length > 1 ? `.tablechart-series[data-series="${series + 1}"]` : ".tablechart-series");
	return line ? getComputedStyle(line).stroke : getComputedStyle(state.figure).color;
};

/**
 * A line down through the row, and one across through the dot nearest to `near`, in viewBox units; a dot on each line, its values
 * at the side of the value axis, and its name at the foot. Gives the series of the line across, or null.
 */
export const drawCrosshair = (state: ChartState, index: number, near: number): number | null => {
	clearCrosshair(state);
	const crossing = state.crossingOf?.(index);
	if (!crossing || !crossing.points.length) return null;
	const { x, from, to, edge, end, axis, height, points } = crossing;
	const nearest = points.reduce((a, b) => (Math.abs(b.y - near) < Math.abs(a.y - near) ? b : a));

	const group = svgEl("g", { class: CLASS });
	group.append(
		svgEl("line", { class: `${CLASS}-line`, x1: x, x2: x, y1: from, y2: to }),
		svgEl("line", { class: `${CLASS}-line`, x1: edge, x2: end, y1: nearest.y, y2: nearest.y }),
		...points.map((point) => point.dot)
	);
	state.svg.append(group);

	const labels = document.createElement("div");
	labels.className = `${CLASS}-labels`;
	labels.setAttribute("aria-hidden", "true");
	labels.inert = true;
	const ink = inkerOf(state.figure);
	const values = points.map((point) => {
		const label = document.createElement("span");
		label.className = `${CLASS}-value`;
		label.textContent = state.seriesValues[point.series]?.[index]?.textContent ?? "";
		const colour = colourOf(state, point.series);
		label.style.setProperty("--_line", colour);
		label.style.setProperty("--_ink", ink(rgbOf(colour)));
		if (axis) label.dataset.axis = axis;
		labels.append(label);
		return { label, y: point.y };
	});
	const name = document.createElement("span");
	name.className = `${CLASS}-name`;
	name.style.setProperty("--_text", getComputedStyle(state.figure).color);
	const head = tableOf(state.figure)?.querySelectorAll("tbody tr")[index]?.querySelector("th");
	name.textContent = head?.textContent?.trim() || state.rows[index].label;
	const under = state.categories.find((node) => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
	if (under) name.style.setProperty("--_name-size", getComputedStyle(under).fontSize);
	labels.append(name);
	state.plot.append(labels);

	// Measured once they are in the plot; labels that would touch are pushed apart.
	const unit = VIEWBOX_WIDTH / state.plot.clientWidth;
	const tall = Math.max(...values.map(({ label }) => label.offsetHeight)) * unit + 2 * unit;
	// The text of a value starts where the numbers of the axis start, and its box stays at least 1px from the axis.
	const inset = (node: HTMLElement, side: "Left" | "Right" | "Top") => {
		const style = getComputedStyle(node);
		return Number.parseFloat(style[`padding${side}`]) + Number.parseFloat(style[`border${side}Width`]);
	};
	const shift = axis && values[0] ? Math.max(1, AXIS_GAP - inset(values[0].label, axis === "right" ? "Left" : "Right")) : 0;
	for (const { label, y } of spread(values, tall)) {
		label.style.setProperty("--_shift", `${shift}px`);
		placeAt(label, edge, Math.min(Math.max(y, from + tall / 2), to - tall / 2), VIEWBOX_WIDTH, height);
	}
	// Under the line, with its text where the names under the chart are, kept inside the plot.
	const half = (name.offsetWidth * unit) / 2;
	const plotTop = state.plot.getBoundingClientRect().top;
	const textTop = under ? under.getBoundingClientRect().top + inset(under, "Top") - plotTop - inset(name, "Top") : 0;
	placeAt(name, Math.min(Math.max(x, half), VIEWBOX_WIDTH - half), to, VIEWBOX_WIDTH, height);
	name.style.top = `${Math.max(to / unit + 2, textTop)}px`;
	return nearest.series;
};
