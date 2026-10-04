/**
 * A mark's place in the build: `--i` for a mark of the data, `--after` for an
 * annotation, which lands after the data it is about. The stylesheet staggers the
 * marks by it.
 */
export const timing = (name: "--i" | "--after", slot: number): string => `${name}:${slot}`;
