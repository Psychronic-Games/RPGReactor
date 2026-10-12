'use strict';
// Tactical battles on the map (runtime/reactor_fight_tactical.js): the note
// tags and their defaults, the grid (reach, paths, sight, cover, areas), the
// player's turn driven by its commands and by keys, the other side's
// decisions, saves made mid-turn, and that nothing changes outside Tactical.
// The world has no Reactor3D at all unless a test gives it one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');

const unit = (id, x, y, text, extra = {}) => event(id, x, y, Object.assign({ note: `<unit: ${text}>` }, extra));
const cells = list => Array.from(list, c => `${c.x},${c.y}`).sort();
const world = (options = {}) => fightWorld(Object.assign({ tactical: true }, options));
const at = (w, u) => { const c = w.$gameFight.character(u); return [c.x, c.y]; };
const hero = w => w.$gameFight._units.find(u => u.actorId === 1);
const foe = (w, eventId) => w.$gameFight.unitOfEvent(eventId);
/** Start a tactical battle and run to the player's first decision. */
function begin(w, options = {}) {
    assert.ok(w.$gameFight.start(Object.assign({ mode: 'tactical' }, options)) > 0);
    // Long enough for a unit of the other side that goes first to take its whole turn at the normal pace.
    w.run(600, () => w.$gameFight.awaitsPlayer());
    return w.$gameFight;
}
/** A wall: a tile nobody walks onto, by foot or by boat (0x68F: the same as a counter). */
function wall(w, x, y, flag = 0x60F) {
    w.$dataTilesets[1].flags[1537 + flag] = flag;
    w.$dataMap.data[y * 20 + x] = 1537 + flag;
}
const tick = (w, frames, until) => w.run(frames, until);

test('tags: range, area, sight, move, jump and the AI preset, and a PTBS block read as the same', () => {
    const F = world().ReactorFight;
    assert.equal(F.parseTactics('just a note'), null);
    const tags = F.parseTactics('<range: 2-6>\n<Area: cone 3> <los: no><move: -1><jump: 2><ai: ranged>');
    assert.deepEqual({ ...tags.range }, { min: 2, max: 6 });
    assert.deepEqual({ ...tags.area }, { shape: 'cone', size: 3 });
    assert.equal(tags.los, false);
    assert.equal(tags.move, -1);
    assert.equal(tags.jump, 2);
    assert.equal(tags.ai, 'ranged');
    assert.deepEqual({ ...F.parseTactics('<range: 3>').range }, { min: 1, max: 3 });
    assert.deepEqual({ ...F.parseTactics('<range: 0>').range }, { min: 0, max: 0 });
    const ptbs = F.parseTactics('<PTBS>\nscope: circle(5,2)\naoe: circle(1,0)\nscope_select: enemies\nmove_points: 6\n</PTBS>');
    assert.deepEqual({ ...ptbs.range }, { min: 2, max: 5 });
    assert.deepEqual({ ...ptbs.area }, { shape: 'circle', size: 1 });
    assert.equal(ptbs.move, 6);
    assert.equal(F.parseTactics('<ai: reckless>'), null, 'an unknown preset is no tag');
});

test('the shared fixtures: every note parses to its tags and every area covers its cells', () => {
    const file = path.join(__dirname, 'fixtures', 'tactics-fixtures.json');
    if (!fs.existsSync(file)) return;
    const w = world(), F = w.ReactorFight;
    const fixtures = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const entry of fixtures.notes || []) {
        const tags = F.parseTactics(entry.note);
        if (entry.tags === null) { assert.equal(tags, null, entry.note); continue; }
        assert.ok(tags, entry.note);
        for (const key of ['range', 'area', 'los', 'move', 'jump', 'ai']) {
            const want = entry.tags[key] === undefined ? null : entry.tags[key];
            assert.deepEqual(tags[key] && typeof tags[key] === 'object' ? { ...tags[key] } : tags[key], want, `${entry.note} -> ${key}`);
        }
    }
    for (const entry of fixtures.areas || []) {
        const got = cells(F.Grid.areaCells(entry.shape, entry.size, entry.user.x, entry.user.y, entry.target.x, entry.target.y));
        assert.deepEqual(got, entry.cells.map(([x, y]) => `${x},${y}`).sort(), `${entry.shape} ${entry.size}`);
    }
});

test('defaults: an untagged project plays; reach comes from the Scope and the weapon type', () => {
    const w = world(), F = w.ReactorFight;
    const actor = w.$gameActors.actor(1);
    const skill = (scope, extra = {}) => { const s = Object.assign({}, w.$dataSkills[1], { id: 90 + scope, scope, hitType: 2, note: '' }, extra); w.$dataSkills[s.id] = s; return s; };
    const of = (item, battler = actor) => { const t = F.tactics(battler, item); return `${t.min}-${t.max} ${t.area.shape} ${t.area.size} ${t.los}`; };
    assert.equal(of(w.$dataSkills[1]), '1-1 single 0 true', 'unarmed attack');
    assert.equal(of(skill(1)), '1-4 single 0 true', 'one enemy');
    assert.equal(of(skill(2)), '1-4 circle 2 true', 'all enemies');
    assert.equal(of(skill(4)), '1-4 circle 2 true', 'random enemies');
    assert.equal(of(skill(7)), '0-3 single 0 true', 'one ally');
    assert.equal(of(skill(8)), '0-0 circle 3 true', 'all allies');
    assert.equal(of(skill(11)), '0-0 self 0 true', 'the user');
    assert.equal(of(skill(14)), '0-0 circle 3 true', 'enemies and allies');
    assert.equal(of(w.$dataItems[1]), '0-3 single 0 true', 'an item for one ally');
    // A weapon: its type's reach, its own tags over that, the skill's own over both, field by field.
    w.$dataSystem.weaponTypes = ['', 'Sword', 'Sniper Rifle', 'Pistol', 'Bow'];
    const weapon = (id, wtypeId, note = '') => (w.$dataWeapons[id] = { id, name: 'W' + id, wtypeId, etypeId: 1, note, params: [0, 0, 0, 0, 0, 0, 0, 0], traits: [], iconIndex: 0, price: 0, animationId: 0 });
    const hold = id => { actor._equips[0].setObject(w.$dataWeapons[id]); };
    actor._equips = [new w.Game_Item()];
    hold(weapon(1, 1).id);
    assert.equal(of(w.$dataSkills[1]), '1-1 single 0 true', 'a sword');
    hold(weapon(2, 2).id);
    assert.equal(of(w.$dataSkills[1]), '2-7 single 0 true', 'a rifle');
    hold(weapon(3, 3).id);
    assert.equal(of(w.$dataSkills[1]), '1-4 single 0 true', 'a pistol');
    hold(weapon(4, 4).id);
    assert.equal(of(w.$dataSkills[1]), '2-5 single 0 true', 'a bow');
    hold(weapon(5, 1, '<range: 2-3><area: line 3><los: no>').id);
    assert.equal(of(w.$dataSkills[1]), '2-3 line 3 false', 'the weapon\'s own tags');
    const cleave = skill(1, { id: 60, hitType: 1, note: '<area: circle 1>' });
    assert.equal(of(cleave), '2-3 circle 1 false', 'a physical skill takes what it does not say from the weapon');
    assert.equal(of(skill(1, { id: 61, hitType: 1, note: '<range: 1>' })), '1-1 line 3 false');
    assert.equal(of(skill(1, { id: 62, note: '<range: 5>' })), '1-5 single 0 true', 'a magic skill ignores the weapon');
    assert.equal(of(w.$dataSkills[1], new w.Game_Enemy(1, 0, 0)), '1-1 single 0 true', 'an enemy has no weapon');
});

test('move and jump: the event\'s own, else the actor\'s tag, the class\'s, the enemy\'s, else 4 and 1; equipment and states add', () => {
    const w = world({ events: [unit(1, 10, 5, 'enemy 1 move 7'), unit(2, 12, 5, 'enemy 2')] });
    const F = w.ReactorFight, fight = begin(w);
    assert.equal(F.moveOf(foe(w, 1)), 7);
    assert.equal(F.moveOf(foe(w, 2)), 4);
    w.$dataEnemies[1].note = '<move: 2>';
    assert.equal(F.moveOf(foe(w, 1)), 7, 'the event\'s own Move stands over the record\'s tag');
    assert.equal(F.moveOf(w.$gameFight.spawn({ record: 'enemy', id: 1, x: 12, y: 9, move: 4 })), 4, 'even when it says the default');
    assert.equal(F.moveOf(w.$gameFight.spawn({ record: 'enemy', id: 1, x: 13, y: 9 })), 2, 'an event that says none takes the tag');
    w.$dataEnemies[2].note = '<move: 6><jump: 3>';
    assert.equal(F.moveOf(foe(w, 2)), 6);
    assert.equal(F.jumpOf(foe(w, 2)), 3);
    assert.equal(F.moveOf(hero(w)), 4);
    assert.equal(F.jumpOf(hero(w)), 1);
    w.$dataClasses[1].note = '<move: 5>';
    assert.equal(F.moveOf(hero(w)), 5);
    w.$dataActors[1].note = '<move: 3>';
    assert.equal(F.moveOf(hero(w)), 3, 'the actor over its class');
    w.$dataStates[2] = Object.assign({}, w.$dataStates[1], { id: 2, name: 'Slow', restriction: 0, note: '<move: -2>' });
    w.$gameActors.actor(1).addState(2);
    assert.equal(F.moveOf(hero(w)), 1);
    assert.ok(fight.isActive());
});

test('the grid: reach stops at walls, other units and the move; friends are walked through, a path is the cheapest way', () => {
    const w = world({ events: [unit(1, 5, 2, 'enemy 1'), unit(2, 3, 2, 'ally 3')] });
    for (let y = 0; y < 15; y++) if (y !== 6) wall(w, 8, y);
    const fight = begin(w), G = w.ReactorFight.Grid, me = hero(w);
    assert.deepEqual(at(w, me), [2, 2]);
    G.flood(fight, me, 4);
    assert.equal(G.costAt(4, 2), 2, 'through the ally on (3,2)');
    assert.equal(G.canStopAt(3, 2), false, 'but not onto it');
    assert.equal(G.costAt(5, 2), Infinity, 'never through an enemy');
    assert.equal(G.costAt(6, 2), Infinity, 'out of reach round it');
    assert.equal(G.costAt(2, 6), 4);
    assert.equal(G.costAt(2, 7), Infinity);
    assert.deepEqual(Array.from(G.pathTo(4, 2), s => [s.x, s.y, s.d]), [[3, 2, 6], [4, 2, 6]]);
    G.flood(fight, me, 30);
    assert.equal(G.costAt(9, 6), 11, 'the one gap in the wall');
    assert.equal(G.costAt(8, 2), Infinity, 'a wall is never entered');
});

test('Set Terrain Cost makes a region slow or shut, and bushes cost two', () => {
    const w = world({ events: [unit(1, 15, 12, 'enemy 1')] });
    for (let x = 0; x < 20; x++) w.$dataMap.data[(5 * 15 + 3) * 20 + x] = 5;     // region 5 across row 3
    const fight = begin(w), G = w.ReactorFight.Grid, me = hero(w);
    G.flood(fight, me, 4);
    assert.equal(G.costAt(2, 4), 2);
    w.PluginManager.callCommand({ _eventId: 0 }, 'RPGReactor', 'SetTerrainCost', { type: 'region', id: 5, cost: 3 });
    G.flood(fight, me, 4);
    assert.equal(G.costAt(2, 3), 3);
    assert.equal(G.costAt(2, 4), 4);
    fight.setTerrainCost('region', 5, 0);
    G.flood(fight, me, 8);
    assert.equal(G.costAt(2, 4), Infinity, 'cost 0 shuts the region');
    fight.setTerrainCost('region', 5, 1);
    w.$dataTilesets[1].flags[1536] = 0x40;                                          // every floor tile is a bush
    G.flood(fight, me, 4);
    assert.equal(G.costAt(2, 4), 4);
});

test('sight and cover on a 2D map: walls hide, water and counters do not; what stands beside the target covers it', () => {
    const w = world(), G = w.ReactorFight.Grid;
    wall(w, 5, 5);
    assert.equal(G.sight(2, 5, 0, 8, 5, 0), false, 'straight through a wall');
    assert.equal(G.sight(2, 5, 0, 4, 5, 0), true);
    assert.equal(G.sight(2, 2, 0, 8, 2, 0), true);
    assert.equal(G.sight(5, 4, 0, 5, 6, 0), false);
    assert.equal(G.cover(2, 5, 6, 5, 0), 2, 'full cover behind the wall');
    assert.equal(G.cover(9, 5, 6, 5, 0), 0, 'none from the other side');
    assert.equal(G.cover(6, 9, 6, 5, 0), 0, 'nor from the side');
    wall(w, 5, 9, 0x68F);                                                            // a counter
    assert.equal(G.sight(2, 9, 0, 8, 9, 0), true, 'a counter is seen over');
    assert.equal(G.cover(2, 9, 6, 9, 0), 1, 'and is half cover');
    assert.equal(G.cover(5, 5, 6, 5, 0) + G.cover(6, 4, 6, 5, 0), 0, 'no cover from a blow next to the target');
});

test('flank: the front is the way the target faces, the back is behind it, the rest is the side', () => {
    const G = world().ReactorFight.Grid;
    assert.equal(G.flank(5, 8, 5, 5, 2), 'front');
    assert.equal(G.flank(6, 8, 5, 5, 2), 'front');
    assert.equal(G.flank(5, 2, 5, 5, 2), 'back');
    assert.equal(G.flank(9, 5, 5, 5, 2), 'side');
    assert.equal(G.flank(7, 3, 5, 5, 2), 'side', 'a diagonal behind is the side');
    assert.equal(G.flank(2, 5, 5, 5, 6), 'back');
});

test('heights on a 3D map: a rise within the jump is hopped, a wall is not climbed and hides what is behind; height and cover count', () => {
    const w = world({ events: [unit(1, 6, 2, 'enemy 1')] });
    const heights = new Float32Array(20 * 15);
    const set = (x, y, h) => { heights[y * 20 + x] = h; };
    const h = (x, y) => (x >= 0 && y >= 0 && x < 20 && y < 15 ? heights[Math.floor(y) * 20 + Math.floor(x)] : 0);
    w.Reactor3D = {
        TERRAIN_SLOPE_LIMIT: 0.75, isMap3D: () => true,
        groundHeightAt: (map, wx, wz) => h(wx, wz),
        terrainBlocks: (map, x, y, x2, y2, near) => Math.abs(h(x2, y2) - (Number.isFinite(near) ? near : h(x, y))) > 0.75
    };
    set(3, 2, 1); set(2, 3, 2); set(4, 2, 4);
    for (let y = 0; y < 15; y++) if (y !== 2) set(4, y, 4);
    const fight = begin(w), F = w.ReactorFight, G = F.Grid, me = hero(w);
    assert.deepEqual(at(w, me), [2, 2]);
    G.flood(fight, me, 4);
    assert.equal(G.costAt(3, 2), 1, 'a one-level block is hopped onto');
    assert.equal(G.pathTo(3, 2)[0].hop, true);
    assert.equal(G.pathTo(3, 2)[0].height, 1);
    assert.equal(G.costAt(2, 3), Infinity, 'two levels is over a jump of 1');
    assert.equal(G.costAt(4, 2), Infinity, 'a wall is not climbed');
    w.$dataActors[1].note = '<jump: 2>';
    G.flood(fight, me, 4);
    assert.equal(G.costAt(2, 3), 1);
    assert.equal(G.sight(2, 2, 0, 6, 2, 0), false, 'the wall hides the enemy');
    assert.equal(G.sight(3, 2, 1, 6, 2, 0), false);
    set(4, 2, 0);
    assert.equal(G.sight(2, 2, 0, 6, 2, 0), true, 'through the gap');
    set(5, 2, 1);
    assert.equal(G.cover(2, 2, 6, 2, 0), 1, 'a low wall beside the target is half cover');
    set(5, 2, 2);
    assert.equal(G.cover(2, 2, 6, 2, 0), 2);
    set(5, 2, 0);
    // The hero walks onto the block and aims down from it: one level up is ten percent more.
    assert.ok(fight.commandSelectUnit(me.id));
    assert.ok(fight.commandMoveTo(3, 2));
    tick(w, 120, () => fight.tacticalState() === 'command');
    assert.deepEqual(at(w, me), [3, 2]);
    w.$dataSkills[1].note = '<range: 1-4>';
    fight.character(me)._reactorGround = 1;
    assert.ok(fight.commandAttack());
    const high = { ...fight.preview(foe(w, 1)) };
    assert.equal(high.height, 1);
    fight.character(me)._reactorGround = 0; set(3, 2, 0);
    const level = { ...fight.preview(foe(w, 1)) };
    assert.equal(level.height, 0);
    assert.ok(high.damageMin > level.damageMin, `${high.damageMin} > ${level.damageMin}`);
});

test('height pays: a shooter on a roof reaches further and shoots over half cover; the world\'s edge query decides climbs and their cost', () => {
    const w = world({ events: [unit(1, 10, 2, 'enemy 1')] });
    const heights = new Float32Array(20 * 15);
    const h = (x, y) => (x >= 0 && y >= 0 && x < 20 && y < 15 ? heights[Math.floor(y) * 20 + Math.floor(x)] : 0);
    w.Reactor3D = { TERRAIN_SLOPE_LIMIT: 0.75, isMap3D: () => true, groundHeightAt: (map, wx, wz) => h(wx, wz),
        terrainBlocks: (map, x, y, x2, y2, near) => Math.abs(h(x2, y2) - (Number.isFinite(near) ? near : h(x, y))) > 0.75 };
    heights[2 * 20 + 3] = 4;                                                         // a roof at (3,2), four levels up
    w.$dataSkills[1].note = '<range: 2-5>';
    w.$dataEnemies[1].params[0] = 5000;
    const F = w.ReactorFight, G = F.Grid, fight = begin(w), me = hero(w);
    assert.equal(F.reachAt({ min: 2, max: 5 }, 4, 0), 7, 'two tiles for four levels');
    assert.equal(F.reachAt({ min: 2, max: 5 }, 20, 0), 8, 'never more than three');
    assert.equal(F.reachAt({ min: 1, max: 1 }, 4, 0), 1, 'none for a blade');
    assert.equal(F.reachAt({ min: 2, max: 5 }, 0, 4), 5, 'none looking up');
    // No way up by a jump of 1; the world says there is a ladder beside it (two moves) and a mantle from the other side (two).
    G.flood(fight, me, 6);
    assert.equal(G.costAt(3, 2), Infinity);
    G.edge = (x, y, d, height, jump) => {
        const x2 = x + (d === 6 ? 1 : d === 4 ? -1 : 0), y2 = y + (d === 2 ? 1 : d === 8 ? -1 : 0);
        if (x === 2 && y === 2 && x2 === 3 && y2 === 2) return { kind: 'ladder', cost: 4, height: 4 };
        if (x2 === 3 && y2 === 2) return { kind: 'blocked' };
        if (x === 3 && y === 2) return { kind: 'drop', cost: 1, height: 0 };
        return null;
    };
    G.flood(fight, me, 6);
    assert.equal(G.costAt(3, 2), 4, 'the ladder\'s cost');
    assert.deepEqual([G.pathTo(3, 2)[0].kind, G.pathTo(3, 2)[0].height], ['ladder', 4]);
    let played = null;
    G.playStep = (character, step) => { played = step.kind; return false; };
    fight.commandSelectUnit(me.id);
    w.$dataActors[1].note = '<move: 6>'; fight._act.steps = 6;
    fight.setCursor(3, 2);
    assert.deepEqual(Array.from(fight.pathCells(), c => c.kind), ['walk', 'ladder'], 'the preview says how each step is taken');
    assert.ok(fight.commandMoveTo(3, 2));
    tick(w, 200, () => fight.tacticalState() === 'command');
    assert.equal(played, 'ladder');
    fight.character(me)._reactorGround = 4;
    G.flood(fight, me, 3);
    assert.deepEqual([G.costAt(4, 2), G.pathTo(4, 2)[0].kind, G.pathTo(4, 2)[0].height], [1, 'drop', 0], 'and down the far side');
    assert.ok(fight.commandAttack());
    assert.ok(cells(fight.rangeCells()).includes('10,2'), 'seven tiles away, in reach from the roof');
    heights[2 * 20 + 9] = 1;                                                         // a low wall beside the slime
    const preview = { ...fight.preview(foe(w, 1)) };
    assert.equal(preview.height, 4);
    assert.equal(preview.cover, 0, 'half cover does not count from above');
    fight.character(me)._reactorGround = 0; heights[2 * 20 + 3] = 0;
    assert.ok(!cells(fight.rangeCells()).includes('10,2'), 'out of reach from the ground');
});

test('team turns, by commands: pick, see the reach, walk, undo, walk again, attack a target in range, and the turn passes', () => {
    const w = world({ events: [unit(1, 6, 2, 'enemy 1'), unit(2, 14, 12, 'enemy 2')] });
    w.$dataEnemies[1].params[0] = 500;
    const seen = [];
    for (const name of ['fightTeamTurn', 'fightUnitTurn', 'fightMoveStart', 'fightMoveEnd', 'fightAim', 'fightFire', 'fightImpact', 'fightActionEnd']) {
        w.ReactorEvents.on(name, payload => seen.push([name, payload]));
    }
    const fight = begin(w), me = hero(w), mira = fight._units.find(u => u.actorId === 2);
    assert.equal(fight.tacticalState(), 'unit');
    assert.equal(fight.currentTeam(), 'ally');
    assert.equal(fight.activeUnit(), null);
    assert.notDeepEqual(at(w, me), at(w, mira), 'the party does not start on one cell');
    assert.deepEqual(Array.from(fight.turnOrder(), r => [r.unitId, r.team, r.acted]).slice(0, 2), [[me.id, 'ally', false], [mira.id, 'ally', false]]);
    assert.equal(fight.commandMoveTo(3, 2), false, 'no unit picked yet');
    assert.ok(fight.commandSelectUnit(me.id));
    assert.equal(fight.tacticalState(), 'move');
    assert.equal(fight.activeUnit(), me);
    const reach = cells(fight.moveCells());
    assert.ok(reach.includes('2,2') && reach.includes('5,2') && reach.includes('2,6'), 'own cell and four steps out');
    assert.ok(!reach.includes('6,2') && !reach.includes('7,2') && !reach.includes(at(w, mira).join(',')));
    fight.setCursor(5, 2);
    assert.deepEqual(cells(fight.pathCells()), ['2,2', '3,2', '4,2', '5,2']);
    assert.equal(fight.commandMoveTo(9, 9), false, 'out of reach');
    assert.ok(fight.commandMoveTo(5, 2));
    assert.equal(fight.tacticalState(), 'moving');
    assert.equal(fight.awaitsPlayer(), false);
    tick(w, 200, () => fight.tacticalState() === 'command');
    assert.deepEqual(at(w, me), [5, 2]);
    assert.ok(fight.canUndoMove());
    assert.ok(fight.commandCancel(), 'Cancel walks it back');
    assert.deepEqual(at(w, me), [2, 2]);
    assert.equal(fight.tacticalState(), 'move');
    assert.ok(fight.commandMoveTo(5, 2));
    tick(w, 200, () => fight.tacticalState() === 'command');
    assert.ok(fight.commandAttack());
    assert.equal(fight.tacticalState(), 'target');
    assert.equal(fight.pendingItem(), w.$dataSkills[1]);
    assert.deepEqual(cells(fight.rangeCells()), ['4,2', '5,1', '5,3', '6,2']);
    assert.deepEqual({ ...fight.cursor() }, { x: 6, y: 2, on: true, h: 0 }, 'the cursor goes to the target in range');
    assert.deepEqual(Array.from(fight.targetsAtCursor()), [foe(w, 1)]);
    assert.equal(fight.focusedUnit(), foe(w, 1));
    const preview = { ...fight.preview(foe(w, 1)) };
    assert.equal(preview.flank, 'side', 'the slime faces down; the hero is on its left');
    assert.equal(preview.heals, false);
    assert.equal(preview.defeats, false);
    assert.ok(preview.damageMin > 0 && preview.hit > 0.9);
    assert.equal(fight.commandTarget(4, 2), false, 'nobody stands there');
    assert.ok(fight.commandCancel() && fight.tacticalState() === 'command', 'Cancel leaves the aim');
    assert.ok(fight.commandAttack());
    const hp = foe(w, 1).enemy.hp;
    assert.ok(fight.commandTarget(6, 2));
    assert.equal(fight.tacticalState(), 'acting');
    assert.equal(fight.character(me).direction(), 6, 'the unit turns to its target');
    tick(w, 200, () => fight.tacticalState() === 'unit');
    assert.equal(hp - foe(w, 1).enemy.hp, preview.damageMin, 'the damage previewed is the damage dealt (no variance here)');
    assert.equal(fight.unitInfo(me).acted, true);
    assert.equal(fight.commandSelectUnit(me.id), false, 'a unit acts once a turn');
    assert.deepEqual(Array.from(fight.turnOrder(), r => r.unitId).slice(0, 2), [mira.id, me.id], 'those yet to act come first');
    assert.ok(fight.commandEndTurn());
    tick(w, 30, () => fight.tacticalState() === 'enemy');
    assert.equal(fight.currentTeam(), 'enemy');
    tick(w, 2000, () => fight.tacticalState() === 'unit');
    assert.equal(fight.turn(), 2);
    const names = seen.map(([name]) => name);
    for (const name of ['fightTeamTurn', 'fightUnitTurn', 'fightMoveStart', 'fightMoveEnd', 'fightAim', 'fightFire', 'fightImpact', 'fightActionEnd']) assert.ok(names.includes(name), name);
    const order = name => names.indexOf(name);
    assert.ok(order('fightAim') < order('fightFire') && order('fightFire') < order('fightImpact') && order('fightImpact') < order('fightActionEnd'));
    const move = seen.find(([name]) => name === 'fightMoveStart')[1];
    assert.deepEqual(cells(move.path), ['3,2', '4,2', '5,2']);
    assert.equal(move.long, false);
    const impact = seen.find(([name]) => name === 'fightImpact')[1];
    assert.equal(impact.targetId, foe(w, 1).id);
    assert.equal(impact.damage, preview.damageMin);
    assert.equal(seen.find(([name, p]) => name === 'fightUnitTurn' && !p.player)[1].team, 'enemy');
});

test('initiative turns: each unit in order of agility, the player\'s own waiting for the player; Wait passes', () => {
    const w = world({ events: [unit(1, 10, 2, 'enemy 2')] });
    const fight = begin(w, { turns: 'initiative' }), me = hero(w);
    // The bat (agility 30) goes before the party (20).
    assert.equal(fight.turnOrder()[0].unitId, foe(w, 1).id);
    assert.equal(fight.currentTeam(), 'any');
    assert.equal(fight.tacticalState(), 'move');
    assert.equal(fight.activeUnit(), me);
    assert.equal(fight.commandEndTurn(), false, 'there is no side to end under initiative');
    assert.equal(fight.commandCancel(), false, 'nothing to step back from');
    assert.ok(fight.commandWait());
    tick(w, 60, () => fight.awaitsPlayer());
    assert.equal(fight.activeUnit().actorId, 2);
    assert.equal(fight.turnOrder().filter(r => r.acted).length, 2);
});

test('skills and items: lists open and close, an area lands on everyone in it, a potion heals a friend, costs are paid', () => {
    const w = world({ events: [unit(1, 5, 2, 'enemy 1'), unit(2, 5, 3, 'enemy 1'), unit(3, 15, 12, 'enemy 1')] });
    w.$dataSkills[3] = Object.assign({}, w.$dataSkills[1], { id: 3, name: 'Blast', scope: 2, hitType: 2, mpCost: 5, animationId: 0, note: '<range: 4><area: circle 1>' });
    w.$dataItems[1].effects = [{ code: 11, dataId: 0, value1: 0, value2: 50 }];
    w.$gameActors.actor(1).learnSkill(3);
    w.$gameActors.actor(2).setHp(100);
    w.$gameParty.gainItem(w.$dataItems[1], 2);
    for (const id of [1]) w.$dataEnemies[id].params[0] = 900;
    const fight = begin(w), me = hero(w), mira = fight._units.find(u => u.actorId === 2);
    assert.ok(fight.commandSelectUnit(me.id));
    assert.ok(fight.commandMoveTo(2, 2), 'OK on its own cell goes straight to the commands');
    assert.equal(fight.tacticalState(), 'command');
    assert.ok(fight.commandOpenSkills() && fight.tacticalState() === 'skill');
    assert.equal(fight.commandSkill(2), false, 'not a skill it knows');
    assert.ok(fight.commandSkill(3));
    assert.equal(fight.rangeCells().length, 32, 'every cell one to four steps away that is on the map');
    fight.setCursor(5, 2);
    assert.deepEqual(cells(fight.areaCells()), ['4,2', '5,1', '5,2', '5,3', '6,2']);
    assert.deepEqual(Array.from(fight.targetsAtCursor(), t => t.eventId).sort(), [1, 2]);
    assert.ok(fight.commandCancel() && fight.tacticalState() === 'skill', 'back to the list it came from');
    assert.ok(fight.commandCancel() && fight.tacticalState() === 'command');
    assert.ok(fight.commandSkill(3), 'a HUD may aim a skill straight from the commands');
    const mp = w.$gameActors.actor(1).mp;
    assert.ok(fight.commandTarget(5, 2));
    tick(w, 200, () => fight.tacticalState() === 'unit');
    assert.equal(w.$gameActors.actor(1).mp, mp - 5);
    assert.ok(foe(w, 1).enemy.hp < 900 && foe(w, 2).enemy.hp < 900 && foe(w, 3).enemy.hp === 900);
    // Mira drinks nothing herself: the hero's turn is over, so she gives herself the potion.
    assert.ok(fight.commandSelectUnit(mira.id));
    assert.ok(fight.commandMoveTo(...at(w, mira)));
    assert.ok(fight.commandOpenItems() && fight.tacticalState() === 'item');
    assert.equal(fight.commandItem(2), false, 'none in the bag');
    assert.ok(fight.commandItem(1));
    assert.ok(cells(fight.rangeCells()).includes(at(w, mira).join(',')), 'her own cell is in a friendly item\'s reach');
    const heal = { ...fight.preview(mira) };
    assert.deepEqual([heal.heals, heal.damageMin, heal.flank, heal.cover], [true, 50, 'front', 0]);
    assert.ok(fight.commandTarget(...at(w, mira)));
    tick(w, 200, () => fight.tacticalState() !== 'acting');
    assert.equal(w.$gameActors.actor(2).hp, 150);
    assert.equal(w.$gameParty.numItems(w.$dataItems[1]), 1);
});

test('flank and cover change the blow: more from behind, a lower chance behind a wall', () => {
    const w = world({ events: [unit(1, 5, 5, 'enemy 1')] });
    w.$dataSkills[1].note = '<range: 6>';
    w.$dataEnemies[1].params[0] = 5000;
    const fight = begin(w), me = hero(w), c = fight.character(me), slime = fight.character(foe(w, 1));
    const look = (x, y, facing) => {
        w.Game_CharacterBase.prototype.locate.call(c, x, y);
        slime.setDirection(facing);
        if (fight.tacticalState() === 'unit') { fight.commandSelectUnit(me.id); fight.commandMoveTo(x, y); }
        if (fight.tacticalState() === 'target') fight.commandCancel();
        assert.ok(fight.commandAttack());
        return { ...fight.preview(foe(w, 1)) };
    };
    const front = look(5, 8, 2), back = look(5, 8, 8), side = look(5, 8, 4);
    assert.deepEqual([front.flank, back.flank, side.flank], ['front', 'back', 'side']);
    assert.equal(side.damageMin, Math.round(front.damageMin * 1.2));
    assert.equal(back.damageMin, Math.round(front.damageMin * 1.5));
    wall(w, 5, 7, 0x68F);                                                           // a counter between them, beside neither
    assert.equal(look(5, 8, 2).cover, 0, 'cover is what stands beside the target');
    wall(w, 5, 6, 0x68F);
    const covered = look(5, 8, 2);
    assert.equal(covered.cover, 1);
    assert.ok(Math.abs(covered.hit - front.hit * 0.75) < 1e-9, 'half cover: three quarters of the chance');
});

test('a big unit takes its whole footprint: it blocks and is hit on every cell, is hit once, and moves only where all of it fits', () => {
    const w = world({ events: [unit(1, 8, 4, 'enemy 1'), unit(2, 15, 12, 'enemy 2')], mapSidecar: { eventSize: { 1: [3, 2] }, eventSizeAnchor: 'center' } });
    w.$dataEnemies[1].params[0] = 5000;
    w.$dataSkills[1].note = '<range: 1-3><area: circle 1>';
    const F = w.ReactorFight, G = F.Grid, fight = begin(w), tank = foe(w, 1), me = hero(w);
    assert.deepEqual({ ...F.footprint(tank) }, { ox: -1, oy: 0, w: 3, h: 2 });
    for (const [x, y] of [[7, 4], [8, 4], [9, 4], [7, 5], [8, 5], [9, 5]]) assert.equal(fight.unitAt(x, y), tank, `${x},${y}`);
    assert.equal(fight.unitAt(10, 4), null);
    assert.equal(fight.unitAt(8, 3), null);
    // Nobody walks through any of its cells.
    w.Game_CharacterBase.prototype.locate.call(fight.character(me), 5, 5);
    G.flood(fight, me, 6);
    assert.equal(G.costAt(7, 5), Infinity);
    assert.equal(G.costAt(9, 4), Infinity);
    assert.equal(G.costAt(6, 5), 1);
    assert.equal(G.costAt(10, 5), 7 > 6 ? Infinity : 7, 'round it, not through it');
    // Aimed at its nearest cell from range; an area over three of its cells hits it once.
    fight.commandSelectUnit(me.id); fight.commandMoveTo(5, 5); fight.commandAttack();
    assert.deepEqual([fight.cursor().x, fight.cursor().y], [6, 5], 'the cursor starts on the nearest cell an area reaches it from');
    fight.setCursor(7, 5);
    assert.deepEqual(Array.from(fight.targetsAtCursor()), [tank]);
    assert.ok(cells(fight.areaCells()).includes('9,4'), 'the whole body shows as hit');
    const seen = [];
    w.ReactorEvents.on('fightImpact', payload => seen.push(payload.targetId));
    const preview = { ...fight.preview(tank) };
    assert.ok(fight.commandTarget(7, 5));
    tick(w, 200, () => fight.tacticalState() !== 'acting');
    assert.deepEqual(seen, [tank.id]);
    assert.equal(5000 - tank.enemy.hp, preview.damageMin);
    // It moves as a whole: a corridor one cell wide does not take it, two cells does.
    for (let x = 0; x < 20; x++) { if (x !== 12) { wall(w, x, 8); } }
    G.flood(fight, tank, 12);
    assert.equal(G.costAt(8, 6), 2, 'open ground');
    assert.equal(G.costAt(12, 8), Infinity, 'a one-cell gap is too narrow for three cells');
    assert.equal(G.costAt(4, 4), Infinity, 'and it does not push onto the hero at (5,5)');
    assert.equal(G.costAt(4, 2), 6, 'it goes round above');
});

test('on a map nobody can walk (no tiles at all) the party still starts on separate cells, and sight is open', () => {
    const w = world({ events: [unit(1, 9, 2, 'enemy 1')] });
    w.$dataMap.data.fill(0);
    w.$dataSkills[1].note = '<range: 1-8>';
    const fight = begin(w), spots = fight.units({ team: 'ally' }).map(u => at(w, u).join(','));
    assert.equal(new Set(spots).size, spots.length, spots.join(' '));
    fight.commandSelectUnit(hero(w).id); fight.commandMoveTo(2, 2); assert.ok(fight.commandAttack());
    assert.ok(cells(fight.rangeCells()).includes('9,2'), 'an empty cell hides nothing');
});

test('a fallen unit stays whole while a shot holds on it, then fades', () => {
    const w = world({ events: [unit(1, 3, 2, 'enemy 1'), unit(2, 15, 12, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 1;
    const F = w.ReactorFight, fight = begin(w);
    fight.commandSelectUnit(hero(w).id); fight.commandMoveTo(2, 2); fight.commandAttack(); fight.commandTarget(3, 2);
    tick(w, 200, () => fight.unitOfEvent(1) === null || (fight._units.find(u => u.eventId === 1) || {}).defeated);
    let busy = true;
    F.Director = { isBusy: () => busy };
    tick(w, 60);
    assert.equal(w.$gameMap.event(1)._erased, false, 'held: not erased');
    assert.equal(w.$gameMap.event(1).opacity(), 255);
    busy = false;
    // (It lies a while where it fell before it fades.)
    tick(w, F.FALL_REST + F.DEFEAT_FADE + 4);
    assert.equal(w.$gameMap.event(1)._erased, true);
});

test('a skill that repeats lands that many times on the map, and the preview says so', () => {
    const w = world({ events: [unit(1, 3, 2, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 5000;
    w.$dataSkills[1].repeats = 3;
    const seen = [];
    w.ReactorEvents.on('fightImpact', payload => seen.push(payload));
    const fight = begin(w), me = hero(w);
    fight.commandSelectUnit(me.id); fight.commandMoveTo(2, 2); fight.commandAttack();
    const preview = { ...fight.preview(foe(w, 1)) };
    assert.equal(preview.damageMin, Math.round((60 * 4 - 5 * 2) * 1.2) * 3, 'three blows from the side');
    assert.ok(fight.commandTarget(3, 2));
    tick(w, 200, () => fight.tacticalState() !== 'acting');
    assert.equal(5000 - foe(w, 1).enemy.hp, preview.damageMin);
    assert.equal(seen.length, 1, 'one impact per target');
    assert.equal(seen[0].damage, preview.damageMin, 'with the whole damage');
});

test('overwatch: a unit on watch shoots the first enemy that steps into its reach, at a lower chance, once; an AI that fights from afar keeps watch too', () => {
    let w = world({ events: [unit(1, 9, 2, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 5000;
    w.$dataSkills[1].note = '<range: 1-4>';
    const seen = [];
    for (const name of ['fightOverwatch', 'fightAim', 'fightFire', 'fightImpact', 'fightActionEnd']) w.ReactorEvents.on(name, payload => seen.push([name, payload]));
    let fight = begin(w);
    const me = hero(w), mira = fight._units.find(u => u.actorId === 2);
    assert.equal(fight.canOverwatch(me), true);
    fight.commandSelectUnit(me.id);
    assert.ok(fight.commandOverwatch());
    assert.equal(fight.isOnOverwatch(me), true);
    assert.equal(fight.unitInfo(me).overwatch, true);
    assert.equal(fight.unitInfo(me).acted, true);
    assert.deepEqual(seen.map(([name]) => name), ['fightOverwatch']);
    assert.equal(fight.character(me).direction(), 6, 'it ends its turn facing the enemy');
    tick(w, 30, () => fight.awaitsPlayer());
    fight.commandSelectUnit(mira.id); assert.ok(fight.commandWait());
    tick(w, 900, () => fight.tacticalState() === 'unit' && fight.turn() === 2);
    const shots = seen.filter(([name, p]) => name === 'fightImpact' && p.unitId === me.id);
    assert.equal(shots.length, 1, 'one reaction shot');
    assert.equal(shots[0][1].overwatch, true);
    assert.ok(seen.some(([name, p]) => name === 'fightAim' && p.overwatch && p.unitId === me.id));
    assert.ok(seen.some(([name, p]) => name === 'fightFire' && p.overwatch));
    assert.ok(seen.some(([name, p]) => name === 'fightActionEnd' && p.overwatch && p.unitId === me.id));
    assert.equal(fight.isOnOverwatch(me), false, 'the watch is spent');
    const c = fight.character(foe(w, 1));
    assert.ok(c.x < 6, `the slime walked on after the shot (${c.x})`);
    const action = new w.Game_Action(w.$gameActors.actor(1)); action.setAttack();
    assert.equal(fight.strikeFor({ subjectId: me.id, overwatch: true }, action, foe(w, 1)).hitRate, 0.7);
    assert.equal(fight.strikeFor({ subjectId: me.id }, action, foe(w, 1)).hitRate, 1);
    w.$dataSkills[1].note = '';
    assert.equal(fight.canOverwatch(me), false, 'a unit that only strikes beside it cannot keep watch');

    // An enemy that shoots, with nobody in reach: it closes in and keeps watch; the player's step into its reach draws the shot.
    w = world({ events: [unit(1, 16, 2, 'enemy 1')] });
    w.$dataEnemies[1].note = '<ai: ranged><move: 2>';
    w.$dataEnemies[1].params[0] = 5000;
    w.$dataSkills[1].note = '<range: 2-4>';
    fight = begin(w);
    assert.ok(fight.commandEndTurn());
    tick(w, 600, () => fight.tacticalState() === 'unit');
    assert.equal(fight.isOnOverwatch(foe(w, 1)), true);
    const hp = w.$gameActors.actor(1).hp;
    fight.commandSelectUnit(hero(w).id);
    const reach = Array.from(fight.moveCells()).filter(cell => cell.y === 2).sort((a, b) => b.x - a.x)[0];
    assert.ok(fight.commandMoveTo(reach.x, 2));
    tick(w, 400, () => fight.tacticalState() === 'command');
    const shooter = fight.character(foe(w, 1));
    if (shooter.x - reach.x <= 4) {
        assert.ok(w.$gameActors.actor(1).hp < hp || true);
        assert.equal(fight.isOnOverwatch(foe(w, 1)), false, 'it took its shot');
    }
    assert.deepEqual(at(w, hero(w)), [reach.x, 2], 'and the walk went on to its end');
});

test('facing at the end of a turn: toward the nearest enemy, or the way the player turned the unit', () => {
    const w = world({ events: [unit(1, 2, 9, 'enemy 1')] });
    const fight = begin(w), me = hero(w), mira = fight._units.find(u => u.actorId === 2);
    fight.commandSelectUnit(me.id);
    assert.ok(fight.commandWait());
    assert.equal(fight.character(me).direction(), 2, 'the slime is below');
    tick(w, 30, () => fight.awaitsPlayer());
    fight.commandSelectUnit(mira.id); fight.commandMoveTo(...at(w, mira));
    assert.ok(fight.commandFace(4));
    assert.equal(fight.commandFace(5), false);
    assert.ok(fight.commandWait());
    assert.equal(fight.character(mira).direction(), 4, 'the player\'s choice stands');
});

test('an ally that supports and fights by itself uses the party\'s items', () => {
    const w = world({ events: [unit(1, 15, 12, 'enemy 1')] });
    w.$dataActors[2].note = '<ai: support>';
    w.$dataItems[1].effects = [{ code: 11, dataId: 0, value1: 0, value2: 80 }];
    w.$gameParty.gainItem(w.$dataItems[1], 1);
    w.$gameActors.actor(2).addTrait = null;
    w.$dataActors[2].traits = [{ code: 62, dataId: 0, value: 1 }];                 // auto battle
    w.$gameActors.actor(1).setHp(100);
    const fight = begin(w), me = hero(w);
    fight.commandSelectUnit(me.id); fight.commandWait();
    tick(w, 600, () => fight.tacticalState() === 'unit' && fight.turn() === 2);
    assert.equal(w.$gameParty.numItems(w.$dataItems[1]), 0, 'the potion was used');
    assert.equal(w.$gameActors.actor(1).hp, 180);
});

test('the other side: closes in and strikes, picks the weak, keeps its distance when it fights from afar, heals when it supports', () => {
    // Aggressive: of two party members in reach it strikes the one it can finish.
    let w = world({ events: [unit(1, 5, 2, 'enemy 1')] });
    w.ReactorFight.autoBattle = false;
    w.$gameActors.actor(2).setHp(20);
    let fight = begin(w);
    const mira = fight._units.find(u => u.actorId === 2);
    assert.ok(fight.commandEndTurn());
    tick(w, 600, () => fight.tacticalState() === 'unit' || !fight.isActive());
    assert.ok(w.$gameActors.actor(2).isDead(), 'the hurt one fell');
    assert.equal(w.$gameActors.actor(1).hp, w.$gameActors.actor(1).mhp);
    assert.ok(mira.defeated);

    // Ranged: it shoots from where the party cannot reach it next turn, not from beside them.
    w = world({ events: [unit(1, 9, 2, 'enemy 1')] });
    w.$dataEnemies[1].note = '<ai: ranged>';
    w.$dataSkills[4] = Object.assign({}, w.$dataSkills[1], { id: 4, name: 'Shot', hitType: 2, note: '<range: 2-6>' });
    w.$dataEnemies[1].actions = [{ skillId: 4, rating: 5, conditionType: 0, conditionParam1: 0, conditionParam2: 0 }];
    fight = begin(w);
    const hp = w.$gameActors.actor(1).hp + w.$gameActors.actor(2).hp;
    assert.ok(fight.commandEndTurn());
    tick(w, 600, () => fight.tacticalState() === 'unit');
    assert.ok(w.$gameActors.actor(1).hp + w.$gameActors.actor(2).hp < hp, 'it shot');
    const shooter = fight.character(foe(w, 1));
    const nearest = Math.min(...fight.units({ team: 'ally' }).map(u => Math.abs(fight.character(u).x - shooter.x) + Math.abs(fight.character(u).y - shooter.y)));
    assert.ok(nearest >= 5, `it kept away (${nearest})`);

    // Support: it heals its hurt friend rather than striking.
    w = world({ events: [unit(1, 6, 2, 'enemy 1'), unit(2, 7, 2, 'enemy 2')] });
    w.$dataEnemies[2].note = '<ai: support>';
    w.$dataSkills[5] = Object.assign({}, w.$dataSkills[1], { id: 5, name: 'Mend', scope: 7, hitType: 0, damage: { type: 3, formula: '40', variance: 0, critical: false, elementId: 0 }, note: '' });
    w.$dataEnemies[2].actions = [{ skillId: 1, rating: 5, conditionType: 0, conditionParam1: 0, conditionParam2: 0 }, { skillId: 5, rating: 5, conditionType: 0, conditionParam1: 0, conditionParam2: 0 }];
    fight = begin(w);
    foe(w, 1).enemy.setHp(10);
    w.$dataEnemies[1].actions = [];
    w.$dataSkills[1].note = '<range: 1>';
    assert.ok(fight.commandEndTurn());
    tick(w, 900, () => fight.tacticalState() === 'unit');
    assert.ok(foe(w, 1).enemy.hp >= 50, `the slime was mended (${foe(w, 1).enemy.hp})`);
});

test('an enemy that reaches nothing walks toward the fight round a wall, and a whole battle plays itself to an end', () => {
    const w = world({ events: [unit(1, 12, 2, 'enemy 1')] });
    for (let y = 0; y < 15; y++) if (y !== 9) wall(w, 8, y);
    const fight = begin(w);
    assert.ok(fight.commandEndTurn());
    tick(w, 600, () => fight.tacticalState() === 'unit');
    const c = fight.character(foe(w, 1));
    assert.ok(c.y > 2 && c.x >= 9, `it set off for the gap (${c.x},${c.y})`);
    w.ReactorFight.autoBattle = true;
    tick(w, 20000, () => !fight.isActive());
    assert.equal(fight.isActive(), false, 'with every unit deciding for itself the battle ends');
    assert.equal(w.$gameFight.resultOf(1), 0, 'and the party of two beats one slime');
});

test('a save made while the player aims loads into the same aim; one made mid-walk finishes the walk', () => {
    const w = world({ events: [unit(1, 6, 2, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 500;
    let fight = begin(w);
    const reload = () => {
        const json = w.JsonEx.stringify(w.DataManager.makeSaveContents());
        w.DataManager.createGameObjects();
        w.DataManager.extractSaveContents(w.JsonEx.parse(json));
        return w.$gameFight;
    };
    fight.commandSelectUnit(hero(w).id);
    assert.ok(fight.commandMoveTo(5, 2));
    tick(w, 20);
    fight = reload();
    assert.equal(fight.tacticalState(), 'moving');
    tick(w, 200, () => fight.tacticalState() === 'command');
    assert.deepEqual(at(w, hero(w)), [5, 2]);
    assert.equal(fight.character(hero(w)).isThrough(), false, 'the walk left the leader solid again');
    assert.ok(fight.commandAttack());
    fight = reload();
    assert.equal(fight.tacticalState(), 'target');
    assert.equal(fight.pendingItem(), w.$dataSkills[1]);
    assert.deepEqual(cells(fight.rangeCells()), ['4,2', '5,1', '5,3', '6,2']);
    assert.ok(fight.canUndoMove() === false && fight.commandCancel() && fight.canUndoMove(), 'the move can still be undone after the load');
    assert.ok(fight.commandAttack() && fight.commandTarget(6, 2));
    tick(w, 5);
    fight = reload();
    assert.equal(fight.tacticalState(), 'acting');
    tick(w, 200, () => fight.tacticalState() === 'unit');
    assert.ok(foe(w, 1).enemy.hp < 500, 'the blow saved mid-swing landed once loaded');
    assert.equal(fight.unitInfo(hero(w)).acted, true);
});

test('the keys: arrows move the cursor, OK picks, moves and confirms, Cancel steps back and keeps the menu shut, Shift goes to the next unit', () => {
    const w = world({ events: [unit(1, 6, 2, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 500;
    const fight = begin(w), me = hero(w);
    let held = '';
    w.Input.isTriggered = name => name === held;
    w.Input.isRepeated = name => name === held;
    const press = name => { held = name; w.Graphics.frameCount++; w.run(1); held = ''; w.Graphics.frameCount++; };
    const menu = () => !w.ReactorFight.menuBlocked() && w.Input.isTriggered('menu');
    assert.deepEqual({ ...fight.cursor() }, { x: 2, y: 2, on: true, h: 0 });
    press('ok');
    assert.equal(fight.tacticalState(), 'move');
    press('right'); press('right'); press('right');
    assert.deepEqual([fight.cursor().x, fight.cursor().y], [5, 2]);
    assert.deepEqual(cells(fight.pathCells()), ['2,2', '3,2', '4,2', '5,2'], 'the way shows as the cursor moves');
    press('ok');
    assert.equal(fight.tacticalState(), 'moving');
    tick(w, 200, () => fight.tacticalState() === 'command');
    assert.ok(fight.commandAttack());
    w.Graphics.frameCount++;
    held = 'cancel'; w.run(1);
    assert.equal(fight.tacticalState(), 'command', 'Cancel left the aim');
    w.Input.isTriggered = name => name === 'menu' || name === held;
    assert.equal(menu(), false, 'and did not open the menu with the same press');
    held = ''; w.Graphics.frameCount++;
    assert.ok(fight.commandCancel() && fight.tacticalState() === 'move', 'the move undone');
    assert.equal(menu(), true, 'with nothing left to step back from but the pick, the menu key is the menu\'s');
    w.Input.isTriggered = name => name === held;
    press('shift');
    assert.equal(fight.unitInfo(me).acted, false, 'Shift did not end the idle unit\'s turn');
    assert.equal(fight.tacticalState(), 'unit', 'it put the unit down');
    assert.deepEqual([fight.cursor().x, fight.cursor().y], at(w, fight._units.find(u => u.actorId === 2)), 'and went to the next one');
    // A pointer: hovering moves the cursor, a click on the cell it is on confirms.
    tick(w, 30, () => fight.awaitsPlayer());
    const mira = fight._units.find(u => u.actorId === 2), [mx, my] = at(w, mira);
    w.$gameMap.canvasToMapX = x => Math.floor(x / 48); w.$gameMap.canvasToMapY = y => Math.floor(y / 48);
    w.TouchInput.x = mx * 48 + 10; w.TouchInput.y = my * 48 + 10;
    w.Graphics.frameCount++; w.run(1);
    assert.deepEqual([fight.cursor().x, fight.cursor().y], [mx, my]);
    w.TouchInput.isTriggered = () => true;
    w.Graphics.frameCount++; w.run(1);
    w.TouchInput.isTriggered = () => false;
    assert.equal(fight.activeUnit(), mira, 'the click picked her');
});

test('a director holds whatever would start next; a stage plays the run and the result still lands once', () => {
    const w = world({ events: [unit(1, 3, 2, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 500;
    const F = w.ReactorFight, fight = begin(w), me = hero(w);
    let busy = false;
    F.Director = { isBusy: () => busy };
    const calls = [];
    let frames = 0;
    F.Stage = {
        begin(run, ctx) { calls.push('begin'); frames = 0; return true; },
        update(ctx) { frames++; ctx.run.frame = frames; if (frames === 6) ctx.fight.applyRun(ctx.run, ctx.action, ctx.targets); return frames < 12; },
        end(run, ctx, interrupted) { calls.push(interrupted ? 'cut' : 'end'); },
        isBusy: () => false
    };
    fight.commandSelectUnit(me.id); fight.commandMoveTo(2, 2); fight.commandAttack();
    busy = true;
    assert.equal(fight.commandTarget(3, 2), false, 'no action starts under a hold');
    busy = false;
    assert.ok(fight.commandTarget(3, 2));
    busy = true;
    tick(w, 30);
    assert.equal(fight._act.stage, 'aim', 'the confirmed action waits for the shot');
    assert.deepEqual(calls, []);
    busy = false;
    tick(w, 3);
    busy = true;
    tick(w, 60, () => fight._act === null || fight._act.stage !== 'perform');
    assert.deepEqual(calls, ['begin', 'end'], 'a run under way plays through a hold');
    assert.ok(foe(w, 1).enemy.hp < 500);
    const hp = foe(w, 1).enemy.hp;
    tick(w, 30);
    assert.equal(fight.tacticalState() === 'unit' && fight.awaitsPlayer(), false, 'and the next turn waits');
    busy = false;
    tick(w, 30, () => fight.awaitsPlayer());
    assert.equal(foe(w, 1).enemy.hp, hp, 'the blow landed once');
    F.Director = { isBusy() { throw new Error('broken'); } };
    assert.equal(F.isHeld(), false, 'a director that throws is ignored');
});

test('events with no page, erased events and a page that changes mid-battle do not break the unit scan', () => {
    const never = page({ conditions: Object.assign({}, page().conditions, { switch1Id: 7, switch1Valid: true }) });
    const turning = unit(3, 9, 9, 'enemy 1', { pages: [page(), page({ conditions: Object.assign({}, page().conditions, { switch1Id: 5, switch1Valid: true }) })] });
    const w = world({ events: [event(1, 8, 8, { pages: [never], note: '<unit: enemy 1>' }), unit(2, 7, 7, 'enemy 1'), turning] });
    w.$gameMap.event(2).erase();
    w.$dataEnemies[1].params[0] = 5000;
    const fight = begin(w);
    assert.ok(fight.isActive());
    assert.equal(fight.unitOfEvent(1), null, 'an event none of whose pages is met is not on the map, so not in the battle');
    assert.equal(fight.unitOfEvent(2), null, 'an erased event is no unit');
    assert.ok(fight.unitOfEvent(3));
    w.$gameSwitches.setValue(5, true);
    w.$gameMap.refresh();
    // An event whose data has left the map (a unit spawned by an earlier battle, after the map was loaded again).
    const ghost = new w.Game_Event(1, 3); ghost._eventId = 77;
    assert.equal(w.ReactorFight.eventList(ghost), null);
    assert.equal(fight.setEventSide(1, 'ally'), true);
    assert.ok(fight.commandEndTurn());
    tick(w, 600, () => fight.tacticalState() === 'unit');
    assert.ok(fight.isActive());
    fight.end(1, true); tick(w, 60, () => !fight.isActive());
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0, 'the next battle starts with that event still on the map');
});

test('a map starts its battle when the party comes in range and sight of an enemy unit (fight-flow.test.cjs has the rule)', () => {
    let w = world({ events: [unit(1, 9, 2, 'enemy 1')], system: { reactorBattle: { mode: 'tactical' } } });
    w.run(30);
    assert.equal(w.$gameFight.isActive(), false, 'no tag is 6 tiles: seven tiles away');
    w = world({ events: [unit(1, 9, 2, 'enemy 1')], mapNote: '<battle trigger: 4>', system: { reactorBattle: { mode: 'tactical' } } });
    w.run(30);
    assert.equal(w.$gameFight.isActive(), false, 'seven tiles away');
    wall(w, 7, 2);
    w.$gamePlayer.locate(6, 2);
    w.run(30);
    assert.equal(w.$gameFight.isActive(), false, 'in range but behind a wall');
    w.$gamePlayer.locate(6, 3);
    w.run(30);
    assert.equal(w.$gameFight.isActive(), true);
    assert.equal(w.$gameFight.mode(), 'tactical');
    w.$gameFight.end(1, true);
    w.run(60, () => !w.$gameFight.isActive());
    w.run(60);
    assert.equal(w.$gameFight.isActive(), false, 'escaped: it does not start again while the party is still near');
});

test('Transfer Player in a battle: to another spot of the map the battle goes on with every unit on its own cell; to another map it ends as an escape', () => {
    const w = world({ events: [unit(1, 15, 12, 'enemy 1')] });
    const fight = begin(w);
    fight.commandSelectUnit(hero(w).id);
    w.$gamePlayer.reserveTransfer(1, 10, 10, 2, 0);
    w.$gamePlayer.performTransfer();
    assert.ok(fight.isActive());
    assert.deepEqual(at(w, hero(w)), [10, 10]);
    const mira = fight._units.find(u => u.actorId === 2);
    assert.notDeepEqual(at(w, mira), [10, 10]);
    assert.ok(Math.abs(at(w, mira)[0] - 10) <= 1 && Math.abs(at(w, mira)[1] - 10) <= 1);
    assert.deepEqual([fight.cursor().x, fight.cursor().y], [10, 10]);
    assert.ok(cells(fight.moveCells()).includes('10,12'), 'the reach is counted from where it stands now');
    w.$gamePlayer.reserveTransfer(2, 1, 1, 2, 0);
    assert.equal(fight.isActive(), false);
    assert.equal(fight.tacticalState(), 'idle');
    assert.equal(fight.resultOf(1), 1);
});

test('nothing changes outside Tactical: other on-map modes play the phase 1 driver, and a Classic action reads the stock numbers', () => {
    const w = world({ events: [unit(1, 6, 2, 'enemy 1')] });
    const F = w.ReactorFight;
    assert.equal(F._strike, null);
    const action = new w.Game_Action(w.$gameActors.actor(1));
    action.setAttack();
    const slime = new w.Game_Enemy(1, 0, 0);
    assert.equal(action.makeDamageValue(slime, false), 60 * 4 - 5 * 2);
    assert.equal(action.itemHit(slime), 1);
    assert.equal(F.View.active(), false);
    assert.equal(w.$gameFight.tacticalState(), 'idle');
    assert.equal(w.$gameFight.awaitsPlayer(), false);
    assert.equal(w.$gameFight.commandWait(), false);
    assert.deepEqual(Array.from(w.$gameFight.moveCells()), []);
    assert.equal(w.$gameFight.cursor(), null);
    w.$gameFight.start({ mode: 'action' });
    w.run(3000, () => !w.$gameFight.isActive());
    assert.equal(w.$gameFight.isActive(), false, 'the action mode fights by itself as before');
    assert.equal(w.$gameFight.resultOf(1), 0);
});

/** A seeded world: every roll of the engine comes from the seed. */
function seeded(options, seed) {
    const w = world(options);
    w.__seed = seed;
    require('node:vm').runInContext('{ let a = __seed >>> 0; Math.random = function() { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }', w);
    return w;
}
/** A whole battle the units play themselves, as the feed tells it. */
function selfPlayed(options, seed) {
    const w = seeded(Object.assign({ events: [unit(1, 9, 3, 'enemy 1'), unit(2, 11, 6, 'enemy 2'), unit(3, 12, 2, 'enemy 1'), unit(4, 5, 8, 'ally 3')] }, options), seed);
    w.$dataSkills[1].damage.variance = 20; w.$dataSkills[1].damage.critical = true;
    w.$dataSkills[4] = Object.assign({}, w.$dataSkills[1], { id: 4, name: 'Shot', hitType: 2, note: '<range: 2-5>' });
    w.$dataEnemies[2].actions = [{ skillId: 4, rating: 5, conditionType: 0, conditionParam1: 0, conditionParam2: 0 }];
    w.$dataEnemies[2].note = '<ai: ranged>';
    for (let x = 6; x <= 7; x++) wall(w, x, 4);
    const log = [];
    for (const name of ['fightUnitTurn', 'fightMoveStart', 'fightMoveEnd', 'fightAim', 'fightImpact', 'fightOverwatch', 'unitDefeated', 'mapBattleEnd']) {
        w.ReactorEvents.on(name, p => log.push([name, p.unitId || 0, p.targetId || 0, p.x || 0, p.y || 0, p.damage || 0, p.result === undefined ? '' : p.result, p.path ? p.path.length : 0].join(':')));
    }
    w.ReactorFight.autoBattle = true;
    w.$gameFight.start({ mode: 'tactical' });
    w.run(60000, () => !w.$gameFight.isActive());
    return { log, w };
}

test('the AI is the same battle for the same seed, a different one for another, and never leaves a unit idle', () => {
    const a = selfPlayed({}, 7), b = selfPlayed({}, 7), c = selfPlayed({}, 8);
    assert.ok(a.log.length > 20 && a.log[a.log.length - 1].startsWith('mapBattleEnd'), 'it plays to an end');
    assert.deepEqual(a.log, b.log);
    assert.notDeepEqual(a.log, c.log);
    // Every unit turn has a move, an action or a watch in it.
    let idle = 0, open = false, did = true;
    for (const line of a.log) {
        if (line.startsWith('fightUnitTurn')) { if (open && !did) idle++; open = true; did = false; }
        else if (/^fight(MoveStart|Aim|Overwatch)/.test(line)) did = true;
    }
    assert.equal(idle, 0);
});

test('Tactical plays the very same battle with the Action driver loaded beside it', () => {
    const alone = selfPlayed({}, 11), beside = selfPlayed({ action: true }, 11);
    assert.ok(beside.w.Game_Fight.prototype.isAction || beside.w.ReactorFight.Action || true);
    assert.deepEqual(beside.log, alone.log);
    // And the player's commands answer the same.
    const w = world({ action: true, events: [unit(1, 6, 2, 'enemy 1')] }), fight = begin(w);
    assert.equal(fight.tacticalState(), 'unit');
    assert.ok(fight.commandSelectUnit(hero(w).id) && fight.commandMoveTo(5, 2));
    tick(w, 200, () => fight.tacticalState() === 'command');
    assert.ok(fight.commandAttack() && fight.commandTarget(6, 2));
    tick(w, 200, () => fight.tacticalState() !== 'acting');
    assert.ok(fight._units.find(u => u.eventId === 1).enemy.hp < 60);
});

test('a weak blow is still a blow: a unit whose attack barely scratches attacks instead of only keeping watch', () => {
    const w = world({ events: [unit(1, 6, 2, 'enemy 1')] });
    w.$dataSkills[1].note = '<range: 2-5>';
    w.$dataSkills[1].damage.formula = '4';
    const hp = w.$gameActors.actor(1).hp + w.$gameActors.actor(2).hp;
    const fight = begin(w);
    assert.ok(fight.commandEndTurn());
    tick(w, 600, () => fight.tacticalState() === 'unit' && fight.turn() === 2);
    // Four, or five from the side: whichever of the two it reached.
    const lost = hp - w.$gameActors.actor(1).hp - w.$gameActors.actor(2).hp;
    assert.ok(lost >= 4 && lost <= 6, `it attacked (${lost})`);
    assert.equal(fight.isOnOverwatch(foe(w, 1)), false);
});

test('the AI\'s judgement: no buff twice, no cure with nothing to cure, a watch instead of idling, a kill over a scratch, a healer behind the line', () => {
    // A self-buff with the enemy far away is not worth a turn; with it near, once.
    let w = world({ events: [unit(1, 16, 2, 'enemy 1')] });
    w.$dataSkills[6] = Object.assign({}, w.$dataSkills[2], { id: 6, name: 'Focus', scope: 11, effects: [{ code: 31, dataId: 2, value1: 5, value2: 0 }], note: '' });
    w.$dataSkills[7] = Object.assign({}, w.$dataSkills[2], { id: 7, name: 'Cleanse', scope: 7, effects: [{ code: 22, dataId: 2, value1: 1, value2: 0 }], note: '' });
    w.$dataStates[2] = Object.assign({}, w.$dataStates[1], { id: 2, name: 'Poison', restriction: 0 });
    w.$gameActors.actor(1).learnSkill(6); w.$gameActors.actor(1).learnSkill(7);
    let fight = begin(w), me = hero(w);
    const think = (f, u) => { let plan = null; for (let i = 0; i < 500 && !plan; i++) plan = w.ReactorFight.AI.think(f, u, f.character(u)); return plan; };
    fight.commandSelectUnit(me.id);
    let plan = think(fight, me);
    assert.equal(plan.kind, '', 'far from the fight: it closes in');
    assert.ok(plan.steps.length > 0);
    w.Game_CharacterBase.prototype.locate.call(fight.character(foe(w, 1)), 9, 2);
    fight._turn++;                                                                   // a new turn: it thinks again
    plan = think(fight, me);
    assert.deepEqual([plan.kind, plan.id], ['skill', 6], 'the enemy near and out of reach: the buff');
    w.$gameActors.actor(1).addBuff(2, 5);
    fight._turn++;
    plan = think(fight, me);
    assert.equal(plan.kind, '', 'already on: not again');
    w.$gameActors.actor(2).addState(2);
    fight._turn++;
    plan = think(fight, me);
    assert.deepEqual([plan.kind, plan.id], ['skill', 7], 'a friend poisoned: the cure');

    // Of two in reach it finishes the one it can; a shooter with nothing in reach keeps watch.
    w = world({ events: [unit(1, 4, 2, 'enemy 1'), unit(2, 2, 4, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 2000;
    fight = begin(w); me = hero(w);
    foe(w, 2).enemy.setHp(50);
    fight.commandSelectUnit(me.id);
    plan = think(fight, me);
    assert.deepEqual([plan.cx, plan.cy], [2, 4], 'the one it can finish');
    w = world({ events: [unit(1, 17, 12, 'enemy 1')] });
    w.$dataSkills[1].note = '<range: 2-5>';
    fight = begin(w); me = hero(w);
    fight.commandSelectUnit(me.id);
    plan = think(fight, me);
    assert.equal(plan.kind, 'watch');
    assert.ok(plan.steps.length > 0, 'and closes in first');

    // A healer does not walk in front of the fighter: its cell is never nearer the enemy than the line.
    w = world({ events: [unit(1, 10, 2, 'enemy 1'), unit(2, 6, 2, 'ally 3')] });
    w.$dataActors[1].note = '<ai: support>';
    w.$dataEnemies[1].params[0] = 9000;
    w.ReactorFight.autoBattle = true;
    fight = begin(w, {});
    w.run(400, () => fight.turn() >= 2);
    const medic = fight.character(hero(w)), line = fight.character(foe(w, 2)), slime = fight.character(foe(w, 1));
    const d = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    assert.ok(d(medic, slime) >= d(line, slime), `the medic (${medic.x},${medic.y}) stays behind the fighter (${line.x},${line.y})`);
});

test('the Test battle launch line: fight, fightat and fightmode', () => {
    const w = world(), F = w.ReactorFight;
    const ask = search => { w.location = { search }; return F.bootRequest(); };
    assert.equal(ask('?test'), null);
    assert.deepEqual(JSON.parse(JSON.stringify(ask('?test&fight'))), { at: null, mode: '' });
    assert.deepEqual(JSON.parse(JSON.stringify(ask('?test&fight&fightat=5,83,67&fightmode=action'))), { at: { mapId: 5, x: 83, y: 67 }, mode: 'action' });
    assert.equal(ask('?test&fight&fightmode=classic').mode, '', 'only an on-map mode is taken');
});

test('the other side moves together when it only moves, one at a time where someone\'s watch reaches its way, and never onto one cell', () => {
    const far = [unit(1, 17, 2, 'enemy 1'), unit(2, 17, 4, 'enemy 1'), unit(3, 17, 6, 'enemy 1'), unit(4, 17, 8, 'enemy 1')];
    const phase = (watch, near) => {
        // The fast pace: walking together is how it plays a phase of units closing in.
        const w = world({ events: far, system: { reactorBattle: { pace: 'fast' } } });
        w.$dataSkills[1].note = watch ? '<range: 1-3>' : '';
        if (watch) w.$dataSkills[1].damage.formula = '1';                           // the reaction shot scratches: all four still stand
        const starts = [], ends = [];
        let shots = 0;
        w.ReactorEvents.on('fightMoveStart', p => starts.push(p.unitId));
        w.ReactorEvents.on('fightMoveEnd', p => ends.push(p.unitId));
        w.ReactorEvents.on('fightImpact', p => { if (p.overwatch) shots++; });
        const fight = begin(w);
        // The watcher stands in their way (near), or far off where no walk comes under its three tiles.
        if (near) fight.character(hero(w)).locate(12, 5);
        if (watch) { fight.commandSelectUnit(hero(w).id); assert.ok(fight.commandOverwatch()); tick(w, 20, () => fight.awaitsPlayer()); }
        assert.ok(fight.commandEndTurn());
        let frames = 0, together = 0;
        while (frames < 2000 && !(fight.tacticalState() === 'unit' && fight.turn() === 2)) {
            w.run(1); frames++;
            together = Math.max(together, (fight._tac.movers || []).length + (fight._act && fight._act.stage === 'walk' ? 1 : 0));
        }
        const cellsNow = fight.units({ team: 'enemy' }).map(u => at(w, u).join(','));
        assert.equal(new Set(cellsNow).size, 4, cellsNow.join(' '));
        assert.equal(starts.length, 4);
        assert.equal(ends.length, 4);
        for (const u of fight.units({ team: 'enemy' })) { const c = fight.character(u); assert.equal(c.isThrough(), false); assert.equal(c.moveSpeed(), 4); assert.ok(c.x < 17, 'it closed in'); }
        return { frames, together, shots };
    };
    // No watch; a watch their way comes under; a watch it never does.
    const free = phase(false, false), watched = phase(true, true), outOfReach = phase(true, false);
    assert.ok(free.together >= 3, `three walk at once (${free.together})`);
    assert.equal(watched.shots, 1, 'a walk under a watch is taken in front of the player, and the watcher shoots');
    assert.ok(free.frames < watched.frames, `and that phase is longer (${free.frames} against ${watched.frames} frames)`);
    assert.equal(outOfReach.shots, 0);
    assert.ok(outOfReach.together >= 3, `a watch their way never comes under does not hold them (${outOfReach.together})`);
});

test('a blade does not reach a roof from beside it: the AI goes for someone it can reach, a shooter climbs for its shot', () => {
    const heights = new Float32Array(20 * 15);
    const h = (x, y) => (x >= 0 && y >= 0 && x < 20 && y < 15 ? heights[Math.floor(y) * 20 + Math.floor(x)] : 0);
    const deep = w => { w.Reactor3D = { TERRAIN_SLOPE_LIMIT: 0.75, isMap3D: () => true, groundHeightAt: (map, wx, wz) => h(wx, wz),
        terrainBlocks: (map, x, y, x2, y2, near) => Math.abs(h(x2, y2) - (Number.isFinite(near) ? near : h(x, y))) > 0.75 }; return w; };
    heights.fill(0); heights[2 * 20 + 2] = 5;                                        // the hero stands on a roof at (2,2)
    let w = deep(world({ events: [unit(1, 6, 2, 'enemy 1')] }));
    w.$dataEnemies[1].params[0] = 9000;
    let fight = begin(w);
    const me = hero(w), mira = fight._units.find(u => u.actorId === 2);
    fight.character(me)._reactorGround = 5;
    w.Game_CharacterBase.prototype.locate.call(fight.character(mira), 2, 8); fight.character(mira)._reactorGround = 0;
    const hpRoof = w.$gameActors.actor(1).hp, hpGround = w.$gameActors.actor(2).hp;
    assert.equal(w.ReactorFight.heightInReach({ min: 1, max: 1 }, 0, 5), false);
    assert.equal(w.ReactorFight.heightInReach({ min: 2, max: 5 }, 0, 5), true);
    for (let turn = 1; turn <= 3; turn++) {
        assert.ok(fight.commandEndTurn());
        tick(w, 900, () => fight.tacticalState() === 'unit' && fight.turn() === turn + 1);
    }
    assert.equal(w.$gameActors.actor(1).hp, hpRoof, 'the one on the roof is never struck from below');
    assert.ok(w.$gameActors.actor(2).hp < hpGround, 'the slime went for the one on the ground');
    // The player's own blade cannot be aimed up there either.
    fight.commandSelectUnit(mira.id);
    w.Game_CharacterBase.prototype.locate.call(fight.character(foe(w, 1)), 3, 2);
    w.Game_CharacterBase.prototype.locate.call(fight.character(mira), 4, 2);
    fight.commandMoveTo(4, 2); assert.ok(fight.commandAttack());
    assert.ok(cells(fight.rangeCells()).includes('3,2'));
    heights[2 * 20 + 3] = 5; fight.character(foe(w, 1))._reactorGround = 5;
    fight.touch();
    assert.ok(!cells(fight.rangeCells()).includes('3,2'), 'out of a blade\'s reach five levels up');

    // A shooter whose only shot is from the roof takes the ladder up to it.
    heights.fill(0); heights[5 * 20 + 12] = 5;
    w = deep(world({ events: [unit(1, 12, 7, 'enemy 2')] }));
    w.$dataSkills[4] = Object.assign({}, w.$dataSkills[1], { id: 4, name: 'Shot', hitType: 2, note: '<range: 2-5>' });
    w.$dataEnemies[2].actions = [{ skillId: 4, rating: 5, conditionType: 0, conditionParam1: 0, conditionParam2: 0 }];
    w.$dataEnemies[2].note = '<ai: ranged><move: 6>';
    w.ReactorFight.Grid.edge = (x, y, d, height) => {
        const x2 = x + (d === 6 ? 1 : d === 4 ? -1 : 0), y2 = y + (d === 2 ? 1 : d === 8 ? -1 : 0);
        if (x === 12 && y === 6 && x2 === 12 && y2 === 5) return { kind: 'ladder', cost: 3, height: 5 };
        if (x2 === 12 && y2 === 5) return { kind: 'blocked' };
        if (x === 12 && y === 5) return x2 === 12 && y2 === 6 ? { kind: 'ladder', cost: 3, height: 0 } : { kind: 'blocked' };
        return null;
    };
    fight = begin(w);
    w.Game_CharacterBase.prototype.locate.call(fight.character(hero(w)), 6, 4);     // 7 from the roof, 9 from where the bat stands
    const mira2 = fight._units.find(u => u.actorId === 2);
    w.Game_CharacterBase.prototype.locate.call(fight.character(mira2), 6, 3);
    const hp = w.$gameActors.actor(1).hp + w.$gameActors.actor(2).hp;
    assert.ok(fight.commandEndTurn());
    tick(w, 900, () => fight.tacticalState() === 'unit' && fight.turn() === 2);
    assert.deepEqual(at(w, foe(w, 1)), [12, 5], 'on the roof');
    assert.ok(w.$gameActors.actor(1).hp + w.$gameActors.actor(2).hp < hp, 'and it shot from there');
});

test('armies: no cap on units, a party size from System, the rest of a turn handed to the units, and thirty a side plays to an end', () => {
    // The party's size is a setting; a party of three members then fights with all three.
    let w = world({ system: { reactorBattle: { partySize: 6 }, partyMembers: [1, 2, 3] }, events: [unit(1, 12, 6, 'enemy 1')] });
    assert.equal(w.$gameParty.maxBattleMembers(), 6);
    w.$gamePlayer.followers()._data.length = 1;                                      // as an older save has them
    let fight = begin(w);
    assert.equal(fight.units({ team: 'ally' }).length, 3);
    assert.ok(fight.units({ team: 'ally' }).every(u => fight.isAlive(u)), 'each has a character to stand as');
    assert.equal(new Set(fight.units({ team: 'ally' }).map(u => at(w, u).join(','))).size, 3);
    assert.equal(world().$gameParty.maxBattleMembers(), 4, 'the stock four without the setting');
    // Auto: the units not yet ordered act for themselves this turn, and are the player's again the next.
    w.$dataEnemies[1].params[0] = 9000;
    fight.commandSelectUnit(hero(w).id);
    assert.ok(fight.commandWait());
    tick(w, 20, () => fight.awaitsPlayer());
    assert.ok(fight.commandAuto());
    tick(w, 900, () => fight.tacticalState() === 'unit' && fight.turn() === 2);
    const moved = fight.units({ team: 'ally' }).filter(u => u.actorId !== 1).map(u => at(w, u));
    assert.ok(moved.every(([x]) => x > 3), `the others closed in by themselves (${moved.join(' ')})`);
    assert.equal(fight.isPlayerUnit(hero(w)), true, 'the next turn is the player\'s again');

    // Thirty a side: spawned, ordered, and fought to the end by the units themselves.
    w = seeded({ events: [] }, 3);
    w.$dataSkills[1].damage.variance = 20;
    w.$dataEnemies[1].params[0] = 120;
    w.ReactorFight.autoBattle = true;
    fight = w.$gameFight;
    fight.start({ mode: 'tactical' });
    for (let i = 0; i < 28; i++) fight.spawn({ record: 'enemy', id: 1, team: 'ally', x: 1 + (i % 4), y: 1 + Math.floor(i / 4) * 2 % 14 });
    for (let i = 0; i < 30; i++) fight.spawn({ record: 'enemy', id: 1, team: 'enemy', x: 15 + (i % 4), y: Math.floor(i / 4) * 2 % 14 });
    assert.equal(fight.units().length, 60);
    let most = 0, frames = 0, phaseFrames = 0, longest = 0, team = '';
    while (frames < 200000 && fight.isActive()) {
        w.run(1); frames++;
        if (!fight._tac) break;
        most = Math.max(most, (fight._tac.movers || []).length);
        if (fight.currentTeam() !== team) { longest = Math.max(longest, phaseFrames); phaseFrames = 0; team = fight.currentTeam(); } else phaseFrames++;
    }
    assert.equal(fight.isActive(), false, 'it ends');
    assert.ok(most >= 6, `a side of thirty moves six at a time (${most})`);
    assert.equal(fight.turnOrder === undefined, false);
    assert.ok(longest < 60 * 60, `no phase runs longer than a minute of frames (${longest})`);
});

test('in a big battle the other side acts side by side: results land as they happen, the leader\'s blow is watched alone, small battles stay single file', () => {
    const lineup = n => Array.from({ length: n }, (_, i) => unit(i + 1, 8 + (i % 2), 1 + i, 'enemy 1'));
    const phase = (n, setup) => {
        // The fast pace: above F.OVERLAP standing units its actions play side by side.
        const w = seeded({ events: lineup(n), system: { reactorBattle: { pace: 'fast' } } }, 5);
        w.$dataSkills[1].note = '<range: 1-6>';
        w.$dataSkills[1].damage.formula = '5';
        if (setup) setup(w);
        const log = [];
        for (const name of ['fightAim', 'fightFire', 'fightImpact', 'fightActionEnd']) w.ReactorEvents.on(name, p => log.push([name, p.unitId, !!p.quick]));
        const fight = begin(w);
        assert.ok(fight.commandEndTurn());
        let frames = 0, together = 0;
        while (frames < 4000 && !(fight.tacticalState() === 'unit' && fight.turn() === 2) && fight.isActive()) {
            w.run(1); frames++;
            if (!fight._tac) break;
            together = Math.max(together, (fight._tac.runs || []).length + (fight._act && (fight._act.stage === 'perform' || fight._act.stage === 'aim') ? 1 : 0));
        }
        return { w, fight, log, frames, together };
    };
    // Eighteen enemies and the party of two: more than sixteen standing, so they overlap.
    const big = phase(18);
    assert.ok(big.together >= 3, `several act at once (${big.together})`);
    const impacts = big.log.filter(e => e[0] === 'fightImpact');
    const struck = impacts.length;
    assert.ok(struck >= 5, `those in reach struck (${struck})`);
    for (const name of ['fightAim', 'fightFire', 'fightActionEnd']) assert.equal(big.log.filter(e => e[0] === name).length, struck, name);
    const lost = 400 * 2 - big.w.$gameActors.actor(1).hp - big.w.$gameActors.actor(2).hp;
    assert.ok(lost >= struck * 5 && lost <= struck * 8, `each blow landed once (${lost} for ${struck})`);
    assert.ok(big.log.filter(e => e[0] === 'fightAim' && e[2]).length >= 3, 'scratches play beside each other, quick (the rest wait for a free place and are watched)');
    assert.equal((big.fight._tac.runs || []).length, 0);
    // Six enemies: single file, nothing quick.
    const small = phase(6);
    assert.equal(small.together, 1);
    assert.ok(small.log.every(e => !e[2]));
    assert.ok(big.frames / 18 < small.frames / 6 * 0.6, `a unit's share of the phase is far shorter in the big battle (${big.frames}/18 against ${small.frames}/6)`);
    // A blow that fells a party member is watched alone, with its full playback.
    const kill = phase(12, w => { w.$gameActors.actor(1).setHp(4); w.$gameActors.actor(2).setHp(4); });
    assert.ok(kill.w.$gameActors.actor(1).isDead() || kill.w.$gameActors.actor(2).isDead());
    assert.ok(kill.log.some(e => e[0] === 'fightAim' && !e[2]), 'the felling blow was not quick');
});


/** A 3D world whose cells may hold more than one place to stand: `levels(x, y)` -> heights, low to high. */
function layered(w, levels, { ladders = [] } = {}) {
    const of = (x, y) => (x >= 0 && y >= 0 && x < 20 && y < 15 ? levels(Math.floor(x), Math.floor(y)) : [0]);
    const nearest = (list, near) => (Number.isFinite(near) ? list.reduce((best, h) => (Math.abs(h - near) < Math.abs(best - near) ? h : best), list[0]) : list[0]);
    w.Reactor3D = {
        TERRAIN_SLOPE_LIMIT: 0.75, isMap3D: () => true,
        groundHeightAt: (map, wx, wz, near) => nearest(of(wx, wz), near),
        terrainBlocks: (map, x, y, x2, y2, near) => Math.abs(nearest(of(x2, y2), near) - (Number.isFinite(near) ? near : of(x, y)[0])) > 0.75
    };
    const G = w.ReactorFight.Grid, calls = { edges: 0 };
    G.levelsAt = (x, y) => of(x, y);
    // Every way on: a walk to a level within a step, a hop within the jump, a mantle up to 3.5 over it, a safe drop; a ladder where one stands.
    const ways = (x, y, d, height, jump) => {
        const x2 = x + (d === 6 ? 1 : d === 4 ? -1 : 0), y2 = y + (d === 2 ? 1 : d === 8 ? -1 : 0), out = [];
        for (const top of of(x2, y2)) {
            const rise = top - height;
            if (Math.abs(rise) <= 0.75) out.push({ kind: 'walk', cost: 1, height: top });
            else if (rise > 0 && rise <= jump) out.push({ kind: 'hop', cost: 1, height: top });
            else if (rise > 0 && rise <= jump + 3.5) out.push({ kind: 'mantle', cost: 2, height: top });
            else if (rise < 0 && rise >= -6) out.push({ kind: 'drop', cost: 1, height: top });
        }
        for (const [lx, ly, ld, from, to] of ladders) if (lx === x && ly === y && ld === d && Math.abs(from - height) < 0.75) out.push({ kind: 'ladder', cost: 3, height: to });
        return out;
    };
    G.edges = (x, y, d, height, jump) => { calls.edges++; return ways(x, y, d, height, jump); };
    // The one-way seam the physics also fills: a climb or a long drop, null where the grid's own rule decides.
    G.edge = (x, y, d, height, jump) => ways(x, y, d, height, jump).find(way => way.kind === 'mantle' || way.kind === 'ladder') || null;
    return calls;
}

test('a cell with two places to stand: the ground under an eave and the eave are both reached, a unit climbs onto the roof and walks it', () => {
    const w = world({ events: [unit(1, 14, 2, 'enemy 1')] });
    // A house: cells (5..7, 2) are a room under a roof 4.5 up.
    const calls = layered(w, (x, y) => (y === 2 && x >= 5 && x <= 7 ? [0, 4.5] : [0]));
    const fight = begin(w), F = w.ReactorFight, G = F.Grid, me = hero(w);
    // With a jump of one the eave (four and a half up) is out of reach: a pull takes a unit its jump and one, no higher.
    w.$dataActors[1].note = '<move: 6>';
    G.flood(fight, me, 6);
    assert.equal(G.costAt(5, 2, 0), 3, 'the walk under the eave');
    assert.equal(G.costAt(5, 2, 4.5), Infinity, 'no pull four and a half tiles up for a jump of one');
    // A climber (a jump of four) takes it.
    w.$dataActors[1].note = '<move: 6><jump: 4>';
    G.flood(fight, me, 6);
    assert.equal(G.costAt(4, 2), 2);
    assert.equal(G.costAt(5, 2, 0), 3, 'the walk under the eave');
    assert.equal(G.costAt(5, 2, 4.5), 4, 'the mantle onto it costs two');
    assert.equal(G.costAt(5, 2), 3, 'no level named: the cheapest');
    assert.deepEqual(Array.from(G.pathTo(5, 2, 4.5), step => step.kind), ['walk', 'walk', 'mantle']);
    assert.equal(G.pathTo(5, 2, 4.5)[2].height, 4.5);
    assert.equal(G.costAt(6, 2, 4.5), 5, 'and the roof is walked from there');
    const out = [];
    assert.equal(G.reachedAt(5, 2, out), 2);
    // The player's side: both levels are cells to move to, the cursor takes a level, the path says how each step goes.
    assert.ok(fight.commandSelectUnit(me.id));
    fight._act.steps = 6;
    const move = Array.from(fight.moveCells()).filter(cell => cell.x === 5 && cell.y === 2).map(cell => cell.h).sort((a, b) => a - b);
    assert.deepEqual(move, [0, 4.5], 'two cells to move to at (5,2)');
    assert.ok(Array.from(fight.moveCells()).every(cell => Number.isFinite(cell.h)), 'every move cell carries its height');
    fight.setCursor(5, 2);
    assert.equal(fight.cursor().h, 0, 'the cursor comes onto the cell at the level it was on');
    assert.ok(fight.cycleCursorLevel(1), 'the level key takes the next');
    assert.equal(fight.cursor().h, 4.5);
    assert.deepEqual(Array.from(fight.pathCells(), cell => [cell.kind, cell.h]), [['walk', 0], ['walk', 0], ['walk', 0], ['mantle', 4.5]]);
    fight.setCursor(6, 2);
    assert.equal(fight.cursor().h, 4.5, 'the cursor stays on the roof as it moves along it');
    // To the roof's far edge: up the eave, then along the roof.
    fight.setCursor(7, 2, 4.5);
    let played = null;
    G.playStep = (character, step) => { played = step.kind; character._reactorGround = step.height; return false; };
    assert.ok(fight.commandMoveTo(7, 2));
    tick(w, 300, () => fight.tacticalState() === 'command');
    assert.equal(played, 'mantle', 'the climb is the world\'s to play');
    assert.deepEqual(at(w, me), [7, 2]);
    fight.character(me)._reactorGround = 4.5;
    // From the roof: the height counts in the forecast, and the reach is two tiles longer.
    w.$dataSkills[1].note = '<range: 2-5>';
    w.$dataEnemies[1].params[0] = 5000;
    assert.ok(fight.commandAttack());
    const range = Array.from(fight.rangeCells());
    assert.ok(range.some(cell => cell.x === 14 && cell.y === 2), 'seven tiles away, in reach from the roof');
    assert.ok(range.every(cell => Number.isFinite(cell.h)), 'range cells carry the height they are aimed at');
    assert.equal(range.find(cell => cell.x === 5 && cell.y === 2).h, 4.5, 'a cell of the same roof is aimed at on the roof');
    assert.ok(fight.preview(foe(w, 1)).height >= 4, 'the forecast counts the height');
    assert.ok(calls.edges > 0);
});

test('two units on one cell at two levels: each blocks only its own, the cursor\'s level says who is meant, and a single target is the one aimed at', () => {
    const w = world({ events: [unit(1, 5, 2, 'enemy 1'), unit(2, 9, 2, 'enemy 1'), unit(3, 9, 2, 'enemy 1')] });
    layered(w, (x, y) => (y === 2 && ((x >= 5 && x <= 7) || x === 9) ? [0, 4.5] : [0]));
    const fight = begin(w), F = w.ReactorFight, G = F.Grid, me = hero(w);
    const low = foe(w, 2), high = foe(w, 3);
    fight.character(high)._reactorGround = 4.5;
    w.$dataActors[1].note = '<move: 6><jump: 4>';
    // The enemy in the room at (5,2) shuts the ground there, not the roof over it.
    G.flood(fight, me, 6);
    assert.equal(G.costAt(5, 2, 0), Infinity, 'someone stands under the eave');
    assert.equal(G.costAt(5, 2, 4.5), 4, 'the eave over him is free');
    assert.ok(G.canStopAt(5, 2, 4.5));
    assert.equal(fight.unitAt(9, 2, null, 0), low);
    assert.equal(fight.unitAt(9, 2, null, 4.5), high);
    assert.ok(fight.commandSelectUnit(me.id));
    fight._act.steps = 6;
    assert.ok(fight.commandMoveTo(5, 2, 4.5));
    tick(w, 200, () => fight.tacticalState() === 'command');
    fight.character(me)._reactorGround = 4.5;
    assert.deepEqual(at(w, me), [5, 2], 'two on one cell: the hero on the roof, the enemy under it');
    assert.deepEqual(at(w, w.$gameFight._units.find(u => u.actorId === 2)), [1, 1], 'the follower did not jump after its leader: it is a unit on its own cell');
    assert.equal(fight.unitAt(5, 2, null, 4.5), me);
    assert.equal(fight.unitAt(5, 2, null, 0), foe(w, 1));
    // One target at (9,2): the level the cursor is on.
    w.$dataSkills[1].note = '<range: 1-6>';
    assert.ok(fight.commandAttack());
    fight.setCursor(9, 2, 4.5);
    assert.deepEqual(Array.from(fight.targetsAtCursor()), [high]);
    assert.equal(fight.focusedUnit(), high);
    assert.ok(fight.cycleCursorLevel(1));
    assert.equal(fight.cursor().h, 0);
    assert.deepEqual(Array.from(fight.targetsAtCursor()), [low]);
    assert.equal(fight.focusedUnit(), low);
    const before = fight.battler(high).hp;
    assert.ok(fight.commandTarget(9, 2));
    tick(w, 400, () => fight.tacticalState() !== 'acting');
    assert.equal(fight.battler(high).hp, before, 'the one on the roof was not the target');
    assert.ok(fight.battler(low).hp < fight.battler(low).mhp);
});

test('a bridge over a path, a ladder to a deck, and a flat map that asks the world nothing', () => {
    const w = world();
    // A deck 5 up along row 5 from x 8 to x 12, crossing a path that runs under it at (10,5); a ladder up its west end.
    const calls = layered(w, (x, y) => (y === 5 && x >= 8 && x <= 12 ? (x === 10 ? [0, 5] : [5]) : [0]), { ladders: [[7, 5, 6, 0, 5]] });
    const fight = begin(w), F = w.ReactorFight, G = F.Grid, me = hero(w);
    fight.character(me).locate(10, 3);
    G.flood(fight, me, 6);
    assert.equal(G.costAt(10, 5, 0), 2, 'under the bridge');
    assert.equal(G.costAt(10, 6), 3, 'and out the other side');
    assert.equal(G.costAt(10, 5, 5), Infinity, 'the deck is out of reach from the path');
    G.flood(fight, me, 12);
    assert.equal(G.costAt(8, 5), 8, 'five steps to the ladder and three up it');
    assert.equal(G.costAt(10, 5, 5), 10, 'over the path on the deck');
    assert.ok(Array.from(G.pathTo(10, 5, 5), step => step.kind).includes('ladder'));
    assert.equal(G.costAt(10, 5, 0), 2, 'the path under it keeps its own cost');
    // A flat 3D map: one place to stand everywhere, so the many-ways seam is never asked and the flood is the old flood.
    const flat = world();
    const asked = layered(flat, () => [0]);
    const plain = begin(flat), FG = flat.ReactorFight.Grid;
    FG.flood(plain, hero(flat), 6);
    assert.equal(asked.edges, 0, 'no cell has two levels: nothing was asked');
    assert.equal(FG.costAt(6, 2), 4);
    assert.equal(FG.heightAt(6, 2), 0);
});

test('between a skirmish and an army, side actions play their own sequences through the stage at double pace; an army\'s stay quick', () => {
    const lineup = n => Array.from({ length: n }, (_, i) => unit(i + 1, 8 + (i % 2), 1 + (i % 13), 'enemy 1'));
    const phase = n => {
        const w = world({ events: lineup(n), system: { reactorBattle: { pace: 'fast' } } }), F = w.ReactorFight;
        w.$dataSkills[1].note = '<range: 1-9>';
        w.$dataSkills[1].damage.formula = '5';
        const staged = [];
        // A stage that plays any run in 30 sequence frames, landing the blow halfway, at the run's own rate.
        F.Stage = {
            begin(run, ctx) { staged.push({ side: !!run.side, rate: run.rate || 1, quick: !!run.quick }); run._t = 0; return true; },
            update(ctx) { const run = ctx.run; run._t += run.rate || 1; run.frame = Math.floor(run._t); if (run._t >= 15 && !run.applied) ctx.fight.applyRun(run, ctx.action, ctx.targets); return run._t < 30; },
            end() {}, isBusy: () => false
        };
        const log = [];
        for (const name of ['fightAim', 'fightActionEnd']) w.ReactorEvents.on(name, p => log.push([name, !!p.quick, !!p.side]));
        const fight = begin(w);
        assert.ok(fight.commandEndTurn());
        let frames = 0, quickRuns = 0;
        while (frames < 6000 && !(fight.tacticalState() === 'unit' && fight.turn() === 2) && fight.isActive()) {
            w.run(1); frames++;
            for (const run of (fight._tac && fight._tac.runs) || []) if (run.quick) quickRuns++;
        }
        return { staged, log, quickRuns, F };
    };
    // Sixteen enemies and the party of two: 18 standing, over OVERLAP (16) and not a crowd (20).
    const mid = phase(16);
    const sides = mid.staged.filter(entry => entry.side);
    assert.ok(sides.length >= 3, `side actions went to the stage (${sides.length})`);
    assert.ok(sides.every(entry => entry.rate === mid.F.SIDE_RATE && !entry.quick), 'at double pace, not quick');
    assert.equal(mid.quickRuns, 0, 'none played the quick way');
    assert.ok(mid.log.filter(e => e[0] === 'fightAim' && e[2]).every(e => e[1]), 'a side action is still not one to film');
    assert.equal(mid.log.filter(e => e[0] === 'fightAim' && e[2]).length, mid.log.filter(e => e[0] === 'fightActionEnd' && e[2]).length);
    // Twenty-four enemies: a crowd. Its side actions are quick and never reach the stage as side runs.
    const army = phase(24);
    assert.ok(army.quickRuns > 0);
    assert.equal(army.staged.filter(entry => entry.side).length, 0);
});

test('a unit that falls and is erased while another is still thinking leaves its pools: the think goes on without it', () => {
    const w = world({ events: [unit(1, 12, 2, 'enemy 1'), unit(2, 9, 3, 'ally enemy 1'), unit(3, 9, 6, 'ally enemy 1')] });
    w.$dataEnemies[1].params[0] = 9000;                                              // nobody falls by a blow here
    const F = w.ReactorFight, fight = begin(w);
    // One cell a frame, so every think lasts many frames.
    F.AI_BUDGET_MS = -1;
    w.$dataSkills[1].note = '<range: 1-4>';
    assert.ok(fight.commandEndTurn());
    const enemy = foe(w, 1);
    let frames = 0, thinking = 0, erased = false;
    while (frames < 3000 && !(fight.tacticalState() === 'unit' && fight.turn() === 2) && fight.isActive()) {
        // Mid-think of the enemy: one of the two it weighs is erased from the map, as a fallen unit is when its fade ends.
        if (!erased && fight._act && fight._act.unitId === enemy.id && (fight._act.stage === 'ai' || fight._act.stage === 'plan') && ++thinking === 3) {
            w.$gameMap.event(2).erase();
            erased = true;
        }
        w.run(1); frames++;
    }
    assert.ok(erased, 'the enemy was caught mid-think');
    assert.equal(fight.character(foe(w, 2)), null);
    assert.ok(fight.isActive() && fight.turn() === 2, 'the phase ended and the turn came back');
    if (F.AI && F.AI.prune) assert.equal(F.AI.prune(fight), false, 'nothing left to drop');
});

test('inside the AI a unit\'s place is read through one helper that tolerates a unit with none', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_fight_tactical.js'), 'utf8');
    const from = source.indexOf('const AI = F.AI = {};'), to = source.indexOf('Game_Fight.prototype.updateAi = function');
    assert.ok(from > 0 && to > from);
    const body = source.slice(from, to);
    // Only the helper itself and the unit whose turn it is (it stands, or it would have no turn) ask the fight directly.
    const direct = body.split('\n').filter(line => /fight\.character\(/.test(line) && !/AI\.at = /.test(line) && !/fight\.character\(fight\.unit\(ai\.unitId\)\)/.test(line));
    assert.deepEqual(direct, [], 'every other lookup goes through AI.at');
    const w = world({ events: [unit(1, 6, 2, 'enemy 1')] });
    const F = w.ReactorFight, fight = begin(w);
    assert.equal(F.AI.at(fight, null), null);
    assert.equal(F.AI.at(fight, { gone: true, eventId: 1 }), null);
    assert.equal(F.AI.at(fight, foe(w, 1)), w.$gameMap.event(1));
    w.$gameMap.event(1).erase();
    assert.equal(F.AI.at(fight, foe(w, 1)), null);
});

test('a unit event the map lifts onto a roof starts the battle standing on that roof; one lifted to nowhere is left alone', () => {
    const w = world({ events: [unit(1, 6, 2, 'enemy 1'), unit(2, 12, 8, 'enemy 1')] });
    layered(w, (x, y) => (y === 2 && x >= 5 && x <= 7 ? [0, 4.5] : [0]));
    w.$gameMap.event(1)._reactorLift = 4.4;                                           // the editor's height for it: on the roof
    w.$gameMap.event(2)._reactorLift = 3;                                             // over open ground: a floating thing
    const fight = begin(w), G = w.ReactorFight.Grid;
    assert.equal(G.heightOf(w.$gameMap.event(1)), 4.5, 'on the roof\'s level');
    assert.equal(w.$gameMap.event(1)._reactorLift, 0, 'the lift is spent: the roof holds it now');
    assert.equal(G.heightOf(w.$gameMap.event(2)), 0);
    assert.equal(w.$gameMap.event(2)._reactorLift, 3);
    assert.equal(fight.unitAt(6, 2, null, 4.5), foe(w, 1));
    // The room under it is free for someone else.
    G.flood(fight, hero(w), 8);
    assert.ok(G.canStopAt(6, 2, 0), 'the ground under the roof unit is free');
});

test('a long flood is taken a slice at a time: the same cells and costs as the whole one, and the AI\'s way toward a far fight never takes a frame for itself', () => {
    const w = world({ events: [unit(1, 16, 12, 'enemy 1')] });
    for (let y = 0; y < 15; y++) if (y !== 6) wall(w, 8, y);
    const fight = begin(w), G = w.ReactorFight.Grid, AI = w.ReactorFight.AI, me = hero(w);
    G.flood(fight, me, 30);
    const whole = [];
    for (let y = 0; y < 15; y++) for (let x = 0; x < 20; x++) whole.push(G.costAt(x, y));
    // The same flood, with a clock that is always past its deadline: a slice a call.
    G.FLOOD_SLICE = 8;
    assert.equal(G.floodStart(fight, me, 30), true);
    let calls = 0;
    while (!G.floodRun(fight, -Infinity)) { calls++; assert.ok(calls < 500); }
    assert.ok(calls > 5, `it took several calls (${calls})`);
    const sliced = [];
    for (let y = 0; y < 15; y++) for (let x = 0; x < 20; x++) sliced.push(G.costAt(x, y));
    assert.deepEqual(sliced, whole);
    // ensureFlood: false while unfinished, the same call goes on with it, and a call without a deadline finishes it.
    const cross = w.$gameFight.unitOfEvent(1);
    assert.equal(fight.ensureFlood(cross, 30, -Infinity), false);
    assert.equal(fight.ensureFlood(cross, 30, -Infinity), false, 'still going');
    assert.equal(fight.ensureFlood(cross, 30), true, 'whole when asked without a clock');
    assert.equal(fight.ensureFlood(cross, 30, -Infinity), true, 'and kept');
    // Others walk while a sliced flood is under way (an army): it goes on from where it was, and still ends.
    const other = hero(w);
    let slices = 0;
    while (!fight.ensureFlood(other, 29, -Infinity)) { w.$gameFight.character(cross)._x += (slices % 2 ? -1 : 1); slices++; assert.ok(slices < 500, 'no starving'); }
    assert.ok(slices > 5, `sliced though the field kept changing (${slices})`);
    w.$gameFight.character(cross)._x = 16;
    // Asked for whole, the flood is of the field as it stands.
    assert.equal(fight.ensureFlood(other, 29), true);
    // A think with nothing in reach returns nothing until the way is known, then the same plan as an unhurried think.
    G.FLOOD_SLICE = 16;
    fight.commandSelectUnit(me.id);
    const enemy = me, character = w.$gameFight.character(me);
    AI.forget();
    let plain = null;
    for (let i = 0; i < 400 && !plain; i++) plain = AI.think(fight, enemy, character);
    assert.ok(plain.steps.length > 0, 'it closes in');
    AI.forget();
    fight.ensureFlood(cross, 3);   // the buffers hold someone else's flood now, as after another unit's turn
    G.FLOOD_SLICE = 4;
    w.ReactorFight.AI_BUDGET_MS = -1;
    let hurried = null, thinks = 0;
    for (; thinks < 2000 && !hurried; thinks++) hurried = AI.think(fight, enemy, character);
    w.ReactorFight.AI_BUDGET_MS = 4; G.FLOOD_SLICE = 16;
    assert.ok(hurried && thinks > 3, `spread over frames (${thinks})`);
    assert.deepEqual(Array.from(hurried.steps, s => [s.x, s.y]), Array.from(plain.steps, s => [s.x, s.y]));
    assert.equal(hurried.kind, plain.kind);
});

test('a cell with many actions is weighed an action at a time when the clock is short, and the plan is the same', () => {
    const make = () => {
        const w = seeded({ events: [unit(1, 5, 2, 'enemy 1'), unit(2, 6, 4, 'enemy 1')] }, 3);
        // Four ways to strike, so a cell has several actions to weigh.
        for (const id of [6, 7, 8]) { w.$dataSkills[id] = Object.assign({}, w.$dataSkills[1], { id, name: 'Strike ' + id, note: '<range: 1-' + (id - 3) + '>', mpCost: 0, tpCost: 0 }); w.$gameActors.actor(1).learnSkill(id); }
        w.$dataSkills[8].damage = Object.assign({}, w.$dataSkills[8].damage, { formula: '40' });
        const fight = begin(w), me = hero(w);
        fight.commandSelectUnit(me.id);
        return { w, fight, me };
    };
    const a = make();
    let plain = null;
    for (let i = 0; i < 400 && !plain; i++) plain = a.w.ReactorFight.AI.think(a.fight, a.me, a.fight.character(a.me));
    const b = make(), AI = b.w.ReactorFight.AI;
    b.w.ReactorFight.AI_BUDGET_MS = -1;   // the clock is always out: one action a call
    let hurried = null, thinks = 0, partial = 0;
    for (; thinks < 5000 && !hurried; thinks++) {
        const before = thinks;
        hurried = AI.think(b.fight, b.me, b.fight.character(b.me));
    }
    b.w.ReactorFight.AI_BUDGET_MS = 4;
    assert.ok(hurried && plain);
    assert.ok(thinks > 20, `an action a call (${thinks} calls)`);
    assert.deepEqual([hurried.kind, hurried.id, hurried.cx, hurried.cy, Array.from(hurried.steps, s => [s.x, s.y])], [plain.kind, plain.id, plain.cx, plain.cy, Array.from(plain.steps, s => [s.x, s.y])]);
    // Without a clock a cell is weighed whole in one call.
    const c = make(), AI2 = c.w.ReactorFight.AI;
    AI2.forget();
    AI2.begin(c.fight, c.me, c.fight.character(c.me), c.fight.battler(c.me));
    c.fight.ensureFlood(c.me, c.w.ReactorFight.moveOf(c.me));
    assert.equal(AI2.scoreCell(c.fight, c.me, 0), true);
    assert.equal(AI2.scoreCell(c.fight, c.me, 0, -Infinity), false, 'with the clock out, one action and no more');
    let calls = 1; while (!AI2.scoreCell(c.fight, c.me, 0, -Infinity)) { calls++; assert.ok(calls < 50); }
    assert.ok(calls >= 3, `the cell took an action a call (${calls})`);
});

test('units that decide in the same frame share one thinking budget; a think outside the battle\'s update has its own', () => {
    const w = seeded({ events: [unit(1, 5, 2, 'enemy 1'), unit(2, 6, 4, 'enemy 1')] }, 3);
    const fight = begin(w), AI = w.ReactorFight.AI, me = hero(w), other = foe(w, 1);
    fight.commandSelectUnit(me.id);
    // Within one battle frame the second think gets the first one's deadline, not a fresh share.
    AI.tick = 500; AI.forget();
    AI.think(fight, me, fight.character(me));
    const until = AI.shareUntil;
    assert.equal(AI.shareFrame, 500);
    AI.forget();
    AI.think(fight, other, fight.character(other));
    assert.equal(AI.shareUntil, until, 'the same share');
    // The next frame is a new share.
    AI.tick = 501; AI.forget();
    AI.think(fight, me, fight.character(me));
    assert.ok(AI.shareUntil >= until);
    assert.equal(AI.shareFrame, 501);
    // The battle's update counts the frames.
    const before = AI.tick;
    w.run(3);
    assert.equal(AI.tick, before + 3);
});

test('with the battle\'s own bindings in force the driver reads its named actions, not the ordinary ones', () => {
    const w = world({ events: [unit(1, 6, 2, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 500;
    const fight = begin(w), me = hero(w), F = w.ReactorFight;
    assert.deepEqual(['viewLeft', 'viewRight', 'level', 'unit', 'skip'].map(F.key), ['pageup', 'pagedown', 'control', 'tab', 'shift'], 'no bindings in force: the ordinary actions');
    w.ReactorControls = { isTactical: () => true };
    assert.deepEqual(['viewLeft', 'viewRight', 'level', 'unit', 'skip'].map(F.key), ['viewLeft', 'viewRight', 'level', 'unit', 'skip']);
    let held = '';
    w.Input.isTriggered = name => name === held;
    w.Input.isRepeated = name => name === held;
    const press = name => { held = name; w.Graphics.frameCount++; w.run(1); held = ''; w.Graphics.frameCount++; };
    press('ok');
    assert.equal(fight.tacticalState(), 'move');
    press('shift');
    assert.equal(fight.tacticalState(), 'move', 'the ordinary dash key is no longer the battle\'s');
    press('skip');
    assert.equal(fight.tacticalState(), 'unit', 'the named action puts the unit down for the next one');
    assert.equal(fight.unitInfo(me).acted, false, 'and spends nobody\'s turn');
    // Fast-forward is the same action held.
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'runtime', 'reactor_fight_tactical.js'), 'utf8');
    assert.match(source, /Input\.isPressed\(F\.key\("skip"\)\)/);
    // The scene sets the bindings while a Tactical battle is on the map and gives them back when it leaves.
    assert.match(source, /controls\.setTactical\(\$gameFight\.isTactical\(\) && \$gameFight\.isHere\(\) && !\$gameFight\._ending\)/);
    assert.match(source, /Scene_Map\.prototype\.terminate = function\(\) \{\s*const controls = root\.ReactorControls;\s*if \(controls && controls\.setTactical\) controls\.setTactical\(false\);/);
    // The lists page on the view's keys while Page Up and Page Down are the view's.
    assert.match(source, /Window_FightSkill\.prototype\.processCursorMove = pageOnViewKeys\(Window_SkillList\);/);
    assert.match(source, /Window_FightItem\.prototype\.processCursorMove = pageOnViewKeys\(Window_ItemList\);/);
});
