/**
 * RRSequencePreview - hear a BGM sequence in the editor, played by the game's own code.
 *
 * A second player written for the editor would drift from the game the first
 * time either changed, so there is none. The preview runs the runtime's own
 * WebAudio and AudioManager sections -- sliced whole from the project's
 * js/reactor_core.js and js/reactor_managers.js, which is the copy the game
 * plays, or from the editor's runtime/ when the project's copy predates the
 * music library -- in a scope of their own. Only the surroundings are supplied
 * here: the few Utils calls those sections make, answered for files on this
 * machine; file reads through fs, since the editor page cannot request a
 * project file; and a timer standing in for the game's frame loop.
 *
 * One preview plays at a time. Starting another stops the first, and a
 * preview stops by itself once the list that started it leaves the screen.
 */
class RRSequencePreview {
    /** The runtime sections the preview runs: all of WebAudio, and all of AudioManager. */
    static SECTIONS = {
        webAudio: { file: 'reactor_core.js', start: 'function WebAudio() {', end: 'function Video() {' },
        audioManager: { file: 'reactor_managers.js', start: 'function AudioManager() {', end: 'function SoundManager() {' }
    };

    /** Seconds a skipped entry takes to fade out under the next. */
    static SKIP_FADE = 1;

    /** How often the game's per-frame sequence step runs. */
    static TICK_MS = 50;

    static AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.wav', '.flac', '.m4a'];

    static current = null;
    static _engine = null;

    /** One section of a runtime file, from its constructor to the next class's. */
    static slice(text, section) {
        const start = typeof text === 'string' ? text.indexOf(section.start) : -1;
        const end = start >= 0 ? text.indexOf(section.end, start) : -1;
        if (start < 0 || end < 0) throw new Error(`${section.file}: "${section.start}" not found`);
        return text.slice(start, end);
    }

    /**
     * The runtime to play with: the project's own copy when it can play a
     * library sequence, else the editor's. { dir, source } or null.
     */
    static runtimeSources(projectPath) {
        const fs = require('fs');
        const path = require('path');
        const candidates = [];
        if (projectPath) candidates.push(path.join(projectPath, 'js'));
        if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
            candidates.push(path.join(process.cwd(), 'runtime'), path.join(process.cwd(), '..', 'runtime'));
        }
        for (const dir of candidates) {
            let core;
            let managers;
            try {
                core = fs.readFileSync(path.join(dir, 'reactor_core.js'), 'utf8');
                managers = fs.readFileSync(path.join(dir, 'reactor_managers.js'), 'utf8');
            } catch (error) {
                continue;
            }
            // A copy from before the music library cannot play a sequence from a key.
            if (!managers.includes('AudioManager.librarySequenceData')) continue;
            try {
                const source = this.slice(core, this.SECTIONS.webAudio) + '\n' + this.slice(managers, this.SECTIONS.audioManager);
                return { dir, source };
            } catch (error) {
                continue;
            }
        }
        return null;
    }

    /** The Utils calls the two sections make, answered for a project on this machine. */
    static createUtils() {
        const fs = require('fs');
        const url = require('url');
        const extensions = this.AUDIO_EXTENSIONS;
        const exists = href => {
            try {
                return fs.existsSync(url.fileURLToPath(href));
            } catch (error) {
                return false;
            }
        };
        return {
            AUDIO_EXTENSIONS: extensions,
            encodeURI: text => encodeURIComponent(text).replace(/%2F/g, '/'),
            isNwjs: () => true,
            isLocal: () => true,
            isMobileDevice: () => false,
            // The editor reads a project's own audio, never an encrypted build.
            hasEncryptedAudio: () => false,
            decryptArrayBuffer: buffer => buffer,
            canPlayOgg: () => true,
            correctFileCase: () => null,
            resolveFileCase: href => href,
            // Names are stored without an extension and asked for as .ogg; take the file on disk.
            resolveAudioExtension(href) {
                const match = /\.[a-z0-9]+$/i.exec(String(href));
                const ext = match ? match[0].toLowerCase() : '';
                if (!extensions.includes(ext)) return href;
                const stem = href.slice(0, -ext.length);
                return [ext, ...extensions.filter(other => other !== ext)].map(other => stem + other).find(exists) || href;
            }
        };
    }

    /** Runs the sections in a scope of their own: nothing they declare reaches the editor's globals. */
    static buildEngine(source, utils) {
        const factory = new Function('Utils', 'Graphics',
            'let $gameMap = null, $dataMap = null, $dataSystem = null, $gameTroop = null, $dataAnimations = null;\n'
            + source
            + '\n;return { WebAudio: WebAudio, AudioManager: AudioManager, setSystem: function(system) { $dataSystem = system; } };');
        return factory(utils, { frameCount: 0 });
    }

    /** The engine for this project's runtime, built once and kept while that runtime is unchanged. */
    static engineFor(projectPath) {
        const sources = this.runtimeSources(projectPath);
        if (!sources) return null;
        if (this._engine && this._engine.source === sources.source) return this._engine;
        const fs = require('fs');
        const url = require('url');
        const engine = this.buildEngine(sources.source, this.createUtils());
        // The runtime's own XHR contract, with the bytes read from disk.
        engine.WebAudio.prototype._startXhrLoading = function(href) {
            let file;
            try {
                file = url.fileURLToPath(href);
            } catch (error) {
                this._onError();
                return;
            }
            fs.readFile(file, (error, data) => {
                if (error) {
                    this._onError();
                    return;
                }
                const bytes = new Uint8Array(data.length);
                bytes.set(data);
                this._onXhrLoad({ status: 200, response: bytes.buffer });
            });
        };
        engine.WebAudio.initialize();
        if (this._engine) this.closeEngine(this._engine);
        engine.source = sources.source;
        engine.dir = sources.dir;
        this._engine = engine;
        return engine;
    }

    static closeEngine(engine) {
        try {
            engine.AudioManager.stopBgmSequence();
            engine.AudioManager.stopBgm();
        } catch (error) {
            // Nothing left to stop.
        }
        const context = engine.WebAudio && engine.WebAudio._context;
        if (context && typeof context.close === 'function') context.close().catch(() => {});
    }

    static failure(error) {
        return { ok: false, error: 'The preview could not start: {reason}', reason: error && error.message ? error.message : String(error) };
    }

    /**
     * Plays `sequence` for `owner` -- anything with an isShown() -- stopping any
     * preview already playing. `onChange` receives status() whenever it changes,
     * and null once the preview ends. Returns { ok: true }, or { ok: false, error }
     * with an English sentence (and `reason` for its {reason}) for the caller to
     * translate. `engine` and `timers` stand in for the real ones in tests.
     */
    static play({ owner, projectPath, sequence, onChange, engine, timers }) {
        this.stop();
        let player = engine || null;
        if (!player) {
            try {
                player = this.engineFor(projectPath);
            } catch (error) {
                return this.failure(error);
            }
        }
        if (!player) return { ok: false, error: 'The Reactor runtime could not be found.' };
        const AudioManager = player.AudioManager;
        if (typeof window !== 'undefined' && window.reactor && window.reactor.audioPlayer
            && typeof window.reactor.audioPlayer.stopExternal === 'function') {
            window.reactor.audioPlayer.stopExternal();
        }
        const context = player.WebAudio._context;
        if (context && context.state === 'suspended' && typeof context.resume === 'function') context.resume().catch(() => {});
        try {
            if (projectPath) {
                AudioManager._path = require('url').pathToFileURL(require('path').join(projectPath, 'audio')).href + '/';
            }
            // The only entry of a library: the path every library sequence takes in the game.
            player.setSystem({ reactorMusicSequences: [null, { id: 1, name: '', sequence: Object.assign({}, sequence, { enabled: true }) }] });
            AudioManager.stopBgmSequence();
            AudioManager.stopBgm();
            AudioManager.playBgmSequence({ name: '', volume: 90, pitch: 100, pan: 0, sequence: 'library:1' });
        } catch (error) {
            return this.failure(error);
        }
        const clock = timers || { set: (fn, ms) => setInterval(fn, ms), clear: id => clearInterval(id) };
        const current = { owner, engine: player, onChange, clock, last: '' };
        current.timer = clock.set(() => this.tick(), this.TICK_MS);
        this.current = current;
        this.tick();
        return { ok: true };
    }

    /** The game's per-frame sequence step, and the watch that ends a preview whose list is gone. */
    static tick() {
        const current = this.current;
        if (!current) return;
        const owner = current.owner;
        if (owner && typeof owner.isShown === 'function' && !owner.isShown()) {
            this.stop();
            return;
        }
        try {
            current.engine.AudioManager.updateBgmSequence();
        } catch (error) {
            console.error('Sequence preview:', error);
            this.stop();
            return;
        }
        const status = this.status();
        const key = JSON.stringify(status);
        if (key !== current.last) {
            current.last = key;
            if (current.onChange) current.onChange(status);
        }
    }

    /**
     * What is sounding: the entry by position, a track's name, and a palette's
     * draw per layer (null for a layer resting in a silence or between draws).
     */
    static status() {
        const current = this.current;
        if (!current) return null;
        const AudioManager = current.engine.AudioManager;
        const state = AudioManager._bgmSequence;
        if (state) {
            const entry = state.entries[state.index] || {};
            const type = entry.type === 'palette' || entry.type === 'silence' ? entry.type : 'track';
            return {
                index: state.index,
                total: state.entries.length,
                type,
                track: type === 'track' ? (entry.name || '') : null,
                layers: state.palette ? state.palette.layers.map(layer => (layer.buffer ? layer.buffer.name : null)) : null
            };
        }
        // A sequence of one plain track plays as ordinary BGM.
        const bgm = AudioManager._currentBgm;
        if (bgm && bgm.name) return { index: 0, total: 1, type: 'track', track: bgm.name, layers: null };
        return { index: -1, total: 0, type: null, track: null, layers: null };
    }

    static isPlaying(owner) {
        return !!this.current && (!owner || this.current.owner === owner);
    }

    /** Moves on to the next entry now, the current one fading out under it. */
    static skip(owner) {
        const current = this.current;
        if (!current || (owner && current.owner !== owner)) return false;
        const AudioManager = current.engine.AudioManager;
        const state = AudioManager._bgmSequence;
        if (!state || state.stopping) return false;
        for (const buffer of state.buffers.slice()) AudioManager._retireBgmSequenceBuffer(state, buffer, this.SKIP_FADE);
        AudioManager._advanceBgmSequence(this.SKIP_FADE);
        this.tick();
        return true;
    }

    /** Ends the preview -- only `owner`'s, when one is named. */
    static stop(owner) {
        const current = this.current;
        if (!current || (owner && current.owner !== owner)) return false;
        this.current = null;
        current.clock.clear(current.timer);
        try {
            current.engine.AudioManager.stopBgmSequence();
            current.engine.AudioManager.stopBgm();
        } catch (error) {
            // Nothing left to stop.
        }
        if (current.onChange) current.onChange(null);
        return true;
    }
}

if (typeof globalThis !== 'undefined') globalThis.RRSequencePreview = RRSequencePreview;
if (typeof module !== 'undefined' && module.exports) module.exports = RRSequencePreview;
