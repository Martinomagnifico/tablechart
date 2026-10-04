import { debug } from "./debug";
import { BADGE_CAPTION_CLASS, PLUGIN_ID } from "../config";
import { ANNOTATION_NAMES } from "../core";

/**
 * Pass 0. Everything an author can write that is not yet the table Tablechart
 * reads is turned into one here, before keys are written or anything is built.
 * The rest of the plugin only ever sees the one shape of table, whether the chart
 * came from HTML, from Markdown or from a JSON file.
 */

/** One row of a JSON source, as `data-chart-src` reads it. */
interface SourceRow {
	label: string;
	/** A string keeps what is written around the number and its decimal places:
	 * `"71.8%"`, `"1.0"`. A JSON number loses a trailing zero. */
	value?: string | number | null;
	/** One value per series, in place of `value`, for a chart with several. */
	values?: (string | number | null)[];
	kind?: "total";
}

// The attributes that make an element a chart, as opposed to a table's own.
const isChartAttribute = (name: string): boolean =>
	name === "id" || name === "style" || name.startsWith("data-chart");

// `: ` starts a table's caption in Pandoc, and `Table: ` is its longer spelling.
const CAPTION_MARK = /^\s*(?:Table)?:\s+/;

const isCaption = (el: Element | null): el is HTMLParagraphElement =>
	el?.tagName === "P" && CAPTION_MARK.test(el.textContent ?? "");

/**
 * A caption paragraph becomes the figcaption an HTML chart has. The mark is taken
 * off, and a hard line break parts the title from the subtitle, which is put in a
 * span as it is in HTML: `<b>Apple juice</b><br><span>thousands of litres</span>`.
 */
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

// An item starts with the name of an annotation and its options, and a colon
// before what it says: `bracket from=1 to=3: +24%`. An item that says nothing,
// `axis-break to=140`, needs no colon.
const ANNOTATION_HEAD = /^\s*([a-z][\w-]*)((?:\s+[\w-]+=[^\s:]+)*)\s*(:\s*|$)/;

// What an item is written in: the item itself, or the one paragraph Markdown puts
// in it when the list has blank lines between its items.
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
	// Without a colon the item has to end there, or what follows is not its content.
	if (!match[3] && text.nextSibling) return null;
	const options = match[2]
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((option) => option.split("=") as [string, string]);
	return { name: match[1], options, text: text as Text, length: match[0].length };
};

/**
 * A list right after a Markdown chart is its annotations, if every item in it is
 * one: either it starts with an annotation's name, or it already has a
 * `data-annotation`. Any other list is left on the page.
 *
 * Each item becomes the span an HTML annotation is. Its options become `data-`
 * attributes, an italic start becomes the word above the callout, and the rest is
 * the callout: `trend years=9: *CAGR* +11%`.
 */
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
		// The callout copies an item's elements and nothing else, so text beside an
		// element is put in a span of its own, and an italic start is its caption.
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

// Moves what makes an element a chart, and its classes, onto the figure for it.
const moveChartAttributes = (from: Element, to: Element): void => {
	for (const { name, value } of Array.from(from.attributes)) {
		if (name === "class" || isChartAttribute(name)) {
			to.setAttribute(name, value);
			from.removeAttribute(name);
		}
	}
};

/**
 * Some Markdown tools put attributes on the table itself, so the table matches
 * the selector, such as `{data-chart=column}` with markdown-it-attrs. A chart draws into its
 * figure, and a table cannot hold a plot, so the table is wrapped in a `div` that
 * takes over its chart attributes and classes.
 *
 * Markdown has no way to put anything inside it, so what belongs to the chart is
 * taken in from beside the table: a caption paragraph just before or after it, and
 * after that a list of annotations or a `.chart-annotations` block.
 *
 * A chart that reads its rows from a file has no table, so the attributes go on
 * its caption instead. If they end up on the bold title inside the caption, the
 * caption is taken to be the chart.
 */
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
	// A header only to name the series, over an empty corner above the labels.
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

/**
 * `data-chart-src` names a JSON file that holds the chart's rows. The file is the
 * whole of the data: a table written inside the figure is removed, so there is
 * never a question of which of the two is drawn. The file is either an array of
 * rows or an object with a `rows` array.
 *
 * The file becomes an ordinary table before anything else happens, so a screen
 * reader, a translation plugin and print all get the same table they would from
 * HTML. A file that cannot be read leaves its chart empty and says why; the rest
 * of the page goes on.
 */
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
					// After the caption, where the table of an authored chart would be.
					const caption = figure.querySelector(":scope > figcaption");
					const table = tableFrom(rows, series);
					if (caption) caption.after(table);
					else figure.prepend(table);
					debug?.log?.(`Read ${rows.length} rows from "${src}"`);
				} catch (error) {
					const local = window.location.protocol === "file:";
					console.warn(
						`[${PLUGIN_ID}] Could not read the chart data in "${src}": ${(error as Error).message}.` +
							(local
								? " A page opened from the file system cannot fetch files; open the page from a server instead."
								: "")
					);
				}
			})
	);
};

// The one element a label is wrapped in, when nothing else is written beside it.
// A label that is only partly bold is a label with some bold in it, not a total.
// Comments do not count, such as an empty one that a Markdown tool leaves behind.
const wrapperOf = (cell: Element): HTMLElement | null => {
	const nodes = Array.from(cell.childNodes).filter(
		(node) =>
			node.nodeType === Node.ELEMENT_NODE ||
			(node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
	);
	return nodes.length === 1 && nodes[0] instanceof HTMLElement ? nodes[0] : null;
};

const TOTAL_MARKS = "strong, b, span.total";

/**
 * A Markdown table has no header cells in its body and no attributes on its rows,
 * so it says the same things differently. The first cell of a row is its label,
 * and a label in **bold**, or in a `.total` span, makes the row a total, like
 * `data-kind="total"` in HTML. A total is set in bold in most tables of figures
 * already. The bold is taken off once read, so the label is plain text again.
 * Rows written in HTML already have their `th` and are left as they are.
 *
 * The header over the value columns names the series. A name in bold is the
 * series in focus, like `data-kind="focus"`.
 */
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
