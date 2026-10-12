'use strict';
// Vehicle kinds (runtime/reactor_3d_vehicles.js, Reactor3D.Vehicles.KINDS and typeOf): a kind is a row of defaults
// and four switches the mover reads; a type record takes its kind's value for every field it does not write.
// The file is loaded here with nothing but a bare Reactor3D: the pure half needs no three.js and no game.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'runtime', 'reactor_3d_vehicles.js'), 'utf8');
function load(extra = {}) {
    const sandbox = Object.assign({ console, Math, JSON, Reactor3D: {} }, extra);
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'reactor_3d_vehicles.js' });
    return sandbox.Reactor3D.Vehicles;
}
const V = load();
const plain = value => JSON.parse(JSON.stringify(value));

test('the pure half loads with a bare namespace: no three.js, no game', () => {
    for (const name of ['KINDS', 'typeOf', 'typeNotes', 'forgetType', 'types', 'step', 'newState', 'read', 'guess', 'findFront', 'findWheels', 'frame',
        'inputs', 'pose', 'heading', 'pointWorld']) assert.ok(V[name], name);
    assert.equal(V.file, 'reactor_3d_vehicles.js');
});

test('each function another file provides is wrapped once, however often this file is loaded', () => {
    // A namespace with the ten functions and the scene's two, each counting its calls.
    const calls = {};
    const counted = name => function() { calls[name] = (calls[name] || 0) + 1; return name === 'readModelAnimationRules' ? [] : name === 'animationDue' ? true : {}; };
    const names = ['readModelLandmarks', 'bindModelLandmarks', 'readModelAnimationRules', 'readModelPivots', 'noteModelFacing', 'applyModelAnimation', 'animationDue'];
    const R = { StillModels: { enabled: true, note: counted('note'), settled: counted('settled') }, MapScene: function() {} };
    for (const name of names) R[name] = counted(name);
    R.MapScene.prototype.syncCharacterModels = counted('syncCharacterModels');
    R.MapScene.prototype.clear = counted('clear');
    const sandbox = { console, Math, JSON, Reactor3D: R };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'reactor_3d_vehicles.js' });
    const once = names.map(name => R[name]).concat([R.StillModels.note, R.StillModels.settled, R.MapScene.prototype.syncCharacterModels, R.MapScene.prototype.clear]);
    assert.ok(once.every(wrapped => wrapped.__rrVehicles === true), 'all eleven and the scene\'s clear are wrapped');
    // Loaded again (a second script tag, or the namespace made anew over the same engine): nothing is wrapped twice.
    delete R.Vehicles;
    vm.runInContext(source, sandbox, { filename: 'reactor_3d_vehicles.js' });
    const twice = names.map(name => R[name]).concat([R.StillModels.note, R.StillModels.settled, R.MapScene.prototype.syncCharacterModels, R.MapScene.prototype.clear]);
    twice.forEach((wrapped, i) => assert.equal(wrapped, once[i]));
    R.readModelLandmarks(null);
    R.readModelPivots(null);
    R.animationDue(null);
    Object.create(R.MapScene.prototype).clear();
    assert.deepEqual([calls.readModelLandmarks, calls.readModelPivots, calls.animationDue, calls.clear], [1, 1, 1, 1], 'the wrapped function runs once a call');
    // A function the engine does not have is not invented: a bare namespace gains the one name.
    const bare = { console, Math, JSON, Reactor3D: {} };
    vm.createContext(bare);
    vm.runInContext(source, bare, { filename: 'reactor_3d_vehicles.js' });
    assert.deepEqual(Object.keys(bare.Reactor3D), ['Vehicles']);
});

test('the rules a block makes are added only by a rule reader that keeps them: a rule it would misread turns nothing', () => {
    const block = { forward: '-x', wheels: [{ part: 'Wheel', at: [0, 0.3, 0], radius: 0.3 }], controls: [{ input: 'steer', part: 'Bars', at: [0, 1, 0] }], seats: [] };
    const reader = keeps => json => ((json && json.animations) || []).map(raw => keeps
        ? { name: raw.name, type: raw.type, part: raw.part, axisVector: raw.axisVector, exact: raw.exact === true, radius: raw.radius, input: raw.input, degrees: raw.degrees }
        : { name: raw.name, type: raw.type === 'drive' ? 'spin' : raw.type, part: raw.part, axis: 'y', speed: 120 });
    const read = keeps => {
        const sandbox = { console, Math, JSON, Reactor3D: { readModelAnimationRules: reader(keeps) } };
        vm.createContext(sandbox);
        vm.runInContext(source, sandbox, { filename: 'reactor_3d_vehicles.js' });
        return sandbox.Reactor3D.readModelAnimationRules({ animations: [{ name: 'own', type: 'bob', part: '' }], vehicle: block });
    };
    // An engine from before the seam: the sidecar's own rule and nothing else.
    assert.deepEqual(Array.from(read(false), rule => rule.name), ['own']);
    // One that keeps a rule's own axis, its radius and the drive type: the wheel's and the control's follow.
    const rules = read(true);
    assert.deepEqual(Array.from(rules, rule => [rule.name, rule.type]), [['own', 'bob'], ['vehicle-wheel-0', 'spin'], ['vehicle-control-0', 'drive']]);
    // Each of the block's rules is marked as the block's; the sidecar's own is not.
    assert.deepEqual(Array.from(rules, rule => !!rule.rrVehicle), [false, true, true]);
});

test('the table of kinds: every row, its medium and its switches', () => {
    assert.deepEqual(Object.keys(V.KINDS), ['motorcycle', 'tank', 'airship', 'shuttle', 'car', 'boat', 'hover']);
    const row = name => { const k = V.KINDS[name]; return [k.arrives, k.medium, k.turnsInPlace, k.leans, k.walks, k.size, k.rider]; };
    assert.deepEqual(row('motorcycle'), ['V1', 'ground', false, true, true, 3.5, 'seat']);
    assert.deepEqual(row('tank'), ['V2', 'ground', true, false, false, 12, 'inside']);
    assert.deepEqual(row('airship'), ['V3', 'air', true, false, false, 12, 'inside']);
    assert.deepEqual(row('shuttle'), ['V3', 'air', true, false, false, 9, 'inside']);
    assert.deepEqual(row('car'), ['Later', 'ground', false, false, false, 5, 'seat']);
    assert.deepEqual(row('boat'), ['Later', 'water', false, false, false, 6, 'seat']);
    assert.deepEqual(row('hover'), ['Later', 'ground', true, false, false, 4, 'seat']);
    // Only the motorcycle is walked round at a standstill, and only it is ridden in this version.
    assert.deepEqual(Object.keys(V.KINDS).filter(name => V.KINDS[name].walks), ['motorcycle']);
    assert.deepEqual(plain(V.PLAYED), Object.keys(V.KINDS));
});

test('the motorcycle row, number by number', () => {
    const k = V.KINDS.motorcycle;
    assert.deepEqual(plain(k.handling), { speed: 20, toTopSpeed: 3, turnCircle: 3, turnRate: 150, turnInPlace: 0, brake: 0.67, coast: 2.5,
        reverse: 3, lean: 40, jump: 0.75, step: 0.75, wade: 0.45, grip: 32 });
    assert.deepEqual(plain(k.body), { height: 2.6, radius: 0.45 });
    assert.deepEqual([k.posture, k.stance, k.encounters, k.prompt, k.leave], ['astride', 'ride', 'none', 'ride', 'getOff']);
    assert.deepEqual(plain(k.camera), { speedDistance: 35, speedFov: 11, lookAhead: 3, minDistance: 0 });
    // A kind names its sounds: none is silent by default.
    for (const slot of ['engine', 'start', 'stop', 'bump', 'land']) assert.ok(k.sounds[slot] && k.sounds[slot].name, slot);
    assert.deepEqual(plain(k.sounds.engineRate), [0.6, 1.5]);
});

test('the other rows: speed, turning, words and the least camera distance', () => {
    const pick = name => { const k = V.KINDS[name], h = k.handling; return [h.speed, h.toTopSpeed, h.turnCircle, h.turnRate, h.turnInPlace, h.brake, h.coast, h.reverse, h.jump, k.prompt, k.leave, k.camera.minDistance]; };
    assert.deepEqual(pick('tank'), [9, 3, 0, 50, 50, 0.4, 1, 4, 0, 'drive', 'getOut', 13]);
    assert.deepEqual(pick('airship'), [14, 4, 0, 60, 60, 2, 4, 3, 0, 'board', 'getOut', 16]);
    assert.deepEqual(pick('shuttle'), [22, 2, 0, 55, 80, 1, 2.9, 4, 0, 'fly', 'getOut', 14]);
    assert.deepEqual(pick('car'), [16, 3.5, 5, 110, 0, 0.6, 2.3, 5, 0, 'drive', 'getOut', 0]);
    assert.deepEqual(pick('boat'), [10, 4, 6, 70, 0, 1.7, 4, 2, 0, 'board', 'getOff', 10]);
    assert.deepEqual(pick('hover'), [16, 3, 4, 120, 30, 1.1, 3.2, 4, 0, 'ride', 'getOff', 0]);
    assert.equal(V.KINDS.boat.encounters, 'normal');
    assert.deepEqual([V.KINDS.tank.handling.step, V.KINDS.tank.handling.wade], [1, 0.9]);
    // The lean each shows at its grip limit: four wheels roll 4 degrees out of the turn, tracks show none.
    assert.deepEqual(['tank', 'airship', 'shuttle', 'car', 'boat', 'hover'].map(name => V.KINDS[name].handling.lean), [0, 10, 35, -4, 6, 15]);
});

test('a kind named like something every object has is an unknown kind: nothing throws and the list still loads', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'isPrototypeOf']) {
        const record = JSON.parse(`{ "id": 1, "kind": "${name}" }`);
        const type = V.typeOf(record);
        assert.equal(type.kind, 'motorcycle', name);
        assert.equal(type.handling.speed, 20, name);
        assert.deepEqual(plain(V.typeNotes(record)).filter(note => note.key === 'unknownKind'), [{ key: 'unknownKind', level: 'fix', args: { kind: name } }], name);
        // One such record does not take the list down.
        const types = V.types(JSON.parse(`[null, { "id": 1, "kind": "${name}" }, { "id": 2, "kind": "tank" }]`));
        assert.deepEqual([types[1].kind, types[2].kind], ['motorcycle', 'tank'], name);
        // The block's readers take a kind's name too.
        const box = { size: [2, 1, 1] };
        assert.equal(V.read(null, box, name).kind, 'motorcycle', name);
        assert.equal(V.read(null, box, name).seats.length, 1, name);
        assert.equal(V.guess(box, name, null, null).seats.length, 1, name);
        assert.equal(V.findFront(box, name, null), '+x', name);
    }
});

test('a kind that is written and is not a name is a motorcycle, and the validator is told what was written', () => {
    for (const [written, said] of [[5, '5'], [true, 'true'], [null, 'null'], [['motorcycle'], '["motorcycle"]'], [{}, '{}'], ['', '']]) {
        const record = { kind: written };
        assert.equal(V.typeOf(record).kind, 'motorcycle', said);
        assert.deepEqual(plain(V.typeNotes(record)).filter(note => note.key === 'unknownKind'), [{ key: 'unknownKind', level: 'fix', args: { kind: said } }], said);
    }
});

test('typeOf({ kind: "motorcycle" }) returns every field filled', () => {
    const type = V.typeOf({ kind: 'motorcycle' });
    assert.deepEqual(Object.keys(type).sort(), ['arrives', 'bgm', 'body', 'camera', 'encounters', 'flight', 'passability', 'handling', 'id', 'k', 'kind', 'leans', 'leaveTerm', 'medium',
        'model', 'name', 'note', 'played', 'posture', 'prompt', 'promptTerm', 'rider', 'sheet', 'sounds', 'stance', 'turnsInPlace', 'walks'].sort());
    assert.deepEqual(plain(type.handling), plain(V.KINDS.motorcycle.handling));
    assert.deepEqual(plain(type.body), { height: 2.6, radius: 0.45 });
    assert.deepEqual(plain(type.camera), { speedDistance: 35, speedFov: 11, lookAhead: 3, minDistance: 0 });
    assert.deepEqual(plain(type.sheet), { characterName: '', characterIndex: 0 });
    assert.deepEqual([type.id, type.name, type.note, type.prompt, type.kind, type.rider, type.encounters, type.bgm, type.model],
        [0, '', '', '', 'motorcycle', 'seat', 'none', null, null]);
    assert.deepEqual([type.medium, type.turnsInPlace, type.leans, type.walks, type.played, type.arrives], ['ground', false, true, true, true, 'V1']);
    assert.deepEqual([type.promptTerm, type.leaveTerm, type.posture, type.stance], ['ride', 'getOff', 'astride', 'ride']);
    assert.deepEqual(plain(type.sounds), { engine: { name: 'drone-01', volume: 90, pitch: 100 }, start: { name: 'powerup-01', volume: 90, pitch: 100 },
        stop: { name: 'equip-01', volume: 90, pitch: 100 }, bump: { name: 'hit-01', volume: 90, pitch: 100 }, land: { name: 'hit-02', volume: 90, pitch: 100 },
        scrape: null, skid: null, idle:null, accelerate:null, slowdown:null, engineRate: [0.6, 1.5] });
    // What the step reads, worked out once: tiles, seconds, radians.
    assert.equal(type.k.radius, 1.5);
    assert.ok(Math.abs(type.k.launch - 2.303 * 20 / 3) < 1e-9);
    assert.ok(Math.abs(type.k.brakeA - 20 / 0.67) < 1e-9 && Math.abs(type.k.coastA - 8) < 1e-9);
    assert.ok(Math.abs(type.k.turnRate - 150 * Math.PI / 180) < 1e-12);
    assert.ok(Math.abs(type.k.corner - 12.2) < 0.05, 'the cornering speed is 12.2 tiles a second');
    assert.ok(Math.abs(type.k.walkRate - 120 * Math.PI / 180) < 1e-12 && Math.abs(type.k.leanRad - 40 * Math.PI / 180) < 1e-12);
});

test('an unknown kind is a motorcycle, with a line for the validator', () => {
    const record = { kind: 'hoverboard', name: 'Board' };
    const type = V.typeOf(record);
    assert.equal(type.kind, 'motorcycle');
    assert.equal(type.handling.speed, 20);
    const notes = plain(V.typeNotes(record));
    assert.deepEqual(notes.filter(note => note.key === 'unknownKind'), [{ key: 'unknownKind', level: 'fix', args: { kind: 'hoverboard' } }]);
    // A known kind gets none.
    assert.equal(V.typeNotes({ kind: 'motorcycle' }).some(note => note.key === 'unknownKind'), false);
    // No kind at all is the motorcycle too, and that is not a mistake.
    assert.equal(V.typeOf({ name: 'x' }).kind, 'motorcycle');
    assert.equal(V.typeNotes({ name: 'x' }).some(note => note.key === 'unknownKind'), false);
});

test("a record's own number beats the kind's, and the rest stay the kind's", () => {
    const type = V.typeOf({ kind: 'motorcycle', handling: { speed: 12, lean: 25 }, body: { radius: 0.6 }, camera: { lookAhead: 5 }, rider: 'inside', encounters: 'half' });
    assert.deepEqual([type.handling.speed, type.handling.lean, type.handling.toTopSpeed, type.handling.turnCircle], [12, 25, 3, 3]);
    assert.deepEqual([type.body.radius, type.body.height, type.camera.lookAhead, type.camera.speedFov], [0.6, 2.6, 5, 11]);
    assert.deepEqual([type.rider, type.encounters], ['inside', 'half']);
    // The derived numbers follow the record's.
    assert.ok(Math.abs(type.k.launch - 2.303 * 12 / 3) < 1e-9 && Math.abs(type.k.leanRad - 25 * Math.PI / 180) < 1e-12);
    // Another kind's defaults are that kind's.
    const tank = V.typeOf({ kind: 'tank', handling: { speed: 7 } });
    assert.deepEqual([tank.handling.speed, tank.handling.turnInPlace, tank.turnsInPlace, tank.rider, tank.camera.minDistance, tank.model], [7, 50, true, 'inside', 13, null]);
});

test('typeOf answers the same object for the same record every time', () => {
    const record = { kind: 'motorcycle', handling: { speed: 15 } };
    const first = V.typeOf(record);
    assert.equal(V.typeOf(record), first);
    assert.equal(V.typeOf(record), first);
    // Another record with the same words is another object, equal in every field.
    const twin = V.typeOf({ kind: 'motorcycle', handling: { speed: 15 } });
    assert.notEqual(twin, first);
    assert.deepEqual(plain(twin), plain(first));
    // No record at all: the motorcycle's defaults, one shared object.
    assert.equal(V.typeOf(null), V.typeOf(undefined));
    assert.equal(V.typeOf(null).handling.speed, 20);
    assert.equal(V.typeOf('motorcycle'), V.typeOf(null));
});

test('a type and the table are read only: nothing a caller writes sticks', () => {
    const type = V.typeOf({ kind: 'motorcycle' });
    assert.ok(Object.isFrozen(type) && Object.isFrozen(type.handling) && Object.isFrozen(type.k) && Object.isFrozen(type.sounds.engine));
    assert.ok(Object.isFrozen(V.KINDS) && Object.isFrozen(V.KINDS.motorcycle) && Object.isFrozen(V.KINDS.motorcycle.handling));
    assert.throws(() => { 'use strict'; type.handling.speed = 99; }, TypeError);
    assert.equal(type.handling.speed, 20);
});

test('all presets are rideable, and a setting makes any preset scenery', () => {
    for (const name of Object.keys(V.KINDS)) {
        const record = { kind: name };
        assert.equal(V.typeOf(record).played, true, name);
        assert.equal(V.typeOf({...record,ridable:false}).played, false,name);
        assert.deepEqual(plain(V.typeNotes(record)).filter(note => note.key === 'kindLater'), []);
    }
});

test('vehicle engine states normalize BGS defaults and retain explicit legacy SE assignments',()=>{
    const type=V.typeOf({sounds:{idle:'Motor',accelerate:{name:'Rev',volume:200,pitch:10,pan:-200},slowdown:{name:'Coast',folder:'se',pan:50},engine:null}});
    assert.deepEqual(plain(type.sounds.idle),{name:'Motor',volume:90,pitch:100,folder:'bgs'});
    assert.deepEqual(plain(type.sounds.accelerate),{name:'Rev',volume:100,pitch:50,folder:'bgs',pan:-100});
    assert.equal(type.sounds.slowdown.folder,'se');assert.equal(type.sounds.slowdown.pan,50);
});

test('stock vehicle extensions add only explicitly assigned sounds and refresh after edits',()=>{
    const record={kind:'boat',sounds:{idle:'Boat'}};
    const type=V.stockTypeOf(record);assert.equal(V.stockTypeOf(record),type);
    for(const slot of ['engine','start','stop','bump','land','scrape','skid'])assert.equal(type.sounds[slot],null,slot);
    assert.equal(type.sounds.idle.folder,'bgs');record.sounds.idle='Wake';V.forgetType(record);
    assert.equal(V.stockTypeOf(record).sounds.idle.name,'Wake');assert.equal(V.stockTypeOf(null),null);
});
