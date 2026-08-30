const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.resolve(__dirname, '..');
const commandsDir = path.join(editorRoot, 'src', 'event', 'commands');
const objectsSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
const authored = require(path.join(__dirname, 'helpers', 'authored-data-shapes.json'));

// Commands whose actor slot accepts 0 = the whole party.
const ACTOR_COMMAND_EDITORS = {
    'ChangeHPEditor.js': 311, 'ChangeMPEditor.js': 312, 'ChangeStateEditor.js': 313,
    'RecoverAllEditor.js': 314, 'ChangeEXPEditor.js': 315, 'ChangeLevelEditor.js': 316,
    'ChangeParameterEditor.js': 317, 'ChangeSkillEditor.js': 318, 'ChangeTPEditor.js': 326
};

test('the engine treats actor id 0 as the entire party', () => {
    assert.match(objectsSource,
        /iterateActorId = function\(param, callback\) \{\s*\n\s*if \(param === 0\) \{\s*\n\s*\$gameParty\.members\(\)\.forEach\(callback\);/,
        'this is why 0 cannot be collapsed to 1');
});

test('no actor command editor collapses the entire-party target onto actor 1', () => {
    // `params[1] || 1` rewrote every party-wide command to actor 1 on load,
    // and the edit path writes the loaded value straight back out.
    const offenders = [];
    for (const file of Object.keys(ACTOR_COMMAND_EDITORS)) {
        const source = fs.readFileSync(path.join(commandsDir, file), 'utf8');
        if (/this\.actorId = params\[1\] \|\| 1;/.test(source)) offenders.push(file);
        if (!/this\.actorId = params\[1\] \?\? 1;/.test(source)) offenders.push(`${file} (no nullish load)`);
    }
    assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('every actor command editor can express the entire party', () => {
    // The dropdown started at index 1, so the value was not reachable at all.
    const missing = Object.keys(ACTOR_COMMAND_EDITORS).filter(file => {
        const source = fs.readFileSync(path.join(commandsDir, file), 'utf8');
        return !/partyOption\.value = 0;/.test(source) || !/tt\('Entire Party'\)/.test(source);
    });
    assert.deepEqual(missing, [], `these offer no party option: ${missing.join(', ')}`);
});

test('the Entire Party label is translated in every locale', () => {
    const i18n = fs.readFileSync(path.join(editorRoot, 'src', 'I18nManager.js'), 'utf8');
    const locales = new Set(
        [...i18n.matchAll(/Object\.assign\(RR_TEXT_TRANSLATIONS(?:\.(\w+)|\['([\w-]+)'\]), \{/g)]
            .map(match => match[1] || match[2]));
    const translated = new Set(
        [...i18n.matchAll(/Object\.assign\(RR_TEXT_TRANSLATIONS(?:\.(\w+)|\['([\w-]+)'\]), \{ 'Entire Party'/g)]
            .map(match => match[1] || match[2]));
    const gaps = [...locales].filter(locale => !translated.has(locale)).sort();
    assert.deepEqual(gaps, [], `untranslated in: ${gaps.join(', ')}`);
});

test('Show Text keeps the Top window position', () => {
    // positionType 0 is Top and is falsy; 946 authored Show Text commands in
    // the bundled projects use it. Opening one and pressing OK moved the
    // message window to the bottom.
    //
    // The header read moved into RRMessageBoxes when the Show Text editor
    // learned to hold a run of boxes, so the guard follows it there. Both the
    // shared reader and the editor's own fallback are checked, because either
    // one regressing reintroduces the same bug.
    const boxes = fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'MessageBoxes.js'), 'utf8');
    assert.match(boxes, /positionType: parameters\[3\] \?\? 2/);
    assert.doesNotMatch(boxes, /positionType: parameters\[3\] \|\| 2/);
    assert.match(boxes, /header\.positionType \?\? 2/, 'and is written back unchanged');

    const source = fs.readFileSync(path.join(commandsDir, 'MessageCommandEditor.js'), 'utf8');
    assert.match(source, /positionType: command\.parameters\[3\] \?\? 2,/);
    assert.doesNotMatch(source, /positionType: command\.parameters\[3\] \|\| 2/);

    assert.match(objectsSource, /\$gameMessage\.setPositionType\(params\[3\]\)/);
});

test('a run of Show Text boxes round-trips without losing a header', () => {
    // The editor now replaces every command in the run rather than only the
    // first box and its lines. Reading and rebuilding has to be lossless, or
    // opening a conversation and pressing OK silently rewrites it.
    const MessageBoxes = require(path.join(editorRoot, 'src', 'utils', 'MessageBoxes.js'));
    const list = [
        { code: 101, indent: 0, parameters: ['Evil', 7, 0, 0, 'Coder'] },
        { code: 401, indent: 0, parameters: ['one'] },
        { code: 401, indent: 0, parameters: ['two'] },
        { code: 101, indent: 0, parameters: ['', 0, 1, 1, ''] },
        { code: 401, indent: 0, parameters: ['three'] }
    ];
    const run = MessageBoxes.collectRun(list, 0);
    assert.equal(run.count, list.length, 'the whole run is claimed');
    assert.deepEqual(MessageBoxes.buildCommands(run.boxes, 0), list);
});

test('Fadeout BGM and BGS are written in seconds, as the engine reads them', () => {
    // AudioManager.fadeOutBgm hands params[0] to WebAudio's
    // linearRampToValueAtTime, whose unit is seconds. The editor was
    // multiplying by 60, so a 1s fade was authored as a 60s fade.
    const source = fs.readFileSync(path.join(commandsDir, 'AudioCommandEditor.js'), 'utf8');
    assert.doesNotMatch(source, /parameters: \[60\]/, 'the default is no longer 60 frames');
    assert.doesNotMatch(source, /parseFloat\(value\) \* 60/, 'the save no longer scales');
    assert.doesNotMatch(source, /parameters\[0\] \|\| 60\) \/ 60/, 'the load no longer scales');
    assert.match(source, /parameters: \[1\]/);

    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    assert.match(core, /linearRampToValueAtTime\(0, currentTime \+ duration\)/,
        'the unit is Web Audio seconds');

    // Authored values are small second counts, never frame counts.
    for (const code of ['242', '246']) {
        const lengths = authored.commandParameterLengths[code];
        assert.deepEqual(lengths, [1], `code ${code} takes a single duration`);
    }
});

test('the command list shows the same fade duration the engine will use', () => {
    const listSource = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'), 'utf8');
    const at = listSource.indexOf('case 242:');
    const block = listSource.slice(at, at + 300);
    assert.doesNotMatch(block, /\/ 60/, 'no frames-to-seconds conversion remains');
    assert.match(block, /params\[0\] \?\? 1/);
});
