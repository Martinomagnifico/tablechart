import { ORDINALS, type SummaryConfig, type Value, warn } from "./config";

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces each placeholder in the text under `root` with its value; `{count|one:# item|other:# items}` picks a plural, and `{rank|one:#st|two:#nd|few:#rd|other:#th}` an order. */
export const replace = (root: Node, values: Record<string, Value>, counts: Record<string, number>, config: SummaryConfig, locale: string | undefined) => {
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
				const form = options[new Intl.PluralRules(locale, { type: ORDINALS.has(key) ? "ordinal" : "cardinal" }).select(counts[key])] ?? options.other;
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

