# Effekseer effects in the scene

RPG Reactor draws screen animations (Effekseer animations shown on a battler, a character or the screen) inside PIXI's scene, at their place among the game's sprites, as RPG Maker MZ layers them. This page covers what that changes for a game, when it applies, how to turn it off, and what plugins need to know.

Effects that cannot be drawn in the scene play on the **Effekseer overlay**: a separate transparent canvas laid over the game canvas.

## What changes in a game

- **Windows are drawn over effects.** An effect sits under the message, status, command and time windows, as in RPG Maker MZ. On the overlay, effects are drawn over every window.
- **Screen tint, flashes and the spriteset's filters colour effects.** In battle, a tint colours the effect along with the battle. On the overlay, an effect keeps its own colours under any tint.
- **Distortion reads the scene under the effect.** Layers that sample the background (refraction, heat haze, darkening, as in Fire All 1 and most stock MZ effects) see exactly what has been drawn beneath the effect. Where a layer bends samples past the edge of the screen, they repeat the screen's edge pixels.
- **Mesh edges are not antialiased.** The edges of mesh layers such as ribbons and rings look slightly harder than on the overlay, whose canvas is multisampled. Everything else looks the same.

## When it applies

An animation is drawn in the scene when all of these are true:

- PIXI renders with WebGL2 (its default; not WebGPU or WebGL1);
- `Graphics.effekseerInScene` is not `false`;
- the WebGL context is not lost;
- the animation is a screen animation. An effect a 3D map anchors in its world is drawn by the 3D scene (`Reactor3D.EffekseerScene` and `Reactor3D.GpuEffects`).

Any other animation plays on the overlay.

## Keeping the overlay

To draw every animation on the overlay, set this before the first animation plays, for example in a plugin:

```js
Graphics.effekseerInScene = false;
```

## HDR effects

An HDR animation in the scene draws its light through its own `ReactorHdrRenderer` on PIXI's context, at the game's resolution, with the sidecar's bloom and grade. The result is screened into the scene where the animation sits. HDR animations that share a grade in the same container share one light pass, at the place of the first one.

A sidecar's [companion](HDR-EFFECT-OVERLAY.md#adding-a-companion-effect) plays in the layer's context with the HDR effect, from the same random seed. The companions of a light pass draw into the scene before it, and, unless `companionOccludes` is `false`, write their depth into the light buffer so their opaque parts hide the HDR light behind them.

When the context cannot draw HDR (no floating-point render targets, a grade that does not compile, or a pass that fails), or the companion fails to load, the sidecar's normally graded twin plays in the scene instead, without the companion. See [HDR effects](HDR-EFFECT-OVERLAY.md).

## Lost WebGL context

When PIXI's context is lost, the animations drawn in the scene end, so a battle does not wait on them, and their resources are released. New animations play on the overlay until the context is restored, and in the scene again after that.

## For plugin developers

- An animation drawn in the scene never reaches `Sprite_Animation.renderActive`, `_doEffekseerDraw` or the overlay canvas. A plugin that reads the overlay canvas's pixels, or draws on `Graphics._effekseerGL` expecting to be over every effect, sees only overlay animations.
- `Sprite_Animation.prototype.setProjectionMatrix`, `setCameraMatrix` and `setViewport` set up the overlay's draw. The scene path does not call them, so wrapping them changes overlay animations only.
- An animation's `_effekseerInScene` says which path draws it.

### How the scene path works

`Sprite_Animation.SceneLayer` in `runtime/reactor_sprites.js` owns it.

- **Its own Effekseer context.** The layer runs an Effekseer context on PIXI's WebGL2 context, with its own effect cache. `Sprite_Animation.setup` hands it each screen animation, which plays through `_effectContext`. `EffectManager` keeps loading into the overlay's context for everything else. While the layer is in use, a map's preloads go to the layer (`EffectManager.sceneLayer()`), so the scene still waits for them behind the loading fade.
- **Drawn during PIXI's render.** Each animation has a `PIXI.RenderContainer` child. PIXI runs it in scene order, with the sprite batch broken before it, so the effect draws into whatever PIXI is drawing to at that point: the canvas or a filter's texture.
- **Placement in any target.** The effect is placed using PIXI's current projection, offset (`renderer.globalUniforms`) and viewport. A filter's texture is stored upside down, so the effect's projection and winding are flipped to match.
- **Depth.** Effekseer's depth-tested layers get a depth buffer, cleared once per target per frame. A filter's texture is lent one for the draw.
- **PIXI's state.** The layer never reads GL state back from the GPU. It reads what PIXI has bound from PIXI's own records, restores the framebuffer, viewport, scissor and stencil, and resets only the caches a draw changes (state, textures, program, vertex arrays, buffers and colour mask). It does not call PIXI's `resetState()`, which would also forget the render target.
- **Slow motion.** The layer's context steps with the overlay context's update, so a battle's slowed time (`reactor_fight_camera.js`) reaches it too.

## Limits

- WebGPU keeps the overlay.
- A distortion layer cannot read a PIXI multisampled render texture. PIXI's own filters do not use them.
