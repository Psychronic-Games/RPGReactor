# Changelog

All notable changes to RPG Reactor will be documented in this file.

This root changelog summarizes public release progress for GitHub. The detailed editor changelog lives at [`editor/CHANGELOG.md`](editor/CHANGELOG.md).

## [Unreleased]

### Added

- The Effekseer Animation Generator's **Interface** category was rebuilt as true 3D instruments and grown to **21 recipes** — every panel is now world-fixed geometry that rotates truthfully with the orientation gizmo instead of a flat billboard. New instruments include a build-your-own **Orbital Survey** solar system (per-planet sizes and custom planet-texture uploads), a wireframe **Starship Analysis** hull with tracking callouts, a **Reactor Core** wireframe torus, **Circular Gauge** and **Bar Meter** LED meters, a **Behavior Matrix** ternary plot, **Flight Prediction**, a living **Composite Waveform** oscilloscope, and a 3D **Battery** cell — and every interface can now display **user-typed text** (single-line Display Text or scrolling/blinking Paragraph Text) so one recipe reuses across many meanings.
- A full Effekseer **Physical** attack pack for battle effects — Slash, Bite, Punch, Impale, Claw Rake, Crush, Arrow Hit, Parry, Whip Crack, and Blood (with Burst/Spray/Drip splatter patterns and full color control) — plus new **Energy** spell effects (Energy Boost, Energy Column, Binding Circle, Hex Forcefield) and **Christian Cross** variants (Latin, Orthodox, Greek, Celtic).
- **MZ-style tile-layer dimming** in the map editor: selecting layer 1–4 fades the other layers so it's obvious which tiles live on the active layer.

### Changed

- Sharpened the Effekseer Magic Circle (legible runes, crisp inner star) and moved the Explosion recipe into the Physical category.

### Fixed

- Fixed Effekseer preview loading in the Database and Event animation pickers, rotation-gizmo jump/reset issues, and several beam/column rendering problems (hollow beam cores, half-circle columns, oversized bases).
- **RPG Maker MV compatibility:** the PIXI8 runtime now boots and plays a large commercial MV project's full plugin stack through its intro with no errors and loads MV save files cleanly, and the MV compatibility layer restores MV's `Spriteset_Battle` battleback methods so MV battleback plugins no longer crash battle load — continued progress toward mixing and matching MV and MZ plugins in one project.

## [0.94] - 2026-06-27

### Added

- Effekseer Animation Generator grew into a full composition tool: an Animation-Generator-style **layer system** (stack any animations into one exported .efkefc, with per-layer visibility, opacity, ordering and timing windows) and **keyframes** — parameter states pinned to chosen frames, compiled to native Effekseer curves (colors, size, spin) with **texture cross-fades** between keyframes; plus a master frame-count control, an AG-style layers panel, corrected solid-surface texturing with proper backface culling, and a professional-pack-derived recipe library (the format engine now reads Effekseer binary versions up to 1710, covering all 316 effects in the Complex template).
- Added an **Effekseer Animation Generator** to the Forge: generate native Effekseer particle effects (`.efkefc`) from recipes — no external Effekseer editor needed. Ships with 80 recipes at full parity with the standard Animation Generator's catalog across all eight categories: Geometric (including 4D Hypercube/Pentachoron/Hypersphere with baked 4D rotation and an emergent Galaxy Spiral), Symbolic (all 17 glyphs), Object (12 real 3D meshes from sword to crystal gem), Interface (10 sci-fi panels at pixel parity via baked sprite-sheet playback), Energy (including Portal, Magic Circle, and Teleport Column), Elements, Effect, and Physical. Wireframe or solid-textured rendering with custom texture upload that wraps shapes like a globe; seamless or continuous steady-state looping; crash-proof live preview through the game's own Effekseer runtime with realtime 3D orientation controls; and one-click export into the project's `effects/` folder. The underlying `.efkefc`/`.efkmodel` format engine is validated by byte-identical round-trips of all 120 stock MZ effects.
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
