const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const commandsRoot = path.join(workspaceRoot, 'editor', 'src', 'event', 'commands');
const ReactorEventCommandCodec = require(path.join(commandsRoot, 'ReactorEventCommandCodec.js'));
const CommonEventEditor = require(path.join(commandsRoot, 'CommonEventEditor.js'));
const ConditionalBranchEditor = require(path.join(commandsRoot, 'ConditionalBranchEditor.js'));

function runScript(body, environment) {
    const fn = new Function('$gameVariables', '$dataCommonEvents', '$dataMap', body);
    fn.call(environment.interpreter, environment.variables, environment.commonEvents, environment.map);
}

test('common-event calls keep direct commands stock and tag variable/page scripts', () => {
    const editor = new CommonEventEditor(null, null);
    editor.commonEventId = 19;
    assert.deepEqual(editor.buildCommand(), { code: 117, indent: 0, parameters: [19] });

    editor.designation = 'variable';
    editor.commonEventVariableId = 7;
    const commonCommand = editor.buildCommand();
    assert.deepEqual(Object.keys(commonCommand), ['code', 'indent', 'parameters']);
    assert.equal(commonCommand.code, 355);
    assert.equal(commonCommand.parameters.length, 1);
    const commonTag = ReactorEventCommandCodec.parseCommand(commonCommand, 'eventCall');
    assert.deepEqual(commonTag.data, {
        target: 'commonEvent', designation: 'variable', variableId: 7
    });
    assert.match(commonTag.body, /setupChild\(commonEvent\.list, this\._eventId \|\| 0\)/);

    const commonList = [{ code: 101 }];
    const calls = [];
    const environment = {
        variables: { value: id => id === 7 ? 2 : 0 },
        commonEvents: [null, null, { list: commonList }],
        map: null,
        interpreter: { _eventId: 11, setupChild: (list, eventId) => calls.push([list, eventId]) }
    };
    runScript(commonTag.body, environment);
    assert.deepEqual(calls, [[commonList, 11]]);
    environment.variables.value = () => 999;
    runScript(commonTag.body, environment);
    assert.equal(calls.length, 1, 'an invalid common event ID is a no-op');

    editor.targetType = 'mapEventPage';
    editor.designation = 'direct';
    editor.mapEventId = 3;
    editor.mapPageNumber = 2;
    const mapCommand = editor.buildCommand();
    const mapTag = ReactorEventCommandCodec.parseCommand(mapCommand, 'eventCall');
    assert.deepEqual(mapTag.data, {
        target: 'mapEventPage', designation: 'direct', eventId: 3, pageNumber: 2
    });
    assert.match(mapTag.body, /pages\[pageNumber - 1\]/);

    const pageList = [{ code: 230 }];
    environment.map = { events: [null, null, null, { pages: [{ list: [] }, { list: pageList }] }] };
    runScript(mapTag.body, environment);
    assert.deepEqual(calls.at(-1), [pageList, 3]);

    editor.designation = 'variable';
    editor.mapEventVariableId = 8;
    editor.mapPageVariableId = 9;
    const variableMapCommand = editor.buildCommand();
    const variableMapTag = ReactorEventCommandCodec.parseCommand(variableMapCommand, 'eventCall');
    assert.deepEqual(variableMapTag.data, {
        target: 'mapEventPage', designation: 'variable',
        eventVariableId: 8, pageVariableId: 9
    });
    environment.variables.value = id => id === 8 ? 3 : 2;
    runScript(variableMapTag.body, environment);
    assert.deepEqual(calls.at(-1), [pageList, 3]);
    const callCount = calls.length;
    environment.variables.value = id => id === 8 ? 0 : 99;
    runScript(variableMapTag.body, environment);
    assert.equal(calls.length, callCount, 'invalid event/page IDs are a no-op');
});

test('event-call tags reopen and retain unavailable direct selections', () => {
    const source = new CommonEventEditor(null, null);
    source.targetType = 'mapEventPage';
    source.designation = 'direct';
    source.mapEventId = 88;
    source.mapPageNumber = 12;
    const command = source.buildCommand();

    const reopened = new CommonEventEditor({ data: { commonEvents: [] } }, {
        tilemapManager: { currentMap: { events: [] } }
    });
    assert.equal(reopened.parseCommand(command), true);
    assert.equal(reopened.targetType, 'mapEventPage');
    assert.equal(reopened.mapEventId, 88);
    assert.equal(reopened.mapPageNumber, 12);
    assert.deepEqual(reopened.buildCommand(), command);

    const invalid = ReactorEventCommandCodec.createScriptCommand('eventCall', {
        target: 'mapEventPage', designation: 'direct', eventId: 0, pageNumber: 1
    }, 'false;');
    const fallback = new CommonEventEditor(null, null);
    assert.equal(fallback.parseCommand(invalid), false);
    assert.equal(fallback.targetType, 'commonEvent');

    const altered = JSON.parse(JSON.stringify(command));
    altered.parameters[0] = altered.parameters[0].replace(/setupChild/, 'setupChildChanged');
    assert.equal(fallback.parseCommand(altered), false, 'altered generated code is not claimed by the visual editor');
});

test('advanced input conditions emit stock Script arrays and reopen valid tags', () => {
    const cases = [
        [{ conditionType: 14, extendedButtonName: 'pageup', extendedButtonMode: 'released' },
            { type: 'keyboard', button: 'pageup', mode: 'released' }, /Input\.isReleased/],
        [{ conditionType: 14, extendedButtonName: 'ok', extendedButtonMode: 'held' },
            { type: 'keyboard', button: 'ok', mode: 'held' }, /Input\.isLongPressed/],
        [{ conditionType: 15, mouseButton: 2, mouseButtonMode: 'triggered' },
            { type: 'mouse', button: 2, mode: 'triggered' }, /TouchInput\.isCancelled/],
        [{ conditionType: 15, mouseButton: 0, mouseButtonMode: 'pressed' },
            { type: 'mouse', button: 0, mode: 'pressed' }, /TouchInput\.isPressed/],
        [{ conditionType: 15, mouseButton: 1, mouseButtonMode: 'released' },
            { type: 'mouse', button: 1, mode: 'released' }, /isMouseButtonReleased\(1\)/],
        [{ conditionType: 15, mouseButton: 1, mouseButtonMode: 'held' },
            { type: 'mouse', button: 1, mode: 'held' }, /isMouseButtonLongPressed\(1\)/],
        [{ conditionType: 16, wheelDirection: 'up' },
            { type: 'wheel', direction: 'up' }, /wheelY < 0/],
        [{ conditionType: 16, wheelDirection: 'down' },
            { type: 'wheel', direction: 'down' }, /wheelY > 0/],
        [{ conditionType: 16, wheelDirection: 'left' },
            { type: 'wheel', direction: 'left' }, /wheelX < 0/],
        [{ conditionType: 16, wheelDirection: 'right' },
            { type: 'wheel', direction: 'right' }, /wheelX > 0/],
        [{ conditionType: 17, pointerAxis: 'x', pointerComparison: '!=',
            pointerValueType: 'constant', pointerValue: 320 },
        { type: 'pointer', axis: 'x', comparison: '!=', valueType: 'constant', value: 320 },
        /TouchInput\.x != 320/],
        [{ conditionType: 17, pointerAxis: 'y', pointerComparison: '>=',
            pointerValueType: 'variable', pointerValue: 6 },
        { type: 'pointer', axis: 'y', comparison: '>=', valueType: 'variable', value: 6 },
        /TouchInput\.y >= \$gameVariables\.value\(6\)/]
    ];

    for (const [state, expectedData, bodyPattern] of cases) {
        const editor = new ConditionalBranchEditor(null, null);
        Object.assign(editor, state);
        editor.createElse = false;
        const command = editor.buildCommands()[0];
        assert.equal(command.code, 111);
        assert.equal(command.parameters[0], 12);
        assert.equal(command.parameters.length, 2);
        const parsed = ReactorEventCommandCodec.parseCommand(command, 'inputCondition');
        assert.deepEqual(parsed.data, expectedData);
        assert.match(parsed.body, bodyPattern);

        const reopened = new ConditionalBranchEditor(null, null);
        reopened.parseCommand(command);
        assert.equal(reopened.conditionType, state.conditionType);
        assert.deepEqual(reopened.buildCommands()[0], command);
    }
});

test('malformed or invalid input tags remain ordinary Script conditions', () => {
    const malformed = { code: 111, indent: 0, parameters: [12,
        '/*@RPG_REACTOR_EVENT:1:inputCondition:bad*/\nInput.isPressed("ok")'] };
    const editor = new ConditionalBranchEditor(null, null);
    editor.parseCommand(malformed);
    assert.equal(editor.conditionType, 12);
    assert.equal(editor.scriptText, malformed.parameters[1]);

    const invalidText = ReactorEventCommandCodec.createText('inputCondition', {
        type: 'mouse', button: 9, mode: 'pressed'
    }, 'false');
    editor.parseCommand({ code: 111, indent: 0, parameters: [12, invalidText] });
    assert.equal(editor.conditionType, 12);
    assert.equal(editor.scriptText, invalidText);

    const valid = new ConditionalBranchEditor(null, null);
    valid.conditionType = 16;
    valid.wheelDirection = 'up';
    const altered = valid.buildCommands()[0];
    altered.parameters[1] += ' || true';
    editor.parseCommand(altered);
    assert.equal(editor.conditionType, 12, 'altered generated input code remains an ordinary Script');
});

function loadInputRuntime() {
    const source = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const start = source.indexOf('function Input()');
    const end = source.indexOf('//-----------------------------------------------------------------------------\n/**\n * The static class that handles JSON', start);
    assert.ok(start >= 0 && end > start);
    const context = {
        console,
        navigator: { getGamepads: () => [] },
        document: { addEventListener() {} },
        window: { addEventListener() {}, navigator: {} },
        Graphics: {
            pageToCanvasX: value => value,
            pageToCanvasY: value => value,
            isInsideCanvas: () => true
        }
    };
    vm.runInNewContext(source.slice(start, end), context);
    return context;
}

test('Input release edges last exactly one update and clear on reset', () => {
    const { Input } = loadInputRuntime();
    Input.clear();
    Input._currentState.ok = true;
    Input.update();
    assert.equal(Input.isTriggered('ok'), true);
    assert.equal(Input.isReleased('ok'), false);
    Input.update();
    Input._currentState.ok = false;
    Input.update();
    assert.equal(Input.isReleased('ok'), true);
    Input.update();
    assert.equal(Input.isReleased('ok'), false);
    Input._releasedState.ok = true;
    Input._onLostFocus();
    assert.equal(Input.isReleased('ok'), false);
});

test('disconnecting a pressed gamepad emits one logical release edge', () => {
    const context = loadInputRuntime();
    const { Input } = context;
    let gamepads = [{ index: 0, connected: true,
        buttons: [{ pressed: true }], axes: [0, 0] }];
    context.navigator.getGamepads = () => gamepads;
    Input.clear();
    Input.update();
    assert.equal(Input.isPressed('ok'), true);
    gamepads = [];
    Input.update();
    assert.equal(Input.isPressed('ok'), false);
    assert.equal(Input.isReleased('ok'), true);
    Input.update();
    assert.equal(Input.isReleased('ok'), false);
});

test('gamepad disconnect keeps logical input held by another source', () => {
    const context = loadInputRuntime();
    const { Input } = context;
    const pad = index => ({ index, connected: true, buttons: [{ pressed: true }], axes: [0, 0] });
    let gamepads = [pad(0), pad(1)];
    context.navigator.getGamepads = () => gamepads;
    Input.clear();
    Input.update();
    gamepads = [null, pad(1)];
    Input.update();
    assert.equal(Input.isPressed('ok'), true);
    assert.equal(Input.isReleased('ok'), false);

    Input._keyboardState.ok = true;
    Input._currentState.ok = true;
    gamepads = [];
    Input.update();
    assert.equal(Input.isPressed('ok'), true);
    assert.equal(Input.isReleased('ok'), false);
    Input._onKeyUp({ keyCode: 13 });
    Input.update();
    assert.equal(Input.isReleased('ok'), true);
});

test('releasing one physical key keeps a shared logical button pressed', () => {
    const { Input } = loadInputRuntime();
    Input.clear();
    Input._onKeyDown({ keyCode: 13, preventDefault() {} });
    Input._onKeyDown({ keyCode: 32, preventDefault() {} });
    Input.update();
    Input._onKeyUp({ keyCode: 13 });
    Input.update();
    assert.equal(Input.isPressed('ok'), true);
    assert.equal(Input.isReleased('ok'), false);
    Input._onKeyUp({ keyCode: 32 });
    Input.update();
    assert.equal(Input.isReleased('ok'), true);
});

test('all mouse buttons track press, trigger, hold, release, and preserve stock touch paths', () => {
    const { TouchInput } = loadInputRuntime();
    const event = button => ({ button, pageX: 20, pageY: 30 });

    for (const button of [0, 1, 2]) {
        TouchInput.clear();
        TouchInput._onMouseDown(event(button));
        assert.equal(TouchInput.isMouseButtonPressed(button), true);
        TouchInput.update();
        assert.equal(TouchInput.isMouseButtonTriggered(button), true);
        for (let frame = 1; frame < TouchInput.keyRepeatWait; frame++) TouchInput.update();
        assert.equal(TouchInput.isMouseButtonLongPressed(button), true);
        TouchInput._onMouseUp(event(button));
        assert.equal(TouchInput.isMouseButtonPressed(button), false);
        TouchInput.update();
        assert.equal(TouchInput.isMouseButtonReleased(button), true);
        TouchInput.update();
        assert.equal(TouchInput.isMouseButtonReleased(button), false);
    }

    TouchInput.clear();
    TouchInput._onMouseDown(event(0));
    TouchInput.update();
    assert.equal(TouchInput.isPressed(), true);
    assert.equal(TouchInput.isTriggered(), true);
    TouchInput._onMouseUp(event(0));
    TouchInput.update();
    assert.equal(TouchInput.isReleased(), true);
    assert.equal(TouchInput.isClicked(), true);

    TouchInput.clear();
    TouchInput._onMouseDown(event(2));
    TouchInput.update();
    assert.equal(TouchInput.isCancelled(), true);
    assert.equal(TouchInput.isPressed(), false, 'right click does not become the stock left/touch press');
    TouchInput._onLostFocus();
    assert.equal(TouchInput.isMouseButtonPressed(2), false);
});
