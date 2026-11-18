// A legend with toggles: a click, Enter or Space on a name turns its series off or on again.
import { NAME_CLASS } from "../config";

/** The series that are off after series `series` is pressed, or null if it is the last one on, which stays on. */
export const toggled = (off: ReadonlySet<number>, series: number, count: number): Set<number> | null => {
	const next = new Set(off);

	if (next.has(series)) next.delete(series);
	else next.add(series);

	return next.size < count ? next : null;
};

const nameOf = (event: Event): HTMLElement | null => {
	const target = event.target as Element | null;
	return target?.closest?.<HTMLElement>(`.${NAME_CLASS}[role="button"]`) ?? null;
};

const seriesOf = (name: HTMLElement): number => Number(name.dataset.series) - 1;

/** Listens for presses on the names; the function it returns stops listening. */
export const listenToLegend = (figure: HTMLElement, press: (series: number) => void): (() => void) => {
	const click = (event: MouseEvent) => {
		const name = nameOf(event);
		if (name && figure.contains(name)) press(seriesOf(name));
	};

	const key = (event: KeyboardEvent) => {
		const name = nameOf(event);
		if (!name || (event.key !== "Enter" && event.key !== " ")) return;
		event.preventDefault();
		press(seriesOf(name));
	};

	figure.addEventListener("click", click);
	figure.addEventListener("keydown", key);

	return () => {
		figure.removeEventListener("click", click);
		figure.removeEventListener("keydown", key);
	};
};

/** The legend is made again, so the focus goes to the new name of the series that was pressed. */
export const focusName = (figure: HTMLElement, series: number): void => {
	figure.querySelector<HTMLElement>(`.${NAME_CLASS}[role="button"][data-series="${series + 1}"]`)?.focus();
};
