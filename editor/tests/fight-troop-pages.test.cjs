'use strict';
// A troop's pages run in a battle on the map that troop came to (runtime/reactor_fight.js, checkTroopPages), with
// the battle screen's conditions and spans: turn A + B * X, turn ending, an enemy's HP by its place in the troop, an
// actor's HP, a switch; once a battle, once a turn, every moment. A page with no condition never runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fightWorld } = require('./helpers/fight-world.cjs');

const troopPage = (conditions, variable, span = 0) => ({
    conditions: Object.assign({ actorHp: 50, actorId: 1, actorValid: false, enemyHp: 50, enemyIndex: 0, enemyValid: false, switchId: 1, switchValid: false,
        turnA: 0, turnB: 0, turnEnding: false, turnValid: false }, conditions),
    // Control Variables: the page's own variable, plus 1.
    span, list: [{ code: 122, indent: 0, parameters: [variable, variable, 1, 0, 1] }, { code: 0, indent: 0, parameters: [] }]
});

function world(pages) {
    const w = fightWorld();
    w.$dataEnemies[1].params[0] = 9000;
    w.$dataSystem.variables = Array(40).fill('');
    w.$dataTroops = [null, { id: 1, name: 'Raiders', members: [{ enemyId: 1, x: 0, y: 0, hidden: false }, { enemyId: 1, x: 0, y: 0, hidden: false }], pages }];
    return w;
}

/** The page the battle would run next (its index), or -1; the queue is left empty. */
function next(fight) {
    fight._hooks.length = 0;
    const queued = fight.updateTroopPages();
    const page = queued ? fight._hooks[0].pageIndex : -1;
    fight._hooks.length = 0;
    return page;
}

test('the pages of the troop a battle on the map brings run with the battle screen\'s conditions and spans', () => {
    const w = world([
        troopPage({}, 10),
        troopPage({ turnValid: true, turnA: 0, turnB: 0 }, 11),
        troopPage({ turnValid: true, turnA: 2, turnB: 3 }, 12),
        troopPage({ enemyValid: true, enemyIndex: 1, enemyHp: 50 }, 13),
        troopPage({ actorValid: true, actorId: 1, actorHp: 30, switchValid: true, switchId: 3 }, 14),
        troopPage({ turnEnding: true }, 15, 1)
    ]);
    const fight = w.$gameFight;
    assert.ok(fight.start({ mode: 'tactical', troopId: 1, canEscape: true, canLose: true }) > 0);
    assert.equal(fight._troopPages.length, 1);
    const members = fight._troopPages[0].members;
    assert.equal(members.filter(id => id > 0).length, 2, 'both members came, each named by its place');
    // The battle's start: the turn 0 page is queued and runs in the battle's own interpreter.
    w.run(2);
    assert.equal(w.$gameVariables.value(11), 1, 'the turn 0 page ran as the battle started');
    assert.equal(w.$gameVariables.value(10), 0, 'a page with no condition never runs');
    fight._phase = 'queue';
    assert.equal(next(fight), -1, 'a page of the Battle span runs once');
    // An enemy named by its place in the troop falls under half its HP.
    const second = fight.unit(members[1]);
    fight.battler(second).setHp(Math.floor(fight.battler(second).mhp * 0.4));
    assert.equal(next(fight), 3);
    // Every condition of a page must hold: the actor's HP, and the switch.
    w.$gameSwitches.setValue(3, true);
    assert.equal(next(fight), -1, 'the actor is not under 30% yet');
    w.$gameActors.actor(1).setHp(Math.floor(w.$gameActors.actor(1).mhp * 0.2));
    assert.equal(next(fight), 4);
    // Turn 2 (A 2 + 3 * X): its page; turn 5 too, not turn 4.
    fight._turn = 2;
    assert.equal(next(fight), 2);
    delete fight._troopPages[0].flags[2];
    fight._turn = 4;
    assert.equal(next(fight), -1);
    fight._turn = 5;
    assert.equal(next(fight), 2);
    // A turn's end: its page, once in that turn; open again once the next turn begins.
    assert.equal(next(fight), -1);
    fight.endTroopTurn();
    assert.equal(next(fight), 5, 'the turn-ending page as the turn ends');
    assert.equal(next(fight), -1, 'once a turn');
    fight._phase = 'round';
    next(fight);
    assert.equal(fight._troopTurnEnding, false, 'the next turn begins');
    fight.endTroopTurn();
    fight._phase = 'queue';
    assert.equal(next(fight), 5, 'and in the next turn\'s end it runs again');
});

test('a battle without a troop runs no troop pages, and a Moment page runs whenever it holds', () => {
    const w = world([troopPage({ switchValid: true, switchId: 4 }, 16, 2)]);
    const fight = w.$gameFight;
    assert.ok(fight.start({ mode: 'tactical', canEscape: true, canLose: true }) > 0);
    assert.equal(fight._troopPages.length, 0);
    fight.end(w.ReactorFight.ESCAPE, true);
    w.run(60, () => !fight.isActive());
    assert.ok(fight.start({ mode: 'tactical', troopId: 1, canEscape: true, canLose: true }) > 0);
    fight._phase = 'queue';
    w.$gameSwitches.setValue(4, true);
    assert.equal(next(fight), 0);
    assert.equal(next(fight), 0, 'again while it holds');
    w.$gameSwitches.setValue(4, false);
    assert.equal(next(fight), -1);
});
