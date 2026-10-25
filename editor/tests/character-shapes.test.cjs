'use strict';
// Game_CharacterBase.evenShapes: a new character declares the fields the
// engine gives it later (LATE_FIELDS), undefined, so each kind of character
// has one hidden class; a loaded game has its characters rebuilt in one field
// order per kind (Game_CharacterBase.evenOut, DataManager.evenCharacterShapes).
// Driven here through the real objects, DataManager and JsonEx: saves are the
// same with the switch on or off, values and prototypes survive a load, a
// plugin's fields are kept, and every reference to a loaded character (an MV
// save keeps shared references) reaches its rebuilt self.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { followerWorld, event } = require('./helpers/follower-world.cjs');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');

// V8's own view of shapes; the field order is the check when natives are not available.
let sameShape = null;
try {
    require('node:v8').setFlagsFromString('--allow-natives-syntax');
    sameShape = new Function('a', 'b', 'return %HaveSameMap(a, b)');
    sameShape({}, {});
} catch (error) {
    sameShape = null;
}

const events = () => [event(1, 3, 3), event(2, 8, 8), event(3, 9, 9), event(4, 12, 4)];
// Encounter counts are rolled: both worlds roll the same.
const steady = (map, ctx) => { vm.runInContext('Math.random = () => 0.5', ctx); };
const off = (map, ctx) => { steady(map, ctx); ctx.Game_CharacterBase.evenShapes = false; };
const characters = w => [w.$gamePlayer, ...w.$gamePlayer.followers()._data, ...w.$gameMap._vehicles, ...w.$gameMap._events.filter(Boolean)];
/** A character's saved values (what JsonEx writes for it) and its kind. */
const saved = (w, character) => ({ kind: Object.getPrototypeOf(character), values: JSON.parse(w.JsonEx.stringify(character)) });
const saveJson = w => JSON.parse(w.JsonEx.stringify(w.DataManager.makeSaveContents()));

test('a new character declares the late fields, undefined, and its save is the one made with the switch off', () => {
    const on = followerWorld({ events: events(), prepare: steady }), plain = followerWorld({ events: events(), prepare: off });
    for (const w of [on, plain]) { w.walk(6, 2); w.rest(); }
    const late = on.Game_CharacterBase.LATE_FIELDS;
    for (const c of characters(on)) {
        for (const key of late) assert.ok(Object.prototype.hasOwnProperty.call(c, key), c.constructor.name + ' declares ' + key);
    }
    assert.ok(characters(plain).some(c => !Object.prototype.hasOwnProperty.call(c, '_rrStage')), 'with the switch off nothing is declared');
    const json = on.JsonEx.stringify(on.DataManager.makeSaveContents());
    for (const key of late) {
        if (characters(on).every(c => c[key] === undefined)) assert.ok(!json.includes('"' + key + '"'), key + ' is not written while undefined');
    }
    assert.deepEqual(JSON.parse(json), saveJson(plain), 'the same save, field for field');
    // Every event has the same fields in the same order, and (where V8 says) the same hidden class.
    const list = on.$gameMap._events.filter(Boolean), keys = Object.keys(list[0]).join();
    for (const e of list) assert.equal(Object.keys(e).join(), keys);
    if (sameShape) for (const e of list) assert.ok(sameShape(list[0], e), 'event ' + e.eventId() + ' shares the first one\'s shape');
});

test('a loaded game plays on rebuilt characters: values, prototypes, plugin fields kept; one field order per kind', () => {
    const w = followerWorld({ events: events() });
    w.walk(6, 2); w.rest();
    // A plugin's fields, on some events only, and a vehicle the party has used.
    const e2 = w.$gameMap._events[2], e3 = w.$gameMap._events[3];
    e2._pluginNotes = { said: ['hello', 2], seen: true };
    e3._pluginCount = 4.5;
    w.$gameMap._vehicles[0]._rrHome = [3, 4, 90];
    const before = characters(w).map(c => saved(w, c));
    const loadedFrom = characters(w);
    w.saveAndLoad();
    const after = characters(w);
    assert.equal(after.length, before.length);
    for (let i = 0; i < after.length; i++) {
        assert.notEqual(after[i], loadedFrom[i]);
        assert.equal(Object.getPrototypeOf(after[i]), before[i].kind, 'the prototype is kept');
        assert.deepEqual(saved(w, after[i]).values, before[i].values, 'every value is kept');
    }
    assert.ok(w.$gamePlayer instanceof w.Game_Player && w.$gamePlayer.followers()._data.every(f => f instanceof w.Game_Follower));
    assert.equal(JSON.stringify(w.$gameMap._events[2]._pluginNotes), JSON.stringify({ said: ['hello', 2], seen: true }));
    assert.equal(w.$gameMap._events[3]._pluginCount, 4.5);
    assert.ok(!('_pluginNotes' in w.$gameMap._events[1]), 'a plugin field is not given to the events that lacked it');
    for (const key of w.Game_CharacterBase.LATE_FIELDS) assert.ok(key in w.$gameMap._events[1], 'a loaded event declares ' + key);
    // One order per kind: the events without plugin fields, the followers, the vehicles.
    const order = list => list.map(c => Object.keys(c).join());
    for (const list of [[w.$gameMap._events[1], w.$gameMap._events[4]], w.$gamePlayer.followers()._data, w.$gameMap._vehicles]) {
        assert.equal(new Set(order(list)).size, 1, Object.getPrototypeOf(list[0]).constructor.name + ' share one field order');
        if (sameShape) for (const c of list) assert.ok(sameShape(list[0], c));
    }
    assert.equal(w.$gameMap.vehicle('boat'), w.$gameMap._vehicles[0], 'the map finds its vehicles');
    // Play goes on: the party walks, the followers follow, and the next save loads too.
    const x = w.$gamePlayer.x;
    w.walk(6, 2); w.rest();
    assert.equal(w.$gamePlayer.x, x + 2);
    assert.ok(w.$gamePlayer.followers()._data.some(f => f.x !== x), 'the followers came along');
    assert.doesNotThrow(() => w.saveAndLoad());
});

test('every reference to a loaded character reaches its rebuilt self (an MV save keeps shared references)', () => {
    const w = followerWorld({ events: events() });
    const compat = fs.readFileSync(path.join(runtimeRoot, 'reactor_mv_compat.js'), 'utf8');
    const start = compat.indexOf('    function installJsonExCompatibility()'), end = compat.indexOf('\n    function ensureArrayClone()', start);
    assert.ok(start >= 0 && end > start, 'the MV save format is found');
    vm.runInContext('(function() { const global = globalThis; const mvGameSemantics = true;\n' + compat.slice(start, end) + '\ninstallJsonExCompatibility(); })()', w);
    // References from elsewhere in the save: a plugin's list, the map interpreter's MV wait, a follower pointing at its leader.
    w.$gameSystem._pluginWatch = [w.$gameMap._events[2], w.$gameMap._events[3]];
    w.$gameMap._interpreter._character = w.$gameMap._events[1];
    w.$gamePlayer.followers()._data[0]._pluginLeader = w.$gamePlayer;
    const contents = w.JsonEx.parse(w.JsonEx.stringify(w.DataManager.makeSaveContents()));
    assert.equal(contents.system._pluginWatch[0], contents.map._events[2], 'the save holds the shared reference');
    const parsedEvent = contents.map._events[2];
    vm.runInContext('DataManager.createGameObjects()', w);
    w.DataManager.extractSaveContents(contents);
    assert.notEqual(w.$gameMap._events[2], parsedEvent, 'the event was rebuilt');
    assert.equal(w.$gameSystem._pluginWatch[0], w.$gameMap._events[2]);
    assert.equal(w.$gameSystem._pluginWatch[1], w.$gameMap._events[3]);
    assert.equal(w.$gameMap._interpreter._character, w.$gameMap._events[1]);
    assert.equal(w.$gamePlayer.followers()._data[0]._pluginLeader, w.$gamePlayer);
    assert.equal(contents.player, w.$gamePlayer, 'a plugin reading the contents after the load sees the same player');
    assert.doesNotThrow(() => w.JsonEx.stringify(w.DataManager.makeSaveContents()), 'the next MV save is made');
});

test('evenOut leaves what is not a character as it is and keeps accessors, hidden fields and prototype defaults', () => {
    const w = followerWorld({ events: events() });
    const { Game_Event, Game_CharacterBase } = w;
    const Plugin_Event = vm.runInContext(`(function() {
        function Plugin_Event() {}
        Plugin_Event.prototype = Object.create(Game_Event.prototype);
        Plugin_Event.prototype.constructor = Plugin_Event;
        Object.defineProperty(Plugin_Event.prototype, '_reactorWalk', { get() { return 'from the plugin'; }, configurable: true });
        Object.defineProperty(Plugin_Event.prototype, '_pluginBox', { get() { return 'getter'; }, set(v) { throw new Error('the setter ran'); }, configurable: true });
        Plugin_Event.prototype._destinationCheckCounter = 7;
        return Plugin_Event;
    })()`, w);
    const made = vm.runInContext('(P => { const e = Object.create(P.prototype); e._x = 1; e._y = 2; return e; })', w)(Plugin_Event);
    Object.defineProperty(made, '_pluginBox', { value: 3, writable: true, enumerable: true, configurable: true });
    Object.defineProperty(made, '_pluginHidden', { value: 'hidden', writable: true, enumerable: false, configurable: true });
    const mark = Symbol('mark');
    made[mark] = 'symbol';
    const plainObject = { _x: 1 }, frozen = Object.freeze(Object.create(Game_Event.prototype));
    const rebuilt = Game_CharacterBase.evenOut([made, made, plainObject, frozen, null, 5]);
    assert.equal(rebuilt.size, 1, 'only the character, once');
    const even = rebuilt.get(made);
    assert.equal(Object.getPrototypeOf(even), Plugin_Event.prototype);
    assert.deepEqual([even._x, even._y, even._pluginBox, even._pluginHidden, even[mark]], [1, 2, 3, 'hidden', 'symbol']);
    assert.equal(Object.getOwnPropertyDescriptor(even, '_pluginHidden').enumerable, false);
    assert.equal(even._reactorWalk, 'from the plugin', 'a declared name the prototype answers is not covered');
    assert.equal(even._destinationCheckCounter, 7, 'a prototype default is not covered');
    assert.ok('_reactorAir' in even && even._reactorAir === undefined);
    // A new character leaves the prototype's answer showing as well.
    Game_Event.prototype._destinationCheckCounter = 9;
    const fresh = new Game_Event(1, 1);
    assert.equal(fresh._destinationCheckCounter, 9);
    assert.ok(!Object.prototype.hasOwnProperty.call(fresh, '_destinationCheckCounter'));
});

test('with the switch off a loaded game keeps its characters, and a save made with it off loads the same with it on', () => {
    const w = followerWorld({ events: events(), prepare: off });
    w.walk(6, 2); w.rest();
    const before = characters(w).map(c => saved(w, c));
    const json = w.JsonEx.stringify(w.DataManager.makeSaveContents());
    let contents = w.JsonEx.parse(json);
    const parsed = contents.map._events[1];
    vm.runInContext('DataManager.createGameObjects()', w);
    w.DataManager.extractSaveContents(contents);
    assert.equal(w.$gameMap._events[1], parsed, 'nothing is rebuilt');
    w.Game_CharacterBase.evenShapes = true;
    contents = w.JsonEx.parse(json);
    const parsedAgain = contents.map._events[1];
    vm.runInContext('DataManager.createGameObjects()', w);
    w.DataManager.extractSaveContents(contents);
    assert.notEqual(w.$gameMap._events[1], parsedAgain, 'rebuilt with the switch on');
    const after = characters(w).map(c => saved(w, c));
    assert.deepEqual(after.map(a => a.values), before.map(b => b.values));
    assert.deepEqual(after.map(a => a.kind), before.map(b => b.kind));
    for (const key of w.Game_CharacterBase.LATE_FIELDS) assert.ok(key in w.$gamePlayer);
});

// Real saves from the bundled projects (read only; skipped where a project has none): loaded with the switch
// off and on, the two games are the same object for object, and their next saves hold the same.
const REAL_SAVES = [['Demo', 'file0.rmmzsave'], ['Demo', 'file99.rmmzsave'], ['MZ3D', 'file2.rmmzsave'], ['Gladatora', 'file1.rpgsave']];
const realSave = file => {
    const text = fs.readFileSync(file, 'utf8');
    if (/^[A-Za-z0-9+/=]+$/.test(text.slice(0, 200))) {
        const lz = {};
        vm.runInNewContext(fs.readFileSync(path.join(runtimeRoot, 'libs', 'lz-string.js'), 'utf8'), lz);
        const json = lz.LZString.decompressFromBase64(text);
        if (json && json[0] === '{') return json;
    }
    return require('node:zlib').inflateSync(Buffer.from(text, 'binary')).toString('utf8');
};
/** Both graphs walked in step: same kinds, same defined values, and references that point alike. */
function sameGame(a, b) {
    const ab = new Map(), ba = new Map(), stack = [[a, b, '']];
    const kind = v => { const p = Object.getPrototypeOf(v); return p && p.constructor ? p.constructor.name : String(p); };
    while (stack.length) {
        const [x, y, at] = stack.pop();
        if (!x || typeof x !== 'object' || !y || typeof y !== 'object') { assert.ok(Object.is(x, y), at + ': ' + x + ' vs ' + y); continue; }
        if (ab.has(x) || ba.has(y)) { assert.ok(ab.get(x) === y && ba.get(y) === x, at + ' points to the same object'); continue; }
        ab.set(x, y); ba.set(y, x);
        assert.equal(kind(x), kind(y), at);
        const keys = new Set([...Object.keys(x).filter(k => x[k] !== undefined), ...Object.keys(y).filter(k => y[k] !== undefined)]);
        for (const k of keys) stack.push([x[k], y[k], at + '.' + k]);
    }
}
for (const [project, name] of REAL_SAVES) {
    const file = path.join(runtimeRoot, '..', 'template', project, 'save', name);
    test(`a real save (${project} ${name}) loads the same game with the switch on as off`, { skip: !fs.existsSync(file) && 'no such save' }, () => {
        const json = realSave(file), mv = /"@c":/.test(json);
        const w = followerWorld({});
        const compat = fs.readFileSync(path.join(runtimeRoot, 'reactor_mv_compat.js'), 'utf8');
        const start = compat.indexOf('    function installJsonExCompatibility()'), end = compat.indexOf('\n    function ensureArrayClone()', start);
        vm.runInContext('(function() { const global = globalThis; const mvGameSemantics = ' + mv + ';\n' + compat.slice(start, end) + '\ninstallJsonExCompatibility(); })()', w);
        const names = ['system', 'screen', 'timer', 'switches', 'variables', 'selfSwitches', 'actors', 'party', 'map', 'player'];
        const load = even => {
            w.Game_CharacterBase.evenShapes = even;
            const contents = w.JsonEx.parse(json);
            vm.runInContext('DataManager.createGameObjects()', w);
            w.DataManager.extractSaveContents(contents);
            return { contents, game: w.DataManager.makeSaveContents() };
        };
        const off = load(false), on = load(true);
        assert.equal(on.contents.player, on.game.player);
        const events = on.game.map._events.filter(Boolean);
        assert.ok(events.length > 0 && events.every((e, i) => e !== off.game.map._events.filter(Boolean)[i]), 'the events were rebuilt');
        sameGame(names.map(n => off.game[n]), names.map(n => on.game[n]));
        sameGame(w.JsonEx.parse(w.JsonEx.stringify(off.game)), w.JsonEx.parse(w.JsonEx.stringify(on.game)));
    });
}
