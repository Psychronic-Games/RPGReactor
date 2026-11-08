/**
 * Enemy equipment: the game's side run on the shipped objects (fightWorld), and
 * the editor's model, command and reference discovery. Off by default, so a
 * project that never turns it on plays as before.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const { fightWorld } = require('./helpers/fight-world.cjs');
const Features = require('../src/ReactorFeatures.js');
const RREnemyEquipment = require('../src/database/EnemyEquipmentWindow.js');
const EnemyEquipmentCommandEditor = require('../src/event/commands/EnemyEquipmentCommandEditor.js');
require('../src/utils/EquipSlots.js');
const DatabaseReferenceFinder = require('../src/database/DatabaseReferenceFinder.js');

const featuresSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_features.js'), 'utf8');

const SWORD = { id: 1, name: 'Sword', etypeId: 1, wtypeId: 2, animationId: 7, params: [100, 0, 10, 0, 0, 0, 0, 0], traits: [{ code: 22, dataId: 0, value: 0.5 }], note: '' };
const AXE = { id: 2, name: 'Axe', etypeId: 1, wtypeId: 3, animationId: 9, params: [0, 0, 20, 0, 0, 0, 0, 0], traits: [], note: '' };
const SHIELD = { id: 1, name: 'Shield', etypeId: 2, atypeId: 1, params: [0, 0, 0, 5, 0, 0, 0, 0], traits: [], note: '' };

function world({ on = true } = {}) {
    const w = fightWorld({ prepare: ctx => vm.runInContext(featuresSource, ctx) });
    w.$dataWeapons[1] = SWORD;
    w.$dataWeapons[2] = AXE;
    w.$dataArmors[1] = SHIELD;
    w.$dataSystem.equipTypes = ['', 'Weapon', 'Shield'];
    w.$dataSystem.rrFeatures = on ? { enemyEquipment: true } : {};
    w.$dataEnemies[1].rrEquipment = [{ etypeId: 1, kind: 2, itemId: 1 }, { etypeId: 2, kind: 3, itemId: 1 }];
    w.$dataEnemies[2].rrEquipment = [{ etypeId: 1, kind: 2, itemId: 2 }];
    return w;
}
const spawn = (w, id = 1) => new w.Game_Enemy(id, 0, 0);
const names = list => Array.from(list, item => (item ? item.name : null));

test('the feature is registered in both tables, off by default', () => {
    const record = Features.FEATURES.find(f => f.id === 'enemyEquipment');
    assert.ok(record, 'registered');
    assert.equal(record.default, false);
    assert.equal(record.flag, 'rrFeatures.enemyEquipment');
    assert.deepEqual(record.plugins, []);
    assert.ok(!record.pending, 'finished, so the page lists it');
    assert.equal(Features.on('enemyEquipment', {}), false);
    assert.equal(Features.on('enemyEquipment', { rrFeatures: { enemyEquipment: true } }), true);
});

test('off: authored rows are kept and the enemy has no equipment', () => {
    const w = world({ on: false });
    const enemy = spawn(w);
    assert.equal(enemy.equips().length, 0);
    assert.equal(enemy.equipSlots().length, 0);
    assert.equal(enemy.weapons().length, 0);
    assert.equal(enemy.armors().length, 0);
    assert.equal(enemy.param(0), 60, 'base only');
    assert.ok(!enemy.traitObjects().includes(SWORD));
    assert.equal(enemy.changeEquip(0, null), false);
    assert.equal(enemy.rrWeaponAnimationId(), 0);
    assert.equal(w.$dataEnemies[1].rrEquipment.length, 2, 'data untouched');
});

test('on: parameters and traits come from each occupied slot, once per slot', () => {
    const w = world();
    w.$dataEnemies[1].rrEquipment = [{ etypeId: 1, kind: 2, itemId: 1 }, { etypeId: 1, kind: 2, itemId: 1 }, { etypeId: 2, kind: 3, itemId: 1 }, { etypeId: 2, kind: 0, itemId: 0 }];
    const enemy = spawn(w);
    assert.deepEqual(names(enemy.equips()), ['Sword', 'Sword', 'Shield', null]);
    assert.deepEqual(Array.from(enemy.equipSlots()), [1, 1, 2, 2]);
    assert.equal(enemy.param(0), 260, 'two swords add 100 each');
    assert.equal(enemy.param(3), 10, 'base 5 + shield 5');
    assert.equal(enemy.traitObjects().filter(object => object === SWORD).length, 2);
    assert.equal(enemy.weapons().length, 2);
    assert.equal(enemy.armors().length, 1);
    assert.equal(enemy.rrWeaponAnimationId(), 7, 'the first occupied weapon');
});

test('a missing entry, or one no longer of the slot type, gives nothing', () => {
    const w = world();
    w.$dataEnemies[1].rrEquipment = [{ etypeId: 1, kind: 2, itemId: 99 }, { etypeId: 2, kind: 2, itemId: 1 }];
    const enemy = spawn(w);
    assert.deepEqual(names(enemy.equips()), [null, null]);
    assert.equal(enemy.param(0), 60);
});

test('each enemy keeps its own loadout, and the database row does not change', () => {
    const w = world();
    const a = spawn(w), b = spawn(w);
    assert.equal(a.changeEquip(0, null), true);
    assert.deepEqual(names(a.equips()), [null, 'Shield']);
    assert.deepEqual(names(b.equips()), ['Sword', 'Shield']);
    assert.equal(w.$dataEnemies[1].rrEquipment[0].itemId, 1);
});

test('changeEquip validates the slot and item, and leaves the party alone', () => {
    const w = world();
    const enemy = spawn(w);
    const before = JSON.stringify(w.$gameParty._weapons);
    assert.equal(enemy.changeEquip(5, AXE), false, 'no such slot');
    assert.equal(enemy.changeEquip(-1, AXE), false);
    assert.equal(enemy.changeEquip(0, SHIELD), false, 'wrong type');
    assert.equal(enemy.changeEquip(0, { id: 1, etypeId: 1 }), false, 'not a database weapon');
    assert.equal(enemy.changeEquip(0, undefined), false, 'unresolved is not None');
    assert.deepEqual(names(enemy.equips()), ['Sword', 'Shield']);
    assert.equal(enemy.changeEquip(0, AXE), true);
    assert.deepEqual(names(enemy.equips()), ['Axe', 'Shield']);
    assert.equal(JSON.stringify(w.$gameParty._weapons), before);
});

test('a change clamps HP without healing or reviving', () => {
    const w = world();
    const enemy = spawn(w);
    assert.equal(enemy.hp, 160);
    enemy.changeEquip(0, null);
    assert.equal(enemy.hp, 60, 'clamped to the new maximum');
    enemy.changeEquip(0, SWORD);
    assert.equal(enemy.hp, 60, 'a higher maximum does not heal');
    enemy.setHp(0);
    enemy.refresh();
    assert.ok(enemy.isDead());
    enemy.changeEquip(0, null);
    assert.ok(enemy.isDead(), 'does not revive');
});

test('Transform reads the new enemy, and the same enemy keeps its changes', () => {
    const w = world();
    const enemy = spawn(w);
    enemy.changeEquip(0, AXE);
    enemy.transform(1);
    assert.deepEqual(names(enemy.equips()), ['Axe', 'Shield'], 'same id keeps the loadout');
    enemy.transform(2);
    assert.deepEqual(names(enemy.equips()), ['Axe'], "the destination's own");
    assert.equal(enemy.equipSlots().length, 1);
    enemy.transform(1);
    assert.deepEqual(names(enemy.equips()), ['Sword', 'Shield'], 'fresh from the database');
});

test('a change survives save and load; an enemy from an older save reads its rows', () => {
    const w = world();
    const saved = vm.runInContext(`(() => {
        const enemy = new Game_Enemy(1, 0, 0);
        enemy.changeEquip(0, null);
        const copy = JsonEx.parse(JsonEx.stringify(enemy));
        const old = JsonEx.parse(JsonEx.stringify(new Game_Enemy(1, 0, 0)));
        delete old._rrEquips;
        return { copy, old, text: JsonEx.stringify(enemy) };
    })()`, w);
    assert.deepEqual(names(saved.copy.equips()), [null, 'Shield']);
    assert.deepEqual(names(saved.old.equips()), ['Sword', 'Shield']);
    assert.ok(!saved.text.includes('"Sword"'), 'rows hold ids, not database objects');
});

test('the Change Enemy Equipment command changes one member and ignores what is invalid', () => {
    const w = world();
    const a = spawn(w), b = spawn(w);
    w.$gameTroop._enemies = [a, b];
    const call = args => w.PluginManager.callCommand({}, 'RPGReactor', 'ChangeEnemyEquipment', args);
    call({ enemyIndex: '1', slotIndex: '0', kind: '2', itemId: '2' });
    assert.deepEqual(names(b.equips()), ['Axe', 'Shield']);
    assert.deepEqual(names(a.equips()), ['Sword', 'Shield']);
    call({ enemyIndex: '0', slotIndex: '0', kind: '0', itemId: '0' });
    assert.deepEqual(names(a.equips()), [null, 'Shield'], 'itemId 0 empties the slot');
    a.changeEquip(0, SWORD);
    for (const bad of [
        { enemyIndex: '7', slotIndex: '0', kind: '2', itemId: '2' },
        { enemyIndex: '0', slotIndex: '9', kind: '2', itemId: '2' },
        { enemyIndex: '0', slotIndex: '0', kind: '2', itemId: '99' },
        { enemyIndex: '0', slotIndex: '0', kind: '1', itemId: '1' },
        { enemyIndex: '0', slotIndex: '0', kind: '3', itemId: '1' },
        { enemyIndex: '0', slotIndex: '', kind: '2', itemId: '2' },
        { enemyIndex: '0', slotIndex: '0', kind: '2', itemId: '' }
    ]) {
        call(bad);
        assert.deepEqual(names(a.equips()), ['Sword', 'Shield'], JSON.stringify(bad));
    }
});

test('presentation: zero weapon ids fall through, non-zero ones override, and the animation order holds', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_battle_presentation.js'), 'utf8');
    const lift = head => {
        const start = source.indexOf(head);
        assert.ok(start >= 0, head);
        return source.slice(start, source.indexOf('\n', start));
    };
    const context = vm.createContext({
        $dataWeapons: [null, SWORD, AXE],
        P: { settings: { enemies: {} } },
        weapons() { return [AXE]; },
        animation() { return 33; },
        proto: {}
    });
    vm.runInContext(lift('proto.weapons=function') + lift('proto.attackAnimationId1=function'), context);
    const enemy = Object.create(context.proto);
    enemy.enemyId = () => 1;
    enemy.rrWeaponAnimationId = function() { return this.weapons()[0]?.animationId || 0; };
    const graphic = {};
    context.P.settings.enemies[1] = { graphic };

    assert.deepEqual(names(enemy.weapons()), ['Axe'], 'nothing authored');
    graphic.weaponIds = [0, 0];
    assert.deepEqual(names(enemy.weapons()), ['Axe'], 'cleared fields fall through');
    graphic.weaponIds = [1, 0];
    assert.deepEqual(names(enemy.weapons()), ['Sword'], 'an authored weapon overrides what is shown');

    assert.equal(enemy.attackAnimationId1(), 7, 'the weapon seam');
    enemy.rrWeaponAnimationId = () => 0;
    assert.equal(enemy.attackAnimationId1(), 33, 'then the existing fallback');
    graphic.attackAnimationId = 5;
    assert.equal(enemy.attackAnimationId1(), 5, 'an authored animation wins');
});

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

function database() {
    return {
        getSystem: () => ({ equipTypes: ['', 'Weapon', '', 'Body'] }),
        getWeapons: () => [null, SWORD, AXE],
        getArmors: () => [null, { ...SHIELD, etypeId: 3 }]
    };
}

test('a new loadout has one empty slot per named equipment type', () => {
    assert.deepEqual(RREnemyEquipment.defaultRows(database().getSystem()), [
        { etypeId: 1, kind: 0, itemId: 0 }, { etypeId: 3, kind: 0, itemId: 0 }
    ]);
});

test('preview sums authored rows and gives broken rows nothing', () => {
    const rows = [
        { etypeId: 1, kind: 2, itemId: 1 },
        { etypeId: 1, kind: 2, itemId: 1 },
        { etypeId: 1, kind: 2, itemId: 99 },
        { etypeId: 3, kind: 2, itemId: 2 }
    ];
    const result = RREnemyEquipment.preview([50, 0, 3, 0, 0, 0, 0, 0], rows, database());
    assert.deepEqual(result[0], { base: 50, bonus: 200, total: 250 });
    assert.deepEqual(result[2], { base: 3, bonus: 20, total: 23 });
    assert.equal(RREnemyEquipment.resolve(rows[2], database()).problem, 'missing');
    assert.equal(RREnemyEquipment.resolve(rows[3], database()).problem, 'type');
});

test('the picker offers what fits the slot and filters by name or number', () => {
    const db = database();
    assert.deepEqual(RREnemyEquipment.matches(1, db, '').map(m => m.item.name), ['Sword', 'Axe']);
    assert.deepEqual(RREnemyEquipment.matches(3, db, '').map(m => m.kind), [3]);
    assert.deepEqual(RREnemyEquipment.matches(1, db, 'ax').map(m => m.id), [2]);
    assert.deepEqual(RREnemyEquipment.matches(1, db, '#1').map(m => m.id), [1]);
    db.getWeapons = () => [null, SWORD, { ...AXE, name: '  ' }];
    assert.deepEqual(RREnemyEquipment.matches(1, db, '').map(m => m.id), [1], 'a nameless separator is not offered');
});

test('storing an empty loadout removes the field', () => {
    const enemy = { rrEquipment: [{ etypeId: 1, kind: 2, itemId: 1 }] };
    RREnemyEquipment.store(enemy, []);
    assert.equal('rrEquipment' in enemy, false);
    RREnemyEquipment.store(enemy, [{ etypeId: '2', kind: '3', itemId: '4', extra: 1 }]);
    assert.deepEqual(enemy.rrEquipment, [{ etypeId: 2, kind: 3, itemId: 4 }]);
});

test('the command saves as a plugin command and reads as one line', () => {
    const command = EnemyEquipmentCommandEditor.build({ enemyIndex: 2, slotIndex: '1', kind: 2, itemId: 1 }, 3);
    assert.deepEqual(command, { code: 357, indent: 3, parameters: ['RPGReactor', 'ChangeEnemyEquipment', 'Change Enemy Equipment',
        { enemyIndex: '2', slotIndex: '1', kind: '2', itemId: '1' }] });
    assert.equal(EnemyEquipmentCommandEditor.summary(command.parameters[3], database()), '#3, Slot 2 → Sword');
    const none = EnemyEquipmentCommandEditor.build({ enemyIndex: -1, slotIndex: 'x', kind: 2, itemId: 0 });
    assert.deepEqual(none.parameters[3], { enemyIndex: '0', slotIndex: '0', kind: '0', itemId: '0' });
    assert.equal(EnemyEquipmentCommandEditor.summary(none.parameters[3], database()), '#1, Slot 1 → None');
    assert.equal(EnemyEquipmentCommandEditor.supports('ChangeEnemyEquipment'), true);
    assert.equal(EnemyEquipmentCommandEditor.supports('LightSwitch'), false);
});

test('equipped items are found as references', () => {
    const finder = new DatabaseReferenceFinder({ data: {
        weapons: [null, null, null, { id: 3, name: 'Club', traits: [] }],
        armors: [null, null, null, null, null, { id: 5, name: 'Plate', traits: [] }],
        enemies: [null, { id: 4, name: 'Ogre', actions: [], dropItems: [], traits: [], rrEquipment: [{ etypeId: 1, kind: 2, itemId: 3 }, { etypeId: 2, kind: 3, itemId: 5 }, { etypeId: 2, kind: 0, itemId: 0 }] }]
    } });
    assert.deepEqual(finder.findReferences('weapons', 3).map(r => `${r.type}#${r.id} ${r.where}`), ['enemies#4 Equipment']);
    assert.deepEqual(finder.findReferences('armors', 5).map(r => `${r.type}#${r.id} ${r.where}`), ['enemies#4 Equipment']);
});

test('the editor asks the registry before showing equipment, in the page and the picker', () => {
    const read = rel => fs.readFileSync(path.join(editorRoot, 'src', rel), 'utf8');
    assert.match(read('database/EnemyEquipmentWindow.js'), /features\.on\('enemyEquipment', /);
    assert.match(read('database/DatabaseEnemyEditor.js'), /RREnemyEquipment\.on\(this\.databaseManager\)/);
    assert.match(read('event/EventCommandPicker.js'), /reactor: 'ChangeEnemyEquipment', feature: 'enemyEquipment'/);
    const index = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.ok(index.indexOf('EnemyEquipmentWindow.js') < index.indexOf('DatabaseEnemyEditor.js'));
    assert.match(index, /EnemyEquipmentCommandEditor\.js/);
});
