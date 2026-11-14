// A chart whose rows need a least width shows only the last rows that fit, and says so under the chart.
import { type Config, CROP_CLASS } from "../config";
import type { ChartState } from "../types";

type Lay = (state: ChartState, config: Config) => boolean;

/** How many rows from the start do not fit; 0 for a type without a least width. */
const croppedOf = (state: ChartState): number => {
	const least = state.type.minBand;
	return least ? Math.max(0, state.rows.length - Math.max(1, Math.floor(state.plot.clientWidth / least))) : 0;
};

/** The chart without its first `k` rows. What the drawing gives back by row is moved back to the rows of the table. */
const viewOf = (state: ChartState, k: number): ChartState => {
	if (!k) return state;
	const own: Partial<Record<keyof ChartState, unknown>> = {
		rows: state.rows.slice(k),
		values: state.values.slice(k),
		seriesValues: state.seriesValues.map((labels) => labels.slice(k)),
		categories: state.categories.slice(k),
	};
	const back: Partial<Record<keyof ChartState, (f: (...args: never[]) => unknown) => unknown>> = {
		rowAt: (f) => (x: number, y: number) => {
			const i = (f as (x: number, y: number) => number | null)(x, y);
			return i === null ? null : i + k;
		},
		rowBox: (f) => (i: number) => (f as (i: number) => unknown)(i - k),
		pointOf: (f) => (i: number) => (f as (i: number) => unknown)(i - k),
		crossingOf: (f) => (i: number) => (f as (i: number) => unknown)(i - k),
	};
	return new Proxy(state, {
		get: (target, key) => (key in own ? own[key as keyof ChartState] : Reflect.get(target, key)),
		set: (target, key, value) => {
			const shift = back[key as keyof ChartState];
			Reflect.set(target, key, typeof value === "function" && shift ? shift(value) : value);
			return true;
		},
	});
};

/** Hides the first `k` names and numbers, and fills the line under the chart. */
const mark = (state: ChartState, config: Config, k: number): void => {
	state.categories.forEach((name, i) => name.toggleAttribute("data-cropped", i < k));
	// A run that goes on from a cropped row, such as the last days of a month.
	const nameOf = (i: number) => state.categories[i]?.textContent?.trim();
	state.categories.forEach((name, i) => name.toggleAttribute("data-cut", !!k && i === k && nameOf(i) === nameOf(i - 1)));
	for (const labels of state.seriesValues) labels.forEach((label, i) => label.toggleAttribute("data-cropped", i < k));
	state.categories[0]?.parentElement?.style.setProperty("--_columns", String(state.rows.length - k));
	const line = state.figure.querySelector<HTMLElement>(`:scope > .${CROP_CLASS}`);
	if (!line) return;
	line.hidden = !k;
	const [template, text] = Array.from(line.children) as HTMLElement[];
	const count = (n: number) => new Intl.NumberFormat(config.locale).format(n);
	text.textContent = (template.textContent ?? "").replace("{shown}", count(state.rows.length - k)).replace("{rows}", count(state.rows.length));
};

/** A layout that crops first. The numbers of an axis take room beside the plot, so after the first try it may crop a few rows more. */
export const withCrop =
	(lay: Lay): Lay =>
	(state, config) => {
		let k = croppedOf(state);
		mark(state, config, k);
		let done = lay(viewOf(state, k), config);
		const again = croppedOf(state);
		if (done && again !== k) {
			k = again;
			mark(state, config, k);
			done = lay(viewOf(state, k), config);
		}
		// The marks count their rows from the first one shown; the tooltip finds them by the row of the table.
		if (done && k) for (const node of state.svg.querySelectorAll<SVGElement>("[data-row]")) node.dataset.row = String(Number(node.dataset.row) + k);
		return done;
	};
