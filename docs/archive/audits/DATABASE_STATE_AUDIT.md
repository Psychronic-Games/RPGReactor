# Database state audit — 2026-09-04

This follows the [event/database authoring audit](EDITOR_AUDIT.md), focusing on
operations that finish after their original record, section, or project changes.
Changes are confined to the editor; runtime revision remains **20260904.17**.

## Findings and fixes

The first live sequence run reproduced four failures: a delayed actor-trait
paste revived a cancelled draft; animation cleanup callbacks remained after
leaving Animations; interface drag listeners/observers remained after leaving
Interfaces; and closing Database retained the connected detail DOM.

Database detail transitions now invalidate pending work and release owned
previews, listeners, observers, and dialogs. The same boundary applies to
Cancel, project changes, list search, clearing entries, and undo. This also
stops 3D preview work immediately on leaving its section.

Additional sequence and code checks found and addressed:

- **Saving:** Database controls and navigation remain inert during OK/Apply.
  A previous project's save completion cannot close a new session, replace its
  Cancel baseline, or unlock a newer save. Existing failure/retry handling is
  retained.
- **Clipboard and commands:** delayed common-event/troop paste and cut results,
  and command-dialog results, check their original detail context before
  mutating retained records. Troop command dialogs also check the battle page.
- **Reused dialogs:** obsolete trait/effect dialogs cannot save into the next
  entry. Owned database dialogs close at detail boundaries; shared image/icon
  pickers and Change Maximum reject retired callbacks. Reference dialogs also
  remove their document keyboard listener. Animation cell/effect pickers and
  timing audio previews are also released on departure; reopening the effect
  picker releases the previous picker and its WebGL context.
- **Deferred controls:** troop, common-event, and tileset controls bind to their
  mounted detail immediately. Troop name changes persist on input. This avoids
  delayed setup finding a newly selected record through a global DOM ID.
- **Preview loads:** late troop battleback/enemy loads and tileset image loads
  cannot replace the next preview. Tileset tab loads reject obsolete requests,
  including multi-layer A tabs. Tileset image caches and tile dimensions follow
  the current project; troop windowskins do too.
- **3D caches:** model templates, thumbnails, and pending thumbnail promises
  are isolated across projects. An old completion cannot populate or delete a
  newer project's promise for an identically named model.
- **Effekseer:** uncaught-error capture exposed texture callbacks accessing a
  released WebGL context during rapid transitions. The local effect loader now
  guards the bundled library's update entry point after effect/context release;
  guarding only its final onLoad callback was too late. Preview resources still
  release promptly. The vendor library itself is unchanged.
- **Placeholder actions:** removed nonfunctional Select All items from the five
  single-row trait menus. Main database-list Select All remains available.

## Verification

The NW.js test uses a **disposable Demo copy and isolated profile**. It removes
only the copied project lock; the authored Demo and its live lock are preserved.

The checked-in [sequence results](2026-09-04-database-sequences.json) record
**405 passing checks and zero uncaught errors**:

- 361 ordered navigation pairs across all 19 database sections, including
  returning to the same section.
- 28 edit → leave → return and Cancel assertions across the 14 record-based
  sections: actors, classes, skills, items, weapons, armor, enemies, troops,
  states, animations, tilesets, common events, interfaces, and quests.
- An actual Apply file write, Apply → edit another section → Cancel, interface
  undo/redo after switching records, and cross-section Cancel: four checks.
- Twelve delayed-paste, preview-cleanup, retired-dialog, and close checks.

The new unit suite adds **14 focused regressions**, including save/project
races, stale command results, slow image loads, and late Effekseer callbacks.
The authoring smoke was also repeated successfully: all 123 picker items,
19 database sections, 56 nested dialog cases, and 32 menu/locale cases.
The full 14-theme matrix belongs to the preceding audit; this follow-up reused
its themed controls and did not repeat every palette.

Latest full suite: **2,643 passed, 3 failed, 2,646 total**, with no skipped,
cancelled, or TODO tests. The three existing `stock-interfaces.test.cjs` failures
assume the former Demo title layout; its authored resolution changed from
1280×720 to 1920×1080. Those content changes were retained.

Reproduce from the repository root (GUI smokes need a desktop display):

```sh
node --test editor/tests/database-session-sequences.test.cjs
node editor/tests/smoke/nw-database-state-sequences.cjs
RR_AUDIT_SKIP_THEMES=1 node editor/tests/smoke/nw-command-database-audit.cjs
cd editor
npm test
```

Local evidence: `/tmp/rr-database-sequences-UPOAz7` (final sequences and uncaught
errors), `/tmp/rr-command-database-audit-Hc0Duj` (repeat authoring audit), and
`/tmp/rr-db-state-audit-full.log` (full suite).

## Limits

The 361-pair matrix verifies navigation and rendered details; it does not edit
every field in every pair. Mutation, clipboard, modal, and delayed-load checks
cover representative workflows plus the identified failure paths. This is not
a proof that every possible combination of database values and operation order
is correct, or a complete gameplay/playtest of every authored command.

Model sidecar edits retain their existing immediate-save behavior; Database
Cancel does not roll those files back. This pass prevents stale context and
callback reuse, and does not introduce a new transaction format for model files.
