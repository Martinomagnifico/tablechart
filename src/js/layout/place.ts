/** Where the parent of a tooltip puts its top left corner on the screen, and at what scale. */
export interface Frame {
	x: number;
	y: number;
	scale: number;
}

/**
 * Places a tooltip beside an anchor. It is worked out in window pixels: the tooltip goes above the anchor, below
 * it if there is no room above, and slides sideways to stay inside the window. Its arrow keeps pointing at the
 * anchor, and its point stops just short of it. The tooltip has `position: fixed`, and `frame` turns window
 * pixels into those of its parent, which can be moved or scaled, as the slides of a presentation are.
 * `space`, between the arrow and the anchor, and `corner`, the room the arrow keeps from a corner, are in pixels
 * of the tooltip, so they scale with it. `pad`, the room to the edge of the window, is in pixels of the window.
 */
export const place = (
	tip: HTMLElement,
	arrow: HTMLElement,
	anchor: DOMRect,
	frame: Frame = { x: 0, y: 0, scale: 1 },
	space = 2,
	pad = 8,
	corner = 12
): void => {
	const box = tip.getBoundingClientRect();
	const w = box.width;
	const h = box.height;
	// The arrow is placed from inside the border.
	const border = Number.parseFloat(getComputedStyle(tip).borderLeftWidth) || 0;
	// The arrow is a turned square on the inner edge of the border: half of it sticks out, less the border.
	const gap = arrow.getBoundingClientRect().height / 2 + (space - border) * frame.scale;
	const inset = corner * frame.scale;
	const { clientWidth: vw, clientHeight: vh } = document.documentElement;
	const above = anchor.top - pad;
	const below = vh - anchor.bottom - pad;
	const top = h + gap <= above ? true : h + gap <= below ? false : above >= below;
	const y = top ? anchor.top - gap - h : anchor.bottom + gap;
	const middle = anchor.left + anchor.width / 2;
	const x = Math.max(pad, Math.min(middle - w / 2, vw - w - pad));
	tip.style.left = `${(x - frame.x) / frame.scale}px`;
	tip.style.top = `${(Math.max(pad, Math.min(y, vh - h - pad)) - frame.y) / frame.scale}px`;
	tip.dataset.side = top ? "top" : "bottom";
	arrow.style.left = `${Math.max(inset, Math.min(middle - x, w - inset)) / frame.scale - border}px`;
};
