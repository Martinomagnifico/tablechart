// Data from a file or API: a transform turns other JSON into rows, and data that cannot load gives a message instead of a chart.
//
//   npm run test:source                      test the current build (run npm run build first)
import { page, run } from "./browser.mjs";

const json = (value) => `data:application/json,${encodeURIComponent(JSON.stringify(value))}`;
const head = "<table><thead><tr><th>Month</th><th>Rain</th></tr></thead></table>";

const rows = json([{ label: "Jan", value: 67 }, { label: "Feb", value: 56 }]);
const other = json({ daily: { time: ["Jan", "Feb", "Mar"], rain: [67, 56, 53] } });
const uneven = json([{ label: "Jan", values: [67, 3] }, { label: "Feb", value: 56 }]);

const figure = (id, attributes) => `<figure id="${id}" data-chart="column" ${attributes}><figcaption>${id}</figcaption>${head}</figure>`;
const body = [
	figure("plain", `data-chart-src="${rows}"`),
	figure("transformed", `data-chart-src="${other}" data-chart-transform="perMonth"`),
	figure("unknown", `data-chart-src="${rows}" data-chart-transform="nothing"`),
	figure("missing", `data-chart-src="/missing.json"`),
	figure("wrong", `data-chart-src="${other}" data-chart-transform="broken"`),
	figure("uneven", `data-chart-src="${uneven}"`),
].join("");

const script = `
import { init } from "/tablechart.mjs";
const perMonth = (data) => data.daily.time.map((label, index) => ({ label, value: data.daily.rain[index] }));
const broken = () => "text";
const instance = await init({ threshold: 0, transforms: { perMonth, broken } });
const byId = (id) => document.getElementById(id);
const message = (id) => byId(id).querySelector(".tablechart-load-error");
const built = (id) => byId(id).hasAttribute("data-chart-made");
const bodyRows = (id) => byId(id).querySelectorAll("tbody tr").length;
const failed = ["unknown", "missing", "wrong", "uneven"];
window.done = {
	charts: instance.charts.length,
	plain: built("plain") && bodyRows("plain") === 2,
	transformed: built("transformed") && bodyRows("transformed") === 3,
	headKept: byId("transformed").querySelector("thead th:last-child")?.textContent === "Rain",
	messages: failed.filter((id) => message(id) && !built(id)),
	status: message("missing")?.getAttribute("role"),
	key: message("missing")?.getAttribute("data-i18n"),
	text: message("missing")?.textContent,
	headStays: byId("uneven").querySelector("thead") !== null && bodyRows("uneven") === 0,
};
`;

const result = await run(page(body, script), { port: 4616, cdpPort: 9616 });

const failures = [];
const check = (ok, text) => ok || failures.push(text);
check(result.plain, "A JSON file with a list of rows did not make a chart.");
check(result.transformed, "A transform did not turn other JSON into the rows of a chart.");
check(result.headKept, "The header row written in the figure was not kept with a transform.");
check(result.messages.length === 4, `Only ${result.messages.join(", ") || "none"} of the four figures that cannot load have a message instead of a chart.`);
check(result.charts === 2, `${result.charts} charts were made, where 2 have complete data.`);
check(result.status === "status", 'The message has no role="status".');
check(result.key === "tablechart-load-error", "The message has no translation key.");
check(result.text === "The data for this chart could not be loaded.", `The message says "${result.text}".`);
check(result.headStays, "The table written in the figure did not stay as it was when its data failed the checks.");

if (failures.length) {
	for (const failure of failures) console.error(`✗ ${failure}`);
	process.exit(1);
}
console.log("✓ A transform turns other JSON into rows, and data that cannot load gives a message instead of a chart.");
