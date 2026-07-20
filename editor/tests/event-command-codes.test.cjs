const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));
const ReactorEventCommandCodec = require(path.join(
    editorRoot, 'src', 'event', 'commands', 'ReactorEventCommandCodec.js'));

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

test('Troop Force Action and Abort Battle use the MZ command codes', () => {
    const DatabaseTroopEditor = require(path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'));
    const editor = Object.create(DatabaseTroopEditor.prototype);
    assert.deepEqual(editor.getDefaultParams(339), [0, 0, 1, -1]);
    assert.deepEqual(editor.getDefaultParams(340), []);

    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8');
    assert.match(source, /339: 'Force Action', 340: 'Abort Battle'/);
    assert.doesNotMatch(source, /338: 'Force Action'/);
});

test('schema-invalid generated metadata falls back to ordinary Script summaries', () => {
    const formatter = Object.create(EventCommandList.prototype);
    formatter.eventEditor = {};
    const tagged = (kind, data, body = 'false;') =>
        ReactorEventCommandCodec.createText(kind, data, body);

    const input = { code: 111, indent: 0, parameters: [12,
        tagged('inputCondition', { type: 'pointer', axis: null })] };
    assert.doesNotThrow(() => formatter.getCommandInfo(input));
    assert.match(formatter.getCommandInfo(input).description, /^Script:/);

    const control = { code: 122, indent: 0, parameters: [1, 1, 0, 4,
        tagged('control-variables-expression', { operator: 'add', left: null }), 0, 0] };
    assert.doesNotThrow(() => formatter.getCommandInfo(control));
    assert.match(formatter.getCommandInfo(control).description, /Script:/);

    for (const command of [
        ReactorEventCommandCodec.createScriptCommand('eventCall', null, 'false;'),
        ReactorEventCommandCodec.createScriptCommand('eventCall', {
            target: 'commonEvent', designation: 'variable', variableId: 1
        }, 'false;'),
        ReactorEventCommandCodec.createScriptCommand('picture', { operation: 'show' }, 'false;'),
        ReactorEventCommandCodec.createScriptCommand('picture', { operation: 'spin' }, 'false;')
    ]) {
        assert.doesNotThrow(() => formatter.getCommandInfo(command));
        assert.equal(formatter.getCommandInfo(command).name, 'Script');
    }

    const alteredInput = { code: 111, indent: 0, parameters: [12,
        tagged('inputCondition', { type: 'wheel', direction: 'up' }, 'true')] };
    assert.match(formatter.getCommandInfo(alteredInput).description, /^Script:/);
});

test('pictureEditorFor rejects malformed, unknown, and noncanonical picture operations', () => {
    const editors = { show: {}, move: {}, erase: {} };
    const malformed = ReactorEventCommandCodec.createScriptCommand(
        'picture', { operation: 'show' }, 'false;');
    const unknown = ReactorEventCommandCodec.createScriptCommand(
        'picture', { operation: 'spin' }, 'false;');
    const validData = {
        operation: 'erase', mode: 'all', pictureId: { source: 'direct', value: 1 },
        endPictureId: { source: 'direct', value: 1 }
    };
    const alteredBody = ReactorEventCommandCodec.createScriptCommand('picture', validData, 'false;');
    const canonical = ReactorEventCommandCodec.createScriptCommand(
        'picture', validData, ReactorEventCommandCodec.createPictureBody(validData));

    assert.equal(EventCommandList.pictureEditorFor(malformed, editors), null);
    assert.equal(EventCommandList.pictureEditorFor(unknown, editors), null);
    assert.equal(EventCommandList.pictureEditorFor(alteredBody, editors), null);
    assert.equal(EventCommandList.pictureEditorFor(canonical, editors), editors.erase);
});
