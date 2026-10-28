import { along } from "../functions/scale";
import { largest } from "../functions/format";
import { sizeOf } from "../functions/measure";
import { BAR_CLASS, RULE_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { groupLayout, inkOf, seriesMark, stackMarks, stackOf, stackReach } from "../functions/groups";
import { fitsLength, fitTogether } from "../functions/labels";
import { placeAt, svgEl, withRow } from "../functions/svg";
import type { ChartType, Geometry, Row, Segment } from "../types";

const segments = (rows: Row[]): Segment[] =>
	rows.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const }));

export const bar: ChartType = {
	segments,
	series: true,
	groups: true,
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
		// In percent, so a name wraps rather than runs out on the left when the chart is printed narrower than on screen.
		categories[0]?.parentElement?.style.setProperty("--_beside", `${(((left - 8 * unit) / VIEWBOX_WIDTH) * 100).toFixed(2)}%`);
		const right = VIEWBOX_WIDTH - 4 * unit;

		const extent = geo.stacked
			? Math.max(largest(geo.rows.map((row) => stackReach(row, geo.series.length).top)), 0) || 1
			: Math.max(
				largest(geo.rows.flatMap((row) =>
					row.cells.slice(0, geo.series.length).map((cell) => Math.abs(cell.value))
				)),
				0
			) || 1;
		// Bars below zero go left from the zero line, which moves right to make room for them.
		const depth = geo.stacked
			? Math.max(largest(geo.rows.map((row) => -stackReach(row, geo.series.length).bottom)), 0)
			: Math.max(largest(geo.rows.flatMap((row) => row.cells.slice(0, geo.series.length).map((cell) => -cell.value))), 0);
		// With an axis or gridlines, the scale reaches the ends of the axis. A break squeezes part of it, as on a column chart, and leaves its cut empty.
		const reach = Math.max(extent, geo.domain?.[1] ?? 0);
		const below = Math.max(depth, -(geo.domain?.[0] ?? 0));
		const ceiling = Math.max(reach, geo.squeeze?.hi ?? 0) + below;
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
		const valueOf = (s: number, i: number) => (geo.rows[i].cells[s] ?? geo.rows[i].cells[0]).value;
		const grouped = geo.seriesValues.flatMap((labels, s) => labels.map((label, i) => ({ label, value: valueOf(s, i) })));
		// A stack wholly below zero has its total before it.
		const backwards = (i: number) => {
			const reach = stackReach(geo.rows[i], geo.series.length);
			return reach.top === 0 && reach.bottom < 0;
		};
		let room = geo.stacked
			? roomFor(geo.totals.filter((_total, i) => !backwards(i)))
			: several
				? roomFor(grouped.filter((one) => one.value >= 0).map((one) => one.label))
				: 0;
		// Room before the zero line for the numbers of bars below zero.
		let before = geo.stacked
			? roomFor(geo.totals.filter((_total, i) => backwards(i)))
			: several
				? roomFor(grouped.filter((one) => one.value < 0).map((one) => one.label))
				: 0;
		// A number goes after its bar, or with `labels: "inside"`, inside it if it fits, as on a column chart.
		const fits = (label: HTMLElement, length: number) => geo.labels === "inside" && fitsLength(label, length, unit);
		if (!several && !geo.stacked) {
			// A narrower span can push another number out of its bar, so this repeats until the room stays the same.
			for (let tries = 0; tries < 3; tries++) {
				const span = right - left - room - before;
				const outside = segs
					.map((seg, i) => ({ seg, label: values[i] }))
					.filter(({ seg, label }) => !fits(label, lengthOf(seg.value, span)));
				const after = roomFor(outside.filter(({ seg }) => seg.value >= 0).map(({ label }) => label));
				const ahead = roomFor(outside.filter(({ seg }) => seg.value < 0).map(({ label }) => label));
				if (after <= room && ahead <= before) break;
				room = Math.max(room, after);
				before = Math.max(before, ahead);
			}
		}
		const span = right - left - room - before;
		const zero = left + before + lengthOf(below, span);
		const x = (value: number) => (value < 0 ? zero - lengthOf(value, span) : zero + lengthOf(value, span));
		if (geo.squeeze) geo.breakX = x(geo.squeeze.gap);
		// The value scale, for an annotation at a value.
		geo.x = x;

		if (geo.stacked) {
			geo.rows.forEach((row, i) => {
				const reach = stackReach(row, geo.series.length);
				const piece = stackMarks(geo, row, i, { "data-grow": "right" }, reach.bottom < 0 ? `${zero - x(reach.bottom)}px center` : "");
				const top = cy(i) - thickness / 2;
				const pieces = stackOf(row, geo.series.length);
				pieces.forEach(({ from, to, cell }, s) => {
					const label = geo.seriesValues[s][i];
					label.dataset.place = "none";
					if (cell.missing || to === from) return;
					const start = Math.min(x(from), x(to));
					const end = Math.max(x(from), x(to));
					piece(s, { x: start, y: top, width: Math.max(end - start, 1), height: thickness, ...(to < from && { "data-grow": "left" }) });
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
					total.dataset.place = backwards(i) ? "before" : "after";
					placeAt(total, backwards(i) ? x(reach.bottom) - gap : x(reach.top) + gap, cy(i), VIEWBOX_WIDTH, height);
				}
				const name = categories[i];
				if (name) placeAt(name, left - 8 * unit, cy(i), VIEWBOX_WIDTH, height);
			});
			svg.appendChild(
				svgEl("line", { class: RULE_CLASS, x1: zero, x2: zero, y1: 0, y2: height })
			);
			return;
		}

		if (several) {
			// All numbers shrink together to fit beside their bars, or all are left out.
			const shown = geo.seriesValues.flat().filter((label) => label.dataset.missing === undefined);
			const fit = fitTogether(geo.plot, shown, (label) => ({ size: sizeOf(label).height * unit, room: layout.size + layout.gap * 0.5 }), "--_fit");
			geo.rows.forEach((row, i) => {
				geo.series.forEach((_one, s) => {
					const cell = row.cells[s] ?? row.cells[0];
					const label = geo.seriesValues[s][i];
					if (cell.missing) {
						label.dataset.place = "none";
						return;
					}
					const end = x(cell.value);
					const back = cell.value < 0;
					const top = cy(i) + layout.offset(s);
					// A value of zero has no bar. A very small one is at least one unit, on its own side of the zero line.
					const wide = Math.max(Math.abs(end - zero), 1);
					if (cell.value !== 0)
						svg.appendChild(
							svgEl("rect", {
								class: withRow(BAR_CLASS, row),
								"data-kind": "bar",
								"data-row": i + 1,
								"data-grow": back ? "left" : "right",
								x: back ? zero - wide : zero,
								y: top,
								width: wide,
								height: layout.size,
								...seriesMark(geo, row, s),
							})
						);
					label.dataset.place = back ? "before" : "after";
					label.toggleAttribute("data-left-out", !fit);
					placeAt(label, back ? end - gap : end + gap, top + layout.size / 2, VIEWBOX_WIDTH, height);
				});
				const name = categories[i];
				if (name) placeAt(name, left - 8 * unit, cy(i), VIEWBOX_WIDTH, height);
			});
			svg.appendChild(
				svgEl("line", { class: RULE_CLASS, x1: zero, x2: zero, y1: 0, y2: height })
			);
			return;
		}

		// A number inside its bar is as far from the end, or start, as from the top and bottom, if its bar is long enough.
		const inside = segs.map((seg, i) => fits(values[i], Math.abs(x(seg.value) - zero)));

		segs.forEach((seg, i) => {
			const end = x(seg.value);
			const middle = cy(i);
			// A bar below zero runs left from the zero line, with its number before it.
			const back = seg.value < 0;
			const length = Math.abs(end - zero);

			// A value of zero has no bar. A very small one is at least one unit, on its own side of the zero line.
			const wide = Math.max(length, 1);
			if (seg.value !== 0)
				svg.appendChild(
					svgEl("rect", {
						class: withRow(BAR_CLASS, seg),
						"data-kind": seg.kind,
						"data-row": i + 1,
						"data-grow": back ? "left" : "right",
						x: back ? zero - wide : zero,
						y: middle - thickness / 2,
						width: wide,
						height: thickness,
						style: timing("--i", seg.slot),
					})
				);

			const label = values[i];
			const pad = Math.max(Math.min(gap, length - widthOf(label) - 6 * unit), 6 * unit);
			// Measured from the end of the bar towards the zero line, left or right.
			const toward = back ? 1 : -1;
			label.dataset.place = inside[i] ? "inside" : back ? "before" : "after";
			label.dataset.kind = seg.kind;
			placeAt(
				label,
				!inside[i]
					? end - toward * gap
					: geo.insideAlign === "center"
						? (zero + end) / 2
						: geo.insideAlign === "start"
							? zero - toward * (pad + widthOf(label) / 2)
							: end + toward * (pad + widthOf(label) / 2),
				middle,
				VIEWBOX_WIDTH,
				height
			);

			const name = categories[i];
			if (name) placeAt(name, left - 8 * unit, middle, VIEWBOX_WIDTH, height);
		});

		svg.appendChild(
			svgEl("line", { class: RULE_CLASS, x1: zero, x2: zero, y1: 0, y2: height })
		);
	},
};
