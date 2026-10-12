/** `--i` staggers a mark of the data; `--after` lands an annotation after the data. */
/** The last piece of a sequence slows to a stop; it starts at the even speed of the pieces before it, so there is no jump. */
export const STOP = "cubic-bezier(0.3, 0.3, 0.6, 1)";

export const timing = (name: "--i" | "--after", slot: number): string => `${name}:${slot}`;
