# Model inspection and light-theme refinement — 2026-09-11

Model inspection previews borrowed the current map's lighting uniforms, and several preview scenes used fixed dark backgrounds. Inspection materials now own a neutral light field at full ambient strength. Changing map ambient or point lights no longer changes the model being inspected. Database, Resource Manager, model picker, Event Page and generated thumbnails use this isolation; the thumbnail cache version is now 4 so old dim thumbnails regenerate.

Explicit light-effect editing uses a separate 0.35 ambient field to make falloff visible. Returning to normal inspection restores full ambient strength. Effect inspection does not overwrite the current map's uniforms. Models placed on the map, including events in the editor's 2D view, still respond to map lighting.

## Appearance

- The **What this model costs** card has a **black header, bold white title and grey body in default dark mode**, with the existing narrow accent strip. Other dark palettes use their deep header color. This preserves the user's requested dark styling.
- Light mode retains colorful panels with richer fills and stronger section headers. Model preview backdrops follow the theme without dimming model materials. Cost badges have explicit readable foreground/background pairs.
- Follow-up: restored the tileset palette renderer and transparent container from before this pass, including its original checkerboard colors. Its background is no longer coupled to revised text contrast colors. The empty map underlay remains solid.
- Light-mode map information and checkboxes use a white strip, distinct from the colored toolbar and left section headers.
- Palette, Events, Maps and Quick Access scrollbars use the accent color. List insets keep highlights away from scrollbars. The map canvas scroll thumbs also use the accent.

## Verification

Follow-up: existing native theme checks pass in all 14 variants after the map-strip and palette restoration. [Updated workspace](model-inspection-2026-09-11/restored-palette-light-workspace.png). Earlier inspection results below describe the previous pass, including its now-reverted solid palette check.

- Full Node suite: **3,052 tests pass**, with no failures or skipped tests.

- Native model inspection: eight behavior checks, all 14 theme variants, identical model pixels when map lighting changes, isolated effect lighting and reset, neutral thumbnails and model pickers, solid palette background, and no captured app errors. Adaptive geometry reduction is disabled in this disposable test so theme screenshots show the same geometry.
- Cost badge text contrast is at least 8.32:1; cost header text contrast is at least 8.86:1 across the checked themes.
- Native UI theme pass: all 14 variants, undimmed enabled icon artwork, 112 light-theme text contrast pairs, list gutters and category scrolling. The earlier 399-case layout audit remains documented separately; it was not repeated for these color refinements.
- Native model-effects regression: both copied Reactor effect layers render, the working anchor follows the copy, and closing disposes it. The smoke test now reads the active GPU target rather than an unused fallback canvas.
- Native editor 2D event-lighting regression: 228,563 pixels respond to the light, uniforms remain isolated, and reset/lifecycle checks pass.

These are measured checks of the affected surfaces, not a claim that every app control has been audited for accessibility.

[Native results](model-inspection-native-2026-09-11.json). Screenshots: [dark model card](model-inspection-2026-09-11/dark-model.png), [light model card](model-inspection-2026-09-11/light-model.png), [gold workspace](model-inspection-2026-09-11/light-workspace.png), [gold States](model-inspection-2026-09-11/light-states.png), [ocean States](model-inspection-2026-09-11/ocean-light-states.png).

## Reproduce

```sh
cd editor
npm test
cd ..
DISPLAY=:0 node editor/tests/smoke/nw-model-inspection.cjs
DISPLAY=:0 node editor/tests/smoke/nw-model-effects.cjs
DISPLAY=:0 node editor/tests/smoke/nw-event-model-lighting.cjs
DISPLAY=:0 node editor/tests/smoke/nw-ui-quality.cjs --themes-only
```

Run native drivers sequentially; they use disposable projects and desktop windows. Editor remains 0.98.6 and runtime remains 20260911.4.
