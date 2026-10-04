import { BAR_CLASS, CONNECTOR_CLASS, RULE_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { tallEnough, tooWide } from "../functions/labels";
import { placeAt, svgEl, withRow } from "../functions/svg";
import type { ChartType, Geometry, Row, Segment } from "../types";

/**
 * Running totals.
 *
 * A row marked `data-kind="total"` is taken as given rather than derived. Real
 * figures are rounded before they reach a page, so the steps often sum to
 * something a tenth away from the total that was reported and signed off.
 * Deriving it would quietly publish a number nobody approved.
 */
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
	// Its totals stand on the baseline, so they can be cut from the bottom to give
	// the steps on top of them room. The scale refuses a break through a step.
	breakable: true,

	headroom: ({ labelHeight, badgeHeight, hasAnnotations, unit }) =>
		labelHeight + 6 * unit + (hasAnnotations ? badgeHeight * 1.6 : 0),

	draw({ segments: segs, cx, y, barWidth, height, unit, svg, values, breakAt }: Geometry) {
		const baseline = y(0);
		// If any number is wider than its bar, every number goes outside, so a narrow
		// chart does not mix the two.
		const narrow = tooWide(values, barWidth, unit);

		// A connector spans the gap and nothing else: it leaves one column's edge and
		// stops at the next one's, rather than running on behind it — which showed at
		// the last column, where the line lies level with the top of the block and has
		// nothing to hide it. It belongs to the column it leads into rather than the
		// one it leaves, so it takes that column's place in the build and arrives just
		// ahead of it.
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
					// A rising step leaves its opening total upwards, a falling one downwards.
					"data-grow": seg.kind === "down" ? "down" : "up",
					x: cx(i) - barWidth / 2,
					y: top,
					width: barWidth,
					height: Math.max(barHeight, 1),
					style: timing("--i", seg.slot),
				})
			);

			// Inside when the bar can hold its label, outside when it cannot. That is
			// what makes the thin steps readable without shrinking everything else.
			const label = values[i];
			// A bar cut by a break carries its number on top, clear of the cut, as a
			// column's does: in its middle it would sit on the zigzag.
			const cut =
				breakAt !== null &&
				Math.min(seg.from, seg.to) < breakAt &&
				Math.max(seg.from, seg.to) > breakAt;
			const inside = !cut && !narrow && tallEnough(label, barHeight, unit);
			label.dataset.place = inside ? "inside" : "outside";
			label.dataset.kind = seg.kind;
			// A label inside a bar is centred on the point it is given, and one outside it
			// stands on it. So inside is the bar's middle exactly; outside has to allow
			// for the label's own height when it hangs under a falling step.
			const ly = inside
				? top + barHeight / 2
				: seg.kind === "down"
					? top + barHeight + label.offsetHeight * unit + 3 * unit
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
