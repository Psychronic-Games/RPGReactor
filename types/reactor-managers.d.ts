/** Public manager APIs from runtime/reactor_managers.js. Initialization order still applies. */
declare namespace RPGReactor {
    interface ManagedAudioBuffer extends WebAudio { name: string; frameCount: number }
    /** Structural scene contract; concrete Scene_* classes arrive in Step 3. */
    interface SceneLifecycle extends Stage {
        create(): void;
        start(): void;
        stop(): void;
        update(): void;
        terminate(): void;
        isReady(): boolean;
        isBusy(): boolean;
        isStarted(): boolean;
    }
    type SceneConstructor = new () => SceneLifecycle;
    type BattleResult = 0 | 1 | 2;
    type PluginCommand = (this: Game_Interpreter, args: PluginParameters) => void;
}

declare namespace ImageManager {
    let iconWidth: number;
    let iconHeight: number;
    let faceWidth: number;
    let faceHeight: number;
    function loadAnimation(filename: string): Bitmap;
    function loadBattleback1(filename: string): Bitmap;
    function loadBattleback2(filename: string): Bitmap;
    function loadEnemy(filename: string): Bitmap;
    function loadCharacter(filename: string): Bitmap;
    function loadFace(filename: string): Bitmap;
    function loadParallax(filename: string): Bitmap;
    function loadPicture(filename: string): Bitmap;
    function loadSvActor(filename: string): Bitmap;
    function loadSvEnemy(filename: string): Bitmap;
    function loadSystem(filename: string): Bitmap;
    function loadTileset(filename: string): Bitmap;
    function loadTitle1(filename: string): Bitmap;
    function loadTitle2(filename: string): Bitmap;
    function loadBitmap(folder: string, filename: string): Bitmap;
    function loadBitmapFromUrl(url: string, fallbackUrls?: string[]): Bitmap;
    function clear(): void;
    function isReady(): boolean;
    function isObjectCharacter(filename: string): boolean | null;
    function isBigCharacter(filename: string): boolean | null;
    function isZeroParallax(filename: string): boolean;
    /** May return normally when missing images are configured to be skipped. */
    function throwLoadError(bitmap: Bitmap): void;
}

declare namespace AudioManager {
    let bgmVolume: number;
    let bgsVolume: number;
    let meVolume: number;
    let seVolume: number;
    function playBgm(bgm: RPGReactor.AudioFile, pos?: number): void;
    function replayBgm(bgm: RPGReactor.AudioFile): void;
    function isCurrentBgm(bgm: RPGReactor.AudioFile): boolean | null;
    function updateBgmParameters(bgm: RPGReactor.AudioFile): void;
    function stopBgm(): void;
    function fadeOutBgm(duration: number): void;
    function fadeInBgm(duration: number): void;
    function playBgs(bgs: RPGReactor.AudioFile, pos?: number): void;
    function replayBgs(bgs: RPGReactor.AudioFile): void;
    function isCurrentBgs(bgs: RPGReactor.AudioFile): boolean | null;
    function updateBgsParameters(bgs: RPGReactor.AudioFile): void;
    function stopBgs(): void;
    function fadeOutBgs(duration: number): void;
    function fadeInBgs(duration: number): void;
    function playMe(me: RPGReactor.AudioFile): void;
    function updateMeParameters(me: RPGReactor.AudioFile): void;
    function fadeOutMe(duration: number): void;
    function stopMe(): void;
    function playSe(se: RPGReactor.AudioFile): void;
    function playStaticSe(se: RPGReactor.AudioFile): void;
    function loadStaticSe(se: RPGReactor.AudioFile): void;
    function isStaticSe(se: RPGReactor.AudioFile): boolean;
    function stopSe(): void;
    function stopAll(): void;
    function saveBgm(): RPGReactor.AudioFile;
    function saveBgs(): RPGReactor.AudioFile;
    function makeEmptyAudioObject(): RPGReactor.AudioFile;
    function createBuffer(folder: string, name: string): RPGReactor.ManagedAudioBuffer;
    function updateBufferParameters(buffer: WebAudio | null, configVolume: number, audio: RPGReactor.AudioFile | null): void;
    function audioFileExt(): string;
    function checkErrors(): void;
}

declare namespace DataManager {
    /** Cached array on a subsequent call; first call starts loading and returns undefined. */
    function loadGlobalInfo(): RPGReactor.Database<RPGReactor.SavefileInfo> | undefined;
    function saveGlobalInfo(info?: RPGReactor.Database<RPGReactor.SavefileInfo>): void;
    function isGlobalInfoLoaded(): boolean;
    function loadDatabase(): void;
    function loadDataFile(name: string, src: string): void;
    function isDatabaseLoaded(): boolean;
    function loadMapData(mapId: number): void;
    function makeEmptyMap(): void;
    function isMapLoaded(): boolean;
    function extractMetadata(data: RPGReactor.NotedData): void;
    function extractArrayMetadata(array: unknown): void;
    function checkError(): void;
    function isBattleTest(): boolean;
    function isEventTest(): boolean;
    function isTitleSkip(): boolean;
    // These methods return the falsy input for null/undefined, rather than false.
    function isSkill(item: object): item is RPGReactor.SkillData;
    function isSkill(item: object | null | undefined): boolean | null | undefined;
    function isItem(item: object): item is RPGReactor.ItemData;
    function isItem(item: object | null | undefined): boolean | null | undefined;
    function isWeapon(item: object): item is RPGReactor.WeaponData;
    function isWeapon(item: object | null | undefined): boolean | null | undefined;
    function isArmor(item: object): item is RPGReactor.ArmorData;
    function isArmor(item: object | null | undefined): boolean | null | undefined;
    function createGameObjects(): void;
    function setupNewGame(): void;
    function setupBattleTest(): void;
    function setupEventTest(): void;
    function isAnySavefileExists(): boolean;
    function latestSavefileId(): number;
    function earliestSavefileId(): number;
    function emptySavefileId(): number;
    function loadAllSavefileImages(): void;
    function loadSavefileImages(info: RPGReactor.SavefileInfo): void;
    function maxSavefiles(): number;
    function savefileInfo(savefileId: number): RPGReactor.SavefileInfo | null;
    function savefileExists(savefileId: number): boolean;
    /** Runtime resolves 0 on success; storage failures reject. */
    function saveGame(savefileId: number): Promise<number>;
    function loadGame(savefileId: number): Promise<number>;
    function makeSavename(savefileId: number): string;
    function makeSavefileInfo(): RPGReactor.SavefileInfo;
    function makeSaveContents(): RPGReactor.SaveContents;
    function extractSaveContents(contents: RPGReactor.SaveContents): void;
    function correctDataErrors(): void;
    const PLAYTEST_CHECKPOINT_ID: number;
    function isPlaytestCheckpointEnabled(): boolean;
    function hasPlaytestCheckpoint(): boolean;
    function savePlaytestCheckpoint(reason: string): Promise<boolean>;
}

declare namespace SceneManager {
    /** Nullable until the scene lifecycle creates these instances. */
    let _scene: RPGReactor.SceneLifecycle | null;
    let _nextScene: RPGReactor.SceneLifecycle | null;
    function run(sceneClass: RPGReactor.SceneConstructor): Promise<void>;
    function initialize(): Promise<void>;
    function initGraphics(): Promise<void>;
    function update(deltaTime: number): void;
    function isSceneChanging(): boolean;
    function isCurrentSceneBusy(): boolean | null;
    function isNextScene(sceneClass: RPGReactor.SceneConstructor): boolean | null;
    function isPreviousScene(sceneClass: RPGReactor.SceneConstructor): boolean;
    function goto(sceneClass: RPGReactor.SceneConstructor | null): void;
    function push(sceneClass: RPGReactor.SceneConstructor): void;
    function pop(): void;
    function exit(): void;
    function clearStack(): void;
    function stop(): void;
    function resume(): void;
    /** Arguments depend on the next concrete scene; no unsafe generic return inference. */
    function prepareNextScene(...args: unknown[]): void;
    function snap(): Bitmap;
    function snapForBackground(): void;
    function backgroundBitmap(): Bitmap | null;
}

declare namespace PluginManager {
    function setup(plugins: RPGReactor.PluginData[]): void;
    function parameters(name: string): RPGReactor.PluginParameters;
    function setParameters(name: string, parameters: Record<string, string>): void;
    function loadScript(filename: string): void;
    function makeUrl(filename: string): string;
    function checkErrors(): void;
    function throwLoadError(url: string): never;
    function registerCommand(pluginName: string, commandName: string, func: RPGReactor.PluginCommand): void;
    function callCommand(self: Game_Interpreter, pluginName: string, commandName: string,
        args: RPGReactor.PluginParameters): void;
}

declare namespace StorageManager {
    function isLocalMode(): boolean;
    function saveObject(saveName: string, object: unknown): Promise<void | number>;
    /** Deserialized JSON is unvalidated. Narrow it rather than asserting a generic T. */
    function loadObject(saveName: string): Promise<unknown>;
    function objectToJson(object: unknown): Promise<string | undefined>;
    function jsonToObject(json: string): Promise<unknown>;
    function jsonToZip(json: string): Promise<string>;
    function zipToJson(zip: string | null): Promise<string>;
    function saveZip(saveName: string, zip: string): Promise<void | number>;
    function loadZip(saveName: string): Promise<string | null>;
    function exists(saveName: string): boolean;
    /** Synchronous on NW.js, asynchronous in the browser. */
    function remove(saveName: string): void | Promise<number>;
    function saveToLocalFile(saveName: string, zip: string): Promise<void>;
    function loadFromLocalFile(saveName: string): Promise<string>;
    function localFileExists(saveName: string): boolean;
    function removeLocalFile(saveName: string): void;
    function saveToForage(saveName: string, zip: string): Promise<number>;
    function loadFromForage(saveName: string): Promise<string | null>;
    function forageExists(saveName: string): boolean;
    function removeForage(saveName: string): Promise<number>;
    function fileDirectoryPath(): string;
    function filePath(saveName: string): string;
    function forageKey(saveName: string): string;
}

/** Battle methods require BattleManager.setup() and the game globals to be ready. */
declare namespace BattleManager {
    function setup(troopId: number, canEscape: boolean, canLose: boolean): void;
    function initMembers(): void;
    function isTpb(): boolean;
    function isActiveTpb(): boolean;
    function isBattleTest(): boolean;
    function setBattleTest(battleTest: boolean): void;
    function setEventCallback(callback: (result: RPGReactor.BattleResult) => void): void;
    function onEncounter(): void;
    /** Window_BattleLog may return its nonempty wait-mode string. */
    function isBusy(): boolean | string;
    function isInputting(): boolean;
    function isInTurn(): boolean;
    function isTurnEnd(): boolean;
    function isAborting(): boolean;
    function isBattleEnd(): boolean;
    function canEscape(): boolean;
    function canLose(): boolean;
    function isEscaped(): boolean;
    function actor(): Game_Actor | null;
    function inputtingAction(): Game_Action | null | undefined;
    function allBattleMembers(): Array<Game_Actor | Game_Enemy>;
    function getNextSubject(): Game_Battler | null;
    function startBattle(): void;
    function startInput(): void;
    function selectNextCommand(): void;
    function selectPreviousCommand(): void;
    function startTurn(): void;
    function endTurn(): void;
    function update(timeActive: boolean): void;
    function forceAction(battler: Game_Battler): void;
    function abort(): void;
    function processVictory(): void;
    function processEscape(): boolean;
    function processDefeat(): void;
    function endBattle(result: RPGReactor.BattleResult): void;
    function saveBgmAndBgs(): void;
    function playBattleBgm(): void;
    function playVictoryMe(): void;
    function playDefeatMe(): void;
    function replayBgmAndBgs(): void;
}
