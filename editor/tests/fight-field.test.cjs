'use strict';
// The Tactical field as the player meets it (runtime/reactor_fight_tactical.js): the first view of a battle, the view
// going to whoever joins or speaks, the pointer picking a unit before the ground, where the other side can come and
// strike, the way's squares and its cost, the rings and bars on units, where nobody may stand, and whom the units that
// decide for themselves leave alone. Logic only: nothing here draws.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');
const { realWorld } = require('./helpers/fight-real-world.cjs');

const unit = (id, x, y, text, extra = {}) => event(id, x, y, Object.assign({ note: `<unit: ${text}>` }, extra));
const world = (options = {}) => fightWorld(Object.assign({ tactical: true }, options));
const hero = w => w.$gameFight._units.find(u => u.actorId === 1);
const foe = (w, eventId) => w.$gameFight.unitOfEvent(eventId);
function begin(w, options = {}) {
    assert.ok(w.$gameFight.start(Object.assign({ mode: 'tactical' }, options)) > 0);
    w.run(90, () => w.$gameFight.awaitsPlayer());
    return w.$gameFight;
}
const kindsAt = (M, x, y) => { const out = []; for (let i = 0; i < M.count; i++) if (M.x[i] === x && M.y[i] === y) out.push(M.kind[i]); return out; };

/** A 3D world from a height per cell, with a camera that records what the Tactical view asks of it. */
function heights3D(w, top) {
    const h = (x, y) => (x >= 0 && y >= 0 && x < 20 && y < 15 ? top(Math.floor(x), Math.floor(y)) : 0);
    const asked = [];
    w.Reactor3D = {
        TERRAIN_SLOPE_LIMIT: 0.75, isMap3D: () => true,
        groundHeightAt: (map, wx, wz, near) => (Number.isFinite(near) && near < 100 && h(wx, wz) > near + 2 ? 0 : h(wx, wz)),
        terrainBlocks: (map, x, y, x2, y2) => Math.abs(h(x2, y2) - h(x, y)) > 0.75,
        Camera: {
            currentState: () => (asked.length ? Object.assign({}, asked[asked.length - 1].state) : { mode: 'thirdPerson', focus: 'player', yaw: 0 }),
            change(state, frames) { asked.push({ state, frames }); },
            frameDistance: () => 30
        }
    };
    return asked;
}

test('the first view: from the quarter that shows the party and the nearest enemies, not from behind a roof, and wide enough to hold them', () => {
    // The party at (9,9) and beside it; the enemy to the east and a little north. Nothing built: the view looks from behind the party.
    const open = world({ events: [unit(1, 15, 7, 'enemy 1')] });
    heights3D(open, () => 0);
    open.$gamePlayer.locate(9, 9);
    open.$gamePlayer.followers().synchronize(9, 9, 2);
    const first = begin(open), F = open.ReactorFight;
    assert.equal(first._tac.view.own, true);
    assert.equal(first._tac.view.yaw, 45, 'in the open the first quarter that looks toward the enemy');
    // A hall six tiles high south-west of the party, where that quarter's camera stands: its roof would fill the view.
    const walled = world({ events: [unit(1, 15, 7, 'enemy 1')] });
    const asked = heights3D(walled, (x, y) => (x >= 4 && x <= 7 && y >= 10 && y <= 13 ? 6 : 0));
    walled.$gamePlayer.locate(9, 9);
    walled.$gamePlayer.followers().synchronize(9, 9, 2);
    const fight = begin(walled), V = walled.ReactorFight.View;
    assert.equal(V.hides(9, 9, 0, 45, null), true, 'from the south-west the hall stands between the camera and the party');
    assert.equal(V.hides(9, 9, 0, 135, null), false);
    assert.equal(fight._tac.view.yaw, 135, 'the quarter that also looks toward the enemy and sees the party');
    assert.ok(asked.some(entry => entry.state.mode === 'isometric' && entry.state.yaw === 135), 'the camera was asked for that quarter');
    assert.equal(asked.some(entry => entry.state.yaw === 45), false, 'and never for the blocked one');
    // Inside the ground the battle's cutaway keeps open a roof hides nobody: the box is looked through.
    assert.equal(V.hides(9, 9, 0, 45, [3, 8, 11, 15]), false);
    // The view rests on the middle of everyone it shows, not on the first unit, at the first "choose a unit".
    walled.run(3);
    const focus = fight._tac.focus, cursor = fight.cursor();
    assert.ok(focus.x > 10 && focus.x < 14, `the middle between the party and the enemy (${focus.x})`);
    assert.equal(cursor.x, fight.character(hero(walled)).x, 'the cursor is on the first unit all the same');
    // The further off the enemy it shows, the further back it stands; an enemy out of reach is not waited for.
    const near = world({ events: [unit(1, 11, 8, 'enemy 1')] });
    heights3D(near, () => 0);
    near.$gamePlayer.locate(9, 9);
    near.$gamePlayer.followers().synchronize(9, 9, 2);
    const close = begin(near);
    assert.ok(first._tac.view.zoom > close._tac.view.zoom + 0.05, `${first._tac.view.zoom} > ${close._tac.view.zoom}: the spread decides, not the stock zoom`);
    assert.ok(close._tac.view.zoom >= 0.7 && first._tac.view.zoom <= 1.6);
    const look = F.View.direction(135);
    assert.ok(Math.abs(look.dx - Math.SQRT1_2) < 1e-6 && Math.abs(look.dz - Math.SQRT1_2) < 1e-6, 'yaw 135 looks south-east over the ground');
});

test('the view goes to whoever joins and to whoever speaks, then back to where the battle looks', () => {
    const w = world({ events: [unit(1, 6, 2, 'enemy 1')] });
    const fight = begin(w), V = w.ReactorFight.View, me = hero(w);
    const middle = () => w.$gameMap._displayX + (w.$gameMap.screenTileX() - 1) / 2;
    w.run(60);
    const rest = middle();
    // Reinforcements at the far end of the map: the display goes their way while the visit lasts.
    const a = fight.spawn({ record: 'enemy', id: 1, x: 17, y: 12 }), b = fight.spawn({ record: 'enemy', id: 1, x: 19, y: 12 });
    assert.ok(a && b);
    w.run(30);
    const during = middle();
    assert.ok(during > rest + 0.5, `the view went toward them (${rest} -> ${during})`);
    w.run(V.VISIT_FRAMES + 80);
    assert.ok(middle() < during - 0.25, `and came back (${during} -> ${middle()})`);
    // Whoever speaks is found by the message's speaker name: the battler's name, or the first word of it.
    w.$dataEnemies[1].name = 'Raider Captain';
    assert.equal(V.speaker(fight, 'Raider Captain'), foe(w, 1));
    assert.equal(V.speaker(fight, '\\C[2]raider'), foe(w, 1), 'a color code and the first word');
    assert.equal(V.speaker(fight, 'Nobody'), null);
    assert.equal(V.speaker(fight, 'Ren'), me);
    // A change of side shows the unit as well.
    const back = middle();
    fight.setEventSide(a.eventId, 'ally');
    w.run(30);
    assert.ok(middle() > back + 0.25, 'the one who changed sides is looked at');
    // The player pointing somewhere ends a visit at once.
    V.endVisit();
    w.run(90);
    assert.ok(middle() < back + 0.25);
});

test('the pointer picks the unit it is on before any ground: by any cell of a big body, the nearer of two, nobody beside them', () => {
    const w = world({ events: [unit(1, 8, 4, 'enemy 1'), unit(2, 8, 2, 'enemy 2')], mapSidecar: { eventSize: { 1: [3, 2] }, eventSizeAnchor: 'center' } });
    const fight = begin(w), F = w.ReactorFight, In = F.Input, big = foe(w, 1), bat = foe(w, 2);
    // Straight down onto each cell of the big unit (cells 7..9, 4..5).
    for (const [x, y] of [[7, 4], [8, 4], [9, 4], [7, 5], [8, 5], [9, 5]]) {
        assert.equal(In.unitOnRay(fight, x + 0.5, 20, y + 0.5, 0, -1, 0), big, `${x},${y}`);
        const c = fight.cursor();
        fight.setCursor(x, y);
        assert.equal(fight.focusedUnit(), big);
        assert.ok(c);
    }
    assert.equal(In.unitOnRay(fight, 10.5, 20, 4.5, 0, -1, 0), null, 'the ground beside it');
    assert.equal(In.unitOnRay(fight, 8.5, 20, 2.5, 0, -1, 0), bat, 'a unit of one cell');
    assert.equal(In.unitOnRay(fight, 8.05, 20, 2.5, 0, -1, 0), null, 'the edge of its cell is ground: a body is narrower than its cell');
    // A slanting ray from the north that passes through the bat on its way to the big one meets the bat first.
    const dz = 1 / Math.hypot(1, 1), dy = -dz;
    assert.equal(In.unitOnRay(fight, 8.5, 6, -2.5, 0, dy, dz), bat, 'the nearer of two on the line');
    // And one that comes down beyond the bat meets the big unit's body, on the cell it enters by.
    const hit = In.unitOnRay(fight, 8.5, 6, 0.2, 0, dy, dz);
    assert.equal(hit, big);
    // Over head height nothing is picked: the body is as tall as the unit stands.
    assert.equal(In.unitOnRay(fight, 8.5, 20, 2.5, 1, 0, 0), null);
    assert.ok(F.unitHeight(bat) >= 1);
});

test('where the other side can come and strike: shown for the enemy pointed at, for all of them on a key, under the player\'s own marks', () => {
    const w = world({ events: [unit(1, 10, 6, 'enemy 1 move 2'), unit(2, 16, 12, 'enemy 2 move 1')] });
    w.$dataSkills[1].note = '<range: 1-2>';
    const fight = begin(w), F = w.ReactorFight, M = F.Marks, K = M.KINDS, slime = foe(w, 1);
    const cells = list => Array.from(list, c => `${c.x},${c.y}`);
    const known = fight.threatOf(slime);
    const tread = cells(known.tread), reach = cells(known.reach);
    assert.ok(tread.includes('10,6') && tread.includes('12,6') && tread.includes('11,7'), 'where it can stand after a move of 2');
    assert.ok(!tread.includes('13,6'));
    assert.ok(reach.includes('14,6') && reach.includes('10,10'), 'and its reach of 2 from there');
    assert.ok(!reach.includes('15,6') && !reach.includes('10,11'));
    assert.equal(fight.threatOf(slime), known, 'kept until someone moves');
    assert.equal(cells(fight.threatOf(slime).tread).length, tread.length);
    // Pointing at it shows both kinds; cells a unit of the player's still to act stands on keep their own mark.
    fight.setCursor(10, 6);
    M.collect(fight);
    assert.deepEqual(kindsAt(M, 12, 6), [K.tread]);
    assert.deepEqual(kindsAt(M, 14, 6), [K.threat]);
    assert.deepEqual(kindsAt(M, 10, 6).sort(), [K.cursor, K.tread].sort(), 'the cursor lies over its own cell');
    fight.setCursor(2, 2);
    M.collect(fight);
    assert.deepEqual(kindsAt(M, 12, 6), [], 'pointing elsewhere: nothing of it');
    // The key (T, or whatever gives the `threat` action): every enemy's reach at once, and off again.
    assert.equal(fight.showsThreat(), false);
    w.Input.isTriggered = name => name === 'threat';
    F.Input.update(fight);
    w.Input.isTriggered = () => false;
    assert.equal(fight.showsThreat(), true);
    M.collect(fight);
    assert.deepEqual(kindsAt(M, 14, 6), [K.threat]);
    assert.deepEqual(kindsAt(M, 12, 6), [K.threat], 'all of them: one kind');
    assert.deepEqual(kindsAt(M, 16, 10), [K.threat], 'the other enemy\'s reach as well');
    assert.deepEqual(kindsAt(M, 2, 2).filter(kind => kind !== K.cursor), [K.move], 'the player\'s own mark stays on top');
    assert.equal(fight.toggleThreat(), false);
    M.collect(fight);
    assert.deepEqual(kindsAt(M, 14, 6), []);
    // It moves: the reach is worked out again.
    w.Game_CharacterBase.prototype.locate.call(fight.character(slime), 5, 9);
    assert.ok(cells(fight.threatOf(slime).tread).includes('5,11'));
    // The battle's own T key is bound while it runs where nothing else uses it, and given back when it ends.
    assert.equal(w.Input.keyMapper && w.Input.keyMapper[84], undefined);
});

test('the way to the cursor is told tile by tile with what the move costs', () => {
    const w = world({ events: [unit(1, 12, 9, 'enemy 1')] });
    w.$dataActors[1].note = '<move: 5>';
    // A bush at (3,1): a step into it costs two.
    w.$dataTilesets[1].flags[1538] = 0x40;
    w.$dataMap.data[1 * 20 + 3] = 1538;
    const fight = begin(w), F = w.ReactorFight, M = F.Marks, me = hero(w);
    assert.equal(fight.pathCost(), 0, 'no way shown before a unit is chosen');
    assert.ok(fight.commandSelectUnit(me.id));
    fight.setCursor(5, 3);
    assert.equal(fight.pathCost(), 4);
    M.collect(fight);
    assert.equal(M.wayCount, 5, 'the unit\'s own cell and four steps');
    assert.equal(M.wayCost, 4);
    assert.deepEqual([M.wayX[0], M.wayY[0]], [2, 2]);
    assert.deepEqual([M.wayX[4], M.wayY[4]], [5, 3]);
    for (let i = 1; i < M.wayCount; i++) assert.equal(Math.abs(M.wayX[i] - M.wayX[i - 1]) + Math.abs(M.wayY[i] - M.wayY[i - 1]), 1, 'cell by cell');
    // Through the bush the number is the move spent, not the cells walked.
    fight.setCursor(3, 1);
    assert.equal(fight.pathCost(), 3, 'one step and the bush\'s two');
    M.collect(fight);
    assert.equal(M.wayCount, 3);
    assert.equal(M.wayCost, 3);
    fight.setCursor(2, 2);
    M.collect(fight);
    assert.equal(M.wayCount, 0, 'on its own cell: no way');
    fight.setCursor(15, 12);
    assert.equal(fight.pathCost(), 0, 'out of reach: none');
});

test('every unit is marked by side and by state: who has acted, who keeps watch, how hurt', () => {
    const w = world({ events: [unit(1, 6, 2, 'enemy 1'), unit(2, 12, 9, 'enemy 2'), event(3, 4, 9, { note: '<unit: neutral>' })] });
    w.$dataSkills[1].note = '<range: 1-4>';
    const fight = begin(w), F = w.ReactorFight, U = F.UnitMarks, me = hero(w), second = fight._units.find(u => u.actorId === 2);
    const first = U.collect(fight);
    assert.equal(U.count, 5, 'two of the party, two enemies and a bystander');
    const at = u => { const c = fight.character(u); for (let i = 0; i < U.count; i++) if (Math.abs(U.x[i] - c.x - 0.5) < 0.01 && Math.abs(U.y[i] - c.y - 0.5) < 0.01) return i; return -1; };
    const iMe = at(me), iFoe = at(foe(w, 1)), iBy = at(foe(w, 3));
    assert.deepEqual([U.TEAMS[U.team[iMe]], U.TEAMS[U.team[iFoe]], U.TEAMS[U.team[iBy]]], ['ally', 'enemy', 'neutral']);
    assert.equal(U.hp[iMe], 1);
    assert.equal(U.hp[iBy], -1, 'a bystander has no bar');
    assert.equal(U.flags[iMe], 0);
    // Hurt: the bar is shorter.
    fight.battler(foe(w, 1)).setHp(Math.round(fight.battler(foe(w, 1)).mhp / 4));
    U.collect(fight);
    assert.ok(Math.abs(U.hp[at(foe(w, 1))] - 0.25) < 0.02);
    // One keeps watch, the other waits: both have acted, one is marked on watch.
    assert.ok(fight.commandSelectUnit(me.id));
    assert.ok(fight.commandMoveTo(2, 2));
    assert.ok(fight.commandOverwatch());
    w.run(60, () => fight.awaitsPlayer());
    assert.ok(fight.commandSelectUnit(second.id));
    const c2 = fight.character(second);
    assert.ok(fight.commandMoveTo(c2.x, c2.y));
    U.collect(fight);
    assert.equal(U.flags[at(second)], 0, 'the unit whose turn it is has neither mark');
    assert.equal(U.flags[at(me)] & (U.ACTED_FLAG | U.WATCH_FLAG), U.ACTED_FLAG | U.WATCH_FLAG, 'acted, and on watch');
    assert.notEqual(U.hash, first, 'and the rings are laid again');
    // A unit that walks changes what the rings show; one that only stands does not.
    const still = U.collect(fight);
    assert.equal(U.collect(fight), still);
    fight.character(foe(w, 2))._realX += 0.25;
    assert.notEqual(U.collect(fight), still);
    // Outside a battle nobody is marked.
    fight.end(F.WIN);
    w.run(600, () => !fight.isActive());
    U.collect(fight);
    assert.equal(U.count, 0);
});

test('where nobody may stand: the world\'s answer shuts a cell to the flood, and a prop built on a cell is no floor while a deck is', () => {
    // The seam: whoever owns the world says no for one cell.
    const w = world({ events: [unit(1, 15, 9, 'enemy 1')] });
    heights3D(w, () => 0);
    const fight = begin(w), G = w.ReactorFight.Grid, me = hero(w), c = fight.character(me);
    G.flood(fight, me, 6);
    assert.equal(G.costAt(c.x + 1, c.y), 1);
    G.standsAt = (x, y) => !(x === c.x + 1 && y === c.y);
    G.forget();
    G.flood(fight, me, 6);
    assert.equal(G.costAt(c.x + 1, c.y), Infinity, 'no way onto a cell that is no place to stand');
    assert.ok(G.costAt(c.x + 2, c.y) > 2, 'and no way through it');
    // The grid's own rule over the real physics: shapes laid on a floor map.
    const pieces = [
        { id: 1, kind: 'box', x: 10, y: 5, z: 0, rot: 0, material: 'Wood', size: [3, 0.4, 2], angle: 0 },          // a deck over 9..11, 4..5 or 5..6
        { id: 2, kind: 'cylinder', x: 6, y: 9, z: 0, rot: 0, material: 'Stone', size: [0.4, 0.5, 0.4], angle: 0 },   // a post's base
        { id: 3, kind: 'box', x: 14, y: 9, z: 0, rot: 0, material: 'Wood', size: [2.6, 0.5, 0.7], angle: 90 },       // a bench
        { id: 4, kind: 'fence', x: 4, y: 12, z: 0, rot: 0, material: 'Wood' }
    ];
    const r = realWorld({ events: [unit(1, 30, 20, 'enemy 1')], sidecar: { pieces }, start: [8, 8] });
    const rf = begin(r), RG = r.ReactorFight.Grid, lead = rf._units.find(u => u.actorId === 1), out = [];
    RG.flood(rf, lead, 12);
    const top = (x, y) => r.Reactor3D.groundHeightAt(r.$dataMap, x + 0.5, y + 0.5, 0.2);
    assert.ok(top(6, 9) > 0.3 && top(14, 9) > 0.3 && top(10, 5) > 0.3, 'the map reads a top on each of them');
    assert.equal(RG.reachedAt(6, 9, out), 0, 'the post is no place to stand');
    assert.equal(RG.reachedAt(14, 9, out), 0, 'nor the bench');
    assert.equal(RG.reachedAt(14, 8, out), 0, 'along its whole length');
    assert.equal(RG.reachedAt(4, 12, out), 0, 'nor the fence');
    assert.ok(RG.reachedAt(10, 5, out) > 0, 'the deck is a floor');
    assert.ok(RG.stands(10, 5, top(10, 5)));
    assert.equal(RG.stands(6, 9, top(6, 9)), false);
    assert.ok(RG.costAt(7, 9) < Infinity, 'the ground beside the post is walked');
});

test('a pull up takes a unit its jump and one level, no higher', () => {
    const w = world({ events: [unit(1, 15, 9, 'enemy 1')] });
    // A ledge two up at (5,2), a canopy four up at (5,4); the world offers a mantle onto either.
    const tops = (x, y) => (x === 5 && y === 2 ? 2 : x === 5 && y === 4 ? 4 : 0);
    heights3D(w, tops);
    w.Reactor3D.groundHeightAt = (map, wx, wz) => (wx >= 0 && wz >= 0 ? tops(Math.floor(wx), Math.floor(wz)) : 0);
    const fight = begin(w), F = w.ReactorFight, G = F.Grid, me = hero(w);
    G.edge = (x, y, d) => {
        const x2 = x + (d === 6 ? 1 : d === 4 ? -1 : 0), y2 = y + (d === 2 ? 1 : d === 8 ? -1 : 0);
        return tops(x2, y2) > tops(x, y) + 0.75 ? { kind: 'mantle', cost: 2, height: tops(x2, y2) } : null;
    };
    w.Game_CharacterBase.prototype.locate.call(fight.character(me), 4, 3);
    G.forget();
    G.flood(fight, me, 8);
    assert.equal(F.jumpOf(me), 1);
    assert.ok(G.costAt(5, 2) < Infinity, 'two up: a jump of one and one more');
    assert.equal(G.costAt(5, 4), Infinity, 'four up: out of reach');
    w.$dataActors[1].note = '<jump: 3>';
    G.flood(fight, me, 8);
    assert.ok(G.costAt(5, 4) < Infinity, 'a jump of three takes it');
});

test('units that decide for themselves leave alone one the battle\'s own events may bring over to their side, while anyone else is there to fight', () => {
    const change = { code: 357, indent: 0, parameters: ['RPGReactor', 'ChangeUnitSide', 'Change Unit Side', { eventId: 3, team: 'ally' }] };
    const hook = page({ rrFightHook: { on: 'unitDefeated', unit: 4 }, list: [change, { code: 0, indent: 0, parameters: [] }] });
    const w = world({ events: [unit(1, 3, 5, 'ally 3'), unit(3, 4, 5, 'enemy 1'), unit(4, 17, 12, 'enemy 2'), event(5, 18, 13, { pages: [page(), hook] })] });
    const fight = begin(w), F = w.ReactorFight, AI = F.AI, friend = foe(w, 1), conscript = foe(w, 3), bat = foe(w, 4);
    assert.equal(AI.turncoats(fight).get(3), 'ally');
    assert.equal(AI.turncoats(fight).get(4), undefined);
    // The conscript stands beside the ally, one blow from falling: the easy kill, and the only enemy in reach this
    // turn (the bat is across the map). The ally leaves it and walks toward the bat.
    fight.battler(conscript).setHp(1);
    const think = u => { fight.beginUnit(u); let plan = null; for (let i = 0; i < 600 && !plan; i++) plan = AI.think(fight, u, fight.character(u)); return plan; };
    const plan = think(friend);
    assert.notEqual(plan.kind, 'skill', 'nobody is struck: the one in reach may come over, the other is too far');
    assert.ok(plan.steps.length > 0, 'it sets out toward the bat');
    const last = plan.steps[plan.steps.length - 1];
    assert.ok(Math.abs(last.x - 17) + Math.abs(last.y - 12) < Math.abs(3 - 17) + Math.abs(5 - 12), 'nearer the bat');
    // The enemy's own units are not spared by it: the conscript's side strikes whom it likes.
    const theirs = think(bat);
    assert.ok(theirs.kind === 'skill' || theirs.steps.length > 0);
    // With nobody else left to fight, the conscript is an enemy like any other.
    fight.battler(bat).setHp(0);
    fight.battler(bat).refresh();
    fight.defeat(bat);
    assert.equal(fight.isAlive(bat), false);
    AI.forget();
    const alone = think(friend);
    assert.equal(alone.kind, 'skill');
    assert.deepEqual([alone.cx, alone.cy], [4, 5]);
});

test('on a flat map a unit drawn from a model is sized to its cell while a Tactical battle runs, and lit; anyone else is as the map draws it', () => {
    const w = realWorld({ flat: true, events: [unit(1, 20, 12, 'enemy 1'), unit(2, 30, 20, 'enemy 2'), event(3, 5, 5)] });
    const R = w.Reactor3D, F = w.ReactorFight;
    w.model('Actors/Soldier', w.boxModel(1, 3, 1));
    w.model('Vehicles/Truck', w.boxModel(4, 1.5, 2));
    R._databaseSidecar = { enemies: { 1: { name: 'Actors/Soldier', ext: '.glb', size: 3, scale: 1 }, 2: { name: 'Vehicles/Truck', ext: '.glb', size: 4, scale: 1 } } };
    const soldier = w.$gameMap.event(1), truck = w.$gameMap.event(2), other = w.$gameMap.event(3);
    assert.equal(F.flatFit(soldier), 1, 'before the battle: as the map draws it');
    assert.equal(F.flatLight(soldier), 0);
    const fight = begin(w);
    for (let i = 0; i < 60; i++) { F.flatFit(soldier); F.flatFit(truck); F.flatFit(other); }
    const fit = F.flatFit(soldier);
    assert.ok(fit < 0.8 && fit > 0.4, `a figure three tiles tall is drawn smaller (${fit})`);
    // Three tiles tall, seen from the map's pitch, drawn at that size: no taller than a cell and a half.
    assert.ok((3 * F.FLAT_PITCH + F.FLAT_MARGIN) * fit <= F.FLAT_TALL + 0.01);
    assert.equal(F.flatLight(soldier), F.FLAT_LIGHT);
    assert.equal(F.flatFit(truck), 1, 'a unit that covers many cells is as big as it is');
    assert.equal(F.isBig(fight.unitOfEvent(2)), true);
    assert.equal(F.flatFit(other), 1, 'an event that is no unit is untouched');
    assert.equal(F.flatLight(other), 0);
    assert.equal(F.unitHeight(fight.unitOfEvent(1)), F.FLAT_TALL);
    // The battle over: back to the map's own size, eased.
    fight.end(F.WIN);
    w.run(600, () => !fight.isActive());
    for (let i = 0; i < 60; i++) F.flatFit(soldier);
    assert.equal(F.flatFit(soldier), 1);
    assert.equal(F.flatLight(soldier), 0);
});

test('on a 3D map the way is squares lying on its tiles, and the rings lie under the units: flat, facing up, one-sided', () => {
    const w = realWorld({ events: [unit(1, 30, 20, 'enemy 1')], start: [8, 8] });
    const fight = begin(w), F = w.ReactorFight, M = F.Marks, U = F.UnitMarks, me = hero(w);
    const THREE = w.THREE;
    const group = new THREE.Group();
    const live = { scene: { belowGroup: () => group, _meshes: [], _materials: [] } };
    assert.ok(fight.commandSelectUnit(me.id));
    fight.setCursor(11, 9);
    M.collect(fight);
    assert.equal(M.wayCount, 5);
    M.drawWay3D(live);
    const squares = M.way.mesh;
    assert.equal(squares.parent, group);
    assert.equal(squares.visible, true);
    // An edge and a square on each tile between the unit's and the destination, the destination's four, and the travelling pair with their edges.
    assert.equal(M.way.squares, 2 * (M.wayCount - 2) + 4);
    assert.equal(squares.count, M.way.squares + 4);
    // A see-through material drawn on both sides is compiled twice over by three each time it is asked for, and the
    // map keeps a mesh out of the picture while its material compiles: these are one-sided, so they show at once.
    assert.equal(squares.material.side, THREE.FrontSide);
    assert.equal(squares.material.transparent, true);
    const at = (mesh, i) => Array.from(mesh.instanceMatrix.array.slice(i * 16, i * 16 + 16));
    for (let i = 0; i < M.way.squares; i++) {
        const m = at(squares, i);
        assert.ok(m.every(Number.isFinite));
        // Facing up: the quad is not mirrored (a mirrored one would show its back, which is not drawn).
        const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
        assert.ok(det > 0, 'square ' + i + ' faces up (' + det + ')');
        // On a tile of the way past the unit's own, in its middle, a little over the ground.
        assert.ok(m[12] >= 8.5 && m[12] <= 11.5 && m[14] >= 8.5 && m[14] <= 9.5);
        assert.ok(Math.abs(m[12] % 1 - 0.5) < 1e-6 && Math.abs(m[14] % 1 - 0.5) < 1e-6, 'in the middle of its tile');
        assert.ok(!(Math.abs(m[12] - 8.5) < 1e-6 && Math.abs(m[14] - 8.5) < 1e-6), 'none under the unit: its ring is there');
        assert.ok(m[13] > 0.05 && m[13] < 0.3);
        assert.ok(m[0] > 0.2 && m[0] < 1 && Math.abs(m[0] - m[10]) < 1e-6, 'a square inset in its tile');
    }
    // No way: nothing is drawn.
    fight.setCursor(8, 8);
    M.collect(fight);
    M.drawWay3D(live);
    assert.equal(squares.count, 0);
    assert.equal(squares.visible, false);
    // The rings.
    U.collect(fight);
    U.drawRings3D(live);
    assert.equal(U.rings.parent, group);
    assert.equal(U.rings.material.side, THREE.FrontSide);
    assert.ok(U.rings.count >= U.count);
    for (let i = 0; i < U.rings.count; i++) { const m = at(U.rings, i); assert.ok(m[0] > 0 && m[5] > 0 && m[10] > 0, 'not mirrored'); }
    // Each ring in its side's color: the leader's is not the enemy's, and one that has acted is grey.
    const ringAt = (x, y) => { for (let i = 0; i < U.rings.count; i++) { const m = at(U.rings, i); if (Math.abs(m[12] - x - 0.5) < 0.01 && Math.abs(m[14] - y - 0.5) < 0.01) return i; } return -1; };
    const tint = i => Array.from(U.rings.instanceColor.array.slice(i * 3, i * 3 + 3), value => +value.toFixed(4));
    const hex = value => Array.from(new THREE.Color().setHex(value).toArray(), part => +part.toFixed(4));
    const mine = ringAt(8, 8), theirs = ringAt(30, 20);
    assert.ok(mine >= 0 && theirs >= 0);
    assert.deepEqual(tint(mine), hex(U.COLORS[0]));
    assert.deepEqual(tint(theirs), hex(U.COLORS[1]));
    assert.notDeepEqual(tint(mine), tint(theirs));
    fight.tac().acted[me.id] = true;
    fight._act = null;
    U.collect(fight);
    U.drawRings3D(live);
    assert.deepEqual(tint(ringAt(8, 8)), hex(U.ACTED));
});

test('a battle that is over shows no marks, no way and no rings from that moment, whatever was up', () => {
    const w = world({ events: [unit(1, 12, 9, 'enemy 1')] });
    w.$dataActors[1].note = '<move: 5>';
    const fight = begin(w), F = w.ReactorFight, M = F.Marks, U = F.UnitMarks, me = hero(w);
    // A spriteset with nothing to draw on: the marks are collected, nothing is laid.
    const spriteset = { _tilemap: null, _reactor3d: null };
    assert.ok(fight.commandSelectUnit(me.id));
    fight.setCursor(5, 3);
    M.update(spriteset);
    assert.ok(M.count > 10, 'the move range is up');
    assert.equal(M.wayCount, 5);
    assert.ok(M.wayCost > 0);
    U.update(spriteset);
    assert.equal(U.count, 3);
    // The battle is ended (the last enemy fell, an event said so): nothing else has changed.
    fight.end(F.WIN);
    M.update(spriteset);
    assert.equal(M.count, 0, 'the marks are gone before the last words are said');
    assert.equal(M.wayCount, 0, 'and the way');
    assert.equal(M.wayCost, 0);
    U.update(spriteset);
    assert.equal(U.count, 0, 'and the rings and bars');
});

test('a flat map paints its model pictures evenly lit whatever the last 3D map left in the shared lights, a battle\'s units a little brighter and at their fitted size', async () => {
    const w = realWorld({ flat: true, events: [unit(1, 20, 12, 'enemy 1'), event(3, 5, 5)] });
    const R = w.Reactor3D, F = w.ReactorFight;
    w.model('Actors/Soldier', w.boxModel(1, 3, 1));
    R._databaseSidecar = { enemies: { 1: { name: 'Actors/Soldier', ext: '.glb', size: 3, scale: 1 } } };
    const soldier = w.$gameMap.event(1);
    // What the picture is painted with: the ambient light in the uniforms every model material reads.
    const painted = [];
    R.paintModelSpriteCanvas = () => { painted.push(Array.from(R.lightUniforms().rrAmbient.value, v => Math.round(v * 1000) / 1000)); };
    const sprite = { _character: soldier, scale: { x: 1, y: 1 }, anchor: { x: 0, y: 0 }, bitmap: null, setFrame() {}, texture: null, _reactorMapModel: null };
    const night = () => R.packLightUniforms([], { intensity: 0.12, colour: 0x223355 });
    // The first call starts the model; the picture is drawn once it has arrived.
    night();
    R.updateMapModelSprite(sprite);
    for (let i = 0; i < 40 && !(sprite._reactorMapModel && sprite._reactorMapModel.ready); i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(sprite._reactorMapModel.ready, true);
    night();
    R.updateMapModelSprite(sprite);
    assert.deepEqual(painted.pop(), [1, 1, 1], 'outside a battle: white, at full strength, not the night\'s blue tenth');
    assert.equal(sprite.scale.x, 1);
    // In a Tactical battle the unit is brighter by FLAT_LIGHT and drawn at its fitted size, call after call.
    const fight = begin(w);
    for (let i = 0; i < 60; i++) { night(); sprite._reactorMapModel.dirty = true; R.updateMapModelSprite(sprite); }
    const bright = Math.round((1 + F.FLAT_LIGHT) * 1000) / 1000;
    assert.deepEqual(painted.pop(), [bright, bright, bright]);
    assert.ok(Math.abs(sprite.scale.x - F.flatFit(soldier)) < 1e-9 && sprite.scale.x < 0.8, `the sprite is scaled once a call, not again and again (${sprite.scale.x})`);
    // The battle over: as the map draws it.
    fight.end(F.WIN);
    w.run(600, () => !fight.isActive());
    for (let i = 0; i < 60; i++) { night(); sprite._reactorMapModel.dirty = true; R.updateMapModelSprite(sprite); }
    assert.deepEqual(painted.pop(), [1, 1, 1]);
    assert.equal(sprite.scale.x, 1);
});

test('a blow at someone far off is framed with its target: the view on the middle of the two, and pulled back when they are further apart than it holds', () => {
    // The hero at (2,2); enemies 3, 9 and 15 steps east of it.
    const w = world({ events: [unit(1, 5, 2, 'enemy 1'), unit(2, 11, 2, 'enemy 2'), unit(3, 17, 2, 'enemy 1')] });
    const asked = heights3D(w, () => 0);
    const fight = begin(w), V = w.ReactorFight.View, me = hero(w);
    assert.equal(fight._tac.view.own, true);
    // What the view looks at while the unit aims at one of them (the flow's stage and target, as an action sets them).
    const aim = eventId => {
        Object.assign(fight._act, { unitId: me.id, stage: 'aim', targetId: foe(w, eventId).id });
        V.update(fight);
        return [fight._tac.focus.x, fight._tac.focus.y];
    };
    assert.ok(V.PAIR_NEAR >= 3 && V.PAIR_FAR > V.PAIR_NEAR);
    assert.deepEqual(aim(1), [2, 2], 'a target beside it: the view stays on the unit');
    assert.equal(!!fight._tac.view.wide, false);
    assert.deepEqual(aim(2), [6.5, 2], 'nine steps off: the middle of the two');
    assert.equal(!!fight._tac.view.wide, false, 'still inside what the view holds');
    const zoom = fight._tac.view.zoom;
    assert.deepEqual(aim(3), [9.5, 2], 'fifteen steps off: the middle again');
    assert.equal(fight._tac.view.wide, true, 'and the view pulls back');
    assert.ok(fight._tac.view.zoom >= 1.5 && fight._tac.view.zoom >= zoom);
    assert.ok(asked.length > 0, 'the camera was told');
    // Back to a near target: the view comes in again to where it was.
    assert.deepEqual(aim(1), [2, 2]);
    assert.equal(fight._tac.view.wide, false);
    assert.equal(fight._tac.view.zoom, zoom);
});
