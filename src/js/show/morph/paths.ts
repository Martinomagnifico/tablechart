// Places in the old drawing, read in the new one, and paths that change their numbers from one shape to the next.
import type { Box, Frame } from "./snapshot";

// From a place in the old drawing to the same place on the screen in the new one: x' = scaleX * x + shiftX, and so for y.
export interface Mapping {
	scaleX: number;
	shiftX: number;
	scaleY: number;
	shiftY: number;
	x: (x: number) => number;
	y: (y: number) => number;
}

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const TOKEN = /[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

// What each number of a path command is: an x or a y, a width (w) or height (h) such as the radii of an arc, or neither.
const ROLES: Record<string, string> = { M: "xy", L: "xy", T: "xy", H: "x", V: "y", C: "xyxyxy", S: "xyxy", Q: "xyxy", A: "wh...xy" };

// ---------------------------------------------------------------------------------------------------------------------------------

// The plot can change its size and place, such as when an axis goes; then the old places are read in the new drawing.
export const mapBetween = (from: Frame, to: Frame): Mapping => {
	const scaleX = from.scaleX / to.scaleX;
	const scaleY = from.scaleY / to.scaleY;
	const shiftX = (from.svg.left - to.svg.left) / to.scaleX;
	const shiftY = (from.svg.top - to.svg.top) / to.scaleY;
	return {
		scaleX,
		shiftX,
		scaleY,
		shiftY,
		x: (x) => scaleX * x + shiftX,
		y: (y) => scaleY * y + shiftY,
	};
};

export const mapBox = (box: Box, mapping: Mapping): Box => {
	const [x, y, width, height] = box;
	return [mapping.x(x), mapping.y(y), width * mapping.scaleX, height * mapping.scaleY];
};

// One number of a path, read in the new drawing. A relative x or y, a width and a height only scale.
const mapNumber = (value: number, role: string, relative: boolean, mapping: Mapping): number => {
	if (role === "w" || (role === "x" && relative)) return value * mapping.scaleX;
	if (role === "h" || (role === "y" && relative)) return value * mapping.scaleY;
	if (role === "x") return mapping.x(value);
	if (role === "y") return mapping.y(value);
	return value;
};

// The same path, its numbers read in the new drawing; the letters and the marks between the numbers stay as they are.
export const mapPath = (path: string, mapping: Mapping): string => {
	let command = "";
	let index = 0;
	return path.replace(TOKEN, (token) => {
		if (/[A-Za-z]/.test(token)) {
			command = token;
			index = 0;
			return token;
		}

		const roles = ROLES[command.toUpperCase()] ?? "";
		const role = roles[index++ % (roles.length || 1)];
		const relative = command !== command.toUpperCase();
		const mapped = mapNumber(Number(token), role, relative, mapping);
		return String(Number(mapped.toFixed(3)));
	});
};

// ---------------------------------------------------------------------------------------------------------------------------------

// A path with the same commands in the same order changes its numbers; any other path fades in.
export const pathsBetween = (from: string, to: string): ((progress: number) => string) | null => {
	const fromNumbers = from.match(NUMBER) ?? [];
	const toNumbers = to.match(NUMBER) ?? [];
	const between = to.split(NUMBER);
	const sameCommands = from.split(NUMBER).join("") === between.join("");
	if (fromNumbers.length !== toNumbers.length || !sameCommands) return null;

	const start = fromNumbers.map(Number);
	const end = toNumbers.map(Number);
	return (progress) =>
		between
			.map((part, index) => {
				if (index >= end.length) return part;
				const value = start[index] + (end[index] - start[index]) * progress;
				return part + value.toFixed(2);
			})
			.join("");
};
