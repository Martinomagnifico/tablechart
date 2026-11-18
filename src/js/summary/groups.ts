/** Splits a list into at most `count` groups of about the same size, in order; a group has at least one item. */
export const groupsOf = <T>(list: T[], count: number): T[][] => {
	const groups = Math.max(1, Math.min(Math.round(count), list.length));

	const boundary = (groupIndex: number) => Math.floor((groupIndex * list.length) / groups);

	return Array.from({ length: groups }, (_none, groupIndex) => list.slice(boundary(groupIndex), boundary(groupIndex + 1)));
};
