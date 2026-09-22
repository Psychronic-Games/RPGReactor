# Interaction-order audit — 2026-09-07

Follow-up to the [map and Database navigation fixes](UI-NAVIGATION-AUDIT-2026-09-07.md). This pass tests overlapping actions, rapid revisits, focus changes and asynchronous completions. It changes the editor and testing configuration for 0.98.6; runtime revision remains `20260907.3`.

## Confirmed findings

The native regression initially produced 12 failing cases across the following areas. Eight of the ten new automated tests also fail against the captured pre-fix source. All fixes below pass their regression cases.

| Trigger | Reproduced failure | Fix |
| --- | --- | --- |
| Actors → Classes immediately → edit class name | The actor's deferred field setup queried the shared detail container after it held the class form. Changing the class name also changed the actor name. | Bind setup to the particular form wrapper and stop if it has been detached. |
| Actor/Class A → B → A before timers finish | One field change called three handlers. A class EXP-curve click opened the dialog three times. | Deferred traits/curve setup queries its own section; retired sections cannot find a later form with the same record ID. |
| Repeated same-record detail refresh | Skill/item/weapon/armor/state previews were created three times in the final view. Internal refresh methods bypassed the parent cleanup that invalidates callbacks. | Route refreshes through the Database detail lifecycle, including actor/class/enemy refreshes. Explicit refresh remains supported. |
| Select commands → focus event settings or a nested picker → Delete/cut/paste | The event-command keyboard guard referenced an element ID that was never assigned. Commands could be deleted while interacting elsewhere. Ctrl+A also failed to repaint its selection. | Track the actual rendered list, give it focus on selection, respect consumed keys and editable controls, and preserve focus across command-list refreshes. Select All restyles the live rows. |
| Rapid arrow burst across entry 250 | Selection advanced to entry 256, but that row was not rendered or highlighted because scrolling had not had a chance to append the next batch. | Render through the selected index before attempting to reveal it. |
| Open tileset picker → change record → queued click on retired Select button | The old picker assigned its choice to the new current tileset. Database cleanup removed its overlay without removing its document key listener. | Reject disconnected/stale confirmation callbacks; let detail-modal registration invoke the picker's disposer, which also releases the listener. |

## Added testing

`editor/tests/interaction-order.test.cjs` contributes ten cases to `npm test`: detached form callbacks, keyboard scope and consumed events, normal command shortcuts and visual selection updates, and modal disposal/context invalidation. It supports `RR_INTERACTION_SOURCE_ROOT` for comparison against a source snapshot.

`editor/tests/smoke/nw-interaction-order.cjs` opens an isolated NW.js profile and a disposable Demo copy containing two flat 25×25 maps. It runs 47 checks, including:

- Immediate cross-section edits, rapid A/B/A revisits and repeated internal refreshes, checking writes and callback counts.
- A retired tileset confirmation and a valid current confirmation.
- A keyboard burst beyond the list's first rendering batch.
- Delete in page settings and a nested picker, plus normal command selection/Select All/Delete and focus after rebuilding.
- Real map loading held at asset acquisition, then completed after cancellation or in reverse request order; the editor and sidebar must retain the latest map.
- 120 seeded record-navigation actions in 24 bursts, interleaved with close/reopen, with the active view and unchanged database contents checked after each burst. Late callbacks must leave a closed detail empty.

Run from `editor`:

```bash
npm test
npm run smoke:nw-interactions -- --nw-root=/path/to/nwjs-sdk
RR_INTERACTION_SEED=20260907 npm run smoke:nw-interactions -- --nw-root=/path/to/nwjs-sdk
```

The default seed is `0x53a11` (342545). CI's `gui-smokes` job now runs this smoke using its existing pinned SDK and uploads `/tmp/rr-interaction-result.json` and `/tmp/rr-interaction-after.png`. JSON includes the seed and action trace. The npm entry point and SDK-path option were exercised locally; the changed GitHub workflow has not run remotely. Local verification used the desktop display, not CI's Xvfb display.

## Fresh verification

| Coverage | Result |
| --- | --- |
| Full automated suite | 2,997 pass, zero failed/skipped/cancelled |
| New native interaction audit | All 47 checks pass for seeds 342545, 1 and 20260907; no captured uncaught errors or unhandled rejections |
| Existing database sequence audit | 405 checks pass, including all 361 ordered section pairs across 19 sections, Cancel/Apply baselines, stale clipboard completions and modal/preview cleanup |
| Command and nested-dialog audit | 123 command entries, 19 Database sections, 56 nested dialogs and 32 menu cases pass |
| Earlier navigation regression | All 73 native checks still pass after the lifecycle changes |
| Syntax, documentation and CI checks | 1,075 JavaScript syntax checks, documentation/release-infrastructure tests and `git diff --check` pass |

The tests use DOM events in the real browser, controlled asynchronous gates, and repeatable action sequences. They do not simulate every physical input device or timing distribution. The seeded navigation covers 12 standard record sections; the broader ordered-pair audit covers 19 sections. This pass does not repeat the complete locale/theme matrix, platform packaging, Forge generators, every asset-import failure, or runtime game compatibility. No claim is made that every possible action ordering is covered.

## Evidence

- Before fixes: `/tmp/rr-interaction-before.log`, `/tmp/rr-interaction-expanded-before.log`, `/tmp/rr-interaction-unit-before.log`.
- Final automated suite: `/tmp/rr-interaction-full-final.log`.
- Native regression: `/tmp/rr-interaction-final.log`, `/tmp/rr-interaction-seed-1.json`, `/tmp/rr-interaction-seed-20260907.json`, `/tmp/rr-interaction-npm.log`.
- Broader audits: `/tmp/rr-interaction-database-sequences.log`, `/tmp/rr-database-sequences-tYeFsd/`, `/tmp/rr-interaction-nested.log`, `/tmp/rr-command-database-audit-7n2Pc5/`.
- Syntax checks: `/tmp/rr-interaction-syntax.log`.
- Earlier navigation regression and documentation/CI validation: `/tmp/rr-interaction-navigation.log`, `/tmp/rr-interaction-docs-ci.log`.
- Pre-fix source snapshot and working patch: path recorded in `/tmp/rr-interaction-backup-path`.

Changes remain local and uncommitted; earlier working changes are retained. Tests do not save the user's authored projects. No GitHub comments, push, release or deployment were performed.
