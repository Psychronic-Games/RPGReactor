# Current status

The verified state of the tree as of **2026-09-25**. This page states what is true now; dated engineering history is in [HANDOFF.md](HANDOFF.md) and [docs/archive](archive/README.md), and released behaviour is described in the [changelog](../CHANGELOG.md) and [release notes](posts/release-notes-0.98.7.md).

## Version and validation

- Latest release: **0.98.7**, tagged and published on GitHub on 2026-09-21. Signed binaries and the itch channels follow from the Actions tab (Release Candidate → Release). The 0.98.8 cycle is open: package, lockfile, about box, web host, runtime marker, both changelogs, READMEs and the release checklist name 0.98.8.
- Runtime revision: **20260926.3** (`runtime/reactor_main.js`, stated twice: the header comment drives the project updater, the global identifies a running game). All 14 bundled projects match `runtime/` (`node editor/build-scripts/sync-runtime.cjs --check`).
- Node suite: **3,781 tests pass** in this tree (`cd editor && npm test`, about 25 s). A fresh clone with `npm ci --ignore-scripts` reproduces CI and skips the tests that read gitignored projects (Star Shift Rebellion and the six older-engine games in `template/` the importer is measured on); last run in a fresh clone on 2026-09-21.
- CI (`.github/workflows/ci.yml`): syntax checks, the Node suite, dependency audit, patch hygiene, a clean-tree check, and a GUI job that runs the Web persistence smoke and five NW.js smokes (save, interaction order, keyboard, menus, event double-click) under xvfb with `--enable-unsafe-swiftshader`. Green as of 2026-09-21; it had been red from September 14 because the runner has no GPU.
- Public editor releases use NW.js **0.107.0** exactly; see the [release checklist](RELEASE-CHECKLIST.md).

## What is built

Each system has a guide; the guide is the authority on its behaviour and limits.

| System | Guide | Where the data lives |
| --- | --- | --- |
| 3D maps: pieces, shapes, blueprints, terrain, water, lights, models, events | [AUTHORING.md](AUTHORING.md) | `MapNNN.r3d.json` beside each map, `3d/Structures/*.json`, `img/materials/` |
| 3D design background (tileset classes, faces, phasing) | [DESIGN-3D-WORLDS.md](DESIGN-3D-WORLDS.md) | `Tileset3D.json`, tileset sidecars |
| Battle Rooms and Action Sequences | [BATTLE-PRESENTATION.md](BATTLE-PRESENTATION.md) | `data/ActionSequences.json`, `data/BattlePresentation.json` |
| Rigging a model, hands and held weapons | [RIGGING-MODELS.md](RIGGING-MODELS.md) | the model's `model.json` sidecar |
| Face points, speech and prop playback | [3D-FACE-AND-SPEECH.md](3D-FACE-AND-SPEECH.md) | model sidecars |
| Media surfaces | [MEDIA-SURFACES.md](MEDIA-SURFACES.md) | map sidecar, event commands |
| Importing RPG Maker 2000, 2003, XP, VX and VX Ace games; DynRPG commands as screen features; Ruby scripts as plugin ports | [IMPORTING-LEGACY-PROJECTS.md](IMPORTING-LEGACY-PROJECTS.md) | a new project per import with `import-report.json` and `legacy/Scripts`; `editor/src/legacy/` (ports in `plugins/`); `runtime/reactor_screen_fx.js` |
| Custom user interfaces | [DESIGN-USER-INTERFACES.md](DESIGN-USER-INTERFACES.md) | `data/UserInterfaces.json` |
| Runtime observation feed for plugins | [RUNTIME-EVENTS.md](RUNTIME-EVENTS.md) | `runtime/reactor_core.js` |
| Performance method and measurements | [PERFORMANCE.md](PERFORMANCE.md) | `editor/tests/perf/` |

## Runtime defaults that supersede older notes

- **3D rendering:** Three.js shares PIXI's WebGL context, with a canvas-copy fallback. World passes are capped at game resolution (`maxPassPixelRatio = 1`), use nearest sampling and no MSAA; every smoothing stage is off by default and stays off. Adaptive resolution is opt-in.
- **3D runtime layout:** `reactor_3d.js` is the core and names its extensions in `Reactor3D.EXTENSIONS`: `reactor_3d_world.js` (terrain, pieces, water), `reactor_3d_lighting.js`, `reactor_3d_models.js`, `reactor_3d_effects.js`, `reactor_3d_speech.js`. Editor frame loops wait for `extensionsLoaded()`.
- **Lighting:** the volume path lights surfaces from world position, distance and point/spot/beam/sun shape; it does not use surface normals or normal maps (normals on slopes are queued). A Sun light is map-wide with one set of long shadows. Map lights, compatible plugin lights and model light effects feed one light field.
- **Shadows:** two depth atlases hold static and moving casters (full quality 8 light rows and 3 dynamic rows at 512 px per face; weak quality 4 and 2 at 256). Rows are ranked on where a light stands with smoothing and dwell so still models keep their shadow. A light marked to cast can still lack a row. Battle rooms draw with their own renderer and shade battlers with a soft disc instead.
- **Walking inside a building:** under a roof, everything above the party's storey is cut away and sliced walls wear a top; a wall between the camera and any party member goes see-through; two walkable floors joined by stairs; the camera stays out of solids.
- **Model optimization:** both import presets can reduce geometry and both disable separate distance-level files; Optimize also handles existing GLBs and converts other formats to GLB with textures bundled. Authored LOD files remain supported.
- **Quests:** Reactor owns `data/ReactorQuests.json` and `$dataReactorQuests`; imports cover VisuStella, Yanfly and GS, and the older-engine importers turn Nicke's and CSCA's quests into Reactor quests; Database › Quests chooses Reactor's or VisuStella's quest log. A reward can give gold, an item, EXP or a common event, once, when the quest completes or by command; the tracked quest shows on the map (`Window_QuestTracker`, settings in `System.json` `reactorQuests.tracker`).
- **Custom interfaces:** twelve opt-in stock-scene replacements: Title, Main Menu, Status, Game End, Options, Save, Load, Items, Skills, Equipment, Shop and Name Input. Lists follow one another through contexts (category → items, slot → candidates), and a Text Input node edits a variable or an actor's name. A Battle HUD record dresses every battle the way MOG's battle HUD does (party panel with face reactions and ATB, placed stock battle windows, target cursor) while the battle's flow stays stock. The standalone MZ plugin is deferred.
- **Compatibility:** MZ and MV plugins run through complementary layers and can be mixed in one project. `Utils.RPGMAKER_NAME` reports "MZ" (plugins branch on it); Reactor's identity is `Utils.REACTOR_NAME`. A working scene or isolated battle does not establish compatibility for a whole game.
- **Imported games:** runtime rules only an import needs are switched on by data the importer writes, so MV and MZ projects never meet them: `$dataMap.rrImageLayers`, `$dataSystem.rrMultiFrames`, `rrBalloonSize`, `rrSkipTitle`, `rrTitleShutdown`, `rrNoItemBackgrounds`, `rrRgssWindows`, `rrMapNameStays`, `rrTouchUiOff`, `rrRgssKeys`, `rrRgssFades`, `rrPicturesEraseOnMapChange`, `rrSkipMissingAudio`, `rrSkipMissingImages`, `rrLegacyVariableLimit`, `rrLegacySaveScreen`, `rrLegacyPassage`, `rrLegacyEventOrder`, `rrCharacterShiftY`, `rrLegacyPageOpacity`, `rrLegacyParallax`, `rrGuardSkillId`, `advanced.fontSizeStep` / `rrNameBox` / `rrCodeLists` / `lineHeight` / `windowPadding` / `windowMargin` / `textOutlineWidth`, and the `\\RRFACE` message code. Everything else an old engine's scripts did is a plugin in the imported project (`js/plugins/RR_*.js`), visible in the Plugin Manager. The runtime decodes plain PCM WAV (8-bit included) itself when Chromium refuses it.
- **Web builds** carry a file index so filename casing is corrected in the browser; the desktop build reads the disk directly.

## Open work

Recorded on 2026-09-20 and 2026-09-21 unless dated otherwise.

- **World builder rough edges:** a thin line of floor slab shows between stacked windows; the Demo's stamped Manor and Hamlet predate the clean gables and turned window glass (2026-09-22) until re-stamped.
- **Next agreed builder work:** furniture pieces and room contents in plans; a spot/template picker in the panel; a hamlet-of-hamlets stress test; lighting normals on slopes; hip roofs.
- **Importer (2026-09-22):** all six older-engine games in `template/` import and boot (A Blurred Line 2000, DEEP 8 2003, Nocturne XP, Legionwood VX, The Seventh Warrior and DOTP VX Ace); every file still missing is absent from the game itself. Open: Dreamwalker (DOTP) is being brought to parity with the shipped game (2026-09-25: the title, opening, menus, shop and the battle's command phase match the shipped game; nearly all of its 177 scripts are ported; a frame-by-frame fight comparison is next, see HANDOFF), Nocturne's custom message and menu scripts (2,558 calls), side-view battle systems (Tankentai SBS in Legionwood) run as front view, Legionwood's monster book, credits and puzzle scenes, a screenshot check of the import dialog's new RTP row, and editor commands for the 2003 screen features.
- **Custom interfaces:** MOG's meter flow animation is not carried over; an interface opened by script over another open interface does not restore the one beneath when it closes (2026-09-26).
- **Demo content:** actors 1–5 play as 3D models and name no walking sheet or side-view battler; none of the five enemies has 2D battler art; original art is being authored. Every sound the Demo names exists on disk (`demo-template-completeness.test.cjs`). See [demo-missing-se.md](demo-missing-se.md).
- **Older threads, last recorded 2026-09-04 and not re-verified since:** sustained-playthrough shadow and caster-budget verification on integrated GPUs; the owner's reported fullscreen softness in the real launch path; Braver's full victory → transfer → autosave flow through the storage bridge; per-object light lists and generated distance levels as performance candidates.
- **Release gates that are manual:** native Windows/macOS signed-package launch checks and a complete game playthrough; see the [release checklist](RELEASE-CHECKLIST.md).

## Keeping this page current

Update behaviour and verification separately: a passing Node run does not clear a GUI gate, and a recorded GUI pass does not cover later renderer changes. Record the date, runtime revision and tested tree when reporting measurements. Put dated narrative in [HANDOFF.md](HANDOFF.md), not here; when a claim on this page stops being true, replace it rather than appending.
