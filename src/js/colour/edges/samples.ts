// The boxes in the legend get the edge of their bars.
import { rgbOf } from "../colour";

export const SAMPLE = '.tablechart-name[data-place="legend"][data-swatch="box"]';

/** A box in the legend gets the edge of its bars, measured from its own colour, so also a series that is off has it. */
export const edgeSamples = (figure: HTMLElement, edge: (fill: number[]) => number[] | null): void => {
	for (const name of figure.querySelectorAll<HTMLElement>(SAMPLE)) {
		// The colour of the box is a variable, read through a probe, so it is known while the box still fades in.
		const probe = document.createElement("span");
		probe.style.color = "var(--_sample)";
		name.append(probe);
		const colour = edge(rgbOf(getComputedStyle(probe).color).slice(0, 3));
		probe.remove();

		name.toggleAttribute("data-edge", !!colour);

		if (colour) name.style.setProperty("--_edge", `rgb(${colour.join(" ")})`);
		else name.style.removeProperty("--_edge");
	}
};
