import {
	avoidCollisions,
	type Box,
	htmlEl,
	largest,
	LEGEND_CLASS,
	markerEl,
	NAME_CLASS,
	placeAt,
	POINT_CLASS,
	type Shape,
	short,
	sizeOf,
	VIEWBOX_WIDTH,
} from "../kit";
import type { ChartType, Row, Series } from "../types";

const SHAPES: Shape[] = ["circle", "triangle", "square", "diamond"];
// Where a name goes, in order of preference: right, left, above, below, then the corners.
const SIDES = ["right", "left", "above", "below", "right", "left", "right", "left"];

/** The value columns are x, y and the size of a bubble; a header with `data-group` names the groups. */
const fieldsOf = (series: Series[]) => {
	const values = series.flatMap((one, s) => (one.group ? [] : [s]));
	return { x: values[0], y: values[1], size: values[2] as number | undefined, group: series.findIndex((one) => one.group) };
};

const groupsOf = (rows: Row[], group: number): string[] =>
	group < 0 ? [] : [...new Set(rows.map((row) => row.cells[group]?.raw ?? ""))];

/** Where a row's marker is, as text, so rows at the same place match; null without both numbers. */
const placeOf = (row: Row, x: number, y: number): string | null =>
	row.cells[x]?.missing || row.cells[y]?.missing ? null : `${row.cells[x]?.value} ${row.cells[y]?.value}`;

/** One marker per row, across by its first value and up by its second; a third value makes it a bubble. */
export const scatter: ChartType = {
	aspect: 0.62,
	categories: "beside",
	columns: true,
	axes: true,

	// A legend for the groups, and for the size of a bubble.
	text({ figure, plot, rows, series, config }) {
		const { x, y, size, group } = fieldsOf(series);

		// Rows at the same place share one name, with the number of the others: the name of the largest, or else the first.
		const names = plot.querySelector(":scope > .tablechart-categories")?.children ?? [];
		const places = new Map<string, number[]>();
		rows.forEach((row, i) => {
			const place = placeOf(row, x, y);
			if (place) places.get(place)?.push(i) ?? places.set(place, [i]);
		});
		const bigness = (i: number) => (size === undefined ? 0 : Math.abs(rows[i].cells[size]?.value ?? 0));
		for (const same of places.values()) {
			if (same.length < 2) continue;
			const shown = same.reduce((a, b) => (bigness(b) > bigness(a) ? b : a));
			for (const i of same) {
				const name = names[i] as HTMLElement | undefined;
				if (i === shown) name?.setAttribute("data-more", String(same.length - 1));
				else name?.setAttribute("data-same", "");
			}
		}

		const groups = groupsOf(rows, group);
		if (groups.length < 2 && size === undefined) return;
		const legend = document.createElement("div");
		legend.className = LEGEND_CLASS;
		legend.setAttribute("aria-hidden", "true");
		legend.inert = true;
		const cells = Array.from(figure.querySelectorAll(`tbody tr > td:nth-of-type(${group + 1})`));
		const entry = (text: string, key: string | null | undefined) => {
			const node = htmlEl(NAME_CLASS, legend);
			node.dataset.place = "legend";
			node.dataset.line = "none";
			node.textContent = text;
			if (key && config.langattribute) node.setAttribute(config.langattribute, key);
			return node;
		};
		if (groups.length > 1)
			groups.forEach((name, g) => {
				const key = config.langattribute ? cells.find((td) => td.textContent?.trim() === name)?.getAttribute(config.langattribute) : null;
				const node = entry(name, key);
				node.dataset.marker = SHAPES[g % SHAPES.length];
				node.style.setProperty("--n", String(g));
				node.style.setProperty("--palette", `var(--tablechart-color-${g + 1})`);
			});
		if (size !== undefined) entry(series[size].name, series[size].key).dataset.marker = "size";
		figure.appendChild(legend);
	},

	draw(geo) {
		const { rows, series, x, y, frame, unit, svg, categories, seriesValues, height, config, plot } = geo;
		if (!x || !frame) return;
		const fields = fieldsOf(series);
		const groups = groupsOf(rows, fields.group);
		const several = groups.length > 1;
		for (const label of seriesValues.flat()) label.dataset.place = "none";

		// Both sizes are across; a bubble's area follows its value, up to `--tablechart-bubble-max`.
		const base = (geo.length("--tablechart-marker-size", "10px") ?? 10 * unit) / 2;
		const most = (geo.length("--tablechart-bubble-max", "24px") ?? 24 * unit) / 2;
		const sizeCell = (row: Row) => (fields.size === undefined ? undefined : row.cells[fields.size]);
		const top = largest(rows.map((row) => Math.abs(sizeCell(row)?.value ?? 0)));
		const marks = rows.flatMap((row, i) => {
			const across = row.cells[fields.x];
			const up = row.cells[fields.y];
			if (!across || !up || across.missing || up.missing) return [];
			const cell = sizeCell(row);
			const r = cell && !cell.missing && top > 0 ? Math.max(base * 0.6, Math.sqrt(Math.abs(cell.value) / top) * most) : base;
			const g = several ? groups.indexOf(row.cells[fields.group]?.raw ?? "") : -1;
			return [{ i, px: x(across.value), py: y(up.value), r, g }];
		});

		// The markers arrive from left to right, in at most seven stagger steps.
		const steps = Math.min(marks.length - 1, 6);
		plot.style.setProperty("--count", String(steps + 1));
		const timing = new Map(
			[...marks].sort((a, b) => a.px - b.px || a.i - b.i).map((m, k) => [m.i, steps ? short((k * steps) / (marks.length - 1)) : 0])
		);

		// Larger first, so a small marker is on top of a large one and the large one's name is placed first.
		const order = [...marks].sort((a, b) => b.r - a.r || a.i - b.i);
		for (const m of order) {
			const shape = several ? SHAPES[m.g % SHAPES.length] : "circle";
			svg.appendChild(
				markerEl(shape, m.px, m.py, m.r, {
					class: POINT_CLASS,
					"data-row": m.i + 1,
					"data-marker": shape,
					style: `--i:${timing.get(m.i)}; ${several ? `--n:${m.g}; --palette:var(--tablechart-color-${m.g + 1})` : ""}`,
				})
			);
		}

		// Each name beside its marker, where it covers no marker and no other name; else it is left out.
		const own = plot.parentElement?.getAttribute("data-chart-names");
		const named = own == null ? config.names : own !== "false";
		const gap = 4 * unit;
		// A little room along the axes, so a name does not touch them.
		const room: Box = [frame[0] + 1.5 * gap, frame[1], frame[2] - 1.5 * gap, frame[3] - 1.5 * gap];
		const [fx, fy, fw, fh] = room;
		const candidates = order.map(({ i, px, py, r }): Box[] => {
			// A row that shares its place shows no name of its own: the one name there counts it.
			if (categories[i].hasAttribute("data-same")) return [];
			const { width, height: tall } = sizeOf(categories[i]);
			const w = width * unit;
			const h = tall * unit;
			const inset = h * 0.1;
			const d = r * 0.7 + gap / 2;
			// Without the space of the line height above and below the letters, so two names can stack as lines do.
			// Moved back inside the plot, so a marker near an edge can still have its name above or beside it.
			const box = (left: number, top: number): Box => [
				Math.max(fx, Math.min(left, fx + fw - w)),
				Math.max(fy, Math.min(top, fy + fh - h)) + inset,
				w,
				h - 2 * inset,
			];
			return [
				box(px + r + gap, py - h / 2),
				box(px - r - gap - w, py - h / 2),
				box(px - w / 2, py - r - gap - h),
				box(px - w / 2, py + r + gap),
				box(px + d, py - d - h),
				box(px - d - w, py - d - h),
				box(px + d, py + d),
				box(px - d - w, py + d),
			];
		});
		const chosen = named
			? avoidCollisions(candidates, marks.map(({ px, py, r }): Box => [px - r, py - r, 2 * r, 2 * r]), room)
			: order.map(() => null);
		// A row without both numbers has no marker and no name.
		for (const label of categories) {
			label.hidden = true;
			label.dataset.missing = "";
		}
		order.forEach((m, k) => {
			const label = categories[m.i];
			const pick = chosen[k];
			label.hidden = false;
			delete label.dataset.missing;
			label.style.setProperty("--i", String(timing.get(m.i)));
			label.toggleAttribute("data-left-out", pick === null);
			if (pick === null) return;
			label.dataset.side = SIDES[pick];
			const [left, top, , h] = candidates[k][pick];
			placeAt(label, left, top - (sizeOf(label).height * unit - h) / 2, VIEWBOX_WIDTH, height);
		});

		// The marker nearest the pointer, within a few pixels of its edge; inside two, the smaller one, which is on top.
		geo.rowAt = (sx, sy) => {
			let best: (typeof marks)[number] | null = null;
			let near = 6 * unit;
			for (const m of marks) {
				const d = Math.max(Math.hypot(m.px - sx * unit, m.py - sy * unit) - m.r, 0);
				if (d < near || (d === near && best && m.r < best.r)) {
					near = d;
					best = m;
				}
			}
			return best ? best.i : null;
		};
	},

	// A scatter leaves names out, not numbers, so its tooltip shows names: the one pointed at, and any at the same place.
	tooltip(state, index) {
		const { x, y } = fieldsOf(state.series);
		const here = placeOf(state.rows[index], x, y);
		const same = state.rows.flatMap((row, i) => (i === index || (here !== null && placeOf(row, x, y) === here) ? [i] : []));
		// The one pointed at first.
		return [index, ...same.filter((i) => i !== index)].map((i) => ({ name: state.categories[i]?.textContent ?? "", value: "" }));
	},
};
