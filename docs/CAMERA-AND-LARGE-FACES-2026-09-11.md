# 2D camera framing and 288px faces

Database → System 2 → Advanced now offers **2D Camera Zoom** (1–8×), **2D Camera Offset X (px)** and **2D Camera Offset Y (px)**. Defaults are 1× and zero offsets. Positive offsets frame the player's tile farther right/down; negative offsets frame it left/up. Offsets use logical game pixels before Screen Scale. Map boundaries take priority over the requested framing; extreme offsets are constrained to keep the player's tile in view.

The camera scales map graphics, weather and native world lighting. Pictures, timers and menu layouts retain their usual size. Pointer navigation reverses the camera transform and composes with event screen zoom/shake. Follow scrolling, map edges, loop seams, transfers, menu returns and saved scroll positions use the same viewport. Maps marked as 3D retain their existing camera controls. With default settings, existing input and plugin sprite transforms are preserved. Third-party camera plugins that also transform the map may need their own integration when this feature is enabled.

Database → System 2 → Asset Sizes → Face now includes **288×288**. Faces use four columns: a standard eight-face sheet is **1152×576**; additional rows remain supported. Actor previews fit the selected source cell into the existing preview. Runtime windows read the configured cell dimensions; layouts with smaller portrait slots retain their existing cropping behavior.

## Verification

[Recorded native results](camera-large-faces-native-2026-09-11.json). Full Node test log: `/tmp/rr-camera2d-full-final.log`.

- All **3,046 Node tests pass**. Camera regressions cover all six tile sizes, fractional/integer zoom, tracking in four directions, map bounds, loop seams, inverse event zoom/shake, invalid settings, 3D exclusion and preservation of existing scroll/plugin transforms. Face geometry tests include 288px cells and extended rows.
- **75 native camera checks passed** (25 each at 64px, 16px and 8px). Checks use disposable projects with resized copies of actual tilesets, including F/G layers. Each size exercises editor save, real mouse and touch navigation, event zoom, boundaries, menu return, save/load, changing framing, transfers and loop seams.
- **25 native face/small-art checks passed** with 288px faces. Checks use a disposable 1152×576 test sheet, verify the selected 288px option, sample the Actor preview and actual runtime window pixels, and confirm runtime cell dimensions.
- Runtime revision **20260911.3** is synchronized to the 13 bundled projects. Editor remains **0.98.6**.

Run native tests sequentially on a desktop: simultaneous visible app windows can interfere with real pointer input.

```sh
node --test editor/tests/*.test.cjs
DISPLAY=:0 node editor/tests/smoke/nw-camera-2d.cjs --tile-size=64 --evidence=/tmp/rr-camera2d-64
DISPLAY=:0 node editor/tests/smoke/nw-camera-2d.cjs --tile-size=16 --evidence=/tmp/rr-camera2d-16
DISPLAY=:0 node editor/tests/smoke/nw-camera-2d.cjs --tile-size=8 --evidence=/tmp/rr-camera2d-8
DISPLAY=:0 node editor/tests/smoke/nw-small-tiles.cjs --tile-size=16 --face-size=288 --evidence=/tmp/rr-faces-288
node editor/build-scripts/sync-runtime.cjs --check
```

The native runners require NW.js/chromedriver, a display, Python 3 and Pillow. Screenshots and per-run results are written under the supplied evidence prefix. Fixtures are removed after each run; source artwork is preserved.

## Picker follow-up

A closer review found two remaining Show Text preview assumptions: the selection preview drew at source size into a fixed 144px canvas, cropping large faces and leaving small faces tiny; the message preview still sampled 144px source cells. Both now use configured source geometry and the preview's display dimensions. The 8px passage overlay also used a negative font size for above-character stars; its margin now scales with the tile.

The full suite passes **3,048 tests**, including preview sampling/display bounds at all six face sizes and valid star fonts at all six tile sizes. The native picker runner now clicks the last cell in both Actor and Show Text face pickers and samples the resulting Show Text preview. Sizes remain project-wide settings: source sheets must match System 2, and changing the setting does not resize artwork automatically.

**56 native checks passed:** 28 with 288px faces/16px tiles and 28 with 32px faces/8px tiles. [Recorded picker results](picker-sizes-native-2026-09-11.json). This follow-up changes only editor code; runtime remains 20260911.3.
