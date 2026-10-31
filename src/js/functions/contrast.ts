import { LIBRARY_NAME, SHOWN_CLASS } from "../config";
import { contrastOf, markOf, methodOf, rgbOf, surfaceOf } from "./colour";

// What each method asks, and how it writes a contrast. A line, slice or bar needs 3:1 with the background (WCAG 1.4.11), or Lc 30
// with APCA; text needs 4.5:1 (WCAG 1.4.3), or Lc 60, and less if it is large. Parts next to each other are kept apart by a gap
// in the background colour, so each one is checked against the background only.
const METHODS = {
	2: {
		part: 3,
		text: 4.5,
		large: 3,
		// Two decimals, so 2.98 does not read as 3.0.
		show: (c: number) => `${(Math.floor(c * 100) / 100).toFixed(2)}:1`,
		need: (c: number) => `${c}:1`,
		partRule: "WCAG 1.4.11",
		textRule: "WCAG 1.4.3",
	},
	3: {
		part: 30,
		text: 60,
		large: 45,
		show: (c: number) => `Lc ${Math.floor(c)}`,
		need: (c: number) => `Lc ${c}`,
		partRule: "APCA, WCAG 3 draft",
		textRule: "APCA, WCAG 3 draft",
	},
};

/** Warns about each line, slice or bar that does not stand out enough from the background. Faint parts that are out of focus are left out. */
export const checkContrast = (figure: HTMLElement): void => {
	const surface = surfaceOf(figure);
	const method = METHODS[methodOf(figure)];

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
			const contrast = contrastOf(methodOf(figure), color, surface);
			if (contrast >= method.part) continue;
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
		console.warn(
			`[${LIBRARY_NAME}] ${what} a contrast of ${method.show(contrast)} with the background. It needs at least ${method.need(method.part)} (${method.partRule}).`,
			figure
		);
	}
};

/** Warns about each number inside a bar whose colour does not stand out enough from that bar, once the chart is built. */
export const checkTextContrast = (figure: HTMLElement): void => {
	let tries = 0;
	const run = () => {
		const values = Array.from(figure.querySelectorAll<HTMLElement>(".tablechart-value[data-place='inside'], .tablechart-value[data-place='middle']")).filter(
			(value) => !value.hasAttribute("data-left-out") && !value.hidden
		);
		// A number that is still fading in, such as on a slide that is not in view, is measured again a bit later.
		if (values.some((value) => rgbOf(getComputedStyle(value).color)[3] < 1)) {
			if (++tries <= 20) setTimeout(later, 500);
			return;
		}
		const rows = Array.from(figure.querySelectorAll("tbody tr > :first-child")).map((cell) => (cell.textContent ?? "").trim());
		const method = METHODS[methodOf(figure)];
		const shape = figure.dataset.chart === "bar" ? "bar" : "column";
		const found = new Map<string, { what: string; names: string[]; contrast: number; needed: number }>();
		for (const value of values) {
			const mark = markOf(figure, value);
			if (!mark) continue;
			const style = getComputedStyle(value);
			const fill = getComputedStyle(mark).fill;
			const contrast = contrastOf(methodOf(figure), rgbOf(style.color), rgbOf(fill));
			const size = Number.parseFloat(style.fontSize);
			const needed = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700) ? method.large : method.text;
			if (contrast >= needed) continue;
			const what = mark.classList.contains("tablechart-piece") ? `${shape} part` : shape;
			const key = `${style.color}|${fill}`;
			const entry = found.get(key) ?? { what, names: [], contrast, needed };
			entry.names.push(`"${rows[Number(value.dataset.row) - 1] ?? ""}" ("${value.textContent?.trim()}")`);
			found.set(key, entry);
		}
		for (const { what, names, contrast, needed } of found.values()) {
			const several = names.length > 1;
			console.warn(
				`[${LIBRARY_NAME}] The text inside the ${what}${several ? "s" : ""} of ${names.join(", ")} has a contrast of ${method.show(contrast)} with ${several ? "those" : "that"} ${what}${several ? "s" : ""}. Text needs at least ${method.need(needed)} (${method.textRule}).`,
				figure
			);
		}
	};
	// The numbers get their colour as the chart builds, so this waits until it is shown and every transition has ended.
	const later = () =>
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				const running = figure.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined));
				void Promise.all(running).then(run);
			})
		);
	if (figure.classList.contains(SHOWN_CLASS)) return void later();
	const watch = new MutationObserver(() => {
		if (!figure.classList.contains(SHOWN_CLASS)) return;
		watch.disconnect();
		later();
	});
	watch.observe(figure, { attributes: true, attributeFilter: ["class"] });
};

// Old, kept until 1.3.0: one fixed colour for the numbers inside bars, without a contrast check.
const OLD = ["bar", "piece", "up", "down", "total"].map((kind) => `--tablechart-${kind}-value-color`);
const warned = new Set<string>();

/** Warns once per page about each old variable that a chart still uses. */
export const checkOldColours = (figure: HTMLElement): void => {
	const style = getComputedStyle(figure);
	for (const name of OLD) {
		if (warned.has(name) || !style.getPropertyValue(name).trim()) continue;
		warned.add(name);
		console.warn(
			`[${LIBRARY_NAME}] ${name} is old and goes in 1.3.0. --tablechart-value-on-dark and --tablechart-value-on-light set the colour of the numbers inside bars, with a contrast check.`,
			figure
		);
	}
};
