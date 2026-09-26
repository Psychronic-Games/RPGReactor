'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_CpPassiveSkills.js'), 'utf8');

const SCRIPT = `$imported ||= {}
$imported["CP_PASSIVES"] = 1.1
class Game_BattlerBase  ## Alias the feature objects to get states and passives.
  alias cp_passive_f_objects feature_objects
end`;

function load(skills) {
    function Game_BattlerBase() { this._states = []; }
    Game_BattlerBase.prototype.traitObjects = function() { return this._states.slice(); };
    function Game_Actor() { Game_BattlerBase.call(this); this._skills = []; this.reads = 0; }
    Game_Actor.prototype = Object.create(Game_BattlerBase.prototype);
    Game_Actor.prototype.constructor = Game_Actor;
    // Actor, class and equips follow the battler's objects; skills a trait adds are read from the traits.
    Game_Actor.prototype.traitObjects = function() { return Game_BattlerBase.prototype.traitObjects.call(this).concat(['actor', 'class']); };
    Game_Actor.prototype.skills = function() {
        this.reads++;
        const added = this.traitObjects().filter(o => o && o.addsSkill).map(o => o.addsSkill);
        return this._skills.concat(added).map(id => skills[id]);
    };
    const states = [null, { id: 1 }, { id: 2, addsSkill: 4 }, { id: 3 }];
    const ctx = { Game_BattlerBase, Game_Actor, $dataSkills: skills, $dataStates: states };
    vm.runInNewContext(source, ctx);
    return { ctx, states };
}

test('CP Passive Skills: detected; a known skill\'s passive states give their traits', () => {
    assert.ok(C.scriptFamilies([SCRIPT]).has('cpPassiveSkills'));
    const skills = [null,
        { id: 1, note: 'passive[1]' },
        { id: 2, note: 'Perk.\r\nPASSIVE[2] passive[3]\npassive[1]' },   // one per line: 2 and 1
        { id: 3, note: 'plain' },
        { id: 4, note: 'passive[3]' },
        { id: 5, note: 'passive[99]' }];
    const { ctx, states } = load(skills);
    const actor = new ctx.Game_Actor();
    assert.deepEqual(actor.traitObjects(), ['actor', 'class']);
    actor._skills = [1, 2, 3, 5];
    const objects = actor.traitObjects();
    assert.deepEqual(objects.map(o => (typeof o === 'string' ? o : o.id)), [1, 2, 1, 'actor', 'class'], 'states, passives, then the actor\'s own; a missing state is skipped');
    assert.equal(objects[1], states[2]);
    // Skill 4 comes from passive state 2's trait: while listing skills the passives are left out, so it gives none.
    assert.ok(!objects.includes(states[3]));
    const enemy = new ctx.Game_BattlerBase();
    enemy._states = [states[1]];
    assert.deepEqual(enemy.traitObjects(), [states[1]], 'enemies have no passives');
});
