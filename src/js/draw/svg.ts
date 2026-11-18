import { FADE_STOP_CLASS } from "../config";
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
let fades = 0;

const defsOf = (svg: SVGSVGElement): SVGDefsElement => {
	let defs = svg.querySelector<SVGDefsElement>(":scope > defs");

	if (!defs) {
		defs = svgEl("defs");
		svg.prepend(defs);
	}

	return defs;
};

/** Rounds the marked end of each bar: an SVG `rect` can only round all its corners, so it becomes a `path`. Last, as a break in the scale reads the rects. */
export const roundEnds = (svg: SVGSVGElement, radius: number): void => {
	for (const rect of svg.querySelectorAll<SVGRectElement>("rect[data-end]")) {
		const [x, y, rectWidth, rectHeight] = ["x", "y", "width", "height"].map((name) => Number(rect.getAttribute(name)));
		const end = rect.getAttribute("data-end");
		const sideways = end === "left" || end === "right";
		const corner = short(Math.min(radius, sideways ? rectHeight / 2 : rectWidth / 2, sideways ? rectWidth : rectHeight));

		const arc = (dx: number, dy: number) => `a${corner},${corner} 0 0 1 ${dx},${dy}`;

		const pathData = {
			top: `M${x},${short(y + rectHeight)}v${short(corner - rectHeight)}${arc(corner, -corner)}h${short(rectWidth - 2 * corner)}${arc(corner, corner)}v${short(rectHeight - corner)}z`,
			bottom: `M${short(x + rectWidth)},${y}v${short(rectHeight - corner)}${arc(-corner, corner)}h${short(2 * corner - rectWidth)}${arc(-corner, -corner)}v${short(corner - rectHeight)}z`,
			right: `M${x},${y}h${short(rectWidth - corner)}${arc(corner, corner)}v${short(rectHeight - 2 * corner)}${arc(-corner, corner)}h${short(corner - rectWidth)}z`,
			left: `M${short(x + rectWidth)},${short(y + rectHeight)}h${short(corner - rectWidth)}${arc(-corner, -corner)}v${short(2 * corner - rectHeight)}${arc(corner, -corner)}h${short(rectWidth - corner)}z`,
		}[end as "top"];

		const path = svgEl("path", { d: pathData });
		for (const { name, value } of Array.from(rect.attributes)) if (!["x", "y", "width", "height"].includes(name)) path.setAttribute(name, value);
		rect.replaceWith(path);
	}
};

/** A fill that fades towards `zero`, from `top` and from `bottom`; its colours are in the CSS. Returns its id. */
export const fadeFill = (svg: SVGSVGElement, top: number, zero: number, bottom: number, attrs: Record<string, string>): string => {
	const id = `tablechart-fade-${++fades}`;
	const fill = svgEl("linearGradient", { id, gradientUnits: "userSpaceOnUse", x1: 0, x2: 0, y1: short(top), y2: short(bottom), ...attrs });

	const stops = [
		...(top < zero ? [{ offset: 0, faded: false }] : []),
		{ offset: bottom > top ? (zero - top) / (bottom - top) : 0, faded: true },
		...(bottom > zero ? [{ offset: 1, faded: false }] : []),
	];

	for (const { offset, faded } of stops)
		fill.appendChild(svgEl("stop", { class: FADE_STOP_CLASS, offset: short(offset), ...(faded && { "data-faded": "" }) }));

	defsOf(svg).appendChild(fill);
	return id;
};

/** The outline of a hole `rect`, its rounded corners included, so a badge of 50% radius leaves an ellipse. */
const outlineOf = (rect: SVGElement): string => {
	// An open marker: a circle, or a polygon such as a diamond.
	if (rect.tagName === "circle") {
		const [cx, cy, radius] = ["cx", "cy", "r"].map((name) => Number(rect.getAttribute(name)) || 0);
		return `M${short(cx - radius)},${short(cy)}a${short(radius)},${short(radius)} 0 1 0 ${short(2 * radius)},0a${short(radius)},${short(radius)} 0 1 0 ${short(-2 * radius)},0z`;
	}

	if (rect.tagName === "polygon") return `M${(rect.getAttribute("points") ?? "").trim().split(/\s+/).join("L")}z`;
	const [x, y, rectWidth, rectHeight, rx0, ry0] = ["x", "y", "width", "height", "rx", "ry"].map((name) => Number(rect.getAttribute(name)) || 0);
	const rx = Math.min(rx0, rectWidth / 2);
	const ry = Math.min(ry0, rectHeight / 2);

	const arc = (dx: number, dy: number) => (rx && ry ? `a${short(rx)},${short(ry)} 0 0 1 ${short(dx)},${short(dy)}` : "");

	return `M${short(x + rx)},${short(y)}h${short(rectWidth - 2 * rx)}${arc(rx, ry)}v${short(rectHeight - 2 * ry)}${arc(-rx, ry)}h${short(2 * rx - rectWidth)}${arc(-rx, -ry)}v${short(2 * ry - rectHeight)}${arc(rx, -ry)}z`;
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
