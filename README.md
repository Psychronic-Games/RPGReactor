# RPG Reactor

RPG Reactor 0.95.0 is an open-source, cross-platform RPG game editor and runtime for RPG Maker MV/MZ-compatible projects. RPG Reactor provides its own modern PIXI 8-based runtime while preserving compatibility with RPG Maker project data and targeting backwards compatibility with both RPG Maker MZ and MV plugins, including mixing plugins from both engines within a single project through complementary MZ and MV compatibility layers.

Use RPG Reactor to create, edit, playtest, and package 2D RPGs with familiar RPG Maker-style maps, events, database records, plugins, and deployment workflows, without depending on the original RPG Maker runtime or editor.

Pre-built download binaries are available at <https://psychronic.itch.io/rpg-reactor>. The current development version is 0.95.0 and is not published yet; the latest tagged source release remains [0.94.8](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.94.8).

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
- [RPG Reactor 0.95.0 draft overview](docs/devlogs/2026-07-18-rpg-reactor-0.95.0.md): current-cycle explanation, including source-audited localization, expanded database workspaces, complete Conditional Branch editing, safer large-map workflows, and restored MV/YEP save compatibility.
- [Maintainer docs](docs/README.md): workflows that are useful for project maintenance but are not required for normal editor use.
- [Release checklist](docs/RELEASE-CHECKLIST.md): exact maintainer commands for validated, signed GitHub and optional itch.io publication.

## Feature Overview

- **Full RPG Maker-style editor**: map editing with four tile layers, autotiles, shadow pen, and region painting; a visual event editor with 100+ commands, multi-page events, every MZ Conditional Branch form, and optional advanced expressions, loops, input conditions, event calls, and picture controls beyond the stock MV/MZ editors; complete database editors with dense Types and Terms workspaces; a multi-channel audio player; and multi-instance editing with a cross-window typed clipboard.
- **Modern PIXI 8 runtime**: the game runtime (`runtime/`) is a fully migrated PIXI v8 corescript. Tilemaps, UltraMode7, Effekseer particle effects, video, and shaders all run on current PixiJS instead of the legacy renderer RPG Maker ships.
- **MZ + MV plugin compatibility**: complementary MZ and MV compatibility layers let existing RPG Maker plugins run unmodified on the new runtime, including mixing plugins from both engines in a single project. Stock MV/YEP LZString saves, MOG interfaces, video parallaxes, and custom local/browser save keys are supported. Validated against a large commercial MV game running a 168-plugin stack (Yanfly, Victor Engine, MOG, SRD, and the LeTBS tactical battle system).
- **Resilient resource loading**: the runtime watchdogs every database, image, and audio load from its own frame tick. Silently-dying requests (slow disks, cloud-synced folders) retry automatically, and genuinely missing files degrade gracefully with a clear console error instead of hanging the game on a black screen.
- **The Forge, in-editor asset generators**:
- **Animation Generator**: 76 procedural 2D animations across four categories, including Portal, with layered composition, per-layer keyframe timelines, a 3D shape pipeline, custom textures, and export to bake-ready sprite sheets or animated GIFs.
  - **Effekseer Animation Generator**: create native Effekseer particle effects (`.efkefc`) from 106 recipes across nine categories without the external Effekseer editor: 21 sci-fi interface instruments with user-typed text, physical battle hits, 15 energy recipes, elements, a custom-effect Composer, and more; wireframe or solid-textured rendering with custom texture upload; layers, keyframes with texture cross-fades, live in-editor preview through the game's own Effekseer runtime, and one-click export. The tracked suite validates generated format/model round trips, every recipe at default/extreme/swept values, composition, and real-WASM playback.
  - **Character Generator**: bundled Psychronic and Looseleaf styles plus procedural Outfit Forge and Hair Forge tools that generate RPG Maker-style walking-sheet parts, with live 4-direction walk previews, multiple hair styles, palette systems, and save-to-library output. Psychronic remains the default style.
- **Build & deploy**: one-click isolated playtests; cross-platform game packaging for Windows, macOS, Linux, and Web; optional Linux AppImages for games and the editor; configurable NW.js releases and runtime locales; optional staged PNG/OGG optimization; and an editor distribution builder with SHA-256 checksums.
- **Source-audited 18-language localization** across editor-generated interface text, with locale-key and placeholder validation, Arabic right-to-left direction, and project-authored game content deliberately left untouched; plus a theme system with multiple color palettes in light and dark modes.

## What's New in 0.95.0

- **The editor speaks all 18 supported languages more completely**: a generated deep catalog and static source audit cover database, event-command, Forge, project, build, and Web-editor surfaces; tests enforce locale parity, Terms schemas, interpolation placeholders, and Arabic RTL behavior.
- **The Database has room to work**: it now fills nearly the entire viewport with pane-owned scrolling. Types presents five dense lists together with multiselect Cut/Copy/Paste, context menus, ID-safe bulk clearing, Add, and confirmed maximum changes; Terms presents Basic Statuses, Parameters, Commands, and grouped Messages in one compact workspace. Both adapt in the Web editor.
- **Map sections and autotile shapes can be placed exactly**: right-drag captures all four tile planes, shadows, and regions; left-click or drag stamps the exact six-plane patch with edge clipping, a live composite preview, and one Undo action per stroke. Holding Shift with Pencil, Rectangle, or Circle preserves selected A1-A4 shapes without reconnecting neighbors. A synchronized A1 preference can pause editor water animation without changing playtests or deployments.
- **Two open projects can exchange authored data**: a typed cross-instance clipboard carries whole maps, single or multi-selected batches from every top-level database category, individual trait/effect rows, whole events, event/troop pages, map/Common/Troop command blocks, movement-route commands, and plugin groups between Reactor windows. Database batches overwrite consecutive target slots while keeping their target IDs, list scroll/selection stays stable, and incompatible categories are rejected. Trait/effect database and Type references resolve by unique target-project name; missing or ambiguous matches are rejected, while other assets and numeric references remain as authored.
- **Database maximums preserve capacity and fail safely**: Reactor retains 9,999 major records/Common Events and 1,000 Animations/Tilesets, keeps each database as one continuous list that appends 250-row batches while scrolling, and rejects values such as 99,999 before allocation. System Type ceilings exceed 99; Actors support level 999 through finite Class-stat extrapolation; action repeats support 100 with a runtime backstop; and projects can use 2,000 maps across IDs through 9,999. Constant-time fields are not restricted merely to mirror MZ's editor.
- **Project assets can live in nested folders**: editor browsers recursively discover audio, animation sheets, Effekseer effects, characters, faces, battlers, tilesets, battlebacks, parallaxes, title images, and plugin file parameters. Selections remain extensionless RPG Maker names such as `Boss/Phase 2`, with forward slashes on every platform, and nested `$`/`!$` character sheets retain their single-character frame layout. Tileset previews also no longer depend on an initialized map renderer and use encoded native/Web asset URLs, while the Audio Player indexes Unicode initials instead of collapsing them under `#`.
- **Character and image pickers are easier to navigate**: actor characters/faces/SV battlers, enemy battlers, vehicle graphics, animation sheets, event character frames, and Show Text facesets have live name/path search plus clickable Unicode section rails and sticky headers. Search ignores case and accents, works with nested paths, supports keyboard selection, and restores the current event character frame safely.
- **System start locations are visible before you commit them**: System 1 can choose the Player, Boat, Ship, and Airship starting Map/X/Y directly on the Transfer Player map canvas while retaining manual numeric editing. Picker changes remain local until OK, nested maps expand and search correctly, and stale map renders cannot replace a newer selection. The Title Screen image chooser now uses the same searchable Unicode browser and side-by-side preview as other image pickers.
- **Long plugin guides are searchable**: Plugin Help & Documentation highlights every literal case-insensitive match, shows the active/total count, and provides wraparound previous/next navigation. Enter, Shift+Enter, F3, Shift+F3, and Plugin Manager-scoped Ctrl/Cmd+F navigation make large `@help` sections practical without modifying plugin files or saved metadata.
- **Complex plugin parameters are manageable as forms, not code dumps**: MV/MZ `struct<T>` definitions and nested struct/simple arrays open as named, aligned records with schema-driven fields, multiline note editors, Add/Edit/Delete, up/down controls, and direct full-row drag-and-drop ordering. Nested dialogs retain the defining plugin's schema, Cancel is transactional, Structure/Text tabs stay synchronized, and saves rebuild RPG Maker's required nested JSON-string format instead of flattening it. A real nested `YEP_OptionsCore` fixture round-trips byte-for-byte.
- **Imported projects open and launch more reliably**: project locks show only their specific warning; metadata/database reads retry brief partial or locked files, accept UTF-8 BOMs, and report the failing path and reason. Imported MV packages repair only missing, non-string, or blank `name`/`main` launch fields before runtime installation or desktop playtest while preserving custom NW.js settings.
- **Event editing is transactional**: in Event mode, double-clicking an empty map tile opens a detached default event. Apply or OK inserts it with one Undo snapshot; Cancel, X, or backdrop dismissal leaves the map unchanged. Existing-event Apply refreshes the Cancel baseline, and occupied tiles still open their event.
- **Project persistence is safer**: critical project/database/map/plugin writes use exclusive random temporary files, no-follow flags, file and directory flushing, and safe cleanup; deployment saves before staging, and pasted maps land immediately after the selected map as same-parent siblings instead of dropping to the bottom of the root list.
- **Conditional Branch is complete**: all MZ condition types 0-13 and their subtypes are editable, existing arrays round-trip exactly, legacy Button data remains compatible, and new conditions serialize in canonical MZ form.
- **Advanced event commands stay portable**: Control Variables can author arithmetic, trigonometric, random, min/max, and bitwise expressions; calls can resolve Common Events and current-map event pages from variables; and Conditional Branch can test extended keyboard, mouse-button, wheel, and pointer-coordinate state. Loop remains the direct stock Loop/Repeat Above structure. Advanced generated forms serialize through stock event-command shapes and strict versioned Script metadata rather than custom project fields, so unmodified commands reopen structurally while altered scripts remain ordinary scripts.
- **Pictures gain dynamic IDs and Reactor effects**: Show/Move/Erase can resolve picture IDs from variables, Move can read duration from a variable, and Erase can target one picture, a range, or all pictures. Optional angle, custom anchor, sine-wave, and Overlay state is isolated in `reactor_picture_extensions.js`; generated commands carry stock MV/MZ fallbacks, and Overlay safely becomes Normal where the renderer cannot support it. Negative scale remains the only flip control and previews correctly through `-2000..2000`.
- **MV and YEP saves work across the PIXI 8 runtime**: Reactor again bundles stock-compatible LZString support, honors custom desktop/browser save paths, and decodes real `N4Ig...` MV saves before YEP Save Core parses them.
- **System 2 Magic Skills matches MZ data**: fillable Skill Type rows now edit the ordered numeric list that controls side-view casting motions instead of presenting unrelated checkboxes.
- **More MV plugin visuals behave like stock MV**: MOG Treasure Popup labels no longer clip to MZ's client area, legacy video parallaxes can parent children without PIXI warnings, and intentional empty-source video teardown no longer masquerades as a media failure.
- **Saving and cancelling agree**: Save All refreshes an open Database's Cancel baseline, so Cancel returns to the latest successfully saved state.
- **The deep-audit backlog is cleared**: every remaining finding from the July 13 seven-subsystem audit is fixed — Cancel really cancels in the audio command editor, Battle Test no longer writes preview battlebacks into your System.json, names and notes with quotes or ampersands survive database round-trips, transparent-tile auto-erase works again, map deletion can't strand phantom map entries, plugin manager opens are instant and side-effect free, MV-compat saves stop growing with every battle animation, and a long tail of editor and runtime performance fixes.
- **Long sessions stay healthy**: every preview surface (animation pickers, the Animations database page, audio pickers, character walk previews, the Effekseer Forge) now releases its WebGL context, audio context, timers, and global listeners on close — browsers cap these, so marathon editing sessions previously ended with blank 3D previews, silent audio previews, and shortcuts leaking into previously viewed animations.
- **Nested If and Show Choices edit safely**: editing a branch that contained nested Ifs or choice structures could remove the wrong command range, orphan branch markers, or shift bodies into the wrong branch — the event editor now rebuilds structures with an indent-aware parser, keeps empty branches in place, and preserves nesting depth. Conditional Branch also gains MZ's "Create Else Branch" checkbox instead of always adding an Else.
- **Project-authored content renders safely**: project names, notes, messages, traits, JSON, and Forge values are escaped across affected privileged editor previews and forms. Project Character Generator styles load their JavaScript and PNG parts automatically.
- **Release artifacts are reproducible and authenticated**: publishable builds pin NW.js hashes, package the tracked Reactor One Demo and source-bound manifests, require Windows signing and macOS signing/notarization, and publish inspected candidate bytes to GitHub and optional itch.io channels without rebuilding. Ordinary interactive builds can still use Latest Stable NW.js versions for development packages.
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

GitHub Actions runs the same suite from a clean checkout, including syntax, project scaffolding, runtime manifests, save safety, localization no-fallback checks, cross-instance clipboard transport, database and event-command serialization, map sampling and exact autotile placement, picture extensions, project lifecycle security, runtime compatibility, deployment, and release policy/signing gates. Current 0.95.0 validation completed with **350 passing tests and no failures**.

## Runtime

The `runtime/` folder contains the player-facing corescript (`reactor_*.js`) and runtime libraries. The editor copies this folder into newly created game projects under `js/`.

## License

RPG Reactor-owned code is licensed under the MIT License in [LICENSE](LICENSE).
Bundled third-party components remain under their respective licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No single license is asserted
for third-party files or user/project content.
