/**
 * Where labels go, and whether they fit. Every chart type uses these rules, so a
 * number is treated the same way in each of them.
 *
 * Sizes are in viewBox units: a label's size in pixels times `unit`.
 */

/** Room a number needs beside it inside a bar, in pixels. */
const PAD = 6;

/** If any label is wider than its bar, less a little room. Then all go outside. */
export const tooWide = (labels: HTMLElement[], width: number, unit: number): boolean =>
	labels.some((label) => label.offsetWidth * unit > width - PAD * unit);

/** If a bar is tall enough to hold its label inside. */
export const tallEnough = (label: HTMLElement, height: number, unit: number): boolean =>
	height >= label.offsetHeight * unit * 1.6;

/** If a sideways bar is long enough to hold its label inside. */
export const fitsLength = (label: HTMLElement, length: number, unit: number): boolean =>
	length >= label.offsetWidth * unit * 1.5;

/**
 * Scales a set of labels together, so each fits its room. Returns the factor: 1 if
 * they fit as they are, smaller down to `min`, and 0 if they do not fit even then.
 * The target gets the factor as a CSS variable, which the stylesheet uses for the
 * font size. With 0, the target keeps `min`: labels that must stay, such as names,
 * stay at their smallest; labels that may go, such as numbers, are left out.
 *
 * `measure` gives a label's size and its room, at full size.
 */
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

/**
 * Moves labels apart from top to bottom, so no two are closer than `gap`. Each item
 * has the `y` it wants; the ones below a clash move down.
 */
export const spread = <T extends { y: number }>(items: T[], gap: number): T[] => {
	items.sort((a, b) => a.y - b.y);
	items.forEach((item, k) => {
		const above = items[k - 1];
		if (above && item.y < above.y + gap) item.y = above.y + gap;
	});
	return items;
};
