import { sizeOf } from "../functions/measure";
import { BAR_CLASS, CONNECTOR_CLASS, RULE_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { tallEnough, tooWide } from "../functions/labels";
import { placeAt, svgEl, withRow } from "../functions/svg";
import type { ChartType, Geometry, Row, Segment } from "../types";

/** A total row is taken as given, not summed: rounded steps often miss the reported total by a tenth. */
const segments = (rows: Row[]): Segment[] => {
	let running = 0;
	return rows.map((row) => {
		if (row.isTotal) {
			running = row.value;
			return { ...row, from: 0, to: row.value, kind: "total" as const };
		}
		const from = running;
		running += row.value;
		return {
			...row,
			from,
			to: running,
			kind: row.value >= 0 ? ("up" as const) : ("down" as const),
		};
	});
};

export const waterfall: ChartType = {
	segments,
	// Its totals stand on the baseline; the scale refuses a break through a floating step.
	breakable: true,

	headroom: ({ labelHeight, badgeHeight, hasAnnotations, unit }) =>
		labelHeight + 6 * unit + (hasAnnotations ? badgeHeight * 1.6 : 0),

	draw({ segments: segs, cx, y, barWidth, height, unit, svg, values, breakAt }: Geometry) {
		const baseline = y(0);
		// If any number is wider than its bar, every number goes outside, so a narrow chart does not mix the two.
		const narrow = tooWide(values, barWidth, unit);

		// A connector spans only the gap to the next column, and arrives with that column.
		segs.forEach((seg, i) => {
			const next = segs[i + 1];
			if (!next) return;
			const level = y(seg.to);
			const x1 = cx(i) + barWidth / 2;
			const x2 = cx(i + 1) - barWidth / 2;
			svg.appendChild(
				svgEl("line", {
					class: CONNECTOR_CLASS,
					x1,
					x2,
					y1: level,
					y2: level,
					"data-row": i + 2,
					style: timing("--i", next.slot),
				})
			);
		});

		segs.forEach((seg, i) => {
			const top = y(Math.max(seg.from, seg.to));
			const barHeight = Math.abs(y(seg.from) - y(seg.to));
			svg.appendChild(
				svgEl("rect", {
					class: withRow(BAR_CLASS, seg),
					"data-kind": seg.kind,
					"data-row": i + 1,
					"data-grow": seg.kind === "down" ? "down" : "up",
					x: cx(i) - barWidth / 2,
					y: top,
					width: barWidth,
					height: Math.max(barHeight, 1),
					style: timing("--i", seg.slot),
				})
			);

			const label = values[i];
			// A bar cut by a break has its number on top, clear of the cut.
			const cut =
				breakAt !== null &&
				Math.min(seg.from, seg.to) < breakAt &&
				Math.max(seg.from, seg.to) > breakAt;
			const inside = !cut && !narrow && tallEnough(label, barHeight, unit);
			label.dataset.place = inside ? "inside" : "outside";
			label.dataset.kind = seg.kind;
			// A label outside a falling step hangs below it, so its own height is added.
			const ly = inside
				? top + barHeight / 2
				: seg.kind === "down"
					? top + barHeight + sizeOf(label).height * unit + 3 * unit
					: top - 3 * unit;
			placeAt(label, cx(i), ly, VIEWBOX_WIDTH, height);
		});

		svg.appendChild(
			svgEl("line", {
				class: RULE_CLASS,
				x1: 0,
				x2: VIEWBOX_WIDTH,
				y1: baseline,
				y2: baseline,
			})
		);
	},
};
