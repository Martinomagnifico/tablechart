import { debug } from "./debug";
import { BADGE_CAPTION_CLASS, LIBRARY_NAME } from "../config";
import { ANNOTATION_NAMES } from "../core";

/** Pass 0: Markdown, JSON and HTML all become the same table before anything is built. */

interface SourceRow {
	label: string;
	/** A string keeps its decimal places and the text around the number: `"1.0"`, `"71.8%"`. */
	value?: string | number | null;
	values?: (string | number | null)[];
	kind?: "total";
}

const isChartAttribute = (name: string): boolean =>
	name === "id" || name === "style" || name.startsWith("data-chart");

// `: ` starts a table's caption in Pandoc; `Table: ` is the longer spelling.
const CAPTION_MARK = /^\s*(?:Table)?:\s+/;

const isCaption = (el: Element | null): el is HTMLParagraphElement =>
	el?.tagName === "P" && CAPTION_MARK.test(el.textContent ?? "");

/** A caption paragraph becomes a figcaption; a hard line break parts the title from the subtitle. */
const captionFrom = (p: HTMLParagraphElement): HTMLElement => {
	const caption = document.createElement("figcaption");
	for (const { name, value } of Array.from(p.attributes)) caption.setAttribute(name, value);
	const first = p.firstChild;
	if (first?.nodeType === Node.TEXT_NODE) {
		first.textContent = (first.textContent ?? "").replace(CAPTION_MARK, "");
		if (!first.textContent) first.remove();
	}
	const nodes = Array.from(p.childNodes);
	const br = nodes.findIndex((node) => node.nodeName === "BR");
	caption.append(...(br === -1 ? nodes : nodes.slice(0, br + 1)));
	if (br !== -1 && br < nodes.length - 1) {
		const subtitle = document.createElement("span");
		subtitle.append(...nodes.slice(br + 1));
		caption.append(subtitle);
	}
	p.remove();
	return caption;
};

// `bracket from=1 to=3: +24%`. An item that says nothing, such as `axis-break to=140`, needs no colon.
const ANNOTATION_HEAD = /^\s*([a-z][\w-]*)((?:\s+[\w-]+=[^\s:]+)*)\s*(:\s*|$)/;

// Markdown puts an item's content in a paragraph when the list has blank lines between items.
const contentOf = (li: Element): Element => {
	const only = wrapperOf(li);
	return only?.tagName === "P" ? only : li;
};

interface ItemHead {
	name: string;
	options: [string, string][];
	text: Text;
	length: number;
}

const headOf = (li: Element): ItemHead | null => {
	const text = contentOf(li).firstChild;
	if (text?.nodeType !== Node.TEXT_NODE) return null;
	const match = ANNOTATION_HEAD.exec(text.textContent ?? "");
	if (!match || !ANNOTATION_NAMES.includes(match[1])) return null;
	if (!match[3] && text.nextSibling) return null;
	const options = match[2]
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((option) => option.split("=") as [string, string]);
	return { name: match[1], options, text: text as Text, length: match[0].length };
};

/** A list after a Markdown chart is its annotations if every item is one; an italic start becomes the caption. */
const annotationsFrom = (list: Element | null): HTMLElement | null => {
	if (list?.tagName !== "UL" && list?.tagName !== "OL") return null;
	const items = Array.from(list.children);
	const heads = items.map((li) => (li.hasAttribute("data-annotation") ? null : headOf(li)));
	if (!items.length || items.some((li, i) => !heads[i] && !li.hasAttribute("data-annotation")))
		return null;

	items.forEach((li, i) => {
		const head = heads[i];
		const content = contentOf(li);
		if (content !== li) content.replaceWith(...content.childNodes);
		if (head) {
			li.setAttribute("data-annotation", head.name);
			for (const [key, value] of head.options) li.setAttribute(`data-${key}`, value);
			head.text.textContent = (head.text.textContent ?? "").slice(head.length);
		}
		// The callout copies elements only, so loose text goes in a span.
		if (!li.children.length) return;
		const nodes = Array.from(li.childNodes).filter(
			(node) => node.nodeType === Node.ELEMENT_NODE || node.textContent?.trim()
		);
		nodes.forEach((node, n) => {
			const span = document.createElement("span");
			if (n === 0 && node instanceof HTMLElement && node.matches("em, i")) {
				span.className = BADGE_CAPTION_CLASS;
				span.append(...node.childNodes);
				node.replaceWith(span);
			} else if (node.nodeType === Node.TEXT_NODE) {
				span.textContent = (node.textContent ?? "").trim();
				node.replaceWith(span);
			}
		});
	});
	list.classList.add("chart-annotations");
	return list as HTMLElement;
};

const moveChartAttributes = (from: Element, to: Element): void => {
	for (const { name, value } of Array.from(from.attributes)) {
		if (name === "class" || isChartAttribute(name)) {
			to.setAttribute(name, value);
			from.removeAttribute(name);
		}
	}
};

/** A Markdown table, or a caption with chart attributes, is wrapped in a div with the caption and annotations beside it. */
export const adoptTables = (figures: HTMLElement[]): HTMLElement[] =>
	figures.map((found) => {
		const inCaption = found.closest("p");
		const figure = isCaption(inCaption) ? inCaption : found;
		if (figure.tagName !== "TABLE" && figure.tagName !== "P") return figure;
		const wrapper = document.createElement("div");
		moveChartAttributes(found, wrapper);
		if (!found.classList.length) found.removeAttribute("class");

		const table = figure.tagName === "TABLE" ? figure : null;
		const before = figure.previousElementSibling;
		let next = figure.nextElementSibling;
		const captionText = !table
			? (figure as HTMLParagraphElement)
			: isCaption(before)
				? before
				: isCaption(next)
					? next
					: null;
		if (table && captionText === next) next = next?.nextElementSibling ?? null;
		const annotations = next?.classList.contains("chart-annotations")
			? next
			: annotationsFrom(next);

		figure.replaceWith(wrapper);
		if (captionText) wrapper.append(captionFrom(captionText));
		if (table) wrapper.append(table);
		if (annotations) wrapper.append(annotations);
		debug?.log?.(
			`A ${table ? "table" : "caption"} with chart attributes was wrapped in a figure of its own`
		);
		return wrapper;
	});

const tableFrom = (rows: SourceRow[], series: string[] = []): HTMLTableElement => {
	const table = document.createElement("table");
	if (series.length) {
		const head = table.createTHead().insertRow();
		head.append(document.createElement("th"));
		for (const name of series) {
			const th = document.createElement("th");
			th.textContent = name;
			head.append(th);
		}
	}
	const body = table.createTBody();
	for (const row of rows) {
		const tr = body.insertRow();
		if (row.kind === "total") tr.dataset.kind = "total";
		const th = document.createElement("th");
		th.textContent = String(row.label ?? "");
		tr.append(th);
		for (const value of row.values ?? [row.value ?? null])
			tr.insertCell().textContent = value === null ? "" : String(value);
	}
	return table;
};

/** `data-chart-src` replaces any table in the figure with one made from a JSON file; a file that fails is reported. */
export const loadSources = async (figures: HTMLElement[]): Promise<void> => {
	await Promise.all(
		figures
			.filter((figure) => figure.hasAttribute("data-chart-src"))
			.map(async (figure) => {
				const src = figure.getAttribute("data-chart-src") as string;
				for (const table of figure.querySelectorAll("table")) table.remove();
				try {
					const response = await fetch(src);
					if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
					const data = await response.json();
					const rows: SourceRow[] = Array.isArray(data) ? data : data?.rows;
					if (!Array.isArray(rows)) throw new Error("no array of rows in it");
					const series: string[] = Array.isArray(data?.series)
						? data.series.map(String)
						: [];
					const caption = figure.querySelector(":scope > figcaption");
					const table = tableFrom(rows, series);
					if (caption) caption.after(table);
					else figure.prepend(table);
					debug?.log?.(`Read ${rows.length} rows from "${src}"`);
				} catch (error) {
					const local = window.location.protocol === "file:";
					console.warn(
						`[${LIBRARY_NAME}] Could not read the chart data in "${src}": ${(error as Error).message}.` +
							(local
								? " A page opened from the file system cannot fetch files; open the page from a server instead."
								: "")
					);
				}
			})
	);
};

// The one element a cell is wrapped in, ignoring comments; partly bold is not a total.
const wrapperOf = (cell: Element): HTMLElement | null => {
	const nodes = Array.from(cell.childNodes).filter(
		(node) =>
			node.nodeType === Node.ELEMENT_NODE ||
			(node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
	);
	return nodes.length === 1 && nodes[0] instanceof HTMLElement ? nodes[0] : null;
};

const TOTAL_MARKS = "strong, b, span.total";

/** In a Markdown table, a bold label makes the row a total, and a bold header puts that series in focus. */
export const readMarkdownRows = (figures: HTMLElement[]): void => {
	for (const figure of figures) {
		for (const tr of figure.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
			const first = tr.cells[0];
			if (first?.tagName !== "TD" || tr.cells.length < 2) continue;

			const th = document.createElement("th");
			for (const { name, value } of Array.from(first.attributes))
				th.setAttribute(name, value);
			th.append(...first.childNodes);
			first.replaceWith(th);

			for (let mark = wrapperOf(th); mark?.matches(TOTAL_MARKS); mark = wrapperOf(th)) {
				tr.dataset.kind = "total";
				mark.replaceWith(...mark.childNodes);
			}
		}

		const heads = Array.from(figure.querySelector("thead tr:last-child")?.children ?? []);
		for (const th of heads.slice(1)) {
			for (let mark = wrapperOf(th); mark?.matches(TOTAL_MARKS); mark = wrapperOf(th)) {
				th.setAttribute("data-kind", "focus");
				mark.replaceWith(...mark.childNodes);
			}
		}
	}
};
