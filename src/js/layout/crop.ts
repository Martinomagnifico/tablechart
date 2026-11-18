// A chart whose rows need a least width shows only the last rows that fit, and says so under the chart.
import { type Config, CROP_CLASS } from "../config";
import type { ChartState } from "../types";

type Lay = (state: ChartState, config: Config) => boolean;

/** How many rows from the start do not fit; 0 for a type without a least width. */
const croppedOf = (state: ChartState): number => {
	const least = state.type.minBand;
	return least ? Math.max(0, state.rows.length - Math.max(1, Math.floor(state.plot.clientWidth / least))) : 0;
};

/** The chart without its first `cropped` rows. What the drawing gives back by row is moved back to the rows of the table. */
const viewOf = (state: ChartState, cropped: number): ChartState => {
	if (!cropped) return state;

	const own: Partial<Record<keyof ChartState, unknown>> = {
		rows: state.rows.slice(cropped),
		values: state.values.slice(cropped),
		seriesValues: state.seriesValues.map((labels) => labels.slice(cropped)),
		categories: state.categories.slice(cropped),
	};

	const back: Partial<Record<keyof ChartState, (method: (...args: never[]) => unknown) => unknown>> = {
		rowAt: (method) => (x: number, y: number) => {
			const rowIndex = (method as (x: number, y: number) => number | null)(x, y);
			return rowIndex === null ? null : rowIndex + cropped;
		},
		rowBox: (method) => (rowIndex: number) => (method as (rowIndex: number) => unknown)(rowIndex - cropped),
		pointOf: (method) => (rowIndex: number) => (method as (rowIndex: number) => unknown)(rowIndex - cropped),
		crossingOf: (method) => (rowIndex: number) => (method as (rowIndex: number) => unknown)(rowIndex - cropped),
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

/** Hides the first `croppedRows` names and numbers, and fills the line under the chart. */
const mark = (state: ChartState, config: Config, croppedRows: number): void => {
	state.categories.forEach((name, index) => name.toggleAttribute("data-cropped", index < croppedRows));

	// A run that goes on from a cropped row, such as the last days of a month.
	const nameOf = (index: number) => state.categories[index]?.textContent?.trim();

	const isCut = (index: number) => !!croppedRows && index === croppedRows && nameOf(index) === nameOf(index - 1);

	state.categories.forEach((name, index) => name.toggleAttribute("data-cut", isCut(index)));
	for (const labels of state.seriesValues) labels.forEach((label, index) => label.toggleAttribute("data-cropped", index < croppedRows));
	state.categories[0]?.parentElement?.style.setProperty("--_columns", String(state.rows.length - croppedRows));
	const line = state.figure.querySelector<HTMLElement>(`:scope > .${CROP_CLASS}`);
	if (!line) return;
	line.hidden = !croppedRows;
	const [template, text] = Array.from(line.children) as HTMLElement[];

	const count = (value: number) => new Intl.NumberFormat(config.locale).format(value);

	text.textContent = (template.textContent ?? "").replace("{shown}", count(state.rows.length - croppedRows)).replace("{rows}", count(state.rows.length));
};

/** A layout that crops first. The numbers of an axis take room beside the plot, so after the first try it may crop a few rows more. */
export const withCrop =
	(lay: Lay): Lay =>
	(state, config) => {
		let cropped = croppedOf(state);
		mark(state, config, cropped);
		let done = lay(viewOf(state, cropped), config);
		const again = croppedOf(state);

		if (done && again !== cropped) {
			cropped = again;
			mark(state, config, cropped);
			done = lay(viewOf(state, cropped), config);
		}

		// The marks count their rows from the first one shown; the tooltip finds them by the row of the table.
		if (done && cropped) {
			for (const node of state.svg.querySelectorAll<SVGElement>("[data-row]")) {
				node.dataset.row = String(Number(node.dataset.row) + cropped);
			}
		}

		return done;
	};
