'use strict';
// A real-time battle (runtime/reactor_fight_action.js) is the player's to open: the party's other members hold back
// until the leader attacks (or aims a skill at the other side), fight back once struck, come to a leader under half
// its HP, and fight on their own once the leader has fallen. The Demo's Action skirmish was won by the followers before the player had acted.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');

const facing = direction => ({ pages: [page({ image: { tileId: 0, characterName: '', characterIndex: 0, direction, pattern: 1 } })] });

function world() {
    // An enemy five tiles below the party, facing it: everyone sees everyone.
    const w = fightWorld({ action: true, events: [event(1, 2, 7, Object.assign({ note: '<unit: enemy 1>' }, facing(8)))] });
    w.$dataEnemies[1].params[0] = 50000;
    assert.ok(w.$gameFight.start({ mode: 'action', canEscape: true, canLose: true }) > 0);
    w.run(3);
    const fight = w.$gameFight, A = w.ReactorFight.Action, st = fight.act();
    // The enemy stands still, so whatever is done to it is the party's doing.
    const foe = fight.unitOfEvent(1);
    st.ai[foe.id] = Object.assign(A.aiOf(fight, st, foe, fight.character(foe)), { state: 'stagger', timer: 1e6 });
    const follower = fight._units.find(unit => unit.party && fight.character(unit) !== w.$gamePlayer);
    return { w, fight, A, st, foe, follower };
}

test('the party\'s other members hold back until the leader opens the fight', () => {
    const { w, fight, st, foe, follower } = world();
    assert.ok(follower, 'a follower fights');
    w.run(300);
    const ai = st.ai[follower.id];
    assert.ok(ai, 'the follower is looked after by the battle');
    assert.equal(ai.state, 'idle', 'it has not gone for the enemy it sees');
    assert.equal(fight.battler(foe).hp, fight.battler(foe).mhp, 'nobody struck the enemy');
    assert.equal(fight.isActive(), true);
    // The leader attacks: the rest of the party joins in.
    assert.equal(fight.actionAttack(), true);
    assert.equal(st.led, true);
    w.run(120, () => st.ai[follower.id].state !== 'idle');
    assert.notEqual(st.ai[follower.id].state, 'idle', 'the follower goes for the enemy once the leader has');
});

test('a follower the other side strikes fights back, whatever the leader does', () => {
    const { w, fight, A, st, foe, follower } = world();
    w.run(30);
    assert.equal(A.waitsForLead(fight, st, follower, fight.character(follower), st.ai[follower.id], w.$gamePlayer), true);
    // The enemy's blow lands on the follower.
    fight.strikeFor({ subjectId: foe.id, rate: 1 }, null, follower);
    assert.equal(st.ai[follower.id].provoked, true);
    assert.equal(A.waitsForLead(fight, st, follower, fight.character(follower), st.ai[follower.id], w.$gamePlayer), false);
    assert.equal(st.led, undefined, 'the rest still wait for the leader');
    // A leader under half its HP is helped by all of them.
    const other = world();
    other.w.run(10);
    const leader = other.fight.battler(other.fight.playerUnit());
    leader.setHp(Math.floor(leader.mhp * 0.4));
    assert.equal(other.A.waitsForLead(other.fight, other.st, other.follower, other.fight.character(other.follower), other.st.ai[other.follower.id], other.w.$gamePlayer), false);
    assert.equal(other.st.led, true);
    // The leader never waits for itself.
    assert.equal(A.waitsForLead(fight, st, fight.playerUnit(), w.$gamePlayer, {}, w.$gamePlayer), false);
});
