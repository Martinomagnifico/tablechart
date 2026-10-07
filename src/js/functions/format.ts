/** The largest number in a list, as `Math.max(...list)`, but without its limit on the length of the list. */
export const largest = (values: number[]): number => {
	let result = Number.NEGATIVE_INFINITY;
	for (const value of values) result = Math.max(result, value);
	return result;
};

/** Decimal places come from what the author wrote, so "1.0" keeps its zero. */
export const decimalsIn = (raw: string): number => (raw.split(/[.,]/)[1] || "").length;

export const formatValue = (value: number, decimals: number, locale?: string): string =>
	new Intl.NumberFormat(locale || document.documentElement.lang || undefined, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	}).format(value);

export const numberIn = (text: string): number =>
	Number.parseFloat((text.match(/-?[\d.,]+/) || ["NaN"])[0].replace(",", "."));
