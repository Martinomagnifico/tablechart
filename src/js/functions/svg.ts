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
let clips = 0;

const defsOf = (svg: SVGSVGElement): SVGDefsElement => {
	let defs = svg.querySelector<SVGDefsElement>(":scope > defs");
	if (!defs) {
		defs = svgEl("defs");
		svg.prepend(defs);
	}
	return defs;
};

/** The outline of a hole `rect`, its rounded corners included, so a badge of 50% radius leaves an ellipse. */
const outlineOf = (rect: SVGElement): string => {
	const [x, y, w, h, rx0, ry0] = ["x", "y", "width", "height", "rx", "ry"].map((name) => Number(rect.getAttribute(name)) || 0);
	const rx = Math.min(rx0, w / 2);
	const ry = Math.min(ry0, h / 2);
	const arc = (dx: number, dy: number) => (rx && ry ? `a${short(rx)},${short(ry)} 0 0 1 ${short(dx)},${short(dy)}` : "");
	return `M${short(x + rx)},${short(y)}h${short(w - 2 * rx)}${arc(rx, ry)}v${short(h - 2 * ry)}${arc(-rx, ry)}h${short(2 * rx - w)}${arc(-rx, -ry)}v${short(2 * ry - h)}${arc(rx, -ry)}z`;
};

/**
 * Leaves the holes out of the elements in `only` with a clip, from the start: a line that would cross a badge stops at it.
 * A clip is an outline, not a picture like a mask, so a line that is drawn while it is clipped costs Safari no more frames.
 */
export const clipAround = (svg: SVGSVGElement, holes: SVGElement[], width: number, height: number, only: SVGElement[]): void => {
	if (!holes.length || !only.length) return;
	const id = `tablechart-clip-${++clips}`;
	const clip = svgEl("clipPath", { id, clipPathUnits: "userSpaceOnUse" });
	// Larger than the chart, as the mask is, with every hole left out of it.
	const outside = `M${-width},${-height}h${width * 3}v${height * 3}h${-width * 3}z`;
	clip.appendChild(svgEl("path", { d: outside + holes.map(outlineOf).join(""), "clip-rule": "evenodd" }));
	defsOf(svg).appendChild(clip);
	for (const one of only) one.setAttribute("clip-path", `url(#${id})`);
};

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
	const defs = defsOf(svg);
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
