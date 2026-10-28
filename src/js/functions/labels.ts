import type { Box } from "./collision";
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

export const spread = <T extends { y: number }>(items: T[], gap: number): T[] => {
	items.sort((a, b) => a.y - b.y);
	items.forEach((item, k) => {
		const above = items[k - 1];
		if (above && item.y < above.y + gap) item.y = above.y + gap;
	});
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

/** The smallest step, every first, second, third or more of these numbers, at which none overlap; 1 if they all fit. */
export const stepOf = (shown: HTMLElement[], unit: number, width: number, height: number): number => {
	if (shown.length < 2) return 1;
	const boxes = shown.map((label) => boxOf(label, unit, width, height));
	// A little room between two numbers, so they do not read as one.
	const gap = 2 * unit;
	const apart = (a: number[], b: number[]) =>
		a[0] + a[2] + gap <= b[0] || b[0] + b[2] + gap <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1];
	let step = 1;
	while (step < shown.length && boxes.some((box, i) => i >= step && i % step === 0 && !apart(boxes[i - step], box))) step++;
	return step;
};

