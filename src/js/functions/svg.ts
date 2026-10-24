const SVGNS = "http://www.w3.org/2000/svg";

/** Two decimals: a hundredth of a viewBox unit is far less than a pixel. */
export const short = (value: number): number => Math.round(value * 100) / 100;

export const svgEl = <K extends keyof SVGElementTagNameMap>(
	name: K,
	attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] => {
	const node = document.createElementNS(SVGNS, name);
	for (const key in attrs) {
		const value = attrs[key];
		node.setAttribute(key, String(typeof value === "number" ? short(value) : value));
	}
	return node;
};

export const withRow = (className: string, row: { classes: string[] }): string =>
	[className, ...row.classes].join(" ");

/** `inert` too: Safari with VoiceOver does not always respect `aria-hidden` around it. */
export const htmlEl = (className: string, parent: HTMLElement): HTMLElement => {
	const node = document.createElement("span");
	node.className = className;
	node.inert = true;
	parent.appendChild(node);
	return node;
};

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

let cuts = 0;

/**
 * Cuts holes in what is drawn so far, or only in the elements in `only`, with a mask, so the background shows through.
 * Elements that match `loose` stay out of the masked group, which is split around them, so the order stays the same.
 */
export const cutOut = (svg: SVGSVGElement, holes: SVGElement[], width: number, height: number, only?: SVGElement[], loose?: string): void => {
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
	if (only) {
		for (const one of only) one.setAttribute("mask", `url(#${id})`);
		return;
	}
	let group: SVGGElement | null = null;
	for (const child of Array.from(svg.childNodes)) {
		if (child === defs) continue;
		if (loose && child instanceof Element && child.matches(loose)) {
			group = null;
			svg.appendChild(child);
			continue;
		}
		group ??= svg.appendChild(svgEl("g", { mask: `url(#${id})` }));
		group.appendChild(child);
	}
};
