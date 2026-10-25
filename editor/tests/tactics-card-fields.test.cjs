'use strict';
// The battle cards of a Database record store in the record itself
// (`rrBattle`), not in its Note (src/database/TacticsSection.js, the pure
// half). What a card shows is what the game will do: the same records go to
// the cards' readers and to the game's (reactor_fight_tactical.js,
// reactor_fight_action.js, reactor_fight_look.js) and must come back the
// same. A change gives a new `rrBattle` object without the keys that are back
// at Automatic, takes the tag of the same name out of the Note and moves the
// card's other tags with it; a PTBS block and every other line stay.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { fightWorld, event } = require('./helpers/fight-world.cjs');

const T = require('../src/database/TacticsSection.js');
const fixtures = require('./fixtures/tactics-fixtures.json');
const repo = path.resolve(__dirname, '..', '..');

// Values from the game's own context are compared as plain data (a number that is none keeps its name), and a key
// that is null there is one that is not set.
const plain = value => (value === null || value === undefined ? null : JSON.parse(JSON.stringify(value, (key, held) => (typeof held === 'number' && !Number.isFinite(held) ? String(held) : held))));
const set = value => {
    const out = {};
    for (const [key, held] of Object.entries(plain(value) || {})) if (held !== null) out[key] = held;
    return Object.keys(out).length ? out : null;
};
const frozen = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(frozen); } return value; };

const PTBS = '<PTBS>\nscope: circle(3,0)\naoe: circle(2,0)\nmove_points: 4\n</PTBS>';

// Notes: the shared fixtures, and the ways a hand-typed tag goes wrong.
const NOTES = fixtures.notes.map(entry => entry.note).concat([
    '< range: 3>', '<area: circle3>', '<area:  cone   2 >', '<los: 0>', '<los: maybe>', '<LOS: Off>', '<ai: reckless> <ai: ranged>', '<ai: Support>',
    '<range: 2> and <range: 4>', '<move: +3> <jump: -2>', '<move: 2.5>', PTBS, PTBS + '\n<range: 5>\n<area: cone 2>\n<move: 1>',
    '<PTBS>\nscope: square(3,0)\naoe: cone(2,0)\n</PTBS>', '<PTBS>\nscope: line(4)\naoe: cross(0,0)\n</PTBS>', '<PTBS><move: 9></PTBS>',
    '<fire rate: 4.5>', '<fire rate: 1.2.3>', '<Fire Rate:0.05> <SPREAD: 0.5>', '<magazine: 0>', '<magazine: 40>\n<reload: 0.8>', '<combo: 9>',
    '<projectile: laser> <projectile: bolt>', '<projectile: Rocket>', '<cooldown: 7>', '<cooldown: .5>',
    '<unit character: Monster, 3>', '<unit character: Monster>', '<unit character:  , 2>', '<unit character: $Big, 12>', '<Unit Character:People1,7>',
    'A sniper.\n<range: 3-9> <los: no>\n<fire rate: 1>\n<magazine: 5>\n<projectile: rocket>\n<move: -1>\n<ai: ranged>\n<unit character: Evil, 2>\nKeep me.'
]);

// A record's own settings: what the cards write, what a script may write, and nonsense.
const FIELDS = [
    undefined, null, {}, 'circle', 7, [], [{ move: 3 }],
    { range: { min: 2, max: 6 } }, { range: { max: 3 } }, { range: { max: 0 } }, { range: { min: 9, max: 4 } }, { range: { min: -2, max: 4 } }, { range: { min: '2', max: '5' } },
    { range: { max: -2 } }, { range: 5 }, { range: { min: 2 } }, { range: { max: 2.9 } }, { range: { max: Infinity } }, { range: null },
    { area: { shape: 'cone', size: 3 } }, { area: { shape: 'Cone', size: 3 } }, { area: { shape: 'circle' } }, { area: { shape: 'all', size: 7 } }, { area: { shape: 'single' } },
    { area: { shape: 'self' } }, { area: { shape: 'blob', size: 2 } }, { area: 'circle' }, { area: { shape: 'line', size: 0 } }, { area: { shape: 'square', size: '4' } }, { area: { shape: 'cross', size: -3 } },
    { los: false }, { los: true }, { los: 'no' }, { los: 0 }, { los: null },
    { move: 6 }, { move: 0 }, { move: -1 }, { move: '5' }, { move: 'far' }, { move: '' }, { move: null }, { move: 2.9 }, { move: -0.5 }, { move: true },
    { jump: 3 }, { jump: 0 }, { jump: null }, { jump: '2' }, { jump: -2 },
    { ai: 'ranged' }, { ai: 'Support' }, { ai: 'aggressive' }, { ai: 'reckless' }, { ai: '' }, { ai: 3 },
    { fireRate: 5 }, { fireRate: 0 }, { fireRate: -1 }, { fireRate: '2.5' }, { fireRate: 'fast' }, { fireRate: null }, { fireRate: true },
    { magazine: 4.9 }, { magazine: 0 }, { magazine: 'many' }, { magazine: '12' }, { reload: 0.5 }, { reload: '' }, { reload: 0 },
    { spread: 0 }, { spread: 4.25 }, { combo: 4 }, { combo: 9 }, { combo: 0 }, { combo: 2.7 }, { cooldown: 3 }, { cooldown: 0 }, { cooldown: null }, { cooldown: '0.5' },
    { projectile: 'rocket' }, { projectile: 'Rocket' }, { projectile: 'none' }, { projectile: 'laser' }, { projectile: 4 }, { projectile: '' },
    { character: { name: 'Evil', index: 5 } }, { character: { name: ' Evil ', index: 5 } }, { character: { name: '$Big', index: 12 } }, { character: { name: '' } },
    { character: { name: 'Evil' } }, { character: { name: 'Evil', index: -3 } }, { character: 'Evil' }, { character: { index: 3 } }, { character: null },
    { range: { min: 3, max: 8 }, los: true },
    { range: { min: 2, max: 6 }, area: { shape: 'circle', size: 2 }, los: false, move: -1, jump: 2, ai: 'ranged', fireRate: 5, magazine: 4, reload: 0.5, spread: 0, combo: 4, cooldown: 3, projectile: 'bolt', character: { name: 'Evil', index: 1 } },
    { somethingElse: { kept: true }, move: 3 }
];

test('the cards read every record as the game does: its own settings, its tags, both, and a PTBS block', () => {
    const world = fightWorld({ tactical: true, action: true, look: true });
    const F = world.ReactorFight, A = F.Action, L = world.ReactorFightLook;
    assert.ok(typeof F.recordTactics === 'function' && typeof A.settings === 'function' && typeof L.recordCharacter === 'function', 'the game\'s readers are loaded');
    const enemy = { record: 'enemy', id: 3 };
    let compared = 0, both = 0, blocks = 0;
    for (const note of NOTES) {
        for (const rrBattle of FIELDS) {
            const record = frozen(rrBattle === undefined ? { id: 3, note } : { id: 3, note, rrBattle });
            const label = `${JSON.stringify(note)} with ${JSON.stringify(rrBattle)}`;
            assert.deepEqual(plain(T.recordTactics(record)), set(F.recordTactics(record)), 'tactical: ' + label);
            assert.deepEqual(plain(T.recordCombat(record)), set(A.settings(record)), 'action: ' + label);
            if (/1\.2\.3/.test(note) && !(rrBattle && typeof rrBattle === 'object' && Number(rrBattle.fireRate) >= 0)) assert.equal(plain(T.recordCombat(record)).fireRate, 'NaN', 'a tag that is no number reads as none, here as in the game');
            assert.deepEqual(T.recordCharacter(record), plain(L.recordCharacter(enemy, record)), 'the picture on the map: ' + label);
            compared++;
            if (T.own(record) && (T.parse(note) || T.parseCombat(note))) both++;
            if (/<PTBS>/.test(note) && T.own(record)) blocks++;
        }
    }
    assert.ok(compared > 5000 && both > 1500 && blocks > 300, `${compared} records, ${both} with a setting and a tag, ${blocks} with a setting and a PTBS block`);
    // Named, so nobody has to trust the loop: a setting over the tag of the same name, a tag for what the settings leave, a block under both.
    const mixed = { note: PTBS + '\n<range: 1-2><area: line 4><los: no><move: 3><cooldown: 9><unit character: Monster, 3>', rrBattle: { range: { min: 3, max: 8 }, los: true, cooldown: 0.5, character: { name: 'Evil', index: 5 } } };
    assert.deepEqual(T.recordTactics(mixed), { range: { min: 3, max: 8 }, area: { shape: 'line', size: 4 }, los: true, move: 3 });
    assert.deepEqual(T.recordTactics(mixed), set(F.recordTactics(mixed)));
    assert.deepEqual(T.recordCombat(mixed), { cooldown: 0.5 });
    assert.deepEqual(T.recordCharacter(mixed), { characterName: 'Evil', characterIndex: 5 });
    assert.deepEqual(['range', 'area', 'los', 'move', 'jump', 'cooldown', 'character'].map(key => T.sourceOf(mixed, key)), ['field', 'tag', 'field', 'tag', '', 'field', 'field']);
    const block = { note: PTBS, rrBattle: { move: 6 } };
    assert.deepEqual(T.recordTactics(block), { range: { min: 0, max: 3 }, area: { shape: 'circle', size: 2 }, move: 6 });
    assert.deepEqual(['range', 'area', 'move'].map(key => T.sourceOf(block, key)), ['ptbs', 'ptbs', 'field']);
    assert.deepEqual([T.own({ note: '<move: 3>' }), T.own({ note: '', rrBattle: {} }), T.own(null)], [null, null, null], 'the Note is not the record\'s own setting');
});

test('what a card shows for a skill, an item and a weapon is what the battle does with it', () => {
    const w = fightWorld({ tactical: true, action: true }), F = w.ReactorFight, A = F.Action;
    w.$dataSystem.weaponTypes = ['', 'Sword', 'Sniper Rifle', 'Bow', 'Pistol', 'Dagger', 'Shotgun', 'Rocket Launcher'];
    const context = { weaponTypes: w.$dataSystem.weaponTypes };
    const actor = w.$gameActors.actor(1);
    for (let type = 1; type < context.weaponTypes.length; type++) w.$dataClasses[1].traits.push({ code: 51, dataId: type, value: 1 });
    const settings = [
        {}, { note: '<range: 2-6>' }, { rrBattle: { range: { min: 2, max: 6 } } }, { note: '<range: 1-2><area: line 4><los: no>', rrBattle: { range: { min: 3, max: 8 }, los: true } },
        { note: '<area: cone 3>', rrBattle: { area: { shape: 'circle', size: 2 }, los: false } }, { rrBattle: { area: { shape: 'self' }, range: { min: 2, max: 5 } } },
        { rrBattle: { area: { shape: 'all' } } }, { note: PTBS }, { note: PTBS, rrBattle: { range: { min: 1, max: 9 } } }, { note: PTBS + '\n<area: cross 2>', rrBattle: { los: false } },
        { rrBattle: { range: { max: 0 } } }, { rrBattle: { range: 'far', area: { shape: 'blob' }, los: 'no' }, note: '<range: 5>' }
    ];
    const shown = value => `${value.range.min}-${value.range.max} ${value.area.shape} ${value.area.size} ${value.los}`;
    const played = value => `${value.min}-${value.max} ${value.area.shape} ${value.area.size} ${value.los}`;
    let compared = 0;
    // A skill or an item that leaves nothing to a weapon: by its Scope.
    for (const scope of [0, 1, 2, 7, 8, 9, 11, 13]) {
        for (const each of settings) {
            const skill = Object.assign({}, w.$dataSkills[1], { id: 70 + compared, scope, hitType: 2, note: '' }, each);
            w.$dataSkills[skill.id] = skill;
            assert.equal(shown(T.effective('skill', skill, context)), played(F.tactics(actor, skill)), `skill, scope ${scope}: ${JSON.stringify(each)}`);
            const item = Object.assign({}, w.$dataItems[1] || { id: 1, name: 'Potion', itypeId: 1, occasion: 0, effects: [], damage: { type: 0 } }, { id: 400 + compared, scope, hitType: 0, note: '' }, each);
            assert.equal(shown(T.effective('item', item, context)), played(F.tactics(actor, item)), `item, scope ${scope}: ${JSON.stringify(each)}`);
            compared++;
        }
    }
    // A weapon: what the attack does with it in hand. Unarmed, the attack is what the Attack skill's card shows.
    actor._equips = [new w.Game_Item()];
    assert.equal(shown(T.effective('skill', w.$dataSkills[1], context)), played(F.tactics(actor, w.$dataSkills[1])), 'unarmed');
    const combat = [
        {}, { note: '<fire rate: 2><spread: 4>', rrBattle: { fireRate: 5, magazine: 4.9, reload: 0.5, combo: 4, projectile: 'Rocket' } }, { rrBattle: { magazine: 0 } }, { rrBattle: { projectile: 'none' } },
        { note: '<projectile: bolt>' }, { rrBattle: { projectile: 'arrow', spread: 0 } }, { rrBattle: { fireRate: 0.05, combo: 9 } }, { note: '<magazine: 40>\n<reload: 0.8>', rrBattle: { reload: 2 } }
    ];
    for (let wtypeId = 1; wtypeId < context.weaponTypes.length; wtypeId++) {
        for (const each of settings.concat(combat)) {
            const weapon = Object.assign({ id: 200 + compared, name: 'W', wtypeId, etypeId: 1, params: [0, 0, 0, 0, 0, 0, 0, 0], traits: [], note: '', iconIndex: 0, animationId: 0, price: 0, description: '' }, each);
            w.$dataWeapons[weapon.id] = weapon;
            actor._equips[0].setObject(weapon);
            const label = `${context.weaponTypes[wtypeId]}: ${JSON.stringify(each)}`;
            assert.equal(shown(T.effective('weapon', weapon, context)), played(F.tactics(actor, w.$dataSkills[1])), label);
            const mine = T.combatProfile(weapon, context), theirs = A.profile(actor);
            assert.deepEqual([mine.ranged, mine.projectile, Math.max(2, Math.round(60 / mine.fireRate)), mine.magazine, Math.round(60 * mine.reload), mine.spread, mine.combo, mine.pellets, mine.reach],
                [theirs.ranged, theirs.projectile, theirs.rate, theirs.magazine, theirs.reload, theirs.spread, theirs.combo, theirs.pellets, theirs.reach], 'in an Action battle, ' + label);
            compared++;
        }
    }
    assert.ok(compared > 200);
    // Cooldowns.
    w.DataManager.isItem = record => !!record.isItem;
    for (const each of [{}, { note: '<cooldown: 9>' }, { rrBattle: { cooldown: 0.5 } }, { note: '<cooldown: 9>', rrBattle: { cooldown: 0.5 } }, { rrBattle: { cooldown: 0 } }, { note: '<cooldown: 4>', rrBattle: { cooldown: 'soon' } }]) {
        for (const kind of ['skill', 'item']) {
            const record = Object.assign({ id: 9, note: '', isItem: kind === 'item' }, each);
            assert.equal(Math.round(T.cooldownOf(kind, record).cooldown * 60), A.cooldownOf(record), `${kind}: ${JSON.stringify(each)}`);
        }
    }
});

test('what a card shows for a unit is how far it moves and climbs and how it fights in the battle', () => {
    const unit = (id, x, y, words) => event(id, x, y, { note: `<unit: ${words}>` });
    const w = fightWorld({ tactical: true, events: [unit(1, 10, 5, 'enemy 1'), unit(2, 12, 5, 'enemy 2')] }), F = w.ReactorFight;
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    w.run(600, () => w.$gameFight.awaitsPlayer());
    const foe = id => w.$gameFight.unitOfEvent(id), hero = () => w.$gameFight._units.find(u => u.actorId === 1);
    const context = { classOf: id => w.$dataClasses[id] || null };
    const settings = [
        {}, { note: '<move: 2><ai: ranged>' }, { rrBattle: { move: 6, jump: 3, ai: 'support' } }, { note: '<move: 2><jump: 4><ai: ranged>', rrBattle: { move: 5 } },
        { note: '<PTBS>\nmove_points: 6\n</PTBS>' }, { note: '<PTBS>\nmove_points: 6\n</PTBS>', rrBattle: { move: 0 } }, { rrBattle: { move: 99, jump: -4 } },
        { note: '<move: 3>', rrBattle: { move: 'far', ai: 'reckless' } }, { rrBattle: { ai: 'Ranged' } }
    ];
    const shown = (kind, record) => { const stats = T.unitStats(kind, record, context), found = T.recordTactics(record) || {}; return [stats.move, stats.jump, found.ai || 'aggressive']; };
    for (const each of settings) {
        Object.assign(w.$dataEnemies[1], { note: '', rrBattle: undefined }, each);
        assert.deepEqual(shown('enemy', w.$dataEnemies[1]), [F.moveOf(foe(1)), F.jumpOf(foe(1)), F.aiOf(foe(1))], 'enemy: ' + JSON.stringify(each));
        // An actor: its own, else its class's.
        for (const cls of settings.slice(0, 6)) {
            Object.assign(w.$dataClasses[1], { note: '', rrBattle: undefined }, cls);
            Object.assign(w.$dataActors[1], { note: '', rrBattle: undefined }, each);
            assert.deepEqual(shown('actor', w.$dataActors[1]), [F.moveOf(hero()), F.jumpOf(hero()), F.aiOf(hero())], `actor ${JSON.stringify(each)} of class ${JSON.stringify(cls)}`);
        }
    }
});

//-----------------------------------------------------------------------------
// Writing.

const context = { weaponTypes: ['', 'Dagger', 'Sword', 'Sniper Rifle', 'Shotgun', 'Machine Gun', 'Pistol', 'Bow'] };

test('a change gives the record a new rrBattle object, with no key for what is back at Automatic and no object when nothing is left', () => {
    const fire = frozen({ id: 20, scope: 1, hitType: 2, note: 'Burns.' });
    const set1 = T.change('shared', 'skill', fire, context, { range: { min: 2, max: 6 } });
    assert.deepEqual(set1, { note: 'Burns.', rrBattle: { range: { min: 2, max: 6 } } }, 'the Note is not written to');
    const held = frozen(Object.assign({}, fire, set1));
    const set2 = T.change('shared', 'skill', held, context, { area: { shape: 'cone', size: 3 } });
    assert.deepEqual(set2.rrBattle, { range: { min: 2, max: 6 }, area: { shape: 'cone', size: 3 } });
    assert.notEqual(set2.rrBattle, held.rrBattle, 'a new object: the game compares the object');
    assert.deepEqual(held.rrBattle, { range: { min: 2, max: 6 } }, 'the one the record had is not changed');
    // The value the record gets anyway is not kept: the key goes.
    const back = T.change('shared', 'skill', frozen(Object.assign({}, fire, set2)), context, { range: { min: 1, max: 4 } });
    assert.deepEqual(back.rrBattle, { area: { shape: 'cone', size: 3 } });
    assert.equal('range' in back.rrBattle, false);
    const empty = T.change('shared', 'skill', frozen(Object.assign({}, fire, back)), context, { area: null });
    assert.deepEqual([empty.rrBattle, empty.note], [undefined, 'Burns.'], 'nothing left: no rrBattle');
    // The same change twice is the same content in a new object each time; a change that sets nothing sets nothing.
    assert.notEqual(T.change('shared', 'skill', held, context, { los: false }).rrBattle, T.change('shared', 'skill', held, context, { los: false }).rrBattle);
    assert.deepEqual(T.change('shared', 'skill', fire, context, { range: { min: 1, max: 4 }, area: { shape: 'single', size: 0 }, los: true }), { note: 'Burns.', rrBattle: undefined });
    // Each kind of value as it is stored.
    assert.deepEqual(T.change('shared', 'skill', fire, context, { area: { shape: 'all', size: 9 }, los: false }).rrBattle, { area: { shape: 'all' }, los: false });
    assert.deepEqual(T.change('shared', 'skill', { id: 1, scope: 1, hitType: 1, note: '' }, context, { range: { min: 1, max: 1 } }).rrBattle, { range: { min: 1, max: 1 } }, 'what the weapon would decide is kept when set');
    assert.deepEqual(T.change('tactical', 'enemy', { id: 1, note: '' }, context, { move: 0, jump: '3', ai: 'ranged', character: { name: ' Evil ', index: 12 } }).rrBattle,
        { move: 0, jump: 3 }, 'a unit that moves 0 tiles is a setting');
    assert.deepEqual(T.change('shared', 'enemy', { id: 1, note: '', rrBattle: { ai: 'ranged', character: { name: 'Evil', index: 1 } } }, context, { ai: 'aggressive', character: { name: '', index: 0 } }).rrBattle, undefined);
    assert.deepEqual(T.change('tactical', 'armor', { id: 1, note: '' }, context, { move: -1, jump: 0 }).rrBattle, { move: -1 }, 'equipment that adds nothing sets nothing');
    assert.deepEqual(T.change('tactical', 'class', { id: 1, note: '' }, context, { move: 5, ai: 'ranged' }).rrBattle, { move: 5 }, 'a class has no Fights field');
    const rifle = { id: 5, wtypeId: 3, note: '' };
    assert.deepEqual(T.change('action', 'weapon', rifle, context, { fireRate: 2.5, magazine: 10, reload: 1.6, spread: 1.5, projectile: 'bullet' }).rrBattle, undefined, 'its type\'s own values set nothing');
    assert.deepEqual(T.change('action', 'weapon', rifle, context, { fireRate: 1.004, magazine: 5.9, reload: 2.25, spread: 0, projectile: 'rocket', combo: 4 }).rrBattle,
        { fireRate: 1, magazine: 5, reload: 2.25, spread: 0, combo: 4, projectile: 'rocket' });
    assert.deepEqual(T.change('action', 'weapon', { id: 5, wtypeId: 3, note: '', rrBattle: { fireRate: 1, magazine: 5 } }, context, { fireRate: '', magazine: null }).rrBattle, undefined, 'emptied fields are Automatic again');
    assert.deepEqual(T.change('action', 'skill', { note: '' }, context, { cooldown: 6.5 }).rrBattle, { cooldown: 6.5 });
    assert.deepEqual(T.change('action', 'skill', { note: '', rrBattle: { cooldown: 6.5 } }, context, { cooldown: 2 }).rrBattle, undefined);
    assert.deepEqual(T.change('action', 'item', { note: '' }, context, { cooldown: 0 }).rrBattle, { cooldown: 0 }, 'no cooldown at all is a setting');
    // A card sets its own keys alone: what the other card and anybody else keep in rrBattle stays.
    const shared = { id: 5, wtypeId: 3, note: '', rrBattle: { magazine: 5, somethingElse: { kept: true } } };
    assert.deepEqual(T.change('shared', 'weapon', shared, context, { range: { min: 2, max: 9 }, fireRate: 4 }).rrBattle, { magazine: 5, somethingElse: { kept: true }, range: { min: 2, max: 9 } });
    // A value that is no setting of this card on this kind of record is not taken.
    assert.deepEqual(T.change('action', 'armor', { note: '' }, context, { cooldown: 3, move: 2 }), { note: '', rrBattle: undefined });
    // What stood in rrBattle and was no object is replaced by one.
    assert.deepEqual(T.change('tactical', 'state', { note: '', rrBattle: 'circle' }, context, { move: -2 }).rrBattle, { move: -2 });
});

test('the tag of a setting leaves the Note with the change, the card\'s other tags move with it, and everything else stays byte for byte', () => {
    const note = 'A sniper\'s shot.  \r\n<range: 3-9> <los: no> trailing words\r\n\t<area: cone 3>\r\n<cooldown: 6.5>\r\n<move: 2>\r\n\r\nKeep this line. <b>bold</b>\r\n';
    const skill = frozen({ id: 20, scope: 1, hitType: 2, note });
    // One field touched: its tag is gone, and the card's other tags of this record are its own settings now.
    const touched = T.change('shared', 'skill', skill, context, { range: { min: 2, max: 6 } });
    assert.equal(touched.note, 'A sniper\'s shot.  \r\n  trailing words\r\n<cooldown: 6.5>\r\n<move: 2>\r\n\r\nKeep this line. <b>bold</b>\r\n');
    assert.deepEqual(touched.rrBattle, { range: { min: 2, max: 6 }, area: { shape: 'cone', size: 3 }, los: false });
    // The other card's tag, a tag this kind of record has no field for, and every other byte are where they were.
    for (const kept of ['<cooldown: 6.5>', '<move: 2>', 'A sniper\'s shot.  \r\n', '\r\n\r\nKeep this line. <b>bold</b>\r\n']) assert.ok(touched.note.includes(kept), kept);
    // The record plays the same after the move as it showed before it, except for the one setting changed.
    const before = T.recordTactics(skill), after = T.recordTactics(Object.assign({}, skill, touched));
    assert.deepEqual(after, Object.assign({}, before, { range: { min: 2, max: 6 } }));
    assert.deepEqual(T.recordCombat(Object.assign({}, skill, touched)), { cooldown: 6.5 });
    // Set back to Automatic, the tag does not come back and the key is gone.
    const cleared = T.change('shared', 'skill', frozen(Object.assign({}, skill, touched)), context, { range: null });
    assert.deepEqual([cleared.note, cleared.rrBattle], [touched.note, { area: { shape: 'cone', size: 3 }, los: false }]);
    // The value the record gets anyway: no key, and no tag left to say otherwise.
    const same = T.change('shared', 'skill', skill, context, { range: { min: 1, max: 4 } });
    assert.deepEqual([same.note, same.rrBattle], [touched.note, { area: { shape: 'cone', size: 3 }, los: false }]);
    // The Action card moves its own tag and leaves the Tactical ones.
    const cool = T.change('action', 'skill', skill, context, { cooldown: 4 });
    assert.equal(cool.note, 'A sniper\'s shot.  \r\n<range: 3-9> <los: no> trailing words\r\n\t<area: cone 3>\r\n<move: 2>\r\n\r\nKeep this line. <b>bold</b>\r\n');
    assert.deepEqual(cool.rrBattle, { cooldown: 4 });
    // A second copy of a tag goes with the first: the game read the first.
    assert.deepEqual(T.change('shared', 'skill', { id: 2, scope: 1, hitType: 2, note: '<range: 2> and <range: 4>' }, context, { los: false }), { note: ' and ', rrBattle: { range: { min: 1, max: 2 }, los: false } });
    // A setting the record already has stands over its tag: the tag only leaves.
    const twice = T.change('shared', 'skill', { id: 2, scope: 1, hitType: 2, note: 'x\n<range: 2>\n<area: line 4>', rrBattle: { range: { min: 3, max: 8 } } }, context, { los: false });
    assert.deepEqual(twice, { note: 'x', rrBattle: { range: { min: 3, max: 8 }, area: { shape: 'line', size: 4 }, los: false } });
    // A tag the game reads nothing from is no tag of the card's: it stays.
    const odd = '<ai: reckless>\n<projectile: laser>\n<area: blob 2>\n< range: 3>';
    assert.deepEqual(T.change('tactical', 'enemy', { id: 1, note: odd + '\n<move: 2>' }, context, { jump: 2 }), { note: odd, rrBattle: { move: 2, jump: 2 } });
    assert.equal(T.change('shared', 'enemy', { id: 1, note: odd }, context, { ai: 'ranged' }).note, '<projectile: laser>\n<area: blob 2>\n< range: 3>', 'the Fights field set, the tag of its name leaves; the rest is not the card\'s');
    assert.equal(T.convert('enemy', { id: 1, note: odd }).note, odd, 'and a conversion leaves all of them');
    // Every kind of record, every card: a touch takes all of the card's tags and none of the other card's.
    const every = '<range: 2-5>\n<area: circle 2>\n<los: no>\n<move: 3>\n<jump: 2>\n<ai: support>\n<fire rate: 4>\n<magazine: 8>\n<reload: 1.5>\n<spread: 3>\n<combo: 4>\n<projectile: bolt>\n<cooldown: 6>\n<unit character: Evil, 2>';
    for (const kind of T.KINDS) {
        for (const card of T.cardsFor(kind)) {
            // (Comes back is a setting no tag says: nothing of it is in the Note to move.)
            const keys = T.ownKeys(card, kind).filter(key => key !== 'comesBack'), record = { id: 4, scope: 1, hitType: 2, wtypeId: 2, note: every };
            const first = keys[0], value = { range: null, move: null, fireRate: null, cooldown: null }[first];
            const done = T.change(card, kind, record, context, { [first]: value });
            const left = Object.assign({}, T.parseTags(done.note), T.parseCombat(done.note)), sheet = T.recordCharacter({ note: done.note });
            if (sheet) left.character = sheet;
            const gone = Object.keys(Object.assign({}, T.parseTags(every), T.parseCombat(every), { character: 1 })).filter(key => left[key] === undefined);
            assert.deepEqual(gone.sort(), keys.slice().sort(), `${card} on ${kind}: the card's tags left the Note, the others stayed`);
            assert.deepEqual(Object.keys(done.rrBattle || {}).sort(), keys.filter(key => key !== first).sort(), `${card} on ${kind}: and are the record's own settings, but the one set back`);
        }
    }
});

test('a PTBS block is never rewritten: it is read under the record\'s settings, and nothing takes it out', () => {
    const note = 'Old game.\r\n' + PTBS + '\r\n<range: 5> after it';
    const skill = frozen({ id: 30, scope: 1, hitType: 2, note });
    assert.deepEqual(T.effective('skill', { id: 30, scope: 1, hitType: 2, note: PTBS }, context).range, { min: 0, max: 3 });
    // A change, a reset and a conversion keep the block byte for byte.
    const changed = T.change('shared', 'skill', skill, context, { range: { min: 1, max: 9 } });
    assert.deepEqual(changed, { note: 'Old game.\r\n' + PTBS + '\r\n after it', rrBattle: { range: { min: 1, max: 9 } } });
    assert.equal(T.reset('shared', 'skill', skill).note, 'Old game.\r\n' + PTBS + '\r\n after it');
    assert.deepEqual(T.convert('skill', skill), { note: 'Old game.\r\n' + PTBS + '\r\n after it', rrBattle: { range: { min: 1, max: 5 } }, moved: [{ key: 'range', tag: '<range: 5>', value: { min: 1, max: 5 } }], left: [] });
    // What only the block sets is not moved and not cleared: the card goes on reading it.
    const only = frozen({ id: 30, scope: 1, hitType: 2, note: PTBS });
    assert.deepEqual(T.convert('skill', only), { note: PTBS, rrBattle: undefined, moved: [], left: [] });
    assert.deepEqual(T.reset('shared', 'skill', only), { note: PTBS, rrBattle: undefined });
    assert.equal(T.differs(only, T.reset('shared', 'skill', only)), false);
    // The value the block gives is the one the record gets anyway: typing it sets nothing; another value stands over the block.
    assert.deepEqual(T.change('shared', 'skill', only, context, { range: { min: 0, max: 3 } }), { note: PTBS, rrBattle: undefined });
    const over = T.change('shared', 'skill', only, context, { range: { min: 1, max: 5 }, area: { shape: 'single', size: 0 } });
    assert.deepEqual(over, { note: PTBS, rrBattle: { range: { min: 1, max: 5 }, area: { shape: 'single' } } });
    assert.deepEqual(T.effective('skill', Object.assign({}, only, over), context).range, { min: 1, max: 5 });
    assert.deepEqual(T.change('shared', 'skill', Object.assign({}, only, over), context, { range: null, area: null }), { note: PTBS, rrBattle: undefined }, 'set back, the block is read again');
    // A tag typed inside a block cannot leave it: its value becomes the record's setting once, and the block is as it was.
    const inside = '<PTBS>\nscope: circle(3,0)\n<move: 9>\n</PTBS>';
    const first = T.convert('class', { id: 1, note: inside });
    assert.deepEqual([first.note, first.rrBattle, first.moved.length], [inside, { move: 9 }, 1]);
    assert.deepEqual(T.convert('class', { id: 1, note: first.note, rrBattle: first.rrBattle }).moved, [], 'and the second time there is nothing to do');
    // Several blocks, and a note that holds the character the stripper marks blocks with.
    const many = '\u0000 <PTBS>a</PTBS> <range: 2> <PTBS>b\n<range: 7></PTBS>\n<range: 4>\n\u0000\u0001';
    assert.equal(T.strip(many, /<range\s*:\s*(\d+)\s*(?:-\s*(\d+)\s*)?>/i), '\u0000 <PTBS>a</PTBS>  <PTBS>b\n<range: 7></PTBS>\n\u0000\u0001');
});

test('each card\'s Automatic takes out its own keys and its own tags, and leaves the other card\'s and every other line', () => {
    const note = 'Long barrel.\n<range: 3-9> <los: no>\n<fire rate: 1>\n<move: -1>\nKeep me.';
    const rifle = frozen({ id: 5, wtypeId: 3, note, rrBattle: { magazine: 5, projectile: 'rocket', area: { shape: 'line', size: 2 }, jump: 1, somethingElse: 1 } });
    assert.deepEqual(T.reset('action', 'weapon', rifle), { note: 'Long barrel.\n<range: 3-9> <los: no>\n<move: -1>\nKeep me.', rrBattle: { area: { shape: 'line', size: 2 }, jump: 1, somethingElse: 1 } });
    assert.deepEqual(T.reset('shared', 'weapon', rifle), { note: 'Long barrel.\n<fire rate: 1>\n<move: -1>\nKeep me.', rrBattle: { magazine: 5, projectile: 'rocket', jump: 1, somethingElse: 1 } });
    const withoutAction = Object.assign({}, rifle, T.reset('action', 'weapon', rifle));
    const withoutShared = Object.assign({}, withoutAction, T.reset('shared', 'weapon', withoutAction));
    const both = T.reset('tactical', 'weapon', withoutShared);
    assert.deepEqual(both, { note: 'Long barrel.\nKeep me.', rrBattle: { somethingElse: 1 } });
    assert.notEqual(T.reset('action', 'weapon', rifle).rrBattle, rifle.rrBattle);
    // A key a card has no field for on that kind of record is not its to clear.
    assert.deepEqual(T.reset('shared', 'skill', { note: 'x\n<move: 3>\n<range: 2>', rrBattle: { move: 3, range: { min: 1, max: 2 }, cooldown: 4 } }), { note: 'x\n<move: 3>', rrBattle: { move: 3, cooldown: 4 } });
    assert.deepEqual(T.reset('action', 'skill', { note: '<combo: 5>\n<cooldown: 4>', rrBattle: { combo: 5, cooldown: 4 } }), { note: '<combo: 5>', rrBattle: { combo: 5 } });
    assert.deepEqual(T.reset('tactical', 'class', { note: '<move: 5>\n<ai: ranged>', rrBattle: { ai: 'ranged', jump: 2 } }), { note: '<ai: ranged>', rrBattle: { ai: 'ranged' } }, 'a class has no Fights field');
    assert.deepEqual(T.reset('shared', 'enemy', { note: '<unit character: Evil, 2>\n<ai: ranged>', rrBattle: { move: 6, character: { name: 'Monster', index: 1 } } }), { note: '', rrBattle: { move: 6 } }, 'an enemy\'s picture is its card\'s');
    assert.deepEqual(T.reset('action', 'armor', { note: '<move: -1>\n<fire rate: 2>', rrBattle: { fireRate: 2 } }), { note: '<move: -1>\n<fire rate: 2>', rrBattle: { fireRate: 2 } }, 'an armor has no Action card');
    assert.deepEqual(T.ownKeys('shared', 'weapon'), ['range', 'area', 'los']);
    assert.deepEqual(T.ownKeys('action', 'weapon'), ['fireRate', 'magazine', 'reload', 'spread', 'combo', 'projectile']);
    assert.deepEqual([T.ownKeys('shared', 'skill'), T.ownKeys('action', 'item'), T.ownKeys('tactical', 'actor'), T.ownKeys('tactical', 'enemy'), T.ownKeys('action', 'enemy')],
        [['range', 'area', 'los'], ['cooldown'], ['move', 'jump'], ['move', 'jump'], []]);
    assert.equal(T.ownTags, T.ownKeys);
});

test('a conversion moves every tag the game reads on a kind of record, changes nothing in play, and finds nothing the second time', () => {
    const world = fightWorld({ tactical: true, action: true, look: true });
    const F = world.ReactorFight, A = F.Action, L = world.ReactorFightLook;
    const reading = record => [set(F.recordTactics(record)), set(A.settings(record)), plain(L.recordCharacter({ record: 'enemy', id: 1 }, record))];
    let moved = 0;
    for (const kind of T.KINDS) {
        const keys = [].concat(...T.cardsFor(kind).map(card => T.ownKeys(card, kind)));
        for (const note of NOTES) {
            for (const rrBattle of [undefined, { move: 6 }, { range: { min: 3, max: 8 }, cooldown: 2, character: { name: 'Evil', index: 5 } }, { somethingElse: 1 }]) {
                const record = frozen(rrBattle === undefined ? { id: 1, note } : { id: 1, note, rrBattle });
                const done = T.convert(kind, record), after = Object.assign({}, record, { note: done.note, rrBattle: done.rrBattle });
                const label = `${kind}: ${JSON.stringify(note)} with ${JSON.stringify(rrBattle)}`;
                assert.deepEqual(reading(after), reading(record), 'the game reads the same: ' + label);
                assert.deepEqual(T.convert(kind, after).moved, [], 'safe to run twice: ' + label);
                assert.deepEqual(T.convert(kind, after), { note: after.note, rrBattle: after.rrBattle, moved: [], left: [] });
                for (const each of done.moved) assert.ok(keys.includes(each.key) && note.includes(each.tag), label);
                // No tag of its cards is left outside a block, and no line but the tags' own changed.
                const outside = done.note.replace(/<PTBS>[\s\S]*?<\/PTBS>/gi, ''), left = Object.assign({}, T.parseTags(outside), T.parseCombat(outside), T.recordCharacter({ note: outside }) ? { character: 1 } : null);
                assert.deepEqual(keys.filter(key => left[key] !== undefined && !(typeof left[key] === 'number' && !Number.isFinite(left[key]))), [], 'no tag of its cards left: ' + label);
                if (done.moved.length) { moved++; assert.notEqual(done.rrBattle, record.rrBattle); } else assert.ok(done.note === note && done.rrBattle === record.rrBattle, 'nothing to move: the record as it is');
            }
        }
    }
    assert.ok(moved > 400, `${moved} records had something to move`);
    // One of each kind, spelled out.
    assert.deepEqual(T.convert('skill', { note: 'Burns.\n<range: 2-6>\n<area: cone 3>\n<los: no>\n<cooldown: 6.5>\n<move: 2>' }),
        { note: 'Burns.\n<move: 2>', rrBattle: { range: { min: 2, max: 6 }, area: { shape: 'cone', size: 3 }, los: false, cooldown: 6.5 },
            moved: [{ key: 'range', tag: '<range: 2-6>', value: { min: 2, max: 6 } }, { key: 'area', tag: '<area: cone 3>', value: { shape: 'cone', size: 3 } }, { key: 'los', tag: '<los: no>', value: false }, { key: 'cooldown', tag: '<cooldown: 6.5>', value: 6.5 }], left: [] });
    assert.deepEqual(T.convert('weapon', { note: '<range: 5>\n<area: all>\n<move: -1>\n<fire rate: 0.333333>\n<magazine: 24>\n<projectile: Bolt>\n<cooldown: 3>' }).rrBattle,
        { range: { min: 1, max: 5 }, area: { shape: 'all' }, move: -1, fireRate: 0.333333, magazine: 24, projectile: 'bolt' });
    assert.deepEqual(T.convert('enemy', { note: '<move: 0>\n<ai: Ranged>\n<unit character: Monster>\n<range: 3>' }), { note: '<range: 3>', rrBattle: { move: 0, ai: 'ranged', character: { name: 'Monster', index: 0 } },
        moved: [{ key: 'move', tag: '<move: 0>', value: 0 }, { key: 'ai', tag: '<ai: Ranged>', value: 'ranged' }, { key: 'character', tag: '<unit character: Monster>', value: { name: 'Monster', index: 0 } }], left: [] });
    assert.deepEqual(T.convert('actor', { note: '<move: 6>\n<jump: 2>\n<ai: support>\n<unit character: Evil, 2>' }), { note: '<unit character: Evil, 2>', rrBattle: { move: 6, jump: 2, ai: 'support' },
        moved: [{ key: 'move', tag: '<move: 6>', value: 6 }, { key: 'jump', tag: '<jump: 2>', value: 2 }, { key: 'ai', tag: '<ai: support>', value: 'support' }], left: [] }, 'an actor\'s picture is its own sheet: the tag is not the game\'s to read');
    assert.deepEqual(T.convert('state', { note: '<move: -2>' }).rrBattle, { move: -2 });
    assert.deepEqual(T.convert('armor', { note: 'Heavy.\n<move: -1> <jump: -1>' }), { note: 'Heavy.', rrBattle: { move: -1, jump: -1 }, moved: [{ key: 'move', tag: '<move: -1>', value: -1 }, { key: 'jump', tag: '<jump: -1>', value: -1 }], left: [] });
    // A tag the record's own setting already stands over only leaves the Note.
    assert.deepEqual(T.convert('class', { note: '<move: 3>', rrBattle: { move: 5 } }), { note: '', rrBattle: { move: 5 }, moved: [{ key: 'move', tag: '<move: 3>', value: undefined }], left: [] });
});

test('put writes an answer onto a record, and a record nothing was asked of is not written to', () => {
    const record = { id: 3, name: 'Fire', note: 'Burns.\n<range: 2-6>' };
    const before = JSON.stringify(record);
    // Reading, summarizing and asking what a change would give change nothing.
    T.recordTactics(record); T.recordCombat(record); T.recordCharacter(record); T.own(record); T.sourceOf(record, 'range');
    T.effective('skill', record, context); T.summarize('shared', 'skill', record, context); T.summarize('action', 'skill', record, context); T.unitStats('actor', record, context);
    const asked = T.change('shared', 'skill', record, context, { los: false });
    T.reset('shared', 'skill', record); T.convert('skill', record);
    assert.equal(JSON.stringify(record), before);
    assert.deepEqual(Object.keys(record), ['id', 'name', 'note'], 'not even an empty rrBattle');
    assert.equal(T.differs(record, asked), true);
    assert.equal(T.put(record, asked), record);
    assert.deepEqual(record, { id: 3, name: 'Fire', note: 'Burns.', rrBattle: { range: { min: 2, max: 6 }, los: false } });
    assert.equal(record.rrBattle, asked.rrBattle, 'the new object itself');
    assert.equal(T.differs(record, asked), false);
    T.put(record, T.reset('shared', 'skill', record));
    assert.deepEqual([record, Object.keys(record)], [{ id: 3, name: 'Fire', note: 'Burns.' }, ['id', 'name', 'note']], 'emptied, the key is gone');
    // A record with no Note key gets none from an answer that changes no Note.
    const bare = { id: 4 };
    T.put(bare, T.change('tactical', 'state', bare, context, { move: -2 }));
    assert.deepEqual([bare, Object.keys(bare)], [{ id: 4, rrBattle: { move: -2 } }, ['id', 'rrBattle']]);
    // The files and data keys of the eight kinds of record.
    assert.deepEqual(Object.keys(T.FILES).sort(), ['Actors.json', 'Armors.json', 'Classes.json', 'Enemies.json', 'Items.json', 'Skills.json', 'States.json', 'Weapons.json']);
    assert.deepEqual(Object.values(T.FILES).sort(), T.KINDS.slice().sort());
    assert.deepEqual(T.KINDS.map(kind => T.DATA_KEYS[kind]), ['skills', 'items', 'weapons', 'armors', 'states', 'actors', 'classes', 'enemies']);
    assert.ok(require('node:fs').existsSync(path.join(repo, 'runtime', 'reactor_fight_look.js')));
});

//-----------------------------------------------------------------------------
// The other readers of these settings in the editor.

test('Battle Setup\'s check, the scripts that use it and an event\'s Image box read an enemy\'s picture by the game\'s rule: its own setting first', () => {
    const C = require('../src/utils/BattleCheck.js');
    const EventPageEditor = require('../src/event/EventPageEditor.js');
    const L = require('../src/utils/FightLook.js');
    const fs = require('node:fs');
    assert.equal(fs.readFileSync(path.join(repo, 'editor', 'src', 'utils', 'FightLook.js'), 'utf8'), fs.readFileSync(path.join(repo, 'runtime', 'reactor_fight_look.js'), 'utf8'), 'the editor\'s rule is the game\'s file');
    const enemies = [null,
        { id: 1, name: 'Tagged', battlerName: '', note: '<unit character: Monster, 3>' },
        { id: 2, name: 'Set', battlerName: '', note: '', rrBattle: { character: { name: 'Evil', index: 5 } } },
        { id: 3, name: 'Both', battlerName: 'Raider', note: '<unit character: Monster, 3>', rrBattle: { character: { name: 'Evil', index: 12 } } },
        { id: 4, name: 'Emptied', battlerName: 'Raider', note: '', rrBattle: { character: { name: '' }, move: 3 } },
        { id: 5, name: 'Bare', battlerName: '', note: '', rrBattle: { move: 3 } }];
    const page = { conditions: {}, image: { tileId: 0, characterName: '', characterIndex: 0, direction: 2, pattern: 1 }, priorityType: 1, through: false, trigger: 0, moveType: 0, list: [{ code: 0, indent: 0, parameters: [] }] };
    const event = id => ({ id, name: 'EV', note: '', x: 2, y: 2, pages: [page], rrUnit: { team: 'enemy', record: 'enemy', id } });
    const map = { id: 1, width: 20, height: 15, tilesetId: 1, note: '', data: new Array(20 * 15 * 6).fill(1), events: [null] };
    const lookups = { system: { partyMembers: [1], optSideView: false }, actors: [null], enemies, tilesets: [null, { id: 1, flags: [0x10, 0] }] };
    const checked = id => { const unit = event(id); return C.lookOf(map, unit, C.unitOf(unit), lookups); };
    assert.deepEqual([1, 2, 3, 4, 5].map(checked), ['character', 'character', 'character', 'battler', 'figure']);
    // The Image box of an event that is a unit of that enemy.
    const tx = (text, params) => text.replace(/\{(\w+)\}/g, (token, key) => (key in params ? String(params[key]) : token));
    const boxed = id => { const look = EventPageEditor.lookOf({ team: 'enemy', record: 'enemy', id }, enemies[id], { colors: {}, tx }); return [look.kind, look.characterName, look.characterIndex]; };
    assert.deepEqual([1, 2, 3, 4, 5].map(boxed), [['character', 'Monster', 3], ['character', 'Evil', 5], ['character', 'Evil', 7], ['picture', undefined, undefined], ['figure', undefined, undefined]]);
    // Both give what the game's rule gives.
    for (const record of enemies.slice(1)) {
        const sheet = L.recordCharacter({ record: 'enemy', id: record.id }, record);
        assert.equal(checked(record.id) === 'character', !!sheet, record.name);
        assert.deepEqual(boxed(record.id).slice(1), sheet ? [sheet.characterName, sheet.characterIndex] : [undefined, undefined], record.name);
        assert.deepEqual(T.recordCharacter(record), sheet, record.name);
    }
    // Neither reads the tag by itself any more, and the scripts read through the check.
    const source = file => fs.readFileSync(path.join(repo, 'editor', file), 'utf8');
    assert.match(source('src/utils/BattleCheck.js'), /const sheet = rule \? rule\.recordCharacter\(unit, record\) : null;/);
    assert.match(source('src/event/EventPageEditor.js'), /const sheet = actor \|\| !rule \? null : rule\.recordCharacter\(unit, record\);/);
    assert.doesNotMatch(source('src/event/EventPageEditor.js'), /unit\\s\*character/);
    for (const script of ['build-scripts/validate-battle.cjs', 'build-scripts/place-unit.cjs']) {
        assert.doesNotMatch(source(script), /unit\\s\*character|<range|<move|fire\\s\*rate|\.note\b[^\n]*<(?:ai|area|los)/, script + ' reads no battle tag of a record by itself');
    }
    assert.match(source('build-scripts/validate-battle.cjs'), /BattleCheck: require\(source\('utils', 'BattleCheck\.js'\)\)/);
    // The scan that decides which battle cards a project needs reads the maps for the modes they name, and no setting of a record.
    const sections = source('src/utils/DatabaseSections.js');
    assert.doesNotMatch(sections.slice(sections.indexOf('const MAP_MODES'), sections.indexOf('// Layout.')), /<range|<move|<area|fire\\s\*rate|<cooldown|unit\\s\*character|rrBattle/);
});

test('the look of an enemy\'s picture row: on the form\'s grid, in theme tokens', () => {
    const css = require('node:fs').readFileSync(path.join(repo, 'editor', 'css', 'styles.css'), 'utf8');
    const rules = css.slice(css.indexOf('/* Database battle cards: an enemy\'s picture on the map'), css.indexOf('/* End of an enemy\'s picture on the map. */'));
    assert.ok(rules.length > 500, 'the row\'s rules are where the test looks');
    assert.doesNotMatch(rules, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'no color of its own');
    assert.match(rules, /\.rr-tactics-sprite \{ flex: 0 0 48px; width: 48px; height: 48px; border: 1px solid var\(--color-border\);/);
    assert.match(rules, /\.rr-tactics-look-name \{ flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;/, 'the button follows the name; a long sheet name is cut, the buttons stay');
    // The line under the row stands in the fields' column, also where a narrow form is one column.
    assert.match(rules, /\.db-form > \.rr-tactics-hint \{ grid-column: -2 \/ -1;/);
    assert.match(css, /\.rr-tactics-form > \[hidden\] \{ display: none; \}/, 'and takes no room while it has nothing to say');
});

//-----------------------------------------------------------------------------
// After the test round: line ends, tags over two lines, blank lines, limits, the tags a project's plugins read.

const RANGE = /<range\s*:\s*(\d+)\s*(?:-\s*(\d+)\s*)?>/i;

test('a tag\'s line leaves with its whole line end: a Note that uses CRLF keeps CRLF, and no half of one is left', () => {
    const without = (note, kind = 'skill') => T.convert(kind, { note }).note;
    assert.equal(without('Words\r\n<range: 2-5>'), 'Words', 'the last line: the line end before it goes too, both bytes of it');
    assert.equal(without('First\r\n<range: 2-5>\r\n<area: circle 2>\r\nLast\r\n'), 'First\r\nLast\r\n');
    assert.equal(without('<range: 2-5>\r\nLast'), 'Last');
    assert.equal(without('A\r\nB <range: 3> words\r\nC\r\n'), 'A\r\nB  words\r\nC\r\n', 'a tag among words: the line and its end stay');
    // Each kept line keeps the end it had, in a Note that mixes them.
    assert.equal(without('Mixed\n<range: 2>\r\nends\r\nstay\n'), 'Mixed\nends\r\nstay\n');
    assert.equal(without('Old Mac\r<range: 2>\rline'), 'Old Mac\rline');
    // Whatever is done to a record, no CR is ever left without its LF, nor an LF added.
    for (const note of ['Words\r\n<range: 2-5>', '<range: 2>\r\n\r\n<area: cone 3>\r\n', 'a\r\n<move: 3>\r\nb\r\n<cooldown: 2>', 'x\r\n\r\n<los: no>\r\n\r\ny\r\n', '\r\n<range: 4>\r\n']) {
        for (const kind of T.KINDS) {
            const done = T.convert(kind, { note }).note;
            assert.doesNotMatch(done, /\r(?!\n)|(?<!\r)\n/, `${kind}: ${JSON.stringify(note)} -> ${JSON.stringify(done)}`);
            for (const card of T.cardsFor(kind)) assert.doesNotMatch(T.reset(card, kind, { note }).note, /\r(?!\n)|(?<!\r)\n/);
        }
    }
    assert.equal(T.change('shared', 'skill', { id: 2, scope: 1, hitType: 2, note: 'First\r\n<range: 2-5>\r\n<area: circle 2>\r\nLast\r\n' }, context, { range: { min: 1, max: 6 } }).note, 'First\r\nLast\r\n');
});

test('a tag over two lines is taken out like any other: what the game reads, a change can take', () => {
    const world = fightWorld({ tactical: true, action: true }), F = world.ReactorFight;
    for (const [note, left] of [['<range:\n 4>', ''], ['Top\n<range:\r\n 2-6>\nEnd', 'Top\nEnd'], ['a <area:\n cone 3> b', 'a  b'], ['<range: 2\n>\n<los:\n no>', ''], ['x\n<range\n: 4>\ny', 'x\ny']]) {
        const read = F.recordTactics({ note });
        assert.ok(read && (read.range || read.area || read.los !== null), 'the game reads ' + JSON.stringify(note));
        assert.deepEqual(plain(T.recordTactics({ note })), set(read), 'and so does the card');
        const done = T.convert('skill', { note });
        assert.equal(done.note, left, JSON.stringify(note));
        assert.deepEqual(plain(T.recordTactics({ note: done.note, rrBattle: done.rrBattle })), set(read), 'moved, it plays the same');
        assert.equal(T.reset('shared', 'skill', { note }).note, left, 'Automatic takes it out');
        assert.equal(T.differs({ note }, T.reset('shared', 'skill', { note })), true, 'so the chip has something to take');
    }
    assert.equal(T.strip('one <range: 2> two\n<range:\n3>\nthree', RANGE), 'one  two\nthree');
});

test('blank lines round a tag\'s line do not pile up, a Note of nothing but blank lines is empty, and words and spacing are not touched', () => {
    const without = note => T.convert('skill', { note }).note;
    // Only tags and blank lines: nothing is left.
    for (const note of ['<range: 2>\n\n<area: circle 1>\n', '\n<range: 2>\n\n\n', '<range: 2>\n\n<area: circle 1>', '   \n<range: 2>\n \t \n<cooldown: 3>\n\n', '<los: no>\r\n\r\n<range: 3>\r\n']) assert.equal(without(note), '', JSON.stringify(note));
    // Between kept lines: the wider of the two gaps stays.
    assert.equal(without('Words\n\n<range: 2>\n\nMore'), 'Words\n\nMore');
    assert.equal(without('Words\n\n\n<range: 2>\n\nMore'), 'Words\n\n\nMore');
    assert.equal(without('Words\n\n<range: 2>\n\n\nMore'), 'Words\n\n\nMore');
    assert.equal(without('Words\n<range: 2>\n\nMore'), 'Words\n\nMore', 'the one blank line the user left stays');
    assert.equal(without('Words\n\n<range: 2>\nMore'), 'Words\n\nMore');
    assert.equal(without('Words\n<range: 2>\nMore'), 'Words\nMore');
    // Tags' lines with only blank lines between them are one gap.
    assert.equal(without('Words\n\n<range: 2>\n\n<area: cone 3>\n\nMore'), 'Words\n\nMore');
    assert.equal(without('Words\n<range: 2>\n\n<area: cone 3>\nMore'), 'Words\nMore');
    // At the start and at the end of a Note the blank lines that led to the tag go with it.
    assert.equal(without('<range: 2>\n\nWords'), 'Words');
    assert.equal(without('Words\n\n<range: 2>'), 'Words');
    assert.equal(without('Words\n\n<range: 2>\n'), 'Words\n');
    assert.equal(without('<range: 2>\n\n<area: cone 3>\n\nWords\n'), 'Words\n');
    // The user's own: blank lines that never touched a tag, spaces inside a line, a tag cut out of a sentence.
    assert.equal(without('\n\nWords\n\n\nMore\n<range: 2>\nEnd\n\n'), '\n\nWords\n\n\nMore\nEnd\n\n');
    assert.equal(without('A sentence with <range: 2> in it.   \n\tindented'), 'A sentence with  in it.   \n\tindented');
    assert.equal(without('\n\nOnly blank lines and words\n\n'), '\n\nOnly blank lines and words\n\n', 'nothing to take: not a byte changes');
    assert.equal(T.reset('shared', 'skill', { note: ' \n\n' }).note, ' \n\n', 'a Note that was only blank lines and had no tag is left as it is');
    // A PTBS block is no blank line and is never one of these.
    const block = '<PTBS>\nscope: circle(3,0)\n</PTBS>';
    assert.equal(without(block + '\n\n<range: 2>\n'), block + '\n');
    assert.equal(without('<range: 2>\n\n' + block), block);
});

test('a number set through a card is held to its field\'s limits; what a tag says is read and moved as it is', () => {
    const skill = { id: 9, scope: 1, hitType: 2, note: '' };
    assert.deepEqual(T.change('shared', 'skill', skill, context, { range: { min: 1, max: 999 } }).rrBattle, { range: { min: 1, max: 30 } });
    assert.deepEqual(T.change('shared', 'skill', skill, context, { range: { min: 99, max: 999 } }).rrBattle, { range: { min: 30, max: 30 } });
    assert.deepEqual(T.change('shared', 'skill', skill, context, { area: { shape: 'circle', size: 99 } }).rrBattle, { area: { shape: 'circle', size: 20 } });
    assert.deepEqual(T.change('tactical', 'enemy', { id: 1, note: '' }, context, { move: 999, jump: 99 }).rrBattle, { move: 30, jump: 20 });
    assert.deepEqual(T.change('tactical', 'actor', { id: 1, note: '' }, context, { move: -5, jump: -1 }).rrBattle, { move: 0, jump: 0 });
    assert.deepEqual(T.change('tactical', 'armor', { id: 1, note: '' }, context, { move: 99, jump: -99 }).rrBattle, { move: 20, jump: -20 });
    assert.deepEqual(T.change('tactical', 'weapon', { id: 1, wtypeId: 2, note: '' }, context, { move: -99 }).rrBattle, { move: -20 });
    assert.deepEqual(T.change('action', 'weapon', { id: 1, wtypeId: 3, note: '' }, context, { fireRate: 99, magazine: 99999, reload: 99, spread: 99, combo: 9 }).rrBattle, { fireRate: 20, magazine: 999, reload: 30, spread: 45, combo: 5 });
    assert.deepEqual(T.change('action', 'skill', { note: '' }, context, { cooldown: 99999 }).rrBattle, { cooldown: 600 });
    // The limits are the fields' own: the markup and the store use one table.
    const limit = (html, cls) => { const field = new RegExp(`class="database-field-value ${cls}"[^>]*min="(-?\\d+)" max="(-?\\d+)"`).exec(html); return [Number(field[1]), Number(field[2])]; };
    assert.deepEqual([limit(T.cardHtml('shared', 'skill'), 'rr-tactics-max'), limit(T.cardHtml('shared', 'skill'), 'rr-tactics-size')], [T.LIMITS.reach, T.LIMITS.size]);
    assert.deepEqual([limit(T.cardHtml('tactical', 'enemy'), 'rr-tactics-move'), limit(T.cardHtml('tactical', 'enemy'), 'rr-tactics-jump')], [T.LIMITS.unitMove, T.LIMITS.unitJump]);
    assert.deepEqual([limit(T.cardHtml('tactical', 'armor'), 'rr-tactics-move'), limit(T.cardHtml('tactical', 'armor'), 'rr-tactics-jump')], [T.LIMITS.bonus, T.LIMITS.bonus]);
    for (const key of ['fireRate', 'magazine', 'reload', 'spread', 'combo']) assert.deepEqual(limit(T.cardHtml('action', 'weapon'), 'rr-combat-' + key), T.LIMITS[key], key);
    assert.deepEqual(limit(T.cardHtml('action', 'item'), 'rr-combat-cooldown'), T.LIMITS.cooldown);
    assert.deepEqual(T.LIMITS, { reach: [0, 30], size: [1, 20], unitMove: [0, 30], unitJump: [0, 20], bonus: [-20, 20], fireRate: [0, 20], magazine: [0, 999], reload: [0, 30], spread: [0, 45], combo: [0, 5], cooldown: [0, 600] });
    // A tag typed by hand or a script's own number is not the card's to bound: it is read, and moved, as the game plays it.
    const far = { id: 9, scope: 1, hitType: 2, note: '<range: 2-40>\n<area: circle 25>\n<cooldown: 900>' };
    assert.deepEqual(T.effective('skill', far, context).range, { min: 2, max: 40 });
    assert.deepEqual(T.convert('skill', far).rrBattle, { range: { min: 2, max: 40 }, area: { shape: 'circle', size: 25 }, cooldown: 900 });
    assert.deepEqual(T.change('shared', 'skill', far, context, { los: false }).rrBattle, { range: { min: 2, max: 40 }, area: { shape: 'circle', size: 25 }, los: false }, 'the card\'s other tags move as they are');
    // The picture holds only the cells it has room for, whatever the reach says.
    const huge = T.picture(T.effective('skill', { id: 9, scope: 1, hitType: 2, note: '<range: 5000>' }, context), null);
    assert.deepEqual([huge.radius, huge.reach.length < 4000, huge.reach.every(cell => Math.abs(cell.x) + Math.abs(cell.y) <= 31)], [31, true, true]);
    const fits = T.picture(T.effective('skill', { id: 9, scope: 1, hitType: 2, note: '<range: 2-9>' }, context), null);
    assert.equal(fits.reach.length, T.reachCells(2, 9).length, 'a reach that fits is drawn whole');
    const wide = T.picture(T.effective('skill', { id: 9, scope: 1, hitType: 2, note: '<range: 3-40>' }, context), null);
    assert.deepEqual(wide.reach.map(cell => cell.x + ',' + cell.y).sort(), T.reachCells(3, 40).filter(cell => Math.abs(cell.x) <= 31 && Math.abs(cell.y) <= 31 && Math.abs(cell.x) + Math.abs(cell.y) <= 31).map(cell => cell.x + ',' + cell.y).sort(),
        'and of a longer one, the cells nearest the unit');
});

test('which tags a plugin reads: a note-tag pattern for the tag\'s own name, in code or help text, or the record\'s meta', () => {
    const fs = require('node:fs');
    // The real lines.
    const restrictions = fs.readFileSync(path.join(repo, 'editor', 'src', 'legacy', 'plugins', 'RR_YanflySkillRestrictions.js'), 'utf8');
    const line117 = restrictions.split('\n')[116];
    assert.ok(line117.includes('/<(?:COOL_DOWN|cooldown):[ ](\\d+)>/i'), 'line 117 is the pattern');
    assert.deepEqual(T.tagsRead(line117), ['cooldown']);
    assert.deepEqual(T.tagsRead(restrictions), ['cooldown'], 'and of its other tags (<cooldown rate:>, <reload skill:>, <change cooldown:>) none is one of the cards\'');
    // Yanfly's Skill Cooldowns, as it stands in a Star Shift project: its line 499 and its help text.
    const yanfly = '                if (line.match(/<(?:COOLDOWN):[ ](\\d+)>/i)) {';
    assert.deepEqual(T.tagsRead(yanfly), ['cooldown']);
    assert.deepEqual(T.tagsRead(' *   <Cooldown: x>'), ['cooldown']);
    const bundled = path.join(repo, 'template', 'Star Shift Rebellion', 'js', 'plugins', 'YEP_X_SkillCooldowns.js');
    if (fs.existsSync(bundled)) {
        const source = fs.readFileSync(bundled, 'utf8');
        assert.ok(source.split('\n').some(line => line === yanfly), 'the line above is the file\'s own');
        assert.deepEqual(T.tagsRead(source), ['cooldown'], 'the whole file: <Skill x Cooldown:>, <Global Cooldown:>, <Cooldown Steps:> are other tags');
    }
    // What reads a tag.
    for (const [source, keys] of [
        ['/<range\\s*:\\s*(\\d+)\\s*(?:-\\s*(\\d+)\\s*)?>/i', ['range']], ['/<(?:cooldown|cd)\\s*:\\s*(\\d+)>/i', ['cooldown']], ['"<move: 5>"', ['move']],
        ['/<(?:FIRE_RATE|fire rate):[ ](\\d+)>/i', ['fireRate']], ['<unit character: Name, 2>', ['character']], ['/<[ ]*AI[ ]*:[ ]*(\\w+)>/i', ['ai']],
        ['const cd = item.meta.cooldown;', ['cooldown']], ['obj.meta[\'fire rate\'] || obj.meta["Range"]', ['fireRate', 'range']], ['skill.meta . jump', ['jump']],
        ['/<(?:AREA):[ ](.*)>/i.test(n); /<los: (yes|no)>/; /<(?:MAGAZINE|mag):[ ](\\d+)>/i; /<reload:[ ](\\d+)>/; /<spread: \\d+>/; /<combo: \\d+>/; /<projectile: \\w+>/', ['area', 'los', 'magazine', 'reload', 'spread', 'combo', 'projectile']]
    ]) assert.deepEqual(T.tagsRead(source).slice().sort(), keys.slice().sort(), source);
    // What does not: a longer tag with the word in it, a comparison, markup, a name inside another name.
    for (const source of ['<aoe range: x>', '/<(?:AOE_RANGE|aoe range):[ ](\\d+)>/i', '<cooldown rate: 50%>', '/<(?:COOL_DOWN_RATE|cooldown rate):[ ](\\d+)([%％])>/i', '<Skill 3 Cooldown: +2>',
        '/<(?:SKILL)[ ](\\d+)[ ](?:COOLDOWN):[ ](\\d+)>/i', '<AI Level: 80>', '<move character: x>', '/<move[-_ ]character:\\s*(-?\\d+)\\s*>/', '<Mini Label Range: x>', '<Hero Combo Name: text>',
        'if (i < range ? a : b > c) {}', 'a<range?b:c>d', 'ok = cond ? i<range : j>limit;', 'cond ? i < range : j > 0', 'list[i]<move : rest>0', 'f(x)<jump: y>z', 'for (var i = 0; i < move; i++) { x ? y : z > 1 }', '<input type="range" style="width: 5px">', '<b>Range:</b>',
        'this.meta.ranged', 'data.metaRange', 'x.meta.cooldownRate', '\'<\' + range + \': \' + n + \'>\'', '<cooldown>', 'cooldown: 5', '']) assert.deepEqual(T.tagsRead(source), [], source);
    // The names of the plugins a list has switched on, in its order.
    const list = 'var $plugins =\n[\n{"name":"A","status":true,"description":"","parameters":{}},\n{"name":"B","status":false},\n{"name":"dir/C","status":true},\n{"name":"","status":true},\n{"status":true},\nnull\n];\n';
    assert.deepEqual(T.enabledPlugins(list), ['A', 'dir/C']);
    assert.deepEqual([T.enabledPlugins('var $plugins = [ not json ];'), T.enabledPlugins(''), T.enabledPlugins(null), T.enabledPlugins('const $plugins = [];')], [[], [], [], []]);
    assert.deepEqual(T.enabledPlugins('// Generated by RPG Reactor Plugin Manager\n\nvar $plugins =\n[\n    {\n        "name": "X",\n        "status": true\n    }\n];\n'), ['X']);
});

test('a project\'s own enabled plugins are read once, their tags stay through a change, a reset and a conversion, and the Demo has none', async () => {
    const fs = require('node:fs'), os = require('node:os');
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-tactics-plugins-'));
    try {
        fs.mkdirSync(path.join(folder, 'js', 'plugins', 'sub'), { recursive: true });
        const write = (name, source) => fs.writeFileSync(path.join(folder, 'js', 'plugins', name + '.js'), source);
        write('First', '/<(?:COOLDOWN):[ ](\\d+)>/i');
        write('Second', '/<cooldown: (\\d+)>/; item.meta.range');
        write('Off', '/<move: (\\d+)>/');
        write('sub/Deep', '<area: x>');
        const manifest = names => 'var $plugins =\n' + JSON.stringify(names.map(([name, status]) => ({ name, status, description: '', parameters: {} }))) + ';\n';
        fs.writeFileSync(path.join(folder, 'js', 'reactor_plugins.js'), manifest([['Second', true], ['First', true], ['Off', false], ['Missing', true], ['sub/Deep', true]]));
        // A file in js/plugins that no list names, and the engine's own files, are not plugins of the project.
        write('Unlisted', '/<jump: (\\d+)>/');
        fs.writeFileSync(path.join(folder, 'js', 'reactor_fight_tactical.js'), '/<range\\s*:\\s*(\\d+)>/i; /<move\\s*:\\s*(\\d+)>/i; /<jump: (\\d+)>/');
        assert.deepEqual(T.scanPluginTags(folder), { cooldown: 'Second', range: 'Second', area: 'sub/Deep' }, 'each tag with the first plugin of the list that reads it');
        // The cards' way: once for the project, the files read with the page free between them.
        const scan = T.pluginTags(folder);
        assert.equal(scan.tags, null, 'not known at once');
        assert.deepEqual(await scan.ready, { cooldown: 'Second', range: 'Second', area: 'sub/Deep' });
        assert.deepEqual(scan.tags, { cooldown: 'Second', range: 'Second', area: 'sub/Deep' });
        const reads = [], real = fs.promises.readFile;
        fs.promises.readFile = function(file) { reads.push(String(file)); return real.apply(this, arguments); };
        try {
            for (let again = 0; again < 20; again++) assert.equal(T.pluginTags(folder), scan, 'asked again (a record clicked): the same answer');
            assert.deepEqual(reads, [], 'and no file is read again');
            // The list saved again (a plugin switched off): read once more.
            await new Promise(resolve => setTimeout(resolve, 15));
            fs.writeFileSync(path.join(folder, 'js', 'reactor_plugins.js'), manifest([['Second', false], ['First', true], ['Off', true]]) + '\n');
            const next = T.pluginTags(folder);
            assert.notEqual(next, scan);
            assert.deepEqual(await next.ready, { cooldown: 'First', move: 'Off' });
            assert.ok(reads.length >= 3 && reads.every(file => !file.includes('Second') && !file.includes('Unlisted')), 'only the list and the plugins it has switched on');
        } finally { fs.promises.readFile = real; }
        // No folder, no list: no such tags, known at once.
        assert.deepEqual([T.pluginTags('').tags, T.pluginTags(path.join(folder, 'nowhere')).tags, T.scanPluginTags(path.join(folder, 'nowhere')), T.scanPluginTags('')], [{}, {}, {}, {}]);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }

    // What staying means, in a project where a plugin reads <cooldown:> and another <range:>.
    const keep = Object.assign({ pluginTags: { cooldown: 'YEP_X_SkillCooldowns', range: 'Some_Tactics' } }, context);
    const skill = frozen({ id: 20, scope: 1, hitType: 2, note: 'Burns.\r\n<Cooldown: 5>\r\n<range: 2-6>\r\n<area: cone 3>\r\nEnd' });
    // A change writes the setting (the game reads it first) and leaves the plugin's tag; the card's other tags move as ever.
    const cooled = T.change('action', 'skill', skill, keep, { cooldown: 8 });
    assert.deepEqual(cooled, { note: skill.note, rrBattle: { cooldown: 8 } });
    assert.deepEqual(T.recordCombat(Object.assign({}, skill, cooled)), { cooldown: 8 }, 'the setting stands over the tag');
    const reached = T.change('shared', 'skill', skill, keep, { range: { min: 1, max: 9 } });
    assert.deepEqual(reached, { note: 'Burns.\r\n<Cooldown: 5>\r\n<range: 2-6>\r\nEnd', rrBattle: { range: { min: 1, max: 9 }, area: { shape: 'cone', size: 3 } } }, 'the area\'s tag, which no plugin reads, moved');
    // The value the tag gives is the one the record gets anyway: no setting is kept for it.
    assert.deepEqual(T.change('action', 'skill', skill, keep, { cooldown: 5 }), { note: skill.note, rrBattle: undefined });
    // Automatic takes the setting and leaves the tag, which is then read again.
    const held = frozen(Object.assign({}, skill, cooled));
    const automatic = T.change('action', 'skill', held, keep, { cooldown: null });
    assert.deepEqual(automatic, { note: skill.note, rrBattle: undefined });
    assert.deepEqual(T.reset('action', 'skill', held, keep), { note: skill.note, rrBattle: undefined });
    assert.equal(T.cooldownOf('skill', Object.assign({}, skill, automatic)).cooldown, 5);
    assert.equal(T.differs(skill, T.reset('action', 'skill', skill, keep)), false, 'with only the plugin\'s tag there is nothing the chip could take');
    assert.deepEqual(T.reset('shared', 'skill', held, keep), { note: 'Burns.\r\n<Cooldown: 5>\r\n<range: 2-6>\r\nEnd', rrBattle: { cooldown: 8 } });
    // A conversion moves the rest and names what it left.
    assert.deepEqual(T.convert('skill', skill, keep), { note: 'Burns.\r\n<Cooldown: 5>\r\n<range: 2-6>\r\nEnd', rrBattle: { area: { shape: 'cone', size: 3 } },
        moved: [{ key: 'area', tag: '<area: cone 3>', value: { shape: 'cone', size: 3 } }],
        left: [{ key: 'range', tag: '<range: 2-6>', plugin: 'Some_Tactics' }, { key: 'cooldown', tag: '<Cooldown: 5>', plugin: 'YEP_X_SkillCooldowns' }] });
    assert.deepEqual(T.convert('skill', { note: '<cooldown: 5>' }, keep), { note: '<cooldown: 5>', rrBattle: undefined, moved: [], left: [{ key: 'cooldown', tag: '<cooldown: 5>', plugin: 'YEP_X_SkillCooldowns' }] });
    // Without such a plugin everything is as it was: the same calls with no plugin tags.
    assert.deepEqual(T.change('action', 'skill', skill, context, { cooldown: 8 }), { note: 'Burns.\r\n<range: 2-6>\r\n<area: cone 3>\r\nEnd', rrBattle: { cooldown: 8 } });
    assert.deepEqual(T.reset('action', 'skill', skill), { note: 'Burns.\r\n<range: 2-6>\r\n<area: cone 3>\r\nEnd', rrBattle: undefined });
    // The bundled Demo, where it is on disk: none of its enabled plugins reads a tag of the cards.
    const demo = path.join(repo, 'template', 'Demo');
    if (require('node:fs').existsSync(path.join(demo, 'js', 'reactor_plugins.js'))) assert.deepEqual(T.scanPluginTags(demo), {}, 'the Demo\'s cards behave as before');
});

test('the checker and the validate script say when an enemy\'s picture on the map names a sheet the project does not have', () => {
    const C = require('../src/utils/BattleCheck.js');
    const V = require('../build-scripts/validate-battle.cjs');
    const enemies = [null,
        { id: 1, name: 'Set', battlerName: 'Raider', note: '', rrBattle: { character: { name: 'Evil', index: 5 } } },
        { id: 2, name: 'Tagged', battlerName: '', note: '<unit character: Monster, 3>' },
        { id: 3, name: 'Plain', battlerName: 'Raider', note: '' }];
    const page = { conditions: {}, image: { tileId: 0, characterName: '', characterIndex: 0, direction: 2, pattern: 1 }, priorityType: 1, through: false, trigger: 0, moveType: 0, list: [{ code: 0, indent: 0, parameters: [] }] };
    const event = (id, enemy) => ({ id, name: 'EV' + id, note: '', x: 1 + id, y: 2, pages: [page], rrUnit: { team: 'enemy', record: 'enemy', id: enemy } });
    const map = { id: 1, width: 20, height: 15, tilesetId: 1, note: '', data: new Array(20 * 15 * 6).fill(1), events: [null, event(1, 1), event(2, 2), event(3, 3), event(4, 1)] };
    const lookups = files => ({ system: { partyMembers: [1], optSideView: false }, actors: [null, { id: 1, name: 'Ren', characterName: 'Actor1' }], enemies, tilesets: [null, { id: 1, flags: [0x10, 0] }],
        exists: relative => files.includes(relative) });
    const looks = files => map.events.slice(1).map(unit => C.lookOf(map, unit, C.unitOf(unit), lookups(files)));
    // With the sheets on disk each is its character; without, the next look stands, as in the game.
    assert.deepEqual(looks(['img/characters/Evil.png', 'img/characters/Monster.png', 'img/enemies/Raider.png']), ['character', 'character', 'battler', 'character']);
    assert.deepEqual(looks(['img/enemies/Raider.png']), ['battler', 'figure', 'battler', 'battler']);
    assert.deepEqual(looks([]), ['figure', 'figure', 'figure', 'figure']);
    assert.equal(C.lookOf(map, map.events[1], C.unitOf(map.events[1]), { enemies }), 'character', 'asked by somebody who cannot look at the disk, a named sheet is taken as there');
    // The script's own line: once for each such enemy, something to fix, and the report is not a clean one.
    const said = files => { const report = C.problems(map, lookups(files)); const was = report.ok; V.missingSheets(report, { enemies }, relative => files.includes(relative)); return { report, was, lines: report.lines.filter(line => line.key === 'validate.noSheet') }; };
    const none = said(['img/characters/Evil.png', 'img/characters/Monster.png', 'img/enemies/Raider.png']);
    assert.deepEqual([none.lines.length, none.report.ok], [0, none.was]);
    const lost = said(['img/enemies/Raider.png']);
    assert.deepEqual(lost.lines.map(line => [line.level, line.text]), [
        ['fix', 'Set (enemy 1) names the character sheet "Evil" as its picture on the map: it is not in img/characters.'],
        ['fix', 'Tagged (enemy 2) names the character sheet "Monster" as its picture on the map: it is not in img/characters.']]);
    assert.equal(lost.report.ok, false);
    assert.ok(V.print(lost.report).some(line => line.mark === 'FIX' && line.text.startsWith('Set (enemy 1) names the character sheet "Evil"')), 'printed as a line to fix');
});

test('validate-battle.cjs, run on a project: an enemy whose picture names a missing sheet is a line to fix and exit 1', t => {
    const fs = require('node:fs'), os = require('node:os');
    const { spawnSync } = require('node:child_process');
    const script = path.join(repo, 'editor', 'build-scripts', 'validate-battle.cjs');
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-tactics-sheets-'));
    t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    const data = path.join(folder, 'data');
    fs.mkdirSync(data);
    fs.mkdirSync(path.join(folder, 'img', 'characters'), { recursive: true });
    fs.mkdirSync(path.join(folder, 'img', 'enemies'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'img', 'enemies', 'Raider.png'), '');
    const write = (name, value) => fs.writeFileSync(path.join(data, name), JSON.stringify(value));
    const page = { conditions: {}, image: { tileId: 0, characterName: '', characterIndex: 0, direction: 2, pattern: 1 }, priorityType: 1, through: false, trigger: 0, moveType: 0, list: [{ code: 0, indent: 0, parameters: [] }] };
    const unit = (id, x, enemy) => ({ id, name: 'Raider', note: '', x, y: 3, pages: [page], rrUnit: { team: 'enemy', record: 'enemy', id: enemy } });
    write('System.json', { versionId: 1, gameTitle: 'Sheets', partyMembers: [1], optSideView: false });
    write('Actors.json', [null, { id: 1, name: 'Ren', characterName: 'Actor1', characterIndex: 0 }]);
    write('Troops.json', [null]);
    write('Tilesets.json', [null, { id: 1, flags: [0x10, 0] }]);
    write('MapInfos.json', [null, { id: 1, name: 'Field' }]);
    write('Map001.json', { width: 20, height: 15, tilesetId: 1, note: '<battle mode: tactical>', data: new Array(20 * 15 * 6).fill(1), events: [null, unit(1, 3, 1), unit(2, 5, 2)] });
    const enemies = sheet => [null, { id: 1, name: 'Marksman', battlerName: 'Raider', note: '', rrBattle: { character: { name: sheet, index: 2 } } }, { id: 2, name: 'Cutter', battlerName: 'Raider', note: '' }];
    const run = () => spawnSync(process.execPath, [script, folder, '1'], { encoding: 'utf8' });
    // The sheet is there: nothing to say of it.
    write('Enemies.json', enemies('Evil'));
    fs.writeFileSync(path.join(folder, 'img', 'characters', 'Evil.png'), '');
    const fine = run();
    assert.doesNotMatch(fine.stdout, /names the character sheet/, fine.stdout + fine.stderr);
    assert.equal(fine.status, 0, fine.stdout + fine.stderr);
    // The record names a sheet the project does not have.
    write('Enemies.json', enemies('Gone'));
    const lost = run();
    assert.match(lost.stdout, /  FIX  Marksman \(enemy 1\) names the character sheet "Gone" as its picture on the map: it is not in img\/characters\.\n/, lost.stdout + lost.stderr);
    assert.equal(lost.status, 1);
    assert.equal((lost.stdout.match(/names the character sheet/g) || []).length, 1, 'once, and nothing of the enemy that names none');
    // A sheet stored encrypted is there.
    fs.writeFileSync(path.join(folder, 'img', 'characters', 'Gone.png_'), '');
    assert.equal(run().status, 0);
});
