import { sizeOf } from "../functions/measure";
import { AREA_CLASS, AREA_FILL_CLASS, HOLE_CLASS, POINT_CLASS, RULE_CLASS, SERIES_CLASS, VIEWBOX_WIDTH } from "../config";
import { stackOf } from "../functions/groups";
import { markerEl, markerOf } from "../functions/markers";
import { boxOf, spread, stepOf } from "../functions/labels";
import { avoidCollisions, overlaps, type Box } from "../functions/collision";
import { curveTo, fixed, tangentsWithGaps } from "../functions/smooth";
import { cutOut, placeAt, svgEl } from "../functions/svg";
import { trendOf } from "../functions/trend";
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
	running: true,
	swatch: area ? "box" : undefined,

	headroom: ({ labelHeight, unit }) => labelHeight * 1.6 + 6 * unit,

	// Room under the baseline when the lower of two lines has its numbers under it; not for an area or a stack.
	footroom: ({ labelHeight, unit, series, focused, stacked }) =>
		!area && !stacked && series === 2 && !focused ? labelHeight + 7 * unit : 0,

	draw(geo: Geometry) {
		const { rows, series, own, seriesValues, names, cx, y, height, unit, labelHeight, svg, stacked } = geo;
		// Over the columns of a column chart: its points come with the columns, its numbers keep clear of theirs.
		const mixed = own.length < series.length;
		const step = geo.shape === "step";
		const smooth = geo.shape === "smooth";
		const several = series.length > 1;
		const focused = series.some((one) => one.focus);
		const last = rows.length - 1;
		const baseline = y(0);
		// The width of a row; a step is flat across it.
		const band = rows.length > 1 ? cx(1) - cx(0) : cx(0) * 2;

		// Where an "up" animation grows from, and how far each point rises.
		svg.style.setProperty("--_base", `${fixed(baseline)}px`);
		const riseFrom = (pointY: number) => `--rise:${fixed(baseline - pointY)}px; `;

		// In the helpers below, `s` is a series and `i` a row.
		const cellAt = (s: number, i: number): Cell | undefined => rows[i]?.cells[s] ?? rows[i]?.cells[0];
		const missing = (s: number, i: number): boolean => !cellAt(s, i) || !!cellAt(s, i)?.missing;
		const stacks = rows.map((row) => (stacked ? stackOf(row, series.length, true) : null));
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
		const totalSteps = mixed ? last : Math.min(last, 6);
		// A line builds in at most seven steps, however many rows it has.
		geo.plot.style.setProperty("--count", String(totalSteps + 1));
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

		// `at` says which rows of a series get a point.
		const drawPoints = (at: (s: number, i: number) => boolean) => {
			// Over columns, the first line has the first marker, as a line chart's first line does.
			const ownSeries = own.map((s) => series[s]);
			const markers = series.map((_one, s) =>
				mixed ? markerOf(ownSeries, own.indexOf(s)) : several ? markerOf(series, s) : { shape: "circle" as const, open: false }
			);
			const point = (s: number, i: number, attrs: Record<string, string | number>) => {
				const [px, py] = pointAt(s, i);
				return markerEl(markers[s].shape, px, py, 4 * unit, { ...attrs, style: `${attrs.style ?? ""}${riseFrom(py)}${pointTiming(i)}` });
			};
			const shown = (s: number) => rows.map((_row, i) => i).filter((i) => !missing(s, i) && at(s, i));

			// An open point is a hole in the lines and areas under it.
			const holes = own.flatMap((s) =>
				markers[s].open
					? shown(s).map((i) => point(s, i, { class: HOLE_CLASS, "data-row": i + 1, ...(several && { "data-series": s + 1 }) }))
					: []
			);
			// Left out of the lines with a clip, by the core, from the start; growing lines keep the mask, which follows them.
			if (svg.closest("[data-animate]")?.getAttribute("data-animate") === "grow") cutOut(svg, holes, VIEWBOX_WIDTH, height);
			else geo.lineHoles.push(...holes);

			own.forEach((s) => {
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

		// Areas first, then every line, then the points, so a point is always on top of a line. The points come once the values are known.
		if (area) own.forEach((s) => drawArea(s));
		own.forEach((s) => drawLine(s));

		// Over columns, where the column chart placed each number, with a little room around it.
		const columnNumbers = mixed
			? series.flatMap((_one, s) =>
					own.includes(s)
						? []
						: seriesValues[s].flatMap((label) => {
								const place = label.dataset.place;
								if (!place || place === "none" || label.hasAttribute("data-left-out")) return [];
								const [x, y, w, h] = boxOf(label, unit, VIEWBOX_WIDTH, height);
								return [{ label, box: [x - 2 * unit, y - 3 * unit, w + 4 * unit, h + 6 * unit] as Box }];
							})
				)
			: [];
		// A number of a column under a point of the line is left out; its row's tooltip shows it.
		const pointBoxes = step
			? []
			: own.flatMap((s) =>
					rows.flatMap((_row, i): Box[] => {
						if (missing(s, i)) return [];
						const [px, py] = pointAt(s, i);
						return [[px - 4 * unit, py - 4 * unit, 8 * unit, 8 * unit]];
					})
				);
		const columnsShown = columnNumbers.filter(({ label, box }) => {
			const covered = pointBoxes.some((point) => overlaps(point, box));
			if (covered) label.setAttribute("data-left-out", "");
			return !covered;
		});

		// On a step chart, the last row from row i on that has the same value.
		const runEnd = (s: number, i: number): number => {
			let end = i;
			while (end < last && !missing(s, end + 1) && cellAt(s, end + 1)?.value === cellAt(s, i)?.value) end++;
			return end;
		};

		const flip = (place: "above" | "below") => (place === "above" ? "below" : "above");
		// How much of the line next to a point runs through its number, above or below it: at a dip, the line runs through
		// the number above, so it goes below.
		const crosses = (s: number, i: number, place: "above" | "below"): number => {
			const [px, py] = pointAt(s, i);
			const w = sizeOf(seriesValues[s][i]).width * unit;
			const box: Box = [px - w / 2, place === "above" ? py - 7 * unit - labelHeight : py + 7 * unit, w, labelHeight];
			if (box[1] + labelHeight > height) return Number.POSITIVE_INFINITY;
			return [i - 1, i + 1]
				.filter((j) => j >= 0 && j <= last && !missing(s, j))
				.flatMap((j) => piecesOf(s, i, j, 0))
				.filter((piece) => overlaps(piece, box)).length;
		};
		// The line between two of its points, as small boxes along it, close enough together that a value cannot fit between them.
		const piecesOf = (s: number, i: number, j: number, clear: number): Box[] => {
			const [x1, y1] = pointAt(s, i);
			const [x2, y2] = pointAt(s, j);
			const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (3 * unit)));
			return Array.from({ length: steps + 1 }, (_n, k): Box => {
				const t = k / steps;
				return [x1 + (x2 - x1) * t - clear, y1 + (y2 - y1) * t - clear, 2 * clear, 2 * clear];
			});
		};

		const placeOf = (s: number, i: number): Place => {
			const cell = cellAt(s, i);
			if (!cell || cell.missing) return "none";
			// A step chart shows a number only where the value changes.
			if (step && i > 0 && !missing(s, i - 1) && cellAt(s, i - 1)?.value === cell.value) return "none";
			if (focused && !series[s].focus) return "none";
			if (stacked) return "middle";
			// Below zero, a number goes under its point, away from the zero line.
			const alone = cell.value < 0 ? "below" : "above";
			if (!several || focused || series.length > 2) return area || step || crosses(s, i, alone) <= crosses(s, i, flip(alone)) ? alone : flip(alone);
			const other = cellAt(1 - s, i);
			if (!other || other.missing) return alone;
			// The higher of two goes above its point; on a tie, the first does.
			if (cell.value > other.value || (cell.value === other.value && s === 0)) return "above";
			// In an area chart, a number under its point may not cross zero.
			if (area && cell.value >= 0 && pointAt(s, i)[1] + 7 * unit + labelHeight > baseline) return "above";
			return "below";
		};

		// With more than two lines, each number goes above its point or below it, where it covers no point and no other number.
		// Per row the highest value places first; below zero, below comes first. A number with no room at all is left out.
		const crowded = mixed ? !step : several && !focused && series.length > 2 && !stacked && !step;
		const picks = new Map<HTMLElement, Place | null>();
		if (crowded) {
			const items = rows
				.flatMap((_row, i) => own.map((s) => ({ s, i, value: cellAt(s, i)?.value ?? 0 })))
				.filter(({ s, i }) => placeOf(s, i) !== "none")
				.sort((a, b) => a.i - b.i || b.value - a.value || a.s - b.s);
			const places = (value: number): Place[] => (value < 0 ? ["below", "above"] : ["above", "below"]);
			const candidates = items.map(({ s, i, value }): Box[] => {
				const w = sizeOf(seriesValues[s][i]).width * unit;
				const [px, py] = pointAt(s, i);
				return places(value).map((place): Box => [px - w / 2, place === "above" ? py - 7 * unit - labelHeight : py + 7 * unit, w, labelHeight]);
			});
			const points = own.flatMap((s) =>
				rows.flatMap((_row, i): Box[] => {
					if (missing(s, i)) return [];
					const [px, py] = pointAt(s, i);
					return [[px - 4 * unit, py - 4 * unit, 8 * unit, 8 * unit]];
				})
			);
			const chosen = avoidCollisions(candidates, [...points, ...columnsShown.map(({ box }) => box)], [0, 0, cx(last) + cx(0), height]);
			items.forEach(({ s, i, value }, k) => picks.set(seriesValues[s][i], chosen[k] === null ? null : places(value)[chosen[k] as number]));
		}

		// A number with no room is still placed, so it can be shown when its row is pointed at.
		const leftOut = (s: number, i: number): boolean => {
			if (crowded) return picks.get(seriesValues[s][i]) === null;
			if (!stacked && !step) return false;
			const width = sizeOf(seriesValues[s][i]).width * unit;
			const rowsWide = step ? runEnd(s, i) - i + 1 : 1;
			if (width > rowsWide * band - 4 * unit) return true;
			// A part below zero lies over the part under it, so its number would cover that one's.
			if (stacked && s > 0 && topValue(s, i) < bottomValue(s, i)) return true;
			return stacked && Math.abs(y(bottomValue(s, i)) - y(topValue(s, i))) < labelHeight * 1.2;
		};

		own.forEach((s) => {
			seriesValues[s].forEach((label, i) => {
				// A number arrives when the line reaches it: its point, or the middle of its row on a step chart.
				label.style.setProperty("--i", String(fixed(step ? (reach(i) + reach(i + 1)) / 2 : reach(i))));
				const place = picks.get(label) ?? placeOf(s, i);
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

		// Which values are shown: all, or a set, such as the first, last, highest and lowest, and the rows with `data-value="show"`.
		// With `auto`, all if they fit, and else the set. A value that is not shown is left out, so its row's tooltip has it.
		// In order of priority: where two would touch, the later one is dropped, with its point.
		const keyRows = (s: number): Set<number> => {
			const order = rows.flatMap((row, i) => (row.pinned && !missing(s, i) ? [i] : []));
			const known = rows.map((_row, i) => i).filter((i) => !missing(s, i));
			const value = (i: number) => cellAt(s, i)?.value ?? 0;
			const { keys } = geo.pick;
			if (known.length) {
				if (keys.includes("last")) order.push(known[known.length - 1]);
				if (keys.includes("first")) order.push(known[0]);
				if (keys.includes("highest")) order.push(known.reduce((a, b) => (value(b) > value(a) ? b : a)));
				if (keys.includes("lowest")) order.push(known.reduce((a, b) => (value(b) < value(a) ? b : a)));
				// The values far from the trend, as Summary finds them, so the chart shows the months a summary names.
				if (keys.includes("outliers")) order.push(...(trendOf(known.map((i) => ({ x: i, y: value(i) })))?.outside.map((p) => p.x) ?? []));
			}
			const kept: number[] = [];
			for (const i of order) {
				const label = seriesValues[s][i];
				if (kept.includes(i) || label.dataset.place === "none") continue;
				if (kept.every((k) => stepOf([seriesValues[s][k], label], unit, VIEWBOX_WIDTH, height) === 1)) kept.push(i);
			}
			return new Set(kept);
		};
		// They fit if no two touch. A value the chart already left out, to keep it clear of another line or a column, does not count.
		const fitsAll = (s: number) => {
			const placed = seriesValues[s].filter((label) => label.dataset.place !== "none" && !label.hasAttribute("data-left-out"));
			return stepOf(placed, unit, VIEWBOX_WIDTH, height) === 1;
		};
		// The last row of a line with a value.
		const lastOf = (s: number) => {
			let i = last;
			while (i > 0 && missing(s, i)) i--;
			return i;
		};
		// Per series, the rows whose value is shown; null for all of them.
		const showing = new Map<number, Set<number> | null>();
		for (const s of own) {
			const all = geo.pick.mode === "all" || (geo.pick.mode === "auto" && fitsAll(s));
			const set = all ? null : keyRows(s);
			showing.set(s, set);
			if (set) seriesValues[s].forEach((label, i) => {
				if (label.dataset.place !== "none" && !set.has(i)) label.setAttribute("data-left-out", "");
			});
		}

		// The values of a set each find a place: above, below, before or after their point, clear of every line, of the names at
		// the ends of the lines and of each other, in the order of the set. A value at a dip tries below first, where its line
		// does not run. A value with no room is left out; its row's tooltip still has it.
		if (!stacked && !step && own.some((s) => showing.get(s))) {
			const right = cx(last) + cx(0);
			const clear = 2 * unit;
			const along: Box[] = own.flatMap((s) =>
				rows.flatMap((_row, i) => (i === last || missing(s, i) || missing(s, i + 1) ? [] : piecesOf(s, i, i + 1, clear)))
			);
			// The names at the ends of the lines, where they will be.
			const nameHeight = (names[0] ? sizeOf(names[0]).height : 0) * unit;
			const ends = own.flatMap((s): Box[] => {
				const name = names[s];
				if (!name) return [];
				let i = last;
				while (i > 0 && missing(s, i)) i--;
				const [px, py] = pointAt(s, i);
				return [[px + 10 * unit, py - nameHeight / 2, sizeOf(name).width * unit, nameHeight]];
			});
			// Above or below its point, or a line of text further, if the line or another value is in the way; or beside it.
			type Spot = "outside" | "below" | "outside far" | "below far" | "after" | "before";
			const items = own.flatMap((s) => [...(showing.get(s) ?? [])].map((i) => ({ s, i })));
			const spotsOf = ({ s, i }: { s: number; i: number }): Spot[] => {
				const value = cellAt(s, i)?.value ?? 0;
				const before = i > 0 && !missing(s, i - 1) ? cellAt(s, i - 1)?.value : undefined;
				const after = i < last && !missing(s, i + 1) ? cellAt(s, i + 1)?.value : undefined;
				const dip = (before ?? after) !== undefined && (before === undefined || value <= before) && (after === undefined || value <= after);
				return dip
					? ["below", "outside", "below far", "outside far", "after", "before"]
					: ["outside", "below", "outside far", "below far", "after", "before"];
			};
			const boxOf = ({ s, i }: { s: number; i: number }, spot: Spot): Box => {
				const w = sizeOf(seriesValues[s][i]).width * unit;
				const h = labelHeight;
				const [px, py] = pointAt(s, i);
				// Above and below, moved in at the edges, as a value at the end of a line is.
				const middle = Math.min(Math.max(px - w / 2, 0), right - w);
				if (spot === "outside") return [middle, py - 7 * unit - h, w, h];
				if (spot === "below") return [middle, py + 7 * unit, w, h];
				if (spot === "outside far") return [middle, py - 7 * unit - 2 * h, w, h];
				if (spot === "below far") return [middle, py + 7 * unit + h, w, h];
				if (spot === "after") return [px + 7 * unit, py - h / 2, w, h];
				return [px - 7 * unit - w, py - h / 2, w, h];
			};
			const spots = items.map(spotsOf);
			// A place clear of everything; else one that only crosses a line, which can still be read, but never another value or a name.
			const inside = (a: Box) => a[0] >= 0 && a[1] >= 0 && a[0] + a[2] <= right && a[1] + a[3] <= height - 2 * unit;
			// A value never covers a point: the points of the values shown, with a little room around them.
			const points: Box[] = items.map(({ s, i }) => {
				const [px, py] = pointAt(s, i);
				return [px - 6 * unit, py - 6 * unit, 12 * unit, 12 * unit];
			});
			const placed: Box[] = [];
			// A value that crosses a line gets a hole in the line under it, so it can be read.
			const crossing = new Set<number>();
			const chosen = items.map((item, k) => {
				const boxes = spots[k].map((spot) => boxOf(item, spot));
				const free = (box: Box) => inside(box) && ![...placed, ...ends, ...points].some((other) => overlaps(box, other));
				let pick = boxes.findIndex((box) => free(box) && !along.some((piece) => overlaps(box, piece)));
				if (pick < 0) {
					pick = boxes.findIndex(free);
					if (pick >= 0) crossing.add(k);
				}
				if (pick >= 0) placed.push(boxes[pick]);
				return pick < 0 ? null : pick;
			});
			items.forEach((item, k) => {
				const label = seriesValues[item.s][item.i];
				label.toggleAttribute("data-cut", crossing.has(k));
				const pick = chosen[k];
				if (pick === null) return label.setAttribute("data-left-out", "");
				const spot = spots[k][pick];
				const [bx, by, bw, bh] = boxOf(item, spot);
				const place = spot.split(" ")[0];
				label.dataset.place = place;
				// Where each place is anchored: the foot of a value above, the top of one below, the side of one beside.
				const x = place === "after" ? bx : place === "before" ? bx + bw : bx + bw / 2;
				const y = place === "outside" ? by + bh : place === "below" ? by : by + bh / 2;
				placeAt(label, x, y, VIEWBOX_WIDTH, height);
			});
		}
		// A step chart has no points: its corners show where the values change. With all values, a line whose points would cover
		// each other has none either. With a set, each value shown has its point.
		if (!step) drawPoints((s, i) => {
			const set = showing.get(s);
			return set ? set.has(i) : band >= 10 * unit;
		});

		// The tooltip of a row points at its highest point, also where no point is drawn.
		geo.pointOf = (i) => {
			const tops = own.filter((s) => !missing(s, i)).map((s) => pointAt(s, i));
			return tops.length ? tops.reduce((a, b) => (b[1] < a[1] ? b : a)) : null;
		};

		// Each name just past the last point of its line, pushed apart where two lines end close together.
		const ends = (mixed ? [] : names).map((name, s) => {
			const i = lastOf(s);
			const [px, py] = pointAt(s, i);
			const end = step ? px + band / 2 : px;
			return { name, x: end + 10 * unit, y: stacked ? (py + y(bottomValue(s, i))) / 2 : py };
		});
		const nameHeight = (names[0] ? sizeOf(names[0]).height : 0) * unit;
		for (const end of spread(ends, nameHeight)) placeAt(end.name, end.x, end.y, VIEWBOX_WIDTH, height);

		// With numbers under the lower line, the rule is the foot of the plot rather than zero, unless values go below zero.
		const belowZero = rows.some((row) => row.cells.some((cell) => !cell.missing && cell.value < 0));
		const rule = !area && !stacked && series.length === 2 && !focused && !belowZero ? height - 2 * unit : baseline;
		// Over columns, the column chart has drawn the rule.
		if (!mixed)
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
