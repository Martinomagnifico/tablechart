// Where every mark and number of a chart is, so after a legend toggle they can move from there.
import { TICK_CLASS, VALUE_CLASS } from "../../config";
import type { ChartState } from "../../types";

export type Box = [number, number, number, number];

export interface Mark {
	element: Element;
	box: Box | null;
	path: string | null;
}

export interface Text {
	element: HTMLElement;
	left: string;
	top: string;
}

// Where the drawing and the plot were on the screen, and how large a unit of the drawing was.
export interface Frame {
	svg: DOMRect;
	plot: DOMRect;
	scaleX: number;
	scaleY: number;
}

export interface Snapshot {
	marks: Map<string, Mark[]>;
	texts: Map<string, Text>;
	// Where each name under or beside the chart was on the screen, by its row.
	names: DOMRect[];
	frame: Frame;
}

// ---------------------------------------------------------------------------------------------------------------------------------

const SHAPES = "rect, circle, polygon, path, line";

/** A mark by its class, kind, row, series and side, so the same mark is found again in the new drawing. */
export const markKey = (element: Element): string => {
	const parts = ["kind", "row", "series", "side"].map((name) => element.getAttribute(`data-${name}`) ?? "");
	return [element.classList[0], ...parts].join("|");
};

// A number along an axis by its side and value, so it moves only along its own axis.
export const textKey = (element: HTMLElement): string => {
	if (element.classList.contains(TICK_CLASS)) return `tick|${element.dataset.place}|${element.dataset.value}`;
	return [element.dataset.kind, element.dataset.row, element.dataset.series].join("|");
};

const visible = (element: HTMLElement): boolean => element.dataset.place !== "none" && !element.hasAttribute("data-left-out");

// The marks of the drawing, not the shapes inside a mask or clip.
export const marksOf = (state: ChartState): Element[] => {
	const shapes = Array.from(state.svg.querySelectorAll(SHAPES));
	return shapes.filter((element) => !element.closest("defs, mask, clipPath"));
};

export const textsOf = (state: ChartState): HTMLElement[] => {
	const texts = Array.from(state.plot.querySelectorAll<HTMLElement>(`.${VALUE_CLASS}, .${TICK_CLASS}`));
	return texts.filter(visible);
};

export const boxOf = (element: Element): Box | null => {
	try {
		const { x, y, width, height } = (element as SVGGraphicsElement).getBBox();
		return [x, y, width, height];
	} catch {
		return null;
	}
};

export const frameOf = (state: ChartState): Frame => {
	const svg = state.svg.getBoundingClientRect();
	const view = state.svg.viewBox.baseVal;
	return {
		svg,
		plot: state.plot.getBoundingClientRect(),
		scaleX: svg.width / (view.width || 1),
		scaleY: svg.height / (view.height || 1),
	};
};

// ---------------------------------------------------------------------------------------------------------------------------------

/** Where every mark and number is, before the chart is rendered again. */
export const snapshot = (state: ChartState): Snapshot => {
	const marks = new Map<string, Mark[]>();
	for (const element of marksOf(state)) {
		const key = markKey(element);
		const list = marks.get(key) ?? [];
		list.push({ element, box: boxOf(element), path: element.getAttribute("d") });
		marks.set(key, list);
	}

	const texts = new Map<string, Text>();
	for (const element of textsOf(state)) {
		texts.set(textKey(element), { element, left: element.style.left, top: element.style.top });
	}

	const names = state.categories.map((name) => name.getBoundingClientRect());

	return { marks, texts, names, frame: frameOf(state) };
};
