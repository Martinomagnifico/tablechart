// Moving a colour towards another, in steps of a twentieth, until it has enough contrast.
import { contrastOf, type Method } from "./methods";
import type { Colour } from "./rgb";

/** The first mix from `from` towards `to`, from the share `first` on, with enough contrast on `background`; else `to` itself, rounded. */
export const towards = (from: Colour, to: Colour, background: Colour, needed: number, method: Method, first = 0.05): Colour => {
	let colour = from;

	for (let step = 0; first + step * 0.05 <= 1.001; step++) {
		const share = Math.min(first + step * 0.05, 1);
		colour = from.slice(0, 3).map((value, channel) => Math.round(value + (to[channel] - value) * share));
		if (contrastOf(method, colour, background) >= needed) break;
	}

	return colour;
};
