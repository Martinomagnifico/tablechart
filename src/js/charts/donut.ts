import { sizeOf } from "../layout/measure";
import { measureSurface, paintOf, rgbOf, sharedInk } from "../colour/colour";
import { DIVIDE_CLASS, LEADER_CLASS, SLICE_CLASS, VIEWBOX_WIDTH } from "../config";
import { sweepTiming, timing } from "../shared/timing";
import { placeAt, short, svgEl, withRow } from "../draw/svg";
import type { ChartType, Geometry, Row, Segment } from "../types";

/** What the mask cuts from a corner of a slice: between its side, the edge of the ring and an arc that touches both. */
const cornerCut = (cx: number, cy: number, angle: number, ring: number, side: number, half: number, cornerRadius: number, outer: boolean): string => {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	const at = (along: number, across: number) => [cx + along * cos - side * across * sin, cy + along * sin + side * across * cos];

	const centreRing = outer ? ring - cornerRadius : ring + cornerRadius;
	const distance = Math.sqrt(Math.max(centreRing ** 2 - (half + cornerRadius) ** 2, 0));
	const ringTouch = ring / centreRing;
	const past = outer ? ring + 8 : ring - 3;
	const beyond = past / centreRing;
	const inGap = Math.max(half - 1, 0);
	const [ax, ay] = at(distance * ringTouch, (half + cornerRadius) * ringTouch);
	const [lx, ly] = at(distance, half);
	const [mx, my] = at(distance, half + cornerRadius);
	const sweep = (ax - mx) * (ly - my) - (ay - my) * (lx - mx) > 0 ? 1 : 0;

	const point = (coordinates: number[]) => `${short(coordinates[0])},${short(coordinates[1])}`;

	return `M${point([ax, ay])}A${short(cornerRadius)},${short(cornerRadius)} 0 0 ${sweep} ${point([lx, ly])}L${point(at(distance, inGap))}L${point(at(past, inGap))}L${point(at(distance * beyond, (half + cornerRadius) * beyond))}Z`;
};

let masks = 0;

/** Whether a box centred at `at` lies in the slice from `start` over `sweep`, at least `margin` from its sides and the edge. */
const fitsIn = (at: number[], width: number, tall: number, cx: number, cy: number, start: number, sweep: number, outer: number, margin: number): boolean =>
	[-1, 1].every((dx) =>
		[-1, 1].every((dy) => {
			const x = at[0] + (dx * width) / 2 - cx;
			const y = at[1] + (dy * tall) / 2 - cy;
			const distance = Math.hypot(x, y);
			const turned = (((Math.atan2(y, x) - start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
			const fromSide = Math.min(turned, sweep - turned);
			return distance <= outer - margin && turned <= sweep && (fromSide >= Math.PI / 2 || distance * Math.sin(fromSide) >= margin);
		})
	);

/** Each slice is a circle with one dash, so the ring draws itself round. A total row is the central value. */
const slices = (rows: Row[]): Row[] => rows.filter((row) => !row.isTotal);

/** A ring of slices: as thick as the `ringfill` option, or with `fill` 1 a pie, which has no central value. */
const ring = (fill?: number): ChartType => ({
	aspect: 0.66,
	centre: true,

	headroom: () => 0,

	// The extent is read off these, though a ring has no bars.
	segments: (rows: Row[]): Segment[] =>
		rows.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const })),

	draw({ rows, height, unit, labelHeight, svg, values, config, centre, sliceRadius }: Geometry) {
		const middleX = VIEWBOX_WIDTH / 2;
		const middleY = height / 2;

		const parts = slices(rows);
		const inside = fill === 1 && svg.closest("[data-chart]")?.getAttribute("data-chart-labels") !== "outside";
		const whole = parts.reduce((sum, row) => sum + Math.abs(row.value), 0);
		if (!whole) return;

		// Room all round for a label outside the ring and its leader.
		const margin = labelHeight * 1.2 + 10 * unit;
		const outer = Math.max(Math.min(VIEWBOX_WIDTH, height) / 2 - margin, 10);

		// A pie keeps a hole of a hundredth of a unit: a stroke that reaches the middle exactly draws stray wedges.
		const thickness = fill === 1 ? outer - unit / 100 : outer * (fill ?? config.ringfill);
		const radius = outer - thickness / 2;
		const circumference = 2 * Math.PI * radius;

		// A dash pattern a unit longer than the ring: with rounding, a shorter one starts again and paints a wedge at the top.
		const period = circumference + 1;

		// Kept until every slice is drawn, because the partings go over them.
		const partings: number[] = [];
		const sweeps: number[] = [];

		let run = 0;
		let part = 0;

		// Where each slice is in a sweep round the ring; only a donut that sweeps uses it.
		let before = 0;
		const within: { label: HTMLElement; slice: SVGElement; outside: () => void }[] = [];

		rows.forEach((row, rowIndex) => {
			const label = values[rowIndex];

			if (row.isTotal) {
				label.dataset.place = "none";
				return;
			}

			const share = Math.abs(row.value) / whole;
			const own = sweepTiming(before, share);
			const timed = `--share:${share.toFixed(4)}; --start:${own.start.toFixed(4)}; --span:${own.span.toFixed(4)};`;
			const arc = share * circumference;
			const angle = (run / circumference) * 2 * Math.PI - Math.PI / 2;
			partings.push(angle);
			sweeps.push((arc / circumference) * 2 * Math.PI);

			const slice = svgEl("circle", {
					class: withRow(SLICE_CLASS, row),

					// A hidden total means the nth of its type is not the nth slice.
					"data-slice": part + 1,
					"data-row": rowIndex + 1,
					cx: middleX,
					cy: middleY,
					r: radius,
					"stroke-width": thickness,
					transform: `rotate(-90 ${middleX} ${middleY})`,
					"stroke-dasharray": `${arc.toFixed(1)} ${(period - arc).toFixed(1)}`,
					"stroke-dashoffset": (-run).toFixed(1),
					style: `--n:${part}; --palette:var(--tablechart-color-${part + 1}); --arc:${arc.toFixed(1)}; --circ:${period.toFixed(1)};${timed} --ease:${own.easing}; ${timing("--i", row.slot)}`,
				});

			svg.appendChild(slice);

			const middle = angle + (arc / circumference) * Math.PI;
			const cos = Math.cos(middle);
			const sin = Math.sin(middle);
			label.style.setProperty("--start", own.start.toFixed(4));
			label.style.setProperty("--span", own.span.toFixed(4));

			const width = sizeOf(label).width * unit;

			// Next to its slice, with a short line, pushed out by its half-width or half-height, depending on how it leans.
			const outside = () => {
				svg.appendChild(
					svgEl("line", {
						class: LEADER_CLASS,
						x1: middleX + cos * (outer + 2 * unit),
						y1: middleY + sin * (outer + 2 * unit),
						x2: middleX + cos * (outer + 7 * unit),
						y2: middleY + sin * (outer + 7 * unit),
						"data-row": rowIndex + 1,
						style: `${timed} ${timing("--i", row.slot)}`,
					})
				);

				const reach = outer + 9 * unit;
				placeAt(label, middleX + cos * (reach + (Math.abs(cos) * width) / 2), middleY + sin * (reach + Math.abs(sin) * labelHeight * 0.7), VIEWBOX_WIDTH, height);
				label.dataset.place = "around";
			};

			// On a pie, a number goes inside its slice if it fits there, clear of the gaps and the edge.
			const at = outer * 0.62;
			const sweep = (arc / circumference) * 2 * Math.PI;

			if (inside && fitsIn([middleX + cos * at, middleY + sin * at], width, labelHeight, middleX, middleY, angle, sweep, outer, 6 * unit)) {
				placeAt(label, middleX + cos * at, middleY + sin * at, VIEWBOX_WIDTH, height);
				label.dataset.place = "inside";
				within.push({ label, slice, outside });
			} else outside();

			run += arc;
			before += share;
			part += 1;
		});

		// The numbers inside share one colour; a slice where it has too little contrast keeps its number outside.
		if (within.length) {
			const figure = svg.closest<HTMLElement>("[data-chart]");

			if (figure) {
				measureSurface(figure);
				const { ink, fits } = sharedInk(figure, within.map(({ slice }) => rgbOf(paintOf(slice))));
				within.forEach(({ label, outside }, index) => (fits[index] ? label.style.setProperty("--_ink", ink) : outside()));
			}
		}

		// A gap is a line across the ring, cut with a mask: a shorter dash would leave a gap wider outside than inside.
		// `grow` makes every cut wider, for the slices inside an edge: the gaps, the rounded corners, and the inside and outside.
		const pie = radius - thickness / 2 <= unit;
		const gap = Number.parseFloat(getComputedStyle(svg).getPropertyValue("--tablechart-slice-gap").trim() || "4");

		const gapMask = (id: string, grow: number): SVGMaskElement => {
			const mask = svgEl("mask", { id, maskUnits: "userSpaceOnUse" });
			mask.appendChild(svgEl("rect", { x: 0, y: 0, width: VIEWBOX_WIDTH, height, fill: "white" }));
			const inner = radius - thickness / 2 - 1;
			const outerEnd = radius + thickness / 2 + 1;

			for (const angle of partings) {
				const line = svgEl("line", {
					class: DIVIDE_CLASS,
					x1: middleX + Math.cos(angle) * inner,
					y1: middleY + Math.sin(angle) * inner,
					x2: middleX + Math.cos(angle) * outerEnd,
					y2: middleY + Math.sin(angle) * outerEnd,
				});

				if (grow) line.style.strokeWidth = `calc(var(--tablechart-slice-gap, 4) + ${short(2 * grow)})`;
				mask.appendChild(line);
			}

			if (sliceRadius > 0) {
				// A pie has no inner edge, so only its outer corners are round.
				const edges = pie ? [radius + thickness / 2 - grow] : [radius - thickness / 2 + grow, radius + thickness / 2 - grow];

				// How round a corner can be, by the length of the slice along its shortest edge.
				const shortest = pie ? radius + thickness / 2 : radius - thickness / 2;

				const roundOf = (index: number) => Math.min(sliceRadius, thickness / 2, Math.max((sweeps[index] * shortest - gap) / 2, 0));

				partings.forEach((angle, index) => {
					const before = roundOf((index - 1 + partings.length) % partings.length);

					for (const [side, round] of [[1, roundOf(index)], [-1, before]] as const) {
						const corner = Math.max(round - grow, 0);
						if (!corner) continue;

						for (const edge of edges) {
							const cut = cornerCut(middleX, middleY, angle, edge, side, gap / 2 + grow, corner, edge === edges.at(-1));
							mask.appendChild(svgEl("path", { d: cut, fill: "black" }));
						}
					}
				});
			}

			return mask;
		};

		if (partings.length > 1) {
			const id = `tablechart-slices-${++masks}`;
			const group = svgEl("g", { mask: `url(#${id})` });
			for (const slice of Array.from(svg.querySelectorAll(`.${SLICE_CLASS}`))) group.appendChild(slice);
			const defs = svgEl("defs");
			defs.appendChild(gapMask(id, 0));

			// The mask for slices inside an edge, one edge width narrower all round; used only if a slice gets an edge.
			const edgeWidth = (Number.parseFloat(getComputedStyle(svg).getPropertyValue("--tablechart-bar-edge-width")) || 1) * unit;
			defs.appendChild(gapMask(`${id}-inside`, edgeWidth));
			svg.dataset.sliceMask = `${id}-inside`;
			svg.prepend(defs, group);
		} else delete svg.dataset.sliceMask;

		if (centre) {
			centre.hidden = fill === 1;
			placeAt(centre, middleX, middleY, VIEWBOX_WIDTH, height);
		}
	},
});

export const donut = ring();
export const pie = ring(1);
