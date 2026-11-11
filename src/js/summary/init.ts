import { READY, started, SUMMARY_CLASS, summaryDefaults, type SummaryConfig, TEMPLATE } from "./config";
import { fill } from "./fill";
import { tableOf } from "../shared/table";

/** Fills the summary of every chart now, again when its table is ready or changes, and when a translation changes a sentence or the language. */
export const init = (options: Partial<SummaryConfig> = {}): void => {
	const config = { ...summaryDefaults, ...options, words: { ...summaryDefaults.words, ...options.words } };
	if (started.config) return;
	started.config = config;
	const figures = () => Array.from(document.querySelectorAll<HTMLElement>(config.selector)).filter((figure) => figure.querySelector(`:scope > .${SUMMARY_CLASS}`));

	// A change to a template or the table, such as by a translation script, fills its chart again, once per frame.
	const queued = new Set<HTMLElement>();
	const root = document.documentElement;
	// For a script that prints the page, such as to a PDF: every summary is filled, for the language of the page.
	const settle = () => {
		if (queued.size || root.hasAttribute(READY) || !figures().every((figure) => tableOf(figure)?.querySelector("tbody tr"))) return;
		root.setAttribute(READY, "");
		document.dispatchEvent(new CustomEvent("tablechart:summary-ready"));
	};
	const later = (figure: HTMLElement) => {
		root.removeAttribute(READY);
		// Emptied before filling, so a chart that fails to fill does not stop the next ones.
		if (!queued.size) requestAnimationFrame(() => {
			const figures = [...queued];
			queued.clear();
			for (const one of figures) fill(one, config);
			settle();
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
	settle();
	document.addEventListener("tablechart:table", (event) => {
		const figure = event.target;
		if (figure instanceof HTMLElement && figure.matches(config.selector) && figure.querySelector(`:scope > .${SUMMARY_CLASS}`)) {
			start(figure);
			settle();
		}
	});
	// Numbers follow the language of the page.
	if (!config.locale)
		new MutationObserver(() => {
			for (const figure of figures()) later(figure);
		}).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
};

