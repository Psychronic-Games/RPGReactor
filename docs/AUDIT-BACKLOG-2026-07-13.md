# Deep Audit Backlog — 2026-07-13

Findings from the seven-subsystem code audit that were **verified but deferred**
(needs dedicated rework, UX decisions, or more test coverage than a batch fix
allows). The ~25 highest-value verified findings were fixed the same day — see
the 0.94.9 changelog. Ordered by severity.

## High

- **EventCommandList `editCommand` corrupts nested branch structures.** The
  rebuild scan for Show Choices / Conditional Branch stops at the FIRST
  404/412 regardless of indent, so editing an If that contains a nested If
  (or choices containing choices) removes the wrong range and orphans/
  duplicates markers. Empty branches also shift bodies into the wrong branch
  on re-insert (no placeholder is pushed for an empty branch). Needs an
  indent-aware structure parser plus round-trip tests over nested fixtures.
  `editor/src/event/EventCommandList.js` (~3373 onward).

- **Preview resource leaks (contexts/timers/listeners).** Each of these
  accumulates per open/render until the browser caps them:
  - `AnimationPickerModal.open` builds a fresh WebGL + effekseer context per
    modal; never released (~16 opens exhaust the context cap).
  - `DatabaseSystem1Editor` audio picker: one `AudioContext` per session,
    never closed (~6 opens silence previews).
  - `DatabaseAnimationEditor`: document-level keydown/mouseup/mousemove per
    detail view; actor-detail `setInterval(animate, 125)` never cleared.
  - `EventPageEditor`: character-preview `setInterval` leaks per page render.
  - `EffekseerGenerator`: window-level mousemove/mouseup per mount retain the
    discarded 720×720 GL canvases.

## Medium

- **Audio command editor commits on Cancel** — it mutates the live command
  object (`this.command.parameters[0].volume = ...`) with no clone/revert.
  Clone on open, write back on OK. `editor/src/event/commands/AudioCommandEditor.js:143`.
- **Battle Test persists the troop editor's preview battlebacks into the real
  `System.json`** (outside the OK/Cancel snapshot, no undo).
  `editor/src/database/BattleTestConfigModal.js:457-495`. Needs a decision:
  pass via Test_ files or restore after write.
- **Types editor "Remove" splices mid-array system types** (elements, skill/
  weapon/armor types, equip slots), renumbering every downstream reference.
  MZ only ever renames or appends. Consider blanking instead of splicing.
  `editor/src/DatabaseEditorUI.js:2337`.
- **Unescaped `value="…"`/textarea interpolation across database editors**
  mangles names/notes containing `"`, `&`, or `</textarea>` on round-trip.
  Needs one shared attribute-safe escaper applied to ~12 files.
- **PluginManager round-trips full `@help` text into `reactor_plugins.js`**
  (manifest bloat parsed by every game boot); also re-reads and regex-parses
  every plugin source synchronously on each manager open (cache by mtime),
  and writes a file + alert just from OPENING the manager on a manifest-less
  project. `editor/src/PluginManager.js`.
- **Palette transparency detection is dead** — the palette checkerboard uses
  `var()` colors (Canvas 2D ignores them → black) and samples the composited
  canvas (alpha always 255), so auto-erase-on-transparent-tile never arms
  and painting a transparent B-E cell places invisible blockers.
  `editor/src/TilesetPaletteViewer.js:778-885`. Fix via ThemeColors.resolve +
  sampling the source sheet.
- **Merged-A palette drag across sub-layer boundaries** builds out-of-range
  tile IDs (A1 drag into A5 rows yields A4 ids). Clamp drags to the starting
  sub-layer. `editor/src/TilesetPaletteViewer.js:191/680`.
- **A1 hover preview kinds 4-7 show wrong art** — `renderAutotilePreviewToContainer`
  hard-codes block positions that belong to kinds 8-11 and skips the
  waterfall table; delete the special cases so the shared formula applies.
  `editor/src/MapEditor.js:1785-1792`.
- **`deleteMap` unlinks map files before `MapInfos.json` is saved** — a save
  failure leaves phantom map entries pointing at deleted files. Reorder.
  `editor/src/ProjectController.js:2469-2487`.
- **MV compat `Game_Battler.startAnimation` double-queues** into both the MZ
  request path and the MV `_animations` array; the array is serialized into
  saves and grows unboundedly unless an MV consumer drains it.
  `runtime/reactor_mv_compat.js:2664`.
- **Tier-1 `Window_Command.refresh` recreates contents bitmaps for MZ games**
  (MV-verbatim override; MZ never reallocated on refresh). Move to Tier 2 or
  gate on size change. `runtime/reactor_mv_compat.js:818`.
- **CharacterGenerator Outfit/Hair Forge desktop saves write into
  `process.cwd()/src/...`** (the editor install tree) instead of the project;
  lost on packaged installs, stranded when cwd differs. The loader already
  supports `<project>/forge/character_generator/styles/`. Also: forge/EFK
  direct-to-project saves overwrite existing assets without confirmation.

## Low / Perf

- `ProjectController.renderMapsList` is O(n²) with a spread-copy of the whole
  maps array per tree node; build a parentId→children map per render.
- `DatabaseManager.saveJSON` rewrites `System.json` (fresh versionId) after
  every non-system file — one guarded write at the end of `saveAllData`.
- `DataManager._checkStalledDataFiles` can double-fire a live XHR (no
  progress signal / generation counter) and surface a spurious fatal error.
- Event editor: whole-list DOM rebuild per click; per-row `commandNames`
  literal allocation; face `Image` re-decode per row. Event drag: full
  `renderEvents()` per tile step leaks PIXI.Text textures (removeChildren
  without destroy) and rebuilds/scroll-resets the sidebar.
- `pixi_compat` UltraMode7 v8 `renderLayer` allocates ~7 typed arrays per
  layer per frame (hoist constants, reuse scratch buffers); v8
  `Texture.baseTexture` getter shim builds a fresh object per access
  (memoize per TextureSource in a WeakMap).
- CG procedural preview recomposites all 12 cells + full template rescans per
  slider input and per 170ms walk tick (cache the composed sheet; memoize
  bbox/dims); Outfit Forge regenerates full 12-frame outfits for ~20
  thumbnails per control change (cache by spec, direction 0 only).
- Editor: `mapEditor` autotile-graphic event thumbnails still use PIXI v5
  APIs (`new PIXI.Texture(texture.baseTexture, rect)`) and render blank.
  `editor/src/EventManager.js:1862`.
- `ShowPictureEditor` uses `params[8] || 255` so legitimate opacity-0 /
  scale-0 round-trip wrong (MovePictureEditor does it right); Message editor
  drops interior blank 401 lines; ShowChoices blank-choice filtering doesn't
  remap `cancelType`/`defaultType`; actor `initialLevel/maxLevel/classId`
  write null from cleared inputs; animation cell opacity/scale 0 clobbered by
  `|| 255`/`|| 100`; System2 Advanced edits dropped when `system.advanced`
  absent; `DatabaseTilesetEditor.js` exports undefined `TilesetEditor`;
  playtest awaits `repairInvalidSystemMapReferences` with no catch;
  `editMap` parses map JSON with no try/catch; AudioPlayer stacks a scroll
  listener per tab switch; AG save-dialog cancel leaves the GIF button stuck
  on "Saving…" and orphans hidden inputs; CG sheet saves crash before the
  web download fallback when no project is open.
