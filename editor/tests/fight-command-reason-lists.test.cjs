'use strict';
// A Tactical unit's menu stays open behind its skill and item lists and is listed again when a target is
// cancelled back to a list (runtime/reactor_fight_tactical.js, W.update). Attack with nobody in reach must read
// grayed there too, not only while the menu itself takes the keys.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fightWorld, event } = require('./helpers/fight-world.cjs');

const unit = (id, x, y, text) => event(id, x, y, { note: `<unit: ${text}>` });

test('Attack out of reach stays grayed while the skill or item list is open, after a target is cancelled', () => {
    const w = fightWorld({ tactical: true, events: [unit(1, 15, 12, 'enemy 1')] });
    w.ConfigManager.save = () => {};
    w.$dataItems[1].effects = [{ code: 11, dataId: 0, value1: 0, value2: 50 }];
    w.$gameParty.gainItem(w.$dataItems[1], 2);
    w.$dataSkills[3] = Object.assign({}, w.$dataSkills[1], { id: 3, name: 'Mend', scope: 11, hitType: 0, mpCost: 0, animationId: 0, note: '' });
    w.$gameActors.actor(1).learnSkill(3);
    const fight = w.$gameFight;
    assert.ok(fight.start({ mode: 'tactical' }) > 0);
    w.run(600, () => fight.awaitsPlayer());
    const me = fight._units.find(u => u.actorId === 1);
    assert.ok(fight.commandSelectUnit(me.id));
    const c = fight.character(me);
    assert.ok(fight.commandMoveTo(c.x, c.y));
    assert.equal(fight.tacticalState(), 'command');
    assert.equal(fight.commandReason('attack'), 'whyNoReach');
    for (const [open, use, id] of [['commandOpenItems', 'commandItem', 1], ['commandOpenSkills', 'commandSkill', 3]]) {
        assert.ok(fight[open]());
        assert.equal(fight.commandReason('attack'), 'whyNoReach', `${open}: the menu behind the list`);
        assert.ok(fight[use](id), `${use} aims`);
        assert.ok(fight.commandCancel(), 'the target is cancelled back to the list');
        assert.notEqual(fight.tacticalState(), 'command');
        assert.equal(fight.commandReason('attack'), 'whyNoReach', `${open}: the menu listed again behind the list`);
        assert.ok(fight.commandCancel());
        assert.equal(fight.tacticalState(), 'command');
    }
    assert.equal(fight.commandReason('wait'), '');
});
