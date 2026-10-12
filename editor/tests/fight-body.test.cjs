'use strict';
// Tactical battles: what a body may do among other bodies, water, eaves and walls, and what the pointer meets of
// it. The real 3D runtime, physics and fight in one context (helpers/fight-real-world.cjs): plain floors built for
// each case, and the Demo's North Haven for the fountain.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { realWorld, event } = require('./helpers/fight-real-world.cjs');
const { fightWorld } = require('./helpers/fight-world.cjs');

const repo = path.resolve(__dirname, '..', '..');
const W = 40, H = 30;
const unit = (id, x, y, text, extra = {}) => event(id, x, y, Object.assign({ note: `<unit: ${text}>` }, extra));
const rect = f => [f.ox, f.oy, f.w, f.h];
const hero = w => w.$gameFight._units.find(u => u.actorId === 1);
const row = (y, x0, x1) => { const out = []; for (let x = x0; x <= x1; x++) out.push([x, y]); return out; };
const column = (x, y0, y1) => { const out = []; for (let y = y0; y <= y1; y++) out.push([x, y]); return out; };

/**
 * A world whose enemy 1 (the party's leader with `actor`) wears a hull: a box `wide` across, `long` the way it
 * faces and `tall` high (2.6 by 6.6 by 1.5: three cells by seven); `shift` moves the mesh along its length off the
 * unit's own cell; `template(w)` builds another model.
 */
function hullWorld(options = {}) {
    const w = realWorld(options), wide = options.wide || 2.6, long = options.long || 6.6, tall = options.tall || 1.5;
    w.model('Vehicles/Truck', options.template ? options.template(w) : w.boxModel(wide, tall, long, options.shift || 0));
    const spec = { name: 'Vehicles/Truck', ext: '.glb', size: Math.max(wide, long, tall), scale: 1, yaw: 0 };
    w.Reactor3D._databaseSidecar = options.actor ? { actors: { 1: spec } } : { enemies: { 1: spec } };
    w.$dataEnemies[1].params[0] = 9000;
    return w;
}
/** The map was changed under the game: what was read of it is read again. */
function changed(w) {
    w.ReactorFight.forgetFootprints();
    if (w.ReactorPhysics && w.ReactorPhysics.forgetEdges) w.ReactorPhysics.forgetEdges(w.$dataMap);
}
/** Cells four tiles high (walls), or any height given. */
function raise(w, cells, height = 4) {
    const side = w.$dataMap.reactor3d;
    if (!side.elevation) side.elevation = new Array(w.$dataMap.width * w.$dataMap.height).fill(0);
    for (const [x, y] of cells) side.elevation[y * w.$dataMap.width + x] = height;
    changed(w);
}
function begin(w, options = {}) {
    assert.ok(w.$gameFight.start(Object.assign({ mode: 'tactical' }, options)) > 0);
    w.run(90, () => w.$gameFight.awaitsPlayer());
    return w.$gameFight;
}
function body(w, u, d) {
    const c = w.$gameFight.character(u), F = w.ReactorFight, f = d ? F.footprintFacing(u, d) : F.footprint(u), out = [];
    for (let y = c.y + f.oy; y < c.y + f.oy + f.h; y++) for (let x = c.x + f.ox; x < c.x + f.ox + f.w; x++) out.push([x, y]);
    return out;
}
/** Every cell the flood in the grid's buffers lets the unit stop on within `steps`, as "x,y". */
function stops(w, steps) {
    const G = w.ReactorFight.Grid, out = [], levels = [];
    for (let y = 0; y < w.$dataMap.height; y++) for (let x = 0; x < w.$dataMap.width; x++) {
        const count = G.reachedAt(x, y, levels);
        for (let i = 0; i < count; i++) if (levels[i * 2 + 1] <= steps && G.canStopAt(x, y, levels[i * 2])) { out.push(x + ',' + y); break; }
    }
    return out;
}

//-----------------------------------------------------------------------------
// Bodies among bodies.

test('nobody walks through a body of many cells, whoever\'s it is: its own side goes round it too, and still walks through its own of one cell', () => {
    // A hull three wide and seven long (enemy 1) standing north-south on 19..21, 11..17; a soldier of its side west
    // of its middle and another behind him; the party's leader south-west of it.
    const w = hullWorld({ events: [unit(1, 20, 14, 'enemy 1'), unit(2, 18, 14, 'enemy 2 move 8'), unit(3, 17, 14, 'enemy 2'), unit(4, 34, 26, 'ally 2')], start: [18, 19], party: [1] });
    const fight = begin(w, { turns: 'team' }), F = w.ReactorFight, G = F.Grid;
    const hull = fight.unitOfEvent(1), soldier = fight.unitOfEvent(2), hc = fight.character(hull);
    assert.deepEqual(rect(F.footprint(hull)), [-1, -3, 3, 7]);
    const inside = (x, y) => F.covers(hull, hc.x, hc.y, x, y);
    G.flood(fight, soldier, 14);
    const way = G.pathTo(22, 14);
    assert.ok(way, 'there is a way to the cell east of the hull');
    assert.deepEqual(Array.from(way).filter(step => inside(step.x, step.y)).map(step => [step.x, step.y]), [], 'and it does not lead through the hull of its own side');
    assert.ok(G.costAt(22, 14) >= 10, `round its end (${G.costAt(22, 14)} steps)`);
    for (const [x, y] of body(w, hull)) assert.equal(G.costAt(x, y), Infinity, `no way onto ${x},${y}`);
    // A friend of one cell is walked through as ever: over his cell and on, never stopped on.
    assert.equal(G.costAt(16, 14), 2);
    assert.ok(G.pathTo(16, 14).some(step => step.x === 17 && step.y === 14));
    assert.equal(G.canStopAt(17, 14), false);
    // The other side goes round it as it always did.
    G.flood(fight, hero(w), 14);
    const mine = G.pathTo(22, 16);
    assert.ok(mine && Array.from(mine).every(step => !inside(step.x, step.y)));
});

test('a long body turned where it stands is offered the move of the way it now faces, and a step of a way is taken facing as the way says', () => {
    // A hull three wide and seven long whose own cell is nearer its tail, the party's leader: facing down it covers
    // rows 12..18 from its cell at 20,14, facing right columns 18..24.
    const w = hullWorld({ actor: true, shift: 1, events: [unit(1, 34, 26, 'enemy 2')], start: [20, 14], party: [1] });
    // A street three wide (19..21, rows 11..22) shut at its north end, with a pocket across it (18..24, rows 13..15).
    const free = (x, y) => (x >= 19 && x <= 21 && y >= 11 && y <= 22) || (x >= 18 && x <= 24 && y >= 13 && y <= 15);
    const shut = [];
    for (let y = 5; y <= 25; y++) for (let x = 12; x <= 30; x++) if (!free(x, y)) shut.push([x, y]);
    raise(w, shut);
    const fight = begin(w, { turns: 'team' }), F = w.ReactorFight, G = F.Grid, me = hero(w), c = fight.character(me);
    assert.deepEqual([2, 4, 6, 8].map(d => rect(F.footprintFacing(me, d))), [[-1, -2, 3, 7], [-4, -1, 7, 3], [-2, -1, 7, 3], [-1, -4, 3, 7]]);
    assert.equal(c.direction(), 2);
    assert.ok(fight.commandSelectUnit(me.id));
    const before = Array.from(fight.moveCells(), cell => cell.x + ',' + cell.y);
    assert.ok(before.includes('20,13'), 'facing down it backs up a cell');
    assert.deepEqual(Array.from(G.pathTo(20, 13), step => [step.d, step.face]), [[8, 2]]);
    // OK on its own cell, turned to the right at the menu (the pocket gives it room), Escape back to the move.
    assert.ok(fight.commandMoveTo(c.x, c.y));
    fight.commandFace(6);
    assert.equal(c.direction(), 6);
    assert.ok(fight.commandCancel());
    assert.equal(fight._act.stage, 'move');
    const offered = Array.from(fight.moveCells(), cell => cell.x + ',' + cell.y).sort();
    G.flood(fight, me, fight._act.steps);
    assert.deepEqual(offered, stops(w, fight._act.steps).sort(), 'the move it is offered is the one a fresh look gives for the way it faces now');
    assert.ok(!offered.includes('20,13'), 'facing across the street there is no backing up it');
    // A step of a way found facing down, taken while it faces right: it is taken facing down, as the way was found.
    c.setThrough(true);
    fight.takeStep(c, { x: 20, y: 13, d: 8, face: 2, hop: false, kind: 'walk', height: 0 });
    w.run(60, () => !c.isMoving());
    assert.deepEqual([c.x, c.y, c.direction()], [20, 13, 2]);
    const wallUnder = body(w, me).filter(([x, y]) => !free(x, y));
    assert.deepEqual(wallUnder, [], 'no cell of it in a wall');
});

test('a hull that covers the same cells facing either way has no room to turn round in a street its own width: it backs up', () => {
    const w = hullWorld({ events: [unit(1, 20, 14, 'enemy 1 move 6'), unit(2, 34, 26, 'ally 2')], start: [36, 2], party: [1] });
    raise(w, column(18, 4, 26).concat(column(22, 4, 26)));
    const fight = begin(w), F = w.ReactorFight, G = F.Grid, hull = fight.unitOfEvent(1), c = fight.character(hull);
    assert.equal(c.direction(), 2);
    assert.deepEqual(rect(F.footprintFacing(hull, 2)), rect(F.footprintFacing(hull, 8)), 'the same cells facing up as facing down');
    assert.equal(F.turnsBody(hull), true);
    assert.equal(F.canFace(fight, hull, 4), false);
    assert.equal(F.canFace(fight, hull, 8), false, 'a half turn swings through the quarter turn, for which the street is too narrow');
    c.setDirection(8);
    assert.equal(c.direction(), 2, 'the turn is not taken');
    G.flood(fight, hull, 6);
    assert.deepEqual(Array.from(G.pathTo(20, 11), step => [step.d, step.face]), [[8, 2], [8, 2], [8, 2]], 'up the street backward');
    assert.equal(G.facingAt(20, 11), 2);
    assert.equal(G.facingAt(20, 17), 2, 'and down it forward');
    // In the open it turns round where it stands, and drives up forward.
    raise(w, column(18, 4, 26).concat(column(22, 4, 26)), 0);
    assert.equal(F.canFace(fight, hull, 8), true);
    G.flood(fight, hull, 6);
    assert.equal(G.facingAt(20, 11), 8);
});

test('a long body keeps the way it turned to aim while its own action plays, in front or beside the others, and is drawn the way its cells lie', () => {
    const w = hullWorld({ events: [unit(1, 20, 14, 'enemy 1'), unit(2, 34, 26, 'ally 2')], start: [20, 18], party: [1] });
    const fight = begin(w), F = w.ReactorFight, hull = fight.unitOfEvent(1), c = fight.character(hull);
    c._direction = 8; c._reactorDir8 = 8;
    assert.equal(F.canFace(fight, hull, 4), true, 'in the open it turns as it likes');
    // Turned an eighth of a turn toward someone off its line (an aim, eight ways): a figure is drawn so, a hull stays on its cells.
    const figure = fight.character(fight.unitOfEvent(2));
    c._reactorDir8 = 9;
    figure._reactorDir8 = 9;
    w.run(1);
    assert.equal(c._reactorDir8, 8, 'the hull is drawn as its body lies');
    assert.equal(w.Reactor3D.characterModelDir8(c), 8);
    assert.equal(figure._reactorDir8, 9, 'a figure keeps the eighth turn');
    // Its action begins on the leader south of it: it turns round to him once.
    fight.beginUnit(hull);
    assert.ok(fight.beginAction(hull, 'skill', fight.battler(hull).attackSkillId(), 20, 18));
    assert.equal(c.direction(), 2);
    assert.equal(fight._run.subjectId, hull.id);
    // Whatever turns it while the action plays (a sequence facing its target, the way back to how it stood) is not taken.
    assert.equal(F.canFace(fight, hull, 4), false);
    c.setDirection(4);
    assert.equal(c.direction(), 2);
    c.setDirection(8);
    assert.equal(c.direction(), 2);
    assert.deepEqual(rect(F.footprint(hull)), [-1, -3, 3, 7]);
    // The action over, it turns again.
    const run = fight._run;
    fight._run = null;
    assert.equal(F.canFace(fight, hull, 4), true);
    // An action played beside the others' holds it the same way.
    fight.tac().runs = [run];
    assert.equal(F.canFace(fight, hull, 4), false);
    fight.tac().runs = null;
    // A unit of one cell turns whatever plays.
    const small = fight.character(hero(w));
    fight._run = { subjectId: hero(w).id };
    small.setDirection(4);
    assert.equal(small.direction(), 4);
    fight._run = null;
});

//-----------------------------------------------------------------------------
// The ground under a body and the room over it.

test('a body needs room over it: a hull taller than a deck is high stops with its rim under it, a lower hull drives through', () => {
    const drive = tall => {
        const w = hullWorld({ tall, events: [unit(1, 16, 14, 'enemy 1 move 12'), unit(2, 36, 26, 'ally 2')], start: [4, 26], party: [1] });
        const side = w.$dataMap.reactor3d;
        side.pieces = side.pieces || [];
        // A deck three tiles up over columns 24..27, rows 8..20: the ground under it is open.
        for (let y = 8; y <= 20; y++) for (let x = 24; x <= 27; x++) side.pieces.push({ kind: 'floor', x, y, z: 3 });
        changed(w);
        const fight = begin(w), F = w.ReactorFight, G = F.Grid, hull = fight.unitOfEvent(1), c = fight.character(hull);
        c._direction = 6; c._reactorDir8 = 6;
        F.forgetFootprints();
        assert.deepEqual(rect(F.footprint(hull)), [-3, -1, 7, 3]);
        const fitsUnder = G.fitsAt(fight, hull, 25, 14, 6, 0);
        G.flood(fight, hull, 12);
        const out = { tall: F.unitHeight(hull), rim: F.rimOf(F.unitHeight(hull)), fitsUnder, under: G.costAt(25, 14), nose: G.costAt(22, 14), middle: G.costAt(23, 14), room: w.ReactorPhysics.ceilingAbove(w.$dataMap, 25, 14, 0) };
        G.flood(fight, hero(w), 40);
        out.man = G.costAt(25, 14, 0);
        return out;
    };
    const high = drive(5), low = drive(1.5);
    assert.equal(high.tall, 5);
    assert.ok(high.room > 2.5 && high.room <= 3.2, `the deck leaves three tiles under it (${high.room})`);
    assert.ok(high.man < Infinity, 'a man walks under the deck');
    assert.equal(high.fitsUnder, false, 'a hull five tiles high does not stand under it');
    assert.equal(high.under, Infinity, 'nor drive there');
    assert.ok(high.rim < high.room, 'its rim is lower than the deck');
    assert.ok(high.nose < Infinity, 'its low end goes under the deck\'s edge');
    assert.equal(high.middle, Infinity, 'its middle does not');
    assert.equal(low.fitsUnder, true, 'a hull a tile and a half high stands under it');
    assert.ok(low.under < Infinity, 'and drives through');
});

test('no wall or closed side lies between two cells of a body', () => {
    const w = hullWorld({ events: [unit(1, 10, 6, 'enemy 1 move 8'), unit(2, 36, 26, 'ally 2')], start: [4, 26], party: [1] });
    // One tile nobody leaves eastward (a fence along its east side) at 19,20: both cells beside the fence are open ground.
    w.$dataTilesets[1].flags[1537] = 0x04;
    w.$dataMap.data[20 * W + 19] = 1537;
    changed(w);
    const fight = begin(w), F = w.ReactorFight, G = F.Grid, hull = fight.unitOfEvent(1);
    assert.equal(w.$gameMap.isPassable(19, 20, 6), false);
    assert.equal(w.$gameMap.isPassable(19, 20, 2), true);
    assert.equal(G.blocksSight(19, 20), false, 'the cell itself is open');
    assert.equal(G.fitsAt(fight, hull, 23, 21, 2, 0), true, 'beside the fence the hull has room');
    assert.equal(G.fitsAt(fight, hull, 18, 21, 2, 0), true, 'with the fence along its own side as well');
    assert.equal(G.fitsAt(fight, hull, 20, 21, 2, 0), false, 'across the fence it has none');
    assert.equal(G.fitsAt(fight, hull, 19, 21, 2, 0), false);
    // A man is stopped by the fence itself, not by the cells.
    G.flood(fight, hero(w), 60);
    assert.ok(G.costAt(19, 20) < Infinity && G.costAt(20, 20) < Infinity);
});

test('a unit the battle finds where nobody may stand is not held there: it goes on over such ground until it is out, and nobody else goes in', () => {
    const w = realWorld({ events: [unit(1, 30, 20, 'enemy 1')], start: [10, 10], party: [1] });
    const fight = begin(w), F = w.ReactorFight, G = F.Grid, me = hero(w), c = fight.character(me);
    // A pond five cells square round the leader: the world says nobody stands in it.
    const pond = (x, y) => x >= 8 && x <= 12 && y >= 8 && y <= 12;
    G.standsAt = (x, y) => !pond(x, y);
    G.forget();
    try {
        assert.equal(G.stands(c.x, c.y, 0), false);
        G.flood(fight, me, 4);
        assert.ok(G.costAt(11, 10) === 1 && G.costAt(12, 10) === 2, 'through the pond');
        assert.equal(G.costAt(13, 10), 3, 'and out of it');
        assert.equal(G.costAt(14, 10), 4);
        assert.equal(G.canStopAt(13, 10), true);
        assert.ok(stops(w, 4).length > 20, 'it has somewhere to go');
        // Out of the pond it does not wade back in, and neither does anyone who stood outside.
        w.Game_CharacterBase.prototype.locate.call(c, 13, 10);
        G.flood(fight, me, 6);
        for (let y = 8; y <= 12; y++) for (let x = 8; x <= 12; x++) assert.equal(G.costAt(x, y), Infinity, `${x},${y} in the pond`);
        assert.equal(G.costAt(7, 10), Infinity, 'the far bank is further than round the pond in six steps');
        assert.ok(G.costAt(13, 7) < Infinity, 'round it');
    } finally {
        G.standsAt = null;
        G.forget();
    }
});

const baseline = path.join(repo, 'scratchpad/ux-pass/baseline/demo-data');
const demoData = fs.existsSync(path.join(baseline, 'Map005.r3d.json')) ? baseline : path.join(repo, 'template/Demo/data');
const unitComment = c => (c.code === 108 || c.code === 408) && /<unit/i.test(String(c.parameters[0]));
/** North Haven with the party's leader put at `start`, the map's own units left out (the test brings its own) and its rocks (meshing them takes a quarter of a minute; none stands in the square). */
function northHaven(events, start) {
    const w = realWorld({ data: demoData, mapId: 5, start, events, party: [1], prepare: map => {
        map.reactor3d.pieces = map.reactor3d.pieces.filter(piece => piece.kind !== 'rock');
        for (const e of map.events) {
            if (!e || e.id >= 300) continue;
            e.rrUnit = undefined; e.note = String(e.note || '').replace(/<unit[^>]*>/ig, '');
            for (const p of e.pages) p.list = p.list.filter(c => !unitComment(c));
        }
    } });
    w.$gamePlayer._reactorGround = w.Reactor3D.groundHeightAt(w.$dataMap, start[0] + 0.5, start[1] + 0.5);
    return w;
}

test('North Haven: a unit the battle finds in the fountain\'s basin wades to its rim, pulls itself over and walks off', t => {
    if (!fs.existsSync(path.join(demoData, 'Map005.r3d.json'))) return t.skip('the Demo is not in this checkout');
    const w = northHaven([unit(302, 96, 62, 'enemy 6')], [89, 59]), R = w.Reactor3D, F = w.ReactorFight, G = F.Grid;
    const bottom = R.groundHeightAt(w.$dataMap, 89.5, 59.5);
    if (!(R.waterDepthAt(w.$dataMap, 89.5, 59.5, bottom) > (R.WATER_WADE || 0.45))) return t.skip('the fountain\'s basin is no longer at 89,59');
    assert.ok(w.$gameFight.start({ mode: 'tactical', turns: 'team' }) > 0);
    const fight = w.$gameFight, me = hero(w), c = fight.character(me);
    assert.deepEqual([c.x, c.y], [89, 59], 'the battle leaves it where it stood');
    // The basin's bed is plain ground the physics lets a body stand on: the water over it is what says no.
    assert.equal(w.ReactorPhysics.levelsAt(w.$dataMap, 89, 59).some(level => level.stand && Math.abs(level.top - bottom) < 0.01), true);
    assert.equal(G.stands(89, 59, bottom), false, 'deep water is no place to stand');
    assert.equal(G.stands(86, 62, R.groundHeightAt(w.$dataMap, 86.5, 62.5)), true, 'the square is');
    const out = [];
    const ground = steps => {
        const list = [];
        for (let y = 52; y <= 66; y++) for (let x = 82; x <= 97; x++) {
            const levels = G.reachedAt(x, y, out);
            for (let i = 0; i < levels; i++) if (out[i * 2 + 1] <= steps && G.stands(x, y, out[i * 2]) && G.canStopAt(x, y, out[i * 2])) list.push([x, y, out[i * 2]]);
        }
        return list;
    };
    // With a move of 6 it is out in one turn: through the water (two a cell), a pull over the rim, onto the square.
    G.flood(fight, me, 6);
    const dry = ground(6);
    assert.ok(dry.length >= 3, `it reaches the square (${dry.length} cells)`);
    const way = G.pathTo(dry[0][0], dry[0][1], dry[0][2]);
    assert.ok(way.some(step => step.kind === 'mantle'), 'over the rim by a pull up');
    assert.ok(R.waterDepthAt(w.$dataMap, way[0].x + 0.5, way[0].y + 0.5, way[0].height) > 0.12, 'by wading first');
    // With a move of 4 it cannot be out yet, and may stop nearer the rim: the turn after, it is.
    G.flood(fight, me, 4);
    assert.equal(ground(4).length, 0);
    assert.ok(G.costAt(88, 59) <= 4 && G.canStopAt(88, 59), 'it wades toward the rim');
    w.Game_CharacterBase.prototype.locate.call(c, 88, 59);
    c._reactorGround = R.groundHeightAt(w.$dataMap, 88.5, 59.5);
    G.flood(fight, me, 4);
    assert.ok(ground(4).length >= 1, 'and is out on the next move');
    // From the square nobody goes in: not into the water, not onto the rim.
    const there = ground(4)[0];
    w.Game_CharacterBase.prototype.locate.call(c, there[0], there[1]);
    c._reactorGround = there[2];
    G.flood(fight, me, 12);
    for (const [x, y] of [[88, 59], [89, 59], [90, 58], [87, 59], [89, 57]]) assert.equal(G.reachedAt(x, y, out), 0, `${x},${y}`);
});

//-----------------------------------------------------------------------------
// What the pointer meets of a hull.

/** A hull 2.6 wide, 1.5 high and 4 long with a gun 0.2 thick reaching 2.6 on ahead of it at chest height: its box is 6.6 long. */
function gunHull(w) {
    return vm.runInContext(`(function() {
        const template = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 4));
        hull.position.set(0, 0.75, -1.3);
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2.6));
        gun.position.set(0, 1.0, 2.0);
        template.add(hull);
        template.add(gun);
        template.userData.glbSize = { x: 2.6, y: 1.5, z: 6.6 };
        return template;
    })()`, w);
}

test('the pointer meets a hull where its mesh is, not in its gun\'s whole box; whoever stands by its low end is taken by the feet, the ground beside it is ground', () => {
    // The hull stands north-south on 19..21, 11..17. Soldiers beyond both its ends and west of rows 12 and 16.
    const w = hullWorld({ template: gunHull, events: [unit(1, 20, 14, 'enemy 1'), unit(2, 20, 10, 'enemy 2'), unit(3, 20, 18, 'enemy 2'), unit(4, 18, 12, 'enemy 2'), unit(5, 18, 16, 'enemy 2'), unit(6, 36, 26, 'ally 2')], start: [4, 4], party: [1] });
    const fight = begin(w), F = w.ReactorFight, In = F.Input, hull = fight.unitOfEvent(1);
    assert.deepEqual(rect(F.footprint(hull)), [-1, -3, 3, 4], 'its body is its hull');
    assert.equal(F.overhang(hull).length, 6, 'and its gun is over three cells more');
    const down = (x, y) => In.unitOnRay(fight, x + 0.5, 20, y + 0.5, 0, -1, 0);
    // Which end the gun is at: over the middle of an end row there is mesh either way, at that row's corner only under the hull itself.
    assert.equal(down(20, 11), hull);
    assert.equal(down(20, 17), hull);
    const north = down(19, 11) === null, south = down(19, 17) === null;
    assert.ok(north !== south, 'one end is the hull, the other the gun with air either side of it');
    const gun = north ? -1 : 1;
    for (const dy of [3, 2]) {
        assert.equal(down(19, 14 + gun * dy), null, `beside the gun at row ${14 + gun * dy} there is no hull`);
        assert.equal(down(21, 14 + gun * dy), null);
        assert.equal(down(20, 14 + gun * dy), hull, 'on the gun there is');
    }
    assert.equal(down(19, 14 - gun * 3), hull, 'the hull\'s own corner');
    // The soldier west of the gun's rows, pointed at by the feet from the east, over those cells: the line passes
    // over the gun and through the box round hull and gun where there is no mesh.
    const beside = fight.unitOfEvent(gun < 0 ? 4 : 5), bc = fight.character(beside);
    const slant = Math.hypot(1, 0.7);
    assert.equal(In.unitOnRay(fight, bc.x + 0.5 + 8, 0.7 * 8, bc.y + 0.5, -1 / slant, -0.7 / slant, 0), beside, 'the soldier beside the gun, by the feet');
    // The ground on the gun's other side inside that box (the cell under the air beside it), pointed at from the
    // east: ground, not the hull.
    assert.equal(In.unitOnRay(fight, 21.5 + 8, 0.7 * 8, bc.y + 0.5, -1 / slant, -0.7 / slant, 0), null);
    // The soldier a cell beyond the hull's low end, pointed at by the feet from over the hull: the line comes in over
    // its top and dips under its rim's height only at its very end. He is the one meant.
    const behind = fight.unitOfEvent(gun < 0 ? 3 : 2), hc = fight.character(behind);
    assert.equal(hc.y, 14 - gun * 4);
    const along = [0, -0.7 / slant, -gun / slant];
    const feet = (x, y) => In.unitOnRay(fight, x + 0.5, 0.7 * 9, y + 0.5 + gun * 9, along[0], along[1], along[2]);
    assert.equal(feet(hc.x, hc.y), behind, 'the soldier behind its end, by the feet');
    // The same line a cell to the side comes down on empty ground behind the hull's corner: there it is the hull's edge.
    assert.equal(feet(hc.x + 1, hc.y), hull, 'with nobody on the ground there it is the hull');
    // Higher up the same way, over the hull's middle, it is the hull whoever stands behind it.
    assert.equal(In.unitOnRay(fight, 20.5, 0.7 * 9, 14.5 + gun * 9 - gun * 3, along[0], along[1], along[2]), hull);
    assert.equal(F.Input.unitOnRay(fight, 20.5, 20, 14.5, 0, -1, 0), hull);
});

//-----------------------------------------------------------------------------
// What sticks out of a body.

const pairs = list => { const out = []; for (let i = 0; list && i < list.length; i += 2) out.push(list[i] + ',' + list[i + 1]); return out.sort(); };
const AHEAD = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] };

test('a gun\'s barrel is no part of the body: the body is the hull, the cells under the barrel are nobody\'s to stand on, and the hull needs them free and open', () => {
    // The hull (enemy 1) on 19..21, 11..14 facing down, its gun over 20,15 to 20,17. A soldier of its side west of
    // the gun, the party's leader east of it, an ally six cells down its line.
    const w = hullWorld({ template: gunHull, events: [unit(1, 20, 14, 'enemy 1 move 8'), unit(2, 20, 22, 'ally 2'), unit(3, 17, 16, 'enemy 2 move 9')], start: [22, 16], party: [1] });
    const fight = begin(w, { turns: 'team' }), F = w.ReactorFight, G = F.Grid, hull = fight.unitOfEvent(1), c = fight.character(hull), soldier = fight.unitOfEvent(3), me = hero(w);
    assert.deepEqual(fight.placements().length, 0, 'everyone has room as they were put');
    assert.equal(c.direction(), 2);
    assert.deepEqual([2, 4, 6, 8].map(d => rect(F.footprintFacing(hull, d))), [[-1, -3, 3, 4], [0, -1, 4, 3], [-3, -1, 4, 3], [-1, 0, 3, 4]], 'the hull alone, four cells long behind its own');
    for (const d of [2, 4, 6, 8]) assert.deepEqual(pairs(F.overhangFacing(hull, d)), [1, 2, 3].map(n => AHEAD[d][0] * n + ',' + AHEAD[d][1] * n).sort(), `facing ${d} its gun is over the three cells ahead`);
    assert.deepEqual(pairs(F.overhang(hull)), pairs(F.overhangFacing(hull, 2)), 'as it faces now');
    assert.equal(F.turnsBody(hull), true);
    // The cells under the gun are not the unit: nobody is struck or picked there.
    for (const y of [15, 16, 17]) {
        assert.equal(fight.unitAt(20, y), null, `nobody is on 20,${y}`);
        assert.equal(F.overhangAt(fight, 20, y), hull, 'the gun is over it');
    }
    assert.equal(F.overhangAt(fight, 19, 15), null);
    assert.equal(F.overhangAt(fight, 20, 15, hull), null, 'but for the hull itself');
    // The other side: no way onto them or through them, a place to stand beside them, and round the gun's tip to its far side.
    G.flood(fight, me, 12);
    for (const y of [15, 16, 17]) assert.equal(G.costAt(20, y), Infinity, `no way onto 20,${y}`);
    assert.ok(G.costAt(21, 16) === 1 && G.canStopAt(21, 16), 'beside the gun is a place to stand');
    assert.equal(G.costAt(19, 16), 7, 'round its tip');
    // Its own side the same.
    G.flood(fight, soldier, 9);
    for (const y of [15, 16, 17]) assert.equal(G.costAt(20, y), Infinity);
    assert.equal(G.costAt(21, 16), 8);
    // The hull has room where it stands; with someone under its gun, a wall there, or ground a tile up, it has not.
    const sc = fight.character(soldier), place = (x, y) => w.Game_CharacterBase.prototype.locate.call(sc, x, y);
    assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), true);
    place(20, 16);
    assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), false, 'its gun would be through him');
    place(19, 16);
    assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), true, 'beside the gun he is in nobody\'s way');
    place(17, 16);
    raise(w, [[20, 17]]);
    assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), false, 'a wall where its gun would be');
    raise(w, [[20, 17]], 1);
    assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), false, 'ground a tile up, higher than it leans');
    raise(w, [[20, 17]], 0);
    raise(w, [[19, 16]]);
    assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), true, 'a wall beside its gun is beside it');
    raise(w, [[19, 16]], 0);
    // On a terrace two tiles up whose edge runs under its gun: beyond the edge there is air under the barrel.
    const terrace = [];
    for (let y = 9; y <= 16; y++) for (let x = 17; x <= 23; x++) terrace.push([x, y]);
    raise(w, terrace, 2);
    assert.equal(w.Reactor3D.groundHeightAt(w.$dataMap, 20.5, 16.5, 2), 2);
    assert.equal(w.Reactor3D.groundHeightAt(w.$dataMap, 20.5, 17.5, 2), 0);
    assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 2), true, 'its gun out over the drop');
    assert.equal(G.fitsAt(fight, hull, 20, 16, 2, 2), true, 'up to the edge');
    assert.equal(G.fitsAt(fight, hull, 20, 17, 2, 2), false, 'its body does not hang over it');
    // Whatever is down there (a pond nobody stands in): it is under the barrel by two tiles.
    G.standsAt = (x, y) => !(x === 20 && y === 17);
    G.forget();
    try {
        assert.equal(G.stands(20, 17, 0), false);
        assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 2), true, 'its gun out over the pond below');
    } finally {
        G.standsAt = null;
        G.forget();
    }
    raise(w, terrace, 0);
    // It does not turn its gun into anyone, nor drive it into anyone: the ally six cells down its line stops it four cells on.
    place(22, 14);
    assert.equal(F.covers(hull, 20, 14, 22, 14), false);
    assert.equal(F.canFace(fight, hull, 6), false, 'turned right its gun would be through the soldier, though its body has room');
    place(17, 16);
    assert.equal(F.canFace(fight, hull, 6), true);
    assert.equal(F.canFace(fight, hull, 4), true);
    G.flood(fight, hull, 5);
    assert.equal(G.costAt(20, 18), 4, 'its gun up to the ally');
    assert.equal(G.costAt(20, 19), Infinity, 'and no further');
    const levels = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!G.reachedAt(x, y, levels) || (x === c.x && y === c.y)) continue;
        const d = G.facingAt(x, y);
        for (let n = 1; n <= 3; n++) assert.equal(fight.unitAt(x + AHEAD[d][0] * n, y + AHEAD[d][1] * n, hull), null, `at ${x},${y} facing ${d} its gun is over nobody`);
    }
});

test('a fence between a hull and the cell under its gun, or a tile nobody walks under it, leaves the gun no room; on a flat map as well', () => {
    for (const flat of [false, true]) {
        const w = hullWorld({ flat, template: gunHull, events: [unit(1, 20, 14, 'enemy 1'), unit(2, 34, 26, 'ally 2')], start: [4, 4], party: [1] });
        const fight = begin(w), F = w.ReactorFight, G = F.Grid, hull = fight.unitOfEvent(1), me = hero(w);
        const tile = (x, y, id) => { w.$dataMap.data[y * W + x] = id; changed(w); };
        assert.deepEqual(rect(F.footprint(hull)), [-1, -3, 3, 4], flat ? 'on a flat map' : 'on a 3D map');
        assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), true);
        // A tile nobody leaves downward under the hull's front: the way from its body to the cell under its gun is shut.
        w.$dataTilesets[1].flags[1537] = 0x01;
        tile(20, 14, 1537);
        assert.equal(w.$gameMap.isPassable(20, 14, 2), false);
        assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), false, 'a fence across its gun');
        tile(20, 14, 1536);
        // The same fence a cell on, between two cells under the gun.
        tile(20, 15, 1537);
        assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), false);
        tile(20, 15, 1536);
        assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), true);
        // Facing right, a tile nobody leaves eastward under its front: the same across its gun that way.
        assert.equal(G.fitsAt(fight, hull, 20, 14, 6, 0), true);
        w.$dataTilesets[1].flags[1539] = 0x04;
        tile(20, 14, 1539);
        assert.equal(w.$gameMap.isPassable(20, 14, 6), false);
        assert.equal(G.fitsAt(fight, hull, 20, 14, 6, 0), false, 'a fence across its gun, facing right');
        tile(20, 14, 1536);
        // A tile nobody walks onto from any side under the gun's tip.
        w.$dataTilesets[1].flags[1538] = 0x60f;
        tile(20, 17, 1538);
        assert.equal(G.blocksSight(20, 17), true);
        assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), false, 'a wall under its gun');
        tile(20, 17, 1536);
        assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), true);
        // Ground on its own level that is no place to stand (a fountain's rim, a bench): the gun is not laid across it.
        if (!flat) {
            G.standsAt = (x, y) => !(x === 20 && y === 17);
            G.forget();
            try {
                assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), false, 'a rim under its gun');
                assert.equal(G.fitsAt(fight, hull, 21, 14, 2, 0), true, 'beside it the gun is clear');
            } finally {
                G.standsAt = null;
                G.forget();
            }
        }
        // Someone under it.
        w.Game_CharacterBase.prototype.locate.call(fight.character(me), 20, 16);
        assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), false, 'someone under its gun');
        G.flood(fight, fight.unitOfEvent(2), 60);
        assert.equal(G.costAt(20, 15), Infinity, 'and nobody walks under it');
    }
});

/** A hull 2.6 square and 1.5 high with a gun 0.2 thick reaching 2.6 on ahead of it at chest height: the same nine cells whichever way it faces. */
function squareGunHull(w) {
    return vm.runInContext(`(function() {
        const template = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 2.6));
        hull.position.set(0, 0.75, 0);
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2.6));
        gun.position.set(0, 1.0, 2.6);
        template.add(hull);
        template.add(gun);
        template.userData.glbSize = { x: 2.6, y: 1.5, z: 5.2 };
        return template;
    })()`, w);
}

test('a hull that is the same cells every way still turns its gun: only where the gun has room, and whoever kept its move looks again', () => {
    const w = hullWorld({ long: 5.2, template: squareGunHull, events: [unit(1, 20, 14, 'enemy 1 move 4'), unit(2, 23, 14, 'enemy 2'), unit(3, 34, 26, 'ally 2')], start: [4, 4], party: [1] });
    const fight = begin(w, { turns: 'team' }), F = w.ReactorFight, G = F.Grid, hull = fight.unitOfEvent(1), c = fight.character(hull);
    assert.deepEqual([2, 4, 6, 8].map(d => rect(F.footprintFacing(hull, d))), [[-1, -1, 3, 3], [-1, -1, 3, 3], [-1, -1, 3, 3], [-1, -1, 3, 3]]);
    assert.equal(F.turnsBody(hull), true, 'its gun lies on other cells');
    assert.equal(c.direction(), 2);
    assert.ok(pairs(F.overhang(hull)).includes('0,2') && pairs(F.overhang(hull)).includes('0,3'));
    // A soldier three cells east of it on its row: where its gun would be if it faced right.
    assert.equal(F.canFace(fight, hull, 6), false);
    c.setDirection(6);
    assert.equal(c.direction(), 2, 'the turn is not taken');
    assert.equal(F.canFace(fight, hull, 4), true);
    assert.equal(F.canFace(fight, hull, 8), true, 'round by the west');
    assert.equal(G.fitsAt(fight, hull, 20, 14, 6, 0), false);
    // It does not step east with its gun through him: it comes to that cell round by the south, facing north.
    G.flood(fight, hull, 4);
    assert.equal(G.costAt(19, 14), 1);
    assert.equal(G.costAt(21, 14), 3);
    assert.equal(G.facingAt(21, 14), 8);
    // Turned where it stands, the field is another: what was kept of it is looked at again.
    const before = fight.positionsHash();
    c.setDirection(4);
    assert.equal(c.direction(), 4);
    assert.notEqual(fight.positionsHash(), before);
});

/** A fuselage one tile wide and seven long at chest height with wings five tiles across, a tile and a half deep, at its middle. */
function plane(w) {
    return vm.runInContext(`(function() {
        const template = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 7));
        body.position.set(0, 0.8, 0);
        const wings = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 1.5));
        wings.position.set(0, 0.8, 0);
        template.add(body);
        template.add(wings);
        template.userData.glbSize = { x: 5, y: 1.1, z: 7 };
        return template;
    })()`, w);
}

test('a part is thin beside most of the model, not beside its widest: a plane\'s fuselage is no gun of its wings, and its body is the box round both', () => {
    const w = hullWorld({ wide: 5, long: 7, tall: 1.1, template: plane, events: [unit(1, 20, 14, 'enemy 1'), unit(2, 34, 26, 'ally 2')], start: [4, 4], party: [1] });
    const fight = begin(w), F = w.ReactorFight, craft = fight.unitOfEvent(1);
    assert.deepEqual([2, 6].map(d => rect(F.footprintFacing(craft, d))), [[-2, -3, 5, 7], [-3, -2, 7, 5]]);
    assert.equal(F.overhang(craft), null, 'nothing sticks out of it');
    for (const [x, y] of [[20, 11], [20, 17], [18, 14], [22, 14], [18, 11]]) assert.equal(fight.unitAt(x, y), craft, `${x},${y} is its body`);
});

test('a soldier the battle finds under a hull\'s gun steps aside as it begins; the hull keeps its place', () => {
    const w = hullWorld({ template: gunHull, events: [unit(1, 20, 14, 'enemy 1'), unit(2, 20, 16, 'enemy 2'), unit(3, 34, 26, 'ally 2')], start: [4, 4], party: [1] });
    const fight = begin(w), F = w.ReactorFight, G = F.Grid, hull = fight.unitOfEvent(1), soldier = fight.unitOfEvent(2), sc = fight.character(soldier), c = fight.character(hull);
    assert.deepEqual([c.x, c.y, c.direction()], [20, 14, 2]);
    assert.notDeepEqual([sc.x, sc.y], [20, 16]);
    assert.equal(F.overhangAt(fight, sc.x, sc.y), null);
    assert.ok(Math.abs(sc.x - 20) + Math.abs(sc.y - 16) === 1, `a step aside (${sc.x},${sc.y})`);
    assert.deepEqual(Array.from(fight.placements(), entry => [entry.eventId, entry.moved]), [[2, true]]);
    assert.equal(G.fitsAt(fight, hull, 20, 14, 2, 0), true);
});

test('of two units on the pointer\'s line the nearer is taken, whichever the battle lists first', () => {
    const w = realWorld({ events: [unit(1, 10, 13, 'enemy 1')], start: [10, 10], party: [1] });
    const fight = begin(w), In = w.ReactorFight.Input, me = hero(w), foe = fight.unitOfEvent(1);
    assert.ok(fight._units.indexOf(me) < fight._units.indexOf(foe), 'the leader is listed before the enemy');
    // A level line at chest height through both, from the north and from the south.
    assert.equal(In.unitOnRay(fight, 10.5, 1, 4, 0, 0, 1), me, 'from the north the leader is nearer');
    assert.equal(In.unitOnRay(fight, 10.5, 1, 20, 0, 0, -1), foe, 'from the south the enemy is');
});

//-----------------------------------------------------------------------------
// Marks and reach, through the calls the game makes.

const small = (options = {}) => fightWorld(Object.assign({ tactical: true }, options));
const smallBegin = (w, options = {}) => { assert.ok(w.$gameFight.start(Object.assign({ mode: 'tactical' }, options)) > 0); w.run(60, () => w.$gameFight.awaitsPlayer()); return w.$gameFight; };

test('what every enemy reaches is worked out again when someone moves, and a big enemy strikes from every cell of its body', () => {
    const w = small({ events: [unit(1, 8, 4, 'enemy 1 move 1'), unit(2, 16, 12, 'enemy 2 move 1')], mapSidecar: { eventSize: { 1: [3, 2] }, eventSizeAnchor: 'center' } });
    w.$dataSkills[1].note = '<range: 1-2>';
    const fight = smallBegin(w), big = fight.unitOfEvent(1), other = fight.unitOfEvent(2);
    const cells = list => Array.from(list, c => `${c.x},${c.y}`);
    // The big one covers 7..9, 4..5 and moves a step: from 9,4 its body reaches 10,5, and its blow two cells on.
    const reach = cells(fight.threatOf(big).reach);
    assert.ok(reach.includes('12,5'), 'two cells from the far corner of its body after a step east');
    assert.ok(reach.includes('6,7') || reach.includes('7,8'), 'and from its near corner after a step the other way');
    assert.ok(!reach.includes('14,5'));
    // Everyone's at once: kept while nobody moves, made again when someone does.
    const all = cells(fight.threatOfAll());
    assert.ok(all.includes('16,14') && !all.includes('3,13'));
    assert.deepEqual(cells(fight.threatOfAll()), all);
    w.Game_CharacterBase.prototype.locate.call(fight.character(other), 3, 10);
    const moved = cells(fight.threatOfAll());
    assert.ok(moved.includes('3,13'), 'its reach is where it stands now');
    assert.ok(!moved.includes('16,14'), 'and no longer where it stood');
});

test('a unit still walking holds the cell it is going to, not the one it is leaving', () => {
    const w = small({ events: [unit(1, 10, 6, 'enemy 1')] });
    const fight = smallBegin(w), F = w.ReactorFight, G = F.Grid, walker = fight.unitOfEvent(1), me = hero(w);
    fight.tac().movers = [{ unitId: walker.id, path: [{ x: 11, y: 6, height: 0 }, { x: 12, y: 6, height: 0 }] }];
    G.flood(fight, me, 30);
    assert.equal(G.costAt(12, 6), Infinity, 'where it will stand is taken');
    assert.ok(G.costAt(10, 6) < Infinity && G.canStopAt(10, 6), 'where it is leaving is free');
    fight.tac().movers = [];
    G.flood(fight, me, 30);
    assert.equal(G.costAt(10, 6), Infinity);
    assert.ok(G.costAt(12, 6) < Infinity);
});

test('only units of a side get a bar, and a unit is greyed as done only in its own side\'s turn', () => {
    const w = small({ events: [unit(1, 6, 2, 'enemy 1'), event(3, 4, 6, { note: '<unit: neutral>' })] });
    vm.runInContext(`
        Sprite = function Sprite(bitmap) { this.bitmap = bitmap || null; this.children = []; this.parent = null; this.anchor = { x: 0, y: 0 }; this.x = 0; this.y = 0; this.visible = true; this.opacity = 255; };
        Sprite.prototype.addChild = function(child) { child.parent = this; this.children.push(child); return child; };
        Sprite.prototype.setFrame = function() {};
        Bitmap = function Bitmap(width, height) { this.width = width; this.height = height; this.context = null; };
        Bitmap.prototype.fillRect = function() {};
    `, w);
    const fight = smallBegin(w, { turns: 'team' }), F = w.ReactorFight, U = F.UnitMarks, foe = fight.unitOfEvent(1);
    assert.equal(fight.currentTeam(), 'ally');
    // The enemy acted in its own turn before: in the party's turn that says nothing, and its ring keeps its side's color.
    fight.tac().acted[foe.id] = true;
    U.collect(fight);
    const at = u => { const c = fight.character(u); for (let i = 0; i < U.count; i++) if (Math.abs(U.x[i] - c.x - 0.5) < 0.01 && Math.abs(U.y[i] - c.y - 0.5) < 0.01) return i; return -1; };
    assert.equal(U.flags[at(foe)] & U.ACTED_FLAG, 0, 'not greyed in the other side\'s turn');
    fight.tac().acted[hero(w).id] = true;
    U.collect(fight);
    assert.equal(U.flags[at(hero(w))] & U.ACTED_FLAG, U.ACTED_FLAG, 'one of the side whose turn it is, is');
    // The bars: one for each unit of a side, none for the bystander.
    const spriteset = new w.Sprite();
    U.placeBars(spriteset, true);
    const shown = U.bars.filter(bar => bar.visible).length;
    assert.equal(U.count, fight._units.filter(u => !u.gone).length);
    assert.equal(shown, fight._units.filter(u => !u.gone && u.team !== 'neutral').length, 'a bystander has no bar');
    assert.equal(shown, U.count - 1);
    U.placeBars(spriteset, false);
    assert.equal(U.bars.filter(bar => bar.visible).length, 0);
});
