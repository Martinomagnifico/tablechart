// Labels that do not cover each other or the marks. Arithmetic only: the sizes were measured before.

/** Left, top, width and height, in viewBox units. */
export type Box = [number, number, number, number];

/** Above this many labels, finding room for each one costs too much; they are all left out. */
export const MOST_LABELS = 400;

export const overlaps = (first: Box, second: Box): boolean =>
	first[0] < second[0] + second[2] && second[0] < first[0] + first[2] && first[1] < second[1] + second[3] && second[1] < first[1] + first[3];

const inside = (box: Box, frame: Box): boolean =>
	box[0] >= frame[0] && box[1] >= frame[1] && box[0] + box[2] <= frame[0] + frame[2] && box[1] + box[3] <= frame[1] + frame[3];

/**
 * For each label, its first candidate that is inside `frame` and covers no mark and no label placed before it.
 * The labels place in the order given, so the first ones get the best places. Null for a label with no room.
 * The same input always gives the same answer, so a chart looks the same after every resize.
 */
export const avoidCollisions = (labels: Box[][], marks: Box[], frame: Box): (number | null)[] => {
	if (labels.length > MOST_LABELS) return labels.map(() => null);

	// A grid of cells as large as the largest label, so a box is only tested against the boxes near it.
	let cell = 1;
	for (const candidates of labels) for (const [, , width, height] of candidates) cell = Math.max(cell, width, height);
	const grid = new Map<string, Box[]>();

	const cellsOf = ([x, y, width, height]: Box): string[] => {
		const keys: string[] = [];

		for (let column = Math.floor(x / cell); column <= Math.floor((x + width) / cell); column++)
			for (let row = Math.floor(y / cell); row <= Math.floor((y + height) / cell); row++) keys.push(`${column} ${row}`);

		return keys;
	};

	const add = (box: Box): void => {
		for (const key of cellsOf(box)) grid.get(key)?.push(box) ?? grid.set(key, [box]);
	};

	const free = (box: Box): boolean =>
		inside(box, frame) && cellsOf(box).every((key) => !grid.get(key)?.some((other) => overlaps(box, other)));

	marks.forEach(add);

	return labels.map((candidates) => {
		const index = candidates.findIndex(free);
		if (index < 0) return null;
		add(candidates[index]);
		return index;
	});
};
