import { sizeOf } from "../functions/measure";
import { BAR_CLASS, RULE_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { groupLayout, inkOf, seriesMark, stackMarks, stackOf } from "../functions/groups";
import { fitTogether, tallEnough, tooWide } from "../functions/labels";
import { placeAt, svgEl, withRow } from "../functions/svg";
import type { ChartType, Geometry, Row, Segment } from "../types";

const segments = (rows: Row[]): Segment[] =>
	rows.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const }));

export const column: ChartType = {
	segments,
	series: true,
	legend: "box",
	stackable: true,
	totals: true,

	breakable: true,

	headroom: ({ labelHeight, badgeHeight, hasAnnotations, unit }) =>
		labelHeight + 4 * unit + (hasAnnotations ? badgeHeight * 1.6 : 0),

	draw(geo: Geometry) {
		const { segments: segs, cx, y, barWidth, height, unit, svg, values, labels } = geo;
		const baseline = y(0);

		if (geo.stacked) {
			geo.rows.forEach((row, i) => {
				const piece = stackMarks(geo, row, i);
				const x = cx(i) - barWidth / 2;
				stackOf(row, geo.series.length).forEach(({ from, to, cell }, s) => {
					const label = geo.seriesValues[s][i];
					label.dataset.place = "none";
					if (cell.missing || to === from) return;
					const top = y(to);
					const bottom = y(from);
					piece(s, { x, y: top, width: barWidth, height: Math.max(bottom - top, 1) });
					// A number too big for its piece is left out until its row is pointed at.
					label.dataset.place = "inside";
					label.toggleAttribute(
						"data-left-out",
						!tallEnough(label, bottom - top, unit) || sizeOf(label).width * unit > barWidth - 4 * unit
					);
					inkOf(label, geo, s);
					placeAt(label, cx(i), (top + bottom) / 2, VIEWBOX_WIDTH, height);
				});
				const total = geo.totals[i];
				const sum = stackOf(row, geo.series.length).at(-1)?.to ?? 0;
				if (total) {
					total.dataset.place = "outside";
					placeAt(total, cx(i), y(sum) - 4 * unit, VIEWBOX_WIDTH, height);
				}
			});
			svg.appendChild(
				svgEl("line", { class: RULE_CLASS, x1: 0, x2: VIEWBOX_WIDTH, y1: baseline, y2: baseline })
			);
			return;
		}

		if (geo.series.length > 1) {
			const band = cx(1) - cx(0) || cx(0) * 2;
			const layout = groupLayout(band, geo.series.length, geo.barMax);
			geo.plot.dataset.grouped = "";
			// All numbers shrink together to fit above their bars, or all are left out.
			const shown = geo.seriesValues.flat().filter((label) => label.dataset.missing === undefined);
			const fit = fitTogether(geo.plot, shown, (label) => ({ size: sizeOf(label).width * unit, room: layout.size + layout.gap * 0.5 }), "--tablechart-fit");
			geo.rows.forEach((row, i) => {
				geo.series.forEach((_one, s) => {
					const cell = row.cells[s] ?? row.cells[0];
					const label = geo.seriesValues[s][i];
					const x = cx(i) + layout.offset(s);
					if (cell.missing) {
						label.dataset.place = "none";
						return;
					}
					const top = y(cell.value);
					svg.appendChild(
						svgEl("rect", {
							class: withRow(BAR_CLASS, row),
							"data-kind": "bar",
							"data-row": i + 1,
							x,
							y: top,
							width: layout.size,
							height: Math.max(baseline - top, 1),
							...seriesMark(geo, row, s),
						})
					);
					label.dataset.place = "outside";
					label.toggleAttribute("data-left-out", !fit);
					placeAt(label, x + layout.size / 2, top - 4 * unit, VIEWBOX_WIDTH, height);
				});
			});
			svg.appendChild(
				svgEl("line", { class: RULE_CLASS, x1: 0, x2: VIEWBOX_WIDTH, y1: baseline, y2: baseline })
			);
			return;
		}

		// If any number is wider than its bar, every number goes above, so a narrow chart does not mix the two.
		const narrow = tooWide(values, barWidth, unit);

		segs.forEach((seg, i) => {
			const top = y(seg.value);
			// A missing value has no bar; its label stands where the bar would.
			if (seg.missing) {
				placeAt(values[i], cx(i), baseline - 4 * unit, VIEWBOX_WIDTH, height);
				values[i].dataset.place = "outside";
				return;
			}
			svg.appendChild(
				svgEl("rect", {
					class: withRow(BAR_CLASS, seg),
					"data-kind": seg.kind,
					"data-row": i + 1,
					x: cx(i) - barWidth / 2,
					y: top,
					width: barWidth,
					height: Math.max(baseline - top, 1),
					style: timing("--i", seg.slot),
				})
			);
			const barHeight = baseline - top;
			const inside = labels === "inside" && !narrow && tallEnough(values[i], barHeight, unit);
			placeAt(
				values[i],
				cx(i),
				inside ? top + barHeight / 2 : top - 4 * unit,
				VIEWBOX_WIDTH,
				height
			);
			values[i].dataset.place = inside ? "inside" : "outside";
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
