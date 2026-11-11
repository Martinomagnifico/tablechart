/** The table of a chart: the first one that is not in its summary, as a summary can have a table of its own. */
export const tableOf = (figure: Element): HTMLTableElement | null =>
	Array.from(figure.querySelectorAll("table")).find((table) => !table.closest(".chart-summary")) ?? null;
