import { BADGE_CLASS, LIBRARY_NAME } from "../config";
import { numberIn } from "../functions/format";
import type { Check, Geometry } from "../types";

/** HTML rather than SVG, so the callout grows around its text in any language. */
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

/** The author's number always wins; a mismatch is only reported in the console. */
export const checkAgainst = (
	badge: HTMLElement | null,
	computed: number,
	description: string,
	geo: Geometry
): void => {
	const stated = numberIn(badge?.textContent || "");
	const agrees = Number.isNaN(stated) ? true : Math.abs(computed - stated) <= 0.5;
	const check: Check = { label: description, computed, stated, agrees };
	geo.checks.push(check);

	if (!agrees) {
		console.warn(
			`[${LIBRARY_NAME}] An annotation reads ${stated}%, but ${description} is ` +
				`${computed.toFixed(1)}%. The chart shows what you wrote; this is only a check.`
		);
	}
};
