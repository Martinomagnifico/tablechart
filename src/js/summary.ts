/** Sentences that the author writes, filled with values from the table. Imported as `@martinomagnifico/tablechart/summary`. */
import { summaryDefaults } from "./summary/config";
import { fill } from "./summary/fill";
import { init } from "./summary/init";

export type { SummaryConfig, SummaryWords } from "./summary/config";
export { fill, init, summaryDefaults };

export const Summary = { init, fill, defaults: summaryDefaults };
