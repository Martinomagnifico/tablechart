import { CENTRE_CLASS, CONNECTOR_CLASS, CONTROLS_CLASS, PIECE_CLASS, SR_CLASS } from "./config";
import { svgEl } from "./functions/svg";
import type { ChartState } from "./types";

/** The steps of one chart: which step shows each row, column and annotation, and how many steps there are. */
export interface StepPlan {
	rows: { step: number | null; slot: number }[];
	series: { step: number | null }[];
	/** A cell on a step of its own, by row and then by column. */
	cells: { step: number | null; slot: number }[][];
	notes: { step: number | null; after: number }[];
	count: number;
	/** The `data-fragment-index` of each step, if it asked for one, so a presentation can make a fragment for each. */
	indexes: (string | null)[];
}

const ANNOTATIONS = ["axis-break", "trend", "bracket"];

/**
 * `data-fragment` on the figure makes every row a step; on a row, a column header, a cell or an annotation, that one.
 * Rows with the same `data-fragment-index` share a step. A row without either is there from the start.
 * Cells without `data-fragment-index` go column by column, so one line is shown point by point before the next.
 */
export const planSteps = (figure: HTMLElement): StepPlan | null => {
	const everyRow = figure.hasAttribute("data-fragment");
	const trs = Array.from(figure.querySelectorAll("tbody tr"));
	const heads = Array.from(figure.querySelector("thead tr:last-child")?.children ?? []).slice(1);
	const specs = Array.from(figure.querySelectorAll<HTMLElement>("[data-annotation]")).filter((spec) =>
		ANNOTATIONS.includes(spec.getAttribute("data-annotation") ?? "")
	);
	const asks = (element: Element) => element.hasAttribute("data-fragment");
	const tds = trs.map((tr) => Array.from(tr.querySelectorAll(":scope > td")));
	if (!everyRow && !trs.some(asks) && !heads.some(asks) && !tds.flat().some(asks) && !specs.some(asks)) return null;

	const indexes: (string | null)[] = [];
	const byIndex = new Map<string, number>();
	const filled: number[] = [];
	const stepFor = (shared: string | null): number => {
		let step = shared !== null ? byIndex.get(shared) : undefined;
		if (step === undefined) {
			step = indexes.length;
			indexes.push(shared);
			filled.push(0);
			if (shared !== null) byIndex.set(shared, step);
		}
		return step;
	};

	// A row's slot is its place among the rows that arrive with it, so they still arrive one after the other.
	let unstepped = 0;
	// A donut's total is the number in the middle, not a slice: it has no step of its own and comes with the last slice.
	const donut = figure.getAttribute("data-chart") === "donut";
	const middle = (tr: Element) => donut && tr.getAttribute("data-kind") === "total";
	const rows = trs.map((tr) => {
		if (middle(tr)) return { step: null, slot: 0 };
		if (!everyRow && !asks(tr)) return { step: null, slot: unstepped++ };
		const step = stepFor(tr.getAttribute("data-fragment-index"));
		return { step, slot: filled[step]++ };
	});
	const lastSlice = Math.max(-1, ...rows.map((row) => row.step ?? -1));
	if (lastSlice >= 0) {
		for (const [i, tr] of trs.entries()) if (middle(tr)) rows[i] = { step: lastSlice, slot: filled[lastSlice]++ };
	}
	const series = heads.map((th) => ({ step: asks(th) ? stepFor(th.getAttribute("data-fragment-index")) : null }));
	const cells = tds.map((cellsOf) => cellsOf.map(() => ({ step: null as number | null, slot: 0 })));
	const columns = Math.max(0, ...tds.map((cellsOf) => cellsOf.length));
	for (let column = 0; column < columns; column++) {
		for (const [i, cellsOf] of tds.entries()) {
			const td = cellsOf[column];
			if (!td || !asks(td)) continue;
			const step = stepFor(td.getAttribute("data-fragment-index"));
			cells[i][column] = { step, slot: filled[step]++ };
		}
	}

	// An annotation arrives with the last step of the rows it is about, or on a step of its own.
	const notes = specs.map((spec) => {
		const read = (name: string, fallback: number) => {
			const asked = Number.parseInt(spec.getAttribute(name) ?? "", 10);
			return Number.isFinite(asked) ? asked - 1 : fallback;
		};
		const bracket = spec.getAttribute("data-annotation") === "bracket";
		const [from, to] = bracket ? [read("data-from", 0), read("data-to", rows.length - 1)] : [0, rows.length - 1];
		let step: number | null = null;
		for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
			for (const own of [rows[i]?.step ?? null, ...(cells[i] ?? []).map((cell) => cell.step)]) {
				if (own !== null && (step === null || own > step)) step = own;
			}
		}
		const seriesStep = series[read("data-series", 0)]?.step ?? null;
		if (seriesStep !== null && (step === null || seriesStep > step)) step = seriesStep;
		if (asks(spec)) step = stepFor(spec.getAttribute("data-fragment-index"));
		const after = step === null ? rows.length : rows.filter((row) => row.step === step).length;
		return { step, after };
	});

	return { rows, series, cells, notes, count: indexes.length, indexes };
};

// A line or area run is revealed up to the last of its rows whose step has been taken.
const reveal = (state: ChartState): void => {
	const plan = state.plan;
	if (!plan) return;
	const shown = (step: number | null) => step === null || state.step - step >= 1;
	for (const run of state.figure.querySelectorAll<SVGElement>("[data-from]")) {
		const from = Number(run.dataset.from) - 1;
		const to = Number(run.dataset.to) - 1;
		const series = (run.closest("[data-series]") as SVGElement | null)?.dataset.series;
		const s = series ? Number(series) - 1 : 0;
		const column = plan.series[s];
		const stepAt = (i: number) => plan.cells[i]?.[s]?.step ?? plan.rows[i]?.step ?? null;
		let reached = from - 1;
		if (column && column.step !== null) reached = shown(column.step) ? to : from - 1;
		else while (reached < to && shown(stepAt(reached + 1))) reached++;
		// On a step chart each row has a width of its own; otherwise the line goes from point to point.
		const share = run.hasAttribute("data-flat") ? (reached - from + 1) / (to - from + 1) : to > from ? Math.max(0, reached - from) / (to - from) : 0;
		run.style.setProperty("--reveal", String(share));
	}
};

/** Gives every mark its step and its place in the run. After every layout, because a layout makes the marks again. */
export const applySteps = (state: ChartState): void => {
	const plan = state.plan;
	if (!plan) return;
	const last = plan.rows.length - 1;
	// The step of each piece of a stack: its cell, its column, or else its row.
	const pieceSteps = (row: number) =>
		plan.series.map((column, s) => plan.cells[row]?.[s]?.step ?? column.step ?? plan.rows[row]?.step ?? null);
	// A stack comes with its first piece; a piece there from the start keeps it there.
	const stackStep = (row: number) => {
		const steps = pieceSteps(row);
		return steps.some((step) => step === null) ? null : Math.min(...(steps as number[]));
	};
	const totals = new Set<Element>(state.totals);
	const set = (element: HTMLElement | SVGElement, step: number | null, name: string, place: number) => {
		element.style.setProperty(name, String(place));
		element.style.removeProperty("--d");
		if (step === null) element.style.removeProperty("--step");
		else element.style.setProperty("--step", String(step));
	};
	for (const element of state.figure.querySelectorAll<HTMLElement | SVGElement>("[data-row], [data-series], [data-note]")) {
		if (element.closest(`table, .${CONTROLS_CLASS}`) || element.hasAttribute("data-from")) continue;
		const note = Number(element.dataset.note);
		if (note > 0) {
			const one = plan.notes[note - 1];
			if (one) set(element, one.step, "--after", one.after);
			continue;
		}
		const row = element.dataset.row ? Number(element.dataset.row) - 1 : last;
		// A waterfall connector waits for both columns it joins, and comes right after the later one.
		if (element.classList.contains(CONNECTOR_CLASS)) {
			const before = plan.rows[row - 1];
			const after = plan.rows[row];
			if (before && after) {
				const late = (before.step ?? -1) > (after.step ?? -1);
				set(element, late ? before.step : after.step, "--i", late ? before.slot + 1 : after.slot);
			}
			continue;
		}
		// The total of a stack comes with its last piece.
		if (totals.has(element)) {
			const steps = pieceSteps(row).filter((step): step is number => step !== null);
			set(element, steps.length ? Math.max(...steps) : null, "--i", plan.rows[row]?.slot ?? 0);
			continue;
		}
		if (element.hasAttribute("data-stack")) {
			set(element, stackStep(row), "--i", plan.rows[row]?.slot ?? 0);
			continue;
		}
		const s = element.dataset.series ? Number(element.dataset.series) - 1 : 0;
		const column = element.dataset.series ? plan.series[s] : undefined;
		// A piece on a later step than its stack grows on its own; on the same step it grows with the stack.
		if (element.classList.contains(PIECE_CLASS)) {
			const step = pieceSteps(row)[s] ?? null;
			const cell = plan.cells[row]?.[s];
			set(element, step === stackStep(row) ? null : step, "--i", cell && cell.step !== null ? cell.slot : row);
			continue;
		}
		// A name in the legend is there from the start, or comes with the first step of its column.
		if (element.dataset.place === "legend") {
			const first = Math.min(...plan.cells.map((cellsOf) => cellsOf[s]?.step ?? Number.POSITIVE_INFINITY));
			set(element, column?.step ?? (Number.isFinite(first) ? first : null), "--i", 0);
			continue;
		}
		const cell = plan.cells[row]?.[s];
		// A cell on a step of its own decides; then a column on a step of its own, which arrives whole; otherwise the row.
		if (cell && cell.step !== null) set(element, cell.step, "--i", cell.slot);
		else if (column && column.step !== null) set(element, column.step, "--i", row);
		else if (plan.rows[row]) set(element, plan.rows[row].step, "--i", plan.rows[row].slot);
	}
	// The number in the middle of a donut comes after the last slice.
	const centre = state.figure.querySelector<HTMLElement>(`.${CENTRE_CLASS}`);
	if (centre) {
		const steps = [...plan.rows, ...plan.cells.flat()].map((one) => one.step ?? -1);
		const step = Math.max(-1, ...steps);
		if (step < 0) set(centre, null, "--i", 0);
		else set(centre, step, "--i", steps.filter((one) => one === step).length);
	}
	reveal(state);
};

/**
 * Shows the chart up to step `step`, from 0 (only what has no step) to the number of steps (all of it).
 * Says so with a `tablechart:step` event on the figure, unless `quietly`.
 */
export const stepTo = (state: ChartState, step: number, quietly = false): void => {
	const plan = state.plan;
	if (!plan) return;
	const next = Math.min(Math.max(Math.round(step), 0), plan.count);
	const changed = next !== state.step;
	state.step = next;
	state.figure.style.setProperty("--tablechart-step", String(next));
	reveal(state);
	const [previous, forward] = state.controls?.querySelectorAll("button") ?? [];
	if (previous) previous.disabled = next === 0;
	if (forward) forward.disabled = next === plan.count;
	if (changed && !quietly) {
		state.figure.dispatchEvent(new CustomEvent("tablechart:step", { bubbles: true, detail: { step: next, steps: plan.count } }));
	}
};

/** The Previous and Next buttons, made with the rest of the text so a translation script finds them. */
export const makeControls = (
	labels: { previous: string; next: string; hint: string },
	keys: { previous: string | null; next: string | null; hint: string | null },
	langattribute: string | false
): HTMLElement => {
	const controls = document.createElement("div");
	controls.className = CONTROLS_CLASS;
	const button = (go: "previous" | "next") => {
		const element = document.createElement("button");
		element.type = "button";
		element.className = `tablechart-${go}`;
		element.dataset.go = go;
		const icon = document.createElement("span");
		icon.className = "tablechart-control-icon";
		icon.setAttribute("aria-hidden", "true");
		const chevron = svgEl("svg", { viewBox: "0 0 16 16", focusable: "false" });
		chevron.appendChild(svgEl("path", { d: go === "next" ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5" }));
		icon.appendChild(chevron);
		const label = document.createElement("span");
		label.className = "tablechart-control-label";
		label.textContent = labels[go];
		const key = keys[go];
		if (key && langattribute) label.setAttribute(langattribute, key);
		// Screen readers hear "Next step of the chart", and know the table itself does not change.
		const hint = document.createElement("span");
		hint.className = SR_CLASS;
		hint.textContent = labels.hint;
		if (keys.hint && langattribute) hint.setAttribute(langattribute, keys.hint);
		element.append(...(go === "next" ? [label, hint, icon] : [icon, label, hint]));
		return element;
	};
	controls.append(button("previous"), button("next"));
	return controls;
};
