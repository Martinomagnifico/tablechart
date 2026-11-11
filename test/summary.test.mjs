// Summary sentences on charts other than a line: the totals of a stack, and shares of a whole.
//
//   npm run test:summary                     test the current build (run npm run build first)
import { page, run } from "./browser.mjs";

const stack = `<figure id="stack" data-chart="column" data-chart-stack data-chart-summary="always"><table>
<thead><tr><th>Year</th><th>North</th><th>South</th></tr></thead>
<tbody><tr><th>2023</th><td>40</td><td>30</td></tr><tr><th>2024</th><td>45.5</td><td>50</td></tr><tr><th>2025</th><td>20</td><td>25</td></tr></tbody></table>
<div class="chart-summary"><p data-series="total">{highest.name} {highest.value}|{lowest.name} {lowest.value}|{total}</p><p>{highest.name} {highest.value}</p></div></figure>`;
const donut = `<figure id="donut" data-chart="donut" data-chart-summary="always"><table><tbody>
<tr data-kind="total"><th>Picked</th><td>80</td></tr><tr><th>Juiced</th><td>40</td></tr><tr><th>Eaten</th><td>30</td></tr><tr><th>Composted</th><td>10</td></tr></tbody></table>
<div class="chart-summary"><p>{total}|{highest.name} {highest.share}|{lowest.name} {lowest.share}</p></div></figure>`;
const below = `<figure id="below" data-chart="column" data-chart-summary="always"><table><tbody>
<tr><th>A</th><td>10</td></tr><tr><th>B</th><td>-4</td></tr></tbody></table>
<div class="chart-summary"><p>{total}|{highest.share}</p></div></figure>`;

// Twelve months in order, with notes, for ranks, groups and the settings of one chart.
const months = [40, 42, 41, 44, 45, 47, 46, 49, 50, 52, 51, 54];
const rowsOf = (notes = {}) => months.map((v, i) => `<tr><th>M${i + 1}</th><td>${v}</td><td>${notes[i] ?? ""}</td></tr>`).join("");
const ranked = `<figure id="ranked" data-chart="column" data-chart-ordered data-chart-summary="always"><table>
<thead><tr><th>Month</th><th>Kilos</th><th data-note>Note</th></tr></thead><tbody>${rowsOf({ 4: "Fair", 0: "Start" })}</tbody></table>
<div class="chart-summary"><p><span data-each="notes">{name} {value} {rank|one:#st|two:#nd|few:#rd|other:#th}/{rank.low|one:#st|two:#nd|few:#rd|other:#th} of {values}</span></p>
<table data-summary="groups"><tbody><tr data-each="groups"><th>{from}–{to}</th><td>{lowest}</td><td>{average}</td><td>{highest}</td></tr></tbody></table></div></figure>`;
const own = `<div data-summary-options='{"groups": 3, "words": {"up": "rising"}}'>
<figure id="own" data-chart="line" data-summary-groups="2" data-summary-flat="50" data-chart-summary="always"><table>
<thead><tr><th>Month</th><th>Kilos</th><th data-note>Note</th></tr></thead><tbody>${rowsOf()}</tbody></table>
<div class="chart-summary"><p>{trend}|{flat.percent}</p><table data-summary="groups"><tbody><tr data-each="groups"><td>{from}</td></tr></tbody></table></div></figure>
<figure id="parent" data-chart="line" data-chart-summary="always"><table><tbody>${rowsOf()}</tbody></table>
<div class="chart-summary"><p>{trend}</p><table data-summary="groups"><tbody><tr data-each="groups"><td>{from}</td></tr></tbody></table></div></figure></div>`;

const script = `
import { init } from "/tablechart.mjs";
import { Summary } from "/tablechart-summary.mjs";
Summary.init();
await init({ threshold: 0, animate: false });
const text = (id) => [...document.querySelectorAll("#" + id + " .chart-summary > [data-summary-text]")].map((p) => p.textContent.trim());
const rows = (id) => [...document.querySelectorAll("#" + id + " .chart-summary > table[data-summary-text] tr")].map((tr) => [...tr.children].map((c) => c.textContent).join(" "));
window.done = { stack: text("stack"), donut: text("donut"), below: text("below"), ranked: text("ranked"), groups: rows("ranked"), own: text("own"), ownGroups: rows("own"), parent: text("parent"), parentGroups: rows("parent") };
`;

const result = await run(page(stack + donut + below + ranked + own, script), { port: 4615, cdpPort: 9615 });

const failures = [];
const check = (ok, text) => ok || failures.push(text);
check(result.stack[0] === "2024 95.5|2025 45.0|210.5", `The totals of the stacks are wrong: "${result.stack[0]}".`);
check(result.stack[1] === "2024 45.5", `A sentence without data-series no longer reads the first column: "${result.stack[1]}".`);
check(result.donut[0] === "80|Juiced 50%|Composted 13%", `The shares of the donut are wrong: "${result.donut[0]}".`);
check(result.below[0] === "6|{highest.share}", `With a value below zero there should be a total and no share: "${result.below[0]}".`);
check(result.ranked[0] === "M1 40 12th/1st of 12 and M5 45 8th/5th of 12", `Ranks of the notes are wrong: "${result.ranked[0]}".`);
check(result.groups.length === 10 && result.groups[0] === "M1–M1 40 40 40" && result.groups[9] === "M11–M12 51 53 54", `Groups are wrong: ${JSON.stringify(result.groups)}.`);
check(result.own[0] === "flat|50%" && result.ownGroups.join() === "M1,M7", `An attribute on the figure should win: "${result.own[0]}", ${JSON.stringify(result.ownGroups)}.`);
check(result.parent[0] === "rising" && result.parentGroups.join() === "M1,M5,M9", `Options on a parent should count: "${result.parent[0]}", ${JSON.stringify(result.parentGroups)}.`);

if (failures.length) {
	for (const failure of failures) console.error(`✗ ${failure}`);
	process.exit(1);
}
console.log("✓ A summary reads the totals of a stack, shares of a whole, ranks and groups, and the settings of a chart.");
