const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const read = file => fs.readFileSync(path.join(repoRoot, file), 'utf8');

test('the player start has a facing: System.json startDirection, honoured by the runtime and drawn by the editor', () => {
    const objects = read('runtime/reactor_objects.js');
    assert.match(objects, /startDirection/, 'the runtime reads the start facing');
    assert.match(objects, /this\.reserveTransfer\(mapId, x, y, direction, 0\)/, 'and transfers with it');

    const events = read('editor/src/EventManager.js');
    assert.match(events, /'eventCtx\.playerFacing'/, 'the map menu offers Player Facing');
    assert.match(events, /setPlayerStartDirection\(direction\)/, 'and saves the choice');
    assert.match(events, /createStartingPositionMarker\(systemData\.startX, systemData\.startY, tt\('Player'\), 0x00ff00, this\.playerStartDirection\(\)\)/, 'the 2D marker knows the facing');
    assert.match(events, /refreshStartMarkers/, 'and the 3D view is told');

    const map3d = read('editor/src/MapEditor3D.js');
    assert.match(map3d, /buildStartMarkers\(mapData\)/, 'the 3D view builds start markers');
    assert.match(map3d, /startArrow\(direction, color\)/, 'with an arrow for the facing');

    const i18n = read('editor/src/I18nManager.js');
    assert.equal((i18n.match(/'eventCtx\.playerFacing'/g) || []).length, 18, 'every locale names it');
});

test('the marker arrow points the way the facing says', () => {
    const EventManager = require(path.join(editorRoot, 'src', 'EventManager.js'));
    const tip = direction => {
        const points = EventManager.arrowPoints(direction, 48, 48);
        return [Math.round(points[4]), Math.round(points[5])];
    };
    assert.deepEqual(tip(2), [24, 45], 'down: tip at the bottom edge');
    assert.deepEqual(tip(8), [24, 3], 'up: tip at the top edge');
    assert.deepEqual(tip(4), [3, 24], 'left: tip at the left edge');
    assert.deepEqual(tip(6), [45, 24], 'right: tip at the right edge');
    const MapEditor3D = require(path.join(editorRoot, 'src', 'MapEditor3D.js'));
    assert.equal(MapEditor3D.startDirection({}), 2, 'no facing saved: down');
    assert.equal(MapEditor3D.startDirection({ startDirection: 6 }), 6);
    assert.equal(MapEditor3D.startDirection({ startDirection: 5 }), 2, 'a diagonal is not a facing');
});

test('the map context menu does not reach for a translator it never declared', () => {
    // Regression: the Player Facing submenu called tt() inside showContextMenu,
    // which has no tt in scope, and every right-click on the map or an event
    // threw before the menu appeared.
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'EventManager.js'), 'utf8');
    const start = source.indexOf('    showContextMenu(');
    const end = source.indexOf('\n    }\n', start);
    const body = source.slice(start, end);
    assert.ok(start >= 0 && end > start);
    if (/\btt\(/.test(body)) assert.match(body, /const tt = /, 'tt is defined where it is used');
});
