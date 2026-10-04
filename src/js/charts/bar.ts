import { BAR_CLASS, RULE_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { groupLayout, inkOf, seriesMark, stackMarks, stackOf, stackTotal } from "../functions/groups";
import { fitsLength, fitTogether } from "../functions/labels";
import { placeAt, svgEl, withRow } from "../functions/svg";
import type { ChartType, Geometry, Row, Segment } from "../types";

/**
 * Columns laid on their side.
 *
 * Worth having as a kind of its own rather than a column chart rotated: a long
 * category name is what usually sends a page here, and a name that would have to
 * be turned on its side under a column fits comfortably beside a bar. So the names
 * go beside the marks, which is the one thing this kind asks of the pass that
 * makes them — see `categories` below — and the space they need is measured off
 * the names themselves rather than guessed at.
 */
const segments = (rows: Row[]): Segment[] =>
	rows.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const }));

export const bar: ChartType = {
	segments,
	series: true,
	legend: "box",
	stackable: true,
	totals: true,

	// Shorter than a row of columns: a bar needs a band, not a height.
	aspect: 0.5,

	// Tall enough for a number beside every bar, also on a narrow screen. A bar on
	// its own takes 58% of its band; the bars of a group share 70% of theirs. And
	// tall enough for every name, also one that wraps onto several lines.
	minHeight: ({ labelHeight, nameHeight, rows, series, stacked }) => {
		const bar = labelHeight * 1.1;
		const band = series > 1 && !stacked ? (bar * (series + 0.15 * (series - 1))) / 0.7 : bar / 0.58;
		return rows * Math.max(band, nameHeight * 1.2);
	},

	// Beside the bars, not under the plot.
	categories: "beside",

	// Nothing stands above anything here.
	headroom: () => 0,

	draw(geo: Geometry) {
		const { segments: segs, height, unit, svg, values, categories, config, barMax } = geo;
		const several = geo.series.length > 1;
		// The names are real elements, so the room they need is a fact. The widest of
		// them decides where every bar starts.
		const names = Math.max(...categories.map((name) => name.offsetWidth * unit), 0);
		const left = Math.min(names + 10 * unit, VIEWBOX_WIDTH * 0.42);
		const right = VIEWBOX_WIDTH - 4 * unit;

		const extent = geo.stacked
			? Math.max(...geo.rows.map((row) => stackTotal(row, geo.series.length)), 0) || 1
			: Math.max(
				...geo.rows.flatMap((row) =>
					row.cells.slice(0, geo.series.length).map((cell) => Math.abs(cell.value))
				),
				0
			) || 1;
		// Room at the end for the numbers that stand after their bar: the totals of a
		// stacked chart, every number of a grouped one, and, with one value column,
		// only the numbers that do not fit inside their bar. If every number fits
		// inside, the bars take the whole width.
		const widthOf = (label: HTMLElement) => label.offsetWidth * unit;
		const roomFor = (labels: HTMLElement[]) =>
			labels.length ? Math.max(...labels.map(widthOf)) + 9 * unit : 0;
		let room = geo.stacked ? roomFor(geo.totals) : several ? roomFor(geo.seriesValues.flat()) : 0;
		if (!several) {
			// A narrower span can push another number out of its bar, so this looks
			// again until the room stays the same.
			for (let tries = 0; tries < 3; tries++) {
				const span = right - left - room;
				const outside = segs
					.map((seg, i) => ({ seg, label: values[i] }))
					.filter(({ seg, label }) => !fitsLength(label, (Math.abs(seg.value) / extent) * span, unit))
					.map(({ label }) => label);
				const needed = roomFor(outside);
				if (needed <= room) break;
				room = needed;
			}
		}
		const span = right - left - room;
		const x = (value: number) => left + (Math.abs(value) / extent) * span;

		const band = height / segs.length;
		const cy = (i: number) => (i + 0.5) * band;
		const thickness = Math.min(band * config.barfill, barMax);

		// Stacked: one bar per row, its pieces from left to right, the total after it.
		if (geo.stacked) {
			geo.rows.forEach((row, i) => {
				const piece = stackMarks(geo, row, i, { "data-grow": "right" });
				const top = cy(i) - thickness / 2;
				const pieces = stackOf(row, geo.series.length);
				pieces.forEach(({ from, to, cell }, s) => {
					const label = geo.seriesValues[s][i];
					label.dataset.place = "none";
					if (cell.missing || to === from) return;
					const start = x(from);
					const end = x(to);
					piece(s, { x: start, y: top, width: Math.max(end - start, 1), height: thickness });
					// A number goes in the middle of its piece. If the piece is too small, it is
					// left out, until its row is pointed at.
					label.dataset.place = "inside";
					label.toggleAttribute(
						"data-left-out",
						!fitsLength(label, end - start, unit) || label.offsetHeight * unit > thickness
					);
					inkOf(label, geo, s);
					placeAt(label, (start + end) / 2, cy(i), VIEWBOX_WIDTH, height);
				});
				const total = geo.totals[i];
				if (total) {
					total.dataset.place = "after";
					placeAt(total, x(pieces.at(-1)?.to ?? 0) + 5 * unit, cy(i), VIEWBOX_WIDTH, height);
				}
				const name = categories[i];
				if (name) placeAt(name, left - 8 * unit, cy(i), VIEWBOX_WIDTH, height);
			});
			svg.appendChild(
				svgEl("line", { class: RULE_CLASS, x1: left, x2: left, y1: 0, y2: height })
			);
			return;
		}

		// With several value columns, each row is a group of bars, one per column.
		if (several) {
			const layout = groupLayout(band, geo.series.length, barMax);
			geo.plot.dataset.grouped = "";
			// All numbers shrink together to fit beside their bars, or all are left out.
			const shown = geo.seriesValues.flat().filter((label) => label.dataset.missing === undefined);
			const fit = fitTogether(geo.plot, shown, (label) => ({ size: label.offsetHeight * unit, room: layout.size + layout.gap * 0.5 }), "--tablechart-fit");
			geo.rows.forEach((row, i) => {
				geo.series.forEach((_one, s) => {
					const cell = row.cells[s] ?? row.cells[0];
					const label = geo.seriesValues[s][i];
					if (cell.missing) {
						label.dataset.place = "none";
						return;
					}
					const end = x(cell.value);
					const top = cy(i) + layout.offset(s);
					svg.appendChild(
						svgEl("rect", {
							class: withRow(BAR_CLASS, row),
							"data-kind": "bar",
							"data-row": i + 1,
							"data-grow": "right",
							x: left,
							y: top,
							width: Math.max(end - left, 1),
							height: layout.size,
							...seriesMark(geo, row, s),
						})
					);
					// If the numbers do not fit, they are left out, until a row is pointed at.
					label.dataset.place = "after";
					label.toggleAttribute("data-left-out", !fit);
					placeAt(label, end + 5 * unit, top + layout.size / 2, VIEWBOX_WIDTH, height);
				});
				const name = categories[i];
				if (name) placeAt(name, left - 8 * unit, cy(i), VIEWBOX_WIDTH, height);
			});
			svg.appendChild(
				svgEl("line", { class: RULE_CLASS, x1: left, x2: left, y1: 0, y2: height })
			);
			return;
		}

		segs.forEach((seg, i) => {
			const end = x(seg.value);
			const middle = cy(i);

			svg.appendChild(
				svgEl("rect", {
					class: withRow(BAR_CLASS, seg),
					"data-kind": seg.kind,
					"data-row": i + 1,
					// Sideways, so it grows from the baseline it stands on rather than up.
					"data-grow": "right",
					x: left,
					y: middle - thickness / 2,
					width: Math.max(end - left, 1),
					height: thickness,
					style: timing("--i", seg.slot),
				})
			);

			// Inside the bar when it can hold the number, just past the end when it
			// cannot — the same rule a waterfall follows, read sideways.
			const label = values[i];
			const room = end - left;
			const inside = fitsLength(label, room, unit);
			label.dataset.place = inside ? "inside" : "after";
			label.dataset.kind = seg.kind;
			placeAt(
				label,
				inside ? end - 6 * unit - (label.offsetWidth * unit) / 2 : end + 5 * unit,
				middle,
				VIEWBOX_WIDTH,
				height
			);

			// The name goes in the margin the bars left for it, reading towards them.
			const name = categories[i];
			if (name) placeAt(name, left - 8 * unit, middle, VIEWBOX_WIDTH, height);
		});

		// The baseline is upright here, and stands where the bars begin.
		svg.appendChild(
			svgEl("line", { class: RULE_CLASS, x1: left, x2: left, y1: 0, y2: height })
		);
	},
};
