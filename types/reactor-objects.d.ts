/** Common game APIs from reactor_objects.js; valid database records are a construction precondition. */
declare class Game_Temp {
    constructor();
    initialize(): void;
    isPlaytest(): boolean;
    reserveCommonEvent(commonEventId: number): void;
    clearCommonEventReservation(): void;
    isCommonEventReserved(): boolean;
    retrieveCommonEvent(): RPGReactor.CommonEventData | null | undefined;
    setDestination(x: number, y: number): void;
    clearDestination(): void;
    isDestinationValid(): boolean;
    destinationX(): number | null;
    destinationY(): number | null;
    requestAnimation(targets: Array<Game_CharacterBase | Game_Battler>, animationId: number, mirror?: boolean): void;
    requestBalloon(target: Game_CharacterBase, balloonId: number): void;
    requestBattleRefresh(): void;
    isBattleRefreshRequested(): boolean;
}
declare class Game_System {
    constructor();
    initialize(): void;
    isSaveEnabled(): boolean; enableSave(): void; disableSave(): void;
    isMenuEnabled(): boolean; enableMenu(): void; disableMenu(): void;
    isEncounterEnabled(): boolean; enableEncounter(): void; disableEncounter(): void;
    isFormationEnabled(): boolean; enableFormation(): void; disableFormation(): void;
    isSideView(): boolean;
    savefileId(): number; setSavefileId(savefileId: number): void;
    battleCount(): number; winCount(): number; escapeCount(): number; saveCount(): number;
    playtime(): number; playtimeText(): string;
    onBeforeSave(): void; onAfterLoad(): void;
    mainFontFace(): string; numberFontFace(): string; mainFontSize(): number;
    windowPadding(): number; lineHeight(): number; windowOpacity(): number;
    windowTone(): RPGReactor.ColorTone;
    setWindowTone(tone: RPGReactor.ColorTone | null): void;
    battleBgm(): RPGReactor.AudioFile;
    setBattleBgm(bgm: RPGReactor.AudioFile | null): void;
    victoryMe(): RPGReactor.AudioFile; defeatMe(): RPGReactor.AudioFile;
}
declare class Game_Screen {
    constructor(); initialize(): void; clear(): void; update(): void;
    brightness(): number; tone(): RPGReactor.ColorTone; flashColor(): RPGReactor.BlendColor;
    shake(): number; zoomX(): number; zoomY(): number; zoomScale(): number;
    startFadeOut(duration: number): void; startFadeIn(duration: number): void;
    startTint(tone: RPGReactor.ColorTone, duration: number): void;
    startFlash(color: RPGReactor.BlendColor, duration: number): void;
    startShake(power: number, speed: number, duration: number): void;
    startZoom(x: number, y: number, scale: number, duration: number): void;
    setZoom(x: number, y: number, scale: number): void;
    changeWeather(type: string, power: number, duration: number): void;
    weatherType(): string; weatherPower(): number;
    maxPictures(): number;
    picture(pictureId: number): Game_Picture | null | undefined;
    showPicture(pictureId: number, name: string, origin: number, x: number, y: number,
        scaleX: number, scaleY: number, opacity: number, blendMode: number): void;
    movePicture(pictureId: number, origin: number, x: number, y: number, scaleX: number,
        scaleY: number, opacity: number, blendMode: number, duration: number, easingType?: number): void;
    rotatePicture(pictureId: number, speed: number): void;
    tintPicture(pictureId: number, tone: RPGReactor.ColorTone, duration: number): void;
    erasePicture(pictureId: number): void;
}
declare class Game_Picture {
    constructor(); initialize(): void;
    name(): string; origin(): number; x(): number; y(): number;
    scaleX(): number; scaleY(): number; opacity(): number; blendMode(): number;
    tone(): RPGReactor.ColorTone | null; angle(): number;
    rotate(speed: number): void; tint(tone: RPGReactor.ColorTone, duration: number): void;
    update(): void;
}
declare class Game_Timer {
    constructor(); initialize(): void;
    start(count: number): void; stop(): void; isWorking(): boolean;
    seconds(): number; frames(): number; update(sceneActive?: boolean): void;
}
declare class Game_Message {
    constructor(); initialize(): void;
    add(text: string): void; clear(): void; isBusy(): boolean; allText(): string;
    hasText(): boolean; isChoice(): boolean;
    choices(): string[]; speakerName(): string; faceName(): string; faceIndex(): number;
    setSpeakerName(speakerName: string): void;
    setFaceImage(faceName: string, faceIndex: number): void;
    setBackground(background: number): void; setPositionType(positionType: number): void;
    setChoices(choices: string[], defaultType: number, cancelType: number): void;
    setChoiceCallback(callback: (index: number) => void): void;
    setNumberInput(variableId: number, maxDigits: number): void;
    setItemChoice(variableId: number, itemType: number): void;
    setScroll(speed: number, noFast: boolean): void;
}
declare class Game_Switches {
    constructor(); initialize(): void; clear(): void;
    value(switchId: number): boolean; setValue(switchId: number, value: boolean): void;
}
declare class Game_Variables {
    constructor(); initialize(): void; clear(): void;
    /** Arbitrary script values; narrow before use. */
    value(variableId: number): unknown; setValue(variableId: number, value: unknown): void;
}
declare class Game_SelfSwitches {
    constructor(); initialize(): void; clear(): void;
    value(key: [mapId: number, eventId: number, channel: string]): boolean;
    setValue(key: [mapId: number, eventId: number, channel: string], value: boolean): void;
}

declare class Game_BattlerBase {
    static readonly TRAIT_ELEMENT_RATE: 11;
    static readonly TRAIT_DEBUFF_RATE: 12;
    static readonly TRAIT_STATE_RATE: 13;
    static readonly TRAIT_STATE_RESIST: 14;
    static readonly TRAIT_PARAM: 21;
    static readonly TRAIT_XPARAM: 22;
    static readonly TRAIT_SPARAM: 23;
    static readonly TRAIT_ATTACK_ELEMENT: 31;
    static readonly TRAIT_ATTACK_STATE: 32;
    static readonly TRAIT_ATTACK_SPEED: 33;
    static readonly TRAIT_ATTACK_TIMES: 34;
    static readonly TRAIT_ATTACK_SKILL: 35;
    static readonly TRAIT_STYPE_ADD: 41;
    static readonly TRAIT_STYPE_SEAL: 42;
    static readonly TRAIT_SKILL_ADD: 43;
    static readonly TRAIT_SKILL_SEAL: 44;
    static readonly TRAIT_EQUIP_WTYPE: 51;
    static readonly TRAIT_EQUIP_ATYPE: 52;
    static readonly TRAIT_EQUIP_LOCK: 53;
    static readonly TRAIT_EQUIP_SEAL: 54;
    static readonly TRAIT_SLOT_TYPE: 55;
    static readonly TRAIT_ACTION_PLUS: 61;
    static readonly TRAIT_SPECIAL_FLAG: 62;
    static readonly TRAIT_COLLAPSE_TYPE: 63;
    static readonly TRAIT_PARTY_ABILITY: 64;
    static readonly FLAG_ID_AUTO_BATTLE: 0;
    static readonly FLAG_ID_GUARD: 1;
    static readonly FLAG_ID_SUBSTITUTE: 2;
    static readonly FLAG_ID_PRESERVE_TP: 3;
    static readonly ICON_BUFF_START: 32;
    static readonly ICON_DEBUFF_START: 48;
    static readonly PARAM_MAX_TP: 8;


    constructor();
    /** ES5 constructors forward arguments to subclass initializers. */
    initialize(...args: unknown[]): void;
    initMembers(): void;
    readonly hp: number; readonly mp: number; readonly tp: number;
    readonly mhp: number; readonly mmp: number;
    readonly atk: number; readonly def: number; readonly mat: number; readonly mdf: number;
    readonly agi: number; readonly luk: number;
    readonly hit: number; readonly eva: number; readonly cri: number; readonly cev: number;
    readonly mev: number; readonly mrf: number; readonly cnt: number;
    readonly hrg: number; readonly mrg: number; readonly trg: number;
    readonly tgr: number; readonly grd: number; readonly rec: number; readonly pha: number;
    readonly mcr: number; readonly tcr: number; readonly pdr: number; readonly mdr: number;
    readonly fdr: number; readonly exr: number;
    setHp(hp: number): void; setMp(mp: number): void; setTp(tp: number): void;
    maxTp(): number; hpRate(): number; mpRate(): number; tpRate(): number;
    refresh(): void; recoverAll(): void; die(): void; revive(): void;
    hide(): void; appear(): void; isHidden(): boolean; isAppeared(): boolean;
    isAlive(): boolean; isDead(): boolean; isDying(): boolean;
    isActor(): boolean; isEnemy(): boolean; canInput(): boolean; canMove(): boolean;
    isConfused(): boolean; confusionLevel(): number; restriction(): number;
    isStateAffected(stateId: number): boolean; isDeathStateAffected(): boolean;
    deathStateId(): number; clearStates(): void; eraseState(stateId: number): void;
    states(): RPGReactor.StateData[];
    stateIcons(): number[]; buffIcons(): number[]; allIcons(): number[];
    param(paramId: number): number; xparam(paramId: number): number; sparam(paramId: number): number;
    paramBase(paramId: number): number; paramPlus(paramId: number): number;
    addParam(paramId: number, value: number): void;
    elementRate(elementId: number): number; stateRate(stateId: number): number;
    debuffRate(paramId: number): number; isStateResist(stateId: number): boolean;
    isBuffAffected(paramId: number): boolean; isDebuffAffected(paramId: number): boolean;
    attackSkillId(): number; guardSkillId(): number;
    skillMpCost(skill: RPGReactor.SkillData): number; skillTpCost(skill: RPGReactor.SkillData): number;
    canPaySkillCost(skill: RPGReactor.SkillData): boolean; paySkillCost(skill: RPGReactor.SkillData): void;
    canUse(item: RPGReactor.SkillData | RPGReactor.ItemData | null): boolean;
    canEquip(item: RPGReactor.EquipmentData | null): boolean;
    canAttack(): boolean; canGuard(): boolean;
}

declare class Game_Battler extends Game_BattlerBase {
    constructor();
    gainHp(value: number): void; gainMp(value: number): void; gainTp(value: number): void;
    gainSilentTp(value: number): void; clearTp(): void;
    addState(stateId: number): void; removeState(stateId: number): void;
    isStateAddable(stateId: number): boolean;
    addBuff(paramId: number, turns: number): void;
    addDebuff(paramId: number, turns: number): void; removeBuff(paramId: number): void;
    removeAllBuffs(): void; removeBattleStates(): void;
    result(): Game_ActionResult; clearResult(): void;
    action(index: number): Game_Action | undefined;
    setAction(index: number, action: Game_Action): void;
    numActions(): number; clearActions(): void; makeActions(): void;
    currentAction(): Game_Action | undefined; removeCurrentAction(): void;
    forceAction(skillId: number, targetIndex: number): void;
    useItem(item: RPGReactor.SkillData | RPGReactor.ItemData): void;
    consumeItem(item: RPGReactor.ItemData): void;
    regenerateAll(): void; onTurnEnd(): void;
    onBattleStart(advantageous?: boolean): void; onBattleEnd(): void;
    startDamagePopup(): void; clearDamagePopup(): void; isDamagePopupRequested(): boolean;
    requestEffect(effectType: string): void; requestMotion(motionType: string): void;
    select(): void; deselect(): void; isSelected(): boolean;
    tpbChargeTime(): number; isTpbCharged(): boolean; isTpbReady(): boolean;
}

declare class Game_Actor extends Game_Battler {
    constructor(actorId: number);
    initialize(actorId: number): void; setup(actorId: number): void;
    readonly level: number;
    actorId(): number; actor(): RPGReactor.ActorData; currentClass(): RPGReactor.ClassData;
    name(): string; setName(name: string): void;
    nickname(): string; setNickname(nickname: string): void;
    profile(): string; setProfile(profile: string): void;
    characterName(): string; characterIndex(): number; faceName(): string; faceIndex(): number;
    battlerName(): string;
    setCharacterImage(name: string, index: number): void;
    setFaceImage(name: string, index: number): void; setBattlerImage(name: string): void;
    currentExp(): number; nextLevelExp(): number; nextRequiredExp(): number;
    maxLevel(): number; isMaxLevel(): boolean; expForLevel(level: number): number;
    changeLevel(level: number, show?: boolean): void;
    changeExp(exp: number, show?: boolean): void; gainExp(exp: number): void;
    changeClass(classId: number, keepExp?: boolean): void;
    levelUp(): void; levelDown(): void;
    learnSkill(skillId: number): void; forgetSkill(skillId: number): void;
    isLearnedSkill(skillId: number): boolean; hasSkill(skillId: number): boolean;
    skills(): RPGReactor.SkillData[]; usableSkills(): RPGReactor.SkillData[];
    equipSlots(): number[];
    equips(): Array<RPGReactor.WeaponData | RPGReactor.ArmorData | null | undefined>;
    weapons(): RPGReactor.WeaponData[]; armors(): RPGReactor.ArmorData[];
    changeEquip(slotId: number, item: RPGReactor.WeaponData | RPGReactor.ArmorData | null): void;
    forceChangeEquip(slotId: number, item: RPGReactor.WeaponData | RPGReactor.ArmorData | null): void;
    clearEquipments(): void; optimizeEquipments(): void; isEquipChangeOk(slotId: number): boolean;
    hasWeapon(weapon: RPGReactor.WeaponData): boolean; hasArmor(armor: RPGReactor.ArmorData): boolean;
    isEquipped(item: RPGReactor.WeaponData | RPGReactor.ArmorData): boolean;
    friendsUnit(): Game_Party; opponentsUnit(): Game_Troop;
    index(): number; isBattleMember(): boolean;
    inputtingAction(): Game_Action | undefined;
    selectNextCommand(): boolean; selectPreviousCommand(): boolean;
}

declare class Game_Enemy extends Game_Battler {
    constructor(enemyId: number, x: number, y: number);
    initialize(enemyId: number, x: number, y: number): void;
    setup(enemyId: number, x: number, y: number): void;
    enemyId(): number; enemy(): RPGReactor.EnemyData; index(): number;
    name(): string; originalName(): string; battlerName(): string; battlerHue(): number;
    screenX(): number; screenY(): number; exp(): number; gold(): number;
    friendsUnit(): Game_Troop; opponentsUnit(): Game_Party;
    makeDropItems(): Array<RPGReactor.InventoryItem | null | undefined>;
    transform(enemyId: number): void;
}

declare class Game_ActionResult {

    constructor(); initialize(): void; clear(): void;
    used: boolean; missed: boolean; evaded: boolean; physical: boolean; drain: boolean; critical: boolean;
    success: boolean; hpAffected: boolean; hpDamage: number; mpDamage: number; tpDamage: number;
    addedStates: number[]; removedStates: number[]; addedBuffs: number[]; addedDebuffs: number[]; removedBuffs: number[];
    isHit(): boolean; isStatusAffected(): boolean;
    addedStateObjects(): RPGReactor.StateData[]; removedStateObjects(): RPGReactor.StateData[];
    isStateAdded(stateId: number): boolean; isStateRemoved(stateId: number): boolean;
}

declare class Game_Action {
    static readonly EFFECT_RECOVER_HP: 11;
    static readonly EFFECT_RECOVER_MP: 12;
    static readonly EFFECT_GAIN_TP: 13;
    static readonly EFFECT_ADD_STATE: 21;
    static readonly EFFECT_REMOVE_STATE: 22;
    static readonly EFFECT_ADD_BUFF: 31;
    static readonly EFFECT_ADD_DEBUFF: 32;
    static readonly EFFECT_REMOVE_BUFF: 33;
    static readonly EFFECT_REMOVE_DEBUFF: 34;
    static readonly EFFECT_SPECIAL: 41;
    static readonly EFFECT_GROW: 42;
    static readonly EFFECT_LEARN_SKILL: 43;
    static readonly EFFECT_COMMON_EVENT: 44;
    static readonly SPECIAL_EFFECT_ESCAPE: 0;
    static readonly HITTYPE_CERTAIN: 0;
    static readonly HITTYPE_PHYSICAL: 1;
    static readonly HITTYPE_MAGICAL: 2;
    static readonly SCOPE_ONE_ALLY_OR_ENEMY: 15;
    static readonly SCOPE_ONE_ENEMY_OR_ALLY: 16;
    static readonly SCOPE_ALL_ONE_SIDE: 17;
    static readonly SCOPE_ALL_ALLIES_BUT_USER: 18;
    static readonly SCOPE_RANDOM_ANY_1: 19;
    static readonly SCOPE_RANDOM_ANY_2: 20;
    static readonly SCOPE_RANDOM_ANY_3: 21;
    static readonly SCOPE_RANDOM_ANY_4: 22;

    constructor(subject: Game_Battler, forcing?: boolean);
    initialize(subject: Game_Battler, forcing?: boolean): void;
    clear(): void; setSubject(subject: Game_Battler): void;
    subject(): Game_Actor | Game_Enemy | null | undefined;
    setAttack(): void; setGuard(): void;
    setSkill(skillId: number): void; setItem(itemId: number): void;
    setItemObject(item: RPGReactor.SkillData | RPGReactor.InventoryItem | null): void;
    setTarget(targetIndex: number): void; setTargetBattler(battler: Game_Battler | null): void;
    item(): RPGReactor.SkillData | RPGReactor.InventoryItem | null | undefined;
    friendsUnit(): Game_Unit; opponentsUnit(): Game_Unit;
    isSkill(): boolean; isItem(): boolean; isAttack(): boolean; isGuard(): boolean;
    isForOpponent(): boolean; isForFriend(): boolean; isForEveryone(): boolean;
    isForOne(): boolean; isForAll(): boolean; isForUser(): boolean; needsSelection(): boolean;
    isForAliveFriend(): boolean; isForDeadFriend(): boolean;
    isPhysical(): boolean; isMagical(): boolean; isCertainHit(): boolean;
    isDamage(): boolean; isRecover(): boolean; isDrain(): boolean;
    isValid(): boolean | RPGReactor.SkillData | RPGReactor.InventoryItem;
    numRepeats(): number; numTargets(): number; speed(): number;
    prepare(): void; makeTargets(): Game_Battler[];
    apply(target: Game_Battler): void; applyGlobal(): void;
    testApply(target: Game_Battler): boolean;
    makeDamageValue(target: Game_Battler, critical: boolean): number;
    evalDamageFormula(target: Game_Battler): number;
    calcElementRate(target: Game_Battler): number;
    itemHit(target?: Game_Battler): number; itemEva(target: Game_Battler): number;
    itemCri(target: Game_Battler): number;
    executeDamage(target: Game_Battler, value: number): void;
}
declare class Game_Actors { constructor(); initialize(): void; actor(actorId: number): Game_Actor | null }

declare class Game_Unit {
    constructor(); initialize(): void;
    inBattle(): boolean; members(): Game_Battler[];
    aliveMembers(): Game_Battler[]; deadMembers(): Game_Battler[]; movableMembers(): Game_Battler[];
    randomTarget(): Game_Battler | null; randomDeadTarget(): Game_Battler | null;
    smoothTarget(index: number): Game_Battler | undefined;
    smoothDeadTarget(index: number): Game_Battler | undefined;
    substituteBattler(): Game_Battler | undefined;
    agility(): number; isAllDead(): boolean;
    clearActions(): void; makeActions(): void; clearResults(): void;
    onBattleStart(advantageous?: boolean): void; onBattleEnd(): void;
    select(activeMember: Game_Battler | null): void;
}
declare class Game_Party extends Game_Unit {
    constructor();
    exists(): boolean; size(): number; isEmpty(): boolean;
    members(): Game_Actor[]; allMembers(): Game_Actor[]; battleMembers(): Game_Actor[];
    leader(): Game_Actor | undefined;
    gold(): number; gainGold(amount: number): void; loseGold(amount: number): void;
    steps(): number;
    items(): RPGReactor.ItemData[]; weapons(): RPGReactor.WeaponData[]; armors(): RPGReactor.ArmorData[];
    allItems(): RPGReactor.InventoryItem[];
    gainItem(item: RPGReactor.InventoryItem | null, amount: number, includeEquip?: boolean): void;
    loseItem(item: RPGReactor.InventoryItem | null, amount: number, includeEquip?: boolean): void;
    numItems(item: RPGReactor.InventoryItem | null): number;
    hasItem(item: RPGReactor.InventoryItem | null, includeEquip?: boolean): boolean;
    maxItems(item: RPGReactor.InventoryItem): number;
    addActor(actorId: number): void; removeActor(actorId: number): void;
    menuActor(): Game_Actor | null | undefined; setMenuActor(actor: Game_Actor): void;
    targetActor(): Game_Actor | null | undefined; setTargetActor(actor: Game_Actor): void;
    swapOrder(index1: number, index2: number): void;
    highestLevel(): number;
}
declare class Game_Troop extends Game_Unit {
    constructor(); setup(troopId: number): void; clear(): void;
    members(): Game_Enemy[]; troop(): RPGReactor.TroopData | null | undefined;
    turnCount(): number; enemyNames(): string[]; isEventRunning(): boolean;
    expTotal(): number; goldTotal(): number;
}

declare class Game_CharacterBase {

    constructor(); initialize(...args: unknown[]): void;
    initMembers(): void;
    readonly x: number; readonly y: number;
    direction(): number; setDirection(direction: number): void;
    locate(x: number, y: number): void; setPosition(x: number, y: number): void;
    pos(x: number, y: number): boolean;
    isMoving(): boolean; isJumping(): boolean; isStopping(): boolean;
    isThrough(): boolean; setThrough(through: boolean): void;
    isTransparent(): boolean; setTransparent(transparent: boolean): void;
    isDirectionFixed(): boolean; setDirectionFix(fixed: boolean): void;
    setMoveSpeed(speed: number): void; realMoveSpeed(): number;
    setMoveFrequency(frequency: number): void;
    moveStraight(direction: number): void; moveDiagonally(horizontal: number, vertical: number): void;
    jump(xPlus: number, yPlus: number): void;
    canPass(x: number, y: number, direction: number): boolean;
    isMapPassable(x: number, y: number, direction: number): boolean;
    characterName(): string; characterIndex(): number; tileId(): number;
    setImage(characterName: string, characterIndex: number): void; setTileImage(tileId: number): void;
    opacity(): number; setOpacity(opacity: number): void;
    blendMode(): number; setBlendMode(blendMode: number): void;
    screenX(): number; screenY(): number; screenZ(): number;
    update(): void;
}
declare class Game_Character extends Game_CharacterBase {
    static readonly ROUTE_END: 0;
    static readonly ROUTE_MOVE_DOWN: 1;
    static readonly ROUTE_MOVE_LEFT: 2;
    static readonly ROUTE_MOVE_RIGHT: 3;
    static readonly ROUTE_MOVE_UP: 4;
    static readonly ROUTE_MOVE_LOWER_L: 5;
    static readonly ROUTE_MOVE_LOWER_R: 6;
    static readonly ROUTE_MOVE_UPPER_L: 7;
    static readonly ROUTE_MOVE_UPPER_R: 8;
    static readonly ROUTE_MOVE_RANDOM: 9;
    static readonly ROUTE_MOVE_TOWARD: 10;
    static readonly ROUTE_MOVE_AWAY: 11;
    static readonly ROUTE_MOVE_FORWARD: 12;
    static readonly ROUTE_MOVE_BACKWARD: 13;
    static readonly ROUTE_JUMP: 14;
    static readonly ROUTE_WAIT: 15;
    static readonly ROUTE_TURN_DOWN: 16;
    static readonly ROUTE_TURN_LEFT: 17;
    static readonly ROUTE_TURN_RIGHT: 18;
    static readonly ROUTE_TURN_UP: 19;
    static readonly ROUTE_TURN_90D_R: 20;
    static readonly ROUTE_TURN_90D_L: 21;
    static readonly ROUTE_TURN_180D: 22;
    static readonly ROUTE_TURN_90D_R_L: 23;
    static readonly ROUTE_TURN_RANDOM: 24;
    static readonly ROUTE_TURN_TOWARD: 25;
    static readonly ROUTE_TURN_AWAY: 26;
    static readonly ROUTE_SWITCH_ON: 27;
    static readonly ROUTE_SWITCH_OFF: 28;
    static readonly ROUTE_CHANGE_SPEED: 29;
    static readonly ROUTE_CHANGE_FREQ: 30;
    static readonly ROUTE_WALK_ANIME_ON: 31;
    static readonly ROUTE_WALK_ANIME_OFF: 32;
    static readonly ROUTE_STEP_ANIME_ON: 33;
    static readonly ROUTE_STEP_ANIME_OFF: 34;
    static readonly ROUTE_DIR_FIX_ON: 35;
    static readonly ROUTE_DIR_FIX_OFF: 36;
    static readonly ROUTE_THROUGH_ON: 37;
    static readonly ROUTE_THROUGH_OFF: 38;
    static readonly ROUTE_TRANSPARENT_ON: 39;
    static readonly ROUTE_TRANSPARENT_OFF: 40;
    static readonly ROUTE_CHANGE_IMAGE: 41;
    static readonly ROUTE_CHANGE_OPACITY: 42;
    static readonly ROUTE_CHANGE_BLEND_MODE: 43;
    static readonly ROUTE_PLAY_SE: 44;
    static readonly ROUTE_SCRIPT: 45;

    constructor();
    setMoveRoute(route: RPGReactor.MoveRoute): void;
    forceMoveRoute(route: RPGReactor.MoveRoute): void;
    isMoveRouteForcing(): boolean;
    moveRandom(): void; moveTowardCharacter(character: Game_CharacterBase): void;
    moveAwayFromCharacter(character: Game_CharacterBase): void;
    moveTowardPlayer(): void; moveAwayFromPlayer(): void; moveForward(): void; moveBackward(): void;
    turnTowardCharacter(character: Game_CharacterBase): void;
    turnAwayFromCharacter(character: Game_CharacterBase): void;
    turnTowardPlayer(): void; turnAwayFromPlayer(): void;
    findDirectionTo(goalX: number, goalY: number): number;
}
declare class Game_Player extends Game_Character {
    constructor();
    reserveTransfer(mapId: number, x: number, y: number, direction?: number, fadeType?: number): void;
    isTransferring(): boolean; performTransfer(): void;
    canMove(): boolean; isDashing(): boolean;
    isInVehicle(): boolean; isInBoat(): boolean; isInShip(): boolean; isInAirship(): boolean;
    getOnVehicle(): boolean; getOffVehicle(): boolean;
    executeEncounter(): boolean;
    update(sceneActive?: boolean): void;
}
declare class Game_Event extends Game_Character {
    constructor(mapId: number, eventId: number);
    initialize(mapId: number, eventId: number): void;
    eventId(): number; event(): RPGReactor.MapEventData | null | undefined;
    page(): RPGReactor.EventPage | undefined;
    list(): RPGReactor.EventCommand[];
    start(): void; erase(): void; refresh(): void; isStarting(): boolean;
    clearStartingFlag(): void;
}
declare class Game_Map {
    constructor(); initialize(): void; setup(mapId: number): void;
    mapId(): number; width(): number; height(): number; tileWidth(): number; tileHeight(): number;
    data(): number[];
    displayX(): number; displayY(): number;
    setDisplayPos(x: number, y: number): void;
    adjustX(x: number): number; adjustY(y: number): number;
    roundX(x: number): number; roundY(y: number): number;
    isLoopHorizontal(): boolean; isLoopVertical(): boolean;
    isValid(x: number, y: number): boolean;
    isPassable(x: number, y: number, direction: number): boolean;
    isEventRunning(): boolean;
    event(eventId: number): Game_Event | null | undefined; events(): Game_Event[];
    eventsXy(x: number, y: number): Game_Event[]; eventIdXy(x: number, y: number): number;
    eraseEvent(eventId: number): void;
    requestRefresh(): void; refresh(): void; update(sceneActive?: boolean): void;
    regionId(x: number, y: number): number; terrainTag(x: number, y: number): number;
    tileId(x: number, y: number, z: number): number;
    startScroll(direction: number, distance: number, speed: number): void;
    isScrolling(): boolean;
}
declare class Game_Interpreter {
    constructor(depth?: number); initialize(depth?: number): void;
    clear(): void; setup(list: RPGReactor.EventCommand[], eventId?: number): void;
    setupChild(list: RPGReactor.EventCommand[], eventId: number): void;
    eventId(): number; isRunning(): boolean; isOnCurrentMap(): boolean;
    update(): void; updateWait(): boolean; updateWaitMode(): boolean;
    wait(duration: number): void; setWaitMode(waitMode: string): void;
    character(param: number): Game_Player | Game_Event | null | undefined;
    currentCommand(): RPGReactor.EventCommand | undefined;
    executeCommand(): boolean; terminate(): void;
    pluginCommand(command: string, args: string[]): void;
}
