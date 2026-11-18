// The moves themselves: fading in, fading out, moving a shape, and changing the shape of paths.
import type { Box } from "./snapshot";

// The curve of `easeOut` below, so a path that changes shape keeps up with the points and numbers on it.
const EASE = "cubic-bezier(0.33, 1, 0.68, 1)";

const easeOut = (progress: number): number => 1 - (1 - progress) ** 3;

export interface Reshape {
	path: Element;
	at: (progress: number) => string;
}

// ---------------------------------------------------------------------------------------------------------------------------------

export const fadeIn = (element: Element, duration: number): void => {
	element.animate([{ opacity: 0 }, {}], { duration, easing: EASE });
};

// A copy of what is gone, in the new drawing, that fades out where it was and is then removed.
export const fadeOut = (element: Element, into: Element, duration: number, first = false, place?: (ghost: Element) => void): Element => {
	const ghost = element.cloneNode(true) as Element;
	place?.(ghost);
	ghost.removeAttribute("mask");
	ghost.removeAttribute("clip-path");
	ghost.setAttribute("data-ghost", "");

	if (first) into.prepend(ghost);
	else into.append(ghost);

	const fade = ghost.animate([{}, { opacity: 0 }], { duration: duration * 0.6, easing: EASE });
	fade.onfinish = () => ghost.remove();
	return ghost;
};

// A mark or number also moves from one transform to another, such as with the baseline. A copy keeps its last transform until it is gone.
export const drift = (element: Element, from: string, to: string, duration: number, copy = true): void => {
	const style = (element as SVGElement | HTMLElement).style;
	style.transformBox = "view-box";
	style.transformOrigin = "0 0";
	const moving = element.animate([{ transform: from }, { transform: to }], { duration, easing: EASE, fill: copy ? "forwards" : "none" });
	if (copy) return;

	moving.onfinish = () => {
		style.transformBox = "";
		style.transformOrigin = "";
	};
};

// Moves a text from its old place, as `left` and `top`.
export const slide = (element: HTMLElement, start: { left: string; top: string }, duration: number): void => {
	element.animate([start, {}], { duration, easing: EASE });
};

// A shape moves, and a bar also scales, from its old box to its new one.
export const move = (element: Element, from: Box, to: Box, duration: number): void => {
	const [fromX, fromY, fromWidth, fromHeight] = from;
	const [toX, toY, toWidth, toHeight] = to;

	// A round shape, such as a point, only moves, from its old centre to its new one.
	const round = element.tagName !== "rect" && element.tagName !== "line";
	const scaleX = round || !toWidth ? 1 : fromWidth / toWidth;
	const scaleY = round || !toHeight ? 1 : fromHeight / toHeight;
	const shiftX = round ? fromX + fromWidth / 2 - (toX + toWidth / 2) : fromX - toX * scaleX;
	const shiftY = round ? fromY + fromHeight / 2 - (toY + toHeight / 2) : fromY - toY * scaleY;
	const still = Math.abs(shiftX) < 0.01 && Math.abs(shiftY) < 0.01 && scaleX === 1 && scaleY === 1;
	if (still) return;

	const style = (element as SVGElement).style;
	style.transformBox = "view-box";
	style.transformOrigin = "0 0";
	const start = { transform: `matrix(${scaleX},0,0,${scaleY},${shiftX},${shiftY})` };
	const moving = element.animate([start, { transform: "none" }], { duration, easing: EASE });

	moving.onfinish = () => {
		style.transformBox = "";
		style.transformOrigin = "";
	};
};

// One loop for every path that changes shape, at the pace of the other moves.
export const reshape = (changes: Reshape[], duration: number): void => {
	if (!changes.length) return;
	const start = performance.now();

	const frame = (now: number) => {
		const progress = Math.min((now - start) / duration, 1);
		for (const { path, at } of changes) path.setAttribute("d", at(easeOut(progress)));
		if (progress < 1) requestAnimationFrame(frame);
	};

	for (const { path, at } of changes) path.setAttribute("d", at(0));
	requestAnimationFrame(frame);
};
