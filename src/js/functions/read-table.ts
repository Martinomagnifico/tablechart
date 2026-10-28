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

/** The columns, counted among the cells of a row, whose header has `data-note`: their cells are notes, not values. */
export const noteColumns = (figure: HTMLElement): number[] =>
	Array.from(figure.querySelector("thead tr:last-child")?.children ?? [])
		.slice(1)
		.flatMap((head, i) => (head.hasAttribute("data-note") ? [i] : []));

/** The note of a row, as the table has it now, also after a translation: its cell, or null. */
export const noteCell = (figure: HTMLElement, index: number): HTMLTableCellElement | null => {
	const columns = noteColumns(figure);
	const tds = figure.querySelectorAll("tbody tr")[index]?.querySelectorAll("td") ?? [];
	const cell = columns.map((c) => tds[c]).find((td) => td?.textContent?.trim());
	return cell ?? null;
};

/** Every cell after the label is a value, one per series; the row's own value is its first. A note column is not. */
export const readTable = (figure: HTMLElement, langattribute: string | false = "data-i18n"): Row[] => {
	const notes = noteColumns(figure);
	return Array.from(figure.querySelectorAll("tbody tr")).map((tr, i) => {
		const th = tr.querySelector("th");
		const tds = Array.from(tr.querySelectorAll("td"));
		const cells = tds.filter((_td, c) => !notes.includes(c)).map(readCell);
		if (!cells.length) cells.push(readCell(null));
		const note = notes.map((c) => tds[c]).find((td) => td?.textContent?.trim());
		return {
			...cells[0],
			label: (th?.textContent || "").trim(),
			note: note?.textContent?.trim() ?? null,
			noteKey: (langattribute && note?.getAttribute(langattribute)) || null,
			short: th?.getAttribute("data-short") || null,
			pinned: tr.getAttribute("data-value") === "show",
			key: (langattribute && th?.getAttribute(langattribute)) || null,
			cells,
			classes: Array.from(tr.classList),
			isTotal: tr.getAttribute("data-kind") === "total",
			slot: i,
		};
	});
};

const seriesHeads = (figure: HTMLElement): Element[] =>
	Array.from(figure.querySelector("thead tr:last-child")?.children ?? []).slice(1).filter((head) => !head.hasAttribute("data-note"));

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
			group: !!head?.hasAttribute("data-group"),
			chart: head?.getAttribute("data-chart") === "line" ? "line" : null,
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
				`[${LIBRARY_NAME}] Two charts have data-chart-keys="${prefix}", so this one uses "${prefix}-${n}" to keep their translations apart.`
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
		// The cells of a group column name the groups: one key per group.
		heads.forEach((head, i) => {
			if (!head.hasAttribute("data-group")) return;
			const groups: string[] = [];
			figure.querySelectorAll(`tbody tr > td:nth-of-type(${i + 1})`).forEach((td) => {
				const name = (td.textContent || "").trim();
				if (!groups.includes(name)) groups.push(name);
				if (!td.getAttribute(langattribute)) td.setAttribute(langattribute, `${prefix}-group${groups.indexOf(name) + 1}`);
			});
		});
		// A note has a key by its row, such as `harvest-note14`.
		const notes = noteColumns(figure);
		figure.querySelectorAll("tbody tr").forEach((tr, row) => {
			const tds = tr.querySelectorAll("td");
			for (const c of notes) {
				const td = tds[c];
				if (td?.textContent?.trim() && !td.getAttribute(langattribute)) td.setAttribute(langattribute, `${prefix}-note${row + 1}`);
			}
		});
		debug?.log?.(
			`Keys for "${prefix}" written onto ${figure.querySelectorAll("tbody th").length} rows`
		);
	}
};
