# Runtime events: `ReactorEvents`

A read-only, synchronous notification feed that the runtime emits into at fixed
points of a battle, so that a plugin which only needs to *observe* combat can
subscribe to it instead of wrapping prototype methods it never meant to change.

Defined in `runtime/reactor_core.js`, which loads before every other runtime
file and before any plugin, so it is available at plugin load time. Also
reachable from the console as `$reactorEvents`.

```js
const off = ReactorEvents.on("hpChanged", ({ battler, delta, before, after }) => {
    if (battler.isActor() && delta < 0) tally(battler, before - after);
});
// later
off();
```

## Why it exists

A plugin that tracks battle statistics changes nothing about a battle — it
only needs to know what happened. Before this feed the only way to know was to
wrap the engine method where each thing happens: `Game_Action.prototype.apply`
for "an action landed", `Game_Battler.prototype.gainHp` for "HP moved",
`Game_BattlerBase.prototype.die` for "someone fell", and so on. One real
observer plugin on a full VisuStella project installs twenty-one such wrappers
to count things, on methods that the same project already has twelve to
fourteen *other* wrappers on, with no declared order among any of them.

Two failure modes follow from that, and both were hit while building the
plugin that prompted this. First, a category of the thing being observed can
arrive through a seam the observer did not wrap: HP recovered by the
*Recover HP* database effect reaches `gainHp` directly and never passes through
`executeDamage`, so a healer could finish a playthrough with zero Healing Dealt.
Second, ordering: when an observer writes its bookkeeping *after* calling the
original method and something inside that call already finished the enemy, the
bookkeeping arrives after the death it was meant to describe, and the kill is
lost.

An event feed answers both. Every route that changes HP emits `hpChanged` from
the one method they all reach; every death emits `battlerDied` from the one
method that realises it. The observer subscribes to the fact, not to the
method.

## Guarantees

- **Additive.** Nothing that existed is routed through the feed. Every wrapper
  a plugin already installs on an emitting method runs exactly as it did; the
  emit is one extra statement inside the engine's own body. The MZ plugin API
  is unchanged.
- **Read-only.** A listener's return value is ignored. The feed cannot alter an
  outcome — modifying a value in flight is still what the prototype chain is
  for.
- **Synchronous, in subscription order.** `emit` returns after the last
  listener returns. Listeners run in the order they subscribed.
- **Isolated.** A listener that throws is reported with `console.error` and
  skipped; the listeners after it still run, and the engine continues. A
  statistics plugin's bug must not end a battle.
- **Snapshot dispatch.** Subscribing or unsubscribing from inside a listener
  takes effect for the *next* emit. The one in flight delivers to the list as
  it stood when it began.
- **Free while idle.** With no listener on an event, its emit point costs one
  property read and a return.

## API

| Method | Does |
|---|---|
| `ReactorEvents.on(name, listener)` | Subscribes. Returns a function that removes exactly this subscription. Throws `TypeError` if `listener` is not a function. |
| `ReactorEvents.once(name, listener)` | Subscribes for one delivery; removes itself before the listener runs. Returns an early-unsubscribe function. |
| `ReactorEvents.off(name, listener)` | Removes one subscription. A no-op for a listener that is not subscribed. |
| `ReactorEvents.emit(name, payload)` | Delivers `payload` to every listener of `name`. The engine calls this; a plugin may emit its own events and should prefix their names (`myPlugin:thing`) so they cannot collide with the runtime's. |
| `ReactorEvents.listenerCount(name)` | How many listeners `name` has now. |
| `ReactorEvents.clear([name])` | Drops every listener of `name`, or of every event. For tests and hot-reload tooling; the engine never calls it. |

Every listener receives **one argument, a payload object**, so a field can be
added to a payload later without breaking any subscriber. Treat payloads as
read-only; where a payload carries a live engine object it is the engine's own
instance, not a copy, and is noted below.

## Events

Each entry names the exact method the event is emitted from, in the runtime
source. A test (`editor/tests/runtime-events.test.cjs`) reads the headings in
this section and the `ReactorEvents.emit(...)` calls in `runtime/` and fails if
either has something the other lacks, so this list is the list.

### `battleStart`

Emitted from `BattleManager.startBattle`, as its last statement — after
`$gameSystem`, `$gameParty` and `$gameTroop` have had `onBattleStart`, so every
member is already in battle and `$gameSystem.battleCount()` already counts this
one.

| Field | |
|---|---|
| `preemptive` | `boolean` — the party got a preemptive strike |
| `surprise` | `boolean` — the party was surprised |

### `battleEnd`

Emitted from `BattleManager.endBattle`, as its last statement.

| Field | |
|---|---|
| `result` | `0` victory, `1` escape or abort, `2` defeat — the engine's own result code |
| `escaped` | `boolean` — true on **either** escape route: the party-command Escape (`onEscapeSuccess`) and a whole-party flight where every member is hidden (`processPartyEscape`). False for a plain event *Abort Battle*. This is the same flag the engine tests to call `$gameSystem.onBattleEscape()`, so the two can never disagree. |

### `turnStart`

Emitted from `BattleManager.startTurn`, as its last statement, after
`$gameTroop.increaseTurn()`.

| Field | |
|---|---|
| `turn` | `number` — `$gameTroop.turnCount()` for the turn that is starting |

### `turnEnd`

Emitted from `BattleManager.endTurn`, as its last statement.

| Field | |
|---|---|
| `turn` | `number` — `$gameTroop.turnCount()` for the turn that ended |

### `actionStart`

Emitted from `BattleManager.startAction`, as its last statement — after the
subject has paid the action's cost (`useItem`) and `applyGlobal` has run, and
before the action is applied to any target.

| Field | |
|---|---|
| `subject` | `Game_Battler` — who is acting |
| `action` | `Game_Action` — the engine's instance |
| `targets` | `Game_Battler[]` — a **copy** of the target list. The engine drains its own list as it applies, so the copy is the only stable record of who was targeted. |

### `actionEnd`

Emitted from `BattleManager.endAction`, as its **first** statement, before the
engine may release the subject. Emitted from **two** places, because the
runtime itself replaces this method for MV-authored games: the stock body in
`reactor_managers.js`, and the verbatim-MV replacement that
`reactor_mv_compat.js` installs under `mvGameSemantics`, which emits first for
the same reason. A game receives one or the other, never both.

| Field | |
|---|---|
| `subject` | `Game_Battler` — who just finished acting |

**This is the event most likely to be silenced by a plugin stack.** See
Limits: `VisuMZ_0_CoreEngine` reimplements `BattleManager.endAction` without
calling the original, so on any project carrying it — which is every
VisuStella project — neither emit point is reached. `actionApplied` (once per
target) and `actionStart` still fire there and between them cover most of
what an observer wants from an action's lifetime.

### `actionApplied`

Emitted from `Game_Action.prototype.apply`, as its last statement, after
`updateLastTarget`. Fires for **every** application — hits, misses and
evasions alike — and outside battle too, since using an item from the menu
goes through `apply`.

| Field | |
|---|---|
| `action` | `Game_Action` — the engine's instance |
| `subject` | `Game_Battler` — `action.subject()` |
| `target` | `Game_Battler` — the battler this application was for (after substitution) |
| `result` | `Game_ActionResult` — **`target.result()`, live.** Read `missed`, `evaded`, `critical`, `hpDamage`, `mpDamage`, added and removed states *now*; the next `apply` on this target clears it. |

A counterattack applies a fresh `Game_Action` whose subject is the
counter-attacker; a reflected spell applies the original action back onto its
own subject. Both reach `apply` and both emit — read `subject` and `target`
rather than assuming the actor who chose the command.

### `hpChanged`

Emitted from `Game_Battler.prototype.gainHp`, as its last statement, after
`setHp` has clamped and refreshed.

| Field | |
|---|---|
| `battler` | `Game_Battler` |
| `delta` | `number` — the change that was **asked for**, signed: negative is damage |
| `before` | `number` — HP before |
| `after` | `number` — HP after, clamped to `[0, mhp]` |

`gainHp` is the one method every HP-changing route reaches — damage formulas
(`executeHpDamage`), the *Recover HP* database effect (`itemEffectRecoverHp`),
regeneration (`regenerateHp`), drain (`gainDrainedHp`), the *Change HP* event
command and `actor.gainHp(n)` script calls — so this event sees all of them,
for actors and enemies, in and out of battle. `|delta| - |after - before|` is
overkill or overheal. `delta` may be `0`.

**Ordering with death.** When this change kills, `setHp` → `refresh` →
`addState(death)` → `die()` runs *inside* the call, so `battlerDied` is
delivered **before** the `hpChanged` that reports `after: 0`.

Does **not** fire for a direct `setHp(n)`.

### `mpChanged`

Emitted from `Game_Battler.prototype.gainMp`, as its last statement. Same shape
as `hpChanged`: `battler`, `delta`, `before`, `after`.

### `tpChanged`

Emitted from **two** methods, distinguished by the `silent` field:

- `Game_Battler.prototype.gainTp` — `silent: false`. Writes `result.tpDamage`,
  so the change shows in the battle log and popups.
- `Game_Battler.prototype.gainSilentTp` — `silent: true`. Regeneration
  (`regenerateTp`), charge-by-damage (`chargeTpByDamage`) and any other route
  the engine keeps out of the log. The TP still moved; only the display was
  suppressed, and an observer usually wants both.

| Field | |
|---|---|
| `battler` | `Game_Battler` |
| `delta` | `number` — signed, as asked for |
| `before` | `number` |
| `after` | `number` — clamped to `[0, maxTp()]` |
| `silent` | `boolean` — which of the two methods emitted |

### `battlerDied`

Emitted from `Game_BattlerBase.prototype.die`, as its last statement, after HP
is `0` and states and buffs are cleared. Fires for actors and enemies, from
every route that realises a death — HP reaching zero, the death state applied
directly, slip damage.

| Field | |
|---|---|
| `battler` | `Game_Battler` |

`die` is reached from `addNewState(deathStateId)`, so for the death state this
event precedes the corresponding `stateAdded`. And because `die` calls
`clearStates()`, which resets the state list directly, the states a death wipes
do **not** emit `stateRemoved`.

### `battlerRevived`

Emitted from `Game_BattlerBase.prototype.revive`, as its last statement. The
engine calls `revive` whenever the death state is removed
(`removeState(deathStateId)`); HP is raised to `1` only if it was `0`. Fires
whether or not HP had to be raised — it means "the engine revived this
battler", not "HP was changed".

| Field | |
|---|---|
| `battler` | `Game_Battler` |

### `stateAdded`

Emitted from `Game_Battler.prototype.addState`, inside the branch where the
state was addable, after `resetStateCounts` and the result has recorded it. So
it fires once per **successful** `addState`, including re-applying a state the
battler already has.

| Field | |
|---|---|
| `battler` | `Game_Battler` |
| `stateId` | `number` |
| `renewed` | `boolean` — `true` when the battler already had the state and only its turn count was reset; `false` when it was newly added |

Does **not** fire when `isStateAddable` refuses (dead battler, resisted,
restricted, unknown id).

### `stateRemoved`

Emitted from `Game_Battler.prototype.removeState`, inside the branch where the
state was actually present, after `eraseState`, `refresh` and the result
record. Auto-removal by turns (`removeStatesAuto`), by damage
(`removeStatesByDamage`) and by restriction all pass through `removeState`, so
they emit.

| Field | |
|---|---|
| `battler` | `Game_Battler` |
| `stateId` | `number` |

Does **not** fire for `clearStates()` (death, `recoverAll`, `escape`), nor for
a direct `eraseState` — those bypass `removeState` by design in the engine, and
the feed reports what the engine does rather than second-guessing it.

## Migrating an observer

An observer plugin counting battle statistics, before, wraps
`Game_Action.prototype.apply`, `executeDamage`, `itemEffectRecoverHp`,
`Game_Battler.prototype.gainHp`, `regenerateHp`, `regenerateAll`, `die`,
`removeState`, `eraseState`, `onBattleStart`, `BattleManager.startBattle`,
`endBattle` and more, each with a save-and-call alias, several with re-entrancy
flags so they do not double-count each other. The same plugin, after:

```js
ReactorEvents.on("battleStart", () => {
    for (const actor of $gameParty.battleMembers()) actor.stats().battles++;
});

ReactorEvents.on("hpChanged", ({ battler, delta, before, after }) => {
    if (!battler.isActor() || !$gameParty.inBattle()) return;
    const realised = Math.abs(after - before);
    if (delta < 0) battler.stats().damageTaken += realised;
    else if (delta > 0) battler.stats().healingTaken += realised;
});

ReactorEvents.on("actionApplied", ({ subject, target, result }) => {
    if (!subject.isActor() || !result.isHit()) return;
    if (result.hpDamage > 0) subject.stats().damageDealt += result.hpDamage;
    if (result.hpDamage < 0) subject.stats().healingDealt -= result.hpDamage;
    if (target.isEnemy()) lastActorToHit.set(target, subject);
});

ReactorEvents.on("battlerDied", ({ battler }) => {
    if (battler.isActor()) { battler.stats().deaths++; return; }
    const killer = lastActorToHit.get(battler);
    if (killer) killer.stats().kills++;
});

ReactorEvents.on("battleEnd", ({ escaped }) => {
    if (!escaped) return;
    for (const actor of $gameParty.battleMembers()) actor.stats().escapes++;
});
```

No aliases, no re-entrancy flags, and the *Recover HP* healing and the
party-escape route are covered because the events fire from the methods those
routes actually reach. What the plugin still cannot do from here is change a
number — and it never wanted to.

## Limits

- **A plugin that *replaces* an emitting method silences that event.** The
  emit lives inside the engine's method body. A wrapper that calls the
  original still reaches it; a wrapper that reimplements the method without
  calling through does not. Measured on a project with the full VisuStella
  stack and Order Turn Battle: thirteen of the fourteen events arrived.
  `actionEnd` did not, because `VisuMZ_0_CoreEngine` — Tier 0, loaded before
  anything that could have saved the original — reimplements
  `BattleManager.endAction` verbatim with a null guard and no call-through.
  Every one of the ten wrappers stacked above it saves and calls its
  predecessor correctly; they are all wrapping CoreEngine's copy. The same
  scan found no other emitting method replaced on that stack. Which methods a
  given stack replaces is a property of that stack; a listener on each event
  during one battle tells you in a minute.
- **No priorities, no ordering across plugins** beyond subscription order,
  which is plugin load order for subscriptions made at load time. This is a
  notification feed, not a filter chain.
- **No asynchronous gate.** Nothing here holds a turn open while a listener
  finishes an animation. That is a separate capability, designed but not
  built, and it would be additive to this one.
- **Not persisted.** Subscriptions live for the process, like prototype
  patches. A listener installed at plugin load is installed once; there is
  nothing to re-arm on New Game or load.
- **`emit` is public and unguarded.** A plugin can emit an engine event name
  itself. Don't — prefix your own.
