import { scaleOf, trendOf } from "../scale/trend";
import { decimalsIn, readSeries, readTable, splitSign } from "../kit";
import type { Cell, Row } from "../types";
import { type Item, ORDERED, type Result, type Results, type SummaryConfig, type Value } from "./config";
import { groupsOf } from "./groups";
import { rankOf } from "./rank";
import { sumOf } from "./sum";

/** The values one series gives, by analysis. `s` is -1 for the totals of the rows, with `data-series="total"`. */
export const analyse = (figure: HTMLElement, s: number, config: SummaryConfig, locale: string | undefined): Results => {
	const table = readTable(figure, config.langattribute);
	const series = readSeries(figure, table.filter((row) => !row.isTotal), config.langattribute);
	const totals = s < 0;
	const rows = table
		.filter((row) => !row.isTotal)
		.map((row) => (totals ? { ...row, cells: [sumOf(row.cells.slice(0, series.length))].filter((cell): cell is Cell => !!cell) } : row));
	const col = totals ? 0 : s;
	const one = totals ? undefined : series[s];
	const keyed = (text: string, key: string | null): Value => {
		if (!key || !config.langattribute) return text;
		const span = document.createElement("span");
		span.setAttribute(config.langattribute, key);
		span.textContent = text;
		return span;
	};
	// As the chart writes them: the decimals of the column, and the text around the number of the cell.
	const places = Math.max(0, ...rows.map((row) => decimalsIn(row.cells[col]?.number ?? "")));
	const number = (value: number, like: Cell, decimals = places): string => {
		const [sign, rest] = splitSign(value, decimals, locale);
		return like.prefix + sign + rest + like.suffix;
	};
	const percent = (value: number): string =>
		new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0 }).format(value / 100);
	const name = (row: Row) => keyed(row.label, row.key);

	const caption = figure.querySelector(":scope > figcaption");
	const titleNode = caption?.querySelector("b, strong") ?? caption;
	const chart: Result = {
		values: {
			title: keyed((titleNode?.textContent ?? "").trim(), (config.langattribute && titleNode?.getAttribute(config.langattribute)) || null),
			rows: splitSign(rows.length, 0, locale).join(""),
			series: one ? keyed(one.name, one.key) : "",
		},
		counts: { rows: rows.length },
	};

	const points = rows.flatMap((row, x) => {
		const cell = row.cells[col];
		return cell && !cell.missing ? [{ row, cell, x, y: cell.value }] : [];
	});
	chart.values.values = splitSign(points.length, 0, locale).join("");
	(chart.counts as Record<string, number>).values = points.length;

	// Where a value is among all values, such as the 4th highest of 640, for an item of a list.
	const place = rankOf(points.map((point) => point.y));
	const ranked = (value: number): Item => {
		const { high, low } = place(value);
		return { values: { rank: splitSign(high, 0, locale).join(""), "rank.low": splitSign(low, 0, locale).join("") }, counts: { rank: high, "rank.low": low } };
	};
	const item = (values: Record<string, Value>, value?: number): Item => {
		if (value === undefined) return { values };
		const rank = ranked(value);
		return { values: { ...values, ...rank.values }, counts: rank.counts };
	};

	// Each row with a note, from a column with `data-note`, for a list with `data-each="notes"`.
	const noted = rows.filter((row) => row.note);
	const notes: Result | null = noted.length
		? {
				values: { "notes.count": splitSign(noted.length, 0, locale).join("") },
				counts: { "notes.count": noted.length },
				items: noted.map((row) => {
					const cell = row.cells[col];
					const known = cell && !cell.missing ? cell : undefined;
					const values: Record<string, Value> = { name: name(row), note: keyed(row.note ?? "", row.noteKey) };
					if (known) values.value = number(known.value, known);
					return item(values, known?.value);
				}),
			}
		: null;
	if (!points.length) return { chart, notes, extremes: null, range: null, change: null, trend: null, outliers: null, groups: null };

	// On a tie, the first row counts.
	let high = points[0];
	let low = points[0];
	for (const point of points) {
		if (point.y > high.y) high = point;
		if (point.y < low.y) low = point;
	}
	const extremes: Result = {
		values: {
			"highest.name": name(high.row),
			"highest.value": number(high.y, high.cell),
			"lowest.name": name(low.row),
			"lowest.value": number(low.y, low.cell),
		},
	};
	// A share of the whole: of the total row if the table has one, or of the sum. Only for values that are all zero or more.
	const given = totals ? undefined : table.find((row) => row.isTotal)?.cells[col];
	const whole = given && !given.missing ? given.value : points.reduce((sum, point) => sum + point.y, 0);
	extremes.values.total = number(whole, high.cell);
	if (whole > 0 && points.every((point) => point.y >= 0)) {
		extremes.values["highest.share"] = percent((high.y / whole) * 100);
		extremes.values["lowest.share"] = percent((low.y / whole) * 100);
	}
	const range: Result = {
		values: {
			"range.from": number(low.y, low.cell),
			"range.to": number(high.y, high.cell),
			"range.difference": number(high.y - low.y, high.cell),
		},
	};

	// Change, trend and outliers need rows in order, such as months.
	const kind = figure.getAttribute("data-chart") || "column";
	if (!ORDERED.includes(kind) && !figure.hasAttribute("data-chart-ordered")) return { chart, notes, extremes, range };
	if (points.length < 2) return { chart, notes, extremes, range, change: null, trend: null, outliers: null, groups: null };

	// An overview of a long table: the rows in groups, each with its lowest, average and highest value.
	const groups: Result = {
		values: {},
		items: groupsOf(points, config.groups).map((group) => {
			const ys = group.map((point) => point.y);
			const like = group[0].cell;
			return {
				values: {
					from: name(group[0].row),
					to: name(group[group.length - 1].row),
					lowest: number(Math.min(...ys), like),
					average: number(ys.reduce((sum, y) => sum + y, 0) / ys.length, like),
					highest: number(Math.max(...ys), like),
				},
			};
		}),
	};

	// Around zero, such as profit and loss, a percentage is of the range of the data, not of the values.
	const { share } = scaleOf(points);
	const outcome = (part: number): "up" | "down" | "flat" => (Math.abs(part) < config.flat ? "flat" : part > 0 ? "up" : "down");

	const first = points[0];
	const last = points[points.length - 1];
	const moved = share(last.y - first.y, first.y);
	const change: Result = {
		values: {
			"first.name": name(first.row),
			"first.value": number(first.y, first.cell),
			"last.name": name(last.row),
			"last.value": number(last.y, last.cell),
			"change.difference": number(Math.abs(last.y - first.y), last.cell),
			"change.percent": percent(Math.abs(moved)),
			change: config.words[outcome(moved)],
		},
		when: outcome(moved),
	};

	// A trend needs four values.
	const found = trendOf(points, config.flat, config.outliers);
	if (!found) return { chart, notes, extremes, range, change, groups, trend: null, outliers: null };
	const { course, line, outside } = found;
	// The percentage that a sentence says is of where the line starts, as "went up by" reads.
	const trend: Result = {
		values: {
			trend: config.words[course],
			"trend.percent": percent(Math.abs(share(line(last.x) - line(first.x), line(first.x)))),
			"trend.from": number(line(first.x), first.cell),
			"trend.to": number(line(last.x), last.cell),
			// What "flat" and "far from the trend" mean, so a sentence can say so.
			"flat.percent": percent(config.flat),
			"outliers.percent": percent(config.outliers),
		},
		when: course,
	};
	if (course === "unclear") return { chart, notes, extremes, range, change, groups, trend };
	const outliers: Result | null = outside.length
		? {
				values: { "outliers.count": splitSign(outside.length, 0, locale).join("") },
				counts: { "outliers.count": outside.length },
				items: outside.map((p) =>
					item(
						{
							name: name(p.row),
							value: number(p.y, p.cell),
							expected: number(line(p.x), p.cell),
							deviation: percent(Math.abs(share(p.y - line(p.x), line(p.x)))),
							side: config.words[p.y > line(p.x) ? "above" : "below"],
						},
						p.y,
					),
				),
			}
		: null;
	return { chart, notes, extremes, range, change, groups, trend, outliers };
};

