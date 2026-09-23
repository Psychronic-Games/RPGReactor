# PR #67 integration — 2026-09-20

[PR #67](https://github.com/Psychronic-Games/RPGReactor/pull/67) (Xehanort88, one commit, already merged on GitHub) was merged into the local branch with `git merge --no-ff`. One conflict, in `editor/CHANGELOG.md`: the PR adds its entry at the top of Unreleased, where the local branch has the Added section for the day's build-mode work; the entry is under Fixed now, beside the state-icon entry from PR #66.

## What it changes

- **A group collapse of one enemy kind no longer freezes the game.** `Sprite_Enemy.unhookParticleCollapseTextures` used to write the surviving listeners (the battler's own sprite, the shards of any other enemy of the same kind collapsing beside it) straight back onto the shared, ImageManager-cached texture source before the shards' textures were destroyed; each of those destroys still called `off("resize")`, and EventEmitter3 rebuilt the survivors' array on every one, so six identical battlers at 8,400 shards each cost about three seconds on the frame the collapses ended. The survivors are held in a closure now, an empty array is left in the event's place (the first `off()` clears it, every later one returns at once), and `destroyParticleCollapse` restores them in a `finally`. The PR measured the same six at 9.9 ms, a lone collapse unchanged.

## Review

- The change is confined to the two teardown functions in `runtime/reactor_sprites.js`; the merge with the day's local edits to the same file (the cutaway's company list, in another region) was clean.
- The restore reads `source._events` afresh, since emptying an emitter's last event swaps that object; it re-counts the event only when it is absent, and stores a lone survivor bare. All three match EventEmitter3's storage.
- The PR ships no test. `editor/tests/particle-collapse-teardown.test.cjs` now drives the two functions (lifted from the sprites source into a vm) against an EventEmitter3-shaped source: two collapses of forty shards over one source plus the sprite's own listener; tearing one down rebuilds the array once, leaves the event gone while the shards go, and puts the sprite and the other collapse back with the count right; the last survivor comes back bare; a single shard or a missing source returns null; and the restore sits in a `finally`.
- The PR's copy of `template/Demo/js/reactor_sprites.js` was replaced by the sync from `runtime/`.

## Verification

- Complete Node suite after the merge and the runtime sync: **3,366 passed**, zero failures; the two new tests are in it.
- Runtime revision **20260920.24**, all 13 bundled projects synced, `--check` clean.

Not pushed. No release, deployment or GitHub message was performed.
