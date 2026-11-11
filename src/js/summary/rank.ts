/** The place of a value among all values: 1 for the highest (`high`) or the lowest (`low`). Equal values share a place. */
export const rankOf = (all: number[]) => (value: number) => ({
	high: 1 + all.filter((one) => one > value).length,
	low: 1 + all.filter((one) => one < value).length,
});
