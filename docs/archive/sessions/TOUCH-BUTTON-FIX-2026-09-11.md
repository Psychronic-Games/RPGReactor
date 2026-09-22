# Menu and shop touch-button fix — 2026-09-11

## Reproduction and cause

The reported top-right menu/cancel buttons and shop quantity/confirm buttons all use `Sprite_Button`. In a disposable copy of Hendrix RPG Maker Action Combat MZ (v166a), the visible menu button returned `undefined` for `worldVisible` under Pixi 8.20.0. `Sprite_Clickable.isClickEnabled()` returns that property, so every mouse/touch press was rejected before hit testing.

The compatibility layer now restores the legacy `PIXI.Container.worldVisible` getter when it is absent. It checks the object's own visibility and all ancestors live, without requiring a render pass. It preserves the legacy distinction between visibility, alpha, and renderability, and leaves an existing getter intact. This also covers plugin-created clickable sprites.

Restoring input exposed a second issue: `Sprite_Button.update()` processed touch both through `Sprite_Clickable.update()` and directly. A fast press/release received between frames could invoke a handler twice. The redundant call is removed; the inherited call still updates the pressed state before frame/opacity rendering.

## Verification

- Five regression tests use real Pixi containers/sprites and the runtime pointer state machine: ancestor visibility, normal press/release, fast clicks, hidden/dragged-out cancellation, and repeat compatibility installation.
- Native `nw-touch-buttons.cjs` reproduces the disabled menu button before the fix and passes **nine checks each** in Hendrix and Barebones afterward. Uses actual WebDriver mouse actions and browser touch events: menu open/close with both input types, all four shop quantity buttons, and confirmation purchasing exactly one item for the expected price. No runtime errors were captured during these checks.
- **3,034 automated tests pass**, zero failures, skips, or cancellations. Revision assertions were updated to the new runtime stamp.
- Runtime synchronization and patch hygiene pass. All **3,584 authored data/metadata files and plugin manifests** checked before/after synchronization remain byte-identical.

The smoke harness uses disposable runtime copies and isolated browser profiles. It retains each project's plugin configuration, suppresses map events in memory to isolate controls, and makes no authored project-data changes. Touch events are simulated in Chromium; physical touchscreen hardware and full game playthroughs were not tested.

## Delivery

Runtime revision is **20260911.1**; editor version stays **0.98.6**. The changed compatibility layer, sprite code, and entry-point stamp are synchronized to all 13 bundled/local projects. The editor's existing runtime-revision check refreshes other Reactor projects when reopened. Deployed games need an updated build.

Logs: `/tmp/rr-touch-buttons-before.log`, `/tmp/rr-touch-buttons-after.log`, `/tmp/rr-touch-native-before.log`, `/tmp/rr-touch-native-hendrix.log`, `/tmp/rr-touch-native-barebones.log`, `/tmp/rr-touch-full-final.log`. Authored-file hashes: `/tmp/rr-touch-authored-hashes.json`.

Changes remain local and uncommitted. Earlier translation, PR #56, splash-screen, and other working changes are preserved.
