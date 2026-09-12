const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const metrics = require(path.join(editorRoot, 'src', 'utils', 'TileMetrics.js'));

test('the tile size comes from the project, not from an assumption', () => {
    // RPG Maker MZ offers 48, 32, 24 and 16 and records the choice in
    // System.json. A real project at 32 rendered as a mosaic of the wrong art
    // in the editor, because every sheet was sampled in 48-pixel steps: each
    // read landed one and a half tiles along and the error accumulated.
    assert.equal(metrics.tileSizeOf({ tileSize: 32 }), 32);
    assert.equal(metrics.tileSizeOf({ tileSize: 24 }), 24);
    assert.equal(metrics.tileSizeOf({ tileSize: 16 }), 16);
    assert.equal(metrics.tileSizeOf({ tileSize: 48 }), 48);

    // Anything else is more likely a damaged file than a project nobody has
    // seen, and guessing silently is what this module exists to stop.
    assert.equal(metrics.tileSizeOf({ tileSize: 12 }), 48);
    assert.equal(metrics.tileSizeOf({ tileSize: '32' }), 32, 'a string still reads as a number');
    assert.equal(metrics.tileSizeOf({}), 48);
    assert.equal(metrics.tileSizeOf(null), 48);
    assert.equal(metrics.tileSizeOf(undefined), 48);

    // A 32-pixel project's sheets are two thirds of MZ's standard layout.
    assert.equal(metrics.sheetScaleOf({ tileSize: 32 }), 2 / 3);
    assert.equal(768 * metrics.sheetScaleOf({ tileSize: 32 }), 512);
    assert.equal(576 * metrics.sheetScaleOf({ tileSize: 32 }), 384);
});

test('the renderers read it rather than hardcoding 48', () => {
    // Each of these sampled sheets in 48-pixel steps, so a 32-pixel project
    // drew the wrong tile everywhere. The distinction that matters: 48 also
    // means "shapes per autotile kind" in tile-id arithmetic, which is a
    // property of the format and must stay exactly where it is.
    const tilemap = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');
    assert.match(tilemap, /this\.TILE_SIZE = this\.readTileSize\(\)/);
    assert.match(tilemap, /refreshTileMetrics\(\)/);
    assert.doesNotMatch(tilemap, /const tileSize = 48/, 'no pixel size is assumed');
    // The format constant survives untouched.
    assert.match(tilemap, /\(tileId - this\.TILE_ID_A1\) \/ 48/);

    const palette = fs.readFileSync(path.join(editorRoot, 'src', 'TilesetPaletteViewer.js'), 'utf8');
    assert.doesNotMatch(palette, /const tileSize = 48/);
    assert.doesNotMatch(palette, /canvasX \/ 48/);
    assert.match(palette, /refreshTileMetrics\(\)/);

    const tilesets = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    assert.match(tilesets, /this\.tileSize = this\.readTileSize\(\)/);
    assert.doesNotMatch(tilesets, /size: 48, stepped/);

    // And the surfaces are told to re-read once the database has loaded, since
    // both are constructed before it.
    const main = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');
    assert.match(main, /tilesetPaletteViewer\.refreshTileMetrics\(\)/);
    assert.match(main, /tilemapManager\.refreshTileMetrics\(\)/);

    // The module is loaded before the code that uses it.
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.ok(html.indexOf('src/utils/TileMetrics.js') > 0, 'the editor loads it');
});

test('nothing that measures in pixels still assumes 48', () => {
    // A sweep rather than a list, because the ones that get missed are the
    // ones nobody thought to look at. The distinction: 48 as a *pixel* size is
    // the project's choice, while 48 as "shapes per autotile kind" is fixed by
    // the file format and must never move.
    const files = [
        'src/TilemapManager.js', 'src/MapEditor.js', 'src/MapEditor3D.js',
        'src/TilesetPaletteViewer.js', 'src/ProjectController.js',
        'src/database/DatabaseTilesetEditor.js',
        // Added after a 32-pixel project shipped with these still assuming 48:
        // event sprites overflowed their box, the event page editor's graphic
        // preview sampled the wrong art, and the Transfer Player map picker
        // put its grid and its clicks out of step with the map it drew.
        'src/EventManager.js', 'src/event/EventPageEditor.js',
        'src/event/commands/TransferPlayerEditor.js'
    ];
    // A default reached when the project has not said — `|| 48`, `: 48`,
    // `return 48` — is the point of the exercise rather than a violation, and
    // `% 48` / `< 48` / `2048 + kind * 48` are the format's shapes per kind.
    const allowed = [
        /\|\| 48/, /: 48\b/, /return 48;/,                      // stated fallbacks
        /[%<] 48/, /\d{4} \+ [^;]*\* 48/,                       // format arithmetic
        /- (?:2048|2816|4352|5888|band\.base|tileStart|this\.TILE_ID_A1)\) \/ 48/,
        /48 (?:IDs|shapes|kinds|variations|consecutive)/,
        /0\.48/, /48, 32, 24, 16/, /prototype\.tileSize = 48/,
        /kindOffset = 48/, /A4 has 48/, /shape slots/,
        /kind - 48/                                            // A3's kinds start at 48
    ];
    const offenders = [];
    for (const file of files) {
        const source = fs.readFileSync(path.join(editorRoot, file), 'utf8');
        source.split('\n').forEach((line, index) => {
            if (!/\b48\b/.test(line)) return;
            if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;        // a comment
            if (allowed.some(pattern => pattern.test(line))) return;
            offenders.push(`${file}:${index + 1}  ${line.trim()}`);
        });
    }
    assert.deepEqual(offenders, [],
        `these still measure in a hardcoded 48:\n${offenders.join('\n')}`);
});

test('changing the size in the Database reaches the open map', () => {
    // Every surface reads the size once, when a project loads. Changing it in
    // the Database and seeing nothing happen until the next launch looks
    // exactly like the setting doing nothing at all.
    const system2 = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseSystem2Editor.js'), 'utf8');
    assert.match(system2, /system\.tileSize = parseInt/);
    assert.match(system2, /rpgReactorTileSizeChanged/, 'it announces the change');

    const main = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');
    assert.match(main, /window\.rpgReactorTileSizeChanged = \(\) =>/);
    assert.match(main, /refreshTileMetrics\(\)/);
    assert.match(main, /loadMap\(openMap/, 'and the open map is redrawn');

    // The map canvas is destroyed and rebuilt for each project, so a handler
    // that captured one is left holding a dead object the moment a second
    // project is opened.
    assert.doesNotMatch(main, /this\.tilemapManager\.refreshTileMetrics\(\),/,
        'the handler resolves the current map canvas rather than capturing one');
});

test('a second project brings its own tile size with it', () => {
    // The map canvas is constructed per project and reads the size on the way
    // up. The palette is built once and kept, so it kept the *first* project's
    // size: opening a 32-pixel project from a 48-pixel one drew a correct map
    // beside a palette whose grid and selection box were half again too big.
    const palette = fs.readFileSync(
        path.join(editorRoot, 'src', 'TilesetPaletteViewer.js'), 'utf8');
    const loadForMap = palette.slice(palette.indexOf('async loadTilesetForMap'));
    assert.match(loadForMap.slice(0, 600), /this\.refreshTileMetrics\(\)/,
        'every map load re-reads it, which covers opening another project');

    // A render cached under the old size would otherwise be restored over the
    // new one.
    assert.match(palette, /this\.tileSize = size;\s*\n\s*\/\/[^\n]*\n\s*this\.cachedLayerCanvas = null;/);

    // The stacked A palette sized its canvas for 48-pixel sheets.
    assert.match(palette, /const canvasWidth = 8 \* this\.tileSize;/);
});

test('an event draws its graphic at the size of the box it sits in', () => {
    // The box is drawn at TILE_WIDTH and the sprite was fitted to a hardcoded
    // 48, so on a 32-pixel project every event sprite overflowed its own tile
    // by half and spilled across its neighbours.
    const events = fs.readFileSync(path.join(editorRoot, 'src', 'EventManager.js'), 'utf8');
    assert.match(events, /const TILE_SIZE = this\.tilemapManager\?\.TILE_WIDTH \|\| 48;/);
    assert.match(events, /const scale = maxSize \/ this\.tilemapManager\.TILE_WIDTH;/);

    // Both surfaces that sample a sheet for an event graphic address B-G the
    // way the map canvas does: two halves of 128, not one 8-wide grid. Read
    // flat, every tile past the 128th sampled off the bottom of the sheet, and
    // F and G were mistaken for E.
    for (const file of ['src/EventManager.js', 'src/event/EventPageEditor.js']) {
        const source = fs.readFileSync(path.join(editorRoot, file), 'utf8');
        assert.match(source, /setNumberForNormalTileId\(tileId\)/, `${file} shares the sheet map`);
        assert.match(source,
            /\(Math\.floor\(localTileId \/ 128\) % 2\) \* 8 \+ \(localTileId % 8\)/,
            `${file} addresses both halves of the sheet`);
    }
});

test('the tile grid is drawn at the size the project chose', () => {
    // A guide is no guide if its squares are not the map's squares: a 32-pixel
    // project needs a 32-pixel grid. Drawn from the manager's own metrics
    // rather than a constant, so it follows System 2 like everything else.
    const tilemap = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');
    const draw = tilemap.slice(tilemap.indexOf('    drawGrid() {'));
    const body = draw.slice(0, draw.indexOf('\n    }'));
    assert.match(body, /x \* this\.TILE_WIDTH/, 'columns step by the project tile width');
    assert.match(body, /y \* this\.TILE_HEIGHT/, 'and rows by its height');
    assert.doesNotMatch(body, /\b48\b/, 'with no pixel size assumed');
});

test('the grid is a preference both canvases read', () => {
    // Turning it on in 2D and finding it off in 3D would be a bug of its own,
    // and both canvases are rebuilt often enough that neither can be trusted
    // to remember on its own.
    const main = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');
    assert.match(main, /applyShowGridPreference\(enabled\)/);
    assert.match(main, /tilemapManager\?\.setGridVisible\?\.\(on\)/, 'the 2D canvas');
    assert.match(main, /mapEditor3D\?\.setGridVisible\?\.\(on\)/, 'and the 3D one');
    assert.match(main, /this\.applyShowGridPreference\(this\.optionsManager\?\.getShowGrid\(\)\)/,
        'and a freshly loaded map is told again, since its canvas is new');

    const options = fs.readFileSync(path.join(editorRoot, 'src', 'OptionsManager.js'), 'utf8');
    assert.match(options, /rr-show-grid-changed/, 'the change is announced');

    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.match(html, /id="map-grid"/, 'and there is a box to tick, beside A1 and 3D');
});

test('the region and object overlays are drawn to the project tile size', () => {
    /*
     * The cells always were — they are laid out from TILE_WIDTH. The *numbers*
     * on them were not: a hardcoded 18px glyph with a 4px outline, drawn into
     * a canvas the size of a tile. At the 48 the editor was written against
     * that fits; at 16 it is not a number but a smear the width of the cell
     * and taller than it, and at 24 it fills the cell edge to edge.
     *
     * Four places drew one: both overlays, and both cursor previews.
     */
    const fs = require('node:fs');
    const path = require('node:path');
    const src = name => fs.readFileSync(
        path.join(__dirname, '..', 'src', name), 'utf8');

    for (const name of ['RegionManager.js', 'Object3DManager.js', 'MapEditor.js']) {
        const source = src(name);
        assert.doesNotMatch(source, /font(Size)?: ?'?bold 18px|fontSize: 18\b/,
            `${name} has no number fixed at 18px`);
    }
    // Sized from the smaller of the two axes, so a non-square tile still fits.
    assert.match(src('RegionManager.js'), /Math\.min\(TW, TH\) \* 0\.42/);
    assert.match(src('Object3DManager.js'), /Math\.min\(tileW, tileH\) \* 0\.42/);
    // The outline scales too — a 4px stroke on a 7px glyph is a black blob.
    for (const name of ['RegionManager.js', 'Object3DManager.js', 'MapEditor.js']) {
        assert.match(src(name), /Math\.round\(\s*(regionLabelSize|size) \/ 4\.5\)/,
            `${name} scales the outline with the glyph`);
    }
});

test('a region texture is not reused at the wrong tile size', () => {
    // The cache was keyed by region number alone, so opening a 24-pixel
    // project after a 48-pixel one handed it the previous one's textures.
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'RegionManager.js'), 'utf8');
    assert.match(source, /const key = `\$\{regionId\}:\$\{TW\}x\$\{TH\}`/);
    assert.match(source, /this\._tileTextures\.set\(key, tex\)/);
});
