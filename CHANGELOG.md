# Changelog

All notable changes to RPG Reactor will be documented in this file.

This root changelog summarizes public release progress for GitHub; larger releases group their fixes by theme. The detailed editor changelog lives at [`editor/CHANGELOG.md`](editor/CHANGELOG.md).

## [0.94.7] - 2026-07-13

Release overview: [RPG Reactor 0.94.7: Map Editing You Can Trust](docs/devlogs/2026-07-13-rpg-reactor-0.94.7.md). (0.94.6 was an internal development version and was never published; its changes ship here.)

### Changed

- Bumped RPG Reactor to version 0.94.7.

### Fixed

- Editor: the rectangle, circle, and paint bucket tools paint regions when the Regions tab is selected — previously only the pencil handled the region layer, and the area tools painted tiles from the previous palette tab's selection instead.

- Runtime: games no longer crash at startup with `this._app.start is not a function` or hang on a black screen when plugins alias `SceneManager.run`/`initialize` with non-async wrappers (VisuMZ Core Engine among them) — such wrappers drop the promise from PIXI v8's async graphics initialization, letting the game-loop start be reached mid-init; the loop start is now deferred until the renderer is ready, whatever the plugin wrapper timing.
- Runtime: MV-era plugins that construct filters ES5-style (`PIXI.Filter.call(this, vertex, fragment, uniforms)`) work under PIXI v8 instead of throwing "class constructor cannot be invoked without new".
- Web editor: database entry lists show their mini preview icons (skill/item/weapon/armor/state icons, actor face portraits, enemy battler thumbnails) in the browser edition — the renderer bailed without NW.js and painted via CSS `file://` backgrounds the browser host's URL bridge does not rewrite; icons now resolve through the host's project URLs. The character/face/SV-battler/icon picker dialogs also open in the browser edition instead of alerting that NW.js is required.
- Runtime: sprites using multiply or screen blending render correctly under PIXI v8 instead of covering the scene with an opaque quad (reported as the whole screen going dark when toggling Sang Hendrix's parallax collision overlay, alongside a flood of "Blend filter requires backBuffer" warnings). PIXI v8 supports these modes natively; the compat layer's filter-based registration was overriding that native path with a filter that cannot run while the back buffer is off.
- Editor: the paint bucket fills the whole connected region of an autotile terrain instead of stopping at shape variants (edges/corners), and recomputes autotile borders after the fill so filled areas connect cleanly. The eraser's fill mode matches terrain the same way.
- Editor: manual layer selection (L1–L4) strictly confines painting and fill to the chosen layer — ground autotiles previously ignored the layer picker and always cleared layers 2–4 at the painted cell. Auto mode keeps the MZ-style stacking rules.
- Editor: the playtest button saves the project (current map, database, map list) before launching, so playtests run the map as it looks in the editor.
- Runtime: the DevTools Issues tab is clean again — the deprecated `unload` listener is now `pagehide`, and the compat layer no longer touches `window.sharedStorage` while scanning globals (which tripped Chromium's Shared Storage deprecation report).

## [0.94.5] - 2026-07-12

Release overview: [RPG Reactor 0.94.5: The Performance Release](docs/devlogs/2026-07-12-rpg-reactor-0.94.5.md).

### Added

- Runtime: built-in frame profiler on F10 — records per-phase timings for every slow frame and writes `save/reactor-profile.json`; free until activated. Companion console helpers `$reactorAnimStats()` and `$reactorAnimWatch(id)` diagnose live animation sprites across all hosts.
- Build menu: "Install Reactor Runtime..." converts imported RPG Maker projects to the Reactor engine — the old corescript, libs, and `index.html` are archived to `rpgmaker-runtime-backup.zip` in the project root, and the plugin manifest is seeded from `plugins.js`.

### Changed

- Game deployment downloads the FFmpeg optimizer and the NW.js proprietary codec from direct release URLs instead of the GitHub API, eliminating unauthenticated rate-limit (HTTP 403) build failures. Downloads remain verified (pinned SHA-256 hashes for FFmpeg, structural archive validation for the codec).
- The shipped runtime plugin manifest is empty instead of containing development plugin entries.
- Runtime: games boot with a clean console — the compat layers' informational install banners are gated behind a debug switch (`window.$reactorDebugLogs`, `localStorage reactorDebugLogs`, or `?debuglogs`), legacy positional `PIXI.BlurFilter(...)` construction no longer triggers a PixiJS deprecation warning, and the "Save data is too big." web-storage warning no longer fires on desktop.
- Bumped RPG Reactor to version 0.94.5.

### Fixed — performance

- Runtime: object-heavy maps (hundreds of events plus plugin overlay windows) run at full speed again under PIXI v8 — far-offscreen character sprites and dormant plugin windows are detached from the display tree instead of merely hidden (measured 30 → 180 FPS on the heaviest profiled map). Set `window.$reactorDisableCulling = true` to disable for debugging.
- Runtime: scrolling across the tilemap's repaint boundary no longer hitches (was a 77ms spike from rebuilding ~2,000 tile sprites) and no longer leaves bands of stale garbage tiles at the viewport edge — tile sprites are pooled detached between repaints, so only freshly painted tiles are ever in the display tree.
- Runtime: LeTBS enemy AI turns no longer freeze the frame — the compat layer memoizes the AI's AoE evaluation (identical scopes were rebuilt with per-entity `eval()`s for every move-cell × action-cell combination; profiled at 80–146ms per skill) and replaces pathfinding that ran inside a sort comparator (~1,200 whole-map A* runs per move decision) with a single BFS flood fill.
- Runtime: Ultra Mode 7 runs at full speed on large maps (GPU vertex buffers now upload only when geometry changes — was ~135MB re-uploaded per frame on a 256×256 map, 36.8ms → 4ms median) and honors the plugin's `TILEMAP_PIXELATED` setting, removing tile seams in pixel-art games.

### Fixed — Ultra Mode 7 and plugin detection

- Runtime: `Utils.RPGMAKER_NAME` reports `"MZ"` (Reactor's identity moved to `Utils.REACTOR_NAME`) — multi-engine plugins branch on that exact string, and "Reactor" sent them down MV/dead-fallback paths: Ultra Mode 7 rendered nothing, and the Cyclone suite, DK Video Player, and others took wrong branches.
- Runtime: Ultra Mode 7 works with pre-2.2.0 plugin releases — `pixi_compat` supplies the `Tilemap.CombinedLayer` bridge (addRect animation-coordinate forwarding + animationFrame fan-out) that Blizzard added in v2.2.0.
- Runtime: Ultra Mode 7 maps no longer crash the scene — the tilemap's direct `updateTransform` drive now tolerates plugin transform chains ending in the legacy PIXI call (expected to throw on v8), matching the onRender bridge's behavior; the MV project-marker probe also stops logging file-not-found noise in MZ projects.

### Fixed — MV compatibility

- Runtime: the MV compatibility layer is now two-tier. MV plugin API support (the mix-and-match machinery) installs for every game, so MZ projects can use MV plugins; MV game semantics (window geometry, scene layout, battle flow) activate only for games authored in RPG Maker MV. Previously the whole layer applied to MZ projects, squeezing command windows and washing out window backgrounds.
- Runtime: "Set Movement Route" waits work again when an MV plugin overrides the route command (MV's interpreter watches `this._character`, MZ's `this._characterId`; the compat layer now honors both), fixing cutscene move routes that silently did nothing — e.g. YEP Move Route Core's `MOVE TO` marches.
- Runtime: looping MV-format animations (waving flags retriggered every pass) no longer blink out for a frame at the loop point — finished animation sprites get MV's one-tick removal grace, and fresh sprites draw their first frame at creation when their sheets are cached.
- Runtime: LeTBS battle animations no longer ghost — finished/orphaned animation sprites leaked on LeTBS's shared layer (frozen on their last frame, so looping state animations played exactly on top of their own ghost); the compat layer now sweeps the layer every battle tick.
- Runtime: victory triggers immediately when the last enemy falls in MV games; MZ's eager `BattleManager.endAction` cleanup let ATB systems open an actor command window over the dead troop, stalling battle end until one more attack.
- Runtime: MV window contents and main-menu window sizing are MV-verbatim under the MV compatibility layer, so layout plugins (YEP_MainMenuManager, YEP_PartySystem) measure the geometry they were written against; verified against the same game running its genuine MV corescript.
- Runtime: MV plugins customizing menu status drawing (gauges, hidden levels, class rows) apply again — MZ's `Window_StatusBase` intermediate class was shadowing their `Window_Base` patches.
- Runtime: MZ games show their saves again when leftover MV-era `.rpgsave` files sit beside the real `.rmmzsave` saves — save-format resolution is now native-first per game type instead of always preferring `.rpgsave`.
- Runtime: MV games no longer freeze when a plugin's promise rejects unhandled (failing `video.play()` was fatal under MZ semantics; MV ignored it — now logged and play continues).

### Fixed — rendering, effects, and editor

- Runtime: Effekseer battle animations stay round/undistorted at every screen position (off-center targets previously stretched effects radially), and "screen center" animations position correctly under PIXI v8.
- Runtime: plugins that read `PIXI.settings` (removed in PIXI v8) no longer crash the game on startup — a compat bridge maps the common settings to their v8 equivalents.
- Runtime: window skins no longer tile the whole skin sheet (including the text-color palette) behind window contents under PIXI v8; the background pattern quadrant renders correctly again.
- Runtime: the FPS counter (F2) renders with MZ's stock look in every project — its CSS previously only existed in RPG Maker's own `index.html`.
- Forge Effekseer Generator: the frame-count setting now caps exported effects (continuous-spin recipes included) so battle animations end when the Forge says they do; blank duration still exports endless ambience effects.
- Deploying an imported RPG Maker MV/MZ project that still runs on its original corescript no longer fails with "Project runtime is incomplete"; the check now follows what `index.html` boots, and its error explains how to install the Reactor runtime.

## [0.94.4] - 2026-07-11

Release overview: [RPG Reactor 0.94.4: Responsive Web Forge and Reliable Windows Playtests](docs/devlogs/2026-07-11-rpg-reactor-0.94.4.md).

### Added

- Skills, Items, and Weapons assign animations through a searchable picker modal with a live playing preview of both MV sprite-sheet animations and Effekseer effects.
- Database entry lists show a framed mini icon beside each name: database icons for skills, items, weapons, armors, and states; face portraits for actors; battler thumbnails for enemies.

### Changed

- Bumped RPG Reactor to version 0.94.4.

### Fixed

- The Web editor now adapts its sidebar, workspace, toolbars, status bar, database, event editor, image picker, map properties, splash screen, save banner, and Playtest window across desktop, laptop, narrow, and short browser viewports without changing the desktop NW.js layout. Unsupported deployment controls are removed from the Web menu.
- Web Forge tools now bundle their Character Generator engines and built-in style library, then save character sheets, animation sheets/GIFs, sound effects, complete Effekseer effects/resources, outfits, and hair into the active browser project. The files persist across reloads; projectless exports use browser file/directory pickers or a download fallback.
- Browser Playtest now waits for the project-overlay service worker to control the page, using one guarded startup reload when required so edits saved during the first Web-editor session are immediately available.
- Windows playtests now remain detectable as Test or Battle Test when isolated profiles are enabled. Windows NW.js retains `--user-data-dir` as its first application argument, which previously hid the later `test` token from RPG Maker and prevented test-only plugin overlays such as Sang Hendrix editor docks from being created.
- Runtime: battle test launches are now detected when Chromium switches occupy the first application argument on Linux and macOS — `Utils.isOptionValid` scans every argument instead of only the first. Previously Battle Test booted to the title screen.
- Runtime: MV-style damage popups no longer destroy the shared system Damage bitmap when a popup is removed, which crashed the PIXI v8 render pass and blacked out the battle. The renderer also skips live sprites whose texture source has been destroyed, logging the offending class instead of aborting the frame.
- Runtime: window selection cursors are clamped to the window's inner rect (MV behavior), MV battle-window metrics such as `windowWidth` and `numVisibleRows` now gap-fill correctly on subclasses, and the UI box size honors `SceneManager._boxWidth`/`_boxHeight` set by MV plugins so the window layer aligns at the origin as in MV. Together these keep battle command highlights inside their windows and align all windows with screen-anchored HUD art.
- Runtime: Effekseer effects render aspect-correct on widescreen canvases (the projection previously stretched effects horizontally, turning spheres into ovals), and the overlay GL context now re-asserts its render state around every draw so effects survive window blur/focus without back-face artifacts.
- Runtime: `Sprite.setFrame` always refreshes its texture, healing sprites whose shared bitmap had its base texture replaced by image-processing plugins, and windowskin refreshes tolerate MV-style window part structures instead of crashing during bitmap load.

## [0.94.3] - 2026-07-10

Release overview: [RPG Reactor 0.94.3: Web Editor and Reliable Downloads](docs/devlogs/2026-07-10-rpg-reactor-0.94.3.md).

### Added

- Added a provider-neutral Web editor package with Reactor One bundled and opened automatically. Browser edits persist locally, can be reset to the bundled project, and are used by the in-page Playtest.

### Changed

- Bumped RPG Reactor to version 0.94.3.
- AppImage output is now presented as a conditional sub-option directly beneath Linux in both deployment dialogs.

### Fixed

- Large NW.js SDK downloads now tolerate temporary `dl.nwjs.io` stalls, retry transient failures, and clean incomplete cache files instead of failing after 30 seconds.
- Deployment logs now keep a live inline progress bar visible during runtime and tool downloads, including transferred MiB for servers that do not report a total size and retry/completion state in the same row.
- Deployment downloads now prefer native curl when available, avoiding an NW.js worker-thread HTTPS stall where a valid runtime URL opened but delivered no bytes; the Node HTTPS path remains available as fallback.

## [0.94.2] - 2026-07-10

Release overview: [RPG Reactor 0.94.2: Safer Saves and Better Deployments](docs/devlogs/2026-07-10-rpg-reactor-0.94.2.md).

### Added

- The RPG Maker MV compatibility layer (`reactor_mv_compat.js`) now ships in the runtime folder and loads in every project. Previously it lived only in a local test project, so the 0.94.1 MV compatibility work was not actually included in new projects or the public runtime. It is inert in pure-MZ projects: every API it provides is gap-filled only when missing.
- Outfit Forge now always shows part options as permanent dropdowns (and always-visible thumbnail lists), matching Procedural-tab discoverability for materials, accents, and style presets.
- Added clean-checkout GitHub Actions coverage, runtime-manifest checks, generated-project smoke tests, save-safety tests, editor-distribution staging checks, and a no-NW.js web deployment smoke test.
- Added File-menu Save Project and Playtest commands plus visible shortcut indicators and application shortcuts for New (`Ctrl+N`), Open (`Ctrl+O`), Save (`Ctrl+S`), and Playtest (`Ctrl+R`).
- Added `F5` for a confirmed uncached editor reload and `F11` for native NW.js fullscreen.
- Added optional desktop runtime locale filtering with an English fallback, reducing packaged game size without changing project translations.
- Added optional deployment-time asset optimization: staged-only lossless Oxipng recompression and explicit-quality OGG Vorbis re-encoding, with smaller-valid-file replacement, loop-metadata preservation, per-file progress, and pinned SHA-256-verified FFmpeg acquisition.
- Added optional Linux x86_64 AppImage output for both games and the editor. Existing Linux folders and ZIP archives remain available; AppImage tooling and its Type 2 runtime are pinned, verified, cached, and used only when requested on a Linux x86_64 build host.

### Changed

- Bumped RPG Reactor to version 0.94.2.
- Save now persists the current map, all database files, project metadata, and the authoritative map list; map and project transitions prompt to save, discard, or cancel when changes are pending.
- New-project fallback scaffolding is deterministic and runtime-valid, with complete display/font settings and an empty plugin configuration instead of inheriting demo plugins.
- Deployment dialogs now provide themed searchable NW.js release selection, remember game and editor output directories independently, persist asset settings, and use consistent **ZIP archive** labels.

### Fixed

- Character Generator **Parts (PNG)** now scans both `forge/character_generator/styles/<style>/parts/` and the legacy Complex-template `forge/character_generator/parts/` path, with clearer empty-state copy and an Open Folder button.
- Forge tools no longer keep a stale project path after switching or closing projects, so bake/save dialogs (including Animation Generator GIF export) default to the currently open project.
- Hair Forge lower banding and scraggle sliders produce much larger, more visible pixel changes.
- Character Generator style switches no longer composite active Looseleaf bodies, outfits, or hair behind Psychronic parts (or vice versa); incompatible layers remain remembered and return when switching back.
- Windows splash startup no longer performs repeated one-pixel window-height nudges, which could appear as a several-pixel bounce after native frame and DPI rounding; Wine also avoids relaunching an already-frameless packaged window.
- Fixed the Demo's New Game crash introduced by MV RenderTexture compatibility forwarding `resolution: undefined` into PixiJS 8.14, producing `NaN` snapshot dimensions and an incomplete framebuffer during `Scene_Title.terminate()`.
- Database and project save failures now propagate to the UI instead of reporting false success, and database saves can no longer overwrite newer `MapInfos.json` data.
- Editor distributions now include the GIF encoder, worker, and decoder dependency closure used by Animation Generator import/export, and fail packaging when required runtime files are absent.
- Game deployment now validates the complete Reactor runtime and excludes development saves and backup directories from packaged output.
- Valid RPG Maker MZ **Skip** commands (`code 109`) now display correctly in Common Events and troop events instead of appearing as unknown commands.
- NW.js deployment now reuses packaged and cached runtimes consistently, searches every cache root before downloading, and supports latest-stable, editor-matched, or manually pinned runtime versions.
- Game and full editor deployments can optionally install a SHA-256-verified, exact-version `nwjs-ffmpeg-prebuilt` codec overlay for additional H.264/AAC playback support.
- Linux editor distributions are now produced as symlink-preserving `.zip` archives instead of `.tar.gz`.
- Effekseer Layers now adapt beside or below the preview, animated opacity is applied correctly, and keyframe selection, add/delete, frame, Start Frame, and layer-timing edits remain synchronized.
- Playtests now use Reactor-owned profiles isolated by project and NW.js version on Windows, macOS, and Linux, so deployed games and other projects cannot block launch.
- Oxipng now initializes its supported single-thread WASM codec directly in NW.js workers instead of selecting an unavailable browser-thread build and reporting every PNG as unsupported.
- Localized About dialogs now display the shared current application version instead of stale hard-coded version text.

## [0.94.1] - 2026-07-05

### Added

- The Effekseer Animation Generator's **Interface** category was rebuilt as true 3D instruments and grown to **21 recipes**, every panel is now world-fixed geometry that rotates truthfully with the orientation gizmo instead of a flat billboard. New instruments include a build-your-own **Orbital Survey** solar system (per-planet sizes and custom planet-texture uploads), a wireframe **Starship Analysis** hull with tracking callouts, a **Reactor Core** wireframe torus, **Circular Gauge** and **Bar Meter** LED meters, a **Behavior Matrix** ternary plot, **Flight Prediction**, a living **Composite Waveform** oscilloscope, and a 3D **Battery** cell, and every interface can now display **user-typed text** (single-line Display Text or scrolling/blinking Paragraph Text) so one recipe reuses across many meanings.
- A full Effekseer **Physical** attack pack for battle effects - Slash, Bite, Punch, Impale, Claw Rake, Crush, Arrow Hit, Parry, Whip Crack, and Blood (with Burst/Spray/Drip splatter patterns and full color control), plus new **Energy** spell effects (Energy Boost, Energy Column, Binding Circle, Hex Forcefield) and **Christian Cross** variants (Latin, Orthodox, Greek, Celtic).
- **MZ-style tile-layer dimming** in the map editor: selecting layer 1–4 fades the other layers so it's obvious which tiles live on the active layer.

### Changed

- Bumped current development version to RPG Reactor 0.94.1.
- Sharpened the Effekseer Magic Circle (legible runes, crisp inner star) and moved the Explosion recipe into the Physical category.

### Fixed

- Fixed Effekseer preview loading in the Database and Event animation pickers, rotation-gizmo jump/reset issues, and several beam/column rendering problems (hollow beam cores, half-circle columns, oversized bases).
- **RPG Maker MV compatibility:** the PIXI8 runtime now boots and plays a large commercial MV project's full 168-plugin stack, intro cutscenes, save/load through the game's own load menu, event-choice menus, and the LeTBS tactical battle system verified all the way into rendered combat turns (positioning, movement grid, turn order, battle HUD). The MV compatibility layer gained MV's `Spriteset_Battle` battleback chain, MV window-internal sprite aliases, MV's battle-field creation order, MV's cell-sheet animation engine restored on `Sprite_Animation` for plugins that subclass it, message sub-window creation chains (run exactly once per scene), character balloons and sprite-hosted animations as functional ports, `ToneFilter`, MV `Bitmap` tone/hue manipulation, the MV gauge/color API on `Window_Base`, `Game_Followers.forEach`, MV save-backup APIs, and ~25 more scan-driven gap-fills, each preserving MV's argument guards verbatim so plugin feature-detection keeps working.
- **Runtime resilience:** resource loads that silently die (no onload, no onerror, common on slow or syncing disks) previously hung the game forever with a black screen and zero console errors. The runtime now watchdogs every database JSON, image, and audio load from the engine's own frame tick, retries stalls in parallel indefinitely, revives buffers that plugin caches still gate on after MZ code destroyed them, and degrades genuinely missing audio/images to silence/blank with a loud console error instead of deadlocking scene startup.
- **PIXI v8:** `getBounds()` returns a `Bounds` object in v8 (v5–v7 returned a `Rectangle`); a `contains()` delegate keeps plugin hit tests working.

## [0.94] - 2026-06-27

### Added

- Effekseer Animation Generator grew into a full composition tool: an Animation-Generator-style **layer system** (stack any animations into one exported .efkefc, with per-layer visibility, opacity, ordering and timing windows) and **keyframes**, parameter states pinned to chosen frames, compiled to native Effekseer curves (colors, size, spin) with **texture cross-fades** between keyframes; plus a master frame-count control, an AG-style layers panel, corrected solid-surface texturing with proper backface culling, and a professional-pack-derived recipe library (the format engine now reads Effekseer binary versions up to 1710, covering all 316 effects in the Complex template).
- Added an **Effekseer Animation Generator** to the Forge: generate native Effekseer particle effects (`.efkefc`) from recipes, no external Effekseer editor needed. Ships with 80 recipes at full parity with the standard Animation Generator's catalog across all eight categories: Geometric (including 4D Hypercube/Pentachoron/Hypersphere with baked 4D rotation and an emergent Galaxy Spiral), Symbolic (all 17 glyphs), Object (12 real 3D meshes from sword to crystal gem), Interface (10 sci-fi panels at pixel parity via baked sprite-sheet playback), Energy (including Portal, Magic Circle, and Teleport Column), Elements, Effect, and Physical. Wireframe or solid-textured rendering with custom texture upload that wraps shapes like a globe; seamless or continuous steady-state looping; crash-proof live preview through the game's own Effekseer runtime with realtime 3D orientation controls; and one-click export into the project's `effects/` folder. The underlying `.efkefc`/`.efkmodel` format engine is validated by byte-identical round-trips of all 120 stock MZ effects.
- Added a procedural **Mini Skirt** option for the Outfit Forge Legs zone, selectable as a second Legs-slot preset in both Looseleaf and Psychronic styles, with crisp vertical pleats that survive on dark ramps, optional anatomical knee pads, and a stronger triangular A-line flare that extends the cloth past the body's per-row silhouette (instead of being trapped inside the body outline). Tunable `hem` (scaled over waist-to-knee, so `0` is a micro-skirt), `waistband`, `pleats`, and `kneeAccent` params are exposed in the Legs zone card.

### Changed

- Bumped current development version to RPG Reactor 0.94.

### Fixed

- Fixed Outfit Forge Mini Skirt cleanup so side-view frames no longer leave orphan leg-palette outline/bridge pixels below the skirt hem.
- Fixed Outfit Forge Mini Skirt `Knee plates` so it now renders separate knee pads at the anatomical knees above the boot/shin band instead of being an ignored segmented-pants-only toggle; the skirt waistband is constrained to one visible row so it cannot consume most of a short skirt.
- Fixed Psychronic Mini Skirt placement by rejecting classifier rows above the real legs anchor, preventing torso/belt rows from being painted as skirt cloth.
- Fixed Forge card number fields feeling laggy while typing by avoiding full preview regeneration on every numeric keystroke.

## [0.93.1] - 2026-06-21

### Changed

- Bumped current development version to RPG Reactor 0.93.1.
- Reworked macOS editor distribution output into a self-contained `RPG Reactor.app` archive with no loose Chromium sidecar files at the zip root.
- Windows editor distribution packages now strip noisy Chromium `--enable-logging` from the packaged editor payload.

### Fixed

- Fixed macOS packaged editor launch and playtest by putting the editor payload in `Contents/Resources/app.nw` and adding an internal clean playtest runtime that symlinks to the bundled NW.js framework instead of duplicating it.
- Fixed macOS playtest runtime resolution across NW.js helper-process paths by searching from `process.execPath`, `__dirname`, `process.cwd()`, and `nw.App.startPath`.
- Fixed Windows playtest selection to prefer the clean adjacent `nw.exe` before stale `nwjs-win` folders, and hid spawned Windows playtest console flicker.
- Fixed erasing imported RPG Maker maps by making auto erase target the topmost actual tile layer instead of depending on the current palette tab.
- Fixed rectangle, circle, fill, and pencil eraser behavior so eraser mode remains active when changing drawing tools, never requires selected palette tiles, and shows outline-only previews while erasing.
- Fixed Plugin Manager saves for existing RPG Maker MV/MZ projects so `js/plugins.js` is written in RPG Maker-compatible four-field format instead of including Reactor-only metadata such as parsed help, author, and URL.
- Fixed the top Database menu's System entry so it opens System 1/System 2 sections instead of dispatching the obsolete `system` database type.

## [0.93.0] - 2026-06-21

### Changed

- Bumped current development version to RPG Reactor 0.93.
- Continued UI polish with a distinct themed Audio Player control card for Volume, Pitch, and Pan.
- Added the Rarely Typical Players Podcast YouTube channel to the Help/About links.
- Updated the editor window title to use `RPG Reactor | <Game Title>` and refresh on project load, close, language changes, and System 1 game-title edits.
- Reworked Windows and Linux platform editor packages so the editor payload is appended to the branded executable while the plain NW.js executable remains clean for playtesting, avoiding duplicate full runtime copies.
- Windows editor packages now use a frameless compatibility mode with RPG Reactor's own title controls, centered startup, and manual maximize/restore behavior for cleaner Proton/Wine behavior on Linux.
- Replaced emoji language flags in Options with SVG flag badges so Windows/Chromium displays real flag icons instead of regional-letter abbreviations.

### Fixed

- Fixed playtest launch from final Windows editor builds by avoiding the editor `package.nw` runtime when opening game projects.
- Fixed macOS editor distribution packaging to keep a clean `nwjs-mac/nwjs.app` runtime for playtesting separate from the editor `.app` bundle.
- Fixed Windows taskbar/app icon handling in packaged editor builds by resolving icons from packaged paths and improving multi-size ICO embedding.
- Fixed Windows editor builds under Proton/Wine showing a white native client-area band and offset mouse hit-testing by using frameless compatibility mode.
- Fixed final editor startup positioning so the splash/editor window opens centered instead of crammed into the upper-left corner.
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

### Added

- Expanded editor localization to ten languages: English, Japanese, Spanish, Traditional Chinese, Simplified Chinese, Russian, Portuguese, German, French, and Greek.
- Added immediate language switching through Options and the top-menu language button.
- Added broad localization coverage for editor chrome, Options, About, Forge, Audio Player, database/event editor surfaces, many fixed event-command forms, and common alert/status text.
- Added root release documentation so GitHub visitors can see progress without opening the editor subfolder.
- Added i18n regression coverage for dictionary completeness, localized key references, and high-visibility labels that should not fall back to English.

### Changed

- Updated RPG Reactor to version 0.91 for this release cycle.
- Improved the Options Palette picker with visible color swatches, high-contrast themed dropdown rows, and selected/hover highlighting that matches the Language dropdown styling.
- Renamed the bundled Pixi runtime path to the canonical `runtime/libs/pixi.js` and updated packaging/runtime references accordingly.
- Refreshed documentation for current localization, theming, Forge, runtime, and test coverage.

### Fixed

- Fixed language-change handling for dynamic editor text and generated modal/chrome surfaces.
- Fixed Palette dropdown swatches being removed by the generic localization text pass.
- Fixed Palette dropdown light/gray-on-gray contrast by moving styling to theme tokens.
- Fixed missing bundled script references for Pixi/GIF loaders in the editor shell.
- Fixed several low-risk Pixi v8 deprecation warnings in editor/runtime code paths.

## [0.9.0] - 2026-05-31

- Completed the major Pixi v8 migration pass, including compatibility shims and visual-fidelity fixes.
- Added the theme token system and broad editor UI token migration.
- Added database, animation, map-editor, and runtime compatibility polish described in the detailed editor changelog.
