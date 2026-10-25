'use strict';
// What the 2026-10-10 audit found in the framework battles on the map share (runtime/reactor_fight.js): what
// one battle leaves for the next, a battle kept on a map the party left, and a party that changes in a battle.
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { fightWorld, event } = require('./helpers/fight-world.cjs');

const foe = (id, x, y) => event(id, x, y, { note: '<unit: enemy 1>' });
const copy = value => JSON.parse(JSON.stringify(value));

/** A wall on a cell: a tile nobody can walk onto. */
function wall(w, x, y) {
    w.$dataTilesets[1].flags[1537] = 15;
    w.$dataMap.data[y * w.$dataMap.width + x] = 1537;
}

/** The party walks to another map and back, as a transfer does it: each map's file is read anew. */
function leave(w, pristine) {
    const other = copy(pristine);
    other.events = [null];
    w.$dataMap = other;
    w.$gamePlayer.reserveTransfer(2, 3, 3, 2, 0);
    w.$gamePlayer.performTransfer();
}
function comeBack(w, pristine, x = 2, y = 2) {
    w.$dataMap = copy(pristine);
    w.$gamePlayer.reserveTransfer(1, x, y, 2, 0);
    w.$gamePlayer.performTransfer();
}

//-----------------------------------------------------------------------------
// What one battle leaves for the next.

test('a battle nobody could act in counts its idle rounds from none: the last battle\'s are not carried', () => {
    // One fighter, and an enemy walled in: neither reaches the other.
    const w = fightWorld({ system: { partyMembers: [1] }, events: [foe(1, 10, 8)], mapNote: '<battle trigger: 0>' });
    const F = w.ReactorFight, fight = w.$gameFight;
    for (const [x, y] of [[9, 7], [10, 7], [11, 7], [9, 8], [11, 8], [9, 9], [10, 9], [11, 9]]) wall(w, x, y);
    w.$gamePlayer.locate(8, 8);
    fight.start({ mode: 'tactical', canEscape: true });
    w.run(4000, () => fight._idleRounds >= 8);
    assert.equal(fight._idleRounds, 8, 'the first battle stands still');
    fight.end(F.ESCAPE, true);
    w.run(10, () => !fight.isActive());
    assert.equal(fight.isActive(), false);
    const at = [w.$gamePlayer.x, w.$gamePlayer.y];
    // The next battle, the same standstill: it is given its own twenty rounds.
    const serial = fight.start({ mode: 'tactical', canEscape: true });
    let turns = 0;
    const warn = console.warn;
    console.warn = () => {};
    try {
        w.run(8000, () => { if (fight.isActive()) turns = fight.turn(); return !fight.isActive(); });
    } finally {
        console.warn = warn;
    }
    assert.deepEqual([w.$gamePlayer.x, w.$gamePlayer.y], at, 'nobody moved in it');
    assert.equal(fight.resultOf(serial), F.ESCAPE);
    assert.equal(turns, F.IDLE_ROUNDS, 'it ended after its own idle rounds');
});

//-----------------------------------------------------------------------------
// A battle kept on a map the party left.

test('the party falling on another map is Game Over there, whatever battle is kept elsewhere', () => {
    const scenes = `Scene_Map = function Scene_Map() {};
        Scene_Map.prototype.onMapLoaded = function() {};
        Scene_Map.prototype.start = function() {};
        Scene_Map.prototype.update = function() {};
        Scene_Map.prototype.isMenuEnabled = function() { return true; };
        Scene_Map.prototype.checkGameover = function() { if ($gameParty.isAllDead()) SceneManager.goto(Scene_Gameover); };`;
    const w = fightWorld({ events: [foe(1, 8, 8)], mapNote: '<battle trigger: 0>', prepare: ctx => vm.runInContext(scenes, ctx) });
    const pristine = copy(w.$dataMap);
    w.$dataEnemies[1].params[0] = 9000;
    w.$gameFight.start({ mode: 'tactical', onTransfer: 'keep' });
    w.run(3);
    const scene = new w.Scene_Map();
    // In the battle the fall is the battle's to judge.
    for (const actor of w.$gameParty.members()) actor.addState(1);
    scene.checkGameover();
    assert.deepEqual(Array.from(w.pushed), [], 'the battle judges a fall on its own map');
    for (const actor of w.$gameParty.members()) actor.revive();
    leave(w, pristine);
    assert.equal(w.$gameFight.isActive() && !w.$gameFight.isHere(), true, 'the battle is kept on its map');
    // Poison, a trap, an event: the party falls on the map it walked to.
    for (const actor of w.$gameParty.members()) actor.addState(1);
    scene.checkGameover();
    assert.deepEqual(Array.from(w.pushed), ['goto:Scene_Gameover'], 'the map judges a fall away from the battle');
});

test('a battle kept for the party\'s return still has the enemies its troop brought', () => {
    const w = fightWorld({ mapNote: '<battle trigger: 0>' });
    const pristine = copy(w.$dataMap), fight = w.$gameFight, F = w.ReactorFight;
    w.$dataEnemies[1].params[0] = 9000;
    const serial = fight.start({ mode: 'tactical', troopId: 1, onTransfer: 'keep', canEscape: true });
    w.run(3);
    const spawned = fight.units({ team: 'enemy', alive: true }).map(unit => unit.eventId);
    assert.equal(spawned.length, 2, 'the troop\'s two members stand on the map');
    leave(w, pristine);
    w.run(5);
    assert.equal(fight.isActive(), true);
    comeBack(w, pristine);
    assert.equal(fight.isHere(), true);
    assert.deepEqual(fight.units({ team: 'enemy', alive: true }).map(unit => unit.eventId), spawned, 'they are still in it');
    for (const id of spawned) {
        const unit = w.$gameMap.event(id);
        assert.ok(unit && !unit._erased && unit.event(), 'and on the map, with their data');
    }
    w.run(120);
    assert.equal(fight.isActive(), true, 'the battle is not won by walking out and in');
    assert.equal(fight.resultOf(serial), -1);
    // The battle over, they leave with the map as before.
    fight.end(F.ESCAPE, true);
    w.run(10, () => !fight.isActive());
    leave(w, pristine);
    comeBack(w, pristine);
    for (const id of spawned) assert.equal(w.$gameMap.event(id), undefined, 'nobody is kept for a battle that ended');
});

test('whoever fell in a battle is still off its map when the map is read again: on the party\'s return, and on a load that reads it anew', () => {
    const world = () => {
        const w = fightWorld({ events: [foe(1, 8, 8), foe(2, 10, 8), foe(3, 12, 8)], mapNote: '<battle trigger: 0>' });
        const pristine = copy(w.$dataMap), fight = w.$gameFight;
        w.$dataEnemies[1].params[0] = 9000;
        fight.start({ mode: 'tactical', onTransfer: 'keep' });
        w.run(3);
        // One falls, one is taken out of the battle and off the map, one out of the battle only.
        const fallen = fight.unitOfEvent(1);
        fight.battler(fallen).addState(1);
        fight.defeat(fallen);
        fight.removeUnit(fight.unitOfEvent(2), false);
        fight._wait = 1e6;
        w.run(w.ReactorFight.FALL_REST + w.ReactorFight.DEFEAT_FADE + 4);
        assert.deepEqual([1, 2, 3].map(id => w.$gameMap.event(id)._erased), [true, true, false]);
        return { w, pristine, fight };
    };
    const away = world();
    leave(away.w, away.pristine);
    comeBack(away.w, away.pristine);
    assert.deepEqual([1, 2, 3].map(id => away.w.$gameMap.event(id)._erased), [true, true, false], 'the fallen do not stand again on the return');
    // A save in the battle, loaded after the game was changed: the map the party is on is read again.
    const loaded = world();
    loaded.w.$dataMap = copy(loaded.pristine);
    loaded.w.$gamePlayer.reserveTransfer(1, 2, 2, 2, 0);
    loaded.w.$gamePlayer.requestMapReload();
    loaded.w.$gamePlayer.performTransfer();
    assert.deepEqual([1, 2, 3].map(id => loaded.w.$gameMap.event(id)._erased), [true, true, false], 'nor on a map read again under the battle');
    // With no battle on, a map read again has all its events, as it always did.
    const over = world();
    over.fight.end(over.w.ReactorFight.ESCAPE, true);
    over.fight._wait = 0;
    over.w.run(10, () => !over.fight.isActive());
    leave(over.w, over.pristine);
    comeBack(over.w, over.pristine);
    assert.deepEqual([1, 2, 3].map(id => over.w.$gameMap.event(id)._erased), [false, false, false]);
});

test('away from a battle that is kept the followers trail the leader as on any map, and are units again on the return', () => {
    const w = fightWorld({ system: { partyMembers: [1, 2, 3] }, events: [foe(1, 8, 8)], mapNote: '<battle trigger: 0>' });
    const pristine = copy(w.$dataMap), fight = w.$gameFight, followers = w.$gamePlayer.followers();
    w.$dataEnemies[1].params[0] = 9000;
    followers.hide();
    fight.start({ mode: 'tactical', onTransfer: 'keep' });
    fight._wait = 1e6;
    w.run(3);
    const through = () => Array.from(followers.visibleFollowers(), follower => follower.isThrough());
    assert.deepEqual([followers.isVisible(), through()], [true, [false, false]], 'in the battle each is a body of its own');
    leave(w, pristine);
    assert.equal(fight.isActive() && !fight.isHere(), true);
    assert.equal(followers.isVisible(), false, 'followers the game had hidden are hidden again on the next map');
    followers.show();
    assert.deepEqual(through(), [true, true], 'and nobody is left solid: a follower walks through what the leader passed');
    followers.hide();
    comeBack(w, pristine);
    assert.deepEqual([followers.isVisible(), through()], [true, [false, false]], 'back in the battle they are its units again');
    // The battle ends: the followers are as the game had them before it.
    fight._wait = 0;
    fight.end(w.ReactorFight.ESCAPE, true);
    w.run(10, () => !fight.isActive());
    assert.equal(followers.isVisible(), false);
});

test('a battle kept on a map the party left gives way to a battle on the map it is on: Start Battle on Map, an encounter, the battle screen', () => {
    // The party walks out of a battle kept on map 1, onto map 2 where an enemy stands.
    const away = () => {
        const w = fightWorld({ events: [foe(1, 8, 8)], mapNote: '<battle trigger: 0>' });
        const pristine = copy(w.$dataMap), fight = w.$gameFight;
        w.$dataEnemies[1].params[0] = 9000;
        const kept = fight.start({ mode: 'tactical', onTransfer: 'keep', canEscape: true });
        w.run(3);
        const other = copy(pristine);
        other.events = [null, null, null, null, null, foe(5, 6, 6)];
        other.encounterList = [{ troopId: 2, weight: 10, regionSet: [] }];
        w.$dataMap = other;
        w.$gamePlayer.reserveTransfer(2, 3, 3, 2, 0);
        w.$gamePlayer.performTransfer();
        assert.equal(fight.isActive() && !fight.isHere(), true, 'the battle is kept on map 1');
        return { w, fight, kept, F: w.ReactorFight };
    };
    // Start Battle on Map: the battle here starts, and the kept one ends as an escape.
    const command = away();
    command.w.PluginManager.callCommand(new command.w.Game_Interpreter(), 'RPGReactor', 'StartMapBattle', { mode: 'tactical', who: 'map', canEscape: 'true' });
    assert.equal(command.fight.isHere(), true, 'a battle runs on map 2');
    assert.ok(command.fight.unitOfEvent(5), 'against map 2\'s enemy');
    assert.equal(command.fight.resultOf(command.kept), command.F.ESCAPE, 'the kept battle ended as an escape');
    // A random encounter on map 2 whose troop fights on the map.
    const encounter = away();
    assert.equal(encounter.w.$gamePlayer.canEncounter(), true, 'encounters are on away from the kept battle');
    encounter.w.$gamePlayer._encounterCount = 0;
    encounter.w.$gamePlayer.executeEncounter();
    assert.equal(encounter.fight.isHere(), true);
    assert.equal(encounter.fight.units({ team: 'enemy' }).filter(unit => unit.enemy.enemyId() === 2).length, 1, 'the troop\'s Bat is in it');
    assert.equal(encounter.fight.resultOf(encounter.kept), encounter.F.ESCAPE);
    // Battle Processing on the battle screen: the troop is the screen's, nothing of the kept battle is left in it.
    const screen = away();
    screen.w.$dataTroops[2].reactorBattle = { mode: 'classic' };
    const interpreter = new screen.w.Game_Interpreter();
    interpreter.command301([0, 2, true, false]);
    assert.deepEqual(Array.from(screen.w.pushed), ['Scene_Battle']);
    assert.equal(screen.fight.isActive(), false);
    assert.equal(screen.fight.resultOf(screen.kept), screen.F.ESCAPE);
    assert.deepEqual(Array.from(screen.w.$gameTroop.members(), enemy => enemy.enemyId()), [2], 'the battle screen fights its own troop');
});

//-----------------------------------------------------------------------------
// A party that changes in a battle.

test('a member who left the party in a battle does not keep it from being lost when the rest fall', () => {
    const w = fightWorld({ system: { partyMembers: [1, 2] }, events: [foe(1, 8, 8)], mapNote: '<battle trigger: 0>' });
    const F = w.ReactorFight, fight = w.$gameFight;
    w.$dataEnemies[1].params[0] = 9000;
    const serial = fight.start({ mode: 'tactical', canLose: true });
    w.run(3);
    // An event takes Mira out of the party (Change Party Member); then Ren falls.
    w.$gameParty.removeActor(2);
    const ren = fight._units.find(unit => unit.actorId === 1);
    w.$gameActors.actor(1).addState(1);
    fight.defeat(ren);
    fight.checkOutcome();
    assert.ok(fight._ending && fight._ending.result === F.LOSE, 'the party in the battle has fallen: it is lost at once');
    w.run(60, () => !fight.isActive());
    assert.equal(fight.resultOf(serial), F.LOSE, 'and the event\'s If Lose is taken, not an escape after twenty idle rounds');
    // A party nobody is left of loses nothing: the game's own rule for an empty party stands.
    const empty = fightWorld({ system: { partyMembers: [1] }, events: [foe(1, 8, 8)], mapNote: '<battle trigger: 0>' });
    empty.$dataEnemies[1].params[0] = 9000;
    empty.$gameFight.start({ mode: 'tactical', canLose: true });
    empty.run(3);
    empty.$gameParty.removeActor(1);
    empty.$gameFight.checkOutcome();
    assert.equal(empty.$gameFight._ending, null);
});

test('a member who joins the party in a battle (Change Party Member) is a unit of it, on a cell of their own', () => {
    for (const mode of ['tactical', 'action']) {
        const w = fightWorld({ system: { partyMembers: [1, 2] }, events: [foe(1, 12, 8)], mapNote: '<battle trigger: 0>', tactical: mode === 'tactical', action: mode === 'action' });
        const fight = w.$gameFight;
        w.$dataEnemies[1].params[0] = 9000;
        fight.start({ mode });
        fight._wait = 1e6;
        w.run(3);
        w.$gameParty.addActor(3);
        const unit = fight._units.find(one => one.actorId === 3);
        assert.ok(unit && unit.party && unit.team === 'ally', mode + ': Ally is a unit of the party');
        assert.equal(fight.isAlive(unit), true, mode + ': standing in the battle');
        w.run(30);
        const cells = fight.units({ team: 'ally', alive: true }).map(one => { const c = fight.character(one); return c.x + ',' + c.y; });
        assert.equal(cells.length, 3);
        assert.equal(new Set(cells).size, 3, mode + ': each on a cell of their own');
        // Out of the party and back again: the same unit, not a second.
        w.$gameParty.removeActor(3);
        w.$gameParty.addActor(3);
        assert.equal(fight._units.filter(one => one.actorId === 3).length, 1, mode + ': one unit for Ally');
    }
});
