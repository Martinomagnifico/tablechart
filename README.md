# Tablechart

Simple charts from an HTML or Markdown table: column, bar, line, area,
waterfall and donut, with annotations. A chart builds when it scrolls into
view. Charts are SVG and use the colours of the page, which you can change with
CSS variables.

> Work in progress. The documentation site is in `docs/`.

## Install

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

## Markup

A chart is an element with `data-chart` and a table in it. The first cell of a
row is the label, the second the value.

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

## Options

```js
init({
    selector: "[data-chart]", // The elements to make charts of
    threshold: 0.5,           // How much of a chart must be in view before it builds
    replay: false,            // Build again each time a chart scrolls back into view
    animate: true,            // Animate the chart when it builds
    langattribute: "data-i18n", // The attribute for translation keys, or false for none
    debug: false
});
```

`init` returns `{ charts, refresh, destroy }`. `refresh()` lays out every chart
again. `destroy()` stops watching scroll, size and language changes.

To make a chart of one element, use `create`. Each chart is also on its element,
as `element.tablechart`:

```js
import { create } from "@martinomagnifico/tablechart";

const chart = await create(document.querySelector("#sales"));
chart.refresh();
```

## Bar width

A column, a waterfall step or a bar is never wider than `--tablechart-bar-max`,
60px by default. Use any of `px`, `%` (of the chart's width), `em` or `rem`. In a
narrow chart, bars are 58% of their space. Set `--tablechart-bar-max: none` for
no maximum.

## Height

The height of a chart is a share of its width: `data-chart-aspect`, 0.38 by
default. On a narrow screen it is never less than `--tablechart-min-height`,
200px by default. Use `px`, `em` or `rem`, or `none` for no minimum.

## Licence

MIT
