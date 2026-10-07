import { sizeOf } from "../functions/measure";
import { DIVIDE_CLASS, LEADER_CLASS, SLICE_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { placeAt, svgEl, withRow } from "../functions/svg";
import type { ChartType, Geometry, Row, Segment } from "../types";

let masks = 0;

/** Each slice is a circle with one dash, so the ring draws itself round. A total row is the number in the middle. */
const slices = (rows: Row[]): Row[] => rows.filter((row) => !row.isTotal);

export const donut: ChartType = {
	aspect: 0.66,
	centre: true,

	headroom: () => 0,

	// The extent is read off these, though a ring has no bars.
	segments: (rows: Row[]): Segment[] =>
		rows.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const })),

	draw({ rows, height, unit, labelHeight, svg, values, config, centre }: Geometry) {
		const middleX = VIEWBOX_WIDTH / 2;
		const middleY = height / 2;

		const parts = slices(rows);
		const whole = parts.reduce((sum, row) => sum + Math.abs(row.value), 0);
		if (!whole) return;

		// Room all round for a label outside the ring and its leader.
		const margin = labelHeight * 1.2 + 10 * unit;
		const outer = Math.max(Math.min(VIEWBOX_WIDTH, height) / 2 - margin, 10);
		const thickness = outer * config.ringfill;
		const radius = outer - thickness / 2;
		const circumference = 2 * Math.PI * radius;

		// Kept until every slice is drawn, because the partings go over them.
		const partings: number[] = [];

		let run = 0;
		let part = 0;
		rows.forEach((row, i) => {
			const label = values[i];

			if (row.isTotal) {
				label.dataset.place = "none";
				return;
			}

			const share = Math.abs(row.value) / whole;
			const arc = share * circumference;
			const angle = (run / circumference) * 2 * Math.PI - Math.PI / 2;
			partings.push(angle);

			svg.appendChild(
				svgEl("circle", {
					class: withRow(SLICE_CLASS, row),
					// A hidden total means the nth of its type is not the nth slice.
					"data-slice": part + 1,
					"data-row": i + 1,
					cx: middleX,
					cy: middleY,
					r: radius,
					"stroke-width": thickness,
					transform: `rotate(-90 ${middleX} ${middleY})`,
					"stroke-dasharray": `${arc.toFixed(1)} ${(circumference - arc).toFixed(1)}`,
					"stroke-dashoffset": (-run).toFixed(1),
					style: `--n:${part}; --palette:var(--tablechart-color-${part + 1}); --arc:${arc.toFixed(1)}; --circ:${circumference.toFixed(1)}; ${timing("--i", row.slot)}`,
				})
			);

			const middle = angle + (arc / circumference) * Math.PI;
			const cos = Math.cos(middle);
			const sin = Math.sin(middle);
			svg.appendChild(
				svgEl("line", {
					class: LEADER_CLASS,
					x1: middleX + cos * (outer + 2 * unit),
					y1: middleY + sin * (outer + 2 * unit),
					x2: middleX + cos * (outer + 7 * unit),
					y2: middleY + sin * (outer + 7 * unit),
					"data-row": i + 1,
					style: timing("--i", row.slot),
				})
			);

			// Pushed out by its half-width or half-height, depending on how it leans, so it clears the ring.
			const reach = outer + 9 * unit;
			const half = (sizeOf(label).width * unit) / 2;
			placeAt(
				label,
				middleX + cos * (reach + Math.abs(cos) * half),
				middleY + sin * (reach + Math.abs(sin) * labelHeight * 0.7),
				VIEWBOX_WIDTH,
				height
			);
			label.dataset.place = "around";

			run += arc;
			part += 1;
		});

		// A gap is a line across the ring, cut with a mask: a shorter dash would leave a gap wider outside than inside.
		if (partings.length > 1) {
			const inner = radius - thickness / 2 - 1;
			const outer2 = radius + thickness / 2 + 1;
			const id = `tablechart-slices-${++masks}`;
			const mask = svgEl("mask", { id, maskUnits: "userSpaceOnUse" });
			mask.appendChild(
				svgEl("rect", { x: 0, y: 0, width: VIEWBOX_WIDTH, height, fill: "white" })
			);
			for (const angle of partings) {
				mask.appendChild(
					svgEl("line", {
						class: DIVIDE_CLASS,
						x1: middleX + Math.cos(angle) * inner,
						y1: middleY + Math.sin(angle) * inner,
						x2: middleX + Math.cos(angle) * outer2,
						y2: middleY + Math.sin(angle) * outer2,
					})
				);
			}
			const group = svgEl("g", { mask: `url(#${id})` });
			for (const slice of Array.from(svg.querySelectorAll(`.${SLICE_CLASS}`))) group.appendChild(slice);
			const defs = svgEl("defs");
			defs.appendChild(mask);
			svg.prepend(defs, group);
		}

		if (centre) placeAt(centre, middleX, middleY, VIEWBOX_WIDTH, height);
	},
};
