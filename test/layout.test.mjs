// What every kind of chart draws, before and after a resize, against a snapshot made on this machine (fonts differ per machine).
//
//   npm test                                 build, then test
//   node test/layout.test.mjs                test the current build
//   node test/layout.test.mjs --update       save a new snapshot after an intended change
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, page, run } from "./browser.mjs";

const SNAPSHOT = join(ROOT, "test/snapshots/layout.txt");

const table = (rows, heads) => {
	const head = heads ? `<thead><tr><th></th>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` : "";
	const body = rows
		.map(([label, ...values]) => {
			const total = label.startsWith("*");
			return `<tr${total ? ' data-kind="total"' : ""}><th>${label.replace("*", "")}</th>${values.map((v) => `<td>${v}</td>`).join("")}</tr>`;
		})
		.join("");
	return `<table>${head}<tbody>${body}</tbody></table>`;
};
const figure = (attrs, content) => `<figure ${attrs}>${content}</figure>`;

const seasons = [["Spring", "58"], ["Summer", "72"], ["Autumn", "70"], ["Winter", "9"]];
const big = [["A", "12345.6"], ["B", "98765.4"], ["C", "5432.1"]];
const two = [["a", "12", "5"], ["b", "30", "9"], ["c", "18", "22"], ["d", "26", "14"]];
const three = [["a", "4", "6", "2"], ["b", "8", "3", "5"], ["c", "6", "7", "4"]];
const gaps = [["a", "12"], ["b", "30"], ["c", "18"], ["d", "n/a"], ["e", "25"], ["f", "25"], ["g", "40"]];
const long = [["Bramley seedling of the old orchard", "31.4"], ["Cox’s orange pippin", "27.8"], ["Discovery", "2.6"]];
const water = [["*Picked", "74.5"], ["Windfalls", "28.2"], ["Bruised", "-16.1"], ["Peelings", "-13.3"], ["*Pressed", "73.3"]];
const donut = [["Juiced", "38.2"], ["Eaten fresh", "18.1"], ["Sold whole", "12.4"], ["Composted", "0.8"]];
const notes = (html) => `<div class="chart-annotations">${html}</div>`;

const figures = [];
for (const kind of ["column", "bar"]) {
	figures.push(
		figure(`data-chart="${kind}"`, table(seasons)),
		figure(`data-chart="${kind}" data-chart-labels="inside"`, table(seasons)),
		figure(`data-chart="${kind}"`, table(big)),
		figure(`data-chart="${kind}"`, table(two, ["N", "S"])),
		figure(`data-chart="${kind}" data-chart-stack`, table(three, ["X", "Y", "Z"])),
		figure(`data-chart="${kind}"`, table(long))
	);
}
for (const kind of ["line", "area"]) {
	for (const shape of ["straight", "step", "smooth"]) {
		figures.push(
			figure(`data-chart="${kind}" data-chart-shape="${shape}"`, table(gaps)),
			figure(`data-chart="${kind}" data-chart-shape="${shape}"`, table(two, ["N", "S"])),
			figure(`data-chart="${kind}" data-chart-shape="${shape}" data-chart-stack`, table(three, ["X", "Y", "Z"]))
		);
	}
}
figures.push(
	figure('data-chart="line"', table(three, ["X", "Y", "Z"])),
	figure('data-chart="line" data-chart-legend', table(two, ["N", "S"])),
	figure('data-chart="line" data-chart-animate="up"', table(two, ["N", "<b>S</b>"])),
	figure('data-chart="waterfall"', table(water)),
	figure('data-chart="donut"', table(donut)),
	figure('data-chart="column"', table(seasons) + notes('<span data-annotation="bracket" data-from="1" data-to="3">+24%</span>')),
	figure('data-chart="line"', table(seasons) + notes('<span data-annotation="trend" data-years="3"><span class="tablechart-caption">A year</span><span>+5%</span></span>')),
	figure('data-chart="column"', table([["a", "10"], ["b", "200"], ["c", "30"]]) + notes('<span data-annotation="axis-break" data-to="40"></span>'))
);

const script = `
import { init } from "/tablechart.mjs";
const describe = () => [...document.querySelectorAll("figure")].map((figure, k) => {
	const svg = figure.querySelector("svg")?.outerHTML ?? "(no drawing)";
	const text = [...figure.querySelectorAll(".tablechart-value, .tablechart-name, .tablechart-badge, .tablechart-centre, .tablechart-categories span")]
		.map((node) => (node.getAttribute("style") ?? "") + " | " + (node.dataset.place ?? "") + (node.hasAttribute("data-left-out") ? " | left out" : ""));
	const plot = figure.querySelector(".tablechart-plot")?.getAttribute("style") ?? "";
	return ["#" + k + " " + figure.outerHTML.slice(0, figure.outerHTML.indexOf(">") + 1), svg, ...text, "plot: " + plot].join("\\n");
}).join("\\n\\n");
const frames = (n) => new Promise((ok) => { const step = () => (n-- ? requestAnimationFrame(step) : ok()); step(); });
await init({ threshold: 0, animate: false });
await frames(10);
const first = describe();
document.body.style.width = "420px";
await frames(10);
window.done = first + "\\n\\n===== after a resize to 420px =====\\n\\n" + describe();
`;

const output = await run(page(figures.join("\n"), script), { port: 4611, cdpPort: 9611 });

if (process.argv.includes("--update") || !existsSync(SNAPSHOT)) {
	mkdirSync(join(ROOT, "test/snapshots"), { recursive: true });
	writeFileSync(SNAPSHOT, output);
	console.log(`Saved the snapshot of ${figures.length} charts: test/snapshots/layout.txt`);
	process.exit(0);
}

const expected = readFileSync(SNAPSHOT, "utf8");
if (output === expected) {
	console.log(`✓ ${figures.length} charts draw as in the snapshot, before and after a resize.`);
	process.exit(0);
}

const got = output.split("\n");
const want = expected.split("\n");
const line = got.findIndex((text, i) => text !== want[i]);
const chart = [...want.slice(0, line + 1)].reverse().find((text) => text.startsWith("#"));
console.error(`✗ The drawing differs from the snapshot, first at line ${line + 1}, in chart ${chart?.split(" ")[0] ?? "?"}:`);
console.error(`  expected: ${(want[line] ?? "(nothing)").slice(0, 300)}`);
console.error(`  got:      ${(got[line] ?? "(nothing)").slice(0, 300)}`);
console.error("If the change is intended, save a new snapshot with: node test/layout.test.mjs --update");
process.exit(1);
