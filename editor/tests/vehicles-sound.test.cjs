'use strict';
// The sound of a ride (runtime/reactor_vehicles_feel.js): the engine loop is a buffer of the file's own whose
// playback rate and loudness follow the speed; when it starts and stops; that a rate which has not moved is not
// sent, that a source node the buffer builds later is given the rate at once, and that a buffer on the decoder
// path plays at its one pitch; the punctuation sounds. The audio is a stand-in that records what it is asked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const file = path.join(__dirname, '..', '..', 'runtime', 'reactor_vehicles_feel.js');
const source = fs.readFileSync(file, 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const near = (a, b, by = 1e-9) => Math.abs(a - b) <= by;

const TYPE = () => ({
    id: 1, name: 'Motorcycle', kind: 'motorcycle', handling: { speed: 20 },
    camera: { speedDistance: 35, speedFov: 11, lookAhead: 3, minDistance: 0 },
    sounds: {
        engine: { name: 'drone-01', volume: 90, pitch: 100 }, engineRate: [0.6, 1.5],
        start: { name: 'powerup-01', volume: 90, pitch: 100 }, stop: { name: 'equip-01', volume: 80, pitch: 110 },
        bump: { name: 'hit-01', volume: 90, pitch: 100 }, land: { name: 'hit-02', volume: 90, pitch: 100 },
        scrape: null, skid: null
    }
});

/**
 * The file alone in a context of its own, with a recording audio system: every buffer `AudioManager.createBuffer`
 * makes is kept in `made`, every call to a node's parameter in that parameter's `calls`, every sound effect in
 * `played`. `loaded(buffer)` is the file arriving whole.
 */
function world() {
    const timers = [];
    const ctx = { console, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {} };
    vm.createContext(ctx);
    vm.runInContext(`
        window = globalThis;
        Graphics = { frameCount: 0 };
        audioTime = 0;
        function Param(value) { this.value = value; this.calls = []; }
        Param.prototype.setValueAtTime = function(value, time) { this.calls.push(["set", value, time]); this.value = value; };
        Param.prototype.setTargetAtTime = function(value, time, constant) { this.calls.push(["target", value, time, constant]); this.value = value; };
        function WebAudio(url) {
            this._url = url; this._buffers = []; this._sourceNodes = []; this._isLoaded = false; this._isPlaying = false;
            this._volume = 1; this._pitch = 1; this._gainNode = null; this._fadeGainNode = null; this.log = []; this.decoder = false; this.error = false;
        }
        WebAudio._currentTime = () => audioTime;
        WebAudio.prototype.isReady = function() { return this._buffers.length > 0; };
        WebAudio.prototype.isError = function() { return this.error; };
        WebAudio.prototype.isPlaying = function() { return this._isPlaying; };
        WebAudio.prototype._shouldUseDecoder = function() { return this.decoder; };
        WebAudio.prototype.play = function(loop, offset) {
            this.log.push(["play", loop, offset, this._volume]);
            this._isPlaying = true;
            this._gainNode = { gain: new Param(this._volume) };
            this._fadeGainNode = { gain: new Param(1) };
            this._sourceNodes = this._buffers.map(() => ({ playbackRate: new Param(this._pitch) }));
        };
        WebAudio.prototype.stop = function() { this.log.push(["stop"]); this._isPlaying = false; this._sourceNodes = []; this._gainNode = null; this._fadeGainNode = null; };
        WebAudio.prototype.fadeOut = function(seconds) { this.log.push(["fadeOut", seconds]); this._isPlaying = false; };
        Object.defineProperty(WebAudio.prototype, "pitch", { get() { return this._pitch; }, set(value) { this.log.push(["pitch", value]); this._pitch = value; } });
        Object.defineProperty(WebAudio.prototype, "volume", { get() { return this._volume; }, set(value) { this.log.push(["volume", value]); this._volume = value; } });
        AudioManager = {
            seVolume: 100, made: [], played: [], other: [],
            createBuffer(folder, name) { const buffer = new WebAudio("audio/" + folder + name + ".ogg"); buffer.name = name; buffer.folder = folder; this.made.push(buffer); return buffer; },
            playSe(se) { this.played.push(se); },
            playBgs() { this.other.push("bgs"); }, playBgm() { this.other.push("bgm"); }, stopBgs() { this.other.push("stopBgs"); }, stopBgm() { this.other.push("stopBgm"); }
        };
        $dataReactorVehicles = [null];
        $dataMap = { events: [null] };
        $gameMap = { mapId: () => 5, _events: [] };
        $gamePlayer = { _vehicleType: "walk", _rrDrive: null, _rrMount: null, _rrRide: null, direction: () => 2 };
        calls = { start: 0, terminate: 0 };
        function Scene_Map() {}
        Scene_Map.prototype.start = function() { calls.start++; return "started"; };
        Scene_Map.prototype.terminate = function() { calls.terminate++; return "terminated"; };
        function Scene_Menu() {}
        SceneManager = { _nextScene: null };
    `, ctx);
    vm.runInContext(source, ctx, { filename: 'reactor_vehicles_feel.js' });
    const w = ctx, Feel = w.ReactorVehicles.Feel;
    w.Feel = Feel;
    w.timers = timers;
    w.type = TYPE();
    w.loaded = buffer => { buffer._buffers = [{ duration: 6.7 }]; buffer._isLoaded = true; };
    /** Seated on vehicle event 7 at `v` tiles a second, the engine's file loaded. */
    w.aboard = (v = 0) => {
        w.$gamePlayer._vehicleType = 'reactor';
        w.$gamePlayer._rrRide = { map: 5, id: 7 };
        w.$gamePlayer._rrDrive = { v, yaw: 0 };
        w.$gamePlayer._rrMount = null;
    };
    /** One logic tick: the mover's call, with the input it applied. */
    w.tick = (v, input) => {
        w.Graphics.frameCount++;
        w.audioTime += 1 / 60;
        if (v !== undefined && w.$gamePlayer._rrDrive) w.$gamePlayer._rrDrive.v = v;
        Feel.advance(w.$gamePlayer._rrDrive, w.type, input === undefined ? { gas: 0, brake: 0 } : input);
    };
    /** Aboard, loaded and idling: the buffer. */
    w.idling = () => {
        w.aboard(0);
        w.tick();
        const buffer = w.AudioManager.made[0];
        w.loaded(buffer);
        w.tick();
        return buffer;
    };
    w.rate = buffer => buffer._sourceNodes[0].playbackRate;
    return w;
}

test('the rate goes from the standing rate to the top rate with the share of top speed, a tenth more under throttle', () => {
    const { Feel } = world();
    assert.ok(near(Feel.engineRate(0, 0), 0.6), 'standing');
    assert.ok(near(Feel.engineRate(1, 0), 1.5), 'at top speed');
    assert.ok(near(Feel.engineRate(0.5, 0), 1.05), 'half way');
    assert.ok(near(Feel.engineRate(0, 1), 0.66), 'standing with the throttle held');
    assert.ok(near(Feel.engineRate(1, 1), 1.65), 'top speed with the throttle held');
    assert.ok(near(Feel.engineRate(0.25, 0.5), (0.6 + 0.9 * 0.25) * 1.05), 'a half-pressed trigger adds half of it');
    assert.ok(near(Feel.engineRate(3, 4), 1.65) && near(Feel.engineRate(-1, -1), 0.6), 'held to the range');
    assert.ok(near(Feel.engineRate(0.5, 0, [0.8, 1.6]), 1.2), 'the type\'s own range');
    assert.ok(near(Feel.engineRate(0.5, 0, ['x']), 1.05), 'a range that is no range is the default');
    assert.ok(near(Feel.engineRate(0.5, true), 1.05 * 1.1), 'a key is a whole throttle');
    for (let i = 0; i < 10; i++) assert.ok(Feel.engineRate((i + 1) / 10, 0) > Feel.engineRate(i / 10, 0), 'it only rises with speed');
});

test('the loudness goes from half standing to whole at top speed, times the sound\'s own and the player\'s volume', () => {
    const w = world(), { Feel } = w;
    assert.equal(Feel.engineVolume(0), 0.5);
    assert.equal(Feel.engineVolume(1), 1);
    assert.equal(Feel.engineVolume(0.5), 0.75);
    assert.equal(Feel.engineVolume(7), 1);
    assert.equal(Feel.engineVolume(-7), 0.5);
    const buffer = w.idling();
    assert.ok(near(buffer._gainNode.gain.value, 0.5 * 0.9), 'standing: half of the sound\'s 90');
    for (let i = 0; i < 30; i++) w.tick(20, { gas: 1, brake: 0 });
    assert.ok(near(buffer._gainNode.gain.value, 0.9), 'top speed: the sound\'s 90');
    assert.ok(near(buffer._volume, 0.9), 'and a node the buffer builds later starts from it');
    w.AudioManager.seVolume = 40;
    w.tick(20, { gas: 1, brake: 0 });
    assert.ok(near(buffer._gainNode.gain.value, 0.9 * 0.4), 'the player\'s sound effect volume');
    assert.ok(!buffer.log.some(entry => entry[0] === 'volume'), 'the gain is ramped from this file, never stepped through the stock setter');
});

test('the loop is a buffer of the file\'s own in se/, not the BGS or the BGM, and is not played before it is whole', () => {
    const w = world(), { Feel } = w;
    w.aboard(0);
    w.tick();
    assert.equal(w.AudioManager.made.length, 1, 'one buffer');
    const buffer = w.AudioManager.made[0];
    assert.deepEqual([buffer.folder, buffer.name], ['se/', 'drone-01']);
    for (let i = 0; i < 20; i++) w.tick();
    assert.deepEqual(plain(buffer.log), [], 'nothing is played while it loads');
    assert.equal(Feel.engine.on, false);
    buffer._buffers = [{ duration: 1 }];
    for (let i = 0; i < 5; i++) w.tick();
    assert.deepEqual(plain(buffer.log), [], 'nor on a part of it: the file has not all arrived');
    buffer._buffers = [];
    buffer._isLoaded = true;
    for (let i = 0; i < 5; i++) w.tick();
    assert.deepEqual(plain(buffer.log), [], 'nor when it has all arrived and is not decoded yet');
    buffer._buffers = [{ duration: 6.7 }];
    w.tick();
    assert.equal(buffer.log.length, 1);
    assert.deepEqual(plain(buffer.log[0].slice(0, 3)), ['play', true, 0], 'looped, from its start');
    assert.equal(buffer.log[0][3], 0, 'and silent until its loudness is set on the same tick');
    assert.equal(Feel.engine.on, true);
    for (let i = 0; i < 200; i++) w.tick(i / 10, { gas: 1, brake: 0 });
    assert.equal(w.AudioManager.made.length, 1, 'the one buffer for the whole ride');
    assert.equal(buffer.log.filter(entry => entry[0] === 'play').length, 1, 'started once');
    assert.deepEqual(plain(w.AudioManager.other), [], 'the map\'s BGS and BGM are not touched');
    assert.ok(!buffer.log.some(entry => entry[0] === 'pitch'), 'the stock pitch setter restarts a sound and is never used');
    assert.equal(buffer._pitch, 1);
});

test('a file that failed to load stays silent and is not asked again every tick', () => {
    const w = world();
    w.aboard(0);
    w.tick();
    const buffer = w.AudioManager.made[0];
    buffer.error = true;
    let asked = 0;
    buffer.isReady = () => { asked++; return false; };
    for (let i = 0; i < 50; i++) w.tick();
    assert.equal(asked, 0, 'a failed buffer is not polled');
    assert.equal(w.Feel.engine.on, false);
    assert.equal(w.AudioManager.made.length, 1);
});

test('a type with no engine sound, and a project where the file is missing, play nothing and make no buffer', () => {
    const w = world();
    w.type.sounds.engine = null;
    w.aboard(10);
    for (let i = 0; i < 10; i++) w.tick();
    assert.equal(w.AudioManager.made.length, 0);
    const m = world();
    m.AudioManager.isMissingLocalSe = name => name === 'drone-01';
    m.aboard(10);
    for (let i = 0; i < 10; i++) m.tick();
    assert.equal(m.AudioManager.made.length, 0, 'a missing file is not requested');
    assert.equal(m.Feel.engine.on, false);
});

test('no ramp is sent while the rate is still, and a rate that moved is ramped over a twentieth of a second', () => {
    const w = world(), { Feel } = w;
    const buffer = w.idling(), rate = w.rate(buffer);
    assert.deepEqual(plain(rate.calls.map(call => call[0])), ['set'], 'the new node is given the standing rate at once');
    assert.ok(near(rate.calls[0][1], 0.6));
    const sends = Feel.engine.rates;
    for (let i = 0; i < 300; i++) w.tick(0);
    assert.equal(rate.calls.length, 1, 'standing for five seconds: nothing sent');
    assert.equal(Feel.engine.rates, sends);
    // 0.4% of the standing rate: not sent.
    w.tick(20 * 0.0024 / 0.9);
    assert.equal(rate.calls.length, 1, 'a change under half a percent is not sent');
    // The throttle: a tenth more, at once.
    w.tick(20 * 0.0024 / 0.9, { gas: 1, brake: 0 });
    assert.equal(rate.calls.length, 2);
    const sent = rate.calls[1];
    assert.equal(sent[0], 'target', 'a ramp, not a step');
    assert.ok(near(sent[1], Feel.engineRate(0.0024 / 0.9, 1)), 'to the new rate');
    assert.ok(near(sent[2], w.audioTime), 'from now');
    assert.equal(sent[3], 0.05, 'with a time constant of 0.05 s');
    assert.ok(near(Feel.engine.sent, sent[1]), 'and what was sent is kept for the next compare');
    // Held at one speed with the throttle down: still.
    for (let i = 0; i < 300; i++) w.tick(20 * 0.0024 / 0.9, { gas: 1, brake: 0 });
    assert.equal(rate.calls.length, 2);
    // A run up to top speed sends far fewer ramps than ticks.
    const before = rate.calls.length;
    for (let i = 0; i < 180; i++) w.tick(20 * Math.min(1, i / 170), { gas: 1, brake: 0 });
    const ramps = rate.calls.length - before;
    assert.ok(ramps > 20 && ramps < 180, 'only when it moved more than half a percent: ' + ramps + ' ramps in 180 ticks');
    assert.ok(near(Feel.engine.sent, 1.65, 1.65 * 0.006), 'ending within the step of the top rate with throttle: ' + Feel.engine.sent);
    for (const call of rate.calls.slice(1)) assert.equal(call[0], 'target', 'every later send is a ramp');
});

test('the note rises on the tick the throttle is pressed, and falls back when it is let go', () => {
    const w = world(), { Feel } = w;
    w.idling();
    for (let i = 0; i < 10; i++) w.tick(0);
    const idle = Feel.engine.sent;
    w.tick(0.256, { gas: 1, brake: 0 });
    assert.ok(Feel.engine.sent > idle * 1.09, 'the first tick of W: ' + idle + ' to ' + Feel.engine.sent);
    w.tick(0.256, { gas: 0, brake: 0 });
    assert.ok(Feel.engine.sent < idle * 1.03, 'let go: back to the speed\'s own rate');
    // A mover that hands over no input: the throttle is read from the speed rising.
    w.tick(0.256, null);
    const coasting = Feel.engine.sent;
    w.tick(0.512, null);
    assert.ok(Feel.engine.sent > coasting * 1.09, 'the speed rose this tick: the throttle is held');
    w.tick(0.512, null);
    assert.ok(Feel.engine.sent < coasting * 1.05, 'the speed did not rise: it is not');
    // Nothing of the mover's saved state says "throttle" (the table of saved fields has no such field): a number
    // somebody leaves there is not read.
    w.$gamePlayer._rrDrive.gas = 1;
    w.tick(0.512, null);
    assert.ok(Feel.engine.sent < coasting * 1.05, 'the mover\'s state is read for its speed and its heading only');
    // A throttle past the whole of it is the whole of it.
    w.tick(0.512, { gas: 5, brake: 0 });
    assert.equal(Feel.engine.gas, 1);
    assert.ok(near(Feel.engine.sent, Feel.engineRate(0.512 / 20, 1)), 'five times the throttle is the throttle');
});

test('the loop plays the type\'s own sound: its range of rates, its pitch and its loudness', () => {
    const w = world(), { Feel } = w;
    w.type.sounds.engine = { name: 'drone-01', volume: 60, pitch: 120 };
    w.type.sounds.engineRate = [0.8, 2];
    const buffer = w.idling();
    assert.ok(near(w.rate(buffer).value, 0.8 * 1.2), 'standing: the low end of its own range at its own pitch, ' + w.rate(buffer).value);
    assert.ok(near(buffer._gainNode.gain.value, 0.5 * 0.6), 'half of its own 60');
    for (let i = 0; i < 60; i++) w.tick(20, { gas: 0, brake: 0 });
    assert.ok(near(Feel.engine.sent, 2 * 1.2), 'top speed: the high end, ' + Feel.engine.sent);
    assert.ok(near(buffer._gainNode.gain.value, 0.6));
    assert.ok(!buffer.log.some(entry => entry[0] === 'pitch' || entry[0] === 'volume'), 'and neither through the stock setters');
});

test('the loudness is sent when it moved by a hundredth, not every tick', () => {
    const w = world(), { Feel } = w;
    const buffer = w.idling(), gain = buffer._gainNode.gain;
    assert.deepEqual(plain(gain.calls.map(call => call[0])), ['set'], 'the new node is given the standing loudness at once');
    for (let i = 0; i < 300; i++) w.tick(0);
    assert.equal(gain.calls.length, 1, 'standing for five seconds: nothing sent');
    for (let i = 0; i < 300; i++) w.tick(10, { gas: 1, brake: 0 });
    const steady = gain.calls.length;
    assert.equal(steady, 2, 'one ramp to the new speed\'s loudness, then nothing while the speed holds');
    assert.equal(gain.calls[1][0], 'target', 'a ramp');
    for (let i = 0; i < 180; i++) w.tick(10 + 10 * Math.min(1, i / 170), { gas: 1, brake: 0 });
    const ramps = gain.calls.length - steady;
    assert.ok(ramps > 10 && ramps < 60, 'a run from half to top speed: ' + ramps + ' ramps in 180 ticks');
});

test('another vehicle\'s engine takes over at once, and one with no engine lets the loop fade', () => {
    const w = world(), { Feel } = w;
    const first = w.idling();
    for (let i = 0; i < 10; i++) w.tick(5);
    // The party is put on another vehicle, of a type with another engine sound.
    const other = TYPE();
    other.sounds.engine = { name: 'drone-02', volume: 90, pitch: 100 };
    w.type = other;
    w.$gamePlayer._rrRide = { map: 5, id: 8 };
    w.tick(5);
    assert.equal(first.log[first.log.length - 1][0], 'stop', 'the first loop is cut, not left running');
    const second = w.AudioManager.made[1];
    assert.equal(second.name, 'drone-02');
    w.loaded(second);
    w.tick(5);
    assert.equal(Feel.engine.on, true);
    assert.equal(Feel.engine.buffer, second);
    assert.equal(second.log[second.log.length - 1][0], 'play');
    assert.equal(first.log.filter(entry => entry[0] === 'play').length, 1, 'the first is not started again');
    // And then on one that has no engine sound at all.
    const silent = TYPE();
    silent.sounds.engine = null;
    w.type = silent;
    w.$gamePlayer._rrRide = { map: 5, id: 9 };
    w.tick(5);
    assert.equal(Feel.engine.on, false);
    assert.deepEqual(plain(second.log[second.log.length - 1]), ['fadeOut', 0.25], 'the loop it had fades out');
    // A vehicle whose engine sound is not among the project's files: the loop of the one before does not play on under it.
    const m = world();
    const kept = m.idling();
    m.AudioManager.isMissingLocalSe = name => name === 'drone-03';
    const missing = TYPE();
    missing.sounds.engine = { name: 'drone-03', volume: 90, pitch: 100 };
    m.type = missing;
    m.$gamePlayer._rrRide = { map: 5, id: 8 };
    m.tick(5);
    assert.equal(m.Feel.engine.on, false);
    assert.equal(kept.log[kept.log.length - 1][0], 'stop', 'cut at once');
    assert.equal(m.AudioManager.made.length, 1, 'and the missing file is not asked for');
});

test('Feel.stop() aboard keeps the engine out until "start" is asked or the party is on foot', () => {
    const w = world(), { Feel } = w;
    const buffer = w.idling();
    Feel.stop();
    assert.equal(Feel.engine.on, false);
    assert.equal(buffer.log[buffer.log.length - 1][0], 'stop', 'silent at once');
    const entries = buffer.log.length;
    for (let i = 0; i < 60; i++) w.tick(3);
    assert.equal(Feel.engine.on, false, 'a second later it is still out');
    assert.equal(buffer.log.length, entries, 'and nothing was asked of the buffer: no start on the next tick');
    assert.equal(Feel.engine.held, true);
    assert.equal(Feel.sound('start', w.type), true);
    w.tick(3);
    assert.equal(Feel.engine.on, true, '"start" lets it back');
    // On foot there is nothing to hold: the next ride plays.
    Feel.stop();
    w.$gamePlayer._vehicleType = 'walk';
    w.tick();
    assert.equal(Feel.engine.held, false, 'on foot the hold is over');
    Feel.stop();
    assert.equal(Feel.engine.held, false, 'and stopping on foot holds nothing');
    w.aboard(0);
    w.tick();
    assert.equal(Feel.engine.on, true);
    // Held, then put straight onto another vehicle with no tick on foot between: the new ride plays.
    Feel.sound('stop', w.type);
    w.tick();
    assert.equal(Feel.engine.on, false);
    w.$gamePlayer._rrRide = { map: 5, id: 8 };
    w.tick();
    assert.equal(Feel.engine.on, true, 'a new ride starts unheld');
    // And a reset lets go of it.
    Feel.stop();
    assert.equal(Feel.engine.held, true);
    Feel.reset();
    assert.equal(Feel.engine.held, false);
});

test('a source node the buffer builds later is given the rate at once, with no ramp', () => {
    const w = world(), { Feel } = w;
    const buffer = w.idling();
    for (let i = 0; i < 60; i++) w.tick(10, { gas: 0, brake: 0 });
    const first = w.rate(buffer), sentBefore = first.calls.length;
    // What the buffer does on a partial decode: new nodes, each starting at its own pitch.
    vm.runInContext('rebuild = buffer => { buffer._sourceNodes = [{ playbackRate: new Param(buffer._pitch) }]; }', w);
    w.rebuild(buffer);
    w.tick(10, { gas: 0, brake: 0 });
    const second = w.rate(buffer);
    assert.notEqual(second, first);
    assert.deepEqual(plain(second.calls.map(call => call[0])), ['set'], 'set at once although the rate itself has not moved');
    assert.ok(near(second.calls[0][1], Feel.engineRate(0.5, 0)), 'to the rate of this speed, not the buffer\'s pitch of 1');
    assert.equal(first.calls.length, sentBefore, 'the node that is gone is left alone');
    for (let i = 0; i < 30; i++) w.tick(10, { gas: 0, brake: 0 });
    assert.equal(second.calls.length, 1, 'and then it is still again');
    // The gain node is new after a rebuild too.
    vm.runInContext('regain = buffer => { buffer._gainNode = { gain: new Param(buffer._volume) }; }', w);
    w.regain(buffer);
    w.tick(10, { gas: 0, brake: 0 });
    assert.deepEqual(plain(buffer._gainNode.gain.calls.map(call => call[0])), ['set'], 'a new gain node gets the loudness at once as well');
});

test('on the decoder path, and with more than one source node, the loop plays at its one pitch and only its loudness follows', () => {
    for (const how of ['decoder', 'chunks']) {
        const w = world(), { Feel } = w;
        w.aboard(0);
        w.tick();
        const buffer = w.AudioManager.made[0];
        w.loaded(buffer);
        if (how === 'decoder') buffer.decoder = true;
        else buffer._buffers = [{ duration: 1 }, { duration: 1 }, { duration: 1 }];
        w.tick();
        assert.equal(Feel.engine.on, true, how);
        const before = Feel.engine.rates;
        for (let i = 0; i < 120; i++) w.tick(20 * i / 119, { gas: 1, brake: 0 });
        for (const node of buffer._sourceNodes) assert.deepEqual(plain(node.playbackRate.calls), [], how + ': no rate is sent to any node');
        assert.equal(Feel.engine.rates, before, how);
        assert.ok(near(buffer._gainNode.gain.value, 0.9, 0.9 * 0.011), how + ': the loudness still follows the speed');
        assert.ok(!buffer.log.some(entry => entry[0] === 'pitch'), how);
    }
});

test('it plays from the tick the hop on ends, idles through the hop off, and fades out in a quarter second on foot', () => {
    const w = world(), { Feel } = w;
    w.aboard(0);
    w.$gamePlayer._rrMount = { t: 0, n: 14, on: true };
    w.tick();
    const buffer = w.AudioManager.made[0];
    assert.ok(buffer, 'the buffer is made as the hop begins');
    w.loaded(buffer);
    for (let t = 1; t < 14; t++) { w.$gamePlayer._rrMount.t = t; w.tick(); assert.equal(Feel.engine.on, false, 'tick ' + t + ' of the hop on'); }
    w.$gamePlayer._rrMount.t = 14;
    w.tick();
    assert.equal(Feel.engine.on, true, 'tick 14: seated');
    w.$gamePlayer._rrMount = null;
    for (let i = 0; i < 30; i++) w.tick(5, { gas: 1, brake: 0 });
    // The hop off: still aboard, still idling.
    w.$gamePlayer._rrMount = { t: 0, n: 14, on: false };
    for (let t = 0; t < 14; t++) { w.$gamePlayer._rrMount.t = t; w.tick(0); assert.equal(Feel.engine.on, true, 'tick ' + t + ' of the hop off'); }
    // Tick 14: on foot.
    w.$gamePlayer._vehicleType = 'walk';
    w.$gamePlayer._rrMount = null; w.$gamePlayer._rrRide = null; w.$gamePlayer._rrDrive = null;
    w.tick();
    assert.equal(Feel.engine.on, false);
    assert.deepEqual(plain(buffer.log[buffer.log.length - 1]), ['fadeOut', 0.25], 'faded, not cut');
    assert.equal(w.timers.length, 1, 'and its nodes are let go when the fade is over');
    assert.ok(w.timers[0].ms >= 250 && w.timers[0].ms < 400);
    w.timers[0].fn();
    assert.deepEqual(plain(buffer.log[buffer.log.length - 1]), ['stop']);
    // Boarded again before an older fade's timer fires: that timer stops nothing.
    w.aboard(0);
    w.tick();
    assert.equal(Feel.engine.on, true);
    w.$gamePlayer._vehicleType = 'walk';
    w.tick();
    w.aboard(0);
    w.tick();
    assert.equal(Feel.engine.on, true, 'started again inside the fade');
    const plays = buffer.log.filter(entry => entry[0] === 'play').length;
    w.timers[w.timers.length - 1].fn();
    assert.equal(buffer.log[buffer.log.length - 1][0], 'play', 'the fade\'s timer leaves the new loop playing');
    assert.equal(buffer.log.filter(entry => entry[0] === 'play').length, plays);
});

test('the loop follows the saved state: a save loaded aboard starts it with no call, and somebody else\'s stop is undone', () => {
    const w = world(), { Feel } = w;
    // A game loaded aboard at speed: no "start" was ever asked.
    w.aboard(12);
    w.tick(12);
    const buffer = w.AudioManager.made[0];
    w.loaded(buffer);
    w.tick(12);
    assert.equal(Feel.engine.on, true);
    assert.ok(near(Feel.engine.sent, Feel.engineRate(0.6, 0)), 'at the rate of its speed from the first tick');
    // Every sound stopped by a command: the buffer says it is not playing.
    buffer.stop();
    w.tick(12);
    assert.equal(buffer.log[buffer.log.length - 1][0], 'play', 'started again on the next tick');
    assert.equal(Feel.engine.on, true);
});

test('another scene opening stops the loop, the map coming back starts it; from map to map it plays on', () => {
    const w = world(), { Feel } = w;
    const buffer = w.idling();
    const scene = vm.runInContext('new Scene_Map()', w);
    // The menu.
    w.SceneManager._nextScene = vm.runInContext('new Scene_Menu()', w);
    assert.equal(scene.terminate(), 'terminated', 'the scene\'s own terminate still runs and answers');
    assert.equal(w.calls.terminate, 1);
    assert.equal(Feel.engine.on, false);
    assert.equal(buffer.log[buffer.log.length - 1][0], 'stop', 'stopped with the map, at once');
    // Back on the map: its first tick starts the loop again.
    w.SceneManager._nextScene = null;
    assert.equal(scene.start(), 'started');
    w.tick();
    assert.equal(Feel.engine.on, true);
    assert.equal(buffer.log[buffer.log.length - 1][0], 'play');
    // A transfer on the same map makes a new map scene: the loop is not cut.
    w.SceneManager._nextScene = vm.runInContext('new Scene_Map()', w);
    const entries = buffer.log.length;
    scene.terminate();
    assert.equal(Feel.engine.on, true);
    assert.equal(buffer.log.length, entries, 'nothing asked of the buffer');
    // A transfer to another map puts the party on foot before the new scene starts: no engine there.
    w.$gamePlayer._vehicleType = 'walk';
    scene.start();
    assert.equal(Feel.engine.on, false, 'arrived on foot: silent');
    assert.equal(buffer.log[buffer.log.length - 1][0], 'stop');
});

test('the map scene makes the engine buffer of each vehicle type standing on the map, once, and none on a map with no vehicle', () => {
    const w = world(), { Feel } = w;
    const scene = vm.runInContext('new Scene_Map()', w);
    scene.start();
    assert.equal(w.AudioManager.made.length, 0, 'a project with no vehicle type: nothing');
    w.$dataReactorVehicles = [null, TYPE(), Object.assign(TYPE(), { id: 2, sounds: { engine: { name: 'drone-02', volume: 90, pitch: 100 } } }), Object.assign(TYPE(), { id: 3, sounds: { engine: null } })];
    scene.start();
    assert.equal(w.AudioManager.made.length, 0, 'types, but no vehicle on this map: nothing');
    w.$dataMap.events = [null, { id: 1 }, { id: 2, rrVehicle: { type: 1 } }, null, { id: 4, rrVehicle: { type: 1, yaw: 90 } }, { id: 5, rrVehicle: { type: 2 } }, { id: 6, rrVehicle: { type: 3 } }, { id: 7, rrVehicle: { type: 9 } }];
    scene.start();
    assert.deepEqual(plain(w.AudioManager.made.map(buffer => buffer.folder + buffer.name)), ['se/drone-01', 'se/drone-02'], 'two engine sounds among the four vehicles, made as the map scene starts');
    scene.start();
    assert.equal(Feel.prepare(), 0);
    assert.equal(w.AudioManager.made.length, 2, 'made once: a second map scene makes none');
    // The ride then uses that buffer.
    w.aboard(0);
    w.loaded(w.AudioManager.made[0]);
    w.tick();
    assert.equal(w.AudioManager.made.length, 2);
    assert.equal(Feel.engine.buffer, w.AudioManager.made[0]);
    // A map whose data cannot be read does not stop the map scene.
    const broken = world();
    broken.$dataReactorVehicles = [null, TYPE()];
    Object.defineProperty(broken.$dataMap, 'events', { get() { throw new Error('no events'); } });
    assert.equal(vm.runInContext('new Scene_Map()', broken).start(), 'started', 'the scene starts without the engine');
    // A type is read through ReactorVehicles.type when the world file has it.
    const v = world();
    v.$dataReactorVehicles = [null, { id: 1, kind: 'motorcycle' }];
    v.ReactorVehicles.type = id => (id === 1 ? TYPE() : null);
    v.$dataMap.events = [null, { id: 1, rrVehicle: { type: 1 } }];
    assert.equal(v.Feel.prepare(), 1);
});

test('the punctuation sounds are the type\'s own sound effects, each optional, each with its least gap', () => {
    const w = world(), { Feel } = w;
    w.aboard(10);
    w.tick(10);
    assert.equal(Feel.sound('bump', w.type), true);
    assert.deepEqual(plain(w.AudioManager.played), [{ name: 'hit-01', volume: 90, pitch: 100, pan: 0 }]);
    assert.equal(Feel.sound('bump', w.type), false, 'not twice in one tick');
    for (let i = 0; i < 5; i++) w.tick(10);
    assert.equal(Feel.sound('bump', w.type), false, 'nor within six ticks');
    w.tick(10);
    assert.equal(Feel.sound('bump', w.type), true, 'six ticks on');
    assert.equal(Feel.sound('land', w.type), true, 'another sound has its own gap');
    assert.equal(w.AudioManager.played[2].name, 'hit-02');
    assert.equal(Feel.sound('scrape', w.type), false, 'a sound the type has none of plays nothing');
    assert.equal(Feel.sound('skid', w.type), false);
    assert.equal(Feel.sound('horn', w.type), false, 'nor a name it does not know');
    assert.equal(w.AudioManager.played.length, 3);
    // The type's own loudness and pitch; a name alone gets a volume of 90 and a pitch of 100.
    assert.equal(Feel.sound('stop', w.type), true);
    assert.deepEqual(plain(w.AudioManager.played[3]), { name: 'equip-01', volume: 80, pitch: 110, pan: 0 });
    w.type.sounds.scrape = 'scrape-01';
    assert.equal(Feel.sound('scrape', w.type), true);
    assert.deepEqual(plain(w.AudioManager.played[4]), { name: 'scrape-01', volume: 90, pitch: 100, pan: 0 });
    for (let i = 0; i < 19; i++) w.tick(10);
    assert.equal(Feel.sound('scrape', w.type), false, 'scraping along a wall: at most every 20 ticks');
    w.tick(10);
    assert.equal(Feel.sound('scrape', w.type), true);
    // Without a type handed over it is the ridden vehicle's, the one the tick was given.
    for (let i = 0; i < 10; i++) w.tick(10);
    assert.equal(Feel.sound('land'), true);
    // Landing twice inside six ticks is one thud; a sound's own place between the speakers is kept.
    assert.equal(Feel.sound('land'), false, 'not twice in one tick');
    for (let i = 0; i < 5; i++) w.tick(10);
    assert.equal(Feel.sound('land'), false, 'nor five ticks on');
    w.tick(10);
    w.type.sounds.land = { name: 'hit-02', volume: 90, pitch: 100, pan: -30 };
    assert.equal(Feel.sound('land'), true, 'six ticks on');
    assert.equal(w.AudioManager.played[w.AudioManager.played.length - 1].pan, -30);
    // A sound with takes and a pitch range keeps them for the audio manager.
    w.type.sounds.land = { name: 'hit-02', volume: 70, pitch: 100, variants: ['hit-03'], pitchRandom: { min: 90, max: 110 } };
    for (let i = 0; i < 10; i++) w.tick(10);
    Feel.sound('land', w.type);
    assert.deepEqual(plain(w.AudioManager.played[w.AudioManager.played.length - 1]), { name: 'hit-02', volume: 70, pitch: 100, pan: 0, variants: ['hit-03'], pitchRandom: { min: 90, max: 110 } });
});

test('"stop" fades the loop and keeps it out until the party is on foot or "start" is asked; "start" plays over the loop', () => {
    const w = world(), { Feel } = w;
    const buffer = w.idling();
    // The world file asks for the stop sound while the party still counts as aboard.
    assert.equal(Feel.sound('stop', w.type), true);
    assert.equal(Feel.engine.on, false);
    assert.deepEqual(plain(buffer.log[buffer.log.length - 1]), ['fadeOut', 0.25]);
    for (let i = 0; i < 20; i++) w.tick(0);
    assert.equal(Feel.engine.on, false, 'still aboard for the mover, the loop stays out');
    // On foot, then aboard again: a new ride plays without anybody asking.
    w.$gamePlayer._vehicleType = 'walk';
    w.tick();
    w.aboard(0);
    w.tick();
    assert.equal(Feel.engine.on, true);
    // Held out again, and let back in by "start".
    Feel.sound('stop', w.type);
    w.tick();
    assert.equal(Feel.engine.on, false);
    assert.equal(Feel.sound('start', w.type), true);
    assert.equal(w.AudioManager.played[w.AudioManager.played.length - 1].name, 'powerup-01');
    w.tick();
    assert.equal(Feel.engine.on, true, 'the engine idles under its start sound');
});

test('the skid is the brake pressed above half the top speed: once a press, by the tick\'s own input', () => {
    const w = world(), { Feel } = w;
    w.type.sounds.skid = { name: 'skid-01', volume: 90, pitch: 100 };
    w.idling();
    const skids = () => w.AudioManager.played.filter(se => se.name === 'skid-01').length;
    w.tick(9, { gas: 0, brake: 1 });
    assert.equal(skids(), 0, 'under half speed: none');
    w.tick(15, { gas: 1, brake: 0 });
    w.tick(15, { gas: 0, brake: 1 });
    assert.equal(skids(), 1, 'the tick the brake is pressed at 15 of 20');
    for (let i = 0; i < 40; i++) w.tick(15 - i * 0.1, { gas: 0, brake: 1 });
    assert.equal(skids(), 1, 'held for 40 ticks above half speed: not again');
    for (let i = 0; i < 40; i++) w.tick(18, { gas: 1, brake: 0 });
    w.tick(18, { gas: 0, brake: 1 });
    assert.equal(skids(), 2, 'a new press');
    // Stabbing the brake: at most one skid in half a second.
    for (let i = 0; i < 40; i++) w.tick(18, { gas: 1, brake: 0 });
    w.tick(18, { gas: 0, brake: 1 });
    assert.equal(skids(), 3);
    for (let i = 0; i < 4; i++) { w.tick(18, { gas: 1, brake: 0 }); w.tick(18, { gas: 0, brake: 1 }); }
    assert.equal(skids(), 3, 'four more presses inside thirty ticks: no more skids');
    for (let i = 0; i < 30; i++) w.tick(18, { gas: 1, brake: 0 });
    w.tick(18, { gas: 0, brake: 1 });
    assert.equal(skids(), 4);
    // A mover that hands over no input: no skid is guessed.
    for (let i = 0; i < 40; i++) w.tick(18, null);
    w.tick(10, null);
    assert.equal(skids(), 4);
});

test('with no audio at all, and with nothing but the file loaded, every call is quiet', () => {
    const ctx = { console };
    vm.createContext(ctx);
    vm.runInContext('window = globalThis;', ctx);
    vm.runInContext(source, ctx, { filename: 'reactor_vehicles_feel.js' });
    const Feel = ctx.ReactorVehicles.Feel;
    Feel.advance(null, null, null);
    Feel.advance({ v: 5, yaw: 0 }, TYPE(), { gas: 1, brake: 0 });
    assert.equal(Feel.sound('bump', TYPE()), false);
    Feel.kick(0.08);
    Feel.stop();
    assert.equal(Feel.prepare(), 0);
    Feel.reset();
    // A player aboard and a type, but no AudioManager and no WebAudio.
    vm.runInContext('$gamePlayer = { _vehicleType: "reactor", _rrRide: { map: 1, id: 1 }, _rrDrive: { v: 5, yaw: 0 }, direction: () => 2 };', ctx);
    Feel.advance(ctx.$gamePlayer._rrDrive, TYPE(), { gas: 1, brake: 0 });
    assert.equal(Feel.engine.on, false);
    assert.equal(Feel.sound('start', TYPE()), false);
});

test('loaded a second time, the file wraps nothing twice', () => {
    const w = world();
    const start = w.Scene_Map.prototype.start, terminate = w.Scene_Map.prototype.terminate;
    assert.equal(start.__reactorVehiclesFeel, true);
    assert.equal(terminate.__reactorVehiclesFeel, true);
    vm.runInContext(source, w, { filename: 'reactor_vehicles_feel.js' });
    assert.equal(w.Scene_Map.prototype.start, start, 'the map scene\'s start is wrapped once');
    assert.equal(w.Scene_Map.prototype.terminate, terminate);
    const scene = vm.runInContext('new Scene_Map()', w);
    scene.start();
    scene.terminate();
    assert.deepEqual(plain(w.calls), { start: 1, terminate: 1 });
});

test('the ridden event\'s type is asked for once a ride when the mover hands none over', () => {
    const w = world(), { Feel } = w;
    let asks = 0;
    w.ReactorVehicles.type = id => { asks++; return id === 1 ? w.type : null; };
    w.$gameMap._events[7] = { _rrVehicle: 1, _rrYaw: 0 };
    w.aboard(5);
    for (let i = 0; i < 50; i++) { w.Graphics.frameCount++; Feel.advance(w.$gamePlayer._rrDrive, null, null); }
    assert.equal(asks, 1, 'once in 50 ticks');
    assert.equal(w.AudioManager.made.length, 1, 'and its engine sound is the one made');
    assert.equal(w.AudioManager.made[0].name, 'drone-01');
    // Another ride asks again.
    w.$gamePlayer._rrRide = { map: 5, id: 8 };
    w.$gameMap._events[8] = { _rrVehicle: 1, _rrYaw: 0 };
    for (let i = 0; i < 10; i++) { w.Graphics.frameCount++; Feel.advance(w.$gamePlayer._rrDrive, null, null); }
    assert.equal(asks, 2);
});

test('the file keeps what the world file put on ReactorVehicles, and reads no later file at load time', () => {
    const ctx = { console };
    vm.createContext(ctx);
    vm.runInContext('window = globalThis; ReactorVehicles = { TERMS: { ride: "Ride" }, type: () => null };', ctx);
    vm.runInContext(source, ctx, { filename: 'reactor_vehicles_feel.js' });
    assert.equal(ctx.ReactorVehicles.TERMS.ride, 'Ride');
    assert.equal(typeof ctx.ReactorVehicles.Feel.advance, 'function');
    // A world file that declares its namespace without hanging it on the window is found too.
    const lexical = { console };
    vm.createContext(lexical);
    vm.runInContext('window = globalThis; const ReactorVehicles = { TERMS: {} };', lexical);
    vm.runInContext(source, lexical, { filename: 'reactor_vehicles_feel.js' });
    assert.equal(typeof vm.runInContext('ReactorVehicles.Feel.advance', lexical), 'function');
    assert.ok(!/ReactorVehicles\.Hints|V\.Hints/.test(source), 'nothing of the hints file is read');
});

test('BGS engine states crossfade without replacing map ambience, including reused names and rapid switches',()=>{
    const w=world();w.AudioManager.bgsVolume=40;
    w.type.sounds={engine:null,engineRate:[0.6,1.5],idle:{name:'motor',folder:'bgs',volume:80,pitch:100,pan:50},accelerate:{name:'rev',folder:'bgs',volume:90,pitch:100,pan:0},slowdown:{name:'coast',folder:'bgs',volume:70,pitch:100,pan:0}};
    const ambience={name:'Wind',pos:12};w.AudioManager._currentBgs=ambience;w.AudioManager._bgsBuffer={unchanged:true};
    w.aboard(0);w.tick();assert.deepEqual(plain(w.AudioManager.made.map(b=>b.folder+b.name)),['bgs/motor','bgs/rev','bgs/coast']);
    w.AudioManager.made.forEach(w.loaded);w.tick();const [idle,rev,coast]=w.AudioManager.made;
    assert.equal(w.Feel.engine.buffer,idle);assert.ok(near(idle._volume,0.5*0.8*0.4));assert.equal(idle.pan,0.5);
    w.tick(10,{gas:1,brake:0});assert.equal(w.Feel.engine.buffer,rev);assert.equal(idle.log.at(-1)[0],'fadeOut');
    w.tick(8,{gas:0,brake:1});assert.equal(w.Feel.engine.buffer,coast);
    for(let i=0;i<16;i++)w.tick(0,{gas:0,brake:0});assert.equal(w.Feel.engine.buffer,idle);
    w.timers.forEach(t=>t.fn());assert.equal(idle.isPlaying(),true,'a previous fade cannot stop the restarted idle loop');assert.equal(rev.isPlaying(),false);assert.equal(coast.isPlaying(),false);
    assert.equal(w.AudioManager._currentBgs,ambience);assert.deepEqual(plain(w.AudioManager._bgsBuffer),{unchanged:true});assert.deepEqual(plain(w.AudioManager.other),[]);
    w.$gamePlayer._vehicleType='walk';w.tick();w.timers.forEach(t=>t.fn());assert.equal(idle.isPlaying(),false);
});

test('the same filename in SE and BGS uses separate buffers and the correct volume bus',()=>{
    const w=world(),se=w.idling();
    w.type.sounds.idle={name:'drone-01',folder:'bgs',volume:80,pitch:100};w.AudioManager.bgsVolume=50;w.tick();
    const bgs=w.AudioManager.made.find(b=>b.folder==='bgs/');assert.notEqual(bgs,se);w.loaded(bgs);w.tick();assert.equal(w.Feel.engine.buffer,bgs);assert.ok(near(bgs._volume,0.2));
});

test('optional stock vehicle engine loops use the shared audio driver without changing native movement',()=>{
    const w=world();w.$dataSystem={boat:{reactorVehicle:{sounds:{engine:null,idle:{name:'Boat',folder:'bgs',volume:80,pitch:100},accelerate:{name:'Wake',folder:'bgs',volume:80,pitch:100}}}}};
    w.Reactor3D={Vehicles:{stockTypeOf:r=>r}};w.$gamePlayer._vehicleType='boat';let moving=false;w.$gamePlayer.isMoving=()=>moving;
    w.Feel.advance();w.AudioManager.made.forEach(w.loaded);w.Feel.advance();assert.equal(w.Feel.engine.name,'Boat');
    moving=true;w.Feel.advance();assert.equal(w.Feel.engine.name,'Wake');assert.equal(w.$gamePlayer._vehicleType,'boat');
    w.$gamePlayer._vehicleType='walk';w.Feel.advance();assert.equal(w.Feel.engine.on,false);
});

test('native vehicle BGM None leaves current music alone throughout boarding and dismounting',()=>{
    const code=fs.readFileSync(path.join(__dirname,'../../runtime/reactor_objects_map.js'),'utf8');
    const methods=code.slice(code.indexOf('Game_Vehicle.prototype.getOn ='),code.indexOf('Game_Vehicle.prototype.syncWithPlayer ='));
    const ctx={calls:[],music:'Map'};vm.createContext(ctx);
    vm.runInContext(`function Game_Vehicle(){};Game_Vehicle.prototype.setWalkAnime=Game_Vehicle.prototype.setStepAnime=Game_Vehicle.prototype.resetDirection=function(){};Game_Vehicle.prototype.vehicle=function(){return {bgm:this.bgm};};$gameSystem={saveWalkingBgm(){calls.push('save');this.saved=music;},replayWalkingBgm(){calls.push('replay');music=this.saved;}};AudioManager={playBgm(bgm){calls.push(bgm.name);music=bgm.name;}};`,ctx);
    vm.runInContext(methods,ctx);vm.runInContext(`v=new Game_Vehicle();v.bgm={name:''};v.getOn();music='Event music';v.getOff();`,ctx);
    assert.deepEqual(plain(ctx.calls),[]);assert.equal(ctx.music,'Event music');
    vm.runInContext(`v.bgm={name:'Boat'};v.getOn();v.getOff();`,ctx);
    assert.deepEqual(plain(ctx.calls),['save','Boat','replay']);assert.equal(ctx.music,'Event music');
});

test('native start and stop effects use assigned sounds once without replacing original vehicle hooks',()=>{
    const w=world();w.$dataSystem={boat:{reactorVehicle:{sounds:{start:{name:'Ignition'},stop:{name:'Off'}}}}};
    w.Reactor3D={Vehicles:{stockTypeOf:r=>r}};
    vm.runInContext(`function Game_Vehicle(){this._type='boat';this.calls=[];}Game_Vehicle.prototype.getOn=function(){this.calls.push('on');};Game_Vehicle.prototype.getOff=function(){this.calls.push('off');};`,w);
    vm.runInContext(source,w);const vehicle=vm.runInContext('new Game_Vehicle()',w);vehicle.getOn();vehicle.getOff();
    assert.deepEqual(plain(vehicle.calls),['on','off']);assert.deepEqual(plain(w.AudioManager.played.map(s=>s.name)),['Ignition','Off']);
    const hook=w.Game_Vehicle.prototype.getOn;vm.runInContext(source,w);assert.equal(w.Game_Vehicle.prototype.getOn,hook);
});
