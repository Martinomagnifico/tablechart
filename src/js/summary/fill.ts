import { analyse } from "./analyse";
import { ANALYSES, FILLED, type Result, type Results, started, SUMMARY_CLASS, summaryDefaults, type SummaryConfig, TEMPLATE, warn } from "./config";
import { replace } from "./replace";
import { settingsOf } from "./settings";
import { tableOf } from "../shared/table";

let summaries = 0;

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
	// An element with `data-each` is repeated for each item, such as each outlier. Items in a sentence are joined as a list in the language
	// of the page; rows of a table and items of a list stay as they are.
	for (const each of out.querySelectorAll<HTMLElement>("[data-each]")) {
		const items = results[each.dataset.each ?? ""]?.items ?? [];
		const copies = items.map((item) => {
			const copy = each.cloneNode(true) as HTMLElement;
			copy.removeAttribute("data-each");
			replace(copy, { ...values, ...item.values }, { ...counts, ...item.counts }, config, locale);
			return copy;
		});
		if (each.matches("tr, li")) {
			each.replaceWith(...copies);
			continue;
		}
		const joined = new Intl.ListFormat(locale, { type: "conjunction" }).formatToParts(copies.map((_copy, i) => String(i)));
		each.replaceWith(...joined.map((part) => (part.type === "element" ? copies[Number(part.value)] : part.value)));
	}
	replace(out, values, counts, config, locale);
	return out;
};

/** Fills the sentences of one chart again, from its table as it is now. */
export const fill = (figure: HTMLElement, options: Partial<SummaryConfig> = started.config ?? {}): void => {
	const config = settingsOf(figure, { ...summaryDefaults, ...options, words: { ...summaryDefaults.words, ...options.words } });
	const locale = config.locale || document.documentElement.lang || undefined;
	const box = figure.querySelector<HTMLElement>(`:scope > .${SUMMARY_CLASS}`);
	if (!box || !tableOf(figure)?.querySelector("tbody tr")) return;

	// Where the author put it, and joined to the figure, so a screen reader reads it right after the title.
	if (!box.id) box.id = `tablechart-summary-${++summaries}`;
	const described = (figure.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
	if (!described.includes(box.id)) figure.setAttribute("aria-describedby", [...described, box.id].join(" "));

	for (const old of box.querySelectorAll(`:scope > [${FILLED}]`)) old.remove();
	const bySeries = new Map<number, Results>();
	for (const template of box.querySelectorAll<HTMLElement>(":scope > *")) {
		template.setAttribute(TEMPLATE, "");
		template.hidden = true;
		const s = template.dataset.series === "total" ? -1 : Math.max(1, Number.parseInt(template.dataset.series ?? "1", 10) || 1) - 1;
		if (!bySeries.has(s)) bySeries.set(s, analyse(figure, s, config, locale));
		const results = bySeries.get(s) as Results;
		if (!shows(template, results)) continue;
		template.after(fillOne(template, results, config, locale));
	}
};

