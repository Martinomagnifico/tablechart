document.addEventListener('click', e => {
	const button = e.target.closest('button[aria-controls]');
	if (!button) return;
	const panelId = button.getAttribute('aria-controls');
	const container = document.getElementById(panelId)?.closest('[data-panelset]');
	container?.panelSet?.show(panelId, true, { trigger: button, event: e });
});
// The Wide and Narrow buttons of an example. A narrow chart keeps the height of its drawing, so it only gets narrower,
// unless the example shows how the height follows the width (data-free-height).
document.querySelectorAll('.width-toggle').forEach((group) => {
	const box = group.closest('.card')?.querySelector('.size-box, .type-box, .text-box');
	const figure = box?.querySelector('figure');
	if (!figure) return;
	group.querySelectorAll('button').forEach((button) => {
		button.addEventListener('click', () => {
			group.querySelectorAll('button').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
			const svg = figure.querySelector('.tablechart-plot svg');
			if (!button.dataset.width) figure.style.removeProperty('--tablechart-min-height');
			else if (!box.style.maxWidth && svg && !group.hasAttribute('data-free-height')) figure.style.setProperty('--tablechart-min-height', `${svg.getBoundingClientRect().height}px`);
			box.style.maxWidth = button.dataset.width;
		});
	});
});

// The dropdown of the apples demo: how contrast is measured, for this chart and for the text under it.
document.querySelectorAll('.wcag-demo').forEach((card) => {
	const figure = card.querySelector('figure');
	card.querySelector('select').addEventListener('change', (event) => {
		card.dataset.wcag = event.target.value;
		figure.style.setProperty('--tablechart-contrast-wcag', event.target.value);
		figure.tablechart?.refresh();
	});
});
