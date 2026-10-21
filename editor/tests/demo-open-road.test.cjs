'use strict';
// The Demo's Open Road: five 3D maps in a row (Map008-012, west to east) cut from one world, joined
// to North Haven (Map005) by a pass through its east range, for travel between neighboring maps on
// the motorcycle. What must hold for that travel to be seamless: the terrain agrees corner for
// corner along every shared border, the road and the ground paint carry across, each border names
// the map on its other side both ways, and the road can be ridden from North Haven's lane to the
// lookout. The maps are read through the runtime's own readers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
// RR_OPEN_ROAD_DATA: another data folder (a changed copy of the Demo's, to see that a test notices).
// RR_OPEN_ROAD_NUMBERS=1 prints each map's steepest rise along the road and its lean across.
const dataDir = process.env.RR_OPEN_ROAD_DATA ? path.resolve(process.env.RR_OPEN_ROAD_DATA) : path.join(root, 'template', 'Demo', 'data');
const R = require(path.join(root, 'runtime/reactor_3d.js'));
const E = require(path.join(root, 'editor/src/utils/MapElevation.js'));
const Ground = require(path.join(root, 'editor/src/utils/MapGround.js'));
const Foliage = require(path.join(root, 'editor/src/utils/MapFoliage.js'));
const { driveWorld, hasDemo, DEG } = require('./helpers/vehicles-drive-world.cjs');

const IDS = [8, 9, 10, 11, 12];
/** North Haven, west of Forest Road: Forest Road's rows lie against North Haven's rows from `HAVEN_SHIFT` down. */
const HAVEN = 5, HAVEN_SHIFT = 0;
const NAMES = ['Open Road: Forest', 'Open Road: Fields', 'Open Road: Hills', 'Open Road: Pass', 'Open Road: Lake'];
const W = 120, H = 120;
/** Half the road's width, the verge beside it, and how far anything solid stays from the road's edge (tiles). */
const ROAD_HALF = 2.5, VERGE = 2, CLEAR = 3;
/** The painted road is read back a cell at a time, so its centre is known to about a third of a tile. */
const SLACK = 0.35;

const three = id => String(id).padStart(3, '0');
const file = (id, suffix) => path.join(dataDir, `Map${three(id)}${suffix}`);
const json = name => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
// A clean clone has every committed Demo file; a checkout without these maps skips.
const present = IDS.concat(HAVEN).every(id => fs.existsSync(file(id, '.json')) && fs.existsSync(file(id, '.r3d.json')));
const skip = !present && 'the Demo\'s Open Road maps (Map008-012) and North Haven (Map005) are not on disk';

const cache = new Map();
function load(id) {
    if (!cache.has(id)) {
        const map = JSON.parse(fs.readFileSync(file(id, '.json'), 'utf8'));
        map.id = id;
        map.reactor3d = JSON.parse(fs.readFileSync(file(id, '.r3d.json'), 'utf8'));
        cache.set(id, map);
    }
    return cache.get(id);
}

/** A ground type's level per cell, by the type's name; null when the map has no such type. */
function paintOf(map, name) {
    const index = Ground.types(map).findIndex(type => type.name === name);
    return index < 0 ? null : Ground.levelsOf(map, index);
}

/**
 * The road as painted: for each column the rows that wear it and its centre there, and the centre
 * line as points (a column's middle, the middle of its road rows). `distance(x, z)` is how far a
 * point lies from that line.
 */
const roads = new Map();
function roadOf(map) {
    if (roads.has(map.id)) return roads.get(map.id);
    const levels = paintOf(map, 'Road'), columns = [], points = [];
    for (let x = 0; x < map.width; x++) {
        let lo = -1, hi = -1;
        for (let z = 0; z < map.height; z++) if (levels[z * map.width + x] >= 5) { if (lo < 0) lo = z; hi = z; }
        if (lo < 0) { columns.push(null); continue; }
        const column = { x, lo, hi, centre: (lo + hi + 1) / 2 };
        columns.push(column);
        points.push([x + 0.5, column.centre]);
    }
    const distance = (x, z) => {
        let best = Infinity;
        for (let i = 0; i + 1 < points.length; i++) {
            const [ax, az] = points[i], bx = points[i + 1][0] - ax, bz = points[i + 1][1] - az;
            const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz)));
            best = Math.min(best, Math.hypot(x - ax - bx * t, z - az - bz * t));
        }
        return best;
    };
    /** The centre's row at a fractional x, between the columns' middles. */
    const centreAt = x => {
        const i = Math.max(0, Math.min(points.length - 2, Math.floor(x - points[0][0])));
        const [ax, az] = points[i], [bx, bz] = points[i + 1];
        return az + (bz - az) * Math.max(0, Math.min(1, (x - ax) / (bx - ax)));
    };
    /**
     * The road's line at a column with the cells' stair-steps averaged out: its centre there and the
     * unit vector along it (a centre read from whole rows is half a row out, which turns the line).
     */
    const lineAt = x => {
        const at = k => points[Math.max(0, Math.min(points.length - 1, k - points[0][0] + 0.5))];
        let sum = 0, n = 0;
        for (let k = x - 2; k <= x + 2; k++) { const p = at(k); if (p) { sum += p[1]; n++; } }
        const a = at(x - 3), b = at(x + 3), run = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return { x: x + 0.5, z: sum / n, dx: (b[0] - a[0]) / run, dz: (b[1] - a[1]) / run };
    };
    const road = { levels, columns, points, distance, centreAt, lineAt, last: points[points.length - 1] };
    roads.set(map.id, road);
    return road;
}

test('the five maps are listed after the Demo\'s other maps, in order, as 3D maps of 120 by 120', { skip }, () => {
    const infos = json('MapInfos.json'), tilesets = json('Tilesets.json');
    const others = infos.filter(info => info && !IDS.includes(info.id) && !info.parentId).map(info => info.order);
    IDS.forEach((id, k) => {
        const info = infos[id], map = load(id);
        assert.ok(info, `MapInfos lists map ${id}`);
        assert.equal(info.id, id);
        assert.equal(info.name, NAMES[k]);
        assert.equal(info.parentId, 0);
        assert.ok(others.every(order => info.order > order), `${NAMES[k]} comes after the existing maps`);
        if (k) assert.ok(info.order > infos[id - 1].order, `${NAMES[k]} comes after ${NAMES[k - 1]}`);
        assert.equal(map.width, W); assert.equal(map.height, H);
        assert.match(map.note, /<3d>/i, 'the note says 3D: the runtime asks for the sidecar only then');
        assert.equal(map.data.length, W * H * 6);
        assert.ok(tilesets[map.tilesetId], 'its tileset exists');
        assert.ok(Array.isArray(map.events) && map.events[0] === null);
        assert.equal(map.reactor3d.mode, '3d');
        assert.equal(R.terrainOf(map).length, (W + 1) * (H + 1));
        assert.equal(map.reactor3d.terrainWidth, W);
        assert.ok(map.reactor3d.elevation.every(level => level === 0), 'the land is the terrain alone');
        assert.ok(R.surroundOf(map), 'something lies past its border');
        assert.equal(R.mapProps(map).length, E.props(map).length);
    });
});

test('each shared border names the map on its other side, both ways, with matching shifts; the other sides name none', { skip }, () => {
    const OPPOSITE = { east: 'west', west: 'east' };
    // North Haven's east side leads to Forest Road, and Forest Road's west side back, by opposite shifts.
    const shifted = (map, shift) => (shift ? { map, shift } : { map });
    assert.deepEqual(R.neighborsOf(load(HAVEN)), { east: shifted(IDS[0], HAVEN_SHIFT) }, 'North Haven');
    assert.deepEqual(R.neighborsOf(load(IDS[0])).west, shifted(HAVEN, -HAVEN_SHIFT), 'Forest Road');
    assert.ok(HAVEN_SHIFT >= 0 && HAVEN_SHIFT + H <= load(HAVEN).height, 'Forest Road lies wholly against North Haven\'s east side');
    {
        // Riding out of North Haven by the road's row lands on Forest Road's road, and back.
        const haven = load(HAVEN), forest = load(IDS[0]), row = Math.floor(roadOf(forest).columns[0].centre);
        const out = R.neighborExit(haven, haven.width - 1, row + HAVEN_SHIFT, 6);
        assert.deepEqual(out, { mapId: IDS[0], side: 'east', along: row, d: 6, inset: 0 });
        assert.deepEqual(R.neighborArrival(out, forest.width, forest.height), { x: 0, y: row });
        const back = R.neighborExit(forest, 0, row, 4);
        assert.deepEqual(back, { mapId: HAVEN, side: 'west', along: row + HAVEN_SHIFT, d: 4, inset: 0 });
        assert.deepEqual(R.neighborArrival(back, haven.width, haven.height), { x: haven.width - 1, y: row + HAVEN_SHIFT });
        assert.ok(paintOf(haven, 'Road')[(row + HAVEN_SHIFT) * haven.width + haven.width - 1] >= 5, 'the arrival tile in North Haven is road');
    }
    IDS.forEach((id, k) => {
        const map = load(id), neighbors = R.neighborsOf(map);
        const expected = {};
        expected.west = k > 0 ? { map: id - 1 } : shifted(HAVEN, -HAVEN_SHIFT);
        if (k < IDS.length - 1) expected.east = { map: id + 1 };
        assert.deepEqual(neighbors, expected, `map ${id}`);
        for (const side of Object.keys(neighbors)) {
            const back = R.neighborsOf(load(neighbors[side].map))[OPPOSITE[side]];
            assert.deepEqual(back, shifted(id, -(neighbors[side].shift || 0)), `map ${neighbors[side].map} leads back to ${id}`);
        }
    });
    // A step off the east end of the road lands on the road of the next map, on the same row.
    for (let k = 0; k + 1 < IDS.length; k++) {
        const map = load(IDS[k]), next = load(IDS[k + 1]), row = Math.floor(roadOf(map).columns[W - 1].centre);
        const out = R.neighborExit(map, W - 1, row, 6);
        assert.deepEqual(out, { mapId: IDS[k + 1], side: 'east', along: row, d: 6, inset: 0 });
        const arrival = R.neighborArrival(out, next.width, next.height);
        assert.deepEqual(arrival, { x: 0, y: row });
        assert.ok(roadOf(next).levels[arrival.y * W + arrival.x] >= 5, `the arrival tile on map ${next.id} is road`);
        const home = R.neighborArrival(R.neighborExit(next, 0, row, 4), map.width, map.height);
        assert.deepEqual(home, { x: W - 1, y: row });
        assert.ok(roadOf(map).levels[home.y * W + home.x] >= 5, `and the way back lands on map ${map.id}'s road`);
    }
});

test('North Haven\'s east border and Forest Road\'s west border are one line of ground, corner for corner over the shared rows', { skip }, () => {
    const haven = load(HAVEN), forest = load(IDS[0]);
    const a = R.terrainOf(haven), b = R.terrainOf(forest), stride = haven.width + 1;
    for (let z = 0; z <= H; z++) assert.equal(a[(z + HAVEN_SHIFT) * stride + haven.width], b[z * (W + 1)], `corner ${z} of the border`);
    for (let z = 0; z < H; z += 0.25) assert.equal(R.terrainHeightAt(haven, haven.width, z + HAVEN_SHIFT), R.terrainHeightAt(forest, 0, z), `height at ${z} along the border`);
    // The road crosses at the same row, as wide, on the same ground type.
    const west = paintOf(haven, 'Road'), east = roadOf(forest).columns[0];
    // Where it is crossed nothing stands on the border: the ground under a wheel is the same from both sides.
    for (let z = east.lo - 1; z <= east.hi + 2; z += 0.25) {
        assert.ok(Math.abs(R.groundHeightAt(haven, haven.width - 1e-7, z + HAVEN_SHIFT) - R.groundHeightAt(forest, 1e-7, z)) < 1e-5, `the ground at row ${z}`);
    }
    let lo = -1, hi = -1;
    for (let z = 0; z < haven.height; z++) if (west[z * haven.width + haven.width - 1] >= 5) { if (lo < 0) lo = z; hi = z; }
    assert.ok(lo >= 0, 'North Haven\'s road reaches its east border');
    assert.ok(Math.abs((lo + hi + 1) / 2 - HAVEN_SHIFT - east.centre) <= 1, `the road's centre is at row ${(lo + hi + 1) / 2} and ${east.centre}`);
    assert.ok(Math.abs((hi - lo) - (east.hi - east.lo)) <= 1, 'and as wide');
    const look = map => { const { paint, ...rest } = Ground.types(map).find(type => type.name === 'Road'); return rest; };
    assert.deepEqual(look(haven), look(forest), 'the same road on both sides');
});

test('the ground is one surface: every shared border has the same height at every corner and between them', { skip }, () => {
    for (let k = 0; k + 1 < IDS.length; k++) {
        const west = load(IDS[k]), east = load(IDS[k + 1]);
        const a = R.terrainOf(west), b = R.terrainOf(east), stride = W + 1;
        for (let z = 0; z <= H; z++) {
            assert.equal(a[z * stride + W], b[z * stride], `maps ${west.id}/${east.id}: corner ${z} of the border`);
        }
        for (let z = 0; z < H; z += 0.25) {
            assert.equal(R.terrainHeightAt(west, W, z), R.terrainHeightAt(east, 0, z), `maps ${west.id}/${east.id}: height at ${z} along the border`);
            // Where a character stands as it crosses: a hair inside each map.
            assert.ok(Math.abs(R.groundHeightAt(west, W - 1e-7, z + 0.1) - R.groundHeightAt(east, 1e-7, z + 0.1)) < 1e-5, `maps ${west.id}/${east.id}: the ground at row ${z}`);
        }
        // No ridge or trench was drawn along the border itself: the ground leans the same way on both sides of it.
        let worst = 0;
        for (let z = 0; z <= H; z++) {
            const before = a[z * stride + W] - a[z * stride + W - 1], after = b[z * stride + 1] - b[z * stride];
            worst = Math.max(worst, Math.abs(after - before));
        }
        assert.ok(worst < 0.9, `maps ${west.id}/${east.id}: the slope changes by ${worst.toFixed(2)} across the border`);
    }
});

test('the same ground types on every map, and the road and the paint beside it carry across each border', { skip }, () => {
    const look = map => Ground.types(map).map(({ paint, ...rest }) => rest);
    const first = look(load(IDS[0]));
    assert.ok(first.some(type => type.name === 'Road' && type.bare === true), 'the road is a ground type nothing grows on');
    // Steep ground is the room's cliff rock; no ground is painted down the hillsides.
    assert.ok(!first.some(type => /scree|gravel/i.test(type.name + type.material)), 'no scree');
    for (const id of IDS) {
        assert.deepEqual(look(load(id)), first, `map ${id} has the types of map ${IDS[0]}, in their order`);
        for (const material of Ground.materials(load(id))) assert.ok(fs.existsSync(path.join(root, 'template', 'Demo', 'img', 'materials', material + '.png')), `${material}.png exists`);
    }
    for (let k = 0; k + 1 < IDS.length; k++) {
        const west = load(IDS[k]), east = load(IDS[k + 1]);
        const a = roadOf(west).columns[W - 1], b = roadOf(east).columns[0];
        assert.ok(a && b, `maps ${west.id}/${east.id}: the road reaches the border on both sides`);
        assert.ok(Math.abs(a.centre - b.centre) <= 1, `maps ${west.id}/${east.id}: the road's centre is at row ${a.centre} and ${b.centre}`);
        assert.ok(Math.abs((a.hi - a.lo) - (b.hi - b.lo)) <= 1, 'and as wide');
        // Every type: the two columns that touch at the border differ no more than two columns side by
        // side do anywhere near it (scree follows the slope, so it is patchy inside a map as well).
        const sharp = (left, lx, right, rx) => { let n = 0; for (let z = 0; z < H; z++) if (Math.abs(left[z * W + lx] - right[z * W + rx]) > 4) n++; return n; };
        for (const type of first) {
            const left = paintOf(west, type.name), right = paintOf(east, type.name);
            let inside = 0;
            for (let x = 0; x < 12; x++) inside = Math.max(inside, sharp(left, W - 2 - x, left, W - 1 - x), sharp(right, x, right, x + 1));
            const apart = sharp(left, W - 1, right, 0);
            assert.ok(apart <= inside + 2, `maps ${west.id}/${east.id}: ${type.name} differs sharply on ${apart} rows of the border, ${inside} between columns beside it`);
        }
    }
});

test('the road runs the length of every map, about five tiles wide, gentle along it and level across', { skip }, () => {
    IDS.forEach((id, k) => {
        const map = load(id), road = roadOf(map), end = k === IDS.length - 1 ? road.last[0] : W;
        if (k === IDS.length - 1) {
            assert.ok(road.columns[0], 'the lake\'s road comes in from the west border');
            assert.ok(end > 90 && end < W - 12, `the road ends at a lookout short of the east border (column ${end})`);
            const paving = paintOf(map, 'Paving');
            assert.ok(paving[Math.floor(road.last[1]) * W + Math.floor(end) + 2] >= 5, 'the lookout is paved past the road\'s end');
        }
        let steepest = 0, tilt = 0, verge = 0;
        for (let x = 0; x < Math.floor(end); x++) {
            const column = road.columns[x];
            assert.ok(column, `map ${id}: column ${x} has road`);
            const rows = column.hi - column.lo + 1;
            assert.ok(rows >= 4 && rows <= 9, `map ${id}: the road covers ${rows} rows of column ${x}`);
            const next = road.columns[x + 1];
            if (!next) continue;
            assert.ok(Math.abs(next.centre - column.centre) <= 1.5, `map ${id}: the road jumps at column ${x}`);
            // Along it: the rise from one column's centre to the next, over the distance travelled.
            const ax = x + 0.5, bx = x + 1.5, run = Math.hypot(1, next.centre - column.centre);
            const rise = Math.abs(R.groundHeightAt(map, bx, next.centre) - R.groundHeightAt(map, ax, column.centre));
            steepest = Math.max(steepest, rise / run);
            // Across it: square to its run, at the road's edges and the verge's.
            const line = road.lineAt(x), nx = -line.dz, nz = line.dx, here = R.groundHeightAt(map, line.x, line.z);
            for (const side of [-1, 1]) {
                const edge = [line.x + nx * side * (ROAD_HALF - SLACK), line.z + nz * side * (ROAD_HALF - SLACK)];
                const outer = [line.x + nx * side * (ROAD_HALF + VERGE - SLACK), line.z + nz * side * (ROAD_HALF + VERGE - SLACK)];
                if (edge[0] >= 0 && edge[0] <= W) tilt = Math.max(tilt, Math.abs(R.groundHeightAt(map, edge[0], edge[1]) - here));
                // (Forest Road's first tiles are North Haven's pass, cut narrow through its range: the verge widens to its two tiles by column 20.)
                if (outer[0] >= (k === 0 ? 20 : 0) && outer[0] <= W) verge = Math.max(verge, Math.abs(R.groundHeightAt(map, outer[0], outer[1]) - here));
            }
        }
        // Grass everywhere it grows: no band along the road with bare meadow past it.
        {
            const grass = (Foliage.foliage(map).layers || []).find(layer => layer.kind === 'grass');
            const density = Foliage.decode(grass.density, W * H);
            let far = 0, grown = 0;
            for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
                if (road.distance(x + 0.5, z + 0.5) < 40 || E.waterAt(map, x, z)) continue;
                const hx = R.terrainHeightAt(map, x + 1, z + 0.5) - R.terrainHeightAt(map, x, z + 0.5), hz = R.terrainHeightAt(map, x + 0.5, z + 1) - R.terrainHeightAt(map, x + 0.5, z);
                if (Math.hypot(hx, hz) > 0.7) continue;
                far++; if (density[z * W + x]) grown++;
            }
            assert.ok(far === 0 || grown / far > 0.9, `map ${id}: grass on ${grown} of ${far} cells of open ground far from the road`);
            assert.ok(Foliage.stats(map).layers.reduce((sum, layer) => sum + layer.clumps, 0) <= 62000, `map ${id}: clumps`);
        }
        // A vehicle refuses a rise of more than its step (0.75) and ground too steep to walk (0.75 a tile): far under both.
        if (process.env.RR_OPEN_ROAD_NUMBERS) console.log(`map ${id}: steepest ${steepest.toFixed(3)}, across ${tilt.toFixed(3)}, verge ${verge.toFixed(3)}`);
        assert.ok(steepest <= 0.25, `map ${id}: the road rises ${steepest.toFixed(3)} a tile at its steepest`);
        assert.ok(tilt <= 0.12, `map ${id}: the road leans ${tilt.toFixed(3)} across`);
        assert.ok(verge <= 0.2, `map ${id}: the verge stands ${verge.toFixed(3)} off the road's level`);
        // No step between any two road or verge cells: a walker's rule, asked cell by cell.
        for (let z = 0; z < H; z++) for (let x = 0; x + 1 < W; x++) {
            if (road.distance(x + 0.5, z + 0.5) > (k === 0 && x < 20 ? ROAD_HALF + 0.4 : ROAD_HALF + VERGE - 0.5)) continue;
            assert.equal(R.terrainBlocks(map, x, z, x + 1, z), false, `map ${id}: a step at ${x},${z} going east`);
            if (z + 1 < H) assert.equal(R.terrainBlocks(map, x, z, x, z + 1), false, `map ${id}: a step at ${x},${z} going south`);
        }
    });
});

test('nothing solid within three tiles of the road\'s edge, no water on the road or its verge, nothing at a linked border', { skip }, () => {
    // What a pine (Tree-01) blocks, as the game measures the model: its root flare.
    const body = prop => 0.13 * prop.size;
    IDS.forEach(id => {
        const map = load(id), road = roadOf(map), least = ROAD_HALF + CLEAR - SLACK;
        const props = E.props(map), pieces = E.pieces(map), bushes = Foliage.bushes(map);
        assert.ok(props.length <= 60, `map ${id}: ${props.length} placed models`);
        assert.ok(pieces.filter(piece => piece.kind === 'rock').length <= 40, `map ${id}: rocks`);
        // Boulders, not blocks: their own top (no grass lid), wider than tall.
        for (const rock of pieces.filter(piece => piece.kind === 'rock')) {
            assert.equal(rock.cap, undefined, `map ${id}: the rock at ${rock.x},${rock.y} has no lid`);
            assert.ok(rock.size[1] <= 3.5 && rock.size[1] <= Math.max(rock.size[0], rock.size[2]), `map ${id}: the rock at ${rock.x},${rock.y} is ${rock.size.join(' x ')}`);
        }
        assert.ok(props.every(prop => prop.file === 'Tree-01'), `map ${id}: pines only`);
        assert.ok(pieces.every(piece => piece.kind === 'rock' || piece.kind === 'box'), `map ${id}: no buildings`);
        for (const prop of props) {
            assert.ok(fs.existsSync(path.join(root, 'template', 'Demo', R.modelUrl(prop.name, prop.ext, prop.file))), `${prop.name} is in the Demo`);
            const d = road.distance(prop.x, prop.y) - body(prop);
            assert.ok(d >= least, `map ${id}: the tree at ${prop.x},${prop.y} reaches ${d.toFixed(2)} from the road's centre`);
            assert.ok(prop.x - body(prop) >= 4 - SLACK && prop.x + body(prop) <= W - 4 + SLACK, `map ${id}: the tree at ${prop.x},${prop.y} stands at the border`);
        }
        for (const piece of pieces) {
            const reach = Math.max(piece.size[0], piece.size[2]) / 2;
            const d = road.distance(piece.x + 0.5, piece.y + 0.5) - reach;
            assert.ok(d >= least, `map ${id}: the ${piece.kind} at ${piece.x},${piece.y} reaches ${d.toFixed(2)} from the road's centre`);
            assert.ok(piece.x + 0.5 - reach >= 4 && piece.x + 0.5 + reach <= W - 4, `map ${id}: the ${piece.kind} at ${piece.x},${piece.y} stands at the border`);
        }
        for (const bush of bushes) {
            const d = road.distance(bush.x, bush.y) - bush.size / 2;
            assert.ok(d >= least, `map ${id}: the bush at ${bush.x},${bush.y} reaches ${d.toFixed(2)} from the road's centre`);
            assert.ok(bush.x - bush.size / 2 >= 4 && bush.x + bush.size / 2 <= W - 4, `map ${id}: the bush at ${bush.x},${bush.y} stands at the border`);
        }
        for (const sheet of E.water(map)) for (let z = sheet.y0; z <= sheet.y1; z++) for (let x = sheet.x0; x <= sheet.x1; x++) {
            if (!E.waterCovers(sheet, x, z)) continue;
            const d = road.distance(x + 0.5, z + 0.5);
            assert.ok(d >= ROAD_HALF + VERGE + 1, `map ${id}: water at ${x},${z}, ${d.toFixed(2)} from the road's centre`);
        }
        // Nothing grows on the road.
        const foliage = Foliage.foliage(map);
        for (const layer of foliage.layers || []) {
            const density = Foliage.decode(layer.density, W * H);
            for (let i = 0; i < W * H; i++) if (density[i] && road.levels[i] >= 5) assert.fail(`map ${id}: ${layer.kind} painted on the road at ${i % W},${Math.floor(i / W)}`);
        }
    });
});

test('Forest Road has the motorcycle beside the road, the Reactor Room leads to it and it leads back', { skip }, () => {
    const forest = load(IDS[0]), room = json('Map001.json'), types = json('ReactorVehicles.json');
    const road = roadOf(forest);
    const bikes = forest.events.filter(event => event && event.rrVehicle);
    assert.equal(bikes.length, 1, 'one vehicle on Forest Road');
    const bike = bikes[0];
    assert.equal(types[bike.rrVehicle.type] && types[bike.rrVehicle.type].kind, 'motorcycle');
    assert.equal(bike.rrVehicle.yaw, 90, 'it faces east, down the road');
    assert.ok(bike.rrVehicle.key && bike.rrVehicle.key !== 'north-haven-motorcycle', 'under a name of its own');
    assert.ok(bike.x < W / 2, 'in the west half, where the pass has come down into the woods');
    const beside = road.distance(bike.x + 0.5, bike.y + 0.5);
    assert.ok(beside > ROAD_HALF && beside < ROAD_HALF + VERGE, `parked on the verge (${beside.toFixed(2)} from the road's centre)`);

    const transfer = event => (event.pages[0].list.find(command => command.code === 201) || {}).parameters;
    const way = room.events.find(event => event && event.name === 'Open Road');
    assert.ok(way, 'the Reactor Room has the Open Road entrance');
    // (Where in the room it stands is the room's own layout: it is there, and nothing else is on its tile.)
    assert.ok(room.events.every(event => !event || event === way || event.x !== way.x || event.y !== way.y), 'on a tile of its own');
    const to = transfer(way);
    assert.deepEqual(to.slice(0, 2), [0, IDS[0]], 'it transfers to Forest Road');
    // Within the reach Confirm boards from, and on the road's side of the bike.
    assert.ok(Math.max(Math.abs(to[2] - bike.x), Math.abs(to[3] - bike.y)) === 1, `the party arrives beside the motorcycle (${to[2]},${to[3]})`);
    assert.ok(road.distance(to[2] + 0.5, to[3] + 0.5) < beside, 'between the motorcycle and the road');
    assert.ok(R.eventModelSpec({ reactor3d: json('Map001.r3d.json') }, way.id, 0), 'and stands as a model in the room');

    const back = forest.events.find(event => event && !event.rrVehicle && transfer(event));
    assert.ok(back, 'Forest Road has the way back');
    const home = transfer(back);
    assert.deepEqual(home.slice(0, 2), [0, 1], 'to the Reactor Room');
    assert.ok(home[2] >= 0 && home[3] >= 0 && home[2] < room.width && home[3] < room.height);
    assert.ok(room.events.every(event => !event || event.x !== home[2] || event.y !== home[3]), 'onto a free tile');
    assert.ok(road.distance(back.x + 0.5, back.y + 0.5) > ROAD_HALF + VERGE, 'off the road and its verge, so riding past does not leave the map');
    assert.ok(paintOf(forest, 'Paving')[back.y * W + back.x] >= 5, 'on its paved pad');
});

test('the motorcycle rides North Haven\'s pass from the end of the village lane to the border, never refused', { skip: skip || (!hasDemo && 'the Demo is not on disk') }, () => {
    const haven = load(HAVEN), road = roadOf(haven), first = road.points[0][0], goal = haven.width - 3.8;
    assert.ok(first < haven.width - 25, `the road starts well inside the village's valley (column ${first})`);
    // The pass is cut at a grade the motorcycle takes, level across.
    let steepest = 0;
    for (let i = 0; i + 1 < road.points.length; i++) {
        const [ax, az] = road.points[i], [bx, bz] = road.points[i + 1];
        steepest = Math.max(steepest, Math.abs(R.groundHeightAt(haven, bx, bz) - R.groundHeightAt(haven, ax, az)) / Math.hypot(bx - ax, bz - az));
    }
    assert.ok(steepest <= 0.3, `the pass rises ${steepest.toFixed(3)} a tile at its steepest`);
    const w = driveWorld({ data: dataDir, mapId: HAVEN, at: [first + 1.5, road.centreAt(first + 2) - 0.5], yaw: 90 });
    let frames = 0, off = 0, refused = 0;
    for (; frames < 1200; frames++) {
        const p = w.where();
        if (p.x >= goal) break;
        off = Math.max(off, road.distance(p.x, p.y));
        const ahead = Math.min(road.last[0], p.x + 3 + p.v * 0.35), aim = road.centreAt(ahead);
        let turn = Math.atan2(ahead - p.x, -(aim - p.y)) / DEG - p.yaw;
        while (turn > 180) turn -= 360;
        while (turn < -180) turn += 360;
        w.keys.left = turn < -2; w.keys.right = turn > 2; w.keys.up = p.v < 8;
        w.run(1);
        if (w.Drive.last.refused) refused++;
    }
    const p = w.where();
    assert.ok(p.x >= goal, `it reached ${p.x.toFixed(1)},${p.y.toFixed(1)} of ${goal.toFixed(1)} in ${frames} frames`);
    assert.equal(refused, 0, `refused on ${refused} ticks`);
    assert.ok(off < ROAD_HALF, `it stayed on the road (${off.toFixed(2)} from its centre at most)`);
    // Where it stops is the height Forest Road begins at: the same ground goes on past the border.
    const forest = load(IDS[0]), row = roadOf(forest).columns[0].centre;
    assert.equal(R.terrainHeightAt(haven, haven.width, row + HAVEN_SHIFT), R.terrainHeightAt(forest, 0, row));
});

test('the motorcycle rides the road from one end of every map to the other, never refused', { skip: skip || (!hasDemo && 'the Demo is not on disk') }, () => {
    IDS.forEach((id, k) => {
        const map = load(id), road = roadOf(map);
        const from = 3, goal = k === IDS.length - 1 ? road.last[0] - 3 : W - 3.8;
        const w = driveWorld({ data: dataDir, mapId: id, at: [from - 0.5, road.centreAt(from) - 0.5], yaw: 90 });
        let frames = 0, off = 0, refused = 0;
        for (; frames < 2400; frames++) {
            const p = w.where();
            if (p.x >= goal) break;
            off = Math.max(off, road.distance(p.x, p.y));
            // The rider: aims at the road's centre a few tiles ahead and keeps to a steady pace.
            const ahead = Math.min(road.last[0], p.x + 3 + p.v * 0.35), aim = road.centreAt(ahead);
            let turn = Math.atan2(ahead - p.x, -(aim - p.y)) / DEG - p.yaw;
            while (turn > 180) turn -= 360;
            while (turn < -180) turn += 360;
            w.keys.left = turn < -2; w.keys.right = turn > 2; w.keys.up = p.v < 9;
            w.run(1);
            if (w.Drive.last.refused) refused++;
        }
        const p = w.where();
        assert.ok(p.x >= goal, `map ${id}: it reached ${p.x.toFixed(1)},${p.y.toFixed(1)} of ${goal.toFixed(1)} in ${frames} frames`);
        assert.equal(refused, 0, `map ${id}: refused on ${refused} ticks`);
        assert.ok(off < ROAD_HALF, `map ${id}: it stayed on the road (${off.toFixed(2)} from its centre at most)`);
        assert.ok(Math.abs(p.alt - R.groundHeightAt(map, p.x, p.y)) < 0.5, `map ${id}: it is on the ground`);
    });
});
