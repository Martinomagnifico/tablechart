/**
 * Places a tooltip beside an anchor, in viewport pixels. The tooltip is a child of body with `position: fixed`,
 * so no parent can clip it and there is no offset parent to work around. It goes above the anchor, below it if
 * there is no room above, and slides sideways to stay inside the window. Its arrow keeps pointing at the anchor.
 */
export const place = (tip: HTMLElement, arrow: HTMLElement, anchor: DOMRect, gap = 10, pad = 8, corner = 12): void => {
	const { offsetWidth: w, offsetHeight: h } = tip;
	const { clientWidth: vw, clientHeight: vh } = document.documentElement;
	const above = anchor.top - pad;
	const below = vh - anchor.bottom - pad;
	const top = h + gap <= above ? true : h + gap <= below ? false : above >= below;
	const y = top ? anchor.top - gap - h : anchor.bottom + gap;
	const middle = anchor.left + anchor.width / 2;
	const x = Math.max(pad, Math.min(middle - w / 2, vw - w - pad));
	tip.style.left = `${x}px`;
	tip.style.top = `${Math.max(pad, Math.min(y, vh - h - pad))}px`;
	tip.dataset.side = top ? "top" : "bottom";
	arrow.style.left = `${Math.max(corner, Math.min(middle - x, w - corner))}px`;
};
