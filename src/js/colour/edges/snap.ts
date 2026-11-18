// A column with an edge has its straight sides on whole pixels of the screen, so its edge is as sharp and as wide as on every other column.

/** Moves the sides of a rect to the nearest whole pixel of the screen; the move is less than half a pixel. */
export const snapToPixels = (mark: SVGGeometryElement, svg: SVGSVGElement): void => {
	if (mark.tagName !== "rect") return;
	const matrix = svg.getScreenCTM();
	if (!matrix || !matrix.a || !matrix.d) return;

	const ratio = window.devicePixelRatio || 1;
	// A place in the drawing, rounded to a pixel of the screen, and back in the drawing.
	const snapX = (value: number) => (Math.round((matrix.a * value + matrix.e) * ratio) / ratio - matrix.e) / matrix.a;
	const snapY = (value: number) => (Math.round((matrix.d * value + matrix.f) * ratio) / ratio - matrix.f) / matrix.d;

	const x = Number(mark.getAttribute("x"));
	const y = Number(mark.getAttribute("y"));
	const right = snapX(x + Number(mark.getAttribute("width")));
	const bottom = snapY(y + Number(mark.getAttribute("height")));
	const left = snapX(x);
	const top = snapY(y);

	mark.setAttribute("x", String(Number(left.toFixed(3))));
	mark.setAttribute("y", String(Number(top.toFixed(3))));
	mark.setAttribute("width", String(Number(Math.max(0, right - left).toFixed(3))));
	mark.setAttribute("height", String(Number(Math.max(0, bottom - top).toFixed(3))));
};
