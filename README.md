# RPG Reactor

RPG Reactor 0.98.4 is an open-source, cross-platform RPG game editor and runtime for RPG Maker MV/MZ-compatible projects. RPG Reactor provides its own modern runtime, PixiJS 8 for 2D and Three.js for HD-2D/3D maps, while preserving compatibility with RPG Maker project data and targeting backwards compatibility with both RPG Maker MZ and MV plugins, including mixing plugins from both engines within a single project through complementary MZ and MV compatibility layers.

Use RPG Reactor to create, edit, playtest, and package 2D RPGs with familiar RPG Maker-style maps, events, database records, plugins, and deployment workflows, without depending on the original RPG Maker runtime or editor.

Pre-built download binaries are available at <https://psychronic.itch.io/rpg-reactor>. The current development version is 0.98.4 and is not published yet; the latest tagged source release is [0.98.3](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.98.3).

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
- [Handoff notes](docs/HANDOFF.md): current cycle state, open threads to pick up, manual release gates, and the engineering notes behind each recent piece of work.
- [RPG Reactor 0.98.3 devlog](docs/devlogs/2026-08-23-rpg-reactor-0.98.3.md): in-editor rigging, preset motions, database 3D bindings, model preloading, and multi-format audio.
- [Custom user interfaces design](docs/DESIGN-USER-INTERFACES.md): the User Interfaces database section, its runtime, how it stays invisible to RPG Maker, seven opt-in stock-scene replacements, and the workflows intentionally left stock.
- [3D objects on the map](docs/devlogs/2026-08-02-3d-objects-on-the-map.md): how painted object groupings and tileset 3D classes build the HD-2D world.
- [RPG Reactor 0.96.0 overview](docs/devlogs/2026-07-25-rpg-reactor-0.96.0.md): release explanation of the deep correctness audit, the authored-data oracle, the event-command and database fixes it produced, the 3D map renderer, and a closing section on what in 3D is not finished.
- [RPG Reactor 0.95.0 overview](docs/devlogs/2026-07-18-rpg-reactor-0.95.0.md): prior-cycle explanation, including source-audited localization, expanded database workspaces, complete Conditional Branch editing, safer large-map workflows, and restored MV/YEP save compatibility.
- [Maintainer docs](docs/README.md): workflows that are useful for project maintenance but are not required for normal editor use.
- [Release checklist](docs/RELEASE-CHECKLIST.md): exact maintainer commands for source publication, signed release candidates, GitHub attachments, and optional itch.io publication.

## Feature Overview

- **Full RPG Maker-style editor**: map editing with four tile layers, autotiles, shadow pen, and region painting; a visual event editor with 100+ commands, multi-page events, every MZ Conditional Branch form in RPG Maker's own four-tab layout (plus a Reactor tab for keyboard, mouse, wheel and pointer conditions), collapsible block structures with persisted fold state, Show Text edited as a whole run of message boxes with RPG Maker's text-code menu and a windowskin-accurate preview, and optional advanced expressions, loops, input conditions, event calls, and picture controls beyond the stock MV/MZ editors; a database where any entry can list what references it, descriptions and battle messages carry the text codes their windows honour, enemies have their own Max TP and can require states the user or target lacks, Add State can set its own duration, and Grow reaches Max TP or a random range; complete database editors with dense Types and Terms workspaces; a multi-channel audio player; and multi-instance editing with a cross-window typed clipboard. Drawing, layer, Undo/Redo, Audio, Database, Plugin, Resource Manager, and Forge actions share a high-contrast blue/cyan/gold SVG toolbar language; the Fill action is a pouring paint bucket and the Shadow Pen visibly lays a dark stroke.
- **Project-wide Resource Manager**: browse locale-sorted nested MZ/Reactor image, audio, effect, movie, font, icon, and 3D assets; preview media and orbit/zoom models through Reactor3D; batch-import safely on desktop; multi-select nested exports with Ctrl/Cmd or Shift; export decrypted bytes from encrypted projects; and delete only after path, project-lock, and symlink checks. The 3D category does not delete or merge existing models, but desktop users can import one validated GLB/OBJ/FBX/STL/USDZ/3MF/DXF into a new user-named `3d/<folder>/` containing `source/` and an empty `textures/`; `.blend` must first be exported. Publication is staged, destination-reserved, ownership-checked, and rolled back on failure. Web mutation is intentionally disabled.
- **Native Video Surfaces**: Reactor event commands Show, Transform, and Stop Video Surface place WebM/MP4 on the screen, map, player, or an event with layer, opacity, audio, playback rate, loop/wait, scanlines, culling, position, size, rotation, scale, depth, Z, and four local corners. Runtime uses PIXI for 2D/all screen targets; only PIXI projectively warps corners, leaves Z to the 3D view (the dragged position is the whole 2D placement), and interprets culling distance in screen pixels. Map/event/player targets on 3D maps use rectangular Three.js planes with Z/world-camera-distance culling and ignore corners. Editor live previews use PIXI, Three.js, or a 3D-screen DOM bounding-box/clip approximation; DOM corner handles reshape the clip but do not projectively warp video pixels. Editor previews omit scanlines, and only Three.js previews apply culling. All preview types move directly, Three.js stays rectangular, numeric fields synchronize, and right-click opens the exact source command. The map view reduces each page independently without evaluating page conditions/flow and forces preview media muted/looping; playtest honors authored playback. Preview resources never enter map or sidecar data.
- **Modern PIXI 8 + Three.js runtime**: the game runtime (`runtime/`) is a fully migrated PIXI v8 corescript. Tilemaps, UltraMode7, Effekseer particle effects, video, and shaders all run on current PixiJS instead of the legacy renderer RPG Maker ships, and 3D maps, models, rooms, cameras and in-scene effects are drawn by Three.js (r185) sharing the same canvas.
- **Authorable HD-2D maps**: maps can opt into a perspective 3D presentation while retaining RPG Maker's grid, passability, events, and data format. Map Properties carries the 3D switch and a room: a parallax floor, walls, and ceiling at an authored height, faces inward, stored beside the map in `Map###.r3d.json`. Model props from the palette's 3D-M tab stand 3D models on any map, colliding where their geometry actually is. Models carry named effects — a database animation or a video surface anchored to a part, sized relative to the model, played on demand, always, or while moving, dashing, or idle — fired by the Play 3D Effect command and animation timelines, and drawn inside the 3D world in both the editor and the game, so a wall, a strut or a character in front of the anchor hides them. A map with models is drawn under one depth buffer everywhere: what stands behind something stays behind it as the view turns. Each 3D map picks a Default Camera from Fixed Angle (HD-2D), Top-Down, Isometric, Third Person, or First Person, and the Change 3D Camera event command switches modes and angles during play; third and first person use mouse look with camera-relative WASD. The player start has a facing (right-click → Player Facing; the only added key in an MZ file, `System.json.startDirection`, which MZ ignores) and is drawn in the 3D view. Tileset classes and map-painted object groupings stand walls, roofs, panels, foliage, events, lights, and parallax-backed ground in the editor and runtime. Events, actors, enemies, weapons, armor, and items can carry GLB/OBJ/FBX models with in-editor rigging, carved parts, and authored animations, stored in `.r3d.json` sidecars beside the MZ data. Height is a real coordinate: events and props carry a Z in tiles (editable X/Y/Z in the Event Editor, drag arrows in the 3D view), move routes gain Rise/Descend/Set Height and Face Ceiling/Face Ground/Stand Up/Rotate steps, and collision respects vertical separation — a scaffold overhead blocks nobody, and a long vehicle turns through the arc its body actually sweeps. Model animations queue and never freeze the world: Play Model Animation chains plays with an optional Wait for Completion, and the Scoped Wait command (under the new Game Flow category) holds a script in the background — on a target's last actions, a duration, a switch, or a variable — while the player keeps moving and a second interaction parks the waiting script onto its own runner. Plugin light pools and beams lie flat on the ground, stop at walls, and skip rooms the camera cannot see into.
- **Custom user interfaces**: a User Interfaces database section lays out menus, dialogs, panels, and HUDs with Box, Image, Text, Button, Gauge, and typed List nodes. The canvas-first editor uses explicit Back -> Front Layers with subtree reorder/reparent, a compact searchable Use As control, responsive Inspector placement, and an optional Game Reference tray whose imports are always explicit. Named List contexts and actor bindings drive actor identity, profile, resources, EXP, parameters, equipment, states, inventory, Options, and save data. Seven stable generated baselines remain Custom/unbound until a project opts into an exact role-safe replacement; invalid records fall back to stock. Item, Skill, Equip, Shop, Formation, Name Input/message inputs, and Battle remain stock until dedicated workflow adapters exist. A standalone RPG Maker MZ plugin is not shipped and is explicitly deferred; custom interfaces currently run through RPG Reactor. See the [design](docs/DESIGN-USER-INTERFACES.md) for behavior and boundaries.
- **MZ + MV plugin compatibility**: complementary MZ and MV compatibility layers let existing RPG Maker plugins run unmodified on the new runtime, including mixing plugins from both engines in a single project. Stock MV/YEP LZString saves, MOG interfaces, video parallaxes, and custom local/browser save keys are supported. Validated against a large commercial MV game running a 168-plugin stack (Yanfly, Victor Engine, MOG, SRD, and the LeTBS tactical battle system), and against a commercial MZ project running 143 active plugins including 41 VisuStella ones, an event-driven title scene, and third-party tilemap and billboard plugins that add layers of their own.
- **Resilient resource loading**: the runtime watchdogs every database, image, and audio load from its own frame tick. Silently-dying requests (slow disks, cloud-synced folders) retry automatically, and genuinely missing files degrade gracefully with a clear console error instead of hanging the game on a black screen. Converted image consumers can load PNG, JPG/JPEG, WebP, safe SVG, or GIF; explicit modern extensions are preserved, extensionless RPG Maker names still resolve as PNG, legacy `<name>.<ext>.png` fallbacks remain readable, encrypted MIME types stay correct, and animated GIF textures refresh while visible. Format-sensitive tilesets, plugin-parameter image fields, database actor/list thumbnails, Reactor UI character/face/party-face/System/Title/Icon sources, balloon sheets, and other fixed system sheets such as IconSet retain their PNG-oriented contracts.
- **The Forge, in-editor asset generators**:
  - **Animation Generator**: 76 procedural 2D animations across four categories, including Portal, with layered composition, per-layer keyframe timelines, a 3D shape pipeline, custom textures, and export to bake-ready sprite sheets or animated GIFs.
  - **Effekseer Animation Generator**: create native Effekseer particle effects (`.efkefc`) from 106 recipes across nine categories without the external Effekseer editor: 21 sci-fi interface instruments with user-typed text, physical battle hits, 15 energy recipes, elements, a custom-effect Composer, and more; wireframe or solid-textured rendering with custom texture upload; layers, keyframes with texture cross-fades, live in-editor preview through the game's own Effekseer runtime, and one-click export. The tracked suite validates generated format/model round trips, every recipe at default/extreme/swept values, composition, and real-WASM playback.
  - **Character Generator**: bundled Psychronic and Looseleaf styles plus procedural Outfit Forge and Hair Forge tools that generate RPG Maker-style walking-sheet parts, with live 4-direction walk previews, multiple hair styles, palette systems, and save-to-library output. Psychronic remains the default style.
  - **Sound Effect Generator**: procedural sfxr-style sound design on Web Audio, baked to 16-bit WAV in the project's `audio/se/`. 29 archetypes across RPG SFX and tuned instruments, six waveforms including a physically modelled Karplus-Strong pluck, 27 parameters, live waveform/envelope/pitch visualizers, and a 16-step sequencer for jingles and stingers.
- **Build & deploy**: one-click isolated playtests; cross-platform game packaging for Windows, macOS, Linux, and Web; optional Linux AppImages for games and the editor; configurable NW.js releases and runtime locales; optional staged PNG/OGG optimization; and an editor distribution builder with SHA-256 checksums. Eligible full desktop packages default to an exact-NW.js-version H.264/AAC codec overlay verified by a trusted archive hash plus extracted-binary validation; users can disable it, and Web/Minimal packages never include it. Every overlay carries machine-readable provenance, recorded archive/binary hashes, the complete LGPL text, corresponding-source/build references, and a patent notice.
- **Source-audited 18-language localization** across editor-generated interface text, with locale-key and placeholder validation, Arabic right-to-left direction, and project-authored game content deliberately left untouched; plus a theme system with multiple color palettes in light and dark modes.

## What's New in 0.98.3

The full list for this release cycle is in the [changelog](CHANGELOG.md).

- **Models rig inside the editor.** The Database 3D section fits a skeleton to any static model with draggable joint markers — Humanoid, Quadruped, Plant/Tree, and Vehicle templates — computes skin weights on the spot, and every bone becomes a poseable part. A plug-and-play motion library (walks, runs, jumps, swims, melee swings, held aiming stances and more) drops editable animation rules onto any rigged model, and on-demand poses can carry keyframe timelines.
- **Anything in the database can be 3D.** Actors bind a model per surface — map character, face portrait, and side-view battler each independently 2D or 3D — while enemies render as live 3D battlers in battle and weapons, armor, and items carry bindings of their own. Everything lives in `data/Database.r3d.json` beside the MZ files, so RPG Maker tooling never sees an unfamiliar field.
- **A GLB's baked animation clips just work.** Embedded clips are listed, playable, and adoptable as ordinary animations with a speed control; a skinning fix makes Meshy- and Mixamo-style centimetre-rigged exports play undistorted; and models exported facing forward need no facing marks at all.
- **The 3D library organizes into folders.** `3d/Weapons/long-sword/…` nests freely, model lists show collapsible folders, and every path stays traversal-safe.
- **Models load fast and play smooth.** Everything a map references preloads behind the loading fade with shaders and textures warmed before the first frame, GLB parsing and texture decoding run in a background worker (editor previews included), and rig weights moved out of `model.json` into a compact binary sidecar.
- **Audio can ship as MP3, WAV, or FLAC — not just OGG** — with per-format loop tags and album art, every audio picker rebuilt in the Audio Player's interface, and deployment compressing all formats through one checkbox and quality choice.
- **System sounds can use multiple takes** — every Cursor, OK, damage, shop, item, skill, and other stock slot can choose uniformly from an authored pool and optionally randomize pitch within a 50-150% range, while retaining the primary sound as the stock-runtime fallback.
- **Play BGM/BGS/ME/SE commands use the full current audio browser** — cover art, recursive folders, search, thumbnails, seek/transport controls, volume/pitch/pan preview, and native loop points are consistent across map, Common, Troop, and plugin-command audio surfaces.
- **Editor quality-of-life.** Class curves author the full 1–999 level range, an app-wide modal and responsiveness pass, event editor polish, image pickers gained a (None) choice, deploy dialogs follow the editor language, and the map grid stays complete at every zoom.
- **PixiJS updated to 8.20** across the editor and runtime, verified against plugin-heavy MV-compat projects.

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

GitHub Actions runs the same suite from a clean checkout, including syntax, project scaffolding, runtime manifests, save safety, transactional Resource Manager model import, image-format validation, Video Surface runtime/editor/lifecycle behavior, reviewed localization precedence/routing and no-fallback checks, cross-instance clipboard transport, database and event-command serialization, map sampling and exact autotile placement, project lifecycle security, runtime compatibility, deployment, and release policy/signing gates. A separate GUI-smoke job drives the real Web editor through Chromium and the desktop editor through the pinned NW.js SDK, including save persistence across a browser reload. The current suite discovers **2,069 Node tests**, all passing on the committed tree (2026-08-29). A release commit must pass all 2,069. The real Chromium Web persistence and Linux NW.js launch/save smokes pass. The local NW.js UI-layout release gate also passes from 1280x720 through 2560x1440. Focused read-only NW.js screenshot checks cover the current State and Animation layouts at 1280x720 and 1600x900 in dark/light modes. Manual GIF animation, live 2D/3D Video Surface authoring/navigation, actor-preview performance, and final toolbar-icon checks remain outstanding; no full end-user playtest is claimed.

## Trusted Projects

Treat an RPG project like source code. Project plugins and project-local Character Generator JavaScript execute inside the Node-enabled desktop editor/runtime and can access the local machine. Only open or run projects and plugins from sources you trust; inspect downloaded project code before using it. The browser editor has a narrower host, but projects may still execute game/plugin JavaScript during playtest and interface capture.

## Bundled Demo Limitations

Reactor One is a starter and compatibility showcase, not a content-complete game. Original replacement art is still being authored for several actors and battlers, and 120 sound-effect names referenced by imported animations are intentionally absent. The maintained inventory is in [`docs/demo-missing-se.md`](docs/demo-missing-se.md); these gaps do not indicate missing editor/runtime files.

## Runtime

The `runtime/` folder contains the player-facing corescript (`reactor_*.js`) and runtime libraries. The editor copies this folder into newly created game projects under `js/`.

## License

RPG Reactor-owned code is licensed under the MIT License in [LICENSE](LICENSE).
Bundled third-party components remain under their respective licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No single license is asserted
for third-party files or user/project content.

## Cutting a Source Release

`cut-release.cjs` is the canonical source-release path. Run it from a clean
`main` worktree after all 0.98.4 changes have been committed:

```bash
node editor/build-scripts/cut-release.cjs 0.98.4 --dry-run
node editor/build-scripts/cut-release.cjs 0.98.4
```

The command runs the complete editor test suite, finalizes both changelog
headings with the release date, updates the package/README version surfaces and
test count, creates a release commit when those surfaces changed, creates an
annotated `v0.98.4` tag, and pushes the branch and tag. The tag push starts
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
