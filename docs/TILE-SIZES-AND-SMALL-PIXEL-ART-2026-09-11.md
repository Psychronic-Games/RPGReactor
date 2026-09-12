# Tile sizes and small pixel-art support — 2026-09-11

Added 64×64 and 8×8 tiles and addressed the reported small-preview, face-sheet and window-sizing issues. Editor version remains 0.98.6; runtime revision is **20260911.2**. Existing local work is preserved.

## Using the changes

- **Database → System 2 → Tile:** choose 64, 48, 32, 24, 16 or 8. Supply artwork at that cell size; changing the setting does not resize image files.
- **Database → Tilesets → Zoom:** 50–800%. Small sheets open enlarged so cells are at least 32 display pixels. Zoom affects the preview only. It works on A1–A5 and B–G, with scrolling for enlarged sheets. Click and directional-passage coordinates are converted back to source pixels; existing brush and 3D drag handlers already handle display scaling.
- **Database → Actors → Change Face:** sheet selection now uses the System 2 Face size. A 32-pixel face sheet with four columns and two rows exposes all eight faces. Actor previews remain enlarged for inspection, using nearest-neighbor sampling. Shared face geometry also serves message/actor-image selectors and database previews; interface face drawing and event-command thumbnails use the configured source cell size. Runtime face dimensions initialize from the same setting at boot.
- **Select Character Graphic → Zoom:** 50–800%, plus the current automatic fit when it falls between presets. Small frames initially grow toward 64 display pixels, up to 8×. Zoom preserves the selected character/frame/direction.
- **Database → User Interfaces → Layout → Zoom:** Fit or 50–800%. The canvas scrolls when enlarged; stored layout coordinates remain in game pixels.
- **System 2 → Advanced → Pixelated Rendering:** opt-in nearest-neighbor enlargement of the entire game frame, including windows and text. The frame renders at game resolution. Font glyphs still use their font’s native rasterization; this does not convert a smooth font into pixel-font artwork. Default rendering remains unchanged when the option is off.
- **System 2 → Screen Width / Height / Scale:** the existing controls can now shrink native game windows. Runtime boot clears an inherited NW.js minimum window size before resizing. New project packages no longer impose a 1280×720 minimum. Fullscreen remains fullscreen; browser pages retain their host window behavior.

## Sheet dimensions

The grid layout and tile IDs do not change. Width and height scale with cell size, including F and G.

| Sheet | 64 px | 48 px | 32 px | 24 px | 16 px | 8 px |
| --- | --- | --- | --- | --- | --- | --- |
| A1 / A2 | 1024×768 | 768×576 | 512×384 | 384×288 | 256×192 | 128×96 |
| A3 | 1024×512 | 768×384 | 512×256 | 384×192 | 256×128 | 128×64 |
| A4 | 1024×960 | 768×720 | 512×480 | 384×360 | 256×240 | 128×120 |
| A5 | 512×1024 | 384×768 | 256×512 | 192×384 | 128×256 | 64×128 |
| Each B–G | 1024×1024 | 768×768 | 512×512 | 384×384 | 256×256 | 128×128 |

64-pixel sheets fit the current 1024-pixel atlas slots. Larger sizes are not enabled by this change.

## Validation

- **3,038 Node tests passed**, including new configurable-face, window-sizing, pixelated-output and supported-size tests. Existing renderer sampling and overlay tests now include 64 and 8; they exercise autotile shapes/animation, A5 and B–G source rectangles, destination placement, bounds and flag marks.
- **66 native checks passed:** 22 each for 64-, 16- and 8-pixel projects. NW.js/Chromium 144 on Linux, using disposable copies of Demo with real tileset images resized by Pillow with nearest-neighbor sampling. Original artwork was not modified.
- Native checks cover requested editor/runtime/3D tile metrics; F sheet split dimensions; initial small-sheet enlargement; real mouse clicks on a zoomed F tile; actual pixel color from face index 5 of a 32-pixel face sheet; character zoom; interface zoom/scrolling; 816×624 native client area; 384×288 at Screen Scale 2 giving 768×576; pixelated frame settings; a fully started 2D map submitting real tile geometry with no atlas fallback or loading error.
- Runtime fixture includes all eleven sheets, with both F/G normal tiles and A1–A5 examples on the map. 3D size retrieval is checked; a full visual 3D-map test at every size and third-party plugin compatibility are outside these native checks.
- All **13 bundled project runtimes** match the canonical runtime after synchronization. Authored project assets and plugin manifests were not changed by these fixes.
- Evidence: [native results](small-pixel-art-native-2026-09-11.json). Screenshots/logs are under `/tmp/rr-small-tiles-{64,16,8}*`; full test log is `/tmp/rr-small-tiles-final.log`.

Reproduce:

```sh
node --test editor/tests/*.test.cjs
node editor/tests/smoke/nw-small-tiles.cjs --tile-size=64
node editor/tests/smoke/nw-small-tiles.cjs --tile-size=16
node editor/tests/smoke/nw-small-tiles.cjs --tile-size=8
node editor/build-scripts/sync-runtime.cjs --check
```

The native runner requires the local NW.js SDK/chromedriver, a display, Python 3 and Pillow. It creates and deletes its own project/profile copies. A missing Demo character reference was found while checking the 8-pixel screenshot; the fixture now supplies its own tiny character and single-member party, and the runner requires the map to finish starting and submit geometry before passing.

## Camera feedback follow-up

Default 2D camera zoom and X/Y framing offsets are now implemented, along with the additional 288×288 face-size option. See [camera and large-face verification](CAMERA-AND-LARGE-FACES-2026-09-11.md) for controls, behavior and tests. Existing 3D camera controls remain separate.
