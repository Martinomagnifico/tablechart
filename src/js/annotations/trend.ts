import { HEAD_CLASS, LINE_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { placeAt, svgEl } from "../functions/svg";
import type { AnnotationType, Geometry } from "../types";
import { checkAgainst, createBadge } from "./badge";

const cagr = (from: number, to: number, years: number): number =>
	(Math.pow(to / from, 1 / years) - 1) * 100;

/**
 * An arrow across the whole series, for the growth it adds up to.
 *
 * It runs from the first value to the last, and is lifted clear of the bars and
 * run a little past both ends, so it reads as a trend through the period rather
 * than a line joining two bars. Because it comes from the data, correcting a
 * number moves the arrow with it.
 *
 * `data-years` is the compounding period, and it has to be given: it cannot be
 * counted off the categories, since a page's last column is often a half year.
 * It is used only to check the rate the author wrote, never to replace it.
 *
 * ```html
 * <span data-annotation="trend" data-years="9" data-at="0.46">
 *   <span class="tablechart-caption" data-i18n="pertree-rate-caption">A year</span>
 *   <span data-i18n="pertree-rate-value">+11%</span>
 * </span>
 * ```
 */
export const trend: AnnotationType = {
	create: createBadge,

	draw(spec: HTMLElement, badge: HTMLElement | null, geo: Geometry) {
		const { rows, cx, y, unit, labelHeight, height, svg, values, after } = geo;
		const first = rows[0];
		const last = rows[rows.length - 1];
		if (!first || !last) return;

		// Clear of the numbers by more than a hair: the lift is a label's height plus
		// the room a label already leaves above its own mark, and then some daylight.
		const lift = labelHeight + 18 * unit;
		const overhang = 10 * unit;
		const head = 10 * unit;

		let x1 = cx(0);
		let y1 = y(first.value) - lift;
		let x2 = cx(rows.length - 1);
		let y2 = y(last.value) - lift;

		// It has to clear every number it flies over, not only the two it is drawn
		// between: a series that dips in the middle puts a number above the line
		// joining its ends, and the arrow would go straight through it.
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

		// The badge is centred on the arrow, so its lower half hangs below the line.
		// If it would come too close to a number under it, the arrow and the badge
		// both move up.
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
				// A label ends a few units above its value: 4 on a column, 7 on a line.
				const labelTop = y(row.value) - 7 * unit - labelHeight;
				raise = Math.max(raise, bottom - labelTop);
			});
			y1 -= raise;
			y2 -= raise;
		}

		const shaftX = x2 - ux * head;
		const shaftY = y2 - uy * head;
		// In pixels: the stroke does not scale, so its dashes are measured in the space
		// the figure ended up at. See `line.ts`, which has the same trouble.
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

		// The head, as a triangle turned onto the line's own direction.
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
			// Measured along the line as drawn, overhang included, so `data-at="0.5"`
			// really is the middle of the arrow the reader sees.
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
