/** An easing as the four numbers of `cubic-bezier()`. */
type Curve = [number, number, number, number];
type Point = [number, number];

const DEFAULT: Curve = [0.26, 0.86, 0.44, 0.985];
const KEYWORDS: Record<string, Curve> = {
	linear: [0, 0, 1, 1],
	ease: [0.25, 0.1, 0.25, 1],
	"ease-in": [0.42, 0, 1, 1],
	"ease-out": [0, 0, 0.58, 1],
	"ease-in-out": [0.42, 0, 0.58, 1],
};

/** The easing a chart uses, from `--tablechart-easing`; a value it cannot read gives the default. */
const curveOf = (element: Element): Curve => {
	const asked = getComputedStyle(element).getPropertyValue("--tablechart-easing").trim();
	if (KEYWORDS[asked]) return KEYWORDS[asked];
	const numbers = asked.match(/^cubic-bezier\(([^)]+)\)$/)?.[1].split(",").map(Number);
	return numbers?.length === 4 && numbers.every(Number.isFinite) ? (numbers as Curve) : DEFAULT;
};

const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;

// Where on the curve the progress reaches `y`.
const solve = (curve: Curve, y: number): number => {
	let lo = 0;
	let hi = 1;
	for (let k = 0; k < 40; k++) {
		const mid = (lo + hi) / 2;
		if (at(curve[1], curve[3], mid) < y) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
};

const lerp = (a: Point, b: Point, s: number): Point => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];

// A curve cut in two at `s`.
const split = (p: Point[], s: number) => {
	const a = lerp(p[0], p[1], s);
	const b = lerp(p[1], p[2], s);
	const c = lerp(p[2], p[3], s);
	const d = lerp(a, b, s);
	const e = lerp(b, c, s);
	const f = lerp(d, e, s);
	return { before: [p[0], a, d, f], after: [f, e, c, p[3]] };
};

/** The part of one eased sweep that runs from `from` to `from + share`: when it starts and how long it takes, as shares of the sweep, and its own piece of the curve. */
const pieceOf = (curve: Curve, from: number, share: number) => {
	const s0 = solve(curve, Math.min(from, 1));
	const s1 = solve(curve, Math.min(from + share, 1));
	const tail = split([[0, 0], [curve[0], curve[1]], [curve[2], curve[3]], [1, 1]], s0).after;
	const [q0, q1, q2, q3] = split(tail, s0 < 1 ? (s1 - s0) / (1 - s0) : 0).before;
	const width = q3[0] - q0[0];
	const height = q3[1] - q0[1];
	if (width <= 0 || height <= 0) return { start: q0[0], span: Math.max(width, 0), easing: "linear" };
	const x = (p: Point) => Math.min(Math.max((p[0] - q0[0]) / width, 0), 1);
	const y = (p: Point) => (p[1] - q0[1]) / height;
	return { start: q0[0], span: width, easing: `cubic-bezier(${[x(q1), y(q1), x(q2), y(q2)].map((n) => n.toFixed(3)).join(", ")})` };
};

/**
 * The timing of every slice of a donut, from the shares of the ring before it, its own share, and the shares that draw together.
 * At a stagger ratio of 1 they are one sweep with the chart's easing, each slice with its piece of the curve;
 * below 1 the slices overlap, so each eases on its own.
 */
export const donutTiming = (element: Element) => {
	const curve = curveOf(element);
	const asked = Number.parseFloat(getComputedStyle(element).getPropertyValue("--tablechart-stagger-ratio"));
	const sweep = !Number.isFinite(asked) || asked >= 1;
	return (from: number, share: number, together = 1) => {
		if (!sweep || together <= 0) return { start: from, span: share, easing: `cubic-bezier(${curve.join(", ")})` };
		const piece = pieceOf(curve, from / together, share / together);
		return { ...piece, start: piece.start * together, span: piece.span * together };
	};
};
