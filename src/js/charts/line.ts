import { AREA_CLASS, AREA_FILL_CLASS, HOLE_CLASS, POINT_CLASS, RULE_CLASS, SERIES_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { stackOf } from "../functions/groups";
import { markerEl, markerOf } from "../functions/markers";
import { spread } from "../functions/labels";
import { cutOut, placeAt, svgEl } from "../functions/svg";
import type { Cell, ChartType, Geometry, Row, Segment } from "../types";

/**
 * A value per category, joined up — or several, one line per value column.
 *
 * The line is drawn as one segment per interval rather than as a single
 * polyline. It costs a few more elements and buys everything else: each segment
 * draws itself on in turn, so the line arrives left to right like the bars do,
 * and a segment belongs to the point it leads into, which is the same rule a
 * waterfall's connectors follow.
 *
 * With more than one series, each line is named at its end rather than in a
 * legend, so the eye never has to leave the line to know which it is. The lines
 * are told apart by ink, every one a step further towards the surface, and by
 * their points: filled and open circles, squares and diamonds. So they stay
 * apart in a page that names no colours, and on paper. Not by dashes: a dashed line cannot draw itself on, for the
 * reason a waterfall's connectors fade instead.
 *
 * The numbers follow from how many lines there are:
 *
 * - one: above every point, as always;
 * - two: above the higher point of each pair and under the lower, so the two
 *   never meet;
 * - a series in focus, at any count: on that line only;
 * - three or more and no focus: none, since they could not all be read.
 *
 * A cell with no number leaves a gap in its line rather than a dip to zero.
 *
 * An area chart is the same chart with the space between each line and zero
 * filled. The fill fades in as a whole while the line is drawn. It is made of one
 * shape per interval, so on a chart with steps each piece arrives with its step.
 *
 * With `data-chart-stack`, each line stands on the one before it, and each number
 * goes in the middle of its band. With `data-chart-shape="step"`, each value is
 * flat across the width of its row, as a column is, and the line goes straight up
 * or down between two rows. A step chart has no points, and shows a number only
 * where the value changes.
 */
const segments = (rows: Row[]): Segment[] =>
	rows.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const }));

type Place = "above" | "below" | "middle" | "none";

const trend = (area: boolean): ChartType => ({
	segments,
	breakable: true,
	series: true,
	stackable: true,
	swatch: area ? "box" : undefined,

	// Room above the line for the numbers that sit over it.
	headroom: ({ labelHeight, unit }) => labelHeight * 1.6 + 6 * unit,

	// Room under the baseline when the lower of two lines has its numbers under it,
	// so one near zero still has somewhere to put them. An area, or a stack, stands
	// on zero, so it has no room under it: a number that does not fit under its
	// point goes above it.
	footroom: ({ labelHeight, unit, series, focused, stacked }) =>
		!area && !stacked && series === 2 && !focused ? labelHeight + 7 * unit : 0,

	draw(geo: Geometry) {
		const { rows, series, seriesValues, names, cx, y, height, unit, labelHeight, svg, stacked } = geo;
		const step = geo.shape === "step";
		const baseline = y(0);
		const several = series.length > 1;
		const focused = series.some((one) => one.focus);
		const last = rows.length - 1;

		const cellAt = (s: number, i: number): Cell | undefined =>
			rows[i]?.cells[s] ?? rows[i]?.cells[0];
		// Where each line is, as a value: on zero, or on the line before it.
		const stacks = rows.map((row) => (stacked ? stackOf(row, series.length) : null));
		const top = (s: number, i: number): number =>
			stacks[i]?.[s].to ?? cellAt(s, i)?.value ?? 0;
		const bottom = (s: number, i: number): number => stacks[i]?.[s].from ?? 0;
		const at = (s: number, i: number): [number, number] => [cx(i), y(top(s, i))];
		const gone = (s: number, i: number) => !cellAt(s, i) || !!cellAt(s, i)?.missing;

		// What tells one series from another, on every mark that belongs to it.
		const marks = series.map((one, s) => {
			if (!several) return { attrs: {}, ink: "" };
			const muted = focused && !one.focus;
			return {
				attrs: {
					"data-series": s + 1,
					...(muted && { "data-muted": "" }),
				},
				ink: `--n:${s}; --m:${muted ? 1 : 0}; --palette:var(--tablechart-color-${s + 1}); `,
			};
		});

		// A mark goes with its row.
		const when = (_s: number, i: number): string => timing("--i", rows[i].slot);

		// The width of a row. A step is flat across it.
		const band = rows.length > 1 ? cx(1) - cx(0) : cx(0) * 2;

		// The pieces of a line or an area, one per interval from point i to point
		// i + 1. A step chart has one per row instead: flat across the row, then up
		// or down to the next row, if there is one.
		const pieces = (s: number): { i: number; next: boolean }[] =>
			rows
				.map((_row, i) => ({ i, next: i < last && !gone(s, i + 1) }))
				.filter(({ i, next }) => !gone(s, i) && (step || next));

		// The areas first, under every line. Each series is one group with the opacity,
		// so where two pieces of one area meet, they do not add up to a darker seam.
		if (area) {
			series.forEach((_one, s) => {
				const group = svgEl("g", {
					class: AREA_CLASS,
					...marks[s].attrs,
					...(stacked && { "data-stacked": "" }),
					style: marks[s].ink,
				});
				// The pieces of one area fade in together, from when its line starts until
				// it ends. On a chart with steps, each piece arrives with its own step.
				const all = pieces(s);
				const fill = svgEl("g", {
					class: AREA_FILL_CLASS,
					style: `--rows:${rows.length}; ${all.length ? when(s, step ? all[0].i : all[0].i + 1) : ""}`,
				});
				group.appendChild(fill);
				for (const { i, next } of all) {
					const x1 = step ? cx(i) - band / 2 : cx(i);
					const x2 = step ? cx(i) + band / 2 : cx(i + 1);
					const [t1, b1] = [y(top(s, i)), y(bottom(s, i))];
					const [t2, b2] = step ? [t1, b1] : [y(top(s, i + 1)), y(bottom(s, i + 1))];
					// A little past its right edge, under the next piece, so no seam shows
					// between the two. Only as high as both pieces are there, so it never
					// shows past the next piece.
					const j = step ? i + 1 : i + 2;
					const joined = step ? next : i + 1 < last && !gone(s, i + 2);
					let over = joined ? 1.5 * unit : 0;
					const slope = (a: number, b: number, xa: number, xb: number) => (b - a) / (xb - xa);
					const at2 = (own: number, ownStart: number, nextEnd: number) => {
						const mine = step ? own : own + slope(ownStart, own, x1, x2) * over;
						const theirs = step ? nextEnd : own + slope(own, nextEnd, x2, cx(j)) * over;
						return [mine, theirs];
					};
					const tOver = joined ? Math.max(...at2(t2, t1, y(top(s, j)))) : t2;
					const bOver = joined ? Math.min(...at2(b2, b1, y(bottom(s, j)))) : b2;
					if (tOver >= bOver) over = 0;
					const points = step
						? [[x1, b1], [x1, t1], [x2, t1], [x2, tOver], [x2 + over, tOver], [x2 + over, bOver], [x2, bOver], [x2, b1]]
						: [[x1, b1], [x1, t1], [x2, t2], [x2 + over, tOver], [x2 + over, bOver], [x2, b2]];
					fill.appendChild(
						svgEl("polygon", {
							points: points.map((p) => p.join(",")).join(" "),
							"data-row": (step ? i : i + 1) + 1,
							style: when(s, step ? i : i + 1),
						})
					);
				}
				svg.appendChild(group);
			});
		}

		// The lines next, every one, so a point is always on top of a line.
		series.forEach((one, s) => {
			// How far along its line a piece starts, in pixels, so the dashes of a dashed
			// line run on from one piece to the next.
			let along = 0;
			for (const { i, next } of pieces(s)) {
				const points: [number, number][] = step
					? [
							[cx(i) - band / 2, y(top(s, i))],
							[cx(i) + band / 2, y(top(s, i))],
							...(next ? [[cx(i) + band / 2, y(top(s, i + 1))] as [number, number]] : []),
						]
					: [at(s, i), at(s, i + 1)];
				// In pixels, not in viewBox units: the stroke does not scale, so the browser
				// measures its dashes in the space the figure is drawn at, not the space it
				// is drawn in. Pass 3 runs again whenever that width changes, so this stays
				// true at any size.
				let length = 1;
				for (let p = 1; p < points.length; p++) {
					const [[xa, ya], [xb, yb]] = [points[p - 1], points[p]];
					length += Math.hypot(xb - xa, yb - ya) / unit;
				}
				svg.appendChild(
					svgEl("polyline", {
						class: SERIES_CLASS,
						...marks[s].attrs,
						points: points.map((p) => p.join(",")).join(" "),
						...(one.line && { "data-line": one.line }),
						// The row it leads into, counted from 1.
						"data-row": (step ? i : i + 1) + 1,
						// Its own length, so it can draw itself on by its dash.
						style: `${marks[s].ink}--len:${length.toFixed(1)}; --along:${(-along).toFixed(1)}; ${when(s, step ? i : i + 1)}`,
					})
				);
				along += length - 1;
			}
		});

		// A step chart has no points: the corners show where the values change.
		if (!step) {
			// The point of each line: one line has filled circles, several lines take
			// turns, as `markerOf` lists them.
			const markers = series.map((_one, s) =>
				several ? markerOf(series, s) : { shape: "circle" as const, open: false }
			);
			// An open point is a hole in the lines and areas under it, so the background
			// shows through it. The hole has the shape of the point and appears with it.
			cutOut(
				svg,
				series.flatMap((_one, s) =>
					markers[s].open
						? rows.flatMap((_row, i) => {
								if (gone(s, i)) return [];
								const [px, py] = at(s, i);
								return [
									markerEl(markers[s].shape, px, py, 4 * unit, {
										class: HOLE_CLASS,
										"data-row": i + 1,
										...(several && { "data-series": s + 1 }),
										style: when(s, i),
									}),
								];
							})
						: []
				),
				VIEWBOX_WIDTH,
				height
			);
			series.forEach((_one, s) => {
				rows.forEach((_row, i) => {
					if (gone(s, i)) return;
					const [px, py] = at(s, i);
					svg.appendChild(
						markerEl(markers[s].shape, px, py, 4 * unit, {
							class: POINT_CLASS,
							...marks[s].attrs,
							"data-marker": markers[s].shape,
							...(markers[s].open && { "data-open": "" }),
							"data-row": i + 1,
							style: `${marks[s].ink}${when(s, i)}`,
						})
					);
				});
			});
		}

		// The last row from row i on that has the same value, for a step chart.
		const runEnd = (s: number, i: number): number => {
			let run = i;
			while (run < last && !gone(s, run + 1) && cellAt(s, run + 1)?.value === cellAt(s, i)?.value) run++;
			return run;
		};

		// Which number goes where, a point at a time.
		const placeOf = (s: number, i: number): Place => {
			const cell = cellAt(s, i);
			if (!cell || cell.missing) return "none";
			// A step chart shows a number only where the value changes.
			if (step && i > 0 && !gone(s, i - 1) && cellAt(s, i - 1)?.value === cell.value) return "none";
			if (focused && !series[s].focus) return "none";
			if (stacked) return "middle";
			if (!several || focused || series.length > 2) return "above";
			const other = cellAt(1 - s, i);
			if (!other || other.missing) return "above";
			// The higher of the two goes over its point; on a tie, the first does.
			if (cell.value > other.value || (cell.value === other.value && s === 0)) return "above";
			// In an area chart, a number under its point may not cross zero.
			if (area && at(s, i)[1] + 7 * unit + labelHeight > baseline) return "above";
			return "below";
		};

		// A number that has no room is left out. It is still placed, so it can be
		// shown when its row is pointed at.
		const leftOut = (s: number, i: number): boolean => {
			if (!stacked && !step) return several && !focused && series.length > 2;
			// On a step, or in a stack, a number wider than its rows is left out.
			const width = seriesValues[s][i].offsetWidth * unit;
			const rowsWide = step ? runEnd(s, i) - i + 1 : 1;
			if (width > rowsWide * band - 4 * unit) return true;
			// In a stack, so is one higher than its band.
			return stacked && y(bottom(s, i)) - y(top(s, i)) < labelHeight * 1.2;
		};

		seriesValues.forEach((labels, s) => {
			labels.forEach((label, i) => {
				const place = placeOf(s, i);
				label.dataset.place = place === "above" ? "outside" : place;
				label.toggleAttribute("data-left-out", place !== "none" && leftOut(s, i));
				// On a step, the number belongs to every row that has its value.
				if (step && place !== "none") label.dataset.rowEnd = String(runEnd(s, i) + 1);
				else delete label.dataset.rowEnd;
				if (place === "none") return;
				// In a stack, a number at the first or last point is moved inwards, so it
				// stays inside its area and clear of the names.
				const inwards = (label.offsetWidth * unit) / 2 + 4 * unit;
				// On a step, in the middle of the rows that have this value.
				const x = step
					? (cx(i) + cx(runEnd(s, i))) / 2
					: place === "middle" && i === 0
						? cx(i) + inwards
						: place === "middle" && i === last
							? cx(i) - inwards
							: cx(i);
				const py = y(top(s, i));
				const position =
					place === "middle"
						? (py + y(bottom(s, i))) / 2
						: place === "above"
							? py - 7 * unit
							: py + 7 * unit;
				placeAt(label, x, position, VIEWBOX_WIDTH, height);
			});
		});

		// Each name just past the last point its line reaches, at that point's height,
		// or in the middle of its band in a stack, then pushed apart where two lines
		// end close together.
		const ends = names.map((name, s) => {
			let i = last;
			while (i > 0 && gone(s, i)) i--;
			const [px, py] = at(s, i);
			// A step line goes on to the end of its row.
			const end = step ? px + band / 2 : px;
			return { name, x: end + 10 * unit, y: stacked ? (py + y(bottom(s, i))) / 2 : py };
		});
		const nameHeight = (names[0]?.offsetHeight || 0) * unit;
		for (const end of spread(ends, nameHeight)) placeAt(end.name, end.x, end.y, VIEWBOX_WIDTH, height);

		// Under the numbers that hang below the lower line, when there are any, so a
		// point near zero does not put its number through the rule. The rule is then
		// the foot of the plot rather than its zero, as the axis of a line chart is.
		const rule = !area && !stacked && series.length === 2 && !focused ? height - 2 * unit : baseline;
		svg.appendChild(
			svgEl("line", {
				class: RULE_CLASS,
				x1: 0,
				// To the end of the last band: past it is where the names are.
				x2: cx(last) + cx(0),
				y1: rule,
				y2: rule,
			})
		);
	},
});

export const line = trend(false);
export const area = trend(true);
