const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const srcRoot = path.resolve(__dirname, '..', 'src');

// TextCodeMenu touches `Event` when it writes into a field. Everything else it
// needs is passed in, so a bare constructor is enough to load it here.
global.Event = global.Event || class {
    constructor(type, init) {
        this.type = type;
        Object.assign(this, init || {});
    }
};

const TextCodes = require(path.join(srcRoot, 'utils', 'TextCodes.js'));
const TextCodeMenu = require(path.join(srcRoot, 'utils', 'TextCodeMenu.js'));
const MessageBoxes = require(path.join(srcRoot, 'utils', 'MessageBoxes.js'));

function messageCore(parameters) {
    return [{ name: 'VisuMZ_1_MessageCore', status: true, parameters: parameters || {} }];
}

function withCoreEngine(parameters) {
    return messageCore(parameters)
        .concat([{ name: 'VisuMZ_0_CoreEngine', status: true, parameters: {} }]);
}

function field(value, start, end) {
    return {
        value,
        selectionStart: start,
        selectionEnd: end === undefined ? start : end,
        setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
        focus() {},
        dispatchEvent() {}
    };
}

const selectionOf = f => f.value.slice(f.selectionStart, f.selectionEnd);

// ----------------------------------------------------------------- catalogue

test('vanilla text codes match what the runtime actually implements', () => {
    const codes = TextCodes.VANILLA.map(entry => entry.code);
    // Window_Base.convertEscapeCharacters and processEscapeCharacter.
    for (const code of ['\\V[n]', '\\N[n]', '\\P[n]', '\\G', '\\C[n]', '\\I[n]',
        '\\PX[n]', '\\PY[n]', '\\FS[n]', '\\{', '\\}']) {
        assert.ok(codes.includes(code), `${code} is offered`);
    }
    // Window_Message adds the pacing codes, and they are message-scoped.
    for (const code of ['\\$', '\\.', '\\|', '\\!', '\\>', '\\<', '\\^']) {
        const entry = TextCodes.VANILLA.find(item => item.code === code);
        assert.ok(entry, `${code} is offered`);
        assert.equal(entry.scope, 'message', `${code} is message-only`);
    }
});

test('every catalogue entry carries a code and a description', () => {
    for (const group of TextCodes.forScope('message', messageCore())) {
        for (const entry of group.codes) {
            assert.ok(entry.code, `${group.id} entry has a code`);
            assert.ok(entry.detail, `${entry.code} has a description`);
        }
    }
});

test('no code is offered twice across groups', () => {
    // Every surface, including the widest one, so a family added to two scopes
    // cannot hide behind a narrow check.
    for (const [scope, options] of [
        ['message', { inBattle: true }],
        ['message', undefined],
        ['choice', { inBattle: true }],
        ['namebox', { inBattle: true }]
    ]) {
        const seen = new Map();
        for (const group of TextCodes.forScope(scope, messageCore(), options)) {
            for (const entry of group.codes) {
                const key = entry.code.toLowerCase();
                assert.ok(!seen.has(key),
                    `${scope}: ${entry.code} appears in ${group.id} and ${seen.get(key)}`);
                seen.set(key, group.id);
            }
        }
    }
});

test('MessageCore codes appear only when the plugin is enabled', () => {
    const off = TextCodes.forScope('message', []);
    assert.deepEqual(off.map(group => group.id), ['vanilla']);

    const disabled = [{ name: 'VisuMZ_1_MessageCore', status: false, parameters: {} }];
    assert.deepEqual(TextCodes.forScope('message', disabled).map(group => group.id), ['vanilla']);

    const on = TextCodes.forScope('message', messageCore()).map(group => group.id);
    assert.ok(on.includes('formatting'));
    assert.ok(on.includes('casing'));
});

test('scope decides which plugin families are offered', () => {
    const messageIds = TextCodes.forScope('message', messageCore()).map(group => group.id);
    const choiceIds = TextCodes.forScope('choice', messageCore()).map(group => group.id);

    assert.ok(messageIds.includes('message'), 'message window family on a message field');
    assert.ok(!messageIds.includes('choice'), 'choice family withheld from a message field');
    assert.ok(choiceIds.includes('choice'), 'choice family on a choice field');
    assert.ok(!choiceIds.includes('message'), 'message family withheld from a choice field');
});

// The customizable tier is a mix, so the fixture mirrors the real parameter
// shape for one message-only code and one genuinely global one.
const CUSTOM_PARAMS = {
    'TextCodeActions:arraystruct': JSON.stringify([
        JSON.stringify({ 'Match:str': 'ChangeFace', 'Type:str': '\\<(.*?)\\>' }),
        JSON.stringify({ 'Match:str': 'TextDelay', 'Type:str': '\\[(\\d+)\\]' }),
        JSON.stringify({ 'Match:str': 'NormalBG', 'Type:str': '' }),
        JSON.stringify({ 'Match:str': 'HexColor', 'Type:str': '\\<(.*?)\\>' })
    ]),
    'TextCodeReplace:arraystruct': JSON.stringify([
        JSON.stringify({ 'Match:str': 'ActorFace', 'Type:str': '\\[(\\d+)\\]' }),
        JSON.stringify({ 'Match:str': 'Class', 'Type:str': '\\[(\\d+)\\]' })
    ])
};

const codesFor = (scope, options, parameters) =>
    TextCodes.forScope(scope, messageCore(parameters), options)
        .flatMap(group => group.codes).map(entry => entry.code);

test('the name box is offered only what a Window_NameBox implements', () => {
    const groups = TextCodes.forScope('namebox', messageCore());
    const ids = groups.map(group => group.id);
    const codes = groups.flatMap(group => group.codes).map(entry => entry.code);

    assert.ok(ids.includes('namebox'), 'the name box family is offered');
    // Window_Message.processEscapeCharacter owns the pacing codes; a name box
    // is a plain Window_Base and would print them as literal text.
    for (const pacing of ['\\$', '\\.', '\\|', '\\!', '\\>', '\\<', '\\^']) {
        assert.ok(!codes.includes(pacing), `${pacing} is withheld from the name box`);
    }
    // The global escapes it does implement are still there.
    for (const global of ['\\N[n]', '\\V[n]', '\\C[n]', '\\I[n]', '\\FS[n]', '\\G', '\\\\']) {
        assert.ok(codes.includes(global), `${global} is offered`);
    }
    // Message-window sizing and positioning belong to the message, not the name.
    assert.ok(!ids.includes('message'), 'message window family withheld');
    assert.ok(!ids.includes('position'), 'message position family withheld');
});

test('word wrap is offered only where a window can act on it', () => {
    // Window_ChoiceList.isWordWrapEnabled returns false outright. Window_NameBox
    // accepts the flag but sizes itself to its own text and stands one line
    // tall (windowWidth = textSizeEx(name).width, windowHeight = fittingHeight(1)),
    // so a wrap can never trigger and a forced break draws outside the contents.
    for (const code of ['<WordWrap>', '</WordWrap>', '<NoWordWrap>', '<br>', '<linebreak>']) {
        assert.ok(codesFor('message').includes(code), `${code} on a message`);
        assert.ok(!codesFor('choice').includes(code), `${code} withheld from a choice`);
        assert.ok(!codesFor('namebox').includes(code), `${code} withheld from a name box`);
    }
});

test('pictures are withheld from the name box, which crops them to the name', () => {
    // drawBackCenteredPicture sizes against innerWidth, or itemHeight() for a
    // list window - fine for the message and choice windows. A name box is as
    // wide as its text and one line tall.
    for (const code of ['\\picture<x>', '\\CenterPicture<x>']) {
        assert.ok(codesFor('message').includes(code), `${code} on a message`);
        assert.ok(codesFor('choice').includes(code), `${code} on a choice`);
        assert.ok(!codesFor('namebox').includes(code), `${code} withheld from a name box`);
    }
});

test('customizable codes that drive the message window are message-only', () => {
    // These five reference $gameMessage or the typing delay in their own
    // ActionJS/TextJS, so from a name field they would reach past the name box
    // and change the message instead.
    const message = codesFor('message', undefined, CUSTOM_PARAMS);
    const namebox = codesFor('namebox', undefined, CUSTOM_PARAMS);

    for (const code of ['\\ChangeFace<x>', '\\TextDelay[x]', '\\ActorFace[x]']) {
        assert.ok(message.includes(code), `${code} on a message`);
        assert.ok(!namebox.includes(code), `${code} withheld from a name box`);
    }
    // The rest of the tier acts on whatever window draws it, and stays.
    for (const code of ['\\NormalBG', '\\HexColor<x>', '\\Class[x]']) {
        assert.ok(message.includes(code), `${code} on a message`);
        assert.ok(namebox.includes(code), `${code} on a name box`);
    }
});

test('button assist needs CoreEngine, not just MessageCore', () => {
    // convertButtonAssistEscapeCharacters wraps the whole block in
    // `if (Imported.VisuMZ_0_CoreEngine)`, so without it these print literally.
    const without = TextCodes.forScope('message', messageCore());
    const with_ = TextCodes.forScope('message', withCoreEngine());

    assert.ok(!without.some(group => group.id === 'controls'),
        'the family is withheld when CoreEngine is absent');
    assert.ok(with_.some(group => group.id === 'controls'),
        'and offered when it is present');

    const codes = with_.find(group => group.id === 'controls').codes.map(entry => entry.code);
    assert.equal(codes.length, 10);
    assert.ok(codes.includes('<Ok Button>'));
    // The gate makes the old "Requires CoreEngine." preamble redundant.
    for (const entry of with_.find(group => group.id === 'controls').codes) {
        assert.doesNotMatch(entry.detail, /^Requires/);
    }
});

test('a CoreEngine requirement can gate single entries, not just a family', () => {
    // The choice family is MessageCore's, but two of its entries are drawn by a
    // function that returns immediately without CoreEngine.
    const without = TextCodes.forScope('choice', messageCore())
        .flatMap(group => group.codes).map(entry => entry.code);
    const with_ = TextCodes.forScope('choice', withCoreEngine())
        .flatMap(group => group.codes).map(entry => entry.code);

    for (const code of ['<BgColor: x>', '<BgColor: #rrggbb>']) {
        assert.ok(!without.includes(code), `${code} withheld without CoreEngine`);
        assert.ok(with_.includes(code), `${code} offered with it`);
    }
    // The rest of the family is unaffected either way.
    for (const code of ['<Show Switch: x>', '<Shuffle>', '<BgImg: filename>']) {
        assert.ok(without.includes(code), `${code} does not need CoreEngine`);
    }
});

test('a disabled CoreEngine is the same as an absent one', () => {
    const off = messageCore().concat([
        { name: 'VisuMZ_0_CoreEngine', status: false, parameters: {} }
    ]);
    assert.ok(!TextCodes.forScope('message', off).some(group => group.id === 'controls'));
});

test('the shipped-default fallback is scoped the same way as a read one', () => {
    // The fallback list must not smuggle the message-only five into a name box
    // just because the project never opened the parameter.
    const namebox = codesFor('namebox', undefined, {});
    assert.ok(!namebox.includes('\\ActorFace[x]'));
    assert.ok(!namebox.includes('\\TextDelay[x]'));
    assert.ok(namebox.includes('\\Class[x]'));
});

test('battle-only codes appear only where the message runs in battle', () => {
    const outside = TextCodes.forScope('message', messageCore());
    const inside = TextCodes.forScope('message', messageCore(), { inBattle: true });

    assert.ok(!outside.some(group => group.id === 'battle'),
        'a map event is not offered codes that resolve to nothing there');
    assert.ok(inside.some(group => group.id === 'battle'),
        'a troop page is');

    const battle = inside.find(group => group.id === 'battle');
    assert.deepEqual(battle.codes.map(entry => entry.code), [
        '<Current Battle Target>',
        '<Current Battle User>',
        '<Current Battle Action>',
        '<Current Battle Action Name>'
    ]);

    // The flag admits that one family and nothing else.
    const added = inside.map(group => group.id).filter(id => !outside.map(g => g.id).includes(id));
    assert.deepEqual(added, ['battle']);
});

test('the battle flag cannot conjure codes without the plugin', () => {
    // The battle family is MessageCore's, so it stays gated on the plugin.
    const ids = TextCodes.forScope('message', [], { inBattle: true }).map(group => group.id);
    assert.deepEqual(ids, ['vanilla']);
});

// ------------------------------------------------- project-defined codes

test('Type is read as the regex fragment MessageCore actually stores', () => {
    // Not '[x]' / '<x>' - the parameter holds the matcher fragment.
    assert.deepEqual(TextCodes.describeType(''), { takesArg: false, open: '', close: '', param: null });
    assert.deepEqual(TextCodes.describeType('\\[(\\d+)\\]'),
        { takesArg: true, open: '[', close: ']', param: 'number' });
    assert.deepEqual(TextCodes.describeType('\\<(.*?)\\>'),
        { takesArg: true, open: '<', close: '>', param: 'text' });
});

test('customizable codes are read from the project parameters', () => {
    const parameters = {
        'TextCodeActions:arraystruct': JSON.stringify([
            JSON.stringify({ 'Match:str': 'NormalBG', 'Type:str': '' }),
            JSON.stringify({ 'Match:str': 'HexColor', 'Type:str': '\\<(.*?)\\>' })
        ]),
        'TextCodeReplace:arraystruct': JSON.stringify([
            JSON.stringify({ 'Match:str': 'Class', 'Type:str': '\\[(\\d+)\\]' })
        ])
    };

    const entries = TextCodes.readCustom(parameters);
    assert.deepEqual(entries.map(entry => entry.code), ['\\NormalBG', '\\HexColor<x>', '\\Class[x]']);
    assert.equal(entries[0].param, null);
    assert.equal(entries[1].param, 'text');
    assert.equal(entries[2].param, 'number');
    assert.match(entries[2].detail, /class/i, 'a known code gets its real description');
});

test('a code this project invented is reported honestly, not guessed at', () => {
    const entries = TextCodes.readCustom({
        'TextCodeActions:arraystruct': JSON.stringify([
            JSON.stringify({ 'Match:str': 'heart', 'Type:str': '' })
        ])
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].code, '\\heart');
    assert.match(entries[0].detail, /project-defined/i);
});

test('empty or malformed parameters fall back to the shipped defaults', () => {
    // The editor writes "" for an untouched list; `??` would hand that to
    // JSON.parse and throw.
    assert.deepEqual(TextCodes.readCustom({ 'TextCodeActions:arraystruct': '' }), []);
    assert.deepEqual(TextCodes.readCustom({ 'TextCodeActions:arraystruct': 'not json' }), []);

    const group = TextCodes.forScope('message', messageCore()).find(item => item.id === 'custom');
    assert.ok(group, 'the custom group still appears');
    assert.equal(group.fromProject, false, 'and is flagged as the fallback');
    assert.ok(group.codes.some(entry => entry.code === '\\Class[x]'));
});

test('one malformed element does not lose the rest of the list', () => {
    const entries = TextCodes.readCustom({
        'TextCodeActions:arraystruct': JSON.stringify([
            'not json at all',
            JSON.stringify({ 'Match:str': 'ResetFont', 'Type:str': '' })
        ])
    });
    assert.deepEqual(entries.map(entry => entry.code), ['\\ResetFont']);
});

// --------------------------------------------------------------- metrics

test('row count comes from MessageCore and falls back to four', () => {
    assert.equal(TextCodes.messageRows([]), 4);
    assert.equal(TextCodes.messageRows(messageCore()), 4);
    assert.equal(TextCodes.messageRows(messageCore({
        'General:struct': JSON.stringify({ 'MessageRows:num': '6' })
    })), 6);
    assert.equal(TextCodes.messageRows(messageCore({
        'General:struct': 'not json'
    })), 4);
    // A disabled plugin does not get to set the row count.
    assert.equal(TextCodes.messageRows([{
        name: 'VisuMZ_1_MessageCore',
        status: false,
        parameters: { 'General:struct': JSON.stringify({ 'MessageRows:num': '9' }) }
    }]), 4);
});

test('the guide width narrows when a face is set', () => {
    const plugins = messageCore({ 'General:struct': JSON.stringify({ 'MessageWidth:num': '816' }) });
    const bare = TextCodes.messageTextWidth(plugins, false);
    const withFace = TextCodes.messageTextWidth(plugins, true);
    // Window_Base pads 12 a side; newLineX starts text 4px in, or 164 beside a face.
    assert.equal(bare, 816 - 24 - 4);
    assert.equal(withFace, 816 - 24 - 164);
    assert.ok(withFace < bare);
});

test('the guide width follows the project resolution, not the stock 816', () => {
    // No plugin override: the project's UI area decides.
    global.window = { reactor: { databaseManager: { data: { system: { advanced: { uiAreaWidth: 1280 } } } } } };
    try {
        assert.equal(TextCodes.messageTextWidth([], false), 1272 - 24 - 4, 'a 1280-wide game runs a 1272 box: 1244px of text');
        assert.equal(TextCodes.messageTextWidth([], true), 1272 - 24 - 164);
    } finally {
        delete global.window;
    }
    // An explicit basis wins over the ambient project; the stock width is
    // only the last resort.
    assert.equal(TextCodes.messageTextWidth([], false, 1104), 1096 - 24 - 4);
    assert.equal(TextCodes.messageTextWidth([], false), 808 - 24 - 4, 'no project in reach: MZ stock runs an 808 box');
    // And a plugin's configured width still beats everything.
    const plugins = messageCore({ 'General:struct': JSON.stringify({ 'MessageWidth:num': '600' }) });
    assert.equal(TextCodes.messageTextWidth(plugins, false, 1280), 600 - 24 - 4);
});

test('the overflow scanner draws the line the way the game will', () => {
    // A fake context: width = glyph count x (font size / 13), so size steps
    // and substitutions are visible in the arithmetic.
    let currentSize = 13;
    const context = {
        set font(value) { currentSize = parseFloat(value) || 13; },
        get font() { return `${currentSize}px x`; },
        measureText: text => ({ width: [...String(text)].length * (currentSize / 13) })
    };
    const scan = (line, available, subs) =>
        TextCodes.scanMessageLine(line, context, 'x', 13, available, subs);

    assert.deepEqual(scan('abcd', 10), { width: 4, overflowIndex: -1 }, 'plain text fits');
    assert.equal(scan('abcdefghij', 5).overflowIndex, 5, 'and overflows at the exact character');
    assert.equal(scan('\\C[6]abcd', 10).width, 4, 'a colour code costs nothing');
    assert.equal(scan('\\SPEED[2]ab', 10).width, 2, 'an unknown bracketed code costs nothing either');
    assert.equal(scan('\\I[64]', 100).width, 36, 'an icon costs its 36 pixels');
    assert.equal(scan('a\\.b\\|c\\!d\\^', 100).width, 4, 'the punctuation codes draw nothing');
    assert.equal(scan('\\\\ab', 10).width, 3, 'an escaped backslash is one drawn character');
    const grown = scan('\\{ab', 100).width;
    assert.ok(Math.abs(grown - 2 * (25 / 13)) < 1e-9, 'font-size steps change the pen');
    assert.equal(scan('\\N[1]!', 100, { actor: () => 'Alice' }).width, 6, 'an actor code measures as the actual name');
    assert.equal(scan('\\G', 100, { currency: 'cr' }).width, 2, 'currency measures as the unit');
});

test('the overflow measurement follows the project font, switch included', () => {
    const fs = require('node:fs');
    const editorSource = fs.readFileSync(path.join(srcRoot, 'event', 'commands', 'MessageCommandEditor.js'), 'utf8');
    assert.match(editorSource, /this\._previewFontFile !== filename/, 'a changed Main Font reloads without a restart');
    assert.match(editorSource, /advanced\.mainFontFilename \|\| ''/, 'the family comes from the project');
    assert.match(editorSource, /advanced\.fontSize \|\| 26/, 'and so does the size');
});

test('word wrap is detected so the guide can stand down', () => {
    assert.equal(TextCodes.hasWordWrap('<WordWrap>hello'), true);
    assert.equal(TextCodes.hasWordWrap('< wordwrap >hello'), true);
    assert.equal(TextCodes.hasWordWrap('plain text'), false);
});

// ------------------------------------------------------------- insertion

test('an inserted code leaves its argument selected for typing', () => {
    const target = field('Hello ', 6);
    TextCodeMenu.insertAtCaret(target, '\\V[{n}]');
    assert.equal(target.value, 'Hello \\V[1]');
    assert.equal(selectionOf(target), '1');
});

test('a value chosen in a picker is written in, with the caret after it', () => {
    const target = field('', 0);
    TextCodeMenu.insertAtCaret(target, '\\C[{n}]', 6);
    assert.equal(target.value, '\\C[6]');
    assert.equal(selectionOf(target), '');
    assert.equal(target.selectionStart, target.value.length);
});

test('the placeholder is found by position, not by hunting for a bracket', () => {
    const target = field('', 0);
    TextCodeMenu.insertAtCaret(target, '<Help>{n}</Help>');
    assert.equal(target.value, '<Help>1</Help>');
    assert.equal(selectionOf(target), '1');
});

test('inserting replaces the selection rather than appending to it', () => {
    const target = field('abcd', 1, 3);
    TextCodeMenu.insertAtCaret(target, '\\G');
    assert.equal(target.value, 'a\\Gd');
});

test('pasted text is data: a literal {n} in it is not a placeholder', () => {
    const target = field('', 0);
    TextCodeMenu.insertAtCaret(target, 'literal {n} here', null, true);
    assert.equal(target.value, 'literal {n} here');
    assert.equal(selectionOf(target), '');
});

test('insertion honours the caret captured before a picker stole focus', () => {
    const target = field('start end', 5);
    // A picker blurs the field; browsers then report selectionStart 0.
    target._rrCaretStart = 5;
    target._rrCaretEnd = 5;
    target.selectionStart = 0;
    target.selectionEnd = 0;
    TextCodeMenu.insertAtCaret(target, '\\I[{n}]', 42);
    assert.equal(target.value, 'start\\I[42] end');
});

// ------------------------------------------------------------ message boxes

const header = extra => Object.assign(
    { faceName: '', faceIndex: 0, background: 0, positionType: 2, speakerName: '' }, extra);

function showText(parameters, lines, indent) {
    const list = [{ code: 101, indent: indent || 0, parameters }];
    for (const line of lines) list.push({ code: 401, indent: indent || 0, parameters: [line] });
    return list;
}

test('a run of consecutive boxes is read as several boxes, headers intact', () => {
    const list = [
        ...showText(['Evil', 7, 0, 2, 'Coder'], ['one', 'two']),
        ...showText(['', 0, 1, 0, ''], ['three']),
        { code: 0, indent: 0, parameters: [] }
    ];

    const run = MessageBoxes.collectRun(list, 0);
    assert.equal(run.boxes.length, 2);
    assert.deepEqual(run.boxes[0].lines, ['one', 'two']);
    assert.equal(run.boxes[0].header.speakerName, 'Coder');
    assert.equal(run.boxes[0].header.faceIndex, 7);
    assert.deepEqual(run.boxes[1].lines, ['three']);
    assert.equal(run.boxes[1].header.background, 1);
    // The run ends before the End command.
    assert.equal(run.endIndex, 4);
    assert.equal(run.count, 5);
});

test('a click anywhere in a run reads the whole run and remembers the box hit', () => {
    const list = [
        { code: 230, indent: 0, parameters: [30] },
        ...showText(['', 0, 0, 2, ''], ['one', 'two']),
        ...showText(['', 0, 1, 0, ''], ['three']),
        ...showText(['', 0, 0, 2, ''], ['four']),
        { code: 0, indent: 0, parameters: [] }
    ];
    // Indices: 0 wait, 1..3 box A, 4..5 box B, 6..7 box C.
    for (const [clicked, active] of [[1, 0], [3, 0], [4, 1], [5, 1], [6, 2], [7, 2]]) {
        const run = MessageBoxes.collectRun(list, clicked);
        assert.equal(run.startIndex, 1, `clicked ${clicked}: the run starts at its first box`);
        assert.equal(run.boxes.length, 3, `clicked ${clicked}: the whole conversation is read`);
        assert.equal(run.count, 7);
        assert.equal(run.activeIndex, active, `clicked ${clicked}: opens on the box that was hit`);
    }
    // collectOne now means the box CONTAINING the index.
    const one = MessageBoxes.collectOne(list, 4);
    assert.deepEqual(one.boxes[0].lines, ['three']);
    assert.equal(one.startIndex, 4);
    assert.equal(one.count, 2);
});

test('position Top survives the round trip', () => {
    // positionType 0 is falsy; `||` defaulting rewrote it to 2 (Bottom).
    const list = showText(['', 0, 0, 0, ''], ['hi']);
    const run = MessageBoxes.collectRun(list, 0);
    assert.equal(run.boxes[0].header.positionType, 0);
    const rebuilt = MessageBoxes.buildCommands(run.boxes, 0);
    assert.equal(rebuilt[0].parameters[3], 0);
});

test('reading and rebuilding a run reproduces it exactly', () => {
    const list = [
        ...showText(['Actor1', 3, 0, 2, 'Sam'], ['a', '', 'c']),
        ...showText(['Actor1', 3, 0, 2, 'Sam'], ['d'])
    ];
    const run = MessageBoxes.collectRun(list, 0);
    assert.deepEqual(MessageBoxes.buildCommands(run.boxes, 0), list);
});

test('an interior blank line survives but a trailing one does not', () => {
    const boxes = [{ header: header(), lines: ['a', '', 'b', '', ''] }];
    const commands = MessageBoxes.buildCommands(boxes, 0);
    assert.deepEqual(commands.filter(c => c.code === 401).map(c => c.parameters[0]), ['a', '', 'b']);
});

test('an empty box still emits its header', () => {
    const commands = MessageBoxes.buildCommands([{ header: header({ speakerName: 'X' }), lines: [] }], 0);
    assert.equal(commands.length, 1);
    assert.equal(commands[0].code, 101);
    assert.equal(commands[0].parameters[4], 'X');
});

test('batch overflow splits into boxes of the window height', () => {
    const lines = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    assert.deepEqual(MessageBoxes.splitLines(lines, 4), [
        ['1', '2', '3', '4'], ['5', '6', '7', '8'], ['9']
    ]);
    assert.deepEqual(MessageBoxes.splitLines(lines, 6), [
        ['1', '2', '3', '4', '5', '6'], ['7', '8', '9']
    ]);
});

test('splitting drops trailing blanks so no empty box is created', () => {
    assert.deepEqual(MessageBoxes.splitLines(['a', 'b', '', '', ''], 4), [['a', 'b']]);
    assert.deepEqual(MessageBoxes.splitLines(['a', 'b', 'c', 'd', ''], 4), [['a', 'b', 'c', 'd']]);
    assert.deepEqual(MessageBoxes.splitLines([], 4), [[]]);
});

test('a nine-line batch becomes three commands sharing one header', () => {
    const boxes = [{
        header: header({ speakerName: 'Narrator', positionType: 1 }),
        lines: ['1', '2', '3', '4', '5', '6', '7', '8', '9']
    }];
    const commands = MessageBoxes.buildCommands(boxes, 0, 4);
    const headers = commands.filter(command => command.code === 101);
    assert.equal(headers.length, 3);
    for (const item of headers) {
        assert.equal(item.parameters[4], 'Narrator');
        assert.equal(item.parameters[3], 1);
    }
    assert.equal(commands.filter(command => command.code === 401).length, 9);
});

test('indent is applied to every emitted command', () => {
    const boxes = [{ header: header(), lines: ['a'] }, { header: header(), lines: ['b'] }];
    for (const command of MessageBoxes.buildCommands(boxes, 3)) {
        assert.equal(command.indent, 3);
    }
});

test('collectOne reads a single box out of a longer run', () => {
    const list = [
        ...showText(['', 0, 0, 2, 'A'], ['one', 'two']),
        ...showText(['', 0, 0, 2, 'B'], ['three'])
    ];
    const one = MessageBoxes.collectOne(list, 0);
    assert.equal(one.boxes.length, 1);
    assert.deepEqual(one.boxes[0].lines, ['one', 'two']);
    assert.equal(one.count, 3);
});

test('sameHeader distinguishes boxes that only look alike', () => {
    assert.equal(MessageBoxes.sameHeader(header(), header()), true);
    assert.equal(MessageBoxes.sameHeader(header(), header({ positionType: 0 })), false);
    assert.equal(MessageBoxes.sameHeader(header({ speakerName: 'A' }), header({ speakerName: 'B' })), false);
});

test('a new box inherits the header it was added after', () => {
    const previous = header({ faceName: 'Actor1', faceIndex: 2, speakerName: 'Sam' });
    const box = MessageBoxes.newBox(previous);
    assert.deepEqual(box.header, previous);
    assert.notEqual(box.header, previous, 'and is a copy, not a shared reference');
    assert.deepEqual(box.lines, ['']);
});

test('the message editor keeps a live miniature under the text field', () => {
    const fs = require('node:fs');
    const source = fs.readFileSync(
        path.join(srcRoot, 'event', 'commands', 'MessageCommandEditor.js'), 'utf8');
    // The canvas exists, updateGuide redraws it, and caret movement alone
    // (keyup/click) redraws it too — typing is not the only way to change
    // which box the cursor is in.
    assert.match(source, /message-mini-preview/);
    assert.match(source, /updateGuide\(\) \{\n        this\.renderMiniPreview\(\);/);
    assert.match(source, /addEventListener\('keyup', \(\) => this\.renderMiniPreview\(\)\)/);
    // The miniature shows the box the caret sits in, not always the first.
    assert.match(source, /slice\(0, area\.selectionStart\)\.split\('\\n'\)\.length - 1/);
    // Pinned to the bottom so the name-box headroom is the only empty band.
    assert.match(source, /positionType: 2/);
});

test('the picture codes steer an author towards an icon on a description field', () => {
    // A picture loads asynchronously, so on a field whose window redraws often
    // -- a description, a name box -- it arrives late or not at all. The codes
    // stay offered; the description says what to prefer, and says it where an
    // author reads before typing one.
    // The picture codes are MessageCore's, so they live in the grouped catalogue.
    const group = TextCodes.MESSAGE_CORE.find(entry => entry.id === 'pictures');
    assert.ok(group, 'the Pictures group is still there');
    const pictures = group.codes;
    assert.equal(pictures.length, 2, 'the two picture codes are still offered');
    for (const entry of pictures) {
        assert.match(entry.detail, /a picture loads with a delay/);
        // The backslash has to survive into the rendered string: a lone '\I'
        // is an unknown escape in a JS literal and quietly becomes a bare I.
        assert.ok(entry.detail.includes('Prefer ' + String.fromCharCode(92) + 'I[n] in a description'),
            'the advice names the code, not a bare letter');
    }
});
