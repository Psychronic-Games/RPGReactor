# Map and Database navigation regressions — 2026-09-07

Investigated the reports in [GitHub issue #53](https://github.com/Psychronic-Games/RPGReactor/issues/53) in the native NW.js editor. Changes are part of the uncommitted 0.98.6 work, following PR #52 integration; runtime revision remains `20260907.3`.

## Reproduced causes and fixes

| Report | Cause and resulting behavior |
| --- | --- |
| Map drag jitter | Inserting a drop-indicator sibling moved the hovered row, repeatedly changing the drop zone. Feedback now uses inset row decoration without changing geometry. Self/descendant targets are rejected during hover and drop; crossing a row's label keeps feedback intact, and leaving/ending the drag clears it. |
| Cancelled map switch highlights another map | A document-wide tree click handler selected the clicked row before asynchronous map loading succeeded. Each tree now owns its selection; the sidebar highlights the loaded map. |
| Transfer Player picker has two highlighted maps | The same global handler mixed class-based selection with the picker's own highlight. Removing it and scoping sidebar searches/highlights keeps the trees independent. |
| Wheel zoom misses the cursor | 2D zoom calculated the correct anchor, then edge clamping moved it. Keep only the edge margin needed by the current zoom, use the same bounds for panning/scrollbars, and reset on map load. 3D previously changed camera distance around the screen centre; it now scales the orbit target about the pointed map surface, accounting for the camera's half-tile centring. |
| Picker arrows close the dialog | Keyboard focus could remain in Database, and picker navigation bubbled into its document-level list handler. Focus the picker on opening (search when empty), consume navigation keys, and ignore keyboard events outside the Database viewer. Shared image pickers cover character/face browsing as well as the tileset picker. |
| General fields shift during selection | Deferred icon setup widened the first grid column after the text fields were visible. Reserve its width immediately. |
| Rapid selection produces preview flicker | Old deferred setup could attach to a reopened record with the same ID. Skill/item/weapon/armor/state/enemy setup now checks the detail generation and project/data context before touching the view. |
| Repeated arrows at list boundaries flicker | The existing index clamp already prevented an out-of-range selection. The remaining boundary event still rebuilt the same view. Stop when the focused record is unchanged, and reuse the live detail on selection-only reselects. Explicit detail refreshes still rebuild normally. |

## Verification

- `cd editor && npm test`: **2,987 passed**, none failed/skipped/cancelled.
- `cd editor && node tests/smoke/nw-navigation-regressions.cjs`: **73 native checks passed**, no captured `error` or `unhandledrejection` events. Uses a disposable Demo copy, flat 25×25 maps, generated character/face assets and an isolated NW.js profile.
- Native checks exercise cancelled row/label clicks, illegal and valid drag feedback, label crossings and cleanup, Transfer Player selection, top/bottom boundaries and reselects across 12 standard database sections, General layout in six editors, rapid preview revisits, tileset/character/face picker arrows, bounded panning, scrollbar endpoints and map-switch reset.
- Eighteen interior and six edge 2D wheel cases measured zero world-coordinate drift. Twelve 3D wheel cases preserved projection to floating-point tolerance (largest normalized error below `6e-15`). Unit coverage also checks 2D contain-fit transitions and real Three.js projection using `Reactor3D.aimCamera`.
- General name-field geometry remains unchanged across deferred setup; rapid A → B → A selection leaves one icon preview. Before fixes, sampled General layouts shifted horizontally by about 53px, rapid revisits created duplicate previews, and edge zoom drift reached about 103 world pixels.
- 1,072 JavaScript files under `editor/src`, `editor/tests`, `editor/build-scripts` and `runtime` pass `node --check`. `git diff --check` passes. Native 1280×720 screenshot inspected.

Native checks dispatch browser DOM input events; they do not constitute an operating-system drag simulation or an exhaustive audit of every editor, locale, GPU, map surface or dialog. The fix removes the reproduced redraw/selection causes; switching to a different record still constructs its detail view. Cursor zoom over empty 3D space uses the current orbit plane when intersectable.

## Local evidence

- Initial reproductions: `/tmp/rr-navigation-before.log`, `/tmp/rr-navigation-rapid-before.log`.
- Final verification: `/tmp/rr-navigation-full.log`, `/tmp/rr-navigation-final.log`, `/tmp/rr-navigation-syntax.log`.
- Native output: `/tmp/rr-navigation-result.json`, `/tmp/rr-navigation-after.png`.
- Source snapshot before this report's changes: path recorded in `/tmp/rr-ui-reports-backup-path`.

No authored user project was opened or saved by these tests. No commit, push, release or GitHub issue comment was made for this task.
