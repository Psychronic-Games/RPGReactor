# PR #65 integration — 2026-09-18

[PR #65](https://github.com/Psychronic-Games/RPGReactor/pull/65) "Feat/ash ember collapse" (Xehanort88, four commits) was merged on GitHub and brought into the local branch. It extends the Ash and Ember collapses from [PR #62](https://github.com/Psychronic-Games/RPGReactor/pull/62), which the local branch had built a 3D counterpart for the day before, so the overlap was checked deliberately.

## What it changes

- **Tunable spark layers.** Every spark constant the 2D emitter hardcoded moves into the preset: `sparkHot`/`sparkCool`, `sparkStops` (the blob's own gradient), `sparkLife`, `sparkDrift`, `sparkRise`, `sparkGravity`, `sparkSize`, `sparkFade`, `sparkPeak`, `emitOnRelease` and `emitWhileAging`.
- **Wisp** (Collapse Effect trait value 6, `wispCollapse` → `startParticleCollapse("wisp")`): the same emitter with different numbers — slower, larger, longer-lived green blobs peaking below full with no opaque core, so overlapping sparks accumulate into a glow.
- **`tintRamp`** replaces a fixed 22-frame walk to the preset's tint, so a short preset's shards no longer die before they finish colouring.
- **Teardown is linear.** `unhookParticleCollapseTextures` filters the texture source's listener array once instead of letting each of N textures rescan it, turning an N² cost on the frame a collapse ends (about 200 ms at 11,000 shards) into a single pass.

## Overlap with the local 3D dissolve

The PR touches none of the files the 3D dissolve lives in (`reactor_battle_room.js`, `reactor_battle_presentation.js`, `reactor_3d.js`), so the merge was clean. The interference was functional, not textual:

- `P.installRoomAnchors` routes a room battler's `startParticleCollapse(preset)` to `room.startDissolve(key, preset)`, and `BattleRoomView.DISSOLVE` knew only `ash` and `ember`. A 3D enemy set to **Wisp** would have fallen through `|| DISSOLVE.ash` and dissolved grey.
- The 3D spark layer had the same shortcoming the PR fixes in 2D: its colour was the literal `[1, .55, .25]` and its behaviour was derived from the shard numbers by fixed multipliers, so a Wisp preset could not have looked like one even with a tint.

Both were fixed here, mirroring the PR's design: each 3D preset carries an optional `spark` object (`count`, `colour`, and `life`/`size`/`buoyancy`/`curl` as multipliers on the shard numbers, plus `fade`, `peak` and `core`), the emitter reads it, and the fragment shader takes `uPeak` (the highest alpha one spark reaches) and `uCore` (the radius that stays at full strength). Ember keeps its old numbers exactly; Wisp sets `peak: .55` and `core: 0`, which is the accumulation trick the PR describes. A spark now shows its own colour rather than being tinted to the shard tint (`uTintStrength` is 0 for sparks), which is a no-op for Ember, whose two colours were the same orange.

## Verification

- Complete Node suite: **3,258 passed**, zero failures. The 3D dissolve test gained assertions that Wisp exists, is green, never saturates, has no opaque core, and outlives and outsizes Ember's sparks, and that Ash strikes none.
- **Live**, the Demo's Tank given each trait in turn and one hit point, frames captured from its death: Wisp is green, soft and still going at frame 56; **Ember re-captured after the spark refactor is unchanged from the day before** — orange, sharp, thinning by frame 56.
- Runtime revision **20260918.1**, all 13 bundled projects synced, `--check` clean.

Not pushed. No release, deployment or GitHub message was performed.
