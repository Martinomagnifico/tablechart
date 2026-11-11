import { LIBRARY_NAME } from "../kit";
import { CHART_SETTINGS, type SummaryConfig } from "./config";

const OPTIONS = "data-summary-options";

const parsed = (text: string, where: Element, what: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		console.warn(`[${LIBRARY_NAME}] ${what} needs JSON.`, where);
		return undefined;
	}
};

/** One setting from a single attribute: a number, `words` as JSON, `delimiters` as two parts with a space. */
const fromAttribute = (figure: HTMLElement, name: (typeof CHART_SETTINGS)[number]): unknown => {
	const text = figure.getAttribute(`data-summary-${name}`)?.trim();
	if (!text) return undefined;
	if (name === "locale") return text;
	if (name === "words") return parsed(text, figure, `data-summary-words`);
	if (name === "delimiters") {
		const parts = text.split(/\s+/);
		return parts.length === 2 ? parts : undefined;
	}
	const number = Number.parseFloat(text);
	return Number.isFinite(number) ? number : undefined;
};

/** The settings of one chart: those of `Summary.init()`, then `data-summary-options` from the outermost parent in, then single attributes on the figure. */
export const settingsOf = (figure: HTMLElement, config: SummaryConfig): SummaryConfig => {
	const layers: Partial<SummaryConfig>[] = [];
	for (let element: Element | null = figure; element; element = element.parentElement) {
		const text = element.getAttribute(OPTIONS);
		const json = text ? parsed(text, element, OPTIONS) : undefined;
		if (json && typeof json === "object") layers.unshift(json as Partial<SummaryConfig>);
	}
	const own: Record<string, unknown> = {};
	for (const name of CHART_SETTINGS) {
		const value = fromAttribute(figure, name);
		if (value !== undefined) own[name] = value;
	}
	layers.push(own as Partial<SummaryConfig>);

	let result = config;
	for (const layer of layers) {
		const known = Object.fromEntries(Object.entries(layer).filter(([key]) => (CHART_SETTINGS as readonly string[]).includes(key)));
		result = { ...result, ...known, words: { ...result.words, ...(known.words as object | undefined) } };
	}
	return result;
};
