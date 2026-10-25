'use strict';
// The event lists draw a tree beside Conditional Branch, Show Choices, Loop and battle
// branches: a rail at the structure's indent from its header to its End, a tick at each
// Else / When / If Win, so it is plain which rows each case runs. Folding a block hides
// its rail with its rows.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createElement } = require('./helpers/mini-dom.cjs');

const ECL = require('../src/event/EventCommandList.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const cmd = (code, indent, parameters = []) => ({ code, indent, parameters });
// 0 Conditional Branch
// 1   Show Choices
// 2   When Yes
// 3     Text
// 4     (end)
// 5   When No
// 6     (end)
// 7   End (choices)
// 8   (end)
// 9 Else
// 10  (end)
// 11 End (branch)
// 12 (end of page)
const nested = [
    cmd(111, 0, [0, 1, 0]),
    cmd(102, 1, [['Yes', 'No'], 1, 0, 2, 0]),
    cmd(402, 1, [0, 'Yes']),
    cmd(355, 2, ['x()']),
    cmd(0, 2),
    cmd(402, 1, [1, 'No']),
    cmd(0, 2),
    cmd(404, 1),
    cmd(0, 1),
    cmd(411, 0),
    cmd(0, 1),
    cmd(412, 0),
    cmd(0, 0)
];

const levels = rails => rails.map(r => r.level);

test('a rail runs from each header to its End, ticked at every case', () => {
    const rails = ECL.railsFor(nested);
    assert.equal(rails[0].opens.level, 0, 'the branch opens a rail at its own indent');
    assert.equal(rails[1].opens.level, 1, 'the choices open one inside it');
    assert.deepEqual(levels(rails[1].through), [0]);
    assert.equal(rails[2].branch.level, 1, 'When Yes branches off the choices\' rail');
    assert.deepEqual(levels(rails[3].through), [0, 1], 'a When body row sits between both rails');
    assert.equal(rails[5].branch.level, 1);
    assert.equal(rails[7].closes.level, 1, 'the choices\' End closes theirs');
    assert.deepEqual(levels(rails[7].through), [0]);
    assert.equal(rails[9].branch.level, 0, 'Else branches off the outer rail');
    assert.deepEqual(rails[9].through, []);
    assert.equal(rails[11].closes.level, 0);
    assert.equal(rails[12], null, 'nothing after the structure');
    assert.notEqual(rails[0].opens.color, rails[1].opens.color, 'a structure\'s rail takes its header\'s color');
});

test('a Loop closes at Repeat Above, a battle at its End, and a header with no body has no rail', () => {
    const loop = ECL.railsFor([cmd(112, 0), cmd(113, 1), cmd(0, 1), cmd(413, 0), cmd(0, 0)]);
    assert.deepEqual(levels(loop[1].through), [0]);
    assert.equal(loop[3].closes.level, 0);
    const battle = ECL.railsFor([cmd(301, 0, [0, 1, true, true]), cmd(601, 0), cmd(0, 1), cmd(602, 0), cmd(0, 1), cmd(604, 0), cmd(0, 0)]);
    assert.equal(battle[1].branch.level, 0, 'If Win');
    assert.equal(battle[3].branch.level, 0, 'If Escape');
    assert.equal(battle[5].closes.level, 0);
    const plain = ECL.railsFor([cmd(301, 0, [0, 1, false, false]), cmd(0, 0)]);
    assert.equal(plain[0], null, 'a battle without branches draws nothing');
});

test('branch rows draw one step in, so the tick reaches them', () => {
    for (const code of [402, 403, 404, 411, 412, 413, 601, 602, 603, 604, 401]) {
        assert.equal(ECL.visualIndent(cmd(code, 2)), 3, `code ${code}`);
    }
    assert.equal(ECL.visualIndent(cmd(111, 2)), 2);
});

function withDocument(run) {
    const previous = globalThis.document;
    globalThis.document = { createElement, createTextNode: text => ({ nodeType: 3, textContent: String(text) }) };
    try { return run(); } finally { globalThis.document = previous; }
}

test('the map event list draws the rails, and a folded block hides its own', () => {
    const list = Object.assign(Object.create(ECL.prototype), {
        selectedIndices: [], collapsedBlocks: new WeakSet(), expandedPluginCommands: new Set(), _t: key => key
    });
    const page = { list: nested };
    list._rails = ECL.railsFor(nested);
    const railsOf = row => (row.children || []).filter(child => child.className === 'command-rail');
    withDocument(() => {
        assert.equal(railsOf(list.createCommandItem(nested[0], 0, page, 0)).length, 1, 'the header\'s rail down');
        assert.equal(railsOf(list.createCommandItem(nested[9], 9, page, 0)).length, 2, 'Else: rail and tick');
        assert.equal(railsOf(list.createCommandItem(nested[3], 3, page, 0)).length, 2, 'two rails past a nested body row');
        list.collapsedBlocks.add(nested[0]);
        assert.equal(railsOf(list.createCommandItem(nested[0], 0, page, 0)).length, 0, 'folded: no rail into hidden rows');
    });
});

test('the troop and common event lists draw the same rails', () => {
    for (const file of ['src/database/DatabaseTroopEditor.js', 'src/database/DatabaseCommonEventEditor.js']) {
        const source = read(file);
        assert.match(source, /const rails = ECL\.railsFor\(\w+\.list\);/, file);
        assert.match(source, /ECL\.drawRails\(div, rails\[idx\], ECL\.RAIL_GEOMETRY\.database\);/, file);
        assert.match(source, /const nameIndent = ECL\.visualIndent\(cmd\) \* ECL\.RAIL_GEOMETRY\.database\.step;/, file);
    }
});
