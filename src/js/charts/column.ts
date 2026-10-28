import { sizeOf } from "../functions/measure";
import { BAR_CLASS, RULE_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { groupLayout, inkOf, seriesMark, stackMarks, stackOf, stackReach } from "../functions/groups";
import { fitTogether, tallEnough, tooWide } from "../functions/labels";
import { placeAt, svgEl, withRow } from "../functions/svg";
import type { ChartType, Geometry, Row, Segment } from "../types";

const segments = (rows: Row[]): Segment[] =>
	rows.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const }));

export const column: ChartType = {
	segments,
	series: true,
	lines: true,
	groups: true,
	legend: "box",
	stackable: true,
	totals: true,

	breakable: true,

	headroom: ({ labelHeight, badgeHeight, hasAnnotations, unit }) =>
		labelHeight + 4 * unit + (hasAnnotations ? badgeHeight * 1.6 : 0),

	draw(geo: Geometry) {
		const { segments: segs, cx, y, barWidth, height, unit, svg, values, labels, insideAlign } = geo;
		const baseline = y(0);

		if (geo.stacked) {
			geo.rows.forEach((row, i) => {
				const reach = stackReach(row, geo.series.length);
				const piece = stackMarks(geo, row, i, {}, reach.bottom < 0 ? `center ${baseline - y(reach.top)}px` : "");
				const x = cx(i) - barWidth / 2;
				stackOf(row, geo.series.length).forEach(({ from, to, cell }, s) => {
					const label = geo.seriesValues[s][i];
					label.dataset.place = "none";
					if (cell.missing || to === from) return;
					const top = Math.min(y(to), y(from));
					const bottom = Math.max(y(to), y(from));
					piece(s, { x, y: top, width: barWidth, height: Math.max(bottom - top, 1), ...(to < from && { "data-grow": "down" }) });
					// A number too big for its piece is left out until its row is pointed at.
					label.dataset.place = "inside";
					label.toggleAttribute(
						"data-left-out",
						!tallEnough(label, bottom - top, unit) || sizeOf(label).width * unit > barWidth - 4 * unit
					);
					inkOf(label, geo, s);
					placeAt(label, cx(i), (top + bottom) / 2, VIEWBOX_WIDTH, height);
				});
				// The total goes above the stack, or under it if the whole stack is below zero.
				const total = geo.totals[i];
				if (total) {
					const under = reach.top === 0 && reach.bottom < 0;
					total.dataset.place = under ? "below" : "outside";
					placeAt(total, cx(i), under ? y(reach.bottom) + 4 * unit : y(reach.top) - 4 * unit, VIEWBOX_WIDTH, height);
				}
			});
			svg.appendChild(
				svgEl("line", { class: RULE_CLASS, x1: 0, x2: VIEWBOX_WIDTH, y1: baseline, y2: baseline })
			);
			return;
		}

		if (geo.own.length > 1) {
			const band = cx(1) - cx(0) || cx(0) * 2;
			const layout = groupLayout(band, geo.own.length, geo.barMax);
			// All numbers shrink together to fit above their bars, or all are left out.
			const shown = geo.own.flatMap((s) => geo.seriesValues[s]).filter((label) => label.dataset.missing === undefined);
			const fit = fitTogether(geo.plot, shown, (label) => ({ size: sizeOf(label).width * unit, room: layout.size + layout.gap * 0.5 }), "--_fit");
			geo.rows.forEach((row, i) => {
				geo.own.forEach((s, k) => {
					const cell = row.cells[s] ?? row.cells[0];
					const label = geo.seriesValues[s][i];
					const x = cx(i) + layout.offset(k);
					if (cell.missing) {
						label.dataset.place = "none";
						return;
					}
					const end = y(cell.value);
					const below = cell.value < 0;
					// A value of zero has no column. A very small one is at least one unit, on its own side of the baseline.
					const tall = Math.max(Math.abs(baseline - end), 1);
					if (cell.value !== 0)
						svg.appendChild(
							svgEl("rect", {
								class: withRow(BAR_CLASS, row),
								"data-kind": "bar",
								"data-row": i + 1,
								...(below && { "data-grow": "down" }),
								x,
								y: below ? baseline : baseline - tall,
								width: layout.size,
								height: tall,
								...seriesMark(geo, row, s),
							})
						);
					label.dataset.place = below ? "below" : "outside";
					label.toggleAttribute("data-left-out", !fit);
					placeAt(label, x + layout.size / 2, below ? end + 4 * unit : end - 4 * unit, VIEWBOX_WIDTH, height);
				});
			});
			svg.appendChild(
				svgEl("line", { class: RULE_CLASS, x1: 0, x2: VIEWBOX_WIDTH, y1: baseline, y2: baseline })
			);
			return;
		}

		// Beside a line, the columns keep the colour of their series.
		const own = geo.own[0];
		const mixed = geo.own.length < geo.series.length;
		// If any number is wider than its bar, every number goes above, so a narrow chart does not mix the two.
		const narrow = tooWide(values, barWidth, unit);
		const inside = segs.map(
			(seg, i) => labels === "inside" && !narrow && !seg.missing && tallEnough(values[i], Math.abs(baseline - y(seg.value)), unit)
		);
		// A number inside is at the end of its column, as far from it as the widest number is from the sides.
		// Digits are about 56% of the line height; a column too short for that has its number in the middle.
		const digits = values[0] ? sizeOf(values[0]).height * unit * 0.56 : 0;
		let side = Number.POSITIVE_INFINITY;
		for (const [i, label] of values.entries()) if (inside[i]) side = Math.min(side, (barWidth - sizeOf(label).width * unit) / 2);

		segs.forEach((seg, i) => {
			const end = y(seg.value);
			// A column below zero hangs from the baseline, with its number under it.
			const below = seg.value < 0;
			// A missing value has no bar; its label stands where the bar would.
			if (seg.missing) {
				placeAt(values[i], cx(i), baseline - 4 * unit, VIEWBOX_WIDTH, height);
				values[i].dataset.place = "outside";
				return;
			}
			// A value of zero has no column. A very small one is at least one unit, on its own side of the baseline.
			const tall = Math.max(Math.abs(baseline - end), 1);
			if (seg.value !== 0)
				svg.appendChild(
					svgEl("rect", {
						class: withRow(BAR_CLASS, seg),
						"data-kind": seg.kind,
						"data-row": i + 1,
						...(below && { "data-grow": "down" }),
						x: cx(i) - barWidth / 2,
						y: below ? baseline : baseline - tall,
						width: barWidth,
						height: tall,
						style: timing("--i", seg.slot),
						...(mixed && seriesMark(geo, seg, own)),
					})
				);
			// Measured from the end of the column towards the baseline, up or down.
			const toward = below ? -1 : 1;
			const pad = Math.min(side, (Math.abs(baseline - end) - digits) / 2);
			const along =
				insideAlign === "center"
					? (end + baseline) / 2
					: insideAlign === "start"
						? baseline - toward * (pad + digits / 2)
						: end + toward * (pad + digits / 2);
			const outside = below ? end + 4 * unit : end - 4 * unit;
			placeAt(values[i], cx(i), inside[i] ? along : outside, VIEWBOX_WIDTH, height);
			values[i].dataset.place = inside[i] ? "inside" : below ? "below" : "outside";
			if (mixed && inside[i]) inkOf(values[i], geo, own);
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
