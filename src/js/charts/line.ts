import { AREA_CLASS, AREA_FILL_CLASS, HOLE_CLASS, POINT_CLASS, RULE_CLASS, SERIES_CLASS, VIEWBOX_WIDTH } from "../config";
import { timing } from "../functions/timing";
import { stackOf } from "../functions/groups";
import { markerEl, markerOf } from "../functions/markers";
import { spread } from "../functions/labels";
import { curveLength, curveTo, fixed, tangentsWithGaps } from "../functions/smooth";
import { cutOut, placeAt, svgEl } from "../functions/svg";
import type { Cell, ChartType, Geometry, Row, Segment } from "../types";

/** One segment per interval, so a line draws itself on left to right and each segment arrives with its point. */
const segments = (rows: Row[]): Segment[] =>
	rows.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const }));

type Place = "above" | "below" | "middle" | "none";

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
		const baseline = y(0);
		const several = series.length > 1;
		const focused = series.some((one) => one.focus);
		const last = rows.length - 1;

		const cellAt = (s: number, i: number): Cell | undefined =>
			rows[i]?.cells[s] ?? rows[i]?.cells[0];
		const stacks = rows.map((row) => (stacked ? stackOf(row, series.length) : null));
		const top = (s: number, i: number): number =>
			stacks[i]?.[s].to ?? cellAt(s, i)?.value ?? 0;
		const bottom = (s: number, i: number): number => stacks[i]?.[s].from ?? 0;
		const at = (s: number, i: number): [number, number] => [cx(i), y(top(s, i))];
		const gone = (s: number, i: number) => !cellAt(s, i) || !!cellAt(s, i)?.missing;

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

		const when = (_s: number, i: number): string => timing("--i", rows[i].slot);

		const band = rows.length > 1 ? cx(1) - cx(0) : cx(0) * 2;

		// One piece per interval; a step chart has one per row instead.
		const pieces = (s: number): { i: number; next: boolean }[] =>
			rows
				.map((_row, i) => ({ i, next: i < last && !gone(s, i + 1) }))
				.filter(({ i, next }) => !gone(s, i) && (step || next));

		// The slope at each point, for the top of each line or area and the bottom of each area.
		const tops = smooth ? series.map((_one, s) => tangentsWithGaps(rows.length, (i) => gone(s, i), (i) => at(s, i))) : [];
		const bottoms =
			smooth && area
				? series.map((_one, s) => tangentsWithGaps(rows.length, (i) => gone(s, i), (i) => [cx(i), y(bottom(s, i))]))
				: [];

		// One group per series has the opacity, so two pieces of one area do not add up to a darker seam.
		if (area) {
			series.forEach((_one, s) => {
				const group = svgEl("g", {
					class: AREA_CLASS,
					...marks[s].attrs,
					...(stacked && { "data-stacked": "" }),
					style: marks[s].ink,
				});
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
					// A little past its right edge, under the next piece, so no seam shows between the two.
					const j = step ? i + 1 : i + 2;
					const joined = step ? next : i + 1 < last && !gone(s, i + 2);
					let over = joined ? 1.5 * unit : 0;
					const slope = (a: number, b: number, xa: number, xb: number) => (b - a) / (xb - xa);
					const at2 = (own: number, ownStart: number, nextEnd: number) => {
						const mine = step ? own : own + slope(ownStart, own, x1, x2) * over;
						const theirs = step ? nextEnd : own + slope(own, nextEnd, x2, cx(j)) * over;
						return [mine, theirs];
					};
					// Smooth: along the curve's own slope, which the next piece starts with.
					const tOver = !joined ? t2 : smooth ? t2 + tops[s][i + 1] * over : Math.max(...at2(t2, t1, y(top(s, j))));
					const bOver = !joined ? b2 : smooth ? b2 + bottoms[s][i + 1] * over : Math.min(...at2(b2, b1, y(bottom(s, j))));
					if (tOver >= bOver) over = 0;
					if (smooth) {
						const [mt1, mt2, mb1, mb2] = [tops[s][i], tops[s][i + 1], bottoms[s][i], bottoms[s][i + 1]];
						const d = [
							`M${fixed(x1)},${fixed(b1)}`,
							`L${fixed(x1)},${fixed(t1)}`,
							curveTo([x1, t1], [x2, t2], mt1, mt2),
							...(over ? [`L${fixed(x2 + over)},${fixed(tOver)}`, `L${fixed(x2 + over)},${fixed(bOver)}`] : []),
							`L${fixed(x2)},${fixed(b2)}`,
							curveTo([x2, b2], [x1, b1], mb2, mb1),
							"Z",
						].join(" ");
						fill.appendChild(svgEl("path", { d, "data-row": i + 2, style: when(s, i + 1) }));
						continue;
					}
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

		// The lines after the areas, so a point is always on top of a line.
		series.forEach((one, s) => {
			let along = 0;
			for (const { i, next } of pieces(s)) {
				if (smooth) {
					const [a, b] = [at(s, i), at(s, i + 1)];
					const length = 1 + curveLength(a, b, tops[s][i], tops[s][i + 1]) / unit;
					svg.appendChild(
						svgEl("path", {
							class: SERIES_CLASS,
							...marks[s].attrs,
							d: `M${fixed(a[0])},${fixed(a[1])} ${curveTo(a, b, tops[s][i], tops[s][i + 1])}`,
							...(one.line && { "data-line": one.line }),
							"data-row": i + 2,
							style: `${marks[s].ink}--len:${length.toFixed(1)}; --along:${(-along).toFixed(1)}; ${when(s, i + 1)}`,
						})
					);
					along += length - 1;
					continue;
				}
				const points: [number, number][] = step
					? [
							[cx(i) - band / 2, y(top(s, i))],
							[cx(i) + band / 2, y(top(s, i))],
							...(next ? [[cx(i) + band / 2, y(top(s, i + 1))] as [number, number]] : []),
						]
					: [at(s, i), at(s, i + 1)];
				// In pixels: the stroke does not scale, so its dashes are measured at the size the figure is shown.
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
						"data-row": (step ? i : i + 1) + 1,
						style: `${marks[s].ink}--len:${length.toFixed(1)}; --along:${(-along).toFixed(1)}; ${when(s, step ? i : i + 1)}`,
					})
				);
				along += length - 1;
			}
		});

		if (!step) {
			const markers = series.map((_one, s) =>
				several ? markerOf(series, s) : { shape: "circle" as const, open: false }
			);
			// An open point is a hole in the lines and areas under it.
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

		const runEnd = (s: number, i: number): number => {
			let run = i;
			while (run < last && !gone(s, run + 1) && cellAt(s, run + 1)?.value === cellAt(s, i)?.value) run++;
			return run;
		};

		const placeOf = (s: number, i: number): Place => {
			const cell = cellAt(s, i);
			if (!cell || cell.missing) return "none";
			if (step && i > 0 && !gone(s, i - 1) && cellAt(s, i - 1)?.value === cell.value) return "none";
			if (focused && !series[s].focus) return "none";
			if (stacked) return "middle";
			if (!several || focused || series.length > 2) return "above";
			const other = cellAt(1 - s, i);
			if (!other || other.missing) return "above";
			// The higher of two goes above its point; on a tie, the first does.
			if (cell.value > other.value || (cell.value === other.value && s === 0)) return "above";
			// In an area chart, a number under its point may not cross zero.
			if (area && at(s, i)[1] + 7 * unit + labelHeight > baseline) return "above";
			return "below";
		};

		// A number with no room is still placed, so it can be shown when its row is pointed at.
		const leftOut = (s: number, i: number): boolean => {
			if (!stacked && !step) return several && !focused && series.length > 2;
			const width = seriesValues[s][i].offsetWidth * unit;
			const rowsWide = step ? runEnd(s, i) - i + 1 : 1;
			if (width > rowsWide * band - 4 * unit) return true;
			return stacked && y(bottom(s, i)) - y(top(s, i)) < labelHeight * 1.2;
		};

		seriesValues.forEach((labels, s) => {
			labels.forEach((label, i) => {
				const place = placeOf(s, i);
				label.dataset.place = place === "above" ? "outside" : place;
				label.toggleAttribute("data-left-out", place !== "none" && leftOut(s, i));
				if (step && place !== "none") label.dataset.rowEnd = String(runEnd(s, i) + 1);
				else delete label.dataset.rowEnd;
				if (place === "none") return;
				// In a stack, a number at the first or last point is moved inwards, clear of the names.
				const inwards = (label.offsetWidth * unit) / 2 + 4 * unit;
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

		// Each name just past the last point of its line, pushed apart where two lines end close together.
		const ends = names.map((name, s) => {
			let i = last;
			while (i > 0 && gone(s, i)) i--;
			const [px, py] = at(s, i);
			const end = step ? px + band / 2 : px;
			return { name, x: end + 10 * unit, y: stacked ? (py + y(bottom(s, i))) / 2 : py };
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
