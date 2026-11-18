import { along } from "../scale/scale";
import { largest } from "../shared/format";
import { sizeOf } from "../layout/measure";
import { BAR_CLASS, RULE_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../shared/timing";
import { endOf, gapAfter, groupLayout, inkOf, seriesMark, stackMarks, stackOf, stackReach } from "../shared/stacks";
import { fitsLength, fitTogether, GROUP_FIT_MIN } from "../layout/labels";
import { placeAt, svgEl, withRow } from "../draw/svg";
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
	// A row is as high as its name and the number after its bar; a number inside a bar, or a group of bars each with its number, needs more.
	minHeight: ({ labelHeight, nameHeight, rows, series, stacked, labels }) => {
		const bar = labelHeight * 1.1;

		const band =
			series > 1 && !stacked ? (bar * (series + 0.15 * (series - 1))) / 0.7 : stacked || labels === "inside" ? bar / 0.58 : bar;

		return rows * Math.max(band, nameHeight * 1.2);
	},

	categories: "beside",

	headroom: () => 0,

	draw(geo: Geometry) {
		const { segments: segs, height, unit, svg, values, categories, config, barMax } = geo;

		// A series turned off in a legend has no bar, and the group closes up.
		const several = geo.own.length > 1;

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

		const cy = (rowIndex: number) => (rowIndex + 0.5) * band;

		const thickness = Math.min(band * config.barfill, barMax);
		const layout = groupLayout(band, geo.own.length, barMax);

		// A number after its bar is as far from it as from the top and bottom inside it. Digits are about 56% of the line height.
		const first = values[0] ?? geo.totals[0];
		const digits = first ? sizeOf(first).height * unit * 0.56 : 0;
		const gap = Math.max(((several && !geo.stacked ? layout.size : thickness) - digits) / 2, 5 * unit);

		// Room at the end for numbers after their bar; if every number fits inside, the bars take the whole width.
		const widthOf = (label: HTMLElement) => sizeOf(label).width * unit;

		const roomFor = (labels: HTMLElement[]) =>
			labels.length ? largest(labels.map(widthOf)) + gap + 4 * unit : 0;

		const valueOf = (seriesIndex: number, index: number) => (geo.rows[index].cells[seriesIndex] ?? geo.rows[index].cells[0]).value;

		const grouped = geo.own.flatMap((seriesIndex) =>
			geo.seriesValues[seriesIndex].map((label, index) => ({ label, value: valueOf(seriesIndex, index) }))
		);

		// A stack wholly below zero has its total before it.
		const backwards = (index: number) => {
			const reach = stackReach(geo.rows[index], geo.series.length);
			return reach.top === 0 && reach.bottom < 0;
		};

		let room = geo.stacked
			? roomFor(geo.totals.filter((_total, index) => !backwards(index)))
			: several
				? roomFor(grouped.filter((one) => one.value >= 0).map((one) => one.label))
				: 0;

		// Room before the zero line for the numbers of bars below zero.
		let before = geo.stacked
			? roomFor(geo.totals.filter((_total, index) => backwards(index)))
			: several
				? roomFor(grouped.filter((one) => one.value < 0).map((one) => one.label))
				: 0;

		// A number goes after its bar, or with `labels: "inside"`, inside it if it fits, as on a column chart.
		const fits = (label: HTMLElement, length: number) => geo.labels === "inside" && fitsLength(label, length, unit);

		// A group has room inside its bars only if a number is not higher than a bar.
		const inGroup = several && !geo.stacked && geo.labels === "inside" && !!first && sizeOf(first).height * unit <= layout.size;
		if (inGroup) room = before = 0;

		if (inGroup || (!several && !geo.stacked)) {
			const items = several
				? grouped.filter(({ label }) => label.dataset.missing === undefined)
				: segs.map((seg, index) => ({ label: values[index], value: seg.value }));

			// A narrower span can push another number out of its bar, so this repeats until the room stays the same.
			for (let tries = 0; tries < 3; tries++) {
				const span = right - left - room - before;
				const outside = items.filter(({ label, value }) => !fits(label, lengthOf(value, span)));
				const after = roomFor(outside.filter(({ value }) => value >= 0).map(({ label }) => label));
				const ahead = roomFor(outside.filter(({ value }) => value < 0).map(({ label }) => label));
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
			const stackGap = geo.length("--tablechart-stack-gap", "1px") ?? unit;

			geo.rows.forEach((row, rowIndex) => {
				const reach = stackReach(row, geo.series.length);
				const piece = stackMarks(geo, row, rowIndex, { "data-grow": "right" }, reach.bottom < 0 ? `${zero - x(reach.bottom)}px center` : "");
				const top = cy(rowIndex) - thickness / 2;
				const pieces = stackOf(row, geo.series.length);

				pieces.forEach(({ from, to, cell }, seriesIndex) => {
					const label = geo.seriesValues[seriesIndex][rowIndex];
					label.dataset.place = "none";
					if (cell.missing || to === from) return;
					const start = Math.min(x(from), x(to));
					const end = Math.max(x(from), x(to));

					// A gap in the background colour before the next piece, at the far end; the end at zero stays on the baseline.
					const gap = gapAfter(pieces, seriesIndex) ? Math.min(stackGap, (end - start) / 2) : 0;
					const [shownStart, shownEnd] = x(to) > x(from) ? [start, end - gap] : [start + gap, end];
					piece(seriesIndex, { x: shownStart, y: top, width: Math.max(shownEnd - shownStart, 1), height: thickness, ...(to < from && { "data-grow": "left" }), ...(!gapAfter(pieces, seriesIndex) && endOf(geo, to < from ? "left" : "right")) });

					// A number too big for its piece is left out until its row is pointed at.
					label.dataset.place = "inside";

					label.toggleAttribute(
						"data-left-out",
						!fitsLength(label, end - start, unit) || sizeOf(label).height * unit > thickness
					);

					inkOf(label, geo, seriesIndex);
					placeAt(label, (start + end) / 2, cy(rowIndex), VIEWBOX_WIDTH, height);
				});

				const total = geo.totals[rowIndex];

				if (total) {
					total.dataset.place = backwards(rowIndex) ? "before" : "after";
					placeAt(total, backwards(rowIndex) ? x(reach.bottom) - gap : x(reach.top) + gap, cy(rowIndex), VIEWBOX_WIDTH, height);
				}

				const name = categories[rowIndex];
				if (name) placeAt(name, left - 8 * unit, cy(rowIndex), VIEWBOX_WIDTH, height);
			});

			svg.appendChild(
				svgEl("line", { class: RULE_CLASS, x1: zero, x2: zero, y1: 0, y2: height })
			);

			return;
		}

		if (several) {
			// All numbers shrink together to fit beside their bars, or all are left out.
			const shown = geo.own.flatMap((seriesIndex) => geo.seriesValues[seriesIndex]).filter((label) => label.dataset.missing === undefined);
			const fit = fitTogether(geo.plot, shown, (label) => ({ size: sizeOf(label).height * unit, room: layout.size + layout.gap * 0.5 }), "--_fit", GROUP_FIT_MIN);

			geo.rows.forEach((row, rowIndex) => {
				geo.own.forEach((seriesIndex, index) => {
					const cell = row.cells[seriesIndex] ?? row.cells[0];
					const label = geo.seriesValues[seriesIndex][rowIndex];

					if (cell.missing) {
						label.dataset.place = "none";
						return;
					}

					const end = x(cell.value);
					const back = cell.value < 0;
					const top = cy(rowIndex) + layout.offset(index);

					// A value of zero has no bar. A very small one is at least one unit, on its own side of the zero line.
					const wide = Math.max(Math.abs(end - zero), 1);

					if (cell.value !== 0)
						svg.appendChild(
							svgEl("rect", {
								class: withRow(BAR_CLASS, row),
								"data-kind": "bar",
								"data-row": rowIndex + 1,
								"data-grow": back ? "left" : "right",
								x: back ? zero - wide : zero,
								y: top,
								width: wide,
								height: layout.size,
								...endOf(geo, back ? "left" : "right"),
								...seriesMark(geo, row, seriesIndex),
							})
						);

					const inside = inGroup && fits(label, Math.abs(end - zero));
					const pad = Math.max(Math.min(gap, Math.abs(end - zero) - widthOf(label) - 6 * unit), 6 * unit);
					const toward = back ? 1 : -1;
					label.dataset.place = inside ? "inside" : back ? "before" : "after";
					label.toggleAttribute("data-left-out", !fit);
					if (inside) inkOf(label, geo, seriesIndex);

					placeAt(
						label,
						!inside
							? back ? end - gap : end + gap
							: geo.insideAlign === "center"
								? (zero + end) / 2
								: geo.insideAlign === "start"
									? zero - toward * (pad + widthOf(label) / 2)
									: end + toward * (pad + widthOf(label) / 2),
						top + layout.size / 2,
						VIEWBOX_WIDTH,
						height
					);
				});

				const name = categories[rowIndex];
				if (name) placeAt(name, left - 8 * unit, cy(rowIndex), VIEWBOX_WIDTH, height);
			});

			svg.appendChild(
				svgEl("line", { class: RULE_CLASS, x1: zero, x2: zero, y1: 0, y2: height })
			);

			return;
		}

		// A number inside its bar is as far from the end, or start, as from the top and bottom, if its bar is long enough.
		const inside = segs.map((seg, index) => fits(values[index], Math.abs(x(seg.value) - zero)));

		segs.forEach((seg, index) => {
			const end = x(seg.value);
			const middle = cy(index);

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
						"data-row": index + 1,
						"data-grow": back ? "left" : "right",
						x: back ? zero - wide : zero,
						y: middle - thickness / 2,
						width: wide,
						height: thickness,
						...endOf(geo, back ? "left" : "right"),
						style: timing("--i", seg.slot),

						// The one series left on in a legend keeps its colour.
						...(geo.own.length < geo.series.length && seriesMark(geo, seg, geo.own[0])),
					})
				);

			const label = values[index];
			const pad = Math.max(Math.min(gap, length - widthOf(label) - 6 * unit), 6 * unit);

			// Measured from the end of the bar towards the zero line, left or right.
			const toward = back ? 1 : -1;
			label.dataset.place = inside[index] ? "inside" : back ? "before" : "after";
			label.dataset.kind = seg.kind;

			placeAt(
				label,
				!inside[index]
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

			const name = categories[index];
			if (name) placeAt(name, left - 8 * unit, middle, VIEWBOX_WIDTH, height);
		});

		svg.appendChild(
			svgEl("line", { class: RULE_CLASS, x1: zero, x2: zero, y1: 0, y2: height })
		);
	},
};
