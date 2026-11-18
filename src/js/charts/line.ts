import { sizeOf } from "../layout/measure";
import { AREA_CLASS, AREA_FILL_CLASS, BAR_CLASS, HALO_CLASS, HOLE_CLASS, PIECE_CLASS, POINT_CLASS, RULE_CLASS, SERIES_CLASS, VIEWBOX_WIDTH } from "../config";
import { stackOf } from "../shared/stacks";
import { markerEl, markerOf } from "../draw/markers";
import { boxOf, spread, stepOf } from "../layout/labels";
import { avoidCollisions, overlaps, type Box } from "../layout/collision";
import { curveTo, fixed, tangentsWithGaps } from "../draw/smooth";
import { cutOut, fadeFill, placeAt, svgEl } from "../draw/svg";
import { trendOf } from "../scale/trend";
import type { Cell, ChartType, Geometry, Row, Segment } from "../types";

type Point = [number, number];
type Place = "above" | "below" | "middle" | "none";

// One value: of a series, in a row.
type ValueAt = { seriesIndex: number; rowIndex: number };

/** One segment per interval, so a line draws itself on left to right and each segment arrives with its point. */
const segments = (rows: Row[]): Segment[] =>
	rows.map((row) => ({ ...row, from: 0, to: row.value, kind: "bar" as const }));

const trend = (area: boolean): ChartType => ({
	segments,
	series: true,
	stackable: true,
	running: true,
	twoAxes: true,
	swatch: area ? "box" : undefined,

	// Room for the numbers above the points; without numbers, for the points only.
	headroom: ({ labelHeight, unit, numbers }) => (numbers ? labelHeight * 1.6 + 6 * unit : 6 * unit),

	// Room under the baseline when the lower of two lines has its numbers under it; not for an area or a stack.
	footroom: ({ labelHeight, unit, series, focused, stacked, numbers }) =>
		numbers && !area && !stacked && series === 2 && !focused ? labelHeight + 7 * unit : 0,

	draw(geo: Geometry) {
		const { rows, series, own, seriesValues, names, cx, y, height, unit, labelHeight, svg, stacked } = geo;

		// Over the columns of a column chart: its points come with the columns, its numbers keep clear of theirs.
		const mixed = own.length < series.length;
		const step = geo.shape === "step";
		const smooth = geo.shape === "smooth";
		const several = series.length > 1;
		const focused = series.some((one) => one.focus);
		const last = rows.length - 1;

		// Zero, or the foot of a scale that starts above it.
		const baseline = y(Math.max(0, geo.domain?.[0] ?? 0));

		// The width of a row; a step is flat across it.
		const band = rows.length > 1 ? cx(1) - cx(0) : cx(0) * 2;

		// Where an "up" animation grows from, and how far each point rises.
		svg.style.setProperty("--_base", `${fixed(baseline)}px`);

		const riseFrom = (pointY: number) => `--rise:${fixed(baseline - pointY)}px; `;

		const cellAt = (seriesIndex: number, rowIndex: number): Cell | undefined => {
			const cells = rows[rowIndex]?.cells;
			return cells?.[seriesIndex] ?? cells?.[0];
		};

		const missing = (seriesIndex: number, rowIndex: number): boolean => {
			const cell = cellAt(seriesIndex, rowIndex);
			return !cell || !!cell.missing;
		};

		const stacks = rows.map((row) => (stacked ? stackOf(row, series.length, true) : null));

		// Where a line is, as a value: on zero, or in a stack on the line before it.
		const topValue = (seriesIndex: number, rowIndex: number): number =>
			stacks[rowIndex]?.[seriesIndex].to ?? cellAt(seriesIndex, rowIndex)?.value ?? 0;

		const bottomValue = (seriesIndex: number, rowIndex: number): number => stacks[rowIndex]?.[seriesIndex].from ?? 0;

		// With two value axes, each line has the scale of its own series.
		const yOf = (seriesIndex: number) => geo.yOf?.(seriesIndex) ?? y;

		const pointAt = (seriesIndex: number, rowIndex: number): Point => [cx(rowIndex), yOf(seriesIndex)(topValue(seriesIndex, rowIndex))];

		// What tells one series from another, on every mark of it.
		const marks = series.map((one, seriesIndex) => {
			if (!several) return { attrs: {}, ink: "" };
			const muted = focused && !one.focus;

			return {
				attrs: { "data-series": seriesIndex + 1, ...(muted && { "data-muted": "" }) },
				ink: `--n:${seriesIndex}; --m:${muted ? 1 : 0}; --palette:var(--tablechart-color-${seriesIndex + 1}); `,
			};
		});

		// The line builds at an even speed, in stagger steps, and a long line takes no more than six in all.
		const totalSteps = mixed ? last : Math.min(last, 6);

		// A line builds in at most seven steps, however many rows it has.
		geo.plot.style.setProperty("--count", String(totalSteps + 1));
		const stepsPerRow = last > 0 ? totalSteps / (step ? rows.length : last) : 1;

		// When the line reaches a point, or the start of its row on a step chart.
		const reach = (rowIndex: number): number => rowIndex * stepsPerRow;

		const pointTiming = (rowIndex: number): string => `--i:${fixed(reach(rowIndex))}`;

		// A line runs from point to point until a value is missing; on a step chart a run can be one row.
		const runsOf = (seriesIndex: number): [number, number][] => {
			const runs: [number, number][] = [];
			let first = -1;

			rows.forEach((_row, rowIndex) => {
				if (missing(seriesIndex, rowIndex)) return;
				if (first < 0) first = rowIndex;

				if (rowIndex === last || missing(seriesIndex, rowIndex + 1)) {
					if (step || rowIndex > first) runs.push([first, rowIndex]);
					first = -1;
				}
			});

			return runs;
		};

		// A run is revealed from left to right while the line reaches its points: on a step chart, to the end of its last row.
		const runTiming = (start: number, end: number): string => {
			const finish = reach(step ? end + 1 : end);
			return `--i:${fixed(reach(start) + 1)}; --d:${fixed(finish - reach(start))}`;
		};

		const runAttrs = (start: number, end: number) => ({ "data-from": start + 1, "data-to": end + 1, ...(step && { "data-flat": "" }) });

		// For a smooth chart, the slope at each point: of the top of each line, and of the bottom of each area.
		const slopesAlong = (pointOf: (seriesIndex: number, rowIndex: number) => Point) =>
			series.map((_one, seriesIndex) =>
				tangentsWithGaps(
					rows.length,
					(rowIndex) => missing(seriesIndex, rowIndex),
					(rowIndex) => pointOf(seriesIndex, rowIndex)
				)
			);

		const bottomAt = (seriesIndex: number, rowIndex: number): Point => [cx(rowIndex), yOf(seriesIndex)(bottomValue(seriesIndex, rowIndex))];

		const topSlopes = smooth ? slopesAlong(pointAt) : [];

		const bottomSlopes = smooth && area ? slopesAlong(bottomAt) : [];

		// The path commands through `points` after a path that is at the first one (on a step chart, at its left edge).
		// `direction` is -1 for the way back, from right to left.
		const through = (points: Point[], slopes: number[] | null, direction: 1 | -1): string[] => {
			const commands: string[] = [];

			points.forEach(([x, py], index) => {
				if (step) {
					commands.push(`H${fixed(x + (direction * band) / 2)}`);
					if (index < points.length - 1) commands.push(`V${fixed(points[index + 1][1])}`);
				} else if (index > 0) {
					commands.push(slopes ? curveTo(points[index - 1], [x, py], slopes[index - 1], slopes[index]) : `L${fixed(x)},${fixed(py)}`);
				}
			});

			return commands;
		};

		const pointsOf = (seriesIndex: number, start: number, end: number, value: (seriesIndex: number, rowIndex: number) => number): Point[] =>
			rows.slice(start, end + 1).map((_row, offset) => [cx(start + offset), yOf(seriesIndex)(value(seriesIndex, start + offset))]);

		const slopesOf = (slopes: number[][], seriesIndex: number, start: number, end: number): number[] | null =>
			smooth ? slopes[seriesIndex].slice(start, end + 1) : null;

		// Where a run starts and ends across the plot: on a step chart, at the edges of its first and last row.
		const leftOf = (start: number) => cx(start) - (step ? band / 2 : 0);

		const rightOf = (end: number) => cx(end) + (step ? band / 2 : 0);

		// Every area fades over the same height, so the same height has the same strength. A stack stays flat: its bands are the data.
		const levelsOf = (seriesIndex: number) =>
			rows.flatMap((_row, rowIndex) => (missing(seriesIndex, rowIndex) ? [] : [pointAt(seriesIndex, rowIndex)[1]]));

		const levels = stacked ? [] : own.flatMap(levelsOf);
		const [highest, lowest] = levels.reduce(([top, bottom], level) => [Math.min(top, level), Math.max(bottom, level)], [baseline, baseline]);

		const fadeOf = (seriesIndex: number) => {
			const muted = focused && !series[seriesIndex].focus;
			const fade = fadeFill(svg, highest, baseline, lowest, { style: marks[seriesIndex].ink, ...(muted && { "data-muted": "" }) });
			return `fill:url(#${fade}); `;
		};

		const drawArea = (seriesIndex: number) => {
			const group = svgEl("g", {
				class: AREA_CLASS,
				...marks[seriesIndex].attrs,
				...(stacked && { "data-stacked": "" }),
				style: `${marks[seriesIndex].ink}${stacked ? "" : fadeOf(seriesIndex)}`,
			});

			const runs = runsOf(seriesIndex);

			const fill = svgEl("g", {
				class: AREA_FILL_CLASS,
				style: `--rows:${fixed(totalSteps + 1)}; ${runs.length ? runTiming(...runs[0]) : ""}`,
			});

			group.appendChild(fill);

			// One shape per run: along the top from left to right, and back along the bottom.
			for (const [start, end] of runs) {
				const top = pointsOf(seriesIndex, start, end, topValue);
				const bottom = pointsOf(seriesIndex, start, end, bottomValue);
				const backSlopes = slopesOf(bottomSlopes, seriesIndex, start, end)?.reverse() ?? null;

				const pathData = [
					`M${fixed(leftOf(start))},${fixed(bottom[0][1])}`,
					`L${fixed(leftOf(start))},${fixed(top[0][1])}`,
					...through(top, slopesOf(topSlopes, seriesIndex, start, end), 1),
					`L${fixed(rightOf(end))},${fixed(bottom[bottom.length - 1][1])}`,
					...through(bottom.reverse(), backSlopes, -1),
					"Z",
				].join(" ");

				fill.appendChild(svgEl("path", { d: pathData, ...runAttrs(start, end), style: runTiming(start, end) }));
			}

			svg.appendChild(group);
		};

		// Over columns, an edge in the background colour behind a line or a point, so it stands out from a column of a similar colour.
		const withHalo = (mark: SVGElement, kind: "line" | "point"): SVGElement => {
			if (!mixed) return mark;
			const halo = mark.cloneNode() as SVGElement;
			halo.setAttribute("class", HALO_CLASS);
			halo.dataset.kind = kind;

			// The edge of a point goes under the lines, so a line still reaches its point.
			const firstLine = kind === "point" ? svg.querySelector(`.${SERIES_CLASS}`) : null;

			if (firstLine) firstLine.before(halo);
			else svg.appendChild(halo);

			return mark;
		};

		// One path per run, so a dashed line runs on without a break and a line is one element, however long.
		const drawLine = (seriesIndex: number) => {
			const one = series[seriesIndex];

			for (const [start, end] of runsOf(seriesIndex)) {
				const top = pointsOf(seriesIndex, start, end, topValue);
				const pathData = [`M${fixed(leftOf(start))},${fixed(top[0][1])}`, ...through(top, slopesOf(topSlopes, seriesIndex, start, end), 1)].join(" ");

				svg.appendChild(
					withHalo(
						svgEl("path", {
							class: SERIES_CLASS,
							...marks[seriesIndex].attrs,
							d: pathData,
							...(one.line && { "data-line": one.line }),
							...runAttrs(start, end),
							style: `${marks[seriesIndex].ink}${runTiming(start, end)}`,
						}),
						"line"
					)
				);
			}
		};

		// `at` says which rows of a series get a point.
		// Over columns, the first line has the first marker, as a line chart's first line does.
		const ownSeries = own.map((seriesIndex) => series[seriesIndex]);

		const markers = series.map((_one, seriesIndex) =>
			mixed ? markerOf(ownSeries, own.indexOf(seriesIndex)) : several ? markerOf(series, seriesIndex) : { shape: "circle" as const, open: false }
		);

		const drawPoints = (at: (seriesIndex: number, rowIndex: number) => boolean) => {
			const point = (seriesIndex: number, rowIndex: number, attrs: Record<string, string | number>) => {
				const [px, py] = pointAt(seriesIndex, rowIndex);

				// With its 2px stroke, a circle is 8px across; a square and a diamond are sized to look as large.
				const style = `${attrs.style ?? ""}${riseFrom(py)}${pointTiming(rowIndex)}`;
				return markerEl(markers[seriesIndex].shape, px, py, 3 * unit, { ...attrs, style });
			};

			const shown = (seriesIndex: number) => {
				if (/\bnone\b/.test(series[seriesIndex].marker ?? "")) return [];

				const rowIndexes = rows.map((_row, rowIndex) => rowIndex);
				return rowIndexes.filter((rowIndex) => !missing(seriesIndex, rowIndex) && at(seriesIndex, rowIndex));
			};

			// An open point is a hole in the lines and areas under it.
			const holes = own.flatMap((seriesIndex) =>
				markers[seriesIndex].open
					? shown(seriesIndex).map((rowIndex) =>
							point(seriesIndex, rowIndex, { class: HOLE_CLASS, "data-row": rowIndex + 1, ...(several && { "data-series": seriesIndex + 1 }) })
						)
					: []
			);

			// Left out of the lines with a clip, by the core, from the start; growing lines keep the mask, which follows them.
			if (svg.closest("[data-animate]")?.getAttribute("data-animate") === "grow") cutOut(svg, holes, VIEWBOX_WIDTH, height);
			else geo.lineHoles.push(...holes);

			own.forEach((seriesIndex) => {
				for (const rowIndex of shown(seriesIndex)) {
					svg.appendChild(
						withHalo(
							point(seriesIndex, rowIndex, {
								class: POINT_CLASS,
								...marks[seriesIndex].attrs,
								"data-marker": markers[seriesIndex].shape,
								...(markers[seriesIndex].open && { "data-open": "" }),
								"data-row": rowIndex + 1,
								style: marks[seriesIndex].ink,
							}),
							"point"
						)
					);
				}
			});
		};

		// Areas first, then every line, then the points, so a point is always on top of a line. The points come once the values are known.
		if (area) own.forEach((seriesIndex) => drawArea(seriesIndex));
		own.forEach((seriesIndex) => drawLine(seriesIndex));

		// Over columns, where the column chart placed each number, with a little room around it.
		const columnNumbers = mixed
			? series.flatMap((_one, seriesIndex) =>
					own.includes(seriesIndex)
						? []
						: seriesValues[seriesIndex].flatMap((label) => {
								const place = label.dataset.place;
								if (!place || place === "none" || label.hasAttribute("data-left-out")) return [];
								const [x, y, boxWidth, boxHeight] = boxOf(label, unit, VIEWBOX_WIDTH, height);
								return [{ label, box: [x - 2 * unit, y - 3 * unit, boxWidth + 4 * unit, boxHeight + 6 * unit] as Box }];
							})
				)
			: [];

		// A number of a column under a point of the line is left out; its row's tooltip shows it.
		const pointBoxes = step
			? []
			: own.flatMap((seriesIndex) =>
					rows.flatMap((_row, rowIndex): Box[] => {
						if (missing(seriesIndex, rowIndex)) return [];
						const [px, py] = pointAt(seriesIndex, rowIndex);
						return [[px - 4 * unit, py - 4 * unit, 8 * unit, 8 * unit]];
					})
				);

		// And a number the line runs through: small boxes along each piece of the line, as wide as the line and its edge.
		const lineBoxes = step
			? []
			: own.flatMap((seriesIndex) =>
					rows.flatMap((_row, rowIndex): Box[] => {
						if (rowIndex === last || missing(seriesIndex, rowIndex) || missing(seriesIndex, rowIndex + 1)) return [];
						const [x1, y1] = pointAt(seriesIndex, rowIndex);
						const [x2, y2] = pointAt(seriesIndex, rowIndex + 1);
						const count = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (3 * unit)));

						return Array.from({ length: count + 1 }, (_n, index): Box => {
							const alongX = x1 + ((x2 - x1) * index) / count;
							const alongY = y1 + ((y2 - y1) * index) / count;
							return [alongX - 3 * unit, alongY - 3 * unit, 6 * unit, 6 * unit];
						});
					})
				);

		const covered = (box: Box): boolean =>
			pointBoxes.some((point) => overlaps(point, box)) || lineBoxes.some((piece) => overlaps(piece, box));

		// Where a number inside a column that stands up would be at the foot of the column, or null if it cannot go there.
		const footOf = ({ label, box }: { label: HTMLElement; box: Box }): Box | null => {
			const column = svg.querySelector(`.${BAR_CLASS}[data-row="${label.dataset.row}"][data-series="${label.dataset.series}"]`);
			if (label.dataset.place !== "inside" || !column || column.hasAttribute("data-grow")) return null;

			const foot = Number(column.getAttribute("y")) + Number(column.getAttribute("height"));
			const moved: Box = [box[0], foot - box[3] - unit, box[2], box[3]];
			return moved[1] < box[1] ? null : moved;
		};

		// A number inside a column that the line covers goes to the foot of its column, if the line leaves it free there.
		for (const item of columnNumbers) {
			if (!covered(item.box)) continue;
			const moved = footOf(item);
			if (!moved || covered(moved)) continue;
			item.label.style.top = `${((moved[1] + moved[3] / 2) / height) * 100}%`;
			item.box = moved;
		}

		const columnsShown = columnNumbers.filter((item) => {
			if (!covered(item.box)) return true;
			item.label.setAttribute("data-left-out", "");
			return false;
		});

		// On a step chart, the last row from `rowIndex` on that has the same value.
		const runEnd = (seriesIndex: number, rowIndex: number): number => {
			let end = rowIndex;
			while (end < last && !missing(seriesIndex, end + 1) && cellAt(seriesIndex, end + 1)?.value === cellAt(seriesIndex, rowIndex)?.value) end++;
			return end;
		};

		const flip = (place: "above" | "below") => (place === "above" ? "below" : "above");

		// How much of the line next to a point runs through its number, above or below it: at a dip, the line runs through
		// the number above, so it goes below.
		const crosses = (seriesIndex: number, rowIndex: number, place: "above" | "below"): number => {
			const [px, py] = pointAt(seriesIndex, rowIndex);
			const labelWidth = sizeOf(seriesValues[seriesIndex][rowIndex]).width * unit;
			const box: Box = [px - labelWidth / 2, place === "above" ? py - 7 * unit - labelHeight : py + 7 * unit, labelWidth, labelHeight];
			if (box[1] + labelHeight > height) return Number.POSITIVE_INFINITY;

			return [rowIndex - 1, rowIndex + 1]
				.filter((neighbour) => neighbour >= 0 && neighbour <= last && !missing(seriesIndex, neighbour))
				.flatMap((neighbour) => piecesOf(seriesIndex, rowIndex, neighbour, 0))
				.filter((piece) => overlaps(piece, box)).length;
		};

		// The line between two of its points, as small boxes along it, close enough together that a value cannot fit between them.
		const piecesOf = (seriesIndex: number, rowIndex: number, neighbour: number, clear: number): Box[] => {
			const [x1, y1] = pointAt(seriesIndex, rowIndex);
			const [x2, y2] = pointAt(seriesIndex, neighbour);
			const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (3 * unit)));

			return Array.from({ length: steps + 1 }, (_n, index): Box => {
				const fraction = index / steps;
				return [x1 + (x2 - x1) * fraction - clear, y1 + (y2 - y1) * fraction - clear, 2 * clear, 2 * clear];
			});
		};

		const placeOf = (seriesIndex: number, rowIndex: number): Place => {
			const cell = cellAt(seriesIndex, rowIndex);
			if (!cell || cell.missing) return "none";

			// A step chart shows a number only where the value changes.
			if (step && rowIndex > 0 && !missing(seriesIndex, rowIndex - 1) && cellAt(seriesIndex, rowIndex - 1)?.value === cell.value) return "none";
			if (focused && !series[seriesIndex].focus) return "none";
			if (stacked) return "middle";

			// Below zero, a number goes under its point, away from the zero line.
			const alone = cell.value < 0 ? "below" : "above";
			if (!several || focused || series.length > 2) return area || step || crosses(seriesIndex, rowIndex, alone) <= crosses(seriesIndex, rowIndex, flip(alone)) ? alone : flip(alone);
			const other = cellAt(1 - seriesIndex, rowIndex);
			if (!other || other.missing) return alone;

			// The higher point of two goes above, measured on screen, as two axes can have different scales; on a tie, the first does.
			const ownY = pointAt(seriesIndex, rowIndex)[1];
			const otherY = pointAt(1 - seriesIndex, rowIndex)[1];
			if (ownY < otherY || (ownY === otherY && seriesIndex === 0)) return "above";

			// In an area chart, a number under its point may not cross zero.
			if (area && cell.value >= 0 && pointAt(seriesIndex, rowIndex)[1] + 7 * unit + labelHeight > baseline) return "above";
			return "below";
		};

		// The last row of a line with a value.
		const lastOf = (seriesIndex: number) => {
			let rowIndex = last;
			while (rowIndex > 0 && missing(seriesIndex, rowIndex)) rowIndex--;
			return rowIndex;
		};

		// A name starts past the numbers of the last row, which are centred on their points, so the two never touch.
		const nameGap =
			step || stacked ? 10 * unit : Math.max(10 * unit, ...own.map((seriesIndex) => (sizeOf(seriesValues[seriesIndex][last]).width * unit) / 2 + 6 * unit));

		// Between the end of a line and its name, a column of numbers, right aligned.
		const endWidth = (seriesIndex: number) => sizeOf(seriesValues[seriesIndex][lastOf(seriesIndex)]).width * unit;

		const endGap = geo.numbersAtEnd ? Math.max(...own.map(endWidth)) + 11 * unit : nameGap;

		// The names at the ends of the lines, pushed apart as they will be.
		const nameBoxes = (): Box[] => {
			const tall = (names[0] ? sizeOf(names[0]).height : 0) * unit;
			const room = 2 * unit;

			const ends = own.flatMap((seriesIndex) => {
				const name = names[seriesIndex];
				if (!name) return [];
				const [px, py] = pointAt(seriesIndex, lastOf(seriesIndex));
				return [{ name, x: px + endGap, y: py }];
			});

			const before = geo.numbersAtEnd ? endGap - 7 * unit : 0;
			return spread(ends, tall).map((end): Box => [end.x - room - before, end.y - tall / 2 - room, sizeOf(end.name).width * unit + 2 * room + before, tall + 2 * room]);
		};

		// With more than two lines, each number goes above its point or below it, where it covers no point and no other number.
		// Per row the highest value places first; below zero, below comes first. A number with no room at all is left out.
		const crowded = mixed ? !step : several && !focused && series.length > 2 && !stacked && !step;
		const picks = new Map<HTMLElement, Place | null>();

		if (crowded) {
			const items = rows
				.flatMap((_row, rowIndex) => own.map((seriesIndex) => ({ seriesIndex, rowIndex, value: cellAt(seriesIndex, rowIndex)?.value ?? 0 })))
				.filter(({ seriesIndex, rowIndex }) => placeOf(seriesIndex, rowIndex) !== "none")
				.sort((first, second) => first.rowIndex - second.rowIndex || second.value - first.value || first.seriesIndex - second.seriesIndex);

			const places = (value: number): Place[] => (value < 0 ? ["below", "above"] : ["above", "below"]);

			const candidates = items.map(({ seriesIndex, rowIndex, value }): Box[] => {
				const labelWidth = sizeOf(seriesValues[seriesIndex][rowIndex]).width * unit;
				const [px, py] = pointAt(seriesIndex, rowIndex);
				return places(value).map((place): Box => [px - labelWidth / 2, place === "above" ? py - 7 * unit - labelHeight : py + 7 * unit, labelWidth, labelHeight]);
			});

			const points = own.flatMap((seriesIndex) =>
				rows.flatMap((_row, rowIndex): Box[] => {
					if (missing(seriesIndex, rowIndex)) return [];
					const [px, py] = pointAt(seriesIndex, rowIndex);
					return [[px - 4 * unit, py - 4 * unit, 8 * unit, 8 * unit]];
				})
			);

			const chosen = avoidCollisions(candidates, [...points, ...nameBoxes(), ...columnsShown.map(({ box }) => box)], [0, 0, cx(last) + cx(0), height]);
			items.forEach(({ seriesIndex, rowIndex, value }, index) => picks.set(seriesValues[seriesIndex][rowIndex], chosen[index] === null ? null : places(value)[chosen[index] as number]));
		}

		// A number with no room is still placed, so it can be shown when its row is pointed at.
		const leftOut = (seriesIndex: number, rowIndex: number): boolean => {
			if (crowded) return picks.get(seriesValues[seriesIndex][rowIndex]) === null;
			if (!stacked && !step) return false;
			const width = sizeOf(seriesValues[seriesIndex][rowIndex]).width * unit;
			const rowsWide = step ? runEnd(seriesIndex, rowIndex) - rowIndex + 1 : 1;
			if (width > rowsWide * band - 4 * unit) return true;

			// A part below zero lies over the part under it, so its number would cover that one's.
			if (stacked && seriesIndex > 0 && topValue(seriesIndex, rowIndex) < bottomValue(seriesIndex, rowIndex)) return true;

			// A number at an end is moved inwards, past the points of its row.
			if (stacked && !step && rowIndex > 0 && rowIndex < last) {
				const middle = (yOf(seriesIndex)(bottomValue(seriesIndex, rowIndex)) + yOf(seriesIndex)(topValue(seriesIndex, rowIndex))) / 2;
				const box: Box = [cx(rowIndex) - width / 2, middle - labelHeight / 2, width, labelHeight];

				const covered = own.some((other) => {
					const [px, py] = pointAt(other, rowIndex);
					return !missing(other, rowIndex) && overlaps([px - 4 * unit, py - 4 * unit, 8 * unit, 8 * unit], box);
				});

				if (covered) return true;
			}

			return stacked && Math.abs(yOf(seriesIndex)(bottomValue(seriesIndex, rowIndex)) - yOf(seriesIndex)(topValue(seriesIndex, rowIndex))) < labelHeight * 1.2;
		};

		own.forEach((seriesIndex) => {
			seriesValues[seriesIndex].forEach((label, rowIndex) => {
				// A number arrives when the line reaches it: its point, or the middle of its row on a step chart.
				label.style.setProperty("--i", String(fixed(step ? (reach(rowIndex) + reach(rowIndex + 1)) / 2 : reach(rowIndex))));
				const place = picks.get(label) ?? placeOf(seriesIndex, rowIndex);
				label.dataset.place = place === "above" ? "outside" : place;
				label.toggleAttribute("data-left-out", place !== "none" && leftOut(seriesIndex, rowIndex));

				if (step && place !== "none") label.dataset.rowEnd = String(runEnd(seriesIndex, rowIndex) + 1);
				else delete label.dataset.rowEnd;

				if (place === "none") return;

				// On a step chart, in the middle of the rows with this value. In a stack, a number at an end is moved inwards, clear of the names.
				const inwards = (sizeOf(label).width * unit) / 2 + 4 * unit;
				let x = cx(rowIndex);

				if (step) x = (cx(rowIndex) + cx(runEnd(seriesIndex, rowIndex))) / 2;
				else if (place === "middle" && rowIndex === 0) x += inwards;
				else if (place === "middle" && rowIndex === last) x -= inwards;

				const py = yOf(seriesIndex)(topValue(seriesIndex, rowIndex));

				const offsets: Record<Exclude<Place, "none">, number> = {
					middle: (yOf(seriesIndex)(bottomValue(seriesIndex, rowIndex)) - py) / 2,
					above: -7 * unit,
					below: 7 * unit,
				};

				placeAt(label, x, py + offsets[place], VIEWBOX_WIDTH, height);
			});
		});

		// Which values are shown: all, or a set, such as the first, last, highest and lowest, and the rows with `data-value="show"`.
		// With `auto`, all if they fit, and else the set. A value that is not shown is left out, so its row's tooltip has it.
		// In order of priority: where two would touch, the later one is dropped, with its point.
		const keyRows = (seriesIndex: number): Set<number> => {
			const order = rows.flatMap((row, rowIndex) => (row.pinned && !missing(seriesIndex, rowIndex) ? [rowIndex] : []));
			const known = rows.map((_row, rowIndex) => rowIndex).filter((rowIndex) => !missing(seriesIndex, rowIndex));

			const value = (rowIndex: number) => cellAt(seriesIndex, rowIndex)?.value ?? 0;

			const { keys } = geo.pick;

			if (known.length) {
				if (keys.includes("last")) order.push(known[known.length - 1]);
				if (keys.includes("first")) order.push(known[0]);

				const higher = (best: number, candidate: number) => (value(candidate) > value(best) ? candidate : best);

				const lower = (best: number, candidate: number) => (value(candidate) < value(best) ? candidate : best);

				if (keys.includes("highest")) order.push(known.reduce(higher));
				if (keys.includes("lowest")) order.push(known.reduce(lower));

				// The values far from the trend, as Summary finds them, so the chart shows the months a summary names.
				if (keys.includes("outliers")) {
					const trend = trendOf(known.map((rowIndex) => ({ x: rowIndex, y: value(rowIndex) })));
					order.push(...(trend?.outside.map((point) => point.x) ?? []));
				}
			}

			const kept: number[] = [];

			// A last value that goes next to the name is not near its point, so it takes no room from the values before it.
			const beside = (rowIndex: number) => geo.numbersAtEnd && rowIndex === lastOf(seriesIndex);

			for (const rowIndex of order) {
				const label = seriesValues[seriesIndex][rowIndex];
				if (kept.includes(rowIndex) || label.dataset.place === "none") continue;

				const clearOf = (keptIndex: number) => stepOf([seriesValues[seriesIndex][keptIndex], label], unit, VIEWBOX_WIDTH, height) === 1;

				if (beside(rowIndex) || kept.filter((keptIndex) => !beside(keptIndex)).every(clearOf)) kept.push(rowIndex);
			}

			return new Set(kept);
		};

		// They fit if no two touch. A value the chart already left out, to keep it clear of another line or a column, does not count.
		const fitsAll = (seriesIndex: number) => {
			const placed = seriesValues[seriesIndex].filter((label) => label.dataset.place !== "none" && !label.hasAttribute("data-left-out"));
			return stepOf(placed, unit, VIEWBOX_WIDTH, height) === 1;
		};

		// Per series, the rows whose value is shown; null for all of them.
		const showing = new Map<number, Set<number> | null>();

		for (const seriesIndex of own) {
			const all = geo.pick.mode === "all" || (geo.pick.mode === "auto" && fitsAll(seriesIndex));
			const set = all ? null : keyRows(seriesIndex);
			showing.set(seriesIndex, set);

			if (set) seriesValues[seriesIndex].forEach((label, rowIndex) => {
				if (label.dataset.place !== "none" && !set.has(rowIndex)) label.setAttribute("data-left-out", "");
			});
		}

		// The values of a set each find a place: above, below, before or after their point, clear of every line, of the names at
		// the ends of the lines and of each other, in the order of the set. A value at a dip tries below first, where its line
		// does not run. A value with no room is left out; its row's tooltip still has it.
		if (!stacked && !step && own.some((seriesIndex) => showing.get(seriesIndex))) {
			const right = cx(last) + cx(0);
			const clear = 2 * unit;

			const along: Box[] = own.flatMap((seriesIndex) =>
				rows.flatMap((_row, rowIndex) => {
					const joined = rowIndex < last && !missing(seriesIndex, rowIndex) && !missing(seriesIndex, rowIndex + 1);
					return joined ? piecesOf(seriesIndex, rowIndex, rowIndex + 1, clear) : [];
				})
			);

			const ends = nameBoxes();

			// Above or below its point, or beside it. A value that fits none of these is left out, not moved further away.
			type Spot = "outside" | "below" | "after" | "before";

			const everyValue: ValueAt[] = own.flatMap((seriesIndex) =>
				[...(showing.get(seriesIndex) ?? [])].map((rowIndex) => ({ seriesIndex, rowIndex }))
			);

			const atEnd = ({ seriesIndex, rowIndex }: ValueAt) => geo.numbersAtEnd && rowIndex === lastOf(seriesIndex);

			const items = everyValue.filter((item) => !atEnd(item));

			const spotsOf = ({ seriesIndex, rowIndex }: ValueAt): Spot[] => {
				const value = cellAt(seriesIndex, rowIndex)?.value ?? 0;
				const before = rowIndex > 0 && !missing(seriesIndex, rowIndex - 1) ? cellAt(seriesIndex, rowIndex - 1)?.value : undefined;
				const after = rowIndex < last && !missing(seriesIndex, rowIndex + 1) ? cellAt(seriesIndex, rowIndex + 1)?.value : undefined;

				const notAbove = (neighbour: number | undefined) => neighbour === undefined || value <= neighbour;

				const dip = (before ?? after) !== undefined && notAbove(before) && notAbove(after);

				return dip
					? ["below", "outside", "after", "before"]
					: ["outside", "below", "after", "before"];
			};

			const boxOf = ({ seriesIndex, rowIndex }: ValueAt, spot: Spot): Box => {
				const labelWidth = sizeOf(seriesValues[seriesIndex][rowIndex]).width * unit;
				const boxHeight = labelHeight;
				const [px, py] = pointAt(seriesIndex, rowIndex);

				// Above and below, moved in at the edges, as a value at the end of a line is.
				const middle = Math.min(Math.max(px - labelWidth / 2, 0), right - labelWidth);
				if (spot === "outside") return [middle, py - 7 * unit - boxHeight, labelWidth, boxHeight];
				if (spot === "below") return [middle, py + 7 * unit, labelWidth, boxHeight];
				if (spot === "after") return [px + 7 * unit, py - boxHeight / 2, labelWidth, boxHeight];
				return [px - 7 * unit - labelWidth, py - boxHeight / 2, labelWidth, boxHeight];
			};

			const spots = items.map(spotsOf);

			// A place clear of everything; else one that only crosses a line, which can still be read, but never another value or a name.
			const inside = (box: Box) => box[0] >= 0 && box[1] >= 0 && box[0] + box[2] <= right && box[1] + box[3] <= height - 2 * unit;

			// A value never covers a point: the points of the values shown, with a little room around them.
			const points: Box[] = everyValue.map(({ seriesIndex, rowIndex }) => {
				const [px, py] = pointAt(seriesIndex, rowIndex);
				return [px - 6 * unit, py - 6 * unit, 12 * unit, 12 * unit];
			});

			const placed: Box[] = [];

			// A value that crosses a line gets an edge in the background colour, so it can be read.
			const crossing = new Set<number>();

			const chosen = items.map((item, index) => {
				const boxes = spots[index].map((spot) => boxOf(item, spot));

				const free = (box: Box) => inside(box) && ![...placed, ...ends, ...points].some((other) => overlaps(box, other));

				let pick = boxes.findIndex((box) => free(box) && !along.some((piece) => overlaps(box, piece)));

				if (pick < 0) {
					pick = boxes.findIndex(free);
					if (pick >= 0) crossing.add(index);
				}

				if (pick >= 0) placed.push(boxes[pick]);
				return pick < 0 ? null : pick;
			});

			items.forEach((item, index) => {
				const label = seriesValues[item.seriesIndex][item.rowIndex];
				label.toggleAttribute("data-cut", crossing.has(index));
				const pick = chosen[index];
				label.toggleAttribute("data-left-out", pick === null);
				if (pick === null) return;
				const spot = spots[index][pick];
				const [bx, by, bw, bh] = boxOf(item, spot);
				const place = spot;
				label.dataset.place = place;

				// Where each place is anchored: the foot of a value above, the top of one below, the side of one beside.
				const x = place === "after" ? bx : place === "before" ? bx + bw : bx + bw / 2;
				const y = place === "outside" ? by + bh : place === "below" ? by : by + bh / 2;
				placeAt(label, x, y, VIEWBOX_WIDTH, height);
			});
		}

		// A step chart has no points: its corners show where the values change. With all values, a line whose points would cover
		// each other has none either. With a set, each value shown has its point.
		if (!step) drawPoints((seriesIndex, rowIndex) => {
			const set = showing.get(seriesIndex);
			return set ? set.has(rowIndex) : band >= 10 * unit;
		});

		// The tooltip of a row points at its highest point, also where no point is drawn.
		geo.pointOf = (rowIndex) => {
			const tops = own.filter((seriesIndex) => !missing(seriesIndex, rowIndex)).map((seriesIndex) => pointAt(seriesIndex, rowIndex));
			return tops.length ? tops.reduce((best, candidate) => (candidate[1] < best[1] ? candidate : best)) : null;
		};

		// The crosshair of a row: a line down through it, and a dot in the shape of each line's points, a little larger.
		geo.crossingOf = (rowIndex) => {
			if (rowIndex < 0 || rowIndex > last) return null;
			const [from, to] = geo.frame ? [geo.frame[1], geo.frame[1] + geo.frame[3]] : [geo.domain ? y(geo.domain[1]) : 0, rule];

			const points = own
				.filter((seriesIndex) => !missing(seriesIndex, rowIndex))
				.map((seriesIndex) => {
					const [px, py] = pointAt(seriesIndex, rowIndex);
					const shape = markers[seriesIndex].shape === "none" ? "circle" : markers[seriesIndex].shape;

					const dot = markerEl(shape, px, py, 4.5 * unit, {
						class: "tablechart-crosshair-point",
						...marks[seriesIndex].attrs,
						...(markers[seriesIndex].open && { "data-open": "" }),
						style: marks[seriesIndex].ink,
					});

					return { series: seriesIndex, y: py, dot };
				});

			const right = geo.axisSide === "right";
			return { x: cx(rowIndex), from, to, edge: right ? VIEWBOX_WIDTH : (geo.frame?.[0] ?? 0), end: cx(right ? 0 : last), axis: geo.axisSide, height, points };
		};

		// Each name just past the last point of its line, pushed apart where two lines end close together.
		const ends = (mixed ? [] : names).map((name, seriesIndex) => {
			const rowIndex = lastOf(seriesIndex);
			const [px, py] = pointAt(seriesIndex, rowIndex);
			const end = step ? px + band / 2 : px;
			return { name, seriesIndex, x: end + endGap, y: stacked ? (py + yOf(seriesIndex)(bottomValue(seriesIndex, rowIndex))) / 2 : py };
		});

		const nameHeight = (names[0] ? sizeOf(names[0]).height : 0) * unit;

		for (const end of spread(ends, nameHeight)) {
			placeAt(end.name, end.x, end.y, VIEWBOX_WIDTH, height);
			if (!geo.numbersAtEnd) continue;
			const label = seriesValues[end.seriesIndex][lastOf(end.seriesIndex)];
			label.dataset.place = "before";
			label.removeAttribute("data-left-out");
			label.removeAttribute("data-cut");
			placeAt(label, end.x - 4 * unit, end.y, VIEWBOX_WIDTH, height);
		}

		// A number of the line fully inside a column, clear of the line, looks like a number of the column. One that touches a column gets an edge.
		if (mixed) {
			const columns = Array.from(svg.querySelectorAll<SVGGraphicsElement>(`:is(.${BAR_CLASS}, .${PIECE_CLASS})`), (column) => {
				const { x, y: top, width, height: tall } = column.getBBox();
				return { series: column.dataset.series ?? "", box: [x, top, width, tall] as Box };
			});

			const edge = (Number.parseFloat(getComputedStyle(svg).getPropertyValue("--tablechart-halo-width")) || 2.5) * unit;

			// Whether the first box is inside the second.
			const within = ([x, top, width, tall]: Box, [outerX, outerTop, outerWidth, outerTall]: Box): boolean =>
				x >= outerX && top >= outerTop && x + width <= outerX + outerWidth && top + tall <= outerTop + outerTall;

			// The digits, about the middle 56% of the line height, and the edge around them.
			const digitsOf = (label: HTMLElement): Box => {
				const [x, top, width, tall] = boxOf(label, unit, VIEWBOX_WIDTH, height);
				return [x - edge, top + tall * 0.22 - edge, width + 2 * edge, tall * 0.56 + 2 * edge];
			};

			// The lines and their points: a number that touches them needs the edge, also inside a column.
			const lineBoxes: Box[] = own.flatMap((seriesIndex) =>
				rows.flatMap((_row, rowIndex): Box[] => {
					if (missing(seriesIndex, rowIndex)) return [];
					const [px, py] = pointAt(seriesIndex, rowIndex);
					const point: Box = [px - 4 * unit, py - 4 * unit, 8 * unit, 8 * unit];
					const toNext = rowIndex === last || missing(seriesIndex, rowIndex + 1) ? [] : piecesOf(seriesIndex, rowIndex, rowIndex + 1, unit);
					return [point, ...toNext];
				})
			);

			for (const seriesIndex of own) {
				for (const label of seriesValues[seriesIndex]) {
					const shown = label.dataset.place !== "none" && !label.hasAttribute("data-left-out");
					const digits = digitsOf(label);
					const onLine = lineBoxes.some((piece) => overlaps(digits, piece));
					const holder = shown && !onLine ? columns.find((column) => within(digits, column.box)) : undefined;
					const reaches = shown && !holder && columns.some((column) => overlaps(digits, column.box));

					label.toggleAttribute("data-halo", reaches);

					if (holder) label.dataset.over = holder.series;
					else {
						delete label.dataset.over;
						label.style.removeProperty("--_ink");
					}
				}
			}
		}

		// With numbers under the lower line, the rule is the foot of the plot rather than zero, unless values go below zero.
		const belowZero = rows.some((row) => row.cells.some((cell) => !cell.missing && cell.value < 0));
		const rule = !area && !stacked && series.length === 2 && !focused && !belowZero ? height - 2 * unit : baseline;

		// Over columns, the column chart has drawn the rule.
		if (!mixed)
			svg.appendChild(
				svgEl("line", {
					class: RULE_CLASS,
					x1: 0,

					// Past the last band is where the names are, unless the axis is past them.
					x2: geo.axisSide === "right" ? VIEWBOX_WIDTH : cx(last) + cx(0),
					y1: rule,
					y2: rule,
				})
			);
	},
});

export const line = trend(false);
export const area = trend(true);
