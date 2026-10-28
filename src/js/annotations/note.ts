import { LIBRARY_NAME, POINT_CLASS, REFERENCE_CLASS, VIEWBOX_WIDTH } from "../config";
import { avoidCollisions, overlaps, type Box } from "../functions/collision";
import { boxOf } from "../functions/labels";
import { sizeOf } from "../functions/measure";
import { timing } from "../functions/timing";
import { placeAt, svgEl } from "../functions/svg";
import type { AnnotationType } from "../types";
import { createBadge } from "./badge";

/**
 * A note at a row, such as "Share issue": a line up from the baseline at that row, with the note at the top.
 * `data-row` is the row, counted from 1, or its name. Tablechart makes one for each cell in a column with `data-note`.
 */
export const note: AnnotationType = {
	create(spec, plot) {
		if (!spec.textContent?.trim()) return null;
		const badge = createBadge(spec, plot);
		badge.dataset.kind = "note";
		return badge;
	},

	draw(spec, badge, geo) {
		const { rows, cx, y, height, unit, svg, after, seriesValues } = geo;
		if (geo.x || geo.centre || geo.categories[0]?.parentElement?.dataset.place === "beside") {
			console.warn(`[${LIBRARY_NAME}] A note works on a chart with its rows across, such as a line or column chart.`);
			return;
		}
		const asked = (spec.getAttribute("data-row") ?? "").trim();
		const i = /^\d+$/.test(asked) ? Number(asked) - 1 : rows.findIndex((row) => row.label === asked);
		if (i < 0 || i >= rows.length) {
			console.warn(`[${LIBRARY_NAME}] A note is for row "${asked}", which is not there.`);
			return;
		}
		const at = cx(i);
		const foot = y(0);
		// Under the points and markers, as a reference line is; it stops at the text it would cross.
		svg.insertBefore(
			svgEl("line", { class: REFERENCE_CLASS, "data-kind": "note", "data-note": geo.note, x1: at, x2: at, y1: 0, y2: foot, style: timing("--after", after) }),
			svg.querySelector(`:scope > .${POINT_CLASS}`)
		);
		if (!badge) return;

		// At the top, over its row or beside it, clear of other notes and of the values on the chart.
		const w = sizeOf(badge).width * unit;
		const h = sizeOf(badge).height * unit;
		const gap = 4 * unit;
		const values = seriesValues.flat().flatMap((label) =>
			!label.style.left || label.dataset.place === "none" || label.hasAttribute("data-left-out")
				? []
				: [{ label, box: boxOf(label, unit, VIEWBOX_WIDTH, height) }]
		);
		const candidates = [0, h + gap / 2].flatMap((y0): Box[] => [[at - w / 2, y0, w, h], [at + gap, y0, w, h], [at - gap - w, y0, w, h]]);
		const [pick] = avoidCollisions([candidates], [...geo.taken, ...values.map((one) => one.box)], [0, 0, VIEWBOX_WIDTH, height]);
		const box = candidates[pick ?? 0];
		geo.taken.push(box);
		placeAt(badge, box[0] + w / 2, box[1] + h / 2, VIEWBOX_WIDTH, height);
		badge.style.setProperty("--after", String(after));
		// With no room left, a value under the note is left out; its row's tooltip still has it.
		if (pick === null)
			for (const value of values) if (overlaps(value.box, box)) value.label.setAttribute("data-left-out", "");
	},
};
