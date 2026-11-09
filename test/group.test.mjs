// Charts in a `data-chart-group`: side by side their rows of names have one height, and on another line their own.
// With `data-chart-group-scale`, the same value is the same height.
//
//   npm run test:group                       test the current build (run npm run build first)
import { page, run } from "./browser.mjs";

const chart = (names) => `<figure data-chart="column"><table><tbody>${names.map((name, i) => `<tr><th>${name}</th><td>${i + 3}</td></tr>`).join("")}</tbody></table></figure>`;
const long = ["Private Clients Nederland", "Private Clients België", "Investment Management Clients"];
const short = ["H1 2024", "H1 2025"];
const grid = (attrs, charts) => `<div ${attrs} style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; width: 620px">${charts.join("")}</div>`;
const body = [
	grid('id="group" data-chart-group', [chart(long), chart(short), chart(short), chart(short), chart(short), chart(short)]),
	grid('id="none"', [chart(long), chart(short), chart(short)]),
	`<div style="display: flex; gap: 10px; width: 620px"><div data-chart-group="named" style="flex: 1">${chart(long)}</div><div data-chart-group="named" style="flex: 1">${chart(short)}</div></div>`,
	grid('id="scale" data-chart-group data-chart-group-scale', [
		chart(short).replace("<td>3</td>", "<td>58</td>").replace("<td>4</td>", "<td>72</td>"),
		chart(short).replace("<td>3</td>", "<td>41</td>").replace("<td>4</td>", "<td>52</td>").replace("</table>", '</table><div class="chart-annotations"><span data-annotation="bracket">+27%</span></div>'),
		chart(short).replace("<td>3</td>", "<td>-20</td>").replace("<td>4</td>", "<td>30</td>"),
	]),
	grid('id="apart" data-chart-group', [
		chart(short).replace("<td>3</td>", "<td>58</td>").replace("<td>4</td>", "<td>72</td>"),
		chart(short).replace("<td>3</td>", "<td>41</td>").replace("<td>4</td>", "<td>52</td>"),
	]),
].join("");

const script = `
import { init } from "/tablechart.mjs";
const heights = (selector) => [...document.querySelectorAll(selector + " .tablechart-categories")].map((row) => row.offsetHeight);
await init({ threshold: 0, animate: false });
const frames = (n) => new Promise((ok) => { const step = () => (n-- ? requestAnimationFrame(step) : ok()); step(); });
await frames(5);
const bars = (selector) => [...document.querySelectorAll(selector + " figure")].map((figure) => {
	return [...figure.querySelectorAll(".tablechart-bar")].map((bar) => [Number(figure.querySelectorAll("tbody td")[Number(bar.dataset.row) - 1].textContent), bar.getBoundingClientRect().height, bar.getBoundingClientRect().bottom]);
});
const scale = bars("#scale");
const apart = bars("#apart");
const wide = heights("#group");
const none = heights("#none");
const named = heights("[data-chart-group=named]");
document.querySelector("#group").style.gridTemplateColumns = "1fr";
await frames(10);
window.done = { wide, none, named, stacked: heights("#group"), scale, apart };
`;

const { wide, none, named, stacked, scale, apart } = await run(page(body, script), { port: 4613, cdpPort: 9613 });

const failures = [];
const check = (ok, text) => ok || failures.push(text);
check(wide[0] > wide[3], `The test needs names on two lines in the first chart: ${wide}.`);
check(new Set(wide.slice(0, 3)).size === 1, `Charts on one line have rows of different heights: ${wide.slice(0, 3)}.`);
check(wide[3] < wide[0] && new Set(wide.slice(3)).size === 1, `A second line of charts did not keep its own height: ${wide.slice(3)}.`);
check(none[0] > none[1], `Charts without a group changed: ${none}.`);
check(new Set(named).size === 1, `Charts with one group name do not line up: ${named}.`);
check(new Set(stacked).size > 1, `Charts under each other were still lined up: ${stacked}.`);

const perValue = (charts) => charts.flat().map(([value, tall]) => tall / Math.abs(value));
const spread = (list) => Math.max(...list) / Math.min(...list);
check(spread(perValue(scale)) < 1.02, `With a shared scale, a value is not the same height in each chart: ${perValue(scale).map((v) => v.toFixed(2))}.`);
check(spread(perValue(apart)) > 1.1, `Without a shared scale, the charts should keep their own scale: ${perValue(apart).map((v) => v.toFixed(2))}.`);
const zero = scale.map((chart) => Math.round(Math.max(...chart.filter(([value]) => value > 0).map(([, , bottom]) => bottom))));
check(new Set(zero).size === 1, `With a shared scale, the zero lines differ: ${zero}.`);

if (failures.length) {
	for (const failure of failures) console.error(`✗ ${failure}`);
	process.exit(1);
}
console.log("✓ Charts side by side in a group have rows of names of one height, per line of the page.");
