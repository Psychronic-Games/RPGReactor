const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
global.Reactor3D = Reactor3D;
const EventModelPanel = require(path.join(repoRoot, 'editor', 'src', 'EventModelPanel.js'));

/** A map with one modelled event, and the managers the card talks to. */
function setup() {
    const event = { id: 2, name: 'Door', x: 24, y: 0, pages: [{ image: { direction: 2 } }] };
    const map = { width: 50, height: 50, events: [null, null, event], reactor3d: { version: 1, mode: '3d',
        events: { '2': { '0': { name: 'Map-Objects/Door-01', file: 'Door-01', ext: '.glb', size: 5, scale: 1, yaw: 0, pitch: 0, roll: 0 } } } } };
    const calls = { saves: 0, renders: 0 };
    const projectController = {
        mapEditor3D: { currentMap: () => map, eventGroup: null, isEnabled: () => true },
        eventManager: { saveState() { calls.saves++; }, renderEvents() { calls.renders++; } }
    };
    const panel = new EventModelPanel(projectController);
    panel.event = event;
    return { panel, map, calls, event };
}

test('the card reads the sidecar in its own units and writes an offset back to it', () => {
    const { panel, map } = setup();
    assert.deepEqual(panel.values(), { ox: 0, oy: 0, oz: 0, yaw: 0, pitch: 0, roll: 0, size: 5 });
    panel._apply('oy', -0.32, false);
    assert.deepEqual(map.reactor3d.events['2']['0'].offset, [0, -0.32, 0]);
    assert.equal(panel.values().oy, -0.32);
    // The runtime reads the same entry the card wrote.
    assert.deepEqual(Array.from(Reactor3D.eventModelSpec(map, 2, 0).offset), [0, -0.32, 0]);
});

test('one drag is one undo step, and the 2D previews follow when it ends', () => {
    const { panel, map, calls } = setup();
    panel._apply('yaw', 10, true);
    panel._apply('yaw', 20, true);
    panel._apply('yaw', 35, true);
    assert.equal(calls.saves, 1, 'the undo snapshot is taken once, before the first change');
    assert.equal(calls.renders, 0, 'nothing re-renders mid-drag');
    panel._endDrag();
    assert.equal(calls.renders, 1);
    assert.equal(map.reactor3d.events['2']['0'].yaw, 35);
    panel._apply('size', 3, false);
    assert.equal(calls.saves, 2, 'a typed value is its own step');
    assert.equal(map.reactor3d.events['2']['0'].size, 3);
    assert.equal(map.reactor3d.events['2']['0'].scale, 1);
});

test('Reset clears only the open tab', () => {
    const { panel, map } = setup();
    panel._apply('ox', 1, false);
    panel._apply('yaw', 90, false);
    panel.tab = 'offset';
    panel._renderRows = () => {};
    panel._reset();
    assert.equal('offset' in map.reactor3d.events['2']['0'], false);
    assert.equal(map.reactor3d.events['2']['0'].yaw, 90, 'the turn survives an offset reset');
    panel.tab = 'rotate';
    panel._reset();
    assert.equal(map.reactor3d.events['2']['0'].yaw, 0);
});

test('an event without a model or a placed instance gets no card', () => {
    const { panel, map, event } = setup();
    let hidden = 0;
    panel.hide = () => { hidden++; };
    panel.sync(event);
    assert.equal(hidden, 1, 'no model stands in the scene yet');
    delete map.reactor3d.events['2'];
    panel.sync(event);
    assert.equal(hidden, 2, 'no sidecar entry');
});
