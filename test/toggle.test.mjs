// A legend with toggles: a press turns a series off and on, the scale fits what is left, and the last series stays on.
//
//   npm run test:toggle                      test the current build (run npm run build first)
import { page, run } from "./browser.mjs";

const rows = [["Jan", 67, 30, 120], ["Feb", 56, 35, 140], ["Mar", 53, 32, 180]];
const table = `<table><thead><tr><th>Month</th><th>Rain</th><th>Sun</th><th>Visitors</th></tr></thead><tbody>${rows
	.map((row) => `<tr><th>${row[0]}</th><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td></tr>`)
	.join("")}</tbody></table>`;
const body = `
<figure id="line" data-chart="line" data-chart-axis data-chart-legend="toggle">${table}</figure>
<figure id="grouped" data-chart="column" data-chart-legend="toggle">${table}</figure>
<figure id="plain" data-chart="column">${table}</figure>`;

const script = `
import { init } from "/tablechart.mjs";
await init({ threshold: 0 });
const figure = (id) => document.getElementById(id);
// Long enough for the marks to move and the copies of what is gone to fade out.
const settle = () => new Promise((ok) => setTimeout(ok, 800));
const frames = (n) => new Promise((ok) => { const step = () => (n-- ? requestAnimationFrame(step) : ok()); step(); });
const until = async (test) => { for (let i = 0; i < 600 && !test(); i++) await frames(1); return test(); };
const name = (id, s) => figure(id).querySelector('.tablechart-name[data-series="' + s + '"]');
const top = (id) => Math.max(...[...figure(id).querySelectorAll(".tablechart-tick")].map((tick) => Number(tick.dataset.value)));
await until(() => figure("line").classList.contains("is-built") && figure("grouped").classList.contains("is-built"));
const before = top("line");
name("line", 3).click();
await settle();
const after = top("line");
const pressed = name("line", 3).getAttribute("aria-pressed");
const offLabels = [...figure("line").querySelectorAll('.tablechart-value[data-series="3"]')].every((label) => label.dataset.place === "none");
const focused = document.activeElement === name("line", 3);
const shown = figure("line").classList.contains("is-shown");
name("line", 1).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await frames(2);
name("line", 2).click();
await frames(2);
const lastStays = name("line", 2).getAttribute("aria-pressed");
name("grouped", 1).click();
await settle();
const groupBars = new Set([...figure("grouped").querySelectorAll(".tablechart-bar")].map((bar) => bar.getAttribute("data-series"))).size;
const plainButtons = figure("plain").querySelectorAll('[role="button"]').length;
window.done = { before, after, pressed, offLabels, focused, shown, keyed: name("line", 1).getAttribute("aria-pressed"), lastStays, groupBars, plainButtons };
`;

const result = await run(page(body, script), { port: 4615, cdpPort: 9615 });

const failures = [];
const check = (ok, text) => ok || failures.push(text);
check(result.before >= 120 && result.after < 120, `The scale did not fit what is left: its top went from ${result.before} to ${result.after}.`);
check(result.pressed === "false", "A pressed name did not say that its series is off.");
check(result.offLabels, "A series that is off still shows numbers.");
check(result.focused, "The focus did not go back to the name that was pressed.");
check(result.shown, "The chart did not stay shown after a toggle.");
check(result.keyed === "false", "Enter on a name did not turn its series off.");
check(result.lastStays === "true", "The last series that is on could be turned off.");
check(result.groupBars === 2, `A group did not close up: it has bars of ${result.groupBars} series.`);
check(result.plainButtons === 0, 'A chart without data-chart-legend="toggle" has toggles.');

if (failures.length) {
	for (const failure of failures) console.error(`✗ ${failure}`);
	process.exit(1);
}
console.log("✓ A legend with toggles turns series off and on, the scale fits what is left, and the last series stays on.");
