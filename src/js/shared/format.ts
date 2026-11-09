/** The largest number in a list, as `Math.max(...list)`, but without its limit on the length of the list. */
export const largest = (values: number[]): number => {
	let result = Number.NEGATIVE_INFINITY;
	for (const value of values) result = Math.max(result, value);
	return result;
};

/** Decimal places come from what the author wrote, so "1.0" keeps its zero. */
export const decimalsIn = (raw: string): number => (raw.split(/[.,]/)[1] || "").length;

const formatter = (decimals: number, locale?: string) =>
	new Intl.NumberFormat(locale || document.documentElement.lang || undefined, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});

/** The minus sign in front of a number, if the locale puts it there, and the rest of the number. */
export const splitSign = (value: number, decimals: number, locale?: string): [string, string] => {
	const parts = formatter(decimals, locale).formatToParts(value);
	const sign = parts[0]?.type === "minusSign" ? parts[0].value : "";
	return [sign, parts.slice(sign ? 1 : 0).map((part) => part.value).join("")];
};

export const numberIn = (text: string): number =>
	Number.parseFloat((text.match(/-?[\d.,]+/) || ["NaN"])[0].replace(",", "."));
