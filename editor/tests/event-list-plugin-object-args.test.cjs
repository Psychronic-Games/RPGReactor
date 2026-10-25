'use strict';
// A Show Media Surface command listed its corners as "corners=[object Object],[object Obj..."
// in the event list: an argument holding objects is shown as its JSON.
const assert = require('node:assert/strict');
const test = require('node:test');

const EventCommandList = require('../src/event/EventCommandList.js');

test('a plugin command argument holding objects reads as its JSON in the event list', () => {
    const list = Object.assign(Object.create(EventCommandList.prototype), {
        selectedIndices: [], collapsedBlocks: new WeakSet(), expandedPluginCommands: new Set()
    });
    const command = { code: 357, indent: 0, parameters: ['SomePlugin', 'Place', 'Place', {
        id: 10, corners: [{ x: -1, y: -2 }], at: { x: 3 }
    }] };
    const info = list.getCommandInfo(command, { list: [command, { code: 0, indent: 0, parameters: [] }] }, 0);
    assert.doesNotMatch(info.description, /\[object Object\]/);
    assert.match(info.description, /corners=\[\{"x":-1,"y":-2\}\]/);
    assert.match(info.description, /at=\{"x":3\}/);
    assert.match(info.description, /id=10/);
});
