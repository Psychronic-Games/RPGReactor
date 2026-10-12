//=============================================================================
// reactor_core_io.js v1.7.0
//=============================================================================
// WebAudio, Video, Input, TouchInput and JsonEx.
// Part of reactor_core.js; loads after reactor_core_display.js.

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

// A gain ramp scheduled over one that is still running does not replace it: the
// Web Audio timeline keeps both, so the param jumps to the older ramp's target,
// waits out its end time, and only then follows the new one. Measured: a
// fade-out arriving 0.5s into a 2s fade-in jumped from 0.25 to full volume, held
// there until the fade-in's end time, and then fell over the 0.5s left of its
// own two seconds. Every ramp below therefore clears the timeline first.

/** Clears pending automation, keeping the level the param is audibly at. */
WebAudio._holdGain = function(gain, currentTime) {
    if (gain.cancelAndHoldAtTime) {
        gain.cancelAndHoldAtTime(currentTime);
    } else {
        // Read before cancelling: cancelScheduledValues drops a running ramp
        // back to its previous event's value, not to where it had reached.
        const held = gain.value;
        gain.cancelScheduledValues(currentTime);
        gain.setValueAtTime(held, currentTime);
    }
};

/** Clears pending automation and forces the param to `value`. */
WebAudio._restartGain = function(gain, value, currentTime) {
    gain.cancelScheduledValues(currentTime);
    gain.setValueAtTime(value, currentTime);
};

WebAudio._fadeIn = function(duration) {
    if (this._masterGainNode) {
        const gain = this._masterGainNode.gain;
        const volume = this._masterVolume;
        const currentTime = this._currentTime();
        // Forced to zero rather than held: a gain node is created at its full
        // volume, so a fade-in that started from the live value would be silent.
        this._restartGain(gain, 0, currentTime);
        gain.linearRampToValueAtTime(volume, currentTime + duration);
    }
};

WebAudio._fadeOut = function(duration) {
    if (this._masterGainNode) {
        const gain = this._masterGainNode.gain;
        const currentTime = this._currentTime();
        this._holdGain(gain, currentTime);
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
    this._fadeGainNode = null;
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
        if (this._fadeGainNode) {
            const gain = this._fadeGainNode.gain;
            const currentTime = WebAudio._currentTime();
            // Forced to zero rather than held: the stage is created open, so a
            // fade-in that started from the live value would not be a fade.
            WebAudio._restartGain(gain, 0, currentTime);
            gain.linearRampToValueAtTime(1, currentTime + duration);
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
    if (this._fadeGainNode) {
        const gain = this._fadeGainNode.gain;
        const currentTime = WebAudio._currentTime();
        // Held, not forced open: a track fading out from partway through a
        // fade-in must continue down from where it is rather than jump to full.
        WebAudio._holdGain(gain, currentTime);
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
                    const pcm = WebAudio._decodePcmWav(arrayBuffer);
                    if (pcm) this._onDecode(pcm);
                    else this._onError();
                }
            });
    }
};

// Chromium's decoder rejects some plain PCM WAV files that older games ship
// (8-bit unsigned in particular). A RIFF/WAVE file whose samples are integer
// PCM (8, 16, 24 or 32 bit) or 32-bit float is read here instead; anything
// else (ADPCM and other compressed WAV) returns null.
WebAudio._decodePcmWav = function(arrayBuffer) {
    try {
        const view = new DataView(arrayBuffer);
        const tag = at => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
        if (view.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
        let format = 0, channels = 0, rate = 0, bits = 0, dataAt = -1, dataSize = 0;
        for (let index = 12; index + 8 <= view.byteLength; ) {
            const id = tag(index), size = view.getUint32(index + 4, true), at = index + 8;
            if (id === "fmt ") {
                format = view.getUint16(at, true);
                channels = view.getUint16(at + 2, true);
                rate = view.getUint32(at + 4, true);
                bits = view.getUint16(at + 14, true);
                if (format === 0xfffe && size >= 26) format = view.getUint16(at + 24, true);
            } else if (id === "data") {
                dataAt = at;
                dataSize = Math.min(size, view.byteLength - at);
                break;
            }
            index = at + size + (size % 2);
        }
        const float = format === 3 && bits === 32;
        if (dataAt < 0 || !channels || !rate || !(float || (format === 1 && [8, 16, 24, 32].includes(bits)))) return null;
        const bytes = bits / 8, frames = Math.floor(dataSize / (bytes * channels));
        if (!frames) return null;
        const buffer = WebAudio._context.createBuffer(channels, frames, rate);
        const read = float ? at => view.getFloat32(at, true)
            : bits === 8 ? at => (view.getUint8(at) - 128) / 128
            : bits === 16 ? at => view.getInt16(at, true) / 32768
            : bits === 24 ? at => (((view.getUint8(at + 2) << 24) | (view.getUint8(at + 1) << 16) | (view.getUint8(at) << 8)) >> 8) / 8388608
            : at => view.getInt32(at, true) / 2147483648;
        for (let c = 0; c < channels; c++) {
            const out = buffer.getChannelData(c);
            for (let i = 0, at = dataAt + c * bytes; i < frames; i++, at += bytes * channels) out[i] = read(at);
        }
        return buffer;
    } catch (e) {
        return null;
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
    // Fades own a stage of their own, upstream of the volume they are heard
    // through. Sharing one node made the two cancel each other: a duck or a
    // volume change during a fade was swallowed whole by the running ramp,
    // and a fade starting during a volume change inherited a stale target.
    // The fade stage carries a plain 0..1 envelope; what it is multiplied by
    // stays entirely in _gainNode, so neither has to know about the other.
    this._fadeGainNode = WebAudio._context.createGain();
    this._fadeGainNode.gain.setValueAtTime(1, currentTime);
    this._fadeGainNode.connect(this._gainNode);
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
    sourceNode.connect(this._fadeGainNode);
    this._sourceNodes[index] = sourceNode;
};

WebAudio.prototype._removeNodes = function() {
    if (this._sourceNodes && this._sourceNodes.length > 0) {
        this._stopSourceNode();
        this._sourceNodes = [];
        this._fadeGainNode = null;
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
