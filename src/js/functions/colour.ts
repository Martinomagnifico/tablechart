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

/** The contrast of two colours, as WCAG counts it: from 1 to 21. */
export const ratio = (a: number[], b: number[]): number => {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
};

/** The background of a chart, from `--tablechart-surface`. */
export const surfaceOf = (figure: HTMLElement): [number, number, number, number] => {
	const probe = document.createElement("span");
	probe.style.color = "var(--tablechart-surface, Canvas)";
	figure.append(probe);
	const surface = rgbOf(getComputedStyle(probe).color);
	probe.remove();
	return surface;
};

/** The bar or part of a stack that a number inside it belongs to. */
export const markOf = (figure: HTMLElement, value: HTMLElement): Element | null =>
	figure.querySelector(
		`:is(.tablechart-bar, .tablechart-piece)[data-row="${value.dataset.row}"]${value.dataset.series ? `[data-series="${value.dataset.series}"]` : ""}`
	);

/**
 * A number inside a bar is in the background colour if that has 4.5:1 with the bar, so it looks cut out of it. On a bar closer to
 * the background, it moves from there towards white (or black, on a dark background) only as far as needed; if even that is not
 * enough, it is black (or white). Set as `--_ink`, so the number still fades in with the chart.
 */
export const inkInside = (figure: HTMLElement): void => {
	const values = figure.querySelectorAll<HTMLElement>(".tablechart-value[data-place='inside']");
	if (!values.length) return;
	const surface = surfaceOf(figure);
	for (const value of values) {
		const mark = markOf(figure, value);
		if (!mark || value.hasAttribute("data-left-out")) continue;
		const fill = rgbOf(getComputedStyle(mark).fill);
		// The far end is the side of the background: white on a light background, black on a dark one.
		const light = luminance(surface) > luminance(fill);
		const far = light ? [255, 255, 255] : [0, 0, 0];
		let ink: number[] = light ? [0, 0, 0] : [255, 255, 255];
		for (let step = 0; step <= 20; step++) {
			const color = surface.slice(0, 3).map((value, k) => Math.round(value + ((far[k] - value) * step) / 20));
			if (ratio(color, fill) >= 4.5) {
				ink = color;
				break;
			}
		}
		value.style.setProperty("--_ink", `rgb(${ink.join(" ")})`);
	}
};
