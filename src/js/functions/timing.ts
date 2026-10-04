/** `--i` staggers a mark of the data; `--after` lands an annotation after the data. */
export const timing = (name: "--i" | "--after", slot: number): string => `${name}:${slot}`;
