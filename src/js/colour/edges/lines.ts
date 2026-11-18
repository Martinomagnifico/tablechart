// The lines of an edge: a dash along the sides that have one, and side lines across a gap in a stack.
import { short, svgEl } from "../../draw/svg";
import { at, BASE, endOf, isSideways, type Side, SIDES } from "./sides";

export const EDGE_CLASS = "tablechart-edge";

/** Lines along the sides of a part across a gap in its stack, so the stack has one edge on each side. */
export const acrossGap = (mark: SVGGeometryElement, side: Side, from: number, to: number, inset: number): SVGPathElement => {
	const box = mark.getBBox();
	const path = isSideways(side)
		? [box.y + inset / 2, at(box, "bottom") - inset / 2].map((y) => `M${short(from)},${short(y)}H${short(to)}`).join("")
		: [box.x + inset / 2, at(box, "right") - inset / 2].map((x) => `M${short(x)},${short(from)}V${short(to)}`).join("");
	return svgEl("path", { class: EDGE_CLASS, d: path, "stroke-width": short(inset), "data-row": mark.getAttribute("data-row") ?? "" });
};

/** A dash along the sides with an edge. A rect starts at its top left corner; a rounded bar ends with its base, its only straight end. */
export const dashOf = (mark: SVGGeometryElement, open: Set<Side>): string => {
	if (!open.size) return "none";
	const total = mark.getTotalLength();
	const { width, height } = mark.getBBox();

	if (mark.tagName !== "rect") {
		const base = BASE[endOf(mark)];
		const length = isSideways(base) ? height : width;
		return open.has(base) ? `${short(total - length)} ${short(length)}` : "none";
	}

	// Dash and gap in turn, from a dash: an even place is a dash, an odd place a gap.
	const parts = [0];
	for (const side of SIDES) {
		const inGap = (parts.length - 1) % 2 === 1;
		if (inGap !== open.has(side)) parts.push(0);
		parts[parts.length - 1] += isSideways(side) ? height : width;
	}
	if (parts.length % 2) parts.push(0);
	return parts.map(short).join(" ");
};
