'use strict';
// The pure helpers of a vehicle on a map and in its files (src/event/VehicleSetup.js): the event a click makes
// and place-vehicle.cjs writes, the row as the game reads it, the look rule's model, the Vehicle row's value,
// and the three writers (the model's block, a carved part, a type record).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const editorRoot = path.resolve(__dirname, '..');
const S = require('../src/event/VehicleSetup.js');
const RRJson = require('../src/utils/JsonFiles.js');

const plain = value => JSON.parse(JSON.stringify(value));
/** A method of a class in the editor's source, as text. */
function methodOf(file, name, indent = '    ') {
    const source = fs.readFileSync(path.join(editorRoot, 'src', file), 'utf8');
    const start = source.indexOf(`${indent}${name}(`);
    assert.ok(start >= 0, `${file} has ${name}`);
    return source.slice(start, source.indexOf(`\n${indent}}\n`, start) + indent.length + 2);
}

//-----------------------------------------------------------------------------
// The event.

test('vehicleEvent makes the event the editor makes: one empty page, Same as Characters, Action Button, no picture', () => {
    const Manager = new Function(`return class { ${methodOf('EventManager.js', 'makeDefaultEventPage')} }`)();
    const made = S.vehicleEvent(27, 28, 3, { type: 1, yaw: 180, name: 'Motorcycle' });
    assert.deepEqual(Object.keys(made), ['id', 'name', 'note', 'pages', 'x', 'y', 'rrVehicle']);
    assert.deepEqual([made.id, made.name, made.note, made.x, made.y, made.pages.length], [27, 'Motorcycle', '', 28, 3, 1]);
    assert.deepEqual(made.pages[0], new Manager().makeDefaultEventPage({ priorityType: 1, trigger: 0 }), 'the page is the editor\'s own new page');
    assert.equal(JSON.stringify(S.defaultPage()), JSON.stringify(new Manager().makeDefaultEventPage()), 'key for key, in the same order');
    assert.deepEqual(made.pages[0].image, { tileId: 0, characterName: '', direction: 2, pattern: 0, characterIndex: 0 }, 'no picture');
    assert.deepEqual(made.pages[0].list, [{ code: 0, indent: 0, parameters: [] }], 'no commands');
    assert.deepEqual(made.rrVehicle, { type: 1, yaw: 180 });
});

test('the row holds only what says something, and the page faces the nearest of four', () => {
    assert.deepEqual(S.vehicleEvent(1, 0, 0, { type: 2 }).rrVehicle, { type: 2 }, 'no facing given: the event\'s own');
    assert.equal(S.vehicleEvent(1, 0, 0, { type: 2 }).name, 'Vehicle');
    assert.deepEqual(S.vehicleEvent(1, 0, 0, { type: 2, yaw: 90, board: 'ok', key: '' }).rrVehicle, { type: 2, yaw: 90 }, 'OK boarding and no name are the defaults: not written');
    assert.deepEqual(S.vehicleEvent(1, 0, 0, { type: 2, yaw: 450.5, board: 'command', key: ' bike ' }).rrVehicle, { type: 2, yaw: 90.5, board: 'command', key: 'bike' });
    assert.deepEqual(Object.keys(S.vehicleEvent(1, 0, 0, { key: 'bike', board: 'command', yaw: 0, type: 3 }).rrVehicle), ['type', 'yaw', 'board', 'key'], 'one order whatever was given first');
    assert.deepEqual([0, 45, 90, 135, 180, 225, 270, 315, -90, 360].map(yaw => S.vehicleEvent(1, 0, 0, { type: 1, yaw }).pages[0].image.direction),
        [8, 6, 6, 2, 2, 4, 4, 8, 4, 8]);
    assert.equal(S.vehicleEvent(1, 0, 0, { type: 1, yaw: 360 }).rrVehicle.yaw, 0, 'a full turn is north');
    assert.equal(S.vehicleEvent(1, 0, 0, { type: 1, yaw: -90 }).rrVehicle.yaw, 270);
});

test('facings are degrees, 0 north, clockwise', () => {
    assert.deepEqual([8, 9, 6, 3, 2, 1, 4, 7].map(S.yawOfDirection), [0, 45, 90, 135, 180, 225, 270, 315]);
    assert.deepEqual([0, 44, 46, 180, 269, 315, 359].map(S.directionOfYaw), [8, 8, 6, 2, 4, 8, 8]);
    assert.deepEqual([0, 45, 90, 135, 180, 225, 270, 315, 337, 338].map(S.dir8OfYaw), [8, 9, 6, 3, 2, 1, 4, 7, 7, 8]);
    assert.deepEqual(S.FACES, { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 });
    assert.deepEqual([S.degrees(''), S.degrees(null), S.degrees('x'), S.degrees('37'), S.degrees(359.9996)], [null, null, null, 37, 0]);
    assert.deepEqual([S.faceWord(180), S.faceWord(50), S.faceWord(350)], ['south', 'north-east', 'north']);
});

test('vehicleOf reads the row as the game does', () => {
    assert.equal(S.vehicleOf(null), null);
    assert.equal(S.vehicleOf({ id: 1, pages: [] }), null, 'an ordinary event');
    for (const type of [0, -1, 0.5, 'x', null, undefined]) assert.equal(S.vehicleOf({ rrVehicle: { type } }), null, `type ${type} is no type`);
    assert.deepEqual(['1', 2.9].map(type => S.vehicleOf({ rrVehicle: { type } }).type), [1, 2], 'a type is read as the game reads it: the whole number in it');
    assert.equal(S.vehicleOf({ rrVehicle: [1] }), null);
    assert.deepEqual(S.vehicleOf({ rrVehicle: { type: 1 } }), { type: 1, yaw: 180, board: 'ok', key: '' }, 'no page: south');
    assert.deepEqual(S.vehicleOf(S.vehicleEvent(1, 0, 0, { type: 1, yaw: 37, key: 'bike', board: 'command' })), { type: 1, yaw: 37, board: 'command', key: 'bike' });
    const faced = dir => S.vehicleOf({ rrVehicle: { type: 4 }, pages: [{ image: { direction: dir } }] }).yaw;
    assert.deepEqual([2, 4, 6, 8].map(faced), [180, 270, 90, 0], 'no yaw on the row: the event\'s own facing');
    assert.equal(S.vehicleOf({ rrVehicle: { type: 4, yaw: 'east' }, pages: [{ image: { direction: 6 } }] }).yaw, 90, 'a yaw that is no number is no yaw');
    assert.equal(S.vehicleOf({ rrVehicle: { type: 4, board: 'never' } }).board, 'ok');
});

test('modelOf is the look rule\'s second step: the type\'s model, whole', () => {
    const types = [null,
        { id: 1, name: 'Motorcycle', kind: 'motorcycle', model: { name: 'Vehicles/kawashaki_ninja_h2' } },
        { id: 2, name: 'Shuttle', kind: 'shuttle', model: { name: 'Vehicles/Sci-Fi_Vehicle', file: 'SciFi_Vehicle22', size: 7, scale: 1.5, variant: 'red', yaw: 90 } },
        { id: 3, name: 'Ghost', kind: 'motorcycle' },
        { id: 4, name: 'Odd', kind: 'unicycle', model: { name: 'Vehicles/odd', ext: '.obj' } }];
    const kinds = { motorcycle: { size: 3.5 }, shuttle: { size: 9 } };
    const event = type => ({ id: 5, rrVehicle: { type, yaw: 90 }, pages: [] });
    assert.deepEqual(S.modelOf(event(1), types, kinds), { name: 'Vehicles/kawashaki_ninja_h2', file: 'kawashaki_ninja_h2', ext: '.glb', size: 3.5 }, 'the file is the last part of the name; the size the kind\'s');
    assert.deepEqual(S.modelOf(event(2), types, kinds), { name: 'Vehicles/Sci-Fi_Vehicle', file: 'SciFi_Vehicle22', ext: '.glb', size: 7, scale: 1.5, variant: 'red' }, 'the record\'s own file and size win; no yaw is taken from a type');
    assert.deepEqual(S.modelOf(event(4), types, kinds), { name: 'Vehicles/odd', file: 'odd', ext: '.obj', size: 3.5 }, 'a kind the game does not have is a motorcycle');
    assert.equal(S.modelOf(event(3), types, kinds), null, 'a type with no model');
    assert.equal(S.modelOf(event(9), types, kinds), null, 'a type the Database does not have');
    assert.equal(S.modelOf({ id: 5, pages: [] }, types, kinds), null, 'no vehicle');
    // Without a table of kinds the helper's own sizes stand in.
    assert.equal(S.typeModel(types[2] && { kind: 'shuttle', model: { name: 'a/b' } }, null).size, 9);
    // A kind is a key the table itself has: a word every object answers to is a motorcycle like any other unknown kind.
    for (const kind of ['constructor', '__proto__', 'toString']) {
        assert.deepEqual(S.typeModel({ kind, model: { name: 'Vehicles/odd' } }, kinds), { name: 'Vehicles/odd', file: 'odd', ext: '.glb', size: 3.5 }, kind);
        assert.deepEqual(S.typeModel({ kind, model: { name: 'Vehicles/odd' } }, null), { name: 'Vehicles/odd', file: 'odd', ext: '.glb', size: 3.5 }, kind);
    }
});

test('a type is the record at its place in the list: the number an event names it by', () => {
    const bare = { name: 'Motorcycle', kind: 'motorcycle', model: { name: 'Vehicles/bike' } };
    const wrong = { id: 7, name: 'Tank', kind: 'tank', model: { name: 'Vehicles/tank' } };
    const types = [null, bare, null, wrong, 'not a record', [1]];
    assert.equal(S.typeAt(types, 1), bare, 'a record with no id is the type of its place');
    assert.equal(S.typeAt(types, 3), wrong, 'a record whose id says 7 is type 3');
    assert.deepEqual([S.typeAt(types, 7), S.typeAt(types, 2), S.typeAt(types, 0), S.typeAt(types, -1), S.typeAt(types, 4), S.typeAt(types, 5), S.typeAt(types, 99), S.typeAt(null, 1), S.typeAt(types, 'x')], new Array(9).fill(null));
    assert.equal(S.typeAt(types, '3'), wrong);
    assert.equal(S.typeAt(types, 1.9), bare, 'the whole number in it, as the game reads a row');
    assert.deepEqual([S.typeIdOf(types, bare), S.typeIdOf(types, wrong), S.typeIdOf(types, {}), S.typeIdOf(null, bare)], [1, 3, 0, 0]);
    // The look rule and the row go by the same place.
    const kinds = { motorcycle: { size: 3.5 }, tank: { size: 12 } };
    assert.equal(S.modelOf({ rrVehicle: { type: 1 } }, types, kinds).name, 'Vehicles/bike');
    assert.equal(S.modelOf({ rrVehicle: { type: 3 } }, types, kinds).name, 'Vehicles/tank');
    assert.equal(S.modelOf({ rrVehicle: { type: 7 } }, types, kinds), null, 'nothing is at place 7');
    assert.deepEqual(S.rowValue(null, { type: 1 }, { types }).value, { type: 1 }, 'a record with no id can be chosen');
    assert.deepEqual(S.rowValue(null, { type: 3 }, { types }).value, { type: 3 });
    assert.deepEqual(S.rowValue(null, { type: 7 }, { types }).value, { type: 1 }, 'place 7 is empty: the first record there is');
    assert.deepEqual(S.rowValue(null, { type: 2 }, { types: [null, null, null, wrong] }).value, { type: 3 }, 'the first record, wherever the list starts');
    assert.deepEqual(S.rowValue(null, { type: 2 }, { types: [null] }), { value: null, problem: null }, 'no record at all: no vehicle');
});

test('modelOf answers what the runtime\'s typeOf answers, when the runtime is loaded', t => {
    let Vehicles = null;
    try { Vehicles = require('../build-scripts/validate-vehicles.cjs').world().Vehicles; } catch (error) { Vehicles = null; }
    if (!Vehicles) return t.skip('Reactor3D.Vehicles is not in the runtime');
    for (const record of [{ id: 1, kind: 'motorcycle', model: { name: 'Vehicles/kawashaki_ninja_h2' } }, { id: 2, kind: 'tank', model: { name: 'Vehicles/Oth97_CNO_Consul', size: 12, scale: 2 } }]) {
        const runtime = plain(Vehicles.typeOf(record).model), mine = S.typeModel(record, Vehicles.KINDS);
        assert.deepEqual(mine, runtime, `${record.kind}: the same spec`);
    }
    for (const kind of Object.keys(S.KIND_SIZE)) assert.equal(S.KIND_SIZE[kind], Vehicles.KINDS[kind].size, `${kind}: this file's stand-in size is the runtime's`);
    assert.deepEqual(Object.keys(S.KIND_SIZE).sort(), Object.keys(Vehicles.KINDS).sort());
});

//-----------------------------------------------------------------------------
// The event editor's Vehicle row.

test('rowValue: set, change, clear', () => {
    const types = [null, { id: 1, name: 'Motorcycle' }, { id: 2, name: 'Tank' }];
    assert.deepEqual(S.rowValue(null, { type: 1 }, { types }), { value: { type: 1 }, problem: null }, 'a vehicle chosen');
    assert.deepEqual(S.rowValue(null, { type: 1, yaw: 135 }, { types }).value, { type: 1, yaw: 135 });
    assert.deepEqual(S.rowValue({ type: 1, yaw: 135 }, { type: 2 }, { types }).value, { type: 2, yaw: 135 }, 'another vehicle keeps the facing');
    assert.deepEqual(S.rowValue({ type: 1, yaw: 135 }, { yaw: 180 }, { types }).value, { type: 1, yaw: 180 });
    assert.deepEqual(S.rowValue({ type: 1, yaw: 135 }, { board: 'command' }, { types }).value, { type: 1, yaw: 135, board: 'command' });
    assert.deepEqual(S.rowValue({ type: 1, board: 'command' }, { board: 'ok' }, { types }).value, { type: 1 }, 'OK boarding is the default: the key goes');
    assert.deepEqual(S.rowValue({ type: 1 }, { key: ' bike ' }, { types, taken: ['tank'] }).value, { type: 1, key: 'bike' });
    assert.deepEqual(S.rowValue({ type: 1, key: 'bike' }, { key: '' }, { types }).value, { type: 1 }, 'an emptied name goes');
    for (const none of [0, '', null]) assert.deepEqual(S.rowValue({ type: 1, yaw: 90, key: 'bike' }, { type: none }, { types }), { value: null, problem: null }, 'Not a vehicle removes the row');
    assert.deepEqual(S.rowValue(null, {}, { types }), { value: null, problem: null }, 'nothing chosen is no vehicle');
    assert.deepEqual(S.rowValue({ type: 1, visiting: true, future: 7 }, { yaw: 45 }, { types }).value, { type: 1, yaw: 45, visiting: true, future: 7 }, 'keys the row does not show are kept');
    assert.deepEqual(S.rowValue(null, { type: 9 }, { types }).value, { type: 1 }, 'a type the Database lacks: the first there is');
    assert.deepEqual(S.rowValue({ type: 2 }, { type: 9 }, { types }).value, { type: 2 }, 'or the one it had');
    assert.deepEqual(S.rowValue({ type: 1, yaw: 10 }, { yaw: '' }, { types }).value, { type: 1 }, 'no facing: the event\'s own');
});

test('rowValue: commands on the page choose the second answer, once', () => {
    const types = [null, { id: 1, name: 'Motorcycle' }];
    assert.deepEqual(S.rowValue(null, { type: 1 }, { types, commands: true }).value, { type: 1, board: 'command' }, 'a page with commands: its commands run');
    assert.deepEqual(S.rowValue(null, { type: 1 }, { types, commands: false }).value, { type: 1 });
    assert.deepEqual(S.rowValue({ type: 1 }, { yaw: 90 }, { types, commands: true }).value, { type: 1, yaw: 90 }, 'a vehicle that was set to OK stays so');
    assert.deepEqual(S.rowValue(null, { type: 1, board: 'ok' }, { types, commands: true }).value, { type: 1 }, 'an answer given wins');
});

test('rowValue: a taken or reserved name is refused with a sentence, and the rest of the change is kept', () => {
    const types = [null, { id: 1, name: 'Motorcycle' }];
    for (const word of ['this', 'ridden', 'nearest', 'This', '5:27', 'a:b']) {
        const told = S.rowValue({ type: 1, key: 'bike' }, { key: word, yaw: 90 }, { types });
        assert.deepEqual(told.value, { type: 1, yaw: 90, key: 'bike' }, `${word}: the name it had stays, the facing is taken`);
        assert.deepEqual([told.problem.key, told.problem.text], ['vehicleCheck.nameReserved', `"${word}" cannot be a vehicle's name.`]);
    }
    const taken = S.rowValue({ type: 1 }, { key: 'bike' }, { types, taken: ['tank', 'bike'] });
    assert.deepEqual(taken.value, { type: 1 });
    assert.deepEqual([taken.problem.key, taken.problem.args, taken.problem.text], ['vehicleCheck.nameTaken', { key: 'bike' }, 'Another vehicle is already named "bike".']);
    assert.equal(S.say(taken.problem, (key, args) => `${key}|${args.key}`), 'vehicleCheck.nameTaken|bike', 'said through the editor\'s translator');
    assert.equal(S.say(taken.problem), 'Another vehicle is already named "bike".');
    assert.equal(S.nameProblem('', ['']), null, 'no name is no problem');
    assert.equal(S.nameProblem('bike', ['tank']), null);
});

test('an event still called EV and digits takes its type\'s name', () => {
    assert.equal(S.nameAfter('EV027', { name: 'Motorcycle' }), 'Motorcycle');
    assert.equal(S.nameAfter('Rusty', { name: 'Motorcycle' }), null, 'a name someone gave stays');
    assert.equal(S.nameAfter('EV027', { name: '' }), null);
});

//-----------------------------------------------------------------------------
// The model's file.

const SIDECAR = `{
  "animations": [
    {"name":"animation-1","part":"Mesh_0007.rip","type":"spin","axis":"z","trigger":"moving","speed":120},
    {"name":"animation-2","part":"Mesh_0006.rip","type":"spin","axis":"z","trigger":"moving","speed":120},
    {"name":"wave","part":"Flag","type":"swing","axis":"y","trigger":"always","degrees":8,"period":90}
  ],
  "surface": {"reflect":1,"gloss":0.95,"metal":0,"tint":"#ffffff"},
  "pivots": {"Flag":[0,1,0],"Steering":[-0.6,0.8,0]},
  "landmarks": {"eyes":{"part":"","offset":[0,1,0]}},
  "custom": {"kept":true}
}
`;
const BLOCK = { forward: '-x', wheels: ['Front wheel', { part: 'Mesh_0010.rip', with: ['Mesh_0007.rip'] }], controls: [{ input: 'steer', shape: 'bars', part: 'Steering', at: [-0.644, 0.873, 0], axis: [0.41, 0.91, 0], degrees: 30, degreesAtSpeed: 7 }], seats: [{ posture: 'astride', seat: { at: [0.335, 1.019, 0] } }] };

test('mergeModel sets the vehicle block and only the named pivots; every other key is kept, in its place', () => {
    const text = S.mergeModel(SIDECAR, BLOCK, { Steering: [-0.644, 0.873, 0], 'Front wheel': [-0.912, 0.383, 0] });
    const before = JSON.parse(SIDECAR), after = JSON.parse(text);
    assert.deepEqual(Object.keys(after), ['animations', 'surface', 'pivots', 'landmarks', 'custom', 'vehicle'], 'the keys it had, in their order, then the new one');
    for (const key of ['animations', 'surface', 'landmarks', 'custom']) assert.deepEqual(after[key], before[key], `${key} is untouched`);
    assert.deepEqual(after.vehicle, BLOCK);
    assert.deepEqual(after.pivots, { Flag: [0, 1, 0], Steering: [-0.644, 0.873, 0], 'Front wheel': [-0.912, 0.383, 0] }, 'the named pivots set, the others kept');
    // A second write over the first: the block replaced, nothing else moved.
    const again = JSON.parse(S.mergeModel(text, Object.assign({}, BLOCK, { forward: '+x' }), null));
    assert.deepEqual(Object.keys(again), Object.keys(after));
    assert.equal(again.vehicle.forward, '+x');
    assert.deepEqual(again.pivots, after.pivots, 'no pivots named: none touched');
    // Leaving, removing.
    assert.equal(S.mergeModel(text, undefined, null), text, 'nothing asked: the same bytes');
    assert.equal(JSON.parse(S.mergeModel(text, null, null)).vehicle, undefined, 'null takes the block out');
    assert.deepEqual(JSON.parse(S.mergeModel(text, undefined, { Flag: null })).pivots, { Steering: [-0.644, 0.873, 0], 'Front wheel': [-0.912, 0.383, 0] }, 'a null entry takes that pivot out');
    assert.equal(JSON.parse(S.mergeModel('{"pivots":{"A":[0,0,0]}}', undefined, { A: null })).pivots, undefined, 'the last pivot gone: no empty object left');
});

test('mergeModel writes a model.json as the 3D Models page writes one, and that page\'s save keeps the block', () => {
    // The same bytes as the page's writer for the same data.
    assert.equal(S.mergeModel(SIDECAR, undefined, null), RRJson.stringify(JSON.parse(SIDECAR)) + '\n');
    assert.equal(S.mergeModel(null, BLOCK, null), RRJson.stringify({ vehicle: BLOCK }) + '\n', 'a model with no file gets one');
    assert.equal(S.mergeModel('', BLOCK, null), S.mergeModel(null, BLOCK, null));
    assert.equal(S.mergeModel('﻿' + SIDECAR, undefined, null), S.mergeModel(SIDECAR, undefined, null), 'a byte order mark is read through');
    assert.throws(() => S.mergeModel('[1, 2]', BLOCK, null), /model\.json must contain a JSON object/);
    assert.throws(() => S.mergeModel('{ not json', BLOCK, null));
    // Database > 3D Models saves over the same file from its own copies of animations, parts and pivots: the block stays.
    const body = methodOf('database/Database3DEditor.js', 'static mergeSidecar').replace(/^\s*static\s+/, 'function ');
    const mergeSidecar = new Function('RRJson', `${body}\nreturn mergeSidecar;`)(RRJson);
    const written = S.mergeModel(SIDECAR, BLOCK, null);
    const saved = JSON.parse(mergeSidecar(written, JSON.parse(SIDECAR).animations, [], JSON.parse(SIDECAR).pivots, undefined, undefined, undefined, undefined));
    assert.deepEqual(saved.vehicle, BLOCK, 'a save in Database > 3D Models keeps a block written by script');
    assert.deepEqual(saved.custom, { kept: true });
});

test('mergeModel takes the Spin motions off the parts that are wheels, and nothing else', () => {
    const text = S.mergeModel(SIDECAR, BLOCK, null, { removeSpins: ['Front wheel', 'Mesh_0010.rip', 'Mesh_0007.rip'] });
    assert.deepEqual(JSON.parse(text).animations.map(rule => rule.name), ['animation-2', 'wave'], 'the rear rim\'s spin goes; the front rim is no wheel part here; a swing stays');
    assert.deepEqual(S.spinsOn(JSON.parse(SIDECAR), ['Mesh_0007.rip']).map(rule => rule.name), ['animation-1']);
    // A rule's part is a prefix: a Spin on Mesh_0007 turns Mesh_0007.rip too. A longer name does not reach a shorter part.
    const prefix = '{"animations":[{"name":"a","part":"Wheel","type":"spin"},{"name":"b","part":"Wheel10","type":"spin"},{"name":"c","part":"Wheel1","type":"pose"}]}';
    assert.deepEqual(JSON.parse(S.mergeModel(prefix, undefined, null, { removeSpins: ['Wheel1'] })).animations.map(rule => rule.name), ['b', 'c']);
    assert.deepEqual(JSON.parse(S.mergeModel(SIDECAR, undefined, null, { removeSpins: [] })).animations.length, 3);
    // As the rule engine matches a motion to a part: case does not matter, and an `exact` motion reaches only the part of that whole name.
    const cased = '{"animations":[{"name":"a","part":"mesh_0007.RIP","type":"spin"},{"name":"b","part":"Rear","type":"spin","exact":true},{"name":"c","part":"REARWHEEL","type":"spin","exact":true},{"name":"d","part":"rear","type":"spin"}]}';
    assert.deepEqual(JSON.parse(S.mergeModel(cased, undefined, null, { removeSpins: ['Mesh_0007.rip'] })).animations.map(rule => rule.name), ['b', 'c', 'd'], 'a motion written in another case turns the wheel too');
    assert.deepEqual(JSON.parse(S.mergeModel(cased, undefined, null, { removeSpins: ['RearWheel'] })).animations.map(rule => rule.name), ['a', 'b'], 'an exact motion on Rear does not reach RearWheel; one on REARWHEEL does, and so does a prefix');
    const reaches = (rule, part) => S.spinReaches(Object.assign({ type: 'spin' }, rule), part);
    assert.deepEqual([reaches({ part: 'Wheel' }, 'wheel10'), reaches({ part: 'Wheel1', exact: true }, 'Wheel10'), reaches({ part: 'wheel10', exact: true }, 'Wheel10'), reaches({ part: 'Wheel10' }, 'Wheel1'), reaches({ part: '' }, 'Wheel'), S.spinReaches({ type: 'swing', part: 'Wheel' }, 'Wheel'), S.spinReaches(null, 'Wheel')],
        [true, false, true, false, false, false, false]);
});

test('spinReaches matches a motion to a part as the game\'s rule engine does', () => {
    // The engine's own two lines, read from its source: the kept table's matcher and the per-frame one.
    const source = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_3d_models.js'), 'utf8');
    assert.ok(source.includes('if (rule.exact ? part.nameLower === rule._partLower : part.nameLower.indexOf(rule._partLower) === 0) {'), 'the kept table: the whole lowercased name for an exact rule, else a lowercased prefix');
    assert.ok(source.includes('if (action.exact ? part.nameLower === action.partLower : part.nameLower.indexOf(action.partLower) === 0) {'), 'the per-frame matcher: the same');
    const engine = (rule, name) => { const part = { nameLower: name.toLowerCase() }, asked = String(rule.part).toLowerCase(); return rule.exact === true ? part.nameLower === asked : part.nameLower.indexOf(asked) === 0; };
    for (const rule of [{ part: 'Wheel' }, { part: 'wheel', exact: true }, { part: 'WHEEL1' }, { part: 'Wheel1', exact: true }, { part: 'Mesh_0007' }, { part: 'mesh_0007.rip', exact: true }]) {
        for (const name of ['Wheel', 'Wheel1', 'wheel10', 'Mesh_0007.rip', 'MESH_0007.RIP', 'Body']) {
            assert.equal(S.spinReaches(Object.assign({ type: 'spin' }, rule), name), engine(rule, name), `${JSON.stringify(rule)} on ${name}`);
        }
    }
});

test('withPart writes a carved part in the Select tool\'s format: added, replaced, joined, removed', () => {
    const part = { name: 'Steering', pivot: [-0.644, 0.873, 0], meshes: { 22: [[0, 278]], 9: [[0, 720]] } };
    const first = JSON.parse(S.withPart(SIDECAR, part));
    assert.deepEqual(first.parts, [{ name: 'Steering', pivot: [-0.644, 0.873, 0], meshes: { 9: [[0, 720]], 22: [[0, 278]] } }], 'meshes by carve index');
    assert.deepEqual(Object.keys(first).slice(0, 5), ['animations', 'surface', 'pivots', 'landmarks', 'custom'], 'every other key kept');
    assert.deepEqual(first.custom, { kept: true });
    const second = S.withPart(JSON.stringify(first), { name: 'Front wheel', pivot: [-0.912, 0.383, 0], meshes: { 9: [[0, 720]] } });
    assert.deepEqual(JSON.parse(second).parts.map(each => each.name), ['Steering', 'Front wheel'], 'another part goes after');
    const replaced = JSON.parse(S.withPart(second, { name: 'Steering', pivot: [0, 0, 0], meshes: { 29: [[5, 10]] } }));
    assert.deepEqual(replaced.parts[0], { name: 'Steering', pivot: [0, 0, 0], meshes: { 29: [[5, 10]] } }, 'a part of that name is replaced, in its place');
    const joined = JSON.parse(S.withPart(second, { name: 'Steering', meshes: { 9: [[700, 40]], 29: [[5, 10]], 22: [[300, 5], [278, 22]] } }, { add: true }));
    assert.deepEqual(joined.parts[0], { name: 'Steering', pivot: [-0.644, 0.873, 0], meshes: { 9: [[0, 740]], 22: [[0, 305]], 29: [[5, 10]] } }, 'runs that touch or overlap are one run; the pivot it had stays');
    const removed = JSON.parse(S.withPart(second, { name: 'Steering' }, { remove: true }));
    assert.deepEqual(removed.parts.map(each => each.name), ['Front wheel']);
    assert.equal(JSON.parse(S.withPart(S.withPart(null, part), { name: 'Steering' }, { remove: true })).parts, undefined, 'the last part gone: no empty list left');
    assert.deepEqual(S.joinRuns([[0, 3], [10, 2]], [[3, 2], [11, 5], [40, 1]]), [[0, 5], [10, 6], [40, 1]]);
});

//-----------------------------------------------------------------------------
// The type list.

test('withType adds at the next free id, updates by name or by id, and keeps what an update does not carry', () => {
    const record = { name: 'Motorcycle', kind: 'motorcycle', model: { name: 'Vehicles/kawashaki_ninja_h2', file: 'kawashaki_ninja_h2' } };
    const made = S.withType(null, record);
    assert.deepEqual([made.id, made.added], [1, true]);
    assert.deepEqual(JSON.parse(made.text), [null, Object.assign({ id: 1 }, record)], 'a new list has its null first slot');
    assert.equal(made.text, RRJson.stringify(JSON.parse(made.text)), 'one record a line, as the Database writes a list');
    // Its own keys survive an update by a tool that does not carry them.
    const edited = JSON.parse(made.text);
    Object.assign(edited[1], { prompt: 'Saddle up', handling: { speed: 24 }, sounds: { engine: { name: 'vroom', volume: 80, pitch: 100 }, stop: null } });
    edited[1].model.size = 3.4;
    const again = S.withType(JSON.stringify(edited), Object.assign({}, record, { sounds: { start: { name: 'powerup-01', volume: 90, pitch: 100 } } }));
    assert.deepEqual([again.id, again.added], [1, false], 'a type of the same name is updated');
    const kept = JSON.parse(again.text)[1];
    assert.deepEqual([kept.prompt, kept.handling, kept.model.size, kept.model.file], ['Saddle up', { speed: 24 }, 3.4, 'kawashaki_ninja_h2']);
    assert.deepEqual(kept.sounds, { engine: { name: 'vroom', volume: 80, pitch: 100 }, stop: null, start: { name: 'powerup-01', volume: 90, pitch: 100 } }, 'sounds it had are kept, a silence written by hand too');
    assert.equal(JSON.parse(again.text).length, 2, 'one record');
    // Another name: the next id. An id named: that record, wherever it is.
    const tank = S.withType(again.text, { name: 'Tank', kind: 'tank', model: { name: 'Vehicles/Oth97_CNO_Consul' } });
    assert.deepEqual([tank.id, tank.added, JSON.parse(tank.text).map(each => each && each.name)], [2, true, [null, 'Motorcycle', 'Tank']]);
    const byId = S.withType(tank.text, { name: 'Dirt bike', kind: 'motorcycle', model: { name: 'Vehicles/dirt' } }, { id: 1 });
    assert.deepEqual([byId.id, byId.added, JSON.parse(byId.text)[1].name, JSON.parse(byId.text)[1].prompt], [1, false, 'Dirt bike', 'Saddle up']);
    const far = S.withType(tank.text, { name: 'Shuttle', kind: 'shuttle', model: { name: 'Vehicles/Sci-Fi_Vehicle' } }, { id: 5 });
    assert.deepEqual(JSON.parse(far.text).map(each => each && each.id), [null, 1, 2, null, null, 5], 'an id past the end leaves empty slots, as the Database does');
    const hole = S.withType(far.text, { name: 'Car', kind: 'car', model: { name: 'Vehicles/car' } });
    assert.equal(hole.id, 3, 'the next free id is the first empty slot');
    assert.throws(() => S.withType('{"a":1}', record), /must contain a list/);
    // A hand-written record with no id, or with an id that is not its place: updated where it is, and its id written to say so.
    const bare = S.withType(JSON.stringify([null, { name: 'Motorcycle', prompt: 'Ride' }]), record);
    assert.deepEqual([bare.id, bare.added, JSON.parse(bare.text).length, JSON.parse(bare.text)[1].id, JSON.parse(bare.text)[1].prompt], [1, false, 2, 1, 'Ride'], 'not added a second time at place 2');
    const wrong = S.withType(JSON.stringify([null, { id: 2, name: 'Motorcycle', prompt: 'Ride' }]), record);
    assert.deepEqual([wrong.id, wrong.added, JSON.parse(wrong.text).map(each => each && each.id), JSON.parse(wrong.text)[1].prompt], [1, false, [null, 1], 'Ride'], 'the record at place 1 is type 1');
    const second = S.withType(JSON.stringify([null, { id: 2, name: 'Motorcycle' }]), { name: 'Tank', kind: 'tank', model: { name: 'Vehicles/tank' } });
    assert.deepEqual([second.id, second.added, JSON.parse(second.text).map(each => each && each.name)], [2, true, [null, 'Motorcycle', 'Tank']], 'the next free place, whatever the ids say');
});

//-----------------------------------------------------------------------------
// The files and the tool.

test('the editor page loads the two files once, in order, and they need no page to load', () => {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    const setup = html.indexOf('<script src="src/event/VehicleSetup.js"></script>'), check = html.indexOf('<script src="src/utils/VehicleCheck.js"></script>');
    assert.ok(setup > 0 && check > setup, 'VehicleSetup.js, then VehicleCheck.js, which reads it');
    assert.equal((html.match(/src\/event\/VehicleSetup\.js/g) || []).length, 1);
    assert.equal((html.match(/src\/utils\/VehicleCheck\.js/g) || []).length, 1);
    assert.ok(html.indexOf('<script src="src/utils/JsonFiles.js"></script>') < setup, 'after the JSON writer it uses');
    assert.ok(html.indexOf('<script src="src/utils/BattleCheck.js"></script>') < check, 'after the stand test it uses');
    // A bare page: no module, no require.
    const context = {};
    vm.createContext(context);
    for (const file of ['utils/JsonFiles.js', 'event/VehicleSetup.js', 'utils/BattleCheck.js', 'utils/VehicleCheck.js']) vm.runInContext(fs.readFileSync(path.join(editorRoot, 'src', file), 'utf8'), context, { filename: file });
    assert.equal(typeof context.RRVehicles.vehicleEvent, 'function');
    assert.equal(typeof context.RRVehicleCheck.problems, 'function');
    assert.equal(context.RRVehicleCheck.problems({ types: null, maps: [] }, {}).sentence.key, 'vehicleCheck.none');
    assert.equal(context.RRVehicles.mergeModel('{"a":1}', { forward: '+x' }, null), '{\n  "a": 1,\n  "vehicle": {"forward":"+x"}\n}\n');
    // Neither file nor a tool asks for a package the packaged editor would have to carry.
    for (const file of ['src/event/VehicleSetup.js', 'src/utils/VehicleCheck.js', 'build-scripts/validate-vehicles.cjs', 'build-scripts/describe-model.cjs', 'build-scripts/make-vehicle.cjs', 'build-scripts/carve-part.cjs', 'build-scripts/place-vehicle.cjs']) {
        const text = fs.readFileSync(path.join(editorRoot, file), 'utf8');
        for (const match of text.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) assert.ok(match[1].startsWith('node:') || match[1].startsWith('./') || match[1].startsWith('../'), `${file} requires ${match[1]}`);
    }
});

/** A small project with one flat map and one vehicle type: enough for place-vehicle.cjs to write an event. */
function projectIn(folder) {
    fs.mkdirSync(path.join(folder, 'data'), { recursive: true });
    const write = (name, data) => fs.writeFileSync(path.join(folder, 'data', name), typeof data === 'string' ? data : JSON.stringify(data));
    write('System.json', { partyMembers: [], versionId: 1, startMapId: 1, startX: 0, startY: 0 });
    write('MapInfos.json', [null, { id: 1, name: 'Yard' }]);
    write('Tilesets.json', [null, { id: 1, flags: [0x10, 0, 0x0f] }]);
    write('ReactorVehicles.json', [null, { id: 1, name: 'Motorcycle', kind: 'motorcycle', model: { name: 'Vehicles/bike', size: 3.5 } }]);
    const width = 12, height = 10, data = new Array(width * height * 6).fill(0);
    for (let i = 0; i < width * height; i++) data[i] = 1;
    const map = { displayName: '', tilesetId: 1, width, height, scrollType: 0, note: '', data, events: [null, { id: 1, name: 'EV001', note: '', pages: [S.defaultPage()], x: 2, y: 2 }, null, { id: 3, name: 'EV003', note: '', pages: [S.defaultPage()], x: 9, y: 9 }] };
    require('../src/utils/DataLimits.js');
    write('Map001.json', globalThis.RRMapJson.stringify(map));
    return { folder, map };
}

test('vehicleEvent() is what place-vehicle.cjs writes, byte for byte', t => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-vehicle-event-'));
    t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    const { map } = projectIn(folder);
    const tool = path.join(editorRoot, 'build-scripts', 'place-vehicle.cjs');
    const run = args => spawnSync(process.execPath, [tool, folder, '1', ...args], { encoding: 'utf8' });
    const placed = run(['--vehicle', '1', '--at', '6,5', '--yaw', '90', '--key', 'bike']);
    assert.equal(placed.status, 0, placed.stdout + placed.stderr);
    assert.match(placed.stdout, /^placed 002 Motorcycle at \(6, 5\), facing east \(90\), named bike$/m, 'the next free id is the editor\'s: the first empty slot');
    // The whole file is the map as the editor saves it, with the helper's event in slot 2.
    const expected = plain(map);
    expected.events[2] = S.vehicleEvent(2, 6, 5, { type: 1, yaw: 90, key: 'bike', name: 'Motorcycle' });
    const text = fs.readFileSync(path.join(folder, 'data', 'Map001.json'), 'utf8');
    assert.equal(text, globalThis.RRMapJson.stringify(expected));
    assert.equal(JSON.stringify(JSON.parse(text).events[2]), JSON.stringify(S.vehicleEvent(2, 6, 5, { type: 1, yaw: 90, key: 'bike', name: 'Motorcycle' })), 'the event, byte for byte');
    assert.notEqual(JSON.parse(fs.readFileSync(path.join(folder, 'data', 'System.json'), 'utf8')).versionId, 1, 'the game is told its maps changed');
    // A second one: commands board it, another name, another facing word.
    const second = run(['--vehicle', '1', '--at', '4,7', '--face', 'nw', '--board', 'command', '--name', 'Rusty']);
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.match(second.stdout, /^placed 004 Rusty at \(4, 7\), facing north-west \(315\), boarded by a command$/m);
    assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(folder, 'data', 'Map001.json'), 'utf8')).events[4]),
        JSON.stringify(S.vehicleEvent(4, 4, 7, { type: 1, yaw: 315, board: 'command', name: 'Rusty' })));
});
