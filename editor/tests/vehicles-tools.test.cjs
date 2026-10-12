'use strict';
// The five vehicle tools (build-scripts/describe-model.cjs, make-vehicle.cjs, carve-part.cjs, place-vehicle.cjs,
// validate-vehicles.cjs) run as a person or a generator runs them, on a small project made here: a motorcycle
// built of boxes and two discs, a 3D map of level ground. Each tool's exit code, what it prints, what it writes
// and what it refuses; then the Demo's own motorcycle where its file is on disk.
// No assertion here is handed a model, a template or a built instance as a value (they are compared here and the
// answer asserted): a failed assertion prints its values whole, and a model is a quarter of a million triangles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const S = require('../src/event/VehicleSetup.js');
const V = require('../build-scripts/validate-vehicles.cjs');
const Carver = require('../build-scripts/carve-part.cjs');
const tool = name => path.join(editorRoot, 'build-scripts', name + '.cjs');
const run = (name, args, from = tool) => spawnSync(process.execPath, [from(name), ...args], { encoding: 'utf8' });
const said = done => done.stdout + done.stderr;

//-----------------------------------------------------------------------------
// A motorcycle of boxes, as a .glb.

/** A box as vertices and triangles, cut into `slices` along z so its long sides carry vertices. */
function box(x0, x1, y0, y1, z0, z1, slices = 1) {
    const positions = [], index = [];
    for (let s = 0; s < slices; s++) {
        const a = z0 + (z1 - z0) * s / slices, b = z0 + (z1 - z0) * (s + 1) / slices, base = positions.length / 3;
        positions.push(x0, y0, a, x1, y0, a, x1, y1, a, x0, y1, a, x0, y0, b, x1, y0, b, x1, y1, b, x0, y1, b);
        for (const [i, j, k] of [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 6, 2], [3, 7, 6], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]]) index.push(base + i, base + j, base + k);
    }
    return { positions, index };
}
/** A disc standing on edge: its axle along z through (0, 0). */
function disc(radius, half, sides = 20) {
    const positions = [0, 0, -half, 0, 0, half], index = [];
    for (let i = 0; i < sides; i++) {
        const angle = Math.PI * 2 * i / sides, x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
        positions.push(x, y, -half, x, y, half);
    }
    for (let i = 0; i < sides; i++) {
        const a = 2 + i * 2, b = 2 + ((i + 1) % sides) * 2;
        index.push(0, b, a, 1, a + 1, b + 1, a, b, b + 1, a, b + 1, a + 1);
    }
    return { positions, index };
}
const join = shapes => {
    const positions = [], index = [];
    for (const shape of shapes) { const base = positions.length / 3; positions.push(...shape.positions); for (const i of shape.index) index.push(base + i); }
    return { positions, index };
};

/**
 * The model: a body with its handlebar tube and two foot pegs in one mesh
 * (four pieces that share no vertex), and two wheels as nodes of their
 * own whose origin is their axle. Its front is -x: the bars are there.
 * 2.1 long, 0.9 tall, 0.8 wide.
 */
const BLOCKY = [box(-0.6, 0.6, 0.3, 0.9, -0.15, 0.15), box(-0.42, -0.34, 0.62, 0.70, -0.4, 0.4, 8), box(0.2, 0.3, 0.30, 0.36, 0.16, 0.30), box(0.2, 0.3, 0.30, 0.36, -0.30, -0.16)];
/**
 * A body with a motorcycle's proportions, so the points the game guesses
 * from the box alone lie on it: a saddle 0.725 of the height up, a bar
 * 0.74 up and 0.18 of the length ahead of the middle, pegs 0.35 up, and a
 * screen that makes it 1 tall. Its front is -x too.
 */
const SHAPELY = [box(-0.6, 0.6, 0.3, 0.725, -0.15, 0.15), box(-0.42, -0.34, 0.70, 0.78, -0.4, 0.4, 8), box(0.2, 0.3, 0.30, 0.36, 0.16, 0.30), box(0.2, 0.3, 0.30, 0.36, -0.30, -0.16), box(-0.6, -0.55, 0.725, 1.0, -0.15, 0.15)];
function bikeGlb(shapes = BLOCKY) {
    const body = join(shapes);
    const wheel = disc(0.3, 0.05);
    const meshes = [body, wheel, wheel], chunks = [], views = [], accessors = [];
    let offset = 0;
    const push = (typed, target) => {
        const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), pad = (4 - bytes.length % 4) % 4;
        views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
        chunks.push(bytes, Buffer.alloc(pad));
        offset += bytes.length + pad;
        return views.length - 1;
    };
    const gltfMeshes = meshes.map(shape => {
        const positions = new Float32Array(shape.positions), index = new Uint16Array(shape.index);
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < positions.length; i++) { min[i % 3] = Math.min(min[i % 3], positions[i]); max[i % 3] = Math.max(max[i % 3], positions[i]); }
        accessors.push({ bufferView: push(positions, 34962), componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max });
        accessors.push({ bufferView: push(index, 34963), componentType: 5123, count: index.length, type: 'SCALAR' });
        return { primitives: [{ attributes: { POSITION: accessors.length - 2 }, indices: accessors.length - 1 }] };
    });
    const bin = Buffer.concat(chunks);
    const gltf = {
        asset: { version: '2.0', generator: 'vehicles-tools.test' }, scene: 0, scenes: [{ nodes: [0] }],
        nodes: [{ name: 'Bike', children: [1, 2, 3] }, { name: 'Body', mesh: 0 }, { name: 'FrontWheel', mesh: 1, translation: [-0.75, 0.3, 0] }, { name: 'RearWheel', mesh: 2, translation: [0.75, 0.3, 0] }],
        meshes: gltfMeshes, accessors, bufferViews: views, buffers: [{ byteLength: bin.length }]
    };
    let json = Buffer.from(JSON.stringify(gltf), 'utf8');
    json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
    const head = Buffer.alloc(12);
    head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
    const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
    return Buffer.concat([head, chunk(0x4E4F534A, json), chunk(0x004E4942, bin)]);
}

/** A glTF document and its buffers as one .glb. `add(typed, target)` gives a buffer view's number. */
function glbOf(build) {
    const chunks = [], views = [];
    let offset = 0;
    const add = (typed, target) => {
        const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), pad = (4 - bytes.length % 4) % 4;
        views.push(Object.assign({ buffer: 0, byteOffset: offset, byteLength: bytes.length }, target ? { target } : {}));
        chunks.push(bytes, Buffer.alloc(pad));
        offset += bytes.length + pad;
        return views.length - 1;
    };
    const gltf = build(add), bin = Buffer.concat(chunks);
    if (bin.length) Object.assign(gltf, { bufferViews: views, buffers: [{ byteLength: bin.length }] });
    let json = Buffer.from(JSON.stringify(gltf), 'utf8');
    json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
    const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
    const body = [chunk(0x4E4F534A, json)].concat(bin.length ? [chunk(0x004E4942, bin)] : []);
    const head = Buffer.alloc(12);
    head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + body.reduce((sum, part) => sum + part.length, 0), 8);
    return Buffer.concat([head].concat(body));
}

/**
 * A mount with a skeleton of its own: one box 2 long along x, 1 tall, half
 * a unit wide, wholly held by one joint that the file turns a quarter turn
 * about the up axis, and a motion of one still track. At rest, where its
 * bones hold it, it is 2 long along z.
 */
function mountGlb() {
    return glbOf(add => {
        const shape = box(-1, 1, 0, 1, -0.25, 0.25), count = shape.positions.length / 3;
        const joints = new Uint8Array(count * 4), weights = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) weights[i * 4] = 1;
        const accessors = [
            { bufferView: add(new Float32Array(shape.positions), 34962), componentType: 5126, count, type: 'VEC3', min: [-1, 0, -0.25], max: [1, 1, 0.25] },
            { bufferView: add(new Uint16Array(shape.index), 34963), componentType: 5123, count: shape.index.length, type: 'SCALAR' },
            { bufferView: add(joints, 34962), componentType: 5121, count, type: 'VEC4' },
            { bufferView: add(weights, 34962), componentType: 5126, count, type: 'VEC4' },
            { bufferView: add(new Float32Array([0, 1])), componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
            { bufferView: add(new Float32Array([0, 0, 0, 0, 0, 0])), componentType: 5126, count: 2, type: 'VEC3' }
        ];
        return {
            asset: { version: '2.0', generator: 'vehicles-tools.test' }, scene: 0, scenes: [{ nodes: [0] }],
            nodes: [{ name: 'Mount', children: [1, 2] }, { name: 'Hips', rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }, { name: 'Hide', mesh: 0, skin: 0 }],
            skins: [{ joints: [1] }],
            meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 2, WEIGHTS_0: 3 }, indices: 1 }] }],
            animations: [{ name: 'Idle', channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }], samplers: [{ input: 4, output: 5, interpolation: 'LINEAR' }] }],
            accessors
        };
    });
}

/** A project: the model, the five sounds a motorcycle names, one actor in the party with no 3D body, a 3D map of level ground 200 by 160. */
function projectIn(folder, more = {}) {
    const write = (relative, data) => {
        const file = path.join(folder, ...relative.split('/'));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.isBuffer(data) || typeof data === 'string' ? data : JSON.stringify(data));
    };
    write('data/System.json', { partyMembers: [1], versionId: 1, startMapId: 1, startX: 2, startY: 2 });
    write('data/Actors.json', [null, { id: 1, name: 'Ren', characterName: 'Actor1', characterIndex: 0 }]);
    write('data/MapInfos.json', [null, { id: 1, name: 'Yard' }]);
    write('data/Tilesets.json', [null, { id: 1, flags: [0x10, 0, 0x0f] }]);
    const width = 200, height = 160, data = new Array(width * height * 6).fill(0);
    for (let i = 0; i < width * height; i++) data[i] = 1;
    const plain = { id: 1, name: 'EV001', note: '', pages: [S.defaultPage()], x: 30, y: 30 };
    require('../src/utils/DataLimits.js');
    write('data/Map001.json', globalThis.RRMapJson.stringify({ displayName: '', tilesetId: 1, width, height, scrollType: 0, note: '<3d>', data, events: [null, plain] }));
    write('data/Map001.r3d.json', { version: 1, mode: '3d', width, height, elevation: new Array(width * height).fill(0) });
    write('3d/Vehicles/bike/source/bike.glb', bikeGlb());
    if (more.sounds !== false) for (const name of ['drone-01', 'powerup-01', 'equip-01', 'hit-01', 'hit-02']) write(`audio/se/${name}.ogg`, '');
    return folder;
}

/** Every file of a folder with its bytes, to say that nothing was written. */
function snapshot(folder) {
    const out = {};
    const walk = (dir, rel) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const next = rel ? rel + '/' + entry.name : entry.name;
            if (entry.isDirectory()) walk(path.join(dir, entry.name), next);
            else out[next] = fs.readFileSync(path.join(dir, entry.name)).toString('base64');
        }
    };
    walk(folder, '');
    return out;
}
const temp = (t, name) => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), name));
    t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    return folder;
};
const read = (folder, relative) => JSON.parse(fs.readFileSync(path.join(folder, ...relative.split('/')), 'utf8'));
const loaded = V.world();
const modelSide = !!(loaded.Vehicles && typeof loaded.Vehicles.guess === 'function');
const MAKE = ['--name', 'Motorcycle', '--kind', 'motorcycle', '--model', 'Vehicles/bike'];

//-----------------------------------------------------------------------------
// Looking.

test('describe-model says what the model is and writes nothing', t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    const before = snapshot(project);
    const done = run('describe-model', [project, 'Vehicles/bike']);
    assert.equal(done.status, 0, said(done));
    assert.match(done.stdout, /^Vehicles\/bike {3}3d\/Vehicles\/bike\/source\/bike\.glb {3}\(no model\.json\)$/m);
    assert.match(done.stdout, /^box {9}2\.1 long, 0\.8 wide, 0\.9 tall \(x -1\.05\.\.1\.05, y 0\.\.0\.9, z -0\.4\.\.0\.4\)$/m, 'the box in model space: centered, standing on y = 0');
    assert.match(done.stdout, /^meshes {6}3 \(carve index/m);
    assert.match(done.stdout, /^ {4}0 {2}Body {2}132 triangles {2}x -0\.6\.\.0\.6 {2}y 0\.3\.\.0\.9 {2}z -0\.4\.\.0\.4 {2}origin \(0, 0, 0\)$/m, 'a mesh by its carve index, with the file\'s node name');
    assert.match(done.stdout, /^ {4}1 {2}FrontWheel {2}80 triangles .* origin \(-0\.75, 0\.3, 0\)$/m, 'a wheel node\'s origin is its axle');
    assert.match(done.stdout, /^parts {7}none carved$/m);
    if (modelSide) {
        assert.match(done.stdout, /^front {7}-x \(guessed: the hands find the bars at this end \(/m, 'the front, and why');
        assert.match(done.stdout, /^wheels {6}2 found$/m);
        assert.match(done.stdout, /^ {2}FrontWheel: axle \(-0\.75, 0\.3, 0\), radius 0\.3$/m);
        assert.match(done.stdout, /^ {2}left hand {3}\(-0\.\d+, 0\.\d+, 0\.\d+\) +0(\.0\d*)? from the surface$/m, 'the guessed left hand, on the bar');
        assert.match(done.stdout, /^ {2}seat {8}\(0\.273, 0\.9, 0\) +0 from the surface$/m, 'the seat set down on the top of the body');
    } else assert.match(done.stdout, /^note: The vehicle model code is not loaded/m);
    assert.deepEqual(snapshot(project), before, 'nothing written');
    // One mesh's connected pieces, for carve-part.
    const pieces = run('describe-model', [project, 'Vehicles/bike', '--pieces', '0']);
    assert.equal(pieces.status, 0, said(pieces));
    assert.match(pieces.stdout, /^pieces {6}mesh 0: 4 connected piece\(s\) \(number: triangles, box, middle\)$/m);
    assert.match(pieces.stdout, /^ {5}0 {6}12 triangles {2}x -0\.6\.\.0\.6 {2}y 0\.3\.\.0\.9 {2}z -0\.15\.\.0\.15 {2}middle \(0, 0\.6, 0\)$/m);
    assert.match(pieces.stdout, /^ {5}1 {6}96 triangles {2}x -0\.42\.\.-0\.34 {2}y 0\.62\.\.0\.7 {2}z -0\.4\.\.0\.4 {2}middle \(-0\.38, 0\.66, 0\)$/m, 'the bar, cut in eight along its length, is one piece');
    assert.match(run('describe-model', [project, 'Vehicles/bike', '--pieces', '0', '--min', '50']).stdout, /4 connected piece\(s\), 1 shown/);
    // As JSON.
    const json = run('describe-model', [project, 'Vehicles/bike', '--json', '--pieces', '0']);
    const told = JSON.parse(json.stdout);
    assert.deepEqual([json.status, told.ok, told.exit, told.model, told.file, told.sidecar, told.kind], [0, true, 0, 'Vehicles/bike', '3d/Vehicles/bike/source/bike.glb', '', 'motorcycle']);
    assert.deepEqual(told.box, { length: 2.1, width: 0.8, height: 0.9, min: [-1.05, 0, -0.4], max: [1.05, 0.9, 0.4] });
    assert.deepEqual(told.meshes.map(mesh => [mesh.index, mesh.names, mesh.triangles]), [[0, ['Body'], 132], [1, ['FrontWheel'], 80], [2, ['RearWheel'], 80]]);
    assert.deepEqual(told.pieces.list.map(piece => [piece.number, piece.triangles, piece.runs]), [[0, 12, [[0, 12]]], [1, 96, [[12, 96]]], [2, 12, [[108, 12]]], [3, 12, [[120, 12]]]]);
    assert.deepEqual(snapshot(project), before);
    // What it refuses, and how it is asked.
    assert.deepEqual([run('describe-model', [project, 'Vehicles/none']).status, run('describe-model', [project, 'Vehicles/none']).stdout], [1, 'refused: 3d/Vehicles/none/source/none.glb is missing.\n']);
    assert.equal(run('describe-model', [project, 'Vehicles/bike', '--pieces', '7']).status, 1, 'a mesh the model does not have');
    assert.equal(run('describe-model', [project, 'Vehicles/bike', '--kind', 'unicycle']).status, 1);
    assert.equal(run('describe-model', [project]).status, 2);
    assert.equal(run('describe-model', [project, 'Vehicles/bike', '--shiny']).status, 2);
    assert.equal(run('describe-model', [path.join(project, 'nowhere'), 'Vehicles/bike']).status, 2);
});

test('connected pieces: triangles joined through vertices at one place are one piece', () => {
    const one = box(0, 1, 0, 1, 0, 1, 3), two = join([box(0, 1, 0, 1, 0, 1), box(2, 3, 0, 1, 0, 1)]);
    assert.deepEqual(Carver.pieces(new Float32Array(one.positions), new Uint16Array(one.index), 0.001).map(piece => [piece.triangles, piece.runs, piece.box]), [[36, [[0, 36]], [0, 1, 0, 1, 0, 1]]],
        'three slices that share their faces\' vertices by place, not by number, are welded');
    assert.deepEqual(Carver.pieces(new Float32Array(two.positions), new Uint16Array(two.index), 0.001).map(piece => [piece.number, piece.triangles, piece.middle]), [[0, 12, [0.5, 0.5, 0.5]], [1, 12, [2.5, 0.5, 0.5]]]);
    // No index: three vertices a triangle, in order. A gap wider than the weld keeps two pieces apart; one narrower joins them.
    const loose = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1.0004, 0, 0, 2, 0, 0, 1, 1, 0];
    assert.equal(Carver.pieces(new Float32Array(loose), null, 0.001).length, 1);
    assert.equal(Carver.pieces(new Float32Array(loose), null, 0.0001).length, 2);
    assert.deepEqual(Carver.runsOf([0, 1, 2, 7, 8, 20]), [[0, 3], [7, 2], [20, 1]]);
});

//-----------------------------------------------------------------------------
// The four in order.

test('describe-model, make-vehicle, place-vehicle and validate-vehicles in that order leave a project that passes', t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    assert.equal(run('describe-model', [project, 'Vehicles/bike']).status, 0);
    const empty = run('validate-vehicles', [project]);
    assert.deepEqual([empty.status, empty.stdout.trim().split('\n').pop()], [0, 'No vehicles in this project.']);

    const made = run('make-vehicle', [project, ...MAKE, '--size', '3.5']);
    assert.equal(made.status, 0, said(made));
    assert.match(made.stdout, /^added 1$/m);
    assert.match(made.stdout, /^Motorcycle \(1\): Vehicles\/bike at 3\.5 tiles, set by --size$/m);
    assert.match(made.stdout, /^wrote data\/ReactorVehicles\.json$/m);
    const types = read(project, 'data/ReactorVehicles.json');
    assert.equal(types.length, 2);
    assert.deepEqual([types[0], types[1].id, types[1].name, types[1].kind, types[1].model], [null, 1, 'Motorcycle', 'motorcycle', { name: 'Vehicles/bike', file: 'bike', size: 3.5 }]);
    if (modelSide) {
        assert.match(made.stdout, /^ {2}front {7}-x \(guessed: the hands find the bars at this end/m);
        assert.match(made.stdout, /^ {2}wheels {6}2 found: 0\.5 and 0\.5 tiles$/m, 'a 0.3 radius at 3.5 tiles over 2.1 units');
        assert.match(made.stdout, /^ {2}sounds {6}engine drone-01, start powerup-01, stop equip-01, bump hit-01, land hit-02$/m);
        assert.match(made.stdout, /^wrote 3d\/Vehicles\/bike\/model\.json$/m);
        assert.deepEqual(Object.keys(types[1].sounds), ['engine', 'start', 'stop', 'bump', 'land'], 'no tool leaves the engine silent');
        const block = read(project, '3d/Vehicles/bike/model.json').vehicle;
        assert.deepEqual([block.forward, block.wheels, block.guessed], ['-x', ['FrontWheel', 'RearWheel'], ['forward', 'seats', 'wheels', 'controls']]);
        assert.deepEqual(block.seats[0].seat, { at: [0.273, 0.9, 0] }, 'the seat on top of the body');
        assert.deepEqual([block.seats[0].footL.at[1], block.seats[0].footR.at[1]], [0.36, 0.36], 'each foot set down on its peg');
        assert.ok(Math.abs(block.seats[0].handL.at[0] + 0.38) <= 0.05 && block.seats[0].handL.at[2] > 0.2, 'the left hand on the bar, on the left');
        assert.deepEqual([block.controls.length, block.controls[0].input, block.controls[0].part], [1, 'steer', ''], 'no carved part: the hands swing, the model does not');
    }

    const placed = run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '28,3', '--yaw', '180']);
    assert.equal(placed.status, 0, said(placed));
    assert.match(placed.stdout, /^placed 002 Motorcycle at \(28, 3\), standing at height 0, facing south \(180\)$/m);
    assert.match(placed.stdout, /^wrote data\/Map001\.json\nwrote data\/System\.json$/m);
    assert.notEqual(read(project, 'data/System.json').versionId, 1, 'the game is told its maps changed');
    assert.deepEqual(read(project, 'data/Map001.json').events[2], S.vehicleEvent(2, 28, 3, { type: 1, yaw: 180, name: 'Motorcycle' }));

    const checked = run('validate-vehicles', [project]);
    assert.equal(checked.status, 0, said(checked));
    assert.match(checked.stdout, /^ok {3}Motorcycle \(1\): motorcycle, Vehicles\/bike at 3\.5 tiles, on the maps 1 time\(s\)$/m);
    assert.match(checked.stdout, /^ok {5}002 Motorcycle on Yard at \(28, 3\), facing south \(180\): Motorcycle$/m);
    assert.match(checked.stdout, /^note Ren has no 3D skeleton: nobody is shown on the seat\.$/m);
    assert.doesNotMatch(checked.stdout, /^FIX/m);
    assert.match(checked.stdout.trim().split('\n').pop(), modelSide ? /^Ready to ride\. 3 notes\.$/ : /^Ready to ride\. \d notes\.$/, 'the last line: nothing to fix');
    if (modelSide) {
        assert.match(checked.stdout, /^note Vehicles\/bike: nobody has confirmed which end is the front\. The game takes -x \(make-vehicle\.cjs --front -x confirms it\)\.$/m);
        assert.match(checked.stdout, /^note Motorcycle: nothing on the model turns with the steering\.$/m);
    }
    // Notes pass; --strict does not let them.
    assert.equal(run('validate-vehicles', [project, '--strict']).status, 1);
    const json = JSON.parse(run('validate-vehicles', [project, '--json']).stdout);
    assert.deepEqual([json.ok, json.exit, json.sentence.startsWith('Ready to ride.'), json.types.length, json.vehicles.length], [true, 0, true, 1, 1]);
    for (const line of json.lines) {
        assert.deepEqual(Object.keys(line).slice(0, 6), ['key', 'level', 'text', 'args', 'file', 'path'], 'every line: key, level, text, args, file, path');
        assert.ok(line.key.startsWith('vehicleCheck.') && ['fix', 'note'].includes(line.level) && typeof line.file === 'string' && line.file && typeof line.path === 'string');
    }
    assert.deepEqual(json.lines.find(line => line.key === 'vehicleCheck.noSkeleton'), { key: 'vehicleCheck.noSkeleton', level: 'note', text: 'Ren has no 3D skeleton: nobody is shown on the seat.', args: { rider: 'Ren' }, file: 'data/Database.r3d.json', path: 'actors.1' });
});

test('make-vehicle run twice adds once and updates once, and keeps what a hand wrote', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    assert.match(run('make-vehicle', [project, ...MAKE]).stdout, /^added 1$/m);
    const first = read(project, 'data/ReactorVehicles.json'), block = fs.readFileSync(path.join(project, '3d/Vehicles/bike/model.json'), 'utf8');
    // By hand: a word on the label, a number, a point moved.
    first[1].prompt = 'Saddle up'; first[1].handling = { speed: 24 };
    fs.writeFileSync(path.join(project, 'data/ReactorVehicles.json'), JSON.stringify(first));
    const moved = JSON.parse(block);
    moved.vehicle.seats[0].seat.at = [0.25, 0.9, 0];
    moved.custom = { kept: true };
    fs.writeFileSync(path.join(project, '3d/Vehicles/bike/model.json'), JSON.stringify(moved));
    const again = run('make-vehicle', [project, ...MAKE, '--size', '3']);
    assert.equal(again.status, 0, said(again));
    assert.match(again.stdout, /^updated 1$/m);
    const second = read(project, 'data/ReactorVehicles.json');
    assert.equal(second.length, 2, 'one record');
    assert.deepEqual([second[1].prompt, second[1].handling, second[1].model.size, second[1].sounds.engine.name], ['Saddle up', { speed: 24 }, 3, 'drone-01']);
    assert.deepEqual(read(project, '3d/Vehicles/bike/model.json'), moved, 'a block the model already has is kept');
    assert.doesNotMatch(again.stdout, /wrote 3d\/Vehicles\/bike\/model\.json/);
    // --reguess writes the guess over it; every other key of the file stays.
    const reguessed = run('make-vehicle', [project, ...MAKE, '--reguess']);
    assert.equal(reguessed.status, 0, said(reguessed));
    const after = read(project, '3d/Vehicles/bike/model.json');
    assert.deepEqual([after.vehicle.seats[0].seat.at, after.custom], [[0.273, 0.9, 0], { kept: true }]);
    assert.match(reguessed.stdout, /at 3 tiles, the record's size$/m, 'no size said: the record keeps its own');
    // --front says which end, and so confirms it.
    const fronted = run('make-vehicle', [project, ...MAKE, '--front', '-x']);
    assert.equal(fronted.status, 0, said(fronted));
    assert.match(fronted.stdout, /^ {2}front {7}-x \(said with --front\)$/m);
    assert.deepEqual(read(project, '3d/Vehicles/bike/model.json').vehicle.guessed, ['seats', 'wheels', 'controls']);
    assert.doesNotMatch(run('validate-vehicles', [project]).stdout, /confirmed which end/);
    // Another name is another type; --id names the record to write over; a name another record has is taken.
    assert.match(run('make-vehicle', [project, '--name', 'Dirt bike', '--kind', 'motorcycle', '--model', 'Vehicles/bike']).stdout, /^added 2$/m);
    // (What a hand set on record 2 is the record's own under its new name too: its size, its engine's volume.)
    const tuned = read(project, 'data/ReactorVehicles.json');
    tuned[2].model.size = 4; tuned[2].sounds.engine.volume = 55;
    fs.writeFileSync(path.join(project, 'data/ReactorVehicles.json'), JSON.stringify(tuned));
    const renamed = run('make-vehicle', [project, '--name', 'Trail bike', '--kind', 'motorcycle', '--model', 'Vehicles/bike', '--id', '2']);
    assert.match(renamed.stdout, /^updated 2$/m);
    assert.match(renamed.stdout, /^Trail bike \(2\): Vehicles\/bike at 4 tiles, the record's size$/m, 'the record at that place is the one read, whatever it was called');
    assert.deepEqual(read(project, 'data/ReactorVehicles.json').map(type => type && type.name), [null, 'Motorcycle', 'Trail bike']);
    assert.deepEqual([read(project, 'data/ReactorVehicles.json')[2].model.size, read(project, 'data/ReactorVehicles.json')[2].sounds.engine], [4, { name: 'drone-01', volume: 55, pitch: 100 }]);
    const taken = run('make-vehicle', [project, '--name', 'Motorcycle', '--kind', 'motorcycle', '--model', 'Vehicles/bike', '--id', '2']);
    assert.deepEqual([taken.status, taken.stdout], [1, 'refused: Another type is already named Motorcycle (1).\nnothing written\n']);
});

test('make-vehicle takes a Spin motion off a part it made a wheel, and copies the stock sounds a project lacks', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'), { sounds: false });
    const sidecar = path.join(project, '3d/Vehicles/bike/model.json');
    fs.writeFileSync(sidecar, JSON.stringify({ animations: [{ name: 'roll', part: 'RearWheel', type: 'spin', axis: 'z', trigger: 'moving', speed: 120 }, { name: 'sway', part: 'Body', type: 'swing', axis: 'x', trigger: 'always', degrees: 2, period: 90 }], surface: { reflect: 1, gloss: 0.9, metal: 0, tint: '#ffffff' } }));
    // The sounds are not in the project and nowhere to copy from: said, and nothing written.
    const before = snapshot(project);
    const silent = run('make-vehicle', [project, ...MAKE, '--size', '3.5']);
    assert.equal(silent.status, 1, said(silent));
    assert.match(silent.stdout, /^FIX {2}Motorcycle: the sound audio\/se\/drone-01\.ogg is missing\.$/m);
    assert.match(silent.stdout, /^nothing written$/m);
    assert.match(silent.stdout.trim().split('\n').pop(), /^Not ready to ride\. To fix: 5\.$/);
    assert.deepEqual(snapshot(project), before);
    // With a folder that holds the kind's stock sounds: copied into audio/se, named in the record.
    const stock = temp(t, 'rr-vehicle-stock-');
    for (const name of ['drone-01', 'powerup-01', 'equip-01', 'hit-01', 'hit-02']) fs.writeFileSync(path.join(stock, name + '.ogg'), 'sound ' + name);
    const made = run('make-vehicle', [project, ...MAKE, '--size', '3.5', '--sounds-from', stock]);
    assert.equal(made.status, 0, said(made));
    assert.match(made.stdout, /^wrote audio\/se\/drone-01\.ogg$/m);
    assert.equal(fs.readFileSync(path.join(project, 'audio/se/hit-02.ogg'), 'utf8'), 'sound hit-02');
    assert.match(made.stdout, /^ {2}motions {5}removed roll: a wheel rolls with the road$/m);
    const json = read(project, '3d/Vehicles/bike/model.json');
    assert.deepEqual(json.animations.map(rule => rule.name), ['sway'], 'the wheel\'s Spin is gone, the other motion stays');
    assert.deepEqual([Object.keys(json), json.surface.gloss], [['animations', 'surface', 'vehicle'], 0.9], 'every other key kept');
    assert.doesNotMatch(run('validate-vehicles', [project]).stdout, /Spin motion/);
});

test('a type is its place in the list for every tool: a record a hand wrote with no id, or with another id', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const hand = more => Object.assign({ name: 'Motorcycle', kind: 'motorcycle', model: { name: 'Vehicles/bike', file: 'bike', size: 3.5 } }, more);
    // No id (its default is the list index): type 1 for the placer, the validator and the maker alike.
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    fs.writeFileSync(path.join(project, 'data/ReactorVehicles.json'), JSON.stringify([null, hand()]));
    const placed = run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '28,3', '--yaw', '180']);
    assert.equal(placed.status, 0, said(placed));
    assert.deepEqual(read(project, 'data/Map001.json').events[2].rrVehicle, { type: 1, yaw: 180 });
    const checked = run('validate-vehicles', [project]);
    assert.match(checked.stdout, /^ok {3}Motorcycle \(1\): motorcycle, Vehicles\/bike at 3\.5 tiles, on the maps 1 time\(s\)$/m);
    assert.match(checked.stdout, /^ok {5}002 Motorcycle on Yard at \(28, 3\), facing south \(180\): Motorcycle$/m);
    assert.doesNotMatch(checked.stdout, /not in the Database|"id" is/);
    const made = run('make-vehicle', [project, ...MAKE, '--size', '3']);
    assert.equal(made.status, 0, said(made));
    assert.match(made.stdout, /^updated 1$/m, 'the record of that name is updated where it is');
    assert.deepEqual(read(project, 'data/ReactorVehicles.json').map(type => type && [type.id, type.name, type.model.size]), [null, [1, 'Motorcycle', 3]], 'one record, its id now written');
    assert.equal(run('validate-vehicles', [project]).status, 0);

    // An id that says 2 on the record in place 1: the game has it as type 1, and so has every tool.
    const other = projectIn(temp(t, 'rr-vehicle-tools-'));
    fs.writeFileSync(path.join(other, 'data/ReactorVehicles.json'), JSON.stringify([null, hand({ id: 2 })]));
    const before = snapshot(other);
    const refused = run('place-vehicle', [other, '1', '--vehicle', '2', '--at', '28,3']);
    assert.deepEqual([refused.status, refused.stdout], [1, 'refused: vehicle type 2 is not in the Database.\nnothing written\n']);
    assert.deepEqual(snapshot(other), before);
    assert.equal(run('place-vehicle', [other, '1', '--vehicle', '1', '--at', '28,3', '--yaw', '180']).status, 0);
    assert.equal(read(other, 'data/Map001.json').events[2].rrVehicle.type, 1, 'the row carries the place, not the record\'s id');
    const noted = run('validate-vehicles', [other]);
    assert.match(noted.stdout, /^note Motorcycle: "id" is 2, but it is number 1 in the list\. The game goes by its place: 1\.$/m);
    assert.match(noted.stdout, /^ok {5}002 Motorcycle on Yard at \(28, 3\), facing south \(180\): Motorcycle$/m, said(noted));
    assert.doesNotMatch(noted.stdout, /not in the Database/);
    const json = JSON.parse(run('validate-vehicles', [other, '--json']).stdout).lines.find(line => line.key === 'vehicleCheck.idDiffers');
    assert.deepEqual([json.file, json.path, json.value, json.typeId], ['data/ReactorVehicles.json', '[1].id', 1, 1], 'with what to write');
    // --id names a place; a record of that name elsewhere is another type, told by its place.
    assert.match(run('make-vehicle', [other, '--name', 'Motorcycle', '--kind', 'motorcycle', '--model', 'Vehicles/bike', '--id', '2']).stdout, /^refused: Another type is already named Motorcycle \(1\)\.$/m);
    assert.match(run('make-vehicle', [other, ...MAKE, '--id', '1']).stdout, /^updated 1$/m);
    assert.deepEqual(read(other, 'data/ReactorVehicles.json').map(type => type && type.id), [null, 1]);
    const after = run('validate-vehicles', [other]);
    assert.doesNotMatch(after.stdout, /"id" is/, 'written back, the id says its place');
    assert.equal(after.status, 0, said(after));
});

test('--fit writes the size the fit answers and says who set the limit; --strict stops at a note', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const Make = require('../build-scripts/make-vehicle.cjs');
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    // Two party members with a 3D body (any model stands in for one: the fit itself is handed in below).
    fs.writeFileSync(path.join(project, 'data/System.json'), JSON.stringify({ partyMembers: [1, 2], versionId: 1, startMapId: 1, startX: 2, startY: 2 }));
    // (Their ids are not their places in the list: an actor is the one at its place, as the game finds it.)
    fs.writeFileSync(path.join(project, 'data/Actors.json'), JSON.stringify([null, { id: 9, name: 'Ren' }, { id: 8, name: 'Mira' }]));
    fs.writeFileSync(path.join(project, 'data/Database.r3d.json'), JSON.stringify({ actors: { 1: { character: { name: 'Vehicles/bike', file: 'bike', size: 2 } }, 2: { character: { name: 'Vehicles/bike', file: 'bike', size: 2 } } } }));
    const point = (more = {}) => Object.assign({ part: '', surface: 0, reach: 0.9, reachAtLock: 0.95, short: 0, toward: [1, 0, 0], ok: true }, more);
    const asked = [];
    // The game's fit, in small: the size it answers, the second rider as the one who set it, and a report at any size.
    const fitting = (answer) => Object.assign({}, loaded, { Rider: {
        fitSize: (riders, vehicle, block, kind) => { asked.push([riders.length, kind, !!vehicle, block.seats.length]); return Object.assign({ reports: [] }, answer); },
        fit: (rider, vehicle, block, size) => ({ size, seated: true, lean: 40, hips: { over: 0.18 }, points: { handL: point(), handR: point(), footL: point({ knee: 64 }), footR: point({ knee: 64 }) }, foot: { side: 'left', reachesGround: true, short: 0 }, ok: true })
    } });
    const dry = Make.make(project, { name: 'Motorcycle', kind: 'motorcycle', model: 'Vehicles/bike', fit: true, check: true }, fitting({ size: 2.7, limitedBy: 1, reason: 'reach' }));
    assert.deepEqual([dry.exit, dry.refused, dry.size, dry.fittedTo, dry.wrote], [0, '', 2.7, 'Mira', []]);
    assert.equal(dry.head, 'Motorcycle (1): Vehicles/bike at 2.7 tiles, fitted to Mira (the shortest reach)');
    assert.deepEqual(asked, [[2, 'motorcycle', true, 1]], 'every starting party member with a 3D body, the model and its block');
    assert.match(dry.report.find(line => /left hand/.test(line)), /reaches at 90% of the arm \(95% at full lock\)$/, 'the fit report is of the one who set the limit');
    const done = Make.make(project, { name: 'Motorcycle', kind: 'motorcycle', model: 'Vehicles/bike', fit: true }, fitting({ size: 3.1, limitedBy: 0, reason: 'foot' }));
    assert.deepEqual([done.exit, done.size, done.head], [0, 3.1, 'Motorcycle (1): Vehicles/bike at 3.1 tiles, fitted to Ren (a foot reaches the ground)']);
    assert.equal(read(project, 'data/ReactorVehicles.json')[1].model.size, 3.1, 'the size the fit answered, as the record\'s own');
    assert.match(Make.make(project, { name: 'Motorcycle', kind: 'motorcycle', model: 'Vehicles/bike', fit: true, check: true }, fitting({ size: 0, limitedBy: -1 })).refused, /^--fit found no size/);
    // A block a hand began, with no front: the fit is asked with the block as the game reads it, its front the one found on the model.
    const begun = projectIn(temp(t, 'rr-vehicle-tools-'));
    for (const name of ['System.json', 'Actors.json', 'Database.r3d.json']) fs.copyFileSync(path.join(project, 'data', name), path.join(begun, 'data', name));
    fs.writeFileSync(path.join(begun, '3d/Vehicles/bike/source/bike.glb'), bikeGlb(SHAPELY));
    fs.writeFileSync(path.join(begun, '3d/Vehicles/bike/model.json'), JSON.stringify({ vehicle: { wheels: ['FrontWheel', 'RearWheel'] } }));
    const fronts = [];
    const watching = Object.assign({}, loaded, { Rider: { fitSize: (riders, vehicle, block) => { fronts.push(block.forward); return { size: 3, limitedBy: 0, reason: 'reach', reports: [] }; }, fit: () => null } });
    assert.equal(Make.make(begun, { name: 'Motorcycle', kind: 'motorcycle', model: 'Vehicles/bike', fit: true, check: true }, watching).exit, 0);
    assert.deepEqual(fronts, ['-x'], 'the bars are at -x');
    V.forget();
    assert.match(Make.make(project, { name: 'Motorcycle', kind: 'motorcycle', model: 'Vehicles/bike', fit: true, check: true }, Object.assign({}, loaded, { Rider: null, riderSide: 'reactor_3d_rider.js is not in the runtime' })).refused, /^--fit cannot work: reactor_3d_rider\.js is not in the runtime\. Pass --size\.$/);

    // --strict: a note refuses too, and nothing is written.
    const strict = projectIn(temp(t, 'rr-vehicle-tools-'));
    const before = snapshot(strict);
    const stopped = run('make-vehicle', [strict, ...MAKE, '--size', '3.5', '--strict']);
    assert.equal(stopped.status, 1, said(stopped));
    assert.match(stopped.stdout, /^note Vehicles\/bike: nobody has confirmed which end is the front\. The game takes -x \(make-vehicle\.cjs --front -x confirms it\)\.$/m);
    assert.match(stopped.stdout, /^nothing written$/m);
    assert.deepEqual(snapshot(strict), before);
    assert.equal(run('make-vehicle', [strict, ...MAKE, '--size', '3.5']).status, 0, 'without it the notes pass');
});

test('a vehicle\'s body follows its heading, and a parked vehicle is in the way with its whole body', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    assert.equal(run('make-vehicle', [project, ...MAKE, '--size', '3.5']).status, 0);
    const at = (place, yaw) => { const done = run('place-vehicle', [project, '1', '--vehicle', '1', '--at', place, '--yaw', String(yaw), '--check']); return [done.status, done.stdout.trim().split('\n')[0].replace(/^(placed|refused).*?: ?/, '$1 ').replace(/^placed.*/, 'placed')]; };
    // Three tiles long, one wide, lying along the way it faces: on the top row it fits east and west, on the left column north and south.
    assert.deepEqual([0, 90, 180, 270].map(yaw => at('28,0', yaw)[0]), [1, 0, 1, 0], 'on the map\'s top row');
    assert.deepEqual([0, 90, 180, 270].map(yaw => at('0,28', yaw)[0]), [0, 1, 0, 1], 'on its left column');
    assert.deepEqual([0, 90, 180, 270].map(yaw => at('199,28', yaw)[0]), [0, 1, 0, 1], 'on its right column');
    assert.deepEqual([0, 90, 180, 270].map(yaw => at('28,159', yaw)[0]), [1, 0, 1, 0], 'on its bottom row');
    assert.deepEqual(at('28,0', 0), [1, 'refused Motorcycle does not fit here.']);
    assert.deepEqual([0, 90].map(yaw => at('28,1', yaw)[0]), [0, 0], 'one tile in, every heading fits');
    // One parked at (60, 60) facing south covers (60, 59) to (60, 61).
    assert.equal(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '60,60', '--yaw', '180']).status, 0);
    assert.deepEqual(at('60,61', 90), [1, 'refused Something is already here.'], 'its tail\'s tile is taken, though its event stands a tile away');
    assert.deepEqual(at('61,61', 90), [1, 'refused Motorcycle does not fit here.'], 'another one lying across its tail does not fit');
    assert.deepEqual(at('61,61', 180), [0, 'placed'], 'beside it, nose to the same way, it does');
    assert.deepEqual(at('60,63', 180), [0, 'placed'], 'and behind it with a tile between');
    assert.deepEqual(at('60,62', 180), [1, 'refused Motorcycle does not fit here.'], 'nose on its tail it does not');
    // The validator sees the same bodies: one forced across the first is told, and so is the first.
    assert.equal(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '61,61', '--yaw', '90', '--force']).status, 0);
    const checked = run('validate-vehicles', [project]);
    assert.deepEqual((checked.stdout.match(/^FIX {2}Motorcycle \(00\d\) on Yard stands where it does not fit\..*$/gm) || []).length, 2, said(checked));
});

test('place-vehicle writes how it is boarded, its name for scripts and the event\'s own name; a body\'s front is its model\'s', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    assert.equal(run('make-vehicle', [project, ...MAKE, '--size', '3.5']).status, 0);
    const placed = run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '50,50', '--face', 'w', '--board', 'command', '--key', 'bike', '--name', 'Old bike']);
    assert.equal(placed.status, 0, said(placed));
    assert.match(placed.stdout, /^placed 002 Old bike at \(50, 50\), standing at height 0, facing west \(270\), named bike, boarded by a command$/m);
    assert.deepEqual([read(project, 'data/Map001.json').events[2].name, read(project, 'data/Map001.json').events[2].rrVehicle], ['Old bike', { type: 1, yaw: 270, board: 'command', key: 'bike' }]);
    assert.match(placed.stdout, /^note Motorcycle \(002\) is boarded only by a command, and no event has Get On Vehicle for it\.$/m, 'the validator\'s line for the vehicle just placed');
    assert.deepEqual(read(project, 'data/Map001.json').events[2], S.vehicleEvent(2, 50, 50, { type: 1, yaw: 270, board: 'command', key: 'bike', name: 'Old bike' }));
    assert.equal(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '60,50', '--board', 'ok']).status, 0);
    assert.deepEqual(read(project, 'data/Map001.json').events[3].rrVehicle, { type: 1 }, 'OK boards: nothing to say; no facing asked: the event\'s own');
    for (const bad of [['--board', 'key'], ['--face', 'up'], ['--yaw', 'south'], ['--yaw', '90', '--face', 'e']]) assert.equal(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '70,50', ...bad]).status, 2, bad.join(' '));

    // A model wider at its tail than at its nose: which tiles it covers depends on which end is its front.
    const wide = projectIn(temp(t, 'rr-vehicle-tools-'));
    fs.writeFileSync(path.join(wide, '3d/Vehicles/bike/source/bike.glb'), bikeGlb(SHAPELY.concat([box(0.75, 1.05, 0, 0.3, -0.9, 0.9)])));
    const at = (folder, place, yaw) => run('place-vehicle', [folder, '1', '--vehicle', '1', '--at', place, '--yaw', String(yaw), '--check']).stdout.trim().split('\n')[0].replace(/^placed.*/, 'placed');
    // The file names no front: the game finds the bars at -x, so facing north the wide tail lies south, over the event at (30, 30).
    fs.writeFileSync(path.join(wide, 'data/ReactorVehicles.json'), JSON.stringify([null, { name: 'Trike', kind: 'motorcycle', model: { name: 'Vehicles/bike', file: 'bike', size: 3.5 } }]));
    assert.deepEqual([at(wide, '29,29', 0), at(wide, '29,31', 0), at(wide, '29,31', 180)], ['refused (29, 29): Trike does not fit here.', 'placed', 'refused (29, 31): Trike does not fit here.'],
        'north of the event, tail to it; south of it, nose to it; south of it turned round, tail to it again');
    // The file says its front is the other end: the same places, the other way round.
    fs.writeFileSync(path.join(wide, '3d/Vehicles/bike/model.json'), JSON.stringify({ vehicle: { forward: '+x' } }));
    assert.deepEqual([at(wide, '29,29', 0), at(wide, '29,31', 0)], ['placed', 'refused (29, 31): Trike does not fit here.']);
    // Without the game's vehicle code the file's own word still turns the body: the wide tail is the end behind the front it names.
    V.forget();
    const bare = Object.assign({}, loaded, { Vehicles: null, Rider: null });
    const rows = forward => {
        fs.writeFileSync(path.join(wide, '3d/Vehicles/bike/model.json'), JSON.stringify({ vehicle: forward ? { forward } : {} }));
        const data = V.read(wide), tiles = V.lookups(wide, data, bare).body(data.maps[0], { x: 0, y: 0 }, { name: 'Vehicles/bike', file: 'bike', ext: '.glb', size: 3.5 }, 0);
        // The row that is three tiles wide: where the tail lies, heading north.
        return [-1, 0, 1].filter(y => tiles.filter(tile => tile[1] === y).length === 3);
    };
    assert.deepEqual([rows('-x'), rows('+x'), rows('')], [[1], [-1], [-1]], 'front -x: the tail is south; front +x, and no word at all: north');
    V.forget();
});

test('place-vehicle --force never puts an event off the map', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    assert.equal(run('make-vehicle', [project, ...MAKE, '--size', '3.5']).status, 0);
    const before = snapshot(project);
    for (const place of ['-5,-5', '200,3', '3,160', '-1,3']) {
        const forced = run('place-vehicle', [project, '1', '--vehicle', '1', '--at', place, '--force']);
        assert.deepEqual([forced.status, forced.stdout], [1, `refused (${place.replace(',', ', ')}): Off the map.\nnothing written\n`], place);
        assert.deepEqual(snapshot(project), before, `${place}: nothing written`);
        const json = JSON.parse(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', place, '--force', '--json']).stdout);
        assert.deepEqual([json.ok, json.exit, json.wrote, json.lines[0].text], [false, 1, [], 'Off the map.']);
    }
    // On the map, a place the stand test refuses is still taken when forced.
    assert.equal(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '30,30', '--force']).status, 0);
    // In memory too: the order is refused whatever it forces, and the map is left as it was.
    const Placer = require('../build-scripts/place-vehicle.cjs');
    const map = { width: 10, height: 10, tilesetId: 1, note: '', data: new Array(600).fill(1), events: [null] };
    const off = Placer.place(map, { type: 1, x: 12, y: 3, force: true }, { VehicleSetup: S, BattleCheck: loaded.BattleCheck, types: [null, { name: 'Bike' }], lookups: { tilesets: [null, { id: 1, flags: [0x10, 0x10] }] } });
    assert.deepEqual([off.placed, off.refused.map(refusal => [refusal.text, refusal.hard]), map.events], [null, [['Off the map.', true]], [null]]);
});

test('the front: a front mark on a use of the model, the file\'s own word before it, and a word the game cannot read', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    const side = read(project, 'data/Map001.r3d.json');
    const mark = front => { side.events = { 1: { 0: { name: 'Vehicles/bike', file: 'bike', size: 2, faces: { front } } }, 9: { 0: { name: 'Props/crate', faces: { front: [0, 0, 1] } } } }; fs.writeFileSync(path.join(project, 'data/Map001.r3d.json'), JSON.stringify(side)); };
    // Someone marked the front of this model on a map: that decides, and it is no guess.
    mark([0.9, 0.05, 0.1]);
    const marked = run('describe-model', [project, 'Vehicles/bike']);
    assert.match(marked.stdout, /^front {7}\+x \(a front mark on Map001 event 1 says so\)$/m, 'though the bars are at the other end');
    assert.deepEqual(JSON.parse(run('describe-model', [project, 'Vehicles/bike', '--json']).stdout).front, { forward: '+x', why: 'a front mark on Map001 event 1 says so', guessed: false });
    assert.deepEqual(require('../build-scripts/describe-model.cjs').frontMarks(project, 'Vehicles/bike'), [{ front: [0.9, 0.05, 0.1], where: 'Map001 event 1' }], 'only the uses of this model');
    mark([-0.9, 0.05, 0.1]);
    const made = run('make-vehicle', [project, ...MAKE, '--size', '3.5']);
    assert.equal(made.status, 0, said(made));
    assert.match(made.stdout, /^ {2}front {7}-x \(a front mark on Map001 event 1 says so\)$/m);
    assert.deepEqual([read(project, '3d/Vehicles/bike/model.json').vehicle.forward, read(project, '3d/Vehicles/bike/model.json').vehicle.guessed], ['-x', ['seats', 'wheels', 'controls']], 'written as a front somebody confirmed');
    // The model's own file now names its front: that comes before any mark.
    mark([0.9, 0.05, 0.1]);
    assert.match(run('describe-model', [project, 'Vehicles/bike']).stdout, /^front {7}-x \(the model's file says so\)$/m);
    // A front the game's reader does not take is no front: the finder answers, and the tool says what it could not read.
    for (const word of ['-X', 'x', 'north']) {
        const json = read(project, '3d/Vehicles/bike/model.json');
        json.vehicle.forward = word;
        fs.writeFileSync(path.join(project, '3d/Vehicles/bike/model.json'), JSON.stringify(json));
        const told = run('describe-model', [project, 'Vehicles/bike']);
        assert.equal(told.status, 0, said(told));
        assert.match(told.stdout, /^front {7}\+x \(a front mark on Map001 event 1 says so\)$/m, word);
        assert.match(told.stdout, new RegExp(`^note: the file's front "${word}" cannot be read: it is "\\+x", "-x", "\\+z", "-z" or three numbers$`, 'm'));
        const checked = run('validate-vehicles', [project]);
        assert.equal(checked.status, 1, said(checked));
        assert.match(checked.stdout, new RegExp(`^FIX {2}Vehicles/bike: the front "${word}" cannot be read\\. It is "\\+x", "-x", "\\+z", "-z" or three numbers\\. The game takes -x \\(make-vehicle\\.cjs --front -x writes it\\)\\.$`, 'm'),
            'with the end the game takes meanwhile: the one it finds on the model, whatever a mark on a map says');
        assert.doesNotMatch(checked.stdout, /confirmed which end/);
    }
});

test('the smallest record, with no block on its model: the game looks at the model for its front, and the validator says so', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    // A record a hand wrote (no id, no size), no `vehicle` block, an event a hand wrote: all SPEC 3.2 asks for.
    const smallest = (project, shapes) => {
        if (shapes) fs.writeFileSync(path.join(project, '3d/Vehicles/bike/source/bike.glb'), bikeGlb(shapes));
        fs.writeFileSync(path.join(project, 'data/ReactorVehicles.json'), JSON.stringify([null, { name: 'Motorcycle', kind: 'motorcycle', model: { name: 'Vehicles/bike', file: 'bike' } }]));
        const map = read(project, 'data/Map001.json');
        map.events[2] = Object.assign(S.vehicleEvent(2, 28, 3, { type: 1, name: 'Motorcycle' }), { rrVehicle: { type: 1 } });
        fs.writeFileSync(path.join(project, 'data/Map001.json'), JSON.stringify(map));
        return project;
    };
    // On a model with a motorcycle's proportions the guess lies on the model: ready, and every note says what nobody has looked at.
    const shapely = smallest(projectIn(temp(t, 'rr-vehicle-tools-')), SHAPELY);
    const checked = run('validate-vehicles', [shapely]);
    assert.equal(checked.status, 0, said(checked));
    assert.deepEqual(checked.stdout.trim().split('\n').slice(2), [
        'note Motorcycle: no size is set; it is drawn 3.5 tiles. make-vehicle --fit fits it to the party.',
        'note Motorcycle: nothing on the model turns with the steering.',
        'note Motorcycle: no wheels were found. They will not roll.',
        'note Vehicles/bike: nobody has confirmed which end is the front. The game takes -x (make-vehicle.cjs --front -x confirms it).',
        'note Vehicles/bike: the rider\'s points are a guess nobody has looked at.',
        'note Ren has no 3D skeleton: nobody is shown on the seat.',
        'Ready to ride. 6 notes.'
    ], 'the bars are at -x, and the game finds them there: nobody is seated backwards');
    const line = JSON.parse(run('validate-vehicles', [shapely, '--json']).stdout).lines.find(each => each.key === 'vehicleCheck.frontGuess');
    assert.deepEqual([line.text, line.file, line.path, line.value, line.taken], ['Vehicles/bike: nobody has confirmed which end is the front.', '3d/Vehicles/bike/model.json', 'vehicle.forward', '-x', '-x'], 'what to write, for a generator');
    // The checker reads the front as the game does: with the game's own measure of the model, which brings the model with it.
    const model = V.loadModel(shapely, { name: 'Vehicles/bike' }, loaded);
    assert.equal(loaded.Vehicles.read({}, V.readBox(model, loaded)).forward, '-x', 'handed its own box of the template, the game\'s reader looks at the model');
    assert.equal(loaded.Vehicles.read({}, { min: model.box.min, max: model.box.max }).forward, '+x', 'a plain box has no model to look at: the positive end');
    assert.deepEqual([V.readBox(model, loaded) === V.readBox(model, loaded), V.readBox(null, loaded), V.readBox(model, Object.assign({}, loaded, { Vehicles: null })) === V.readBox(model, loaded)], [true, null, true], 'measured once a model');
    // The body the validator and the placer give it lies along the front the game found.
    assert.equal(run('place-vehicle', [shapely, '1', '--vehicle', '1', '--at', '40,0', '--yaw', '90', '--check']).status, 0, 'three tiles long, lying east to west on the top row');
    // make-vehicle on a block a hand began (its wheels, no front, no seat): the block is kept, and the report is of
    // the rider as the game seats him, at the end it finds.
    fs.writeFileSync(path.join(shapely, '3d/Vehicles/bike/model.json'), JSON.stringify({ vehicle: { wheels: ['FrontWheel', 'RearWheel'] } }));
    const kept = run('make-vehicle', [shapely, ...MAKE, '--size', '3.5', '--check']);
    assert.equal(kept.status, 0, said(kept));
    assert.match(kept.stdout, /^ {2}left hand {3}on the body, 0\.02 from the surface$/m, 'in the bar, where a rider seated at the other end would be 0.23 from anything');
    assert.match(kept.stdout, /^ {2}seat {8}0 from the surface$/m);
    assert.match(kept.stdout, /^note Vehicles\/bike: nobody has confirmed which end is the front\. The game takes -x \(make-vehicle\.cjs --front -x confirms it\)\.$/m);

    // On a model whose saddle is not where a motorcycle's is, the same guess sinks the rider into the body: said, with what to run.
    const blocky = smallest(projectIn(temp(t, 'rr-vehicle-tools-')));
    const sunk = run('validate-vehicles', [blocky]);
    assert.equal(sunk.status, 1, said(sunk));
    assert.match(sunk.stdout, /^FIX {2}Motorcycle: the seat holds nothing\. The nearest surface is 0\.25 tiles away\.$/m);
    assert.doesNotMatch(sunk.stdout, /hand holds nothing/, 'the hands are at the end the bars are at');
    assert.match(sunk.stdout, /^note Vehicles\/bike: nobody has confirmed which end is the front\. The game takes -x \(make-vehicle\.cjs --front -x confirms it\)\.$/m);
    // What the line says to run: the front written and confirmed, the points set down on the model. Ready.
    const made = run('make-vehicle', [blocky, ...MAKE, '--front', '-x']);
    assert.equal(made.status, 0, said(made));
    const after = run('validate-vehicles', [blocky]);
    assert.doesNotMatch(after.stdout, /holds nothing|which end|The game takes/, said(after));
    assert.equal(after.status, 0);
    // The same guess written the wrong way round by hand, still listed as a guess: the game takes the file's word,
    // and the finder's word is printed beside it.
    const guessed = projectIn(temp(t, 'rr-vehicle-tools-'));
    assert.equal(run('make-vehicle', [guessed, ...MAKE, '--size', '3.5']).status, 0);
    const json = read(guessed, '3d/Vehicles/bike/model.json');
    json.vehicle.forward = '+x';
    fs.writeFileSync(path.join(guessed, '3d/Vehicles/bike/model.json'), JSON.stringify(json));
    assert.match(run('validate-vehicles', [guessed]).stdout, /^note Vehicles\/bike: nobody has confirmed which end is the front\. The game takes \+x; the front finder says -x \(make-vehicle\.cjs --front -x writes it\)\.$/m);
    V.forget();
});

test('a model file under another name, a sound stored encrypted, a list that is no list, a kind that is no kind', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'), { sounds: false });
    // The one .glb of a folder is the model, whatever it is called; a distance level beside it is not counted.
    const folder = path.join(project, '3d', 'Vehicles', 'shuttle', 'source');
    fs.mkdirSync(folder, { recursive: true });
    fs.copyFileSync(path.join(project, '3d/Vehicles/bike/source/bike.glb'), path.join(folder, 'SciFi_Vehicle22.glb'));
    fs.writeFileSync(path.join(folder, 'SciFi_Vehicle22.lod1.glb'), 'a distance level');
    assert.deepEqual([V.modelFile(project, 'Vehicles/shuttle').file, V.modelFile(project, 'Vehicles/shuttle').relative], ['SciFi_Vehicle22', '3d/Vehicles/shuttle/source/SciFi_Vehicle22.glb']);
    assert.match(run('describe-model', [project, 'Vehicles/shuttle']).stdout, /^Vehicles\/shuttle {3}3d\/Vehicles\/shuttle\/source\/SciFi_Vehicle22\.glb/m);
    // The sounds are in the project, stored encrypted: they are there.
    for (const name of ['drone-01', 'powerup-01', 'equip-01', 'hit-01', 'hit-02']) { fs.mkdirSync(path.join(project, 'audio/se'), { recursive: true }); fs.writeFileSync(path.join(project, 'audio/se', name + '.ogg_'), ''); }
    // (A folder of stock sounds is at hand: none is copied in beside the encrypted one the project already has.)
    const stock = temp(t, 'rr-vehicle-stock-');
    for (const name of ['drone-01', 'powerup-01', 'equip-01', 'hit-01', 'hit-02']) fs.writeFileSync(path.join(stock, name + '.ogg'), 'stock ' + name);
    const made = run('make-vehicle', [project, '--name', 'Shuttle', '--kind', 'motorcycle', '--model', 'Vehicles/shuttle', '--size', '3.5', '--sounds-from', stock]);
    assert.equal(made.status, 0, said(made));
    assert.doesNotMatch(made.stdout, /is missing|wrote audio/);
    assert.deepEqual(fs.readdirSync(path.join(project, 'audio/se')).sort(), ['drone-01.ogg_', 'equip-01.ogg_', 'hit-01.ogg_', 'hit-02.ogg_', 'powerup-01.ogg_']);
    assert.deepEqual(read(project, 'data/ReactorVehicles.json')[1].model, { name: 'Vehicles/shuttle', file: 'SciFi_Vehicle22', size: 3.5 }, 'the file\'s name is written, so the game finds it');
    assert.equal(run('validate-vehicles', [project]).status, 0);
    // Two models in one folder: which one is not guessed.
    fs.copyFileSync(path.join(folder, 'SciFi_Vehicle22.glb'), path.join(folder, 'Other.glb'));
    assert.equal(V.modelFile(project, 'Vehicles/shuttle').glb, null);
    assert.equal(V.modelFile(project, 'Vehicles/shuttle', 'Other').file, 'Other', 'a name given is the one asked for');
    fs.rmSync(path.join(folder, 'Other.glb'));
    // A name that leads out of the project's 3d folder is no model of the project, though a file is there: nothing is read or written.
    fs.mkdirSync(path.join(project, 'outside', 'source'), { recursive: true });
    fs.copyFileSync(path.join(project, '3d/Vehicles/bike/source/bike.glb'), path.join(project, 'outside', 'source', 'outside.glb'));
    assert.deepEqual(['../outside', 'Vehicles/../../outside', './Vehicles/bike', 'Vehicles//bike'].map(name => [V.modelFile(project, name).outside, V.modelFile(project, name).glb]), new Array(4).fill([true, null]));
    assert.deepEqual([V.modelFile(project, 'Vehicles/bike', '../../../outside/source/outside').outside, V.modelFile(project, 'Vehicles/bike').outside, V.modelFile(project, '/Vehicles/bike/').outside], [true, false, false]);
    assert.equal(V.loadModel(project, { name: '../outside' }, loaded), null);
    const kept = snapshot(project);
    const out = run('make-vehicle', [project, '--name', 'Elsewhere', '--kind', 'motorcycle', '--model', '../outside', '--size', '3']);
    assert.deepEqual([out.status, out.stdout], [1, 'refused: ../outside is not a model of this project: a model is a folder under 3d/.\nnothing written\n']);
    assert.equal(run('carve-part', [project, '../outside', '--name', 'Part', '--box', '-9,9,-9,9,-9,9']).status, 1);
    assert.equal(run('describe-model', [project, '../outside']).stdout, 'refused: 3d/../outside/source/outside.glb is missing.\n');
    assert.deepEqual(snapshot(project), kept);
    const typesBefore = fs.readFileSync(path.join(project, 'data/ReactorVehicles.json'), 'utf8');
    fs.writeFileSync(path.join(project, 'data/ReactorVehicles.json'), JSON.stringify([null, { id: 1, name: 'Elsewhere', kind: 'motorcycle', model: { name: '../outside', size: 3 } }]));
    assert.match(run('validate-vehicles', [project]).stdout, /^FIX {2}Elsewhere: the model file 3d\/\.\.\/outside\/source\/outside\.glb is missing\.$/m);
    fs.writeFileSync(path.join(project, 'data/ReactorVehicles.json'), typesBefore);
    // A kind every object answers to: the validator still reports, with no error of its own.
    for (const kind of ['constructor', '__proto__']) {
        const types = read(project, 'data/ReactorVehicles.json');
        types[1].kind = kind;
        fs.writeFileSync(path.join(project, 'data/ReactorVehicles.json'), JSON.stringify(types));
        const odd = run('validate-vehicles', [project]);
        assert.deepEqual([odd.status, odd.stderr], [1, ''], said(odd));
        assert.match(odd.stdout, new RegExp(`^FIX {2}Shuttle: ${kind} is not a kind of vehicle\\.$`, 'm'));
        assert.equal(odd.stdout.trim().split('\n').pop(), 'Not ready to ride. To fix: 1.');
        const dry = run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '28,3', '--check']);
        assert.deepEqual([dry.status, dry.stderr], [0, ''], said(dry));
    }
    // A type file that holds something other than a list.
    fs.writeFileSync(path.join(project, 'data/ReactorVehicles.json'), JSON.stringify({ 1: { id: 1, name: 'Shuttle' } }));
    const lost = run('validate-vehicles', [project]);
    assert.deepEqual([lost.status, /^FIX {2}data\/ReactorVehicles\.json cannot be read \(not valid JSON\)\.$/m.test(lost.stdout), lost.stdout.trim().split('\n').pop()], [1, true, 'Not ready to ride. To fix: 1.']);
    assert.match(run('make-vehicle', [project, ...MAKE]).stdout, /^refused: data\/ReactorVehicles\.json cannot be read \(not a list\)\.$/m);
});

test('a model with a skeleton of its own is measured where its bones hold it at rest', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    fs.mkdirSync(path.join(project, '3d/Mounts/mount/source'), { recursive: true });
    fs.writeFileSync(path.join(project, '3d/Mounts/mount/source/mount.glb'), mountGlb());
    V.forget();
    const model = V.loadModel(project, { name: 'Mounts/mount' }, loaded);
    assert.deepEqual([model.measured, model.meshes.length, model.skinned.length, model.skinned[0].triangles, model.skinned[0].vertices], [true, 0, 1, 12, 8]);
    const near = list => list.map(value => Math.round(value * 1000) / 1000 + 0);
    assert.deepEqual([near(model.box.min), near(model.box.max), near(model.size), near([model.longest])], [[-0.25, 0, -1], [0.25, 1, 1], [0.5, 1, 2], [2]],
        'the box of the skinned mesh as its joint turns it: long along z, not along the x its vertices were written on');
    assert.deepEqual(near([model.surface([0, 1, 0.9]), model.surface([0, 1.5, 0]), model.surface([0.9, 0.5, 0])]), [0, 0.5, 0.65], 'and its surface is there');
    assert.deepEqual(model.nearest([0, 1, 0.9]).mesh, -1, 'a skinned mesh has no carve index');
    // The tool prints a box and distances, not "0 long" and "Infinity from the surface".
    const told = run('describe-model', [project, 'Mounts/mount']);
    assert.equal(told.status, 0, said(told));
    assert.match(told.stdout, /^box {9}2 long, 0\.5 wide, 1 tall \(x -0\.25\.\.0\.25, y 0\.\.1, z -1\.\.1\)$/m);
    assert.match(told.stdout, /^meshes {6}0 \(carve index/m);
    assert.match(told.stdout, /^skinned {5}1 that follow the file's own skeleton, measured at rest \(a carve cannot take from them\)$/m);
    assert.match(told.stdout, /^ {4}- {2}\S.* {2}12 triangles {2}x -0\.25\.\.0\.25 {2}y 0\.\.1 {2}z -1\.\.1$/m);
    assert.doesNotMatch(told.stdout, /Infinity|NaN|3500000/);
    const json = JSON.parse(run('describe-model', [project, 'Mounts/mount', '--json']).stdout);
    assert.deepEqual([json.box.length, json.box.width, json.box.height, json.meshes, json.skinned.length, json.unit], [2, 0.5, 1, [], 1, 1.75]);
    // A type on it is checked like any other: its points are measured against that surface.
    const made = run('make-vehicle', [project, '--name', 'Mount', '--kind', 'motorcycle', '--model', 'Mounts/mount', '--size', '3', '--check']);
    assert.doesNotMatch(made.stdout, /Infinity|NaN/, said(made));
    assert.match(made.stdout, /^ {2}seat {8}\d+(\.\d+)? from the surface/m);
    assert.match(made.stdout, /^Mount \(1\): Mounts\/mount at 3 tiles, set by --size$/m);
    // A carve takes triangles from plain meshes; this model has none.
    const carved = run('carve-part', [project, 'Mounts/mount', '--name', 'Head', '--box', '-1,1,0,1,-1,1']);
    assert.deepEqual([carved.status, carved.stdout], [1, 'refused: Mounts/mount has no mesh a carve can take from: its meshes follow the file\'s own skeleton.\nnothing written\n']);
    assert.deepEqual([run('describe-model', [project, 'Mounts/mount', '--pieces', '0']).status, run('describe-model', [project, 'Mounts/mount', '--pieces', '0']).stdout], [1, 'refused: Mounts/mount has no mesh a carve can take from.\n']);
    V.forget();
});

test('a model file with no mesh at all is said to be that, and nothing is measured against it', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    fs.mkdirSync(path.join(project, '3d/Vehicles/empty/source'), { recursive: true });
    fs.writeFileSync(path.join(project, '3d/Vehicles/empty/source/empty.glb'), glbOf(() => ({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Nothing' }] })));
    const told = run('describe-model', [project, 'Vehicles/empty']);
    assert.equal(told.status, 0, said(told));
    assert.match(told.stdout, /^note: the file has no mesh: there is nothing to measure$/m);
    assert.doesNotMatch(told.stdout, /Infinity|NaN/);
    const before = snapshot(project);
    const made = run('make-vehicle', [project, '--name', 'Ghost', '--kind', 'motorcycle', '--model', 'Vehicles/empty', '--size', '3']);
    assert.deepEqual([made.status, made.stdout], [1, 'refused: 3d/Vehicles/empty/source/empty.glb has no mesh: there is nothing to seat a rider on.\nnothing written\n']);
    assert.deepEqual(snapshot(project), before);
    // Written by hand all the same: the validator says once that the model could not be measured, and asks no surface.
    fs.writeFileSync(path.join(project, 'data/ReactorVehicles.json'), JSON.stringify([null, { id: 1, name: 'Ghost', kind: 'motorcycle', model: { name: 'Vehicles/empty', size: 3 } }]));
    fs.writeFileSync(path.join(project, '3d/Vehicles/empty/model.json'), JSON.stringify({ vehicle: { forward: '+x', seats: [{ posture: 'astride', seat: { at: [0, 1, 0] }, handL: { at: [1, 1, 1] } }] } }));
    const checked = run('validate-vehicles', [project]);
    assert.match(checked.stdout, /^note Vehicles\/empty: the model could not be measured\. Its points were not checked\.$/m, said(checked));
    assert.doesNotMatch(checked.stdout, /Infinity|NaN|holds nothing/);
    assert.equal(checked.status, 0);
});

test('a hand a way off a carved part does not ride it', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const Make = require('../build-scripts/make-vehicle.cjs');
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    assert.equal(run('carve-part', [project, 'Vehicles/bike', '--name', 'Steering', '--box', '-0.5,-0.3,0.5,0.8,-0.5,0.5']).status, 0);
    V.forget();
    const model = V.loadModel(project, { name: 'Vehicles/bike' }, loaded);
    assert.equal(Make.partUnder(model, [-0.38, 0.7, 0.3]), 'Steering', 'on the bar');
    assert.equal(Make.partUnder(model, [-0.38, 0.71, 0.3]), 'Steering', 'a hundredth of a unit over it: within a hundredth of the model\'s length');
    assert.equal(Make.partUnder(model, [-0.38, 0.66, 0.6]), '', 'a fifth of a unit off its end: the bar is the nearest thing, and still not held');
    assert.equal(Make.partUnder(model, [0.25, 0.36, 0.23]), '', 'on a peg, which is no carved part');
    V.forget();
});

test('a check the tool had to leave out is one of the notes: printed once, counted, and what --strict stops at', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    assert.equal(run('make-vehicle', [project, ...MAKE, '--size', '3.5', '--front', '-x']).status, 0);
    assert.equal(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '28,3']).status, 0);
    V.forget();
    // The rider code is not there to ask (a runtime without reactor_3d_rider.js).
    const without = V.check(project, { loaded: Object.assign({}, loaded, { Rider: null, riderSide: 'reactor_3d_rider.js is not in the runtime' }) }).report;
    assert.deepEqual(without.skipped, ['fit']);
    const printed = V.print(without, loaded);
    const notes = printed.filter(line => line.mark === 'note').map(line => line.text);
    assert.equal(notes.filter(text => text === 'The rider code is not loaded: whether the party reaches was not checked.').length, 1, 'said once');
    assert.equal(notes.length, without.notes, 'as many note lines as the sentence counts');
    assert.equal(printed[printed.length - 1].text, `Ready to ride. ${notes.length} notes.`);
    assert.deepEqual([V.exitOf(without, false), V.exitOf(without, true)], [0, 1], '--strict does not pass what was not checked');
    assert.deepEqual(V.jsonLines(without).find(line => line.skipped === 'fit'), { key: 'vehicleCheck.skip.fit', level: 'note', text: 'The rider code is not loaded: whether the party reaches was not checked.', args: {}, file: '', path: '', skipped: 'fit' });
    // make-vehicle prints the same note among its type's lines, and its --strict stops at it.
    const Make = require('../build-scripts/make-vehicle.cjs');
    const order = { name: 'Motorcycle', kind: 'motorcycle', model: 'Vehicles/bike', check: true };
    const made = Make.make(project, order, Object.assign({}, loaded, { Rider: null, riderSide: 'reactor_3d_rider.js is not in the runtime' }));
    assert.deepEqual(made.lines.filter(line => line.skipped).map(line => [line.key, line.level]), [['vehicleCheck.skip.fit', 'note']]);
    assert.equal(made.sentence, `Ready to ride. ${made.lines.length} notes.`);
    assert.deepEqual([made.exit, Make.make(project, Object.assign({ strict: true }, order), Object.assign({}, loaded, { Rider: null })).exit], [0, 1]);
    // With everything loaded nothing is left out, and the count is the lines'.
    const whole = V.check(project, { loaded }).report;
    assert.deepEqual([whole.skipped, V.print(whole, loaded).filter(line => line.mark === 'note').length], [[], whole.notes]);
    V.forget();
});

//-----------------------------------------------------------------------------
// Carving.

test('carve-part carves the pieces whose middle lies in a box, in the Select tool\'s format', t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    const sidecar = path.join(project, '3d/Vehicles/bike/model.json');
    // Looking first.
    const before = snapshot(project);
    const dry = run('carve-part', [project, 'Vehicles/bike', '--name', 'Steering', '--box', '-0.5,-0.3,0.5,0.8,-0.5,0.5', '--pivot', '-0.38,0.66,0', '--check']);
    assert.equal(dry.status, 0, said(dry));
    assert.match(dry.stdout, /^Steering: 96 triangles in 1 mesh\(es\) \(0\), pivot \(-0\.38, 0\.66, 0\)$/m);
    assert.match(dry.stdout, /^--check: would write 3d\/Vehicles\/bike\/model\.json; nothing written$/m);
    assert.deepEqual(snapshot(project), before, '--check writes nothing');
    // The bar: one piece of the body's mesh. The box crosses the body too, whose middle is elsewhere: a piece is taken whole or not at all.
    const done = run('carve-part', [project, 'Vehicles/bike', '--name', 'Steering', '--box', '-0.5,-0.3,0.5,0.8,-0.5,0.5', '--pivot', '-0.38,0.66,0']);
    assert.equal(done.status, 0, said(done));
    assert.match(done.stdout, /^wrote 3d\/Vehicles\/bike\/model\.json$/m);
    assert.deepEqual(read(project, '3d/Vehicles/bike/model.json'), { parts: [{ name: 'Steering', pivot: [-0.38, 0.66, 0], meshes: { 0: [[12, 96]] } }] });
    // The game reads it and carves it: a piece of its own, named, hinged at the pivot.
    const R = loaded.Reactor3D;
    if (R) {
        const parts = R.readModelParts(read(project, '3d/Vehicles/bike/model.json'));
        assert.deepEqual(parts, [{ name: 'Steering', pivot: [-0.38, 0.66, 0], meshes: { 0: [[12, 96]] } }]);
        V.forget();
        const model = V.loadModel(project, { name: 'Vehicles/bike' }, loaded), object = model.instance().object;
        const piece = [];
        object.traverse(child => { if (child.isMesh && child.name === 'Steering') piece.push(child); });
        assert.equal(piece.length, 1, 'the carved piece is a mesh of its own');
        assert.equal(piece[0].geometry.getIndex().count, 96 * 3);
        assert.deepEqual(piece[0].userData.parts.map(part => part.name).slice(0, 2), ['Steering', 'Body'], 'answering to its own name first, then the node it came from');
        assert.ok(model.parts.includes('Steering'));
        assert.deepEqual(model.partBox('Steering').map(value => Math.round(value * 100) / 100), [-0.42, -0.34, 0.62, 0.7, -0.4, 0.4]);
        assert.deepEqual([model.carvedAt(0, 12), model.carvedAt(0, 11)], [['Steering'], []]);
    }
    // A second box and a --mesh: the wheel into a part that holds the first; the smaller is the child.
    const front = run('carve-part', [project, 'Vehicles/bike', '--name', 'Front end', '--box', '-1.1,-0.3,0,1,-0.5,0.5', '--mesh', '0,1']);
    assert.equal(front.status, 0, said(front));
    assert.match(front.stdout, /^Front end: 176 triangles in 2 mesh\(es\) \(0, 1\), pivot \(-0\.695, 0\.35, 0\)$/m, 'no pivot said: the middle of what was taken');
    assert.match(front.stdout, /^ {2}holds Steering$/m);
    assert.deepEqual(read(project, '3d/Vehicles/bike/model.json').parts.map(part => [part.name, part.meshes]), [['Steering', { 0: [[12, 96]] }], ['Front end', { 0: [[12, 96]], 1: [[0, 80]] }]]);
    // The other way round: the wheel alone lies inside the front end, and is said to.
    const wheel = run('carve-part', [project, 'Vehicles/bike', '--name', 'Front wheel', '--box', '-1.1,-0.4,0,0.61,-0.1,0.1', '--mesh', '1', '--check']);
    assert.match(wheel.stdout, /^Front wheel: 80 triangles in 1 mesh\(es\) \(1\)/m, said(wheel));
    assert.match(wheel.stdout, /^ {2}inside Front end: it turns with it, and by itself$/m);
    assert.doesNotMatch(wheel.stdout, /inside .*Steering|holds/, 'the bar is no part of the wheel, nor the wheel of the bar');
    // --except leaves pieces out; --add joins; a part of that name is replaced; --remove takes it out.
    const except = run('carve-part', [project, 'Vehicles/bike', '--name', 'Pegs', '--box', '0,0.5,0.2,0.5,-0.5,0.5', '--except', '0,0.5,0.2,0.5,-0.5,0']);
    assert.match(except.stdout, /^Pegs: 12 triangles in 1 mesh\(es\) \(0\)/m);
    assert.match(run('carve-part', [project, 'Vehicles/bike', '--name', 'Pegs', '--box', '0,0.5,0.2,0.5,-0.5,0', '--add']).stdout, /^Pegs: 24 triangles/m);
    assert.deepEqual(read(project, '3d/Vehicles/bike/model.json').parts[2].meshes, { 0: [[108, 24]] }, 'two runs that touch are one');
    assert.match(run('carve-part', [project, 'Vehicles/bike', '--name', 'Pegs', '--box', '0,0.5,0.2,0.5,0,0.5']).stdout, /^Pegs: 12 triangles/m);
    assert.equal(read(project, '3d/Vehicles/bike/model.json').parts.length, 3, 'replaced, not added again');
    assert.equal(run('carve-part', [project, 'Vehicles/bike', '--name', 'Pegs', '--remove']).status, 0);
    assert.deepEqual(read(project, '3d/Vehicles/bike/model.json').parts.map(part => part.name), ['Steering', 'Front end']);
    // describe-model lists what was carved.
    const told = run('describe-model', [project, 'Vehicles/bike']).stdout;
    assert.match(told, /^parts {7}2 carved$/m);
    assert.match(told, /^ {2}Steering: 96 triangles in mesh\(es\) 0 {2}x -0\.42\.\.-0\.34 {2}y 0\.62\.\.0\.7 {2}z -0\.4\.\.0\.4 {2}pivot \(-0\.38, 0\.66, 0\)$/m, 'a carved part with its box and its pivot');
    assert.match(told, /^ {4}0 {2}Body .* carved: Steering, Front end$/m);
    // Refused, each with exit 1 and the file as it was.
    const kept = fs.readFileSync(sidecar, 'utf8');
    for (const [args, why] of [
        [['--name', 'Nothing', '--box', '5,6,5,6,5,6'], /^refused: No piece has its middle in that box\.$/m],
        [['--name', 'Body', '--box', '-1,1,0,1,-1,1'], /^refused: Body is the name of one of the file's own parts: pick another\.$/m],
        [['--name', 'Odd', '--box', '-1,1,0,1,-1,1', '--mesh', '9'], /^refused: Vehicles\/bike has no mesh 9: its carve indices run from 0 to 2\.$/m],
        [['--name', 'Ghost', '--remove'], /^refused: Vehicles\/bike has no part named Ghost\.$/m]
    ]) {
        const refused = run('carve-part', [project, 'Vehicles/bike', ...args]);
        assert.equal(refused.status, 1, said(refused));
        assert.match(refused.stdout, why);
        assert.match(refused.stdout, /^nothing written$/m);
        assert.equal(fs.readFileSync(sidecar, 'utf8'), kept);
    }
    assert.equal(run('carve-part', [project, 'Vehicles/none', '--name', 'X', '--box', '0,1,0,1,0,1']).status, 1);
    // A rigged model keeps its rig: no carved parts beside it.
    fs.writeFileSync(sidecar, JSON.stringify({ rig: { template: 'vehicle', bones: [{ name: 'Body', parent: -1, head: [0, 0, 0], tail: [0, 1, 0] }], weights: {} } }));
    const rigged = run('carve-part', [project, 'Vehicles/bike', '--name', 'Steering', '--box', '-0.5,-0.3,0.5,0.8,-0.5,0.5']);
    assert.deepEqual([rigged.status, rigged.stdout], [1, 'refused: Vehicles/bike has a rig: a model keeps a rig or carved parts, never both.\nnothing written\n']);
    // How it is asked.
    for (const args of [[project], [project, 'Vehicles/bike'], [project, 'Vehicles/bike', '--name', 'X'], [project, 'Vehicles/bike', '--name', 'X', '--box', '1,2,3'], [project, 'Vehicles/bike', '--name', 'X', '--box', '0,1,0,1,0,1', '--mesh', 'a'], [project, 'Vehicles/bike', '--name', 'X', '--box', '0,1,0,1,0,1', '--loud']]) {
        assert.equal(run('carve-part', args).status, 2, args.join(' '));
    }
});

test('a hand that lands on a carved part rides it, and the part both hands hold is what turns', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    assert.equal(run('carve-part', [project, 'Vehicles/bike', '--name', 'Steering', '--box', '-0.5,-0.3,0.5,0.8,-0.5,0.5', '--pivot', '-0.38,0.5,0']).status, 0);
    const made = run('make-vehicle', [project, ...MAKE, '--size', '3.5', '--front', '-x']);
    assert.equal(made.status, 0, said(made));
    assert.match(made.stdout, /^ {2}left hand {3}on Steering, 0(\.0\d*)? from the surface/m);
    assert.match(made.stdout, /^ {2}left foot {3}on the body, 0(\.0\d*)? from the surface/m);
    const block = read(project, '3d/Vehicles/bike/model.json').vehicle;
    assert.deepEqual([block.seats[0].handL.part, block.seats[0].handR.part, block.seats[0].footL.part, block.seats[0].seat.part], ['Steering', 'Steering', undefined, undefined]);
    assert.deepEqual([block.controls[0].part, block.controls[0].at], ['Steering', [-0.38, 0.5, 0]], 'it turns about the part\'s own pivot');
    assert.deepEqual(read(project, '3d/Vehicles/bike/model.json').parts.length, 1, 'the carve is kept');
    assert.equal(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '28,3', '--face', 's']).status, 0);
    const checked = run('validate-vehicles', [project]);
    assert.doesNotMatch(checked.stdout, /nothing on the model turns|confirmed which end/);
    assert.deepEqual([checked.status, checked.stdout.trim().split('\n').pop()], [0, 'Ready to ride. 1 note.'], 'the one note: Ren is a picture');
});

test('a Spin motion on the file\'s own node of a carved wheel goes with the wheel: said by the validator, removed by make-vehicle', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    const sidecar = path.join(project, '3d/Vehicles/bike/model.json');
    // The whole front disc carved as a part of its own, and a piece of the body beside it.
    assert.equal(run('carve-part', [project, 'Vehicles/bike', '--name', 'Front wheel', '--box', '-1.06,-0.44,0,0.61,-0.1,0.1']).status, 0);
    assert.equal(run('carve-part', [project, 'Vehicles/bike', '--name', 'Steering', '--box', '-0.5,-0.3,0.5,0.8,-0.5,0.5']).status, 0);
    const model = V.loadModel(project, { name: 'Vehicles/bike' }, loaded);
    assert.deepEqual([model.within('Front wheel'), model.within('FrontWheel'), model.within('Body'), model.within('Steering'), model.within('Bike').sort(), model.within('Nope')],
        [['FrontWheel'], ['Front wheel'], ['Steering'], [], ['Body', 'Front wheel', 'FrontWheel', 'RearWheel', 'Steering'], []],
        'the file\'s node is wholly the carved wheel and the wheel wholly the node; a piece of the body is inside the body, and the body is not inside its piece');
    assert.equal(run('make-vehicle', [project, ...MAKE, '--size', '3.5']).status, 0);
    // By hand: the carved part named as the wheel, and the model's old motions put on the file's own nodes.
    const roll = { name: 'roll', part: 'frontwheel', type: 'spin', axis: 'z', trigger: 'moving', speed: 120 };
    const json = read(project, '3d/Vehicles/bike/model.json');
    json.vehicle.wheels[0] = 'Front wheel';
    json.animations = [{ name: 'sway', part: 'Body', type: 'swing', axis: 'x', trigger: 'always', degrees: 2, period: 90 }, roll];
    fs.writeFileSync(sidecar, JSON.stringify(json));
    // The rim would turn twice: once with the road as the wheel, once by the motion on its node.
    const checked = run('validate-vehicles', [project]);
    assert.equal(checked.status, 1, said(checked));
    assert.match(checked.stdout, /^FIX {2}Motorcycle: Front wheel is a wheel and also has a Spin motion\. Remove the motion\.$/m);
    const line = JSON.parse(run('validate-vehicles', [project, '--json']).stdout).lines.find(each => each.key === 'vehicleCheck.wheelSpin');
    assert.deepEqual([line.file, line.path], ['3d/Vehicles/bike/model.json', 'animations[1]']);
    // make-vehicle keeps the block a hand wrote and takes that motion out with the wheel's own.
    const made = run('make-vehicle', [project, ...MAKE]);
    assert.equal(made.status, 0, said(made));
    assert.match(made.stdout, /^ {2}motions {5}removed roll: a wheel rolls with the road$/m);
    const after = read(project, '3d/Vehicles/bike/model.json');
    assert.deepEqual([after.vehicle.wheels[0], after.animations.map(rule => rule.name)], ['Front wheel', ['sway']], 'the motion on the node inside the wheel is gone; the body\'s stays');
    const clean = run('validate-vehicles', [project]);
    assert.doesNotMatch(clean.stdout, /Spin motion/);
    assert.equal(clean.status, 0, said(clean));
    V.forget();
});

test('a model is measured once; its model.json is read again whenever it has been written', { skip: !loaded.Reactor3D && 'the 3D world is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    const sidecar = path.join(project, '3d/Vehicles/bike/model.json'), glb = path.join(project, '3d/Vehicles/bike/source/bike.glb');
    const first = V.loadModel(project, { name: 'Vehicles/bike' }, loaded), template = first.template;
    assert.deepEqual([first.json, first.text, first.parts.includes('Steering'), first.rigged], [null, null, false, false]);
    const built = first.instance().object;
    assert.ok(first.instance().object === built, 'one instance while nothing changes');
    // Written since: the same model, measured as before, with the file's new word and an instance built from it.
    fs.writeFileSync(sidecar, JSON.stringify({ custom: 1, parts: [{ name: 'Steering', pivot: [-0.38, 0.66, 0], meshes: { 0: [[12, 96]] } }] }));
    const second = V.loadModel(project, { name: 'Vehicles/bike' }, loaded);
    assert.ok(second === first && second.template === template, 'not read from its .glb again');
    assert.deepEqual([second.json.custom, second.parts.includes('Steering'), second.carvedAt(0, 20)], [1, true, ['Steering']]);
    assert.ok(second.instance().object !== built, 'the instance carved as the file now says');
    assert.ok(V.loadModel(project, { name: 'Vehicles/bike' }, loaded).instance().object === second.instance().object, 'and kept while the file stays as it is');
    // Taken away again.
    fs.rmSync(sidecar);
    assert.deepEqual([V.loadModel(project, { name: 'Vehicles/bike' }, loaded).json, first.parts.includes('Steering')], [null, false]);
    // A model.json that is not JSON: the model cannot be read, and says so each time until it is mended.
    fs.writeFileSync(sidecar, '{ not json');
    assert.throws(() => V.loadModel(project, { name: 'Vehicles/bike' }, loaded));
    fs.writeFileSync(sidecar, '{}');
    assert.deepEqual(V.loadModel(project, { name: 'Vehicles/bike' }, loaded).json, {});
    // The model file itself written over: measured again.
    fs.writeFileSync(glb, bikeGlb(SHAPELY));
    const other = V.loadModel(project, { name: 'Vehicles/bike' }, loaded);
    assert.ok(other !== first, 'another file, another measure');
    assert.deepEqual([first.size[1], other.size[1]].map(value => Math.round(value * 1000) / 1000), [0.9, 1]);
    V.forget();
    assert.ok(V.loadModel(project, { name: 'Vehicles/bike' }, loaded) !== other, 'forget() lets everything go');
    V.forget();
});

//-----------------------------------------------------------------------------
// What each tool refuses.

test('each tool refuses with exit 1 and writes nothing on a bad argument and on a taken name', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    assert.equal(run('make-vehicle', [project, ...MAKE, '--size', '3.5']).status, 0);
    assert.equal(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '28,3', '--key', 'bike']).status, 0);
    const before = snapshot(project);
    const refuses = (name, args, why) => {
        const done = run(name, [project, ...args]);
        assert.equal(done.status, 1, `${name} ${args.join(' ')}: ${said(done)}`);
        assert.match(done.stdout, why);
        assert.match(done.stdout, /^nothing written$/m);
        assert.deepEqual(snapshot(project), before, `${name} ${args.join(' ')} wrote nothing`);
    };
    refuses('make-vehicle', ['--name', 'Unicycle', '--kind', 'unicycle', '--model', 'Vehicles/bike'], /^refused: unicycle is not a kind of vehicle\. The kinds are motorcycle, tank, /m);
    refuses('make-vehicle', ['--name', 'Ghost', '--kind', 'motorcycle', '--model', 'Vehicles/ghost'], /^refused: Ghost: the model file 3d\/Vehicles\/ghost\/source\/ghost\.glb is missing\.$/m);
    refuses('make-vehicle', ['--name', 'Fitted', '--kind', 'motorcycle', '--model', 'Vehicles/bike', '--fit'], /^refused: --fit has nobody to fit to: no starting party member has a 3D body\. Pass --size\.$/m);
    refuses('place-vehicle', ['1', '--vehicle', '9', '--at', '40,40'], /^refused: vehicle type 9 is not in the Database\.$/m);
    refuses('place-vehicle', ['1', '--vehicle', '1', '--at', '999,3'], /^refused \(999, 3\): Off the map\.$/m);
    refuses('place-vehicle', ['1', '--vehicle', '1', '--at', '30,30'], /^refused \(30, 30\): Something is already here\.$/m);
    refuses('place-vehicle', ['1', '--vehicle', '1', '--at', '30,31', '--yaw', '0'], /^refused \(30, 31\): Motorcycle does not fit here\.$/m);
    refuses('place-vehicle', ['1', '--vehicle', '1', '--at', '40,40', '--key', 'bike'], /^refused: Another vehicle is already named "bike"\.$/m);
    for (const word of ['this', 'ridden', 'nearest', '1:2']) refuses('place-vehicle', ['1', '--vehicle', '1', '--at', '40,40', '--key', word], new RegExp(`^refused: "${word}" cannot be a vehicle's name\\.$`, 'm'));
    // A place that is refused is taken with --force; a name that cannot be used is not.
    assert.equal(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '40,40', '--key', 'this', '--force']).status, 1);
    assert.deepEqual(snapshot(project), before);
    const forced = run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '30,31', '--yaw', '0', '--force']);
    assert.equal(forced.status, 0, said(forced));
    assert.match(forced.stdout, /^FIX {2}Motorcycle \(003\) on Yard stands where it does not fit\. Motorcycle does not fit here\. \(30, 31\)$/m, 'and the validator\'s line for it follows');
    assert.deepEqual([run('validate-vehicles', [project]).status, run('validate-vehicles', [project]).stdout.trim().split('\n').pop()], [1, 'Not ready to ride. To fix: 1.']);
    // --check says what would be placed and writes nothing.
    const kept = snapshot(project);
    const dry = run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '60,60', '--check']);
    assert.deepEqual([dry.status, /^placed 004 Motorcycle at \(60, 60\)/m.test(dry.stdout), /^--check: nothing written$/m.test(dry.stdout)], [0, true, true]);
    const dryMake = run('make-vehicle', [project, '--name', 'Other', '--kind', 'motorcycle', '--model', 'Vehicles/bike', '--check']);
    assert.deepEqual([dryMake.status, /^added 2$/m.test(dryMake.stdout), /^--check: would write data\/ReactorVehicles\.json; nothing written$/m.test(dryMake.stdout)], [0, true, true]);
    assert.deepEqual(snapshot(project), kept);
    // How each is asked: exit 2, and nothing written.
    for (const [name, args] of [['make-vehicle', []], ['make-vehicle', [project]], ['make-vehicle', [project, '--name', 'X']], ['make-vehicle', [project, ...MAKE, '--size', '0']], ['make-vehicle', [project, ...MAKE, '--size', '3', '--fit']],
        ['make-vehicle', [project, ...MAKE, '--front', 'up']], ['make-vehicle', [project, ...MAKE, '--loud']], ['place-vehicle', [project]], ['place-vehicle', [project, '1']], ['place-vehicle', [project, '1', '--vehicle', '1']],
        ['place-vehicle', [project, '1', '--vehicle', '1', '--at', '3']], ['place-vehicle', [project, '1', '--vehicle', '1', '--at', '3,4', '--yaw', '90', '--face', 'e']], ['place-vehicle', [project, '1', '--vehicle', '1', '--at', '3,4', '--face', 'up']],
        ['place-vehicle', [project, '7', '--vehicle', '1', '--at', '3,4']], ['validate-vehicles', []], ['validate-vehicles', [project, '--loud']], ['validate-vehicles', [path.join(project, 'nowhere')]]]) {
        assert.equal(run(name, args).status, 2, `${name} ${args.join(' ')}`);
    }
    assert.deepEqual(snapshot(project), kept);
});

test('a tool that writes refuses while the editor has the project open, and writes with --force', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    assert.equal(run('make-vehicle', [project, ...MAKE, '--size', '3.5']).status, 0);
    const lock = path.join(project, '.rpgreactor.lock');
    // A lock whose editor runs: this test's own process, opened a moment ago.
    fs.writeFileSync(lock, JSON.stringify({ app: 'RPG Reactor', pid: process.pid, token: 'x', openedAt: new Date().toISOString() }, null, 2));
    const before = snapshot(project);
    const locked = /^refused: The project is open in the editor\. Close it, or pass --force\.$/m;
    for (const [name, args] of [['make-vehicle', [...MAKE, '--size', '3']], ['place-vehicle', ['1', '--vehicle', '1', '--at', '28,3']], ['carve-part', ['Vehicles/bike', '--name', 'Steering', '--box', '-0.5,-0.3,0.5,0.8,-0.5,0.5']]]) {
        const done = run(name, [project, ...args]);
        assert.equal(done.status, 1, `${name}: ${said(done)}`);
        assert.match(done.stdout, locked, name);
        assert.match(done.stdout, /^nothing written$/m);
        assert.deepEqual(snapshot(project), before, `${name} wrote nothing`);
        assert.equal(run(name, [project, ...args, '--check']).status, 0, `${name} --check only looks`);
        assert.deepEqual(snapshot(project), before);
        const json = JSON.parse(run(name, [project, ...args, '--json']).stdout);
        assert.deepEqual([json.ok, json.exit, json.lines[0].key, json.lines[0].level, json.wrote], [false, 1, 'vehicleTool.locked', 'fix', []], `${name} --json says the same`);
    }
    // The two that only look never refuse.
    assert.equal(run('describe-model', [project, 'Vehicles/bike']).status, 0);
    assert.equal(run('validate-vehicles', [project]).status, 0);
    // --force writes over the lock.
    assert.equal(run('carve-part', [project, 'Vehicles/bike', '--name', 'Steering', '--box', '-0.5,-0.3,0.5,0.8,-0.5,0.5', '--force']).status, 0);
    assert.equal(run('make-vehicle', [project, ...MAKE, '--size', '3', '--force']).status, 0);
    assert.equal(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '28,3', '--force']).status, 0);
    assert.deepEqual([read(project, 'data/ReactorVehicles.json')[1].model.size, read(project, 'data/Map001.json').events[2].rrVehicle, read(project, '3d/Vehicles/bike/model.json').parts.length], [3, { type: 1 }, 1]);
    // A lock nobody holds is no lock: an editor that is gone, one from before this machine started, a file that is not a lock.
    const stale = [{ pid: 2 ** 22 + 12345, openedAt: new Date().toISOString() }, { pid: process.pid, openedAt: new Date(Date.now() - os.uptime() * 1000 - 3600000).toISOString() }];
    for (const data of stale) {
        fs.writeFileSync(lock, JSON.stringify(data));
        assert.equal(V.lockOwner(project), null);
        assert.equal(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '50,50', '--check']).status, 0);
    }
    fs.writeFileSync(lock, 'not a lock');
    assert.equal(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '50,50']).status, 0);
});

test('the lock test is the editor\'s own', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'ProjectController.js'), 'utf8');
    const method = name => { const start = source.indexOf(`    ${name}(`); return source.slice(start, source.indexOf('\n    }\n', start) + 6); };
    const Controller = new Function('require', 'process', `return class { ${method('isProcessRunning')}\n${method('projectLockOwnerLives')} }`)(require, process);
    const editor = new Controller();
    const now = Date.now(), booted = now - os.uptime() * 1000;
    const cases = [
        { pid: process.pid, openedAt: new Date(now).toISOString() }, { pid: process.pid, openedAt: new Date(booted - 5000).toISOString() }, { pid: process.pid, openedAt: new Date(booted - 60000).toISOString() },
        { pid: process.pid, openedAt: 'yesterday' }, { pid: process.pid }, { pid: 2 ** 22 + 54321, openedAt: new Date(now).toISOString() }, { pid: 0, openedAt: new Date(now).toISOString() }, { openedAt: new Date(now).toISOString() }
    ];
    assert.deepEqual(cases.map(lock => V.ownerLives(lock)), cases.map(lock => editor.projectLockOwnerLives(lock)));
    assert.deepEqual(cases.map(lock => V.ownerLives(lock)), [true, true, false, true, true, false, false, false]);
});

test('place-vehicle --z stands it on the place nearest a height, and the event keeps its Z', { skip: !loaded.Reactor3D && 'the 3D world is not loaded' }, t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    // A vehicle a tile long, and a deck five up over (50, 50): a slab a tenth of a tile thick.
    fs.writeFileSync(path.join(project, 'data/ReactorVehicles.json'), JSON.stringify([null, { id: 1, name: 'Scooter', kind: 'motorcycle', model: { name: 'Vehicles/bike', size: 1 } }]));
    const side = read(project, 'data/Map001.r3d.json');
    side.pieces = [{ id: 1, kind: 'floor', x: 50, y: 50, z: 5, rot: 0, material: '' }];
    fs.writeFileSync(path.join(project, 'data/Map001.r3d.json'), JSON.stringify(side));
    const up = run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '50,50', '--z', '5', '--face', 'e']);
    assert.equal(up.status, 0, said(up));
    assert.match(up.stdout, /^placed 002 Scooter at \(50, 50\), standing at height 5\.1, facing east \(90\)$/m);
    assert.match(up.stdout, /^wrote data\/Map001\.r3d\.json$/m, 'the height is kept in the map\'s 3D sidecar');
    assert.equal(read(project, 'data/Map001.r3d.json').eventZ['2'], 5.1, 'as the event\'s Z, which the game spends at the first ride');
    assert.doesNotMatch(run('validate-vehicles', [project]).stdout, /does not fit/, 'and the validator finds it standing there');
    // With no height named it goes to the tile's own floor: under the deck there is not the room.
    const under = run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '50,50', '--check']);
    assert.deepEqual([under.status, /^refused \(50, 50\): /m.test(under.stdout)], [1, true], said(under));
    assert.equal(run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '60,60', '--z', 'high']).status, 2);
});

test('the validator reads the plugin list and says which file is not JSON', t => {
    const project = projectIn(temp(t, 'rr-vehicle-tools-'));
    fs.writeFileSync(path.join(project, 'data/ReactorVehicles.json'), JSON.stringify([null, { id: 1, name: 'Motorcycle', kind: 'motorcycle', model: { name: 'Vehicles/bike', size: 3.5 } }]));
    fs.mkdirSync(path.join(project, 'js'), { recursive: true });
    fs.writeFileSync(path.join(project, 'js', 'plugins.js'), '// Generated by RPG Maker.\nvar $plugins =\n[\n{"name":"DotMoveSystem","status":true,"description":"","parameters":{}},\n{"name":"YEP_RegionRestrictions","status":false,"description":"","parameters":{}}\n];\n');
    const checked = run('validate-vehicles', [project]);
    assert.match(checked.stdout, /^note DotMoveSystem moves the player its own way: free riding is not supported beside it\.$/m);
    assert.doesNotMatch(checked.stdout, /YEP_RegionRestrictions/, 'a plugin that is switched off says nothing');
    assert.deepEqual(V.readPlugins(project), [{ name: 'DotMoveSystem', status: true }, { name: 'YEP_RegionRestrictions', status: false }]);
    // A Reactor project's own list wins over a stock one beside it.
    fs.writeFileSync(path.join(project, 'js', 'reactor_plugins.js'), 'var $plugins = [{"name":"YEP_RegionRestrictions","status":true,"parameters":{}}];');
    assert.match(run('validate-vehicles', [project]).stdout, /^note YEP_RegionRestrictions: its regions are not asked while riding free\.$/m);
    // A type list, a model's file or a map that is not JSON: one line each, and the run goes on.
    fs.writeFileSync(path.join(project, '3d/Vehicles/bike/model.json'), '{ "vehicle": ');
    fs.writeFileSync(path.join(project, 'data/Map002.json'), '{ not a map');
    const broken = run('validate-vehicles', [project]);
    assert.equal(broken.status, 1, said(broken));
    assert.match(broken.stdout, /^FIX {2}data\/Map002\.json cannot be read \(not valid JSON\)\.$/m);
    assert.match(broken.stdout, /^FIX {2}3d\/Vehicles\/bike\/model\.json cannot be read \(not valid JSON\)\.$/m);
    assert.match(broken.stdout, /^ok {3}Motorcycle \(1\): motorcycle/m, 'the type is still read');
    fs.writeFileSync(path.join(project, 'data/ReactorVehicles.json'), '[null, {');
    const lost = run('validate-vehicles', [project]);
    assert.deepEqual([lost.status, /^FIX {2}data\/ReactorVehicles\.json cannot be read \(not valid JSON\)\.$/m.test(lost.stdout), lost.stdout.trim().split('\n').pop()], [1, true, 'Not ready to ride. To fix: 2.'], 'the list and the map; with no types read, no model is asked about');
    assert.match(run('make-vehicle', [project, ...MAKE]).stdout, /^refused: data\/ReactorVehicles\.json cannot be read \(not valid JSON\)\.$/m, 'a tool does not write over a list it cannot read');
    assert.equal(fs.readFileSync(path.join(project, 'data/ReactorVehicles.json'), 'utf8'), '[null, {');
});

//-----------------------------------------------------------------------------
// A packaged editor.

test('the five tools run from a packaged editor\'s layout: the runtime inside the app folder, no node_modules', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const folder = temp(t, 'rr-vehicle-stage-');
    const app = path.join(folder, 'app'), project = projectIn(path.join(folder, 'game'));
    for (const part of ['build-scripts/validate-vehicles.cjs', 'build-scripts/describe-model.cjs', 'build-scripts/make-vehicle.cjs', 'build-scripts/carve-part.cjs', 'build-scripts/place-vehicle.cjs',
        'build-scripts/validate-battle.cjs', 'build-scripts/place-unit.cjs', 'src/utils', 'src/event', 'src/legacy/EditorPaths.js', 'package.json']) {
        fs.cpSync(path.join(editorRoot, part), path.join(app, part), { recursive: true });
    }
    fs.mkdirSync(path.join(app, 'runtime', 'libs'), { recursive: true });
    for (const name of fs.readdirSync(path.join(repoRoot, 'runtime'))) if (name.endsWith('.js')) fs.copyFileSync(path.join(repoRoot, 'runtime', name), path.join(app, 'runtime', name));
    fs.copyFileSync(path.join(repoRoot, 'runtime', 'libs', 'three.js'), path.join(app, 'runtime', 'libs', 'three.js'));
    assert.equal(fs.existsSync(path.join(folder, 'runtime')), false, 'no runtime beside the app folder, as in a package');
    const staged = name => path.join(app, 'build-scripts', name + '.cjs');
    const told = run('describe-model', [project, 'Vehicles/bike'], staged);
    assert.equal(told.status, 0, said(told));
    assert.doesNotMatch(told.stdout, /not loaded|could not be loaded/, 'the staged runtime\'s vehicle code answered');
    assert.match(told.stdout, /^wheels {6}2 found$/m);
    assert.equal(run('carve-part', [project, 'Vehicles/bike', '--name', 'Steering', '--box', '-0.5,-0.3,0.5,0.8,-0.5,0.5'], staged).status, 0);
    const made = run('make-vehicle', [project, ...MAKE, '--size', '3.5', '--front', '-x'], staged);
    assert.equal(made.status, 0, said(made));
    assert.match(made.stdout, /^ {2}left hand {3}on Steering/m);
    const placed = run('place-vehicle', [project, '1', '--vehicle', '1', '--at', '28,3', '--yaw', '180'], staged);
    assert.equal(placed.status, 0, said(placed));
    assert.match(placed.stdout, /standing at height 0/, 'the staged runtime\'s physics answered');
    const checked = run('validate-vehicles', [project], staged);
    assert.equal(checked.status, 0, said(checked));
    assert.doesNotMatch(checked.stdout, /not loaded|could not be loaded|not checked/);
    assert.equal(checked.stdout.trim().split('\n').pop(), 'Ready to ride. 1 note.');
});

//-----------------------------------------------------------------------------
// The Demo's own motorcycle.

test('describe-model on the Demo\'s Ninja prints front -x and two wheels', { skip: !modelSide && 'Reactor3D.Vehicles is not loaded' }, t => {
    const glb = path.join(repoRoot, 'template', 'Demo', '3d', 'Vehicles', 'kawashaki_ninja_h2', 'source', 'kawashaki_ninja_h2.glb');
    if (!fs.existsSync(glb)) return t.skip('the Demo\'s motorcycle model is not on disk');
    // Alone in a project: no block, no front mark on any map. The finder has only the model to look at.
    const project = projectIn(temp(t, 'rr-vehicle-ninja-'));
    fs.mkdirSync(path.join(project, '3d', 'Vehicles', 'kawashaki_ninja_h2', 'source'), { recursive: true });
    fs.copyFileSync(glb, path.join(project, '3d', 'Vehicles', 'kawashaki_ninja_h2', 'source', 'kawashaki_ninja_h2.glb'));
    const done = run('describe-model', [project, 'Vehicles/kawashaki_ninja_h2', '--json', '--pieces', '21']);
    assert.equal(done.status, 0, said(done));
    const told = JSON.parse(done.stdout);
    assert.deepEqual([told.front.forward, told.front.guessed], ['-x', true]);
    assert.match(told.front.why, /^guessed: the hands find the bars at this end \(/);
    assert.deepEqual(told.box, { length: 2.573, width: 1.037, height: 1.406, min: [-1.286, 0, -0.518], max: [1.286, 1.406, 0.518] });
    assert.equal(told.meshes.length, 35, 'its 35 meshes, by carve index');
    assert.deepEqual(told.meshes.filter(mesh => [9, 11, 13].includes(mesh.index)).map(mesh => [mesh.index, mesh.names[0], mesh.triangles, mesh.origin]),
        [[9, 'Mesh_0014.rip', 720, [-0.911, 0.383, 0]], [11, 'Mesh_0010.rip', 2432, [0.861, 0.411, -0.003]], [13, 'Mesh_0009.rip', 2432, [-0.911, 0.383, 0]]], 'the wheel nodes hinge at their axles');
    assert.equal(told.wheels.length, 2);
    assert.deepEqual(told.wheels.map(wheel => [wheel.part, Math.round(wheel.radius * 100) / 100, wheel.at.map(value => Math.round(value * 100) / 100 + 0)]),
        [['Mesh_0009.rip', 0.38, [-0.91, 0.38, 0]], ['Mesh_0010.rip', 0.41, [0.86, 0.41, 0]]], 'front first, each by its own box');
    assert.equal(told.pieces.count, 153, 'the cockpit mesh comes apart into its 153 pieces');
    const grip = told.pieces.list.find(piece => Math.abs(piece.middle[0] + 0.465) < 0.01 && Math.abs(piece.middle[2] - 0.377) < 0.01);
    assert.ok(grip && grip.triangles > 300, 'the left grip is a piece of its own, where it was measured');
    const text = run('describe-model', [project, 'Vehicles/kawashaki_ninja_h2']).stdout;
    assert.match(text, /^front {7}-x \(guessed: the hands find the bars at this end/m);
    assert.match(text, /^wheels {6}2 found$/m);
});
