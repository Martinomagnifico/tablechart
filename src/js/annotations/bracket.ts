import { HEAD_CLASS, LINE_CLASS, LIBRARY_NAME, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { placeAt, svgEl } from "../functions/svg";
import type { AnnotationType, Geometry } from "../types";
import { checkAgainst, createBadge } from "./badge";

const pctChange = (from: number, to: number): number => ((to - from) / Math.abs(from)) * 100;

/** `data-from` and `data-to` count rows from 1, by index because a label is translated. Default: first to last. */
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
				`[${LIBRARY_NAME}] A bracket points at a row that is not there (row ${i1 + 1} to ${i2 + 1}, of ${rows.length}).`
			);
			return;
		}

		const head = 7 * unit;
		const gap = 4 * unit;
		const x1 = cx(i1);
		const x2 = cx(i2);
		const top = Math.min(y(a.value), y(b.value)) - labelHeight - gap - badgeHeight * 0.9;
		const foot = (value: number) => y(value) - labelHeight - gap;

		const d = `M ${x1} ${foot(a.value)} L ${x1} ${top} L ${x2} ${top} L ${x2} ${foot(b.value) - head}`;
		// In pixels: a stroke that does not scale is dashed at the size the figure is shown.
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
