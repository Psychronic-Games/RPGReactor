'use strict';
// Beyond the Border's form logic (editor/src/utils/MapEdges.js): the land is laid in the 3D
// view once a frame however fast a slider is dragged, and by the view's own draw; a lay still
// waiting is dropped when another map comes up; what a change stores is what the control says.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(root, 'runtime/reactor_3d.js'));
const plain = value => JSON.parse(JSON.stringify(value));

function world() {
    const frames = [];
    const view = { lays: [], requests: 0, renders: 0 };
    const map = { id: 5, width: 20, height: 20, reactor3d: { surround: { style: 'continue' } } };
    let shown = map;
    const editor = {
        enabled: true,
        mapScene: { addSurround(m) { view.lays.push(m.reactor3d.surround ? m.reactor3d.surround.rough ?? 0.5 : null); } },
        currentMap: () => shown,
        requestRender() { view.requests++; },
        render() { view.renders++; }
    };
    const context = {
        console, Reactor3D,
        document: { readyState: 'complete', getElementById: () => null },
        requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
        cancelAnimationFrame(id) { frames[id - 1] = null; },
        reactor: { mapEditor3D: editor }
    };
    context.window = context;
    vm.runInNewContext(fs.readFileSync(path.join(root, 'editor/src/utils/MapEdges.js'), 'utf8'), context);
    const edges = context.RRMapEdges;
    const frame = () => { for (const fn of frames.splice(0)) if (fn) fn(); };
    return { edges, editor, view, map, frame, show: other => { shown = other; }, waiting: () => frames.filter(Boolean).length };
}

test('a dragged slider lays the land once a frame, with the newest value, and never draws the view itself', () => {
    const w = world();
    for (const rough of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        w.map.reactor3d.surround = w.edges.patch(w.map.reactor3d.surround, { rough });
        w.edges.lay(w.editor, w.map);
    }
    assert.deepEqual(w.view.lays, [], 'nothing is laid before the frame');
    assert.equal(w.waiting(), 1, 'five changes wait for one frame');
    w.frame();
    assert.deepEqual(w.view.lays, [0.9]);
    assert.equal(w.view.requests, 1, 'the view is asked to draw');
    assert.equal(w.view.renders, 0, 'and is not drawn from the panel');
    w.map.reactor3d.surround = w.edges.patch(w.map.reactor3d.surround, { rough: 0.2 });
    w.edges.lay(w.editor, w.map);
    w.frame();
    assert.deepEqual(w.view.lays, [0.9, 0.2], 'the next frame takes the next change');
});

test('a lay still waiting takes an undo made before its frame, and is dropped when another map comes up', () => {
    const w = world();
    // A change, then its undo, inside one frame: the land is laid once, as the map stands.
    w.map.reactor3d.surround = w.edges.patch(w.map.reactor3d.surround, { rough: 0.8 });
    w.edges.lay(w.editor, w.map);
    delete w.map.reactor3d.surround;
    w.edges.lay(w.editor, w.map);
    assert.equal(w.waiting(), 1);
    w.frame();
    assert.deepEqual(w.view.lays, [null], 'once, with nothing past the border');
    // Another map loaded before the frame: its scene lays its own land.
    w.map.reactor3d.surround = { style: 'ocean' };
    w.edges.lay(w.editor, w.map);
    w.edges.drop();
    assert.equal(w.waiting(), 0);
    w.frame();
    assert.deepEqual(w.view.lays, [null]);
    // And a frame that comes after the view moved on lays nothing of the old map.
    w.edges.lay(w.editor, w.map);
    w.show({ id: 6, width: 10, height: 10, reactor3d: {} });
    w.frame();
    assert.deepEqual(w.view.lays, [null]);
    assert.equal(w.view.renders, 0);
});

test('what a change stores is what the control says, and only that', () => {
    const { edges } = world();
    // A style alone; Nothing on every side stores nothing at all.
    assert.deepEqual(plain(edges.patch(null, { style: 'mountains' })), { style: 'mountains' });
    assert.equal(edges.patch({ style: 'mountains', rough: 0.8 }, { style: 'none' }), null);
    assert.equal(edges.patch(null, { rough: 0.9 }), null, 'a slider moved with nothing past the border');
    // The distance is Automatic until it is set, and Automatic again when it is cleared.
    const far = edges.patch({ style: 'continue' }, { distance: 240 });
    assert.deepEqual(plain(far), { style: 'continue', distance: 240 });
    assert.deepEqual(plain(edges.patch(far, { distance: null })), { style: 'continue' });
    assert.equal(edges.patch(far, { distance: 5 }).distance, Reactor3D.SURROUND_DISTANCE.min, 'held to the range');
    // A number at its default is not stored; cleared, it is the default again.
    assert.deepEqual(plain(edges.patch({ style: 'continue' }, { rough: 0.5 })), { style: 'continue' });
    assert.deepEqual(plain(edges.patch({ style: 'mountains' }, { height: 80, seed: 7 })), { style: 'mountains', seed: 7, height: 80 });
    assert.deepEqual(plain(edges.patch({ style: 'mountains', height: 80 }, { height: '' })), { style: 'mountains' });
    assert.deepEqual(plain(edges.patch({ style: 'ocean' }, { level: -2.5 })), { style: 'ocean', level: -2.5 });
    assert.deepEqual(plain(edges.patch({ style: 'ocean', level: -2.5 }, { level: '' })), { style: 'ocean' });
    // A side of its own; the map's own style on a side is no side; a floating island has no sides.
    assert.deepEqual(plain(edges.patch({ style: 'continue' }, { edges: { south: 'ocean' } })), { style: 'continue', edges: { south: 'ocean' } });
    assert.deepEqual(plain(edges.patch({ style: 'continue', edges: { south: 'ocean', north: 'mountains' } }, { edges: { south: '' } })), { style: 'continue', edges: { north: 'mountains' } });
    assert.deepEqual(plain(edges.patch({ style: 'continue', edges: { south: 'ocean' } }, { style: 'ocean' })), { style: 'ocean' });
    assert.deepEqual(plain(edges.patch({ style: 'continue', edges: { south: 'ocean' } }, { style: 'void' })), { style: 'void' });
    assert.deepEqual(plain(edges.patch(null, { edges: { east: 'ocean' } })), { style: 'none', edges: { east: 'ocean' } }, 'nothing but on one side');
    // What the panel has no control for is kept as written.
    assert.deepEqual(plain(edges.patch({ style: 'ocean', water: 'Lava' }, { rough: 0.2 })), { style: 'ocean', rough: 0.2, water: 'Lava' });
    assert.deepEqual(plain(edges.patch({ style: 'ocean' }, { nonsense: 3 })), { style: 'ocean' });
});

test('the panel shows a map as stored: Automatic and the defaults where the map says nothing', () => {
    const { edges } = world();
    const bare = edges.read({ width: 4, height: 4 });
    assert.deepEqual(plain(bare), { style: 'none', edges: { north: '', east: '', south: '', west: '' }, distance: null, rough: 0.5, seed: null, level: null, height: null, drop: null, haze: null,
        neighbors: { north: null, east: null, south: null, west: null } });
    const view = edges.read({ reactor3d: { surround: { style: 'mountains', distance: 320, rough: 1, edges: { south: 'ocean' }, height: 60 } } });
    assert.deepEqual([view.style, view.distance, view.rough, view.edges.south, view.edges.north, view.height, view.seed], ['mountains', 320, 1, 'ocean', '', 60, null]);
    assert.deepEqual(plain(edges.STYLES.map(style => style.id)), ['none', 'continue', 'ocean', 'mountains', 'plateau', 'void']);
    assert.match(edges.icon('mountains'), /^<svg viewBox="0 0 24 24" width="30" height="24"[^>]*><path d="M2 18l6-10 4 6 3-4 7 8z"\/><\/svg>$/);
});

test('a setting is offered only when a chosen style reads it', () => {
    const { edges } = world();
    const uses = surround => plain(edges.uses(edges.read({ reactor3d: { surround } })));
    const none = { sides: true, distance: false, rough: false, seed: false, level: false, height: false, drop: false, haze: false };
    assert.deepEqual(uses(null), none, 'nothing on every side: the sides alone, to put something on one');
    assert.deepEqual(uses({ style: 'continue' }), Object.assign({}, none, { distance: true, rough: true, seed: true, haze: true }));
    assert.deepEqual(uses({ style: 'ocean' }), Object.assign({}, none, { distance: true, seed: true, level: true, haze: true }), 'an ocean has no hills');
    assert.deepEqual(uses({ style: 'mountains' }), Object.assign({}, none, { distance: true, rough: true, seed: true, height: true, haze: true }));
    assert.deepEqual(uses({ style: 'plateau' }), Object.assign({}, none, { distance: true, rough: true, seed: true, drop: true, haze: true }));
    assert.deepEqual(uses({ style: 'void' }), { sides: false, distance: false, rough: true, seed: true, level: false, height: false, drop: true, haze: false }, 'a floating island: no sides, no reach, no haze');
    assert.deepEqual(uses({ style: 'continue', edges: { south: 'ocean', north: 'mountains' } }), Object.assign({}, none, { distance: true, rough: true, seed: true, level: true, height: true, haze: true }));
    assert.deepEqual(uses({ style: 'none', edges: { east: 'ocean' } }), Object.assign({}, none, { distance: true, seed: true, level: true, haze: true }));
    // Every number under Advanced names the use that shows it.
    for (const field of edges.NUMBERS) assert.ok(field.use in none, field.key);
});

test('the map view keeps its Surroundings tick, and the land is laid by the view from one place', () => {
    const html = fs.readFileSync(path.join(root, 'editor/index.html'), 'utf8');
    assert.match(html, /<input id="map-surround-view" type="checkbox" checked/);
    const view = fs.readFileSync(path.join(root, 'editor/src/MapEditor3D.js'), 'utf8');
    assert.match(view, /if \(event\?\.detail\?\.surround && this\.updateSurroundInPlace\(\)\) return;/);
    assert.match(view, /edges\.lay\(this, mapData\);/);
    assert.match(view, /globalThis\.RRMapEdges\?\.syncView\?\.\(this\);/);
});

test('the Surroundings tick set from the Terrain panel: the land shows, the tick follows, and the panel is told', () => {
    const frames = [], events = [], calls = [];
    const box = { checked: false, addEventListener() {} };
    const editor = { mapScene: { setSurroundVisible(on) { calls.push(on); } }, render() {} };
    const context = {
        console, Reactor3D: Object.assign(Object.create(Reactor3D), { SURROUND_VISIBLE: false }), performance: { now: () => 0 },
        document: { readyState: 'complete', getElementById: id => (id === 'map-surround-view' ? box : null), dispatchEvent(event) { events.push(event); } },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
        requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
        reactor: { mapEditor3D: editor }
    };
    context.window = context;
    vm.runInNewContext(fs.readFileSync(path.join(root, 'editor/src/utils/MapEdges.js'), 'utf8'), context);
    const edges = context.RRMapEdges;
    assert.deepEqual([edges.visible(), box.checked], [true, true], 'shown until the tick says otherwise');
    // The tick taken off in the map view's header.
    box.checked = false;
    edges.setVisible(false);
    assert.deepEqual([edges.visible(), context.Reactor3D.SURROUND_VISIBLE, calls], [false, false, [false]]);
    // Shown again from the panel: the tick follows.
    edges.setVisible(true);
    assert.deepEqual([edges.visible(), box.checked, calls], [true, true, [false, true]]);
    assert.deepEqual(events.map(event => [event.type, event.detail.visible]), [['rr-surround-view', false], ['rr-surround-view', true]]);
});

test('how far this computer shows the land, and the number a field shows', () => {
    const { edges } = world();
    assert.deepEqual(plain(edges.reach()), { min: 24, max: 320, auto: 160, shown: 320 });
    const height = edges.NUMBERS.find(field => field.key === 'height'), level = edges.NUMBERS.find(field => field.key === 'level');
    assert.equal(edges.shown(edges.read({ reactor3d: { surround: { style: 'mountains' } } }), height), Reactor3D.SURROUND_DEFAULTS.height);
    assert.equal(edges.shown(edges.read({ reactor3d: { surround: { style: 'mountains', height: 60 } } }), height), 60);
    assert.equal(edges.shown(edges.read({ reactor3d: { surround: { style: 'ocean' } } }), level), '');
    assert.equal(edges.shown(edges.read({ reactor3d: { surround: { style: 'ocean', level: 0 } } }), level), 0, 'a sea level of 0 is a number said');
});
