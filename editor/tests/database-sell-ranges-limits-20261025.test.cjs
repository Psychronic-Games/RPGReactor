/**
 * Three database additions, each off by default so RPG Maker MZ data plays
 * exactly as before:
 *
 *  - "Can't be sold" (rrNoSell) on Items, Weapons and Armors: the shop's sell
 *    list shows the item greyed out, as MZ does for a price-0 item.
 *  - Ranges: an enemy's Stat Variance % (rrStatVariance), an EXP or Gold
 *    maximum (rrExpMax, rrGoldMax), a drop slot's quantity (rrQtyMin,
 *    rrQtyMax), and a Random amount on Change Gold / Items / Weapons / Armors.
 *  - Higher Limits (Database > Reactor Features, rrHigherLimits): 9,999 of
 *    each item and 9,999,999,999 gold instead of MZ's 99 and 99,999,999.
 *
 * Each is a Reactor Features entry (unsellableItems, enemyRanges,
 * higherLimits): turned off there, the game plays as MZ whatever is stored.
 *
 * The runtime halves run the shipped functions, lifted out of the runtime
 * source, against small stubs.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const { paramNamesSource } = require('./helpers/param-names.cjs');

const editorRoot = path.resolve(__dirname, '..');
const src = file => fs.readFileSync(path.join(editorRoot, 'src', file), 'utf8');
const objects = runtimeSource('reactor_objects.js');
const windows = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_windows.js'), 'utf8');

/** The statement `head ... \n};` (or `head ...;` for a one-liner) out of a runtime source. */
function lift(source, head) {
    const start = source.indexOf(head);
    assert.ok(start >= 0, `${head} is in the runtime`);
    const fn = /=\s*function/.test(source.slice(start, start + head.length + 20));
    const end = fn ? source.indexOf('\n};', start) + 3 : source.indexOf(';\n', start) + 1;
    return source.slice(start, end);
}

const featuresSource = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_features.js'), 'utf8');
/** Load the game's registry (runtime/reactor_features.js) into a context, which then reads its $dataSystem. */
function withFeatures(context) {
    vm.runInContext(featuresSource, context);
    return context;
}

function runtimeContext(extra = {}) {
    const context = vm.createContext(Object.assign({
        Game_Enemy: function() {}, Game_Party: function() {}, Game_Interpreter: function() {},
        Window_ShopSell: function() {}, Window_ShopNumber: function() {}, Window_ItemList: function() {},
        $dataSystem: {}, $gameVariables: { value: id => id * 10 }
    }, extra));
    vm.runInContext('Math.randomInt = max => Math.floor(max * Math.random());', context);
    return context;
}

// ---------------------------------------------------------------------------
// Can't be sold
// ---------------------------------------------------------------------------

test('the shop greys out an item marked Can\'t be sold, and keeps MZ\'s price-0 rule', () => {
    const context = runtimeContext();
    vm.runInContext(lift(windows, 'Window_ShopSell.prototype.isEnabled = function'), context);
    const enabled = item => !!context.Window_ShopSell.prototype.isEnabled(item);
    assert.equal(enabled({ price: 50 }), true, 'a stock item with a price sells');
    assert.equal(enabled({ price: 0 }), false, 'a price-0 item does not, as in MZ');
    assert.equal(enabled({ price: 50, rrNoSell: true }), false, 'Can\'t be sold is listed but disabled');
    assert.equal(enabled(null), false);
});

test('Unsellable Items off in Reactor Features: a Can\'t be sold item sells, as in MZ', () => {
    const context = withFeatures(runtimeContext());
    vm.runInContext(lift(windows, 'Window_ShopSell.prototype.isEnabled = function'), context);
    const enabled = item => !!context.Window_ShopSell.prototype.isEnabled(item);
    assert.equal(enabled({ price: 50, rrNoSell: true }), false, 'on (the default): greyed out');
    context.$dataSystem.rrFeatures = { unsellableItems: false };
    assert.equal(enabled({ price: 50, rrNoSell: true }), true, 'off: the flag is ignored');
    assert.equal(enabled({ price: 0, rrNoSell: true }), false, "MZ's price-0 rule still stands");
});

test('a custom interface shop honours Can\'t be sold too, and the same switch', () => {
    const ui = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_ui.js'), 'utf8');
    assert.match(ui, /enabled: !cannotSell\(item\),/);
    assert.match(ui, /!buying && cannotSell\(item\)/);
    const context = withFeatures(runtimeContext());
    const start = ui.indexOf('    function cannotSell(item) {');
    vm.runInContext(ui.slice(start, ui.indexOf('\n    }\n', start) + 6) + '\nglobalThis.cannotSell = cannotSell;', context);
    assert.equal(context.cannotSell({ price: 50 }), false);
    assert.equal(context.cannotSell({ price: 0 }), true);
    assert.equal(context.cannotSell({ price: 50, rrNoSell: true }), true);
    context.$dataSystem.rrFeatures = { unsellableItems: false };
    assert.equal(context.cannotSell({ price: 50, rrNoSell: true }), false, 'off: it sells');
});

for (const [file, attr, update] of [
    ['database/DatabaseItemEditor.js', 'data-item-id', 'updateItemField'],
    ['database/DatabaseWeaponEditor.js', 'data-weapon-id', 'updateWeaponField'],
    ['database/DatabaseArmorEditor.js', 'data-armor-id', 'updateArmorField']
]) {
    test(`${path.basename(file)} offers Can't be sold beside the price and stores it only when on`, () => {
        const source = src(file);
        assert.match(source, new RegExp(`data-field="rrNoSell" ${attr}=`), 'the checkbox is there');
        assert.match(source, /tt\("Can't be sold"\)/, 'with its label routed through i18n');
        assert.match(source, /e\.target\.type === 'checkbox' \? e\.target\.checked : e\.target\.value/, 'a checkbox reports checked, not "on"');
        const name = path.basename(file, '.js');
        const record = { id: 1, price: 10 };
        const manager = new Proxy({}, { get: (_, key) => String(key).startsWith('get') ? () => record : () => {} });
        const Editor = vm.runInNewContext(`${source}\n${name};`, {
            console: { log() {}, debug() {} }, DatabaseEffectEditor: class {}, DatabaseTraitEditor: class {}
        });
        const editor = new Editor(manager, null, null, null);
        editor[update](1, 'rrNoSell', true);
        assert.equal(record.rrNoSell, true);
        editor[update](1, 'rrNoSell', false);
        assert.equal('rrNoSell' in record, false, 'unticked leaves a stock record stock');
        // Unsellable Items off in Reactor Features: the box is not drawn (a stored flag stays on the record).
        assert.match(source, /const noSell = !window\.ReactorFeatures \|\| window\.ReactorFeatures\.on\('unsellableItems', /);
        assert.match(source, /\$\{noSell \? `\n\s+<span class="db-no-sell"/);
    });
}

// ---------------------------------------------------------------------------
// Enemy ranges (runtime)
// ---------------------------------------------------------------------------

function loadEnemy(data, system) {
    const context = system ? withFeatures(runtimeContext({ $dataSystem: system })) : runtimeContext();
    for (const name of ['setup', 'rrRoll', 'paramBase', 'exp', 'gold', 'makeDropItems', 'rrDropCount']) {
        vm.runInContext(lift(objects, `Game_Enemy.prototype.${name} = function`), context);
    }
    const proto = context.Game_Enemy.prototype;
    proto.enemy = function() { return data[this._enemyId]; };
    proto.recoverAll = function() {};
    proto.dropItemRate = () => 1;
    proto.itemObject = (kind, id) => ({ kind, id });
    return enemyId => { const enemy = new context.Game_Enemy(); enemy.setup(enemyId, 0, 0); return enemy; };
}

test('an enemy with none of the range fields plays exactly as in MZ', () => {
    const spawn = loadEnemy({ 1: { params: [500, 20, 30, 40, 50, 60, 70, 80], exp: 12, gold: 34,
        dropItems: [{ kind: 1, dataId: 7, denominator: 1 }, { kind: 0, dataId: 1, denominator: 1 }] } });
    const enemy = spawn(1);
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(id => enemy.paramBase(id)), [500, 20, 30, 40, 50, 60, 70, 80]);
    assert.equal(enemy.exp(), 12);
    assert.equal(enemy.gold(), 34);
    assert.deepEqual(JSON.parse(JSON.stringify(enemy.makeDropItems())), [{ kind: 1, id: 7 }], 'one of each drop');
});

test('Stat Variance rolls each parameter once within the percentage and keeps it', () => {
    const spawn = loadEnemy({ 1: { params: [1000, 100, 100, 100, 100, 100, 100, 100], rrStatVariance: 20, exp: 0, gold: 0, dropItems: [] } });
    const seen = new Set();
    for (let n = 0; n < 200; n++) {
        const enemy = spawn(1);
        const hp = enemy.paramBase(0);
        assert.ok(hp >= 800 && hp <= 1200, `HP ${hp} within ±20%`);
        assert.equal(enemy.paramBase(0), hp, 'the same enemy keeps its roll');
        for (let id = 1; id < 8; id++) {
            const value = enemy.paramBase(id);
            assert.ok(value >= 80 && value <= 120, `param ${id}: ${value}`);
        }
        seen.add(hp);
    }
    assert.ok(seen.size > 20, 'and different enemies roll differently');
});

test('a variance past 50% is held at 50%, and an enemy that transforms rolls again', () => {
    const data = { 1: { params: [100, 0, 0, 0, 0, 0, 0, 0], rrStatVariance: 400, dropItems: [] },
        2: { params: [100, 0, 0, 0, 0, 0, 0, 0], dropItems: [] } };
    const spawn = loadEnemy(data);
    for (let n = 0; n < 100; n++) {
        const hp = spawn(1).paramBase(0);
        assert.ok(hp >= 50 && hp <= 150, `HP ${hp}`);
    }
    const enemy = spawn(1);
    enemy._enemyId = 2;
    assert.equal(enemy.paramBase(0), 100, 'the new enemy has no variance');
});

test('EXP and Gold roll between the base and the maximum; a lower or missing maximum is the base', () => {
    const spawn = loadEnemy({ 1: { params: [1, 0, 0, 0, 0, 0, 0, 0], exp: 10, rrExpMax: 20, gold: 5, rrGoldMax: 7, dropItems: [] },
        2: { params: [1, 0, 0, 0, 0, 0, 0, 0], exp: 10, rrExpMax: 3, gold: 5, dropItems: [] } });
    const exps = new Set(), golds = new Set();
    for (let n = 0; n < 400; n++) {
        const enemy = spawn(1);
        const exp = enemy.exp(), gold = enemy.gold();
        assert.ok(Number.isInteger(exp) && exp >= 10 && exp <= 20);
        assert.ok(Number.isInteger(gold) && gold >= 5 && gold <= 7);
        assert.equal(enemy.exp(), exp, 'asking twice gives the same reward');
        exps.add(exp); golds.add(gold);
    }
    assert.equal(exps.size, 11, 'every whole number from 10 to 20 turns up');
    assert.equal(golds.size, 3);
    const fixed = spawn(2);
    assert.equal(fixed.exp(), 10);
    assert.equal(fixed.gold(), 5);
});

test('a drop slot with a quantity range drops that many of the item', () => {
    const spawn = loadEnemy({ 1: { params: [1, 0, 0, 0, 0, 0, 0, 0], dropItems: [{ kind: 1, dataId: 3, denominator: 1, rrQtyMin: 2, rrQtyMax: 4 }] },
        2: { params: [1, 0, 0, 0, 0, 0, 0, 0], dropItems: [{ kind: 2, dataId: 1, denominator: 1, rrQtyMin: 3 }] } });
    const counts = new Set();
    for (let n = 0; n < 200; n++) {
        const drops = spawn(1).makeDropItems();
        assert.ok(drops.every(item => item.kind === 1 && item.id === 3));
        counts.add(drops.length);
    }
    assert.deepEqual([...counts].sort(), [2, 3, 4]);
    assert.equal(spawn(2).makeDropItems().length, 3, 'a minimum alone is a fixed count');
});

test('Enemy Ranges off in Reactor Features: base stats, base EXP and Gold, one of each drop', () => {
    const data = { 1: { params: [1000, 100, 100, 100, 100, 100, 100, 100], rrStatVariance: 50, exp: 10, rrExpMax: 90, gold: 5, rrGoldMax: 70,
        dropItems: [{ kind: 1, dataId: 3, denominator: 1, rrQtyMin: 4, rrQtyMax: 6 }] } };
    const system = { rrFeatures: { enemyRanges: false } };
    const spawn = loadEnemy(data, system);
    for (let n = 0; n < 50; n++) {
        const enemy = spawn(1);
        assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(id => enemy.paramBase(id)), [1000, 100, 100, 100, 100, 100, 100, 100]);
        assert.equal(enemy.exp(), 10);
        assert.equal(enemy.gold(), 5);
        assert.equal(enemy.makeDropItems().length, 1);
    }
    // On again (the default), the same data rolls: the fields were kept, only ignored.
    delete system.rrFeatures;
    const counts = new Set();
    for (let n = 0; n < 50; n++) counts.add(spawn(1).makeDropItems().length);
    assert.ok([...counts].every(count => count >= 4 && count <= 6));
});

test('Enemy Ranges off hides the range fields on the Enemies page', () => {
    const source = src('database/DatabaseEnemyEditor.js');
    assert.match(source, /rangesOn\(\) \{\n\s+const features = [^\n]+\n\s+return !features \|\| features\.on\('enemyRanges', /);
    assert.match(source, /\$\{this\.rangesOn\(\) \? `<div class="db-row-cols">\n\s+<span class="db-col">\n\s+<label>\$\{tt\('Stat Variance %'\)\}/);
    assert.match(source, /\$\{qtyOn \? `<div class="enemy-drop-qty"/);
    const Editor = vm.runInNewContext(`${source}\nDatabaseEnemyEditor;`, {
        console, window: { ReactorFeatures: require('../src/ReactorFeatures.js') }, DatabaseTraitEditor: class {}
    });
    let system = {};
    const editor = Object.create(Editor.prototype);
    editor.databaseManager = { getSystem: () => system };
    editor.escapeHTML = value => String(value);
    const enemy = { id: 1, exp: 10, rrExpMax: 20 };
    assert.match(editor.rewardRangeHTML(enemy, 'exp', 'rrExpMax'), /data-field="rrExpMax"/);
    system = { rrFeatures: { enemyRanges: false } };
    const off = editor.rewardRangeHTML(enemy, 'exp', 'rrExpMax');
    assert.match(off, /data-field="exp"/);
    assert.doesNotMatch(off, /rrExpMax/, 'off: only the MZ value');
    assert.equal(enemy.rrExpMax, 20, 'and the maximum stays saved');
});

// ---------------------------------------------------------------------------
// Random amounts on Change Gold / Items / Weapons / Armors
// ---------------------------------------------------------------------------

test('Change Gold, Items, Weapons and Armors pass a Random amount\'s top to operateValue', () => {
    const gained = [];
    const context = runtimeContext({
        $gameParty: { gainGold: value => gained.push(['gold', value]), gainItem: (item, value) => gained.push([item, value]) },
        $dataItems: [null, 'potion'], $dataWeapons: [null, 'sword'], $dataArmors: [null, 'shield']
    });
    for (const code of [125, 126, 127, 128]) vm.runInContext(lift(objects, `Game_Interpreter.prototype.command${code} = function`), context);
    vm.runInContext(lift(objects, 'Game_Interpreter.prototype.operateValue = function'), context);
    const run = (code, params) => { gained.length = 0; context.Game_Interpreter.prototype[`command${code}`](params); return gained[0][1]; };
    // Stock operands are untouched.
    assert.equal(run(125, [0, 0, 300]), 300);
    assert.equal(run(125, [1, 1, 4]), -40, 'a variable, decreased');
    assert.equal(run(126, [1, 0, 0, 2]), 2);
    for (let n = 0; n < 100; n++) {
        const gold = run(125, [0, 2, 100, 200]);
        assert.ok(gold >= 100 && gold <= 200);
        const items = run(126, [1, 0, 2, 1, 3]);
        assert.ok(items >= 1 && items <= 3);
        assert.ok(run(127, [1, 1, 2, 2, false, 5]) <= -2, 'Weapons: params[5], after Include Equipment');
        assert.ok(run(128, [1, 0, 2, 4, false, 6]) >= 4);
    }
});

test('the four dialogs offer Random and write the extra parameter only for it', () => {
    for (const [file, top] of [['ChangeGoldEditor.js', 3], ['ChangeItemsEditor.js', 4], ['ChangeWeaponsEditor.js', 5], ['ChangeArmorsEditor.js', 5]]) {
        const source = src(path.join('event', 'commands', file));
        assert.match(source, /tt\('Random'\)|label: 'Random'/, `${file} lists Random`);
        assert.match(source, new RegExp(`this\\.operandMax = params\\[${top}\\] \\?\\? this\\.operand`), `${file} reads params[${top}] back`);
        assert.match(source, /parameters: this\.operandType === 2\s*\n\s*\? \[[^\]]*this\.operandMax\]\s*\n\s*: \[/, `${file} keeps MZ's list otherwise`);
    }
    const list = src(path.join('event', 'EventCommandList.js'));
    assert.match(list, /\$\{operation\}\$\{operand\}–\$\{params\[3\] \|\| 0\} \$\{tt\('gold'\)\}/, 'the list shows a gold range');
});

// ---------------------------------------------------------------------------
// Enemies editor
// ---------------------------------------------------------------------------

function loadEnemyEditor(enemy) {
    const context = { window: {}, console: { log() {}, debug() {} }, require, DatabaseTraitEditor: class {},
        rrEscapeHtml: require(path.join(editorRoot, 'src', 'utils', 'HtmlEscape.js')) };
    const source = src('database/DatabaseEnemyEditor.js');
    const Editor = vm.runInNewContext(`${paramNamesSource()}\n${source}\n;DatabaseEnemyEditor;`, context);
    const editor = new Editor({
        getStates: () => [], getSkills: () => [], getSystem: () => ({ switches: [] }),
        getItems: () => [null, { id: 1, name: 'Potion' }], getWeapons: () => [], getArmors: () => [],
        getEnemy: () => enemy, updateEnemy() {}
    }, null, null, null);
    return { editor, source, Editor };
}

test('the Enemies page has Stat Variance, EXP and Gold maximums and a drop quantity', () => {
    const enemy = { id: 1, exp: 10, gold: 5, params: [1, 0, 0, 0, 0, 0, 0, 0],
        dropItems: [{ kind: 1, dataId: 1, denominator: 2 }, { kind: 0, dataId: 1, denominator: 1 }, { kind: 0, dataId: 1, denominator: 1 }] };
    const { editor, source } = loadEnemyEditor(enemy);
    assert.match(source, /data-field="rrStatVariance"[^>]*/);
    assert.match(source, /min="0" max="50" step="1" data-field="rrStatVariance"/);
    assert.match(editor.rewardRangeHTML(enemy, 'exp', 'rrExpMax'), /data-field="rrExpMax"/);
    assert.match(editor.rewardRangeHTML(enemy, 'gold', 'rrGoldMax'), /data-field="rrGoldMax"/);
    const drops = editor.buildDropItemsHTML(enemy);
    assert.equal((drops.match(/data-drop-field="rrQtyMin"/g) || []).length, 3);
    assert.equal((drops.match(/data-drop-field="rrQtyMax"/g) || []).length, 3);
});

test('the Enemies page stores a range only when it is one', () => {
    const enemy = { id: 1, exp: 10, gold: 5, params: [1, 0, 0, 0, 0, 0, 0, 0],
        dropItems: [{ kind: 1, dataId: 1, denominator: 2 }, { kind: 0, dataId: 1, denominator: 1 }, { kind: 0, dataId: 1, denominator: 1 }] };
    const { editor } = loadEnemyEditor(enemy);
    editor.updateEnemyField(1, 'rrStatVariance', '75');
    assert.equal(enemy.rrStatVariance, 50, 'held at 50%');
    editor.updateEnemyField(1, 'rrStatVariance', '0');
    assert.equal('rrStatVariance' in enemy, false);
    editor.updateEnemyField(1, 'rrGoldMax', '40');
    assert.equal(enemy.rrGoldMax, 40);
    editor.updateEnemyField(1, 'rrGoldMax', '');
    assert.equal('rrGoldMax' in enemy, false, 'a blank maximum is the stock fixed reward');
    editor.updateEnemyField(1, 'dropItems', '3', null, '0', 'rrQtyMax');
    assert.deepEqual([enemy.dropItems[0].rrQtyMin, enemy.dropItems[0].rrQtyMax], [undefined, 3]);
    editor.updateEnemyField(1, 'dropItems', '5', null, '0', 'rrQtyMin');
    assert.deepEqual([enemy.dropItems[0].rrQtyMin, enemy.dropItems[0].rrQtyMax], [5, undefined], 'a minimum above the maximum pulls it up');
    editor.updateEnemyField(1, 'dropItems', '1', null, '0', 'rrQtyMin');
    editor.updateEnemyField(1, 'dropItems', '1', null, '0', 'rrQtyMax');
    assert.deepEqual(Object.keys(enemy.dropItems[0]).sort(), ['dataId', 'denominator', 'kind'], '1–1 is stock: nothing stored');
});

// ---------------------------------------------------------------------------
// Higher Limits
// ---------------------------------------------------------------------------

test('Higher Limits raises the party caps only when the project opts in', () => {
    const context = runtimeContext();
    for (const head of ['Game_Party.RR_HIGHER_MAX_GOLD =', 'Game_Party.RR_HIGHER_MAX_ITEMS =',
        'Game_Party.rrHigherLimits = function', 'Game_Party.prototype.maxGold = function', 'Game_Party.prototype.maxItems = function']) {
        vm.runInContext(lift(objects, head), context);
    }
    for (const head of ['Window_ShopNumber.prototype.maxDigits = function', 'Window_ItemList.prototype.rrNumberDigits = function']) {
        vm.runInContext(lift(windows, head), context);
    }
    const party = new context.Game_Party();
    assert.equal(party.maxItems(), 99, 'MZ: 99 of each item');
    assert.equal(party.maxGold(), 99999999, 'MZ: 99,999,999 gold');
    assert.equal(context.Window_ShopNumber.prototype.maxDigits(), 2);
    assert.equal(context.Window_ItemList.prototype.rrNumberDigits(), '00');
    context.$dataSystem.rrHigherLimits = true;
    assert.equal(party.maxItems(), 9999);
    assert.equal(party.maxGold(), 9999999999);
    assert.equal(context.Window_ShopNumber.prototype.maxDigits(), 4, 'the shop asks for up to four digits');
    assert.equal(context.Window_ItemList.prototype.rrNumberDigits(), '0000');
    context.$dataSystem.rrHigherLimits = 'yes';
    assert.equal(party.maxItems(), 99, 'only a real true opts in');
    // With the registry loaded the same flag is the Higher Limits feature: off unless ticked.
    withFeatures(context);
    context.$dataSystem.rrHigherLimits = true;
    assert.equal(party.maxItems(), 9999);
    assert.equal(vm.runInContext('ReactorFeatures.on("higherLimits")', context), true);
    delete context.$dataSystem.rrHigherLimits;
    assert.equal(party.maxItems(), 99, 'off: the MZ caps apply');
    assert.equal(party.maxGold(), 99999999);
});

test('Higher Limits is one switch: the Reactor Features tick writes rrHigherLimits, and System 2 has no box of its own', () => {
    const Features = require('../src/ReactorFeatures.js');
    const feature = Features.get('higherLimits');
    assert.equal(feature.flag, 'rrHigherLimits');
    assert.equal(feature.default, false, 'opt-in, as the System 2 box was');
    assert.ok(Features.listed().some(f => f.id === 'higherLimits'), 'listed on the page');
    const sys = {};
    assert.equal(Features.on('higherLimits', sys), false);
    Features.set('higherLimits', true, sys);
    assert.deepEqual(sys, { rrHigherLimits: true }, 'the same flag the box wrote, so existing projects read as they were');
    Features.set('higherLimits', false, sys);
    assert.deepEqual(sys, {}, 'off stores nothing');

    const { createPages } = require('./helpers/database-pages.cjs');
    const system = { gameTitle: 'Sample', equipTypes: ['', 'Weapon'], weaponTypes: [''], attackMotions: [], skillTypes: ['', 'Magic'], magicSkills: [1], partyMembers: [] };
    const manager = {
        mutationGeneration: 0, data: { system, userInterfaces: [null] },
        getSystem: () => system, getActors: () => [], getActor: () => null,
        getUserInterfaces: () => [], getUserInterface: () => null
    };
    const page = createPages(manager).system2();
    assert.equal(page.querySelector('.sys2-window-text-field[data-path="rrHigherLimits"]'), null, 'no second box on System 2');
    assert.ok(!page.querySelectorAll('.database-section-header').some(header => header.dataset.sectionKey === 'limits'));
});

test('the class curve dialog no longer stops HP at 99,999 or other stats at 9,999', () => {
    const source = src('database/DatabaseClassEditor.js');
    assert.match(source, /DatabaseClassEditor\.PARAM_VALUE_LIMIT = 9999999;/);
    assert.match(source, /_paramValueLimit\(\/\*paramIdx\*\/\) \{\n\s*return DatabaseClassEditor\.PARAM_VALUE_LIMIT;/);
});

test('every new label is translated in all 17 locales', () => {
    const deep = fs.existsSync(path.join(editorRoot, 'src', 'I18nDeepTranslations.js')) ? src('I18nDeepTranslations.js') : '';
    const sandbox = { window: { dispatchEvent() {} }, document: { readyState: 'complete', documentElement: {}, addEventListener() {}, querySelectorAll() { return []; } },
        localStorage: { getItem() { return null; }, setItem() {} }, CustomEvent: class {} };
    sandbox.window.document = sandbox.document;
    const tables = vm.runInNewContext(`${deep}\n${src('I18nReviewedTranslations.js')}\n${src('I18nManager.js')}\nRR_TEXT_TRANSLATIONS;`, sandbox);
    const locales = Object.keys(tables);
    assert.equal(locales.length, 17);
    for (const key of ["Can't be sold", 'Stat Variance %', 'Qty', 'Limits', 'Higher Limits',
        'Each enemy in battle rolls its parameters within this percentage of the values here (0 = exact)',
        'Off keeps the RPG Maker MZ limits: 99 of each item and 99,999,999 gold. On allows 9,999 of each item and 9,999,999,999 gold.']) {
        for (const locale of locales) assert.ok(tables[locale][key], `${locale}: ${key}`);
    }
});
