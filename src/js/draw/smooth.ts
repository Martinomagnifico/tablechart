// Monotone cubic interpolation, as d3's `curveMonotoneX`: the curve never overshoots its points.

type Point = [number, number];

/** Two decimals are enough for a path, and keep it short. */
export const fixed = (n: number): number => Number(n.toFixed(2));

/** The slope of the curve at each point of one run without gaps. `xs` grows from left to right. */
export function monotoneTangents(xs: number[], ys: number[]): number[] {
	const count = xs.length;
	if (count < 2) return xs.map(() => 0);

	// The slope of the straight line from point i to point i + 1.
	const slopeFrom = (i: number): number => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1);
	const tangents = new Array<number>(count).fill(0);

	for (let i = 1; i < count - 1; i++) {
		const slopeBefore = slopeFrom(i - 1);
		const slopeAfter = slopeFrom(i);

		// At a peak, a dip or the edge of a flat stretch, the curve is flat, so it does not overshoot.
		if (slopeBefore * slopeAfter <= 0) continue;

		const widthBefore = xs[i] - xs[i - 1];
		const widthAfter = xs[i + 1] - xs[i];
		const weighted = (slopeBefore * widthAfter + slopeAfter * widthBefore) / (widthBefore + widthAfter || 1);
		const steepest = Math.min(2 * Math.abs(slopeBefore), 2 * Math.abs(slopeAfter), Math.abs(weighted));
		tangents[i] = Math.sign(slopeBefore) * steepest || 0;
	}

	if (count === 2) {
		tangents[0] = slopeFrom(0);
		tangents[1] = slopeFrom(0);
		return tangents;
	}

	// An end point has one neighbour, so its slope follows from the line to it and that neighbour's slope.
	const endSlope = (from: number, to: number, neighbour: number): number => {
		const width = xs[to] - xs[from];
		if (!width) return neighbour;
		const slope = (ys[to] - ys[from]) / width;
		return (3 * slope - neighbour) / 2;
	};
	tangents[0] = endSlope(0, 1, tangents[1]);
	tangents[count - 1] = endSlope(count - 2, count - 1, tangents[count - 2]);
	return tangents;
}

/** The two control points of the cubic Bézier from `start` to `end`, with the slope at each end. */
export function controls(start: Point, end: Point, startSlope: number, endSlope: number): [Point, Point] {
	const third = (end[0] - start[0]) / 3;
	return [
		[start[0] + third, start[1] + startSlope * third],
		[end[0] - third, end[1] - endSlope * third],
	];
}

/** The `C` command of a path from `start` to `end`, for after a path that is at `start`. */
export function curveTo(start: Point, end: Point, startSlope: number, endSlope: number): string {
	const [first, second] = controls(start, end, startSlope, endSlope);
	const point = ([x, y]: Point) => `${fixed(x)},${fixed(y)}`;
	return `C${point(first)} ${point(second)} ${point(end)}`;
}

/** The length of the curve, measured in short straight steps along it. */
export function curveLength(start: Point, end: Point, startSlope: number, endSlope: number, steps = 24): number {
	const [first, second] = controls(start, end, startSlope, endSlope);

	// The point at `t` along the curve, from 0 at the start to 1 at the end.
	const pointAt = (t: number): Point => {
		const u = 1 - t;
		const mix = (a: number, b: number, c: number, d: number) =>
			u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
		return [mix(start[0], first[0], second[0], end[0]), mix(start[1], first[1], second[1], end[1])];
	};

	let length = 0;
	let previous = start;
	for (let step = 1; step <= steps; step++) {
		const next = pointAt(step / steps);
		length += Math.hypot(next[0] - previous[0], next[1] - previous[1]);
		previous = next;
	}
	return length;
}

/** The slope at every row of one line. Each run of rows without a gap is a curve of its own; a row in a gap gets 0. */
export function tangentsWithGaps(count: number, gone: (row: number) => boolean, pointOf: (row: number) => Point): number[] {
	const tangents = new Array<number>(count).fill(0);
	let run: number[] = [];

	const finishRun = () => {
		const xs = run.map((row) => pointOf(row)[0]);
		const ys = run.map((row) => pointOf(row)[1]);
		monotoneTangents(xs, ys).forEach((tangent, k) => {
			tangents[run[k]] = tangent;
		});
		run = [];
	};

	for (let row = 0; row < count; row++) {
		if (gone(row)) finishRun();
		else run.push(row);
	}
	finishRun();
	return tangents;
}
