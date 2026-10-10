import { BAR_CLASS, BREAK_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { svgEl } from "../functions/svg";
import type { AnnotationType, Geometry } from "../types";

let masks = 0;

type Corner = [number, number];
type Box = { row: number; x: number; y: number; width: number; height: number; sideways: boolean };

/** The box of every bar as drawn; a stack of pieces counts as one bar. */
const barsIn = (svg: SVGSVGElement): Box[] =>
	Array.from(svg.querySelectorAll<SVGElement>(`.${BAR_CLASS}`)).map((bar) => {
		const rects = bar.tagName === "rect" ? [bar] : Array.from(bar.querySelectorAll("rect"));
		const read = (rect: Element, name: string) => Number(rect.getAttribute(name));
		const x = Math.min(...rects.map((rect) => read(rect, "x")));
		const y = Math.min(...rects.map((rect) => read(rect, "y")));
		const right = Math.max(...rects.map((rect) => read(rect, "x") + read(rect, "width")));
		const bottom = Math.max(...rects.map((rect) => read(rect, "y") + read(rect, "height")));
		return { row: Number(bar.dataset.row), x, y, width: right - x, height: bottom - y, sideways: bar.dataset.grow === "right" };
	});

/** A break in the scale. `layout` breaks the scale; this masks the gap out of each bar it runs through and draws its two edges. */
export const axisBreak: AnnotationType = {
	create: () => null,

	draw(spec: HTMLElement, _badge: HTMLElement | null, geo: Geometry) {
		const { rows, y, svg, breakAt } = geo;
		if (breakAt === null) return;

		// `data-mark="zigzag"` draws each edge up, down and up again across a column, or right, left and right again down a bar.
		const zigzag = spec.getAttribute("data-mark") === "zigzag";

		// One edge of the cut through a bar, at `at`: across a column, or down a bar laid on its side.
		const edge = (box: Box, at: number): Corner[] => {
			const thickness = box.sideways ? box.height : box.width;
			const overhang = thickness * 0.09;
			const length = thickness + overhang * 2;
			const tilt = length * 0.3;
			const rise = length * 0.06;
			if (box.sideways) {
				const top = box.y - overhang;
				if (!zigzag) return [[at - tilt / 2, top], [at + tilt / 2, top + length]];
				const third = length / 3;
				return [[at - rise, top], [at + rise, top + third], [at - rise, top + 2 * third], [at + rise, top + length]];
			}
			const left = box.x - overhang;
			if (!zigzag) return [[left, at + tilt / 2], [left + length, at - tilt / 2]];
			const third = length / 3;
			return [[left, at + rise], [left + third, at - rise], [left + 2 * third, at + rise], [left + length, at - rise]];
		};

		const path = (corners: Corner[], close = false): string =>
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
		const cuts: Corner[][] = [];

		const level = y(breakAt);
		for (const box of barsIn(svg)) {
			// A column is cut where the scale jumps; a bar on its side where the bar chart put its cut.
			const across = box.sideways ? geo.breakX : level;
			if (across === undefined) continue;
			const crosses = box.sideways ? box.x < across && box.x + box.width > across : box.y < level && box.y + box.height > level;
			if (!crosses) continue;

			const [first, second] = box.sideways ? [edge(box, across), edge(box, across + geo.breakGap)] : [edge(box, level - geo.breakGap), edge(box, level)];
			mask.appendChild(svgEl("path", { d: path([...first, ...second.slice().reverse()], true), fill: "black" }));
			cuts.push(first, second);
			const when = timing("--after", rows[box.row - 1]?.slot ?? 0);

			for (const corners of [first, second]) {
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
