'use strict';
/**
 * Resource pools off and a shorter trait picker (System.json rrPoolsOff and rrHiddenTraits).
 *
 * MP or TP turned off for the project: skills priced in it cost nothing, TP gains nothing, and the
 * pool is not drawn by the stock windows (menu and battle status gauges, the battle log), the
 * Reactor menus (actor panels, gauge nodes), the Tactical and Action HUDs. With neither key the
 * game behaves exactly as before. The editor hides the pool's fields, flags a cost still stored in
 * one, and the trait picker leaves out the traits a project hides.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource, runtimeRoot } = require('./helpers/runtime-source.cjs');

const objects = runtimeSource('reactor_objects.js');
const windows = fs.readFileSync(path.join(runtimeRoot, 'reactor_windows.js'), 'utf8');
const ui = fs.readFileSync(path.join(runtimeRoot, 'reactor_ui.js'), 'utf8');

/** One `X = function(...) {...};` block out of a runtime source, by its opening line. */
function block(source, marker) {
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `runtime is missing: ${marker}`);
    return source.slice(start, source.indexOf('\n};\n', start) + 4);
}

/** The battler cost and TP methods, run against `system` as $dataSystem. */
function battlers(system) {
    const c = { $dataSystem: system, Math: Object.assign(Object.create(Math), { randomInt: n => n - 1 }), ReactorEvents: { emit() {} } };
    c.Math.floor = Math.floor;
    vm.runInNewContext(`function Game_BattlerBase() {} function Game_Battler() {} function Game_Action() {}
        Game_Battler.prototype = Object.create(Game_BattlerBase.prototype);
        ${['Game_BattlerBase.isPoolOn = function', 'Game_BattlerBase.prototype.skillMpCost = function', 'Game_BattlerBase.prototype.skillTpCost = function',
        'Game_BattlerBase.prototype.canPaySkillCost = function', 'Game_BattlerBase.prototype.paySkillCost = function', 'Game_Battler.prototype.gainSilentTp = function',
        'Game_Battler.prototype.initTp = function', 'Game_Battler.prototype.chargeTpByDamage = function', 'Game_Battler.prototype.regenerateTp = function',
        'Game_Action.prototype.applyItemUserEffect = function'].map(marker => block(objects, marker)).join('\n')}
        Game_BattlerBase.prototype.setTp = function(tp) { this._tp = Math.max(0, Math.min(100, tp)); };
        Object.defineProperty(Game_BattlerBase.prototype, 'tp', { get() { return this._tp; } });
        this.make = () => { const b = new Game_Battler(); b._mp = 3; b._tp = 0; b.mcr = 1; b.tcr = 1; b.trg = 0.1; return b; };
        this.act = (subject, item) => { const a = new Game_Action(); a.subject = () => subject; a.item = () => item; return a; };`, c);
    return c;
}

const skill = { mpCost: 5, tpCost: 20, tpGain: 10 };

test('a project with no rrPoolsOff charges and fills MP and TP exactly as before', () => {
    for (const system of [{}, { rrPoolsOff: [] }, { rrPoolsOff: 'mp' }]) {
        const c = battlers(system), b = c.make();
        assert.equal(b.skillMpCost(skill), 5);
        assert.equal(b.skillTpCost(skill), 20);
        assert.equal(b.canPaySkillCost(skill), false, 'three MP and no TP cannot pay');
        b.initTp(); assert.equal(b.tp, 24);
        b._tp = 0; b.chargeTpByDamage(0.5); assert.equal(b.tp, 25);
        b._tp = 0; b.regenerateTp(); assert.equal(b.tp, 10);
        b._tp = 0; c.act(b, skill).applyItemUserEffect(); assert.equal(b.tp, 10);
    }
});

test('MP off: skills priced in MP cost nothing and stay usable; TP is untouched', () => {
    const c = battlers({ rrPoolsOff: ['mp'] }), b = c.make();
    assert.equal(b.skillMpCost(skill), 0);
    assert.equal(b.skillTpCost(skill), 20);
    b._tp = 30;
    assert.equal(b.canPaySkillCost(skill), true);
    b.paySkillCost(skill);
    assert.deepEqual([b._mp, b._tp], [3, 10]);
});

test('TP off: no TP cost, and TP neither starts, charges, regenerates nor comes from a skill', () => {
    const c = battlers({ rrPoolsOff: ['tp'] }), b = c.make();
    assert.equal(b.skillTpCost(skill), 0);
    assert.equal(b.skillMpCost(skill), 5);
    b.initTp(); b.chargeTpByDamage(1); b.regenerateTp(); c.act(b, skill).applyItemUserEffect();
    assert.equal(b.tp, 0);
    assert.equal(c.Game_BattlerBase.isPoolOn('hp'), true, 'HP is never off');
    assert.equal(battlers({ rrPoolsOff: ['hp'] }).Game_BattlerBase.isPoolOn('hp'), true);
});

/** Window_StatusBase's gauges, Window_BattleStatus's gauge top and the battle log's MP/TP lines. */
function statusWindows(system) {
    const c = { $dataSystem: system };
    vm.runInNewContext(`function Window_Base() {} function Window_StatusBase() {} function Window_BattleStatus() {} function Window_BattleLog() {}
        Window_StatusBase.prototype = Object.create(Window_Base.prototype);
        Window_BattleStatus.prototype = Object.create(Window_StatusBase.prototype);
        Window_BattleLog.prototype = Object.create(Window_Base.prototype);
        ${['Window_Base.prototype.isPoolHidden = function', 'Window_StatusBase.prototype.placeBasicGauges = function', 'Window_StatusBase.prototype.gaugeLineHeight = function',
        'Window_BattleStatus.prototype.basicGaugesY = function', 'Window_BattleLog.prototype.displayMpDamage = function', 'Window_BattleLog.prototype.displayTpDamage = function']
        .map(marker => block(windows, marker)).join('\n')}
        Window_StatusBase.prototype.placeGauge = function(actor, type, x, y) { this.placed.push([type, y]); };
        Window_BattleStatus.prototype.extraHeight = () => 10;
        Window_BattleLog.prototype.push = function(...args) { this.pushed.push(args[0]); };
        Window_BattleLog.prototype.pushMpRecoverySound = Window_BattleLog.prototype.pushTpRecoverySound = function() {};
        Window_BattleLog.prototype.makeMpDamageText = () => 'mp'; Window_BattleLog.prototype.makeTpDamageText = () => 'tp';
        this.gauges = () => { const w = new Window_BattleStatus(); w.placed = []; w.placeBasicGauges({}, 0, 100); return JSON.stringify({ placed: w.placed, top: w.basicGaugesY({ y: 0, height: 200 }) }); };
        this.log = () => { const w = new Window_BattleLog(); w.pushed = []; const target = { isAlive: () => true, result: () => ({ mpDamage: 4, tpDamage: 6 }) };
            w.displayMpDamage(target); w.displayTpDamage(target); return w.pushed.length; };`, c);
    return c;
}

test('menu and battle status: gauges as before with every pool on; an off pool leaves no gap', () => {
    assert.deepEqual(JSON.parse(statusWindows({ optDisplayTp: true }).gauges()), { placed: [['hp', 100], ['mp', 124], ['tp', 148]], top: 190 - 72 });
    assert.deepEqual(JSON.parse(statusWindows({ optDisplayTp: false }).gauges()), { placed: [['hp', 100], ['mp', 124]], top: 190 - 48 });
    assert.deepEqual(JSON.parse(statusWindows({ optDisplayTp: true, rrPoolsOff: ['mp'] }).gauges()), { placed: [['hp', 100], ['tp', 124]], top: 190 - 48 });
    assert.deepEqual(JSON.parse(statusWindows({ optDisplayTp: true, rrPoolsOff: ['tp'] }).gauges()), { placed: [['hp', 100], ['mp', 124]], top: 190 - 48 });
    assert.deepEqual(JSON.parse(statusWindows({ optDisplayTp: true, rrPoolsOff: ['mp', 'tp'] }).gauges()), { placed: [['hp', 100]], top: 190 - 24 });
});

test('the battle log names MP and TP changes only for a pool that is on', () => {
    assert.equal(statusWindows({}).log(), 2);
    assert.equal(statusWindows({ rrPoolsOff: ['mp'] }).log(), 1);
    assert.equal(statusWindows({ rrPoolsOff: ['mp', 'tp'] }).log(), 0);
});

test('the MV and 2000/2003 windows skip an off pool too', () => {
    const mv = fs.readFileSync(path.join(runtimeRoot, 'reactor_mv_compat.js'), 'utf8');
    assert.match(mv, /"drawActorMp", function\(actor, x, y, width\) \{\n\s*if \(this\.isPoolHidden && this\.isPoolHidden\("mp"\)\) return;/);
    assert.match(mv, /"drawActorTp", function\(actor, x, y, width\) \{\n\s*if \(this\.isPoolHidden && this\.isPoolHidden\("tp"\)\) return;/);
    const legacy = windows.slice(windows.indexOf('// RPG Maker 2000/2003 menus and battles'));
    const drawn = legacy.match(/^.*drawLegacyValue\(TextManager\.mpA.*$/gm);
    assert.ok(drawn.length >= 4);
    for (const line of drawn) assert.match(line, /if \(!this\.isPoolHidden\("mp"\)\)/, line);
});

/** ReactorUI's actor panel layout and pool check, out of reactor_ui.js. */
function panels(system) {
    const c = { $dataSystem: system, ReactorUI: {} };
    vm.runInNewContext(ui.slice(ui.indexOf('    ReactorUI.isPoolHidden = function'), ui.indexOf('    ReactorUI.actorGaugePath = function')), c);
    return c.ReactorUI;
}

test('Reactor menus: an actor panel drops the gauge, label and number of an off pool, and its custom parts', () => {
    const node = { actorFields: ['name', 'hp', 'mp', 'tp', 'states'], actorElements: {
        custom_1: { kind: 'gauge', gauge: 'mp' }, custom_2: { kind: 'value', gauge: 'tp' }, custom_3: { kind: 'label', gauge: 'variable', text: 'Hi' } } };
    const keys = system => Object.keys(panels(system).actorPanelLayout(node, 300, 160, 20)).sort();
    const all = keys({});
    for (const key of ['hp', 'mp', 'mpLabel', 'mpValue', 'tp', 'tpLabel', 'tpValue', 'custom_1', 'custom_2', 'custom_3']) assert.ok(all.includes(key), key);
    const noMp = keys({ rrPoolsOff: ['mp'] });
    for (const key of ['mp', 'mpLabel', 'mpValue', 'custom_1']) assert.ok(!noMp.includes(key), key);
    for (const key of ['hp', 'tp', 'custom_2', 'custom_3']) assert.ok(noMp.includes(key), key);
    const none = keys({ rrPoolsOff: ['mp', 'tp', 'hp'] });
    assert.deepEqual(none.filter(key => /^(hp|mp|tp)/.test(key)), ['hp', 'hpLabel', 'hpValue']);
    assert.ok(!none.includes('custom_2'));
    // What was under MP moves up into its row; a panel drawn over its own picture keeps its painted slots.
    const auto = { actorFields: ['portrait', 'name', 'hp', 'mp', 'tp', 'exp'] };
    const before = panels({}).actorPanelLayout(auto, 400, 200, 20), after = panels({ rrPoolsOff: ['mp'] }).actorPanelLayout(auto, 400, 200, 20);
    assert.deepEqual([after.tp.y, after.tpLabel.y, after.exp.y], [before.mp.y, before.mpLabel.y, before.tp.y]);
    assert.deepEqual([after.hp.y, after.portrait.y, after.name.y], [before.hp.y, before.portrait.y, before.name.y]);
    const hud = { actorFields: ['name', 'hp', 'mp', 'tp'], actorElements: { mp: { x: 74, y: 84, width: 65, height: 5 }, mpLabel: { visible: false },
        tp: { x: 74, y: 119, width: 65, height: 5 }, name: { x: 0, y: 132, width: 160, height: 24 }, custom_1: { kind: 'image', x: 0, y: 0, width: 160, height: 170 } } };
    const placed = panels({ rrPoolsOff: ['mp'] }).actorPanelLayout(hud, 160, 170, 18);
    assert.deepEqual([placed.tp.y, placed.name.y, placed.mp], [119, 132, undefined]);
    const both = panels({ rrPoolsOff: ['mp', 'tp'] }).actorPanelLayout(Object.assign({}, auto, { actorElements: { mpLabel: { x: 250, y: 126 } } }), 400, 200, 20);
    assert.equal(both.exp.y, before.mp.y, 'with both off EXP moves up two rows, hand-placed labels or not');
    // A gauge node of an off pool is not shown; the HUD's TP follows the switch.
    assert.match(ui, /if \(node && node\.type === "gauge" && ReactorUI\.isPoolHidden\(node\.gauge\)\) return false;/);
    assert.match(ui, /\$dataSystem\.optDisplayTp !== false && !ReactorUI\.isPoolHidden\("tp"\)/);
});

test('the Tactical and Action HUDs leave an off pool out of their gauges', () => {
    const Fight = require('../../runtime/reactor_ui_fight.js');
    const Action = require('../../runtime/reactor_ui_action.js');
    const unit = Fight.normalizeProps({ fightUnit: 'active' }, 'fightUnit');
    const vitals = Action.defaultProps('actionVitals');
    const keys = () => Fight.unitLayout(unit, 300, 160, true).gauges.map(gauge => gauge.key || gauge);
    try {
        globalThis.$dataSystem = {};
        assert.deepEqual(keys(), ['hp', 'mp', 'tp']);
        assert.ok(Action.vitalsLayout(vitals, 300, 88).mp && Action.vitalsLayout(vitals, 300, 88).tp);
        globalThis.$dataSystem = { rrPoolsOff: ['mp'] };
        assert.deepEqual(keys(), ['hp', 'tp']);
        const one = Action.vitalsLayout(vitals, 300, 88);
        assert.equal(one.mp, null);
        assert.ok(one.tp && one.tp.width > 200, 'TP takes the whole row');
        globalThis.$dataSystem = { rrPoolsOff: ['mp', 'tp'] };
        assert.deepEqual(keys(), ['hp']);
        assert.deepEqual([Action.vitalsLayout(vitals, 300, 88).mp, Action.vitalsLayout(vitals, 300, 88).tp], [null, null]);
    } finally {
        delete globalThis.$dataSystem;
    }
});

// ---- Editor --------------------------------------------------------------------------------

const Pools = require('../src/database/ResourcePools.js');

/** An editor class out of its browser script, with ResourcePools and an escaper beside it. */
function editorClass(file, name) {
    const c = { ResourcePools: Pools, rrEscapeHtml: value => String(value), window: {}, globalThis: null };
    c.globalThis = c;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/database', file), 'utf8') + `\nthis.${name} = ${name};`, c);
    return c[name];
}

test('the System.json keys: absent by default, written only while something is off or hidden', () => {
    const system = { terms: { basic: ['Level', 'Lv', 'HP', 'HP', 'Mana', 'MA', 'TP', 'TP', 'EXP', 'EXP'] } };
    assert.equal(Pools.isOff(system, 'mp'), false);
    Pools.setOff(system, 'tp', true); Pools.setOff(system, 'mp', true); Pools.setOff(system, 'hp', true);
    assert.deepEqual(system.rrPoolsOff, ['mp', 'tp']);
    Pools.setOff(system, 'mp', false); Pools.setOff(system, 'tp', false);
    assert.equal('rrPoolsOff' in system, false);
    assert.equal(Pools.term(system, 'mp'), 'MA');
    assert.equal(Pools.label(system, 'mp', 'MP Cost'), 'MA Cost');
    assert.equal(Pools.label(system, 'tp', 'TP Cost'), 'TP Cost');
    assert.equal(Pools.label(system, 'mp', 'Coste'), 'Coste (MA)');
    Pools.setTraitsHidden(system, [64, 22, 21, 23], true);
    assert.deepEqual(system.rrHiddenTraits, [21, 22, 23, 64]);
    Pools.setTraitsHidden(system, [21, 22, 23, 64], false);
    assert.equal('rrHiddenTraits' in system, false);
});

test('every trait the picker draws is in the Trait List, under the tab it sits on', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/database/DatabaseTraitEditor.js'), 'utf8');
    const drawn = [...source.matchAll(/code: (\d+), label: this\._t\('([^']+)'\)/g)].map(m => [Number(m[1]), m[2]]);
    const listed = Pools.TRAIT_TABS.flatMap(tab => tab.traits);
    assert.deepEqual(drawn.slice().sort((a, b) => a[0] - b[0]), listed.slice().sort((a, b) => a[0] - b[0]));
});

/** The trait editor with `system` as the project's System.json, its tabs rendered to strings. */
function traitEditor(system) {
    const Editor = editorClass('DatabaseTraitEditor.js', 'DatabaseTraitEditor');
    const editor = new Editor({ getSystem: () => system, getStates: () => [], getSkills: () => [] }, null);
    editor.databaseManager.getSkills = () => [];
    return editor;
}

test('the trait picker: everything by default; hidden traits and empty tabs left out, the edited trait kept', () => {
    assert.deepEqual(Pools.visibleTraitTabs({}).map(tab => tab.id), ['rates', 'param', 'attack', 'skill', 'equip', 'other']);
    assert.deepEqual(Pools.visibleTraitTabs({}).find(tab => tab.id === 'attack').codes, [31, 32, 33, 34, 35]);
    const system = { rrHiddenTraits: [11, 12, 15, 13, 14, 62] };
    assert.deepEqual(Pools.visibleTraitTabs(system).map(tab => tab.id), ['param', 'attack', 'skill', 'equip', 'other']);
    assert.equal(Pools.firstShownCode(system), 21);
    assert.deepEqual(Pools.visibleTraitTabs(system, 13).find(tab => tab.id === 'rates').codes, [13]);
    assert.deepEqual(Pools.visibleTraitTabs({ rrHiddenTraits: Pools.TRAIT_TABS.flatMap(t => t.traits.map(([c]) => c)) }).length, 6, 'all hidden still opens');

    const editor = traitEditor(system);
    const row = (trait, code) => editor._rowHTML(trait, { code, label: 'L' + code, value: '<input>' });
    assert.equal(row({ code: 21 }, 62), '', 'a hidden trait has no row');
    assert.ok(row({ code: 62 }, 62).includes('value="62"'), 'the trait being edited keeps its row');
    assert.ok(row({ code: 21 }, 61).includes('value="61"'));
    const plain = traitEditor({});
    assert.ok(plain._rowHTML({ code: 21 }, { code: 62, label: 'L', value: 'v' }).includes('value="62"'), 'nothing hidden by default');
});

test('skill and item fields: MP and TP as before; an off pool hides its field unless a value is stored there, then flags it', () => {
    const Skill = editorClass('DatabaseSkillEditor.js', 'DatabaseSkillEditor');
    const tt = text => text;
    const pairs = [['mp', 'mpCost', 'MP Cost'], ['tp', 'tpCost', 'TP Cost'], ['tp', 'tpGain', 'TP Gain'], '<label>Speed</label><input data-field="speed">'];
    const fields = (system, record) => [...Skill.poolRowsHTML(system, Object.assign({ id: 1 }, record), tt, pairs).matchAll(/data-field="(\w+)"/g)].map(m => m[1]);
    const rows = (system, record) => (Skill.poolRowsHTML(system, Object.assign({ id: 1 }, record), tt, pairs).match(/db-row-pair/g) || []).length;
    assert.deepEqual(fields({}, {}), ['mpCost', 'tpCost', 'tpGain', 'speed']);
    assert.equal(rows({}, {}), 2);
    assert.deepEqual(fields({ rrPoolsOff: ['tp'] }, { tpCost: 0 }), ['mpCost', 'speed']);
    assert.equal(rows({ rrPoolsOff: ['tp'] }, {}), 1);
    assert.deepEqual(fields({ rrPoolsOff: ['mp', 'tp'] }, {}), ['speed']);
    const flagged = Skill.poolRowsHTML({ rrPoolsOff: ['mp'] }, { id: 1, mpCost: 8 }, tt, pairs);
    assert.match(flagged, /class="rr-pool-off"[^>]*>MP Cost \(off\)<\/label>/);
    const renamed = Skill.poolRowsHTML({ terms: { basic: ['', '', '', '', 'Ki', 'KI', 'Rage', 'RG'] } }, { id: 1 }, tt, pairs);
    assert.match(renamed, />KI Cost</);
    assert.match(renamed, />RG Gain</);
});

test('the editor loads ResourcePools before the editors that read it, and the new words are translated', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assert.ok(html.indexOf('src/database/ResourcePools.js') > 0 && html.indexOf('src/database/ResourcePools.js') < html.indexOf('src/database/DatabaseTraitEditor.js'));
    const i18n = fs.readFileSync(path.join(__dirname, '../src/I18nManager.js'), 'utf8');
    const locales = ['ja', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'pl', 'tr', 'ko', 'zh-Hans', 'zh-Hant', 'ar', 'el', 'id', 'th', 'vi'];
    for (const locale of locales) {
        const line = i18n.split('\n').find(l => l.startsWith(`Object.assign(RR_TEXT_TRANSLATIONS["${locale}"], {"Use MP"`));
        assert.ok(line, locale);
        for (const key of ['Use TP', 'Resource Pools', 'Trait List', 'This pool is turned off in System 1: the value is ignored.', 'off']) assert.ok(line.includes(JSON.stringify(key) + ':'), `${locale}: ${key}`);
    }
});
