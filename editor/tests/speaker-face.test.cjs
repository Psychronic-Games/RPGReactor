/**
 * The speaker's face in the message box (runtime/reactor_speaker_face.js, the
 * Show Text dialog's face box, the project's switch): who speaks, which
 * picture, how it reaches the message window, what a command stores.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const runtimeFile = 'runtime/reactor_speaker_face.js';
// In Node the file is the rules alone: no game class exists, so nothing is hooked.
const Rules = require(path.join(repoRoot, runtimeFile));
const Boxes = require(path.join(repoRoot, 'editor/src/utils/MessageBoxes.js'));

//-----------------------------------------------------------------------------
// Who speaks

const WORLD = () => ({
    actors: [{ id: 1, name: 'Fleagus Gustafario' }, { id: 2, name: 'Carol Everson' }, { id: 9, name: 'Rhea Voss' }, { id: 20, name: 'Twin' }, { id: 21, name: 'Twin' }],
    party: [1, 2, 21],
    events: [{ id: 3, name: 'Odda the Grocer' }, { id: 4, name: 'Villager' }, { id: 9, name: 'Villager' }, { id: 12, name: 'Rhea Voss' },
        { id: 16, name: 'Raider' }, { id: 18, name: 'Raider Cutter' }, { id: 30, name: 'Drill' }, { id: 31, name: '' }],
    runningEventId: 3,
    lookup: {
        actorName: n => ({ 1: 'Fleagus Gustafario', 2: 'Carol Everson', 9: 'Rhea Voss' })[n] || '',
        partyMemberName: n => ['Fleagus Gustafario', 'Carol Everson'][n - 1] || '',
        partyMemberId: n => [1, 2][n - 1] || 0,
        currency: 'G'
    }
});

test('an actor speaks by name, by \\N[n] and by \\P[n], before any event of the same name', () => {
    assert.deepEqual(Rules.whoSpeaks('Carol Everson', WORLD()), { kind: 'actor', id: 2, rule: 'actor' });
    assert.deepEqual(Rules.whoSpeaks('  carol everson ', WORLD()), { kind: 'actor', id: 2, rule: 'actor' }, 'case and spaces aside');
    assert.deepEqual(Rules.whoSpeaks('\\N[1]', WORLD()), { kind: 'actor', id: 1, rule: 'code' });
    assert.deepEqual(Rules.whoSpeaks('\\C[4]\\N[9]\\C[0]', WORLD()), { kind: 'actor', id: 9, rule: 'code' }, 'a color round the code changes nothing');
    assert.deepEqual(Rules.whoSpeaks('\\P[2]', WORLD()), { kind: 'actor', id: 2, rule: 'code' });
    // The actor Rhea Voss and the event Rhea Voss: the actor comes first.
    assert.deepEqual(Rules.whoSpeaks('Rhea Voss', WORLD()), { kind: 'actor', id: 9, rule: 'actor' });
    // Two actors of one name: the one in the party.
    assert.deepEqual(Rules.whoSpeaks('Twin', WORLD()), { kind: 'actor', id: 21, rule: 'actor' });
    // A name written around a code is read as the player reads it.
    assert.deepEqual(Rules.whoSpeaks('\\N[2]', Object.assign(WORLD(), { actors: [] })), { kind: 'none', why: 'nobody' }, 'a code for an actor the database does not have names nobody');
});

test('an event speaks by its name, or by the start of it; the one that runs the command first', () => {
    assert.deepEqual(Rules.whoSpeaks('Odda the Grocer', WORLD()), { kind: 'event', id: 3, rule: 'name' });
    assert.deepEqual(Rules.whoSpeaks('Odda', WORLD()), { kind: 'event', id: 3, rule: 'prefix' });
    assert.deepEqual(Rules.whoSpeaks('Rhea', WORLD()), { kind: 'event', id: 12, rule: 'prefix' }, '"Rhea" is the event "Rhea Voss"');
    assert.deepEqual(Rules.whoSpeaks('\\C[2]Rhea\\C[0]', WORLD()), { kind: 'event', id: 12, rule: 'prefix' });
    // The same name before a longer one.
    assert.deepEqual(Rules.whoSpeaks('Raider', WORLD()), { kind: 'event', id: 16, rule: 'name' });
    // Only whole words: "Rai" is not the Raider, "Drill Console" is not the event "Drill".
    assert.deepEqual(Rules.whoSpeaks('Rai', WORLD()), { kind: 'none', why: 'nobody' });
    assert.deepEqual(Rules.whoSpeaks('Drill Console', WORLD()), { kind: 'none', why: 'nobody' });
    // Two Villagers: the one that runs the command; from a third event, both (their pictures decide).
    assert.deepEqual(Rules.whoSpeaks('Villager', Object.assign(WORLD(), { runningEventId: 9 })), { kind: 'event', id: 9, rule: 'name' });
    assert.deepEqual(Rules.whoSpeaks('Villager', WORLD()), { kind: 'events', ids: [4, 9], rule: 'name' });
});

test('no name is the event that runs the command; a name that fits nobody is nobody', () => {
    assert.deepEqual(Rules.whoSpeaks('', WORLD()), { kind: 'event', id: 3, rule: 'running' });
    assert.deepEqual(Rules.whoSpeaks(undefined, WORLD()), { kind: 'event', id: 3, rule: 'running' }, 'an MV command has no fifth parameter');
    assert.deepEqual(Rules.whoSpeaks('\\C[3]\\C[0]', WORLD()), { kind: 'event', id: 3, rule: 'running' }, 'codes that draw nothing are no name');
    assert.deepEqual(Rules.whoSpeaks('', Object.assign(WORLD(), { runningEventId: 0 })), { kind: 'none', why: 'noEvent' }, 'a common event on its own, a battle event');
    // A name spoken inside another character's event is not that character.
    assert.deepEqual(Rules.whoSpeaks('Stranger', WORLD()), { kind: 'none', why: 'nobody' });
});

test('a name from a variable is read through the game, and unknown where there is none', () => {
    const world = WORLD();
    assert.deepEqual(Rules.whoSpeaks('\\V[7]', world), { kind: 'none', why: 'unknown' }, 'the editor has no variables');
    world.lookup.variable = n => (n === 7 ? 'Odda' : n === 9 ? 7 : 0);
    assert.deepEqual(Rules.whoSpeaks('\\V[7]', world), { kind: 'event', id: 3, rule: 'prefix' });
    assert.deepEqual(Rules.whoSpeaks('\\V[\\V[9]]', world), { kind: 'event', id: 3, rule: 'prefix' }, 'a variable chosen by a variable, as the name box reads it');
    assert.deepEqual(Rules.plainName('\\C[4]\\N[1]\\C[0] \\I[5]\\{', world.lookup), { text: 'Fleagus Gustafario', known: true });
    assert.deepEqual(Rules.plainName('Pay 5\\G', world.lookup), { text: 'Pay 5G', known: true });
    assert.deepEqual(Rules.plainName('\\P[1]', {}), { text: '', known: false });
});

test('the format: one project switch, one choice per message, a reserved face name', () => {
    assert.equal(Rules.SYSTEM_FIELD, 'reactorSpeakerFace');
    assert.equal(Rules.COMMAND_FIELD, 'reactorFace');
    assert.equal(Rules.COMMAND_FIELD, Boxes.FACE_FIELD, 'the editor writes the field the game reads');
    const on = { reactorSpeakerFace: true }, command = choice => (choice ? { code: 101, reactorFace: choice } : { code: 101 });
    assert.equal(Rules.isOn({}), false, 'absent is off: no existing game changes by itself');
    assert.equal(Rules.isOn({ reactorSpeakerFace: 1 }), false, 'only true is on');
    assert.equal(Rules.wantsFace(on, command()), true);
    assert.equal(Rules.wantsFace(on, command('none')), false);
    assert.equal(Rules.wantsFace({}, command()), false);
    assert.equal(Rules.wantsFace({}, command('auto')), true, 'a message may ask for it by itself');
    assert.equal(Rules.wantsFace(on, command('portrait')), true, 'a word this version does not know says nothing');
    assert.equal(Rules.isReservedFace(Rules.FACE_PREFIX + 'Hero-1x'), true);
    assert.equal(Rules.isReservedFace('Actor1'), false);
    assert.equal(Rules.isReservedFace(''), false);
});

//-----------------------------------------------------------------------------
// The game: the file over stubs of what it hooks

function loadGame(options = {}) {
    const calls = { command101: [], stockFace: [], stockBitmap: [], setup: 0, mapStart: 0, painted: [], lit: [], destroyed: 0, drawn: 0, exists: [] };
    const frames = [];
    // The map's light as every lit material reads it (options.light): a dusk ambient, lights, the volume, glowing water.
    const light = options.light ? { rrAmbient: { value: new Float32Array([0.25, 0.5, 0.75]) }, rrLightCount: { value: 7 }, rrLightGridEnabled: { value: 1 },
        rrVolumeOn: { value: 1 }, rrDynOn: { value: 1 }, rrWaterFarEdge: { value: 6 }, rrLightPos: { value: new Float32Array(8).fill(3) } } : null;
    const lightNow = () => (light ? [Array.from(light.rrAmbient.value), light.rrLightCount.value, light.rrLightGridEnabled.value, light.rrVolumeOn.value, light.rrDynOn.value, light.rrWaterFarEdge.value] : null);
    class Bitmap {
        constructor(width, height) {
            this.width = width; this.height = height; this.canvas = {}; this.draws = 0;
            this.context = { clearRect: () => {}, drawImage: source => { this.draws++; this.shows = source; calls.drawn++; } };
            this.baseTexture = { update: () => {} };
        }
        isReady() { return true; }
        destroy() { calls.destroyed++; this.canvas = null; }
    }
    // The HUD's portrait maker, as much of it as the speaker's maker stands on: one drawing an update, done after two.
    const base = {
        SIZE: 128, DRAWN: 256, encode: true, WAIT: 24, TRIES: 8, CONTEXT: {}, KEEP: 96, version: 0, entries: new Map(), queue: [], pending: null,
        target: null, targetGeneration: -1, pixels: null, scratch: null, lut: null,
        available() { return options.threeD !== false; },
        keyOf(model) { return model && model.name ? [model.name, model.file || '', model.ext || '', model.variant || '', model.texture || ''].join('|') : ''; },
        get(model) {
            const key = this.keyOf(model);
            if (!key) return false;
            let entry = this.entries.get(key);
            if (!entry) {
                if (!this.available()) return false;
                entry = { key, model, canvas: null, failed: false, scene: null, tries: 0, loading: true };
                this.entries.set(key, entry);
                this.queue.push(entry);
                this.load(entry);
            }
            return entry.failed ? false : entry.canvas;
        },
        load() { throw new Error('the speaker\'s maker loads with its own framing'); },
        fail(entry) { entry.failed = true; entry.loading = false; this.release(entry); this.version++; },
        release(entry) { entry.scene = entry.camera = entry.object = entry.template = null; },
        paint(entry) { calls.painted.push(entry.key); if (light) calls.lit.push(lightNow()); return 0.5; },
        develop() { return 0.5; },
        update() {
            for (const entry of this.queue.slice()) {
                if (entry.failed) { this.queue.splice(this.queue.indexOf(entry), 1); continue; }
                if (entry.loading) continue;
                this.paint(entry);
                entry.tries++;
                if (!entry.canvas) entry.canvas = { portraitOf: entry.key };
                this.version++;
                if (entry.tries >= 2) { this.queue.splice(this.queue.indexOf(entry), 1); this.release(entry); }
                return;
            }
        }
    };
    const stockCommand101 = function(params) { calls.command101.push({ params, own: this._params }); return 'stock'; };
    const stockLoadFace = function(name) { calls.stockFace.push(name); return { stock: name }; };
    const stockLoadBitmap = function(folder, name) { calls.stockBitmap.push(folder + name); return { stock: folder + name }; };
    const message = { busy: false, face: '', isBusy() { return this.busy; }, faceName() { return this.face; }, isRTL: () => false };
    const actorsData = options.actors || [null,
        { id: 1, name: 'Fleagus Gustafario', faceName: 'Actor1', faceIndex: 2 },
        { id: 2, name: 'Dex Marlow', faceName: '', faceIndex: 0 },
        { id: 3, name: 'Nobody Special', faceName: '', faceIndex: 0 }];
    const eventsData = options.events || [
        { id: 3, name: 'Odda the Grocer', sheet: 'People1', index: 5 },
        { id: 5, name: 'Door', sheet: '!Door1', index: 0 },
        { id: 6, name: 'Golem', sheet: '$BigMonster', index: 3 },
        { id: 7, name: 'Console', sheet: '', index: 0 },
        { id: 8, name: 'Sign', sheet: 'People1', index: 1, tile: 12 },
        { id: 12, name: 'Rhea Voss', model: { name: 'Actors/Carol', variant: 'Militia Sniper' }, sheet: 'People2', index: 0 },
        { id: 20, name: 'Raider', model: { name: 'Actors/Jolt', variant: 'Raider' } },
        { id: 21, name: 'Raider', model: { name: 'Actors/Jolt', variant: 'Raider' } },
        { id: 22, name: 'Guard', model: { name: 'Actors/Jolt', variant: 'Guard' } },
        { id: 23, name: 'Guard', model: { name: 'Actors/Fleagus' } },
        { id: 24, name: 'Ghost', model: { name: 'Actors/Missing' } },
        { id: 25, name: 'Captain' },
        { id: 26, name: 'Captain', model: { name: 'Actors/Carol' } },
        { id: 27, name: 'Shade' },
        { id: 28, name: 'Shade' }];
    const gameEvents = [null];
    for (const data of eventsData) {
        gameEvents[data.id] = {
            eventId: () => data.id, event: () => data, characterName: () => data.sheet || '', characterIndex: () => data.index || 0, tileId: () => data.tile || 0
        };
    }
    const context = {
        console: { warn() {}, error() {}, log() {} }, performance: { now: () => 0 }, Promise, Map, Set, WeakSet, Array, Object, Math, String, JSON, Number, parseInt,
        requestAnimationFrame: fn => { frames.push(fn); },
        Bitmap,
        ImageManager: { faceWidth: options.faceSize || 144, faceHeight: options.faceSize || 144, _imageExtensions: ['.png', '.jpg'], loadFace: stockLoadFace, loadBitmap: stockLoadBitmap,
            isObjectCharacter: name => /^[!$]*!/.test(name), isBigCharacter: name => /^[!$]*\$/.test(name) },
        Utils: { isNwjs: () => true, hasEncryptedImages: () => !!options.encrypted, encodeURI: text => text },
        process: { mainModule: { filename: '/game/index.html' } },
        require: name => (name === 'fs'
            ? { existsSync: file => { calls.exists.push(file); return (options.faceFiles || ['/game/img/faces/People1.png', '/game/img/faces/!Door1.png']).includes(file); } }
            : { join: (...parts) => parts.join('/'), dirname: file => file.replace(/\/[^/]*$/, '') }),
        ReactorUI: options.noHud ? {} : { FightPortraits: base },
        Reactor3D: Object.assign(light ? { lightUniforms: () => light } : {}, {
            loadModel: name => Promise.resolve(name === 'Actors/Missing' ? null : { userData: {}, name }),
            loadModelSidecar: () => Promise.resolve(null),
            characterModelSpec: character => (character && character.event ? character.event().model || null : character && character.model || null),
            databaseModelSpec: (section, id) => (section === 'actors' && id === 2 ? { name: 'Actors/Jolt', variant: 'Technician' } : null),
            actorSlotSpec: () => null,
            isDatabaseSidecarReady: () => true
        }),
        THREE: {},
        TextManager: { currencyUnit: 'G' },
        Game_Message: function() {},
        Game_Interpreter: { prototype: { command101: stockCommand101, setup(list, eventId) { calls.setup++; this._list = list; this._eventId = eventId || 0; this._index = 0; }, isOnCurrentMap: () => true } },
        Scene_Boot: { prototype: { start() { calls.booted = true; return 'booted'; } } },
        Scene_Map: { prototype: { start() { calls.mapStart++; } } },
        SceneManager: { _scene: null },
        $dataSystem: options.system || {},
        $dataActors: actorsData,
        $dataMap: { events: [] },
        $gameActors: { _data: [] },
        $gameParty: { members: () => [{ actorId: () => 1, name: () => 'Fleagus Gustafario' }], allMembers: () => [{ actorId: () => 1 }], leader: () => ({ actorId: () => 1 }) },
        $gamePlayer: { followers: () => ({ _data: [] }) },
        $gameMap: { _events: gameEvents, event: id => gameEvents[id] || null },
        $gameVariables: { value: () => 0 },
        $gameSystem: {},
        $gameMessage: message
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read(runtimeFile), context, { filename: 'reactor_speaker_face.js' });
    const S = context.ReactorSpeakerFace;
    // A stand-in scene: the real one needs three.js.
    S.buildScene = () => ({ scene: {}, camera: {}, object: {}, head: true });
    /** A Show Text run through the interpreter as the game runs it. */
    const say = (parameters, extra, eventId = 0) => {
        const interpreter = Object.create(context.Game_Interpreter.prototype);
        const command = Object.assign({ code: 101, indent: 0, parameters }, extra || {});
        interpreter._list = [command];
        interpreter._index = 0;
        interpreter._eventId = eventId;
        interpreter._params = parameters;
        const result = interpreter.command101(parameters);
        const last = calls.command101[calls.command101.length - 1];
        return { result, given: last && last.params, command, interpreter };
    };
    /** Animation frames, with the promises between them settled. */
    const run = async (count = 1) => {
        for (let i = 0; i < count; i++) {
            await new Promise(resolve => setImmediate(resolve));
            const due = frames.splice(0);
            for (const fn of due) fn();
        }
        await new Promise(resolve => setImmediate(resolve));
    };
    return { context, S, calls, say, run, message, frames, base, light, lightNow, stockLoadFace, stockLoadBitmap, stockCommand101, Bitmap };
}

test('with the switch off a Show Text is the stock command: nothing here is called, nothing is wrapped but the command', () => {
    const game = loadGame({ system: {} });
    const { S, context } = game;
    assert.equal(context.Scene_Boot.prototype.start.call({}), 'booted', 'the hooks go on at boot, outside what plugins did');
    let asked = 0;
    for (const name of ['faceFor', 'whoSpeaks', 'pictureOf', 'modelFace', 'prewarmList', 'prewarmMap', 'hasFaceFile']) {
        const real = S[name];
        S[name] = function() { asked++; return real.apply(this, arguments); };
    }
    const parameters = ['', 0, 0, 2, 'Fleagus Gustafario'];
    const said = game.say(parameters, null, 3);
    assert.equal(said.result, 'stock');
    assert.equal(said.given, parameters, 'the very parameters, not a copy');
    // An event starting and a map starting look at nothing either.
    const interpreter = Object.create(context.Game_Interpreter.prototype);
    interpreter.setup([{ code: 101, indent: 0, parameters }], 3);
    context.Scene_Map.prototype.start.call({});
    assert.equal(asked, 0, 'no rule, no picture, no preload was asked for');
    assert.equal(context.ImageManager.loadFace, game.stockLoadFace, 'the image loaders are untouched');
    assert.equal(context.ImageManager.loadBitmap, game.stockLoadBitmap);
    assert.equal(S.cached(), 0);
    assert.equal(game.frames.length, 0, 'no loop was started');
});

test('the hooks keep the marks left on what they wrap, and go on once', () => {
    const game = loadGame({ system: {} });
    const proto = game.context.Game_Interpreter.prototype;
    // The MV layer marks a message command it has taught to step by itself; a hidden mark would have it taught twice.
    proto.command101.__mvStepsItself = true;
    game.S.install();
    const hooked = proto.command101, setup = proto.setup, start = game.context.Scene_Map.prototype.start;
    assert.notEqual(hooked, game.stockCommand101);
    assert.equal(hooked.__mvStepsItself, true);
    game.S.install();
    assert.equal(proto.command101, hooked, 'a second install adds nothing');
    assert.equal(proto.setup, setup);
    assert.equal(game.context.Scene_Map.prototype.start, start);
    delete game.stockCommand101.__mvStepsItself;
});

test('with the switch on the speaker\'s face rides the stock command as an ordinary face', () => {
    const game = loadGame({ system: { reactorSpeakerFace: true } });
    const { S, context } = game;
    S.install();
    const parameters = ['', 0, 1, 0, 'Fleagus Gustafario'];
    const said = game.say(parameters, null, 3);
    assert.equal(said.result, 'stock', 'the stock command\'s own answer comes back');
    assert.deepEqual(Array.from(said.given), ['Actor1', 2, 1, 0, 'Fleagus Gustafario'], 'the actor\'s face picture and index, the rest as written');
    assert.deepEqual(parameters, ['', 0, 1, 0, 'Fleagus Gustafario'], 'the command\'s own parameters are never written');
    assert.equal(said.interpreter._params, parameters, 'the interpreter holds its own parameters again');
    assert.equal(game.calls.command101[0].own, said.given, 'a command that reads them from the interpreter found the same face');
    assert.equal(S.last.who, 'actor 1');
    assert.equal(context.ImageManager.loadFace, game.stockLoadFace, 'a face file needs nothing served');
    // By code, and a sixth parameter a plugin added rides along.
    assert.deepEqual(Array.from(game.say(['', 0, 0, 2, '\\N[1]', { plugin: 1 }]).given), ['Actor1', 2, 0, 2, '\\N[1]', { plugin: 1 }]);
    // An MV command has four parameters and passes none: the running event speaks.
    const mv = Object.create(context.Game_Interpreter.prototype);
    Object.assign(mv, { _list: [{ code: 101, indent: 0, parameters: ['', 0, 0, 2] }], _index: 0, _eventId: 3, _params: ['', 0, 0, 2] });
    mv.command101();
    assert.deepEqual(Array.from(game.calls.command101[game.calls.command101.length - 1].params), ['People1', 5, 0, 2], 'no name: the event that runs the command, by its sheet\'s face file');
});

test('a picture, a message still up, None and an imported game\'s own face leave the stock command alone', () => {
    const game = loadGame({ system: { reactorSpeakerFace: true } });
    const { S, context } = game;
    S.install();
    let asked = 0;
    const faceFor = S.faceFor;
    S.faceFor = function() { asked++; return faceFor.apply(this, arguments); };
    const picture = ['Carol-01', 3, 0, 2, 'Fleagus Gustafario'];
    assert.equal(game.say(picture).given, picture, 'a picture chosen by hand');
    const none = ['', 0, 0, 2, 'Fleagus Gustafario'];
    assert.equal(game.say(none, { reactorFace: 'none' }).given, none, 'this message says None');
    game.message.busy = true;
    for (let frame = 0; frame < 5; frame++) assert.equal(game.say(none).given, none, 'asked again every frame while a message is up');
    game.message.busy = false;
    context.$gameSystem._rrMessage = { faceName: 'Old', faceIndex: 1, background: 0, position: 2 };
    assert.equal(game.say(none).given, none, 'a 2000/2003 import sets its face on the system');
    assert.equal(asked, 0, 'none of them looked for a speaker');
    delete context.$gameSystem._rrMessage;
    assert.deepEqual(Array.from(game.say(none).given).slice(0, 2), ['Actor1', 2]);
    assert.equal(asked, 1);
});

test('a message may ask for the speaker\'s face by itself, with the project\'s switch off', () => {
    const game = loadGame({ system: {} });
    game.S.install();
    const parameters = ['', 0, 0, 2, 'Fleagus Gustafario'];
    assert.deepEqual(Array.from(game.say(parameters, { reactorFace: 'auto' }).given).slice(0, 2), ['Actor1', 2]);
    assert.equal(game.say(parameters).given, parameters, 'the next one, saying nothing, is stock');
});

test('the picture order: a face picture, a portrait of the model worn, a sheet\'s face file, else none', () => {
    const game = loadGame({ system: { reactorSpeakerFace: true } });
    const { S } = game;
    S.install();
    const faceOf = (name, eventId) => { const given = game.say(['', 0, 0, 2, name], null, eventId || 0).given; return [given[0], given[1]]; };
    const reserved = name => name.startsWith(S.FACE_PREFIX);
    // An actor: the face picture; with none, the model the Database binds; with neither, none.
    assert.deepEqual(faceOf('Fleagus Gustafario'), ['Actor1', 2]);
    const dex = faceOf('Dex Marlow');
    assert.ok(reserved(dex[0]) && dex[1] === 0, 'a portrait: a reserved name, index 0');
    assert.match(dex[0], /Jolt/, 'the name says which model');
    assert.deepEqual(faceOf('Nobody Special'), ['', 0]);
    // An event: its model before its sheet (Rhea wears a model and has a sheet with a face file).
    const rhea = faceOf('Rhea');
    assert.ok(reserved(rhea[0]));
    assert.match(rhea[0], /Carol/);
    assert.notEqual(rhea[0], dex[0]);
    assert.equal(faceOf('Rhea Voss')[0], rhea[0], 'the same model and look is the same picture');
    // A sheet: the face file of the same name and index, when img/faces has it.
    assert.deepEqual(faceOf('Odda'), ['People1', 5]);
    assert.deepEqual(faceOf('', 3), ['People1', 5], 'the running event, with no name');
    assert.deepEqual(faceOf('Golem'), ['', 0], 'no face file of that name');
    assert.deepEqual(faceOf('Door'), ['', 0], 'an object sheet is not a person, whatever img/faces holds');
    assert.deepEqual(faceOf('Sign'), ['', 0], 'a tile is not a person');
    assert.deepEqual(faceOf('Console'), ['', 0], 'no look at all: the text keeps the full width');
    assert.deepEqual(faceOf('Stranger', 3), ['', 0], 'a name that fits nobody is not the event that runs the command');
    // Several events of one name: their face when they look alike, none when they do not.
    assert.ok(reserved(faceOf('Raider')[0]));
    assert.deepEqual(faceOf('Guard'), ['', 0], 'a wrong face is worse than none');
    assert.ok(reserved(faceOf('Guard', 23)[0]), 'unless one of them runs the command');
    assert.match(faceOf('Captain')[0], /Carol/, 'one that shows nothing is not the one the player sees');
    assert.deepEqual(faceOf('Shade'), ['', 0]);
});

test('a face file is looked for on the disk once, and never asked of the loader when it is missing', () => {
    const game = loadGame({ system: { reactorSpeakerFace: true }, encrypted: true, faceFiles: ['/game/img/faces/$BigMonster.png_'] });
    const { S, calls } = game;
    S.install();
    assert.equal(S.hasFaceFile('People1'), false);
    assert.deepEqual(calls.exists, ['/game/img/faces/People1.png', '/game/img/faces/People1.png_']);
    assert.equal(S.hasFaceFile('People1'), false);
    assert.equal(calls.exists.length, 2, 'the answer is kept');
    assert.equal(S.hasFaceFile('$BigMonster'), true, 'an encrypted project ships .png_');
    assert.deepEqual(Array.from(game.say(['', 0, 0, 2, 'Golem']).given).slice(0, 2), ['$BigMonster', 0], 'a single-character sheet has one face');
    assert.deepEqual(calls.stockFace, [], 'nothing was loaded to find out');
});

test('a portrait is served by ImageManager under its reserved name, made once, and kept in a bounded cache', async () => {
    const game = loadGame({ system: { reactorSpeakerFace: true } });
    const { S, context, calls } = game;
    S.install();
    // The MV layer's reserve call asks the face loader of the moment.
    context.ImageManager.reserveFace = function(filename) { return this.loadFace(filename); };
    const name = game.say(['', 0, 0, 2, 'Rhea']).given[0];
    assert.notEqual(context.ImageManager.loadFace, game.stockLoadFace, 'the loaders serve reserved names once a portrait exists');
    assert.equal(context.ImageManager.reserveFace(name), context.ImageManager.loadFace(name), 'an MV message window finds the same picture');
    const bitmap = context.ImageManager.loadFace(name);
    assert.ok(bitmap instanceof game.Bitmap);
    assert.equal(bitmap.width, 144);
    assert.equal(bitmap.isReady(), true, 'ready from the start: the message does not wait, and its text keeps the room');
    assert.equal(context.ImageManager.loadBitmap('img/faces/', name), bitmap, 'by the folder loader too');
    assert.deepEqual(context.ImageManager.loadFace('Actor1'), { stock: 'Actor1' }, 'every other name is the stock loader\'s');
    assert.deepEqual(context.ImageManager.loadBitmap('img/pictures/', name), { stock: 'img/pictures/' + name });
    assert.deepEqual(calls.stockFace, ['Actor1'], 'a reserved name never asks the disk');
    assert.equal(bitmap.draws, 0);
    // The loop runs only while a portrait is being made: two drawings, then it rests.
    await game.run(6);
    assert.equal(bitmap.draws, 2, 'each drawing lands in the face\'s own picture');
    assert.deepEqual(calls.painted, ['Actors/Carol|||Militia Sniper|', 'Actors/Carol|||Militia Sniper|']);
    assert.equal(game.frames.length, 0, 'nothing runs once it is made');
    assert.equal(S.portraits().entries.size, 0, 'the maker keeps nothing of a finished portrait');
    assert.equal(S.portraits().target, null);
    // Asked again: the same picture, no new drawing.
    assert.equal(game.say(['', 0, 0, 2, 'Rhea Voss']).given[0], name);
    await game.run(3);
    assert.equal(calls.painted.length, 2);
    assert.equal(S.cost.portraits, 1);
    // The cache is bounded: the least lately shown goes, its name is served a clear picture, never the disk.
    game.message.face = name;
    const many = [];
    for (let i = 0; i < S.KEEP + 6; i++) many.push(S.modelFace({ name: 'Actors/Extra' + i }).name);
    assert.equal(S.cached(), S.KEEP);
    assert.equal(context.ImageManager.loadFace(name), bitmap, 'the face on screen is never the one to go');
    const gone = context.ImageManager.loadFace(many[0]);
    assert.ok(gone instanceof game.Bitmap && gone !== bitmap);
    assert.equal(gone.draws, 0, 'a clear picture');
    assert.ok(calls.destroyed >= 6, 'what left the cache was destroyed');
    assert.deepEqual(calls.stockFace, ['Actor1']);
    // Forgotten: nothing is kept, and the names still never reach the disk.
    S.forget();
    assert.equal(S.cached(), 0);
    assert.equal(S.portraits().entries.size, 0);
    assert.equal(S.portraits().queue.length, 0);
    assert.equal(context.ImageManager.loadFace(name).draws, 0);
    assert.deepEqual(calls.stockFace, ['Actor1']);
});

test('a portrait that arrives while its message is up is drawn into the room the window kept', async () => {
    const game = loadGame({ system: { reactorSpeakerFace: true } });
    const { S, context } = game;
    S.install();
    const cleared = [];
    let drawn = 0;
    context.SceneManager._scene = { _messageWindow: { openness: 255, innerWidth: 792, innerHeight: 152, contents: { clearRect: (...rect) => cleared.push(rect) }, drawMessageFace: () => { drawn++; } } };
    const name = game.say(['', 0, 0, 2, 'Rhea']).given[0];
    game.message.face = name;
    await game.run(6);
    assert.equal(drawn, 2, 'once for each drawing of the portrait');
    assert.deepEqual(cleared[0], [4, 0, 144, 152], 'only the face\'s room is cleared');
    assert.equal(S.cost.late, 2);
    // Another message is up when a portrait arrives: its window is left alone.
    game.message.face = 'Actor1';
    S.modelFace({ name: 'Actors/Other' });
    await game.run(6);
    assert.equal(drawn, 2);
});

test('a model that cannot be read gives no face, once', async () => {
    const game = loadGame({ system: { reactorSpeakerFace: true } });
    const { S } = game;
    S.install();
    const first = game.say(['', 0, 0, 2, 'Ghost']).given;
    assert.ok(first[0].startsWith(S.FACE_PREFIX), 'the room is kept while the model is read');
    await game.run(3);
    assert.deepEqual(Array.from(game.say(['', 0, 0, 2, 'Ghost']).given).slice(0, 2), ['', 0], 'afterwards the text has the full width');
    assert.equal(game.frames.length, 0);
});

test('without the 3D runtime a model gives no portrait and the sheet\'s face file stands in', () => {
    const game = loadGame({ system: { reactorSpeakerFace: true }, threeD: false });
    game.S.install();
    assert.deepEqual(Array.from(game.say(['', 0, 0, 2, 'Rhea']).given).slice(0, 2), ['', 0], 'People2 has no face file here');
    assert.deepEqual(Array.from(game.say(['', 0, 0, 2, 'Dex Marlow']).given).slice(0, 2), ['', 0]);
    assert.equal(game.S.cached(), 0, 'nothing is remembered as failed: a later map may have 3D');
    const noHud = loadGame({ system: { reactorSpeakerFace: true }, noHud: true });
    noHud.S.install();
    assert.deepEqual(Array.from(noHud.say(['', 0, 0, 2, 'Rhea']).given).slice(0, 2), ['', 0]);
    assert.deepEqual(Array.from(noHud.say(['', 0, 0, 2, 'Odda']).given).slice(0, 2), ['People1', 5]);
});

test('the faces an event will show are asked for when it starts, and a map\'s when it loads: once', async () => {
    const game = loadGame({ system: { reactorSpeakerFace: true } });
    const { S, context, calls } = game;
    S.install();
    const list = [
        { code: 101, indent: 0, parameters: ['', 0, 0, 2, 'Rhea'] }, { code: 401, indent: 0, parameters: ['...'] },
        { code: 101, indent: 0, parameters: ['', 0, 0, 2, 'Odda'] },
        { code: 101, indent: 0, parameters: ['', 0, 0, 2, 'Dex Marlow'], reactorFace: 'none' },
        { code: 101, indent: 0, parameters: ['Carol-01', 0, 0, 2, 'Raider'] }];
    const interpreter = Object.create(context.Game_Interpreter.prototype);
    interpreter.setup(list, 7);
    assert.equal(calls.setup, 1, 'the stock setup ran');
    assert.equal(S.cached(), 1, 'Rhea\'s portrait is started; None and a picture need none');
    assert.deepEqual(calls.stockFace, ['People1'], 'a face file is loaded ahead, as the stock preload loads a picture');
    await game.run(6);
    assert.equal(calls.painted.length, 2);
    // A parallel event sets the same list up again every time it ends: looked through once.
    let looked = 0;
    const whoSpeaks = S.whoSpeaks;
    S.whoSpeaks = function() { looked++; return whoSpeaks.apply(this, arguments); };
    for (let i = 0; i < 50; i++) interpreter.setup(list, 7);
    assert.equal(looked, 0);
    // A map: every page of every event, a few portraits at most.
    context.$dataMap = { events: [null, { id: 7, pages: [{ list: [{ code: 101, indent: 0, parameters: ['', 0, 0, 2, 'Raider'] }] }, { list: [{ code: 101, indent: 0, parameters: ['', 0, 0, 2, 'Dex Marlow'] }] }] }] };
    context.Scene_Map.prototype.start.call({});
    assert.equal(calls.mapStart, 1);
    assert.equal(S.cached(), 3);
    context.Scene_Map.prototype.start.call({});
    assert.equal(looked, 2, 'coming back from the menu looks at nothing again');
});

test('a portrait is drawn in its own light, and the map has its light back before anything of the map is drawn', async () => {
    const game = loadGame({ system: { reactorSpeakerFace: true }, light: true });
    const { S, calls, base, lightNow } = game;
    game.context.Scene_Boot.prototype.start.call({});
    const dusk = lightNow();
    const own = [[1, 1, 1], 0, 0, 0, 0, 0];
    assert.equal(S.ownLight, true);
    S.modelFace({ name: 'Actors/Carol' });
    await game.run(3);
    assert.equal(calls.lit.length, 2, 'both drawings of the portrait');
    for (const seen of calls.lit) assert.deepEqual(seen, own, 'full ambient, no lights, no volume, no glowing water: the same picture on every map at every hour');
    assert.deepEqual(lightNow(), dusk, 'the map is lit as it was');
    assert.equal(game.light.rrLightPos.value[0], 3, 'the lights themselves are not touched');
    // A drawing that fails leaves the map's light as it was, too.
    const paint = base.paint;
    base.paint = () => { calls.lit.push(lightNow()); throw new Error('the context was lost'); };
    assert.throws(() => S.portraits().paint({ key: 'x' }), /context was lost/);
    assert.deepEqual(calls.lit.pop(), own);
    assert.deepEqual(lightNow(), dusk);
    base.paint = paint;
    // The kill switch: the portrait in the light of the map it is made on.
    S.ownLight = false;
    S.portraits().paint({ key: 'y' });
    assert.deepEqual(calls.lit.pop(), dusk);
    assert.deepEqual(lightNow(), dusk);
});

test('the speaker\'s maker shares nothing it changes with the HUD\'s, and stands on what the HUD\'s really has', () => {
    const game = loadGame({ system: { reactorSpeakerFace: true }, faceSize: 96 });
    const maker = game.S.portraits();
    assert.equal(maker.SIZE, 96, 'the project\'s face size');
    assert.equal(maker.DRAWN, 192, 'drawn at twice the size');
    assert.equal(loadGame({ faceSize: 288 }).S.portraits().DRAWN, 512);
    assert.notEqual(maker.entries, game.base.entries);
    assert.notEqual(maker.queue, game.base.queue);
    // The real maker (runtime/reactor_ui.js): everything it keeps is kept separately here, and what is called exists.
    const source = read('runtime/reactor_ui.js');
    const from = source.indexOf('    ReactorUI.FightPortraits = {');
    const to = source.indexOf('\n    };\n', from);
    assert.ok(from > 0 && to > from);
    const real = vm.runInNewContext('const ReactorUI = {};\n' + source.slice(from, to + 7) + '\nReactorUI.FightPortraits;', { Map, Uint8Array, console });
    const shared = ['WAIT', 'TRIES', 'CONTEXT'];
    for (const [name, value] of Object.entries(real)) {
        if (typeof value === 'function' || shared.includes(name)) continue;
        assert.ok(Object.hasOwn(maker, name), `the speaker's maker keeps its own ${name}`);
    }
    // The picture read back is used as it is: the map's renderer has written display colors into the target already
    // (the viewport flags the target it makes so three encodes in the shader), and encoding them again washes them out.
    assert.equal(maker.encode, false);
    assert.match(real.develop.toString(), /encode = this\.encode/, 'the maker\'s own word decides');
    const viewport = read('runtime/reactor_3d.js');
    const target = viewport.slice(viewport.indexOf('Reactor3D.Viewport.prototype.createTarget = function'));
    const made = target.slice(0, target.indexOf('\n};\n'));
    assert.match(made, /colorSpace: THREE\.SRGBColorSpace/);
    assert.match(made, /target\.isXRRenderTarget = true;/, 'the target a portrait is drawn into holds display colors');
    assert.match(real.paint.toString(), /this\.target = viewport\.createTarget\(/, 'and that is the target the maker draws into');
    for (const name of ['available', 'keyOf', 'get', 'load', 'fail', 'release', 'paint', 'develop', 'update', 'settle']) {
        assert.equal(typeof real[name], 'function', `ReactorUI.FightPortraits.${name}`);
    }
    // What the maker reads on an entry is what the real one writes.
    const maker_source = real.get.toString() + real.settle.toString() + real.develop.toString();
    for (const field of ['canvas', 'failed', 'scene', 'loading', 'tries', 'key', 'model']) assert.match(maker_source, new RegExp('\\b' + field + '\\b'), field);
});

//-----------------------------------------------------------------------------
// The framing: one rule for every model (three.js stood in for by the few
// classes the rule uses)

function miniThree() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        copy(v) { return this.set(v.x, v.y, v.z); }
        clone() { return new Vector3(this.x, this.y, this.z); }
        add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
        sub(v) { return this.set(this.x - v.x, this.y - v.y, this.z - v.z); }
        multiplyScalar(s) { return this.set(this.x * s, this.y * s, this.z * s); }
        addScaledVector(v, s) { return this.set(this.x + v.x * s, this.y + v.y * s, this.z + v.z * s); }
        dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
        cross(v) { return this.set(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x); }
        normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; return this.multiplyScalar(1 / l); }
    }
    class Box3 {
        constructor(min, max) { this.min = min; this.max = max; }
        getSize(out) { return out.set(this.max.x - this.min.x, this.max.y - this.min.y, this.max.z - this.min.z); }
        getCenter(out) { return out.set((this.max.x + this.min.x) / 2, (this.max.y + this.min.y) / 2, (this.max.z + this.min.z) / 2); }
        clone() { return new Box3(this.min.clone(), this.max.clone()); }
        expandByScalar(s) { this.min.set(this.min.x - s, this.min.y - s, this.min.z - s); this.max.set(this.max.x + s, this.max.y + s, this.max.z + s); return this; }
        containsPoint(p) { return p.x >= this.min.x && p.x <= this.max.x && p.y >= this.min.y && p.y <= this.max.y && p.z >= this.min.z && p.z <= this.max.z; }
    }
    return { Vector3, Box3 };
}

test('every model is framed the same: the eyes at one height, the head one share of the picture', () => {
    const T = miniThree();
    const camera = () => ({ fov: 30, position: new T.Vector3(), lookAt(v) { this.target = v.clone(); }, updateProjectionMatrix() {} });
    const sun = () => ({ position: new T.Vector3(), target: { position: new T.Vector3() } });
    const object = scale => ({ localToWorld: v => v.multiplyScalar(scale) });
    const boxOf = (w, h) => new T.Box3(new T.Vector3(-w / 2, 0, -w / 2), new T.Vector3(w / 2, h, w / 2));
    // What the picture shows of a head: where its eyes fall (from the top, 0 to 1) and how tall it is in the picture.
    const framed = head => {
        const c = camera();
        Rules.aimAtHead(T, head, c, sun());
        const distance = Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z);
        const span = 2 * distance * Math.tan(15 * Math.PI / 180);
        return { eyes: 0.5 - (head.eyes.y - c.target.y) / span, head: head.height / span };
    };
    const landmarks = eyes => ({
        readModelLandmarks: () => (eyes ? { eyes: { part: '', offset: eyes } } : {}),
        bindModelLandmarks: (o, points) => { o.bound = points; },
        modelLandmarkWorld: (o, name, out) => (o.bound && o.bound[name] ? out.set(...o.bound[name].offset) : null)
    });
    // A rigged model with markers, small and large; one with an eyes point as well; one with eyes only; a humanoid with nothing.
    const small = Rules.headOf(landmarks(null), T, object(1), { markers: { headTop: [0, 1.6, 0], chin: [0, 1.4, 0.05] } }, {}, boxOf(0.6, 1.6));
    const large = Rules.headOf(landmarks(null), T, object(3), { markers: { headTop: [0, 1.6, 0], chin: [0, 1.4, 0.05] } }, {}, boxOf(1.8, 4.8));
    const withEyes = Rules.headOf(landmarks([0.01, 1.52, 0.09]), T, object(1), { markers: { headTop: [0, 1.6, 0], chin: [0, 1.4, 0.05] } }, {}, boxOf(0.6, 1.6));
    const eyesOnly = Rules.headOf(landmarks([0, 1.5, 0.1]), T, object(1), null, {}, boxOf(0.6, 1.6));
    const bare = Rules.headOf(landmarks(null), T, object(1), null, { rig: { template: 'humanoid' } }, boxOf(0.6, 1.6));
    for (const [name, head] of Object.entries({ small, large, withEyes, eyesOnly, bare })) {
        assert.ok(head, name);
        const picture = framed(head);
        assert.ok(Math.abs(picture.eyes - Rules.EYE_LINE) < 0.02, `${name}: the eyes sit ${Rules.EYE_LINE} down the picture (${picture.eyes.toFixed(3)})`);
        assert.ok(Math.abs(picture.head - 1 / Rules.HEADS_TALL) < 1e-9, `${name}: the head is 1/${Rules.HEADS_TALL} of the picture`);
    }
    assert.ok(Math.abs(withEyes.eyes.y - 1.52) < 1e-9, 'the eyes point is the anchor when the model has one');
    assert.ok(Math.abs(small.eyes.y - 1.5) < 1e-9, 'else the middle of the head');
    assert.equal(withEyes.height, small.height, 'the size is the markers\' either way');
    // A model stood on its idle clip (moved under its own frame): its markers, placed as it loads, go with it.
    const stood = Object.assign(object(2), { userData: { reactorClipGround: -0.05 } });
    const moved = Rules.headOf(landmarks(null), T, stood, { markers: { headTop: [0, 1.6, 0], chin: [0, 1.4, 0.05] } }, {}, boxOf(1.2, 3.4));
    assert.ok(Math.abs(moved.eyes.y - (1.5 + 0.05) * 2) < 1e-9, 'the head is where the model stands');
    const partless = Rules.headOf(landmarks([0, 1.52, 0.09]), T, stood, { markers: { headTop: [0, 1.6, 0], chin: [0, 1.4, 0.05] } }, {}, boxOf(1.2, 3.4));
    assert.ok(Math.abs(partless.eyes.y - (1.52 + 0.05) * 2) < 1e-9, 'an eyes point on the whole model goes with it too');
    // An eyes point outside the head it belongs to is not believed.
    const wild = Rules.headOf(landmarks([0, 0.2, 0]), T, object(1), { markers: { headTop: [0, 1.6, 0], chin: [0, 1.4, 0.05] } }, {}, boxOf(0.6, 1.6));
    assert.ok(Math.abs(wild.eyes.y - 1.5) < 1e-9);
    // A model with no head (a vehicle, a prop) is shown whole.
    assert.equal(Rules.headOf(landmarks(null), T, object(1), null, {}, boxOf(4, 1.5)), null);
    const c = camera(), box = boxOf(4, 1.5);
    Rules.aimAtWhole(T, box, c, sun());
    assert.deepEqual([c.target.x, c.target.y, c.target.z], [0, 0.75, 0], 'aimed at its middle');
});

//-----------------------------------------------------------------------------
// What a command stores, and what the editor writes

const RUN = () => [
    { code: 101, indent: 1, parameters: ['', 0, 0, 2, 'Odda'] },
    { code: 401, indent: 1, parameters: ['Turnips from the terraces, apples from the Mill Road.'] },
    { code: 401, indent: 1, parameters: ['Fresh this morning. Mostly.'] },
    { code: 101, indent: 1, parameters: ['', 0, 1, 0, 'Rhea'], reactorFace: 'none' },
    { code: 401, indent: 1, parameters: ['Quiet roads.'] },
    { code: 101, indent: 1, parameters: ['', 0, 0, 2, '\\N[1]'], reactorFace: 'auto' },
    { code: 401, indent: 1, parameters: ['...'] },
    { code: 101, indent: 1, parameters: ['Actor1', 3, 0, 2, 'Fleagus'] },
    { code: 401, indent: 1, parameters: ['A picture.'] },
    { code: 101, indent: 1, parameters: ['', 0, 0, 2, 'Later'], reactorFace: 'left' },
    { code: 401, indent: 1, parameters: ['A choice a later version wrote.'] }
];

test('a Show Text nobody touched is written back byte for byte, with its choice or without', () => {
    const list = RUN();
    const before = JSON.stringify(list);
    const run = Boxes.collectRun(list, 3);
    assert.equal(run.boxes.length, 5);
    assert.deepEqual(run.boxes.map(box => box.header.faceMode), [undefined, 'none', 'auto', undefined, 'left']);
    const written = Boxes.buildCommands(run.boxes, 1, 4);
    assert.equal(JSON.stringify(written), before, 'opening the run and pressing OK changes nothing');
    assert.equal(JSON.stringify(list), before, 'reading it changed nothing either');
    // The command stays the five parameters RPG Maker and its plugins read; the choice sits beside them.
    for (const command of written.filter(entry => entry.code === 101)) {
        assert.equal(command.parameters.length, 5);
        assert.deepEqual(Object.keys(command).filter(key => key !== 'reactorFace'), ['code', 'indent', 'parameters']);
    }
    assert.equal(Boxes.sameHeader(run.boxes[0].header, Object.assign({}, run.boxes[0].header, { faceMode: 'none' })), false, 'a choice is part of what a box is');
    // A box added after one keeps talking the same way.
    assert.equal(Boxes.newBox(run.boxes[1].header).header.faceMode, 'none');
});

function loadDialog(system, world = {}) {
    const saved = { window: global.window };
    global.window = { ReactorSpeakerFace: Rules };
    const MessageCommandEditor = require(path.join(repoRoot, 'editor/src/event/commands/MessageCommandEditor.js'));
    const data = Object.assign({ system, actors: [null,
        { id: 1, name: 'Fleagus Gustafario', faceName: 'Actor1', faceIndex: 2 },
        { id: 2, name: 'Dex Marlow', faceName: '', faceIndex: 0 },
        { id: 3, name: 'Nobody Special', faceName: '', faceIndex: 0 }],
    modelBindings: { actors: { 2: { character: { name: 'Actors/Jolt', variant: 'Technician' } } }, enemies: { 6: { name: 'Actors/Jolt', variant: 'Raider' } } } }, world.data || {});
    const controller = { getCurrentProject: () => ({ path: '/project' }), eventManager: world.eventManager || null };
    const editor = new MessageCommandEditor({ getSystem: () => system, data }, controller);
    if (world.eventManager) world.eventManager.eventEditor.commandList = { messageEditor: editor, currentPageIndex: world.pageIndex || 0 };
    editor._hasFaceFile = name => (world.faceFiles || []).includes(name);
    const open = commands => {
        const run = Boxes.collectRun(commands, 0);
        editor.boxes = run.boxes.map(box => ({ header: { ...box.header }, lines: box.lines.slice(), source: box.source, indent: box.indent }));
        for (const box of editor.boxes) box.faceRead = { name: box.header.faceName || '', mode: box.header.faceMode };
        editor.activeIndex = 0;
        editor._autoMemo = null;
    };
    const restore = () => { global.window = saved.window; if (saved.window === undefined) delete global.window; };
    return { editor, open, restore, data };
}

test('the face box writes a choice only when the message differs from the project, and a new Show Text follows the switch', () => {
    const write = (system, commands, act) => {
        const dialog = loadDialog(system);
        try {
            if (commands) dialog.open(commands); else dialog.editor.resetToDefaults();
            const mode = dialog.editor._faceMode();
            if (act) act(dialog.editor);
            return { mode, after: dialog.editor._faceMode(), commands: Boxes.buildCommands(dialog.editor.boxes, 0, 4) };
        } finally { dialog.restore(); }
    };
    const on = { reactorSpeakerFace: true }, off = {};
    // A new Show Text starts on Automatic when the project's switch is on, on None when it is off: nothing is stored either way.
    assert.equal(write(on, null).mode, 'auto');
    assert.equal(write(off, null).mode, 'none');
    assert.deepEqual(write(on, null).commands, [{ code: 101, indent: 0, parameters: ['', 0, 0, 2, ''] }]);
    // The other choice is written; going back writes nothing.
    assert.equal(write(on, null, editor => editor._setFaceMode('none')).commands[0].reactorFace, 'none');
    assert.equal(write(off, null, editor => editor._setFaceMode('auto')).commands[0].reactorFace, 'auto');
    assert.equal('reactorFace' in write(on, null, editor => { editor._setFaceMode('none'); editor._setFaceMode('auto'); }).commands[0], false);
    assert.equal('reactorFace' in write(off, null, editor => { editor._setFaceMode('auto'); editor._setFaceMode('none'); }).commands[0], false);
    // A choice the command was read with comes back as it was written, even where the project would do the same.
    const explicit = [{ code: 101, indent: 0, parameters: ['', 0, 0, 2, 'Rhea'], reactorFace: 'auto' }, { code: 401, indent: 0, parameters: ['Hello.'] }];
    assert.equal(write(on, explicit).mode, 'auto');
    assert.equal(JSON.stringify(write(on, explicit, editor => { editor._setFaceMode('none'); editor._setFaceMode('auto'); }).commands), JSON.stringify(explicit));
    assert.equal(write(on, explicit, editor => editor._setFaceMode('none')).commands[0].reactorFace, 'none');
    // A picture is the whole choice; taking it away again is Automatic or None.
    const picked = write(on, explicit, editor => { editor.faceImage = 'Carol-01'; editor.faceIndex = 4; });
    assert.equal(picked.after, 'picture');
    assert.deepEqual(picked.commands[0], { code: 101, indent: 0, parameters: ['Carol-01', 4, 0, 2, 'Rhea'] });
    const cleared = write(off, [{ code: 101, indent: 0, parameters: ['Carol-01', 4, 0, 2, 'Rhea'] }], editor => editor._setFaceMode('none'));
    assert.deepEqual(cleared.commands[0], { code: 101, indent: 0, parameters: ['', 0, 0, 2, 'Rhea'] }, 'None on a project that shows none is the plain command');
});

test('the face box says what Automatic will be, and says so when only the game can tell', () => {
    const map = { events: [null,
        { id: 3, name: 'Odda the Grocer', note: '', pages: [{ image: { characterName: 'People1', characterIndex: 5, tileId: 0 } }] },
        { id: 7, name: 'Console', note: '', pages: [{ image: { characterName: '', characterIndex: 0, tileId: 0 } }] },
        { id: 12, name: 'Rhea Voss', note: '', pages: [{ image: { characterName: '', characterIndex: 0, tileId: 0 } }] },
        { id: 20, name: 'Raider', note: '<unit: enemy 6>', pages: [{ image: { characterName: '', characterIndex: 0, tileId: 0 } }] },
        { id: 21, name: 'Raider', note: '<unit: enemy 6>', pages: [{ image: { characterName: '', characterIndex: 0, tileId: 0 } }] },
        { id: 22, name: 'Door', note: '', pages: [{ image: { characterName: '!Door1', characterIndex: 0, tileId: 0 } }] },
        { id: 23, name: 'Raider', note: '', pages: [{ image: { characterName: '', characterIndex: 0, tileId: 0 } }] },
        { id: 24, name: 'Guard', note: '<unit: enemy 6>', pages: [{ image: { characterName: '', characterIndex: 0, tileId: 0 } }] },
        { id: 25, name: 'Guard', note: '', pages: [{ image: { characterName: 'People1', characterIndex: 2, tileId: 0 } }] }],
    reactor3d: { events: { 12: { 0: { name: 'Actors/Carol', variant: 'Militia Sniper' } } } } };
    const eventEditor = { currentEvent: JSON.parse(JSON.stringify(map.events[1])), pendingModels: [null], _currentMap: () => map };
    const dialog = loadDialog({ reactorSpeakerFace: true }, { eventManager: { eventEditor }, faceFiles: ['People1', '!Door1'] });
    try {
        const about = name => { const found = dialog.editor._automatic({ speakerName: name }); return [found.state, found.name || (found.spec && found.spec.name) || '', found.hint]; };
        assert.deepEqual(about('Fleagus Gustafario'), ['face', 'Actor1', 'The face of Fleagus Gustafario.']);
        assert.deepEqual(about('\\N[1]'), ['face', 'Actor1', 'The face of Fleagus Gustafario.']);
        assert.deepEqual(about('Dex Marlow'), ['model', 'Actors/Jolt', 'A portrait made from the model of Dex Marlow.']);
        assert.deepEqual(about('Nobody Special'), ['none', '', 'No face: Nobody Special has no model and no face picture.']);
        assert.deepEqual(about('Rhea'), ['model', 'Actors/Carol', 'A portrait made from the model of Rhea Voss.']);
        assert.deepEqual(about(''), ['face', 'People1', 'The face of Odda the Grocer.'], 'no name: the event being edited, by its sheet\'s face file');
        assert.deepEqual(about('Raider'), ['model', 'Actors/Jolt', 'A portrait made from the model of Raider.'], 'two units of one record look alike; a third Raider that shows nothing is not counted');
        assert.deepEqual(about('Guard'), ['none', '', 'No face: several events are named Guard and do not look alike.']);
        assert.deepEqual(about('Console'), ['none', '', 'No face: Console has no model and no face picture.']);
        assert.deepEqual(about('Door'), ['none', '', 'No face: Door has no model and no face picture.'], 'an object sheet');
        assert.deepEqual(about('Stranger'), ['none', '', 'No face: nobody here is named Stranger.']);
        assert.deepEqual(about('\\V[3]'), ['unknown', '', 'The name comes from a variable: the game finds the speaker when the message shows.']);
        // The text is measured at the width it will have: a face's room is kept unless Automatic knows there is none.
        const editor = dialog.editor;
        editor._portraitFor = () => null;
        assert.ok(editor._previewFace({ faceName: '', speakerName: 'Fleagus Gustafario' }).picture);
        assert.deepEqual(editor._previewFace({ faceName: '', speakerName: 'Rhea' }), { canvas: null }, 'the room is kept while a portrait is made');
        assert.deepEqual(editor._previewFace({ faceName: '', speakerName: '\\V[3]' }), {}, 'and where only the game can tell');
        assert.equal(editor._previewFace({ faceName: '', speakerName: 'Stranger' }), null);
        assert.equal(editor._previewFace({ faceName: '', speakerName: 'Rhea', faceMode: 'none' }), null);
        // The model of the page being edited is the one not saved yet.
        eventEditor.pendingModels = [{ name: 'Actors/Fleagus' }];
        editor._autoMemo = null;
        assert.deepEqual(about('Odda'), ['model', 'Actors/Fleagus', 'A portrait made from the model of Odda the Grocer.']);
    } finally { dialog.restore(); }
    // A common event or a battle event: the editor does not know the map, and says so.
    const database = loadDialog({ reactorSpeakerFace: true });
    try {
        const about = name => { const found = database.editor._automatic({ speakerName: name }); return [found.state, found.hint]; };
        assert.deepEqual(about('Fleagus Gustafario'), ['face', 'The face of Fleagus Gustafario.']);
        assert.deepEqual(about('Rhea'), ['unknown', 'The game finds the speaker when the message shows.']);
        assert.deepEqual(about(''), ['unknown', 'The game finds the speaker when the message shows.']);
    } finally { database.restore(); }
});

//-----------------------------------------------------------------------------
// Where it is registered

test('the runtime file boots after the engine it stands on and before the plugins, and every list names it', () => {
    const main = read('runtime/reactor_main.js');
    const scripts = Array.from(main.match(/"js\/[^"]+"/g), quoted => quoted.slice(4, -1));
    assert.equal(scripts.filter(name => name === 'reactor_speaker_face.js').length, 1);
    const at = scripts.indexOf('reactor_speaker_face.js');
    assert.ok(at < scripts.indexOf('reactor_plugins.js'), 'before the plugins: its hooks go on at boot, outside theirs');
    for (const earlier of ['reactor_ui.js', 'reactor_mv_compat.js', 'reactor_objects_interpreter.js', 'reactor_scenes.js']) {
        assert.ok(scripts.indexOf(earlier) >= 0 && scripts.indexOf(earlier) < at, `after ${earlier}`);
    }
    // The engine files listed after it leave alone what it hooks and what it serves: its boot hook stays the outermost of the engine's.
    for (const later of scripts.slice(at + 1, scripts.indexOf('reactor_plugins.js'))) {
        const code = read('runtime/' + later).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        assert.doesNotMatch(code, /Scene_Boot\.prototype\.start\s*=|command101|Game_Interpreter\.prototype\.setup\s*=|ImageManager\.(loadFace|loadBitmap)\s*=/, later);
    }
    for (const name of ['build-scripts/build.js', 'build-scripts/build-worker.js', 'build-scripts/dist-editor-worker.js']) {
        assert.ok(read('editor/' + name).includes("'reactor_speaker_face.js'"), name);
    }
    const source = read(runtimeFile);
    const rules = source.slice(source.indexOf('(function(root) {'), source.indexOf('// The game. Nothing below runs in the editor'))
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(rules.length > 2000);
    assert.doesNotMatch(rules, /\$(game|data)[A-Z]|ImageManager|SceneManager|Game_[A-Z]|Graphics\b|\bwindow\b|\bdocument\b/, 'the rules the editor loads touch no game global');
});

test('the project\'s switch is on the Database page beside the message options, and on in a new project', () => {
    const system1 = read('editor/src/database/DatabaseSystem1Editor.js');
    assert.match(system1, /system\.reactorSpeakerFace === true \? 'checked' : ''\} data-field="reactorSpeakerFace">\s*\$\{tt\("Show the speaker's face in messages"\)\}/);
    assert.ok(system1.indexOf('data-field="optMessageSkip"') < system1.indexOf('data-field="reactorSpeakerFace"'), 'in Options, after Enable Message Skip');
    const manager = read('editor/src/ProjectManager.js');
    assert.match(manager, /optTransparent: false,\s*(\/\/[^\n]*\n\s*)?reactorSpeakerFace: true,/, 'a blank new project');
    assert.match(manager, /if \(systemData\.reactorSpeakerFace === undefined\) systemData\.reactorSpeakerFace = true;/, 'a new project made from the template');
    const list = read('editor/src/event/EventCommandList.js');
    assert.match(list, /command\.reactorFace === 'auto' \? tt\('Automatic'\) : command\.reactorFace === 'none' \? tt\('None'\)/, 'the command list says a message\'s own choice');
});

test('every word of the face box and the switch is translated in all 17 locales', () => {
    const sandbox = {};
    sandbox.globalThis = sandbox;
    vm.runInNewContext(read('editor/src/I18nDeepTranslations.js'), sandbox);
    const tables = sandbox.RR_DEEP_TEXT_TRANSLATIONS;
    const locales = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];
    const dialog = read('editor/src/event/commands/MessageCommandEditor.js');
    const phrases = ["The speaker's face", 'Picture...', 'The name comes from a variable: the game finds the speaker when the message shows.',
        'The game finds the speaker when the message shows.', 'No face: nobody here is named %1.', 'No face: several events are named %1 and do not look alike.',
        'The face of %1.', 'A portrait made from the model of %1.', 'No face: %1 has no model and no face picture.'];
    for (const phrase of phrases) assert.ok(dialog.includes(`this._t('${phrase}')`) || dialog.includes(`this._t("${phrase}")`), `the dialog says ${JSON.stringify(phrase)}`);
    phrases.push("Show the speaker's face in messages", 'A Show Text with no face picture shows the face of whoever speaks: an actor or an event of that name.');
    for (const phrase of phrases) for (const locale of locales) {
        const text = tables[locale] && tables[locale][phrase];
        assert.ok(text && text !== phrase, `${locale}: ${phrase}`);
        assert.deepEqual((text.match(/%[1-9]/g) || []).sort(), (phrase.match(/%[1-9]/g) || []).sort(), `${locale} keeps the name's place in ${phrase}`);
    }
});
