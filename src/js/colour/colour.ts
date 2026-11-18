import { contrastOf, luminance, methodOf } from "./core/methods";
import { blackOrWhite, BLACK, pick, WHITE } from "./core/pick";
import { css, over, resolve, rgbOf } from "./core/rgb";
import { towards } from "./core/towards";

/**
 * Measures the colour behind a chart, as `--_surface`: the first background up from the figure that is not see-through, with
 * any see-through ones in front of it mixed in. A slide in Reveal.js has its colour in `data-background-color`, or in
 * `data-background` if that is a colour rather than an image.
 */
export const measureSurface = (figure: HTMLElement): boolean => {
	const layers: number[][] = [];
	let color: number[] | null = null;

	for (let element: HTMLElement | null = figure; element && !color; element = element.parentElement) {
		const { background, backgroundColor } = element.dataset;
		const slide = backgroundColor || (background && CSS.supports("color", background) ? background : "");
		const layer = rgbOf(slide || getComputedStyle(element).backgroundColor);

		if (layer[3] >= 1) color = layer;
		else if (layer[3] > 0) layers.push(layer);
	}

	color ??= resolve(figure, "Canvas");

	for (const layer of layers.reverse()) color = over(layer, color);

	const measured = css(color.map(Math.round));
	if (figure.style.getPropertyValue("--_surface") === measured) return false;
	figure.style.setProperty("--_surface", measured);
	return true;
};

/** The background of a chart: `--tablechart-surface` if it is set, or else the measured one. */
export const surfaceOf = (figure: HTMLElement): [number, number, number, number] =>
	resolve(figure, "var(--tablechart-surface, var(--_surface, Canvas))");

/** The bar or part of a stack that a number inside it belongs to. */
export const markOf = (figure: HTMLElement, value: HTMLElement): Element | null => {
	// A number of a line inside a column takes the series of that column.
	const series = value.dataset.over ?? value.dataset.series;

	return figure.querySelector(
		`:is(.tablechart-bar, .tablechart-piece, .tablechart-slice)[data-row="${value.dataset.row}"]${series ? `[data-series="${series}"]` : ""}`
	);
};

/** The colour of a mark: a slice is a stroke, a bar a fill. */
export const paintOf = (mark: Element): string => {
	const style = getComputedStyle(mark);
	return mark.classList.contains("tablechart-slice") ? style.stroke : style.fill;
};

/**
 * A number inside a bar gets `--tablechart-value-on-dark` or `--tablechart-value-on-light`, whichever has more contrast with the
 * bar, if that is at least `--tablechart-value-contrast` (5:1 by default, or Lc 60 with APCA); else black or white. By default the one on dark bars is
 * the background colour, so the number looks cut out of the bar, and the one on light bars the text colour (the other way round
 * on a dark background). Set as `--_ink`, so the number still fades in with the chart.
 */
export const inkInside = (figure: HTMLElement): void => {
	const values = figure.querySelectorAll<HTMLElement>(".tablechart-value:is([data-place='inside'], [data-over])");
	if (!values.length) return;
	const ink = inkerOf(figure);

	for (const value of values) {
		const mark = markOf(figure, value);

		// A pie gives the numbers on its slices one colour itself.
		if (!mark || value.hasAttribute("data-left-out") || mark.classList.contains("tablechart-slice")) continue;
		value.style.setProperty("--_ink", ink(rgbOf(paintOf(mark))));
	}
};

/** The colour of text on a fill, chosen as for a number inside a bar. */
const inkSetup = (figure: HTMLElement) => {
	const surface = surfaceOf(figure).slice(0, 3);

	// The point where black and white have the same contrast with a colour.
	const lightSurface = luminance(surface) > 0.179;

	const own = (name: string, fallback: number[]) => {
		const [red, green, blue, alpha] = resolve(figure, `var(${name}, transparent)`);
		return alpha > 0 ? [red, green, blue] : fallback;
	};

	const method = methodOf(figure);
	const needed = Number.parseFloat(getComputedStyle(figure).getPropertyValue("--tablechart-value-contrast")) || method.goal;
	const text = rgbOf(getComputedStyle(figure).color).slice(0, 3);
	const onDark = own("--tablechart-value-on-dark", lightSurface ? surface : text);
	const onLight = own("--tablechart-value-on-light", lightSurface ? text : surface);
	return { method, needed, onDark, onLight };
};

export const inkerOf = (figure: HTMLElement): ((fill: number[]) => string) => {
	const { method, needed, onDark, onLight } = inkSetup(figure);

	return (fill) => {
		const best = contrastOf(method, onDark, fill) > contrastOf(method, onLight, fill) ? onDark : onLight;
		const { colour, fits } = pick([best, WHITE, BLACK], [fill], needed, method);
		return css(fits[0] ? colour : blackOrWhite(fill, method));
	};
};

/**
 * A name next to a line is text on the background, in the colour of its line. If that has too little contrast, it moves towards the
 * text colour only as far as needed, so it still looks like its line. Measured from the line, because the name may still be fading in.
 */
export const inkNames = (figure: HTMLElement): void => {
	const names = figure.querySelectorAll<HTMLElement>(".tablechart-name:not([data-place='legend'])");
	if (!names.length) return;
	const method = methodOf(figure);
	const needed = method.text;
	const surface = surfaceOf(figure).slice(0, 3);
	const text = rgbOf(getComputedStyle(figure).color).slice(0, 3);

	for (const name of names) {
		const line = figure.querySelector(`.tablechart-series[data-series="${name.dataset.series}"]:not([data-muted])`);
		name.style.removeProperty("--_ink");
		if (!line) continue;
		const own = rgbOf(getComputedStyle(line).stroke).slice(0, 3);
		if (contrastOf(method, own, surface) < needed) name.style.setProperty("--_ink", css(towards(own, text, surface, needed, method)));
	}
};

/** One colour for the numbers on several fills, such as the slices of a pie: the one with enough contrast on the most of them, and on which. */
export const sharedInk = (figure: HTMLElement, fills: number[][]): { ink: string; fits: boolean[] } => {
	const { method, needed, onDark, onLight } = inkSetup(figure);
	const { colour, fits } = pick([onDark, onLight, WHITE, BLACK], fills, needed, method);
	return { ink: css(colour), fits };
};
