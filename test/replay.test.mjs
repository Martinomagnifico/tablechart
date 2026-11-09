// `chart.replay()`: the chart goes back to its start and builds again, with its text fading in.
//
//   npm run test:replay                      test the current build (run npm run build first)
import { page, run } from "./browser.mjs";

const table = "<table><tbody><tr><th>A</th><td>41</td></tr><tr><th>B</th><td>52</td></tr></tbody></table>";
const body = `
<figure id="plain" data-chart="column">${table}</figure>
<figure id="still" data-chart="column" data-chart-animate="false">${table}</figure>
<figure id="steps" data-chart="column" data-fragment>${table}</figure>`;

const script = `
import { init } from "/tablechart.mjs";
await init({ threshold: 0 });
const figure = (id) => document.getElementById(id);
const frames = (n) => new Promise((ok) => { const step = () => (n-- ? requestAnimationFrame(step) : ok()); step(); });
const until = async (test) => { for (let i = 0; i < 600 && !test(); i++) await frames(1); return test(); };
const alpha = () => { const c = getComputedStyle(figure("plain").querySelector(".tablechart-value")).color; const m = c.match(/^rgba\\(.*,\\s*([0-9.]+)\\)$/) ?? c.match(/\\/\\s*([0-9.]+)\\)/); return m ? Number(m[1]) : 1; };
const built = () => figure("plain").classList.contains("is-built");
const before = await until(built);
figure("plain").tablechart.replay();
const hidden = !figure("plain").classList.contains("is-shown") && !built();
await frames(2);
const started = figure("plain").classList.contains("is-shown");
const low = alpha();
const rebuilt = await until(built);
const end = alpha();
const still = figure("still").className;
figure("still").tablechart.replay();
await frames(3);
const steps = figure("steps").tablechart;
steps.next();
await frames(2);
const stepped = steps.step;
steps.replay();
await frames(2);
window.done = { before, hidden, started, low, rebuilt, end, stillSame: figure("still").className === still, stepped, reset: steps.step };
`;

const result = await run(page(body, script), { port: 4614, cdpPort: 9614 });

const failures = [];
const check = (ok, text) => ok || failures.push(text);
check(result.before, "The chart did not finish its first build.");
check(result.hidden, "replay() did not take the chart back to its start.");
check(result.started, "replay() did not start the build.");
check(result.low < 0.5, `The numbers did not fade in again: they were at ${result.low} just after the start.`);
check(result.rebuilt && result.end === 1, "The chart did not finish building again.");
check(result.stillSame, "replay() changed a chart without animation.");
check(result.stepped > 0 && result.reset === 0, `A chart with steps did not go back to its first step: ${result.stepped} to ${result.reset}.`);

if (failures.length) {
	for (const failure of failures) console.error(`✗ ${failure}`);
	process.exit(1);
}
console.log("✓ replay() takes a chart back and builds it again, with its text fading in.");
