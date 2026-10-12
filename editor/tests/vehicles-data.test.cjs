'use strict';
// The type record of data/ReactorVehicles.json (runtime/reactor_3d_vehicles.js, typeOf / typeNotes / types): the
// smallest record that works, a record with every field written, what a missing file is, and what the validator
// is told about a record written by hand. The editor's page normalizes a record with this same function.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fixtures = path.join(__dirname, 'fixtures', 'vehicles');
const fixture = name => JSON.parse(fs.readFileSync(path.join(fixtures, name), 'utf8'));
const sandbox = { console, Math, JSON, Reactor3D: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', '..', 'runtime', 'reactor_3d_vehicles.js'), 'utf8'), sandbox, { filename: 'reactor_3d_vehicles.js' });
const V = sandbox.Reactor3D.Vehicles;
const plain = value => JSON.parse(JSON.stringify(value));
const notes = record => plain(V.typeNotes(record));
/** A record that is whole but for what a test adds to it. */
const rec = extra => Object.assign({ kind: 'motorcycle', model: { name: 'Bike', size: 3 } }, extra);

test('a file holding only the smallest record: it loads a model 3.5 tiles long', () => {
    const list = fixture('ReactorVehicles.smallest.json');
    assert.deepEqual(Object.keys(list[1]).sort(), ['id', 'kind', 'model', 'name']);
    const types = V.types(list);
    assert.equal(types.length, 2);
    assert.equal(types[0], null);
    const type = types[1];
    assert.deepEqual([type.id, type.name, type.kind], [1, 'Motorcycle', 'motorcycle']);
    // The file's name is written (the model's folder has a group in front), `.glb` is assumed, and with no size
    // the model is drawn at its kind's: the engine's own default would be 2 tiles.
    assert.deepEqual(plain(type.model), { name: 'Vehicles/kawashaki_ninja_h2', file: 'kawashaki_ninja_h2', ext: '.glb', size: 3.5 });
    assert.deepEqual(notes(list[1]), [{ key: 'noSize', level: 'note', args: { size: 3.5 } }]);
    // Everything else is the kind's.
    assert.deepEqual(plain(type.handling), plain(V.KINDS.motorcycle.handling));
    assert.equal(type.sounds.engine.name, 'drone-01');
    // The same list read again gives the same types.
    assert.equal(V.types(list)[1], type);
});

test('model.file absent is the last part of the name', () => {
    assert.equal(V.typeOf({ kind: 'motorcycle', model: { name: 'Vehicles/kawashaki_ninja_h2' } }).model.file, 'kawashaki_ninja_h2');
    assert.equal(V.typeOf({ kind: 'motorcycle', model: { name: 'Bike' } }).model.file, 'Bike');
    assert.equal(V.typeOf({ kind: 'shuttle', model: { name: 'Vehicles/Sci-Fi_Vehicle', file: 'SciFi_Vehicle22' } }).model.file, 'SciFi_Vehicle22');
    // The size, when the record has none, is the kind's.
    assert.equal(V.typeOf({ kind: 'tank', model: { name: 'Vehicles/Oth97_CNO_Consul' } }).model.size, 12);
    assert.equal(V.typeOf({ kind: 'shuttle', model: { name: 'Vehicles/Sci-Fi_Vehicle' } }).model.size, 9);
});

test('a record with every field written keeps every one of them', () => {
    const record = fixture('ReactorVehicles.full.json')[1];
    const type = V.typeOf(record);
    assert.deepEqual([type.id, type.name, type.note, type.kind, type.prompt, type.rider, type.encounters], [1, 'Courier', '<fast>', 'motorcycle', 'Saddle up', 'seat', 'half']);
    assert.deepEqual(plain(type.model), { name: 'Vehicles/kawashaki_ninja_h2', file: 'kawashaki_ninja_h2', ext: '.glb', size: 3.4, scale: 1, variant: 'red', offset: [0, 0, 0] });
    assert.deepEqual(plain(type.sheet), { characterName: 'Vehicle', characterIndex: 2 });
    assert.deepEqual(plain(type.handling), { speed: 24, toTopSpeed: 2.5, turnCircle: 4, turnRate: 140, turnInPlace: 0, brake: 0.5, coast: 3, reverse: 2,
        lean: 35, jump: 1, step: 0.5, wade: 0.3, grip: 30 });
    assert.deepEqual(plain(type.body), { height: 2.4, radius: 0.5 });
    assert.deepEqual(plain(type.camera), { speedDistance: 40, speedFov: 9, lookAhead: 2, minDistance: 0 });
    assert.deepEqual(plain(type.sounds.engine), { name: 'engine-a', volume: 80, pitch: 110 });
    assert.deepEqual(plain(type.sounds.engineRate), [0.7, 1.4]);
    // Null is silence, and it is kept: only an absent sound takes the kind's.
    assert.equal(type.sounds.stop, null);
    assert.deepEqual([type.sounds.scrape.name, type.sounds.skid.name], ['scrape-a', 'skid-a']);
    assert.deepEqual(plain(type.bgm), { name: 'Ride', volume: 80, pitch: 100, pan: 0 });
    assert.deepEqual(notes(record), [], 'a well-formed record has nothing to say');
});

test('the Demo type: stand-in sounds by name, size 3.5', () => {
    const list = fixture('ReactorVehicles.json');
    const type = V.types(list)[1];
    assert.equal(type.model.size, 3.5);
    assert.deepEqual(['engine', 'start', 'stop', 'bump', 'land'].map(slot => type.sounds[slot].name), ['drone-01', 'powerup-01', 'equip-01', 'hit-01', 'hit-02']);
    assert.deepEqual(notes(list[1]), []);
});

test('a missing file is an empty list and no error', () => {
    for (const absent of [null, undefined, '', 0, {}, 'not json']) assert.deepEqual(plain(V.types(absent)), [null]);
    // An empty list, a list of nothing, holes and rubbish in the list.
    assert.deepEqual(plain(V.types([])), [null]);
    assert.deepEqual(plain(V.types([null])), [null]);
    const types = V.types([null, null, 7, { kind: 'motorcycle' }]);
    assert.deepEqual([types.length, types[1], types[2], types[3].kind], [4, null, null, 'motorcycle']);
});

test('sounds are never silent by default, and a sound may be written as a name', () => {
    const type = V.typeOf(rec({ sounds: { engine: 'my-engine', bump: null } }));
    assert.deepEqual(plain(type.sounds.engine), { name: 'my-engine', volume: 90, pitch: 100 });
    assert.equal(type.sounds.bump, null);
    assert.equal(type.sounds.start.name, 'powerup-01');
    assert.deepEqual([type.sounds.scrape, type.sounds.skid], [null, null]);
    // A sound that is neither a name, an object with a name nor null is a fix line, and the kind's plays.
    const bad = rec({ sounds: { land: 7 } });
    assert.equal(V.typeOf(bad).sounds.land.name, 'hit-02');
    assert.deepEqual(notes(bad), [{ key: 'badSound', level: 'fix', args: { slot: 'land' } }]);
});

test('a key the format does not have is a fix line that says what was meant', () => {
    const record = rec({ topSpeed: 30 });
    assert.equal(V.typeOf(record).handling.speed, 20, 'the unknown key changes nothing');
    assert.deepEqual(notes(record), [{ key: 'unknownKey', level: 'fix', args: { key: 'topSpeed', meant: 'handling.speed' } }]);
    assert.deepEqual(notes(rec({ handling: { maxSpeed: 9 } })), [{ key: 'unknownKey', level: 'fix', args: { key: 'handling.maxSpeed', meant: 'handling.speed' } }]);
    assert.deepEqual(notes(rec({ fit: true })), [{ key: 'unknownKey', level: 'fix', args: { key: 'fit', meant: 'model.size' } }]);
    assert.deepEqual(notes(rec({ wibble: 1 })), [{ key: 'unknownKey', level: 'fix', args: { key: 'wibble', meant: '' } }]);
    assert.deepEqual(notes({ kind: 'motorcycle', model: { name: 'Bike', size: 3, yaw: 90 } }), [{ key: 'unknownKey', level: 'fix', args: { key: 'model.yaw', meant: '' } }]);
    assert.deepEqual(notes(rec({ sounds: { horn: 'beep' } })), [{ key: 'unknownKey', level: 'fix', args: { key: 'sounds.horn', meant: '' } }]);
});

test('keys later versions read are noted, not refused', () => {
    const record = rec({ onBoard: 3, onLeave: 4, fire: { motion: 'Fire' }, battle: 'unit' });
    assert.deepEqual(notes(record).map(note => [note.key, note.level, note.args.key]),
        [['reserved', 'note', 'onBoard'], ['reserved', 'note', 'onLeave'], ['reserved', 'note', 'fire'], ['reserved', 'note', 'battle']]);
    // `flight` belongs to the format already (the flyers read it).
    assert.deepEqual(notes(rec({ flight: {} })), []);
});

test('a number outside its range is clamped in the game and noted', () => {
    const record = rec({ handling: { speed: 80, toTopSpeed: 0.1, turnCircle: 40, jump: 5 }, body: { radius: 0 }, camera: { speedFov: 90 } });
    const type = V.typeOf(record);
    assert.deepEqual([type.handling.speed, type.handling.toTopSpeed, type.handling.turnCircle, type.handling.jump, type.body.radius, type.camera.speedFov], [30, 0.5, 16, 2, 0.1, 40]);
    assert.deepEqual(notes(record), [
        { key: 'clamped', level: 'note', args: { field: 'handling.speed', value: 80, min: 1, max: 30 } },
        { key: 'clamped', level: 'note', args: { field: 'handling.toTopSpeed', value: 0.1, min: 0.5, max: 10 } },
        { key: 'clamped', level: 'note', args: { field: 'handling.turnCircle', value: 40, min: 0, max: 16 } },
        { key: 'clamped', level: 'note', args: { field: 'handling.jump', value: 5, min: 0, max: 2 } },
        { key: 'clamped', level: 'note', args: { field: 'body.radius', value: 0, min: 0.1, max: 10 } },
        { key: 'clamped', level: 'note', args: { field: 'camera.speedFov', value: 90, min: 0, max: 40 } }
    ]);
    // The ranges the file states: 1 to 30 tiles a second, 0.5 to 10 seconds, 0 to 16 tiles, a jump of 0 to 2.
    assert.deepEqual(plain(V.RANGES.handling.speed), [1, 30]);
    assert.deepEqual(plain(V.RANGES.handling.toTopSpeed), [0.5, 10]);
    assert.deepEqual(plain(V.RANGES.handling.turnCircle), [0, 16]);
    assert.deepEqual(plain(V.RANGES.handling.jump), [0, 2]);
    // A number that is not one keeps the kind's and is a fix line.
    const worded = rec({ handling: { speed: 'fast' } });
    assert.equal(V.typeOf(worded).handling.speed, 20);
    assert.deepEqual(notes(worded), [{ key: 'notNumber', level: 'fix', args: { field: 'handling.speed' } }]);
});

test('a record that writes no id is its place in the list', () => {
    const list = [null, { name: 'a' }, { name: 'b' }, { id: 7, name: 'c' }, { id: 0, name: 'd' }, { id: 'five', name: 'e' }];
    assert.deepEqual(Array.from(V.types(list)).slice(1).map(type => type.id), [1, 2, 7, 4, 5]);
    // Asked for by itself afterwards, a record answers the same type, place and all.
    assert.equal(V.typeOf(list[2]), V.types(list)[2]);
    assert.equal(V.typeOf(list[2]).id, 2);
    // Asked for alone first, it has no place yet; the caller that knows the list says it, once.
    const record = { name: 'loose' };
    assert.equal(V.typeOf(record).id, 0);
    const placed = V.typeOf(record, 3);
    assert.equal(placed.id, 3);
    assert.equal(V.typeOf(record), placed);
    assert.equal(V.typeOf(record, 3), placed);
    assert.equal(V.typeOf(record, 9), placed, 'its place is said once');
    // An id the record writes is not replaced by where it stands.
    assert.equal(V.typeOf({ id: 7 }, 2).id, 7);
    assert.deepEqual([V.typeOf({ name: 'x' }, 0).id, V.typeOf({ name: 'x' }, -1).id, V.typeOf({ name: 'x' }, 1.5).id], [0, 0, 0]);
});

test('a size, a volume, a pitch or an engine rate outside what the game uses is held to it and noted', () => {
    const big = rec({ model: { name: 'Bike', size: 1e6 } });
    assert.equal(V.typeOf(big).model.size, 200);
    assert.deepEqual(notes(big), [{ key: 'clamped', level: 'note', args: { field: 'model.size', value: 1e6, min: 0.1, max: 200 } }]);
    const small = rec({ model: { name: 'Bike', size: 0.01 } });
    assert.equal(V.typeOf(small).model.size, 0.1);
    assert.deepEqual(notes(small).map(note => [note.key, note.args.field, note.args.value]), [['clamped', 'model.size', 0.01]]);
    const loud = rec({ sounds: { engine: { name: 'e', volume: 900, pitch: -5 }, bump: { name: 'b', volume: -1, pitch: 400 }, land: { name: 'l', volume: 100, pitch: 50 } } });
    const type = V.typeOf(loud);
    assert.deepEqual([plain(type.sounds.engine), plain(type.sounds.bump), plain(type.sounds.land)],
        [{ name: 'e', volume: 100, pitch: 50 }, { name: 'b', volume: 0, pitch: 150 }, { name: 'l', volume: 100, pitch: 50 }]);
    assert.deepEqual(notes(loud), [
        { key: 'clamped', level: 'note', args: { field: 'sounds.engine.volume', value: 900, min: 0, max: 100 } },
        { key: 'clamped', level: 'note', args: { field: 'sounds.engine.pitch', value: -5, min: 50, max: 150 } },
        { key: 'clamped', level: 'note', args: { field: 'sounds.bump.volume', value: -1, min: 0, max: 100 } },
        { key: 'clamped', level: 'note', args: { field: 'sounds.bump.pitch', value: 400, min: 50, max: 150 } }
    ]);
    const rate = rec({ sounds: { engineRate: [0.01, 9] } });
    assert.deepEqual(plain(V.typeOf(rate).sounds.engineRate), [0.1, 4]);
    assert.deepEqual(notes(rate).map(note => [note.key, note.args.field, note.args.value]), [['clamped', 'sounds.engineRate', 0.01], ['clamped', 'sounds.engineRate', 9]]);
    // A rate that is not two numbers is the kind's.
    for (const wrong of [[1], [1, 'fast'], 'fast', [0.5, 1, 2]]) assert.deepEqual(plain(V.typeOf(rec({ sounds: { engineRate: wrong } })).sounds.engineRate), [0.6, 1.5]);
    // Inside its range nothing is said.
    assert.deepEqual(notes(rec({ model: { name: 'Bike', size: 200 }, sounds: { engine: { name: 'e', volume: 0, pitch: 150 }, engineRate: [0.1, 4] } })), []);
});

test('a sheet cell, who rides, the encounters and the music: each is one of what the format allows, else the default', () => {
    const cell = index => V.typeOf(rec({ sheet: { characterName: 'Vehicle', characterIndex: index } })).sheet.characterIndex;
    assert.deepEqual([cell(0), cell(7), cell(12), cell(-3), cell(2.5), cell('3')], [0, 7, 7, 0, 0, 0]);
    assert.deepEqual(plain(V.typeOf(rec({ sheet: { characterName: 5 } })).sheet), { characterName: '', characterIndex: 0 });
    // The rider is on the seat or inside; anything else is the kind's.
    assert.deepEqual(['seat', 'inside', 'driver', 7, ''].map(rider => V.typeOf(rec({ rider })).rider), ['seat', 'inside', 'seat', 'seat', 'seat']);
    assert.deepEqual(['seat', 'driver'].map(rider => V.typeOf({ kind: 'tank', rider }).rider), ['seat', 'inside']);
    // Encounters are none, half or normal.
    assert.deepEqual(['none', 'half', 'normal', 'lots', 1].map(encounters => V.typeOf(rec({ encounters })).encounters), ['none', 'half', 'normal', 'none', 'none']);
    assert.equal(V.typeOf({ kind: 'boat', encounters: 'lots' }).encounters, 'normal');
    // Music needs a name; with one, the rest are an audio object's defaults.
    assert.deepEqual([{ volume: 50 }, { name: '' }, { name: 7 }, 'Ride', null].map(bgm => V.typeOf(rec({ bgm })).bgm), [null, null, null, null, null]);
    assert.deepEqual(plain(V.typeOf(rec({ bgm: { name: 'Ride' } })).bgm), { name: 'Ride', volume: 90, pitch: 100, pan: 0 });
    assert.deepEqual(plain(V.typeOf(rec({ bgm: { name: 'Ride', volume: 40, pitch: 80, pan: -20 } })).bgm), { name: 'Ride', volume: 40, pitch: 80, pan: -20 });
});

test('a record changed in place is read again once it is forgotten', () => {
    const record = rec({ handling: { speed: 12 } });
    const first = V.typeOf(record);
    record.handling.speed = 80;
    assert.equal(V.typeOf(record), first, 'a change in place is not seen by itself');
    assert.deepEqual(notes(record), []);
    V.forgetType(record);
    const again = V.typeOf(record);
    assert.notEqual(again, first);
    assert.equal(again.handling.speed, 30);
    assert.deepEqual(notes(record).map(note => note.key), ['clamped']);
    assert.equal(V.typeOf(record), again);
    for (const nothing of [null, undefined, 7, 'x']) V.forgetType(nothing);
});

test('a key named like something every object has is an unknown key like any other', () => {
    const record = JSON.parse('{ "kind": "motorcycle", "model": { "name": "Bike", "size": 3 }, "toString": 1, "handling": { "constructor": 2, "valueOf": 3 }, "body": { "hasOwnProperty": 4 } }');
    assert.equal(V.typeOf(record).handling.speed, 20);
    assert.deepEqual(notes(record), [
        { key: 'unknownKey', level: 'fix', args: { key: 'handling.constructor', meant: '' } },
        { key: 'unknownKey', level: 'fix', args: { key: 'handling.valueOf', meant: '' } },
        { key: 'unknownKey', level: 'fix', args: { key: 'body.hasOwnProperty', meant: '' } },
        { key: 'unknownKey', level: 'fix', args: { key: 'toString', meant: '' } }
    ]);
});

test('a record with no model is a fix line and has no look', () => {
    const record = { id: 2, name: 'Ghost', kind: 'motorcycle' };
    assert.equal(V.typeOf(record).model, null);
    assert.deepEqual(notes(record), [{ key: 'noModel', level: 'fix', args: {} }]);
    assert.equal(V.typeOf({ kind: 'motorcycle', model: { file: 'x' } }).model, null, 'a model needs its name');
});

test('nothing a type is made from is changed, and nothing invented is added', () => {
    const record = fixture('ReactorVehicles.smallest.json')[1], before = JSON.stringify(record);
    const type = V.typeOf(record);
    assert.equal(JSON.stringify(record), before);
    // No weight, health, fuel or gears; no `fit` key: fitting is something a tool does once.
    for (const never of ['fit', 'weight', 'health', 'fuel', 'gears', 'followers']) assert.equal(never in type, false, never);
});

test('the fixture project holds the Demo type and the model block in their places', () => {
    const list = JSON.parse(fs.readFileSync(path.join(fixtures, 'project', 'data', 'ReactorVehicles.json'), 'utf8'));
    assert.deepEqual(list, fixture('ReactorVehicles.json'));
    const model = JSON.parse(fs.readFileSync(path.join(fixtures, 'project', '3d', 'Vehicles', 'kawashaki_ninja_h2', 'model.json'), 'utf8'));
    assert.deepEqual(model.vehicle, fixture('ninja-vehicle.json'));
    assert.deepEqual(model.parts, fixture('ninja-parts.json').parts);
    assert.equal(V.types(list)[1].model.name, 'Vehicles/kawashaki_ninja_h2');
});
