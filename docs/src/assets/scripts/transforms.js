// The transforms of the examples on the page about data from a file or API, for every init() of the docs.

// Every column in a list of its own: a row of each month, with the rain of that month as its value.
const perMonth = (data) => data.months.map((month, index) => ({ label: month, value: data.rain[index] }));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The rain of every day from Open-Meteo, added up per month.
const rainPerMonth = (data) => {
	const totals = Array(12).fill(0);
	data.daily.time.forEach((day, index) => {
		const month = Number(day.slice(5, 7)) - 1;
		totals[month] += data.daily.precipitation_sum[index] ?? 0;
	});
	return totals.map((total, month) => ({ label: MONTHS[month], value: total.toFixed(1) }));
};

window.docsTransforms = { perMonth, rainPerMonth };
