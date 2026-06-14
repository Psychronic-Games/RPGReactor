//=============================================================================
// reactor_managers.js
// RPG Reactor Game Engine - Managers Module
//=============================================================================

//-----------------------------------------------------------------------------
// DataManager
// The static class that manages the database and game objects

class DataManager {
    constructor() {
        throw new Error("This is a static class");
    }

    static _globalInfo = null;
    static _databaseFiles = [
        { name: "$dataSystem", src: "System.json" },
        { name: "$dataActors", src: "Actors.json" },
        { name: "$dataClasses", src: "Classes.json" },
        { name: "$dataMapInfos", src: "MapInfos.json" },
        { name: "$dataTilesets", src: "Tilesets.json" }
    ];

    static initialize() {
        this._globalInfo = null;
        this._errors = [];
    }

    static async loadDatabase() {
        const promises = [];

        for (const databaseFile of this._databaseFiles) {
            promises.push(this.loadDataFile(databaseFile.name, databaseFile.src));
        }

        try {
            await Promise.all(promises);
            this.onLoad();
        } catch (error) {
            console.error('Failed to load database:', error);
            throw error;
        }
    }

    static async loadDataFile(name, src) {
        const filePath = "data/" + src;

        // Try to use Node.js fs module first (for NW.js)
        let useNodeFS = false;
        try {
            if (typeof require === 'function') {
                // Test if we can actually use require
                const testRequire = require;
                useNodeFS = true;
            }
        } catch (e) {
            // require not available, will use fetch
        }

        try {
            if (useNodeFS) {
                const fs = require('fs');
                const path = require('path');

                // Get absolute path - use __dirname if available (set by playtest window),
                // otherwise fall back to process.cwd()
                const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
                const absolutePath = path.join(baseDir, filePath);

                // Read file synchronously
                const fileContent = fs.readFileSync(absolutePath, 'utf8');
                const data = JSON.parse(fileContent);

                window[name] = data;
                console.log(`✓ Loaded ${name} from ${src}`);
            } else {
                // Fallback to fetch for non-NW.js environments
                const response = await fetch(filePath);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                window[name] = data;
                console.log(`✓ Loaded ${name} from ${src}`);
            }
        } catch (error) {
            console.error(`✗ Failed to load ${filePath}:`, error);
            console.error(`Error stack:`, error.stack);
            if (!this._errors) {
                this._errors = [];
            }
            this._errors.push({ name, src, error });
            throw error;
        }
    }

    static onLoad() {
        if (!this._errors) {
            this._errors = [];
        }
        if (this._errors.length > 0) {
            console.error('Database loading completed with errors:', this._errors);
        }
        this.checkData();
    }

    static checkData() {
        if (!window.$dataSystem) {
            throw new Error("$dataSystem is not loaded");
        }
    }

    static async loadMapData(mapId) {
        const filename = "Map%1.json".format(mapId.padZero(3));
        return this.loadDataFile("$dataMap", filename);
    }

    static createGameObjects() {
        // Initialize global game objects
        window.$gameTemp = new Game_Temp();
        window.$gameSystem = new Game_System();
        window.$gameScreen = new Game_Screen();
        window.$gameTimer = new Game_Timer();
        window.$gameMessage = new Game_Message();
        window.$gameSwitches = new Game_Switches();
        window.$gameVariables = new Game_Variables();
        window.$gameSelfSwitches = new Game_SelfSwitches();
        window.$gameActors = new Game_Actors();
        window.$gameParty = new Game_Party();
        window.$gameMap = new Game_Map();
        window.$gamePlayer = new Game_Player();
    }

    static setupNewGame() {
        this.createGameObjects();
        $gameParty.setupStartingMembers();
        $gamePlayer.setupForNewGame();
    }

    static setupBattleTest() {
        // Placeholder
    }

    static setupEventTest() {
        // Placeholder
    }

    static isMapLoaded() {
        return !!window.$dataMap;
    }

    static isBattleTest() {
        return false;
    }

    static isEventTest() {
        return false;
    }
}

//-----------------------------------------------------------------------------
// SceneManager
// The static class that manages scene transitions

class SceneManager {
    constructor() {
        throw new Error("This is a static class");
    }

    static _scene = null;
    static _nextScene = null;
    static _stack = [];
    static _exiting = false;
    static _previousScene = null;
    static _previousClass = null;
    static _backgroundBitmap = null;
    static _smoothCount = 0;
    static _sceneChanging = false;

    static initialize() {
        this._scene = null;
        this._nextScene = null;
        this._stack = [];
        this._exiting = false;
        this._sceneChanging = false;
    }

    static async run(sceneClass) {
        try {
            this.initialize();
            await this.goto(sceneClass);
            // Graphics.startTickHandler() is already called in Graphics.setup()
        } catch (e) {
            this.catchException(e);
        }
    }

    static async goto(sceneClass) {
        if (sceneClass) {
            this._nextScene = new sceneClass();
            if (this._scene) {
                this._scene.stop();
            }
        }
    }

    static push(sceneClass) {
        this._stack.push(this._scene.constructor);
        this.goto(sceneClass);
    }

    static pop() {
        if (this._stack.length > 0) {
            const previousSceneClass = this._stack.pop();
            this.goto(previousSceneClass);
        } else {
            this.exit();
        }
    }

    static clearStack() {
        this._stack = [];
    }

    static exit() {
        this._exiting = true;
        if (Utils.isNwjs()) {
            nw.App.quit();
        }
    }

    static update(deltaTime) {
        this.updateFrameCount();
        // changeScene is async but handles its own state to prevent concurrent execution
        this.changeScene();
        if (this._scene) {
            this._scene.update();
        }
    }

    static updateFrameCount() {
        Graphics.frameCount++;
    }

    static snapForBackground() {
        if (this._scene) {
            // Capture the current scene as a texture for background
            this._backgroundTexture = Graphics.app.renderer.generateTexture(Graphics.app.stage);
        }
    }

    static backgroundTexture() {
        return this._backgroundTexture;
    }

    static async changeScene() {
        // Prevent concurrent scene changes
        if (this._sceneChanging) {
            return;
        }

        if (this.isSceneChanging() && !this.isCurrentSceneBusy()) {
            this._sceneChanging = true;
            try {
                if (this._scene) {
                    this._previousScene = this._scene;
                    this._previousClass = this._scene.constructor;
                    this._scene.terminate();
                    this._scene = null;
                }
                if (this._nextScene) {
                    this._scene = this._nextScene;
                    this._nextScene = null;
                    // Wait for async create() to complete
                    await this._scene.create();
                    // Only start if isReady() returns true
                    if (this._scene.isReady()) {
                        this._scene.start();
                    }
                    this._previousScene = null;
                }
                if (this._exiting) {
                    this.terminate();
                }
            } finally {
                this._sceneChanging = false;
            }
        }
    }

    static isSceneChanging() {
        return this._nextScene !== null || this._exiting;
    }

    static isCurrentSceneBusy() {
        return this._scene && this._scene.isBusy();
    }

    static isCurrentSceneStarted() {
        return this._scene && this._scene.isStarted();
    }

    static isNextScene(sceneClass) {
        return this._nextScene && this._nextScene.constructor === sceneClass;
    }

    static isPreviousScene(sceneClass) {
        return this._previousClass === sceneClass;
    }

    static catchException(e) {
        if (e instanceof Error) {
            Graphics.printError(e.name, e.message);
            console.error(e.stack);
        } else {
            Graphics.printError("UnknownError", String(e));
        }
        this.stop();
    }

    static stop() {
        Graphics.stop();
    }

    static terminate() {
        window.close();
    }

    static onError(event) {
        console.error(event.message);
        console.error(event.filename, event.lineno);
        this.stop();
    }

    static onKeyDown(event) {
        if (!event.ctrlKey && !event.altKey) {
            switch (event.keyCode) {
                case 116: // F5
                    if (Utils.isNwjs()) {
                        location.reload();
                    }
                    break;
                case 119: // F8
                    if (Utils.isNwjs()) {
                        nw.Window.get().showDevTools();
                    }
                    break;
            }
        }
    }

    static requestUpdate() {
        if (this._scene) {
            this._scene.requestUpdate();
        }
    }
}

//-----------------------------------------------------------------------------
// ConfigManager
// The static class that manages configuration data
//-----------------------------------------------------------------------------

class ConfigManager {
    constructor() {
        throw new Error("This is a static class");
    }

    static alwaysDash = false;
    static commandRemember = false;
    static touchUI = true;
    static bgmVolume = 100;
    static bgsVolume = 100;
    static meVolume = 100;
    static seVolume = 100;

    static load() {
        // Load from localStorage if available
        try {
            const config = localStorage.getItem("config");
            if (config) {
                const data = JSON.parse(config);
                this.applyData(data);
            }
        } catch (e) {
            console.warn("Failed to load config:", e);
        }
    }

    static save() {
        // Save to localStorage if available
        try {
            const data = this.makeData();
            localStorage.setItem("config", JSON.stringify(data));
        } catch (e) {
            console.warn("Failed to save config:", e);
        }
    }

    static makeData() {
        return {
            alwaysDash: this.alwaysDash,
            commandRemember: this.commandRemember,
            touchUI: this.touchUI,
            bgmVolume: this.bgmVolume,
            bgsVolume: this.bgsVolume,
            meVolume: this.meVolume,
            seVolume: this.seVolume
        };
    }

    static applyData(config) {
        this.alwaysDash = config.alwaysDash || false;
        this.commandRemember = config.commandRemember || false;
        this.touchUI = config.touchUI !== false;
        this.bgmVolume = config.bgmVolume !== undefined ? config.bgmVolume : 100;
        this.bgsVolume = config.bgsVolume !== undefined ? config.bgsVolume : 100;
        this.meVolume = config.meVolume !== undefined ? config.meVolume : 100;
        this.seVolume = config.seVolume !== undefined ? config.seVolume : 100;
    }
}

//-----------------------------------------------------------------------------
// ImageManager
// The static class that loads images

class ImageManager {
    constructor() {
        throw new Error("This is a static class");
    }

    static _cache = new Map();
    static _system = null;

    static faceWidth = 144;
    static faceHeight = 144;

    static async loadSystem(filename) {
        return this.loadBitmap("img/system/", filename);
    }

    static async loadTitle1(filename) {
        return this.loadBitmap("img/titles1/", filename);
    }

    static async loadTitle2(filename) {
        return this.loadBitmap("img/titles2/", filename);
    }

    static async loadFace(filename) {
        return this.loadBitmap("img/faces/", filename);
    }

    static async loadCharacter(filename) {
        return this.loadBitmap("img/characters/", filename);
    }

    static async loadPicture(filename) {
        return this.loadBitmap("img/pictures/", filename);
    }

    static async loadAnimation(filename) {
        return this.loadBitmap("img/animations/", filename);
    }

    static async loadBitmap(folder, filename) {
        if (!filename) {
            return await this.loadEmptyBitmap();
        }

        // Build file path
        let filePath = folder + filename + ".png";
        let cacheKey = filePath;

        // Check if texture is already cached
        if (this._cache.has(cacheKey)) {
            const texture = this._cache.get(cacheKey);
            // Return a NEW sprite with the cached texture
            // This is important because sprites can only be in one container at a time
            return new PIXI.Sprite(texture);
        }

        try {
            // Use Node.js fs to load the image if available (for NW.js)
            if (typeof require === 'function') {
                const fs = require('fs');
                const path = require('path');

                // Use __dirname if available (set by playtest window), otherwise fall back to process.cwd()
                const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
                const absolutePath = path.join(baseDir, filePath);

                // Read the file as a buffer
                const buffer = fs.readFileSync(absolutePath);

                // Convert to base64 data URL
                const base64 = buffer.toString('base64');
                const dataUrl = `data:image/png;base64,${base64}`;

                // Load into PIXI using the data URL
                const texture = await PIXI.Assets.load(dataUrl);
                // Cache the TEXTURE, not the sprite
                this._cache.set(cacheKey, texture);
                return new PIXI.Sprite(texture);
            } else {
                // Fallback to regular URL loading for non-NW.js environments
                const texture = await PIXI.Assets.load(filePath);
                // Cache the TEXTURE, not the sprite
                this._cache.set(cacheKey, texture);
                return new PIXI.Sprite(texture);
            }
        } catch (error) {
            console.error(`Failed to load image ${filePath}:`, error);
            return await this.loadEmptyBitmap();
        }
    }

    static async loadEmptyBitmap() {
        const graphics = new PIXI.Graphics();
        graphics.rect(0, 0, 1, 1);
        graphics.fill(0x000000);
        const texture = Graphics.app.renderer.generateTexture(graphics);
        return new PIXI.Sprite(texture);
    }

    static isBigCharacter(filename) {
        // Big characters start with $ in the filename
        return filename && filename.startsWith("$");
    }

    static isObjectCharacter(filename) {
        // Object characters start with ! in the filename
        return filename && filename.startsWith("!");
    }

    static isZeroParallax(filename) {
        // Zero parallax starts with ! in the filename
        return filename && filename.startsWith("!");
    }

    static clear() {
        this._cache.clear();
    }
}

//-----------------------------------------------------------------------------
// String extensions

String.prototype.format = function() {
    let args = arguments;
    return this.replace(/%([0-9]+)/g, function(s, n) {
        return args[Number(n) - 1];
    });
};

String.prototype.padZero = function(length) {
    return this.padStart(length, '0');
};

Number.prototype.padZero = function(length) {
    return String(this).padZero(length);
};

Number.prototype.mod = function(n) {
    return ((this % n) + n) % n;
};

Number.prototype.clamp = function(min, max) {
    return Math.min(Math.max(this, min), max);
};

//-----------------------------------------------------------------------------
// AudioManager
// The static class that handles BGM, BGS, ME and SE

class AudioManager {
    constructor() {
        throw new Error("This is a static class");
    }

    static _bgmVolume = 100;
    static _bgsVolume = 100;
    static _meVolume = 100;
    static _seVolume = 100;
    static _currentBgm = null;
    static _currentBgs = null;
    static _bgmBuffer = null;
    static _bgsBuffer = null;
    static _meBuffer = null;
    static _seBuffers = [];
    static _staticBuffers = [];
    static _replayFadeTime = 0.5;
    static _path = "audio/";

    static get bgmVolume() {
        return this._bgmVolume;
    }

    static set bgmVolume(value) {
        this._bgmVolume = value;
        this.updateBgmParameters(this._currentBgm);
    }

    static get bgsVolume() {
        return this._bgsVolume;
    }

    static set bgsVolume(value) {
        this._bgsVolume = value;
        this.updateBgsParameters(this._currentBgs);
    }

    static get meVolume() {
        return this._meVolume;
    }

    static set meVolume(value) {
        this._meVolume = value;
        this.updateMeParameters(this._currentMe);
    }

    static get seVolume() {
        return this._seVolume;
    }

    static set seVolume(value) {
        this._seVolume = value;
    }

    static playBgm(bgm, pos) {
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
    }

    static replayBgm(bgm) {
        if (this.isCurrentBgm(bgm)) {
            this.updateBgmParameters(bgm);
        } else {
            this.playBgm(bgm, bgm.pos);
            if (this._bgmBuffer) {
                this._bgmBuffer.fadeIn(this._replayFadeTime);
            }
        }
    }

    static isCurrentBgm(bgm) {
        return (
            this._currentBgm &&
            this._bgmBuffer &&
            this._currentBgm.name === bgm.name
        );
    }

    static updateBgmParameters(bgm) {
        this.updateBufferParameters(this._bgmBuffer, this._bgmVolume, bgm);
    }

    static updateCurrentBgm(bgm, pos) {
        this._currentBgm = {
            name: bgm.name,
            volume: bgm.volume,
            pitch: bgm.pitch,
            pan: bgm.pan,
            pos: pos
        };
    }

    static stopBgm() {
        if (this._bgmBuffer) {
            this._bgmBuffer.destroy();
            this._bgmBuffer = null;
            this._currentBgm = null;
        }
    }

    static fadeOutBgm(duration) {
        if (this._bgmBuffer && this._currentBgm) {
            this._bgmBuffer.fadeOut(duration);
            this._currentBgm = null;
        }
    }

    static fadeInBgm(duration) {
        if (this._bgmBuffer && this._currentBgm) {
            this._bgmBuffer.fadeIn(duration);
        }
    }

    static playBgs(bgs, pos) {
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
    }

    static replayBgs(bgs) {
        if (this.isCurrentBgs(bgs)) {
            this.updateBgsParameters(bgs);
        } else {
            this.playBgs(bgs, bgs.pos);
            if (this._bgsBuffer) {
                this._bgsBuffer.fadeIn(this._replayFadeTime);
            }
        }
    }

    static isCurrentBgs(bgs) {
        return (
            this._currentBgs &&
            this._bgsBuffer &&
            this._currentBgs.name === bgs.name
        );
    }

    static updateBgsParameters(bgs) {
        this.updateBufferParameters(this._bgsBuffer, this._bgsVolume, bgs);
    }

    static updateCurrentBgs(bgs, pos) {
        this._currentBgs = {
            name: bgs.name,
            volume: bgs.volume,
            pitch: bgs.pitch,
            pan: bgs.pan,
            pos: pos
        };
    }

    static stopBgs() {
        if (this._bgsBuffer) {
            this._bgsBuffer.destroy();
            this._bgsBuffer = null;
            this._currentBgs = null;
        }
    }

    static fadeOutBgs(duration) {
        if (this._bgsBuffer && this._currentBgs) {
            this._bgsBuffer.fadeOut(duration);
            this._currentBgs = null;
        }
    }

    static fadeInBgs(duration) {
        if (this._bgsBuffer && this._currentBgs) {
            this._bgsBuffer.fadeIn(duration);
        }
    }

    static playMe(me) {
        this.stopMe();
        if (me.name) {
            if (this._bgmBuffer && this._currentBgm) {
                this._currentBgm.pos = this._bgmBuffer.seek();
                this._bgmBuffer.stop();
            }
            this._meBuffer = this.createBuffer("me/", me.name);
            this.updateMeParameters(me);
            this._meBuffer.play(false);
            this._meBuffer.addStopListener(this.stopMe.bind(this));
        }
    }

    static updateMeParameters(me) {
        this.updateBufferParameters(this._meBuffer, this._meVolume, me);
    }

    static fadeOutMe(duration) {
        if (this._meBuffer) {
            this._meBuffer.fadeOut(duration);
        }
    }

    static stopMe() {
        if (this._meBuffer) {
            this._meBuffer.destroy();
            this._meBuffer = null;
            if (
                this._bgmBuffer &&
                this._currentBgm &&
                !this._bgmBuffer.isPlaying()
            ) {
                this._bgmBuffer.play(true, this._currentBgm.pos);
                this._bgmBuffer.fadeIn(this._replayFadeTime);
            }
        }
    }

    static playSe(se) {
        if (se.name) {
            // Don't play the same sound in the same frame
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
    }

    static updateSeParameters(buffer, se) {
        this.updateBufferParameters(buffer, this._seVolume, se);
    }

    static cleanupSe() {
        for (const buffer of this._seBuffers) {
            if (!buffer.isPlaying()) {
                buffer.destroy();
            }
        }
        this._seBuffers = this._seBuffers.filter(buffer => buffer.isPlaying());
    }

    static stopSe() {
        for (const buffer of this._seBuffers) {
            buffer.destroy();
        }
        this._seBuffers = [];
    }

    static playStaticSe(se) {
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
    }

    static loadStaticSe(se) {
        if (se.name && !this.isStaticSe(se)) {
            const buffer = this.createBuffer("se/", se.name);
            this._staticBuffers.push(buffer);
        }
    }

    static isStaticSe(se) {
        for (const buffer of this._staticBuffers) {
            if (buffer.name === se.name) {
                return true;
            }
        }
        return false;
    }

    static stopAll() {
        this.stopMe();
        this.stopBgm();
        this.stopBgs();
        this.stopSe();
    }

    static saveBgm() {
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
    }

    static saveBgs() {
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
    }

    static makeEmptyAudioObject() {
        return { name: "", volume: 0, pitch: 0 };
    }

    static createBuffer(folder, name) {
        const ext = this.audioFileExt();
        const url = this._path + folder + encodeURIComponent(name) + ext;
        const buffer = new WebAudio(url);
        buffer.name = name;
        buffer.frameCount = Graphics.frameCount;
        return buffer;
    }

    static updateBufferParameters(buffer, configVolume, audio) {
        if (buffer && audio) {
            const newVolume = (configVolume * (audio.volume || 100)) / 10000;
            buffer.volume = newVolume;
            buffer.pitch = (audio.pitch || 100) / 100;
            buffer.pan = (audio.pan || 0) / 100;
        }
    }

    static audioFileExt() {
        return ".ogg";
    }

    static checkErrors() {
        const buffers = [this._bgmBuffer, this._bgsBuffer, this._meBuffer];
        buffers.push(...this._seBuffers);
        buffers.push(...this._staticBuffers);
        for (const buffer of buffers) {
            if (buffer && buffer.isError()) {
                this.throwLoadError(buffer);
            }
        }
    }

    static throwLoadError(webAudio) {
        const retry = webAudio.retry.bind(webAudio);
        throw ["LoadError", webAudio.url, retry];
    }
}

//-----------------------------------------------------------------------------
// StorageManager
//
// The static class that manages storage of save files and config data.

class StorageManager {
    static saveConfig(config) {
        if (typeof nw !== 'undefined') {
            // NW.js mode - use Node.js fs
            const fs = require('fs');
            const path = require('path');
            const basePath = path.dirname(process.mainModule.filename);
            const savePath = path.join(basePath, 'save');

            // Create save directory if it doesn't exist
            if (!fs.existsSync(savePath)) {
                fs.mkdirSync(savePath, { recursive: true });
            }

            const filePath = path.join(savePath, 'config.rpgsave');
            fs.writeFileSync(filePath, JSON.stringify(config), 'utf8');
        } else {
            // Browser mode - use localStorage
            localStorage.setItem('RPGReactor_Config', JSON.stringify(config));
        }
    }

    static loadConfig() {
        try {
            if (typeof nw !== 'undefined') {
                // NW.js mode - use Node.js fs
                const fs = require('fs');
                const path = require('path');
                const basePath = path.dirname(process.mainModule.filename);
                const filePath = path.join(basePath, 'save', 'config.rpgsave');

                if (fs.existsSync(filePath)) {
                    const data = fs.readFileSync(filePath, 'utf8');
                    return JSON.parse(data);
                }
            } else {
                // Browser mode - use localStorage
                const data = localStorage.getItem('RPGReactor_Config');
                if (data) {
                    return JSON.parse(data);
                }
            }
        } catch (e) {
            console.error('Failed to load config:', e);
        }
        return {};
    }
}

console.log('reactor_managers.js loaded');
