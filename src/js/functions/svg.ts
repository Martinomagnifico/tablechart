const SVGNS = "http://www.w3.org/2000/svg";

/** A namespaced SVG element with its attributes set in one go. */
export const svgEl = <K extends keyof SVGElementTagNameMap>(
	name: K,
	attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] => {
	const node = document.createElementNS(SVGNS, name);
	for (const key in attrs) node.setAttribute(key, String(attrs[key]));
	return node;
};

/** A class for a mark, followed by the classes of the row it belongs to. */
export const withRow = (className: string, row: { classes: string[] }): string =>
	[className, ...row.classes].join(" ");

/**
 * An HTML element with a class, positioned later. It is text for the eye only:
 * screen readers read the table. So it is `inert`, which Safari with VoiceOver
 * respects where it does not always respect `aria-hidden` around it.
 */
export const htmlEl = (className: string, parent: HTMLElement): HTMLElement => {
	const node = document.createElement("span");
	node.className = className;
	node.inert = true;
	parent.appendChild(node);
	return node;
};

/**
 * Place a node over the plot as a percentage of the viewBox, so it keeps its
 * spot at any size without being told about a resize.
 */
export const placeAt = (
	node: HTMLElement,
	x: number,
	y: number,
	width: number,
	height: number
): void => {
	node.style.left = `${(x / width) * 100}%`;
	node.style.top = `${(y / height) * 100}%`;
};

// Each cut gets a mask of its own, with an id that is unique on the page.
let cuts = 0;

/**
 * Cuts holes in everything drawn so far, so the background behind the chart
 * shows through them, whatever it is. The holes are shapes, drawn in black in a
 * mask. Anything drawn after this is not cut.
 */
export const cutOut = (svg: SVGSVGElement, holes: SVGElement[], width: number, height: number): void => {
	if (!holes.length) return;
	const id = `tablechart-cut-${++cuts}`;
	const mask = svgEl("mask", { id, maskUnits: "userSpaceOnUse" });
	// Larger than the chart, so a mark that reaches past the edge is not cut off.
	mask.appendChild(
		svgEl("rect", { x: -width, y: -height, width: width * 3, height: height * 3, fill: "white" })
	);
	for (const hole of holes) {
		hole.setAttribute("fill", "black");
		mask.appendChild(hole);
	}
	let defs = svg.querySelector<SVGDefsElement>(":scope > defs");
	if (!defs) {
		defs = svgEl("defs");
		svg.prepend(defs);
	}
	defs.appendChild(mask);
	const group = svgEl("g", { mask: `url(#${id})` });
	for (const child of Array.from(svg.childNodes)) if (child !== defs) group.appendChild(child);
	svg.appendChild(group);
};
