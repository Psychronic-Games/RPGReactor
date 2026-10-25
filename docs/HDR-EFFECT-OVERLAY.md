# HDR effect overlay

RPG Reactor 0.99.2 (runtime revision **20261025.1**) includes HDR effect rendering.
There is no plugin to install or enable. An effect opts in through a sidecar next
to its `.efkefc`; ordinary effects retain their existing draw path.

HDR materials emit exposed linear light. The overlay adds the animations sharing
a display grade into one floating-point target, adds reduced-resolution bloom,
and applies that grade once to the sum. Output is display SDR; this does not
enable HDR monitors, change the game's lighting, or grade the entire scene.

## Updating Reactor and existing projects

The canonical module is `runtime/reactor_hdr_overlay.js`. `reactor_main.js` loads
it automatically. New projects inherit it through the normal runtime copy.
The editor's existing runtime refresh installs it in older Reactor projects when
their runtime revision changes. Game and editor distribution preflights require
the module, and the bundled Demo carries the same runtime.

Use the complete runtime from the same Reactor build. Mixing a new module with
old core/manager/sprite files does not install the native hooks. To update a
project by hand, back up its `js/` and copy the `reactor_*.js` files from
`runtime/` into it, except `reactor_plugins.js`, which belongs to the project.

A project that still enables the overlay's earlier standalone plugin, under the
name `ReactorHdrOverlay`, keeps working: plugin setup passes that entry's
parameters to the built-in overlay and skips its script, so the two never both
render. The entry and its file can be removed after upgrading. A renamed copy of
that plugin is not recognized and must be disabled by hand. Other plugins load
as usual.

## Installing an HDR effect

Install all three files together, along with their referenced resources:

```text
effects/MyEffect/MyEffect-hdr.efkefc
effects/MyEffect/MyEffect-hdr.hdr.json
effects/MyEffect/MyEffect-ldr.efkefc
effects/MyEffect/Materials/...
effects/MyEffect/Texture/...
effects/MyEffect/Model/...
```

Set the animation's effect name to `MyEffect/MyEffect-hdr`, without an extension.
Keep the normally graded twin installed. Unsupported float rendering or a grade
compile failure selects that twin. Playback waits for the metadata request before
starting; requests are cached once per effect, including missing sidecars, and
abort after 15 seconds. Invalid/unreadable metadata fails closed because a safe
twin cannot be established. A conventional `-hdr` filename without metadata also
fails closed. Reload the game after changing a cached sidecar.

## Sidecar contract

```json
{
  "version": 1,
  "gradeInput": "hdr",
  "grade": "vec3 tmOut = hdr / (hdr + vec3(1.0));",
  "bloom": {
    "intensity": 0.675,
    "sizes": [0.3, 1, 2, 10, 30, 64],
    "tints": [0.3465, 0.138, 0.1176, 0.066, 0.066, 0.061],
    "radiusScale": 2.4
  },
  "fallback": "MyEffect-ldr"
}
```

The grade is trusted effect code in GLSL ES 1.00. It reads a local `vec3 hdr`
containing exposed light plus bloom, and declares a local `vec3 tmOut` containing
display RGB. Do not apply exposure again. One program is compiled per distinct
grade string. The example is a simple test grade.

Fallback names without `/` resolve beside the HDR effect; names containing `/`
resolve from the `effects/` root. Do not include `.efkefc`. The fallback must be
an independently usable, normally graded effect, not another HDR asset.

Sizes and tints contain six finite values: sizes must be positive, tints and
intensity nonnegative, radiusScale positive. `tints` are scalar bloom weights.
The six sizes follow UE 4.27's width-relative bloom radii; Gaussian sigma is
`viewWidth * size * 0.04 * 0.5 / sqrt(33.4) * radiusScale`.

## Authoring and tuning

An HDR asset's materials output exposed linear light, not display-graded colour,
and it carries no baked bloom stand-ins or refraction/distortion nodes (see
Rendering limits). Reactor does not author HDR assets; they come from whatever
tool exported the effect. Build and install the normally graded variant
separately as the declared twin.

The defaults above are the sidecar defaults. A game's startup script can override
tuning for all HDR effects:

```js
ReactorHdrOverlay.configure({ bufferType: "auto", debug: false });
window.REACTOR_HDR = { bloom: 0.675, bloomScale: 2.4 };
```

`bufferType` is `auto`, `half`, or `float`: auto tries half first, then float.
It requires renderable, linearly filtered targets in the overlay's WebGL1 context.
Legacy plugin parameters `bloomIntensity`, `bloomRadiusScale`, `bufferType`, and
`debug` are accepted by `configure`; global `REACTOR_HDR` overrides their tuning.
Without overrides, each grade group's first sidecar supplies bloom settings.
Use consistent bloom settings for effects sharing a grade.

For diagnostics, `REACTOR_HDR.debugScale` shows buffer light divided by a positive
value. `probeScale` records a quantized lower bound in
`ReactorHdrOverlay.stats.probe`; `probeFrame` limits sampling to that effect frame.
`measureGpu: true` uses synchronous `gl.finish()` around postprocessing and records
`postSamples`; it changes timing and is for measurement only. Statistics include
draw/group counts, target allocations, size, type and accumulated post time.
Testing markers `[HDR]` and `REACTOR_HDR_IDS` still require a valid sidecar or a
complete `ReactorHdrOverlay.overrides[effectName]` entry, including fallback.

## Rendering limits

- All ordinary animations draw in their original order, then HDR groups composite
  in first-appearance order. Animations sharing a grade add before grading even
  when ordinary animations occur between them. Interleaved scene/HDR occlusion
  and light accumulation between different grades are not supported.
- The default is screen compositing over the scene and ordinary effects. As
  measured on Effekseer's WebGL runtime, additive alpha uses `(SRC_ALPHA, ONE, ONE, ONE)`;
  ordinary blend uses `(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE)`. Both add alpha,
  so alpha is not reliable coverage. Translucent HDR layers cannot darken the
  scene. Experimental `REACTOR_HDR.coverage = true` uses the accumulated alpha;
  it is unsuitable for mixed additive/translucent effects without corrected
  coverage data.
- The target covers the overlay, with seven downsample and twelve blur passes
  plus one composite per grade group. Bloom intensity zero skips all 19 bloom
  passes. Allocations are lazy and reused; resize recreates them. Context loss
  invalidates them, restoration creates them on the next HDR animation. The
  native module ends active HDR effects at context loss; it does not preserve
  their clock. New animations wait until the context is restored.
- This supports the PixiJS 8 WebGL1 effect overlay. Scene-owned 3D effects and
  older inline Pixi render paths do not use it. Refraction/distortion nodes must
  be excluded from HDR assets. A future authoring approach can start a separate
  ordinary refraction twin alongside the HDR effect; Effekseer cannot filter
  individual nodes during a draw. That synchronized twin is not implemented here.
- The editor's animation previews have no HDR pipeline. They play the sidecar's
  normally graded twin instead, and refuse what the game refuses; Database ›
  Animations says which, under the preview. The HDR look shows only in the game.

## Verification

Run `node --test editor/tests/hdr-overlay.test.cjs` for metadata, safe fallback,
shared grading, resize/restoration, ordinary draw order, and plugin migration.
Manifest and template tests cover loading and distribution. Unit tests do not
establish GPU rendering or appearance; check those in a running game.
