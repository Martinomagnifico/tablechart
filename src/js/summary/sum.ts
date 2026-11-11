import { decimalsIn } from "../kit";
import type { Cell } from "../types";

/** The sum of the values of a row, as the top of its stack; written with the most decimals of its parts. */
export const sumOf = (cells: Cell[]): Cell | undefined => {
	const known = cells.filter((cell) => !cell.missing);
	const widest = known.reduce((most, cell) => (decimalsIn(cell.number) > decimalsIn(most.number) ? cell : most), known[0] ?? cells[0]);
	if (!widest) return undefined;
	const value = known.reduce((total, cell) => total + cell.value, 0);
	return { ...widest, raw: "", number: value.toFixed(decimalsIn(widest.number)), missing: !known.length, value };
};

