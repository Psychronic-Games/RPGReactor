const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const managers = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_managers.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

/** AudioManager alone, over a WebAudio whose clock and endings the test drives. */
function loadAudioManager({ mapId = 1, map = null, system = null, troop = null } = {}) {
    const start = managers.indexOf('function AudioManager() {');
    const end = managers.indexOf('function SoundManager() {');
    assert.ok(start >= 0 && end > start);
    const clock = { now: 100 };
    const created = [];
    class WebAudio {
        constructor(url) {
            this.url = url;
            this.name = url.replace(/^audio\/bgm\/|\.ogg$/g, '');
            this._stopListeners = [];
            this.playing = false;
            this.destroyed = false;
            // Length and position, so a test can drive a track to its own end.
            this._totalTime = WebAudio.trackSeconds || 0;
            this._startedAt = null;
            this._isPlaying = false;
            this._startTime = 0;
            this._pitch = 1;
            // A loop region shorter than the file, which is what makes seek()
            // wrap early on a tagged track.
            this._loopStartTime = 0;
            this._loopLengthTime = WebAudio.loopSeconds || this._totalTime;
            this.fadedOut = null;
            this.fadedIn = null;
            this.volume = 1;
            created.push(this);
        }
        play(loop) { this.loop = loop; this.playing = true; this._isPlaying = true; this._startedAt = clock.now; this._startTime = clock.now; }
        stop() { this.playing = false; while (this._stopListeners.length) this._stopListeners.shift()(); }
        destroy() { this.destroyed = true; this.stop(); }
        fadeOut(duration) { this.fadedOut = duration; this.playing = false; }
        fadeIn(duration) { this.fadedIn = duration; }
        addStopListener(fn) { this._stopListeners.push(fn); }
        seek() {
            let pos = this._startedAt === null ? 0 : clock.now - this._startedAt;
            if (this._loopLengthTime > 0) while (pos >= this._loopStartTime + this._loopLengthTime) pos -= this._loopLengthTime;
            return pos;
        }
        isError() { return !!this.error; }
        isPlaying() { return this.playing; }
        /** What the end timer does when the track plays out. */
        end() { this.stop(); }
    }
    WebAudio._currentTime = () => clock.now;
    const context = {
        WebAudio, Graphics: { frameCount: 0 }, Utils: { encodeURI: s => s }, console, Math, Number, Object, Array,
        $gameMap: { mapId: () => mapId }, $dataMap: map,
        $dataSystem: system, $gameTroop: { troop: () => troop }
    };
    vm.createContext(context);
    vm.runInContext(managers.slice(start, end) + '\n;this.AudioManager = AudioManager;', context);
    const AudioManager = context.AudioManager;
    AudioManager.throwLoadError = function(buffer) { this.loadErrors = (this.loadErrors || []).concat(buffer.name); };
    const live = () => created.filter(b => !b.destroyed).map(b => b.name);
    const tick = seconds => { clock.now += seconds; AudioManager.updateBgmSequence(); };
    return { AudioManager, clock, created, live, tick, context };
}

const SEQUENCE = {
    enabled: true,
    entries: [
        { type: 'track', name: 'Intro', volume: 80, pitch: 100, pan: 0 },
        { type: 'silence', duration: 10 },
        { type: 'track', name: 'Outro', volume: 60, pitch: 100, pan: 0 }
    ]
};
const MAP = { bgm: { name: 'Fallback', volume: 90, pitch: 100, pan: 0 }, bgmSequence: SEQUENCE };

test('a map with a sequence hands playBgm its fallback track marked with the map', () => {
    const { AudioManager } = loadAudioManager();
    assert.deepEqual(plain(AudioManager.mapBgmObject(MAP, 1)), { name: 'Fallback', volume: 90, pitch: 100, pan: 0, sequence: 1 });
    assert.deepEqual(plain(AudioManager.mapBgmObject({ bgm: { name: 'Plain', volume: 90, pitch: 100, pan: 0 } }, 1)), { name: 'Plain', volume: 90, pitch: 100, pan: 0 });
    assert.equal(AudioManager.mapHasBgmSequence({ bgmSequence: { enabled: false, entries: SEQUENCE.entries } }), false, 'disabled is off');
    assert.equal(AudioManager.mapHasBgmSequence({ bgmSequence: { enabled: true, entries: [] } }), false, 'empty is off');
    assert.equal(AudioManager.mapHasBgmSequence({}), false);
});

test('entries play in order, a track to its true end, a silence by the clock, and the sequence loops', () => {
    const { AudioManager, created, live, tick } = loadAudioManager({ map: MAP });
    AudioManager.playBgm(AudioManager.mapBgmObject(MAP, 1));
    assert.equal(AudioManager._bgmBuffer, null, 'the BGM slot stays empty');
    assert.equal(AudioManager._currentBgm, null);
    assert.deepEqual(live(), ['Intro']);
    assert.equal(created[0].loop, false, 'loop tags are inert inside a sequence');
    assert.equal(created[0].volume, 0.8, 'volume from the entry times the BGM option');
    tick(1000);
    assert.deepEqual(live(), ['Intro'], 'a track is not timed; it ends when it plays out');
    created[0].end();
    assert.equal(created[0].destroyed, true, 'a finished track is released');
    assert.deepEqual(live(), [], 'silence');
    tick(9);
    assert.deepEqual(live(), [], 'still silent');
    tick(1);
    assert.deepEqual(live(), ['Outro']);
    created[1].end();
    assert.deepEqual(live(), ['Intro'], 'back to the start');
});

test('a sequence that is one plain track is the ordinary looping BGM', () => {
    const map = { bgm: { name: 'Fallback', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [{ type: 'track', name: 'Only', volume: 70, pitch: 100, pan: 0 }] } };
    const { AudioManager, created } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    assert.equal(AudioManager._bgmSequence, null);
    assert.ok(AudioManager._bgmBuffer);
    assert.equal(created[0].name, 'Only');
    assert.equal(created[0].loop, true, 'loop tags honoured');
    assert.equal(AudioManager._currentBgm.name, 'Only');
});

test('a palette sounds every layer at once, redraws each on its own, never repeats a pick, fades and moves on', () => {
    const palette = {
        type: 'palette', duration: 60, fadeOut: 5,
        layers: [
            { volume: 90, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'DroneA' }, { type: 'track', name: 'DroneB' }] },
            { volume: 50, pitch: 100, pan: -30, pool: [{ type: 'track', name: 'Perc' }, { type: 'silence', duration: 7 }] }
        ]
    };
    const map = { bgm: { name: 'Fallback', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [palette, { type: 'silence', duration: 3 }] } };
    const { AudioManager, created, live, tick } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    const layerOne = () => AudioManager._bgmSequence.palette.layers[0];
    const layerTwo = () => AudioManager._bgmSequence.palette.layers[1];
    assert.ok(layerOne().buffer, 'layer one started');
    assert.ok(/^Drone[AB]$/.test(layerOne().buffer.name));
    // Ending layer one's track thirty times never plays the same pick twice running.
    let previous = layerOne().buffer.name;
    for (let i = 0; i < 30; i++) {
        layerOne().buffer.end();
        const next = layerOne().buffer.name;
        assert.notEqual(next, previous, 'no immediate repeat');
        previous = next;
    }
    // Layer two: drive it until it draws the silence, then check it comes back on time.
    let guard = 0;
    while (layerTwo().buffer && guard++ < 20) layerTwo().buffer.end();
    assert.equal(layerTwo().buffer, null, 'the silence was drawn');
    assert.ok(layerTwo().silentUntil > 0);
    assert.ok(layerOne().buffer, 'layer one is untouched by layer two going quiet');
    tick(7);
    assert.ok(layerTwo().buffer, 'the silence ended and the layer redrew');
    assert.equal(layerTwo().buffer.name, 'Perc', 'the only other pick');
    // Duration: the palette started at 100 and fades at 160.
    const beforeFade = live().slice();
    tick(60 - 7);
    const state = AudioManager._bgmSequence;
    assert.equal(state.palette.fading, true);
    const fading = created.filter(b => b.fadedOut === 5 && !b.destroyed);
    assert.equal(fading.length, beforeFade.length, 'every live layer fades over the fade-out');
    const count = created.length;
    fading[0].end();
    assert.equal(created.length, count, 'a track ending mid-fade does not start another');
    tick(5);
    assert.equal(state.palette, null, 'the palette is over');
    assert.deepEqual(live(), [], 'its layers are released, and the 3 s silence follows');
    assert.equal(state.index, 1);
    tick(3);
    assert.equal(state.index, 0, 'the sequence loops back to the palette');
    assert.ok(state.palette && state.palette.layers[0].buffer, 'a fresh draw');
});

test('a palette with no duration runs until something else stops it', () => {
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [{ type: 'palette', duration: 0, fadeOut: 2, layers: [{ volume: 90, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'Bed' }] }] }] } };
    const { AudioManager, live, tick } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    tick(100000);
    assert.deepEqual(live(), ['Bed']);
    assert.equal(AudioManager._bgmSequence.palette.fading, false);
});

test('the saved BGM names the sequence, and replaying it waits for the map when the map is not loaded yet', () => {
    const { AudioManager, live, context } = loadAudioManager({ map: MAP });
    AudioManager.playBgm(AudioManager.mapBgmObject(MAP, 1));
    const saved = plain(AudioManager.saveBgm());
    assert.deepEqual(saved, { name: 'Fallback', volume: 90, pitch: 100, pan: 0, pos: 0, sequence: 1 });
    // A save being loaded: the title screen stopped everything, and the
    // title's map is still current.
    AudioManager.stopBgm();
    context.$gameMap = { mapId: () => 7 };
    context.$dataMap = null;
    AudioManager.playBgm(saved);
    assert.equal(AudioManager._bgmSequence, null);
    assert.equal(AudioManager._pendingBgmSequence.mapId, 1, 'and the request waits');
    assert.deepEqual(plain(AudioManager.saveBgm()), saved, 'saving again while waiting keeps the sequence');
    // The map's autoplay repeats the request once the map is up.
    context.$gameMap = { mapId: () => 1 };
    context.$dataMap = MAP;
    AudioManager.playBgm(AudioManager.mapBgmObject(MAP, 1));
    assert.equal(AudioManager._pendingBgmSequence, null);
    assert.deepEqual(live(), ['Intro']);
    // Repeating the request while it runs does not restart it.
    const before = AudioManager._bgmSequence;
    AudioManager.playBgm(AudioManager.mapBgmObject(MAP, 1));
    assert.equal(AudioManager._bgmSequence, before);
});

test('a plain Play BGM, Stop BGM or Fadeout BGM ends the sequence, and nothing restarts from a torn-down track', () => {
    const { AudioManager, created, live, tick } = loadAudioManager({ map: MAP });
    AudioManager.playBgm(AudioManager.mapBgmObject(MAP, 1));
    AudioManager.playBgm({ name: 'Event', volume: 90, pitch: 100, pan: 0 });
    assert.equal(AudioManager._bgmSequence, null);
    assert.deepEqual(live(), ['Event']);
    assert.equal(created[0].destroyed, true);
    assert.equal(AudioManager._currentBgm.name, 'Event');

    AudioManager.playBgm(AudioManager.mapBgmObject(MAP, 1));
    assert.deepEqual(live(), ['Intro']);
    AudioManager.fadeOutBgm(4);
    const intro = created.find(b => b.name === 'Intro' && !b.destroyed);
    assert.equal(intro.fadedOut, 4);
    assert.equal(AudioManager._bgmSequence.stopping, true);
    intro.end();
    assert.deepEqual(live(), ['Intro'], 'a track ending mid-fade starts nothing');
    tick(4);
    assert.equal(AudioManager._bgmSequence, null, 'released once the fade is done');
    assert.deepEqual(live(), []);
    assert.deepEqual(plain(AudioManager.saveBgm()), { name: '', volume: 0, pitch: 0 }, 'nothing to save');

    AudioManager.playBgm(AudioManager.mapBgmObject(MAP, 1));
    AudioManager.stopBgm();
    assert.equal(AudioManager._bgmSequence, null);
    assert.deepEqual(live(), []);
});

test('an ME ducks the whole bed and lets it back up, including a layer that starts during the ME', () => {
    const palette = { type: 'palette', duration: 0, fadeOut: 0, layers: [
        { volume: 100, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'A' }] },
        { volume: 50, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'B' }, { type: 'silence', duration: 1 }] }
    ] };
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [palette] } };
    const { AudioManager, created, tick } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    const a = created.find(b => b.name === 'A');
    assert.equal(a.volume, 1);
    AudioManager.playMe({ name: 'Victory', volume: 90, pitch: 100, pan: 0 });
    assert.equal(a.volume, 0.25, 'ducked');
    // Layer two redraws while the ME plays: it starts ducked.
    const layerTwo = () => AudioManager._bgmSequence.palette.layers[1];
    let guard = 0;
    while (layerTwo().buffer && guard++ < 20) layerTwo().buffer.end();
    tick(1);
    assert.equal(layerTwo().buffer.name, 'B');
    assert.equal(layerTwo().buffer.volume, 0.5 * 0.25);
    AudioManager.stopMe();
    assert.equal(a.volume, 1, 'restored');
    assert.equal(layerTwo().buffer.volume, 0.5);
    AudioManager.bgmVolume = 50;
    assert.equal(a.volume, 0.5, 'the BGM option reaches every layer');
    assert.equal(layerTwo().buffer.volume, 0.25);
});

test('the error sweep sees sequence tracks, and a missing file is reported', () => {
    const { AudioManager, created } = loadAudioManager({ map: MAP });
    AudioManager.playBgm(AudioManager.mapBgmObject(MAP, 1));
    created[0].error = true;
    AudioManager.checkErrors();
    assert.deepEqual(AudioManager.loadErrors, ['Intro']);
});

test('the runtime hooks are in place: the scene tick, map autoplay and the vehicle path', () => {
    const scenes = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_scenes.js'), 'utf8');
    assert.match(scenes, /AudioManager\.checkErrors\(\);\n\s*AudioManager\.updateBgmSequence\(\);/);
    const objects = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
    assert.match(objects, /AudioManager\.playBgm\(AudioManager\.mapBgmObject\(\$dataMap, this\.mapId\(\)\)\)/);
    assert.match(objects, /this\._walkingBgm = AudioManager\.mapBgmObject\(\$dataMap, \$gameMap\.mapId\(\)\)/);
});

test('an entry fades in over its own field, and one without a fade still starts at full volume', () => {
    const map = { bgm: { name: 'Fallback', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'track', name: 'Swell', volume: 80, pitch: 100, pan: 0, fadeIn: 3 },
        { type: 'track', name: 'Blunt', volume: 80, pitch: 100, pan: 0 }
    ] } };
    const { AudioManager, created } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));

    assert.equal(created[0].name, 'Swell');
    assert.equal(created[0].fadedIn, 3, 'the entry fades in over its own field');
    assert.equal(created[0].playing, true, 'the fade is asked for after play, when the fade stage exists');

    created[0].end();
    assert.equal(created[1].name, 'Blunt');
    assert.equal(created[1].fadedIn, null, 'an entry with no fade-in is untouched');
});

test('a palette fades in every layer it starts, including one it redraws later', () => {
    const palette = {
        type: 'palette', duration: 60, fadeIn: 4, fadeOut: 5,
        layers: [
            { volume: 90, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'DroneA' }, { type: 'track', name: 'DroneB' }] },
            { volume: 50, pitch: 100, pan: -30, pool: [{ type: 'track', name: 'Perc' }] }
        ]
    };
    const map = { bgm: { name: 'Fallback', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [palette] } };
    const { AudioManager, created } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));

    assert.equal(created.length, 2);
    assert.deepEqual(created.map(b => b.fadedIn), [4, 4], 'both layers swell in rather than snapping on');

    // A re-draw is a new voice arriving, so it fades in the same way.
    const layerOne = AudioManager._bgmSequence.palette.layers[0];
    layerOne.buffer.end();
    const redrawn = created[created.length - 1];
    assert.notEqual(redrawn, created[0]);
    assert.equal(redrawn.fadedIn, 4, 'a pool re-draw fades in too');
});

test('a palette with no fade-in keeps the abrupt start it has always had', () => {
    const palette = { type: 'palette', duration: 60, fadeOut: 5, layers: [{ volume: 90, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'Bed' }] }] };
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [palette] } };
    const { AudioManager, created } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    assert.equal(created[0].fadedIn, null, 'an absent fade-in changes nothing for sequences authored before it existed');
});

/** A palette that runs `duration`, followed by an entry that may name a fade-in. */
function crossfadeMap(nextFadeIn) {
    const next = { type: 'track', name: 'Next', volume: 80, pitch: 100, pan: 0 };
    if (nextFadeIn) next.fadeIn = nextFadeIn;
    return {
        bgm: { name: 'Fallback', volume: 90, pitch: 100, pan: 0 },
        bgmSequence: { enabled: true, entries: [
            { type: 'palette', duration: 60, fadeOut: 5, layers: [{ volume: 90, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'Bed' }] }] },
            next
        ] }
    };
}

test('a palette hands over while it is still sounding when the next entry fades in', () => {
    const map = crossfadeMap(4);
    const { AudioManager, created, live, tick } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    const bed = created[0];
    assert.equal(bed.name, 'Bed');

    tick(60);
    // The advance happens as the tail starts, not after it: both are audible.
    assert.equal(AudioManager._bgmSequence.index, 1, 'the next entry has already begun');
    assert.deepEqual(live(), ['Bed', 'Next'], 'the outgoing bed is still sounding under the incoming track');
    assert.equal(bed.fadedOut, 5, 'the bed rides its own fade-out down');
    assert.equal(created[1].fadedIn, 4, 'the incoming entry swells in over its own field');
    assert.equal(AudioManager._bgmSequence.palette, null, 'the palette itself is over');

    // The bed is released once its tail is done, not before.
    tick(4);
    assert.deepEqual(live(), ['Bed', 'Next'], 'still fading, so still held');
    tick(1);
    assert.deepEqual(live(), ['Next'], 'the tail finished and the bed was released');
});

test('a next entry with no fade-in keeps the sequential timing it has always had', () => {
    const map = crossfadeMap(0);
    const { AudioManager, live, tick } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));

    tick(60);
    assert.equal(AudioManager._bgmSequence.palette.fading, true, 'the old path: fade first');
    assert.deepEqual(live(), ['Bed'], 'nothing has started over the top of it');
    assert.equal(AudioManager._bgmSequence.index, 0, 'the advance waits for the fade to finish');

    tick(5);
    assert.deepEqual(live(), ['Next'], 'and only then does the next entry begin');
});

test('stopping the sequence releases a bed that is still fading out under the next entry', () => {
    const map = crossfadeMap(4);
    const { AudioManager, live, tick } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    tick(60);
    assert.equal(live().length, 2);

    AudioManager.stopBgm();
    assert.deepEqual(live(), [], 'both the retiring bed and the live entry are released');
    assert.equal(AudioManager._bgmSequence, null);
});

test('a palette handing over to a fresh draw never crossfades a track into itself', () => {
    // One palette, so the entry that follows it is itself: every cycle is a
    // re-draw of the same pool, overlapping the draw it is replacing.
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'palette', duration: 30, fadeIn: 3, fadeOut: 4, layers: [
            { volume: 100, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'A' }, { type: 'track', name: 'B' }] }
        ] }
    ] } };

    for (let run = 0; run < 40; run++) {
        const { AudioManager, tick } = loadAudioManager({ map });
        AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
        const before = AudioManager._bgmSequence.palette.layers[0].buffer.name;
        tick(30);
        const after = AudioManager._bgmSequence.palette.layers[0].buffer.name;
        // The guard has to survive the cycle: rebuilding the layer with last=-1
        // let a layer hand over to the track it was already playing, which an
        // overlap turns into a track phasing against a copy of itself.
        assert.notEqual(after, before, 'run ' + run + ': handed over to its own track');
    }
});

test('a track reaching its end hands over to the next draw, so a pool plays through crossfading', () => {
    // Duration 0: nothing cycles the palette, so the only hand-over is the one
    // a track's own ending causes.
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'palette', duration: 0, fadeIn: 3, fadeOut: 4, layers: [
            { volume: 100, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'A' }, { type: 'track', name: 'B' }] }
        ] }
    ] } };
    const { AudioManager, context, created, live, tick } = loadAudioManager({ map });
    context.WebAudio.trackSeconds = 90;
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    const first = created[0];
    assert.equal(first.fadedIn, 3);

    tick(80);
    assert.deepEqual(live(), [first.name], 'nothing happens while the track has more than its fade left');

    tick(6);   // 86s in: within the 4s fade-out of a 90s track
    assert.equal(created.length, 2, 'the next draw started');
    const second = created[1];
    assert.notEqual(second.name, first.name);
    assert.equal(first.fadedOut, 4, 'the outgoing track rides its fade down');
    assert.equal(second.fadedIn, 3, 'the incoming one swells up under it');
    assert.deepEqual(live().sort(), [first.name, second.name].sort(), 'both sound together');

    tick(4);
    assert.deepEqual(live(), [second.name], 'the outgoing track is released when its tail ends');
});

test('a track shorter than its own crossfade is left alone', () => {
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'palette', duration: 0, fadeIn: 1, fadeOut: 10, layers: [
            { volume: 100, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'Stinger' }, { type: 'track', name: 'Other' }] }
        ] }
    ] } };
    const { AudioManager, context, created, tick } = loadAudioManager({ map });
    context.WebAudio.trackSeconds = 6;
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    tick(5);
    // Handing over would mean never hearing it: it would begin its fade before
    // it began. It plays out and the stop listener draws the next one instead.
    assert.equal(created.length, 1, 'no early hand-over');
    created[0].end();
    assert.equal(created.length, 2, 'the ordinary end-of-track draw still happens');
});

test('a layer set to sequential walks its pool in order instead of drawing at random', () => {
    const pool = [{ type: 'track', name: 'One' }, { type: 'track', name: 'Two' }, { type: 'track', name: 'Three' }];
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'palette', duration: 0, fadeIn: 0, fadeOut: 0, layers: [
            { volume: 100, pitch: 100, pan: 0, order: 'sequential', pool }
        ] }
    ] } };
    const { AudioManager, created } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    const heard = [created[0].name];
    for (let i = 0; i < 6; i++) {
        AudioManager._bgmSequence.palette.layers[0].buffer.end();
        heard.push(AudioManager._bgmSequence.palette.layers[0].buffer.name);
    }
    assert.deepEqual(heard, ['One', 'Two', 'Three', 'One', 'Two', 'Three', 'One']);
});

test('an entry marked once plays on the first pass and is skipped on every later one', () => {
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'track', name: 'Opening', once: true },
        { type: 'silence', duration: 5 },
        { type: 'track', name: 'Bed' }
    ] } };
    const { AudioManager, created, tick } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    assert.equal(created[0].name, 'Opening', 'the opening statement leads');

    created[0].end();                       // -> silence
    tick(5);                                // -> Bed
    assert.equal(created[1].name, 'Bed');
    created[1].end();                       // wraps: Opening must be skipped
    tick(5);
    const names = created.map(b => b.name);
    assert.deepEqual(names, ['Opening', 'Bed', 'Bed'], 'the second pass goes straight back to the bed');
    assert.equal(names.filter(n => n === 'Opening').length, 1, 'the opening is never heard twice');
});

test('a sequence of nothing but once-entries keeps playing rather than falling silent', () => {
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'track', name: 'A', once: true },
        { type: 'track', name: 'B', once: true }
    ] } };
    const { AudioManager, created } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    for (let i = 0; i < 4; i++) created[created.length - 1].end();
    assert.ok(created.length >= 4, 'it keeps finding something to play: ' + created.map(b => b.name).join(','));
});

test('a loop-tagged track still hands over at its end, though seek() would wrap first', () => {
    // LOOPSTART/LOOPLENGTH stay populated even though a sequence plays with
    // looping off, and seek() wraps on them regardless. A track whose loop
    // region is shorter than the file would wrap back to zero and never reach
    // its end, so the hand-over has to read the unwrapped position.
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'palette', duration: 0, fadeIn: 2, fadeOut: 4, layers: [
            { volume: 100, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'Tagged' }, { type: 'track', name: 'Next' }] }
        ] }
    ] } };
    const { AudioManager, context, created, live, tick } = loadAudioManager({ map });
    context.WebAudio.trackSeconds = 90;
    context.WebAudio.loopSeconds = 30;      // a 30s loop region inside a 90s file
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    const first = created[0];
    assert.ok(first.seek() < 30, 'seek wraps inside the loop region, as the engine does');

    tick(86);
    assert.equal(created.length, 2, 'the hand-over fired on the real end, not the wrapped position');
    assert.equal(first.fadedOut, 4);
    assert.deepEqual(live().sort(), [first.name, created[1].name].sort());
    context.WebAudio.loopSeconds = 0;
});

test('a track still loading does not hand over before it has started', () => {
    // play() marks _isPlaying even while the buffer is still decoding, and
    // _startTime is stale until playback really begins; reading it then would
    // make an unheard track hand over immediately.
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'palette', duration: 0, fadeIn: 2, fadeOut: 4, layers: [
            { volume: 100, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'Slow' }, { type: 'track', name: 'Other' }] }
        ] }
    ] } };
    const { AudioManager, context, created, tick } = loadAudioManager({ map });
    context.WebAudio.trackSeconds = 90;
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    created[0]._startTime = 0;              // as it reads before _startPlaying runs
    tick(120);
    assert.equal(created.length, 1, 'nothing handed over while the track had not started');
});

test('an intro survives a battle: the saved BGM remembers the sequence has come round', () => {
    const map = { bgm: { name: 'Fallback', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'track', name: 'Opening', once: true },
        { type: 'track', name: 'Bed' }
    ] } };
    const { AudioManager, created, live } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    assert.equal(created[0].name, 'Opening');

    // Before it has come round, the saved shape is exactly what it always was.
    assert.equal('looped' in AudioManager.saveBgm(), false);

    created[0].end();                       // -> Bed
    created[1].end();                       // wraps past the intro, back to Bed
    const saved = AudioManager.saveBgm();
    assert.equal(saved.looped, true, 'the save records that the intro is spent');
    assert.equal(saved.sequence, 1);

    // A battle takes the channel and hands it back.
    AudioManager.playBgm({ name: 'Battle', volume: 90, pitch: 100, pan: 0 });
    assert.equal(AudioManager._bgmSequence, null, 'battle BGM stops the sequence outright');
    AudioManager.replayBgm(saved);

    assert.deepEqual(live(), ['Bed'], 'it comes back on the bed, not the opening');
    assert.equal(created.filter(b => b.name === 'Opening').length, 1, 'the opening is heard once');
});

test('arriving on the map afresh plays the intro again, because nothing carries the flag', () => {
    const map = { bgm: { name: 'Fallback', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'track', name: 'Opening', once: true },
        { type: 'track', name: 'Bed' }
    ] } };
    const { AudioManager, created } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    created[0].end();
    created[1].end();
    AudioManager.stopBgm();

    // Map autoplay builds its object from the map, which carries no flag once
    // nothing is running -- an intro is an intro on every visit.
    const fresh = AudioManager.mapBgmObject(map, 1);
    assert.equal('looped' in fresh, false);
    AudioManager.playBgm(fresh);
    assert.equal(created[created.length - 1].name, 'Opening', 'the opening leads again');
});

test('boarding a vehicle keeps the flag, since it saves the map BGM through mapBgmObject', () => {
    const map = { bgm: { name: 'Fallback', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'track', name: 'Opening', once: true },
        { type: 'track', name: 'Bed' }
    ] } };
    const { AudioManager, created } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    created[0].end();
    created[1].end();

    const walking = AudioManager.mapBgmObject(map, 1);   // what saveWalkingBgm2 stores
    assert.equal(walking.looped, true, 'the running sequence lends its progress');
    assert.equal(AudioManager.mapBgmObject(map, 2).looped, undefined, 'but only for its own map');
});

test('a shuffled layer plays every track before any of them comes round again', () => {
    const pool = ['A', 'B', 'C', 'D'].map(name => ({ type: 'track', name }));
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'palette', duration: 0, fadeIn: 0, fadeOut: 0, layers: [
            { volume: 100, pitch: 100, pan: 0, order: 'shuffle', pool }
        ] } ] } };
    const { AudioManager } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    const layer = () => AudioManager._bgmSequence.palette.layers[0];

    const heard = [layer().buffer.name];
    for (let i = 0; i < 11; i++) { layer().buffer.end(); heard.push(layer().buffer.name); }
    for (let round = 0; round < 3; round++) {
        const bag = heard.slice(round * 4, round * 4 + 4);
        assert.deepEqual(bag.slice().sort(), ['A', 'B', 'C', 'D'], 'round ' + round + ' held every track once: ' + bag);
    }
    for (let i = 1; i < heard.length; i++) {
        assert.notEqual(heard[i], heard[i - 1], 'never the same track twice running, across bags too');
    }
});

test('a single-shot palette draws one track and then moves on', () => {
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'palette', single: true, once: true, duration: 0, fadeIn: 2, fadeOut: 3, layers: [
            { volume: 100, pitch: 100, pan: 0, order: 'shuffle',
              pool: [{ type: 'track', name: 'IntroA' }, { type: 'track', name: 'IntroB' }] }
        ] },
        { type: 'track', name: 'Bed' }
    ] } };
    const { AudioManager, created, live } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    const chosen = created[0].name;
    assert.ok(/^Intro[AB]$/.test(chosen), 'one of the two intros was drawn: ' + chosen);
    assert.equal(created[0].fadedIn, 2);

    created[0].end();
    assert.deepEqual(live(), ['Bed'], 'it moved on rather than drawing the other intro');
    assert.equal(created.filter(b => /^Intro/.test(b.name)).length, 1, 'exactly one intro was heard');

    // And being an intro, the loop never comes back to it.
    created[1].end();
    assert.equal(created.filter(b => /^Intro/.test(b.name)).length, 1, 'still one after the sequence loops');
});

test('a single-shot palette crossfades into what follows when its track runs out', () => {
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'palette', single: true, duration: 0, fadeIn: 2, fadeOut: 4, layers: [
            { volume: 100, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'Opening' }] }
        ] },
        { type: 'track', name: 'Bed', fadeIn: 3 }
    ] } };
    const { AudioManager, context, created, live, tick } = loadAudioManager({ map });
    context.WebAudio.trackSeconds = 40;
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    tick(36);
    assert.deepEqual(live().sort(), ['Bed', 'Opening'], 'both sound while the opening bows out');
    assert.equal(created[0].fadedOut, 4);
    assert.equal(created[1].fadedIn, 3);
});

test('the overlap decision asks the entry that will actually play, not the one being skipped', () => {
    // Entry 0 is a spent intro with a fade-in; entry 1, the bed, has none. The
    // lookahead must see the bed and keep the sequential timing, rather than
    // read the intro's fade and overlap into an entry that starts at full level.
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'track', name: 'Opening', once: true, fadeIn: 3 },
        { type: 'palette', duration: 30, fadeIn: 0, fadeOut: 5, layers: [
            { volume: 100, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'BedA' }, { type: 'track', name: 'BedB' }] }
        ] }
    ] } };
    const { AudioManager, live, created, tick } = loadAudioManager({ map });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    created[0].end();                       // the opening is spent; the bed starts
    assert.equal(AudioManager._bgmSequence.index, 1);

    tick(30);
    assert.equal(AudioManager._bgmSequence.palette.fading, true, 'it faded rather than overlapping');
    assert.equal(live().length, 1, 'nothing started over the top of the outgoing bed');
});

test('a pool item can be trimmed against the rest of its pool', () => {
    // Tracks mastered at different levels have to be balanced somewhere, and a
    // layer's volume applies to all of them equally.
    const map = { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'palette', duration: 0, fadeIn: 0, fadeOut: 0, layers: [
            { volume: 100, pitch: 100, pan: 0, order: 'sequential', pool: [
                { type: 'track', name: 'Loud', volume: 40 },
                { type: 'track', name: 'Quiet' }
            ] } ] } ] } };
    const { AudioManager, created } = loadAudioManager({ map });
    AudioManager._bgmVolume = 100;
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));

    assert.equal(created[0].name, 'Loud');
    const trimmed = created[0].volume;
    AudioManager._bgmSequence.palette.layers[0].buffer.end();
    assert.equal(created[1].name, 'Quiet');
    assert.ok(Math.abs(created[1].volume - trimmed / 0.4) < 1e-9,
        'the untrimmed one is 2.5x louder: ' + created[1].volume + ' vs ' + trimmed);

    // And the option slider lands on top of the trim, not instead of it. Read
    // the level before moving it: the refresh mutates the very buffer compared.
    const before = created[1].volume;
    AudioManager.bgmVolume = 50;
    const after = AudioManager._bgmSequence.palette.layers[0].buffer.volume;
    assert.ok(Math.abs(after - before / 2) < 1e-9, 'halved the slider, got ' + after + ' from ' + before);
});

/** A System.json carrying a music sequence library. */
const LIBRARY_SYSTEM = () => ({
    battleBgm: { name: 'Battle1', volume: 90, pitch: 100, pan: 0 },
    reactorMusicSequences: [null,
        { id: 1, name: 'Boss', sequence: { enabled: true, entries: [
            { type: 'track', name: 'BossIntro', once: true },
            { type: 'track', name: 'BossLoop' }
        ] } },
        { id: 2, name: 'Field', sequence: { enabled: true, entries: [
            { type: 'track', name: 'FieldA' },
            { type: 'track', name: 'FieldB' }
        ] } }
    ]
});

test('a map naming a library entry plays it under the library key, ahead of a sequence of its own', () => {
    const system = LIBRARY_SYSTEM();
    const map = { bgm: { name: 'Fallback', volume: 90, pitch: 100, pan: 0 }, bgmSequenceId: 2, bgmSequence: SEQUENCE };
    const { AudioManager, live } = loadAudioManager({ map, system });
    const bgm = AudioManager.mapBgmObject(map, 1);
    assert.equal(bgm.sequence, 'library:2');
    AudioManager.playBgm(bgm);
    assert.deepEqual(live(), ['FieldA']);
    assert.deepEqual(plain(AudioManager.saveBgm()), { name: 'Fallback', volume: 90, pitch: 100, pan: 0, pos: 0, sequence: 'library:2' });
    assert.equal(AudioManager.mapBgmObject(Object.assign({}, map, { bgmSequenceId: 9 }), 1).sequence, 1,
        'an id the library does not hold falls back to the map\'s own sequence');
});

test('two maps naming the same entry share it, so a transfer between them does not restart the music', () => {
    const system = LIBRARY_SYSTEM();
    const first = { bgm: { name: 'A', volume: 90, pitch: 100, pan: 0 }, bgmSequenceId: 2 };
    const second = { bgm: { name: 'B', volume: 90, pitch: 100, pan: 0 }, bgmSequenceId: 2 };
    const { AudioManager, created, live, context } = loadAudioManager({ map: first, system });
    AudioManager.playBgm(AudioManager.mapBgmObject(first, 1));
    const running = AudioManager._bgmSequence;
    context.$gameMap = { mapId: () => 2 };
    context.$dataMap = second;
    AudioManager.playBgm(AudioManager.mapBgmObject(second, 2));
    assert.equal(AudioManager._bgmSequence, running, 'the same sequence keeps playing');
    assert.equal(created.length, 1);
    assert.deepEqual(live(), ['FieldA']);
});

test('a one-track library entry shared by two maps leaves its track playing across the transfer', () => {
    const system = { reactorMusicSequences: [null, { id: 1, name: 'Town', sequence: { enabled: true, entries: [
        { type: 'track', name: 'Town', volume: 80, pitch: 100, pan: 0 }
    ] } }] };
    const first = { bgm: { name: 'A' }, bgmSequenceId: 1 };
    const second = { bgm: { name: 'B' }, bgmSequenceId: 1 };
    const { AudioManager, created } = loadAudioManager({ map: first, system });
    AudioManager.playBgm(AudioManager.mapBgmObject(first, 1));
    const buffer = AudioManager._bgmBuffer;
    assert.equal(buffer.name, 'Town');
    assert.equal(buffer.loop, true, 'one plain track is still the looping BGM');
    AudioManager.playBgm(AudioManager.mapBgmObject(second, 2));
    assert.equal(AudioManager._bgmBuffer, buffer, 'not restarted');
    assert.equal(created.length, 1);
});

test('battle music: a troop or a map names a track or a library entry, each in front of the System track', () => {
    const system = LIBRARY_SYSTEM();
    const map = { bgm: { name: 'Field' }, battleBgm: { name: 'MapBattle', volume: 70, pitch: 110, pan: 5 } };
    const troop = { id: 3, battleBgm: { name: '', volume: 90, pitch: 100, pan: 0, sequence: 'library:1' } };
    const { AudioManager, context } = loadAudioManager({ map, system, troop });
    assert.deepEqual(plain(AudioManager.troopBattleBgm()), { name: 'Battle1', volume: 90, pitch: 100, pan: 0, sequence: 'library:1' },
        'a sequence with no track of its own falls back to the System track');
    assert.deepEqual(plain(AudioManager.mapBattleBgm()), { name: 'MapBattle', volume: 70, pitch: 110, pan: 5 }, 'a plain track plays as it is');

    const track = sequence => ({ id: 3, battleBgm: Object.assign({ name: 'Mine', volume: 80, pitch: 100, pan: 0 }, sequence ? { sequence } : {}) });
    context.$gameTroop = { troop: () => track('library:2') };
    assert.deepEqual(plain(AudioManager.troopBattleBgm()), { name: 'Mine', volume: 80, pitch: 100, pan: 0, sequence: 'library:2' },
        'a sequence keeps the track it was given as its fallback');
    context.$gameTroop = { troop: () => track('library:7') };
    assert.deepEqual(plain(AudioManager.troopBattleBgm()), { name: 'Mine', volume: 80, pitch: 100, pan: 0 },
        'an entry the library lacks leaves the track to play');
    context.$gameTroop = { troop: () => ({ id: 3, battleBgm: { name: '', sequence: 'library:7' } }) };
    assert.equal(AudioManager.troopBattleBgm(), null, 'and with no track either, the troop is no answer');
    context.$gameTroop = { troop: () => ({ id: 3 }) };
    assert.equal(AudioManager.troopBattleBgm(), null, 'nor is a troop naming nothing');
    context.$gameTroop = { troop: () => undefined };
    assert.equal(AudioManager.troopBattleBgm(), null, 'nor is a troop that is not set up');
    context.$gameMap = { mapId: () => 0 };
    assert.equal(AudioManager.mapBattleBgm(), null, 'a battle test has no map');
});

test('Game_System.battleBgm asks the troop, then Change Battle BGM, then the map, then System', () => {
    const objects = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
    const source = /Game_System\.prototype\.battleBgm = function\(\) \{[\s\S]*?\n\};/.exec(objects)[0];
    const answers = { troop: null, map: null };
    const context = {
        Game_System: function() {},
        AudioManager: { troopBattleBgm: () => answers.troop, mapBattleBgm: () => answers.map },
        $dataSystem: { battleBgm: { name: 'System' } }
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    const system = Object.create(context.Game_System.prototype);
    const name = () => system.battleBgm().name;
    assert.equal(name(), 'System');
    answers.map = { name: 'Map' };
    assert.equal(name(), 'Map');
    system._battleBgm = { name: 'Event' };
    assert.equal(name(), 'Event', 'Change Battle BGM outranks the map');
    answers.troop = { name: 'Troop' };
    assert.equal(name(), 'Troop', 'and the troop outranks everything');
});

test('a battle sequence takes over from the map sequence, survives the second request, and hands back with the intro spent', () => {
    const system = LIBRARY_SYSTEM();
    const map = { bgm: { name: 'Fallback', volume: 90, pitch: 100, pan: 0 }, bgmSequence: { enabled: true, entries: [
        { type: 'track', name: 'Opening', once: true },
        { type: 'track', name: 'Bed' }
    ] } };
    const { AudioManager, created, live } = loadAudioManager({ map, system });
    AudioManager.playBgm(AudioManager.mapBgmObject(map, 1));
    created[0].end();                            // -> Bed
    created[1].end();                            // the map's intro is spent
    const saved = AudioManager.saveBgm();        // BattleManager.saveBgmAndBgs
    const battle = AudioManager.battleMusicBgm({ sequence: 'library:1' });
    AudioManager.playBgm(battle);                // Scene_Map's encounter effect
    assert.deepEqual(live(), ['BossIntro']);
    const running = AudioManager._bgmSequence;
    AudioManager.playBgm(battle);                // Scene_Battle.start asks again
    assert.equal(AudioManager._bgmSequence, running, 'the second request does not restart the intro');
    AudioManager.replayBgm(saved);               // BattleManager.replayBgmAndBgs
    assert.deepEqual(live(), ['Bed'], 'back on the map bed, its intro not replayed');
});

test('a library key whose entry is gone plays the track it stood in for, and never waits', () => {
    const { AudioManager, created } = loadAudioManager({ system: LIBRARY_SYSTEM() });
    AudioManager.playBgm({ name: 'Battle1', volume: 90, pitch: 100, pan: 0, sequence: 'library:5' });
    assert.equal(AudioManager._bgmSequence, null);
    assert.equal(AudioManager._pendingBgmSequence, null, 'the library is always loaded, so nothing waits');
    assert.equal(created.length, 1);
    assert.equal(AudioManager._bgmBuffer.name, 'Battle1');
});
