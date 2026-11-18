// A chart is only built from complete data: these checks run on the rows before the table is made.
import { type SourceRow, valuesOf } from "./rows";

// The number of value columns: from the header row the author wrote, else from the column names in the file, else from the first row.
const columnsOf = (rows: SourceRow[], series: string[], authored: HTMLTableElement | null): number => {
	const head = authored?.tHead?.rows[authored.tHead.rows.length - 1];
	const named = head ? head.cells.length - 1 - head.querySelectorAll("[data-note]").length : 0;
	if (named > 0) return named;
	if (series.length) return series.length;
	return valuesOf(rows[0]).length;
};

const isValue = (value: unknown): boolean => value === null || typeof value === "string" || typeof value === "number";

/** What is wrong with the rows, naming the row, or null if they make a complete table. */
export const checkRows = (rows: SourceRow[], series: string[], authored: HTMLTableElement | null): string | null => {
	if (!rows.length) return "it has no rows";
	const columns = columnsOf(rows, series, authored);

	for (const [index, row] of rows.entries()) {
		const place = `row ${index + 1}`;
		if (!row || typeof row !== "object") return `${place} is not a row with a label and a value`;
		if (!String(row.label ?? "").trim()) return `${place} has no name in "label"`;

		const values = valuesOf(row);
		if (values.length !== columns) return `${place} ("${row.label}") has ${values.length} values, where the columns ask for ${columns}`;

		// A value without a number, such as "n/a", is missing, as in a table; a list or an object is not a value.
		const wrong = values.findIndex((value) => !isValue(value));
		if (wrong >= 0) return `value ${wrong + 1} of ${place} ("${row.label}") is not a number, a text or null`;
	}

	return null;
};
