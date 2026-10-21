'use strict';
// A unit's body in a Tactical battle (runtime/reactor_fight_tactical.js, "A unit's body"): a unit with no size of
// its own takes the cells its model covers, by the rule a model event's Auto size follows outside battles, turned
// with its facing; it blocks, is picked and is struck on every one of them, moves only where all of it fits, turns
// only where the turned body fits, and is put where it has room when it starts where it has none. The engine's
// real 3D runtime measures the models (helpers/fight-real-world.cjs); the Demo's tank is its real .glb.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { realWorld, event, page } = require('./helpers/fight-real-world.cjs');
const MapElevation = require('../src/utils/MapElevation.js');

const repo = path.resolve(__dirname, '..', '..');
const W = 40, H = 30;
const unit = (id, x, y, text, extra = {}) => event(id, x, y, Object.assign({ note: `<unit: ${text}>` }, extra));
const rect = f => [f.ox, f.oy, f.w, f.h];
const TRUCK = { name: 'Vehicles/Truck', ext: '.glb', size: 4, scale: 1, yaw: 0 };
/** A world whose enemy 1 is a truck: a box four tiles long and two wide. */
function truckWorld(options = {}) {
    const w = realWorld(options);
    w.model('Vehicles/Truck', w.boxModel(4, 1.5, 2));
    w.Reactor3D._databaseSidecar = Object.assign({ enemies: { 1: TRUCK } }, options.bind || {});
    w.$dataEnemies[1].params[0] = 9000;
    return w;
}
/** Walls: cells four tiles high (a 3D map), or tiles nobody walks onto (a flat one). */
function walls(w, cells) {
    const side = w.$dataMap.reactor3d;
    if (side && w.Reactor3D.isMap3D(w.$dataMap)) {
        if (!side.elevation) side.elevation = new Array(w.$dataMap.width * w.$dataMap.height).fill(0);
        for (const [x, y] of cells) side.elevation[y * w.$dataMap.width + x] = 4;
    } else {
        w.$dataTilesets[1].flags[1537 + 0x60F] = 0x60F;
        for (const [x, y] of cells) w.$dataMap.data[y * w.$dataMap.width + x] = 1537 + 0x60F;
    }
    changed(w);
}
/** The map was changed under the game (a test builds its walls as it goes): what was read of it is read again. */
function changed(w) {
    w.ReactorFight.forgetFootprints();
    if (w.ReactorPhysics && w.ReactorPhysics.forgetEdges) w.ReactorPhysics.forgetEdges(w.$dataMap);
}
const open = (w, cells) => { for (const [x, y] of cells) { if (w.$dataMap.reactor3d && w.$dataMap.reactor3d.elevation) w.$dataMap.reactor3d.elevation[y * w.$dataMap.width + x] = 0; w.$dataMap.data[y * w.$dataMap.width + x] = 1536; } changed(w); };
const row = (y, x0, x1) => { const out = []; for (let x = x0; x <= x1; x++) out.push([x, y]); return out; };
const column = (x, y0, y1) => { const out = []; for (let y = y0; y <= y1; y++) out.push([x, y]); return out; };
function begin(w, options = {}) {
    assert.ok(w.$gameFight.start(Object.assign({ mode: 'tactical' }, options)) > 0);
    w.run(90, () => w.$gameFight.awaitsPlayer());
    return w.$gameFight;
}
/** The cells a unit's body covers where it stands now. */
function body(w, u) {
    const c = w.$gameFight.character(u), f = w.ReactorFight.footprint(u), out = [];
    for (let y = c.y + f.oy; y < c.y + f.oy + f.h; y++) for (let x = c.x + f.ox; x < c.x + f.ox + f.w; x++) out.push([x, y]);
    return out;
}
/** What the editor's Auto size measures for that model and facing. */
function autoRect(w, spec, d) {
    const R = w.Reactor3D, normal = R.normalizeModelSpec(spec);
    const template = R._glbCache[R.modelCacheKey(normal.name, normal.ext, normal.file)].template;
    const tiles = Array.from(R.blockedTilesFor(template, {}, normal, d, 0, 0), t => ({ x: t.x, y: t.y }));
    const [bw, bh, ox, oy] = MapElevation.footprintOfTiles(tiles, 0, 0);
    return [ox, oy, bw, bh];
}

test('a unit with no size takes its model\'s body by the Auto rule, turned with its facing: placed, wearing its record\'s model, spawned', () => {
    const own = { name: 'Vehicles/Truck', ext: '.glb', size: 4, scale: 1, yaw: 0 };
    const w = truckWorld({ events: [unit(1, 20, 12, 'enemy 1'), unit(2, 30, 20, 'enemy 2'), unit(3, 8, 20, 'enemy 2')], sidecar: { events: { 3: { 0: own } } } });
    const F = w.ReactorFight, fight = begin(w);
    const worn = fight.unitOfEvent(1), plain = fight.unitOfEvent(2), placed = fight.unitOfEvent(3);
    for (const d of [2, 4, 6, 8]) {
        const auto = autoRect(w, TRUCK, d);
        assert.deepEqual(rect(F.footprintFacing(worn, d)), auto, `a unit wearing its record's model, facing ${d}`);
        assert.deepEqual(rect(F.footprintFacing(placed, d)), auto, `an event with a model of its own, facing ${d}`);
    }
    assert.deepEqual(rect(F.footprintFacing(worn, 2)), [-2, -1, 5, 3], 'four tiles long across the map when it faces down');
    assert.deepEqual(rect(F.footprintFacing(worn, 6)), [-1, -2, 3, 5], 'and down the map when it faces right');
    assert.equal(F.footprintSource(worn), 'model');
    assert.equal(F.isBig(worn), true);
    assert.equal(F.turnsBody(worn), true);
    assert.deepEqual(rect(F.footprint(plain)), [0, 0, 1, 1], 'a unit with no model stands on one cell');
    assert.equal(F.isBig(plain), false);
    // As it stands: the body of the facing it has.
    fight.character(worn).setDirection(2);
    assert.deepEqual(rect(F.footprint(worn)), [-2, -1, 5, 3]);
    const spawned = fight.spawn({ record: 'enemy', id: 1, x: 30, y: 8, direction: 4 });
    assert.deepEqual(rect(F.footprint(spawned)), [-1, -2, 3, 5], 'a spawned unit, as it faces');
    // A size typed on the event wins, and is not turned.
    w.$dataMap.reactor3d.eventSize = { 1: [2, 2] };
    w.$dataMap.reactor3d.eventSizeAnchor = 'center';
    F.forgetFootprints();
    for (const d of [2, 4, 6, 8]) assert.deepEqual(rect(F.footprintFacing(worn, d)), [0, 0, 2, 2], `the typed size, facing ${d}`);
    assert.equal(F.footprintSource(worn), 'size');
    assert.equal(F.turnsBody(worn), false);
});

test('a party member is as big as the model its actor wears; one whose model has not arrived takes its cell until it does', () => {
    const w = truckWorld({ events: [unit(1, 30, 20, 'enemy 2')], bind: { actors: { 1: TRUCK, 2: { name: 'Vehicles/Late', ext: '.glb', size: 4, scale: 1 } } }, start: [10, 10] });
    const F = w.ReactorFight, fight = begin(w);
    const lead = fight._units.find(u => u.actorId === 1), second = fight._units.find(u => u.actorId === 2);
    assert.equal(fight.character(lead), w.$gamePlayer);
    assert.deepEqual(rect(F.footprintFacing(lead, 2)), [-2, -1, 5, 3]);
    assert.equal(F.footprintSource(second), 'pending');
    assert.deepEqual(rect(F.footprint(second)), [0, 0, 1, 1]);
    // Nobody stands inside the leader's body: the follower beside it was put out of it as the battle began.
    const c2 = fight.character(second);
    assert.equal(F.covers(lead, w.$gamePlayer.x, w.$gamePlayer.y, c2.x, c2.y), false, `the follower at ${c2.x},${c2.y} is outside the leader's body`);
    // Its model arrives: the body is measured the next time anyone looks, and it takes room it can have.
    w.model('Vehicles/Late', w.boxModel(4, 1.5, 2));
    w.run(F.FOOT_PENDING + 2);
    assert.equal(F.footprintSource(second), 'model');
    assert.equal(F.isBig(second), true);
    for (const [x, y] of body(w, second)) assert.equal(fight.unitAt(x, y, second), null, `nobody else on ${x},${y}`);
});

test('the Demo\'s tank: its real model and Database binding make a body of seven by twelve cells, long the way it faces', t => {
    const glb = path.join(repo, 'template/Demo/3d/Vehicles/Oth97_CNO_Consul/source/Oth97_CNO_Consul.glb');
    const bindings = path.join(repo, 'template/Demo/data/Database.r3d.json');
    if (!fs.existsSync(glb) || !fs.existsSync(bindings)) return t.skip('the Demo\'s tank is not in this checkout');
    const spec = JSON.parse(fs.readFileSync(bindings, 'utf8')).enemies['2'];
    if (!spec || spec.name !== 'Vehicles/Oth97_CNO_Consul') return t.skip('enemy 2 no longer wears the tank');
    const w = realWorld({ events: [unit(1, 20, 14, 'enemy 2')] });
    const R = w.Reactor3D, F = w.ReactorFight;
    w.model(spec.name, w.glb(glb), spec.ext, spec.file);
    R._databaseSidecar = { enemies: { 2: spec } };
    const fight = begin(w), tank = fight.unitOfEvent(1);
    assert.equal(F.footprintSource(tank), 'model');
    const normal = R.normalizeModelSpec(spec), template = R._glbCache[R.modelCacheKey(normal.name, normal.ext, normal.file)].template;
    for (const d of [2, 4, 6, 8]) {
        const tiles = Array.from(R.blockedTilesFor(template, {}, normal, d, 0, 0), tile => ({ x: tile.x, y: tile.y }));
        const [bw, bh, ox, oy] = MapElevation.footprintOfTiles(tiles, 0, 0);
        assert.deepEqual(rect(F.footprintFacing(tank, d)), [ox, oy, bw, bh], `the editor's Auto size, facing ${d}`);
    }
    // As bound today (size 15): a hull seven cells wide and twelve long, its gun over everyone's head.
    if (spec.size === 15) {
        assert.deepEqual([F.footprintFacing(tank, 2).w, F.footprintFacing(tank, 2).h], [7, 12]);
        assert.deepEqual([F.footprintFacing(tank, 6).w, F.footprintFacing(tank, 6).h], [12, 7]);
        assert.equal(F.overhang(tank), null);
    }
    // Every cell under it answers with it, and nobody walks any of them.
    const cells = body(w, tank);
    for (const [x, y] of cells) assert.equal(fight.unitAt(x, y), tank, `${x},${y}`);
    const me = fight._units.find(u => u.actorId === 1);
    w.Game_CharacterBase.prototype.locate.call(fight.character(me), cells[0][0] - 2, cells[0][1]);
    F.Grid.flood(fight, me, 30);
    for (const [x, y] of cells) assert.equal(F.Grid.costAt(x, y), Infinity, `no way onto ${x},${y}`);
});

test('the Demo\'s tank bound smaller: its body is its hull, three cells by five, and its gun is over the two cells ahead of it', t => {
    const glb = path.join(repo, 'template/Demo/3d/Vehicles/Oth97_CNO_Consul/source/Oth97_CNO_Consul.glb');
    const bindings = path.join(repo, 'scratchpad/ux-pass/baseline/demo-data/Database.r3d.json');
    if (!fs.existsSync(glb) || !fs.existsSync(bindings)) return t.skip('the Demo\'s tank is not in this checkout');
    const spec = Object.assign({}, JSON.parse(fs.readFileSync(bindings, 'utf8')).enemies['2'], { size: 6 });
    if (spec.name !== 'Vehicles/Oth97_CNO_Consul') return t.skip('enemy 2 did not wear the tank');
    const w = realWorld({ events: [unit(1, 20, 14, 'enemy 2')] });
    const R = w.Reactor3D, F = w.ReactorFight;
    w.model(spec.name, w.glb(glb), spec.ext, spec.file);
    R._databaseSidecar = { enemies: { 2: spec } };
    const fight = begin(w), tank = fight.unitOfEvent(1), c = fight.character(tank);
    // At this size the barrel is at chest height: the Auto rule takes the two cells under it, one cell wide.
    const normal = R.normalizeModelSpec(spec), template = R._glbCache[R.modelCacheKey(normal.name, normal.ext, normal.file)].template;
    const auto = Array.from(R.blockedTilesFor(template, {}, normal, 2, 0, 0), tile => tile.x + ',' + tile.y);
    assert.ok(auto.includes('0,2') && auto.includes('0,3') && !auto.includes('1,2') && !auto.includes('-1,3'));
    assert.deepEqual([2, 4, 6, 8].map(d => rect(F.footprintFacing(tank, d))), [[-1, -3, 3, 5], [-1, -1, 5, 3], [-3, -1, 5, 3], [-1, -1, 3, 5]]);
    const ahead = { 2: ['0,2', '0,3'], 4: ['-2,0', '-3,0'], 6: ['2,0', '3,0'], 8: ['0,-2', '0,-3'] };
    for (const d of [2, 4, 6, 8]) {
        const over = F.overhangFacing(tank, d), list = [];
        for (let i = 0; i < over.length; i += 2) list.push(over[i] + ',' + over[i + 1]);
        assert.deepEqual(list.sort(), ahead[d].slice().sort(), `facing ${d}`);
    }
    assert.equal(c.direction(), 2);
    // Nobody stands under the barrel; beside it there is room.
    const me = fight._units.find(u => u.actorId === 1);
    w.Game_CharacterBase.prototype.locate.call(fight.character(me), 22, 17);
    F.Grid.flood(fight, me, 30);
    assert.equal(F.Grid.costAt(20, 16), Infinity);
    assert.equal(F.Grid.costAt(20, 17), Infinity);
    assert.ok(F.Grid.costAt(21, 16) < Infinity && F.Grid.canStopAt(21, 16));
    assert.ok(F.Grid.costAt(19, 17) < Infinity && F.Grid.canStopAt(19, 17));
    assert.equal(fight.unitAt(20, 16), null);
});

test('a big unit moves only where all of it fits: not through a gap narrower than it, not round a corner it cannot turn in', () => {
    const w = truckWorld({ events: [unit(1, 10, 10, 'enemy 1')], start: [30, 3] });
    // A street five cells wide runs down from the truck; a wall crosses it at y 16 with a gap of three.
    walls(w, column(7, 4, 26).concat(column(13, 4, 19), row(16, 8, 8), row(16, 12, 12)));
    const F = w.ReactorFight, G = F.Grid, fight = begin(w), truck = fight.unitOfEvent(1);
    fight.character(truck).setDirection(2);
    assert.deepEqual(rect(F.footprint(truck)), [-2, -1, 5, 3]);
    G.flood(fight, truck, 30);
    assert.equal(G.costAt(10, 14), 4, 'down the street');
    assert.equal(G.costAt(10, 15), Infinity, 'its body (five wide) would stand in the wall beside the gap');
    assert.equal(G.costAt(10, 20), Infinity, 'so it never gets through a gap of three');
    // One of its own cells wide, a man goes through.
    const me = fight._units.find(u => u.actorId === 1);
    w.Game_CharacterBase.prototype.locate.call(fight.character(me), 10, 14);
    w.Game_CharacterBase.prototype.locate.call(fight.character(truck), 10, 8);
    G.flood(fight, me, 30);
    assert.equal(G.costAt(10, 20), 6, 'a man walks through it');
    w.Game_CharacterBase.prototype.locate.call(fight.character(me), 30, 3);
    w.Game_CharacterBase.prototype.locate.call(fight.character(truck), 10, 10);
    // The gap as wide as the truck: it drives through.
    open(w, [[8, 16], [12, 16]]);
    G.flood(fight, truck, 30);
    assert.equal(G.costAt(10, 20), 10, 'a gap of five lets it through');
    // The street turns right at the bottom, three cells high: turned to drive along it the truck is five cells
    // high, so it cannot turn into it; five cells high, and it can.
    walls(w, row(20, 13, 30).concat(row(24, 13, 30), row(26, 8, 30)));
    G.flood(fight, truck, 40);
    assert.equal(G.costAt(10, 22), 12, 'the corner itself');
    assert.equal(G.costAt(16, 22), Infinity, 'no turn into a street narrower than it is long');
    open(w, row(20, 13, 30).concat(row(24, 13, 30)));
    walls(w, row(19, 13, 30).concat(row(25, 13, 30)));
    G.flood(fight, truck, 40);
    assert.equal(G.costAt(16, 22), 18, 'the turn taken where the turned body fits');
    assert.equal(G.facingAt(16, 22), 6, 'and it arrives facing the way it drove');
    assert.equal(G.facingAt(10, 14), 2);
    assert.equal(G.facingAt(10, 10), 0, 'its own cell: as it stands');
    // The steps of the way never put a cell of its body on a wall.
    const wallAt = (x, y) => w.$dataMap.reactor3d.elevation[y * W + x] > 0;
    let x = 10, y = 10;
    for (const step of G.pathTo(16, 22)) {
        assert.equal(step.face, step.d, 'driven forward all the way');
        const f = F.footprintFacing(truck, step.face);
        for (let by = step.y + f.oy; by < step.y + f.oy + f.h; by++) for (let bx = step.x + f.ox; bx < step.x + f.ox + f.w; bx++) assert.equal(wallAt(bx, by), false, `step to ${step.x},${step.y} facing ${step.d} covers ${bx},${by}`);
        assert.equal(Math.abs(step.x - x) + Math.abs(step.y - y), 1);
        x = step.x; y = step.y;
    }
});

test('a long unit turns only where the turned body has room, whoever asks: the player, the end of its turn, its aim', () => {
    const w = truckWorld({ events: [unit(1, 10, 10, 'enemy 1'), unit(2, 20, 10, 'ally 3')], start: [30, 3] });
    // A wall just above the truck: facing down or up it fits; turned sideways its body would reach into the wall.
    walls(w, row(8, 5, 15));
    const F = w.ReactorFight, fight = begin(w), truck = fight.unitOfEvent(1), c = fight.character(truck);
    c.setDirection(2);
    assert.equal(c.direction(), 2);
    assert.equal(F.canFace(fight, truck, 6), false, 'sideways it would stand in the wall');
    assert.equal(F.canFace(fight, truck, 8), false, 'nor round: a half turn swings through the quarter turn, though it ends on the same cells');
    assert.equal(F.canFace(fight, truck, 2), true, 'as it faces');
    c.setDirection(6);
    assert.equal(c.direction(), 2, 'the turn is not taken');
    c.setDirection(8);
    assert.equal(c.direction(), 2);
    // Its turn ends: the nearest enemy is to its right, and it stays as it is.
    fight.faceNearest(truck);
    assert.equal(c.direction(), 2);
    // With room, it turns.
    open(w, row(8, 5, 15));
    assert.equal(F.canFace(fight, truck, 6), true);
    assert.equal(F.canFace(fight, truck, 8), true, 'with room to swing, round as well');
    fight.faceNearest(truck);
    assert.equal(c.direction(), 6);
    assert.deepEqual(rect(F.footprint(truck)), [-1, -2, 3, 5]);
    // Another unit where the turned body would be stops the turn as a wall does.
    const friend = fight.unitOfEvent(2);
    w.Game_CharacterBase.prototype.locate.call(fight.character(friend), 12, 10);
    assert.equal(F.canFace(fight, truck, 2), false, 'someone stands where its nose would swing to');
    c.setDirection(2);
    assert.equal(c.direction(), 6);
    // A unit on one cell turns as it always did.
    const small = fight.character(friend);
    small.setDirection(4);
    assert.equal(small.direction(), 4);
});

test('a long unit with no room to turn round backs up as it faces, and turns where the street opens', () => {
    // A hull three wide and five long whose own cell is near its tail: three cells of it ahead, one behind.
    const w = realWorld({ events: [unit(1, 10, 10, 'enemy 1')], start: [30, 3] });
    w.model('Vehicles/Truck', w.boxModel(2, 1.5, 4, 1));
    w.Reactor3D._databaseSidecar = { enemies: { 1: TRUCK } };
    // A street three cells wide (x 9..11) shut in front of it, open behind into a yard from y 21 on.
    walls(w, column(8, 4, 20).concat(column(12, 4, 20), row(5, 9, 11)));
    const F = w.ReactorFight, G = F.Grid, fight = begin(w), truck = fight.unitOfEvent(1), c = fight.character(truck);
    c._direction = 8; c._reactorDir8 = 8;
    assert.deepEqual(rect(F.footprintFacing(truck, 8)), [-1, -3, 3, 5], 'facing up: three cells ahead of its own, one behind');
    assert.deepEqual(rect(F.footprintFacing(truck, 2)), [-1, -1, 3, 5], 'facing down: the other way from its own cell');
    assert.deepEqual(rect(F.footprintFacing(truck, 6)), [-1, -1, 5, 3]);
    // It cannot turn across the street, and so not round either: a half turn swings through the quarter.
    assert.equal(F.canFace(fight, truck, 4), false);
    assert.equal(F.canFace(fight, truck, 6), false);
    assert.equal(F.canFace(fight, truck, 2), false, 'the turned body would fit, the swing there does not');
    c.setDirection(2);
    assert.equal(c.direction(), 8);
    G.flood(fight, truck, 12);
    assert.equal(G.costAt(10, 9), 1, 'one step up to the wall');
    assert.equal(G.costAt(10, 8), Infinity, 'and no further');
    assert.equal(G.costAt(10, 14), 4, 'back down the street');
    assert.equal(G.facingAt(10, 14), 8, 'backward: it still faces up the street');
    const back = G.pathTo(10, 13);
    assert.deepEqual(Array.from(back, step => [step.d, step.face]), [[2, 8], [2, 8], [2, 8]]);
    const wallAt = (x, y) => w.$dataMap.reactor3d.elevation[y * W + x] > 0;
    for (const step of G.pathTo(10, 22)) {
        const f = F.footprintFacing(truck, step.face);
        for (let by = step.y + f.oy; by < step.y + f.oy + f.h; by++) for (let bx = step.x + f.ox; bx < step.x + f.ox + f.w; bx++) assert.equal(wallAt(bx, by), false, `step to ${step.x},${step.y} facing ${step.face} covers ${bx},${by}`);
    }
    // Walked: three cells back, still facing the way it faced.
    fight.beginUnit(truck);
    fight.startWalk(truck, c, back);
    w.run(300, () => !fight._act || fight._act.stage !== 'walk');
    assert.deepEqual([c.x, c.y], [10, 13]);
    assert.equal(c.direction(), 8);
    // In the yard there is room to swing round: it turns and drives on forward.
    w.Game_CharacterBase.prototype.locate.call(c, 10, 25);
    assert.equal(F.canFace(fight, truck, 2), true);
    G.flood(fight, truck, 6);
    assert.equal(G.facingAt(10, 26), 2, "turned round, driving forward");
    assert.equal(G.facingAt(13, 25), 6);
});

test('everyone else goes round a big unit, it is picked and struck on any of its cells, and reach is counted from its edge', () => {
    const w = truckWorld({ events: [unit(1, 10, 10, 'enemy 1')], start: [10, 14] });
    w.$dataSkills[1].note = '<range: 1-4>';
    const F = w.ReactorFight, G = F.Grid, fight = begin(w), truck = fight.unitOfEvent(1);
    fight.character(truck).setDirection(2);
    const me = fight._units.find(u => u.actorId === 1), cells = body(w, truck);
    assert.equal(cells.length, 15);
    assert.deepEqual([w.$gamePlayer.x, w.$gamePlayer.y], [10, 14]);
    G.flood(fight, me, 12);
    for (const [x, y] of cells) assert.equal(G.costAt(x, y), Infinity, `${x},${y} is under it`);
    assert.equal(G.costAt(10, 8), 12, 'round its end to the far side, not through it');
    // The cursor on any of its cells is on it; a blow aimed at the nearest cell lands on it once.
    for (const [x, y] of cells) { fight.setCursor(x, y); assert.equal(fight.focusedUnit(), truck, `the cursor on ${x},${y}`); }
    assert.ok(fight.commandSelectUnit(me.id));
    assert.ok(fight.commandMoveTo(10, 14));
    assert.ok(fight.commandAttack());
    assert.deepEqual([fight.cursor().x, fight.cursor().y], [10, 11], 'the cursor goes to the nearest cell of its body');
    assert.deepEqual(Array.from(fight.targetsAtCursor()), [truck]);
    fight.setCursor(10, 10);
    assert.deepEqual(Array.from(fight.targetsAtCursor()), [truck], 'a cell further into it, still in reach from where the hero stands');
    fight.setCursor(11, 11);
    assert.deepEqual(Array.from(fight.targetsAtCursor()), [truck], 'and the cell beside that');
    fight.setCursor(12, 11);
    assert.deepEqual(Array.from(fight.targetsAtCursor()), [], 'its corner is a step too far');
    // What the truck reaches is counted from the nearest cell of its own body.
    const battler = fight.battler(truck), action = new w.Game_Action(battler);
    action.setAttack();
    const reach = Array.from(fight.reachCells(truck, action, 10, 10, 0), cell => `${cell.x},${cell.y}`);
    assert.ok(reach.includes('16,10'), 'four cells past its right end (12)');
    assert.ok(!reach.includes('17,10'), 'not five');
    assert.ok(reach.includes('10,15'), 'four past its side (11)');
    assert.ok(!reach.includes('10,16'));
});

test('a battle that starts with a big unit inside a wall or over other units puts it on the nearest place it fits, and says so', () => {
    const quiet = console.info;
    console.info = () => {};
    try { placedAtStart(); } finally { console.info = quiet; }
});
function placedAtStart() {
    const w = truckWorld({ events: [unit(1, 12, 10, 'enemy 1'), unit(2, 14, 10, 'enemy 2')], start: [11, 11] });
    // A house wall through the middle of where the truck was put.
    walls(w, column(13, 6, 13));
    const F = w.ReactorFight;
    const fight = begin(w), truck = fight.unitOfEvent(1), c = fight.character(truck), said = Array.from(fight.placements());
    assert.equal(said.length >= 1, true, 'the battle says who was moved');
    const mine = said.find(entry => entry.unitId === truck.id);
    assert.ok(mine, 'the truck was moved');
    assert.deepEqual({ ...mine.from }, { x: 12, y: 10 });
    assert.deepEqual({ ...mine.to }, { x: c.x, y: c.y });
    assert.equal(mine.name, 'Slime');
    // Where it stands now every cell under it is open ground with nobody on it.
    for (const [x, y] of body(w, truck)) {
        assert.ok(!(w.$dataMap.reactor3d.elevation[y * W + x] > 0), `${x},${y} is no wall`);
        assert.equal(fight.unitAt(x, y, truck), null, `nobody else on ${x},${y}`);
    }
    // Nobody of the party is under it either (the leader stood where its side was put).
    for (const other of fight._units) {
        if (other === truck) continue;
        const oc = fight.character(other);
        assert.equal(F.covers(truck, c.x, c.y, oc.x, oc.y), false, `unit ${other.id} at ${oc.x},${oc.y} is outside its body`);
    }
    assert.ok(Math.hypot(c.x - 12, c.y - 10) <= 8, `near where it was put (${c.x},${c.y})`);
    // A second look moves nothing.
    assert.equal(F.settle(fight), 0);
}

test('walled in on every side a big unit stays where it was put, and whoever stands inside it is put beside it', () => {
    const quiet = console.info;
    console.info = () => {};
    try { walledIn(); } finally { console.info = quiet; }
});
function walledIn() {
    const w = truckWorld({ flat: true, events: [unit(1, 20, 15, 'enemy 1'), unit(2, 30, 15, 'enemy 2')], start: [36, 15] });
    // A lane one cell high across the map: the truck (three cells high at the least) fits nowhere.
    const all = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y !== 15) all.push([x, y]);
    walls(w, all);
    const F = w.ReactorFight;
    const fight = begin(w), truck = fight.unitOfEvent(1), c = fight.character(truck), bat = fight.unitOfEvent(2);
    assert.deepEqual([c.x, c.y], [20, 15], 'no place fits: it stays');
    assert.deepEqual(Array.from(fight.placements(), entry => [entry.unitId, entry.moved, entry.stays]), [[truck.id, false, true]], 'and the battle says it has no room');
    // Someone ends up on a cell under it (spawned there, put there by an event): the next look puts them beside it.
    w.Game_CharacterBase.prototype.locate.call(fight.character(bat), 21, 15);
    assert.equal(F.settle(fight), 1);
    const bc = fight.character(bat);
    assert.equal(F.covers(truck, c.x, c.y, bc.x, bc.y), false, `the bat at ${bc.x},${bc.y} is outside its body`);
    assert.equal(bc.y, 15, 'on the lane, not on a wall');
    assert.ok(Array.from(fight.placements()).some(entry => entry.unitId === bat.id && entry.moved && entry.reason.includes('another unit')), 'and the battle says who made way');
    assert.deepEqual([c.x, c.y], [20, 15]);
}

test('the other side drives a big unit toward the fight through streets it fits, and never onto a wall or a unit', () => {
    const w = truckWorld({ events: [unit(1, 10, 6, 'enemy 1 move 6')], start: [30, 22] });
    // The truck at the top of a street five wide that turns right, five high, toward the party.
    walls(w, column(7, 2, 26).concat(column(13, 2, 19), row(19, 13, 36), row(25, 8, 36)));
    const F = w.ReactorFight, fight = begin(w), truck = fight.unitOfEvent(1), c = fight.character(truck);
    c.setDirection(2);
    const wallAt = (x, y) => w.$dataMap.reactor3d.elevation[y * W + x] > 0;
    const start = [c.x, c.y];
    let frames = 0;
    for (let turn = 0; turn < 4 && fight.isActive(); turn++) {
        assert.ok(fight.commandEndTurn(), `turn ${turn + 1} ends`);
        for (let i = 0; i < 900; i++) {
            w.run(1); frames++;
            if (!c.isMoving()) for (const [x, y] of body(w, truck)) {
                assert.equal(wallAt(x, y), false, `frame ${frames}: its body on the wall at ${x},${y} (it stands at ${c.x},${c.y} facing ${c.direction()})`);
                assert.equal(fight.unitAt(x, y, truck), null, `frame ${frames}: someone under it at ${x},${y}`);
            }
            if (fight.awaitsPlayer() || !fight.isActive()) break;
        }
    }
    assert.ok(Math.abs(c.x - start[0]) + Math.abs(c.y - start[1]) >= 12, `it came on (${start} -> ${c.x},${c.y})`);
    assert.ok(c.y >= 20, 'down the street and round the corner');
});

test('on a flat map too: a model\'s body by the same rule, and a picture wider than two tiles stands on the cells it covers, as many east of its own as west', () => {
    const sheet = name => page({ image: { tileId: 0, characterName: name, characterIndex: 0, direction: 2, pattern: 1 } });
    const big = sheet('$Dragon');
    const w = truckWorld({ flat: true, events: [unit(1, 20, 12, 'enemy 1'), unit(2, 30, 20, 'enemy 2', { pages: [big] }), unit(3, 8, 20, 'enemy 2'),
        unit(4, 6, 4, 'enemy 2', { pages: [sheet('$Ogre')] }), unit(5, 12, 4, 'enemy 2', { pages: [sheet('$Wyrm')] }), unit(6, 30, 4, 'enemy 2', { pages: [sheet('$Titan')] })] });
    assert.equal(w.Reactor3D.isMap3D(w.$dataMap), false);
    // One frame of each sheet, in pixels on 48 pixel tiles: the dragon 144, the ogre 96, the wyrm 120, the titan 192.
    const frames = { $Dragon: 144, $Ogre: 96, $Wyrm: 120, $Titan: 192 };
    w.ImageManager.loadCharacter = name => ({ isReady: () => true, width: frames[name] ? frames[name] * 3 : 576, height: 384 });
    const F = w.ReactorFight, G = F.Grid, fight = begin(w);
    const truck = fight.unitOfEvent(1), dragon = fight.unitOfEvent(2), bat = fight.unitOfEvent(3);
    fight.character(truck).setDirection(2);
    assert.deepEqual(rect(F.footprint(truck)), [-2, -1, 5, 3]);
    assert.deepEqual(rect(F.footprint(dragon)), [-1, -1, 3, 2], 'a picture 144 pixels wide on 48 pixel tiles: three cells, two deep, behind its feet');
    assert.equal(F.footprintSource(dragon), 'picture');
    assert.deepEqual(rect(F.footprint(bat)), [0, 0, 1, 1], 'an ordinary sheet is one cell');
    // The picture is drawn with its middle over its own cell: its body is as many cells east of that as west.
    assert.deepEqual(rect(F.footprint(fight.unitOfEvent(4))), [0, 0, 1, 1], 'two tiles wide is a figure on one cell, as a model that wide is');
    assert.equal(fight.unitAt(7, 4), null, 'the cell east of it is free');
    assert.deepEqual(rect(F.footprint(fight.unitOfEvent(5))), [-1, -1, 3, 2], 'two and a half tiles wide covers most of the cell either side');
    assert.equal(fight.unitAt(11, 4), fight.unitOfEvent(5));
    assert.equal(fight.unitAt(13, 4), fight.unitOfEvent(5));
    assert.deepEqual(rect(F.footprint(fight.unitOfEvent(6))), [-2, -2, 5, 3], 'four tiles wide covers half of the second cell either side');
    for (const [x, y] of [[29, 19], [30, 19], [31, 19], [29, 20], [30, 20], [31, 20]]) assert.equal(fight.unitAt(x, y), dragon, `${x},${y}`);
    assert.equal(fight.unitAt(30, 21), null);
    // It moves as a whole here too.
    walls(w, row(16, 0, 18).concat(row(16, 22, 39)));
    G.flood(fight, truck, 20);
    assert.equal(G.costAt(20, 14), 2, 'up to the wall');
    assert.equal(G.costAt(20, 15), Infinity, 'its body would stand in the wall beside the gap');
    assert.equal(G.costAt(20, 18), Infinity, 'a gap of three does not take five');
});

//-----------------------------------------------------------------------------
// North Haven itself (the Demo's Map005) with the Demo's tank: the investigators' copy of the map as it stood when
// the defects were found where this checkout has it, else the Demo's own data. The map's rocks are left out (meshing
// them takes a quarter of a minute and none stands in the square), and so are whatever units the map holds: the
// test brings its own, so the Demo's content can change under it.

const baseline = path.join(repo, 'scratchpad/ux-pass/baseline/demo-data');
const demoData = fs.existsSync(path.join(baseline, 'Map005.r3d.json')) ? baseline : path.join(repo, 'template/Demo/data');
const tankFile = path.join(repo, 'template/Demo/3d/Vehicles/Oth97_CNO_Consul/source/Oth97_CNO_Consul.glb');
const unitComment = c => (c.code === 108 || c.code === 408) && /<unit/i.test(String(c.parameters[0]));

function northHaven(events, start = [80, 58], size = 0) {
    const w = realWorld({ data: demoData, mapId: 5, start, events, prepare: map => {
        map.reactor3d.pieces = map.reactor3d.pieces.filter(piece => piece.kind !== 'rock');
        for (const e of map.events) {
            if (!e || e.id >= 300) continue;
            e.rrUnit = undefined; e.note = String(e.note || '').replace(/<unit[^>]*>/ig, '');
            for (const p of e.pages) p.list = p.list.filter(c => !unitComment(c));
        }
    } });
    // `size`: the tank at another size than the Demo binds it at (the same hull, smaller).
    const bound = w.Reactor3D._databaseSidecar.enemies['2'], spec = size ? Object.assign({}, bound, { size }) : bound;
    w.Reactor3D._databaseSidecar.enemies['2'] = spec;
    w.model(spec.name, w.glb(tankFile), spec.ext, spec.file);
    return w;
}
/** Whether a body cell is ground a body is on at about `h`: level with it, and nobody else there. */
const clear = (w, tank, x, y, h) => Math.abs(w.Reactor3D.groundHeightAt(w.$dataMap, x + 0.5, y + 0.5, h) - h) <= 0.75 && !w.$gameFight.unitAt(x, y, tank, h);

test('North Haven: the tank put inside the inn\'s wall starts the battle on the nearest ground it fits, among a crowd nobody shares with it', t => {
    if (!fs.existsSync(tankFile) || !fs.existsSync(path.join(demoData, 'Map005.r3d.json'))) return t.skip('the Demo is not in this checkout');
    const crowd = [unit(301, 76, 59, 'enemy 2 move 8'), unit(302, 95, 55, 'enemy 6'), unit(303, 95, 65, 'enemy 6'), unit(304, 94, 59, 'enemy 7'), unit(305, 98, 57, 'enemy 8'), unit(306, 84, 55, 'enemy 6'), unit(307, 82, 62, 'enemy 6')];
    const w = northHaven(crowd), F = w.ReactorFight, G = F.Grid;
    const before = performance.now();
    assert.ok(w.$gameFight.start({ mode: 'tactical', turns: 'team' }) > 0);
    t.diagnostic(`battle start with the settle: ${(performance.now() - before).toFixed(0)} ms`);
    const fight = w.$gameFight, tank = fight.unitOfEvent(301), c = fight.character(tank);
    assert.equal(F.footprintSource(tank), 'model');
    assert.ok(F.footprint(tank).w * F.footprint(tank).h >= 60, 'a hull of some eighty cells');
    // It was put at 76,59 with half its hull in the inn (the house west of the square).
    const moved = Array.from(fight.placements()).find(entry => entry.unitId === tank.id);
    assert.ok(moved, 'the battle says it was moved');
    assert.deepEqual({ ...moved.from }, { x: 76, y: 59 });
    assert.ok(Math.hypot(c.x - 76, c.y - 59) <= F.SETTLE_REACH * 1.5, `not far from where it was put (${c.x},${c.y})`);
    const h = G.heightOf(c);
    for (const [x, y] of body(w, tank)) assert.ok(clear(w, tank, x, y, h), `${x},${y} under it is open ground with nobody on it`);
    // Nobody is inside it, and nobody's way leads through it.
    for (const other of fight._units) {
        if (other === tank) continue;
        const oc = fight.character(other);
        assert.equal(F.covers(tank, c.x, c.y, oc.x, oc.y), false, `unit ${other.id} at ${oc.x},${oc.y}`);
    }
    const me = fight._units.find(u => u.actorId === 1);
    G.flood(fight, me, 14);
    for (const [x, y] of body(w, tank)) { assert.equal(G.costAt(x, y), Infinity, `no way onto ${x},${y}`); assert.equal(fight.unitAt(x, y), tank); }
});

/** Every cell the flood in the grid's buffers reached, with the way the unit faces there: `visit(x, y, d)`. */
function eachReached(w, facing, visit) {
    const G = w.ReactorFight.Grid, out = [];
    let count = 0;
    for (let y = 30; y < 110; y++) for (let x = 40; x < 150; x++) {
        if (!G.reachedAt(x, y, out)) continue;
        count++;
        visit(x, y, G.facingAt(x, y) || facing);
    }
    return count;
}

test('North Haven: wherever the tank can drive every cell under it is open ground, clear of the lamps, the benches and the fountain', t => {
    if (!fs.existsSync(tankFile) || !fs.existsSync(path.join(demoData, 'Map005.r3d.json'))) return t.skip('the Demo is not in this checkout');
    // Alone in the open strip south of the fountain, facing east: the square's furniture leaves it one lane.
    const w = northHaven([unit(301, 86, 70, 'enemy 2 move 8'), unit(302, 110, 80, 'enemy 6')], [100, 47]);
    const F = w.ReactorFight, G = F.Grid, R = w.Reactor3D;
    assert.ok(w.$gameFight.start({ mode: 'tactical', turns: 'team' }) > 0);
    const fight = w.$gameFight, tank = fight.unitOfEvent(301), c = fight.character(tank);
    w.Game_CharacterBase.prototype.locate.call(c, 86, 70);
    c._direction = 6; c._reactorDir8 = 6;
    if (!G.fitsAt(fight, tank, 86, 70, 6, G.heightOf(c))) return t.skip('the strip south of the fountain is no longer open ground');
    const before = performance.now();
    const reached = G.flood(fight, tank, 30);
    t.diagnostic(`the tank's widest flood (30 steps): ${reached} cells in ${(performance.now() - before).toFixed(0)} ms`);
    assert.ok(reached >= 2, `it has somewhere to drive (${reached} cells)`);
    assert.ok(reached < 400, `and that is a lane, not the whole square (${reached} cells)`);
    eachReached(w, 6, (x, y, d) => {
        const f = F.footprintFacing(tank, d), bx = x + f.ox, by = y + f.oy, bw = f.w, bh = f.h, h = G.heightAt(x, y);
        for (let yy = by; yy < by + bh; yy++) for (let xx = bx; xx < bx + bw; xx++) {
            assert.ok(clear(w, tank, xx, yy, h), `standing at ${x},${y} facing ${d} its body would be on ${xx},${yy}`);
            assert.equal(G.stands(xx, yy, R.groundHeightAt(w.$dataMap, xx + 0.5, yy + 0.5, h)), true, `${xx},${yy} under it at ${x},${y} is a place to stand`);
        }
    });
    // A way it refuses: a man walks from the lane up past the fountain; the tank's flood does not hold that cell.
    const me = fight._units.find(u => u.actorId === 1);
    w.Game_CharacterBase.prototype.locate.call(fight.character(me), 86, 66);
    G.flood(fight, me, 12);
    const manNorth = G.costAt(86, 60);
    G.flood(fight, tank, 30);
    assert.ok(manNorth < Infinity, 'a man walks up beside the fountain');
    assert.equal(G.costAt(86, 60), Infinity, 'the tank has no way there: a bench and the fountain stand where its hull would be');
    assert.equal(G.pathTo(86, 60), null);
});

test('North Haven: a hull three cells high drives in through the inn\'s door (four wide), one five cells high never does', t => {
    if (!fs.existsSync(tankFile) || !fs.existsSync(path.join(demoData, 'Map005.r3d.json'))) return t.skip('the Demo is not in this checkout');
    const insideInn = (x, y, f) => x + f.ox <= 71 && y + f.oy >= 51 && y + f.oy + f.h - 1 <= 68;
    const drive = size => {
        const w = northHaven([unit(301, 78, 61, 'enemy 2 move 8'), unit(302, 110, 80, 'enemy 6')], [100, 47], size);
        const F = w.ReactorFight, G = F.Grid, R = w.Reactor3D;
        if (!(R.piecesAt(w.$dataMap, 72, 61) || []).some(piece => piece.kind === 'doorway')) return null;
        assert.ok(w.$gameFight.start({ mode: 'tactical', turns: 'team' }) > 0);
        const fight = w.$gameFight, tank = fight.unitOfEvent(301), c = fight.character(tank);
        c._direction = 4; c._reactorDir8 = 4;
        F.settle(fight);
        G.flood(fight, tank, 30);
        let inside = 0;
        const reached = eachReached(w, c.direction(), (x, y, d) => {
            const f = F.footprintFacing(tank, d), h = G.heightAt(x, y);
            if (insideInn(x, y, f)) inside++;
            for (let yy = y + f.oy; yy < y + f.oy + f.h; yy++) for (let xx = x + f.ox; xx < x + f.ox + f.w; xx++) assert.ok(clear(w, tank, xx, yy, h), `size ${size}: at ${x},${y} facing ${d} its body would be on ${xx},${yy}`);
        });
        return { inside, reached, high: F.footprintFacing(tank, 4).h };
    };
    const small = drive(6), large = drive(9);
    if (!small || !large) return t.skip('the inn\'s door is no longer at 72,61');
    assert.equal(small.high, 3);
    assert.equal(large.high, 5);
    assert.ok(small.inside > 0, `the hull of three drives into the inn (${small.inside} of ${small.reached} cells)`);
    assert.equal(large.inside, 0, `the hull of five stays out (${large.reached} cells reached)`);
});

test('North Haven: nobody wades in the fountain, stands on its rim, a bench or a lamp, or climbs a market stall in one step', t => {
    if (!fs.existsSync(path.join(demoData, 'Map005.r3d.json'))) return t.skip('the Demo is not in this checkout');
    const w = northHaven([unit(302, 110, 80, 'enemy 6')]), F = w.ReactorFight, G = F.Grid, R = w.Reactor3D;
    assert.ok(w.$gameFight.start({ mode: 'tactical', turns: 'team' }) > 0);
    const fight = w.$gameFight, me = fight._units.find(u => u.actorId === 1), out = [];
    G.flood(fight, me, 40);
    assert.ok(G.costAt(96, 62) < Infinity, 'the square itself is walked');
    // The square's furniture, as the Demo has it: skipped one by one where the map no longer has it.
    const kindAt = (x, y, kind) => (R.piecesAt(w.$dataMap, x, y) || []).some(piece => piece.kind === kind);
    const places = [[90, 60, 'sphere', 'the fountain\'s middle'], [89, 57, 'tube', 'its rim'], [87, 60, 'tube', 'its rim'], [84, 60, 'box', 'a bench'], [90, 54, 'box', 'a bench'], [78, 51, 'cylinder', 'a lamp']];
    for (const [x, y, kind, what] of places) {
        if (!kindAt(x, y, kind)) { t.diagnostic(`${what} is no longer at ${x},${y}`); continue; }
        assert.equal(G.reachedAt(x, y, out), 0, `${what} at ${x},${y} is no place to go`);
    }
    for (const [x, y] of [[88, 58], [89, 59], [91, 61], [92, 62]]) {
        if (!(R.waterDepthAt(w.$dataMap, x + 0.5, y + 0.5, R.groundHeightAt(w.$dataMap, x + 0.5, y + 0.5)) > 0)) continue;
        assert.equal(G.reachedAt(x, y, out), 0, `the basin at ${x},${y}`);
    }
    // Every top the physics calls no place to stop (a fence, a post, a lamp, a rim) that stands more than a threshold
    // over its cell's ground is none for the grid either, whatever it is made of.
    let tops = 0, plain = 0;
    for (let y = 40; y <= 85; y++) for (let x = 60; x <= 115; x++) {
        const base = R.pieceBaseAt(w.$dataMap, x, y);
        for (const level of w.ReactorPhysics.levelsAt(w.$dataMap, x, y)) {
            if (level.stand || level.top - base <= G.THRESHOLD) continue;
            tops++;
            if (!R.isShapeKind(level.kind)) plain++;
            assert.equal(G.stands(x, y, level.top), false, `the ${level.kind} at ${x},${y} (top ${level.top.toFixed(2)})`);
        }
    }
    if (!plain) t.diagnostic(`no fence or post in the square any more (${tops} tops looked at)`);
    // Nothing the flood reached in the square is more than a jump and a pull over the ground it came from in one step.
    for (let y = 46; y <= 72; y++) for (let x = 74; x <= 110; x++) {
        const levels = G.reachedAt(x, y, out);
        for (let i = 0; i < levels; i++) {
            const steps = G.pathTo(x, y, out[i * 2]), last = steps[steps.length - 1];
            if (!last || last.kind !== 'mantle') continue;
            const from = steps.length > 1 ? steps[steps.length - 2].height : G.heightOf(fight.character(me));
            assert.ok(last.height - from <= F.jumpOf(me) + G.CLIMB_OVER + 0.02, `a pull of ${(last.height - from).toFixed(2)} onto ${x},${y}`);
        }
    }
});
