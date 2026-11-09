// The sums behind the scale of a chart, without a browser.
//
//   npm run test:scale
import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({ configFile: false, logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
const { along, reachOf, squeezeOf } = await vite.ssrLoadModule("/src/js/scale/scale.ts");
const bar = (value) => ({ kind: "bar", from: 0, to: value, value });
const step = (from, to) => ({ kind: to > from ? "up" : "down", from, to, value: to - from });
const ask = (more) => ({ from: null, to: null, size: null, ceiling: 100, extent: 98, depth: 0, breakable: true, segments: [], ...more });

const tests = {
	"values above zero": () => assert.deepEqual(reachOf([bar(10), bar(40)], [10, 40], null), { extent: 40, depth: 0, steps: false }),
	"values below zero": () => assert.deepEqual(reachOf([bar(-20), bar(5)], [-20, 5], null), { extent: 5, depth: -20, steps: false }),
	"only values below zero reach no higher than zero": () => assert.equal(reachOf([bar(-20)], [-20], null).extent, 0),
	"a stack reaches its own top and bottom": () => assert.deepEqual(reachOf([bar(9)], [4, 5], [{ top: 9, bottom: -2 }]), { extent: 9, depth: -2, steps: false }),
	"a waterfall reaches where its steps are": () => assert.deepEqual(reachOf([step(100, 120), step(120, 90)], [20, -30], null).depth, 0),
	"a waterfall is marked as steps": () => assert.equal(reachOf([step(10, 20)], [10], null).steps, true),
	"no break is asked for": () => assert.deepEqual(squeezeOf(ask()), { squeeze: null, problems: [] }),
	"a break from and to": () => assert.deepEqual(squeezeOf(ask({ from: 10, to: 90 })).squeeze, { lo: 10, hi: 90, gap: 50, share: 0.3 }),
	"a break with only a start goes to the top": () => assert.deepEqual(squeezeOf(ask({ from: 10 })).squeeze, { lo: 10, hi: 100, gap: 10, share: 0.22 }),
	"data-size sets the share": () => assert.equal(squeezeOf(ask({ from: 10, to: 90, size: "40%" })).squeeze.share, 0.4),
	"data-size stays between 5% and 80%": () => {
		assert.equal(squeezeOf(ask({ from: 10, to: 90, size: "1%" })).squeeze.share, 0.05);
		assert.equal(squeezeOf(ask({ from: 10, to: 90, size: "95%" })).squeeze.share, 0.8);
	},
	"a wrong data-size warns and uses the default": () => {
		const { squeeze, problems } = squeezeOf(ask({ from: 10, to: 90, size: "big" }));
		assert.equal(squeeze.share, 0.3);
		assert.match(problems[0], /not a percentage/);
	},
	"a chart that cannot break": () => assert.match(squeezeOf(ask({ from: 10, breakable: false })).problems[0], /cannot break/),
	"no break below zero": () => assert.match(squeezeOf(ask({ from: 10, depth: -5 })).problems[0], /below zero/),
	"a break that does not fit": () => {
		for (const range of [{ from: 90, to: 10 }, { from: -5, to: 20 }, { from: 10, to: 120 }, { from: 0, to: 100 }]) assert.equal(squeezeOf(ask(range)).squeeze, null);
	},
	"a break through a floating step": () => assert.match(squeezeOf(ask({ from: 10, to: 50, segments: [step(20, 30)] })).problems[0], /floats/),
	"a break beside a floating step is fine": () => assert.ok(squeezeOf(ask({ from: 10, to: 50, segments: [step(60, 70)] })).squeeze),
	"without a break, a value is a share of the length": () => assert.equal(along(25, 100, 400, null, 0), 100),
	"with a break, the scale still ends at the full length": () => {
		const squeeze = { lo: 10, hi: 90, gap: 50, share: 0.3 };
		assert.equal(along(0, 100, 400, squeeze, 8), 0);
		assert.ok(Math.abs(along(100, 100, 400, squeeze, 8) - 400) < 1e-9);
	},
	"with a break, values go up all along": () => {
		const squeeze = { lo: 10, hi: 90, gap: 50, share: 0.3 };
		const points = [0, 5, 10, 30, 50, 70, 90, 95, 100].map((value) => along(value, 100, 400, squeeze, 8));
		points.forEach((point, k) => assert.ok(!k || point > points[k - 1], `not rising at step ${k}`));
	},
};

let failed = 0;
for (const [name, test] of Object.entries(tests)) {
	try {
		test();
	} catch (error) {
		failed += 1;
		console.error(`✗ ${name}: ${error.message.split("\n")[0]}`);
	}
}
await vite.close();
if (failed) process.exit(1);
console.log(`✓ ${Object.keys(tests).length} sums of the scale are right.`);
