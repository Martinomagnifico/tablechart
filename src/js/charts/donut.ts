import { DIVIDE_CLASS, LEADER_CLASS, SLICE_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { placeAt, svgEl, withRow } from "../functions/svg";
import type { ChartType, Geometry, Row, Segment } from "../types";

// Each ring gets a mask of its own, with an id that is unique on the page.
let masks = 0;

/**
 * Parts of a whole, as a ring.
 *
 * Each slice is a circle with one dash: the dash is the slice's share of the
 * circumference and the offset is where it starts, which is a great deal less
 * arithmetic than an arc path and animates by the same means as everything else —
 * the dash grows, so the ring draws itself round.
 *
 * A row marked `data-kind="total"` is the number in the middle rather than a
 * slice of the ring, so the whole is the one the author wrote. With no such row
 * the middle shows what the slices add up to, since then nothing else states it.
 *
 * The ring names no colour of its own: every slice is the same ink, stepped
 * towards the surface behind it by its place in the table, so a chart given
 * nothing still tells its slices apart. See the stylesheet.
 */
const slices = (rows: Row[]): Row[] => rows.filter((row) => !row.isTotal);

export const donut: ChartType = {
	// Nearly square, because a ring is. The page's own aspect suits a row of
	// columns and would make an oval of this.
	aspect: 0.66,
	centre: true,

	// It puts its own labels around the ring, so there is nothing to reserve above.
	headroom: () => 0,

	// One "bar" per row is what the default would make; a ring has no bars, but the
	// extent is still read off this, so the shares are what it reports.
	segments: (rows: Row[]): Segment[] =>
		rows.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const })),

	draw({ rows, height, unit, labelHeight, svg, values, config, centre }: Geometry) {
		const middleX = VIEWBOX_WIDTH / 2;
		const middleY = height / 2;

		const parts = slices(rows);
		const whole = parts.reduce((sum, row) => sum + Math.abs(row.value), 0);
		if (!whole) return;

		// Room all the way round for a label outside the ring, and for the leader
		// that reaches it: as far out as a label above or below the ring goes, which
		// is its push of 0.7 of a label height and its own half height past that.
		const margin = labelHeight * 1.2 + 10 * unit;
		const outer = Math.max(Math.min(VIEWBOX_WIDTH, height) / 2 - margin, 10);
		const thickness = outer * config.ringfill;
		const radius = outer - thickness / 2;
		const circumference = 2 * Math.PI * radius;

		// Where one slice meets the next. Kept until every slice is drawn, because the
		// partings go over the top of them.
		const partings: number[] = [];

		let run = 0;
		let part = 0;
		rows.forEach((row, i) => {
			const label = values[i];

			// A total belongs in the middle, and its label and category with it.
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
					// Its place in the ring, for a page that wants to name a colour per
					// slice: a hidden total means the nth of its type is not the nth slice.
					"data-slice": part + 1,
					"data-row": i + 1,
					cx: middleX,
					cy: middleY,
					r: radius,
					"stroke-width": thickness,
					// From twelve o'clock, the way a ring is read.
					transform: `rotate(-90 ${middleX} ${middleY})`,
					"stroke-dasharray": `${arc.toFixed(1)} ${(circumference - arc).toFixed(1)}`,
					"stroke-dashoffset": (-run).toFixed(1),
					style: `--n:${part}; --palette:var(--tablechart-color-${part + 1}); --arc:${arc.toFixed(1)}; --circ:${circumference.toFixed(1)}; ${timing("--i", row.slot)}`,
				})
			);

			// The label is outside the ring on the slice's own bearing, with a short
			// leader reaching back to it, so a thin slice is still claimed by its number.
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

			// The number is centred on the point it is given, so half of it would lie
			// back over the ring. Pushing it out by its own half-width where it stands
			// sideways, and its half-height where it stands above or below, clears it
			// in whichever direction it leans.
			const reach = outer + 9 * unit;
			const half = (label.offsetWidth * unit) / 2;
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

		// The gaps between slices are cut out of the ring with a mask, so the background
		// behind the chart shows through, whatever it is. A gap is a line across the
		// ring, not a shorter dash: a dash ends square to the circle, so its gap would
		// be wider at the outside than at the inside. A line is one width all the way.
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
