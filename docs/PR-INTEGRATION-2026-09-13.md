# PR #57 and #58 integration — 2026-09-13

[PR #57](https://github.com/Psychronic-Games/RPGReactor/pull/57) "Let a skill or item hit a random number of times" and [PR #58](https://github.com/Psychronic-Games/RPGReactor/pull/58) "Stop reporting a state that addNewState turned away" / "Let a plugin hand an action its targets before startAction" were merged upstream onto `ab75fc9`. Local `main` held two unpushed commits (the September 11 closeout and the September 12 3D sequence work), so `origin/main` was merged in with a merge commit rather than a fast-forward. The editor remains 0.98.6.

## Integration

- **One conflict**, in `editor/src/I18nManager.js`: both sides appended translation blocks at the same point (local Database discard-confirmation and weapon-step strings; incoming Max Repeats label and hint). Both blocks are kept, local first.
- Everything else merged automatically: `editor/CHANGELOG.md`, `styles.css`, `index.html`, the Item and Skill editors, and the three runtime files (`reactor_objects.js`, `reactor_scenes.js`, `reactor_managers.js`) with their Demo copies.
- The PRs changed `runtime/` and `template/Demo/js/` only. The runtime revision is bumped to **20260913.1** and `sync-runtime.cjs` updated the other twelve bundled projects (49 files across 13 projects); `--check` is clean.
- The root `CHANGELOG.md` carries short entries for the three changes; `editor/CHANGELOG.md` keeps the contributor's full write-ups.
- No local code reads `item.repeats` directly outside the new `itemRepeats`, so the battle presentation's hit policy and the enemy forecast see the rolled count through `numRepeats` unchanged.

## Verification

- Complete Node suite after the merge: **3,130 passed**, zero failures, skips or cancellations (3,107 before, plus the PRs' 23 tests in `action-repeats`, `refused-state` and `planned-targets`).
- `node --check` on every merged runtime and editor file.

## PR #59, later the same day

[PR #59](https://github.com/Psychronic-Games/RPGReactor/pull/59) "Separate 'can this battler use the item' from 'is there any left'" was approved but not yet on `origin/main`, so its pull ref (`refs/pull/59/head`, `3fabc13`) was merged directly with a merge commit. It touches `runtime/reactor_objects.js` (new `Game_BattlerBase.hasItemStock`, called from `meetsItemConditions`), the Demo copy, `editor/CHANGELOG.md` and a new `item-stock-seam.test.cjs`. No conflicts. Runtime revision **20260913.3**, synced to all 13 projects.

Not pushed. No release, deployment or GitHub message was performed.
