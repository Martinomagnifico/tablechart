import { BADGE_CLASS, PLUGIN_ID } from "../config";
import { numberIn } from "../functions/format";
import type { Check, Geometry } from "../types";

/**
 * The callout on an annotation.
 *
 * It is an HTML element, not an SVG `<ellipse>`, because it has to grow around
 * whatever its text turns out to be once a page is translated. An SVG ellipse
 * would need its `rx` measured after layout and measured again on every language
 * change; a box with a 50% border radius simply fits.
 *
 * It is made in the early pass, before anything is laid out, so that a translation
 * plugin taking its one sweep of the page finds it along with everything else.
 */
export const createBadge = (spec: HTMLElement, plot: HTMLElement): HTMLElement => {
	const badge = document.createElement("span");
	badge.className = BADGE_CLASS;
	// For the eye only: screen readers read the annotation's own text, in the page.
	badge.inert = true;

	// The author's own elements move across, keeping their translation keys, so a
	// caption above the badge is translated like any other text on the page.
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

/**
 * Check a figure the author wrote against the one the data implies.
 *
 * The author's number always wins. Finance signs these off, and a chart that
 * silently recomputes is a chart that can publish something nobody approved. So
 * this only ever says, in the console, that the two disagree.
 */
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
			`[${PLUGIN_ID}] An annotation reads ${stated}%, but ${description} is ` +
				`${computed.toFixed(1)}%. The chart shows what you wrote; this is only a check.`
		);
	}
};
