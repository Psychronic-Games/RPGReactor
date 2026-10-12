'use strict';
// What is chosen in the Traits and Effects dialogs is what is stored. These are the parts Node can check;
// the dialogs as a person uses them are swept with real clicks by tests/smoke/nw-database-choices.cjs.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const editorRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');

function traitEditor() {
    globalThis.rrEscapeHtml = require(path.join(editorRoot, 'src/utils/HtmlEscape.js'));
    if (!globalThis.window) globalThis.window = {};
    const TraitEditor = new Function(`${read('src/database/DatabaseTraitEditor.js')}\nreturn DatabaseTraitEditor;`)();
    return Object.create(TraitEditor.prototype);
}

/** A row as readRow sees it: a radio's code, a dropdown's value, a number's text. */
const row = (code, select, number) => ({
    querySelector(selector) {
        if (selector.startsWith('input[type="radio"]')) return { value: String(code) };
        if (selector.startsWith('select')) return select === undefined ? null : { value: String(select) };
        if (selector.startsWith('input[type="number"]')) return number === undefined ? null : { value: String(number) };
        return null;
    }
});

test('a type list\'s dropdown holds each type\'s own number, whatever blank names lie before it', () => {
    const editor = traitEditor();
    const html = editor._typeOptions(['', 'Fire', '', 'Ice', 'Thunder', ''], 11, { code: 11, dataId: 4, value: 1 });
    const options = Array.from(html.matchAll(/<option value="(\d+)" ?(selected)?[^>]*>([^<]*)</g)).map(m => [Number(m[1]), m[3], !!m[2]]);
    assert.deepEqual(options, [[1, 'Fire', false], [3, 'Ice', false], [4, 'Thunder', true]]);
    const source = read('src/database/DatabaseTraitEditor.js');
    // No list is numbered by its place among the names that are not blank.
    assert.doesNotMatch(source, /idx \+ 1/);
    for (const list of ['elements', 'skillTypes', 'system.weaponTypes', 'system.armorTypes', 'system.equipTypes']) {
        assert.match(source, new RegExp(`(_typeOptions|typeOptions|elementOptions|skillTypeOptions)\\(`), list);
    }
});

test('a row is read as it shows: its code, the dropdown\'s number, the number as a trait stores it', () => {
    const editor = traitEditor();
    assert.deepEqual(editor.readRow(row(52, 7)), { code: 52, dataId: 7, value: 0 });
    assert.deepEqual(editor.readRow(row(11, 9, 37)), { code: 11, dataId: 9, value: 0.37 });
    assert.deepEqual(editor.readRow(row(22, 2, 5)), { code: 22, dataId: 2, value: 0.05 });
    assert.deepEqual(editor.readRow(row(33, undefined, 12)), { code: 33, dataId: 0, value: 12 });
    assert.deepEqual(editor.readRow(row(34, undefined, 3)), { code: 34, dataId: 0, value: 3 });
    assert.deepEqual(editor.readRow(row(34, undefined, -4)), { code: 34, dataId: 0, value: 0 });
    assert.deepEqual(editor.readRow(row(61, undefined, 50)), { code: 61, dataId: 0, value: 0.5 });
    assert.deepEqual(editor.readRow(row(21, 3, '')), { code: 21, dataId: 3, value: 0 });
});

test('OK stores the row selected on the tab in view, never a choice left on another tab', () => {
    const editor = traitEditor();
    const checked = row(52, 7);
    const tab = picked => ({ querySelector: selector => (selector.includes(':checked') && picked ? { closest: () => picked } : null) });
    assert.deepEqual(editor.selectedTrait(tab(checked)), { code: 52, dataId: 7, value: 0 });
    assert.equal(editor.selectedTrait(tab(null)), null);
    // Nothing selected: nothing is added, and the author is told.
    const told = [];
    globalThis.RRDialog = { alert: message => told.push(message) };
    editor.currentTraitIndex = -1;
    editor.currentEntry = { traits: [] };
    try {
        assert.equal(editor.saveTrait(null), false);
        assert.deepEqual([editor.currentEntry.traits.length, told.length], [0, 1]);
    } finally { delete globalThis.RRDialog; }
    const source = read('src/database/DatabaseTraitEditor.js');
    assert.match(source, /this\.saveTrait\(this\.selectedTrait\(tabContent\)\)/);
    // A row is selected by its radio or its name; until then its dropdown and number are greyed and inert.
    assert.match(source, /radio\.addEventListener\('change', select\);\s*row\.querySelector\('\.rr-trait-label'\)\?\.addEventListener\('click', select\);/);
    assert.match(source, /if \(event\.target !== radio && radio\.checked\) follow\(row\);/);
    assert.match(source, /DatabaseTraitEditor\.syncRows\(container, 'trait-type'\);\s*\}\s*$/m);
});

test('only the selected row\'s dropdown and number answer: every other row is greyed and inert', () => {
    const editor = traitEditor();
    const TraitEditor = editor.constructor;
    // Rows as syncRows walks them: a radio row's parts, and a line that belongs to the row above it.
    const part = cls => ({ classList: { contains: name => name === cls }, inert: false });
    const row = (checked, sub) => {
        const radio = sub ? null : { checked }, label = part('rr-trait-label'), control = part('rr-trait-control'), value = part('rr-trait-value');
        const state = new Set();
        return { radio, label, control, value, state,
            children: sub ? [control, value] : [radio, label, control, value],
            querySelector: () => radio,
            classList: { contains: name => (name === 'rr-trait-subrow' ? !!sub : state.has(name)), toggle: (name, on) => { if (on) state.add(name); else state.delete(name); } } };
    };
    const rows = [row(false), row(true), row(false, true), row(false)];
    TraitEditor.syncRows({ children: rows }, 'trait-type');
    assert.deepEqual(rows.map(r => r.state.has('is-off')), [true, false, false, true]);
    assert.deepEqual(rows.map(r => [r.control.inert, r.value.inert]), [[true, true], [false, false], [false, false], [true, true]]);
    assert.deepEqual(rows.filter(r => r.radio).map(r => r.label.inert), [false, false, false], 'a row\'s name stays live: it selects the row');
    // The selection moves: the line under the row it left is greyed with it.
    rows[1].radio.checked = false; rows[3].radio.checked = true;
    TraitEditor.syncRows({ children: rows }, 'trait-type');
    assert.deepEqual(rows.map(r => r.state.has('is-off')), [true, true, true, false]);
    assert.equal(rows[2].control.inert, true);
    // The Effects dialog uses the same rule, and stores only what is selected in view.
    const source = read('src/database/DatabaseEffectEditor.js');
    // (A class a script declares is not a property of the global object: it is asked for by name.)
    assert.match(source, /if \(typeof DatabaseTraitEditor !== 'undefined'\) DatabaseTraitEditor\.syncRows\(container, 'effect-type'\);/);
    assert.doesNotMatch(source, /globalThis\.DatabaseTraitEditor/);
    assert.match(source, /row\.querySelector\('\.rr-trait-label'\)\?\.addEventListener\('click', \(\) => \{ if \(!radio\.checked\) radio\.click\(\); \}\);/);
    assert.doesNotMatch(source, /'pointerdown', 'change', 'input'/);
    assert.match(source, /const inView = tabContent\.querySelector\('input\[type="radio"\]\[name="effect-type"\]:checked'\);/);
    assert.match(source, /if \(this\.saveEffect\(inView \? effect : null\)\) closeModal\(\);/);
    assert.match(read('css/styles.css'), /\.rr-trait-row\.is-off > :not\(input\[type="radio"\]\):not\(\.rr-trait-label\), \.rr-trait-subrow\.is-off \{ opacity:/);
});


test('the trait list words a trait as its dialog does', () => {
    const source = read('src/database/DatabaseCommonUI.js');
    const dialog = read('src/database/DatabaseTraitEditor.js');
    // A Parameter trait shows the percent that was typed.
    assert.match(source, /\* \$\{Math\.round\(trait\.value \* 100\)\}%/);
    assert.doesNotMatch(source, /trait\.value - 1\) \* 100/);
    for (const name of ['Evasion Rate', 'Critical Evasion', 'Magic Evasion', 'Magic Reflection', 'Counter Attack', 'HP Regeneration', 'MP Regeneration', 'TP Regeneration', 'Guard Effect', 'Recovery Effect']) {
        assert.ok(source.includes(`'${name}'`) && dialog.includes(`'${name}'`), name);
    }
});

test('a class has a list of equipment slots: a type as many times as it has slots of it', () => {
    const S = require(path.join(editorRoot, 'src/utils/EquipSlots.js'));
    const system = { equipTypes: ['', 'Weapon', 'Shield', 'Head', 'Body', 'Accessory', 'Wheels'] };
    const manager = classes => ({ getSystem: () => system, getClass: id => classes[id] });
    const twoHeads = { id: 1, traits: [], rrEquipSlots: [1, 3, 3, 4] }, stock = { id: 2, traits: [] }, tagged = { id: 3, traits: [], note: '<equip slots: 1, 1, 6>' };
    const dm = manager([null, twoHeads, stock, tagged]);
    assert.deepEqual(S.resolve(dm, null, { classId: 1 }, false), [1, 3, 3, 4]);
    assert.deepEqual(S.resolve(dm, null, { classId: 1 }, true), [1, 3, 3, 4], 'its own list is the whole answer, Dual Wield or not');
    assert.deepEqual(S.resolve(dm, null, { classId: 2 }, false), [1, 2, 3, 4, 5, 6], 'no list: one slot per type, as stock data expects');
    assert.deepEqual(S.resolve(dm, null, { classId: 2 }, true), [1, 1, 3, 4, 5, 6]);
    assert.deepEqual(S.resolve(dm, null, { classId: 3 }, false), [1, 1, 6], 'a note tag still gives the slots of a class with no list');
    assert.deepEqual(S.resolveInitialBindings(dm, null, { classId: 1 }, false).map(b => [b.etypeId, b.slotIndex]), [[1, 0], [3, 1], [3, 2], [4, 3]]);
    assert.deepEqual(S.standard({ equipTypes: ['', 'Weapon', 'Shield', '', 'Body', 'Accessory', 'Wheels'] }), [1, 2, 4, 5], 'a new class: the standard five still named');
    assert.match(read('src/DatabaseEditorUI.js'), /if \(type === 'classes' && typeof RREquipSlots !== 'undefined'\) blank\.rrEquipSlots = RREquipSlots\.standard\(/);
});

test('starting equipment moves with its slot\'s type when a class\'s slots change', () => {
    const S = require(path.join(editorRoot, 'src/utils/EquipSlots.js'));
    // Weapon, Shield, Head, Body, Accessory -> Weapon, Head, Head, Wheels.
    assert.deepEqual(S.remapEquips([1, 2, 3, 4, 5], [1, 3, 3, 6], [10, 20, 30, 40, 50]), [10, 30, 0, 0]);
    // Two of a type keep their order; a third has no slot and is left out.
    assert.deepEqual(S.remapEquips([1, 1, 1], [1, 1], [7, 0, 9]), [7, 9]);
    assert.deepEqual(S.remapEquips([1, 2], [2, 1], [5, 6]), [6, 5]);
    assert.deepEqual(S.remapEquips([], [1, 2], undefined), [0, 0]);
    const data = {
        classes: [null, { id: 1, traits: [] }, { id: 2, traits: [] }],
        actors: [null, { id: 1, classId: 1, equips: [10, 20, 30, 40, 50] }, { id: 2, classId: 2, equips: [11, 21, 31, 41, 51] }],
        vehicles: [null, { id: 1, classId: 1, equips: [12, 0, 0, 0, 0] }, { id: 2, classId: 1 }]
    };
    S.setClassSlots(data, data.classes[1], [3, 1, 1], () => [1, 2, 3, 4, 5]);
    assert.deepEqual(data.classes[1].rrEquipSlots, [3, 1, 1]);
    assert.deepEqual(data.actors[1].equips, [30, 10, 0]);
    assert.deepEqual(data.vehicles[1].equips, [0, 12, 0]);
    assert.deepEqual(data.actors[2].equips, [11, 21, 31, 41, 51], 'another class is not touched');
    assert.equal('equips' in data.vehicles[2], false);
});

test('a type named since the last save is a slot of no class: the save gives each list-less class its slots as they were', () => {
    const S = require(path.join(editorRoot, 'src/utils/EquipSlots.js'));
    const make = () => ({
        system: { equipTypes: ['', 'Weapon', 'Shield', 'Head', 'Body', 'Accessory', 'Wheels'] },
        classes: [null, { id: 1, traits: [] }, { id: 2, traits: [], rrEquipSlots: [1, 6] }, { id: 3, traits: [{ code: 55, dataId: 1, value: 0 }] },
            { id: 4, traits: [], note: '<equip slots: 1, 6>' }, { id: 5, traits: [] }],
        actors: [null, { id: 1, classId: 1, equips: [10, 20, 30, 40, 50, 60] }, { id: 2, classId: 3, equips: [10, 11, 30, 40, 50, 0] },
            { id: 3, classId: 5, equips: [10, 11], traits: [{ code: 55, dataId: 1, value: 0 }] }],
        vehicles: [null]
    });
    const data = make();
    assert.deepEqual(S.settle(data, [1, 2, 3, 4, 5]), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(data.classes[1].rrEquipSlots, [1, 2, 3, 4, 5], 'Wheels is not among its slots');
    assert.deepEqual(data.actors[1].equips, [10, 20, 30, 40, 50], 'and what sat in the stock sixth slot is gone with it');
    assert.deepEqual(data.classes[2].rrEquipSlots, [1, 6], 'a class with a list keeps it');
    assert.deepEqual(data.classes[3].rrEquipSlots, [1, 1, 3, 4, 5], 'a Dual Wield class keeps its second weapon');
    assert.deepEqual(data.actors[2].equips, [10, 11, 30, 40, 50]);
    assert.equal('rrEquipSlots' in data.classes[4], false, 'a class whose slots a note tag gives is left as it is');
    assert.equal('rrEquipSlots' in data.classes[5], false, 'so is one where an actor has Dual Wield of its own');
    // Nothing new was named: nothing is written.
    const same = make();
    S.settle(same, [1, 2, 3, 4, 5, 6]);
    assert.equal(same.classes.filter(c => c && 'rrEquipSlots' in c).length, 1);
    // A project never settled before (no record of what was named) is left alone.
    const fresh = make();
    S.settle(fresh, null);
    assert.equal(fresh.classes.filter(c => c && 'rrEquipSlots' in c).length, 1);
});

test('the game uses a class\'s slots: two of a type, the first one for Change Equipment, and one place held per slot', () => {
    const source = read('../runtime/reactor_objects_battlers.js');
    const grab = name => { const from = source.indexOf(`Game_Actor.prototype.${name} = function(`); assert.ok(from > 0, name); return source.slice(from, source.indexOf('\n};\n', from) + 3); };
    const Game_Actor = function() {};
    const Game_Item = function() { this.item = null; };
    Game_Item.prototype.object = function() { return this.item; };
    new Function('Game_Actor', 'Game_Item', '$dataSystem', '$dataWeapons', '$dataArmors',
        ['classEquipSlots', 'equipSlots', 'fitEquipSlots', 'changeEquipById'].map(grab).join('\n'))(
        Game_Actor, Game_Item, { equipTypes: ['', 'Weapon', 'Shield', 'Head', 'Body', 'Accessory'] }, [null, 'sword'], [null, 'helm', 'cap']);
    const actor = (cls, dual = false) => Object.assign(new Game_Actor(), { currentClass: () => cls, isDualWield: () => dual, changed: [], given: [],
        changeEquip(slot, item) { this.changed.push([slot, item]); }, tradeItemWithParty(a, item) { this.given.push(item); } });
    const twoHeads = actor({ rrEquipSlots: [1, 3, 3, 4] });
    assert.deepEqual(twoHeads.equipSlots(), [1, 3, 3, 4]);
    assert.notEqual(twoHeads.equipSlots(), twoHeads.currentClass().rrEquipSlots, 'a copy: the class\'s list is not handed out');
    assert.deepEqual(actor({ rrEquipSlots: [1, 3, 3, 4] }, true).equipSlots(), [1, 3, 3, 4], 'its own list is the whole answer');
    assert.deepEqual(actor({}).equipSlots(), [1, 2, 3, 4, 5], 'no list: one slot per type');
    assert.deepEqual(actor({}, true).equipSlots(), [1, 1, 3, 4, 5]);
    // Change Equipment names a type: the first slot of it under a list; its stock place without one.
    twoHeads.changeEquipById(3, 1); twoHeads.changeEquipById(1, 1); twoHeads.changeEquipById(2, 1);
    assert.deepEqual(twoHeads.changed, [[1, 'helm'], [0, 'sword']], 'no Shield slot: nothing changes');
    const plain = actor({});
    plain.changeEquipById(3, 2);
    assert.deepEqual(plain.changed, [[2, 'cap']]);
    // One place per slot: a slot gained is empty, a slot lost gives what it held back.
    const held = item => Object.assign(new Game_Item(), { item });
    twoHeads._equips = [held('sword'), held('helm')];
    twoHeads.fitEquipSlots(false);
    assert.deepEqual(twoHeads._equips.map(e => e.object()), ['sword', 'helm', null, null]);
    twoHeads._equips = [held('sword'), held('helm'), held(null), held(null), held('ring'), held(null)];
    twoHeads.fitEquipSlots(false);
    assert.deepEqual([twoHeads._equips.length, twoHeads.given], [4, ['ring']]);
    plain._equips = [held('sword')];
    plain.fitEquipSlots(false);
    assert.equal(plain._equips.length, 1, 'a class with no list is left as the engine keeps it');
    assert.match(source, /Game_Actor\.prototype\.releaseUnequippableItems = function\(forcing\) \{\s*this\.fitEquipSlots\(forcing\);/);
    assert.match(read('../runtime/reactor_managers.js'), /actor\.fitEquipSlots\(false\);/);
    assert.doesNotMatch(source, /rrEquipTypes/);
});

test('Classes has the slot list; Vehicles and Traits carry nothing for it', () => {
    const classes = read('src/database/DatabaseClassEditor.js'), vehicles = read('src/database/DatabaseVehicleEditor.js');
    assert.match(classes, /createEquipSlotsSection\(classEntry\) \{/);
    assert.match(classes, /data-section-key="equipment-slots"/);
    assert.match(classes, /class="database-field-value rr-slot-type" data-index="\$\{index\}" data-rr-search="always"/);
    assert.match(classes, /slots\.setClassSlots\(this\.databaseManager\.data, classEntry, next, slotsOf\);/);
    // The list being edited is a copy: changed in place, nobody's starting equipment would move with its slot.
    assert.match(classes, /const current = \(\) => slots\.classSlots\(classEntry\)\?\.slice\(\) \|\| slots\.resolve\(/);
    assert.doesNotMatch(vehicles, /rr-equip-slot|vehicle-equipment-types|rr-slot-/);
    assert.doesNotMatch(classes + vehicles + read('src/utils/EquipSlots.js'), /code: (SEAL|54), dataId|rrEquipTypes/);
    assert.match(read('src/utils/SelectThemingShim.js'), /optionCount > 15 \|\| selectEl\.dataset\.rrSearch === 'always'/);
    assert.equal(fs.existsSync(path.join(editorRoot, 'src/utils/MultiSelect.js')), false);
    const context = { globalThis: null };
    context.globalThis = context;
    require('node:vm').createContext(context);
    require('node:vm').runInContext(read('src/I18nDeepTranslations.js'), context);
    for (const locale of Object.keys(context.RR_DEEP_TEXT_TRANSLATIONS)) assert.ok(context.RR_DEEP_TEXT_TRANSLATIONS[locale]['Equipment Slots'], locale);
    assert.equal(Object.keys(context.RR_DEEP_TEXT_TRANSLATIONS).length, 17);
});

test('a class\'s slots are put in another order by dragging one, or with the arrow keys on its grip', () => {
    const S = require(path.join(editorRoot, 'src/utils/EquipSlots.js'));
    const list = [1, 2, 3, 4, 5];
    assert.deepEqual(S.moveSlot(list, 4, 0), [5, 1, 2, 3, 4]);
    assert.deepEqual(S.moveSlot(list, 0, 2), [2, 3, 1, 4, 5]);
    assert.deepEqual(S.moveSlot(list, 1, 99), [1, 3, 4, 5, 2], 'held to the list');
    assert.equal(S.moveSlot(list, 2, 2), list, 'nothing moved: the same list, so nothing is written');
    assert.equal(S.moveSlot(list, 9, 0), list);
    assert.deepEqual(list, [1, 2, 3, 4, 5], 'the list handed in is not changed');
    // Starting equipment goes with its slot.
    const data = { classes: [null, { id: 1, traits: [], rrEquipSlots: [1, 2, 3] }], actors: [null, { id: 1, classId: 1, equips: [10, 20, 30] }], vehicles: [null] };
    S.setClassSlots(data, data.classes[1], S.moveSlot([1, 2, 3], 2, 0), () => [1, 2, 3]);
    assert.deepEqual([data.classes[1].rrEquipSlots, data.actors[1].equips], [[3, 1, 2], [30, 10, 20]]);
    const classes = read('src/database/DatabaseClassEditor.js');
    assert.match(classes, /class="rr-slot-grip" data-index="\$\{index\}"/);
    assert.match(classes, /grip\.addEventListener\('pointerdown', event => \{/);
    assert.match(classes, /move\(from, from \+ \(event\.key === 'ArrowUp' \? -1 : 1\), true\);/);
    const context = { globalThis: null };
    context.globalThis = context;
    require('node:vm').createContext(context);
    require('node:vm').runInContext(read('src/I18nDeepTranslations.js'), context);
    for (const locale of Object.keys(context.RR_DEEP_TEXT_TRANSLATIONS)) assert.ok(context.RR_DEEP_TEXT_TRANSLATIONS[locale]['Drag to reorder'], locale);
});
