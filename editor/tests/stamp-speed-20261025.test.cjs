'use strict';
// A stamped building tells the 3D view where it went, so only the chunks under it are laid again; it never sends
// the plain edit notice that builds the whole view again (most of a second on North Haven, 2026-10-25).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime/libs/three.js'));
global.Reactor3D = require(path.join(repoRoot, 'runtime/reactor_3d.js'));

/** The builder on one map, in a realm of its own; `sent` are the notices it dispatched. */
function builderOn(map) {
    const sent = [];
    const context = Object.assign({ console, JSON, Math, Object, Array, Number, String, Set, Map,
        document: { addEventListener() {}, removeEventListener() {}, dispatchEvent(event) { sent.push({ type: event.type, detail: event.detail }); } },
        CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } } });
    context.window = context;
    context.reactor = { buildHotbar: { visible: true, flash() {} } };
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('editor/src/utils/StructurePlan.js'), context);
    vm.runInNewContext(read('editor/src/PieceBuilderManager.js') + '\nwindow.PieceBuilderManager = PieceBuilderManager;', context);
    const manager = new context.PieceBuilderManager({ getTilemapManager: () => ({ currentMap: map }) });
    const plan = JSON.parse(read('template/Demo/3d/Structures/Cottage.json'));
    Object.assign(manager, { structures: () => [{ file: 'Cottage.json', name: 'Cottage', plan }], structure: 'Cottage.json' });
    return { manager, sent, E: context.RRMapElevation, plan };
}

const edits = sent => sent.filter(event => event.type === 'rr-map-edited');

test('a stamp names its footprint to the 3D view: pieces in cells, the levelled ground in corners round them', () => {
    const map = { id: 1, width: 60, height: 60, events: [null], reactor3d: { version: 1 } };
    const { manager, sent, plan } = builderOn(map);
    assert.equal(manager.stampAt(20, 30), true);
    const [W, H] = plan.size;
    const pieces = edits(sent).find(event => event.detail.pieces);
    assert.deepEqual({ ...pieces.detail.region }, { x0: 20, y0: 30, x1: 20 + W - 1, y1: 30 + H - 1 });
    const ground = edits(sent).find(event => event.detail.terrain);
    assert.deepEqual({ ...ground.detail.region }, { x0: 19, x1: 20 + W + 1, z0: 29, z1: 30 + H + 1 });
});

test('a stamp that brings people says the events changed, never the plain notice that builds the whole view again', () => {
    const map = { id: 1, width: 60, height: 60, events: [null], reactor3d: { version: 1 } };
    const { manager, sent } = builderOn(map);
    assert.equal(manager.stampAt(20, 30), true);
    assert.ok(map.events.filter(Boolean).length > 0, 'the Cottage places its people');
    assert.ok(sent.some(event => event.type === 'rr-events-changed'));
    for (const event of edits(sent)) {
        const detail = event.detail || {};
        assert.ok(detail.pieces || detail.terrain || detail.foliage || detail.water, 'every edit notice says what changed: ' + JSON.stringify(detail));
    }
});

test('a stamped building moved elsewhere lays both where it stood and where it went again', () => {
    const map = { id: 1, width: 60, height: 60, events: [null], reactor3d: { version: 1 } };
    const { manager, sent, E, plan } = builderOn(map);
    assert.equal(manager.stampAt(5, 5), true);
    manager.selectedGroup = E.structures(map)[0].group;
    sent.length = 0;
    assert.ok(manager._restamp(map, { x: 30, y: 35 }));
    const [W, H] = plan.size;
    const pieces = edits(sent).find(event => event.detail.pieces);
    assert.equal(pieces.detail.region.x0, 5);
    assert.equal(pieces.detail.region.y0, 5);
    assert.equal(pieces.detail.region.x1, 30 + W - 1);
    assert.equal(pieces.detail.region.y1, 35 + H - 1);
});
