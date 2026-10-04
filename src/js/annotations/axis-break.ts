import { BREAK_CLASS, BREAK_GAP, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { svgEl } from "../functions/svg";
import type { AnnotationType, Geometry } from "../types";

// Each break gets a mask of its own, with an id that is unique on the page.
let masks = 0;

/**
 * A break in the scale, for one value that is much larger than the others.
 *
 * Above the break, the height of a bar is not to scale. Every bar shows its
 * number, so the value is still there to read.
 *
 * The scale is broken in `layout`, which reads this annotation before it places
 * anything. What is drawn here is the cut: the gap between two lines across each
 * bar is masked out of the marks, so the background behind the chart shows
 * through, whatever it is. Then the two lines are drawn.
 *
 * ```html
 * <div class="chart-annotations">
 *   <span data-annotation="axis-break" data-to="140" data-size="30%"></span>
 * </div>
 * ```
 *
 * The range and its size are read in `layout`: see core.ts.
 */
export const axisBreak: AnnotationType = {
	// Nothing to say in words: the mark is the whole of it.
	create: () => null,

	draw(spec: HTMLElement, _badge: HTMLElement | null, geo: Geometry) {
		const { segments, cx, y, barWidth, svg, breakAt } = geo;
		if (breakAt === null) return;

		const level = y(breakAt);
		const overhang = barWidth * 0.09;
		const width = barWidth + overhang * 2;

		// Two straight lines across the bar, rising to the right, with the surface
		// between them: the cut as a finance page draws it. `data-mark="zigzag"`
		// asks for a torn edge instead.
		const zigzag = spec.getAttribute("data-mark") === "zigzag";
		const tilt = width * 0.3;
		const teeth = 6;
		const rise = BREAK_GAP * 0.26;

		/** The corners of one edge of the cut, from the left of a bar to the right. */
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

		// The mask: everything shows, except the gaps. It covers more than the chart,
		// so a mark that reaches past the edge is not cut off.
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
			// Every bar the break runs through, whatever it stands on.
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

		// Everything drawn so far goes into a group with the mask. The two lines of
		// each cut are drawn after it, so they are not masked.
		const edges = Array.from(svg.querySelectorAll(`.${BREAK_CLASS}`));
		const group = svgEl("g", { mask: `url(#${id})` });
		for (const child of Array.from(svg.childNodes)) if (!edges.includes(child as Element)) group.appendChild(child);
		const defs = svgEl("defs");
		defs.appendChild(mask);
		svg.prepend(defs, group);
	},
};
