'use strict';
// More of the Tactical field's rules (runtime/reactor_fight_tactical.js), each through the path the game takes: a
// long body on a slope, a figure a little larger than a tile, where a body with no room is put and what the battle
// says of it, whom the pointer meets by a hull, what shuts a cell under a body, and the keys and the view round
// them. The engine's real 3D runtime measures the models (helpers/fight-real-world.cjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');
const { realWorld } = require('./helpers/fight-real-world.cjs');

const repo = path.resolve(__dirname, '..', '..');
const W = 40, H = 30;
const unit = (id, x, y, text, extra = {}) => event(id, x, y, Object.assign({ note: `<unit: ${text}>` }, extra));
const rect = f => [f.ox, f.oy, f.w, f.h];
const hero = w => w.$gameFight._units.find(u => u.actorId === 1);
/** A world whose enemy 1 is a truck: a box `long` tiles long, two wide and `tall` high (four, and one and a half). */
function truckWorld(options = {}) {
    const w = realWorld(options), long = options.long || 4, tall = options.tall || 1.5;
    w.model('Vehicles/Truck', w.boxModel(long, tall, 2));
    w.Reactor3D._databaseSidecar = { enemies: { 1: { name: 'Vehicles/Truck', ext: '.glb', size: Math.max(long, tall), scale: 1, yaw: 0 } } };
    w.$dataEnemies[1].params[0] = 9000;
    return w;
}
function changed(w) {
    w.ReactorFight.forgetFootprints();
    if (w.ReactorPhysics && w.ReactorPhysics.forgetEdges) w.ReactorPhysics.forgetEdges(w.$dataMap);
}
/** Cells four tiles high (a wall), or any height given. */
function raise(w, cells, height = 4) {
    const side = w.$dataMap.reactor3d;
    if (!side.elevation) side.elevation = new Array(w.$dataMap.width * w.$dataMap.height).fill(0);
    for (const [x, y] of cells) side.elevation[y * w.$dataMap.width + x] = height;
    changed(w);
}
const row = (y, x0, x1) => { const out = []; for (let x = x0; x <= x1; x++) out.push([x, y]); return out; };
const column = (x, y0, y1) => { const out = []; for (let y = y0; y <= y1; y++) out.push([x, y]); return out; };
function begin(w, options = {}) {
    assert.ok(w.$gameFight.start(Object.assign({ mode: 'tactical' }, options)) > 0);
    w.run(90, () => w.$gameFight.awaitsPlayer());
    return w.$gameFight;
}
function body(w, u) {
    const c = w.$gameFight.character(u), f = w.ReactorFight.footprint(u), out = [];
    for (let y = c.y + f.oy; y < c.y + f.oy + f.h; y++) for (let x = c.x + f.ox; x < c.x + f.ox + f.w; x++) out.push([x, y]);
    return out;
}
function silently(run) {
    const quiet = console.info, said = [];
    console.info = line => said.push(String(line));
    try { run(said); } finally { console.info = quiet; }
    return said;
}

//-----------------------------------------------------------------------------
// A long body on a slope.

test('a long body lies along a gentle slope and drives there as on the flat; on a steep one it keeps across the slope, no end of it hanging in the air; a step under it still stops it', () => {
    const reach = (rise, step, tall) => {
        const w = truckWorld({ long: 8, tall, events: [unit(1, 20, 12, 'enemy 1 move 6'), unit(2, 36, 26, 'enemy 2')], start: [4, 12] });
        const side = w.$dataMap.reactor3d;
        side.elevation = new Array(W * H).fill(0);
        // The whole map rises `rise` a tile toward the east; `step` adds a ledge one tile high from column 24 on.
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) side.elevation[y * W + x] = +(x * rise + (step && x >= 24 ? 1 : 0)).toFixed(3);
        changed(w);
        const fight = begin(w), F = w.ReactorFight, G = F.Grid, truck = fight.unitOfEvent(1), c = fight.character(truck);
        const out = { placed: Array.from(fight.placements(), entry => ({ moved: entry.moved, stays: entry.stays })), at: [c.x, c.y], facing: c.direction(),
            fits: G.fitsAt(fight, truck, c.x, c.y, c.direction(), G.heightOf(c)), long: Math.max(F.footprint(truck).w, F.footprint(truck).h),
            lean: Math.max(0.75, F.unitHeight(truck) * F.BODY_LEAN), along: G.fitsAt(fight, truck, 20, 12, 2, side.elevation[12 * W + 20]) };
        out.truck = G.flood(fight, truck, 6);
        out.east = G.costAt(23, 12);
        out.over = G.costAt(25, 12);
        // How far the ground under any cell of it is from the ground under its own, over every place it can drive to.
        out.off = 0;
        const levels = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (!G.reachedAt(x, y, levels)) continue;
            const f = F.footprintFacing(truck, G.facingAt(x, y) || c.direction()), x0 = x + f.ox, x1 = x0 + f.w;
            for (let bx = x0; bx < x1; bx++) out.off = Math.max(out.off, Math.abs(side.elevation[y * W + bx] - side.elevation[y * W + x]));
        }
        out.man = G.flood(fight, hero(w), 6);
        return out;
    };
    const flat = reach(0, false);
    assert.equal(flat.long, 9, 'a body nine cells long, lying east to west as it faces down');
    // A gentle slope: its ends are a third of a tile off the ground it stands on. It stays, and drives as on the flat.
    const gentle = reach(0.08, false);
    assert.deepEqual(gentle.placed, [], 'rising 0.08 a tile: it is not put anywhere else');
    assert.deepEqual(gentle.at, [20, 12]);
    assert.equal(gentle.fits, true);
    assert.equal(gentle.truck, flat.truck, `it reaches the cells it reaches on the flat (${gentle.truck} of ${flat.truck})`);
    assert.ok(gentle.man >= flat.man - 2, 'as a man does');
    // A steep one a man walks (0.3 a tile): along it its ends would be more than a tile off the ground. It is turned
    // across the slope where it stands, and wherever it drives no cell under it is further off than it leans.
    const steep = reach(0.3, false);
    assert.equal(steep.lean, 0.75, 'a low hull leans a walker\'s step');
    assert.equal(steep.along, false, 'along the slope it has no room');
    assert.deepEqual(steep.placed, [{ moved: false, stays: false }], 'it is turned on its tile, not sent away');
    assert.deepEqual(steep.at, [20, 12]);
    assert.ok(steep.facing === 4 || steep.facing === 6, `across the slope (${steep.facing})`);
    assert.equal(steep.fits, true);
    assert.ok(steep.off <= steep.lean + 1e-6, `no end of it more than ${steep.lean} off the ground (${steep.off})`);
    assert.ok(steep.truck > 3 && steep.truck < flat.truck, `it drives along the hillside (${steep.truck} of ${flat.truck} cells)`);
    assert.ok(steep.man >= flat.man - 2, 'a man walks the slope freely');
    // A taller hull leans further (a quarter of its height): four tiles tall, it lies along 0.2 a tile, where the low one does not.
    const tall = reach(0.2, false, 4), low = reach(0.2, false);
    assert.equal(tall.lean, 1);
    assert.equal(tall.along, true);
    assert.deepEqual(tall.placed, []);
    assert.ok(tall.off <= 1 + 1e-6 && tall.off > 0.75, `it does lie along the slope somewhere (${tall.off})`);
    assert.equal(low.along, false);
    assert.ok(low.off <= 0.75 + 1e-6);
    // A ledge across its way: no cell of it goes up a step a walker does not take.
    const ledge = reach(0.05, true);
    assert.ok(ledge.east === Infinity || ledge.over === Infinity, 'its body is never across the ledge');
    assert.equal(ledge.over, Infinity, 'and it does not drive up it');
    assert.ok(ledge.truck < flat.truck);
});

test('a big body never lies on a cell that is no place to stand, wherever the unit itself is', () => {
    const w = truckWorld({ events: [unit(1, 10, 10, 'enemy 1 move 8'), unit(2, 36, 26, 'enemy 2')], start: [30, 22] });
    const fight = begin(w), F = w.ReactorFight, G = F.Grid, truck = fight.unitOfEvent(1), c = fight.character(truck);
    // The world says nobody stands on (14,11): a fountain's rim beside the truck's way east.
    G.standsAt = (x, y) => !(x === 14 && y === 11);
    G.forget();
    G.flood(fight, truck, 8);
    const out = [];
    let reached = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!G.reachedAt(x, y, out)) continue;
        reached++;
        const f = F.footprintFacing(truck, G.facingAt(x, y) || c.direction());
        assert.ok(!(14 >= x + f.ox && 14 < x + f.ox + f.w && 11 >= y + f.oy && 11 < y + f.oy + f.h), `standing at ${x},${y} its body would lie on the rim`);
    }
    assert.ok(reached > 10, 'it drives all the same');
    assert.equal(G.costAt(14, 10), Infinity, 'not along the row beside the rim');
});

//-----------------------------------------------------------------------------
// A figure a little larger than a tile.

const eagleFile = path.join(repo, 'template/Demo/3d/Actors/Jolt Eagle/source/Jolt Eagle.glb');
const tankFile = path.join(repo, 'template/Demo/3d/Vehicles/Oth97_CNO_Consul/source/Oth97_CNO_Consul.glb');

test('a figure a little larger than a tile stands on one cell whichever way it faces; a model wider than two tiles takes the cells under it', t => {
    // A box model as wide as given, one deep: 1.8 tiles is a figure, 2.6 a body.
    const sized = wide => {
        const w = realWorld({ events: [unit(1, 20, 12, 'enemy 1'), unit(2, 30, 20, 'enemy 2')] });
        w.model('Actors/Brute', w.boxModel(wide, 3.5, 1));
        w.Reactor3D._databaseSidecar = { enemies: { 1: { name: 'Actors/Brute', ext: '.glb', size: 3.5, scale: 1, yaw: 0 } } };
        const fight = begin(w), F = w.ReactorFight, brute = fight.unitOfEvent(1);
        return { F, fight, brute, rects: [2, 4, 6, 8].map(d => rect(F.footprintFacing(brute, d))), auto: w.Reactor3D.blockedTilesFor(w.Reactor3D._glbCache[w.Reactor3D.modelCacheKey('Actors/Brute', '.glb', '')].template, {}, w.Reactor3D.normalizeModelSpec({ name: 'Actors/Brute', ext: '.glb', size: 3.5, scale: 1 }), 2, 0, 0).length };
    };
    const figure = sized(1.8);
    assert.ok(figure.auto > 1, 'the map\'s own rule gives such a model more than its tile');
    for (const r of figure.rects) assert.deepEqual(r, [0, 0, 1, 1], 'one cell, every way it faces');
    assert.equal(figure.F.isBig(figure.brute), false);
    assert.equal(figure.F.turnsBody(figure.brute), false);
    assert.equal(figure.F.footprintSource(figure.brute), 'model');
    assert.equal(figure.fight.placements().length, 0, 'and nobody is moved for it');
    const wide = sized(2.6);
    assert.deepEqual(wide.rects[0], [-1, 0, 3, 1], 'wider than two tiles: three cells across when it faces down');
    assert.deepEqual(wide.rects[2], [0, -1, 1, 3], 'and down the map when it faces right');
    assert.equal(wide.F.isBig(wide.brute), true);
    // The Demo's own: the raider captain's model at its size is one cell, the tank is still seven by twelve.
    if (!fs.existsSync(eagleFile) || !fs.existsSync(tankFile)) return t.diagnostic('the Demo\'s models are not in this checkout');
    const w = realWorld({ events: [unit(1, 20, 12, 'enemy 1'), unit(2, 30, 20, 'enemy 2')] });
    w.model('Actors/Jolt Eagle', w.glb(eagleFile), '.glb', 'Jolt Eagle');
    const tank = { name: 'Vehicles/Oth97_CNO_Consul', file: 'Oth97_CNO_Consul', ext: '.glb', size: 15, scale: 1, yaw: 90 };
    w.model(tank.name, w.glb(tankFile), '.glb', tank.file);
    w.Reactor3D._databaseSidecar = { enemies: { 1: { name: 'Actors/Jolt Eagle', file: 'Jolt Eagle', ext: '.glb', size: 3.6, scale: 1, yaw: 0 }, 2: tank } };
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    const F = w.ReactorFight, captain = w.$gameFight.unitOfEvent(1), hull = w.$gameFight.unitOfEvent(2);
    for (const d of [2, 4, 6, 8]) assert.deepEqual(rect(F.footprintFacing(captain, d)), [0, 0, 1, 1], `the captain facing ${d}`);
    assert.deepEqual([F.footprintFacing(hull, 2).w, F.footprintFacing(hull, 2).h], [7, 12]);
    assert.deepEqual([F.footprintFacing(hull, 4).w, F.footprintFacing(hull, 4).h], [12, 7]);
});

test('on a flat map a figure is fitted to its cell with its ring and bar on it; a body of many cells is drawn as big as it is, framed, its bar over it', () => {
    const w = realWorld({ flat: true, events: [unit(1, 20, 12, 'enemy 1'), unit(2, 30, 20, 'enemy 2')] });
    const R = w.Reactor3D, F = w.ReactorFight, U = F.UnitMarks;
    w.model('Actors/Brute', w.boxModel(1.8, 3.5, 1));
    // A hull four long and four tall: fitted like a figure it would be drawn at little more than half its size.
    w.model('Vehicles/Truck', w.boxModel(4, 4, 2));
    R._databaseSidecar = { enemies: { 1: { name: 'Actors/Brute', ext: '.glb', size: 3.5, scale: 1 }, 2: { name: 'Vehicles/Truck', ext: '.glb', size: 4, scale: 1 } } };
    const fight = begin(w), brute = fight.unitOfEvent(1), truck = fight.unitOfEvent(2);
    const bruteEvent = w.$gameMap.event(1), truckEvent = w.$gameMap.event(2);
    for (let i = 0; i < 60; i++) { F.flatFit(bruteEvent); F.flatFit(truckEvent); }
    assert.equal(F.isBig(brute), false);
    const fit = F.flatFit(bruteEvent);
    assert.ok(fit < 0.75 && (3.5 * F.FLAT_PITCH + F.FLAT_MARGIN) * fit <= F.FLAT_TALL + 0.01, `the figure is drawn no taller than a cell and a half (${fit})`);
    assert.equal(F.isBig(truck), true);
    assert.equal(F.flatFit(truckEvent), 1, 'the hull is as big as it is, however tall');
    U.collect(fight);
    const at = u => { const c = fight.character(u), f = F.footprint(u); for (let i = 0; i < U.count; i++) if (Math.abs(U.x[i] - (c.x + f.ox + f.w / 2)) < 0.01 && Math.abs(U.y[i] - (c.y + f.oy + f.h / 2)) < 0.01) return i; return -1; };
    const iBrute = at(brute), iTruck = at(truck);
    assert.ok(iBrute >= 0 && iTruck >= 0);
    assert.deepEqual([U.x[iBrute], U.y[iBrute], U.w[iBrute], U.d[iBrute]], [20.5, 12.5, 1, 1], 'the figure\'s ring is on its own cell');
    assert.equal(U.tall[iBrute], F.FLAT_TALL);
    assert.ok(U.w[iTruck] > 1 || U.d[iTruck] > 1);
    assert.equal(U.tall[iTruck], 4, 'the hull is as tall as its model');
    // The bars, in rows from each unit's own: the figure's over its fitted picture, the hull's over its far edge by
    // what its rim shows from the map's pitch (its body reaches one row up from its own).
    assert.ok(Math.abs(U.bar[iBrute] - (1 - F.FLAT_TALL)) < 1e-6);
    const rise = 4 * F.FLAT_PITCH;
    assert.ok(Math.abs(U.bar[iTruck] - Math.min(F.footprint(truck).oy - rise * F.BODY_RIM, 0.5 - rise)) < 1e-6);
    assert.ok(U.bar[iTruck] < F.footprint(truck).oy && U.bar[iTruck] > -4, `over the hull, not a model's height over its own row (${U.bar[iTruck]})`);
});

//-----------------------------------------------------------------------------
// Where a body with no room is put, and what the battle says.

test('a body with no room is put on the nearest place it can get to the fight from, not into a closed yard that happens to be nearer', () => {
    silently(said => {
        // The truck was put across a wall (column 16). West of it a yard closed on every side, east of it the open
        // field where the party stands. The yard is a step nearer.
        const w = truckWorld({ events: [unit(1, 15, 12, 'enemy 1 move 5'), unit(2, 36, 26, 'enemy 2')], start: [28, 12] });
        const yard = column(16, 6, 18).concat(column(8, 6, 18), row(6, 8, 16), row(18, 8, 16));
        raise(w, yard);
        const fight = begin(w), F = w.ReactorFight, truck = fight.unitOfEvent(1), c = fight.character(truck);
        const mine = Array.from(fight.placements()).find(entry => entry.unitId === truck.id);
        assert.ok(mine && mine.moved, 'it was moved');
        assert.ok(c.x > 16, `out to the field (${c.x},${c.y}), not into the yard`);
        for (const [x, y] of body(w, truck)) assert.ok(!(w.$dataMap.reactor3d.elevation[y * W + x] > 0), `${x},${y} is no wall`);
        assert.ok(Math.max(Math.abs(c.x - 15), Math.abs(c.y - 12)) <= F.SETTLE_REACH, 'and no further than a body may be moved');
        // The yard is nearer: with nobody to get to, that is where it would stand.
        assert.ok(said.some(line => line.includes('had no room at 15,12') && line.includes('stands at')));
        // The banner tells the player once the battle is theirs, in the battle's own words.
        assert.equal(fight.notice(), F.FIELD_TERMS.unitPlaced.replace('%1', 'Slime'));
        // A project's own words win.
        assert.equal(F.FIELD_TERMS.unitPlaced.includes('%1'), true);
    });
    // The same map with nobody to fight: the nearest place, the yard.
    silently(() => {
        const w = truckWorld({ events: [unit(1, 15, 12, 'neutral'), unit(2, 36, 26, 'enemy 2')], start: [28, 12] });
        w.Reactor3D._databaseSidecar.events = undefined;
        // A bystander wears the truck through its own model on the map.
        w.$dataMap.reactor3d.events = { 1: { 0: { name: 'Vehicles/Truck', ext: '.glb', size: 4, scale: 1, yaw: 0 } } };
        raise(w, column(16, 6, 18).concat(column(8, 6, 18), row(6, 8, 16), row(18, 8, 16)));
        const fight = begin(w), cart = fight.unitOfEvent(1), c = fight.character(cart);
        assert.ok(c.x < 16, `the nearest place it fits (${c.x},${c.y})`);
    });
});

test('a body that fits nowhere near stays where it was put and the battle says so once; one that only had to turn is said to have been turned', () => {
    const said = silently(() => {
        // Walls all round where it was put, further than a body may be moved.
        const w = truckWorld({ events: [unit(1, 20, 15, 'enemy 1'), unit(2, 36, 26, 'enemy 2')], start: [4, 4] });
        const all = [];
        for (let y = 2; y < H - 2; y++) for (let x = 8; x <= 32; x++) if (y !== 15) all.push([x, y]);
        raise(w, all);
        const fight = begin(w), F = w.ReactorFight, truck = fight.unitOfEvent(1), c = fight.character(truck);
        assert.deepEqual([c.x, c.y], [20, 15], 'it stays');
        const entries = Array.from(fight.placements()).filter(entry => entry.unitId === truck.id);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].stays, true);
        assert.equal(entries[0].moved, false);
        assert.deepEqual({ ...entries[0].to }, { x: 20, y: 15 });
        assert.equal(fight.notice(), F.FIELD_TERMS.unitNoRoom.replace('%1', 'Slime'), 'and the banner says it has no room');
        // Looked at again and again, it is said once.
        F.settle(fight); F.settle(fight);
        assert.equal(Array.from(fight.placements()).filter(entry => entry.unitId === truck.id).length, 1);
    });
    assert.equal(said.filter(line => line.includes('stays where it was put')).length, 1);
    const turned = silently(() => {
        // A street three wide running north to south: put across it, the truck fits only turned along it.
        const w = truckWorld({ events: [unit(1, 20, 15, 'enemy 1'), unit(2, 36, 26, 'enemy 2')], start: [20, 26] });
        raise(w, column(18, 2, 27).concat(column(22, 2, 27)));
        const fight = begin(w), F = w.ReactorFight, truck = fight.unitOfEvent(1), c = fight.character(truck);
        assert.deepEqual([c.x, c.y], [20, 15], 'on its own tile');
        assert.ok(c.direction() === 4 || c.direction() === 6, 'turned along the street');
        const entry = Array.from(fight.placements()).find(each => each.unitId === truck.id);
        assert.ok(entry && !entry.moved && !entry.stays);
        assert.equal(fight.notice(), '', 'nothing on the banner for a turn');
        assert.equal(F.FIELD_TERMS.unitNoRoom.length > 0, true);
    });
    assert.ok(turned.some(line => line.includes('was turned')), 'the console says turned, not moved to its own tile');
    assert.equal(turned.some(line => line.includes('stands at 20,15')), false);
});

test('as a battle begins a hull keeps the place its author gave it and whoever of one cell stands under it steps aside; a hull that joins later finds room among them', () => {
    silently(() => {
        // A bat under the truck's corner and the party's second member under its other end: authored that way.
        const w = truckWorld({ events: [unit(1, 20, 12, 'enemy 1'), unit(2, 22, 13, 'enemy 2')], start: [19, 11] });
        w.$gamePlayer.followers().synchronize(18, 12, 2);
        const fight = begin(w), F = w.ReactorFight, truck = fight.unitOfEvent(1), bat = fight.unitOfEvent(2), c = fight.character(truck);
        assert.deepEqual([c.x, c.y], [20, 12], 'the truck is where it was put');
        const said = Array.from(fight.placements());
        assert.equal(said.some(entry => entry.unitId === truck.id), false, 'and nothing is said of it');
        const bc = fight.character(bat);
        assert.notDeepEqual([bc.x, bc.y], [22, 13], 'the bat stepped aside');
        assert.ok(said.some(entry => entry.unitId === bat.id && entry.moved && entry.reason.includes('another unit')));
        for (const other of fight._units) {
            if (other === truck) continue;
            const oc = fight.character(other);
            assert.equal(F.covers(truck, c.x, c.y, oc.x, oc.y), false, `unit ${other.id} at ${oc.x},${oc.y} is outside its body`);
        }
        assert.equal(fight.notice(), '', 'no banner for someone who stepped aside');
        // Later a second truck is called in on top of the bat: the newcomer takes room beside it, the bat stays.
        const before = [bc.x, bc.y];
        const joined = fight.spawn({ record: 'enemy', id: 1, x: bc.x, y: bc.y });
        assert.ok(joined);
        assert.deepEqual([fight.character(bat).x, fight.character(bat).y], before, 'whoever was there keeps its cell');
        const jc = fight.character(joined);
        assert.equal(F.covers(joined, jc.x, jc.y, before[0], before[1]), false, 'the newcomer is not over it');
        for (const [x, y] of body(w, joined)) assert.equal(fight.unitAt(x, y, joined), null, `nobody under the newcomer at ${x},${y}`);
    });
});

test('a body with its tail in a wall is put a step forward facing as it faced, not turned round on its tile', () => {
    silently(() => {
        // The truck faces down, four long across the map: its right end is in a wall one cell deep. A step west it
        // fits as it faces; turned on its tile it would fit too.
        const w = truckWorld({ events: [unit(1, 20, 12, 'enemy 1'), unit(2, 36, 26, 'enemy 2')], start: [28, 20] });
        raise(w, column(22, 11, 13));
        const fight = begin(w), truck = fight.unitOfEvent(1), c = fight.character(truck);
        const mine = Array.from(fight.placements()).find(entry => entry.unitId === truck.id);
        assert.ok(mine && mine.moved, 'it was moved');
        assert.equal(c.direction(), 2, 'facing as its author had it');
        assert.deepEqual([c.x, c.y], [19, 12], 'one step out of the wall');
    });
});

test('a body put with a corner over a drop is put beside it on the floor its own cell is on, however deep the drop', () => {
    silently(() => {
        // A terrace three tiles high with two pits in it (the ground far below): one under the truck's corner, one
        // where its tail would lie if it turned.
        const w = truckWorld({ events: [unit(1, 20, 12, 'enemy 1'), unit(2, 36, 26, 'enemy 2')], start: [28, 12] });
        const all = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!(x === 22 && y === 13) && !(x === 20 && y === 14)) all.push([x, y]);
        raise(w, all, 3);
        const fight = begin(w), F = w.ReactorFight, G = F.Grid, truck = fight.unitOfEvent(1), c = fight.character(truck);
        const mine = Array.from(fight.placements()).find(entry => entry.unitId === truck.id);
        assert.ok(mine && mine.moved, 'it was moved, not left over the pit');
        assert.ok(Math.abs(c.x - 20) + Math.abs(c.y - 12) <= 2, `a step aside (${c.x},${c.y})`);
        assert.equal(G.heightOf(c), 3, 'on the terrace it stood on');
        for (const [x, y] of body(w, truck)) assert.equal(w.$dataMap.reactor3d.elevation[y * W + x], 3, `${x},${y} under it is terrace`);
    });
});

test('a big unit that joins where it has no room is put where it has, and a thing with a body that is no unit shuts every cell under it', () => {
    silently(() => {
        const cart = { name: 'Vehicles/Truck', ext: '.glb', size: 4, scale: 1, yaw: 0 };
        const w = truckWorld({ events: [unit(2, 36, 26, 'enemy 2'), event(5, 12, 20)], sidecar: { events: { 5: { 0: cart } } }, start: [4, 4] });
        raise(w, column(24, 4, 16));
        const fight = begin(w), F = w.ReactorFight, G = F.Grid;
        // The cart (an event that stands as a model and is no unit) is in the way on all its cells.
        G.flood(fight, hero(w), 40);
        const cells = [];
        for (let y = 19; y <= 21; y++) for (let x = 10; x <= 14; x++) cells.push([x, y]);
        for (const [x, y] of cells) assert.equal(G.costAt(x, y), Infinity, `${x},${y} under the cart`);
        assert.ok(G.costAt(12, 18) < Infinity && G.costAt(15, 20) < Infinity, 'the ground round it is walked');
        // Reinforcements: a truck called in with its tail in the wall.
        const joined = fight.spawn({ record: 'enemy', id: 1, x: 23, y: 10 });
        assert.ok(joined);
        const c = fight.character(joined);
        for (const [x, y] of body(w, joined)) assert.ok(!(w.$dataMap.reactor3d.elevation[y * W + x] > 0), `${x},${y} under it is no wall (it stands at ${c.x},${c.y})`);
        assert.ok(Array.from(fight.placements()).some(entry => entry.unitId === joined.id && entry.from.x === 23 && entry.from.y === 10));
    });
});

//-----------------------------------------------------------------------------
// The pointer by a hull.

test('the pointer meets a hull where the hull is: low at its rim, as tall as it stands over its middle; the ground beside it and whoever stands behind its rim are not the hull', () => {
    // A hull four long, two wide and three tall facing down (its length across the map), and a bat a cell behind its end.
    const w = truckWorld({ tall: 3, events: [unit(1, 20, 12, 'enemy 1'), unit(2, 22, 14, 'enemy 2')], start: [4, 4] });
    const fight = begin(w), F = w.ReactorFight, In = F.Input, truck = fight.unitOfEvent(1), bat = fight.unitOfEvent(2), c = fight.character(truck);
    c.setDirection(2);
    assert.deepEqual(rect(F.footprint(truck)), [-2, -1, 5, 3]);
    assert.equal(F.unitHeight(truck), 3);
    const rim = F.rimOf(3);
    assert.ok(rim >= 0.6 && rim < 2, 'its rim is a share of its height');
    assert.equal(F.rimOf(1), 0.6, 'never less than a low thing has sides');
    // Straight down: on the hull (20.5 +/- 2 by 12.5 +/- 1), not on the half cell of its body's rectangle the mesh does not reach.
    assert.equal(In.unitOnRay(fight, 20.5, 20, 12.5, 0, -1, 0), truck);
    assert.equal(In.unitOnRay(fight, 18.7, 20, 12.5, 0, -1, 0), truck);
    assert.equal(In.unitOnRay(fight, 18.2, 20, 12.5, 0, -1, 0), null, 'the ground by its end: its cell, not its hull');
    assert.equal(In.unitOnRay(fight, 20.5, 20, 11.2, 0, -1, 0), null, 'the ground by its side');
    // Level rays from the west, over its rim: one along its middle meets it, one along its side passes over.
    assert.equal(In.unitOnRay(fight, 10, 2.5, 12.5, 1, 0, 0), truck, 'over the middle it is as tall as it stands');
    assert.equal(In.unitOnRay(fight, 10, 2.5, 13.2, 1, 0, 0), null, 'over its rim there is air');
    assert.equal(In.unitOnRay(fight, 10, 1.0, 13.2, 1, 0, 0), truck, 'under the rim\'s height it is hull');
    // The pointer on the bat behind its end: the line to the bat's chest passes over the hull's rim (and through the
    // rectangle of its cells at the height it stands).
    const dz = Math.SQRT1_2, dy = -Math.SQRT1_2;
    assert.equal(In.unitOnRay(fight, 22.3, 8, 7.3, 0, dy, dz), bat, 'whoever stands behind its low end is pointed at');
    // The same line over its middle comes down on the hull.
    assert.equal(In.unitOnRay(fight, 20.5, 8, 7.3, 0, dy, dz), truck);
});

test('pointing picks the unit before the ground at the stages a unit is chosen: through the pick itself, by the camera\'s ray', () => {
    const w = realWorld({ events: [unit(1, 10, 9, 'enemy 1'), unit(2, 30, 20, 'enemy 2')], start: [4, 4] });
    // A block four tiles high just north of the enemy: from the north the pointer's line to the enemy passes through it.
    raise(w, [[10, 8]]);
    const fight = begin(w), F = w.ReactorFight, In = F.Input, THREE = w.THREE, target = fight.unitOfEvent(1);
    const camera = new THREE.PerspectiveCamera(40, w.Graphics.width / w.Graphics.height, 0.1, 500);
    camera.position.set(10.5, 9, 1.5);
    camera.lookAt(10.5, 1, 9.5);
    camera.updateMatrixWorld(true);
    w.SceneManager._scene = { _spriteset: { _reactor3d: { camera } } };
    try {
        const cx = w.Graphics.width / 2, cy = w.Graphics.height / 2;
        const ground = w.Reactor3D.groundTileFromRay(w.$dataMap, camera.position, new THREE.Vector3(0, -8, 8).normalize());
        assert.ok(ground && !(ground.x === 10 && ground.y === 9), 'the ground the line meets first is not the enemy\'s cell');
        assert.equal(fight._act.stage, 'pick');
        const cell = In.pick(cx, cy);
        assert.ok(cell && cell.unit, 'the unit on the line is what is pointed at');
        assert.deepEqual([cell.x, cell.y], [10, 9]);
        assert.equal(fight.unitAt(cell.x, cell.y), target);
        // While a move is chosen the pointer is on the ground: the unit is not asked for first.
        assert.ok(fight.commandSelectUnit(hero(w).id));
        const moving = In.pick(cx, cy);
        assert.ok(!moving || !moving.unit);
    } finally {
        w.SceneManager._scene = null;
    }
});

//-----------------------------------------------------------------------------
// The view, the keys and the marks, through the calls the game makes.

const small = (options = {}) => fightWorld(Object.assign({ tactical: true }, options));
const kindsAt = (M, x, y) => { const out = []; for (let i = 0; i < M.count; i++) if (M.x[i] === x && M.y[i] === y) out.push(M.kind[i]); return out; };
/** A 3D world from a height per cell (the Tactical view's camera is recorded, nothing is drawn). */
function heights3D(w, top) {
    const h = (x, y) => (x >= 0 && y >= 0 && x < 20 && y < 15 ? top(Math.floor(x), Math.floor(y)) : 0);
    const asked = [];
    w.Reactor3D = {
        TERRAIN_SLOPE_LIMIT: 0.75, isMap3D: () => true,
        groundHeightAt: (map, wx, wz) => h(wx, wz),
        terrainBlocks: (map, x, y, x2, y2) => Math.abs(h(x2, y2) - h(x, y)) > 0.75,
        Camera: {
            currentState: () => (asked.length ? Object.assign({}, asked[asked.length - 1].state) : { mode: 'thirdPerson', focus: 'player', yaw: 0 }),
            change(state, frames) { asked.push({ state, frames }); },
            frameDistance: () => 30
        }
    };
    return asked;
}

test('while someone on the field speaks the view is on the speaker, and the player pointing anywhere ends a look at once', () => {
    const w = small({ events: [unit(1, 17, 12, 'enemy 1'), unit(2, 6, 2, 'enemy 2')] });
    w.$dataEnemies[1].name = 'Raider Captain';
    const fight = begin(w), V = w.ReactorFight.View, In = w.ReactorFight.Input;
    const middle = () => [w.$gameMap._displayX + (w.$gameMap.screenTileX() - 1) / 2, w.$gameMap._displayY + (w.$gameMap.screenTileY() - 1) / 2];
    w.run(40);
    const rest = middle();
    assert.equal(V.isVisiting(fight), false);
    // A message with the captain's name on it: the view's own update goes to where the captain stands.
    w.$gameMessage.setSpeakerName('Raider Captain');
    w.$gameMessage.add('Hold the line!');
    for (let i = 0; i < 40; i++) V.update(fight);
    assert.equal(V.isVisiting(fight), true, 'the view is away, on the speaker');
    const during = middle();
    assert.ok(during[0] > rest[0] + 0.5 || during[1] > rest[1] + 0.5, `toward the captain at 17,12 (${rest} -> ${during})`);
    // The message closes: the view comes back.
    w.$gameMessage.clear();
    for (let i = 0; i < 120; i++) V.update(fight);
    assert.equal(V.isVisiting(fight), false);
    assert.ok(Math.abs(middle()[0] - rest[0]) < 0.5, 'back where the battle looks');
    // Someone joins: the view goes there; an arrow key (the player pointing) ends it the same frame.
    V.visit(fight, 17, 12, 0, 200);
    assert.equal(V.isVisiting(fight), true);
    w.Input.isRepeated = name => name === 'right';
    In.update(fight);
    w.Input.isRepeated = () => false;
    assert.equal(V.isVisiting(fight), false, 'the cursor moved: the look is over');
    // The mouse likewise.
    V.visit(fight, 17, 12, 0, 200);
    w.TouchInput.x = 300; w.TouchInput.y = 200;
    In.update(fight);
    assert.equal(V.isVisiting(fight), false, 'the pointer moved: the look is over');
});

test('a unit that joins is looked at once: not by the view when a director\'s shot shows it, and a look runs out while a shot plays', () => {
    const w = small({ events: [unit(1, 6, 2, 'enemy 1')] });
    const fight = begin(w), F = w.ReactorFight, V = F.View;
    // No director: the view goes to the newcomer itself.
    assert.ok(fight.spawn({ record: 'enemy', id: 1, x: 17, y: 12 }));
    assert.equal(V.isVisiting(fight), true);
    V.endVisit();
    // A director plays a reveal of whoever joins: that is the look.
    F.Director = { shot: () => ({ name: 'reveal' }) };
    assert.ok(fight.spawn({ record: 'enemy', id: 1, x: 18, y: 12 }));
    assert.equal(V.isVisiting(fight), false, 'nobody is shown twice');
    // Any other shot is not a look at the newcomer.
    F.Director = { shot: () => ({ name: 'impact' }) };
    assert.ok(fight.spawn({ record: 'enemy', id: 1, x: 19, y: 12 }));
    assert.equal(V.isVisiting(fight), true);
    F.Director = null;
    // While a director has the camera the look's time runs: it does not start over when the camera comes back.
    V.visit(fight, 17, 12, 0, 30);
    V.suspend();
    for (let i = 0; i < 30; i++) V.update(fight);
    V.resume();
    assert.equal(V.isVisiting(fight), false);
});

test('the first view is chosen from where everyone stands once the bodies have been given room', () => {
    const w = small({ events: [unit(1, 15, 7, 'enemy 1')], mapSidecar: { eventSize: { 1: [3, 3] }, eventSizeAnchor: 'center' } });
    // A ledge a tile and a half high under the east side of where the big enemy was put: it has no room there.
    heights3D(w, (x, y) => (x === 16 && y >= 6 && y <= 8 ? 1.5 : 0));
    w.$gamePlayer.locate(9, 9);
    w.$gamePlayer.followers().synchronize(9, 9, 2);
    let fight = null;
    silently(() => { fight = begin(w); });
    const F = w.ReactorFight, big = fight.unitOfEvent(1), c = fight.character(big);
    assert.notDeepEqual([c.x, c.y], [15, 7], 'it was put elsewhere');
    // The middle of the box round everyone the opening shows: the party's cells and the enemy's own, as they stand now.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const u of fight._units) { const uc = fight.character(u); x0 = Math.min(x0, uc.x); x1 = Math.max(x1, uc.x + 1); y0 = Math.min(y0, uc.y); y1 = Math.max(y1, uc.y + 1); }
    const open = fight._tac.view.open || fight._tac.focus;
    w.run(2);
    assert.deepEqual([fight._tac.focus.x, fight._tac.focus.y], [(x0 + x1 - 1) / 2, (y0 + y1 - 1) / 2], 'the view rests on the middle of where they stand, not of where they were put');
    assert.ok(open);
    assert.equal(F.footprintSource(big), 'size');
});

test('what the other side reaches is marked only where someone could stand; a big unit under the cursor shows every cell of its body', () => {
    const w = small({ events: [unit(1, 10, 6, 'enemy 1 move 2'), unit(2, 4, 10, 'enemy 2')], mapSidecar: { eventSize: { 2: [3, 2] }, eventSizeAnchor: 'center' } });
    w.$dataSkills[1].note = '<range: 1-2>';
    heights3D(w, () => 0);
    const fight = begin(w), F = w.ReactorFight, G = F.Grid, M = F.Marks, K = M.KINDS, slime = fight.unitOfEvent(1);
    const cells = list => Array.from(list, c => `${c.x},${c.y}`);
    assert.ok(cells(fight.threatOf(slime).reach).includes('14,6'));
    // The world says nobody stands on (14,6) (a bench): it is no cell to be struck on.
    G.standsAt = (x, y) => !(x === 14 && y === 6);
    G.forget();
    w.Game_CharacterBase.prototype.locate.call(fight.character(slime), 10, 7);
    w.Game_CharacterBase.prototype.locate.call(fight.character(slime), 10, 6);
    fight.touch();
    const reach = cells(fight.threatOfAll());
    assert.equal(reach.includes('14,6'), false, 'the bench is not marked');
    assert.ok(reach.includes('13,6') && reach.includes('13,5') && reach.includes('13,7'), 'the ground round it is');
    G.standsAt = null;
    G.forget();
    // The cursor on any cell of the big bat (3..5, 10..11): all six are shown.
    fight.setCursor(5, 11);
    M.collect(fight);
    for (const [x, y] of [[3, 10], [4, 10], [5, 10], [3, 11], [4, 11], [5, 11]]) assert.ok(kindsAt(M, x, y).includes(K.cursor), `${x},${y}`);
    assert.equal(kindsAt(M, 6, 11).includes(K.cursor), false);
});

test('T is the battle\'s own key while it runs: bound where nothing else uses it, read at every stage the player has the battle, given back at the end', () => {
    const w = small({ events: [unit(1, 10, 6, 'enemy 1 move 2')] });
    w.Input.keyMapper = { 9: 'tab' };
    const fight = begin(w), F = w.ReactorFight, M = F.Marks, K = M.KINDS;
    w.run(2);
    assert.equal(w.Input.keyMapper[84], 'threat', 'bound while the battle runs');
    // At the command stage (the windows have the keys, the map's are not read) T still shows every enemy's reach.
    const me = hero(w), c = fight.character(me);
    assert.ok(fight.commandSelectUnit(me.id));
    assert.ok(fight.commandMoveTo(c.x, c.y));
    w.run(30, () => fight._act && fight._act.stage === 'command');
    assert.equal(fight._act.stage, 'command');
    assert.equal(fight.showsThreat(), false);
    // (This small world's clock stands still: each frame of the game is counted by hand.)
    const frame = () => { w.Graphics.frameCount++; w.run(1); };
    w.Input.isTriggered = name => name === 'threat';
    frame();
    w.Input.isTriggered = () => false;
    assert.equal(fight.showsThreat(), true, 'T at the command stage');
    M.collect(fight);
    assert.deepEqual(kindsAt(M, 12, 6), [K.threat], 'and the reach is on the field under the command window');
    // The next press hides it again; a frame in which a command used the press reads no key.
    w.Input.isTriggered = name => name === 'threat';
    frame();
    assert.equal(fight.showsThreat(), false);
    w.Graphics.frameCount++;
    F.Input.used();
    w.run(1);
    w.Input.isTriggered = () => false;
    assert.equal(fight.showsThreat(), false, 'the press a command used is not read again');
    // A project that gives T to something else keeps it.
    fight.end(F.WIN);
    w.run(600, () => !fight.isActive());
    assert.equal(w.Input.keyMapper[84], undefined, 'given back when the battle ends');
    w.Input.keyMapper[84] = 'menu';
    const again = begin(w);
    w.run(2);
    assert.equal(w.Input.keyMapper[84], 'menu', 'a key the project uses is left alone');
    again.end(F.WIN);
    w.run(600, () => !again.isActive());
    assert.equal(w.Input.keyMapper[84], 'menu');
});

test('the next-unit key on a move goes to the next unit and spends nobody\'s turn; the pointer over the turn strip or a unit panel is not on the map', () => {
    const w = small({ events: [unit(1, 12, 9, 'enemy 1')] });
    const fight = begin(w), F = w.ReactorFight, In = F.Input, me = hero(w), second = fight._units.find(u => u.actorId === 2);
    assert.ok(fight.commandSelectUnit(me.id));
    assert.equal(fight._act.stage, 'move');
    w.Graphics.frameCount++;
    w.Input.isTriggered = name => name === F.key('skip');
    In.update(fight);
    w.Input.isTriggered = () => false;
    assert.equal(!!fight._tac.acted[me.id], false, 'the unit has not spent its turn');
    assert.ok(fight._act.stage === 'pick' || fight._act.unitId === second.id, 'the battle is on the next unit');
    // (A stage begins from where the pointer rests: only a pointer that moves takes the cursor.)
    w.Graphics.frameCount++;
    In.update(fight);
    // The pointer moves over a tile of the turn strip: the map's cursor stays where it is.
    const before = Object.assign({}, fight.cursor());
    w.ReactorUI = { fightStripUnit: () => 7 };
    w.Graphics.frameCount++;
    w.TouchInput.x = 400; w.TouchInput.y = 300;
    In.update(fight);
    assert.deepEqual([fight.cursor().x, fight.cursor().y], [before.x, before.y], 'over the strip nothing on the map is pointed at');
    // The same over one of the HUD's unit panels, and a click there is no click on the map.
    w.ReactorUI = { fightStripUnit: () => 0, fightPanelAt: (x, y) => y >= 300 };
    w.Graphics.frameCount++;
    w.TouchInput.x = 405; w.TouchInput.y = 300;
    w.TouchInput.isTriggered = () => true;
    In.update(fight);
    w.TouchInput.isTriggered = () => false;
    assert.deepEqual([fight.cursor().x, fight.cursor().y], [before.x, before.y], 'over a panel nothing on the map is pointed at');
    assert.ok(fight._act.stage === 'pick' || fight._act.unitId === second.id, 'and nothing is chosen');
    // Off the strip and the panels the same pointer takes the cursor.
    w.ReactorUI = { fightStripUnit: () => 0, fightPanelAt: () => false };
    w.Graphics.frameCount++;
    w.TouchInput.x = 410; w.TouchInput.y = 300;
    In.update(fight);
    assert.deepEqual([fight.cursor().x, fight.cursor().y], [8, 6], 'the cell under it');
});

test('a big body\'s ring is a frame round its cells with a band as wide as any ring\'s; a one-cell unit keeps its ring', () => {
    const w = truckWorld({ events: [unit(1, 20, 12, 'enemy 1'), unit(2, 30, 20, 'enemy 2')], start: [8, 8] });
    const fight = begin(w), F = w.ReactorFight, U = F.UnitMarks, THREE = w.THREE, truck = fight.unitOfEvent(1);
    fight.character(truck).setDirection(2);
    const group = new THREE.Group();
    const live = { scene: { belowGroup: () => group, _meshes: [], _materials: [] } };
    U.collect(fight);
    U.drawRings3D(live);
    const big = Array.from({ length: U.count }, (_, i) => i).filter(i => U.w[i] > 1 || U.d[i] > 1);
    assert.equal(big.length, 1);
    assert.equal(U.rings.count, U.count - 1, 'a ring under each one-cell unit, none stretched under the truck');
    assert.ok(U.frames && U.frames.parent === group);
    assert.equal(U.frames.count, 4, 'four bands round the truck');
    assert.equal(U.frames.material.side, THREE.FrontSide);
    const at = (mesh, i) => Array.from(mesh.instanceMatrix.array.slice(i * 16, i * 16 + 16));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < 4; i++) {
        const m = at(U.frames, i);
        assert.ok(m.every(Number.isFinite));
        // Each band: one axis as long as the side it lies along, the other as wide as the band, whatever the body's size.
        const along = Math.hypot(m[0], m[1], m[2]), across = Math.hypot(m[8], m[9], m[10]);
        assert.ok(Math.abs(across - U.FRAME_BAND) < 1e-6, `band ${i} is ${across} wide`);
        assert.ok(along > 2.5, `band ${i} runs along a side (${along})`);
        const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
        assert.ok(det > 0, 'facing up');
        x0 = Math.min(x0, m[12]); x1 = Math.max(x1, m[12]); z0 = Math.min(z0, m[14]); z1 = Math.max(z1, m[14]);
    }
    // Round the cells 18..22 by 11..13, a little inside their edge.
    assert.ok(Math.abs(x0 - (18 + U.FRAME_INSET)) < 1e-6 && Math.abs(x1 - (23 - U.FRAME_INSET)) < 1e-6);
    assert.ok(Math.abs(z0 - (11 + U.FRAME_INSET)) < 1e-6 && Math.abs(z1 - (14 - U.FRAME_INSET)) < 1e-6);
    // On watch: a second frame outside the first.
    fight._tac.watch[truck.id] = true;
    U.collect(fight);
    U.drawRings3D(live);
    assert.equal(U.frames.count, 8);
    // With nobody big left nothing of the frames is drawn.
    truck.gone = true;
    U.collect(fight);
    U.drawRings3D(live);
    assert.equal(U.frames.count, 0);
    assert.equal(U.frames.visible, false);
});

test('a big unit that decides for itself stops only where all of it still has room, though its way was looked at before someone stepped into it', () => {
    const w = truckWorld({ events: [unit(1, 10, 15, 'enemy 1 move 6'), unit(2, 30, 26, 'enemy 2')], start: [34, 15] });
    const fight = begin(w), F = w.ReactorFight, AI = F.AI, G = F.Grid, truck = fight.unitOfEvent(1), bat = fight.unitOfEvent(2), c = fight.character(truck);
    c.setDirection(6);
    fight.beginUnit(truck);
    // Its thinking begins; the way toward the fight is looked along a slice at a time (the clock is always short here).
    const battler = fight.battler(truck);
    AI.forget();
    AI.begin(fight, truck, c, battler);
    const short = () => performance.now() - 1;
    let steps = AI.approach(fight, truck, c, short());
    assert.equal(steps, null, 'the look is not whole after one slice');
    // Meanwhile someone steps onto a cell its body would lie on at the end of this turn's move (not onto its way).
    const end = c.x + 6;
    w.Game_CharacterBase.prototype.locate.call(fight.character(bat), end + 1, 16);
    for (let i = 0; i < 2000 && steps === null; i++) steps = AI.approach(fight, truck, c, short());
    assert.ok(Array.isArray(steps) && steps.length > 0, 'it comes on');
    const last = steps[steps.length - 1];
    assert.equal(G.fitsAt(fight, truck, last.x, last.y, last.face || last.d, last.height), true, `where it stops (${last.x},${last.y}) all of it has room now`);
    const f = F.footprintFacing(truck, last.face || last.d), bc = fight.character(bat);
    assert.equal(bc.x >= last.x + f.ox && bc.x < last.x + f.ox + f.w && bc.y >= last.y + f.oy && bc.y < last.y + f.oy + f.h, false, 'the bat is not under it');
    assert.ok(last.x < end, 'a step short of where the stale look would have left it');
});
