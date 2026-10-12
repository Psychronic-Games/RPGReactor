/**
 * Change Equipment (319) is [actor, equipment type id, item]: type ids start at 1
 * (Weapon) and the runtime's changeEquipById takes slot = id - 1. The dialog wrote
 * 0 for Weapon (slot -1: nothing equipped) and 1 for Shield (an armor into the
 * weapon slot), and opened MZ's [1, 5, 4] as the wrong slot.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const ChangeEquipmentEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'ChangeEquipmentEditor.js'));

class FakeElement {
    constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.textContent = ''; this.selected = false; this.listeners = {}; }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    querySelector() { return new FakeElement('div'); }
    set innerHTML(value) { this.children = []; }
}

function all(element, out = []) {
    out.push(element);
    for (const child of element.children || []) all(child, out);
    return out;
}

const database = {
    getSystem: () => ({ equipTypes: ['', 'Blade', 'Buckler', 'Helm', 'Plate', 'Charm', 'Ring'] }),
    getActors: () => [null, { id: 1, name: 'Reid' }],
    data: {
        actors: [null, { id: 1, name: 'Reid' }],
        weapons: [null, { id: 1, name: 'Sword' }],
        armors: [null, { id: 1, name: 'Round Shield', etypeId: 2 }, { id: 2, name: 'Silver Ring', etypeId: 6 }]
    }
};

function open(command) {
    const saved = [global.document, global.window];
    global.document = { createElement: tag => new FakeElement(tag), body: { appendChild() {} } };
    global.window = {};
    try {
        const editor = new ChangeEquipmentEditor(database, {});
        editor.modal = new FakeElement('div');
        editor.modal.querySelector = () => editor._content || (editor._content = new FakeElement('div'));
        let built = null;
        editor.show(command, result => { built = result; });
        return { editor, built: () => (editor.save ? (editor.save(), built) : editor.buildCommand()) };
    } finally {
        [global.document, global.window] = saved;
    }
}

test('the equipment types are the project\'s, numbered from 1', () => {
    const types = ChangeEquipmentEditor.equipTypes(database, 1);
    assert.deepEqual(types.map(type => type.value), [1, 2, 3, 4, 5, 6]);
    assert.equal(types[0].label, 'Blade');
    assert.deepEqual(ChangeEquipmentEditor.equipTypes({}, 1).map(type => type.value), [1, 2, 3, 4, 5], 'the stock five without System');
    assert.ok(ChangeEquipmentEditor.equipTypes(database, 9).some(type => type.value === 9), 'a saved id System lacks stays');
});

test('a new command equips a weapon through type 1, and MZ\'s commands reopen as written', () => {
    assert.deepEqual(open(null).editor.buildCommand().parameters, [1, 1, 0]);
    assert.deepEqual(open({ code: 319, parameters: [1, 6, 2] }).editor.buildCommand().parameters, [1, 6, 2]);
    assert.equal(open({ code: 319, parameters: [1, 0, 1] }).editor.equipSlot, 1, 'the old 0 for Weapon reads as Weapon');
});

test('the list row names the equipment type and the item by their ids', () => {
    const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));
    const list = Object.create(EventCommandList.prototype);
    list.eventEditor = { databaseManager: database };
    global.ChangeEquipmentEditor = ChangeEquipmentEditor;
    try {
        const describe = parameters => list.getCommandInfo({ code: 319, indent: 0, parameters }, { list: [] }, 0).description;
        assert.equal(describe([1, 1, 1]), 'Blade = Sword');
        assert.equal(describe([1, 6, 2]), 'Ring = Silver Ring');
        assert.equal(describe([1, 2, 0]), 'Buckler = None');
    } finally {
        delete global.ChangeEquipmentEditor;
    }
});
