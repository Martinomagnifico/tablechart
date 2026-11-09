// Settings read from a figure: its CSS lengths and its on or off attributes.
import { VIEWBOX_WIDTH } from "../config";

export const cssLength = (figure: HTMLElement, unit: number, name: string, fallback: string) => {
	const style = getComputedStyle(figure);
	const raw = style.getPropertyValue(name).trim() || fallback;
	const match = raw.match(/^(\d+(?:\.\d+)?)(px|%|em|rem)$/);
	if (!match) return null;
	const amount = Number(match[1]);
	if (match[2] === "%") return (amount / 100) * VIEWBOX_WIDTH;
	const size =
		match[2] === "em"
			? Number.parseFloat(style.fontSize)
			: match[2] === "rem"
				? Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
				: 1;
	return amount * size * unit;
};

/** The least and the most a chart may be high; `--tablechart-height` is both. */
export const heightRange = (figure: HTMLElement, unit: number): [number, number] => {
	const fixed = cssLength(figure, unit, "--tablechart-height", "none");
	return [fixed ?? cssLength(figure, unit, "--tablechart-min-height", "200px") ?? 0, fixed ?? cssLength(figure, unit, "--tablechart-max-height", "none") ?? Number.POSITIVE_INFINITY];
};

/** A corner of a column, bar or slice: its own variable, or else the one for all of them. */
export const cornerOf = (figure: HTMLElement, unit: number, name: string): number =>
	cssLength(figure, unit, getComputedStyle(figure).getPropertyValue(name).trim() ? name : "--tablechart-corner-radius", "0px") ?? 0;

/** A figure's own `data-chart-…`, on unless it says `false`, or else the option. */
export const turnedOn = (figure: HTMLElement, name: string, option: boolean): boolean => {
	const own = figure.getAttribute(name);
	return own === null ? option : own !== "false";
};
