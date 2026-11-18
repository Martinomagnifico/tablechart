let canvas: CanvasRenderingContext2D | null = null;

/** Any CSS colour as red, green and blue, from 0 to 255, with its alpha from 0 to 1, by painting it. */
export const rgbOf = (color: string): [number, number, number, number] => {
	canvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
	if (!canvas) return [0, 0, 0, 1];
	canvas.clearRect(0, 0, 1, 1);
	canvas.fillStyle = color;
	canvas.fillRect(0, 0, 1, 1);
	const [red, green, blue, alpha] = canvas.getImageData(0, 0, 1, 1).data;
	return [red, green, blue, alpha / 255];
};

export const luminance = ([red, green, blue]: number[]): number => {
	const channel = (value: number) => {
		const fraction = value / 255;
		return fraction <= 0.03928 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
};

/** The method from `--tablechart-contrast-wcag`: 2 for the contrast ratio of WCAG 2, 3 for APCA from the WCAG 3 draft. */
export const methodOf = (figure: HTMLElement): 2 | 3 =>
	getComputedStyle(figure).getPropertyValue("--tablechart-contrast-wcag").trim() === "3" ? 3 : 2;

// APCA 0.0.98G: lightness with its own curve, and a soft clamp for near black.
const apcaY = ([red, green, blue]: number[]): number => {
	const y = 0.2126729 * (red / 255) ** 2.4 + 0.7151522 * (green / 255) ** 2.4 + 0.072175 * (blue / 255) ** 2.4;
	return y < 0.022 ? y + (0.022 - y) ** 1.414 : y;
};

/** The APCA lightness contrast (Lc) of text on a background, without its sign: from 0 to about 106. */
export const apca = (text: number[], background: number[]): number => {
	const textY = apcaY(text);
	const backgroundY = apcaY(background);
	if (Math.abs(backgroundY - textY) < 0.0005) return 0;
	const sapc = backgroundY > textY ? (backgroundY ** 0.56 - textY ** 0.57) * 1.14 : (backgroundY ** 0.65 - textY ** 0.62) * 1.14;
	return Math.abs(sapc) < 0.1 ? 0 : (Math.abs(sapc) - 0.027) * 100;
};

/** The contrast of text on a background as the method measures it: a ratio for WCAG 2, Lc for APCA. */
export const contrastOf = (method: 2 | 3, text: number[], background: number[]): number =>
	method === 3 ? apca(text, background) : ratio(text, background);

/** The contrast of two colours, as WCAG counts it: from 1 to 21. */
export const ratio = (first: number[], second: number[]): number => {
	const [light, dark] = [luminance(first), luminance(second)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
};

// A colour as CSS resolves it in the chart, so a variable, `light-dark()` or `Canvas` gets its value there.
const resolve = (figure: HTMLElement, color: string): [number, number, number, number] => {
	const probe = document.createElement("span");
	probe.style.color = color;
	figure.append(probe);
	const value = rgbOf(getComputedStyle(probe).color);
	probe.remove();
	return value;
};

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

	for (const [red, green, blue, alpha] of layers.reverse()) {
		const below = color as number[];
		color = [red, green, blue].map((value, index) => value * alpha + below[index] * (1 - alpha));
	}

	const measured = `rgb(${color.slice(0, 3).map(Math.round).join(" ")})`;
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

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

// The one that reaches the goal. With WCAG 2, on a middle colour both just pass 4.5:1, and white is easier to read there.
const blackOrWhite = (fill: number[], needed: number, method: 2 | 3): number[] => {
	const white = contrastOf(method, WHITE, fill);
	const black = contrastOf(method, BLACK, fill);
	if (white >= needed) return WHITE;
	if (black >= needed) return BLACK;
	return (method === 2 && white >= 4.5) || white > black ? WHITE : BLACK;
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
	const needed = Number.parseFloat(getComputedStyle(figure).getPropertyValue("--tablechart-value-contrast")) || (method === 3 ? 60 : 5);
	const text = rgbOf(getComputedStyle(figure).color).slice(0, 3);
	const onDark = own("--tablechart-value-on-dark", lightSurface ? surface : text);
	const onLight = own("--tablechart-value-on-light", lightSurface ? text : surface);
	return { method, needed, onDark, onLight };
};

export const inkerOf = (figure: HTMLElement): ((fill: number[]) => string) => {
	const { method, needed, onDark, onLight } = inkSetup(figure);

	return (fill) => {
		const best = contrastOf(method, onDark, fill) > contrastOf(method, onLight, fill) ? onDark : onLight;
		const ink = contrastOf(method, best, fill) >= needed ? best : blackOrWhite(fill, needed, method);
		return `rgb(${ink.join(" ")})`;
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
	const needed = method === 3 ? 60 : 4.5;
	const surface = surfaceOf(figure).slice(0, 3);
	const text = rgbOf(getComputedStyle(figure).color).slice(0, 3);

	for (const name of names) {
		const line = figure.querySelector(`.tablechart-series[data-series="${name.dataset.series}"]:not([data-muted])`);
		name.style.removeProperty("--_ink");
		if (!line) continue;
		const own = rgbOf(getComputedStyle(line).stroke).slice(0, 3);

		for (let step = 0; step <= 20; step++) {
			const color = own.map((value, index) => Math.round(value + ((text[index] - value) * step) / 20));
			if (contrastOf(method, color, surface) < needed && step < 20) continue;
			if (step) name.style.setProperty("--_ink", `rgb(${color.join(" ")})`);
			break;
		}
	}
};

/** One colour for the numbers on several fills, such as the slices of a pie: the one with enough contrast on the most of them, and on which. */
export const sharedInk = (figure: HTMLElement, fills: number[][]): { ink: string; fits: boolean[] } => {
	const { method, needed, onDark, onLight } = inkSetup(figure);
	let best = { ink: onDark, fits: fills.map(() => false), count: -1 };

	for (const ink of [onDark, onLight, WHITE, BLACK]) {
		const fits = fills.map((fill) => contrastOf(method, ink, fill) >= needed);
		const count = fits.filter(Boolean).length;
		if (count > best.count) best = { ink, fits, count };
	}

	return { ink: `rgb(${best.ink.join(" ")})`, fits: best.fits };
};
