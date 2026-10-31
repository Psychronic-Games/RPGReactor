'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ECL = require('../src/event/EventCommandList.js');
const source = fs.readFileSync(path.join(__dirname, '../src/database/DatabaseCommonEventEditor.js'), 'utf8');
class Dialog { static supports() { return false; } }
const context = { console, EventCommandList: ECL, document: { getElementById: () => null }, window: {} };
for (const name of new Set(source.match(/\b[A-Z][A-Za-z0-9]*Editor\b/g))) if (!(name in context)) context[name] = Dialog;
context.BattleProcessingEditor = require('../src/event/commands/BattleProcessingEditor.js');
const Editor = vm.runInNewContext(`${source}\nDatabaseCommonEventEditor;`, context);
function fixture(choice) {
    let current = true;
    const opened = [], event = { list: [{ code: 0, indent: 0, parameters: [] }] };
    const dialog = name => ({ show(...args) { opened.push({ name, args, callback: args.find(a => typeof a === 'function') }); } });
    const formatter = new Proxy({ _reactorCommandEditor: name => name ? dialog(`reactor:${name}`) : null }, { get: (object, name) => object[name] || dialog(name) });
    const editor = Object.create(Editor.prototype);
    Object.assign(editor, {
        parentEditor: { captureDetailContext: () => () => current },
        currentEvent: event, selectedCommandIndices: [],
        commandPicker: { show: pick => pick(choice) },
        getEditor: name => dialog(name), _getFormatter: () => formatter,
        _eventCommandListClass: () => ECL, persistEvent() {}
    });
    return { editor, event, opened, retire() { current = false; } };
}
test('common-event insertion opens every formerly omitted simple dialog before writing a command', () => {
    for (const code of [138,202,203,204,221,222,233,234,236,261,282,283,284,285,322,323,324,325,342]) {
        const { editor, event, opened } = fixture({ code });
        editor.insertNewCommand(event, 0);
        assert.equal(opened.length, 1, `code ${code} opens a dialog`);
        assert.equal(opened[0].name, ECL.simpleCommandEditor(code).editor);
        assert.equal(event.list.length, 1, 'opening or cancelling inserts nothing');
        opened[0].callback({ code, indent: 0, parameters: [1] });
        assert.equal(event.list[0].code, code);
        assert.equal(event.list.at(-1).code, 0);
    }
});
test('a new common-event shop uses the goods dialog, and a retired callback cannot insert', () => {
    const { editor, event, opened, retire } = fixture({ code: 302 });
    editor.insertNewCommand(event, 0);
    assert.equal(opened[0]?.name, 'shopProcessing');
    assert.equal(event.list.length, 1);
    retire();
    opened[0].callback([{ code: 302, indent: 0, parameters: [0,1,0,0,false] }]);
    assert.equal(event.list.length, 1);
});
test('new Reactor commands in common events use their own dialogs and operation names', () => {
    for (const reactor of ['GetOnVehicle','QuestSet','StartMapBattle','CallUserInterface','ChangeFollowerFormation','TransformModel3D','LightSwitch','ScopedWait']) {
        const { editor, event, opened } = fixture({ code: 357, reactor });
        editor.insertNewCommand(event, 0);
        assert.equal(opened[0]?.name, `reactor:${reactor}`);
        assert.equal(opened[0].args[2], reactor);
        assert.equal(opened[0].args[3].type, 'common');
        assert.equal(event.list.length, 1);
        opened[0].callback({ code: 357, indent: 0, parameters: ['RPGReactor',reactor,'',{}] });
        assert.equal(event.list[0].parameters[1], reactor);
    }
});
test('editing a Reactor common-event command replaces its continuation rows and preserves neighbors', () => {
    const { editor, event, opened } = fixture({});
    event.list = [
        { code: 357, indent: 1, parameters: ['RPGReactor','QuestSet','',{}] },
        { code: 657, indent: 1, parameters: ['old explanation'] },
        { code: 230, indent: 1, parameters: [60] },
        { code: 0, indent: 0, parameters: [] }
    ];
    editor.editCommand(0, event);
    assert.equal(opened[0]?.name, 'reactor:QuestSet');
    opened[0].callback({ code: 357, indent: 0, parameters: ['RPGReactor','QuestSet','',{id:2}] });
    assert.equal(event.list.length, 3);
    assert.equal(event.list[0].indent, 1);
    assert.equal(event.list[0].parameters[3].id, 2);
    assert.equal(event.list[1].code, 230);
});
test('editing Start Battle on Map keeps branch bodies without duplicating result markers', () => {
    const { editor, event, opened } = fixture({});
    const header = { code: 357, indent: 0, parameters: ['RPGReactor','StartMapBattle','',{canEscape:true,canLose:false}] };
    event.list = [header,{code:601,indent:0,parameters:[]},{code:118,indent:1,parameters:['win body']},{code:0,indent:1,parameters:[]},{code:602,indent:0,parameters:[]},{code:0,indent:1,parameters:[]},{code:604,indent:0,parameters:[]},{code:0,indent:0,parameters:[]}];
    editor.editCommand(0, event);
    assert.equal(opened[0]?.name, 'reactor:StartMapBattle');
    assert.equal(typeof opened[0].args[3].beforeStore, 'function');
    opened[0].callback([header,{code:601,indent:0,parameters:[]},{code:0,indent:1,parameters:[]},{code:602,indent:0,parameters:[]},{code:0,indent:1,parameters:[]},{code:604,indent:0,parameters:[]}]);
    assert.equal(event.list.filter(c=>c.code===601).length, 1);
    assert.equal(event.list.filter(c=>c.code===602).length, 1);
    assert.equal(event.list.filter(c=>c.code===604).length, 1);
    assert.equal(event.list.find(c=>c.code===118).parameters[0], 'win body');
});

test('a common-event battle creates result branches and keeps their bodies when edited', () => {
    const { editor, event, opened } = fixture({code:301});
    editor.insertNewCommand(event,0);
    opened[0].callback({code:301,indent:0,parameters:[0,1,true,true]});
    assert.equal(event.list.filter(c=>c.code===601).length,1);
    assert.equal(event.list.filter(c=>c.code===602).length,1);
    assert.equal(event.list.filter(c=>c.code===603).length,1);
    event.list.splice(2,0,{code:118,indent:1,parameters:['win body']});
    editor.editCommand(0,event);
    const dialog=opened.at(-1);
    assert.equal(typeof dialog.args[3].beforeStore,'function');
    dialog.callback({code:301,indent:0,parameters:[0,1,true,true]});
    assert.equal(event.list.filter(c=>c.code===604).length,1);
    assert.equal(event.list.find(c=>c.code===118).parameters[0],'win body');
});
