// The two ways to measure contrast. Each has its own measure, its own minimums and its own rule for large text.
import { APCAcontrast, sRGBtoY } from "apca-w3";
import type { Colour } from "./rgb";

export interface Method {
	/** The contrast of text on a background: a ratio for WCAG 2, Lc with its sign for APCA. */
	measure: (text: Colour, background: Colour) => number;

	/** The least for a line, bar or slice, for text, and for large text. */
	part: number;
	text: number;
	large: number;

	/** What a number inside a bar aims for, a little more than it needs. */
	goal: number;
	isLarge: (size: number, weight: number) => boolean;
}

/** The relative luminance of WCAG 2, from 0 for black to 1 for white. */
export const luminance = ([red, green, blue]: Colour): number => {
	const channel = (value: number) => {
		const fraction = value / 255;
		return fraction <= 0.03928 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
};

export const WCAG: Method = {
	measure: (text, background) => {
		const [light, dark] = [luminance(text), luminance(background)].sort((first, second) => second - first);
		return (light + 0.05) / (dark + 0.05);
	},
	part: 3,
	text: 4.5,
	large: 3,
	goal: 5,

	// 18pt, or 14pt bold.
	isLarge: (size, weight) => size >= 24 || (size >= 18.66 && weight >= 700),
};

export const APCA: Method = {
	measure: (text, background) => APCAcontrast(sRGBtoY(text), sRGBtoY(background)),
	part: 30,
	text: 60,
	large: 45,
	goal: 60,

	// As in APCA's Bronze simple mode: 36px, or 24px bold.
	isLarge: (size, weight) => size >= 36 || (size >= 24 && weight >= 700),
};

/** How strong a contrast is, to compare with a minimum: the ratio, or the size of Lc whatever its sign. */
export const contrastOf = (method: Method, text: Colour, background: Colour): number => Math.abs(method.measure(text, background));

/** The method from `--tablechart-contrast-wcag`: 3 for APCA, else WCAG 2. */
export const methodOf = (figure: HTMLElement): Method =>
	getComputedStyle(figure).getPropertyValue("--tablechart-contrast-wcag").trim() === "3" ? APCA : WCAG;
