'use strict';
// A state's Description field is Reactor's own: RPG Maker states carry name,
// note and four battle-log messages, and the plugins that display a state
// description (VisuStella Battle Core, State Tooltips, Equip Passive System)
// all read it from a <Help Description> block in the note. These tests pin the
// bridge that lets the field reach them, and the precedence it keeps.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function loadDataManager() {
    // reactor_managers.js is a browser script; run it against a permissive
    // sandbox so its top-level statements resolve, then keep the class.
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_managers.js'), 'utf8');
    const anyFn = new Proxy(function() {}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : anyFn, apply: () => anyFn, construct: () => anyFn });
    const sandbox = new Proxy({ console }, {
        has: () => true,
        get: (target, key) => {
            if (key === Symbol.unscopables) return undefined;
            if (key in target) return target[key];
            if (key in globalThis) return globalThis[key];
            return anyFn;
        },
        set: (target, key, value) => { target[key] = value; return true; }
    });
    sandbox.window = sandbox;
    vm.runInNewContext(source + '\nthis.__DataManager = DataManager;', sandbox);
    return sandbox.__DataManager;
}

const DataManager = loadDataManager();
const bridge = states => { DataManager.bridgeStateDescriptions(states); return states; };

test('a described state reaches plugins as a <Help Description> block, and the note is otherwise kept', () => {
    const [, plain, noted] = bridge([null,
        { id: 1, description: 'Fire damage each turn.', note: '' },
        { id: 2, description: 'Halves damage.', note: '<Stack Max: 5>' }]);
    assert.strictEqual(plain.note, '<Help Description>\nFire damage each turn.\n</Help Description>');
    assert.strictEqual(noted.note, '<Stack Max: 5>\n<Help Description>\nHalves damage.\n</Help Description>');
    assert.strictEqual(noted.description, 'Halves damage.', 'the field itself is left for the runtime UI to read');
});

test('an empty or missing description leaves the note alone', () => {
    const [a, b, c] = bridge([
        { id: 1, note: 'kept' },
        { id: 2, description: '', note: 'kept' },
        { id: 3, description: '   ', note: 'kept' }]);
    assert.deepStrictEqual([a.note, b.note, c.note], ['kept', 'kept', 'kept']);
});

test('an authored help or tooltip block keeps precedence over the field', () => {
    const help = '<Help Description>\nfrom the note\n</Help Description>';
    const tooltip = '<State Tooltip Description>\ntooltip only\n</State Tooltip Description>';
    const shortTooltip = '<Tooltip Description>\nx\n</Tooltip Description>';
    const alias = '<description>\nlower-case alias\n</description>';
    for (const note of [help, tooltip, shortTooltip, alias]) {
        const [state] = bridge([{ id: 1, description: 'from the field', note }]);
        assert.strictEqual(state.note, note, note);
    }
});

test('an <In-Battle Status Description> does not suppress the bridge', () => {
    // Battle Core reads that tag into a separate slot that only its Status
    // window consults; tooltips and the passive help window still read the
    // shared description, so the field must still reach them.
    const status = '<In-Battle Status Description>\nstatus window only\n</In-Battle Status Description>';
    const [state] = bridge([{ id: 1, description: 'from the field', note: status }]);
    assert.strictEqual(state.note, status + '\n<Help Description>\nfrom the field\n</Help Description>');
});

test('the bridge is wired to the states database, and only there', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_managers.js'), 'utf8');
    assert.match(source, /if \(object === window\.\$dataStates\) this\.bridgeStateDescriptions\(object\);/);
    assert.strictEqual(source.match(/bridgeStateDescriptions\b/g).length, 2, 'one definition, one call');
});

test('a new state record carries an empty description', () => {
    const uiSource = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'DatabaseEditorUI.js'), 'utf8');
    assert.match(uiSource, /states: \{ name: 'New State', description: '',/);
});
