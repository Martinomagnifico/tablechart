import { along } from "../functions/scale";
import { largest } from "../functions/format";
import { sizeOf } from "../functions/measure";
import { BAR_CLASS, RULE_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { groupLayout, inkOf, seriesMark, stackMarks, stackOf, stackTotal } from "../functions/groups";
import { fitsLength, fitTogether } from "../functions/labels";
import { placeAt, svgEl, withRow } from "../functions/svg";
import type { ChartType, Geometry, Row, Segment } from "../types";

const segments = (rows: Row[]): Segment[] =>
	rows.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const }));

export const bar: ChartType = {
	segments,
	series: true,
	legend: "box",
	stackable: true,
	totals: true,
	breakable: true,

	aspect: 0.5,

	// Tall enough for a number beside every bar and for every name, also one that wraps.
	minHeight: ({ labelHeight, nameHeight, rows, series, stacked }) => {
		const bar = labelHeight * 1.1;
		const band = series > 1 && !stacked ? (bar * (series + 0.15 * (series - 1))) / 0.7 : bar / 0.58;
		return rows * Math.max(band, nameHeight * 1.2);
	},

	categories: "beside",

	headroom: () => 0,

	draw(geo: Geometry) {
		const { segments: segs, height, unit, svg, values, categories, config, barMax } = geo;
		const several = geo.series.length > 1;
		// The widest name decides where every bar starts.
		const names = Math.max(largest(categories.map((name) => sizeOf(name).width * unit)), 0);
		const left = Math.min(names + 10 * unit, VIEWBOX_WIDTH * 0.42);
		const right = VIEWBOX_WIDTH - 4 * unit;

		const extent = geo.stacked
			? Math.max(largest(geo.rows.map((row) => stackTotal(row, geo.series.length))), 0) || 1
			: Math.max(
				largest(geo.rows.flatMap((row) =>
					row.cells.slice(0, geo.series.length).map((cell) => Math.abs(cell.value))
				)),
				0
			) || 1;
		// A break squeezes part of the scale, as on a column chart, and leaves its cut empty.
		const ceiling = Math.max(extent, geo.squeeze?.hi ?? 0);
		const lengthOf = (value: number, span: number) => along(Math.abs(value), ceiling, span, geo.squeeze, geo.breakGap);
		const band = height / segs.length;
		const cy = (i: number) => (i + 0.5) * band;
		const thickness = Math.min(band * config.barfill, barMax);
		const layout = groupLayout(band, geo.series.length, barMax);
		// A number after its bar is as far from it as from the top and bottom inside it. Digits are about 56% of the line height.
		const first = values[0] ?? geo.totals[0];
		const digits = first ? sizeOf(first).height * unit * 0.56 : 0;
		const gap = Math.max(((several && !geo.stacked ? layout.size : thickness) - digits) / 2, 5 * unit);

		// Room at the end for numbers after their bar; if every number fits inside, the bars take the whole width.
		const widthOf = (label: HTMLElement) => sizeOf(label).width * unit;
		const roomFor = (labels: HTMLElement[]) =>
			labels.length ? largest(labels.map(widthOf)) + gap + 4 * unit : 0;
		let room = geo.stacked ? roomFor(geo.totals) : several ? roomFor(geo.seriesValues.flat()) : 0;
		if (!several) {
			// A narrower span can push another number out of its bar, so this repeats until the room stays the same.
			for (let tries = 0; tries < 3; tries++) {
				const span = right - left - room;
				const outside = segs
					.map((seg, i) => ({ seg, label: values[i] }))
					.filter(({ seg, label }) => !fitsLength(label, lengthOf(seg.value, span), unit))
					.map(({ label }) => label);
				const needed = roomFor(outside);
				if (needed <= room) break;
				room = needed;
			}
		}
		const span = right - left - room;
		const x = (value: number) => left + lengthOf(value, span);
		if (geo.squeeze) geo.breakX = x(geo.squeeze.gap);

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
					// A number too big for its piece is left out until its row is pointed at.
					label.dataset.place = "inside";
					label.toggleAttribute(
						"data-left-out",
						!fitsLength(label, end - start, unit) || sizeOf(label).height * unit > thickness
					);
					inkOf(label, geo, s);
					placeAt(label, (start + end) / 2, cy(i), VIEWBOX_WIDTH, height);
				});
				const total = geo.totals[i];
				if (total) {
					total.dataset.place = "after";
					placeAt(total, x(pieces.at(-1)?.to ?? 0) + gap, cy(i), VIEWBOX_WIDTH, height);
				}
				const name = categories[i];
				if (name) placeAt(name, left - 8 * unit, cy(i), VIEWBOX_WIDTH, height);
			});
			svg.appendChild(
				svgEl("line", { class: RULE_CLASS, x1: left, x2: left, y1: 0, y2: height })
			);
			return;
		}

		if (several) {
			geo.plot.dataset.grouped = "";
			// All numbers shrink together to fit beside their bars, or all are left out.
			const shown = geo.seriesValues.flat().filter((label) => label.dataset.missing === undefined);
			const fit = fitTogether(geo.plot, shown, (label) => ({ size: sizeOf(label).height * unit, room: layout.size + layout.gap * 0.5 }), "--tablechart-fit");
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
					label.dataset.place = "after";
					label.toggleAttribute("data-left-out", !fit);
					placeAt(label, end + gap, top + layout.size / 2, VIEWBOX_WIDTH, height);
				});
				const name = categories[i];
				if (name) placeAt(name, left - 8 * unit, cy(i), VIEWBOX_WIDTH, height);
			});
			svg.appendChild(
				svgEl("line", { class: RULE_CLASS, x1: left, x2: left, y1: 0, y2: height })
			);
			return;
		}

		// A number inside its bar is as far from the end, or start, as from the top and bottom, if its bar is long enough.
		const inside = segs.map((seg, i) => fitsLength(values[i], x(seg.value) - left, unit));

		segs.forEach((seg, i) => {
			const end = x(seg.value);
			const middle = cy(i);

			svg.appendChild(
				svgEl("rect", {
					class: withRow(BAR_CLASS, seg),
					"data-kind": seg.kind,
					"data-row": i + 1,
					"data-grow": "right",
					x: left,
					y: middle - thickness / 2,
					width: Math.max(end - left, 1),
					height: thickness,
					style: timing("--i", seg.slot),
				})
			);

			const label = values[i];
			const pad = Math.max(Math.min(gap, end - left - widthOf(label) - 6 * unit), 6 * unit);
			label.dataset.place = inside[i] ? "inside" : "after";
			label.dataset.kind = seg.kind;
			placeAt(
				label,
				!inside[i]
					? end + gap
					: geo.insideAlign === "center"
						? (left + end) / 2
						: geo.insideAlign === "start"
							? left + pad + widthOf(label) / 2
							: end - pad - widthOf(label) / 2,
				middle,
				VIEWBOX_WIDTH,
				height
			);

			const name = categories[i];
			if (name) placeAt(name, left - 8 * unit, middle, VIEWBOX_WIDTH, height);
		});

		svg.appendChild(
			svgEl("line", { class: RULE_CLASS, x1: left, x2: left, y1: 0, y2: height })
		);
	},
};
