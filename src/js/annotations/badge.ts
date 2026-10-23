import { BADGE_CLASS, LIBRARY_NAME } from "../config";
import { decimalsIn, numberIn } from "../functions/format";
import type { Check, Geometry } from "../types";

/** HTML rather than SVG, so the badge grows around its text in any language. */
export const createBadge = (spec: HTMLElement, plot: HTMLElement): HTMLElement => {
	const badge = document.createElement("span");
	badge.className = BADGE_CLASS;
	badge.inert = true;

	// The author's elements are copied with their translation keys.
	if (spec.childElementCount > 0) {
		for (const child of Array.from(spec.children)) badge.appendChild(child.cloneNode(true));
	} else {
		badge.textContent = (spec.textContent || "").trim();
		const key = spec.getAttribute("data-i18n");
		if (key) badge.setAttribute("data-i18n", key);
	}

	plot.appendChild(badge);
	return badge;
};

/** The author's number always wins; a mismatch is only reported in the console. A number without `%` may be off by its last decimal place. */
export const checkAgainst = (
	badge: HTMLElement | null,
	computed: number,
	description: string,
	geo: Geometry,
	unit = "%"
): void => {
	const text = badge?.textContent || "";
	const stated = numberIn(text);
	const margin = unit ? 0.5 : 0.5 * 10 ** -decimalsIn(text.match(/-?[\d.,]+/)?.[0] ?? "");
	const agrees = Number.isNaN(stated) ? true : Math.abs(computed - stated) <= margin + 1e-9;
	const check: Check = { label: description, computed, stated, agrees };
	geo.checks.push(check);

	if (!agrees) {
		console.warn(
			`[${LIBRARY_NAME}] An annotation reads ${stated}${unit}, but ${description} is ` +
				`${Number(computed.toFixed(2))}${unit}. The chart shows your number.`
		);
	}
};
