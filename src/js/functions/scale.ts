/** A break in the scale: values from `lo` to `hi` get `share` of the length, and the cut is at `gap`. */
export interface Squeeze {
	lo: number;
	hi: number;
	gap: number;
	share: number;
}

/** How far along a scale of `length` a value lands, from 0 at the start: at full scale, but squeezed by a break, with `cut` left empty where it is cut. */
export const along = (value: number, ceiling: number, length: number, squeeze: Squeeze | null, cut: number): number => {
	if (!squeeze) return (value / ceiling) * length;
	const { lo, hi, gap, share } = squeeze;
	const squeezed = length * share;
	const density = (length - squeezed - cut) / (lo + (ceiling - hi));
	const perValue = squeezed / (hi - lo);
	if (value <= lo) return value * density;
	if (value <= gap) return lo * density + (value - lo) * perValue;
	if (value <= hi) return lo * density + (value - lo) * perValue + cut;
	return lo * density + squeezed + cut + (value - hi) * density;
};
