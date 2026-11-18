// Choosing a text colour that is readable on one fill or on several.
import { contrastOf, type Method, WCAG } from "./methods";
import type { Colour } from "./rgb";

export const WHITE = [255, 255, 255];
export const BLACK = [0, 0, 0];

/** The candidate with enough contrast on the most fills, the first of them if several are equal, and on which fills it has. */
export const pick = (candidates: Colour[], fills: Colour[], needed: number, method: Method): { colour: Colour; fits: boolean[] } => {
	let best = { colour: candidates[0], fits: fills.map(() => false), count: -1 };

	for (const colour of candidates) {
		const fits = fills.map((fill) => contrastOf(method, colour, fill) >= needed);
		const count = fits.filter(Boolean).length;
		if (count > best.count) best = { colour, fits, count };
	}

	return best;
};

/** Black or white, whichever is clearer. With WCAG 2, on a middle colour both just pass 4.5:1, and white is easier to read there. */
export const blackOrWhite = (fill: Colour, method: Method): Colour => {
	const white = contrastOf(method, WHITE, fill);
	return (method === WCAG && white >= 4.5) || white > contrastOf(method, BLACK, fill) ? WHITE : BLACK;
};
