import { PLACED_CLASS, SHOWN_CLASS, VIEWBOX_WIDTH } from "./config";
import type { Config } from "./config";
import { place } from "./functions/place";
import { noteCell } from "./functions/read-table";
import type { ChartState, TooltipLine } from "./types";

const TIP_CLASS = "tablechart-tooltip";
// A child of body does not inherit the chart's variables, so these are copied from the chart when it opens.
const COPIED = [
	"--tablechart-surface",
	"--_surface",
	"--tablechart-tooltip-surface",
	"--tablechart-tooltip-color",
	"--tablechart-tooltip-border",
	"--tablechart-tooltip-radius",
	"--tablechart-tooltip-padding",
	"--tablechart-tooltip-shadow",
];

// One tooltip for the page, and one set of document listeners, whatever the number of charts.
let tip: HTMLElement | null = null;
let content: HTMLElement;
let arrow: HTMLElement;
let owner: ChartState | null = null;
let shownRow: number | null = null;
let timer = 0;

const hide = (): void => {
	clearTimeout(timer);
	if (!tip || !owner) return;
	tip.hidden = true;
	owner = null;
	shownRow = null;
};

// Only a mouse that moves opens a tooltip. A key or a scroll closes it, and a page that changes
// under a resting pointer, such as the next slide of a presentation, does not open
// one: browsers send a pointer event then, but at the same place on the screen.
let resting = false;
let moved = true;
let lastX = Number.NaN;
let lastY = Number.NaN;
let watching = false;
const watch = (): void => {
	if (watching) return;
	watching = true;
	document.addEventListener(
		"pointermove",
		(event) => {
			if (event.pointerType !== "mouse") return;
			moved = event.screenX !== lastX || event.screenY !== lastY;
			lastX = event.screenX;
			lastY = event.screenY;
			if (moved) resting = false;
		},
		{ capture: true, passive: true }
	);
	// A key, or a scroll: the page changes under the pointer. A scroll also moves the
	// row away from a tooltip that is fixed to the window.
	const rest = () => {
		resting = true;
		hide();
	};
	document.addEventListener("keydown", rest, true);
	window.addEventListener("scroll", rest, { capture: true, passive: true });
};

// The scale an element has on screen, for example in the slides of a presentation. Its width from
// `getComputedStyle()`, as `offsetWidth` is rounded to whole pixels, which moved a tooltip by a pixel or two.
const scaleOf = (element: HTMLElement, onScreen: number): number =>
	onScreen / Number.parseFloat(getComputedStyle(element).width) || 1;

// The `tooltipparent` option: an element, a selector, or else the body.
const parentOf = (config: Config): HTMLElement => {
	const asked = config.tooltipparent;
	const found = typeof asked === "string" ? document.querySelector<HTMLElement>(asked) : asked;
	return found ?? document.body;
};

// A short wait, so the pointer can move from the chart onto the tooltip.
const hideSoon = (): void => {
	clearTimeout(timer);
	timer = window.setTimeout(hide, 120);
};

const make = (): HTMLElement => {
	const node = document.createElement("div");
	node.className = TIP_CLASS;
	// The table is what screen readers read; this only repeats it.
	node.setAttribute("aria-hidden", "true");
	node.hidden = true;
	content = document.createElement("div");
	arrow = document.createElement("div");
	arrow.className = `${TIP_CLASS}-arrow`;
	node.append(content, arrow);
	document.body.append(node);
	node.addEventListener("pointerenter", () => clearTimeout(timer));
	node.addEventListener("pointerleave", (event) => event.pointerType === "mouse" && hideSoon());
	document.addEventListener("pointerdown", (event) => {
		const target = event.target as Node;
		if (owner && !owner.plot.contains(target) && !node.contains(target)) hide();
	});
	window.addEventListener("resize", hide);
	return node;
};

// A mark or number on a later step is not there yet.
const arrived = (state: ChartState, element: Element | undefined): element is HTMLElement => {
	const step = element ? (element as HTMLElement).style.getPropertyValue("--step") : "x";
	return step === "" || Number(step) < state.step;
};

// The colour of a series, from its first mark: its fill, or the stroke of a line.
const colourOf = (state: ChartState, series: number): string | undefined => {
	const mark = state.svg.querySelector(`[data-series="${series + 1}"]:not(.tablechart-hole)`);
	if (!mark) return undefined;
	const style = getComputedStyle(mark);
	return style.fill && style.fill !== "none" ? style.fill : style.stroke;
};

/** Each value of the row with the name of its series, and the total of a stack. */
const rowLines = (state: ChartState, index: number, config: Config): TooltipLine[] => {
	const several = state.series.length > 1;
	const lines: TooltipLine[] = [];
	for (const [s, labels] of state.seriesValues.entries()) {
		if (!arrived(state, labels[index])) continue;
		const named = several ? state.figure.querySelector<HTMLElement>(`.tablechart-name[data-series="${s + 1}"]`) : null;
		lines.push({
			name: several ? (named?.textContent ?? state.series[s].name) : "",
			value: labels[index].textContent ?? "",
			colour: several ? colourOf(state, s) : undefined,
			// The key takes the shape of the legend's sample: a line with its point, or a box.
			sample: named
				? {
						marker: named.dataset.marker ?? null,
						open: named.hasAttribute("data-open"),
						line: named.dataset.line ?? null,
						box: named.dataset.swatch === "box",
					}
				: undefined,
		});
	}
	const total = state.totals[index];
	if (lines.length > 1 && arrived(state, total)) lines.push({ name: config.totallabel, value: total.textContent ?? "" });
	return lines;
};

// Above the marks of the row; a donut's slice is a whole ring, so there the number beside it.
// On a line, its point, also where no point is drawn.
const anchorOf = (state: ChartState, index: number): DOMRect => {
	if (state.type.centre && state.values[index]) return state.values[index].getBoundingClientRect();
	const point = state.pointOf?.(index);
	if (point) {
		const svg = state.svg.getBoundingClientRect();
		const scale = svg.width / VIEWBOX_WIDTH;
		// A point is drawn with a radius of 4 units.
		const r = 4 * scale * (VIEWBOX_WIDTH / state.plot.clientWidth);
		return new DOMRect(svg.left + point[0] * scale - r, svg.top + point[1] * scale - r, 2 * r, 2 * r);
	}
	const marks = state.svg.querySelectorAll(`[data-row="${index + 1}"]:not(.tablechart-connector, .tablechart-leader)`);
	let box: DOMRect | null = null;
	for (const mark of marks) {
		const r = mark.getBoundingClientRect();
		if (!r.width && !r.height) continue;
		box = box
			? new DOMRect(
					Math.min(box.left, r.left),
					Math.min(box.top, r.top),
					Math.max(box.right, r.right) - Math.min(box.left, r.left),
					Math.max(box.bottom, r.bottom) - Math.min(box.top, r.top)
				)
			: r;
	}
	if (box) return box;
	const plot = state.plot.getBoundingClientRect();
	const [left, top, width, height] = state.rowBox?.(index) ?? [0, 0, 100, 100];
	return new DOMRect(
		plot.left + (plot.width * left) / 100,
		plot.top + (plot.height * top) / 100,
		(plot.width * width) / 100,
		(plot.height * height) / 100
	);
};

const show = (state: ChartState, index: number, config: Config): void => {
	clearTimeout(timer);
	if (owner === state && shownRow === index) return;
	const lines = (state.type.tooltip ?? rowLines)(state, index, config);
	if (!lines.length) return hide();
	if (owner && owner !== state) hide();
	tip ??= make();

	const line = (name: string, value: string, colour?: string, title = false, sample?: TooltipLine["sample"]) => {
		const node = document.createElement("div");
		node.className = `${TIP_CLASS}-line`;
		if (colour) {
			const key = document.createElement("span");
			key.className = `${TIP_CLASS}-key`;
			key.style.background = colour;
			if (sample?.box) key.dataset.sample = "box";
			// A series without a box is a line, also a step line without points.
			else if (sample) {
				key.dataset.sample = "line";
				if (sample.marker) key.dataset.marker = sample.marker;
				if (sample.line) key.dataset.line = sample.line;
				key.toggleAttribute("data-open", sample.open);
			}
			node.append(key);
		}
		const label = document.createElement("span");
		label.className = `${TIP_CLASS}-${title ? "title" : "name"}`;
		label.textContent = name;
		node.append(label);
		if (value) {
			if (name) label.append(":");
			const number = document.createElement("span");
			number.className = `${TIP_CLASS}-value`;
			number.textContent = value;
			node.append(number);
		}
		return node;
	};
	// The full name in the table, also after a translation; the name under the chart may be a short one.
	const head = state.figure.querySelectorAll("tbody tr")[index]?.querySelector("th");
	const name = head?.textContent?.trim() || state.categories[index]?.textContent || state.rows[index].label;
	// With one value and no series name, the name of the row and its value share a line.
	const single = lines.length === 1 && !lines[0].name;
	// Names without values, such as on a scatter chart, are a list of their own, without a title.
	const names = lines.every((one) => one.name && !one.value);
	// The note of the row, from the table, under its values.
	const noteText = noteCell(state.figure, index)?.textContent?.trim();
	const noted = noteText ? [Object.assign(document.createElement("div"), { className: `${TIP_CLASS}-note`, textContent: noteText })] : [];
	content.replaceChildren(
		...(names ? [] : [line(name, single ? lines[0].value : "", undefined, true)]),
		...(single ? [] : lines.map(({ name, value, colour, sample }) => line(name, value, colour, false, sample))),
		...noted
	);

	const style = getComputedStyle(state.figure);
	for (const name of COPIED) {
		const value = style.getPropertyValue(name).trim();
		if (value) tip.style.setProperty(name, value);
		else tip.style.removeProperty(name);
	}
	tip.style.setProperty("--_color", style.color);
	tip.style.colorScheme = style.colorScheme;
	tip.style.fontFamily = style.fontFamily;

	const parent = parentOf(config);
	if (tip.parentElement !== parent) parent.append(tip);
	owner = state;
	shownRow = index;
	tip.hidden = false;
	// At the top left of its parent, where it is measured: so the width of the window does not wrap it where
	// it was last time, and to read where its parent puts it on the screen and at what scale.
	tip.style.left = "0px";
	tip.style.top = "0px";
	const at = tip.getBoundingClientRect();
	const frame = { x: at.left, y: at.top, scale: scaleOf(tip, at.width) };
	// The size the text of the chart has on screen. A chart can be scaled, as the slides of a presentation are,
	// and so can the parent of the tooltip.
	const chart = scaleOf(state.plot, state.plot.getBoundingClientRect().width);
	tip.style.fontSize = `${(Number.parseFloat(style.fontSize) * chart) / frame.scale}px`;
	place(tip, arrow, anchorOf(state, index), frame);
};

/** Pointing at a row, or tapping it, shows its values in a tooltip; with `auto`, only on a chart that leaves numbers out. */
export const attachTooltip = (state: ChartState, config: Config, auto = false): void => {
	const { plot } = state;
	plot.setAttribute("data-hover", "");
	watch();

	const rowOf = (event: PointerEvent): number | null => {
		if (state.rowAt) {
			const box = plot.getBoundingClientRect();
			// The plot can be scaled with a CSS transform.
			const scale = scaleOf(plot, box.width);
			return state.rowAt((event.clientX - box.left) / scale, (event.clientY - box.top) / scale);
		}
		// A donut has no rows side by side: the slice under the pointer says which row it is.
		const row = (event.target as Element).closest?.("[data-row]")?.getAttribute("data-row");
		return row ? Number(row) - 1 : null;
	};
	// A mark that is still on its way in: from the start of its transition, also its delay, to its end.
	const moving = new Set<Element>();
	const busy = (index: number) => {
		for (const mark of moving) {
			if (!mark.isConnected) moving.delete(mark);
			else if (mark.getAttribute("data-row") === String(index + 1)) return true;
		}
		return false;
	};
	let pointed: number | null = null;
	const point = (event: PointerEvent) => {
		// A click or a tap is meant; a mouse that did not move is not.
		if (event.type === "pointerdown") resting = false;
		else if (event.pointerType === "mouse" && (!moved || resting)) return;
		if (!plot.classList.contains(PLACED_CLASS) || !state.figure.classList.contains(SHOWN_CLASS)) return;
		// `auto`: only while the chart leaves numbers out, which can change with its width.
		if (auto && !state.figure.hasAttribute("data-left-out")) return owner === state ? hide() : undefined;
		const index = rowOf(event);
		pointed = index;
		// Off every row but still on the plot, such as between the markers of a scatter chart: closed at once.
		if (index === null || busy(index)) return owner === state ? hide() : undefined;
		show(state, index, config);
	};
	const mark = (event: Event) => {
		const target = event.target as Element;
		return state.svg.contains(target) && target.hasAttribute("data-row") ? target : null;
	};
	state.svg.addEventListener("transitionrun", (event) => {
		const one = mark(event);
		if (one) moving.add(one);
	});
	const arrive = (event: Event) => {
		const one = mark(event);
		if (!one) return;
		moving.delete(one);
		// The pointer waited on this row: show it now that it is there.
		const index = Number(one.getAttribute("data-row")) - 1;
		if (pointed === index && !busy(index) && !resting) show(state, index, config);
	};
	state.svg.addEventListener("transitionend", arrive);
	state.svg.addEventListener("transitioncancel", arrive);
	plot.addEventListener("pointermove", point);
	plot.addEventListener("pointerdown", point);
	plot.addEventListener("pointerleave", (event) => {
		// A tap ends with the pointer leaving; the tooltip stays until the next tap elsewhere.
		if (event.pointerType !== "mouse") return;
		pointed = null;
		if (owner === state) hideSoon();
	});
};

/** Closes the tooltip if it belongs to this chart, for example when the chart is destroyed. */
export const releaseTooltip = (state: ChartState): void => {
	if (owner === state) hide();
};
