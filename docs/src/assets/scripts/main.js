document.addEventListener('click', e => {
	const button = e.target.closest('button[aria-controls]');
	if (!button) return;
	const panelId = button.getAttribute('aria-controls');
	const container = document.getElementById(panelId)?.closest('[data-panelset]');
	container?.panelSet?.show(panelId, true, { trigger: button, event: e });
});
// The Wide and Narrow buttons of an example. A narrow chart keeps the height of its drawing, so it only gets narrower.
document.querySelectorAll('.width-toggle').forEach((group) => {
	const box = group.closest('.card')?.querySelector('.size-box, .type-box, .text-box');
	const figure = box?.querySelector('figure');
	if (!figure) return;
	group.querySelectorAll('button').forEach((button) => {
		button.addEventListener('click', () => {
			group.querySelectorAll('button').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
			const svg = figure.querySelector('.tablechart-plot svg');
			if (!button.dataset.width) figure.style.removeProperty('--tablechart-min-height');
			else if (!box.style.maxWidth && svg) figure.style.setProperty('--tablechart-min-height', `${svg.getBoundingClientRect().height}px`);
			box.style.maxWidth = button.dataset.width;
		});
	});
});

// The slider of the example of the height: the width of the chart, and which of the three limits the height follows.
document.querySelectorAll('.clamp-demo').forEach((card) => {
	const slider = card.querySelector('input');
	const box = card.querySelector('.size-box');
	const value = card.querySelector('output');
	const note = card.querySelector('.clamp-note');
	const zones = card.querySelectorAll('[data-zone]');
	const figure = card.querySelector('figure');
	let [min, max] = [200, 250];
	const show = () => {
		const width = Number(slider.value);
		box.style.maxWidth = `${width}px`;
		value.textContent = `${width}px`;
		const zone = width < min ? 'min' : width > max ? 'max' : 'aspect';
		zones.forEach((one) => one.toggleAttribute('data-current', one.dataset.zone === zone));
		note.textContent = {
			min: `The width times the aspect is ${width}px, less than the minimum. So the height gets to be ${min}px.`,
			aspect: `The width times the aspect is ${width}px, between the minimum and the maximum. So the height is ${width}px.`,
			max: `The width times the aspect is ${width}px, more than the maximum. So the height gets to be ${max}px.`,
		}[zone];
	};
	// Not wider than the room there is. With more room, the three ranges are wider too.
	const fit = () => {
		const room = Math.max(card.querySelector('.demo').clientWidth - 80, 280);
		const followed = Number(slider.value) >= Number(slider.max);
		slider.max = String(Math.floor(room / 5) * 5);
		if (followed) slider.value = slider.max;
		const [least, most] = room < 600 ? [200, 250] : [240, 440];
		if (least !== min) {
			[min, max] = [least, most];
			figure.style.setProperty('--tablechart-min-height', `${min}px`);
			figure.style.setProperty('--tablechart-max-height', `${max}px`);
			figure.tablechart?.refresh();
		}
		card.closest('section')?.querySelectorAll('[data-clamp]').forEach((one) => { one.textContent = `${one.dataset.clamp === 'min' ? min : max}px`; });
		show();
	};
	slider.addEventListener('input', show);
	new ResizeObserver(fit).observe(card);
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
