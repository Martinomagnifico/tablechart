import { debug } from "./debug";
import { PLUGIN_ID } from "../config";
import type { Cell, Row, Series } from "../types";

// The number, and whatever is written around it: "18.2*" is 18.2 with a footnote,
// "71.8%" is 71.8 with its unit. A cell with no number in it at all, such as
// "n/a", is a value that is not there rather than a zero.
const readCell = (td: Element | null): Cell => {
	const raw = (td?.textContent || "").trim();
	const parts = raw.match(/^(.*?)(-?\d+(?:[.,]\d+)?)(.*)$/);
	return {
		raw,
		number: parts?.[2] ?? "",
		prefix: parts?.[1] ?? "",
		suffix: parts?.[3] ?? "",
		missing: !parts,
		value: parts ? Number.parseFloat(parts[2].replace(",", ".")) : 0,
	};
};

/**
 * A chart's data is a real table in the markup, not a blob of JSON. It is what a
 * screen reader reads, what a translation extractor finds, and what is on the
 * page when scripting is off. Tablechart only ever reads it.
 *
 * Every cell after the label is a value, one per series. The row's own value is
 * its first, which is all a chart with one series ever reads.
 */
export const readTable = (figure: HTMLElement, langattribute: string | false = "data-i18n"): Row[] =>
	Array.from(figure.querySelectorAll("tbody tr")).map((tr, i) => {
		const th = tr.querySelector("th");
		const cells = Array.from(tr.querySelectorAll("td")).map(readCell);
		if (!cells.length) cells.push(readCell(null));
		return {
			...cells[0],
			label: (th?.textContent || "").trim(),
			key: (langattribute && th?.getAttribute(langattribute)) || null,
			cells,
			classes: Array.from(tr.classList),
			isTotal: tr.getAttribute("data-kind") === "total",
			slot: i,
		};
	});

// The header cells over the value columns: every one but the first, which is over
// the labels.
const seriesHeads = (figure: HTMLElement): Element[] =>
	Array.from(figure.querySelector("thead tr:last-child")?.children ?? []).slice(1);

/**
 * The value columns, one series each. The header names them, and says which one
 * the chart is about. A table without a
 * header still has its columns; they are only unnamed.
 */
// `data-line` on a column header: a dashed or dotted line instead of a solid one.
const lineOf = (value: string | null | undefined): "dashed" | "dotted" | null =>
	value === "dashed" || value === "dotted" ? value : null;

export const readSeries = (figure: HTMLElement, rows: Row[], langattribute: string | false = "data-i18n"): Series[] => {
	const heads = seriesHeads(figure);
	const count = Math.max(1, ...rows.map((row) => row.cells.length));
	return Array.from({ length: count }, (_, i) => {
		const head = heads[i];
		return {
			name: (head?.textContent || "").trim(),
			key: (langattribute && head?.getAttribute(langattribute)) || null,
			focus: head?.getAttribute("data-kind") === "focus",
			marker: head?.getAttribute("data-marker") ?? null,
			line: lineOf(head?.getAttribute("data-line")),
		};
	});
};

/**
 * Translation keys, written onto the source table before anything is drawn, for
 * a figure with `data-chart-keys`. Its value starts each key: `harvest-row1` for
 * the name of the first row, `harvest-col1` for the header of the first value
 * column. A cell that has a key already keeps it.
 *
 * The value has to be unique on the page. If two figures use
 * the same value, the second one gets a number added, and a warning says so.
 *
 * Keys are written here, in a pass of its own, so that extraction never depends
 * on whether a chart has been drawn yet.
 */
export const assignKeys = (figures: HTMLElement[], langattribute: string | false): void => {
	if (!langattribute) return;
	const used = new Map<string, number>();

	for (const figure of figures) {
		let prefix = figure.getAttribute("data-chart-keys") || null;
		if (!prefix) continue;

		if (used.has(prefix)) {
			const n = (used.get(prefix) as number) + 1;
			used.set(prefix, n);
			console.warn(
				`[${PLUGIN_ID}] Two charts on the page have data-chart-keys="${prefix}". ` +
					`If two charts use the same keys, they get the same translations. ` +
					`This one uses "${prefix}-${n}".`
			);
			prefix = `${prefix}-${n}`;
		} else {
			used.set(prefix, 1);
		}

		figure.querySelectorAll("tbody th").forEach((th, i) => {
			if (!th.getAttribute(langattribute))
				th.setAttribute(langattribute, `${prefix}-row${i + 1}`);
		});
		// A header is shown only when it names more than one series.
		const heads = seriesHeads(figure);
		if (heads.length > 1)
			heads.forEach((head, i) => {
				if (!head.getAttribute(langattribute))
					head.setAttribute(langattribute, `${prefix}-col${i + 1}`);
			});
		debug?.log?.(
			`Keys for "${prefix}" written onto ${figure.querySelectorAll("tbody th").length} rows`
		);
	}
};
