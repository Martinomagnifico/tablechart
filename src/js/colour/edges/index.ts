// A column or bar whose colour has too little contrast with the background gets an edge that has enough (WCAG 1.4.11).
import { BAR_CLASS, PIECE_CLASS, RULE_CLASS } from "../../config";
import { short, svgEl } from "../../draw/svg";
import { surfaceOf } from "../colour";
import { contrastOf, methodOf } from "../core/methods";
import { css, over, rgbOf } from "../core/rgb";
import { clearBaseline, edgeColour } from "./colours";
import { acrossGap, dashOf, EDGE_CLASS } from "./lines";
import { edgeSamples, SAMPLE } from "./samples";
import { clearSlices, edgeSlices } from "./slices";
import { snapToPixels } from "./snap";
import { BASE, endOf, neighbour, openSides } from "./sides";

const GEOMETRY = ["x", "y", "width", "height", "d"];

// ---------------------------------------------------------------------------------------------------------------------------------

// Takes away the edges of an earlier layout.
const clearEdges = (figure: HTMLElement, svg: SVGSVGElement, marks: SVGGeometryElement[], rules: SVGLineElement[]): void => {
	for (const old of svg.querySelectorAll(`clipPath[data-edge], .${EDGE_CLASS}`)) old.remove();
	clearSlices(svg);

	for (const mark of marks) {
		mark.removeAttribute("data-edge");
		if (mark.getAttribute("clip-path")?.includes("-edge-")) mark.removeAttribute("clip-path");
	}

	for (const rule of rules) {
		for (const name of ["stroke", "opacity", "stroke-width"]) rule.style.removeProperty(name);
	}

	for (const name of figure.querySelectorAll(SAMPLE)) name.removeAttribute("data-edge");
};

// A clip in the shape of the mark, so the edge, a stroke twice as wide, is inside it. Only the shape, so nothing that looks for a series finds the copy.
const clipOf = (mark: SVGGeometryElement, id: string): SVGClipPathElement => {
	const clip = svgEl("clipPath", { id, "data-edge": "" });
	const shape = svgEl(mark.tagName as "rect" | "path");

	for (const name of GEOMETRY) {
		if (mark.hasAttribute(name)) shape.setAttribute(name, mark.getAttribute(name) ?? "");
	}

	clip.append(shape);
	return clip;
};

// ---------------------------------------------------------------------------------------------------------------------------------

/** Gives an edge to each column or bar with too little contrast, but not along the baseline or a gap in a stack; `--tablechart-bar-edge: none` leaves it out. */
export const edgeBars = (figure: HTMLElement, svg: SVGSVGElement | null = figure.querySelector("svg")): void => {
	if (!svg) return;
	const marks = Array.from(svg.querySelectorAll<SVGGeometryElement>(`:is(.${BAR_CLASS}, .${PIECE_CLASS}):not(g)`));
	const rules = Array.from(svg.querySelectorAll<SVGLineElement>(`line.${RULE_CLASS}`));
	const slices = svg.querySelector(".tablechart-slice");
	clearEdges(figure, svg, marks, rules);

	const style = getComputedStyle(figure);
	const pixels = svg.getBoundingClientRect().width;
	const turnedOff = style.getPropertyValue("--tablechart-bar-edge").trim() === "none";
	if (turnedOff || (!marks.length && !slices) || !pixels) return;

	// The edge is inside the bar, so the bar keeps its size: a stroke twice as wide, clipped to the bar.
	const unit = svg.viewBox.baseVal.width / pixels;
	const pixelWidth = Number.parseFloat(style.getPropertyValue("--tablechart-bar-edge-width")) || 1;
	const width = pixelWidth * unit * 2;
	const method = methodOf(figure);
	const needed = method.part;
	const surface = surfaceOf(figure).slice(0, 3);
	const text = rgbOf(style.color).slice(0, 3);

	const edgeOf = (fill: number[]) => edgeColour(fill, text, surface, method, needed);

	edgeSamples(figure, edgeOf);

	// A donut or pie has slices instead of bars, and no baseline.
	if (slices) {
		edgeSlices(figure, svg, unit, pixelWidth, edgeOf);
		return;
	}

	let defs = svg.querySelector(":scope > defs");
	const prefix = `${svg.id || `tablechart-${Math.random().toString(36).slice(2, 8)}`}-edge-`;
	let clearest = 0;
	const colours = new Map<SVGGeometryElement, string>();

	for (const [index, mark] of marks.entries()) {
		const paint = getComputedStyle(mark).fill;
		if (paint.startsWith("url")) continue;

		// The fill over the background, as it is seen.
		const fill = over(rgbOf(paint), surface);
		const colour = edgeColour(fill, text, surface, method, needed);
		if (!colour) continue;
		clearest = Math.max(clearest, contrastOf(method, colour, surface));

		if (!defs) {
			defs = svgEl("defs");
			svg.prepend(defs);
		}

		snapToPixels(mark, svg);
		defs.append(clipOf(mark, `${prefix}${index}`));

		const rgb = css(colour);
		mark.setAttribute("clip-path", `url(#${prefix}${index})`);
		mark.setAttribute("data-edge", "");
		mark.style.setProperty("--_edge", rgb);
		mark.style.setProperty("--_edge-width", `${short(width)}px`);
		mark.style.setProperty("--_edge-dash", dashOf(mark, openSides(mark, rules)));
		colours.set(mark, rgb);
	}

	// A gap between two parts gets the side lines of the part past it, or else of the part before it.
	for (const [mark, colour] of colours) {
		const end = endOf(mark);

		for (const side of [BASE[end], end]) {
			const next = neighbour(mark, side);
			if (!next || (side === end && colours.has(next.other))) continue;
			const line = acrossGap(mark, side, next.from, next.to, pixelWidth * unit);
			line.style.setProperty("--_edge", colour);
			mark.after(line);
		}
	}

	// The baseline is darker than the edges, as text is: 4.5:1, or Lc 60.
	if (clearest) clearBaseline(rules, surface, method, Math.max(clearest, method.text), pixelWidth);
};
