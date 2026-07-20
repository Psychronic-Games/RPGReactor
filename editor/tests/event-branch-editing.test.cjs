const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));
const ConditionalBranchEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'ConditionalBranchEditor.js'));
const LoopEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'LoopEditor.js'));
const ReactorEventCommandCodec = require(path.join(editorRoot, 'src', 'event', 'commands', 'ReactorEventCommandCodec.js'));

function cmd(code, indent, parameters = []) {
    return { code, indent, parameters };
}

function clone(list) {
    return JSON.parse(JSON.stringify(list));
}

/**
 * Build an EventCommandList whose sub-editors immediately hand back
 * `returnedCommands` (deep-cloned per call, like a real modal building fresh
 * objects). Captures the show() arguments for assertions.
 */
function makeList(returnedCommands) {
    const ecl = Object.create(EventCommandList.prototype);
    ecl.refreshCommandList = () => {};
    ecl.captured = {};
    const stub = {
        show: (command, callback, options) => {
            ecl.captured = { command, options };
            callback(clone(returnedCommands));
        }
    };
    ecl.choicesEditor = stub;
    ecl.conditionalBranchEditor = stub;
    return ecl;
}

test('structural marker selections expand to their complete command blocks', () => {
    const ecl = Object.create(EventCommandList.prototype);
    const conditional = { list: [
        cmd(111, 0), cmd(101, 1), cmd(411, 0), cmd(230, 1), cmd(412, 0), cmd(0, 0)
    ] };
    ecl.selectedIndices = [2];
    assert.deepEqual(ecl.expandSelection(conditional), [0, 1, 2, 3, 4]);
    ecl.selectedIndices = [4];
    assert.deepEqual(ecl.expandSelection(conditional), [0, 1, 2, 3, 4]);

    const loop = { list: [cmd(112, 0), cmd(230, 1), cmd(413, 0), cmd(0, 0)] };
    ecl.selectedIndices = [2];
    assert.deepEqual(ecl.expandSelection(loop), [0, 1, 2]);
});

test('battle-result marker selections expand through the matching end marker', () => {
    const ecl = Object.create(EventCommandList.prototype);
    const page = { list: [
        cmd(301, 0), cmd(601, 0), cmd(101, 1), cmd(602, 0), cmd(230, 1), cmd(604, 0), cmd(0, 0)
    ] };
    ecl.selectedIndices = [3];
    assert.deepEqual(ecl.expandSelection(page), [0, 1, 2, 3, 4, 5]);
});

test('scrolling-text continuation selection includes its parent and siblings', () => {
    const ecl = Object.create(EventCommandList.prototype);
    const page = { list: [cmd(105, 0), cmd(405, 0, ['One']), cmd(405, 0, ['Two']), cmd(0, 0)] };
    ecl.selectedIndices = [2];
    assert.deepEqual(ecl.expandSelection(page), [0, 1, 2]);
});

test('select all excludes the event-list terminator', () => {
    const ecl = Object.create(EventCommandList.prototype);
    ecl.selectAll({ list: [cmd(101, 0), cmd(401, 0), cmd(0, 0)] });
    assert.deepEqual(ecl.selectedIndices, [0, 1]);
});

test('command insertion indentation follows the destination branch body', () => {
    const list = [
        cmd(111, 0),
        cmd(101, 1),
        cmd(411, 0),
        cmd(230, 1),
        cmd(412, 0),
        cmd(0, 0)
    ];
    assert.equal(EventCommandList.insertionIndent(list, 1), 1, 'after If enters its body');
    assert.equal(EventCommandList.insertionIndent(list, 2), 1, 'before Else stays in the Then body');
    assert.equal(EventCommandList.insertionIndent(list, 3), 1, 'after Else enters its body');
    assert.equal(EventCommandList.insertionIndent(list, 4), 1, 'before End stays in the Else body');
    assert.equal(EventCommandList.insertionIndent(list, 5), 0, 'after End returns to the outer indent');

    const choices = [cmd(102, 0), cmd(402, 0), cmd(101, 1), cmd(404, 0), cmd(0, 0)];
    const choiceInsert = EventCommandList.safeInsertionIndex(choices, 1);
    assert.equal(choiceInsert, 2, 'insertion after a choice header moves inside the first branch');
    assert.equal(EventCommandList.insertionIndent(choices, choiceInsert), 1);

    const battle = [cmd(301, 0), cmd(601, 0), cmd(101, 1), cmd(604, 0), cmd(0, 0)];
    const battleInsert = EventCommandList.safeInsertionIndex(battle, 1);
    assert.equal(battleInsert, 2, 'insertion after a battle header moves inside the first result branch');
    assert.equal(EventCommandList.insertionIndent(battle, battleInsert), 1);
});

test('newCommand inserts inside the first choice and battle branches', () => {
    for (const [header, marker, end] of [[102, 402, 404], [301, 601, 604]]) {
        const page = { list: [cmd(header, 0), cmd(marker, 0), cmd(end, 0), cmd(0, 0)] };
        const ecl = Object.create(EventCommandList.prototype);
        ecl.selectedIndices = [0];
        ecl.commandPicker = { show: callback => callback({ code: 230 }) };
        ecl.waitEditor = { show: (_command, callback) => callback(cmd(230, 0, [30])) };
        ecl.refreshCommandList = () => {};

        ecl.newCommand(page, 0);

        assert.deepEqual(page.list, [
            cmd(header, 0), cmd(marker, 0), cmd(230, 1, [30]), cmd(end, 0), cmd(0, 0)
        ]);
        assert.deepEqual(ecl.selectedIndices, [2]);
    }
});

test('generated finite-loop selection owns its initializer on map pages', () => {
    const repeat = LoopEditor.build({
        mode: 'repeatCount', counterVariable: 4, count: { type: 'constant', value: 2 }
    }, [cmd(230, 1, [10])], 1);
    const range = LoopEditor.build({
        mode: 'variableRange', variableId: 5, start: { type: 'constant', value: 1 },
        end: { type: 'variable', id: 6 }, step: 1
    }, [cmd(113, 1)], 0);
    const page = { list: [cmd(121, 0, [1, 1, 0]), ...repeat, ...range, cmd(0, 0)] };
    const ecl = Object.create(EventCommandList.prototype);

    ecl.selectedIndices = [3]; // Generated guard inside Repeat Count.
    assert.deepEqual(ecl.expandSelection(page), repeat.map((_command, i) => i + 1));
    ecl.selectedIndices = [6]; // User-authored Wait inside Repeat Count.
    assert.deepEqual(ecl.expandSelection(page), [6]);

    const rangeStart = 1 + repeat.length;
    ecl.selectedIndices = [rangeStart]; // Generated initializer itself.
    assert.deepEqual(ecl.expandSelection(page), range.map((_command, i) => i + rangeStart));
});

test('shared expansion owns strict generated initializers but not ordinary Control Variables', () => {
    global.EventCommandList = EventCommandList;
    global.CommonEventEditor = class {};
    global.document = global.document || { getElementById: () => null };
    const DatabaseCommonEventEditor = require(path.join(
        editorRoot, 'src', 'database', 'DatabaseCommonEventEditor.js'));
    const shared = Object.create(DatabaseCommonEventEditor.prototype);

    const generated = LoopEditor.build({
        mode: 'variableRange', variableId: 8, start: { type: 'constant', value: 0 },
        end: { type: 'constant', value: 3 }, step: 1
    }, [cmd(230, 1, [5])], 0);
    const event = { list: [...generated, cmd(0, 0)] };
    assert.deepEqual(shared.expandToBlocks([generated.length - 2], event),
        generated.map((_command, i) => i));

    const ordinary = cmd(122, 0, [9, 9, 0, 0, 99, 0, 0]);
    const forever = LoopEditor.build({ mode: 'forever' }, [cmd(230, 1, [5])], 0);
    const ordinaryEvent = { list: [ordinary, ...forever, cmd(0, 0)] };
    assert.deepEqual(shared.expandToBlocks([1], ordinaryEvent), [1, 2, 3]);
});

test('editing a generated loop replaces its initializer and complete block', () => {
    const config = { mode: 'repeatCount', counterVariable: 9,
        count: { type: 'constant', value: 3 } };
    const generated = LoopEditor.build(config, [cmd(230, 1, [10])], 1);
    const page = { list: [cmd(111, 0, [0, 1, 0]), ...generated, cmd(412, 0), cmd(0, 0)] };
    const ecl = Object.create(EventCommandList.prototype);
    ecl.selectedIndices = [];
    ecl.refreshCommandList = () => {};
    ecl.loopEditor = {
        show(block, callback) {
            const parsed = LoopEditor.parse(block);
            assert.equal(parsed.generated, true);
            callback(LoopEditor.build({ mode: 'forever' }, parsed.body, parsed.indent));
        }
    };

    ecl.editCommand(2, page, 0);

    assert.deepEqual(page.list, [
        cmd(111, 0, [0, 1, 0]),
        cmd(112, 1),
        cmd(230, 2, [10]),
        cmd(413, 1),
        cmd(412, 0),
        cmd(0, 0)
    ]);
});

test('generated script commands reopen their structured map editors and keep indent', () => {
    const pictureData = {
        operation: 'show', pictureId: { source: 'direct', value: 1 }, name: '', origin: 0,
        position: { source: 'direct', x: 0, y: 0 }, scaleX: 100, scaleY: 100,
        opacity: 255, blend: 0, angle: null, anchor: null, wave: null
    };
    const picture = ReactorEventCommandCodec.createScriptCommand(
        'picture', pictureData, ReactorEventCommandCodec.createPictureBody(pictureData));
    picture.indent = 2;
    const page = { list: [picture, cmd(0, 0)] };
    const ecl = Object.create(EventCommandList.prototype);
    ecl.refreshCommandList = () => {};
    ecl.showPictureEditor = { show: (_command, callback) => callback(cmd(231, 0, [1, '', 0, 0, 0, 0, 100, 100, 255, 0])) };
    ecl.movePictureEditor = { show() { throw new Error('wrong editor'); } };
    ecl.erasePictureEditor = { show() { throw new Error('wrong editor'); } };

    ecl.editCommand(0, page, 0);

    assert.equal(page.list[0].code, 231);
    assert.equal(page.list[0].indent, 2);
});

test('ordinary and multi-command edits preserve a nested header indent', () => {
    const waitPage = { list: [cmd(111, 0), cmd(230, 2, [10]), cmd(412, 0), cmd(0, 0)] };
    const waitList = Object.create(EventCommandList.prototype);
    waitList.refreshCommandList = () => {};
    waitList.waitEditor = { show: (_command, callback) => callback(cmd(230, 0, [90])) };
    waitList.editCommand(1, waitPage, 0);
    assert.deepEqual(waitPage.list[1], cmd(230, 2, [90]));

    const messagePage = { list: [cmd(111, 0), cmd(101, 2), cmd(401, 2, ['Old']), cmd(412, 0), cmd(0, 0)] };
    const messageList = Object.create(EventCommandList.prototype);
    messageList.refreshCommandList = () => {};
    messageList.messageEditor = {
        show: (_message, callback) => callback([cmd(101, 0), cmd(401, 0, ['New'])])
    };
    messageList.editCommand(1, messagePage, 0);
    assert.deepEqual(messagePage.list.slice(1, 3), [cmd(101, 2), cmd(401, 2, ['New'])]);
});

test('generated event calls keep indent in Common Event and Troop hosts', () => {
    const CommonEventCommandEditor = require(path.join(
        editorRoot, 'src', 'event', 'commands', 'CommonEventEditor.js'));
    const sourceEditor = new CommonEventCommandEditor(null, null);
    sourceEditor.designation = 'variable';
    sourceEditor.commonEventVariableId = 4;
    const call = sourceEditor.buildCommand();
    call.indent = 2;

    global.CommonEventEditor = CommonEventCommandEditor;
    global.document = global.document || { getElementById: () => null };
    const DatabaseCommonEventEditor = require(path.join(
        editorRoot, 'src', 'database', 'DatabaseCommonEventEditor.js'));
    const common = Object.create(DatabaseCommonEventEditor.prototype);
    common.persistEvent = () => {};
    common.getEditor = () => ({ show: (_command, callback) => callback(cmd(117, 0, [7])) });
    const event = { list: [clone(call), cmd(0, 0)] };
    common.editCommand(0, event);
    assert.deepEqual(event.list[0], cmd(117, 2, [7]));

    const DatabaseTroopEditor = require(path.join(
        editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'));
    const troop = Object.create(DatabaseTroopEditor.prototype);
    troop.databaseManager = {};
    troop.projectManager = {};
    troop._editors = { commonEvent: {
        show: (_command, callback) => callback(cmd(117, 0, [8]))
    } };
    troop.persistTroop = () => {};
    const page = { list: [clone(call), cmd(0, 0)] };
    troop.editCommandSimple(page.list[0], 0, page);
    assert.deepEqual(page.list[0], cmd(117, 2, [8]));
});

test('editing an If that contains a nested If keeps the whole structure', () => {
    const page = { list: [
        cmd(111, 0, [0, 1, 0]),   // outer If
        cmd(101, 1, ['', 0, 0, 2]),
        cmd(111, 1, [0, 2, 0]),   // nested If
        cmd(205, 2, [-1, {}]),
        cmd(411, 1),              // nested Else
        cmd(230, 2, [60]),
        cmd(412, 1),              // nested End
        cmd(411, 0),              // outer Else
        cmd(250, 1, [{}]),
        cmd(412, 0),              // outer End
        cmd(0, 0)
    ] };

    const edited = [cmd(111, 0, [0, 7, 0]), cmd(411, 0), cmd(412, 0)];
    const ecl = makeList(edited);
    ecl.editCommand(0, page, 0);

    assert.deepEqual(page.list, [
        cmd(111, 0, [0, 7, 0]),
        cmd(101, 1, ['', 0, 0, 2]),
        cmd(111, 1, [0, 2, 0]),
        cmd(205, 2, [-1, {}]),
        cmd(411, 1),
        cmd(230, 2, [60]),
        cmd(412, 1),
        cmd(411, 0),
        cmd(250, 1, [{}]),
        cmd(412, 0),
        cmd(0, 0)
    ]);
});

test('editing an If without changes round-trips byte-identically', () => {
    const page = { list: [
        cmd(111, 0, [0, 1, 0]),
        cmd(111, 1, [0, 2, 0]),
        cmd(101, 2, ['', 0, 0, 2]),
        cmd(412, 1),
        cmd(411, 0),
        cmd(412, 0),
        cmd(0, 0)
    ] };
    const before = clone(page.list);

    const ecl = makeList([cmd(111, 0, [0, 1, 0]), cmd(411, 0), cmd(412, 0)]);
    ecl.editCommand(0, page, 0);

    assert.deepEqual(page.list, before);
});

test('editing an If without an Else reports hasElse=false and round-trips', () => {
    const page = { list: [
        cmd(111, 0, [0, 1, 0]),
        cmd(101, 1, ['', 0, 0, 2]),
        cmd(412, 0),
        cmd(0, 0)
    ] };
    const before = clone(page.list);

    // The editor mirrors hasElse=false, so it returns no 411.
    const ecl = makeList([cmd(111, 0, [0, 1, 0]), cmd(412, 0)]);
    ecl.editCommand(0, page, 0);

    assert.equal(ecl.captured.options.hasElse, false);
    assert.deepEqual(page.list, before);
});

test('an empty Then body does not swallow the Else body', () => {
    const page = { list: [
        cmd(111, 0, [0, 1, 0]),
        cmd(411, 0),
        cmd(101, 1, ['', 0, 0, 2]),
        cmd(412, 0),
        cmd(0, 0)
    ] };
    const before = clone(page.list);

    const ecl = makeList([cmd(111, 0, [0, 1, 0]), cmd(411, 0), cmd(412, 0)]);
    ecl.editCommand(0, page, 0);

    assert.equal(ecl.captured.options.hasElse, true);
    assert.deepEqual(page.list, before);
});

test('editing a nested If keeps its indent and stays inside the outer structure', () => {
    const page = { list: [
        cmd(111, 0, [0, 1, 0]),
        cmd(111, 1, [0, 2, 0]),   // nested If being edited
        cmd(101, 2, ['', 0, 0, 2]),
        cmd(412, 1),
        cmd(411, 0),
        cmd(412, 0),
        cmd(0, 0)
    ] };

    // The modal always builds at indent 0; editCommand must rebase to 1.
    const edited = [cmd(111, 0, [0, 9, 0]), cmd(412, 0)];
    const ecl = makeList(edited);
    ecl.editCommand(1, page, 0);

    assert.deepEqual(page.list, [
        cmd(111, 0, [0, 1, 0]),
        cmd(111, 1, [0, 9, 0]),
        cmd(101, 2, ['', 0, 0, 2]),
        cmd(412, 1),
        cmd(411, 0),
        cmd(412, 0),
        cmd(0, 0)
    ]);
});

test('a truncated If (missing 412) is repaired without eating the terminator', () => {
    const page = { list: [
        cmd(111, 0, [0, 1, 0]),
        cmd(101, 1, ['', 0, 0, 2]),
        cmd(0, 0)
    ] };

    const ecl = makeList([cmd(111, 0, [0, 1, 0]), cmd(412, 0)]);
    ecl.editCommand(0, page, 0);

    assert.deepEqual(page.list, [
        cmd(111, 0, [0, 1, 0]),
        cmd(101, 1, ['', 0, 0, 2]),
        cmd(412, 0),
        cmd(0, 0)
    ]);
});

test('editing Show Choices that contains nested choices keeps both structures', () => {
    const page = { list: [
        cmd(102, 0, [['A', 'B'], 1, 0, 2, 0]),
        cmd(402, 0, [0]),
        cmd(102, 1, [['X', 'Y'], 1, 0, 2, 0]),  // nested choices
        cmd(402, 1, [0]),
        cmd(101, 2, ['', 0, 0, 2]),
        cmd(402, 1, [1]),
        cmd(404, 1),
        cmd(402, 0, [1]),
        cmd(205, 1, [-1, {}]),
        cmd(404, 0),
        cmd(0, 0)
    ] };

    const edited = [
        cmd(102, 0, [['A2', 'B2'], 1, 0, 2, 0]),
        cmd(402, 0, [0]),
        cmd(402, 0, [1]),
        cmd(404, 0)
    ];
    const ecl = makeList(edited);
    ecl.editCommand(0, page, 0);

    assert.deepEqual(page.list, [
        cmd(102, 0, [['A2', 'B2'], 1, 0, 2, 0]),
        cmd(402, 0, [0]),
        cmd(102, 1, [['X', 'Y'], 1, 0, 2, 0]),
        cmd(402, 1, [0]),
        cmd(101, 2, ['', 0, 0, 2]),
        cmd(402, 1, [1]),
        cmd(404, 1),
        cmd(402, 0, [1]),
        cmd(205, 1, [-1, {}]),
        cmd(404, 0),
        cmd(0, 0)
    ]);
});

test('an empty first choice branch does not shift later bodies up', () => {
    const page = { list: [
        cmd(102, 0, [['A', 'B'], 1, 0, 2, 0]),
        cmd(402, 0, [0]),
        cmd(402, 0, [1]),
        cmd(101, 1, ['', 0, 0, 2]),
        cmd(404, 0),
        cmd(0, 0)
    ] };
    const before = clone(page.list);

    const ecl = makeList([
        cmd(102, 0, [['A', 'B'], 1, 0, 2, 0]),
        cmd(402, 0, [0]),
        cmd(402, 0, [1]),
        cmd(404, 0)
    ]);
    ecl.editCommand(0, page, 0);

    assert.deepEqual(page.list, before);
});

test('the cancel branch body stays bound to the 403 marker when choices are added', () => {
    const page = { list: [
        cmd(102, 0, [['A', 'B'], -1, 0, 2, 0]),
        cmd(402, 0, [0]),
        cmd(101, 1, ['', 0, 0, 2]),
        cmd(402, 0, [1]),
        cmd(403, 0),
        cmd(250, 1, [{}]),
        cmd(404, 0),
        cmd(0, 0)
    ] };

    const edited = [
        cmd(102, 0, [['A', 'B', 'C'], -1, 0, 2, 0]),
        cmd(402, 0, [0]),
        cmd(402, 0, [1]),
        cmd(402, 0, [2]),
        cmd(403, 0),
        cmd(404, 0)
    ];
    const ecl = makeList(edited);
    ecl.editCommand(0, page, 0);

    assert.deepEqual(page.list, [
        cmd(102, 0, [['A', 'B', 'C'], -1, 0, 2, 0]),
        cmd(402, 0, [0]),
        cmd(101, 1, ['', 0, 0, 2]),
        cmd(402, 0, [1]),
        cmd(402, 0, [2]),
        cmd(403, 0),
        cmd(250, 1, [{}]),
        cmd(404, 0),
        cmd(0, 0)
    ]);
});

test('editing nested choices keeps their indent inside the outer branch', () => {
    const page = { list: [
        cmd(102, 0, [['A', 'B'], 1, 0, 2, 0]),
        cmd(402, 0, [0]),
        cmd(102, 1, [['X', 'Y'], 1, 0, 2, 0]),
        cmd(402, 1, [0]),
        cmd(101, 2, ['', 0, 0, 2]),
        cmd(402, 1, [1]),
        cmd(404, 1),
        cmd(402, 0, [1]),
        cmd(404, 0),
        cmd(0, 0)
    ] };

    const edited = [
        cmd(102, 0, [['X2', 'Y2'], 1, 0, 2, 0]),
        cmd(402, 0, [0]),
        cmd(402, 0, [1]),
        cmd(404, 0)
    ];
    const ecl = makeList(edited);
    ecl.editCommand(2, page, 0);

    assert.deepEqual(page.list, [
        cmd(102, 0, [['A', 'B'], 1, 0, 2, 0]),
        cmd(402, 0, [0]),
        cmd(102, 1, [['X2', 'Y2'], 1, 0, 2, 0]),
        cmd(402, 1, [0]),
        cmd(101, 2, ['', 0, 0, 2]),
        cmd(402, 1, [1]),
        cmd(404, 1),
        cmd(402, 0, [1]),
        cmd(404, 0),
        cmd(0, 0)
    ]);
});

test('expandSelection covers the whole outer choice structure past nested 404s', () => {
    const ecl = Object.create(EventCommandList.prototype);
    const page = { list: [
        cmd(102, 0, [['A', 'B'], 1, 0, 2, 0]),
        cmd(402, 0, [0]),
        cmd(102, 1, [['X', 'Y'], 1, 0, 2, 0]),
        cmd(402, 1, [0]),
        cmd(101, 2, ['', 0, 0, 2]),
        cmd(402, 1, [1]),
        cmd(404, 1),
        cmd(402, 0, [1]),
        cmd(205, 1, [-1, {}]),
        cmd(404, 0),
        cmd(0, 0)
    ] };

    ecl.selectedIndices = [0];
    assert.deepEqual(ecl.expandSelection(page), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // A nested marker expands to the nested structure only.
    ecl.selectedIndices = [3];
    assert.deepEqual(ecl.expandSelection(page), [2, 3, 4, 5, 6]);

    // An outer marker expands to the outer structure.
    ecl.selectedIndices = [7];
    assert.deepEqual(ecl.expandSelection(page), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('common-event editor: nested If round-trips through the shared parser', () => {
    // The common-event editor resolves sub-editor classes and the DOM at
    // call time; give it just enough of both to run headless.
    global.ShowChoicesCommandEditor = class {};
    global.ConditionalBranchEditor = class {};
    global.document = global.document || { getElementById: () => null };
    const DatabaseCommonEventEditor = require(path.join(
        editorRoot, 'src', 'database', 'DatabaseCommonEventEditor.js'));

    const event = { list: [
        cmd(111, 0, [0, 1, 0]),
        cmd(111, 1, [0, 2, 0]),
        cmd(101, 2, ['', 0, 0, 2]),
        cmd(411, 1),
        cmd(230, 2, [30]),
        cmd(412, 1),
        cmd(411, 0),
        cmd(250, 1, [{}]),
        cmd(412, 0),
        cmd(0, 0)
    ] };
    const before = clone(event.list);

    const dbEditor = Object.create(DatabaseCommonEventEditor.prototype);
    dbEditor.persistEvent = () => {};
    let capturedOptions = null;
    dbEditor.getEditor = () => ({
        show: (command, callback, options) => {
            capturedOptions = options;
            callback([cmd(111, 0, [0, 1, 0]), cmd(411, 0), cmd(412, 0)]);
        }
    });

    dbEditor.editCommand(0, event);

    assert.equal(capturedOptions.hasElse, true);
    assert.deepEqual(event.list, before);
});

test('common-event editor: nested choices keep their bodies per branch', () => {
    global.ShowChoicesCommandEditor = class {};
    global.ConditionalBranchEditor = class {};
    global.document = global.document || { getElementById: () => null };
    const DatabaseCommonEventEditor = require(path.join(
        editorRoot, 'src', 'database', 'DatabaseCommonEventEditor.js'));

    const event = { list: [
        cmd(102, 0, [['A', 'B'], 1, 0, 2, 0]),
        cmd(402, 0, [0]),
        cmd(102, 1, [['X', 'Y'], 1, 0, 2, 0]),
        cmd(402, 1, [0]),
        cmd(101, 2, ['', 0, 0, 2]),
        cmd(402, 1, [1]),
        cmd(404, 1),
        cmd(402, 0, [1]),
        cmd(205, 1, [-1, {}]),
        cmd(404, 0),
        cmd(0, 0)
    ] };
    const before = clone(event.list);

    const dbEditor = Object.create(DatabaseCommonEventEditor.prototype);
    dbEditor.persistEvent = () => {};
    dbEditor.getEditor = () => ({
        show: (command, callback) => {
            callback([
                cmd(102, 0, [['A', 'B'], 1, 0, 2, 0]),
                cmd(402, 0, [0]),
                cmd(402, 0, [1]),
                cmd(404, 0)
            ]);
        }
    });

    dbEditor.editCommand(0, event);

    assert.deepEqual(event.list, before);
});

test('common-event multi-command edits preserve nested indentation', () => {
    global.EventCommandList = EventCommandList;
    global.MessageCommandEditor = class {};
    global.document = global.document || { getElementById: () => null };
    const DatabaseCommonEventEditor = require(path.join(
        editorRoot, 'src', 'database', 'DatabaseCommonEventEditor.js'));
    const event = { list: [
        cmd(111, 0), cmd(101, 2), cmd(401, 2, ['Old']), cmd(412, 0), cmd(0, 0)
    ] };
    const editor = Object.create(DatabaseCommonEventEditor.prototype);
    editor.persistEvent = () => {};
    editor.getEditor = () => ({
        show: (_message, callback) => callback([cmd(101, 0), cmd(401, 0, ['New'])])
    });

    editor.editCommand(1, event);

    assert.deepEqual(event.list.slice(1, 3), [cmd(101, 2), cmd(401, 2, ['New'])]);
});

test('common-event audio and default insertion use the shared safe insertion path', () => {
    const DatabaseCommonEventEditor = require(path.join(
        editorRoot, 'src', 'database', 'DatabaseCommonEventEditor.js'));
    const source = DatabaseCommonEventEditor.prototype.insertNewCommand.toString();
    assert.match(source, /safeInsertionIndex\(event\.list, insertBeforeIndex\)/);
    assert.match(source, /editor\.show\(null, code,[\s\S]*?insertAndRefresh\(\[editedCommand\]\)/);
    assert.match(source, /const cmds = this\.buildCommandStructure\(code\);\s*insertAndRefresh\(cmds\)/);
});

test('ConditionalBranchEditor emits the Else marker only when createElse is set', () => {
    const editor = new ConditionalBranchEditor(null, null);
    editor.conditionType = 0;
    editor.switchId = 3;
    editor.switchValue = 0;

    editor.createElse = true;
    assert.deepEqual(editor.buildCommands().map(c => c.code), [111, 411, 412]);

    editor.createElse = false;
    assert.deepEqual(editor.buildCommands().map(c => c.code), [111, 412]);
});

const mzConditionArrays = [
    ['Switch', [0, 7, 1]],
    ['Variable constant', [1, 8, 0, -12, 5]],
    ['Variable RHS', [1, 8, 1, 9, 2]],
    ['Self Switch', [2, 'D', 1]],
    ['Timer', [3, 125, 1]],
    ['Actor in party', [4, 3, 0]],
    ['Actor name', [4, 3, 1, 'Reid']],
    ['Actor class', [4, 3, 2, 4]],
    ['Actor skill', [4, 3, 3, 5]],
    ['Actor weapon', [4, 3, 4, 6]],
    ['Actor armor', [4, 3, 5, 7]],
    ['Actor state', [4, 3, 6, 8]],
    ['Enemy appeared', [5, 0, 0]],
    ['Enemy state', [5, 4, 1, 9]],
    ['Character direction', [6, 12, 8]],
    ['Gold', [7, 1234, 2]],
    ['Item', [8, 11]],
    ['Weapon inventory only', [9, 12, false]],
    ['Weapon including equipped', [9, 12, true]],
    ['Armor inventory only', [10, 13, false]],
    ['Armor including equipped', [10, 13, true]],
    ['Legacy Button without mode', [11, 'ok']],
    ['Button pressed', [11, 'cancel', 0]],
    ['Button triggered', [11, 'shift', 1]],
    ['Button repeated', [11, 'pagedown', 2]],
    ['Script', [12, '$gameParty.size() > 2']],
    ['Vehicle boat', [13, 0]],
    ['Vehicle ship', [13, 1]],
    ['Vehicle airship', [13, 2]]
];

for (const [name, parameters] of mzConditionArrays) {
    test(`ConditionalBranchEditor exactly round-trips ${name}`, () => {
        const editor = new ConditionalBranchEditor(null, null);
        editor.parseCommand(cmd(111, 0, parameters));
        editor.createElse = false;
        assert.deepEqual(editor.buildCommands()[0].parameters, parameters);
    });
}

test('ConditionalBranchEditor serializes newly configured MZ conditions canonically', () => {
    const paths = [
        [editor => Object.assign(editor, { conditionType: 3, timerSeconds: 90, timerComparison: 0 }), [3, 90, 0]],
        [editor => Object.assign(editor, { conditionType: 4, actorId: 2, actorCondition: 0 }), [4, 2, 0]],
        [editor => Object.assign(editor, { conditionType: 4, actorId: 2, actorCondition: 3, actorValue: 17 }), [4, 2, 3, 17]],
        [editor => Object.assign(editor, { conditionType: 5, enemyIndex: 3, enemyCondition: 0 }), [5, 3, 0]],
        [editor => Object.assign(editor, { conditionType: 5, enemyIndex: 3, enemyCondition: 1, enemyStateId: 6 }), [5, 3, 1, 6]],
        [editor => Object.assign(editor, { conditionType: 6, characterId: -1, characterDirection: 4 }), [6, -1, 4]],
        [editor => Object.assign(editor, { conditionType: 9, itemId: 5, includeEquipped: true }), [9, 5, true]],
        [editor => Object.assign(editor, { conditionType: 10, itemId: 8, includeEquipped: false }), [10, 8, false]],
        [editor => Object.assign(editor, { conditionType: 11, buttonName: 'pageup', buttonMode: 2 }), [11, 'pageup', 2]],
        [editor => Object.assign(editor, { conditionType: 13, vehicleType: 2 }), [13, 2]]
    ];

    for (const [configure, expected] of paths) {
        const editor = new ConditionalBranchEditor(null, null);
        editor.resetToDefaults();
        editor.createElse = false;
        configure(editor);
        const parameters = editor.buildCommands()[0].parameters;
        assert.deepEqual(parameters, expected);
        assert.notDeepEqual(parameters, []);
    }
});

test('editing a legacy Button mode emits MZ mode without losing the button', () => {
    const editor = new ConditionalBranchEditor(null, null);
    editor.parseCommand(cmd(111, 0, [11, 'ok']));
    assert.equal(editor.buttonMode, 0);
    editor.buttonMode = 1;
    assert.deepEqual(editor.buildCommands()[0].parameters, [11, 'ok', 1]);
});

test('ConditionalBranchEditor never emits empty parameters for a known condition', () => {
    const editor = new ConditionalBranchEditor(null, null);
    editor.parseCommand(cmd(111, 0, []));
    assert.deepEqual(editor.buildCommands()[0].parameters, [0, 1, 0]);
});

function makeSummaryList() {
    const records = {
        actors: { 2: { id: 2, name: 'Reid' } },
        classes: { 3: { id: 3, name: 'Warrior' } },
        skills: { 4: { id: 4, name: 'Heal' } },
        weapons: { 5: { id: 5, name: 'Sword' } },
        armors: { 6: { id: 6, name: 'Shield' } },
        states: { 7: { id: 7, name: 'Poison' } },
        items: { 8: { id: 8, name: 'Potion' } }
    };
    const databaseManager = {
        getSystem: () => ({ switches: [], variables: [] }),
        getActor: id => records.actors[id] || null,
        getClass: id => records.classes[id] || null,
        getSkill: id => records.skills[id] || null,
        getWeapon: id => records.weapons[id] || null,
        getArmor: id => records.armors[id] || null,
        getState: id => records.states[id] || null,
        getItem: id => records.items[id] || null
    };
    const list = Object.create(EventCommandList.prototype);
    list.eventEditor = {
        databaseManager,
        projectController: { eventManager: { currentMap: { events: [null, { id: 1, name: 'Gate' }] } } }
    };
    return list;
}

test('Conditional Branch summaries cover variable RHS and MZ types through Vehicle', () => {
    const list = makeSummaryList();
    const summary = parameters => list.getCommandInfo(cmd(111, 0, parameters), null, 0).description;

    assert.match(summary([1, 1, 1, 2, 0]), /V\[0002\]/);
    assert.match(summary([3, 90, 0]), /Timer >= 1:30/);
    assert.match(summary([4, 2, 2, 3]), /Reid.*Class.*Warrior/);
    assert.match(summary([5, 0, 1, 7]), /Enemy #1.*Poison/);
    assert.match(summary([6, 1, 8]), /Event 001: Gate.*Up/);
    assert.match(summary([8, 8]), /Potion/);
    assert.match(summary([9, 5, true]), /Sword.*Include Equipped/);
    assert.match(summary([11, 'pageup', 1]), /Page Up.*Triggered/);
    assert.match(summary([13, 2]), /Vehicle.*Airship/);
});
