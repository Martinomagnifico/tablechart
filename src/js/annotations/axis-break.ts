import { BREAK_CLASS, BREAK_GAP, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { svgEl } from "../functions/svg";
import type { AnnotationType, Geometry } from "../types";

let masks = 0;

/** A break in the scale. `layout` breaks the scale; this masks the gap out of each bar and draws its two edges. */
export const axisBreak: AnnotationType = {
	create: () => null,

	draw(spec: HTMLElement, _badge: HTMLElement | null, geo: Geometry) {
		const { segments, cx, y, barWidth, svg, breakAt } = geo;
		if (breakAt === null) return;

		const level = y(breakAt);
		const overhang = barWidth * 0.09;
		const width = barWidth + overhang * 2;

		// `data-mark="zigzag"` draws a torn edge instead of two straight lines.
		const zigzag = spec.getAttribute("data-mark") === "zigzag";
		const tilt = width * 0.3;
		const teeth = 6;
		const rise = BREAK_GAP * 0.26;

		const edge = (centre: number, at: number): [number, number][] => {
			const left = centre - width / 2;
			if (!zigzag) {
				return [
					[left, at + tilt / 2],
					[left + width, at - tilt / 2],
				];
			}
			const stride = width / teeth;
			const corners: [number, number][] = [[left, at]];
			for (let i = 0; i < teeth; i++) {
				corners.push([left + stride * (i + 1), at + (i % 2 === 0 ? -rise : rise)]);
			}
			return corners;
		};

		const path = (corners: [number, number][], close = false): string =>
			corners
				.map(([x, at], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${at.toFixed(1)}`)
				.join(" ") + (close ? " Z" : "");

		// Larger than the chart, so a mark that reaches past the edge is not cut off.
		const id = `tablechart-break-${++masks}`;
		const mask = svgEl("mask", { id, maskUnits: "userSpaceOnUse" });
		mask.appendChild(
			svgEl("rect", {
				x: -VIEWBOX_WIDTH,
				y: -geo.height,
				width: VIEWBOX_WIDTH * 3,
				height: geo.height * 3,
				fill: "white",
			})
		);
		const cuts: [number, number][][] = [];

		for (const [i, seg] of segments.entries()) {
			if (Math.min(seg.from, seg.to) >= breakAt || Math.max(seg.from, seg.to) <= breakAt)
				continue;

			const centre = cx(i);
			const upper = edge(centre, level - BREAK_GAP);
			const lower = edge(centre, level);
			mask.appendChild(
				svgEl("path", { d: path([...upper, ...lower.slice().reverse()], true), fill: "black" })
			);
			cuts.push(upper, lower);
			const when = timing("--after", seg.slot);

			for (const corners of [upper, lower]) {
				svg.appendChild(
					svgEl("path", {
						class: BREAK_CLASS,
						"data-part": "edge",
						"data-note": geo.note,
						d: path(corners),
						style: when,
					})
				);
			}
		}
		if (!cuts.length) return;

		// The edges are drawn after the masked group, so they are not masked.
		const edges = Array.from(svg.querySelectorAll(`.${BREAK_CLASS}`));
		const group = svgEl("g", { mask: `url(#${id})` });
		for (const child of Array.from(svg.childNodes)) if (!edges.includes(child as Element)) group.appendChild(child);
		const defs = svgEl("defs");
		defs.appendChild(mask);
		svg.prepend(defs, group);
	},
};
