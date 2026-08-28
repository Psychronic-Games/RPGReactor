# Deep Audit Backlog — 2026-07-25

Findings from the 0.96.0 file-by-file correctness audit that were **verified but
not acted on**, because acting on them is an authoring decision rather than a
code fix. Roughly forty verified code defects from the same audit were fixed in
the cycle — see the [root changelog](../CHANGELOG.md), the detailed
[editor changelog](../editor/CHANGELOG.md), and the draft
[0.96.0 devlog](devlogs/2026-07-25-rpg-reactor-0.96.0.md).

**Status: OPEN — awaiting a project-owner decision.** Nothing here blocked the
release: 0.96.0 was tagged and published on 2026-07-27 with these items still
open, and they carry forward through 0.98.3. Re-verified against the local
projects on 2026-08-24: all three items stand exactly as described. Validation
stood at 777 passing Node tests at the time of the audit; it is 1,785 as of the
0.98.4 cycle.

The projects named below are local compatibility-corpus copies under
`template/`, not tracked files; only `template/Demo` is in git.

## Authored data in the bundled projects

### Three animations exceed the engine's 16-cell frame limit

`template/Star Shift Freelancers/data/Animations.json` (formerly `template/Complex`)
ids **386** (`moonlight burn`), **387**
and **388** (both `darklight lightning big`) have frames containing 18 cells.
`Sprite_Animation` bounds its loops on `this._cellSprites.length`, which is 16,
so the last two layers of those frames never render.

Verified as **stock behaviour, not a Reactor defect**: the same cap is present
in RPG Maker MZ 1.7.0 and in MV, so these animations do not render fully in any
engine. `Star Shift Rebellion` tops out at exactly 16 and is unaffected.

The fix is to rework those three animations to 16 cells or fewer. No code change
is appropriate — raising the cap would diverge from the format Reactor targets.

### Roughly 6,000 tileset flags carry values above 16 bits

`Star Shift Rebellion/data/Tilesets.json` ids **233** (`Canite City`), **237**,
**239**, **240** and **241** each hold 1,200 flags outside the engine's 16-bit
domain — for example `0x02CBDE0F` and `0x3D70A8AF`, at indices 2528–5791.

These originate from `Cyclone-Map-Editor-MV`, a third-party in-game map editor
present in that project's plugin list, which writes 32-bit values into the flags
array. The engine reads them literally: `Game_Map.terrainTag` is an unmasked
`flag >> 12`, so those tiles report terrain tags of 11453 and 251658, and their
low bits produce garbage passage, ladder and counter states —
`0x3D70A8AF` reads as impassable in all four directions *plus* ladder *plus*
counter.

Reactor's tileset editor no longer propagates this: writing a terrain tag now
clears everything from bit 12 up, so editing an affected tile normalises it.
**No mass rewrite was performed.** Rewriting 6,000 flags in a live project is a
destructive bulk edit and belongs to the project owner, not to an audit. The
options are to repaint the affected tilesets in Reactor, to accept the current
behaviour, or to write a one-off normalisation script.

## A shape deliberately left unimplemented

### `When Cancel` (403) parameters

Authored data carries two parameters on the 403 marker; Reactor emits none. The
corpus contains exactly one authored instance, `[6, null]`, whose leading value
matches neither the choice count (4) nor the cancel setting. The interpreter
reads nothing from this command — `command403` branches on interpreter state
alone — so the value is decorative.

Emitting a guessed number would be worse than emitting none, so `403` is
excluded from the command-shape check in `event-command-parameters.test.cjs`
with that reasoning recorded at the exclusion site. If more authored examples
become available and explain the value, the exclusion should be removed and the
shape matched.

## Coverage note

The audit covered `editor/src` (275 files), `runtime/` (10 corescript files plus
`libs/pixi_compat.js`), `editor/build-scripts`, `editor/css`, `editor/index.html`
and the CI workflows. Vendored `runtime/libs/pixi.js` was excluded as upstream.

Two categories were examined and deliberately left alone as **inherited stock
RPG Maker behaviour rather than Reactor defects**: the 16-cell animation cap
described above, and spriteset filters not being explicitly destroyed on scene
teardown (`Container.destroy` nulls `_filterEffect` without calling
`filter.destroy()`). The latter has the identical shape in stock MZ; PIXI v8's
per-instance uniform-group bookkeeping may make it accumulate faster, but the
magnitude is unmeasured and it is not a migration regression.
