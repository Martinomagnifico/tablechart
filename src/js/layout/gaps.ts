import { short, svgEl } from "../draw/svg";
import type { Box } from "./collision";

/** The path of a straight line in pieces, without the parts that cross `boxes`, so its gaps need no mask. */
export const piecesOf = (x1: number, y1: number, x2: number, y2: number, boxes: Box[]): string => {
	const across = y1 === y2;
	const [from, to, at] = across ? [Math.min(x1, x2), Math.max(x1, x2), y1] : [Math.min(y1, y2), Math.max(y1, y2), x1];

	const cuts = boxes
		.filter(([x, y, width, height]) => (across ? y <= at && at <= y + height : x <= at && at <= x + width))
		.map(([x, y, width, height]) => (across ? [x, x + width] : [y, y + height]))
		.sort((start, end) => start[0] - end[0]);

	const pieces: [number, number][] = [];
	let start = from;

	for (const [cutStart, cutEnd] of cuts) {
		if (cutStart > start) pieces.push([start, Math.min(cutStart, to)]);
		start = Math.max(start, cutEnd);
	}

	if (start < to) pieces.push([start, to]);
	return pieces.map(([start, end]) => (across ? `M${short(start)},${short(at)}H${short(end)}` : `M${short(at)},${short(start)}V${short(end)}`)).join("");
};

/** A straight `line` as a path in pieces around `boxes`. */
export const lineAround = (line: SVGElement, boxes: Box[]): void => {
	const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((name) => Number(line.getAttribute(name)));
	const path = svgEl("path", { d: piecesOf(x1, y1, x2, y2, boxes) });
	for (const { name, value } of Array.from(line.attributes)) if (!/^[xy][12]$/.test(name)) path.setAttribute(name, value);
	line.replaceWith(path);
};

/** The straight lines of a path (`M x,y H x` or `V y`), as their ends. */
export const linesIn = (path: SVGElement): [number, number, number, number][] =>
	Array.from((path.getAttribute("d") ?? "").matchAll(/M(-?[\d.]+),(-?[\d.]+)([HV])(-?[\d.]+)/g), ([, x, y, axis, end]) =>
		axis === "H" ? [+x, +y, +end, +y] : [+x, +y, +x, +end]
	);

/** The parts of the straight lines in `path` that lie in `box`, as a path; empty if none do. */
export const piecesIn = (lines: [number, number, number, number][], [x, y, width, height]: Box): string =>
	lines
		.map(([x1, y1, x2, y2]) =>
			y1 === y2
				? y <= y1 && y1 <= y + height && Math.max(x1, x) < Math.min(x2, x + width)
					? `M${short(Math.max(x1, x))},${short(y1)}H${short(Math.min(x2, x + width))}`
					: ""
				: x <= x1 && x1 <= x + width && Math.max(y1, y) < Math.min(y2, y + height)
					? `M${short(x1)},${short(Math.max(y1, y))}V${short(Math.min(y2, y + height))}`
					: ""
		)
		.join("");
