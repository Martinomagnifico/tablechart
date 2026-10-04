/** Sizes are in viewBox units: a size in pixels times `unit`. */

const PAD = 6;

export const tooWide = (labels: HTMLElement[], width: number, unit: number): boolean =>
	labels.some((label) => label.offsetWidth * unit > width - PAD * unit);

export const tallEnough = (label: HTMLElement, height: number, unit: number): boolean =>
	height >= label.offsetHeight * unit * 1.6;

export const fitsLength = (label: HTMLElement, length: number, unit: number): boolean =>
	length >= label.offsetWidth * unit * 1.5;

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
