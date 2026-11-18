// The boxes in the legend get the edge of their bars.
import { css, resolve } from "../core/rgb";

export const SAMPLE = '.tablechart-name[data-place="legend"][data-swatch="box"]';

/** A box in the legend gets the edge of its bars, measured from its own colour, so also a series that is off has it. */
export const edgeSamples = (figure: HTMLElement, edge: (fill: number[]) => number[] | null): void => {
	for (const name of figure.querySelectorAll<HTMLElement>(SAMPLE)) {
		// The colour of the box is a variable, read in the name, so it is known while the box still fades in.
		const colour = edge(resolve(name, "var(--_sample)").slice(0, 3));

		name.toggleAttribute("data-edge", !!colour);

		if (colour) name.style.setProperty("--_edge", css(colour));
		else name.style.removeProperty("--_edge");
	}
};
