import { axisBreak } from "../annotations/axis-break";
import { bracket } from "../annotations/bracket";
import { note } from "../annotations/note";
import { reference } from "../annotations/reference";
import { trend } from "../annotations/trend";
import { bar } from "./bar";
import { column } from "./column";
import { donut, pie } from "./donut";
import { area, line } from "./line";
import { waterfall } from "./waterfall";
import type { AnnotationType, ChartType } from "../types";

export const CHARTS: Record<string, ChartType> = { area, bar, column, donut, line, pie, waterfall };

/** Adds a chart type for `data-chart="name"`, such as one from `@martinomagnifico/tablechart/additional-types`, before `init()`. */
// A chart type can bring annotations of its own, such as the quadrant of a scatter chart.
export const addType = (name: string, type: ChartType): void => {
	CHARTS[name] = type;
	Object.assign(ANNOTATIONS, type.annotations);
	ANNOTATION_NAMES.splice(0, Infinity, ...Object.keys(ANNOTATIONS));
};

export const ANNOTATIONS: Record<string, AnnotationType> = { "axis-break": axisBreak, trend, bracket, reference, note };

export const ANNOTATION_NAMES = Object.keys(ANNOTATIONS);
