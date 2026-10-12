const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));

function cmd(code, indent = 0, parameters = []) {
    return { code, indent, parameters };
}

function codes(list) {
    return list.map(command => `${command.code}@${command.indent || 0}`);
}

function loadBrowserEditor(relativePath, className) {
    const source = fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');
    class EditorStub {}
    const context = {
        console: { log() {}, warn() {}, error() {}, debug() {} },
        document: { getElementById: () => null, querySelector: () => null },
        window: {},
        require,
        EventCommandList
    };
    for (const name of new Set(source.match(/\b[A-Z][A-Za-z0-9]*Editor\b/g) || [])) {
        if (!(name in context)) context[name] = EditorStub;
    }
    return vm.runInNewContext(`${source}\n${className};`, context);
}

function mapList(selected) {
    const list = Object.create(EventCommandList.prototype);
    list.refreshCommandList = () => {};
    list.selectedIndices = selected;
    return list;
}

function commonEditor(event, selected) {
    const Editor = loadBrowserEditor('src/database/DatabaseCommonEventEditor.js', 'DatabaseCommonEventEditor');
    const editor = Object.create(Editor.prototype);
    editor.currentEvent = event;
    editor.selectedCommandIndices = selected;
    editor._eventCommandListClass = () => EventCommandList;
    editor.persistEvent = () => {};
    return editor;
}

function troopEditor(page, selected) {
    const Editor = loadBrowserEditor('src/database/DatabaseTroopEditor.js', 'DatabaseTroopEditor');
    const editor = Object.create(Editor.prototype);
    editor.currentTroop = { pages: [page] };
    editor.currentBattlePageIndex = 0;
    editor.selectedCommandIndices = selected;
    editor._eventCommandListClass = () => EventCommandList;
    editor.persistTroop = () => {};
    return editor;
}

function assertTerminated(list) {
    const last = list[list.length - 1];
    assert.equal(last.code, 0, 'the list ends with its terminator');
    assert.equal(last.indent || 0, 0, 'the terminator sits at indent 0');
    assert.equal(list.filter(command => command.code === 0 && !(command.indent > 0)).length, 1,
        'exactly one terminator at indent 0');
}

test('Delete with the End row selected keeps it, in a common event and a troop page', () => {
    const event = { list: [cmd(230), cmd(0)] };
    commonEditor(event, [1]).deleteCommands(event, null);
    assert.deepEqual(codes(event.list), ['230@0', '0@0']);

    const page = { list: [cmd(230), cmd(0)] };
    troopEditor(page, [1]).deleteCommands(page, null);
    assert.deepEqual(codes(page.list), ['230@0', '0@0']);

    const map = { list: [cmd(230), cmd(0)] };
    mapList([1]).deleteCommands(map, 0);
    assert.deepEqual(codes(map.list), ['230@0', '0@0']);
});

test('a range that runs onto the End row deletes the commands and keeps the End', () => {
    const event = { list: [cmd(121), cmd(230), cmd(0)] };
    commonEditor(event, [1, 2]).deleteCommands(event, null);
    assert.deepEqual(codes(event.list), ['121@0', '0@0']);

    const page = { list: [cmd(121), cmd(230), cmd(0)] };
    troopEditor(page, [0, 1, 2]).deleteCommands(page, null);
    assert.deepEqual(codes(page.list), ['0@0']);
});

test('Cut on the End row removes nothing and writes no End to the clipboard', async () => {
    const event = { list: [cmd(230), cmd(0)] };
    const common = commonEditor(event, [1]);
    await common.cutCommands(event, null);
    assert.deepEqual(codes(event.list), ['230@0', '0@0']);
    assert.ok(!common.commandClipboard || common.commandClipboard.every(command => command.code !== 0));

    const map = { list: [cmd(230), cmd(0)] };
    const list = mapList([0, 1]);
    list.currentPage = map;
    await list.copyCommands(map, 0);
    assert.deepEqual(list.clipboard.map(command => command.code), [230]);
});

test('Paste with the End row selected lands before it', async () => {
    const pasted = cmd(121);

    const event = { list: [cmd(230), cmd(0)] };
    const common = commonEditor(event, [1]);
    common.commandClipboard = [pasted];
    await common.pasteCommands(event, null);
    assert.deepEqual(codes(event.list), ['230@0', '121@0', '0@0']);

    const page = { list: [cmd(230), cmd(0)] };
    const troop = troopEditor(page, [1]);
    troop.commandClipboard = [pasted];
    await troop.pasteCommands(page, null);
    assert.deepEqual(codes(page.list), ['230@0', '121@0', '0@0']);

    const map = { list: [cmd(230), cmd(0)] };
    const list = mapList([1]);
    list.currentPage = map;
    list.clipboard = [pasted];
    await list.pasteCommands(map, 0);
    assert.deepEqual(codes(map.list), ['230@0', '121@0', '0@0']);
});

test('a clipboard that carries an End never pastes a second one', async () => {
    const map = { list: [cmd(230), cmd(0)] };
    const list = mapList([0]);
    list.currentPage = map;
    list.clipboard = [cmd(121), cmd(0)];
    await list.pasteCommands(map, 0);
    assert.deepEqual(codes(map.list), ['121@0', '230@0', '0@0']);
    assertTerminated(map.list);
});

test('deleting a block takes its body terminators with it and leaves the list End', () => {
    // An If with Else as RPG Maker writes it: each body closes with its own code 0.
    const build = () => [
        cmd(121), cmd(111), cmd(230, 1), cmd(0, 1), cmd(411), cmd(230, 1), cmd(0, 1), cmd(412), cmd(0)
    ];
    const map = { list: build() };
    mapList([1]).deleteCommands(map, 0);
    assert.deepEqual(codes(map.list), ['121@0', '0@0']);

    const event = { list: build() };
    commonEditor(event, [4]).deleteCommands(event, null);
    assert.deepEqual(codes(event.list), ['121@0', '0@0']);

    const page = { list: build() };
    troopEditor(page, [7]).deleteCommands(page, null);
    assert.deepEqual(codes(page.list), ['121@0', '0@0']);
});

test('a body terminator selected on its own is not deleted', () => {
    const map = { list: [cmd(111), cmd(230, 1), cmd(0, 1), cmd(412), cmd(0)] };
    mapList([2]).deleteCommands(map, 0);
    assert.deepEqual(codes(map.list), ['111@0', '230@1', '0@1', '412@0', '0@0']);

    const event = { list: [cmd(111), cmd(230, 1), cmd(0, 1), cmd(412), cmd(0)] };
    commonEditor(event, [1, 2]).deleteCommands(event, null);
    assert.deepEqual(codes(event.list), ['111@0', '0@1', '412@0', '0@0']);
});

test('a block without its end marker deletes only what belongs to it', () => {
    // The If lost its 412: its body is the deeper rows, the Wait is not part of it.
    const build = () => [cmd(111), cmd(121, 1), cmd(230), cmd(0)];
    const map = { list: build() };
    mapList([0]).deleteCommands(map, 0);
    assert.deepEqual(codes(map.list), ['230@0', '0@0']);

    const event = { list: build() };
    commonEditor(event, [0]).deleteCommands(event, null);
    assert.deepEqual(codes(event.list), ['230@0', '0@0']);

    const loop = { list: [cmd(112), cmd(121, 1), cmd(230), cmd(0)] };
    mapList([0]).deleteCommands(loop, 0);
    assert.deepEqual(codes(loop.list), ['230@0', '0@0']);

    const choices = { list: [cmd(102), cmd(402), cmd(121, 1), cmd(230), cmd(0)] };
    troopEditor(choices, [0]).deleteCommands(choices, null);
    assert.deepEqual(codes(choices.list), ['230@0', '0@0']);
});

test('ensureTerminator gives a list its End and leaves a sound list alone', () => {
    const missing = [cmd(230)];
    assert.equal(EventCommandList.ensureTerminator(missing), true);
    assert.deepEqual(codes(missing), ['230@0', '0@0']);

    const empty = [];
    assert.equal(EventCommandList.ensureTerminator(empty), true);
    assert.deepEqual(codes(empty), ['0@0']);

    // A body terminator left at the bottom is not the list's End.
    const deep = [cmd(111), cmd(230, 1), cmd(412), cmd(0, 1)];
    assert.equal(EventCommandList.ensureTerminator(deep), true);
    assert.equal(deep[deep.length - 1].indent, 0);

    const sound = [cmd(230), { code: 0, indent: null, parameters: [] }];
    const before = JSON.stringify(sound);
    assert.equal(EventCommandList.ensureTerminator(sound), false);
    assert.equal(JSON.stringify(sound), before);
});

test('no insertion lands after the End or between a body terminator and its marker', () => {
    const list = [cmd(111), cmd(230, 1), cmd(0, 1), cmd(412), cmd(0)];
    assert.equal(EventCommandList.safeInsertionIndex(list, 5), 4, 'past the End');
    assert.equal(EventCommandList.safeInsertionIndex(list, 9), 4, 'far past the End');
    assert.equal(EventCommandList.safeInsertionIndex(list, 3), 2, 'after a body terminator');
    assert.equal(EventCommandList.safeInsertionIndex(list, 4), 4, 'before the End');
    assert.equal(EventCommandList.insertionIndent(list, 2), 1);
});

test('stray terminators left by older deletions are cleared by the next deletion', () => {
    // What deleting an If used to leave behind: its body terminator, orphaned.
    const map = { list: [cmd(121), cmd(0, 1), cmd(230), cmd(0)] };
    mapList([2]).deleteCommands(map, 0);
    assert.deepEqual(codes(map.list), ['121@0', '0@0']);
});

test('all three hosts delete through the shared remover', () => {
    for (const file of ['src/database/DatabaseCommonEventEditor.js', 'src/database/DatabaseTroopEditor.js',
        'src/event/EventCommandList.js']) {
        const source = fs.readFileSync(path.join(editorRoot, file), 'utf8');
        const body = source.slice(source.indexOf('    deleteCommands('));
        assert.match(body.slice(0, 900), /removeCommands\(/, `${file} deletes through removeCommands`);
        assert.match(source, /ensureTerminator\(/, `${file} repairs a list without its End`);
    }
});

// ---- Any order of edits keeps every list well formed -------------------------

function mulberry32(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/** A random body at `indent`; `terminated` writes each body's own code 0 as RPG Maker does. */
function randomBody(random, indent, depth, terminated) {
    const body = [];
    const count = 1 + Math.floor(random() * 4);
    for (let i = 0; i < count; i++) {
        const pick = Math.floor(random() * (depth > 0 ? 9 : 5));
        const inner = () => {
            const rows = randomBody(random, indent + 1, depth - 1, terminated);
            if (terminated) rows.push(cmd(0, indent + 1));
            return rows;
        };
        if (pick === 0) body.push(cmd(230, indent, [i]));
        else if (pick === 1) body.push(cmd(101, indent), cmd(401, indent, ['a']), cmd(401, indent, ['b']));
        else if (pick === 2) body.push(cmd(355, indent, ['x']), cmd(655, indent, ['y']));
        else if (pick === 3) body.push(cmd(205, indent, [0, { list: [{ code: 1 }, { code: 0 }] }]), cmd(505, indent, [{ code: 1 }]));
        else if (pick === 4) body.push(cmd(108, indent, ['c']), cmd(408, indent, ['d']));
        else if (pick === 5) body.push(cmd(111, indent), ...inner(), cmd(412, indent));
        else if (pick === 6) body.push(cmd(111, indent), ...inner(), cmd(411, indent), ...inner(), cmd(412, indent));
        else if (pick === 7) body.push(cmd(112, indent), ...inner(), cmd(413, indent));
        else body.push(cmd(102, indent), cmd(402, indent), ...inner(), cmd(403, indent), ...inner(), cmd(404, indent));
    }
    return body;
}

/** Throws unless the list is a well-formed command list ending in its End. */
function assertWellFormed(list, label) {
    const fail = (index, why) => assert.fail(`${label}: ${why} at ${index}: ${codes(list).join(' ')}`);
    const at = (index, codeList, indent) => list[index] && codeList.includes(list[index].code)
        && (list[index].indent || 0) === indent;
    const rowsOf = { 401: 101, 405: 105, 408: 108, 505: 205, 605: 302, 655: 355, 657: 357 };
    const parse = (index, indent) => {
        while (index < list.length) {
            const command = list[index];
            const depth = command.indent || 0;
            if (depth < indent) return index;
            if (depth > indent) fail(index, 'deeper than its body');
            const code = command.code;
            if (code === 0) {
                if (indent === 0 && index !== list.length - 1) fail(index, 'End before the end');
                return index + 1;
            }
            if (rowsOf[code]) {
                const previous = list[index - 1];
                if (!previous || (previous.code !== code && previous.code !== rowsOf[code])) fail(index, 'row without its command');
                index++;
            } else if (code === 111) {
                index = parse(index + 1, indent + 1);
                if (at(index, [411], indent)) index = parse(index + 1, indent + 1);
                if (!at(index, [412], indent)) fail(index, 'If without its End');
                index++;
            } else if (code === 112) {
                index = parse(index + 1, indent + 1);
                if (!at(index, [413], indent)) fail(index, 'Loop without Repeat Above');
                index++;
            } else if (code === 102) {
                index++;
                if (!at(index, [402, 403], indent)) fail(index, 'Choices without a branch');
                while (at(index, [402, 403], indent)) index = parse(index + 1, indent + 1);
                if (!at(index, [404], indent)) fail(index, 'Choices without their End');
                index++;
            } else if ([402, 403, 404, 411, 412, 413].includes(code)) {
                fail(index, 'marker without its header');
            } else {
                index++;
            }
        }
        return index;
    };
    assert.equal(parse(0, 0), list.length, `${label}: parsed to the end`);
    const last = list[list.length - 1];
    assert.ok(last && last.code === 0 && !last.indent, `${label}: ends with its End`);
}

test('random deletes, cuts, pastes, drags and undos keep the list well formed', async () => {
    for (let seed = 1; seed <= 150; seed++) {
        const random = mulberry32(seed);
        const page = { list: [...randomBody(random, 0, 3, seed % 2 === 0), cmd(0, 0)] };
        assertWellFormed(page.list, `seed ${seed} start`);
        const list = mapList([]);
        list.currentPage = page;
        EventCommandList.trackHistory(page.list);
        const pick = () => Math.floor(random() * page.list.length);
        const select = () => {
            const count = 1 + Math.floor(random() * 3);
            if (random() < 0.3) {
                const a = pick(), b = pick();
                list.selectedIndices = [];
                for (let i = Math.min(a, b); i <= Math.max(a, b); i++) list.selectedIndices.push(i);
            } else {
                list.selectedIndices = Array.from(new Set(Array.from({ length: count }, pick)));
            }
        };
        for (let step = 0; step < 40; step++) {
            const op = Math.floor(random() * 6);
            select();
            const label = `seed ${seed} step ${step} op ${op} sel ${JSON.stringify(list.selectedIndices)}`;
            if (op === 0) {
                list.deleteCommands(page, 0);
            } else if (op === 1) {
                await list.cutCommands(page, 0);
            } else if (op === 2) {
                await list.copyCommands(page, 0);
                select();
                if (list.clipboard?.length) await list.pasteCommands(page, 0);
            } else if (op === 3 || op === 4) {
                EventCommandList.moveCommands(page.list, list.expandSelection(page), Math.floor(random() * (page.list.length + 2)));
            } else if (random() < 0.5) {
                EventCommandList.undoList(page.list);
            } else {
                EventCommandList.redoList(page.list);
            }
            EventCommandList.trackHistory(page.list);
            assertWellFormed(page.list, label);
        }
        // Undo all the way back gives the list it started as.
        const start = JSON.stringify(randomBodyStart(seed));
        while (EventCommandList.undoList(page.list)) { /* back to the first state */ }
        assert.equal(JSON.stringify(page.list), start, `seed ${seed}: undo returns to the start`);
    }
});

function randomBodyStart(seed) {
    const random = mulberry32(seed);
    return [...randomBody(random, 0, 3, seed % 2 === 0), cmd(0, 0)];
}
