# PR #66 integration — 2026-09-20

[PR #66](https://github.com/Psychronic-Games/RPGReactor/pull/66) (dgali, two commits over three upstream syncs) was approved on GitHub and merged into the local branch with `git merge --no-ff`, no conflicts. Its base is the PR #65 merge of 2026-09-18, so the three sync merges in its history add nothing.

## What it changes

- **Buff stack strength.** An Add Buff or Add Debuff effect may carry a rate per stack in `value2` (0.4 for 40%); 0, which every RPG Maker-authored effect has, keeps the standard 25%. `Game_Action.effectBuffRate` reads it and hands it to the battler as a pending potency for the one call that moves the stack; `Game_BattlerBase` keeps `_buffPotency`, one entry per stack per parameter, pushed and popped in step with `_buffs`, emptied with the whole stack by `eraseBuff`. `buffRateFromStacks` sums the entries, resolves a stack that named no strength to `BUFF_RATE_PER_STACK` at read time, floors at zero, and rounds to six places so three 30% stacks read as 90% and not 89%. A list out of step with the count (a save from before, a plugin writing `_buffs` directly) is ignored in favour of the standard rate for that many stacks. The editor's Buff tab gains a **Strength** row (ticked: the box is the rate; unticked: 25% greyed and `value2` stays 0), the effect summary names the strength when one is set, and 'per stack' is translated in all 17 locales by hand.
- **One icon picker for a state.** `addDatabasePreview` accepts the `states` type, and the State editor no longer bolts a second, skills-typed handler onto the container. Before, one click opened two pickers with two backdrops, and OK on the survivor wrote the state's fields into the skill of the same id.

## Review

- The runtime change is confined to `Game_Action.itemEffectAddBuff/AddDebuff`, `Game_BattlerBase` buff bookkeeping and `paramBuffRate`. No other runtime file (MV compat, battle presentation, battle data) touches `_buffs`, `increaseBuff` or `paramBuffRate`, so nothing local bypasses the potency list.
- The Strength row's reader zeroes `value2` when the code is not 31 or 32. That is the same shape the Add State duration row already uses, and each tab's `setupEffectRadioInputs` sees only its own radios, so it cannot touch Recover HP's flat value on another tab. A detour through Remove Buff and back keeps the typed strength, since the input is greyed rather than cleared.
- The PR's state-icon entry sat under Added in `editor/CHANGELOG.md`; it is under Fixed now. Root `CHANGELOG.md` carries one line for each.
- The PR's copy of `template/Demo/js/reactor_objects.js` was replaced by the sync from `runtime/`; the two were identical apart from the header stamp.

## Verification

- Complete Node suite after the merge and the runtime sync: **3,346 passed**, zero failures; the PR's fourteen tests are in it.
- Live, the Demo game at the Manor: an Add Buff effect with a 40% strength applied to the player reads a 1.4 rate, a standard one after it reads 1.65, and a battler with no potency list reads the standard rate.
- Runtime revision **20260920.5**, all 13 bundled projects synced, `--check` clean.

Not pushed. No release, deployment or GitHub message was performed.
