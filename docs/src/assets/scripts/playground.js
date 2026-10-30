// The animation playground (styling/playground.html): the sliders, the CSS they make, and the preview charts.
(function () {
	var KEY = 'tablechart-animation-playground';
	var charts = document.querySelector('.playground-charts');
	var controls = Array.from(document.querySelectorAll('.playground-controls [data-var]'));
	var css = document.querySelector('.playground-css');
	// The values the reader set, by variable; a variable that is not here keeps its default.
	var chosen = {};

	// Local storage can be missing or blocked, as in a private window: then the settings last until the page is left.
	try { chosen = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { chosen = {}; }
	var save = function () {
		try { localStorage.setItem(KEY, JSON.stringify(chosen)); } catch (e) {}
	};

	var valueOf = function (control) { return control.value + control.dataset.unit; };

	// The column chart of the preview, as written, so it can be made again with another number of columns.
	var count = document.getElementById('pg-count');
	// The column and bar charts, as written, so they can be made again with another number of columns or bars.
	var sources = { 'pg-column': document.getElementById('pg-column').outerHTML, 'pg-bar': document.getElementById('pg-bar').outerHTML };
	var seconds = function (value) { return Math.round(value * 100) / 100 + 's'; };
	var clamp = function (value) { return Math.min(Math.max(value, 0), 1); };
	// Where a share of the slider is on its track: under the middle of the thumb, but an end of the slider is the end of the track.
	var at = function (share) {
		return share <= 0 ? '0%' : share >= 1 ? '100%' : 'calc(var(--thumb) / 2 + (100% - var(--thumb)) * ' + share + ')';
	};
	// The track is filled up to the thumb.
	var ranges = Array.from(document.querySelectorAll('.playground-row input[type="range"]'));
	var fill = function () {
		ranges.forEach(function (input) {
			input.style.setProperty('--value-at', at((input.value - input.min) / (input.max - input.min)));
			input.style.setProperty('--default-at', at((input.defaultValue - input.min) / (input.max - input.min)));
		});
	};

	// As Tablechart works it out for a column chart: the defaults, or the values set here.
	var limits = function () {
		var has = function (name) { return Object.prototype.hasOwnProperty.call(chosen, name); };
		var number = function (name, fallback) { return has(name) ? parseFloat(chosen[name]) : fallback; };
		// Times as set; the speed divides them all, so the pink parts do not change with it, only the times that come out.
		var speed = number('--tablechart-animation-speed', 1);
		var element = number('--tablechart-animation-element-duration', 0.4);
		var ratio = number('--tablechart-animation-stagger', 0.25);
		var max = number('--tablechart-animation-max', 2);
		var min = number('--tablechart-animation-min', 0.5);
		var n = Number(count.value);
		// If the chart would end before the minimum, the columns and their starts slow down together: the stagger keeps its share.
		// A maximum shorter than one column shortens the columns; what is left of it is for the starts.
		var time = Math.min(Math.max(element, min / (1 + (n - 1) * ratio)), max);
		var asked = ratio * time;
		var ceiling = Math.max(0, max - time) / (n - 1);
		var stagger = Math.min(asked, ceiling);
		var held = asked > ceiling + 0.0005;
		var stretched = time > element + 0.0005;
		// The stagger the maximum allows, and the maximum this stagger needs.
		var allowed = ceiling / time;
		var needed = time + (n - 1) * asked;

		var red = function (input, from, to) {
			input.style.setProperty('--from-at', at(from));
			input.style.setProperty('--to-at', at(to));
		};
		var share = function (input, value) { return clamp((value - input.min) / (input.max - input.min)); };
		fill();
		// The stagger that is used: a hollow mark on the track, and the value under the one that is set.
		var staggerInput = document.getElementById('pg-stagger');
		var used = document.querySelector('.playground-used');
		var usedRatio = stagger / time;
		used.hidden = !held;
		used.style.setProperty('--used-at', at(clamp(usedRatio)).replace(/var\(--thumb\)/g, '18px'));
		var staggerOutput = staggerInput.closest('.playground-row').querySelector('output');
		staggerOutput.textContent = has('--tablechart-animation-stagger') ? staggerInput.value : staggerInput.defaultValue;
		if (held) staggerOutput.appendChild(document.createElement('small')).textContent = '→ ' + usedRatio.toFixed(2);
		red(staggerInput, clamp(allowed), 1);
		// The element time that is used, if the minimum or the maximum changes it.
		var elementInput = document.getElementById('pg-element');
		var elementOutput = elementInput.closest('.playground-row').querySelector('output');
		elementOutput.querySelector('small')?.remove();
		if (Math.abs(time - element) > 0.0005) elementOutput.appendChild(document.createElement('small')).textContent = '→ ' + seconds(time);
		var maxInput = document.getElementById('pg-max');
		red(maxInput, 0, share(maxInput, needed));
		var minInput = document.getElementById('pg-min');
		red(minInput, share(minInput, max), 1);

		var forN = 'For ' + n + ' columns or bars, ';
		document.querySelector('[data-limit="stagger"]').textContent = allowed < 1 ? forN + 'the maximum holds a stagger above ' + allowed.toFixed(2) + ' back.' : '';
		document.querySelector('[data-limit="max"]').textContent = forN + 'this stagger needs a maximum of ' + seconds(needed) + '. Below that (pink), the starts move closer together.';
		document.querySelector('[data-limit="min"]').textContent = min > max ? 'This minimum is above the maximum, so it has no effect: the maximum wins. The pink part shows where that happens.' : '';
		document.querySelector('.playground-result').textContent = n + ' columns or bars: the starts are ' + seconds(stagger / speed) + ' apart, and the chart is done in ' + seconds(((n - 1) * stagger + time) / speed) + '.' +
			(held ? ' The maximum holds the stagger back.' : '') +
			(stretched ? ' The minimum slows the columns down: each takes ' + seconds(time / speed) + '.' : '') +
			(time < element ? ' The maximum is shorter than one column, so each column takes ' + seconds(time / speed) + '.' : '');
	};

	var columns = function () {
		var n = Number(count.value);
		Object.keys(sources).forEach(function (id) {
			var holder = document.createElement('div');
			holder.innerHTML = sources[id];
			var fresh = holder.firstElementChild;
			fresh.querySelector('tbody').innerHTML = Array.from({ length: n }, function (_, i) {
				return '<tr><th>' + (i + 1) + '</th><td>' + (20 + ((i * 37) % 60)) + '</td></tr>';
			}).join('');
			var old = document.getElementById(id);
			if (old.tablechart) old.tablechart.destroy();
			old.replaceWith(fresh);
			window.Tablechart.create(fresh);
		});
	};
	count.addEventListener('input', function () {
		count.parentElement.querySelector('output').textContent = count.value;
		limits();
	});
	count.addEventListener('change', columns);

	var show = function () {
		controls.forEach(function (control) {
			var name = control.dataset.var;
			var set = Object.prototype.hasOwnProperty.call(chosen, name);
			if (set) control.value = control.dataset.unit ? parseFloat(chosen[name]) : chosen[name];
			var output = control.closest('.playground-row').querySelector('output');
			if (output) {
				// At the default, its value, greyed: so the default is known before and after the slider moves.
				output.textContent = set ? valueOf(control) : control.defaultValue + control.dataset.unit;
				output.classList.toggle('is-default', !set);
			}
			var reset = control.closest('.playground-row').querySelector('.playground-reset');
			if (reset) reset.disabled = !set;
			if (set) charts.style.setProperty(name, chosen[name]);
			else charts.style.removeProperty(name);
		});
		var lines = Object.keys(chosen).map(function (name) { return '  ' + name + ': ' + chosen[name] + ';'; });
		css.textContent = lines.length ? ':root {\n' + lines.join('\n') + '\n}' : '/* All settings are at their defaults: there is nothing to add. */';
		limits();
	};

	// Every chart builds again from the start, with the settings as they are now.
	var build = function () {
		var figures = charts.querySelectorAll('figure[data-chart]');
		figures.forEach(function (figure) { figure.classList.add('no-motion'); figure.classList.remove('is-shown'); });
		void charts.offsetWidth;
		figures.forEach(function (figure) { figure.classList.remove('no-motion'); figure.classList.add('is-shown'); });
	};

	controls.forEach(function (control) {
		var name = control.dataset.var;
		// While a slider moves, only its number follows; the charts build when it is let go.
		control.addEventListener('input', function () {
			// Back on the default value is the default: it leaves the CSS, and Reset has nothing to do.
			if (control.value === '' || (control.type === 'range' && control.value === control.defaultValue)) delete chosen[name];
			else chosen[name] = valueOf(control);
			show();
		});
		control.addEventListener('change', function () {
			save();
			build();
		});
	});

	document.querySelectorAll('.playground-reset').forEach(function (button) {
		button.addEventListener('click', function () {
			var control = document.getElementById(button.dataset.for);
			delete chosen[control.dataset.var];
			control.value = control.defaultValue;
			save();
			show();
			build();
		});
	});
	document.querySelector('.playground-reset-all').addEventListener('click', function () {
		chosen = {};
		controls.forEach(function (control) { control.value = control.tagName === 'SELECT' ? '' : control.defaultValue; });
		save();
		show();
		build();
	});
	document.querySelector('.playground-build').addEventListener('click', build);

	show();
})();
