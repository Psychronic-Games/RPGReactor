'use strict';
// The map picker's 3D view (editor/src/utils/MapPicker3D.js): a map of the project standing in 3D, a tile chosen by a click.
// The view itself is driven in the editor (it needs WebGL); what is told apart here is its arithmetic and its wiring.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const MapPicker3D = require('../src/utils/MapPicker3D.js');

test('the eye starts over most of a small map and a district of a large one', () => {
    assert.strictEqual(MapPicker3D.startDistance(17, 13), 14);
    assert.strictEqual(MapPicker3D.startDistance(60, 40), 33);
    assert.strictEqual(MapPicker3D.startDistance(120, 120), 66);
    assert.strictEqual(MapPicker3D.startDistance(500, 300), 70);
    assert.strictEqual(MapPicker3D.startDistance(undefined, undefined), 14);
});

test('a point of the world is the tile it stands on, and nothing off the map', () => {
    assert.deepStrictEqual(MapPicker3D.tileOf({ x: 82.4, y: 3.1, z: 55.9 }, 120, 120), { x: 82, y: 55 });
    assert.deepStrictEqual(MapPicker3D.tileOf({ x: 0, y: 0, z: 0 }, 120, 120), { x: 0, y: 0 });
    assert.deepStrictEqual(MapPicker3D.tileOf({ x: 119.99, y: 0, z: 119.99 }, 120, 120), { x: 119, y: 119 });
    // The land past the border (the surround) is drawn, and is no place on this map.
    assert.strictEqual(MapPicker3D.tileOf({ x: -0.2, y: 0, z: 10 }, 120, 120), null);
    assert.strictEqual(MapPicker3D.tileOf({ x: 120, y: 0, z: 10 }, 120, 120), null);
    assert.strictEqual(MapPicker3D.tileOf({ x: 10, y: 0, z: 120.5 }, 120, 120), null);
    assert.strictEqual(MapPicker3D.tileOf(null, 120, 120), null);
});

test('outside the editor there is no 3D view, and the picker keeps its flat one', () => {
    assert.strictEqual(MapPicker3D.available(), false);
    const picker = fs.readFileSync(path.join(root, 'editor/src/event/commands/TransferPlayerEditor.js'), 'utf8');
    assert.match(picker, /typeof MapPicker3D !== 'undefined' && MapPicker3D\.available\(\) \? new MapPicker3D\(/);
    assert.match(picker, /if \(stand3d\) stand3d\.dispose\(\);/, 'the standing world is let go with the picker');
});

test('the script loads before the picker, and the room view is handed the map\'s material images', () => {
    const html = fs.readFileSync(path.join(root, 'editor/index.html'), 'utf8');
    assert.ok(html.indexOf('src/utils/MapPicker3D.js') > 0 && html.indexOf('src/utils/MapPicker3D.js') < html.indexOf('src/event/commands/TransferPlayerEditor.js'));
    const rooms = fs.readFileSync(path.join(root, 'editor/src/battle/BattlePresentationEditor.js'), 'utf8');
    assert.match(rooms, /materials:map=>pc\.mapEditor3D\.loadMaterials\(map\)/);
    const view = fs.readFileSync(path.join(root, 'runtime/reactor_battle_room.js'), 'utf8');
    assert.match(view, /typeof this\.assets\.materials === 'function' \? await this\.assets\.materials\(this\.map\) : null/);
    assert.match(view, /loadMaterial: name => materials\[name\] \|\| null/);
});

test('the hint is written out in every language', () => {
    const source = fs.readFileSync(path.join(root, 'editor/src/I18nReviewedTranslations.js'), 'utf8');
    const start = source.indexOf("const key='" + MapPicker3D.HINT + "'");
    assert.ok(start > 0, 'the hint is a key of the reviewed translations');
    const block = source.slice(start, source.indexOf('for(const [locale,value]', start));
    for (const locale of ['ja', 'zh-Hant', 'zh-Hans', 'ko', 'es', 'pt', 'fr', 'it', 'de', 'ru', 'pl', 'el', 'ar', 'tr', 'id', 'vi', 'th']) {
        assert.match(block, new RegExp("\\n '?" + locale + "'?:'[^']{8,}'"), locale);
    }
});
