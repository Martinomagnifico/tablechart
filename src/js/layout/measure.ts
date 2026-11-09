// Sizes of text, read all at once before a layout places anything: a read between writes would force a layout each time.

type Size = { width: number; height: number };
const sizes = new WeakMap<Element, Size>();

/** Reads the size of every element in one go, in pixels. */
export const measureAll = (elements: Iterable<HTMLElement | null | undefined>): void => {
	const all = [...elements].filter((element): element is HTMLElement => !!element);
	const read = all.map((element) => ({ width: element.offsetWidth, height: element.offsetHeight }));
	all.forEach((element, k) => sizes.set(element, read[k]));
};

/** The size `measureAll` read, or a fresh read for an element it did not see. */
export const sizeOf = (element: HTMLElement): Size =>
	sizes.get(element) ?? { width: element.offsetWidth, height: element.offsetHeight };
