# RPG Reactor 0.94.7: Map Editing You Can Trust

RPG Reactor 0.94.7 is a fast-follow fix release driven by user reports against 0.94.5: the paint bucket, layer separation, region tools, and playtest flow in the map editor now behave the way your hands expect, and a PIXI v8 blend-mode regression that could black out the screen under popular plugins is gone. (0.94.6 was an internal development version and was never published.)

## The paint bucket actually fills

Flood fill matched tiles by their exact ID — but autotiles store their shape variant in the ID, so the edge and corner tiles of a terrain never matched the interior tile you clicked. Refilling an existing lake or field replaced only the same-shape subset and left rings of the old terrain behind (fills over empty ground worked, which made the bug look random). The fill now matches by autotile kind, covers the whole connected region, and recomputes autotile borders afterwards so the filled area connects cleanly to its surroundings. The eraser's fill mode matches terrain the same way.

## Layers that stay separated

With a manual layer (L1–L4) selected, painting a ground autotile ignored the layer picker entirely: the tile went wherever the auto-stacking rules pointed, and layers 2–4 at that cell were unconditionally cleared — silently deleting decorations you had placed on other layers. Manual layer mode is now strict: the pencil, rectangle, circle, and fill tools write only to the selected layer and never touch the others, and the placement preview shows exactly what painting will produce. Auto mode keeps the familiar MZ-style smart stacking.

## Region tools that paint regions

With the Regions tab selected, the rectangle, circle, and paint bucket tools painted *tiles* — from whatever tile selection was left on the previous palette tab — instead of regions; only the pencil handled the region layer. All three now write region IDs to the region layer: the area tools cover their shape, and the bucket flood-fills the connected cells of the clicked region value.

## Playtest runs what you see

The Playtest button launched the game straight from disk, so unsaved map edits were missing from the test run. Playtest now saves the project first — current map, database, and map list — exactly like RPG Maker, and cancels the launch with a status message if the save fails.

## No more sudden blackouts

Toggling certain plugin overlays — reported with Sang Hendrix's Realtime Parallax Map Builder collision overlay — turned the whole screen dark while the console flooded with "Blend filter requires backBuffer" warnings. PIXI v8 renders multiply and screen blending natively, but Reactor's compatibility layer also registered those modes as filter-based blends, which overrides the native path with a filter that cannot run under Reactor's renderer configuration; PIXI skipped it and drew the overlay as an opaque quad. The redundant registrations are removed, so every standard RPG Maker blend mode (normal, add, multiply, screen) renders natively again — verified by GPU pixel readback. The engine also no longer trips Chromium's deprecation reports (`unload` listener, Shared Storage probe), keeping the DevTools Issues tab clean.

## Boots through broken plugin wrappers

Carried in from earlier in the cycle: games no longer crash with `this._app.start is not a function` or hang on a black screen when plugins wrap `SceneManager.run` with non-async functions (VisuMZ Core Engine among them) and drop PIXI v8's async renderer initialization, and MV-era plugins that construct filters ES5-style (`PIXI.Filter.call(this, ...)`) work under PIXI v8.

## Browser editor keeps catching up

The web edition's database lists now show their mini preview icons (item/skill icons, actor faces, enemy battlers), and the character, face, SV battler, and icon pickers open in the browser instead of demanding NW.js.

Source and complete release history are available in the [GitHub changelog](../../CHANGELOG.md). The full technical list is in the [editor changelog](../../editor/CHANGELOG.md).
