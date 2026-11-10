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

const script = `
import { init } from "/tablechart.mjs";
import { Summary } from "/tablechart-summary.mjs";
Summary.init();
await init({ threshold: 0, animate: false });
const text = (id) => [...document.querySelectorAll("#" + id + " .chart-summary > [data-summary-text]")].map((p) => p.textContent.trim());
window.done = { stack: text("stack"), donut: text("donut"), below: text("below") };
`;

const result = await run(page(stack + donut + below, script), { port: 4615, cdpPort: 9615 });

const failures = [];
const check = (ok, text) => ok || failures.push(text);
check(result.stack[0] === "2024 95.5|2025 45.0|210.5", `The totals of the stacks are wrong: "${result.stack[0]}".`);
check(result.stack[1] === "2024 45.5", `A sentence without data-series no longer reads the first column: "${result.stack[1]}".`);
check(result.donut[0] === "80|Juiced 50%|Composted 13%", `The shares of the donut are wrong: "${result.donut[0]}".`);
check(result.below[0] === "6|{highest.share}", `With a value below zero there should be a total and no share: "${result.below[0]}".`);

if (failures.length) {
	for (const failure of failures) console.error(`✗ ${failure}`);
	process.exit(1);
}
console.log("✓ A summary reads the totals of a stack, and shares of a whole.");
