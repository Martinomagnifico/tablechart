import { BAR_CLASS, decimalsIn, largest, RULE_CLASS, splitSign, svgEl, timing, VIEWBOX_WIDTH, withRow } from "../kit";
import type { ChartType, Row, Series } from "../types";

const CANDLE_CLASS = "tablechart-candle";

/** The first four value columns: open, high, low and close. */
const fieldsOf = (series: Series[]): number[] => series.flatMap((one, s) => (one.group ? [] : [s])).slice(0, 4);

/** Open, high, low and close of a row, or null if one is missing. */
const pricesOf = (row: Row, fields: number[]): [number, number, number, number] | null => {
	const cells = fields.map((s) => row.cells[s]);
	return cells.length === 4 && cells.every((cell) => cell && !cell.missing) ? (cells.map((cell) => cell.value) as [number, number, number, number]) : null;
};

/** One candle per row: a body from open to close, and a wick from low to high. A rising candle is hollow, a falling one filled. */
export const candlestick: ChartType = {
	columns: true,
	numbers: false,
	floats: true,
	valueAxis: true,
	ticks: true,
	crosshair: true,

	headroom: ({ unit }) => 4 * unit,

	draw(geo) {
		const { rows, cx, y, unit, svg, barWidth, height, domain, config } = geo;
		const fields = fieldsOf(geo.series);
		const all = rows.map((row) => pricesOf(row, fields));
		const lows = all.flatMap((prices) => (prices ? [prices[2]] : []));
		const width = Math.max(barWidth, unit);

		all.forEach((prices, i) => {
			if (!prices) return;
			const [open, high, low, close] = prices;
			const up = close >= open;
			// A body as thin as a line where open and close are the same.
			const middle = (y(open) + y(close)) / 2;
			const tall = Math.max(Math.abs(y(open) - y(close)), unit);
			const top = middle - tall / 2;
			const candle = svgEl("g", {
				class: withRow(`${BAR_CLASS} ${CANDLE_CLASS}`, rows[i]),
				"data-row": i + 1,
				"data-move": up ? "up" : "down",
				// It grows the way the price went.
				...(!up && { "data-grow": "down" }),
				style: timing("--i", rows[i].slot),
			});
			// The wick stops at the body, so a hollow body stays empty.
			const wick = (from: number, to: number) => {
				if (to - from > 0.01) candle.append(svgEl("line", { class: `${CANDLE_CLASS}-wick`, x1: cx(i), x2: cx(i), y1: from, y2: to }));
			};
			wick(y(high), top);
			wick(top + tall, y(low));
			candle.append(svgEl("rect", { class: `${CANDLE_CLASS}-body`, x: cx(i) - width / 2, y: top, width, height: tall }));
			svg.append(candle);
		});

		const lowest = lows.length ? -largest(lows.map((value) => -value)) : 0;
		const highest = largest(all.flatMap((prices) => (prices ? [prices[1]] : [])));
		const rule = domain ? y(domain[0]) : y(lowest);
		svg.append(svgEl("line", { class: RULE_CLASS, x1: 0, x2: VIEWBOX_WIDTH, y1: rule, y2: rule }));

		// The value of the scale at a height, written as the closing prices are.
		const close = fields[3];
		const first = rows.find((row) => row.cells[close] && !row.cells[close].missing)?.cells[close];
		const places = Math.max(0, largest(rows.map((row) => decimalsIn(row.cells[close]?.number ?? ""))));
		const span = y(highest) - y(lowest) || 1;
		const textAt = (at: number) => {
			const [sign, rest] = splitSign(lowest + ((at - y(lowest)) / span) * (highest - lowest), places, config.locale);
			return `${first?.prefix ?? ""}${sign}${rest}${first?.suffix ?? ""}`;
		};

		// The line across follows the pointer, and goes to the open, high, low or close within 8 pixels of it, with a dot there.
		const right = geo.axisSide === "right";
		geo.crossingOf = (i) => {
			const prices = all[i];
			if (!prices) return null;
			const body = svg.querySelector(`.${CANDLE_CLASS}[data-row="${i + 1}"] .${CANDLE_CLASS}-body`);
			const colour = body ? getComputedStyle(body).stroke : undefined;
			return {
				x: cx(i),
				from: domain ? y(domain[1]) : 0,
				to: rule,
				edge: right ? VIEWBOX_WIDTH : 0,
				end: right ? 0 : VIEWBOX_WIDTH,
				axis: geo.axisSide,
				height,
				points: fields.map((s, k) => ({
					series: s,
					y: y(prices[k]),
					dot: svgEl("circle", { class: "tablechart-crosshair-point", cx: cx(i), cy: y(prices[k]), r: 3 * unit, style: `--tablechart-point-color:${colour}` }),
					colour,
				})),
				textAt,
				snap: 8,
				around: [y(prices[1]), y(prices[2])],
			};
		};
	},

	// Open, high, low and close with the names of their columns; the close with its change from the open.
	tooltip(state, index, config) {
		const fields = fieldsOf(state.series);
		const prices = pricesOf(state.rows[index], fields);
		return fields.map((s, k) => {
			const value = state.seriesValues[s]?.[index]?.textContent ?? "";
			const change =
				k === 3 && prices && prices[0]
					? ` (${new Intl.NumberFormat(config.locale, { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 1 }).format((prices[3] - prices[0]) / prices[0])})`
					: "";
			return { name: state.series[s].name, value: value + change };
		});
	},
};
