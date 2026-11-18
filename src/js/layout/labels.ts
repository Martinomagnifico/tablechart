import { type Box, overlaps } from "./collision";
import { sizeOf } from "./measure";

/** Sizes are in viewBox units: a size in pixels times `unit`. */

const PAD = 6;

export const tooWide = (labels: HTMLElement[], width: number, unit: number): boolean =>
	labels.some((label) => sizeOf(label).width * unit > width - PAD * unit);

export const tallEnough = (label: HTMLElement, height: number, unit: number): boolean =>
	height >= sizeOf(label).height * unit * 1.6;

export const fitsLength = (label: HTMLElement, length: number, unit: number): boolean =>
	length >= sizeOf(label).width * unit * 1.5;

/** The least gap between a number inside a bar and the end of the bar, as a part of the height of the digits. */
export const END_GAP = 0.75;

/** Numbers side by side start at full size, so they may get smaller further than other labels. */
export const GROUP_FIT_MIN = 0.5;

/** Scales labels together, down to `min`. Returns 0 if they do not fit even then. */
export const fitTogether = (
	target: HTMLElement,
	labels: HTMLElement[],
	measure: (label: HTMLElement) => { size: number; room: number },
	property: string,
	min = 0.7
): number => {
	target.style.setProperty(property, "1");
	let scale = 1;

	for (const label of labels) {
		const { size, room } = measure(label);
		if (size > room) scale = Math.min(scale, room / size);
	}

	const fit = scale >= min ? scale : 0;
	target.style.setProperty(property, String(fit || min));
	return fit;
};

/** Pushes items apart where they are closer than `gap`. A group that had to move stays centred on where its items wanted to be. */
export const spread = <T extends { y: number }>(items: T[], gap: number): T[] => {
	items.sort((first, second) => first.y - second.y);
	const groups: { items: T[]; sum: number }[] = [];

	const topOf = (group: { items: T[]; sum: number }) => group.sum / group.items.length - ((group.items.length - 1) * gap) / 2;

	for (const item of items) {
		let group = { items: [item], sum: item.y };

		for (let above = groups.at(-1); above && topOf(above) + above.items.length * gap > topOf(group); above = groups.at(-1)) {
			groups.pop();
			group = { items: [...above.items, ...group.items], sum: above.sum + group.sum };
		}

		groups.push(group);
	}

	for (const group of groups) group.items.forEach((item, index) => (item.y = topOf(group) + index * gap));
	return items;
};

// Where a number is anchored, as a share of its size, by where it is placed.
const ANCHORS: Record<string, [number, number]> = {
	outside: [0.5, 1],
	below: [0.5, 0],
	after: [0, 0.5],
	before: [1, 0.5],
};

/** Where a placed label is, as a box: from its anchor by `data-place`, or else `anchor`, such as [0, 0] for its top left. */
export const boxOf = (label: HTMLElement, unit: number, width: number, height: number, anchor: [number, number] = [0.5, 0.5]): Box => {
	const [ax, ay] = ANCHORS[label.dataset.place ?? ""] ?? anchor;
	const { width: labelWidth, height: labelHeight } = sizeOf(label);

	return [
		(Number.parseFloat(label.style.left) / 100) * width - labelWidth * unit * ax,
		(Number.parseFloat(label.style.top) / 100) * height - labelHeight * unit * ay,
		labelWidth * unit,
		labelHeight * unit,
	];
};

/** A number at the end of a line, centred on its point, would stick out past the chart: it moves in. */
export const keepInside = (labels: HTMLElement[], unit: number, width: number): void => {
	for (const label of labels) {
		if (label.dataset.place === "none" || !label.style.left) continue;
		const [ax] = ANCHORS[label.dataset.place ?? ""] ?? [0.5, 0.5];
		const labelWidth = sizeOf(label).width * unit;
		const x = (Number.parseFloat(label.style.left) / 100) * width;
		const moved = Math.min(Math.max(x, labelWidth * ax), width - labelWidth * (1 - ax));
		if (moved !== x) label.style.left = `${(moved / width) * 100}%`;
	}
};

/**
 * Numbers of one series that overlap are thinned out to every second, third or more, from the first, as the numbers along
 * an axis are: the smallest step at which none overlap. The others are left out, and their row's tooltip shows them.
 */
export const thinOut = (labels: HTMLElement[], unit: number, width: number, height: number): void => {
	const shown = labels.filter((label) => label.dataset.place !== "none" && !label.hasAttribute("data-left-out"));
	const step = stepOf(shown, unit, width, height);

	shown.forEach((label, index) => {
		if (index % step) label.setAttribute("data-left-out", "");
	});
};

// With a little room between two numbers, so they do not read as one.
const apart = (first: number[], second: number[], gap: number) =>
	first[0] + first[2] + gap <= second[0] ||
	second[0] + second[2] + gap <= first[0] ||
	first[1] + first[3] <= second[1] ||
	second[1] + second[3] <= first[1];

/** The smallest step, every first, second, third or more of these numbers, at which none overlap; 1 if they all fit. */
export const stepOf = (shown: HTMLElement[], unit: number, width: number, height: number): number => {
	if (shown.length < 2) return 1;
	const boxes = shown.map((label) => boxOf(label, unit, width, height));
	const gap = 2 * unit;
	let step = 1;
	while (step < shown.length && boxes.some((box, index) => index >= step && index % step === 0 && !apart(boxes[index - step], box, gap))) step++;
	return step;
};

/**
 * Numbers by their columns or bars: if any covers another column or another number, the largest values go first, and each one
 * stays only where it is clear of the other columns and of the numbers kept so far. `marks` is the box of each row's mark.
 */
export const keepClear = (labels: HTMLElement[], marks: Map<number, Box>, sideways: boolean, unit: number, width: number, height: number): void => {
	const shown = labels.filter((label) => label.dataset.place !== "none" && !label.hasAttribute("data-left-out"));
	const boxes = shown.map((label) => boxOf(label, unit, width, height));
	const gap = 2 * unit;

	// The rows side by side, across or down; a number can only reach the marks next to its own, so the search stops where they end.
	const rows = [...marks.keys()].sort((first, second) => first - second);
	const across = !sideways;

	// Whether a mark is wholly past the box, in the direction of the search.
	const past = (box: Box, mark: Box, step: number) =>
		across ? (step > 0 ? mark[0] >= box[0] + box[2] : mark[0] + mark[2] <= box[0]) : step > 0 ? mark[1] >= box[1] + box[3] : mark[1] + mark[3] <= box[1];

	const at = new Map(rows.map((row, rowIndex) => [row, rowIndex]));

	// A number inside its own bar covers no other.
	const clash = (index: number) => {
		if (shown[index].dataset.place === "inside") return false;
		const box = boxes[index] as Box;
		const own = at.get(Number(shown[index].dataset.row)) ?? -1;

		for (const step of [-1, 1])
			for (let index = own + step; index >= 0 && index < rows.length; index += step) {
				const mark = marks.get(rows[index]) as Box;
				if (past(box, mark, step)) break;
				if (overlaps(mark, box)) return true;
			}

		return false;
	};

	if (stepOf(shown, unit, width, height) === 1 && !shown.some((_label, index) => clash(index))) return;

	const size = (index: number) => Math.abs(Number(shown[index].dataset.value) || 0);

	const kept: number[] = [];

	for (const index of shown.map((_label, index) => index).sort((first, second) => size(second) - size(first) || first - second)) {
		if (!clash(index) && kept.every((other) => apart(boxes[other], boxes[index], gap))) kept.push(index);
		else shown[index].setAttribute("data-left-out", "");
	}
};
