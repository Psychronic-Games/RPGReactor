'use strict';
// Comes back: an enemy record's own setting (Database › Enemies, the Shared Combat Settings card,
// `rrBattle.comesBack`) and an event's In battle row (`rrUnit.returns`), which overrides it either way and is
// stored only where it differs.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const T = require(path.join(__dirname, '..', 'src', 'database', 'TacticsSection.js'));
const EventEditor = require('../src/event/EventEditor.js');

const context = { weaponTypes: [], pluginTags: null };

test('the Enemies card sets and clears Comes back, which no Note tag says', () => {
    const enemy = { id: 2, name: 'Wolf', note: '<ai: ranged>', rrBattle: { ai: 'ranged' } };
    assert.ok(T.ownTags('shared', 'enemy').includes('comesBack'));
    const set = T.change('shared', 'enemy', enemy, context, { comesBack: true });
    assert.deepEqual(set.rrBattle, { ai: 'ranged', comesBack: true });
    assert.equal(set.note, '', 'the card\'s tags move into its settings as with any change');
    assert.deepEqual(T.own(Object.assign({}, enemy, set)), { ai: 'ranged', comesBack: true });
    assert.match(T.summarize('shared', 'enemy', Object.assign({}, enemy, set), context, text => text).text, /Comes back/);

    const cleared = T.change('shared', 'enemy', Object.assign({}, enemy, set), context, { comesBack: false });
    assert.deepEqual(cleared.rrBattle, { ai: 'ranged' });
    assert.equal(T.reset('shared', 'enemy', Object.assign({}, enemy, set), context).rrBattle, undefined, 'Automatic takes it out');
    assert.equal(T.ownTags('shared', 'actor').includes('comesBack'), false, 'an actor has no such setting');
});

test('an event\'s box keeps only what differs from its enemy, and a change of side or record leaves it alone', () => {
    const lists = { enemies: [null, { id: 1, name: 'Raider' }, { id: 2, name: 'Wolf', rrBattle: { comesBack: true } }], actors: [] };
    const write = (current, change) => EventEditor.unitRowValue(current, Object.assign({ move: '' }, change), lists);
    const wolf = { team: 'enemy', record: 'enemy', id: 2 }, raider = { team: 'enemy', record: 'enemy', id: 1 };
    assert.equal(EventEditor.unitComesBack(wolf, lists.enemies), true, 'the box shows its enemy\'s setting');
    assert.equal(EventEditor.unitComesBack(raider, lists.enemies), false);
    // Ticked as its enemy already is: nothing of its own.
    assert.equal('returns' in write(wolf, { team: 'enemy', record: 'enemy:2', returns: true }), false);
    // Unticked: this wolf stays gone.
    const pinned = write(wolf, { team: 'enemy', record: 'enemy:2', returns: false });
    assert.equal(pinned.returns, false);
    assert.equal(EventEditor.unitComesBack(pinned, lists.enemies), false);
    // A raider ticked comes back; unticked again, it follows its enemy.
    assert.equal(write(raider, { team: 'enemy', record: 'enemy:1', returns: true }).returns, true);
    assert.equal('returns' in write({ ...raider, returns: true }, { team: 'enemy', record: 'enemy:1', returns: false }), false);
    // Another record chosen (the box untouched): the event's own choice stays.
    assert.equal(write(pinned, { team: 'enemy', record: 'enemy:1' }).returns, false);
    assert.equal('returns' in write(wolf, { team: 'enemy', record: 'enemy:1' }), false, 'nothing is pinned by a change of record');
    assert.equal('returns' in write(pinned, { team: 'ally', record: 'enemy:2' }), false, 'an ally never comes back');
});
