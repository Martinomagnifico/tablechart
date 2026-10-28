/** Sentences that the author writes, filled with values from the table. Imported as `@martinomagnifico/tablechart/summary`. */
import { scaleOf, TREND_FLAT, TREND_OUTLIERS, trendOf } from "./functions/trend";
import { decimalsIn, LIBRARY_NAME, readSeries, readTable, splitSign } from "./kit";
import type { Cell, Row } from "./types";

/** The words that `{trend}`, `{change}` and `{side}` become. */
export interface SummaryWords {
	up: string;
	down: string;
	flat: string;
	unclear: string;
	above: string;
	below: string;
}

export interface SummaryConfig {
	/** The charts that may have a summary. */
	selector: string;
	/** Around a placeholder, such as `{highest.value}`. A template engine that uses single braces needs others, such as `["[[", "]]"]`. */
	delimiters: [string, string];
	/** The attribute for translation keys, as in Tablechart. A name in a sentence keeps its key. */
	langattribute: string | false;
	/** Locale for numbers and lists. Unset, the language of the page is used and followed when it changes. */
	locale?: string;
	/** A trend or a change of less than this percentage is flat. */
	flat: number;
	/** A value more than this percentage away from the trend is an outlier. */
	outliers: number;
	/** For `{trend}`, `{change}` and `{side}`. A sentence per outcome, with `data-when`, translates better. */
	words: SummaryWords;
}

export const summaryDefaults: SummaryConfig = {
	selector: "[data-chart]:not(th)",
	delimiters: ["{", "}"],
	langattribute: "data-i18n",
	flat: TREND_FLAT,
	outliers: TREND_OUTLIERS,
	words: { up: "up", down: "down", flat: "flat", unclear: "unclear", above: "above", below: "below" },
};

const SUMMARY_CLASS = "chart-summary";
const TEMPLATE = "data-summary-template";
const FILLED = "data-summary-text";
// Line and area charts are in order; another chart is when it says so.
const ORDERED = ["line", "area"];

/** A value in a sentence: text, or a name with its translation key. */
type Value = string | Node;
/** What an analysis found: its values, a count for plurals, its outcome for `data-when`, and items for `data-each`. */
interface Result {
	values: Record<string, Value>;
	counts?: Record<string, number>;
	when?: "up" | "down" | "flat" | "unclear";
	items?: Record<string, Value>[];
}
/** Null for an analysis without a result; left out for one that does not apply, such as a trend of rows without an order. */
type Results = Record<string, Result | null>;
const ANALYSES = ["extremes", "range", "change", "trend", "outliers", "notes"];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let summaries = 0;
const warned = new Set<string>();
const warn = (message: string) => {
	if (warned.has(message)) return;
	warned.add(message);
	console.warn(`[${LIBRARY_NAME}] ${message}`);
};

/** The values one series gives, by analysis. */
const analyse = (figure: HTMLElement, s: number, config: SummaryConfig, locale: string | undefined): Results => {
	const rows = readTable(figure, config.langattribute).filter((row) => !row.isTotal);
	const series = readSeries(figure, rows, config.langattribute);
	const one = series[s];
	const keyed = (text: string, key: string | null): Value => {
		if (!key || !config.langattribute) return text;
		const span = document.createElement("span");
		span.setAttribute(config.langattribute, key);
		span.textContent = text;
		return span;
	};
	// As the chart writes them: the decimals of the column, and the text around the number of the cell.
	const places = Math.max(0, ...rows.map((row) => decimalsIn(row.cells[s]?.number ?? "")));
	const number = (value: number, like: Cell, decimals = places): string => {
		const [sign, rest] = splitSign(value, decimals, locale);
		return like.prefix + sign + rest + like.suffix;
	};
	const percent = (value: number): string =>
		new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0 }).format(value / 100);
	const name = (row: Row) => keyed(row.label, row.key);

	const caption = figure.querySelector(":scope > figcaption");
	const titleNode = caption?.querySelector("b, strong") ?? caption;
	const chart: Result = {
		values: {
			title: keyed((titleNode?.textContent ?? "").trim(), (config.langattribute && titleNode?.getAttribute(config.langattribute)) || null),
			rows: splitSign(rows.length, 0, locale).join(""),
			series: one ? keyed(one.name, one.key) : "",
		},
		counts: { rows: rows.length },
	};

	// Each row with a note, from a column with `data-note`, for a list with `data-each="notes"`.
	const noted = rows.filter((row) => row.note);
	const notes: Result | null = noted.length
		? {
				values: { "notes.count": splitSign(noted.length, 0, locale).join("") },
				counts: { "notes.count": noted.length },
				items: noted.map((row) => ({ name: name(row), note: keyed(row.note ?? "", row.noteKey) })),
			}
		: null;

	const points = rows.flatMap((row, x) => {
		const cell = row.cells[s];
		return cell && !cell.missing ? [{ row, cell, x, y: cell.value }] : [];
	});
	if (!points.length) return { chart, notes, extremes: null, range: null, change: null, trend: null, outliers: null };

	// On a tie, the first row counts.
	let high = points[0];
	let low = points[0];
	for (const point of points) {
		if (point.y > high.y) high = point;
		if (point.y < low.y) low = point;
	}
	const extremes: Result = {
		values: {
			"highest.name": name(high.row),
			"highest.value": number(high.y, high.cell),
			"lowest.name": name(low.row),
			"lowest.value": number(low.y, low.cell),
		},
	};
	const range: Result = {
		values: {
			"range.from": number(low.y, low.cell),
			"range.to": number(high.y, high.cell),
			"range.difference": number(high.y - low.y, high.cell),
		},
	};

	// Change, trend and outliers need rows in order, such as months.
	const kind = figure.getAttribute("data-chart") || "column";
	if (!ORDERED.includes(kind) && !figure.hasAttribute("data-chart-ordered")) return { chart, notes, extremes, range };
	if (points.length < 2) return { chart, notes, extremes, range, change: null, trend: null, outliers: null };

	// Around zero, such as profit and loss, a percentage is of the range of the data, not of the values.
	const { share } = scaleOf(points);
	const outcome = (part: number): "up" | "down" | "flat" => (Math.abs(part) < config.flat ? "flat" : part > 0 ? "up" : "down");

	const first = points[0];
	const last = points[points.length - 1];
	const moved = share(last.y - first.y, first.y);
	const change: Result = {
		values: {
			"first.name": name(first.row),
			"first.value": number(first.y, first.cell),
			"last.name": name(last.row),
			"last.value": number(last.y, last.cell),
			"change.difference": number(Math.abs(last.y - first.y), last.cell),
			"change.percent": percent(Math.abs(moved)),
			change: config.words[outcome(moved)],
		},
		when: outcome(moved),
	};

	// A trend needs four values.
	const found = trendOf(points, config.flat, config.outliers);
	if (!found) return { chart, notes, extremes, range, change, trend: null, outliers: null };
	const { course, line, outside } = found;
	// The percentage that a sentence says is of where the line starts, as "went up by" reads.
	const trend: Result = {
		values: {
			trend: config.words[course],
			"trend.percent": percent(Math.abs(share(line(last.x) - line(first.x), line(first.x)))),
			"trend.from": number(line(first.x), first.cell),
			"trend.to": number(line(last.x), last.cell),
			// What "flat" and "far from the trend" mean, so a sentence can say so.
			"flat.percent": percent(config.flat),
			"outliers.percent": percent(config.outliers),
		},
		when: course,
	};
	if (course === "unclear") return { chart, notes, extremes, range, change, trend };
	const outliers: Result | null = outside.length
		? {
				values: { "outliers.count": splitSign(outside.length, 0, locale).join("") },
				counts: { "outliers.count": outside.length },
				items: outside.map((p) => ({
					name: name(p.row),
					value: number(p.y, p.cell),
					expected: number(line(p.x), p.cell),
					deviation: percent(Math.abs(share(p.y - line(p.x), line(p.x)))),
					side: config.words[p.y > line(p.x) ? "above" : "below"],
				})),
			}
		: null;
	return { chart, notes, extremes, range, change, trend, outliers };
};

/** Replaces each placeholder in the text under `root` with its value; `{count|one:# item|other:# items}` picks a plural. */
const replace = (root: Node, values: Record<string, Value>, counts: Record<string, number>, config: SummaryConfig, locale: string | undefined) => {
	const [open, close] = config.delimiters;
	const pattern = new RegExp(`${escape(open)}([\\w.]+)(\\|.*?)?${escape(close)}`, "g");
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const texts: Text[] = [];
	while (walker.nextNode()) texts.push(walker.currentNode as Text);
	for (const text of texts) {
		const content = text.textContent ?? "";
		const parts: Value[] = [];
		let last = 0;
		for (const match of content.matchAll(pattern)) {
			const [whole, key, forms] = match;
			let value = values[key];
			if (value === undefined) {
				warn(`A summary has the placeholder ${whole}, which no analysis fills.`);
				continue;
			}
			if (forms && counts[key] !== undefined) {
				const options = Object.fromEntries(forms.slice(1).split("|").map((form) => [form.slice(0, form.indexOf(":")), form.slice(form.indexOf(":") + 1)]));
				const form = options[new Intl.PluralRules(locale).select(counts[key])] ?? options.other;
				if (form !== undefined) value = form.replace("#", typeof value === "string" ? value : (value.textContent ?? ""));
			}
			parts.push(content.slice(last, match.index), typeof value === "string" ? value : value.cloneNode(true));
			last = (match.index ?? 0) + whole.length;
		}
		if (!parts.length) continue;
		parts.push(content.slice(last));
		text.replaceWith(...parts);
	}
};

/**
 * Whether a sentence, or a part of one, is shown: with `data-summary`, only when that analysis has a result, and with
 * `data-when`, only for that outcome. With `data-none`, only when there is no result. An analysis that does not apply shows neither.
 */
const shows = (element: HTMLElement, results: Results): boolean => {
	const asked = element.dataset.summary;
	if (asked === undefined) return true;
	if (!ANALYSES.includes(asked)) warn(`A summary asks for the analysis "${asked}", which does not exist.`);
	if (!(asked in results)) return false;
	const result = results[asked];
	const when = element.dataset.when;
	return element.hasAttribute("data-none") ? !result : !!result && (!when || result.when === when);
};

/** A copy of the template with each placeholder replaced by its value, for the reader; the template keeps its key. */
const fillOne = (template: HTMLElement, results: Results, config: SummaryConfig, locale: string | undefined): HTMLElement => {
	const out = template.cloneNode(true) as HTMLElement;
	for (const name of [TEMPLATE, "hidden", "id", "data-summary", "data-none", "data-when", "data-series", ...(config.langattribute ? [config.langattribute] : [])])
		out.removeAttribute(name);
	out.setAttribute(FILLED, "");
	const found = Object.values(results).filter((one): one is Result => !!one);
	const values = Object.assign({}, ...found.map((one) => one.values));
	const counts = Object.assign({}, ...found.map((one) => one.counts ?? {}));
	// A part of a sentence with `data-summary` follows the same rules, such as "Without the outliers," only when there are some.
	for (const part of out.querySelectorAll<HTMLElement>("[data-summary]")) {
		if (!shows(part, results)) part.remove();
		else for (const name of ["data-summary", "data-none", "data-when"]) part.removeAttribute(name);
	}
	// An element with `data-each` is repeated for each item, such as each outlier, and the items are joined as a list in the language of the page.
	for (const each of out.querySelectorAll<HTMLElement>("[data-each]")) {
		const items = results[each.dataset.each ?? ""]?.items ?? [];
		const copies = items.map((item) => {
			const copy = each.cloneNode(true) as HTMLElement;
			copy.removeAttribute("data-each");
			replace(copy, { ...values, ...item }, counts, config, locale);
			return copy;
		});
		const joined = new Intl.ListFormat(locale, { type: "conjunction" }).formatToParts(copies.map((_copy, i) => String(i)));
		each.replaceWith(...joined.map((part) => (part.type === "element" ? copies[Number(part.value)] : part.value)));
	}
	replace(out, values, counts, config, locale);
	return out;
};

/** Fills the sentences of one chart again, from its table as it is now. */
export const fill = (figure: HTMLElement, options: Partial<SummaryConfig> = {}): void => {
	const config = { ...summaryDefaults, ...options };
	const locale = config.locale || document.documentElement.lang || undefined;
	const box = figure.querySelector<HTMLElement>(`:scope > .${SUMMARY_CLASS}`);
	if (!box || !figure.querySelector("tbody tr")) return;

	// Where the author put it, and joined to the figure, so a screen reader reads it right after the title.
	if (!box.id) box.id = `tablechart-summary-${++summaries}`;
	const described = (figure.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
	if (!described.includes(box.id)) figure.setAttribute("aria-describedby", [...described, box.id].join(" "));

	for (const old of box.querySelectorAll(`:scope > [${FILLED}]`)) old.remove();
	const bySeries = new Map<number, Results>();
	for (const template of box.querySelectorAll<HTMLElement>(":scope > *")) {
		template.setAttribute(TEMPLATE, "");
		template.hidden = true;
		const s = Math.max(1, Number.parseInt(template.dataset.series ?? "1", 10) || 1) - 1;
		if (!bySeries.has(s)) bySeries.set(s, analyse(figure, s, config, locale));
		const results = bySeries.get(s) as Results;
		if (!shows(template, results)) continue;
		template.after(fillOne(template, results, config, locale));
	}
};

let started: SummaryConfig | null = null;

/** Fills the summary of every chart now, again when its table is ready or changes, and when a translation changes a sentence or the language. */
export const init = (options: Partial<SummaryConfig> = {}): void => {
	const config = { ...summaryDefaults, ...options, words: { ...summaryDefaults.words, ...options.words } };
	if (started) return;
	started = config;
	const figures = () => Array.from(document.querySelectorAll<HTMLElement>(config.selector)).filter((figure) => figure.querySelector(`:scope > .${SUMMARY_CLASS}`));

	// A change to a template or the table, such as by a translation script, fills its chart again, once per frame.
	const queued = new Set<HTMLElement>();
	const later = (figure: HTMLElement) => {
		// Emptied before filling, so a chart that fails to fill does not stop the next ones.
		if (!queued.size) requestAnimationFrame(() => {
			const figures = [...queued];
			queued.clear();
			for (const one of figures) fill(one, config);
		});
		queued.add(figure);
	};
	// Only the templates and the table: the chart and the filled sentences change all the time.
	const watched = new WeakSet<Element>();
	const watch = (figure: HTMLElement) => {
		const parts = [...figure.querySelectorAll(`:scope > .${SUMMARY_CLASS} > [${TEMPLATE}]`), ...figure.querySelectorAll(":scope > table")];
		for (const part of parts) {
			if (watched.has(part)) continue;
			watched.add(part);
			new MutationObserver(() => later(figure)).observe(part, { subtree: true, childList: true, characterData: true });
		}
	};
	const start = (figure: HTMLElement) => {
		fill(figure, config);
		watch(figure);
	};

	for (const figure of figures()) start(figure);
	document.addEventListener("tablechart:table", (event) => {
		const figure = event.target;
		if (figure instanceof HTMLElement && figure.matches(config.selector) && figure.querySelector(`:scope > .${SUMMARY_CLASS}`)) start(figure);
	});
	// Numbers follow the language of the page.
	if (!config.locale)
		new MutationObserver(() => {
			for (const figure of figures()) later(figure);
		}).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
};

export const Summary = { init, fill, defaults: summaryDefaults };
