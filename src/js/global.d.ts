declare module '*.scss';

// apca-w3 has no types of its own; these are the two functions Tablechart uses.
declare module "apca-w3" {
	export function sRGBtoY(rgb: number[]): number;
	export function APCAcontrast(textY: number, backgroundY: number, places?: number): number;
}
