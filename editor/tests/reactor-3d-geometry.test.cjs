const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const Geometry = Reactor3D.Geometry;

const PLANES = 6;

/** A map whose four tile planes are filled from `layers`. */
function mapWith(width, height, layers) {
    const plane = width * height;
    const data = new Array(plane * PLANES).fill(0);
    for (const [z, cells] of Object.entries(layers)) {
        cells.forEach((tileId, index) => { data[Number(z) * plane + index] = tileId; });
    }
    return { width, height, data };
}

const flat = () => 0;

/** The y of each vertex, quad by quad. */
const quadsOf = group => {
    const quads = [];
    for (let q = 0; q < group.positions.length / 3; q += 4) {
        quads.push([0, 1, 2, 3].map(i => group.positions[(q + i) * 3 + 1]));
    }
    return quads;
};
const isFlat = ys => Math.min(...ys) === Math.max(...ys);

test('sheet addressing matches the 2D renderer exactly', () => {
    // A tile showing one image in 2D and another in 3D is miserable to chase
    // visually, so the arithmetic is pinned against the 2D expression itself.
    const twoD = tileId => {
        const local = tileId % 256;
        return {
            setNumber: 5 + Math.floor(tileId / 256),
            sx: ((Math.floor(local / 128) % 2) * 8 + (local % 8)) * 48,
            sy: (Math.floor((local % 256) / 8) % 16) * 48
        };
    };
    for (const tileId of [1, 127, 128, 255, 256, 800, 1023, 1024, 1029, 1280, 1535]) {
        const rect = Geometry.sheetRectFor(tileId);
        const expected = twoD(tileId);
        assert.equal(rect.setNumber, expected.setNumber, `sheet for ${tileId}`);
        assert.equal(rect.sx, expected.sx, `sx for ${tileId}`);
        assert.equal(rect.sy, expected.sy, `sy for ${tileId}`);
    }
});

test('the F and G sheets resolve here too', () => {
    // They were added to the 2D renderer; the 3D one must not have to be
    // taught about each new sheet separately.
    assert.equal(Geometry.sheetRectFor(1024).setNumber, 9);
    assert.equal(Geometry.sheetRectFor(1279).setNumber, 9);
    assert.equal(Geometry.sheetRectFor(1280).setNumber, 10);
    assert.equal(Geometry.sheetRectFor(1535).setNumber, 10);
});

test('A5 uses its own eight-wide grid, and autotiles report their kind', () => {
    const a5 = Geometry.sheetRectFor(1536 + 9);
    assert.equal(a5.setNumber, 4);
    assert.equal(a5.sx, 48, 'column 1');
    assert.equal(a5.sy, 48, 'row 1');
    assert.ok(!a5.autotile);

    for (const [tileId, setNumber] of [[2048, 0], [2816, 1], [4352, 2], [5888, 3]]) {
        const rect = Geometry.sheetRectFor(tileId);
        assert.equal(rect.setNumber, setNumber);
        assert.equal(rect.autotile, true);
        assert.equal(rect.kind, Math.floor((tileId - 2048) / 48));
    }
});

test('empty and out-of-range ids address nothing', () => {
    for (const tileId of [0, -1, 8192, 99999, NaN, undefined]) {
        assert.equal(Geometry.sheetRectFor(tileId), null, `${tileId} is not a tile`);
    }
});

test('the topmost plane wins, as it does on screen', () => {
    const map = mapWith(1, 1, { 0: [1], 1: [300], 3: [800] });
    assert.equal(Geometry.topTileAt(map, 0, 0), 800);

    const lower = mapWith(1, 1, { 0: [1], 1: [300] });
    assert.equal(Geometry.topTileAt(lower, 0, 0), 300);

    assert.equal(Geometry.topTileAt(mapWith(1, 1, {}), 0, 0), 0, 'an empty stack');
    assert.equal(Geometry.topTileAt(map, 5, 5), 0, 'out of range');
});

test('an empty cell contributes no geometry', () => {
    const built = Geometry.build(mapWith(2, 2, {}), { elevationAt: flat });
    assert.deepEqual(built.groups, []);
    assert.equal(built.quads, 0);
});

test('a flat map emits ground and no walls at all', () => {
    // Every neighbour is level, and the rim is at elevation 0 like the outside,
    // so nothing should be extruded.
    const built = Geometry.build(mapWith(3, 3, { 0: new Array(9).fill(1) }), { elevationAt: flat });
    assert.equal(built.quads, 9, 'one ground quad per cell, nothing more');
    assert.equal(built.groups.length, 1);
    assert.equal(built.groups[0].positions.length / 3, 9 * 4);
});

test('walls appear only where a neighbour is lower', () => {
    // A single raised cell in the middle of a flat 3x3: four exposed sides.
    const raised = (x, y) => (x === 1 && y === 1 ? 1 : 0);
    const built = Geometry.build(mapWith(3, 3, { 0: new Array(9).fill(1) }), { elevationAt: raised });
    assert.equal(built.quads, 9 + 4, 'nine grounds plus four walls');
});

test('the map rim is closed off rather than left floating', () => {
    // Outside the map counts as elevation 0, so a raised edge cell still gets
    // its outward-facing wall.
    const built = Geometry.build(mapWith(1, 1, { 0: [1] }), { elevationAt: () => 3 });
    assert.equal(built.quads, 1 + 4, 'ground plus all four sides');
});

test('a cell lower than its neighbour does not build their shared wall twice', () => {
    // Only the higher cell owns the face between them.
    const step = (x) => (x === 0 ? 2 : 0);
    const built = Geometry.build(mapWith(2, 1, { 0: [1, 1] }), { elevationAt: step });
    // Tall cell: ground + 3 rim walls + 1 facing its lower neighbour = 5.
    // Short cell: ground only, since every neighbour is level or higher.
    assert.equal(built.quads, 5 + 1);
});

test('geometry is grouped by sheet, which is what keeps the draw calls down', () => {
    const cells = [1, 300, 800, 1029, 1, 300];
    const built = Geometry.build(mapWith(6, 1, { 0: cells }), { elevationAt: flat });
    const sheets = built.groups.map(group => group.setNumber).sort((a, b) => a - b);
    assert.deepEqual(sheets, [5, 6, 8, 9], 'one group per distinct sheet, not per tile');
    const total = built.groups.reduce((sum, group) => sum + group.positions.length / 3, 0);
    assert.equal(total, 6 * 4);
});

test('UVs point at the tile and are flipped into texture space', () => {
    // Image space counts down from the top; texture space counts up. Getting
    // this backwards renders every tile vertically mirrored.
    const built = Geometry.build(mapWith(1, 1, { 0: [1] }), {
        elevationAt: flat,
        sheetSize: () => ({ width: 768, height: 768 })
    });
    const uvs = Array.from(built.groups[0].uvs.slice(0, 8));
    const rect = Geometry.sheetRectFor(1);
    const { u0, u1, v0, v1 } = Geometry.uvRect(rect, { width: 768, height: 768 });
    // Compared with a tolerance rather than exactly: the geometry stores UVs in
    // a Float32Array and these are computed in double precision, so they agree
    // to about 1e-8 and never bit for bit.
    const expected = [u0, v1, u1, v1, u1, v0, u0, v0];
    uvs.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-6,
        `uv ${i}: ${value} vs ${expected[i]}`));
    assert.ok(v1 > v0, 'the top of the tile is the higher V');
});

test('a quad samples inside its own tile, never across the seam', () => {
    // Tiles sit shoulder to shoulder on a shared sheet, so a quad's edge is
    // also its neighbour's. Sampled exactly on that boundary a projected quad
    // takes a thread of whatever is next to it, and the map comes out ruled
    // with a fine grid along every tile boundary. The 2D tilemap blits whole
    // rectangles and never shows it, which is why the same map is clean in 2D
    // and ruled in 3D.
    const size = { width: 768, height: 768 };
    const rect = Geometry.sheetRectFor(1);
    const { u0, u1, v0, v1 } = Geometry.uvRect(rect, size);

    assert.ok(u0 > rect.sx / size.width, 'the left edge is pulled in');
    assert.ok(u1 < (rect.sx + rect.width) / size.width, 'and the right edge');
    assert.ok(v1 < 1 - rect.sy / size.height, 'the top edge is pulled in');
    assert.ok(v0 > 1 - (rect.sy + rect.height) / size.height, 'and the bottom');

    const inset = Geometry.UV_INSET_TEXELS / size.width;
    assert.ok(Math.abs((u0 - rect.sx / size.width) - inset) < 1e-9,
        'by half a texel, which at nearest filtering samples the same texel');

    // A panel's edge strip is three pixels wide. Half a texel each side has to
    // stay a positive rectangle rather than inverting into a mirrored sliver.
    const thin = { sx: 100, sy: 100, width: 1, height: 1 };
    const tight = Geometry.uvRect(thin, size);
    assert.ok(tight.u1 > tight.u0, 'a one-texel strip does not invert');
    assert.ok(tight.v1 > tight.v0);
});

test('ground sits at the cell elevation and walls drop to the neighbour', () => {
    const built = Geometry.build(mapWith(1, 1, { 0: [1] }), { elevationAt: () => 4 });
    const positions = built.groups[0].positions;
    // First quad is the ground: every Y is the cell's own height.
    for (let i = 0; i < 4; i++) assert.equal(positions[i * 3 + 1], 4);
    // Walls span from that height down to the outside, which is 0.
    const wallYs = new Set();
    for (let i = 4; i < positions.length / 3; i++) wallYs.add(positions[i * 3 + 1]);
    assert.deepEqual([...wallYs].sort(), [0, 4]);
});

test('indices widen past the 16-bit vertex limit', () => {
    // A large map passes 65535 vertices, where Uint16 silently wraps and the
    // mesh folds in on itself.
    const small = Geometry.build(mapWith(4, 4, { 0: new Array(16).fill(1) }), { elevationAt: flat });
    assert.equal(small.groups[0].indices.constructor, Uint16Array);

    const wide = 130;
    const big = Geometry.build(mapWith(wide, wide, { 0: new Array(wide * wide).fill(1) }),
        { elevationAt: flat });
    assert.ok(big.groups[0].positions.length / 3 > 65535, 'this map really does exceed it');
    assert.equal(big.groups[0].indices.constructor, Uint32Array);
});

test('a full-size map stays within a handful of draw calls', () => {
    // The spike's actual question: whether a 200x200 map is drawable without
    // instancing. One merged mesh per sheet means draw calls track the number
    // of sheets in use, not the number of tiles.
    const width = 200;
    const height = 200;
    const cells = new Array(width * height);
    const sheets = [1, 300, 800, 1029, 1536, 2048];
    for (let i = 0; i < cells.length; i++) cells[i] = sheets[i % sheets.length];

    const built = Geometry.build(mapWith(width, height, { 0: cells }), {
        elevationAt: (x, y) => Math.floor(2 + 2 * Math.sin(x / 9) + 2 * Math.cos(y / 7))
    });

    assert.ok(built.groups.length <= 11,
        `one group per sheet at most, got ${built.groups.length}`);
    assert.equal(built.groups.length, sheets.length);
    assert.ok(built.quads > width * height, 'walls were emitted, not just ground');
});

//-----------------------------------------------------------------------------
// Autotiles
//
// The 3D quadrant maths was derived from Tilemap._addAutotile, so re-deriving it
// in the test would prove nothing. Instead the shipped 2D function is lifted out
// of reactor_core.js and executed against a recording stub, and the two are
// compared. If the corescript's autotile handling ever changes, this fails.

const fs = require('node:fs');
const coreSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');

function literal(name) {
    const match = coreSource.match(new RegExp(`Tilemap\\.${name} = (\\[[\\s\\S]*?\\n\\];)`));
    assert.ok(match, `${name} is present in reactor_core.js`);
    // eslint-disable-next-line no-eval
    return eval(match[1].replace(/;$/, ''));
}

const TABLES = {
    floor: literal('FLOOR_AUTOTILE_TABLE'),
    wall: literal('WALL_AUTOTILE_TABLE'),
    waterfall: literal('WATERFALL_AUTOTILE_TABLE')
};

/** Run the shipped 2D _addAutotile and record what it would draw. */
function twoDQuadrants(tileId) {
    const signature = 'Tilemap.prototype._addAutotile = function(layer, tileId, dx, dy) {';
    const at = coreSource.indexOf(signature);
    assert.ok(at >= 0, '_addAutotile is present');
    const body = coreSource.slice(at + signature.length, coreSource.indexOf('\n};', at));

    const Tilemap = {
        TILE_ID_A1: 2048, TILE_ID_A2: 2816, TILE_ID_A3: 4352,
        TILE_ID_A4: 5888, TILE_ID_MAX: 8192,
        FLOOR_AUTOTILE_TABLE: TABLES.floor,
        WALL_AUTOTILE_TABLE: TABLES.wall,
        WATERFALL_AUTOTILE_TABLE: TABLES.waterfall,
        getAutotileKind: id => Math.floor((id - 2048) / 48),
        getAutotileShape: id => (id - 2048) % 48,
        isTileA1: id => id >= 2048 && id < 2816,
        isTileA2: id => id >= 2816 && id < 4352,
        isTileA3: id => id >= 4352 && id < 5888,
        isTileA4: id => id >= 5888 && id < 8192
    };
    // eslint-disable-next-line no-new-func
    const fn = new Function('Tilemap', `return function(layer, tileId, dx, dy) {${body}};`)(Tilemap);

    const calls = [];
    fn.call({
        animationFrame: 0,
        tileWidth: 48,
        tileHeight: 48,
        _isTableTile: () => false
    }, { addRect: (...args) => calls.push(args) }, tileId, 0, 0);
    return calls;
}

test('autotile quadrants match what the 2D renderer draws', () => {
    // A2 ground is most of a typical map, A3/A4 are walls and roofs, A1 is
    // water. Sampling several shapes of each covers both tables.
    const samples = [];
    for (const base of [2048, 2816, 4352, 5888]) {
        for (const kind of [0, 1, 5]) {
            for (const shape of [0, 1, 15, 20, 46]) {
                samples.push(base + kind * 48 + shape);
            }
        }
    }

    let compared = 0;
    for (const tileId of samples) {
        const ours = Geometry.autotileQuads(tileId, 48, TABLES);
        // Skip before running the 2D reference: where we fall back, it indexes
        // past the end of its table and throws, which is itself worth knowing —
        // those ids cannot occur in a real map.
        if (!ours) continue;
        const theirs = twoDQuadrants(tileId);
        assert.equal(ours.length, 4, `four quadrants for ${tileId}`);
        for (let i = 0; i < 4; i++) {
            const [setNumber, sx, sy] = theirs[i];
            assert.equal(ours[i].setNumber, setNumber, `sheet, tile ${tileId} quadrant ${i}`);
            assert.equal(ours[i].sx, sx, `sx, tile ${tileId} quadrant ${i}`);
            assert.equal(ours[i].sy, sy, `sy, tile ${tileId} quadrant ${i}`);
        }
        compared++;
    }
    assert.ok(compared >= 40, `only ${compared} tiles were actually compared`);
});

test('quadrants are half-cells laid out west-to-east, north-to-south', () => {
    const quads = Geometry.autotileQuads(2816, 48, TABLES);
    assert.deepEqual(quads.map(q => [q.qx, q.qy]), [[0, 0], [1, 0], [0, 1], [1, 1]]);
    assert.ok(quads.every(q => q.width === 24 && q.height === 24));
});

test('an autotile cell becomes four ground quads, not one', () => {
    // Drawing the whole-tile rect gives a map where every grass tile is the
    // same wrong patch — the giveaway that quadrants were skipped.
    const built = Geometry.build(mapWith(2, 2, { 0: new Array(4).fill(2816) }),
        { elevationAt: flat, tables: TABLES });
    assert.equal(built.quads, 4 * 4);
    assert.equal(built.groups.length, 1, 'still one draw call');
});

test('the quarter-cells tile the whole cell with no gap or overlap', () => {
    const built = Geometry.build(mapWith(1, 1, { 0: [2816] }),
        { elevationAt: flat, tables: TABLES });
    const positions = built.groups[0].positions;
    const xs = new Set();
    const zs = new Set();
    for (let i = 0; i < positions.length / 3; i++) {
        xs.add(positions[i * 3]);
        zs.add(positions[i * 3 + 2]);
    }
    assert.deepEqual([...xs].sort((a, b) => a - b), [0, 0.5, 1]);
    assert.deepEqual([...zs].sort((a, b) => a - b), [0, 0.5, 1]);
});

test('an autotile builds its four quadrants by default', () => {
    // This used to assert the opposite. Without a running game the builder got
    // no shape tables and fell back to one whole-tile quad — the block's
    // bordered corner stamped over every cell — and the test pinned that
    // fallback as if it were the contract. The tables now ship with the module,
    // so the default path draws the real thing.
    const built = Geometry.build(mapWith(1, 1, { 0: [2816] }), { elevationAt: flat });
    assert.equal(built.quads, 4, 'four quarter-cells, not one whole tile');
});

test('the whole-tile fallback survives for a caller with no table', () => {
    // Drawing nothing would leave holes in the ground, so a table that does not
    // cover a shape still yields something visible.
    assert.equal(Geometry.autotileQuads(2816, 48, null), null);
    const built = Geometry.build(mapWith(1, 1, { 0: [2816] }), { elevationAt: flat, tables: {} });
    assert.equal(built.quads, 1, 'one whole-tile quad rather than a hole');
});

test('a shape outside its table falls back rather than indexing past the end', () => {
    // The waterfall table defines four shapes; an odd A1 kind can carry more.
    const waterfallKind = 2048 + 5 * 48;
    assert.equal(Geometry.autotileQuads(waterfallKind + 40, 48, TABLES), null);
    const built = Geometry.build(mapWith(1, 1, { 0: [waterfallKind + 40] }),
        { elevationAt: flat, tables: TABLES });
    assert.equal(built.quads, 1);
});

test('a cliff face under an autotile uses that autotile\'s quadrants', () => {
    // This asserted the opposite. Walls sampled `sheetRectFor`, which for an
    // autotile is the block's whole top-left tile — a corner fragment, often of
    // something else entirely — so raised terrain grew cliffs patched with the
    // wrong artwork.
    const built = Geometry.build(mapWith(1, 1, { 0: [2816] }),
        { elevationAt: () => 2, tables: TABLES });
    // Four quarter-cells of ground, and each of the four rim walls likewise.
    assert.equal(built.quads, 4 + 4 * 4);

    // Through uvRect, because a quad samples half a texel inside its own
    // rectangle rather than exactly on the boundary — see the seam test above.
    const size = { width: 768, height: 768 };
    const quadrants = Geometry.autotileQuads(2816, 48, TABLES)
        .map(q => Geometry.uvRect(q, size).u0);
    // Float32Array storage against double-precision arithmetic, so near rather
    // than equal.
    const near = (value) => quadrants.some(q => Math.abs(q - value) < 1e-6);
    const uvs = built.groups[0].uvs;
    for (let i = 0; i < uvs.length; i += 8) {
        assert.ok(near(uvs[i]) || near(uvs[i + 2]), 'every face samples a quadrant');
    }
});

test('a guessed facade is capped, an authored one is not', () => {
    // The cap exists to stop a cliff face or map-edge wall — impassable by
    // coincidence — from becoming a tower while a tileset is unclassified. It
    // has no business overruling someone who has said what a tile is: tilesets
    // draw buildings as single perspective props dozens of tiles tall, and
    // capping those dropped whole city blocks back onto the floor.
    const height = 20;
    const column = new Array(height).fill(0).map((_, y) => (y < 15 ? 1 : 0));
    const map = mapWith(1, height, { 0: column });

    const guessed = Geometry.uprightRuns(map, () => true, 8);
    assert.deepEqual(guessed, [], 'a 15-tile run of guesses is rejected');

    const authored = Geometry.uprightRuns(map, () => true, 8, () => true);
    assert.equal(authored.length, 1, 'the same run stands when it was authored');
    assert.equal(authored[0].tiles.length, 15);
});

test('one authored tile vouches for the run it is part of', () => {
    // A run is a single object; classifying its base is classifying the thing.
    const height = 20;
    const map = mapWith(1, height, { 0: new Array(height).fill(0).map((_, y) => (y < 12 ? 1 : 0)) });

    const runs = Geometry.uprightRuns(map, () => true, 8, tileId => tileId === 1);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].tiles.length, 12);
});

test('the cap still applies where nothing was authored', () => {
    const height = 30;
    const map = mapWith(1, height, { 0: new Array(height).fill(1) });
    assert.deepEqual(Geometry.uprightRuns(map, () => true, 8, () => false), []);
});

test('every layer of a cell is drawn, not just the top one', () => {
    // A cell holds up to four tiles and the 2D renderer composites all of
    // them: a floor, a decal over it, a puddle over that. Drawing only the
    // topmost showed the decal alone with nothing underneath — not the map the
    // author drew, and the commonest way the 3D view looks "wrong".
    const map = mapWith(1, 1, { 0: [1], 1: [300], 2: [700] });
    const built = Geometry.build(map, { elevationAt: flat });
    assert.equal(built.quads, 3, 'one quad per painted layer');
    assert.deepEqual(built.groups.map(g => g.setNumber).sort(), [5, 6, 7],
        'each from its own sheet');
});

test('stacked layers keep the author\'s order and stay a hair apart', () => {
    // Elevation 0 so the map rim builds no walls; only the ground quads remain.
    const map = mapWith(1, 1, { 0: [1], 1: [2] });
    const built = Geometry.build(map, { elevationAt: flat });
    const heights = built.groups.flatMap(group =>
        Array.from(group.positions).filter((_, i) => i % 3 === 1));
    const levels = [...new Set(heights)].sort((a, b) => a - b);
    assert.deepEqual(built.groups.map(group => group.layer).sort(), [0, 1],
        'the draw groups retain the physical map planes');
    assert.equal(levels.length, 2, 'the two layers sit at different heights');
    assert.equal(levels[0], 0, 'the lower one at the cell elevation');
    // Far below a tile's width: coplanar quads would z-fight, a visible gap
    // would show daylight between a floor and its own decal.
    assert.ok(levels[1] - levels[0] > 0 && levels[1] - levels[0] < 0.01);
});

test('an empty layer between two painted ones is skipped', () => {
    const map = mapWith(1, 1, { 0: [1], 2: [2] });
    const built = Geometry.build(map, { elevationAt: flat });
    assert.equal(built.quads, 2);
    assert.deepEqual(built.groups.map(group => group.layer).sort(), [0, 2],
        'compacting empty entries does not renumber their authored planes');
});

test('the built-in autotile tables match the corescript exactly', () => {
    // The builder used to read these off the global `Tilemap`, which only a
    // running game has. The editor viewport and the offline renderer load this
    // module alone, got null, and silently fell back to blitting each
    // autotile's corner — a seamless field of grass came out as a grid of
    // bordered squares. The copy is pinned here so it cannot drift from the
    // corescript it was taken from.
    const fs = require('node:fs');
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');

    const tableFrom = name => {
        const start = source.indexOf(`Tilemap.${name} = [`);
        assert.ok(start >= 0, `${name} exists in the corescript`);
        let depth = 0;
        const open = source.indexOf('[', start);
        for (let i = open; i < source.length; i++) {
            if (source[i] === '[') depth++;
            else if (source[i] === ']' && --depth === 0) {
                return JSON.parse(source.slice(open, i + 1).replace(/\s+/g, ''));
            }
        }
        throw new Error(`${name} is not closed`);
    };

    for (const name of ['FLOOR_AUTOTILE_TABLE', 'WALL_AUTOTILE_TABLE', 'WATERFALL_AUTOTILE_TABLE']) {
        assert.deepEqual(Geometry[name], tableFrom(name), `${name} matches`);
    }
});

test('autotiles build from the tables with no game running', () => {
    // Node has no `Tilemap`, which is exactly the situation the editor is in.
    assert.equal(typeof globalThis.Tilemap, 'undefined');
    const tables = Geometry.autotileTables({});
    assert.ok(tables && tables.floor && tables.wall && tables.waterfall);

    // Shape 0 is the fully-enclosed interior: no quadrant may come from the
    // block's outer border, or a field of grass draws a grid over itself.
    const quads = Geometry.autotileQuads(2816, 48, tables);
    assert.equal(quads.length, 4);
    assert.deepEqual(quads.map(q => [q.sx, q.sy]), [[48, 96], [24, 96], [48, 72], [24, 72]]);
});

test('a standing autotile uses its shape quadrants, not the block corner', () => {
    // A facade sampled `sheetRectFor`, which for an autotile is the block's
    // whole top-left tile — a corner piece. Walls came out built from grass
    // corners, and mountains were edged with a different mountain's border.
    const grass = 2816 + 16 * 48;            // an A2 kind, shape 0
    const map = mapWith(1, 1, { 0: [grass] });
    const built = Geometry.build(map, {
        elevationAt: flat,
        isUpright: () => true,
        uprightDepth: 0
    });
    // Four quadrants make up the face, and a wall is a box: the same four on
    // the back, and four more on each end, since a lone cell is exposed at both.
    assert.equal(built.quads, 4 * 4);

    const ground = Geometry.autotileQuads(grass, 48, TABLES);
    const size = { width: 768, height: 768 };
    // Through uvRect: a quad samples half a texel inside its own rectangle, so
    // the comparison has to be against what the ground would actually sample
    // rather than against the raw rectangle edge.
    const expected = new Set(ground.map(q => Geometry.uvRect(q, size).u0.toFixed(6)));
    const actual = new Set();
    const uvs = built.groups[0].uvs;
    for (let i = 0; i < uvs.length; i += 8) actual.add(uvs[i].toFixed(6));
    assert.deepEqual([...actual].sort(), [...expected].sort(),
        'the face samples exactly what the ground would');
});

test('nothing stands up unless it was classified', () => {
    // "Impassable or draws above characters" covers a great deal of ordinary
    // terrain. Guessing from it stood mountains and forests on end, and since a
    // facade is one plane at its run's southern edge, everything behind that
    // plane vanished — scenery appearing that was never placed, and scenery
    // that was placed going missing.
    const flags = [];
    flags[1] = 0x0f;                          // impassable
    flags[2] = 0x10;                          // draws above characters
    const predicate = Reactor3D.uprightPredicate(99, flags);
    assert.equal(predicate(1), false);
    assert.equal(predicate(2), false);

    const guessing = Reactor3D.uprightPredicate(99, flags, { guess: true });
    assert.equal(guessing(1), true, 'still available on request');
    assert.equal(guessing(2), true);
});

test('an authored class always wins over the guess', () => {
    const flags = [];
    flags[1] = 0x0f;
    Reactor3D.setClassification({ version: 1, tilesets: { 99: { 1: Reactor3D.CLASS_GROUND } } });
    try {
        assert.equal(Reactor3D.uprightPredicate(99, flags, { guess: true })(1), false);
    } finally {
        Reactor3D.setClassification(null);
    }
});

test('animated water carries a UV stride, still ground carries none', () => {
    // The A1 frames sit side by side in the same sheet, so animation is a UV
    // slide rather than a rebuild — a 200x200 map animates without touching
    // its geometry.
    const water = Geometry.build(mapWith(1, 1, { 0: [2048] }), { elevationAt: flat });
    assert.ok(water.groups[0].anim, 'the A1 group is animated');
    assert.ok(water.groups[0].anim.some(value => value !== 0));

    const ground = Geometry.build(mapWith(1, 1, { 0: [1] }), { elevationAt: flat });
    assert.equal(ground.groups[0].anim, null, 'a B-sheet tile never moves');
});

test('a waterfall slides down the sheet, not across it', () => {
    // Odd A1 kinds are waterfalls: `by` advances, and V counts up from the
    // bottom, so the stride has to be negative or the water runs backwards.
    const waterfall = Geometry.build(mapWith(1, 1, { 0: [2048 + 5 * 48] }), { elevationAt: flat });
    const anim = waterfall.groups[0].anim;
    const us = [], vs = [];
    for (let i = 0; i < anim.length; i += 2) { us.push(anim[i]); vs.push(anim[i + 1]); }
    assert.ok(us.every(value => value === 0), 'no horizontal drift');
    assert.ok(vs.every(value => value < 0), 'downward through the sheet');
});

test('animated A1 UV clamps follow all three water frames', () => {
    const uv = { array: new Float32Array([0.1, 0.2, 0.2, 0.2]), needsUpdate: false };
    const bounds = {
        array: new Float32Array([0.09, 0.19, 0.21, 0.31, 0.09, 0.19, 0.21, 0.31]),
        needsUpdate: false
    };
    const geometry = {
        getAttribute(name) { return name === 'uv' ? uv : name === 'uvBounds' ? bounds : null; }
    };
    const scene = Object.create(Reactor3D.MapScene.prototype);
    scene._frame = -1;
    scene._animated = [{
        geometry,
        base: Float32Array.from(uv.array),
        baseBounds: Float32Array.from(bounds.array),
        stride: new Float32Array([0.1, 0, 0.1, 0])
    }];
    const rounded = values => Array.from(values, value => Math.round(value * 100) / 100);

    scene.setAnimationFrame(1);
    assert.deepEqual(rounded(uv.array), [0.2, 0.2, 0.3, 0.2]);
    assert.deepEqual(rounded(bounds.array.slice(0, 4)), [0.19, 0.19, 0.31, 0.31]);
    scene.setAnimationFrame(2);
    assert.deepEqual(rounded(uv.array), [0.3, 0.2, 0.4, 0.2]);
    scene.setAnimationFrame(3);
    assert.deepEqual(rounded(uv.array), [0.2, 0.2, 0.3, 0.2], 'the ping-pong frame returns to 1');
    assert.equal(uv.needsUpdate, true);
    assert.equal(bounds.needsUpdate, true, 'the shader never clamps moving UVs to frame 0');
});

test('scenery raises its cell instead of standing a picture on it', () => {
    // Standing a billboard per cell was the first attempt, and it turned a
    // mountain range into rows of cardboard cut-outs with daylight between
    // them: terrain covers an area, and a picture does not. Raised ground gets
    // its cliff faces from the wall code for free and reads as a mass.
    const map = mapWith(1, 3, { 0: [1, 1, 1] });
    const raised = Geometry.build(map, { elevationAt: flat, isScenery: () => true });
    const heights = new Set();
    for (let i = 0; i < raised.groups[0].positions.length / 3; i++) {
        heights.add(raised.groups[0].positions[i * 3 + 1]);
    }
    assert.deepEqual([...heights].sort(), [0, 1], 'ground lifted a tile, walls down to 0');

    const level = Geometry.build(map, { elevationAt: flat });
    assert.ok(raised.quads > level.quads, 'the raised edge gains cliff faces');
});

test('a scenery cell stands one tile tall however many neighbours it has', () => {
    const map = mapWith(1, 5, { 0: [1, 1, 1, 1, 1] });
    const built = Geometry.build(map, { elevationAt: flat, isScenery: () => true, uprightDepth: 0 });
    const heights = new Set();
    for (let i = 0; i < built.groups[0].positions.length / 3; i++) {
        heights.add(built.groups[0].positions[i * 3 + 1]);
    }
    assert.deepEqual([...heights].sort(), [0, 1], 'ground at 0, tops at 1 — never stacked');
});

test('scenery is never guessed, only authored', () => {
    // Nothing in the 2D flags tells a forest from a shopfront, which is the
    // whole reason classification is authored.
    const flags = [];
    flags[1] = 0x0f;
    assert.equal(Reactor3D.sceneryPredicate(77)(1), false);
    Reactor3D.setClassification({ version: 1, tilesets: { 77: { 1: Reactor3D.CLASS_SCENERY } } });
    try {
        assert.equal(Reactor3D.sceneryPredicate(77)(1), true);
        assert.equal(Reactor3D.uprightPredicate(77, flags, { guess: true })(1), false,
            'scenery does not also collapse into facades');
    } finally {
        Reactor3D.setClassification(null);
    }
});

test('a standing object is one cut-out that turns to face the camera', () => {
    // It used to be a fixed plane, plus a second plane crossing it so that the
    // object did not vanish to a line when seen edge-on. A cut-out that turns
    // is never seen edge-on, so the crossing plane is gone — and with it the
    // seam it drew through the middle of the art at an angle.
    const built = Geometry.build(mapWith(1, 1, { 0: [1] }), {
        elevationAt: flat,
        isUpright: () => true,
        isAuthored: () => true
    });
    assert.equal(built.quads, 1, 'one face, no crossing plane');

    const group = built.groups[0];
    assert.equal(group.billboard, true, 'it is carried as a billboard');
    assert.ok(group.offsets, 'and carries the corner offsets the shader needs');

    // Every vertex of the quad shares the anchor; the corner lives in `offset`.
    const positions = Array.from(group.positions);
    assert.deepEqual(positions.slice(0, 3), positions.slice(3, 6),
        'all four vertices sit on the same anchor');
    const ys = [0, 1, 2, 3].map(i => group.offsets[i * 2 + 1]);
    assert.notEqual(Math.min(...ys), Math.max(...ys), 'and the offsets span a height');
});

test('each column of a wide object is its own cut-out', () => {
    const wide = Geometry.build(mapWith(3, 1, { 0: [1, 1, 1] }), {
        elevationAt: flat,
        isUpright: () => true,
        isAuthored: () => true
    });
    assert.equal(wide.quads, 3);
});

test('a building stands on a floor rather than over a hole', () => {
    // A facade consumes every cell of its run, and those cells usually hold
    // nothing but the building's own artwork — so excluding upright tiles left
    // the footprint with no ground at all, and a building drawn fifteen tiles
    // tall showed a fifteen-cell hole through to the sky.
    const height = 6;
    const column = [];
    for (let y = 0; y < height; y++) column.push(y < 4 ? 700 : 1);   // building, then street
    const map = mapWith(1, height, { 0: column });

    const built = Geometry.build(map, {
        elevationAt: flat,
        isUpright: id => id === 700,
        isAuthored: () => true,
        uprightDepth: 0
    });
    const groundY = 0;
    let groundQuads = 0;
    // Only the static groups: a billboard's vertices all sit on its anchor, so
    // it would read as flat on this test's terms without being flat at all.
    const positions = built.groups.filter(g => !g.billboard)
        .flatMap(g => Array.from(g.positions));
    for (let q = 0; q < positions.length / 3; q += 4) {
        const ys = [0, 1, 2, 3].map(i => positions[(q + i) * 3 + 1]);
        if (ys.every(y => y === groundY)) groundQuads++;
    }
    assert.equal(groundQuads, height, 'every cell of the run keeps a floor');
});

test('the floor under a building comes from the street, not an overlay', () => {
    // `nearestGround` used to take the top of the stack, which is often a
    // see-through decoration: it alpha-tests away to nothing and leaves exactly
    // the hole it was meant to close. The bottom layer is the actual floor.
    const map = mapWith(1, 3, {
        0: [700, 1, 0],      // building, floor, empty
        1: [0, 900, 0]       // an overlay drawn on top of that floor
    });
    const run = { x: 0, northY: 0, southY: 0 };
    assert.equal(Geometry.nearestGround(map, run, id => id === 700), 1);
});

test('a footprint with no floor anywhere south still finds one', () => {
    // A dense block can be buildings all the way to the map edge one way.
    const map = mapWith(1, 3, { 0: [1, 700, 700] });
    const run = { x: 0, northY: 1, southY: 2 };
    assert.equal(Geometry.nearestGround(map, run, id => id === 700), 1,
        'found by looking north when south is built up');
});

test('a floor is found in a neighbouring column when its own has none', () => {
    const map = mapWith(2, 1, { 0: [700, 1] });
    const run = { x: 0, northY: 0, southY: 0 };
    assert.equal(Geometry.nearestGround(map, run, id => id === 700), 1);
});

test('foliage stands several scattered cut-outs on a floor it lifts', () => {
    // Standing the tiling art up gave a wall of bark, and raising the ground
    // gave a plateau of it. A forest is neither: it is one thing drawn many
    // times. One per cell dead centre reads as an orchard, so each cell gets
    // several, nudged off centre, on a floor that rises a little so the wood
    // sits on the land instead of being painted onto it.
    const map = mapWith(2, 2, { 0: [500, 500, 500, 500] });
    const built = Geometry.build(map, {
        elevationAt: flat,
        isUpright: () => false,
        isFoliage: id => id === 500,
        standInFor: () => 900,
        foliageDensity: 2,
        foliageLift: 0.3
    });

    const ground = built.groups.filter(group => !group.billboard);
    const cutouts = built.groups.filter(group => group.billboard);
    assert.equal(cutouts[0].positions.length / 3, 4 * 4 * 2, 'two cut-outs per cell');

    // The lift gives the wood an edge, so the rim carries wall faces. Nothing
    // lies flat: the tiling art is not drawn a second time under the cut-outs.
    const quads = ground.flatMap(quadsOf);
    assert.equal(quads.filter(isFlat).length, 0, 'no second copy laid on the floor');
    assert.ok(quads.length > 0, 'and the lifted edge is walled');

    // Scattered, and the same scatter every time: trees that jump when you
    // paint elsewhere on the map are worse than trees in rows.
    const anchors = new Set();
    for (let i = 0; i < cutouts[0].positions.length; i += 3) {
        anchors.add(`${cutouts[0].positions[i]},${cutouts[0].positions[i + 2]}`);
    }
    assert.equal(anchors.size, 8, 'no two of the eight share a position');
    const again = Geometry.build(map, {
        elevationAt: flat, isFoliage: id => id === 500, standInFor: () => 900,
        foliageDensity: 2, foliageLift: 0.3
    });
    assert.deepEqual(Array.from(again.groups.find(g => g.billboard).positions),
        Array.from(cutouts[0].positions), 'and it rebuilds identically');
});

test('a wood is drawn once, as cut-outs, not also as a mat under them', () => {
    // The tiling art of a terrain is that terrain seen from above, so laying it
    // flat as well as standing cut-outs on it draws every cell twice — and at
    // ground level the second copy shows as a mat of canopy around the feet of
    // the trees growing out of it.
    const map = mapWith(1, 1, { 0: [1], 1: [500] });
    const built = Geometry.build(map, {
        elevationAt: flat,
        isFoliage: id => id === 500,
        standInFor: () => 900,
        foliageDensity: 1
    });
    const flatQuads = built.groups.filter(group => !group.billboard)
        .flatMap(quadsOf).filter(isFlat);
    assert.equal(flatQuads.length, 1, 'only the ground the wood grows on');
    assert.ok(built.groups.some(group => group.billboard), 'and the cut-out standing on it');
});

test('a multi-tile foliage stand-in uses a separate blended gap underlay', () => {
    const map = mapWith(1, 1, { 0: [1], 1: [500] });
    const built = Geometry.build(map, {
        elevationAt: flat,
        isFoliage: id => id === 500,
        standInFor: () => ({ tileId: 900, w: 2, h: 2 }),
        foliageDensity: 1
    });
    const flatQuads = built.groups.filter(group => !group.billboard)
        .flatMap(quadsOf).filter(isFlat);
    assert.equal(flatQuads.length, 2, 'the base and a separate gap fill remain');
    assert.equal(built.groups.some(group => group.underlay), true,
        'the fill cannot be mistaken for ordinary opaque terrain');
});

test('a multi-tile foliage stamp stands once at its authored footprint', () => {
    // IDs 44/45/52/53 are one repeating 2x2 fill block on the sheet. Each
    // points at the same 2x2 lone variant beginning at 28; emitting that whole
    // picture for every constituent cell draws four overlapping mountains.
    const map = mapWith(2, 2, {
        0: [1, 1, 1, 1],
        2: [44, 45, 0, 0],
        3: [0, 0, 52, 53]
    });
    const built = Geometry.build(map, {
        elevationAt: flat,
        isFoliage: id => [44, 45, 52, 53].includes(id),
        standInFor: () => ({ tileId: 28, w: 2, h: 2 }),
        foliageDensity: 1
    });
    const cutouts = built.groups.filter(group => group.billboard);
    assert.equal(cutouts.reduce((total, group) => total + group.positions.length / 12, 0), 4,
        'one subquad per painted source cell, not one whole mountain per cell');
    assert.deepEqual(cutouts.map(group => group.layer).sort(), [2, 3],
        'each half remains in its authored physical map plane');
    const anchors = cutouts.flatMap(group => Array.from(group.positions));
    for (let i = 0; i < anchors.length; i += 3) {
        assert.equal(anchors[i], 1, 'centred across the two authored columns');
        assert.equal(anchors[i + 2], 1, 'centred across the two authored rows');
    }
    const ys = cutouts.flatMap(group => Array.from(group.offsets)
        .filter((_, index) => index % 2 === 1));
    assert.equal(Math.max(...ys) - Math.min(...ys), 2,
        'keeps the authored 2x2 proportions without geometric overlap');
});

test('an incomplete multi-tile foliage stamp completes its silhouette', () => {
    const map = mapWith(2, 2, {
        0: [1, 1, 1, 1],
        2: [44, 45, 0, 0]
    });
    const built = Geometry.build(map, {
        elevationAt: flat,
        isFoliage: id => id === 44 || id === 45,
        standInFor: () => ({ tileId: 28, w: 2, h: 2 }),
        foliageDensity: 1
    });
    const cutouts = built.groups.filter(group => group.billboard);
    assert.equal(cutouts.reduce((total, group) => total + group.positions.length / 12, 0), 4,
        'a ragged fill edge does not turn the lone variant into half a mountain');
    const ys = cutouts.flatMap(group => Array.from(group.offsets)
        .filter((_, index) => index % 2 === 1));
    assert.deepEqual([...new Set(ys)].sort(), [0, 1, 2], 'the complete two-row silhouette remains');
});

/** The world size of the one cut-out a single-cell map built. */
function cutoutSize(built) {
    const cutout = built.groups.find(group => group.billboard);
    const xs = Array.from(cutout.offsets).filter((_, index) => index % 2 === 0);
    const ys = Array.from(cutout.offsets).filter((_, index) => index % 2 === 1);
    return {
        wide: Math.max(...xs) - Math.min(...xs),
        high: Math.max(...ys) - Math.min(...ys),
        foot: Math.min(...ys),
        left: Math.min(...xs),
        right: Math.max(...xs)
    };
}

test('a cut-out is as wide as its art and as tall as its art in proportion', () => {
    // The lone variant of a forest is often drawn over a block of the sheet.
    // Sampling only its first tile drew the top-left quarter of every tree;
    // sizing it as though the block were a single tile then squeezed the whole
    // picture into one cell of world space.
    const art = [900, 901, 908, 909, 916, 917, 924, 925];
    const built = Geometry.build(mapWith(2, 4, { 0: art }), {
        elevationAt: flat,
        isFoliage: id => art.includes(id),
        standInFor: () => ({ tileId: 900, w: 2, h: 4 }),
        foliageHeight: 1,
        foliageDensity: 1,
        foliageSpread: 0
    });

    const { wide, high, foot } = cutoutSize(built);
    // Sizes vary a little per tree, so the proportion is what is pinned.
    assert.ok(Math.abs(high / wide - 2) < 1e-6, 'twice as tall as wide, as the art is');
    assert.ok(wide > 1.5 && wide < 2.5, 'and two cells wide, because the art is two tiles wide');
    assert.equal(foot, 0, 'standing on the ground rather than sunk into it');
});

test('ordinary single-tile foliage is one cell wide, stood up in proportion', () => {
    // The span multiplier is 1 here, so a wood is sized as it always was
    // except for the floor: a cut-out is never narrower than the cell it
    // stands on, where it used to be able to shrink to three quarters of one
    // and let the ground show beside it.
    const built = Geometry.build(mapWith(1, 1, { 0: [500] }), {
        elevationAt: flat,
        isFoliage: id => id === 500,
        standInFor: () => 900,
        foliageHeight: 1.4,
        foliageDensity: 1,
        foliageSpread: 0
    });
    const { wide, high } = cutoutSize(built);
    assert.ok(wide > 0.7 && wide < 1.3, 'about a cell wide');
    assert.ok(Math.abs(high / wide - 1.4) < 1e-6, 'and stood up by foliageHeight');
});

test('a cut-out covers the cell it stands on', () => {
    // Why the size matters. A billboard is a rectangle, so where a cut-out is
    // narrower than its cell the ground shows between it and its neighbour —
    // with the straight vertical sides of the quads either side, which reads
    // as a rectangular bite out of a mountain range rather than as scatter.
    // A 2x2 stand-in built one cell wide left up to two thirds of a tile bare.
    const built = Geometry.build(mapWith(1, 1, { 0: [500] }), {
        elevationAt: flat,
        isFoliage: id => id === 500,
        standInFor: () => ({ tileId: 900, w: 2, h: 2 }),
        foliageDensity: 1,
        foliageSpread: 0.55
    });
    const cutout = built.groups.find(group => group.billboard);
    // The anchor carries the scatter; the offsets are measured from it.
    const anchorX = cutout.positions[0];
    const { left, right } = cutoutSize(built);
    assert.ok(anchorX + left <= 0, `reaches the cell's west edge (${anchorX + left})`);
    assert.ok(anchorX + right >= 1, `and its east edge (${anchorX + right})`);
});

test('a cut-out samples the whole span of its stand-in', () => {
    const map = mapWith(1, 1, { 0: [500] });
    const one = Geometry.build(map, {
        elevationAt: flat, isFoliage: id => id === 500, standInFor: () => 900
    });
    const blockArt = [900, 901, 908, 909];
    const block = Geometry.build(mapWith(2, 2, { 0: blockArt }), {
        elevationAt: flat, isFoliage: id => blockArt.includes(id),
        standInFor: () => ({ tileId: 900, w: 2, h: 2 })
    });
    const spanOf = built => {
        const uvs = built.groups.filter(group => group.billboard)
            .flatMap(group => Array.from(group.uvs));
        const us = uvs.filter((_, index) => index % 2 === 0);
        return Math.max(...us) - Math.min(...us);
    };
    const oneSpan = spanOf(one);
    const blockSpan = spanOf(block);
    assert.ok(blockSpan > oneSpan * 1.9,
        `a two-tile-wide stand-in reads two tiles of the sheet (${oneSpan} -> ${blockSpan})`);
});

test('an object stands in the middle of its southern row', () => {
    // The anchor is the point the cut-out turns about, so it is also where the
    // object appears to be, and it is the middle of the cell on both axes.
    // Rows are *height* — `level = maxY - cell.y` stacks them upwards to build
    // the picture — so centring on the rows as though they were a footprint put
    // the object's feet halfway up its own height. Anchoring on the southern
    // *edge* of that row instead left the object half a tile south of its own
    // square, which only shows once the camera comes round.
    // Columns 8-10, rows 9-11 of a B sheet: one drawing, three tiles square.
    // The ids have to be laid out on the sheet the way they are on the map, or
    // they are not pieces of one picture and do not group.
    const art = [200, 201, 202, 208, 209, 210, 216, 217, 218];
    const map = mapWith(5, 4, {
        0: [
            0, art[0], art[1], art[2], 0,
            0, art[3], art[4], art[5], 0,
            0, art[6], art[7], art[8], 0,
            0, 1, 1, 1, 0
        ]
    });
    const built = Geometry.build(map, {
        elevationAt: flat,
        isUpright: id => art.includes(id),
        isAuthored: () => true
    });

    const group = built.groups.find(g => g.billboard);
    const anchors = new Set();
    for (let i = 0; i < group.positions.length; i += 3) {
        anchors.add(`${group.positions[i]},${group.positions[i + 1]},${group.positions[i + 2]}`);
    }
    assert.equal(anchors.size, 1, 'the whole object turns about one point');
    // Columns 1-3: the middle is x 2.5. Rows 0-2 are height, so the footprint
    // is the southern one alone, and the anchor is the middle of it — z 2.5.
    // Both axes centre on the cell, so the object turns about itself.
    assert.equal(Array.from(anchors)[0], '2.5,0,2.5');

    // Its lowest corner sits on the ground rather than above it.
    const ys = [];
    for (let i = 1; i < group.offsets.length; i += 2) ys.push(group.offsets[i]);
    assert.equal(Math.min(...ys), 0, 'the bottom of the art is on the ground');
    assert.equal(Math.max(...ys), 3, 'and it stands as tall as it is drawn');
});

test('a declared object is grouped exactly, not by spreading', () => {
    // Two different objects side by side on the sheet *and* on the map are
    // indistinguishable to the adjacency test: every neighbouring pair is one
    // step apart in both. Declared, each keeps to itself.
    const map = mapWith(6, 1, { 0: [0, 8, 9, 10, 11, 0] });
    const declared = {
        8: { object: { tile: 8, w: 2, h: 1 }, dc: 0, dr: 0, role: 'S' },
        9: { object: { tile: 8, w: 2, h: 1 }, dc: 1, dr: 0, role: 'S' },
        10: { object: { tile: 10, w: 2, h: 1 }, dc: 0, dr: 0, role: 'S' },
        11: { object: { tile: 10, w: 2, h: 1 }, dc: 1, dr: 0, role: 'S' }
    };
    const options = { elevationAt: flat, isUpright: id => id > 0, isAuthored: () => true };

    const welded = Geometry.uprightObjects(map, options.isUpright, 99, () => true, null);
    assert.equal(welded.length, 1, 'the guess welds them into one four-wide object');

    const apart = Geometry.uprightObjects(map, options.isUpright, 99, () => true,
        id => declared[id] || null);
    assert.equal(apart.length, 2, 'the declarations keep them apart');
    assert.deepEqual(apart.map(o => o.cells.length).sort(), [2, 2]);
});

test('two copies of the same declared object stay separate', () => {
    // Same tiles, painted twice in a row. They share a declaration, so what
    // separates the instances is where each one starts on the map.
    const map = mapWith(5, 1, { 0: [8, 9, 8, 9, 0] });
    const declared = {
        8: { object: { tile: 8, w: 2, h: 1 }, dc: 0, dr: 0, role: 'S' },
        9: { object: { tile: 8, w: 2, h: 1 }, dc: 1, dr: 0, role: 'S' }
    };
    const objects = Geometry.uprightObjects(map, id => id > 0, 99, () => true,
        id => declared[id] || null);
    assert.equal(objects.length, 2, 'two instances, not one four-wide run');
    for (const object of objects) assert.equal(object.maxX - object.minX + 1, 2);
});

test('a roof rides on the wall it belongs to', () => {
    // A building is two pieces of terrain: wall autotiles where it meets the
    // ground, and roof tiles on the cells behind them. The walls raised into a
    // mass and the roof, being flat terrain, stayed on the floor — so a
    // building came out as a block with its own roof lying beside it.
    const width = 4, height = 3;
    const cells = new Array(width * height).fill(2816);   // A2 ground
    for (let x = 1; x < 3; x++) {
        cells[0 * width + x] = 5888;    // A4 roof, behind
        cells[1 * width + x] = 4352;    // A3 wall, meeting the ground
    }
    const built = Geometry.build(mapWith(width, height, { 0: cells }), {
        elevationAt: flat,
        isScenery: id => id >= 4352 && id < 5888,
        sceneryHeight: 1
    });

    const heights = new Map();
    for (const group of built.groups.filter(g => !g.billboard)) {
        for (let q = 0; q < group.positions.length / 3; q += 4) {
            const ys = [0, 1, 2, 3].map(i => group.positions[(q + i) * 3 + 1]);
            if (Math.min(...ys) !== Math.max(...ys)) continue;      // a wall face
            const x = Math.floor(group.positions[q * 3] + 0.01);
            const z = Math.floor(group.positions[q * 3 + 2] + 0.01);
            heights.set(`${x},${z}`, ys[0]);
        }
    }
    assert.equal(heights.get('1,1'), 1, 'the wall raises into a mass');
    assert.equal(heights.get('1,0'), 1, 'and the roof behind it is carried up to match');
    assert.equal(heights.get('2,0'), 1);
    assert.equal(heights.get('1,2'), 0, 'the ground in front stays where it is');
    assert.equal(heights.get('0,0'), 0, 'and so does ground that touches no wall');
});

test('a tall thin prop stands on the tile it belongs to', () => {
    // The anchor is the axis the cut-out spins on, so anything off-centre makes
    // the object orbit that point instead of turning where it stands. It sat on
    // the southern row's front edge, half a tile out, and that showed as the
    // object sliding off its own square as the camera came round — a column in
    // the middle of a pool ended up on the pool's lip.
    const art = [200, 208, 216, 224];        // one column, four rows of a sheet
    const map = mapWith(3, 6, {
        0: [
            0, 0, 0,
            0, art[0], 0,
            0, art[1], 0,
            0, art[2], 0,
            0, art[3], 0,
            0, 1, 0
        ]
    });
    const built = Geometry.build(map, {
        elevationAt: flat,
        isUpright: id => art.includes(id),
        isAuthored: () => true
    });

    const group = built.groups.find(g => g.billboard);
    const anchors = new Set();
    for (let i = 0; i < group.positions.length; i += 3) {
        anchors.add(`${group.positions[i]},${group.positions[i + 2]}`);
    }
    assert.equal(anchors.size, 1, 'one axis for the whole object');
    // Column 1, rows 1-4 — a street light: four tiles tall, one tile deep. Its
    // footprint is row 4 alone and it stands in the middle of it, at z 4.5.
    // Anchored on the middle of *all four rows* it sat two and a half tiles
    // north of that, which at a pitched camera reads as floating; anchored on
    // row 4's southern edge it sat half a tile south of its own square.
    assert.equal(Array.from(anchors)[0], '1.5,4.5');

    // The base still rests on the ground, so turning in place does not lift it.
    const ys = [];
    for (let i = 1; i < group.offsets.length; i += 2) ys.push(group.offsets[i]);
    assert.equal(Math.min(...ys), 0);
});

test('a wall is a box, not a plane', () => {
    /*
     * A wall used to be a single plane on the southern face of its run, which
     * is right from the front and nothing at all from the side: walk round a
     * shop and its front thinned to a line and vanished, because that is what a
     * plane seen edge-on does.
     *
     * 2D never draws a building's sides, so there is no art for them — but the
     * wall's own art is a better answer than a hole, and it is what an author
     * reaching for a quick fix would put there themselves.
     */
    const wall = 4352 + 11 * 48;             // an A3 wall kind, shape 0
    const map = mapWith(1, 1, { 0: [wall] });
    const built = Geometry.build(map, {
        elevationAt: flat, isUpright: id => id === wall, isAuthored: () => true
    });

    const depth = new Set();
    for (const group of built.groups) {
        for (let i = 2; i < group.positions.length; i += 3) {
            depth.add(Number(group.positions[i].toFixed(3)));
        }
    }
    assert.ok(depth.size > 1, 'it occupies depth, rather than one plane');
    const sorted = [...depth].sort((a, b) => a - b);
    assert.equal(sorted[sorted.length - 1] - sorted[0], Geometry.WALL_THICKNESS,
        'a whole tile deep');
    // The ends are split by the same quadrants as the front, so the depth they
    // span has a seam down the middle of it.
    assert.equal(sorted.length, 3, 'back, middle and front');
});

test('a run of walls is one block, not a row of boxes', () => {
    /*
     * Putting an end face between every pair of columns is geometry nobody can
     * ever see, and two surfaces fighting over the same plane where they meet.
     * Ends are emitted only where the wall actually ends.
     */
    const wall = 4352 + 11 * 48;
    const options = { elevationAt: flat, isUpright: id => id === wall, isAuthored: () => true };
    const one = Geometry.build(mapWith(1, 1, { 0: [wall] }), options).quads;
    const three = Geometry.build(mapWith(3, 1, { 0: [wall, wall, wall] }), options).quads;

    // Four quadrants front and back per cell, and two ends for the whole run
    // however long it is.
    assert.equal(one, 4 * 2 + 4 * 2);
    assert.equal(three, 3 * 4 * 2 + 4 * 2, 'three cells, still two ends');
});

test('two walls on different footings keep their own ends', () => {
    // Same column, different buildings: they are not one another's neighbour
    // and neither loses the face where it stops.
    const wall = 4352 + 11 * 48;
    const map = mapWith(1, 3, { 0: [wall, 0, wall] });
    const built = Geometry.build(map, {
        elevationAt: flat, isUpright: id => id === wall, isAuthored: () => true
    });
    assert.equal(built.quads, 2 * (4 * 2 + 4 * 2), 'both are boxed in their own right');
});

test('every quad carries the rectangle it is allowed to sample', () => {
    /*
     * The half-texel inset fixes the boundary case: it moves the sample off the
     * fence between two tiles. It cannot fix the far case. Zoomed out, one
     * screen pixel covers many texels and the GPU picks one from somewhere in
     * that footprint — which at the edge of a tile is somewhere in the next
     * tile along. The inset would have to grow with the zoom, and the zoom is
     * not a constant, so the rule is carried per vertex and enforced in the
     * fragment shader instead.
     */
    const built = Geometry.build(mapWith(2, 2, { 0: [1, 2, 3, 4] }), {
        elevationAt: flat,
        sheetSize: () => ({ width: 768, height: 768 })
    });
    const group = built.groups[0];
    assert.ok(group.bounds, 'the attribute exists');
    assert.equal(group.bounds.length, (group.uvs.length / 2) * 4, 'four floats a vertex');

    // Every quad's four vertices carry one rectangle, so it interpolates to
    // itself rather than sliding across the quad.
    for (let q = 0; q < group.bounds.length / 16; q++) {
        const first = Array.from(group.bounds.slice(q * 16, q * 16 + 4));
        for (let v = 1; v < 4; v++) {
            assert.deepEqual(Array.from(group.bounds.slice(q * 16 + v * 4, q * 16 + v * 4 + 4)),
                first, `quad ${q}, vertex ${v}`);
        }
        assert.ok(first[2] > first[0] && first[3] > first[1], 'and it is a real rectangle');
    }

    // And every UV of that quad lies inside its own rectangle.
    for (let v = 0; v < group.uvs.length / 2; v++) {
        const [u, uv] = [group.uvs[v * 2], group.uvs[v * 2 + 1]];
        const [u0, v0, u1, v1] = group.bounds.slice(v * 4, v * 4 + 4);
        assert.ok(u >= u0 - 1e-6 && u <= u1 + 1e-6, `u ${u} within [${u0}, ${u1}]`);
        assert.ok(uv >= v0 - 1e-6 && uv <= v1 + 1e-6, `v ${uv} within [${v0}, ${v1}]`);
    }
});

test('the clamp is injected where no other patch can remove it', () => {
    /*
     * At `void main`, not at a chunk. The billboard material's own
     * onBeforeCompile *replaces* `#include <begin_vertex>` with the code that
     * builds its quad, so a second patch anchored there finds nothing to
     * replace and silently does nothing — leaving the varying unwritten, which
     * clamps every sample to a zero-sized rectangle. Every cut-out on the map
     * became one transparent texel and no shader failed to compile.
     */
    const runtime = require('./helpers/runtime-3d-source.cjs').source3D();
    const clamp = runtime.slice(runtime.indexOf('Reactor3D.clampToTile = function'));
    const body = clamp.slice(0, clamp.indexOf('\n};'));
    assert.match(body, /replace\(\s*"void main\(\) \{",/, 'anchored at void main');
    // The prose above explains why, so the check is on what is replaced rather
    // than on the word appearing at all.
    assert.doesNotMatch(body, /replace\(\s*"#include <begin_vertex>"/);
    // Composed, never assigned over: the billboard material already has one.
    assert.match(body, /const earlier = material\.onBeforeCompile;/);
    assert.match(body, /if \(typeof earlier === "function"\) earlier\.call/);
    // And the sample itself is clamped to the vertex's own rectangle.
    assert.match(body, /clamp\( vMapUv, vUvBounds\.xy, vUvBounds\.zw \)/);
});
