import { LIBRARY_NAME, SHOWN_CLASS } from "../config";
import { markOf, ratio, rgbOf, surfaceOf } from "./colour";

// A line, slice or bar needs a contrast of 3:1 with the background (WCAG 1.4.11). Parts next to each other are kept apart
// by a gap in the background colour, so this checks each one against the background only.
const NEEDED = 3;

/** With `debug`, warns about each line, slice or bar that does not stand out enough from the background. Faint parts that are out of focus are left out. */
export const checkContrast = (figure: HTMLElement): void => {
	const surface = surfaceOf(figure);

	// The names of the value columns, from the header row; a chart with one value column needs none.
	const names = Array.from(figure.querySelectorAll("table thead tr:first-child > *")).map((cell) => (cell.textContent ?? "").trim());
	const rows = Array.from(figure.querySelectorAll("tbody tr > :first-child")).map((cell) => (cell.textContent ?? "").trim());
	const parts: [string, string, (element: Element) => string][] = [
		[".tablechart-series", "Line", (element) => getComputedStyle(element).stroke],
		[".tablechart-slice", "Slice", (element) => getComputedStyle(element).stroke],
		[".tablechart-bar, .tablechart-piece", "Bar", (element) => getComputedStyle(element).fill],
	];
	// One message per kind, column and colour, with the rows that have that colour if not all of them do.
	const found = new Map<string, { kind: string; column: string; rows: Set<string>; all: number; contrast: number }>();
	for (const [selector, kind, paint] of parts) {
		const elements = Array.from(figure.querySelectorAll(`${selector}:not([data-muted])`));
		for (const element of elements) {
			const paintOf = paint(element);
			const [r, g, b, a] = rgbOf(paintOf);
			// A see-through colour is what it makes on the background.
			const color = [r, g, b].map((value, k) => value * a + surface[k] * (1 - a));
			const contrast = ratio(color, surface);
			if (contrast >= NEEDED) continue;
			const s = element.getAttribute("data-series");
			const row = rows[Number(element.getAttribute("data-row") ?? 0) - 1] ?? "";
			const column = kind === "Slice" ? "" : s ? names[Number(s)] : "";
			const key = `${kind}|${column}|${paintOf}`;
			const entry = found.get(key) ?? { kind, column, rows: new Set(), all: 0, contrast };
			entry.rows.add(row);
			entry.all = elements.filter((other) => other.getAttribute("data-series") === s).length;
			found.set(key, entry);
		}
	}
	for (const { kind, column, rows: hit, all, contrast } of found.values()) {
		const named = Array.from(hit).filter(Boolean).map((row) => `"${row}"`);
		const list = named.join(", ");
		const several = named.length > 1;
		// A line or a whole column has one colour; rows with a colour of their own are named.
		const what =
			kind === "Line"
				? column ? `Line "${column}" has` : "The line has"
				: kind === "Slice"
					? `${several ? "Slices" : "Slice"} ${list} ${several ? "have" : "has"}`
					: hit.size >= all || !list
						? `The bars${column ? ` of column "${column}"` : ""} have`
						: `${several ? "Bars" : "Bar"} ${list}${column ? ` in column "${column}"` : ""} ${several ? "have" : "has"}`;
		// Two decimals, so 2.98 does not read as 3.0.
		console.warn(
			`[${LIBRARY_NAME}] ${what} a contrast of ${(Math.floor(contrast * 100) / 100).toFixed(2)}:1 with the background. It needs at least ${NEEDED}:1 (WCAG 1.4.11).`,
			figure
		);
	}
};

// A number is text: 4.5:1 with what is behind it, or 3:1 if it is large (WCAG 1.4.3).
const TEXT = 4.5;
const LARGE_TEXT = 3;

/** With `debug`, warns about each number inside a bar whose colour does not stand out enough from that bar, once the chart is built. */
export const checkTextContrast = (figure: HTMLElement): void => {
	const run = () => {
		const rows = Array.from(figure.querySelectorAll("tbody tr > :first-child")).map((cell) => (cell.textContent ?? "").trim());
		const found = new Map<string, { names: string[]; contrast: number; needed: number }>();
		for (const value of figure.querySelectorAll<HTMLElement>(".tablechart-value[data-place='inside'], .tablechart-value[data-place='middle']")) {
			if (value.hasAttribute("data-left-out") || value.hidden) continue;
			const row = value.dataset.row;
			const mark = markOf(figure, value);
			if (!mark) continue;
			const style = getComputedStyle(value);
			const fill = getComputedStyle(mark).fill;
			const text = rgbOf(style.color);
			const behind = rgbOf(fill);
			const contrast = ratio(text, behind);
			const size = Number.parseFloat(style.fontSize);
			const needed = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700) ? LARGE_TEXT : TEXT;
			if (contrast >= needed) continue;
			const key = `${style.color}|${fill}`;
			const entry = found.get(key) ?? { names: [], contrast, needed };
			entry.names.push(`"${value.textContent?.trim()}" (${rows[Number(row) - 1] ?? ""})`);
			found.set(key, entry);
		}
		for (const { names, contrast, needed } of found.values())
			console.warn(
				`[${LIBRARY_NAME}] ${names.length > 1 ? "Numbers" : "Number"} ${names.join(", ")} inside ${names.length > 1 ? "their bars have" : "its bar has"} a contrast of ${(Math.floor(contrast * 100) / 100).toFixed(2)}:1 with the bar. Text needs at least ${needed}:1 (WCAG 1.4.3).`,
				figure
			);
	};
	// The numbers get their colour as the chart builds, so this waits until it is shown and built.
	const later = () => setTimeout(run, 3000);
	if (figure.classList.contains(SHOWN_CLASS)) return void later();
	const watch = new MutationObserver(() => {
		if (!figure.classList.contains(SHOWN_CLASS)) return;
		watch.disconnect();
		later();
	});
	watch.observe(figure, { attributes: true, attributeFilter: ["class"] });
};
