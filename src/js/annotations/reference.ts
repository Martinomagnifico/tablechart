import { LIBRARY_NAME, POINT_CLASS, REFERENCE_CLASS, VIEWBOX_WIDTH } from "../config";
import { avoidCollisions, type Box } from "../functions/collision";
import { numberIn } from "../functions/format";
import { sizeOf } from "../functions/measure";
import { timing } from "../functions/timing";
import { placeAt, svgEl } from "../functions/svg";
import type { AnnotationType, Geometry } from "../types";
import { checkAgainst, createBadge } from "./badge";

/** The mean or the median of `numbers`, each counted `weights` times, or the number the author wrote. */
const valueOf = (asked: string, numbers: number[], weights: number[]): number | null => {
	const total = weights.reduce((sum, w) => sum + w, 0);
	if (asked === "mean") return total ? numbers.reduce((sum, n, i) => sum + n * weights[i], 0) / total : null;
	if (asked === "median") {
		const sorted = numbers.map((n, i) => [n, weights[i]]).sort((a, b) => a[0] - b[0]);
		let reached = 0;
		for (const [k, [n, w]] of sorted.entries()) {
			reached += w;
			// Exactly half way: between this number and the next.
			if (Math.abs(reached - total / 2) < 1e-9 && sorted[k + 1]) return (n + sorted[k + 1][0]) / 2;
			if (reached > total / 2) return n;
		}
		return null;
	}
	const value = Number.parseFloat(asked);
	return Number.isFinite(value) ? value : null;
};

/**
 * A line at a value: `data-value` on the value axis, or `data-name` among names that are numbers, such as a count per number of sources.
 * `mean` and `median` are worked out from the table; among the names, each name counts as often as its value says.
 */
export const reference: AnnotationType = {
	create(spec, plot) {
		if (!spec.textContent?.trim()) return null;
		const badge = createBadge(spec, plot);
		badge.dataset.kind = "reference";
		return badge;
	},

	draw(spec: HTMLElement, badge: HTMLElement | null, geo: Geometry) {
		const { rows, cx, y, x, height, unit, svg, after } = geo;
		const shown = rows.filter((row) => !row.isTotal && !row.missing);
		const byName = spec.hasAttribute("data-name");
		const asked = (spec.getAttribute(byName ? "data-name" : "data-value") ?? "").trim();

		// Along the value axis: up a bar chart, across the others.
		let across: boolean;
		let at: number | null;
		let value: number | null;
		if (byName) {
			const names = shown.map((row) => numberIn(row.label));
			if (geo.categories[0]?.parentElement?.dataset.place === "beside" || names.some(Number.isNaN)) {
				console.warn(`[${LIBRARY_NAME}] A reference line among the names needs names that are numbers, under columns or points.`);
				return;
			}
			const v = valueOf(asked, names, shown.map((row) => row.value));
			// Between the two names around it, as if the names were a scale.
			const k = v === null ? -1 : names.findIndex((n, i) => n <= v && v <= (names[i + 1] ?? n));
			const [here, next] = [shown[k], shown[k + 1] ?? shown[k]].map((row) => cx(rows.indexOf(row)));
			const share = v === null || k < 0 || names[k + 1] === undefined || names[k + 1] === names[k] ? 0 : (v - names[k]) / (names[k + 1] - names[k]);
			value = v;
			at = k < 0 ? null : here + share * (next - here);
			across = false;
		} else {
			// `data-axis="y"` on a scatter chart: a line across, at a value of the axis up. The mean and the median are of that column.
			const up = Boolean(geo.frame) && spec.getAttribute("data-axis") === "y";
			const column = geo.frame ? (geo.series.flatMap((one, s) => (one.group ? [] : [s]))[up ? 1 : 0] ?? 0) : 0;
			value = valueOf(asked, shown.map((row) => row.cells[column]?.value ?? row.value), shown.map(() => 1));
			across = up || !x;
			at = value === null ? null : x && !up ? x(value) : y(value);
		}
		if (at === null || value === null) {
			console.warn(`[${LIBRARY_NAME}] A reference line needs a number, "mean" or "median", not "${asked}".`);
			return;
		}

		// Inside the axes on a chart that has them; else from the left edge to the last band, or from the top to the baseline.
		const [left, top, right, foot] = geo.frame
			? [geo.frame[0], geo.frame[1], geo.frame[0] + geo.frame[2], geo.frame[1] + geo.frame[3]]
			: [0, 0, rows.length > 0 ? cx(rows.length - 1) + cx(0) : VIEWBOX_WIDTH, x ? height : y(0)];
		// Under the points and markers, so a small marker on the line stays visible; over bars and lines.
		svg.insertBefore(
			svgEl("line", {
				class: REFERENCE_CLASS,
				"data-note": geo.note,
				...(spec.getAttribute("data-line") === "dotted" && { "data-line": "dotted" }),
				...(across ? { x1: left, x2: right, y1: at, y2: at } : { x1: at, x2: at, y1: top, y2: foot }),
				style: timing("--after", after),
			}),
			svg.querySelector(`:scope > .${POINT_CLASS}`)
		);

		// On the line near its end, where the line is cut out under it; else beside the line, or a line lower, clear of other labels.
		if (badge) {
			const w = sizeOf(badge).width * unit;
			const h = sizeOf(badge).height * unit;
			const gap = 4 * unit;
			const candidates: Box[] = across
				? [[right - w, at - h / 2, w, h], [right - w, at - h - gap, w, h], [right - w, at + gap, w, h]]
				: [top, top + h, top + 2 * h].flatMap((y0): Box[] => [[at - w / 2, y0, w, h], [at + gap, y0, w, h], [at - gap - w, y0, w, h]]);
			const [pick] = avoidCollisions([candidates], geo.taken, [0, 0, VIEWBOX_WIDTH, height]);
			const box = candidates[pick ?? 0];
			geo.taken.push(box);
			placeAt(badge, box[0] + w / 2, box[1] + h / 2, VIEWBOX_WIDTH, height);
			badge.style.setProperty("--after", String(after));
			if (asked === "mean" || asked === "median") checkAgainst(badge, value, `the ${asked}`, geo, "");
		}
	},
};
