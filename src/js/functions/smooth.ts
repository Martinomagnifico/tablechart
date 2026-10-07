// Monotone cubic interpolation, as d3's `curveMonotoneX`: the curve never overshoots its points.

const sign = (n: number): number => (n < 0 ? -1 : 1);

/** The slope at each point of one run without gaps; `xs` grows from left to right. */
export function monotoneTangents(xs: number[], ys: number[]): number[] {
	const n = xs.length;
	if (n < 2) return xs.map(() => 0);
	const secant = (i: number) => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1);
	const tangents = new Array<number>(n).fill(0);

	// No steeper than either side, and flat at a peak or a dip, so the curve does not overshoot.
	for (let i = 1; i < n - 1; i++) {
		const h0 = xs[i] - xs[i - 1];
		const h1 = xs[i + 1] - xs[i];
		const s0 = secant(i - 1);
		const s1 = secant(i);
		const p = (s0 * h1 + s1 * h0) / (h0 + h1 || 1);
		tangents[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
	}

	const end = (i: number, j: number, inner: number) => {
		const h = xs[j] - xs[i];
		return h ? (3 * (ys[j] - ys[i])) / h / 2 - inner / 2 : inner;
	};
	if (n === 2) {
		tangents[0] = tangents[1] = secant(0);
	} else {
		tangents[0] = end(0, 1, tangents[1]);
		tangents[n - 1] = end(n - 2, n - 1, tangents[n - 2]);
	}
	return tangents;
}


export function controls(
	[xa, ya]: [number, number],
	[xb, yb]: [number, number],
	ma: number,
	mb: number
): [[number, number], [number, number]] {
	const third = (xb - xa) / 3;
	return [
		[xa + third, ya + ma * third],
		[xb - third, yb - mb * third],
	];
}

export const fixed = (n: number) => Number(n.toFixed(2));

export function curveTo(a: [number, number], b: [number, number], ma: number, mb: number): string {
	const [c1, c2] = controls(a, b, ma, mb);
	return `C${fixed(c1[0])},${fixed(c1[1])} ${fixed(c2[0])},${fixed(c2[1])} ${fixed(b[0])},${fixed(b[1])}`;
}

/** Measured in short straight steps. */
export function curveLength(a: [number, number], b: [number, number], ma: number, mb: number, steps = 24): number {
	const [[x1, y1], [x2, y2]] = controls(a, b, ma, mb);
	const at = (t: number): [number, number] => {
		const u = 1 - t;
		return [
			u * u * u * a[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * b[0],
			u * u * u * a[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * b[1],
		];
	};
	let length = 0;
	let [px, py] = a;
	for (let k = 1; k <= steps; k++) {
		const [x, y] = at(k / steps);
		length += Math.hypot(x - px, y - py);
		[px, py] = [x, y];
	}
	return length;
}

/** Each run of rows without a gap is a curve of its own; a row in a gap gets 0. */
export function tangentsWithGaps(
	count: number,
	gone: (i: number) => boolean,
	point: (i: number) => [number, number]
): number[] {
	const tangents = new Array<number>(count).fill(0);
	let run: number[] = [];
	const flush = () => {
		if (run.length) {
			const xs = run.map((i) => point(i)[0]);
			const ys = run.map((i) => point(i)[1]);
			monotoneTangents(xs, ys).forEach((m, k) => {
				tangents[run[k]] = m;
			});
		}
		run = [];
	};
	for (let i = 0; i < count; i++) {
		if (gone(i)) flush();
		else run.push(i);
	}
	flush();
	return tangents;
}
