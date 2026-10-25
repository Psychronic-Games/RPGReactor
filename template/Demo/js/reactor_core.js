//=============================================================================
// reactor_core.js v1.7.0
//=============================================================================
// Continued in these parts, which reactor_main.js loads next in this order:
//   reactor_core_display.js
//   reactor_core_io.js

//-----------------------------------------------------------------------------
/**
 * This section contains some methods that will be added to the standard
 * Javascript objects.
 *
 * @namespace JsExtensions
 */

/**
 * Makes a shallow copy of the array.
 *
 * @memberof JsExtensions
 * @returns {array} A shallow copy of the array.
 */
Array.prototype.clone = function() {
    return this.slice(0);
};

Object.defineProperty(Array.prototype, "clone", {
    enumerable: false
});

/**
 * Checks whether the array contains a given element.
 *
 * @memberof JsExtensions
 * @param {any} element - The element to search for.
 * @returns {boolean} True if the array contains a given element.
 * @deprecated includes() should be used instead.
 */
Array.prototype.contains = function(element) {
    return this.includes(element);
};

Object.defineProperty(Array.prototype, "contains", {
    enumerable: false
});

/**
 * Checks whether the two arrays are the same.
 *
 * @memberof JsExtensions
 * @param {array} array - The array to compare to.
 * @returns {boolean} True if the two arrays are the same.
 */
Array.prototype.equals = function(array) {
    if (!array || this.length !== array.length) {
        return false;
    }
    for (let i = 0; i < this.length; i++) {
        if (this[i] instanceof Array && array[i] instanceof Array) {
            if (!this[i].equals(array[i])) {
                return false;
            }
        } else if (this[i] !== array[i]) {
            return false;
        }
    }
    return true;
};

Object.defineProperty(Array.prototype, "equals", {
    enumerable: false
});

/**
 * Removes a given element from the array (in place).
 *
 * @memberof JsExtensions
 * @param {any} element - The element to remove.
 * @returns {array} The array after remove.
 */
Array.prototype.remove = function(element) {
    for (;;) {
        const index = this.indexOf(element);
        if (index >= 0) {
            this.splice(index, 1);
        } else {
            return this;
        }
    }
};

Object.defineProperty(Array.prototype, "remove", {
    enumerable: false
});

/**
 * Generates a random integer in the range (0, max-1).
 *
 * @memberof JsExtensions
 * @param {number} max - The upper boundary (excluded).
 * @returns {number} A random integer.
 */
Math.randomInt = function(max) {
    return Math.floor(max * Math.random());
};

/**
 * Returns a number whose value is limited to the given range.
 *
 * @memberof JsExtensions
 * @param {number} min - The lower boundary.
 * @param {number} max - The upper boundary.
 * @returns {number} A number in the range (min, max).
 */
Number.prototype.clamp = function(min, max) {
    return Math.min(Math.max(this, min), max);
};

/**
 * Returns a modulo value which is always positive.
 *
 * @memberof JsExtensions
 * @param {number} n - The divisor.
 * @returns {number} A modulo value.
 */
Number.prototype.mod = function(n) {
    return ((this % n) + n) % n;
};

/**
 * Makes a number string with leading zeros.
 *
 * @memberof JsExtensions
 * @param {number} length - The length of the output string.
 * @returns {string} A string with leading zeros.
 */
Number.prototype.padZero = function(length) {
    return String(this).padZero(length);
};

/**
 * Checks whether the string contains a given string.
 *
 * @memberof JsExtensions
 * @param {string} string - The string to search for.
 * @returns {boolean} True if the string contains a given string.
 * @deprecated includes() should be used instead.
 */
String.prototype.contains = function(string) {
    return this.includes(string);
};

/**
 * Replaces %1, %2 and so on in the string to the arguments.
 *
 * @memberof JsExtensions
 * @param {any} ...args The objects to format.
 * @returns {string} A formatted string.
 */
String.prototype.format = function() {
    return this.replace(/%([0-9]+)/g, (s, n) => arguments[Number(n) - 1]);
};

/**
 * Makes a number string with leading zeros.
 *
 * @memberof JsExtensions
 * @param {number} length - The length of the output string.
 * @returns {string} A string with leading zeros.
 */
String.prototype.padZero = function(length) {
    return this.padStart(length, "0");
};

//-----------------------------------------------------------------------------
/**
 * The static class that defines utility methods.
 *
 * @namespace
 */
function Utils() {
    throw new Error("This is a static class");
}

/**
 * The engine name reported to plugins. The corescript implements the RPG
 * Maker MZ API surface, and multi-engine plugins branch on this exact
 * string (UltraMode7, Cyclone, DK tools, ...) to pick which internals to
 * patch — reporting anything else sends them down the MV path or a dead
 * fallback. Reactor's own identity lives in REACTOR_NAME/REACTOR_VERSION.
 *
 * @type string
 * @constant
 */
Utils.RPGMAKER_NAME = "MZ";

/**
 * The name of this engine.
 *
 * @type string
 * @constant
 */
Utils.REACTOR_NAME = "Reactor";

/**
 * The version of the RPG Reactor.
 *
 * @type string
 * @constant
 */
Utils.RPGMAKER_VERSION = "1.7.0";

/**
 * Checks whether the current RPG Reactor version is greater than or equal to
 * the given version.
 *
 * @param {string} version - The "x.x.x" format string to compare.
 * @returns {boolean} True if the current version is greater than or equal
 *                    to the given version.
 */
Utils.checkRMVersion = function(version) {
    const array1 = this.RPGMAKER_VERSION.split(".");
    const array2 = String(version).split(".");
    for (let i = 0; i < array1.length; i++) {
        const v1 = parseInt(array1[i]);
        const v2 = parseInt(array2[i]);
        if (v1 > v2) {
            return true;
        } else if (v1 < v2) {
            return false;
        }
    }
    return true;
};

/**
 * Checks whether the option is in the query string.
 *
 * @param {string} name - The option name.
 * @returns {boolean} True if the option is in the query string.
 */
Utils.isOptionValid = function(name) {
    const args = location.search.slice(1);
    if (args.split("&").includes(name)) {
        return true;
    }
    if (this.isNwjs() && nw.App.argv.length > 0) {
        // Chromium switches (e.g. --user-data-dir) can occupy argv[0] with
        // the game option following them, so scan every argument. Each entry
        // may itself carry ampersand-delimited options (the Windows launcher
        // folds the mode into the profile path that lands in argv[0]).
        return nw.App.argv.some(arg => arg.split("&").includes(name));
    }
    return false;
};

/**
 * Checks whether the platform is NW.js.
 *
 * @returns {boolean} True if the platform is NW.js.
 */
Utils.isNwjs = function() {
    return typeof require === "function" && typeof process === "object";
};

/**
 * Checks whether the platform is a mobile device.
 *
 * @returns {boolean} True if the platform is a mobile device.
 */
Utils.isMobileDevice = function() {
    const r = /Android|webOS|iPhone|iPad|iPod|BlackBerry|Opera Mini/i;
    return !!navigator.userAgent.match(r);
};

/**
 * Checks whether the browser is Mobile Safari.
 *
 * @returns {boolean} True if the browser is Mobile Safari.
 */
Utils.isMobileSafari = function() {
    const agent = navigator.userAgent;
    return !!(
        agent.match(/iPhone|iPad|iPod/) &&
        agent.match(/AppleWebKit/) &&
        !agent.match("CriOS")
    );
};

/**
 * Checks whether the browser is Android Chrome.
 *
 * @returns {boolean} True if the browser is Android Chrome.
 */
Utils.isAndroidChrome = function() {
    const agent = navigator.userAgent;
    return !!(agent.match(/Android/) && agent.match(/Chrome/));
};

/**
 * Checks whether the browser is accessing local files.
 *
 * @returns {boolean} True if the browser is accessing local files.
 */
Utils.isLocal = function() {
    return window.location.href.startsWith("file:");
};

/**
 * Checks whether the browser supports WebGL.
 *
 * @returns {boolean} True if the browser supports WebGL.
 */
Utils.canUseWebGL = function() {
    // Answered once and remembered. Finding out costs a real WebGL context,
    // and a browser's budget for those is around sixteen — but MV compat
    // exposes this as `Graphics.hasWebGL()`, which MV plugins call freely and
    // some call every frame. Taking a context per call and never giving one
    // back made the browser evict live ones, which takes the game's own
    // renderer down with it.
    if (Utils._canUseWebGL !== undefined) return Utils._canUseWebGL;
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl");
        if (gl) {
            const lose = gl.getExtension("WEBGL_lose_context");
            if (lose) lose.loseContext();
        }
        Utils._canUseWebGL = !!gl;
    } catch (e) {
        Utils._canUseWebGL = false;
    }
    return Utils._canUseWebGL;
};

/**
 * Checks whether the browser supports Web Audio API.
 *
 * @returns {boolean} True if the browser supports Web Audio API.
 */
Utils.canUseWebAudioAPI = function() {
    return !!(window.AudioContext || window.webkitAudioContext);
};

/**
 * Checks whether the browser supports CSS Font Loading.
 *
 * @returns {boolean} True if the browser supports CSS Font Loading.
 */
Utils.canUseCssFontLoading = function() {
    return !!(document.fonts && document.fonts.ready);
};

/**
 * Checks whether the browser supports IndexedDB.
 *
 * @returns {boolean} True if the browser supports IndexedDB.
 */
Utils.canUseIndexedDB = function() {
    return !!(
        window.indexedDB ||
        window.mozIndexedDB ||
        window.webkitIndexedDB
    );
};

/**
 * Checks whether the browser can play ogg files.
 *
 * @returns {boolean} True if the browser can play ogg files.
 */
Utils.canPlayOgg = function() {
    if (!Utils._audioElement) {
        Utils._audioElement = document.createElement("audio");
    }
    return !!(
        Utils._audioElement &&
        Utils._audioElement.canPlayType('audio/ogg; codecs="vorbis"')
    );
};

/**
 * Checks whether the browser can play webm files.
 *
 * @returns {boolean} True if the browser can play webm files.
 */
Utils.canPlayWebm = function() {
    if (!Utils._videoElement) {
        Utils._videoElement = document.createElement("video");
    }
    return !!(
        Utils._videoElement &&
        Utils._videoElement.canPlayType('video/webm; codecs="vp8, vorbis"')
    );
};

/**
 * Encodes a URI component without escaping slash characters.
 *
 * @param {string} str - The input string.
 * @returns {string} Encoded string.
 */
Utils.encodeURI = function(str) {
    return encodeURIComponent(str).replace(/%2F/g, "/");
};

/**
 * Gets the filename that does not include subfolders.
 *
 * @param {string} filename - The filename with subfolders.
 * @returns {string} The filename without subfolders.
 */
Utils.extractFileName = function(filename) {
    return filename.split("/").pop();
};

/**
 * Escapes special characters for HTML.
 *
 * @param {string} str - The input string.
 * @returns {string} Escaped string.
 */
Utils.escapeHtml = function(str) {
    const entityMap = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "/": "&#x2F;"
    };
    return String(str).replace(/[&<>"'/]/g, s => entityMap[s]);
};

/**
 * Checks whether the string contains any Arabic characters.
 *
 * @returns {boolean} True if the string contains any Arabic characters.
 */
Utils.containsArabic = function(str) {
    const regExp = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
    return regExp.test(str);
};

/**
 * Sets information related to encryption.
 *
 * @param {boolean} hasImages - Whether the image files are encrypted.
 * @param {boolean} hasAudio - Whether the audio files are encrypted.
 * @param {string} key - The encryption key.
 */
Utils.setEncryptionInfo = function(hasImages, hasAudio, key) {
    // [Note] This function is implemented for module independence.
    this._hasEncryptedImages = hasImages;
    this._hasEncryptedAudio = hasAudio;
    this._encryptionKey = key;
};

/**
 * Checks whether the image files in the game are encrypted.
 *
 * @returns {boolean} True if the image files are encrypted.
 */
Utils.hasEncryptedImages = function() {
    return this._hasEncryptedImages;
};

/**
 * Checks whether the audio files in the game are encrypted.
 *
 * @returns {boolean} True if the audio files are encrypted.
 */
Utils.hasEncryptedAudio = function() {
    return this._hasEncryptedAudio;
};

/**
 * Resolves a relative asset URL against the real filename casing on disk.
 *
 * Games authored on Windows can request "bell3.ogg" for a file saved as
 * "Bell3.ogg"; Windows serves it, a case-sensitive filesystem 404s with no
 * console hint beyond the failed request. NW.js has the filesystem at hand,
 * so each path segment is matched case-insensitively instead.
 *
 * @param {string} url - The relative URL that failed to load.
 * @returns {?string} The corrected URL, or null if no distinct match exists.
 */
Utils.correctFileCase = function(url) {
    if (!this.isNwjs()) return this.correctFileCaseFromIndex(url);
    try {
        const fs = require("fs");
        const path = require("path");
        const base = path.dirname(process.mainModule.filename);
        const clean = decodeURIComponent(String(url).split("?")[0]);
        if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(clean)) return null;
        const segments = clean.split("/").filter(s => s && s !== ".");
        if (segments.some(s => s === "..")) return null;
        // One stat keeps the common exactly-cased case off the directory
        // walk below, so this is cheap enough to run before every request.
        if (fs.existsSync(path.join(base, ...segments))) return null;
        let dir = base;
        const corrected = [];
        for (const segment of segments) {
            let entries;
            try {
                entries = fs.readdirSync(dir);
            } catch (e) {
                return null;
            }
            const match = entries.includes(segment)
                ? segment
                : entries.find(e => e.toLowerCase() === segment.toLowerCase());
            if (!match) return null;
            corrected.push(match);
            dir = path.join(dir, match);
        }
        const result = corrected.join("/");
        return result !== clean ? result : null;
    } catch (e) {
        return null;
    }
};

/**
 * A browser cannot read the directory it was served from, so a web build
 * writes every file path into js/reactor_files.json and the runtime corrects
 * casing from that list instead. The index is fetched once, on the first
 * request that could need it; until it arrives the load-error retry finds it.
 */
Utils._webFileIndex = null;

/**
 * @param {string[]} files - Relative, forward-slashed paths of every file in the build.
 */
Utils.setWebFileIndex = function(files) {
    const index = new Map();
    for (const file of files || []) {
        if (typeof file === "string") index.set(file.toLowerCase(), file);
    }
    this._webFileIndex = index;
};

Utils.loadWebFileIndex = function() {
    if (this._webFileIndexRequested || this.isNwjs() || typeof fetch !== "function") return;
    // The web editor serves its project through its own host, not this index.
    if (typeof window !== "undefined" && window.RPGReactorHost) return;
    this._webFileIndexRequested = true;
    fetch("js/reactor_files.json")
        .then(response => (response.ok ? response.json() : null))
        .then(data => {
            if (data && Array.isArray(data.files)) this.setWebFileIndex(data.files);
        })
        .catch(() => {});
};

/**
 * @param {string} url - The relative URL that failed to load.
 * @returns {?string} The URL as the build's file index spells it, or null.
 */
Utils.correctFileCaseFromIndex = function(url) {
    this.loadWebFileIndex();
    const index = this._webFileIndex;
    if (!index) return null;
    const clean = decodeURIComponent(String(url).split("?")[0]);
    if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(clean)) return null;
    const segments = clean.split("/").filter(s => s && s !== ".");
    if (segments.some(s => s === "..")) return null;
    const normalized = segments.join("/");
    const match = index.get(normalized.toLowerCase());
    return match && match !== normalized ? match : null;
};

/**
 * Corrects a request URL's filename casing before the request is issued.
 *
 * A failed request cannot be kept out of the console, and recovery inside
 * _onError is not guaranteed to run: plugins may replace the error handler
 * without calling the original (CGMZ_Fallback swaps in its fallback file
 * there), which would turn a mere case mismatch into permanently wrong
 * assets. Resolving the real casing up front avoids both.
 *
 * @param {string} url - The relative URL about to be requested (no suffix).
 * @param {string} suffix - The encrypted-asset suffix, "_" or "".
 * @returns {string} The URL with on-disk casing, without the suffix.
 */
/**
 * Whether a relative asset file is on disk, in any letter case. Known only with
 * the filesystem at hand (NW.js): null elsewhere, where a request finds out.
 *
 * @param {string} url - The relative URL.
 * @returns {?boolean}
 */
Utils.localAssetExists = function(url) {
    if (!this.isNwjs()) return null;
    try {
        const fs = require("fs");
        const path = require("path");
        const clean = decodeURIComponent(String(url).split("?")[0]);
        if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(clean)) return null;
        const segments = clean.split("/").filter(s => s && s !== ".");
        if (segments.some(s => s === "..")) return null;
        const base = path.dirname(process.mainModule.filename);
        return fs.existsSync(path.join(base, ...segments)) || !!this.correctFileCase(url);
    } catch (e) {
        return null;
    }
};

Utils.resolveFileCase = function(url, suffix) {
    const corrected = this.correctFileCase(url + suffix);
    if (!corrected) return url;
    return suffix && corrected.endsWith(suffix)
        ? corrected.slice(0, -suffix.length)
        : corrected;
};

/**
 * Playable audio file extensions, in resolution priority order.
 *
 * @type string[]
 */
Utils.AUDIO_EXTENSIONS = [".ogg", ".mp3", ".wav", ".flac", ".m4a"];

/**
 * Resolves an audio URL's extension against what actually exists on disk.
 *
 * Audio references are stored extensionless and requested as ".ogg", but a
 * project may ship the track as .mp3, .wav or .m4a instead. With the
 * filesystem at hand the real extension is found before the request; on the
 * web the load-error fallback chain covers the same ground.
 *
 * @param {string} url - The relative URL about to be requested (no suffix).
 * @param {string} suffix - The encrypted-asset suffix, "_" or "".
 * @returns {string} The URL with the on-disk extension, without the suffix.
 */
Utils.resolveAudioExtension = function(url, suffix) {
    if (!this.isNwjs()) return url;
    const match = /\.[a-z0-9]+$/i.exec(String(url));
    const ext = match ? match[0].toLowerCase() : "";
    if (!this.AUDIO_EXTENSIONS.includes(ext)) return url;
    try {
        const fs = require("fs");
        const path = require("path");
        const base = path.dirname(process.mainModule.filename);
        const stem = url.slice(0, -ext.length);
        const candidates = [ext].concat(
            this.AUDIO_EXTENSIONS.filter(e => e !== ext));
        for (const candidate of candidates) {
            const candidateUrl = stem + candidate;
            const clean = decodeURIComponent(candidateUrl.split("?")[0]) + suffix;
            if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(clean)) return url;
            const segments = clean.split("/").filter(s => s && s !== ".");
            if (segments.some(s => s === "..")) return url;
            if (fs.existsSync(path.join(base, ...segments))
                || this.correctFileCase(candidateUrl + suffix)) {
                return candidateUrl;
            }
        }
    } catch (e) {
        // Resolution is best-effort; the request itself reports failures.
    }
    return url;
};

/**
 * Decrypts encrypted data.
 *
 * @param {ArrayBuffer} source - The data to be decrypted.
 * @returns {ArrayBuffer} The decrypted data.
 */
Utils.decryptArrayBuffer = function(source) {
    const header = new Uint8Array(source, 0, 16);
    const headerHex = Array.from(header, x => x.toString(16)).join(",");
    if (headerHex !== "52,50,47,4d,56,0,0,0,0,3,1,0,0,0,0,0") {
        throw new Error("Decryption error");
    }
    const body = source.slice(16);
    const view = new DataView(body);
    const key = this._encryptionKey.match(/.{2}/g);
    for (let i = 0; i < 16; i++) {
        view.setUint8(i, view.getUint8(i) ^ parseInt(key[i], 16));
    }
    return body;
};

//-----------------------------------------------------------------------------
/**
 * The static class that carries out graphics processing.
 *
 * @namespace
 */
function Graphics() {
    throw new Error("This is a static class");
}

/**
 * Initializes the graphics system.
 *
 * @returns {boolean} True if the graphics system is available.
 */
Graphics.initialize = async function() {
    this._width = 0;
    this._height = 0;
    this._defaultScale = 1;
    this._realScale = 1;
    this._errorPrinter = null;
    this._tickHandler = null;
    this._canvas = null;
    this._fpsCounter = null;
    this._loadingSpinner = null;
    this._stretchEnabled = this._defaultStretchMode();
    this._app = null;
    this._startRequested = false;
    this._effekseer = null;
    this._wasLoading = false;

    /**
     * The total frame count of the game screen.
     *
     * @type number
     * @name Graphics.frameCount
     */
    this.frameCount = 0;

    /**
     * The width of the window display area.
     *
     * @type number
     * @name Graphics.boxWidth
     */
    this.boxWidth = this._width;

    /**
     * The height of the window display area.
     *
     * @type number
     * @name Graphics.boxHeight
     */
    this.boxHeight = this._height;

    this._updateRealScale();
    this._createAllElements();
    this._disableContextMenu();
    this._setupEventHandlers();
    await this._createPixiApp();
    this._createEffekseerContext();

    return !!this._app;
};

/**
 * The PIXI.Application object.
 *
 * @readonly
 * @type PIXI.Application
 * @name Graphics.app
 */
Object.defineProperty(Graphics, "app", {
    get: function() {
        return this._app;
    },
    configurable: true
});

/**
 * The context object of Effekseer.
 *
 * @readonly
 * @type EffekseerContext
 * @name Graphics.effekseer
 */
Object.defineProperty(Graphics, "effekseer", {
    get: function() {
        return this._effekseer;
    },
    configurable: true
});

/**
 * Register a handler for tick events.
 *
 * @param {function} handler - The listener function to be added for updates.
 */
Graphics.setTickHandler = function(handler) {
    this._tickHandler = handler;
};

/**
 * Starts the game loop.
 */
Graphics.startGameLoop = function() {
    // The PIXI application is created asynchronously. Plugins that alias
    // SceneManager.run/initialize with non-async wrappers drop that promise,
    // so this can be reached before the app exists. Always record the
    // requested loop state; _createPixiApp honors it once the app is ready.
    this._startRequested = true;
    if (this._app) {
        this._app.start();
    }
};

/**
 * Stops the game loop.
 */
Graphics.stopGameLoop = function() {
    this._startRequested = false;
    if (this._app) {
        this._app.stop();
    }
};

/**
 * Sets the stage to be rendered.
 *
 * @param {Stage} stage - The stage object to be rendered.
 */
Graphics.setStage = function(stage) {
    if (this._app) {
        this._app.stage = stage;
    }
    this._redrawWanted = true;
};

/**
 * Shows the loading spinner.
 */
Graphics.startLoading = function() {
    if (!document.getElementById("loadingSpinner")) {
        document.body.appendChild(this._loadingSpinner);
    }
};

/**
 * Erases the loading spinner.
 *
 * @returns {boolean} True if the loading spinner was active.
 */
Graphics.endLoading = function() {
    if (document.getElementById("loadingSpinner")) {
        document.body.removeChild(this._loadingSpinner);
        return true;
    } else {
        return false;
    }
};

/**
 * Displays the error text to the screen.
 *
 * @param {string} name - The name of the error.
 * @param {string} message - The message of the error.
 * @param {Error} [error] - The error object.
 */
Graphics.printError = function(name, message, error = null) {
    if (!this._errorPrinter) {
        this._createErrorPrinter();
    }
    this._errorPrinter.innerHTML = this._makeErrorHtml(name, message, error);
    this._wasLoading = this.endLoading();
    this._applyCanvasFilter();
};

/**
 * Displays a button to try to reload resources.
 *
 * @param {function} retry - The callback function to be called when the button
 *                           is pressed.
 */
Graphics.showRetryButton = function(retry) {
    const button = document.createElement("button");
    button.id = "retryButton";
    button.innerHTML = "Retry";
    // [Note] stopPropagation() is required for iOS Safari.
    button.ontouchstart = e => e.stopPropagation();
    button.onclick = () => {
        Graphics.eraseError();
        retry();
    };
    this._errorPrinter.appendChild(button);
    button.focus();
};

/**
 * Erases the loading error text.
 */
Graphics.eraseError = function() {
    if (this._errorPrinter) {
        this._errorPrinter.innerHTML = this._makeErrorHtml();
        if (this._wasLoading) {
            this.startLoading();
        }
    }
    this._clearCanvasFilter();
};

/**
 * Converts an x coordinate on the page to the corresponding
 * x coordinate on the canvas area.
 *
 * @param {number} x - The x coordinate on the page to be converted.
 * @returns {number} The x coordinate on the canvas area.
 */
Graphics.pageToCanvasX = function(x) {
    if (this._canvas) {
        const left = this._canvas.offsetLeft;
        return Math.round((x - left) / this._realScale);
    } else {
        return 0;
    }
};

/**
 * Converts a y coordinate on the page to the corresponding
 * y coordinate on the canvas area.
 *
 * @param {number} y - The y coordinate on the page to be converted.
 * @returns {number} The y coordinate on the canvas area.
 */
Graphics.pageToCanvasY = function(y) {
    if (this._canvas) {
        const top = this._canvas.offsetTop;
        return Math.round((y - top) / this._realScale);
    } else {
        return 0;
    }
};

/**
 * Checks whether the specified point is inside the game canvas area.
 *
 * @param {number} x - The x coordinate on the canvas area.
 * @param {number} y - The y coordinate on the canvas area.
 * @returns {boolean} True if the specified point is inside the game canvas area.
 */
Graphics.isInsideCanvas = function(x, y) {
    return x >= 0 && x < this._width && y >= 0 && y < this._height;
};

/**
 * Shows the game screen.
 */
Graphics.showScreen = function() {
    this._canvas.style.opacity = 1;
};

/**
 * Hides the game screen.
 */
Graphics.hideScreen = function() {
    this._canvas.style.opacity = 0;
};

/**
 * Changes the size of the game screen.
 *
 * @param {number} width - The width of the game screen.
 * @param {number} height - The height of the game screen.
 */
Graphics.resize = function(width, height) {
    this._width = width;
    this._height = height;
    this._app.renderer.resize(width, height);
    this._redrawWanted = true;
    this._updateAllElements();
};

/**
 * The width of the game screen.
 *
 * @type number
 * @name Graphics.width
 */
Object.defineProperty(Graphics, "width", {
    get: function() {
        return this._width;
    },
    set: function(value) {
        if (this._width !== value) {
            this._width = value;
            this._updateAllElements();
        }
    },
    configurable: true
});

/**
 * The height of the game screen.
 *
 * @type number
 * @name Graphics.height
 */
Object.defineProperty(Graphics, "height", {
    get: function() {
        return this._height;
    },
    set: function(value) {
        if (this._height !== value) {
            this._height = value;
            this._updateAllElements();
        }
    },
    configurable: true
});

/**
 * The default zoom scale of the game screen.
 *
 * @type number
 * @name Graphics.defaultScale
 */
Object.defineProperty(Graphics, "defaultScale", {
    get: function() {
        return this._defaultScale;
    },
    set: function(value) {
        if (this._defaultScale !== value) {
            this._defaultScale = value;
            this._updateAllElements();
        }
    },
    configurable: true
});

Graphics._createAllElements = function() {
    this._createErrorPrinter();
    this._createCanvas();
    this._createLoadingSpinner();
    this._createFPSCounter();
};

Graphics._updateAllElements = function() {
    this._updateRealScale();
    this._updateErrorPrinter();
    this._updateCanvas();
    this._updateVideo();
    this._updateReactor3DCanvas();
};

/**
 * Keep the 3D canvas the same size and place as the game canvas.
 *
 * It is a sibling of the game canvas rather than one of Graphics' own
 * elements, so it was missed whenever the window changed: going fullscreen
 * scaled the game canvas up and left the 3D one at its old size, drawing the
 * world as a small rectangle in the middle of a black screen.
 */
Graphics._updateReactor3DCanvas = function() {
    if (typeof Reactor3D === "undefined") return;
    const viewport = Reactor3D.viewport && Reactor3D.viewport();
    if (viewport && viewport.resize) viewport.resize();
};

/**
 * Work that belongs to the frame drawn, not to each update: a tick catching up
 * runs several updates and one draw. Each hook runs once, just before it.
 */
Graphics._reactorBeforeRender = Graphics._reactorBeforeRender || new Set();

/**
 * A refresh that ran no update draws the composite only when something
 * changed since the last one. On a screen faster than the game's sixty
 * updates (three refreshes an update at 180 Hz) the refreshes between
 * updates drew the same picture again: the 3D world is drawn on updates,
 * and the game moves nothing between them. What can still change between
 * updates draws: a texture source taking new pixels (a video frame, a canvas
 * uploaded), the stage queueing render work (a plugin animating a sprite
 * from its own frame callback), a draw into a texture, a resize (it clears
 * the canvas), a new stage, and `requestRedraw()`. The Effekseer overlay is
 * drawn with the composite it lies over. A tick handler that does not say
 * how many updates it ran (a plugin's own loop) draws every refresh.
 * `skipUnchangedFrames = false` draws every refresh, as before.
 */
Graphics.skipUnchangedFrames = true;
Graphics._textureUpdates = 0;

/** Draw the composite on the next refresh, update or not. */
Graphics.requestRedraw = function() {
    this._redrawWanted = true;
};

/** Count texture sources taking new pixels (`update()`): none of them touches the sprite showing it. */
Graphics._watchTextureSources = function() {
    const proto = typeof PIXI !== "undefined" && PIXI.TextureSource && PIXI.TextureSource.prototype;
    if (!proto || typeof proto.update !== "function" || proto.update.__rrCounted) return;
    const update = proto.update;
    const counted = function() {
        Graphics._textureUpdates++;
        return update.apply(this, arguments);
    };
    counted.__rrCounted = true;
    proto.update = counted;
};

/**
 * The render work the stage has queued, as two numbers that only grow
 * between composites: its render groups, and every group's pending
 * transform, view and structure updates (PIXI 8 queues each change there,
 * and a composite consumes the queues). Null where the stage has no render
 * group to read.
 */
Graphics._stageWork = function(stage, into) {
    const root = stage && stage.renderGroup;
    if (!root) return null;
    into.groups = 0; into.pending = 0;
    const visit = group => {
        into.groups++;
        if (group.structureDidChange) into.pending++;
        if (group.isCachedAsTexture && group.textureNeedsUpdate) into.pending++;
        if (group.childrenRenderablesToUpdate) into.pending += group.childrenRenderablesToUpdate.index || 0;
        const byDepth = group.childrenToUpdate;
        if (byDepth) for (const depth in byDepth) into.pending += (byDepth[depth] && byDepth[depth].index) || 0;
        const children = group.renderGroupChildren;
        if (children) for (let i = 0; i < children.length; i++) visit(children[i]);
    };
    visit(root);
    return into;
};

/** Whether this refresh draws: `updates` is what the tick handler returned. */
Graphics._frameChanged = function(updates) {
    const last = this._lastComposite;
    if (!this.skipUnchangedFrames || updates !== 0 || this._redrawWanted || !last) return true;
    if (this._textureUpdates !== last.textures) return true;
    if (PIXI.__reactorPendingTextureUploads && PIXI.__reactorPendingTextureUploads() > 0) return true;
    const now = this._stageWork(this._app.stage, this._workNow || (this._workNow = { groups: 0, pending: 0 }));
    return !now || last.stage !== this._app.stage || now.groups !== last.groups || now.pending !== last.pending;
};

/** What the composite just drawn left behind, for the next refresh to compare with. */
Graphics._noteComposite = function() {
    const last = this._lastComposite || (this._lastComposite = { textures: 0, stage: null, groups: 0, pending: 0 });
    this._redrawWanted = false;
    last.textures = this._textureUpdates;
    last.stage = this._app.stage;
    const work = this._stageWork(this._app.stage, last);
    if (!work) this._lastComposite = null;
};

/**
 * Even motion however the screen's refreshes fall against the updates.
 *
 * The game updates 60 times a second and drew its map in the updates. A
 * frame rate 60 does not divide shows those updates unevenly: a 144 Hz
 * screen on a 3, 2, 2, 3 ... pattern of refreshes, a 180 Hz one whose frames
 * take two refreshes on a 1, 1, 0 pattern, a 50 Hz one with a double step
 * every fifth refresh. Motion then judders however fast each frame is made.
 * While the updates land unevenly on the frames, the map is drawn on every
 * k-th frame (k = frames per update, rounded down, at least 1: 72 pictures a
 * second at 144 Hz, 90 when a 180 Hz screen gets every other refresh), and
 * what the engine places from the game's state is drawn where it stands at
 * that frame's moment, between the last update and the one before: the
 * camera, the characters' models, billboards and sprites (`_realX`,
 * `_realY`, the jump, the air), the tilemap and parallax scroll. The game's
 * updates, their timing and everything they decide are untouched; what a
 * plugin moves itself is drawn where it put it. Updates that land evenly
 * (60 at 60 Hz, one in two frames at 120, one in three at 180) are drawn in
 * the updates as before, and the change between the two is eased over
 * `EASE_FRAMES` so the picture never steps.
 *
 * Aboard a vehicle, and at the quality levels' half rate, the map is drawn
 * in its updates. `enabled = false` draws in the updates always.
 */
Graphics.FramePacing = {
    enabled: true,
    /** decide(): not paced (the usual rules), a paced frame that draws, one that does not. */
    OFF: 0, DRAW: 1, SKIP: 2,
    /** Frames judged at once, and the share of their updates landing off the even pattern that makes them uneven. */
    WINDOW: 32,
    UNEVEN_SHARE: 0.15,
    /** Windows running that turn pacing on (uneven) and off (even). */
    ON_AFTER: 2,
    OFF_AFTER: 4,
    /** A spacing between frames that ran updates this far from their usual spacing (a share of it) is off the pattern. */
    SPACING: 0.25,
    /** Frames over which the picture goes from the updates' moment to the paced one, and back. */
    EASE_FRAMES: 30,
    /** A whole number of frames per update within this share counts as whole. */
    WHOLE: 0.04,
    /** Tiles a character or the view moves in one update past which it is drawn where it is (a transfer, a looping map). */
    JUMP: 2,
    /** The camera's move (tiles) and turn (radians) in one update past which it is drawn as it is (a cut). */
    CAMERA_JUMP: 3,
    CAMERA_TURN: 1,
    /** The frames' interval in ms (0 until read): the median of the last few. */
    frameMs: 0,
    INTERVALS: 15,
    _intervals: new Float64Array(15), _intervalAt: 0, _intervalCount: 0, _sorted: new Float64Array(15), _last: 0,
    _times: new Float64Array(32), _counts: new Float64Array(32), _spacings: new Float64Array(32), _frames: 0,
    _uneven: 0, _even: 0, _paced: false, _ease: 0,
    _active: false, _index: 0,
    _chars: [], _prev: new Float64Array(256), _prevCount: 0, _capturedAt: -1, _live: new Float64Array(256),
    _display: new Float64Array(2), _camera: new Float64Array(7), _cameraValid: false,
    _applied: false, _objects: [], _objectCount: 0, _sprites: [], _spriteCount: 0, _spriteAt: new Float64Array(64),
    _cameraSaved: new Float64Array(7), _cameraObject: null, _origin: null,

    /** Frames per update at the frames' own interval; 0 until it is known. */
    ratio() {
        return this.frameMs > 0 ? (1000 / 60) / this.frameMs : 0;
    },
    /** How many frames apart the map is drawn. */
    every() {
        return Math.max(1, Math.floor(this.ratio() + this.WHOLE));
    },
    noteInterval(now) {
        const interval = now - this._last;
        this._last = now;
        if (!(interval > 1 && interval < 250)) return;
        this._intervals[this._intervalAt] = interval;
        this._intervalAt = (this._intervalAt + 1) % this.INTERVALS;
        if (this._intervalCount < this.INTERVALS) this._intervalCount++;
        const n = this._intervalCount, sorted = this._sorted;
        for (let i = 0; i < n; i++) sorted[i] = this._intervals[i];
        const part = sorted.subarray(0, n);
        part.sort();
        this.frameMs = part[n >> 1];
    },
    /**
     * After a frame's updates: is the window of frames full, and did its
     * updates land evenly? Uneven: more than UNEVEN_SHARE of the frames that
     * ran updates ran a different number of them than most, or came at a
     * spacing SPACING off the usual one.
     */
    judge(now, updates) {
        const i = this._frames++;
        this._times[i] = now; this._counts[i] = updates;
        if (this._frames < this.WINDOW) return;
        this._frames = 0;
        let ran = 0, last = -1, spaced = 0;
        const counts = this._counts, times = this._times, spacings = this._spacings;
        for (let k = 0; k < this.WINDOW; k++) {
            if (!(counts[k] > 0)) continue;
            if (last >= 0) spacings[spaced++] = times[k] - times[last];
            last = k; ran++;
        }
        let uneven = false;
        if (ran >= 4 && spaced >= 3) {
            // The usual count and spacing: the median of each.
            const usual = this.median(counts, this.WINDOW, true), spacing = this.median(spacings, spaced, false);
            let off = 0;
            for (let k = 0; k < this.WINDOW; k++) if (counts[k] > 0 && counts[k] !== usual) off++;
            for (let k = 0; k < spaced; k++) if (Math.abs(spacings[k] - spacing) > spacing * this.SPACING) off++;
            uneven = off > ran * this.UNEVEN_SHARE;
        }
        if (uneven) { this._even = 0; if (++this._uneven >= this.ON_AFTER) this._paced = true; }
        else { this._uneven = 0; if (++this._even >= this.OFF_AFTER) this._paced = false; }
    },
    _medianScratch: new Float64Array(32),
    median(values, n, positiveOnly) {
        const scratch = this._medianScratch;
        let m = 0;
        for (let i = 0; i < n; i++) if (!positiveOnly || values[i] > 0) scratch[m++] = values[i];
        if (!m) return 0;
        const part = scratch.subarray(0, m);
        part.sort();
        return part[m >> 1];
    },
    /** The map shown now, when it can be paced; else null. */
    spriteset() {
        const manager = typeof SceneManager !== "undefined" ? SceneManager : null;
        const scene = manager && manager._scene;
        if (!scene || typeof Scene_Map === "undefined" || !(scene instanceof Scene_Map) || !scene.isStarted || !scene.isStarted()) return null;
        if (manager.isSceneChanging && manager.isSceneChanging()) return null;
        const spriteset = scene._spriteset;
        if (!spriteset || typeof spriteset.drawReactor3D !== "function") return null;
        const state = spriteset._reactor3d;
        if (state && (state.arrival || state.warming || !state.viewport || !state.scene)) return null;
        if (spriteset._reactor3dPending) return null;
        return spriteset;
    },
    /** Whether this frame's map can be paced at all. */
    allowed() {
        if (!this.enabled || typeof SceneManager === "undefined" || SceneManager.trueSpeed === false) return false;
        if (!this.spriteset()) return false;
        // At the quality levels' last step the world is drawn on every other update.
        const quality = typeof Reactor3D !== "undefined" ? Reactor3D.Quality : null;
        if (quality && quality.h) return false;
        // A vehicle's model and its camera's lay are placed by its own code: drawn in the updates.
        const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
        if (player && ((player.isInVehicle && player.isInVehicle()) || player._vehicleType === "reactor")) return false;
        return true;
    },
    /** A frame begins: its interval, and whether its map is paced (drawn by `draw`, not in the update). */
    begin(now) {
        this.noteInterval(now);
        this._active = this.allowed() && (this._paced || this._ease > 0);
        if (this._active) this._index++;
        else this._ease = 0;
    },
    /** Whether `spriteset`'s world waits for a paced frame rather than drawing in its update. */
    drawsWorld(spriteset) {
        return this._active && this.spriteset() === spriteset;
    },
    /** After the updates: OFF, DRAW or SKIP. */
    decide(updates) {
        if (updates !== undefined && this.enabled) this.judge(this._last, updates);
        if (!this._active || updates === undefined) return this.OFF;
        if (!this.spriteset()) { this._active = false; return this.OFF; }
        // Eased in while paced, out once the updates land evenly again; out, every frame draws (in an update, or here).
        this._ease = this._paced ? Math.min(this.EASE_FRAMES, this._ease + 1) : Math.max(0, this._ease - 1);
        if (!this._paced) return updates > 0 || this._ease > 0 ? this.DRAW : this.SKIP;
        return this._index % this.every() === 0 ? this.DRAW : this.SKIP;
    },
    /** How far between the update before last and the last this frame stands: 1 at the last. */
    alpha() {
        if (this._capturedAt !== Graphics.frameCount - 1) return 1;
        // An update is made a tenth of a tick early (SceneManager.determineRepeatNumber).
        const phase = (SceneManager._elapsedTime || 0) + 0.1;
        const at = phase <= 0 ? 0 : phase >= 1 ? 1 : phase;
        // Eased from the updates' own moment (1) to the paced one over EASE_FRAMES, and back.
        const ease = this._ease / this.EASE_FRAMES;
        return 1 - ease * (1 - at);
    },
    /** The characters the engine places, in a list kept between updates. */
    gather() {
        const list = this._chars;
        let n = 0;
        if (typeof $gamePlayer !== "undefined" && $gamePlayer) {
            list[n++] = $gamePlayer;
            const followers = $gamePlayer._followers && $gamePlayer._followers._data;
            if (followers) for (let i = 0; i < followers.length; i++) if (followers[i]) list[n++] = followers[i];
        }
        if (typeof $gameMap !== "undefined" && $gameMap) {
            // The map's own list of its events (the props' ids start at 10000: the raw array is mostly holes).
            const events = typeof $gameMap.events === "function" ? $gameMap.events() : $gameMap._events || [];
            for (let i = 0; i < events.length; i++) if (events[i]) list[n++] = events[i];
            const vehicles = $gameMap._vehicles;
            if (vehicles) for (let i = 0; i < vehicles.length; i++) if (vehicles[i]) list[n++] = vehicles[i];
        }
        for (let i = n; i < list.length && list[i]; i++) list[i] = null;
        return n;
    },
    /** An update begins (SceneManager.updateMain): where everything stands before it. */
    beforeUpdate() {
        // Only the frame's last update is drawn from: a catch-up's earlier ones are not looked at.
        if (!this._active || (SceneManager.isFinalUpdateOfFrame && !SceneManager.isFinalUpdateOfFrame())) return;
        const n = this.gather();
        if (this._prev.length < n * 4) this._prev = new Float64Array(n * 8);
        const prev = this._prev, list = this._chars;
        for (let i = 0; i < n; i++) {
            const c = list[i], k = i * 4;
            prev[k] = c._realX; prev[k + 1] = c._realY;
            prev[k + 2] = c._jumpCount || 0; prev[k + 3] = c._reactorAir || 0;
        }
        this._prevCount = n;
        if (typeof $gameMap !== "undefined" && $gameMap) { this._display[0] = $gameMap._displayX; this._display[1] = $gameMap._displayY; }
        const camera = this.camera();
        this._cameraValid = !!camera;
        if (camera) {
            const c = this._camera, p = camera.position, q = camera.quaternion;
            c[0] = p.x; c[1] = p.y; c[2] = p.z; c[3] = q.x; c[4] = q.y; c[5] = q.z; c[6] = q.w;
        }
        this._capturedAt = Graphics.frameCount;
    },
    camera() {
        const spriteset = this.spriteset(), state = spriteset && spriteset._reactor3d;
        const viewport = state && state.viewport;
        return viewport && viewport.camera ? viewport.camera() : null;
    },
    /** The index of `character` in the list gathered at the update's start, or -1. */
    indexOf(character) {
        const list = this._chars;
        for (let i = 0; i < this._prevCount; i++) if (list[i] === character) return i;
        return -1;
    },
    /** The live state of the characters swapped for their places at `alpha` (`into` = true), or back (false). */
    swapCharacters(alpha, into) {
        const list = this._chars, prev = this._prev, live = this._live || (this._live = new Float64Array(256));
        if (live.length < this._prevCount * 4) this._live = new Float64Array(this._prevCount * 8);
        const keep = this._live;
        for (let i = 0; i < this._prevCount; i++) {
            const c = list[i], k = i * 4;
            if (!c) continue;
            if (into) {
                const x = c._realX, y = c._realY;
                keep[k] = x; keep[k + 1] = y; keep[k + 2] = c._jumpCount || 0; keep[k + 3] = c._reactorAir || 0;
                if (!(Math.abs(x - prev[k]) <= this.JUMP && Math.abs(y - prev[k + 1]) <= this.JUMP)) { keep[k] = NaN; continue; }
                c._realX = prev[k] + (x - prev[k]) * alpha;
                c._realY = prev[k + 1] + (y - prev[k + 1]) * alpha;
                // Mid-jump or landing only: a jump that began this update starts from where it is.
                if (prev[k + 2] > 0) c._jumpCount = prev[k + 2] + (keep[k + 2] - prev[k + 2]) * alpha;
                if (c._reactorAir || prev[k + 3]) c._reactorAir = prev[k + 3] + (keep[k + 3] - prev[k + 3]) * alpha;
            } else if (keep[k] === keep[k]) {
                c._realX = keep[k]; c._realY = keep[k + 1];
                if (prev[k + 2] > 0) c._jumpCount = keep[k + 2];
                if (c._reactorAir || keep[k + 3]) c._reactorAir = keep[k + 3];
            }
        }
    },
    /** Moves `object` by the difference between character `i`'s place at alpha and now (into `_live`), kept to undo. */
    shift(object, i, withAir) {
        const keep = this._live, k = i * 4, c = this._chars[i];
        if (!object || !c || keep[k] !== keep[k] || object.matrixAutoUpdate === false) return;
        const dx = c._realX - keep[k], dz = c._realY - keep[k + 1], dy = withAir ? (c._reactorAir || 0) - keep[k + 3] : 0;
        if (!dx && !dz && !dy) return;
        const p = object.position, list = this._objects, n = this._objectCount;
        list[n] = object; list[n + 1] = p.x; list[n + 2] = p.y; list[n + 3] = p.z;
        this._objectCount = n + 4;
        p.x += dx; p.y += dy; p.z += dz;
    },
    /** This refresh's map, drawn with what the engine places where it stands at this refresh's moment. */
    draw() {
        const spriteset = this.spriteset();
        if (!spriteset) return;
        this._applied = true;
        this._objectCount = 0; this._spriteCount = 0; this._origin = null; this._cameraObject = null;
        const alpha = this.alpha(), state = spriteset._reactor3d;
        const between = alpha < 1 && this._prevCount > 0;
        if (state) {
            const camera = state.viewport.camera ? state.viewport.camera() : null;
            const sprites = spriteset._characterSprites || [];
            // The sprites over the world: where they are now, first.
            if (between && camera) this.noteSprites(sprites, sp => sp.reactor3DScreenPoint ? sp.reactor3DScreenPoint(camera, this._point || (this._point = {})) : null, true);
            if (between) {
                this.swapCharacters(alpha, true);
                const models = state.scene._modelInstances;
                if (models) for (const holder of models.values()) {
                    const i = holder.character ? this.indexOf(holder.character) : -1;
                    if (i >= 0) this.shift(holder.object, i, true);
                }
                const boards = state.scene._billboards;
                if (boards && boards.size) for (const sprite of sprites) {
                    const c = sprite && sprite._character, i = c ? this.indexOf(c) : -1;
                    if (i < 0) continue;
                    const key = typeof c.eventId === "function" ? "e" + c.eventId() : c === $gamePlayer ? "p" : "c" + (c._memberIndex != null ? c._memberIndex : -1);
                    const holder = boards.get(key);
                    if (holder) this.shift(holder.object, i, false);
                }
            }
            if (camera && between && this._cameraValid) this.easeCamera(camera, alpha);
            if (between && camera) this.moveSprites(sprite => sprite.reactor3DScreenPoint(camera, this._point));
            if (between) this.swapCharacters(alpha, false);
            spriteset.drawReactor3D(state);
            return;
        }
        if (!between) return;
        // A flat map: the scroll and the sprites.
        const map = $gameMap, sprites = spriteset._characterSprites || [];
        const screenOf = sprite => { const c = sprite._character, p = this._point || (this._point = {}); p.x = c.screenX(); p.y = c.screenY(); return p; };
        this.noteSprites(sprites, screenOf, false);
        const dx = map._displayX, dy = map._displayY;
        const jump = Math.abs(dx - this._display[0]) > this.JUMP || Math.abs(dy - this._display[1]) > this.JUMP;
        if (!jump) { map._displayX = this._display[0] + (dx - this._display[0]) * alpha; map._displayY = this._display[1] + (dy - this._display[1]) * alpha; }
        this.swapCharacters(alpha, true);
        this.moveSprites(screenOf);
        const tilemap = spriteset._tilemap, parallax = spriteset._parallax;
        this._origin = { tx: tilemap ? tilemap.origin.x : 0, ty: tilemap ? tilemap.origin.y : 0, px: parallax ? parallax.origin.x : 0, py: parallax ? parallax.origin.y : 0, tilemap, parallax };
        if (tilemap) { tilemap.origin.x = map.displayX() * map.tileWidth(); tilemap.origin.y = map.displayY() * map.tileHeight(); }
        if (parallax && parallax.bitmap && parallax.bitmap.width) { parallax.origin.x = map.parallaxOx() % parallax.bitmap.width; parallax.origin.y = map.parallaxOy() % parallax.bitmap.height; }
        this.swapCharacters(alpha, false);
        map._displayX = dx; map._displayY = dy;
    },
    /** The visible character sprites and where `pointOf` puts them now, to be moved by the difference. */
    noteSprites(sprites, pointOf) {
        const list = this._sprites, at = this._spriteAt;
        let n = 0;
        for (let i = 0; i < sprites.length; i++) {
            const sprite = sprites[i];
            if (!sprite || !sprite.visible || !sprite._character || this.indexOf(sprite._character) < 0) continue;
            const p = pointOf(sprite);
            if (!p) continue;
            if (at.length < (n + 1) * 4) { this._spriteAt = new Float64Array(at.length * 2); this._spriteAt.set(at); return this.noteSprites(sprites, pointOf); }
            list[n] = sprite; at[n * 4] = p.x; at[n * 4 + 1] = p.y; at[n * 4 + 2] = sprite.x; at[n * 4 + 3] = sprite.y;
            n++;
        }
        this._spriteCount = n;
    },
    moveSprites(pointOf) {
        const list = this._sprites, at = this._spriteAt;
        for (let i = 0; i < this._spriteCount; i++) {
            const sprite = list[i], p = pointOf(sprite);
            if (!p) continue;
            sprite.x = at[i * 4 + 2] + (p.x - at[i * 4]);
            sprite.y = at[i * 4 + 3] + (p.y - at[i * 4 + 1]);
        }
    },
    /** The camera between its pose before the update and now, unless it cut. */
    easeCamera(camera, alpha) {
        const c = this._camera, p = camera.position, q = camera.quaternion, saved = this._cameraSaved;
        saved[0] = p.x; saved[1] = p.y; saved[2] = p.z; saved[3] = q.x; saved[4] = q.y; saved[5] = q.z; saved[6] = q.w;
        const dx = p.x - c[0], dy = p.y - c[1], dz = p.z - c[2];
        let dot = q.x * c[3] + q.y * c[4] + q.z * c[5] + q.w * c[6];
        if (dx * dx + dy * dy + dz * dz > this.CAMERA_JUMP * this.CAMERA_JUMP || 2 * Math.acos(Math.min(1, Math.abs(dot))) > this.CAMERA_TURN) return;
        if (!dx && !dy && !dz && dot >= 1) return;
        this._cameraObject = camera;
        p.set(c[0] + dx * alpha, c[1] + dy * alpha, c[2] + dz * alpha);
        // Normalised linear blend along the shorter arc: within CAMERA_TURN it strays from the slerp by under a degree.
        const sign = dot < 0 ? -1 : 1;
        let x = c[3] * sign + (saved[3] - c[3] * sign) * alpha, y = c[4] * sign + (saved[4] - c[4] * sign) * alpha;
        let z = c[5] * sign + (saved[5] - c[5] * sign) * alpha, w = c[6] * sign + (saved[6] - c[6] * sign) * alpha;
        const length = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
        q.set(x / length, y / length, z / length, w / length);
        camera.updateMatrixWorld();
    },
    /** After the composite: everything the paced draw moved, back where the game put it. */
    restore() {
        if (!this._applied) return;
        this._applied = false;
        const camera = this._cameraObject;
        if (camera) {
            const s = this._cameraSaved;
            camera.position.set(s[0], s[1], s[2]);
            camera.quaternion.set(s[3], s[4], s[5], s[6]);
            camera.updateMatrixWorld();
            this._cameraObject = null;
        }
        const list = this._objects;
        for (let i = 0; i < this._objectCount; i += 4) { list[i].position.set(list[i + 1], list[i + 2], list[i + 3]); list[i] = null; }
        this._objectCount = 0;
        const sprites = this._sprites, at = this._spriteAt;
        for (let i = 0; i < this._spriteCount; i++) { sprites[i].x = at[i * 4 + 2]; sprites[i].y = at[i * 4 + 3]; sprites[i] = null; }
        this._spriteCount = 0;
        const origin = this._origin;
        if (origin) {
            if (origin.tilemap) { origin.tilemap.origin.x = origin.tx; origin.tilemap.origin.y = origin.ty; }
            if (origin.parallax) { origin.parallax.origin.x = origin.px; origin.parallax.origin.y = origin.py; }
            this._origin = null;
        }
    }
};

/** The screen refreshes ticked so far: work that may wait for a refresh with no update reads it. */
Graphics.refreshCount = 0;

Graphics._onTick = function(deltaTime) {
    const prof = ReactorProfiler._active ? ReactorProfiler : null;
    if (prof) prof.frameBegin();
    this._fpsCounter.startTick();
    // Counts the screen's refreshes (a refresh may hold no update, or several).
    this.refreshCount++;
    // The quality levels watch what each frame of a 3D map costs (reactor_3d.js, `Reactor3D.Quality`).
    const quality = typeof Reactor3D !== "undefined" && Reactor3D.Quality ? Reactor3D.Quality : null;
    if (quality) quality.tickBegin(performance.now());
    const pacing = this.FramePacing;
    pacing.begin(performance.now());
    // Resource watchdogs, driven from the runtime's own heartbeat so they
    // work no matter which manager/prototype methods plugins replace.
    // Throttled to ~1Hz.
    const nowWd = performance.now();
    if (!this._lastWatchdogSweep || nowWd - this._lastWatchdogSweep >= 1000) {
        this._lastWatchdogSweep = nowWd;
        try {
            if (window.Bitmap && Bitmap._sweepStalledLoads) Bitmap._sweepStalledLoads();
            if (window.WebAudio && WebAudio._sweepStalledLoads) WebAudio._sweepStalledLoads();
            if (window.DataManager && DataManager._checkStalledDataFiles) DataManager._checkStalledDataFiles();
        } catch (e) {
            console.warn("Graphics._onTick: watchdog sweep threw", e);
        }
    }
    let updates;
    if (this._tickHandler) {
        // v5/v6/v7: callback receives delta as a number.
        // v8: callback receives the Ticker instance; extract its deltaTime.
        const dt =
            typeof deltaTime === "number"
                ? deltaTime
                : (deltaTime && typeof deltaTime.deltaTime === "number"
                    ? deltaTime.deltaTime
                    : 1);
        const tUpdate = prof ? performance.now() : 0;
        updates = this._tickHandler(dt);
        // Send any batched canvas->GPU uploads now that the frame's drawing is
        // done. pixi_compat also flushes from render(), but plugins that do
        // their own GL work outside a PIXI render pass (LeTBS/MOG popups,
        // Effekseer) would otherwise sample a texture whose pixels had not
        // been uploaded yet.
        if (window.PIXI && PIXI.__reactorFlushTextureUploads) {
            PIXI.__reactorFlushTextureUploads();
        }
        if (prof) prof.phase("update", performance.now() - tUpdate);
    }
    // On a screen 60 does not divide, the map is drawn on the refreshes the pacing picks, between updates.
    const paced = pacing.decide(updates);
    if (this._canRender() && (paced === pacing.DRAW || (paced !== pacing.SKIP && this._frameChanged(updates))
        || (paced === pacing.SKIP && this._mustComposite()))) {
        const tRender = prof ? performance.now() : 0;
        if (paced === pacing.DRAW) pacing.draw();
        // Draws from here to the composite are its own (Graphics._frameChanged).
        this._compositing = true;
        try {
            for (const hook of this._reactorBeforeRender) {
                try { hook(); } catch (e) { console.warn("Graphics._onTick: a before-render hook threw", e); }
            }
            this._app.render();
        } finally { this._compositing = false; }
        this._noteComposite();
        if (prof) prof.phase("render", performance.now() - tRender);
        // v8: Sprite_Animation._render runs via the onRender bridge, which v8
        // invokes BEFORE the actual GPU draws happen. Effekseer's draws would
        // therefore be overwritten by v8's subsequent rendering. Instead, on
        // v8, Sprite_Animation._render registers the instance in a class-level
        // queue and we flush that queue here -- AFTER v8's render() returns --
        // so Effekseer draws on top of the rendered scene.
        if (window.Sprite_Animation &&
            typeof window.Sprite_Animation.renderActive === "function") {
            try {
                window.Sprite_Animation.renderActive(this._app.renderer);
            } catch (e) {
                console.warn("Graphics._onTick: renderActive threw", e);
            }
        }
    }
    // The paced draw's places given back before the next update.
    if (paced === pacing.DRAW) pacing.restore();
    this._fpsCounter.endTick();
    if (quality) quality.tickEnd(performance.now());
    if (prof) prof.frameEnd();
};

/** A composite owed whatever the pacing says: the first, a new stage, or one asked for. */
Graphics._mustComposite = function() {
    const last = this._lastComposite;
    return !last || this._redrawWanted || last.stage !== this._app.stage;
};

//-----------------------------------------------------------------------------
/**
 * The in-game frame profiler (F10 to start/stop). While recording it times
 * each frame's phases and keeps a detailed record of every frame over
 * `frameThreshold` ms, plus between-frame stalls over `gapThreshold` ms
 * (main-thread work outside the game loop: GC, plugin timers, decodes).
 * Stopping writes `save/reactor-profile.json` and logs a console summary.
 * Costs nothing until first activated.
 *
 * @namespace
 */
function ReactorProfiler() {
    throw new Error("This is a static class");
}

ReactorProfiler._active = false;
ReactorProfiler._installed = false;
ReactorProfiler._spikes = [];
ReactorProfiler.frameThreshold = 20;
ReactorProfiler.gapThreshold = 30;

ReactorProfiler.toggle = function() {
    if (this._active) {
        this.stop();
    } else {
        this.start();
    }
};

ReactorProfiler.start = function() {
    if (!this._installed) {
        this._install();
    }
    this._t0 = performance.now();
    this._lastFrameEnd = 0;
    this._lastHeap = 0;
    this._frames = 0;
    this._sumMs = 0;
    this._worst = 0;
    this._spikes = [];
    this._acc = {};
    this._hits = {};
    this._active = true;
    console.info(
        "[ReactorProfiler] Recording frame timings... " +
            "press F10 again to stop and save the report."
    );
};

ReactorProfiler.stop = function() {
    this._active = false;
    return this.dump();
};

ReactorProfiler.frameBegin = function() {
    this._acc = {};
    this._hits = {};
    this._frameStart = performance.now();
};

ReactorProfiler.phase = function(name, ms) {
    this._acc[name] = (this._acc[name] || 0) + ms;
};

ReactorProfiler.frameEnd = function() {
    const now = performance.now();
    const total = now - this._frameStart;
    const gap = this._lastFrameEnd ? this._frameStart - this._lastFrameEnd : 0;
    this._lastFrameEnd = now;
    this._frames++;
    this._sumMs += total;
    if (total > this._worst) this._worst = total;
    const heap = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const heapDelta = this._lastHeap ? heap - this._lastHeap : 0;
    this._lastHeap = heap;
    const isSpike = total > this.frameThreshold || gap > this.gapThreshold;
    if (isSpike && this._spikes.length < 400) {
        const phases = {};
        for (const key in this._acc) {
            phases[key] = Math.round(this._acc[key] * 10) / 10;
        }
        const record = {
            at: Math.round(now - this._t0) / 1000,
            totalMs: Math.round(total * 10) / 10,
            gapMs: Math.round(gap * 10) / 10,
            phases: phases,
            counts: Object.assign({}, this._hits),
            heapMB: Math.round(heap / 104857.6) / 10,
            heapDeltaMB: Math.round(heapDelta / 104857.6) / 10
        };
        try {
            const scene = SceneManager._scene;
            record.scene = scene ? scene.constructor.name : "";
            if (window.$gameMap && window.$gamePlayer && scene &&
                window.Scene_Map && scene instanceof Scene_Map) {
                record.mapId = $gameMap.mapId();
                record.playerX = $gamePlayer.x;
                record.playerY = $gamePlayer.y;
            }
            const sset = scene && scene._spriteset;
            if (sset && sset._animationSprites) {
                record.animSprites = sset._animationSprites.length;
            }
        } catch (e) { /* scene info is best-effort */ }
        this._spikes.push(record);
    }
};

// Wraps hot methods so their time accumulates into a named phase while the
// profiler is active. Installed lazily on first F10, so plugin replacements
// of these methods are what actually get timed.
ReactorProfiler._wrap = function(proto, method, phaseName) {
    if (!proto || typeof proto[method] !== "function") return;
    const original = proto[method];
    const profiler = this;
    proto[method] = function() {
        if (!profiler._active) {
            return original.apply(this, arguments);
        }
        const t = performance.now();
        try {
            return original.apply(this, arguments);
        } finally {
            const ms = performance.now() - t;
            profiler._acc[phaseName] = (profiler._acc[phaseName] || 0) + ms;
            profiler._hits[phaseName] = (profiler._hits[phaseName] || 0) + 1;
        }
    };
    // Code that checks for plugin replacements (Tilemap.ChunkPaint) sees through the timer.
    proto[method].__rrProfilerOriginal = original;
};

ReactorProfiler._install = function() {
    this._installed = true;
    const targets = [
        [window.Game_Map, "update", "gameMapUpdate"],
        [window.Game_Map, "updateEvents", "mapEvents"],
        [window.Game_Map, "updateInterpreter", "interpreter"],
        [window.Game_Screen, "update", "screenEffects"],
        [window.Spriteset_Map, "update", "spriteset"],
        [window.Spriteset_Map, "updateOffscreenCulling", "culling"],
        [window.Tilemap, "_addAllSpots", "tilePaint"],
        [window.Tilemap, "_sortChildren", "tileSort"],
        [window.Bitmap, "_onLoad", "imgDecode"],
        [window.Window_Base, "update", "windows"],
        [window.Sprite_Character, "update", "charSprites"],
        // Battle-scene counterparts. Without these the whole battle update
        // tree lands in the unattributed remainder of "update": the "windows"
        // phase only covers Window_Base's own update body, so a subclass that
        // redraws its contents from its own update (victory gauge count-ups)
        // was invisible.
        [window.Scene_Battle, "update", "sceneBattle"],
        [window.Spriteset_Battle, "update", "spritesetBattle"],
        // Content drawing, which windows perform outside their update body.
        // getPixel is called out separately because every text colour lookup
        // goes through it and allocates a one-pixel ImageData.
        [window.Window_Base, "drawTextEx", "drawTextEx"],
        [window.Bitmap, "drawText", "bitmapDrawText"],
        // Split drawText so its cost is attributable: outlining strokes the
        // glyph path and is typically several times the cost of the fill.
        // Whatever bitmapDrawText has left over after these two is the
        // per-call overhead — font parsing, save/restore, and the texture
        // update every draw op issues.
        [window.Bitmap, "_drawTextOutline", "textOutline"],
        [window.Bitmap, "_drawTextBody", "textBody"],
        [window.Bitmap, "getPixel", "bitmapGetPixel"],
        [window.Bitmap, "blt", "bitmapBlt"],
        [window.Bitmap, "gradientFillRect", "bitmapGradient"]
    ];
    for (const [klass, method, phaseName] of targets) {
        this._wrap(klass && klass.prototype, method, phaseName);
    }
    // Battle-side phases. BattleManager is a static class (wrap the object
    // itself); LeTBS's tactical AI, when present, gets its own phases so
    // enemy-turn spikes attribute to the responsible stage.
    if (window.BattleManager) {
        this._wrap(window.BattleManager, "update", "battleManager");
    }
    if (window.BattleManagerTBS) {
        this._wrap(window.BattleManagerTBS, "update", "tbsUpdate");
        for (const method of ["updatePhase", "updateTBSObjects",
            "updateBattlers", "updateTBSEvents", "makeMoveScope",
            "makeActionScope", "getScopeFromData", "getEntitiesInScope",
            "updateSequences", "checkSubPhase", "executeAction",
            "startTurn", "setCursorCell", "makePathScope",
            "closestWalkableCellTo", "farthestWalkableCellTo"]) {
            this._wrap(window.BattleManagerTBS, method, "tbs:" + method);
        }
    }
    if (window.TBSAiManager && TBSAiManager.prototype) {
        if (TBSAiManager.prototype.getAoEPossibleMoves) {
            this._wrap(TBSAiManager.prototype, "getAoEPossibleMoves", "tbsAi:aoeMoves");
        }
        for (const method of ["update", "runCommand", "updateRunningCommand",
            "getFocusedEntities"]) {
            this._wrap(TBSAiManager.prototype, method, "tbsAi:" + method);
        }
    }
    if (window.TBSAiManager && TBSAiManager.prototype) {
        const aiMethods = [
            "process", "makeOffenseData", "makeHealingData",
            "makeSupportData", "makeMoveData", "makeSummonData",
            "updateOffenseActionsBuilding", "updateHealingActionsBuilding",
            "updateSupportActionsBuilding", "updateMoveActionsBuilding",
            "updateSummonActionsBuilding", "makeActionData"
        ];
        for (const method of aiMethods) {
            this._wrap(TBSAiManager.prototype, method, "tbsAi:" + method);
        }
    }
};

ReactorProfiler.dump = function() {
    const elapsed = (performance.now() - this._t0) / 1000;
    const report = {
        recordedAt: new Date().toISOString(),
        seconds: Math.round(elapsed * 10) / 10,
        frames: this._frames,
        avgFrameMs: this._frames
            ? Math.round((this._sumMs / this._frames) * 100) / 100
            : 0,
        worstFrameMs: Math.round(this._worst * 10) / 10,
        frameThresholdMs: this.frameThreshold,
        gapThresholdMs: this.gapThreshold,
        spikeCount: this._spikes.length,
        spikes: this._spikes
    };
    console.info(
        "[ReactorProfiler] " + report.frames + " frames over " +
            report.seconds + "s, avg " + report.avgFrameMs + "ms, worst " +
            report.worstFrameMs + "ms, " + report.spikeCount + " spike(s)."
    );
    const worst = this._spikes
        .slice()
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, 10);
    for (const spike of worst) {
        console.info("[ReactorProfiler spike] " + JSON.stringify(spike));
    }
    let destination = "";
    try {
        const fs = require("fs");
        let dir = "";
        if (window.StorageManager) {
            if (StorageManager.fileDirectoryPath) {
                dir = StorageManager.fileDirectoryPath();
            } else if (StorageManager.localFileDirectoryPath) {
                dir = StorageManager.localFileDirectoryPath();
            }
        }
        if (dir) {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir);
            destination = dir + "reactor-profile.json";
            fs.writeFileSync(destination, JSON.stringify(report, null, 2));
        }
    } catch (e) {
        console.warn("[ReactorProfiler] could not write the report file", e);
        destination = "";
    }
    if (destination) {
        console.info("[ReactorProfiler] report written to " + destination);
    } else {
        console.info(
            "[ReactorProfiler] full report:\n" + JSON.stringify(report)
        );
    }
    return report;
};

window.$reactorProfiler = ReactorProfiler;

//-----------------------------------------------------------------------------
/**
 * The runtime's battle event feed: a read-only, synchronous notification
 * channel the engine emits into at fixed points of a battle — start and end,
 * turns, actions, HP/MP/TP changes, death, revival, state changes — so that a
 * plugin which only needs to OBSERVE combat can subscribe here instead of
 * wrapping a dozen prototype methods it never meant to change.
 *
 * Additive by design. Nothing existing is routed through it: every wrapper a
 * plugin already installs on `Game_Action.prototype.apply` or
 * `Game_Battler.prototype.gainHp` runs exactly as before, and a listener's
 * return value is ignored, so a subscriber cannot alter an outcome — that is
 * still what the prototype chain is for. Listeners run in subscription order.
 * A listener that throws is reported on the console and skipped, and the ones
 * after it still run, because a statistics plugin's bug must not end a battle.
 * Costs one property read per emit point while nobody is listening.
 *
 * The event names, their payloads and their exact emit points are documented
 * in `docs/RUNTIME-EVENTS.md`, and a test holds that document and this source
 * to the same list, so neither can drift from the other.
 *
 *     const off = ReactorEvents.on("hpChanged", ({ battler, delta }) => {
 *         if (battler.isActor() && delta < 0) tally(battler, -delta);
 *     });
 *     off(); // unsubscribe
 *
 * @namespace
 */
function ReactorEvents() {
    throw new Error("This is a static class");
}

ReactorEvents._listeners = Object.create(null);

/**
 * Subscribes `listener` to the event `name`. Returns a function that removes
 * exactly this subscription — the tidy way to unsubscribe a closure.
 *
 * @param {string} name
 * @param {function(object)} listener Receives the event's payload object.
 * @returns {function()} Call to unsubscribe.
 */
ReactorEvents.on = function(name, listener) {
    if (typeof listener !== "function") {
        throw new TypeError("ReactorEvents.on: listener must be a function");
    }
    const list = this._listeners[name] || (this._listeners[name] = []);
    list.push(listener);
    return () => this.off(name, listener);
};

/**
 * Subscribes for one delivery only; the subscription removes itself before
 * the listener runs.
 *
 * @param {string} name
 * @param {function(object)} listener
 * @returns {function()} Call to unsubscribe early.
 */
ReactorEvents.once = function(name, listener) {
    const off = this.on(name, payload => {
        off();
        listener(payload);
    });
    return off;
};

/**
 * Removes one subscription. Removing a listener that is not subscribed is a
 * no-op. Removing from inside a listener takes effect for the next emit, not
 * for the one in flight.
 *
 * @param {string} name
 * @param {function(object)} listener
 */
ReactorEvents.off = function(name, listener) {
    const list = this._listeners[name];
    if (!list) return;
    const index = list.indexOf(listener);
    if (index >= 0) list.splice(index, 1);
    if (list.length === 0) delete this._listeners[name];
};

/**
 * Delivers `payload` to every listener of `name`, in subscription order. The
 * engine calls this at its emit points. A plugin may emit its own events too,
 * and should prefix their names so they cannot collide with the runtime's.
 *
 * @param {string} name
 * @param {object} payload Passed to each listener as its only argument.
 */
ReactorEvents.emit = function(name, payload) {
    const list = this._listeners[name];
    if (!list) return;
    // Snapshot, so a listener subscribing or unsubscribing mid-dispatch
    // neither skips a neighbour nor receives the event it just asked for.
    const listeners = list.slice();
    for (const listener of listeners) {
        try {
            listener(payload);
        } catch (e) {
            console.error("[ReactorEvents] listener for \"" + name + "\" threw", e);
        }
    }
};

/**
 * How many listeners `name` has right now.
 *
 * @param {string} name
 * @returns {number}
 */
ReactorEvents.listenerCount = function(name) {
    const list = this._listeners[name];
    return list ? list.length : 0;
};

/**
 * Drops every listener of `name`, or of every event when called with no name.
 * For tests and hot-reload tooling; the engine never calls it.
 *
 * @param {string} [name]
 */
ReactorEvents.clear = function(name) {
    if (name === undefined) {
        this._listeners = Object.create(null);
    } else {
        delete this._listeners[name];
    }
};

window.$reactorEvents = ReactorEvents;

// Console helper: dump the live animation sprites of the current scene —
// count, animation id/name, rate, remaining duration, drawn cells, and a
// sample of cell opacities. For diagnosing looping-animation stacking or
// opacity drift the moment it is visible on screen.
window.$reactorAnimStats = function() {
    const scene = SceneManager._scene;
    if (!scene) return "no scene";
    const sset = scene._spriteset;
    const rows = [];
    const describe = function(sprite, source) {
        rows.push({
            source: source,
            anim: sprite._animation
                ? sprite._animation.id + ":" + (sprite._animation.name || "")
                : "?",
            rate: sprite._rate,
            duration: sprite._duration,
            loop: !!sprite._isLoopAnim,
            drawnCells: (sprite._cellSprites || [])
                .filter(c => c.visible && c.bitmap).length,
            x: Math.round(sprite.x),
            y: Math.round(sprite.y),
            targets: sprite._targets ? sprite._targets.length : "-"
        });
    };
    if (sset && sset._animationSprites) {
        for (const sprite of sset._animationSprites) {
            describe(sprite, "spriteset");
        }
    }
    // Host-based animations (MV-style: character/battler/LeTBS entity
    // sprites keep their own _animationSprites lists outside the spriteset).
    const seen = new Set();
    const scan = function(node) {
        if (!node || seen.has(node)) return;
        seen.add(node);
        if (node._animationSprites && node !== sset &&
            node._animationSprites.length) {
            let label = node.constructor.name;
            if (node._battler && node._battler.name) {
                label += "(" + node._battler.name() + ")";
            } else if (node._entity && node._entity.battler) {
                try { label += "(" + node._entity.battler().name() + ")"; } catch (e) {}
            } else if (node._character && node._character._eventId) {
                label += "(ev" + node._character._eventId + ")";
            }
            for (const sprite of node._animationSprites) {
                describe(sprite, label);
            }
        }
        if (node.children) node.children.forEach(scan);
    };
    scan(scene);
    if (console.table) console.table(rows);
    else console.log(JSON.stringify(rows, null, 1));
    return rows.length + " animation sprite(s)";
};

// Console helper: arm a watcher on one animation id that logs every change
// in how many copies are alive (with host, remaining duration, position) —
// for catching transient duplicates without reflex-timing a manual dump.
// `$reactorAnimWatch(403)` arms it; `$reactorAnimWatch()` stops and dumps.
window.$reactorAnimWatch = function(animId) {
    if (window.__rrAnimWatch) {
        const watch = window.__rrAnimWatch;
        clearInterval(watch.timer);
        window.__rrAnimWatch = null;
        console.log("[AnimWatch] transition log:");
        console.log(JSON.stringify(watch.log, null, 1));
        return watch.log.length + " transition(s) logged";
    }
    if (!animId) return "usage: $reactorAnimWatch(animationId)";
    const watch = { id: animId, last: -1, log: [] };
    watch.timer = setInterval(function() {
        try {
            const scene = SceneManager._scene;
            if (!scene) return;
            const found = [];
            const seen = new Set();
            (function scan(node) {
                if (!node || seen.has(node)) return;
                seen.add(node);
                if (node._animationSprites) {
                    for (const sprite of node._animationSprites) {
                        if (sprite._animation && sprite._animation.id === watch.id) {
                            let label = node.constructor.name;
                            try {
                                if (node._battler && node._battler.name) {
                                    label += "(" + node._battler.name() + ")";
                                } else if (node._entity && node._entity.battler) {
                                    label += "(" + node._entity.battler().name() + ")";
                                }
                            } catch (e) {}
                            found.push({
                                host: label,
                                d: sprite._duration,
                                x: Math.round(sprite.x),
                                y: Math.round(sprite.y)
                            });
                        }
                    }
                }
                if (node.children) node.children.forEach(scan);
            })(scene);
            if (found.length !== watch.last) {
                const entry = {
                    tick: Graphics.frameCount,
                    count: found.length,
                    sprites: found
                };
                watch.log.push(entry);
                if (watch.log.length > 60) watch.log.shift();
                console.log("[AnimWatch " + watch.id + "] " + watch.last +
                    " -> " + found.length + " " + JSON.stringify(found));
                watch.last = found.length;
            }
        } catch (e) { /* keep watching */ }
    }, 16);
    window.__rrAnimWatch = watch;
    console.info("[AnimWatch] watching animation " + animId +
        " — run $reactorAnimWatch() again to stop and dump the log.");
    return "watching " + animId;
};

Graphics._canRender = function() {
    return !!this._app.stage;
};

/**
 * Backing-store scale for the game canvas: how many physical pixels back one
 * game pixel on screen. Fullscreen used to stretch the finished frame with
 * the browser's bilinear filter — a blur layer over the whole game. Rendering
 * the backing store at the on-screen size instead leaves nothing to stretch:
 * 3D geometry comes out native-sharp while UI bitmaps (windows, text,
 * pictures) still enlarge through the GPU's smooth sampling and look exactly
 * as soft as before. 1 when the frame is not enlarged — shrinking keeps a 1:1
 * store — and capped so a video wall cannot demand an enormous framebuffer.
 */
Graphics.canvasPixelRatio = function() {
    if (typeof $dataSystem !== "undefined" && $dataSystem?.advanced?.pixelatedRendering === true) return 1;
    // The display's own scale counts: on a desktop scaled to 125% or 150%
    // a CSS pixel is more than one screen pixel, and a store sized in CSS
    // pixels was enlarged by the compositor's smooth filter — a blur over
    // the whole game, in a window and in fullscreen alike, on exactly the
    // laptops that ship scaled.
    const scale = (this._realScale || 1) * this.displayPixelRatio();
    return Math.max(1, Math.min(scale, this.maxCanvasPixelRatio || 4));
};

/** Screen pixels per CSS pixel, 1 when the browser does not say. */
Graphics.displayPixelRatio = function() {
    const ratio = typeof window !== "undefined" ? window.devicePixelRatio : 1;
    return ratio > 0 ? ratio : 1;
};

/**
 * Ceiling for the backing-store scale. The canvas draws at the screen's
 * own resolution, so windows, text and pictures enlarge smoothly as they
 * always have; the 3D passes inside it draw at game size and are enlarged
 * pixel for pixel (`Reactor3D.maxPassPixelRatio`), which is where the
 * sharpness the owner asked for comes from. Capped so a video wall cannot
 * demand an enormous framebuffer. A weak GPU takes 1 (below): there the
 * whole frame is rendered at game size and enlarged as hard-edged blocks,
 * the 2D layer included, because the saving has to include it.
 */
Graphics.maxCanvasPixelRatio = 4;

/**
 * The same ceiling for a weak GPU: one, so the frame is rendered at game
 * size however large the window is, and enlarged by the nearest-neighbour
 * filter below rather than the browser's smooth one. A 1280x720 frame
 * stretched to 1080p that way keeps every rendered pixel a hard-edged
 * block — it reads as sharp, the way a lower resolution on a CRT did —
 * for a fraction of what drawing the 3D passes at 1920x1080 costs.
 */
Graphics.weakMaxCanvasPixelRatio = 1;

/**
 * How the finished frame is enlarged when the window is bigger than the
 * backing store. "nearest" keeps every rendered pixel a hard-edged block;
 * "linear" is the browser's smooth stretch, which lays a blur over the
 * whole game; "auto" is nearest on a weak GPU (whose store stays at game
 * size and so is always enlarged in a big window) and linear elsewhere
 * (where the store already matches the screen and nothing is enlarged
 * until the ratio's ceiling). The world's own sharpness does not depend
 * on this: the 3D passes are enlarged pixel for pixel inside the frame on
 * every GPU (`Reactor3D.maxPassPixelRatio`). A script or plugin sets it at
 * any time; the next resize or fullscreen switch applies it.
 */
Graphics.upscaleFilter = "auto";

/** Whether the canvas is shown larger than its backing store. */
Graphics.isUpscaled = function() {
    return (this._realScale || 1) * this.displayPixelRatio() > this.canvasPixelRatio() + 0.001;
};

/** The filter the setting resolves to right now. */
Graphics.upscaleFilterInUse = function() {
    if (typeof $dataSystem !== "undefined" && $dataSystem?.advanced?.pixelatedRendering === true) return "nearest";
    if (this.upscaleFilter === "nearest" || this.upscaleFilter === "linear") return this.upscaleFilter;
    return this.gpuTier === "weak" ? "nearest" : "linear";
};

/**
 * One line saying how the frame reaches the screen right now: the canvas
 * store and its ratio, the 3D pass size and its filter, the display scale
 * and the GPU tier. Logged at debug level whenever it changes (a resize,
 * F4), so a report of "it looks blurry" can carry the numbers.
 */
Graphics.scalingReport = function() {
    const real = this._realScale || 1;
    const dpr = this.displayPixelRatio();
    const ratio = this.canvasPixelRatio();
    const canvas = this._canvas;
    const viewport = typeof Reactor3D !== "undefined" && Reactor3D.viewport ? Reactor3D.viewport() : null;
    const pass = viewport && viewport.targetSize ? viewport.targetSize() : null;
    const enlarged = viewport && viewport.passEnlarged ? viewport.passEnlarged() : false;
    return "RPG Reactor scaling: window " + Math.round(this._width * real * dpr) + "x" + Math.round(this._height * real * dpr) + " screen px (scale " + real.toFixed(2) + ", display " + dpr.toFixed(2) + "x)"
        + " | canvas store " + (canvas ? canvas.width + "x" + canvas.height : "?") + " at " + ratio.toFixed(2) + "x, enlarged " + (this.isUpscaled() ? this.upscaleFilterInUse() : "no")
        + " | 3D pass " + (pass ? pass.width + "x" + pass.height : "?") + (enlarged ? " nearest into the store" : " 1:1")
        + (typeof Reactor3D !== "undefined" ? ", MSAA " + (Reactor3D.samplesForScale ? Reactor3D.samplesForScale(1) : Reactor3D.renderTargetSamples) : "")
        + " | tier " + (this.gpuTier || "?") + (this.gpuDescription ? " (" + String(this.gpuDescription).replace(/^ANGLE \(/, "").replace(/\)$/, "").slice(0, 80) + ")" : "")
        + " | " + (typeof RPG_REACTOR_RUNTIME_REVISION !== "undefined" ? RPG_REACTOR_RUNTIME_REVISION : "");
};

/** Give an on-screen canvas the enlargement filter in use, or none when it is not enlarged. */
Graphics._applyUpscaleFilter = function(element) {
    if (!element || !element.style) return;
    const nearest = this.isUpscaled() && this.upscaleFilterInUse() === "nearest";
    element.style.imageRendering = nearest ? "pixelated" : "auto";
};

/**
 * The GPU's class, read once from the renderer string when the app is
 * created: "weak" for integrated and software renderers, "full" otherwise,
 * "unknown" when the string cannot be read. A weak GPU keeps the 3D passes
 * at one backing pixel per screen pixel and two-sample antialiasing: on an
 * Intel UHD or a phone GPU the stretched-window defaults meant three
 * multisampled render targets at up to sixteen times the pixel area, which
 * is the difference between a playable map and a slideshow. A capable GPU
 * keeps sharp-first exactly as before. `Graphics.gpuTierOverride = "full"`
 * (or "weak") in a plugin pins the choice.
 */
Graphics.gpuTier = "unknown";
Graphics.gpuTierOverride = null;
Graphics.weakGpuPattern = /\b(Intel|UHD|Iris|HD Graphics|Mali|Adreno|PowerVR|VideoCore|SwiftShader|llvmpipe|Software|Microsoft Basic Render|Mesa)\b/i;
/**
 * AMD's integrated parts, which the list above missed entirely — the most
 * common integrated GPU family after Intel's, and the one every Ryzen laptop
 * and handheld ships. They are named for the die, not the class: a Ryzen
 * 5650U reports `ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11
 * ...)`, a 4700U `Radeon(TM) Vega 8 Graphics`, a Steam Deck `AMD Custom GPU
 * 0405`. All of them end in "Graphics" or name a Vega/APU die, where every
 * discrete Radeon names a model instead — `Radeon RX 6700 XT`, `Radeon Pro
 * W6800`, `Radeon R9 380` — so matching the trailing "Graphics" separates
 * them without demoting a real card. On Linux, Mesa names an APU for
 * its processor (`AMD Ryzen 9 9950X3D 16-Core Processor (radeonsi
 * raphael_mendocino ...)`); a discrete card is always named for itself.
 */
Graphics.weakAmdPattern = /\bRadeon(?:\s*\(TM\))?(?:\s+(?:RX\s+)?Vega\s*\d*)?\s+Graphics\b|\bVega\s*\d+\s+Graphics\b|\bAMD Custom GPU\b|\bRadeon\(TM\)\s+R[2-7]\b|\bRyzen\b[^()]*\bProcessor\b/i;

Graphics._sampleGpuTier = function(renderer) {
    let description = "";
    try {
        const gl = renderer && (renderer.gl || (renderer.context && renderer.context.gl));
        // Reactor3D reads the same string for the editor, which has no
        // Graphics; one reader, so the two hosts cannot disagree about what
        // a renderer is called.
        if (gl && typeof Reactor3D !== "undefined" && Reactor3D.rendererDescription) {
            description = Reactor3D.rendererDescription(gl);
        } else if (gl) {
            const info = gl.getExtension("WEBGL_debug_renderer_info");
            description = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || "");
        }
    } catch (e) {
        description = "";
    }
    this.gpuDescription = description;
    // And one classifier, for the same reason. The patterns above stay the
    // canonical pair; `Reactor3D.classifyGpu` reads them when Graphics is
    // present and falls back to its own copies only in the editor.
    const classified = typeof Reactor3D !== "undefined" && Reactor3D.classifyGpu
        ? Reactor3D.classifyGpu(description)
        : (!description ? "unknown"
            : ((this.weakGpuPattern.test(description) || this.weakAmdPattern.test(description)) ? "weak" : "full"));
    const tier = this.gpuTierOverride || classified;
    this.gpuTier = tier;
    if (tier === "weak") {
        // A weak GPU keeps its sharpness and gives up its edge smoothing,
        // not the other way round. Rendering at game size and letting the
        // browser's smooth filter stretch the frame laid a blur over the
        // whole scene in a big window, which reads far worse than aliasing
        // on a hard edge. The frame is still rendered at game size — that
        // is the whole saving — but enlarged pixel for pixel (see
        // `upscaleFilter`), so it stays sharp; and multisampling stops,
        // because a 1280x720 pass at 4x is 3.7M samples where the same pass
        // at 1x is 0.9M.
        this.maxCanvasPixelRatio = Math.min(this.maxCanvasPixelRatio, this.weakMaxCanvasPixelRatio);
        if (typeof Reactor3D !== "undefined" && Reactor3D.renderTargetSamples > 0) Reactor3D.renderTargetSamples = 0;
    }
    // The tier decides the enlargement filter; a canvas already on screen
    // takes it now rather than at the next resize.
    if (this._canvas) this._applyUpscaleFilter(this._canvas);
    return tier;
};

Graphics._updateRealScale = function() {
    if (this._stretchEnabled && this._width > 0 && this._height > 0) {
        const h = this._stretchWidth() / this._width;
        const v = this._stretchHeight() / this._height;
        this._realScale = Math.min(h, v);
        window.scrollTo(0, 0);
    } else {
        this._realScale = this._defaultScale;
    }
};

Graphics._stretchWidth = function() {
    if (Utils.isMobileDevice()) {
        return document.documentElement.clientWidth;
    } else {
        return window.innerWidth;
    }
};

Graphics._stretchHeight = function() {
    if (Utils.isMobileDevice()) {
        // [Note] Mobile browsers often have special operations at the top and
        //   bottom of the screen.
        const rate = Utils.isLocal() ? 1.0 : 0.9;
        return document.documentElement.clientHeight * rate;
    } else {
        return window.innerHeight;
    }
};

Graphics._makeErrorHtml = function(name, message /*, error*/) {
    const nameDiv = document.createElement("div");
    const messageDiv = document.createElement("div");
    nameDiv.id = "errorName";
    messageDiv.id = "errorMessage";
    nameDiv.innerHTML = Utils.escapeHtml(name || "");
    messageDiv.innerHTML = Utils.escapeHtml(message || "");
    return nameDiv.outerHTML + messageDiv.outerHTML;
};

Graphics._defaultStretchMode = function() {
    // Everywhere, not just NW.js and mobile: a browser playtest (itch embed
    // included) opened at native game size and stayed small until someone
    // discovered F3. The game fills whatever window it is given from the
    // first frame; F3 still toggles back to 1:1.
    return true;
};

Graphics._createErrorPrinter = function() {
    this._errorPrinter = document.createElement("div");
    this._errorPrinter.id = "errorPrinter";
    this._errorPrinter.innerHTML = this._makeErrorHtml();
    document.body.appendChild(this._errorPrinter);
};

Graphics._updateErrorPrinter = function() {
    const width = this._width * 0.8 * this._realScale;
    const height = 100 * this._realScale;
    this._errorPrinter.style.width = width + "px";
    this._errorPrinter.style.height = height + "px";
};

Graphics._createCanvas = function() {
    this._canvas = document.createElement("canvas");
    this._canvas.id = "gameCanvas";
    this._updateCanvas();
    document.body.appendChild(this._canvas);
    // Overlay canvas for Effekseer's own WebGL1 context. Effekseer's drawHandle
    // is a silent no-op on v8's WebGL2 context (proven via full-canvas pixel
    // diff: zero pixels written, zero GL errors). Giving Effekseer its own
    // WebGL1 context — same recipe the editor's AnimationPicker uses — bypasses
    // the v8/WebGL2 incompatibility. The browser compositor layers this
    // transparent canvas over the game canvas naturally.
    this._effekseerCanvas = document.createElement("canvas");
    this._effekseerCanvas.id = "effekseerOverlay";
    this._effekseerCanvas.style.pointerEvents = "none";
    this._updateEffekseerCanvas();
    document.body.appendChild(this._effekseerCanvas);
};

Graphics._updateCanvas = function() {
    if (this._app && this._app.renderer) {
        // The renderer owns the backing store: at pixel ratios above 1 the
        // canvas holds ratio-times the game size and PIXI renders into all of
        // it, so the CSS stretch below is 1:1 with physical pixels. One call
        // carries the resolution — assigning `.resolution` first and resizing
        // second walks the target system through a half-updated state that
        // the filter pipeline crashed on (F4 spam with a screen tint active).
        this._app.renderer.resize(this._width, this._height, this.canvasPixelRatio());
    } else {
        this._canvas.width = this._width;
        this._canvas.height = this._height;
    }
    // A resized canvas is a cleared one.
    this._redrawWanted = true;
    this._canvas.style.zIndex = 1;
    this._centerElement(this._canvas);
    // _centerElement sizes from the backing store, which the ratio inflated;
    // the on-screen size is always the game size times the display scale.
    this._canvas.style.width = this._width * this._realScale + "px";
    this._canvas.style.height = this._height * this._realScale + "px";
    this._applyUpscaleFilter(this._canvas);
    this._updateEffekseerCanvas();
    // Say what changed, once per change, at debug level so the console stays
    // quiet unless someone is chasing a "looks blurry" report.
    try {
        const report = this.scalingReport();
        if (report !== this._lastScalingReport) {
            this._lastScalingReport = report;
            console.debug(report);
        }
    } catch (e) { /* the report is a convenience */ }
};

/**
 * Show the Effekseer overlay only while it carries screen effects. A hidden
 * canvas still draws into its buffer (the in-scene effects are drawn there and
 * copied out), but the compositor stops blending a full-screen transparent
 * layer over the game every frame. Only a change touches the style.
 */
Graphics.showEffekseerOverlay = function(visible) {
    const overlay = this._effekseerCanvas;
    if (!overlay || this._effekseerOverlayShown === visible) return;
    this._effekseerOverlayShown = visible;
    overlay.style.visibility = visible ? "visible" : "hidden";
};

Graphics._updateEffekseerCanvas = function() {
    if (!this._effekseerCanvas) return;
    this._effekseerCanvas.width = this._width;
    this._effekseerCanvas.height = this._height;
    // z-index 2 = above game canvas (z=1), below loading spinner / video.
    this._effekseerCanvas.style.zIndex = 2;
    this._centerElement(this._effekseerCanvas);
    // The same enlargement as the frame beneath it, or the effects would
    // sit smooth over a sharp world.
    this._applyUpscaleFilter(this._effekseerCanvas);
};

Graphics._updateVideo = function() {
    const width = this._width * this._realScale;
    const height = this._height * this._realScale;
    Video.resize(width, height);
};

Graphics._createLoadingSpinner = function() {
    const loadingSpinner = document.createElement("div");
    const loadingSpinnerImage = document.createElement("div");
    loadingSpinner.id = "loadingSpinner";
    loadingSpinnerImage.id = "loadingSpinnerImage";
    loadingSpinner.appendChild(loadingSpinnerImage);
    this._loadingSpinner = loadingSpinner;
};

Graphics._createFPSCounter = function() {
    this._fpsCounter = new Graphics.FPSCounter();
};

Graphics._centerElement = function(element) {
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
};

Graphics._disableContextMenu = function() {
    const elements = document.body.getElementsByTagName("*");
    const oncontextmenu = () => false;
    for (const element of elements) {
        element.oncontextmenu = oncontextmenu;
    }
};

Graphics._applyCanvasFilter = function() {
    if (this._canvas) {
        this._canvas.style.opacity = 0.5;
        this._canvas.style.filter = "blur(8px)";
        this._canvas.style.webkitFilter = "blur(8px)";
    }
};

Graphics._clearCanvasFilter = function() {
    if (this._canvas) {
        this._canvas.style.opacity = 1;
        this._canvas.style.filter = "";
        this._canvas.style.webkitFilter = "";
    }
};

Graphics._setupEventHandlers = function() {
    window.addEventListener("resize", this._onWindowResize.bind(this));
    document.addEventListener("keydown", this._onKeyDown.bind(this));
};

Graphics._onWindowResize = function() {
    this._updateAllElements();
};

Graphics._onKeyDown = function(event) {
    if (!event.ctrlKey && !event.altKey) {
        switch (event.keyCode) {
            case 113: // F2
                event.preventDefault();
                this._switchFPSCounter();
                break;
            case 114: // F3
                event.preventDefault();
                this._switchStretchMode();
                break;
            case 115: // F4
                event.preventDefault();
                this._switchFullScreen();
                break;
            case 120: // F9
                if (typeof SceneManager !== "undefined" && SceneManager._scene &&
                        typeof SceneManager._scene.resumePlaytestCheckpoint === "function") {
                    event.preventDefault();
                    SceneManager._scene.resumePlaytestCheckpoint();
                }
                break;
            case 121: // F10
                event.preventDefault();
                ReactorProfiler.toggle();
                break;
        }
    }
};

Graphics._switchFPSCounter = function() {
    this._fpsCounter.switchMode();
};

Graphics._switchStretchMode = function() {
    this._stretchEnabled = !this._stretchEnabled;
    this._updateAllElements();
};

Graphics._switchFullScreen = function() {
    if (this._isFullScreen()) {
        this._cancelFullScreen();
    } else {
        this._requestFullScreen();
    }
};

Graphics._isFullScreen = function() {
    return (
        document.fullScreenElement ||
        document.mozFullScreen ||
        document.webkitFullscreenElement
    );
};

Graphics._requestFullScreen = function() {
    const element = document.body;
    if (element.requestFullScreen) {
        element.requestFullScreen();
    } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
    } else if (element.webkitRequestFullScreen) {
        element.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
    }
};

Graphics._cancelFullScreen = function() {
    if (document.cancelFullScreen) {
        document.cancelFullScreen();
    } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
    } else if (document.webkitCancelFullScreen) {
        document.webkitCancelFullScreen();
    }
};

/**
 * The GPU the game's WebGL contexts ask for: "high-performance" picks the
 * discrete GPU of a dual-GPU Mac; "default" lets the system choose. On
 * Windows the choice is the manifest's --force-high-performance-gpu switch.
 */
Graphics.gpuPowerPreference = "high-performance";

Graphics._createPixiApp = async function() {
    try {
        this._setupPixi();
        // v8: empty constructor; all options go to init() which is async.
        //     view option was renamed to canvas.
        // v5/v6/v7: sync constructor takes options directly.
        const isV8App =
            typeof PIXI.Application.prototype.init === "function";
        // Keep the app local until it is fully initialized: on v8 the
        // start/stop/ticker members only exist after init() resolves, and
        // startGameLoop/stopGameLoop can run mid-init when a plugin's
        // non-async SceneManager wrapper breaks the await chain.
        let app;
        if (isV8App) {
            app = new PIXI.Application();
            await app.init({
                canvas: this._canvas,
                autoStart: false,
                powerPreference: this.gpuPowerPreference,
                // No alpha channel in the drawing buffer: the canvas is opaque
                // at the compositor level. v8 decides this once, at init, from
                // `background.alpha < 1`. A 3D map once drew on a canvas
                // underneath this one and needed it transparent; it draws into
                // the scene now (shared context, or the canvas copy), and an
                // alpha channel only made the browser blend the whole canvas
                // over the page every frame: on an integrated GPU at 144 Hz
                // that blend pushed most frames past the refresh (91 against
                // 101 fps walking the Demo's start map, the median frame 13.7
                // against 7 ms).
                backgroundAlpha: 1
                // (Note) useBackBuffer was previously enabled here for the
                // PSYCHRONIC_RaveLighting MULTIPLY-blend path. That approach
                // was abandoned in favor of an alpha-composited tone sprite,
                // so we no longer need useBackBuffer -- and keeping it on
                // causes Effekseer's post-render GL draws to be lost when v8
                // copies the back-buffer to screen each frame.
            });
            // Install no-op stubs for the v5/6/7 renderer subsystems that v8
            // removed (batch, geometry, state, shader, framebuffer, projection).
            // Legacy MZ code (Sprite_Animation onBeforeRender/onAfterRender,
            // UltraMode7, etc.) calls .flush()/.reset() on these and would
            // throw otherwise. Must run AFTER init so v8's own systems (like
            // .texture) have already registered first.
            if (typeof window.installLegacyRendererStubs === "function") {
                window.installLegacyRendererStubs(app.renderer);
            }
            if (typeof this._sampleGpuTier === "function") this._sampleGpuTier(app.renderer);
            // Opaque, as asked above (the clear colour's alpha).
            if (app.renderer && app.renderer.background) app.renderer.background.alpha = 1;
        } else {
            app = new PIXI.Application({
                view: this._canvas,
                autoStart: false,
                powerPreference: this.gpuPowerPreference,
                // Same reasoning as v8 above: v5-v7 take the context's alpha
                // from `transparent`, decided once when the renderer is made.
                transparent: false
            });
            if (app.renderer && "backgroundAlpha" in app.renderer) {
                app.renderer.backgroundAlpha = 1;
            }
        }
        app.ticker.remove(app.render, app);
        app.ticker.add(this._onTick, this);
        this._app = app;
        // What can change the picture between updates (Graphics._frameChanged).
        if (typeof this._watchTextureSources === "function") this._watchTextureSources();
        const renderer = app.renderer;
        if (renderer && typeof renderer.render === "function") {
            const render = renderer.render;
            // A draw into a texture changes pixels a sprite then shows.
            renderer.render = function() {
                if (!Graphics._compositing) Graphics._redrawWanted = true;
                return render.apply(this, arguments);
            };
        }
        if (this._canvas && this._canvas.addEventListener) this._canvas.addEventListener("webglcontextrestored", () => this.requestRedraw());
        if (this._startRequested) {
            this._app.start();
        }
    } catch (e) {
        console.error("Graphics._createPixiApp failed:", e);
        this._app = null;
    }
};

Graphics._setupPixi = function() {
    // Suppress PIXI's "Hello" banner. v7+ moved this from PIXI.utils.skipHello()
    // to PIXI.settings.RENDER_OPTIONS.hello.
    if (PIXI.settings && PIXI.settings.RENDER_OPTIONS) {
        PIXI.settings.RENDER_OPTIONS.hello = false;
    } else if (PIXI.utils && PIXI.utils.skipHello) {
        PIXI.utils.skipHello();
    }
    // Texture GC idle max. v7.1+ moved this from PIXI.settings.GC_MAX_IDLE
    // to PIXI.TextureGCSystem.defaultMaxIdle.
    if (PIXI.TextureGCSystem) {
        PIXI.TextureGCSystem.defaultMaxIdle = 600;
    } else if (PIXI.settings) {
        PIXI.settings.GC_MAX_IDLE = 600;
    }
};

// Console-callable diagnostic: bypasses MZ Sprite_Animation entirely and
// replicates AnimationPicker's known-good draw flow directly on the overlay.
// Usage from devtools: testEffekseerOverlay("AnyEffectName") — pick any
// loaded effect name shown in [EffekseerLifecycle] logs.
// If this draws pixels → MZ Sprite_Animation flow is the bug.
// If this draws nothing → overlay/Effekseer setup itself is broken.
window.testEffekseerOverlay = function(effectName) {
    const efx = Graphics._effekseer;
    const efxGL = Graphics._effekseerGL;
    const overlay = Graphics._effekseerCanvas;
    if (!efx || !efxGL || !overlay) {
        console.log("testEffekseerOverlay: missing Effekseer context/overlay", { efx: !!efx, efxGL: !!efxGL, overlay: !!overlay });
        return;
    }
    // Try to find the effect in EffectManager's cache
    const cache = (typeof EffectManager !== "undefined") ? EffectManager._cache : null;
    let effect = null;
    if (cache) {
        const key = Object.keys(cache).find(k => k.includes(effectName || ""));
        if (key) effect = cache[key];
    }
    if (!effect) {
        console.log("testEffekseerOverlay: no loaded effect matches:", effectName, "cache keys:", cache ? Object.keys(cache) : "no cache");
        return;
    }
    const handle = efx.play(effect);
    if (!handle) {
        console.log("testEffekseerOverlay: efx.play() returned null");
        return;
    }
    // AnimationPicker-style positioning
    handle.setLocation(0, 0, 0);
    handle.setRotation(0, 0, 0);
    handle.setScale(1, 1, 1);
    let frameCount = 0;
    const tick = () => {
        if (frameCount++ > 180) return; // 3 seconds at 60fps
        efx.update();
        // Read overlay pixels before draw for diff
        const pre = new Uint8Array(overlay.width * overlay.height * 4);
        efxGL.readPixels(0, 0, overlay.width, overlay.height, efxGL.RGBA, efxGL.UNSIGNED_BYTE, pre);
        // AnimationPicker's exact draw flow
        efxGL.viewport(0, 0, overlay.width, overlay.height);
        efxGL.clearColor(0, 0, 0, 0);
        efxGL.clear(efxGL.COLOR_BUFFER_BIT | efxGL.DEPTH_BUFFER_BIT);
        const viewportSize = overlay.height * 1.2;
        const p = -(viewportSize / overlay.height);
        efx.setProjectionMatrix([1, 0, 0, 0,   0, 1, 0, 0,   0, 0, 1, p,   0, 0, 0, 1]);
        efx.setCameraMatrix     ([1, 0, 0, 0,   0,  1, 0, 0,   0, 0, 1, 0,   0, 0, -10, 1]);
        efx.beginDraw();
        if (handle.exists) efx.drawHandle(handle);
        efx.endDraw();
        Graphics.settleEffekseerState();
        // Count changed pixels
        if (frameCount === 5 || frameCount === 30 || frameCount === 60) {
            const post = new Uint8Array(overlay.width * overlay.height * 4);
            efxGL.readPixels(0, 0, overlay.width, overlay.height, efxGL.RGBA, efxGL.UNSIGNED_BYTE, post);
            let changed = 0, fx = -1, fy = -1, fp = null;
            for (let i = 0; i < post.length; i += 4) {
                if (post[i] !== pre[i] || post[i+1] !== pre[i+1] ||
                    post[i+2] !== pre[i+2] || post[i+3] !== pre[i+3]) {
                    if (fx === -1) {
                        const px = i >> 2;
                        fx = px % overlay.width; fy = (px / overlay.width) | 0;
                        fp = [post[i], post[i+1], post[i+2], post[i+3]];
                    }
                    changed++;
                }
            }
            console.log("[testEffekseerOverlay] frame " + frameCount +
                ": changed=" + changed + "/" + (overlay.width * overlay.height) +
                " first=" + (fx === -1 ? "none" : "(" + fx + "," + fy + ") " + JSON.stringify(fp)) +
                " handle.exists=" + handle.exists);
        }
        requestAnimationFrame(tick);
    };
    tick();
};

/**
 * Draw the composited scene — the 3D canvas when a map renders in 3D, then
 * the game canvas — into the Effekseer overlay's framebuffer. Effects with
 * distortion or darkening layers sample a captured background; on its own
 * transparent overlay canvas that background is empty, so those layers
 * rendered as solid black. The scene is blitted, captured into Effekseer's
 * background texture, and cleared away again before the effects draw.
 */
Graphics.blitSceneBehindEffects = function() {
    const gl = this._effekseerGL;
    const overlay = this._effekseerCanvas;
    if (!gl || !overlay) return false;
    if (!this._efxBlit) {
        const compile = (type, src) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            return shader;
        };
        const program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER,
            "attribute vec2 aPos; varying vec2 vUv;" +
            "void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }"));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER,
            "precision mediump float; varying vec2 vUv; uniform sampler2D uTex;" +
            "void main() { gl_FragColor = texture2D(uTex, vUv); }"));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        this._efxBlit = {
            program,
            buffer,
            aPos: gl.getAttribLocation(program, "aPos"),
            uTex: gl.getUniformLocation(program, "uTex"),
            texture: gl.createTexture()
        };
    }
    const sources = [];
    const three = document.getElementById("reactor3dCanvas");
    if (three && three.width > 0 && three.style.display !== "none"
        && three.style.visibility !== "hidden") {
        sources.push(three);
    }
    if (this._canvas) sources.push(this._canvas);
    if (!sources.length) return false;
    const blit = this._efxBlit;
    gl.viewport(0, 0, overlay.width, overlay.height);
    gl.useProgram(blit.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, blit.buffer);
    gl.enableVertexAttribArray(blit.aPos);
    gl.vertexAttribPointer(blit.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, blit.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(blit.uTex, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    // Effekseer's state restoration is off after the first draw (settleEffekseerState), so this context still
    // holds whatever the last effect draw left. Set everything the copy depends on: a subtractive layer left
    // FUNC_REVERSE_SUBTRACT (the copy subtracted itself to black) and a culled model left CULL_FACE on (the
    // full-screen triangle was culled away) — both blacked out the whole battle screen.
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    // Both source canvases hold premultiplied alpha.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    let drew = false;
    for (const source of sources) {
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        } catch (error) {
            continue;
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        drew = true;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.disable(gl.BLEND);
    return drew;
};

Graphics._createEffekseerContext = function() {
    if (!window.effekseer) return;
    try {
        // Effekseer runs on its OWN canvas + WebGL1 context (the overlay
        // created in _createCanvas) -- NOT on v8's WebGL2 context, where
        // drawHandle silently produces zero pixels. Context attributes match
        // the editor's AnimationPicker (which is the proven-good reference):
        //   premultipliedAlpha: false  -- Effekseer's color output convention
        //   alpha: true                -- transparent so game canvas shows through
        // setRestorationOfStatesFlag is TRUE even though nothing else shares
        // this context: the browser can reset real GL state behind our back
        // (window blur/focus GPU housekeeping), and with the flag off
        // Effekseer trusts its internal state cache and never re-asserts
        // depth/cull state -- translucent back-face "candy striping" on 3D
        // effects after refocusing the window. With the flag on, Effekseer
        // re-asserts its render state around every draw.
        const overlay = this._effekseerCanvas;
        if (!overlay) {
            console.error("Effekseer: overlay canvas missing; not initializing");
            return;
        }
        const opts = { premultipliedAlpha: false, alpha: true, powerPreference: this.gpuPowerPreference };
        const efxGL = overlay.getContext("webgl", opts) ||
                      overlay.getContext("experimental-webgl", opts);
        if (!efxGL) {
            console.error("Effekseer: failed to obtain WebGL1 context on overlay canvas");
            return;
        }
        this._effekseerGL = efxGL;
        this._effekseer = effekseer.createContext();
        if (this._effekseer) {
            this._effekseer.init(efxGL);
            // ...but only until the first draw has re-asserted it. Reading
            // the state back is a synchronous round trip to the GPU process
            // per draw (15 ms a frame measured beside a 3D map), and this
            // context is Effekseer's alone. Re-armed on focus/visibility,
            // the events behind the reset that made the flag necessary.
            this.rearmEffekseerState();
            this._listenEffekseerStateResets();
        }
    } catch (e) {
        console.error("Graphics._createEffekseerContext failed:", e);
    }
};

/** Make the next Effekseer draw read back and restore the context's GL state. */
Graphics.rearmEffekseerState = function() {
    if (!this._effekseer) return;
    this._effekseerRestorePending = true;
    try { this._effekseer.setRestorationOfStatesFlag(true); } catch (e) {}
};

/** After `endDraw()`: the restoring draw has happened, stop paying for it. */
Graphics.settleEffekseerState = function() {
    if (!this._effekseerRestorePending || !this._effekseer) return;
    this._effekseerRestorePending = false;
    try { this._effekseer.setRestorationOfStatesFlag(false); } catch (e) {}
};

Graphics._listenEffekseerStateResets = function() {
    if (this._effekseerStateListening) return;
    this._effekseerStateListening = true;
    window.addEventListener("focus", () => this.rearmEffekseerState());
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) this.rearmEffekseerState();
    });
    const overlay = this._effekseerCanvas;
    if (overlay) {
        // Taking the loss is what lets the browser give the context back.
        overlay.addEventListener("webglcontextlost", event => event.preventDefault());
        // The HDR overlay's targets die with the context.
        overlay.addEventListener("webglcontextlost", () => globalThis.ReactorHdrOverlay?.contextLost());
        overlay.addEventListener("webglcontextrestored", () => this._restoreEffekseerContext());
    }
};

/**
 * The overlay's context came back after a loss: effects loaded into the old
 * one are gone with it, so a new Effekseer context starts and every effect
 * loads again on its next play. Effects playing at the loss end there.
 */
Graphics._restoreEffekseerContext = function() {
    const gl = this._effekseerGL;
    if (!gl || !window.effekseer || gl.isContextLost()) return;
    globalThis.ReactorHdrOverlay?.contextRestored();
    try {
        const context = effekseer.createContext();
        if (!context) return;
        context.init(gl);
        this._effekseer = context;
        if (typeof EffectManager !== "undefined") EffectManager._cache = {};
        this.rearmEffekseerState();
    } catch (e) {
        console.error("Graphics._restoreEffekseerContext failed:", e);
    }
};

//:::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// FPSCounter
//
// This is based on Darsain's FPSMeter which is under the MIT license.
// The original can be found at https://github.com/Darsain/fpsmeter.

Graphics.FPSCounter = function() {
    this.initialize(...arguments);
};

Graphics.FPSCounter.prototype.initialize = function() {
    this._tickCount = 0;
    this._frameTime = 100;
    this._frameStart = 0;
    this._lastLoop = performance.now() - 100;
    this._showFps = true;
    this.fps = 0;
    this.duration = 0;
    this._createElements();
    this._update();
};

Graphics.FPSCounter.prototype.startTick = function() {
    this._frameStart = performance.now();
};

Graphics.FPSCounter.prototype.endTick = function() {
    const time = performance.now();
    const thisFrameTime = time - this._lastLoop;
    this._frameTime += (thisFrameTime - this._frameTime) / 12;
    this.fps = 1000 / this._frameTime;
    this.duration = Math.max(0, time - this._frameStart);
    this._lastLoop = time;
    if (this._tickCount++ % 15 === 0) {
        this._update();
    }
};

Graphics.FPSCounter.prototype.switchMode = function() {
    if (this._boxDiv.style.display === "none") {
        this._boxDiv.style.display = "flex";
        this._showFps = true;
    } else if (this._showFps) {
        this._showFps = false;
    } else {
        this._boxDiv.style.display = "none";
    }
    this._update();
};

Graphics.FPSCounter.prototype._createElements = function() {
    this._boxDiv = document.createElement("div");
    this._rowDiv = document.createElement("div");
    this._labelDiv = document.createElement("div");
    this._modeDiv = document.createElement("div");
    this._numberDiv = document.createElement("div");
    this._boxDiv.id = "fpsCounterBox";
    this._labelDiv.id = "fpsCounterLabel";
    this._modeDiv.id = "fpsCounterMode";
    this._numberDiv.id = "fpsCounterNumber";
    // RPG Maker MZ ships the counter's CSS in its stock css/game.css, and
    // projects created from MZ carry that file. Its #fpsCounterBox/Label/
    // Number rules position the pieces absolutely with paddings and fixed
    // heights, so every property those rules set is reset inline here —
    // an inline declaration beats an id selector; an unset one is lost to it.
    // Reactor's own generated index.html has no such sheet, and the inline
    // styles also stop the counter rendering unpositioned behind the game
    // canvas (z-index 1) and Effekseer overlay (z-index 2).
    //
    // Laid out with flex so the box sizes to its content and every line
    // shares one right edge: the number and its unit sit on a common
    // baseline ("144 FPS"), the renderer mode on its own line beneath.
    const reset =
        "position:static; top:auto; left:auto; right:auto; bottom:auto;" +
        "width:auto; height:auto; margin:0; padding:0; opacity:1;" +
        "text-align:left; text-shadow:none; white-space:nowrap;" +
        "font-family:rmmz-numberfont,monospace;";
    this._boxDiv.style.cssText =
        reset +
        "position:absolute; top:8px; left:8px; box-sizing:border-box;" +
        "min-width:90px; padding:6px 10px;" +
        "display:none; flex-direction:column; align-items:flex-end;" +
        "background:rgba(16,16,24,0.72); border-radius:8px;" +
        "box-shadow:0 1px 4px rgba(0,0,0,0.4); z-index:2147483647;" +
        "pointer-events:none;";
    this._rowDiv.style.cssText =
        reset + "display:flex; align-items:baseline; column-gap:5px;";
    this._numberDiv.style.cssText =
        reset + "font-size:22px; line-height:24px; color:#fff;" +
        "font-variant-numeric:tabular-nums;";
    this._labelDiv.style.cssText =
        reset + "font-size:11px; line-height:12px; letter-spacing:1px;" +
        "color:rgba(255,255,255,0.7);";
    // Renderer mode on its own line under the number, the way RPG Maker's
    // meter reported "WebGL mode" / "Canvas mode".
    this._modeDiv.style.cssText =
        reset + "align-self:stretch; text-align:center; margin-top:2px;" +
        "font-size:9px; line-height:11px; letter-spacing:1px;" +
        "color:rgba(255,255,255,0.55);";
    this._rowDiv.appendChild(this._numberDiv);
    this._rowDiv.appendChild(this._labelDiv);
    this._boxDiv.appendChild(this._rowDiv);
    this._boxDiv.appendChild(this._modeDiv);
    document.body.appendChild(this._boxDiv);
};

Graphics.FPSCounter.prototype._update = function() {
    const count = this._showFps ? this.fps : this.duration;
    this._labelDiv.textContent = this._showFps ? "FPS" : "ms";
    this._numberDiv.textContent = count.toFixed(0);
    // The PIXI app initializes asynchronously, so the mode is read here
    // (every 15 ticks) rather than once at creation. Blank until known.
    const app = Graphics.app;
    const mode = app && app.renderer ? Graphics.rendererModeName(app.renderer) : "";
    if (this._modeDiv.textContent !== mode) this._modeDiv.textContent = mode;
};

/**
 * "WebGL", "WebGPU", or "Canvas" for a PIXI renderer, or "" when it cannot
 * be told. Polymorphic across PIXI versions: v8 renderers carry a `name`
 * ("webgl"/"webgpu") and `RendererType` (1 WebGL, 2 WebGPU, 4 Canvas), v5-v7
 * use `PIXI.RENDERER_TYPE` (1 WebGL, 2 Canvas) — the numbers collide, so the
 * string is preferred and the enum is read from whichever PIXI is loaded.
 */
Graphics.rendererModeName = function(renderer) {
    if (!renderer) return "";
    const names = { webgl: "WebGL", webgpu: "WebGPU", canvas: "Canvas" };
    if (typeof renderer.name === "string" && names[renderer.name.toLowerCase()]) {
        return names[renderer.name.toLowerCase()];
    }
    const pixi = typeof PIXI !== "undefined" ? PIXI : null;
    const type = renderer.type;
    if (typeof type === "number") {
        const v8 = pixi && pixi.RendererType;
        const legacy = pixi && pixi.RENDERER_TYPE;
        if (v8) {
            if (type === v8.WEBGPU) return "WebGPU";
            if (type === v8.WEBGL) return "WebGL";
            if (type === v8.CANVAS) return "Canvas";
        } else if (legacy) {
            if (type === legacy.WEBGL) return "WebGL";
            if (type === legacy.CANVAS) return "Canvas";
        }
    }
    if (renderer.gl || renderer.context instanceof WebGLRenderingContext ||
        (typeof WebGL2RenderingContext !== "undefined" &&
            renderer.context instanceof WebGL2RenderingContext)) {
        return "WebGL";
    }
    if (renderer.context && typeof renderer.context.fillRect === "function") return "Canvas";
    return "";
};

//-----------------------------------------------------------------------------
/**
 * The point class.
 *
 * @class
 * @extends PIXI.Point
 * @param {number} x - The x coordinate.
 * @param {number} y - The y coordinate.
 */
function Point() {
    this.initialize(...arguments);
}

Point.prototype = Object.create(PIXI.Point.prototype);
Point.prototype.constructor = Point;

Point.prototype.initialize = function(x, y) {
    // v8's Point is two fields. Going through the ES5-to-ES6 bridge built a
    // throwaway instance and copied it, for every point the engine makes
    // every frame; the fields are set here directly.
    if (PIXI.TextureSource) {
        this.x = x || 0;
        this.y = y || 0;
        return;
    }
    PIXISuper(PIXI.Point, this, [x, y]);
};

//-----------------------------------------------------------------------------
/**
 * The rectangle class.
 *
 * @class
 * @extends PIXI.Rectangle
 * @param {number} x - The x coordinate for the upper-left corner.
 * @param {number} y - The y coordinate for the upper-left corner.
 * @param {number} width - The width of the rectangle.
 * @param {number} height - The height of the rectangle.
 */
function Rectangle() {
    this.initialize(...arguments);
}

Rectangle.prototype = Object.create(PIXI.Rectangle.prototype);
Rectangle.prototype.constructor = Rectangle;

Rectangle.prototype.initialize = function(x, y, width, height) {
    // As for Point: v8's Rectangle is four numbers and a type tag.
    if (PIXI.TextureSource) {
        this.type = "rectangle";
        this.x = Number(x) || 0;
        this.y = Number(y) || 0;
        this.width = Number(width) || 0;
        this.height = Number(height) || 0;
        return;
    }
    PIXISuper(PIXI.Rectangle, this, [x, y, width, height]);
};

//-----------------------------------------------------------------------------
/**
 * The basic object that represents an image.
 *
 * @class
 * @param {number} width - The width of the bitmap.
 * @param {number} height - The height of the bitmap.
 */
function Bitmap() {
    this.initialize(...arguments);
}

Bitmap.prototype.initialize = function(width, height) {
    this._canvas = null;
    this._context = null;
    this._baseTexture = null;
    this._image = null;
    this._url = "";
    this._urls = [];
    this._urlIndex = 0;
    this._objectUrl = null;
    this._animatedImage = false;
    this._animation = null;
    this._animationDecodeUrl = "";
    this._paintOpacity = 255;
    // pixel-art projects (System.json advanced.pixelatedRendering) sample every texture nearest, so a scaled or
    // moving sprite keeps hard pixels instead of blurring between them
    this._smooth = !(typeof $dataSystem !== "undefined" && $dataSystem?.advanced?.pixelatedRendering === true);
    this._loadListeners = [];

    // "none", "loading", "loaded", or "error"
    this._loadingState = "none";

    if (width > 0 && height > 0) {
        this._createCanvas(width, height);
    }

    /**
     * The face name of the font.
     *
     * @type string
     */
    this.fontFace = "sans-serif";

    /**
     * The size of the font in pixels.
     *
     * @type number
     */
    this.fontSize = 16;

    /**
     * Whether the font is bold.
     *
     * @type boolean
     */
    this.fontBold = false;

    /**
     * Whether the font is italic.
     *
     * @type boolean
     */
    this.fontItalic = false;

    /**
     * The color of the text in CSS format.
     *
     * @type string
     */
    this.textColor = "#ffffff";

    /**
     * The color of the outline of the text in CSS format.
     *
     * @type string
     */
    this.outlineColor = "rgba(0, 0, 0, 0.5)";

    /**
     * The width of the outline of the text.
     *
     * @type number
     */
    this.outlineWidth = Bitmap.defaultOutlineWidth();
};

/** System.json advanced.textOutlineWidth (a 16 px game draws a 1 px shadow); 3 when the data is not loaded. */
Bitmap.defaultOutlineWidth = function() {
    const advanced = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.advanced;
    return advanced && typeof advanced.textOutlineWidth === "number" ? advanced.textOutlineWidth : 3;
};

/**
 * Loads a image file.
 *
 * @param {string} url - The image url of the texture.
 * @returns {Bitmap} The new bitmap object.
 */
Bitmap.load = function(url, fallbackUrls) {
    const bitmap = Object.create(Bitmap.prototype);
    bitmap.initialize();
    bitmap._urls = [url].concat(fallbackUrls || []).filter((value, index, values) =>
        value && values.indexOf(value) === index);
    bitmap._url = bitmap._urls[0] || "";
    bitmap._startLoading();
    return bitmap;
};

/**
 * Takes a snapshot of the game screen.
 *
 * @param {Stage} stage - The stage object.
 * @returns {Bitmap} The new bitmap object.
 */
Bitmap.snap = function(stage) {
    const width = Math.max(1, Math.floor(Number(Graphics.width) || 0));
    const height = Math.max(1, Math.floor(Number(Graphics.height) || 0));
    const bitmap = new Bitmap(width, height);
    const renderTexture = PIXI.TextureSource
        ? PIXI.RenderTexture.create({ width: width, height: height, resolution: 1 })
        : PIXI.RenderTexture.create(width, height);
    if (stage) {
        const renderer = Graphics.app.renderer;
        if (PIXI.TextureSource) {
            // v8: positional (container, target) is deprecated; use options.
            renderer.render({ container: stage, target: renderTexture });
        } else {
            renderer.render(stage, renderTexture);
        }
        stage.worldTransform.identity();
        const canvas = renderer.extract.canvas(renderTexture);
        bitmap.context.drawImage(canvas, 0, 0);
        canvas.width = 0;
        canvas.height = 0;
    }
    renderTexture.destroy(PIXI.TextureSource ? true : { destroyBase: true });
    bitmap.baseTexture.update();
    return bitmap;
};

/**
 * Checks whether the bitmap is ready to render.
 *
 * @returns {boolean} True if the bitmap is ready to render.
 */
Bitmap.prototype.isReady = function() {
    const ready = this._loadingState === "loaded" || this._loadingState === "none";
    if (!ready && this._url) {
        // Whoever polls a not-ready bitmap is gating on it — keep it under
        // watchdog protection here, at the Bitmap level: manager-level
        // isReady() implementations get replaced wholesale by plugins,
        // which would blind any watchdog living there.
        Bitmap._loadWatchList = Bitmap._loadWatchList || [];
        if (Bitmap._loadWatchList.indexOf(this) < 0) {
            Bitmap._loadWatchList.push(this);
        }
        Bitmap._sweepStalledLoads();
    }
    return ready;
};

Bitmap._sweepStalledLoads = function() {
    const list = Bitmap._loadWatchList;
    if (!list || list.length === 0) return;
    const now = performance.now();
    // Poll-driven sweeps (every isReady() while a scene gates on N loading
    // bitmaps) made recovery O(N²) per frame; the 10s stall threshold
    // doesn't need sub-quarter-second resolution.
    if (Bitmap._lastSweepTime && now - Bitmap._lastSweepTime < 250) return;
    Bitmap._lastSweepTime = now;
    for (let i = list.length - 1; i >= 0; i--) {
        const bitmap = list[i];
        if (bitmap._loadingState === "loaded" || bitmap._loadingState === "none" ||
            bitmap._degradedToBlank) {
            list.splice(i, 1);
            continue;
        }
        if (!bitmap._loadStartTime) {
            bitmap._loadStartTime = now;
            continue;
        }
        if (now - bitmap._loadStartTime < 10000) continue;
        bitmap._loadStartTime = now;
        bitmap._loadAttempts = bitmap._loadAttempts || 0;
        if (bitmap._loadingState === "error") {
            // A real onerror fired. Retry a few times, then degrade to a
            // blank canvas with a loud log: plugin caches that gate scene
            // readiness would otherwise deadlock the game on one missing
            // image.
            if (bitmap._loadAttempts < 3) {
                console.warn("Bitmap: load error, retrying " + bitmap._url + " (attempt " + bitmap._loadAttempts + ")");
                bitmap.retry();
            } else {
                console.error("Bitmap: '" + bitmap._url + "' failed to load after retries; continuing with a BLANK image. Check that the file exists.");
                bitmap._degradedToBlank = true;
                bitmap._loadingState = "none";
                bitmap._createCanvas(32, 32);
                bitmap._callLoadListeners();
                list.splice(i, 1);
            }
        } else {
            // Silent stall (no onload, no onerror): always transient —
            // retry indefinitely.
            console.warn("Bitmap: stalled load, retrying " + bitmap._url + " (attempt " + bitmap._loadAttempts + ")");
            bitmap._startLoading();
        }
    }
};

/**
 * Checks whether a loading error has occurred.
 *
 * @returns {boolean} True if a loading error has occurred.
 */
Bitmap.prototype.isError = function() {
    return this._loadingState === "error";
};

/**
 * The url of the image file.
 *
 * @readonly
 * @type string
 * @name Bitmap#url
 */
Object.defineProperty(Bitmap.prototype, "url", {
    get: function() {
        return this._url;
    },
    configurable: true
});

/**
 * The base texture that holds the image.
 *
 * @readonly
 * @type PIXI.BaseTexture
 * @name Bitmap#baseTexture
 */
Object.defineProperty(Bitmap.prototype, "baseTexture", {
    get: function() {
        return this._baseTexture;
    },
    configurable: true
});

/**
 * The bitmap image.
 *
 * @readonly
 * @type HTMLImageElement
 * @name Bitmap#image
 */
Object.defineProperty(Bitmap.prototype, "image", {
    get: function() {
        return this._image;
    },
    configurable: true
});

/**
 * The bitmap canvas.
 *
 * @readonly
 * @type HTMLCanvasElement
 * @name Bitmap#canvas
 */
Object.defineProperty(Bitmap.prototype, "canvas", {
    get: function() {
        this._ensureCanvas();
        // Outside code may draw on it: uploads of this bitmap stay whole (Bitmap.partialUploads).
        this._rrLent = true;
        return this._canvas;
    },
    configurable: true
});

/**
 * The 2d context of the bitmap canvas.
 *
 * @readonly
 * @type CanvasRenderingContext2D
 * @name Bitmap#context
 */
Object.defineProperty(Bitmap.prototype, "context", {
    get: function() {
        this._ensureCanvas();
        // Outside code may draw with it: uploads of this bitmap stay whole (Bitmap.partialUploads).
        this._rrLent = true;
        return this._context;
    },
    configurable: true
});

/**
 * The width of the bitmap.
 *
 * @readonly
 * @type number
 * @name Bitmap#width
 */
Object.defineProperty(Bitmap.prototype, "width", {
    get: function() {
        const image = this._canvas || this._image;
        return image ? image.width : 0;
    },
    configurable: true
});

/**
 * The height of the bitmap.
 *
 * @readonly
 * @type number
 * @name Bitmap#height
 */
Object.defineProperty(Bitmap.prototype, "height", {
    get: function() {
        const image = this._canvas || this._image;
        return image ? image.height : 0;
    },
    configurable: true
});

/**
 * The rectangle of the bitmap.
 *
 * @readonly
 * @type Rectangle
 * @name Bitmap#rect
 */
Object.defineProperty(Bitmap.prototype, "rect", {
    get: function() {
        return new Rectangle(0, 0, this.width, this.height);
    },
    configurable: true
});

/**
 * Whether the smooth scaling is applied.
 *
 * @type boolean
 * @name Bitmap#smooth
 */
Object.defineProperty(Bitmap.prototype, "smooth", {
    get: function() {
        return this._smooth;
    },
    set: function(value) {
        if (this._smooth !== value) {
            this._smooth = value;
            this._updateScaleMode();
        }
    },
    configurable: true
});

/**
 * The opacity of the drawing object in the range (0, 255).
 *
 * @type number
 * @name Bitmap#paintOpacity
 */
Object.defineProperty(Bitmap.prototype, "paintOpacity", {
    get: function() {
        return this._paintOpacity;
    },
    set: function(value) {
        if (this._paintOpacity !== value) {
            this._paintOpacity = value;
            this._drawingContext().globalAlpha = this._paintOpacity / 255;
        }
    },
    configurable: true
});

/**
 * Destroys the bitmap.
 */
Bitmap.prototype.destroy = function() {
    this._revokeObjectUrl();
    this._animation = null;
    if (this._baseTexture) {
        this._baseTexture.destroy();
        this._baseTexture = null;
    }
    this._destroyCanvas();
};

/**
 * Resizes the bitmap.
 *
 * @param {number} width - The new width of the bitmap.
 * @param {number} height - The new height of the bitmap.
 */
Bitmap.prototype.resize = function(width, height) {
    width = Math.max(width || 0, 1);
    height = Math.max(height || 0, 1);
    this.canvas.width = width;
    this.canvas.height = height;
    this.baseTexture.width = width;
    this.baseTexture.height = height;
};

/**
 * Performs a block transfer.
 *
 * @param {Bitmap} source - The bitmap to draw.
 * @param {number} sx - The x coordinate in the source.
 * @param {number} sy - The y coordinate in the source.
 * @param {number} sw - The width of the source image.
 * @param {number} sh - The height of the source image.
 * @param {number} dx - The x coordinate in the destination.
 * @param {number} dy - The y coordinate in the destination.
 * @param {number} [dw=sw] The width to draw the image in the destination.
 * @param {number} [dh=sh] The height to draw the image in the destination.
 */
Bitmap.prototype.blt = function(source, sx, sy, sw, sh, dx, dy, dw, dh) {
    dw = dw || sw;
    dh = dh || sh;
    try {
        const image = source._canvas || source._image;
        const context = this._drawingContext();
        context.globalCompositeOperation = "source-over";
        context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
        this._touchUpload(dx, dy, dw, dh);
        this._baseTexture.update();
    } catch (e) {
        //
    }
};

/**
 * Returns pixel color at the specified point.
 *
 * @param {number} x - The x coordinate of the pixel in the bitmap.
 * @param {number} y - The y coordinate of the pixel in the bitmap.
 * @returns {string} The pixel color (hex format).
 */
Bitmap.prototype.getPixel = function(x, y) {
    const data = this._drawingContext().getImageData(x, y, 1, 1).data;
    let result = "#";
    for (let i = 0; i < 3; i++) {
        result += data[i].toString(16).padZero(2);
    }
    return result;
};

/**
 * Returns alpha pixel value at the specified point.
 *
 * @param {number} x - The x coordinate of the pixel in the bitmap.
 * @param {number} y - The y coordinate of the pixel in the bitmap.
 * @returns {string} The alpha value.
 */
Bitmap.prototype.getAlphaPixel = function(x, y) {
    const data = this._drawingContext().getImageData(x, y, 1, 1).data;
    return data[3];
};

/**
 * Clears the specified rectangle.
 *
 * @param {number} x - The x coordinate for the upper-left corner.
 * @param {number} y - The y coordinate for the upper-left corner.
 * @param {number} width - The width of the rectangle to clear.
 * @param {number} height - The height of the rectangle to clear.
 */
Bitmap.prototype.clearRect = function(x, y, width, height) {
    this._drawingContext().clearRect(x, y, width, height);
    this._touchUpload(x, y, width, height);
    this._baseTexture.update();
};

/**
 * Clears the entire bitmap.
 */
Bitmap.prototype.clear = function() {
    this.clearRect(0, 0, this.width, this.height);
};

/**
 * Fills the specified rectangle.
 *
 * @param {number} x - The x coordinate for the upper-left corner.
 * @param {number} y - The y coordinate for the upper-left corner.
 * @param {number} width - The width of the rectangle to fill.
 * @param {number} height - The height of the rectangle to fill.
 * @param {string} color - The color of the rectangle in CSS format.
 */
Bitmap.prototype.fillRect = function(x, y, width, height, color) {
    const context = this._drawingContext();
    context.save();
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
    context.restore();
    this._touchUpload(x, y, width, height);
    this._baseTexture.update();
};

/**
 * Fills the entire bitmap.
 *
 * @param {string} color - The color of the rectangle in CSS format.
 */
Bitmap.prototype.fillAll = function(color) {
    this.fillRect(0, 0, this.width, this.height, color);
};

/**
 * Draws the specified rectangular frame.
 *
 * @param {number} x - The x coordinate for the upper-left corner.
 * @param {number} y - The y coordinate for the upper-left corner.
 * @param {number} width - The width of the rectangle to fill.
 * @param {number} height - The height of the rectangle to fill.
 * @param {string} color - The color of the rectangle in CSS format.
 */
Bitmap.prototype.strokeRect = function(x, y, width, height, color) {
    const context = this._drawingContext();
    context.save();
    context.strokeStyle = color;
    context.strokeRect(x, y, width, height);
    context.restore();
    const edge = Math.ceil(context.lineWidth / 2) + 1;
    this._touchUpload(x - edge, y - edge, width + edge * 2, height + edge * 2);
    this._baseTexture.update();
};

// prettier-ignore
/**
 * Draws the rectangle with a gradation.
 *
 * @param {number} x - The x coordinate for the upper-left corner.
 * @param {number} y - The y coordinate for the upper-left corner.
 * @param {number} width - The width of the rectangle to fill.
 * @param {number} height - The height of the rectangle to fill.
 * @param {string} color1 - The gradient starting color.
 * @param {string} color2 - The gradient ending color.
 * @param {boolean} vertical - Whether the gradient should be draw as vertical or not.
 */
Bitmap.prototype.gradientFillRect = function(
    x, y, width, height, color1, color2, vertical
) {
    const context = this._drawingContext();
    const x1 = vertical ? x : x + width;
    const y1 = vertical ? y + height : y;
    const grad = context.createLinearGradient(x, y, x1, y1);
    grad.addColorStop(0, color1);
    grad.addColorStop(1, color2);
    context.save();
    context.fillStyle = grad;
    context.fillRect(x, y, width, height);
    context.restore();
    this._touchUpload(x, y, width, height);
    this._baseTexture.update();
};

/**
 * Draws a bitmap in the shape of a circle.
 *
 * @param {number} x - The x coordinate based on the circle center.
 * @param {number} y - The y coordinate based on the circle center.
 * @param {number} radius - The radius of the circle.
 * @param {string} color - The color of the circle in CSS format.
 */
Bitmap.prototype.drawCircle = function(x, y, radius, color) {
    const context = this._drawingContext();
    context.save();
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2, false);
    context.fill();
    context.restore();
    this._touchUpload(x - radius - 1, y - radius - 1, radius * 2 + 2, radius * 2 + 2);
    this._baseTexture.update();
};

/**
 * Draws the outline text to the bitmap.
 *
 * @param {string} text - The text that will be drawn.
 * @param {number} x - The x coordinate for the left of the text.
 * @param {number} y - The y coordinate for the top of the text.
 * @param {number} maxWidth - The maximum allowed width of the text.
 * @param {number} lineHeight - The height of the text line.
 * @param {string} align - The alignment of the text.
 */
Bitmap.prototype.drawText = function(text, x, y, maxWidth, lineHeight, align) {
    // [Note] Different browser makes different rendering with
    //   textBaseline == 'top'. So we use 'alphabetic' here.
    const context = this._drawingContext();
    const alpha = context.globalAlpha;
    const fixed = Bitmap.fixedFontSize();
    const span = maxWidth || 0xffffffff;
    maxWidth = fixed ? 0xffffffff : span;
    let tx = x;
    const legacyFont = Bitmap.legacyFontInfo?.();
    let ty = legacyFont ? Math.round(y + 2 + legacyFont.ascent)
        : Math.round(y + lineHeight / 2 + (fixed || this.fontSize) * 0.35);
    context.save();
    context.font = this._makeFontNameText();
    if (Bitmap.pixelText()) {
        // Pixel art: the text starts on a whole pixel, wherever it is aligned.
        const width = align === "center" || align === "right" ? Math.min(context.measureText(text).width, maxWidth) : 0;
        if (align === "center") tx += (span - width) / 2;
        if (align === "right") tx += span - width;
        tx = Math.round(tx);
        align = "left";
    } else if (align === "center") {
        // Aligned in the space given, even when a fixed size lets the text run past it.
        tx += span / 2;
    } else if (align === "right") {
        tx += span;
    }
    context.textAlign = align || "left";
    context.textBaseline = "alphabetic";
    if (!this._drawLegacyPaletteRun?.(text, tx, ty)) {
        context.globalAlpha = 1;
        this._drawTextOutline(text, tx, ty, maxWidth);
        context.globalAlpha = alpha;
        this._drawTextBody(text, tx, ty, maxWidth);
    }
    context.restore();
    // Glyphs reach above and below the line and past their advance; the margin covers that and the outline.
    const size = fixed || this.fontSize;
    const pad = Math.ceil(this.outlineWidth + size * 0.5 + 2);
    const runsPast = fixed || span >= 0xffffffff;
    const left = runsPast ? 0 : x - pad;
    const right = runsPast ? this.width : x + span + pad;
    this._touchUpload(left, ty - size * 1.3 - pad, right - left, size * 1.9 + pad * 2);
    this._baseTexture.update();
};

/**
 * Returns the width of the specified text.
 *
 * @param {string} text - The text to be measured.
 * @returns {number} The width of the text in pixels.
 */
Bitmap.prototype.measureTextWidth = function(text) {
    const context = this._drawingContext();
    context.save();
    context.font = this._makeFontNameText();
    const width = context.measureText(text).width;
    context.restore();
    return width;
};

/**
 * Adds a callback function that will be called when the bitmap is loaded.
 *
 * @param {function} listner - The callback function.
 */
Bitmap.prototype.addLoadListener = function(listner) {
    if (!this.isReady()) {
        this._loadListeners.push(listner);
    } else {
        listner(this);
    }
};

/**
 * Tries to load the image again.
 */
Bitmap.prototype.retry = function() {
    this._urlIndex = 0;
    this._url = this._urls[0] || this._url;
    this._triedCaseCorrection = false;
    this._startLoading();
};

Bitmap.prototype._makeFontNameText = function() {
    const italic = this.fontItalic ? "Italic " : "";
    const bold = this.fontBold ? "Bold " : "";
    return italic + bold + (Bitmap.fixedFontSize() || this.fontSize) + "px " + this.fontFace;
};

/** System.json advanced.pixelatedRendering: text is placed on whole pixels. */
Bitmap.pixelText = function() {
    return typeof $dataSystem !== "undefined" && $dataSystem?.advanced?.pixelatedRendering === true;
};

/**
 * RPG Maker 2000/2003 (System.json rrLegacyWindows): every text is drawn at the font's own size
 * (advanced.fontSize) and at its natural width, never squeezed; a pixel font at any other size blurs.
 */
Bitmap.legacyFontInfo = function() {
    const system = typeof $dataSystem !== "undefined" && $dataSystem;
    if (!system?.rrLegacyWindows) return null;
    const info = typeof $gameSystem !== "undefined" && $gameSystem?.legacyFontInfo?.();
    return info && Number.isFinite(info.height) && info.height > 0 && info.height <= 1024
        && Number.isFinite(info.ascent) && info.ascent > 0 && info.ascent <= info.height ? info : null;
};

Bitmap.fixedFontSize = function() {
    const system = typeof $dataSystem !== "undefined" && $dataSystem;
    return Bitmap.legacyFontInfo?.()?.height
        || (system && system.rrLegacyWindows && system.advanced && system.advanced.fontSize) || 0;
};

/** System.json advanced.rrTextShadow: text casts a sharp 1 px drop shadow instead of an outline, as 2000/2003 drew it. */
Bitmap.textShadow = function() {
    const advanced = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.advanced;
    return !!(advanced && advanced.rrTextShadow === true);
};

Bitmap.prototype._drawTextOutline = function(text, tx, ty, maxWidth) {
    if (this.outlineWidth <= 0) return;
    const context = this._drawingContext();
    if (this.outlineWidth > 0 && Bitmap.textShadow()) {
        const paint = this._rrLegacyPaletteShadow && this.outlineColor === this._rrLegacyShadowCss
            && typeof ColorManager !== "undefined" ? ColorManager.legacyTextPaint?.(20) : null;
        if (paint && this._drawLegacyPaletteText(text, tx + 1, ty + 1, paint, true)) return;
        const color = typeof $dataSystem !== "undefined" && $dataSystem?.rrLegacyTextPalette ? this.outlineColor : "#000000";
        if (this._drawLegacyPixelText(text, tx + 1, ty + 1, color)) return;
        context.fillStyle = color;
        context.fillText(text, tx + 1, ty + 1, maxWidth);
        return;
    }
    if (this._drawLegacyPixelText(text, tx, ty, this.outlineColor, this.outlineWidth)) return;
    context.strokeStyle = this.outlineColor;
    context.lineWidth = this.outlineWidth;
    context.lineJoin = "round";
    context.strokeText(text, tx, ty, maxWidth);
};

Bitmap.prototype._drawTextBody = function(text, tx, ty, maxWidth) {
    const paint = this.textColor === this._rrLegacyPaletteCss && typeof ColorManager !== "undefined"
        ? ColorManager.legacyTextPaint?.(this._rrLegacyPaletteIndex) : null;
    if (paint && this._drawLegacyPaletteText(text, tx, ty, paint, false)) return;
    if (this._drawLegacyPixelText(text, tx, ty, this.textColor)) return;
    const context = this._drawingContext();
    context.fillStyle = this.textColor;
    context.fillText(text, tx, ty, maxWidth);
};

/** Paint one source System colour cell through a monochrome glyph mask. */
Bitmap.paintLegacyGlyph = function(pixels, width, height, pad, ascent, paint, shadow) {
    const top = pad * 2 - ascent;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4;
        if (pixels[at + 3] < 128) { pixels[at + 3] = 0; continue; }
        // The native font box begins two pixels below the 16px text row.
        // Source offsets (2,4) restart for every glyph; its 1px shadow uses
        // the separate (16,32) cell from its own unshifted mask origin.
        const sx = Math.max(0, Math.min(15, x - pad + (shadow ? 0 : 2)));
        const sy = Math.max(0, Math.min(15, y - top + (shadow ? 0 : 4)));
        const from = (sy * 16 + sx) * 4;
        pixels[at] = paint.data[from]; pixels[at + 1] = paint.data[from + 1];
        pixels[at + 2] = paint.data[from + 2]; pixels[at + 3] = 255;
    }
};

/** Native legacy text draws each glyph's shadow and body before the next glyph. */
Bitmap.prototype._drawLegacyPaletteRun = function(text, tx, ty) {
    // Keep custom CSS, outlines and smoothing on their existing paths.
    if (!Bitmap.textShadow() || this.outlineWidth <= 0 || !this._rrLegacyPaletteShadow
        || this.outlineColor !== this._rrLegacyShadowCss || this.textColor !== this._rrLegacyPaletteCss
        || typeof ColorManager === "undefined") return false;
    const body = ColorManager.legacyTextPaint?.(this._rrLegacyPaletteIndex);
    const shadow = ColorManager.legacyTextPaint?.(20);
    return !!(body && shadow && this._drawLegacyPaletteText(text, tx, ty, shadow, true, body));
};

Bitmap.prototype._drawLegacyPaletteText = function(text, tx, ty, paint, shadow, pairedBodyPaint) {
    if (!Bitmap.fixedFontSize() || !Bitmap.pixelText()) return false;
    const context = this._drawingContext(), value = String(text), font = this._makeFontNameText();
    const size = Bitmap.fixedFontSize(), info = Bitmap.legacyFontInfo();
    const ascent = info?.ascent || Math.round(size * 0.85);
    const width = context.measureText(value).width;
    if (width > 8192 || size > 256) return false;
    if (context.textAlign === "center") tx -= width / 2;
    else if (context.textAlign === "right" || context.textAlign === "end") tx -= width;
    const cache = Bitmap._legacyPixelTextCache || (Bitmap._legacyPixelTextCache = new Map());
    const passes = pairedBodyPaint ? [
        { paint, shadow: true, dx: 1, dy: 1, alpha: 1 },
        { paint: pairedBodyPaint, shadow: false, dx: 0, dy: 0, alpha: context.globalAlpha }
    ] : [{ paint, shadow, dx: 0, dy: 0, alpha: context.globalAlpha }];
    context.save(); context.imageSmoothingEnabled = false;
    let advance = 0;
    for (const glyph of value) {
        const ready = !document.fonts || document.fonts.check(font, glyph);
        let glyphAdvance = 0;
        for (const pass of passes) {
            const key = JSON.stringify(["palette", font, glyph, pass.paint.key, pass.shadow, ascent]);
            let item = ready && cache.get(key);
            if (!item) {
                const pad = Math.ceil(size), canvas = document.createElement("canvas");
                const glyphWidth = context.measureText(glyph).width;
                canvas.width = Math.max(1, Math.ceil(glyphWidth) + pad * 2); canvas.height = pad * 3;
                const ink = canvas.getContext("2d", { willReadFrequently: true });
                ink.font = font; ink.textBaseline = "alphabetic"; ink.fillStyle = "#ffffff";
                ink.fillText(glyph, pad, pad * 2);
                const pixels = ink.getImageData(0, 0, canvas.width, canvas.height);
                Bitmap.paintLegacyGlyph(pixels.data, canvas.width, canvas.height, pad, ascent, pass.paint, pass.shadow);
                ink.putImageData(pixels, 0, 0);
                item = { canvas, pad, advance: glyphWidth };
                if (ready) {
                    cache.set(key, item);
                    Bitmap._legacyPixelTextPixels = (Bitmap._legacyPixelTextPixels || 0) + canvas.width * canvas.height;
                    while (cache.size > 128 || Bitmap._legacyPixelTextPixels > 1048576) {
                        const oldest = cache.keys().next().value, old = cache.get(oldest);
                        Bitmap._legacyPixelTextPixels -= old.canvas.width * old.canvas.height; cache.delete(oldest);
                    }
                }
            } else { cache.delete(key); cache.set(key, item); }
            context.globalAlpha = pass.alpha;
            context.drawImage(item.canvas, Math.round(tx + advance + pass.dx) - item.pad, Math.round(ty + pass.dy) - item.pad * 2);
            glyphAdvance = item.advance;
        }
        advance += glyphAdvance;
    }
    context.restore();
    return true;
};

/**
 * 2000/2003 used monochrome glyph masks. Nearest texture sampling cannot
 * remove antialiasing already baked into a browser-rendered fallback font.
 * Cache native-size, hard-edged masks for these projects only; modern text
 * and legacy projects with Pixelated Rendering disabled retain canvas text.
 */
Bitmap.prototype._drawLegacyPixelText = function(text, tx, ty, color, outline = 0) {
    if (!Bitmap.fixedFontSize() || !Bitmap.pixelText()) return false;
    const context = this._drawingContext();
    const value = String(text);
    const size = Bitmap.fixedFontSize();
    const font = this._makeFontNameText();
    // During a plugin font load, do not retain a mask made with its fallback.
    const ready = !document.fonts || document.fonts.check(font, value);
    const key = JSON.stringify([font, value, color, outline]);
    const cache = Bitmap._legacyPixelTextCache || (Bitmap._legacyPixelTextCache = new Map());
    let item = ready && cache.get(key);
    if (!item) {
        const pad = Math.ceil(size + outline);
        const width = Math.ceil(context.measureText(value).width) + pad * 2;
        const height = pad * 3;
        // Bound allocations even for a plugin passing an unusually long line.
        if (width > 8192 || height > 1024) return false;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ink = canvas.getContext("2d", { willReadFrequently: true });
        ink.font = font;
        ink.textBaseline = "alphabetic";
        ink.fillStyle = "#ffffff";
        if (outline > 0) {
            ink.strokeStyle = "#ffffff";
            ink.lineWidth = outline;
            ink.lineJoin = "round";
            ink.strokeText(value, pad, pad * 2);
        } else ink.fillText(value, pad, pad * 2);
        const pixels = ink.getImageData(0, 0, canvas.width, canvas.height);
        const data = pixels.data;
        for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 128 ? 255 : 0;
        ink.putImageData(pixels, 0, 0);
        ink.globalCompositeOperation = "source-in";
        ink.fillStyle = color;
        ink.fillRect(0, 0, canvas.width, canvas.height);
        item = { canvas, pad, advance: context.measureText(value).width };
        if (ready) {
            cache.set(key, item);
            Bitmap._legacyPixelTextPixels = (Bitmap._legacyPixelTextPixels || 0) + canvas.width * canvas.height;
            while (cache.size > 128 || Bitmap._legacyPixelTextPixels > 1048576) {
                const oldest = cache.keys().next().value;
                const old = cache.get(oldest);
                Bitmap._legacyPixelTextPixels -= old.canvas.width * old.canvas.height;
                cache.delete(oldest);
            }
        }
    } else {
        cache.delete(key);
        cache.set(key, item);
    }
    if (context.textAlign === "center") tx -= item.advance / 2;
    else if (context.textAlign === "right" || context.textAlign === "end") tx -= item.advance;
    context.save();
    context.imageSmoothingEnabled = false;
    context.drawImage(item.canvas, Math.round(tx) - item.pad, Math.round(ty) - item.pad * 2);
    context.restore();
    return true;
};

/**
 * Partial uploads (Bitmap.partialUploads): each draw op below names the area
 * it changed, and the frame's upload of the bitmap sends only the changed
 * area when that is a small part of the canvas (pixi_compat's upload flush).
 * An update() that names no area (a plugin's own drawing) sends the whole
 * canvas, and so does every upload once code outside these ops has taken the
 * canvas or its context, since it can draw without naming an area.
 */
Bitmap.partialUploads = true;

// The context for the ops in this file, without marking it lent.
Bitmap.prototype._drawingContext = function() {
    this._ensureCanvas();
    return this._context;
};

Bitmap.prototype._touchUpload = function(x, y, width, height) {
    const base = this._baseTexture;
    const source = base && base.source;
    if (!source || this._rrLent || !Bitmap.partialUploads) return;
    source.__rrTouch = true;
    source.__rrTouchX0 = Math.floor(Math.min(x, x + width));
    source.__rrTouchY0 = Math.floor(Math.min(y, y + height));
    source.__rrTouchX1 = Math.ceil(Math.max(x, x + width));
    source.__rrTouchY1 = Math.ceil(Math.max(y, y + height));
};

Bitmap.prototype._createCanvas = function(width, height) {
    this._canvas = document.createElement("canvas");
    this._context = this._canvas.getContext("2d", { willReadFrequently: true });
    this._canvas.width = width;
    this._canvas.height = height;
    this._createBaseTexture(this._canvas);
};

Bitmap.prototype._ensureCanvas = function() {
    if (!this._canvas) {
        if (this._image) {
            this._createCanvas(this._image.width, this._image.height);
            this._context.drawImage(this._image, 0, 0);
        } else {
            this._createCanvas(0, 0);
        }
    }
};

Bitmap.prototype._destroyCanvas = function() {
    if (this._canvas) {
        this._canvas.width = 0;
        this._canvas.height = 0;
        this._canvas = null;
    }
};

Bitmap.prototype._createBaseTexture = function(source) {
    this._baseTexture = new PIXI.BaseTexture(source);
    this._baseTexture.mipmap = false;
    this._baseTexture.width = source.width;
    this._baseTexture.height = source.height;
    // Name the GPU-side source after the file (or canvas size) so
    // destroyed-while-referenced diagnostics can say which bitmap died.
    try {
        const inner = this._baseTexture.source || this._baseTexture;
        if (inner && "label" in inner) {
            inner.label = this._url || `canvas ${source.width}x${source.height}`;
        }
    } catch (e) { /* labeling is best-effort */ }
    this._updateScaleMode();
};

Bitmap.prototype._updateScaleMode = function() {
    if (this._baseTexture) {
        if (this._smooth) {
            this._baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
        } else {
            this._baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        }
    }
};

Bitmap.prototype._startLoading = function() {
    this._revokeObjectUrl();
    this._triedMvEncrypted = false;
    this._triedPlain = false;
    this._image = new Image();
    this._image.onload = this._onLoad.bind(this);
    this._image.onerror = this._onError.bind(this);
    this._destroyCanvas();
    this._loadingState = "loading";
    // Stall watchdog bookkeeping (see Bitmap.isReady / _sweepStalledLoads):
    // image loads can silently die without onload OR onerror.
    this._loadStartTime = performance.now();
    this._loadAttempts = (this._loadAttempts || 0) + 1;
    Bitmap._loadWatchList = Bitmap._loadWatchList || [];
    if (Bitmap._loadWatchList.indexOf(this) < 0) {
        Bitmap._loadWatchList.push(this);
    }
    if (Utils.hasEncryptedImages()) {
        this._startDecrypting();
    } else if (Bitmap._isAnimatedImage(this._url)) {
        // Compositing frames needs the file's bytes, and an <img> only ever
        // hands back frame one -- see the animation section below.
        this._url = Utils.resolveFileCase(this._url, "");
        this._requestBytes(this._url);
    } else {
        this._url = Utils.resolveFileCase(this._url, "");
        this._image.src = this._url;
        if (this._image.width > 0) {
            this._image.onload = null;
            this._onLoad();
        }
    }
};

Bitmap.prototype._startDecrypting = function() {
    this._url = Utils.resolveFileCase(this._url, "_");
    // With the disk at hand, ask for the name that is there (MV's .rpgmvp,
    // or a file left plain) instead of failing a request first.
    if (Utils.localAssetExists(this._url + "_") === false && /\.png$/i.test(this._url)) {
        const mv = this._url.slice(0, -4) + ".rpgmvp";
        if (Utils.localAssetExists(mv)) {
            this._triedMvEncrypted = true;
            this._requestEncrypted(Utils.correctFileCase(mv) || mv);
            return;
        }
        if (Utils.localAssetExists(this._url)) {
            this._triedMvEncrypted = true;
            this._triedPlain = true;
            this._requestBytes(this._url);
            return;
        }
    }
    this._requestEncrypted(this._url + "_");
};

Bitmap.prototype._requestEncrypted = function(url) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "arraybuffer";
    xhr.onload = () => this._onXhrLoad(xhr);
    xhr.onerror = this._onEncryptedError.bind(this);
    xhr.send();
};

Bitmap.prototype._requestBytes = function(url) {
    this._animationDecodeUrl = url;
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "arraybuffer";
    xhr.onload = () => {
        // A file:// read reports status 0 on success, as _requestEncrypted
        // already assumes.
        if (xhr.status < 400) this._onImageBytes(xhr.response);
        else this._onError();
    };
    xhr.onerror = this._onError.bind(this);
    xhr.send();
};

Bitmap.prototype._onXhrLoad = function(xhr) {
    if (xhr.status < 400) {
        this._onImageBytes(Utils.decryptArrayBuffer(xhr.response));
    } else {
        this._onEncryptedError();
    }
};

Bitmap.prototype._onImageBytes = function(arrayBuffer) {
    const animation = Bitmap._parseAnimation(this._url, arrayBuffer);
    if (animation) {
        this._loadAnimationFrames(animation);
        return;
    }
    // Not animated after all -- a still GIF, or a still PNG under an .apng
    // name. Hand it to the browser as any other image.
    const blob = new Blob([arrayBuffer], { type: Bitmap._mimeType(this._url) });
    this._objectUrl = URL.createObjectURL(blob);
    this._image.src = this._objectUrl;
};

Bitmap.prototype._onEncryptedError = function() {
    if (!this._triedMvEncrypted && /\.png$/i.test(this._url)) {
        this._triedMvEncrypted = true;
        const candidate = this._url.slice(0, -4) + ".rpgmvp";
        this._requestEncrypted(Utils.correctFileCase(candidate) || candidate);
        return;
    }
    // An encrypted game can still ship a file as it is: MV never encrypts
    // img/system/Window.png, and a deploy can leave others plain.
    if (!this._triedPlain) {
        this._triedPlain = true;
        this._requestBytes(Utils.resolveFileCase(this._url, ""));
        return;
    }
    this._onError();
};

Bitmap.prototype._revokeObjectUrl = function() {
    if (this._objectUrl) {
        URL.revokeObjectURL(this._objectUrl);
        this._objectUrl = null;
    }
};

Bitmap.prototype._onLoad = function() {
    // Second entry point for frame decoding, and in practice the usual one:
    // VisuMZ_0_CoreEngine replaces _startLoading outright, so the branch there
    // never runs in a VisuStella project and an .apng arrives here as an <img>
    // holding frame one. The bytes come back off the cache the <img> just
    // filled. Staying "loading" until the frames are ready matters -- swapping
    // the base texture after the load listeners fired would leave every sprite
    // holding the still one.
    if (Bitmap._isAnimatedImage(this._url) && !this._animation
            && this._animationDecodeUrl !== this._url) {
        this._requestBytes(this._url);
        return;
    }
    this._revokeObjectUrl();
    this._loadingState = "loaded";
    this._createBaseTexture(this._image);
    this._callLoadListeners();
};

Bitmap._mimeType = function(url) {
    const clean = String(url || "").replace(/[?#].*$/, "").replace(/_$/, "").toLowerCase();
    if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
    if (clean.endsWith(".webp")) return "image/webp";
    if (clean.endsWith(".svg")) return "image/svg+xml";
    if (clean.endsWith(".gif")) return "image/gif";
    if (clean.endsWith(".apng")) return "image/apng";
    return "image/png";
};

Bitmap.prototype._updateAnimatedImage = function() {
    if (!this._animation || this._loadingState !== "loaded" || !this._baseTexture) return;
    // Once per game frame at most, however many sprites share the bitmap.
    if (this._animatedFrame === Graphics.frameCount) return;
    this._animatedFrame = Graphics.frameCount;
    this._advanceAnimation();
};

//-----------------------------------------------------------------------------
// Animated image playback: APNG and GIF.
//
// Chromium animates either format only where it paints the image itself.
// Reading one back through `drawImage` or `texImage2D` yields the format's
// *default image* -- frame one -- by specification, whether or not the element
// is in the DOM, so re-uploading an <img> every frame animates nothing. Frames
// have to be decoded here and composited by hand.
//
// Neither parser decodes pixels. `parseApng` and `parseGif` split the file into
// one standalone single-frame image per frame, copying the compressed data
// across untouched, and the browser's own PNG and GIF decoders still do the
// pixel work -- no inflate, no LZW. What is implemented here is the part
// browsers keep to themselves: the frame timeline, and compositing each frame's
// sub-rectangle onto a canvas under the format's dispose and blend rules. That
// canvas is the base texture's source, so a frame change costs one upload of
// one changed surface rather than 60 uploads a second of an unchanging one.
//
// The two formats reach the same frame shape, so everything past parsing is
// shared. Dispose and blend are expressed in APNG's vocabulary throughout, and
// GIF's disposal methods are mapped onto it at parse time.

/**
 * The shortest time a frame is held, in ms. APNG reads a delay of zero as "as
 * fast as possible", which without a floor replays the whole loop every frame.
 */
Bitmap.ANIMATION_MIN_DELAY_MS = 10;

Bitmap._PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Ancillary PNG chunks that change how frame pixels decode, so every extracted
 * frame needs its own copy. Text, timestamps and EXIF do not affect pixels.
 */
Bitmap._APNG_SHARED_CHUNKS = ["PLTE", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP",
    "sBIT", "bKGD", "hIST", "pHYs"];

Bitmap._crcTable = null;

Bitmap._crc32 = function(bytes) {
    if (!Bitmap._crcTable) {
        const table = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c;
        }
        Bitmap._crcTable = table;
    }
    const table = Bitmap._crcTable;
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) {
        crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ -1) >>> 0;
};

Bitmap._asUint8 = function(source) {
    if (!source) return null;
    if (source instanceof Uint8Array) return source;
    if (source instanceof ArrayBuffer) return new Uint8Array(source);
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(source)) {
        return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    }
    return null;
};

Bitmap._concatBytes = function(pieces) {
    let total = 0;
    for (const piece of pieces) total += piece.length;
    const out = new Uint8Array(total);
    let at = 0;
    for (const piece of pieces) {
        out.set(piece, at);
        at += piece.length;
    }
    return out;
};

Bitmap._hasPngSignature = function(bytes) {
    if (!bytes || bytes.length < 8) return false;
    return Bitmap._PNG_SIGNATURE.every((value, index) => bytes[index] === value);
};

/**
 * Whether a url names a format whose frames the engine decodes itself. Keyed on
 * the extension rather than the file's contents: sniffing every image would
 * cost a byte read per file the game loads.
 *
 * @param {string} url - The image url, encrypted suffix and query allowed.
 * @returns {boolean} True for an `.apng` or `.gif` url.
 */
Bitmap._isAnimatedImage = function(url) {
    const clean = String(url || "").replace(/[?#].*$/, "").replace(/_$/, "").toLowerCase();
    return clean.endsWith(".gif") || clean.endsWith(".apng");
};

/**
 * Splits an animated image into its frames, choosing a parser by url.
 *
 * @param {string} url - The url the bytes came from.
 * @param {ArrayBuffer|Uint8Array} source - The raw file bytes.
 * @returns {?object} The animation, or null if there is nothing to animate.
 */
Bitmap._parseAnimation = function(url, source) {
    const clean = String(url || "").replace(/[?#].*$/, "").replace(/_$/, "").toLowerCase();
    if (clean.endsWith(".apng")) return Bitmap.parseApng(source);
    if (clean.endsWith(".gif")) return Bitmap.parseGif(source);
    return null;
};

/**
 * Whether an image file carries APNG animation, i.e. an `acTL` chunk ahead of
 * the first `IDAT`. A file with `acTL` after `IDAT` is malformed and reads as a
 * plain PNG, which is what the specification asks for.
 *
 * @param {ArrayBuffer|Uint8Array} source - The raw file bytes.
 * @returns {boolean} True if the file is an animated PNG.
 */
Bitmap.hasApngAnimation = function(source) {
    const bytes = Bitmap._asUint8(source);
    if (!Bitmap._hasPngSignature(bytes)) return false;
    // Walked chunk by chunk rather than over a fixed prefix: `acTL` follows
    // IHDR, but an embedded colour profile can legally push it kilobytes in.
    let offset = 8;
    while (offset + 12 <= bytes.length) {
        const length = (bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16)
            + (bytes[offset + 2] << 8) + bytes[offset + 3];
        if (length > 0x7fffffff) return false;
        const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5],
            bytes[offset + 6], bytes[offset + 7]);
        if (type === "acTL") return true;
        if (type === "IDAT" || type === "IEND") return false;
        offset += 12 + length;
    }
    return false;
};

/**
 * Splits an APNG into one standalone PNG per frame.
 *
 * Returns null for anything that is not a usable animation -- not a PNG, no
 * `acTL`, a single frame, a frame with no data -- so callers fall back to the
 * ordinary static path rather than failing on a file the engine can still show.
 *
 * @param {ArrayBuffer|Uint8Array} source - The raw file bytes.
 * @returns {?object} `{width, height, playCount, mimeType, frames}`, `playCount`
 *   0 meaning loop forever; each frame is `{x, y, width, height, delayMs,
 *   disposeOp, blendOp, bytes}` where `bytes` is a complete one-frame file.
 */
Bitmap.parseApng = function(source) {
    const bytes = Bitmap._asUint8(source);
    if (!Bitmap._hasPngSignature(bytes)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const shared = [];
    const frames = [];
    let header = null;
    let playCount = 1;
    let animated = false;
    let pending = null;
    let defaultImageAnimates = false;
    let sawIdat = false;
    let offset = 8;

    while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset);
        if (length > 0x7fffffff || offset + 12 + length > bytes.length) break;
        const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5],
            bytes[offset + 6], bytes[offset + 7]);
        if (type === "IEND") break;
        const start = offset + 8;
        const data = bytes.subarray(start, start + length);
        switch (type) {
            case "IHDR":
                if (length < 13) return null;
                header = data.slice();
                break;
            case "acTL":
                if (length >= 8 && !sawIdat) {
                    animated = true;
                    playCount = view.getUint32(start + 4);
                }
                break;
            case "fcTL":
                if (length >= 26) {
                    if (pending) frames.push(pending);
                    // An `fcTL` before the first `IDAT` enlists the default
                    // image as frame one; after it, the default image is a
                    // still fallback and plays no part in the animation.
                    if (!sawIdat) defaultImageAnimates = true;
                    pending = {
                        width: view.getUint32(start + 4),
                        height: view.getUint32(start + 8),
                        x: view.getUint32(start + 12),
                        y: view.getUint32(start + 16),
                        delayNum: view.getUint16(start + 20),
                        delayDen: view.getUint16(start + 22),
                        disposeOp: bytes[start + 24],
                        blendOp: bytes[start + 25],
                        parts: []
                    };
                }
                break;
            case "IDAT":
                sawIdat = true;
                if (pending && defaultImageAnimates) pending.parts.push(data);
                break;
            case "fdAT":
                // The leading four bytes are the sequence number, not pixels.
                if (pending && length > 4) {
                    pending.parts.push(bytes.subarray(start + 4, start + length));
                }
                break;
            default:
                if (Bitmap._APNG_SHARED_CHUNKS.includes(type)) shared.push({ type, data });
                break;
        }
        offset += 12 + length;
    }
    if (pending) frames.push(pending);
    if (!animated || !header || frames.length < 2) return null;

    const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const width = headerView.getUint32(0);
    const height = headerView.getUint32(4);
    if (!(width > 0) || !(height > 0)) return null;

    const built = [];
    for (const frame of frames) {
        if (!frame.parts.length || !(frame.width > 0) || !(frame.height > 0)) return null;
        if (frame.x + frame.width > width || frame.y + frame.height > height) return null;
        const denominator = frame.delayDen || 100;
        built.push({
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: frame.height,
            delayMs: (frame.delayNum / denominator) * 1000,
            disposeOp: frame.disposeOp,
            blendOp: frame.blendOp,
            bytes: Bitmap._buildFramePng(header, shared, frame)
        });
    }
    return {
        width: width,
        height: height,
        playCount: playCount,
        mimeType: "image/png",
        frames: built
    };
};

Bitmap._buildFramePng = function(header, shared, frame) {
    const chunk = (type, data) => {
        const out = new Uint8Array(12 + data.length);
        const view = new DataView(out.buffer);
        view.setUint32(0, data.length);
        for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
        out.set(data, 8);
        view.setUint32(8 + data.length, Bitmap._crc32(out.subarray(4, 8 + data.length)));
        return out;
    };
    // The frame's own IHDR carries its sub-rectangle size; everything else --
    // bit depth, colour type, interlacing -- is inherited from the file.
    const ihdr = header.slice(0, 13);
    const ihdrView = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
    ihdrView.setUint32(0, frame.width);
    ihdrView.setUint32(4, frame.height);

    const pieces = [new Uint8Array(Bitmap._PNG_SIGNATURE), chunk("IHDR", ihdr)];
    // Kept in file order, which the source PNG already held in a legal one.
    for (const entry of shared) pieces.push(chunk(entry.type, entry.data));
    pieces.push(chunk("IDAT", Bitmap._concatBytes(frame.parts)));
    pieces.push(chunk("IEND", new Uint8Array(0)));
    return Bitmap._concatBytes(pieces);
};

/**
 * Splits an animated GIF into one standalone single-frame GIF per frame.
 *
 * The LZW data is copied across byte for byte, interlace flag included, so no
 * decompression happens here -- each frame is handed back to the browser as a
 * tiny GIF of its own. Returns null for a still GIF or anything unreadable, so
 * callers fall back to the ordinary static path.
 *
 * @param {ArrayBuffer|Uint8Array} source - The raw file bytes.
 * @returns {?object} The animation, shaped exactly as `parseApng` returns.
 */
Bitmap.parseGif = function(source) {
    const bytes = Bitmap._asUint8(source);
    if (!bytes || bytes.length < 14) return null;
    const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    if (signature !== "GIF87a" && signature !== "GIF89a") return null;
    // GIF is little-endian throughout, unlike PNG.
    const u16 = at => bytes[at] | (bytes[at + 1] << 8);
    /** Walks a [size][data] sub-block chain and returns the offset past its terminator. */
    const endOfBlocks = start => {
        let at = start;
        while (at < bytes.length) {
            const size = bytes[at];
            if (size === 0) return at + 1;
            at += 1 + size;
        }
        return -1;
    };

    const screenWidth = u16(6);
    const screenHeight = u16(8);
    const screenFlags = bytes[10];
    let offset = 13;
    let globalTable = null;
    if (screenFlags & 0x80) {
        const entries = 2 << (screenFlags & 0x07);
        if (offset + entries * 3 > bytes.length) return null;
        globalTable = bytes.subarray(offset, offset + entries * 3);
        offset += entries * 3;
    }

    // Absent a NETSCAPE loop block a GIF is shown once, which is what every
    // browser does with one and therefore what its author saw.
    let playCount = 1;
    let control = null;
    const frames = [];

    while (offset < bytes.length) {
        const introducer = bytes[offset];
        if (introducer === 0x3b) break;             // trailer
        if (introducer === 0x21) {                  // extension
            const label = bytes[offset + 1];
            const start = offset + 2;
            if (label === 0xf9 && bytes[start] === 4) {
                const flags = bytes[start + 1];
                control = {
                    disposal: (flags >> 2) & 0x07,
                    transparent: flags & 0x01 ? bytes[start + 4] : -1,
                    delay: u16(start + 2)
                };
            } else if (label === 0xff && bytes[start] === 11
                    && String.fromCharCode(...bytes.subarray(start + 1, start + 12)) === "NETSCAPE2.0"
                    && bytes[start + 12] === 3 && bytes[start + 13] === 1) {
                playCount = u16(start + 14);
            }
            const end = endOfBlocks(start);
            if (end < 0) break;
            offset = end;
            continue;
        }
        if (introducer !== 0x2c) break;              // not a block we understand
        if (offset + 10 > bytes.length) break;
        const frame = {
            x: u16(offset + 1),
            y: u16(offset + 3),
            width: u16(offset + 5),
            height: u16(offset + 7)
        };
        const frameFlags = bytes[offset + 9];
        let at = offset + 10;
        frame.table = globalTable;
        if (frameFlags & 0x80) {
            const entries = 2 << (frameFlags & 0x07);
            if (at + entries * 3 > bytes.length) return null;
            frame.table = bytes.subarray(at, at + entries * 3);
            at += entries * 3;
        }
        frame.interlaced = !!(frameFlags & 0x40);
        frame.minCodeSize = bytes[at];
        const dataEnd = endOfBlocks(at + 1);
        if (dataEnd < 0 || !frame.table || !(frame.width > 0) || !(frame.height > 0)) return null;
        frame.data = bytes.subarray(at + 1, dataEnd);
        frame.control = control;
        frames.push(frame);
        control = null;                              // a control block governs one image
        offset = dataEnd;
    }
    if (frames.length < 2) return null;

    // Files whose frames reach past the logical screen are common enough that
    // browsers grow the canvas instead of clipping; so does this.
    let width = screenWidth;
    let height = screenHeight;
    for (const frame of frames) {
        width = Math.max(width, frame.x + frame.width);
        height = Math.max(height, frame.y + frame.height);
    }
    if (!(width > 0) || !(height > 0)) return null;

    // GIF disposal 0 (unspecified) and 1 (do not dispose) both leave the frame
    // standing; 2 restores the background, 3 the previous contents.
    const DISPOSE = { 0: 0, 1: 0, 2: 1, 3: 2 };
    const built = frames.map(frame => {
        const centiseconds = frame.control ? frame.control.delay : 0;
        return {
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: frame.height,
            // Browsers hold a frame asking for under 20ms for 100ms instead,
            // and a great many old GIFs ask for 0 expecting exactly that.
            delayMs: (centiseconds < 2 ? 10 : centiseconds) * 10,
            disposeOp: DISPOSE[frame.control ? frame.control.disposal : 0] ?? 0,
            // A GIF frame composites over what is beneath it: its transparent
            // index shows the previous frame through, which is how the format
            // builds a picture up across frames.
            blendOp: 1,
            bytes: Bitmap._buildFrameGif(frame)
        };
    });
    return {
        width: width,
        height: height,
        playCount: playCount,
        mimeType: "image/gif",
        frames: built
    };
};

Bitmap._buildFrameGif = function(frame) {
    const entries = frame.table.length / 3;
    let bits = 0;
    while (2 << bits < entries) bits++;
    const lo = value => value & 0xff;
    const hi = value => (value >> 8) & 0xff;
    const pieces = [
        // "GIF89a", then a logical screen the size of this one frame.
        new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
            lo(frame.width), hi(frame.width), lo(frame.height), hi(frame.height),
            0x80 | bits, 0x00, 0x00]),
        frame.table
    ];
    // Carried only for the transparent index; the timeline is ours, so the
    // frame's own delay and disposal are left at zero.
    if (frame.control && frame.control.transparent >= 0) {
        pieces.push(new Uint8Array([0x21, 0xf9, 0x04, 0x01, 0x00, 0x00,
            frame.control.transparent, 0x00]));
    }
    pieces.push(new Uint8Array([0x2c, 0x00, 0x00, 0x00, 0x00,
        lo(frame.width), hi(frame.width), lo(frame.height), hi(frame.height),
        frame.interlaced ? 0x40 : 0x00]));
    // The compressed data, sub-block chain and terminator included, verbatim.
    pieces.push(new Uint8Array([frame.minCodeSize]));
    pieces.push(frame.data);
    pieces.push(new Uint8Array([0x3b]));
    return Bitmap._concatBytes(pieces);
};

Bitmap.prototype._loadAnimationFrames = function(animation) {
    const urls = [];
    const images = [];
    let remaining = animation.frames.length;
    let failed = false;
    const finish = () => {
        for (const url of urls) URL.revokeObjectURL(url);
        if (!failed) {
            this._startAnimation(animation, images);
        } else if (this._image && this._image.width > 0) {
            // One unreadable frame should not cost the whole image: the still
            // decode has already succeeded on the _onLoad path, so keep it.
            this._animationDecodeUrl = this._url;
            this._onLoad();
        } else {
            this._onError();
        }
    };
    animation.frames.forEach((frame, index) => {
        const url = URL.createObjectURL(new Blob([frame.bytes], { type: animation.mimeType }));
        urls.push(url);
        const image = new Image();
        images[index] = image;
        const done = () => {
            if (--remaining === 0) finish();
        };
        image.onload = done;
        image.onerror = () => {
            failed = true;
            done();
        };
        image.src = url;
    });
};

Bitmap.prototype._startAnimation = function(animation, images) {
    this._revokeObjectUrl();
    this._image = null;
    this._destroyCanvas();
    // Canvas-backed deliberately: the canvas is the base texture's source, and
    // it keeps `blt`, `getPixel` and `bitmap.context` reading the frame that is
    // actually on screen.
    this._createCanvas(animation.width, animation.height);
    this._animation = {
        frames: animation.frames,
        images: images,
        playCount: animation.playCount,
        index: -1,
        plays: 0,
        paused: false,
        finished: false,
        due: Infinity,
        restore: null,
        restoreX: 0,
        restoreY: 0
    };
    this._animatedImage = true;
    this._loadingState = "loaded";
    this._renderAnimationFrame(0);
    this._animation.due = performance.now() + this._animationHoldTime(0);
    if (this._baseTexture) this._baseTexture.update();
    this._callLoadListeners();
};

Bitmap.prototype._animationHoldTime = function(index) {
    const frame = this._animation.frames[index];
    return Math.max(frame ? frame.delayMs : 0, Bitmap.ANIMATION_MIN_DELAY_MS);
};

/**
 * Composites one frame onto the canvas. Deliberately does not upload: callers
 * batch that, so a seek replaying N frames still costs one texture update.
 */
Bitmap.prototype._renderAnimationFrame = function(index) {
    const state = this._animation;
    const context = this._context;
    if (!state || !context) return;
    const frame = state.frames[index];
    const previous = state.index >= 0 ? state.frames[state.index] : null;
    if (previous) {
        if (previous.disposeOp === 2 && state.restore) {
            context.putImageData(state.restore, state.restoreX, state.restoreY);
        } else if (previous.disposeOp === 1) {
            context.clearRect(previous.x, previous.y, previous.width, previous.height);
        }
    }
    state.restore = null;
    if (frame.disposeOp === 2) {
        state.restore = context.getImageData(frame.x, frame.y, frame.width, frame.height);
        state.restoreX = frame.x;
        state.restoreY = frame.y;
    }
    // APNG_BLEND_OP_SOURCE replaces the region, alpha included, rather than
    // compositing over what is already there. GIF frames are always OVER.
    if (frame.blendOp === 0) context.clearRect(frame.x, frame.y, frame.width, frame.height);
    const image = state.images[index];
    if (image) {
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = 1;
        context.drawImage(image, frame.x, frame.y);
    }
    state.index = index;
};

Bitmap.prototype._advanceAnimation = function() {
    const state = this._animation;
    if (state.paused || state.finished) return;
    const now = performance.now();
    if (now < state.due) return;
    const total = state.frames.length;
    let advanced = 0;
    while (now >= state.due && advanced < total) {
        let next = state.index + 1;
        if (next >= total) {
            state.plays++;
            if (state.playCount > 0 && state.plays >= state.playCount) {
                state.finished = true;
                state.due = Infinity;
                break;
            }
            next = 0;
        }
        this._renderAnimationFrame(next);
        state.due += this._animationHoldTime(next);
        advanced++;
    }
    // A long stall -- a scene load, a minimised window -- leaves `due` far in
    // the past. Resync to now instead of sprinting the backlog next frame.
    if (!state.finished && now >= state.due) {
        state.due = now + this._animationHoldTime(state.index);
    }
    if (advanced > 0 && this._baseTexture) this._baseTexture.update();
};

/**
 * Whether this bitmap is playing a decoded animation.
 *
 * @returns {boolean} True while frames are being composited.
 */
Bitmap.prototype.isAnimated = function() {
    return !!this._animation;
};

/**
 * The number of frames in the animation, or 0 for a still image.
 *
 * @readonly
 * @type number
 * @name Bitmap#animationFrameCount
 */
Object.defineProperty(Bitmap.prototype, "animationFrameCount", {
    get: function() {
        return this._animation ? this._animation.frames.length : 0;
    },
    configurable: true
});

/**
 * The index of the frame on the canvas, or -1 for a still image.
 *
 * @readonly
 * @type number
 * @name Bitmap#animationFrame
 */
Object.defineProperty(Bitmap.prototype, "animationFrame", {
    get: function() {
        return this._animation ? this._animation.index : -1;
    },
    configurable: true
});

/**
 * Holds the animation on the frame it is showing.
 */
Bitmap.prototype.pauseAnimation = function() {
    if (this._animation) this._animation.paused = true;
};

/**
 * Resumes a held animation from the frame it is showing.
 */
Bitmap.prototype.playAnimation = function() {
    const state = this._animation;
    if (!state || !state.paused) return;
    state.paused = false;
    state.due = performance.now() + this._animationHoldTime(state.index);
};

/**
 * Whether the animation is held.
 *
 * @returns {boolean} True if paused.
 */
Bitmap.prototype.isAnimationPaused = function() {
    return !!(this._animation && this._animation.paused);
};

/**
 * Jumps to a frame. Earlier frames are replayed rather than skipped, because a
 * frame in either format is a difference against the ones before it, not a
 * whole picture.
 *
 * @param {number} index - The frame to show.
 */
Bitmap.prototype.seekAnimation = function(index) {
    const state = this._animation;
    if (!state) return;
    const target = Math.max(0, Math.min(state.frames.length - 1, Math.floor(index) || 0));
    this._context.clearRect(0, 0, this.width, this.height);
    state.index = -1;
    state.restore = null;
    for (let i = 0; i <= target; i++) this._renderAnimationFrame(i);
    state.finished = false;
    state.due = performance.now() + this._animationHoldTime(target);
    if (this._baseTexture) this._baseTexture.update();
};

/**
 * Replays the animation from its first frame, loop count included.
 */
Bitmap.prototype.restartAnimation = function() {
    if (!this._animation) return;
    this._animation.plays = 0;
    this.seekAnimation(0);
};

/**
 * Overrides how many times the animation plays, ignoring the count the file
 * asked for. A GIF with no loop block asks to be shown once; this is how a
 * plugin makes one loop forever.
 *
 * @param {number} count - Passes to play; 0 loops forever.
 */
Bitmap.prototype.setAnimationLoopCount = function(count) {
    const state = this._animation;
    if (!state) return;
    state.playCount = Math.max(0, Math.floor(count) || 0);
    if (state.playCount === 0 || state.plays < state.playCount) {
        state.finished = false;
        if (state.due === Infinity) state.due = performance.now();
    }
};
Bitmap.prototype._callLoadListeners = function() {
    while (this._loadListeners.length > 0) {
        const listener = this._loadListeners.shift();
        listener(this);
    }
};

Bitmap.prototype._onError = function() {
    this._revokeObjectUrl();
    // One retry with the on-disk casing before giving up: Windows-authored
    // projects freely mix filename case that Windows resolves and a
    // case-sensitive filesystem does not.
    if (!this._triedCaseCorrection) {
        this._triedCaseCorrection = true;
        const suffix = Utils.hasEncryptedImages() ? "_" : "";
        const corrected = Utils.correctFileCase(this._url + suffix);
        if (corrected) {
            this._url = suffix && corrected.endsWith(suffix)
                ? corrected.slice(0, -suffix.length)
                : corrected;
            this._startLoading();
            return;
        }
    }
    if (this._urlIndex + 1 < this._urls.length) {
        this._urlIndex++;
        this._url = this._urls[this._urlIndex];
        this._triedCaseCorrection = false;
        this._startLoading();
        return;
    }
    this._loadingState = "error";
    // An imported 2000/2003 game draws nothing for an image it never shipped (System.json rrSkipMissingImages).
    if (typeof ImageManager !== "undefined" && ImageManager.skipsMissingImages && ImageManager.skipsMissingImages()) {
        ImageManager.throwLoadError(this);
    }
};
