# RPG Reactor

RPG Reactor 0.98.2 is an open-source, cross-platform RPG game editor and runtime for RPG Maker MV/MZ-compatible projects. RPG Reactor provides its own modern PIXI 8-based runtime while preserving compatibility with RPG Maker project data and targeting backwards compatibility with both RPG Maker MZ and MV plugins, including mixing plugins from both engines within a single project through complementary MZ and MV compatibility layers.

Use RPG Reactor to create, edit, playtest, and package 2D RPGs with familiar RPG Maker-style maps, events, database records, plugins, and deployment workflows, without depending on the original RPG Maker runtime or editor.

Pre-built download binaries are available at <https://psychronic.itch.io/rpg-reactor>. The current development version is 0.98.2 and is not published yet; the latest tagged source release is [0.98.1](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.98.1).

## Repository Layout

```text
RPGReactor/
├── editor/   # RPG Reactor editor app source
├── runtime/  # Game runtime corescript copied into new projects
├── template/Demo/ # Bundled Reactor One starter project
├── docs/     # Maintainer workflows and project notes
├── RPGReactor.sh / .bat / .command
├── CHANGELOG.md
├── LICENSE
└── README.md
```

## Documentation

- [Editor README](editor/README.md): detailed feature list, source launch steps, project structure, shortcuts, and technical notes.
- [Changelog](CHANGELOG.md): GitHub-facing release progress and links to the detailed editor changelog.
- [Handoff notes](docs/HANDOFF.md): the current release-candidate state, completed validation, and remaining platform checks.
- [RPG Reactor 0.96.0 overview](docs/devlogs/2026-07-25-rpg-reactor-0.96.0.md): release explanation of the deep correctness audit, the authored-data oracle, the event-command and database fixes it produced, the 3D map renderer, and a closing section on what in 3D is not finished.
- [RPG Reactor 0.95.0 overview](docs/devlogs/2026-07-18-rpg-reactor-0.95.0.md): prior-cycle explanation, including source-audited localization, expanded database workspaces, complete Conditional Branch editing, safer large-map workflows, and restored MV/YEP save compatibility.
- [Maintainer docs](docs/README.md): workflows that are useful for project maintenance but are not required for normal editor use.
- [Release checklist](docs/RELEASE-CHECKLIST.md): exact maintainer commands for source publication, signed release candidates, GitHub attachments, and optional itch.io publication.

## Feature Overview

- **Full RPG Maker-style editor**: map editing with four tile layers, autotiles, shadow pen, and region painting; a visual event editor with 100+ commands, multi-page events, every MZ Conditional Branch form, collapsible block structures with persisted fold state, and optional advanced expressions, loops, input conditions, event calls, and picture controls beyond the stock MV/MZ editors; complete database editors with dense Types and Terms workspaces; a multi-channel audio player; and multi-instance editing with a cross-window typed clipboard.
- **Modern PIXI 8 runtime**: the game runtime (`runtime/`) is a fully migrated PIXI v8 corescript. Tilemaps, UltraMode7, Effekseer particle effects, video, and shaders all run on current PixiJS instead of the legacy renderer RPG Maker ships.
- **Authorable HD-2D maps**: maps can opt into a perspective 3D presentation while retaining RPG Maker's grid, passability, events, and data format. Tileset classes and map-painted object groupings stand walls, roofs, panels, foliage, events, lights, and parallax-backed ground in the editor and runtime.
- **MZ + MV plugin compatibility**: complementary MZ and MV compatibility layers let existing RPG Maker plugins run unmodified on the new runtime, including mixing plugins from both engines in a single project. Stock MV/YEP LZString saves, MOG interfaces, video parallaxes, and custom local/browser save keys are supported. Validated against a large commercial MV game running a 168-plugin stack (Yanfly, Victor Engine, MOG, SRD, and the LeTBS tactical battle system), and against a commercial MZ project running 143 active plugins including 41 VisuStella ones, an event-driven title scene, and third-party tilemap and billboard plugins that add layers of their own.
- **Resilient resource loading**: the runtime watchdogs every database, image, and audio load from its own frame tick. Silently-dying requests (slow disks, cloud-synced folders) retry automatically, and genuinely missing files degrade gracefully with a clear console error instead of hanging the game on a black screen.
- **The Forge, in-editor asset generators**:
  - **Animation Generator**: 76 procedural 2D animations across four categories, including Portal, with layered composition, per-layer keyframe timelines, a 3D shape pipeline, custom textures, and export to bake-ready sprite sheets or animated GIFs.
  - **Effekseer Animation Generator**: create native Effekseer particle effects (`.efkefc`) from 106 recipes across nine categories without the external Effekseer editor: 21 sci-fi interface instruments with user-typed text, physical battle hits, 15 energy recipes, elements, a custom-effect Composer, and more; wireframe or solid-textured rendering with custom texture upload; layers, keyframes with texture cross-fades, live in-editor preview through the game's own Effekseer runtime, and one-click export. The tracked suite validates generated format/model round trips, every recipe at default/extreme/swept values, composition, and real-WASM playback.
  - **Character Generator**: bundled Psychronic and Looseleaf styles plus procedural Outfit Forge and Hair Forge tools that generate RPG Maker-style walking-sheet parts, with live 4-direction walk previews, multiple hair styles, palette systems, and save-to-library output. Psychronic remains the default style.
  - **Sound Effect Generator**: procedural sfxr-style sound design on Web Audio, baked to 16-bit WAV in the project's `audio/se/`. 29 archetypes across RPG SFX and tuned instruments, six waveforms including a physically modelled Karplus-Strong pluck, 27 parameters, live waveform/envelope/pitch visualizers, and a 16-step sequencer for jingles and stingers.
- **Build & deploy**: one-click isolated playtests; cross-platform game packaging for Windows, macOS, Linux, and Web; optional Linux AppImages for games and the editor; configurable NW.js releases and runtime locales; optional staged PNG/OGG optimization; and an editor distribution builder with SHA-256 checksums.
- **Source-audited 18-language localization** across editor-generated interface text, with locale-key and placeholder validation, Arabic right-to-left direction, and project-authored game content deliberately left untouched; plus a theme system with multiple color palettes in light and dark modes.

## What's New in 0.98.2

The full list for this release cycle is in the [changelog](CHANGELOG.md).

- **Existing projects use the runtime fixes shipped by the current editor.** Opening an older Reactor project refreshes its versioned engine files before loading game data while preserving its own plugin list, preventing stale corescripts from reproducing already-fixed shader failures.
- **Database editing is more direct.** Learnable Skills, Effects, and Enemy Action Patterns have visible controls, double-click editing, and keyboard actions instead of relying on hidden context menus.
- **Extended face sheets and MV animations are authorable.** Four-column face sheets may have additional 144px rows, and switching an Animation to Sprite-based now produces a valid editable MV-format record.
- **Chinese localization and layout are safer.** Reviewed Simplified Chinese terms override machine-assisted guesses, common locale aliases work, and database forms reflow according to their actual available width.
- **Quick Event Creation covers common map interactions.** Right-click an empty cell in Event mode to generate a Transfer, Door, Treasure, or Inn event through guided project-aware controls.
- **Events can use a 3D model.** The Event editor Image section can pick a mesh from `3d/<name>/source`, mark Front/Back/Left/Right, and store the pose in the map's `.r3d.json` sidecar. In playtest the model follows the event and blocks the tiles it covers.

## Development Launchers

The root launcher scripts are for opening RPG Reactor from a source checkout while developing or testing the app. They are not the final packaged game/editor executables; they start the editor through a local NW.js runtime that you download separately.

| File | Platform | Purpose |
|------|----------|---------|
| `RPGReactor.sh` | Linux | Opens the editor with `nwjs-linux/nw` |
| `RPGReactor.bat` | Windows | Opens the editor with `nwjs-win/nw.exe` |
| `RPGReactor.command` | macOS | Opens the editor with `nwjs-mac/nwjs.app` |

Each script looks for the matching `nwjs-*` folder at the repository root or inside `editor/`, then launches the app from `editor/`.

## Run From Source

RPG Reactor runs as an NW.js desktop app. Source development and release tooling require Node.js 22 or newer. Source checkouts include the bundled Reactor One Demo, but do not include NW.js platform binaries, `node_modules/`, build output, saves, or other local project templates.

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

GitHub Actions runs the same suite from a clean checkout, including syntax, project scaffolding, runtime manifests, save safety, localization no-fallback checks, cross-instance clipboard transport, database and event-command serialization, map sampling and exact autotile placement, picture extensions, project lifecycle security, runtime compatibility, deployment, and release policy/signing gates. Current validation completed with **1,366 passing tests and no failures**.

## Runtime

The `runtime/` folder contains the player-facing corescript (`reactor_*.js`) and runtime libraries. The editor copies this folder into newly created game projects under `js/`.

## License

RPG Reactor-owned code is licensed under the MIT License in [LICENSE](LICENSE).
Bundled third-party components remain under their respective licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No single license is asserted
for third-party files or user/project content.

## Cutting a Source Release

`cut-release.cjs` is the canonical source-release path. Run it from a clean
`main` worktree after all 0.98.2 changes have been committed:

```bash
node editor/build-scripts/cut-release.cjs 0.98.2 --dry-run
node editor/build-scripts/cut-release.cjs 0.98.2
```

The command runs the complete editor test suite, finalizes both changelog
headings with the release date, updates the package/README version surfaces and
test count, creates a release commit when those surfaces changed, creates an
annotated `v0.98.2` tag, and pushes the branch and tag. The tag push starts
`publish-release.yml`, which creates or updates the GitHub source release using
that version's root changelog section. `--no-push` stops after creating the tag.

The push uses the repository's configured GitHub authentication. Setting
`GITHUB_TOKEN` or `GH_TOKEN` also lets the script create the release directly;
without one, the tag-triggered workflow remains the publication mechanism. To
retry source publication for an existing tag, dispatch **Publish Release** in
GitHub Actions with the version. Do not move or force-push a published tag.

Signed binaries are a separate, gated process. `release-candidate.yml` builds
and signs the four platform candidates, then `release.yml` verifies and attaches
those exact bytes to the existing source release and can publish the same bytes
to itch.io. Follow [the release checklist](docs/RELEASE-CHECKLIST.md) for that
process.
