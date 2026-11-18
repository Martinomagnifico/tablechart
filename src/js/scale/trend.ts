/** A value of a series in order: its place among the rows, and the value. */
export interface Point {
	x: number;
	y: number;
}

/** The trend of a series, as Summary describes it and as the values on a line show it. */
export interface Trend<P extends Point> {
	course: "up" | "down" | "flat" | "unclear";

	/** The fitted line, from a place among the rows to a value. */
	line: (x: number) => number;

	/** The values more than `outliers` percent from the line. None when the trend is unclear. */
	outside: P[];
}

/** Defaults for Summary's `flat` and `outliers`, and for the outliers on a line. */
export const TREND_FLAT = 5;
export const TREND_OUTLIERS = 25;

/**
 * A straight line through the points, by least squares, with how sure its slope is: the slope over its standard error.
 * And the spread: how far the values are from the line, as a standard deviation.
 */
const fit = (points: Point[]) => {
	const count = points.length;
	const mx = points.reduce((sum, point) => sum + point.x, 0) / count;
	const my = points.reduce((sum, point) => sum + point.y, 0) / count;
	const sxx = points.reduce((sum, point) => sum + (point.x - mx) ** 2, 0);
	const slope = sxx ? points.reduce((sum, point) => sum + (point.x - mx) * (point.y - my), 0) / sxx : 0;

	const at = (x: number) => my + slope * (x - mx);

	const spread = count > 2 ? Math.sqrt(points.reduce((sum, point) => sum + (point.y - at(point.x)) ** 2, 0) / (count - 2)) : 0;
	const error = sxx ? spread / Math.sqrt(sxx) : 0;
	return { at, spread, tValue: error ? slope / error : slope ? Number.POSITIVE_INFINITY : 0, count };
};

// How large the slope over its error must be, so the slope is not chance: the t-test at 95%, by the number of values less two.
const CRITICAL = [12.71, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.2, 2.18, 2.16, 2.14, 2.13];

const critical = (df: number) => CRITICAL[df - 1] ?? (df < 30 ? 2.1 : 2.0);

/**
 * A percentage of a difference: of a value, or around zero, such as profit and loss, of the range of the data.
 * The mean of the values, for what is flat.
 */
export const scaleOf = (points: Point[]) => {
	const ys = points.map((point) => point.y);
	const low = Math.min(...ys);
	const high = Math.max(...ys);
	const around = low < 0 && high > 0;
	const span = high - low || 1;

	return {
		mean: ys.reduce((sum, y) => sum + y, 0) / ys.length,
		share: (difference: number, of: number) => (difference / (around ? span : Math.abs(of) || span)) * 100,
	};
};

/** The trend of four or more values in order, and the values far from it. Null for fewer. */
export const trendOf = <P extends Point>(points: P[], flat = TREND_FLAT, outliers = TREND_OUTLIERS): Trend<P> | null => {
	if (points.length < 4) return null;
	const { mean, share } = scaleOf(points);

	// An outlier pulls the line towards itself, so the line is fitted again without the outliers.
	const awayFrom = (line: (x: number) => number) => points.filter((point) => Math.abs(share(point.y - line(point.x), line(point.x))) > outliers);

	// If more than a fifth of the values are far from the line, they are not outliers: the values are spread wide, and all of them count.
	const few = (list: unknown[]) => list.length <= points.length / 5;

	let fitted = fit(points);
	let outside = awayFrom(fitted.at);

	if (outside.length && few(outside)) {
		fitted = fit(points.filter((point) => !outside.includes(point)));
		outside = awayFrom(fitted.at);
	}

	if (!few(outside)) {
		fitted = fit(points);
		outside = [];
	}

	const line = fitted.at;
	const first = points[0];
	const last = points[points.length - 1];

	// Flat is judged against the average value. Up or down only if the slope is not chance; flat only if the values stay close
	// to the line. Otherwise there is no clear trend.
	const along = share(line(last.x) - line(first.x), mean);
	const sure = Math.abs(fitted.tValue) >= critical(fitted.count - 2);
	const steady = Math.abs(share(fitted.spread, mean)) < flat;
	const direction = Math.abs(along) < flat ? "flat" : along > 0 ? "up" : "down";
	const course = direction === "flat" ? (steady ? "flat" : "unclear") : sure ? direction : "unclear";

	// Without a clear trend there is nothing to be far from, so there are no outliers either.
	return { course, line, outside: course === "unclear" ? [] : outside };
};
