# Changelog

All notable changes to RPG Reactor will be documented in this file.

This root changelog summarizes public release progress for GitHub; larger releases group their fixes by theme. The detailed editor changelog lives at [`editor/CHANGELOG.md`](editor/CHANGELOG.md).

## [Unreleased - 0.95.0]

Draft cycle overview: [RPG Reactor 0.95.0: A More Complete Editor](docs/devlogs/2026-07-18-rpg-reactor-0.95.0.md).

0.94.9 was an internal development version and was never published; its changes ship in 0.95.0.

### Added

- Localization now covers statically routed editor text across all 18 supported languages. A generated deep catalog fills database, event-command, Forge, build, project, and web-host surfaces; source-audit tests enforce locale parity, consumed Terms schemas, interpolation placeholders, and Arabic right-to-left document direction without translating project-authored game content.
- Control Variables now presents Game Data through an RPG Maker-style nested selector instead of raw numeric IDs. Items, weapons, armors, and actors use database names; actor, enemy, character, party, Other, and Last Action Data operands expose their stock property choices; the parent command displays a readable summary; and Cancel/Escape remain transactional. Last Action Data and Troop battleback layer labels are translated across every supported language with explicit no-fallback tests.
- Added reproducible release-candidate and publication workflows for Linux x64, Windows x64, Intel macOS, and Web. Public builds pin NW.js 0.107.0 to trusted SHA-256 values, package the tracked Reactor One Demo starter, bind artifacts to their source commit and hashes, require native signing/notarization for publishable Windows/macOS candidates, and publish the inspected candidate bytes to GitHub and optional itch.io channels without rebuilding.
- Security and project lifecycle hardening escapes project-authored content on privileged editor surfaces, rejects unsafe/non-empty project destinations, uses token-owned exclusive project locks, ignores stale asynchronous map loads, and strengthens atomic writes against temp-file collisions and symlink replacement.
- The Database uses nearly the full viewport and gives scrolling to its child panes. Types now presents Elements, Skill Types, Weapon Types, Armor Types, and Equipment Types together in a dense workspace with keyboard/pointer multiselect, Cut/Copy/Paste, custom context menus, ID-preserving bulk clear, Add, and confirmed Change Maximum controls. Terms presents Basic Statuses, Parameters, Commands, and grouped Messages in one compact workspace with native text clipboard menus. Both reflow in the Web editor.
- Multiple Reactor instances can exchange MZ-style authored data through one typed system/shared-file clipboard. Whole maps; single or multi-selected batches of Actors, Classes, Skills, Items, Weapons, Armors, Enemies, Troops, States, Animations, Common Events, and Tilesets; individual trait/effect rows; whole map events; event and troop pages; map/common/troop event-command blocks; movement-route commands; and Plugin Manager groups can be copied between two open projects. Database batch pastes overwrite consecutive destination slots while retaining each destination ID, list selection/scroll position survives refreshes, incompatible categories are rejected, and the newest shared payload wins over stale in-window clipboard state. Trait/effect references to elements, states, skills, types, equipment slots, and Common Events resolve by unique name in the target project; missing or duplicate targets reject the paste instead of retaining an unsafe source ID.
- Conditional Branch now edits every RPG Maker MZ condition type (0-13), including all Actor/Enemy subconditions, character direction, variable operands, equipped-item checks, button modes, and vehicles. Existing arrays remain byte-identical when unchanged, legacy Button arrays remain readable, and new edits serialize in canonical MZ form.
- Event commands now extend beyond the stock MV/MZ authoring surface without changing the project format. Control Variables can build arithmetic, trigonometric, random, bitwise, and min/max expressions; Common Event calls can use a variable ID or invoke a current-map event page; and Conditional Branch can test expanded keyboard states, mouse buttons/wheel, and pointer coordinates. Loop remains the direct stock Loop/Repeat Above structure. Portable forms remain ordinary stock event commands, while Reactor-generated scripts carry strict versioned metadata so only an exact unmodified command reopens in its structured editor.
- Picture commands now support direct or variable picture IDs, variable Move duration, One/Range/All erasure, initial or tweened angle, custom anchors, sine-wave offsets, and Overlay blending. Negative X/Y scale remains the picture-flipping workflow and now supports the full `-2000..2000` editor range, including Quick Setting preview. Dynamic scripts include stock MV/MZ fallbacks; Reactor-only visual state lives in the isolated `reactor_picture_extensions.js` runtime module, and Overlay safely renders as Normal when renderer back-buffer support is unavailable.
- Show Picture now includes RPG Maker-style Quick Setting placement. A responsive grid marks the project's configured screen resolution inside a larger off-screen workspace; the selected picture can be dragged through and beyond that workspace or positioned numerically across the full command range. The modal measures its controls and scales naturally with window/fullscreen dimensions while preserving the project's exact aspect ratio. Origin, X/Y, width/height scale, and opacity are editable in the modal, while the Quick Setting button shares the image row. Move Picture uses the same surface to animate from the latest preceding Show/Move state with live duration-frame entry and the command's easing; a picture with no preceding visible Show remains absent from the preview.
- Map editing now supports MV/MZ-style rectangular sampling: right-drag over the map to capture all four visual tile planes, shadows, and regions, then left-click or drag to stamp the copied patch. A translucent composite preview follows the cursor, reverse drags and map-edge clipping are supported, transparent source cells intentionally clear destination layers, and each placement stroke is one Undo action. Events remain separate, matching RPG Maker behavior.
- Holding Shift while painting A1-A4 autotiles with the Pencil, Rectangle, or Circle tool now places the selected shape exactly without reconnecting it or reshaping neighboring autotiles. Shift-drag remains map panning for other tile layers and tools.
- Map editing now has a persisted A1 autotile-animation preference, enabled by default and available from both File → Options and a compact synchronized checkbox in the map-info strip. Disabling it removes the editor ticker and holds water and waterfalls on their first frame without changing playtests or deployed games.
- Added stock-MV-compatible LZString runtime support and load-order validation for synchronous MV/YEP saves, plus regression coverage for desktop paths, browser keys, Unicode saves, and real `N4Ig...` save payloads from a large MV compatibility fixture.
- Added focused regressions for Unicode Tileset URLs and Audio Player sections, project lock/BOM/retry diagnostics, transactional Event-mode creation/editing, MV package repair, the PIXI 8 start/stop-before-init race, and the ES5 Filter compatibility source contract.
- Added recursive project-asset discovery across audio, animation sheets, Effekseer effects, characters, faces, battlers, tilesets, battlebacks, parallaxes, title images, and plugin file parameters. Pickers store extensionless forward-slash relative names, keep RPG Maker core assets to runtime-safe lowercase `.ogg`/`.png` files, preserve `$`/`!$` character-sheet classification inside subfolders, and resolve encoded preview URLs on desktop and Web hosts.
- Added live name/path search, Unicode grapheme section rails, sticky headers, and keyboard-selectable results to the shared image picker, event character picker, and Show Text face picker. This covers actor character/face/SV graphics, enemies, vehicles, animation sheets, event frames, and facesets; search is case/accent-insensitive and current event frame restoration is guarded against stale image loads.
- Added visual System 1 starting-position selection for the Player, Boat, Ship, and Airship by reusing the Transfer Player map canvas. Map/X/Y commit together only on OK, manual numeric fields remain available, nested map navigation and overlapping preview loads are guarded, and the Title Screen image chooser now uses the searchable Unicode browser with a side-by-side preview.
- Added searchable Plugin Help & Documentation with safe highlighted matches, active/total counts, wraparound previous/next controls, Enter/Shift+Enter and F3/Shift+F3 navigation, plus Plugin Manager-scoped Ctrl/Cmd+F. The main load-order list filters loaded plugins by name, description, or author, and the Add Plugin dialog filters available filenames. Remove Plugin and Save Changes now share a persistent bottom action bar, with Save on the right and available regardless of selection. Help search state is cleared when plugin/project details reload and cannot steal shortcuts from nested parameter dialogs.
- Reworked complex Plugin Parameters around RPG Maker's metadata model: every independent `/*~struct~Name: ... */` block is parsed, nested struct and simple arrays use named list rows instead of numbered JSON dumps, notes use multiline fields, groups and controls align on stable grids, and nested editors reuse the correct plugin schema. Rows support buttons, double-click editing, and direct full-row drag-and-drop reordering with insertion feedback; alternating surfaces and neutral group headers follow the active theme. Element dialogs use an explicit OK action. Schema-guided decoding preserves JSON-looking string leaves; Cancel and Structure/Text switching are transactional; serialization restores RPG Maker's nested JSON strings. Verified against a real nested `YEP_OptionsCore` fixture with an exact byte-for-byte round trip.

### Changed

- Bundled Forge content includes Psychronic and Looseleaf Character Generator styles, with Psychronic as the default. Project JavaScript and PNG styles remain available and load automatically. Portal is available in both animation generators; the registries contain 76 Animation Generator recipes and 106 Effekseer recipes (Energy: 15).
- Bumped RPG Reactor to version 0.95.0.
- System 2 Magic Skills is now an ordered, fillable list of Skill Type IDs, matching MZ's data model and side-view casting behavior instead of presenting independent checkboxes.
- Tightened the Troops and Animations database workspaces for lower-resolution screens. Troops places its runtime-aligned Battle Preview on the left and stacks Battle Test, Members, Battleback, and Note in a compact right sidebar that collapses below the preview on narrow web layouts; Battle Events remains full-width below. Enemy homes, bottom anchors, battle-field offsets, battlebacks, and dragging match runtime screen/UI-area geometry across MZ, converted MV, and widescreen projects. Battle Test equipment follows actor-plus-class equip permissions, omits empty incompatible slots, preserves only actionable stale entries, and leaves scrollbar spacing. The Conditions dialog uses aligned rows with contrasted modal chrome. Animations uses side-by-side sprite properties, a shorter sheet strip, bounded summary/preview surfaces, narrower frame/effect controls, and local scrolling where needed while preserving 960x540 preview data and accurate scaled pointer editing.
- Troop Members now uses the shared searchable Unicode-indexed picker with a battler preview for both Add and Replace. Member rows expose their troop and database numbers, open Replace by double-click or Enter, and support focused Cut/Copy/Paste/Delete shortcuts plus matching right-click actions.

### Fixed

- Editor deployment: ordinary interactive builds no longer apply the immutable public-release hash policy to Latest Stable or user-selected NW.js versions. Windows editor SDK packages can cross-build from Linux without invoking `resedit`'s unsupported ESM loader inside an NW.js worker; app-owned Windows version metadata remains mandatory in the Node-based release pipeline.
- Editor: the File → Options Palette picker no longer falls back to English names and descriptions in Traditional/Simplified Chinese, Russian, Portuguese, German, French, and Greek. Theme choices and the new autotile preference are localized across all 18 supported languages, with regression coverage for every palette description.
- Editor: after selecting an enemy in the Troop preview, Delete now removes that member instead of clearing the entire Troop database entry. The preview owns keyboard focus and consumes Delete even when no member is selected.
- Editor: expanded Plugin Help no longer compresses the Parameters area below the visible detail pane. Documentation remains independently scrollable, can be resized vertically from its lower-right grip like Notes fields, and the overall plugin detail pane scrolls through metadata, help, and every parameter. Help-search navigation uses contrasted theme-aware buttons, while the surrounding search card stays neutral and only the focused text field receives an accent highlight.
- Editor: Actor equipment no longer renders every named global Equipment Type as an unusable row. Actor and Battle Test equipment now treat explicit class slot lists as authoritative, independent of their source, and otherwise use standard engine slots plus actor/class item permissions. Slots without an actor/class-permitted weapon or armor are hidden unless they contain relevant stale data; sparse Weapon/Armor/Equipment Type lists also retain their real IDs when authoring equip traits.
- Runtime: converted MV projects using YEP Save Core load their existing `.rpgsave` files again. The PIXI 8 runtime had retained the LZString fallback code but stopped shipping/loading the decoder, so compressed text reached `JsonEx.parse` unchanged. Reactor now reads and writes stock MV-compatible payloads and honors MV/YEP `localFileDirectoryPath`, `localFilePath`, and `webStorageKey` contracts.
- Runtime: side-view actors in a large MV compatibility fixture now use the same final Victor Engine damage-popup path as enemies. MOG BattleHud had captured the pre-Victor popup method on `Sprite_Actor`, causing actor TP/state/custom popups and some combined results to be consumed without rendering; post-plugin compatibility now delegates dynamically while preserving MOG's front-view face behavior.
- Runtime: MOG Treasure Popup labels and inline icons no longer lose their right and lower portions to MZ's `_clientArea` clip; only that plugin's intentionally full-size contents sprite is restored to MV parentage. Legacy video parallaxes can parent children on PIXI 8 `TilingSprite` without deprecation warnings, and intentional empty-source video teardown no longer logs a false media failure while real missing-video errors remain visible.
- Editor/runtime: Database Change Maximum now displays and enforces workload-aware ceilings instead of accepting values such as 99,999 and synchronously allocating every slot. Reactor retains MZ's 9,999 major-record/Common Event and 1,000 Animation/Tileset capacities; large databases remain one continuous list, rendering the first 250 rows immediately and appending later batches near the bottom. Cancel baselines use compact JSON instead of a duplicate live object graph, and growth reuses one template serialization. Reactor extends Actors to level 999 with finite class-stat extrapolation, raises Skill/Item and Attack Times repeats to 100 with a runtime backstop, supports 2,000 maps across IDs through 9,999, and raises every System Type ceiling above 99. Constant-time numeric fields such as price, costs, speed, success, gain, and variance are no longer clamped merely to match MZ's editor.
- Editor: pasted maps now appear immediately after the currently selected map as its next sibling, preserving that map's hierarchy level and shifting later siblings in place instead of appending every paste to the bottom of the root map list.
- Editor: successful Save All while the Database remains open refreshes the Cancel baseline, so Cancel returns to the latest saved state instead of data from before that save.
- Editor: Tileset A-E previews no longer disappear when the map renderer has not initialized or when project/image paths contain Unicode, spaces, or URL-significant characters. The compact editor now retains its dynamic project context and routes every Tileset image through encoded native/web asset URLs.
- Editor: the Audio Player's left-hand filename index is Unicode-aware. Accented Latin, Greek, Cyrillic, Chinese, Japanese, Korean, and other letter initials receive their own visible sections instead of all falling under `#`; canonically equivalent accents share a section, while numeric and punctuation prefixes remain grouped under `#`.
- Editor: opening a project that is already locked by another Reactor instance now stops after the specific lock warning instead of incorrectly following it with an “invalid project” prompt. Actual project-load failures retry brief partial/locked JSON reads, accept UTF-8 BOMs used by some localized tools, report the failing file/reason, and read controller-owned `MapInfos.json` only once per open.
- Editor: Event Editor sessions now use isolated drafts. Double-clicking an empty in-bounds tile opens a detached default event; Apply or OK inserts it and records one Undo snapshot, while Cancel, X, or backdrop dismissal leaves the map unchanged. Existing-event Apply commits once and refreshes the Cancel baseline, OK commits and closes, and no-op Apply creates no Undo entry.
- Editor: map events visible on the canvas no longer disappear from the left Events list when an imported or third-party map stores a real event at array index 0 instead of RPG Maker's conventional leading null. The sidebar and sprite renderer now use the same truthy-event rule, sparse high IDs remain visible, malformed graphics cannot abort list construction, and creation/deletion safely handles compacted or ID-mismatched arrays.
- Editor: imported MV projects whose existing `package.json` has a missing, non-string, or blank `name` or `main` no longer fail playtest with NW.js's “Required value 'name' is missing or invalid.” Runtime installation and desktop playtest now repair only those launch-critical fields while preserving custom MV window and JavaScript settings; malformed/non-object package files stop before conversion or process launch with the exact path and parse reason.

- Editor: preview surfaces no longer leak browser-capped resources across a long session. Chromium caps live WebGL contexts (~16) and AudioContexts (~6) per page: the animation picker, the Animations database page, and its effect-file picker each created a fresh WebGL + Effekseer context per open and never released it (eventually blanking every 3D preview in the editor), and the System audio picker leaked an AudioContext per open (eventually silencing audio previews). All of them now release their contexts on close. The Animations page also removed none of its document-level keyboard/drag handlers when switching animations — the leaked keyboard handlers kept applying Ctrl+V/Delete shortcuts to previously viewed animations' data — and the actor and event-page character walk previews leaked an animation timer per view, pinning their preview frames in memory forever. The Effekseer Forge's window-level drag handlers similarly retained every discarded preview canvas across remounts.
- Editor: editing an If or Show Choices that contains nested branch structures no longer corrupts the event — the rebuild treated any nested End marker as its own, removing the wrong command range and orphaning markers. Empty branches keep their place so later bodies can't shift into the wrong branch, the cancel-branch body stays bound to the Cancel branch when choices are added or removed, and edited structures keep their indent when nested inside other branches (they were re-inserted at indent 0, which breaks branch routing at runtime). Editing an If also no longer silently adds an Else branch — a new "Create Else Branch" checkbox mirrors the edited command, like MZ. Applies to both the map event editor and the common-events editor, and copy/cut/delete of nested choice structures now selects the correct range.

- Editor: whole-map paint bucket fills apply in a fraction of a second instead of 30-40 seconds — huge tile-update batches now route through the streaming full re-render (which preserves the scroll position) instead of 100k+ incremental sprite updates, and the water-animation bookkeeping in batch updates is no longer quadratic. Undo and redo also keep the current scroll position instead of jumping back to the map origin.

### Fixed — deep audit (editor)

- Critical project writes use randomly named, exclusively created no-follow temporary files, preserve destination permissions, flush file contents before rename, flush the parent directory where supported, and clean failed temporary files. A crash, kill, full disk, stale temp name, or symlink collision can no longer destroy the previous good `project.rpgreactor`, `MapInfos.json`, map, database, or plugin-manifest file.
- Deploying a game saves the project first, like playtest does — builds no longer silently ship whatever was last on disk.
- Editing autotile passability/ladder/counter/terrain flags in the Tileset database works — edits landed on the wrong flag slots (shape slots of the first autotile), so they never took effect in game; they now index by kind and mirror across all 48 shapes like MZ.
- Class parameter curves generate against the right levels (values were shifted one level low, with Lv1 written into an unread slot), enemy action HP/MP conditions survive editing (fractions were truncated to 0 on every OK), and Attack Element traits store the correct element (they were off by one).
- Database Cancel actually reverts everything since the database was opened — switching categories used to re-baseline the snapshot, silently keeping (and later saving) "cancelled" edits.
- Show Choices, If/Else, and inserted/pasted commands get correct MZ indents — branches authored in Reactor previously misrouted at runtime (choice bodies skipped, Else running alongside Then); deleting an If/Loop/Battle header now removes its whole block instead of leaving markers that could loop the interpreter.
- Change Gold wrote its parameters in the wrong order (gaining a variable-amount of gold gave 0), and editing a variable-designated Transfer Player no longer rewrites it into a direct transfer to raw variable IDs.
- Mouse-wheel zoom no longer compounds with every map loaded in the session, middle-mouse/Shift+drag panning works (it was dead code), the region overlay survives map switches, the eraser on the Regions tab erases regions instead of hidden map tiles, and drag-reordering a map "before" a sibling actually reorders it.
- Animation Generator: saved keyframes are no longer wiped on every tool switch (the loader dropped them and the autosave made it permanent), Reset Layer resets the live keyframe instead of orphaning future edits, and a pending autosave can no longer write one project's layers into another.

### Fixed — deep audit (runtime)

- MZ battles show battlers again with the MV-plugin battle-field compatibility active — the early-created battle field rendered UNDER the battlebacks (verified by booting into a battle: field index 1 vs battlebacks 3-4; now above, matching MZ).
- Two unbounded texture leaks fixed: every sprite frame change (walk cycles, blinking pause signs) and every map transfer's tile batch stranded PIXI v8 textures on session-lived texture sources forever; long play sessions now hold steady.
- Balloon cleanup runs again on scene teardown (a duplicate destroy override dropped it), fixing a permanent event soft-lock when a scene change interrupts a balloon wait.
- Event-vs-event collision uses the MZ rule (only normal-priority events block); MV games keep the MV rule via the compat layer.
- Move-route/animation/balloon waits survive save/load in MZ games using MV plugins (a live character reference was being serialized into saves; the loaded clone froze the wait forever), and encrypted MV games detect their encryption again (the flags were captured before encryption info loaded).
- The v8 geometry shim no longer corrupts vertex data on PIXI v5/v6/v7, destroyed audio buffers are no longer re-downloaded ~10s later by the load watchdog, and per-frame sprite refreshes stopped allocating on the unchanged path.

### Fixed — audit backlog cleared

Every remaining Medium and Low finding from the 2026-07-13 deep audit is fixed in this cycle:

- Editor data integrity: audio command editors no longer commit their edits when you press Cancel; Battle Test keeps its preview battlebacks in the Test_ data instead of writing them into the real System.json; removing an interior Element/Skill/Weapon/Armor/Equipment type blanks the entry instead of renumbering every later type reference (the trailing entry still truly removes); clearing an actor's Initial/Max Level or class field no longer writes null into Actors.json; the picture and animation-cell editors preserve legitimate zero opacity/scale values; Show Text keeps interior blank lines; Show Choices remaps its Default/Cancel references when blank choices are filtered out; System 2 Advanced edits work on MV-era projects that have no advanced block; and names, notes, and messages containing quotes, ampersands, or angle brackets survive database editing round-trips (one shared attribute-safe escaper across all database editors — the previous div-based escaping never escaped quotes inside attributes).
- Editor reliability and speed: deleting a map persists MapInfos.json before unlinking the map files, so a failed save can no longer leave phantom entries pointing at deleted maps; the maps sidebar builds its tree in one pass instead of scanning the whole map list per node; saving the database writes System.json once per batch instead of after every single file; the plugin manager no longer writes a manifest (and pops an alert) just from being opened on a manifest-less project, caches plugin metadata by file mtime instead of re-reading and regex-parsing every plugin source on each open, and keeps full @help text out of the boot manifest; palette transparency detection works again, so selecting a transparent B–E tile arms the eraser instead of painting invisible blockers; merged-A palette drags clamp to the sub-layer they started in instead of building out-of-range tile IDs; A1 hover previews show the correct art for kinds 4–7; autotile-graphic event thumbnails render under PIXI v8 instead of blank; opening map properties survives a corrupt map file; playtest survives a failing map-reference repair; and the audio player no longer stacks a scroll listener per tab switch.
- Editor performance: clicking a command in the event editor restyles the selection in place instead of rebuilding the entire list DOM (and re-decoding face thumbnails — those are now cached per face sheet, and the command-name table is built once instead of per row); dragging an event moves its one sprite per tile step instead of rebuilding every event sprite (which also leaked a label texture per rebuild) and no longer resets the sidebar scroll; the Character Generator composes its 12-cell walk sheet once per part change instead of re-rendering all 12 cells on every 170ms animation tick; and Outfit Forge part thumbnails are memoized by spec, so a control change re-renders one thumbnail instead of running the full 12-frame engine ~20 times.
- Forge tools: Outfit/Hair Forge desktop saves land in the project's forge library (they wrote into the editor install tree — lost on packaged installs); direct-to-project part and effect saves ask before overwriting an existing file; the Animation Generator's save dialogs recover from cancel (the GIF button no longer sticks on "Saving…", hidden file inputs no longer orphan); and Character Generator sheet saves fall back to a browser download instead of crashing when no project is open.
- Runtime: the MV-compat battler animation mirror queue stays out of save files and is bounded — saves no longer grow with every battle animation ever played; Window_Command.refresh recreates its contents bitmap only when the window actually changed size (it churned a fresh canvas + texture on every refresh in MZ games); the data-load watchdog can no longer double-fire a live-but-slow download (a generation guard drops superseded arrivals and download progress pushes the stall deadline forward); Ultra Mode 7's v8 renderer reuses scratch uniform buffers instead of allocating ~7 typed arrays per layer per frame; and the texture-compat shim is memoized per texture source instead of building a fresh proxy object on every access. Verified by booting the MZ demo and the 168-plugin MV game to their title scenes on the updated runtime with clean consoles.

The original deferred findings and their resolutions are preserved in [docs/AUDIT-BACKLOG-2026-07-13.md](docs/AUDIT-BACKLOG-2026-07-13.md); all are fixed.

Current 0.95.0 validation: **350 passing tests and no failures**.

## [0.94.8] - 2026-07-13

Release overview: [RPG Reactor 0.94.8: Big Maps Without the Wait](docs/devlogs/2026-07-13-rpg-reactor-0.94.8.md).

### Changed

- Bumped RPG Reactor to version 0.94.8.

### Fixed

- Editor: large maps load and edit much faster — a 256×256 compatibility-project map now fully loads in ~2.5s instead of ~10s, and the editor runs at full frame rate afterwards instead of stuttering on maps with water. Off-viewport tiles now stream into detached containers (the growing half-loaded map was re-rendered every frame while loading, which is where the time went), and animated water tiles moved to small dedicated overlay layers so the big static layers can always be cached as textures.
- Editor: repainting shadows no longer stacks invisible duplicate shadow sprites that darkened the quadrants slightly with every paint.
- Editor: animation previews (the Animations database page, the animation picker, and the event editor's picker) play smoothly — playback was paced by a timer that drifted and fired late whenever the editor was busy, reading as judder; it now steps at the exact MV 15fps cadence against the display clock.
- Editor: region painting no longer freezes on large maps — bucket-filling a region across a 256×256 map stalled ~5 seconds because the whole overlay (a fresh number label per cell) was rebuilt after every paint; region cells now share one texture per region ID and paints update only the touched cells.
- Editor: the rectangle and circle tools show a live region-color preview while dragging on the Regions tab (the circle tool previously showed no preview at all).

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

- Effekseer Animation Generator grew into a full composition tool: an Animation-Generator-style **layer system** (stack any animations into one exported .efkefc, with per-layer visibility, opacity, ordering and timing windows) and **keyframes**, parameter states pinned to chosen frames, compiled to native Effekseer curves (colors, size, spin) with **texture cross-fades** between keyframes; plus a master frame-count control, an AG-style layers panel, corrected solid-surface texturing with proper backface culling, and a broad recipe library. The format engine now reads Effekseer binary versions up to 1710.

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
