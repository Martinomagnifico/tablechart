import { AREA_CLASS, AREA_FILL_CLASS, HOLE_CLASS, POINT_CLASS, RULE_CLASS, SERIES_CLASS, VIEWBOX_WIDTH } from "../config";
import { stackOf } from "../functions/groups";
import { markerEl, markerOf } from "../functions/markers";
import { spread } from "../functions/labels";
import { curveLength, curveTo, fixed, tangentsWithGaps } from "../functions/smooth";
import { cutOut, placeAt, svgEl } from "../functions/svg";
import type { Cell, ChartType, Geometry, Row, Segment } from "../types";

type Point = [number, number];
type Place = "above" | "below" | "middle" | "none";

/** One segment per interval, so a line draws itself on left to right and each segment arrives with its point. */
const segments = (rows: Row[]): Segment[] =>
	rows.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const }));

const trend = (area: boolean): ChartType => ({
	segments,
	breakable: true,
	series: true,
	stackable: true,
	swatch: area ? "box" : undefined,

	headroom: ({ labelHeight, unit }) => labelHeight * 1.6 + 6 * unit,

	// Room under the baseline when the lower of two lines has its numbers under it; not for an area or a stack.
	footroom: ({ labelHeight, unit, series, focused, stacked }) =>
		!area && !stacked && series === 2 && !focused ? labelHeight + 7 * unit : 0,

	draw(geo: Geometry) {
		const { rows, series, seriesValues, names, cx, y, height, unit, labelHeight, svg, stacked } = geo;
		const step = geo.shape === "step";
		const smooth = geo.shape === "smooth";
		const several = series.length > 1;
		const focused = series.some((one) => one.focus);
		const last = rows.length - 1;
		const baseline = y(0);
		// The width of a row; a step is flat across it.
		const band = rows.length > 1 ? cx(1) - cx(0) : cx(0) * 2;

		// Where an "up" animation grows from, and how far each point rises.
		svg.style.setProperty("--tablechart-base", `${fixed(baseline)}px`);
		const riseFrom = (pointY: number) => `--rise:${fixed(baseline - pointY)}px; `;

		// In the helpers below, `s` is a series and `i` a row.
		const cellAt = (s: number, i: number): Cell | undefined => rows[i]?.cells[s] ?? rows[i]?.cells[0];
		const missing = (s: number, i: number): boolean => !cellAt(s, i) || !!cellAt(s, i)?.missing;
		const stacks = rows.map((row) => (stacked ? stackOf(row, series.length) : null));
		// Where a line is, as a value: on zero, or in a stack on the line before it.
		const topValue = (s: number, i: number): number => stacks[i]?.[s].to ?? cellAt(s, i)?.value ?? 0;
		const bottomValue = (s: number, i: number): number => stacks[i]?.[s].from ?? 0;
		const pointAt = (s: number, i: number): Point => [cx(i), y(topValue(s, i))];

		// What tells one series from another, on every mark of it.
		const marks = series.map((one, s) => {
			if (!several) return { attrs: {}, ink: "" };
			const muted = focused && !one.focus;
			return {
				attrs: { "data-series": s + 1, ...(muted && { "data-muted": "" }) },
				ink: `--n:${s}; --m:${muted ? 1 : 0}; --palette:var(--tablechart-color-${s + 1}); `,
			};
		});

		// The line builds at an even speed, in stagger steps, and a long line takes no more than six in all.
		const totalSteps = Math.min(last, 6);
		const stepsPerRow = last > 0 ? totalSteps / (step ? rows.length : last) : 1;
		// When the line reaches point i, or the start of row i on a step chart.
		const reach = (i: number): number => i * stepsPerRow;
		const pointTiming = (i: number): string => `--i:${fixed(reach(i))}`;
		const pieceTiming = (i: number): string => `--i:${fixed(reach(i) + 1)}; --d:${fixed(reach(i + 1) - reach(i))}`;

		// The pieces of a line: one per interval from point i to the next, or one per row on a step chart.
		const pieces = (s: number): { i: number; next: boolean }[] =>
			rows
				.map((_row, i) => ({ i, next: i < last && !missing(s, i + 1) }))
				.filter(({ i, next }) => !missing(s, i) && (step || next));

		// For a smooth chart, the slope at each point: of the top of each line, and of the bottom of each area.
		const topSlopes = smooth ? series.map((_one, s) => tangentsWithGaps(rows.length, (i) => missing(s, i), (i) => pointAt(s, i))) : [];
		const bottomSlopes =
			smooth && area
				? series.map((_one, s) => tangentsWithGaps(rows.length, (i) => missing(s, i), (i) => [cx(i), y(bottomValue(s, i))]))
				: [];

		const drawArea = (s: number) => {
			// The opacity is on the group, so two pieces of one area do not add up to a darker seam.
			const group = svgEl("g", {
				class: AREA_CLASS,
				...marks[s].attrs,
				...(stacked && { "data-stacked": "" }),
				style: marks[s].ink,
			});
			const all = pieces(s);
			const fill = svgEl("g", {
				class: AREA_FILL_CLASS,
				style: `--rows:${fixed(totalSteps + 1)}; ${all.length ? pieceTiming(all[0].i) : ""}`,
			});
			group.appendChild(fill);

			for (const { i, next } of all) {
				const x1 = step ? cx(i) - band / 2 : cx(i);
				const x2 = step ? cx(i) + band / 2 : cx(i + 1);
				const [top1, bottom1] = [y(topValue(s, i)), y(bottomValue(s, i))];
				const [top2, bottom2] = step ? [top1, bottom1] : [y(topValue(s, i + 1)), y(bottomValue(s, i + 1))];

				// Each piece reaches a little past its right edge, under the next piece, so no seam shows between them.
				const nextEnd = step ? i + 1 : i + 2;
				const joined = step ? next : i + 1 < last && !missing(s, i + 2);
				let overlap = joined ? 1.5 * unit : 0;
				// Where an edge is at the end of the overlap, kept within both this piece and the next one.
				const reachAt = (start: number, end: number, endOfNext: number, slope: number, within: (a: number, b: number) => number) => {
					if (!joined) return end;
					if (smooth) return end + slope * overlap;
					if (step) return within(end, endOfNext);
					const ownSlope = (end - start) / (x2 - x1);
					const nextSlope = (endOfNext - end) / (cx(nextEnd) - x2);
					return within(end + ownSlope * overlap, end + nextSlope * overlap);
				};
				const topOver = reachAt(top1, top2, y(topValue(s, nextEnd)), topSlopes[s]?.[i + 1], Math.max);
				const bottomOver = reachAt(bottom1, bottom2, y(bottomValue(s, nextEnd)), bottomSlopes[s]?.[i + 1], Math.min);
				if (topOver >= bottomOver) overlap = 0;
				const overlapEdge = overlap ? [`L${fixed(x2 + overlap)},${fixed(topOver)}`, `L${fixed(x2 + overlap)},${fixed(bottomOver)}`] : [];

				if (smooth) {
					const d = [
						`M${fixed(x1)},${fixed(bottom1)}`,
						`L${fixed(x1)},${fixed(top1)}`,
						curveTo([x1, top1], [x2, top2], topSlopes[s][i], topSlopes[s][i + 1]),
						...overlapEdge,
						`L${fixed(x2)},${fixed(bottom2)}`,
						curveTo([x2, bottom2], [x1, bottom1], bottomSlopes[s][i + 1], bottomSlopes[s][i]),
						"Z",
					].join(" ");
					fill.appendChild(svgEl("path", { d, "data-row": i + 2, style: pieceTiming(i) }));
					continue;
				}

				const corners = step
					? [[x1, bottom1], [x1, top1], [x2, top1], [x2, topOver], [x2 + overlap, topOver], [x2 + overlap, bottomOver], [x2, bottomOver], [x2, bottom1]]
					: [[x1, bottom1], [x1, top1], [x2, top2], [x2 + overlap, topOver], [x2 + overlap, bottomOver], [x2, bottom2]];
				fill.appendChild(
					svgEl("polygon", {
						points: corners.map((corner) => corner.join(",")).join(" "),
						"data-row": (step ? i : i + 1) + 1,
						style: pieceTiming(i),
					})
				);
			}
			svg.appendChild(group);
		};

		const drawLine = (s: number) => {
			const one = series[s];
			// How far along its line each piece starts, so the dashes of a dashed line run on from piece to piece.
			let along = 0;
			const add = (shape: Record<string, string | number>, length: number, row: number, timing: string) => {
				svg.appendChild(
					svgEl(shape.d ? "path" : "polyline", {
						class: SERIES_CLASS,
						...marks[s].attrs,
						...shape,
						...(one.line && { "data-line": one.line }),
						"data-row": row,
						style: `${marks[s].ink}--len:${length.toFixed(1)}; --along:${(-along).toFixed(1)}; ${timing}`,
					})
				);
				along += length - 1;
			};
			// In pixels: the stroke does not scale, so its dashes are measured at the size the figure is shown.
			const straightLength = (a: Point, b: Point) => 1 + Math.hypot(b[0] - a[0], b[1] - a[1]) / unit;
			const polyline = (a: Point, b: Point) => ({ points: `${a.join(",")} ${b.join(",")}` });

			for (const { i, next } of pieces(s)) {
				if (smooth) {
					const [a, b] = [pointAt(s, i), pointAt(s, i + 1)];
					const [slopeA, slopeB] = [topSlopes[s][i], topSlopes[s][i + 1]];
					const d = `M${fixed(a[0])},${fixed(a[1])} ${curveTo(a, b, slopeA, slopeB)}`;
					add({ d }, 1 + curveLength(a, b, slopeA, slopeB) / unit, i + 2, pieceTiming(i));
				} else if (step) {
					const level = y(topValue(s, i));
					const [a, b]: Point[] = [[cx(i) - band / 2, level], [cx(i) + band / 2, level]];
					add(polyline(a, b), straightLength(a, b), i + 1, pieceTiming(i));
					// The rise or drop to the next row is a quick piece of its own, so the line does not stall on it.
					const nextLevel = y(topValue(s, i + 1));
					if (next && nextLevel !== level) {
						const c: Point = [b[0], nextLevel];
						add(polyline(b, c), straightLength(b, c), i + 2, `--i:${fixed(reach(i + 1) + 1)}; --d:0.25`);
					}
				} else {
					const [a, b] = [pointAt(s, i), pointAt(s, i + 1)];
					add(polyline(a, b), straightLength(a, b), i + 2, pieceTiming(i));
				}
			}
		};

		const drawPoints = () => {
			const markers = series.map((_one, s) => (several ? markerOf(series, s) : { shape: "circle" as const, open: false }));
			const point = (s: number, i: number, attrs: Record<string, string | number>) => {
				const [px, py] = pointAt(s, i);
				return markerEl(markers[s].shape, px, py, 4 * unit, { ...attrs, style: `${attrs.style ?? ""}${riseFrom(py)}${pointTiming(i)}` });
			};
			const shown = (s: number) => rows.map((_row, i) => i).filter((i) => !missing(s, i));

			// An open point is a hole in the lines and areas under it.
			const holes = series.flatMap((_one, s) =>
				markers[s].open
					? shown(s).map((i) => point(s, i, { class: HOLE_CLASS, "data-row": i + 1, ...(several && { "data-series": s + 1 }) }))
					: []
			);
			cutOut(svg, holes, VIEWBOX_WIDTH, height);

			series.forEach((_one, s) => {
				for (const i of shown(s)) {
					svg.appendChild(
						point(s, i, {
							class: POINT_CLASS,
							...marks[s].attrs,
							"data-marker": markers[s].shape,
							...(markers[s].open && { "data-open": "" }),
							"data-row": i + 1,
							style: marks[s].ink,
						})
					);
				}
			});
		};

		// Areas first, then every line, then the points, so a point is always on top of a line.
		if (area) series.forEach((_one, s) => drawArea(s));
		series.forEach((_one, s) => drawLine(s));
		// A step chart has no points: its corners show where the values change.
		if (!step) drawPoints();

		// On a step chart, the last row from row i on that has the same value.
		const runEnd = (s: number, i: number): number => {
			let end = i;
			while (end < last && !missing(s, end + 1) && cellAt(s, end + 1)?.value === cellAt(s, i)?.value) end++;
			return end;
		};

		const placeOf = (s: number, i: number): Place => {
			const cell = cellAt(s, i);
			if (!cell || cell.missing) return "none";
			// A step chart shows a number only where the value changes.
			if (step && i > 0 && !missing(s, i - 1) && cellAt(s, i - 1)?.value === cell.value) return "none";
			if (focused && !series[s].focus) return "none";
			if (stacked) return "middle";
			if (!several || focused || series.length > 2) return "above";
			const other = cellAt(1 - s, i);
			if (!other || other.missing) return "above";
			// The higher of two goes above its point; on a tie, the first does.
			if (cell.value > other.value || (cell.value === other.value && s === 0)) return "above";
			// In an area chart, a number under its point may not cross zero.
			if (area && pointAt(s, i)[1] + 7 * unit + labelHeight > baseline) return "above";
			return "below";
		};

		// A number with no room is still placed, so it can be shown when its row is pointed at.
		const leftOut = (s: number, i: number): boolean => {
			if (!stacked && !step) return several && !focused && series.length > 2;
			const width = seriesValues[s][i].offsetWidth * unit;
			const rowsWide = step ? runEnd(s, i) - i + 1 : 1;
			if (width > rowsWide * band - 4 * unit) return true;
			return stacked && y(bottomValue(s, i)) - y(topValue(s, i)) < labelHeight * 1.2;
		};

		seriesValues.forEach((labels, s) => {
			labels.forEach((label, i) => {
				// A number arrives when the line reaches it: its point, or the middle of its row on a step chart.
				label.style.setProperty("--i", String(fixed(step ? (reach(i) + reach(i + 1)) / 2 : reach(i))));
				const place = placeOf(s, i);
				label.dataset.place = place === "above" ? "outside" : place;
				label.toggleAttribute("data-left-out", place !== "none" && leftOut(s, i));
				if (step && place !== "none") label.dataset.rowEnd = String(runEnd(s, i) + 1);
				else delete label.dataset.rowEnd;
				if (place === "none") return;

				// On a step chart, in the middle of the rows with this value. In a stack, a number at an end is moved inwards, clear of the names.
				const inwards = (label.offsetWidth * unit) / 2 + 4 * unit;
				let x = cx(i);
				if (step) x = (cx(i) + cx(runEnd(s, i))) / 2;
				else if (place === "middle" && i === 0) x += inwards;
				else if (place === "middle" && i === last) x -= inwards;

				const py = y(topValue(s, i));
				const offsets: Record<Exclude<Place, "none">, number> = {
					middle: (y(bottomValue(s, i)) - py) / 2,
					above: -7 * unit,
					below: 7 * unit,
				};
				placeAt(label, x, py + offsets[place], VIEWBOX_WIDTH, height);
			});
		});

		// Each name just past the last point of its line, pushed apart where two lines end close together.
		const ends = names.map((name, s) => {
			let i = last;
			while (i > 0 && missing(s, i)) i--;
			const [px, py] = pointAt(s, i);
			const end = step ? px + band / 2 : px;
			return { name, x: end + 10 * unit, y: stacked ? (py + y(bottomValue(s, i))) / 2 : py };
		});
		const nameHeight = (names[0]?.offsetHeight || 0) * unit;
		for (const end of spread(ends, nameHeight)) placeAt(end.name, end.x, end.y, VIEWBOX_WIDTH, height);

		// With numbers under the lower line, the rule is the foot of the plot rather than zero.
		const rule = !area && !stacked && series.length === 2 && !focused ? height - 2 * unit : baseline;
		svg.appendChild(
			svgEl("line", {
				class: RULE_CLASS,
				x1: 0,
				// Past the last band is where the names are.
				x2: cx(last) + cx(0),
				y1: rule,
				y2: rule,
			})
		);
	},
});

export const line = trend(false);
export const area = trend(true);
