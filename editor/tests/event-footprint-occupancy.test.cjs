/**
 * A sized event (reactor3d.eventSize) owns every cell of its footprint in the
 * editor as in the game: a click there picks it (the 3D box already did), a
 * double-click there edits it instead of making a second event inside it, and
 * no drag or paste stacks two events on one cell.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const MapElevation = require(path.join(editorRoot, 'src', 'utils', 'MapElevation.js'));

function manager() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'EventManager.js'), 'utf8');
    const EventManager = vm.runInNewContext(`${source}\nEventManager;`, {
        console: { log() {}, debug() {}, warn() {}, error() {} }, RRMapElevation: MapElevation
    });
    const m = Object.create(EventManager.prototype);
    m.currentMap = { width: 20, height: 12, events: [null, { id: 1, x: 5, y: 5 }, { id: 2, x: 0, y: 8 }] };
    MapElevation.setEventSize(m.currentMap, 1, [3, 2]);
    return m;
}

test('a footprint cell answers with its event, the anchor first', () => {
    const m = manager();
    assert.equal(m.getEventAt(5, 5).id, 1);
    assert.equal(m.getEventAt(6, 6).id, 1, 'the far corner of a 3 by 2 footprint, centred on the event');
    assert.equal(m.getEventAt(4, 5).id, 1, 'and the tile before the event\'s own');
    assert.equal(m.getEventAt(7, 5), undefined, 'beside it, nothing');
    assert.equal(m.getEventAt(5, 7), undefined);
    assert.equal(m.getEventAt(0, 8).id, 2);
});

test('no drag or paste puts two events on one cell', () => {
    const m = manager();
    const small = m.currentMap.events[2], big = m.currentMap.events[1];
    assert.equal(m.canPlaceEvent(small, 6, 6), false, 'into the footprint');
    assert.equal(m.canPlaceEvent(small, 4, 6), false, 'on either side of the event');
    assert.equal(m.canPlaceEvent(small, 7, 6), true);
    small.x = 9; small.y = 5;
    assert.equal(m.canPlaceEvent(big, 8, 5), false, 'the footprint dragged over another event');
    assert.equal(m.canPlaceEvent(big, 7, 5), true, 'beside it');
    assert.equal(m.canPlaceEvent(big, 5, 7), true);
    assert.equal(m.canPlaceEvent(big, 5, 5), true, 'its own cells are free to it');
    assert.equal(m.canPlaceEvent({ id: null }, 3, 4, [3, 2]), false, 'a pasted 3 by 2 overlapping the footprint');
    assert.equal(m.canPlaceEvent({ id: null }, 1, 1, [3, 2]), true);
});

test('both views ask the same footprint rule while dragging', () => {
    const events = fs.readFileSync(path.join(editorRoot, 'src', 'EventManager.js'), 'utf8');
    const view3D = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(events, /if \(this\.canPlaceEvent\(this\.draggedEvent, newTileX, newTileY\)\)/);
    assert.match(view3D, /if \(manager\?\.canPlaceEvent && !manager\.canPlaceEvent\(event, tile\.x, tile\.y\)\) return;/);
});
