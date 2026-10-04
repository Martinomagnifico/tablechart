import { HEAD_CLASS, LINE_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { placeAt, svgEl } from "../functions/svg";
import type { AnnotationType, Geometry } from "../types";
import { checkAgainst, createBadge } from "./badge";

const cagr = (from: number, to: number, years: number): number =>
	(Math.pow(to / from, 1 / years) - 1) * 100;

/** `data-years` has to be given, since the last column is often a half year. It only checks the author's rate. */
export const trend: AnnotationType = {
	create: createBadge,

	draw(spec: HTMLElement, badge: HTMLElement | null, geo: Geometry) {
		const { rows, cx, y, unit, labelHeight, height, svg, values, after } = geo;
		const first = rows[0];
		const last = rows[rows.length - 1];
		if (!first || !last) return;

		const lift = labelHeight + 18 * unit;
		const overhang = 10 * unit;
		const head = 10 * unit;

		let x1 = cx(0);
		let y1 = y(first.value) - lift;
		let x2 = cx(rows.length - 1);
		let y2 = y(last.value) - lift;

		// Lifted over every number below it, not only the two at its ends.
		let clearance = 0;
		rows.forEach((row, i) => {
			const along = x2 === x1 ? 0 : (cx(i) - x1) / (x2 - x1);
			const overhead = y1 + along * (y2 - y1) - (y(row.value) - lift);
			if (overhead > clearance) clearance = overhead;
		});
		y1 -= clearance;
		y2 -= clearance;

		const dx = x2 - x1;
		const dy = y2 - y1;
		const length = Math.hypot(dx, dy) || 1;
		const ux = dx / length;
		const uy = dy / length;

		x1 -= ux * overhang;
		y1 -= uy * overhang;
		x2 += ux * overhang;
		y2 += uy * overhang;

		// If the badge would come too close to a number under it, the arrow and the badge move up.
		const t = Number.parseFloat(spec.getAttribute("data-at") || "0.5");
		if (badge) {
			const bx = x1 + (x2 - x1) * t;
			const by = y1 + (y2 - y1) * t;
			const halfWidth = (badge.offsetWidth * unit) / 2;
			const bottom = by + (badge.offsetHeight * unit) / 2 + 8 * unit;
			let raise = 0;
			rows.forEach((row, i) => {
				const halfLabel = ((values[i]?.offsetWidth || 0) * unit) / 2;
				if (Math.abs(cx(i) - bx) >= halfWidth + halfLabel) return;
				const labelTop = y(row.value) - 7 * unit - labelHeight;
				raise = Math.max(raise, bottom - labelTop);
			});
			y1 -= raise;
			y2 -= raise;
		}

		const shaftX = x2 - ux * head;
		const shaftY = y2 - uy * head;
		// In pixels: a stroke that does not scale is dashed at the size the figure is shown.
		const drawn = Math.hypot(shaftX - x1, shaftY - y1) / unit + 1;

		svg.appendChild(
			svgEl("line", {
				class: LINE_CLASS,
				"data-note": geo.note,
				x1,
				y1,
				x2: shaftX,
				y2: shaftY,
				style: `--len:${drawn.toFixed(1)}; ${timing("--after", after)}`,
			})
		);

		const nx = -uy;
		const ny = ux;
		const w = head * 0.42;
		svg.appendChild(
			svgEl("polygon", {
				class: HEAD_CLASS,
				"data-note": geo.note,
				points: [
					`${x2},${y2}`,
					`${shaftX + nx * w},${shaftY + ny * w}`,
					`${shaftX - nx * w},${shaftY - ny * w}`,
				].join(" "),
				style: timing("--after", after),
			})
		);

		if (badge) {
			// Along the line as drawn, overhang included, so `data-at="0.5"` is the middle the reader sees.
			placeAt(badge, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, VIEWBOX_WIDTH, height);
			badge.style.setProperty("--after", String(after));
		}

		const years = Number.parseFloat(spec.getAttribute("data-years") || "");
		if (!Number.isNaN(years) && years > 0) {
			checkAgainst(
				badge,
				cagr(first.value, last.value, years),
				`${first.value} to ${last.value} over ${years} years`,
				geo
			);
		}
	},
};
