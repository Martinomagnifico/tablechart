import { sizeOf } from "../functions/measure";
import { AREA_CLASS, AREA_FILL_CLASS, HOLE_CLASS, POINT_CLASS, RULE_CLASS, SERIES_CLASS, VIEWBOX_WIDTH } from "../config";
import { stackOf } from "../functions/groups";
import { markerEl, markerOf } from "../functions/markers";
import { spread } from "../functions/labels";
import { curveTo, fixed, tangentsWithGaps } from "../functions/smooth";
import { cutOut, placeAt, svgEl } from "../functions/svg";
import type { Cell, ChartType, Geometry, Row, Segment } from "../types";

type Point = [number, number];
type Place = "above" | "below" | "middle" | "none";

/** One segment per interval, so a line draws itself on left to right and each segment arrives with its point. */
const segments = (rows: Row[]): Segment[] =>
	rows.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const }));

const trend = (area: boolean): ChartType => ({
	segments,
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

		// A line runs from point to point until a value is missing; on a step chart a run can be one row.
		const runsOf = (s: number): [number, number][] => {
			const runs: [number, number][] = [];
			let first = -1;
			rows.forEach((_row, i) => {
				if (missing(s, i)) return;
				if (first < 0) first = i;
				if (i === last || missing(s, i + 1)) {
					if (step || i > first) runs.push([first, i]);
					first = -1;
				}
			});
			return runs;
		};
		// A run is revealed from left to right while the line reaches its points: on a step chart, to the end of its last row.
		const runTiming = (a: number, b: number): string => `--i:${fixed(reach(a) + 1)}; --d:${fixed(reach(step ? b + 1 : b) - reach(a))}`;
		const runAttrs = (a: number, b: number) => ({ "data-from": a + 1, "data-to": b + 1, ...(step && { "data-flat": "" }) });

		// For a smooth chart, the slope at each point: of the top of each line, and of the bottom of each area.
		const topSlopes = smooth ? series.map((_one, s) => tangentsWithGaps(rows.length, (i) => missing(s, i), (i) => pointAt(s, i))) : [];
		const bottomSlopes =
			smooth && area
				? series.map((_one, s) => tangentsWithGaps(rows.length, (i) => missing(s, i), (i) => [cx(i), y(bottomValue(s, i))]))
				: [];

		// The path commands through `points` after a path that is at the first one (on a step chart, at its left edge).
		// `direction` is -1 for the way back, from right to left.
		const through = (points: Point[], slopes: number[] | null, direction: 1 | -1): string[] => {
			const commands: string[] = [];
			points.forEach(([x, py], k) => {
				if (step) {
					commands.push(`H${fixed(x + (direction * band) / 2)}`);
					if (k < points.length - 1) commands.push(`V${fixed(points[k + 1][1])}`);
				} else if (k > 0) {
					commands.push(slopes ? curveTo(points[k - 1], [x, py], slopes[k - 1], slopes[k]) : `L${fixed(x)},${fixed(py)}`);
				}
			});
			return commands;
		};
		const pointsOf = (s: number, a: number, b: number, value: (s: number, i: number) => number): Point[] =>
			rows.slice(a, b + 1).map((_row, k) => [cx(a + k), y(value(s, a + k))]);
		const slopesOf = (slopes: number[][], s: number, a: number, b: number): number[] | null => (smooth ? slopes[s].slice(a, b + 1) : null);
		// Where a run starts and ends across the plot: on a step chart, at the edges of its first and last row.
		const leftOf = (a: number) => cx(a) - (step ? band / 2 : 0);
		const rightOf = (b: number) => cx(b) + (step ? band / 2 : 0);

		const drawArea = (s: number) => {
			const group = svgEl("g", {
				class: AREA_CLASS,
				...marks[s].attrs,
				...(stacked && { "data-stacked": "" }),
				style: marks[s].ink,
			});
			const runs = runsOf(s);
			const fill = svgEl("g", {
				class: AREA_FILL_CLASS,
				style: `--rows:${fixed(totalSteps + 1)}; ${runs.length ? runTiming(...runs[0]) : ""}`,
			});
			group.appendChild(fill);

			// One shape per run: along the top from left to right, and back along the bottom.
			for (const [a, b] of runs) {
				const top = pointsOf(s, a, b, topValue);
				const bottom = pointsOf(s, a, b, bottomValue);
				const backSlopes = slopesOf(bottomSlopes, s, a, b)?.reverse() ?? null;
				const d = [
					`M${fixed(leftOf(a))},${fixed(bottom[0][1])}`,
					`L${fixed(leftOf(a))},${fixed(top[0][1])}`,
					...through(top, slopesOf(topSlopes, s, a, b), 1),
					`L${fixed(rightOf(b))},${fixed(bottom[bottom.length - 1][1])}`,
					...through(bottom.reverse(), backSlopes, -1),
					"Z",
				].join(" ");
				fill.appendChild(svgEl("path", { d, ...runAttrs(a, b), style: runTiming(a, b) }));
			}
			svg.appendChild(group);
		};

		// One path per run, so a dashed line runs on without a break and a line is one element, however long.
		const drawLine = (s: number) => {
			const one = series[s];
			for (const [a, b] of runsOf(s)) {
				const top = pointsOf(s, a, b, topValue);
				const d = [`M${fixed(leftOf(a))},${fixed(top[0][1])}`, ...through(top, slopesOf(topSlopes, s, a, b), 1)].join(" ");
				svg.appendChild(
					svgEl("path", {
						class: SERIES_CLASS,
						...marks[s].attrs,
						d,
						...(one.line && { "data-line": one.line }),
						...runAttrs(a, b),
						style: `${marks[s].ink}${runTiming(a, b)}`,
					})
				);
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
			const width = sizeOf(seriesValues[s][i]).width * unit;
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
				const inwards = (sizeOf(label).width * unit) / 2 + 4 * unit;
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
		const nameHeight = (names[0] ? sizeOf(names[0]).height : 0) * unit;
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
