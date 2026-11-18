// `data-chart-src`: a table from a JSON file or an API endpoint, made before anything is built.
import { type Config, defaultConfig } from "../../config";
import { debug } from "../../shared/debug";
import { checkRows } from "./checks";
import { fail, FAILURE_CLASS } from "./failure";
import { rowsOf } from "./rows";
import { tableFrom } from "./table";
import { transformFor } from "./transform";

// The step that failed, with its cause, so the console can name both.
class Failure extends Error {
	constructor(
		readonly step: "fetch" | "parse" | "transform" | "check",
		cause: string
	) {
		super(cause);
	}
}

const fetchJson = async (src: string): Promise<unknown> => {
	let response: Response;
	try {
		response = await fetch(src);
	} catch (error) {
		throw new Failure("fetch", (error as Error).message);
	}
	if (!response.ok) throw new Failure("fetch", `${response.status} ${response.statusText}`.trim());
	try {
		return await response.json();
	} catch {
		throw new Failure("parse", "the response is not valid JSON");
	}
};

// The response, through the transform of the figure if it has one.
const transformed = (figure: HTMLElement, config: Config, data: unknown): unknown => {
	const chosen = transformFor(figure, config);
	if ("missing" in chosen) throw new Failure("transform", `no transform named "${chosen.missing}" is registered in the transforms option`);
	if (!chosen.name) return data;
	try {
		return chosen.run(data);
	} catch (error) {
		throw new Failure("transform", `the transform "${chosen.name}" threw: ${(error as Error).message}`);
	}
};

/** Fills one figure's table from its file; the table the author wrote stays as it was if anything fails. */
const loadOne = async (figure: HTMLElement, config: Config): Promise<boolean> => {
	const src = figure.getAttribute("data-chart-src") as string;
	figure.querySelector(`:scope > .${FAILURE_CLASS}`)?.remove();
	const tables = Array.from(figure.querySelectorAll("table")).filter((one) => !one.closest(".chart-summary"));
	const authored = tables.find((one) => one.tHead) ?? null;

	try {
		const data = transformed(figure, config, await fetchJson(src));
		const source = rowsOf(data);
		if (!source) throw new Failure("check", "it is not a list of rows, an object with rows, or names with their values");
		const problem = checkRows(source.rows, source.series, authored);
		if (problem) throw new Failure("check", problem);

		for (const table of tables) if (table !== authored) table.remove();
		const table = tableFrom(source.rows, source.series, source.label, authored ?? undefined, source.note);
		if (!authored) {
			const caption = figure.querySelector(":scope > figcaption");
			if (caption) caption.after(table);
			else figure.prepend(table);
		}
		if (!table.tHead) debug?.log?.(`The table from "${src}" has no header row, so a screen reader cannot name its columns.`);
		debug?.log?.(`Read ${source.rows.length} rows from "${src}"`);
		return true;
	} catch (error) {
		const failure = error instanceof Failure ? error : new Failure("check", (error as Error).message);
		fail(figure, config, src, failure.step, failure.message);
		return false;
	}
};

/** Fills the tables of the figures with `data-chart-src`; returns the figures whose data could not load, which get no chart. */
export const loadSources = async (figures: HTMLElement[], config: Config = defaultConfig): Promise<Set<HTMLElement>> => {
	const failed = new Set<HTMLElement>();
	const sourced = figures.filter((figure) => figure.hasAttribute("data-chart-src"));
	await Promise.all(
		sourced.map(async (figure) => {
			if (!(await loadOne(figure, config))) failed.add(figure);
		})
	);
	return failed;
};
