//=============================================================================
// reactor_core.js v1.7.0
//=============================================================================

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
    if (!this.isNwjs()) return null;
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

Graphics._onTick = function(deltaTime) {
    const prof = ReactorProfiler._active ? ReactorProfiler : null;
    if (prof) prof.frameBegin();
    this._fpsCounter.startTick();
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
        this._tickHandler(dt);
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
    if (this._canRender()) {
        const tRender = prof ? performance.now() : 0;
        this._app.render();
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
    this._fpsCounter.endTick();
    if (prof) prof.frameEnd();
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
    const scale = this._realScale || 1;
    return Math.max(1, Math.min(scale, this.maxCanvasPixelRatio || 4));
};

/**
 * Ceiling for the backing-store scale. A project that would rather trade
 * the native-resolution enlargement for frame rate on weak GPUs sets this
 * to 1 (a script call or plugin): the canvas renders at game size again
 * and the browser stretches it as it did before.
 */
Graphics.maxCanvasPixelRatio = 4;

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
    this._canvas.style.zIndex = 1;
    this._centerElement(this._canvas);
    // _centerElement sizes from the backing store, which the ratio inflated;
    // the on-screen size is always the game size times the display scale.
    this._canvas.style.width = this._width * this._realScale + "px";
    this._canvas.style.height = this._height * this._realScale + "px";
    this._updateEffekseerCanvas();
};

Graphics._updateEffekseerCanvas = function() {
    if (!this._effekseerCanvas) return;
    this._effekseerCanvas.width = this._width;
    this._effekseerCanvas.height = this._height;
    // z-index 2 = above game canvas (z=1), below loading spinner / video.
    this._effekseerCanvas.style.zIndex = 2;
    this._centerElement(this._effekseerCanvas);
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
                // Ask for an alpha channel in the drawing buffer.
                //
                // v8 decides this once, at init, from `background.alpha < 1` —
                // and never again. Left at the default the context is created
                // with `alpha: false`, which makes the canvas opaque at the
                // compositor level whatever the clear colour says afterwards.
                // A 3D map draws on a canvas *underneath* this one, so without
                // an alpha channel it can never be seen: the ground renders
                // perfectly and is composited away. The visible default is
                // restored immediately below, so an ordinary 2D map is opaque
                // exactly as before.
                backgroundAlpha: 0
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
            // Opaque again: the alpha channel exists now, and only a 3D map
            // asks for it to be used.
            if (app.renderer && app.renderer.background) app.renderer.background.alpha = 1;
        } else {
            app = new PIXI.Application({
                view: this._canvas,
                autoStart: false,
                // Same reasoning as v8 above: v5-v7 take the context's alpha
                // from `transparent`, decided once when the renderer is made.
                transparent: true
            });
            if (app.renderer && "backgroundAlpha" in app.renderer) {
                app.renderer.backgroundAlpha = 1;
            }
        }
        app.ticker.remove(app.render, app);
        app.ticker.add(this._onTick, this);
        this._app = app;
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
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
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
        const opts = { premultipliedAlpha: false, alpha: true };
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
            this._effekseer.setRestorationOfStatesFlag(true);
        }
    } catch (e) {
        console.error("Graphics._createEffekseerContext failed:", e);
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
    this._smooth = true;
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
    this.outlineWidth = 3;
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
            this.context.globalAlpha = this._paintOpacity / 255;
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
        this.context.globalCompositeOperation = "source-over";
        this.context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
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
    const data = this.context.getImageData(x, y, 1, 1).data;
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
    const data = this.context.getImageData(x, y, 1, 1).data;
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
    this.context.clearRect(x, y, width, height);
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
    const context = this.context;
    context.save();
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
    context.restore();
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
    const context = this.context;
    context.save();
    context.strokeStyle = color;
    context.strokeRect(x, y, width, height);
    context.restore();
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
    const context = this.context;
    const x1 = vertical ? x : x + width;
    const y1 = vertical ? y + height : y;
    const grad = context.createLinearGradient(x, y, x1, y1);
    grad.addColorStop(0, color1);
    grad.addColorStop(1, color2);
    context.save();
    context.fillStyle = grad;
    context.fillRect(x, y, width, height);
    context.restore();
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
    const context = this.context;
    context.save();
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2, false);
    context.fill();
    context.restore();
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
    const context = this.context;
    const alpha = context.globalAlpha;
    maxWidth = maxWidth || 0xffffffff;
    let tx = x;
    let ty = Math.round(y + lineHeight / 2 + this.fontSize * 0.35);
    if (align === "center") {
        tx += maxWidth / 2;
    }
    if (align === "right") {
        tx += maxWidth;
    }
    context.save();
    context.font = this._makeFontNameText();
    context.textAlign = align || "left";
    context.textBaseline = "alphabetic";
    context.globalAlpha = 1;
    this._drawTextOutline(text, tx, ty, maxWidth);
    context.globalAlpha = alpha;
    this._drawTextBody(text, tx, ty, maxWidth);
    context.restore();
    this._baseTexture.update();
};

/**
 * Returns the width of the specified text.
 *
 * @param {string} text - The text to be measured.
 * @returns {number} The width of the text in pixels.
 */
Bitmap.prototype.measureTextWidth = function(text) {
    const context = this.context;
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
    return italic + bold + this.fontSize + "px " + this.fontFace;
};

Bitmap.prototype._drawTextOutline = function(text, tx, ty, maxWidth) {
    const context = this.context;
    context.strokeStyle = this.outlineColor;
    context.lineWidth = this.outlineWidth;
    context.lineJoin = "round";
    context.strokeText(text, tx, ty, maxWidth);
};

Bitmap.prototype._drawTextBody = function(text, tx, ty, maxWidth) {
    const context = this.context;
    context.fillStyle = this.textColor;
    context.fillText(text, tx, ty, maxWidth);
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
};

//-----------------------------------------------------------------------------
/**
 * The basic object that is rendered to the game screen.
 *
 * @class
 * @extends PIXI.Sprite
 * @param {Bitmap} bitmap - The image for the sprite.
 */
function Sprite() {
    this.initialize(...arguments);
}

Sprite.prototype = Object.create(PIXI.Sprite.prototype);
Sprite.prototype.constructor = Sprite;

Sprite.prototype.initialize = function(bitmap) {
    if (!Sprite._emptyBaseTexture) {
        Sprite._emptyBaseTexture = new PIXI.BaseTexture();
        Sprite._emptyBaseTexture.setSize(1, 1);
    }
    const frame = new Rectangle();
    const texture = PIXICreateTexture(Sprite._emptyBaseTexture, frame);
    PIXISuper(PIXI.Sprite, this, [texture]);
    this.spriteId = Sprite._counter++;
    this._bitmap = bitmap;
    this._frame = frame;
    this._hue = 0;
    this._blendColor = [0, 0, 0, 0];
    this._colorTone = [0, 0, 0, 0];
    this._colorFilter = null;
    this._blendMode = PIXI.BLEND_MODES.NORMAL;
    this._hidden = false;
    this._onBitmapChange();
};

Sprite._emptyBaseTexture = null;
Sprite._counter = 0;

/**
 * The image for the sprite.
 *
 * @type Bitmap
 * @name Sprite#bitmap
 */
Object.defineProperty(Sprite.prototype, "bitmap", {
    get: function() {
        return this._bitmap;
    },
    set: function(value) {
        if (this._bitmap !== value) {
            this._bitmap = value;
            this._onBitmapChange();
        }
    },
    configurable: true
});

/**
 * The width of the sprite without the scale.
 *
 * @type number
 * @name Sprite#width
 */
Object.defineProperty(Sprite.prototype, "width", {
    get: function() {
        return this._frame.width;
    },
    set: function(value) {
        this._frame.width = value;
        this._refresh();
    },
    configurable: true
});

/**
 * The height of the sprite without the scale.
 *
 * @type number
 * @name Sprite#height
 */
Object.defineProperty(Sprite.prototype, "height", {
    get: function() {
        return this._frame.height;
    },
    set: function(value) {
        this._frame.height = value;
        this._refresh();
    },
    configurable: true
});

/**
 * The opacity of the sprite (0 to 255).
 *
 * @type number
 * @name Sprite#opacity
 */
Object.defineProperty(Sprite.prototype, "opacity", {
    get: function() {
        return this.alpha * 255;
    },
    set: function(value) {
        this.alpha = value.clamp(0, 255) / 255;
    },
    configurable: true
});

/**
 * The blend mode to be applied to the sprite.
 *
 * @type number
 * @name Sprite#blendMode
 */
// Capture PIXI.Container's blendMode descriptor (if it's a getter/setter on
// the running PIXI version, which it is on v8). MZ's blendMode setter below
// uses this to propagate the assignment to PIXI's render-pipeline state
// (`localBlendMode`); without this, sprite.blendMode = 'multiply' silently
// only updates an internal `_blendMode` field that the v8 batcher never reads,
// so the sprite renders with default ('normal') blending.
const _pixiContainerBlendModeDesc = (function() {
    if (!PIXI.Container || !PIXI.Container.prototype) return null;
    let proto = PIXI.Container.prototype;
    let depth = 0;
    while (proto && proto !== Object.prototype && depth < 10) {
        const desc = Object.getOwnPropertyDescriptor(proto, "blendMode");
        if (desc && (desc.get || desc.set)) return desc;
        proto = Object.getPrototypeOf(proto);
        depth++;
    }
    return null;
})();

// v5/v6 used numeric blend-mode constants (PIXI.BLEND_MODES.ADD === 1).
// MZ data files (animations, plugins) store these numeric values directly --
// e.g. Sprite_AnimationMV.updateCellSprite does `sprite.blendMode = cell[7]`
// where cell[7] is 0..3. v8 expects strings ('normal' | 'add' | 'multiply' |
// 'screen' | ...); a numeric value silently falls back to default 'normal',
// which kills the additive-glow look on animations (visually reads as "no
// transparency" because additive blends naturally fade-edge into the scene
// whereas normal blends look solid).
const _MZ_BLEND_NUM_TO_STR = {
    0: "normal", 1: "add", 2: "multiply", 3: "screen"
};
const _normalizeBlendMode = function(value) {
    if (typeof value === "number" && value in _MZ_BLEND_NUM_TO_STR) {
        return _MZ_BLEND_NUM_TO_STR[value];
    }
    return value;
};

Object.defineProperty(Sprite.prototype, "blendMode", {
    get: function() {
        if (this._colorFilter) {
            return this._colorFilter.blendMode;
        } else {
            return this._blendMode;
        }
    },
    set: function(value) {
        const normalized = _normalizeBlendMode(value);
        this._blendMode = normalized;
        if (this._colorFilter) {
            this._colorFilter.blendMode = normalized;
        }
        // v8: forward to PIXI Container's own blendMode setter so the value
        // reaches localBlendMode and the render group structure flags. The
        // descriptor lookup is null on PIXI versions where blendMode is a
        // plain property (v5/v6/v7), so this is a no-op there.
        if (_pixiContainerBlendModeDesc && _pixiContainerBlendModeDesc.set) {
            _pixiContainerBlendModeDesc.set.call(this, normalized);
        }
    },
    configurable: true
});

/**
 * Destroys the sprite.
 */
Sprite.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.Sprite.prototype.destroy.call(this, options);
};

/**
 * Updates the sprite for each frame.
 */
Sprite.prototype.update = function() {
    if (this.visible && this.worldVisible !== false && this._bitmap) {
        this._bitmap._updateAnimatedImage();
    }
    for (const child of this.children) {
        if (child.update) {
            child.update();
        }
    }
};

/**
 * Makes the sprite "hidden".
 */
Sprite.prototype.hide = function() {
    this._hidden = true;
    this.updateVisibility();
};

/**
 * Releases the "hidden" state of the sprite.
 */
Sprite.prototype.show = function() {
    this._hidden = false;
    this.updateVisibility();
};

/**
 * Reflects the "hidden" state of the sprite to the visible state.
 */
Sprite.prototype.updateVisibility = function() {
    this.visible = !this._hidden;
};

/**
 * Sets the x and y at once.
 *
 * @param {number} x - The x coordinate of the sprite.
 * @param {number} y - The y coordinate of the sprite.
 */
Sprite.prototype.move = function(x, y) {
    this.x = x;
    this.y = y;
};

/**
 * Sets the rectagle of the bitmap that the sprite displays.
 *
 * @param {number} x - The x coordinate of the frame.
 * @param {number} y - The y coordinate of the frame.
 * @param {number} width - The width of the frame.
 * @param {number} height - The height of the frame.
 */
Sprite.prototype.setFrame = function(x, y, width, height) {
    this._refreshFrame = false;
    const frame = this._frame;
    frame.x = x;
    frame.y = y;
    frame.width = width;
    frame.height = height;
    // Always refresh, even when the frame values are unchanged: the bitmap's
    // base texture can be swapped underneath the sprite (image processing
    // plugins redraw shared bitmaps like the windowskin), leaving the sprite
    // rendering a stale source with a stale frame. _refresh only rebuilds the
    // texture when the source or frame actually differs, so this is cheap.
    this._refresh();
};

/**
 * Sets the hue rotation value.
 *
 * @param {number} hue - The hue value (-360, 360).
 */
Sprite.prototype.setHue = function(hue) {
    if (this._hue !== Number(hue)) {
        this._hue = Number(hue);
        this._updateColorFilter();
    }
};

/**
 * Gets the blend color for the sprite.
 *
 * @returns {array} The blend color [r, g, b, a].
 */
Sprite.prototype.getBlendColor = function() {
    return this._blendColor.clone();
};

/**
 * Sets the blend color for the sprite.
 *
 * @param {array} color - The blend color [r, g, b, a].
 */
Sprite.prototype.setBlendColor = function(color) {
    if (!(color instanceof Array)) {
        throw new Error("Argument must be an array");
    }
    if (!this._blendColor.equals(color)) {
        this._blendColor = color.clone();
        this._updateColorFilter();
    }
};

/**
 * Gets the color tone for the sprite.
 *
 * @returns {array} The color tone [r, g, b, gray].
 */
Sprite.prototype.getColorTone = function() {
    return this._colorTone.clone();
};

/**
 * Sets the color tone for the sprite.
 *
 * @param {array} tone - The color tone [r, g, b, gray].
 */
Sprite.prototype.setColorTone = function(tone) {
    if (!(tone instanceof Array)) {
        throw new Error("Argument must be an array");
    }
    if (!this._colorTone.equals(tone)) {
        this._colorTone = tone.clone();
        this._updateColorFilter();
    }
};

Sprite.prototype._onBitmapChange = function() {
    if (this._bitmap) {
        this._refreshFrame = true;
        this._bitmap.addLoadListener(this._onBitmapLoad.bind(this));
    } else {
        this._refreshFrame = false;
        this.texture.frame = new Rectangle();
    }
};

Sprite.prototype._onBitmapLoad = function(bitmapLoaded) {
    if (bitmapLoaded === this._bitmap) {
        if (this._refreshFrame && this._bitmap) {
            this._refreshFrame = false;
            this._frame.width = this._bitmap.width;
            this._frame.height = this._bitmap.height;
        }
    }
    this._refresh();
};

Sprite.prototype._refresh = function() {
    const texture = this.texture;
    const frameX = Math.floor(this._frame.x);
    const frameY = Math.floor(this._frame.y);
    const frameW = Math.floor(this._frame.width);
    const frameH = Math.floor(this._frame.height);
    const baseTexture = this._bitmap ? this._bitmap.baseTexture : null;
    const baseTextureW = baseTexture ? baseTexture.width : 0;
    const baseTextureH = baseTexture ? baseTexture.height : 0;
    const realX = frameX.clamp(0, baseTextureW);
    const realY = frameY.clamp(0, baseTextureH);
    const realW = (frameW - realX + frameX).clamp(0, baseTextureW - realX);
    const realH = (frameH - realY + frameY).clamp(0, baseTextureH - realY);
    if (texture) {
        this.pivot.x = frameX - realX;
        this.pivot.y = frameY - realY;
        if (baseTexture) {
            if (PIXI.TextureSource && baseTexture.source) {
                // v8: REPLACE the whole texture rather than mutating its
                // source. Mutating doesn't invalidate sprite's cached bounds
                // (which were captured from the initial 1x1 empty stub) so
                // the sprite keeps rendering at 1x1 despite the new source.
                // Creating a fresh Texture resets all internal caches.
                // The Rectangle is only built on actual change — setFrame
                // refreshes unconditionally every frame, so the no-change
                // path must stay allocation-free.
                if (this.texture.source !== baseTexture.source ||
                    this.texture.frame.x !== realX ||
                    this.texture.frame.y !== realY ||
                    this.texture.frame.width !== realW ||
                    this.texture.frame.height !== realH) {
                    if (this.texture.__rrSpriteOwned && this.texture.source === baseTexture.source
                        && !this.texture.destroyed) {
                        // The sprite's own texture on the same source: move
                        // its frame. A dynamic texture tells its sprite on
                        // update(), which is what refreshes the bounds that a
                        // silent mutation once left at the 1x1 stub. Walk
                        // cycles and blinking pause signs used to build a
                        // texture per frame change here.
                        const frame = this.texture.frame;
                        frame.x = realX;
                        frame.y = realY;
                        frame.width = realW;
                        frame.height = realH;
                        this.texture.update();
                    } else {
                        // A new source (or the shared initial texture): the
                        // sprite gets a texture of its own. The replaced one
                        // must be destroyed when this path made it: the v8
                        // Texture constructor subscribes to the session-lived
                        // source's resize event and would be retained forever.
                        const old = this.texture;
                        this.texture = new PIXI.Texture({
                            source: baseTexture.source,
                            frame: new Rectangle(realX, realY, realW, realH),
                            dynamic: true
                        });
                        this.texture.__rrSpriteOwned = true;
                        if (old && old.__rrSpriteOwned && !old.destroyed) {
                            old.destroy();
                        }
                    }
                }
            } else {
                // v5/v6/v7 mutation path.
                texture.baseTexture = baseTexture;
                try {
                    texture.frame = new Rectangle(realX, realY, realW, realH);
                } catch (e) {
                    texture.frame = new Rectangle();
                }
            }
        }
        texture._updateID++;
    }
};

Sprite.prototype._createColorFilter = function() {
    this._colorFilter = new ColorFilter();
    // v8: container.filters is a setter that may store a frozen copy, so
    // .push() on the existing array can fail. Build a fresh array and assign.
    const filters = this.filters ? this.filters.slice() : [];
    filters.push(this._colorFilter);
    this.filters = filters;
};

Sprite.prototype._updateColorFilter = function() {
    if (!this._colorFilter) {
        this._createColorFilter();
    }
    this._colorFilter.setHue(this._hue);
    this._colorFilter.setBlendColor(this._blendColor);
    this._colorFilter.setColorTone(this._colorTone);
};

//-----------------------------------------------------------------------------
/**
 * The tilemap which displays 2D tile-based game map.
 *
 * @class
 * @extends PIXI.Container
 */
function Tilemap() {
    this.initialize(...arguments);
}

Tilemap.prototype = Object.create(PIXI.Container.prototype);
Tilemap.prototype.constructor = Tilemap;

Tilemap.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);

    this._width = Graphics.width;
    this._height = Graphics.height;
    this._margin = 20;
    this._mapWidth = 0;
    this._mapHeight = 0;
    this._mapData = null;
    this._bitmaps = [];

    /**
     * The width of each tile.
     *
     * @type number
     */
    this.tileWidth = 48;

    /**
     * The height of each tile.
     *
     * @type number
     */
    this.tileHeight = 48;

    /**
     * The origin point of the tilemap for scrolling.
     *
     * @type Point
     */
    this.origin = new Point();

    /**
     * The tileset flags.
     *
     * @type array
     */
    this.flags = [];

    /**
     * The animation count for autotiles.
     *
     * @type number
     */
    this.animationCount = 0;

    /**
     * Whether the tilemap loops horizontal.
     *
     * @type boolean
     */
    this.horizontalWrap = false;

    /**
     * Whether the tilemap loops vertical.
     *
     * @type boolean
     */
    this.verticalWrap = false;

    this._createLayers();
    this.refresh();

    // v8: repaint runs from the update() tail, but a plugin is free to
    // replace Tilemap.prototype.update with a copy of the stock MZ body
    // (MultiTweaks' animation-speed tweak does), which on v5 was fine
    // because PIXI itself invoked updateTransform during render. Self-heal
    // from the per-frame render callback: if this frame's preparation has
    // not happened by render time, do it here, exactly once.
    if (PIXI.TextureSource) {
        this.onRender = () => {
            if (this._v8PreparedFrame !== Graphics.frameCount) {
                this._prepareV8Frame();
            }
        };
    }
};

/**
 * The width of the tilemap.
 *
 * @type number
 * @name Tilemap#width
 */
Object.defineProperty(Tilemap.prototype, "width", {
    get: function() {
        return this._width;
    },
    set: function(value) {
        this._width = value;
    },
    configurable: true
});

/**
 * The height of the tilemap.
 *
 * @type number
 * @name Tilemap#height
 */
Object.defineProperty(Tilemap.prototype, "height", {
    get: function() {
        return this._height;
    },
    set: function(value) {
        this._height = value;
    },
    configurable: true
});

/**
 * Destroys the tilemap.
 */
Tilemap.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.Container.prototype.destroy.call(this, options);
};

/**
 * Sets the tilemap data.
 *
 * @param {number} width - The width of the map in number of tiles.
 * @param {number} height - The height of the map in number of tiles.
 * @param {array} data - The one dimensional array for the map data.
 */
Tilemap.prototype.setData = function(width, height, data) {
    this._mapWidth = width;
    this._mapHeight = height;
    this._mapData = data;
};

/**
 * Checks whether the tileset is ready to render.
 *
 * @type boolean
 * @returns {boolean} True if the tilemap is ready.
 */
Tilemap.prototype.isReady = function() {
    for (const bitmap of this._bitmaps) {
        if (bitmap && !bitmap.isReady()) {
            return false;
        }
    }
    return true;
};

/**
 * Updates the tilemap for each frame.
 */
Tilemap.prototype.update = function() {
    this.animationCount++;
    this.animationFrame = Math.floor(this.animationCount / 30);
    for (const child of this.children) {
        if (child.update) {
            child.update();
        }
    }
    // v8: repaint, sort and plugin layer positioning live in updateTransform.
    // Drive the complete plugin-wrapped chain once from the MZ update path.
    // A second invocation from PIXI's render preparation can reposition and
    // rebuild independently sorted row layers after some render groups have
    // already been prepared, showing moving seams through tall objects.
    // The frame stamp keeps the onRender fallback (see initialize) from
    // running preparation a second time in the same frame.
    if (PIXI.TextureSource) {
        this._prepareV8Frame();
    }
};

Tilemap.prototype._prepareV8Frame = function() {
    this._v8PreparedFrame = Graphics.frameCount;
    // The try/catch matches the onRender bridge's semantics: plugin
    // updateTransform chains that end in the legacy no-args
    // PIXI.Container.updateTransform (UltraMode7 does) throw on v8 after
    // their real work is done, and that throw is expected and non-fatal.
    try {
        this.updateTransform();
    } catch (e) { /* legacy PIXI tail; repaint work already done */ }
    this._syncV8TileLayers();
};

Tilemap.prototype._syncV8TileLayers = function() {
    const synced = new Set();
    const sync = layer => {
        if (!layer || synced.has(layer)) return;
        synced.add(layer);
        if (typeof layer._syncV8Backend === "function") layer._syncV8Backend();
    };
    for (const child of this.children) sync(child);
    sync(this._lowerLayer);
    sync(this._upperLayer);
};

/**
 * Sets the bitmaps used as a tileset.
 *
 * @param {array} bitmaps - The array of the tileset bitmaps.
 */
Tilemap.prototype.setBitmaps = function(bitmaps) {
    // [Note] We wait for the images to finish loading. Creating textures
    //   from bitmaps that are not yet loaded here brings some maintenance
    //   difficulties. e.g. PIXI overwrites img.onload internally.
    this._bitmaps = bitmaps;
    const listener = this._updateBitmaps.bind(this);
    for (const bitmap of this._bitmaps) {
        if (!bitmap.isReady()) {
            bitmap.addLoadListener(listener);
        }
    }
    this._needsBitmapsUpdate = true;
    this._updateBitmaps();
};

/**
 * Forces to repaint the entire tilemap.
 */
Tilemap.prototype.refresh = function() {
    this._needsRepaint = true;
};

/**
 * Updates the transform on all children of this container for rendering.
 */
Tilemap.prototype.updateTransform = function() {
    const ox = Math.ceil(this.origin.x);
    const oy = Math.ceil(this.origin.y);
    const startX = Math.floor((ox - this._margin) / this.tileWidth);
    const startY = Math.floor((oy - this._margin) / this.tileHeight);
    this._lowerLayer.x = startX * this.tileWidth - ox;
    this._lowerLayer.y = startY * this.tileHeight - oy;
    this._upperLayer.x = startX * this.tileWidth - ox;
    this._upperLayer.y = startY * this.tileHeight - oy;
    // Both layers hidden means a 3D map is standing in for them: painting
    // tiles nobody draws, every time the view crosses a tile, cost a mesh
    // rebuild per layer for nothing. The repaint waits until they show.
    const hidden = this._lowerLayer.visible === false && this._upperLayer.visible === false;
    if (
        !hidden && (
        this._needsRepaint ||
        this._lastAnimationFrame !== this.animationFrame ||
        this._lastStartX !== startX ||
        this._lastStartY !== startY)
    ) {
        this._lastAnimationFrame = this.animationFrame;
        this._lastStartX = startX;
        this._lastStartY = startY;
        this._addAllSpots(startX, startY);
        this._needsRepaint = false;
        // Keep direct plugin calls safe too: clear() hides the old mesh, so a
        // repaint must publish every replacement layer before returning.
        if (PIXI.TextureSource) this._syncV8TileLayers();
    }
    this._sortChildren();
    // v8: PIXI.Container.updateTransform is repurposed as a property-setter
    // that throws on no-args. v8 cascades transforms automatically via the
    // render pipeline, so skip the super call entirely there.
    if (!PIXI.TextureSource) {
        PIXI.Container.prototype.updateTransform.call(this);
    }
};

Tilemap.prototype._createLayers = function() {
    /*
     * [Z coordinate]
     *  0 : Lower tiles
     *  1 : Lower characters
     *  3 : Normal characters
     *  4 : Upper tiles
     *  5 : Upper characters
     *  6 : Airship shadow
     *  7 : Balloon
     *  8 : Animation
     *  9 : Destination
     */
    this._lowerLayer = new Tilemap.CombinedLayer();
    this._lowerLayer.z = 0;
    this._upperLayer = new Tilemap.CombinedLayer();
    this._upperLayer.z = 4;
    this.addChild(this._lowerLayer);
    this.addChild(this._upperLayer);
    this._needsRepaint = true;
};

Tilemap.prototype._updateBitmaps = function() {
    if (this._needsBitmapsUpdate && this.isReady()) {
        /*
         * Every tile layer on this tilemap, not only the two it made itself.
         *
         * On v5/v6/v7 the tile textures belonged to the shared renderer
         * plugin: one atlas, uploaded once, addressed by set number, and a
         * layer drew from it whether or not it had ever been handed the
         * tileset. v8 has no shared tile renderer, so each layer builds its
         * tiles out of its own image list -- and a layer that was never given
         * one silently drops every tile it is asked to draw, because there is
         * nothing to make a texture from and nothing to report.
         *
         * Plugins add layers here. TF_Billboard gives every ☆ tile that also
         * carries passage flags a layer of its own, so it can stand it up as a
         * billboard; on a wooded map those are the trees. Its layers are not
         * reachable from _lowerLayer or _upperLayer, so each tree lost exactly
         * the tiles that plugin had taken, in the shape of the tiles
         * themselves, with a clean console and an editor that looked correct
         * -- the editor runs no plugins.
         *
         * This runs behind isReady(), which is the point: handing out bitmaps
         * that have not decoded yet is worse than handing out none. See
         * _addV8Tile.
         */
        for (const child of this.children) {
            if (typeof child.setBitmaps === "function") {
                child.setBitmaps(this._bitmaps);
            }
        }
        // Named explicitly as well: a plugin is free to hold these outside the
        // child list, and they must be set up in that case too.
        if (this._lowerLayer && this._lowerLayer.parent !== this) {
            this._lowerLayer.setBitmaps(this._bitmaps);
        }
        if (this._upperLayer && this._upperLayer.parent !== this) {
            this._upperLayer.setBitmaps(this._bitmaps);
        }
        this._needsBitmapsUpdate = false;
        this._needsRepaint = true;
    }
};

Tilemap.prototype._addAllSpots = function(startX, startY) {
    this._lowerLayer.clear();
    this._upperLayer.clear();
    const widthWithMatgin = this.width + this._margin * 2;
    const heightWithMatgin = this.height + this._margin * 2;
    const tileCols = Math.ceil(widthWithMatgin / this.tileWidth) + 1;
    const tileRows = Math.ceil(heightWithMatgin / this.tileHeight) + 1;
    for (let y = 0; y < tileRows; y++) {
        for (let x = 0; x < tileCols; x++) {
            this._addSpot(startX, startY, x, y);
        }
    }
};

Tilemap.prototype._addSpot = function(startX, startY, x, y) {
    const mx = startX + x;
    const my = startY + y;
    const dx = x * this.tileWidth;
    const dy = y * this.tileHeight;
    const tileId0 = this._readMapData(mx, my, 0);
    const tileId1 = this._readMapData(mx, my, 1);
    const tileId2 = this._readMapData(mx, my, 2);
    const tileId3 = this._readMapData(mx, my, 3);
    const shadowBits = this._readMapData(mx, my, 4);
    const upperTileId1 = this._readMapData(mx, my - 1, 1);

    this._addSpotTile(tileId0, dx, dy);
    this._addSpotTile(tileId1, dx, dy);
    this._addShadow(this._lowerLayer, shadowBits, dx, dy);
    if (this._isTableTile(upperTileId1) && !this._isTableTile(tileId1)) {
        if (!Tilemap.isShadowingTile(tileId0)) {
            this._addTableEdge(this._lowerLayer, upperTileId1, dx, dy);
        }
    }
    if (this._isOverpassPosition(mx, my)) {
        this._addTile(this._upperLayer, tileId2, dx, dy);
        this._addTile(this._upperLayer, tileId3, dx, dy);
    } else {
        this._addSpotTile(tileId2, dx, dy);
        this._addSpotTile(tileId3, dx, dy);
    }
};

Tilemap.prototype._addSpotTile = function(tileId, dx, dy) {
    if (this._isHigherTile(tileId)) {
        this._addTile(this._upperLayer, tileId, dx, dy);
    } else {
        this._addTile(this._lowerLayer, tileId, dx, dy);
    }
};

Tilemap.prototype._addTile = function(layer, tileId, dx, dy) {
    if (Tilemap.isVisibleTile(tileId)) {
        if (Tilemap.isAutotile(tileId)) {
            this._addAutotile(layer, tileId, dx, dy);
        } else {
            this._addNormalTile(layer, tileId, dx, dy);
        }
    }
};

Tilemap.prototype._addNormalTile = function(layer, tileId, dx, dy) {
    let setNumber = 0;

    if (Tilemap.isTileA5(tileId)) {
        setNumber = 4;
    } else {
        setNumber = 5 + Math.floor(tileId / 256);
    }

    const w = this.tileWidth;
    const h = this.tileHeight;
    const sx = ((Math.floor(tileId / 128) % 2) * 8 + (tileId % 8)) * w;
    const sy = (Math.floor((tileId % 256) / 8) % 16) * h;

    layer.addRect(setNumber, sx, sy, dx, dy, w, h);
};

Tilemap.prototype._addAutotile = function(layer, tileId, dx, dy) {
    const kind = Tilemap.getAutotileKind(tileId);
    const shape = Tilemap.getAutotileShape(tileId);
    const tx = kind % 8;
    const ty = Math.floor(kind / 8);
    let setNumber = 0;
    let bx = 0;
    let by = 0;
    let autotileTable = Tilemap.FLOOR_AUTOTILE_TABLE;
    let isTable = false;

    if (Tilemap.isTileA1(tileId)) {
        const waterSurfaceIndex = [0, 1, 2, 1][this.animationFrame % 4];
        setNumber = 0;
        if (kind === 0) {
            bx = waterSurfaceIndex * 2;
            by = 0;
        } else if (kind === 1) {
            bx = waterSurfaceIndex * 2;
            by = 3;
        } else if (kind === 2) {
            bx = 6;
            by = 0;
        } else if (kind === 3) {
            bx = 6;
            by = 3;
        } else {
            bx = Math.floor(tx / 4) * 8;
            by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
            if (kind % 2 === 0) {
                bx += waterSurfaceIndex * 2;
            } else {
                bx += 6;
                autotileTable = Tilemap.WATERFALL_AUTOTILE_TABLE;
                by += this.animationFrame % 3;
            }
        }
    } else if (Tilemap.isTileA2(tileId)) {
        setNumber = 1;
        bx = tx * 2;
        by = (ty - 2) * 3;
        isTable = this._isTableTile(tileId);
    } else if (Tilemap.isTileA3(tileId)) {
        setNumber = 2;
        bx = tx * 2;
        by = (ty - 6) * 2;
        autotileTable = Tilemap.WALL_AUTOTILE_TABLE;
    } else if (Tilemap.isTileA4(tileId)) {
        setNumber = 3;
        bx = tx * 2;
        by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0));
        if (ty % 2 === 1) {
            autotileTable = Tilemap.WALL_AUTOTILE_TABLE;
        }
    }

    const table = autotileTable[shape];
    const w1 = this.tileWidth / 2;
    const h1 = this.tileHeight / 2;
    for (let i = 0; i < 4; i++) {
        const qsx = table[i][0];
        const qsy = table[i][1];
        const sx1 = (bx * 2 + qsx) * w1;
        const sy1 = (by * 2 + qsy) * h1;
        const dx1 = dx + (i % 2) * w1;
        const dy1 = dy + Math.floor(i / 2) * h1;
        if (isTable && (qsy === 1 || qsy === 5)) {
            const qsx2 = qsy === 1 ? (4 - qsx) % 4 : qsx;
            const qsy2 = 3;
            const sx2 = (bx * 2 + qsx2) * w1;
            const sy2 = (by * 2 + qsy2) * h1;
            layer.addRect(setNumber, sx2, sy2, dx1, dy1, w1, h1);
            layer.addRect(setNumber, sx1, sy1, dx1, dy1 + h1 / 2, w1, h1 / 2);
        } else {
            layer.addRect(setNumber, sx1, sy1, dx1, dy1, w1, h1);
        }
    }
};

Tilemap.prototype._addTableEdge = function(layer, tileId, dx, dy) {
    if (Tilemap.isTileA2(tileId)) {
        const autotileTable = Tilemap.FLOOR_AUTOTILE_TABLE;
        const kind = Tilemap.getAutotileKind(tileId);
        const shape = Tilemap.getAutotileShape(tileId);
        const tx = kind % 8;
        const ty = Math.floor(kind / 8);
        const setNumber = 1;
        const bx = tx * 2;
        const by = (ty - 2) * 3;
        const table = autotileTable[shape];
        const w1 = this.tileWidth / 2;
        const h1 = this.tileHeight / 2;
        for (let i = 0; i < 2; i++) {
            const qsx = table[2 + i][0];
            const qsy = table[2 + i][1];
            const sx1 = (bx * 2 + qsx) * w1;
            const sy1 = (by * 2 + qsy) * h1 + h1 / 2;
            const dx1 = dx + (i % 2) * w1;
            const dy1 = dy + Math.floor(i / 2) * h1;
            layer.addRect(setNumber, sx1, sy1, dx1, dy1, w1, h1 / 2);
        }
    }
};

Tilemap.prototype._addShadow = function(layer, shadowBits, dx, dy) {
    if (shadowBits & 0x0f) {
        const w1 = this.tileWidth / 2;
        const h1 = this.tileHeight / 2;
        for (let i = 0; i < 4; i++) {
            if (shadowBits & (1 << i)) {
                const dx1 = dx + (i % 2) * w1;
                const dy1 = dy + Math.floor(i / 2) * h1;
                layer.addRect(-1, 0, 0, dx1, dy1, w1, h1);
            }
        }
    }
};

Tilemap.prototype._readMapData = function(x, y, z) {
    if (this._mapData) {
        const width = this._mapWidth;
        const height = this._mapHeight;
        if (this.horizontalWrap) {
            x = x.mod(width);
        }
        if (this.verticalWrap) {
            y = y.mod(height);
        }
        if (x >= 0 && x < width && y >= 0 && y < height) {
            return this._mapData[(z * height + y) * width + x] || 0;
        } else {
            return 0;
        }
    } else {
        return 0;
    }
};

Tilemap.prototype._isHigherTile = function(tileId) {
    return this.flags[tileId] & 0x10;
};

Tilemap.prototype._isTableTile = function(tileId) {
    return Tilemap.isTileA2(tileId) && this.flags[tileId] & 0x80;
};

Tilemap.prototype._isOverpassPosition = function(/*mx, my*/) {
    return false;
};

Tilemap.prototype._sortChildren = function() {
    const before = PIXI.TextureSource ? this.children.slice() : null;
    this.children.sort(this._compareChildOrder.bind(this));
    if (before && before.some((child, index) => child !== this.children[index])) {
        const renderGroup = this.renderGroup || this.parentRenderGroup;
        if (renderGroup) renderGroup.structureDidChange = true;
    }
};

Tilemap.prototype._compareChildOrder = function(a, b) {
    // Coalesce undefined fields: a single NaN result makes the comparator
    // inconsistent and Array.prototype.sort then returns ARBITRARY order
    // for the whole array (layer flips, characters above upper tiles).
    const az = a.z || 0;
    const bz = b.z || 0;
    if (az !== bz) {
        return az - bz;
    }
    const ay = a.y || 0;
    const by = b.y || 0;
    if (ay !== by) {
        return ay - by;
    }
    return (a.spriteId || 0) - (b.spriteId || 0);
};

//:::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// Tile type checkers

Tilemap.TILE_ID_B = 0;
Tilemap.TILE_ID_C = 256;
Tilemap.TILE_ID_D = 512;
Tilemap.TILE_ID_E = 768;
Tilemap.TILE_ID_A5 = 1536;
Tilemap.TILE_ID_A1 = 2048;
Tilemap.TILE_ID_A2 = 2816;
Tilemap.TILE_ID_A3 = 4352;
Tilemap.TILE_ID_A4 = 5888;
Tilemap.TILE_ID_MAX = 8192;

Tilemap.isVisibleTile = function(tileId) {
    return tileId > 0 && tileId < this.TILE_ID_MAX;
};

Tilemap.isAutotile = function(tileId) {
    return tileId >= this.TILE_ID_A1;
};

Tilemap.getAutotileKind = function(tileId) {
    return Math.floor((tileId - this.TILE_ID_A1) / 48);
};

Tilemap.getAutotileShape = function(tileId) {
    return (tileId - this.TILE_ID_A1) % 48;
};

Tilemap.makeAutotileId = function(kind, shape) {
    return this.TILE_ID_A1 + kind * 48 + shape;
};

Tilemap.isSameKindTile = function(tileID1, tileID2) {
    if (this.isAutotile(tileID1) && this.isAutotile(tileID2)) {
        return this.getAutotileKind(tileID1) === this.getAutotileKind(tileID2);
    } else {
        return tileID1 === tileID2;
    }
};

Tilemap.isTileA1 = function(tileId) {
    return tileId >= this.TILE_ID_A1 && tileId < this.TILE_ID_A2;
};

Tilemap.isTileA2 = function(tileId) {
    return tileId >= this.TILE_ID_A2 && tileId < this.TILE_ID_A3;
};

Tilemap.isTileA3 = function(tileId) {
    return tileId >= this.TILE_ID_A3 && tileId < this.TILE_ID_A4;
};

Tilemap.isTileA4 = function(tileId) {
    return tileId >= this.TILE_ID_A4 && tileId < this.TILE_ID_MAX;
};

Tilemap.isTileA5 = function(tileId) {
    return tileId >= this.TILE_ID_A5 && tileId < this.TILE_ID_A1;
};

Tilemap.isWaterTile = function(tileId) {
    if (this.isTileA1(tileId)) {
        return !(
            tileId >= this.TILE_ID_A1 + 96 && tileId < this.TILE_ID_A1 + 192
        );
    } else {
        return false;
    }
};

Tilemap.isWaterfallTile = function(tileId) {
    if (tileId >= this.TILE_ID_A1 + 192 && tileId < this.TILE_ID_A2) {
        return this.getAutotileKind(tileId) % 2 === 1;
    } else {
        return false;
    }
};

Tilemap.isGroundTile = function(tileId) {
    return (
        this.isTileA1(tileId) || this.isTileA2(tileId) || this.isTileA5(tileId)
    );
};

Tilemap.isShadowingTile = function(tileId) {
    return this.isTileA3(tileId) || this.isTileA4(tileId);
};

Tilemap.isRoofTile = function(tileId) {
    return this.isTileA3(tileId) && this.getAutotileKind(tileId) % 16 < 8;
};

Tilemap.isWallTopTile = function(tileId) {
    return this.isTileA4(tileId) && this.getAutotileKind(tileId) % 16 < 8;
};

Tilemap.isWallSideTile = function(tileId) {
    return (
        (this.isTileA3(tileId) || this.isTileA4(tileId)) &&
        this.getAutotileKind(tileId) % 16 >= 8
    );
};

Tilemap.isWallTile = function(tileId) {
    return this.isWallTopTile(tileId) || this.isWallSideTile(tileId);
};

Tilemap.isFloorTypeAutotile = function(tileId) {
    return (
        (this.isTileA1(tileId) && !this.isWaterfallTile(tileId)) ||
        this.isTileA2(tileId) ||
        this.isWallTopTile(tileId)
    );
};

Tilemap.isWallTypeAutotile = function(tileId) {
    return this.isRoofTile(tileId) || this.isWallSideTile(tileId);
};

Tilemap.isWaterfallTypeAutotile = function(tileId) {
    return this.isWaterfallTile(tileId);
};

//:::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// Autotile shape number to coordinates of tileset images

// prettier-ignore
Tilemap.FLOOR_AUTOTILE_TABLE = [
    [[2, 4], [1, 4], [2, 3], [1, 3]],
    [[2, 0], [1, 4], [2, 3], [1, 3]],
    [[2, 4], [3, 0], [2, 3], [1, 3]],
    [[2, 0], [3, 0], [2, 3], [1, 3]],
    [[2, 4], [1, 4], [2, 3], [3, 1]],
    [[2, 0], [1, 4], [2, 3], [3, 1]],
    [[2, 4], [3, 0], [2, 3], [3, 1]],
    [[2, 0], [3, 0], [2, 3], [3, 1]],
    [[2, 4], [1, 4], [2, 1], [1, 3]],
    [[2, 0], [1, 4], [2, 1], [1, 3]],
    [[2, 4], [3, 0], [2, 1], [1, 3]],
    [[2, 0], [3, 0], [2, 1], [1, 3]],
    [[2, 4], [1, 4], [2, 1], [3, 1]],
    [[2, 0], [1, 4], [2, 1], [3, 1]],
    [[2, 4], [3, 0], [2, 1], [3, 1]],
    [[2, 0], [3, 0], [2, 1], [3, 1]],
    [[0, 4], [1, 4], [0, 3], [1, 3]],
    [[0, 4], [3, 0], [0, 3], [1, 3]],
    [[0, 4], [1, 4], [0, 3], [3, 1]],
    [[0, 4], [3, 0], [0, 3], [3, 1]],
    [[2, 2], [1, 2], [2, 3], [1, 3]],
    [[2, 2], [1, 2], [2, 3], [3, 1]],
    [[2, 2], [1, 2], [2, 1], [1, 3]],
    [[2, 2], [1, 2], [2, 1], [3, 1]],
    [[2, 4], [3, 4], [2, 3], [3, 3]],
    [[2, 4], [3, 4], [2, 1], [3, 3]],
    [[2, 0], [3, 4], [2, 3], [3, 3]],
    [[2, 0], [3, 4], [2, 1], [3, 3]],
    [[2, 4], [1, 4], [2, 5], [1, 5]],
    [[2, 0], [1, 4], [2, 5], [1, 5]],
    [[2, 4], [3, 0], [2, 5], [1, 5]],
    [[2, 0], [3, 0], [2, 5], [1, 5]],
    [[0, 4], [3, 4], [0, 3], [3, 3]],
    [[2, 2], [1, 2], [2, 5], [1, 5]],
    [[0, 2], [1, 2], [0, 3], [1, 3]],
    [[0, 2], [1, 2], [0, 3], [3, 1]],
    [[2, 2], [3, 2], [2, 3], [3, 3]],
    [[2, 2], [3, 2], [2, 1], [3, 3]],
    [[2, 4], [3, 4], [2, 5], [3, 5]],
    [[2, 0], [3, 4], [2, 5], [3, 5]],
    [[0, 4], [1, 4], [0, 5], [1, 5]],
    [[0, 4], [3, 0], [0, 5], [1, 5]],
    [[0, 2], [3, 2], [0, 3], [3, 3]],
    [[0, 2], [1, 2], [0, 5], [1, 5]],
    [[0, 4], [3, 4], [0, 5], [3, 5]],
    [[2, 2], [3, 2], [2, 5], [3, 5]],
    [[0, 2], [3, 2], [0, 5], [3, 5]],
    [[0, 0], [1, 0], [0, 1], [1, 1]]
];

// prettier-ignore
Tilemap.WALL_AUTOTILE_TABLE = [
    [[2, 2], [1, 2], [2, 1], [1, 1]],
    [[0, 2], [1, 2], [0, 1], [1, 1]],
    [[2, 0], [1, 0], [2, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[2, 2], [3, 2], [2, 1], [3, 1]],
    [[0, 2], [3, 2], [0, 1], [3, 1]],
    [[2, 0], [3, 0], [2, 1], [3, 1]],
    [[0, 0], [3, 0], [0, 1], [3, 1]],
    [[2, 2], [1, 2], [2, 3], [1, 3]],
    [[0, 2], [1, 2], [0, 3], [1, 3]],
    [[2, 0], [1, 0], [2, 3], [1, 3]],
    [[0, 0], [1, 0], [0, 3], [1, 3]],
    [[2, 2], [3, 2], [2, 3], [3, 3]],
    [[0, 2], [3, 2], [0, 3], [3, 3]],
    [[2, 0], [3, 0], [2, 3], [3, 3]],
    [[0, 0], [3, 0], [0, 3], [3, 3]]
];

// prettier-ignore
Tilemap.WATERFALL_AUTOTILE_TABLE = [
    [[2, 0], [1, 0], [2, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[2, 0], [3, 0], [2, 1], [3, 1]],
    [[0, 0], [3, 0], [0, 1], [3, 1]]
];

//:::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// Internal classes

Tilemap.Layer = function() {
    this.initialize(...arguments);
};

Tilemap.Layer.prototype = Object.create(PIXI.Container.prototype);
Tilemap.Layer.prototype.constructor = Tilemap.Layer;

Tilemap.Layer.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);
    this._elements = [];
    this._indexBuffer = null;
    this._indexArray = new Float32Array(0);
    this._vertexBuffer = null;
    this._vertexArray = new Float32Array(0);
    this._vao = null;
    this._needsTexturesUpdate = false;
    this._needsVertexUpdate = false;
    this._images = [];
    this._state = PIXI.State.for2d();
    this._createVao();
    if (PIXI.TextureSource) {
        this._v8Backend = null;
        this._v8Atlas = null;
        this._v8Geometry = null;
        this._v8Mesh = null;
        this._v8MeshDirty = false;
        this._v8TileRoot = new PIXI.Container();
        this._v8TileRoot.eventMode = "none";
        this.addChild(this._v8TileRoot);
        Tilemap.Layer._v8Stats().layers++;
    }
};

Tilemap.Layer.MAX_GL_TEXTURES = 3;
Tilemap.Layer.VERTEX_STRIDE = 9 * 4;
Tilemap.Layer.MAX_SIZE = 16000;
Tilemap.Layer.V8_ATLAS_COLUMNS = 4;
Tilemap.Layer.V8_ATLAS_ROWS = 3;
Tilemap.Layer.V8_ATLAS_SLOT_SIZE = 1024;
Tilemap.Layer._v8AtlasCache = new WeakMap();

Tilemap.Layer._v8Stats = function() {
    const root = typeof globalThis !== "undefined" ? globalThis : window;
    if (!root.$reactorTilemapStats) {
        root.$reactorTilemapStats = {
            requested: String(root.$reactorTilemapBackend || "auto"),
            backend: "pending",
            layers: 0,
            activeMeshes: 0,
            meshBuilds: 0,
            meshBuildMs: 0,
            lastRectCount: 0,
            lastVertexCount: 0,
            spriteAllocations: 0,
            spritePoolHits: 0,
            fallbacks: 0,
            fallbackReason: ""
        };
    }
    return root.$reactorTilemapStats;
};

Tilemap.Layer._requestedV8Backend = function() {
    const root = typeof globalThis !== "undefined" ? globalThis : window;
    const requested = String(root.$reactorTilemapBackend || "auto").toLowerCase();
    return requested === "sprites" || requested === "sprite" ? "sprites" :
        requested === "mesh" ? "mesh" : "auto";
};

Tilemap.Layer._acquireV8Atlas = function(bitmaps) {
    let entry = this._v8AtlasCache.get(bitmaps);
    if (entry) {
        entry.refs++;
        return entry;
    }
    if (typeof document === "undefined" || !PIXI.CanvasSource || !PIXI.Texture) {
        throw new Error("PIXI 8 canvas textures are unavailable");
    }
    const slot = this.V8_ATLAS_SLOT_SIZE;
    const width = this.V8_ATLAS_COLUMNS * slot;
    const height = this.V8_ATLAS_ROWS * slot;
    const renderer = typeof Graphics !== "undefined" && Graphics.app && Graphics.app.renderer;
    const gl = renderer && renderer.gl;
    if (gl && gl.getParameter(gl.MAX_TEXTURE_SIZE) < Math.max(width, height)) {
        throw new Error(`GPU texture limit is below ${Math.max(width, height)}`);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create the tile atlas canvas");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    const images = bitmaps.map(bitmap => bitmap && (bitmap.image || bitmap.canvas));
    for (let i = 0; i < images.length && i < 11; i++) {
        const image = images[i];
        if (!image) continue;
        const imageWidth = image.naturalWidth || image.videoWidth || image.width || 0;
        const imageHeight = image.naturalHeight || image.videoHeight || image.height || 0;
        if (!imageWidth || !imageHeight) continue;
        if (imageWidth > slot || imageHeight > slot) {
            throw new Error(`tileset sheet ${i} exceeds the ${slot}px atlas slot`);
        }
        const x = (i % this.V8_ATLAS_COLUMNS) * slot;
        const y = Math.floor(i / this.V8_ATLAS_COLUMNS) * slot;
        context.drawImage(image, x, y);
    }
    const shadowSlot = 11;
    const shadowX = (shadowSlot % this.V8_ATLAS_COLUMNS) * slot;
    const shadowY = Math.floor(shadowSlot / this.V8_ATLAS_COLUMNS) * slot;
    context.fillStyle = "rgba(0,0,0,0.5)";
    context.fillRect(shadowX, shadowY, 1, 1);
    const source = new PIXI.CanvasSource({
        resource: canvas,
        scaleMode: "nearest",
        addressMode: "clamp-to-edge",
        autoGenerateMipmaps: false
    });
    const texture = new PIXI.Texture({ source });
    entry = { bitmaps, canvas, source, texture, width, height, shadowX, shadowY, refs: 1 };
    this._v8AtlasCache.set(bitmaps, entry);
    return entry;
};

Tilemap.Layer._releaseV8Atlas = function(entry) {
    if (!entry || --entry.refs > 0) return;
    this._v8AtlasCache.delete(entry.bitmaps);
    if (entry.texture && !entry.texture.destroyed) {
        Tilemap.Layer._unbindV8AtlasSource(entry.source);
        entry.texture.destroy(true);
    }
};

// The mesh pipe's shared shader keeps the last-drawn texture source in
// its resources (uTexture/uSampler) after the final draw, so destroying
// the atlas source while it is still bound makes every map transfer warn
// "[BindGroup] a 'textureSource' was destroyed while still bound to a
// shader". Point those slots at the empty texture first. Every access is
// guarded: on a renderer without this shape nothing happens and the
// warning stays cosmetic (PIXI nulls the dead slot itself).
Tilemap.Layer._unbindV8AtlasSource = function(source) {
    try {
        if (!source) return;
        const app = typeof Graphics !== "undefined" ? Graphics.app : null;
        const pipes = app && app.renderer && app.renderer.renderPipes;
        const adaptor = pipes && pipes.mesh && pipes.mesh._adaptor;
        const resources = adaptor && adaptor._shader && adaptor._shader.resources;
        if (!resources) return;
        const empty = PIXI.Texture && PIXI.Texture.EMPTY;
        if (!empty || !empty.source) return;
        if (resources.uTexture === source) resources.uTexture = empty.source;
        if (resources.uSampler === source.style) resources.uSampler = empty.source.style;
    } catch (error) {
        // Cosmetic only — the warning self-heals.
    }
};

// v8 tile textures register on their (session-cached) source's resize
// listener list, so dropping the cache without destroying them retains
// every texture for the whole session — one leaked batch per map transfer.
Tilemap.Layer.prototype._destroyV8TexCache = function() {
    if (this._v8TileRoot) {
        for (const child of [...this._v8TileRoot.children]) {
            if (!child._reactorTileSprite) continue;
            this._v8TileRoot.removeChild(child);
            if (!child.destroyed) child.destroy();
        }
    }
    if (this._v8TexCache) {
        for (const texture of this._v8TexCache.values()) {
            if (texture && !texture.destroyed) {
                texture.destroy();
            }
        }
        this._v8TexCache = null;
    }
    if (this._v8SpritePool) {
        for (const sprite of this._v8SpritePool) {
            if (sprite && !sprite.destroyed) {
                sprite.destroy();
            }
        }
        this._v8SpritePool = null;
    }
};

Tilemap.Layer.prototype._destroyV8Mesh = function() {
    if (this._v8Mesh) {
        if (this._v8Mesh.parent) this._v8Mesh.parent.removeChild(this._v8Mesh);
        this._v8Mesh.destroy({ texture: false, textureSource: false });
        this._v8Mesh = null;
        Tilemap.Layer._v8Stats().activeMeshes--;
    }
    if (this._v8Geometry) {
        this._v8Geometry.destroy(true);
        this._v8Geometry = null;
    }
    if (this._v8Atlas) {
        Tilemap.Layer._releaseV8Atlas(this._v8Atlas);
        this._v8Atlas = null;
    }
};

Tilemap.Layer.prototype._setupV8Backend = function(bitmaps) {
    this._destroyV8Mesh();
    this._destroyV8TexCache();
    const stats = Tilemap.Layer._v8Stats();
    const requested = Tilemap.Layer._requestedV8Backend();
    stats.requested = requested;
    if (requested === "sprites") {
        this._v8Backend = "sprites";
        stats.backend = "sprites";
        return;
    }
    try {
        if (typeof PIXI.Mesh !== "function" || typeof PIXI.MeshGeometry !== "function") {
            throw new Error("PIXI 8 mesh classes are unavailable");
        }
        this._v8Atlas = Tilemap.Layer._acquireV8Atlas(bitmaps);
        this._v8Geometry = new PIXI.MeshGeometry({
            positions: new Float32Array(8),
            uvs: new Float32Array(8),
            indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
            shrinkBuffersToFit: false
        });
        this._v8Geometry.batchMode = "no-batch";
        this._v8Mesh = new PIXI.Mesh({
            geometry: this._v8Geometry,
            texture: this._v8Atlas.texture,
            roundPixels: true
        });
        this._v8Mesh.eventMode = "none";
        this._v8Mesh.visible = false;
        this._v8TileRoot.addChild(this._v8Mesh);
        this._v8Backend = "mesh";
        this._v8MeshDirty = true;
        stats.backend = "mesh";
        stats.activeMeshes++;
    } catch (error) {
        this._destroyV8Mesh();
        this._v8Backend = "sprites";
        stats.backend = "sprites";
        stats.fallbacks++;
        stats.fallbackReason = error && error.message ? error.message : String(error);
    }
};

Tilemap.Layer.prototype._switchV8ToSprites = function(reason) {
    const elements = this._elements.slice();
    this._destroyV8Mesh();
    this._destroyV8TexCache();
    this._v8Backend = "sprites";
    const stats = Tilemap.Layer._v8Stats();
    stats.backend = "sprites";
    stats.fallbacks++;
    stats.fallbackReason = reason && reason.message ? reason.message : String(reason || "mesh failed");
    for (const item of elements) this._addV8Tile(...item);
};

Tilemap.Layer.prototype.destroy = function(options) {
    if (this.destroyed) return;
    if (this._vao) {
        this._vao.destroy();
        this._indexBuffer.destroy();
        this._vertexBuffer.destroy();
    }
    this._indexBuffer = null;
    this._vertexBuffer = null;
    this._vao = null;
    this._destroyV8Mesh();
    this._destroyV8TexCache();
    if (this._v8TileRoot) {
        if (this._v8TileRoot.parent) this._v8TileRoot.parent.removeChild(this._v8TileRoot);
        this._v8TileRoot.destroy({ children: true, texture: false, textureSource: false });
        this._v8TileRoot = null;
    }
    PIXI.Container.prototype.destroy.call(this, options);
};

Tilemap.Layer.prototype.setBitmaps = function(bitmaps) {
    this._images = bitmaps.map(bitmap => bitmap.image || bitmap.canvas);
    this._needsTexturesUpdate = true;
    // v8: tile textures are cached per (set, frame); a tileset change
    // invalidates them.
    this._destroyV8TexCache();
    if (PIXI.TextureSource) this._setupV8Backend(bitmaps);
};

Tilemap.Layer.prototype.clear = function() {
    this._elements.length = 0;
    this._needsVertexUpdate = true;
    // v8: park the tile Sprites in a DETACHED pool and reuse them on the
    // next paint. Destroying and recreating ~2k sprites on every repaint
    // (each scroll across the painted-region boundary) cost a 77ms frame
    // spike; pooling makes repaints nearly allocation-free. Parking
    // (instead of in-place cursor reuse) guarantees no stale tiles can
    // ever remain visible: only sprites the current paint explicitly
    // placed are in the tree.
    if (PIXI.TextureSource && this._v8Backend === "mesh") {
        this._v8MeshDirty = true;
        if (this._v8Mesh) this._v8Mesh.visible = false;
    } else if (PIXI.TextureSource) {
        if (!this._v8SpritePool) this._v8SpritePool = [];
        if (this._v8TileRoot && this._v8TileRoot.children.length > 0) {
            for (const child of [...this._v8TileRoot.children]) {
                if (!child._reactorTileSprite) continue;
                this._v8SpritePool.push(child);
                this._v8TileRoot.removeChild(child);
            }
        }
    }
};

Tilemap.Layer.prototype.size = function() {
    return this._elements.length;
};

Tilemap.Layer.prototype.addRect = function(setNumber, sx, sy, dx, dy, w, h) {
    this._elements.push([setNumber, sx, sy, dx, dy, w, h]);
    this._v8MeshDirty = true;
    if (PIXI.TextureSource && this._v8Backend !== "mesh") {
        this._addV8Tile(setNumber, sx, sy, dx, dy, w, h);
    }
};

Tilemap.Layer.prototype._syncV8Backend = function() {
    if (!PIXI.TextureSource || !this._v8TileRoot) return;
    const ultraMode7 = typeof UltraMode7 !== "undefined" &&
        typeof UltraMode7.isActive === "function" && UltraMode7.isActive();
    this._v8TileRoot.visible = !ultraMode7;
    if (ultraMode7 || this._v8Backend !== "mesh" || !this._v8MeshDirty) return;
    try {
        const count = this._elements.length;
        const positions = new Float32Array(count * 8);
        const uvs = new Float32Array(count * 8);
        const indices = new Uint32Array(count * 6);
        const atlas = this._v8Atlas;
        const slot = Tilemap.Layer.V8_ATLAS_SLOT_SIZE;
        const columns = Tilemap.Layer.V8_ATLAS_COLUMNS;
        let vertexAt = 0;
        let indexAt = 0;
        const started = typeof performance !== "undefined" ? performance.now() : 0;
        for (let n = 0; n < count; n++) {
            const item = this._elements[n];
            const setNumber = item[0];
            const sx = item[1];
            const sy = item[2];
            const dx = item[3];
            const dy = item[4];
            const w = item[5];
            const h = item[6];
            positions.set([
                dx, dy,
                dx + w, dy,
                dx + w, dy + h,
                dx, dy + h
            ], vertexAt * 2);
            let left;
            let top;
            let right;
            let bottom;
            if (setNumber < 0) {
                left = right = (atlas.shadowX + 0.5) / atlas.width;
                top = bottom = (atlas.shadowY + 0.5) / atlas.height;
            } else {
                if (setNumber >= 11) throw new Error(`tileset sheet ${setNumber} is outside the mesh atlas`);
                const offsetX = (setNumber % columns) * slot;
                const offsetY = Math.floor(setNumber / columns) * slot;
                // Inset the UV rect by a hair, not half a texel. Interpolated
                // fragment UVs stay strictly inside the vertex bounds, so a
                // tiny inset is enough to keep a quad edge from ever sampling
                // the neighbouring atlas row; a half-texel inset compresses w
                // texels into a (w - 1) span, and the moment the tilemap sits
                // at a fractional screen position or any zoom, one texel row
                // per tile duplicates or drops — crawling horizontal seams
                // whenever a camera pans or zooms.
                const inset = 1 / 128;
                left = (offsetX + sx + inset) / atlas.width;
                top = (offsetY + sy + inset) / atlas.height;
                right = (offsetX + sx + w - inset) / atlas.width;
                bottom = (offsetY + sy + h - inset) / atlas.height;
            }
            uvs.set([left, top, right, top, right, bottom, left, bottom], vertexAt * 2);
            indices.set([
                vertexAt, vertexAt + 1, vertexAt + 2,
                vertexAt, vertexAt + 2, vertexAt + 3
            ], indexAt);
            vertexAt += 4;
            indexAt += 6;
        }
        this._v8Geometry.positions = positions;
        this._v8Geometry.uvs = uvs;
        this._v8Geometry.indices = indices;
        this._v8Mesh.visible = count > 0;
        this._v8MeshDirty = false;
        const stats = Tilemap.Layer._v8Stats();
        stats.meshBuilds++;
        stats.lastRectCount = count;
        stats.lastVertexCount = count * 4;
        if (started) stats.meshBuildMs += performance.now() - started;
    } catch (error) {
        this._switchV8ToSprites(error);
    }
};

Tilemap.Layer.prototype._addV8Tile = function(setNumber, sx, sy, dx, dy, w, h) {
    const isShadow = setNumber < 0;
    const image = isShadow ? null : this._images[setNumber];
    if (!isShadow && !image) return;
    /*
     * An image that has not decoded yet must not become a texture source.
     *
     * The source is cached on the image element and lives for the session, so
     * one built from an image measuring nothing is 1x1 forever -- and every
     * tile drawn from that sheet afterwards samples a single pixel and comes
     * out as one flat colour. A forest turns into plain green squares, and it
     * never recovers, because the sheet finishing loading does not invalidate
     * anything. Paints run every frame from updateTransform, including the
     * frames before the tileset arrives, so this is reachable in normal play
     * and not a theoretical case. Skipping the tile costs one repaint;
     * _updateBitmaps sets _needsRepaint when the images are genuinely ready.
     */
    if (!isShadow && !image.width && !image.naturalWidth && !image.videoWidth) return;
    // Cache a TextureSource per source image to avoid recreating on every tile.
    // scaleMode MUST be 'nearest' for tile sources -- with linear (the v8
    // default) we get sub-texel interpolation across tile edges in the source
    // image, which manifests as vertical/horizontal "garbage seams" between
    // adjacent tiles on screen. Original MZ Tilemap.Renderer._createInternalTextures
    // hardcoded SCALE_MODES.NEAREST for the same reason.
    if (!isShadow && !image.__pixiTilemapSource) {
        try {
            let SourceClass = PIXI.TextureSource;
            if (typeof HTMLImageElement !== "undefined" &&
                image instanceof HTMLImageElement) {
                SourceClass = PIXI.ImageSource || PIXI.TextureSource;
            } else if (typeof HTMLCanvasElement !== "undefined" &&
                       image instanceof HTMLCanvasElement) {
                SourceClass = PIXI.CanvasSource || PIXI.TextureSource;
            }
            image.__pixiTilemapSource = new SourceClass({
                resource: image,
                scaleMode: "nearest"
            });
        } catch (e) {
            return;
        }
    }
    try {
        // Texture cache: tiles repeat heavily, so after warmup repaints
        // create no textures at all.
        let texture = PIXI.Texture.WHITE;
        if (!isShadow) {
            if (!this._v8TexCache) this._v8TexCache = new Map();
            const key = setNumber + ":" + sx + ":" + sy + ":" + w + ":" + h;
            texture = this._v8TexCache.get(key);
            if (!texture) {
                texture = new PIXI.Texture({
                    source: image.__pixiTilemapSource,
                    frame: new PIXI.Rectangle(sx, sy, w, h)
                });
                this._v8TexCache.set(key, texture);
            }
        }
        // Sprite reuse from the detached pool; only allocate when the
        // viewport genuinely needs more tiles than any previous paint.
        let sprite = this._v8SpritePool && this._v8SpritePool.pop();
        if (sprite) {
            if (sprite.texture !== texture) sprite.texture = texture;
            Tilemap.Layer._v8Stats().spritePoolHits++;
        } else {
            sprite = new PIXI.Sprite(texture);
            Tilemap.Layer._v8Stats().spriteAllocations++;
        }
        sprite._reactorTileSprite = true;
        sprite.scale.set(1, 1);
        sprite.tint = 0xffffff;
        sprite.alpha = 1;
        sprite.blendMode = "inherit";
        sprite.position.set(dx, dy);
        if (isShadow) {
            sprite.tint = 0x000000;
            sprite.alpha = 0.5;
            sprite.width = w;
            sprite.height = h;
        }
        this._v8TileRoot.addChild(sprite);
    } catch (e) { /* skip this tile */ }
};

Tilemap.Layer.prototype.render = function(renderer) {
    // v8: renderer.plugins is gone (render-plugin system removed) and our
    // rpgtilemap registration is a no-op; bail out before touching v7-only
    // primitives (renderer.batch, renderer.geometry, renderer.shader, etc.).
    // Tilemap rendering needs Phase 5 v8 rewrite.
    const tilemapRenderer =
        renderer.plugins && renderer.plugins.rpgtilemap;
    if (!tilemapRenderer ||
        typeof tilemapRenderer.getShader !== "function" ||
        !this._vao) {
        this._syncV8Backend();
        return;
    }
    const gl = renderer.gl;
    const shader = tilemapRenderer.getShader();
    const matrix = shader.uniforms.uProjectionMatrix;

    renderer.batch.setObjectRenderer(tilemapRenderer);
    renderer.projection.projectionMatrix.copyTo(matrix);
    matrix.append(this.worldTransform);
    renderer.shader.bind(shader);

    if (this._needsTexturesUpdate) {
        tilemapRenderer.updateTextures(renderer, this._images);
        this._needsTexturesUpdate = false;
    }
    tilemapRenderer.bindTextures(renderer);
    renderer.geometry.bind(this._vao, shader);
    this._updateIndexBuffer();
    if (this._needsVertexUpdate) {
        this._updateVertexBuffer();
        this._needsVertexUpdate = false;
    }
    renderer.geometry.updateBuffers();

    const numElements = this._elements.length;
    if (numElements > 0) {
        renderer.state.set(this._state);
        renderer.geometry.draw(gl.TRIANGLES, numElements * 6, 0);
    }
};

Tilemap.Layer.prototype.isReady = function() {
    if (this._images.length === 0) {
        return false;
    }
    if (PIXI.TextureSource) {
        return this._images.every(image => !image || Boolean(
            image.width || image.naturalWidth || image.videoWidth));
    }
    for (const texture of this._images) {
        if (!texture || !texture.valid) {
            return false;
        }
    }
    return true;
};

Tilemap.Layer.prototype._createVao = function() {
    // v8 rewrote Buffer (object-form constructor) and Geometry (attribute
    // descriptors instead of fluent addAttribute). Full v8 tilemap pipeline
    // is Phase 5; until then, attempt the v5/v6/v7 path and gracefully no-op
    // on v8 so boot proceeds (map will be invisible).
    try {
        const ib = new PIXI.Buffer(null, true, true);
        const vb = new PIXI.Buffer(null, true, false);
        const stride = Tilemap.Layer.VERTEX_STRIDE;
        const type = PIXI.TYPES.FLOAT;
        const geometry = new PIXI.Geometry();
        this._indexBuffer = ib;
        this._vertexBuffer = vb;
        this._vao = geometry
            .addIndex(this._indexBuffer)
            .addAttribute("aTextureId", vb, 1, false, type, stride, 0)
            .addAttribute("aFrame", vb, 4, false, type, stride, 1 * 4)
            .addAttribute("aSource", vb, 2, false, type, stride, 5 * 4)
            .addAttribute("aDest", vb, 2, false, type, stride, 7 * 4);
    } catch (e) {
        this._indexBuffer = null;
        this._vertexBuffer = null;
        this._vao = null;
    }
};

Tilemap.Layer.prototype._updateIndexBuffer = function() {
    const numElements = this._elements.length;
    if (this._indexArray.length < numElements * 6 * 2) {
        this._indexArray = PIXI.utils.createIndicesForQuads(numElements * 2);
        this._indexBuffer.update(this._indexArray);
    }
};

Tilemap.Layer.prototype._updateVertexBuffer = function() {
    const numElements = this._elements.length;
    const required = numElements * Tilemap.Layer.VERTEX_STRIDE;
    if (this._vertexArray.length < required) {
        this._vertexArray = new Float32Array(required * 2);
    }
    const vertexArray = this._vertexArray;
    let index = 0;
    for (const item of this._elements) {
        const setNumber = item[0];
        const tid = setNumber >> 2;
        const sxOffset = 1024 * (setNumber & 1);
        const syOffset = 1024 * ((setNumber >> 1) & 1);
        const sx = item[1] + sxOffset;
        const sy = item[2] + syOffset;
        const dx = item[3];
        const dy = item[4];
        const w = item[5];
        const h = item[6];
        const frameLeft = sx + 0.5;
        const frameTop = sy + 0.5;
        const frameRight = sx + w - 0.5;
        const frameBottom = sy + h - 0.5;
        vertexArray[index++] = tid;
        vertexArray[index++] = frameLeft;
        vertexArray[index++] = frameTop;
        vertexArray[index++] = frameRight;
        vertexArray[index++] = frameBottom;
        vertexArray[index++] = sx;
        vertexArray[index++] = sy;
        vertexArray[index++] = dx;
        vertexArray[index++] = dy;
        vertexArray[index++] = tid;
        vertexArray[index++] = frameLeft;
        vertexArray[index++] = frameTop;
        vertexArray[index++] = frameRight;
        vertexArray[index++] = frameBottom;
        vertexArray[index++] = sx + w;
        vertexArray[index++] = sy;
        vertexArray[index++] = dx + w;
        vertexArray[index++] = dy;
        vertexArray[index++] = tid;
        vertexArray[index++] = frameLeft;
        vertexArray[index++] = frameTop;
        vertexArray[index++] = frameRight;
        vertexArray[index++] = frameBottom;
        vertexArray[index++] = sx + w;
        vertexArray[index++] = sy + h;
        vertexArray[index++] = dx + w;
        vertexArray[index++] = dy + h;
        vertexArray[index++] = tid;
        vertexArray[index++] = frameLeft;
        vertexArray[index++] = frameTop;
        vertexArray[index++] = frameRight;
        vertexArray[index++] = frameBottom;
        vertexArray[index++] = sx;
        vertexArray[index++] = sy + h;
        vertexArray[index++] = dx;
        vertexArray[index++] = dy + h;
    }
    this._vertexBuffer.update(vertexArray);
};

Tilemap.CombinedLayer = function() {
    this.initialize(...arguments);
};

Tilemap.CombinedLayer.prototype = Object.create(PIXI.Container.prototype);
Tilemap.CombinedLayer.prototype.constructor = Tilemap.CombinedLayer;

Tilemap.CombinedLayer.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);
    for (let i = 0; i < 2; i++) {
        this.addChild(new Tilemap.Layer());
    }
};

Tilemap.CombinedLayer.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.Container.prototype.destroy.call(this, options);
};

Tilemap.CombinedLayer.prototype.setBitmaps = function(bitmaps) {
    for (const child of this.children) {
        if (typeof child.size === "function" && typeof child.addRect === "function" &&
            typeof child.setBitmaps === "function") child.setBitmaps(bitmaps);
    }
};

Tilemap.CombinedLayer.prototype.clear = function() {
    for (const child of this.children) {
        if (typeof child.size === "function" && typeof child.addRect === "function" &&
            typeof child.clear === "function") child.clear();
    }
};

Tilemap.CombinedLayer.prototype.size = function() {
    return this.children.reduce((r, child) =>
        r + (typeof child.size === "function" ? Number(child.size()) || 0 : 0), 0);
};

// prettier-ignore
Tilemap.CombinedLayer.prototype.addRect = function(
    setNumber, sx, sy, dx, dy, w, h
) {
    for (const child of this.children) {
        if (typeof child.size === "function" && typeof child.addRect === "function" &&
            child.size() < Tilemap.Layer.MAX_SIZE) {
            child.addRect(...arguments);
            break;
        }
    }
};

Tilemap.CombinedLayer.prototype.isReady = function() {
    return this.children.every(child => {
        const isTileLayer = typeof child.size === "function" && typeof child.addRect === "function";
        return !isTileLayer || typeof child.isReady !== "function" || child.isReady();
    });
};

Tilemap.CombinedLayer.prototype._syncV8Backend = function() {
    for (const child of this.children) {
        if (typeof child._syncV8Backend === "function") child._syncV8Backend();
    }
};

Tilemap.Renderer = function() {
    this.initialize(...arguments);
};

Tilemap.Renderer.prototype = Object.create(PIXI.ObjectRenderer.prototype);
Tilemap.Renderer.prototype.constructor = Tilemap.Renderer;

Tilemap.Renderer.prototype.initialize = function(renderer) {
    PIXISuper(PIXI.ObjectRenderer, this, [renderer]);
    this._shader = null;
    this._images = [];
    this._internalTextures = [];
    this._clearBuffer = new Uint8Array(1024 * 1024 * 4);
    this.contextChange();
};

Tilemap.Renderer.prototype.destroy = function() {
    PIXI.ObjectRenderer.prototype.destroy.call(this);
    this._destroyInternalTextures();
    this._shader.destroy();
    this._shader = null;
};

Tilemap.Renderer.prototype.getShader = function() {
    return this._shader;
};

Tilemap.Renderer.prototype.contextChange = function() {
    this._shader = this._createShader();
    this._images = [];
    this._createInternalTextures();
};

Tilemap.Renderer.prototype._createShader = function() {
    const vertexSrc =
        "attribute float aTextureId;" +
        "attribute vec4 aFrame;" +
        "attribute vec2 aSource;" +
        "attribute vec2 aDest;" +
        "uniform mat3 uProjectionMatrix;" +
        "varying vec4 vFrame;" +
        "varying vec2 vTextureCoord;" +
        "varying float vTextureId;" +
        "void main(void) {" +
        "  vec3 position = uProjectionMatrix * vec3(aDest, 1.0);" +
        "  gl_Position = vec4(position, 1.0);" +
        "  vFrame = aFrame;" +
        "  vTextureCoord = aSource;" +
        "  vTextureId = aTextureId;" +
        "}";
    const fragmentSrc =
        "varying vec4 vFrame;" +
        "varying vec2 vTextureCoord;" +
        "varying float vTextureId;" +
        "uniform sampler2D uSampler0;" +
        "uniform sampler2D uSampler1;" +
        "uniform sampler2D uSampler2;" +
        "void main(void) {" +
        "  vec2 textureCoord = clamp(vTextureCoord, vFrame.xy, vFrame.zw);" +
        "  int textureId = int(vTextureId);" +
        "  vec4 color;" +
        "  if (textureId < 0) {" +
        "    color = vec4(0.0, 0.0, 0.0, 0.5);" +
        "  } else if (textureId == 0) {" +
        "    color = texture2D(uSampler0, textureCoord / 2048.0);" +
        "  } else if (textureId == 1) {" +
        "    color = texture2D(uSampler1, textureCoord / 2048.0);" +
        "  } else if (textureId == 2) {" +
        "    color = texture2D(uSampler2, textureCoord / 2048.0);" +
        "  }" +
        "  gl_FragColor = color;" +
        "}";

    return new PIXI.Shader(PIXI.Program.from(vertexSrc, fragmentSrc), {
        uSampler0: 0,
        uSampler1: 1,
        uSampler2: 2,
        uProjectionMatrix: new PIXI.Matrix()
    });
};

Tilemap.Renderer.prototype._createInternalTextures = function() {
    this._destroyInternalTextures();
    for (let i = 0; i < Tilemap.Layer.MAX_GL_TEXTURES; i++) {
        const baseTexture = new PIXI.BaseRenderTexture();
        baseTexture.resize(2048, 2048);
        baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        this._internalTextures.push(baseTexture);
    }
};

Tilemap.Renderer.prototype._destroyInternalTextures = function() {
    for (const internalTexture of this._internalTextures) {
        internalTexture.destroy();
    }
    this._internalTextures = [];
};

Tilemap.Renderer.prototype.updateTextures = function(renderer, images) {
    for (let i = 0; i < images.length; i++) {
        const internalTexture = this._internalTextures[i >> 2];
        renderer.texture.bind(internalTexture, 0);
        const gl = renderer.gl;
        const x = 1024 * (i % 2);
        const y = 1024 * ((i >> 1) % 2);
        const format = gl.RGBA;
        const type = gl.UNSIGNED_BYTE;
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        // prettier-ignore
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, 1024, 1024, format, type,
                         this._clearBuffer);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, format, type, images[i]);
    }
};

Tilemap.Renderer.prototype.bindTextures = function(renderer) {
    for (let ti = 0; ti < Tilemap.Layer.MAX_GL_TEXTURES; ti++) {
        renderer.texture.bind(this._internalTextures[ti], ti);
    }
};

if (
    PIXI.extensions &&
    PIXI.ExtensionType &&
    PIXI.ExtensionType.RendererPlugin
) {
    // v6/v7: extensions API with RendererPlugin type.
    PIXI.extensions.add({
        name: "rpgtilemap",
        type: PIXI.ExtensionType.RendererPlugin,
        ref: Tilemap.Renderer
    });
} else if (PIXI.Renderer && PIXI.Renderer.registerPlugin) {
    // v5: classic registerPlugin (or our v8 compat no-op).
    PIXI.Renderer.registerPlugin("rpgtilemap", Tilemap.Renderer);
}
// v8: render-plugin registration is a compatibility no-op; Tilemap.Layer uses
// native PIXI.Mesh children there and keeps this renderer for v5-v7 plugins.

//-----------------------------------------------------------------------------
/**
 * The sprite object for a tiling image.
 *
 * @class
 * @extends PIXI.TilingSprite
 * @param {Bitmap} bitmap - The image for the tiling sprite.
 */
function TilingSprite() {
    this.initialize(...arguments);
}

TilingSprite.prototype = Object.create(PIXI.TilingSprite.prototype);
TilingSprite.prototype.constructor = TilingSprite;

TilingSprite.prototype.initialize = function(bitmap) {
    if (!TilingSprite._emptyBaseTexture) {
        TilingSprite._emptyBaseTexture = new PIXI.BaseTexture();
        TilingSprite._emptyBaseTexture.setSize(1, 1);
    }
    const frame = new Rectangle();
    const texture = PIXICreateTexture(TilingSprite._emptyBaseTexture, frame);
    PIXISuper(PIXI.TilingSprite, this, [texture]);
    this._bitmap = bitmap;
    this._width = 0;
    this._height = 0;
    this._frame = frame;

    /**
     * The origin point of the tiling sprite for scrolling.
     *
     * @type Point
     */
    this.origin = new Point();

    this._onBitmapChange();
};

TilingSprite._emptyBaseTexture = null;

/**
 * The image for the tiling sprite.
 *
 * @type Bitmap
 * @name TilingSprite#bitmap
 */
Object.defineProperty(TilingSprite.prototype, "bitmap", {
    get: function() {
        return this._bitmap;
    },
    set: function(value) {
        if (this._bitmap !== value) {
            this._bitmap = value;
            this._onBitmapChange();
        }
    },
    configurable: true
});

/**
 * The opacity of the tiling sprite (0 to 255).
 *
 * @type number
 * @name TilingSprite#opacity
 */
Object.defineProperty(TilingSprite.prototype, "opacity", {
    get: function() {
        return this.alpha * 255;
    },
    set: function(value) {
        this.alpha = value.clamp(0, 255) / 255;
    },
    configurable: true
});

/**
 * Destroys the tiling sprite.
 */
TilingSprite.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.TilingSprite.prototype.destroy.call(this, options);
};

/**
 * Updates the tiling sprite for each frame.
 */
TilingSprite.prototype.update = function() {
    if (this.visible && this.worldVisible !== false && this._bitmap) {
        this._bitmap._updateAnimatedImage();
    }
    for (const child of this.children) {
        if (child.update) {
            child.update();
        }
    }
};

/**
 * Sets the x, y, width, and height all at once.
 *
 * @param {number} x - The x coordinate of the tiling sprite.
 * @param {number} y - The y coordinate of the tiling sprite.
 * @param {number} width - The width of the tiling sprite.
 * @param {number} height - The height of the tiling sprite.
 */
TilingSprite.prototype.move = function(x, y, width, height) {
    this.x = x || 0;
    this.y = y || 0;
    this._width = width || 0;
    this._height = height || 0;
};

/**
 * Specifies the region of the image that the tiling sprite will use.
 *
 * @param {number} x - The x coordinate of the frame.
 * @param {number} y - The y coordinate of the frame.
 * @param {number} width - The width of the frame.
 * @param {number} height - The height of the frame.
 */
TilingSprite.prototype.setFrame = function(x, y, width, height) {
    this._frame.x = x;
    this._frame.y = y;
    this._frame.width = width;
    this._frame.height = height;
    this._refresh();
};

/**
 * Updates the transform on all children of this container for rendering.
 */
TilingSprite.prototype.updateTransform = function() {
    this.tilePosition.x = Math.round(-this.origin.x);
    this.tilePosition.y = Math.round(-this.origin.y);
    // v8: PIXI.TilingSprite has no own updateTransform; inherits from
    // Container whose v8 updateTransform(opts) is a property-setter that
    // throws on no-args. v8 cascades transforms automatically.
    if (!PIXI.TextureSource) {
        PIXI.TilingSprite.prototype.updateTransform.call(this);
    }
};

TilingSprite.prototype._onBitmapChange = function() {
    if (this._bitmap) {
        this._bitmap.addLoadListener(this._onBitmapLoad.bind(this));
    } else {
        this.texture.frame = new Rectangle();
    }
};

TilingSprite.prototype._onBitmapLoad = function() {
    // v8: REPLACE the whole texture so cached bounds (from the initial 1x1
    // empty stub) get reset. Mutating .source alone leaves the sprite
    // rendering at 1x1. v5/v6/v7 can use the legacy mutation pattern.
    const bt = this._bitmap.baseTexture;
    if (PIXI.TextureSource && bt && bt.source) {
        // Destroy the replaced texture (if this path created it) — the v8
        // constructor subscribes it to the source's resize event, which
        // otherwise retains every orphaned texture for the session.
        const old = this.texture;
        this.texture = new PIXI.Texture({ source: bt.source });
        this.texture.__rrSpriteOwned = true;
        if (old && old.__rrSpriteOwned && !old.destroyed) {
            old.destroy();
        }
    } else {
        this.texture.baseTexture = bt;
    }
    this._refresh();
};

TilingSprite.prototype._refresh = function() {
    const texture = this.texture;
    const frame = this._frame.clone();
    if (frame.width === 0 && frame.height === 0 && this._bitmap) {
        frame.width = this._bitmap.width;
        frame.height = this._bitmap.height;
    }
    if (texture) {
        if (PIXI.TextureSource && texture.source) {
            // v8: REPLACE the texture like Sprite._refresh does. Assigning
            // texture.frame swaps the Rectangle without updateUvs() and
            // leaves `orig` on the old rectangle, so the tiling keeps
            // spanning the whole source -- window skins then tile the entire
            // sheet (cursor, arrows, text palette) instead of the pattern
            // quadrant.
            if (frame.width > 0 && frame.height > 0 &&
                (texture.frame.x !== frame.x ||
                    texture.frame.y !== frame.y ||
                    texture.frame.width !== frame.width ||
                    texture.frame.height !== frame.height)) {
                this.texture = new PIXI.Texture({ source: texture.source, frame });
                this.texture.__rrSpriteOwned = true;
                if (texture.__rrSpriteOwned && !texture.destroyed) {
                    texture.destroy();
                }
            }
        } else if (texture.baseTexture) {
            try {
                texture.frame = frame;
            } catch (e) {
                texture.frame = new Rectangle();
            }
        }
        texture._updateID++;
    }
};

//-----------------------------------------------------------------------------
/**
 * The sprite which covers the entire game screen.
 *
 * @class
 * @extends PIXI.Container
 */
function ScreenSprite() {
    this.initialize(...arguments);
}

ScreenSprite.prototype = Object.create(PIXI.Container.prototype);
ScreenSprite.prototype.constructor = ScreenSprite;

ScreenSprite.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);
    this._graphics = new PIXI.Graphics();
    this.addChild(this._graphics);
    this.opacity = 0;
    this._red = -1;
    this._green = -1;
    this._blue = -1;
    this.setBlack();
};

/**
 * The opacity of the sprite (0 to 255).
 *
 * @type number
 * @name ScreenSprite#opacity
 */
Object.defineProperty(ScreenSprite.prototype, "opacity", {
    get: function() {
        return this.alpha * 255;
    },
    set: function(value) {
        this.alpha = value.clamp(0, 255) / 255;
    },
    configurable: true
});

/**
 * Destroys the screen sprite.
 */
ScreenSprite.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.Container.prototype.destroy.call(this, options);
};

/**
 * Sets black to the color of the screen sprite.
 */
ScreenSprite.prototype.setBlack = function() {
    this.setColor(0, 0, 0);
};

/**
 * Sets white to the color of the screen sprite.
 */
ScreenSprite.prototype.setWhite = function() {
    this.setColor(255, 255, 255);
};

/**
 * Sets the color of the screen sprite by values.
 *
 * @param {number} r - The red value in the range (0, 255).
 * @param {number} g - The green value in the range (0, 255).
 * @param {number} b - The blue value in the range (0, 255).
 */
ScreenSprite.prototype.setColor = function(r, g, b) {
    if (this._red !== r || this._green !== g || this._blue !== b) {
        r = Math.round(r || 0).clamp(0, 255);
        g = Math.round(g || 0).clamp(0, 255);
        b = Math.round(b || 0).clamp(0, 255);
        this._red = r;
        this._green = g;
        this._blue = b;
        const graphics = this._graphics;
        const color = (r << 16) | (g << 8) | b;
        graphics.clear();
        if (typeof graphics.rect === "function" &&
            typeof graphics.fill === "function") {
            // v8: chained shape + style; beginFill/drawRect/endFill removed.
            graphics.rect(-50000, -50000, 100000, 100000).fill({
                color: color,
                alpha: 1
            });
        } else {
            // v5/v6/v7 imperative API.
            graphics.beginFill(color, 1);
            graphics.drawRect(-50000, -50000, 100000, 100000);
            graphics.endFill();
        }
    }
};

//-----------------------------------------------------------------------------
/**
 * The window in the game.
 *
 * @class
 * @extends PIXI.Container
 */
function Window() {
    this.initialize(...arguments);
}

/** PIXI 8 windows clip their contents with a stencil mask rather than a filter pass. */
Window.clipWithMask = true;

Window.prototype = Object.create(PIXI.Container.prototype);
Window.prototype.constructor = Window;

Window.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);

    this._isWindow = true;
    this._windowskin = null;
    this._width = 0;
    this._height = 0;
    this._cursorRect = new Rectangle();
    this._openness = 255;
    this._animationCount = 0;

    this._padding = 12;
    this._margin = 4;
    this._colorTone = [0, 0, 0, 0];
    this._innerChildren = [];

    this._container = null;
    this._backSprite = null;
    this._frameSprite = null;
    this._contentsBackSprite = null;
    this._cursorSprite = null;
    this._contentsSprite = null;
    this._downArrowSprite = null;
    this._upArrowSprite = null;
    this._pauseSignSprite = null;

    this._createAllParts();

    /**
     * The origin point of the window for scrolling.
     *
     * @type Point
     */
    this.origin = new Point();

    /**
     * The active state for the window.
     *
     * @type boolean
     */
    this.active = true;

    /**
     * The visibility of the frame.
     *
     * @type boolean
     */
    this.frameVisible = true;

    /**
     * The visibility of the cursor.
     *
     * @type boolean
     */
    this.cursorVisible = true;

    /**
     * The visibility of the down scroll arrow.
     *
     * @type boolean
     */
    this.downArrowVisible = false;

    /**
     * The visibility of the up scroll arrow.
     *
     * @type boolean
     */
    this.upArrowVisible = false;

    /**
     * The visibility of the pause sign.
     *
     * @type boolean
     */
    this.pause = false;
};

/**
 * The image used as a window skin.
 *
 * @type Bitmap
 * @name Window#windowskin
 */
Object.defineProperty(Window.prototype, "windowskin", {
    get: function() {
        return this._windowskin;
    },
    set: function(value) {
        if (this._windowskin !== value) {
            this._windowskin = value;
            this._windowskin.addLoadListener(this._onWindowskinLoad.bind(this));
        }
    },
    configurable: true
});

/**
 * The bitmap used for the window contents.
 *
 * @type Bitmap
 * @name Window#contents
 */
Object.defineProperty(Window.prototype, "contents", {
    get: function() {
        return this._contentsSprite.bitmap;
    },
    set: function(value) {
        this._contentsSprite.bitmap = value;
    },
    configurable: true
});

/**
 * The bitmap used for the window contents background.
 *
 * @type Bitmap
 * @name Window#contentsBack
 */
Object.defineProperty(Window.prototype, "contentsBack", {
    get: function() {
        return this._contentsBackSprite.bitmap;
    },
    set: function(value) {
        this._contentsBackSprite.bitmap = value;
    },
    configurable: true
});

/**
 * The width of the window in pixels.
 *
 * @type number
 * @name Window#width
 */
Object.defineProperty(Window.prototype, "width", {
    get: function() {
        return this._width;
    },
    set: function(value) {
        this._width = value;
        this._refreshAllParts();
    },
    configurable: true
});

/**
 * The height of the window in pixels.
 *
 * @type number
 * @name Window#height
 */
Object.defineProperty(Window.prototype, "height", {
    get: function() {
        return this._height;
    },
    set: function(value) {
        this._height = value;
        this._refreshAllParts();
    },
    configurable: true
});

/**
 * The size of the padding between the frame and contents.
 *
 * @type number
 * @name Window#padding
 */
Object.defineProperty(Window.prototype, "padding", {
    get: function() {
        return this._padding;
    },
    set: function(value) {
        this._padding = value;
        this._refreshAllParts();
    },
    configurable: true
});

/**
 * The size of the margin for the window background.
 *
 * @type number
 * @name Window#margin
 */
Object.defineProperty(Window.prototype, "margin", {
    get: function() {
        return this._margin;
    },
    set: function(value) {
        this._margin = value;
        this._refreshAllParts();
    },
    configurable: true
});

/**
 * The opacity of the window without contents (0 to 255).
 *
 * @type number
 * @name Window#opacity
 */
Object.defineProperty(Window.prototype, "opacity", {
    get: function() {
        return this._container.alpha * 255;
    },
    set: function(value) {
        this._container.alpha = value.clamp(0, 255) / 255;
    },
    configurable: true
});

/**
 * The opacity of the window background (0 to 255).
 *
 * @type number
 * @name Window#backOpacity
 */
Object.defineProperty(Window.prototype, "backOpacity", {
    get: function() {
        return this._backSprite.alpha * 255;
    },
    set: function(value) {
        this._backSprite.alpha = value.clamp(0, 255) / 255;
    },
    configurable: true
});

/**
 * The opacity of the window contents (0 to 255).
 *
 * @type number
 * @name Window#contentsOpacity
 */
Object.defineProperty(Window.prototype, "contentsOpacity", {
    get: function() {
        return this._contentsSprite.alpha * 255;
    },
    set: function(value) {
        this._contentsSprite.alpha = value.clamp(0, 255) / 255;
    },
    configurable: true
});

/**
 * The openness of the window (0 to 255).
 *
 * @type number
 * @name Window#openness
 */
Object.defineProperty(Window.prototype, "openness", {
    get: function() {
        return this._openness;
    },
    set: function(value) {
        if (this._openness !== value) {
            this._openness = value.clamp(0, 255);
            this._container.scale.y = this._openness / 255;
            this._container.y = (this.height / 2) * (1 - this._openness / 255);
        }
    },
    configurable: true
});

/**
 * The width of the content area in pixels.
 *
 * @readonly
 * @type number
 * @name Window#innerWidth
 */
Object.defineProperty(Window.prototype, "innerWidth", {
    get: function() {
        return Math.max(0, this._width - this._padding * 2);
    },
    configurable: true
});

/**
 * The height of the content area in pixels.
 *
 * @readonly
 * @type number
 * @name Window#innerHeight
 */
Object.defineProperty(Window.prototype, "innerHeight", {
    get: function() {
        return Math.max(0, this._height - this._padding * 2);
    },
    configurable: true
});

/**
 * The rectangle of the content area.
 *
 * @readonly
 * @type Rectangle
 * @name Window#innerRect
 */
Object.defineProperty(Window.prototype, "innerRect", {
    get: function() {
        return new Rectangle(
            this._padding,
            this._padding,
            this.innerWidth,
            this.innerHeight
        );
    },
    configurable: true
});

/**
 * Destroys the window.
 */
Window.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.Container.prototype.destroy.call(this, options);
};

/**
 * Updates the window for each frame.
 */
Window.prototype.update = function() {
    if (this.active) {
        this._animationCount++;
    }
    for (const child of this.children) {
        if (child.update) {
            child.update();
        }
    }
};

/**
 * Sets the x, y, width, and height all at once.
 *
 * @param {number} x - The x coordinate of the window.
 * @param {number} y - The y coordinate of the window.
 * @param {number} width - The width of the window.
 * @param {number} height - The height of the window.
 */
Window.prototype.move = function(x, y, width, height) {
    this.x = x || 0;
    this.y = y || 0;
    if (this._width !== width || this._height !== height) {
        this._width = width || 0;
        this._height = height || 0;
        this._refreshAllParts();
    }
};

/**
 * Checks whether the window is completely open (openness == 255).
 *
 * @returns {boolean} True if the window is open.
 */
Window.prototype.isOpen = function() {
    return this._openness >= 255;
};

/**
 * Checks whether the window is completely closed (openness == 0).
 *
 * @returns {boolean} True if the window is closed.
 */
Window.prototype.isClosed = function() {
    return this._openness <= 0;
};

/**
 * Sets the position of the command cursor.
 *
 * @param {number} x - The x coordinate of the cursor.
 * @param {number} y - The y coordinate of the cursor.
 * @param {number} width - The width of the cursor.
 * @param {number} height - The height of the cursor.
 */
Window.prototype.setCursorRect = function(x, y, width, height) {
    const cw = Math.floor(width || 0);
    const ch = Math.floor(height || 0);
    this._cursorRect.x = Math.floor(x || 0);
    this._cursorRect.y = Math.floor(y || 0);
    if (this._cursorRect.width !== cw || this._cursorRect.height !== ch) {
        this._cursorRect.width = cw;
        this._cursorRect.height = ch;
        this._refreshCursor();
    }
};

/**
 * Moves the cursor position by the given amount.
 *
 * @param {number} x - The amount of horizontal movement.
 * @param {number} y - The amount of vertical movement.
 */
Window.prototype.moveCursorBy = function(x, y) {
    this._cursorRect.x += x;
    this._cursorRect.y += y;
};

/**
 * Moves the inner children by the given amount.
 *
 * @param {number} x - The amount of horizontal movement.
 * @param {number} y - The amount of vertical movement.
 */
Window.prototype.moveInnerChildrenBy = function(x, y) {
    for (const child of this._innerChildren) {
        child.x += x;
        child.y += y;
    }
};

/**
 * Changes the color of the background.
 *
 * @param {number} r - The red value in the range (-255, 255).
 * @param {number} g - The green value in the range (-255, 255).
 * @param {number} b - The blue value in the range (-255, 255).
 */
Window.prototype.setTone = function(r, g, b) {
    const tone = this._colorTone;
    if (r !== tone[0] || g !== tone[1] || b !== tone[2]) {
        this._colorTone = [r, g, b, 0];
        this._refreshBack();
    }
};

/**
 * Adds a child between the background and contents.
 *
 * @param {object} child - The child to add.
 * @returns {object} The child that was added.
 */
Window.prototype.addChildToBack = function(child) {
    const containerIndex = this.children.indexOf(this._container);
    return this.addChildAt(child, containerIndex + 1);
};

/**
 * Adds a child to the client area.
 *
 * @param {object} child - The child to add.
 * @returns {object} The child that was added.
 */
Window.prototype.addInnerChild = function(child) {
    this._innerChildren.push(child);
    return this._clientArea.addChild(child);
};

/**
 * Updates the transform on all children of this container for rendering.
 */
Window.prototype.updateTransform = function() {
    this._updateClientArea();
    this._updateFrame();
    this._updateContentsBack();
    this._updateCursor();
    this._updateContents();
    this._updateArrows();
    this._updatePauseSign();
    // v5/v6/v7: PIXI.Container.updateTransform() was the per-frame transform
    // cascade. v8 repurposed this method to a property-setter
    // updateTransform(opts) that THROWS on no-args (reads opts.x). On v8 the
    // render pipeline computes worldTransform automatically, so the super
    // call is both unnecessary and dangerous -- calling it with no args
    // throws before _updateFilterArea() runs below, which means the window
    // never sets its filterArea/boundsArea and content never gets clipped.
    if (!PIXI.TextureSource) {
        PIXI.Container.prototype.updateTransform.call(this);
        this._updateFilterArea();
    } else {
        this._updateFilterArea();
        this._localizeFilterArea();
        if (this._clipMask) this._updateClipMask();
    }
};

/** Clip mask over the visible client rect, rebuilt only when that rect changes. */
Window.prototype._updateClipMask = function() {
    const rect = this._clipRect;
    const x = this.origin.x;
    const y = this.origin.y;
    const width = Math.max(0, this.innerWidth);
    const height = Math.max(0, this.innerHeight);
    if (rect.x === x && rect.y === y && rect.width === width && rect.height === height) return;
    rect.x = x;
    rect.y = y;
    rect.width = width;
    rect.height = height;
    this._clipMask.clear();
    if (width > 0 && height > 0) this._clipMask.rect(x, y, width, height).fill(0xffffff);
};

/**
 * Draws the window shape into PIXI.Graphics object. Used by WindowLayer.
 */
Window.prototype.drawShape = function(graphics) {
    if (graphics) {
        const width = this.width;
        const height = (this.height * this._openness) / 255;
        const x = this.x;
        const y = this.y + (this.height - height) / 2;
        graphics.beginFill(0xffffff);
        graphics.drawRoundedRect(x, y, width, height, 0);
        graphics.endFill();
    }
};

Window.prototype._createAllParts = function() {
    this._createContainer();
    this._createBackSprite();
    this._createFrameSprite();
    this._createClientArea();
    this._createContentsBackSprite();
    this._createCursorSprite();
    this._createContentsSprite();
    this._createArrowSprites();
    this._createPauseSignSprites();
};

Window.prototype._createContainer = function() {
    this._container = new PIXI.Container();
    this.addChild(this._container);
};

Window.prototype._createBackSprite = function() {
    // v8: SpritePipe (pixi.js:47884) does NOT walk children of leaf Sprites.
    // _backSprite is purely a parent for the TilingSprite that fills the
    // window background, so using Container (which IS walked) makes the
    // TilingSprite child actually render. Without this, window backgrounds
    // vanish entirely in v8 -- only the frame border and content text show.
    // _backSprite renders the windowskin's 95x95 corner piece (the solid
    // background fill) AND parents the TilingSprite that overlays the tiled
    // texture pattern. On v8 this needs to be a Sprite, not a Container --
    // a Container has no texture rendering of its own, so the solid 95x95
    // corner would be invisible and windows render with only the (mostly
    // transparent) tile pattern over the scene. Earlier migration work used
    // Container to dodge v8's "Sprite can't have children" deprecation, but
    // the pixi_compat `Sprite.allowChildren=true` shim now makes Sprite-
    // as-parent render its children correctly via Sprite.collectRenderables-
    // Simple.
    this._backSprite = new Sprite();
    this._backSprite.addChild(new TilingSprite());
    this._container.addChild(this._backSprite);
};

Window.prototype._createFrameSprite = function() {
    this._frameSprite = new PIXI.Container();
    for (let i = 0; i < 8; i++) {
        this._frameSprite.addChild(new Sprite());
    }
    this._container.addChild(this._frameSprite);
};

Window.prototype._createClientArea = function() {
    this._clientArea = new PIXI.Container();
    if (Window.clipWithMask && PIXI.TextureSource) {
        // PIXI 8: clip with a stencil mask. An AlphaFilter clips too, but a
        // filter is a render-to-texture pass per window per frame, and a
        // scene with eight windows paid for eight of them; a stencil rect
        // costs a handful of triangles. filterArea is still kept up to date
        // for anything that reads it, and the filter list stays an array.
        this._clientArea.filters = [];
        this._clientArea.filterArea = new Rectangle();
        this._clipMask = new PIXI.Graphics();
        this._clipMask.rect(0, 0, 1, 1).fill(0xffffff);
        // PIXI's mask effect manages the mask's renderable/measurable flags;
        // a mask set non-renderable by hand collects no geometry and clips
        // everything out.
        this._clientArea.addChild(this._clipMask);
        this._clientArea.mask = this._clipMask;
        this._clipRect = { x: -1, y: -1, width: -1, height: -1 };
    } else {
        this._clientArea.filters = [new PIXI.AlphaFilter()];
        this._clientArea.filterArea = new Rectangle();
    }
    this._clientArea.move(this._padding, this._padding);
    this.addChild(this._clientArea);
};

Window.prototype._createContentsBackSprite = function() {
    this._contentsBackSprite = new Sprite();
    this._clientArea.addChild(this._contentsBackSprite);
};

Window.prototype._createCursorSprite = function() {
    this._cursorSprite = new PIXI.Container();
    for (let i = 0; i < 9; i++) {
        this._cursorSprite.addChild(new Sprite());
    }
    this._clientArea.addChild(this._cursorSprite);
};

Window.prototype._createContentsSprite = function() {
    this._contentsSprite = new Sprite();
    this._clientArea.addChild(this._contentsSprite);
};

Window.prototype._createArrowSprites = function() {
    this._downArrowSprite = new Sprite();
    this.addChild(this._downArrowSprite);
    this._upArrowSprite = new Sprite();
    this.addChild(this._upArrowSprite);
};

Window.prototype._createPauseSignSprites = function() {
    this._pauseSignSprite = new Sprite();
    this.addChild(this._pauseSignSprite);
};

Window.prototype._onWindowskinLoad = function() {
    this._refreshAllParts();
};

Window.prototype._refreshAllParts = function() {
    this._refreshBack();
    this._refreshFrame();
    this._refreshCursor();
    this._refreshArrows();
    this._refreshPauseSign();
};

Window.prototype._refreshBack = function() {
    const m = this._margin;
    const w = Math.max(0, this._width - m * 2);
    const h = Math.max(0, this._height - m * 2);
    const sprite = this._backSprite;
    // Plugins can replace the back sprite with a plain Sprite (MV-style
    // window internals) that lacks the tiling child; render what exists
    // instead of crashing the windowskin load listener.
    if (!sprite) {
        return;
    }
    const tilingSprite = sprite.children[0];
    // [Note] We use 95 instead of 96 here to avoid blurring edges.
    sprite.bitmap = this._windowskin;
    sprite.setFrame(0, 0, 95, 95);
    sprite.move(m, m);
    sprite.scale.x = w / 95;
    sprite.scale.y = h / 95;
    if (tilingSprite) {
        tilingSprite.bitmap = this._windowskin;
        tilingSprite.setFrame(0, 96, 96, 96);
        tilingSprite.move(0, 0, w, h);
        tilingSprite.scale.x = 1 / sprite.scale.x;
        tilingSprite.scale.y = 1 / sprite.scale.y;
    }
    if (sprite.setColorTone) {
        sprite.setColorTone(this._colorTone);
    }
};

Window.prototype._refreshFrame = function() {
    const drect = { x: 0, y: 0, width: this._width, height: this._height };
    const srect = { x: 96, y: 0, width: 96, height: 96 };
    const m = 24;
    for (const child of this._frameSprite.children) {
        child.bitmap = this._windowskin;
    }
    this._setRectPartsGeometry(this._frameSprite, srect, drect, m);
};

// The cursor is clamped to the window's inner rect (MV behavior). Plugins
// set cursor rects that extend past the window — e.g. VE_BattleCommandWindow
// offsets the selected item's rect for its slide effect — and rely on the
// window clipping the highlight instead of letting it bleed outside.
Window.prototype._clampedCursorRect = function() {
    const cr = this._cursorRect;
    const innerW = Math.max(0, this._width - this._padding * 2);
    const innerH = Math.max(0, this._height - this._padding * 2);
    // The cursor rect is in CONTENTS coordinates, and the client area holding
    // the cursor sprite is shifted by -origin (Window._updateClientArea), so
    // the visible band of the contents runs from origin to origin + inner.
    // Clamping against inner alone -- as if origin were always zero -- cuts the
    // bottom-most row short by exactly origin.y pixels.
    //
    // Window_Scrollable.updateOrigin sets origin.y = scrollY % itemHeight, so
    // origin.y is non-zero precisely when innerHeight is not a whole number of
    // rows. Scrolling to the last row lands on scrollMin, whose remainder is
    // itemHeight - (innerHeight % itemHeight); the row is then fully on screen
    // while the old clamp still trimmed the highlight to what would have been
    // visible at scroll origin zero. That is the half-height last-row cursor.
    const origin = this.origin;
    const ox = origin ? origin.x : 0;
    const oy = origin ? origin.y : 0;
    const x = Math.max(cr.x, ox);
    const y = Math.max(cr.y, oy);
    const w = Math.max(0, Math.min(cr.x + cr.width, ox + innerW) - x);
    const h = Math.max(0, Math.min(cr.y + cr.height, oy + innerH) - y);
    // Asked every frame by the cursor refresh; one rectangle per window,
    // reused. Callers read it immediately and never keep it.
    const rect = this._clampedCursorScratch || (this._clampedCursorScratch = new Rectangle(0, 0, 0, 0));
    rect.x = x;
    rect.y = y;
    rect.width = w;
    rect.height = h;
    return rect;
};

Window.prototype._refreshCursor = function() {
    const drect = this._clampedCursorRect();
    this._cursorClampW = drect.width;
    this._cursorClampH = drect.height;
    const srect = { x: 96, y: 96, width: 48, height: 48 };
    const m = 4;
    for (const child of this._cursorSprite.children) {
        child.bitmap = this._windowskin;
    }
    this._setRectPartsGeometry(this._cursorSprite, srect, drect, m);
};

Window.prototype._setRectPartsGeometry = function(sprite, srect, drect, m) {
    const sx = srect.x;
    const sy = srect.y;
    const sw = srect.width;
    const sh = srect.height;
    const dx = drect.x;
    const dy = drect.y;
    const dw = drect.width;
    const dh = drect.height;
    const smw = sw - m * 2;
    const smh = sh - m * 2;
    const dmw = dw - m * 2;
    const dmh = dh - m * 2;
    const children = sprite.children;
    sprite.setFrame(0, 0, dw, dh);
    sprite.move(dx, dy);
    // corner
    children[0].setFrame(sx, sy, m, m);
    children[1].setFrame(sx + sw - m, sy, m, m);
    children[2].setFrame(sx, sy + sw - m, m, m);
    children[3].setFrame(sx + sw - m, sy + sw - m, m, m);
    children[0].move(0, 0);
    children[1].move(dw - m, 0);
    children[2].move(0, dh - m);
    children[3].move(dw - m, dh - m);
    // edge
    children[4].move(m, 0);
    children[5].move(m, dh - m);
    children[6].move(0, m);
    children[7].move(dw - m, m);
    children[4].setFrame(sx + m, sy, smw, m);
    children[5].setFrame(sx + m, sy + sw - m, smw, m);
    children[6].setFrame(sx, sy + m, m, smh);
    children[7].setFrame(sx + sw - m, sy + m, m, smh);
    children[4].scale.x = dmw / smw;
    children[5].scale.x = dmw / smw;
    children[6].scale.y = dmh / smh;
    children[7].scale.y = dmh / smh;
    // center
    if (children[8]) {
        children[8].setFrame(sx + m, sy + m, smw, smh);
        children[8].move(m, m);
        children[8].scale.x = dmw / smw;
        children[8].scale.y = dmh / smh;
    }
    for (const child of children) {
        child.visible = dw > 0 && dh > 0;
    }
};

Window.prototype._refreshArrows = function() {
    const w = this._width;
    const h = this._height;
    const p = 24;
    const q = p / 2;
    const sx = 96 + p;
    const sy = 0 + p;
    this._downArrowSprite.bitmap = this._windowskin;
    this._downArrowSprite.anchor.x = 0.5;
    this._downArrowSprite.anchor.y = 0.5;
    this._downArrowSprite.setFrame(sx + q, sy + q + p, p, q);
    this._downArrowSprite.move(w / 2, h - q);
    this._upArrowSprite.bitmap = this._windowskin;
    this._upArrowSprite.anchor.x = 0.5;
    this._upArrowSprite.anchor.y = 0.5;
    this._upArrowSprite.setFrame(sx + q, sy, p, q);
    this._upArrowSprite.move(w / 2, q);
};

Window.prototype._refreshPauseSign = function() {
    const sx = 144;
    const sy = 96;
    const p = 24;
    this._pauseSignSprite.bitmap = this._windowskin;
    this._pauseSignSprite.anchor.x = 0.5;
    this._pauseSignSprite.anchor.y = 1;
    this._pauseSignSprite.move(this._width / 2, this._height);
    this._pauseSignSprite.setFrame(sx, sy, p, p);
    this._pauseSignSprite.alpha = 0;
};

Window.prototype._updateClientArea = function() {
    const pad = this._padding;
    this._clientArea.move(pad, pad);
    this._clientArea.x = pad - this.origin.x;
    this._clientArea.y = pad - this.origin.y;
    if (this.innerWidth > 0 && this.innerHeight > 0) {
        this._clientArea.visible = this.isOpen();
    } else {
        this._clientArea.visible = false;
    }
};

Window.prototype._updateFrame = function() {
    this._frameSprite.visible = this.frameVisible;
};

Window.prototype._updateContentsBack = function() {
    const bitmap = this._contentsBackSprite.bitmap;
    if (bitmap) {
        this._contentsBackSprite.setFrame(0, 0, bitmap.width, bitmap.height);
    }
};

Window.prototype._updateCursor = function() {
    const rect = this._clampedCursorRect();
    // A position-only cursor move can change the clamped size (the rect
    // slides toward an edge), so re-slice the skin parts when it does.
    if (rect.width !== this._cursorClampW || rect.height !== this._cursorClampH) {
        this._refreshCursor();
    }
    this._cursorSprite.alpha = this._makeCursorAlpha();
    this._cursorSprite.visible = this.isOpen() && this.cursorVisible;
    this._cursorSprite.x = rect.x;
    this._cursorSprite.y = rect.y;
};

Window.prototype._makeCursorAlpha = function() {
    const blinkCount = this._animationCount % 40;
    const baseAlpha = this.contentsOpacity / 255;
    if (this.active) {
        if (blinkCount < 20) {
            return baseAlpha - blinkCount / 32;
        } else {
            return baseAlpha - (40 - blinkCount) / 32;
        }
    }
    return baseAlpha;
};

Window.prototype._updateContents = function() {
    const bitmap = this._contentsSprite.bitmap;
    if (bitmap) {
        this._contentsSprite.setFrame(0, 0, bitmap.width, bitmap.height);
    }
};

Window.prototype._updateArrows = function() {
    this._downArrowSprite.visible = this.isOpen() && this.downArrowVisible;
    this._upArrowSprite.visible = this.isOpen() && this.upArrowVisible;
};

Window.prototype._updatePauseSign = function() {
    const sprite = this._pauseSignSprite;
    const x = Math.floor(this._animationCount / 16) % 2;
    const y = Math.floor(this._animationCount / 16 / 2) % 2;
    const sx = 144;
    const sy = 96;
    const p = 24;
    if (!this.pause) {
        sprite.alpha = 0;
    } else if (sprite.alpha < 1) {
        sprite.alpha = Math.min(sprite.alpha + 0.1, 1);
    }
    sprite.setFrame(sx + x * p, sy + y * p, p, p);
    sprite.visible = this.isOpen();
};

Window.prototype._updateFilterArea = function() {
    // World-space, on every PIXI version: that is what v5/v6/v7 consumed
    // directly, and it is what plugins replacing this method normally write.
    // _localizeFilterArea() below converts it for v8 afterwards, so a plugin's
    // version needs no cooperation to land in the right place. Stock-style
    // plugins that leave the dimensions unscaled retain their legacy over-clip.
    // Measured every frame; the origin read and the result written go
    // through two points the window keeps, not two fresh ones.
    if (!this._filterOriginScratch) {
        this._filterOriginScratch = new Point(0, 0);
        this._filterPosScratch = new Point(0, 0);
    }
    const wt = this._clientArea.worldTransform;
    const pos = wt.apply(this._filterOriginScratch, this._filterPosScratch);
    const filterArea = this._clientArea.filterArea;
    filterArea.x = pos.x + this.origin.x;
    filterArea.y = pos.y + this.origin.y;
    filterArea.width = this.innerWidth * (Math.hypot(wt.a, wt.b) || 1);
    filterArea.height = this.innerHeight * (Math.hypot(wt.c, wt.d) || 1);
};

/**
 * Restates the client area's filter rectangle in the coordinates v8 expects.
 *
 * v8's FilterSystem._calculateFilterArea does
 *
 *     bounds.addRect(filterEffect.filterArea);
 *     bounds.applyMatrix(container.worldTransform);
 *
 * so it reads filterArea as container-LOCAL and applies the world transform
 * itself. Handed the world-space rect that v5/v6/v7 wanted, it transforms it a
 * second time and the captured region lands roughly twice as far down the
 * screen as the window — off the edge entirely for a window past the middle.
 * The filter then resolves to nothing, and everything inside the client area
 * silently disappears: the panel and its border still draw (they are not in
 * the client area), so a window renders as an empty box.
 *
 * Correcting it here rather than in _updateFilterArea above is the point. A
 * window's filter rect is computed by whichever _updateFilterArea is installed
 * last, and plugins that reimplement scrolling or window drawing routinely
 * install their own — VisuMZ's CoreEngine among them. Those all write the
 * world-space rect the engine documented, cannot know about v8, and cannot be
 * edited. Removing the client area's world origin and scale afterwards fixes
 * every one of them, including our own, with no version branch above.
 *
 * Position staleness cancels because both methods read the same transform.
 * A plugin can instead scale dimensions from this.scale, so on the first frame
 * its size can be divided by a still-identity world transform; the next frame
 * is correct. Guessing which convention wrote a rectangle is less reliable.
 */
Window.prototype._localizeFilterArea = function() {
    const clientArea = this._clientArea;
    const filterArea = clientArea && clientArea.filterArea;
    if (!filterArea) {
        return;
    }
    // worldTransform applied to (0, 0) is exactly (tx, ty) -- the same origin
    // _updateFilterArea added, so a transform that is momentarily stale
    // cancels out instead of shifting the rect.
    const wt = clientArea.worldTransform;
    filterArea.x -= wt.tx;
    filterArea.y -= wt.ty;
    // Matrix-column lengths handle rotation and negative scales. Degenerate
    // transforms use 1 so a hidden zero-scale window cannot produce Infinity.
    filterArea.width /= (Math.hypot(wt.a, wt.b) || 1);
    filterArea.height /= (Math.hypot(wt.c, wt.d) || 1);
};

//-----------------------------------------------------------------------------
/**
 * The layer which contains game windows.
 *
 * @class
 * @extends PIXI.Container
 */
function WindowLayer() {
    this.initialize(...arguments);
}

WindowLayer.prototype = Object.create(PIXI.Container.prototype);
WindowLayer.prototype.constructor = WindowLayer;

WindowLayer.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);
};

/**
 * Updates the window layer for each frame.
 */
WindowLayer.prototype.update = function() {
    for (const child of this.children) {
        if (child.update) {
            child.update();
        }
    }
};

/**
 * Renders the object using the WebGL renderer.
 *
 * @param {PIXI.Renderer} renderer - The renderer.
 */
WindowLayer.prototype.render = function render(renderer) {
    if (!this.visible) {
        return;
    }

    // v8: render pipe handles children automatically. v8 removed
    // renderer.framebuffer.forceStencil (stencil buffer is allocated by
    // default at context creation -- see pixi8 `stencil: true` ContextSystem
    // init), and renderer.batch is no longer a global flushable batcher
    // (each render pipe has its own deferred batcher). Interleaving raw GL
    // stencil ops with v8's deferred pipeline also doesn't honor draw order.
    //
    // Skip the custom render on v8 and let the standard render pipe iterate
    // children. Net visual: lower-window pixels under a higher window are
    // drawn, but immediately overdrawn -- no visible regression for normal
    // MZ usage. v5/v6/v7 keep the stock stencil-occlusion behavior below.
    if (PIXI.TextureSource) {
        return;
    }

    const graphics = new PIXI.Graphics();
    const gl = renderer.gl;
    const children = this.children.clone();

    renderer.framebuffer.forceStencil();
    graphics.transform = this.transform;
    renderer.batch.flush();
    gl.enable(gl.STENCIL_TEST);

    while (children.length > 0) {
        const win = children.pop();
        if (win._isWindow && win.visible && win.openness > 0) {
            gl.stencilFunc(gl.EQUAL, 0, ~0);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
            win.render(renderer);
            renderer.batch.flush();
            graphics.clear();
            win.drawShape(graphics);
            gl.stencilFunc(gl.ALWAYS, 1, ~0);
            gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
            gl.blendFunc(gl.ZERO, gl.ONE);
            graphics.render(renderer);
            renderer.batch.flush();
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
    }

    gl.disable(gl.STENCIL_TEST);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.clearStencil(0);
    renderer.batch.flush();

    for (const child of this.children) {
        if (!child._isWindow && child.visible) {
            child.render(renderer);
        }
    }

    renderer.batch.flush();
};

//-----------------------------------------------------------------------------
/**
 * The weather effect which displays rain, storm, or snow.
 *
 * @class
 * @extends PIXI.Container
 */
function Weather() {
    this.initialize(...arguments);
}

Weather.prototype = Object.create(PIXI.Container.prototype);
Weather.prototype.constructor = Weather;

Weather.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);

    this._width = Graphics.width;
    this._height = Graphics.height;
    this._sprites = [];

    this._createBitmaps();
    this._createDimmer();

    /**
     * The type of the weather in ["none", "rain", "storm", "snow"].
     *
     * @type string
     */
    this.type = "none";

    /**
     * The power of the weather in the range (0, 9).
     *
     * @type number
     */
    this.power = 0;

    /**
     * The origin point of the weather for scrolling.
     *
     * @type Point
     */
    this.origin = new Point();
};

/**
 * Destroys the weather.
 */
Weather.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.Container.prototype.destroy.call(this, options);
    this._rainBitmap.destroy();
    this._stormBitmap.destroy();
    this._snowBitmap.destroy();
};

/**
 * Updates the weather for each frame.
 */
Weather.prototype.update = function() {
    this._updateDimmer();
    this._updateAllSprites();
};

Weather.prototype._createBitmaps = function() {
    this._rainBitmap = new Bitmap(1, 60);
    this._rainBitmap.fillAll("white");
    this._stormBitmap = new Bitmap(2, 100);
    this._stormBitmap.fillAll("white");
    this._snowBitmap = new Bitmap(9, 9);
    this._snowBitmap.drawCircle(4, 4, 4, "white");
};

Weather.prototype._createDimmer = function() {
    this._dimmerSprite = new ScreenSprite();
    this._dimmerSprite.setColor(80, 80, 80);
    this.addChild(this._dimmerSprite);
};

Weather.prototype._updateDimmer = function() {
    this._dimmerSprite.opacity = Math.floor(this.power * 6);
};

Weather.prototype._updateAllSprites = function() {
    const maxSprites = Math.floor(this.power * 10);
    while (this._sprites.length < maxSprites) {
        this._addSprite();
    }
    while (this._sprites.length > maxSprites) {
        this._removeSprite();
    }
    for (const sprite of this._sprites) {
        this._updateSprite(sprite);
        sprite.x = sprite.ax - this.origin.x;
        sprite.y = sprite.ay - this.origin.y;
    }
};

Weather.prototype._addSprite = function() {
    const sprite = new Sprite(this.viewport);
    sprite.opacity = 0;
    this._sprites.push(sprite);
    this.addChild(sprite);
};

Weather.prototype._removeSprite = function() {
    this.removeChild(this._sprites.pop());
};

Weather.prototype._updateSprite = function(sprite) {
    switch (this.type) {
        case "rain":
            this._updateRainSprite(sprite);
            break;
        case "storm":
            this._updateStormSprite(sprite);
            break;
        case "snow":
            this._updateSnowSprite(sprite);
            break;
    }
    if (sprite.opacity < 40) {
        this._rebornSprite(sprite);
    }
};

Weather.prototype._updateRainSprite = function(sprite) {
    sprite.bitmap = this._rainBitmap;
    sprite.rotation = Math.PI / 16;
    sprite.ax -= 6 * Math.sin(sprite.rotation);
    sprite.ay += 6 * Math.cos(sprite.rotation);
    sprite.opacity -= 6;
};

Weather.prototype._updateStormSprite = function(sprite) {
    sprite.bitmap = this._stormBitmap;
    sprite.rotation = Math.PI / 8;
    sprite.ax -= 8 * Math.sin(sprite.rotation);
    sprite.ay += 8 * Math.cos(sprite.rotation);
    sprite.opacity -= 8;
};

Weather.prototype._updateSnowSprite = function(sprite) {
    sprite.bitmap = this._snowBitmap;
    sprite.rotation = Math.PI / 16;
    sprite.ax -= 3 * Math.sin(sprite.rotation);
    sprite.ay += 3 * Math.cos(sprite.rotation);
    sprite.opacity -= 3;
};

Weather.prototype._rebornSprite = function(sprite) {
    sprite.ax = Math.randomInt(Graphics.width + 100) - 100 + this.origin.x;
    sprite.ay = Math.randomInt(Graphics.height + 200) - 200 + this.origin.y;
    sprite.opacity = 160 + Math.randomInt(60);
};

//-----------------------------------------------------------------------------
/**
 * The color filter for WebGL.
 *
 * @class
 * @extends PIXI.Filter
 */
function ColorFilter() {
    this.initialize(...arguments);
}

// On v8, extend PIXI.ColorMatrixFilter (which handles its own UBO/uniform
// binding correctly) instead of PIXI.Filter -- v8's filter UBO model made a
// custom-shader port of the v7 ColorFilter unreliable. On v5/v6/v7, keep
// extending PIXI.Filter so the working custom-shader path is preserved.
ColorFilter.prototype = Object.create(
    (PIXI.GlProgram && PIXI.ColorMatrixFilter)
        ? PIXI.ColorMatrixFilter.prototype
        : PIXI.Filter.prototype
);
ColorFilter.prototype.constructor = ColorFilter;

ColorFilter.prototype.initialize = function() {
    if (PIXI.GlProgram && PIXI.ColorMatrixFilter) {
        // v8 path: ColorFilter IS a ColorMatrixFilter. Combine hue/colorTone/
        // blendColor/brightness into a single 5x4 color matrix and assign it
        // via the inherited `.matrix` setter on every state change.
        PIXISuper(PIXI.ColorMatrixFilter, this, []);
        this._hue = 0;
        this._colorTone = [0, 0, 0, 0];
        this._blendColor = [0, 0, 0, 0];
        this._brightness = 255;
        this._rebuildColorMatrix();
        this._defineLegacyUniforms();
        return;
    }
    // v5/v6/v7 path -- custom shader implementation (unchanged from the
    // original corescript).
    PIXISuper(PIXI.Filter, this, [null, this._fragmentSrc()]);
    this.uniforms.hue = 0;
    this.uniforms.colorTone = [0, 0, 0, 0];
    this.uniforms.blendColor = [0, 0, 0, 0];
    this.uniforms.brightness = 255;
};

/**
 * Sets the hue rotation value.
 *
 * @param {number} hue - The hue value (-360, 360).
 */
ColorFilter.prototype.setHue = function(hue) {
    if (PIXI.GlProgram && PIXI.ColorMatrixFilter) {
        this._hue = Number(hue);
        this._rebuildColorMatrix();
    } else {
        this.uniforms.hue = Number(hue);
    }
};

/**
 * Sets the color tone.
 *
 * @param {array} tone - The color tone [r, g, b, gray].
 */
ColorFilter.prototype.setColorTone = function(tone) {
    if (!(tone instanceof Array)) {
        throw new Error("Argument must be an array");
    }
    if (PIXI.GlProgram && PIXI.ColorMatrixFilter) {
        // Copy in place: the legacy `.uniforms.colorTone` view is a Proxy bound
        // to this array object, so replacing it would strand the view.
        ColorFilter._copyInto(this._colorTone, tone);
        this._rebuildColorMatrix();
    } else {
        this.uniforms.colorTone = tone.clone();
    }
};

/**
 * Sets the blend color.
 *
 * @param {array} color - The blend color [r, g, b, a].
 */
ColorFilter.prototype.setBlendColor = function(color) {
    if (!(color instanceof Array)) {
        throw new Error("Argument must be an array");
    }
    if (PIXI.GlProgram && PIXI.ColorMatrixFilter) {
        ColorFilter._copyInto(this._blendColor, color);
        this._rebuildColorMatrix();
    } else {
        this.uniforms.blendColor = color.clone();
    }
};

/**
 * Sets the brightness.
 *
 * @param {number} brightness - The brightness (0 to 255).
 */
ColorFilter.prototype.setBrightness = function(brightness) {
    if (PIXI.GlProgram && PIXI.ColorMatrixFilter) {
        this._brightness = Number(brightness);
        this._rebuildColorMatrix();
    } else {
        this.uniforms.brightness = Number(brightness);
    }
};

ColorFilter._copyInto = function(dest, src) {
    dest.length = src.length;
    for (let i = 0; i < src.length; i++) {
        dest[i] = src[i];
    }
};

// v8 only: PIXI 8 shaders expose `resources`, not `uniforms`, so the MZ-era
// idiom `filter.uniforms.colorTone[i] = x` reads `undefined.colorTone` and
// throws. Every VisuMZ_4_EncounterEffects battle transition writes that way.
// Expose a `uniforms` view whose writes route through the public setters and
// rebuild the color matrix. Array-valued entries hand back a Proxy over the
// backing array so in-place element writes are caught too.
ColorFilter.prototype._defineLegacyUniforms = function() {
    if ("uniforms" in this) {
        return;
    }
    const filter = this;
    const arrayView = function(backing) {
        return new Proxy(backing, {
            set(target, prop, value) {
                target[prop] = value;
                filter._rebuildColorMatrix();
                return true;
            }
        });
    };
    const colorToneView = arrayView(this._colorTone);
    const blendColorView = arrayView(this._blendColor);
    const uniforms = {};
    Object.defineProperties(uniforms, {
        hue: {
            get: () => filter._hue,
            set: value => filter.setHue(value)
        },
        brightness: {
            get: () => filter._brightness,
            set: value => filter.setBrightness(value)
        },
        colorTone: {
            get: () => colorToneView,
            set: value => filter.setColorTone(value)
        },
        blendColor: {
            get: () => blendColorView,
            set: value => filter.setBlendColor(value)
        }
    });
    Object.defineProperty(this, "uniforms", { value: uniforms });
};

// 5x4 color matrix multiply (a * b). Both flat 20-element arrays; row layout
// matches PIXI.ColorMatrixFilter's uColorMatrix (4 rows of 5: r,g,b,a per
// channel followed by the per-channel offset).
ColorFilter._matrixMultiply = function(a, b) {
    const out = new Array(20);
    for (let row = 0; row < 4; row++) {
        const r = row * 5;
        for (let col = 0; col < 5; col++) {
            let v = a[r + 0] * b[0  + col]
                  + a[r + 1] * b[5  + col]
                  + a[r + 2] * b[10 + col]
                  + a[r + 3] * b[15 + col];
            if (col === 4) v += a[r + 4]; // accumulate left-hand offset
            out[r + col] = v;
        }
    }
    return out;
};

// v8 only: combine hue/colorTone/blendColor/brightness into one 5x4 matrix
// and push it to the inherited ColorMatrixFilter. Offsets are pre-normalized
// to 0-1 because PIXI.ColorMatrixFilter's matrix setter writes the value to
// `uColorMatrix` verbatim (no division applied).
ColorFilter.prototype._rebuildColorMatrix = function() {
    let m = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 1, 0
    ];

    // 1. Hue rotation (degrees). Luminance-preserving rotation matrix
    // (BT.709 weights). Approximate but visually close to MZ's HSL rotation.
    const hueRad = (this._hue || 0) * Math.PI / 180;
    if (hueRad !== 0) {
        const c = Math.cos(hueRad);
        const s = Math.sin(hueRad);
        const lr = 0.213, lg = 0.715, lb = 0.072;
        const hueM = [
            lr + c * (1 - lr) + s * (-lr),     lg + c * (-lg)     + s * (-lg),    lb + c * (-lb)     + s * (1 - lb), 0, 0,
            lr + c * (-lr)    + s * 0.143,     lg + c * (1 - lg)  + s * 0.140,    lb + c * (-lb)     + s * -0.283,   0, 0,
            lr + c * (-lr)    + s * -(1 - lr), lg + c * (-lg)     + s * lg,       lb + c * (1 - lb)  + s * lb,       0, 0,
            0, 0, 0, 1, 0
        ];
        m = ColorFilter._matrixMultiply(hueM, m);
    }

    // 2. Grayscale (saturation reduction) by colorTone[3] / 255.
    const grayAmount =
        Math.max(0, Math.min(255, this._colorTone[3] || 0)) / 255;
    if (grayAmount > 0) {
        const k = grayAmount;
        const lr = 0.2125, lg = 0.7154, lb = 0.0721;
        const grayM = [
            lr * k + (1 - k), lg * k,            lb * k,            0, 0,
            lr * k,           lg * k + (1 - k),  lb * k,            0, 0,
            lr * k,           lg * k,            lb * k + (1 - k),  0, 0,
            0, 0, 0, 1, 0
        ];
        m = ColorFilter._matrixMultiply(grayM, m);
    }

    // 3. Additive color tone (RGB offsets, 0..255 input normalized to 0..1).
    const r2 = (this._colorTone[0] || 0) / 255;
    const g2 = (this._colorTone[1] || 0) / 255;
    const b2 = (this._colorTone[2] || 0) / 255;
    if (r2 !== 0 || g2 !== 0 || b2 !== 0) {
        m[4]  += r2;
        m[9]  += g2;
        m[14] += b2;
    }

    // 4. Blend color: output = output * (1 - i3) + blend * i3.
    // Used by Scene_Base fade in/out -- blendColor is [c, c, c, fadeOpacity]
    // where c is 0 (black fade) or 255 (white fade).
    const i3 =
        Math.max(0, Math.min(255, this._blendColor[3] || 0)) / 255;
    if (i3 > 0) {
        const i1 = 1 - i3;
        const r3 = (this._blendColor[0] || 0) / 255;
        const g3 = (this._blendColor[1] || 0) / 255;
        const b3 = (this._blendColor[2] || 0) / 255;
        const blendM = [
            i1, 0,  0,  0, r3 * i3,
            0,  i1, 0,  0, g3 * i3,
            0,  0,  i1, 0, b3 * i3,
            0,  0,  0,  1, 0
        ];
        m = ColorFilter._matrixMultiply(blendM, m);
    }

    // 5. Brightness -- uniformly scale RGB rows (offsets included).
    const brt = (this._brightness == null ? 255 : this._brightness) / 255;
    if (brt !== 1) {
        for (let i = 0; i < 15; i++) m[i] *= brt;
    }

    // _loadMatrix(matrix, false) assigns uColorMatrix AND calls update() on
    // the uniform group so the change actually reaches the GPU. Setting
    // `this.matrix` directly only writes the uniform value without flagging
    // the uniform group dirty, which can leave the GPU side stale on v8.
    if (this._loadMatrix) {
        this._loadMatrix(m, false);
    } else {
        this.matrix = new Float32Array(m);
    }
};

ColorFilter.prototype._fragmentSrc = function() {
    const src =
        "varying vec2 vTextureCoord;" +
        "uniform sampler2D uSampler;" +
        "uniform float hue;" +
        "uniform vec4 colorTone;" +
        "uniform vec4 blendColor;" +
        "uniform float brightness;" +
        "vec3 rgbToHsl(vec3 rgb) {" +
        "  float r = rgb.r;" +
        "  float g = rgb.g;" +
        "  float b = rgb.b;" +
        "  float cmin = min(r, min(g, b));" +
        "  float cmax = max(r, max(g, b));" +
        "  float h = 0.0;" +
        "  float s = 0.0;" +
        "  float l = (cmin + cmax) / 2.0;" +
        "  float delta = cmax - cmin;" +
        "  if (delta > 0.0) {" +
        "    if (r == cmax) {" +
        "      h = mod((g - b) / delta + 6.0, 6.0) / 6.0;" +
        "    } else if (g == cmax) {" +
        "      h = ((b - r) / delta + 2.0) / 6.0;" +
        "    } else {" +
        "      h = ((r - g) / delta + 4.0) / 6.0;" +
        "    }" +
        "    if (l < 1.0) {" +
        "      s = delta / (1.0 - abs(2.0 * l - 1.0));" +
        "    }" +
        "  }" +
        "  return vec3(h, s, l);" +
        "}" +
        "vec3 hslToRgb(vec3 hsl) {" +
        "  float h = hsl.x;" +
        "  float s = hsl.y;" +
        "  float l = hsl.z;" +
        "  float c = (1.0 - abs(2.0 * l - 1.0)) * s;" +
        "  float x = c * (1.0 - abs((mod(h * 6.0, 2.0)) - 1.0));" +
        "  float m = l - c / 2.0;" +
        "  float cm = c + m;" +
        "  float xm = x + m;" +
        "  if (h < 1.0 / 6.0) {" +
        "    return vec3(cm, xm, m);" +
        "  } else if (h < 2.0 / 6.0) {" +
        "    return vec3(xm, cm, m);" +
        "  } else if (h < 3.0 / 6.0) {" +
        "    return vec3(m, cm, xm);" +
        "  } else if (h < 4.0 / 6.0) {" +
        "    return vec3(m, xm, cm);" +
        "  } else if (h < 5.0 / 6.0) {" +
        "    return vec3(xm, m, cm);" +
        "  } else {" +
        "    return vec3(cm, m, xm);" +
        "  }" +
        "}" +
        "void main() {" +
        "  vec4 sample = texture2D(uSampler, vTextureCoord);" +
        "  float a = sample.a;" +
        "  vec3 hsl = rgbToHsl(sample.rgb);" +
        "  hsl.x = mod(hsl.x + hue / 360.0, 1.0);" +
        "  hsl.y = hsl.y * (1.0 - colorTone.a / 255.0);" +
        "  vec3 rgb = hslToRgb(hsl);" +
        "  float r = rgb.r;" +
        "  float g = rgb.g;" +
        "  float b = rgb.b;" +
        "  float r2 = colorTone.r / 255.0;" +
        "  float g2 = colorTone.g / 255.0;" +
        "  float b2 = colorTone.b / 255.0;" +
        "  float r3 = blendColor.r / 255.0;" +
        "  float g3 = blendColor.g / 255.0;" +
        "  float b3 = blendColor.b / 255.0;" +
        "  float i3 = blendColor.a / 255.0;" +
        "  float i1 = 1.0 - i3;" +
        "  r = clamp((r / a + r2) * a, 0.0, 1.0);" +
        "  g = clamp((g / a + g2) * a, 0.0, 1.0);" +
        "  b = clamp((b / a + b2) * a, 0.0, 1.0);" +
        "  r = clamp(r * i1 + r3 * i3 * a, 0.0, 1.0);" +
        "  g = clamp(g * i1 + g3 * i3 * a, 0.0, 1.0);" +
        "  b = clamp(b * i1 + b3 * i3 * a, 0.0, 1.0);" +
        "  r = r * brightness / 255.0;" +
        "  g = g * brightness / 255.0;" +
        "  b = b * brightness / 255.0;" +
        "  gl_FragColor = vec4(r, g, b, a);" +
        "}";
    return src;
};

//-----------------------------------------------------------------------------
/**
 * The root object of the display tree.
 *
 * @class
 * @extends PIXI.Container
 */
function Stage() {
    this.initialize(...arguments);
}

Stage.prototype = Object.create(PIXI.Container.prototype);
Stage.prototype.constructor = Stage;

Stage.prototype.initialize = function() {
    PIXISuper(PIXI.Container, this, []);
};

/**
 * Destroys the stage.
 */
Stage.prototype.destroy = function() {
    const options = { children: true, texture: true };
    PIXI.Container.prototype.destroy.call(this, options);
};

//-----------------------------------------------------------------------------
/**
 * The audio object of Web Audio API.
 *
 * @class
 * @param {string} url - The url of the audio file.
 */
function WebAudio() {
    this.initialize(...arguments);
}

WebAudio.prototype.initialize = function(url) {
    this.clear();
    this._url = url;
    this._startLoading();
};

/**
 * Initializes the audio system.
 *
 * @returns {boolean} True if the audio system is available.
 */
WebAudio.initialize = function() {
    this._context = null;
    this._masterGainNode = null;
    this._masterVolume = 1;
    this._createContext();
    this._createMasterGainNode();
    this._setupEventHandlers();
    return !!this._context;
};

/**
 * Sets the master volume for all audio.
 *
 * @param {number} value - The master volume (0 to 1).
 */
WebAudio.setMasterVolume = function(value) {
    this._masterVolume = value;
    this._resetVolume();
};

WebAudio._createContext = function() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this._context = new AudioContext();
    } catch (e) {
        this._context = null;
    }
};

WebAudio._currentTime = function() {
    return this._context ? this._context.currentTime : 0;
};

WebAudio._createMasterGainNode = function() {
    const context = this._context;
    if (context) {
        this._masterGainNode = context.createGain();
        this._resetVolume();
        this._masterGainNode.connect(context.destination);
    }
};

WebAudio._setupEventHandlers = function() {
    const onUserGesture = this._onUserGesture.bind(this);
    const onVisibilityChange = this._onVisibilityChange.bind(this);
    document.addEventListener("keydown", onUserGesture);
    document.addEventListener("mousedown", onUserGesture);
    document.addEventListener("touchend", onUserGesture);
    document.addEventListener("visibilitychange", onVisibilityChange);
};

WebAudio._onUserGesture = function() {
    const context = this._context;
    if (context && context.state === "suspended") {
        context.resume();
    }
};

WebAudio._onVisibilityChange = function() {
    if (document.visibilityState === "hidden") {
        this._onHide();
    } else {
        this._onShow();
    }
};

WebAudio._onHide = function() {
    if (this._shouldMuteOnHide()) {
        this._fadeOut(1);
    }
};

WebAudio._onShow = function() {
    if (this._shouldMuteOnHide()) {
        this._fadeIn(1);
    }
};

WebAudio._shouldMuteOnHide = function() {
    return Utils.isMobileDevice() && !window.navigator.standalone;
};

WebAudio._resetVolume = function() {
    if (this._masterGainNode) {
        const gain = this._masterGainNode.gain;
        const volume = this._masterVolume;
        const currentTime = this._currentTime();
        gain.setValueAtTime(volume, currentTime);
    }
};

WebAudio._fadeIn = function(duration) {
    if (this._masterGainNode) {
        const gain = this._masterGainNode.gain;
        const volume = this._masterVolume;
        const currentTime = this._currentTime();
        gain.setValueAtTime(0, currentTime);
        gain.linearRampToValueAtTime(volume, currentTime + duration);
    }
};

WebAudio._fadeOut = function(duration) {
    if (this._masterGainNode) {
        const gain = this._masterGainNode.gain;
        const volume = this._masterVolume;
        const currentTime = this._currentTime();
        gain.setValueAtTime(volume, currentTime);
        gain.linearRampToValueAtTime(0, currentTime + duration);
    }
};

/**
 * Clears the audio data.
 */
WebAudio.prototype.clear = function() {
    this.stop();
    this._data = null;
    this._fetchedSize = 0;
    this._fetchedData = [];
    this._buffers = [];
    this._sourceNodes = [];
    this._gainNode = null;
    this._pannerNode = null;
    this._totalTime = 0;
    this._sampleRate = 0;
    this._loop = 0;
    this._loopStart = 0;
    this._loopLength = 0;
    this._loopStartTime = 0;
    this._loopLengthTime = 0;
    this._startTime = 0;
    this._volume = 1;
    this._pitch = 1;
    this._pan = 0;
    this._endTimer = null;
    this._loadListeners = [];
    this._stopListeners = [];
    this._lastUpdateTime = 0;
    this._isLoaded = false;
    this._isError = false;
    this._isPlaying = false;
    this._decoder = null;
    this._loadAttempts = 0;
    this._stallCheckTime = 0;
    this._triedExtensions = null;
    this._decodeGeneration = 0;
};

/**
 * The url of the audio file.
 *
 * @readonly
 * @type string
 * @name WebAudio#url
 */
Object.defineProperty(WebAudio.prototype, "url", {
    get: function() {
        return this._url;
    },
    configurable: true
});

/**
 * The volume of the audio.
 *
 * @type number
 * @name WebAudio#volume
 */
Object.defineProperty(WebAudio.prototype, "volume", {
    get: function() {
        return this._volume;
    },
    set: function(value) {
        this._volume = value;
        if (this._gainNode) {
            this._gainNode.gain.setValueAtTime(
                this._volume,
                WebAudio._currentTime()
            );
        }
    },
    configurable: true
});

/**
 * The pitch of the audio.
 *
 * @type number
 * @name WebAudio#pitch
 */
Object.defineProperty(WebAudio.prototype, "pitch", {
    get: function() {
        return this._pitch;
    },
    set: function(value) {
        if (this._pitch !== value) {
            this._pitch = value;
            if (this.isPlaying()) {
                this.play(this._loop, 0);
            }
        }
    },
    configurable: true
});

/**
 * The pan of the audio.
 *
 * @type number
 * @name WebAudio#pan
 */
Object.defineProperty(WebAudio.prototype, "pan", {
    get: function() {
        return this._pan;
    },
    set: function(value) {
        this._pan = value;
        this._updatePanner();
    },
    configurable: true
});

/**
 * Checks whether the audio data is ready to play.
 *
 * @returns {boolean} True if the audio data is ready to play.
 */
WebAudio.prototype.isReady = function() {
    const ready = !!(this._buffers && this._buffers.length > 0);
    if (!ready) {
        // Whoever polls a not-ready buffer is gating on it, so it must be
        // under watchdog protection — self-register. This also revives
        // "zombies": buffers a plugin cache still holds after some other
        // code clear()ed or destroy()ed them (MZ treats buffers as
        // disposable; MV-era audio caches assume they are reusable). A
        // destroyed buffer nobody polls is never revived.
        if (this._url) {
            WebAudio._loadWatchList = WebAudio._loadWatchList || [];
            if (WebAudio._loadWatchList.indexOf(this) < 0) {
                WebAudio._loadWatchList.push(this);
            }
        }
        // Sweep ALL loading buffers, not just this one: cache-level
        // isReady() implementations short-circuit at the first not-ready
        // buffer, which would serialize stall recovery to one file per
        // watchdog period.
        WebAudio._sweepStalledLoads();
    }
    return ready;
};

WebAudio._sweepStalledLoads = function() {
    const list = WebAudio._loadWatchList;
    if (!list || list.length === 0) return;
    // Poll-driven sweeps (every isReady() call while a scene gates on N
    // loading buffers) made recovery O(N²) per frame; the 10s stall
    // threshold doesn't need sub-quarter-second resolution.
    const now = Date.now();
    if (WebAudio._lastSweepTime && now - WebAudio._lastSweepTime < 250) return;
    WebAudio._lastSweepTime = now;
    for (let i = list.length - 1; i >= 0; i--) {
        const buffer = list[i];
        const done = buffer._degradedToSilence ||
            (buffer._buffers && buffer._buffers.length > 0 && buffer._isLoaded);
        if (done) {
            list.splice(i, 1);
        } else {
            buffer._checkStalledLoad();
        }
    }
};

/**
 * Checks whether a loading error has occurred.
 *
 * @returns {boolean} True if a loading error has occurred.
 */
WebAudio.prototype.isError = function() {
    return this._isError;
};

/**
 * Checks whether the audio is playing.
 *
 * @returns {boolean} True if the audio is playing.
 */
WebAudio.prototype.isPlaying = function() {
    return this._isPlaying;
};

/**
 * Plays the audio.
 *
 * @param {boolean} loop - Whether the audio data play in a loop.
 * @param {number} offset - The start position to play in seconds.
 */
WebAudio.prototype.play = function(loop, offset) {
    this._loop = loop;
    if (this.isReady()) {
        offset = offset || 0;
        this._startPlaying(offset);
    } else if (WebAudio._context) {
        this.addLoadListener(() => this.play(loop, offset));
    }
    this._isPlaying = true;
};

/**
 * Stops the audio.
 */
WebAudio.prototype.stop = function() {
    this._isPlaying = false;
    this._removeEndTimer();
    this._removeNodes();
    this._loadListeners = [];
    if (this._stopListeners) {
        while (this._stopListeners.length > 0) {
            const listner = this._stopListeners.shift();
            listner();
        }
    }
};

/**
 * Destroys the audio.
 */
WebAudio.prototype.destroy = function() {
    this._destroyDecoder();
    this.clear();
    // Drop off the watchdog list: the tick-driven sweep would otherwise
    // classify this destroyed buffer as a stalled load and re-download and
    // re-decode it ~10s later. Only an explicit isReady() poll (a plugin
    // cache still holding the buffer) may revive it — the invariant
    // documented in isReady().
    const list = WebAudio._loadWatchList;
    if (list) {
        const index = list.indexOf(this);
        if (index >= 0) {
            list.splice(index, 1);
        }
    }
};

/**
 * Performs the audio fade-in.
 *
 * @param {number} duration - Fade-in time in seconds.
 */
WebAudio.prototype.fadeIn = function(duration) {
    if (this.isReady()) {
        if (this._gainNode) {
            const gain = this._gainNode.gain;
            const currentTime = WebAudio._currentTime();
            gain.setValueAtTime(0, currentTime);
            gain.linearRampToValueAtTime(this._volume, currentTime + duration);
        }
    } else {
        this.addLoadListener(() => this.fadeIn(duration));
    }
};

/**
 * Performs the audio fade-out.
 *
 * @param {number} duration - Fade-out time in seconds.
 */
WebAudio.prototype.fadeOut = function(duration) {
    if (this._gainNode) {
        const gain = this._gainNode.gain;
        const currentTime = WebAudio._currentTime();
        gain.setValueAtTime(this._volume, currentTime);
        gain.linearRampToValueAtTime(0, currentTime + duration);
    }
    this._isPlaying = false;
    this._loadListeners = [];
};

/**
 * Gets the seek position of the audio.
 */
WebAudio.prototype.seek = function() {
    if (WebAudio._context) {
        let pos = (WebAudio._currentTime() - this._startTime) * this._pitch;
        if (this._loopLengthTime > 0) {
            while (pos >= this._loopStartTime + this._loopLengthTime) {
                pos -= this._loopLengthTime;
            }
        }
        return pos;
    } else {
        return 0;
    }
};

/**
 * Adds a callback function that will be called when the audio data is loaded.
 *
 * @param {function} listner - The callback function.
 */
WebAudio.prototype.addLoadListener = function(listner) {
    this._loadListeners.push(listner);
};

/**
 * Adds a callback function that will be called when the playback is stopped.
 *
 * @param {function} listner - The callback function.
 */
WebAudio.prototype.addStopListener = function(listner) {
    this._stopListeners.push(listner);
};

/**
 * Tries to load the audio again.
 */
WebAudio.prototype.retry = function() {
    this._startLoading();
    if (this._isPlaying) {
        this.play(this._loop, 0);
    }
};

WebAudio.prototype._startLoading = function() {
    // Watchdog registration must happen even when the context guard below
    // skips the actual load (a buffer created in a brief context-less
    // window would otherwise be permanently inert and invisible to the
    // stall sweep, deadlocking anything gating on AudioManager.isReady).
    WebAudio._loadWatchList = WebAudio._loadWatchList || [];
    if (WebAudio._loadWatchList.indexOf(this) < 0) {
        WebAudio._loadWatchList.push(this);
    }
    this._stallCheckTime = 0;
    if (WebAudio._context) {
        const suffix = Utils.hasEncryptedAudio() ? "_" : "";
        this._url = Utils.resolveAudioExtension(this._url, suffix);
        this._url = Utils.resolveFileCase(this._url, suffix);
        const url = this._realUrl();
        if (Utils.isLocal()) {
            this._startXhrLoading(url);
        } else {
            this._startFetching(url);
        }
        const currentTime = WebAudio._currentTime();
        this._lastUpdateTime = currentTime - 0.5;
        this._isError = false;
        this._isLoaded = false;
        this._destroyDecoder();
        if (this._shouldUseDecoder()) {
            this._createDecoder();
        }
        this._loadAttempts = (this._loadAttempts || 0) + 1;
    }
};

// A loading request can silently die without firing onload OR onerror
// (e.g., a dropped XHR in the burst of ~20 parallel audio loads during a
// save-game load), leaving isReady() false forever. Anything gating on
// AudioManager.isReady() -- preload plugins wrap Scene_Base.isReady with
// it -- then deadlocks the scene: never started, stage never set, screen
// permanently black. The stall check runs from isReady() itself: it is
// polled every frame by exactly the code that is blocked waiting, and it
// measures AudioContext time, so it works even when the window is
// backgrounded (where setTimeout is throttled) and even if the load never
// armed because the context was missing at creation time. Zero progress
// for 10s -> retry (3 attempts) -> surface a real error.
WebAudio.prototype._checkStalledLoad = function() {
    if (this._isLoaded) {
        return;
    }
    if (this._isError) {
        // A real onerror fired (file missing or unreadable). Retry a few
        // times, then degrade to SILENCE instead of erroring forever:
        // plugin audio caches gate scene readiness on every cached buffer,
        // so a permanently-errored buffer would deadlock the game over a
        // missing sound file. Silence + a loud log is strictly better.
        if (this._degradedToSilence) return;
        const nowE = performance.now() / 1000;
        if (!this._stallCheckTime) {
            this._stallCheckTime = nowE;
            return;
        }
        if (nowE - this._stallCheckTime < 10) return;
        this._stallCheckTime = nowE;
        if ((this._loadAttempts || 0) < 3) {
            console.warn("WebAudio: load error, retrying " + this._url + " (attempt " + this._loadAttempts + ")");
            this._startLoading();
        } else if (WebAudio._context) {
            console.error("WebAudio: '" + this._url + "' failed to load after retries; continuing with SILENCE. Check that the file exists.");
            this._degradedToSilence = true;
            this._buffers = [WebAudio._context.createBuffer(1, 1, 22050)];
            this._totalTime = 0;
            this._loopStartTime = 0;
            this._loopLengthTime = 0;
            this._isLoaded = true;
            this._isError = false;
            const listeners = this._loadListeners ? this._loadListeners.splice(0) : [];
            for (const listener of listeners) {
                try { listener(); } catch (e) { /* listener errors must not cascade */ }
            }
        }
        return;
    }
    // performance.now, NOT AudioContext.currentTime: the context clock
    // freezes while the context is suspended (e.g. during scene switches
    // or in background windows), which blinds the stall detector exactly
    // when loads are most likely to stall.
    const now = performance.now() / 1000;
    const progressing =
        this._fetchedSize > 0 || (this._data && this._data.length > 0);
    if (!this._stallCheckTime || progressing) {
        this._stallCheckTime = now;
        return;
    }
    if (now - this._stallCheckTime >= 10) {
        this._stallCheckTime = now;
        // Retry indefinitely: a genuinely missing file fires onerror
        // immediately and takes the real error path; a silent stall is a
        // transient environment condition, so giving up can only produce
        // spurious errors for audio that would have arrived.
        console.warn("WebAudio: stalled load, retrying " + this._url + " (attempt " + (this._loadAttempts || 0) + ")");
        this._startLoading();
    }
};

WebAudio.prototype._shouldUseDecoder = function() {
    // The fallback decoder speaks Vorbis only; other formats decode
    // natively everywhere.
    return (
        !Utils.canPlayOgg() &&
        typeof VorbisDecoder === "function" &&
        /\.ogg_?$/i.test(this._url || "")
    );
};

WebAudio.prototype._createDecoder = function() {
    this._decoder = new VorbisDecoder(
        WebAudio._context,
        this._onDecode.bind(this),
        this._onError.bind(this)
    );
};

WebAudio.prototype._destroyDecoder = function() {
    if (this._decoder) {
        this._decoder.destroy();
        this._decoder = null;
    }
};

WebAudio.prototype._realUrl = function() {
    return this._url + (Utils.hasEncryptedAudio() ? "_" : "");
};

WebAudio.prototype._startXhrLoading = function(url) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "arraybuffer";
    xhr.onload = () => this._onXhrLoad(xhr);
    xhr.onerror = this._onError.bind(this);
    xhr.send();
};

WebAudio.prototype._startFetching = function(url) {
    const options = { credentials: "same-origin" };
    fetch(url, options)
        .then(response => this._onFetch(response))
        .catch(() => this._onError());
};

WebAudio.prototype._onXhrLoad = function(xhr) {
    if (xhr.status < 400) {
        this._data = new Uint8Array(xhr.response);
        this._isLoaded = true;
        this._updateBuffer();
    } else {
        this._onError();
    }
};

WebAudio.prototype._onFetch = function(response) {
    if (response.ok) {
        const reader = response.body.getReader();
        const readChunk = ({ done, value }) => {
            if (done) {
                this._isLoaded = true;
                if (this._fetchedSize > 0) {
                    this._concatenateFetchedData();
                    this._updateBuffer();
                    this._data = null;
                }
                return 0;
            } else {
                this._onFetchProcess(value);
                return reader.read().then(readChunk);
            }
        };
        reader
            .read()
            .then(readChunk)
            .catch(() => this._onError());
    } else {
        this._onError();
    }
};

WebAudio.prototype._onError = function() {
    // Without filesystem access the real extension can only be found by
    // asking: when a request dies before any data arrives, walk the other
    // audio extensions before treating the file as missing. (With NW.js
    // the extension was already resolved up front and this never fires.)
    const noData = this._fetchedSize === 0 && (!this._data || !this._data.length);
    if (noData && !Utils.isNwjs()) {
        const match = /\.[a-z0-9]+$/i.exec(this._url || "");
        const ext = match ? match[0].toLowerCase() : "";
        if (Utils.AUDIO_EXTENSIONS.includes(ext)) {
            this._triedExtensions = this._triedExtensions || [ext];
            const next = Utils.AUDIO_EXTENSIONS.find(
                e => !this._triedExtensions.includes(e));
            if (next) {
                this._triedExtensions.push(next);
                this._url = this._url.slice(0, -ext.length) + next;
                this._startLoading();
                return;
            }
            // Every extension 404ed: put the original URL back so retries,
            // error messages and case correction speak of the file asked for.
            this._url = this._url.slice(0, -ext.length) + this._triedExtensions[0];
        }
    }
    // One retry with the on-disk casing before giving up: Windows-authored
    // projects freely mix filename case that Windows resolves and a
    // case-sensitive filesystem does not.
    if (!this._triedCaseCorrection) {
        this._triedCaseCorrection = true;
        const suffix = Utils.hasEncryptedAudio() ? "_" : "";
        const corrected = Utils.correctFileCase(this._url + suffix);
        if (corrected) {
            this._url = suffix && corrected.endsWith(suffix)
                ? corrected.slice(0, -suffix.length)
                : corrected;
            this._startLoading();
            return;
        }
    }
    if (this._sourceNodes.length > 0) {
        this._stopSourceNode();
    }
    this._data = null;
    this._isError = true;
};

WebAudio.prototype._onFetchProcess = function(value) {
    this._fetchedSize += value.length;
    this._fetchedData.push(value);
    this._updateBufferOnFetch();
};

WebAudio.prototype._updateBufferOnFetch = function() {
    const currentTime = WebAudio._currentTime();
    const deltaTime = currentTime - this._lastUpdateTime;
    const currentData = this._data;
    const currentSize = currentData ? currentData.length : 0;
    if (deltaTime >= 1 && currentSize + this._fetchedSize >= 200000) {
        this._concatenateFetchedData();
        this._updateBuffer();
        this._lastUpdateTime = currentTime;
    }
};

WebAudio.prototype._concatenateFetchedData = function() {
    const currentData = this._data;
    const currentSize = currentData ? currentData.length : 0;
    const newData = new Uint8Array(currentSize + this._fetchedSize);
    let pos = 0;
    if (currentData) {
        newData.set(currentData);
        pos += currentSize;
    }
    for (const value of this._fetchedData) {
        newData.set(value, pos);
        pos += value.length;
    }
    this._data = newData;
    this._fetchedData = [];
    this._fetchedSize = 0;
};

WebAudio.prototype._updateBuffer = function() {
    const arrayBuffer = this._readableBuffer();
    this._readLoopComments(arrayBuffer);
    this._decodeAudioData(arrayBuffer);
};

WebAudio.prototype._readableBuffer = function() {
    if (Utils.hasEncryptedAudio()) {
        return Utils.decryptArrayBuffer(this._data.buffer);
    } else {
        return this._data.buffer;
    }
};

WebAudio.prototype._decodeAudioData = function(arrayBuffer) {
    if (this._shouldUseDecoder()) {
        if (this._decoder) {
            this._decoder.send(arrayBuffer, this._isLoaded);
        }
    } else {
        // [Note] Make a temporary copy of arrayBuffer because
        //   decodeAudioData() detaches it.
        // Streamed loads decode a growing prefix of the file repeatedly.
        // A truncated prefix can fail to decode even though the finished
        // file is fine (WAV in particular), so a failure only counts when
        // it comes from the newest attempt on fully fetched data.
        const generation = (this._decodeGeneration || 0) + 1;
        this._decodeGeneration = generation;
        WebAudio._context
            .decodeAudioData(arrayBuffer.slice())
            .then(buffer => {
                if (generation === this._decodeGeneration) {
                    this._onDecode(buffer);
                }
            })
            .catch(() => {
                if (generation === this._decodeGeneration && this._isLoaded) {
                    this._onError();
                }
            });
    }
};

WebAudio.prototype._onDecode = function(buffer) {
    if (!this._shouldUseDecoder()) {
        this._buffers = [];
        this._totalTime = 0;
    }
    this._buffers.push(buffer);
    this._totalTime += buffer.duration;
    if (this._loopLength > 0 && this._sampleRate > 0) {
        this._loopStartTime = this._loopStart / this._sampleRate;
        this._loopLengthTime = this._loopLength / this._sampleRate;
    } else {
        this._loopStartTime = 0;
        this._loopLengthTime = this._totalTime;
    }
    if (this._sourceNodes.length > 0) {
        this._refreshSourceNode();
    }
    this._onLoad();
};

WebAudio.prototype._refreshSourceNode = function() {
    if (this._shouldUseDecoder()) {
        const index = this._buffers.length - 1;
        this._createSourceNode(index);
        if (this._isPlaying) {
            this._startSourceNode(index);
        }
    } else {
        this._stopSourceNode();
        this._createAllSourceNodes();
        if (this._isPlaying) {
            this._startAllSourceNodes();
        }
    }
    if (this._isPlaying) {
        this._removeEndTimer();
        this._createEndTimer();
    }
};

WebAudio.prototype._startPlaying = function(offset) {
    if (this._loopLengthTime > 0) {
        while (offset >= this._loopStartTime + this._loopLengthTime) {
            offset -= this._loopLengthTime;
        }
    }
    this._startTime = WebAudio._currentTime() - offset / this._pitch;
    this._removeEndTimer();
    this._removeNodes();
    this._createPannerNode();
    this._createGainNode();
    this._createAllSourceNodes();
    this._startAllSourceNodes();
    this._createEndTimer();
};

WebAudio.prototype._startAllSourceNodes = function() {
    for (let i = 0; i < this._sourceNodes.length; i++) {
        this._startSourceNode(i);
    }
};

WebAudio.prototype._startSourceNode = function(index) {
    const sourceNode = this._sourceNodes[index];
    const seekPos = this.seek();
    const currentTime = WebAudio._currentTime();
    const loop = this._loop;
    const loopStart = this._loopStartTime;
    const loopLength = this._loopLengthTime;
    const loopEnd = loopStart + loopLength;
    const pitch = this._pitch;
    let chunkStart = 0;
    for (let i = 0; i < index; i++) {
        chunkStart += this._buffers[i].duration;
    }
    const chunkEnd = chunkStart + sourceNode.buffer.duration;
    let when = 0;
    let offset = 0;
    let duration = sourceNode.buffer.duration;
    if (seekPos >= chunkStart && seekPos < chunkEnd - 0.01) {
        when = currentTime;
        offset = seekPos - chunkStart;
    } else {
        when = currentTime + (chunkStart - seekPos) / pitch;
        offset = 0;
        if (loop) {
            if (when < currentTime - 0.01) {
                when += loopLength / pitch;
            }
            if (seekPos >= loopStart && chunkStart < loopStart) {
                when += (loopStart - chunkStart) / pitch;
                offset = loopStart - chunkStart;
            }
        }
    }
    if (loop && loopEnd < chunkEnd) {
        duration = loopEnd - chunkStart - offset;
    }
    if (this._shouldUseDecoder()) {
        if (when >= currentTime && offset < duration) {
            sourceNode.loop = false;
            sourceNode.start(when, offset, duration);
            if (loop && chunkEnd > loopStart) {
                sourceNode.onended = () => {
                    this._createSourceNode(index);
                    this._startSourceNode(index);
                };
            }
        }
    } else {
        if (when >= currentTime && offset < sourceNode.buffer.duration) {
            sourceNode.start(when, offset);
        }
    }
    chunkStart += sourceNode.buffer.duration;
};

WebAudio.prototype._stopSourceNode = function() {
    for (const sourceNode of this._sourceNodes) {
        try {
            sourceNode.onended = null;
            sourceNode.stop();
        } catch (e) {
            // Ignore InvalidStateError
        }
    }
};

WebAudio.prototype._createPannerNode = function() {
    this._pannerNode = WebAudio._context.createPanner();
    this._pannerNode.panningModel = "equalpower";
    this._pannerNode.connect(WebAudio._masterGainNode);
    this._updatePanner();
};

WebAudio.prototype._createGainNode = function() {
    const currentTime = WebAudio._currentTime();
    this._gainNode = WebAudio._context.createGain();
    this._gainNode.gain.setValueAtTime(this._volume, currentTime);
    this._gainNode.connect(this._pannerNode);
};

WebAudio.prototype._createAllSourceNodes = function() {
    for (let i = 0; i < this._buffers.length; i++) {
        this._createSourceNode(i);
    }
};

WebAudio.prototype._createSourceNode = function(index) {
    const sourceNode = WebAudio._context.createBufferSource();
    const currentTime = WebAudio._currentTime();
    sourceNode.buffer = this._buffers[index];
    sourceNode.loop = this._loop && this._isLoaded;
    sourceNode.loopStart = this._loopStartTime;
    sourceNode.loopEnd = this._loopStartTime + this._loopLengthTime;
    sourceNode.playbackRate.setValueAtTime(this._pitch, currentTime);
    sourceNode.connect(this._gainNode);
    this._sourceNodes[index] = sourceNode;
};

WebAudio.prototype._removeNodes = function() {
    if (this._sourceNodes && this._sourceNodes.length > 0) {
        this._stopSourceNode();
        this._sourceNodes = [];
        this._gainNode = null;
        this._pannerNode = null;
    }
};

WebAudio.prototype._createEndTimer = function() {
    if (this._sourceNodes.length > 0 && !this._loop) {
        const endTime = this._startTime + this._totalTime / this._pitch;
        const delay = endTime - WebAudio._currentTime();
        this._endTimer = setTimeout(this.stop.bind(this), delay * 1000);
    }
};

WebAudio.prototype._removeEndTimer = function() {
    if (this._endTimer) {
        clearTimeout(this._endTimer);
        this._endTimer = null;
    }
};

WebAudio.prototype._updatePanner = function() {
    if (this._pannerNode) {
        const x = this._pan;
        const z = 1 - Math.abs(x);
        this._pannerNode.setPosition(x, 0, z);
    }
};

WebAudio.prototype._onLoad = function() {
    while (this._loadListeners.length > 0) {
        const listner = this._loadListeners.shift();
        listner();
    }
};

WebAudio.prototype._readLoopComments = function(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const magic = this._readFourCharacters(view, 0);
    if (magic === "RIFF") {
        this._readWavLoopComments(view);
    } else if (magic.slice(0, 3) === "ID3") {
        this._readMp3LoopComments(view);
    } else if (magic === "fLaC") {
        this._readFlacLoopComments(view);
    } else if (magic === "OggS") {
        this._readOggLoopComments(view);
    }
};

// FLAC carries the same vorbis comments as OGG, so LOOPSTART/LOOPLENGTH
// work identically; the sample rate lives in the STREAMINFO block.
WebAudio.prototype._readFlacLoopComments = function(view) {
    let index = 4;
    while (index + 4 <= view.byteLength) {
        const blockHeader = view.getUint8(index);
        const blockType = blockHeader & 0x7f;
        const blockSize =
            (view.getUint8(index + 1) << 16) |
            (view.getUint8(index + 2) << 8) |
            view.getUint8(index + 3);
        const dataIndex = index + 4;
        if (dataIndex + blockSize > view.byteLength) return;
        if (blockType === 0 && blockSize >= 18) {
            // STREAMINFO: the sample rate is 20 bits starting at byte 10.
            this._sampleRate =
                (view.getUint8(dataIndex + 10) << 12) |
                (view.getUint8(dataIndex + 11) << 4) |
                (view.getUint8(dataIndex + 12) >> 4);
        } else if (blockType === 4) {
            this._readFlacComments(view, dataIndex, blockSize);
        }
        if (blockHeader & 0x80) return; // last metadata block
        index = dataIndex + blockSize;
    }
};

WebAudio.prototype._readFlacComments = function(view, index, size) {
    const end = index + size;
    if (index + 4 > end) return;
    let offset = index + 4 + view.getUint32(index, true); // vendor string
    if (offset + 4 > end) return;
    const count = view.getUint32(offset, true);
    offset += 4;
    for (let i = 0; i < count; i++) {
        if (offset + 4 > end) return;
        const length = view.getUint32(offset, true);
        offset += 4;
        if (offset + length > end) return;
        let text = "";
        for (let j = 0; j < length && j < 24; j++) {
            text += String.fromCharCode(view.getUint8(offset + j));
        }
        if (text.match(/^LOOPSTART=([0-9]+)/i)) {
            this._loopStart = parseInt(RegExp.$1);
        } else if (text.match(/^LOOPLENGTH=([0-9]+)/i)) {
            this._loopLength = parseInt(RegExp.$1);
        }
        offset += length;
    }
};

WebAudio.prototype._readOggLoopComments = function(view) {
    let index = 0;
    while (index < view.byteLength - 30) {
        if (this._readFourCharacters(view, index) !== "OggS") {
            break;
        }
        index += 26;
        const numSegments = view.getUint8(index++);
        const segments = [];
        for (let i = 0; i < numSegments; i++) {
            segments.push(view.getUint8(index++));
        }
        const packets = [];
        while (segments.length > 0) {
            let packetSize = 0;
            while (segments[0] === 255) {
                packetSize += segments.shift();
            }
            if (segments.length > 0) {
                packetSize += segments.shift();
            }
            packets.push(packetSize);
        }
        let vorbisHeaderFound = false;
        for (const size of packets) {
            if (this._readFourCharacters(view, index + 1) === "vorb") {
                const headerType = view.getUint8(index);
                if (headerType === 1) {
                    this._sampleRate = view.getUint32(index + 12, true);
                } else if (headerType === 3) {
                    this._readMetaData(view, index, size);
                }
                vorbisHeaderFound = true;
            }
            index += size;
        }
        if (!vorbisHeaderFound) {
            break;
        }
    }
};

WebAudio.prototype._readMetaData = function(view, index, size) {
    for (let i = index; i < index + size - 10; i++) {
        if (this._readFourCharacters(view, i) === "LOOP") {
            let text = "";
            while (view.getUint8(i) > 0) {
                text += String.fromCharCode(view.getUint8(i++));
            }
            if (text.match(/LOOPSTART=([0-9]+)/)) {
                this._loopStart = parseInt(RegExp.$1);
            }
            if (text.match(/LOOPLENGTH=([0-9]+)/)) {
                this._loopLength = parseInt(RegExp.$1);
            }
            if (text === "LOOPSTART" || text === "LOOPLENGTH") {
                let text2 = "";
                i += 16;
                while (view.getUint8(i) > 0) {
                    text2 += String.fromCharCode(view.getUint8(i++));
                }
                if (text === "LOOPSTART") {
                    this._loopStart = parseInt(text2);
                } else {
                    this._loopLength = parseInt(text2);
                }
            }
        }
    }
};

// Loop points for a WAV file come from the sampler ("smpl") chunk, the
// format samplers and DAWs write them to. The sample rate comes from the
// format chunk so loop samples convert to time exactly as for OGG.
// Streamed loads pass a growing prefix, so every read is bounds-checked
// and a truncated chunk simply leaves the defaults until the next pass.
WebAudio.prototype._readWavLoopComments = function(view) {
    if (view.byteLength < 12) return;
    if (this._readFourCharacters(view, 8) !== "WAVE") return;
    let index = 12;
    while (index + 8 <= view.byteLength) {
        const chunkId = this._readFourCharacters(view, index);
        const chunkSize = view.getUint32(index + 4, true);
        const dataIndex = index + 8;
        if (chunkId === "fmt " && dataIndex + 8 <= view.byteLength) {
            this._sampleRate = view.getUint32(dataIndex + 4, true);
        } else if (chunkId === "smpl" && dataIndex + 52 <= view.byteLength) {
            const numLoops = view.getUint32(dataIndex + 28, true);
            if (numLoops > 0) {
                const start = view.getUint32(dataIndex + 44, true);
                const end = view.getUint32(dataIndex + 48, true);
                if (end > start) {
                    this._loopStart = start;
                    this._loopLength = end - start;
                }
            }
        }
        // Chunks are word-aligned; odd sizes carry a pad byte.
        index = dataIndex + chunkSize + (chunkSize % 2);
    }
};

// Loop points for an MP3 come from ID3v2 TXXX frames named LOOPSTART and
// LOOPLENGTH (the convention loop-tagging tools share with the OGG
// comments). The sample rate comes from the first MPEG frame header after
// the tag.
WebAudio.prototype._readMp3LoopComments = function(view) {
    if (view.byteLength < 10) return;
    const major = view.getUint8(3);
    const tagFlags = view.getUint8(5);
    if (tagFlags & 0x80) return; // unsynchronised tags are not worth parsing
    const syncsafe = at =>
        ((view.getUint8(at) & 0x7f) << 21) |
        ((view.getUint8(at + 1) & 0x7f) << 14) |
        ((view.getUint8(at + 2) & 0x7f) << 7) |
        (view.getUint8(at + 3) & 0x7f);
    let tagEnd = 10 + syncsafe(6);
    if (tagFlags & 0x10) tagEnd += 10; // footer
    let index = 10;
    if (tagFlags & 0x40 && index + 4 <= view.byteLength) {
        index += major >= 4 ? syncsafe(index) : view.getUint32(index); // ext. header
    }
    const limit = Math.min(tagEnd, view.byteLength);
    while (index + 10 <= limit) {
        const frameId = this._readFourCharacters(view, index);
        if (!/^[A-Z0-9]{4}$/.test(frameId)) break; // padding reached
        const frameSize = major >= 4 ? syncsafe(index + 4) : view.getUint32(index + 4);
        const frameEnd = index + 10 + frameSize;
        if (frameSize <= 0 || frameEnd > limit) break;
        if (frameId === "TXXX") {
            const text = this._readMp3UserText(view, index + 10, frameSize);
            if (text) {
                if (text.name === "LOOPSTART") {
                    this._loopStart = parseInt(text.value) || 0;
                } else if (text.name === "LOOPLENGTH") {
                    this._loopLength = parseInt(text.value) || 0;
                }
            }
        }
        index = frameEnd;
    }
    this._readMp3SampleRate(view, tagEnd);
};

WebAudio.prototype._readMp3UserText = function(view, index, size) {
    const encoding = view.getUint8(index);
    const wide = encoding === 1 || encoding === 2;
    const bytes = [];
    for (let i = index + 1; i < index + size; i++) {
        bytes.push(view.getUint8(i));
    }
    // Split description and value on the encoding's null terminator; the
    // loop tags are plain ASCII in every encoding, so non-ASCII bytes are
    // simply dropped rather than decoded.
    const step = wide ? 2 : 1;
    let split = -1;
    for (let i = 0; i + step <= bytes.length; i += step) {
        if (bytes[i] === 0 && (!wide || bytes[i + 1] === 0)) {
            split = i;
            break;
        }
    }
    if (split < 0) return null;
    const asAscii = list => list
        .filter(byte => byte >= 0x20 && byte < 0x7f)
        .map(byte => String.fromCharCode(byte))
        .join("");
    return {
        name: asAscii(bytes.slice(0, split)).toUpperCase(),
        value: asAscii(bytes.slice(split + step))
    };
};

WebAudio.prototype._readMp3SampleRate = function(view, start) {
    const rates = {
        3: [44100, 48000, 32000], // MPEG 1
        2: [22050, 24000, 16000], // MPEG 2
        0: [11025, 12000, 8000] // MPEG 2.5
    };
    const end = Math.min(view.byteLength - 4, start + 4096);
    for (let i = Math.max(start, 0); i < end; i++) {
        if (view.getUint8(i) !== 0xff || (view.getUint8(i + 1) & 0xe0) !== 0xe0) {
            continue;
        }
        const version = (view.getUint8(i + 1) >> 3) & 0x03;
        const rateIndex = (view.getUint8(i + 2) >> 2) & 0x03;
        const table = rates[version];
        if (table && rateIndex < 3) {
            this._sampleRate = table[rateIndex];
            return;
        }
    }
};

WebAudio.prototype._readFourCharacters = function(view, index) {
    let string = "";
    if (index <= view.byteLength - 4) {
        for (let i = 0; i < 4; i++) {
            string += String.fromCharCode(view.getUint8(index + i));
        }
    }
    return string;
};

//-----------------------------------------------------------------------------
/**
 * The static class that handles video playback.
 *
 * @namespace
 */
function Video() {
    throw new Error("This is a static class");
}

/**
 * Initializes the video system.
 *
 * @param {number} width - The width of the video.
 * @param {number} height - The height of the video.
 */
Video.initialize = function(width, height) {
    this._element = null;
    this._loading = false;
    this._volume = 1;
    this._createElement();
    this._setupEventHandlers();
    this.resize(width, height);
};

/**
 * Changes the display size of the video.
 *
 * @param {number} width - The width of the video.
 * @param {number} height - The height of the video.
 */
Video.resize = function(width, height) {
    if (this._element) {
        this._element.style.width = width + "px";
        this._element.style.height = height + "px";
    }
};

/**
 * Starts playback of a video.
 *
 * @param {string} src - The url of the video.
 */
Video.play = function(src) {
    this._element.src = src;
    this._element.onloadeddata = this._onLoad.bind(this);
    this._element.onerror = this._onError.bind(this);
    this._element.onended = this._onEnd.bind(this);
    this._element.load();
    this._loading = true;
};

/**
 * Checks whether the video is playing.
 *
 * @returns {boolean} True if the video is playing.
 */
Video.isPlaying = function() {
    return this._loading || this._isVisible();
};

/**
 * Sets the volume for videos.
 *
 * @param {number} volume - The volume for videos (0 to 1).
 */
Video.setVolume = function(volume) {
    this._volume = volume;
    if (this._element) {
        this._element.volume = this._volume;
    }
};

Video._createElement = function() {
    this._element = document.createElement("video");
    this._element.id = "gameVideo";
    this._element.style.position = "absolute";
    this._element.style.margin = "auto";
    this._element.style.top = 0;
    this._element.style.left = 0;
    this._element.style.right = 0;
    this._element.style.bottom = 0;
    this._element.style.opacity = 0;
    this._element.style.zIndex = 2;
    this._element.setAttribute("playsinline", "");
    this._element.oncontextmenu = () => false;
    document.body.appendChild(this._element);
};

Video._onLoad = function() {
    this._element.volume = this._volume;
    this._element.play();
    this._updateVisibility(true);
    this._loading = false;
};

Video._onError = function() {
    this._updateVisibility(false);
    const retry = () => {
        this._element.load();
    };
    throw ["LoadError", this._element.src, retry];
};

Video._onEnd = function() {
    this._updateVisibility(false);
};

Video._updateVisibility = function(videoVisible) {
    if (videoVisible) {
        Graphics.hideScreen();
    } else {
        Graphics.showScreen();
    }
    this._element.style.opacity = videoVisible ? 1 : 0;
};

Video._isVisible = function() {
    return this._element.style.opacity > 0;
};

Video._setupEventHandlers = function() {
    const onUserGesture = this._onUserGesture.bind(this);
    document.addEventListener("keydown", onUserGesture);
    document.addEventListener("mousedown", onUserGesture);
    document.addEventListener("touchend", onUserGesture);
};

Video._onUserGesture = function() {
    if (!this._element.src && this._element.paused) {
        this._element.play().catch(() => 0);
    }
};

//-----------------------------------------------------------------------------
/**
 * The static class that handles input data from the keyboard and gamepads.
 *
 * @namespace
 */
function Input() {
    throw new Error("This is a static class");
}

/**
 * Initializes the input system.
 */
Input.initialize = function() {
    this.clear();
    this._setupEventHandlers();
};

/**
 * The wait time of the key repeat in frames.
 *
 * @type number
 */
Input.keyRepeatWait = 24;

/**
 * The interval of the key repeat in frames.
 *
 * @type number
 */
Input.keyRepeatInterval = 6;

/**
 * A hash table to convert from a virtual key code to a mapped key name.
 *
 * @type Object
 */
Input.keyMapper = {
    9: "tab", // tab
    13: "ok", // enter
    16: "shift", // shift
    17: "control", // control
    18: "control", // alt
    27: "escape", // escape
    32: "ok", // space
    33: "pageup", // pageup
    34: "pagedown", // pagedown
    37: "left", // left arrow
    38: "up", // up arrow
    39: "right", // right arrow
    40: "down", // down arrow
    45: "escape", // insert
    81: "pageup", // Q
    87: "pagedown", // W
    88: "escape", // X
    90: "ok", // Z
    96: "escape", // numpad 0
    98: "down", // numpad 2
    100: "left", // numpad 4
    102: "right", // numpad 6
    104: "up", // numpad 8
    120: "debug" // F9
};

/**
 * A hash table to convert from a gamepad button to a mapped key name.
 *
 * @type Object
 */
Input.gamepadMapper = {
    0: "ok", // A
    1: "cancel", // B
    2: "shift", // X
    3: "menu", // Y
    4: "pageup", // LB
    5: "pagedown", // RB
    12: "up", // D-pad up
    13: "down", // D-pad down
    14: "left", // D-pad left
    15: "right" // D-pad right
};

/**
 * Clears all the input data.
 */
Input.clear = function() {
    this._currentState = {};
    this._keyboardState = {};
    this._physicalKeyState = {};
    this._previousState = {};
    this._releasedState = {};
    this._gamepadStates = [];
    this._gamepadLogicalState = {};
    this._latestButton = null;
    this._pressedTime = 0;
    this._dir4 = 0;
    this._dir8 = 0;
    this._preferredAxis = "";
    this._date = 0;
    this._virtualButton = null;
};

/**
 * Updates the input data.
 */
Input.update = function() {
    this._pollGamepads();
    this._releasedState = {};
    if (this._currentState[this._latestButton]) {
        this._pressedTime++;
    } else {
        this._latestButton = null;
    }
    for (const name in this._currentState) {
        if (!this._currentState[name] && this._previousState[name]) {
            this._releasedState[name] = true;
        }
        if (this._currentState[name] && !this._previousState[name]) {
            this._latestButton = name;
            this._pressedTime = 0;
            this._date = Date.now();
        }
        this._previousState[name] = this._currentState[name];
    }
    if (this._virtualButton) {
        this._latestButton = this._virtualButton;
        this._pressedTime = 0;
        this._virtualButton = null;
    }
    this._updateDirection();
};

/**
 * Checks whether a key is currently pressed down.
 *
 * @param {string} keyName - The mapped name of the key.
 * @returns {boolean} True if the key is pressed.
 */
Input.isPressed = function(keyName) {
    if (this._isEscapeCompatible(keyName) && this.isPressed("escape")) {
        return true;
    } else {
        return !!this._currentState[keyName];
    }
};

/**
 * Checks whether a key is just pressed.
 *
 * @param {string} keyName - The mapped name of the key.
 * @returns {boolean} True if the key is triggered.
 */
Input.isTriggered = function(keyName) {
    if (this._isEscapeCompatible(keyName) && this.isTriggered("escape")) {
        return true;
    } else {
        return this._latestButton === keyName && this._pressedTime === 0;
    }
};

/**
 * Checks whether a key was released during the latest update.
 *
 * @param {string} keyName - The mapped name of the key.
 * @returns {boolean} True if the key was released.
 */
Input.isReleased = function(keyName) {
    if (this._isEscapeCompatible(keyName) && this.isReleased("escape")) {
        return true;
    } else {
        return !!this._releasedState[keyName];
    }
};

/**
 * Checks whether a key is just pressed or a key repeat occurred.
 *
 * @param {string} keyName - The mapped name of the key.
 * @returns {boolean} True if the key is repeated.
 */
Input.isRepeated = function(keyName) {
    if (this._isEscapeCompatible(keyName) && this.isRepeated("escape")) {
        return true;
    } else {
        return (
            this._latestButton === keyName &&
            (this._pressedTime === 0 ||
                (this._pressedTime >= this.keyRepeatWait &&
                    this._pressedTime % this.keyRepeatInterval === 0))
        );
    }
};

/**
 * Checks whether a key is kept depressed.
 *
 * @param {string} keyName - The mapped name of the key.
 * @returns {boolean} True if the key is long-pressed.
 */
Input.isLongPressed = function(keyName) {
    if (this._isEscapeCompatible(keyName) && this.isLongPressed("escape")) {
        return true;
    } else {
        return (
            this._latestButton === keyName &&
            this._pressedTime >= this.keyRepeatWait
        );
    }
};

/**
 * The four direction value as a number of the numpad, or 0 for neutral.
 *
 * @readonly
 * @type number
 * @name Input.dir4
 */
Object.defineProperty(Input, "dir4", {
    get: function() {
        return this._dir4;
    },
    configurable: true
});

/**
 * The eight direction value as a number of the numpad, or 0 for neutral.
 *
 * @readonly
 * @type number
 * @name Input.dir8
 */
Object.defineProperty(Input, "dir8", {
    get: function() {
        return this._dir8;
    },
    configurable: true
});

/**
 * The time of the last input in milliseconds.
 *
 * @readonly
 * @type number
 * @name Input.date
 */
Object.defineProperty(Input, "date", {
    get: function() {
        return this._date;
    },
    configurable: true
});

Input.virtualClick = function(buttonName) {
    this._virtualButton = buttonName;
};

Input._setupEventHandlers = function() {
    document.addEventListener("keydown", this._onKeyDown.bind(this));
    document.addEventListener("keyup", this._onKeyUp.bind(this));
    window.addEventListener("blur", this._onLostFocus.bind(this));
};

Input._onKeyDown = function(event) {
    if (this._shouldPreventDefault(event.keyCode)) {
        event.preventDefault();
    }
    if (event.keyCode === 144) {
        // Numlock
        this.clear();
    }
    const buttonName = this.keyMapper[event.keyCode];
    if (buttonName) {
        this._physicalKeyState[event.keyCode] = true;
        this._keyboardState[buttonName] = true;
        this._currentState[buttonName] = true;
    }
};

Input._shouldPreventDefault = function(keyCode) {
    switch (keyCode) {
        case 8: // backspace
        case 9: // tab
        case 33: // pageup
        case 34: // pagedown
        case 37: // left arrow
        case 38: // up arrow
        case 39: // right arrow
        case 40: // down arrow
            return true;
    }
    return false;
};

Input._onKeyUp = function(event) {
    const buttonName = this.keyMapper[event.keyCode];
    if (buttonName) {
        this._physicalKeyState[event.keyCode] = false;
        const keyboardPressed = Object.keys(this.keyMapper).some(keyCode =>
            this.keyMapper[keyCode] === buttonName && this._physicalKeyState[keyCode]);
        this._keyboardState[buttonName] = keyboardPressed;
        this._currentState[buttonName] = keyboardPressed || !!this._gamepadLogicalState[buttonName];
    }
};

Input._onLostFocus = function() {
    this.clear();
};

Input._pollGamepads = function() {
    const connected = [];
    if (navigator.getGamepads) {
        const gamepads = navigator.getGamepads();
        if (gamepads) {
            for (const gamepad of gamepads) {
                if (gamepad && gamepad.connected) {
                    connected[gamepad.index] = true;
                    this._updateGamepadState(gamepad);
                }
            }
        }
    }
    for (let index = 0; index < this._gamepadStates.length; index++) {
        const state = this._gamepadStates[index];
        if (!state || connected[index]) continue;
        this._gamepadStates[index] = [];
    }
    const mappedNames = new Set(Object.values(this.gamepadMapper));
    for (const buttonName of mappedNames) {
        let pressed = false;
        for (const state of this._gamepadStates) {
            if (!state) continue;
            for (let button = 0; button < state.length; button++) {
                if (this.gamepadMapper[button] === buttonName && state[button]) pressed = true;
            }
        }
        if (pressed !== !!this._gamepadLogicalState[buttonName]) {
            this._gamepadLogicalState[buttonName] = pressed;
            this._currentState[buttonName] = pressed || !!this._keyboardState[buttonName];
        }
    }
};

Input._updateGamepadState = function(gamepad) {
    const newState = [];
    const buttons = gamepad.buttons;
    const axes = gamepad.axes;
    const threshold = 0.5;
    newState[12] = false;
    newState[13] = false;
    newState[14] = false;
    newState[15] = false;
    for (let i = 0; i < buttons.length; i++) {
        newState[i] = buttons[i].pressed;
    }
    if (axes[1] < -threshold) {
        newState[12] = true; // up
    } else if (axes[1] > threshold) {
        newState[13] = true; // down
    }
    if (axes[0] < -threshold) {
        newState[14] = true; // left
    } else if (axes[0] > threshold) {
        newState[15] = true; // right
    }
    this._gamepadStates[gamepad.index] = newState;
};

Input._updateDirection = function() {
    let x = this._signX();
    let y = this._signY();
    this._dir8 = this._makeNumpadDirection(x, y);
    if (x !== 0 && y !== 0) {
        if (this._preferredAxis === "x") {
            y = 0;
        } else {
            x = 0;
        }
    } else if (x !== 0) {
        this._preferredAxis = "y";
    } else if (y !== 0) {
        this._preferredAxis = "x";
    }
    this._dir4 = this._makeNumpadDirection(x, y);
};

Input._signX = function() {
    const left = this.isPressed("left") ? 1 : 0;
    const right = this.isPressed("right") ? 1 : 0;
    return right - left;
};

Input._signY = function() {
    const up = this.isPressed("up") ? 1 : 0;
    const down = this.isPressed("down") ? 1 : 0;
    return down - up;
};

Input._makeNumpadDirection = function(x, y) {
    if (x === 0 && y === 0) {
        return 0;
    } else {
        return 5 - y * 3 + x;
    }
};

Input._isEscapeCompatible = function(keyName) {
    return keyName === "cancel" || keyName === "menu";
};

//-----------------------------------------------------------------------------
/**
 * The static class that handles input data from the mouse and touchscreen.
 *
 * @namespace
 */
function TouchInput() {
    throw new Error("This is a static class");
}

/**
 * Initializes the touch system.
 */
TouchInput.initialize = function() {
    this.clear();
    this._setupEventHandlers();
};

/**
 * The wait time of the pseudo key repeat in frames.
 *
 * @type number
 */
TouchInput.keyRepeatWait = 24;

/**
 * The interval of the pseudo key repeat in frames.
 *
 * @type number
 */
TouchInput.keyRepeatInterval = 6;

/**
 * The threshold number of pixels to treat as moved.
 *
 * @type number
 */
TouchInput.moveThreshold = 10;

/**
 * Clears all the touch data.
 */
TouchInput.clear = function() {
    this._mousePressed = false;
    this._mouseButtonStates = [false, false, false];
    this._mouseButtonTimes = [0, 0, 0];
    this._screenPressed = false;
    this._pressedTime = 0;
    this._clicked = false;
    this._newState = this._createNewState();
    this._currentState = this._createNewState();
    this._x = 0;
    this._y = 0;
    this._triggerX = 0;
    this._triggerY = 0;
    this._moved = false;
    this._date = 0;
};

/**
 * Updates the touch data.
 */
TouchInput.update = function() {
    this._currentState = this._newState;
    this._newState = this._createNewState();
    this._clicked = this._currentState.released && !this._moved;
    if (this.isPressed()) {
        this._pressedTime++;
    }
    for (let button = 0; button < this._mouseButtonStates.length; button++) {
        if (this._mouseButtonStates[button]) {
            this._mouseButtonTimes[button]++;
        }
    }
};

/**
 * Checks whether the mouse button or touchscreen has been pressed and
 * released at the same position.
 *
 * @returns {boolean} True if the mouse button or touchscreen is clicked.
 */
TouchInput.isClicked = function() {
    return this._clicked;
};

/**
 * Checks whether the mouse button or touchscreen is currently pressed down.
 *
 * @returns {boolean} True if the mouse button or touchscreen is pressed.
 */
TouchInput.isPressed = function() {
    return this._mousePressed || this._screenPressed;
};

/**
 * Checks whether the left mouse button or touchscreen is just pressed.
 *
 * @returns {boolean} True if the mouse button or touchscreen is triggered.
 */
TouchInput.isTriggered = function() {
    return this._currentState.triggered;
};

/**
 * Checks whether the left mouse button or touchscreen is just pressed
 * or a pseudo key repeat occurred.
 *
 * @returns {boolean} True if the mouse button or touchscreen is repeated.
 */
TouchInput.isRepeated = function() {
    return (
        this.isPressed() &&
        (this._currentState.triggered ||
            (this._pressedTime >= this.keyRepeatWait &&
                this._pressedTime % this.keyRepeatInterval === 0))
    );
};

/**
 * Checks whether the left mouse button or touchscreen is kept depressed.
 *
 * @returns {boolean} True if the left mouse button or touchscreen is long-pressed.
 */
TouchInput.isLongPressed = function() {
    return this.isPressed() && this._pressedTime >= this.keyRepeatWait;
};

/**
 * Checks the independent state of a mouse button.
 *
 * @param {number} button - 0=left, 1=middle, 2=right.
 * @returns {boolean} True if the button is pressed.
 */
TouchInput.isMouseButtonPressed = function(button) {
    return !!this._mouseButtonStates[button];
};

TouchInput.isMouseButtonTriggered = function(button) {
    return !!this._currentState.mouseTriggered[button];
};

TouchInput.isMouseButtonReleased = function(button) {
    return !!this._currentState.mouseReleased[button];
};

TouchInput.isMouseButtonLongPressed = function(button) {
    return this.isMouseButtonPressed(button) &&
        this._mouseButtonTimes[button] >= this.keyRepeatWait;
};

// Short aliases keep script calls readable while retaining explicit API names.
TouchInput.isMousePressed = TouchInput.isMouseButtonPressed;
TouchInput.isMouseTriggered = TouchInput.isMouseButtonTriggered;
TouchInput.isMouseReleased = TouchInput.isMouseButtonReleased;
TouchInput.isMouseLongPressed = TouchInput.isMouseButtonLongPressed;

/**
 * Checks whether the right mouse button is just pressed.
 *
 * @returns {boolean} True if the right mouse button is just pressed.
 */
TouchInput.isCancelled = function() {
    return this._currentState.cancelled;
};

/**
 * Checks whether the mouse or a finger on the touchscreen is moved.
 *
 * @returns {boolean} True if the mouse or a finger on the touchscreen is moved.
 */
TouchInput.isMoved = function() {
    return this._currentState.moved;
};

/**
 * Checks whether the mouse is moved without pressing a button.
 *
 * @returns {boolean} True if the mouse is hovered.
 */
TouchInput.isHovered = function() {
    return this._currentState.hovered;
};

/**
 * Checks whether the left mouse button or touchscreen is released.
 *
 * @returns {boolean} True if the mouse button or touchscreen is released.
 */
TouchInput.isReleased = function() {
    return this._currentState.released;
};

/**
 * The horizontal scroll amount.
 *
 * @readonly
 * @type number
 * @name TouchInput.wheelX
 */
Object.defineProperty(TouchInput, "wheelX", {
    get: function() {
        return this._currentState.wheelX;
    },
    configurable: true
});

/**
 * The vertical scroll amount.
 *
 * @readonly
 * @type number
 * @name TouchInput.wheelY
 */
Object.defineProperty(TouchInput, "wheelY", {
    get: function() {
        return this._currentState.wheelY;
    },
    configurable: true
});

/**
 * The x coordinate on the canvas area of the latest touch event.
 *
 * @readonly
 * @type number
 * @name TouchInput.x
 */
Object.defineProperty(TouchInput, "x", {
    get: function() {
        return this._x;
    },
    configurable: true
});

/**
 * The y coordinate on the canvas area of the latest touch event.
 *
 * @readonly
 * @type number
 * @name TouchInput.y
 */
Object.defineProperty(TouchInput, "y", {
    get: function() {
        return this._y;
    },
    configurable: true
});

/**
 * The time of the last input in milliseconds.
 *
 * @readonly
 * @type number
 * @name TouchInput.date
 */
Object.defineProperty(TouchInput, "date", {
    get: function() {
        return this._date;
    },
    configurable: true
});

TouchInput._createNewState = function() {
    return {
        triggered: false,
        cancelled: false,
        moved: false,
        hovered: false,
        released: false,
        mouseTriggered: [false, false, false],
        mouseReleased: [false, false, false],
        wheelX: 0,
        wheelY: 0
    };
};

TouchInput._setupEventHandlers = function() {
    const pf = { passive: false };
    document.addEventListener("mousedown", this._onMouseDown.bind(this));
    document.addEventListener("mousemove", this._onMouseMove.bind(this));
    document.addEventListener("mouseup", this._onMouseUp.bind(this));
    document.addEventListener("wheel", this._onWheel.bind(this), pf);
    document.addEventListener("touchstart", this._onTouchStart.bind(this), pf);
    document.addEventListener("touchmove", this._onTouchMove.bind(this), pf);
    document.addEventListener("touchend", this._onTouchEnd.bind(this));
    document.addEventListener("touchcancel", this._onTouchCancel.bind(this));
    window.addEventListener("blur", this._onLostFocus.bind(this));
};

TouchInput._onMouseDown = function(event) {
    if (event.button === 0) {
        this._onLeftButtonDown(event);
    } else if (event.button === 1) {
        this._onMiddleButtonDown(event);
    } else if (event.button === 2) {
        this._onRightButtonDown(event);
    }
};

TouchInput._onLeftButtonDown = function(event) {
    const x = Graphics.pageToCanvasX(event.pageX);
    const y = Graphics.pageToCanvasY(event.pageY);
    if (Graphics.isInsideCanvas(x, y)) {
        this._onMouseButtonTrigger(0);
        this._mousePressed = true;
        this._pressedTime = 0;
        this._onTrigger(x, y);
    }
};

TouchInput._onMiddleButtonDown = function(event) {
    const x = Graphics.pageToCanvasX(event.pageX);
    const y = Graphics.pageToCanvasY(event.pageY);
    if (Graphics.isInsideCanvas(x, y)) {
        this._onMouseButtonTrigger(1);
    }
};

TouchInput._onRightButtonDown = function(event) {
    const x = Graphics.pageToCanvasX(event.pageX);
    const y = Graphics.pageToCanvasY(event.pageY);
    if (Graphics.isInsideCanvas(x, y)) {
        this._onMouseButtonTrigger(2);
        this._onCancel(x, y);
    }
};

TouchInput._onMouseMove = function(event) {
    const x = Graphics.pageToCanvasX(event.pageX);
    const y = Graphics.pageToCanvasY(event.pageY);
    if (this._mousePressed) {
        this._onMove(x, y);
    } else if (Graphics.isInsideCanvas(x, y)) {
        this._onHover(x, y);
    }
};

TouchInput._onMouseUp = function(event) {
    if (event.button === 0) {
        const x = Graphics.pageToCanvasX(event.pageX);
        const y = Graphics.pageToCanvasY(event.pageY);
        this._mousePressed = false;
        this._onMouseButtonRelease(0);
        this._onRelease(x, y);
    } else if (event.button === 1 || event.button === 2) {
        this._onMouseButtonRelease(event.button);
    }
};

TouchInput._onMouseButtonTrigger = function(button) {
    if (!this._mouseButtonStates[button]) {
        this._mouseButtonStates[button] = true;
        this._mouseButtonTimes[button] = 0;
        this._newState.mouseTriggered[button] = true;
    }
};

TouchInput._onMouseButtonRelease = function(button) {
    if (this._mouseButtonStates[button]) {
        this._mouseButtonStates[button] = false;
        this._mouseButtonTimes[button] = 0;
        this._newState.mouseReleased[button] = true;
    }
};

TouchInput._onWheel = function(event) {
    this._newState.wheelX += event.deltaX;
    this._newState.wheelY += event.deltaY;
    event.preventDefault();
};

TouchInput._onTouchStart = function(event) {
    for (const touch of event.changedTouches) {
        const x = Graphics.pageToCanvasX(touch.pageX);
        const y = Graphics.pageToCanvasY(touch.pageY);
        if (Graphics.isInsideCanvas(x, y)) {
            this._screenPressed = true;
            this._pressedTime = 0;
            if (event.touches.length >= 2) {
                this._onCancel(x, y);
            } else {
                this._onTrigger(x, y);
            }
            event.preventDefault();
        }
    }
    if (window.cordova || window.navigator.standalone) {
        event.preventDefault();
    }
};

TouchInput._onTouchMove = function(event) {
    for (const touch of event.changedTouches) {
        const x = Graphics.pageToCanvasX(touch.pageX);
        const y = Graphics.pageToCanvasY(touch.pageY);
        this._onMove(x, y);
    }
};

TouchInput._onTouchEnd = function(event) {
    for (const touch of event.changedTouches) {
        const x = Graphics.pageToCanvasX(touch.pageX);
        const y = Graphics.pageToCanvasY(touch.pageY);
        this._screenPressed = false;
        this._onRelease(x, y);
    }
};

TouchInput._onTouchCancel = function(/*event*/) {
    this._screenPressed = false;
};

TouchInput._onLostFocus = function() {
    this.clear();
};

TouchInput._onTrigger = function(x, y) {
    this._newState.triggered = true;
    this._x = x;
    this._y = y;
    this._triggerX = x;
    this._triggerY = y;
    this._moved = false;
    this._date = Date.now();
};

TouchInput._onCancel = function(x, y) {
    this._newState.cancelled = true;
    this._x = x;
    this._y = y;
};

TouchInput._onMove = function(x, y) {
    const dx = Math.abs(x - this._triggerX);
    const dy = Math.abs(y - this._triggerY);
    if (dx > this.moveThreshold || dy > this.moveThreshold) {
        this._moved = true;
    }
    if (this._moved) {
        this._newState.moved = true;
        this._x = x;
        this._y = y;
    }
};

TouchInput._onHover = function(x, y) {
    this._newState.hovered = true;
    this._x = x;
    this._y = y;
};

TouchInput._onRelease = function(x, y) {
    this._newState.released = true;
    this._x = x;
    this._y = y;
};

//-----------------------------------------------------------------------------
/**
 * The static class that handles JSON with object information.
 *
 * @namespace
 */
function JsonEx() {
    throw new Error("This is a static class");
}

/**
 * The maximum depth of objects.
 *
 * @type number
 * @default 100
 */
JsonEx.maxDepth = 100;

/**
 * Converts an object to a JSON string with object information.
 *
 * @param {object} object - The object to be converted.
 * @returns {string} The JSON string.
 */
JsonEx.stringify = function(object) {
    return JSON.stringify(this._encode(object, 0));
};

/**
 * Parses a JSON string and reconstructs the corresponding object.
 *
 * @param {string} json - The JSON string.
 * @returns {object} The reconstructed object.
 */
JsonEx.parse = function(json) {
    return this._decode(JSON.parse(json));
};

/**
 * Makes a deep copy of the specified object.
 *
 * @param {object} object - The object to be copied.
 * @returns {object} The copied object.
 */
JsonEx.makeDeepCopy = function(object) {
    return this.parse(this.stringify(object));
};

JsonEx._encode = function(value, depth) {
    // [Note] The handling code for circular references in certain versions of
    //   MV has been removed because it was too complicated and expensive.
    if (depth >= this.maxDepth) {
        throw new Error("Object too deep");
    }
    const type = Object.prototype.toString.call(value);
    if (type === "[object Object]" || type === "[object Array]") {
        const constructorName = value.constructor.name;
        if (constructorName !== "Object" && constructorName !== "Array") {
            value["@"] = constructorName;
        }
        for (const key of Object.keys(value)) {
            value[key] = this._encode(value[key], depth + 1);
        }
    }
    return value;
};

JsonEx._decode = function(value) {
    const type = Object.prototype.toString.call(value);
    if (type === "[object Object]" || type === "[object Array]") {
        if (value["@"]) {
            const constructor = window[value["@"]];
            if (constructor) {
                Object.setPrototypeOf(value, constructor.prototype);
            }
        }
        for (const key of Object.keys(value)) {
            value[key] = this._decode(value[key]);
        }
    }
    return value;
};

//-----------------------------------------------------------------------------
