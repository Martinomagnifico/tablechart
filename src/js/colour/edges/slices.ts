// A slice of a donut or pie whose colour has too little contrast gets an edge all round its shape, also along the gaps and round corners.
// Under the slice is a copy in the colour of the edge; the slice itself is one edge width narrower, and its gaps one edge width wider.
import { short } from "../../draw/svg";
import { css, rgbOf } from "../core/rgb";

export const SLICE_EDGE_CLASS = "tablechart-slice-edge";

const SLICE_CLASS = "tablechart-slice";
const INSIDE = "data-inside";

interface Shape {
	radius: number;
	width: number;
	dash: string;
	offset: string;
	arc: string;
	circle: string;
}

// ---------------------------------------------------------------------------------------------------------------------------------

const shapeOf = (slice: SVGCircleElement): Shape => ({
	radius: Number(slice.getAttribute("r")),
	width: Number(slice.getAttribute("stroke-width")),
	dash: slice.getAttribute("stroke-dasharray") ?? "",
	offset: slice.getAttribute("stroke-dashoffset") ?? "0",
	arc: slice.style.getPropertyValue("--arc"),
	circle: slice.style.getPropertyValue("--circ"),
});

const setShape = (slice: SVGCircleElement, shape: Shape): void => {
	slice.setAttribute("r", String(shape.radius));
	slice.setAttribute("stroke-width", String(shape.width));
	slice.setAttribute("stroke-dasharray", shape.dash);
	slice.setAttribute("stroke-dashoffset", shape.offset);
	slice.style.setProperty("--arc", shape.arc);
	slice.style.setProperty("--circ", shape.circle);
};

// The same part of the ring, an edge width in from the outside, and from the inside unless it is a pie.
const narrower = (shape: Shape, edge: number, inside: boolean): Shape => {
	const innerCut = inside ? edge : 0;
	const radius = shape.radius + (innerCut - edge) / 2;
	const scale = radius / shape.radius;

	const scaled = (value: string) => String(short(Number.parseFloat(value) * scale));

	return {
		radius: short(radius),
		width: short(shape.width - edge - innerCut),
		dash: shape.dash.split(" ").map(scaled).join(" "),
		offset: scaled(shape.offset),
		arc: scaled(shape.arc),
		circle: scaled(shape.circle),
	};
};

// The group for the narrower slices, after the group of the slices, with the mask that has the wider gaps.
const insideGroup = (svg: SVGSVGElement, slice: SVGCircleElement): Element => {
	const existing = svg.querySelector(`g[${INSIDE}]`);
	if (existing) return existing;
	const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
	group.setAttribute(INSIDE, "");
	const mask = svg.dataset.sliceMask;
	if (mask) group.setAttribute("mask", `url(#${mask})`);
	const after = slice.parentElement instanceof SVGGElement ? slice.parentElement : slice;
	after.after(group);
	return group;
};

// ---------------------------------------------------------------------------------------------------------------------------------

/** Takes away the edges of the slices, and gives each slice back its own shape and place. */
export const clearSlices = (svg: SVGSVGElement): void => {
	for (const copy of svg.querySelectorAll(`.${SLICE_EDGE_CLASS}`)) copy.remove();
	const group = svg.querySelector(`g[${INSIDE}]`);

	// The group with the gaps that the slices came from; without gaps, a slice goes back to where the group is.
	const home = group?.previousElementSibling instanceof SVGGElement ? group.previousElementSibling : null;

	for (const slice of Array.from(svg.querySelectorAll<SVGCircleElement>(`circle.${SLICE_CLASS}[data-full]`))) {
		setShape(slice, JSON.parse(slice.dataset.full ?? "{}") as Shape);
		delete slice.dataset.full;
		slice.removeAttribute("data-edge");

		if (home) home.append(slice);
		else group?.before(slice);
	}

	// Back in the order of the table.
	if (home) {
		const slices = Array.from(home.querySelectorAll<SVGCircleElement>(`circle.${SLICE_CLASS}`));
		slices.sort((first, second) => Number(first.dataset.slice) - Number(second.dataset.slice));
		home.append(...slices);
	}

	group?.remove();
};

/** Gives each slice with too little contrast an edge all round, and the dot in the legend the same edge. */
export const edgeSlices = (
	figure: HTMLElement,
	svg: SVGSVGElement,
	unit: number,
	pixelWidth: number,
	edge: (fill: number[]) => number[] | null
): void => {
	const width = pixelWidth * unit;

	for (const slice of Array.from(svg.querySelectorAll<SVGCircleElement>(`circle.${SLICE_CLASS}`))) {
		const colour = edge(rgbOf(getComputedStyle(slice).stroke).slice(0, 3));
		const key = figure.querySelector<HTMLElement>(`.tablechart-categories span[data-slice="${slice.getAttribute("data-slice")}"]`);

		// A slice with an edge has enough contrast at that edge, so the contrast check leaves it out.
		slice.toggleAttribute("data-edge", !!colour);
		key?.toggleAttribute("data-edge", !!colour);

		if (!colour) {
			key?.style.removeProperty("--_edge");
			continue;
		}

		const rgb = css(colour);
		key?.style.setProperty("--_edge", rgb);

		// The copy in the colour of the edge has the whole shape, in the place of the slice.
		const copy = slice.cloneNode() as SVGCircleElement;
		copy.setAttribute("class", SLICE_EDGE_CLASS);
		copy.removeAttribute("data-slice");
		copy.removeAttribute("data-edge");
		copy.style.setProperty("--_edge", rgb);
		slice.before(copy);

		// The slice itself, narrower, over it.
		const shape = shapeOf(slice);
		const pie = shape.radius - shape.width / 2 <= unit;
		slice.dataset.full = JSON.stringify(shape);
		setShape(slice, narrower(shape, width, !pie));
		insideGroup(svg, slice).append(slice);
	}
};
