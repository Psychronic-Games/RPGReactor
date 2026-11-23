'use strict';
// The tileset picker (src/TilesetPicker.js): what a tileset is called in its list, the sheet its row shows, and the
// blank slots it leaves out; a 2D structure's tile layers choose their tileset with it (Structure2DWorkshop.js).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const TilesetPicker = require('../src/TilesetPicker.js');

test('a tileset is its number and name; its row shows its B sheet, else its ground, else any sheet it has', () => {
    assert.equal(TilesetPicker.label({ id: 2, name: 'Reactor One - Inside' }), '0002 Reactor One - Inside');
    assert.equal(TilesetPicker.label({ id: 7, name: '' }), '0007');
    assert.equal(TilesetPicker.coverSheet({ tilesetNames: ['A1', 'A2', '', '', '', 'B', '', '', ''] }), 'B');
    assert.equal(TilesetPicker.coverSheet({ tilesetNames: ['A1', 'A2', '', '', '', '', '', '', ''] }), 'A2');
    assert.equal(TilesetPicker.coverSheet({ tilesetNames: ['', '', '', '', '', '', '', '', 'E'] }), 'E');
    assert.equal(TilesetPicker.coverSheet({}), '');
});

test('blank slots are left out of the list unless in use; the workshop opens the picker for a new tile layer and for a layer\'s tileset', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'TilesetPicker.js'), 'utf8');
    assert.match(source, /tileset\.id === current \|\| tileset\.name \|\| \(tileset\.tilesetNames \|\| \[\]\)\.some\(Boolean\)/);
    const workshop = fs.readFileSync(path.join(__dirname, '..', 'src', 'Structure2DWorkshop.js'), 'utf8');
    assert.match(workshop, /if \(act === 'addTiles' \|\| act === 'chooseTileset'\) \{[\s\S]{0,600}this\.chooseTileset\(/);
    assert.doesNotMatch(workshop, /plan\.layers\.push\(\{ kind: 'tiles'[^\n]*\n[^\n]*\n\s*\} else if \(act === 'up'/, 'no tile layer is added without a choice');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.indexOf('src/TilesetPicker.js') > 0 && html.indexOf('src/TilesetPicker.js') < html.indexOf('src/Structure2DWorkshop.js'));
});
