'use strict';
// A record's own battle settings (`rrBattle`, what the Database's Tactical
// Battles and Action and First Person Battles cards store) are read before the
// tags of its note, setting by setting: runtime/reactor_fight_tactical.js
// (reach, area, sight, move, jump, AI), runtime/reactor_fight_action.js (how a
// weapon fires or swings, a cooldown, the AI preset) and the picture an enemy
// has on the map (reactor_fight.js, reactor_fight_look.js). A project with
// tags only plays as it did.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { fightWorld, event } = require('./helpers/fight-world.cjs');

const repo = path.resolve(__dirname, '..', '..');
const unit = (id, x, y, text, extra = {}) => event(id, x, y, Object.assign({ note: `<unit: ${text}>` }, extra));
const foe = (w, eventId) => w.$gameFight.unitOfEvent(eventId);
const hero = w => w.$gameFight._units.find(u => u.actorId === 1);
const plain = value => (value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);

test('tactical: each setting of rrBattle is read as its tag would be, and nonsense sets nothing', () => {
    const F = fightWorld({ tactical: true }).ReactorFight;
    assert.equal(F.recordTactics({ note: 'just a note' }), null);
    assert.equal(F.recordTactics({ note: '', rrBattle: {} }), null, 'an empty object sets nothing');
    assert.equal(F.recordTactics({ note: '', rrBattle: 'circle' }), null);
    const all = F.recordTactics({ note: '', rrBattle: { range: { min: 2, max: 6 }, area: { shape: 'Cone', size: 3 }, los: false, move: -1, jump: 2, ai: 'Ranged' } });
    assert.deepEqual(plain(all), { range: { min: 2, max: 6 }, area: { shape: 'cone', size: 3 }, los: false, move: -1, jump: 2, ai: 'ranged' });
    // A reach with no least distance is the tag `<range: N>`: from 1, or from 0 when it reaches nowhere.
    assert.deepEqual(plain(F.recordTactics({ rrBattle: { range: { max: 3 } } }).range), { min: 1, max: 3 });
    assert.deepEqual(plain(F.recordTactics({ rrBattle: { range: { max: 0 } } }).range), { min: 0, max: 0 });
    assert.deepEqual(plain(F.recordTactics({ rrBattle: { range: { min: 9, max: 4 } } }).range), { min: 4, max: 4 }, 'the least is never past the most');
    assert.deepEqual(plain(F.recordTactics({ rrBattle: { area: { shape: 'all', size: 7 } } }).area), { shape: 'all', size: 0 }, 'a shape with no size has none');
    assert.deepEqual(plain(F.recordTactics({ rrBattle: { area: { shape: 'circle' } } }).area), { shape: 'circle', size: 1 });
    assert.equal(F.recordTactics({ rrBattle: { move: 0 } }).move, 0, 'zero is a setting');
    for (const nonsense of [{ range: { max: -2 } }, { range: 5 }, { area: { shape: 'blob', size: 2 } }, { los: 'no' }, { move: 'far' }, { move: '' }, { jump: null }, { ai: 'reckless' }]) {
        assert.equal(F.recordTactics({ note: '', rrBattle: nonsense }), null, JSON.stringify(nonsense));
    }
});

test('tactical: a setting stands over the tag of the same name, and a tag fills what the settings leave unset', () => {
    const w = fightWorld({ tactical: true }), F = w.ReactorFight;
    const both = F.recordTactics({ note: '<range: 1-2><area: line 4><los: no><move: 3>', rrBattle: { range: { min: 3, max: 8 }, los: true } });
    assert.deepEqual(plain(both), { range: { min: 3, max: 8 }, area: { shape: 'line', size: 4 }, los: true, move: 3, jump: null, ai: null });
    // Through the game: a skill's reach, and a weapon's for the attack.
    const actor = w.$gameActors.actor(1);
    const of = item => { const t = F.tactics(actor, item); return `${t.min}-${t.max} ${t.area.shape} ${t.area.size} ${t.los}`; };
    const bolt = Object.assign({}, w.$dataSkills[1], { id: 70, scope: 1, hitType: 2, note: '', rrBattle: { range: { min: 2, max: 6 }, area: { shape: 'circle', size: 2 }, los: false } });
    w.$dataSkills[70] = bolt;
    assert.equal(of(bolt), '2-6 circle 2 false');
    // The card changes a setting by giving the record a new object: the game reads it at once.
    bolt.rrBattle = Object.assign({}, bolt.rrBattle, { range: { min: 1, max: 3 } });
    assert.equal(of(bolt), '1-3 circle 2 false');
    delete bolt.rrBattle;
    assert.equal(of(bolt), '1-4 single 0 true', 'cleared, it is the Scope\'s default again');
    w.$dataSystem.weaponTypes = ['', 'Sword'];
    const lance = w.$dataWeapons[5] = { id: 5, name: 'Lance', wtypeId: 1, etypeId: 1, note: '', params: [0, 0, 0, 0, 0, 0, 0, 0], traits: [], iconIndex: 0, price: 0, animationId: 0, rrBattle: { range: { min: 1, max: 2 }, area: { shape: 'line', size: 2 } } };
    actor._equips = [new w.Game_Item()];
    actor._equips[0].setObject(lance);
    assert.equal(of(w.$dataSkills[1]), '1-2 line 2 true', 'the attack takes the weapon\'s own settings');
    lance.rrBattle = { range: { min: 1, max: 3 } };
    assert.equal(of(w.$dataSkills[1]), '1-3 single 0 true', 'and follows them when they change');
});

test('tactical: move, jump and the AI preset from an actor, a class, an enemy, equipment and states', () => {
    const w = fightWorld({ tactical: true, events: [unit(1, 10, 5, 'enemy 1'), unit(2, 12, 5, 'enemy 2')] });
    const F = w.ReactorFight;
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    w.run(600, () => w.$gameFight.awaitsPlayer());
    w.$dataEnemies[1].rrBattle = { move: 6, jump: 3, ai: 'support' };
    assert.deepEqual([F.moveOf(foe(w, 1)), F.jumpOf(foe(w, 1)), F.aiOf(foe(w, 1))], [6, 3, 'support']);
    w.$dataEnemies[2].note = '<move: 2><ai: ranged>';
    assert.deepEqual([F.moveOf(foe(w, 2)), F.aiOf(foe(w, 2))], [2, 'ranged'], 'an enemy with tags only is as it was');
    w.$dataEnemies[2].rrBattle = { move: 5 };
    assert.deepEqual([F.moveOf(foe(w, 2)), F.aiOf(foe(w, 2))], [5, 'ranged'], 'the setting over its tag, the other tag still read');
    w.$dataClasses[1].rrBattle = { move: 5 };
    assert.equal(F.moveOf(hero(w)), 5, 'the class');
    w.$dataActors[1].rrBattle = { move: 7 };
    assert.equal(F.moveOf(hero(w)), 7, 'the actor over its class');
    const actor = w.$gameActors.actor(1);
    w.$dataStates[4] = Object.assign({}, w.$dataStates[1], { id: 4, note: '', rrBattle: { move: -3 } });
    actor.addState(4);
    assert.equal(actor.isStateAffected(4), true);
    assert.equal(F.moveOf(hero(w)), 4, 'a state adds, and may take away');
    // Put on after the state, by hand: a refresh takes off what this class cannot wear.
    const boots = w.$dataArmors[3] = { id: 3, name: 'Boots', atypeId: 1, etypeId: 2, note: '', params: [0, 0, 0, 0, 0, 0, 0, 0], traits: [], iconIndex: 0, price: 0, rrBattle: { move: 2, jump: 1 } };
    actor._equips = [new w.Game_Item(), new w.Game_Item()];
    actor._equips[1].setObject(boots);
    assert.deepEqual([F.moveOf(hero(w)), F.jumpOf(hero(w))], [6, 2], 'equipment adds');
});

test('action: a weapon\'s settings over its type\'s defaults and its tags, a cooldown, and the AI preset', () => {
    const w = fightWorld({ action: true }), A = w.ReactorFight.Action;
    assert.equal(A.settings({ note: 'plain' }), null);
    assert.equal(A.settings({ note: '', rrBattle: {} }), null);
    assert.deepEqual(plain(A.settings({ note: '<fire rate: 2><spread: 4>', rrBattle: { fireRate: 5, magazine: 4.9, reload: 0.5, combo: 4, projectile: 'Rocket', cooldown: 3 } })),
        { fireRate: 5, spread: 4, magazine: 4, reload: 0.5, combo: 4, cooldown: 3, projectile: 'rocket' });
    for (const nonsense of [{ fireRate: -1 }, { magazine: 'many' }, { reload: '' }, { projectile: 'laser' }, { cooldown: null }]) {
        assert.equal(A.settings({ note: '', rrBattle: nonsense }), null, JSON.stringify(nonsense));
    }
    assert.equal(A.settings({ note: '', rrBattle: { magazine: 0 } }).magazine, 0, 'zero is a setting: a bow has no magazine');
    w.$dataSystem.weaponTypes = ['', 'Sword', 'Rifle'];
    const weapon = (id, wtypeId, extra) => Object.assign({ id, name: 'W' + id, wtypeId, etypeId: 1, params: [0, 0, 0, 0, 0, 0, 0, 0], traits: [], note: '', iconIndex: 0, animationId: 0, price: 0, description: '' }, extra);
    w.$dataWeapons[2] = weapon(2, 2);
    w.$dataWeapons[8] = weapon(8, 2, { rrBattle: { fireRate: 5, magazine: 4, reload: 0.5, spread: 0 } });
    w.$dataWeapons[9] = weapon(9, 2, { note: '<fire rate: 5> <magazine: 4><reload: 0.5> <spread: 0>' });
    for (let type = 1; type <= 2; type++) w.$dataClasses[1].traits.push({ code: 51, dataId: type, value: 1 });
    const of = id => { const actor = w.$gameActors.actor(1); actor.forceChangeEquip(0, w.$dataWeapons[id]); return A.profile(actor); };
    const tuned = of(8), tagged = of(9), stock = of(2);
    assert.deepEqual([tuned.rate, tuned.magazine, tuned.reload, tuned.spread], [12, 4, 30, 0]);
    assert.deepEqual([tuned.rate, tuned.magazine, tuned.reload, tuned.spread], [tagged.rate, tagged.magazine, tagged.reload, tagged.spread], 'the same weapon either way');
    assert.deepEqual([stock.rate, stock.magazine], [24, 10], 'a rifle that sets nothing is its type');
    w.$dataWeapons[8].rrBattle = { magazine: 30 };
    assert.deepEqual([of(8).magazine, of(8).rate], [30, 24], 'a new object is read at once, and what it no longer sets is the type\'s again');
    assert.equal(A.cooldownOf(Object.assign({}, w.$dataSkills[1], { note: '<cooldown: 9>', rrBattle: { cooldown: 0.5 } })), 30);
    assert.equal(A.cooldownOf(Object.assign({}, w.$dataSkills[1], { note: '<cooldown: 0.5>' })), 30);
    const source = require('node:fs').readFileSync(path.join(repo, 'runtime', 'reactor_fight_action.js'), 'utf8');
    // The Action AI reads the record's own preset before the tag, and only one of the three (as Tactical does).
    const presetOf = new Function('return ' + /const presetOf = (battler => \{[\s\S]*?\n    \});?/.exec(source)[1])();
    const enemy = record => ({ isActor: () => false, enemy: () => record });
    assert.equal(presetOf(enemy({ note: '<ai: ranged>', rrBattle: { ai: 'Support' } })), 'support');
    assert.equal(presetOf(enemy({ note: '<ai: ranged>', rrBattle: { ai: 'reckless' } })), 'ranged', 'an unknown preset is no setting: the tag stands');
    assert.equal(presetOf(enemy({ note: '<ai: ranged>' })), 'ranged');
    assert.equal(presetOf(enemy({ note: '', rrBattle: { move: 3 } })), 'aggressive');
});

test('an enemy\'s picture on the map: its own setting, else its note tag; an actor\'s is its own sheet', () => {
    const L = require(path.join(repo, 'runtime', 'reactor_fight_look.js'));
    const enemy = { record: 'enemy', id: 3 };
    assert.equal(L.recordCharacter(enemy, { note: '' }), null);
    assert.deepEqual(L.recordCharacter(enemy, { note: '<unit character: Monster, 3>' }), { characterName: 'Monster', characterIndex: 3 });
    assert.deepEqual(L.recordCharacter(enemy, { note: '<unit character: Monster, 3>', rrBattle: { character: { name: ' Evil ', index: 5 } } }), { characterName: 'Evil', characterIndex: 5 });
    assert.deepEqual(L.recordCharacter(enemy, { note: '', rrBattle: { character: { name: '$Big', index: 12 } } }), { characterName: '$Big', characterIndex: 7 }, 'a sheet has eight characters');
    assert.deepEqual(L.recordCharacter(enemy, { note: '<unit character: Monster>', rrBattle: { character: { name: '' } } }), { characterName: 'Monster', characterIndex: 0 }, 'an empty name sets nothing');
    assert.deepEqual(L.recordCharacter({ record: 'actor', id: 1 }, { characterName: 'Actor1', characterIndex: 2, rrBattle: { character: { name: 'Evil', index: 1 } } }),
        { characterName: 'Actor1', characterIndex: 2 });
    // The event the game makes for a placed enemy takes the same picture.
    const w = fightWorld({ tactical: true, events: [unit(1, 10, 5, 'enemy 2')] });
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    w.run(600, () => w.$gameFight.awaitsPlayer());
    w.$dataEnemies[1].note = '<unit character: Monster, 3>';
    w.$dataEnemies[1].rrBattle = { character: { name: 'Evil', index: 5 } };
    const spawned = w.$gameFight.spawn({ record: 'enemy', id: 1, x: 12, y: 9 });
    const character = w.$gameFight.character(spawned);
    assert.deepEqual([character.characterName(), character.characterIndex()], ['Evil', 5]);
    delete w.$dataEnemies[1].rrBattle;
    const tagged = w.$gameFight.character(w.$gameFight.spawn({ record: 'enemy', id: 1, x: 13, y: 9 }));
    assert.deepEqual([tagged.characterName(), tagged.characterIndex()], ['Monster', 3]);
    // A tag that names no index is the sheet's first character, for the spawned event as for the look rule.
    w.$dataEnemies[1].note = '<unit character: Monster>';
    const first = w.$gameFight.character(w.$gameFight.spawn({ record: 'enemy', id: 1, x: 14, y: 9 }));
    assert.deepEqual([first.characterName(), first.characterIndex()], ['Monster', 0]);
});

test('nothing reaches or spreads further than 30 tiles, whatever a record or a note says', () => {
    const w = fightWorld({ tactical: true }), F = w.ReactorFight;
    assert.equal(F.MAX_REACH, 30);
    const actor = w.$gameActors.actor(1);
    const skill = (id, extra) => (w.$dataSkills[id] = Object.assign({}, w.$dataSkills[1], { id, scope: 1, hitType: 2, note: '' }, extra));
    const of = item => { const t = F.tactics(actor, item); return [t.min, t.max, t.area.shape, t.area.size]; };
    assert.deepEqual(of(skill(71, { rrBattle: { range: { min: 2, max: 999 }, area: { shape: 'circle', size: 1e9 } } })), [2, 30, 'circle', 30]);
    assert.deepEqual(of(skill(72, { rrBattle: { range: { min: 500, max: 1e308 } } })), [30, 30, 'single', 0]);
    assert.deepEqual(of(skill(73, { note: '<range: 40-6000><area: square 77>' })), [30, 30, 'square', 30], 'a tag is bound the same way');
    assert.deepEqual(of(skill(74, { rrBattle: { range: { min: 1, max: 30 }, area: { shape: 'line', size: 30 } } })), [1, 30, 'line', 30], 'the limit itself stands');
});

test('an enemy\'s picture changed in a running game is seen at once; an empty name is no picture; a sheet has eight characters', () => {
    const w = fightWorld({ tactical: true, events: [unit(1, 10, 5, 'enemy 2')] }), F = w.ReactorFight;
    const look = () => { const l = F.unitLook('enemy', 1, 'enemy'); return l && [l.kind, l.characterName || '', l.characterIndex || 0]; };
    if (!F.unitLook('enemy', 1, 'enemy')) return;   // a world without the look rule has no look to follow
    const before = look();
    w.$dataEnemies[1].rrBattle = { character: { name: 'Evil', index: 5 } };
    assert.deepEqual(look(), ['character', 'Evil', 5], 'a new object is seen without the list being replaced');
    w.$dataEnemies[1].rrBattle = { character: { name: 'Monster', index: 2 } };
    assert.deepEqual(look(), ['character', 'Monster', 2]);
    w.$dataEnemies[1].rrBattle = undefined;
    w.$dataEnemies[1].note = '<unit character: Tagged, 1>';
    assert.deepEqual(look(), ['character', 'Tagged', 1], 'and so is a changed note');
    w.$dataEnemies[1].note = '';
    assert.deepEqual(look(), before);
    // The event the game makes for a placed enemy: a name of spaces is no picture of its own, and index 12 is the eighth.
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    w.run(600, () => w.$gameFight.awaitsPlayer());
    const spawned = options => { const c = w.$gameFight.character(w.$gameFight.spawn(Object.assign({ record: 'enemy', id: 1 }, options))); return [c.characterName(), c.characterIndex()]; };
    w.$dataEnemies[1].note = '<unit character: Monster, 3>';
    w.$dataEnemies[1].rrBattle = { character: { name: '   ', index: 4 } };
    assert.deepEqual(spawned({ x: 12, y: 9 }), ['Monster', 3]);
    w.$dataEnemies[1].rrBattle = { character: { name: 'Evil', index: 12 } };
    assert.deepEqual(spawned({ x: 13, y: 9 }), ['Evil', 7]);
    w.$dataEnemies[1].rrBattle = { character: { name: 'Evil', index: -3 } };
    assert.deepEqual(spawned({ x: 14, y: 9 }), ['Evil', 0]);
});
