import "../style/tablechart.scss";

import { type Config, defaultConfig, PLUGIN_ID } from "./config";
import { build, layout, relabel, setShown, unbuild } from "./core";
import { debug } from "./functions/debug";
import { assignKeys } from "./functions/read-table";
import { adoptTables, loadSources, readMarkdownRows } from "./functions/sources";
import type { ChartState } from "./types";

/** One chart, as `create` returns it and as `figure.tablechart` holds it. */
export interface TablechartChart {
	/** The element that holds the chart. */
	figure: HTMLElement;
	/** Lays the chart out again, for example after a script has changed its text. */
	refresh(): void;
	/** Stops watching scroll, size and language. The chart stays as it is. */
	destroy(): void;
}

/** What `init` returns: the charts it made, and a way to act on all of them. */
export interface TablechartInstance {
	charts: TablechartChart[];
	/** Lays out every chart again, for example after a script has changed its text. */
	refresh(): void;
	/** Stops watching scroll, size and language. The charts stay as they are. */
	destroy(): void;
}

declare global {
	interface HTMLElement {
		/** The chart made of this element, by `init` or `create`. */
		tablechart?: TablechartChart;
	}
}

// Marks a figure that has been made into a chart, so a second `init` skips it.
const MADE = "data-chart-made";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * If the chart is inside something that animates in, such as a panel with a CSS
 * animation, this resolves when that animation is halfway, so the chart builds in
 * a panel that can already be seen. Every element from the chart up to the body
 * counts, and the chart itself, but only for a CSS animation: its own fade is a
 * transition. A frame first, so a script that starts the animation on the same
 * event has done so. Without an animation, or with reduced motion, it resolves at
 * once.
 */
const entrance = async (figure: HTMLElement): Promise<void> => {
	if (reduced()) return;
	await new Promise(requestAnimationFrame);
	const animations: Animation[] = figure
		.getAnimations()
		.filter((animation) => animation instanceof CSSAnimation);
	for (
		let parent = figure.parentElement;
		parent && parent !== document.body;
		parent = parent.parentElement
	) {
		animations.push(...parent.getAnimations());
	}
	let left = 0;
	for (const animation of animations) {
		const timing = animation.effect?.getComputedTiming();
		const duration = Number(timing?.activeDuration ?? 0);
		if (!timing || !Number.isFinite(duration)) continue;
		const half = Number(timing.delay ?? 0) + duration / 2;
		left = Math.max(left, half - Number(animation.currentTime ?? 0));
	}
	if (left > 0) await wait(left);
};

/**
 * The element around the chart that cannot be seen yet, with an opacity of 0, or
 * null. Such an element usually animates in later, when its own script says so.
 */
const hiddenAround = (figure: HTMLElement): HTMLElement | null => {
	for (let element: HTMLElement | null = figure; element && element !== document.body; element = element.parentElement) {
		if (getComputedStyle(element).opacity === "0") return element;
	}
	return null;
};

/**
 * Resolves when the element starts an animation or a transition, so `entrance`
 * can then wait for it to be halfway. Also when a class or style makes it visible
 * without an animation.
 */
const startOf = (element: HTMLElement): Promise<void> =>
	new Promise((resolve) => {
		const events = ["animationstart", "transitionrun"];
		const done = () => {
			for (const name of events) document.removeEventListener(name, started, true);
			changes.disconnect();
			resolve();
		};
		const started = (event: Event) => {
			if (event.target instanceof Node && event.target.contains(element)) done();
		};
		const changes = new MutationObserver(() => {
			if (getComputedStyle(element).opacity !== "0") done();
		});
		for (const name of events) document.addEventListener(name, started, true);
		changes.observe(element, { attributes: true, attributeFilter: ["class", "style"] });
	});

// Every chart that is watching the language of the page. One watcher serves them all.
const speakers = new Set<{ relabel(): void; refresh(): void }>();
let language: MutationObserver | null = null;

const listen = (chart: { relabel(): void; refresh(): void }): void => {
	speakers.add(chart);
	if (language) return;
	// Numbers follow the language of the document without the chart being rebuilt.
	// The text may now be longer or shorter, so the charts are laid out again, a
	// frame later, after a translation script has had its turn.
	language = new MutationObserver(() => {
		for (const one of speakers) one.relabel();
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				for (const one of speakers) one.refresh();
			})
		);
	});
	language.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
};

const unlisten = (chart: { relabel(): void; refresh(): void }): void => {
	speakers.delete(chart);
	if (speakers.size || !language) return;
	language.disconnect();
	language = null;
};

// A column chart and a bar chart have the same data, so one can be shown as the
// other. `--tablechart-type` on the figure says which, for example in a container
// query for a narrow chart.
const SWITCHABLE = ["column", "bar"];

const kindFor = (figure: HTMLElement): string | null => {
	const own = figure.getAttribute("data-chart") || "column";
	if (!SWITCHABLE.includes(own)) return null;
	const asked = getComputedStyle(figure).getPropertyValue("--tablechart-type").trim();
	return SWITCHABLE.includes(asked) ? asked : own;
};

/**
 * Watches one built chart: lays it out whenever it has a width and that width
 * changes, and shows it when it scrolls into view.
 */
const watch = (first: ChartState, config: Config): TablechartChart => {
	let state = first;
	let kind = kindFor(state.figure);
	// The width the chart was last laid out at. Without one, it has not been laid
	// out yet and cannot be shown.
	let placed: number | null = null;
	let inView = false;
	let waiting = false;

	const show = async (): Promise<void> => {
		if (!config.animate) return setShown(state, true);
		const shown = state.figure.classList.contains("is-shown");
		if (inView && placed !== null && !shown && !waiting) {
			waiting = true;
			// Something around the chart cannot be seen yet: wait until it starts to
			// animate in, and then until it is halfway.
			const hidden = reduced() ? null : hiddenAround(state.figure);
			if (hidden) await startOf(hidden);
			await entrance(state.figure);
			waiting = false;
			// It may have scrolled out again while waiting.
			if (inView || !config.replay) setShown(state, true);
		} else if (!inView && config.replay && shown) {
			setShown(state, false);
		}
	};

	// If `--tablechart-type` asks for the other kind, the chart is built again as
	// that kind. A chart that has been shown stays shown, without animating again.
	const switchKind = (): void => {
		const wanted = kindFor(state.figure);
		if (!wanted || wanted === kind) return;
		const next = build(state.figure, config, wanted);
		if (!next) return;
		unbuild(state);
		state = next;
		kind = wanted;
		placed = null;
	};

	// Pass 3, whenever the chart has a width, and again when the width changes.
	const place = (): void => {
		switchKind();
		const width = state.plot.clientWidth;
		if (!width || width === placed) return;
		if (!layout(state, config)) return;
		placed = width;
		void show();
	};

	let queued = false;
	const resizer = new ResizeObserver(() => {
		if (queued) return;
		queued = true;
		requestAnimationFrame(() => {
			queued = false;
			place();
		});
	});

	const scroll = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				inView = entry.isIntersecting;
				void show();
			}
		},
		{ threshold: config.threshold }
	);

	// On paper the chart is shown whole.
	const print = () => setShown(state, true);

	const refresh = () => {
		placed = null;
		place();
	};
	const speaker = { relabel: () => relabel(state, config), refresh };
	// Before the first layout, so a chart that starts narrow is built as the right
	// kind straight away.
	switchKind();

	place();
	resizer.observe(state.figure);
	scroll.observe(state.figure);
	window.addEventListener("beforeprint", print);
	listen(speaker);

	const chart: TablechartChart = {
		figure: state.figure,
		refresh,
		destroy() {
			resizer.disconnect();
			scroll.disconnect();
			window.removeEventListener("beforeprint", print);
			unlisten(speaker);
			if (state.figure.tablechart === chart) delete state.figure.tablechart;
		},
	};
	state.figure.tablechart = chart;
	return chart;
};

/**
 * Turns elements into figures with a table, ready to build: a table from Markdown
 * is wrapped, a JSON file becomes a table, and translation keys are added. All at
 * once, so two charts with the same `data-chart-keys` are found.
 */
export const prepare = async (found: HTMLElement[], config: Config): Promise<HTMLElement[]> => {
	const figures = adoptTables(found.filter((element) => !element.hasAttribute(MADE)));
	await loadSources(figures);
	readMarkdownRows(figures);
	assignKeys(figures, config.langattribute);
	return figures;
};

// Pass 1 and 2: every label, before anything is laid out.
const make = (figure: HTMLElement, config: Config): TablechartChart | null => {
	const state = build(figure, config);
	if (!state) return null;
	figure.setAttribute(MADE, "");
	return watch(state, config);
};

/**
 * Makes a chart of one element, and builds it when it scrolls into view. Returns
 * the chart, or null if the element has no data to draw. If the element is
 * already a chart, returns that chart.
 *
 * ```js
 * import { create } from "@martinomagnifico/tablechart";
 *
 * const chart = await create(document.querySelector("#sales"), { threshold: 0.3 });
 * ```
 */
export const create = async (
	element: HTMLElement,
	options: Partial<Config> = {}
): Promise<TablechartChart | null> => {
	if (element.tablechart) return element.tablechart;
	const config: Config = { ...defaultConfig, ...options };
	if (config.debug) debug.enabled = true;
	const [figure] = await prepare([element], config);
	return figure ? make(figure, config) : null;
};

/**
 * Makes charts of every element in `root` that matches the selector, and builds
 * each one when it scrolls into view. An element that is already a chart is
 * skipped.
 *
 * ```js
 * import { init } from "@martinomagnifico/tablechart";
 * import "@martinomagnifico/tablechart/style.css";
 *
 * init({ threshold: 0.5 });
 * ```
 */
export const init = async (
	options: Partial<Config> = {},
	root: ParentNode = document
): Promise<TablechartInstance> => {
	const config: Config = { ...defaultConfig, ...options };
	if (config.debug) debug.enabled = true;

	const figures = await prepare(Array.from(root.querySelectorAll<HTMLElement>(config.selector)), config);
	const charts = figures
		.map((figure) => make(figure, config))
		.filter((chart): chart is TablechartChart => chart !== null);
	debug.log(`Made ${charts.length} chart(s).`);

	return {
		charts,
		refresh: () => {
			for (const chart of charts) chart.refresh();
		},
		destroy: () => {
			for (const chart of charts) chart.destroy();
		},
	};
};

export { PLUGIN_ID };
