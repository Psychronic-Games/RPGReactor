# Effekseer effects in the scene

From runtime revision **20261027.3**, a screen animation (an Effekseer animation
shown on a battler, a character or the screen) is drawn inside PIXI's scene on
PIXI 8's WebGL2 renderer, at its place in the scene graph. Until then every one
was drawn on a separate transparent canvas layered over the game canvas (the
Effekseer overlay). That overlay remains, as the fallback and for the effects a
3D map anchors in its world.

## What a game sees

- **Windows sit above effects.** An effect is drawn where its animation sits in
  the spriteset: under the message, status, command and time windows, as in
  RPG Maker MZ. On the overlay it was drawn over every window.
- **Screen tint, flashes and the spriteset's filters apply to effects.** In
  battle the effects container sits inside three colour filters (its own
  container, the spriteset and the scene); a tint now colours the effect with
  the battle. On the overlay an effect kept its own colours under any tint.
- **Distortion reads the scene beneath the effect.** A layer that samples the
  background (refraction, heat haze, darkening; most stock MZ effects have one,
  Fire All 1 among them) captures exactly what PIXI has drawn under the effect so
  far. The overlay copied the whole composited scene into its own canvas every
  frame an effect played to give it the same thing.
- **Everything else is the same.** In a battle test without a tint, frames drawn
  in the scene match the overlay's outside the windows. The one difference is
  antialiasing on the edges of mesh layers (ribbons, rings): the overlay's
  canvas is multisampled and PIXI's is not, so those edges are not smoothed.
  Measured: at most 0.1 % of the screen's pixels differ by more than 8 levels.

## When it applies

All of the following:

- PIXI renders with WebGL2 (its default; not WebGPU, not WebGL1);
- `Graphics.effekseerInScene` is not `false`;
- the context is not lost;
- the animation is a screen animation, not one a 3D map anchors in its world
  (those draw in the 3D scene through `Reactor3D.EffekseerScene` and
  `Reactor3D.GpuEffects`, as before).

Anything else plays on the overlay exactly as it did. To keep the overlay for a
whole game, set it before the first animation, for example in a plugin:

```js
Graphics.effekseerInScene = false;
```

## How it works

`Sprite_Animation.SceneLayer` (`runtime/reactor_sprites.js`) owns it.

- **A context of its own.** The layer runs an Effekseer context on PIXI's WebGL2
  context, as `Reactor3D.GpuEffects` already does, with its own effect cache.
  `Sprite_Animation.setup` hands it a screen animation; the animation plays in
  that context through `_effectContext`. `EffectManager` keeps loading into the
  overlay's context for everything else, and sends a map's preloads to the layer
  while the layer is in use (`EffectManager.sceneLayer()`), so the scene still
  waits for them behind the loading fade.
- **Drawn during PIXI's render.** Each animation has a `PIXI.RenderContainer`
  child. PIXI executes it in scene order while it renders, with the sprite batch
  broken before it, so the effect draws into whatever PIXI is drawing to at that
  point: the canvas, or a filter's texture. Effekseer drew nothing on PIXI's
  context only when it was called from `onRender`, which PIXI 8 runs before its
  own draws; the old comment in `reactor_core.js` said otherwise and is corrected.
- **Placed in any target.** PIXI's current projection and offset
  (`renderer.globalUniforms`) and viewport give where a global point lands in
  the target's pixels. A filter's texture is stored upside down; the effect's
  projection is flipped to match, with its winding.
- **Depth.** Effekseer's depth-tested layers get a depth buffer cleared once per
  target per frame, as the overlay's was. The canvas has one; a filter's texture
  is lent one for the draw and given it back.
- **PIXI's state.** The layer never reads GL state back (a query waits for the
  GPU; it cost 1.4 ms a draw on a busy map). It reads what PIXI has bound from
  PIXI's own records, puts the framebuffer, viewport, scissor and stencil back,
  and resets only the caches a draw changes (state, textures, program, vertex
  arrays, buffers, colour mask). PIXI's full `resetState()` would also forget
  the render target it is drawing to.
- **Slow motion.** The layer's context steps with the overlay context's update,
  so a battle's slowed time (`reactor_fight_camera.js`) reaches it too.

## HDR effects

An HDR animation in the scene draws its light through its own
`ReactorHdrRenderer` on PIXI's context (RGBA16F targets, the light buffer
multisampled 4x where the format allows), at the game's own size as the overlay
does. Its bloom and grade are applied, and the result is screened into the
target where the animation sits. HDR animations of one grade in one container
share one light pass at the first one's place. When the context cannot draw HDR
(no float targets, a grade that does not compile, a pass that fails), the
sidecar's twin plays in the scene instead. See [HDR-EFFECT-OVERLAY.md](HDR-EFFECT-OVERLAY.md).

## Context loss

When PIXI's context is lost, the layer's animations end (a battle does not wait
on a stranded handle) and its context and effects are released. New animations
play on the overlay until the context is restored, and in the scene again after.
This is verified in a battle test by losing and restoring the context with
`WEBGL_lose_context`.

## For plugins

- An in-scene animation never reaches `Sprite_Animation.renderActive`,
  `_doEffekseerDraw` or the overlay canvas. A plugin that reads the overlay
  canvas's pixels, or draws on `Graphics._effekseerGL` expecting to be over
  every effect, sees only overlay animations.
- `Sprite_Animation.prototype.setProjectionMatrix`, `setCameraMatrix` and
  `setViewport` set up the overlay's draw; the layer does not call them.
  Wrapping them changes overlay animations only.
- An animation's `_effekseerInScene` says which path draws it.

## Performance

Measured on this machine at 1920x1080 (one effect looping, seeded so both paths
draw the same frames):

| Battle test, per rendered frame with `gl.finish()` | Overlay | In the scene |
|---|---|---|
| Nothing playing | 1.31 ms | |
| Fire All 1 | 1.65 ms | 1.46 ms |
| Wind All 2 | 1.97 ms | 1.89 ms |
| Neutral All 2 | 1.64 ms | 1.51 ms |
| One True Magic (HDR) | 1.91 ms | 1.67 ms |

On a 2D map (the Demo's Deck Drill), `ReactorProfiler`'s CPU average per tick
was 1.11 to 1.17 ms on the overlay and 1.09 to 1.15 ms in the scene, 1.04 ms
with nothing playing. Not measured: what the browser spends blending the
overlay canvas over the game, which the scene path does not use.

## Verification

`editor/tests/effekseer-in-scene.test.cjs` holds the mapping, which animations
the layer takes, the GL calls of a draw and what is put back, HDR groups,
context loss, loading and preloads, slow motion, and the setup routing.
`hdr-overlay.test.cjs` holds the HDR choices for an in-scene animation and the
composite's framebuffer. On screen, in the real runtime: frames compared with
the overlay's (battle, untinted and tinted), the windows' layering in battle
and on a map, a message window over both, and context loss and restore. Not
verified: WebGPU (it keeps the overlay), PIXI multisampled render textures
(a distortion capture cannot read one; PIXI's filters do not use them), and
GPUs other than this machine's.
