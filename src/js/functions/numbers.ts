import { MINUS_CLASS } from "../config";
import { splitSign } from "./format";

/** The number in `data-value`, in the locale, with the text around it. */
export const writeNumber = (node: HTMLElement, places: number, locale?: string): void => {
	const { prefix = "", suffix = "" } = node.dataset;
	const [sign, rest] = splitSign(Number.parseFloat(node.dataset.value || "0"), places, locale);
	node.textContent = prefix + (prefix ? sign : "") + rest + suffix;
	// A leading minus is set apart, so it can hang outside a centred number.
	if (sign && !prefix) {
		const minus = document.createElement("span");
		minus.className = MINUS_CLASS;
		minus.textContent = sign;
		node.prepend(minus);
	}
};
