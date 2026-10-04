import { HEAD_CLASS, LINE_CLASS, PLUGIN_ID, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { placeAt, svgEl } from "../functions/svg";
import type { AnnotationType, Geometry } from "../types";
import { checkAgainst, createBadge } from "./badge";

const pctChange = (from: number, to: number): number => ((to - from) / Math.abs(from)) * 100;

/**
 * A change from one bar to another: up the near side, across, and back down at
 * the far one with an arrowhead.
 *
 * It anchors to two categories by index rather than by label, because a label is
 * translated and an index is not. Both default to the first and last row, so on a
 * two-bar chart it needs no attributes at all.
 *
 * ```html
 * <div class="chart-annotations">
 *   <span data-annotation="bracket" data-i18n="juice-change">+11%</span>
 * </div>
 * ```
 */
/**
 * The two rows a bracket spans, as positions from 0. `data-from` and `data-to` are
 * row numbers that start at 1, as people count. Without them, the first and the
 * last row.
 */
export const bracketRows = (spec: HTMLElement, count: number): [number, number] => {
	const read = (name: string, fallback: number) => {
		const asked = Number.parseInt(spec.getAttribute(name) ?? "", 10);
		return Number.isFinite(asked) ? asked - 1 : fallback;
	};
	return [read("data-from", 0), read("data-to", count - 1)];
};

export const bracket: AnnotationType = {
	create: createBadge,

	draw(spec: HTMLElement, badge: HTMLElement | null, geo: Geometry) {
		const { rows, cx, y, unit, labelHeight, badgeHeight, height, svg, after } = geo;

		const [i1, i2] = bracketRows(spec, rows.length);
		const a = rows[i1];
		const b = rows[i2];
		if (!a || !b) {
			console.warn(
				`[${PLUGIN_ID}] A bracket points at a row that is not there (row ${i1 + 1} to ${i2 + 1}, of ${rows.length}).`
			);
			return;
		}

		const head = 7 * unit;
		const gap = 4 * unit;
		const x1 = cx(i1);
		const x2 = cx(i2);
		// Clear of whichever bar is taller, and of the labels sitting above them.
		const top = Math.min(y(a.value), y(b.value)) - labelHeight - gap - badgeHeight * 0.9;
		const foot = (value: number) => y(value) - labelHeight - gap;

		const d = `M ${x1} ${foot(a.value)} L ${x1} ${top} L ${x2} ${top} L ${x2} ${foot(b.value) - head}`;
		// In pixels, for the same reason the trend's is: a stroke that does not scale
		// is dashed in the space the figure is drawn at.
		const len =
			(foot(a.value) - top + Math.abs(x2 - x1) + (foot(b.value) - head - top)) / unit + 1;

		svg.appendChild(
			svgEl("path", {
				class: LINE_CLASS,
				"data-note": geo.note,
				d,
				style: `--len:${len.toFixed(1)}; ${timing("--after", after)}`,
			})
		);

		// The head points at the bar the change lands on.
		const ty = foot(b.value);
		svg.appendChild(
			svgEl("polygon", {
				class: HEAD_CLASS,
				"data-note": geo.note,
				points: `${x2},${ty} ${x2 - head * 0.45},${ty - head} ${x2 + head * 0.45},${ty - head}`,
				style: timing("--after", after),
			})
		);

		if (badge) {
			placeAt(badge, (x1 + x2) / 2, top, VIEWBOX_WIDTH, height);
			badge.style.setProperty("--after", String(after));
		}

		checkAgainst(badge, pctChange(a.value, b.value), `${a.value} to ${b.value}`, geo);
	},
};
