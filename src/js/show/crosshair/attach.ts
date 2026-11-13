import { BUILT_CLASS, PLACED_CLASS } from "../../config";
import type { ChartState } from "../../types";
import { clearCrosshair, drawCrosshair } from "./draw";

/** Pointing at a row of a line or area chart, or tapping it, shows its crosshair instead of a tooltip. */
export const attachCrosshair = (state: ChartState): void => {
	const { plot, figure } = state;
	plot.setAttribute("data-hover", "");
	// The row and the series of the line across.
	let shown: string | null = null;
	const hide = () => {
		shown = null;
		clearCrosshair(state);
	};
	state.crosshair = { hide };

	const point = (event: PointerEvent) => {
		if (!plot.classList.contains(PLACED_CLASS) || !figure.classList.contains(BUILT_CLASS) || !state.rowAt) return;
		const box = plot.getBoundingClientRect();
		// The plot can be scaled with a CSS transform.
		const scale = box.width / plot.offsetWidth || 1;
		const index = state.rowAt((event.clientX - box.left) / scale, (event.clientY - box.top) / scale);
		if (index === null) return hide();
		const drawing = state.svg.getBoundingClientRect();
		const near = ((event.clientY - drawing.top) / drawing.height) * state.svg.viewBox.baseVal.height;
		// Drawn again only for another row, or when another line is nearest.
		const nearest = state.crossingOf?.(index)?.points.reduce((a, b) => (Math.abs(b.y - near) < Math.abs(a.y - near) ? b : a));
		const key = `${index} ${nearest?.series}`;
		if (key === shown) return;
		shown = drawCrosshair(state, index, near) === null ? null : key;
	};
	plot.addEventListener("pointermove", point);
	plot.addEventListener("pointerdown", point);
	// A mouse that leaves takes it away; a tap stays until a tap elsewhere.
	plot.addEventListener("pointerleave", (event) => {
		if (event.pointerType === "mouse") hide();
	});
	document.addEventListener("pointerdown", (event) => {
		if (shown !== null && !plot.contains(event.target as Node)) hide();
	});
};
