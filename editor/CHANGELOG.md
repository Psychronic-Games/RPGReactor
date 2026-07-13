# Changelog

All notable changes to RPG Reactor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Editor: whole-map paint bucket fills apply in a fraction of a second instead of 30-40 seconds. `updateTiles` with a 131k-position batch (a full 256×256 fill) spent 39.6s: each position ran a maintenance `filter()` over the whole A1 water-animation tracking list (131k × 2,093 entries ≈ 275M iterations) plus per-cell sprite churn. Batches over 3,000 positions now route through the streaming full re-render — instant viewport, background fill, caches and region overlay handled — and the A1 tracking maintenance is batched into a single filter pass. Measured on Star Shift Rebellion Map 850: whole-map fill 39.8s → 0.27s of blocking time. `renderMap` gained a `preserveScroll` option so the fallback (and undo/redo, which previously snapped the view back to the map origin) keeps the current scroll position.

## [0.94.8] - 2026-07-13

Release overview: [RPG Reactor 0.94.8: Big Maps Without the Wait](../docs/devlogs/2026-07-13-rpg-reactor-0.94.8.md).

### Changed

- Bumped current development version to RPG Reactor 0.94.8.

### Fixed

- Editor: large maps load ~4× faster and stay responsive afterwards. Two compounding problems on a 256×256 map (~131k populated cells, ~500k tile sprites): (1) the lazy off-viewport fill streamed sprites directly into the live stage, so every editor frame re-rendered the ever-growing uncached sprite tree — over 1s per frame near the end — starving the idle-callback batches and stretching a ~1s fill to ~10s; off-viewport tiles now stream into detached per-layer holder containers that attach (and cache) one per frame when their stream completes, keeping frames viewport-sized throughout. (2) A1 water/waterfall tiles animate by in-place texture swaps, which blocked the ground layer from ever being cached as a texture — a water map's ground container (261k sprites on Map 850) re-rendered live every frame forever; A1 tiles now render into small dedicated live overlay containers (one per z-slot, drawn directly above their slot, so stacking and shadow order are unchanged) and every static layer caches unconditionally. Measured on Star Shift Rebellion Map 850 through the real TilemapManager: full load 9.4s → 2.6s, steady frame 24ms → 13ms, worst load-time hitch 817ms → 452ms, identical 131,580 rendered cells and all 2,093 water tiles still animating. A generation counter also cancels an in-flight fill when another map loads (previously stale batches kept rendering the old map's tiles into the new map's containers), and paints that land while the fill streams are no longer overwritten by stale captured tile values.
- Editor: repainting a shadow stacked a duplicate shadow container on top of the old one (each at 48% alpha, so quadrants darkened a little more with every paint) — shadow containers are now tracked like tile sprites and replaced on update.
- Editor: MV sprite-sheet animation previews play smoothly in all three surfaces (Animations database page player, the Skills/Items/Weapons animation picker modal, and the event editor's Show Animation picker). Playback was driven by `setInterval(1000/15)`, which drifts and fires late whenever the main thread is busy (e.g. the map rendering behind the database), reading as juddery, time-stretched playback. All three now step on a requestAnimationFrame accumulator locked to the MV 15fps cadence: a hiccup skips ahead instead of slowing the animation, and the database player fires the skipped frames' SE cues so audio stays in sync.
- Editor: region overlay rendering is no longer quadratic with painted cells. Every region paint (including each pencil-drag step) rebuilt the entire overlay, creating a fresh `PIXI.Graphics` AND a `PIXI.Text` per painted cell — PIXI.Text rasterizes its own glyph texture, so bucket-filling a region across a 256×256 map froze the editor for ~5 seconds and re-froze on every subsequent paint. Region cells now share one pre-rendered texture per region ID (identical fill/border/number appearance) and paint operations update only the touched cells through the new `RegionManager.updateRegionCells`; full rebuilds happen only on map load / overlay toggle.
- Editor: dragging the rectangle tool on the Regions tab shows the region color over the selection (it only showed a white outline), and the circle tool shows region-colored cells with outlines (it showed nothing at all — both area tools previously fell through to the tile-preview path, which has nothing to draw for regions).

## [0.94.7] - 2026-07-13

Release overview: [RPG Reactor 0.94.7: Map Editing You Can Trust](../docs/devlogs/2026-07-13-rpg-reactor-0.94.7.md). (0.94.6 was an internal development version and was never published; its changes ship here.)

### Changed

- Bumped current development version to RPG Reactor 0.94.7.

### Fixed

- Editor: the rectangle, circle, and paint bucket tools respect the Regions tab. `getLayerIndex('R')` fell through to layer 0, and the area tools' tile-pattern path read the stale tile selection from the previously active palette tab — so area-painting or bucket-filling with regions selected painted tiles onto the ground layer. The area tools now write the selected region ID to the region layer (z5) over their rectangle/circle footprint, and the bucket flood-fills connected cells matching the clicked cell's region value, refreshing the region overlay once per operation.

- Runtime: game boot no longer races the PIXI v8 renderer initialization. `Graphics.initialize` is async under v8, and plugins that alias `SceneManager.run`/`initialize` with non-async wrappers (VisuMZ Core Engine and others) drop that promise, so `SceneManager.run` reached `Graphics.startGameLoop` mid-init — crashing with `this._app.start is not a function` when the pre-init `PIXI.Application` was visible (v8 installs `start`/`stop`/`ticker` on the instance only during `init()`), or sitting on a black screen forever when `Graphics._app` was still null and the start was silently skipped. The app is now published only after `init()` completes, and `startGameLoop`/`stopGameLoop` record the requested loop state so `_createPixiApp` starts the ticker as soon as the renderer is ready.
- Runtime: MV-era plugins that subclass filters ES5-style — `PIXI.Filter.call(this, vertex, fragment, uniforms)` — work under PIXI v8. The compat `PIXI.Filter` wrapper was an ES6 class, which throws when invoked without `new`; it is now a function-based constructor that supports `.call()`/`.apply()` construction, direct `new`, and `class extends` subclassing alike.
- Web editor: database entry lists show their mini preview icons in the browser edition. `applyListIcon` bailed when `nw` was absent, and painted via CSS `background-image: url("file://...")` — the browser host's file:// bridge rewrites `src`/fetch/XHR but not CSS backgrounds, so even without the gate the images could not load. Icon URLs now resolve through `RPGReactorAssetUrl` on the web host (and unchanged `file://` on desktop), and the enemy battler folder probe uses the host's virtual `fs`.
- Web editor: the character sprite, face, SV battler, and icon picker dialogs open in the browser edition — their guards required NW.js even though the browser host shims `fs.readdirSync` over the virtual project and the pickers' previews load through the bridged `img.src` path.
- Runtime: sprites using `multiply` or `screen` blending render correctly under PIXI v8 instead of drawing as opaque quads over the scene — reported as the whole screen going dark when toggling Sang Hendrix's Realtime Parallax Map Builder collision overlay, with a per-frame flood of "Blend filter requires backBuffer" warnings. PIXI v8 handles both modes natively through GL blend functions, but `pixi_compat.js` also registered them as `ExtensionType.BlendMode` extensions, and registration *overrides* the native path: `BlendModePipe` routes any registered mode through `BlendModeFilter`, which needs `useBackBuffer: true` — deliberately off in Reactor because the back-buffer copy discards Effekseer's post-render GL draws — so PIXI skipped the filter each frame and fell back to normal blending. The compat layer now registers only `overlay` (which has no native GL equivalent) and leaves multiply/screen native; MZ's numeric blend modes 0–3 (normal/add/multiply/screen) therefore all render natively. Verified by WebGL pixel readback: red backdrop × green multiply sprite → black, screen → yellow, with zero backBuffer warnings.
- Editor: the paint bucket fills an entire connected autotile region instead of a same-shape subset. The flood fill matched tiles by exact ID, but autotiles store their shape variant in the ID (base + 0–47), so interiors, edges, and corners of one terrain never matched each other — refilling an existing terrain left rings of old tiles (fills over empty ground worked, which made the bug look intermittent). Matching now collapses autotile IDs to their kind; non-autotiles still match exactly. The fill also recomputes autotile shapes for the filled cells and their border afterwards — during the flood pass each cell's shape was computed while unfilled neighbors still held the old terrain, so even correctly-covered fills came out with isolated/edge shapes inside the region. The eraser's fill mode uses the same kind-based matching.
- Editor: manual layer selection (L1–L4) confines all painting strictly to the chosen z-slot. Ground autotiles ignored the layer picker entirely: they always placed via the auto-stacking rules and unconditionally cleared layers z1–z3 at the painted cell, so painting terrain with any manual layer selected silently erased B–E decorations (and A5 single tiles wiped upper layers the same way). In manual mode the pencil, rectangle, circle, and fill tools now write only to the selected layer and never clear the others; `getAutotilePlacementLayer` honors the manual layer so the placement preview matches what painting produces; and fill matches the region on the selected layer rather than the palette-derived one. Auto mode is unchanged and keeps the MZ-style stacking/clearing rules.
- Editor: the playtest and battle test flow runs against current data — the playtest button saves the project (current map, database, MapInfos) before spawning the game process, cancelling the launch with a status-bar message if the save fails. Previously it launched straight from disk, so unsaved map edits were missing from the playtest.
- Runtime: the DevTools Issues tab no longer reports deprecations from the engine — `SceneManager.setupEventHandlers` listens for `pagehide` instead of the deprecated `unload` (same teardown coverage, including window close), and the MZGlobalUpgrade global scan skips `window.sharedStorage`, whose mere property read tripped Chromium's "Shared Storage API is deprecated" issue.

## [0.94.5] - 2026-07-12

Release overview: [RPG Reactor 0.94.5: The Performance Release](../docs/devlogs/2026-07-12-rpg-reactor-0.94.5.md).

### Added

- Runtime: built-in frame profiler on F10. First press starts recording, second press writes `save/reactor-profile.json` and logs a summary: per-phase timings (map/event updates, character sprites, windows, culling, tilemap paint/sort, image decode, GPU render) for every frame over 20ms, between-frame stalls from work outside the game loop, JS heap movement (GC detection), and the map/position where each spike happened. Costs nothing until activated, so it ships in every runtime. Also drivable from the console via `$reactorProfiler.start()` / `.stop()`. Spike records include the live animation-sprite count, and battle scenes get their own phases — `BattleManager.update`, and when LeTBS is present its tactical AI stages (`tbsAi:process`, action-building steps) — so enemy-turn spikes attribute to the responsible stage.
- Runtime: animation diagnostics console helpers. `$reactorAnimStats()` dumps every live animation sprite in the current scene — including MV-style host-based sprites on character, battler, and LeTBS entity hosts — with source, rate, remaining duration, drawn cells, and position. `$reactorAnimWatch(animationId)` arms a watcher that automatically logs every change in how many copies of one animation are alive (host, duration, position per transition); calling it again with no argument stops and dumps the transition log.
- Build menu: "Install Reactor Runtime..." converts the open project to the Reactor engine. The RPG Maker corescript (`main.js`, `rmmz_*.js`/`rpg_*.js`), the old `js/libs`, and the original `index.html` are moved into `rpgmaker-runtime-backup.zip` in the project root (excluded from deploys) so the two runtimes never mix in `js/`; then the Reactor engine files are installed, `reactor_plugins.js` is seeded from the project's `plugins.js`, `index.html` is pointed at the Reactor bootstrap, and a `package.json` is created when missing. Re-running it refreshes the engine files and offers to rebuild the Reactor plugin manifest from `plugins.js`.

### Changed

- Deployment no longer calls the GitHub API. The FFmpeg encoder for OGG optimization downloads from its pinned release URL and is still verified against SHA-256 hashes pinned in the editor; the NW.js proprietary codec downloads from its predictable release URL and is validated structurally (exactly one expected binary with consistent sizes). This removes random build failures from the unauthenticated GitHub API rate limit (HTTP 403). Any remaining GitHub API request honors a `GITHUB_TOKEN`/`GH_TOKEN` environment variable and names the rate limit in its error message.
- The shipped `runtime/reactor_plugins.js` is an empty plugin manifest instead of a development plugin configuration (GALV, UltraMode7, MOG_BattleHud).
- Runtime: games boot with a clean console. The ~18 informational install banners from `pixi_compat.js` and `reactor_mv_compat.js` (settings bridge, blend-mode probes, MZGlobalUpgrade wrap count, MV-detection, and the like) are now gated behind a debug switch — set `window.$reactorDebugLogs = true` before load, `localStorage.setItem("reactorDebugLogs", "1")`, or add `?debuglogs` to the URL to see them again. Warnings about actual failures are not gated. The benign "skipped invalid Pixi renderer system" notice is gated too, and MZ's stock "Save data is too big." warning (a 50KB web-storage guideline) no longer fires on desktop NW.js, where file saves have no such limit.
- Runtime: `pixi_compat.js` converts v5-style positional `PIXI.BlurFilter(strength, quality, resolution, kernelSize)` construction to the v8 options object before PixiJS sees it, so plugins constructing blur filters positionally no longer trigger the per-boot PixiJS deprecation warning.
- Bumped current development version to RPG Reactor 0.94.5.

### Fixed — performance

- Runtime: large maps run at full speed again. Object-heavy maps (hundreds of events, each with a character sprite and plugin overlay windows — 10,000+ display objects) dropped to ~30 FPS because PIXI v8 spends ~1.3µs per frame on every object in the display tree even when invisible. `Spriteset_Map` now detaches far-offscreen character sprites and dormant/offscreen plugin windows (event mini labels) from the display tree, parking them in an off-stage holder: parked windows keep their update logic running so their own show/fade behavior brings them straight back, character sprites re-enter from their game object's position, event/move-route logic (including `<Always Update Movement>`) is untouched, and everything is folded back in before teardown so nothing leaks. Measured on a 364-event map: 33ms → 12ms per frame; a 255-event map: ~33ms → 7.7ms. Set `window.$reactorDisableCulling = true` to disable for debugging. Also added a fast path to the PIXI v8 `updateLocalTransform` compat patch (skips four trig calls for unrotated objects). The window transparency test judges the pause sign by the window's `pause` flag rather than the sign sprite's `visible` (MZ keeps that sprite visible with alpha 0 on every open window, which exempted ~160 invisible on-screen mini labels — each still paying full per-frame window bookkeeping inside the render pass, ~10ms of a 22ms frame on the profiled map; render dropped to ~2ms once parked), and windows with `visible === false` park too. Character sprites are culled on their drawn extent (anchor ± width/2 horizontally, anchor − height upward) rather than the event's anchor point, so large event graphics — parallax-mapping roof pieces spanning many tiles — no longer vanish while still partly on screen.
- Runtime: scrolling no longer causes frame spikes. The PIXI v8 tilemap repaints its full painted region whenever scrolling crosses the region boundary, and previously destroyed and recreated ~2,000 tile sprites (and their textures) in a single frame — a measured 77ms hitch on every boundary crossing. Tile sprites are now parked in a detached pool between repaints and tile textures are cached per frame rect, making repaints nearly allocation-free. Because unpainted sprites leave the display tree the moment a repaint starts, stale tiles can never linger at the painted-region edge — an earlier in-place-reuse draft trimmed leftovers in a step that threw on `Tilemap.CombinedLayer` (which lacks the `Tilemap.Layer` helpers), leaving bands of garbage tiles at the viewport edge; the pool design removes the trim step entirely. Verified over 220 consecutive full repaints with zero paint errors and no frame over 24ms.
- Runtime: LeTBS enemy AI turns hitch far less. Profiling attributed 80–146ms frames to the AI's skill evaluation (`getAoEPossibleMoves`), which iterates every reachable move cell × every action cell, rebuilding the identical AoE scope and running a per-entity `eval()` for each combination. The compat layer replaces it with a behavior-identical version that hoists the per-skill scope data, caches the AoE and its filtered targets per (action cell, approach direction — plus the move cell when the AoE is line-of-sight sensitive), and caches each entity's use-condition verdict for the evaluation pass. Guarded by a source fingerprint so a modified or future LeTBS keeps its own implementation.
- Runtime: LeTBS AI move decisions no longer freeze the frame — `closestWalkableCellTo`/`farthestWalkableCellTo` ran two full A* pathfinds inside their sort comparator (~1,200 pathfinds to pick one destination, a measured 139ms hitch); the compat layer precomputes each candidate cell's path length once and sorts on the cached values. The AI AoE memoization also caches across move cells for line-of-sight AoEs (LoS is computed from the AoE center, so it is position-independent; only `exclude_user`/`cells_reachable`/`select` scopes stay position-keyed).
- Runtime: Ultra Mode 7 runs at full speed on large maps. The v8 compat renderer re-uploaded every layer segment's vertex buffer to the GPU every frame — on a 256×256 map that is ~47 segments × 16k quads ≈ 135MB per frame, a measured ~29ms stall (20 FPS with visible jitter). Mode 7 geometry is static between repaints (scrolling is the projection matrix; tile animation is a shader uniform), so buffers now upload only when the data actually changes: 36.8ms → 4ms median frame on Star Shift Rebellion's Infernis overworld.

### Fixed — Ultra Mode 7 and plugin detection

- Runtime: `Utils.RPGMAKER_NAME` reports `"MZ"` instead of `"Reactor"`. That constant is not branding — multi-engine plugins branch on the exact string to decide which engine's internals to patch, and a custom name sent them all down the MV path or a dead fallback: Blizzard's UltraMode7 silently rendered nothing (its `IS_RMMZ` check failed, so it patched MV's pixi-tilemap classes, which are inert stubs here), and ten-plus other plugins (Cyclone suite, DK Video Player, Mano_InputConfig, ...) took wrong branches. The engine's identity now lives in `Utils.REACTOR_NAME`. The bundled templates' hand-edited UltraMode7 copies (previously patched to detect "Reactor") are restored to stock.
- Runtime: Ultra Mode 7 works with plugin releases older than v2.2.0 (Star Shift Rebellion ships v2.1.1). Blizzard added a `Tilemap.CombinedLayer` bridge in v2.2.0 for MZ core 1.7's layer wrappers; without it the stock `CombinedLayer.addRect` drops UM7's two extra animation-coordinate arguments (every Mode7 vertex gets NaN animation coords — the GL pass draws nothing) and `layer.animationFrame = n` writes a dead property. `pixi_compat` now installs the same bridge when the plugin doesn't provide it. Verified: SSR's Infernis overworld renders in full perspective at ~6ms/frame.
- Runtime: Ultra Mode 7 maps no longer crash the scene ("Cannot read properties of undefined (reading 'x')"). The tilemap's direct `updateTransform` drive (added for the culling work) ran plugin transform chains outside the onRender bridge's protective try/catch — UltraMode7's chain deliberately ends in the legacy no-args `PIXI.Container.updateTransform`, which throws on PIXI v8 *after* its real work is done. The direct drive now matches the bridge's swallow-the-legacy-tail semantics. Also: the MV project-marker probe uses `fs` under NW.js instead of a synchronous XHR, so MZ projects no longer log `net::ERR_FILE_NOT_FOUND` for the missing marker at boot.
- Runtime: Ultra Mode 7 tile seams are gone in pixel-art games — the v8 compat renderer's atlas filtering now follows the plugin's `TILEMAP_PIXELATED` parameter (NEAREST) instead of always LINEAR, whose sampling bled neighboring atlas texels at tile borders.

### Fixed — MV compatibility

- Runtime: the MV compatibility layer (`reactor_mv_compat.js`) is now two-tier instead of all-or-nothing. Tier 1 — MV plugin API support (gap-fills, MV-argument adapters, the MV `pluginCommand` bridge, MV save/data/asset format handling) — installs for **every** game, so MZ projects can freely mix in MV plugins. Tier 2 — MV game semantics (MV window geometry, scene layout, battle flow, damage popups, MV save encoding), which are mutually exclusive with MZ-authored UI — activates only for games authored in RPG Maker MV: via `window.$reactorMvCompat` (stamped into `index.html` by "Install Reactor Runtime" from the project's origin marker) or, absent the flag, an `RPGMV` project marker beside `index.html`. Previously the whole layer installed unconditionally, giving MZ projects MV metrics (squeezed command windows, washed-out window backgrounds); both modes are pixel-verified against stock corescript behavior.
- Runtime: "Set Movement Route" waits work again when an MV plugin overrides the route command (follower-control plugins routinely do, and YEP Move Route Core's script commands like `MOVE TO: x, y` depend on the wait to keep stepping). MV's interpreter stores the watched character on `this._character`; MZ replaced that contract with `this._characterId`, so with an MV-style override the wait looked up an unset id — which resolves to the *running event* — and dissolved the same tick, letting every later route command replace the moving one before it took a single step (Star Shift Rebellion: the party never marched to the tribunal in the Chamber cutscene). The interpreter compat layer now keeps both contracts alive: native route/animation/balloon commands mirror their target onto `_character`, and the wait check prefers it since it is fresh on either path.
- Runtime: looping MV-format animations ("show animation, wait its duration, repeat" — waving flags, smoke stacks) hand off seamlessly between passes instead of blinking out for a frame and jumping position. Two causes fixed: finished MV animation sprites now get one grace tick before removal, matching MV's lazy cleanup (the grace is frame-stamped because `updateAnimations` runs twice per map tick in stock MZ, and it keeps running `updatePosition` so a scrolling map doesn't leave the last frame at a stale position); and a freshly created MV animation sprite draws its first frame the moment it enters the tree when its sheets are already cached, instead of staying invisible until its first update a tick later (visuals only — frame timings/SEs still fire on the first real update). Verified over 500 consecutive ticks: zero blank frames, zero position jumps. The blink was always present but became obvious at high frame rates, where every logic tick is rendered several times.
- Runtime: LeTBS battle animations no longer ghost. LeTBS parks entity animations (state `loop_animation` sprites, spawn effects) on a shared layer but relies on the owning entity sprite to remove them; finished and orphaned sprites accumulated on the layer wearing their last-drawn frame — a fresh state loop then played exactly on top of its own frozen ghost (Star Shift Rebellion's Inhibitor Field doubling over itself mid-battle), and a validation battle showed 20 dead animation sprites leaked within a couple of minutes. The compat layer sweeps the animation layer each battle tick: finished sprites, sprites whose target left the scene, and loop sprites no longer tracked by their host are destroyed; live animations are untouched (verified: healthy loop keeps playing, orphan and finished sprites reaped, battle renders normally).
- Runtime: victory triggers immediately when the last enemy falls in MV games (previously the next ready actor's command window opened over the dead troop, and victory only fired after attacking the empty field). MZ's `BattleManager.endAction` nulls `_subject` as soon as a battler's actions run out, while MV leaves it set until `processTurn` advances it — ATB systems (VE_ActiveTimeBattle) gate new actor inputs on `_subject` being clear, so under MZ semantics an input could open during the killing blow's collapse animation, and the battle-scene input gate then blocked the battle-end check indefinitely. The MV compatibility layer now restores MV's `endAction` verbatim; the fix ordering (`endAction → processVictory`, no input) is verified identical against the same game running its genuine MV corescript.
- Runtime: MV window contents are sized MV-verbatim under the MV compatibility layer (`contentsHeight` = height − padding×2, without MZ's one-row smooth-scroll buffer). MV plugins compute layouts from `contents.height` — YEP_PartySystem's party-select cells, for example — so the MZ buffer displaced their sprites ~36px. Verified byte-identical against the same game running its genuine MV corescript.
- Runtime: MV main-menu sizing plugins apply again under the MV compatibility layer. `Scene_Menu`'s window creators are restored MV-verbatim (constructing from `(x, y)` with the width from the window's own `windowWidth()`) so plugins that wrap them — YEP_MainMenuManager sizes the status window as `boxWidth − x` — capture the originals they were written against. Previously they captured MZ's Rectangle-based creators, so the menu status window kept MZ's `boxWidth − 240` width, was repositioned to the plugin's x, and overflowed the right screen edge.
- Runtime: MV plugins that customize actor status drawing (menu gauges, level display, class rows) apply again under the MV compatibility layer. MZ moved the `drawActor*` family from `Window_Base` onto a new `Window_StatusBase` intermediate class, which sat closer in the prototype chain and shadowed every MV plugin's `Window_Base` patch — menus drew MZ's default layout (level shown, 128px sprite gauges) regardless of the game's plugin configuration. For MV-format games the shadowing copies are now removed so lookups fall through to `Window_Base`, where the MV ports and plugin patches live. Also hardened `Scene_Map.stop` against plugins that remove the map name window.
- Runtime: MZ games show their saves again when the project folder carries leftover MV-era `.rpgsave` files beside the real `.rmmzsave` saves (common in projects ported from MV). The save-format resolver preferred `.rpgsave` whenever one existed, so the save menu read a stale MV-era global index and listed nothing. Resolution is now native-format-first per game type: MZ games stick to `.rmmzsave` and only fall back to an `.rpgsave` for slots with no native save; MV games keep `.rpgsave` as before.
- Runtime: MV games no longer freeze when a plugin's promise rejects unhandled (e.g. a video parallax whose source fails to load — `video.play()` rejections were fatal under MZ's `unhandledrejection` handler, stopping the game loop dead). MV never subscribed to that event, so under MV game semantics the rejection is logged and play continues.

### Fixed — rendering, effects, and editor

- Runtime: Effekseer battle animations keep their shape at every screen position. Effects were positioned by moving them off the camera axis inside one shared wide-FOV frustum, and off-axis perspective stretched them radially — a sphere 300px from screen center rendered 50% wider than tall. Each effect now renders on-axis in its own square viewport centered on the target (MZ's own approach, adapted to the overlay recipe), pixel-verified round at center, offset, and corner positions.
- Runtime: "screen center" (`displayType` 2) Effekseer animations position correctly under PIXI v8 — `targetPosition` read `renderer.view.width`, which is a ViewSystem (not the canvas) on v8, so the position computed NaN.
- Runtime: `pixi_compat.js` provides a `PIXI.settings` bridge on PIXI v8, which removed the namespace. Plugins with bundled pixi-filters builds (e.g. Hendrix_Particles_Builder, Hendrix_Post_Processing_Builder) read `PIXI.settings.FILTER_RESOLUTION` at load time and crashed the game on startup; `FILTER_RESOLUTION`, `RESOLUTION`, `SCALE_MODE`, `WRAP_MODE`, `MIPMAP_TEXTURES`, and `TARGET_FPMS` now map to the per-class v8 defaults, and unbridged settings are stored instead of throwing.
- Runtime: window skins render their pattern quadrant again under PIXI v8. `TilingSprite._refresh` mutated `texture.frame`, which on v8 skips `updateUvs()` and leaves `orig` on the old rectangle, so window backgrounds tiled the entire 192×192 skin — cursor, arrows, and the text-color palette checkerboard showed through behind window contents. The texture is now replaced with a correctly framed one, matching `Sprite._refresh`.
- Runtime: the FPS counter (F2) renders with RPG Maker MZ's stock look in every project. MZ ships the counter's CSS in its default `index.html` style block, which Reactor-generated pages never carried — the unstyled counter sat behind the game canvas (and the MV compatibility layer's workaround restyled it tiny). The stock styling is now inlined in the engine's `FPSCounter._createElements`, stacked above the game canvas and Effekseer overlay; the MV-layer workaround is gone.
- Forge Effekseer Generator: an explicit frame count now always caps the exported effect, including continuous-spin recipes. Previously "N frames" on a continuous stack only set the preview loop length while the exported file ran ~10 minutes (36000-frame node lives) — the database preview never ended and battle animations would stall the battle waiting for the effect to die. Blank duration (∞) still exports endless effects for ambience use, and the Forge preview now replays at the same frame the export ends on.
- Deploying an imported RPG Maker MV/MZ project no longer fails with "Project runtime is incomplete". Staging validation now checks which runtime `index.html` actually boots: projects on their original corescript deploy as-is, while projects on the Reactor runtime get a complete-file check whose error names the "Install Reactor Runtime" recovery action.

## [0.94.4] - 2026-07-11

### Added

- Skills, Items, and Weapons now assign animations through a two-column picker modal: a searchable animation list beside a live playing preview. The preview renders MV sprite-sheet animations on a 2D canvas and Effekseer effects through the game's own WebGL runtime, looping short effects with a brief pause. Skills and Items include the Normal Attack entry; selections dispatch through the existing field handlers.
- Database entry lists display a framed mini icon beside each name: IconSet icons for skills, items, weapons, armors, and states; face portraits for actors; and battler thumbnails for enemies (single battler images scale to fit, charset-style battlers show their front idle frame). Icons refresh immediately when changed through the icon picker, and icon-less entries keep a blank spacer so names stay aligned.

### Changed

- Bumped current development version to RPG Reactor 0.94.4.

### Fixed

- Fixed card-filling database forms (`db-fill`) collapsing every row to content width and centering it — Name and Description fields rendered tiny with large side gaps. Flex-column forms now stretch their rows to the card width.
- Effekseer previews in the Animations tab and the animation picker are aspect-correct: the projection's x-axis is scaled by height/width so spheres render round on non-square canvases.
- Buttons with dynamic labels (the animation picker trigger) are no longer reverted to cached text by the interface-translation observer, and field-styled buttons no longer inherit the read-only gray (CSS `:read-only` also matches `<button>` elements).
- Added Web-only responsive layout rules for laptop, narrow, and short viewports. Menus and toolbars scroll instead of clipping; the sidebar becomes fluid and stacks above the workspace on very narrow screens; splash, welcome, map-information, save-banner, and Playtest overlays fit the viewport; and Database, Event Editor, Map Properties, Image Picker, and general modal layouts reflow and remain scrollable. Desktop NW.js sizing is unchanged.
- Fixed Web Character Generator packaging by bundling the Outfit Engine, Hair Engine, and every built-in style-part script before the generator entry point. Browser execution uses those global engines while continuing to load project-specific parts from the virtual project.
- Added browser-host file export support for blobs, typed binary data, text, and data URLs. Active-project writes flush to IndexedDB; projectless single files use the browser save picker or download fallback, while multi-file exports recreate their resource tree through the directory picker.
- Fixed Web Forge output for procedural and Parts PNG character sheets, Animation Generator PNG/GIF exports, Sound Effect Generator WAV exports, generated Outfit/Hair library parts, and Effekseer effects with all baked, procedural, and user-text textures plus generated models.
- Fixed browser Playtest sometimes starting before the project-overlay service worker controlled the page. Web startup now waits for service-worker control and performs one guarded reload when required, so persisted edits are available to Playtest immediately.
- Removed the unsupported Build menu from the Web editor.
- Fixed test-only plugins not detecting packaged Windows playtests when isolated Chromium profiles are enabled. Windows NW.js exposes the `--user-data-dir` switch as `nw.App.argv[0]`, ahead of the separate `test`/`btest` argument; RPG Maker only inspects that first argument. Windows profile paths now carry the mode as an ampersand-delimited option, preserving profile isolation while restoring Sang Hendrix hover docks and other test-gated tools.
- Added regression coverage for Web responsive scoping, browser save destinations and fallbacks, Character Generator asset bundling, service-worker startup control, Forge project paths, and Windows mode-bearing playtest profiles.

## [0.94.3] - 2026-07-10

### Added

- Deploy Editor now offers a provider-neutral **Web** package. It bundles the browser editor and Reactor One into a root-level ZIP, opens Reactor One automatically, stores mutable project data in IndexedDB, supports resetting those edits, and runs Playtest in an in-page frame using the saved browser data.

### Changed

- Bumped current development version to RPG Reactor 0.94.3.
- The optional AppImage control now appears as an indented Linux sub-option in both deployment dialogs only while Linux is selected, rather than occupying a permanent top-level platform row.

### Fixed

- Fixed large NW.js SDK downloads failing when `dl.nwjs.io` remained idle for 30 seconds. Game and editor deployment now allow a three-minute socket-idle window, retry transient archive failures up to three times, and remove incomplete cache files between attempts.
- Game and editor deployment logs now show a live inline progress bar for every downloaded runtime, codec, FFmpeg, or AppImage tool asset. Known-size downloads display percentage and transferred/total MiB; chunked or unknown-size responses display transferred MiB with an animated activity bar, and the same row updates for retries and completion instead of flooding the log.
- Fixed NW.js worker-thread HTTPS requests sometimes opening a valid `dl.nwjs.io` URL without receiving archive bytes. Build workers now prefer the host's native `curl` transport with atomic output, byte-level progress polling, stall detection, and bounded retries; the verified Node HTTPS downloader remains the automatic fallback when curl is unavailable.

## [0.94.2] - 2026-07-10

### Added

- The RPG Maker MV compatibility layer (`reactor_mv_compat.js`) now ships in the runtime folder and loads in every project. Previously it lived only in a local test project, so the 0.94.1 MV compatibility work was not actually included in new projects or the public runtime. It is inert in pure-MZ projects: every API it provides is gap-filled only when missing.
- Outfit Forge **Part / Material / Accent** native dropdowns per slot, with the preset thumbnail list always visible (search still filters). Matches Procedural-tab option discoverability.
- Added a clean-checkout GitHub Actions workflow plus runtime-manifest, generated-project scaffold, save-safety, editor-distribution staging, and web deployment smoke tests.
- Added **Save Project** and **Playtest** to the File menu, visible shortcut indicators beside all four application commands, and global shortcuts for New (`Ctrl+N`), Open (`Ctrl+O`), Save (`Ctrl+S`), and Playtest (`Ctrl+R`).
- Added an `F5` shortcut for an uncached application reload, guarded by a confirmation warning that unsaved changes will be lost.
- Added an `F11` shortcut to toggle the editor's native NW.js fullscreen mode.
- Deploy Game can now retain only selected NW.js runtime locales while always preserving English as a fallback, reducing desktop package size without touching project translation assets.
- Deploy Game now offers optional lossless Oxipng recompression for staged PNG assets and explicit-quality OGG Vorbis re-encoding. Only smaller validated files replace staged copies, loop metadata is preserved, and the pinned FFmpeg tool is SHA-256 verified, separately cached, and accompanied by its license and provenance. Per-file progress keeps large optimization passes visible, and settings persist between sessions.
- Deploy Game and Deploy Editor can optionally emit a portable Linux x86_64 AppImage in addition to the existing Linux folder or ZIP. AppImage creation is available on Linux x86_64 build hosts, uses separately cached and SHA-256-pinned `appimagetool` and Type 2 runtime assets, preserves NW.js symlinks and executable modes, embeds desktop metadata/icons and the runtime license, and builds through an atomic temporary artifact.

### Changed

- Bumped current development version to RPG Reactor 0.94.2.
- Save Project and Save All now share one checked persistence path for the current map, database, project metadata, and authoritative map list. Snapshot-based dirty detection covers tile and event edits without per-control instrumentation, and map/project transitions offer save, discard, or cancel choices.
- Generated fallback projects now carry complete runtime-required `System.json` display/font settings and an empty `reactor_plugins.js`, producing the same safe baseline in clean source clones that do not contain private templates.
- Deployment dialogs now use a themed, searchable exact-version NW.js selector with release-date filtering, independently persistent game/editor output paths, and consistent uppercase **ZIP archive** descriptions across desktop platforms.

### Fixed

- Character Generator **Parts (PNG)** path inconsistency: loads PNGs from both `styles/<style>/parts/` and legacy `forge/character_generator/parts/` (Complex template). Empty state explains both paths and that procedural/hair/outfit JS parts live on the Procedural tab. Added Open Folder for the active style parts root.
- Forge project-path stickiness: Character / Animation / Sound Effect generators re-resolve `getCurrentProject().path` on save/load; `ForgeManager.onProjectChanged()` clears cached tool paths when projects open, create, or close, so Save GIF / bake dialogs no longer default to a previous project (e.g. Reactor One).
- Hair Forge **Lower Banding** and **Scraggle** response amplified (deeper edge bites, denser band rows, more highlight lanes) so slider steps are clearly visible; UI notes that Eye Zone is front-only.
- Fixed Character Generator style switching so active Looseleaf bodies, outfits, hair, and other style-tagged layers are excluded while Psychronic is selected, and vice versa. The inactive style's layer choices remain remembered for switching back instead of being destructively cleared.
- Fixed the Windows splash screen's small vertical startup bounce by removing two pairs of deliberate one-pixel `resizeTo()` height nudges whose native-frame and DPI rounding could produce larger visible movement. Packaged frameless Windows builds under Wine/Proton also no longer relaunch into a second already-frameless window.
- Fixed the Demo crashing on **New Game** while taking the title background snapshot. The MV positional `RenderTexture.create(width, height)` wrapper explicitly passed an undefined resolution into PixiJS 8.14, which replaced Pixi's default with `undefined`, generated `NaN` texture dimensions, and produced the `Value is not of type 'long'` extraction error. The wrapper now omits invalid optional values, and `Bitmap.snap` uses the native Pixi 8 options form with a finite resolution.
- Fixed database, map, and project persistence paths that swallowed write failures or reported success after partial failure. `MapInfos.json` now has one authoritative owner and cannot be overwritten by a stale database copy.
- Fixed packaged Animation Generator GIF import/export by declaring `gifuct-js` directly and staging `gif.js`, its worker, and the decoder's minimal CommonJS dependency closure in every editor distribution.
- Editor and game packaging now validate required runtime files, search for bundled NW.js beside either the editor or repository root, and omit development `save` and backup directories from deployments.
- Fixed valid RPG Maker MZ **Skip** commands (`code 109`) appearing as `Unknown (109)` in Common Events and troop events. The issue was data-dependent rather than Linux-specific; command data and runtime behavior were already correct.
- Fixed NW.js deployment acquisition repeatedly downloading runtimes that already existed in a secondary cache or beside a packaged Windows/Linux editor. Game and editor deployment now search every cache before downloading, use atomic archive downloads, cache the official stable-version manifest, and offer latest-stable, same-as-editor, or validated searchable release selection.
- Added an opt-in, exact-version `nwjs-ffmpeg-prebuilt` overlay for H.264/AAC support in game and full editor deployments. Codec release metadata and archives use a separate cache, GitHub-provided SHA-256 digests are verified, archive contents are constrained to the expected platform binary, and macOS installs into the active NW.js framework rather than an ineffective top-level sidecar.
- Linux editor distributions now use `.zip` like Windows and macOS instead of `.tar.gz`, while preserving executable bits and runtime symlinks in the archive.
- Fixed custom Deploy Game and Deploy Editor output directories resetting to installation-relative defaults after restarting the editor.
- Fixed deployed games preventing the same source project from launching in Playtest by assigning every playtest a Reactor-owned, project-specific NW.js profile on Windows, macOS, and Linux.
- Fixed the Effekseer Generator's Layers workspace and timing controls: Layers sit beside the preview when space permits and stack below it on narrow windows; opacity has a live percentage and applies to animated alpha curves; and keyframe selection, add/delete, frame edits, Start Frame, layer movement, and timing windows remain synchronized.
- Fixed Oxipng reporting every staged PNG as unsupported under NW.js worker threads. Deployment now initializes the supported single-thread WASM codec directly instead of allowing browser-worker detection to select an unavailable threaded build.
- Fixed localized About dialogs that still hard-coded `0.94.1`; every available translation now reads the shared application version.

## [0.94.1] - 2026-07-05

### Added

- Effekseer **Interface** category rebuilt as genuine 3D instruments and grown to **21 recipes**. Every interface is now real world-fixed geometry inside a presentation tilt rather than camera-facing sprites, so the orientation gizmo rotates them truthfully. Rebuilt: Radar Sweep, Target Lock, Power Levels (baseline-anchored segmented LED bars), Network Nodes (a volumetric 3D mesh cloud with sphere-model nodes and per-edge packet traffic), Hex Memory Dump, Boot Screen, Vital Signs, LCARS, Tactical Map, Static. New: Orbital Survey (a build-your-own solar system with per-planet size sliders and custom-texture uploads that wrap each planet as a real globe), Star Chart, Reactor Core (a spinning wireframe-torus core), Xenobiology Scan, Starship Analysis (a fully parametric wireframe starship with hull-tracking component glows), Circular Gauge (segmented LED arc with Hold/Sweep/Pulse fill modes), Bar Meter (vertical/horizontal LED bank), Behavior Matrix (a ternary plot with user-named corners and a tracked laser-dot marker), Flight Prediction (probability cone with Path Arc and Branches sliders), Composite Waveform (a living oscilloscope whose signal is a parametric, phase-layered texture reshaped by Intensity/Frequency/Detail/Noise sliders), and Battery (a 3D cylindrical cell of stacked "sausage-slice" LED segments with Fill/Drain/Hold/Short patterns, the last flashing a lightning bolt).
- Effekseer **user-typed text** for interfaces: a **Display Text** param (single-line strip) and **Paragraph Text** (multi-line, scroll-through or blink), rendered to crisp textures and carried through preview and export, so the same interface recipe can read as anything the user types.
- Effekseer **Physical** attack pack - 10 new battle-hit recipes covering the common combat verbs: **Slash** (curved crescent flurries with a Curve slider from hooked to straight), **Bite** (solid curved-fang jaws that clamp and stop at the bite line, with canine glints and gash marks), **Punch** (multi-hit combos with a knuckle imprint and speed lines), **Impale** (decelerate-and-stick spikes with hooking Curve arcs and exit spray), **Claw Rake** (parallel raking crescents), **Crush** (overhead smash with Bounces, ground ring, and thrown debris), **Arrow Hit** (a fast shaft that sticks with fletching), **Parry** (a barrier flash with directional ricochet sparks, the first defensive effect), **Whip Crack** (an S-curve lash cracking at the tip), and **Blood** (Burst/Spray/Drip patterns built from liquid string-ribbons and seeded morphing splat decals, with full color control for red/ichor/ooze).
- Effekseer **Energy** spell recipes: **Energy Boost** (rising energy streams over a rotating sawblade vortex base), **Energy Column** (an Energy-Beam-style layered 3D cylinder with a Beam Width slider and a thin-line teleporter pad), **Binding Circle** (an upright rotating rune cage), and **Hex Forcefield** (a seam-aligned honeycomb sphere shell with an energy sweep and on-surface impact shimmers).
- Effekseer **Christian Cross** variants: a Variant dropdown adds Orthodox (eight-pointed), Greek, and Celtic forms alongside the Latin default, on a reusable per-glyph symbol-variant mechanism.
- Effekseer **parametric textures**: procedural texture generators can bake slider-driven variants (parameters encoded in the texture name so the runtime and export both cache them by path), plus 20+ new generators (interface tech glyphs/strips/circuitry/scanlines/data-rain/EKG, a crisp three-tier ring family, a honeycomb lattice, a composite-waveform signal, Futhark runes, fangs, lightning bolts, seeded morphing blood splats).
- Map editor **MZ-style layer dimming**: selecting a specific tile layer (1–4) renders every other layer at reduced opacity so it's obvious which tiles live on the active layer, with A restoring full opacity, implemented as per-container alpha (free per frame; the previous per-tile-overlay approach was disabled for freezing large maps).

### Changed

- Bumped current development version to RPG Reactor 0.94.1.

- Moved the Effekseer **Explosion** recipe from Elements to the Physical category.
- Sharpened the Effekseer **Magic Circle**: the rune band is now a legible Futhark-style alphabet at higher resolution, and the inner star/tick struts use crisp textures instead of soft glow that blurred them. Ice Shards now use jagged, irregular seeded crystal models instead of a uniform hexagonal bipyramid.

### Fixed

- Fixed Effekseer preview loading in the Database Animations editor and Event animation picker (chrome-extension URLs could not reach project files after the reorg, and NW.js cross-realm `instanceof ArrayBuffer` checks silently dropped loads) by reading effects via `fs`, copying into a page-realm buffer, redirecting textures to data URLs, and adding a stall watchdog.
- Fixed Effekseer Forge rotation: the gizmo/drag no longer jumps to a different angle, and replaying an animation no longer resets the orientation, via exact trackball matrix math; and a category-flip wrapper is now applied innermost so a parameter rebuild no longer flips the tilt's components (an angle would change when an unrelated slider moved).
- Fixed Effekseer beam/column construction: Energy Beam's hollow core is filled with a Y-axis billboard plane, Teleport Column no longer renders as half a circle (its texture now wraps three times around), and Energy Column's base rings are crisp and sized to the beam instead of a soft oversized disc.
- Resource watchdog sweeps now run from the engine's own frame tick (throttled to 1Hz) instead of only from manager `isReady()` methods, plugins replace those methods wholesale (KODERA-style image caches, MV-1.6 audio caches), which silently disabled stall recovery. Bitmap stall recovery also moved to the `Bitmap` level with the same self-registering sweep as audio, and images that genuinely fail to load degrade to a blank canvas with a console error instead of deadlocking scene startup.
- Hardened the resource watchdogs based on live testing against a 565-plugin MV project: silent stalls now retry indefinitely (a genuinely missing file still fires onerror immediately, giving up after N attempts only produced spurious fatal errors for resources that were about to arrive); recovery is parallel across all pending resources instead of serialized behind cache implementations that short-circuit at the first not-ready item; the audio stall clock uses wall time instead of AudioContext time (which freezes while the context is suspended, blinding the detector exactly when loads stall); audio buffers self-register for watchdog protection when anything polls their readiness, which also revives "zombie" buffers that a plugin cache still gates on after other code destroyed them (MZ treats audio buffers as disposable, MV-era audio caches assume they are reusable); and audio files that genuinely fail to load now degrade to silence with a clear console error instead of deadlocking scene startup behind a plugin readiness gate.
- PIXI v8 compatibility: `getBounds()` returns a `Bounds` object in v8 where v5–v7 returned a `Rectangle`; plugins doing hit tests via `getBounds().contains(x, y)` crashed. `Bounds` now carries a `contains()` delegate.
- Extended the silent-stall watchdog to database JSON and image loads: `DataManager.isDatabaseLoaded()`/`isMapLoaded()` and `ImageManager.isReady()` now detect requests that died without firing onload or onerror (hung boot or hung map transfer with zero console errors), retry up to three times, and then surface a real load error. The data-file watchdog is self-sufficient, it derives what is missing from the database file list rather than hooking `loadDataFile`, which plugins (e.g. YEP_X_CoreUpdatesOpt) replace wholesale.
- Fixed a permanent black screen after loading a save when any audio file's load request silently died (no onload, no onerror, e.g., one dropped XHR in the burst of ~20 parallel audio loads a save triggers): the scene never reported ready, never started, and the stage was never attached. WebAudio now detects zero-progress loads from `isReady()` polling (background-timer-throttle-proof, measured on AudioContext time), retries up to three times, and surfaces a real error instead of hanging the game forever.
- **RPG Maker MV runtime compatibility (mix-and-match with MZ):** the PIXI8 runtime boots and plays a large commercial MV project's full plugin stack (Yanfly, Victor Engine, MOG, SRD, LeTBS, and more) through the intro with no errors, and MV-format save files deserialize cleanly. Loading a mid-game save through the game's own load menu now works and renders. Additional MV compatibility-layer fixes verified against that project's battle scene: MV window internal sprite names (`_windowBackSprite` and friends) alias to their MZ counterparts so MV plugins can restyle windows; the battle FIELD is created before battlebacks in MV's order (MZ's reversed order crashed MV battleback plugins and cascaded into most other battle plugins); and fixed-slot battle status layouts tolerate empty member slots instead of crashing on undefined actors. Two regressions from that batch were subsequently found and fixed in live testing: `ImageManager.reserveBitmap` must preserve MV's `if (filename)` guard exactly (plugins feature-detect these APIs, and translation plugins wrap `loadBitmap` with unguarded string matching, an unguarded port crashed the boot preload chain), and the MV message sub-window creation chain must run exactly once per scene (a second creation path produced duplicate name-box/backlog/choice windows that corrupted menus and ate choice input). A static MV-corescript-vs-runtime API scan then drove a batch of ~25 more MV compatibility gap-fills (verified live at runtime): MV's cell-sheet animation engine restored on `Sprite_Animation` for plugins that subclass it (fixes the LeTBS tactical-battle crash on animation setup), functional character balloons and hosted animations, `ToneFilter`, MV `Bitmap` tone/hue manipulation, `Game_Followers.forEach`, MV save-backup, window scroll/sound/layout helpers, and more. Fixed a structural MV/MZ gap where MV battleback plugins (YEP_ImprovedBattlebacks, VE_\*) call `battleback1Bitmap()` on `Spriteset_Battle` (MV's location) while the MZ model keeps that logic on `Sprite_Battleback`, crashing battle load, the MV compatibility layer now restores MV's full `Spriteset_Battle` battleback chain as gap-filled defaults without touching the MZ path.

## [0.94] - 2026-06-27

### Added

- Added an **Effekseer Animation Generator** to the Forge, a recipe-driven generator for native Effekseer particle effects (`.efkefc`) that removes the need for the external Effekseer editor entirely. The tool is built on an in-house binary format engine: a `.efkefc` reader/writer targeting binary version 1500 whose correctness is proven by **byte-identical round-trips of all 120 stock MZ effects** (the corpus doubles as the format's regression spec), and an `.efkmodel` mesh writer supporting both v3 single-frame models and v5 **multi-frame vertex animation** (verified against the stock Skull/Ball/Shield/NightHand models). Exports write the effect, its procedural textures (`effects/Texture/rr_*.png`), and any generated models (`effects/Model/rr_*.efkmodel`) directly into the open project in the exact layout the engine loads.
- Effekseer Animation Generator recipe library (80 recipes across all eight standard Animation Generator categories, every animation in the standard 2D generator now has a native Effekseer counterpart): **Geometric** - Hypercube, Pentachoron, and Hypersphere with genuine baked 4D double-rotation (multi-frame models, seamless whole-turn loops), all 3D polytopes and parametric surfaces (Cube through Möbius Strip and Double Helix), plus a Galaxy Spiral whose arms form *emergently*, a rotating hub launches stars that freeze in world space at spawn, so the ongoing spin traces real spiral arms; **Symbolic**, all 17 glyphs (including the SVG-sampled Trump silhouette) with two-color roles; **Object** - Sword, Knife, Hammer, Arrow, Bullet, Rock (seeded shape), Egg, Coin, Crown, Scythe, Circular Saw Blade, and a faceted Crystal Gem, built from a new lathe/prism/box mesh kit in the `.efkmodel` engine; **Interface** - LCARS, Boot Screen, Hex Memory Dump, Network Nodes, Power Levels, Vital Signs Monitor, Radar Sweep, Tactical Map, Target Lock, and Static achieve *pixel parity* by baking the standard generator's actual canvas renders into sprite-sheet textures played back via Effekseer UV animation; **Energy** - Energy Ball, Energy Beam, Aurora, Black Hole (real attractive force field), a Portal whose surface is the standard generator's *actual* water-ripple simulation (the discrete-wave-equation render is baked into a sprite sheet and played back via UV animation, ringed by an additive halo and motes falling in through an attractive force field), Energy Field, rainbow Energy Wisps drawn with Track ribbon trails, Holy Aura, Magic Circle, Teleport Column; **Elements** - Fire Burst, Water Splash, Wind Gust, Lightning Strike, Ice Shards, Shadow Pulse, Comet, Explosion, Light; **Effect** - Healing Ring, Hypnotize (interleaved spiral-arm disc), Acid Trip (counter-rotating petal mandalas), Chromatic Pulse (phase-offset R/G/B rings), Poison Miasma; **Physical** - Shockwave with ground cracks and gravity debris.
- Effekseer Animation Generator continuous effects: steady-state recipes (Portal, auras, columns, miasma, …) emit indefinitely instead of fake-looping a burst, there is no loop point at all, and declare a `prewarm`, so the preview silently pre-simulates them into steady state before the first visible frame. In-game the engine stops the handle when the animation window ends, exactly like any long-running effect.
- Effekseer Animation Generator rendering options: per-shape **Glowing Outline** style (crossed-quad struts with texture flow along edges) or **Solid (textured)** style with seam-correct UV mapping (duplicated seam columns so textures wrap spheres/tori cleanly), ear-clipped glyph fills, spherical-UV solid polytopes (dodecahedron pentagons recovered from the icosahedral dual), normal-blend faithful texture rendering, and untinted custom textures so a planet map wraps a sphere like a globe. Custom PNG/JPEG textures import through an AG-style picker that copies them into the project's `effects/Texture/`.
- Effekseer Animation Generator **keyframe system**: every layer holds keyframes, full parameter states pinned to user-chosen frames (select a KF chip, set its frame in the "@" box), and a compiler turns the differences into native Effekseer curves: colors and ring colors become FCurve tracks resampled through the keyframe positions, size becomes an eased/FCurve wrapper scale, differing spin rates integrate into FCurve rotations, and **differing custom textures compile to a cross-fade** (one instance per keyframe dissolving via alpha envelopes - Earth melts into Mars on a spinning globe). Keyframed windows re-spawn every master cycle so the pattern repeats identically on every loop, structure params stay in lockstep across keyframes (so transitions can always pair the node trees), and Randomize on later keyframes rolls only tweenable values. Geometry-changing parameters hold keyframe 1's value, the same limitation as Effekseer's own editor.
- Effekseer Animation Generator **AG-style workspace**: a LAYERS panel below the preview on a dark inset backdrop (per-layer cards with SVG visibility eye, reorder, duplicate, delete, opacity slider that rescales the layer's compiled colors, and keyframe chips), ＋ add-as-layer buttons on every sidebar row in a fixed right-hand gutter, a master **Frames** duration field in the playback bar (the counter loops against it; burst compositions restart there; continuous ones loop seamlessly), Delay/Duration inputs per layer, export name + button relocated to the bottom bar, and a 720×720 preview that scales to fill the workspace.
- Effekseer Animation Generator solid-surface rendering corrections: equirectangular UV orientation fixed against a real Earth texture (u as parametrized, v flipped), **backface culling on all closed solids**, the MZ-style projection yields constant depth so occlusion must come from culling, not depth writes (Möbius strip stays double-sided), and custom texture uploads are copied under content-hashed filenames because the runtime caches textures by path (re-uploads previously showed stale pixels).
- Effekseer Animation Generator reliability: the sidebar search filter no longer erases row layout when re-showing entries; a status readout after every rebuild shows bytes, visible layers, and compiled keyframe tracks; the class surface and the index.html wiring are both locked by tests; deferred effect release and sync-load handling keep slider rebuilds crash-free.
- Effekseer Animation Generator **layer stack**: stack whole animations into one effect exactly like the standard Animation Generator's layers, a layer bar above the preview with a ＋ button (mix Energy Ball with Fire Burst, a Portal under a Magic Circle, anything with anything), each layer keeping its own full parameter set, plus per-layer **Start/End progression sliders** that window the layer on a shared timeline. The composer merges every layer's textures and models into one resource table (indexes remapped automatically) so the whole stack exports as a **single .efkefc**. Switching or editing layers never restarts the preview, and a recipe **search box** filters the sidebar. Composition mechanics are locked by a real-runtime test.
- Effekseer Animation Generator **Composer**: a new "Custom Effect" recipe where effects are built from LAYERS with keyframe-style timing, each layer (Flash, Glow, Shock Ring, Particle Burst, Tendrils, Smoke Puffs, Motes) has a start/duration window on a shared timeline plus eased from→to motion inside it, edited through per-layer cards with add/duplicate/remove. Layer factories live in a new composition library (`layers.js`) whose defaults are calibrated from a statistical digest of all 316 professional effects in the Complex template (staged acts, ~50/50 normal/additive blend, fades and eased scale on most nodes, spark-dust children on moving particles, Track-ribbon tendrils), and everything maps onto native Effekseer primitives, so exports are plain `.efkefc` files.
- Effekseer Animation Generator element recipes rebuilt as staged pro-grammar compositions using the layer library: **Fire Burst** (ignition flash → heat rings → dusted ember fountain → flame tendrils → normal-blend body under additive core → smoke and cinders), **Water Splash** (impact → crown rings → dusted droplet fountain → water body → settling ripple and mist), **Ice Shards** (crystallization snap → shard spray → icy sheen → weightless hanging glitter → sinking mist), **Wind Gust** (pressure shimmer → three depth-layered streak waves → curling air tendrils → swept debris), each ~15-20 nodes versus the old 3.
- Effekseer Animation Generator format engine now **reads Effekseer binary versions 1610 and 1710** in addition to 15/1500 (writer still emits the engine-native 1500): steering behavior, triggers, kill rules, LODs, procedural models, the 1600-era renderer-common extension (emissive scaling, 7 texture slots, extra UV channels, alpha cutoff, falloff, soft particles), per-element force-field falloffs, and the 1710 dependency-table INFO chunk. All 316 effects in the Complex template, including the complete EVFX/EE01 professional packs, now parse, giving the generator a full professional reference library; a statistical digest of its 7,870 nodes (layer counts, blend/fade/scale-animation conventions) now guides recipe design.
- Effekseer Animation Generator spinning recipes (Geometric, Object, Symbolic, Hypersphere, Energy Ball/Beam, Aurora, Black Hole) converted from fixed-length seamless loops to **continuous playback**: spin sliders are now honest degrees-per-second (the old whole-turn loop snapping quantized spin so coarsely that at the default loop length any rate under ±90°/s rounded to zero), there is no loop point at all, and the spark/glint texture was redrawn as a per-pixel four-ray glint with soft falloff.
- Effekseer Animation Generator workflow tools: a **🎲 Randomize** button (like the standard Animation Generator's) that rolls every slider on its step grid, picks pleasing random hues, and flips toggles/selects, texture uploads and recipe-excluded params are left alone, and a **preset system**: save the current parameter set under a name, recall or delete presets from a dropdown, stored per project in `forge/effekseer_generator/presets.json`.
- Effekseer Animation Generator preview and controls: live in-memory playback through the same bundled `effekseer.min.js` WebGL runtime the game uses (ArrayBuffer effects + data-URL resources, zero disk writes), a persistent render loop with background rebuild and seamless effect swap on every slider change. Two runtime timing hazards were diagnosed with a headless harness that runs the real WASM in Node and fixed: the load callback fires *synchronously inside* `loadEffect()` whenever the core already caches every referenced resource path (the common slider-rebuild case), the swap then installed a null effect and the preview stuck on "loading effect", and freeing a replaced effect's WASM memory in the same tick its handle was stopped is a use-after-free (instances are destroyed on the *next* update), so replaced effects retire through a deferred-release queue. Seamless looping by default (spin rates snapped to whole turns per loop, texture flow snapped to whole repeats, and a deterministic frame-counted restart that eliminates the blank-frame flicker at the loop point), an orbit camera on right/Shift-drag, and left-drag rotating the effect itself, the same orientation state the 3D rotation gizmo edits, so the widget and direct dragging stay in sync, both applied in realtime and baked into exports. All top-level nodes are promoted to Always-bind, so realtime steering works on every recipe including the burst effects. Picking a custom texture automatically switches the shape to Solid style so the image visibly wraps the surface (the redundant built-in texture dropdown is gone), and the recipe sidebar keeps its scroll position when switching recipes. The preview is crash-proof: runtime errors surface in red status text instead of silently freezing the render loop, and a load watchdog reports effects that never finish loading. Registered as its own Forge line item and menu entry with i18n across all 10 editor languages, and covered by test suites: stock-corpus parse/round-trip, `.efkmodel` round-trips, every recipe validated at defaults, at parameter extremes, with every individual parameter swept across its range (~2,000 builds), invariants that every declared slider is actually used and every recipe steers, and a **headless playback suite** that runs every recipe through the actual Effekseer WASM runtime in Node (stubbed WebGL): load, play, 150 simulation frames, realtime steering, a mid-playback slider hot-swap, and an instance-pool leak check per recipe, plus a bake-pipeline test that renders every baked recipe through the real Animation Generator code.
- Added a procedural **Mini Skirt** option for the Outfit Forge Legs zone, available as a second Legs-slot preset across both Looseleaf and Psychronic body styles. A one-cloth pleated skirt spans both hips from the belt down to a tunable hem fraction, with crisp alternating shadow-crease / highlight-ridge vertical pleats (a 4px period that survives on dark navy/gunmetal ramps instead of washing out), optional anatomical knee pads, a one-row darker waistband strip, and a crisp dark hem line. A stronger triangular A-line flare pass extends the skirt **beyond the body's per-row silhouette** so the cloth actually bell-s past the hips on the front, side, and back walk frames instead of being trapped inside the body outline like pants. Below the hem the legs are bare except for optional knee pads (body skin shows through the part composite). Tunable params `hem` (0–1 across the waist-to-knee span, default 0.35, with `0` as a micro-skirt), `waistband`, `pleats`, and `kneeAccent` are exposed in the Legs zone card. Outfit Forge regression tests cover preset registration, painter/schema registration, valid sheet generation, visible pleat shading, triangular flare pixels outside the body silhouette, anatomical knee pads above the boot/shin band, `hem=0` not extending toward knees/boots, and no stray leg-palette pixels below the hem outside knee pads.

### Changed

- Bumped current development version to RPG Reactor 0.94.

### Fixed

- Fixed Mini Skirt side-view cleanup by capping leg underfill at the skirt hem and checking the mini-skirt shade before applying body-edge outlines, preventing orphan outline/bridge bands below the hem where bare legs should show through.
- Fixed Outfit Forge Mini Skirt `Knee plates` so it now renders separate knee pads at the anatomical knees instead of being an ignored segmented-pants-only toggle; the Mini Skirt `waistband` toggle also produces visible top-band shading instead of being swallowed by generic edge outlines.
- Fixed Psychronic Mini Skirt placement by rejecting classifier rows above `legs.minY`; without that guard, Psychronic torso/belt rows were accepted by the skirt painter and made the waistband/skirt look far taller than the actual legs-zone geometry.
- Fixed Outfit Forge card number inputs feeling laggy while typing by debouncing typed numeric edits instead of regenerating the preview on every keystroke; spinner buttons still update immediately.

## [0.93.1] - 2026-06-21

### Changed

- Bumped current development version to RPG Reactor 0.93.1.
- Reworked macOS editor distribution packages so the zip contains only a self-contained `RPG Reactor.app` instead of a sibling runtime folder or loose Chromium files.
- Windows editor distribution packages now remove `--enable-logging` from the packaged editor payload to avoid noisy Chromium logging output in final builds.

### Fixed

- Fixed macOS packaged editor startup by placing the editor payload at `Contents/Resources/app.nw`, the standard NW.js macOS bundle location.
- Fixed macOS packaged playtest by embedding a clean internal `playtest-runtime/nwjs.app` inside `RPG Reactor.app` and symlinking it to the bundled NW.js framework to avoid doubling package size.
- Fixed macOS playtest runtime discovery when NW.js reports paths from helper processes instead of the outer app executable.
- Fixed Windows packaged playtest to prefer the clean adjacent `nw.exe` before any stale `nwjs-win` runtime folders and to suppress playtest console flicker.
- Fixed Windows distribution builds producing Chromium `Invalid logging destination` noise by stripping `--enable-logging` from the packaged editor config.
- Fixed erasing existing imported RPG Maker map tiles by making auto eraser mode target the topmost real layer at each cell, including layer 0 base/autotile data.
- Fixed rectangle, circle, and fill eraser tools so they work without selected palette tiles, preserve eraser mode when changing drawing tools, and never show selected-tile placement previews while erasing.
- Fixed eraser state edge cases where focus changes, Region tab selection, or a `null` active draw tool could leave Eraser visually selected but internally unable to erase.
- Fixed Plugin Manager saves for standard RPG Maker MV/MZ projects so `js/plugins.js` stays compatible with RPG Maker's expected `name`/`status`/`description`/`parameters` entries while Reactor-only parsed help, author, and URL metadata remains editor-only.
- Fixed Database > System in the native top menu by exposing separate System 1 and System 2 entries and routing the legacy `system` database type to System 1 instead of showing an unknown-type error.

## [0.93.0] - 2026-06-21

### Changed

- Bumped current development version to RPG Reactor 0.93.
- Audio Player Volume/Pitch/Pan controls now sit in a distinct themed card instead of blending into the modal background.
- Added the Rarely Typical Players Podcast YouTube channel to the Help/About links.
- Updated the editor window title to use `RPG Reactor | <Game Title>` and refresh on project load, close, language changes, and System 1 game-title edits.
- Reworked Windows/Linux platform editor distribution packaging to append the editor payload into the branded executable, leaving the plain NW.js runtime clean for playtesting without shipping a second full runtime copy.
- Windows editor distribution packages now use frameless compatibility mode with RPG Reactor title controls, centered startup, and manual maximize/restore behavior to avoid Proton/Wine native-frame artifacts on Linux.
- Replaced native emoji flags in the Options language picker with SVG flag badges so Windows/Chromium shows actual flags instead of `JP`/`EN`-style regional indicator text.

### Fixed

- Fixed playtest launch from final Windows editor builds by resolving a clean NW.js runtime and launching game projects with the project directory as the child process working directory.
- Fixed final Linux editor playtest launch by avoiding contaminated sibling `nw` runtimes when a loose editor `package.nw` is present.
- Fixed macOS editor distribution builds to keep a separate clean `nwjs-mac/nwjs.app` runtime for playtest instead of reusing the editor `.app` bundle.
- Fixed packaged Windows editor taskbar icons by resolving icon files from packaged app paths and embedding the best-fitting entry from multi-size `.ico` files.
- Fixed Windows builds run through Proton/Wine showing a harsh white native client-area/menu band with vertically offset mouse hit-testing.
- Fixed packaged editor startup placement so the splash screen and editor window open centered on screen.
- Fixed Forge launcher tiles losing their themed title/description styling when the generic localization text pass flattened complex button markup.
- Fixed database list rows not updating live while editing an entry name in the detail panel.
- Fixed actor image preview cards overflowing outside the Images section in the database modal.
- Fixed the actor Traits empty row alignment so it no longer protrudes into the indicator gutter.
- Fixed Forge Character Generator imported body sheets being shifted by procedural body-centering; bulk-imported/custom bodies now preserve their authored cell position. Also fixed normal RPG Maker 12x8 sheet detection.
- Fixed Psychronic female Outfit Forge armor generation with female-specific head/torso/shoulders/arms/hands/gauntlet/belt/legs/boots zone masks, female-safe mask coordinates, normalized Forge gender tags, and Zone Edit reload/export support so male bodies are unaffected.
- Replaced deprecated Pixi `cacheAsBitmap` map-editor cache calls with Pixi v8 `cacheAsTexture` calls.
- Improved procedural Outfit Forge pants and boots shading with pants underfill to prevent skin-colored cracks, plus broader natural shadow/light patches on pants and boots instead of dot-like striping.
- Improved procedural Outfit Forge helmet, torso armor, shoulders, and arms with connected metal volume shading while preserving seams, glow accents, and hard bevel details.
- Refined Psychronic helmet rendering with lower female visor/open-face placement, side respirator grill detail, and reduced isolated bright edge artifacts.
- Refined Outfit Forge pants and armor visuals with tighter front pants upper highlights, added Psychronic side-view helmet/torso panel detail, and stronger outer separation strokes for pauldrons and gauntlets.
- Refined Psychronic torso, arm, and helmet armor with structured panel shading and boundary-only outline strokes.
- Refined Psychronic back torso armor so the center highlight continues upward and paired panel lines arc into the shoulders.
- Updated the Nova Sentinel belt default material/accent pairing to gold/gold.
- Added an initial Hair Forge tab with anchor-based procedural hair generation, shared Forge walk-preview playback, live preview, save-to-library support, and generated hair regression coverage.
- Improved Hair Forge output with layered crown clumps, carved part lines, tapered bangs, side locks, and back-view flow strands instead of a single smooth hair mass.
- Refined Hair Forge internal hair seams to use shaded pixels instead of transparent cuts that created noisy black holes after outlining.
- Refined Hair Forge hair patterns with connected mirrored highlight/shadow lanes and exterior-only outlining for cleaner pixel-art flow.
- Refined Hair Forge long hair with a coherent panel overlay that connects crown shading into bangs, side curtains, and back locks.
- Stabilized Hair Forge side-view animation by anchoring crown/root pixels to the body frame and moving only lower hair tips subtly; side-view long hair now hangs from the back of the head with only short face-side bangs.
- Refined Hair Forge bangs and temple areas with larger polished hair panels, stronger side-lock connectors, and continuity smoothing for less sloppy strand patterns.
- Refined Hair Forge side bangs into shorter tapered clumps and filled small enclosed hair gaps so strands read as connected hair instead of blocky panels with holes.
- Refined Hair Forge silhouettes by trimming blocky side-bang faces and tapering/rounding long back-hair curtains for a more natural hair shape.
- Refined Hair Forge long hair with pixel-fur style finishing: scalloped exterior tuft edges plus connected V-shaped highlight and shadow flows.
- Refined Hair Forge tuft details to stay clipped inside the hair mass and added front-view crown/bang flow lines for less blocky bangs.
- Lowered and softened Hair Forge side-view front hairlines with connected tapered tufts instead of a square forehead edge.
- Reworked Hair Forge side-view bangs into swept overlapping locks and relaxed the forehead carve to avoid exposed bald-looking side hairline gaps.
- Refined Hair Forge side-view silhouettes with a forward-swept forelock, broader light/shadow shapes, and a preserved eye window so side eyes remain visible.
- Lowered Hair Forge side-view hair mass slightly while keeping the side eye-window anchored to the real eye line.
- Refined Hair Forge front-view layered hair with wider wavy side curtains, swept bang clusters, and a cleaner face opening based on imported Psychronic reference-hair flow.
- Fixed Hair Forge side-view hair by replacing the rectangular eye cutout with a tapered slit, filling the rear scalp cap, and removing disconnected lower hair islands.
- Fixed Hair Forge side-view bangs so the Bangs checkbox controls the swept forelock, fills the forward forehead area, and visibly changes side frames.
- Fixed Hair Forge side-view outlines and side locks so late side-only hair additions receive exterior strokes, side locks anchor from the sideburn/temple area, and the Side Locks checkbox visibly changes side frames.
- Fixed Hair Forge frame selection so frame 0 previews correctly, and moved hair color swatches into the color dropdown option rows.
- Stabilized Hair Forge side-view hair horizontally while preserving the intended 1px side walk-frame vertical bob and subtle hair-flow variation.
- Increased Hair Forge side/back walk-frame hair flow and tightened front-view eye-only clearing against visible eye pixels so animated bangs do not cover the eyes without cutting a forehead strip.
- Added an explicit anchor-based front-view eye protection zone for Hair Forge so Psychronic female frame 2 outline spikes do not cover the eye without cutting a rectangular bang hole.
- Added Hair Forge Eye Zone controls for front-view hair protection, with X/Y/width/height adjustment and a lower default Y offset for eye placement.
- Updated the default Hair Forge Eye Zone to X 1, Y 7, Width 3, Height 5 based on visual calibration.
- Added Hair Forge Hair Pattern controls for lower-hair banding and scraggle, with smoother default side-view lower hair and tunable shading variety.
- Strengthened Hair Forge Hair Pattern controls so lower banding and scraggle visibly affect front, side, and back lower hair instead of only subtly changing side strands.
- Added a Short Spiky Hair Forge style with raised crown spikes and a shorter side/front/back silhouette.
- Reworked Short Spiky Hair Forge generation into its own all-around spiky cap/fringe/sideburn style, with length scaling longer spikes instead of falling back to layered-bob locks.
- Fixed Short Spiky front hair so it keeps the central face open and uses short angular sideburn spikes instead of a face-covering lower curtain.
- Made Short Spiky more aggressively spiky all around by breaking up the front brow band, side lower mass, and back lower block into jagged spike teeth.
- Simplified Short Spiky into a head-local spiky style by removing lower tendrils/pattern passes and trimming excess side/back length.
- Simplified Short Spiky further into a compact cap/fringe/sideburn shape, removing the aggressive jagged-teeth experiments that made it visually noisy.
- Refined Short Spiky with style-specific front/side/back spike silhouettes, connected back-view spike roots, side-view spiky bangs, removed horizontal ponytail-like side spikes, and Short Spiky-specific triangular texture controls.
- Added a Center Part Long Hair Forge style with orderly long straight strands, a visible middle part, smooth side-view bangs, an open face-framing front silhouette, rounded long back curtain, and subtle walk-frame hair sway.
- Expanded Hair Forge colors with auburn, platinum, rose, violet, navy, and emerald palettes.
- Shifted right-facing Hair Forge side hair slightly back so rear scalp coverage matches the left-facing side view.
- Recalibrated Psychronic female Outfit Forge side-frame zone masks for the updated horizontal body-frame alignment.
- Added explicit eye-line anchor metadata for generated outfit placement without turning eyes into a paint-blocking clothing zone.

## [0.91] - 2026-06-18

RPG Reactor 0.91 expands the editor from English-only/deep-partial UI coverage into a multilingual release candidate, refreshes the Options palette/language UX, documents the current project state for GitHub, and continues the Pixi v8 cleanup.

### Release Highlights

- **Ten editor languages** - English, Japanese, Spanish, Traditional Chinese, Simplified Chinese, Russian, Portuguese, German, French, and Greek are registered in the browser-global i18n manager.
- **Instant language switching**, users can switch language from `File -> Options` or the top-menu language button without restarting the editor.
- **Deep editor localization pass**, database/editor chrome, event editor surfaces, many fixed event-command forms, About, Forge, Audio Player, and common alerts/status messages now route through i18n while project-authored game data remains untouched.
- **Palette dropdown polish**, the Options palette picker now shows color swatches, can overflow outside the modal, and uses theme tokens so open rows stay high-contrast like the Language dropdown.
- **Pixi runtime packaging cleanup**, the bundled Pixi v8 runtime now uses the canonical `runtime/libs/pixi.js` path in runtime, packaging, and tests.

### Documentation

#### Changed

- Updated repository/editor documentation to match the current Forge Character Generator state, including Outfit Forge, Nova Sentinel recipes, Looseleaf/Psychronic style support, and the small current Node test baseline.
- Clarified that PSYCHRONIC plugin GitHub sync notes refer to a maintainer-local/private Complex template plugin workspace, not files included in the public RPG Reactor repository.
- Refreshed the Character Generator procgen handoff so it points to `outfit_engine.js`, style adapters, `procgen/outfits/nova_sentinel.js`, generated full-outfit outputs, and current Psychronic validation work instead of the older single-style/agent-analysis phase.
- Added a root `CHANGELOG.md` so GitHub visitors can see release progress without opening the editor subfolder.
- Updated root/editor README version text to RPG Reactor 0.91 and refreshed the localization/theming documentation for the current Options UI.

### Localization

#### Added

- Added `src/I18nManager.js` with English, Japanese, Spanish, Traditional Chinese, Simplified Chinese, Russian, Portuguese, German, French, and Greek dictionaries, persisted `rr-settings.language`, `I18n.t(key)`, `data-i18n`/`data-i18n-title`/`data-i18n-aria` DOM binding, exact-text translation for generated editor chrome, mutation observation, and a `rr-language-changed` event for dynamic UI refreshes.
- Added a Language selector to `File -> Options` and a top-menu language button. Switching language applies immediately without restarting the editor.
- Localized the stable UI layer: splash/loading text, menu bar/submenus, toolbar labels and titles, welcome screen, sidebar shell labels, map info static labels, Options modal, About dialog, Forge launcher/sidebar/welcome tiles, Audio Player shell labels, and common project/map status or alert messages.
- Localized database/editor chrome and fixed event editor surfaces including command picker/list/context menus, event page UI, switch/variable pickers, graphic/animation pickers, Battle Test config, traits/effects, and many fixed event-command form labels/options.
- Added event command/category name maps so all supported languages share the same event-command localization path.
- Added `data-rr-i18n-skip` for complex custom controls whose internal DOM should not be rewritten by the generic exact-text pass.

### Tests

#### Added

- Added Node tests for Outfit Forge generator invariants: Nova Sentinel recipe/style wiring, Looseleaf and Psychronic generated sheet dimensions, palette-letter validity, skin-letter detection, family/accent validation, and family/accent reuse.
- Added a lightweight Markdown link test for project documentation files so stale local doc links fail in `npm test`.
- Added i18n tests for supported-language dictionary completeness, language persistence/apply behavior, missing localized-key references, and high-visibility localized labels that should not fall back to English.

### Options and Theming

#### Changed

- Replaced the native Palette `<select>` with a custom swatch dropdown so every palette row can show representative colors consistently across platforms.
- Moved Palette dropdown styling into `css/theme.css` theme-token classes instead of inline computed colors. The closed trigger now matches native select styling, and the open menu rows use native option-style dark/high-contrast surfaces with gold selected/hover states.
- Allowed the Options modal body to overflow visibly so the Palette dropdown can extend outside the modal instead of clipping.

### Runtime and Packaging

#### Changed

- Renamed bundled Pixi runtime from `runtime/libs/pixi8.js` to canonical `runtime/libs/pixi.js`, and updated runtime script loading, editor distribution packaging, and tests to use `js/libs/pixi.js` in generated projects.

#### Fixed

- Removed direct editor shell script tags that pointed at missing `node_modules` Pixi/GIF files.
- Fixed low-risk Pixi v8 deprecation warnings including texture wrap mode, container labels, and text constructor/stroke style usage.

### Forge - Character Generator

#### Changed

- **ASCII gap fill now closes 2-cell and 2x2 dimples reliably** (`src/forge/CharacterGenerator/parts/body/human_base_shared.js`) - `RR_CG_fillAsciiPinholes` now runs three passes instead of one and relaxes the 2-3 cell crack rule so each blank cell only needs solid support on one side (above or below for horizontal cracks, left or right for vertical). Added an explicit 2x2 dimple pass that fills small square holes with 7+ surrounding solid pixels. Filling is now on by default for registered style sheets too, only disabled when callers pass `repairAscii: false`.
- **Letter `Z` is now the character outline, not eyebrow** (`src/forge/CharacterGenerator/parts/body/human_base_shared.js`, `src/forge/CharacterGenerator/CharacterGenerator.js`), analyzed body sheets quantize the dark silhouette border to `Z`. The renderer now maps `Z` to a near-black outline color (matching `N`) instead of `brow.deep`, so the entire character silhouette no longer renders in the eyebrow color. Eyebrow material moved to `M`, and the importer brow heuristic now retags `T/D` above eye clusters to `M`.
- **Looseleaf male body template replaced with full Z-outline sheet** (`src/forge/CharacterGenerator/parts/body/looseleaf_male.js`), switched to the new ASCII sheet that uses `Z` as the explicit body outline throughout, `M` for hair/eyebrow material, `W` for eye whites, `I/J/U` for iris tones, and `E/Q` for underwear. This is the first body sheet that takes advantage of the expanded A-Z material slots end-to-end.

#### Changed (other)

- **Procedural humanoid base restyle** (`src/forge/CharacterGenerator/parts/body/`), replaced the front-only anatomical mannequin bodies with a shared 144×144 anime/pixel-art humanoid base that renders all 4 walking directions and 3 walk frames. The new proportions keep the larger frame for future hair, hats, weapons, and oversized equipment while using a more RPG-sprite-readable head, eyes, limbs, feet, and ground shadow.
- **Procedural male running-template reset** (`src/forge/CharacterGenerator/parts/body/human_base_shared.js`), threw out the first scaled-grid mannequin attempt and restarted from a single hand-authored forward-idle pixel template. The new square-one pass isolates a bald/body-only chibi sprite using explicit 48×48 logical-pixel spans so the base silhouette can be judged before walking frames, side/back views, clothing, or hair are reintroduced.
- **Default procedural preview temporarily isolates the body layer**, the adventurer outfit and shaggy hair parts remain registered, but `_buildActiveParts()` now renders only the active body while the base sprite is being rebuilt from the template.

#### Added

- **Template PNG → ASCII analyzer** (`src/forge/CharacterGenerator/CharacterGenerator.js`), added an `Analyze Template PNG...` utility to the procedural Character Generator. It loads an original sprite PNG/JPEG/WebP, auto-crops the first cell of a 3×4 character sheet when possible, preserves the source cell dimensions when they fit inside the 144×144 frame, classifies pixels into the body template's ASCII palette letters, and shows copyable rows for `human_base_shared.js`. This gives us a real pixel-analysis workflow for rebuilding the procedural base from reference art instead of eyeballing screenshots.
- **Full 3×4 ASCII sheet templates** (`src/forge/CharacterGenerator/CharacterGenerator.js`, `src/forge/CharacterGenerator/parts/body/human_base_shared.js`), the analyzer now emits a paste-ready `RR_CG_BODY_TEMPLATE_SHEET[direction][frame]` table when it detects a full walking sheet, and the procedural body renderer selects the correct ASCII cell by current direction/frame.
- **Safer ASCII sheet paste format** (`src/forge/CharacterGenerator/CharacterGenerator.js`, `src/forge/CharacterGenerator/parts/body/human_base_shared.js`), analyzer output now uses `window.RR_CG_BODY_TEMPLATE_SHEET = [...]` instead of a top-level `const`, avoiding redeclaration mistakes and making the paste location less fragile. The renderer accepts both the older const style and the new window assignment.
- **ASCII templates render at native size** (`src/forge/CharacterGenerator/parts/body/human_base_shared.js`), body templates now stay at their source ASCII-pixel dimensions inside the configured frame instead of scaling up to fill the frame. Oversized templates still scale down to fit.
- **Configurable procedural frame size** (`src/forge/CharacterGenerator/CharacterGenerator.js`), the Procedural tab now exposes frame width/height controls and uses the configured size for preview, template analysis fit checks, and 3×4 sheet export. Frame size persists through the shared Character Generator config.
- **ASCII template alignment controls** (`src/forge/CharacterGenerator/CharacterGenerator.js`, `src/forge/CharacterGenerator/parts/body/human_base_shared.js`), the Procedural tab now has Align X (Left/Center/Right) and Align Y (Top/Middle/Bottom) controls for positioning native-size ASCII sprites inside the configured frame. Alignment persists in Character Generator config.
- **Character Style selector** (`src/forge/CharacterGenerator/CharacterGenerator.js`), added a shared style selector with `Looseleaf` as the first style. Built-in procedural parts are tagged as `looseleaf`, and PNG parts now load from style-specific folders under `forge/character_generator/styles/<style>/parts/`.
- **Drag/drop layer ordering for PNG parts** (`src/forge/CharacterGenerator/CharacterGenerator.js`) - Parts (PNG) category rows are now draggable layers in addition to the existing up/down buttons. Layer order persists per character style.
- **Looseleaf body sheet split + ASCII gap cleanup** (`src/forge/CharacterGenerator/parts/body/`), moved the large Looseleaf male ASCII sheet into `looseleaf_male.js` so `human_base_shared.js` remains the shared renderer. Added conservative cleanup for isolated pinholes plus short 2-3 cell blank runs with solid support above/below or left/right, reducing tiny analysis gaps without closing intentional limb spaces.
- **Looseleaf male ASCII source gaps filled** (`src/forge/CharacterGenerator/parts/body/looseleaf_male.js`), applied the gap cleanup directly to the stored ASCII sheet, replacing short internal blank cracks with neighboring shade letters so the source template itself no longer carries those visible pinholes.
- **ASCII analyzer background masking improved** (`src/forge/CharacterGenerator/CharacterGenerator.js`, `src/forge/CharacterGenerator/parts/body/human_base_shared.js`), replaced per-pixel background removal with an edge-connected flood-fill background mask so dark outline pixels on opaque-background source sheets are not mistaken for transparent holes. Expanded the analyzer/render letter palette with additional dark, tan, and cream shade buckets for better Looseleaf-style fidelity.
- **Looseleaf ASCII material palette split** (`src/forge/CharacterGenerator/CharacterGenerator.js`, `src/forge/CharacterGenerator/parts/body/`), separated ASCII letters into skin, underwear/cloth, and iris material buckets. Skin letters now follow `skinColor`, underwear uses its own new `underwearColor` parameter, and future analyzer output uses `I` for iris pixels instead of overloading `E`.
- **Procedural walking preview**, the Character Generator preview now has Play Walk / Stop Walk controls plus direct frame buttons, so generated characters can be judged in motion before exporting the 3×4 sheet.

#### Fixed

- **Procedural saved sheets had blank side/back rows** because the male/female body parts returned early for every direction except front. Side, back, and walking-frame previews now render for both base body types.
- **ASCII template alignment controls had no effect** (`src/forge/CharacterGenerator/CharacterRenderer.js`) - `CharacterRenderer.resolveParams()` discarded non-schema params, so internal renderer values like `style`, `alignX`, and `alignY` never reached the body renderer. It now preserves user-supplied extra params while still filling schema defaults.
- **Underwear color changed eye whites and eye color changed nothing** (`src/forge/CharacterGenerator/parts/body/`), remapped `Y` to fixed eye-white/cream instead of underwear highlight, kept `E` as underwear/cloth, and converted Looseleaf male iris clusters from `K` to the new `I` eye-color letter.
- **Looseleaf iris now has bright and shadow tones** (`src/forge/CharacterGenerator/parts/body/`), added `J` as a darker eye-color shade and converted lower iris clusters in `looseleaf_male.js` so changing `eyeColor` affects both the bright/top and darker/bottom eye pixels.
- **ASCII body interpreter now uses expanded material letters** (`src/forge/CharacterGenerator/parts/body/human_base_shared.js`), added A-Z semantic color slots for skin, underwear, iris, eye whites, mouth/blush, shadows, and eyebrow-ready letters instead of reusing the same few symbols for unrelated materials.
- **Looseleaf male eye and underwear colors no longer collide** (`src/forge/CharacterGenerator/parts/body/looseleaf_male.js`), moved lower-torso `I/J` pixels to cloth letters (`E/Q`) so eye color only affects head eye detail, and underwear color affects the body underwear region.
- **Looseleaf sheets now register only by style/variant** (`src/forge/CharacterGenerator/parts/body/`), removed the legacy global `RR_CG_BODY_TEMPLATE_SHEET` fallback path so reloads cannot accidentally pick up stale global template data.
- **Template analyzer now emits style-specific sheet JS** (`src/forge/CharacterGenerator/CharacterGenerator.js`), generated full-sheet ASCII targets `window.RR_CG_BODY_TEMPLATE_SHEETS[style][variant]` and uses the expanded material palette for quantizing imports.
- **Looseleaf eyebrow pixels are now separate from the eye cluster** (`src/forge/CharacterGenerator/parts/body/looseleaf_male.js`), restored the full `Y/K/J` eye cluster so `eyeColor` affects both upper and lower eye pixels, and retagged the dark brow-line pixels above the front eyes as `Z`.
- **ASCII importer now applies safer Looseleaf semantic cleanup** (`src/forge/CharacterGenerator/CharacterGenerator.js`), after raw color quantizing, analyzed body sheets retag lower-body eye-like letters to underwear and infer brow candidates from dark `T/D` pixels across the rows above detected eye clusters, never from the eye cluster itself.
- **ASCII analyzer now has a material-paint editor** (`src/forge/CharacterGenerator/CharacterGenerator.js`), analyzer results include a zoomed pixel grid, A-Z material palette, full-sheet direction/frame selectors, and live regenerated ASCII/JS so imported sprites can be corrected by painting material letters directly onto pixels.
- **Eyebrow material now uses the picked eyebrow color directly** (`src/forge/CharacterGenerator/parts/body/human_base_shared.js`), remapped `Z` from a very dark derived brow shade to `brow.base`, making eyebrow pixels visibly follow `eyebrowColor` instead of resembling skin/outline colors.

### Theming system

Major theme expansion building on the token foundation shipped in 0.9.0.

#### Added

- **`File → Options...`** menu and OptionsManager modal (`src/OptionsManager.js`) for editor preferences. First section is Appearance (theme picker); future settings categories plug in here.
- **Multi-theme system** with 7 palettes × Dark/Light modes = 14 themes total. Each palette is a self-contained `:root[data-theme="<name>"]` block in `css/theme.css`:
  - **Default** (Gold), original gold-on-black; Light variant uses yellow `#ffe97a` interactive accents on neutral light gray
  - **Bubblegum**, vivid hot-pink (`#ff6fa8` dark / `#c2185b` light) cute palette on pink-tinted surfaces
  - **Ocean**, cool sky-blue (`#5dade2` dark / `#2e86c1` light) on blue-tinted surfaces
  - **Cascadia** - Pacific NW evergreen (`#51cf66` dark / `#2e7d32` light) on green-tinted surfaces
  - **Underworld**, blood-red crimson (`#e74c3c` dark / `#c62828` light) on red-tinted surfaces
  - **Orange Creamsicle**, bright tangerine (`#ff9f43` dark / `#d35400` light); Light variant uses warm cream-white with orange dropdowns matching the namesake
  - **Royalty**, royal purple primary (`#af7ac5` dark / `#8e44ad` light) with deliberate gold trim, borders/dividers stay gold even on purple, hitting the crown-jewel aesthetic
- **`.rr-dark-surface` utility class** (`css/theme.css`), drop-in CSS island that re-declares the dark-theme tokens for any element subtree. Applied to the main map editor canvas (`<div id="canvas-container">`) and the animation editor preview canvas so they stay dark/cinematic regardless of which light theme the user picks.
- **`--color-bg-toolbar` token**, dedicated value for the top menu bar, submenus, and modal header strips (was previously hardcoded `#111111`). Stays `#111` in dark themes, light grays in light themes, themable per palette.
- **Themed textarea resize handle** - `::-webkit-resizer` styled with a gold-on-dark-gold diagonal stripe on `.database-field-value` textareas. No more harsh white system square in the bottom-right corner.

#### Changed

- **Light theme palette refined**, surfaces are now neutral light grays (`#e0e0e0` page, `#ededed` panels, `#ffffff` content), with the brand accent color appearing only on interactive elements (inputs, dropdowns, buttons, hover/selected rows). Visual hierarchy reads gray-chrome → white-content → colored-accent.
- **Notes textareas** (database actor/weapon/armor/item/skill notes) - `resize: vertical` + `box-sizing: border-box; max-width: 100%` so they can't be stretched past the parent card. `white-space: pre; overflow-x: auto` on the note field specifically so plugin notetags stay aligned and scroll horizontally instead of wrapping. Description/profile fields keep normal word-wrap (narrative text).
- **Top menu bar / submenus / modal header strips** migrated from hardcoded `#111111` to `var(--color-bg-toolbar)`. Theme-switchable while staying near-black in dark mode.
- **Map Tree / Quick Access tabs** migrated initial inline styling from hardcoded `#1e1e1e`/`#252526` to theme tokens.
- **`select` element global rule** (`css/theme.css`) now uses `--color-bg-input` instead of `--color-bg-panel` semantically (a select IS an input). Side benefit: dropdowns now have more contrast against panels in dark mode (`#2d2d2d` vs `#111`).
- **Tool button `.active` state** got a stronger visual treatment in light themes (deeper accent fill + accent-deep border + inset shadow) so toggled toolbar buttons like Event Manager read unmistakably as "on". Dark mode behavior unchanged.
- **Theme picker UX**, switched from a flat radio list to Palette dropdown + Mode toggle. Picker stays compact regardless of how many palettes get added; new palettes only need a `THEME_PALETTES` registry entry in `src/OptionsManager.js`.

#### Fixed

- **SelectThemingShim popup couldn't open twice in succession** (`src/utils/SelectThemingShim.js`) - `closeOpenPopup()` removed the popup DOM but left document-level `closeOnOutside`/`escClose`/`scrollClose` listeners attached. After picking an option, the next mousedown event triggered the stale listener which then immediately closed the newly-opened popup. Fix: store the cleanup function on a module-level `openPopupCleanup` ref and call it from `closeOpenPopup()` so listeners always tear down whether the popup closes via option-click, outside-click, escape, or scroll.
- **Hue slider rainbow gradient disappeared in dark mode**, the new global `input[type="range"]` styling for the parameter-curve sliders overrode `.hue-slider` due to higher selector specificity (`input[type="range"]::-webkit-slider-runnable-track` = 0,1,2 vs `.hue-slider::-webkit-…` = 0,1,1). Re-scoped the hue slider rules under `input[type="range"].hue-slider` so they match specificity and source-order win, and explicitly styled `::-webkit-slider-runnable-track` and `::-moz-range-track` with the rainbow gradient.
- **Top menu bar / modal headers were darker** in dark mode after the inline `#111111` migration changed to `--color-bg-menubar` (`#2d2d30`). New `--color-bg-toolbar` token preserves the original `#111` in dark while still being themable for light themes.
- **Toolbar button active state** had no visual difference from hover in light mode (both used bg-deep white + dark border). Light themes now apply a deeper accent fill, accent-deep border, and inset shadow only under `:root[data-theme="<palette>-light"]` scope.
- **Various hardcoded color regressions in About dialog and Audio Player** - `color: #ccc` text was unreadable on light theme bg. Migrated all `color: #ccc;`, `color: #999;`, `color: #aaaaaa`, `color: #cccccc`, `background-color: #1e1e1e/#252526/#3c3c3c/#3e3e42/#2d2d30/#111111`, `border: 1px solid #555/#3e3e42/#2a2a2a` instances in `index.html` to theme tokens.

#### Notes

- **Pattern:** dark-theme defaults stay in the base `:root` block untouched. Every light-mode tweak (sidebar header strip, database section header gold, tool button active treatment, OS popup color-scheme) lives under `:root[data-theme="<palette>-light"]` multi-selectors. Adding a new light palette is: (a) copy a theme block in `theme.css`, (b) append palette to `THEME_PALETTES` registry in `OptionsManager.js`, (c) add the `<palette>-light` name to the four multi-selector lists. See the in-file comments for the canonical pattern.

### Forge - Animation Generator

Major expansion of the in-editor Animation Generator: per-layer keyframes, animated GIF + MP4 textures as input, animated GIF export, three new animations, and a sweep of texture-correctness bugs across the existing 3D shapes.

#### Added

- **Keyframe system per layer** (`src/forge/AnimationGenerator/AnimationGenerator.js`), every animation layer now keeps a `keyframes[]` array with per-frame snapshots of all slider/color/texture params, and `layer.params` is a live reference to the active keyframe. Linear interpolation runs over sliders and RGB colors between keyframes; the params object stays the same shape so existing animation renderers don't need changes. Add / remove / select via the layer panel; legacy single-params layers auto-migrate on load.
- **Smooth texture cross-fade between keyframes**, when two adjacent keyframes use different texture files, the renderer dual-renders the segment (once with the "from" texture, once with the "to" texture on an offscreen) and alpha-blends with `u` = segment progress. Pure linear cross-fade across the keyframe interval.
- **Per-keyframe layer opacity**, the layer-panel opacity slider now writes to the active keyframe instead of the layer as a whole, so opacity can animate alongside the rest of the params. Linear interpolation, same shape as slider params.
- **Layer duplication**, clone the active layer (including its keyframes) via the layer panel.
- **Animated GIF textures** (`src/forge/AnimationGenerator/helpers/texture.js`), texture picker now accepts `.gif` files. Loader parses via `gifuct-js`, composites every frame (handling disposal types 1/2/3) into per-frame canvases, and decorates each canvas with `complete`/`naturalWidth`/`naturalHeight` so existing animation renderers treat each frame as a regular image. `gifFrameAt(gif, tFrac)` picks the frame that should be visible at the current loop fraction; any animation that consumes `_textureImage` animates the texture automatically without per-animation changes.
- **Video textures (MP4/WebM/MOV/M4V/OGV/OGG)**, texture picker now accepts video files too. `_loadVideoTexture` seeks a hidden `<video>` frame-by-frame at 24 FPS (capped at 240 frames / 10 seconds) and captures each frame to its own canvas, returning the same shape as the GIF object. New `animatedFrameAt(tex, tFrac)` is a generic frame picker that handles either format. Decode is async, the cache holds the stub immediately so subsequent lookups don't re-trigger decode; preview/sheet redraw once frames are ready.
- **Save preview as animated GIF**, new "Save GIF" button in the footer renders every preview frame via `gif.js`, writes through an NW.js Save As dialog (defaults to `img/animations/`), and shows encoding progress on the button label. Background transparency preserved via chroma-keying: pixels with alpha < 128 stamp to magenta (`0xFE00FE`), and the encoder is told to mark that exact palette entry transparent.
- **Bullet animation** (`src/forge/AnimationGenerator/animations/Bullet.js`, category Object), proper 14-sided cylindrical body capped by an 8-ring ogive nose (`r(t) = R·√(1 − t²)`). Brass default color, full 3D rotation + texturing.
- **Portal animation** (`src/forge/AnimationGenerator/animations/Portal.js`, category Energy) - Stargate-style shimmering portal driven by an Almeros-style discrete wave-equation water simulation (`new = ((L+R+U+D)/2 − prev) · damping`). Pre-computed depth maps cached per `(gridSize, frameCount, rainCount, damping, rainSeed, dropSpread)`; `SETTLE_LOOPS = 3` convergence runs give a stable periodic state. `dropSpread = 0` drops every wave source at the centre so the surface reads as concentric rings instead of scattered raindrops. Per-pixel refraction uses `|strength|` so wave troughs brighten symmetrically to crests, no more black-pocket pin-pricks where the wave goes negative. Randomize keeps `cycX/Y/Z`, `pulse`, `gridSize`, `rainSeed`, `dropSpread`, `centerX/Y`, and `opacity` at their current values so each roll shows a different portal flavour without flipping orientation.
- **Effect animation category** (`src/forge/AnimationGenerator/registry.js`), new category added to `RR_CATEGORY_NAMES` alongside Geometric / Energy / Object.
- **Hypnotize animation** (`src/forge/AnimationGenerator/animations/Hypnotize.js`, category Effect), per-pixel Archimedean spiral `u = (r/R)·stripeCount − (θ/τ)·twist`. `twist` is consolidated from a separate arm-count + spirality pair into a single integer-step-2 parameter, the seam-safety constraint (twist must be even for the spiral to wrap cleanly at θ = ±π) is now enforced by the param schema so the user can't accidentally produce a mismatched stripe at the discontinuity.
- **Acid Trip animation** (`src/forge/AnimationGenerator/animations/AcidTrip.js`, category Effect) - N-fold mirror-symmetry kaleidoscope with three-harmonic sinusoidal noise for organic flow and HSL colour cycling for psychedelic palette. Integer cycle counts keep the loop seamless. `rotationSpeed` parameter lets the mandala spin.

#### Fixed

- **GIF texture animation didn't pick up keyframe frame index** (`_renderParamsFor`), when a texture param resolves to an animated GIF, the renderer now passes the current `frameIdx` to `gifFrameAt(tex, fIdx / frameCount)` so the GIF's playback timeline tracks the animation's loop fraction. Same path now handles video textures via `animatedFrameAt`.
- **Hypnotize cyan blob in the centre** (`Hypnotize.js`), local variables for the parsed RGB components of `color2` were named `r2`/`g2`/`b2`, shadowing the `r2 = dx² + dy²` squared-distance accumulator used later in the same loop. The shadow turned the spiral colour expression into garbage near the origin, producing a cyan splat. Renamed to `cr1/cg1/cb1` and `cr2/cg2/cb2`.
- **Bullet texture rendering** (`animations/Bullet.js`), three bugs at once. Side quad winding (`[a, b, c, d]`) and tip-fan winding (`[a, b, tip]`) were CW from outside, so backface culling kept the rear of the bullet and dropped the front. Side UVs were `[[0,0],[1,0],[1,1],[0,1]]` on every quad, every segment stretched the entire texture instead of a `1/SIDES` slice. Now `[a, d, c, b]` / `[a, tip, b]`, per-segment U around the cylinder, V along the full bullet length, and the base cap uses radial disc projection.
- **Backface-cull threshold conflated face area with angle** (`src/forge/AnimationGenerator/helpers/shape3D.js`), the cull compared the *unnormalised* cross-product `n_z` against `0.01`. Tiny faces (e.g. the bullet's tip-apex triangles, where `n_z ≈ 0.003` even when facing the camera dead-on) got culled even at proper outward orientation. Now normalises before comparison: `n_z / |n| <= 0.01` is a true ≈cos(89.4°) angular cutoff that ignores face size. Fixes the tip-cap rendering as a side effect.
- **Egg "inverted poles" texture bug** (`animations/Egg.js`), middle-band quad winding `[rs+nxt, rs+lon, rn+lon, rn+nxt]` was CW from outside, so the front half got culled and the rear half rendered (with the UVs reading in the reflected direction). The poles' caps wound correctly, so the eye saw "front-facing poles plus a mirrored body", the visual signature of "inverted poles". Flipped to `[rn+lon, rs+lon, rs+nxt, rn+nxt]`.
- **Egg horizontal texture mirroring** (`animations/Egg.js`), same issue as `Sphere.js`'s `u = 1 - i / meshLon` fix from 0.9.0: the CCW winding wraps U clockwise around the equator, so equirectangular textures (text especially) render reversed. Added `u(lon) = 1 - lon / LON` for all three face groups (top cap, middle, bottom cap).
- **Torus side-quad winding** (`animations/Torus.js`) - `[idx(i, j), idx(ni, j), idx(ni, nj), idx(i, nj)]` was CW from outside. Flipped to `[idx(i, j), idx(i, nj), idx(ni, nj), idx(ni, j)]` so the tube's outward normal points radially out and the camera-facing half stays visible.
- **Coin and Crown side-band winding + UVs** (`animations/Coin.js`, `animations/Crown.js`), both inherited the same CW-from-outside side-quad winding (`[i, SIDES+i, SIDES+n, n]`), and both stamped the full texture on every segment via `stripUV = [[0,0],[1,0],[1,1],[0,1]]`. Now `[i, n, SIDES+n, SIDES+i]` with per-segment `u0..u1 = i/SIDES..(i+1)/SIDES` so a texture wraps once around the rim. Cap UVs upgraded from a flat per-triangle slice to a proper radial disc projection so circular textures (a coin face, a crown gem) render as a disc instead of a tiled wedge fan.
- **Rock middle-ring triangle winding** (`animations/Rock.js`), the two triangles per quad (`[rs+nxt, rs+lon, rn+lon]` and `[rs+nxt, rn+lon, rn+nxt]`) shared the same CW-from-outside winding as the buggy Egg quad, so the rock's front faces were culled and the back rendered. Now fanned CCW from the lower-left vertex: `[rn+lon, rs+lon, rs+nxt]` / `[rn+lon, rs+nxt, rn+nxt]`. (Cap fans were already correct, same convention as the egg's caps.)

#### Notes

- **Animated texture object shape** is now uniform across GIF and video: `{ isGif|isVideo: true, ready: bool, frames: HTMLCanvasElement[], delays: ms[], totalDuration: ms, width, height }`. Frame canvases are decorated with `complete: true`, `naturalWidth`, `naturalHeight` so any animation that checks `tex.complete && tex.naturalWidth > 0` keeps working, the per-frame canvas *is* the texture image for that frame. Frame selection goes through `animatedFrameAt(tex, tFrac)`; the original `gifFrameAt` is preserved for callers that explicitly want the GIF path.
- **Texture-mapping convention for 3D shapes** is documented inline at the top of `helpers/shape3D.js`: face vertex order is CCW from outside; render3DShape builds `n = (vs[1] - vs[0]) × (vs[2] - vs[0])`, normalises, and backface-culls anything with `n_z / |n| <= 0.01`. New shapes should match this. Verified-clean shapes from the audit pass: Cube, Pyramid, Cone, Saw Blade, Dodecahedron (auto-oriented at build time), Mobius / Double Helix / Scythe (`doubleSided: true`, cull bypassed), Sword / Knife / Hammer / Arrow (all composed from the verified `makeBox` / `makeTaperedPrism` / `makeOctahedron` helpers).

## [0.9.0] - 2026-05-31

Editor polish + completion of the PIXI v5→v8 migration. Theme tokens shipped across the entire UI; new Parameter Curve and Terms.Messages editors; actor equipment dynamically filtered by class traits; map editor parallax bleed eliminated via canvas crop; v8 migration functionally complete (Tilemap, UltraMode7, Effekseer, video, cursors).

### Added

- **Theme token system** (`css/theme.css`), single source of truth for colors, spacing, radii, fonts. Every editor and `src/**/*.js` migrated to `var(--token)` references; ~5500 token usages across the codebase. Foundation for future theme switching.
- **`src/utils/ThemeColors.js`** - `ThemeColors.resolve(name, fallback)` helper for canvas 2D contexts (which can't parse `var(--…)`). Used by class parameter curves, animation editor placeholders, icon-picker highlight, troop selection highlight, transfer-player map thumbnails.
- **`src/utils/SelectThemingShim.js`**, global custom-dropdown shim. Wraps every native `<select>` with a div-based gold-themed popup to defeat KDE Plasma's pale-blue option highlight. `MutationObserver` catches dynamically-added selects. Opt-out via `data-no-shim="1"`.
- **Range slider theme rules** (`css/theme.css`), dark track + gold-accent thumb across `-webkit-` and `-moz-` variants. Applied globally to `input[type="range"]`.
- **Parameter Curve editor** (`src/database/DatabaseClassEditor.js`), click any of the 8 parameter mini-curves in the class editor → modal with Lv1/Lv99 sliders + curve shape exponent (0.30 fast → 3.00 slow) + live preview canvas + reverse-fit so slider opens at the existing curve's shape. Apply writes to `classEntry.params[paramIdx]` and refreshes both the mini-curve and the Lv1→Lv99 readout.
- **Terms → Messages editor** (`src/DatabaseEditorUI.js`), fourth Terms category covering all 53 MZ message strings (Options menu, Audio Volume, Save/Load, Battle Flow, Battle Damage, Battle Effects), each with a per-field placeholder hint explaining what each `%N` becomes in plain English (e.g. Actor Damage shows `%1 = actor name, %2 = damage amount`).
- **Animation editor polish** (`src/database/DatabaseAnimationEditor.js`), frame multi-select + clipboard + Delete; SE & Flash Timings selection/clipboard with max-height; custom gold dropdowns for Position/Background/Target; hue slider with real-time sprite-sheet preview; cell properties modal restyle; Display Type dropdown with correct MZ semantics.
- **Database editor polish** - Types and Terms editor complete redesign (`src/DatabaseEditorUI.js`); Items general section tight grid layout (`src/database/DatabaseItemEditor.js`); System2 Game ID editable; "No effects/No traits" rows now align with table headers in Items, Skills, Weapons, Armor, Enemies, States.
- **Actor equipment slot filtering** (`src/database/DatabaseActorEditor.js`), equipment slots and dropdown options now derived from `TRAIT_EQUIP_WTYPE` (51), `TRAIT_EQUIP_ATYPE` (52), and `TRAIT_EQUIP_SEAL` (54) on the actor + class union. Unnamed `equipTypes` slots are hidden; stale equipped items surface as `(incompatible)`; section header shows the source class.
- **Chip-style button utility classes** (`css/theme.css`) - `.rr-btn-chip` (black with gray text, gold hover) and `.rr-btn-chip-danger` (red hover) for the safe-vs-destructive convention used across the app.

### Fixed

- **Effekseer animation 3D rotation sphere not rendering** (`src/database/DatabaseAnimationEditor.js`) - Canvas 2D's `fillStyle`/`strokeStyle`/`addColorStop` silently reject `var(--token)` strings. The bulk theme migration had replaced hex literals with `var(--…)` even inside canvas calls. Sphere now resolves tokens via `ThemeColors.resolve(...)`. Same bug fixed in 7 other files (animation preview placeholders, class graph fill+stroke, troop+icon-picker highlight, transfer-player map thumbnails, event command list face placeholder).
- **Class editor parameter curves only rendering 3 of 8** (`src/database/DatabaseClassEditor.js`) - Defense's entry in `paramColors` used `'var(--color-accent-bright)'`. `gradient.addColorStop(0, color + '80')` threw `SYNTAX_ERR`, the `forEach` aborted, and curves 4-7 never drew. Replaced with hex literal; all 8 curves render.
- **Map editor parallax bleed around small maps** (`src/TilemapManager.js`), when the map was smaller than `#canvas-container` on either axis, the parallax sprite filled the leftover area. New `applyViewportCrop()` resizes the PIXI renderer to `min(containerSize, mapScaledSize)` after every scale change (load, wheel zoom, resize). Scale floor stays at contain-fit so zoom-out still reaches whole-map view.
- **Map editor zoom didn't reset on map switch** (`src/TilemapManager.js`), loading a new map created a fresh container at scale 1.0 but no fit-to-viewport logic kicked in, leaving small maps with empty space around them. Added `applyMinScaleClamp()` to `loadMap` (and reused by the resize handler).
- **MOG_TreasurePopup pickup icons invisible on PIXI v8** (`template/Complex/js/libs/pixi_compat.js`), plugin uses `this._cx/_sx/_cy/_sy` as screen-coordinate instance data, colliding with v8's internal cos/sin transform cache. Override of `Container.prototype.updateLocalTransform` computes cos/sin fresh from rotation+skew per call instead of reading the cache fields. Same root cause as the `_position` MOG_BattleCursor bug.
- **`Function.name` was "wrapped" for every MZ class** (`template/Complex/js/libs/pixi_compat.js`) - `MZGlobalUpgrade`'s wrapper function was named `wrapped`, and the property-copy loop explicitly skipped `name`. Plugins doing `instance.constructor.name === "Scene_Map"` got false. Now `Object.defineProperty(wrapped, "name", {value: orig.name, configurable: true})` after the `__origName` tag.
- **"Will be implemented" alert for 11 no-args event commands** (`src/event/EventCommandList.js`) - `editCommand`'s fall-through case fired for Exit Event, Get on/off Vehicle, Erase Event, Gather Followers, Save BGM, Replay BGM, Abort Battle, Open Menu Screen, Open Save Screen, Game Over, Return to Title Screen. New `NO_PARAM_EVENT_CODES` set short-circuits with a silent return, these commands have no editable parameters.
- **MZ animation additive blending rendered as normal blend** (`reactor_core.js`), see "PIXI v8 visual-fidelity fixes" section below.

### PIXI v8 visual-fidelity fixes (2026-05-30 session 5)

Three v8 regressions uncovered during gameplay testing, all with different root causes:

#### Fixed

- **RaveLighting hole-punching with positive (white) tint** (`PSYCHRONIC_RaveLighting.js`): when tint is full-white (no darkening), lights would cut light-shaped windows in the wall of white, exposing the scene through them. Logically wrong: hole-punching only makes sense as a darkness-piercing effect. Now gated on `hasNegativeChannel || hasGrayDarkening`, overlay still draws for positive tints (color tint visible) but the `destination-out` punch-out is skipped. Lights still brighten via their own ADD-blend sprites.
- **MZ animation additive blending rendered as normal blend** (`reactor_core.js` Sprite.blendMode setter): MZ data files (animations, plugins) store v5-style numeric blend modes (0=normal, 1=add, 2=multiply, 3=screen). v8 expects strings ('add', 'multiply', 'screen', 'normal'). Our setter forwarded numbers directly to v8's blendMode setter, which silently falls back to normal blending, killing the additive-glow look (visually reads as "no transparency" because additive blends naturally fade-edge into the scene whereas normal blends look solid). Added a `_MZ_BLEND_NUM_TO_STR` mapping in the setter so numbers are converted to strings before forwarding.
- **Window backgrounds rendering near-transparent** (`reactor_core.js` `_createBackSprite`): earlier migration changed `_backSprite` from `new Sprite()` to `new PIXI.Container()` to dodge v8's "Sprite can't have children" deprecation. But Container has no texture rendering of its own, so the windowskin's solid 95×95 corner-piece background was invisible, leaving only the (mostly transparent) TilingSprite tile pattern showing. Reverted to `new Sprite()` now that the pixi_compat `Sprite.allowChildren=true` shim makes Sprite-as-parent render its children correctly.
- **Windows didn't clip overflowing content (KEY FIX)** (`reactor_core.js` Window/Tilemap/TilingSprite `updateTransform`): the actual root cause was a **silent throw**. v8 repurposed `PIXI.Container.prototype.updateTransform` from a per-frame transform-cascade method into a property-setter that takes an `opts` object, and reads `opts.x` etc. unconditionally, so calling it with no args throws `TypeError: Cannot read properties of undefined (reading 'x')`. MZ corescript's `Window.prototype.updateTransform` does `PIXI.Container.prototype.updateTransform.call(this)` near the end, RIGHT BEFORE `this._updateFilterArea()`. On v8 the super call throws, the throw bubbles up through the onRender wrapper's try/catch, and `_updateFilterArea` is never reached, meaning the window's filterArea is never sized to the visible client rect, and no clipping happens. Fix: skip the super updateTransform on v8 (v8's render pipeline computes worldTransform automatically). Same pattern fixed in `Tilemap.prototype.updateTransform` and `TilingSprite.prototype.updateTransform`.

#### Note

The window-clipping bug is the worst kind: v8 silently changed the SEMANTICS of a method that still exists on the prototype. Stack traces don't surface it because our `onRender` bridge catches the throw. The fix took several wrong turns (filterArea coord-space, boundsArea, Sprite/Graphics mask experiments) before diagnostic logging proved that `_updateFilterArea` was never running.

### PIXI v8 runtime compatibility (2026-05-30 session 4)

Deprecation cleanup + several v8 robustness issues uncovered through gameplay testing.

#### Fixed, deprecation warnings (real fixes, not suppression)

- **`PIXI.SCALE_MODES` / `PIXI.WRAP_MODES` / `PIXI.DRAW_MODES` deprecation spam**, v8 ships these as `Proxy` objects that log on every read (and the message text is itself buggy: v8's SCALE_MODES proxy says "DRAW_MODES.X is deprecated"). Shim now force-overrides them with plain objects holding the same string values on v8. Not just suppression, when v9 removes the proxies, our shim continues providing the constants so corescript and plugins keep working.
- **`Graphics#beginFill` / `Graphics#drawRect` deprecation in `ScreenSprite.setColor`** (reactor_core.js:3796) - Switched to v8's chained `graphics.rect(...).fill({color, alpha})` API with polymorphic fallback to the v5/v6/v7 imperative form.
- **`renderer.render(stage, renderTexture)` second-arg deprecation in `Bitmap.snap`** (reactor_core.js:1457) - Switched to v8's `renderer.render({container, target})` options-object with polymorphic fallback.
- **`WindowLayer.render` throwing `renderer.framebuffer.forceStencil is not a function`** (reactor_core.js:4636), v8 removed `forceStencil` (stencil buffer is always allocated now via `stencil: true` in ContextSystem init) and removed the global `renderer.batch` flushable batcher (replaced by per-render-pipe deferred batchers). Raw GL stencil ops interleaved with v8's deferred pipeline don't honor draw order. On v8 the method now short-circuits and lets v8's render pipe iterate children naturally; the only thing lost is window-occlusion stenciling (lower-window pixels under a higher window get drawn but are immediately overdrawn, no visible regression for normal MZ usage). v5/v6/v7 keep the stock stencil-occlusion behavior.

#### Added - `template/*/js/libs/pixi_compat.js`

- **`PIXI.Sprite.prototype.destroy` idempotency patch**, v8 Sprite.destroy has a bug: `super.destroy(options)` short-circuits on already-destroyed but the code BELOW super still runs `this._texture.destroy(...)`, which throws because `_texture` was nulled on the first destroy. This crashes cascading destroys whenever a sprite was already destroyed by a plugin (e.g. `PSYCHRONIC_GifAnimationMZ.stopGifAnimation`) but somehow remained in a parent's children array. Shim early-returns if `this.destroyed` is true.
- **`PIXI.VideoSource.prototype.isValid` null-safe patch**, v8 VideoSource.load() has a race: `const source = this.resource; ...; this.alphaMode = await detectVideoAlphaMode(); this._load = new Promise((r) => { if (this.isValid) ... })`. If `Scene_Map.terminate -> VideoOverlayManager.clearAll` destroys the source during the await, `this.resource` is null when isValid resumes, and `this.resource.videoWidth` throws an uncaught Promise rejection that the MZ SceneManager surfaces as fatal. Shim makes isValid return false when resource is null.
- **`SpritePipe.{addRenderable, updateRenderable, validateRenderable}` destroyed-sprite guards**, when a destroyed Sprite (`_gpuData == null`) is still referenced by some parent's children array, v8 crashes at `_getGpuSprite` reading `null[uid]`. Shim catches and skips, logging once per offending class with parent-chain trace ("class=Sprite, parents=Tilemap < Container < Spriteset_Map < Scene_Map").
- **`Container._getGlobalBoundsRecursive` destroyed-display guard**, same pattern hit via FilterSystem._calculateFilterArea → getFastGlobalBounds, where it reads `this.effects.length` on a destroyed container (effects is null after destroy). Shim returns early.
- **`MZGlobalUpgrade` now tags wrapped classes with `__origName`** so the destroyed-sprite warnings can identify which MZ class an instance came from (instead of every wrapped instance showing as `wrapped` in `constructor.name`).

#### Fixed - `UltraMode7V8Compat` composite Sprite cascade-destroy

- **Mode7 → Mode7 scene transition left the new map without its tileset layer.** When the previous Spriteset_Map's tilemap is destroyed (with `{children: true}` cascading), our UM7V8 composite Sprite (living as `tilemap.children[0]`) is destroyed too. The lazy init only ran once per session, so on the new tilemap `ensureCompositeSprite` re-attached the already-destroyed Sprite instead of creating a new one, leading to no Mode7 ground rendering and per-frame destroyed-sprite warnings. Shim now detects `compositeSprite.destroyed` / `pixiTexture.destroyed` and re-creates both.

### PIXI v8 runtime compatibility (2026-05-30 session 3)

Fixed `PSYCHRONIC_VideoOverlay` and `PSYCHRONIC_VideoParallaxMZ` not playing video on v8. Both plugins use `PIXI.Texture.from(htmlVideoElement)` and apply post-construction property writes (`.scaleMode`, `.mipmap`, `.autoUpdate`, `.wrapMode`) on `.baseTexture`, the read-only proxy from session 1 silently dropped those writes, and v8's Sprite never re-evaluated `width`/`height` when the video metadata arrived (texture orig 1×1 → 1280×720).

#### Added - `template/*/js/libs/pixi_compat.js`

- **`PIXI.MIPMAP_MODES` shim**, maps v5 numeric enum to v8 boolean (`OFF: false`, `POW2/ON/ON_MANUAL: true`). Pairs with the new mipmap setter on the baseTexture proxy so legacy `videoTexture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF` actually disables `source.autoGenerateMipmaps`.
- **Setters on the `baseTexture` proxy**, added `set scaleMode`, `set mipmap` (→ `autoGenerateMipmaps`), `get/set wrapMode`, `get/set autoUpdate` that forward to the underlying v8 `TextureSource`. Previously the proxy was read-only, so plugin lines like `videoTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST` and `videoTexture.baseTexture.autoUpdate = false` landed on a disposable object and were lost, the underlying VideoSource kept defaults.
- **`PIXI.Texture.from(HTMLVideoElement)` override**, intercepts HTMLVideoElement specifically and constructs `VideoSource` explicitly with `autoLoad: true, autoPlay: false, updateFPS: 0`, then wraps in `new Texture({source: videoSource, dynamic: true})`. Two reasons:
  - **`autoPlay: false`**, prevents VideoSource from racing the plugin's own `video.play()` call (default `autoPlay: true` produced "play() interrupted by load()" patterns).
  - **`dynamic: true`**, without this flag, v8's Sprite `set texture` does NOT attach an `"update"` listener on the texture, so the sprite never reacts to texture changes (including the eventual video resize). Set explicitly because `Texture.from`'s default path leaves `dynamic: false`.
- **Sprite dynamic-texture resize re-apply (KEY FIX)**, wraps `Sprite.prototype.set texture` to attach a per-sprite `"update"` listener that re-runs `_setWidth(_width, texture.orig.width)` / `_setHeight(_height, texture.orig.height)` whenever the underlying source resizes.
  - v8 Sprite's stock texture setter re-applies `_width`/`_height` ONCE at assignment time. When the texture object stays the same but its `orig.width` later changes (VideoSource learning `videoWidth`/`videoHeight` from metadata), the stock setter does nothing, only invalidates bounds.
  - Plugins that do `const sprite = new Sprite(videoTexture); sprite.width = Graphics.width;` bake `scale.x = 816/1 = 816` while the video texture is still 1×1. When VideoSource later resizes to 1280×720, the sprite renders at `816 × 1280 = ~1,000,000` px wide, essentially invisible (one corner pixel fills the screen, looks like a solid black/blank fill).
  - Shim attaches a tracked listener only on `dynamic: true` textures, so static image sprites pay nothing. Listener detaches cleanly when the texture is replaced.

### Fixed

- **`PSYCHRONIC_VideoOverlay` videos invisible on v8**, video element loads and plays correctly, but sprite scale was baked to 1×1 texture causing the rendered video to extend far off-screen. Sprite re-apply patch + dynamic texture flag resolves it.
- **`PSYCHRONIC_VideoParallaxMZ` videos invisible on v8**, same root cause.

### PIXI v8 runtime compatibility (2026-05-30 session 2)

Continued v8 work after the Effekseer + cursor fixes earlier in the day: fixed UltraMode7 perspective rendering, fixed tile-edge seams on regular maps.

#### Added - `template/*/js/libs/pixi_compat.js`

- **`UltraMode7V8Compat` module (~330 lines)**, full v8 compat for UltraMode7's Mode7 perspective tilemap rendering. v8 removed the renderer-plugin system that UM7 depended on; this module sidesteps that by mirroring the Effekseer overlay pattern (offscreen `<canvas>` with its own WebGL1 context):
  - Lazy-initializes when first Mode7 layer renders. Creates a hidden offscreen canvas matching game canvas size, gets `webgl` context with `{premultipliedAlpha: false, alpha: true}`.
  - Compiles UM7's vertex + fragment shaders (`Tilemap.ULTRA_MODE_7_VERTEX_SHADER` + `UltraMode7.generateFragmentShader(...)`) against that context. Prepends `precision mediump float; precision mediump int;` to satisfy WebGL1's mandatory precision declaration (PIXI used to auto-prefix).
  - Creates 4 × 2048×2048 GL atlas textures with `LINEAR` filtering (matches UM7's `TILEMAP_PIXELATED=false` default). Tile-edge bleed prevented by UM7's fragment shader `clamp` against `vFrame`.
  - Enables `OES_element_index_uint` extension. Required because Mode7 maps with `LOOP_MAPS_EXTEND_TILES` commonly have 40k+ tiles (160k+ vertices), without 32-bit indices, indices wrap at 65535 and `drawElements` renders garbage.
  - Replicates UM7's per-segment vertex/index buffer pipeline; raw GL `bufferData` / `vertexAttribPointer` / `drawElements`.
  - Hooks `Tilemap.Layer.prototype.render` after UM7 installs its own override: when `UltraMode7.isActive()` is true, queues the layer for offscreen rendering. Otherwise falls through to base render (the per-tile-Sprite path).
  - Patches `Tilemap.Layer.prototype.initialize` to install per-instance `onRender` callbacks. `MZGlobalUpgrade`'s window-scan misses `Tilemap.Layer` because it's a sub-property of `Tilemap`, without an `onRender`, v8 never calls `render()` on Layer instances per-frame and our hook never fires.
  - `findTilemap(layer)` walks up the parent chain to find the actual `Tilemap` (skipping intermediate `Tilemap.CombinedLayer` etc.) so the composite Sprite attaches to the right level, adding to an intermediate container caused parent-transform distortion.
  - Composite Sprite (wrapping the offscreen canvas) added as `tilemap.children[0]`. Set to `scale.y = -1, position.y = canvas.height` to flip the WebGL1-bottom-left-origin perspective right-side-up.
  - Per-frame flush clears the offscreen canvas to transparent, drains the layer queue, calls `pixiTexture.source.update()` to invalidate v8's GPU upload cache.
  - Debug surface at `window.__UM7V8` (getCanvas, getGL, getAtlases, getPendingLayers, getCompositeSprite, snapshot, isInitialized) for diagnostic work.

#### Changed - `template/*/js/reactor_core.js`

- **`Tilemap.Layer._addV8Tile` tile source `scaleMode: "nearest"`**, previously defaulted to LINEAR, causing visible vertical seam artifacts between adjacent tiles on certain tilesets (sub-texel interpolation across tileset image boundaries pulled in adjacent tile pixels). Original MZ `Tilemap.Renderer._createInternalTextures` hardcoded NEAREST for the same reason.

### Fixed

- **UltraMode7 perspective tilemap not rendering on v8**, fully resolved via `UltraMode7V8Compat`. Mode7 maps now render correctly with proper perspective, characters layer on top, atlas textures sample correctly, no distortion.
- **Visible vertical seams between tiles on regular (non-Mode7) maps**, caused by LINEAR sampling on tile textures. Switched to NEAREST.

### PIXI v8 runtime compatibility (2026-05-30 session)

Continued v7→v8 migration: fixed Effekseer animations not rendering in battle, and fixed MOG_BattleCursor not displaying. Both came down to v8 internals that legacy code paths quietly corrupted in ways that produced no errors but no pixels either.

#### Added - `template/*/js/libs/pixi_compat.js`

- **`PIXI.Container.prototype._position` accessor (KEY FIX)**, v8 stores its internal position `ObservablePoint` in `this._position` (pixi.js line 7129). Some MZ plugins (notably MOG_BattleCursor's `BattleCursorSprite` constructor: `this._position = {}; this._position.x = 0; ...`) use `_position` as a custom data-struct field name, REPLACING v8's observable with a plain object. After that, `sprite.x = N` writes to a plain field instead of the ObservablePoint, so v8's transform-dirty notification never fires and the sprite's `localTransform` stays `NaN`. v8's renderer culls anything with NaN transforms, so the entire subtree silently disappears.
  - Shim installs an accessor on `Container.prototype._position`. The setter captures the `ObservablePoint` when v8's ctor assigns one (stashed as `__pixiPositionObservable`). When a plain object is later assigned, x/y values are copied into the saved observable and `_onUpdate` is triggered. Subsequent reads return the observable. Plugin-side `this._position.xOffset = 5` etc. still works, extra keys are added as own properties on the observable.
  - Backwards-compatible with any plugin using the same `_position` clobber pattern, not just MOG_BattleCursor. **No plugin file edits required.**
- **`PIXI.Sprite.prototype.allowChildren` getter**, always returns `true`, swallows the constructor's `this.allowChildren = false` assignment. Suppresses v8's "addChild on a Sprite" deprecation warning spam. (v8 still iterates Sprite children in `collectRenderablesSimple` regardless of `allowChildren`, so this is purely a warning fix.)

#### Changed - `template/*/js/reactor_core.js` (Effekseer overlay canvas)

- **Dedicated Effekseer overlay canvas with its own WebGL1 context.** Effekseer's `drawHandle` was silently producing zero pixels on v8's WebGL2 context, verified empirically via full-canvas `gl.readPixels` diff (zero pixels changed across 921600 samples) with no GL errors. The proven-good editor pattern (`src/event/AnimationPicker.js`) creates a fresh canvas with `getContext('webgl', { premultipliedAlpha: false, alpha: true/false })` and inits Effekseer against THAT context.
  - `Graphics._createCanvas` now creates an `effekseerOverlay` `<canvas>` alongside `gameCanvas`. Transparent, `pointer-events: none`, z-index 2 (above game canvas at z-index 1).
  - `Graphics._updateCanvas` keeps both canvases sized and centered identically via `_centerElement`.
  - `Graphics._createEffekseerContext` obtains a WebGL1 context on the overlay (`premultipliedAlpha: false, alpha: true`) and inits Effekseer against it. `setRestorationOfStatesFlag(false)` - Effekseer owns the overlay context, no state to restore.
  - The browser compositor naturally layers the overlay over the game canvas. No PIXI integration needed.

#### Changed - `template/*/js/reactor_sprites.js` (Sprite_Animation positioning)

- **`Sprite_Animation.setProjectionMatrix`** rewritten to use AnimationPicker's recipe (`p = -1.2`) instead of MZ's `p = -(viewportSize / canvas.height) = -5.69`. The MZ original combined a 4096×4096 offset viewport with the steep perspective to position effects on screen, that approach silently produced zero pixels through Effekseer's WebGL1 wrapper on the overlay context.
- **`Sprite_Animation.setViewport` / `resetViewport`** use the full canvas viewport now (instead of a 4096×4096 viewport offset by target position).
- **`Sprite_Animation.updateEffectGeometry`** positions effects via `handle.setLocation(wx, wy, 0)` using a canvas-pixel-to-world conversion (`wFactor = 13` = `1 - 10 × p`). Mirror flag flips `wx` sign.
- **`Sprite_Animation` 180° x-axis flip** - `rx = (180 - rotation.x) * π/180` compensates for the projection's y-flip (matches AnimationPicker). Without it, particles designed to fly "up" appeared to fly "down" on screen.
- **`Sprite_Animation.targetSpritePosition`** anchors unconditionally to sprite ORIGIN (`point.y = 0`) instead of center (`-h/2`). MZ vanilla center-anchor put effects approximately `h/2` pixels too high through the AnimationPicker projection.
- **`Sprite_Animation.renderActive`** clears the Effekseer overlay canvas EVERY frame (transparent black) regardless of whether animations are queued. Otherwise leftover Effekseer pixels persist between animations and block view of game-canvas content underneath (e.g., MOG_BattleCursor).

### Fixed

- **Effekseer battle animations not rendering**, fully resolved via the overlay canvas + AnimationPicker recipe described above. Animations now appear at the target battler, fire in the correct direction, and don't bleed into UI between plays.
- **MOG_BattleCursor target arrow + battler name not displaying**, root cause was the `_position` clobber documented above. Cursors are now visible during target selection.
- **Massive console log spam from PSYCHRONIC_* plugins**, silenced per-action repeaters (~109 lines across `PSYCHRONIC_BattleEngineMZ.js`, `PSYCHRONIC_MegaOptionsMZ.js`, `PSYCHRONIC_CoreCustomizerMZ.js`, `PSYCHRONIC_MegaEquipMZ.js`, `PSYCHRONIC_SubclassMZ.js`, `PSYCHRONIC_MenuManagerMZ.js`, `PSYCHRONIC_EventCustomizerMZ.js`). All silenced lines marked with `// [silenced]` prefix for easy restoration. Per-action logs that remain useful for debugging (`🎬 UnifiedAnimationHandler`, `✅ Playing animation`, `🎯 execute: Invoking action.`) were preserved.

### PIXI v8 runtime compatibility (2026-05-25 session)

Follow-up runtime work on the v7→v8 migration: with the bundle and corescript already converted, the focus was making actual gameplay (battles, menus, lighting plugin, in-game scenes) render correctly against v8.

#### Added - `template/*/js/libs/pixi_compat.js`

- **`baseTexture` getter on `PIXI.Texture.prototype`**, force-overrides v8's deprecation getter (which returned the v8 `TextureSource` directly, making `texture.baseTexture.resource.source` resolve to `undefined`). Returns a v5/v6/v7-shaped shim with `.resource.source` pointing at the raw canvas/image.
- **`valid` getter on `PIXI.Texture.prototype`**, v8 removed `Texture.valid`. Plugins like `PSYCHRONIC_RaveLighting` use it as the "did my texture build correctly?" gate; without it every legitimate texture was silently swapped for `PIXI.Texture.WHITE`.
- **Container `name` deprecation accessor deletion**, v8's `set name(value)` on `Container.prototype` was intercepting MZ corescript prototype assignments (`Sprite_Name.prototype.name = function() {...}`) and rerouting them into `label`, silently losing the method. Deleted the accessor before corescript loads.
- **`PIXI.Buffer` constructor wrapper**, v8 switched from positional `(data, isStatic, isIndex)` to `{data, size, usage, ...}` options object. UltraMode7's `Tilemap.Layer._createVao` calls `new PIXI.Buffer(null, true, true)` and crashed on `destructure of null`. Wrapper detects legacy positional signature and converts to v8 options with `BufferUsage.INDEX|VERTEX|COPY_DST|STATIC` flags.
- **`PIXI.Geometry.addIndex/addAttribute` chain wrappers**, v8 dropped `return this` from both methods, breaking the `geometry.addIndex(idx).addAttribute(...).addAttribute(...)` chain pattern. Wrappers restore chaining. `addAttribute` also accepts the v5/v6/v7 8-positional form `(name, buffer, size, normalized, type, stride, start, instance)` and converts to v8's options object with size+type → format-string mapping (e.g. `FLOAT × 4 → "float32x4"`).
- **`window.installLegacyRendererStubs(renderer)`**, augments v8's `WebGLRenderer` instance (called from `reactor_core.js` after `await app.init()`) with the legacy `renderer.batch / .geometry / .state / .shader / .framebuffer / .projection / .view` subsystems as no-op stubs. `batch.flush()` is the exception, it bridges to v8's `renderTarget.finishRenderPass()` so pending v8 batches are committed before plugins like Sprite_Animation start raw GL drawing.
- **MZGlobalUpgrade label-shadow delete**, after `Reflect.construct(pixiBase, [], wrapped)`, walks the v8 instance's own keys and deletes any whose name corresponds to a prototype method on the MZ subclass. v8's `Sprite` ctor hardcodes `this.label = "Sprite"` as an own data property, which was shadowing `Sprite_Gauge.prototype.label()` and breaking battle status windows with `this.label is not a function`.
- **MZGlobalUpgrade onRender bridge**, for any wrapped MZ class whose prototype defines its own `_render` or `render` (and the latter differs from the PIXI base), installs a per-instance `onRender(renderer)` callback that v8 invokes per-frame. Bridges the legacy v5/v6/v7 dispatch pattern to v8's render pipe. Errors are logged once-per-class instead of silently swallowed.
- **Advanced blend mode registration**, registered `multiply`, `screen`, and `overlay` via `PIXI.BlendModeFilter` + `PIXI.extensions.add` so MZ plugins that set `sprite.blendMode = PIXI.BLEND_MODES.MULTIPLY` don't silently fall through to `'normal'`. Uses the official PIXI v8 advanced-blend-modes formulas. (Eventually deprecated in favor of the alpha-composited tone overlay, see below.)

#### Added - `template/*/js/reactor_core.js`

- **Post-`_app.render()` Effekseer flush hook**, calls `Sprite_Animation.renderActive(renderer)` right after `_app.render()` returns, so legacy Effekseer draws happen on top of v8's already-rendered scene instead of being clobbered by v8's batched output.

#### Added - `template/*/js/reactor_sprites.js`

- **`Sprite_Animation._pendingRenders` queue**, on v8, `_render` queues the instance instead of drawing inline. `Sprite_Animation.renderActive(renderer)` drains the queue after v8 finishes its render pass.

### Fixed

- **`PSYCHRONIC_RaveLighting` lighting plugin**, completely reworked for v8:
  - Tone overlay switched from `MULTIPLY` blend (incompatible with v8's advanced blend mode filter chain inside the spriteset's color filter) to plain alpha-composited overlay. Tint color and alpha are now derived directly from `$gameScreen.tone()` magnitude: `[0,0,0,0]` → transparent, `[-255,-255,-255,0]` → opaque black, `[255,0,0,0]` → opaque red, etc.
  - `updateBaseFilters` now zeroes the spriteset's `_baseColorFilter` (`setColorTone([0,0,0,0])`) on every frame so the spriteset filter doesn't double-tint on top of the new overlay.
  - Texture-cache self-heal: `_isCachedTextureAlive(texture)` validates the cached radial/beam/flashlight texture's source is still a real `HTMLCanvasElement` before reusing it. After v8 destroys a `TextureSource`, its `.resource` becomes `null` and `drawImage` throws, the cache now silently rebuilds stale entries on next access.
  - `Spriteset_Map.destroy` clears `PsychronicRaveLighting.textureCache` so cross-scene destroys don't leak stale Texture references into the next map.
- **Battle scene crash** - `this.name is not a function` in `Sprite_Name.updateBitmap` and the follow-up `this.label is not a function` in `Sprite_Gauge.drawLabel`. Two distinct v8 prototype-pollution bugs (setter interception during prototype definition vs. instance own-property shadowing), see the two corresponding compat-layer items above.
- **UltraMode7 scene crash on map load** - `Cannot destructure property 'data' of 'options' as it is null` in `new Buffer(null, true, true)`, then `Cannot read properties of undefined (reading 'addAttribute')` from the broken `addIndex().addAttribute()` chain. Both fixed by the new PIXI.Buffer and PIXI.Geometry compat wrappers.
- **`Sprite_Name` `this.name is not a function`** in load-game menus, v8's `Container.prototype.name` setter was intercepting `Sprite_Name.prototype.name = function() {...}` and routing the function into `label` instead.
- **Window-layer GL state corruption**, removing the early `framebuffer.forceStencil` stub lets `WindowLayer.render` naturally throw early (caught by the onRender bridge) before its raw GL stencil-test calls corrupt v8's batched state. Window backgrounds, ATB bars, and other layered windows render correctly again.
- **`Texture.baseTexture.resource.source` returning `undefined`** in `RaveLighting`'s flashlight/beam draw paths, fixed by the new force-override `baseTexture` getter.

### Known issues

- **Parallax tile-edge fringing in some intro scenes**, separate UV/scaleMode issue.

## [0.8.0] - 2026-05-24

### Added
- **Multi-instance workflow**: The Linux launcher now starts each RPG Reactor window with its own NW.js user-data profile, allowing multiple projects to be open at the same time while a per-project `.rpgreactor.lock` prevents opening the same project twice.
- **Cross-instance clipboard**: Added shared typed clipboard support for events, event pages, event command selections, maps, and plugin JSON/settings so copy/paste works across RPG Reactor windows.
- **Map copy/paste**: Map context menu now supports Copy Map and Paste Map, creating a new `Map###.json`, updating `MapInfos.json`, and importing the source tileset database entry when possible.
- **Map deletion**: Map tree and quick-access selections can now be deleted from the context menu or Delete key, including child-map handling, `Map###.json` removal, `MapInfos.json` updates, current-map fallback loading, and protection against deleting the final remaining map.
- **Save Map As Image**: Map context menu can export a full-size PNG render of a map, including tiles, parallax, shadows, and A1 autotile overlap handling while omitting editor-only event marker boxes.
- **Map audio preview controls**: Map Properties autoplay BGM/BGS sections now include Play, Pause, Stop, and status controls powered by the shared AudioPlayer backend, honoring volume, pitch, pan, and loop settings.
- **Actor sheet cell selection**: Actor Character Sprite and Face Graphic pickers now use clickable highlighted sheet cells instead of prompting for numeric indexes.
- **Tileset database copy/paste**: Tilesets now support Ctrl+C/Ctrl+V in the Tilesets database list, pasting into the selected slot while preserving the slot ID.
- **Plugin Manager multi-select**: Plugins now support Shift-click range selection and Ctrl/Cmd-click toggle selection, with group copy, cut, paste, duplicate, and remove actions.
- **Project manager tests**: Added a `node:test` test harness covering version metadata sync, template metadata, new project creation, and RPG Maker import metadata.
- **Trait action buttons**: All trait editors (Actors, Classes, Weapons, Armors, States, Enemies) now have visible Add, Edit, Copy, Paste, and Delete buttons below the traits table, no longer relies solely on right-click context menu discovery
- **Trait keyboard shortcuts**: When a trait row is selected, Ctrl+C (copy), Ctrl+X (cut), Ctrl+V (paste), Delete (remove), and Enter (edit) operate on the selected trait instead of the parent database entry
- **Image picker "Open in Folder" button**: When selecting face graphics, character sprites, or SV battlers, a new "Open in Folder" button next to "Select This Image" opens the file in the system file manager (e.g. Dolphin) for quick access to external editing tools
- **Editor Distribution Builder** (`Build → Package Editor for Distribution...`): New in-editor tool for packaging RPG Reactor itself for release on itch.io / GitHub Releases. Uses the same worker_threads architecture as the game build system.
  - **3 package types**:
    - *Platform-Specific*: One archive per OS with bundled NW.js runtime (Linux → `.tar.gz`, Windows/macOS → `.zip`)
    - *Universal*: Single `.zip` with all 3 platform runtimes included
    - *Minimal*: Editor only, bootstrap launchers auto-download NW.js on first run
  - **NW.js edition selection**: Normal or SDK (includes DevTools)
  - **3-tier runtime acquisition**: Checks bundled local dirs (`nwjs-linux/`, `nwjs-win/`, `nwjs-mac/`) → `.nw-cache/` → downloads from `dl.nwjs.io`
  - **Partial download protection**: Uses `.part` suffix during download to prevent corrupt cached files
  - **SHA256SUMS.txt** generated for all output archives
  - **Whitelist-based staging**: Only includes editor files needed for distribution (`src/`, `css/`, `images/`, `libs/`, `build-scripts/`, player-facing `template/Demo/`, launcher scripts, docs, bundled `runtime/libs/pixi.js`); excludes dev artifacts (`.git/`, `node_modules/`, `save/`, template dev dirs like `REACTOR_CORE_DUMP_MIDDEV/`, `RMMZ_Corescript/`, `PIXI5/`, `PIXI8/`, `Backup/`, `Screenshots/`)
  - **Bootstrap launchers** (minimal packages): Platform-specific scripts that download + extract NW.js on first run (bash for Linux/macOS, batch + PowerShell for Windows)
  - Worker: `build-scripts/dist-editor-worker.js`, Manager: `src/DistEditorManager.js`
- **Custom icons for built executables**: Game and editor builds now embed custom icons instead of the default NW.js compass icon
  - **Windows**: Embeds icon into `.exe` via PE resource section editing; uses project's `icon/icon.ico` if available, otherwise generates ICO from `icon/icon.png`
  - **macOS**: Replaces `app.icns` in `.app` bundle with ICNS generated from PNG
  - **Linux**: No change needed (runtime `window.icon` already handles this)
  - Editor distribution builds use `images/icon.png` / `images/icon.ico`
  - Graceful fallback: builds succeed even if icon files are missing or replacement fails
  - Helper module: `build-scripts/icon-helpers.js` (pure CommonJS, no npm dependencies)
- **Enemy editor: Hue slider with live preview**: Battler Hue field is now a slider + number input combo; dragging the slider applies a real-time `hue-rotate` CSS filter to the battler preview image

### Changed
- **Version metadata source**: Project creation and RPG Maker import now use root `package.json` as the single source of truth for RPG Reactor engine version metadata.
- **Project templates**: New project creation now copies the player-facing `template/Demo` directly instead of copying the whole `template/` directory; Barebones and Complex remain development/testing templates.
- **Event audio command editor**: Play BGM/BGS/ME/SE command editing now defaults empty commands from the current loaded/playing AudioPlayer channel and uses a richer inline preview UI.
- **Map tileset editing**: Editing map dimensions or tileset from Map Properties now saves the map file and reloads the map when needed, with tileset dropdowns using actual tileset IDs.
- **Map edit undo transactions**: Tile editing now records undo entries only when map data actually changes, keeping undo/redo history cleaner and more reliable across pencil, shape, fill, eraser, shadow, and region operations.
- **Actor editor layout**: Redesigned to use space more efficiently - General Settings and Images display side-by-side in the top row, Traits and Equipment side-by-side in the middle row, with Note full-width at the bottom
- **Enemy editor layout**: Traits and Note sections now display side-by-side in a row (matching the actor editor layout) instead of stacked full-width; Note textarea stretches to fill available height

### Fixed
- **Database section shortcut isolation**: Database section switching now clears stale search bars, button bars, Change Maximum buttons, and keyboard handlers so functionality from one section no longer bleeds into another.
- **Global shortcut bleed**: Map/event global shortcuts no longer fire while database and editor modals are open, preventing database Ctrl+V from triggering event/map paste actions.
- **Tilesets Change Maximum**: Tilesets now has its own Change Maximum behavior instead of reusing a stale handler from Actors or the previously visited database section.
- **Enemy battler selection refresh**: Changing an enemy battler now refreshes the real database detail panel and highlights the current battler in the picker.
- **System 1 sound effect selection**: Sound rows now select reliably by clicking the whole row, support `(None)`, and double-click confirms immediately.
- **Control Self Switch display**: Event command list now displays self-switch command values correctly (`0 = ON`, `1 = OFF`).
- **Map rendering after tileset changes**: Tilemap loading clears stale tileset textures and falls back to the first available tileset when a referenced tileset is missing.
- **Map data persistence**: Map property edits now write existing map changes to `Map###.json` and save `MapInfos.json`.
- **Map editor tool state**: Returning from event mode now updates the real active tool to pencil instead of only changing the toolbar highlight, preventing the Single Tile button from accidentally continuing to use Fill.
- **Map editor input handling**: Right-click, middle-click, Shift-pan, and out-of-bounds clicks no longer create map edits or stale undo entries; fill operations also cleanly reset drawing state and resume lazy loading.
- **Current-map parallax refresh**: Saving Map Properties with a changed parallax now immediately clears/replaces the visible parallax layer on the loaded map.
- **New-game map references after deletion**: Deleting maps now repairs invalid player and vehicle start-map references in `System.json`, and playtest validates/repairs those references before launch.
- **Tilesets list refresh**: Saving a Tilesets database name now immediately refreshes and reselects the visible Tilesets list entry.
- **Stale plugin entries**: Plugin Manager now detects and removes stale missing-plugin entries, including old `A1_AutotileMapper` references.

## [0.7.0] - 2026-02-15

### Added
- **Database list clipboard operations**: Right-click context menu on list entries with Copy, Cut, Paste, and Duplicate, matches RPG Maker behavior (cut blanks slot, paste overwrites selected entry)
- **Database list keyboard shortcuts**: Ctrl+C (copy), Ctrl+X (cut), Ctrl+V (paste), Ctrl+D (duplicate), Delete (blank entry), Ctrl+Z (undo)
- **Database list undo system**: Ctrl+Z reverts destructive list operations (cut, paste, duplicate, delete, new, remove) with full snapshot/restore
- **Troop editor: Replace Enemy picker**: Visual modal with search bar, scrollable list with battler thumbnails, large preview panel with stats, and double-click to confirm
- **Troop editor: Visibility toggle**: Replaced hidden checkbox with eyeball icon button (open/slashed eye) for clearer member visibility control
- **Enemy editor: Battler preview**: Visual preview of the enemy battler image in the General section, with automatic charset frame extraction for `!`/`$` prefix filenames (standard 12x8 and big character 3x4 spritesheets)
- **Enemy editor: Multi-directory battler selection**: Battler image picker now searches `enemies`, `sv_enemies`, and `characters` directories

### Changed
- **Enemy editor layout**: General, Parameters, and Drop Items sections now display in a 3-column row for better use of horizontal space; Action Patterns, Traits, and Note remain full-width below

## [0.6.0] - 2026-02-14

### Added
- **Common Events editor**: Full editor with name, trigger (None/Autorun/Parallel), switch selection, and interactive command list with EventCommandPicker integration
- **Effects editor**: New DatabaseEffectEditor modal for RMMZ effects (Recovery, State, Buff/Debuff, Special) used by Skills and Items editors
- **Add/Delete entries**: New/Delete buttons in the database list panel for all data types with per-type default templates

### Changed
- **Skills editor**: Full rewrite, all fields now editable including skill type, scope, occasion, MP/TP costs, speed, success rate, repeats, hit type, animation, messages, damage formula section (type, element, formula, variance, critical), and interactive effects CRUD with context menu
- **Items editor**: Full rewrite, all fields now editable including item type, price, consumable toggle, scope, occasion, invocation parameters, damage formula section, and interactive effects CRUD with context menu
- **Enemies editor**: Full rewrite, editable general stats (name, battler image picker, hue, EXP, gold), 8 editable parameter inputs, 3 drop item slots with dynamic Kind/DataId/Denominator controls, action pattern table with add/edit/delete modal, and full trait CRUD via context menu
- **Armors editor**: Full rewrite to WeaponEditor parity, armor type and equip type dropdowns from system data, editable price, 8 editable parameter inputs, and full trait CRUD with context menu (Add/Edit/Cut/Copy/Paste/Delete)

## [0.5.0] - 2026-02-14

### Added
- 53 new event command editor UIs, bringing total from 29 to 82 supported commands
- **Flow Control & Messages**: Input Number (103), Select Item (104), Show Scrolling Text (105), Common Event (117), Label (118), Jump to Label (119), Play Movie (261), Name Input Processing (303)
- **Toggle Commands**: Change Save Access (134), Change Menu Access (135), Change Encounter (136), Change Formation Access (137), Change Player Followers (216), Change Map Name Display (281), all use shared ToggleCommandEditor
- **Actor Commands**: Change HP (311), Change MP (312), Change TP (326), Change State (313), Recover All (314), Change EXP (315), Change Level (316), Change Parameter (317), Change Skill (318), Change Equipment (319), Change Name (320), Change Class (321), Change Nickname (324), Change Profile (325)
- **Screen Effects**: Tint Screen (223), Flash Screen (224), Shake Screen (225), Move Picture (232), Rotate Picture (233), Tint Picture (234), Set Weather Effect (236)
- **System & Map**: Change Battle BGM (132), Change Victory ME (133), Change Window Color (138), Change Defeat ME (139), Change Vehicle BGM (140), Set Vehicle Location (202), Change Tileset (282), Change Battle Background (283), Change Parallax (284), Get Location Info (285)
- **Scene Commands**: Battle Processing (301), Shop Processing (302), Change Actor Images (322), Change Vehicle Image (323)
- **Battle Commands**: Change Enemy HP (331), Change Enemy MP (332), Change Enemy TP (342), Change Enemy State (333), Enemy Recover All (334), Enemy Appear (335), Enemy Transform (336), Show Battle Animation (337), Force Action (339)
- **No-Editor Commands** (direct insert): Exit Event Processing (115), Get on/off Vehicle (206), Erase Event (214), Gather Followers (217), Save BGM (243), Replay BGM (244), Abort Battle (340), Open Menu Screen (351), Open Save Screen (352), Game Over (353), Return to Title Screen (354)
- Display text in event list for all 69 new command codes
- Continuation line support for Show Scrolling Text (405) and Shop Processing (605)

### Fixed
- Corrected command codes 131-140 to match RMMZ standard: Save Access (134), Menu Access (135), Encounter (136), Formation (137), Window Color (138), Defeat ME (139), Vehicle BGM (140)
- Added missing Show Animation (212) to command names map
- Added display text for Show Choices (102), Control Timer (124), Change Transparency (211), Show Animation (212), Show Picture (231), Erase Picture (235)
- Added Battle Processing branch display: If Win (601), If Escape (602), If Lose (603), End (604)

## [0.4.5] - 2026-02-14

### Changed
- License changed from CC0-1.0 to MIT
- Version bumped to 0.4.5 to reflect engine completeness

### Added
- Linux launcher script with desktop integration (`RPGReactor.sh`)
- Desktop entry and icon auto-installation on first run
- Set Movement Route editor: full two-panel editor with 45-command button grid, inline parameter dialogs, multi-select, cut/copy/paste, reorder
- Orphaned 505 (movement route) command repair on load
- Audio player: SVG transport buttons, hover tooltips, yellowjacket theme

### Fixed
- Made NW.js binaries executable for Linux
- Movement route display: human-readable command text instead of raw JSON
- Movement route 505 continuation entries properly managed on insert/edit
- Character ID 0 ("This Event") no longer incorrectly mapped to Player
- End markers no longer displayed as visible 505 entries

## [0.1.0] - 2024-11-18

### Added

#### Core Application
- NW.js-based cross-platform application framework
- Dark theme UI optimized for long editing sessions
- Resizable sidebar panels with size persistence
- Welcome screen with project creation and opening

#### Map Editor
- Pencil, rectangle, circle area, fill bucket, and eraser tools
- Four-layer tile system with auto-layer mode
- Shadow pen mode for depth effects
- Undo/redo system (50 step history)
- Autotile support with animated water and waterfall tiles
- Region painting with 256 distinct regions
- Viewport culling and lazy-loading for performance

#### Event System
- Visual event editor with multi-page support
- Page-based conditional system (switches, variables, items, actors)
- Event commands for game logic
- Event copy/paste/cut operations
- Find/search functionality across project
- Drag-and-drop event repositioning
- Starting position markers

#### Database Editors
- Actor editor with stats, equipment, and traits
- Class editor with parameter curves and skill learning
- Skill editor with damage formulas and effects
- Item editor with consumable effects
- Weapon editor with parameters and traits
- Armor editor with resistances and bonuses
- Enemy editor with AI patterns and drops
- Troop editor for enemy group composition
- State editor for status effects
- Animation editor with Effekseer support
- Tileset editor with passage and terrain configuration
- System editor for game-wide settings

#### Audio System
- Multi-channel audio player (BGM, BGS, ME, SE)
- Volume, pitch, and pan controls
- Seek slider with real-time updates
- Loop configuration

#### Plugin System
- Plugin discovery and management
- Enable/disable toggle
- Load order configuration
- Parameter editing interface

#### Playtest
- One-click game testing
- Debug mode support
- Process management

#### Build System
- Cross-platform game builds (Windows, macOS, Linux, Web)
- NW.js runtime packaging via worker_threads (bundled or downloaded)
- Asset bundling into `package.nw`

#### Templates
- Demo template used for new projects created by players
- Barebones and Complex templates retained for engine development/testing
- Project structure compatible with RPG Maker MZ format
