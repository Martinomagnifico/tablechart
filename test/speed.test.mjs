// How fast a chart with 1,000, 10,000 and 100,000 rows is ready. Fails on an error, or if 10,000 rows take more than 2 seconds.
//
//   npm test                                 build, then test
//   node test/speed.test.mjs                 test the current build
//   node test/speed.test.mjs --rows 20000    only these row counts
//   node test/speed.test.mjs --detail        also the time of each step
import { page, run } from "./browser.mjs";

const argument = (name) => {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : null;
};
const counts = (argument("--rows") ?? "1000,10000,100000").split(",").map(Number);
const detail = process.argv.includes("--detail");
const kinds = ["line", "area", "column", "bar"];
const BUDGET = { rows: 10_000, seconds: 2 };

const script = `
import { build, defaultConfig, layout, prepare } from "/tablechart-core.mjs";
const config = { ...defaultConfig, animate: false, hover: false };
const results = [];
for (const rows of ${JSON.stringify(counts)}) {
	for (const kind of ${JSON.stringify(kinds)}) {
		const figure = document.createElement("figure");
		figure.dataset.chart = kind;
		let body = "";
		for (let i = 0; i < rows; i++) body += "<tr><th>" + i + "</th><td>" + (50 + 40 * Math.sin(i / 7) + (i % 13)).toFixed(1) + "</td></tr>";
		figure.innerHTML = "<table><tbody>" + body + "</tbody></table>";
		document.body.append(figure);

		const time = async (work) => { const start = performance.now(); await work(); return performance.now() - start; };
		const table = await time(() => prepare([figure], config));
		let state;
		const building = await time(() => { state = build(figure, config); });
		const placing = await time(() => layout(state, config));
		results.push({ rows, kind, table, building, placing });
		figure.remove();
		await new Promise((ok) => setTimeout(ok, 50));
	}
}
window.done = results;
`;

let results;
try {
	results = await run(page("", script), { port: 4612, cdpPort: 9612, timeout: 900_000 });
} catch (error) {
	console.error(`\n✗ ${error.message}\n`);
	process.exit(1);
}

const name = (kind) => kind[0].toUpperCase() + kind.slice(1);
const rows = (n) => `${n.toLocaleString("en")} rows`;
const seconds = (ms) => (ms < 10_000 ? `${(ms / 1000).toFixed(2)} s` : `${(ms / 1000).toFixed(1)} s`);
const total = (r) => r.table + r.building + r.placing;
const cell = 14;

console.log("\nHow fast a chart is ready, in Chrome on this machine:");
console.log("reading the table, building the chart, and its first layout.\n");
console.log(`  ${"".padEnd(8)}${counts.map((n) => rows(n).padStart(cell)).join("")}`);
for (const kind of kinds) {
	const times = counts.map((n) => results.find((r) => r.kind === kind && r.rows === n));
	console.log(`  ${name(kind).padEnd(8)}${times.map((r) => seconds(total(r)).padStart(cell)).join("")}`);
}

if (detail) {
	console.log("\nEach step:\n");
	for (const r of results) {
		console.log(`  ${name(r.kind).padEnd(8)}${rows(r.rows).padStart(cell)}   table ${seconds(r.table)}, build ${seconds(r.building)}, layout ${seconds(r.placing)}`);
	}
}

const measured = results.filter((r) => r.rows === BUDGET.rows);
const slow = measured.filter((r) => total(r) > BUDGET.seconds * 1000);
console.log("");
if (!measured.length) {
	console.log(`(No charts with ${rows(BUDGET.rows)} were measured, so there is no pass or fail.)\n`);
} else if (slow.length) {
	console.error(`✗ With ${rows(BUDGET.rows)}, ${slow.map((r) => `${name(r.kind)} took ${seconds(total(r))}`).join(", ")}: more than ${BUDGET.seconds} seconds.\n`);
	process.exit(1);
} else {
	console.log(`✓ Every chart with ${rows(BUDGET.rows)} was ready within ${BUDGET.seconds} seconds.\n`);
}
