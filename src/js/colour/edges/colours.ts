// The colours of an edge and of the baseline, so both have enough contrast with the background.
import { contrastOf, type Method } from "../core/methods";
import { css, rgbOf } from "../core/rgb";
import { towards } from "../core/towards";

/** The colour of the bar, moved towards the text colour only as far as needed, or null if the bar has enough contrast. */
export const edgeColour = (fill: number[], text: number[], surface: number[], method: Method, needed: number): number[] | null =>
	contrastOf(method, fill, surface) >= needed ? null : towards(fill, text, surface, needed, method);

/** The baseline is clear and at least as wide as the edges, and solid, so the edges do not show through it. */
export const clearBaseline = (rules: SVGLineElement[], surface: number[], method: Method, least: number, width: number): void => {
	for (const rule of rules) {
		const style = getComputedStyle(rule);
		const stroke = rgbOf(style.stroke).slice(0, 3);
		const opacity = Number.parseFloat(style.opacity);

		// The stroke over the background, a little stronger each time, until it has enough contrast.
		rule.style.stroke = css(towards(surface, stroke, surface, least, method, opacity));
		rule.style.opacity = "1";
		rule.style.strokeWidth = `${Math.max(Number.parseFloat(style.strokeWidth) || 1, width)}px`;
	}
};
