'use strict';
// Slot layouts: System `rrSlotLayouts: [{ name, slots: [etypeId, ...] }]`, picked by the Slot Type trait
// (code 55; dataId 0 Normal, 1 Dual Wield, 2 + i the layout at i). The editor's data helpers, the trait
// dialog's list, and the runtime's Game_Actor with repeated equipment types, through save and load.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const editorRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');
const S = require(path.join(editorRoot, 'src/utils/EquipSlots.js'));

const equipTypes = ['', 'Weapon', 'Shield', 'Head', 'Body', 'Accessory'];
const layouts = () => [{ name: 'Two Rings', slots: [1, 4, 5, 5] }, { name: 'Beast', slots: [4] }];
const slotTrait = dataId => ({ code: 55, dataId, value: 1 });

test('the layout data: a Slot Type picks a layout, the highest one winning, and stock data has none', () => {
    const system = { equipTypes, rrSlotLayouts: layouts() };
    assert.equal(S.LAYOUT_BASE, 2);
    assert.equal(S.layoutAt(system, 0), null);
    assert.equal(S.layoutAt(system, 1), null, 'Dual Wield is not a layout');
    assert.equal(S.layoutAt(system, 2).name, 'Two Rings');
    assert.equal(S.layoutAt(system, 3).name, 'Beast');
    assert.equal(S.layoutAt(system, 4), null, 'a layout the project does not have');
    assert.equal(S.layoutAt({ equipTypes }, 2), null, 'plain MZ System');
    assert.equal(S.slotTypeOf({ traits: [slotTrait(1)] }, { traits: [slotTrait(2)] }), 2);
    assert.deepEqual(S.cleanLayout({ name: 7, slots: ['5', 0, -1, 2.5, 5] }), { name: '7', slots: [5, 5] });

    const db = {
        getSystem: () => system,
        getClass: id => ({ 1: { id: 1, traits: [] }, 2: { id: 2, traits: [slotTrait(3)] }, 3: { id: 3, traits: [], rrEquipSlots: [1, 3] } })[id]
    };
    assert.deepEqual(S.resolve(db, null, { classId: 1, traits: [slotTrait(2)] }), [1, 4, 5, 5], 'the actor\'s Slot Type');
    assert.deepEqual(S.resolve(db, null, { classId: 2, traits: [] }), [4], 'the class\'s Slot Type');
    assert.deepEqual(S.resolve(db, null, { classId: 3, traits: [slotTrait(2)] }), [1, 4, 5, 5], 'a layout comes before the class\'s list');
    assert.deepEqual(S.resolve(db, null, { classId: 3, traits: [] }), [1, 3]);
    assert.deepEqual(S.resolve(db, null, { classId: 1, traits: [slotTrait(1)] }, true), [1, 1, 3, 4, 5], 'Dual Wield as before');
    assert.deepEqual(S.resolve(db, null, { classId: 1, traits: [] }), [1, 2, 3, 4, 5], 'Normal as before');
});

test('removing a layout renumbers the Slot Type traits that name the ones after it', () => {
    const data = {
        system: { equipTypes, rrSlotLayouts: [...layouts(), { name: 'Third', slots: [5] }] },
        actors: [null, { id: 1, traits: [slotTrait(2)] }],
        classes: [null, { id: 1, traits: [slotTrait(3), slotTrait(1)] }],
        armors: [null, { id: 1, traits: [slotTrait(4)] }],
        states: [null, { id: 1, traits: [slotTrait(0)] }]
    };
    assert.equal(S.layoutUses(data, 1), 1);
    assert.equal(S.removeLayout(data, 1), true);
    assert.deepEqual(data.system.rrSlotLayouts.map(l => l.name), ['Two Rings', 'Third']);
    assert.deepEqual([data.actors[1].traits[0].dataId, data.classes[1].traits.map(t => t.dataId), data.armors[1].traits[0].dataId, data.states[1].traits[0].dataId],
        [2, [0, 1], 3, 0], 'the removed one goes back to Normal; Third follows down; Dual Wield and Normal stay');
    assert.equal(S.removeLayout(data, 5), false);
});

test('a class\'s new slot list leaves the equipment of an actor whose layout gives its slots', () => {
    const data = { system: { equipTypes, rrSlotLayouts: layouts() }, classes: [null, { id: 1, traits: [] }],
        actors: [null, { id: 1, classId: 1, traits: [slotTrait(2)], equips: [1, 4, 7, 8] }, { id: 2, classId: 1, traits: [], equips: [1, 2, 3, 4, 5] }], vehicles: [null] };
    S.setClassSlots(data, data.classes[1], [1, 3], () => [1, 2, 3, 4, 5]);
    assert.deepEqual(data.actors[1].equips, [1, 4, 7, 8]);
    assert.deepEqual(data.actors[2].equips, [1, 3]);
});

function traitEditor(system) {
    globalThis.rrEscapeHtml = require(path.join(editorRoot, 'src/utils/HtmlEscape.js'));
    if (!globalThis.window) globalThis.window = {};
    const TraitEditor = new Function(`${read('src/database/DatabaseTraitEditor.js')}\nreturn DatabaseTraitEditor;`)();
    const editor = Object.create(TraitEditor.prototype);
    editor._t = text => text;
    editor.databaseManager = { getSystem: () => system };
    return editor;
}

test('the trait dialog lists the layouts after Normal and Dual Wield, stored as 2 + their place', () => {
    const system = { equipTypes, rrSlotLayouts: layouts() };
    const html = traitEditor(system)._slotTypeOptions(system, { code: 55, dataId: 3 });
    const options = [...html.matchAll(/<option value="(\d+)"[^>]*?( selected)?>([^<]*)<\/option>/g)].map(m => [Number(m[1]), m[3], !!m[2]]);
    assert.deepEqual(options.map(o => o.slice(0, 2)), [[0, 'Normal'], [1, 'Dual Wield'], [2, 'Two Rings'], [3, 'Beast']]);
    assert.deepEqual(options.filter(o => o[2]).map(o => o[0]), [3]);
    assert.match(html, /title="Weapon, Body, Accessory, Accessory"/, 'a layout\'s slots are its option\'s explanation');
    const stock = traitEditor({ equipTypes })._slotTypeOptions({ equipTypes }, { code: 55, dataId: 0 });
    assert.equal((stock.match(/<option /g) || []).length, 2, 'stock data: Normal and Dual Wield only');
    const lost = traitEditor({ equipTypes })._slotTypeOptions({ equipTypes }, { code: 55, dataId: 4 });
    assert.match(lost, /<option value="4"[^>]* selected>Slot Layout 3<\/option>/, 'a saved layout the project lost stays, by number');
    assert.match(read('src/database/DatabaseTraitEditor.js'), /code: 55, label: this\._t\('Slot Type'\),\s*control: this\._selectHTML\('slottype-select', 55, this\._slotTypeOptions\(system, trait\)\)/);
    assert.match(read('src/database/DatabaseCommonUI.js'), /rrSlotLayouts \|\| \[\]\)\[trait\.dataId - 2\]/);
});

test('the Types page has the Slot Layouts section, and its words are in every language', () => {
    const ui = read('src/DatabaseEditorUI.js');
    assert.match(ui, /<section class="rr-types-panel rr-slot-layouts rr-db-fold" data-section-key="slotLayouts"><\/section>/);
    assert.match(ui, /RRSlotLayoutsSection\.render\(layoutsHost, system,/);
    const html = read('index.html');
    assert.ok(html.indexOf('src/database/SlotLayoutsSection.js') > html.indexOf('src/utils/EquipSlots.js'));
    const i18n = read('src/I18nManager.js');
    for (const key of ['Slot Layouts', 'Slot Layout', 'Layout name', 'Delete Layout', 'Add Slot', 'Add Layout', 'No slots']) {
        for (const locale of ['ja', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'pl', 'tr', 'ko', 'zh-Hans', 'zh-Hant', 'ar', 'el', 'id', 'th', 'vi']) {
            assert.ok(new RegExp(`RR_TEXT_TRANSLATIONS\\["${locale}"\\], \\{[^\\n]*"${key}": "`).test(i18n), `${locale}: ${key}`);
        }
    }
});

// The section in a DOM (jsdom where installed; the editor itself is checked through NW.js).
const { JSDOM } = (() => { try { return require('jsdom'); } catch (e) { return {}; } })();
test('the section edits the System list: a layout added with the stock slots, a repeated type, a removal', { skip: !JSDOM && 'jsdom is not installed' }, () => {
    const dom = new JSDOM('<div id="host"></div>');
    const saved = [globalThis.document, globalThis.RREquipSlots];
    globalThis.document = dom.window.document;
    globalThis.RREquipSlots = S;
    try {
        const Section = require(path.join(editorRoot, 'src/database/SlotLayoutsSection.js'));
        const host = dom.window.document.getElementById('host');
        const system = { equipTypes };
        let changes = 0;
        Section.render(host, system, { data: { system }, onChange: () => changes++ });
        assert.equal('rrSlotLayouts' in system, false, 'opening the page does not add the list');
        host.querySelector('.rr-slot-layout-add').click();
        assert.deepEqual(system.rrSlotLayouts, [{ name: 'Slot Layout 1', slots: [1, 2, 3, 4, 5] }]);
        host.querySelector('.rr-slot-add').click();
        assert.deepEqual(system.rrSlotLayouts[0].slots, [1, 2, 3, 4, 5, 5], 'a second Accessory');
        host.querySelectorAll('.rr-slot-remove')[2].click();
        assert.deepEqual(system.rrSlotLayouts[0].slots, [1, 2, 4, 5, 5], 'no Head');
        const shield = host.querySelectorAll('.rr-slot-type')[1];
        shield.value = '1';
        shield.dispatchEvent(new dom.window.Event('change'));
        assert.deepEqual(system.rrSlotLayouts[0].slots, [1, 1, 4, 5, 5]);
        const name = host.querySelector('.rr-slot-layout-name');
        name.value = 'Ringbearer';
        name.dispatchEvent(new dom.window.Event('input'));
        assert.equal(system.rrSlotLayouts[0].name, 'Ringbearer');
        assert.ok(changes >= 4);
    } finally {
        [globalThis.document, globalThis.RREquipSlots] = saved;
    }
});

/** The runtime's battlers, with a party and data of this test's own. */
function runtime(system) {
    const sandbox = { console, Math, JSON };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    for (const file of ['runtime/reactor_core_io.js', 'runtime/reactor_objects.js', 'runtime/reactor_objects_actions.js', 'runtime/reactor_objects_battlers.js']) {
        vm.runInContext(fs.readFileSync(path.join(editorRoot, '..', file), 'utf8'), sandbox, { filename: file });
    }
    const managers = fs.readFileSync(path.join(editorRoot, '..', 'runtime/reactor_managers.js'), 'utf8');
    const from = managers.indexOf('DataManager.correctDataErrors = function');
    const correct = managers.slice(from, managers.indexOf('\n};\n', from) + 3);
    const weapon = (id, atk) => ({ id, name: 'Sword' + id, etypeId: 1, wtypeId: 1, params: [0, 0, atk, 0, 0, 0, 0, 0], traits: [] });
    const armor = (id, name, etypeId, sum, traits = []) => ({ id, name, etypeId, atypeId: 1, params: [0, 0, 0, sum, 0, 0, 0, 0], traits });
    Object.assign(sandbox, {
        $dataSystem: system,
        $dataWeapons: [null, weapon(1, 10)],
        $dataArmors: [null, armor(1, 'Gold Ring', 5, 10), armor(2, 'Tin Ring', 5, 4), armor(3, 'Mail', 4, 20), armor(4, 'Buckler', 2, 6), armor(5, 'Cap', 3, 3),
            armor(6, 'Beast Collar', 5, 1, [slotTrait(2)])],
        $dataItems: [null], $dataSkills: [null], $dataStates: [null],
        $dataClasses: [null, { id: 1, name: 'Hero', traits: [{ code: 51, dataId: 1, value: 1 }, { code: 52, dataId: 1, value: 1 }], params: Array.from({ length: 8 }, () => [0, 100, 100]), learnings: [], expParams: [30, 20, 30, 30] }],
        $dataActors: [null, { id: 1, name: 'Reid', classId: 1, initialLevel: 1, maxLevel: 99, traits: [], equips: [1, 4, 5, 3, 1], characterName: '', faceName: '', battlerName: '', nickname: '', profile: '' }]
    });
    vm.runInContext(`
        Number.prototype.clamp = function(min, max) { return Math.min(Math.max(this, min), max); };
        var DataManager = {
            isWeapon: item => !!item && $dataWeapons.includes(item),
            isArmor: item => !!item && $dataArmors.includes(item),
            isItem: () => false, isSkill: () => false
        };
        ${correct}
        // A party of counts, as Game_Party keeps them.
        var $gameParty = {
            counts: new Map(),
            numItems(item) { return this.counts.get(item) || 0; },
            hasItem(item) { return this.numItems(item) > 0; },
            gainItem(item, amount) { if (item) this.counts.set(item, Math.max(0, this.numItems(item) + amount)); },
            loseItem(item, amount) { this.gainItem(item, -amount); },
            equipItems() { return [...this.counts.keys()].filter(item => this.numItems(item) > 0); },
            inBattle: () => false
        };
    `, sandbox);
    // The actor as the game makes it, with what Game_Actor needs from outside its file left out.
    const make = traits => {
        sandbox.$dataActors[1].traits = traits;
        return vm.runInContext(`(() => {
            const a = Object.create(Game_Actor.prototype);
            a.initMembers();
            a._actorId = 1; a._classId = 1; a._level = 1; a._name = 'Reid';
            a.initEquips($dataActors[1].equips);
            return a;
        })()`, sandbox);
    };
    return { sandbox, make };
}

const names = actor => Array.from(actor.equips(), item => (item ? item.name : null));

test('the runtime: a two-Accessory layout has its slots, equips, optimizes and clears with the repeated type', () => {
    const { sandbox, make } = runtime({ equipTypes, rrSlotLayouts: layouts() });
    const party = sandbox.$gameParty, armors = sandbox.$dataArmors;
    const reid = make([slotTrait(2)]);
    assert.equal(reid.slotType(), 2);
    assert.equal(reid.slotLayout().name, 'Two Rings');
    assert.deepEqual([...reid.equipSlots()], [1, 4, 5, 5]);
    // Starting equipment [Sword, Buckler, Cap, Mail, Gold Ring]: each place keeps what fits its type.
    assert.deepEqual(names(reid), ['Sword1', null, null, null]);
    party.gainItem(armors[1], 1); party.gainItem(armors[2], 1); party.gainItem(armors[3], 1);
    reid.changeEquip(3, armors[2]);
    reid.changeEquip(2, armors[1]);
    assert.deepEqual(names(reid), ['Sword1', null, 'Gold Ring', 'Tin Ring'], 'a ring in each Accessory slot');
    reid.changeEquip(1, armors[1]);
    assert.deepEqual(names(reid), ['Sword1', null, 'Gold Ring', 'Tin Ring'], 'a ring does not go in the Body slot');
    reid.clearEquipments();
    assert.deepEqual(names(reid), [null, null, null, null]);
    assert.equal(party.numItems(armors[1]) + party.numItems(armors[2]), 2, 'cleared rings are back with the party');
    party.gainItem(armors[1], 1);
    reid.optimizeEquipments();
    assert.deepEqual(names(reid), ['Sword1', 'Mail', 'Gold Ring', 'Gold Ring'], 'two of the best ring, as the party has two');
    // Change Equipment (319) names a type: the first slot of it.
    reid.changeEquipById(5, 2);
    assert.deepEqual(names(reid), ['Sword1', 'Mail', 'Tin Ring', 'Gold Ring']);
    reid.changeEquipById(3, 5);
    assert.deepEqual(names(reid), ['Sword1', 'Mail', 'Tin Ring', 'Gold Ring'], 'no Head slot: nothing changes');
    // The window rows name each slot by its type, a repeated one as often as it repeats.
    assert.deepEqual(Array.from(reid.equipSlots(), id => equipTypes[id]), ['Weapon', 'Body', 'Accessory', 'Accessory']);
});

test('the runtime: a layout that goes away gives back what its extra slots held; plain data is as MZ had it', () => {
    const { sandbox, make } = runtime({ equipTypes, rrSlotLayouts: layouts() });
    const party = sandbox.$gameParty, armors = sandbox.$dataArmors;
    const reid = make([]);
    assert.deepEqual([...reid.equipSlots()], [1, 2, 3, 4, 5]);
    assert.deepEqual(names(reid), ['Sword1', 'Buckler', 'Cap', 'Mail', 'Gold Ring']);
    // A Slot Type put on (a state, a class change): each new slot takes what was held of its type.
    const classTraits = sandbox.$dataClasses[1].traits;
    classTraits.push(slotTrait(2));
    reid.refresh();
    assert.deepEqual([...reid.equipSlots()], [1, 4, 5, 5]);
    assert.deepEqual(names(reid), ['Sword1', 'Mail', 'Gold Ring', null]);
    assert.deepEqual([armors[4], armors[5]].map(item => party.numItems(item)), [1, 1], 'the Buckler and the Cap went back');
    party.gainItem(armors[2], 1);
    reid.changeEquip(3, armors[2]);
    // Worn off: the second ring has no slot to go to.
    classTraits.pop();
    reid.refresh();
    assert.deepEqual([...reid.equipSlots()], [1, 2, 3, 4, 5]);
    assert.deepEqual(names(reid), ['Sword1', null, null, 'Mail', 'Gold Ring']);
    assert.equal(party.numItems(armors[2]), 1, 'the Tin Ring is back with the party');

    const plain = runtime({ equipTypes }).make([]);
    assert.equal(plain.slotLayout(), null);
    assert.deepEqual([...plain.equipSlots()], [1, 2, 3, 4, 5]);
    plain._equips.length = 3;
    plain.fitEquipSlots(false);
    assert.equal(plain._equips.length, 3, 'a project with no layouts: the engine\'s places are left as they are');
    const dual = runtime({ equipTypes }).make([slotTrait(1)]);
    assert.deepEqual([...dual.equipSlots()], [1, 1, 3, 4, 5], 'Dual Wield as before');
    const unknown = runtime({ equipTypes }).make([slotTrait(2)]);
    assert.deepEqual([...unknown.equipSlots()], [1, 2, 3, 4, 5], 'a Slot Type with no layout behind it: the stock slots');
});

test('the runtime: a layout\'s equipment saves and loads, and a save from before the layout changed is fitted on load', () => {
    const { sandbox, make } = runtime({ equipTypes, rrSlotLayouts: layouts() });
    const party = sandbox.$gameParty, armors = sandbox.$dataArmors;
    const reid = make([slotTrait(2)]);
    party.gainItem(armors[1], 2); party.gainItem(armors[3], 1);
    reid.optimizeEquipments();
    assert.deepEqual(names(reid), ['Sword1', 'Mail', 'Gold Ring', 'Gold Ring']);
    const saved = vm.runInContext('(actor => JsonEx.stringify(actor))', sandbox)(reid);
    const loaded = vm.runInContext('(text => JsonEx.parse(text))', sandbox)(saved);
    assert.equal(Object.getPrototypeOf(loaded), sandbox.Game_Actor.prototype);
    assert.deepEqual(names(loaded), ['Sword1', 'Mail', 'Gold Ring', 'Gold Ring']);
    // The project gives the layout one more Accessory and drops the Body slot; the save is loaded.
    sandbox.$dataSystem.rrSlotLayouts[0].slots = [1, 5, 5, 5];
    sandbox.$gameActors = { _data: [null, loaded] };
    vm.runInContext('$gameParty.removeInvalidMembers = () => {}; DataManager.correctDataErrors();', sandbox);
    assert.deepEqual(names(loaded), ['Sword1', 'Gold Ring', 'Gold Ring', null], 'each slot takes what was held of its type');
    assert.equal(party.numItems(armors[3]), 1, 'the Mail no slot is for now went back');
    // A save from before this version (no fitted list): one place per slot, as the class lists had it.
    delete loaded._rrFittedSlots;
    loaded._equips.push(new sandbox.Game_Item());
    loaded.fitEquipSlots(false);
    assert.deepEqual(names(loaded), ['Sword1', 'Gold Ring', 'Gold Ring', null]);
});

test('Change Equipment (319) lists the types of the actor\'s layout; others see every type, as before', () => {
    const ChangeEquipmentEditor = require(path.join(editorRoot, 'src/event/commands/ChangeEquipmentEditor.js'));
    const saved = globalThis.RREquipSlots;
    globalThis.RREquipSlots = S;
    try {
        const system = { equipTypes, rrSlotLayouts: layouts() };
        const db = { getSystem: () => system, getClass: () => ({ traits: [] }),
            data: { actors: [null, { id: 1, classId: 1, traits: [slotTrait(2)] }, { id: 2, classId: 1, traits: [] }] } };
        assert.deepEqual(ChangeEquipmentEditor.equipTypes(db, 1, 1).map(type => type.value), [1, 4, 5]);
        assert.deepEqual(ChangeEquipmentEditor.equipTypes(db, 3, 1).map(type => type.value), [1, 3, 4, 5], 'a saved type stays');
        assert.deepEqual(ChangeEquipmentEditor.equipTypes(db, 1, 2).map(type => type.value), [1, 2, 3, 4, 5]);
        assert.deepEqual(ChangeEquipmentEditor.equipTypes(db, 1).map(type => type.value), [1, 2, 3, 4, 5]);
    } finally {
        globalThis.RREquipSlots = saved;
    }
});

test('the actor\'s starting equipment follows a Slot Type that picks a layout, and only then', () => {
    const source = read('src/database/DatabaseActorEditor.js');
    const from = source.indexOf('    followSlotLayout(actor) {');
    const method = source.slice(from, source.indexOf('\n    }\n', from) + 6);
    const saved = globalThis.RREquipSlots;
    globalThis.RREquipSlots = S;
    try {
        const system = { equipTypes, rrSlotLayouts: layouts() };
        const classes = { 1: { id: 1, traits: [] } };
        const editor = new Function(`return { ${method} };`)();
        Object.assign(editor, {
            databaseManager: { getSystem: () => system, getClass: id => classes[id], updateActor() {} },
            getActorEquipSlots: actor => S.resolve(editor.databaseManager, null, actor, S.isDualWield(actor, classes[actor.classId]))
        });
        const reid = { id: 1, classId: 1, traits: [], equips: [7, 2, 3, 4, 5] };
        editor.followSlotLayout(reid);
        reid.traits.push(slotTrait(2));
        editor.followSlotLayout(reid);
        assert.deepEqual(reid.equips, [7, 4, 5, 0], 'Weapon, Body, Accessory, Accessory: each kept with its type');
        reid.traits.pop();
        editor.followSlotLayout(reid);
        assert.deepEqual(reid.equips, [7, 0, 0, 4, 5], 'back to the stock slots');
        const dual = { id: 2, classId: 1, traits: [], equips: [7, 2, 3, 4, 5] };
        editor.followSlotLayout(dual);
        dual.traits.push(slotTrait(1));
        editor.followSlotLayout(dual);
        assert.deepEqual(dual.equips, [7, 2, 3, 4, 5], 'Dual Wield alone keeps MZ\'s places');
    } finally {
        globalThis.RREquipSlots = saved;
    }
});

// ---------------------------------------------------------------------------
// Database › Reactor Features: Equipment Slot Layouts (equipSlotLayouts) and Class Equipment Slots
// (classEquipSlots) turned off. The editor and the game both fall back to MZ's slots; the data stays.
// ---------------------------------------------------------------------------

function withRegistry(fn) {
    const Features = require(path.join(editorRoot, 'src/ReactorFeatures.js'));
    const saved = globalThis.ReactorFeatures;
    globalThis.ReactorFeatures = Features;
    try { return fn(Features); } finally {
        if (saved === undefined) delete globalThis.ReactorFeatures; else globalThis.ReactorFeatures = saved;
    }
}

test('Slot Layouts off: the editor finds no layout, the trait dialog offers none, and a saved pick stays by number', () => withRegistry(() => {
    const system = { equipTypes, rrSlotLayouts: layouts(), rrFeatures: { equipSlotLayouts: false } };
    const actor = { id: 1, classId: 1, traits: [slotTrait(2)] };
    assert.equal(S.layoutFor(system, actor, null), null);
    assert.deepEqual(S.layouts(system), []);
    assert.equal(S.storedLayouts(system).length, 2, 'the layouts are kept');
    const manager = { getSystem: () => system, getClass: () => ({ id: 1, traits: [] }) };
    assert.deepEqual(S.resolve(manager, null, actor), [1, 2, 3, 4, 5], 'Normal: one slot per type');
    const html = traitEditor(system)._slotTypeOptions(system, { code: 55, dataId: 2 });
    const options = [...html.matchAll(/<option value="(\d+)"[^>]*?( selected)?>([^<]*)<\/option>/g)].map(m => [Number(m[1]), m[3], !!m[2]]);
    assert.deepEqual(options.map(o => o.slice(0, 2)), [[0, 'Normal'], [1, 'Dual Wield'], [2, 'Slot Layout 1']]);
    assert.deepEqual(options.filter(o => o[2]).map(o => o[0]), [2], 'the trait is not changed by opening it');
    delete system.rrFeatures;
    assert.equal(S.layoutFor(system, actor, null).name, 'Two Rings', 'on again: the same layout');
    // The Types page draws its Slot Layouts section only while the feature is on.
    assert.match(read('src/DatabaseEditorUI.js'), /window\.ReactorFeatures\.on\('equipSlotLayouts', system\) \? '<section class="rr-types-panel rr-slot-layouts/);
}));

test('Class Equipment Slots off: the editor gives a class with a list one slot per type, as the game does', () => withRegistry(() => {
    const system = { equipTypes, rrFeatures: { classEquipSlots: false } };
    const hero = { id: 1, traits: [], rrEquipSlots: [1, 5, 5] };
    const manager = { getSystem: () => system, getClass: () => hero };
    assert.equal(S.classSlots(hero, system), null);
    assert.deepEqual(S.resolve(manager, null, { id: 1, classId: 1, traits: [] }), [1, 2, 3, 4, 5]);
    assert.deepEqual(hero.rrEquipSlots, [1, 5, 5], 'the list is kept');
    // A save after a type is named gives no class a list while it is off.
    const data = { system: { equipTypes: [...equipTypes, 'Cape'], rrFeatures: { classEquipSlots: false } }, classes: [null, { id: 1, traits: [] }], actors: [null], vehicles: [null] };
    S.settle(data, [1, 2, 3, 4, 5]);
    assert.equal('rrEquipSlots' in data.classes[1], false);
    delete system.rrFeatures;
    assert.deepEqual(S.classSlots(hero, system), [1, 5, 5]);
    assert.deepEqual(S.resolve(manager, null, { id: 1, classId: 1, traits: [] }), [1, 5, 5]);
}));

test('the runtime with Slot Layouts off: a Slot Type that picked a layout is Normal; on again, the layout returns', () => {
    const system = { equipTypes, rrSlotLayouts: layouts(), rrFeatures: { equipSlotLayouts: false } };
    const { sandbox, make } = runtime(system);
    vm.runInContext(read('../runtime/reactor_features.js'), sandbox);
    const reid = make([slotTrait(2)]);
    assert.equal(reid.slotLayout(), null);
    assert.deepEqual([...reid.equipSlots()], [1, 2, 3, 4, 5]);
    assert.deepEqual(names(reid), ['Sword1', 'Buckler', 'Cap', 'Mail', 'Gold Ring'], "MZ's slots hold the starting equipment");
    delete system.rrFeatures;
    assert.equal(reid.slotLayout().name, 'Two Rings');
    assert.deepEqual([...reid.equipSlots()], [1, 4, 5, 5]);
});
