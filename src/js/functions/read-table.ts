import { largest } from "./format";
import { debug } from "./debug";
import { LIBRARY_NAME } from "../config";
import type { Cell, Row, Series } from "../types";

// "71.8%" is 71.8 with its unit; a cell with no number, such as "n/a", is missing rather than zero.
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

/** Every cell after the label is a value, one per series; the row's own value is its first. */
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

const seriesHeads = (figure: HTMLElement): Element[] =>
	Array.from(figure.querySelector("thead tr:last-child")?.children ?? []).slice(1);

const lineOf = (value: string | null | undefined): "dashed" | "dotted" | null =>
	value === "dashed" || value === "dotted" ? value : null;

export const readSeries = (figure: HTMLElement, rows: Row[], langattribute: string | false = "data-i18n"): Series[] => {
	const heads = seriesHeads(figure);
	const count = Math.max(1, largest(rows.map((row) => row.cells.length)));
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

/** Writes translation keys such as `harvest-row1` onto a figure with `data-chart-keys`; a duplicate prefix gets a number. */
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
				`[${LIBRARY_NAME}] Two charts on the page have data-chart-keys="${prefix}". ` +
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
