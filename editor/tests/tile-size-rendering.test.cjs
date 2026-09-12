const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const metrics = require(path.join(editorRoot, 'src', 'utils', 'TileMetrics.js'));

/**
 * The sweep in `tile-size.test.cjs` proves no surface still *writes* a bare 48.
 * It cannot prove the arithmetic that replaced it is right, because a wrong
 * formula built out of `TILE_WIDTH` passes a source sweep and still samples the
 * wrong art. This drives the real renderer at every size RPG Maker offers and
 * checks where it actually reads from.
 *
 * The load-bearing assertion is the last one in each case: the rectangle read
 * at 32, 24 or 16 is the rectangle read at 48 scaled by the same ratio the
 * sheets themselves are scaled by. So a smaller project reads the *same cells*
 * of the *same layout* — which is the whole claim tile-size support makes.
 */

/** Run TilemapManager's source in a sandbox and hand back the class. */
function loadTilemapManager() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');
    const sandbox = {
        console,
        RRTileMetrics: metrics,
        // Only the shapes the render paths touch. A Texture records the frame
        // it was cut from, which is the thing under test.
        PIXI: {
            TextureStyle: { defaultOptions: {} },
            Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } },
            Texture: class { constructor(opts) { Object.assign(this, opts); } },
            Sprite: class { constructor(texture) { this.texture = texture; } },
            Container: class { constructor() { this.children = []; } addChild(c) { this.children.push(c); } },
        },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    // A top-level `class` binds in the script's lexical scope rather than on
    // the global object, so it is taken as the script's completion value.
    return new vm.Script(`${source}\n;TilemapManager;`).runInContext(sandbox);
}

const TilemapManager = loadTilemapManager();

/** A manager wired to a project of the given tile size, with every sheet present. */
function managerAt(tileSize) {
    const manager = new TilemapManager(null, '/project', {
        getSystem: () => ({ tileSize }),
    });
    manager.textureCache = {};
    manager.tileSprites = {};
    manager._layerNameMap = new Map();
    // Eleven sheets: A1-A5 then B-G. The source is only ever read for its
    // `source` handle, so one stub each is enough.
    manager.tilesetTextures = {};
    for (let i = 0; i <= 10; i++) manager.tilesetTextures[i] = { source: `sheet${i}` };
    return manager;
}

/** Every rectangle the renderer cut for one tile, in draw order. */
function framesFor(manager, tileId, x = 0, y = 0) {
    const layer = { children: [], addChild(c) { this.children.push(c); } };
    if (manager.isAutotile(tileId)) manager.renderAutotile(tileId, x, y, layer);
    else manager.renderNormalTile(tileId, x, y, layer);
    return layer.children.map(sprite => ({
        sx: sprite.texture.frame.x,
        sy: sprite.texture.frame.y,
        sw: sprite.texture.frame.width,
        sh: sprite.texture.frame.height,
        dx: sprite.x,
        dy: sprite.y,
        dw: sprite.width,
        dh: sprite.height,
    }));
}

/**
 * A spread of ids covering every sampling path: each A1 kind (water,
 * waterfall, rocks and the derived block layout), A2, A3, A4's roof and wall
 * rows, A5, and all six B-G sheets across both halves of each.
 */
function sampleTileIds() {
    const ids = [];
    for (let kind = 0; kind < 16; kind++) {
        for (const shape of [0, 1, 15, 26, 46, 47]) ids.push(2048 + kind * 48 + shape);
    }
    for (let kind = 16; kind < 48; kind += 4) {
        for (const shape of [0, 15, 46]) ids.push(2048 + kind * 48 + shape);
    }
    for (let kind = 48; kind < 80; kind += 4) {
        for (const shape of [0, 5, 15]) ids.push(2048 + kind * 48 + shape);
    }
    for (let kind = 80; kind < 128; kind += 3) {
        for (const shape of [0, 5, 15, 46]) ids.push(2048 + kind * 48 + shape);
    }
    // A5 spans ids 1536-1791 but its sheet is 384x768 — eight columns by
    // sixteen rows, so 128 tiles. The palette renders exactly that grid, so
    // nothing above 1663 can be painted onto a map at any tile size.
    for (let local = 0; local < 128; local += 3) ids.push(1536 + local);   // A5
    for (let id = 1; id < 1536; id += 11) ids.push(id);                    // B-G
    return ids;
}

const SIZES = [64, 48, 32, 24, 16, 8];
const TILE_IDS = sampleTileIds();

test('every size RPG Maker offers is carried into the renderer', () => {
    for (const size of SIZES) {
        const manager = managerAt(size);
        assert.equal(manager.TILE_SIZE, size, `${size}px project`);
        assert.equal(manager.TILE_WIDTH, size);
        assert.equal(manager.TILE_HEIGHT, size);
    }
    // An unrecognised value is a damaged file, not a new project shape.
    assert.equal(managerAt(12).TILE_SIZE, 48);
    assert.equal(managerAt(undefined).TILE_SIZE, 48);
});

test('a tile is cut on a tile boundary and fills its cell, at every size', () => {
    for (const size of SIZES) {
        const manager = managerAt(size);
        const half = size / 2;
        assert.ok(Number.isInteger(half), `${size} splits into whole half-tiles`);

        for (const tileId of TILE_IDS) {
            const frames = framesFor(manager, tileId, 3, 5);
            if (!frames.length) continue;                 // an id this set does not draw

            for (const f of frames) {
                // A frame is either a whole tile or one of the four quarters an
                // autotile is assembled from. Anything else is a misread.
                const whole = f.sw === size && f.sh === size;
                const quarter = f.sw === half && f.sh === half;
                assert.ok(whole || quarter,
                    `${size}px tile ${tileId}: frame is ${f.sw}x${f.sh}`);

                // Cut on the grid it belongs to. A fractional or off-grid
                // origin is exactly the drift that made a 32px project draw a
                // mosaic of the wrong art.
                const step = whole ? size : half;
                assert.ok(Number.isInteger(f.sx / step) && Number.isInteger(f.sy / step),
                    `${size}px tile ${tileId}: read at (${f.sx}, ${f.sy}), off the ${step}px grid`);
                assert.ok(f.sx >= 0 && f.sy >= 0,
                    `${size}px tile ${tileId}: read before the start of the sheet`);

                // Drawn at its own size, so a sprite cannot overflow its tile.
                assert.equal(f.dw, f.sw, `${size}px tile ${tileId}: drawn wider than it was cut`);
                assert.equal(f.dh, f.sh, `${size}px tile ${tileId}: drawn taller than it was cut`);
            }

            // The pieces tile the cell exactly: no gap, no overlap, no drift.
            const area = frames.reduce((sum, f) => sum + f.dw * f.dh, 0);
            assert.equal(area, size * size,
                `${size}px tile ${tileId}: covers ${area} of ${size * size} pixels`);
            const left = Math.min(...frames.map(f => f.dx));
            const top = Math.min(...frames.map(f => f.dy));
            assert.equal(left, 3 * size, `${size}px tile ${tileId}: left edge`);
            assert.equal(top, 5 * size, `${size}px tile ${tileId}: top edge`);
        }
    }
});

test('a smaller project reads the same cells of the same layout, only smaller', () => {
    // The claim tile-size support makes, stated as an equation. A 32px sheet is
    // two thirds of MZ's standard layout, so every rectangle read from it must
    // be two thirds of the one a 48px project reads for the same tile. Any
    // formula that scales one term and not another fails here while passing a
    // source sweep for hardcoded 48s.
    const reference = managerAt(48);
    const baseline = new Map(TILE_IDS.map(id => [id, framesFor(reference, id, 3, 5)]));

    for (const size of SIZES.filter(s => s !== 48)) {
        const scale = metrics.sheetScaleOf({ tileSize: size });
        const manager = managerAt(size);

        for (const tileId of TILE_IDS) {
            const expected = baseline.get(tileId);
            const actual = framesFor(manager, tileId, 3, 5);
            assert.equal(actual.length, expected.length,
                `${size}px tile ${tileId}: drew ${actual.length} pieces, 48px drew ${expected.length}`);

            actual.forEach((f, i) => {
                const e = expected[i];
                for (const key of ['sx', 'sy', 'sw', 'sh', 'dx', 'dy', 'dw', 'dh']) {
                    assert.equal(f[key], e[key] * scale,
                        `${size}px tile ${tileId} piece ${i}: ${key} is ${f[key]}, ` +
                        `expected ${e[key] * scale} (48px read ${e[key]})`);
                }
            });
        }
    }
});

test('nothing is read from beyond the edge of a sheet', () => {
    // Sheet dimensions in tiles, from RPG Maker's own layouts: a 48px A2 is
    // 768x576, which is 16x12 tiles, and every smaller size keeps the grid and
    // shrinks the cell. A read past these is art from the row below, or from
    // nothing at all.
    const sheetTiles = {
        0: [16, 12], 1: [16, 12], 2: [16, 8], 3: [16, 15], 4: [8, 16],
        5: [16, 16], 6: [16, 16], 7: [16, 16], 8: [16, 16], 9: [16, 16], 10: [16, 16],
    };

    for (const size of SIZES) {
        const manager = managerAt(size);
        for (const tileId of TILE_IDS) {
            // Which sheet this id draws from, taken from the manager itself.
            const layer = { children: [], addChild(c) { this.children.push(c); } };
            const cut = [];
            const originalTexture = manager.tilesetTextures;
            manager.tilesetTextures = new Proxy(originalTexture, {
                get(target, prop) {
                    if (typeof prop === 'string' && /^\d+$/.test(prop)) cut.push(Number(prop));
                    return target[prop];
                },
            });
            if (manager.isAutotile(tileId)) manager.renderAutotile(tileId, 0, 0, layer);
            else manager.renderNormalTile(tileId, 0, 0, layer);
            manager.tilesetTextures = originalTexture;
            if (!layer.children.length) continue;

            const setNumber = cut[0];
            const [cols, rows] = sheetTiles[setNumber];
            const sheetWidth = cols * size;
            const sheetHeight = rows * size;

            for (const sprite of layer.children) {
                const f = sprite.texture.frame;
                assert.ok(f.x + f.width <= sheetWidth,
                    `${size}px tile ${tileId}: reads to x=${f.x + f.width} on a ${sheetWidth}px sheet ${setNumber}`);
                assert.ok(f.y + f.height <= sheetHeight,
                    `${size}px tile ${tileId}: reads to y=${f.y + f.height} on a ${sheetHeight}px sheet ${setNumber}`);
            }
        }
    }
});

test('the A1 animation frames stay on the grid at every size', () => {
    // Water steps two tiles across per frame and a waterfall one row down, so
    // the animation is the one place a sampling error moves over time rather
    // than sitting still — it reads as the water tearing rather than as the
    // wrong tile.
    for (const size of SIZES) {
        const manager = managerAt(size);
        const half = size / 2;
        for (let frame = 0; frame < 3; frame++) {
            manager.waterAnimationFrame = frame;
            manager.waterfallAnimationFrame = frame;
            for (let kind = 0; kind < 16; kind++) {
                for (const shape of [0, 15, 46]) {
                    for (const f of framesFor(manager, 2048 + kind * 48 + shape)) {
                        assert.ok(Number.isInteger(f.sx / half) && Number.isInteger(f.sy / half),
                            `${size}px A1 kind ${kind} frame ${frame}: read at (${f.sx}, ${f.sy})`);
                        assert.ok(f.sx >= 0 && f.sy >= 0 && f.sx < 16 * size && f.sy < 12 * size,
                            `${size}px A1 kind ${kind} frame ${frame}: read outside the sheet`);
                    }
                }
            }
        }
    }
});
