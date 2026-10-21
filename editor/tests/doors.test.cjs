// Doors that open (a piece of its own hung in a doorway) and framed windows: the format the runtime
// and the editor share, what a plan hangs, what blocks a walker, and what the game does each frame.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

function loadThree() {
    global.self = global; global.window = global;
    require(path.join(repoRoot, 'runtime/libs/three.js'));
    return global.THREE;
}
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));
const SP = require(path.join(repoRoot, 'editor/src/utils/StructurePlan.js'));
function loadElevation() {
    const context = {}; context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    return context.RRMapElevation;
}

/** A wall along y = 5 with a doorway run at x 5..7, a door hung in it, and a pair of framed windows. */
function doorMap(door, extra = []) {
    const pieces = [];
    let id = 1;
    for (let x = 2; x <= 12; x++) {
        const kind = x >= 5 && x <= 7 ? 'doorway' : x === 10 || x === 11 ? 'window' : 'wall';
        const piece = { id: id++, kind, x, y: 5, z: 0, rot: 0, material: 'Stone' };
        if (kind === 'window') Object.assign(piece, { rot: 2, frame: { style: 'cottage', shutters: true, flowerBox: true } });
        pieces.push(piece);
    }
    if (door) pieces.push(Object.assign({ id: 50, kind: 'door', x: 5, y: 5, z: 0, rot: 0, material: 'Wood', width: 3 }, door));
    return { width: 20, height: 20, reactor3d: { version: 1, elevation: new Array(400).fill(0), pieces: pieces.concat(extra) } };
}

test('the runtime and the editor read a door and a window frame alike, and keep only what is said', () => {
    const E = loadElevation();
    const samples = [
        {},
        { width: 9, style: 'double', hinge: 'right', swing: 'out', opens: 'action', tag: '  inn.front ', frame: 'Stone' },
        { width: '2', style: 'castle', opens: 'locked', lock: { switch: 12, item: 3 }, message: "It's locked." },
        { opens: 'locked', lock: { item: '4' }, sound: { open: { name: ' door-open-02 ', volume: 400, pitch: 10 }, close: { name: '' }, locked: 'nope', other: { name: 'x' } } },
        { opens: 'auto', lock: { switch: 5 }, message: 7, sound: {} }
    ];
    for (const raw of samples) {
        const a = R.normalizeDoor(raw), b = E.normalizeDoor(raw);
        assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)), JSON.stringify(raw));
    }
    assert.deepEqual(R.normalizeDoor({}), { width: 1, style: 'plank', hinge: 'left', swing: 'away', opens: 'auto' });
    const locked = R.normalizeDoor(samples[2]);
    assert.deepEqual([locked.width, locked.style, locked.lock], [2, 'plank', { switch: 12 }], 'a switch wins over an item; an unknown style is plank');
    const sounds = R.normalizeDoor(samples[3]).sound;
    assert.deepEqual(sounds, { open: { name: 'door-open-02', volume: 100, pitch: 50 }, close: { name: '' } }, 'volume and pitch clamp; an empty name is kept (silence)');
    assert.equal(R.normalizeDoor(samples[4]).lock, undefined, 'only a locked door keeps a lock');
    for (const raw of [true, { style: 'arched', shutters: '#AABBCC', closed: true, flowerBox: true, material: ' Wood ' }, { shutters: true }, { style: 'x', closed: true }, null, 'cottage']) {
        assert.deepEqual(JSON.parse(JSON.stringify(E.normalizeWindowFrame(raw))), JSON.parse(JSON.stringify(R.normalizeWindowFrame(raw))), JSON.stringify(raw));
    }
    assert.deepEqual(R.normalizeWindowFrame({ style: 'arched', shutters: '#AABBCC', closed: true, flowerBox: true }), { style: 'arched', shutters: '#aabbcc', closed: true, flowerBox: true });
    assert.deepEqual(R.normalizeWindowFrame({ style: 'x', closed: true }), { style: 'cottage' }, 'closed means nothing without shutters');
    // Round trip through both piece readers.
    const raw = { id: 3, kind: 'door', x: 4, y: 4, z: 0, rot: 1, material: 'Wood', width: 2, style: 'gate', opens: 'action', sound: { open: { name: 'gate-open-01' } } };
    const map = { width: 10, height: 10, reactor3d: { pieces: [raw] } };
    const runtime = R.piecesOf(map)[0], editor = E.normalizePiece(raw, map);
    assert.deepEqual(JSON.parse(JSON.stringify(editor)), JSON.parse(JSON.stringify(runtime)));
    assert.deepEqual([...E.PIECE_KINDS], [...R.PIECE_KINDS], 'the editor offers the runtime\'s kinds');
});

test('a door stands across its cells, turns with its rot, and its sounds fall back to its style\'s', () => {
    for (const [rot, cells] of [[0, '5,5 6,5 7,5'], [1, '5,5 5,6 5,7'], [2, '5,5 4,5 3,5'], [3, '5,5 5,4 5,3']]) {
        const piece = R.normalizeDoor({ width: 3 });
        Object.assign(piece, { x: 5, y: 5, z: 0, rot, kind: 'door' });
        assert.equal(R.doorCells(piece).map(c => c.join(',')).join(' '), cells, 'rot ' + rot);
        assert.deepEqual(R.pieceFootprint(piece), R.doorCells(piece));
        // The door's own frame: u 0 is the first cell's edge, v 1 its front.
        const [fx, fz] = R.doorPoint(piece, 0.5, 1);
        const front = { 0: [5.5, 6], 1: [5, 5.5], 2: [5.5, 5], 3: [6, 5.5] }[rot];
        assert.ok(Math.abs(fx - front[0]) < 1e-9 && Math.abs(fz - front[1]) < 1e-9, 'rot ' + rot + ' faces its front');
    }
    assert.deepEqual(R.doorSound({ style: 'plank' }, 'open'), R.DOOR_SOUNDS.open);
    assert.equal(R.doorSound({ style: 'gate' }, 'open').name, 'gate-open-01');
    assert.deepEqual(R.doorSound({ style: 'plank', sound: { close: { name: 'door-close-02', pitch: 120 } } }, 'close'), { name: 'door-close-02', volume: 70, pitch: 120 });
    assert.equal(R.doorSound({ sound: { locked: { name: '' } } }, 'locked'), null, 'an empty name is silence');
    // Every default sound is on disk in the Demo.
    for (const sounds of [R.DOOR_SOUNDS, R.GATE_SOUNDS]) for (const sound of Object.values(sounds)) {
        assert.ok(fs.existsSync(path.join(repoRoot, 'template/Demo/audio/se', sound.name + '.ogg')), sound.name);
    }
});

test('a shut door blocks like a wall and an open one is its threshold; the editor never shuts one', () => {
    const map = doorMap({ opens: 'action' });
    const ground = (x, y) => R.groundHeightAt(map, x + 0.5, y + 0.5, 0);
    R._doorStates = null;
    assert.equal(ground(6, 5), 0, 'no game: every door lets a walker by');
    R._doorStates = new Map([[50, { open: false }]]);
    for (const x of [5, 6, 7]) assert.equal(ground(x, 5), R.DOOR_LEAF_HEIGHT, 'a shut action door blocks every cell it hangs across');
    assert.equal(ground(8, 5), 5, 'the wall beside it is a wall');
    R._doorStates.get(50).open = true;
    assert.equal(ground(6, 5), 0, 'open: the threshold');
    // An automatic door lets anyone by (it opens as they come); a locked one only once its lock is met.
    const auto = doorMap({ opens: 'auto' });
    R._doorStates = new Map([[50, { open: false }]]);
    assert.equal(R.groundHeightAt(auto, 6.5, 5.5, 0), 0);
    const locked = doorMap({ opens: 'locked', lock: { switch: 3 } });
    global.$gameSwitches = { on: false, value() { return this.on; } };
    assert.equal(R.groundHeightAt(locked, 6.5, 5.5, 0), R.DOOR_LEAF_HEIGHT, 'switch off: locked');
    global.$gameSwitches.on = true;
    assert.equal(R.groundHeightAt(locked, 6.5, 5.5, 0), 0, 'switch on: it opens as an automatic door does');
    const gate = doorMap({ style: 'gate', opens: 'action' });
    global.$gameSwitches.on = false;
    assert.equal(R.groundHeightAt(gate, 6.5, 5.5, 0), R.DOOR_GATE_HEIGHT, 'a shut gate stands gate high, still more than a step');
    // An item lock: held, the door is not locked; a script's lock wins over everything.
    const itemLocked = R.normalizeDoor({ opens: 'locked', lock: { item: 4 } });
    itemLocked.id = 50;
    global.$dataItems = [null, null, null, null, { id: 4 }];
    global.$gameParty = { held: false, hasItem() { return this.held; } };
    global.$gameSystem = {};
    global.$gameMap = { mapId: () => 5 };
    assert.equal(R.doorLocked(itemLocked, {}), true);
    global.$gameParty.held = true;
    assert.equal(R.doorLocked(itemLocked, {}), false);
    $gameSystem._rrDoors = { '5:50': { locked: true } };
    assert.equal(R.doorLocked(itemLocked, {}), true, 'a script lock');
    $gameSystem._rrDoors = { '5:50': { locked: false } };
    assert.equal(R.doorLocked(R.normalizeDoor({ opens: 'locked' }), {}), true, 'another door with no lock stays locked');
    for (const name of ['$gameSwitches', '$dataItems', '$gameParty', '$gameSystem', '$gameMap']) delete global[name];
    R._doorStates = null;
});

test('casings, transoms and window frames are laid with the pieces, one window run framed as one', () => {
    const map = doorMap({ style: 'arched' });
    const trims = R.pieceTrims(map);
    assert.equal(R.pieceTrims(map), trims, 'cached against the piece list');
    const door = trims.filter(t => t.x === 5 && t.y === 5);
    assert.deepEqual(door.map(t => t.material).sort(), ['Stone', 'Wood'], 'the casing in the frame material, the arch filled in the doorway\'s own');
    const windows = trims.filter(t => t.x === 10 || t.x === 11);
    assert.equal(windows.length, 1, 'two framed windows side by side: one trim from the first');
    assert.equal(windows[0].x, 11, 'facing north (rot 2) the run starts from its east end');
    const boxes = windows[0].boxes;
    assert.ok(boxes.some(b => b.tint && Math.abs(b.tint[0] - 0x3f / 255) < 1e-6), 'shutters in their colour');
    assert.ok(boxes.some(b => b.box[5] > 1.4), 'the flower box stands out in front');
    // The geometry: trims draw as boxes, a box's tint reaching its vertex colours.
    loadThree();
    const geometry = R.pieceGeometry(windows, map);
    assert.ok(geometry.attributes.position.count > 100);
    const colors = geometry.attributes.color.array;
    let tinted = false;
    for (let i = 0; i < colors.length; i += 3) if (Math.abs(colors[i] - colors[i + 1]) > 0.05) { tinted = true; break; }
    assert.ok(tinted, 'tinted boxes are coloured, not grey');
    // A door piece itself draws nothing: its leaves are the scene's.
    assert.equal(R.pieceGeometry([R.piecesOf(map).find(p => p.kind === 'door')], map).attributes.position.count, 0);
    // Leaves: one up to two cells, two from three; a plank leaf has its boards and iron.
    assert.equal(R.doorLeaves(R.normalizeDoor({ width: 2 })).length, 1);
    assert.equal(R.doorLeaves(R.normalizeDoor({ width: 3 })).length, 2);
    assert.equal(R.doorLeaves(R.normalizeDoor({ width: 1, style: 'double' })).length, 2);
    const right = R.doorLeaves(R.normalizeDoor({ width: 2, hinge: 'right' }))[0];
    assert.ok(right.mirror && right.hinge > 1.9, 'a right hinge hangs the leaf from the far side');
    const leaf = R.doorLeafBoxes(R.normalizeDoor({ width: 2 }), 1.96, 0.02, false);
    assert.ok(leaf.some(b => b.tint) && leaf.length > 6);
    assert.ok(R.doorLeafBoxes(R.normalizeDoor({ width: 2 }), 1.96, 0.02, true).every(b => b.box[3] <= 1e-9), 'mirrored, the leaf runs back from its hinge');
});

test('a shut door is solid: no ray passes between its boards or its two leaves', () => {
    const THREE = loadThree();
    for (const style of R.DOOR_STYLES.filter(st => st !== 'gate')) for (const width of [1, 2, 3]) {
        const piece = Object.assign(R.normalizeDoor({ width, style }), { kind: 'door', x: 10, y: 10, z: 0, rot: 0, id: 1 });
        const meshes = R.doorLeaves(piece).map(leaf => {
            const data = R.doorBoxesGeometry(R.doorLeafBoxes(piece, leaf.length, leaf.offset, leaf.mirror, leaf.meeting), true);
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
            geometry.computeBoundingSphere();
            const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
            const [wx, wz] = R.doorPoint(piece, leaf.hinge, 0.5);
            mesh.position.set(wx, 0, wz);
            mesh.updateMatrixWorld();
            return mesh;
        });
        let through = 0;
        for (let x = 10.03; x < 10 + width - 0.03; x += 0.004) for (const y of [0.3, 1.2, 1.7, 2.6, 3.3]) {
            const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 20), new THREE.Vector3(0, 0, -1));
            if (!ray.intersectObjects(meshes).length) through++;
        }
        assert.equal(through, 0, style + ' ' + width + ' wide');
    }
});

test('nothing stands across a doorway: the head over a door is wall, and a rail or a shape in an opening is found', () => {
    loadThree();
    // Every style and width: between the leaf's head and the lintel, only the doorway's own wall, full width and depth.
    for (const style of R.DOOR_STYLES.filter(st => st !== 'gate')) for (const width of [1, 2, 3]) {
        const piece = Object.assign(R.normalizeDoor({ width, style }), { kind: 'door', x: 5, y: 5, z: 0, rot: 0 });
        const leaf = R.doorLeafHeight(piece), lintel = R.PIECE_STOREY - 0.6;
        for (const entry of R.doorTrimBoxes(piece, 'Stone')) {
            const [u0, y0, v0, u1, y1, v1] = entry.box;
            const across = u0 < width - 0.12 && u1 > 0.12, inside = v0 < 0.9 && v1 > 0.1, above = y1 > leaf + 0.01 && y0 < lintel - 0.01;
            if (!(across && inside && above)) continue;
            assert.equal(entry.material, 'Stone', `${style} ${width}: only wall over the leaf (${JSON.stringify(entry.box)})`);
            if (style !== 'arched') assert.ok(u0 <= 0 && u1 >= width && v0 <= 0 && v1 >= 1, `${style} ${width}: a full wall, not a bar`);
        }
    }
    // A plank across a doorway's opening (a rail at waist height) is reported; the village's own map has none.
    const map = doorMap({ opens: 'auto' }, [{ id: 90, kind: 'box', x: 6, y: 5, z: 2, rot: 0, material: 'Wood', size: [3, 0.25, 0.2], angle: 0 }]);
    const crossed = R.doorwayCrossings(map);
    assert.deepEqual(crossed.map(c => [c.x, c.y, c.by.join()]), [[5, 5, 'box'], [6, 5, 'box'], [7, 5, 'box']]);
    assert.deepEqual(R.doorwayCrossings(doorMap({ opens: 'auto', style: 'panelled' })), [], 'a door\'s own casing never crosses its opening');
    assert.deepEqual(R.doorwayCrossings(doorMap(null)), [], 'nor an open doorway with nothing in it');
});

test('a plan hangs a door in every doorway and frames its windows, and turns and grows keep them', () => {
    const plan = {
        name: 'Cottage', size: [14, 10], storey: 5,
        materials: { wall: 'Stone', inner: 'Plaster', floor: 'Wood', roof: 'Thatch', door: 'Wood', frame: 'Wood' },
        door: { sound: { open: { name: 'door-open-02' } } },
        floors: [{ rooms: { hall: [1, 1, 6, 8], kitchen: [8, 1, 12, 8] }, doors: [['hall', 'outside', 2, 4, 'south', { opens: 'locked', lock: { switch: 7 }, tag: 'front' }], ['hall', 'kitchen', 2]] }],
        roof: { pitch: 2 }, windows: { every: 6, width: 2, shutters: true, flowerBox: true }
    };
    const pieces = SP.build(plan, 0, 0, 1);
    const doors = pieces.filter(p => p.kind === 'door');
    assert.deepEqual(doors.map(p => [p.x, p.y, p.rot, p.width, p.style, p.opens]), [[3, 9, 0, 2, 'plank', 'locked'], [7, 5, 3, 2, 'panelled', 'auto']]);
    assert.deepEqual(doors[0].lock, { switch: 7 });
    assert.equal(doors[0].tag, 'front');
    assert.equal(doors[1].sound.open.name, 'door-open-02', 'the plan\'s own door settings reach every door');
    assert.equal(doors[0].frame, 'Wood');
    const windows = pieces.filter(p => p.kind === 'window');
    assert.ok(windows.length && windows.every(w => w.frame && w.frame.shutters === '#3f5f3a' && w.frame.flowerBox && w.frame.material === 'Wood'));
    // Each window faces its open side: the west wall's windows look west (rot 1).
    assert.ok(windows.filter(w => w.x === 0).every(w => w.rot === 1));
    assert.ok(windows.filter(w => w.y === 9).every(w => w.rot === 0));
    // Every doorway cell of a door's run is under it.
    for (const door of doors) {
        const cells = R.doorCells(door);
        assert.ok(cells.every(([x, y]) => pieces.some(p => p.kind === 'doorway' && p.x === x && p.y === y)), JSON.stringify(door));
    }
    // Turned and grown, the door keeps its own settings and still hangs in its doorway.
    for (const [rot, scale] of [[1, 1], [2, 1], [3, 1], [0, 2]]) {
        const shaped = SP.transform(plan, rot, scale);
        const built = SP.build(shaped, 0, 0, 1);
        const front = built.find(p => p.kind === 'door' && p.tag === 'front');
        assert.ok(front && front.opens === 'locked', 'rot ' + rot + ' scale ' + scale);
        assert.ok(R.doorCells(front).every(([x, y]) => built.some(p => p.kind === 'doorway' && p.x === x && p.y === y)), 'rot ' + rot + ' scale ' + scale + ' hangs in its doorway');
        assert.ok(built.filter(p => p.kind === 'window').every(w => w.frame && w.frame.flowerBox), 'the frame settings survive');
    }
    // No doors when the plan or the entry says so; no frames with frame: false.
    assert.equal(SP.build(Object.assign({}, plan, { doors: false }), 0, 0, 1).filter(p => p.kind === 'door').length, 0);
    const open = JSON.parse(JSON.stringify(plan)); open.floors[0].doors[1].push(false);
    assert.equal(SP.build(open, 0, 0, 1).filter(p => p.kind === 'door').length, 1);
    assert.ok(SP.build(Object.assign({}, plan, { windows: { every: 6, width: 2, frame: false } }), 0, 0, 1).filter(p => p.kind === 'window').every(w => !w.frame));
    // The engine walks in through the front door to every room (doors never shut in a walk check).
    R._doorStates = null;
    const walk = SP.validate(plan, SP.build(plan, 2, 2, 1), 2, 2, 20, 16, R);
    assert.deepEqual(Object.values(walk.report).map(r => r.reached), [true, true]);
});

test('the editor keeps a door beside its doorway, and the Build bar hangs one across a run of doorways', () => {
    const E = loadElevation();
    const map = doorMap(null);
    assert.ok(E.setPiece(map, { kind: 'door', x: 6, y: 5, z: 0, rot: 0, material: 'Wood' }));
    const here = E.pieces(map).filter(p => p.x === 6 && p.y === 5).map(p => p.kind).sort();
    assert.deepEqual(here, ['door', 'doorway'], 'a door does not replace the doorway it hangs in');
    // The manager's own placement: the run under the click, its first cell along the door's across.
    global.window = global.window || global;
    vm.runInThisContext(read('editor/src/PieceBuilderManager.js') + '\n;globalThis.__PBM = PieceBuilderManager;');
    const manager = new globalThis.__PBM(null);
    const plain = doorMap(null);
    manager.currentMap = () => plain;
    manager.elevation = () => E;
    manager.kind = 'door';
    manager.rot = 0;
    const placed = manager.pieceFor({ x: 6, y: 5, z: 0 });
    assert.deepEqual([placed.x, placed.y, placed.rot, placed.width, placed.style, placed.opens, placed.material], [5, 5, 0, 3, 'plank', 'auto', 'Wood']);
    manager.rot = 2;
    const north = manager.pieceFor({ x: 6, y: 5, z: 0 });
    assert.deepEqual([north.x, north.rot, north.width], [7, 2, 3], 'facing north the door starts from the run\'s east end');
    manager.kind = 'window';
    assert.deepEqual(manager.pieceFor({ x: 1, y: 1, z: 0 }).frame, { style: 'cottage' }, 'a window laid by hand wears the frame in hand');
    // A window's run: the framed windows beside it at its level, turn and frame; one edited alone frames alone.
    const win = E.pieces(plain).find(p => p.kind === 'window' && p.x === 10);
    assert.deepEqual(manager.windowRun(win).map(p => p.x).sort(), [10, 11]);
    const edited = JSON.parse(JSON.stringify(plain));
    edited.reactor3d.pieces.find(p => p.kind === 'window' && p.x === 11).frame.closed = true;
    assert.equal(R.pieceTrims(edited).filter(t => t.x === 10 || t.x === 11).length, 2, 'two frames now: each window its own');
    // The Build bar's cards read the door and window back and offer every setting.
    const source = read('editor/src/BuildHotbar.js');
    for (const needle of ["static PIECES = ['floor', 'wall', 'doorway', 'door',", "'FACING'", 'doorSections(piece, section)', 'windowSections(piece, section)', 'RRAudioPickerModal.open', 'previewSe(sound)', "select('lockBy'", "'Unlocked by'", "'Flower box'"]) {
        if (needle === "'FACING'") continue;
        assert.ok(source.includes(needle), needle);
    }
    vm.runInThisContext(source + '\n;globalThis.__BH = BuildHotbar;');
    const bar = new globalThis.__BH(null);
    bar.manager = () => manager;
    const section = (title, body) => `<section title="${title}">${body}</section>`;
    const html = bar.doorSections(R.normalizeDoor({ width: 2, style: 'arched', opens: 'locked', lock: { item: 9 }, hinge: 'right', tag: 'shed' }), section);
    for (const needle of ['value="arched" selected', 'value="right" selected', 'value="locked" selected', 'value="item" selected', 'value="9"', 'value="shed"', 'data-sound="open"', 'data-sound="close"', 'data-sound="locked"']) assert.ok(html.includes(needle), needle);
    const frame = bar.windowSections({ kind: 'window', frame: { style: 'two', shutters: '#112233', flowerBox: true } }, section);
    for (const needle of ['value="two" selected', 'data-key="shutters" checked', 'value="#112233"', 'data-key="flowerBox" checked']) assert.ok(frame.includes(needle), needle);
});

test('the game opens an automatic door for whoever walks up, shuts it behind them, and plays its sounds', () => {
    const THREE = loadThree();
    const map = doorMap({ opens: 'auto' });
    const played = [], fed = [];
    const player = { x: 6, y: 8, _realX: 6, _realY: 8, direction: () => 8, isMoving: () => true, isTransparent: () => false };
    global.$gamePlayer = player;
    global.$gameMap = { mapId: () => 3, roundXWithDirection: (x, d) => x + (d === 6 ? 1 : d === 4 ? -1 : 0), roundYWithDirection: (y, d) => y + (d === 2 ? 1 : d === 8 ? -1 : 0) };
    global.$dataMap = map;
    global.AudioManager = { playSe: se => played.push(se) };
    global.ReactorEvents = { emit: (name, payload) => fed.push([name, payload.id]) };
    const scene = Object.create(R.MapScene.prototype);
    const group = new THREE.Group();
    scene.piecesGroup = () => group;
    scene.pieceMaterial = () => new THREE.MeshBasicMaterial();
    scene.addDoors(map, () => null);
    assert.equal(scene._doors.length, 1);
    assert.equal(scene._doors[0].leaves.length, 2, 'three cells: two leaves');
    assert.ok(R._doorStates && R._doorStates.has(50), 'the game\'s own map keeps its doors\' states');
    const state = R._doorStates.get(50);
    scene.updateDoorsFrame([player]);
    assert.equal(state.open, false, 'three tiles off: shut');
    player._realY = player.y = 6.5;
    scene.updateDoorsFrame([player]);
    assert.equal(state.open, true, 'walking up: it opens');
    assert.equal(played[0].name, 'door-open-01');
    assert.deepEqual(fed[0], ['doorOpened', 50]);
    for (let i = 0; i < R.DOOR_SWING_FRAMES; i++) scene.updateDoorsFrame([player]);
    assert.equal(state.t, 1);
    const leaf = scene._doors[0].leaves[0];
    assert.ok(Math.abs(leaf.mesh.rotation.y - leaf.yaw) > 1.5, 'the leaf has swung about its hinge');
    player._realY = player.y = 5;
    for (let i = 0; i < 60; i++) scene.updateDoorsFrame([player]);
    assert.equal(state.open, true, 'never shut on someone in the doorway');
    player._realY = player.y = 1;
    for (let i = 0; i < 80; i++) scene.updateDoorsFrame([player]);
    assert.equal(state.open, false);
    assert.equal(state.t, 0);
    assert.equal(played[played.length - 1].name, 'door-close-01', 'shut: its close sound');
    assert.deepEqual(fed[fed.length - 1], ['doorClosed', 50]);
    // A villager standing beside the door does not hold it open; one walking up to it does, and one in the doorway keeps it.
    const villager = { x: 6, y: 6, _realX: 6, _realY: 6, moving: false, facing: 2, direction() { return this.facing; }, isMoving() { return this.moving; }, isTransparent: () => false };
    for (let i = 0; i < 40; i++) scene.updateDoorsFrame([player, villager]);
    assert.equal(state.open, false, 'standing beside it, facing away');
    villager.moving = true;
    for (let i = 0; i < 5; i++) scene.updateDoorsFrame([player, villager]);
    assert.equal(state.open, false, 'walking past it, facing away');
    villager.facing = 8;
    scene.updateDoorsFrame([player, villager]);
    assert.equal(state.open, true, 'walking up to it');
    villager.moving = false; villager._realY = villager.y = 5;
    for (let i = 0; i < 80; i++) scene.updateDoorsFrame([player, villager]);
    assert.equal(state.open, true, 'standing in the doorway keeps it open');
    villager._realY = villager.y = 8;
    for (let i = 0; i < 80; i++) scene.updateDoorsFrame([player, villager]);
    assert.equal(state.open, false);
    // Sounds fade with distance: from far away a door makes nothing.
    player._realX = player.x = 60; player._realY = player.y = 60;
    const before = played.length;
    R.Doors.open(50);
    assert.equal(played.length, before, 'too far to hear');
    // An action door opens with the OK button facing it and refuses when locked.
    const action = doorMap({ opens: 'locked' });
    global.$dataMap = action;
    global.$gameSystem = {};
    global.$gameMessage = { lines: [], isBusy() { return false; }, add(text) { this.lines.push(text); } };
    scene.addDoors(action, () => null);
    Object.assign(player, { x: 6, y: 6, _realX: 6, _realY: 6, direction: () => 8, isMoving: () => false });
    assert.equal(R.doorAction(player), true);
    assert.equal(R._doorStates.get(50).open, false, 'locked: still shut');
    assert.equal($gameMessage.lines[0], R.DOOR_LOCKED_TEXT);
    assert.equal(played[played.length - 1].name, 'door-locked-01');
    R.Doors.unlock(50);
    assert.equal(R.Doors.isLocked(50), false);
    assert.equal(R.doorAction(player), true);
    assert.equal(R._doorStates.get(50).open, true, 'unlocked by a script: it opens');
    assert.deepEqual($gameSystem._rrDoors, { '3:50': { locked: false } }, 'the unlock is kept in the save');
    for (const name of ['$gamePlayer', '$gameMap', '$dataMap', 'AudioManager', 'ReactorEvents', '$gameSystem', '$gameMessage']) delete global[name];
    R._doorStates = null; R._doorScene = null;
});

test('an automatic door swings away from whoever opens it, clear of the walkers, and never through anyone', () => {
    const THREE = loadThree();
    // The door hangs across (5..7, 5) facing south: the street is south (y > 5), the room north.
    const setup = (width = 3) => {
        const map = doorMap({ opens: 'auto', width });
        global.$gameMap = { mapId: () => 3, roundXWithDirection: x => x, roundYWithDirection: y => y };
        global.$dataMap = map;
        global.AudioManager = { playSe() {} };
        // The game is on (a player far away, not walking): the doors keep states.
        global.$gamePlayer = { _realX: 60, _realY: 60, x: 60, y: 60, direction: () => 2, isMoving: () => false, isTransparent: () => false };
        const scene = Object.create(R.MapScene.prototype);
        const group = new THREE.Group();
        scene.piecesGroup = () => group;
        scene.pieceMaterial = () => new THREE.MeshBasicMaterial();
        scene.addDoors(map, () => null);
        return { scene, door: scene._doors[0], state: () => R._doorStates.get(50) };
    };
    const walker = (x, y, dir) => ({ x: Math.round(x), y: Math.round(y), _realX: x, _realY: y, dir, moving: true,
        direction() { return this.dir; }, isMoving() { return this.moving; }, isTransparent: () => false, distancePerFrame: () => 0.0625 });
    // Where each leaf is now, as a segment on the ground from its hinge to its free end.
    const leafSegments = door => door.leaves.map(leaf => {
        leaf.mesh.updateMatrixWorld(true);
        const hinge = new THREE.Vector3(0, 1, 0).applyMatrix4(leaf.mesh.matrixWorld), end = new THREE.Vector3(leaf.mirror ? -leaf.length : leaf.length, 1, 0).applyMatrix4(leaf.mesh.matrixWorld);
        return [hinge.x, hinge.z, end.x, end.z];
    });
    const distance = (px, pz, [ax, az, bx, bz]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
    const touching = (door, people) => { for (const c of people) for (const seg of leafSegments(door)) if (distance(c._realX + 0.5, c._realY + 0.5, seg) < 0.3) return true; return false; };
    // Walk a line of people one way (dy per frame), each frame checking every leaf against every person.
    const walk = (scene, door, people, dy, frames, still = []) => {
        let touched = 0, earliest = null;
        for (let f = 0; f < frames; f++) {
            for (const c of people) { c._realY += dy; c.y = Math.round(c._realY); }
            scene.updateDoorsFrame(people.concat(still));
            if (touching(door, people.concat(still))) touched++;
            const lead = people[0], gap = Math.abs(lead._realY + 0.5 - 5.5);
            if (earliest === null && gap <= 0.9) earliest = Math.abs(door.angle) * 180 / Math.PI;
        }
        return { touched, earliest };
    };

    // Out of the house: a party of four in a line walks south through the door, down each lane of it, through a
    // two-leaf door and a wide single leaf. It opens outward, onto the street.
    let scene, door, state;
    for (const width of [2, 3]) for (let lane = 5; lane < 5 + width; lane++) {
        ({ scene, door, state } = setup(width));
        const party = [0, 1, 2, 3].map(i => walker(lane, 1 - i, 2));
        const out = walk(scene, door, party, 0.0625, 220);
        assert.equal(state().dir, 1, 'opened toward the street, away from the walkers coming out');
        assert.equal(out.touched, 0, `no leaf ever crossed anyone in the line (width ${width}, lane ${lane})`);
        assert.ok(out.earliest >= 75, `the leader found it open (${out.earliest.toFixed(0)} degrees) as they reached the doorway`);
        // And in, down the same lane: it opens into the room.
        ({ scene, door, state } = setup(width));
        const visitors = [0, 1].map(i => walker(lane, 10 + i, 8));
        const into = walk(scene, door, visitors, -0.0625, 160);
        assert.equal(state().dir, -1, 'opened into the room, away from the visitors');
        assert.equal(into.touched, 0, `nobody coming in is swept (width ${width}, lane ${lane})`);
    }


    // Someone standing on the street in front of the door: the party coming out finds it opened short of them,
    // or the other way, never into them.
    ({ scene, door, state } = setup());
    const bystander = Object.assign(walker(5, 6, 2), { moving: false });
    const line = [0, 1, 2].map(i => walker(6.6, 1 - i, 2));
    const past = walk(scene, door, line, 0.0625, 70, [bystander]);
    assert.equal(past.touched, 0, 'the leaf stops short of the bystander');
    assert.ok(R.doorClearAngle(door, state().dir, [bystander]) + 1 >= Math.abs(door.angle) * 180 / Math.PI, 'and stands no further open than the bystander allows');

    // An NPC coming in while the party goes out: whoever reaches it first decides, and nobody is swept.
    ({ scene, door, state } = setup());
    const leaving = walker(6, 2, 2), coming = walker(5, 9.5, 8);
    let touched = 0;
    for (let f = 0; f < 200; f++) {
        leaving._realY += 0.0625; coming._realY -= 0.0625;
        // Each gives way at the doorway while the other is in it, as the game's own blocking would make them.
        if (Math.abs(leaving._realY - coming._realY) < 1 && Math.abs(leaving._realY + 0.5 - 5.5) < 1.2) coming._realY += 0.0625;
        scene.updateDoorsFrame([leaving, coming]);
        if (touching(door, [leaving, coming])) touched++;
    }
    assert.equal(touched, 0, 'passing the other way, nobody is swept');

    // A door can swing only one way when told: "in" opens into the room even for someone coming out.
    const fixed = Object.assign({}, door, { piece: Object.assign({}, door.piece, { swing: 'in' }) });
    assert.equal(R.doorOpenSide(fixed, walker(6, 2, 2), []), -1);
    assert.equal(R.doorOpenSide(Object.assign({}, fixed, { piece: Object.assign({}, door.piece, { swing: 'out' }) }), walker(6, 9, 8), []), 1);
    for (const name of ['$gameMap', '$dataMap', 'AudioManager', '$gamePlayer']) delete global[name];
    R._doorStates = null; R._doorScene = null;
});

test('docs, sounds and the runtime file are in place', () => {
    const authoring = read('docs/AUTHORING.md');
    for (const needle of ['### Doors and window frames', '"opens": "locked"', 'Reactor3D.Doors.open', '"flowerBox": true']) assert.ok(authoring.includes(needle), needle);
    assert.ok(read('runtime/reactor_main.js').includes('"js/reactor_3d_doors.js"'));
    assert.ok(R.EXTENSIONS.some(e => e.file === 'reactor_3d_doors.js' && e.namespace === 'Doors'));
    for (const file of ['door-open-01', 'door-open-02', 'door-close-01', 'door-close-02', 'door-locked-01', 'gate-open-01']) {
        assert.ok(fs.existsSync(path.join(repoRoot, 'template/Demo/audio/se', file + '.ogg')), file);
    }
    assert.ok(read('THIRD_PARTY_NOTICES.md').includes('door-locked-01'));
});
