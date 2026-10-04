import type { Series } from "../types";
import { svgEl } from "./svg";

export type Shape = "circle" | "square" | "diamond";
const SHAPES: Shape[] = ["circle", "square", "diamond"];

export interface Marker {
	shape: Shape;
	open: boolean;
}

/** Filled circle, open circle, filled square, and so on; `data-marker` on the column header sets another. */
export const markerOf = (series: Series[], s: number): Marker => {
	const own = series[s]?.marker?.toLowerCase().split(/\s+/) ?? [];
	const asked = SHAPES.find((shape) => own.includes(shape));
	return {
		shape: asked ?? SHAPES[Math.floor(s / 2) % SHAPES.length],
		open: own.includes("open") || (!own.includes("filled") && !asked && s % 2 === 1),
	};
};

/** `size` is the radius of a circle; a square and a diamond are sized to look as large. */
export const markerEl = (
	shape: Shape,
	x: number,
	y: number,
	size: number,
	attrs: Record<string, string | number> = {}
): SVGElement => {
	if (shape === "square") {
		const half = size * 0.88;
		return svgEl("rect", { x: x - half, y: y - half, width: half * 2, height: half * 2, ...attrs });
	}
	if (shape === "diamond") {
		const half = size * 1.2;
		return svgEl("polygon", {
			points: `${x},${y - half} ${x + half},${y} ${x},${y + half} ${x - half},${y}`,
			...attrs,
		});
	}
	return svgEl("circle", { cx: x, cy: y, r: size, ...attrs });
};
