import { sizeOf } from "../functions/measure";
import { BAR_CLASS, CONNECTOR_CLASS, LIBRARY_NAME, RULE_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { tallEnough, tooWide } from "../functions/labels";
import { placeAt, svgEl, withRow } from "../functions/svg";
import type { ChartType, Geometry, Row, Segment } from "../types";

// Each mismatch is reported once, not again at every layout.
const reported = new Set<string>();

/** The author's total always wins; a total that is more than 1% off the steps before it is only reported in the console. */
const checkTotal = (stated: number, computed: number): void => {
	if (Math.abs(stated - computed) <= Math.abs(computed) / 100) return;
	const message =
		`[${LIBRARY_NAME}] A total reads ${stated}, but the steps before it add up to ` +
		`${Number(computed.toFixed(6))}. The chart shows what you wrote; this is only a check.`;
	if (reported.has(message)) return;
	reported.add(message);
	console.warn(message);
};

/** A total row is taken as given, not summed: rounded steps often miss the reported total by a tenth. */
const segments = (rows: Row[]): Segment[] => {
	let running = 0;
	let stepped = false;
	return rows.map((row) => {
		if (row.isTotal) {
			if (stepped) checkTotal(row.value, running);
			stepped = false;
			running = row.value;
			return { ...row, from: 0, to: row.value, kind: "total" as const };
		}
		const from = running;
		running += row.value;
		stepped = true;
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

	draw({ segments: segs, cx, y, barWidth, height, unit, svg, values, breakAt, closing, insideAlign }: Geometry) {
		const baseline = y(0);
		// If any number is wider than its bar, every number goes outside, so a narrow chart does not mix the two.
		const narrow = tooWide(values, barWidth, unit);
		const align = insideAlign ?? "center";

		const bars = segs.map((seg, i) => {
			const top = y(Math.max(seg.from, seg.to));
			const length = Math.abs(y(seg.from) - y(seg.to));
			// A bar cut by a break has its number on top, clear of the cut.
			const cut = breakAt !== null && Math.min(seg.from, seg.to) < breakAt && Math.max(seg.from, seg.to) > breakAt;
			// The closing total drops from the connector to the baseline, unless `closing` is `up`.
			const down = seg.kind === "down" || (seg.kind === "total" && i > 0 && i === segs.length - 1 && closing === "down");
			return { top, length, down, inside: !cut && !narrow && tallEnough(values[i], length, unit) };
		});
		// At the start or end, a number is as far from it as the widest number is from the sides.
		const digits = values[0] ? sizeOf(values[0]).height * unit * 0.56 : 0;
		let side = Number.POSITIVE_INFINITY;
		for (const [i, bar] of bars.entries()) if (bar.inside) side = Math.min(side, (barWidth - sizeOf(values[i]).width * unit) / 2);

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
			const { top, length: barHeight, down, inside } = bars[i];
			svg.appendChild(
				svgEl("rect", {
					class: withRow(BAR_CLASS, seg),
					"data-kind": seg.kind,
					"data-row": i + 1,
					"data-grow": down ? "down" : "up",
					x: cx(i) - barWidth / 2,
					y: top,
					width: barWidth,
					height: Math.max(barHeight, 1),
					style: timing("--i", seg.slot),
				})
			);

			const label = values[i];
			// The end is where the bar grows to: the top of a step up, the bottom of a step down.
			// A step too short for the full space has its number in the middle.
			const pad = Math.min(side, (barHeight - digits) / 2);
			const near = top + pad + digits / 2;
			const far = top + barHeight - pad - digits / 2;
			const along = align === "center" ? top + barHeight / 2 : (align === "end") !== down ? near : far;
			label.dataset.place = inside ? "inside" : "outside";
			label.dataset.kind = seg.kind;
			// A label outside a falling step hangs below it, so its own height is added.
			const ly = inside
				? along
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
