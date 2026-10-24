# Tablechart

[![Version](https://img.shields.io/npm/v/@martinomagnifico/tablechart)](https://www.npmjs.com/package/@martinomagnifico/tablechart)
[![Downloads](https://img.shields.io/npm/dt/@martinomagnifico/tablechart)]()

[<img src="screenshot.png" width="100%" alt="Tablechart: a column chart, a donut and a waterfall">](https://martinomagnifico.github.io/tablechart/)

----

## What is it?

Tablechart makes simple charts from a table: an HTML table, a Markdown table or a JSON file. You write the table, Tablechart shows it as a chart.

* **Chart types:** column, bar, line, area, waterfall and donut, and scatter as an additional type
* **The table:** the table is hidden from sight, but screen readers, search engines and translation scripts still read it.
* **Real text:** names and numbers are HTML, so they use the font of the page. No more Times New Roman labels. Text does not scale, but just uses the font size of the page or a size you define.
* **CSS styling:** colours, sizes and animation are CSS variables. Light and dark mode follow the page.
* **Annotations:** badges, brackets, trend arrows, reference lines and a break in the scale
* **Tooltips:** when a chart leaves numbers out, point at a row, or tap it, to see all its values
* **Print and PDF:** every chart prints whole, and the table can be shown under a chart that leaves numbers out
* **Step by step:** show the rows one at a time, with Previous and Next buttons
* **Animation:** a chart builds when it scrolls into view

----

**Documentation:** every chart type, option and CSS variable, with live examples, is at <https://martinomagnifico.github.io/tablechart/>. This README is a quick start.

----

## Installation

```sh
npm install @martinomagnifico/tablechart
```

```js
import { init } from "@martinomagnifico/tablechart";
import "@martinomagnifico/tablechart/style.css";

init();
```

Or with a script tag:

```html
<link rel="stylesheet" href="tablechart.css">
<script src="tablechart.js"></script>
<script>
	Tablechart.init();
</script>
```

The scatter chart is an additional type, in a script of its own. To use it, see [Additional types](#additional-types).

## A chart

A chart is a `figure` with `data-chart` and a table in it. The first cell of a row is its name, the other cells are its values. The `figcaption` is the title; text after a `br` is the subtitle.

```html
<figure data-chart="column">
	<figcaption><b>Apples picked</b><br><span>thousands</span></figcaption>
	<table>
		<tbody>
			<tr><th>Spring</th><td>58</td></tr>
			<tr><th>Summer</th><td>72</td></tr>
			<tr><th>Autumn</th><td>70</td></tr>
		</tbody>
	</table>
</figure>
```

Use `bar`, `line`, `area`, `waterfall` or `donut` for the other types. With more than one value column, each column is a line, or a bar in each group. Add `data-chart-stack` to stack them.

### Additional types

The scatter chart is an additional type, in a script of its own. To use it, add it before `init()`:

```js
import { addType, init } from "@martinomagnifico/tablechart";
import { scatter } from "@martinomagnifico/tablechart/additional-types";

addType("scatter", scatter);
init();
```

With a script tag, load `tablechart-additional-types.js` after `tablechart.js`. See [Additional types](https://martinomagnifico.github.io/tablechart/types/additional-types.html).

## Options

```js
init({
	animate: true,      // Animate a chart when it builds: true, false, "grow" or "sweep"
	threshold: 0.5,     // How much of a chart must be in view before it builds
	replay: false,      // Build again each time a chart scrolls back into view
	controls: true,     // Previous and Next buttons on a chart that steps
	tooltip: "auto",    // Tooltips: "auto" only when a chart leaves numbers out, true or false
	table: "never",     // The table under the chart: "never", "auto" (in print, if numbers are left out), "print" or "always"
	axis: false,        // Numbers along the value axis
	grid: false,        // Gridlines at the numbers of the axis
	locale: undefined,  // Locale for numbers; the language of the page if not set
});
```

Most options can also be set on one chart with a `data-chart-*` attribute. All options are in the [options reference](https://martinomagnifico.github.io/tablechart/reference/options.html).

## API

`init()` returns `{ charts, refresh, destroy }`. `refresh()` lays out every chart again. `destroy()` stops watching scroll, size and language changes.

To make a chart of one figure, use `create()`. Each chart is also on its figure, as `figure.tablechart`.

```js
import { create } from "@martinomagnifico/tablechart";

const chart = await create(document.querySelector("#sales"));
chart.refresh();
```

For a script that decides itself when a chart builds, `@martinomagnifico/tablechart/core` has the separate steps. See the [API reference](https://martinomagnifico.github.io/tablechart/reference/api.html).

## Styling

Tablechart uses the colours of the page. To change them, set CSS variables on a chart or on a parent:

```css
.sales {
	--tablechart-bar-color: teal;
	--tablechart-value-size: 1.2em;
}
```

All variables are in the [CSS variables reference](https://martinomagnifico.github.io/tablechart/reference/variables.html).

## Reveal.js

For charts in a Reveal.js presentation, with fragments that step a chart, use [reveal.js-tablechart](https://github.com/Martinomagnifico/reveal.js-tablechart).

Tablechart is free and open source. If it saves you time, consider [sponsoring my work](https://ko-fi.com/martinomagnifico).

## License

MIT © [Martinomagnifico](https://github.com/martinomagnifico)
