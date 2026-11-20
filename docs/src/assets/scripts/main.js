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
	// The row of the slider has the width of the card, and a height that the chart does not change.
	new ResizeObserver(fit).observe(card.querySelector('.playground-row'));
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

// The menu drawer on narrow screens. In a function, so its names do not become globals that another script overwrites.
document.addEventListener('DOMContentLoaded', () => {
	const nav = document.getElementById('main-nav');
	if (!nav) return;
	const content = document.querySelector('.docs-content');
	const root = document.documentElement;
	let lockedAt = null;

	// The page behind the open drawer stays where it is. The styles are in _nav.scss ([data-scroll-lock]); this keeps the scroll position.
	const scrollLock = (on) => {
		if (on === (lockedAt !== null)) return;
		if (on) {
			lockedAt = window.scrollY;
			root.style.setProperty('--locked-at', `${-lockedAt}px`);
			// The value keeps a classic scrollbar on a page that has one, so nothing shifts.
			root.dataset.scrollLock = root.scrollHeight > root.clientHeight ? 'scrollbar' : '';
		} else {
			delete root.dataset.scrollLock;
			root.style.removeProperty('--locked-at');
			window.scrollTo({ top: lockedAt, behavior: 'instant' });
			lockedAt = null;
		}
	};

	// The drawer looks modal, so it behaves modal: nothing behind it scrolls or is tabbable.
	const modal = (on) => {
		content?.toggleAttribute('inert', on);
		scrollLock(on);
	};

	// Click beside the drawer. The toggle is skipped: it already toggles itself.
	document.addEventListener('click', (e) => {
		if (nav.contains(e.target) || e.target.closest('.nav-toggle')) return;
		nav.panel?.close(e);
	});

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') nav.panel?.close(e);
	});

	// The check on the target matters, because the nav sections are panels whose events bubble.
	nav.addEventListener('panel:opening', (e) => e.target === nav && modal(true));
	nav.addEventListener('panel:closed', (e) => e.target === nav && modal(false));
	// Resizing to desktop makes it static, which is not a close, so release here.
	nav.addEventListener('panel:staticchange', () => modal(false));
});

// Highlighting, loaded only on a page with code, and after the page, so it holds nothing up. The script tag of this file has the URLs.
(() => {
	if (!document.querySelector('pre code')) return;
	const urls = document.querySelector('script[data-highlighter]').dataset;
	const load = (src) => new Promise((done) => {
		const script = document.createElement('script');
		script.src = src;
		script.onload = done;
		document.head.appendChild(script);
	});
	load(urls.highlighter).then(() => load(urls.lineNumbers)).then(() => {
		// Exclude the install wizard, and any block JS writes itself (.live-code): hljs rebuilds a block from its text, which would throw away the <mark> elements the static demo puts there.
		hljs.configure({ cssSelector: 'pre code:not(.iw-code):not(.live-code)' });
		hljs.highlightAll();
		hljs.initLineNumbersOnLoad();
		// The install wizard writes its code before this is loaded.
		document.querySelectorAll('pre code.iw-code:not([data-highlighted])').forEach((code) => hljs.highlightElement(code));
	});
})();

// Highlight the lines a code block asks for with data-lines, such as "2-8", once the line numbers have made a row of each line.
(() => {
	const blocks = document.querySelectorAll('pre[data-lines]');
	if (!blocks.length) return;
	const mark = (pre) => {
		const rows = pre.querySelectorAll('table.hljs-ln tr');
		if (!rows.length) return false;
		pre.dataset.lines.split(',').forEach((part) => {
			const ends = part.split('-').map(Number);
			for (let n = ends[0]; n <= (ends[1] || ends[0]); n++) rows[n - 1]?.classList.add('is-highlighted');
		});
		return true;
	};
	blocks.forEach((pre) => {
		if (mark(pre)) return;
		const watcher = new MutationObserver(() => { if (mark(pre)) watcher.disconnect(); });
		watcher.observe(pre, { childList: true, subtree: true });
	});
})();
