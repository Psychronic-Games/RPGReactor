'use strict';
// While a structure is built on its plot, the map's own tools stay off it (main.js workshopRefusal; owner, 2026-11-22:
// "we don't want the elements of the app bleeding into each other"). A 3D structure keeps Build, Lighting and Media
// Surfaces (it saves pieces, lights and surfaces); a 2D one keeps tile painting and takes videos from its own list.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const body = source.match(/\n    workshopRefusal\(action\) \{\n([\s\S]*?)\n    \}\n/);
assert.ok(body, 'main.js has workshopRefusal');
const refusal = (map, action) => new Function('action', body[1]).call({ tilemapManager: { currentMap: map } }, action);

test('on a map, every tool goes ahead', () => {
    for (const action of ['build-tool', 'image-layers', 'toggle-event-mode', 'playtest', 'media-surfaces']) assert.equal(refusal({ id: 3 }, action), '', action);
});

test('on a 3D plot: Build, Lighting and Media Surfaces go ahead; tools whose work the structure does not keep do not', () => {
    const plot = { id: 0, rrWorkshop: { structureId: 1 } };
    for (const action of ['build-tool', 'build-group', 'lighting-tool', 'media-surfaces', 'save', 'undo']) assert.equal(refusal(plot, action), '', action);
    for (const action of ['image-layers', 'terrain-tool', 'foliage-tool', 'models-tool', 'toggle-event-mode', 'playtest']) assert.ok(refusal(plot, action), action);
});

test('on a 2D plot: tile painting only; videos come from the structure\'s own list', () => {
    const plot = { id: 0, rrWorkshop: { structureId: 1, dimension: '2d' } };
    for (const action of ['save', 'undo', 'redo', 'open-database']) assert.equal(refusal(plot, action), '', action);
    for (const action of ['build-tool', 'build-group', 'lighting-tool', 'image-layers', 'terrain-tool', 'toggle-event-mode', 'playtest']) assert.ok(refusal(plot, action), action);
    assert.match(refusal(plot, 'media-surfaces'), /\+ Video/);
});

test('the toolbar, the menus, playtest and event mode all ask first', () => {
    const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'UIManager.js'), 'utf8');
    assert.match(ui, /handleHtmlMenuAction\(action\) \{[\s\S]{0,300}refuseInWorkshop\?\.\(action\)/);
    assert.match(ui, /handleToolbarAction\(action\) \{\n\s+if \(window\.reactor\?\.refuseInWorkshop\?\.\(action\)\) return;/);
    assert.match(source, /async playtest\(\) \{\n\s+if \(this\.refuseInWorkshop\('playtest'\)\) return;/);
    assert.match(source, /toggleEventMode\(\) \{\n\s+if \(this\.refuseInWorkshop\('toggle-event-mode'\)\) return;/);
});
