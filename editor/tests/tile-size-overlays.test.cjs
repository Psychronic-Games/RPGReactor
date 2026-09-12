/**
 * The tileset editor's overlay marks, at every tile size a project can choose.
 *
 * The passage arrows, the flag icons and the 3D class marks are drawn at fixed
 * sizes measured for a 48-pixel cell. That holds at 32 — they are deliberately
 * not shrunk there, because a mark nobody can read is worse than a large one —
 * and breaks below it: a margin of 8 puts the left and right arrows of a
 * 16-pixel tile on the same point, and a width of `tileSize - 26` comes out
 * negative, which `fillRect` draws *backwards* into the neighbouring tile
 * rather than clipping away.
 *
 * Nothing here should move at 48 or 32; that is the point of the cap in
 * `markScale`, and the first test is what holds it.
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

const DatabaseTilesetEditor = loadEditorClass();

/** A 2D context that records where every mark was put. */
function recordingContext() {
    const ops = [];
    const ctx = {
        ops,
        canvas: { width: 0, height: 0 },
        save() {}, restore() {}, beginPath() {}, closePath() {}, setLineDash() {},
        stroke() {}, fill() {},
        moveTo(x, y) { ops.push({ op: 'point', x, y }); },
        lineTo(x, y) { ops.push({ op: 'point', x, y }); },
        arc(x, y, r) { ops.push({ op: 'rect', x: x - r, y: y - r, w: r * 2, h: r * 2 }); },
        fillRect(x, y, w, h) { ops.push({ op: 'rect', x, y, w, h }); },
        strokeRect(x, y, w, h) { ops.push({ op: 'rect', x, y, w, h }); },
        fillText(text, x, y) { ops.push({ op: 'point', x, y }); },
        strokeText(text, x, y) { ops.push({ op: 'point', x, y }); },
        measureText: () => ({ width: 0 }),
        fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: ''
    };
    return ctx;
}

/** An editor on one sheet of `cols` x `rows` tiles, at the given tile size. */
function editorAt(tileSize, { store = null, flags = [], mode = 'tile3d', cols = 4, rows = 4 } = {}) {
    const editor = Object.create(DatabaseTilesetEditor.prototype);
    editor.tileSize = tileSize;
    editor.currentTileset = { id: 1, flags };
    editor.currentEditMode = mode;
    editor._tileset3d = store;
    editor.tileset3DClasses = () => classes;
    editor.tileset3DStore = () => store;
    editor.getTileIndexForImage = (imageIndex, x, y, tilesX) => y * tilesX + x;
    return { editor, width: cols * tileSize, height: rows * tileSize };
}

const SIZES = [64, 48, 32, 24, 16, 8];

/** Every mark, normalised so a negative width reads as the box it really covers. */
function marks(ops) {
    return ops.map(o => (o.op === 'point'
        ? { x: o.x, y: o.y, w: 0, h: 0, negative: false }
        : {
            x: Math.min(o.x, o.x + o.w),
            y: Math.min(o.y, o.y + o.h),
            w: Math.abs(o.w),
            h: Math.abs(o.h),
            negative: o.w < 0 || o.h < 0
        }));
}

test('the marks are untouched at 48 and 32', () => {
    // The cap exists so the installed base sees no change at all, and so a
    // 32-pixel project keeps marks at full size rather than shrinking them to
    // three quarters of something already small.
    const editor = Object.create(DatabaseTilesetEditor.prototype);
    for (const size of [48, 32]) {
        editor.tileSize = size;
        assert.equal(editor.markScale(), 1, `${size}px keeps the measured sizes`);
    }
    editor.tileSize = 24;
    assert.equal(editor.markScale(), 0.75);
    editor.tileSize = 16;
    assert.equal(editor.markScale(), 0.5);
});

test('no 3D class mark is drawn backwards or outside its sheet', () => {
    for (const value of [classes.PANEL, classes.UPRIGHT, classes.SCENERY,
        classes.FOLIAGE, classes.FLAT]) {
        for (const size of SIZES) {
            let store = classes.create();
            store = classes.setClass(store, 1, 5, value);
            const { editor, width, height } = editorAt(size, { store });
            const ctx = recordingContext();
            editor.drawTile3DOverlay(ctx, width, height, 5);

            for (const m of marks(ctx.ops)) {
                assert.ok(!m.negative,
                    `class ${value} at ${size}px: a mark ${m.w}x${m.h} is drawn backwards`);
                assert.ok(m.x >= 0 && m.y >= 0 && m.x + m.w <= width && m.y + m.h <= height,
                    `class ${value} at ${size}px: a mark reaches ` +
                    `(${m.x + m.w}, ${m.y + m.h}) on a ${width}x${height} sheet`);
            }
        }
    }
});

test('a class mark stays inside the tile it describes', () => {
    // Tile 5 is cell (1, 1) on a four-wide sheet. A mark that leaves that cell
    // is claiming a tile the author did not classify.
    for (const value of [classes.PANEL, classes.UPRIGHT, classes.SCENERY,
        classes.FOLIAGE]) {
        for (const size of SIZES) {
            let store = classes.create();
            store = classes.setClass(store, 1, 5, value);
            const { editor, width, height } = editorAt(size, { store });
            const ctx = recordingContext();
            editor.drawTile3DOverlay(ctx, width, height, 5);

            for (const m of marks(ctx.ops)) {
                assert.ok(m.x >= size && m.y >= size
                    && m.x + m.w <= 2 * size && m.y + m.h <= 2 * size,
                    `class ${value} at ${size}px: a mark spans ` +
                    `(${m.x}, ${m.y})-(${m.x + m.w}, ${m.y + m.h}), ` +
                    `outside the cell (${size}, ${size})-(${2 * size}, ${2 * size})`);
            }
        }
    }
});

/**
 * How far the worst mark reaches past the tile it sits in, as a fraction of
 * that tile.
 *
 * A fraction rather than pixels because a mark or two already overhangs
 * slightly at 48 — the bush silhouette sits a pixel and a half proud of its
 * corner, and has since it was drawn. What must not happen is a smaller tile
 * overhanging *more of itself* than 48 does, which is the difference between a
 * corner icon that touches its edge and one that lands in the next tile.
 */
function worstOverhang(ops, size) {
    let worst = 0;
    for (const m of marks(ops)) {
        const cx = Math.floor(m.x / size);
        const cy = Math.floor(m.y / size);
        worst = Math.max(worst,
            m.x + m.w - (cx + 1) * size,
            m.y + m.h - (cy + 1) * size,
            cx * size - m.x,
            cy * size - m.y);
    }
    return Math.max(0, worst) / size;
}

test('the four passage markers stay apart at every size', () => {
    // A fixed margin of 8 put the left and right markers of a 16-pixel tile on
    // the same point, so a tile blocked one way looked exactly like a tile
    // blocked the other and all four collapsed into one blob.
    const overhangs = {};
    const spans = {};
    for (const size of SIZES) {
        // Passable every way but down, so all four directions draw and none of
        // them is replaced by the single O or X glyph.
        const { editor, width, height } = editorAt(size, {
            mode: 'passage', flags: new Array(16).fill(0x01)
        });
        const ctx = recordingContext();
        editor.drawCompactPassageOverlay(ctx, width, height, 5, false);

        const drawn = marks(ctx.ops);
        assert.ok(drawn.length > 0, `${size}px: nothing drawn`);
        for (const m of drawn) {
            assert.ok(!m.negative, `${size}px: a passage marker ${m.w}x${m.h} is drawn backwards`);
        }
        overhangs[size] = worstOverhang(ctx.ops, size);

        // The horizontal extremes within one tile are its left and right
        // markers. They have to sit either side of the middle, or the tile
        // says the same thing whichever way it is blocked.
        const inFirst = drawn.filter(m => m.x < size && m.y < size);
        const left = Math.min(...inFirst.map(m => m.x));
        const right = Math.max(...inFirst.map(m => m.x + m.w));
        assert.ok(left < size / 2 && right > size / 2,
            `${size}px: the markers span ${left}-${right} and do not straddle the middle`);
        spans[size] = (right - left) / size;
    }
    // A fixed margin puts the markers proportionally closer together as the
    // tile shrinks; 32 is as close as that is allowed to get, and scaling is
    // what holds 24 and 16 to the same spread rather than letting them close
    // to nothing. At 16 an unscaled margin of 8 met in the middle exactly.
    for (const size of [24, 16]) {
        assert.equal(spans[size], spans[32],
            `${size}px markers cover ${(spans[size] * 100).toFixed(1)}% of a tile, ` +
            `against ${(spans[32] * 100).toFixed(1)}% at 32`);
    }
    // 32 is the baseline rather than 48: marks are deliberately not shrunk
    // down to it, so a fixed icon already covers proportionally more of a
    // 32-pixel cell than of a 48-pixel one. Scaling below that holds the
    // proportion exactly where 32 leaves it.
    for (const size of [24, 16]) {
        assert.ok(overhangs[size] <= overhangs[32] + 1e-9,
            `${size}px passage markers overhang ${(overhangs[size] * 100).toFixed(1)}% ` +
            `of a tile, against ${(overhangs[32] * 100).toFixed(1)}% at 32`);
    }
});

test('no flag icon spills further into its neighbour than it does at 32', () => {
    // Ladder, counter, bush, damage and terrain tag are drawn in the corners at
    // fixed offsets. A ladder 16 pixels tall starting 4 down ran 4 pixels into
    // the tile beneath it on a 16-pixel sheet — a quarter of a tile, against
    // the few percent the bush already costs at 32.
    const everyFlag = 0x20 | 0x40 | 0x80 | 0x100 | (7 << 12);
    const overhangs = {};
    for (const size of SIZES) {
        const { editor, width, height } = editorAt(size, {
            mode: 'passage', flags: new Array(16).fill(everyFlag)
        });
        const ctx = recordingContext();
        editor.drawCompactPassageOverlay(ctx, width, height, 5, false);

        for (const m of marks(ctx.ops)) {
            assert.ok(!m.negative, `${size}px: a flag icon ${m.w}x${m.h} is drawn backwards`);
        }
        overhangs[size] = worstOverhang(ctx.ops, size);
    }
    for (const size of [24, 16]) {
        assert.ok(overhangs[size] <= overhangs[32] + 1e-9,
            `${size}px flag icons overhang ${(overhangs[size] * 100).toFixed(1)}% of a tile, ` +
            `against ${(overhangs[32] * 100).toFixed(1)}% at 32`);
    }
});

test('above-character stars use a valid font contained in every supported tile size', () => {
    for (const size of SIZES) {
        const { editor, width, height } = editorAt(size, { mode:'passage', flags:[0x10], cols:1, rows:1 });
        const ctx = recordingContext();
        const fonts = [];
        editor.drawFlagGlyph = (context, glyph) => { if (glyph === '★') fonts.push(context.font); };
        editor.drawCompactPassageOverlay(ctx, width, height, 5, false);
        assert.ok(fonts.length);
        for (const font of fonts) {
            const height = Number(font.match(/(-?[\d.]+)px/)[1]);
            assert.ok(height > 0 && height <= size, `${size}px tile: ${font}`);
        }
    }
});
