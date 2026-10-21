const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));

function cmd(code, indent = 0, parameters = []) {
    return { code, indent, parameters };
}

function codes(list) {
    return list.map(command => `${command.code}@${command.indent || 0}`);
}

/** Drag what a click on `selected` selects to the gap before row `gap`. */
function drag(list, selected, gap) {
    const helper = Object.create(EventCommandList.prototype);
    helper.selectedIndices = selected;
    return EventCommandList.moveCommands(list, helper.expandSelection({ list }), gap);
}

test('a command moves to the gap it is dropped on, in either direction', () => {
    const down = [cmd(121), cmd(122), cmd(230), cmd(0)];
    assert.deepEqual(drag(down, [0], 3), { start: 2, count: 1 });
    assert.deepEqual(codes(down), ['122@0', '230@0', '121@0', '0@0']);

    const up = [cmd(121), cmd(122), cmd(230), cmd(0)];
    assert.deepEqual(drag(up, [2], 0), { start: 0, count: 1 });
    assert.deepEqual(codes(up), ['230@0', '121@0', '122@0', '0@0']);
});

test('dropping where the command already is changes nothing', () => {
    const list = [cmd(121), cmd(122), cmd(0)];
    const before = JSON.stringify(list);
    assert.equal(drag(list, [0], 0), null);
    assert.equal(drag(list, [0], 1), null);
    assert.equal(JSON.stringify(list), before);
});

test('nothing lands after the End, and the End itself does not move', () => {
    const list = [cmd(121), cmd(122), cmd(0)];
    assert.deepEqual(drag(list, [0], 3), { start: 1, count: 1 });
    assert.deepEqual(codes(list), ['122@0', '121@0', '0@0']);

    const end = [cmd(121), cmd(0)];
    assert.equal(drag(end, [1], 0), null);
    assert.deepEqual(codes(end), ['121@0', '0@0']);
});

test('a block moves whole and takes the indent of where it lands', () => {
    // If (with its body terminators) dragged into a Loop's body.
    const list = [
        cmd(111), cmd(230, 1), cmd(0, 1), cmd(411), cmd(121, 1), cmd(0, 1), cmd(412),
        cmd(112), cmd(122, 1), cmd(0, 1), cmd(413), cmd(0)
    ];
    // Any row of the If drags all of it; drop before the Loop body's terminator.
    assert.deepEqual(drag(list, [3], 9), { start: 2, count: 7 });
    assert.deepEqual(codes(list), [
        '112@0', '122@1',
        '111@1', '230@2', '0@2', '411@1', '121@2', '0@2', '412@1',
        '0@1', '413@0', '0@0'
    ]);
});

test('a block comes back out of a body at the outer indent', () => {
    const list = [cmd(112), cmd(111, 1), cmd(230, 2), cmd(412, 1), cmd(413), cmd(0)];
    assert.deepEqual(drag(list, [1], 5), { start: 2, count: 3 });
    assert.deepEqual(codes(list), ['112@0', '413@0', '111@0', '230@1', '412@0', '0@0']);
});

test('a block cannot be dropped inside itself', () => {
    const list = [cmd(111), cmd(230, 1), cmd(121, 1), cmd(412), cmd(122), cmd(0)];
    const before = JSON.stringify(list);
    for (const gap of [1, 2, 3]) assert.equal(drag(list, [0], gap), null, `gap ${gap}`);
    assert.equal(JSON.stringify(list), before);
});

test('rows that belong to a command travel with it', () => {
    const text = [cmd(101), cmd(401), cmd(401), cmd(230), cmd(0)];
    assert.deepEqual(drag(text, [0], 4), { start: 1, count: 3 });
    assert.deepEqual(codes(text), ['230@0', '101@0', '401@0', '401@0', '0@0']);

    const script = [cmd(230), cmd(355), cmd(655), cmd(0)];
    drag(script, [1], 0);
    assert.deepEqual(codes(script), ['355@0', '655@0', '230@0', '0@0']);

    const route = [cmd(230), cmd(205), cmd(505), cmd(505), cmd(0)];
    drag(route, [1], 0);
    assert.deepEqual(codes(route), ['205@0', '505@0', '505@0', '230@0', '0@0']);

    const comment = [cmd(108), cmd(408), cmd(230), cmd(0)];
    drag(comment, [0], 3);
    assert.deepEqual(codes(comment), ['230@0', '108@0', '408@0', '0@0']);

    const shop = [cmd(302), cmd(605), cmd(230), cmd(0)];
    drag(shop, [0], 3);
    assert.deepEqual(codes(shop), ['230@0', '302@0', '605@0', '0@0']);

    const scroll = [cmd(105), cmd(405), cmd(230), cmd(0)];
    drag(scroll, [0], 3);
    assert.deepEqual(codes(scroll), ['230@0', '105@0', '405@0', '0@0']);

    const plugin = [cmd(357), cmd(657), cmd(657), cmd(230), cmd(0)];
    drag(plugin, [0], 4);
    assert.deepEqual(codes(plugin), ['230@0', '357@0', '657@0', '657@0', '0@0']);
});

test('a drop never splits a command from its own rows', () => {
    // Gaps inside the Show Text snap to the nearer side of it.
    const near = [cmd(230), cmd(101), cmd(401), cmd(401), cmd(401), cmd(0)];
    drag(near, [0], 2);
    assert.deepEqual(codes(near), ['230@0', '101@0', '401@0', '401@0', '401@0', '0@0'], 'snaps back before the text');

    const far = [cmd(230), cmd(101), cmd(401), cmd(401), cmd(401), cmd(0)];
    drag(far, [0], 4);
    assert.deepEqual(codes(far), ['101@0', '401@0', '401@0', '401@0', '230@0', '0@0']);

    // Between Show Choices and its first When there is no body: the drop goes into the branch.
    const choices = [cmd(230), cmd(102), cmd(402), cmd(121, 1), cmd(404), cmd(0)];
    drag(choices, [0], 2);
    assert.deepEqual(codes(choices), ['102@0', '402@0', '230@1', '121@1', '404@0', '0@0']);
});

test('choices and battle branches move with every branch', () => {
    const list = [
        cmd(102), cmd(402), cmd(121, 1), cmd(403), cmd(122, 1), cmd(404),
        cmd(301), cmd(601), cmd(230, 1), cmd(602), cmd(604), cmd(0)
    ];
    // Drag the battle (by its Escape marker) above the choices.
    assert.deepEqual(drag(list, [9], 0), { start: 0, count: 5 });
    assert.deepEqual(codes(list), [
        '301@0', '601@0', '230@1', '602@0', '604@0',
        '102@0', '402@0', '121@1', '403@0', '122@1', '404@0', '0@0'
    ]);
});

test('a selection of several commands moves together, in order', () => {
    const list = [cmd(121), cmd(122), cmd(230), cmd(111), cmd(123, 1), cmd(412), cmd(0)];
    // The Control Switches and the command inside the If, dropped at the end.
    assert.deepEqual(drag(list, [0, 4], 6), { start: 4, count: 2 });
    assert.deepEqual(codes(list), ['122@0', '230@0', '111@0', '412@0', '121@0', '123@0', '0@0']);
});

test('moved commands keep their identity', () => {
    const header = cmd(111);
    const list = [cmd(230), header, cmd(121, 1), cmd(412), cmd(0)];
    drag(list, [1], 0);
    assert.equal(list[0], header, 'folds and selections key on the command object');
});

test('planMove reports the indent and the row the drop lands before', () => {
    const list = [cmd(121), cmd(111), cmd(230, 1), cmd(412), cmd(0)];
    const into = EventCommandList.planMove(list, [0], 3);
    assert.equal(into.indent, 1);
    assert.equal(into.before, 3);
    const after = EventCommandList.planMove(list, [0], 4);
    assert.equal(after.indent, 0);
    assert.equal(after.before, 4);
    assert.equal(EventCommandList.planMove(list, [0], 1), null);
});

test('one undo step restores the order before a move, and redo replays it', () => {
    const header = cmd(111);
    const list = [cmd(230), header, cmd(121, 1), cmd(412), cmd(0)];
    EventCommandList.trackHistory(list);
    const before = JSON.stringify(list);

    drag(list, [1], 0);
    EventCommandList.trackHistory(list);
    const after = JSON.stringify(list);
    assert.notEqual(after, before);

    assert.equal(EventCommandList.undoList(list), true);
    assert.equal(JSON.stringify(list), before);
    assert.equal(list[1], header, 'undo restores the same command objects');
    assert.equal(EventCommandList.undoList(list), false, 'nothing further to undo');

    assert.equal(EventCommandList.redoList(list), true);
    assert.equal(JSON.stringify(list), after);
    assert.equal(EventCommandList.redoList(list), false);
});

test('history follows every change the list is shown with', () => {
    const list = [cmd(121), cmd(122), cmd(0)];
    EventCommandList.trackHistory(list);
    EventCommandList.trackHistory(list);
    assert.equal(EventCommandList.undoList(list), false, 'showing a list is not a change');

    EventCommandList.removeCommands(list, [0]);
    EventCommandList.trackHistory(list);
    list.splice(0, 0, cmd(230));
    EventCommandList.trackHistory(list);
    assert.deepEqual(codes(list), ['230@0', '122@0', '0@0']);

    EventCommandList.undoList(list);
    assert.deepEqual(codes(list), ['122@0', '0@0']);
    EventCommandList.undoList(list);
    assert.deepEqual(codes(list), ['121@0', '122@0', '0@0']);

    // A new change after an undo drops what could have been redone.
    list.splice(0, 1);
    EventCommandList.trackHistory(list);
    assert.equal(EventCommandList.redoList(list), false);
});

test('every command list offers the drag and the undo', () => {
    for (const file of ['src/event/EventCommandList.js', 'src/database/DatabaseCommonEventEditor.js',
        'src/database/DatabaseTroopEditor.js']) {
        const source = fs.readFileSync(path.join(editorRoot, file), 'utf8');
        assert.match(source, /enableDragReorder\(/, `${file} enables drag reordering`);
        assert.match(source, /trackHistory\(/, `${file} tracks list history`);
        assert.match(source, /historyKey\(/, `${file} answers Ctrl+Z`);
    }
});

test('the drop line and the dragged rows are styled from theme tokens', () => {
    const css = fs.readFileSync(path.join(editorRoot, 'css', 'styles.css'), 'utf8');
    const line = css.match(/\.command-drop-line\s*\{[^}]*\}/);
    assert.ok(line, 'drop line rule');
    assert.match(line[0], /var\(--color-accent/);
    assert.doesNotMatch(line[0], /#[0-9a-fA-F]{3,8}\b/);
    assert.match(css, /\.command-dragging\s*\{[^}]*opacity/);
});

test('a row that belongs to a command selects, deletes and edits as that command', () => {
    const list = [cmd(230), cmd(205), cmd(505), cmd(505), cmd(302), cmd(605), cmd(101), cmd(401), cmd(0)];
    assert.equal(EventCommandList.ownerIndex(list, 3), 1, 'a Move Route step');
    assert.equal(EventCommandList.ownerIndex(list, 5), 4, 'a shop line');
    assert.equal(EventCommandList.ownerIndex(list, 7), 6, 'a text line');
    assert.equal(EventCommandList.ownerIndex(list, 0), 0);
    assert.equal(EventCommandList.ownerIndex(list, 8), 8);
    // A row whose command is gone owns itself.
    assert.equal(EventCommandList.ownerIndex([cmd(230), cmd(505), cmd(0)], 1), 1);

    const helper = Object.create(EventCommandList.prototype);
    helper.selectedIndices = [3];
    assert.deepEqual(helper.expandSelection({ list }), [1, 2, 3]);
    helper.selectedIndices = [4];
    assert.deepEqual(helper.expandSelection({ list }), [4, 5]);
    assert.equal(helper._isIndexSelected({ list }, 5), true, 'the shop line shows as selected with its command');

    helper.refreshCommandList = () => {};
    helper.selectedIndices = [2];
    helper.deleteCommands({ list }, 0);
    assert.deepEqual(codes(list), ['230@0', '302@0', '605@0', '101@0', '401@0', '0@0']);
});

test('a drag starts only from a plain press on a command row', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'), 'utf8');
    const press = source.slice(source.indexOf('static _dragPress('), source.indexOf('static _dragPress(') + 1200);
    assert.match(press, /event\.button !== 0 \|\| event\.shiftKey \|\| event\.ctrlKey \|\| event\.metaKey/);
    assert.match(press, /pressedCommand\.code === 0\) return/, 'the End and body terminators are not draggable');
    assert.match(source, /Math\.hypot\(state\.x - startX, state\.y - startY\) < 5/, 'a click that wobbles is still a click');
});
