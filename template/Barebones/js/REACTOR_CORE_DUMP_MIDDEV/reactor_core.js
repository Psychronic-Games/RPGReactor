//=============================================================================
// reactor_core.js
// RPG Reactor Game Engine - Core Module (PIXI.js 8)
//=============================================================================

//-----------------------------------------------------------------------------
// Number Extensions
//-----------------------------------------------------------------------------

Number.prototype.clamp = function(min, max) {
    return Math.min(Math.max(this, min), max);
};

//-----------------------------------------------------------------------------
// Graphics
// The static class that handles the graphics system using PIXI.js 8

class Graphics {
    constructor() {
        throw new Error("This is a static class");
    }

    static initialize() {
        this._app = null;
        this._effekseer = null;
        // Default to 1280x720, but will be overridden from system.json if available
        this._width = 1280;
        this._height = 720;
        this._defaultScale = 1;
        this._realScale = 1;
        this._errorPrinter = null;
        this._tickHandler = null;
        this._canvas = null;
        this._fpsCounter = null;
        this._loadingSpinner = null;
        this._stretchEnabled = this._defaultStretchMode();
        this.frameCount = 0;
    }

    static _defaultStretchMode() {
        // Enable stretching for NW.js (playtest mode) and mobile devices
        return Utils.isNwjs() || Utils.isMobileDevice();
    }

    static get width() {
        return this._width;
    }

    static get height() {
        return this._height;
    }

    static get app() {
        return this._app;
    }

    static get canvas() {
        return this._canvas;
    }

    static get effekseer() {
        return this._effekseer;
    }

    static async setup() {
        this.initialize();

        // Load System.json early to get correct resolution
        await this.loadSystemSettings();

        await this.createPixiApp();
        this.createEffekseerContext();
        this.createErrorPrinter();
        this.createFPSCounter();
        this.updateRealScale();
        this.setupEventHandlers();
        Input.initialize();
        this.startTickHandler();
    }

    static async loadSystemSettings() {
        // Early load of System.json to get screen dimensions
        try {
            if (typeof require === 'function') {
                const fs = require('fs');
                const path = require('path');
                // Use current working directory, not main module path
                const baseDir = process.cwd();
                const systemPath = path.join(baseDir, 'data/System.json');

                console.log('Looking for System.json at:', systemPath);
                const data = fs.readFileSync(systemPath, 'utf8');
                const system = JSON.parse(data);

                if (system.advanced) {
                    if (system.advanced.screenWidth) {
                        this._width = system.advanced.screenWidth;
                    }
                    if (system.advanced.screenHeight) {
                        this._height = system.advanced.screenHeight;
                    }
                    console.log('✓ Loaded resolution from System.json:', this._width, 'x', this._height);
                }
            }
        } catch (e) {
            console.log('Could not pre-load System.json (will load via DataManager later)');
            // Use default dimensions - will be corrected when DataManager loads System.json
        }
    }

    static async createPixiApp() {
        try {
            // Create PIXI Application with v8 API
            this._app = new PIXI.Application();

            await this._app.init({
                width: this._width,
                height: this._height,
                backgroundColor: 0x000000,
                antialias: false,
                autoDensity: true,
                resolution: window.devicePixelRatio || 1,
                preference: 'webgl' // Force WebGL instead of WebGPU
            });

            this._canvas = this._app.canvas;
            this._canvas.id = "gameCanvas";
            document.body.appendChild(this._canvas);
            this._updateCanvas();

            console.log('PIXI Application initialized (v8)');
            console.log('Canvas size:', this._width, 'x', this._height);
        } catch (e) {
            this.printError("PIXI.js Error", e.message);
        }
    }

    static createEffekseerContext() {
        if (this._app && window.effekseer) {
            try {
                this._effekseer = effekseer.createContext();
                if (this._effekseer) {
                    // PIXI8 compatibility: Access WebGL context through renderer
                    const gl = this._app.renderer.gl ||
                               (this._app.renderer.context && this._app.renderer.context.gl);

                    if (gl) {
                        this._effekseer.init(gl);
                        this._effekseer.setRestorationOfStatesFlag(false);
                        console.log('Effekseer context initialized');
                    } else {
                        console.warn('Could not access WebGL context for Effekseer');
                        this._effekseer = null;
                    }
                }
            } catch (e) {
                console.error('Effekseer initialization error:', e);
                this._effekseer = null;
            }
        } else if (!window.effekseer) {
            console.log('Effekseer library not loaded - animations will use sprite-based fallback');
        }
    }

    static createErrorPrinter() {
        this._errorPrinter = document.createElement("div");
        this._errorPrinter.id = "errorPrinter";
        this._errorPrinter.style.display = "none";
        this._errorPrinter.style.position = "absolute";
        this._errorPrinter.style.top = "50%";
        this._errorPrinter.style.left = "50%";
        this._errorPrinter.style.transform = "translate(-50%, -50%)";
        this._errorPrinter.style.color = "#fff";
        this._errorPrinter.style.background = "rgba(0,0,0,0.8)";
        this._errorPrinter.style.padding = "20px";
        this._errorPrinter.style.borderRadius = "5px";
        this._errorPrinter.style.maxWidth = "80%";
        this._errorPrinter.style.zIndex = "1000";
        document.body.appendChild(this._errorPrinter);
    }

    static createFPSCounter() {
        this._fpsCounter = document.createElement("div");
        this._fpsCounter.id = "fpsCounter";
        this._fpsCounter.style.position = "absolute";
        this._fpsCounter.style.top = "5px";
        this._fpsCounter.style.left = "5px";  // Upper left corner
        this._fpsCounter.style.color = "#fff";
        this._fpsCounter.style.fontSize = "12px";
        this._fpsCounter.style.fontFamily = "monospace";
        this._fpsCounter.style.background = "rgba(0,0,0,0.7)";
        this._fpsCounter.style.padding = "8px 12px";
        this._fpsCounter.style.borderRadius = "6px";  // Rounded edges
        this._fpsCounter.style.zIndex = "999";
        this._fpsCounter.style.display = "none"; // Hidden by default
        this._fpsCounter.style.userSelect = "none";  // Prevent text selection
        document.body.appendChild(this._fpsCounter);
    }

    static updateRealScale() {
        if (this._stretchEnabled && this._width > 0 && this._height > 0) {
            const h = this._stretchWidth() / this._width;
            const v = this._stretchHeight() / this._height;
            this._realScale = Math.min(h, v);
            window.scrollTo(0, 0);
        } else {
            this._realScale = this._defaultScale;
        }
    }

    static _stretchWidth() {
        if (Utils.isMobileDevice()) {
            return document.documentElement.clientWidth;
        } else {
            return window.innerWidth;
        }
    }

    static _stretchHeight() {
        if (Utils.isMobileDevice()) {
            const rate = 0.9; // Account for mobile browser UI elements
            return document.documentElement.clientHeight * rate;
        } else {
            return window.innerHeight;
        }
    }

    static _centerElement(element) {
        const width = element.width * this._realScale;
        const height = element.height * this._realScale;
        element.style.position = "absolute";
        element.style.margin = "auto";
        element.style.top = 0;
        element.style.left = 0;
        element.style.right = 0;
        element.style.bottom = 0;
        element.style.width = width + "px";
        element.style.height = height + "px";
    }

    static _updateAllElements() {
        this.updateRealScale();
        this._updateCanvas();
    }

    static _updateCanvas() {
        if (this._canvas) {
            this._canvas.width = this._width;
            this._canvas.height = this._height;
            this._canvas.style.zIndex = 1;
            this._centerElement(this._canvas);
        }
    }

    static setupEventHandlers() {
        this._isResizing = false;
        this._pendingResize = false;
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('fullscreenchange', this.onFullscreenChange.bind(this));
    }

    static onFullscreenChange() {
        // Wait a frame for fullscreen transition to complete
        requestAnimationFrame(() => {
            this.onWindowResize();
        });
    }

    static onWindowResize() {
        // Prevent multiple simultaneous resize operations
        if (this._isResizing) {
            this._pendingResize = true;
            return;
        }

        this._isResizing = true;
        this._pendingResize = false;

        // DON'T change game resolution - keep it at design resolution (1280x720)
        // Just update the scale factor to fit the window
        this._updateAllElements();

        // Notify scenes that resize happened (after a frame to let render complete)
        requestAnimationFrame(() => {
            this._isResizing = false;
            if (this._pendingResize) {
                this.onWindowResize();
            }
        });
    }

    static onKeyDown(event) {
        if (!event.ctrlKey && !event.altKey) {
            switch (event.keyCode) {
                case 113: // F2
                    event.preventDefault();
                    this.switchFPSCounter();
                    break;
                case 115: // F4
                    event.preventDefault();
                    this.switchFullScreen();
                    break;
            }
        }
    }

    static switchFPSCounter() {
        if (this._fpsCounter) {
            if (this._fpsCounter.style.display === 'none') {
                this._fpsCounter.style.display = 'block';
                // Update immediately when shown
                const fps = Math.round(this._app.ticker.FPS);
                this._fpsCounter.textContent = `FPS: ${fps}`;
            } else {
                this._fpsCounter.style.display = 'none';
            }
        }
    }

    static switchFullScreen() {
        if (this.isFullScreen()) {
            this.cancelFullScreen();
        } else {
            this.requestFullScreen();
        }
        // Update canvas scaling after a short delay to allow fullscreen transition
        setTimeout(() => {
            this._updateAllElements();
        }, 100);
    }

    static isFullScreen() {
        return (
            document.fullscreenElement ||
            document.mozFullScreenElement ||
            document.webkitFullscreenElement ||
            document.msFullscreenElement
        );
    }

    static requestFullScreen() {
        const element = document.body;
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        }
    }

    static cancelFullScreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }

    static startTickHandler() {
        // Configure PIXI ticker for 60 FPS (industry standard, matches RPG Maker MZ)
        // PIXI v8 uses targetFPMS (frames per millisecond)
        this._app.ticker.maxFPS = 60;

        // Use PIXI's ticker for the main game loop
        // The ticker automatically syncs to requestAnimationFrame (~60 FPS)
        this._app.ticker.add(() => {
            this.update();
        });
    }

    static update() {
        this.frameCount++;
        Input.update();
        this.updateFPSCounter();
        this.updateEffekseer();
        // Update SceneManager if it exists
        if (typeof SceneManager !== 'undefined' && SceneManager.update) {
            SceneManager.update();
        }
        // Copy input state for next frame AFTER all updates
        Input.updatePreviousState();
    }

    static updateEffekseer() {
        if (this._effekseer) {
            this._effekseer.update();
        }
    }

    static updateFPSCounter() {
        if (this._fpsCounter && this._fpsCounter.style.display !== "none") {
            // Update every 5 frames (~12 times per second at 60 FPS) for smoother updates
            if (this.frameCount % 5 === 0) {
                const fps = Math.round(this._app.ticker.FPS);
                const ms = this._app.ticker.deltaMS.toFixed(1);
                this._fpsCounter.textContent = `FPS: ${fps} | ${ms}ms`;
            }
        }
    }

    static showFPS() {
        if (this._fpsCounter) {
            this._fpsCounter.style.display = "block";
            // Update immediately when showing
            const fps = Math.round(this._app.ticker.FPS);
            const ms = Math.round(this._app.ticker.deltaMS);
            this._fpsCounter.textContent = `FPS: ${fps} (${ms}ms)`;
        }
    }

    static hideFPS() {
        if (this._fpsCounter) {
            this._fpsCounter.style.display = "none";
        }
    }

    static printError(name, message) {
        if (this._errorPrinter) {
            this._errorPrinter.innerHTML = `
                <div style="color: #ff6b6b; font-size: 18px; margin-bottom: 10px;">${name}</div>
                <div style="font-size: 14px;">${message}</div>
            `;
            this._errorPrinter.style.display = "block";
        }
        console.error(name, message);
    }

    static resize(width, height) {
        this._width = width;
        this._height = height;
        if (this._app && this._app.renderer) {
            this._app.renderer.resize(width, height);
        }
    }

    static applySystemSettings() {
        // Apply screen resolution from $dataSystem if available
        if (typeof $dataSystem !== 'undefined' && $dataSystem) {
            if ($dataSystem.advanced && $dataSystem.advanced.screenWidth) {
                this._width = $dataSystem.advanced.screenWidth;
            }
            if ($dataSystem.advanced && $dataSystem.advanced.screenHeight) {
                this._height = $dataSystem.advanced.screenHeight;
            }
            console.log('Applied system settings - Resolution:', this._width, 'x', this._height);
        }
    }

    static stop() {
        if (this._app && this._app.ticker) {
            this._app.ticker.stop();
        }
    }
}

//-----------------------------------------------------------------------------
// Utils
// The static class that provides utility functions

class Utils {
    constructor() {
        throw new Error("This is a static class");
    }

    static RPGMAKER_VERSION = "1.0.0";
    static RPGMAKER_ENGINE = "RPG Reactor";

    static isNwjs() {
        return typeof nw !== "undefined";
    }

    static isMobileDevice() {
        const r = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
        return !!navigator.userAgent.match(r);
    }

    static isOptionValid(name) {
        if (this._options && this._options[name] !== undefined) {
            return this._options[name];
        }
        return true;
    }

    static setEncryptionInfo(hasImages, hasAudio, key) {
        // Encryption support placeholder
        this._hasEncryptedImages = hasImages;
        this._hasEncryptedAudio = hasAudio;
        this._encryptionKey = key;
    }

    static escapeHtml(str) {
        const div = document.createElement("div");
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    static containsArabic(str) {
        const arabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
        return arabic.test(str);
    }
}

//-----------------------------------------------------------------------------
// Point
// The point class representing a 2D coordinate

class Point extends PIXI.Point {
    constructor(x = 0, y = 0) {
        super(x, y);
    }
}

//-----------------------------------------------------------------------------
// Rectangle
// The rectangle class

class Rectangle extends PIXI.Rectangle {
    constructor(x = 0, y = 0, width = 0, height = 0) {
        super(x, y, width, height);
    }
}

//-----------------------------------------------------------------------------
// WebAudio
// The audio class using Web Audio API

//-----------------------------------------------------------------------------
// Input
// The static class that handles input data from the keyboard

class Input {
    constructor() {
        throw new Error("This is a static class");
    }

    static initialize() {
        this.clear();
        this._setupEventHandlers();
    }

    static clear() {
        this._currentState = {};
        this._previousState = {};
        this._pressedTime = {};
        this._dir4 = 0;
        this._dir8 = 0;
        this._preferredAxis = "";
        this._date = 0;
    }

    static update() {
        this._updateDirection();
    }

    static updatePreviousState() {
        // Called at the end of the frame, after all input checks
        this._previousState = { ...this._currentState };
    }

    static consumeInput() {
        // Immediately consume all input by setting previous = current
        // This makes isTriggered() return false for the rest of this frame
        this._previousState = { ...this._currentState };
    }

    static isPressed(keyName) {
        return !!this._currentState[keyName];
    }

    static isTriggered(keyName) {
        return this._currentState[keyName] && !this._previousState[keyName];
    }

    static isRepeated(keyName) {
        if (!this._currentState[keyName]) {
            return false;
        }
        if (this.isTriggered(keyName)) {
            return true;
        }
        const time = this._pressedTime[keyName] || 0;
        return time >= 24 && time % 6 === 0;
    }

    static isLongPressed(keyName) {
        return this._currentState[keyName] && (this._pressedTime[keyName] || 0) >= 24;
    }

    static get dir4() {
        return this._dir4;
    }

    static get dir8() {
        return this._dir8;
    }

    static _setupEventHandlers() {
        document.addEventListener("keydown", this._onKeyDown.bind(this));
        document.addEventListener("keyup", this._onKeyUp.bind(this));
        window.addEventListener("blur", this._onLostFocus.bind(this));
    }

    static _onKeyDown(event) {
        const keyName = this._makeKeyName(event);
        if (keyName) {
            this._currentState[keyName] = true;
        }
        // Prevent default for arrow keys, space, etc. to avoid page scrolling
        if (this._shouldPreventDefault(event.keyCode)) {
            event.preventDefault();
        }
    }

    static _onKeyUp(event) {
        const keyName = this._makeKeyName(event);
        if (keyName) {
            this._currentState[keyName] = false;
            this._pressedTime[keyName] = 0;
        }
    }

    static _onLostFocus() {
        this.clear();
    }

    static _shouldPreventDefault(keyCode) {
        // Arrow keys, space, enter, escape
        return [37, 38, 39, 40, 32, 13, 27].includes(keyCode);
    }

    static _makeKeyName(event) {
        const keyMap = {
            // Arrow keys
            37: "left",
            38: "up",
            39: "right",
            40: "down",
            // WASD
            65: "left",    // A
            87: "up",      // W
            68: "right",   // D
            83: "down",    // S
            // Action keys
            13: "ok",      // Enter
            32: "ok",      // Space
            88: "ok",      // X
            90: "ok",      // Z
            27: "escape",  // Escape
            67: "menu",    // C
            // Function keys
            113: "debug",  // F2
            115: "debug",  // F4
            // Shift/Ctrl
            16: "shift",
            17: "control"
        };
        return keyMap[event.keyCode] || null;
    }

    static _updateDirection() {
        // Update direction based on arrow keys or WASD
        const up = this.isPressed("up");
        const down = this.isPressed("down");
        const left = this.isPressed("left");
        const right = this.isPressed("right");

        // 4-direction (2, 4, 6, 8 on numpad)
        this._dir4 = 0;
        if (up) this._dir4 = 8;
        if (right) this._dir4 = 6;
        if (down) this._dir4 = 2;
        if (left) this._dir4 = 4;

        // 8-direction
        this._dir8 = this._dir4;
        if (up && left) this._dir8 = 7;
        if (up && right) this._dir8 = 9;
        if (down && left) this._dir8 = 1;
        if (down && right) this._dir8 = 3;

        // Update pressed time counters
        for (const keyName in this._currentState) {
            if (this._currentState[keyName]) {
                // Initialize time if this is a new press (not in previous state)
                if (!this._previousState[keyName]) {
                    this._pressedTime[keyName] = 0;
                } else {
                    this._pressedTime[keyName] = (this._pressedTime[keyName] || 0) + 1;
                }
            }
        }
    }
}

//-----------------------------------------------------------------------------
// WebAudio
// The audio class using Web Audio API

class WebAudio {
    constructor(url) {
        this._url = url;
        this._buffer = null;
        this._sourceNode = null;
        this._gainNode = null;
        this._pannerNode = null;
        this._totalTime = 0;
        this._sampleRate = 0;
        this._loopStart = 0;
        this._loopLength = 0;
        this._startTime = 0;
        this._volume = 1;
        this._pitch = 1;
        this._pan = 0;
        this._endTimer = null;
        this._loadListeners = [];
        this._stopListeners = [];
        this._hasError = false;
        this._autoPlay = false;
        this.name = "";
        this.frameCount = 0;

        if (!WebAudio._context) {
            WebAudio.initialize();
        }

        this._load(url);
    }

    static initialize() {
        this._context = null;
        this._masterGainNode = null;
        this._masterVolume = 1;
        this._createContext();
        this._createMasterGainNode();
        this._setupEventHandlers();
        return !!this._context;
    }

    static _createContext() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this._context = new AudioContext();
        } catch (e) {
            this._context = null;
        }
    }

    static _createMasterGainNode() {
        const context = this._context;
        if (context) {
            this._masterGainNode = context.createGain();
            this._resetVolume();
            this._masterGainNode.connect(context.destination);
        }
    }

    static _setupEventHandlers() {
        const onUserGesture = this._onUserGesture.bind(this);
        document.addEventListener("keydown", onUserGesture);
        document.addEventListener("mousedown", onUserGesture);
        document.addEventListener("touchend", onUserGesture);
    }

    static _onUserGesture() {
        const context = this._context;
        if (context && context.state === "suspended") {
            context.resume();
        }
    }

    static _resetVolume() {
        if (this._masterGainNode) {
            this._masterGainNode.gain.setValueAtTime(this._masterVolume, this._context.currentTime);
        }
    }

    static setMasterVolume(value) {
        this._masterVolume = value;
        this._resetVolume();
    }

    async _load(url) {
        if (!WebAudio._context) {
            return;
        }

        try {
            let data;

            // Try Node.js fs first (for NW.js)
            if (typeof require === 'function') {
                const fs = require('fs');
                const path = require('path');
                const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
                const absolutePath = path.join(baseDir, url);

                const buffer = fs.readFileSync(absolutePath);
                data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            } else {
                // Fallback to fetch
                const response = await fetch(url);
                data = await response.arrayBuffer();
            }

            this._buffer = await WebAudio._context.decodeAudioData(data);
            this._totalTime = this._buffer.duration;

            if (this._loopLength === 0) {
                this._loopLength = this._totalTime;
            }

            this._onLoad();
        } catch (e) {
            this._hasError = true;
            console.error('Failed to load audio:', url, e);
        }
    }

    _onLoad() {
        while (this._loadListeners.length > 0) {
            const listener = this._loadListeners.shift();
            listener();
        }

        if (this._autoPlay) {
            this.play(this._loop, 0);
        }
    }

    isReady() {
        return !!this._buffer;
    }

    isError() {
        return this._hasError;
    }

    isPlaying() {
        return !!this._sourceNode;
    }

    play(loop, offset = 0) {
        if (this.isReady()) {
            offset = offset || 0;
            this._loop = loop;
            this._startPlaying(offset);
        } else if (!this._hasError) {
            this._autoPlay = true;
            this._loop = loop;
            this.addLoadListener(() => this.play(loop, offset));
        }
    }

    async _startPlaying(offset) {
        try {
            // Ensure AudioContext is resumed before playing
            if (WebAudio._context && WebAudio._context.state === "suspended") {
                await WebAudio._context.resume();
            }

            if (this._sourceNode) {
                this._sourceNode.stop();
            }

            this._createNodes();
            this._connectNodes();
            this._sourceNode.start(0, offset);
            this._startTime = WebAudio._context.currentTime - offset;
        } catch (error) {
            console.error(`WebAudio._startPlaying: Failed to start ${this.name}:`, error);
            this._removeNodes();
        }
    }

    stop() {
        if (this._sourceNode) {
            try {
                this._sourceNode.stop();
            } catch (e) {
                console.warn(`WebAudio.stop: Error stopping ${this.name}:`, e);
            }
            this._removeNodes();
            this._removeEndTimer();
        }
    }

    destroy() {
        this.stop();
        this._buffer = null;
    }

    fadeIn(duration) {
        if (this.isReady()) {
            if (this._gainNode) {
                const gain = this._gainNode.gain;
                const currentTime = WebAudio._context.currentTime;
                gain.setValueAtTime(0, currentTime);
                gain.linearRampToValueAtTime(this._volume, currentTime + duration);
            }
        }
    }

    fadeOut(duration) {
        if (this._gainNode) {
            const gain = this._gainNode.gain;
            const currentTime = WebAudio._context.currentTime;
            gain.setValueAtTime(this._volume, currentTime);
            gain.linearRampToValueAtTime(0, currentTime + duration);
        }
        this._autoPlay = false;
    }

    seek() {
        if (this._sourceNode) {
            const currentTime = WebAudio._context.currentTime;
            return (currentTime - this._startTime) % this._totalTime;
        }
        return 0;
    }

    addLoadListener(listener) {
        this._loadListeners.push(listener);
    }

    addStopListener(listener) {
        this._stopListeners.push(listener);
    }

    retry() {
        this._hasError = false;
        this._load(this._url);
    }

    _createNodes() {
        const context = WebAudio._context;
        this._sourceNode = context.createBufferSource();
        this._sourceNode.buffer = this._buffer;
        this._sourceNode.loop = this._loop || false;
        // Only set onended callback for non-looping audio
        // Looping audio should never end, so we don't want _onEnd to fire and remove nodes
        if (!this._loop) {
            this._sourceNode.onended = this._onEnd.bind(this);
        }
        this._gainNode = context.createGain();
        this._gainNode.gain.setValueAtTime(this._volume, context.currentTime);
        this._pannerNode = context.createStereoPanner();
        this._pannerNode.pan.setValueAtTime(this._pan, context.currentTime);
        this._updatePitch();
        this._createEndTimer();
    }

    _connectNodes() {
        this._sourceNode.connect(this._gainNode);
        this._gainNode.connect(this._pannerNode);
        this._pannerNode.connect(WebAudio._masterGainNode);
    }

    _removeNodes() {
        if (this._sourceNode) {
            this._sourceNode = null;
        }
        if (this._gainNode) {
            this._gainNode = null;
        }
        if (this._pannerNode) {
            this._pannerNode = null;
        }
    }

    _onEnd() {
        this._removeNodes();
        this._removeEndTimer();

        while (this._stopListeners.length > 0) {
            const listener = this._stopListeners.shift();
            listener();
        }
    }

    _updatePitch() {
        if (this._sourceNode) {
            this._sourceNode.playbackRate.setValueAtTime(this._pitch, WebAudio._context.currentTime);
        }
    }

    _createEndTimer() {
        if (this._sourceNode && !this._sourceNode.loop) {
            const duration = this._totalTime / this._pitch;
            this._endTimer = setTimeout(() => {
                this._onEnd();
            }, duration * 1000);
        }
    }

    _removeEndTimer() {
        if (this._endTimer) {
            clearTimeout(this._endTimer);
            this._endTimer = null;
        }
    }

    get url() {
        return this._url;
    }

    get volume() {
        return this._volume;
    }

    set volume(value) {
        this._volume = value;
        if (this._gainNode) {
            this._gainNode.gain.setValueAtTime(this._volume, WebAudio._context.currentTime);
        } else if (this.isPlaying()) {
            // If audio claims to be playing but gainNode doesn't exist, restart it to apply the new volume
            const currentPos = this.seek();
            this._startPlaying(currentPos);
        }
    }

    get pitch() {
        return this._pitch;
    }

    set pitch(value) {
        this._pitch = value;
        this._updatePitch();
    }

    get pan() {
        return this._pan;
    }

    set pan(value) {
        this._pan = value;
        if (this._pannerNode) {
            this._pannerNode.pan.setValueAtTime(this._pan, WebAudio._context.currentTime);
        }
    }
}

console.log('reactor_core.js loaded');
