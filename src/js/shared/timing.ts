/** `--i` staggers a mark of the data; `--after` lands an annotation after the data. */
/** The last piece of a sequence slows to a stop; it starts at the even speed of the pieces before it, so there is no jump. */
export const STOP = "cubic-bezier(0.3, 0.3, 0.6, 1)";

/**
 * Where a donut slice is in a sweep round the ring, in shares of the ring: at one speed, and the last slice slows to a stop.
 * `run` is the share of the neighbouring slices that sweep as one, less than 1 on a step.
 */
export const sweepTiming = (from: number, share: number, run = 1) => ({
	start: from,
	span: share,
	easing: from + share >= run - 1e-4 ? STOP : "linear",
});

export const timing = (name: "--i" | "--after", slot: number): string => `${name}:${slot}`;
