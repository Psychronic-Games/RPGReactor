const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const classes = require(path.join(editorRoot, 'src', 'utils', 'Tileset3DClass.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

const quietConsole = Object.create(console);
quietConsole.log = () => {};
quietConsole.warn = () => {};
quietConsole.error = () => {};

function loadBrowserClass(relativePath, className, globals = {}) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', relativePath), 'utf8');
    return vm.runInNewContext(`${source}\n${className};`, {
        console: quietConsole,
        process,
        require,
        nw: {},
        RRTileset3DClass: classes,
        ...globals
    });
}

function tempProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-tileset-3d-'));
    fs.mkdirSync(path.join(root, 'data'));
    return root;
}

//-----------------------------------------------------------------------------
// Storage key

test('an autotile is classified once, not forty-eight times', () => {
    // A shape is a corner arrangement, not a different kind of thing, so all 48
    // ids of a kind read one entry. Without this the file would carry tens of
    // thousands of lines for a single tileset.
    const base = 2816;
    let data = classes.setClass(classes.create(), 3, base + 17, classes.UPRIGHT);

    assert.deepEqual(Object.keys(data.tilesets['3']), [String(base)]);
    for (const shape of [0, 1, 17, 47]) {
        assert.equal(classes.classOf(data, 3, base + shape), classes.UPRIGHT,
            `shape ${shape} reads the kind's class`);
    }
    assert.equal(classes.classOf(data, 3, base + 48), classes.AUTO, 'the next kind is untouched');
});

test('the editor and the runtime fold ids the same way', () => {
    for (const tileId of [0, 255, 1024, 1535, 1536, 2047, 2048, 2049, 2095, 2096, 4351, 8191, 8192]) {
        assert.equal(classes.keyFor(tileId), Reactor3D.classKey(tileId),
            `tile ${tileId} folds identically`);
    }
});

test('a hand-written file naming a shape is still read back', () => {
    // normalize folds keys, so a file edited by hand or written by an older
    // build resolves through the same lookup the runtime uses.
    const data = classes.normalize({ version: 1, tilesets: { 3: { 2833: classes.GROUND } } });
    assert.deepEqual(Object.keys(data.tilesets['3']), ['2816']);
    assert.equal(classes.classOf(data, 3, 2816), classes.GROUND);
});

//-----------------------------------------------------------------------------
// Persistence

test('the database loads a classification sidecar and hands it to callers', async () => {
    const DatabaseManager = loadBrowserClass('DatabaseManager.js', 'DatabaseManager');
    const manager = new DatabaseManager();
    const root = tempProject();
    try {
        for (const [key, fileName] of manager.dataFiles) {
            fs.writeFileSync(path.join(root, 'data', fileName),
                JSON.stringify(key === 'system' ? {} : [null]));
        }
        fs.writeFileSync(path.join(root, 'data', classes.FILENAME), JSON.stringify({
            version: 1,
            tilesets: { 5: { 1029: classes.UPRIGHT, 40: 'nonsense' } }
        }));

        assert.equal(await manager.loadAllData(root), true);
        const store = manager.getTileset3D();
        assert.equal(classes.classOf(store, 5, 1029), classes.UPRIGHT);
        assert.equal(classes.classOf(store, 5, 40), classes.AUTO, 'garbage entries are dropped');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('a project that never classifies a tile gains no file', async () => {
    const DatabaseManager = loadBrowserClass('DatabaseManager.js', 'DatabaseManager');
    const manager = new DatabaseManager();
    const root = tempProject();
    try {
        assert.equal(await manager.saveAllData(root), true);
        assert.equal(fs.existsSync(path.join(root, 'data', classes.FILENAME)), false,
            'the 3D feature costs a 2D project nothing, not even an empty file');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('classification saves with the database and reads back in the runtime', async () => {
    const DatabaseManager = loadBrowserClass('DatabaseManager.js', 'DatabaseManager');
    const manager = new DatabaseManager();
    const root = tempProject();
    try {
        classes.setClass(manager.getTileset3D(), 7, 2816, classes.UPRIGHT);
        assert.equal(await manager.saveAllData(root), true);

        const written = JSON.parse(fs.readFileSync(path.join(root, 'data', classes.FILENAME), 'utf8'));
        Reactor3D.setClassification(written);
        try {
            // The whole point of the file: the runtime resolves the same tile
            // to the same class from any shape of the autotile.
            assert.equal(Reactor3D.tileClass(7, 2816), Reactor3D.CLASS_UPRIGHT);
            assert.equal(Reactor3D.tileClass(7, 2839), Reactor3D.CLASS_UPRIGHT);
            assert.equal(Reactor3D.tileClass(7, 100), Reactor3D.CLASS_AUTO);
        } finally {
            Reactor3D.setClassification(null);
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('an emptied classification keeps its file rather than leaving a stale one', async () => {
    const DatabaseManager = loadBrowserClass('DatabaseManager.js', 'DatabaseManager');
    const manager = new DatabaseManager();
    const root = tempProject();
    const filePath = path.join(root, 'data', classes.FILENAME);
    try {
        classes.setClass(manager.getTileset3D(), 7, 2816, classes.UPRIGHT);
        await manager.saveTileset3D(root);

        classes.setClass(manager.getTileset3D(), 7, 2816, classes.AUTO);
        await manager.saveTileset3D(root);

        assert.equal(fs.existsSync(filePath), true, 'the file the author has in version control stays');
        assert.equal(classes.isEmpty(JSON.parse(fs.readFileSync(filePath, 'utf8'))), true,
            'and no longer claims a class that was cleared');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('unsaved classification counts as unsaved work', async () => {
    const DatabaseManager = loadBrowserClass('DatabaseManager.js', 'DatabaseManager');
    const manager = new DatabaseManager();
    const root = tempProject();
    try {
        // The close-without-saving prompt reads getDirtyKeys; classification
        // lives outside dataFiles, so it has to be reported explicitly or a
        // whole afternoon of classifying vanishes without a warning.
        // Array.from: the manager builds its arrays inside a VM realm, where
        // deepStrictEqual rejects them on prototype identity alone.
        await manager.saveAllData(root);
        assert.deepEqual(Array.from(manager.getDirtyKeys()), []);

        classes.setClass(manager.getTileset3D(), 2, 1029, classes.GROUND);
        assert.deepEqual(Array.from(manager.getDirtyKeys()), ['tileset3d']);

        await manager.saveAllData(root);
        assert.deepEqual(Array.from(manager.getDirtyKeys()), []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('a damaged sidecar leaves the database openable', async () => {
    const DatabaseManager = loadBrowserClass('DatabaseManager.js', 'DatabaseManager');
    const manager = new DatabaseManager();
    const root = tempProject();
    try {
        for (const [key, fileName] of manager.dataFiles) {
            fs.writeFileSync(path.join(root, 'data', fileName),
                JSON.stringify(key === 'system' ? {} : [null]));
        }
        fs.writeFileSync(path.join(root, 'data', classes.FILENAME), '{"tilesets":');

        assert.equal(await manager.loadAllData(root), true);
        assert.equal(classes.isEmpty(manager.getTileset3D()), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

//-----------------------------------------------------------------------------
// Authoring UI

function recordingContext() {
    const calls = [];
    const record = name => (...args) => calls.push({ name, args });
    return {
        calls,
        canvas: { width: 384, height: 384 },
        fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: '', lineCap: '',
        font: '', textAlign: '', textBaseline: '',
        fillRect: record('fillRect'),
        strokeRect: record('strokeRect'),
        fillText: record('fillText'),
        strokeText: record('strokeText'),
        beginPath: record('beginPath'),
        moveTo: record('moveTo'),
        lineTo: record('lineTo'),
        arc: record('arc'),
        fill: record('fill'),
        stroke: record('stroke'),
        clearRect: record('clearRect'),
        drawImage: record('drawImage')
    };
}

function tilesetEditor() {
    const Editor = loadBrowserClass(path.join('database', 'DatabaseTilesetEditor.js'),
        'DatabaseTilesetEditor', {
            window: { RRTileset3DClass: classes },
            document: { getElementById: () => null, querySelectorAll: () => [] }
        });
    const editor = new Editor(null, '/project', null);
    editor.currentTileset = {
        id: 4,
        name: 'Town',
        tilesetNames: ['', '', '', '', '', 'Outside_B', '', '', '', '', ''],
        flags: new Array(8192).fill(0)
    };
    // Standalone: no database owns the store, so it is created here rather
    // than read from a project that does not exist.
    editor._tileset3d = classes.create();
    return editor;
}

test('the tileset editor offers 3D classification as an edit mode', () => {
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    assert.match(source, /data-mode="tile3d"/, 'a mode button exists');
    assert.match(source, /class="compact-flag-btn" id="flag-tile3d"/,
        'and joins the existing column of mode buttons');
});

test('clicking a tile cycles it through every class and back to automatic', () => {
    const editor = tilesetEditor();
    const tileIndex = 1029;

    for (const expected of [classes.GROUND, classes.UPRIGHT, classes.SCENERY,
        classes.FOLIAGE, classes.PANEL, classes.AUTO]) {
        editor.cycleTile3DClass(tileIndex);
        assert.equal(classes.classOf(editor._tileset3d, 4, tileIndex), expected);
    }
    assert.equal(classes.isEmpty(editor._tileset3d), true, 'and leaves nothing behind');
});

test('3D mode replaces the flag markers instead of crowding them', () => {
    // A tile already carries up to seven flag glyphs; classifying a building
    // means reading its shape in the art underneath.
    const editor = tilesetEditor();
    editor.currentTileset.flags[0] = 0x0f;   // an X the flag overlay would draw

    const flagCtx = recordingContext();
    editor.currentEditMode = 'passability';
    editor.drawCompactPassageOverlay(flagCtx, 48, 48, 5, true);
    assert.equal(flagCtx.calls.some(call => call.name === 'fillText' && call.args[0] === 'X'), true);

    const classCtx = recordingContext();
    editor.currentEditMode = 'tile3d';
    editor.drawCompactPassageOverlay(classCtx, 48, 48, 5, true);
    assert.equal(classCtx.calls.some(call => call.name === 'fillText'), false,
        'no flag glyphs in 3D mode');
});

test('an unclassified tile is left unmarked so classified ones stand out', () => {
    const editor = tilesetEditor();
    editor.currentEditMode = 'tile3d';

    const blank = recordingContext();
    editor.drawCompactPassageOverlay(blank, 48, 48, 5, true);
    assert.deepEqual(blank.calls, [], 'automatic tiles draw nothing at all');

    editor.cycleTile3DClass(0);
    const marked = recordingContext();
    editor.drawCompactPassageOverlay(marked, 48, 48, 5, true);
    assert.equal(marked.calls.some(call => call.name === 'fillRect'), true);
});

test('switching in and out of 3D mode repaints what is on screen', () => {
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    // The mode changes what the overlay shows, not just what a click does, so
    // the canvases already drawn have to be repainted or the view lies.
    assert.match(source, /was3D !== \(mode === 'tile3d'\)\) this\.refreshOverlays\(\)/);

    const editor = tilesetEditor();
    const repainted = [];
    editor.redrawCanvasOverlay = (canvas, imageIndex) => repainted.push(imageIndex);
    editor.tabCanvases = [
        { canvas: {}, imageIndex: 0, isSplitSheet: false },
        { canvas: {}, imageIndex: 4, isSplitSheet: false }
    ];
    editor.refreshOverlays();
    assert.deepEqual(repainted, [0, 4], 'every stacked canvas of the A tab');
});

test('standalone saves write the classification beside Tilesets.json', () => {
    const editor = tilesetEditor();
    const root = tempProject();
    try {
        editor.projectPath = root;
        editor.tilesetList = [null, editor.currentTileset];
        editor.currentTileset.id = 1;
        classes.setClass(editor._tileset3d, 1, 1029, classes.UPRIGHT);

        editor.saveTilesetsFile();

        assert.equal(fs.existsSync(path.join(root, 'data', 'Tilesets.json')), true);
        const written = JSON.parse(fs.readFileSync(path.join(root, 'data', classes.FILENAME), 'utf8'));
        assert.equal(classes.classOf(written, 1, 1029), classes.UPRIGHT);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('the database owns the store whenever there is one', () => {
    // Otherwise the modal's OK and Cancel would cover every edit except the 3D
    // classes, which would persist through a Cancel and vanish on an OK.
    const editor = tilesetEditor();
    const store = classes.create();
    editor.databaseManager = { getTileset3D: () => store, saveTileset3D: () => true };

    editor.cycleTile3DClass(1029);
    assert.equal(classes.classOf(store, 4, 1029), classes.GROUND);
    assert.equal(classes.isEmpty(editor._tileset3d), true, 'the standalone store stays unused');
});

test('every flag mode button carries an icon', () => {
    // The modes were told apart by a couple of ASCII characters, and half of
    // them had none at all.
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    const start = source.indexOf('    static flagIcon(mode) {');
    assert.ok(start > 0, 'flagIcon exists');
    const end = source.indexOf('\n    }\n', start) + 6;
    // eslint-disable-next-line no-new-func
    const holder = new Function(`return class X {${source.slice(start, end)}}`)();

    for (const mode of ['passability', '4dir', 'ladder', 'bush', 'counter',
        'damage', 'terrain', 'tile3d']) {
        const svg = holder.flagIcon(mode);
        assert.match(svg, /^<svg /, `${mode} has an icon`);
        assert.match(svg, /viewBox="0 0 24 24"/, `${mode} shares the grid`);
        // currentColor, so a selected button's icon follows its label.
        assert.match(svg, /stroke="currentColor"/, `${mode} takes the button's colour`);
        assert.ok(svg.length < 700, `${mode} stays simple enough to read at 16px`);
    }
    assert.equal(holder.flagIcon('nonexistent'), '', 'an unknown mode gets nothing');

    // And each button actually renders one.
    for (const mode of ['passability', '4dir', 'damage', 'tile3d']) {
        assert.match(source, new RegExp(`flagIcon\\('${mode}'\\)`), `${mode} button uses it`);
    }
});

test('every flag mode explains its own marks', () => {
    // The overlays draw a lot of small glyphs and none of them announce
    // themselves; the key sits in the margin the sheet already left empty.
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    // flagKey delegates to flagKeyRows, so both come across, and the class
    // keeps its own name because the one calls the other through it.
    const rowsStart = source.indexOf('    static flagKeyRows(mode) {');
    const keyStart = source.indexOf('    static flagKey(mode, passageBrush) {');
    assert.ok(rowsStart > 0 && keyStart > rowsStart, 'flagKey and flagKeyRows exist');
    const body = source.slice(rowsStart, source.indexOf('\n    }\n', keyStart) + 6);
    // eslint-disable-next-line no-new-func
    const holder = new Function(`class DatabaseTilesetEditor {${body}}
        return DatabaseTilesetEditor;`)();

    for (const mode of ['passability', '4dir', 'ladder', 'bush', 'counter',
        'damage', 'terrain', 'tile3d']) {
        assert.match(holder.flagKey(mode), /Key/, `${mode} has a key`);
    }
    const shape = holder.flagKey('tile3d');
    for (const label of ['Flat', 'Upright', 'Scenery', 'Foliage', 'declared 3D object']) {
        assert.ok(shape.includes(label), `the 3D key explains ${label}`);
    }
    // Every row draws its mark with the same code the tile overlay uses, so
    // the key cannot say one thing while the sheet shows another.
    for (const [mark] of holder.flagKeyRows('tile3d')) {
        assert.ok(shape.includes(`data-mark="${mark}"`), `${mark} has a drawn swatch`);
    }
    for (const mode of ['ladder', 'bush', 'counter']) {
        assert.match(holder.flagKey(mode), /data-mark="/, `${mode} draws its glyph, not a blank tint`);
    }
    assert.equal(holder.flagKey('nonexistent'), '', 'an unknown mode gets no panel');

    // The tools are a palette, not a cycle: Select looks without changing.
    assert.match(source, /static tile3dTools\(\)/);
    assert.match(source, /\['select', tt\('Select'\)/);
    assert.match(source, /this\.tile3dTool \|\| 'select'/);
    assert.match(source, /drawKeyMark\(/, 'the marks are drawn, not tinted squares');

    // The panels have somewhere to live, and are drawn when the mode changes.
    assert.match(source, /id="flag-mode-key"/);
    assert.match(source, /id="tile3d-preview"/);
    assert.match(source, /this\.refreshFlagKey\(\);/);
    assert.match(source, /this\.refreshTile3DPreview\(\);/);
});

test('the 3D preview draws the selected tile', () => {
    // It went blank once already, and nothing caught it: the panel is built
    // from a string and drawn into afterwards, so both halves need exercising.
    const editor = tilesetEditor();
    const classes = editor.tileset3DClasses();
    editor.currentEditMode = 'tile3d';
    editor._preview3dTile = 1029;

    const calls = [];
    const ctx = new Proxy({}, {
        get: (target, name) => {
            if (name === 'canvas') return { width: 146, height: 146 };
            return (...args) => calls.push({ name: String(name), args });
        },
        set: () => true
    });
    const canvas = { width: 146, height: 146, getContext: () => ctx, addEventListener() {} };
    // An autotile draws from the rendered palette rather than from a sheet,
    // because the A tabs show one composed cell per kind. Addressing it as a
    // sheet drew nothing at all.
    // From the cached base render, not the tab canvas: the tab has the flag
    // overlay painted onto it, so copying a cell from there carried the class
    // chevron into the preview as though it were part of the art.
    // Seeded under the key the loader writes — the file named the way it was
    // loaded, with its extension. Seeding the bare name instead is what let
    // this test pass while the editor drew an empty box: the lookup agreed
    // with the test and with nothing that fills the cache.
    editor.currentTileset.tilesetNames[1] = 'A2Sheet';
    editor.imageCache.set('1_A2Sheet.png', { width: 384, height: 384 });
    assert.equal(editor.baseCacheKey(1), '1_A2Sheet.png');
    editor._preview3dCell = { imageIndex: 1, x: 1, y: 0 };
    const autotile = editor.previewArtSource({ tile: 2816 + 48, w: 1, h: 1, roles: 'S' });
    assert.ok(autotile && autotile.image, 'an autotile finds art to draw');
    assert.equal(autotile.stepped, false, 'and does not step through sheet cells');
    assert.equal(autotile.image.width, 384, 'it is the unmarked render');

    // A5 sits on the A tab and is not an autotile: whole tiles, eight to a
    // row, so it addresses its sheet like B-G and can be part of an object.
    assert.equal(classes.isPictureTile(1536 + 9), true);
    assert.equal(classes.isPictureTile(2816), false);
    const a5 = classes.sheetCell(1536 + 9);
    assert.equal(a5.setNumber, 4);
    assert.equal(a5.col, 1);
    assert.equal(a5.row, 1);
    assert.equal(classes.tileAtCell(4, 1, 1), 1536 + 9, 'and addresses back');

    editor.drawTile3DPreview(canvas, { tile: 1029, w: 2, h: 2, roles: 'SSFF' });
    assert.ok(calls.some(call => call.name === 'clearRect'), 'the pane is cleared');
    assert.ok(calls.some(call => call.name === 'fill'), 'the ground is drawn');
    // Four cells: two standing, two flat. Without the sheet loaded each falls
    // back to a placeholder box rather than drawing nothing at all.
    const pieces = calls.filter(call => call.name === 'fillRect' || call.name === 'drawImage');
    assert.equal(pieces.length, 4, 'one piece per cell of the object');

    // Turning moves the ground under the object. It cannot move the standing
    // art, which is a cut-out that spins to face the camera and so looks the
    // same from every side — the ground is what makes the turn legible.
    const groundBefore = JSON.stringify(calls.filter(c => c.name === 'lineTo').map(c => c.args));
    const flatBefore = JSON.stringify(pieces.slice(0, 2).map(call => call.args));
    calls.length = 0;
    editor._preview3dYaw = 70;
    editor.drawTile3DPreview(canvas, { tile: 1029, w: 2, h: 2, roles: 'SSFF' });
    const turned = calls.filter(call => call.name === 'fillRect' || call.name === 'drawImage');
    assert.equal(turned.length, 4, 'still one piece per cell');
    assert.notEqual(JSON.stringify(calls.filter(c => c.name === 'lineTo').map(c => c.args)),
        groundBefore, 'the ground has turned');
    assert.notEqual(JSON.stringify(turned.slice(0, 2).map(call => call.args)), flatBefore,
        'and the pieces lying on it have turned with it');
    assert.ok(classes, 'the store is available to the editor');
});

test('a drag applies the tool over the whole rectangle', () => {
    // Declaring an object is a rectangle by definition, and counting corners
    // one click at a time was the wrong shape for it.
    const editor = tilesetEditor();
    const classes = editor.tileset3DClasses();
    const store = editor.tileset3DStore();
    editor.currentEditMode = 'tile3d';

    // Away from tile 0, which is the engine's "no tile" and cannot be art.
    editor.tile3dTool = 'upright';
    editor.applyTile3DTool({ imageIndex: 5, from: { x: 1, y: 1 }, to: { x: 2, y: 2 } }, 5, 8);
    for (const tile of [9, 10, 17, 18]) {
        assert.equal(classes.classOf(store, editor.currentTileset.id, tile), classes.UPRIGHT,
            `tile ${tile} was painted`);
    }

    editor.tile3dTool = 'object';
    editor.applyTile3DTool({ imageIndex: 5, from: { x: 2, y: 2 }, to: { x: 1, y: 1 } }, 5, 8);
    const declared = classes.objectAt(store, editor.currentTileset.id, 18);
    assert.ok(declared, 'a backwards drag declares the same rectangle');
    assert.equal(declared.object.w, 2);
    assert.equal(declared.object.h, 2);

    // Clear is the one destructive tool: undeclaring an object and forgetting
    // a tile's class were two buttons that overlapped almost entirely, so they
    // are one. Clearing a tile takes the whole object it belongs to with it.
    editor.tile3dTool = 'clear';
    editor.applyTile3DTool({ imageIndex: 5, from: { x: 1, y: 1 }, to: { x: 1, y: 1 } }, 5, 8);
    assert.equal(classes.objectAt(store, editor.currentTileset.id, 18), null,
        'and Clear undeclares it');
    assert.equal(classes.classOf(store, editor.currentTileset.id, 9), classes.AUTO,
        'along with the class on the tile that was cleared');
    assert.equal(classes.classOf(store, editor.currentTileset.id, 18), classes.UPRIGHT,
        'while a tile outside the drag keeps its own');

    editor.tile3dTool = 'select';
    editor._preview3dTile = null;
    editor.applyTile3DTool({ imageIndex: 5, from: { x: 4, y: 0 }, to: { x: 4, y: 0 } }, 5, 8);
    assert.equal(editor._preview3dTile, 4, 'Select only selects');
    assert.equal(classes.classOf(store, editor.currentTileset.id, 4), classes.AUTO,
        'and changes nothing');
});

test('autotiles take a 3D class, and say so when asked for an object', () => {
    // The A tabs index by autotile *kind*, 48 flag slots apart, so a class
    // painted there has to land on the kind's base id or the runtime reads an
    // untouched slot. Declaring an object there is meaningless — an autotile id
    // is a corner arrangement, not a place in a drawing — and saying nothing at
    // all just looks broken.
    const editor = tilesetEditor();
    const classes = editor.tileset3DClasses();
    const store = editor.tileset3DStore();
    editor.currentEditMode = 'tile3d';

    // A2 tab (imageIndex 1), second kind along: 2816 + 48.
    const a2Kind = editor.getTileIndexForImage(1, 1, 0, 8);
    assert.equal(a2Kind, 2816 + 48, 'the A2 palette indexes by kind');

    editor.tile3dTool = 'foliage';
    editor.applyTile3DTool({ imageIndex: 1, from: { x: 1, y: 0 }, to: { x: 1, y: 0 } }, 1, 8);
    assert.equal(classes.classOf(store, editor.currentTileset.id, a2Kind), classes.FOLIAGE,
        'the class lands on the autotile kind');
    // And every shape of that kind reads it back, which is what the map does.
    assert.equal(classes.classOf(store, editor.currentTileset.id, a2Kind + 17), classes.FOLIAGE);

    editor.tile3dTool = 'object';
    editor.applyTile3DTool({ imageIndex: 1, from: { x: 1, y: 0 }, to: { x: 2, y: 1 } }, 1, 8);
    assert.equal(classes.objectAt(store, editor.currentTileset.id, a2Kind), null,
        'no object is declared over autotiles');
    assert.equal(classes.classOf(store, editor.currentTileset.id, a2Kind), classes.FOLIAGE,
        'and the class it already had is left alone');
});

test('a stray click cannot undo an object', () => {
    // Redeclaring one cell of a 2x2 replaced it with a 1x1, so a single
    // misplaced click destroyed the grouping.
    const editor = tilesetEditor();
    const classes = editor.tileset3DClasses();
    const store = editor.tileset3DStore();
    editor.currentEditMode = 'tile3d';
    editor.tile3dTool = 'object';

    editor.applyTile3DTool({ imageIndex: 5, from: { x: 1, y: 1 }, to: { x: 2, y: 2 } }, 5, 8);
    const declared = classes.objectAt(store, editor.currentTileset.id, 9);
    assert.equal(declared.object.w, 2, 'declared 2x2');

    editor.applyTile3DTool({ imageIndex: 5, from: { x: 2, y: 2 }, to: { x: 2, y: 2 } }, 5, 8);
    const after = classes.objectAt(store, editor.currentTileset.id, 9);
    assert.equal(after.object.w, 2, 'a one-tile click inside it changes nothing');
    assert.equal(classes.objectList(store, editor.currentTileset.id).length, 1);

    // Selecting inside an object selects the object, not the square clicked.
    editor.tile3dTool = 'select';
    editor.applyTile3DTool({ imageIndex: 5, from: { x: 2, y: 2 }, to: { x: 2, y: 2 } }, 5, 8);
    // Field by field: the editor is evaluated in its own context, so its
    // object literals do not share a prototype with this file's. An object's
    // selection is stored in sheet coordinates so the palette can draw it as
    // both display pieces when it crosses the seam.
    const rect = editor.selected3dRect;
    assert.equal(rect.sheet.col, 1);
    assert.equal(rect.sheet.row, 1);
    assert.equal(rect.sheet.w, 2);
    assert.equal(rect.sheet.h, 2);
});

test('A5 declares objects; only A1-A4 cannot', () => {
    // A5 sits on the A tab and looks like the autotiles, but it is whole tiles
    // in an eight-wide grid — exactly like B-G — so a wall drawn across two of
    // its cells is as much one object as a wall on the B sheet.
    const editor = tilesetEditor();
    const classes = editor.tileset3DClasses();
    const store = editor.tileset3DStore();
    editor.currentEditMode = 'tile3d';
    editor.tile3dTool = 'object';

    // A5 is imageIndex 4, and its palette indexes straight into 1536+.
    const a5 = editor.getTileIndexForImage(4, 1, 1, 8);
    assert.ok(a5 >= 1536 && a5 < 2048, 'the A5 palette indexes into the A5 band');

    editor.applyTile3DTool({ imageIndex: 4, from: { x: 1, y: 1 }, to: { x: 2, y: 2 } }, 4, 8);
    const declared = classes.objectAt(store, editor.currentTileset.id, a5);
    assert.ok(declared, 'A5 tiles group into an object');
    assert.equal(declared.object.w, 2);
    assert.equal(declared.object.h, 2);

    // A1-A4 still refuse, because their ids are corner arrangements.
    editor.applyTile3DTool({ imageIndex: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }, 1, 8);
    assert.equal(classes.objectAt(store, editor.currentTileset.id,
        editor.getTileIndexForImage(1, 0, 0, 8)), null);
});

test('laying an object\'s rows flat is written to the file', () => {
    /*
     * The Role tool cycled the roles in memory and returned without saving.
     * Every other tool in `applyTile3DTool` saves — Object, Clear, Roof and
     * the class painters all do — so this one read as doing nothing at all,
     * and reopening the project stood the rows back up.
     *
     * It matters more than most: roles are how an author says which rows of a
     * drawing are the ground it stands on rather than its height. Without
     * them a seven-row gateway is seven rows tall and plants itself on its
     * southern edge, which is three tiles from where its island is.
     */
    const editor = tilesetEditor();
    const store = editor._tileset3d;
    editor.currentEditMode = 'tile3d';

    editor.refreshOverlays = () => {};

    // A 2x2 object on the B sheet, then lay its bottom row flat.
    editor.tile3dTool = 'object';
    editor.applyTile3DTool({ imageIndex: 5, from: { x: 1, y: 1 }, to: { x: 2, y: 2 } }, 5, 8);
    const topLeft = editor.getTileIndexForImage(5, 1, 1, 8);
    assert.ok(classes.objectAt(store, 4, topLeft), 'the object is declared');

    const saves = [];
    editor.saveTileset3DFile = () => saves.push(classes.objectAt(store, 4,
        editor.getTileIndexForImage(5, 1, 2, 8)).role);

    editor.tile3dTool = 'role';
    editor.applyTile3DTool({ imageIndex: 5, from: { x: 1, y: 2 }, to: { x: 2, y: 2 } }, 5, 8);

    const bottomLeft = editor.getTileIndexForImage(5, 1, 2, 8);
    assert.equal(classes.roleOf(store, 4, bottomLeft), classes.FLAT,
        'the bottom row lies flat');
    assert.equal(classes.roleOf(store, 4, topLeft), classes.STAND,
        'and the top row still stands');
    assert.deepEqual(saves, [classes.FLAT],
        'saved once, after the change rather than before it');
});

test('an object crossing the palette seam extends and selects as one', () => {
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    // Shift, Ctrl, and Cmd all arm the extend gesture.
    assert.match(source, /event\.shiftKey \|\| event\.ctrlKey \|\| event\.metaKey/);
    // Object selections are stored in sheet coordinates and drawn as the
    // display pieces the split palette shows, so a full-sheet prop reads as
    // one selected object instead of a box at impossible coordinates.
    assert.match(source, /static sheetSelection\(classes, object, imageIndex\)/);
    assert.match(source, /sheetSelection\(classes, member\.object, imageIndex\)/);
    assert.match(source, /sheetSelection\(\s*classes, wholeObject, imageIndex\)/);
    const drawAt = source.indexOf('const chosen = this.selected3dRect;');
    const draw = source.slice(drawAt, drawAt + 2000);
    assert.match(draw, /chosen\.sheet/);
    assert.match(draw, /s\.row \+ 16/, 'the right half draws sixteen rows down');
});

test('merging across the seam yields the full sheet rectangle on F', () => {
    const DatabaseTilesetEditor = require(
        path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'));
    const classes = require(path.join(editorRoot, 'src', 'utils', 'Tileset3DClass.js'));
    const editor = Object.create(DatabaseTilesetEditor.prototype);
    editor.currentTileset = { id: 2 };
    editor.tileset3DClasses = () => classes;
    const store = classes.create ? classes.create() : { tilesets: {} };
    classes.defineObject(store, 2, 1024, 8, 16); // F upper display half
    editor.tileset3DStore = () => store;

    // The lower display half starts at F's sheet column 8: tile 1024 + 128.
    const merged = editor.mergeTile3DObject(1024, 1024 + 128, 8, 16);
    assert.ok(merged && !merged.error, merged && merged.error);
    assert.equal(merged.tile, 1024);
    assert.equal(merged.w, 16);
    assert.equal(merged.h, 16);

    // And the selection for that object spans both display pieces.
    const selection = DatabaseTilesetEditor.sheetSelection(
        classes, { tile: 1024, w: 16, h: 16 }, 9);
    assert.deepEqual(selection.sheet, { col: 0, row: 0, w: 16, h: 16 });
});
