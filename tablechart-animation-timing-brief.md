# Brief: rework tablechart animation timing

## Goal

Make the build animation of tablechart predictable and easy to explain. Today the total time of a chart grows with its number of elements and nobody can set a ceiling. We want three clear settings (time per element, stagger as a ratio of that time, and a maximum total time), one rule for what gives when the maximum is hit, and a donut that grows at one constant angular speed. Defaults must reproduce today's look. Read the code first and confirm every assumption below before changing anything. If something here disagrees with the code, trust the code and tell Martijn.

## Current behaviour

The tokens live in src/style/includes/_tokens.scss: --tablechart-duration (0.5s, applied per element), --tablechart-stagger (0.12s, in seconds) and --tablechart-easing.

In src/style/includes/_animation.scss, bars, columns and donut slices get a transition-delay of var(--i) times the stagger. The --i value is the row's slot, set from JS (steps.ts, core.ts and charts/*.ts). The total therefore grows with the number of elements: 3 bars take about 0.74s, 10 bars about 1.6s. Values, names, leaders, points and the donut centre are delayed by (i + a fraction) times the stagger.

Line charts are different: line.ts limits the build to six stagger steps and reveals the line with a clip at even speed. The data-animate="up" mode scales a whole series as one piece in 1.6 times the duration, whatever the number of points. A waterfall builds one column per step, where a step equals the duration, and draws a connector between columns (see the waterfall block at the bottom of _animation.scss).

The donut draws every slice as its own circle with a dasharray transition of the same duration, whatever the arc. A big slice therefore sweeps faster than a small one, and because the stagger is shorter than the duration, several slices grow at the same time from start angles that the previous slice has not reached yet.

## The model

Call the time of one element e, the stagger ratio r (the gap between the starts of two elements is r times e) and the number of elements n. The total is e times (1 + (n - 1) times r). Check: r = 1 gives n times e, r = 0 gives e, and r = 0.33 with three elements gives 1.66 times e.

Three settings, all plain custom properties so they cascade and can be overridden on any scope (a figure, a slide, a whole section):

- --tablechart-element-duration: the time of one element. Replaces --tablechart-duration, which is misleadingly named.
- --tablechart-stagger-ratio: the stagger as a ratio of the element time. The default is 0.24, which equals today's 0.12s over 0.5s.
- --tablechart-max-duration: a ceiling on the total build time of one chart. It is a ceiling and never a target, so a small chart is not stretched.

## The cap rule

When the natural total is above the maximum, only the stagger gives. The element time stays as authored. The element time is only touched when the stagger is already zero and a single element is longer than the maximum: e_eff = min(e, max). The reason is that shrinking the element time as well makes large charts snap in as a flicker and throws away the motion that was designed.

The effective stagger is min(stagger, (max - e_eff) / (n - 1)) with n of at least 2. The --rows property already exists on the figure and is used in the area fill, so this may be possible in CSS alone. Check that it is a unitless number on every chart type. Steps (fragments) count slots within a step, so the cap applies per step, with n being the largest slot count in that step.

Open decision, ask Martijn before choosing: whether the maximum has a default. Option one is no default (unset means no cap and nothing changes for anyone). Option two is a default derived from the element time, for example four times the element duration (2s at the default), which scales with the duration but changes today's behaviour for bar charts with more than about 13 bars and waterfalls with more than four columns. The suggestion is option one.

## Per chart type

Bars and columns: use the model as described. Delays of values, names, leaders, points and the centre total must be expressed relative to the element time (the element's own start plus a fraction of e), not as a fraction of the stagger. Otherwise they land together with the bar when the stagger shrinks to zero.

Waterfall: no special case. It is the same formula with a default ratio of 1, which is exactly today's step time. The cap squeezes it the same way as the others, which means the columns overlap and the pauses between them disappear, while the order stays left to right. Keep the connector timings as fractions of e (start at 0.6 e, draw for 0.4 e) so each connector keeps arriving just behind its own column.

Line and area: line.ts hardcodes a limit of six stagger steps. See whether that can become an expression of the same maximum setting so there is one mechanism instead of a special case. Do not change how lines look by default. The "up" mode has a fixed time of 1.6 e, so it only needs min() with the maximum.

Donut: replace the uniform slice duration with one constant angular speed, so the angular speed is the same for every slice. The JS passes two numbers per slice: --share (its fraction of the ring) and --from (the summed shares of the slices before it, counting only slices in the same reveal step, so a gap left by a slice that appears in a later step does not cause a pause). CSS then derives the rest:

- A slice's duration is its share times the full-circle time, with linear easing.
- A slice's delay is the stagger ratio times the full-circle time times --from.
- Ratio 1 is a single continuous sweep with a slice starting exactly when the previous one ends. Ratio 0 starts all slices together, each at the same angular speed. Values in between give several arms growing in parallel at the same speed. A slice's start time is proportional to its start angle, so the stagger is regular in angle rather than in time.
- The full-circle time defaults to about 1s (two times the element duration), and may be its own variable if that reads better.
- Under the cap, the ratio shrinks first, and only if even ratio 0 is too long does the full-circle time shrink, for all slices at once, so the angular speed stays equal across slices.
- The cap needs the finishing time of whichever slice ends last, which is the largest of (ratio times --from plus --share) over the slices. That is not a closed form in CSS, so let the JS compute the span in units of the full-circle time, and decide whether it reads the resolved ratio or passes the numbers for CSS to combine.
- Leaders, labels and the centre total must follow the slice's own timing (its midpoint or its end), not slot times stagger, so a label never appears before its slice has arrived.
- The default ratio for the donut is a design choice: 1 gives the clean sweep, a lower value gives the overlapping look. Suggest 1 and let Martijn judge it in the docs demo.

## Renaming and compatibility

Tablechart has been public for about a week, but keep the old names working for one minor version.

- In _tokens.scss, resolve the element time as var(--tablechart-element-duration, var(--tablechart-duration, 0.5s)). The new variable wins when both are set.
- The old --tablechart-stagger is in seconds and the new one is a ratio, so they cannot share a name. Resolve the effective stagger as var(--tablechart-stagger, calc(var(--tablechart-stagger-ratio, 0.24) * element-duration)). If someone still sets the old seconds value it keeps working, otherwise the ratio decides.
- Add a one-time console warning in the JS at init if it finds the old variables set on a figure (via getComputedStyle), naming the replacement.
- Update the docs and add a CHANGELOG entry that lists the new variables, the deprecations, the removal target (next minor version) and the donut change, which is a visible change in how donuts animate.
- Under prefers-reduced-motion nothing changes: the existing override still forces near-zero durations and delays.

## Out of scope

Bars and columns could also grow at one constant speed with the duration proportional to the value, the same idea as the donut. It is parked for now. Do not implement it.

## Checks

Compare the default look before and after for bars, columns, line, area, waterfall and donut (it must be the same except the donut). Then test bar charts with 3, 10 and 30 elements with and without a maximum, a waterfall with 10 columns under a 2s maximum, a donut with very uneven slices, a donut revealed in steps with non-adjacent slices in one step, and a maximum set as a scoped override on a section or slide that contains several charts. Add the maximum and the stagger ratio to the docs with one sentence that explains them: each element takes this long, the next one starts after this fraction of that, and if the whole chart would take longer than the maximum, the starts move closer together.
