/** Scene constructors and common plugin extension points from reactor_scenes.js. */
declare class Scene_Base extends Stage {
    constructor();
    _windowLayer?: WindowLayer;
    initialize(): void; create(): void; start(): void; stop(): void; update(): void; terminate(): void;
    isActive(): boolean; isReady(): boolean; isStarted(): boolean; isBusy(): boolean; isFading(): boolean;
    createWindowLayer(): void;
    /** Requires createWindowLayer() first; no value is returned. */
    addWindow(window: RPGReactor.RuntimeWindow): void;
    startFadeIn(duration?: number, white?: boolean): void;
    startFadeOut(duration?: number, white?: boolean): void;
    updateFade(): void; updateChildren(): void;
    popScene(): void; checkGameover(): void; fadeOutAll(): void;
    fadeSpeed(): number; slowFadeSpeed(): number;
    mainCommandWidth(): number; buttonAreaTop(): number; buttonAreaBottom(): number;
    buttonAreaHeight(): number; buttonY(): number;
    calcWindowHeight(numLines: number, selectable: boolean): number;
    requestAutosave(): void; isAutosaveEnabled(): boolean; executeAutosave(): void;
    onAutosaveSuccess(): void; onAutosaveFailure(): void;
}
declare class Scene_Boot extends Scene_Base {
    constructor();
    onDatabaseLoaded(): void; setEncryptionInfo(): void;
    loadSystemImages(): void; loadPlayerData(): void; loadGameFonts(): void;
    isPlayerDataLoaded(): boolean;
    startNormalGame(): void; resizeScreen(): void; adjustBoxSize(): void;
    screenScale(): number; updateDocumentTitle(): void;
}
declare class Scene_Title extends Scene_Base {
    constructor();
    createBackground(): void; createForeground(): void; drawGameTitle(): void;
    createCommandWindow(): void; commandWindowRect(): Rectangle;
    commandNewGame(): void; commandContinue(): void; commandOptions(): void;
    playTitleMusic(): void;
}
declare class Scene_Message extends Scene_Base {
    constructor();
    _messageWindow?: Window_Message;
    createAllWindows(): void; createMessageWindow(): void;
    messageWindowRect(): Rectangle;
    isMessageWindowClosing(): boolean;
    associateWindows(): void;
}
declare class Scene_Map extends Scene_Message {
    constructor();
    onMapLoaded(): void; onTransfer(): void; onTransferEnd(): void;
    updateMain(): void; isFastForward(): boolean; isPlayerActive(): boolean;
    isMenuEnabled(): boolean; isMenuCalled(): boolean; callMenu(): void;
    isSceneChangeOk(): boolean; updateScene(): void;
    createDisplayObjects(): void; createSpriteset(): void;
    createMapNameWindow(): void; mapNameWindowRect(): Rectangle;
    updateTransferPlayer(): void; updateEncounter(): void;
    launchBattle(): void; startEncounterEffect(): void; encounterEffectSpeed(): number;
}
declare class Scene_MenuBase extends Scene_Base {
    constructor();
    _helpWindow?: Window_Help;
    actor(): Game_Actor | null | undefined;
    updateActor(): void; nextActor(): void; previousActor(): void; onActorChange(): void;
    createBackground(): void; setBackgroundOpacity(opacity: number): void;
    createHelpWindow(): void; helpWindowRect(): Rectangle;
    helpAreaTop(): number; helpAreaBottom(): number; helpAreaHeight(): number;
    mainAreaTop(): number; mainAreaBottom(): number; mainAreaHeight(): number;
    needsCancelButton(): boolean; needsPageButtons(): boolean; arePageButtonsEnabled(): boolean;
}
declare class Scene_Menu extends Scene_MenuBase {
    constructor();
    createCommandWindow(): void; createGoldWindow(): void; createStatusWindow(): void;
    commandWindowRect(): Rectangle; goldWindowRect(): Rectangle; statusWindowRect(): Rectangle;
    commandItem(): void; commandPersonal(): void; commandFormation(): void;
    commandOptions(): void; commandSave(): void; commandGameEnd(): void;
}
declare class Scene_Battle extends Scene_Message {
    constructor();
    updateBattleProcess(): void; changeInputWindow(): void;
    isAnyInputWindowActive(): boolean;
    createDisplayObjects(): void; createSpriteset(): void; createAllWindows(): void;
    startPartyCommandSelection(): void; startActorCommandSelection(): void;
    commandFight(): void; commandEscape(): void; commandAttack(): void;
    commandSkill(): void; commandGuard(): void; commandItem(): void;
    selectNextCommand(): void; selectPreviousCommand(): void;
    startEnemySelection(): void; startActorSelection(): void;
    onEnemyOk(): void; onEnemyCancel(): void; onActorOk(): void; onActorCancel(): void;
    onSkillOk(): void; onSkillCancel(): void; onItemOk(): void; onItemCancel(): void;
    endCommandSelection(): void;
}
