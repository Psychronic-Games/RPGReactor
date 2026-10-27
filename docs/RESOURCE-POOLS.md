# Resource Pools

RPG Maker MZ has three resource pools: HP, MP and TP. A project may want fewer of them, for example a game with no magic, or a game where TP means nothing. A project may also want more of them: Stamina, Rage, Ammo, Heat, Focus, Mana and Spirit side by side. This page describes both.

- **Part 1, built:** turning MP and TP off, and the trait picker's list.
- **Part 2, proposed:** extra pools.

## Part 1: turning the default pools off (built)

### Where

**Database › System 1 › Resource Pools** has two ticks: **Use MP** and **Use TP**. Both are on by default. When a pool has been renamed in Terms, the tick shows that name beside it, for example *Use MP (Mana)*. HP cannot be turned off. **Display TP** in Options is greyed while TP is off.

### Storage

`System.json` → `rrPoolsOff: ["mp"]`, `["tp"]` or `["mp", "tp"]`. The key exists only while a pool is off. A project that never touches the ticks keeps a clean System.json and behaves exactly as before.

### Game

| What | Where | When the pool is off |
|---|---|---|
| Skill cost | `Game_BattlerBase.prototype.skillMpCost` / `skillTpCost` | 0, so a skill priced in that pool stays usable and nothing is paid |
| TP gain | `Game_Battler.initTp`, `chargeTpByDamage`, `regenerateTp`, `Game_Action.applyItemUserEffect` | no gain (TP stays 0) |
| The switch itself | `Game_BattlerBase.isPoolOn(key)` | false |
| Stock status gauges (menu, skill, status, battle) | `Window_StatusBase.placeBasicGauges`, `Window_BattleStatus.basicGaugesY` | not placed, and the gauges below move up |
| Battle log MP/TP lines | `Window_BattleLog.displayMpDamage` / `displayTpDamage` | not written |
| 2000/2003 windows | `drawLegacyValue(TextManager.mpA, …)` calls in `reactor_windows.js` | not drawn |
| MV windows | `drawActorMp` / `drawActorTp` / `drawGaugeArea` in `reactor_mv_compat.js` | not drawn, and the gauge area takes the no-TP layout |
| Reactor menus and battle HUDs | `ReactorUI.actorPanelLayout`, the gauge-node visibility check in `reactor_ui.js` | the pool's gauge, label, number and custom parts are removed. The parts below move up, unless the panel is drawn over a picture of its own. A picture's slots are painted in, so they stay where they are. |
| Tactical HUD | `ReactorFightHud.unitLayout` (`H.poolOff`) | no gauge |
| Action HUD | `ReactorActionHud.vitalsLayout` | no gauge. The remaining one takes the row. |
| Skill cost shown | every list asks `skillMpCost` / `skillTpCost` | nothing shown |

The window-side check is `Window_Base.prototype.isPoolHidden(key)`.

Not changed:

- A battler still has `mp`, `mmp` and `tp`. Damage formulas, events and plugins that read them keep working.
- Item effects that recover MP or give TP are still carried out when an item has them. The editor flags them instead.

### Editor

- **Skills › Invocation and Items › Invocation:** the MP Cost, TP Cost and TP Gain fields are hidden while their pool is off. A record that still stores a value there keeps the field. Its label is drawn in the warning colour, reads *(off)*, and says the value is ignored.
- **Effects › Recover:** the MP Recovery and TP Gain rows are left out. If the effect being edited is one of them, its row stays.
- **UI editor previews:** skill costs follow the switch.
- **Labels:** pool fields use the project's Terms abbreviation. Renamed to *KI*, MP Cost reads *KI Cost*. The status windows, HUDs and battle log already read `TextManager` (Terms), so a rename reaches the game everywhere.

### The trait picker

**Database › System 1 › Trait List** has a tick for every trait, grouped by the picker's tabs (Rates, Param, Attack, Skill, Equip, Other). A tab's own tick switches its whole group.

- **Storage:** `System.json` → `rrHiddenTraits: [codes]`, present only while something is hidden.
- **The picker:** it leaves out hidden traits, and it leaves out any tab whose traits are all hidden. When a trait already on a record is edited, its row stays. A new trait starts on the first trait that is shown.
- **The game:** ignores the list. It only shortens the picker.

### Files

- `editor/src/database/ResourcePools.js`: the keys, helpers and trait list.
- `DatabaseSystem1Editor.poolsAndTraitsSections`, `DatabaseTraitEditor`, `DatabaseSkillEditor.poolRowsHTML`, `DatabaseItemEditor`, `DatabaseEffectEditor.createRecoveryTab`, `DatabaseUserInterfaceEditor.previewSkillCost`.
- Tests: `editor/tests/resource-pools-20261025.test.cjs`.

## Part 2: extra pools (proposal)

### Definition

Pools live in `System.json` → `rrPools`, an array edited on a new **Database › Resource Pools** page. Each pool has one row there, and its depth is folded into a row of options.

```json
{
  "id": "rage",
  "name": "Rage",
  "abbr": "RG",
  "max": { "kind": "fixed", "value": 100 },
  "color": ["#c0392b", "#e67e22"],
  "start": "empty",
  "regen": { "perTurn": 0, "percent": false },
  "onDamage": 0,
  "keepAfterBattle": false,
  "show": { "battle": true, "menu": false },
  "classes": []
}
```

- **`id`:** a stable lowercase key, used everywhere else (`a.pool('rage')`, notes, traits). It cannot be `hp`, `mp`, `tp`, `exp` or another parameter key.
- **`name` / `abbr`:** like Terms. The abbreviation is what gauges and costs print.
- **`max`:** one of:
  - `{kind:'fixed', value}`;
  - `{kind:'param', param: 0..7, rate}`, for example 50% of Max MP;
  - `{kind:'formula', formula}`, evaluated with `a` as the battler, like a damage formula.
- **`color`:** the gauge's two colours, picked from swatches.
- **`start`:** `full`, `empty` or a percentage. Applied at battle start, and also on new game or level up when `keepAfterBattle` is on.
- **`regen`:**
  - `perTurn`: per turn, flat or as a percentage of max, negative to drain;
  - `onDamage`: a percentage of HP lost, added like TP's charge;
  - an optional per-step regen on the map.
- **`keepAfterBattle`:** like Preserve TP, but per pool.
- **`show`:** shown in the battle status or HUD, in the menu status, or both.
- **`classes`:** an empty list means everyone has the pool. Otherwise only actors of these classes have it. Enemies get it through a note tag `<pool rage: 50>` or an Enemy page field.

### Battler storage

- `Game_BattlerBase` gets `_pools: { [id]: number }`, created lazily, so old saves load with every pool at its start value.
- The API:
  - `pool(id)`, `poolMax(id)`, `setPool(id, v)`, `gainPool(id, v)`, `poolRate(id)`;
  - `hasPool(id)`, which checks the class list and enemy tags.
- `refresh()` clamps every pool to its max, as it does for HP and MP.
- `recoverAll()` sets pools whose start is `full` to full.
- Hooks:
  - `onBattleStart`: apply `start` unless the pool is kept;
  - `regenerateAll`: per-turn regen;
  - `gainHp` damage path: `onDamage` charge.

### Skill costs in any pool

- **Data:** a skill keeps `mpCost` and `tpCost` for MZ compatibility, plus `rrCosts: [{ pool: 'rage', amount: 30 }]`, so it can cost several pools.
- **Editor:** under Invocation, MP Cost and TP Cost gain a **+ Cost** chip row, one chip per pool, each with a number.
- **Game:**
  - `skillPoolCost(skill, id)` applies cost-rate traits.
  - `canPaySkillCost` and `paySkillCost` extend over `rrCosts`.
  - `Window_SkillList.drawSkillCost` draws the first non-zero cost in TP, then MP, then pool order, using the pool's colour. If a skill has more than one cost, it draws them all, right to left, each narrowed to its digits.

### Traits that affect pools

Codes 15 and 23 are taken. The proposal uses Reactor-only codes outside MZ's range, so MZ ignores them on export:

- **71 Pool Max** (`dataId`: pool index, `value`: rate) and **72 Pool Max +** (flat). Max is computed like a param.
- **73 Pool Regen**: a per-turn rate, summed like an Ex-Parameter.
- **74 Pool Cost Rate**: multiplied like MCR.
- **75 Pool Charge Rate**: multiplied like TCR, for `onDamage`.
- **76 Keep Pool**: a flag, like Preserve TP.

They get their own **Pools** tab in the trait picker, which appears only while the project has extra pools. They also take part in Part 1's Trait List.

Item and skill effects get **Recover Pool** (flat and %), using a Reactor-only effect code that an MZ export drops.

### Damage formulas

- `a.pool('rage')` and `b.pool('ammo')` read a pool. `a.poolMax('rage')` and `a.poolRate('rage')` read its max and fill.
- The damage formula box's helper lists the project's pools.
- A **Pool damage** type joins HP/MP damage, recovery and drain. `damage.type` 7 to 9 with `damage.rrPool` affects a pool instead of HP or MP. The result goes to `result.poolDamage[id]` and is shown by the battle log and damage popups in the pool's colour.

### Display

- **Stock windows:** `placeBasicGauges` adds rows for pools whose `show` matches, below TP. `Sprite_Gauge` learns `pool:<id>`: value, max, colours and label come from the definition.
- **Reactor menus and HUDs:**
  - `actorFields` and `fightFields` accept `pool:<id>`.
  - Gauge nodes accept `gauge: 'pool:<id>'`.
  - Both editors list the project's pools next to HP/MP/TP.
- **Text codes:** `\PL[rage]` prints the current actor's pool in messages and help text.

### Save data

Pools ride on `Game_Actor` and `Game_Enemy` through `_pools`. JsonEx saves plain objects, so no migration is needed.

- A pool removed from the database is dropped on load (`refresh` ignores unknown ids).
- A pool added later starts at its start value the first time it is read.
- Saves made before Part 2 have no `_pools`, which reads as "every pool at its start value".

### Plugin overlap

- **VisuStella Skills & States Core** owns skill costs through `<Cost: x Rage>` notetags and custom cost types:
  - With SSC on, Reactor should leave `skillPoolCost` and the drawing to it. It should still offer `a.pool()`, so the plugin's JS cost types can call it.
  - Register **Extra Resource Pools** in Reactor Features (`editor/src/ReactorFeatures.js`) with `plugins: ['VisuMZ_1_SkillsStatesCore']`, so the page offers *Turn off Reactor's version*.
- **Yanfly Skill Core (MV)** / **YEP_X_LimitGauge**, **SRD's custom resources** and **Fallen Angel Olivia's Rage/Stamina**: the same, through the plugin list.
- **VisuStella Battle Core / Core Engine gauges:** these draw HP/MP/TP with their own sprites and ignore Part 1's switch. Part 1 already leaves battlers' values alone, so those plugins keep working. A project using them hides MP or TP through the plugin's own settings.
- **The importer** maps MV/MZ notetags it recognises, for example `<Rage Cost: 20>` (YEP) and `<Cost: 20 Rage>` (VisuMZ), into `rrCosts` when the project has a pool of that name.

### First slice (not built)

1. Add the `rrPools` definitions and the Database page with a single pool.
2. Add `_pools` storage with `pool`, `poolMax` and `gainPool`, `start` and per-turn `regen`.
3. Add one extra cost on skills (`rrCosts`) with `canPaySkillCost` and `paySkillCost`.
4. Add the pool's gauge in the stock battle status and in Reactor battle panels through `pool:<id>`.
5. Add `a.pool(id)` in formulas.

Traits, effects, pool damage, menus, the importer and the plugin registry come after that.
