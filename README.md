# RPG Reactor

RPG Reactor 0.94.1 is an open-source, cross-platform RPG game editor and runtime for RPG Maker MV/MZ-compatible projects. RPG Reactor provides its own modern PIXI 8-based runtime while preserving compatibility with RPG Maker project data and targeting backwards compatibility with both RPG Maker MZ and MV plugins — including mixing plugins from both engines within a single project through complementary MZ and MV compatibility layers.

Use RPG Reactor to create, edit, playtest, and package 2D RPGs with familiar RPG Maker-style maps, events, database records, plugins, and deployment workflows, without depending on the original RPG Maker runtime or editor.

Pre-built download binaries are available at <https://psychronic.itch.io/rpg-reactor>.

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
- [Maintainer docs](docs/README.md): workflows that are useful for project maintenance but are not required for normal editor use.

## Feature Overview

- **Full RPG Maker-style editor**: map editing with four tile layers, autotiles, shadow pen, and region painting; a visual event editor with 100+ event commands and multi-page events; complete database editors; a multi-channel audio player; and multi-instance editing with a cross-window typed clipboard.
- **Modern PIXI 8 runtime**: the game runtime (`runtime/`) is a fully migrated PIXI v8 corescript — tilemaps, UltraMode7, Effekseer particle effects, video, and shaders all run on current PixiJS instead of the legacy renderer RPG Maker ships.
- **MZ + MV plugin compatibility**: complementary MZ and MV compatibility layers let existing RPG Maker plugins run unmodified on the new runtime — including mixing plugins from both engines in a single project. Validated against a large commercial MV game running a 168-plugin stack (Yanfly, Victor Engine, MOG, SRD, and the LeTBS tactical battle system).
- **Resilient resource loading**: the runtime watchdogs every database, image, and audio load from its own frame tick — silently-dying requests (slow disks, cloud-synced folders) retry automatically, and genuinely missing files degrade gracefully with a clear console error instead of hanging the game on a black screen.
- **The Forge — in-editor asset generators**:
  - **Animation Generator**: 80+ procedural 2D animations across four categories with layered composition, per-layer keyframe timelines, a 3D shape pipeline, custom textures, and export to bake-ready sprite sheets or animated GIFs.
  - **Effekseer Animation Generator**: create native Effekseer particle effects (`.efkefc`) from 100+ recipes without the external Effekseer editor — 21 sci-fi interface instruments with user-typed text, physical battle hits, energy spells, elements, and more; wireframe or solid-textured rendering with custom texture upload; layers, keyframes with texture cross-fades, live in-editor preview through the game's own Effekseer runtime, and one-click export. The in-house format engine is validated by byte-identical round-trips of all 120 stock MZ effects.
  - **Character Generator**: procedural Outfit Forge and Hair Forge tools that generate RPG Maker-style walking-sheet parts, with live 4-direction walk previews, multiple hair styles, palette systems, and save-to-library output.
- **Build & deploy**: one-click playtest, cross-platform game packaging (Windows/macOS/Linux/Web) with custom icons, and an editor distribution builder with SHA256 checksums.
- **17-language editor localization** and a theme system with multiple color palettes in light and dark modes.

## What's New in 0.94.1

- **RPG Maker MV compatibility push**: a large commercial MV project's full 168-plugin stack now boots, plays its intro cutscenes, saves and loads through its own custom menus, and runs LeTBS tactical battles all the way into rendered combat turns (grid positioning, movement ranges, turn order, battle HUD) under the PIXI 8 runtime. The MV compatibility layer gained MV's battleback chain, window-internal sprite aliases, battle-field creation order, the MV cell-sheet animation engine for plugins that subclass `Sprite_Animation`, functional character balloons and sprite-hosted animations, message sub-window plugin chains, `ToneFilter`, MV `Bitmap` tone/hue manipulation, the MV gauge/color API, and ~25 more scan-driven gap-fills.
- **Runtime resource watchdogs**: stalled loads that fire neither `onload` nor `onerror` — previously an unexplainable permanent black screen — now retry in parallel from the engine's frame tick until they arrive, and missing audio/images degrade to silence/blank with a loud console error rather than deadlocking scene startup behind plugin readiness gates.
- **Effekseer Interface instruments rebuilt in native 3D** and grown to 21 recipes — Orbital Survey (build-your-own solar system with per-planet custom textures), Starship Analysis, Reactor Core, Circular Gauge, Bar Meter, Battery, Behavior Matrix, Flight Prediction, Composite Waveform, and more — every panel now rotates truthfully in 3D and can display user-typed text.
- **New Effekseer battle content**: a 10-recipe Physical attack pack (Slash, Bite, Punch, Impale, Claw Rake, Crush, Arrow Hit, Parry, Whip Crack, Blood with splatter patterns), new Energy spells (Energy Boost, Energy Column, Binding Circle, Hex Forcefield), Christian Cross variants (Latin, Orthodox, Greek, Celtic), and jagged Ice Shards models.
- **MZ-style tile-layer dimming** in the map editor: selecting layer 1–4 fades the other layers so the active layer is always obvious.
- **All new Forge content localized across the editor's 17 languages**, plus PIXI v8 plugin-compatibility fixes (`getBounds().contains` hit tests) and Effekseer preview loading fixes in the Database and Event animation pickers.

Earlier releases: **0.94** improved Windows playtest profile isolation, display scaling, and deployment; **0.93** added the Effekseer Generator's layer/keyframe composition and the recipe library; RPG Maker project files (`js/plugins.js`) always stay in RPG Maker-readable format. See the [Changelog](CHANGELOG.md) for the complete history.

## Development Launchers

The root launcher scripts are for opening RPG Reactor from a source checkout while developing or testing the app. They are not the final packaged game/editor executables; they start the editor through a local NW.js runtime that you download separately.

| File | Platform | Purpose |
|------|----------|---------|
| `RPGReactor.sh` | Linux | Opens the editor with `nwjs-linux/nw` |
| `RPGReactor.bat` | Windows | Opens the editor with `nwjs-win/nw.exe` |
| `RPGReactor.command` | macOS | Opens the editor with `nwjs-mac/nwjs.app` |

Each script looks for the matching `nwjs-*` folder at the repository root or inside `editor/`, then launches the app from `editor/`.

## Build From Source

RPG Reactor runs as an NW.js desktop app. Source checkouts do not include NW.js platform binaries, `node_modules/`, build output, saves, or local project templates.

1. Clone the repository:

```bash
git clone https://github.com/Psychronic-Games/RPGReactor.git
cd RPGReactor
```

2. Install the editor dependency:

```bash
cd editor
npm install
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

## Runtime

The `runtime/` folder contains the player-facing corescript (`reactor_*.js`) and runtime libraries. The editor copies this folder into newly created game projects under `js/`.

## License

MIT
