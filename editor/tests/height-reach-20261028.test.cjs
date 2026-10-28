'use strict';
// How height adds to a shot's reach in a Tactical battle (runtime/reactor_fight_tactical.js › F.heightReach,
// F.reachAt): one more tile for every two levels the shooter stands above its target, up to three, unless the
// project says otherwise (System.json `reactorBattle.heightReach`, Database › System 1 › Battles) or the weapon,
// skill or item does (`rrBattle.heightReach`, its Combat card: src/database/TacticsSection.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { fightWorld } = require('./helpers/fight-world.cjs');
const T = require('../src/database/TacticsSection.js');

const world = (system = {}) => fightWorld({ tactical: true, system });
const plain = value => JSON.parse(JSON.stringify(value));

test('the game\'s own rule: a tile for every two levels up, three at most, nothing for a blade or looking up', () => {
    const F = world().ReactorFight;
    assert.deepEqual(plain(F.heightReach({ min: 2, max: 5 })), { levels: 2, most: 3 });
    assert.equal(F.reachAt({ min: 2, max: 5 }, 6, 0), 8);
    assert.equal(F.reachAt({ min: 1, max: 1 }, 6, 0), 1);
    assert.equal(F.reachAt({ min: 2, max: 5 }, 0, 6), 5);
});

test('a project\'s rule stands for every shot; an action\'s own, or its weapon\'s, stands over it', () => {
    const w = world({ reactorBattle: { heightReach: { levels: 1, most: 6 } } });
    const F = w.ReactorFight, actor = w.$gameActors.actor(1);
    // A rifle on a roof six levels up: a tile a level, six more.
    assert.equal(F.reachAt({ min: 2, max: 7 }, 6, 0), 13);
    assert.equal(F.reachAt({ min: 2, max: 7 }, 20, 0), 13, 'never more than the project\'s most');
    // A weapon of its own: a rifle that gains a tile every level, up to eight; its attack carries the rule.
    w.$dataSystem.weaponTypes = ['', 'Rifle'];
    w.$dataWeapons[1] = { id: 1, name: 'Long rifle', wtypeId: 1, etypeId: 1, note: '', params: [0, 0, 0, 0, 0, 0, 0, 0], traits: [], iconIndex: 0, price: 0, animationId: 0,
        rrBattle: { heightReach: { levels: 1, most: 8 } } };
    actor._equips = [new w.Game_Item()];
    actor._equips[0].setObject(w.$dataWeapons[1]);
    const attack = F.tactics(actor, w.$dataSkills[1]);
    assert.deepEqual(plain(attack.heightReach), { levels: 1, most: 8 });
    assert.equal(F.reachAt(attack, 20, 0), attack.max + 8);
    // A skill that says none: height adds nothing to it, whatever the project or the weapon says.
    w.$dataSkills[70] = Object.assign({}, w.$dataSkills[1], { id: 70, rrBattle: { range: { min: 2, max: 4 }, heightReach: { levels: 2, most: 0 } } });
    const flat = F.tactics(actor, w.$dataSkills[70]);
    assert.equal(F.reachAt(flat, 20, 0), 4);
    // Out-of-range numbers are held to the card's limits; a rule that is not one is not read.
    assert.deepEqual(plain(F.readHeightReach({ levels: 0, most: 99 })), { levels: 1, most: 10 });
    assert.equal(F.readHeightReach({ levels: 'x', most: 2 }), null);
    // Without a rule of its own an action has no key: the value reads as before.
    w.$dataSkills[71] = Object.assign({}, w.$dataSkills[1], { id: 71, hitType: 2, rrBattle: { range: { min: 1, max: 4 } } });
    assert.equal('heightReach' in F.tactics(actor, w.$dataSkills[71]), false);
});

test('the Combat card stores a rule of the record\'s own, and nothing when it is the project\'s', () => {
    const context = { weaponTypes: ['', 'Rifle'], heightReach: { levels: 2, most: 3 } };
    const rifle = { id: 1, wtypeId: 1, note: '' };
    const own = T.change('shared', 'weapon', rifle, context, { heightReach: { levels: 1, most: 5 } });
    assert.deepEqual(plain(own.rrBattle), { heightReach: { levels: 1, most: 5 } });
    assert.equal(own.note, '');
    // One field left empty takes the project's number.
    assert.deepEqual(plain(T.change('shared', 'weapon', rifle, context, { heightReach: { levels: '', most: 0 } }).rrBattle), { heightReach: { levels: 2, most: 0 } });
    // The project's rule as it is is nothing of the record's; held to the limits.
    assert.equal(T.change('shared', 'weapon', rifle, context, { heightReach: { levels: 2, most: 3 } }).rrBattle, undefined);
    assert.deepEqual(plain(T.change('shared', 'skill', { id: 5, scope: 1, note: '' }, context, { heightReach: { levels: 40, most: -2 } }).rrBattle), { heightReach: { levels: 10, most: 0 } });
    // Automatic takes it out with the card's other settings.
    assert.equal(T.reset('shared', 'weapon', Object.assign({}, rifle, own), context).rrBattle, undefined);
    // The game reads what the card stored.
    const F = world().ReactorFight;
    assert.deepEqual(plain(F.recordTactics(Object.assign({}, rifle, own)).heightReach), { levels: 1, most: 5 });
    // The summary says it.
    assert.match(T.summarize('shared', 'weapon', Object.assign({}, rifle, own), context).text, /height \+1 tile per 1 levels, up to 5/);
    assert.match(T.summarize('shared', 'weapon', Object.assign({}, rifle, { rrBattle: { heightReach: { levels: 2, most: 0 } } }), context).text, /no reach from height/);
});

test('the Combat card has the height rows for what shoots, and the Battles card the project\'s rule', () => {
    const html = T.cardHtml('shared', 'weapon');
    assert.match(html, /rr-tactics-height-levels/);
    assert.match(html, /rr-tactics-height-most/);
    assert.doesNotMatch(T.cardHtml('shared', 'enemy'), /rr-tactics-height/);
});
