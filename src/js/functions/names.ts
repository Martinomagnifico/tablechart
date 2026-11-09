// The names under a chart: they fit their columns, and line up with the charts next to it.
import { area, line } from "../charts/line";
import { CATEGORIES_CLASS, type Config, RULE_CLASS } from "../config";
import type { ChartState } from "../types";
import { largest } from "./format";
import { fitTogether } from "./labels";
import { turnedOn } from "./settings";
import { short } from "./svg";

/** In a `data-chart-group`, charts on one line of the page get rows of names of one height, so their baselines line up. */
export const lineUpNames = (figure: HTMLElement): void => {
	const holder = figure.closest<HTMLElement>("[data-chart-group]");
	if (!holder) return;
	const name = holder.getAttribute("data-chart-group");
	const holders = name ? Array.from(document.querySelectorAll<HTMLElement>(`[data-chart-group="${CSS.escape(name)}"]`)) : [holder];
	const rows = holders.flatMap((one) => Array.from(one.querySelectorAll<HTMLElement>(`.${CATEGORIES_CLASS}:not([data-place])`)));
	for (const row of rows) row.style.minHeight = "";
	const found = rows
		.map((row) => ({ row, tall: row.offsetHeight, top: row.closest("figure")?.getBoundingClientRect().top ?? 0 }))
		.filter(({ tall }) => tall > 0)
		.sort((a, b) => a.top - b.top);
	// Within a few pixels is the same line of the page; after a wrap, each line has its own height.
	for (let i = 0; i < found.length; ) {
		let end = i;
		while (end + 1 < found.length && found[end + 1].top - found[i].top < 4) end++;
		const line = found.slice(i, end + 1);
		const tallest = largest(line.map(({ tall }) => tall));
		if (line.length > 1) for (const { row, tall } of line) if (tall < tallest) row.style.minHeight = `${tallest}px`;
		i = end + 1;
	}
};

export const fitNames = (state: ChartState, config: Config, height: number, unit: number): void => {
	const { rows, svg, type } = state;
	// Names under the plot shrink together, down to 70%, if one is wider than its column.
	// If they still do not fit, every second, third or more is shown, at full size, centred under its column.
	const nameRow = state.categories[0]?.parentElement;
	if (nameRow && type.categories !== "beside" && !type.centre) {
		// Held at its height while the names are measured at full size, so the page under it does not move for a moment.
		nameRow.style.height = `${nameRow.offsetHeight}px`;
		nameRow.removeAttribute("data-thinned");
		for (const name of state.categories) {
			name.removeAttribute("data-left-out");
			name.removeAttribute("data-edge");
		}
		const names = state.categories.filter((name) => name.offsetParent !== null);
		const fit = fitTogether(nameRow, names, (name) => ({ size: name.scrollWidth, room: name.clientWidth }), "--_name-fit");
		if (!fit && names.length > 1) {
			// The room of one column, without the padding of the row, which a name with its own padding may be wider than.
			const rowStyle = getComputedStyle(nameRow);
			const column = (nameRow.clientWidth - Number.parseFloat(rowStyle.paddingLeft) - Number.parseFloat(rowStyle.paddingRight)) / rows.length;
			nameRow.style.setProperty("--_name-fit", "1");
			nameRow.setAttribute("data-thinned", "");
			const widest = largest(names.map((name) => name.offsetWidth));
			const gap = 8;
			// A name at an end is inside the chart rather than centred, so it reaches further: the step leaves room for that too,
			// and the names stay evenly spaced.
			const step = Math.max(Math.ceil((widest + gap) / column), Math.ceil((1.5 * widest + gap) / column - 0.5), 1);
			names.forEach((name, i) => {
				if (i % step) name.setAttribute("data-left-out", "");
			});
			const kept = names.filter((name) => !name.hasAttribute("data-left-out"));
			const first = kept[0];
			const last = kept.at(-1);
			// Only a name that would stick out past the chart is moved in.
			const box = nameRow.getBoundingClientRect();
			const sticksOut = [first, last].map((name) => name?.getBoundingClientRect());
			if (first && sticksOut[0] && sticksOut[0].left < box.left) first.setAttribute("data-edge", "start");
			if (last && last !== first && sticksOut[1] && sticksOut[1].right > box.right - Number.parseFloat(rowStyle.paddingRight)) {
				last.setAttribute("data-edge", "end");
				// The last name is not always in the last column; if it now touches the one before it, it is left out.
				const before = kept.at(-2);
				if (before && before.getBoundingClientRect().right + gap > last.getBoundingClientRect().left) last.setAttribute("data-left-out", "");
			}
		}
		// Under a line or an area, a tick above each name shown, at the place of its row: also where the name moved in at an edge.
		const ticked = (type === line || type === area) && turnedOn(state.figure, "data-chart-ticks", config.ticks);
		nameRow.toggleAttribute("data-ticks", ticked);
		nameRow.style.removeProperty("--_tick-reach");
		if (ticked) {
			// Up to the baseline, a little above the foot of the plot; not to a zero line in the middle, with values below zero.
			const rule = Number(svg.querySelector(`.${RULE_CLASS}`)?.getAttribute("y1") ?? height);
			const reach = height - rule;
			if (reach > 0 && reach < 10 * unit) nameRow.style.setProperty("--_tick-reach", `${short(reach / unit)}px`);
			const box = nameRow.getBoundingClientRect();
			// In the row's own pixels, also on a slide that is scaled.
			const scale = box.width / (nameRow.offsetWidth || 1);
			const rowStyle = getComputedStyle(nameRow);
			const pad = Number.parseFloat(rowStyle.paddingLeft);
			const column = (nameRow.clientWidth - pad - Number.parseFloat(rowStyle.paddingRight)) / rows.length;
			state.categories.forEach((name, i) => {
				if (name.hasAttribute("data-left-out")) name.style.removeProperty("--_tick");
				else {
					const left = (name.getBoundingClientRect().left - box.left) / scale - nameRow.clientLeft;
					name.style.setProperty("--_tick", `${short(pad + (i + 0.5) * column - left)}px`);
				}
			});
		}
		nameRow.style.height = "";
	}
};
