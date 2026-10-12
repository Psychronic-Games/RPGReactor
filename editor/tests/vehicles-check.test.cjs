'use strict';
// The vehicle checker (src/utils/VehicleCheck.js): every sentence it can say, each from a project that earns it,
// the sentence a tool prints last, and the catalog's 17 locales. The first part hands the checker a small
// stand-in for the game's vehicle and rider code, so each rule is asked alone; the last part runs the game's own
// on the Demo motorcycle's fixture.
// No assertion here is handed a model, a template or a built instance as a value (they are compared here and the
// answer asserted): a failed assertion prints its values whole, and a model is a quarter of a million triangles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

// Two checks load much that the rest of this file never needs (the editor's translation tables, 4 MB of text; the
// game's own objects, once for each of five lists). Each is run in a process of its own, which is this file
// started again with ONLY set to the check's name: it then registers no test and runs that one check at its end.
// What they loaded is gone again before this file's last tests build the Demo's models.
const ONLY = process.env.RR_VEHICLE_CHECK_ONLY || '';
const test = ONLY ? Object.assign(() => {}, { after() {} }) : require('node:test');
/** One of those checks, run apart: the process's exit code and what it printed. */
const apart = name => spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { RR_VEHICLE_CHECK_ONLY: name }), encoding: 'utf8', timeout: 120000 });

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const C = require('../src/utils/VehicleCheck.js');
const S = require('../src/event/VehicleSetup.js');
const B = require('../src/utils/BattleCheck.js');

//-----------------------------------------------------------------------------
// A small project, and what the caller measures of it.

const SOUNDS = { engine: { name: 'drone-01', volume: 90, pitch: 100 }, start: { name: 'powerup-01', volume: 90, pitch: 100 }, stop: { name: 'equip-01', volume: 90, pitch: 100 },
    bump: { name: 'hit-01', volume: 90, pitch: 100 }, land: { name: 'hit-02', volume: 90, pitch: 100 } };
// A bike two units long in model space: the points a rider touches, each on its surface.
const POINTS = { seat: [0.3, 0.9, 0], handL: [-0.4, 0.8, 0.3], handR: [-0.4, 0.8, -0.3], footL: [0.25, 0.4, 0.2], footR: [0.25, 0.4, -0.2] };
const block = () => ({
    forward: '-x', stand: { lean: 10, side: 'left' }, wheels: ['Front wheel', { part: 'RearWheel', with: ['RearRim'] }],
    controls: [{ input: 'steer', shape: 'bars', part: 'Steering', at: [-0.5, 0.7, 0], axis: [0.41, 0.91, 0], degrees: 30, degreesAtSpeed: 7 }],
    seats: [{ posture: 'astride', seat: { at: POINTS.seat }, handL: { at: POINTS.handL, part: 'Steering' }, handR: { at: POINTS.handR, part: 'Steering' }, footL: { at: POINTS.footL }, footR: { at: POINTS.footR } }]
});
const record = more => Object.assign({ id: 1, name: 'Motorcycle', kind: 'motorcycle', sheet: {characterName:'Vehicle',characterIndex:0}, model: { name: 'Vehicles/bike', file: 'bike', size: 2 }, sounds: JSON.parse(JSON.stringify(SOUNDS)) }, more);
const page = more => Object.assign(S.defaultPage(), more);
const bike = (id, x, y, row = {}, more = {}) => Object.assign(S.vehicleEvent(id, x, y, Object.assign({ type: 1, yaw: 180, name: 'Motorcycle' }, row)), more);
const command = (name, args = {}, label = name) => ({ code: 357, indent: 0, parameters: ['RPGReactor', name, label, args] });
const END = { code: 0, indent: 0, parameters: [] };
// Tile 1 is open ground, tile 2 a wall nobody walks onto.
const tilesets = [null, { id: 1, flags: [0x10, 0, 0x0f] }];

function mapOf(id, events, more = {}, walls = []) {
    // Wide enough that a motorcycle takes ten seconds to cross it.
    const width = more.width || 200, height = more.height || 160, data = new Array(width * height * 6).fill(0);
    for (let i = 0; i < width * height; i++) data[i] = 1;
    for (const [x, y] of walls) data[y * width + x] = 2;
    const list = [null];
    for (const event of events) list[event.id] = event;
    return Object.assign({ id, width, height, tilesetId: 1, scrollType: 0, note: '<3d>', data, events: list, reactor3d: { version: 1, mode: '3d', width, height } }, more);
}
/** A flat 2D map: no `<3d>` note, no sidecar. */
const flat = (id, events, more = {}, walls = []) => { const map = mapOf(id, events, Object.assign({ note: '' }, more), walls); delete map.reactor3d; return map; };

/** A project with one type, its model's block, and one bike on a 3D map: nothing to say about it. */
function project(more = {}) {
    return Object.assign({
        system: { partyMembers: [1] }, actors: [null, { id: 1, name: 'Ren' }, { id: 2, name: 'Mira' }], tilesets,
        bindings: { actors: { 1: { character: { name: 'Actors/Ren' } } } }, mapInfos: [null, { id: 1, name: 'Yard' }, { id: 2, name: 'Road' }], commonEvents: [null],
        types: [null, record()], maps: [mapOf(1, [bike(1, 10, 10)])], models: { 'Vehicles/bike': { vehicle: block() } }, plugins: [], unreadable: []
    }, more);
}

// The game's vehicle code, in small: the kinds, a record's numbers held to their ranges, a model's block read
// (a seat guessed from the box where the file has none).
const kindRow = (size, speed, arrives, rider, medium) => ({ size, arrives, rider, medium, handling: { speed, toTopSpeed: 3, turnCircle: 3, jump: 0.75 }, sounds: SOUNDS });
const Vehicles = {
    KINDS: { motorcycle: kindRow(3.5, 20, 'V1', 'seat', 'ground'), tank: kindRow(12, 9, 'V2', 'inside', 'ground'), airship: kindRow(12, 14, 'V3', 'inside', 'air'),
        shuttle: kindRow(9, 22, 'V3', 'inside', 'air'), car: kindRow(5, 16, 'Later', 'seat', 'ground'), boat: kindRow(6, 10, 'Later', 'seat', 'water'), hover: kindRow(4, 16, 'Later', 'seat', 'ground') },
    PLAYED: ['motorcycle'],
    typeOf(source) {
        const kind = Vehicles.KINDS[source.kind] || Vehicles.KINDS.motorcycle, ranges = { speed: [1, 30], toTopSpeed: [0.5, 10], turnCircle: [0, 16], jump: [0, 2] };
        const handling = Object.assign({}, kind.handling);
        for (const key of Object.keys(handling)) {
            const value = source.handling && source.handling[key];
            if (typeof value === 'number') handling[key] = Math.max(ranges[key][0], Math.min(ranges[key][1], value));
        }
        const model = source.model && source.model.name ? Object.assign({ name: source.model.name, file: source.model.file || source.model.name.split('/').pop(), ext: source.model.ext || '.glb', size: source.model.size > 0 ? source.model.size : kind.size }, source.model.scale ? { scale: source.model.scale } : {}) : null;
        return { model, handling, body: { height: 2.6, radius: 0.45 }, camera: {} };
    },
    read(json, box) {
        const raw = json && json.vehicle && typeof json.vehicle === 'object' ? json.vehicle : null;
        const f = C.frontOf(raw && raw.forward) || [1, 0, 0];
        const out = { forward: (raw && raw.forward) || '+x', f, wheels: [], controls: raw && Array.isArray(raw.controls) ? raw.controls : [], seats: [] };
        for (const wheel of (raw && Array.isArray(raw.wheels) ? raw.wheels : [])) out.wheels.push(typeof wheel === 'string' ? { part: wheel, with: [] } : wheel);
        if (raw && Array.isArray(raw.seats)) out.seats = raw.seats;
        else if (box) {
            // The kind's proportions along the front: the hands ahead, the seat behind.
            const L = box.max[0] - box.min[0], H = box.max[1];
            out.seats = [{ posture: 'astride', seat: { at: [-f[0] * 0.15 * L, 0.9 * H, 0] }, handL: { at: [f[0] * 0.2 * L, 0.8 * H, 0.3] }, handR: { at: [f[0] * 0.2 * L, 0.8 * H, -0.3] },
                footL: { at: [-f[0] * 0.125 * L, 0.4 * H, 0.2] }, footR: { at: [-f[0] * 0.125 * L, 0.4 * H, -0.2] } }];
            if (!(raw && Array.isArray(raw.controls))) out.controls = [{ input: 'steer', shape: 'bars', part: '', at: [f[0] * 0.2 * L, 0.8 * H, 0], axis: [0, 1, 0], degrees: 30, degreesAtSpeed: 7 }];
        }
        return out;
    }
};
// The rider's fit, in small: a rider's body carries the report the game would work out for it.
const Rider = { fit: (rider, vehicle, read, size) => Object.assign({ size }, rider.fit), fitSize: riders => ({ size: riders[0].fits || 0, limitedBy: 0 }) };
const reach = (short = 0, more = {}) => Object.assign({ part: '', surface: 0, reach: short > 0 ? 1.1 : 0.9, reachAtLock: 0.95, short, toward: [0.9, 0.4, 0], ok: !(short > 0) }, more);
const fits = more => Object.assign({ seated: true, lean: 40, hips: { over: 0.18 }, points: { seat: { at: POINTS.seat, surface: 0 }, handL: reach(), handR: reach(), footL: reach(0, { knee: 64 }), footR: reach(0, { knee: 64 }) },
    foot: { side: 'left', reachesGround: true, short: 0 }, ok: true }, more);

const FILES = ['3d/Vehicles/bike/source/bike.glb', 'audio/se/drone-01.ogg', 'audio/se/powerup-01.ogg', 'audio/se/equip-01.ogg', 'audio/se/hit-01.ogg', 'audio/se/hit-02.ogg'];
// The model as the tools measure it: its box, its part names, and how far a point is from its surface (the
// rider's five points are on it; anything else is as far as the nearest of them).
const MODEL = {
    box: { min: [-1, 0, -0.4], max: [1, 1, 0.4] }, parts: ['Body', 'Steering', 'Front wheel', 'RearWheel', 'RearRim'], object: {},
    surface: at => Math.min(...Object.values(POINTS).map(p => Math.hypot(at[0] - p[0], at[1] - p[1], at[2] - p[2])))
};
// The stand test: Battle Setup's own on a flat map. On a 3D map it needs the game's 3D world, which this part
// does not load, so the ground there is level and open everywhere (the tools' test asks the real one).
const STANDS = Object.assign({}, B, { standing: (map, x, y, options, looks) => (B.is3D(map, looks) ? { ok: true, height: 0, ground: 0 } : B.standing(map, x, y, options, looks)) });
function lookups(more = {}) {
    return Object.assign({
        Vehicles, Rider, BattleCheck: STANDS, tilesets, exists: file => FILES.includes(file), model: () => MODEL,
        rider: id => (id === 1 ? { name: 'Ren', object: { fit: fits() } } : null), body: () => [[0, 0], [0, -1]]
    }, more);
}
const told = report => report.lines.map(line => [line.level, line.text]);
const lineOf = (report, key) => report.lines.find(line => line.key === 'vehicleCheck.' + key);
const check = (data, more) => C.problems(data, lookups(more));

//-----------------------------------------------------------------------------
// The sentence.

test('a project whose vehicle is whole is ready to ride, and the notes are counted', () => {
    const ready = check(project());
    assert.deepEqual(told(ready), []);
    assert.deepEqual([ready.ok, ready.fixes, ready.notes, ready.sentence.key, ready.sentence.text], [true, 0, 0, 'vehicleCheck.ready', 'Ready to ride.']);
    assert.deepEqual(ready.types, [{ id: 1, name: 'Motorcycle', kind: 'motorcycle', model: 'Vehicles/bike', size: 2, placed: 1, speed: 20 }]);
    assert.deepEqual(ready.vehicles, [{ mapId: 1, mapName: 'Yard', eventId: 1, name: 'Motorcycle', x: 10, y: 10, type: 1, yaw: 180, board: 'ok', key: '', rides: '' }]);
    // One note, two notes: a silence written by hand, and a model nobody has given a turning part.
    const one = project();
    one.types[1].sounds.engine = null;
    const first = check(one);
    assert.deepEqual(told(first), [['note', 'Motorcycle has no engine sound.']]);
    assert.deepEqual([first.ok, first.sentence.key, first.sentence.text], [true, 'vehicleCheck.readyNote', 'Ready to ride. 1 note.']);
    one.models['Vehicles/bike'].vehicle.controls[0].part = '';
    const second = check(one);
    assert.deepEqual(told(second), [['note', 'Motorcycle has no engine sound.'], ['note', 'Motorcycle: nothing on the model turns with the steering.']]);
    assert.deepEqual([second.ok, second.notes, second.sentence.key, second.sentence.text], [true, 2, 'vehicleCheck.readyNotes', 'Ready to ride. 2 notes.']);
    // Something to fix: not ready, whatever the notes.
    one.types[1].model = null; one.types[1].sheet = null;
    const broken = check(one);
    assert.deepEqual([broken.ok, broken.fixes, broken.sentence.text], [false, 1, 'Not ready to ride. To fix: 1.']);
    assert.deepEqual([C.sentenceOf(0, 0).text, C.sentenceOf(0, 1).text, C.sentenceOf(0, 5).text, C.sentenceOf(2, 5).text], ['Ready to ride.', 'Ready to ride. 1 note.', 'Ready to ride. 5 notes.', 'Not ready to ride. To fix: 2.']);
});

test('a project with no vehicles says so, and a file that is not JSON is a line of its own', () => {
    for (const types of [null, undefined, [null], []]) {
        const none = check(project({ types, maps: [mapOf(1, [])], models: {} }));
        assert.deepEqual([none.ok, none.lines.length, none.sentence.text], [true, 0, 'No vehicles in this project.']);
    }
    const lost = check(project({ unreadable: ['data/ReactorVehicles.json', 'data/Map003.json'], types: null, maps: [], models: {} }));
    assert.deepEqual(told(lost), [['fix', 'data/ReactorVehicles.json cannot be read (not valid JSON).'], ['fix', 'data/Map003.json cannot be read (not valid JSON).']]);
    assert.deepEqual([lost.lines[0].file, lost.ok, lost.sentence.text], ['data/ReactorVehicles.json', false, 'Not ready to ride. To fix: 2.']);
});

//-----------------------------------------------------------------------------
// The type record.

test('a type with no model, a model file that is missing, a kind that is none', () => {
    const none = check(project({ types: [null, record({ model: undefined, sheet:null })] }));
    assert.deepEqual(told(none)[0], ['fix', 'Motorcycle has no model.']);
    assert.deepEqual([lineOf(none, 'noModel').file, lineOf(none, 'noModel').path], ['data/ReactorVehicles.json', '[1].model']);
    const missing = check(project({ types: [null, record({ model: { name: 'Vehicles/gone' } })] }));
    assert.deepEqual(told(missing)[0], ['fix', 'Motorcycle: the model file 3d/Vehicles/gone/source/gone.glb is missing.']);
    assert.equal(lineOf(missing, 'modelMissing').path, '[1].model.name');
    const named = check(project({ types: [null, record({ model: { name: 'Vehicles/gone', file: 'other', ext: '.obj' } })] }));
    assert.equal(lineOf(named, 'modelMissing').args.path, '3d/Vehicles/gone/source/other.obj', 'the file the record names');
    const kind = check(project({ types: [null, record({ kind: 'unicycle' })] }));
    assert.deepEqual(told(kind), [['fix', 'Motorcycle: unicycle is not a kind of vehicle.']]);
    assert.deepEqual([lineOf(kind, 'badKind').path, lineOf(kind, 'badKind').value], ['[1].kind', 'motorcycle'], 'the game treats it as a motorcycle');
    assert.deepEqual(told(check(project({ types: [null, record({ kind: undefined })] }))), [], 'no kind is a motorcycle');
    // A kind that is written and is none: an empty word, a number.
    assert.deepEqual(told(check(project({ types: [null, record({ kind: '' })] }))), [['fix', 'Motorcycle: "" is not a kind of vehicle.']]);
    assert.deepEqual(told(check(project({ types: [null, record({ kind: 7 })] }))), [['fix', 'Motorcycle: 7 is not a kind of vehicle.']]);
    assert.deepEqual(told(check(project({ types: [null, record({ kind: null })] }))), []);
    assert.deepEqual(told(check(project({ types: [null, record({ name: '' })], maps: [mapOf(1, [])] }))), [['note', 'No Vehicle 1 is on any map.']], 'a nameless type is named by its number');
});

test('a type is the record at its place in the list, as the game finds it, whatever its id says', () => {
    // No `id` at all (the list index is its default): event type 1 is this record.
    const bare = record({ id: undefined });
    delete bare.id;
    const plain = check(project({ types: [null, bare] }));
    assert.deepEqual(told(plain), [], 'nothing to say: the vehicle on the map names the record by its place');
    assert.deepEqual([plain.types.map(type => [type.id, type.placed]), plain.vehicles.map(vehicle => vehicle.type)], [[[1, 1]], [1]]);
    // An `id` that says 2 on the record in place 1: type 1 is still that record, type 2 is nothing, and the id is noted.
    const two = project({ types: [null, record({ id: 2 })], maps: [mapOf(1, [bike(1, 10, 10, { type: 1 }), bike(2, 30, 10, { type: 2 })])] });
    const report = check(two);
    assert.deepEqual(told(report), [
        ['note', 'Motorcycle: "id" is 2, but it is number 1 in the list. The game goes by its place: 1.'],
        ['fix', 'Motorcycle (002) on Yard: vehicle type 2 is not in the Database.']
    ]);
    assert.deepEqual([lineOf(report, 'idDiffers').file, lineOf(report, 'idDiffers').path, lineOf(report, 'idDiffers').value, lineOf(report, 'idDiffers').typeId], ['data/ReactorVehicles.json', '[1].id', 1, 1]);
    assert.deepEqual([report.types.map(type => [type.id, type.placed]), report.vehicles.map(vehicle => [vehicle.eventId, vehicle.type])], [[[1, 1]], [[1, 1]]]);
    assert.equal(lineOf(report, 'noType').eventId, 2);
    // A hole in the list: the record in place 2 is type 2.
    const holed = check(project({ types: [null, null, record({ id: 2, name: 'Second' })], maps: [mapOf(1, [bike(1, 10, 10, { type: 2 })])] }));
    assert.deepEqual([told(holed), holed.types.map(type => type.id), lineOf(holed, 'idDiffers')], [[], [2], undefined]);
    assert.deepEqual(told(check(project({ types: [null, record({ id: '1' })] }))), [], 'an id written as text that says the same number is the same');
    // The party's names and the map's name are found the same way: by place.
    const names = check(project({ actors: [null, { id: 7, name: 'Ren' }], mapInfos: [null, { id: 9, name: 'Yard' }], system: { partyMembers: [1] } }), { rider: () => null });
    assert.deepEqual(told(names), [['note', 'Ren has no 3D skeleton: nobody is shown on the seat.']]);
    assert.equal(names.vehicles[0].mapName, 'Yard');
});

test('what the game\'s block reader cannot take is said line for line', () => {
    // The game's reader, in small: it reads on without what it cannot take and lists it in `problems`.
    const refusing = problems => Object.assign({}, Vehicles, { read: (json, box) => Object.assign(Vehicles.read(json, box), { problems, guessed: { forward: problems.some(problem => problem.key === 'badForward') } }) });
    const said = (problems, change = () => {}) => {
        const data = project();
        change(data.models['Vehicles/bike'].vehicle);
        return check(data, { Vehicles: refusing(problems) });
    };
    const front = said([{ key: 'badForward', args: {} }], block => { block.forward = '-X'; });
    assert.deepEqual(told(front), [['fix', 'Vehicles/bike: the front "-X" cannot be read. It is "+x", "-x", "+z", "-z" or three numbers.']], 'and no second line that the front is a guess');
    assert.deepEqual([lineOf(front, 'badFront').file, lineOf(front, 'badFront').path, front.ok], ['3d/Vehicles/bike/model.json', 'vehicle.forward', false]);
    assert.equal(lineOf(said([{ key: 'badForward', args: {} }], block => { block.forward = [-1, 0]; }), 'badFront').args.value, '[-1,0]');
    const point = said([{ key: 'badPoint', args: { point: 'ride.0.handL' } }], block => { block.seats[0].handL = { at: [0.1, 0.2] }; });
    assert.deepEqual(told(point), [['fix', 'Motorcycle: the left hand has no place the game can read. "at" is three numbers.']]);
    assert.deepEqual([lineOf(point, 'badPoint').path, lineOf(point, 'badPoint').args.limbKey, lineOf(point, 'badPoint').limb], ['vehicle.seats[0].handL.at', 'vehicleCheck.limb.handL', 'handL']);
    // A seat whose own point cannot be read: one line, not "no place to sit" as well.
    const seat = said([{ key: 'badPoint', args: { point: 'ride.0.seat' } }, { key: 'noSeatPoint', args: { seat: 0 } }], block => { block.seats = [{ posture: 'astride', seat: { at: 'here' } }]; });
    assert.deepEqual(told(seat).filter(line => line[0] === 'fix'), [['fix', 'Motorcycle: the seat has no place the game can read. "at" is three numbers.']]);
    const none = said([{ key: 'noSeatPoint', args: { seat: 1 } }]);
    assert.deepEqual([told(none), lineOf(none, 'noSeat').path], [[['fix', 'Motorcycle: the model has no place to sit.']], 'vehicle.seats[1].seat'], 'a second seat with no seat point');
    const control = said([{ key: 'controlNeedsAt', args: { control: 1 } }]);
    assert.deepEqual([told(control), lineOf(control, 'badControl').path], [[['fix', 'Motorcycle: vehicle.controls[1] has neither a part nor an "at". Nothing turns and the hands stay still.']], 'vehicle.controls[1]']);
    const wheel = said([{ key: 'badWheel', args: { index: 0 } }]);
    assert.deepEqual([told(wheel), lineOf(wheel, 'unread').path], [[['fix', '3d/Vehicles/bike/model.json: the game cannot read vehicle.wheels[0].']], 'vehicle.wheels[0]']);
    // A part a built model turned out not to have, and a refusal this file has no sentence for yet.
    const built = said([{ key: 'missingPart', args: { point: 'wheel.1', part: 'Hub' } }, { key: 'missingPart', args: { point: 'ride.0.footR', part: 'Peg' } },
        { key: 'missingPart', args: { point: 'control.0', part: 'Yoke' } }, { key: 'laterRule', args: {} }]);
    assert.deepEqual(told(built), [
        ['fix', 'Motorcycle: the wheel Hub is not a part of the model.'], ['fix', 'Motorcycle: the right foot is on a part the model no longer has (Peg).'],
        ['fix', 'Motorcycle: what turns (Yoke) is not a part of the model.'],
        ['fix', '3d/Vehicles/bike/model.json: the game cannot read vehicle (laterRule).']
    ]);
    assert.equal(lineOf(built, 'lostControl').path, 'vehicle.controls[0].part', 'a control whose part a built model lacks');
    // A whole key the reader left out: a list that is no list, a stand that is no object.
    const lists = said([{ key: 'badWheels', args: {} }, { key: 'badSeats', args: {} }, { key: 'badControls', args: {} }, { key: 'badTracks', args: {} }, { key: 'badStand', args: {} }]);
    assert.deepEqual(told(lists), ['wheels', 'seats', 'controls', 'tracks', 'stand'].map(key => ['fix', `3d/Vehicles/bike/model.json: the game cannot read vehicle.${key}.`]));
    assert.deepEqual(lists.lines.map(line => line.path), ['vehicle.wheels', 'vehicle.seats', 'vehicle.controls', 'vehicle.tracks', 'vehicle.stand']);
    assert.deepEqual(told(said([])), [], 'a reader with nothing to report adds nothing');
});

test('a wheel the file names that the model does not have, and a sound the game cannot read', () => {
    const data = project();
    data.models['Vehicles/bike'].vehicle.wheels = ['Front wheel', 'Nope', { part: 'RearWheel', with: ['RearRim', 'Gone'] }, { part: 'Lost' }];
    const report = check(data);
    assert.deepEqual(told(report), [
        ['fix', 'Motorcycle: the wheel Nope is not a part of the model.'], ['fix', 'Motorcycle: the wheel Gone is not a part of the model.'], ['fix', 'Motorcycle: the wheel Lost is not a part of the model.']
    ]);
    assert.deepEqual(report.lines.map(line => line.path), ['vehicle.wheels[1]', 'vehicle.wheels[2].with[1]', 'vehicle.wheels[3].part']);
    // With no model measured nobody knows its parts: nothing is said of them.
    assert.deepEqual(told(check(data, { model: () => null })).filter(line => /wheel/.test(line[1])), []);
    // What the game's reader of a record refuses and no line here says: a sound that is no sound; a refusal it learns later.
    const noted = Object.assign({}, Vehicles, { typeNotes: () => [{ key: 'badSound', level: 'fix', args: { slot: 'bump' } }, { key: 'clamped', level: 'note', args: { field: 'handling.speed' } },
        { key: 'unknownKey', level: 'fix', args: { key: 'zz' } }, { key: 'laterRule', level: 'fix', args: { field: 'flight.ceiling' } }, { key: 'laterNote', level: 'note', args: {} }] });
    const sound = check(project(), { Vehicles: noted });
    assert.deepEqual(told(sound), [['fix', 'data/ReactorVehicles.json: the game cannot read sounds.bump.'], ['fix', 'data/ReactorVehicles.json: the game cannot read flight.ceiling.']], 'what this file says in its own sentences is not said twice');
    assert.deepEqual(sound.lines.map(line => line.path), ['[1].sounds.bump', '[1].flight.ceiling']);
    // A number the game's reader held to a range outside handling, body and camera: the model's size, a sound's volume, the engine's rate.
    const held = Object.assign({}, Vehicles, { typeNotes: () => [{ key: 'clamped', level: 'note', args: { field: 'model.size', value: 500, min: 0.1, max: 200 } },
        { key: 'clamped', level: 'note', args: { field: 'sounds.engine.volume', value: 250, min: 0, max: 100 } }, { key: 'clamped', level: 'note', args: { field: 'sounds.engineRate', value: 0.01, min: 0.1, max: 4 } },
        { key: 'clamped', level: 'note', args: { field: 'handling.speed', value: 99, min: 1, max: 30 } }] });
    const clamps = check(project(), { Vehicles: held });
    assert.deepEqual(told(clamps), [['note', 'Motorcycle: model.size is 500; the game uses 200.'], ['note', 'Motorcycle: sounds.engine.volume is 250; the game uses 100.'], ['note', 'Motorcycle: sounds.engineRate is 0.01; the game uses 0.1.']],
        'handling\'s own numbers are compared with the game\'s answer above, and not said again from the note');
    assert.deepEqual(clamps.lines.map(line => [line.path, line.value]), [['[1].model.size', 200], ['[1].sounds.engine.volume', 100], ['[1].sounds.engineRate', 0.1]]);
});

test('a model with nothing to measure is said once, and no surface is asked', () => {
    const data = project();
    data.models['Vehicles/bike'].vehicle.seats[0].handL.at = [9, 9, 9];
    const flat = { box: { min: [0, 0, 0], max: [0, 0, 0] }, parts: [], object: {}, surface: () => Infinity };
    for (const model of [() => flat, () => null, () => { throw new Error('not a .glb'); }]) {
        const report = check(data, { model });
        assert.deepEqual(told(report), [['note', 'Vehicles/bike: the model could not be measured. Its points were not checked.']], 'not "the nearest surface is Infinity tiles away"');
        assert.deepEqual([lineOf(report, 'notMeasured').file, report.ok, report.sentence.text], ['3d/Vehicles/bike/model.json', true, 'Ready to ride. 1 note.']);
    }
    assert.equal(lineOf(check(data), 'holdsNothing').level, 'fix', 'measured, the same point holds nothing');
});

test('a key that is not a setting names the one that was meant', () => {
    const report = check(project({ types: [null, record({ topSpeed: 30, handling: { speed: 20, topSpeed: 22, acceleration: 2 }, model: { name: 'Vehicles/bike', size: 2, yaw: 90 }, sounds: Object.assign({ horn: 'beep' }, SOUNDS), zzyzx: 1 })] }));
    assert.deepEqual(told(report), [
        ['fix', 'data/ReactorVehicles.json: model.yaw is not a setting.'],
        ['fix', 'data/ReactorVehicles.json: sounds.horn is not a setting.'],
        ['fix', 'data/ReactorVehicles.json: topSpeed is not a setting. Did you mean handling.speed?'],
        ['fix', 'data/ReactorVehicles.json: handling.topSpeed is not a setting. Did you mean handling.speed?'],
        ['fix', 'data/ReactorVehicles.json: handling.acceleration is not a setting. Did you mean handling.toTopSpeed?'],
        ['fix', 'data/ReactorVehicles.json: zzyzx is not a setting.']
    ], 'in the order the record has them');
    assert.deepEqual(report.lines.map(line => [line.key.replace('vehicleCheck.', ''), line.file, line.path]), [
        ['notSettingPlain', 'data/ReactorVehicles.json', '[1].model.yaw'], ['notSettingPlain', 'data/ReactorVehicles.json', '[1].sounds.horn'],
        ['notSetting', 'data/ReactorVehicles.json', '[1].topSpeed'], ['notSetting', 'data/ReactorVehicles.json', '[1].handling.topSpeed'],
        ['notSetting', 'data/ReactorVehicles.json', '[1].handling.acceleration'], ['notSettingPlain', 'data/ReactorVehicles.json', '[1].zzyzx']
    ]);
    // In the model's block, a seat, a point and an event's row.
    const data = project();
    Object.assign(data.models['Vehicles/bike'].vehicle, { front: '-x', wheel: [] });
    data.models['Vehicles/bike'].vehicle.seats[0].lefthand = { at: [0, 0, 0] };
    data.models['Vehicles/bike'].vehicle.seats[0].footL = { at: POINTS.footL, position: [0, 0, 0] };
    data.maps[0].events[1].rrVehicle.angle = 90;
    assert.deepEqual(told(check(data)), [
        ['fix', '3d/Vehicles/bike/model.json: vehicle.front is not a setting. Did you mean vehicle.forward?'],
        ['fix', '3d/Vehicles/bike/model.json: vehicle.wheel is not a setting. Did you mean vehicle.wheels?'],
        ['fix', '3d/Vehicles/bike/model.json: vehicle.seats[0].footL.position is not a setting. Did you mean at?'],
        ['fix', '3d/Vehicles/bike/model.json: vehicle.seats[0].lefthand is not a setting. Did you mean handL?'],
        ['fix', 'data/Map001.json: rrVehicle.angle is not a setting. Did you mean yaw?']
    ]);
    assert.deepEqual([C.suggest('topSpeed', ['kind', 'handling.speed']), C.suggest('sped', ['handling.speed', 'kind']), C.suggest('qqq', ['handling.speed'])], ['handling.speed', 'handling.speed', '']);
});

test('a size that is not set, a number out of its range, a key a later version reads', () => {
    const report = check(project({ types: [null, record({ model: { name: 'Vehicles/bike' }, handling: { speed: 0.2, toTopSpeed: 0.1, jump: 1 }, onBoard: 3, fire: { motion: 'Fire' } })] }));
    assert.deepEqual(told(report), [
        ['note', 'Motorcycle: this version does not read onBoard.'], ['note', 'Motorcycle: this version does not read fire.'],
        ['note', 'Motorcycle: handling.speed is 0.2; the game uses 1.'], ['note', 'Motorcycle: handling.toTopSpeed is 0.1; the game uses 0.5.'],
        ['note', 'Motorcycle: no size is set; it is drawn 3.5 tiles. make-vehicle --fit fits it to the party.']
    ]);
    assert.deepEqual([lineOf(report, 'clamped').path, lineOf(report, 'clamped').value, lineOf(report, 'noSize').path, lineOf(report, 'noSize').value], ['[1].handling.speed', 1, '[1].model.size', 3.5]);
    assert.equal(report.sentence.text, 'Ready to ride. 5 notes.', 'none of them stops the ride');
    // Without the game's code the ranges this file knows stand in, and say the same.
    const alone = C.problems(project({ types: [null, record({ handling: { speed: 0.5, jump: 9 } })], models: {} }), lookups({ Vehicles: null, Rider: null, model: null }));
    assert.deepEqual(told(alone), [['note', 'Motorcycle: handling.speed is 0.5; the game uses 1.'], ['note', 'Motorcycle: handling.jump is 9; the game uses 2.']]);
    // A number written as words is read as the kind's own.
    assert.deepEqual(told(check(project({ types: [null, record({ handling: { speed: 'fast' } })] }))), [['note', 'Motorcycle: handling.speed is "fast"; the game uses 20.']]);
});

test('a kind this version does not drive yet is a note, in the kind\'s own word', () => {
    const data = project({ types: [null, record({ name: 'Consul', kind: 'tank' }), record({ id: 2, name: 'Skiff', kind: 'airship' })], maps: [mapOf(1, [bike(1, 10, 10), bike(2, 20, 10, { type: 2 })])] });
    data.models['Vehicles/bike'].vehicle.wheels = [];
    const report = check(data);
    assert.deepEqual(told(report), [['note', 'Consul is a tank: this version does not drive those yet.'], ['note', 'Consul: no wheels were found. They will not roll.'], ['note', 'Skiff is an airship: this version does not drive those yet.']],
        'a tank with no wheels listed is told; a flyer has none to roll');
    assert.deepEqual(lineOf(report, 'laterKind').args, { name: 'Consul', kind: 'a tank', kindKey: 'vehicleCheck.kind.tank' });
    assert.equal(C.say(lineOf(report, 'laterKind'), key => ({ 'vehicleCheck.kind.tank': 'un char', 'vehicleCheck.laterKind': '' })[key] || key), 'Consul is un char: this version does not drive those yet.', 'the kind\'s word goes through the translator');
});

test('a sound that is missing is to fix; a silent engine is a note', () => {
    const data = project();
    Object.assign(data.types[1].sounds, { engine: { name: 'vroom', volume: 90, pitch: 100 }, skid: 'screech' });
    data.types[1].bgm = { name: 'Rider', volume: 90, pitch: 100, pan: 0 };
    const report = check(data);
    assert.deepEqual(told(report), [['fix', 'Motorcycle: the sound audio/se/vroom.ogg is missing.'], ['fix', 'Motorcycle: the sound audio/se/screech.ogg is missing.'], ['fix', 'Motorcycle: the sound audio/bgm/Rider.ogg is missing.']]);
    assert.deepEqual(report.lines.map(line => line.path), ['[1].sounds.engine', '[1].sounds.skid', '[1].bgm']);
    // Stored in another format, or encrypted: it is there.
    const there = file => FILES.includes(file) || ['audio/se/vroom.m4a', 'audio/se/screech.ogg_', 'audio/bgm/Rider.mp3'].includes(file);
    assert.deepEqual(told(check(data, { exists: there })), []);
    // A slot the record leaves out is its kind's stock sound: missing from the project, it is said.
    const stock = project({ types: [null, record({ sounds: undefined })] });
    assert.deepEqual(told(check(stock, { exists: file => file !== 'audio/se/drone-01.ogg' && FILES.includes(file) })), [['fix', 'Motorcycle: the sound audio/se/drone-01.ogg is missing.']]);
    assert.deepEqual(C.soundsOf(stock.types[1], { Vehicles }).map(sound => sound.slot + ' ' + sound.name), ['engine drone-01', 'start powerup-01', 'stop equip-01', 'bump hit-01', 'land hit-02']);
    assert.deepEqual(C.soundsOf(record({ sounds: { engine: null, start: 'go' }, bgm: { name: 'Rider' } }), { Vehicles: null }), [{ slot: 'start', name: 'go', kind: 'se' }, { slot: 'bgm', name: 'Rider', kind: 'bgm' }]);
});

//-----------------------------------------------------------------------------
// The model's block.

test('a model with no place to sit, a point on a part that is gone, a steering part that is none', () => {
    const data = project();
    data.models['Vehicles/bike'].vehicle.seats = [];
    assert.deepEqual(told(check(data)), [['fix', 'Motorcycle: the model has no place to sit.']]);
    assert.deepEqual([lineOf(check(data), 'noSeat').file, lineOf(check(data), 'noSeat').path], ['3d/Vehicles/bike/model.json', 'vehicle.seats']);
    data.models['Vehicles/bike'].vehicle.seats = [{ posture: 'astride', handL: { at: POINTS.handL } }];
    assert.deepEqual(told(check(data))[0], ['fix', 'Motorcycle: the model has no place to sit.'], 'a seat with no seat point');
    // A model that cannot be measured and has no block: nothing can say, nothing is said.
    assert.deepEqual(told(check(project({ models: { 'Vehicles/bike': null } }), { model: () => null })).filter(line => /place to sit/.test(line[1])), []);

    const lost = project();
    lost.models['Vehicles/bike'].vehicle.seats[0].handR.part = 'Handlebars';
    lost.models['Vehicles/bike'].vehicle.seats[0].footL.part = 'Peg';
    lost.models['Vehicles/bike'].vehicle.controls[0].part = 'Yoke';
    const report = check(lost);
    assert.deepEqual(told(report), [
        ['fix', 'Motorcycle: the right hand is on a part the model no longer has (Handlebars).'],
        ['fix', 'Motorcycle: the left foot is on a part the model no longer has (Peg).'],
        ['fix', 'Motorcycle: what turns (Yoke) is not a part of the model.'],
        ['note', 'Motorcycle: nothing on the model turns with the steering.']
    ]);
    assert.deepEqual(report.lines.slice(0, 3).map(line => line.path), ['vehicle.seats[0].handR.part', 'vehicle.seats[0].footL.part', 'vehicle.controls[0].part']);
    assert.deepEqual(lineOf(report, 'lostPart').args, { part: 'Handlebars', name: 'Motorcycle', limb: 'right hand', limbKey: 'vehicleCheck.limb.handR' });
});

test('a hand, a foot or the seat further than 0.15 tile from every surface holds nothing', () => {
    const data = project();
    // The model is drawn 2 tiles long and is 2 units long: a tile a unit.
    data.models['Vehicles/bike'].vehicle.seats[0].handL.at = [-0.4, 0.8, 0.5];
    data.models['Vehicles/bike'].vehicle.seats[0].seat.at = [0.3, 1, 0];
    assert.deepEqual(told(check(data)), [['fix', 'Motorcycle: the left hand holds nothing. The nearest surface is 0.2 tiles away.']], 'the seat, a tenth of a tile off its surface, holds');
    assert.equal(lineOf(check(data), 'holdsNothing').path, 'vehicle.seats[0].handL.at');
    // The same model bound twice as big is twice as far in tiles: the seat, 0.1 units off, is now 0.2 tiles off.
    data.types[1].model.size = 4;
    assert.deepEqual(told(check(data)), [['fix', 'Motorcycle: the seat holds nothing. The nearest surface is 0.2 tiles away.'], ['fix', 'Motorcycle: the left hand holds nothing. The nearest surface is 0.4 tiles away.']]);
    data.types[1].model.size = 2;
    data.types[1].model.scale = 2;
    assert.equal(lineOf(check(data), 'holdsNothing').args.d, 0.2, 'the scale counts as the size does');
    // A rider seated backwards: the block names the tail as the front, the game guesses the points from there, and the hands find no bars.
    const backwards = project({ models: { 'Vehicles/bike': { vehicle: { forward: '+x', wheels: ['Front wheel'] } } } });
    const report = check(backwards);
    assert.deepEqual(told(report).filter(line => line[0] === 'fix'), [
        ['fix', 'Motorcycle: the seat holds nothing. The nearest surface is 0.33 tiles away.'],
        ['fix', 'Motorcycle: the left hand holds nothing. The nearest surface is 0.33 tiles away.'],
        ['fix', 'Motorcycle: the right hand holds nothing. The nearest surface is 0.33 tiles away.'],
        ['fix', 'Motorcycle: the left foot holds nothing. The nearest surface is 0.44 tiles away.'],
        ['fix', 'Motorcycle: the right foot holds nothing. The nearest surface is 0.44 tiles away.']
    ]);
    // The same guess the right way round: every point is where the bike has something to hold.
    const forwards = check(project({ models: { 'Vehicles/bike': { vehicle: { forward: '-x', wheels: ['Front wheel'] } } } }));
    assert.deepEqual(told(forwards).filter(line => line[0] === 'fix'), []);
    // A type whose party rides inside has no points to hold.
    assert.deepEqual(told(check(project({ types: [null, record({ rider: 'inside' })], models: backwards.models }))).filter(line => line[0] === 'fix'), []);
});

test('a party member who cannot reach the grips, and a foot that does not reach the ground', () => {
    const body = { name: 'Ren', object: { fit: fits({ ok: false, points: { handL: reach(0.06), handR: reach(0), footL: reach(0, { knee: 64 }), footR: reach(0.031, { toward: [0, -1, 0] }) }, foot: { side: 'left', reachesGround: false, short: 0.1 } }), fits: 1.8 } };
    const report = check(project(), { rider: () => body });
    assert.deepEqual(told(report), [
        ['fix', 'Ren: the left hand is 0.06 short of its grip. Move the grip 0.06 toward the seat (+x), or make Motorcycle 0.2 smaller.'],
        ['fix', 'Ren: the right foot is 0.03 short of its rest. Move the rest 0.03 toward the seat (-y), or make Motorcycle 0.2 smaller.'],
        ['note', 'Ren\'s foot does not reach the ground at a stop.']
    ], 'a hand holds a grip, a foot stands on a rest');
    assert.deepEqual([lineOf(report, 'short').file, lineOf(report, 'short').path, lineOf(report, 'short').args.limbKey], ['3d/Vehicles/bike/model.json', 'vehicle.seats[0].handL.at', 'vehicleCheck.limb.handL']);
    assert.deepEqual([lineOf(report, 'shortRest').level, lineOf(report, 'shortRest').path, lineOf(report, 'shortRest').args.limbKey], ['fix', 'vehicle.seats[0].footR.at', 'vehicleCheck.limb.footR']);
    // Every starting party member with a 3D body is asked; one with none is told as that.
    const two = project({ system: { partyMembers: [1, 2] } });
    assert.deepEqual(told(check(two)), [['note', 'Mira has no 3D skeleton: nobody is shown on the seat.']]);
    assert.deepEqual([lineOf(check(two), 'noSkeleton').file, lineOf(check(two), 'noSkeleton').path], ['data/Database.r3d.json', 'actors.2']);
    // A body with no skeleton to seat.
    assert.deepEqual(told(check(project(), { rider: () => ({ name: 'Ren', object: { fit: { seated: false } } }) })), [['note', 'Ren has no 3D skeleton: nobody is shown on the seat.']]);
    // With nobody measuring bodies, the Database's bindings say who has one, and the fit that was not asked is a note.
    assert.deepEqual(told(check(two, { rider: undefined, Rider: null })), [['note', 'Mira has no 3D skeleton: nobody is shown on the seat.'], ['note', 'The rider code is not loaded: whether the party reaches was not checked.']]);
    // A type whose party rides inside shows nobody anyway.
    assert.deepEqual(told(check(project({ system: { partyMembers: [2] }, types: [null, record({ rider: 'inside' })] }))), []);
});

test('a wheel that also has a Spin motion, a pivot that differs from the axle, wheels that are not there', () => {
    const data = project();
    data.models['Vehicles/bike'].animations = [{ name: 'a', part: 'Body', type: 'spin' }, { name: 'b', part: 'Rear', type: 'spin' }, { name: 'c', part: 'Front wheel', type: 'swing' }];
    const spin = check(data);
    assert.deepEqual(told(spin), [['fix', 'Motorcycle: RearWheel is a wheel and also has a Spin motion. Remove the motion.'], ['fix', 'Motorcycle: RearRim is a wheel and also has a Spin motion. Remove the motion.']], 'a motion\'s part reaches every part whose name begins with it');
    assert.deepEqual([spin.lines[0].file, spin.lines[0].path], ['3d/Vehicles/bike/model.json', 'animations[1]']);
    // As the rule engine matches a motion to a part: case does not matter, and an `exact` motion reaches only the part of that whole name.
    const cased = project();
    cased.models['Vehicles/bike'].animations = [{ name: 'a', part: 'rearwheel', type: 'spin' }, { name: 'b', part: 'Rear', type: 'spin', exact: true }, { name: 'c', part: 'FRONT WHEEL', type: 'spin', exact: true }];
    assert.deepEqual(told(check(cased)), [['fix', 'Motorcycle: Front wheel is a wheel and also has a Spin motion. Remove the motion.'], ['fix', 'Motorcycle: RearWheel is a wheel and also has a Spin motion. Remove the motion.']],
        'a motion written in another case still turns the wheel; an exact motion on Rear turns neither RearWheel nor RearRim');
    assert.deepEqual(check(cased).lines.map(line => line.path), ['animations[2]', 'animations[0]']);
    // A motion on what lies wholly inside a wheel (a carved wheel's rim is still the file's own node) turns the wheel a second time.
    const inner = project();
    inner.models['Vehicles/bike'].animations = [{ name: 'a', part: 'Body', type: 'spin' }, { name: 'rim', part: 'mesh_0006', type: 'spin' }, { name: 'tilt', part: 'Mesh_0006.rip', type: 'swing' }];
    const within = part => (part === 'Front wheel' ? ['Mesh_0006.rip', 'Mesh_0009.rip'] : []);
    const rim = check(inner, { model: () => Object.assign({}, MODEL, { within }) });
    assert.deepEqual(told(rim), [['fix', 'Motorcycle: Front wheel is a wheel and also has a Spin motion. Remove the motion.']]);
    assert.equal(rim.lines[0].path, 'animations[1]');
    assert.deepEqual(told(check(inner)), [], 'with nobody to say what lies inside a part, only a motion on the wheel\'s own name is seen');
    assert.deepEqual(told(check(inner, { model: () => Object.assign({}, MODEL, { within: () => { throw new Error('no'); } }) })), []);
    const pivots = project();
    pivots.models['Vehicles/bike'].pivots = { 'Front wheel': [-0.75, 0.3, 0], Steering: [-0.5, 0.7, 0], RearWheel: [0.7, 0.3, 0] };
    pivots.models['Vehicles/bike'].vehicle.wheels = [{ part: 'Front wheel', at: [-0.75, 0.31, 0] }, { part: 'RearWheel' }];
    assert.deepEqual(told(check(pivots)), [['note', 'Vehicles/bike: Front wheel has a pivot of its own and a vehicle axle that differ. The vehicle\'s is used.']], 'a wheel with no axle written takes the pivot; a control whose line is the pivot agrees');
    pivots.models['Vehicles/bike'].vehicle.controls[0].at = [-0.5, 0.75, 0];
    assert.equal(told(check(pivots))[1][1], 'Vehicles/bike: Steering has a pivot of its own and a vehicle axle that differ. The vehicle\'s is used.');
    const none = project();
    none.models['Vehicles/bike'].vehicle.wheels = [];
    assert.deepEqual(told(check(none)), [['note', 'Motorcycle: no wheels were found. They will not roll.']]);
    delete none.models['Vehicles/bike'].vehicle.wheels;
    assert.deepEqual(told(check(none)), [['note', 'Motorcycle: no wheels were found. They will not roll.']]);
});

test('a front nobody has confirmed, and points nobody has looked at', () => {
    // No block at all: the game guesses everything.
    assert.deepEqual(told(check(project({ models: { 'Vehicles/bike': null } }))).map(line => line[1]).filter(text => /^Vehicles\/bike/.test(text)),
        ['Vehicles/bike: nobody has confirmed which end is the front.', 'Vehicles/bike: the rider\'s points are a guess nobody has looked at.']);
    // A block a tool guessed and wrote: its front stays a guess until someone says so.
    const guessed = project();
    guessed.models['Vehicles/bike'].vehicle.guessed = ['forward', 'seats', 'wheels', 'controls'];
    assert.deepEqual(told(check(guessed)), [['note', 'Vehicles/bike: nobody has confirmed which end is the front.']]);
    assert.deepEqual([lineOf(check(guessed), 'frontGuess').file, lineOf(check(guessed), 'frontGuess').path], ['3d/Vehicles/bike/model.json', 'vehicle.forward']);
    guessed.models['Vehicles/bike'].vehicle.guessed = ['seats', 'wheels', 'controls'];
    assert.deepEqual(told(check(guessed)), [], 'confirmed: the question is gone');
    // A block that lists its seats and names no front: the game picks an end, and nobody has confirmed that either.
    const unsaid = project();
    delete unsaid.models['Vehicles/bike'].vehicle.forward;
    assert.deepEqual(told(check(unsaid)), [['note', 'Vehicles/bike: nobody has confirmed which end is the front.']]);
    // Where the game's reader says it guessed the front, that is said whatever the file looks like.
    const says = Object.assign({}, Vehicles, { read: (json, box) => Object.assign(Vehicles.read(json, box), { guessed: { forward: true }, problems: [] }) });
    assert.deepEqual(told(check(project(), { Vehicles: says })), [['note', 'Vehicles/bike: nobody has confirmed which end is the front.']]);
    // Two types on one model: the model's own lines are said once.
    const twice = project({ types: [null, record(), record({ id: 2, name: 'Dirt bike' })], models: { 'Vehicles/bike': null }, maps: [mapOf(1, [bike(1, 10, 10), bike(2, 20, 10, { type: 2 })])] });
    assert.equal(told(check(twice)).filter(line => /confirmed which end/.test(line[1])).length, 1);
});

test('the front the game finds on the model is what the line says to write; a guess in the file gets the finder\'s second look', () => {
    const template = { the: 'template' }, withTemplate = () => Object.assign({}, MODEL, { template });
    const front = report => { const line = lineOf(report, 'frontGuess') || lineOf(report, 'badFront'); return line ? [line.key.replace('vehicleCheck.', ''), line.value, line.taken] : null; };
    // The game's reader, in small: handed its own measure of a model, it looks at the model for a front the file does not name.
    const looked = [], forgot = [];
    const finding = (found, finder = found) => Object.assign({}, Vehicles, {
        boxOf: object => ({ min: MODEL.box.min, max: MODEL.box.max, of: object }),
        findFront: (box, kind, object) => { looked.push([kind, object === template]); return finder; },
        forgetShape: object => { forgot.push(object === template); },
        read(json, box) {
            const out = Vehicles.read(json, box), raw = json && json.vehicle, named = !!(raw && C.frontOf(raw.forward));
            out.guessed = { forward: !named || (Array.isArray(raw.guessed) && raw.guessed.includes('forward')) };
            out.problems = raw && raw.forward !== undefined && !named ? [{ key: 'badForward', args: {} }] : [];
            // Its own non-enumerable mark, as the game's block carries it.
            if (!named && box && box.of) { out.forward = found; out.f = C.frontOf(found); Object.defineProperty(out, 'frontFound', { value: true }); }
            return out;
        }
    });
    const unsaid = () => { const data = project(); delete data.models['Vehicles/bike'].vehicle.forward; return data; };
    // No front in the file: the game looks, and its answer is both what it takes and what to write.
    assert.deepEqual(front(check(unsaid(), { Vehicles: finding('-x'), model: withTemplate })), ['frontGuess', '-x', '-x']);
    assert.deepEqual(looked, [], 'the game found it itself: the finder is not asked a second time');
    // Without the model in hand the game's answer is not known here: the note stands, with nothing to write.
    assert.deepEqual(front(check(unsaid(), { Vehicles: finding('-x') })), ['frontGuess', undefined, undefined]);
    // A front the game cannot read: it looks the same way, and the line says what it takes meanwhile.
    const bad = project();
    bad.models['Vehicles/bike'].vehicle.forward = 'north';
    assert.deepEqual(front(check(bad, { Vehicles: finding('-z'), model: withTemplate })), ['badFront', '-z', '-z']);
    // A tool's guess the file carries: the game takes the file's word, and the finder is asked what the model shows.
    const guessed = project();
    Object.assign(guessed.models['Vehicles/bike'].vehicle, { forward: '+x', guessed: ['forward'] });
    assert.deepEqual(front(check(guessed, { Vehicles: finding('', '-x'), model: withTemplate })), ['frontGuess', '-x', '+x'], 'the file says one end, the model shows the other');
    assert.deepEqual(looked, [['motorcycle', true]], 'asked once, of the template, for the type\'s kind');
    assert.deepEqual(forgot, [true], 'and the triangles the finder read are given back');
    assert.deepEqual(front(check(guessed, { Vehicles: finding('', 'up'), model: withTemplate })), ['frontGuess', undefined, undefined], 'an answer that is no end is none');
    // A front somebody confirmed is not looked at again.
    looked.length = 0;
    assert.deepEqual([front(check(project(), { Vehicles: finding('', '+x'), model: withTemplate })), looked], [null, []]);
});

test('the game\'s reader is asked as the game asks it: the type\'s kind, its own measure of the model, a record with its place', () => {
    const template = { the: 'template' }, gameBox = { min: [-2, 0, -0.4], max: [2, 1, 0.4] }, asked = { typeOf: [], boxOf: [], read: [] };
    const spy = Object.assign({}, Vehicles, {
        typeOf(source, index) { asked.typeOf.push(index); return Vehicles.typeOf(source); },
        boxOf(object) { asked.boxOf.push(object === template); return gameBox; },
        read(json, box, kind) { asked.read.push([box === gameBox, kind]); return Vehicles.read(json, box); }
    });
    const bare = record({ kind: 'car' });
    delete bare.id;
    const data = project({ types: [null, null, bare], maps: [mapOf(1, [bike(1, 10, 10, { type: 2 })])] });
    // A hand 0.4 units from its surface: the game's box is 4 units long and the model is drawn 2 tiles, so that is 0.2 tiles.
    data.models['Vehicles/bike'].vehicle.seats[0].handL.at = [-0.4, 0.8, 0.7];
    const report = check(data, { Vehicles: spy, model: () => Object.assign({}, MODEL, { template }) });
    assert.ok(asked.typeOf.includes(2), 'the record\'s place in the list goes with it: a record that writes no id is that number');
    assert.deepEqual(asked.boxOf, [true], 'the game\'s own measure, of the template');
    assert.deepEqual(asked.read, [[true, 'car']], 'read with that box and the type\'s kind');
    assert.equal(lineOf(report, 'holdsNothing').args.d, 0.2, 'tiles by the box the game draws it by');
    // With no template the caller's own box is the one handed over, and the one the distance is scaled by.
    asked.read.length = 0;
    const plain = check(data, { Vehicles: spy });
    assert.deepEqual([asked.read, lineOf(plain, 'holdsNothing').args.d], [[[false, 'car']], 0.4]);
    // A measure that cannot be taken leaves the caller's box in its place.
    const failing = Object.assign({}, spy, { boxOf() { throw new Error('no box'); } });
    assert.equal(lineOf(check(data, { Vehicles: failing, model: () => Object.assign({}, MODEL, { template }) }), 'holdsNothing').args.d, 0.4);
});

//-----------------------------------------------------------------------------
// Vehicles on maps.

test('a vehicle whose type is not in the Database, and a name it cannot have', () => {
    const data = project({ maps: [mapOf(1, [bike(1, 10, 10, { type: 7 }), Object.assign(bike(2, 12, 10), { rrVehicle: { yaw: 90 }, name: 'EV002' }), bike(3, 14, 10, { key: 'this' }), bike(4, 16, 10, { key: '5:27' }), bike(5, 18, 10, { key: 'bike' })])] });
    const report = check(data);
    assert.deepEqual(told(report), [
        ['fix', 'Motorcycle (001) on Yard: vehicle type 7 is not in the Database.'], ['fix', 'EV002 (002) on Yard: vehicle type ? is not in the Database.'],
        ['fix', 'Motorcycle (003): this cannot be a vehicle\'s name.'], ['fix', 'Motorcycle (004): 5:27 cannot be a vehicle\'s name.']
    ]);
    assert.deepEqual(report.lines.map(line => [line.file, line.path, line.mapId, line.eventId]), [
        ['data/Map001.json', 'events[1].rrVehicle.type', 1, 1], ['data/Map001.json', 'events[2].rrVehicle.type', 1, 2],
        ['data/Map001.json', 'events[3].rrVehicle.key', 1, 3], ['data/Map001.json', 'events[4].rrVehicle.key', 1, 4]
    ]);
    assert.deepEqual(report.vehicles.map(vehicle => vehicle.eventId), [3, 4, 5], 'a vehicle the game cannot read is not listed as one');
    // A project with no types at all, and one event that says it is a vehicle.
    assert.deepEqual(told(check(project({ types: null, models: {} }))), [['fix', 'Motorcycle (001) on Yard: vehicle type 1 is not in the Database.']]);
});

test('a vehicle that stands where it does not fit says why, in Battle Setup\'s words', () => {
    // A flat map uses one tile even when the same type has a larger 3D model.
    const walled = project({ maps: [flat(1, [bike(1, 5, 5), bike(2, 9, 5), bike(3, 15, 5), { id: 4, name: 'Crate', note: '', pages: [page()], x: 15, y: 4 }], {}, [[5, 5], [9, 4]])] });
    const report = check(walled);
    assert.deepEqual(told(report).filter(line => line[0] === 'fix'), [
        ['fix', 'Motorcycle (001) on Yard stands where it does not fit.']
    ]);
    assert.deepEqual(report.lines.filter(line => line.key === 'vehicleCheck.noFit').map(line => [line.eventId, line.why, line.whyText, line.x, line.y, line.path]), [
        [1, 'tile', 'Nobody can walk onto this tile.', 5, 5, 'events[1]']
    ]);
    // Off the map, and on another event.
    const off = check(project({ maps: [flat(1, [bike(1, 999, 5), bike(2, 20, 20), { id: 3, name: 'Crate', note: '', pages: [page()], x: 20, y: 20 }])] }), { body: () => [[0, 0]] });
    assert.deepEqual(off.lines.filter(line => line.key === 'vehicleCheck.noFit').map(line => [line.eventId, line.whyText]), [[1, 'Off the map.'], [2, 'Something is already here.']]);
    // Adjacent flat sprites do not inherit their 3D model's footprint.
    const pair = check(project({ maps: [flat(1, [bike(1, 5, 6), bike(2, 5, 5)])] }));
    assert.deepEqual(pair.lines.filter(line => line.key === 'vehicleCheck.noFit').map(line => [line.eventId, line.why]), [], 'each sprite occupies its own tile');
    // Open ground and an assigned sprite are ready to ride.
    assert.deepEqual(told(check(project({ maps: [flat(1, [bike(1, 5, 5)])] }))), []);
});

test('the checker requires a sprite on flat maps and respects the Rideable setting',()=>{
    const missing=project({types:[null,record({sheet:null})],maps:[flat(1,[bike(1,5,5)])]});
    assert.equal(lineOf(check(missing),'noSprite').text,'Motorcycle on Yard needs a 2D image.');
    missing.maps[0].events[1].pages[0].image.characterName='Vehicle';
    assert.equal(check(missing).fixes,0);
    missing.types[1].ridable=false;
    assert.equal(lineOf(check(missing),'notRidable').text,'Motorcycle: Rideable is switched off.');
});

test('a map this version does not ride on makes the vehicle scenery, and says why', () => {
    const maps = [flat(1, [bike(1, 5, 5)]), mapOf(2, [bike(1, 5, 5), bike(2, 9, 5)], { scrollType: 3 }), mapOf(3, [bike(1, 5, 5)], { reactor3d: { version: 1, mode: '3d', camera: { mode: 'First Person' } } }), mapOf(4, [bike(1, 5, 5)])];
    const infos = [null, { id: 1, name: 'Yard' }, { id: 2, name: 'Ring' }, { id: 3, name: 'Cabin' }, { id: 4, name: 'Road' }];
    const report = check(project({ maps, mapInfos: infos }));
    assert.deepEqual(told(report), [
        ['note', 'Motorcycle on Ring: this map loops.'], ['note', 'Motorcycle on Cabin: this map\'s camera is first person.']
    ], 'two bikes on one map are told once; the last map rides');
    assert.deepEqual(report.vehicles.map(vehicle => [vehicle.mapId, vehicle.rides]), [[1, ''], [2, 'loopMap'], [2, 'loopMap'], [3, 'firstPersonMap'], [4, '']]);
    assert.deepEqual([C.firstPerson({ reactor3d: { camera: { mode: 'firstPerson' } } }), C.firstPerson({ reactor3d: { camera: { mode: 'fps' } } }), C.firstPerson({ reactor3d: { camera: { mode: 'thirdPerson' } } }), C.firstPerson({})], [true, true, false, false]);
    // The project's own switch: every vehicle is scenery, said once a map.
    const off = check(project({ system: { partyMembers: [1], reactorVehicles: { free: false } }, maps: [mapOf(4, [bike(1, 5, 5), bike(2, 9, 5)])], mapInfos: infos }));
    assert.deepEqual(told(off), [['note', 'Motorcycle on Road: free riding is switched off in this project.']]);
    // A map with no name is named by its file.
    assert.equal(check(project({ maps: [flat(9, [bike(1, 5, 5)], {width:40,height:30})], mapInfos: [] })).lines[0].text, 'Motorcycle is faster than this map is wide: it crosses Map009 in 2 seconds.');
});

test('commands that never run, a vehicle no command boards, one that moves by itself', () => {
    const talk = page({ list: [{ code: 101, indent: 0, parameters: ['', 0, 0, 2, ''] }, END] });
    const idle = check(project({ maps: [mapOf(1, [bike(1, 10, 10, {}, { pages: [talk] })])] }));
    assert.deepEqual(told(idle), [['note', 'Motorcycle (001): its commands never run, because OK rides it.']]);
    assert.equal(lineOf(idle, 'commandsIdle').path, 'events[1].rrVehicle.board');
    // Boarded by a command: its own page runs, and some command has to board it.
    const locked = bike(1, 10, 10, { board: 'command' }, { pages: [talk] });
    assert.deepEqual(told(check(project({ maps: [mapOf(1, [locked])] }))), [['note', 'Motorcycle (001) is boarded only by a command, and no event has Get On Vehicle for it.']]);
    const boards = (vehicle, args, at = 1) => {
        const events = [bike(1, 10, 10, { board: 'command', key: vehicle.key || '' }, { pages: [page({ list: at === 1 ? [command('GetOnVehicle', args), END] : [END] })] })];
        if (at !== 1) events.push({ id: 2, name: 'Smith', note: '', pages: [page({ list: [command('GetOnVehicle', args), END] })], x: 12, y: 10 });
        return told(check(project({ maps: [mapOf(1, events)] })));
    };
    assert.deepEqual(boards({}, { vehicle: 'this', instant: false, wait: true }), [], 'its own page boards it');
    assert.deepEqual(boards({}, {}), [], 'a Get On Vehicle with no vehicle named is this event\'s');
    assert.deepEqual(boards({}, { vehicle: 'this' }, 2).length, 1, 'another event\'s "this" is not it');
    assert.deepEqual(boards({}, { vehicle: '1:1' }, 2), [], 'its identity always reaches it');
    assert.deepEqual(boards({ key: 'bike' }, { vehicle: 'bike' }, 2), [], 'so does its name');
    assert.deepEqual(boards({}, { vehicle: 'nearest' }, 2), [], 'and the nearest, from the same map');
    assert.deepEqual(boards({}, { vehicle: '2:1' }, 2).length, 1, 'another map\'s is not it');
    const scripted = project({ maps: [mapOf(1, [bike(1, 10, 10, { board: 'command', key: 'bike' })])], commonEvents: [null, { id: 1, list: [{ code: 355, indent: 0, parameters: ['ReactorVehicles.getOn("bike", { instant: true });'] }, END] }] });
    assert.deepEqual(told(check(scripted)), [], 'a script call boards it too');
    // A script on the vehicle's own page that names nobody boards this one; the same line on another event's page boards another.
    const getOn = { code: 355, indent: 0, parameters: ['ReactorVehicles.getOn();'] };
    const own = project({ maps: [mapOf(1, [bike(1, 10, 10, { board: 'command' }, { pages: [page({ list: [getOn, END] })] })])] });
    assert.deepEqual(told(check(own)), []);
    const elsewhere = project({ maps: [mapOf(1, [bike(1, 10, 10, { board: 'command' }), { id: 2, name: 'Smith', note: '', pages: [page({ list: [getOn, END] })], x: 12, y: 10 }])] });
    assert.deepEqual(told(check(elsewhere)), [['note', 'Motorcycle (001) is boarded only by a command, and no event has Get On Vehicle for it.']]);
    // A movement type of its own.
    const roams = check(project({ maps: [mapOf(1, [bike(1, 10, 10, {}, { pages: [page({ moveType: 1 })] })])] }));
    assert.deepEqual(told(roams), [['note', 'Motorcycle (001) on Yard moves by itself: once someone has ridden it, it stays where it is left.']]);
});

test('a name two vehicles carry is to fix when something uses it, and a note when nothing does', () => {
    const two = more => project(Object.assign({ maps: [mapOf(1, [bike(1, 10, 10, { key: 'bike' }), bike(2, 20, 10, { key: 'bike' }), bike(3, 30, 10, { key: 'trike' })])] }, more));
    const unused = check(two());
    assert.deepEqual(told(unused), [['note', 'Two vehicles are named bike: Motorcycle (001) and Motorcycle (002). A command that names it reaches the nearest.']], 'a pasted copy rides: it is its own vehicle');
    assert.deepEqual([unused.ok, lineOf(unused, 'sameNameUnused').file, lineOf(unused, 'sameNameUnused').path], [true, 'data/Map001.json', 'events[2].rrVehicle.key']);
    const used = two();
    used.maps[0].events[4] = { id: 4, name: 'Smith', note: '', pages: [page({ list: [command('SetVehicleLocation', { vehicle: 'bike', x: 3, y: 4 }, 'Set Vehicle Location'), END] })], x: 2, y: 2 };
    assert.deepEqual(told(check(used)), [['fix', 'Two vehicles are named bike: Motorcycle (001) and Motorcycle (002). Set Vehicle Location reaches the nearest.']]);
    const branch = { code: 111, indent: 0, parameters: [12, 'ReactorVehicles.isRiding("bike")'] };
    const scripted = check(two({ commonEvents: [null, { id: 1, list: [branch, END] }] }));
    assert.deepEqual(told(scripted), [['fix', 'Two vehicles are named bike: Motorcycle (001) and Motorcycle (002). A script that names it reaches the nearest.']]);
    assert.equal(scripted.ok, false);
    const other = check(two({ commonEvents: [null, { id: 1, list: [{ code: 111, indent: 0, parameters: [12, 'ReactorVehicles.isRiding("trike")'] }, END] }] }));
    assert.equal(other.lines[0].level, 'note', 'a script that names another vehicle uses no shared name');
    // On two maps: each is told with its map.
    const far = check(project({ maps: [mapOf(1, [bike(1, 10, 10, { key: 'bike' })]), mapOf(2, [bike(7, 10, 10, { key: 'bike' })])] }));
    assert.equal(far.lines[0].text, 'Two vehicles are named bike: Motorcycle (001, Yard) and Motorcycle (007, Road). A command that names it reaches the nearest.');
});

test('an event\'s own front mark that points another way than the vehicle\'s front', () => {
    const marked = front => project({ maps: [mapOf(1, [bike(1, 10, 10)], { reactor3d: { version: 1, mode: '3d', events: { 1: { 0: { name: 'Vehicles/bike', size: 2, faces: { front } } } } } })] });
    const other = check(marked([0.8, 0.05, 0]));
    assert.deepEqual(told(other), [['note', 'Motorcycle (001): its own front mark points another way than the vehicle\'s.']]);
    assert.deepEqual([lineOf(other, 'frontMark').file, lineOf(other, 'frontMark').path], ['data/Map001.r3d.json', 'events.1']);
    assert.deepEqual(told(check(marked([-0.685, 0.055, 0.009]))), [], 'the same way: nothing to say');
    assert.deepEqual(told(check(marked([-0.7, 0, 0.5]))), [], 'within an eighth of a turn is the same way');
    assert.deepEqual(told(check(marked([0, 0, 1]))).length, 1);
});

test('a vehicle faster than its map is wide, a type on no map, a plugin that moves the player its own way', () => {
    const small = project({ maps: [mapOf(1, [bike(1, 10, 10), bike(2, 20, 10)], { width: 40, height: 30 }), mapOf(2, [bike(1, 10, 10)])] });
    const report = check(small);
    assert.deepEqual(told(report), [['note', 'Motorcycle is faster than this map is wide: it crosses Yard in 2 seconds.']], '40 tiles at 20 a second; 200 tiles take ten');
    assert.deepEqual(told(check(project({ types: [null, record({ handling: { speed: 4 } })], maps: [mapOf(1, [bike(1, 10, 10)], { width: 40, height: 30 })] }))), [], 'slower: ten seconds across');
    // A map nobody rides on is not too small for riding: only why it is not ridden is said.
    assert.deepEqual(told(check(project({ maps: [flat(1, [bike(1, 10, 10)], { width: 40, height: 30 })] }))), [['note', 'Motorcycle is faster than this map is wide: it crosses Yard in 2 seconds.']]);
    assert.deepEqual(told(check(project({ maps: [mapOf(1, [bike(1, 10, 10)], { width: 40, height: 30, scrollType: 1 })] }))), [['note', 'Motorcycle on Yard: this map loops.']]);
    assert.deepEqual(told(check(project({ maps: [mapOf(1, [])] }))), [['note', 'No Motorcycle is on any map.']]);
    assert.deepEqual([lineOf(check(project({ maps: [mapOf(1, [])] })), 'unplaced').file, lineOf(check(project({ maps: [mapOf(1, [])] })), 'unplaced').path], ['data/ReactorVehicles.json', '[1]']);
    const plugins = [{ name: 'DotMoveSystem', status: true }, { name: 'Galv_PixelMove', status: false }, { name: 'YEP_RegionRestrictions', status: true }, { name: 'Community_Basic', status: true }];
    assert.deepEqual(told(check(project({ plugins }))), [
        ['note', 'DotMoveSystem moves the player its own way: free riding is not supported beside it.'], ['note', 'YEP_RegionRestrictions: its regions are not asked while riding free.']
    ], 'only a plugin that is switched on');
    assert.deepEqual(told(check(project({ plugins, types: null, maps: [mapOf(1, [])], models: {} }))), [], 'a project with no vehicles is told nothing about its plugins');
});

test('a check that lacks what it needs is left out, named, and counted as a note', () => {
    const data = project();
    // A stand test that always has an answer, so only the check asked about is left out.
    const stands = { is3D: () => true, toShape: B.toShape, standing: () => ({ ok: true, height: 0, ground: 0 }) };
    const none = C.problems(data, lookups({ Vehicles: null, Rider: null, BattleCheck: stands }));
    assert.deepEqual([none.skipped, told(none)], [['model'], [['note', 'The vehicle model code is not loaded: models were not measured.']]], 'without the vehicle code: the block is read as written, nothing is measured');
    assert.deepEqual([none.ok, none.fixes, none.notes, none.sentence.text], [true, 0, 1, 'Ready to ride. 1 note.'], 'what was not checked is not "Ready to ride." with nothing after it');
    assert.deepEqual(none.lines[0], { key: 'vehicleCheck.skip.model', args: {}, text: 'The vehicle model code is not loaded: models were not measured.', level: 'note', file: '', path: '', skipped: 'model' });
    const unfit = C.problems(data, lookups({ Rider: null, BattleCheck: stands }));
    assert.deepEqual([unfit.skipped, told(unfit), unfit.sentence.text], [['fit'], [['note', 'The rider code is not loaded: whether the party reaches was not checked.']], 'Ready to ride. 1 note.']);
    assert.deepEqual(C.problems(data, lookups({ rider: undefined, BattleCheck: stands })).skipped, ['fit'], 'nobody to measure bodies');
    const whole = C.problems(data, lookups({ BattleCheck: stands }));
    assert.deepEqual([whole.skipped, told(whole), whole.sentence.text], [[], [], 'Ready to ride.']);
    // The 3D world is not there to ask where it stands: said once, however many vehicles stand on 3D maps.
    const unknown = { is3D: () => true, toShape: B.toShape, standing: () => ({ ok: true, height: null, unknown: true }) };
    const two = project({ maps: [mapOf(1, [bike(1, 10, 10), bike(2, 30, 10)])] });
    assert.deepEqual([C.problems(two, lookups({ BattleCheck: unknown })).skipped, told(C.problems(two, lookups({ BattleCheck: unknown })))], [['stand'], [['note', 'Where vehicles stand was not checked: the 3D world could not be loaded.']]]);
    // With Battle Setup's own stand test and no 3D world, a 3D map's ground cannot be asked either.
    assert.deepEqual(C.problems(data, lookups({ BattleCheck: B })).skipped, ['stand']);
    assert.deepEqual(Object.keys(C.MESSAGES).filter(key => key.startsWith('vehicleCheck.skip.')).sort(), ['vehicleCheck.skip.fit', 'vehicleCheck.skip.model', 'vehicleCheck.skip.stand']);
    // Nothing handed in at all: the records and the events are still read.
    const bare = C.problems(project({ types: [null, record({ kind: 'unicycle' })] }), { Vehicles: null, Rider: null });
    assert.deepEqual(told(bare)[0], ['fix', 'Motorcycle: unicycle is not a kind of vehicle.']);
    assert.doesNotThrow(() => C.problems(null, {}));
    assert.doesNotThrow(() => C.problems({ types: [null, null, 5, 'x', {}], maps: [null, { id: 3, events: [null, { id: 1, rrVehicle: 7 }, { id: 2, rrVehicle: {} }] }] }, { Vehicles: null, Rider: null }));
});

test('this file\'s own table of kinds is the runtime\'s, where the runtime is loaded', t => {
    let real = null;
    try { real = require('../build-scripts/validate-vehicles.cjs').world().Vehicles; } catch (error) { real = null; }
    assert.deepEqual(C.kindsOf({ Vehicles: null }), C.KINDS, 'without the runtime: the table here');
    if (!real) return t.skip('Reactor3D.Vehicles is not in the runtime');
    assert.deepEqual(JSON.parse(JSON.stringify(C.kindsOf({ Vehicles: real }))), C.KINDS, 'size, speed, the version it arrives in, where the rider is, what it moves on, whether this version drives it');
    for (const kind of Object.keys(C.KINDS)) assert.ok(C.MESSAGES['vehicleCheck.kind.' + kind], `${kind} has its word`);
    for (const group of ['handling', 'body', 'camera']) assert.deepEqual(C.FORMAT.type[group].slice().sort(), Object.keys(real.KINDS.motorcycle[group]).sort(), `${group}: the settings this file knows are the runtime's`);
    for (const [key, range] of Object.entries(C.RANGES)) assert.deepEqual(Array.from(real.RANGES[key.split('.')[0]][key.split('.')[1]]), range, `${key}: the same range`);
});

test('the game and the checker name the same record for an event\'s type', t => {
    const done = apart('sameRecord');
    assert.equal(done.status, 0, String(done.stderr || done.stdout || done.error).slice(0, 4000));
    if (/^sameRecord: not run$/m.test(done.stdout)) return t.skip('the game\'s vehicle file or its test world is not in the tree');
    assert.match(done.stdout, /^sameRecord: 5 lists$/m);
});

/** That check itself: the number of lists asked, or null when the game's vehicle file or its test world is not in the tree. Throws where the two differ. */
function sameRecord() {
    let world = null;
    try { world = require('./helpers/vehicles-board-world.cjs'); } catch (error) { world = null; }
    if (!world || !fs.existsSync(path.join(repoRoot, 'runtime', 'reactor_vehicles.js'))) return null;
    let lists = 0;
    const model = { name: world.BIKE_MODEL, file: 'test-bike', size: 3.5 };
    const type = more => Object.assign({ name: 'Motorcycle', kind: 'motorcycle', model }, more);
    for (const [what, types, rows] of [
        ['a record with its id', [null, type({ id: 1 })], [[31, 1], [32, 2]]],
        ['a record with no id', [null, type()], [[31, 1], [32, 2]]],
        ['an id that is not its place', [null, type({ id: 2 })], [[31, 1], [32, 2]]],
        ['a hole in the list', [null, null, type({ id: 2 })], [[31, 1], [32, 2], [33, 3]]],
        ['two records with their ids crossed', [null, type({ id: 2, name: 'First' }), type({ id: 1, name: 'Second' })], [[31, 1], [32, 2]]]
    ]) {
        const events = rows.map(([id, asked], n) => S.vehicleEvent(id, 6 + n * 8, 10, { type: asked, yaw: 180, name: 'Motorcycle' }));
        // The game: its own file in the vehicle tests' world, the list as $dataReactorVehicles.
        const w = world.boardWorld({ vehicles: events, types });
        const game = rows.map(([id]) => { const event = w.vehicle(id); return w.V.isVehicle(event) ? (w.V.type(event._rrVehicle) || {}).name : null; });
        // The checker: the same list, the same events.
        const report = C.problems({ types, maps: [mapOf(1, events, { width: 40, height: 30 })], system: { partyMembers: [] }, mapInfos: [null, { id: 1, name: 'Yard' }], models: {} }, lookups({ Vehicles: null, Rider: null }));
        const mine = rows.map(([id]) => { const listed = report.vehicles.find(vehicle => vehicle.eventId === id); return listed ? types[listed.type].name : null; });
        assert.deepEqual(mine, game, `${what}: the same record, or none, for every event`);
        const refused = report.lines.filter(line => line.key === 'vehicleCheck.noType').map(line => line.eventId);
        assert.deepEqual(refused, rows.filter((row, n) => game[n] === null).map(row => row[0]), `${what}: "not in the Database" exactly where the game has no vehicle`);
        lists++;
    }
    return lists;
}

/** The game's own `Reactor3D.Vehicles`, or null when the runtime does not carry it. */
function realVehicles() {
    try { return require('../build-scripts/validate-vehicles.cjs').world().Vehicles; } catch (error) { return null; }
}

test('a front is read exactly as the game\'s block reader reads one', t => {
    const values = ['+x', '-x', '+z', '-z', '-X', 'x', ' -x', '+X', 'north', '+y', '', [-1, 0], [0, 1, 0], ['1', 0, 0], [1, 0, 0, 0], [NaN, 0, 1], null, undefined, 7, {},
        [1, 0, 0], [-0.685, 0.055, 0.009], [0, 0, -2], [3, 9, 4]];
    const near = list => list.map(front => (front ? front.map(value => Math.round(value * 1e6) / 1e6 + 0) : null));
    const mine = values.map(value => C.frontOf(value));
    assert.deepEqual(near(mine.slice(0, 4)), [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]], 'the four names');
    assert.deepEqual(mine.slice(4, 20), new Array(16).fill(null), 'a capital, a bare letter, a space, a word, two numbers, straight up, text for a number, four numbers: none is a front');
    assert.deepEqual(near(mine.slice(20)), [[1, 0, 0], [-0.999914, 0, 0.013138], [0, 0, -1], [0.6, 0, 0.8]], 'three numbers: the way they point on the ground');
    const real = realVehicles();
    if (!real || typeof real.frame !== 'function') return t.skip('Reactor3D.Vehicles is not in the runtime');
    assert.deepEqual(near(mine), near(values.map(value => { const axes = real.frame(value); return axes ? Array.from(axes.f) : null; })), 'value for value, what the game makes of it');
});

test('the game\'s own reader, asked: a front, a point and a wheel it cannot take, and a kind that is no kind', t => {
    const real = realVehicles();
    if (!real) return t.skip('Reactor3D.Vehicles is not in the runtime');
    const asked = change => { const data = project(); change(data.models['Vehicles/bike'].vehicle, data); return check(data, { Vehicles: real }); };
    assert.deepEqual(told(asked(() => {})), [], 'the whole block: nothing to say');
    // Every way a hand writes a front the reader does not take: the game would seat the rider by its own guess, so it is to fix.
    for (const forward of ['-X', 'x', ' -x', '+X', 'north', '+y', [-1, 0], '']) {
        const report = asked(block => { block.forward = forward; });
        assert.deepEqual([report.ok, told(report)], [false, [['fix', `Vehicles/bike: the front ${JSON.stringify(forward)} cannot be read. It is "+x", "-x", "+z", "-z" or three numbers.`]]], JSON.stringify(forward));
    }
    assert.deepEqual(told(asked(block => { block.forward = [-1, 0, 0]; })), [], 'three numbers are a front');
    for (const at of [[0.1, 0.2], 'grip', { x: 1 }]) {
        const report = asked(block => { block.seats[0].handL = { at, part: 'Steering' }; });
        assert.deepEqual(told(report), [['fix', 'Motorcycle: the left hand has no place the game can read. "at" is three numbers.']], JSON.stringify(at));
    }
    assert.deepEqual(told(asked(block => { block.wheels = [5, 'Front wheel']; })), [['fix', '3d/Vehicles/bike/model.json: the game cannot read vehicle.wheels[0].']]);
    assert.deepEqual(told(asked(block => { block.wheels = ['Nope', 'Front wheel']; })), [['fix', 'Motorcycle: the wheel Nope is not a part of the model.']]);
    assert.deepEqual(told(asked(block => { block.controls = [{ input: 'steer', shape: 'bars' }]; })),
        [['fix', 'Motorcycle: vehicle.controls[0] has neither a part nor an "at". Nothing turns and the hands stay still.'], ['note', 'Motorcycle: nothing on the model turns with the steering.']]);
    assert.deepEqual(told(asked(block => { block.seats[0].seat = { at: [1, 2] }; })).filter(line => line[0] === 'fix'), [['fix', 'Motorcycle: the seat has no place the game can read. "at" is three numbers.']]);
    // A list that is no list: the game leaves it out and says so; here it is to fix, by its key.
    for (const [key, value] of [['seats', { posture: 'astride' }], ['wheels', 'Front wheel'], ['controls', 3]]) {
        const report = asked(block => { block[key] = value; });
        if (!report.lines.length || report.lines[0].key !== 'vehicleCheck.unread') { t.diagnostic(`the game's reader takes vehicle.${key} written as ${JSON.stringify(value)}`); continue; }
        assert.deepEqual([report.lines[0].level, report.lines[0].text, report.ok], ['fix', `3d/Vehicles/bike/model.json: the game cannot read vehicle.${key}.`, false]);
    }
    // A kind the game's reader refuses is refused here, whatever is written for it.
    for (const kind of ['', 'unicycle', 7]) {
        const report = asked((block, data) => { data.types[1].kind = kind; });
        const game = real.typeNotes(Object.assign({}, record(), { kind })).some(note => note.key === 'unknownKind');
        assert.equal(report.lines.some(line => line.key === 'vehicleCheck.badKind'), game, `kind ${JSON.stringify(kind)}: said here exactly when the game's reader says it`);
    }
    // A sound that is neither a name, a sound nor null.
    assert.deepEqual(told(asked((block, data) => { data.types[1].sounds.bump = 5; })), [['fix', 'data/ReactorVehicles.json: the game cannot read sounds.bump.']]);
    // A size and a volume past what the game takes: its reader holds each to its range, and that is said.
    assert.deepEqual(told(asked((block, data) => { data.types[1].model.size = 500; })), [['note', 'Motorcycle: model.size is 500; the game uses 200.']]);
    assert.deepEqual(told(asked((block, data) => { data.types[1].sounds.engine.volume = 250; })), [['note', 'Motorcycle: sounds.engine.volume is 250; the game uses 100.']]);
    assert.deepEqual(told(asked((block, data) => { data.types[1].handling = { jump: 9 }; })), [['note', 'Motorcycle: handling.jump is 9; the game uses 2.']], 'once, not a second time from the reader\'s note');
    // A kind named after something every object has: the report is made, and says so, whatever the game's reader does with it.
    for (const kind of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
        let report = null;
        assert.doesNotThrow(() => { report = asked((block, data) => { data.types[1].kind = kind; }); }, kind);
        assert.deepEqual(told(report).filter(line => line[0] === 'fix'), [['fix', `Motorcycle: ${kind} is not a kind of vehicle.`]]);
        assert.deepEqual(report.types.map(type => [type.kind, type.model, type.size]), [['motorcycle', 'Vehicles/bike', 2]], 'read on as a motorcycle');
    }
    assert.deepEqual(S.typeModel({ kind: 'constructor', model: { name: 'a/b' } }, null), { name: 'a/b', file: 'b', ext: '.glb', size: 3.5 });
    assert.deepEqual(S.typeModel({ kind: 'constructor', model: { name: 'a/b' } }, real.KINDS), { name: 'a/b', file: 'b', ext: '.glb', size: 3.5 });
    assert.equal(C.typeOf({ kind: 'constructor', model: { name: 'a/b' } }, { Vehicles: { typeOf() { throw new Error('no such kind'); } } }), null, 'a reader that throws is a record it cannot take');
});

//-----------------------------------------------------------------------------
// The catalog.

test('every sentence is in the editor\'s catalog, in English as the checker says it and translated in the 17 locales', () => {
    const done = apart('catalog');
    assert.equal(done.status, 0, String(done.stderr || done.stdout || done.error).slice(0, 4000));
    assert.match(done.stdout, /^catalog: \d+ sentences in 17 locales$/m);
});

/** The catalog's check itself: throws at the first sentence that is missing, untranslated or has lost a value. */
function catalog() {
    const store = new Map();
    const sandbox = {
        window: { dispatchEvent() {} },
        document: { readyState: 'complete', documentElement: {}, addEventListener() {}, querySelectorAll() { return []; } },
        localStorage: { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)) },
        CustomEvent: class { constructor(type) { this.type = type; } }
    };
    sandbox.window.document = sandbox.document; sandbox.window.localStorage = sandbox.localStorage; sandbox.window.CustomEvent = sandbox.CustomEvent;
    // The keyed tables and the translator are I18nManager.js's own. (The two catalogs of phrases keyed by their
    // English text, which the editor loads before it, hold no keyed sentence: they are left out here, 6 MB of them.)
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'I18nManager.js'), 'utf8');
    const { RR_LANGUAGES, RR_I18N_STRINGS, manager } = vm.runInNewContext(`${source}\n({ RR_LANGUAGES, RR_I18N_STRINGS, manager: window.I18n })`, sandbox);
    const locales = Array.from(RR_LANGUAGES, language => language.id).filter(id => id !== 'en');
    assert.equal(locales.length, 17);
    const placeholders = text => (String(text).match(/\{\w+\}/g) || []).sort().join(',');
    assert.ok(Object.keys(C.MESSAGES).length >= 60);
    for (const [key, english] of Object.entries(C.MESSAGES)) {
        assert.ok(key.startsWith('vehicleCheck.'), `${key} is in the checker's own space`);
        assert.equal(RR_I18N_STRINGS.en[key], english, `${key}: the catalog's English is the checker's`);
        for (const locale of locales) {
            const said = RR_I18N_STRINGS[locale][key];
            assert.ok(said && said !== english, `${locale} translates ${key}`);
            assert.equal(placeholders(said), placeholders(english), `${locale} keeps the values of ${key}`);
        }
    }
    assert.deepEqual(Object.keys(RR_I18N_STRINGS.en).filter(key => key.startsWith('vehicleCheck.')).sort(), Object.keys(C.MESSAGES).sort(), 'and the catalog has no key the checker lacks');
    for (const key of Object.keys(S.MESSAGES)) assert.equal(C.MESSAGES[key], S.MESSAGES[key], `${key}: the row's sentence is in the checker's table`);
    // A count and a distance are said without a counted noun where the noun's form follows the number.
    for (const [locale, noun] of [['ru', /\{(count|d|n|seconds)\} [а-я]{3}/], ['pl', /\{(count|d|n|seconds)\} [a-ząćęłńóśźż]{3}/], ['ar', /\{(count|d|n|seconds)\} [ء-ي]{3}/]]) {
        for (const key of ['readyNotes', 'notReady', 'holdsNothing', 'noSize', 'fast']) assert.doesNotMatch(RR_I18N_STRINGS[locale]['vehicleCheck.' + key], noun, `${locale}: no noun counted in ${key}`);
    }
    // The tool's own name is kept as it is typed.
    for (const locale of locales) assert.match(RR_I18N_STRINGS[locale]['vehicleCheck.noSize'], /make-vehicle --fit/, `${locale} keeps the command`);
    // A report read through the editor's translator: the sentence, a limb's word and a kind's word in the language.
    manager.setLanguage('de', { persist: false });
    const t = (key, args) => manager.t(key, args);
    const data = project({ types: [null, record({ name: 'Consul', kind: 'tank' })] });
    data.models['Vehicles/bike'].vehicle.seats[0].handL.part = 'Lenker';
    const german = C.problems(data, lookups({})).lines.map(line => C.say(line, t));
    assert.deepEqual(german, ['Consul ist ein Panzer: Diese Version fährt solche Fahrzeuge noch nicht.']);
    const seated = project();
    seated.models['Vehicles/bike'].vehicle.seats[0].handL.part = 'Lenker';
    assert.deepEqual(C.problems(seated, lookups({})).lines.map(line => C.say(line, t)), ['Motorcycle: Die linke Hand liegt auf einem Teil, das das Modell nicht mehr hat (Lenker).']);
    assert.equal(C.say(C.sentenceOf(0, 3), t), 'Fahrbereit. Hinweise: 3.');
    assert.equal(C.say(C.sentenceOf(0, 0), key => key), 'Ready to ride.', 'a translator with no such key leaves the English');
    return Object.keys(C.MESSAGES).length;
}

//-----------------------------------------------------------------------------
// The game's own code, on the Demo motorcycle's fixture.

const NINJA = path.join(repoRoot, 'template', 'Demo', '3d', 'Vehicles', 'kawashaki_ninja_h2', 'source', 'kawashaki_ninja_h2.glb');
// The Demo's starting party: the actor's number, its name, its model's folder and file.
const PARTY = [[1, 'Fleagus Gustafario', 'Actors/Fleagus', 'Fleagus'], [2, 'Carol Everson', 'Actors/Captain_Carol_Everson_Reduced', 'Captain_Carol_Everson_Reduced'], [3, 'Jolt Eagle', 'Actors/Jolt Eagle', 'Jolt Eagle']];

let ninjaFolder = null;
// Asked for at the file's own level: a hook asked for inside a test would run when that test ends.
test.after(() => {
    if (!ninjaFolder) return;
    require('../build-scripts/validate-vehicles.cjs').forget();
    fs.rmSync(ninjaFolder, { recursive: true, force: true });
});
/**
 * The fixture's two files in their places in a project of its own, the
 * Demo motorcycle's model file beside them, the sounds the type names, a
 * 3D map of level ground with the bike on it and nobody in the party.
 * `party` copies the Demo's three starting actors' models in and binds
 * them. Null when a model it needs is not on disk. One folder for this
 * file's tests (each is handed the fixture's two files afresh), so the
 * motorcycle's quarter of a million triangles are read and measured once.
 */
function ninjaProject({ party = false } = {}) {
    const demo = path.join(repoRoot, 'template', 'Demo');
    if (!fs.existsSync(NINJA)) return null;
    if (party && !PARTY.every(actor => fs.existsSync(path.join(demo, '3d', ...actor[2].split('/'), 'source', actor[3] + '.glb')))) return null;
    const write = (name, data) => fs.writeFileSync(path.join(ninjaFolder, 'data', name), JSON.stringify(data));
    if (!ninjaFolder) {
        ninjaFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-vehicle-check-'));
        const folder = ninjaFolder;
        fs.mkdirSync(path.join(folder, '3d', 'Vehicles', 'kawashaki_ninja_h2', 'source'), { recursive: true });
        fs.copyFileSync(NINJA, path.join(folder, '3d', 'Vehicles', 'kawashaki_ninja_h2', 'source', 'kawashaki_ninja_h2.glb'));
        fs.mkdirSync(path.join(folder, 'audio', 'se'), { recursive: true });
        for (const name of ['drone-01', 'powerup-01', 'equip-01', 'hit-01', 'hit-02']) fs.writeFileSync(path.join(folder, 'audio', 'se', name + '.ogg'), '');
        fs.mkdirSync(path.join(folder, 'data'), { recursive: true });
        write('MapInfos.json', [null, { id: 1, name: 'North Haven' }]);
        write('Tilesets.json', tilesets);
        const map = mapOf(1, [bike(1, 20, 12)]);
        const side = map.reactor3d;
        delete map.reactor3d; delete map.id;
        side.elevation = new Array(map.width * map.height).fill(0);
        write('Map001.json', map);
        write('Map001.r3d.json', side);
    }
    const folder = ninjaFolder;
    fs.cpSync(path.join(__dirname, 'fixtures', 'vehicles', 'project'), folder, { recursive: true });
    write('System.json', { partyMembers: party ? PARTY.map(actor => actor[0]) : [], versionId: 1 });
    const actors = [null], bound = {};
    if (party) {
        for (const [id, name, model, file] of PARTY) {
            actors[id] = { id, name };
            bound[id] = { character: { name: model, file, ext: '.glb', size: 3, scale: 1 } };
            // The actor's model as the Demo has it: its file, its rig and its motions.
            if (!fs.existsSync(path.join(folder, '3d', ...model.split('/')))) fs.cpSync(path.join(demo, '3d', ...model.split('/')), path.join(folder, '3d', ...model.split('/')), { recursive: true });
        }
    }
    write('Actors.json', actors);
    write('Database.r3d.json', { actors: bound });
    return folder;
}

test('the Demo motorcycle\'s fixture is ready to ride, and a rider seated backwards on it holds nothing', t => {
    const V = require('../build-scripts/validate-vehicles.cjs'), loaded = V.world();
    if (!loaded.Vehicles) return t.skip(`Reactor3D.Vehicles is not loaded: ${loaded.modelSide}`);
    // Nobody in the party: what is asked here is the bike itself, its block and where it stands (the party is the next test's).
    const folder = ninjaProject();
    if (!folder) return t.skip('the Demo\'s motorcycle model is not on disk');

    const ready = V.check(folder, { loaded }).report;
    assert.deepEqual(ready.lines.map(line => line.text), [], 'nothing to say about the fixture');
    assert.deepEqual([ready.ok, ready.sentence.text, ready.skipped], [true, 'Ready to ride.', []]);
    assert.deepEqual(ready.types.map(type => [type.name, type.model, type.size, type.placed]), [['Motorcycle', 'Vehicles/kawashaki_ninja_h2', 3.5, 1]]);

    // The same model told its tail is its front, its points left to the game's guess: the hands are where the tail's cowl is not.
    const sidecar = path.join(folder, '3d', 'Vehicles', 'kawashaki_ninja_h2', 'model.json');
    const json = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
    json.vehicle = { forward: '+x', wheels: json.vehicle.wheels, controls: json.vehicle.controls };
    fs.writeFileSync(sidecar, JSON.stringify(json));
    const backwards = V.check(folder, { loaded }).report;
    const held = backwards.lines.filter(line => line.key === 'vehicleCheck.holdsNothing');
    assert.deepEqual(held.map(line => line.limb), ['handL', 'handR'], backwards.lines.map(line => line.text).join(' | '));
    for (const line of held) {
        assert.match(line.text, /^Motorcycle: the (left|right) hand holds nothing\. The nearest surface is 0\.\d+ tiles away\.$/);
        assert.ok(line.args.d > 0.15 && line.args.d < 0.5, `${line.args.d} tiles: past what a hand holds`);
    }
    assert.equal(backwards.ok, false);

    // Turned the right way with the same guess, the hands find the bars.
    json.vehicle.forward = '-x';
    fs.writeFileSync(sidecar, JSON.stringify(json));
    const forwards = V.check(folder, { loaded }).report;
    assert.deepEqual(forwards.lines.filter(line => line.level === 'fix').map(line => line.text), []);
    assert.deepEqual(forwards.lines.map(line => line.key.replace('vehicleCheck.', '')), ['pointsGuess'], 'and the validator says the points are the game\'s guess');

    // No block at all (the smallest record's model): the game looks at the model, finds the bars at -x and seats the
    // rider that way round. Nothing to fix; every note says what nobody has looked at yet.
    delete json.vehicle;
    fs.writeFileSync(sidecar, JSON.stringify(json));
    const bare = V.check(folder, { loaded }).report;
    assert.deepEqual(bare.lines.filter(line => line.level === 'fix').map(line => line.text), [], 'nobody seated backwards, no hand holding nothing');
    assert.deepEqual(bare.lines.map(line => line.key.replace('vehicleCheck.', '')), ['noSteering', 'noWheels', 'frontGuess', 'pointsGuess']);
    const front = bare.lines.find(line => line.key === 'vehicleCheck.frontGuess');
    assert.deepEqual([front.value, front.taken, V.lineText(front)], ['-x', '-x', 'Vehicles/kawashaki_ninja_h2: nobody has confirmed which end is the front. The game takes -x (make-vehicle.cjs --front -x confirms it).']);
    assert.equal(bare.sentence.text, 'Ready to ride. 4 notes.');
});

test('with the Demo\'s party on the fixture the checker says of each hand and foot what the game\'s own fit says, and at the fitted size nobody is short', t => {
    const V = require('../build-scripts/validate-vehicles.cjs'), loaded = V.world();
    if (!loaded.Vehicles || !loaded.Rider) return t.skip(`the game's vehicle and rider code is not loaded: ${loaded.modelSide || loaded.riderSide}`);
    const folder = ninjaProject({ party: true });
    if (!folder) return t.skip('the Demo\'s motorcycle and party models are not on disk');
    const data = V.read(folder), looks = V.lookups(folder, data, loaded);
    const seated = V.check(folder, { loaded, data, lookups: looks }).report;
    assert.deepEqual(seated.skipped, [], 'the game\'s own fit was asked');
    // The game's fit, asked here directly for each of the three at the fixture's size.
    const type = loaded.Vehicles.typeOf(data.types[1]), model = looks.model(type.model);
    const block = loaded.Vehicles.read(data.models[type.model.name], model.box, 'motorcycle');
    const bodies = PARTY.map(actor => looks.rider(actor[0]));
    assert.deepEqual(bodies.map(body => body && body.name), PARTY.map(actor => actor[1]), 'each of the three has a 3D body to seat');
    const expected = [];
    bodies.forEach(body => {
        const fit = loaded.Rider.fit(body.object, model.object, block, type.model.size);
        assert.equal(fit.seated, true, `${body.name} sits`);
        for (const limb of ['handL', 'handR', 'footL', 'footR']) if (fit.points[limb] && fit.points[limb].short > 0.005) expected.push([body.name, limb, Math.round(fit.points[limb].short * 100) / 100]);
    });
    const short = report => report.lines.filter(line => line.key === 'vehicleCheck.short' || line.key === 'vehicleCheck.shortRest');
    assert.deepEqual(short(seated).map(line => [line.args.rider, line.limb, line.args.d]), expected, 'a line for every limb the fit says is short, with the fit\'s own distance, and for no other');
    for (const line of short(seated)) {
        assert.equal(line.key, line.limb.startsWith('foot') ? 'vehicleCheck.shortRest' : 'vehicleCheck.short');
        assert.deepEqual([line.level, line.file, line.path], ['fix', '3d/Vehicles/kawashaki_ninja_h2/model.json', `vehicle.seats[0].${line.limb}.at`]);
        assert.ok(line.args.s >= 0.1 && line.args.s < type.model.size, `make it ${line.args.s} smaller: a size the fit worked out`);
    }
    assert.equal(seated.ok, expected.length === 0, 'ready exactly when nobody is short');

    // The size the game's own fit answers for the three, written by make-vehicle --fit: then nobody is short.
    const direct = loaded.Rider.fitSize(bodies.map(body => body.object), model.object, block, 'motorcycle');
    assert.ok(direct.size >= 1 && direct.size <= 6, `a size a motorcycle can be: ${direct.size}`);
    const made = require('../build-scripts/make-vehicle.cjs').make(folder, { name: 'Motorcycle', kind: 'motorcycle', model: 'Vehicles/kawashaki_ninja_h2', fit: true }, loaded);
    assert.deepEqual([made.exit, made.refused, made.size], [0, '', direct.size]);
    assert.equal(made.head, `Motorcycle (1): Vehicles/kawashaki_ninja_h2 at ${direct.size} tiles, fitted to ${PARTY[direct.limitedBy][1]} (${direct.reason === 'foot' ? 'a foot reaches the ground' : 'the shortest reach'})`);
    assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'data', 'ReactorVehicles.json'), 'utf8'))[1].model.size, direct.size);
    const fitted = V.check(folder, { loaded }).report;
    assert.deepEqual(short(fitted).map(line => line.text), [], 'at the fitted size every hand reaches its grip and every foot its rest');
    assert.deepEqual([fitted.ok, fitted.fixes, fitted.skipped], [true, 0, []]);
    assert.match(fitted.sentence.text, /^Ready to ride\./);
});

if (ONLY === 'catalog') console.log(`catalog: ${catalog()} sentences in 17 locales`);
if (ONLY === 'sameRecord') { const lists = sameRecord(); console.log(lists === null ? 'sameRecord: not run' : `sameRecord: ${lists} lists`); }

test('BGS engine states validate the BGS folder and do not report a configured engine as silent',()=>{
    const data=project();data.types[1].sounds={engine:null,idle:'Motor',accelerate:{name:'Rev'},slowdown:{name:'Coast',folder:'se'}};
    const report=check(data);
    assert.deepEqual(report.lines.map(line=>line.path),['[1].sounds.idle','[1].sounds.accelerate','[1].sounds.slowdown']);
    assert.deepEqual(C.soundsOf(data.types[1],{Vehicles:null}),[{slot:'idle',name:'Motor',kind:'bgs'},{slot:'accelerate',name:'Rev',kind:'bgs'},{slot:'slowdown',name:'Coast',kind:'se'}]);
    const exists=file=>FILES.includes(file) || ['audio/bgs/Motor.ogg','audio/bgs/Rev.m4a','audio/se/Coast.ogg_'].includes(file);
    assert.deepEqual(told(check(data,{exists})),[]);
});
