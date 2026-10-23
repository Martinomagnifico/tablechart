import { LIBRARY_NAME, REFERENCE_CLASS, VIEWBOX_WIDTH } from "../config";
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
			value = valueOf(asked, shown.map((row) => row.value), shown.map(() => 1));
			across = !x;
			at = value === null ? null : x ? x(value) : y(value);
		}
		if (at === null || value === null) {
			console.warn(`[${LIBRARY_NAME}] A reference line needs a number, "mean" or "median", not "${asked}".`);
			return;
		}

		// From the left edge to the last band, or from the top to the baseline.
		const end = rows.length > 0 ? cx(rows.length - 1) + cx(0) : VIEWBOX_WIDTH;
		const foot = x ? height : y(0);
		svg.appendChild(
			svgEl("line", {
				class: REFERENCE_CLASS,
				"data-note": geo.note,
				...(spec.getAttribute("data-line") === "dotted" && { "data-line": "dotted" }),
				...(across ? { x1: 0, x2: end, y1: at, y2: at } : { x1: at, x2: at, y1: 0, y2: foot }),
				style: timing("--after", after),
			})
		);

		// On the line near its end, where the line is cut out under it; else beside the line, or a line lower, clear of other labels.
		if (badge) {
			const w = sizeOf(badge).width * unit;
			const h = sizeOf(badge).height * unit;
			const gap = 4 * unit;
			const candidates: Box[] = across
				? [[end - w, at - h / 2, w, h], [end - w, at - h - gap, w, h], [end - w, at + gap, w, h]]
				: [0, h, 2 * h].flatMap((top): Box[] => [[at - w / 2, top, w, h], [at + gap, top, w, h], [at - gap - w, top, w, h]]);
			const [pick] = avoidCollisions([candidates], geo.taken, [0, 0, VIEWBOX_WIDTH, height]);
			const box = candidates[pick ?? 0];
			geo.taken.push(box);
			placeAt(badge, box[0] + w / 2, box[1] + h / 2, VIEWBOX_WIDTH, height);
			badge.style.setProperty("--after", String(after));
			if (asked === "mean" || asked === "median") checkAgainst(badge, value, `the ${asked}`, geo, "");
		}
	},
};
