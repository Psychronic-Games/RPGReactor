const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const Codec = require(path.join(editorRoot, 'src', 'event', 'commands', 'ReactorEventCommandCodec.js'));
const ControlVariablesEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'ControlVariablesEditor.js'));
const LoopEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'LoopEditor.js'));

function command(code, indent, parameters = []) {
    return { code, indent, parameters };
}

function constant(value) {
    return { type: 'constant', value };
}

function variable(id) {
    return { type: 'variable', id };
}

function evaluateGenerated(text, values = {}) {
    const gameVariables = { value: id => values[id] || 0 };
    const math = Object.create(Math);
    math.randomInt = max => max - 1;
    return Function('$gameVariables', 'Math', `return (${text});`)(gameVariables, math);
}

test('generated-text codec is canonical and rejects malformed or unknown versions', () => {
    const text = Codec.createText('sample-kind', { value: 3, label: 'ok' }, '1 + 2');
    assert.match(text, /^\/\*@RPG_REACTOR_EVENT:1:/);
    assert.deepEqual(Codec.parseText(text), {
        version: 1,
        kind: 'sample-kind',
        data: { value: 3, label: 'ok' },
        body: '1 + 2'
    });
    assert.equal(Codec.parseText(text, 'other-kind'), null);
    assert.equal(Codec.parseText(text.replace(':1:', ':2:')), null);
    assert.equal(Codec.parseText(` ${text}`), null);
    assert.equal(Codec.parseText(text.replace('%7B', '%7b')), null, 'noncanonical percent encoding is rejected');
    assert.equal(Codec.parseText(text.replace('*/\n', '*/\r\n')), null);
    assert.throws(() => Codec.createText('bad kind', {}, '0'), TypeError);
    assert.throws(() => Codec.createText('kind', undefined, '0'), TypeError);
    assert.throws(() => Codec.createText('kind', {}, 'if ('), SyntaxError);
});

test('codec recognizes only stock script-bearing command layouts', () => {
    const script = Codec.createScriptCommand('sample', { id: 1 }, 'true');
    assert.equal(script.code, 355);
    assert.equal(script.parameters.length, 1);
    assert.equal(Codec.parseCommand(script, 'sample').body, 'true');

    const text = script.parameters[0];
    assert.equal(Codec.parseCommand(command(111, 2, [12, text]), 'sample').parameterIndex, 1);
    assert.equal(Codec.parseCommand(command(122, 2, [1, 1, 0, 4, text, 0, 0]), 'sample').parameterIndex, 4);
    assert.equal(Codec.parseCommand(command(111, 0, [1, text])), null);
    assert.equal(Codec.parseCommand(command(122, 0, [1, 1, 0, 0, text, 0, 0])), null);
    assert.equal(Codec.parseCommand(command(355, 0, [text, 'extra'])), null);
});

test('all advanced expression families compile to executable numeric JavaScript', () => {
    const binary = [
        ['add', 8, 2, 10],
        ['subtract', 8, 2, 6],
        ['multiply', 8, 2, 16],
        ['divide', 8, 2, 4],
        ['modulo', 8, 3, 2],
        ['power', 8, 2, 64],
        ['minimum', 8, 2, 2],
        ['maximum', 8, 2, 8],
        ['atan2', 8, 2, Math.atan2(8, 2)],
        ['random', 8, 2, 8],
        ['bitwiseAnd', 6, 3, 2],
        ['bitwiseOr', 6, 3, 7],
        ['bitwiseXor', 6, 3, 5],
        ['leftShift', 3, 2, 12],
        ['rightShift', 12, 2, 3]
    ];
    for (const [operator, left, right, expected] of binary) {
        const data = { operator, left: constant(left), right: constant(right) };
        const text = ControlVariablesEditor.compileAdvancedExpression(data);
        assert.equal(evaluateGenerated(text), expected, operator);
        assert.deepEqual(ControlVariablesEditor.parseAdvancedExpression(text), data, operator);
    }

    const unary = [
        ['absolute', -9, 9],
        ['squareRoot', 9, 3],
        ['sineDegrees', 90, 1],
        ['cosineDegrees', 180, -1]
    ];
    for (const [operator, value, expected] of unary) {
        const data = { operator, left: constant(value) };
        const actual = evaluateGenerated(ControlVariablesEditor.compileAdvancedExpression(data));
        assert.ok(Math.abs(actual - expected) < 1e-12, operator);
    }

    const variableData = { operator: 'add', left: variable(4), right: variable(7) };
    assert.equal(evaluateGenerated(ControlVariablesEditor.compileAdvancedExpression(variableData), { 4: 11, 7: 5 }), 16);
});

test('advanced expressions use exactly seven stock parameters and reopen only exact output', () => {
    const expression = { operator: 'maximum', left: variable(2), right: constant(10) };
    const generated = ControlVariablesEditor.buildAdvancedCommand({
        startId: 3,
        endId: 5,
        operationType: 0,
        expression,
        indent: 2
    });
    assert.deepEqual(generated.parameters.slice(0, 4), [3, 5, 0, 4]);
    assert.equal(generated.parameters.length, 7);
    assert.deepEqual(ControlVariablesEditor.parseAdvancedExpressionCommand(generated), expression);

    const handAuthored = command(122, 0, [1, 1, 0, 4, '$gameVariables.value(2) + 1', 0, 0]);
    assert.equal(ControlVariablesEditor.parseAdvancedExpressionCommand(handAuthored), null);

    const changedBody = JSON.parse(JSON.stringify(generated));
    changedBody.parameters[4] += ' + 1';
    assert.equal(ControlVariablesEditor.parseAdvancedExpressionCommand(changedBody), null);

    const short = JSON.parse(JSON.stringify(generated));
    short.parameters.length = 5;
    assert.equal(ControlVariablesEditor.parseAdvancedExpressionCommand(short), null);

    const statefulEditor = new ControlVariablesEditor(null, null);
    statefulEditor.advancedExpression = expression;
    statefulEditor.operand = 5;
    statefulEditor.resetOperandValues();
    assert.deepEqual(statefulEditor.advancedExpression, expression,
        'reselecting Advanced Expression preserves the in-dialog expression');
    statefulEditor.scriptValue = '$gameVariables.value(9)';
    statefulEditor.value = generated.parameters[4];
    statefulEditor.operand = 4;
    statefulEditor.resetOperandValues();
    assert.equal(statefulEditor.value, '$gameVariables.value(9)',
        'switching to Script does not restore generated metadata as editable script');

    const variableSource = fs.readFileSync(path.join(
        editorRoot, 'src', 'event', 'commands', 'ControlVariablesEditor.js'), 'utf8');
    const switchSource = fs.readFileSync(path.join(
        editorRoot, 'src', 'event', 'commands', 'ControlSwitchesEditor.js'), 'utf8');
    const pickerSource = fs.readFileSync(path.join(
        editorRoot, 'src', 'event', 'SwitchVariablePicker.js'), 'utf8');
    const themeSource = fs.readFileSync(path.join(editorRoot, 'css', 'theme.css'), 'utf8');

    for (const source of [variableSource, switchSource]) {
        assert.match(source, /rr-modal-overlay rr-event-command-modal/);
        assert.match(source, /rr-command-card-body/);
        assert.match(source, /rr-command-target-row/);
        assert.match(source, /rr-command-inline-options/);
    }
    assert.match(variableSource, /rr-command-choice-row/);
    assert.match(variableSource, /if \(!disabled\)/);
    assert.match(pickerSource, /rr-modal-overlay rr-nested-picker-modal/);
    assert.match(pickerSource, /document\.createElement\('button'\)/);
    assert.doesNotMatch(pickerSource, /z-index:\s*10002/);
    assert.match(themeSource, /\.rr-command-choice-row\s*\{[\s\S]*?grid-template-columns:/);
    assert.match(themeSource, /\.rr-command-target-row\s*\{[\s\S]*?grid-template-columns:/);

    const commandLayer = Number(themeSource.match(
        /\.rr-event-command-modal\s*\{[\s\S]*?z-index:\s*(\d+)/)[1]);
    const pickerLayer = Number(themeSource.match(
        /\.rr-nested-picker-modal\s*\{[\s\S]*?z-index:\s*(\d+)/)[1]);
    assert.ok(pickerLayer > commandLayer, 'nested switch/variable pickers must cover command modals');
});

test('Control Variables exposes every stock TP and Last Action Game Data index exactly', () => {
    assert.deepEqual(ControlVariablesEditor.actorGameDataParameters().map((label, index) => [label, index]).at(-1),
        ['TP', 12]);
    assert.deepEqual(ControlVariablesEditor.enemyGameDataParameters().map((label, index) => [label, index]).at(-1),
        ['TP', 10]);
    assert.deepEqual(ControlVariablesEditor.lastActionGameDataParameters(), [
        'Last Used Skill ID',
        'Last Used Item ID',
        'Last Actor ID to Act',
        'Last Enemy Index to Act',
        'Last Target Actor ID',
        'Last Target Enemy Index'
    ]);
    assert.deepEqual(ControlVariablesEditor.gameDataTypes().at(-1),
        { value: 8, label: 'Last Action Data' });

    const operands = [
        [3, 4, 12],
        [4, 2, 10],
        ...ControlVariablesEditor.lastActionGameDataParameters().map((_label, index) => [8, index, 0])
    ];
    for (const [type, param1, param2] of operands) {
        const original = command(122, 0, [7, 7, 0, 3, type, param1, param2]);
        const reopened = new ControlVariablesEditor(null, null);
        assert.equal(reopened.loadCommand(original), true);
        assert.deepEqual(reopened.buildCommand(), original,
            `Game Data ${type}/${param1}/${param2} must round-trip byte-identically`);
    }
});

test('Control Variables Character Game Data uses live map events and keeps stale IDs visible', () => {
    const projectController = {
        tilemapManager: {
            currentMap: {
                events: [
                    null,
                    { id: 1, name: 'Gate' },
                    null,
                    { id: 37, name: 'Late Event' }
                ]
            }
        }
    };
    const editor = new ControlVariablesEditor(null, projectController);
    editor.operand = 3;
    editor.value = 5;
    editor.param1 = 91;
    editor.param2 = 4;

    const options = editor._characterGameDataOptions();
    assert.deepEqual(options.map(option => option.v), [-1, 0, 1, 37, 91]);
    assert.equal(options.find(option => option.v === 37).t, 'Event 037: Late Event');
    assert.equal(options.find(option => option.v === 91).t, 'Event 091: Missing');
    assert.deepEqual(editor.buildCommand().parameters.slice(4), [5, 91, 4],
        'an unavailable existing map event remains unchanged until the user selects another event');

    projectController.tilemapManager.currentMap.events[91] = { id: 91, name: 'Loaded Later' };
    const refreshed = editor._characterGameDataOptions();
    assert.equal(refreshed.filter(option => option.v === 91).length, 1);
    assert.equal(refreshed.find(option => option.v === 91).t, 'Event 091: Loaded Later');
    assert.equal(refreshed.some(option => option.v === 20), false,
        'the event list is not padded to the old arbitrary 1-20 range');
});

test('Control Variables Game Data presents database names and readable summaries', () => {
    const data = {
        getItems: () => [{ id: 1, name: 'Potion' }],
        getWeapons: () => [{ id: 2, name: 'Iron Sword' }],
        getArmors: () => [{ id: 3, name: 'Round Shield' }],
        getActors: () => [{ id: 7, name: 'Chronus-13' }]
    };
    const editor = new ControlVariablesEditor(data, null);
    editor.operand = 3;
    editor.value = 3;
    editor.param1 = 7;
    editor.param2 = 0;

    assert.equal(editor._gameDataSummary(), 'Level · 0007: Chronus-13');
    assert.deepEqual(editor._databaseGameDataOptions('getItems', 1), [
        { value: 1, label: '0001: Potion' }
    ]);
    assert.deepEqual(editor._databaseGameDataOptions('getWeapons', 91), [
        { value: 2, label: '0002: Iron Sword' },
        { value: 91, label: '0091: Missing' }
    ]);
    assert.deepEqual(ControlVariablesEditor.gameDataDefaults(5),
        { value: 5, param1: -1, param2: 0 });
    assert.deepEqual(ControlVariablesEditor.gameDataDefaults(8),
        { value: 8, param1: 0, param2: 0 });

    const source = fs.readFileSync(path.join(
        editorRoot, 'src', 'event', 'commands', 'ControlVariablesEditor.js'), 'utf8');
    const theme = fs.readFileSync(path.join(editorRoot, 'css', 'theme.css'), 'utf8');
    assert.match(source, /rr-nested-picker-modal rr-game-data-modal/);
    assert.match(source, /rr-game-data-row/);
    assert.match(source, /Object\.assign\(draft, ControlVariablesEditor\.gameDataDefaults/);
    assert.match(theme, /\.rr-game-data-controls\s*\{/);
});

test('loop modes compile to exact stock code and indentation structures', () => {
    const body = [command(230, 1, [10])];
    const forever = LoopEditor.build({ mode: 'forever' }, body, 0);
    assert.deepEqual(forever.map(item => item.code), [112, 230, 413]);
    assert.deepEqual(forever.map(item => item.indent), [0, 1, 0]);

    const repeat = LoopEditor.build({
        mode: 'repeatCount',
        counterVariable: 9,
        count: variable(2)
    }, body, 0);
    assert.deepEqual(repeat.map(item => item.code), [122, 112, 111, 113, 412, 230, 122, 413]);
    assert.deepEqual(repeat.map(item => item.indent), [0, 0, 1, 2, 1, 1, 1, 0]);

    const whileLoop = LoopEditor.build({
        mode: 'whileVariable',
        variableId: 4,
        comparison: 'greaterEqual',
        right: constant(2)
    }, body, 0);
    assert.deepEqual(whileLoop.map(item => item.code), [112, 111, 113, 412, 230, 413]);
    assert.deepEqual(whileLoop.map(item => item.indent), [0, 1, 2, 1, 1, 0]);

    const range = LoopEditor.build({
        mode: 'variableRange',
        variableId: 6,
        start: variable(1),
        end: constant(-3),
        step: -2
    }, body, 0);
    assert.deepEqual(range.map(item => item.code), [122, 112, 111, 113, 412, 230, 122, 413]);
    assert.deepEqual(range.map(item => item.indent), [0, 0, 1, 2, 1, 1, 1, 0]);
    assert.deepEqual(range[0].parameters, [6, 6, 0, 1, 1, 0, 0]);
    assert.deepEqual(range[6].parameters, [6, 6, 2, 0, 2, 0, 0]);

    for (const list of [repeat, whileLoop, range]) {
        for (const item of list.filter(entry => entry.code === 122)) {
            assert.equal(item.parameters.length, 7);
        }
        for (const item of list.filter(entry => entry.code === 111)) {
            assert.equal(item.parameters.length, 2);
            assert.equal(item.parameters[0], 12);
        }
        assert.ok(list.every(item => [112, 413, 111, 113, 412, 122, 230].includes(item.code)));
    }
});

test('generated loops parse and rebuild exactly while ordinary loops remain Forever', () => {
    const configs = [
        { mode: 'repeatCount', counterVariable: 8, count: constant(4) },
        { mode: 'whileVariable', variableId: 3, comparison: 'notEqual', right: variable(5) },
        { mode: 'variableRange', variableId: 2, start: constant(10), end: variable(7), step: -1 }
    ];
    const body = [command(101, 1, ['', 0, 0, 2]), command(401, 1, ['Text'])];
    for (const config of configs) {
        const built = LoopEditor.build(config, body, 2);
        const parsed = LoopEditor.parse(built);
        assert.equal(parsed.generated, true);
        assert.deepEqual(parsed.config, config);
        assert.deepEqual(parsed.body, body);
        assert.equal(parsed.indent, 2);
        assert.deepEqual(LoopEditor.build(parsed.config, parsed.body, parsed.indent), built);
    }

    const ordinary = [command(112, 1), command(230, 2, [30]), command(413, 1)];
    const parsedOrdinary = LoopEditor.parse(ordinary);
    assert.deepEqual(parsedOrdinary.config, { mode: 'forever' });
    assert.equal(parsedOrdinary.generated, false);
    assert.deepEqual(parsedOrdinary.body, [command(230, 1, [30])]);
    assert.deepEqual(LoopEditor.parse(command(413, 4)).config, { mode: 'forever' });
});

test('Loop inserts a stock block directly and preserves existing loop structures', () => {
    const editor = new LoopEditor(null, null);
    let inserted;
    editor.show(null, commands => { inserted = commands; });
    assert.deepEqual(inserted, [command(112, 0), command(413, 0)]);

    const existing = LoopEditor.build({
        mode: 'repeatCount',
        counterVariable: 8,
        count: constant(4)
    }, [command(230, 1, [10])], 2);
    let preserved;
    editor.show(existing, commands => { preserved = commands; });
    assert.deepEqual(preserved, existing);
    assert.equal(editor.modal, undefined);
});

test('malformed generated guards fall back without being recognized as structured loops', () => {
    const config = {
        mode: 'whileVariable',
        variableId: 1,
        comparison: 'less',
        right: constant(5)
    };
    const malformed = LoopEditor.build(config, [], 0);
    malformed[1].parameters[1] += ' || true';
    const parsed = LoopEditor.parse(malformed);
    assert.deepEqual(parsed.config, { mode: 'forever' });
    assert.equal(parsed.generated, false);

    const malformedRepeat = LoopEditor.build({
        mode: 'repeatCount', counterVariable: 2, count: constant(3)
    }, [], 0);
    malformedRepeat[2].parameters[1] += ' || true';
    assert.equal(LoopEditor.parse(malformedRepeat), null);
});

test('nested loop body indentation survives generated parse and rebuild', () => {
    const nestedBody = [
        command(112, 1),
        command(111, 2, [12, '$gameSwitches.value(1)']),
        command(113, 3),
        command(412, 2),
        command(413, 1)
    ];
    const config = {
        mode: 'variableRange',
        variableId: 12,
        start: constant(1),
        end: constant(3),
        step: 1
    };
    const built = LoopEditor.build(config, nestedBody, 2);
    assert.deepEqual(built.slice(5, 10).map(item => item.indent), [3, 4, 5, 4, 3]);
    const parsed = LoopEditor.parse(built);
    assert.deepEqual(parsed.body, nestedBody);
    assert.deepEqual(LoopEditor.build(parsed.config, parsed.body, parsed.indent), built);

    assert.deepEqual(LoopEditor.findBlockRange(built, 7), { start: 5, end: 9 });
    assert.deepEqual(LoopEditor.findBlockRange(built, 10), { start: 1, end: 11 });
    assert.equal(LoopEditor.findBlockRange(built, 0), null);
});

test('finite loops reject source variables that alias their control variable', () => {
    assert.equal(LoopEditor.normalizeConfig({
        mode: 'repeatCount', counterVariable: 4, count: variable(4)
    }), null);
    assert.equal(LoopEditor.normalizeConfig({
        mode: 'variableRange', variableId: 6, start: constant(1), end: variable(6), step: 1
    }), null);
});
