'use strict';
// The battle cards of a Database record (src/database/TacticsSection.js):
// Tactical Battles, and Action and First Person Battles. What they read (a
// record's own settings, then the tags of its Note), what an untouched record
// gets, the cells the picture draws, which card a record gets and what each
// says and clears, and the cards on a page. How they store, against the game's
// own readers, is tactics-card-fields.test.cjs. The same fixtures are read by
// the runtime (reactor_fight_tactical.js), so the picture and the battle agree.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const T = require('../src/database/TacticsSection.js');
const fixtures = require('./fixtures/tactics-fixtures.json');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const sorted = cells => cells.map(c => [c.x, c.y]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
const context = { weaponTypes: ['', 'Dagger', 'Sword', 'Bow', 'Crossbow', 'Gun', 'Sniper Rifle', 'Pistol', 'Hand Cannon', 'Rocket Launcher', 'Spear'] };

test('every fixture note reads as its tags', () => {
    for (const entry of fixtures.notes) assert.deepEqual(T.parse(entry.note), entry.tags, JSON.stringify(entry.note));
});

test('every fixture shape lands on its cells', () => {
    for (const entry of fixtures.areas) {
        const cells = T.areaCells({ shape: entry.shape, size: entry.size }, entry.user, entry.target);
        assert.deepEqual(sorted(cells), entry.cells, `${entry.shape} ${entry.size} toward ${entry.target.x},${entry.target.y}`);
    }
    assert.equal(T.areaCells({ shape: 'all', size: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }), null);
});

test('the shapes are the ones the contract draws', () => {
    const user = { x: 0, y: 0 };
    assert.equal(T.areaCells({ shape: 'circle', size: 2 }, user, { x: 3, y: 0 }).length, 13);
    assert.equal(T.areaCells({ shape: 'square', size: 2 }, user, { x: 3, y: 0 }).length, 25);
    assert.equal(T.areaCells({ shape: 'cross', size: 3 }, user, { x: 3, y: 0 }).length, 13);
    // A line and a cone start next to the user and run the longer way; a tie runs vertically.
    assert.deepEqual(sorted(T.areaCells({ shape: 'line', size: 3 }, user, { x: 2, y: 1 })), [[1, 0], [2, 0], [3, 0]]);
    assert.deepEqual(sorted(T.areaCells({ shape: 'line', size: 2 }, user, { x: 2, y: -2 })), [[0, -2], [0, -1]]);
    // A cone is one cell wide at the first step and two wider with each step.
    const cone = T.areaCells({ shape: 'cone', size: 3 }, user, { x: -1, y: 0 });
    assert.deepEqual([1, 2, 3].map(step => cone.filter(c => c.x === -step).length), [1, 3, 5]);
    assert.equal(T.reachCells(2, 3).length, 20);
    assert.equal(T.reachCells(0, 0).length, 1);
});

test('the runtime reads the same notes and shapes the same way', t => {
    const { fightWorld } = require('./helpers/fight-world.cjs');
    const world = fightWorld();
    const file = path.join(__dirname, '..', '..', 'runtime', 'reactor_fight_tactical.js');
    if (!world.ReactorFight.parseTactics && fs.existsSync(file)) {
        try { vm.runInContext(fs.readFileSync(file, 'utf8'), world, { filename: 'reactor_fight_tactical.js' }); } catch (error) { /* not loadable alone: skipped below */ }
    }
    const F = world.ReactorFight;
    if (!F.parseTactics) return t.skip('the tactical driver has no parseTactics yet');
    const plain = value => (value === null || value === undefined ? null : JSON.parse(JSON.stringify(value)));
    for (const entry of fixtures.notes) {
        const got = plain(F.parseTactics(entry.note));
        const mine = entry.tags;
        for (const key of ['range', 'area', 'los', 'move', 'jump', 'ai']) {
            const theirs = got && got[key] !== null && got[key] !== undefined ? got[key] : undefined;
            assert.deepEqual(theirs, mine ? mine[key] : undefined, `${key} of ${JSON.stringify(entry.note)}`);
        }
    }
    if (!F.Grid || !F.Grid.inArea) return;
    for (const entry of fixtures.areas) {
        const want = new Set(entry.cells.map(c => c.join(',')));
        for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
            const inside = !!F.Grid.inArea(entry.shape, entry.size, entry.user.x, entry.user.y, entry.target.x, entry.target.y, x, y);
            assert.equal(inside, want.has(x + ',' + y), `${entry.shape} ${entry.size} toward ${entry.target.x},${entry.target.y} at ${x},${y}`);
        }
    }
});

test('a tag leaves the Note where it stands, with its line when the line held nothing else, and nothing writes a tag', () => {
    const note = 'A sniper\'s shot.\n<range: 3-9> <area: single>\nKeep this line.';
    const without = (text, kind = 'skill') => T.reset(['skill', 'item', 'weapon'].includes(kind) ? 'shared' : 'tactical', kind, { note: text }).note;
    assert.equal(T.strip(note, /<range\s*:\s*(\d+)\s*(?:-\s*(\d+)\s*)?>/i), 'A sniper\'s shot.\n <area: single>\nKeep this line.');
    assert.equal(without(note), 'A sniper\'s shot.\nKeep this line.');
    assert.equal(without('Keep.'), 'Keep.');
    assert.equal(without('<los: no>\r\nwindows line\r\n'), 'windows line\r\n');
    assert.equal(without('<move: 4>\n<jump: 2>', 'state'), '');
    // A second copy of the same tag goes; other tags and the PTBS block stay.
    assert.equal(without('<range: 2> and <range: 4>'), ' and ');
    assert.equal(without('x\n<ai: support>\n<range: 2>'), 'x\n<ai: support>');
    const ptbs = '<PTBS>\nscope: circle(3,0)\n</PTBS>';
    assert.equal(without(ptbs + '\n<range: 2-5>'), ptbs);
    // The cards store in the record: nothing of theirs puts a tag into a Note.
    assert.deepEqual([T.write, T.writeAction, T.writeCombat, T.resetNote], [undefined, undefined, undefined, undefined]);
    assert.doesNotMatch(read('src/database/TacticsSection.js'), /tagText|`<\$\{|`<(?:range|area|los|move|jump|ai|projectile|unit character): ?\$\{/);
});

test('an untouched record gets the contract\'s defaults', () => {
    const skill = (scope, extra = {}) => Object.assign({ id: 20, scope, hitType: 2, note: '' }, extra);
    const of = (kind, record) => { const v = T.effective(kind, record, context); return [v.range.min, v.range.max, v.area.shape, v.area.size]; };
    assert.deepEqual(of('skill', skill(1)), [1, 4, 'single', 0]);
    for (const scope of [2, 3, 4, 5, 6]) assert.deepEqual(of('skill', skill(scope)), [1, 4, 'circle', 2]);
    for (const scope of [7, 9, 12]) assert.deepEqual(of('skill', skill(scope)), [0, 3, 'single', 0]);
    for (const scope of [8, 10, 13, 14]) assert.deepEqual(of('skill', skill(scope)), [0, 0, 'circle', 3]);
    for (const scope of [0, 11]) assert.deepEqual(of('skill', skill(scope)), [0, 0, 'self', 0]);
    assert.deepEqual(of('item', { id: 3, scope: 7, note: '' }), [0, 3, 'single', 0]);
    // Weapons by the name of their type.
    const weapon = wtypeId => of('weapon', { id: 1, wtypeId, note: '' }).slice(0, 2);
    assert.deepEqual([1, 2, 10].map(weapon), [[1, 1], [1, 1], [1, 1]]);
    assert.deepEqual([3, 4, 5, 9].map(weapon), [[2, 5], [2, 5], [2, 5], [2, 5]]);
    assert.deepEqual([6, 8].map(weapon), [[2, 7], [2, 7]]);
    assert.deepEqual(weapon(7), [1, 4]);
});

test('Attack and physical skills aimed at enemies leave what they do not say to the weapon, each value on its own', () => {
    const attack = T.effective('skill', { id: 1, scope: 1, hitType: 1, note: '' }, context);
    assert.deepEqual(attack.weapon, { range: true, area: true });
    assert.deepEqual(attack.range, { min: 1, max: 1 });
    const slash = T.effective('skill', { id: 9, scope: 2, hitType: 1, note: '<area: circle 1>' }, context);
    assert.deepEqual(slash.weapon, { range: true, area: false });
    assert.deepEqual(slash.auto, { range: true, area: false });
    assert.deepEqual(T.effective('skill', { id: 9, scope: 1, hitType: 2, note: '' }, context).weapon, { range: false, area: false });
    // A physical skill on allies, and an item, never read the weapon.
    assert.deepEqual(T.effective('skill', { id: 9, scope: 7, hitType: 1, note: '' }, context).weapon, { range: false, area: false });
    assert.deepEqual(T.effective('item', { id: 9, scope: 1, hitType: 1, note: '' }, context).weapon, { range: false, area: false });
    // An area on the user only has no reach.
    assert.deepEqual(T.effective('skill', { id: 9, scope: 1, hitType: 2, note: '<range: 5>\n<area: self>' }, context).range, { min: 0, max: 0 });
});

test('the card keeps nothing for a value the record already gets, and a setting set back is gone', () => {
    const set = (kind, record, values) => { const done = T.change(['skill', 'item', 'weapon'].includes(kind) ? 'shared' : 'tactical', kind, record, context, values); return [done.note, done.rrBattle]; };
    const fire = { id: 20, scope: 1, hitType: 2, note: 'Burns.' };
    assert.deepEqual(set('skill', fire, { range: { min: 1, max: 4 } }), ['Burns.', undefined]);
    assert.deepEqual(set('skill', fire, { range: { min: 2, max: 6 } }), ['Burns.', { range: { min: 2, max: 6 } }]);
    assert.deepEqual(set('skill', fire, { area: { shape: 'single', size: 0 } }), ['Burns.', undefined]);
    assert.deepEqual(set('skill', fire, { area: { shape: 'cone', size: 3 } }), ['Burns.', { area: { shape: 'cone', size: 3 } }]);
    const held = Object.assign({}, fire, { rrBattle: { range: { min: 2, max: 6 }, area: { shape: 'cone', size: 3 }, los: false } });
    assert.deepEqual(set('skill', held, { range: { min: 1, max: 4 } }), ['Burns.', { area: { shape: 'cone', size: 3 }, los: false }]);
    assert.deepEqual(set('skill', held, { range: null, area: null, los: true }), ['Burns.', undefined]);
    // The same skill with its settings typed as tags: touched, they are its own settings and the Note holds none of them.
    const tagged = Object.assign({}, fire, { note: 'Burns.\n<range: 2-6>\n<area: cone 3>\n<los: no>' });
    assert.deepEqual(set('skill', tagged, { range: { min: 1, max: 4 } }), ['Burns.', { area: { shape: 'cone', size: 3 }, los: false }]);
    assert.deepEqual(set('skill', tagged, { range: null, area: null, los: true }), ['Burns.', undefined]);
    assert.deepEqual(set('skill', fire, { los: false }), ['Burns.', { los: false }]);
    // What the weapon would decide is always kept when set, even at the unarmed value.
    assert.deepEqual(set('skill', { id: 1, scope: 1, hitType: 1, note: '' }, { range: { min: 1, max: 1 } }), ['', { range: { min: 1, max: 1 } }]);
    // A weapon against its type's reach.
    const bow = { id: 4, wtypeId: 3, note: '' };
    assert.deepEqual(set('weapon', bow, { range: { min: 2, max: 5 } }), ['', undefined]);
    assert.deepEqual(set('weapon', bow, { range: { min: 2, max: 8 } }), ['', { range: { min: 2, max: 8 } }]);
    // A PTBS block is read, never rewritten: the record's own setting carries the change.
    const old = { id: 30, scope: 1, hitType: 2, note: '<PTBS>\nscope: circle(3,0)\n</PTBS>' };
    assert.deepEqual(T.effective('skill', old, context).range, { min: 0, max: 3 });
    assert.deepEqual(set('skill', old, { range: { min: 0, max: 3 } }), [old.note, undefined]);
    assert.deepEqual(set('skill', old, { range: { min: 1, max: 5 } }), [old.note, { range: { min: 1, max: 5 } }]);
});

test('the picture shows the reach round the unit and the area where the pointer is', () => {
    const cone = T.effective('skill', { id: 20, scope: 2, hitType: 2, note: '<range: 1-3>\n<area: cone 3>' }, context);
    const resting = T.picture(cone, null);
    assert.equal(resting.reach.length, 24);
    assert.deepEqual(resting.target, { x: 3, y: 0 });
    assert.ok(resting.area.every(c => c.x > 0), 'the cone opens toward the target');
    const up = T.picture(cone, { x: 0, y: -2 });
    assert.ok(up.area.every(c => c.y < 0), 'and follows the pointer');
    // A pointer outside the reach leaves the picture where it rests.
    assert.deepEqual(T.picture(cone, { x: 9, y: 9 }).target, { x: 3, y: 0 });
    assert.ok(resting.radius >= 4 && resting.radius <= 31);
    // The picture holds whatever the numbers reach: a long range, an area far out, up to the fields' highest number.
    for (const [note, radius] of [['<range: 1-9>', 10], ['<range: 1-15>', 16], ['<range: 2-30>', 31], ['<range: 1-6><area: circle 8>', 15], ['<range: 1-30><area: circle 20>', 31]]) {
        const shown = T.picture(T.effective('skill', { id: 2, scope: 1, hitType: 0, note }, context), null);
        assert.equal(shown.radius, radius, note);
        if (radius < 31) assert.ok(shown.reach.concat(shown.area).every(c => Math.abs(c.x) <= shown.radius && Math.abs(c.y) <= shown.radius), `${note}: every cell fits`);
    }
    const self = T.picture(T.effective('skill', { id: 2, scope: 11, hitType: 0, note: '' }, context), null);
    assert.deepEqual([self.reach.length, self.area.length, self.target], [0, 1, null]);
    assert.equal(T.picture(T.effective('skill', { id: 2, scope: 1, hitType: 2, note: '<area: all>' }, context), null).everyone, true);
});

test('a summary says what an untouched record does in plain words', () => {
    const say = (kind, record) => T.describe(T.effective(kind, record, context));
    assert.equal(say('skill', { id: 20, scope: 1, hitType: 2, note: '' }), 'Target range 1-4, One target');
    assert.equal(say('skill', { id: 20, scope: 2, hitType: 2, note: '' }), 'Target range 1-4, Circle 2');
    assert.equal(say('skill', { id: 20, scope: 11, hitType: 0, note: '' }), 'The user');
    assert.equal(say('weapon', { id: 1, wtypeId: 1, note: '' }), 'Target range 1, One target');
    assert.equal(say('skill', { id: 20, scope: 8, hitType: 0, note: '' }), 'Target range own tile, Circle 3');
});

test('the battle cards are on every record page, and each kind of record gets the cards that apply to it', () => {
    const pages = { Skill: 'skill', Item: 'item', Weapon: 'weapon', Armor: 'armor', State: 'state', Actor: 'actor', Class: 'class', Enemy: 'enemy' };
    for (const [name, kind] of Object.entries(pages)) {
        assert.match(read(`src/database/Database${name}Editor.js`), new RegExp(`RRTactics\\?\\.createSection\\(\\{ kind: '${kind}'`), name);
    }
    assert.match(read('index.html'), /src\/database\/TacticsSection\.js/);
    assert.deepEqual(T.cardsFor('weapon'), ['shared', 'tactical', 'action']);
    for (const kind of ['skill', 'item']) assert.deepEqual(T.cardsFor(kind), ['shared', 'action']);
    for (const kind of ['actor', 'enemy']) assert.deepEqual(T.cardsFor(kind), ['shared', 'tactical']);
    for (const kind of ['armor', 'state', 'class']) assert.deepEqual(T.cardsFor(kind), ['tactical'], kind);
    assert.deepEqual(T.cardsFor('troop'), []);
    // The names the folds are remembered by: the Tactical card keeps the old card's, so folds already made carry over.
    assert.deepEqual([T.CARDS.tactical.key, T.CARDS.tactical.title], ['tactics', 'Tactical Battles']);
    assert.deepEqual([T.CARDS.action.key, T.CARDS.action.title], ['action', 'Action and First Person Battles']);
    // One card with two tabs is gone, with everything that chose a tab.
    assert.doesNotMatch(read('src/database/TacticsSection.js'), /startingPane|chosenPane|rr-tactics-tabs|rr-tactics-pane|role="tab"|data-pane/);
    assert.deepEqual([T.startingPane, T.mapModes], [undefined, undefined]);
    assert.doesNotMatch(read('css/styles.css'), /rr-tactics-tabs|rr-tactics-pane/);
});

//-----------------------------------------------------------------------------
// The Action and First Person card: the tags those battles read.

/** A world with the Action driver loaded (it follows the tactical driver and the map stage). */
function actionWorld(weaponTypes) {
    const { fightWorld } = require('./helpers/fight-world.cjs');
    const world = fightWorld();
    for (const name of ['reactor_fight_tactical.js', 'reactor_fight_stage.js', 'reactor_fight_action.js']) {
        const marker = { 'reactor_fight_tactical.js': () => world.ReactorFight.parseTactics, 'reactor_fight_stage.js': () => world.ReactorFight.Stage, 'reactor_fight_action.js': () => world.ReactorFight.Action }[name];
        if (marker()) continue;
        const file = path.join(__dirname, '..', '..', 'runtime', name);
        if (!fs.existsSync(file)) continue;
        try { vm.runInContext(fs.readFileSync(file, 'utf8'), world, { filename: name }); } catch (error) { /* judged by what it left */ }
    }
    world.$dataSystem.weaponTypes = weaponTypes;
    return world;
}

const TYPES = ['', 'Dagger', 'Sword', 'Sniper Rifle', 'Shotgun', 'Machine Gun', 'Pistol', 'Bow', 'Crossbow', 'Rocket Launcher', 'Hand Cannon', 'Claw', 'Spear', 'Knife'];
const NOTES = ['', '<fire rate: 4.5>', '<magazine: 0>', '<magazine: 40>\n<reload: 0.8>', '<spread: 12>', '<projectile: rocket>', '<projectile: none>', '<projectile: bolt>\n<fire rate: 1>',
    '<combo: 5>', '<combo: 9>', '<Fire Rate:0.05> <SPREAD: 0.5>', 'A fine weapon.\n<projectile: arrow> <magazine: 3>\n<range: 2-6>'];

test('the Action card reads a weapon exactly as the runtime does: every type name, with and without tags', t => {
    const world = actionWorld(TYPES), A = world.ReactorFight.Action;
    if (!A || !A.profile) return t.skip('the Action driver is not loadable here');
    let compared = 0;
    for (let wtypeId = 1; wtypeId < TYPES.length; wtypeId++) {
        for (const note of NOTES) {
            const weapon = { id: 100 + compared, wtypeId, note };
            const theirs = A.profile({ isActor: () => true, weapons: () => [weapon], attackSkillId: () => 1 });
            const mine = T.combatProfile(weapon, { weaponTypes: TYPES });
            const label = `${TYPES[wtypeId]} ${JSON.stringify(note)}`;
            assert.equal(mine.ranged, theirs.ranged, label + ' ranged');
            assert.equal(mine.projectile, theirs.projectile, label + ' projectile');
            assert.equal(Math.max(2, Math.round(60 / mine.fireRate)), theirs.rate, label + ' rate');
            assert.equal(mine.magazine, theirs.magazine, label + ' magazine');
            assert.equal(Math.round(60 * mine.reload), theirs.reload, label + ' reload');
            assert.equal(mine.spread, theirs.spread, label + ' spread');
            assert.equal(mine.combo, theirs.combo, label + ' combo');
            assert.equal(mine.pellets, theirs.pellets, label + ' pellets');
            assert.equal(mine.reach, theirs.reach, label + ' reach');
            compared++;
        }
    }
    assert.ok(compared > 100);
    // The tags themselves, and the cooldowns.
    for (const note of NOTES.concat(['<cooldown: 4.5>', 'no tags here'])) {
        const theirs = A.parse(note);
        assert.deepEqual(T.parseCombat(note), theirs ? JSON.parse(JSON.stringify(theirs)) : null, JSON.stringify(note));
    }
    world.DataManager.isItem = record => !!record.isItem;
    for (const [kind, record] of [['skill', { note: '' }], ['item', { note: '', isItem: true }], ['skill', { note: '<cooldown: 0.5>' }], ['item', { note: '<cooldown: 7>', isItem: true }]]) {
        assert.equal(Math.round(T.cooldownOf(kind, record).cooldown * 60), A.cooldownOf(record), kind + ' ' + record.note);
    }
});

test('an untouched weapon is what its type says, and a combo deals what the battle deals', () => {
    const of = (wtypeId, note = '') => T.combatProfile({ wtypeId, note }, { weaponTypes: TYPES });
    assert.deepEqual([of(6).ranged, of(6).fireRate, of(6).magazine, of(6).reload, of(6).spread, of(6).projectile], [true, 3, 12, 1.2, 3, 'bullet']);
    assert.deepEqual([of(4).pellets, of(4).spread, of(9).projectile, of(7).magazine], [6, 9, 'rocket', 0]);
    assert.deepEqual([of(2).ranged, of(2).combo, of(2).reach, of(1).combo, of(1).reach], [false, 3, 1.6, 4, 1.2]);
    assert.deepEqual(of(2).auto, { fireRate: true, magazine: true, reload: true, spread: true, combo: true, projectile: true });
    assert.equal(of(2, '<combo: 5>').auto.combo, false);
    // A sword told to shoot is a ranged weapon; a rifle told not to is a blade.
    assert.deepEqual([of(2, '<projectile: bolt>').ranged, of(3, '<projectile: none>').ranged], [true, false]);
    assert.deepEqual(T.comboShares(4).map(share => Math.round(share * 10) / 10), [0.5, 0.6, 0.7, 1]);
    assert.deepEqual(T.comboShares(1), [1]);
    // The battle's own rule (reactor_fight_action.js).
    assert.match(read('../runtime/reactor_fight_action.js'), /swing\.step >= profile\.combo[^\n]*\? 1 : Math\.min\(1, 0\.4 \+ 0\.1 \* swing\.step\)/);
    assert.equal(T.describeCombat(of(3)), 'Bullet, 2.5/s, Magazine 10');
    assert.equal(T.describeCombat(of(2)), 'Melee, Combo 3');
});

test('the Action card keeps its own settings, nothing for a default, and leaves the Tactical card\'s and every line of the Note alone', () => {
    const rifle = { id: 5, wtypeId: 3, note: 'Long barrel.\n<range: 3-9>' }, c = { weaponTypes: TYPES };
    const set = (kind, record, values) => { const done = T.change('action', kind, record, c, values); return [done.note, done.rrBattle]; };
    assert.deepEqual(set('weapon', rifle, { fireRate: 2.5, magazine: 10, reload: 1.6, spread: 1.5, projectile: 'bullet' }), [rifle.note, undefined], 'its type\'s own values keep nothing');
    assert.deepEqual(set('weapon', rifle, { fireRate: 1, magazine: 5 }), [rifle.note, { fireRate: 1, magazine: 5 }]);
    assert.deepEqual(set('weapon', rifle, { reload: 2.25, spread: 0.5 }), [rifle.note, { reload: 2.25, spread: 0.5 }]);
    const held = Object.assign({}, rifle, { rrBattle: { fireRate: 1, magazine: 5, projectile: 'rocket' } });
    assert.deepEqual(set('weapon', held, { fireRate: null, magazine: '', projectile: null }), [rifle.note, undefined], 'emptied fields are automatic again');
    assert.deepEqual(set('weapon', held, { magazine: 10 }), [rifle.note, { fireRate: 1, projectile: 'rocket' }], 'set back to the default');
    // The same weapon typed as tags: touched, its Action tags are its own settings; the Tactical tag stays in the Note.
    const tagged = Object.assign({}, rifle, { note: 'Long barrel.\n<range: 3-9>\n<fire rate: 1>\n<magazine: 5>\n<projectile: rocket>' });
    assert.deepEqual(set('weapon', tagged, { magazine: 10 }), [rifle.note, { fireRate: 1, projectile: 'rocket' }]);
    assert.deepEqual(set('weapon', tagged, { fireRate: null, magazine: '', projectile: null }), [rifle.note, undefined]);
    const sword = { id: 6, wtypeId: 2, note: '' };
    assert.deepEqual(set('weapon', sword, { combo: 3 }), ['', undefined]);
    assert.deepEqual(set('weapon', sword, { combo: 5, projectile: 'none' }), ['', { combo: 5 }]);
    assert.deepEqual(set('weapon', sword, { projectile: 'bolt' }), ['', { projectile: 'bolt' }]);
    assert.deepEqual(set('skill', { note: 'Burns.' }, { cooldown: 2 }), ['Burns.', undefined]);
    assert.deepEqual(set('skill', { note: 'Burns.' }, { cooldown: 6.5 }), ['Burns.', { cooldown: 6.5 }]);
    assert.deepEqual(set('item', { note: '<cooldown: 6>' }, { cooldown: 1 }), ['', undefined]);
    // The two cards never touch each other's settings.
    const both = T.change('shared', 'weapon', { id: 5, wtypeId: 3, note: '<fire rate: 1>', rrBattle: { magazine: 5 } }, c, { range: { min: 2, max: 9 } });
    assert.deepEqual([both.note, both.rrBattle], ['<fire rate: 1>', { magazine: 5, range: { min: 2, max: 9 } }]);
});

test('each card holds its own fields on the shared form grid, and none of the other card\'s', () => {
    const fields = html => [...html.matchAll(/class="(?:database-field-value|system-checkbox) (rr-(?:tactics|combat)-[A-Za-z]+)"/g)].map(match => match[1]);
    const TACTICAL = ['rr-tactics-min', 'rr-tactics-max', 'rr-tactics-shape', 'rr-tactics-size', 'rr-tactics-los'], MOVE = ['rr-tactics-move', 'rr-tactics-jump'];
    assert.deepEqual(fields(T.cardHtml('shared', 'weapon')), TACTICAL);
    assert.deepEqual(fields(T.cardHtml('action', 'weapon')), ['rr-combat-projectile', 'rr-combat-fireRate', 'rr-combat-magazine', 'rr-combat-reload', 'rr-combat-spread', 'rr-combat-combo']);
    for (const kind of ['skill', 'item']) {
        assert.deepEqual(fields(T.cardHtml('shared', kind)), TACTICAL, kind);
        assert.deepEqual(fields(T.cardHtml('action', kind)), ['rr-combat-cooldown'], kind);
    }
    for (const kind of ['armor', 'state', 'class']) assert.deepEqual(fields(T.cardHtml('tactical', kind)), MOVE, kind);
    for (const kind of ['actor', 'enemy']) assert.deepEqual(fields(T.cardHtml('tactical', kind)), MOVE, kind);
    // A picture where there is something to draw: a reach, a move, a weapon's cone or swing.
    const pictured = (card, kind) => (T.cardHtml(card, kind).match(/<div class="rr-tactics-picture"><canvas /g) || []).length;
    assert.deepEqual(['weapon', 'skill', 'item', 'actor', 'class', 'enemy', 'armor', 'state'].map(kind => pictured('tactical', kind)), [0, 0, 0, 1, 1, 1, 0, 0]);
    assert.deepEqual(['weapon', 'skill', 'item'].map(kind => pictured('action', kind)), [1, 0, 0]);
    // An enemy has one row more, on the same grid: its picture on the map, the way to pick one, the way back, and a line for what it stands as left alone.
    assert.match(T.cardHtml('shared', 'enemy'), /<label>On the map<\/label>\s*<span class="rr-tactics-inline rr-tactics-look">\s*<canvas class="rr-tactics-sprite" width="48" height="48"><\/canvas>\s*<span class="rr-tactics-look-name"><\/span>\s*<button type="button" class="rr-btn-chip rr-tactics-look-change">Choose a picture\.\.\.<\/button>\s*<button type="button" class="rr-btn-chip rr-tactics-look-auto" hidden>Automatic<\/button>\s*<\/span>\s*<span class="rr-tactics-hint rr-tactics-look-hint" hidden><\/span>\s*<\/div>/);
    for (const kind of ['actor', 'class', 'weapon', 'skill', 'item', 'armor', 'state']) assert.doesNotMatch(T.cardHtml('tactical', kind) + (T.cardsFor(kind).includes('action') ? T.cardHtml('action', kind) : ''), /rr-tactics-look|On the map/, kind);
    assert.equal((T.cardHtml('shared', 'enemy').match(/database-section-header|class="db-form/g) || []).length, 2, 'a row of the card, not a card of its own');
    // Every card: one title line with its own title, summary and Automatic chip, and one form on the shared grid.
    for (const [card, kind, title] of [['shared', 'weapon', 'Shared Combat Settings'], ['tactical', 'armor', 'Tactical Battles'], ['action', 'weapon', 'Action and First Person Battles'], ['action', 'skill', 'Action and First Person Battles']]) {
        const html = T.cardHtml(card, kind);
        assert.match(html, new RegExp(`<div class="database-section-header rr-tactics-header"><span class="rr-tactics-title">${title}</span><span class="rr-tactics-summary"></span><button type="button" class="rr-btn-chip rr-tactics-reset" hidden>Automatic</button></div>`), `${card} ${kind}`);
        assert.equal((html.match(/<div class="db-form rr-tactics-form">/g) || []).length, 1, `${card} ${kind}`);
        assert.doesNotMatch(html, /<button[^>]*role="tab"|rr-tactics-tabs/);
    }
    // The words go through the label manager, the titles among them.
    const asked = [];
    T.cardHtml('action', 'weapon', words => { asked.push(words); return words; });
    T.cardHtml('shared', 'actor', words => { asked.push(words); return words; });
    T.cardHtml('shared', 'enemy', words => { asked.push(words); return words; });
    T.cardHtml('tactical', 'class', words => { asked.push(words); return words; });
    for (const words of ['Action and First Person Battles', 'Tactical Battles', 'Automatic', 'Fires', 'Attack rate', 'Magazine', 'Move range', 'Climb', 'Fights', 'On the map', 'Choose a picture...']) assert.ok(asked.includes(words), words);
    // The reach is one phrase, cut at its two numbers: each language puts its own words round the fields.
    const parts = row => [...row.matchAll(/<input [^>]*class="database-field-value (rr-tactics-(?:min|max))"[^>]*>|<span class="(rr-tactics-word[^"]*)">([^<]*)<\/span>/g)].map(match => match[1] || `${match[3]}${match[2].includes('rr-tactics-reach-unit') ? ' (the unit)' : ''}`);
    assert.deepEqual(parts(T.reachRow()), ['rr-tactics-min', 'to', 'rr-tactics-max', 'tiles (the unit)']);
    assert.deepEqual(parts(T.reachRow(() => '{min} bis {max} Felder')), ['rr-tactics-min', 'bis', 'rr-tactics-max', 'Felder (the unit)']);
    assert.deepEqual(parts(T.reachRow(() => 'von {min} bis {max} Feldern')), ['von', 'rr-tactics-min', 'bis', 'rr-tactics-max', 'Feldern (the unit)']);
    assert.deepEqual(parts(T.reachRow(() => '{min}\uFF5E{max}\u30BF\u30A4\u30EB')), ['rr-tactics-min', '\uFF5E', 'rr-tactics-max', '\u30BF\u30A4\u30EB (the unit)']);
    assert.deepEqual(parts(T.reachRow(() => '{min} \u2013 {max}')), ['rr-tactics-min', '\u2013', 'rr-tactics-max'], 'a language with no unit word has none');
    assert.deepEqual(parts(T.reachRow(() => '{min} bis 5 <b>Felder</b>')), ['rr-tactics-min', 'to', 'rr-tactics-max', 'tiles (the unit)'], 'a translation that lost a number is not used');
    assert.deepEqual(parts(T.reachRow(() => '{min} bis {min} oder {max}')), ['rr-tactics-min', 'to', 'rr-tactics-max', 'tiles (the unit)'], 'nor one that holds a number twice');
    assert.match(T.reachRow(() => '{min} & {max} <i>'), /<span class="rr-tactics-word">&amp;<\/span>.*<span class="rr-tactics-word rr-tactics-reach-unit">&lt;i&gt;<\/span>/, 'the words are text');
    const reach = [];
    const row = /<span class="rr-tactics-inline rr-tactics-range-values">([\s\S]*?)<\/span>\s*<\/div>/.exec(T.cardHtml('shared', 'skill', words => { reach.push(words); return words; }))[1];
    assert.deepEqual(parts(row), ['rr-tactics-min', 'to', 'rr-tactics-max', 'tiles (the unit)']);
    assert.ok(reach.includes('{min} to {max} tiles') && !reach.includes('to'), 'asked for as the whole phrase, not word by word');
});

test('every language has the cards\' own words, and its reach holds each number once', () => {
    const world = { globalThis: null };
    world.globalThis = world;
    vm.runInNewContext(read('src/I18nDeepTranslations.js'), world, { filename: 'I18nDeepTranslations.js' });
    const locales = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];
    const fields = row => [...row.matchAll(/rr-tactics-(min|max)"/g)].map(match => match[1]);
    // The lines the row can say are in the card's own code, word for word.
    for (const phrase of ['Its 3D model.', 'Its battler picture.', 'A plain figure in its side\\\'s color.', 'Its 3D model is shown instead.', 'Its tag stays in the Note: the plugin {name} reads it.']) assert.ok(read('src/database/TacticsSection.js').includes(`'${phrase}'`), phrase);
    for (const locale of locales) {
        const words = world.RR_DEEP_TEXT_TRANSLATIONS[locale] || {};
        for (const phrase of ['Shared Combat Settings', ...Object.values(T.CARD_HINTS), 'Tactical Battles', 'Action and First Person Battles', '{min} to {max} tiles', 'Move range', 'Target range', "Uses equipped weapon's range", 'Custom range', 'Area of effect', "Uses equipped weapon's area", 'Radius', 'Length', 'How far away you can select a target.', 'Scope chooses who can be affected; this sets the shape of the area.', 'Tactical targeting preview', 'Preview without an equipped weapon.']) {
            assert.ok(typeof words[phrase] === 'string' && words[phrase] && (words[phrase] !== phrase || ['Radius', 'Length'].includes(phrase)), `${locale}: ${phrase}`);
        }
        // An enemy's picture on the map: the row's label, its button, and each line it can say.
        const look = ['On the map', 'Choose a picture...', 'Its 3D model.', 'Its battler picture.', 'A plain figure in its side\'s color.', 'Its 3D model is shown instead.'];
        for (const phrase of look) assert.ok(typeof words[phrase] === 'string' && words[phrase] && words[phrase] !== phrase && !/[{}<>]/.test(words[phrase]), `${locale}: ${phrase}`);
        assert.equal(new Set(look.map(phrase => words[phrase])).size, look.length, `${locale}: six different lines`);
        assert.match(words['Choose a picture...'], /\.\.\.$/, `${locale}: the button opens a dialog`);
        // The line of a row whose tag a plugin reads: it names the plugin, once.
        const stays = words['Its tag stays in the Note: the plugin {name} reads it.'];
        assert.ok(typeof stays === 'string' && stays !== 'Its tag stays in the Note: the plugin {name} reads it.' && stays.split('{name}').length === 2 && !/[<>]/.test(stays), `${locale}: ${stays}`);
        // The card uses the language's own reach, not the English it falls back to, and the unit follows the numbers.
        const said = words['{min} to {max} tiles'], row = T.reachRow(() => said);
        assert.deepEqual(fields(row), ['min', 'max'], `${locale}: ${said}`);
        assert.doesNotMatch(row, />tiles</, `${locale}: ${said}`);
        assert.match(row, /rr-tactics-reach-unit">[^<]+<\/span>$/, `${locale}: ${said}`);
    }
});

test('each card\'s Automatic clears its own tags and leaves the other card\'s tags and every other line', () => {
    const resetNote = (card, kind, note) => { const done = T.reset(card, kind, { note }); assert.equal(done.rrBattle, undefined); return done.note; };
    const rifle = 'Long barrel.\n<range: 3-9> <los: no>\n<fire rate: 1>\n<magazine: 5>\n<projectile: rocket>\n<move: -1>\nKeep me.';
    assert.equal(resetNote('action', 'weapon', rifle), 'Long barrel.\n<range: 3-9> <los: no>\n<move: -1>\nKeep me.');
    assert.equal(resetNote('shared', 'weapon', rifle), 'Long barrel.\n<fire rate: 1>\n<magazine: 5>\n<projectile: rocket>\n<move: -1>\nKeep me.');
    assert.equal(resetNote('tactical', 'weapon', resetNote('shared', 'weapon', resetNote('action', 'weapon', rifle))), 'Long barrel.\nKeep me.');
    const fire = 'Burns.\n<range: 2-6>\n<area: cone 3>\n<cooldown: 6.5>';
    for (const kind of ['skill', 'item']) {
        assert.equal(resetNote('action', kind, fire), 'Burns.\n<range: 2-6>\n<area: cone 3>', kind);
        assert.equal(resetNote('shared', kind, fire), 'Burns.\n<cooldown: 6.5>', kind);
    }
    // A tag a card has no field for on that kind of record is not its to clear.
    assert.equal(resetNote('shared', 'skill', 'x\n<move: 3>\n<range: 2>'), 'x\n<move: 3>');
    assert.equal(resetNote('action', 'weapon', '<cooldown: 4>\n<combo: 5>'), '<cooldown: 4>');
    assert.equal(resetNote('action', 'skill', '<combo: 5>\n<cooldown: 4>'), '<combo: 5>');
    assert.equal(resetNote('tactical', 'actor', '<move: 6>\n<jump: 2>\n<ai: ranged>\n<fire rate: 2>'), '<ai: ranged>\n<fire rate: 2>');
    assert.equal(resetNote('tactical', 'class', '<move: 5>\n<ai: ranged>'), '<ai: ranged>', 'a class has no Fights field');
    assert.equal(resetNote('tactical', 'armor', 'Heavy.\n<move: -1> <jump: -1>'), 'Heavy.');
    assert.equal(resetNote('action', 'armor', '<move: -1>\n<fire rate: 2>'), '<move: -1>\n<fire rate: 2>', 'an armor has no Action card');
    // A PTBS block is read, never rewritten; a note with nothing of the card's comes back as it was.
    const ptbs = '<PTBS>\nscope: circle(3,0)\n</PTBS>';
    assert.equal(resetNote('shared', 'skill', ptbs + '\n<range: 5>'), ptbs);
    assert.equal(resetNote('shared', 'weapon', 'Plain.\r\nTwo lines.'), 'Plain.\r\nTwo lines.');
    assert.deepEqual(T.ownTags('shared', 'weapon'), ['range', 'area', 'los']);
    assert.deepEqual(T.ownTags('action', 'weapon'), ['fireRate', 'magazine', 'reload', 'spread', 'combo', 'projectile']);
    assert.deepEqual([T.ownTags('shared', 'skill'), T.ownTags('action', 'item'), T.ownTags('tactical', 'enemy'), T.ownTags('action', 'enemy')], [['range', 'area', 'los'], ['cooldown'], ['move', 'jump'], []]);
});

test('each card\'s title line says what the record does in its kind of battle, with "Automatic:" while nothing is set there', () => {
    const say = (card, kind, record) => { const said = T.summarize(card, kind, record, context); return [said.text, said.tagged]; };
    const sword = { id: 2, wtypeId: 2, note: '' };
    assert.deepEqual(say('shared', 'weapon', sword), ['Automatic: Target range 1, One target', false]);
    assert.deepEqual(say('action', 'weapon', sword), ['Automatic: Melee, Combo 3', false]);
    const carbine = { id: 60, wtypeId: 6, note: '<range: 1-5>\n<fire rate: 6>\n<magazine: 24>' };
    assert.deepEqual(say('shared', 'weapon', carbine), ['Target range 1-5, One target', true]);
    assert.deepEqual(say('action', 'weapon', carbine), ['Bullet, 6/s, Magazine 24', true]);
    // What is set in one card says nothing in the other.
    assert.deepEqual(say('shared', 'weapon', { id: 5, wtypeId: 6, note: '<fire rate: 6>' }), ['Automatic: Target range 2-7, One target', false]);
    assert.deepEqual(say('action', 'weapon', { id: 5, wtypeId: 6, note: '<range: 1-5>\n<move: 1>' }), ['Automatic: Bullet, 2.5/s, Magazine 10', false]);
    assert.deepEqual(say('shared', 'weapon', { id: 5, wtypeId: 2, note: '<move: 1>\n<jump: -1>' }), ['Automatic: Target range 1, One target', false]);
    // Skills and items.
    assert.deepEqual(say('shared', 'skill', { id: 1, scope: 1, hitType: 1, note: '' }), ["Automatic: Uses equipped weapon's range · Uses equipped weapon's area", false]);
    assert.deepEqual(say('action', 'skill', { id: 1, scope: 1, hitType: 1, note: '' }), ['Automatic: Cooldown 2 s', false]);
    assert.deepEqual(say('shared', 'skill', { id: 20, scope: 1, hitType: 2, note: '<range: 2-6>\n<los: no>\n<cooldown: 0.5>' }), ['Target range 2-6, One target · no line of sight needed', true]);
    assert.deepEqual(say('action', 'skill', { id: 20, scope: 1, hitType: 2, note: '<range: 2-6>\n<los: no>\n<cooldown: 0.5>' }), ['Cooldown 0.5 s', true]);
    assert.deepEqual(say('shared', 'item', { id: 3, scope: 7, note: '<cooldown: 7>' }), ['Automatic: Target range 0-3, One target', false]);
    assert.deepEqual(say('action', 'item', { id: 3, scope: 7, note: '<cooldown: 7>' }), ['Cooldown 7 s', true]);
    assert.deepEqual(say('action', 'item', { id: 3, scope: 7, note: '' }), ['Automatic: Cooldown 1 s', false]);
    // A reach read from a PTBS block is something the record sets.
    assert.deepEqual(say('shared', 'skill', { id: 30, scope: 1, hitType: 2, note: '<PTBS>\nscope: circle(3,0)\n</PTBS>' }), ['Target range 0-3, One target', true]);
    // Equipment and states add or take away; units move.
    assert.deepEqual(say('tactical', 'armor', { id: 1, note: '' }), ['', false]);
    assert.deepEqual(say('tactical', 'armor', { id: 1, note: '<move: 0>' }), ['', false]);
    assert.deepEqual(say('tactical', 'state', { id: 1, note: '<move: -2>' }), ['Move range -2', true]);
    assert.deepEqual(say('tactical', 'actor', { id: 1, note: '' }), ['Automatic: Move range 4', false]);
    assert.deepEqual(say('tactical', 'enemy', { id: 1, note: '<move: 3>' }), ['Move range 3', true]);
    assert.deepEqual(say('tactical', 'enemy', { id: 1, note: '<ai: ranged>' }), ['Automatic: Move range 4', false]);
    assert.deepEqual(say('tactical', 'class', { id: 1, note: '<ai: ranged>' }), ['Automatic: Move range 4', false], 'a class has no Fights field: nothing of the card\'s is set');
    // Every word goes through the label manager.
    const tt = words => `[${words}]`;
    assert.equal(T.summarize('shared', 'weapon', sword, context, tt).text, '[Automatic]: [Target range] 1, [One target]');
    assert.equal(T.summarize('action', 'weapon', sword, context, tt).text, '[Automatic]: [Melee], [Combo] 3');
    assert.equal(T.summarize('action', 'skill', { note: '' }, context, tt).text, '[Automatic]: [Cooldown] 2 [s]');
});

test('a unit moves and climbs as its own note says, else an actor as its class does, else 4 tiles and 1 level', () => {
    const classes = { 1: { id: 1, note: '<move: 5>' }, 2: { id: 2, note: '<jump: 3>\n<PTBS>\nmove_points: 6\n</PTBS>' }, 3: { id: 3, note: 'Plain.' }, 4: { id: 4, note: '<move: 99>\n<jump: -2>' } };
    const known = Object.assign({ classOf: id => classes[id] || null }, context);
    const of = (kind, record, c = known) => { const s = T.unitStats(kind, record, c); return [s.move, s.jump, s.base.move, s.base.jump, s.own.move, s.own.jump]; };
    assert.deepEqual(of('actor', { classId: 1, note: '' }), [5, 1, 5, 1, false, false], 'the class says how far');
    assert.deepEqual(of('actor', { classId: 2, note: '' }), [6, 3, 6, 3, false, false], 'a class read from a PTBS block and a tag');
    assert.deepEqual(of('actor', { classId: 3, note: '' }), [4, 1, 4, 1, false, false], 'a class that says nothing');
    assert.deepEqual(of('actor', { classId: 9, note: '' }), [4, 1, 4, 1, false, false], 'no such class');
    assert.deepEqual(of('actor', { classId: 1, note: '<move: 2>' }), [2, 1, 5, 1, true, false], 'the actor\'s own tag wins; the empty field would still show the class\'s');
    assert.deepEqual(of('actor', { classId: 2, note: '<jump: 0>' }), [6, 0, 6, 3, false, true]);
    assert.deepEqual(of('actor', { classId: 4, note: '' }), [30, 0, 30, 0, false, false], 'held to what a battle allows');
    // A class and an enemy take after nobody; without the classes an actor is read alone.
    assert.deepEqual(of('class', { classId: 1, note: '' }), [4, 1, 4, 1, false, false]);
    assert.deepEqual(of('enemy', { classId: 1, note: '<move: 7>' }), [7, 1, 4, 1, true, false]);
    assert.deepEqual(of('actor', { classId: 1, note: '' }, context), [4, 1, 4, 1, false, false]);
    assert.deepEqual(of('actor', null), [4, 1, 4, 1, false, false]);
    // The battle reads it in the same order (reactor_fight_tactical.js, unitStat).
    assert.match(read('../runtime/reactor_fight_tactical.js'), /base = own && own\[key\] !== null \? own\[key\] : cls && cls\[key\] !== null \? cls\[key\] : null;/);
    assert.match(read('../runtime/reactor_fight_tactical.js'), /return clamp\(value, 0, 30\);/);
    // The title line says the number the unit gets.
    const say = (kind, record) => { const said = T.summarize('tactical', kind, record, known); return [said.text, said.tagged]; };
    assert.deepEqual(say('actor', { classId: 1, note: '' }), ['Automatic: Move range 5', false]);
    assert.deepEqual(say('actor', { classId: 1, note: '<jump: 2>' }), ['Move range 5', true]);
    assert.deepEqual(say('actor', { classId: 1, note: '<move: 3>' }), ['Move range 3', true]);
    assert.deepEqual(say('class', { id: 1, note: '<move: 5>' }), ['Move range 5', true]);
});

test('the drawn picture is an even grid of whole-pixel cells at any size', () => {
    const paint = radius => {
        const rects = [], lines = [], alphas = [];
        let alpha = 1;
        const ctx = { clearRect() {}, fillRect(x, y, w, h) { rects.push([x, y, w, h]); }, strokeRect() {}, beginPath() {}, moveTo(x, y) { lines.push([x, y]); }, lineTo() {}, stroke() { alphas.push(alpha); }, arc() {}, fill() {},
            set fillStyle(v) {}, set strokeStyle(v) {}, set globalAlpha(v) { alpha = v; }, set lineWidth(v) {} };
        const shown = T.picture(T.effective('skill', { id: 2, scope: 1, hitType: 0, note: `<range: 1-${radius - 1}>` }, context), null);
        assert.equal(shown.radius, radius);
        T.drawGrid({ width: 198, height: 198, getContext: () => ctx }, shown);
        return { rects, lines, alphas, shown };
    };
    for (const radius of [5, 10, 12, 16, 17, 24, 31]) {
        const { rects, lines, alphas, shown } = paint(radius);
        const count = radius * 2 + 1;
        // The background, then one rect per reach cell: whole pixels, inside the picture, and neighbors meet with no gap or overlap.
        const cells = rects.slice(1, 1 + shown.reach.length);
        assert.equal(cells.length, shown.reach.length, `radius ${radius}: every reach cell is painted`);
        const at = new Map(shown.reach.map((c, i) => [c.x + ',' + c.y, cells[i]]));
        for (const [x, y, w, h] of cells) {
            assert.ok([x, y, w, h].every(Number.isInteger) && w > 0 && h > 0, `radius ${radius}: whole pixels`);
            assert.ok(x >= 0 && y >= 0 && x + w <= 198 && y + h <= 198, `radius ${radius}: inside the picture`);
        }
        for (const c of shown.reach) {
            const here = at.get(c.x + ',' + c.y), right = at.get((c.x + 1) + ',' + c.y), below = at.get(c.x + ',' + (c.y + 1));
            if (right) assert.equal(here[0] + here[2], right[0], `radius ${radius}: no seam between ${c.x},${c.y} and the cell to its right`);
            if (below) assert.equal(here[1] + here[3], below[1], `radius ${radius}: no seam between ${c.x},${c.y} and the cell below`);
        }
        // One line at every cell edge each way (never a line skipped or doubled), at evenly growing positions.
        assert.equal(lines.length, (count + 1) * 2, `radius ${radius}: a line at every cell edge`);
        const xs = lines.filter((_, i) => i % 2 === 0).map(l => l[0]);
        for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1] && xs[i] - xs[i - 1] <= Math.ceil(198 / count) + 0.5, `radius ${radius}: lines evenly spaced`);
        // The grid is drawn fainter when cells are small, never invisible.
        const grid = alphas[0];
        if (198 / count >= 8) assert.equal(grid, 1); else assert.ok(grid >= 0.35 && grid < 1, `radius ${radius}: faint lines (${grid})`);
    }
});

//-----------------------------------------------------------------------------
// The cards themselves, built and used on a page small enough for Node: their
// own markup parsed into elements, events that travel up as in a browser, and
// the shared folding code (src/utils/DatabaseSections.js) on top.

const { createElement, createTextNode } = require('./helpers/mini-dom.cjs');
const S = require('../src/utils/DatabaseSections.js');

function pageElement(tag) {
    const node = createElement(tag);
    node.nodeType = 1;
    node.hidden = false;
    // A field holds text, whatever it is given.
    let held = '';
    // A multi-line field hands its text back with every line end a line feed, as a browser's does.
    Object.defineProperty(node, 'value', { get: () => held, set: next => { held = node.tagName === 'TEXTAREA' ? String(next).replace(/\r\n?/g, '\n') : String(next); }, enumerable: true });
    if (node.tagName === 'CANVAS') {
        node.draws = 0;
        // No drawing surface here; the picture's cells have their own tests above.
        node.getContext = () => { node.draws++; return null; };
    }
    Object.defineProperty(node, 'innerHTML', { get: () => '', set: html => parseInto(node, html) });
    // An element knows the document it stands in: that is where the focus is asked for.
    Object.defineProperty(node, 'ownerDocument', { get: () => { let top = node; while (top.parentNode) top = top.parentNode; return top.tagName === 'DOCUMENT' ? top : null; } });
    // The cards look for the detail pane by its id.
    const byClassOrTag = node.closest.bind(node);
    node.closest = selector => {
        if (selector[0] !== '#') return byClassOrTag(selector);
        for (let at = node; at; at = at.parentNode) if (at.id === selector.slice(1)) return at;
        return null;
    };
    node.dispatchEvent = event => {
        const sent = Object.assign({ preventDefault() {} }, event, { target: node, detail: event.detail });
        for (let at = node; at; at = at.parentNode) {
            if (at.fire) at.fire(event.type, sent);
            if (!event.bubbles) break;
        }
        return true;
    };
    return node;
}

/** The markup the cards write (tags, quoted attributes, text), as elements. */
function parseInto(target, html) {
    target.replaceChildren();
    const open = [target];
    for (const [, close, tag, attributes, words] of String(html).matchAll(/<\/([a-z]+)>|<([a-z]+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>|([^<]+)/g)) {
        const top = open[open.length - 1];
        if (close) { open.pop(); continue; }
        if (!tag) { if (words.trim()) top.appendChild(createTextNode(words.trim())); continue; }
        const node = pageElement(tag);
        for (const [, key, value] of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
            if (key === 'class') node.className = value;
            else if (key === 'hidden') node.hidden = true;
            else if (key === 'value') node.value = value;
            else node.setAttribute(key, value === undefined ? '' : value);
        }
        top.appendChild(node);
        if (tag !== 'input') open.push(node);
    }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const database = { getSystem: () => ({ weaponTypes: context.weaponTypes }) };

/**
 * A Database detail pane showing one record: the page's own fields (the
 * Note, and the fields the cards follow), a Traits card, and what
 * createSection gave the page, in a two-column grid as on Weapons.
 */
function showRecord(detail, kind, record, extra = {}) {
    const field = (tag, name, value) => {
        const node = pageElement(tag);
        node.setAttribute('data-field', name);
        node.setAttribute(`data-${kind}-id`, String(record.id));
        node.value = String(value);
        // The page keeps the record when a field of it changes, as every Database page does.
        node.addEventListener('change', () => { record[name] = name === 'note' ? node.value : Number(node.value); });
        return node;
    };
    const note = field('textarea', 'note', record.note === undefined ? '' : record.note);
    const others = {};
    for (const name of extra.fields || []) others[name] = field('select', name, record[name]);
    const grid = pageElement('div');
    grid.className = 'database-sections-grid';
    const traits = pageElement('div');
    traits.className = 'database-section';
    traits.innerHTML = '<div class="database-section-header" data-section-key="traits">Traits</div><div class="database-section-content"></div>';
    globalThis.document = { createElement: pageElement };
    let placed;
    try { placed = T.createSection(Object.assign({ kind, record, databaseManager: extra.database || database }, extra.options)); } finally { delete globalThis.document; }
    // What the cards say before the page has placed them and before any timer has run.
    const first = (placed.className === 'rr-battle-cards' ? placed.children : [placed]).map(card => card.querySelector('.rr-tactics-summary').textContent);
    grid.append(traits, placed, note, ...Object.values(others));
    detail.replaceChildren(grid);
    const cards = placed.className === 'rr-battle-cards' ? placed.children : [placed];
    const part = (card, selector) => card.querySelector(selector);
    return {
        grid, traits, placed, note, fields: others, cards, first,
        primary: cards[0], shared: cards.find(card => card.dataset.card === 'shared') || null, movement: cards.find(card => card.dataset.card === 'tactical') || null, action: cards.find(card => card.dataset.card === 'action') || null,
        summary: card => part(card, '.rr-tactics-summary').textContent,
        chip: card => part(card, '.rr-tactics-reset'),
        /** What a user does to a field: its value set, then the change said. */
        set(element, value) { element.value = String(value); element.dispatchEvent({ type: 'change', bubbles: true }); },
        type(text) { note.value = text; note.dispatchEvent({ type: 'input', bubbles: true }); }
    };
}

/** The pane every record of a Database page is shown in: one element for as long as the editor runs. */
function detailPane() {
    const page = createElement('document'), detail = pageElement('div');
    detail.id = 'database-detail';
    page.appendChild(detail);
    return detail;
}

test('records get separate shared, Tactical and Action cards only where their fields apply', async () => {
    for (const [kind, record] of [['weapon', { id: 5, wtypeId: 6, note: '' }], ['skill', { id: 9, scope: 1, hitType: 2, note: '' }], ['item', { id: 3, scope: 7, hitType: 0, note: '' }]]) {
        const page = showRecord(detailPane(), kind, record);
        await tick();
        assert.equal(page.placed.className, 'rr-battle-cards', kind);
        const expected = [['sharedCombat', 'map-battles', 'Shared Combat Settings']];
        if (kind === 'weapon') expected.push(['tactics', 'tactical-battles', 'Tactical Battles']);
        expected.push(['action', 'action-battles', 'Action and First Person Battles']);
        assert.deepEqual(page.cards.map(card => [card.dataset.sectionKey, card.dataset.sectionDefault, card.querySelector('.rr-tactics-title').textContent]), expected, kind);
        assert.ok(page.cards.every(card => card.className === 'database-section rr-tactics-section' && card.children.length === 2), 'a title line and a body each');
        assert.deepEqual(page.placed.querySelectorAll('[role="tab"]'), [], 'no tabs');
        assert.ok(page.cards.every(card => !page.summary(card) || page.summary(card).startsWith('Automatic: ')), kind + ': each says what the untouched record does');
        assert.ok(page.cards.every(card => page.chip(card).hidden), 'nothing to set back');
        assert.ok(page.cards.every(card => card.dataset.sectionInUse === undefined), 'and nothing that asks to be shown');
    }
    // Made, a card already says what its record does: the page never shows one empty for a moment.
    const made = showRecord(detailPane(), 'weapon', { id: 5, wtypeId: 6, note: '<magazine: 40>' });
    assert.deepEqual(made.first, ['Automatic: Target range 2-7, One target', '', 'Bullet, 2.5/s, Magazine 40']);
    assert.deepEqual([made.primary.querySelector('.rr-tactics-max').placeholder, made.action.querySelector('.rr-combat-magazine').value], ['7', '40']);
    assert.deepEqual([made.chip(made.primary).hidden, made.chip(made.action).hidden], [true, false]);
    // The whole line is also the summary's tooltip, for a card too narrow to show it.
    assert.deepEqual(made.cards.map(card => card.querySelector('.rr-tactics-summary').title), made.first);
    for (const kind of ['armor', 'state', 'actor', 'class', 'enemy']) {
        const page = showRecord(detailPane(), kind, { id: 4, note: '' });
        const shared = kind === 'actor' || kind === 'enemy';
        assert.equal(page.placed.className, shared ? 'rr-battle-cards' : 'database-section rr-tactics-section', kind);
        assert.deepEqual([page.movement.dataset.sectionKey, page.movement.dataset.sectionDefault, page.action], ['tactics', 'tactical-battles', null], kind);
        assert.equal(page.movement.querySelector('.rr-tactics-title').textContent, 'Tactical Battles', kind);
        if (shared) assert.deepEqual([page.shared.dataset.sectionKey, page.shared.dataset.sectionDefault, page.shared.querySelector('.rr-tactics-title').textContent], ['sharedCombat', 'map-battles', 'Shared Combat Settings']);
    }
});

test('each card\'s Automatic chip sets back that card alone, and a field of one card leaves the other as it was', async () => {
    const rifle = { id: 5, wtypeId: 6, note: 'Long barrel.\n<range: 3-9>\n<fire rate: 1>\n<magazine: 5>\n<move: 1>' };
    const page = showRecord(detailPane(), 'weapon', rifle);
    await tick();
    assert.deepEqual([page.summary(page.primary), page.summary(page.action)], ['Target range 3-9, One target', 'Bullet, 1/s, Magazine 5']);
    assert.deepEqual([page.chip(page.primary).hidden, page.chip(page.action).hidden], [false, false]);
    page.chip(page.action).dispatchEvent({ type: 'click', bubbles: true, preventDefault() {} });
    assert.equal(page.note.value, 'Long barrel.\n<range: 3-9>\n<move: 1>', 'the Action tags are gone, the Tactical ones stay');
    assert.equal(rifle.note, page.note.value, 'and the page kept the change');
    assert.equal('rrBattle' in rifle, false, 'taking tags out gives the record no settings');
    assert.deepEqual([page.summary(page.primary), page.summary(page.action)], ['Target range 3-9, One target', 'Automatic: Bullet, 2.5/s, Magazine 10']);
    assert.deepEqual([page.chip(page.primary).hidden, page.chip(page.action).hidden], [false, true]);
    page.chip(page.primary).dispatchEvent({ type: 'click', bubbles: true, preventDefault() {} });
    assert.equal(page.note.value, 'Long barrel.\n<move: 1>');
    page.chip(page.movement).dispatchEvent({ type: 'click', bubbles: true, preventDefault() {} });
    assert.equal(page.note.value, 'Long barrel.');
    assert.deepEqual([page.summary(page.primary), page.summary(page.action)], ['Automatic: Target range 2-7, One target', 'Automatic: Bullet, 2.5/s, Magazine 10']);
    // A value typed in a field of one card is that card's setting, in the record; the Note is not written to.
    page.set(page.action.querySelector('.rr-combat-magazine'), 40);
    assert.deepEqual([page.note.value, rifle.rrBattle], ['Long barrel.', { magazine: 40 }]);
    assert.deepEqual([page.summary(page.primary), page.chip(page.primary).hidden], ['Automatic: Target range 2-7, One target', true]);
    assert.deepEqual([page.summary(page.action), page.chip(page.action).hidden], ['Bullet, 2.5/s, Magazine 40', false]);
    page.set(page.primary.querySelector('.rr-tactics-max'), 9);
    assert.deepEqual([page.note.value, rifle.rrBattle], ['Long barrel.', { magazine: 40, range: { min: 2, max: 9 } }]);
    assert.deepEqual([page.summary(page.primary), page.summary(page.action)], ['Target range 2-9, One target', 'Bullet, 2.5/s, Magazine 40']);
    // The type's own value in a field keeps nothing, and the field goes back to showing it as what the record gets.
    const magazine = page.action.querySelector('.rr-combat-magazine');
    page.set(magazine, 10);
    assert.deepEqual([page.note.value, rifle.rrBattle], ['Long barrel.', { range: { min: 2, max: 9 } }]);
    assert.deepEqual([magazine.value, magazine.placeholder], ['', '10']);
    // The chip of a card takes its own settings out of the record and leaves the other card's.
    page.set(magazine, 40);
    page.chip(page.primary).dispatchEvent({ type: 'click', bubbles: true, preventDefault() {} });
    assert.deepEqual([page.note.value, rifle.rrBattle, page.chip(page.primary).hidden, page.chip(page.action).hidden], ['Long barrel.', { magazine: 40 }, true, false]);
    page.chip(page.action).dispatchEvent({ type: 'click', bubbles: true, preventDefault() {} });
    assert.deepEqual([page.note.value, 'rrBattle' in rifle, page.chip(page.action).hidden], ['Long barrel.', false, true], 'nothing left: the record has no rrBattle');
    // A skill's cooldown and its reach are as separate.
    const fire = { id: 20, scope: 1, hitType: 2, note: 'Burns.' };
    const skill = showRecord(detailPane(), 'skill', fire);
    await tick();
    skill.set(skill.action.querySelector('.rr-combat-cooldown'), 6.5);
    skill.set(skill.primary.querySelector('.rr-tactics-max'), 6);
    assert.deepEqual([skill.note.value, fire.rrBattle], ['Burns.', { cooldown: 6.5, range: { min: 1, max: 6 } }]);
    skill.chip(skill.primary).dispatchEvent({ type: 'click', bubbles: true, preventDefault() {} });
    assert.deepEqual([skill.note.value, fire.rrBattle], ['Burns.', { cooldown: 6.5 }]);
    assert.deepEqual([skill.summary(skill.primary), skill.summary(skill.action)], ['Automatic: Target range 1-4, One target', 'Cooldown 6.5 s']);
});

test('the Automatic chip is there only while it has something to take out, and the focus it held stays on its card', async () => {
    // A reach read from a PTBS block is the record's, but no tag the card could clear.
    const ptbs = '<PTBS>\nscope: circle(3,0)\naoe: circle(2,0)\nmove_points: 4\n</PTBS>';
    const page = showRecord(detailPane(), 'weapon', { id: 5, wtypeId: 2, note: ptbs });
    await tick();
    assert.equal(page.summary(page.primary), 'Target range 0-3, Circle 2');
    assert.equal(page.chip(page.primary).hidden, true, 'nothing the chip could take out');
    assert.equal(page.primary.dataset.sectionInUse, 'true', 'the card is still one the record uses');
    // A plain tag beside the block is the chip's to clear, and the block stays.
    page.type(ptbs + '\n<range: 5>');
    assert.deepEqual([page.summary(page.primary), page.chip(page.primary).hidden], ['Target range 1-5, Circle 2', false]);
    page.chip(page.primary).dispatchEvent({ type: 'click', bubbles: true });
    assert.deepEqual([page.note.value, page.chip(page.primary).hidden], [ptbs, true]);
    // A class has no Fights field: its <ai:> tag is nothing of the card's.
    const cls = showRecord(detailPane(), 'class', { id: 2, note: '<ai: ranged>' });
    await tick();
    assert.equal(cls.chip(cls.primary).hidden, true);
    // A tag that changes nothing sets nothing: there is nothing to set back.
    const plate = showRecord(detailPane(), 'armor', { id: 2, note: 'Heavy.\n<move: 0>' });
    await tick();
    assert.deepEqual([plate.summary(plate.primary), plate.chip(plate.primary).hidden], ['', true]);
    // Pressed with a key the chip holds the focus; when it leaves, the focus goes to its card's title line.
    const rifle = showRecord(detailPane(), 'weapon', { id: 5, wtypeId: 6, note: '<range: 3-9>\n<magazine: 5>\n<reload: 3>' });
    await tick();
    const chip = rifle.chip(rifle.action), title = rifle.action.querySelector('.rr-tactics-header'), page0 = rifle.action.ownerDocument;
    chip.focus();
    assert.ok(page0.activeElement === chip);
    chip.dispatchEvent({ type: 'click', bubbles: true });
    assert.deepEqual([rifle.note.value, chip.hidden], ['<range: 3-9>', true]);
    assert.ok(page0.activeElement === title, 'the focus is on the title line of the same card');
    // A chip that stays keeps the focus; a chip that did not hold it moves nothing.
    const other = rifle.chip(rifle.primary);
    rifle.note.focus();
    other.dispatchEvent({ type: 'click', bubbles: true });
    assert.deepEqual([rifle.note.value, other.hidden, page0.activeElement === rifle.note], ['', true, true]);
});

test('a change draws each open card once, and weapon range inheritance has its own control', async () => {
    const page = showRecord(detailPane(), 'weapon', { id: 5, wtypeId: 6, note: '' });
    await tick();
    const grid = page.primary.querySelector('canvas'), cone = page.action.querySelector('canvas');
    const drawn = () => [grid.draws, cone.draws];
    let before = drawn();
    page.set(page.action.querySelector('.rr-combat-magazine'), 30);
    assert.deepEqual(drawn(), [before[0] + 1, before[1] + 1], 'a field of a card: one drawing of each card');
    before = drawn();
    page.chip(page.action).dispatchEvent({ type: 'click', bubbles: true });
    assert.deepEqual(drawn(), [before[0] + 1, before[1] + 1], 'the chip');
    before = drawn();
    page.type('<range: 1-12>');
    assert.deepEqual(drawn(), [before[0] + 1, before[1] + 1], 'the Note typed by hand');
    // Inherited weapon distance is an explicit choice, with numeric fields shown for custom range.
    const attackSkill = { id: 1, scope: 1, hitType: 1, note: '' };
    const attack = showRecord(detailPane(), 'skill', attackSkill);
    await tick();
    const min = attack.primary.querySelector('.rr-tactics-min'), max = attack.primary.querySelector('.rr-tactics-max'), unit = attack.primary.querySelector('.rr-tactics-reach-unit');
    const source = attack.primary.querySelector('.rr-tactics-range-source'), values = attack.primary.querySelector('.rr-tactics-range-values');
    assert.deepEqual([source.hidden, source.value, values.hidden, min.placeholder, max.placeholder], [false, '', true, '1', '1']);
    assert.ok(source.textContent.includes("Uses equipped weapon's range"));
    attack.set(source, 'custom');
    assert.deepEqual(attackSkill.rrBattle.range, { min: 1, max: 1 });
    assert.equal(values.hidden, false);
    attack.set(max, 3);
    assert.deepEqual([attack.note.value, attackSkill.rrBattle], ['', { range: { min: 1, max: 3 } }]);
    assert.deepEqual([min.value, max.value, values.hidden, source.value], ['1', '3', false, 'custom']);
    assert.equal(unit.textContent, 'tiles');
    attack.set(source, '');
    assert.equal(attackSkill.rrBattle, undefined);
    assert.equal(values.hidden, true);
});

test('area dimensions have labels and units, edit defaults, and stay separate from target distance', async () => {
    const skill = { id: 20, scope: 2, hitType: 2, note: '' };
    const page = showRecord(detailPane(), 'skill', skill);
    await tick();
    const card = page.primary;
    const shape = card.querySelector('.rr-tactics-shape'), size = card.querySelector('.rr-tactics-size');
    const label = card.querySelector('.rr-tactics-size-label'), values = card.querySelector('.rr-tactics-size-values');
    assert.deepEqual([label.textContent, label.hidden, size.value, size.disabled], ['Radius', false, '2', false]);
    assert.equal(values.querySelector('.rr-tactics-word').textContent, 'tiles');
    page.set(size, 4);
    assert.deepEqual(skill.rrBattle, { area: { shape: 'circle', size: 4 } });
    assert.ok(shape.textContent.startsWith('Automatic: Circle 2'), 'Automatic describes the actual default, not the current override');
    for (const form of ['line', 'cone', 'square', 'cross']) {
        page.set(shape, form);
        assert.equal(label.textContent, ['line', 'cone'].includes(form) ? 'Length' : 'Radius');
        assert.equal(values.hidden, false);
        assert.equal(skill.rrBattle.range, undefined, 'changing the area leaves the distance alone');
    }
    for (const form of ['single', 'self', 'all']) {
        page.set(shape, form);
        assert.equal(label.hidden, true);
        assert.equal(values.hidden, true);
        assert.equal(card.querySelector('.rr-tactics-range').hidden, form !== 'single');
    }
    page.set(shape, '');
    assert.equal(skill.rrBattle, undefined);
    assert.deepEqual([label.textContent, size.value, size.disabled], ['Radius', '2', false]);
});

test('an actor\'s card shows what its class gives it, in numbers, and follows the Class field', async () => {
    // One class says it in its Note, the other in its own settings.
    const classes = { 1: { id: 1, note: '<move: 5>' }, 2: { id: 2, note: '<move: 9>', rrBattle: { move: 3, jump: 2 } } };
    const withClasses = { getSystem: database.getSystem, getClass: id => classes[id] || null };
    const actor = { id: 1, classId: 1, note: '' };
    const page = showRecord(detailPane(), 'actor', actor, { fields: ['classId'], database: withClasses });
    await tick();
    const move = page.movement.querySelector('.rr-tactics-move'), jump = page.movement.querySelector('.rr-tactics-jump'), legend = page.movement.querySelector('.rr-tactics-legend');
    assert.deepEqual([move.value, move.placeholder, jump.value, jump.placeholder], ['', '5', '', '1'], 'empty fields show the class\'s numbers, not a word');
    assert.deepEqual([page.summary(page.movement), legend.textContent, page.chip(page.movement).hidden], ['Automatic: Move range 5', 'Move range 5', true]);
    // Another class is picked on the page.
    page.set(page.fields.classId, 2);
    assert.equal(actor.classId, 2);
    assert.deepEqual([move.placeholder, jump.placeholder, page.summary(page.movement), legend.textContent], ['3', '2', 'Automatic: Move range 3', 'Move range 3']);
    // The actor's own number wins and is the chip's to clear; the empty Climb field goes on showing the class's.
    page.set(move, 6);
    assert.deepEqual([page.note.value, actor.rrBattle], ['', { move: 6 }]);
    assert.deepEqual([move.value, move.placeholder, jump.placeholder, page.summary(page.movement), legend.textContent, page.chip(page.movement).hidden], ['6', '3', '2', 'Move range 6', 'Move range 6', false]);
    // A class and an enemy have their own numbers only.
    const enemy = showRecord(detailPane(), 'enemy', { id: 3, classId: 1, note: '' }, { database: withClasses });
    await tick();
    assert.deepEqual([enemy.movement.querySelector('.rr-tactics-move').placeholder, enemy.movement.querySelector('.rr-tactics-jump').placeholder, enemy.summary(enemy.movement)], ['4', '1', 'Automatic: Move range 4']);
});

test('both cards follow the Note typed by hand and the page\'s own fields', async () => {
    const weapon = { id: 5, wtypeId: 6, note: '' };
    const page = showRecord(detailPane(), 'weapon', weapon, { fields: ['wtypeId'] });
    await tick();
    page.type('<magazine: 40>\n<range: 1-3>');
    assert.deepEqual([page.summary(page.primary), page.summary(page.action)], ['Target range 1-3, One target', 'Bullet, 2.5/s, Magazine 40']);
    assert.deepEqual([page.primary.querySelector('.rr-tactics-max').value, page.action.querySelector('.rr-combat-magazine').value], ['3', '40']);
    page.type('');
    // The weapon becomes a sword: a blade has a combo and no magazine.
    page.set(page.fields.wtypeId, 2);
    assert.equal(weapon.wtypeId, 2);
    assert.deepEqual([page.summary(page.primary), page.summary(page.action)], ['Automatic: Target range 1, One target', 'Automatic: Melee, Combo 3']);
    assert.deepEqual(['magazine', 'reload', 'spread', 'combo'].map(key => page.action.querySelector(`[data-combat="${key}"]`).hidden), [true, true, true, false]);
    // A skill told to hit physically leaves its reach to the weapon; its cooldown stays its own.
    const slash = { id: 9, scope: 1, hitType: 2, note: '' };
    const skill = showRecord(detailPane(), 'skill', slash, { fields: ['scope', 'hitType'] });
    await tick();
    skill.set(skill.fields.hitType, 1);
    assert.deepEqual([skill.summary(skill.primary), skill.summary(skill.action)], ["Automatic: Uses equipped weapon's range · Uses equipped weapon's area", 'Automatic: Cooldown 2 s']);
    skill.set(skill.fields.scope, 11);
    assert.equal(skill.summary(skill.primary), 'Automatic: The user');
});

test('the cards of a record shown earlier never act on the record shown now', async () => {
    const detail = detailPane();
    const first = { id: 9, scope: 1, hitType: 2, note: '' }, second = { id: 10, scope: 1, hitType: 2, note: '' };
    const earlier = showRecord(detail, 'skill', first, { fields: ['scope', 'hitType'] });
    await tick();
    assert.equal((detail.listeners.change || []).length, 1, 'one listener for the two cards of a record');
    const now = showRecord(detail, 'skill', second, { fields: ['scope', 'hitType'] });
    await tick();
    now.set(now.fields.scope, 2);
    now.set(now.fields.hitType, 1);
    assert.deepEqual([second.scope, second.hitType], [2, 1]);
    assert.deepEqual([first.scope, first.hitType], [1, 2], 'the record shown before keeps its own Scope and Hit Type');
    assert.equal(now.summary(now.primary), "Automatic: Uses equipped weapon's range · Uses equipped weapon's area");
    assert.equal(earlier.summary(earlier.primary), 'Automatic: Target range 1-4, One target', 'and its cards are not redrawn');
    assert.deepEqual([(detail.listeners.change || []).length, (detail.listeners.input || []).length], [1, 1], 'its listeners took themselves off the pane');
    // Twenty records later the pane still carries the listeners of the one on screen and no more.
    for (let id = 11; id <= 30; id++) {
        const page = showRecord(detail, 'skill', { id, scope: 1, hitType: 2, note: '' }, { fields: ['scope'] });
        await tick();
        page.set(page.fields.scope, 2);
    }
    assert.deepEqual([(detail.listeners.change || []).length, (detail.listeners.input || []).length], [1, 1]);
    // Records only looked at, with nothing changed on any of them: the pane keeps no listener of a record that left it.
    for (let id = 31; id <= 50; id++) {
        showRecord(detail, 'skill', { id, scope: 1, hitType: 2, note: '' }, { fields: ['scope'] });
        await tick();
    }
    assert.deepEqual([(detail.listeners.change || []).length, (detail.listeners.input || []).length], [1, 1]);
    // Two records clicked one right after the other: the one that never stood on the pane leaves nothing on it.
    showRecord(detail, 'weapon', { id: 5, wtypeId: 6, note: '' });
    const last = { id: 6, wtypeId: 2, note: '' };
    showRecord(detail, 'weapon', last);
    await tick();
    assert.deepEqual([(detail.listeners.change || []).length, (detail.listeners.input || []).length], [1, 1]);
    // The pane goes on to a page with no battle cards: whatever is changed there, the cards that left do
    // nothing with it and stop listening.
    const elsewhere = pageElement('select');
    elsewhere.setAttribute('data-field', 'wtypeId');
    elsewhere.value = '6';
    detail.replaceChildren(elsewhere);
    elsewhere.dispatchEvent({ type: 'change', bubbles: true });
    assert.equal(last.wtypeId, 2);
    assert.deepEqual([(detail.listeners.change || []).length, (detail.listeners.input || []).length], [0, 0]);
});

test('the page is heard for this record\'s fields alone, and typing only in the Note', () => {
    const host = createElement('div'), anchor = createElement('div'), heard = [];
    host.appendChild(anchor);
    const field = (name, owner, inside) => {
        const node = createElement('select');
        node.setAttribute('data-field', name);
        if (owner !== undefined) node.setAttribute('data-skill-id', String(owner));
        node.value = '7';
        (inside ? anchor : host).appendChild(node);
        return node;
    };
    const stop = T.watchPage(host, anchor, 'skill', 9, (name, value) => heard.push([name, value]));
    host.fire('change', { target: field('scope', 9) });
    host.fire('change', { target: field('hitType', 9) });
    host.fire('change', { target: field('note', 9) });
    host.fire('change', { target: field('wtypeId') });
    assert.deepEqual(heard, [['scope', '7'], ['hitType', '7'], ['note', '7'], ['wtypeId', '7']], 'a field that names no record is the page\'s own');
    heard.length = 0;
    host.fire('change', { target: field('scope', 10) });
    host.fire('change', { target: field('name', 9) });
    host.fire('change', { target: field('scope', 9, true) });
    host.fire('change', { target: createElement('div') });
    host.fire('input', { type: 'input', target: field('scope', 9) });
    assert.deepEqual(heard, [], 'another record\'s field, another field, a field of the cards themselves, a change of a choice still being made');
    host.fire('input', { type: 'input', target: field('note', 9) });
    assert.deepEqual(heard, [['note', '7']]);
    stop();
    host.fire('change', { target: field('scope', 9) });
    assert.equal(heard.length, 1);
    assert.deepEqual([host.listeners.change.length, host.listeners.input.length], [0, 0]);
});

/** The shared folding code on a pane, with what the project fights given by `modes()`. */
function foldingOn(detail, grid, store, modes) {
    const view = {
        getComputedStyle: element => ({ gridTemplateColumns: element === grid() ? '500px 500px' : '' }),
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; this.bubbles = init.bubbles; } }
    };
    return S.attach(detail, { store, view, page: () => 'weapons', project: () => '/game', defaults: (page, key, section) => S.battleCardFolded(key, section, modes) });
}
const memory = () => { const map = new Map(); return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)) }; };
const isFolded = card => card.classList.contains('is-collapsed');

test('nobody having touched them, each card is open when the project fights its way or the record uses it, and folded otherwise', async () => {
    const detail = detailPane(), store = S.createStore({ storage: memory() });
    let modes = { tactical: false, action: false }, page = null;
    const sections = foldingOn(detail, () => page.grid, store, () => modes);
    const show = async note => { page = showRecord(detail, 'weapon', { id: 5, wtypeId: 6, note }); sections.refresh(); await tick(); return [isFolded(page.primary), isFolded(page.action)]; };
    assert.deepEqual(await show(''), [true, true], 'Classic only: both folded');
    // Two folded cards are two title lines across the row, as one folded card is; the card beside them takes its own row.
    assert.deepEqual([page.placed.classList.contains('is-collapsed'), page.placed.classList.contains('rr-section-solo'), page.traits.classList.contains('rr-section-solo')], [true, true, true]);
    modes = { tactical: true, action: false };
    assert.deepEqual(await show(''), [false, true], 'a Tactical game: Tactical open, Action folded');
    assert.deepEqual([page.placed.classList.contains('is-collapsed'), page.placed.classList.contains('rr-section-solo'), page.traits.classList.contains('rr-section-solo')], [false, false, false], 'with a card open the two stay beside Traits');
    modes = { tactical: false, action: true };
    assert.deepEqual(await show(''), [false, false], 'an Action map: shared targeting and Action open');
    modes = { tactical: false, action: false };
    assert.deepEqual(await show('<magazine: 5>'), [true, false], 'a record with Action tags in a Classic game: its Action card open');
    assert.equal(page.action.dataset.sectionInUse, 'true');
    assert.deepEqual(await show('<range: 2-9>'), [false, true], 'and one with Tactical tags: its Tactical card');
    assert.deepEqual(await show('<move: 1>\n<combo: 4>'), [true, false]);
    assert.deepEqual(await show(''), [true, true], 'the next record, with nothing set, is folded again');
    // Folded by hand, a card stays folded on a record that uses it; opened by hand, it stays open on one that does not.
    await show('<magazine: 5>');
    page.action.querySelector('.rr-tactics-title').dispatchEvent({ type: 'click', bubbles: true });
    assert.deepEqual([isFolded(page.primary), isFolded(page.action)], [true, true]);
    assert.deepEqual([store.get('/game', 'weapons', 'action'), store.get('/game', 'weapons', 'tactics')], [true, undefined], 'each card is remembered by itself');
    assert.deepEqual(await show('<magazine: 5>'), [true, true]);
    page.primary.querySelector('.rr-tactics-summary').dispatchEvent({ type: 'click', bubbles: true });
    assert.deepEqual(await show(''), [false, true]);
    assert.equal(store.get('/game', 'weapons', 'sharedCombat'), false);
    // The Automatic chip in a title line is the chip's click, not a fold.
    await show('<range: 2-9>');
    page.chip(page.primary).dispatchEvent({ type: 'click', bubbles: true, preventDefault() {} });
    assert.deepEqual([isFolded(page.primary), page.note.value], [false, '']);
});

test('a folded card draws nothing, draws when it opens, and the other card goes on drawing', async () => {
    const detail = detailPane(), store = S.createStore({ storage: memory() });
    let page = null;
    const sections = foldingOn(detail, () => page.grid, store, () => ({ tactical: false, action: true }));
    page = showRecord(detail, 'weapon', { id: 5, wtypeId: 6, note: '' });
    sections.refresh();
    await tick();
    const grid = page.primary.querySelector('canvas'), cone = page.action.querySelector('canvas');
    assert.deepEqual([isFolded(page.primary), isFolded(page.action)], [false, false]);
    page.primary.querySelector('.rr-tactics-title').dispatchEvent({ type: 'click', bubbles: true });
    const before = [grid.draws, cone.draws];
    page.type('<range: 1-12>\n<spread: 9>');
    page.set(page.action.querySelector('.rr-combat-magazine'), 30);
    assert.equal(grid.draws, before[0], 'nothing is drawn under the folded card');
    assert.ok(cone.draws > before[1], 'the open card draws');
    assert.equal(page.summary(page.primary), 'Target range 1-12, One target', 'folded, its title line still says what the record does');
    page.primary.querySelector('.rr-tactics-title').dispatchEvent({ type: 'click', bubbles: true });
    assert.equal(isFolded(page.primary), false);
    assert.equal(grid.draws, before[0] + 1, 'opened, the picture is drawn once');
    // Folding the other card by hand leaves this one drawing.
    page.action.querySelector('.rr-tactics-title').dispatchEvent({ type: 'click', bubbles: true });
    const folded = cone.draws, open = grid.draws;
    page.type('<range: 1-20>\n<spread: 2>');
    assert.deepEqual([cone.draws, grid.draws > open], [folded, true]);
});

//-----------------------------------------------------------------------------
// The cards store in the record itself: nothing by looking, `rrBattle` on a change.

/** A Database that holds the records of one kind and counts what it is told to keep. */
function keeping(kind, list) {
    const key = T.DATA_KEYS[kind];
    const kept = { getSystem: database.getSystem, data: { [key]: list }, updates: [], mutationGeneration: 0 };
    kept['update' + kind[0].toUpperCase() + kind.slice(1)] = (id, data) => { kept.data[key][id] = data; kept.mutationGeneration++; kept.updates.push(id); };
    return kept;
}
const BLOCK = '<PTBS>\nscope: circle(3,0)\naoe: circle(2,0)\nmove_points: 4\n</PTBS>';

test('looking writes nothing: opening a record, browsing, folding a card and moving over its picture leave the record and its Note as they are', async () => {
    const detail = detailPane(), store = S.createStore({ storage: memory() });
    let page = null;
    const sections = foldingOn(detail, () => page.grid, store, () => ({ tactical: true, action: true }));
    const records = [
        ['weapon', { id: 5, wtypeId: 6, note: 'Long barrel.\n<range: 3-9>\n<fire rate: 1>\n<magazine: 5>\n<move: 1>' }],
        ['weapon', { id: 6, wtypeId: 6, note: 'Both.\n<range: 3-9>\n<magazine: 5>', rrBattle: { range: { min: 1, max: 2 }, spread: 4 } }],
        ['skill', { id: 9, scope: 1, hitType: 2, note: BLOCK + '\n<range: 1-4>', rrBattle: { cooldown: 3 } }],
        ['item', { id: 2, scope: 7, hitType: 0, note: '<cooldown: 1>' }],
        ['enemy', { id: 3, battlerName: 'Wolf', note: '<unit character: Monster, 3>\n<ai: ranged>' }],
        ['actor', { id: 1, classId: 1, note: '', rrBattle: {} }],
        ['class', { id: 1, note: '<move: 4>' }],
        ['armor', { id: 2, note: '<move: 0>' }],
        ['state', { id: 4 }]
    ];
    for (const [kind, record] of records) {
        const before = JSON.stringify(record), keys = Object.keys(record), own = record.rrBattle;
        const held = [];
        held[record.id] = record;
        const db = keeping(kind, held);
        page = showRecord(detail, kind, record, { database: db });
        let said = 0;
        page.note.addEventListener('change', () => said++);
        const shown = page.note.value;
        sections.refresh();
        await tick();
        for (const card of page.cards) {
            const title = card.querySelector('.rr-tactics-title');
            title.dispatchEvent({ type: 'click', bubbles: true });
            title.dispatchEvent({ type: 'click', bubbles: true });
            for (const canvas of card.querySelectorAll('canvas')) {
                canvas.dispatchEvent({ type: 'pointermove', bubbles: true, clientX: 40, clientY: 90 });
                canvas.dispatchEvent({ type: 'pointerleave', bubbles: true });
            }
        }
        await tick();
        assert.equal(JSON.stringify(record), before, kind + ': the record');
        assert.deepEqual(Object.keys(record), keys, kind + ': not even an empty rrBattle or Note');
        assert.equal(record.rrBattle, own, kind + ': its settings are the object they were');
        assert.deepEqual([db.updates.length, db.mutationGeneration, said, page.note.value], [0, 0, 0, shown], kind + ': the Database heard nothing, the Note field is as it was');
    }
    // A record with tags only shows them in its cards, as before the cards stored anything.
    const tagged = showRecord(detailPane(), 'weapon', records[0][1]);
    await tick();
    assert.deepEqual([tagged.summary(tagged.primary), tagged.summary(tagged.action)], ['Target range 3-9, One target', 'Bullet, 1/s, Magazine 5']);
    assert.deepEqual([tagged.primary.querySelector('.rr-tactics-min').value, tagged.primary.querySelector('.rr-tactics-max').value, tagged.movement.querySelector('.rr-tactics-move').value,
        tagged.action.querySelector('.rr-combat-fireRate').value, tagged.action.querySelector('.rr-combat-magazine').value], ['3', '9', '1', '1', '5']);
    // Where a record has a setting and a tag, the card shows the setting: what the game plays.
    const both = showRecord(detailPane(), 'weapon', records[1][1]);
    await tick();
    assert.deepEqual([both.summary(both.primary), both.summary(both.action)], ['Target range 1-2, One target', 'Bullet, 2.5/s, Magazine 5']);
    assert.deepEqual([both.primary.querySelector('.rr-tactics-max').value, both.action.querySelector('.rr-combat-spread').value, both.action.querySelector('.rr-combat-magazine').value], ['2', '4', '5']);
});

test('a field changed on the page: the record gets a new rrBattle, the card\'s tags leave the Note with it, and the Database is told', async () => {
    const rifle = { id: 5, wtypeId: 6, note: 'Long barrel.\n<range: 3-9>\n<los: no>\n<fire rate: 1>\n<magazine: 5>\n<move: 1>\nKeep me.' };
    const db = keeping('weapon', [null, null, null, null, null, rifle]);
    const page = showRecord(detailPane(), 'weapon', rifle, { database: db });
    await tick();
    const q = selector => page.primary.querySelector(selector);
    page.set(q('.rr-tactics-max'), 6);
    assert.deepEqual(rifle.rrBattle, { range: { min: 3, max: 6 }, los: false }, 'the one field, and the card\'s other tags with it');
    assert.equal(page.note.value, 'Long barrel.\n<fire rate: 1>\n<magazine: 5>\n<move: 1>\nKeep me.', 'the Note ends clean of the card after one touch; the other card\'s tags and every other line stay');
    assert.equal(rifle.note, page.note.value, 'the page kept the Note');
    assert.deepEqual([db.updates, db.data.weapons[5] === rifle], [[5], true], 'the Database was told once, of the record it holds');
    assert.deepEqual([page.summary(page.primary), page.summary(page.action)], ['Target range 3-6, One target · no line of sight needed', 'Bullet, 1/s, Magazine 5'], 'the other card goes on reading its tags');
    // Each change is a new object: the one before is not written to.
    const first = rifle.rrBattle, was = JSON.stringify(first);
    page.set(page.movement.querySelector('.rr-tactics-move'), 2);
    assert.notEqual(rifle.rrBattle, first);
    assert.equal(JSON.stringify(first), was);
    assert.deepEqual(rifle.rrBattle, { range: { min: 3, max: 6 }, los: false, move: 2 });
    // The same value said again is no change: the same object, and nothing told.
    const second = rifle.rrBattle, told = db.updates.length;
    page.set(page.movement.querySelector('.rr-tactics-move'), 2);
    assert.ok(rifle.rrBattle === second && db.updates.length === told);
    // Back at Automatic a key goes, and with the last one rrBattle itself.
    const los = q('.rr-tactics-los');
    los.checked = true;
    los.dispatchEvent({ type: 'change', bubbles: true });
    assert.deepEqual(rifle.rrBattle, { range: { min: 3, max: 6 }, move: 2 });
    page.set(page.movement.querySelector('.rr-tactics-move'), '');
    assert.deepEqual(rifle.rrBattle, { range: { min: 3, max: 6 } });
    q('.rr-tactics-min').value = '';
    page.set(q('.rr-tactics-max'), '');
    assert.deepEqual(['rrBattle' in rifle, page.note.value, page.summary(page.primary), page.chip(page.primary).hidden], [false, 'Long barrel.\n<fire rate: 1>\n<magazine: 5>\nKeep me.', 'Automatic: Target range 2-7, One target', true]);
    // The other card, touched, takes its own tags the same way.
    page.set(page.action.querySelector('.rr-combat-magazine'), 8);
    assert.deepEqual([rifle.rrBattle, page.note.value, rifle.note], [{ fireRate: 1, magazine: 8 }, 'Long barrel.\nKeep me.', 'Long barrel.\nKeep me.']);
    // A PTBS block stays where it is, whatever is changed.
    const old = { id: 30, scope: 1, hitType: 2, note: 'Old.\n' + BLOCK + '\n<range: 5>' };
    const skill = showRecord(detailPane(), 'skill', old);
    await tick();
    skill.set(skill.primary.querySelector('.rr-tactics-max'), 9);
    assert.deepEqual([skill.note.value, old.rrBattle], ['Old.\n' + BLOCK, { range: { min: 1, max: 9 } }]);
    skill.chip(skill.primary).dispatchEvent({ type: 'click', bubbles: true });
    assert.deepEqual([skill.note.value, 'rrBattle' in old, skill.summary(skill.primary), skill.chip(skill.primary).hidden], ['Old.\n' + BLOCK, false, 'Target range 0-3, Circle 2', true]);
    // The cards write to the record the Database holds under the id, should the page have handed them another object.
    const shownRecord = { id: 3, note: '' }, heldRecord = { id: 3, note: '', rrBattle: { move: 2 } };
    const enemies = keeping('enemy', [null, null, null, heldRecord]);
    const enemy = showRecord(detailPane(), 'enemy', shownRecord, { database: enemies });
    await tick();
    assert.equal(enemy.movement.querySelector('.rr-tactics-move').value, '2', 'what the Database holds is what is shown');
    enemy.set(enemy.movement.querySelector('.rr-tactics-jump'), 3);
    assert.deepEqual([heldRecord.rrBattle, shownRecord.rrBattle, enemies.data.enemies[3] === heldRecord, enemies.updates], [{ move: 2, jump: 3 }, { move: 2, jump: 3 }, true, [3]]);
});

test('a record that sets something in a card by a setting of its own opens that card as a tag does', async () => {
    const detail = detailPane(), store = S.createStore({ storage: memory() });
    let page = null;
    const sections = foldingOn(detail, () => page.grid, store, () => ({ tactical: false, action: false }));
    const show = async rrBattle => { page = showRecord(detail, 'weapon', Object.assign({ id: 5, wtypeId: 6, note: '' }, rrBattle ? { rrBattle } : null)); sections.refresh(); await tick(); return [isFolded(page.primary), isFolded(page.action)]; };
    assert.deepEqual(await show(null), [true, true], 'a Classic project, nothing set: both folded');
    assert.deepEqual(await show({ magazine: 5 }), [true, false]);
    assert.equal(page.action.dataset.sectionInUse, 'true');
    assert.deepEqual(await show({ range: { min: 2, max: 9 } }), [false, true]);
    assert.deepEqual(await show({ move: 1, combo: 4 }), [true, false]);
    assert.deepEqual(await show({}), [true, true]);
    assert.deepEqual(await show({ range: 'far', magazine: 'many' }), [true, true], 'what the game would not take sets nothing');
    // An actor's and an enemy's card is for every battle on the map: open in a project that only fights Action battles.
    const action = { tactical: false, action: true };
    for (const [kind, folded] of [['enemy', false], ['actor', false], ['class', true], ['armor', true], ['state', true]]) {
        const made = showRecord(detailPane(), kind, { id: 2, note: '' });
        assert.equal(S.battleCardFolded('tactics', made.primary, action), folded, kind);
        assert.equal(S.battleCardFolded('tactics', made.primary, { tactical: false, action: false }), true, kind + ': folded in a Classic project');
        assert.equal(S.battleCardFolded('tactics', made.primary, { tactical: true, action: false }), false, kind);
    }
    const sword = showRecord(detailPane(), 'weapon', { id: 2, wtypeId: 2, note: '' });
    assert.deepEqual([S.battleCardFolded('sharedCombat', sword.primary, action), S.battleCardFolded('action', sword.action, action)], [false, false]);
});

test('an enemy\'s picture on the map: a row to pick a sheet, the way back to Automatic, and what it stands as left alone', async () => {
    const picks = [], models = {};
    globalThis.CharacterGraphicPicker = class { constructor(project) { this.project = project; } show(name, index, pattern, direction, done) { picks.push({ project: this.project, name, index, pattern, direction, done }); } };
    globalThis.RRDatabase3DBindings = { get: (folder, section, id) => models[`${folder}|${section}|${id}`] || null };
    try {
        const wolf = { id: 3, name: 'Wolf', battlerName: 'Wolf', battlerHue: 0, note: 'Bites.\n<unit character: Monster, 3>\n<move: 5>' };
        const db = Object.assign(keeping('enemy', [null, null, null, wolf]), { projectPath: '/game' });
        const project = { getCurrentProject: () => ({ path: '/game' }) };
        const page = showRecord(detailPane(), 'enemy', wolf, { database: db, options: { projectManager: project } });
        await tick();
        const q = selector => page.primary.querySelector(selector);
        const name = q('.rr-tactics-look-name'), pick = q('.rr-tactics-look-change'), auto = q('.rr-tactics-look-auto'), hint = q('.rr-tactics-look-hint');
        const row = () => [name.textContent, name.title, auto.hidden, hint.hidden ? null : hint.textContent];
        const box = q('.rr-tactics-sprite');
        // A sheet named by a tag shows as the tag is read, and writes nothing.
        assert.deepEqual(row(), ['Monster', 'Monster, 3', false, null]);
        assert.deepEqual(['rrBattle' in wolf, page.note.value, page.summary(page.primary), page.chip(page.primary).hidden, page.primary.dataset.sectionInUse], [false, wolf.note, 'Up close · Monster', false, 'true']);
        // The button opens the sheet picker on the sheet in use; the frame picked is the enemy's own setting, and the tag is gone.
        pick.dispatchEvent({ type: 'click', bubbles: true });
        assert.deepEqual([picks.length, picks[0].project === project, picks[0].name, picks[0].index, picks[0].pattern, picks[0].direction], [1, true, 'Monster', 3, 1, 2]);
        picks[0].done({ characterName: 'Evil', characterIndex: 5, pattern: 2, direction: 8 });
        assert.deepEqual(wolf.rrBattle, { character: { name: 'Evil', index: 5 } }, 'the picture, and the card\'s other tag with it');
        assert.deepEqual([page.note.value, wolf.note, db.updates], ['Bites.\n<move: 5>', 'Bites.\n<move: 5>', [3]]);
        assert.deepEqual(row(), ['Evil', 'Evil, 5', false, null]);
        assert.ok(page.primary.ownerDocument.activeElement === pick, 'the keyboard is back on the button that opened the picker');
        // With a 3D model bound to the enemy the game shows the model: the row says so.
        models['/game|enemies|3'] = { name: 'Wolf.glb' };
        page.type('Bites.');
        assert.deepEqual(row(), ['Evil', 'Evil, 5', false, 'Its 3D model is shown instead.']);
        assert.equal(box.hidden, false, 'the picture picked is shown, whatever the game shows');
        // The row's own way back: the key is gone, and the line says what the enemy stands as now.
        auto.focus();
        auto.dispatchEvent({ type: 'click', bubbles: true });
        assert.deepEqual([wolf.rrBattle, row()], [undefined, ['Automatic', '', true, 'Its 3D model.']]);
        assert.equal(box.hidden, true, 'a 3D model is not drawn in the box: no empty box is shown for it');
        assert.ok(page.primary.ownerDocument.activeElement === pick, 'the chip left: the focus it held is on the button beside it');
        delete models['/game|enemies|3'];
        page.type('Bites.');
        assert.deepEqual(row(), ['Automatic', '', true, 'Its battler picture.']);
        assert.equal(box.hidden, false, 'a battler picture, a plain figure and a sheet have the box');
        wolf.battlerName = '';
        page.type('Bites.');
        assert.deepEqual(row(), ['Automatic', '', true, 'A plain figure in its side\'s color.']);
        // Picked from Automatic the picker opens empty; its Clear hands back no name, which is Automatic.
        pick.dispatchEvent({ type: 'click', bubbles: true });
        assert.deepEqual([picks[1].name, picks[1].index], ['', 0]);
        picks[1].done({ characterName: '$Big', characterIndex: 0, pattern: 1, direction: 2 });
        assert.deepEqual([wolf.rrBattle, row()], [{ character: { name: '$Big', index: 0 } }, ['$Big', '$Big, 0', false, null]]);
        pick.dispatchEvent({ type: 'click', bubbles: true });
        picks[2].done({ characterName: '', characterIndex: 0, pattern: 0, direction: 2 });
        assert.deepEqual([wolf.rrBattle, row()], [undefined, ['Automatic', '', true, 'A plain figure in its side\'s color.']]);
        // The card's own Automatic takes the picture with the rest.
        pick.dispatchEvent({ type: 'click', bubbles: true });
        picks[3].done({ characterName: 'Evil', characterIndex: 1 });
        page.chip(page.primary).dispatchEvent({ type: 'click', bubbles: true });
        assert.deepEqual(['rrBattle' in wolf, row(), page.summary(page.primary), page.chip(page.primary).hidden], [false, ['Automatic', '', true, 'A plain figure in its side\'s color.'], 'Automatic: Up close', true]);
        // The words go through the label manager; no other kind of record has the row.
        assert.equal(showRecord(detailPane(), 'actor', { id: 1, classId: 1, note: '<unit character: Evil, 2>' }).primary.querySelector('.rr-tactics-look-change'), null);
        // Without a picker or a project the button does nothing.
        delete globalThis.CharacterGraphicPicker;
        pick.dispatchEvent({ type: 'click', bubbles: true });
        assert.equal(picks.length, 4);
    } finally {
        delete globalThis.CharacterGraphicPicker;
        delete globalThis.RRDatabase3DBindings;
    }
});

test('in the page the sheet picker is a class of the page\'s scope, not a property of the window: the button finds it there', async () => {
    // As index.html loads them: each file a script of one page. A class declared at a script's top is a name every
    // later script sees, and `window.CharacterGraphicPicker` is undefined.
    const shown = [];
    const page = vm.createContext({ console, setTimeout, clearTimeout, Event: class { constructor(type, init) { this.type = type; Object.assign(this, init); } }, document: { createElement: pageElement }, shown });
    vm.runInContext('var window = globalThis;', page);
    vm.runInContext(read('src/utils/FightLook.js'), page, { filename: 'FightLook.js' });
    vm.runInContext('class CharacterGraphicPicker { constructor(project) { this.project = project; } show(name, index, pattern, direction, done) { shown.push({ project: this.project, name, index, done }); } }', page, { filename: 'CharacterGraphicPicker.js' });
    vm.runInContext(read('src/database/TacticsSection.js'), page, { filename: 'TacticsSection.js' });
    assert.equal(vm.runInContext('typeof CharacterGraphicPicker + " " + typeof window.CharacterGraphicPicker', page), 'function undefined');
    const project = { currentProject: { path: '/game' } }, wolf = { id: 3, name: 'Wolf', battlerName: '', note: '' };
    const card = page.RRTactics.createSection({ kind: 'enemy', record: wolf, databaseManager: { getSystem: () => ({}) }, projectManager: project });
    const detail = detailPane();
    detail.replaceChildren(card);
    await tick();
    card.querySelector('.rr-tactics-look-change').dispatchEvent({ type: 'click', bubbles: true });
    assert.equal(shown.length, 1, 'the picker opened');
    assert.ok(shown[0].project === project && shown[0].name === '' && shown[0].index === 0);
    shown[0].done({ characterName: 'Monster', characterIndex: 2 });
    assert.deepEqual(JSON.parse(JSON.stringify(wolf.rrBattle)), { character: { name: 'Monster', index: 2 } });
    assert.equal(card.querySelector('.rr-tactics-look-name').textContent, 'Monster');
    // The other things the cards take from the page are properties of the window, as their own files say.
    assert.match(read('src/database/Database3DBindings.js'), /root\.RRDatabase3DBindings = api;/);
    assert.match(read('src/utils/AssetFiles.js'), /root\.RRAssetFiles = api;/);
    assert.match(read('src/utils/FightLook.js'), /root\.ReactorFightLook = L;/);
    assert.match(read('src/event/CharacterGraphicPicker.js'), /^class CharacterGraphicPicker \{/m);
});

//-----------------------------------------------------------------------------
// After the test round: a plugin's tags, CRLF Notes, the fields' limits, a reach back to Automatic.

const at = (id, record) => { const list = []; list[id] = record; return list; };
const keptLines = card => card.querySelectorAll('.rr-tactics-kept').filter(line => !line.hidden).map(line => line.textContent);

test('a tag one of the project\'s plugins reads stays in the Note: a change writes the setting, Automatic leaves the tag, and the row says why', async () => {
    const note = 'Burns.\n<Cooldown: 5>\n<range: 2-6>';
    const fire = { id: 20, scope: 1, hitType: 2, note };
    const db = keeping('skill', at(20, fire));
    const page = showRecord(detailPane(), 'skill', fire, { database: db, options: { pluginTags: { cooldown: 'YEP_X_SkillCooldowns' } } });
    await tick();
    const cooldown = page.action.querySelector('.rr-combat-cooldown');
    // As found: the tag is shown as the setting it is; its row says the tag stays and for whom; nothing was written.
    assert.deepEqual([cooldown.value, page.summary(page.action), keptLines(page.action), keptLines(page.primary)], ['5', 'Cooldown 5 s', ['Its tag stays in the Note: the plugin YEP_X_SkillCooldowns reads it.'], []]);
    assert.equal(page.chip(page.action).hidden, true, 'the chip has nothing it could take out');
    assert.deepEqual(['rrBattle' in fire, fire.note, db.updates.length], [false, note, 0]);
    // The line stands in the form, right under its row, in the fields' column.
    const form = page.action.querySelector('.rr-tactics-form'), kids = Array.from(form.children), line = page.action.querySelector('.rr-tactics-kept');
    assert.ok(kids[kids.indexOf(line) - 1] === cooldown.closest('.rr-tactics-inline'), 'under the Cooldown row');
    assert.deepEqual([line.className, line.title], ['rr-tactics-hint rr-tactics-kept', '<Cooldown: 5>']);
    // A change writes the record's own setting, which the game reads first, and leaves the tag for the plugin.
    page.set(cooldown, 8);
    assert.deepEqual([fire.rrBattle, fire.note, page.note.value], [{ cooldown: 8 }, note, note]);
    assert.deepEqual([page.summary(page.action), page.chip(page.action).hidden, keptLines(page.action).length], ['Cooldown 8 s', false, 1]);
    // Automatic, by emptying the field: the setting goes, the tag stays and is read again; the row does not look broken.
    page.set(cooldown, '');
    assert.deepEqual(['rrBattle' in fire, fire.note, cooldown.value, page.summary(page.action), page.chip(page.action).hidden], [false, note, '5', 'Cooldown 5 s', true]);
    assert.deepEqual(keptLines(page.action), ['Its tag stays in the Note: the plugin YEP_X_SkillCooldowns reads it.']);
    // And by the chip.
    page.set(cooldown, 8);
    page.chip(page.action).dispatchEvent({ type: 'click', bubbles: true });
    assert.deepEqual(['rrBattle' in fire, fire.note, cooldown.value, page.chip(page.action).hidden], [false, note, '5', true]);
    // The value the tag gives typed again keeps no setting.
    page.set(cooldown, 5);
    assert.equal('rrBattle' in fire, false);
    // The other card's tag, which no plugin reads, moves with that card's first change as ever.
    page.set(page.primary.querySelector('.rr-tactics-max'), 9);
    assert.deepEqual([fire.rrBattle, fire.note], [{ range: { min: 2, max: 9 } }, 'Burns.\n<Cooldown: 5>']);
    // The tag taken out of the Note by hand: the line goes.
    page.type('Burns.');
    assert.deepEqual([keptLines(page.action), cooldown.value, cooldown.placeholder], [[], '', '2']);
    // A project with no such plugin: no such line is ever made, and the tag moves as it always did.
    const plain = { id: 21, scope: 1, hitType: 2, note };
    const other = showRecord(detailPane(), 'skill', plain, { database: keeping('skill', at(21, plain)) });
    await tick();
    other.set(other.action.querySelector('.rr-combat-cooldown'), 8);
    assert.deepEqual([plain.rrBattle, plain.note, other.placed.querySelectorAll('.rr-tactics-kept').length], [{ cooldown: 8 }, 'Burns.\n<range: 2-6>', 0]);
    // A weapon's row the card does not show (a blade has no magazine) says nothing while it is hidden.
    const sword = { id: 6, wtypeId: 2, note: '<magazine: 5>\n<combo: 4>' };
    const blade = showRecord(detailPane(), 'weapon', sword, { database: keeping('weapon', at(6, sword)), options: { pluginTags: { magazine: 'Ammo', combo: 'Chains' } } });
    await tick();
    assert.deepEqual(keptLines(blade.action), ['Its tag stays in the Note: the plugin Chains reads it.']);
    // An enemy's picture named by a tag a plugin reads.
    const wolf = { id: 3, name: 'Wolf', battlerName: '', note: '<unit character: Monster, 3>' };
    const enemy = showRecord(detailPane(), 'enemy', wolf, { database: keeping('enemy', at(3, wolf)), options: { pluginTags: { character: 'Sprites' } } });
    await tick();
    assert.deepEqual(keptLines(enemy.primary), ['Its tag stays in the Note: the plugin Sprites reads it.']);
    enemy.primary.querySelector('.rr-tactics-look-auto').dispatchEvent({ type: 'click', bubbles: true });
    assert.deepEqual(['rrBattle' in wolf, wolf.note, enemy.primary.querySelector('.rr-tactics-look-name').textContent], [false, '<unit character: Monster, 3>', 'Monster'], 'the tag stays, and the picture it names is still the enemy\'s');
    const shaped = { id: 22, scope: 1, hitType: 2, note: '<area: circle 3>', rrBattle: { area: { shape: 'line', size: 5 } } };
    const areaPage = showRecord(detailPane(), 'skill', shaped, { options: { pluginTags: { area: 'Shapes' } } });
    await tick();
    const areaField = areaPage.primary.querySelector('.rr-tactics-shape');
    assert.ok(areaField.textContent.startsWith('Automatic: Circle 3'), 'Automatic shows the fallback from the tag the plugin keeps');
    areaPage.set(areaField, '');
    assert.equal(shaped.rrBattle, undefined);
    assert.equal(shaped.note, '<area: circle 3>');
    assert.equal(areaPage.primary.querySelector('.rr-tactics-size').value, '3');
});

test('the project\'s plugins are read while its first record is shown: a change made before that is done waits for the answer', async () => {
    const nodeFs = require('node:fs'), os = require('node:os');
    const folder = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'rr-tactics-card-plugins-'));
    try {
        nodeFs.mkdirSync(path.join(folder, 'js', 'plugins'), { recursive: true });
        nodeFs.writeFileSync(path.join(folder, 'js', 'reactor_plugins.js'), 'var $plugins =\n[{"name":"YEP_X_SkillCooldowns","status":true,"description":"","parameters":{}}];\n');
        nodeFs.writeFileSync(path.join(folder, 'js', 'plugins', 'YEP_X_SkillCooldowns.js'), 'if (line.match(/<(?:COOLDOWN):[ ](\\d+)>/i)) {}');
        const note = 'Burns.\n<cooldown: 5>';
        const fire = { id: 20, scope: 1, hitType: 2, note };
        const db = Object.assign(keeping('skill', at(20, fire)), { projectPath: folder });
        const page = showRecord(detailPane(), 'skill', fire, { database: db });
        // Typed at once, in the first moment of the project's first record.
        page.set(page.action.querySelector('.rr-combat-cooldown'), 8);
        assert.deepEqual(['rrBattle' in fire, fire.note], [false, note], 'nothing is done on a guess');
        await T.pluginTags(folder).ready;
        await tick();
        assert.deepEqual([fire.rrBattle, fire.note], [{ cooldown: 8 }, note], 'the setting is written, and the plugin\'s tag was not taken');
        assert.deepEqual(keptLines(page.action), ['Its tag stays in the Note: the plugin YEP_X_SkillCooldowns reads it.']);
        // The next record of the same project: known, and done at once.
        const ice = { id: 21, scope: 1, hitType: 2, note };
        db.data.skills[21] = ice;
        const next = showRecord(detailPane(), 'skill', ice, { database: db });
        next.set(next.action.querySelector('.rr-combat-cooldown'), 3);
        assert.deepEqual([ice.rrBattle, ice.note], [{ cooldown: 3 }, note]);
        // A change asked of cards that have left the page by the time the answer is in is not made on the record behind them.
        const other = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'rr-tactics-card-plugins-'));
        try {
            nodeFs.mkdirSync(path.join(other, 'js', 'plugins'), { recursive: true });
            nodeFs.writeFileSync(path.join(other, 'js', 'reactor_plugins.js'), 'var $plugins =\n[];\n');
            const detail = detailPane(), gone = { id: 22, scope: 1, hitType: 2, note: '' };
            const first = showRecord(detail, 'skill', gone, { database: Object.assign(keeping('skill', at(22, gone)), { projectPath: other }) });
            first.set(first.action.querySelector('.rr-combat-cooldown'), 9);
            showRecord(detail, 'skill', { id: 23, scope: 1, hitType: 2, note: '' }, { database: Object.assign(keeping('skill', []), { projectPath: other }) });
            await T.pluginTags(other).ready;
            await tick();
            assert.equal('rrBattle' in gone, false);
        } finally { nodeFs.rmSync(other, { recursive: true, force: true }); }
    } finally { nodeFs.rmSync(folder, { recursive: true, force: true }); }
});

test('a Note that uses CRLF keeps CRLF on every line a card keeps, though the Note\'s field shows every line end as a line feed', async () => {
    const note = 'First\r\n<range: 2-5>\r\n<area: circle 2>\r\nLast\r\n';
    const skill = { id: 20, scope: 1, hitType: 2, note };
    const db = keeping('skill', at(20, skill));
    const page = showRecord(detailPane(), 'skill', skill, { database: db });
    await tick();
    assert.equal(page.note.value, 'First\n<range: 2-5>\n<area: circle 2>\nLast\n', 'the field, as a browser shows a Note');
    assert.deepEqual([skill.note, db.updates.length, page.summary(page.primary)], [note, 0, 'Target range 2-5, Circle 2'], 'looking wrote nothing, and the card reads it');
    // Reach typed: the card's tags leave, and the lines that stay have the line ends they had.
    page.set(page.primary.querySelector('.rr-tactics-max'), 7);
    assert.equal(skill.note, 'First\r\nLast\r\n');
    assert.deepEqual([skill.rrBattle, page.note.value], [{ range: { min: 2, max: 7 }, area: { shape: 'circle', size: 2 } }, 'First\nLast\n']);
    // A change that does not touch the Note leaves it as it is.
    page.set(page.action.querySelector('.rr-combat-cooldown'), 4);
    assert.equal(skill.note, 'First\r\nLast\r\n');
    // Text typed into the field and not yet kept by the page: the card takes it with the Note's own line ends.
    page.type('First\nTyped <cooldown: 3> here\n<range: 9>\nLast\n');
    page.chip(page.primary).dispatchEvent({ type: 'click', bubbles: true });
    assert.equal(skill.note, 'First\r\nTyped <cooldown: 3> here\r\nLast\r\n');
    // A Note with line feeds keeps line feeds; one that mixes them keeps each line's own.
    for (const [before, after] of [['First\n<range: 2-5>\nLast', 'First\nLast'], ['A\n<range: 2>\r\nB\r\nC\n', 'A\nB\r\nC\n'], ['Words\r\n<range: 2-5>', 'Words']]) {
        const record = { id: 5, scope: 1, hitType: 2, note: before };
        const shown = showRecord(detailPane(), 'skill', record, { database: keeping('skill', at(5, record)) });
        await tick();
        shown.set(shown.primary.querySelector('.rr-tactics-max'), 8);
        assert.equal(record.note, after, JSON.stringify(before));
    }
});

test('a number typed outside a field\'s limits is held to the limit and shown so; a reach field emptied is Automatic again', async () => {
    const skill = { id: 20, scope: 1, hitType: 2, note: '' };
    const page = showRecord(detailPane(), 'skill', skill, { database: keeping('skill', at(20, skill)) });
    await tick();
    const min = page.primary.querySelector('.rr-tactics-min'), max = page.primary.querySelector('.rr-tactics-max'), size = page.primary.querySelector('.rr-tactics-size'), shape = page.primary.querySelector('.rr-tactics-shape');
    page.set(max, 999);
    assert.deepEqual([skill.rrBattle, max.value, min.value], [{ range: { min: 1, max: 30 } }, '30', '1'], 'stored at the limit, and the field says the number stored');
    page.set(shape, 'circle');
    page.set(size, 500);
    assert.deepEqual([skill.rrBattle.area, size.value], [{ shape: 'circle', size: 20 }, '20']);
    page.set(page.action.querySelector('.rr-combat-cooldown'), 100000);
    assert.deepEqual([skill.rrBattle.cooldown, page.action.querySelector('.rr-combat-cooldown').value], [600, '600']);
    // Typed over the limit while the limit is what it holds: nothing changes, and the field is put right.
    const held = skill.rrBattle;
    page.set(max, 31);
    assert.ok(skill.rrBattle === held && max.value === '30');
    // One reach field emptied: the reach is Automatic again, both fields empty, the rest of the card as it was.
    page.set(max, '');
    assert.deepEqual([skill.rrBattle, min.value, max.value, min.placeholder, max.placeholder], [{ area: { shape: 'circle', size: 20 }, cooldown: 600 }, '', '', '1', '4']);
    page.set(max, 6);
    page.set(min, '');
    assert.equal('range' in skill.rrBattle, false, 'the first field as well as the second');
    // Typed into one field of an Automatic reach, the other takes what the record gets, as before.
    page.set(min, 2);
    assert.deepEqual(skill.rrBattle.range, { min: 2, max: 4 });
    // A unit, equipment and a weapon.
    const wolf = { id: 3, note: '' }, enemy = showRecord(detailPane(), 'enemy', wolf, { database: keeping('enemy', at(3, wolf)) });
    await tick();
    enemy.set(enemy.movement.querySelector('.rr-tactics-move'), 99);
    enemy.set(enemy.movement.querySelector('.rr-tactics-jump'), 99);
    assert.deepEqual([wolf.rrBattle, enemy.movement.querySelector('.rr-tactics-move').value, enemy.movement.querySelector('.rr-tactics-jump').value], [{ move: 30, jump: 20 }, '30', '20']);
    const vest = { id: 2, note: '' }, armor = showRecord(detailPane(), 'armor', vest, { database: keeping('armor', at(2, vest)) });
    await tick();
    armor.set(armor.primary.querySelector('.rr-tactics-move'), -99);
    assert.deepEqual([vest.rrBattle, armor.primary.querySelector('.rr-tactics-move').value], [{ move: -20 }, '-20']);
    const gun = { id: 5, wtypeId: 6, note: '' }, weapon = showRecord(detailPane(), 'weapon', gun, { database: keeping('weapon', at(5, gun)) });
    await tick();
    weapon.set(weapon.action.querySelector('.rr-combat-magazine'), 99999);
    assert.deepEqual([gun.rrBattle, weapon.action.querySelector('.rr-combat-magazine').value], [{ magazine: 999 }, '999']);
});

test('the look: a title line that gives a long summary its own line in a narrow card, rows that keep their words out of the picture, two cards as one stack', () => {
    const css = read('css/styles.css');
    assert.match(css, /\.rr-tactics-section > \.rr-tactics-header \{[^}]*flex-wrap: wrap;[^}]*container-type: inline-size;/);
    assert.match(css, /@container \(max-width: 480px\) \{\s*\.rr-tactics-summary \{ order: 1; flex: 0 0 100%; \}\s*\.rr-tactics-reset \{ margin-inline-start: auto; \}/);
    assert.match(css, /\.rr-tactics-summary:empty \{ display: none; \}/, 'a card with nothing to say keeps no line for it');
    assert.match(css, /\.rr-tactics-summary \{[^}]*text-overflow: ellipsis;[^}]*\}/);
    // A long unit breaks onto a second line: nothing is drawn under the picture.
    assert.doesNotMatch(/\.rr-tactics-word \{([^}]*)\}/.exec(css)[1], /nowrap/);
    // The unit gives way before the field does: the fields of every row stay one width.
    assert.match(css, /\.rr-tactics-word \{ flex: 0 1000 auto; /);
    assert.match(css, /\.rr-tactics-inline > input\[type="number"\] \{ width: 52px; flex: 0 1 52px; min-width: 40px; padding-inline: 6px; text-align: center; \}/);
    // Beside the picture the fields keep the width their rows take with every English unit on one line:
    // the label column and its gap (112), a field (52), a gap (6) and the longest unit.
    assert.match(css, /\.rr-tactics-form \{ flex: 1 1 280px; min-width: 0; max-width: 460px; \}/, 'the picture stands beside the fields while they have room for their rows, also in a wide card');
    // A field that says a word is as wide as the word; what is hidden in a row takes no room.
    assert.doesNotMatch(css, /\.is-worded/, 'numeric distance fields never display words');
    assert.match(css, /\.rr-tactics-inline > \[hidden\] \{ display: none; \}/);
    assert.match(css, /\.database-section\.rr-tactics-section > \.database-section-content\.rr-tactics-body \{[^}]*flex-wrap: wrap;/, 'and under them in a narrow one');
    // The stack: the gap of the page's own cards; an open card takes the height its row has to spare.
    assert.match(css, /\.rr-battle-cards \{ display: flex; flex-direction: column; gap: 16px; min-width: 0; \}/);
    assert.match(css, /\.rr-battle-cards > \.database-section \{ flex: 1 1 auto; display: flex; flex-direction: column; \}/);
    assert.match(css, /\.database-item-column > \.rr-battle-cards > \.database-section \{ margin-bottom: 0; \}/);
    // Beside a list card and with an open card after them, the two cards stand across both rows: the list card and
    // the card after them share the height, and the list card is not stretched to the two cards together.
    assert.match(css, /\.database-sections-grid > \.rr-battle-cards:nth-child\(even\):not\(\.rr-section-solo\):has\(\+ \.database-section:not\(\.is-collapsed\)\) \{ grid-row: span 2; \}/);
    // With the card after them folded there is no height to share: the list card keeps its own.
    assert.match(css, /\.database-sections-grid > \.database-section:has\(\+ \.rr-battle-cards:nth-child\(even\):not\(\.rr-section-solo\) \+ \.database-section\.is-collapsed\) \{ place-self: start stretch; \}/);
    // Theme tokens only.
    const rules = css.slice(css.indexOf('/* The battle cards of a Database record page'), css.indexOf('/* Battle Setup (map view')) + css.slice(css.indexOf('/* Database battle cards'), css.indexOf('/* End of the Database battle cards. */'));
    assert.ok(rules.length > 1500, 'the card rules are where the test looks');
    assert.doesNotMatch(rules, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'no color of its own');
});
