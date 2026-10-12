'use strict';
// Tactical battles (runtime/reactor_fight_tactical.js): what a battle leaves behind when it ends in the middle of
// something (a walk, an action played beside others), and turns that end when the player says so.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');

const unit = (id, x, y, text, extra = {}) => event(id, x, y, Object.assign({ note: `<unit: ${text}>` }, extra));
const world = (options = {}) => fightWorld(Object.assign({ tactical: true }, options));
const hero = w => w.$gameFight._units.find(u => u.actorId === 1);
const end = { code: 0, indent: 0, parameters: [] };
/** Start a tactical battle and run to the player's first decision. */
function begin(w, options = {}) {
    assert.ok(w.$gameFight.start(Object.assign({ mode: 'tactical' }, options)) > 0);
    w.run(600, () => w.$gameFight.awaitsPlayer());
    return w.$gameFight;
}

test('a battle won by the step that reaches a place leaves the walker solid and at its own pace', () => {
    // The goal is a switch; a page turns it ON when someone of the party steps onto (4,2).
    const reach = page({ rrFightHook: { on: 'unitEnters', team: 'ally', x0: 4, y0: 2, x1: 4, y1: 2 }, list: [{ code: 121, indent: 0, parameters: [6, 6, 0] }, end] });
    const w = world({ events: [unit(1, 15, 12, 'enemy 1'), event(2, 0, 14, { pages: [page(), reach] })] });
    const fight = begin(w, { objective: { type: 'switch', switchId: 6 } });
    const player = w.$gamePlayer, speed = player.moveSpeed();
    assert.equal(player.isThrough(), false);
    assert.ok(fight.commandSelectUnit(hero(w).id));
    assert.ok(fight.commandMoveTo(6, 2), 'a walk through the place and on');
    assert.equal(player.isThrough(), true, 'walking the way it was given');
    w.run(600, () => !fight.isActive());
    assert.equal(fight.isActive(), false, 'the battle was won on the way');
    assert.equal(fight.resultOf(1), 0);
    assert.equal(player.isThrough(), false, 'the leader does not walk through walls after the battle');
    assert.equal(player.moveSpeed(), speed);
});

test('a page that takes the party to another map in the middle of a walk leaves the walker solid', () => {
    const leave = page({ rrFightHook: { on: 'unitEnters', team: 'ally', x0: 4, y0: 2, x1: 4, y1: 2 }, list: [{ code: 201, indent: 0, parameters: [0, 2, 1, 1, 2, 0] }, end] });
    const w = world({ events: [unit(1, 15, 12, 'enemy 1'), event(2, 0, 14, { pages: [page(), leave] })] });
    const fight = begin(w);
    const player = w.$gamePlayer;
    assert.ok(fight.commandSelectUnit(hero(w).id));
    assert.ok(fight.commandMoveTo(6, 2));
    w.run(600, () => !fight.isActive());
    assert.equal(fight.isActive(), false, 'leaving the map ended the battle');
    assert.equal(player.isThrough(), false);
});

test('an enemy whose watched walk the battle\'s end cuts short keeps neither the walk\'s pace nor its way through things', () => {
    const w = world({ events: [unit(1, 8, 2, 'enemy 1')] });
    const fight = begin(w);
    const slime = w.$gameMap.event(1), speed = slime.moveSpeed();
    assert.equal(slime.isThrough(), false);
    fight.commandSelectUnit(hero(w).id); assert.ok(fight.commandWait());
    w.run(30, () => fight.awaitsPlayer());
    fight.commandSelectUnit(fight._units.find(u => u.actorId === 2).id); assert.ok(fight.commandWait());
    // The slime is on its way, its turn in front of the player, when an event ends the battle.
    w.run(600, () => !!fight._act && fight._act.stage === 'walk');
    assert.equal(fight._act.stage, 'walk');
    assert.equal(slime.isThrough(), true, 'the slime walks');
    fight.end(w.ReactorFight.ESCAPE, true);
    w.run(600, () => !fight.isActive());
    assert.equal(fight.isActive(), false);
    assert.equal(slime.isThrough(), false);
    assert.equal(slime.moveSpeed(), speed);
});

test('a battle that ends while actions play side by side tells the stage every one of them is over', () => {
    const lineup = Array.from({ length: 16 }, (_, i) => unit(i + 1, 8 + (i % 2), 1 + (i % 13), 'enemy 1'));
    const w = world({ events: lineup, system: { reactorBattle: { pace: 'fast' } } }), F = w.ReactorFight;
    w.$dataSkills[1].note = '<range: 1-9>';
    w.$dataSkills[1].damage.formula = '5';
    const begun = new Set(), ended = new Set();
    F.Stage = {
        begin(run) { begun.add(run); run._t = 0; return true; },
        update(ctx) { const run = ctx.run; run._t += run.rate || 1; if (run._t >= 15 && !run.applied) ctx.fight.applyRun(run, ctx.action, ctx.targets); return run._t < 30; },
        end(run) { ended.add(run); }, isBusy: () => false
    };
    const fight = begin(w);
    assert.ok(fight.commandEndTurn());
    w.run(2000, () => !!fight._tac && !!fight._tac.runs && fight._tac.runs.filter(run => run._staged).length >= 2);
    const playing = fight._tac.runs.filter(run => run._staged);
    assert.ok(playing.length >= 2, 'actions are playing side by side');
    fight.end(F.ESCAPE, true);
    w.run(600, () => !fight.isActive());
    assert.equal(fight.isActive(), false);
    for (const run of playing) assert.ok(ended.has(run), 'the stage was told');
    assert.equal(ended.size, begun.size);
});

test('End Turn ends the player\'s turn though an ally that fights by itself stands between two of the player\'s units in the order', () => {
    // The order of the allies' turn: Ren, Mira (the party), the bat that fights by itself, then Ally (an actor the player orders).
    const w = world({ events: [unit(1, 16, 12, 'enemy 1'), unit(2, 3, 6, 'ally enemy 2'), unit(3, 4, 6, 'ally 3')] });
    const fight = begin(w);
    const third = fight.unitOfEvent(3);
    assert.equal(fight.isPlayerUnit(third), true);
    assert.equal(fight.isPlayerUnit(fight.unitOfEvent(2)), false);
    assert.equal(fight.unactedCount(), 3, 'three units wait for orders');
    const teams = [];
    w.ReactorEvents.on('fightTeamTurn', payload => teams.push(payload.team));
    assert.ok(fight.commandEndTurn());
    // The bat still takes its turn; nobody of the player's is asked again before the other side has moved.
    let asked = false;
    w.run(900, () => { if (fight.awaitsPlayer() && fight.turn() === 1) asked = true; return asked || fight.turn() === 2; });
    assert.equal(asked, false, 'the turn the player ended does not come back');
    assert.equal(fight.turn(), 2);
    assert.equal(teams[0], 'enemy', 'the other side moved next');
    assert.equal(fight.unitInfo(third).acted, false, 'a new round');
});

test('a page that moves the party to another spot of the map in the middle of a walk ends the walk there', () => {
    // A teleport pad on (4,2): whoever of the party steps on it stands at (10,10) next, with walls east of it.
    const pad = page({ rrFightHook: { on: 'unitEnters', team: 'ally', x0: 4, y0: 2, x1: 4, y1: 2 }, list: [{ code: 201, indent: 0, parameters: [0, 1, 10, 10, 2, 0] }, end] });
    const w = world({ events: [unit(1, 16, 12, 'enemy 1'), event(2, 0, 14, { pages: [page(), pad] })] });
    for (const x of [11, 12]) { w.$dataTilesets[1].flags[1537 + 0x60F] = 0x60F; w.$dataMap.data[10 * 20 + x] = 1537 + 0x60F; }
    const fight = begin(w);
    const player = w.$gamePlayer;
    assert.ok(fight.commandSelectUnit(hero(w).id));
    assert.ok(fight.commandMoveTo(6, 2), 'two steps past the pad');
    // The scene carries a reserved transfer out; this world has no scene.
    w.run(600, () => { if (player.isTransferring()) player.performTransfer(); return fight.tacticalState() === 'command'; });
    assert.equal(fight.tacticalState(), 'command', 'the walk is over');
    assert.deepEqual([player.x, player.y], [10, 10], 'it stands where the page put it, not two steps on inside the wall');
    assert.equal(player.isThrough(), false);
    assert.equal(fight.canUndoMove(), false, 'and the move stands');
});

test('a unit an event kills (Change Enemy HP) falls like any other: the goal that names it is met and it leaves the field', () => {
    // The boss (event 1, the troop's first enemy) is struck down by a page as the allies' second turn starts.
    const strike = page({ rrFightHook: { on: 'turnStart', turn: 2, team: 'ally' }, list: [{ code: 331, indent: 0, parameters: [0, 1, 0, 9999, true] }, end] });
    const w = world({ events: [unit(1, 16, 12, 'enemy 1'), unit(2, 17, 12, 'enemy 2'), event(3, 0, 14, { pages: [page(), strike] })] });
    w.$dataEnemies[1].params[0] = 5000;
    const fallen = [];
    w.ReactorEvents.on('unitDefeated', payload => fallen.push(payload.eventId));
    const fight = begin(w, { objective: { type: 'defeatUnit', eventId: 1 } });
    assert.ok(fight.commandEndTurn());
    w.run(3000, () => !fight.isActive() || (fight.turn() === 2 && fight.awaitsPlayer()));
    assert.equal(fight.battler(fight._units.find(u => u.eventId === 1)).isDead(), true, 'the page struck the boss down');
    w.run(2);
    assert.deepEqual(fallen, [1], 'the battle saw it fall');
    w.run(600, () => !fight.isActive());
    assert.equal(fight.isActive(), false, 'the goal was to defeat it: the battle is won');
    assert.equal(fight.resultOf(1), 0);
    assert.equal(w.$gameMap.event(1)._erased, true, 'and it does not stay standing on the map');
});

test('a walk that drew a reaction shot cannot be undone: the shot and the spent watch stand', () => {
    const w = world({ events: [unit(1, 8, 2, 'enemy 1')] });
    w.$dataEnemies[1].note = '<ai: ranged><move: 0>';
    w.$dataEnemies[1].params[0] = 5000;
    w.$dataSkills[1].note = '<range: 2-4>';
    const fight = begin(w);
    assert.ok(fight.commandEndTurn());
    w.run(900, () => fight.tacticalState() === 'unit' && fight.turn() === 2);
    const slime = fight.unitOfEvent(1);
    assert.equal(fight.isOnOverwatch(slime), true, 'the slime keeps watch');
    const shots = [];
    w.ReactorEvents.on('fightImpact', payload => { if (payload.overwatch) shots.push(payload); });
    assert.ok(fight.commandSelectUnit(hero(w).id));
    assert.ok(fight.commandMoveTo(4, 2), 'into its reach');
    w.run(600, () => fight.tacticalState() === 'command');
    assert.equal(shots.length, 1, 'the shot was taken');
    assert.equal(fight.isOnOverwatch(slime), false);
    assert.equal(fight.canUndoMove(), false, 'the move stands');
    assert.equal(fight.commandCancel(), false);
    assert.deepEqual([w.$gamePlayer.x, w.$gamePlayer.y], [4, 2]);
});

test('a skill with no Scope (one that only calls a common event) can be used: it plays, is paid for, and its common event runs', () => {
    const w = world({ events: [unit(1, 16, 12, 'enemy 1')] });
    w.$dataSkills[3] = Object.assign({}, w.$dataSkills[2], { id: 3, name: 'Signal', scope: 0, mpCost: 4, stypeId: 1, effects: [{ code: 44, dataId: 1, value1: 0, value2: 0 }] });
    w.$dataCommonEvents[1] = { id: 1, name: 'Signal', trigger: 0, switchId: 0, list: [{ code: 121, indent: 0, parameters: [6, 6, 0] }, end] };
    w.$dataSystem.skillTypes = ['', 'Magic'];
    const actor = w.$gameActors.actor(1);
    actor.learnSkill(3);
    actor._mp = 10;
    const fight = begin(w);
    assert.ok(fight.commandSelectUnit(hero(w).id));
    assert.ok(fight.commandMoveTo(2, 2), 'stays');
    assert.ok(fight.commandSkill(3), 'aimed');
    const cursor = fight.cursor();
    assert.deepEqual([cursor.x, cursor.y], [2, 2], 'the cursor is on the user');
    assert.ok(fight.commandTarget(cursor.x, cursor.y), 'used');
    w.run(600, () => fight.awaitsPlayer() && w.$gameSwitches.value(6));
    assert.equal(actor.mp, 6, 'paid for');
    assert.equal(w.$gameSwitches.value(6), true, 'its common event ran');
    assert.equal(fight.unitInfo(hero(w)).acted, true, 'and the unit\'s turn is spent');
});

test('an enemy removed from the battle while another enemy\'s action plays leaves that action its own', () => {
    // The slime (event 1) is the troop's first enemy, the bat (event 2) its second and last.
    const w = world({ events: [unit(1, 16, 12, 'enemy 1'), unit(2, 4, 2, 'enemy 2')] });
    w.$dataEnemies[1].params[2] = 999;
    const fight = begin(w);
    const hits = [];
    w.ReactorEvents.on('fightImpact', payload => hits.push(payload));
    assert.ok(fight.commandEndTurn());
    const bat = fight.unitOfEvent(2);
    w.run(900, () => !!fight._run && fight._run.subjectId === bat.id && fight._act.stage === 'perform' && fight._run.frame >= 2);
    assert.equal(fight._run.subjectId, bat.id, 'the bat strikes');
    assert.equal(fight._run.applied, false);
    // An event takes the slime out of the battle (Remove Unit) before the blow lands.
    fight.removeUnit(fight.unitOfEvent(1));
    w.run(300, () => !fight._run);
    assert.equal(hits.length, 1, 'the blow landed');
    assert.equal(hits[0].unitId, bat.id);
    // The bat's blow is 80 before the side it lands on; the slime's would be thousands.
    assert.ok(hits[0].damage >= 80 && hits[0].damage <= 120, `with the bat's own strength (${hits[0].damage})`);
});

test('an enemy removed while another is still thinking does not break the think', () => {
    const w = world({ events: [unit(1, 16, 12, 'enemy 1'), unit(2, 7, 2, 'enemy 2')], system: { reactorBattle: { pace: 'fast' } } });
    const F = w.ReactorFight;
    // The clock is always out: a cell a frame.
    F.AI_BUDGET_MS = -1000;
    const fight = begin(w);
    assert.ok(fight.commandEndTurn());
    const bat = fight.unitOfEvent(2);
    w.run(900, () => !!fight._act && fight._act.unitId === bat.id && fight._act.stage === 'ai');
    w.run(3);
    assert.equal(fight._act.stage, 'ai', 'the bat is thinking');
    fight.removeUnit(fight.unitOfEvent(1));
    w.run(3000, () => fight.turn() === 2 || !fight.isActive());
    assert.ok(fight.turn() === 2 || !fight.isActive(), 'the turn went on');
});

test('a state that holds a unit and wears off at Action End wears off: the unit it held acts again', () => {
    const w = world({ events: [unit(1, 16, 12, 'enemy 1')] });
    w.$dataEnemies[1].note = '<move: 0>';
    // Stun: cannot move, removed at Action End after one turn.
    w.$dataStates[2] = Object.assign({}, w.$dataStates[1], { id: 2, name: 'Stun', restriction: 4, autoRemovalTiming: 1, minTurns: 1, maxTurns: 1, traits: [] });
    const fight = begin(w);
    const ren = w.$gameActors.actor(1), mira = fight._units.find(u => u.actorId === 2);
    ren.addState(2);
    assert.equal(ren.canMove(), false);
    for (let round = 1; round <= 3 && !ren.canMove(); round++) {
        w.run(600, () => fight.awaitsPlayer());
        assert.ok(fight.commandSelectUnit(mira.id) && fight.commandWait(), 'Mira waits');
        w.run(900, () => fight.turn() > round);
    }
    assert.equal(ren.isStateAffected(2), false, 'the stun wore off');
    w.run(600, () => fight.awaitsPlayer());
    assert.ok(fight.commandSelectUnit(hero(w).id), 'and Ren takes orders again');
});

test('a unit whose turn the player ends without orders still ends its turn: a buff on it runs out', () => {
    const w = world({ events: [unit(1, 16, 12, 'enemy 1')] });
    w.$dataEnemies[1].note = '<move: 0>';
    const fight = begin(w);
    const ren = w.$gameActors.actor(1);
    ren.addBuff(2, 1);
    assert.equal(ren.isBuffAffected(2), true);
    for (let round = 1; round <= 3; round++) {
        w.run(600, () => fight.awaitsPlayer());
        assert.ok(fight.commandEndTurn());
        w.run(900, () => fight.turn() > round);
    }
    assert.equal(ren.isBuffAffected(2), false, 'a one-turn buff is gone after three turns nobody was ordered in');
});

test('a party member an event strikes down falls, and stands again when an event brings them back', () => {
    const w = world({ events: [unit(1, 16, 12, 'enemy 1')] });
    w.$dataEnemies[1].note = '<move: 0>';
    const fight = begin(w);
    const mira = fight._units.find(u => u.actorId === 2), actor = w.$gameActors.actor(2), follower = fight.character(mira);
    const fallen = [];
    w.ReactorEvents.on('unitDefeated', payload => fallen.push(payload.unitId));
    actor.setHp(0); actor.refresh();
    w.run(2);
    assert.deepEqual(fallen, [mira.id], 'the battle saw her fall');
    assert.equal(follower.opacity(), 110, 'she lies dimmed');
    assert.equal(fight.pendingUnits().includes(mira), false);
    actor.setHp(50); actor.refresh();
    w.run(2);
    assert.equal(follower.opacity(), 255, 'back on her feet');
    assert.equal(fight.standing(), 3, 'and counted among those standing');
    actor.setHp(0); actor.refresh();
    w.run(2);
    assert.deepEqual(fallen, [mira.id, mira.id], 'falling again is seen again');
});

test('a party taken to another map in the middle of a walk, the battle kept for its return, walks that map solid', () => {
    const leave = page({ rrFightHook: { on: 'unitEnters', team: 'ally', x0: 4, y0: 2, x1: 4, y1: 2 }, list: [{ code: 201, indent: 0, parameters: [0, 2, 1, 1, 2, 0] }, end] });
    const w = world({ events: [unit(1, 15, 12, 'enemy 1'), event(2, 0, 14, { pages: [page(), leave] })] });
    const fight = begin(w, { onTransfer: 'keep' });
    const player = w.$gamePlayer, speed = player.moveSpeed();
    assert.ok(fight.commandSelectUnit(hero(w).id));
    assert.ok(fight.commandMoveTo(6, 2));
    w.run(600, () => { if (player.isTransferring()) { player.performTransfer(); return true; } return false; });
    assert.equal(w.$gameMap.mapId(), 2, 'on the other map');
    assert.equal(fight.isActive() && !fight.isHere(), true, 'the battle waits where it was');
    assert.equal(player.isThrough(), false, 'nobody walks through this map\'s walls');
    assert.equal(player.moveSpeed(), speed);
    // Back on the battle's map the walk is over where the party arrives, and the turn goes on.
    player.reserveTransfer(1, 8, 8, 2, 0);
    player.performTransfer();
    w.run(600, () => fight.awaitsPlayer());
    assert.equal(fight.tacticalState(), 'command');
    assert.deepEqual([player.x, player.y], [8, 8]);
    assert.equal(player.isThrough(), false);
});
