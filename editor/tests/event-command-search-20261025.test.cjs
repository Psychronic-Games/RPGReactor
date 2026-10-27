'use strict';
// The event command picker finds a command by name across every tab; the common event command's variable rows
// pick a game variable by name rather than a bare number.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const EventCommandPicker = require('../src/event/EventCommandPicker.js');

test('a search lists matching commands from every tab, grouped by section', () => {
    const picker = new EventCommandPicker();
    assert.equal(picker.matches(''), null, 'no search: the tabs as they are');
    const codes = q => picker.matches(q).flatMap(s => s.commands.map(c => c.code));
    assert.ok(codes('common').includes(117));
    assert.ok(codes('variables').includes(122));
    assert.ok(codes('move route').includes(205), 'every word must match');
    assert.ok(codes('battle processing').includes(301), 'a later tab is searched too');
    assert.deepEqual(picker.matches('xyzzy'), []);
    const src = fs.readFileSync(path.join(__dirname, '../src/event/EventCommandPicker.js'), 'utf8');
    assert.match(src, /e\.key !== 'Enter'[\s\S]{0,120}\[data-command-pick\]/, 'Enter picks the first match');
});

test('the common event command names its variables', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/event/commands/CommonEventEditor.js'), 'utf8');
    for (const label of ['Common Event ID Variable:', 'Event ID Variable:', 'Page Variable:']) {
        assert.match(src, new RegExp(`_createVariableRow\\(tt\\('${label}'\\)`), label);
    }
    assert.match(src, /new SwitchVariablePicker\(this\.databaseManager, this\.projectController\)\.show\('variable'/);
});
