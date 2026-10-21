/**
 * One undo history for the map view (src/utils/MapHistory.js): every map
 * tool's steps in the order they were taken, so Ctrl+Z takes back the last
 * thing done whatever tool did it. The first half pins the coordinator with
 * plain stand-ins; the second runs the real tools on one map through the
 * editor's own registration (main.js registerMapHistory).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');
const MapHistory = require(path.join(editorRoot, 'src', 'utils', 'MapHistory.js'));

/** A tool as the editor's are: two arrays of snapshots of its own value, a limit, and its own undo and redo. */
function tool(state, key, limit = 50) {
    return {
        undoStack: [], redoStack: [],
        set(value) { this.undoStack.push(state[key]); if (this.undoStack.length > limit) this.undoStack.shift(); this.redoStack.length = 0; state[key] = value; },
        undo() { if (!this.undoStack.length) return; this.redoStack.push(state[key]); state[key] = this.undoStack.pop(); },
        redo() { if (!this.redoStack.length) return; this.undoStack.push(state[key]); state[key] = this.redoStack.pop(); },
        canUndo() { return this.undoStack.length > 0; },
        canRedo() { return this.redoStack.length > 0; }
    };
}

function three() {
    const state = { a: 0, b: 0, c: 0 }, steps = [], buttons = [];
    const history = new MapHistory({ onChange: (u, r) => buttons.push([u, r]), onStep: step => steps.push(`${step.kind} ${step.owner} ${step.label}`) });
    const a = tool(state, 'a'), b = tool(state, 'b'), c = tool(state, 'c');
    history.register('a', { object: a, label: () => 'A' });
    history.register('b', { object: b, label: () => 'B' });
    history.register('c', { object: c, label: () => 'C' });
    return { state, history, a, b, c, steps, buttons };
}

test('steps of several tools come back in the order they were taken, whichever tool is asked', () => {
    const { state, history, a, b, c, steps, buttons } = three();
    a.set(1); b.set(1); a.set(2); c.set(1); b.set(2);
    assert.deepEqual(history.undoList, ['a', 'b', 'a', 'c', 'b']);
    // Any tool's own undo steps the whole history: the panel buttons and keys of the tool in hand.
    a.undo();
    assert.deepEqual(state, { a: 2, b: 1, c: 1 }, 'the last step was b\'s, and it went though a was asked');
    c.undo(); b.undo();
    assert.deepEqual(state, { a: 1, b: 1, c: 0 });
    assert.deepEqual(steps, ['undo b B', 'undo c C', 'undo a A']);
    assert.ok(a.canRedo() && b.canRedo() && c.canRedo(), 'every tool answers for the whole history');
    history.redo(); history.redo(); history.redo();
    assert.deepEqual(state, { a: 2, b: 2, c: 1 });
    assert.equal(history.redo(), false, 'nothing more to redo');
    for (let i = 0; i < 5; i++) assert.equal(history.undo(), true);
    assert.deepEqual(state, { a: 0, b: 0, c: 0 });
    assert.equal(history.undo(), false);
    assert.deepEqual(buttons[buttons.length - 1], [false, true]);
});

test('a new step from any tool drops what every tool could redo', () => {
    const { state, history, a, b, c } = three();
    a.set(1); b.set(1); c.set(1);
    history.undo(); history.undo();
    assert.deepEqual(history.redoList, ['c', 'b']);
    a.set(2);
    assert.deepEqual(history.redoList, []);
    assert.equal(b.redoStack.length, 0, 'b\'s own redo is gone too, so its button cannot bring back a stale step');
    assert.equal(c.redoStack.length, 0);
    assert.equal(history.redo(), false);
    assert.deepEqual(state, { a: 2, b: 0, c: 0 });
    history.undo(); history.undo();
    assert.deepEqual(state, { a: 0, b: 0, c: 0 });
});

test('a step a tool drops by itself is forgotten here: its limit, a stroke that moved nothing, another map', () => {
    const state = { a: 0, b: 0 };
    const history = new MapHistory();
    const a = tool(state, 'a', 3), b = tool(state, 'b');
    history.register('a', { object: a });
    history.register('b', { object: b });
    b.set(1); a.set(1); a.set(2); a.set(3);
    a.set(4);
    assert.deepEqual(history.undoList, ['b', 'a', 'a', 'a'], 'a keeps three: its oldest went, b\'s older step stayed');
    // A stroke that moved nothing takes its step back off the stack.
    b.undoStack.push('nothing'); b.undoStack.pop();
    assert.deepEqual(history.undoList, ['b', 'a', 'a', 'a']);
    // Another map: the tool starts its arrays again.
    a.undoStack = []; a.redoStack = [];
    assert.deepEqual(history.undoList, ['b']);
    a.set(9);
    assert.deepEqual(history.undoList, ['b', 'a'], 'the new arrays are watched as the old ones were');
    history.mapChanged();
    assert.equal(a.undoStack.length + b.undoStack.length, 0);
    assert.equal(history.canUndo(), false);
});

test('a stroke still being drawn in another tool closes first, and is the step undone', () => {
    const state = { a: 0, b: 0 };
    const history = new MapHistory();
    const a = tool(state, 'a'), b = tool(state, 'b');
    let pending = null;
    history.register('a', { object: a, settle: () => { if (pending !== null) { a.set(pending); pending = null; } } });
    history.register('b', { object: b });
    b.set(1);
    pending = 5;
    history.undo();
    assert.deepEqual(state, { a: 0, b: 1 }, 'the stroke became a step and that step went, not b\'s');
    assert.deepEqual(history.redoList, ['a']);
    history.redo();
    assert.deepEqual(state, { a: 5, b: 1 });
});

test('a tool that will not step leaves its step where it is; the total is capped; leaving restores the tool', () => {
    const state = { a: 0, b: 0 };
    const history = new MapHistory({ limit: 4 });
    const a = tool(state, 'a'), b = tool(state, 'b');
    const plainUndo = a.undo;
    history.register('a', { object: a });
    history.register('b', { object: b });
    let refuse = true;
    const real = history.owners.get('a').undo;
    history.owners.get('a').undo = () => { if (!refuse) real(); };
    a.set(1);
    assert.equal(history.undo(), false);
    assert.deepEqual(history.undoList, ['a']);
    refuse = false;
    assert.equal(history.undo(), true);
    a.set(1); b.set(1); a.set(2); b.set(2); a.set(3);
    assert.deepEqual(history.undoList, ['b', 'a', 'b', 'a'], 'four kept: the oldest of all went');
    assert.equal(a.undoStack.length, 2, 'and the tool that held it let it go');
    history.unregister('a');
    assert.equal(a.undo, plainUndo, 'the tool\'s own undo is its own again');
    assert.deepEqual(history.undoList, ['b', 'b']);
    assert.equal(Object.getOwnPropertyDescriptor(a, 'undoStack').get, undefined);
});

//-----------------------------------------------------------------------------
// The real tools on one map, registered as the editor registers them.

function realTools() {
    const W = 20, H = 20;
    const map = { id: 1, width: W, height: H, tilesetId: 1, note: '<3d>', data: new Array(W * H * 6).fill(0), events: [null],
        reactor3d: { version: 1, elevation: new Array(W * H).fill(0) } };
    const statuses = [];
    const ui = { buttons: [], updateUndoRedoButtons(u, r) { this.buttons.push([u, r]); }, updateStatus: text => statuses.push(text) };

    // Terrain and the builder read the editor's globals: their own context, the map shared.
    const context = { console, window: {}, document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }, setTimeout, clearTimeout };
    context.window = context;
    vm.runInNewContext(read('src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('src/PieceBuilderManager.js'), context);
    vm.runInNewContext(read('src/TerrainManager.js'), context);
    const E = context.RRMapElevation;
    // Ground with some shape to it: a level map's terrain is dropped when a step returns it to level.
    const grid = E.ensureTerrain(map);
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) grid[y * (W + 1) + x] = Math.hypot(x - 3, y - 16) < 3 ? 1.5 : 0;
    const owner = { getTilemapManager: () => ({ currentMap: map }) };
    const terrain = new context.TerrainManager(owner), builder = new context.PieceBuilderManager(owner);
    terrain.active = true; terrain.radius = 2; terrain.strength = 0.5;

    const previous = { window: global.window, lights: global.RRMapLights };
    global.window = { reactor: null, addEventListener() {}, removeEventListener() {} };
    global.RRMapLights = require(path.join(editorRoot, 'src', 'utils', 'MapLights.js'));
    const LightingManager = require(path.join(editorRoot, 'src', 'LightingManager.js'));
    const MediaSurfaceManager = require(path.join(editorRoot, 'src', 'MediaSurfaceManager.js'));
    const MapEditor = require(path.join(editorRoot, 'src', 'MapEditor.js'));
    const EventManager = require(path.join(editorRoot, 'src', 'EventManager.js'));

    const lighting = new LightingManager({ tilemapManager: { currentMap: map } });
    lighting.render = lighting._syncPanel = lighting._sync3D = lighting._syncAmbientControls = () => {};
    const media = new MediaSurfaceManager({ tilemapManager: { currentMap: map } }, null);
    media.boundMap = map;
    const mapEditor = new MapEditor({ container: null, currentMap: map, updateTiles() {}, renderMap() {} }, { currentLayer: 'A', selectedTiles: [], tilesetTextures: {} });
    const events = Object.create(EventManager.prototype);
    Object.assign(events, { currentMap: map, undoStack: [], redoStack: [], maxUndoSteps: 50, eventSprites: new Map(), renderEvents() {}, _restoreEventSelection() {} });

    const reactor = { uiManager: ui, mapEditor, eventManager: events, pieceBuilderManager: builder, terrainManager: terrain, lightingManager: lighting, mediaSurfaceManager: media };
    context.reactor = reactor; global.window.reactor = reactor;

    // The editor's own registration, lifted out of main.js.
    const main = read('src/main.js');
    const body = main.match(/\n    registerMapHistory\(\) \{\n([\s\S]*?)\n    \}\n\n    \/\*\* The status line says/);
    assert.ok(body, 'main.js registers the tools in registerMapHistory()');
    const announce = main.match(/\n    announceHistoryStep\(step\) \{\n([\s\S]*?)\n    \}\n/);
    assert.ok(announce);
    const self = Object.assign({}, reactor);
    self.registerMapHistory = new Function('RRMapHistory', 'window', `return function() {\n${body[1]}\n}`)(MapHistory, global.window);
    self.announceHistoryStep = new Function('window', `return function(step) {\n${announce[1]}\n}`)(global.window);
    self.registerMapHistory();
    const restore = () => { global.window = previous.window; global.RRMapLights = previous.lights; };
    return { map, E, terrain, builder, lighting, media, mapEditor, events, history: self.mapHistory, ui, statuses, self, restore };
}

/** Six steps, one a tool, in a fixed order; each returns after changing the map. */
function sixSteps(t) {
    const { map, E } = t;
    return [
        ['tiles', () => { t.mapEditor.saveState(); map.data[5] = 2816; }],
        ['terrain', () => { t.terrain.setMode('raise'); t.terrain.beginStroke({ x: 10, y: 10 }); t.terrain.endStroke(); }],
        ['events', () => { t.events.saveState(); map.events.push({ id: 1, name: 'EV001', x: 2, y: 2, pages: [] }); }],
        ['builder', () => { t.builder.undoStack.push(t.builder._snapshot(map)); t.builder.redoStack.length = 0; E.setPiece(map, { kind: 'block', x: 4, y: 4, z: 0, material: 'Stone' }); t.builder.announce(); }],
        ['lighting', () => { t.lighting.place('point', 3, 4); }],
        ['media', () => { t.media.change([{ id: 1, name: 'Screen', x: 1, y: 1, width: 2, height: 1 }]); }]
    ];
}

test('six real tools on one map: undo and redo walk the map back and forward byte for byte', () => {
    const t = realTools();
    try {
        const { map, history } = t;
        const shots = [JSON.stringify(map)];
        const steps = sixSteps(t);
        for (const [, run] of steps) { run(); shots.push(JSON.stringify(map)); }
        for (let i = 1; i < shots.length; i++) assert.notEqual(shots[i], shots[i - 1], `${steps[i - 1][0]} changed the map`);
        assert.deepEqual(Array.from(history.undoList), ['tiles', 'terrain', 'events', 'builder', 'lighting', 'media']);
        // Back, asking a different tool each time: the terrain panel's button, the builder's, the toolbar.
        const askers = [() => t.terrain.undo(), () => t.builder.undo(), () => t.mapEditor.undo(), () => t.lighting.undo(), () => t.events.undo(), () => history.undo()];
        for (let i = steps.length - 1; i >= 0; i--) {
            askers[i]();
            assert.equal(JSON.stringify(map), shots[i], `undo ${steps[i][0]} leaves the map as it was before it`);
        }
        assert.deepEqual(t.statuses, ['Undo: Media Surface', 'Undo: Light', 'Undo: Building', 'Undo: Event', 'Undo: Terrain', 'Undo: Tiles']);
        assert.equal(history.canUndo(), false);
        assert.deepEqual(t.ui.buttons[t.ui.buttons.length - 1], [false, true], 'the toolbar shows the whole history');
        for (let i = 0; i < steps.length; i++) {
            (i % 2 ? () => t.terrain.redo() : () => history.redo())();
            assert.equal(JSON.stringify(map), shots[i + 1], `redo ${steps[i][0]}`);
        }
        assert.equal(history.canRedo(), false);
    } finally { t.restore(); }
});

test('real tools, other orders: interleaved steps of the same tools, a redo dropped by another tool, a mid-stroke switch, another map', () => {
    const t = realTools();
    try {
        const { map, history, E } = t;
        const raise = (x, y) => { t.terrain.setMode('raise'); t.terrain.beginStroke({ x, y }); t.terrain.endStroke(); };
        const block = (x, y) => { t.builder.undoStack.push(t.builder._snapshot(map)); t.builder.redoStack.length = 0; E.setPiece(map, { kind: 'block', x, y, z: 0, material: 'Stone' }); t.builder.announce(); };
        const tile = (index, id) => { t.mapEditor.saveState(); map.data[index] = id; };
        const shots = [JSON.stringify(map)];
        const order = [() => raise(5, 5), () => block(6, 6), () => raise(6, 6), () => tile(3, 2816), () => t.lighting.place('point', 8, 8), () => block(12, 3), () => raise(12, 4), () => tile(4, 2817)];
        for (const run of order) { run(); shots.push(JSON.stringify(map)); }
        for (let i = order.length - 1; i >= 0; i--) { history.undo(); assert.equal(JSON.stringify(map), shots[i], `step ${i} undone`); }
        for (let i = 0; i < order.length; i++) { history.redo(); assert.equal(JSON.stringify(map), shots[i + 1], `step ${i} redone`); }
        // Three back, then a step from a tool that had none undone: nothing can be redone anywhere.
        history.undo(); history.undo(); history.undo();
        assert.equal(JSON.stringify(map), shots[5]);
        t.media.change([{ id: 1, name: 'Screen', x: 1, y: 1, width: 2, height: 1 }]);
        assert.equal(history.canRedo(), false);
        assert.equal(t.terrain.redoStack.length + t.builder.redoStack.length + t.mapEditor.redoStack.length, 0);
        history.undo();
        assert.equal(JSON.stringify(map), shots[5], 'the media step undone');
        // A terrain stroke still being drawn when Ctrl+Z comes: it closes, and it is the step undone.
        const before = JSON.stringify(map);
        t.terrain.setMode('raise'); t.terrain.beginStroke({ x: 15, y: 15 });
        assert.notEqual(JSON.stringify(map), before, 'the stroke has raised ground');
        history.undo();
        assert.equal(JSON.stringify(map), before);
        assert.ok(!t.terrain._stroke);
        // Another map: every tool starts empty.
        t.self.mapHistory.mapChanged();
        assert.equal(history.canUndo() || history.canRedo(), false);
        assert.equal(t.lighting._undo.length + t.terrain.undoStack.length + t.builder.undoStack.length + t.mapEditor.undoStack.length, 0);
        t.self.registerMapHistory();
        assert.equal(history.owners.size, 6, 'registering again changes nothing');
    } finally { t.restore(); }
});

test('the land past the border and the steep ground are steps of the one history, each named', () => {
    const t = realTools();
    try {
        const { map, history, terrain } = t;
        const shots = [JSON.stringify(map)];
        terrain.setSurround({ style: 'mountains' }); shots.push(JSON.stringify(map));
        t.mapEditor.saveState(); map.data[5] = 2816; shots.push(JSON.stringify(map));
        terrain.setCliff({ name: 'Moss' }); shots.push(JSON.stringify(map));
        // A slider still held when Ctrl+Z comes: it is a step first, and the step undone.
        terrain.setSurround({ style: 'mountains', distance: 240 }, 'live');
        assert.deepEqual(Array.from(history.undoList), ['terrain', 'tiles', 'terrain']);
        history.undo();
        assert.equal(JSON.stringify(map), shots[3], 'the drag undone, the steep ground kept');
        t.mapEditor.undo(); t.builder.undo(); terrain.undo();
        assert.equal(JSON.stringify(map), shots[0]);
        assert.deepEqual(t.statuses, ['Undo: Beyond the Border', 'Undo: Steep Ground', 'Undo: Tiles', 'Undo: Beyond the Border']);
        for (let i = 1; i <= 3; i++) { history.redo(); assert.equal(JSON.stringify(map), shots[i]); }
        history.redo();
        assert.equal(map.reactor3d.surround.distance, 240);
        assert.equal(history.canRedo(), false);
    } finally { t.restore(); }
});

test('the editor loads the history and starts it again with each map', () => {
    const html = read('index.html'), main = read('src/main.js');
    assert.ok(html.indexOf('src/utils/MapHistory.js') > 0 && html.indexOf('src/utils/MapHistory.js') < html.indexOf('src/main.js'));
    assert.match(main, /this\.registerMapHistory\(\);\n\s+this\.mapHistory\?\.mapChanged\(\);/);
});
