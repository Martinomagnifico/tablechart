// What a chart type outside the core may use. An additional type imports only this and types, so a script tag gets it from the core.
export { LEGEND_CLASS, NAME_CLASS, POINT_CLASS, VIEWBOX_WIDTH } from "./config";
export { avoidCollisions, type Box } from "./functions/collision";
export { largest } from "./functions/format";
export { markerEl, type Shape } from "./functions/markers";
export { sizeOf } from "./functions/measure";
export { htmlEl, placeAt, short } from "./functions/svg";
