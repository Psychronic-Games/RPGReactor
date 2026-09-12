# Event model lighting and 48px icons

In the editor's 2D map view, model-bound event previews were cached thumbnails rendered with a fixed preview light rig. Placed props already had retained model textures with a per-model map light field. Event previews now share that renderer, including ambient colour, nearby surface lights and shadow participation. Each visible event page contributes a temporary render record with a negative ID, keeping it separate from authored props and prop-tool selection. Moving an event retains its render instance; hiding/changing a preview or switching maps retires obsolete instances. Ordinary sprite previews keep their existing path.

This lighting fix covers **editor event previews**. The separate playtest model-rendering path is unchanged.

**Database → System 2 → Asset Sizes → Icon** now includes 48×48. IconSet sheets retain sixteen columns, so a 48px sheet is **768 pixels wide** and its height is a multiple of 48. Changing the setting does not resize source artwork. Shared icon pickers, plugin icon fields, Database previews, Show Text, interface source sampling, and the action-sequence weapon preview use configured source dimensions. Small list icons retain their existing display size. The icon picker fits the sheet to its available width and converts pointer coordinates back into the sheet, including the last column. Runtime ImageManager icon dimensions initialize from System 2 at boot.

## Verification

- **3,050 Node tests pass**, including all configured icon sizes, selection through a scaled picker, and event-preview records that leave authored map data unchanged.
- **33 native small-art/icon checks pass** with 48px icons, 288px faces and 16px tiles: correct selected option, actual item preview pixels, a real click selecting icon 31 in a fitted sixteen-column grid, and runtime drawing of the same cell. Existing tile/face/window/zoom checks also pass.
- Native GPU event-model checks use the actual Demo Reactor model bound to an event. A nearby elevated light changes **228,563 pixels**, with unchanged alpha. Model-local lighting agrees with the translated world-space reference (mean channel error below 0.000001), uniforms remain isolated, removing the light restores the original pixels, movement retains the instance, and hiding the preview destroys its sprite/target without adding authored props.
- Runtime **20260911.4** (icon initialization) matches all **13 bundled projects**. Editor remains **0.98.6**. [Recorded evidence](event-lighting-icons48-native-2026-09-11.json).

```sh
node --test editor/tests/*.test.cjs
DISPLAY=:0 node editor/tests/smoke/nw-event-model-lighting.cjs
DISPLAY=:0 node editor/tests/smoke/nw-flat-model-lighting.cjs
DISPLAY=:0 node editor/tests/smoke/nw-small-tiles.cjs --tile-size=16 --face-size=288 --icon-size=48 --evidence=/tmp/rr-icons48
node editor/build-scripts/sync-runtime.cjs --check
```

Native runners create disposable projects and should run sequentially. Logs/images: `/tmp/rr-event-model-*`, `/tmp/rr-icons48*`, `/tmp/rr-prop-lighting-regression.log`. Full test log: `/tmp/rr-icons48-tests.log`.

## System 2 layout follow-up

Pixelated Rendering no longer inherits full-width text-field sizing and padding. It uses the standard 14×14 themed checkbox with an accessible label. The SV Attack Motions table no longer adds an 8px top margin inside its border, eliminating the empty bordered strip above the header.

Native checks at 1280×720 and 1920×1080 confirm a square checkbox, aligned header/body columns and no extra header gap. Toggling still updates the boolean setting and attack-motion rows still open their editor. The three existing System 2 tests pass. Evidence: `/tmp/rr-system2-verified.json`, `/tmp/rr-system2-before.png`, `/tmp/rr-system2-after.png`.
