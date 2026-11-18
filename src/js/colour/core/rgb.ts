// Colours as numbers: red, green and blue from 0 to 255, and alpha from 0 to 1.
export type Colour = number[];

let canvas: CanvasRenderingContext2D | null = null;

/** Any CSS colour as `[red, green, blue, alpha]`, by painting it. */
export const rgbOf = (color: string): [number, number, number, number] => {
	canvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
	if (!canvas) return [0, 0, 0, 1];
	canvas.clearRect(0, 0, 1, 1);
	canvas.fillStyle = color;
	canvas.fillRect(0, 0, 1, 1);
	const [red, green, blue, alpha] = canvas.getImageData(0, 0, 1, 1).data;
	return [red, green, blue, alpha / 255];
};

/** A colour as CSS resolves it in `element`, so a variable, `light-dark()` or `Canvas` gets its value there. */
export const resolve = (element: HTMLElement, color: string): [number, number, number, number] => {
	const probe = document.createElement("span");
	probe.style.color = color;
	element.append(probe);
	const value = rgbOf(getComputedStyle(probe).color);
	probe.remove();
	return value;
};

/** A colour with alpha as it is seen over an opaque background. */
export const over = ([red, green, blue, alpha = 1]: Colour, background: Colour): Colour =>
	[red, green, blue].map((value, channel) => value * alpha + background[channel] * (1 - alpha));

/** A colour as a CSS value. */
export const css = (colour: Colour): string => `rgb(${colour.slice(0, 3).join(" ")})`;
