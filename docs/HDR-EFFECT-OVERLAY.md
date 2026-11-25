# HDR effects

RPG Reactor can draw Effekseer effects in high dynamic range: an HDR effect's materials give off light brighter than white, the light of every effect sharing a grade is added together with bloom, and the grade turns the sum into display colour once. There is no plugin to install. An effect opts in with a sidecar file next to its `.efkefc`; every other effect draws as before.

The output is ordinary display colour. HDR effects do not drive HDR monitors, change the game's lighting or grade the rest of the scene.

On PIXI's WebGL2 renderer, HDR animations are drawn inside the scene with the other screen animations ([Effekseer effects in the scene](EFFEKSEER-IN-SCENE.md)). They use the same light buffer, bloom and grade, and are screened into the scene where the animation sits. The overlay this page describes is the fallback, and what a game with `Graphics.effekseerInScene = false` uses.

## Adding an HDR effect

1. Put the HDR effect, its sidecar and its normally graded twin in one folder under `effects/`, with the resources they use. An effect with a [companion](#adding-a-companion-effect) has a fourth file, here `MyEffect-body.efkefc`:

   ```text
   effects/MyEffect/MyEffect-hdr.efkefc
   effects/MyEffect/MyEffect-hdr.hdr.json
   effects/MyEffect/MyEffect-ldr.efkefc
   effects/MyEffect/MyEffect-body.efkefc
   effects/MyEffect/Materials/...
   effects/MyEffect/Texture/...
   effects/MyEffect/Model/...
   ```

   Install them in this order: the twin first, then the companion if there is one, and the HDR effect with its sidecar last. The files a sidecar names are then in place before the sidecar is.

2. Write the sidecar (see [The sidecar file](#the-sidecar-file)), with `fallback` naming the twin.
3. Set the animation's effect name to `MyEffect/MyEffect-hdr`, without the extension.

The twin plays wherever HDR cannot: a computer without floating-point render targets, or a grade that does not compile. Keep it installed.

Playback waits for the sidecar to load before it starts. Each effect's sidecar is requested once and cached, including a missing one, and a request gives up after 15 seconds. Reload the game after changing a sidecar.

An effect that cannot be played safely does not play:

- a sidecar that is missing, unreadable or invalid, since no safe twin can be found;
- an effect named with `-hdr` but without a sidecar.

## Making HDR assets

An HDR asset's materials output exposed linear light, not display-graded colour. It must not contain baked bloom stand-ins or refraction and distortion nodes (see [Limits](#limits)); put those, and opaque bodies, in a [companion](#adding-a-companion-effect). RPG Reactor does not make HDR assets; they come from the tool that exported the effect. Build the normally graded twin separately.

## The sidecar file

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

The values above are the defaults. The grade in the example is a simple test grade.

| Field | What it holds |
| --- | --- |
| `version` | `1` |
| `gradeInput` | `"hdr"` |
| `grade` | GLSL ES 1.00 code. It reads a local `vec3 hdr` (exposed light plus bloom) and declares a local `vec3 tmOut` (display RGB). Do not apply exposure again. The grade is trusted effect code; one shader is compiled per distinct grade string. |
| `bloom.intensity` | Bloom strength, zero or more. Zero turns bloom off. Required even when `bloom.intensityKeys` is given. |
| `bloom.intensityKeys` | Optional. Bloom strength keyed over the effect. See [Animating bloom and grade](#animating-bloom-and-grade). |
| `bloom.sizes` | Six positive bloom radii, as fractions of the view's width (Unreal Engine 4.27's bloom sizes). |
| `bloom.tints` | Six weights, zero or more, one per size. |
| `bloom.radiusScale` | A positive multiplier on every radius. |
| `bloom.threshold` | Optional. See [Bloom threshold](#bloom-threshold). |
| `bloom.prefilter` | Optional. Unity's bloom prefilter, in place of the threshold. See [Bloom prefilter](#bloom-prefilter). |
| `gradeB` | Optional, with `gradeKeys`. A second grade, written like `grade`. See [Animating bloom and grade](#animating-bloom-and-grade). |
| `gradeKeys` | Optional, with `gradeB`. How much of `gradeB` plays over the effect. |
| `fallback` | The normally graded twin, without `.efkefc`. A name without `/` is found beside the HDR effect; a name with `/` is found from the `effects/` root. It must be a complete, normally graded effect, not another HDR asset. |
| `companion` | Optional. A normally graded effect played with the HDR effect, named like `fallback`. See [Adding a companion effect](#adding-a-companion-effect). |
| `companionOccludes` | Optional, `true` or `false`; `true` when left out. Whether the companion's opaque parts hide the HDR light behind them. |

A sidecar with a field outside these rules is invalid, and its effect does not play.

The Gaussian sigma of each bloom radius is `viewWidth * size * 0.04 * 0.5 / sqrt(33.4) * radiusScale`.

Bloom settings are taken from the first sidecar in each grade group. Give effects that share a grade the same bloom settings. Animations of one grade whose bloom intensity or grade weight differ at a frame are drawn in separate passes.

### Bloom threshold

`bloom.threshold` works like Unreal Engine 4's bloom setup threshold. When it is a number, the light is multiplied by

```text
clamp((dot(rgb, (0.3, 0.59, 0.11)) - threshold) * 0.5, 0, 1)
```

before any blur. Light whose exposed luminance is at or below the threshold does not bloom, and bloom reaches full strength 2 units above it. A negative threshold lets dark light bloom partly: -0.8 passes 40% at zero. Without a threshold, every pixel blooms.

Unreal runs this step at half its screen resolution. An effect drawn `radiusScale` times larger than in the source game covers that pixel with `radiusScale` pixels, so the step runs at bloom pyramid level `round(log2(radiusScale))` (level 0 is an extra full-resolution pass), and every blur reads that level or a coarser one.

### Bloom prefilter

`bloom.prefilter` is Unity post-processing's bloom prefilter, for effects tuned in Unity:

```json
"prefilter": { "threshold": 1.1, "knee": 0.5, "clamp": 65472 }
```

`threshold` is a number and `knee` is zero or more. `clamp` is optional and positive; Unity's default, 65472, is used without it. The light is clamped to `clamp` in each channel, then multiplied by `max(b - threshold, s) / max(b, 0.0001)`, where `b` is its brightest channel and `s = clamp(b - threshold + knee, 0, 2 * knee)^2 / (4 * knee + 0.0001)`. Every pixel at or above the clamp blooms alike.

The prefilter runs at the same pyramid level as `bloom.threshold`, and replaces it when a sidecar has both. In a GPU capture of a Unity game, the values are in the prefilter pass's constants: `threshold - knee`, `2 * knee` and `1 / (4 * knee)` in one row, the threshold and the clamp in others.

### Animating bloom and grade

`bloom.intensityKeys` changes the bloom strength over the effect:

```json
"intensityKeys": [[0, 0.5], [60, 2.0], [120, 0.2]]
```

Each key is `[frame, intensity]`. There is at least one key, frames increase, and intensities are zero or more. Frames count the effect's own clock: 60 a second at speed 100, `speed / 100` per update at other speeds, and slower in a battle's slow motion. The strength runs in a straight line between keys, and holds the first key's value before it and the last key's after it. `REACTOR_HDR.bloom` overrides the keys, as it overrides `bloom.intensity`.

`gradeB` and `gradeKeys` blend a second grade in over the effect. `gradeB` is a grade string like `grade`. `gradeKeys` is `[[frame, weight], ...]` with weights from 0 to 1: 0 plays `grade`, 1 plays `gradeB`, and values between mix the two outputs. The keys follow the same clock, straight lines and held ends as `bloom.intensityKeys`. Give both fields or neither. Each grade runs in its own function, so both may declare the same local names.

## Adding a companion effect

A companion is one normally graded effect that plays with the HDR effect. It holds what an HDR asset cannot: opaque bodies, and refraction and distortion layers.

```json
"fallback": "MyEffect-ldr",
"companion": "MyEffect-body",
"companionOccludes": true
```

1. Export the companion from the same source as the HDR effect. Keep the node order, spawn and life settings, and every renderer parameter that draws random numbers the same in both. The two share one random seed per cast, so the same particles appear in both only when these match.
2. Leave out of the companion what the HDR effect draws. Nodes kept only so the spawning matches must not draw, and must not write depth.
3. Name the companion in the sidecar's `companion`, without `.efkefc`. It is found the way `fallback` is.

The companion's name must not be empty, end in `.efkefc`, or name the HDR effect or its twin; such a sidecar is invalid. A companion that has a sidecar of its own is not played, and the twin plays instead.

The two effects start together, with the same transforms and speed. Playback waits for both to load and ends when both have ended. When the companion is missing or fails to load within 15 seconds, the twin plays instead, with a warning in the console. When the twin plays, no companion is loaded.

### Companion draw order

The companion draws before the HDR light, on the overlay and in the scene alike. With `companionOccludes` on (the default), it also writes its depth into the HDR light buffer, with colour writes off, so its opaque parts hide the HDR light behind them. Opaque companion nodes must write depth for this; transparent ones must not. Effekseer's depth test is `LEQUAL`, so emissive HDR surfaces that lie exactly on a companion's surface still draw. Set `companionOccludes` to `false` to let all of the HDR light through.

## Tuning for a whole game

A game's startup script can override the tuning of every HDR effect:

```js
ReactorHdrOverlay.configure({ bufferType: "auto", debug: false });
window.REACTOR_HDR = { bloom: 0.675, bloomScale: 2.4 };
```

- `bufferType` is `"auto"`, `"half"` or `"float"`. Auto tries half-float first, then float. The targets must be renderable and linearly filtered: in the overlay's WebGL1 context, or in PIXI's WebGL2 context for the scene path (RGBA16F with `EXT_color_buffer_float`, the light buffer multisampled 4× where the format allows).
- `REACTOR_HDR.bloom` and `REACTOR_HDR.bloomScale` override every sidecar's bloom intensity and `radiusScale`.
- `configure` also accepts the older plugin parameters `bloomIntensity`, `bloomRadiusScale`, `bufferType` and `debug`. `REACTOR_HDR` overrides their tuning.

Without overrides, each grade group's first sidecar supplies the bloom settings.

### Diagnostics

| Setting | What it does |
| --- | --- |
| `REACTOR_HDR.debugScale` | Shows the buffer's light divided by this positive value |
| `REACTOR_HDR.probeScale` | Records a quantized lower bound of the light in `ReactorHdrOverlay.stats.probe` |
| `REACTOR_HDR.probeFrame` | Limits the probe to that frame of the effect |
| `REACTOR_HDR.measureGpu` | `true` waits for the GPU (`gl.finish()`) around post-processing and records `postSamples`. It changes timing; use it for measurement only. |

`ReactorHdrOverlay.stats` also counts draws and groups, target allocations, target size and type, and total post-processing time.

For testing, an animation whose name contains `[HDR]`, or whose ID is in `window.REACTOR_HDR_IDS`, is treated as HDR. It still needs a valid sidecar or a complete `ReactorHdrOverlay.overrides[effectName]` entry, including a fallback.

## Previews in the editor

The editor's animation previews draw HDR effects through the same renderer as the game:

- **Database › Animations** and its effect file picker;
- the animation picker in Skills and Items, and in **Show Animation**;
- the effect layers of Action Sequences, the 3D database and the map's 3D view.

Database › Animations says under the preview which of these happened:

- **In HDR.** The sidecar's bloom and grade apply as they do in battle. Bloom radii are scaled to the game screen's width as the preview draws it, so a glow is the same size against an effect as in battle. Effect layers laid over a 3D view draw on a transparent canvas that the page blends close to the game's screen blend. An overlay layer's light buffer is its own square, so a wash that would cover the whole screen in battle stops at the square's edge.
- **As its twin.** When the context has no floating-point targets, the grade does not compile or the runtime file cannot be loaded, the preview plays the twin, as the game would. So does an effect drawn by the 3D scene itself (a GPU effect on a model), which has no HDR path in the game either, and an effect whose companion is missing or has a sidecar of its own. The reason is written to the console.
- **Not at all.** What the game refuses to play, the preview refuses: a `-hdr` effect with no sidecar, or a sidecar that cannot be read or is invalid.

An HDR effect with a companion plays both in the preview, with the same seed, transforms, clock and draw order as in the game. When the preview plays the twin, it loads only the twin.

Database › Animations has an **HDR** checkbox beside **Repeat** for an effect it can draw in HDR. Clear it to play the twin instead, as a computer without float targets would; a playing preview reloads and carries on. The choice is remembered for the next HDR effect.

Previews use the sidecar's own settings, read again each time an effect loads. `REACTOR_HDR` overrides and the older plugin parameters apply only in the game.

## Updating projects

The HDR module is `runtime/reactor_hdr_overlay.js`, and `reactor_main.js` loads it. New projects get it with the rest of the runtime, and the editor installs it in older projects when it refreshes their runtime. Game and editor distribution checks require it.

The file defines two globals:

- `ReactorHdrRenderer` is the light pipeline: float targets, bloom, one grade and the composite. There is one per WebGL context (the overlay's WebGL1 context, or PIXI's WebGL2 context for the scene path), and it holds no game state. The editor's previews use it.
- `ReactorHdrOverlay` connects it to the game: sidecar requests, choosing animations, the fallback twin and the overlay canvas.

Use the complete runtime from one RPG Reactor build: a new module with older core, manager or sprite files does not install its hooks. To update a project by hand, back up its `js/` folder and copy the `reactor_*.js` files from `runtime/` into it, except `reactor_plugins.js`, which belongs to the project.

A project that still enables the earlier standalone `ReactorHdrOverlay` plugin keeps working: its parameters go to the built-in overlay and its script is skipped, so the two never both draw. You can remove the plugin entry and its file. A renamed copy of that plugin is not recognized; disable it by hand.

## Limits

- **Draw order in the scene.** Each animation draws at its own place in the scene. HDR animations of one grade in one container share one light pass, at the first one's place.
- **Draw order on the overlay.** All ordinary animations draw first, in their order, then each HDR grade group, in order of first appearance. Animations sharing a grade are added together before grading, even with ordinary animations between them. Ordinary and HDR animations cannot be interleaved so that one hides the other, and light from different grades is not added together.
- **HDR cannot darken the scene.** The result is screened over the scene and the ordinary effects. Effekseer's additive blend writes `(SRC_ALPHA, ONE, ONE, ONE)` and its normal blend `(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE)`; both add alpha, so alpha is not reliable coverage, and translucent HDR layers cannot darken what is under them. The experimental `REACTOR_HDR.coverage = true` uses the accumulated alpha instead; it does not suit effects that mix additive and translucent layers.
- **Cost.** Each grade group takes seven downsample passes, twelve blur passes and one composite. Bloom intensity zero skips the 19 bloom passes. Targets are created when first needed, reused, and recreated on resize.
- **Context loss.** Losing the WebGL context ends active HDR effects without keeping their place. New animations wait until the context is restored, and the targets are created again on the next HDR animation.
- **Where HDR is drawn.** HDR covers the WebGL1 overlay and the scene path on PIXI's WebGL2 context. Effects the 3D scene draws on its own (`Reactor3D.GpuEffects`), such as an effect anchored on a 3D model, play their twin. A `-hdr` effect without a valid sidecar is refused there too.
- **No refraction in HDR assets.** Refraction and distortion nodes must be left out of HDR assets: Effekseer cannot filter single nodes during a draw. Put them in a [companion](#adding-a-companion-effect). The companion draws before the HDR light as a whole; the two effects are not interleaved node by node.
