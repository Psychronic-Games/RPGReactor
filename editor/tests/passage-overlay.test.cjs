const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');

function tilePassage() {
    const start = source.indexOf('\n    static tilePassage(');
    let depth = 0, end = -1;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) { end = i + 1; break; }
    }
    // eslint-disable-next-line no-new-func
    return new Function(`return function ${source.slice(start + 12, end)}`)();
}

test('the passage marks read a cell the way the game walks it', () => {
    // Owner: "a button like RPG Maker's that shows passability, so a floor tile set to
    // not passable won't get us next time" - after bare floor under a 3D model did.
    const passage = tilePassage();
    const W = 2, H = 1;
    const data = new Array(W * H * 6).fill(0);
    const flags = []; flags[10] = 0x0f; flags[11] = 0; flags[12] = 0x10 | 0x0f; flags[13] = 0x01;
    const at = (x, z, id) => { data[(z * H + 0) * W + x] = id; };
    assert.deepEqual(passage(data, W, H, flags, 0, 0, false), { blocked: 0x0f, empty: true }, 'no tile: nothing walks');
    assert.deepEqual(passage(data, W, H, flags, 0, 0, true), { blocked: 0, empty: true }, 'on a room floor, bare floor walks');
    at(0, 0, 11);
    assert.deepEqual(passage(data, W, H, flags, 0, 0, false), { blocked: 0, empty: false }, 'a passable ground tile');
    at(0, 2, 12);
    assert.deepEqual(passage(data, W, H, flags, 0, 0, false), { blocked: 0, empty: false }, 'a star tile above it is skipped');
    at(0, 3, 13);
    assert.deepEqual(passage(data, W, H, flags, 0, 0, false), { blocked: 0x01, empty: false }, 'the top solid tile decides: down blocked');
    at(1, 1, 10);
    assert.deepEqual(passage(data, W, H, flags, 1, 0, false), { blocked: 0x0f, empty: false }, 'an impassable tile');
    assert.match(source, /if \(this\.passageVisible\) this\.refreshPassage\(\);/, 'redrawn as tiles change');
    assert.match(source, /Reactor3D\.blockedTilesFor\(template, template\.userData\.reactorSidecar, spec, placed\.direction, placed\.x, placed\.y\)/, 'and model footprints are drawn');
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.match(html, /id="map-passage" type="checkbox"/);
    const main = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');
    assert.match(main, /setPassageVisible\?\.\(event\.currentTarget\.checked\)/);
});

test('model events, the 3D view, and database tileset edits are covered', () => {
    assert.match(source, /static modelPlacements\(mapData\) \{[\s\S]*?Reactor3D\.eventModelSpec\(mapData, event\.id, index\)/, 'events bound to a model have footprints too');
    const editor3d = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(editor3d, /drawPassage\(\) \{[\s\S]*?TilemapManager\.tilePassage\(mapData\.data, mapData\.width, mapData\.height, flags, x, y, roomFloor\)/, 'the 3D view reads cells the same way');
    assert.match(editor3d, /this\.buildProps\(mapData, request\);\s*this\.drawPassage\(\);/, 'drawn with every rebuild');
    const main = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');
    assert.match(main, /this\.mapEditor3D\?\.setPassageVisible\?\.\(event\.currentTarget\.checked\)/, 'one toggle for both views');
    const controller = fs.readFileSync(path.join(editorRoot, 'src', 'ProjectController.js'), 'utf8');
    assert.match(controller, /this\.tilemapManager\.currentTileset = tileset;\s*this\.tilemapManager\?\.refreshPassage\?\.\(\);\s*this\.mapEditor3D\?\.refreshPassage\?\.\(\);/, 'a tileset saved in the database redraws the marks');
});
