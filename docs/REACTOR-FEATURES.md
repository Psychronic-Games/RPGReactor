# Reactor Features

Reactor adds many things that MZ does not have. Plugins provide many of the same things: VisuStella, Yanfly, Galv, SRD, MOG and others. A project that uses such a plugin must be able to turn Reactor's version off, so that the two don't conflict. **Database › Reactor Features** (System section) lists each of these additions with a tick:

- **Basic** lists the things most projects meet. **Advanced** lists engine-level and compatibility switches.
- When an enabled plugin in the project's plugin list does the same job, the row says *Provided by plugin: X* and offers **Turn off Reactor's version**.
- When a feature is off:
  - its Database fields are hidden;
  - the game behaves as MZ does;
  - data already entered is kept, so turning the feature back on restores it.

## Where things live

| Part | File |
|---|---|
| Registry (labels, tiers, flags, defaults, plugin lists) | `editor/src/ReactorFeatures.js` |
| Game side (`ReactorFeatures.on(id)`) | `runtime/reactor_features.js` (loaded right after `reactor_core_io.js`) |
| The page | `editor/src/database/DatabaseFeaturesEditor.js` |
| Tests | `editor/tests/reactor-features.test.cjs` |

## Storage

A new feature's flag is `System.json` → `rrFeatures.<id>`. It is stored only while it differs from the default, so a project that never opens the page keeps a clean System.json. A feature that already had a flag keeps that flag: `multiFrames` uses `rrMultiFrames` and `skipTitle` uses `rrSkipTitle`, each stored only while on, as System 2's Compatibility card stores them. `higherLimits` uses `rrHigherLimits`, the flag of the Limits box System 2 had; that box is gone, so the tick on Reactor Features is its one switch.

**The default is what Reactor did before the feature had a switch.** An existing project must not change behaviour. Things Reactor always did default to `true`. Compatibility rules that an import turns on default to `false`.

## Registering a feature

1. Add a record to `FEATURES` in `editor/src/ReactorFeatures.js`:

   ```js
   {
       id: 'unsellableItems', tier: 'basic', flag: 'rrFeatures.unsellableItems', default: true,
       label: 'Unsellable Items',
       description: 'Items and equipment marked as not for sale.',
       plugins: ['VisuMZ_1_ItemsEquipsCore', 'YEP_ShopMenuCore']   // '*' matches anything: 'Galv_QuestLog*'
   }
   ```

   Add `pending: true` while the feature is still being built. The page leaves it out until the feature's fields and game code ask the registry.
2. Add the same id, flag and default to `FLAGS` in `runtime/reactor_features.js`. A test fails when the two tables differ.
3. **Game:** where the feature acts, ask first, and treat a missing registry as the default. Some test harnesses load single runtime files without it.

   ```js
   if (typeof ReactorFeatures !== "undefined" && !ReactorFeatures.on("unsellableItems")) return /* MZ's behaviour */;
   ```

   One gate at the feature's entry point is best: the function that every other part asks. Examples: `Game_Actor.classEquipSlots`, `ReactorQuests.quests`, `ReactorFight.resolveMode`.
4. **Editor:** before drawing the feature's fields, ask `window.ReactorFeatures.on(id, databaseManager.getSystem())` and skip the card or row when it is off. A whole Database page takes `feature: '<id>'` in `DatabaseEditorUI.NAV_SECTIONS`, and the sidebar leaves it out.
5. Put the label and description through `tText`, with translations in all 17 locales in an `I18nManager.js` block.
6. Remove `pending` and extend `reactor-features.test.cjs` with the feature's off case.

## Inventory

### Wired to the registry

| id | Tier | Flag (default) | Game gate | Editor when off | Plugins that do the same job |
|---|---|---|---|---|---|
| `classEquipSlots` | Basic | `rrFeatures.classEquipSlots` (on) | `Game_Actor.classEquipSlots` returns null, so actors get MZ's one slot per type | Classes › Equipment Slots card hidden; `RREquipSlots.classSlots` / `resolve` ignore `rrEquipSlots` and `settle` gives no class a list | VisuMZ_1_ItemsEquipsCore, YEP_EquipCore |
| `quests` | Basic | `rrFeatures.quests` (on) | `ReactorQuests.quests()` and `ReactorQuests.find()` return nothing, which removes the menu command, the tracker and the log | Quests page left out of the sidebar | YEP_QuestJournal, GS_QuestSystem, Galv_QuestLog*, MOG_QuestSystem. VisuMZ_2_QuestSystem is not listed: Database › Quests writes into it. |
| `mapLighting2D` | Basic | `rrFeatures.mapLighting2D` (on) | `Spriteset_Map.updateReactorLighting2D` draws no flat lights | (the Lighting tool stays: it also places 3D lights) | Community_Lighting*, TerraxLighting*, KhasUltraLighting, OcRam_Lights, VisuMZ_2_LightingEffects |
| `unsellableItems` | Basic | `rrFeatures.unsellableItems` (on) | `Window_ShopSell.isEnabled` (reactor_windows.js) and `cannotSell` (reactor_ui.js, the custom-interface shop) ignore `rrNoSell`, so only MZ's price-0 rule greys an item out | The Can't be sold box beside Price on Items, Weapons and Armors hidden | VisuMZ_1_ItemsEquipsCore, YEP_ShopMenuCore |
| `enemyRanges` | Basic | `rrFeatures.enemyRanges` (on) | `Game_Enemy.rrRoll` returns null (base params, EXP and Gold) and `rrDropCount` returns 1 | Stat Variance %, the EXP and Gold maximum boxes and each drop's Qty range hidden on Enemies | YEP_EnemyLevels, VisuMZ_3_EnemyLevels, YEP_ExtraEnemyDrops, VisuMZ_3_ExtraEnemyDrops |
| `spriteTransforms` | Basic | `rrFeatures.spriteTransforms` (on) | `Game_CharacterBase.reactorMirror`, `reactorFlip`, `reactorRotate` (and the 3D map's `reactorRotate`) and `Game_Event.reactorSetupPageImage` do nothing | Rotate, Mirror ON/OFF, Flip ON/OFF and Reset Image left out of Set Movement Route's buttons; the page's Mirror / Flip / Rotation row hidden | VisuMZ_1_EventsMoveCore, MOG_CharacterMotion |
| `mapBattles` | Advanced | `rrFeatures.mapBattles` (on) | `ReactorFight.resolveMode` and `modeInForce` return `classic` | Combat card (`RRTactics.createSection`) hidden on every page | SRPG_core*, AlphaABS*, Alpha_ABS*, QABS, MOG_ChronoEngine |
| `equipSlotLayouts` | Advanced | `rrFeatures.equipSlotLayouts` (on) | `Game_BattlerBase.slotLayout` returns null and `Game_Actor.fitEquipSlots` sees no layouts, so a Slot Type that picked one is Normal | Types › Slot Layouts section hidden; the Slot Type trait offers Normal and Dual Wield (a saved pick stays, by number); `RREquipSlots.layouts` / `layoutFor` find none | VisuMZ_1_ItemsEquipsCore, YEP_EquipCore |
| `higherLimits` | Advanced | `rrHigherLimits` (off) | `Game_Party.rrHigherLimits` (maxItems, maxGold, the shop's digits) | (it is the flag itself) | VisuMZ_0_CoreEngine, YEP_CoreEngine, YEP_BaseParamControl |
| `multiFrames` | Advanced | `rrMultiFrames` (off) | already read by the sprites | (it is the flag itself) | Galv_CharacterFrames* |
| `skipTitle` | Advanced | `rrSkipTitle` (off) | already read by Scene_Boot | (it is the flag itself) | \*SkipTitle\*, \*TitleSkip\* |

### Not yet registered (overlap with plugins, still always on)

| Reactor feature | Where | Plugins in the same space |
|---|---|---|
| Follower trail and formation movement | `runtime/reactor_objects_followers.js` | VisuMZ_1_EventsMoveCore, YEP_FollowerControl-style plugins |
| 8-direction sheets and diagonal movement | `reactor_sprites.js` (`rrFacing8`) and followers | VisuMZ_1_EventsMoveCore, Galv_DiagonalMovement, QMovement |
| Speaker faces and name box | `reactor_speaker_face.js`, `rrNameBox` | VisuMZ_1_MessageCore, YEP_MessageCore |
| Controls and key remapping | `reactor_controls.js`, Database › Controls | YEP_KeyboardConfig, VisuMZ_1_OptionsCore |
| Image layers (parallax-mapping layers) | `reactor_image_layers.js` | OrangeOverlay, Galv_LayerGraphics* |
| Picture extensions | `reactor_picture_extensions.js` | VisuMZ_4_ExtraPictures-type plugins |
| 3D maps, physics (jump, fall, swim), Reactor vehicles | `reactor_3d*.js`, `reactor_physics.js`, `reactor_vehicles*.js` | MZ3D, Mode7 plugins. These are opt-in per map or event already. |
| Battle presentation and action sequences | `reactor_battle_presentation.js` | VisuMZ_1_BattleCore, YEP_BattleEngineCore, YEP_ActSeqPack* |
| Touch UI | `rrTouchUiOff` | (already a flag) |
| Random amounts on Change Gold / Items / Weapons / Armors (operand type 2) | `Game_Interpreter.operateValue` | Not part of `enemyRanges`: none of its plugins does this, and MZ would read operand type 2 as a variable, so an existing Random step would turn into a variable read. |
| 2000/2003, XP/VX compatibility rules | `rrLegacy*`, `rrRgss*` in System 2 › Compatibility | These are off by default and turned on only by an import. They do not compete with plugins, so they stay on System 2. |
