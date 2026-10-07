import "../style/tablechart.scss";

import { type Config, defaultConfig, PLUGIN_ID } from "./config";
import { build, layout, relabel, setShown, unbuild } from "./core";
import { debug } from "./functions/debug";
import { assignKeys } from "./functions/read-table";
import { adoptTables, loadSources, readMarkdownRows } from "./functions/sources";
import type { ChartState } from "./types";

export interface TablechartChart {
	figure: HTMLElement;
	/** Lays the chart out again, for example after a script has changed its text. */
	refresh(): void;
	/** Stops watching scroll, size and language. The chart stays as it is. */
	destroy(): void;
}

export interface TablechartInstance {
	charts: TablechartChart[];
	/** Lays out every chart again, for example after a script has changed its text. */
	refresh(): void;
	/** Stops watching scroll, size and language. The charts stay as they are. */
	destroy(): void;
}

declare global {
	interface HTMLElement {
		tablechart?: TablechartChart;
	}
}

const MADE = "data-chart-made";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How far an animated parent is in before the chart builds: the figure's `data-chart-entrance`, or else the option. */
export const entranceOf = (figure: HTMLElement, config: Config): number => {
	const own = Number.parseFloat(figure.dataset.chartEntrance ?? "");
	const share = Number.isFinite(own) ? own : config.entrance;
	return Math.min(Math.max(share, 0), 1);
};

/** Resolves when an animation around the chart is far enough in, by default halfway, so it builds in a panel that can already be seen. */
const entrance = async (figure: HTMLElement, share: number): Promise<void> => {
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
		const moment = Number(timing.delay ?? 0) + duration * share;
		left = Math.max(left, moment - Number(animation.currentTime ?? 0));
	}
	if (left > 0) await wait(left);
};

/** The element around the chart with an opacity of 0, which usually animates in later. */
const hiddenAround = (figure: HTMLElement): HTMLElement | null => {
	for (let element: HTMLElement | null = figure; element && element !== document.body; element = element.parentElement) {
		if (getComputedStyle(element).opacity === "0") return element;
	}
	return null;
};

/** Resolves when the element starts an animation or transition, or becomes visible without one. */
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

const speakers = new Set<{ relabel(): void; refresh(): void }>();
let language: MutationObserver | null = null;

const listen = (chart: { relabel(): void; refresh(): void }): void => {
	speakers.add(chart);
	if (language) return;
	// A language change reformats the numbers, then lays out again after a translation script has run.
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

// `--tablechart-type` switches a column chart to a bar chart and back, for example in a container query.
const SWITCHABLE = ["column", "bar"];

const kindFor = (figure: HTMLElement): string | null => {
	const own = figure.getAttribute("data-chart") || "column";
	if (!SWITCHABLE.includes(own)) return null;
	const asked = getComputedStyle(figure).getPropertyValue("--tablechart-type").trim();
	return SWITCHABLE.includes(asked) ? asked : own;
};

const watch = (first: ChartState, config: Config): TablechartChart => {
	let state = first;
	let kind = kindFor(state.figure);
	// The width it was last laid out at; null until it is laid out.
	let placed: number | null = null;
	let inView = false;
	let waiting = false;

	const show = async (): Promise<void> => {
		if (!config.animate) return setShown(state, true);
		const shown = state.figure.classList.contains("is-shown");
		if (inView && placed !== null && !shown && !waiting) {
			waiting = true;
			const hidden = reduced() ? null : hiddenAround(state.figure);
			if (hidden) await startOf(hidden);
			await entrance(state.figure, entranceOf(state.figure, config));
			waiting = false;
			if (inView || !config.replay) setShown(state, true);
		} else if (!inView && config.replay && shown) {
			setShown(state, false);
		}
	};

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

	const print = () => setShown(state, true);

	const refresh = () => {
		placed = null;
		place();
	};
	const speaker = { relabel: () => relabel(state, config), refresh };
	// Before the first layout, so a chart that starts narrow is the right kind straight away.
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

/** Turns elements into figures with a table and translation keys, all at once, so duplicate keys are found. */
export const prepare = async (found: HTMLElement[], config: Config): Promise<HTMLElement[]> => {
	const figures = adoptTables(found.filter((element) => !element.hasAttribute(MADE)));
	await loadSources(figures);
	readMarkdownRows(figures);
	assignKeys(figures, config.langattribute);
	return figures;
};

const make = (figure: HTMLElement, config: Config): TablechartChart | null => {
	const state = build(figure, config);
	if (!state) return null;
	figure.setAttribute(MADE, "");
	return watch(state, config);
};

/** Makes a chart of one element; returns the existing chart if there is one, or null without data. */
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

/** Makes a chart of every element in `root` that matches the selector, skipping existing charts. */
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
