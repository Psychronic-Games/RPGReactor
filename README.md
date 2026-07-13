# RPG Reactor

RPG Reactor 0.94.9 is an open-source, cross-platform RPG game editor and runtime for RPG Maker MV/MZ-compatible projects. RPG Reactor provides its own modern PIXI 8-based runtime while preserving compatibility with RPG Maker project data and targeting backwards compatibility with both RPG Maker MZ and MV plugins, including mixing plugins from both engines within a single project through complementary MZ and MV compatibility layers.

Use RPG Reactor to create, edit, playtest, and package 2D RPGs with familiar RPG Maker-style maps, events, database records, plugins, and deployment workflows, without depending on the original RPG Maker runtime or editor.

Pre-built download binaries are available at <https://psychronic.itch.io/rpg-reactor>. The latest source release is [0.94.9 — Instant Fills](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.94.9).

## Repository Layout

```text
RPGReactor/
├── editor/   # RPG Reactor editor app source
├── runtime/  # Game runtime corescript copied into new projects
├── docs/     # Maintainer workflows and project notes
├── RPGReactor.sh / .bat / .command
├── CHANGELOG.md
├── LICENSE
└── README.md
```

## Documentation

- [Editor README](editor/README.md): detailed feature list, source launch steps, project structure, shortcuts, and technical notes.
- [Changelog](CHANGELOG.md): GitHub-facing release progress and links to the detailed editor changelog.
- [RPG Reactor 0.94.9 release overview](docs/devlogs/2026-07-13-rpg-reactor-0.94.9.md): public explanation of the fix release — whole-map bucket fills in a quarter second, scroll-preserving undo/redo, and the undo-visuals root cause put to rest.
- [Maintainer docs](docs/README.md): workflows that are useful for project maintenance but are not required for normal editor use.

## Feature Overview

- **Full RPG Maker-style editor**: map editing with four tile layers, autotiles, shadow pen, and region painting; a visual event editor with 100+ event commands and multi-page events; complete database editors; a multi-channel audio player; and multi-instance editing with a cross-window typed clipboard.
- **Modern PIXI 8 runtime**: the game runtime (`runtime/`) is a fully migrated PIXI v8 corescript. Tilemaps, UltraMode7, Effekseer particle effects, video, and shaders all run on current PixiJS instead of the legacy renderer RPG Maker ships.
- **MZ + MV plugin compatibility**: complementary MZ and MV compatibility layers let existing RPG Maker plugins run unmodified on the new runtime, including mixing plugins from both engines in a single project. Validated against a large commercial MV game running a 168-plugin stack (Yanfly, Victor Engine, MOG, SRD, and the LeTBS tactical battle system).
- **Resilient resource loading**: the runtime watchdogs every database, image, and audio load from its own frame tick. Silently-dying requests (slow disks, cloud-synced folders) retry automatically, and genuinely missing files degrade gracefully with a clear console error instead of hanging the game on a black screen.
- **The Forge, in-editor asset generators**:
  - **Animation Generator**: 80+ procedural 2D animations across four categories with layered composition, per-layer keyframe timelines, a 3D shape pipeline, custom textures, and export to bake-ready sprite sheets or animated GIFs.
  - **Effekseer Animation Generator**: create native Effekseer particle effects (`.efkefc`) from 106 recipes across nine categories without the external Effekseer editor: 21 sci-fi interface instruments with user-typed text, physical battle hits, energy spells, elements, a custom-effect Composer, and more; wireframe or solid-textured rendering with custom texture upload; layers, keyframes with texture cross-fades, live in-editor preview through the game's own Effekseer runtime, and one-click export. The in-house format engine is validated by byte-identical round-trips of all 120 stock MZ effects.
  - **Character Generator**: procedural Outfit Forge and Hair Forge tools that generate RPG Maker-style walking-sheet parts, with live 4-direction walk previews, multiple hair styles, palette systems, and save-to-library output.
- **Build & deploy**: one-click isolated playtests; cross-platform game packaging for Windows, macOS, Linux, and Web; optional Linux AppImages for games and the editor; configurable NW.js releases and runtime locales; optional staged PNG/OGG optimization; and an editor distribution builder with SHA-256 checksums.
- **18-language editor localization** and a theme system with multiple color palettes in light and dark modes.

## What's New in 0.94.9

- **Whole-map bucket fills in a quarter of a second**: filling a huge area on a 256×256 map froze the editor for 30–40 seconds; massive tile updates now take the same streaming path as map loading — instant viewport, background fill — with the water-animation bookkeeping batched instead of quadratic.
- **Your scroll position stays put**: undo, redo, and giant fills no longer snap the view back to the map's top-left corner.
- **Undo reports solved**: "paint bucket doesn't undo" traced to stale background-fill batches on 0.94.5–0.94.7 repainting pre-undo tiles over the restored map (data was always correct); 0.94.8's loading rework eliminated it, and full re-renders now rebuild layer caches from scratch as an extra safeguard.

Earlier releases: **0.94.8** made large maps load in a quarter of the time, ran water maps at full frame rate, fixed region-painting freezes and previews, and smoothed animation previews; **0.94.7** fixed the paint bucket, strict layer separation, region tools, playtest autosave, and a PIXI v8 blend-mode blackout under popular plugins; **0.94.5** took object-heavy maps from 30 to 180 FPS, added the built-in F10 frame profiler, unfroze LeTBS tactical battles, and fixed and accelerated Ultra Mode 7; **0.94.4** made the browser editor responsive with persistent Web Forge output and restored Windows test tooling; **0.94.3** added the browser-hosted editor and resilient deployment downloads; **0.94.2** added safer project persistence, reproducible project creation, deployment controls, asset optimization, AppImages, and the public MV compatibility runtime. See the [Changelog](CHANGELOG.md) for the complete history.

## Development Launchers

The root launcher scripts are for opening RPG Reactor from a source checkout while developing or testing the app. They are not the final packaged game/editor executables; they start the editor through a local NW.js runtime that you download separately.

| File | Platform | Purpose |
|------|----------|---------|
| `RPGReactor.sh` | Linux | Opens the editor with `nwjs-linux/nw` |
| `RPGReactor.bat` | Windows | Opens the editor with `nwjs-win/nw.exe` |
| `RPGReactor.command` | macOS | Opens the editor with `nwjs-mac/nwjs.app` |

Each script looks for the matching `nwjs-*` folder at the repository root or inside `editor/`, then launches the app from `editor/`.

## Run From Source

RPG Reactor runs as an NW.js desktop app. Source checkouts do not include NW.js platform binaries, `node_modules/`, build output, saves, or local project templates.

1. Clone the repository:

```bash
git clone https://github.com/Psychronic-Games/RPGReactor.git
cd RPGReactor
```

2. Install the editor dependency:

```bash
cd editor
npm ci
cd ..
```

3. Download NW.js for your platform from <https://dl.nwjs.io/>. Use the normal or SDK build for your OS and CPU architecture.

4. Extract NW.js and rename/place the extracted folder at the repository root:

```text
RPGReactor/
├── editor/
├── runtime/
├── nwjs-linux/   # Linux: contains the nw executable
├── nwjs-win/     # Windows: contains nw.exe
└── nwjs-mac/     # macOS: contains nwjs.app
```

You can also place the same `nwjs-*` folder inside `editor/`; the launchers check both locations.

5. Launch RPG Reactor:

```bash
# Linux
chmod +x RPGReactor.sh
./RPGReactor.sh

# Windows
RPGReactor.bat

# macOS
chmod +x RPGReactor.command
./RPGReactor.command
```

For direct NW.js launch during development:

```bash
cd editor
../nwjs-linux/nw .
```

## Tests

```bash
cd editor
npm test
```

GitHub Actions runs the same suite from a clean checkout, including syntax, project-scaffold, runtime-manifest, save-safety, distribution-staging, deployment runtime/locale/codec/asset behavior, shortcut handling, playtest isolation, and web-deployment checks. The optional stock Effekseer corpus tests also run when a local `template/Demo/effects` corpus is available.

## Runtime

The `runtime/` folder contains the player-facing corescript (`reactor_*.js`) and runtime libraries. The editor copies this folder into newly created game projects under `js/`.

## License

MIT
