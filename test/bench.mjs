// How long a chart with 1,000, 10,000 and 100,000 rows takes. It reports and does not fail: times depend on the machine.
//
//   npm run bench                       build, then measure
//   node test/bench.mjs                 measure the current build
//   node test/bench.mjs --rows 1000     only these row counts
import { page, run } from "./browser.mjs";

const argument = (name) => {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : null;
};
const counts = (argument("--rows") ?? "1000,10000,100000").split(",").map(Number);
const kinds = ["line", "area", "column", "bar"];

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
		const reading = await time(() => prepare([figure], config));
		let state;
		const building = await time(() => { state = build(figure, config); });
		const placing = await time(() => layout(state, config));
		const nodes = figure.querySelectorAll("*").length;
		results.push({ rows, kind, reading, building, placing, nodes });
		figure.remove();
		await new Promise((ok) => setTimeout(ok, 50));
	}
}
window.done = results;
`;

const results = await run(page("", script), { port: 4612, cdpPort: 9612, timeout: 600_000 });

const ms = (n) => `${n.toFixed(1).padStart(9)} ms${n > 50 ? " ⚠" : "  "}`;
console.log("\nTime per chart (⚠ more than 50 ms):\n");
console.log(`  ${"rows".padStart(7)}  ${"chart".padEnd(7)} ${"table".padStart(14)} ${"build".padStart(14)} ${"layout".padStart(14)} ${"elements".padStart(10)}`);
for (const r of results) {
	console.log(`  ${String(r.rows).padStart(7)}  ${r.kind.padEnd(7)} ${ms(r.reading)} ${ms(r.building)} ${ms(r.placing)} ${String(r.nodes).padStart(10)}`);
}
console.log("");
