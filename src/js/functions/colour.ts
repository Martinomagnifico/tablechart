let canvas: CanvasRenderingContext2D | null = null;

/** Any CSS colour as red, green and blue, from 0 to 255, with its alpha from 0 to 1, by painting it. */
export const rgbOf = (color: string): [number, number, number, number] => {
	canvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
	if (!canvas) return [0, 0, 0, 1];
	canvas.clearRect(0, 0, 1, 1);
	canvas.fillStyle = color;
	canvas.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
	return [r, g, b, a / 255];
};

export const luminance = ([r, g, b]: number[]): number => {
	const channel = (value: number) => {
		const v = value / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** The method from `--tablechart-contrast-wcag`: 2 for the contrast ratio of WCAG 2, 3 for APCA from the WCAG 3 draft. */
export const methodOf = (figure: HTMLElement): 2 | 3 =>
	getComputedStyle(figure).getPropertyValue("--tablechart-contrast-wcag").trim() === "3" ? 3 : 2;

// APCA 0.0.98G: lightness with its own curve, and a soft clamp for near black.
const apcaY = ([r, g, b]: number[]): number => {
	const y = 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.072175 * (b / 255) ** 2.4;
	return y < 0.022 ? y + (0.022 - y) ** 1.414 : y;
};

/** The APCA lightness contrast (Lc) of text on a background, without its sign: from 0 to about 106. */
export const apca = (text: number[], background: number[]): number => {
	const t = apcaY(text);
	const b = apcaY(background);
	if (Math.abs(b - t) < 0.0005) return 0;
	const sapc = b > t ? (b ** 0.56 - t ** 0.57) * 1.14 : (b ** 0.65 - t ** 0.62) * 1.14;
	return Math.abs(sapc) < 0.1 ? 0 : (Math.abs(sapc) - 0.027) * 100;
};

/** The contrast of text on a background as the method measures it: a ratio for WCAG 2, Lc for APCA. */
export const contrastOf = (method: 2 | 3, text: number[], background: number[]): number =>
	method === 3 ? apca(text, background) : ratio(text, background);

/** The contrast of two colours, as WCAG counts it: from 1 to 21. */
export const ratio = (a: number[], b: number[]): number => {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
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
export const measureSurface = (figure: HTMLElement): void => {
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
	for (const [r, g, b, a] of layers.reverse()) color = [r, g, b].map((value, k) => value * a + (color as number[])[k] * (1 - a));
	figure.style.setProperty("--_surface", `rgb(${color.slice(0, 3).map(Math.round).join(" ")})`);
};

/** The background of a chart: `--tablechart-surface` if it is set, or else the measured one. */
export const surfaceOf = (figure: HTMLElement): [number, number, number, number] =>
	resolve(figure, "var(--tablechart-surface, var(--_surface, Canvas))");

/** The bar or part of a stack that a number inside it belongs to. */
export const markOf = (figure: HTMLElement, value: HTMLElement): Element | null =>
	figure.querySelector(
		`:is(.tablechart-bar, .tablechart-piece)[data-row="${value.dataset.row}"]${value.dataset.series ? `[data-series="${value.dataset.series}"]` : ""}`
	);

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
	const values = figure.querySelectorAll<HTMLElement>(".tablechart-value[data-place='inside']");
	if (!values.length) return;
	const surface = surfaceOf(figure).slice(0, 3);
	// The point where black and white have the same contrast with a colour.
	const lightSurface = luminance(surface) > 0.179;
	const own = (name: string, fallback: number[]) => {
		const [r, g, b, a] = resolve(figure, `var(${name}, transparent)`);
		return a > 0 ? [r, g, b] : fallback;
	};
	const method = methodOf(figure);
	const needed = Number.parseFloat(getComputedStyle(figure).getPropertyValue("--tablechart-value-contrast")) || (method === 3 ? 60 : 5);
	const text = rgbOf(getComputedStyle(figure).color).slice(0, 3);
	const onDark = own("--tablechart-value-on-dark", lightSurface ? surface : text);
	const onLight = own("--tablechart-value-on-light", lightSurface ? text : surface);
	for (const value of values) {
		const mark = markOf(figure, value);
		if (!mark || value.hasAttribute("data-left-out")) continue;
		const fill = rgbOf(getComputedStyle(mark).fill);
		const best = contrastOf(method, onDark, fill) > contrastOf(method, onLight, fill) ? onDark : onLight;
		const ink = contrastOf(method, best, fill) >= needed ? best : blackOrWhite(fill, needed, method);
		value.style.setProperty("--_ink", `rgb(${ink.join(" ")})`);
	}
};
