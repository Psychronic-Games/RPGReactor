# Deep Audit Backlog — 2026-07-13

Findings from the seven-subsystem code audit that were **verified but deferred**
(needs dedicated rework, UX decisions, or more test coverage than a batch fix
allows). The ~25 highest-value verified findings were fixed the same day — see
the 0.95.0 changelog.

**Status: CLEARED in the 0.95.0 development cycle.** Every finding below is
resolved in the current cycle. See the
[root changelog](../CHANGELOG.md), the detailed
[editor changelog](../editor/CHANGELOG.md), the draft
[0.95.0 devlog](devlogs/2026-07-18-rpg-reactor-0.95.0.md). The original finding
language is preserved below as a historical record. Current validation is
350 passing Node tests with no failures; 0.95.0 has not been tagged or published.

## Disposition notes

- **Types editor:** interior entries now clear to an empty string rather than
  splice, preserving all later IDs. The resolved editor is a dense five-panel
  workspace with multiselect clipboard actions and an explicit maximum control
  for each type array; shrinking a maximum requires confirmation before the
  discarded tail is removed.
- **Conditional Branch follow-up:** the editor now implements all MZ condition
  types 0 through 13 and their subtypes, with exact unchanged-data round trips
  and canonical serialization for newly configured conditions. This extends
  the indent-aware nested-structure fix recorded below.
- **Database save baseline:** Save All forces a new database snapshot after a
  successful save, so Cancel in an already-open database returns to the saved
  state rather than the pre-save session baseline.

## Fixed since

- ~~EventCommandList `editCommand` corrupts nested branch structures~~ —
  fixed in the 0.95.0 cycle via an indent-aware structure parser
  (`EventCommandList.collectBranchStructure`) shared with the common-events
  editor, empty-branch placeholders, marker-keyed body re-attachment, indent
  rebasing of edited structures, indent-aware `expandSelection` for choice
  structures, and a "Create Else Branch" checkbox. Round-trip tests:
  `editor/tests/event-branch-editing.test.cjs`.

- ~~Preview resource leaks (contexts/timers/listeners)~~ — fixed in the
  0.95.0 cycle: `AnimationPickerModal` and `DatabaseAnimationEditor` (detail
  view + effect-file picker) release their effekseer contexts and force-lose
  their GL contexts; the System 1 audio picker closes its `AudioContext` on
  every close path; `DatabaseAnimationEditor` unhooks its document-level
  keydown/drag handlers via a per-detail-view cleanup registry (the leaked
  keydown handlers were also applying shortcuts to stale animations); the
  actor-detail and event-page walk-preview intervals self-stop on canvas
  detach; the Effekseer Forge removes its window-level orbit handlers and
  loses the discarded preview GL context on teardown. Wiring tests:
  `editor/tests/preview-resource-cleanup.test.cjs`.

## Medium (historical finding language; all fixed in 0.95.0)

The entries in this section intentionally retain their original present-tense
problem statements and proposed fixes. The cleared status and disposition
notes above describe the current cycle result.

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

## Low / Perf (historical finding language; all fixed in 0.95.0)

The entries in this section likewise preserve the original audit wording.

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

## Final validation

The current 0.95.0 development cycle completed its end-to-end Node test run
with **343 passing and 0 failures**. Relevant coverage includes
`database-navigation.test.cjs`, `event-branch-editing.test.cjs`,
`event-manager-interaction.test.cjs`, `i18n.test.cjs`,
`plugin-manager.test.cjs`, `system1-location-picker.test.cjs`, `system2-magic-skills.test.cjs`, `mv-save-compat.test.cjs`,
`mv-plugin-visual-compat.test.cjs`, `project-manager.test.cjs`,
`picker-index.test.cjs`, `recursive-asset-files.test.cjs`, `runtime-manifest.test.cjs`,
`runtime-snapshot.test.cjs`, and
`preview-resource-cleanup.test.cjs`.
