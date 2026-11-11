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
	items.sort((a, b) => a.y - b.y);
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
	for (const group of groups) group.items.forEach((item, k) => (item.y = topOf(group) + k * gap));
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
	const { width: w, height: h } = sizeOf(label);
	return [
		(Number.parseFloat(label.style.left) / 100) * width - w * unit * ax,
		(Number.parseFloat(label.style.top) / 100) * height - h * unit * ay,
		w * unit,
		h * unit,
	];
};

/** A number at the end of a line, centred on its point, would stick out past the chart: it moves in. */
export const keepInside = (labels: HTMLElement[], unit: number, width: number): void => {
	for (const label of labels) {
		if (label.dataset.place === "none" || !label.style.left) continue;
		const [ax] = ANCHORS[label.dataset.place ?? ""] ?? [0.5, 0.5];
		const w = sizeOf(label).width * unit;
		const x = (Number.parseFloat(label.style.left) / 100) * width;
		const moved = Math.min(Math.max(x, w * ax), width - w * (1 - ax));
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
	shown.forEach((label, i) => {
		if (i % step) label.setAttribute("data-left-out", "");
	});
};

// With a little room between two numbers, so they do not read as one.
const apart = (a: number[], b: number[], gap: number) =>
	a[0] + a[2] + gap <= b[0] || b[0] + b[2] + gap <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1];

/** The smallest step, every first, second, third or more of these numbers, at which none overlap; 1 if they all fit. */
export const stepOf = (shown: HTMLElement[], unit: number, width: number, height: number): number => {
	if (shown.length < 2) return 1;
	const boxes = shown.map((label) => boxOf(label, unit, width, height));
	const gap = 2 * unit;
	let step = 1;
	while (step < shown.length && boxes.some((box, i) => i >= step && i % step === 0 && !apart(boxes[i - step], box, gap))) step++;
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
	const rows = [...marks.keys()].sort((a, b) => a - b);
	const across = !sideways;
	// Whether a mark is wholly past the box, in the direction of the search.
	const past = (box: Box, mark: Box, step: number) =>
		across ? (step > 0 ? mark[0] >= box[0] + box[2] : mark[0] + mark[2] <= box[0]) : step > 0 ? mark[1] >= box[1] + box[3] : mark[1] + mark[3] <= box[1];
	const at = new Map(rows.map((row, i) => [row, i]));
	// A number inside its own bar covers no other.
	const clash = (k: number) => {
		if (shown[k].dataset.place === "inside") return false;
		const box = boxes[k] as Box;
		const own = at.get(Number(shown[k].dataset.row)) ?? -1;
		for (const step of [-1, 1])
			for (let i = own + step; i >= 0 && i < rows.length; i += step) {
				const mark = marks.get(rows[i]) as Box;
				if (past(box, mark, step)) break;
				if (overlaps(mark, box)) return true;
			}
		return false;
	};
	if (stepOf(shown, unit, width, height) === 1 && !shown.some((_label, k) => clash(k))) return;
	const size = (k: number) => Math.abs(Number(shown[k].dataset.value) || 0);
	const kept: number[] = [];
	for (const k of shown.map((_label, k) => k).sort((a, b) => size(b) - size(a) || a - b)) {
		if (!clash(k) && kept.every((other) => apart(boxes[other], boxes[k], gap))) kept.push(k);
		else shown[k].setAttribute("data-left-out", "");
	}
};
