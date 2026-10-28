import { boxOf, type Box, GRID_CLASS, LIBRARY_NAME, overlaps, placeAt, POINT_CLASS, QUADRANT_CLASS, short, sizeOf, svgEl, VIEWBOX_WIDTH } from "../kit";
import type { AnnotationType, Geometry } from "../types";

const NAME_CLASS = `${QUADRANT_CLASS}-name`;
const CORNERS = ["top left", "top right", "bottom left", "bottom right"];

/** Where a line of the quadrant is on its axis: a number, `mean` or `median` of that column, or else the middle of the axis. */
const valueOf = (asked: string | null, numbers: number[]): number | null => {
	if (!asked) return null;
	if (asked === "mean") return numbers.length ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : null;
	if (asked === "median") {
		const sorted = [...numbers].sort((a, b) => a - b);
		const half = sorted.length / 2;
		return sorted.length ? (sorted.length % 2 ? sorted[Math.floor(half)] : (sorted[half - 1] + sorted[half]) / 2) : null;
	}
	const value = Number.parseFloat(asked);
	return Number.isFinite(value) ? value : null;
};

/**
 * A scatter chart in four: a line across and a line up, at `data-x` and `data-y` or else in the middle of the axes,
 * and the name of each quadrant in its outer corner, from the elements with `data-corner`. It is there from the start,
 * before the dots, so its lines are whole until the name of a dot arrives over them.
 */
export const quadrant: AnnotationType = {
	// The names are made once, with their translation keys; the annotation has no badge of its own.
	create(spec, plot) {
		for (const corner of spec.querySelectorAll<HTMLElement>("[data-corner]")) {
			const words = (corner.getAttribute("data-corner") ?? "").toLowerCase().split(/\s+/);
			// In any order: "right bottom" is "bottom right".
			const where = `${words.find((word) => word === "top" || word === "bottom")} ${words.find((word) => word === "left" || word === "right")}`;
			if (!CORNERS.includes(where)) {
				console.warn(`[${LIBRARY_NAME}] A quadrant has a corner "${corner.getAttribute("data-corner")}". It takes ${CORNERS.join(", ")}.`);
				continue;
			}
			const name = document.createElement("span");
			name.className = NAME_CLASS;
			name.dataset.corner = where;
			name.inert = true;
			if (corner.childElementCount) for (const child of Array.from(corner.children)) name.append(child.cloneNode(true));
			else name.textContent = (corner.textContent ?? "").trim();
			for (const { name: attribute, value } of Array.from(corner.attributes)) if (attribute !== "data-corner") name.setAttribute(attribute, value);
			plot.append(name);
		}
		return null;
	},

	draw(spec, _badge, geo: Geometry) {
		const { frame, x, y, rows, series, height, unit, svg, plot, categories } = geo;
		if (!frame || !x) {
			console.warn(`[${LIBRARY_NAME}] A quadrant works on a scatter chart, which has an axis across and an axis up.`);
			return;
		}
		const [left, top, width, tall] = frame;
		const fields = series.flatMap((one, s) => (one.group ? [] : [s]));
		const column = (k: number) => rows.flatMap((row) => (row.cells[fields[k]] && !row.cells[fields[k]].missing ? [row.cells[fields[k]].value] : []));
		const across = valueOf(spec.getAttribute("data-x"), column(0));
		const up = valueOf(spec.getAttribute("data-y"), column(1));
		const at = across === null ? left + width / 2 : Math.min(Math.max(x(across), left), left + width);
		const level = up === null ? top + tall / 2 : Math.min(Math.max(y(up), top), top + tall);
		// A gridline in the same place as a line of the quadrant is left out: the quadrant's line is there instead.
		const grid = svg.querySelector<SVGElement>(`:scope > .${GRID_CLASS}`);
		if (grid) {
			const near = (a: number, b: number) => Math.abs(a - b) < unit / 2;
			const lines = (grid.getAttribute("d") ?? "").match(/M[^M]+/g) ?? [];
			grid.setAttribute(
				"d",
				lines
					.filter((line) => {
						const [, gx, gy, axis] = line.match(/M(-?[\d.]+),(-?[\d.]+)([HV])/) ?? [];
						return !(axis === "V" && near(Number(gx), at)) && !(axis === "H" && near(Number(gy), level));
					})
					.join("")
			);
		}
		// Under the dots, so a dot on a line stays whole.
		svg.insertBefore(
			svgEl("path", { class: QUADRANT_CLASS, d: `M${short(at)},${short(top)}V${short(top + tall)}M${short(left)},${short(level)}H${short(left + width)}` }),
			svg.querySelector(`:scope > .${POINT_CLASS}`)
		);

		// Each name in its corner, a little in from the axes.
		const gap = 6 * unit;
		const boxes: Box[] = [];
		for (const name of plot.querySelectorAll<HTMLElement>(`:scope > .${NAME_CLASS}`)) {
			const where = name.dataset.corner ?? "";
			const right = where.includes("right");
			const bottom = where.includes("bottom");
			const nx = right ? left + width - gap : left + gap;
			const ny = bottom ? top + tall - gap : top + gap;
			placeAt(name, nx, ny, VIEWBOX_WIDTH, height);
			const w = sizeOf(name).width * unit;
			const h = sizeOf(name).height * unit;
			boxes.push([right ? nx - w : nx, bottom ? ny - h : ny, w, h]);
		}
		geo.taken.push(...boxes);
		// The name of a dot that would cover the name of a quadrant is left out; the tooltip of its dot still has it.
		for (const label of categories) {
			if (label.hidden || label.hasAttribute("data-left-out") || !label.style.left) continue;
			const box = boxOf(label, unit, VIEWBOX_WIDTH, height, [0, 0]);
			if (boxes.some((one) => overlaps(one, box))) label.setAttribute("data-left-out", "");
		}
	},
};
