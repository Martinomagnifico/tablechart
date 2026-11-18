// The structures of a JSON file that Tablechart reads: a list of rows, names with values, or an object with `rows`.

export type Value = string | number | null;

export interface SourceRow {
	label: string;

	/** The name under the chart, where room is short, such as `"Nov ’21"` for `"November 2021"`. */
	short?: string;

	/** A note at this row, such as `"Share issue"`: a cell in a column with `data-note`. */
	note?: string;

	/** A string keeps its decimal places and the text around the number: `"1.0"`, `"71.8%"`. */
	value?: Value;
	values?: Value[];
	kind?: "total";
}

export interface SourceTable {
	rows: SourceRow[];
	series: string[];
	label: string;
	note?: string;
}

const isValue = (value: unknown): value is Value => value === null || typeof value === "string" || typeof value === "number";

// `{ "Spring": "58" }` or `{ "Elstar": ["118", "131"] }`: each name with its value or values.
const namedRows = (data: unknown): SourceRow[] | undefined => {
	if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
	const entries = Object.entries(data as Record<string, unknown>);
	const fits = entries.every(([, value]) => isValue(value) || (Array.isArray(value) && value.every(isValue)));
	if (!entries.length || !fits) return undefined;
	return entries.map(([label, value]) => (Array.isArray(value) ? { label, values: value as Value[] } : { label, value: value as Value }));
};

/** The rows, column names and corner label in a response, or null if it has none of the structures. */
export const rowsOf = (data: unknown): SourceTable | null => {
	const object = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;

	let rows: SourceRow[] | undefined;

	if (Array.isArray(data)) rows = data as SourceRow[];
	else if (object?.rows) rows = Array.isArray(object.rows) ? (object.rows as SourceRow[]) : namedRows(object.rows);
	else rows = namedRows(data);

	if (!Array.isArray(rows)) return null;

	return {
		rows,
		series: Array.isArray(object?.series) ? (object.series as unknown[]).map(String) : [],
		label: typeof object?.label === "string" ? object.label : "",
		note: typeof object?.note === "string" ? object.note : undefined,
	};
};

/** The values of a row: its list of values, or its one value. */
export const valuesOf = (row: SourceRow): unknown[] => row.values ?? [row.value ?? null];
