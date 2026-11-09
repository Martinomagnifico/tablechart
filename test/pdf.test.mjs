// What a chart becomes in a tagged PDF: the ready signals, and a summary and table that a screen reader can reach.
//
//   npm run test:pdf                         test the current build (run npm run build first)
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { page, run } from "./browser.mjs";

const rows = "<tr><th>2021</th><td>120</td></tr><tr><th>2022</th><td>135</td></tr><tr><th>2023</th><td>128</td></tr><tr><th>2024</th><td>160</td></tr>";
const table = `<table><thead><tr><th>Year</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`;
const body = `
<h1>Report</h1>
<figure id="summary" data-chart="line" data-chart-table="never" data-chart-summary="always">
	<figcaption><b>Portfolio value</b></figcaption>${table}
	<div class="chart-summary"><p>The highest value was {highest.value}, in {highest.name}.</p></div>
</figure>
<figure id="table" data-chart="column" data-chart-table="always">
	<figcaption><b>Fees</b></figcaption>${table}
</figure>`;

const script = `
import { init } from "/tablechart.mjs";
import { Summary } from "/tablechart-summary.mjs";
const html = document.documentElement;
const roles = () => [...document.querySelectorAll("figure")].map((figure) => {
	const svg = figure.querySelector("svg");
	return [figure.getAttribute("role"), figure.querySelector(".tablechart-plot").getAttribute("aria-hidden"), svg.getAttribute("role"), svg.getAttribute("aria-labelledby")];
});
const before = [html.hasAttribute("data-tablechart-ready"), html.hasAttribute("data-summary-ready")];
let filled = false;
document.addEventListener("tablechart:summary-ready", () => { filled = document.querySelector("#summary .chart-summary").textContent.includes("160, in 2024"); });
Summary.init();
await init({ threshold: 0, animate: false });
await document.fonts.ready;
const web = roles();
window.dispatchEvent(new Event("beforeprint"));
const paper = roles();
window.dispatchEvent(new Event("afterprint"));
window.done = { before, ready: [html.hasAttribute("data-tablechart-ready"), html.hasAttribute("data-summary-ready")], filled, web, paper, back: roles() };
`;

const { value, pdf } = await run(page(body, script), { port: 4612, cdpPort: 9612, pdf: true });

const failures = [];
const check = (ok, text) => ok || failures.push(text);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check(same(value.before, [false, false]), "The ready signals are there before the charts are.");
check(same(value.ready, [true, true]), "A ready signal did not come.");
check(value.filled, "data-summary-ready came before the summary was filled.");
check(value.web.every(([figure, plot, svg]) => figure === null && plot === "true" && svg === "presentation"), "On the web, a chart has lost its roles.");
check(value.paper.every(([figure, plot, svg, name]) => figure === "group" && plot === null && svg === "img" && name), "In print, a chart does not have its print roles.");
check(same(value.back, value.web), "After printing, a chart does not have its roles back.");

const document = await getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
const nodes = [];
let text = "";
for (let n = 1; n <= document.numPages; n++) {
	const one = await document.getPage(n);
	const tree = await one.getStructTree();
	const walk = (node, inside) => {
		if (!node.role) return;
		nodes.push({ role: node.role, alt: node.alt, inside });
		for (const child of node.children ?? []) walk(child, node.role === "Figure" ? [...inside, node] : inside);
	};
	if (tree) walk(tree, []);
	text += (await one.getTextContent()).items.map((item) => item.str).join(" ");
}

const figures = nodes.filter(({ role }) => role === "Figure");
check(same(figures.map(({ alt }) => alt), ["Portfolio value", "Fees"]), `Each drawing needs a figure with its caption as its alt text, not: ${JSON.stringify(figures.map(({ alt }) => alt))}.`);
check(!nodes.some(({ inside }) => inside.length), "Something is inside a figure with alt text, where a screen reader may skip it.");
check(nodes.some(({ role }) => role === "Table"), "The printed table is not a table in the PDF.");
check(/highest value was\s*160/.test(text.replace(/\s+/g, " ")), "The summary is not text in the PDF.");

if (failures.length) {
	for (const failure of failures) console.error(`✗ ${failure}`);
	process.exit(1);
}
console.log("✓ A tagged PDF has the drawing as a figure, and its summary and table outside it.");
