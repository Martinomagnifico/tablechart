// The colours of an edge and of the baseline, so both have enough contrast with the background.
import { contrastOf, rgbOf } from "../colour";

/** The colour of the bar, moved towards the text colour only as far as needed, or null if the bar has enough contrast. */
export const edgeColour = (fill: number[], text: number[], surface: number[], method: 2 | 3, needed: number): number[] | null => {
	if (contrastOf(method, fill, surface) >= needed) return null;

	for (let step = 1; step <= 20; step++) {
		const colour = fill.map((value, channel) => Math.round(value + ((text[channel] - value) * step) / 20));
		if (contrastOf(method, colour, surface) >= needed || step === 20) return colour;
	}

	return null;
};

/** The baseline is clear and at least as wide as the edges, and solid, so the edges do not show through it. */
export const clearBaseline = (rules: SVGLineElement[], surface: number[], method: 2 | 3, least: number, width: number): void => {
	for (const rule of rules) {
		const style = getComputedStyle(rule);
		const stroke = rgbOf(style.stroke).slice(0, 3);
		const opacity = Number.parseFloat(style.opacity);

		// The stroke over the background, a little stronger each time, until it has enough contrast.
		let colour = stroke;

		for (let strength = opacity; strength <= 1.001; strength += 0.05) {
			const share = Math.min(strength, 1);
			colour = stroke.map((value, channel) => Math.round(value * share + surface[channel] * (1 - share)));
			if (contrastOf(method, colour, surface) >= least) break;
		}

		rule.style.stroke = `rgb(${colour.join(" ")})`;
		rule.style.opacity = "1";
		rule.style.strokeWidth = `${Math.max(Number.parseFloat(style.strokeWidth) || 1, width)}px`;
	}
};
