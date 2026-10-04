/**
 * Numbers are formatted, never translated: they do not belong in a dictionary.
 * The decimal places come from what the author wrote, so a rate written as
 * "1.0" keeps its trailing zero instead of being rounded to an integer, and the
 * separator follows the document's language.
 */
export const decimalsIn = (raw: string): number => (raw.split(/[.,]/)[1] || "").length;

export const formatValue = (value: number, decimals: number, locale?: string): string =>
	new Intl.NumberFormat(locale || document.documentElement.lang || undefined, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	}).format(value);

/** The first number in a string, however it is punctuated. */
export const numberIn = (text: string): number =>
	Number.parseFloat((text.match(/-?[\d.,]+/) || ["NaN"])[0].replace(",", "."));
