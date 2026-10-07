# Runtime API inventory — Step 1

Source snapshot: `1d95290479b7bdc507b6aa98c162ea2b07e99d3b`.

The initial scan used TypeScript 5.9.3's compiler API, before the toolchain was
upgraded to 7.0.2. This is a manually reviewed snapshot, not a generated build
artifact. The one-off scanner in ignored `tmp/` uses the old API and cannot run
with TypeScript 7. Refreshing the scan requires a supported scanner; do not treat
that old script as a maintained regeneration command.

This is a source survey for incremental declarations, not a typed API contract.
All twelve requested files were scanned for global constructors, static functions,
prototype assignments, public-looking fields/accessors and JSDoc tags. Tables
record constructors/namespaces and selected helpers, with representative signatures;
counts are syntactic observations, not a promise of public API completeness.
Indented patches are included. Static counts include function-valued property
assignments (including nested constructor assignments) and object-literal methods;
prototype counts include function assignments to the prototype. Repeated
assignments count separately. Helpers themselves are not counted as methods.
Writes to existing properties inside function bodies are use sites, not namespace
definitions; they do not get separate extension rows.
Underscore-prefixed members are omitted. Inherited members, dynamically computed
properties, aliases, closure-local exports and later plugin patches need manual
review. Return types must be checked against implementation and callers.

## File coverage

| Source | Lines | JSDoc blocks with parameters | JSDoc blocks with returns |
| --- | ---: | ---: | ---: |
| [reactor_core.js](../runtime/reactor_core.js) | 10669 | 105 | 87 |
| [reactor_managers.js](../runtime/reactor_managers.js) | 4261 | 0 | 0 |
| [reactor_objects.js](../runtime/reactor_objects.js) | 12808 | 2 | 1 |
| [reactor_scenes.js](../runtime/reactor_scenes.js) | 3905 | 0 | 0 |
| [reactor_sprites.js](../runtime/reactor_sprites.js) | 6570 | 7 | 7 |
| [reactor_windows.js](../runtime/reactor_windows.js) | 7212 | 0 | 0 |
| [reactor_3d.js](../runtime/reactor_3d.js) | 8552 | 0 | 0 |
| [reactor_3d_effects.js](../runtime/reactor_3d_effects.js) | 2224 | 0 | 0 |
| [reactor_3d_lighting.js](../runtime/reactor_3d_lighting.js) | 4360 | 0 | 0 |
| [reactor_3d_models.js](../runtime/reactor_3d_models.js) | 7082 | 0 | 0 |
| [reactor_3d_speech.js](../runtime/reactor_3d_speech.js) | 438 | 0 | 0 |
| [reactor_3d_world.js](../runtime/reactor_3d_world.js) | 1971 | 0 | 0 |

## reactor_core.js

Counts show direct static / prototype methods. Properties combine explicit
static assignments, instance writes and accessors; lists are samples, not types.

| Symbol | Kind | Methods (static / prototype) | Representative methods | Public property/accessor examples |
| --- | --- | ---: | --- | --- |
| [`Utils`](../runtime/reactor_core.js#L177) | static | 27 / 0 | `checkRMVersion(version)`, `isOptionValid(name)`, `isNwjs()` … | `RPGMAKER_NAME`, `REACTOR_NAME`, `RPGMAKER_VERSION`, `AUDIO_EXTENSIONS` |
| [`Graphics`](../runtime/reactor_core.js#L665) | static | 26 / 0 | `initialize()`, `setTickHandler(handler)`, `startGameLoop()` … | `frameCount`, `boxWidth`, `boxHeight`, `app`, `effekseer`, `width` … |
| [`ReactorProfiler`](../runtime/reactor_core.js#L1097) | static | 7 / 0 | `toggle()`, `start()`, `stop()` … | `frameThreshold`, `gapThreshold` |
| [`ReactorEvents`](../runtime/reactor_core.js#L1383) | static | 6 / 0 | `on(name, listener)`, `once(name, listener)`, `off(name, listener)` … | — |
| [`Point`](../runtime/reactor_core.js#L2539) | constructor | 0 / 1 | `initialize(x, y)` | `x`, `y` |
| [`Rectangle`](../runtime/reactor_core.js#L2569) | constructor | 0 / 1 | `initialize(x, y, width, height)` | `type`, `x`, `y`, `width`, `height` |
| [`Bitmap`](../runtime/reactor_core.js#L2597) | constructor | 7 / 26 | `initialize(width, height)`, `isReady()`, `isError()` … | `ANIMATION_MIN_DELAY_MS`, `fontFace`, `fontSize`, `fontBold`, `fontItalic`, `textColor` … |
| [`Window`](../runtime/reactor_core.js#L6599) | constructor | 1 / 14 | `initialize()`, `destroy()`, `update()` … | `clipWithMask`, `origin`, `active`, `frameVisible`, `cursorVisible`, `downArrowVisible` … |
| [`Sprite`](../runtime/reactor_core.js#L4190) | constructor | 0 / 13 | `initialize(bitmap)`, `destroy()`, `update()` … | `spriteId`, `bitmap`, `width`, `height`, `opacity`, `blendMode` … |
| [`Tilemap`](../runtime/reactor_core.js#L4619) | constructor | 25 / 8 | `initialize()`, `destroy()`, `setData(width, height, data)` … | `TILE_ID_B`, `TILE_ID_C`, `TILE_ID_D`, `TILE_ID_E`, `TILE_ID_A5`, `TILE_ID_A1` … |
| [`Tilemap.Layer`](../runtime/reactor_core.js#L5439) | constructor | 0 / 8 | `initialize()`, `destroy(options)`, `setBitmaps(bitmaps)` … | `MAX_GL_TEXTURES`, `VERTEX_STRIDE`, `MAX_SIZE`, `V8_ATLAS_COLUMNS`, `V8_ATLAS_ROWS`, `V8_ATLAS_SLOT_SIZE` |
| [`Tilemap.CombinedLayer`](../runtime/reactor_core.js#L6083) | constructor | 0 / 7 | `initialize()`, `destroy()`, `setBitmaps(bitmaps)` … | — |
| [`Tilemap.Renderer`](../runtime/reactor_core.js#L6147) | constructor | 0 / 6 | `initialize(renderer)`, `destroy()`, `getShader()` … | — |
| [`TilingSprite`](../runtime/reactor_core.js#L6295) | constructor | 0 / 6 | `initialize(bitmap)`, `destroy()`, `update()` … | `origin`, `bitmap`, `opacity`, `x`, `y` |
| [`ScreenSprite`](../runtime/reactor_core.js#L6502) | constructor | 0 / 5 | `initialize()`, `destroy()`, `setBlack()` … | `opacity` |
| [`WindowLayer`](../runtime/reactor_core.js#L7555) | constructor | 0 / 3 | `initialize()`, `update()`, `render(renderer)` | — |
| [`Weather`](../runtime/reactor_core.js#L7650) | constructor | 0 / 3 | `initialize()`, `destroy()`, `update()` | `type`, `power`, `origin` |
| [`ColorFilter`](../runtime/reactor_core.js#L7807) | constructor | 2 / 6 | `initialize()`, `allowNeutralSceneSkip(owner)`, `setHue(hue)` … | `skipNeutralScenePasses` |
| [`Stage`](../runtime/reactor_core.js#L8256) | constructor | 0 / 2 | `initialize()`, `destroy()` | — |
| [`WebAudio`](../runtime/reactor_core.js#L8282) | constructor | 2 / 14 | `initialize(url)`, `clear()`, `isReady()` … | `url`, `volume`, `pitch`, `pan` |
| [`Video`](../runtime/reactor_core.js#L9591) | static | 5 / 0 | `initialize(width, height)`, `resize(width, height)`, `play(src)` … | — |
| [`Input`](../runtime/reactor_core.js#L9725) | static | 9 / 0 | `initialize()`, `clear()`, `update()` … | `keyRepeatWait`, `keyRepeatInterval`, `keyMapper`, `gamepadMapper`, `dir4`, `dir8` … |
| [`Input.keyMapper`](../runtime/reactor_core.js#L9756) | namespace/extension | 0 / 0 | — | `9`, `13`, `16`, `17`, `18`, `27` … |
| [`Input.gamepadMapper`](../runtime/reactor_core.js#L9788) | namespace/extension | 0 / 0 | — | `0`, `1`, `2`, `3`, `4`, `5` … |
| [`TouchInput`](../runtime/reactor_core.js#L10134) | static | 16 / 0 | `initialize()`, `clear()`, `update()` … | `keyRepeatWait`, `keyRepeatInterval`, `moveThreshold`, `isMousePressed`, `isMouseTriggered`, `isMouseReleased` … |
| [`JsonEx`](../runtime/reactor_core.js#L10592) | static | 3 / 0 | `stringify(object)`, `parse(json)`, `makeDeepCopy(object)` | `maxDepth` |
| [`Array`](../runtime/reactor_core.js#L19) | built-in augmentation | 0 / 4 | `clone()`, `contains(element)`, `equals(array)`, `remove(element)` | — |
| [`Graphics.FPSCounter`](../runtime/reactor_core.js#L2383) | constructor | 0 / 4 | `initialize()`, `startTick()`, `endTick()` … | `fps`, `duration` |

## reactor_managers.js

Global assignments (all initially `null`):

`$dataActors`, `$dataClasses`, `$dataSkills`, `$dataItems`, `$dataWeapons`, `$dataArmors`, `$dataEnemies`, `$dataTroops`, `$dataStates`, `$dataAnimations`, `$dataTilesets`, `$dataCommonEvents`, `$dataSystem`, `$dataMapInfos`, `$dataMap`, `$gameTemp`, `$gameSystem`, `$gameScreen`, `$gameTimer`, `$gameMessage`, `$gameSwitches`, `$gameVariables`, `$gameSelfSwitches`, `$gameActors`, `$gameParty`, `$gameTroop`, `$gameMap`, `$gamePlayer`, `$testEvent`.

Counts show direct static / prototype methods. Properties combine explicit
static assignments, instance writes and accessors; lists are samples, not types.

| Symbol | Kind | Methods (static / prototype) | Representative methods | Public property/accessor examples |
| --- | --- | ---: | --- | --- |
| [`DataManager`](../runtime/reactor_managers.js#L10) | static | 50 / 0 | `loadGlobalInfo()`, `removeInvalidGlobalInfo()`, `saveGlobalInfo(info)` … | `STATE_DESCRIPTION_TAGS`, `PLAYTEST_CHECKPOINT_ID` |
| [`ConfigManager`](../runtime/reactor_managers.js#L625) | static | 7 / 0 | `load()`, `save()`, `isLoaded()` … | `alwaysDash`, `commandRemember`, `touchUI`, `bgmVolume`, `bgsVolume`, `meVolume` … |
| [`AudioManager`](../runtime/reactor_managers.js#L1324) | static | 52 / 0 | `playBgm(bgm, pos)`, `replayBgm(bgm)`, `isCurrentBgm(bgm)` … | `bgmVolume`, `bgsVolume`, `meVolume`, `seVolume`, `BGM_SEQUENCE_ME_DUCK` |
| [`StorageManager`](../runtime/reactor_managers.js#L736) | static | 30 / 0 | `isLocalMode()`, `saveObject(saveName, object)`, `loadObject(saveName)` … | — |
| [`FontManager`](../runtime/reactor_managers.js#L987) | static | 5 / 0 | `load(family, filename)`, `isReady()`, `startLoading(family, url)` … | — |
| [`ImageManager`](../runtime/reactor_managers.js#L1050) | static | 23 / 0 | `loadAnimation(filename)`, `loadBattleback1(filename)`, `loadBattleback2(filename)` … | `iconWidth`, `iconHeight`, `faceWidth`, `faceHeight` |
| [`EffectManager`](../runtime/reactor_managers.js#L1248) | static | 9 / 0 | `load(filename)`, `startLoading(url)`, `clear()` … | — |
| [`SoundManager`](../runtime/reactor_managers.js#L2462) | static | 33 / 0 | `preloadImportantSounds()`, `systemSoundSlot(n)`, `loadSystemSound(n)` … | — |
| [`TextManager`](../runtime/reactor_managers.js#L2629) | static | 5 / 0 | `basic(basicId)`, `param(paramId)`, `command(commandId)` … | `currencyUnit`, `level`, `levelA`, `hp`, `hpA`, `mp` … |
| [`ColorManager`](../runtime/reactor_managers.js#L2760) | static | 32 / 0 | `loadWindowskin()`, `clearTextColorCache()`, `readTextColor(n)` … | — |
| [`SceneManager`](../runtime/reactor_managers.js#L2945) | static | 49 / 0 | `run(sceneClass)`, `initialize()`, `checkBrowser()` … | — |
| [`BattleManager`](../runtime/reactor_managers.js#L3353) | static | 103 / 0 | `setup(troopId, canEscape, canLose)`, `initMembers()`, `isTpb()` … | — |
| [`PluginManager`](../runtime/reactor_managers.js#L4189) | static | 10 / 0 | `setup(plugins)`, `parameters(name)`, `setParameters(name, parameters)` … | — |

## reactor_objects.js

Counts show direct static / prototype methods. Properties combine explicit
static assignments, instance writes and accessors; lists are samples, not types.

| Symbol | Kind | Methods (static / prototype) | Representative methods | Public property/accessor examples |
| --- | --- | ---: | --- | --- |
| [`Game_Temp`](../runtime/reactor_objects.js#L10) | constructor | 0 / 30 | `initialize()`, `isPlaytest()`, `setDestination(x, y)` … | — |
| [`Game_System`](../runtime/reactor_objects.js#L175) | constructor | 0 / 53 | `initialize()`, `isJapanese()`, `isChinese()` … | — |
| [`Game_Timer`](../runtime/reactor_objects.js#L434) | constructor | 0 / 8 | `initialize()`, `update(sceneActive)`, `start(count)` … | — |
| [`Game_Message`](../runtime/reactor_objects.js#L483) | constructor | 0 / 40 | `initialize()`, `clear()`, `choices()` … | — |
| [`Game_Switches`](../runtime/reactor_objects.js#L687) | constructor | 0 / 5 | `initialize()`, `clear()`, `value(switchId)` … | — |
| [`Game_Variables`](../runtime/reactor_objects.js#L719) | constructor | 0 / 5 | `initialize()`, `clear()`, `value(variableId)` … | — |
| [`Game_SelfSwitches`](../runtime/reactor_objects.js#L754) | constructor | 0 / 5 | `initialize()`, `clear()`, `value(key)` … | — |
| [`Game_Screen`](../runtime/reactor_objects.js#L789) | constructor | 0 / 46 | `initialize()`, `clear()`, `onBattleStart()` … | — |
| [`Game_Picture`](../runtime/reactor_objects.js#L1116) | constructor | 0 / 28 | `initialize()`, `name()`, `origin()` … | — |
| [`Game_Item`](../runtime/reactor_objects.js#L1328) | constructor | 0 / 12 | `initialize(item)`, `isSkill()`, `isItem()` … | — |
| [`Game_Action`](../runtime/reactor_objects.js#L1411) | constructor | 5 / 127 | `initialize(subject, forcing)`, `clear()`, `setSubject(subject)` … | `EFFECT_RECOVER_HP`, `EFFECT_RECOVER_MP`, `EFFECT_GAIN_TP`, `EFFECT_ADD_STATE`, `EFFECT_REMOVE_STATE`, `EFFECT_ADD_BUFF` … |
| [`DataManager`](../runtime/reactor_objects.js#L2334) | namespace/extension | 0 / 0 | — | `getActionObjectElements` |
| [`Game_ActionResult`](../runtime/reactor_objects.js#L2695) | constructor | 0 / 22 | `initialize()`, `clear()`, `addedStateObjects()` … | `used`, `missed`, `evaded`, `dodged`, `physical`, `drain` … |
| [`Game_BattlerBase`](../runtime/reactor_objects.js#L2868) | constructor | 1 / 131 | `initialize()`, `initMembers()`, `clearParamPlus()` … | `TRAIT_ELEMENT_RATE`, `TRAIT_DEBUFF_RATE`, `TRAIT_STATE_RATE`, `TRAIT_STATE_RESIST`, `TRAIT_PARAM`, `TRAIT_XPARAM` … |
| [`Game_Battler`](../runtime/reactor_objects.js#L3899) | constructor | 0 / 133 | `initialize()`, `initMembers()`, `clearDamagePopup()` … | — |
| [`Game_Actor`](../runtime/reactor_objects.js#L4664) | constructor | 0 / 133 | `initialize(actorId)`, `initMembers()`, `setup(actorId)` … | `level` |
| [`Game_Enemy`](../runtime/reactor_objects.js#L5594) | constructor | 0 / 40 | `initialize(enemyId, x, y)`, `initMembers()`, `setup(enemyId, x, y)` … | — |
| [`Game_Actors`](../runtime/reactor_objects.js#L6072) | constructor | 0 / 2 | `initialize()`, `actor(actorId)` | — |
| [`Game_Unit`](../runtime/reactor_objects.js#L6095) | constructor | 0 / 23 | `initialize()`, `inBattle()`, `members()` … | — |
| [`Game_Party`](../runtime/reactor_objects.js#L6236) | constructor | 0 / 73 | `initialize()`, `initAllItems()`, `exists()` … | `ABILITY_ENCOUNTER_HALF`, `ABILITY_ENCOUNTER_NONE`, `ABILITY_CANCEL_SURPRISE`, `ABILITY_RAISE_PREEMPTIVE`, `ABILITY_GOLD_DOUBLE`, `ABILITY_DROP_ITEM_DOUBLE` |
| [`Game_Troop`](../runtime/reactor_objects.js#L6700) | constructor | 0 / 20 | `initialize()`, `isEventRunning()`, `updateInterpreter()` … | `LETTER_TABLE_HALF`, `LETTER_TABLE_FULL` |
| [`Game_Map`](../runtime/reactor_objects.js#L6918) | constructor | 0 / 120 | `initialize()`, `setup(mapId)`, `isEventRunning()` … | — |
| [`Game_CommonEvent`](../runtime/reactor_objects.js#L7811) | constructor | 0 / 6 | `initialize(commonEventId)`, `event()`, `list()` … | — |
| [`Game_CharacterBase`](../runtime/reactor_objects.js#L7865) | constructor | 1 / 107 | `initialize()`, `initMembers()`, `pos(x, y)` … | `x`, `y` |
| [`Game_Character`](../runtime/reactor_objects.js#L8533) | constructor | 0 / 35 | `initialize()`, `initMembers()`, `memorizeMoveRoute()` … | `ROUTE_END`, `ROUTE_MOVE_DOWN`, `ROUTE_MOVE_LEFT`, `ROUTE_MOVE_RIGHT`, `ROUTE_MOVE_UP`, `ROUTE_MOVE_LOWER_L` … |
| [`Game_Player`](../runtime/reactor_objects.js#L9121) | constructor | 0 / 72 | `initialize()`, `initMembers()`, `clearTransferInfo()` … | — |
| [`Game_Follower`](../runtime/reactor_objects.js#L9770) | constructor | 0 / 7 | `initialize(memberIndex)`, `refresh()`, `actor()` … | — |
| [`Game_Followers`](../runtime/reactor_objects.js#L9831) | constructor | 0 / 19 | `initialize()`, `setup()`, `isVisible()` … | — |
| [`Game_Vehicle`](../runtime/reactor_objects.js#L9946) | constructor | 0 / 31 | `initialize(type)`, `initMembers()`, `isBoat()` … | — |
| [`Game_Event`](../runtime/reactor_objects.js#L10181) | constructor | 0 / 40 | `initialize(mapId, eventId)`, `initMembers()`, `eventId()` … | — |
| [`Game_Interpreter`](../runtime/reactor_objects.js#L10561) | constructor | 0 / 167 | `initialize(depth)`, `checkOverflow()`, `clear()` … | — |
| [`BattleManager`](../runtime/reactor_objects.js#L12763) | namespace/extension | 1 / 0 | `processDefeat()` | — |

## reactor_scenes.js

Counts show direct static / prototype methods. Properties combine explicit
static assignments, instance writes and accessors; lists are samples, not types.

| Symbol | Kind | Methods (static / prototype) | Representative methods | Public property/accessor examples |
| --- | --- | ---: | --- | --- |
| [`Scene_Base`](../runtime/reactor_scenes.js#L10) | constructor | 0 / 41 | `initialize()`, `create()`, `isActive()` … | `filters` |
| [`Scene_Boot`](../runtime/reactor_scenes.js#L257) | constructor | 0 / 21 | `initialize()`, `create()`, `isReady()` … | — |
| [`Scene_Title`](../runtime/reactor_scenes.js#L414) | constructor | 0 / 20 | `initialize()`, `create()`, `resumePlaytestCheckpoint()` … | — |
| [`Scene_Message`](../runtime/reactor_scenes.js#L576) | constructor | 0 / 15 | `initialize()`, `isMessageWindowClosing()`, `createAllWindows()` … | — |
| [`Scene_Map`](../runtime/reactor_scenes.js#L693) | constructor | 0 / 60 | `initialize()`, `create()`, `isReady()` … | `menuCalling` |
| [`Scene_MenuBase`](../runtime/reactor_scenes.js#L1168) | constructor | 0 / 27 | `initialize()`, `create()`, `update()` … | — |
| [`Scene_Menu`](../runtime/reactor_scenes.js#L1336) | constructor | 0 / 20 | `initialize()`, `helpAreaHeight()`, `create()` … | — |
| [`Scene_ItemBase`](../runtime/reactor_scenes.js#L1494) | constructor | 0 / 20 | `initialize()`, `create()`, `createActorWindow()` … | — |
| [`Scene_Item`](../runtime/reactor_scenes.js#L1642) | constructor | 0 / 12 | `initialize()`, `create()`, `createCategoryWindow()` … | — |
| [`Scene_Skill`](../runtime/reactor_scenes.js#L1744) | constructor | 0 / 19 | `initialize()`, `create()`, `start()` … | — |
| [`Scene_Equip`](../runtime/reactor_scenes.js#L1876) | constructor | 0 / 24 | `initialize()`, `create()`, `createStatusWindow()` … | — |
| [`Scene_Status`](../runtime/reactor_scenes.js#L2060) | constructor | 0 / 18 | `initialize()`, `create()`, `helpAreaHeight()` … | — |
| [`Scene_Options`](../runtime/reactor_scenes.js#L2182) | constructor | 0 / 7 | `initialize()`, `create()`, `terminate()` … | — |
| [`Scene_File`](../runtime/reactor_scenes.js#L2233) | constructor | 0 / 16 | `initialize()`, `create()`, `helpAreaHeight()` … | — |
| [`Scene_Save`](../runtime/reactor_scenes.js#L2331) | constructor | 0 / 8 | `initialize()`, `mode()`, `helpWindowText()` … | — |
| [`Scene_Load`](../runtime/reactor_scenes.js#L2387) | constructor | 0 / 10 | `initialize()`, `terminate()`, `mode()` … | — |
| [`Scene_GameEnd`](../runtime/reactor_scenes.js#L2463) | constructor | 0 / 7 | `initialize()`, `create()`, `stop()` … | — |
| [`Scene_Shop`](../runtime/reactor_scenes.js#L2516) | constructor | 0 / 44 | `initialize()`, `prepare(goods, purchaseOnly)`, `create()` … | — |
| [`Scene_Name`](../runtime/reactor_scenes.js#L2860) | constructor | 0 / 9 | `initialize()`, `prepare(actorId, maxLength)`, `create()` … | — |
| [`Scene_Debug`](../runtime/reactor_scenes.js#L2931) | constructor | 0 / 13 | `initialize()`, `create()`, `needsCancelButton()` … | — |
| [`Scene_Battle`](../runtime/reactor_scenes.js#L3036) | constructor | 0 / 74 | `initialize()`, `create()`, `start()` … | — |
| [`Scene_Gameover`](../runtime/reactor_scenes.js#L3631) | constructor | 0 / 11 | `initialize()`, `create()`, `start()` … | — |
| [`ConfigManager`](../runtime/reactor_scenes.js#L3822) | namespace/extension | 1 / 0 | `applyData(config)` | `touchUI` |
| [`Game_Interpreter`](../runtime/reactor_scenes.js#L3871) | namespace/extension | 0 / 1 | `fadeSpeed()` | — |

## reactor_sprites.js

Counts show direct static / prototype methods. Properties combine explicit
static assignments, instance writes and accessors; lists are samples, not types.

| Symbol | Kind | Methods (static / prototype) | Representative methods | Public property/accessor examples |
| --- | --- | ---: | --- | --- |
| [`Sprite_Clickable`](../runtime/reactor_sprites.js#L10) | constructor | 0 / 11 | `initialize()`, `update()`, `processTouch()` … | — |
| [`Sprite_Button`](../runtime/reactor_sprites.js#L101) | constructor | 0 / 14 | `initialize(buttonType)`, `setupFrames()`, `blockWidth()` … | `bitmap`, `opacity` |
| [`Sprite_Character`](../runtime/reactor_sprites.js#L207) | constructor | 0 / 37 | `initialize(character)`, `initMembers()`, `setCharacter(character)` … | `visible`, `bitmap`, `x`, `y`, `z`, `rotation` … |
| [`Sprite_Battler`](../runtime/reactor_sprites.js#L670) | constructor | 0 / 29 | `initialize(battler)`, `initMembers()`, `setBattler(battler)` … | `bitmap`, `visible`, `x`, `y` |
| [`Sprite_Actor`](../runtime/reactor_sprites.js#L886) | constructor | 0 / 35 | `initialize(battler)`, `initMembers()`, `mainSprite()` … | `MOTIONS` |
| [`Sprite_Actor.MOTIONS`](../runtime/reactor_sprites.js#L893) | namespace/extension | 0 / 0 | — | `walk`, `wait`, `chant`, `guard`, `damage`, `evade` … |
| [`Sprite_Enemy`](../runtime/reactor_sprites.js#L1166) | constructor | 3 / 48 | `initialize(battler)`, `initMembers()`, `createStateIconSprite()` … | `PARTICLE_COLLAPSE`, `PARTICLE_COLLAPSE_DEFAULT_STOPS`, `bitmap`, `opacity`, `blendMode` |
| [`Sprite_Enemy.PARTICLE_COLLAPSE`](../runtime/reactor_sprites.js#L1466) | namespace/extension | 0 / 0 | — | `ash`, `ember`, `shatter`, `wisp` |
| [`Sprite_Animation`](../runtime/reactor_sprites.js#L2391) | constructor | 2 / 26 | `initialize()`, `initMembers()`, `destroy(options)` … | `z` |
| [`Sprite_AnimationMV`](../runtime/reactor_sprites.js#L2910) | constructor | 0 / 28 | `initialize()`, `initMembers()`, `setup(targets, animation, mirror, delay)` … | `z`, `x`, `y`, `reactor3DScale` |
| [`Sprite_Battleback`](../runtime/reactor_sprites.js#L3254) | constructor | 0 / 17 | `initialize(type)`, `adjustPosition()`, `battleback1Bitmap()` … | `bitmap`, `width`, `height`, `x`, `y` |
| [`Sprite_Damage`](../runtime/reactor_sprites.js#L3434) | constructor | 0 / 18 | `initialize()`, `destroy(options)`, `setup(target, result = target.result())` … | `opacity` |
| [`Sprite_Gauge`](../runtime/reactor_sprites.js#L3587) | constructor | 0 / 46 | `initialize()`, `initMembers()`, `destroy(options)` … | `bitmap` |
| [`Sprite_Name`](../runtime/reactor_sprites.js#L3956) | constructor | 0 / 17 | `initialize()`, `initMembers()`, `destroy(options)` … | `bitmap` |
| [`Sprite_StateIcon`](../runtime/reactor_sprites.js#L4060) | constructor | 0 / 9 | `initialize()`, `initMembers()`, `loadBitmap()` … | `bitmap` |
| [`Sprite_StateOverlay`](../runtime/reactor_sprites.js#L4143) | constructor | 0 / 8 | `initialize()`, `initMembers()`, `loadBitmap()` … | `bitmap` |
| [`Sprite_Weapon`](../runtime/reactor_sprites.js#L4215) | constructor | 0 / 9 | `initialize()`, `initMembers()`, `setup(weaponImageId)` … | `x`, `bitmap` |
| [`Sprite_Balloon`](../runtime/reactor_sprites.js#L4296) | constructor | 0 / 11 | `initialize()`, `initMembers()`, `loadBitmap()` … | `z`, `bitmap`, `x`, `y` |
| [`Sprite_Picture`](../runtime/reactor_sprites.js#L4376) | constructor | 0 / 10 | `initialize(pictureId)`, `picture()`, `update()` … | `visible`, `bitmap`, `x`, `y`, `opacity`, `blendMode` … |
| [`Sprite_Timer`](../runtime/reactor_sprites.js#L4470) | constructor | 0 / 11 | `initialize()`, `destroy(options)`, `createBitmap()` … | `bitmap`, `x`, `y`, `visible` |
| [`Sprite_Destination`](../runtime/reactor_sprites.js#L4546) | constructor | 0 / 6 | `initialize()`, `destroy(options)`, `update()` … | `visible`, `bitmap`, `blendMode`, `x`, `y`, `opacity` |
| [`Spriteset_Base`](../runtime/reactor_sprites.js#L4616) | constructor | 0 / 32 | `initialize()`, `destroy(options)`, `loadSystemImages()` … | `ANIMATION_Z`, `filters`, `x`, `y` |
| [`Spriteset_Map`](../runtime/reactor_sprites.js#L5011) | constructor | 1 / 51 | `initialize()`, `loadSystemImages()`, `createLowerLayer()` … | `RR_IMAGE_LAYER_Z` |
| [`reactorFlatLightTexture`](../runtime/reactor_sprites.js#L5767) | helper | 0 / 0 | — | — |
| [`Spriteset_Battle`](../runtime/reactor_sprites.js#L6185) | constructor | 0 / 18 | `initialize()`, `loadSystemImages()`, `createLowerLayer()` … | — |
| [`Spriteset_Map.RR_IMAGE_LAYER_Z`](../runtime/reactor_sprites.js#L6498) | namespace/extension | 0 / 0 | — | `ground`, `over` |

## reactor_windows.js

Counts show direct static / prototype methods. Properties combine explicit
static assignments, instance writes and accessors; lists are samples, not types.

| Symbol | Kind | Methods (static / prototype) | Representative methods | Public property/accessor examples |
| --- | --- | ---: | --- | --- |
| [`Window_Base`](../runtime/reactor_windows.js#L10) | constructor | 1 / 76 | `initialize(rect)`, `destroy(options)`, `checkRectObject(rect)` … | `windowskin`, `padding`, `backOpacity`, `contents`, `contentsBack`, `visible` … |
| [`Window_Scrollable`](../runtime/reactor_windows.js#L588) | constructor | 0 / 35 | `initialize(rect)`, `clearScrollStatus()`, `scrollX()` … | `cursorVisible`, `downArrowVisible`, `upArrowVisible` |
| [`Window_Selectable`](../runtime/reactor_windows.js#L834) | constructor | 0 / 90 | `initialize(rect)`, `index()`, `cursorFixed()` … | `cursorVisible` |
| [`Window_Command`](../runtime/reactor_windows.js#L1445) | constructor | 0 / 21 | `initialize(rect)`, `maxItems()`, `clearCommandList()` … | — |
| [`Window_HorzCommand`](../runtime/reactor_windows.js#L1570) | constructor | 0 / 3 | `initialize(rect)`, `maxCols()`, `itemTextAlign()` | — |
| [`Window_Help`](../runtime/reactor_windows.js#L1594) | constructor | 0 / 5 | `initialize(rect)`, `setText(text)`, `clear()` … | — |
| [`Window_Gold`](../runtime/reactor_windows.js#L1632) | constructor | 0 / 6 | `initialize(rect)`, `colSpacing()`, `refresh()` … | — |
| [`Window_StatusBase`](../runtime/reactor_windows.js#L1675) | constructor | 1 / 22 | `initialize(rect)`, `loadFaceImages()`, `refresh()` … | — |
| [`Window_MenuCommand`](../runtime/reactor_windows.js#L1826) | constructor | 1 / 16 | `initialize(rect)`, `makeCommandList()`, `addMainCommands()` … | — |
| [`Window_MenuStatus`](../runtime/reactor_windows.js#L1943) | constructor | 0 / 16 | `initialize(rect)`, `maxItems()`, `numVisibleRows()` … | — |
| [`Window_MenuActor`](../runtime/reactor_windows.js#L2050) | constructor | 0 / 4 | `initialize(rect)`, `processOk()`, `selectLast()` … | — |
| [`Window_ItemCategory`](../runtime/reactor_windows.js#L2099) | constructor | 0 / 7 | `initialize(rect)`, `maxCols()`, `update()` … | — |
| [`Window_ItemList`](../runtime/reactor_windows.js#L2158) | constructor | 0 / 18 | `initialize(rect)`, `setCategory(category)`, `maxCols()` … | — |
| [`Window_SkillType`](../runtime/reactor_windows.js#L2279) | constructor | 0 / 6 | `initialize(rect)`, `setActor(actor)`, `makeCommandList()` … | — |
| [`Window_SkillStatus`](../runtime/reactor_windows.js#L2334) | constructor | 0 / 3 | `initialize(rect)`, `setActor(actor)`, `refresh()` | — |
| [`Window_SkillList`](../runtime/reactor_windows.js#L2369) | constructor | 0 / 18 | `initialize(rect)`, `setActor(actor)`, `setStypeId(stypeId)` … | — |
| [`Window_EquipStatus`](../runtime/reactor_windows.js#L2484) | constructor | 0 / 15 | `initialize(rect)`, `setActor(actor)`, `colSpacing()` … | — |
| [`Window_EquipCommand`](../runtime/reactor_windows.js#L2599) | constructor | 0 / 3 | `initialize(rect)`, `maxCols()`, `makeCommandList()` | — |
| [`Window_EquipSlot`](../runtime/reactor_windows.js#L2625) | constructor | 0 / 13 | `initialize(rect)`, `setActor(actor)`, `update()` … | — |
| [`Window_EquipItem`](../runtime/reactor_windows.js#L2713) | constructor | 0 / 12 | `initialize(rect)`, `maxCols()`, `colSpacing()` … | — |
| [`Window_Status`](../runtime/reactor_windows.js#L2800) | constructor | 0 / 11 | `initialize(rect)`, `setActor(actor)`, `refresh()` … | — |
| [`Window_StatusParams`](../runtime/reactor_windows.js#L2894) | constructor | 0 / 6 | `initialize(rect)`, `setActor(actor)`, `maxItems()` … | — |
| [`Window_StatusEquip`](../runtime/reactor_windows.js#L2941) | constructor | 0 / 6 | `initialize(rect)`, `setActor(actor)`, `maxItems()` … | — |
| [`Window_Options`](../runtime/reactor_windows.js#L2988) | constructor | 0 / 18 | `initialize(rect)`, `makeCommandList()`, `addGeneralOptions()` … | — |
| [`Window_SavefileList`](../runtime/reactor_windows.js#L3122) | constructor | 0 / 23 | `initialize(rect)`, `setMode(mode, autosave)`, `maxItems()` … | `padding` |
| [`Window_ShopCommand`](../runtime/reactor_windows.js#L3237) | constructor | 0 / 4 | `initialize(rect)`, `setPurchaseOnly(purchaseOnly)`, `maxCols()` … | — |
| [`Window_ShopBuy`](../runtime/reactor_windows.js#L3268) | constructor | 0 / 16 | `initialize(rect)`, `setupGoods(shopGoods)`, `maxItems()` … | — |
| [`Window_ShopSell`](../runtime/reactor_windows.js#L3381) | constructor | 0 / 2 | `initialize(rect)`, `isEnabled(item)` | — |
| [`Window_ShopNumber`](../runtime/reactor_windows.js#L3402) | constructor | 0 / 34 | `initialize(rect)`, `isScrollEnabled()`, `number()` … | — |
| [`Window_ShopStatus`](../runtime/reactor_windows.js#L3644) | constructor | 0 / 18 | `initialize(rect)`, `refresh()`, `setItem(item)` … | — |
| [`Window_NameEdit`](../runtime/reactor_windows.js#L3799) | constructor | 0 / 15 | `initialize(rect)`, `setup(actor, maxLength)`, `name()` … | — |
| [`Window_NameInput`](../runtime/reactor_windows.js#L3926) | constructor | 0 / 29 | `initialize(rect)`, `setEditWindow(editWindow)`, `table()` … | `LATIN1`, `LATIN2`, `RUSSIA`, `JAPAN1`, `JAPAN2`, `JAPAN3` |
| [`Window_NameBox`](../runtime/reactor_windows.js#L4206) | constructor | 0 / 13 | `initialize()`, `setMessageWindow(messageWindow)`, `setName(name)` … | `openness`, `width`, `height`, `x`, `y`, `opacity` |
| [`Window_ChoiceList`](../runtime/reactor_windows.js#L4287) | constructor | 0 / 28 | `initialize()`, `setMessageWindow(messageWindow)`, `createCancelButton()` … | `openness`, `x`, `y`, `width`, `height` |
| [`Window_NumberInput`](../runtime/reactor_windows.js#L4464) | constructor | 0 / 28 | `initialize()`, `setMessageWindow(messageWindow)`, `start()` … | `openness`, `width`, `height`, `x`, `y` |
| [`Window_EventItem`](../runtime/reactor_windows.js#L4667) | constructor | 0 / 13 | `initialize(rect)`, `setMessageWindow(messageWindow)`, `createCancelButton()` … | `openness`, `y` |
| [`Window_Message`](../runtime/reactor_windows.js#L4781) | constructor | 0 / 45 | `initialize(rect)`, `initMembers()`, `setGoldWindow(goldWindow)` … | `openness`, `y`, `pause` |
| [`Window_ScrollText`](../runtime/reactor_windows.js#L5178) | constructor | 0 / 11 | `initialize(rect)`, `update()`, `startMessage()` … | `opacity` |
| [`Window_MapName`](../runtime/reactor_windows.js#L5295) | constructor | 0 / 8 | `initialize(rect)`, `update()`, `updateFadeIn()` … | `opacity`, `contentsOpacity` |
| [`Window_BattleLog`](../runtime/reactor_windows.js#L5360) | constructor | 0 / 82 | `initialize(rect)`, `setSpriteset(spriteset)`, `maxLines()` … | `opacity` |
| [`Window_PartyCommand`](../runtime/reactor_windows.js#L6033) | constructor | 0 / 3 | `initialize(rect)`, `makeCommandList()`, `setup()` | `openness` |
| [`Window_ActorCommand`](../runtime/reactor_windows.js#L6063) | constructor | 0 / 10 | `initialize(rect)`, `makeCommandList()`, `addAttackCommand()` … | `openness` |
| [`Window_BattleStatus`](../runtime/reactor_windows.js#L6148) | constructor | 0 / 22 | `initialize(rect)`, `extraHeight()`, `maxCols()` … | `frameVisible`, `openness`, `padding` |
| [`Window_BattleActor`](../runtime/reactor_windows.js#L6283) | constructor | 0 / 5 | `initialize(rect)`, `show()`, `hide()` … | `openness` |
| [`Window_BattleEnemy`](../runtime/reactor_windows.js#L6334) | constructor | 1 / 16 | `initialize(rect)`, `maxCols()`, `maxItems()` … | — |
| [`Window_BattleSkill`](../runtime/reactor_windows.js#L6479) | constructor | 0 / 3 | `initialize(rect)`, `show()`, `hide()` | — |
| [`Window_BattleItem`](../runtime/reactor_windows.js#L6507) | constructor | 0 / 4 | `initialize(rect)`, `includes(item)`, `show()` … | — |
| [`Window_TitleCommand`](../runtime/reactor_windows.js#L6539) | constructor | 1 / 6 | `initialize(rect)`, `makeCommandList()`, `isContinueEnabled()` … | `openness` |
| [`Window_GameEnd`](../runtime/reactor_windows.js#L6587) | constructor | 0 / 2 | `initialize(rect)`, `makeCommandList()` | `openness` |
| [`Window_DebugRange`](../runtime/reactor_windows.js#L6610) | constructor | 0 / 10 | `initialize(rect)`, `maxItems()`, `update()` … | `lastTopRow`, `lastIndex` |
| [`Window_DebugEdit`](../runtime/reactor_windows.js#L6690) | constructor | 0 / 12 | `initialize(rect)`, `maxItems()`, `drawItem(index)` … | — |
| [`DataManager`](../runtime/reactor_windows.js#L6876) | namespace/extension | 2 / 0 | `loadSavefileImages(info)`, `makeSavefileInfo()` | — |
| [`Window_RRSaveSlot`](../runtime/reactor_windows.js#L7026) | closure-local constructor | 0 / 2 | `initialize(rect)`, `setSlot(savefileId, selected)` | `visible` |
| [`Scene_File`](../runtime/reactor_windows.js#L7070) | namespace/extension | 0 / 6 | `helpWindowRect()`, `listWindowRect()`, `needsCancelButton()` … | — |

## reactor_3d.js

Counts show direct static / prototype methods. Properties combine explicit
static assignments, instance writes and accessors; lists are samples, not types.

| Symbol | Kind | Methods (static / prototype) | Representative methods | Public property/accessor examples |
| --- | --- | ---: | --- | --- |
| [`Reactor3D`](../runtime/reactor_3d.js#L43) | static | 105 / 0 | `workerUrl(name)`, `extensionsLoaded()`, `isLoaded()` … | `LIB_URL`, `SIDECAR_SUFFIX`, `EXTENSIONS`, `MODEL_TURN_SPEED`, `MODEL_TURN_SWEEP_FRAMES`, `MODE_2D` … |
| [`Reactor3D.GeometryDetail`](../runtime/reactor_3d.js#L715) | namespace/extension | 13 / 0 | `eligible(object)`, `signature(g)`, `fresh(state)` … | `enabled`, `pixelError` |
| [`Reactor3D.SkeletonUpdates`](../runtime/reactor_3d.js#L855) | namespace/extension | 2 / 0 | `install(skeleton)`, `prepare(scene)` | `enabled` |
| [`Reactor3D.EmptyPass`](../runtime/reactor_3d.js#L897) | namespace/extension | 2 / 0 | `hasWork(scene, camera)`, `render(viewport, target, scene, camera, draw)` | `enabled` |
| [`Reactor3D.Geometry`](../runtime/reactor_3d.js#L1480) | namespace/extension | 23 / 0 | `bands()`, `sheetRectFor(tileId, tileSize)`, `isWallAutotile(tileId)` … | `FLOOR_AUTOTILE_TABLE`, `WALL_AUTOTILE_TABLE`, `WATERFALL_AUTOTILE_TABLE`, `WALL_CAP_WEST`, `WALL_CAP_NORTH`, `WALL_CAP_EAST` … |
| [`Reactor3D.Geometry.FACING_NORMALS`](../runtime/reactor_3d.js#L1830) | namespace/extension | 0 / 0 | — | `south`, `north`, `east`, `west` |
| [`Reactor3D.CoveredFloor`](../runtime/reactor_3d.js#L5499) | namespace/extension | 5 / 0 | `opaque(image)`, `register(scene, mesh, bitmap, kind)`, `intact(record, opaque)` … | `enabled` |
| [`Reactor3D.Viewport`](../runtime/reactor_3d.js#L405) | constructor | 0 / 26 | `initialize()`, `isShared()`, `scale()` … | — |
| [`Reactor3D.MapScene`](../runtime/reactor_3d.js#L4821) | constructor | 0 / 39 | `initialize(mapData, bitmaps, options)`, `facadeAt(x, y)`, `setAnimationFrame(frame)` … | — |
| [`Game_Map`](../runtime/reactor_3d.js#L8337) | namespace/extension | 0 / 3 | `setup()`, `reactorCamera3D()`, `setReactorCamera3D(state, duration, keep)` | — |
| [`Game_Interpreter`](../runtime/reactor_3d.js#L8360) | namespace/extension | 0 / 1 | `updateWaitMode()` | — |
| [`Game_Player`](../runtime/reactor_3d.js#L8377) | namespace/extension | 0 / 1 | `moveByInput()` | — |
| [`Sprite_Character`](../runtime/reactor_3d.js#L8486) | namespace/extension | 0 / 1 | `updateVisibility()` | `visible` |

## reactor_3d_effects.js

Counts show direct static / prototype methods. Properties combine explicit
static assignments, instance writes and accessors; lists are samples, not types.

| Symbol | Kind | Methods (static / prototype) | Representative methods | Public property/accessor examples |
| --- | --- | ---: | --- | --- |
| [`Reactor3D`](../runtime/reactor_3d_effects.js#L38) | namespace/extension | 43 / 0 | `readModelEffects(json)`, `readEffectLight(raw)`, `effectLight(object, effect, key)` … | `BACKGROUND_WAIT_MODES`, `VIDEO_EFFECT_ID_BASE`, `MAX_ANCHORED_PER_MODEL`, `GpuEffects`, `EffectMeasure`, `EffekseerScene` … |
| [`Reactor3D.GpuEffects`](../runtime/reactor_3d_effects.js#L823) | namespace/extension | 15 / 0 | `restoreDefault()`, `create(renderer, samples)`, `forViewport(viewport)` … | `enabled` |
| [`Reactor3D.EffectMeasure`](../runtime/reactor_3d_effects.js#L1059) | namespace/extension | 4 / 0 | `request(play, source, rect, width, height, anchor, pxPerUnit, limit, upY)`, `finish(id)`, `receive(message)` … | `enabled` |
| [`Reactor3D.EffekseerScene`](../runtime/reactor_3d_effects.js#L1111) | namespace/extension | 22 / 0 | `passBudget()`, `settledInterval()`, `learnInterval()` … | `BUDGET`, `BUDGET_WEAK`, `RADIUS_FRAMES`, `MEASURE_EVERY`, `MEASURE_PAD`, `MEASURE_PAD_TILES` … |
| [`Reactor3D.Effects`](../runtime/reactor_3d_effects.js#L2223) | namespace/extension | 0 / 0 | — | `file` |
| [`Game_Interpreter`](../runtime/reactor_3d_effects.js#L2065) | namespace/extension | 0 / 2 | `updateWaitMode()`, `updateWaitMode()` | — |
| [`Game_Map`](../runtime/reactor_3d_effects.js#L2143) | namespace/extension | 0 / 2 | `updateInterpreter()`, `isEventRunning()` | — |
| [`Game_Event`](../runtime/reactor_3d_effects.js#L2174) | namespace/extension | 0 / 1 | `start()` | — |

## reactor_3d_lighting.js

Counts show direct static / prototype methods. Properties combine explicit
static assignments, instance writes and accessors; lists are samples, not types.

| Symbol | Kind | Methods (static / prototype) | Representative methods | Public property/accessor examples |
| --- | --- | ---: | --- | --- |
| [`Reactor3D`](../runtime/reactor_3d_lighting.js#L38) | namespace/extension | 79 / 0 | `lightIsAimed(light)`, `lightModeFor(mapData)`, `lightUniforms()` … | `LIGHT_POINT`, `LIGHT_SPOT`, `LIGHT_BEAM`, `LIGHT_SUN`, `DEFAULT_BEAM_LENGTH`, `DEFAULT_BEAM_WIDTH` … |
| [`Reactor3D.LightGrid`](../runtime/reactor_3d_lighting.js#L158) | namespace/extension | 5 / 0 | `ensure(uniforms)`, `fill(data, origin, count, pos, color, aim, slot = -1, cells = null)`, `update(uniforms, focus)` … | `enabled`, `size`, `step`, `cacheEnabled` |
| [`Reactor3D.TransparentPixels`](../runtime/reactor_3d_lighting.js#L949) | namespace/extension | 1 / 0 | `install(material)` | `enabled` |
| [`Reactor3D.Reflections`](../runtime/reactor_3d_lighting.js#L1093) | namespace/extension | 7 / 0 | `uniforms()`, `enabled()`, `faceToward(d)` … | `wanted` |
| [`Reactor3D.Mirrors`](../runtime/reactor_3d_lighting.js#L1379) | namespace/extension | 8 / 0 | `uniforms()`, `dummy()`, `clear()` … | `active`, `lastChoice` |
| [`Reactor3D.SHADOW_QUALITY`](../runtime/reactor_3d_lighting.js#L1943) | namespace/extension | 0 / 0 | — | `full`, `weak` |
| [`Reactor3D.Shadows`](../runtime/reactor_3d_lighting.js#L2068) | namespace/extension | 14 / 0 | `quality()`, `active()`, `appliesTo(renderer)` … | `focus`, `lastRenderAt`, `backlog`, `lastBudget`, `lastFrame`, `rowClearEnabled` |
| [`Reactor3D.LightShims`](../runtime/reactor_3d_lighting.js#L3535) | namespace/extension | 2 / 0 | `nova()`, `rave()` | — |
| [`Reactor3D.LightShims.nova`](../runtime/reactor_3d_lighting.js#L3785) | namespace/extension | 1 / 0 | `suppress(hide)` | — |
| [`Reactor3D.LightShims.rave`](../runtime/reactor_3d_lighting.js#L3816) | namespace/extension | 1 / 0 | `suppress(hide)` | — |
| [`Reactor3D.Lighting`](../runtime/reactor_3d_lighting.js#L4359) | namespace/extension | 0 / 0 | — | `file` |
| [`Reactor3D.MapScene`](../runtime/reactor_3d_lighting.js#L788) | namespace/extension | 0 / 2 | `updateCutaway(camera, mapData, character, others)`, `setCutLook(on)` | — |

## reactor_3d_models.js

Counts show direct static / prototype methods. Properties combine explicit
static assignments, instance writes and accessors; lists are samples, not types.

| Symbol | Kind | Methods (static / prototype) | Representative methods | Public property/accessor examples |
| --- | --- | ---: | --- | --- |
| [`Reactor3D`](../runtime/reactor_3d_models.js#L43) | namespace/extension | 182 / 0 | `splitModelRef(named)`, `modelSpecFromNote(note)`, `modelSourceName(name, ext, file)` … | `MODEL_DIR`, `MODEL_EXTS`, `DATABASE_SIDECAR_URL`, `COLLISION_WALK_HEIGHT`, `DENSE_TRIANGLES`, `DENSE_SAMPLES` … |
| [`reactorSplitGlb`](../runtime/reactor_3d_models.js#L1289) | closure-local helper | — | `reactorSplitGlb(buffer)` | — |
| [`reactorDecodeGlbImages`](../runtime/reactor_3d_models.js#L1313) | closure-local helper | — | `reactorDecodeGlbImages(json, buffer, binOffset)` | — |
| [`Reactor3D.RIG_BONE_ALIASES`](../runtime/reactor_3d_models.js#L3680) | namespace/extension | 0 / 0 | — | `Hips`, `Spine`, `Chest`, `Neck`, `Head`, `LeftUpperArm` … |
| [`Reactor3D.AXIS_VECTORS`](../runtime/reactor_3d_models.js#L4071) | namespace/extension | 0 / 0 | — | `x`, `y`, `z` |
| [`Reactor3D.Models`](../runtime/reactor_3d_models.js#L7081) | namespace/extension | 0 / 0 | — | `file` |
| [`Reactor3D.MapScene`](../runtime/reactor_3d_models.js#L6128) | namespace/extension | 0 / 5 | `modelsGroup()`, `aboveBillboardsGroup()`, `syncCharacterModels(characters)` … | — |
| [`Game_Event`](../runtime/reactor_3d_models.js#L6893) | namespace/extension | 0 / 2 | `pos(x, y)`, `isCollidedWithPlayerCharacters(x, y)` | — |
| [`Game_Map`](../runtime/reactor_3d_models.js#L7025) | namespace/extension | 0 / 2 | `checkPassage(x, y, bit)`, `setupEvents()` | — |

The two GLB helpers are inside this file's IIFE, not global functions. Their
source is reused by the worker, and tests access them via `Reactor3D._workerParts`;
their inclusion here does not call for ambient global declarations.

## reactor_3d_speech.js

Counts show direct static / prototype methods. Properties combine explicit
static assignments, instance writes and accessors; lists are samples, not types.

| Symbol | Kind | Methods (static / prototype) | Representative methods | Public property/accessor examples |
| --- | --- | ---: | --- | --- |
| [`Reactor3D`](../runtime/reactor_3d_speech.js#L435) | namespace/extension | 0 / 0 | — | `Speech` |
| [`Reactor3D.Speech`](../runtime/reactor_3d_speech.js#L435) | namespace/extension | 0 / 0 | — | `RATE`, `envelope`, `levelAt`, `prepare`, `attach`, `play` … |
| [`Game_Interpreter`](../runtime/reactor_3d_speech.js#L390) | namespace/extension | 0 / 1 | `updateWaitMode()` | — |
| [`Scene_Map`](../runtime/reactor_3d_speech.js#L409) | namespace/extension | 0 / 2 | `update()`, `terminate()` | — |
| [`Reactor3D.MapScene`](../runtime/reactor_3d_speech.js#L425) | namespace/extension | 0 / 2 | `syncCharacterModels()`, `clear()` | — |

## reactor_3d_world.js

Counts show direct static / prototype methods. Properties combine explicit
static assignments, instance writes and accessors; lists are samples, not types.

| Symbol | Kind | Methods (static / prototype) | Representative methods | Public property/accessor examples |
| --- | --- | ---: | --- | --- |
| [`Reactor3D`](../runtime/reactor_3d_world.js#L35) | namespace/extension | 57 / 0 | `terrainOf(mapData)`, `hasTerrain(mapData)`, `terrainHeightAt(mapData, wx, wz)` … | `TERRAIN_MAX`, `TERRAIN_SLOPE_LIMIT`, `SHAPE_KINDS`, `SHAPE_PARAMS`, `PIECE_KINDS`, `HOLLOW_KINDS` … |
| [`Reactor3D.SHAPE_PARAMS`](../runtime/reactor_3d_world.js#L276) | namespace/extension | 0 / 0 | — | `hull`, `spike`, `capsule`, `dish`, `fin`, `cylinder` … |
| [`Reactor3D.PIECE_FINISHES`](../runtime/reactor_3d_world.js#L461) | namespace/extension | 0 / 0 | — | `mirror`, `chrome`, `polished`, `glossy`, `gold` |
| [`Reactor3D.World`](../runtime/reactor_3d_world.js#L1970) | namespace/extension | 0 / 0 | — | `file` |
| [`Reactor3D.MapScene`](../runtime/reactor_3d_world.js#L843) | namespace/extension | 0 / 14 | `updateTerrain(mapData, region)`, `piecesGroup()`, `materialTexture(name, load)` … | — |

## JSDoc parameters and return-value checks

These are representative source observations, not declarations added in Step 1.
Most manager, game, scene and window methods have no structured parameter/return
JSDoc. Their signatures must be derived from bodies and call sites, rather than
silently assigning `any` or assuming that every method without `@returns` is void.

| API | Parameter evidence | Return evidence |
| --- | --- | --- |
| `Utils.isOptionValid(name)` | JSDoc: `name: string` | JSDoc/body: `boolean` |
| `Bitmap(width, height)` | Constructor JSDoc and `initialize`: two numbers | New `Bitmap` instance; the wrapper forwards `arguments` |
| `Bitmap.prototype.blt(source, sx, sy, sw, sh, dx, dy, dw, dh)` | JSDoc: `source: Bitmap`, numeric coordinates/sizes, optional `dw=sw`, `dh=sh` | No returned value in body |
| `Bitmap.prototype.getPixel(x, y)` | JSDoc: two numbers | JSDoc/body: CSS color `string` |
| `Bitmap.prototype.measureTextWidth(text)` | JSDoc: `text: string` | JSDoc/body: pixel width `number` |
| `Sprite.prototype.move(x, y)` | JSDoc: two numbers | Assigns position, no returned value |
| `ImageManager.loadPicture(filename)` | String filename passed to `loadBitmap` | Returns a `Bitmap` through `loadBitmap` |
| `StorageManager.loadObject(saveName)` | Save name forwarded to storage; no parameter JSDoc | Promise chain resolves parsed JSON; the data shape is not known here |
| `DataManager.loadGlobalInfo()` | No arguments | Cached array when available; otherwise starts async work and returns `undefined` |
| `Game_Actors.prototype.actor(actorId)` | Actor ID used to index `$dataActors` | Cached/new `Game_Actor`, or explicitly `null` for an absent actor |
| `Game_Battler.prototype.gainHp(value)` | Numeric delta passed to `setHp(this.hp + value)` | No returned value |
| `Reactor3D.isLoaded()` | No arguments | Boolean `typeof THREE !== "undefined"` |

## Global and compatibility details to preserve

- Database and game globals are assigned `null` before initialization. Database
  arrays also use nullable/sparse entries. The next step must choose and document
  a lifecycle-aware nullability contract. In particular, the plan's illustrative
  `const actor: Game_Actor = $gameActors.actor(1)` cannot be assumed safe for all IDs.
- The core also extends `Array.prototype` (`clone`, `contains`, `equals`, `remove`),
  `Number.prototype` (`clamp`, `mod`, `padZero`), `String.prototype` (`contains`,
  `format`, `padZero`), and `Math.randomInt`. These are augmentations of existing
  globals, not new constructors. `contains` is marked deprecated in JSDoc.
- The Runtime's `Window` constructor shares a name with DOM `Window`. With the
  DOM library enabled, a naive ambient `declare class Window` conflicts with
  TypeScript's browser declarations. Resolve the naming/consumer strategy before
  declaring the window hierarchy; do not hide the conflict with `skipLibCheck`.
- `Point`, `Rectangle`, `Sprite`, `Stage`, `Window` and related rendering classes
  have Pixi inheritance/compatibility behavior. Historical JSDoc such as
  `PIXI.BaseTexture` is not sufficient evidence for Pixi 8 types. Inspect the
  implementation and installed `pixi.js` declarations before choosing signatures.
- `Object.defineProperty` / `Object.defineProperties` expose both read-only and
  writable properties, e.g. `Bitmap.url`, `Bitmap.width`, `Bitmap.smooth`,
  `Graphics.width`, `Game_BattlerBase.hp`, and `TextManager.currencyUnit`.
  Setter presence, not naming convention, determines mutability.
- Cross-file patches extend existing classes. Methods observed in one file are
  not the entire loaded API. Constructor wrappers often have no formal parameters
  and forward `arguments` to `initialize`; use the latter when typing construction.
- `Reactor3D.EXTENSIONS` loads lighting, models, effects, world and speech in order.
  These files extend the same global namespace and sometimes existing game
  prototypes. `Lighting`, `Models`, `Effects` and `World` include load-marker
  objects; many implementation methods are directly on `Reactor3D`.
- `reactor_3d_speech.js` aliases `Reactor3D` as `R`, then publishes `Speech` with
  `RATE`, `envelope`, `levelAt`, `prepare`, `attach`, `play`, `stop`, `tick`,
  `active`, and `install`. Several are closure-local function aliases, so the
  syntactic table records them as properties rather than inferred signatures.
- `reactor_3d.js` exports the same camera object as `Reactor3D.Camera` and the
  global `RPGReactorCamera3D`. It exposes camera constants, normalization,
  placement, state, movement and hook methods (`normalizeState`, `currentState`,
  `change`, `update`, `installHooks`, etc.). Three.js loads lazily; availability
  must not be assumed before initialization.
- Other Runtime files (including MV compatibility, media surfaces, physics,
  quests and screen effects) are outside this initial twelve-file survey. Check
  their patches as the relevant API is declared in later steps.
