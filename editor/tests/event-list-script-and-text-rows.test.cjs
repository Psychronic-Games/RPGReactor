'use strict';
// Two reports from users of the event lists: a Script command's further lines
// were folded behind "(+N more lines)", and a Show Text line's text was white
// on the light themes' white rows, readable only while selected.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createElement } = require('./helpers/mini-dom.cjs');

const EventCommandList = require('../src/event/EventCommandList.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const script = [
    { code: 355, indent: 0, parameters: ['var unit = BattleManager._action.friendsUnit();'] },
    { code: 655, indent: 0, parameters: ['unit.members().forEach(m => m.gainHp(10));'] },
    { code: 655, indent: 0, parameters: ['$gameMessage.add("done");'] },
    { code: 0, indent: 0, parameters: [] }
];

function withDocument(run) {
    const previous = globalThis.document;
    globalThis.document = { createElement, createTextNode: text => ({ nodeType: 3, textContent: String(text) }) };
    try { return run(); } finally { globalThis.document = previous; }
}

test('a Script command shows every line as its own row', () => {
    const list = Object.assign(Object.create(EventCommandList.prototype), {
        selectedIndices: [], collapsedBlocks: new WeakSet(), expandedPluginCommands: new Set()
    });
    const page = { list: script };
    const head = list.getCommandInfo(script[0], page, 0);
    assert.equal(head.description, script[0].parameters[0], 'the Script row holds its own first line');
    assert.doesNotMatch(head.description, /more line/);

    withDocument(() => {
        for (const index of [1, 2]) {
            const row = list.createCommandItem(script[index], index, page, 0);
            assert.ok(row, `line ${index + 1} is drawn`);
            assert.match(row.textContent, new RegExp(script[index].parameters[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
    });
});

test('the troop and common event lists draw Script lines too', () => {
    for (const file of ['src/database/DatabaseTroopEditor.js', 'src/database/DatabaseCommonEventEditor.js', 'src/event/EventCommandList.js']) {
        assert.doesNotMatch(read(file), /if \((cmd|command)\.code === 655\)\s*(return\b|\{\s*return null)/, `${file} keeps every 655 row`);
    }
});

test('a text line draws normal text in the theme-aware color and \\C[n] in the skin color', () => {
    const formatter = Object.create(EventCommandList.prototype);
    const html = formatter.convertTextCodesToHTML('A \\C[2]red\\C[0] back');
    const normal = /<span style="color: var\(--rr-message-normal-color, [^)]+\)">/g;
    assert.equal(html.match(normal)?.length, 2, 'the opening text and \\C[0] both take the normal color');
    assert.match(html, /<span class="rr-message-code-color" style="color: #[0-9a-f]{6}">red<\/span>/i);
});

test('every light theme, and no dark one, swaps the normal text color', () => {
    const css = read('css/styles.css');
    const options = read('src/OptionsManager.js');
    const palettes = [...options.matchAll(/\{ id: '([a-z]+)',\s+nameKey: 'theme\./g)].map(match => match[1]);
    assert.ok(palettes.length >= 7, 'the palette list was read');
    const lights = palettes.map(id => id === 'gold' ? 'light' : `${id}-light`);
    const rule = css.match(/:root:is\(([^)]*)\)\s*\{\s*--rr-message-normal-color:/);
    assert.ok(rule, 'the normal color is set under a light-theme selector');
    const named = [...rule[1].matchAll(/data-theme="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual([...named].sort(), [...lights].sort());
    assert.equal(css.match(/--rr-message-normal-color:/g).length, 1, 'set nowhere else');
});

test('the troop and common event lists draw \\C[n] colors as the map event list does', () => {
    const loaded = {};
    for (const [name, file] of [['DatabaseCommonEventEditor', 'DatabaseCommonEventEditor.js'], ['DatabaseTroopEditor', 'DatabaseTroopEditor.js']]) {
        try { loaded[name] = require(path.join('..', 'src', 'database', file)); } catch (error) { loaded[name] = null; }
    }
    for (const [name, Editor] of Object.entries(loaded)) {
        if (!Editor) { assert.match(read(`src/database/${name}.js`), /descriptionHTML\(cmd, info\.description/); continue; }
        const formatter = Object.create(EventCommandList.prototype);
        const editor = Object.assign(Object.create(Editor.prototype), { _formatter: formatter, commandDialogs: () => formatter });
        let redrawn = 0;
        const html = editor.descriptionHTML({ code: 401 }, 'Hello \\C[2]red\\C[0] <b>', () => redrawn++);
        assert.match(html, /<span class="rr-message-code-color" style="color: #[0-9a-f]{6}">red<\/span>/i, `${name} colors \\C[2]`);
        assert.doesNotMatch(html, /\\C\[|<b>/, `${name} hides the codes and escapes the text`);
        formatter.onWindowskinLoaded();
        assert.equal(redrawn, 1, `${name} redraws when the project's skin arrives`);
        assert.equal(editor.descriptionHTML({ code: 355 }, 'a <b>'), 'a &lt;b&gt;', `${name} leaves other rows as escaped text`);
    }
});
