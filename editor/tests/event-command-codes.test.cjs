const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));

test('RPG Maker MZ Skip command is recognized without mutating its data', () => {
    const formatter = Object.create(EventCommandList.prototype);
    formatter.eventEditor = {};
    const command = { code: 109, indent: 2, parameters: [] };
    const before = JSON.parse(JSON.stringify(command));

    const info = formatter.getCommandInfo(command);

    assert.equal(info.name, 'Skip');
    assert.equal(info.description, '');
    assert.equal(info.color, 'var(--color-syntax-string)');
    assert.deepEqual(command, before);
});

test('unsupported event commands retain the visible unknown fallback', () => {
    const formatter = Object.create(EventCommandList.prototype);
    formatter.eventEditor = {};
    const command = { code: 9999, indent: 0, parameters: [{ plugin: true }] };
    const before = JSON.parse(JSON.stringify(command));

    const info = formatter.getCommandInfo(command);

    assert.equal(info.name, 'Unknown (9999)');
    assert.equal(info.color, '#f88');
    assert.deepEqual(command, before);
});

test('Skip display remains consistent in troop events and parameterless editing', () => {
    const listSource = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'), 'utf8');
    const troopSource = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8');

    assert.match(listSource, /NO_PARAM_EVENT_CODES = new Set\(\[[\s\S]*?109, \/\/ Skip/);
    assert.match(troopSource, /108: 'Comment', 109: 'Skip', 111: 'If'/);
    assert.match(troopSource, /code === 108 \|\| code === 109 \|\| code === 408/);
});
