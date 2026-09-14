//=============================================================================
// reactor_managers.js v1.7.0
//=============================================================================

//-----------------------------------------------------------------------------
// DataManager
//
// The static class that manages the database and game objects.

function DataManager() {
    throw new Error("This is a static class");
}

$dataActors = null;
$dataClasses = null;
$dataSkills = null;
$dataItems = null;
$dataWeapons = null;
$dataArmors = null;
$dataEnemies = null;
$dataTroops = null;
$dataStates = null;
$dataAnimations = null;
$dataTilesets = null;
$dataCommonEvents = null;
$dataSystem = null;
$dataMapInfos = null;
$dataMap = null;
$gameTemp = null;
$gameSystem = null;
$gameScreen = null;
$gameTimer = null;
$gameMessage = null;
$gameSwitches = null;
$gameVariables = null;
$gameSelfSwitches = null;
$gameActors = null;
$gameParty = null;
$gameTroop = null;
$gameMap = null;
$gamePlayer = null;
$testEvent = null;

DataManager._globalInfo = null;
DataManager._errors = [];

DataManager._databaseFiles = [
    { name: "$dataActors", src: "Actors.json" },
    { name: "$dataClasses", src: "Classes.json" },
    { name: "$dataSkills", src: "Skills.json" },
    { name: "$dataItems", src: "Items.json" },
    { name: "$dataWeapons", src: "Weapons.json" },
    { name: "$dataArmors", src: "Armors.json" },
    { name: "$dataEnemies", src: "Enemies.json" },
    { name: "$dataTroops", src: "Troops.json" },
    { name: "$dataStates", src: "States.json" },
    { name: "$dataAnimations", src: "Animations.json" },
    { name: "$dataTilesets", src: "Tilesets.json" },
    { name: "$dataCommonEvents", src: "CommonEvents.json" },
    { name: "$dataSystem", src: "System.json" },
    { name: "$dataMapInfos", src: "MapInfos.json" }
];

DataManager.loadGlobalInfo = function() {
    // MV compatibility: MV's loadGlobalInfo returns the info array
    // synchronously and MV plugins (YEP_X_Autosave.latestSavefileId among
    // others) call it that way. Once loaded, return the cached array; the
    // boot-time call still takes the async path below.
    if (this._globalInfo) {
        return this._globalInfo;
    }
    StorageManager.loadObject("global")
        .then(globalInfo => {
            this._globalInfo = globalInfo;
            this.removeInvalidGlobalInfo();
            return 0;
        })
        .catch(() => {
            this._globalInfo = [];
        });
};

DataManager.removeInvalidGlobalInfo = function() {
    const globalInfo = this._globalInfo;
    for (const info of globalInfo) {
        const savefileId = globalInfo.indexOf(info);
        if (!this.savefileExists(savefileId)) {
            delete globalInfo[savefileId];
        }
    }
};

DataManager.saveGlobalInfo = function(info) {
    // MV compatibility: MV passes the global-info array as an argument
    // and MV plugin wrappers (CustomTranslationEngine) iterate it. MZ
    // callers pass nothing — keep using this._globalInfo then.
    if (info !== undefined) {
        this._globalInfo = info;
    }
    StorageManager.saveObject("global", this._globalInfo);
};

DataManager.isGlobalInfoLoaded = function() {
    return !!this._globalInfo;
};

DataManager.loadDatabase = function() {
    const test = this.isBattleTest() || this.isEventTest();
    const prefix = test ? "Test_" : "";
    for (const databaseFile of this._databaseFiles) {
        this.loadDataFile(databaseFile.name, prefix + databaseFile.src);
    }
    if (this.isEventTest()) {
        this.loadDataFile("$testEvent", prefix + "Event.json");
    }
};

DataManager.loadDataFile = function(name, src) {
    const xhr = new XMLHttpRequest();
    const url = "data/" + src;
    window[name] = null;
    // Generation guard: a watchdog retry supersedes the previous request
    // for this name. A late arrival (or late error) from a superseded XHR
    // is dropped so it can't double-apply data or surface a stale error
    // after the retry already succeeded.
    this._loadGenerations = this._loadGenerations || {};
    const gen = (this._loadGenerations[name] || 0) + 1;
    this._loadGenerations[name] = gen;
    xhr.open("GET", url);
    xhr.overrideMimeType("application/json");
    xhr.onload = () => {
        if (this._loadGenerations[name] === gen) this.onXhrLoad(xhr, name, src, url);
    };
    xhr.onerror = () => {
        if (this._loadGenerations[name] === gen) this.onXhrError(name, src, url);
    };
    // Bytes flowing means the request is alive, not stalled — push the
    // watchdog deadline forward so a slow (but live) download is never
    // double-fired.
    xhr.onprogress = () => {
        const watch = this._loadWatch && this._loadWatch[name];
        if (watch) watch.time = performance.now();
    };
    xhr.send();
};

// A data XHR can die without firing onload OR onerror, leaving
// isDatabaseLoaded()/isMapLoaded() false forever — a hung boot or map
// transfer with zero errors. Driven by those polled gates, and fully
// self-sufficient (no hooks in loadDataFile — plugins like
// YEP_X_CoreUpdatesOpt replace that method wholesale): derive what is
// missing from _databaseFiles/$dataMap, time it, and re-fire whatever
// loadDataFile implementation is live. 10s of no arrival -> retry
// (3 attempts) -> surface a real load error.
DataManager._checkStalledDataFiles = function() {
    const now = performance.now();
    this._loadWatch = this._loadWatch || {};
    const track = (name, src) => {
        if (!src) return;
        let entry = this._loadWatch[name];
        if (!entry) {
            entry = this._loadWatch[name] = { attempts: 0, time: now, src: src };
        }
        entry.src = src;
        if (now - entry.time >= 10000) {
            entry.time = now;
            entry.attempts++;
            // Retry indefinitely: a genuinely missing file fires onerror
            // immediately and takes the real error path; a silent stall is
            // always a transient environment condition (throttled or
            // dropped request), so giving up can only produce spurious
            // fatal errors for a resource that would have arrived.
            console.warn("DataManager: stalled load, retrying " + src + " (attempt " + entry.attempts + ")");
            this.loadDataFile(name, src);
        }
    };
    for (const databaseFile of this._databaseFiles) {
        if (!window[databaseFile.name]) track(databaseFile.name, databaseFile.src);
    }
    if (!window.$dataMap && this._lastMapSrc) track("$dataMap", this._lastMapSrc);
    for (const name of Object.keys(this._loadWatch)) {
        if (window[name]) delete this._loadWatch[name];
    }
};

DataManager.onXhrLoad = function(xhr, name, src, url) {
    if (xhr.status < 400) {
        window[name] = RRJson.parse(xhr.responseText);
        this.onLoad(window[name]);
    } else {
        this.onXhrError(name, src, url);
    }
};

DataManager.onXhrError = function(name, src, url) {
    const error = { name: name, src: src, url: url };
    this._errors.push(error);
};

DataManager.isDatabaseLoaded = function() {
    this.checkError();
    for (const databaseFile of this._databaseFiles) {
        if (!window[databaseFile.name]) {
            this._checkStalledDataFiles();
            return false;
        }
    }
    return true;
};

DataManager.loadMapData = function(mapId) {
    this._mapSidecarPending = false;
    if (mapId > 0) {
        const filename = "Map%1.json".format(mapId.padZero(3));
        this._lastMapSrc = filename;
        this.loadDataFile("$dataMap", filename);
    } else {
        this.makeEmptyMap();
    }
};

/**
 * Fetch a 3D map's sidecar, if it declares itself one.
 *
 * The map note is the switch and the sidecar is the data: only a map carrying
 * <3d> is asked for one, so a project with no 3D maps issues no extra requests
 * and pays nothing for the feature. A missing or unreadable sidecar is not an
 * error — the map renders flat at elevation 0, which is exactly the state an
 * existing 2D map is in before any elevation has been painted.
 */
DataManager.loadMapSidecar = function(mapData) {
    this._mapSidecarPending = false;
    if (!mapData || !this._lastMapSrc || typeof Reactor3D === "undefined") return;

    const filename = this._lastMapSrc.replace(/\.json$/, Reactor3D.SIDECAR_SUFFIX);
    const url = "data/" + filename;
    // The sidecar carries lights, event models and previews that any map —
    // 2D or 3D — may use, so every map asks for its own. Automatic beats a
    // designation: placing a light on a map is the whole opt-in. On disk the
    // answer is free; on the web a map without one costs a single 404 line
    // in the network log, the same accepted probe the extensionless BGM
    // lookup makes.
    if (Utils.isNwjs()) {
        const fs = require("fs");
        const path = require("path");
        const base = path.dirname(process.mainModule.filename);
        if (!fs.existsSync(path.join(base, url))) return;
    }
    const xhr = new XMLHttpRequest();
    this._mapSidecarPending = true;
    xhr.open("GET", url);
    xhr.overrideMimeType("application/json");
    xhr.onload = () => {
        if (xhr.status < 400) {
            try {
                mapData.reactor3d = RRJson.parse(xhr.responseText);
                // Props become model-bound events before the map counts as loaded.
                if (Reactor3D.installProps) Reactor3D.installProps(mapData);
            } catch (e) {
                console.error(`Reactor3D: ${filename} is not valid JSON.`, e);
            }
        }
        this._mapSidecarPending = false;
    };
    xhr.onerror = () => {
        this._mapSidecarPending = false;
    };
    xhr.send();
};

DataManager.makeEmptyMap = function() {
    $dataMap = {};
    $dataMap.data = [];
    $dataMap.events = [];
    $dataMap.width = 100;
    $dataMap.height = 100;
    $dataMap.scrollType = 3;
};

DataManager.isMapLoaded = function() {
    this.checkError();
    if (!$dataMap) this._checkStalledDataFiles();
    // The sidecar decides which renderer the scene builds, so it has to be in
    // hand before the map counts as loaded.
    return !!$dataMap && !this._mapSidecarPending;
};

DataManager.onLoad = function(object) {
    if (this.isMapObject(object)) {
        this.extractMetadata(object);
        this.extractArrayMetadata(object.events);
        this.loadMapSidecar(object);
    } else {
        this.extractArrayMetadata(object);
        if (object === window.$dataStates) this.bridgeStateDescriptions(object);
    }
};

// A state's description field is Reactor's own; RPG Maker states never had
// one. Plugins that show a state description read it from the note as a
// <Help Description> block instead, so the loaded state carries its field as
// that block when the author wrote neither it nor a <State Tooltip
// Description>. An explicit block keeps precedence, and the note on disk is
// untouched: this runs on the in-memory data every load. <In-Battle Status
// Description> is deliberately not a reason to skip, since that tag only
// replaces the text in one window and leaves the others reading the field.
DataManager.STATE_DESCRIPTION_TAGS = /<(?:HELP|HELP DESCRIPTION|DESCRIPTION|(?:STATE )?TOOLTIP DESCRIPTION)>/i;

DataManager.bridgeStateDescriptions = function(states) {
    if (!Array.isArray(states)) return;
    for (const state of states) {
        if (!state || typeof state.description !== "string" || !state.description.trim()) continue;
        const note = typeof state.note === "string" ? state.note : "";
        if (this.STATE_DESCRIPTION_TAGS.test(note)) continue;
        const block = "<Help Description>\n" + state.description + "\n</Help Description>";
        state.note = note ? note + "\n" + block : block;
    }
};

DataManager.isMapObject = function(object) {
    return !!(object.data && object.events);
};

DataManager.extractArrayMetadata = function(array) {
    if (Array.isArray(array)) {
        for (const data of array) {
            if (data && "note" in data) {
                this.extractMetadata(data);
            }
        }
    }
};

DataManager.extractMetadata = function(data) {
    const regExp = /<([^<>:]+)(:?)([^>]*)>/g;
    data.meta = {};
    for (;;) {
        const match = regExp.exec(data.note);
        if (match) {
            if (match[2] === ":") {
                data.meta[match[1]] = match[3];
            } else {
                data.meta[match[1]] = true;
            }
        } else {
            break;
        }
    }
};

DataManager.checkError = function() {
    if (this._errors.length > 0) {
        const error = this._errors.shift();
        const retry = () => {
            this.loadDataFile(error.name, error.src);
        };
        throw ["LoadError", error.url, retry];
    }
};

DataManager.isBattleTest = function() {
    return Utils.isOptionValid("btest");
};

DataManager.isEventTest = function() {
    return Utils.isOptionValid("etest");
};

DataManager.isTitleSkip = function() {
    return Utils.isOptionValid("tskip");
};

DataManager.isSkill = function(item) {
    return item && $dataSkills.includes(item);
};

DataManager.isItem = function(item) {
    return item && $dataItems.includes(item);
};

DataManager.isWeapon = function(item) {
    return item && $dataWeapons.includes(item);
};

DataManager.isArmor = function(item) {
    return item && $dataArmors.includes(item);
};

DataManager.createGameObjects = function() {
    $gameTemp = new Game_Temp();
    $gameSystem = new Game_System();
    $gameScreen = new Game_Screen();
    $gameTimer = new Game_Timer();
    $gameMessage = new Game_Message();
    $gameSwitches = new Game_Switches();
    $gameVariables = new Game_Variables();
    $gameSelfSwitches = new Game_SelfSwitches();
    $gameActors = new Game_Actors();
    $gameParty = new Game_Party();
    $gameTroop = new Game_Troop();
    $gameMap = new Game_Map();
    $gamePlayer = new Game_Player();
};

DataManager.setupNewGame = function() {
    this.createGameObjects();
    this.selectSavefileForNewGame();
    $gameParty.setupStartingMembers();
    $gamePlayer.setupForNewGame();
    Graphics.frameCount = 0;
};

DataManager.setupBattleTest = function() {
    this.createGameObjects();
    $gameParty.setupBattleTest();
    BattleManager.setup($dataSystem.testTroopId, true, false);
    BattleManager.setBattleTest(true);
    BattleManager.playBattleBgm();
};

DataManager.setupEventTest = function() {
    this.createGameObjects();
    this.selectSavefileForNewGame();
    $gameParty.setupStartingMembers();
    $gamePlayer.reserveTransfer(-1, 8, 6);
    $gamePlayer.setTransparent(false);
};

DataManager.isAnySavefileExists = function() {
    return this._globalInfo.some(x => x);
};

DataManager.latestSavefileId = function() {
    const globalInfo = this._globalInfo;
    const validInfo = globalInfo.slice(1).filter(x => x);
    const latest = Math.max(...validInfo.map(x => x.timestamp));
    const index = globalInfo.findIndex(x => x && x.timestamp === latest);
    return index > 0 ? index : 0;
};

DataManager.earliestSavefileId = function() {
    const globalInfo = this._globalInfo;
    const validInfo = globalInfo.slice(1).filter(x => x);
    const earliest = Math.min(...validInfo.map(x => x.timestamp));
    const index = globalInfo.findIndex(x => x && x.timestamp === earliest);
    return index > 0 ? index : 0;
};

DataManager.emptySavefileId = function() {
    const globalInfo = this._globalInfo;
    const maxSavefiles = this.maxSavefiles();
    if (globalInfo.length < maxSavefiles) {
        return Math.max(1, globalInfo.length);
    } else {
        const index = globalInfo.slice(1).findIndex(x => !x);
        return index >= 0 ? index + 1 : -1;
    }
};

DataManager.loadAllSavefileImages = function() {
    for (const info of this._globalInfo.filter(x => x)) {
        this.loadSavefileImages(info);
    }
};

DataManager.loadSavefileImages = function(info) {
    if (info.characters && Symbol.iterator in info.characters) {
        for (const character of info.characters) {
            ImageManager.loadCharacter(character[0]);
        }
    }
    if (info.faces && Symbol.iterator in info.faces) {
        for (const face of info.faces) {
            ImageManager.loadFace(face[0]);
        }
    }
};

DataManager.maxSavefiles = function() {
    return 20;
};

DataManager.savefileInfo = function(savefileId) {
    const globalInfo = this._globalInfo;
    return globalInfo[savefileId] ? globalInfo[savefileId] : null;
};

//-----------------------------------------------------------------------------
// Playtest checkpoints
//
// A playtest saves itself after every battle and every map transfer into a
// hidden slot, and F9 on the title screen resumes it, so a crash forty
// minutes into an intro costs the walk from the last checkpoint, not from
// the start. Playtests only (Utils.isOptionValid("test")); a deployed game
// never writes it. Slot 99 sits past every save list.

DataManager.PLAYTEST_CHECKPOINT_ID = 99;

DataManager.isPlaytestCheckpointEnabled = function() {
    return typeof Utils !== "undefined" && Utils.isOptionValid && Utils.isOptionValid("test");
};

DataManager.hasPlaytestCheckpoint = function() {
    return this.isPlaytestCheckpointEnabled() && this.savefileExists(this.PLAYTEST_CHECKPOINT_ID);
};

/** Saves the checkpoint, unless one is being written or the party is dead. */
DataManager.savePlaytestCheckpoint = function(reason) {
    if (!this.isPlaytestCheckpointEnabled() || this._playtestCheckpointBusy) return Promise.resolve(false);
    if (typeof $gameParty === "undefined" || !$gameParty || $gameParty.isAllDead()) return Promise.resolve(false);
    if (typeof $gameMap === "undefined" || !$gameMap || !$gameMap.mapId()) return Promise.resolve(false);
    this._playtestCheckpointBusy = true;
    $gameSystem.onBeforeSave();
    return this.saveGame(this.PLAYTEST_CHECKPOINT_ID)
        .then(() => {
            this._playtestCheckpointBusy = false;
            this._playtestCheckpointReason = reason;
            console.info("RPG Reactor playtest checkpoint saved (" + reason + "); F9 on the title screen resumes it.");
            return true;
        })
        .catch(error => {
            this._playtestCheckpointBusy = false;
            console.warn("RPG Reactor playtest checkpoint could not be saved", error);
            return false;
        });
};

DataManager.savefileExists = function(savefileId) {
    const saveName = this.makeSavename(savefileId);
    return StorageManager.exists(saveName);
};

DataManager.saveGame = function(savefileId) {
    const contents = this.makeSaveContents();
    const saveName = this.makeSavename(savefileId);
    return StorageManager.saveObject(saveName, contents).then(() => {
        this._globalInfo[savefileId] = this.makeSavefileInfo();
        // pass the array: MV plugin wrappers of saveGlobalInfo expect it
        this.saveGlobalInfo(this._globalInfo);
        return 0;
    });
};

DataManager.loadGame = function(savefileId) {
    const saveName = this.makeSavename(savefileId);
    return StorageManager.loadObject(saveName).then(contents => {
        this.createGameObjects();
        this.extractSaveContents(contents);
        this.correctDataErrors();
        return 0;
    });
};

DataManager.makeSavename = function(savefileId) {
    return "file%1".format(savefileId);
};

DataManager.selectSavefileForNewGame = function() {
    const emptySavefileId = this.emptySavefileId();
    const earliestSavefileId = this.earliestSavefileId();
    if (emptySavefileId > 0) {
        $gameSystem.setSavefileId(emptySavefileId);
    } else {
        $gameSystem.setSavefileId(earliestSavefileId);
    }
};

DataManager.makeSavefileInfo = function() {
    const info = {};
    info.title = $dataSystem.gameTitle;
    info.characters = $gameParty.charactersForSavefile();
    info.faces = $gameParty.facesForSavefile();
    info.playtime = $gameSystem.playtimeText();
    info.timestamp = Date.now();
    return info;
};

DataManager.makeSaveContents = function() {
    // A save data does not contain $gameTemp, $gameMessage, and $gameTroop.
    const contents = {};
    contents.system = $gameSystem;
    contents.screen = $gameScreen;
    contents.timer = $gameTimer;
    contents.switches = $gameSwitches;
    contents.variables = $gameVariables;
    contents.selfSwitches = $gameSelfSwitches;
    contents.actors = $gameActors;
    contents.party = $gameParty;
    contents.map = $gameMap;
    contents.player = $gamePlayer;
    return contents;
};

DataManager.extractSaveContents = function(contents) {
    $gameSystem = contents.system;
    $gameScreen = contents.screen;
    $gameTimer = contents.timer;
    $gameSwitches = contents.switches;
    $gameVariables = contents.variables;
    $gameSelfSwitches = contents.selfSwitches;
    $gameActors = contents.actors;
    $gameParty = contents.party;
    $gameMap = contents.map;
    $gamePlayer = contents.player;
};

DataManager.correctDataErrors = function() {
    $gameParty.removeInvalidMembers();
};

//-----------------------------------------------------------------------------
// ConfigManager
//
// The static class that manages the configuration data.

function ConfigManager() {
    throw new Error("This is a static class");
}

ConfigManager.alwaysDash = false;
ConfigManager.commandRemember = false;
ConfigManager.touchUI = true;
ConfigManager._isLoaded = false;

Object.defineProperty(ConfigManager, "bgmVolume", {
    get: function() {
        return AudioManager._bgmVolume;
    },
    set: function(value) {
        AudioManager.bgmVolume = value;
    },
    configurable: true
});

Object.defineProperty(ConfigManager, "bgsVolume", {
    get: function() {
        return AudioManager.bgsVolume;
    },
    set: function(value) {
        AudioManager.bgsVolume = value;
    },
    configurable: true
});

Object.defineProperty(ConfigManager, "meVolume", {
    get: function() {
        return AudioManager.meVolume;
    },
    set: function(value) {
        AudioManager.meVolume = value;
    },
    configurable: true
});

Object.defineProperty(ConfigManager, "seVolume", {
    get: function() {
        return AudioManager.seVolume;
    },
    set: function(value) {
        AudioManager.seVolume = value;
    },
    configurable: true
});

ConfigManager.load = function() {
    StorageManager.loadObject("config")
        .then(config => this.applyData(config || {}))
        .catch(() => 0)
        .then(() => {
            this._isLoaded = true;
            return 0;
        })
        .catch(() => 0);
};

ConfigManager.save = function() {
    StorageManager.saveObject("config", this.makeData());
};

ConfigManager.isLoaded = function() {
    return this._isLoaded;
};

ConfigManager.makeData = function() {
    const config = {};
    config.alwaysDash = this.alwaysDash;
    config.commandRemember = this.commandRemember;
    config.touchUI = this.touchUI;
    config.bgmVolume = this.bgmVolume;
    config.bgsVolume = this.bgsVolume;
    config.meVolume = this.meVolume;
    config.seVolume = this.seVolume;
    return config;
};

ConfigManager.applyData = function(config) {
    this.alwaysDash = this.readFlag(config, "alwaysDash", false);
    this.commandRemember = this.readFlag(config, "commandRemember", false);
    this.touchUI = this.readFlag(config, "touchUI", true);
    this.bgmVolume = this.readVolume(config, "bgmVolume");
    this.bgsVolume = this.readVolume(config, "bgsVolume");
    this.meVolume = this.readVolume(config, "meVolume");
    this.seVolume = this.readVolume(config, "seVolume");
};

ConfigManager.readFlag = function(config, name, defaultValue) {
    if (name in config) {
        return !!config[name];
    } else {
        return defaultValue;
    }
};

ConfigManager.readVolume = function(config, name) {
    if (name in config) {
        return Number(config[name]).clamp(0, 100);
    } else {
        return 100;
    }
};

//-----------------------------------------------------------------------------
// StorageManager
//
// The static class that manages storage for saving game data.

function StorageManager() {
    throw new Error("This is a static class");
}

StorageManager._forageKeys = [];
StorageManager._forageKeysUpdated = false;

StorageManager.isLocalMode = function() {
    return Utils.isNwjs();
};

StorageManager.saveObject = function(saveName, object) {
    return this.objectToJson(object)
        .then(json => this.jsonToZip(json))
        .then(zip => this.saveZip(saveName, zip));
};

StorageManager.loadObject = function(saveName) {
    return this.loadZip(saveName)
        .then(zip => this.zipToJson(zip))
        .then(json => this.jsonToObject(json));
};

StorageManager.objectToJson = function(object) {
    return new Promise((resolve, reject) => {
        try {
            const json = JsonEx.stringify(object);
            resolve(json);
        } catch (e) {
            reject(e);
        }
    });
};

StorageManager.jsonToObject = function(json) {
    return new Promise((resolve, reject) => {
        try {
            const object = JsonEx.parse(json);
            resolve(object);
        } catch (e) {
            reject(e);
        }
    });
};

StorageManager.jsonToZip = function(json) {
    return new Promise((resolve, reject) => {
        try {
            const zip = pako.deflate(json, { to: "string", level: 1 });
            // The 50KB guideline only matters for browser web storage;
            // desktop file saves have no such limit.
            if (zip.length >= 50000 && !Utils.isNwjs()) {
                console.warn("Save data is too big.");
            }
            resolve(zip);
        } catch (e) {
            reject(e);
        }
    });
};

StorageManager.zipToJson = function(zip) {
    return new Promise((resolve, reject) => {
        try {
            if (zip) {
                const json = pako.inflate(zip, { to: "string" });
                resolve(json);
            } else {
                resolve("null");
            }
        } catch (e) {
            reject(e);
        }
    });
};

StorageManager.saveZip = function(saveName, zip) {
    if (this.isLocalMode()) {
        return this.saveToLocalFile(saveName, zip);
    } else {
        return this.saveToForage(saveName, zip);
    }
};

StorageManager.loadZip = function(saveName) {
    if (this.isLocalMode()) {
        return this.loadFromLocalFile(saveName);
    } else {
        return this.loadFromForage(saveName);
    }
};

StorageManager.exists = function(saveName) {
    if (this.isLocalMode()) {
        return this.localFileExists(saveName);
    } else {
        return this.forageExists(saveName);
    }
};

StorageManager.remove = function(saveName) {
    if (this.isLocalMode()) {
        return this.removeLocalFile(saveName);
    } else {
        return this.removeForage(saveName);
    }
};

StorageManager.saveToLocalFile = function(saveName, zip) {
    const dirPath = this.fileDirectoryPath();
    const filePath = this.filePath(saveName);
    const backupFilePath = filePath + "_";
    return new Promise((resolve, reject) => {
        this.fsMkdir(dirPath);
        this.fsUnlink(backupFilePath);
        this.fsRename(filePath, backupFilePath);
        try {
            this.fsWriteFile(filePath, zip);
            this.fsUnlink(backupFilePath);
            resolve();
        } catch (e) {
            try {
                this.fsUnlink(filePath);
                this.fsRename(backupFilePath, filePath);
            } catch (e2) {
                //
            }
            reject(e);
        }
    });
};

StorageManager.loadFromLocalFile = function(saveName) {
    const filePath = this.filePath(saveName);
    return new Promise((resolve, reject) => {
        const data = this.fsReadFile(filePath);
        if (data) {
            resolve(data);
        } else {
            reject(new Error("Savefile not found"));
        }
    });
};

StorageManager.localFileExists = function(saveName) {
    const fs = require("fs");
    return fs.existsSync(this.filePath(saveName));
};

StorageManager.removeLocalFile = function(saveName) {
    this.fsUnlink(this.filePath(saveName));
};

StorageManager.saveToForage = function(saveName, zip) {
    const key = this.forageKey(saveName);
    const testKey = this.forageTestKey();
    setTimeout(() => localforage.removeItem(testKey));
    return localforage
        .setItem(testKey, zip)
        .then(() => localforage.setItem(key, zip))
        .then(() => this.updateForageKeys());
};

StorageManager.loadFromForage = function(saveName) {
    const key = this.forageKey(saveName);
    return localforage.getItem(key);
};

StorageManager.forageExists = function(saveName) {
    const key = this.forageKey(saveName);
    return this._forageKeys.includes(key);
};

StorageManager.removeForage = function(saveName) {
    const key = this.forageKey(saveName);
    return localforage.removeItem(key).then(() => this.updateForageKeys());
};

StorageManager.updateForageKeys = function() {
    this._forageKeysUpdated = false;
    return localforage.keys().then(keys => {
        this._forageKeys = keys;
        this._forageKeysUpdated = true;
        return 0;
    });
};

StorageManager.forageKeysUpdated = function() {
    return this._forageKeysUpdated;
};

StorageManager.fsMkdir = function(path) {
    const fs = require("fs");
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
};

StorageManager.fsRename = function(oldPath, newPath) {
    const fs = require("fs");
    if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
    }
};

StorageManager.fsUnlink = function(path) {
    const fs = require("fs");
    if (fs.existsSync(path)) {
        fs.unlinkSync(path);
    }
};

StorageManager.fsReadFile = function(path) {
    const fs = require("fs");
    if (fs.existsSync(path)) {
        return fs.readFileSync(path, { encoding: "utf8" });
    } else {
        return null;
    }
};

StorageManager.fsWriteFile = function(path, data) {
    const fs = require("fs");
    fs.writeFileSync(path, data);
};

StorageManager.fileDirectoryPath = function() {
    const path = require("path");
    const base = path.dirname(process.mainModule.filename);
    return path.join(base, "save/");
};

StorageManager.filePath = function(saveName) {
    const dir = this.fileDirectoryPath();
    return dir + saveName + ".rmmzsave";
};

StorageManager.forageKey = function(saveName) {
    const gameId = $dataSystem.advanced.gameId;
    return "rmmzsave." + gameId + "." + saveName;
};

StorageManager.forageTestKey = function() {
    return "rmmzsave.test";
};

//-----------------------------------------------------------------------------
// FontManager
//
// The static class that loads font files.

function FontManager() {
    throw new Error("This is a static class");
}

FontManager._urls = {};
FontManager._states = {};

FontManager.load = function(family, filename) {
    if (this._states[family] !== "loaded") {
        if (filename) {
            const url = this.makeUrl(filename);
            this.startLoading(family, url);
        } else {
            this._urls[family] = "";
            this._states[family] = "loaded";
        }
    }
};

FontManager.isReady = function() {
    for (const family in this._states) {
        const state = this._states[family];
        if (state === "loading") {
            return false;
        }
        if (state === "error") {
            this.throwLoadError(family);
        }
    }
    return true;
};

FontManager.startLoading = function(family, url) {
    const source = "url(" + url + ")";
    const font = new FontFace(family, source);
    this._urls[family] = url;
    this._states[family] = "loading";
    font.load()
        .then(() => {
            document.fonts.add(font);
            this._states[family] = "loaded";
            return 0;
        })
        .catch(() => {
            this._states[family] = "error";
        });
};

FontManager.throwLoadError = function(family) {
    const url = this._urls[family];
    const retry = () => this.startLoading(family, url);
    throw ["LoadError", url, retry];
};

FontManager.makeUrl = function(filename) {
    return "fonts/" + Utils.encodeURI(filename);
};

//-----------------------------------------------------------------------------
// ImageManager
//
// The static class that loads images, creates bitmap objects and retains them.

function ImageManager() {
    throw new Error("This is a static class");
}

ImageManager.iconWidth = 32;
ImageManager.iconHeight = 32;
ImageManager.faceWidth = 144;
ImageManager.faceHeight = 144;

ImageManager._cache = {};
ImageManager._system = {};
ImageManager._emptyBitmap = new Bitmap(1, 1);
ImageManager._imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".apng"];

ImageManager.loadAnimation = function(filename) {
    return this.loadBitmap("img/animations/", filename);
};

ImageManager.loadBattleback1 = function(filename) {
    return this.loadBitmap("img/battlebacks1/", filename);
};

ImageManager.loadBattleback2 = function(filename) {
    return this.loadBitmap("img/battlebacks2/", filename);
};

// Atlas-style bitmaps (IconSet, character sheets, face sheets, tilesets,
// sideview battlers) contain many cells in one image. v8's default LINEAR
// texture filtering interpolates across cell boundaries when a sprite samples
// a sub-region with non-integer position/scale (e.g. MOG_TrPopUpBattle's
// falling icons at scaled positions), producing a 1-px bleed strip from the
// neighboring cell. Setting scaleMode=NEAREST on these bitmaps disables
// interpolation -- correct for pixel-art icons/sprites anyway -- and
// eliminates the bleed at the root rather than masking it with frame insets.
//
// Skipped on full-image bitmaps (parallaxes, pictures, enemies, battlebacks,
// titles) which benefit from smooth LINEAR scaling when displayed at sizes
// that don't match their native resolution.
const _setBitmapNearest = function(bitmap) {
    if (!bitmap || bitmap.__nearestApplied) return bitmap;
    bitmap.__nearestApplied = true;
    bitmap.addLoadListener(b => {
        const bt = b && b._baseTexture;
        if (!bt) return;
        try { bt.scaleMode = "nearest"; } catch (e) {}
        const src = bt.source || bt._textureSource;
        if (src) { try { src.scaleMode = "nearest"; } catch (e) {} }
    });
    return bitmap;
};

ImageManager.loadEnemy = function(filename) {
    return this.loadBitmap("img/enemies/", filename);
};

ImageManager.loadCharacter = function(filename) {
    return _setBitmapNearest(this.loadBitmap("img/characters/", filename));
};

ImageManager.loadFace = function(filename) {
    return _setBitmapNearest(this.loadBitmap("img/faces/", filename));
};

ImageManager.loadParallax = function(filename) {
    return this.loadBitmap("img/parallaxes/", filename);
};

ImageManager.loadPicture = function(filename) {
    return this.loadBitmap("img/pictures/", filename);
};

ImageManager.loadSvActor = function(filename) {
    return _setBitmapNearest(this.loadBitmap("img/sv_actors/", filename));
};

ImageManager.loadSvEnemy = function(filename) {
    return _setBitmapNearest(this.loadBitmap("img/sv_enemies/", filename));
};

ImageManager.loadSystem = function(filename) {
    return _setBitmapNearest(this.loadBitmap("img/system/", filename));
};

ImageManager.loadTileset = function(filename) {
    return _setBitmapNearest(this.loadBitmap("img/tilesets/", filename));
};

ImageManager.loadTitle1 = function(filename) {
    return this.loadBitmap("img/titles1/", filename);
};

ImageManager.loadTitle2 = function(filename) {
    return this.loadBitmap("img/titles2/", filename);
};

ImageManager.loadBitmap = function(folder, filename) {
    if (filename) {
        const encoded = folder + Utils.encodeURI(filename);
        const explicit = this._imageExtensions.some(extension =>
            encoded.toLowerCase().endsWith(extension));
        const url = explicit ? encoded : encoded + ".png";
        // Stock MZ stored the physical "Portrait.jpg.png" as "Portrait.jpg".
        // Retry that legacy interpretation only if an explicit modern path fails.
        return this.loadBitmapFromUrl(url, explicit ? [url + ".png"] : []);
    } else {
        return this._emptyBitmap;
    }
};

ImageManager.loadBitmapFromUrl = function(url, fallbackUrls) {
    const cache = url.includes("/system/") ? this._system : this._cache;
    if (!cache[url]) {
        cache[url] = Bitmap.load(url, fallbackUrls);
    }
    return cache[url];
};

ImageManager.clear = function() {
    const cache = this._cache;
    for (const url in cache) {
        cache[url].destroy();
    }
    this._cache = {};
};

ImageManager.isReady = function() {
    // Sweep every bitmap before answering: an early return on the first
    // not-ready bitmap would serialize stall recovery to one file per
    // watchdog period.
    let ready = true;
    for (const cache of [this._cache, this._system]) {
        for (const url in cache) {
            const bitmap = cache[url];
            if (bitmap.isError()) {
                this.throwLoadError(bitmap);
            }
            if (!bitmap.isReady()) {
                this._checkStalledBitmap(bitmap);
                ready = false;
            }
        }
    }
    return ready;
};

// An image load can silently die without firing onload OR onerror,
// leaving its bitmap "loading" forever and isReady() false — a hung boot
// or scene with zero errors. Polled from isReady() by exactly the code
// that is blocked waiting. Zero progress for 10s -> retry (3 attempts) ->
// surface a real load error (which offers the standard Retry screen).
ImageManager._checkStalledBitmap = function(bitmap) {
    if (bitmap._loadingState !== "loading" || !bitmap._loadStartTime) return;
    if (performance.now() - bitmap._loadStartTime < 10000) return;
    console.warn("ImageManager: stalled load, retrying " + bitmap.url + " (attempt " + (bitmap._loadAttempts || 0) + ")");
    bitmap.retry();
};

ImageManager.throwLoadError = function(bitmap) {
    const retry = bitmap.retry.bind(bitmap);
    throw ["LoadError", bitmap.url, retry];
};

ImageManager.isObjectCharacter = function(filename) {
    const sign = Utils.extractFileName(filename).match(/^[!$]+/);
    return sign && sign[0].includes("!");
};

ImageManager.isBigCharacter = function(filename) {
    const sign = Utils.extractFileName(filename).match(/^[!$]+/);
    return sign && sign[0].includes("$");
};

ImageManager.isZeroParallax = function(filename) {
    return Utils.extractFileName(filename).charAt(0) === "!";
};

//-----------------------------------------------------------------------------
// EffectManager
//
// The static class that loads Effekseer effects.

function EffectManager() {
    throw new Error("This is a static class");
}

EffectManager._cache = {};
EffectManager._errorUrls = [];

EffectManager.load = function(filename) {
    if (filename) {
        const url = this.makeUrl(filename);
        const cache = this._cache;
        if (!cache[url] && Graphics.effekseer) {
            this.startLoading(url);
        }
        return cache[url];
    } else {
        return null;
    }
};

EffectManager.startLoading = function(url) {
    const onLoad = () => this.onLoad(url);
    const onError = (message, url) => this.onError(url);
    const effect = Graphics.effekseer.loadEffect(url, 1, onLoad, onError);
    this._cache[url] = effect;
    return effect;
};

EffectManager.clear = function() {
    for (const url in this._cache) {
        const effect = this._cache[url];
        Graphics.effekseer.releaseEffect(effect);
    }
    this._cache = {};
};

EffectManager.onLoad = function(/*url*/) {
    //
};

EffectManager.onError = function(url) {
    this._errorUrls.push(url);
};

EffectManager.makeUrl = function(filename) {
    return "effects/" + Utils.encodeURI(filename) + ".efkefc";
};

EffectManager.checkErrors = function() {
    const url = this._errorUrls.shift();
    if (url) {
        this.throwLoadError(url);
    }
};

EffectManager.throwLoadError = function(url) {
    const retry = () => this.startLoading(url);
    throw ["LoadError", url, retry];
};

EffectManager.isReady = function() {
    this.checkErrors();
    for (const url in this._cache) {
        const effect = this._cache[url];
        if (!effect.isLoaded) {
            return false;
        }
    }
    return true;
};

//-----------------------------------------------------------------------------
// AudioManager
//
// The static class that handles BGM, BGS, ME and SE.

function AudioManager() {
    throw new Error("This is a static class");
}

AudioManager._bgmVolume = 100;
AudioManager._bgsVolume = 100;
AudioManager._meVolume = 100;
AudioManager._seVolume = 100;
AudioManager._currentBgm = null;
AudioManager._currentBgs = null;
AudioManager._bgmBuffer = null;
AudioManager._bgsBuffer = null;
AudioManager._meBuffer = null;
AudioManager._seBuffers = [];
AudioManager._staticBuffers = [];
AudioManager._replayFadeTime = 0.5;
AudioManager._path = "audio/";

Object.defineProperty(AudioManager, "bgmVolume", {
    get: function() {
        return this._bgmVolume;
    },
    set: function(value) {
        this._bgmVolume = value;
        this.updateBgmParameters(this._currentBgm);
    },
    configurable: true
});

Object.defineProperty(AudioManager, "bgsVolume", {
    get: function() {
        return this._bgsVolume;
    },
    set: function(value) {
        this._bgsVolume = value;
        this.updateBgsParameters(this._currentBgs);
    },
    configurable: true
});

Object.defineProperty(AudioManager, "meVolume", {
    get: function() {
        return this._meVolume;
    },
    set: function(value) {
        this._meVolume = value;
        this.updateMeParameters(this._currentMe);
    },
    configurable: true
});

Object.defineProperty(AudioManager, "seVolume", {
    get: function() {
        return this._seVolume;
    },
    set: function(value) {
        this._seVolume = value;
    },
    configurable: true
});

AudioManager.playBgm = function(bgm, pos) {
    if (bgm && bgm.sequence) {
        this.playBgmSequence(bgm);
        return;
    }
    if (this.isCurrentBgm(bgm)) {
        this.updateBgmParameters(bgm);
    } else {
        this.stopBgm();
        if (bgm.name) {
            this._bgmBuffer = this.createBuffer("bgm/", bgm.name);
            this.updateBgmParameters(bgm);
            if (!this._meBuffer) {
                this._bgmBuffer.play(true, pos || 0);
            }
        }
    }
    this.updateCurrentBgm(bgm, pos);
};

AudioManager.replayBgm = function(bgm) {
    if (this.isCurrentBgm(bgm)) {
        this.updateBgmParameters(bgm);
    } else {
        this.playBgm(bgm, bgm.pos);
        if (this._bgmBuffer) {
            this._bgmBuffer.fadeIn(this._replayFadeTime);
        } else if (this._bgmSequence) {
            this.fadeInBgm(this._replayFadeTime);
        }
    }
};

AudioManager.isCurrentBgm = function(bgm) {
    return (
        this._currentBgm &&
        this._bgmBuffer &&
        this._currentBgm.name === bgm.name
    );
};

AudioManager.updateBgmParameters = function(bgm) {
    this.updateBufferParameters(this._bgmBuffer, this._bgmVolume, bgm);
    if (this._bgmSequence) this._refreshBgmSequenceVolumes();
};

AudioManager.updateCurrentBgm = function(bgm, pos) {
    this._currentBgm = {
        name: bgm.name,
        volume: bgm.volume,
        pitch: bgm.pitch,
        pan: bgm.pan,
        pos: pos
    };
};

AudioManager.stopBgm = function() {
    this.stopBgmSequence();
    if (this._bgmBuffer) {
        this._bgmBuffer.destroy();
        this._bgmBuffer = null;
        this._currentBgm = null;
    }
};

AudioManager.fadeOutBgm = function(duration) {
    if (this._bgmSequence) {
        this._fadeOutBgmSequence(duration);
    }
    if (this._bgmBuffer && this._currentBgm) {
        this._bgmBuffer.fadeOut(duration);
        this._currentBgm = null;
    }
};

AudioManager.fadeInBgm = function(duration) {
    if (this._bgmSequence) {
        for (const buffer of this._bgmSequenceBuffers()) buffer.fadeIn(duration);
    }
    if (this._bgmBuffer && this._currentBgm) {
        this._bgmBuffer.fadeIn(duration);
    }
};

AudioManager.playBgs = function(bgs, pos) {
    if (this.isCurrentBgs(bgs)) {
        this.updateBgsParameters(bgs);
    } else {
        this.stopBgs();
        if (bgs.name) {
            this._bgsBuffer = this.createBuffer("bgs/", bgs.name);
            this.updateBgsParameters(bgs);
            this._bgsBuffer.play(true, pos || 0);
        }
    }
    this.updateCurrentBgs(bgs, pos);
};

AudioManager.replayBgs = function(bgs) {
    if (this.isCurrentBgs(bgs)) {
        this.updateBgsParameters(bgs);
    } else {
        this.playBgs(bgs, bgs.pos);
        if (this._bgsBuffer) {
            this._bgsBuffer.fadeIn(this._replayFadeTime);
        }
    }
};

AudioManager.isCurrentBgs = function(bgs) {
    return (
        this._currentBgs &&
        this._bgsBuffer &&
        this._currentBgs.name === bgs.name
    );
};

AudioManager.updateBgsParameters = function(bgs) {
    this.updateBufferParameters(this._bgsBuffer, this._bgsVolume, bgs);
};

AudioManager.updateCurrentBgs = function(bgs, pos) {
    this._currentBgs = {
        name: bgs.name,
        volume: bgs.volume,
        pitch: bgs.pitch,
        pan: bgs.pan,
        pos: pos
    };
};

AudioManager.stopBgs = function() {
    if (this._bgsBuffer) {
        this._bgsBuffer.destroy();
        this._bgsBuffer = null;
        this._currentBgs = null;
    }
};

AudioManager.fadeOutBgs = function(duration) {
    if (this._bgsBuffer && this._currentBgs) {
        this._bgsBuffer.fadeOut(duration);
        this._currentBgs = null;
    }
};

AudioManager.fadeInBgs = function(duration) {
    if (this._bgsBuffer && this._currentBgs) {
        this._bgsBuffer.fadeIn(duration);
    }
};

AudioManager.playMe = function(me) {
    this.stopMe();
    if (me.name) {
        if (this._bgmBuffer && this._currentBgm) {
            this._currentBgm.pos = this._bgmBuffer.seek();
            this._bgmBuffer.stop();
        }
        if (this._bgmSequence) this._duckBgmSequence(this.BGM_SEQUENCE_ME_DUCK);
        this._meBuffer = this.createBuffer("me/", me.name);
        this.updateMeParameters(me);
        this._meBuffer.play(false);
        this._meBuffer.addStopListener(this.stopMe.bind(this));
    }
};

AudioManager.updateMeParameters = function(me) {
    this.updateBufferParameters(this._meBuffer, this._meVolume, me);
};

AudioManager.fadeOutMe = function(duration) {
    if (this._meBuffer) {
        this._meBuffer.fadeOut(duration);
    }
};

AudioManager.stopMe = function() {
    if (this._meBuffer) {
        this._meBuffer.destroy();
        this._meBuffer = null;
        if (this._bgmSequence) this._duckBgmSequence(1);
        if (
            this._bgmBuffer &&
            this._currentBgm &&
            !this._bgmBuffer.isPlaying()
        ) {
            this._bgmBuffer.play(true, this._currentBgm.pos);
            this._bgmBuffer.fadeIn(this._replayFadeTime);
        }
    }
};

// Every take a slot or timing can play: the SE itself, then its variants,
// with anything unnamed dropped.
AudioManager.seVariantPool = function(se) {
    const variants = se && Array.isArray(se.variants) ? se.variants : [];
    return [se].concat(variants).filter(entry => entry && entry.name);
};

// A pitch inside `range`, or null when the range is absent or unusable. The
// editor writes '' for a cleared control, which is not a zero -- Number('') is
// 0 and would clamp to a silent-sounding 50 rather than meaning "no range".
// Clamped to 50-150 because pitch is playback rate downstream.
AudioManager.rollSePitch = function(range) {
    if (!range || range.min == null || range.max == null) {
        return null;
    }
    if (String(range.min).trim() === '' || String(range.max).trim() === '') {
        return null;
    }
    let min = Math.round(Number(range.min));
    let max = Math.round(Number(range.max));
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return null;
    }
    min = Math.max(50, Math.min(150, min));
    max = Math.max(50, Math.min(150, max));
    if (min > max) {
        return null;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
};

// The SE to actually play. Resolution sits here rather than in SoundManager so
// that every SE the engine plays gets it -- animation sound timings, the Play SE
// event command, UI and 3D effect sounds -- and not only the system sound slots,
// which are the only thing SoundManager is reached by.
//
// Returns `se` itself when neither key is set, so the common path allocates
// nothing. Otherwise it returns a *fresh* object: the pool entries are live
// $dataSystem/$dataAnimations objects, and writing a rolled pitch back into one
// would persist it on the editor's next save.
AudioManager.resolveSeVariant = function(se) {
    if (!se || (!se.variants && !se.pitchRandom)) {
        return se;
    }
    const pool = this.seVariantPool(se);
    if (pool.length === 0) {
        return se;
    }
    const picked = pool.length === 1
        ? pool[0]
        : pool[Math.floor(Math.random() * pool.length)];
    const pitch = this.rollSePitch(se.pitchRandom);
    // Nothing to vary: one take and no usable range. Returning the SE itself
    // keeps a cleared pitch control indistinguishable from never having set
    // one, and allocates nothing on what is much the commonest path.
    if (pool.length === 1 && pitch === null) {
        return se;
    }
    return {
        name: picked.name,
        volume: picked.volume,
        pitch: pitch === null ? picked.pitch : pitch,
        pan: picked.pan
    };
};

AudioManager.playSe = function(se) {
    se = this.resolveSeVariant(se);
    if (se.name) {
        if (this.isMissingLocalSe(se.name)) return;
        // [Note] Do not play the same sound in the same frame.
        const latestBuffers = this._seBuffers.filter(
            buffer => buffer.frameCount === Graphics.frameCount
        );
        if (latestBuffers.find(buffer => buffer.name === se.name)) {
            return;
        }
        const buffer = this.createBuffer("se/", se.name);
        this.updateSeParameters(buffer, se);
        buffer.play(false);
        this._seBuffers.push(buffer);
        this.cleanupSe();
    }
};

// A missing one-shot sound must not stop the battle or start a new failed
// request for every hit. Web/remote audio retains the normal loading path.
AudioManager.isMissingLocalSe = function(name) {
    if (typeof Utils === "undefined" || !Utils.isNwjs?.()) return false;
    try {
        const fs = require("fs"), path = require("path");
        const suffix = Utils.hasEncryptedAudio() ? "_" : "";
        const url = this._path + "se/" + Utils.encodeURI(name) + this.audioFileExt();
        const resolved = Utils.resolveFileCase(Utils.resolveAudioExtension(url, suffix), suffix);
        const local = decodeURIComponent(resolved.split("?")[0]) + suffix;
        if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(local) || local.split("/").includes("..")) return false;
        const missing = !fs.existsSync(path.join(path.dirname(process.mainModule.filename), local));
        this._missingSeWarnings ||= new Set();
        if (missing && !this._missingSeWarnings.has(url)) {
            this._missingSeWarnings.add(url);
            console.warn("AudioManager: missing sound effect " + url + "; skipping playback. Check the animation or sound setting that references it.");
        }
        if (!missing) this._missingSeWarnings.delete(url);
        return missing;
    } catch (error) {
        return false;
    }
};

AudioManager.updateSeParameters = function(buffer, se) {
    this.updateBufferParameters(buffer, this._seVolume, se);
};

AudioManager.cleanupSe = function() {
    for (const buffer of this._seBuffers) {
        if (!buffer.isPlaying()) {
            buffer.destroy();
        }
    }
    this._seBuffers = this._seBuffers.filter(buffer => buffer.isPlaying());
};

AudioManager.stopSe = function() {
    for (const buffer of this._seBuffers) {
        buffer.destroy();
    }
    this._seBuffers = [];
};

AudioManager.playStaticSe = function(se) {
    se = this.resolveSeVariant(se);
    if (se.name) {
        this.loadStaticSe(se);
        for (const buffer of this._staticBuffers) {
            if (buffer.name === se.name) {
                buffer.stop();
                this.updateSeParameters(buffer, se);
                buffer.play(false);
                break;
            }
        }
    }
};

AudioManager.loadStaticSe = function(se) {
    if (se.name && !this.isStaticSe(se)) {
        const buffer = this.createBuffer("se/", se.name);
        this._staticBuffers.push(buffer);
    }
};

AudioManager.isStaticSe = function(se) {
    for (const buffer of this._staticBuffers) {
        if (buffer.name === se.name) {
            return true;
        }
    }
    return false;
};

AudioManager.stopAll = function() {
    this.stopMe();
    this.stopBgm();
    this.stopBgs();
    this.stopSe();
};

AudioManager.saveBgm = function() {
    const sequence = this._bgmSequence || this._pendingBgmSequence;
    if (sequence) {
        const fallback = sequence.fallback || {};
        const saved = {
            name: fallback.name || "",
            volume: fallback.volume || 0,
            pitch: fallback.pitch || 0,
            pan: fallback.pan || 0,
            pos: 0,
            sequence: sequence.key
        };
        // Only when it has, so a sequence that never looped saves as it always did.
        if (sequence.looped) saved.looped = true;
        return saved;
    }
    if (this._currentBgm) {
        const bgm = this._currentBgm;
        return {
            name: bgm.name,
            volume: bgm.volume,
            pitch: bgm.pitch,
            pan: bgm.pan,
            pos: this._bgmBuffer ? this._bgmBuffer.seek() : 0
        };
    } else {
        return this.makeEmptyAudioObject();
    }
};

AudioManager.saveBgs = function() {
    if (this._currentBgs) {
        const bgs = this._currentBgs;
        return {
            name: bgs.name,
            volume: bgs.volume,
            pitch: bgs.pitch,
            pan: bgs.pan,
            pos: this._bgsBuffer ? this._bgsBuffer.seek() : 0
        };
    } else {
        return this.makeEmptyAudioObject();
    }
};

AudioManager.makeEmptyAudioObject = function() {
    return { name: "", volume: 0, pitch: 0 };
};

AudioManager.createBuffer = function(folder, name) {
    const ext = this.audioFileExt();
    const url = this._path + folder + Utils.encodeURI(name) + ext;
    const buffer = new WebAudio(url);
    buffer.name = name;
    buffer.frameCount = Graphics.frameCount;
    return buffer;
};

AudioManager.updateBufferParameters = function(buffer, configVolume, audio) {
    if (buffer && audio) {
        buffer.volume = (configVolume * (audio.volume || 0)) / 10000;
        buffer.pitch = (audio.pitch || 0) / 100;
        buffer.pan = (audio.pan || 0) / 100;
    }
};

AudioManager.audioFileExt = function() {
    return ".ogg";
};

AudioManager.checkErrors = function() {
    const buffers = [this._bgmBuffer, this._bgsBuffer, this._meBuffer];
    buffers.push(...this._seBuffers);
    buffers.push(...this._staticBuffers);
    if (this._bgmSequence) buffers.push(...this._bgmSequenceBuffers());
    for (const buffer of buffers) {
        if (buffer && buffer.isError()) {
            this.throwLoadError(buffer);
        }
    }
};

AudioManager.throwLoadError = function(webAudio) {
    const retry = webAudio.retry.bind(webAudio);
    throw ["LoadError", webAudio.url, retry];
};


//-----------------------------------------------------------------------------
// BGM sequences
//
// A map's music can be a sequence instead of one looping track
// ($dataMap.bgmSequence = { enabled, entries }). Entries play in order and
// the sequence loops:
//   { type: "track", name, volume, pitch, pan }   plays once to its true end
//   { type: "silence", duration }                 seconds of quiet
//   { type: "palette", duration, fadeIn, fadeOut, layers } layers sound
//       together; each layer draws from its own pool of tracks and silences --
//       at random, never the same entry twice running, or in pool order when
//       the layer sets `order: "sequential"`. The palette runs `duration`
//       seconds (0 = until something else stops it) and fades over `fadeOut`
//       before the next entry. A layer whose track reaches its end first hands
//       over to its next draw the same way, so with `duration: 0` a pool plays
//       through in full, crossfading track to track.
// Any entry may set `once: true` to play only on the sequence's first pass;
// later passes skip it, which is how an opening statement plays once over a
// bed that then repeats without it.
// A track inside a sequence or a palette plays with looping off, so its
// LOOPSTART/LOOPLENGTH tags are inert; a sequence that is one plain track
// is the ordinary BGM path, tags honoured.
//
// The sequence lives beside the BGM slot, not in it: _bgmBuffer and
// _currentBgm stay null while one plays, and every BGM entry point above
// checks _bgmSequence. It reports into the saved-BGM shape as the map's
// fallback track plus `sequence: mapId`, so battles, vehicles, Save BGM /
// Replay BGM and save files all restart it (with a fresh random draw)
// through playBgm. Restarting needs the map's data: when the map is not
// the current one yet (a save being loaded), the request waits as
// _pendingBgmSequence until the map's autoplay repeats it.
//
// A sequence can also live in the project's library,
// $dataSystem.reactorMusicSequences = [null, { id, name, sequence }], and
// travel under the key "library:<id>" instead of a map id. A map points at
// one with `bgmSequenceId` (which wins over a sequence of its own), and a
// troop, a map or Change Battle BGM keep battle music as an audio object whose
// track plays, or whose `sequence` names an entry. The library is always
// loaded, so a library key never waits. Two maps naming the same entry share
// its key, so moving between them leaves the music playing.

AudioManager._bgmSequence = null;
AudioManager._pendingBgmSequence = null;
AudioManager.BGM_SEQUENCE_ME_DUCK = 0.25;

/** The BGM object a map plays: its fallback track, marked with the sequence when it has one. */
AudioManager.mapBgmObject = function(map, mapId) {
    const bgm = Object.assign({}, (map && map.bgm) || this.makeEmptyAudioObject());
    delete bgm.sequence;
    delete bgm.looped;
    let key = null;
    if (map && this.librarySequenceData(map.bgmSequenceId)) {
        key = this.librarySequenceKey(map.bgmSequenceId);
    } else if (this.mapHasBgmSequence(map) && mapId > 0) {
        key = mapId;
    }
    if (key !== null) {
        bgm.sequence = key;
        // Carry whether this sequence has already come round, so boarding
        // a vehicle does not hand back an object that replays a heard intro.
        const running = this._bgmSequence || this._pendingBgmSequence;
        if (running && running.key === key && running.looped) bgm.looped = true;
    }
    return bgm;
};

AudioManager.mapHasBgmSequence = function(map) {
    const sequence = map && map.bgmSequence;
    return !!(sequence && sequence.enabled !== false && Array.isArray(sequence.entries) && sequence.entries.length > 0);
};

/** The key a library entry travels under in a BGM object. */
AudioManager.librarySequenceKey = function(id) {
    return "library:" + id;
};

/** The library id a key names, or 0 when the key is a map id. */
AudioManager.librarySequenceId = function(key) {
    const match = typeof key === "string" ? /^library:(\d+)$/.exec(key) : null;
    return match ? Number(match[1]) : 0;
};

/** A library entry's sequence, or null when `id` names nothing playable. */
AudioManager.librarySequenceData = function(id) {
    if (!(id > 0) || typeof $dataSystem === "undefined" || !$dataSystem) return null;
    const list = $dataSystem.reactorMusicSequences;
    const record = Array.isArray(list) ? list[id] : null;
    return record && this.mapHasBgmSequence({ bgmSequence: record.sequence }) ? record.sequence : null;
};

/**
 * The battle music a troop or a map keeps in `battleBgm`, the same audio object
 * Change Battle BGM stores. Its track plays; a `sequence` naming a playable
 * library entry plays that entry instead, with the track -- or the System
 * track, when none is set -- as the fallback. Null when it names neither.
 */
AudioManager.battleMusicBgm = function(audio) {
    if (!audio || typeof audio !== "object") return null;
    const bgm = {
        name: typeof audio.name === "string" ? audio.name : "",
        volume: Number.isFinite(audio.volume) ? audio.volume : 90,
        pitch: Number.isFinite(audio.pitch) ? audio.pitch : 100,
        pan: Number.isFinite(audio.pan) ? audio.pan : 0
    };
    const libraryId = this.librarySequenceId(audio.sequence);
    if (libraryId > 0 && this.librarySequenceData(libraryId)) {
        if (!bgm.name && $dataSystem.battleBgm) Object.assign(bgm, $dataSystem.battleBgm);
        delete bgm.looped;
        bgm.sequence = this.librarySequenceKey(libraryId);
        return bgm;
    }
    return bgm.name ? bgm : null;
};

/** The battle music the troop about to fight names, or null. */
AudioManager.troopBattleBgm = function() {
    if (typeof $gameTroop === "undefined" || !$gameTroop || typeof $gameTroop.troop !== "function") return null;
    const troop = $gameTroop.troop();
    return troop ? this.battleMusicBgm(troop.battleBgm) : null;
};

/** The battle music the current map names, or null; a battle test has no map. */
AudioManager.mapBattleBgm = function() {
    if (typeof $gameMap === "undefined" || !$gameMap || !($gameMap.mapId() > 0)) return null;
    if (typeof $dataMap === "undefined" || !$dataMap) return null;
    return this.battleMusicBgm($dataMap.battleBgm);
};

/** The sequence a key names: a library entry, or the current map's for its id (null while that map is not loaded). */
AudioManager._bgmSequenceDataFor = function(key) {
    const libraryId = this.librarySequenceId(key);
    if (libraryId > 0) return this.librarySequenceData(libraryId);
    if (typeof $gameMap === "undefined" || !$gameMap || $gameMap.mapId() !== key) return null;
    if (typeof $dataMap === "undefined" || !this.mapHasBgmSequence($dataMap)) return null;
    return $dataMap.bgmSequence;
};

AudioManager.playBgmSequence = function(bgm) {
    const key = bgm.sequence;
    const mapId = this.librarySequenceId(key) > 0 ? 0 : key;
    if (this._bgmSequence && this._bgmSequence.key === key && !this._bgmSequence.stopping) return;
    const fallback = { name: bgm.name, volume: bgm.volume, pitch: bgm.pitch, pan: bgm.pan };
    // A battle stops the sequence outright and coming back starts a new one, so
    // without this an intro entry would be heard again after every encounter.
    // Arriving on the map afresh carries no flag, which is what keeps an intro
    // an intro on each visit rather than only ever once.
    const looped = bgm.looped === true;
    const data = this._bgmSequenceDataFor(key);
    if (!data) {
        this.stopBgmSequence();
        if (mapId) {
            this.stopBgm();
            this._pendingBgmSequence = { key: key, mapId: mapId, fallback: fallback, looped: looped };
        } else if (fallback.name) {
            // A library entry that is gone: play the track it stood in for.
            this.playBgm(fallback);
        } else {
            this.stopBgm();
        }
        return;
    }
    const entries = data.entries.filter(entry => entry && typeof entry === "object");
    if (entries.length === 1 && entries[0].type === "track") {
        // One plain track: the ordinary looping BGM, loop tags and all -- and,
        // like any BGM, left playing when it is already the current track.
        this.stopBgmSequence();
        this.playBgm(this._bgmSequenceTrackAudio(entries[0]));
        return;
    }
    this.stopBgm();
    this._bgmSequence = {
        key: key,
        mapId: mapId,
        fallback: fallback,
        entries: entries,
        index: -1,
        buffers: [],
        duck: this._meBuffer ? this.BGM_SEQUENCE_ME_DUCK : 1,
        due: 0,
        palette: null,
        retiring: [],
        looped: looped,
        stopping: false
    };
    this._advanceBgmSequence();
};

AudioManager.stopBgmSequence = function() {
    this._pendingBgmSequence = null;
    const state = this._bgmSequence;
    if (!state) return;
    this._bgmSequence = null;
    for (const buffer of state.buffers) this._destroyBgmSequenceBuffer(buffer);
    for (const item of state.retiring || []) item.buffer.destroy();
    state.buffers = [];
    state.retiring = [];
};

AudioManager._bgmSequenceTrackAudio = function(entry) {
    return {
        name: entry.name || "",
        volume: Number.isFinite(entry.volume) ? entry.volume : 100,
        pitch: Number.isFinite(entry.pitch) ? entry.pitch : 100,
        pan: Number.isFinite(entry.pan) ? entry.pan : 0
    };
};

AudioManager._bgmSequenceBuffers = function() {
    return this._bgmSequence ? this._bgmSequence.buffers.filter(buffer => buffer && !buffer._rrRetired) : [];
};

/** Starts one non-looping track for the sequence; `onEnd` runs when it plays out. */
AudioManager._startBgmSequenceTrack = function(state, audio, onEnd, fadeIn) {
    const buffer = this.createBuffer("bgm/", audio.name);
    this.updateBufferParameters(buffer, this._bgmVolume, audio);
    buffer._rrBaseVolume = buffer.volume;
    buffer.volume = buffer._rrBaseVolume * state.duck;
    buffer.addStopListener(() => {
        // stop() also runs from destroy(); only a track that played out advances.
        if (buffer._rrRetired || this._bgmSequence !== state) return;
        buffer._rrRetired = true;
        onEnd();
    });
    buffer.play(false, 0);
    // After play: the fade stage does not exist until the nodes do. A buffer
    // still loading defers both, and in the order they were asked for.
    if (fadeIn > 0) buffer.fadeIn(fadeIn);
    state.buffers.push(buffer);
    return buffer;
};

AudioManager._destroyBgmSequenceBuffer = function(buffer) {
    if (!buffer) return;
    buffer._rrRetired = true;
    buffer.destroy();
};

/**
 * Releases a buffer the sequence has finished with. Given a fade it keeps
 * playing, ramping down, until the sweep in updateBgmSequence destroys it --
 * which is what lets the next entry start over the top of this one.
 */
AudioManager._retireBgmSequenceBuffer = function(state, buffer, fade) {
    if (!buffer) return;
    if (!(fade > 0)) {
        this._destroyBgmSequenceBuffer(buffer);
        return;
    }
    // Already ramping down under the sequential path, which destroys it when the
    // fade is done. Leaving that ramp alone is the point; restarting it here
    // would stretch a tail that is halfway through.
    if (buffer._rrRetired) return;
    buffer._rrRetired = true;
    buffer.fadeOut(fade);
    state.retiring.push({ buffer: buffer, doneAt: WebAudio._currentTime() + fade });
};

AudioManager._sweepBgmSequenceRetiring = function(state, now) {
    if (!state.retiring || !state.retiring.length) return;
    state.retiring = state.retiring.filter(item => {
        if (now < item.doneAt) return true;
        item.buffer.destroy();
        return false;
    });
};

/**
 * The entry that would play next, skipping any the sequence has used up -- the
 * same walk the advance makes, without moving. Asking the raw next entry would
 * read an intro's fade to decide a hand-over the intro is not going to take.
 */
AudioManager._nextBgmSequenceEntry = function(state) {
    const total = state.entries.length;
    let index = state.index;
    for (let step = 0; step < total; step++) {
        index = (index + 1) % total;
        const candidate = state.entries[index];
        const spent = (state.looped || index === 0) && candidate && candidate.once;
        if (!spent) return candidate;
    }
    return state.entries[index];
};

/** Seconds the entry wants to swell in over; 0 for one that names none. */
AudioManager._bgmSequenceFadeIn = function(entry) {
    return entry ? Math.max(0, Number(entry.fadeIn) || 0) : 0;
};

AudioManager._pruneBgmSequenceBuffers = function(state) {
    state.buffers = state.buffers.filter(buffer => buffer && !buffer._rrRetired);
};

AudioManager._advanceBgmSequence = function(fadeOut) {
    const state = this._bgmSequence;
    if (!state || state.stopping) return;
    this._endBgmSequencePalette(state, fadeOut);
    this._pruneBgmSequenceBuffers(state);
    const total = state.entries.length;
    // Walk forward past anything the sequence has already used up. Bounded by
    // the entry count, so a sequence made entirely of once-entries replays one
    // rather than falling silent looking for a survivor. `from` starts at -1, so
    // arriving at the first entry is the sequence beginning, not a lap.
    const from = state.index;
    for (let step = 0; step < total; step++) {
        state.index = (state.index + 1) % total;
        if (state.index === 0 && from >= 0) state.looped = true;
        const candidate = state.entries[state.index];
        if (!state.looped || !candidate || !candidate.once) break;
    }
    this._startBgmSequenceEntry(state, state.entries[state.index]);
};

AudioManager._startBgmSequenceEntry = function(state, entry) {
    const now = WebAudio._currentTime();
    switch (entry.type) {
        case "silence":
            state.due = now + Math.max(0, Number(entry.duration) || 0);
            break;
        case "palette":
            this._startBgmSequencePalette(state, entry, now);
            break;
        default: {
            const audio = this._bgmSequenceTrackAudio(entry);
            if (!audio.name) {
                state.due = now;
                break;
            }
            state.due = 0;
            const buffer = this._startBgmSequenceTrack(state, audio, () => {
                this._destroyBgmSequenceBuffer(buffer);
                this._advanceBgmSequence();
            }, Math.max(0, Number(entry.fadeIn) || 0));
        }
    }
};

AudioManager._startBgmSequencePalette = function(state, entry, now) {
    const layers = (Array.isArray(entry.layers) ? entry.layers : []).map(layer => ({
        volume: Number.isFinite(layer.volume) ? layer.volume : 100,
        pitch: Number.isFinite(layer.pitch) ? layer.pitch : 100,
        pan: Number.isFinite(layer.pan) ? layer.pan : 0,
        pool: (Array.isArray(layer.pool) ? layer.pool : []).filter(item => item && typeof item === "object"),
        trim: 100,
        order: layer.order === "sequential" || layer.order === "shuffle" ? layer.order : "random",
        bag: null,
        buffer: null,
        silentUntil: 0,
        last: -1
    })).filter(layer => layer.pool.length > 0);
    // Seeded by position in the filtered list, which the same entry reproduces.
    const carried = state.lastPicks && state.lastPicks.index === state.index ? state.lastPicks.picks : null;
    if (carried) layers.forEach((layer, i) => {
        const held = carried[i];
        if (!held) return;
        if (Number.isFinite(held.last)) layer.last = held.last;
        // The bag rides across a hand-over too, or a cycling palette would deal
        // a fresh bag every time and never finish the one it was dealing.
        if (Array.isArray(held.bag)) layer.bag = held.bag.slice();
    });
    const duration = Math.max(0, Number(entry.duration) || 0);
    state.palette = {
        layers: layers,
        startTime: now,
        duration: duration,
        fadeOut: Math.max(0, Number(entry.fadeOut) || 0),
        fadeIn: Math.max(0, Number(entry.fadeIn) || 0),
        single: !!entry.single,
        fading: false,
        fadeDoneAt: 0
    };
    state.due = 0;
    if (!layers.length) {
        state.due = now + duration;
        return;
    }
    for (const layer of layers) this._startBgmSequenceLayer(state, layer);
};

/** The next pool entry: in order, dealt from a shuffled bag, or drawn at random. */
AudioManager._pickBgmSequencePoolEntry = function(layer) {
    const pool = layer.pool;
    if (pool.length === 1) return 0;
    if (layer.order === "sequential") return (layer.last + 1) % pool.length;
    if (layer.order === "shuffle") {
        // Deal from a bag so every track is heard before any repeats, rather
        // than drawing independently and leaving one waiting for its turn.
        if (!layer.bag || !layer.bag.length) {
            layer.bag = pool.map((item, index) => index);
            for (let i = layer.bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const swap = layer.bag[i];
                layer.bag[i] = layer.bag[j];
                layer.bag[j] = swap;
            }
            // A fresh bag may still deal the track that just finished; the one
            // boundary a shuffle cannot fix by itself.
            const end = layer.bag.length - 1;
            if (layer.bag[end] === layer.last) {
                layer.bag[end] = layer.bag[end - 1];
                layer.bag[end - 1] = layer.last;
            }
        }
        return layer.bag.pop();
    }
    let index = Math.floor(Math.random() * pool.length);
    if (index === layer.last) index = (index + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
    return index;
};

AudioManager._startBgmSequenceLayer = function(state, layer) {
    const palette = state.palette;
    if (!palette || palette.fading || this._bgmSequence !== state) return;
    const index = this._pickBgmSequencePoolEntry(layer);
    layer.last = index;
    const item = layer.pool[index];
    layer.buffer = null;
    if (item.type === "silence" || !item.name) {
        layer.silentUntil = WebAudio._currentTime() + Math.max(0, Number(item.duration) || 0);
        return;
    }
    layer.silentUntil = 0;
    // A pool draws from wherever its tracks came from, and two sources rarely
    // agree on level. The item's own volume trims it against the rest.
    layer.trim = Number.isFinite(item.volume) ? item.volume : 100;
    const audio = {
        name: item.name,
        volume: layer.volume * layer.trim / 100,
        pitch: layer.pitch,
        pan: layer.pan
    };
    const buffer = this._startBgmSequenceTrack(state, audio, () => {
        this._destroyBgmSequenceBuffer(buffer);
        if (layer.buffer === buffer) layer.buffer = null;
        this._pruneBgmSequenceBuffers(state);
        if (state.palette && state.palette.single) this._advanceIfPaletteSpent(state);
        else this._startBgmSequenceLayer(state, layer);
    }, palette.fadeIn);
    layer.buffer = buffer;
};

/**
 * Whether a layer's track is close enough to its end to hand over now. Measured
 * from the buffer's own clock rather than from when playback was asked for, so a
 * slow decode delays the hand-over with the track instead of cutting it short.
 */
AudioManager._bgmSequenceLayerIsEnding = function(layer, palette) {
    const buffer = layer.buffer;
    if (!buffer || buffer._rrRetired || !(palette.fadeOut > 0)) return false;
    if (!buffer.isPlaying || !buffer.isPlaying()) return false;
    const total = buffer._totalTime;
    // A track shorter than its own crossfade would hand over before it is heard.
    if (!(total > palette.fadeOut)) return false;
    // play() marks a buffer playing while it is still decoding, and _startTime
    // is only set once playback really begins; reading it before that would
    // hand over a track nobody has heard.
    if (!(buffer._startTime > 0)) return false;
    // Not seek(): that wraps at the file's loop points whether or not the source
    // is looping, and a sequence plays every track with looping off, so a file
    // whose loop region is shorter than itself would wrap before reaching its
    // end and never hand over at all.
    const played = (WebAudio._currentTime() - buffer._startTime) * (buffer._pitch || 1);
    return played >= total - palette.fadeOut;
};

/** Moves a single-shot palette on once every layer has had its one turn. */
AudioManager._advanceIfPaletteSpent = function(state) {
    const palette = state.palette;
    if (!palette || !palette.single || palette.fading) return;
    const busy = palette.layers.some(layer => layer.buffer || layer.silentUntil);
    if (!busy) this._advanceBgmSequence(palette.fadeOut);
};

AudioManager._endBgmSequencePalette = function(state, fadeOut) {
    const palette = state.palette;
    if (!palette) return;
    // Carried into the next draw of this same entry: without it the no-repeat
    // guard resets every cycle and a layer can hand over to the track it is
    // already playing -- inaudible when the palette faded to silence first,
    // but an overlap makes it a track phasing against a copy of itself.
    state.lastPicks = { index: state.index, picks: palette.layers.map(layer => ({ last: layer.last, bag: layer.bag })) };
    state.palette = null;
    for (const layer of palette.layers) {
        if (layer.buffer) this._retireBgmSequenceBuffer(state, layer.buffer, fadeOut);
        layer.buffer = null;
    }
    this._pruneBgmSequenceBuffers(state);
};

/** The per-frame step: silences end, palette layers restart, palettes fade and move on. */
AudioManager.updateBgmSequence = function() {
    const state = this._bgmSequence;
    if (!state) return;
    const now = WebAudio._currentTime();
    this._sweepBgmSequenceRetiring(state, now);
    if (state.stopping) {
        if (now >= state.due) this.stopBgmSequence();
        return;
    }
    const palette = state.palette;
    if (palette) {
        if (palette.fading) {
            if (now >= palette.fadeDoneAt) this._advanceBgmSequence();
            return;
        }
        for (const layer of palette.layers) {
            if (!layer.buffer && layer.silentUntil && now >= layer.silentUntil) {
                layer.silentUntil = 0;
                if (palette.single) { this._advanceIfPaletteSpent(state); return; }
                this._startBgmSequenceLayer(state, layer);
            } else if (layer.buffer && this._bgmSequenceLayerIsEnding(layer, palette)) {
                // Single-shot: the end of the one track is the end of the entry,
                // so it crossfades into what follows rather than drawing again.
                if (palette.single) { this._advanceBgmSequence(palette.fadeOut); return; }
                // Retiring first matters twice: the stop listener bails on a
                // retired buffer, so the track playing itself out cannot start a
                // second draw on top of the one starting here.
                this._retireBgmSequenceBuffer(state, layer.buffer, palette.fadeOut);
                layer.buffer = null;
                this._startBgmSequenceLayer(state, layer);
            }
        }
        if (palette.duration > 0 && now - palette.startTime >= palette.duration) {
            // When the entry that follows names a fade-in, the two overlap: this
            // palette starts its tail and the next entry begins over the top of
            // it, rather than the advance waiting for silence first. An entry
            // naming no fade-in -- every sequence authored before there was one,
            // and every silence -- keeps the sequential timing it has always had.
            const next = this._nextBgmSequenceEntry(state);
            if (this._bgmSequenceFadeIn(next) > 0) {
                this._advanceBgmSequence(palette.fadeOut);
                return;
            }
            palette.fading = true;
            palette.fadeDoneAt = now + palette.fadeOut;
            for (const layer of palette.layers) {
                // Retire first: a track ending mid-fade must not start another.
                if (layer.buffer) {
                    layer.buffer._rrRetired = true;
                    layer.buffer.fadeOut(palette.fadeOut);
                }
            }
            if (!palette.layers.length) this._advanceBgmSequence();
        }
        return;
    }
    if (state.due && now >= state.due) {
        state.due = 0;
        this._advanceBgmSequence();
    }
};

AudioManager._fadeOutBgmSequence = function(duration) {
    const state = this._bgmSequence;
    if (!state || state.stopping) return;
    state.stopping = true;
    state.due = WebAudio._currentTime() + Math.max(0, duration || 0);
    for (const buffer of state.buffers) {
        if (!buffer || buffer._rrRetired) continue;
        buffer._rrRetired = true;
        buffer.fadeOut(duration);
    }
};

AudioManager._duckBgmSequence = function(factor) {
    const state = this._bgmSequence;
    if (!state) return;
    state.duck = factor;
    for (const buffer of this._bgmSequenceBuffers()) {
        if (typeof buffer._rrBaseVolume === "number") buffer.volume = buffer._rrBaseVolume * factor;
    }
};

/** Re-derives every live layer's volume after the BGM volume option changes. */
AudioManager._refreshBgmSequenceVolumes = function() {
    const state = this._bgmSequence;
    if (!state) return;
    const entry = state.entries[state.index];
    for (const buffer of this._bgmSequenceBuffers()) {
        let audio = null;
        if (state.palette) {
            const layer = state.palette.layers.find(item => item.buffer === buffer);
            if (layer) {
                const trim = Number.isFinite(layer.trim) ? layer.trim : 100;
                audio = { volume: layer.volume * trim / 100, pitch: layer.pitch, pan: layer.pan };
            }
        } else if (entry) {
            audio = this._bgmSequenceTrackAudio(entry);
        }
        if (!audio) continue;
        this.updateBufferParameters(buffer, this._bgmVolume, audio);
        buffer._rrBaseVolume = buffer.volume;
        buffer.volume = buffer._rrBaseVolume * state.duck;
    }
};

//-----------------------------------------------------------------------------
// SoundManager
//
// The static class that plays sound effects defined in the database.

function SoundManager() {
    throw new Error("This is a static class");
}

SoundManager.preloadImportantSounds = function() {
    this.loadSystemSound(0);
    this.loadSystemSound(1);
    this.loadSystemSound(2);
    this.loadSystemSound(3);
};

SoundManager.systemSoundSlot = function(n) {
    return ($dataSystem && $dataSystem.sounds && $dataSystem.sounds[n]) || null;
};

SoundManager.loadSystemSound = function(n) {
    // Every take in the pool, not just the base one: playStaticSe would load a
    // missing variant on demand, but the first play of it would then fire
    // against a buffer that has not started fetching.
    for (const se of AudioManager.seVariantPool(this.systemSoundSlot(n))) {
        AudioManager.loadStaticSe(se);
    }
};

SoundManager.playSystemSound = function(n) {
    // The slot goes to AudioManager whole, pool and pitch range intact, and is
    // resolved there. Nothing is rolled here, so nothing rolls twice.
    const slot = this.systemSoundSlot(n);
    if (slot) {
        AudioManager.playStaticSe(slot);
    }
};

// Kept because a plugin may alias either, and both keep their old shape and
// meaning -- they simply no longer sit in the play path.
SoundManager.systemSoundVariants = function(n) {
    return AudioManager.seVariantPool(this.systemSoundSlot(n));
};

SoundManager.applySystemSoundPitch = function(se, slot) {
    const pitch = AudioManager.rollSePitch(slot && slot.pitchRandom);
    if (pitch === null) return se;
    return { name: se.name, volume: se.volume, pitch, pan: se.pan };
};

SoundManager.playCursor = function() {
    this.playSystemSound(0);
};

SoundManager.playOk = function() {
    this.playSystemSound(1);
};

SoundManager.playCancel = function() {
    this.playSystemSound(2);
};

SoundManager.playBuzzer = function() {
    this.playSystemSound(3);
};

SoundManager.playEquip = function() {
    this.playSystemSound(4);
};

SoundManager.playSave = function() {
    this.playSystemSound(5);
};

SoundManager.playLoad = function() {
    this.playSystemSound(6);
};

SoundManager.playBattleStart = function() {
    this.playSystemSound(7);
};

SoundManager.playEscape = function() {
    this.playSystemSound(8);
};

SoundManager.playEnemyAttack = function() {
    this.playSystemSound(9);
};

SoundManager.playEnemyDamage = function() {
    this.playSystemSound(10);
};

SoundManager.playEnemyCollapse = function() {
    this.playSystemSound(11);
};

SoundManager.playBossCollapse1 = function() {
    this.playSystemSound(12);
};

SoundManager.playBossCollapse2 = function() {
    this.playSystemSound(13);
};

SoundManager.playActorDamage = function() {
    this.playSystemSound(14);
};

SoundManager.playActorCollapse = function() {
    this.playSystemSound(15);
};

SoundManager.playRecovery = function() {
    this.playSystemSound(16);
};

SoundManager.playMiss = function() {
    this.playSystemSound(17);
};

SoundManager.playEvasion = function() {
    this.playSystemSound(18);
};

SoundManager.playMagicEvasion = function() {
    this.playSystemSound(19);
};

SoundManager.playReflection = function() {
    this.playSystemSound(20);
};

SoundManager.playShop = function() {
    this.playSystemSound(21);
};

SoundManager.playUseItem = function() {
    this.playSystemSound(22);
};

SoundManager.playUseSkill = function() {
    this.playSystemSound(23);
};

// Slots 24-25 postdate the 24-slot MZ sound schema, so a project last saved
// before they existed has no entry at them at all. An absent slot falls back to
// Recovery (16) -- the sound those heals already played -- while a slot that is
// present with a blank name is a deliberate silence, exactly like every other
// sound slot.
SoundManager.playTypedRecovery = function(n) {
    if ($dataSystem && $dataSystem.sounds[n]) {
        this.playSystemSound(n);
    } else {
        this.playRecovery();
    }
};

SoundManager.playMpRecovery = function() {
    this.playTypedRecovery(24);
};

SoundManager.playTpRecovery = function() {
    this.playTypedRecovery(25);
};

//-----------------------------------------------------------------------------
// TextManager
//
// The static class that handles terms and messages.

function TextManager() {
    throw new Error("This is a static class");
}

TextManager.basic = function(basicId) {
    return $dataSystem.terms.basic[basicId] || "";
};

TextManager.param = function(paramId) {
    return $dataSystem.terms.params[paramId] || "";
};

TextManager.command = function(commandId) {
    return $dataSystem.terms.commands[commandId] || "";
};

TextManager.message = function(messageId) {
    return $dataSystem.terms.messages[messageId] || "";
};

TextManager.getter = function(method, param) {
    return {
        get: function() {
            return this[method](param);
        },
        configurable: true
    };
};

Object.defineProperty(TextManager, "currencyUnit", {
    get: function() {
        return $dataSystem.currencyUnit;
    },
    configurable: true
});

Object.defineProperties(TextManager, {
    level: TextManager.getter("basic", 0),
    levelA: TextManager.getter("basic", 1),
    hp: TextManager.getter("basic", 2),
    hpA: TextManager.getter("basic", 3),
    mp: TextManager.getter("basic", 4),
    mpA: TextManager.getter("basic", 5),
    tp: TextManager.getter("basic", 6),
    tpA: TextManager.getter("basic", 7),
    exp: TextManager.getter("basic", 8),
    expA: TextManager.getter("basic", 9),
    fight: TextManager.getter("command", 0),
    escape: TextManager.getter("command", 1),
    attack: TextManager.getter("command", 2),
    guard: TextManager.getter("command", 3),
    item: TextManager.getter("command", 4),
    skill: TextManager.getter("command", 5),
    equip: TextManager.getter("command", 6),
    status: TextManager.getter("command", 7),
    formation: TextManager.getter("command", 8),
    save: TextManager.getter("command", 9),
    gameEnd: TextManager.getter("command", 10),
    options: TextManager.getter("command", 11),
    weapon: TextManager.getter("command", 12),
    armor: TextManager.getter("command", 13),
    keyItem: TextManager.getter("command", 14),
    equip2: TextManager.getter("command", 15),
    optimize: TextManager.getter("command", 16),
    clear: TextManager.getter("command", 17),
    newGame: TextManager.getter("command", 18),
    continue_: TextManager.getter("command", 19),
    toTitle: TextManager.getter("command", 21),
    cancel: TextManager.getter("command", 22),
    buy: TextManager.getter("command", 24),
    sell: TextManager.getter("command", 25),
    alwaysDash: TextManager.getter("message", "alwaysDash"),
    commandRemember: TextManager.getter("message", "commandRemember"),
    touchUI: TextManager.getter("message", "touchUI"),
    bgmVolume: TextManager.getter("message", "bgmVolume"),
    bgsVolume: TextManager.getter("message", "bgsVolume"),
    meVolume: TextManager.getter("message", "meVolume"),
    seVolume: TextManager.getter("message", "seVolume"),
    possession: TextManager.getter("message", "possession"),
    expTotal: TextManager.getter("message", "expTotal"),
    expNext: TextManager.getter("message", "expNext"),
    saveMessage: TextManager.getter("message", "saveMessage"),
    loadMessage: TextManager.getter("message", "loadMessage"),
    file: TextManager.getter("message", "file"),
    autosave: TextManager.getter("message", "autosave"),
    partyName: TextManager.getter("message", "partyName"),
    emerge: TextManager.getter("message", "emerge"),
    preemptive: TextManager.getter("message", "preemptive"),
    surprise: TextManager.getter("message", "surprise"),
    escapeStart: TextManager.getter("message", "escapeStart"),
    escapeFailure: TextManager.getter("message", "escapeFailure"),
    victory: TextManager.getter("message", "victory"),
    defeat: TextManager.getter("message", "defeat"),
    obtainExp: TextManager.getter("message", "obtainExp"),
    obtainGold: TextManager.getter("message", "obtainGold"),
    obtainItem: TextManager.getter("message", "obtainItem"),
    levelUp: TextManager.getter("message", "levelUp"),
    obtainSkill: TextManager.getter("message", "obtainSkill"),
    useItem: TextManager.getter("message", "useItem"),
    criticalToEnemy: TextManager.getter("message", "criticalToEnemy"),
    criticalToActor: TextManager.getter("message", "criticalToActor"),
    actorDamage: TextManager.getter("message", "actorDamage"),
    actorRecovery: TextManager.getter("message", "actorRecovery"),
    actorGain: TextManager.getter("message", "actorGain"),
    actorLoss: TextManager.getter("message", "actorLoss"),
    actorDrain: TextManager.getter("message", "actorDrain"),
    actorNoDamage: TextManager.getter("message", "actorNoDamage"),
    actorNoHit: TextManager.getter("message", "actorNoHit"),
    enemyDamage: TextManager.getter("message", "enemyDamage"),
    enemyRecovery: TextManager.getter("message", "enemyRecovery"),
    enemyGain: TextManager.getter("message", "enemyGain"),
    enemyLoss: TextManager.getter("message", "enemyLoss"),
    enemyDrain: TextManager.getter("message", "enemyDrain"),
    enemyNoDamage: TextManager.getter("message", "enemyNoDamage"),
    enemyNoHit: TextManager.getter("message", "enemyNoHit"),
    evasion: TextManager.getter("message", "evasion"),
    magicEvasion: TextManager.getter("message", "magicEvasion"),
    magicReflection: TextManager.getter("message", "magicReflection"),
    counterAttack: TextManager.getter("message", "counterAttack"),
    substitute: TextManager.getter("message", "substitute"),
    buffAdd: TextManager.getter("message", "buffAdd"),
    debuffAdd: TextManager.getter("message", "debuffAdd"),
    buffRemove: TextManager.getter("message", "buffRemove"),
    actionFailure: TextManager.getter("message", "actionFailure")
});

//-----------------------------------------------------------------------------
// ColorManager
//
// The static class that handles the window colors.

function ColorManager() {
    throw new Error("This is a static class");
}

ColorManager.loadWindowskin = function() {
    this._windowskin = ImageManager.loadSystem("Window");
    this.clearTextColorCache();
};

ColorManager.clearTextColorCache = function() {
    this._textColorCache = null;
    this._textColorCacheSkin = null;
};

ColorManager.readTextColor = function(n) {
    const px = 96 + (n % 8) * 12 + 6;
    const py = 144 + Math.floor(n / 8) * 12 + 6;
    return this._windowskin.getPixel(px, py);
};

// Each read is a getImageData allocation plus string building, and windows
// that redraw every frame ask for many colors per row — the victory gauge
// count-up alone runs about ten per actor per frame, which is enough steady
// allocation to show up as periodic hitching. The palette is fixed once the
// skin has loaded, so cache per skin instance; swapping skins (or reloading
// one) replaces the instance and drops the cache with it.
ColorManager.textColor = function(n) {
    const windowskin = this._windowskin;
    if (!windowskin || !windowskin.isReady()) {
        return this.readTextColor(n);
    }
    if (this._textColorCacheSkin !== windowskin) {
        this._textColorCacheSkin = windowskin;
        this._textColorCache = new Map();
    }
    let color = this._textColorCache.get(n);
    if (color === undefined) {
        color = this.readTextColor(n);
        this._textColorCache.set(n, color);
    }
    return color;
};

ColorManager.normalColor = function() {
    return this.textColor(0);
};

ColorManager.systemColor = function() {
    return this.textColor(16);
};

ColorManager.crisisColor = function() {
    return this.textColor(17);
};

ColorManager.deathColor = function() {
    return this.textColor(18);
};

ColorManager.gaugeBackColor = function() {
    return this.textColor(19);
};

ColorManager.hpGaugeColor1 = function() {
    return this.textColor(20);
};

ColorManager.hpGaugeColor2 = function() {
    return this.textColor(21);
};

ColorManager.mpGaugeColor1 = function() {
    return this.textColor(22);
};

ColorManager.mpGaugeColor2 = function() {
    return this.textColor(23);
};

ColorManager.mpCostColor = function() {
    return this.textColor(23);
};

ColorManager.powerUpColor = function() {
    return this.textColor(24);
};

ColorManager.powerDownColor = function() {
    return this.textColor(25);
};

ColorManager.ctGaugeColor1 = function() {
    return this.textColor(26);
};

ColorManager.ctGaugeColor2 = function() {
    return this.textColor(27);
};

ColorManager.tpGaugeColor1 = function() {
    return this.textColor(28);
};

ColorManager.tpGaugeColor2 = function() {
    return this.textColor(29);
};

ColorManager.tpCostColor = function() {
    return this.textColor(29);
};

ColorManager.pendingColor = function() {
    return this._windowskin.getPixel(120, 120);
};

ColorManager.hpColor = function(actor) {
    if (!actor) {
        return this.normalColor();
    } else if (actor.isDead()) {
        return this.deathColor();
    } else if (actor.isDying()) {
        return this.crisisColor();
    } else {
        return this.normalColor();
    }
};

ColorManager.mpColor = function(/*actor*/) {
    return this.normalColor();
};

ColorManager.tpColor = function(/*actor*/) {
    return this.normalColor();
};

ColorManager.paramchangeTextColor = function(change) {
    if (change > 0) {
        return this.powerUpColor();
    } else if (change < 0) {
        return this.powerDownColor();
    } else {
        return this.normalColor();
    }
};

ColorManager.damageColor = function(colorType) {
    switch (colorType) {
        case 0: // HP damage
            return "#ffffff";
        case 1: // HP recover
            return "#b9ffb5";
        case 2: // MP damage
            return "#ffff90";
        case 3: // MP recover
            return "#80b0ff";
        default:
            return "#808080";
    }
};

ColorManager.outlineColor = function() {
    return "rgba(0, 0, 0, 0.6)";
};

ColorManager.dimColor1 = function() {
    return "rgba(0, 0, 0, 0.6)";
};

ColorManager.dimColor2 = function() {
    return "rgba(0, 0, 0, 0)";
};

ColorManager.itemBackColor1 = function() {
    return "rgba(32, 32, 32, 0.5)";
};

ColorManager.itemBackColor2 = function() {
    return "rgba(0, 0, 0, 0.5)";
};

//-----------------------------------------------------------------------------
// SceneManager
//
// The static class that manages scene transitions.

function SceneManager() {
    throw new Error("This is a static class");
}

SceneManager._scene = null;
SceneManager._nextScene = null;
SceneManager._stack = [];
SceneManager._exiting = false;
SceneManager._previousScene = null;
SceneManager._previousClass = null;
SceneManager._backgroundBitmap = null;
SceneManager._smoothDeltaTime = 1;
SceneManager._elapsedTime = 0;

SceneManager.run = async function(sceneClass) {
    try {
        await this.initialize();
        this.goto(sceneClass);
        Graphics.startGameLoop();
    } catch (e) {
        this.catchException(e);
    }
};

SceneManager.initialize = async function() {
    this.checkBrowser();
    this.checkPluginErrors();
    await this.initGraphics();
    this.initAudio();
    this.initVideo();
    this.initInput();
    this.setupEventHandlers();
};

SceneManager.checkBrowser = function() {
    if (!Utils.canUseWebGL()) {
        throw new Error("Your browser does not support WebGL.");
    }
    if (!Utils.canUseWebAudioAPI()) {
        throw new Error("Your browser does not support Web Audio API.");
    }
    if (!Utils.canUseCssFontLoading()) {
        throw new Error("Your browser does not support CSS Font Loading.");
    }
    if (!Utils.canUseIndexedDB()) {
        throw new Error("Your browser does not support IndexedDB.");
    }
};

SceneManager.checkPluginErrors = function() {
    PluginManager.checkErrors();
};

SceneManager.initGraphics = async function() {
    if (!(await Graphics.initialize())) {
        throw new Error("Failed to initialize graphics.");
    }
    Graphics.setTickHandler(this.update.bind(this));
};

SceneManager.initAudio = function() {
    WebAudio.initialize();
};

SceneManager.initVideo = function() {
    Video.initialize(Graphics.width, Graphics.height);
};

SceneManager.initInput = function() {
    Input.initialize();
    TouchInput.initialize();
};

SceneManager.setupEventHandlers = function() {
    window.addEventListener("error", this.onError.bind(this));
    window.addEventListener("unhandledrejection", this.onReject.bind(this));
    // "unload" is deprecated in Chromium; "pagehide" fires in the same
    // teardown situations (including window close) without the deprecation.
    window.addEventListener("pagehide", this.onUnload.bind(this));
    document.addEventListener("keydown", this.onKeyDown.bind(this));
};

SceneManager.update = function(deltaTime) {
    try {
        const n = this.determineRepeatNumber(deltaTime);
        for (let i = 0; i < n; i++) {
            // Which pass of the catch-up loop this is. Game logic must run
            // every time — that is the whole point of the loop, and what
            // keeps a slow machine's game running at sixty logical ticks —
            // but work that only exists to put pixels on the screen must
            // not, because the screen is only painted once however many
            // times the logic ran. See `Spriteset_Map.updateReactor3D`,
            // which was rendering the entire 3D scene once per tick: a
            // frame slow enough to ask for two ticks paid for two full
            // scene renders, which made it slower, which kept it asking.
            this._finalUpdateOfFrame = i === n - 1;
            this.updateMain();
        }
    } catch (e) {
        this.catchException(e);
    } finally {
        this._finalUpdateOfFrame = true;
    }
};

/**
 * Whether this update is the one whose results will actually be displayed.
 * True outside the catch-up loop as well, so anything calling `updateMain`
 * directly (a plugin, a test) still draws.
 */
SceneManager.isFinalUpdateOfFrame = function() {
    return this._finalUpdateOfFrame !== false;
};

SceneManager.determineRepeatNumber = function(deltaTime) {
    // [Note] We consider environments where the refresh rate is higher than
    //   60Hz, but ignore sudden irregular deltaTime.
    this._smoothDeltaTime *= 0.8;
    this._smoothDeltaTime += Math.min(deltaTime, 2) * 0.2;
    if (this._smoothDeltaTime >= 0.9) {
        this._elapsedTime = 0;
        return Math.round(this._smoothDeltaTime);
    } else {
        this._elapsedTime += deltaTime;
        if (this._elapsedTime >= 1) {
            this._elapsedTime -= 1;
            return 1;
        }
        return 0;
    }
};

SceneManager.terminate = function() {
    if (Utils.isNwjs()) {
        nw.App.quit();
    }
};

SceneManager.onError = function(event) {
    console.error(event.message);
    // A promise rejection routed here has no source location; printing
    // "undefined undefined" under every such error was pure noise.
    if (event.filename !== undefined || event.lineno !== undefined) {
        console.error(event.filename, event.lineno);
    }
    try {
        this.stop();
        Graphics.printError("Error", event.message, event);
        AudioManager.stopAll();
    } catch (e) {
        //
    }
};

SceneManager.onReject = function(event) {
    // Browser media startup is asynchronous. Legacy plugins can leave its
    // promise uncaught when a scene pauses/unloads a video before it starts.
    // This specific cancellation is not a game failure; other AbortErrors
    // (fetch, storage, etc.) and programming errors must still be reported.
    if (event.reason?.name === "AbortError" &&
        /^The play\(\) request was interrupted\b/.test(String(event.reason.message || ""))) {
        event.preventDefault?.();
        return;
    }
    // Catch uncaught exception in Promise
    event.message = event.reason;
    this.onError(event);
};

SceneManager.onUnload = function() {
    ImageManager.clear();
    EffectManager.clear();
    AudioManager.stopAll();
};

SceneManager.onKeyDown = function(event) {
    if (!event.ctrlKey && !event.altKey) {
        switch (event.keyCode) {
            case 116: // F5
                this.reloadGame();
                break;
            case 119: // F8
                this.showDevTools();
                break;
        }
    }
};

SceneManager.reloadGame = function() {
    if (Utils.isNwjs()) {
        chrome.runtime.reload();
    }
};

SceneManager.showDevTools = function() {
    if (Utils.isNwjs() && Utils.isOptionValid("test")) {
        nw.Window.get().showDevTools();
    }
};

SceneManager.catchException = function(e) {
    if (e instanceof Error) {
        this.catchNormalError(e);
    } else if (e instanceof Array && e[0] === "LoadError") {
        this.catchLoadError(e);
    } else {
        this.catchUnknownError(e);
    }
    this.stop();
};

SceneManager.catchNormalError = function(e) {
    Graphics.printError(e.name, e.message, e);
    AudioManager.stopAll();
    console.error(e.stack);
};

SceneManager.catchLoadError = function(e) {
    const url = e[1];
    const retry = e[2];
    Graphics.printError("Failed to load", url);
    if (retry) {
        Graphics.showRetryButton(() => {
            retry();
            SceneManager.resume();
        });
    } else {
        AudioManager.stopAll();
    }
};

SceneManager.catchUnknownError = function(e) {
    Graphics.printError("UnknownError", String(e));
    AudioManager.stopAll();
};

SceneManager.updateMain = function() {
    this.updateFrameCount();
    this.updateInputData();
    this.updateEffekseer();
    this.changeScene();
    this.updateScene();
};

SceneManager.updateFrameCount = function() {
    Graphics.frameCount++;
};

SceneManager.updateInputData = function() {
    Input.update();
    TouchInput.update();
};

SceneManager.updateEffekseer = function() {
    if (Graphics.effekseer && this.isGameActive()) {
        Graphics.effekseer._makeContextCurrent?.();
        Graphics.effekseer.update();
        if (typeof Reactor3D !== "undefined") Reactor3D.GpuEffects?.update();
    }
};

SceneManager.changeScene = function() {
    if (this.isSceneChanging() && !this.isCurrentSceneBusy()) {
        if (this._scene) {
            this._scene.terminate();
            this.onSceneTerminate();
        }
        this._scene = this._nextScene;
        this._nextScene = null;
        if (this._scene) {
            this._scene.create();
            this.onSceneCreate();
        }
        if (this._exiting) {
            this.terminate();
        }
    }
};

SceneManager.updateScene = function() {
    if (this._scene) {
        if (this._scene.isStarted()) {
            if (this.isGameActive()) {
                this._scene.update();
            }
        } else if (this._scene.isReady()) {
            this.onBeforeSceneStart();
            this._scene.start();
            this.onSceneStart();
        }
    }
};

SceneManager.isGameActive = function() {
    // [Note] We use "window.top" to support an iframe.
    try {
        return window.top.document.hasFocus();
    } catch (e) {
        // SecurityError
        return true;
    }
};

SceneManager.onSceneTerminate = function() {
    this._previousScene = this._scene;
    this._previousClass = this._scene.constructor;
    Graphics.setStage(null);
};

SceneManager.onSceneCreate = function() {
    Graphics.startLoading();
};

SceneManager.onBeforeSceneStart = function() {
    if (this._previousScene) {
        this._previousScene.destroy();
        this._previousScene = null;
    }
    if (Graphics.effekseer) {
        Graphics.effekseer.stopAll();
    }
};

SceneManager.onSceneStart = function() {
    Graphics.endLoading();
    Graphics.setStage(this._scene);
};

SceneManager.isSceneChanging = function() {
    return this._exiting || !!this._nextScene;
};

SceneManager.isCurrentSceneBusy = function() {
    return this._scene && this._scene.isBusy();
};

SceneManager.isNextScene = function(sceneClass) {
    return this._nextScene && this._nextScene.constructor === sceneClass;
};

SceneManager.isPreviousScene = function(sceneClass) {
    return this._previousClass === sceneClass;
};

SceneManager.goto = function(sceneClass) {
    if (sceneClass) {
        this._nextScene = new sceneClass();
    }
    if (this._scene) {
        this._scene.stop();
    }
};

SceneManager.push = function(sceneClass) {
    this._stack.push(this._scene.constructor);
    this.goto(sceneClass);
};

SceneManager.pop = function() {
    if (this._stack.length > 0) {
        this.goto(this._stack.pop());
    } else {
        this.exit();
    }
};

SceneManager.exit = function() {
    this.goto(null);
    this._exiting = true;
};

SceneManager.clearStack = function() {
    this._stack = [];
};

SceneManager.stop = function() {
    Graphics.stopGameLoop();
};

SceneManager.prepareNextScene = function() {
    this._nextScene.prepare(...arguments);
};

SceneManager.snap = function() {
    return Bitmap.snap(this._scene);
};

SceneManager.snapForBackground = function() {
    if (this._backgroundBitmap) {
        this._backgroundBitmap.destroy();
    }
    this._backgroundBitmap = this.snap();
};

SceneManager.backgroundBitmap = function() {
    return this._backgroundBitmap;
};

SceneManager.resume = function() {
    TouchInput.update();
    Graphics.startGameLoop();
};

//-----------------------------------------------------------------------------
// BattleManager
//
// The static class that manages battle progress.

function BattleManager() {
    throw new Error("This is a static class");
}

BattleManager.setup = function(troopId, canEscape, canLose) {
    this.initMembers();
    this._canEscape = canEscape;
    this._canLose = canLose;
    $gameTroop.setup(troopId);
    $gameScreen.onBattleStart();
    this.makeEscapeRatio();
};

BattleManager.initMembers = function() {
    this._phase = "";
    this._inputting = false;
    this._canEscape = false;
    this._canLose = false;
    this._battleTest = false;
    this._eventCallback = null;
    this._preemptive = false;
    this._surprise = false;
    this._currentActor = null;
    this._actionForcedBattler = null;
    this._mapBgm = null;
    this._mapBgs = null;
    this._actionBattlers = [];
    this._subject = null;
    this._action = null;
    this._targets = [];
    this._logWindow = null;
    this._spriteset = null;
    this._escapeRatio = 0;
    this._escaped = false;
    this._rewards = {};
    this._tpbNeedsPartyCommand = true;
};

BattleManager.isTpb = function() {
    return $dataSystem.battleSystem >= 1;
};

BattleManager.isActiveTpb = function() {
    return $dataSystem.battleSystem === 1;
};

BattleManager.isBattleTest = function() {
    return this._battleTest;
};

BattleManager.setBattleTest = function(battleTest) {
    this._battleTest = battleTest;
};

BattleManager.setEventCallback = function(callback) {
    this._eventCallback = callback;
};

BattleManager.setLogWindow = function(logWindow) {
    this._logWindow = logWindow;
};

BattleManager.setSpriteset = function(spriteset) {
    this._spriteset = spriteset;
};

BattleManager.onEncounter = function() {
    this._preemptive = Math.random() < this.ratePreemptive();
    this._surprise = Math.random() < this.rateSurprise() && !this._preemptive;
};

BattleManager.ratePreemptive = function() {
    return $gameParty.ratePreemptive($gameTroop.agility());
};

BattleManager.rateSurprise = function() {
    return $gameParty.rateSurprise($gameTroop.agility());
};

BattleManager.saveBgmAndBgs = function() {
    this._mapBgm = AudioManager.saveBgm();
    this._mapBgs = AudioManager.saveBgs();
};

BattleManager.playBattleBgm = function() {
    AudioManager.playBgm($gameSystem.battleBgm());
    AudioManager.stopBgs();
};

BattleManager.playVictoryMe = function() {
    AudioManager.playMe($gameSystem.victoryMe());
};

BattleManager.playDefeatMe = function() {
    AudioManager.playMe($gameSystem.defeatMe());
};

BattleManager.replayBgmAndBgs = function() {
    if (this._mapBgm) {
        AudioManager.replayBgm(this._mapBgm);
    } else {
        AudioManager.stopBgm();
    }
    if (this._mapBgs) {
        AudioManager.replayBgs(this._mapBgs);
    }
};

BattleManager.makeEscapeRatio = function() {
    this._escapeRatio = (0.5 * $gameParty.agility()) / $gameTroop.agility();
};

BattleManager.update = function(timeActive) {
    if (!this.isBusy() && !this.updateEvent()) {
        this.updatePhase(timeActive);
    }
    if (this.isTpb()) {
        this.updateTpbInput();
    }
};

BattleManager.updatePhase = function(timeActive) {
    switch (this._phase) {
        case "start":
            this.updateStart();
            break;
        case "turn":
            this.updateTurn(timeActive);
            break;
        case "action":
            this.updateAction();
            break;
        case "turnEnd":
            this.updateTurnEnd();
            break;
        case "battleEnd":
            this.updateBattleEnd();
            break;
    }
};

BattleManager.updateEvent = function() {
    switch (this._phase) {
        case "start":
        case "turn":
        case "turnEnd":
            if (this.isActionForced()) {
                this.processForcedAction();
                return true;
            } else {
                return this.updateEventMain();
            }
    }
    return this.checkAbort();
};

BattleManager.updateEventMain = function() {
    $gameTroop.updateInterpreter();
    $gameParty.requestMotionRefresh();
    if ($gameTroop.isEventRunning() || this.checkBattleEnd()) {
        return true;
    }
    $gameTroop.setupBattleEvent();
    if ($gameTroop.isEventRunning() || SceneManager.isSceneChanging()) {
        return true;
    }
    return false;
};

BattleManager.isBusy = function() {
    return (
        $gameMessage.isBusy() ||
        this._spriteset.isBusy() ||
        this._logWindow.isBusy()
    );
};

BattleManager.updateTpbInput = function() {
    if (this._inputting) {
        this.checkTpbInputClose();
    } else {
        this.checkTpbInputOpen();
    }
};

BattleManager.checkTpbInputClose = function() {
    if (!this.isPartyTpbInputtable() || this.needsActorInputCancel()) {
        this.cancelActorInput();
        this._currentActor = null;
        this._inputting = false;
    }
};

BattleManager.checkTpbInputOpen = function() {
    if (this.isPartyTpbInputtable()) {
        if (this._tpbNeedsPartyCommand) {
            this._inputting = true;
            this._tpbNeedsPartyCommand = false;
        } else {
            this.selectNextCommand();
        }
    }
};

BattleManager.isPartyTpbInputtable = function() {
    return $gameParty.canInput() && this.isTpbMainPhase();
};

BattleManager.needsActorInputCancel = function() {
    return this._currentActor && !this._currentActor.canInput();
};

BattleManager.isTpbMainPhase = function() {
    return ["turn", "turnEnd", "action"].includes(this._phase);
};

BattleManager.isInputting = function() {
    return this._inputting;
};

BattleManager.isInTurn = function() {
    return this._phase === "turn";
};

BattleManager.isTurnEnd = function() {
    return this._phase === "turnEnd";
};

BattleManager.isAborting = function() {
    return this._phase === "aborting";
};

BattleManager.isBattleEnd = function() {
    return this._phase === "battleEnd";
};

BattleManager.canEscape = function() {
    return this._canEscape;
};

BattleManager.canLose = function() {
    return this._canLose;
};

BattleManager.isEscaped = function() {
    return this._escaped;
};

BattleManager.actor = function() {
    return this._currentActor;
};

BattleManager.startBattle = function() {
    this._phase = "start";
    $gameSystem.onBattleStart();
    $gameParty.onBattleStart(this._preemptive);
    $gameTroop.onBattleStart(this._surprise);
    this.displayStartMessages();
    ReactorEvents.emit("battleStart", { preemptive: this._preemptive, surprise: this._surprise });
};

BattleManager.displayStartMessages = function() {
    for (const name of $gameTroop.enemyNames()) {
        $gameMessage.add(TextManager.emerge.format(name));
    }
    if (this._preemptive) {
        $gameMessage.add(TextManager.preemptive.format($gameParty.name()));
    } else if (this._surprise) {
        $gameMessage.add(TextManager.surprise.format($gameParty.name()));
    }
};

BattleManager.startInput = function() {
    this._phase = "input";
    this._inputting = true;
    $gameParty.makeActions();
    $gameTroop.makeActions();
    this._currentActor = null;
    if (this._surprise || !$gameParty.canInput()) {
        this.startTurn();
    }
};

BattleManager.inputtingAction = function() {
    return this._currentActor ? this._currentActor.inputtingAction() : null;
};

BattleManager.selectNextCommand = function() {
    if (this._currentActor) {
        if (this._currentActor.selectNextCommand()) {
            return;
        }
        this.finishActorInput();
    }
    this.selectNextActor();
};

BattleManager.selectNextActor = function() {
    this.changeCurrentActor(true);
    if (!this._currentActor) {
        if (this.isTpb()) {
            this.changeCurrentActor(true);
        } else {
            this.startTurn();
        }
    }
};

BattleManager.selectPreviousCommand = function() {
    if (this._currentActor) {
        if (this._currentActor.selectPreviousCommand()) {
            return;
        }
        this.cancelActorInput();
    }
    this.selectPreviousActor();
};

BattleManager.selectPreviousActor = function() {
    if (this.isTpb()) {
        this.changeCurrentActor(true);
        if (!this._currentActor) {
            this._inputting = $gameParty.canInput();
        }
    } else {
        this.changeCurrentActor(false);
    }
};

BattleManager.changeCurrentActor = function(forward) {
    const members = $gameParty.battleMembers();
    let actor = this._currentActor;
    for (;;) {
        const currentIndex = members.indexOf(actor);
        actor = members[currentIndex + (forward ? 1 : -1)];
        if (!actor || actor.canInput()) {
            break;
        }
    }
    this._currentActor = actor ? actor : null;
    this.startActorInput();
};

BattleManager.startActorInput = function() {
    if (this._currentActor) {
        this._currentActor.setActionState("inputting");
        this._inputting = true;
    }
};

BattleManager.finishActorInput = function() {
    if (this._currentActor) {
        if (this.isTpb()) {
            this._currentActor.startTpbCasting();
        }
        this._currentActor.setActionState("waiting");
    }
};

BattleManager.cancelActorInput = function() {
    if (this._currentActor) {
        this._currentActor.setActionState("undecided");
    }
};

BattleManager.updateStart = function() {
    if (this.isTpb()) {
        this._phase = "turn";
    } else {
        this.startInput();
    }
};

BattleManager.startTurn = function() {
    this._phase = "turn";
    $gameTroop.increaseTurn();
    $gameParty.requestMotionRefresh();
    if (!this.isTpb()) {
        this.makeActionOrders();
        this._logWindow.startTurn();
        this._inputting = false;
    }
    ReactorEvents.emit("turnStart", { turn: $gameTroop.turnCount() });
};

BattleManager.updateTurn = function(timeActive) {
    $gameParty.requestMotionRefresh();
    if (this.isTpb() && timeActive) {
        this.updateTpb();
    }
    if (!this._subject) {
        this._subject = this.getNextSubject();
    }
    if (this._subject) {
        this.processTurn();
    } else if (!this.isTpb()) {
        this.endTurn();
    }
};

BattleManager.updateTpb = function() {
    $gameParty.updateTpb();
    $gameTroop.updateTpb();
    this.updateAllTpbBattlers();
    this.checkTpbTurnEnd();
};

BattleManager.updateAllTpbBattlers = function() {
    for (const battler of this.allBattleMembers()) {
        this.updateTpbBattler(battler);
    }
};

BattleManager.updateTpbBattler = function(battler) {
    if (battler.isTpbTurnEnd()) {
        battler.onTurnEnd();
        battler.startTpbTurn();
        this.displayBattlerStatus(battler, false);
    } else if (battler.isTpbReady()) {
        battler.startTpbAction();
        this._actionBattlers.push(battler);
    } else if (battler.isTpbTimeout()) {
        battler.onTpbTimeout();
        this.displayBattlerStatus(battler, true);
    }
};

BattleManager.checkTpbTurnEnd = function() {
    if ($gameTroop.isTpbTurnEnd()) {
        this.endTurn();
    }
};

BattleManager.processTurn = function() {
    const subject = this._subject;
    const action = subject.currentAction();
    if (action) {
        action.prepare();
        if (action.isValid()) {
            this.startAction();
        }
        subject.removeCurrentAction();
    } else {
        this.endAction();
        this._subject = null;
    }
};

BattleManager.endBattlerActions = function(battler) {
    battler.setActionState(this.isTpb() ? "undecided" : "done");
    battler.onAllActionsEnd();
    battler.clearTpbChargeTime();
    this.displayBattlerStatus(battler, true);
};

BattleManager.endTurn = function() {
    this._phase = "turnEnd";
    this._preemptive = false;
    this._surprise = false;
    ReactorEvents.emit("turnEnd", { turn: $gameTroop.turnCount() });
};

BattleManager.updateTurnEnd = function() {
    if (this.isTpb()) {
        this.startTurn();
    } else {
        this.endAllBattlersTurn();
        this._phase = "start";
    }
};

BattleManager.endAllBattlersTurn = function() {
    for (const battler of this.allBattleMembers()) {
        battler.onTurnEnd();
        this.displayBattlerStatus(battler, false);
    }
};

BattleManager.displayBattlerStatus = function(battler, current) {
    this._logWindow.displayAutoAffectedStatus(battler);
    if (current) {
        this._logWindow.displayCurrentState(battler);
    }
    this._logWindow.displayRegeneration(battler);
};

BattleManager.getNextSubject = function() {
    for (;;) {
        const battler = this._actionBattlers.shift();
        if (!battler) {
            return null;
        }
        if (battler.isBattleMember() && battler.isAlive()) {
            return battler;
        }
    }
};

BattleManager.allBattleMembers = function() {
    return $gameParty.battleMembers().concat($gameTroop.members());
};

BattleManager.makeActionOrders = function() {
    const battlers = [];
    if (!this._surprise) {
        battlers.push(...$gameParty.battleMembers());
    }
    if (!this._preemptive) {
        battlers.push(...$gameTroop.members());
    }
    for (const battler of battlers) {
        battler.makeSpeed();
    }
    battlers.sort((a, b) => b.speed() - a.speed());
    this._actionBattlers = battlers;
};

BattleManager.startAction = function() {
    const subject = this._subject;
    const action = subject.currentAction();
    const targets = action.takePlannedTargets() || action.makeTargets();
    this._phase = "action";
    this._action = action;
    this._targets = targets;
    subject.cancelMotionRefresh();
    subject.useItem(action.item());
    this._action.applyGlobal();
    this._logWindow.startAction(subject, action, targets);
    ReactorEvents.emit("actionStart", { subject, action, targets: targets.slice() });
};

BattleManager.updateAction = function() {
    const target = this._targets.shift();
    if (target) {
        this.invokeAction(this._subject, target);
    } else {
        this.endAction();
    }
};

BattleManager.endAction = function() {
    ReactorEvents.emit("actionEnd", { subject: this._subject });
    this._logWindow.endAction(this._subject);
    this._phase = "turn";
    if (this._subject.numActions() === 0) {
        this.endBattlerActions(this._subject);
        this._subject = null;
    }
};

BattleManager.invokeAction = function(subject, target) {
    this._logWindow.push("pushBaseLine");
    if (Math.random() < this._action.itemCnt(target)) {
        this.invokeCounterAttack(subject, target);
    } else if (Math.random() < this._action.itemMrf(target)) {
        this.invokeMagicReflection(subject, target);
    } else {
        this.invokeNormalAction(subject, target);
    }
    subject.setLastTarget(target);
    this._logWindow.push("popBaseLine");
};

BattleManager.invokeNormalAction = function(subject, target) {
    const realTarget = this.applySubstitute(target);
    this._action.apply(realTarget);
    // Only this path names the item for the skill outcome lines. A counterattack
    // applies a Game_Action of its own and a reflection reverses subject and
    // target, so neither should print the original skill's Message 3 or 4 - and
    // both reach displayActionResults too. See displaySkillOutcome.
    this._logWindow.setOutcomeItem(this._action.item());
    this._logWindow.displayActionResults(subject, realTarget);
    this._logWindow.setOutcomeItem(null);
};

BattleManager.invokeCounterAttack = function(subject, target) {
    const action = new Game_Action(target);
    action.setAttack();
    action.apply(subject);
    this._logWindow.displayCounter(target);
    this._logWindow.displayActionResults(target, subject);
};

BattleManager.invokeMagicReflection = function(subject, target) {
    this._action._reflectionTarget = target;
    this._logWindow.displayReflection(target);
    this._action.apply(subject);
    this._logWindow.displayActionResults(target, subject);
};

BattleManager.applySubstitute = function(target) {
    if (this.checkSubstitute(target)) {
        const substitute = target.friendsUnit().substituteBattler();
        if (substitute && target !== substitute) {
            this._logWindow.displaySubstitute(substitute, target);
            return substitute;
        }
    }
    return target;
};

BattleManager.checkSubstitute = function(target) {
    return target.isDying() && !this._action.isCertainHit();
};

BattleManager.isActionForced = function() {
    return !!this._actionForcedBattler;
};

BattleManager.forceAction = function(battler) {
    if (battler.numActions() > 0) {
        this._actionForcedBattler = battler;
        this._actionBattlers.remove(battler);
    }
};

BattleManager.processForcedAction = function() {
    if (this._actionForcedBattler) {
        if (this._subject) {
            this.endBattlerActions(this._subject);
        }
        this._subject = this._actionForcedBattler;
        this._actionForcedBattler = null;
        this.startAction();
        this._subject.removeCurrentAction();
    }
};

BattleManager.abort = function() {
    this._phase = "aborting";
};

BattleManager.checkBattleEnd = function() {
    if (this._phase) {
        if ($gameParty.isEscaped()) {
            this.processPartyEscape();
            return true;
        } else if ($gameParty.isAllDead()) {
            this.processDefeat();
            return true;
        } else if ($gameTroop.isAllDead()) {
            this.processVictory();
            return true;
        }
    }
    return false;
};

BattleManager.checkAbort = function() {
    if (this.isAborting()) {
        this.processAbort();
        return true;
    }
    return false;
};

BattleManager.processVictory = function() {
    $gameParty.removeBattleStates();
    $gameParty.performVictory();
    this.playVictoryMe();
    this.replayBgmAndBgs();
    this.makeRewards();
    this.displayVictoryMessage();
    this.displayRewards();
    this.gainRewards();
    this.endBattle(0);
};

BattleManager.processEscape = function() {
    $gameParty.performEscape();
    SoundManager.playEscape();
    const success = this._preemptive || Math.random() < this._escapeRatio;
    if (success) {
        this.onEscapeSuccess();
    } else {
        this.onEscapeFailure();
    }
    return success;
};

BattleManager.onEscapeSuccess = function() {
    this.displayEscapeSuccessMessage();
    this._escaped = true;
    this.processAbort();
};

BattleManager.onEscapeFailure = function() {
    $gameParty.onEscapeFailure();
    this.displayEscapeFailureMessage();
    this._escapeRatio += 0.1;
    if (!this.isTpb()) {
        this.startTurn();
    }
};

BattleManager.processPartyEscape = function() {
    this._escaped = true;
    this.processAbort();
};

BattleManager.processAbort = function() {
    $gameParty.removeBattleStates();
    this._logWindow.clear();
    this.replayBgmAndBgs();
    this.endBattle(1);
};

BattleManager.processDefeat = function() {
    this.displayDefeatMessage();
    this.playDefeatMe();
    if (this._canLose) {
        this.replayBgmAndBgs();
    } else {
        AudioManager.stopBgm();
    }
    this.endBattle(2);
};

BattleManager.endBattle = function(result) {
    this._phase = "battleEnd";
    this.cancelActorInput();
    this._inputting = false;
    if (this._eventCallback) {
        this._eventCallback(result);
    }
    if (result === 0) {
        $gameSystem.onBattleWin();
    } else if (this._escaped) {
        $gameSystem.onBattleEscape();
    }
    $gameTemp.clearCommonEventReservation();
    ReactorEvents.emit("battleEnd", { result, escaped: !!this._escaped });
};

BattleManager.updateBattleEnd = function() {
    if (this.isBattleTest()) {
        AudioManager.stopBgm();
        SceneManager.exit();
    } else if (!this._escaped && $gameParty.isAllDead()) {
        if (this._canLose) {
            $gameParty.reviveBattleMembers();
            SceneManager.pop();
        } else {
            SceneManager.goto(Scene_Gameover);
        }
    } else {
        SceneManager.pop();
    }
    this._phase = "";
};

BattleManager.makeRewards = function() {
    this._rewards = {
        gold: $gameTroop.goldTotal(),
        exp: $gameTroop.expTotal(),
        items: $gameTroop.makeDropItems()
    };
};

BattleManager.displayVictoryMessage = function() {
    $gameMessage.add(TextManager.victory.format($gameParty.name()));
};

BattleManager.displayDefeatMessage = function() {
    $gameMessage.add(TextManager.defeat.format($gameParty.name()));
};

BattleManager.displayEscapeSuccessMessage = function() {
    $gameMessage.add(TextManager.escapeStart.format($gameParty.name()));
};

BattleManager.displayEscapeFailureMessage = function() {
    $gameMessage.add(TextManager.escapeStart.format($gameParty.name()));
    $gameMessage.add("\\." + TextManager.escapeFailure);
};

BattleManager.displayRewards = function() {
    this.displayExp();
    this.displayGold();
    this.displayDropItems();
};

BattleManager.displayExp = function() {
    const exp = this._rewards.exp;
    if (exp > 0) {
        const text = TextManager.obtainExp.format(exp, TextManager.exp);
        $gameMessage.add("\\." + text);
    }
};

BattleManager.displayGold = function() {
    const gold = this._rewards.gold;
    if (gold > 0) {
        $gameMessage.add("\\." + TextManager.obtainGold.format(gold));
    }
};

BattleManager.displayDropItems = function() {
    const items = this._rewards.items;
    if (items.length > 0) {
        $gameMessage.newPage();
        for (const item of items) {
            $gameMessage.add(TextManager.obtainItem.format(item.name));
        }
    }
};

BattleManager.gainRewards = function() {
    this.gainExp();
    this.gainGold();
    this.gainDropItems();
};

BattleManager.gainExp = function() {
    const exp = this._rewards.exp;
    for (const actor of $gameParty.allMembers()) {
        actor.gainExp(exp);
    }
};

BattleManager.gainGold = function() {
    $gameParty.gainGold(this._rewards.gold);
};

BattleManager.gainDropItems = function() {
    const items = this._rewards.items;
    for (const item of items) {
        $gameParty.gainItem(item, 1);
    }
};

//-----------------------------------------------------------------------------
// PluginManager
//
// The static class that manages the plugins.

function PluginManager() {
    throw new Error("This is a static class");
}

PluginManager._scripts = [];
PluginManager._errorUrls = [];
PluginManager._parameters = {};
PluginManager._commands = {};

PluginManager.setup = function(plugins) {
    for (const plugin of plugins) {
        const pluginName = Utils.extractFileName(plugin.name);
        if (plugin.status && !this._scripts.includes(pluginName)) {
            this.setParameters(pluginName, plugin.parameters);
            this.loadScript(plugin.name);
            this._scripts.push(pluginName);
        }
    }
};

PluginManager.parameters = function(name) {
    return this._parameters[name.toLowerCase()] || {};
};

PluginManager.setParameters = function(name, parameters) {
    this._parameters[name.toLowerCase()] = parameters;
};

PluginManager.loadScript = function(filename) {
    const url = this.makeUrl(filename);
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = url;
    script.async = false;
    script.defer = true;
    script.onerror = this.onError.bind(this);
    script._url = url;
    document.body.appendChild(script);
};

PluginManager.onError = function(e) {
    this._errorUrls.push(e.target._url);
};

PluginManager.makeUrl = function(filename) {
    return "js/plugins/" + Utils.encodeURI(filename) + ".js";
};

PluginManager.checkErrors = function() {
    const url = this._errorUrls.shift();
    if (url) {
        this.throwLoadError(url);
    }
};

PluginManager.throwLoadError = function(url) {
    throw new Error("Failed to load: " + url);
};

PluginManager.registerCommand = function(pluginName, commandName, func) {
    const key = pluginName + ":" + commandName;
    this._commands[key] = func;
};

PluginManager.callCommand = function(self, pluginName, commandName, args) {
    const key = pluginName + ":" + commandName;
    const func = this._commands[key];
    if (typeof func === "function") {
        func.bind(self)(args);
    }
};

//-----------------------------------------------------------------------------
