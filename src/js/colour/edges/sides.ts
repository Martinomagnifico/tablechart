// The sides of a column or bar: which end has the value, which side is on the baseline, and which faces another part of its stack.
import { PIECE_CLASS } from "../../config";

export type Side = "top" | "bottom" | "left" | "right";

export const SIDES: Side[] = ["top", "right", "bottom", "left"];

const GROW: Record<string, Side> = { up: "top", down: "bottom", right: "right", left: "left" };

// The side across from each side.
export const BASE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

export interface Neighbour {
	other: SVGGeometryElement;
	from: number;
	to: number;
}

// ---------------------------------------------------------------------------------------------------------------------------------

export const isSideways = (side: Side): boolean => side === "left" || side === "right";

/** Where a side of a box is: its x for left and right, its y for top and bottom. */
export const at = (box: DOMRect, side: Side): number => {
	if (side === "top") return box.y;
	if (side === "bottom") return box.y + box.height;
	if (side === "left") return box.x;
	return box.x + box.width;
};

/** The end where the value is: the rounded end, or else the way the bar grows. */
export const endOf = (mark: Element): Side => {
	const end = mark.getAttribute("data-end");
	if (end) return end as Side;
	const grow = mark.closest("[data-grow]")?.getAttribute("data-grow") ?? "";
	return GROW[grow] ?? "top";
};

/** The nearest other part of the same stack past one side, and the gap between them, or null. */
export const neighbour = (mark: SVGGeometryElement, side: Side): Neighbour | null => {
	if (!mark.classList.contains(PIECE_CLASS)) return null;

	const box = mark.getBBox();
	const sideways = isSideways(side);
	const ahead = side === "bottom" || side === "right" ? 1 : -1;
	let nearest: Neighbour | null = null;

	for (const other of mark.parentElement?.querySelectorAll<SVGGeometryElement>(`.${PIECE_CLASS}`) ?? []) {
		if (other === mark) continue;
		const otherBox = other.getBBox();

		// Whether the other part is in line with this one, across the gap.
		const across = sideways
			? otherBox.y < at(box, "bottom") && at(otherBox, "bottom") > box.y
			: otherBox.x < at(box, "right") && at(otherBox, "right") > box.x;

		const gap = (at(otherBox, BASE[side]) - at(box, side)) * ahead;
		const closer = !nearest || gap < Math.abs(nearest.to - nearest.from);
		if (across && gap > -0.5 && closer) nearest = { other, from: at(box, side), to: at(otherBox, BASE[side]) };
	}

	return nearest;
};

/** The sides without an edge: one on the baseline, which is its edge, and one that faces another part of its stack across a gap. */
export const openSides = (mark: SVGGeometryElement, rules: SVGLineElement[]): Set<Side> => {
	const box = mark.getBBox();
	const open = new Set<Side>();
	const base = BASE[endOf(mark)];

	const onRule = rules.some((rule) => {
		const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((name) => Number(rule.getAttribute(name)));
		if (isSideways(base)) return x1 === x2 && Math.abs(x1 - at(box, base)) < 0.5;
		return y1 === y2 && Math.abs(y1 - at(box, base)) < 0.5;
	});

	if (onRule) open.add(base);

	for (const side of SIDES) {
		if (neighbour(mark, side)) open.add(side);
	}

	return open;
};
