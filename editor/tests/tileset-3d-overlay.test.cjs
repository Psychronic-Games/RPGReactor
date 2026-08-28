/**
 * What the 3D Shape overlay draws.
 *
 * The classification itself is covered by `tileset-3d-class` and
 * `tileset-3d-authoring`; this is about what the author sees while doing it,
 * which is where the mode was reported as confusing: a selected object carried
 * two boxes, one round the object and one round the cell that was clicked, and
 * a multi-cell object was marked in its top-left corner, so it read as one
 * corner standing up rather than as a whole solid thing.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const classes = require(path.join(editorRoot, 'src', 'utils', 'Tileset3DClass.js'));

const quietConsole = Object.create(console);
quietConsole.log = () => {};
quietConsole.warn = () => {};
quietConsole.error = () => {};

function loadEditorClass() {
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    return vm.runInNewContext(`${source}\nDatabaseTilesetEditor;`, {
        console: quietConsole,
        process,
        require,
        window: { RRTileset3DClass: classes },
        document: { getElementById: () => null },
        RRTileset3DClass: classes
    });
}

/** A 2D context that records what it was asked to draw. */
function recordingContext() {
    const ops = [];
    const ctx = {
        ops,
        canvas: { width: 0, height: 0 },
        save() {}, restore() {}, beginPath() { ops.push({ op: 'beginPath' }); },
        moveTo(x, y) { ops.push({ op: 'moveTo', x, y }); },
        lineTo(x, y) { ops.push({ op: 'lineTo', x, y }); },
        stroke() { ops.push({ op: 'stroke' }); },
        fill() { ops.push({ op: 'fill' }); },
        closePath() {},
        setLineDash() {},
        fillRect(x, y, w, h) { ops.push({ op: 'fillRect', x, y, w, h, style: ctx.fillStyle }); },
        strokeRect(x, y, w, h) { ops.push({ op: 'strokeRect', x, y, w, h, style: ctx.strokeStyle }); },
        fillStyle: '', strokeStyle: '', lineWidth: 1
    };
    return ctx;
}

const TILE = 48;

/**
 * An editor sitting on one B sheet, with `size` x `size` tiles showing.
 *
 * Only what the overlay reads is built: the real class needs a project on disk
 * and a database behind it, and neither says anything about where a chevron
 * lands.
 */
function editorOn(store, { size = 8 } = {}) {
    const DatabaseTilesetEditor = loadEditorClass();
    const editor = Object.create(DatabaseTilesetEditor.prototype);
    editor.tileSize = TILE;
    editor.currentTileset = { id: 1, flags: [] };
    editor.currentEditMode = 'tile3d';
    editor._tileset3d = store;
    editor.tileset3DClasses = () => classes;
    editor.tileset3DStore = () => store;
    // The B sheet is 8 columns in the editor's split layout, and tile ids run
    // across then down from 0.
    editor.getTileIndexForImage = (imageIndex, x, y, tilesX) => y * tilesX + x;
    return { editor, width: size * TILE, height: size * TILE };
}

/**
 * The apex of each chevron drawn.
 *
 * `drawFlagArrow` traces every chevron twice — a dark outline under a coloured
 * line — so identical apexes are one chevron, not two.
 */
function arrowApexes(ops) {
    const seen = new Set();
    for (let i = 0; i < ops.length; i++) {
        if (ops[i].op !== 'moveTo') continue;
        const b = ops[i + 1], c = ops[i + 2];
        if (!b || !c || b.op !== 'lineTo' || c.op !== 'lineTo') continue;
        // The apex is the middle of the three points, the one that leaves the
        // baseline the other two share.
        seen.add(`${b.x},${b.y}`);
    }
    return [...seen].map(pair => {
        const [x, y] = pair.split(',').map(Number);
        return { x, y };
    });
}

/** The selection ring, told apart from the dark edging `drawFlagRect` adds. */
function selectionRings(ops) {
    return ops.filter(o => o.op === 'strokeRect' && /120, 205, 255/.test(o.style || ''));
}

test('a multi-cell object is marked in its middle, not in its corner', () => {
    // Marked in the top-left cell, a 3x3 building read as one cell of it
    // standing up while the other eight lay flat — the opposite of what
    // declaring an object says.
    let store = classes.create();
    store = classes.defineObject(store, 1, 9, 3, 3);   // cells (1,1) to (3,3)
    // Classifying is a drag, so every cell of the object carries the class —
    // what changes is that it is only *drawn* once.
    for (const tile of [9, 10, 11, 17, 18, 19, 25, 26, 27]) {
        store = classes.setClass(store, 1, tile, classes.UPRIGHT);
    }

    const { editor, width, height } = editorOn(store);
    const ctx = recordingContext();
    editor.drawTile3DOverlay(ctx, width, height, 5);

    const apexes = arrowApexes(ctx.ops);
    assert.equal(apexes.length, 1, 'one chevron for the whole object, not one per cell');

    // The object covers cells (1,1) to (3,3), so its middle is 2.5 tiles in.
    assert.equal(apexes[0].x, 2.5 * TILE);
    // Upright's chevron rises 9px above the point it is centred on.
    assert.equal(apexes[0].y, 2.5 * TILE - 9);

    // The tint still covers every cell of the object, which is what says how
    // far it reaches.
    const tinted = ctx.ops.filter(o => o.op === 'fillRect' && o.w === TILE && o.h === TILE);
    assert.equal(tinted.length, 9, 'all nine cells are tinted');
});

test('the class clears a flat cell it would otherwise land on', () => {
    // A cell laid flat inside an object draws a bar across the middle of that
    // cell, and the object's class is now drawn in the middle of the object.
    // On a 3x1 whose middle cell is flat those are the same few pixels.
    let store = classes.create();
    store = classes.defineObject(store, 1, 9, 3, 1,
        classes.STAND + classes.FLAT + classes.STAND);
    for (const tile of [9, 10, 11]) {
        store = classes.setClass(store, 1, tile, classes.UPRIGHT);
    }

    const { editor, width, height } = editorOn(store);
    const ctx = recordingContext();
    editor.drawTile3DOverlay(ctx, width, height, 5);

    const apexes = arrowApexes(ctx.ops);
    assert.equal(apexes.length, 1);
    assert.equal(apexes[0].x, 2.5 * TILE, 'still horizontally centred');
    // Raised clear of the bar, and kept inside the object's own row.
    assert.ok(apexes[0].y < 1.5 * TILE - 9, 'raised above the middle');
    assert.ok(apexes[0].y > 1 * TILE, 'and not pushed out of the object');

    // Two horizontal bars stacked in one cell is a muddle, so the class drops
    // its own ground line and the flat bar serves as the line.
    const bars = ctx.ops.filter(o => o.op === 'fillRect' && o.h <= 5);
    assert.equal(bars.length, 1, 'only the flat cell\'s bar');
});

test('an unattached tile is still marked in its own cell', () => {
    let store = classes.create();
    store = classes.setClass(store, 1, 9, classes.UPRIGHT);   // cell (1,1) on an 8-wide sheet

    const { editor, width, height } = editorOn(store);
    const ctx = recordingContext();
    editor.drawTile3DOverlay(ctx, width, height, 5);

    const apexes = arrowApexes(ctx.ops);
    assert.equal(apexes.length, 1);
    assert.equal(apexes[0].x, 1.5 * TILE, 'the middle of its own cell');
});

test('selecting an object draws one box round it, not two', () => {
    // A declared object outlines itself, and the selection traced the same
    // rectangle: two rings a pixel apart. The per-cell selection highlight was
    // drawn on top of both, so a click looked like it had picked one square
    // out of the object.
    let store = classes.create();
    store = classes.defineObject(store, 1, 9, 2, 2);

    const { editor, width, height } = editorOn(store);
    editor._selected3dObject = classes.objectAt(store, 1, 9).object;
    editor.selected3dRect = { x: 1, y: 1, w: 2, h: 2, imageIndex: 5 };

    const ctx = recordingContext();
    editor.drawTile3DOverlay(ctx, width, height, 5);

    // The object's own outline is a stroked path; while selected it is not
    // drawn at all, so no path segments are laid down for it.
    assert.equal(ctx.ops.filter(o => o.op === 'moveTo').length, 0,
        'the object outline gives way to the selection ring');

    const rings = selectionRings(ctx.ops);
    assert.equal(rings.length, 1, 'exactly one box');
    assert.equal(rings[0].w, 2 * TILE - 3);

    // And the single-cell highlight the other edit modes draw is suppressed.
    const cellCtx = recordingContext();
    editor.selectedTile = { x: 0, y: 0 };
    editor.drawSelectionHighlight(cellCtx, 0, 0, true);
    assert.deepEqual(cellCtx.ops, [], 'no per-cell box in 3D mode');
});

test('an unselected object keeps its own outline', () => {
    let store = classes.create();
    store = classes.defineObject(store, 1, 9, 2, 2);

    const { editor, width, height } = editorOn(store);
    editor._selected3dObject = null;

    const ctx = recordingContext();
    editor.drawTile3DOverlay(ctx, width, height, 5);
    assert.ok(ctx.ops.some(o => o.op === 'moveTo'), 'the outline is drawn');
});

test('a selection belongs to the sheet it was made on', () => {
    // Every sheet draws this overlay. A rectangle carrying no sheet was drawn
    // at the same coordinates on all of them.
    const { editor, width, height } = editorOn(classes.create());
    editor.selected3dRect = { x: 0, y: 0, w: 1, h: 1, imageIndex: 5 };

    const onIts = recordingContext();
    editor.drawTile3DOverlay(onIts, width, height, 5);
    assert.equal(selectionRings(onIts.ops).length, 1);

    const onAnother = recordingContext();
    editor.drawTile3DOverlay(onAnother, width, height, 6);
    assert.equal(selectionRings(onAnother.ops).length, 0);
});

test('the preview finds a layer\'s art where the tab cached it', () => {
    // Everything that writes the cache names the file the way it loaded it,
    // with its extension. The preview looked it up by the bare name held in
    // tilesetNames, missed on every layer, and drew an empty box where the
    // tile's art should be — which is what "nothing in the 3D preview" was.
    const { editor } = editorOn(classes.create());
    editor.currentTileset = { id: 1, flags: [], tilesetNames: ['', '', 'Outside_A3'] };
    editor.imageCache = new Map();

    const cached = { width: 384, height: 192 };
    editor.imageCache.set(editor.baseCacheKey(2, 'Outside_A3.png'), cached);

    assert.equal(editor.baseCacheKey(2), '2_Outside_A3.png',
        'the bare name resolves to the key the loader used');
    assert.equal(editor.cachedBaseCanvas(2), cached);

    // And an unassigned layer has no key rather than a key for nothing.
    assert.equal(editor.baseCacheKey(0), null);
    assert.equal(editor.cachedBaseCanvas(0), null);
});

test('a tile set to Flat previews lying down', () => {
    // The preview gave every undeclared tile a standing role, so it showed the
    // same picture whichever class was chosen — and the one decision it exists
    // to show could not be checked in it.
    let store = classes.create();
    store = classes.setClass(store, 1, 9, classes.GROUND);
    store = classes.setClass(store, 1, 10, classes.UPRIGHT);

    const { editor } = editorOn(store);
    const roleFor = tile => {
        const value = classes.classOf(store, 1, tile);
        return value === classes.GROUND ? classes.FLAT : classes.STAND;
    };
    assert.equal(roleFor(9), classes.FLAT, 'Flat lies down');
    assert.equal(roleFor(10), classes.STAND, 'Upright stands');

    // The same expression the preview builds its solo object from.
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    assert.match(source,
        /const soloRole = value === classes\.GROUND \? classes\.FLAT : classes\.STAND;/);
    assert.match(source, /roles: soloRole/);
});

test('a tool that cannot apply says so on screen', () => {
    // These refusals went to the console, so declaring an object on an
    // autotile looked exactly like the button being broken.
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    const apply = source.slice(source.indexOf('    applyTile3DTool(drag, imageIndex, tilesX) {'));
    const body = apply.slice(0, apply.indexOf('\n    /**'));
    assert.doesNotMatch(body, /console\.log\('3D objects are declared/);
    assert.match(body, /this\.noteTile3DRefusal\(/);
    assert.match(source, /id="tile3d-tool-notice"/, 'and there is somewhere to say it');
});

test('leaving 3D mode forgets what was selected in it', () => {
    const { editor } = editorOn(classes.create());
    editor.selected3dRect = { x: 0, y: 0, w: 2, h: 2, imageIndex: 5 };
    editor._selected3dObject = { tile: 0, w: 2, h: 2 };
    editor._tile3dCorner = 4;

    editor.clearTile3DSelection();

    assert.equal(editor.selected3dRect, null);
    assert.equal(editor._selected3dObject, null);
    assert.equal(editor._tile3dCorner, null, 'a half-finished declaration goes too');
});

test('a roof pairing is visible on both tiles that make it', () => {
    // The Roof tool records which tile caps a wall, and nothing drew it: the
    // author could set a pairing and had no way to see it, or to find it again
    // later.
    let store = classes.create();
    store = classes.setClass(store, 1, 9, classes.SCENERY);      // a wall
    store = classes.setTopFace(store, 1, 9, 10);                 // capped by 10

    const { editor, width, height } = editorOn(store);
    const ctx = recordingContext();
    editor.drawTile3DOverlay(ctx, width, height, 5);

    // Two roof marks: one on the wall that was given a roof, one on the tile
    // serving as that roof. Both sit in the corner, clear of the class glyph
    // in the middle, because they say different things about the tile.
    const marks = arrowApexes(ctx.ops).filter(a => a.x > 1.5 * TILE);
    assert.equal(marks.length, 2, `expected a mark on each tile, got ${marks.length}`);

    // The wall's is on cell (1,1), the roof's on (2,1).
    const columns = marks.map(m => Math.floor(m.x / TILE)).sort();
    assert.deepEqual(columns, [1, 2]);
});

test('an unclassified wall still shows the roof it was given', () => {
    // The pairing is worth seeing before the class is set — otherwise setting
    // a roof first and a class second looks like the roof did not take.
    let store = classes.create();
    store = classes.setTopFace(store, 1, 9, 10);

    const { editor, width, height } = editorOn(store);
    const ctx = recordingContext();
    editor.drawTile3DOverlay(ctx, width, height, 5);
    assert.ok(arrowApexes(ctx.ops).length >= 1, 'the mark is drawn anyway');
});

test('the key explains both halves of a pairing', () => {
    // A marking nobody can look up is a marking nobody can use.
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    assert.match(source, /\['3d-roof-wall', tt\('Wall capped with a roof \(Roof tool\)'\)\]/);
    assert.match(source, /\['3d-roof-top', tt\('The roof another wall is capped with'\)\]/);
    // And each key row needs a swatch, or it draws an empty box.
    assert.match(source, /case '3d-roof-wall':/);
    assert.match(source, /case '3d-roof-top':/);
});

//-----------------------------------------------------------------------------
// The drag gesture

test('a drag is held inside the sheet it started on', () => {
    // A drag that ran off the bottom edge kept counting rows, and the rectangle
    // it declared reached down into tiles that were not on screen — an object
    // quietly claimed art the author could not see until they scrolled to it.
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    const at = source.indexOf('attachTile3DDrag(canvas, imageIndex, isSplitSheet) {');
    const body = source.slice(at, source.indexOf('\n    }', at));
    assert.match(body, /const clamp = \(value, last\) => Math\.max\(0, Math\.min\(last, value\)\);/);
    assert.match(body, /clamp\(Math\.floor\(\(\(event\.clientX/);
    assert.match(body, /clamp\(Math\.floor\(\(\(event\.clientY/);
});

test('shift joins on to the object that is selected, not only one just declared', () => {
    // A tower crossing the sheet seam shows as two pieces on different palette
    // rows. Selecting the object and shift-dragging the other half started a
    // new object instead of extending it, which is the entire gesture.
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    const at = source.indexOf('applyTile3DTool(drag, imageIndex, tilesX)');
    const body = source.slice(at, source.indexOf('\n    /** Paint one 3D class', at));
    assert.match(body, /const joinTo = drag\.extend/);
    assert.match(body, /this\._selected3dObject && this\._selected3dObject\.tile/);
    assert.match(body, /this\._lastDeclaredObject \|\| null/);
    // Read before the drag reselects, or it would join the piece to itself.
    assert.ok(body.indexOf('const joinTo') < body.indexOf('this._selected3dObject = member'));
    // And a single shift-click onto an existing object is no longer refused.
    assert.match(body, /if \(!joinTo && width === 1 && height === 1/);
});
