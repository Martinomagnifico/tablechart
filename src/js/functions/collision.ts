// Labels that do not cover each other or the marks. Arithmetic only: the sizes were measured before.

/** Left, top, width and height, in viewBox units. */
export type Box = [number, number, number, number];

/** Above this many labels, finding room for each one costs too much; they are all left out. */
export const MOST_LABELS = 400;

export const overlaps = (a: Box, b: Box): boolean =>
	a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

const inside = (a: Box, frame: Box): boolean =>
	a[0] >= frame[0] && a[1] >= frame[1] && a[0] + a[2] <= frame[0] + frame[2] && a[1] + a[3] <= frame[1] + frame[3];

/**
 * For each label, its first candidate that is inside `frame` and covers no mark and no label placed before it.
 * The labels place in the order given, so the first ones get the best places. Null for a label with no room.
 * The same input always gives the same answer, so a chart looks the same after every resize.
 */
export const avoidCollisions = (labels: Box[][], marks: Box[], frame: Box): (number | null)[] => {
	if (labels.length > MOST_LABELS) return labels.map(() => null);
	// A grid of cells as large as the largest label, so a box is only tested against the boxes near it.
	let cell = 1;
	for (const candidates of labels) for (const [, , w, h] of candidates) cell = Math.max(cell, w, h);
	const grid = new Map<string, Box[]>();
	const cellsOf = ([x, y, w, h]: Box): string[] => {
		const keys: string[] = [];
		for (let i = Math.floor(x / cell); i <= Math.floor((x + w) / cell); i++)
			for (let j = Math.floor(y / cell); j <= Math.floor((y + h) / cell); j++) keys.push(`${i} ${j}`);
		return keys;
	};
	const add = (box: Box): void => {
		for (const key of cellsOf(box)) grid.get(key)?.push(box) ?? grid.set(key, [box]);
	};
	const free = (box: Box): boolean =>
		inside(box, frame) && cellsOf(box).every((key) => !grid.get(key)?.some((other) => overlaps(box, other)));

	marks.forEach(add);
	return labels.map((candidates) => {
		const k = candidates.findIndex(free);
		if (k < 0) return null;
		add(candidates[k]);
		return k;
	});
};
