// What a chart type or the summary outside the core may use. An additional type imports only this and types, so a script tag gets it from the core.
export { GRID_CLASS, LEGEND_CLASS, LIBRARY_NAME, NAME_CLASS, POINT_CLASS, QUADRANT_CLASS, VIEWBOX_WIDTH } from "./config";
export { avoidCollisions, type Box, overlaps } from "./layout/collision";
export { boxOf } from "./layout/labels";
export { decimalsIn, largest, splitSign } from "./shared/format";
export { readSeries, readTable } from "./build/read-table";
export { markerEl, type Shape } from "./draw/markers";
export { sizeOf } from "./layout/measure";
export { htmlEl, placeAt, short, svgEl } from "./draw/svg";
