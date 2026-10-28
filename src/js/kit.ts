// What a chart type or the summary outside the core may use. An additional type imports only this and types, so a script tag gets it from the core.
export { GRID_CLASS, LEGEND_CLASS, LIBRARY_NAME, NAME_CLASS, POINT_CLASS, QUADRANT_CLASS, VIEWBOX_WIDTH } from "./config";
export { avoidCollisions, type Box, overlaps } from "./functions/collision";
export { boxOf } from "./functions/labels";
export { decimalsIn, largest, splitSign } from "./functions/format";
export { readSeries, readTable } from "./functions/read-table";
export { markerEl, type Shape } from "./functions/markers";
export { sizeOf } from "./functions/measure";
export { htmlEl, placeAt, short, svgEl } from "./functions/svg";
