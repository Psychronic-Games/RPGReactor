# RPG Reactor 0.94.5: The Performance Release

RPG Reactor 0.94.5 is the release where big games get fast. A day of profiling a large commercial MV project on the Reactor runtime took its heaviest maps from 30 FPS to over 180, made tactical battles smooth, fixed Ultra Mode 7 from crash to full speed — and shipped the profiler that found every one of those problems, so the next one takes minutes instead of guesswork.

## Maps with hundreds of events run at full speed

PIXI v8 charges for every object in the display tree on every frame — even invisible ones. A map with hundreds of events, each carrying a character sprite and a plugin overlay window, adds up to ten thousand display objects and a 30 FPS ceiling. The spriteset now detaches far-offscreen character sprites and dormant plugin windows from the tree entirely, parking them off-stage while their game logic keeps running, and brings them back the frame they matter again. Character sprites are culled by their drawn extent rather than their event's anchor, so parallax-mapping pieces that span many tiles never vanish while still on screen.

Scrolling no longer hitches either: the tilemap used to destroy and recreate about two thousand tile sprites every time the view crossed its painted-region boundary — a 77-millisecond spike. Tile sprites are now pooled between repaints and their textures cached, and because unpainted sprites leave the tree the moment a repaint starts, the stale tiles that could linger at the viewport edge are structurally impossible.

## The engine now ships its own profiler

Press F10 in any Reactor game, play through the slowdown, press F10 again: the engine writes a report attributing every slow frame to the phase that caused it — map updates, character sprites, windows, culling, tilemap repaints, image decodes, GPU render, garbage collection, and stalls from work outside the game loop. It costs nothing until activated and ships in every runtime, including deployed games. Two companion console helpers, `$reactorAnimStats()` and `$reactorAnimWatch(id)`, do the same for animation sprites across every host the engine and plugins use. Every fix in this release was found by pointing these tools at real play sessions.

## Tactical battles: smooth turns and no ghosts

The profiler traced enemy-turn hitches in LeTBS tactical battles to three compounding costs inside the plugin's AI: evaluating a single skill rebuilt identical area-of-effect scopes for every move-cell/target-cell combination with an `eval()` per candidate; choosing a move destination ran full A* pathfinding — including a whole-map grid rebuild — inside a sort comparator, roughly 1,200 pathfinds per decision; and line-of-sight scopes defeated caching entirely. The compatibility layer now memoizes the AoE evaluation, replaces the pathfind-in-a-sort with a single breadth-first flood fill, and caches what geometry allows. Enemy decisions that froze the frame for 150 milliseconds now cost a few.

Battles also no longer ghost their animations. LeTBS parks entity animations on a shared layer but relies on the owning entity's sprite to clean them up — finished and orphaned sprites accumulated there frozen on their last frame, so a looping state animation could play exactly on top of its own ghost. The layer is now swept every battle tick; a validation battle found and removed twenty leaked animation sprites within minutes.

## Ultra Mode 7, from broken to fast

Three separate fixes got Mode 7 maps working and performant. The engine now reports `Utils.RPGMAKER_NAME` as `"MZ"` — that constant is a compatibility contract, not branding, and multi-engine plugins branch on the exact string to decide which internals to patch; reporting a custom name sent Ultra Mode 7 (and a dozen other plugins) down dead code paths. Pre-2.2.0 releases of the plugin get the `Tilemap.CombinedLayer` bridge newer versions ship themselves. And the v8 compat renderer stopped re-uploading every vertex buffer every frame — about 135 MB per frame on a 256×256 map — bringing the heaviest Mode 7 overworld from 20 FPS with visible tile seams to a clean 60+ with filtering that honors the plugin's pixelated setting.

## An MV compatibility layer that earns trust

The layer is now two-tier: MV plugin API support installs for every game, so MZ projects can freely mix in MV plugins, while MV game semantics activate only for games authored in MV. On top of that split, this release fixes the interpreter contract that made cutscene move routes silently do nothing when follower-control plugins are present, restores MV's lazy animation cleanup so looping animations hand off seamlessly instead of blinking, keeps MV games alive through unhandled promise rejections the way MV always did, and resolves save files native-format-first — so an MZ project carrying leftover MV-era saves shows its real save list again.

## Quality of life

Games boot with a clean console: the compatibility layers' install banners now hide behind a debug switch, legacy `PIXI.BlurFilter` construction no longer prints deprecation warnings, and desktop games skip the web-only "save data too big" notice. Deployment downloads FFmpeg and the NW.js codec from direct pinned URLs instead of the rate-limited GitHub API. "Install Reactor Runtime" archives the original RPG Maker corescript into a zip instead of mixing two engines in one folder. And the FPS counter looks like it should, everywhere.

Source and complete release history are available in the [GitHub changelog](../../CHANGELOG.md). The full technical list is in the [editor changelog](../../editor/CHANGELOG.md).
