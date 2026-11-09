// `chart.replay()` and `chart.reset()`: the chart goes back to its start and builds again; a chart that builds once stops watching the scroll.
//
//   npm run test:replay                      test the current build (run npm run build first)
import { page, run } from "./browser.mjs";

const table = "<table><tbody><tr><th>A</th><td>41</td></tr><tr><th>B</th><td>52</td></tr></tbody></table>";
const body = `
<figure id="plain" data-chart="column">${table}</figure>
<figure id="still" data-chart="column" data-chart-animate="false">${table}</figure>
<figure id="steps" data-chart="column" data-fragment>${table}</figure>
<div style="height: 3000px"></div>
<figure id="below" data-chart="column">${table}</figure>
<div style="height: 3000px"></div>
<figure id="again" data-chart="column">${table}</figure>`;

const script = `
import { init } from "/tablechart.mjs";
const watching = new Set();
const Native = window.IntersectionObserver;
window.IntersectionObserver = class extends Native {
	observe(target) { watching.add(target.id); super.observe(target); }
	unobserve(target) { watching.delete(target.id); super.unobserve(target); }
};
await init({ threshold: 0, selector: "figure:not(#again)" });
await init({ threshold: 0, replay: true, selector: "#again" });
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
const below = figure("below");
const hiddenAtFirst = !below.classList.contains("is-shown");
below.scrollIntoView();
const scrolled = await until(() => below.classList.contains("is-built"));
await frames(3);
const stoppedWatching = !watching.has("below") && !watching.has("plain");
const replayKeepsWatching = watching.has("again");
window.scrollTo(0, 0);
await frames(3);
below.tablechart.reset();
await frames(3);
const resetHidden = !below.classList.contains("is-shown") && watching.has("below");
below.scrollIntoView();
const rebuilt2 = await until(() => below.classList.contains("is-built"));
window.done = { hiddenAtFirst, scrolled, stoppedWatching, replayKeepsWatching, resetHidden, rebuilt2, before, hidden, started, low, rebuilt, end, stillSame: figure("still").className === still, stepped, reset: steps.step };
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

check(result.hiddenAtFirst && result.scrolled, "A chart below the fold did not wait for the scroll.");
check(result.stoppedWatching, "A chart that built once still watches the scroll.");
check(result.replayKeepsWatching, "A chart with replay stopped watching the scroll.");
check(result.resetHidden, "reset() did not take the chart back and watch the scroll again.");
check(result.rebuilt2, "After reset(), the chart did not build when scrolled to.");

if (failures.length) {
	for (const failure of failures) console.error(`✗ ${failure}`);
	process.exit(1);
}
console.log("✓ replay() and reset() build a chart again, and a chart that built once stops watching the scroll.");
