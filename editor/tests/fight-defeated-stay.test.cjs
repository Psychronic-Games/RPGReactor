'use strict';
// Enemies placed on a map that fall in a battle on the map stay defeated (runtime/reactor_fight.js,
// F.staysDefeated, Game_Fight.rememberDefeated), as Classic placed enemies do: the event's own Comes back decides,
// else its enemy record's (Database › Enemies, `rrBattle.comesBack`), else it stays gone.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fightWorld, event } = require('./helpers/fight-world.cjs');

const row = (id, x, y, enemyId, extra = {}) => event(id, x, y, { rrUnit: Object.assign({ team: 'enemy', record: 'enemy', id: enemyId }, extra) });
const copy = value => JSON.parse(JSON.stringify(value));

function leave(w, pristine) {
    const other = copy(pristine);
    other.events = [null];
    w.$dataMap = other;
    w.$gamePlayer.reserveTransfer(2, 3, 3, 2, 0);
    w.$gamePlayer.performTransfer();
}
function comeBack(w, pristine) {
    w.$dataMap = copy(pristine);
    w.$gamePlayer.reserveTransfer(1, 2, 2, 2, 0);
    w.$gamePlayer.performTransfer();
}

/** Raiders of enemy 1 (stays by its record) and enemy 2 (comes back by its record), each with and without a row of its own. */
function world() {
    const w = fightWorld({ events: [row(3, 8, 4, 1), row(4, 9, 4, 1, { returns: true }), row(5, 10, 4, 2), row(6, 11, 4, 2, { returns: false })] });
    w.$dataEnemies[2].rrBattle = { comesBack: true };
    return w;
}

function winOnMap(w, mode, result) {
    const fight = w.$gameFight, F = w.ReactorFight;
    const serial = fight.start({ mode, canEscape: true });
    assert.ok(serial > 0);
    w.run(3);
    for (const unit of fight._units) if (unit.team === 'enemy') fight.battler(unit).addState(1);
    if (result === 'escape') { for (const unit of fight._units) if (unit.team === 'enemy') fight.defeat(unit); fight.end(F.ESCAPE, true); }
    w.run(2000, () => !fight.isActive());
    assert.equal(fight.isActive(), false);
    return fight.resultOf(serial);
}

for (const mode of ['tactical', 'action']) {
    test(`${mode}: the defeated stay off their map unless they come back, by the event or else by the enemy`, () => {
        const w = world(), pristine = copy(w.$dataMap), F = w.ReactorFight;
        assert.equal(winOnMap(w, mode), F.WIN);
        leave(w, pristine);
        comeBack(w, pristine);
        const erased = id => !!w.$gameMap.event(id)._erased;
        assert.deepEqual([3, 4, 5, 6].map(erased), [true, false, false, true],
            'stays by its enemy; comes back by its own box; comes back by its enemy; stays by its own box');
    });
}

test('the fallen of a battle that was left as an escape stay defeated too; a lost battle remembers nobody', () => {
    const w = world(), pristine = copy(w.$dataMap), F = w.ReactorFight;
    assert.equal(winOnMap(w, 'tactical', 'escape'), F.ESCAPE);
    leave(w, pristine);
    comeBack(w, pristine);
    assert.equal(!!w.$gameMap.event(3)._erased, true);

    const lost = world(), lostMap = copy(lost.$dataMap);
    const fight = lost.$gameFight;
    fight.start({ mode: 'tactical', canLose: true });
    lost.run(3);
    for (const unit of fight._units) if (unit.team === 'enemy') { lost.$gameFight.battler(unit).addState(1); fight.defeat(unit); }
    fight.end(lost.ReactorFight.LOSE, true);
    lost.run(2000, () => !fight.isActive());
    assert.deepEqual(Object.keys(fight._fallen || {}), []);
    leave(lost, lostMap);
    comeBack(lost, lostMap);
    assert.equal(!!lost.$gameMap.event(3)._erased, false);
});

test('F.staysDefeated reads the event first, then its enemy, and remembers enemy rows only', () => {
    const w = world(), F = w.ReactorFight;
    const data = rrUnit => ({ rrUnit });
    assert.equal(F.staysDefeated(data({ team: 'enemy', record: 'enemy', id: 1 })), true);
    assert.equal(F.staysDefeated(data({ team: 'enemy', record: 'enemy', id: 2 })), false);
    assert.equal(F.staysDefeated(data({ team: 'enemy', record: 'enemy', id: 2, returns: false })), true);
    assert.equal(F.staysDefeated(data({ team: 'enemy', record: 'enemy', id: 1, returns: true })), false);
    assert.equal(F.staysDefeated(data({ team: 'enemy', record: 'actor', id: 1 })), true, 'an actor fighting as an enemy has no enemy setting');
    assert.equal(F.staysDefeated(data({ team: 'ally', record: 'enemy', id: 1 })), false);
    assert.equal(F.staysDefeated({ note: '<unit: enemy 1>' }), false, 'a tag unit is no row');
});
