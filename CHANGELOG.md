# Changelog

## [0.1.2] - 2026-10-07

### Added

- Smooth lines and areas: `data-chart-shape="smooth"`, or the `shape` option for every chart. The curve goes through every point and never overshoots them (monotone cubic interpolation), so it shows no peak or dip that is not in the data. A missing value still splits the line, and in a stack each area follows the curve of the one below it.
- The `shape` option: `"straight"` (the default), `"step"` or `"smooth"`. `data-chart-shape` on a figure overrides it, so `data-chart-shape="straight"` turns a chart back.
- Lines and areas that grow up from zero: `data-chart-animate="up"`, or `animate: "up"` for every chart. `data-chart-animate="across"` is the opposite. Other chart types are not affected.
- The moment a chart builds inside an element that animates in can be set: `data-chart-entrance` on a figure, or the `entrance` option, from `0` (when the element starts to move) to `1` (when it is in). It is `0.5`, halfway, by default, as before.
- With `debug: true`, the console says how long each chart takes to build and to lay out, with a warning above 50 ms.

### Fixed

- A step line (`data-chart-shape="step"`) now takes as long to build as other lines. Its rises and drops are drawn quickly, so the line no longer stops moving to the right while it goes up or down.
- A line or area with more than seven points takes no longer to build than one with seven: six stagger steps in all. It was one step per point, so a long line was much slower than a short one.
- The fill of an area fades in at an even speed while its line builds, so it is no longer there before the line.
- A line or bar chart with many rows lays out much faster. A layout now reads the size of every number and name at once, before it places anything: 10,000 rows took 23 to 65 seconds and now take well under a second.
- A chart with about 100,000 rows or more no longer stops with an error.
- After a resize, a line chart whose first number is hidden, such as on a line out of focus, keeps the room for the numbers above it.



## [0.1.1] - 2026-10-05

### Fixed

- The key under a donut is no longer made smaller when a name does not fit a column: its names are not in columns.
- Removed some comments



## [0.1.0] - 2026-10-04

### Added

- The legend of an area chart has a square in front of each name.
- Each line of a chart with several lines has its own point: a filled circle, an open circle, a filled square, an open square, a filled diamond and an open diamond, then from the start again. `data-marker` on a column header sets another, such as `square` or `diamond open`. The legend shows the same points. Points have `data-marker` with their shape, and `data-open` when they are open.
- `data-line="dashed"` or `data-line="dotted"` on a column header makes a dashed or dotted line. It is shown from left to right when the chart builds. The legend shows the same line. `--tablechart-dash` and `--tablechart-dot` set the pattern.



## [0.0.8]

### Changed

- The figure and the table of a chart get the chart's title as their name, with `aria-labelledby`, so a screen reader that jumps to the table reads the title and the unit too. A figure or table with a name of its own keeps it.
- If a donut has no total row, a hidden row with the sum is added to the bottom of its table, so screen readers read the total with a name. The `totallabel` option sets the name, "Total" by default.
- All text in the drawing is `inert`, so Safari with VoiceOver does not read it.
- A full stop, hidden from sight, is put before each line break in the title, so a screen reader pauses between the title and the subtitle.
- The drawing, its names and its legend have `aria-hidden="true"`. The names and the legend are also `inert`, because Safari with VoiceOver read them otherwise. Screen readers read the table, which has the same names and numbers, so they no longer read everything twice.



## [0.0.7]

### Added

- If JavaScript does not run, the table is shown instead of the chart, with `@media (scripting: none)`.
- The names beside the bars of a bar chart wrap if they are wider than `--tablechart-name-max`, 40% of the chart by default. The chart gets taller if a wrapped name needs it.
- A bar chart keeps room after its bars only for the numbers that stand there: the totals of a stacked chart, the numbers of a grouped one, or numbers that do not fit inside their bar. If every number fits inside, the bars use the whole width.
- `--tablechart-type: bar` on a column chart shows it as a bar chart, and `--tablechart-type: column` does the opposite. Set it in a container query or a media query, and the chart is built again as the other kind when the query applies.
- The names under the bars are larger by default: `--tablechart-category-size` is 0.95em. The numbers are 1.3 times the names, so they stay the same size.
- The build makes four files: `tablechart.mjs` (one ES module), `tablechart.js` (for a script tag), `tablechart.css` and `tablechart.d.ts` (all types in one file).
- `@martinomagnifico/tablechart/core` has the building blocks under `init()` and `create()`: `prepare`, `build`, `layout`, `setShown`, `relabel` and `unbuild`, for a script or plugin that decides itself when a chart is built and shown.
- `create(element, options)` makes a chart of one element, and returns it. Each chart is also on its element as `element.tablechart`, with `refresh()` and `destroy()`. `init()` returns these charts in `charts`.
- `init()` returns `refresh()`, which lays out every chart again, for example after a script has changed the text of a chart.
- If the `lang` attribute of the page changes, the charts are laid out again a moment later, so new text that is longer or shorter fits.
- The `langattribute` option is used everywhere: to read keys from the table and to put them on the names in the chart, not only to write them on the table. `false` turns translation keys off.
- `data-chart-keys` on a figure adds translation keys to its names, starting with its value: `harvest-row1` for a row, `harvest-col1` for a column header. It replaces `data-chart-prefix`. An `id` on a figure no longer adds keys.
- With more than three lines, the colour steps between lines are smaller, so the last line is still `--tablechart-series-min` of its colour, now 40% by default.
- If a chart has numbers that were left out because there is no room for them, pointing at a row, or tapping it, shows the numbers of that row, with a faint band behind the row. The other numbers are hidden for that time. The `hover` option, or `data-chart-hover="false"` on a figure, turns it off. `--tablechart-pointer-color` sets the colour of the band. In a chart that can be pointed at, the numbers in the plot cannot be selected.



## [0.0.6]

### Added

- Area chart, `data-chart="area"`: a line chart with the space between each line and zero filled. `--tablechart-area-opacity` and `--tablechart-area-color` set the fill.
- `data-chart-stack` on a column, bar, line or area chart with several value columns: the values of a row are on top of each other. Columns and bars show the total of the row. A number is shown inside its part if it fits.
- `data-chart-shape="step"` on a line or area chart: each value is flat across its row. A step chart has no points and shows a number only where the value changes. A number wider than its rows is left out.



## [0.0.5]

### Added

- First version: column, bar, line, waterfall and donut charts, with annotations, legends and CSS variables.
- A chart builds when it scrolls into view. `threshold` sets how much of it must be in view, and `replay` builds it again each time it comes back into view.
- If a chart is inside something that animates in, it builds when that animation is halfway. If that element is still invisible (opacity 0) when the chart scrolls into view, the chart waits until the element starts to animate in, or becomes visible.
- `--tablechart-bar-max` sets the widest a column, step or bar may be: 60px by default, in `px`, `%`, `em` or `rem`, or `none` for no maximum.
- Row and line numbers in the markup start at 1: a bracket's `data-from` and `data-to`, an annotation's `data-series`, and the `data-series` and `data-slice` attributes on lines, points, names and slices.
- A break in the scale is cut out of the bars with a mask, so the background behind the chart shows through the gap, whatever it is.
- The gaps between donut slices are cut out of the ring with a mask, so the background shows through. `--tablechart-slice-gap` sets their width. `--tablechart-slice-gap-color` is gone.
- A class on a table row is copied to its bar, slice, number and name, so one class styles everything drawn for that row. Bars have `data-row`, counted from 1.
- A number inside a bar is dark or light, whichever reads on the colour of the bar. The ink variables still set it.
- `--tablechart-surface` is the browser's page background by default (`Canvas`), so it follows `color-scheme`: white in light mode and dark in dark mode. Only the lighter colours of lines and slices are mixed with it.
- Open points on a line and the callout of a bracket or trend arrow are cut out of the marks under them with a mask, so the background behind the chart shows through. `--tablechart-badge-surface` has no default.
- Grouped column and bar charts: if the table has more than one value column, each row is a group with one bar per column, and the names are in a legend.
- A bar chart is at least tall enough for a number beside every bar, so it gets taller on a narrow screen instead of hiding its numbers.
- `--tablechart-min-height`: on a narrow screen, a chart is never less high than this, 200px by default. Below that width, the height stays the same.
- In a waterfall, and a column chart with numbers inside, a number only goes inside its bar if it fits in the width too. If one number does not fit, all numbers go outside.
- The numbers of a grouped chart get smaller together to fit, down to 70% of their size. If they still do not fit, none of them are shown, so they never disappear one by one while the chart gets narrower.
- The names under the bars get smaller together if one does not fit its column, down to 70%. They stay centred under their bars.
- The rules for labels are in one place (`functions/labels.ts`), so every chart type uses the same ones.
