const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.resolve(__dirname, '..');

const coreSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
const spritesSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
const tilesetEditorSource = fs.readFileSync(
    path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
const mapEditorSource = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor.js'), 'utf8');

const sheets = require(path.join(editorRoot, 'src', 'utils', 'TilesetSheets.js'));

/** Read a `Tilemap.TILE_ID_X = N;` constant out of the shipped runtime. */
function runtimeTileId(name) {
    const match = coreSource.match(new RegExp(`Tilemap\\.TILE_ID_${name}\\s*=\\s*(\\d+);`));
    assert.ok(match, `runtime declares TILE_ID_${name}`);
    return Number(match[1]);
}

test('F and G occupy a band the engine leaves unallocated', () => {
    // E is the last stock normal sheet and holds 256 ids; A5 is the next
    // allocation above it. Everything between is unused by MV and MZ alike,
    // which is what makes the addition non-colliding with imported data.
    const endOfE = runtimeTileId('E') + 256;
    const startOfA5 = runtimeTileId('A5');

    assert.equal(endOfE, 1024, 'stock normal sheets end at 1023');
    assert.equal(startOfA5, 1536, 'A5 is the next allocated id');
    assert.equal(sheets.EXTENDED_TILE_ID_MIN, endOfE);
    assert.equal(sheets.EXTENDED_TILE_ID_MAX, startOfA5);

    // Exactly two 256-tile sheets fit. That is the whole budget in this band.
    const capacity = sheets.EXTENDED_TILE_ID_MAX - sheets.EXTENDED_TILE_ID_MIN;
    assert.equal(capacity, 512);
    assert.equal(capacity / 256, 2, 'which is why F and G, and no more, live here');
});

test('the runtime addresses F and G with no arithmetic change', () => {
    // Tilemap._addNormalTile picks its sheet with this expression. It is the
    // reason the band needs no new rendering branch: it already yields 9 and 10.
    assert.match(coreSource, /setNumber = 5 \+ Math\.floor\(tileId \/ 256\);/,
        'the normal-tile sheet formula is unchanged');

    const setNumber = tileId => 5 + Math.floor(tileId / 256);
    assert.equal(setNumber(0), 5, 'B');
    assert.equal(setNumber(768), 8, 'E');
    assert.equal(setNumber(sheets.EXTENDED_TILE_ID_MIN), 9, 'F');
    assert.equal(setNumber(1280), 10, 'G');

    // And the editor's shared helper must agree with the engine exactly.
    for (const tileId of [0, 256, 512, 768, 1024, 1280, 1535]) {
        assert.equal(sheets.setNumberForNormalTileId(tileId), setNumber(tileId),
            `editor and runtime agree for tile ${tileId}`);
    }
});

test('event tile graphics resolve F and G through the same formula', () => {
    // Sprite_Character.tilesetBitmap duplicates the expression. If it ever
    // diverges, an event using an F/G tile graphic would load the wrong sheet.
    const at = spritesSource.indexOf('Sprite_Character.prototype.tilesetBitmap');
    assert.ok(at >= 0, 'tilesetBitmap is present');
    const body = spritesSource.slice(at, spritesSource.indexOf('};', at));
    assert.match(body, /const setNumber = 5 \+ Math\.floor\(tileId \/ 256\);/);
});

test('the band is a normal tile: not an autotile, not A5', () => {
    const A1 = runtimeTileId('A1');
    const A5 = runtimeTileId('A5');
    const MAX = runtimeTileId('MAX');

    for (const tileId of [1024, 1280, 1535]) {
        // isAutotile is `tileId >= TILE_ID_A1`, so the band routes to
        // _addNormalTile rather than the autotile path.
        assert.ok(tileId < A1, `${tileId} is not an autotile`);
        // isTileA5 is `>= A5 && < A1`.
        assert.ok(!(tileId >= A5 && tileId < A1), `${tileId} is not A5`);
        // isVisibleTile is `tileId > 0 && tileId < TILE_ID_MAX`.
        assert.ok(tileId > 0 && tileId < MAX, `${tileId} renders as a visible tile`);
    }
});

test('the existing flags array already covers F and G', () => {
    // Passability, star, ladder, counter and terrain tags are read as
    // flags[tileId]. The stock array is 8192 entries, so the band is already
    // addressable and no tileset format change is required.
    const MAX = runtimeTileId('MAX');
    assert.ok(sheets.EXTENDED_TILE_ID_MAX <= MAX,
        'the band sits inside the existing 8192-entry flags array');
    // New tilesets are still allocated at the stock flags length; growing it
    // would be a format change, and F/G exist precisely so none is needed.
    const allocators = [
        path.join(editorRoot, 'src', 'DatabaseEditorUI.js'),
        path.join(editorRoot, 'src', 'ProjectManager.js')
    ];
    for (const file of allocators) {
        assert.match(fs.readFileSync(file, 'utf8'), /new Array\(8192\)\.fill\(0\)/,
            `${path.basename(file)} allocates the stock flags length`);
    }
});

test('the tileset editor maps F and G to the right flag slots', () => {
    // getTileIndexForImage is the write path for every flag edit.
    const at = tilesetEditorSource.indexOf('getTileIndexForImage(imageIndex, tileX, tileY, tilesPerRow)');
    assert.ok(at >= 0, 'getTileIndexForImage is present');
    const body = tilesetEditorSource.slice(at, tilesetEditorSource.indexOf('\n    }', at));

    assert.match(body, /case 9: \/\/ F\s*\n\s*return 1024 \+ tileOffset;/);
    assert.match(body, /case 10: \/\/ G\s*\n\s*return 1280 \+ tileOffset;/);

    // The first tile of each sheet must land on that sheet's base id, or the
    // editor would write flags the engine reads from a different sheet.
    for (const [index, base] of Object.entries(sheets.NORMAL_SHEET_BASE)) {
        assert.equal(sheets.baseTileIdForSheet(Number(index)), base);
        assert.equal(sheets.setNumberForNormalTileId(base), Number(index),
            `sheet ${index} round-trips through the engine formula`);
    }
});

test('the map editor derives F and G tile ids from the shared table', () => {
    // The B-E cases were four copies of one formula; F and G joined that case
    // rather than adding more copies. Guard against a regression to per-sheet
    // literals that could drift from NORMAL_SHEET_BASE.
    assert.match(mapEditorSource,
        /case 'F':\s*\n\s*case 'G': \{/,
        'F and G share the normal-sheet case');
    assert.match(mapEditorSource,
        /RRTilesetSheets\.baseTileIdForSheet\(RRTilesetSheets\.indexFromKey\(layer\)\)/,
        'and take their base from the shared table');
});

test('slot 11 is left free on purpose', () => {
    // The legacy renderer packs sheets four to a 2048px texture with
    // MAX_GL_TEXTURES = 3, and UltraMode7 reimplements that packing as
    // `setNumber >> 2`. Slots 0-11 stay inside it; slot 12 does not.
    assert.match(coreSource, /Tilemap\.Layer\.MAX_GL_TEXTURES = 3;/);
    assert.equal(sheets.SHEET_COUNT, 11, 'F and G bring the count to 11');
    assert.ok(sheets.SHEET_COUNT < 12,
        'adding a twelfth sheet would break UltraMode7 tile rendering');
    assert.deepEqual(sheets.SHEET_KEYS.slice(-2), ['F', 'G']);
});

test('legacy nine-entry tilesetNames still work untouched', () => {
    // An MZ-authored tileset carries nine names. Reactor must not rewrite it,
    // so a project that never uses F/G keeps byte-identical data.
    const mzTileset = ['a1', 'a2', 'a3', 'a4', 'a5', 'b', 'c', 'd', 'e'];
    assert.equal(sheets.nameAt(mzTileset, 8), 'e');
    assert.equal(sheets.nameAt(mzTileset, 9), '', 'an unset F reads as empty');
    assert.equal(sheets.nameAt(mzTileset, 10), '', 'an unset G reads as empty');
    assert.equal(mzTileset.length, 9, 'and reading does not grow the array');
});

test('assigning G to a legacy tileset leaves no holes', () => {
    // Writing index 10 into a nine-entry array would leave index 9 a hole,
    // which JSON.stringify emits as null -- and the runtime hands every entry
    // of this array to ImageManager.loadTileset via for...of.
    const tileset = ['a1', 'a2', 'a3', 'a4', 'a5', 'b', 'c', 'd', 'e'];
    sheets.setNameAt(tileset, 10, 'my_sheet_g');

    assert.equal(tileset.length, 11);
    assert.equal(tileset[9], '', 'the skipped F slot is filled, not a hole');
    assert.equal(tileset[10], 'my_sheet_g');
    assert.ok(tileset.every(name => typeof name === 'string'),
        'every entry stays a string');
    assert.ok(!JSON.parse(JSON.stringify(tileset)).includes(null),
        'and no null survives a save/load round trip');
});

test('Demo maps only use the F/G band where their tileset assigns a sheet', () => {
    // The band is only safe because RPG Maker never emits it, so a map may
    // carry ids in it only when its own tileset actually names an F or G
    // sheet — which is Reactor authoring, not imported data. A band id under
    // a tileset with empty F/G slots would be a collision. Only template/Demo
    // is tracked by the repository, so that is the one project a test may
    // reach for; it is absent from a source-only checkout, in which case this
    // is a no-op rather than a failure.
    const dir = path.join(repoRoot, 'template', 'Demo', 'data');
    if (!fs.existsSync(dir)) return;

    let tilesets = null;
    try {
        tilesets = JSON.parse(fs.readFileSync(path.join(dir, 'Tilesets.json'), 'utf8'));
    } catch {
        tilesets = null;
    }
    const hasExtendedSheets = tilesetId => {
        const tileset = tilesets && tilesets[tilesetId];
        const names = tileset && tileset.tilesetNames;
        return !!(names && (names[9] || names[10]));
    };

    let mapsChecked = 0;
    const offenders = [];

    for (const file of fs.readdirSync(dir)) {
        if (!/^Map\d+\.json$/.test(file)) continue;
        let map;
        try {
            map = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        } catch {
            continue;
        }
        if (!map || !Array.isArray(map.data)) continue;
        mapsChecked++;
        if (hasExtendedSheets(map.tilesetId)) continue;
        for (const tileId of map.data) {
            if (sheets.isExtendedTileId(tileId)) {
                offenders.push(`${file}:${tileId}`);
                break;
            }
        }
    }

    assert.deepEqual(offenders, [],
        `maps without F/G sheets must not use 1024-1535 (checked ${mapsChecked} maps)`);
});

test('every palette-to-tile-id path knows about F and G', () => {
    // MapEditor carries two of these switches. Only one was extended when F/G
    // landed; the other fell through to its default and returned 0, and
    // painting tile id 0 erases — so F painted as an eraser while its palette
    // and hover preview both looked correct. Any future sheet must be added to
    // both, so both are pinned here.
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor.js'), 'utf8');
    const switches = ['getTileIdFromPalettePosition', 'getBaseTileIdFromPalettePosition'];

    for (const name of switches) {
        const at = source.indexOf(`${name}(x, y, layer`);
        assert.ok(at >= 0, `${name} is present`);
        const body = source.slice(at, at + 2600);
        for (const key of sheets.NORMAL_SHEET_KEYS) {
            assert.ok(body.includes(`case '${key}':`),
                `${name} handles sheet ${key}`);
        }
        assert.match(body, /baseTileIdForSheet/,
            `${name} takes its base from the shared table rather than a literal`);
    }
});
