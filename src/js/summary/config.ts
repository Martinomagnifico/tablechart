import { TREND_FLAT, TREND_OUTLIERS } from "../scale/trend";
import { LIBRARY_NAME } from "../kit";

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
	/** The number of groups of rows in `groups`, for an overview of a long table. */
	groups: number;
}

export const summaryDefaults: SummaryConfig = {
	selector: "[data-chart]:not(th)",
	delimiters: ["{", "}"],
	langattribute: "data-i18n",
	flat: TREND_FLAT,
	outliers: TREND_OUTLIERS,
	words: { up: "up", down: "down", flat: "flat", unclear: "unclear", above: "above", below: "below" },
	groups: 10,
};

/** The settings of `Summary.init()`, once it has run, for a later `fill()` without options. */
export const started: { config: SummaryConfig | null } = { config: null };

/** The settings that a chart can have of its own, as `data-summary-` and the name, or in `data-summary-options`. */
export const CHART_SETTINGS = ["delimiters", "locale", "flat", "outliers", "words", "groups"] as const;

export const SUMMARY_CLASS = "chart-summary";
export const READY = "data-summary-ready";
export const TEMPLATE = "data-summary-template";
export const FILLED = "data-summary-text";
// Line and area charts are in order; another chart is when it says so.
export const ORDERED = ["line", "area"];

/** A value in a sentence: text, or a name with its translation key. */
export type Value = string | Node;
/** The values of an item of a list, and its counts for plurals. */
export interface Item {
	values: Record<string, Value>;
	counts?: Record<string, number>;
}
/** What an analysis found: its values, a count for plurals, its outcome for `data-when`, and items for `data-each`. */
export interface Result extends Item {
	when?: "up" | "down" | "flat" | "unclear";
	items?: Item[];
}
/** Null for an analysis without a result; left out for one that does not apply, such as a trend of rows without an order. */
export type Results = Record<string, Result | null>;
export const ANALYSES = ["extremes", "range", "change", "trend", "outliers", "notes", "groups"];
// Counts that are a place, such as 4th, so their plural forms are those of an order.
export const ORDINALS = new Set(["rank", "rank.low"]);

const warned = new Set<string>();
export const warn = (message: string) => {
	if (warned.has(message)) return;
	warned.add(message);
	console.warn(`[${LIBRARY_NAME}] ${message}`);
};

