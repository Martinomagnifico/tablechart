// The table made from the rows of a JSON file or a transform.
import { type SourceRow, valuesOf } from "./rows";

// The header row of a new table, from the column names in the file, if it has them.
const headFrom = (table: HTMLTableElement, series: string[], label: string): void => {
	const head = table.createTHead().insertRow();
	const corner = document.createElement("th");
	corner.textContent = label;
	head.append(corner);
	for (const name of series) {
		const th = document.createElement("th");
		th.textContent = name;
		head.append(th);
	}
};

// The notes are a column of their own, after the values, with a header that says so; one the author wrote is kept.
const noteHead = (table: HTMLTableElement, rows: SourceRow[], noteName: string): void => {
	const head = table.tHead?.rows[table.tHead.rows.length - 1];
	if (!head || head.querySelector("[data-note]")) return;
	const values = Math.max(...rows.map((row) => valuesOf(row).length));
	while (head.cells.length < values + 1) head.append(document.createElement("th"));
	const th = document.createElement("th");
	th.dataset.note = "";
	th.textContent = noteName;
	head.append(th);
};

/** An author's header row is kept; otherwise the file's names make one, if it has them. */
export const tableFrom = (rows: SourceRow[], series: string[], label: string, table = document.createElement("table"), noteName = "Note"): HTMLTableElement => {
	for (const old of table.querySelectorAll(":scope > tbody, :scope > tfoot, :scope > tr")) old.remove();
	const noted = rows.some((row) => row.note);
	if (!table.tHead && (series.length || label || noted)) headFrom(table, series, label);

	const body = document.createElement("tbody");
	table.append(body);
	for (const row of rows) {
		const tr = body.insertRow();
		if (row.kind === "total") tr.dataset.kind = "total";
		const th = document.createElement("th");
		th.textContent = String(row.label ?? "");
		if (row.short) th.dataset.short = row.short;
		tr.append(th);
		for (const value of valuesOf(row)) tr.insertCell().textContent = value === null ? "" : String(value);
		if (noted) tr.insertCell().textContent = row.note ?? "";
	}

	if (noted) noteHead(table, rows, noteName);
	return table;
};
