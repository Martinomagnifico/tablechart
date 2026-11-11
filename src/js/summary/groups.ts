/** Splits a list into at most `count` groups of about the same size, in order; a group has at least one item. */
export const groupsOf = <T>(list: T[], count: number): T[][] => {
	const groups = Math.max(1, Math.min(Math.round(count), list.length));
	return Array.from({ length: groups }, (_none, g) => list.slice(Math.floor((g * list.length) / groups), Math.floor(((g + 1) * list.length) / groups)));
};
