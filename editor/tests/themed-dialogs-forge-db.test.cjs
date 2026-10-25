/**
 * The Database pages and the Forge tools ask and tell through the editor's
 * themed dialog (RRDialog), never through the browser's alert / confirm /
 * prompt.
 *
 * A guard scans editor/src/database and editor/src/forge for a native dialog
 * call (the scanner is helpers/native-dialog-scan.cjs, shared with
 * themed-dialogs.test.cjs). A second scan checks that every question has its
 * answer waited for. The rest runs converted functions with a stubbed
 * RRDialog that answers yes, then no (and, where the function checks what it
 * asked about is still there, late), and checks what each answer did.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const srcRoot = path.resolve(__dirname, '..', 'src');
const read = relative => fs.readFileSync(path.join(srcRoot, relative), 'utf8');

/** A class from an editor source, with the globals it reads supplied by name. */
function loadClass(relative, className, globals = {}) {
    const names = Object.keys(globals);
    return new Function(...names, `${read(relative)}\n;return ${className};`)(...names.map(name => globals[name]));
}

/** An RRDialog that records every request and answers from `answers` ({ confirm, prompt }). */
function dialogStub(answers = {}) {
    const asked = [];
    return {
        asked,
        answers,
        confirm: async (message, options = {}) => { asked.push({ kind: 'confirm', message, options }); return !!answers.confirm; },
        alert: async (message, options = {}) => { asked.push({ kind: 'alert', message, options }); },
        prompt: async (message, options = {}) => { asked.push({ kind: 'prompt', message, options }); return answers.prompt === undefined ? null : answers.prompt; }
    };
}

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

const scan = require('./helpers/native-dialog-scan.cjs');
const { codeOnly, dialogCalls, answersWaited } = scan;
/** A function of the file's own named like a browser dialog counts too: these folders borrow none of the names. */
const nativeDialogCalls = source => scan.nativeDialogCalls(source, { ownFunctions: 'count' });

/** Every .js file under editor/src/<folder>, as paths relative to editor/src. */
function sourcesUnder(folder) {
    const found = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (entry.name.endsWith('.js')) found.push(path.relative(srcRoot, file).split(path.sep).join('/'));
        }
    };
    walk(path.join(srcRoot, folder));
    return found;
}

const FOLDERS = ['database', 'forge'];

test('the scanner finds a call, a window call and a local function that only shares the name', () => {
    const sample = [
        'if (confirm(text)) go();',
        '// alert("in a comment")',
        'const a = "alert(1)"; RRDialog.alert(x); this.prompt(y);',
        'window.prompt(label, value);',
        'const confirm = () => close(); okButton.addEventListener("click", () => { confirm(); });'
    ].join('\n');
    assert.deepEqual(nativeDialogCalls(sample).map(call => `${call.line}:${call.name}`), ['1:confirm', '4:prompt', '5:confirm']);
});

test('no Database page or Forge tool calls the browser\'s alert, confirm or prompt', () => {
    const offenders = [];
    let scanned = 0;
    for (const folder of FOLDERS) {
        for (const file of sourcesUnder(folder)) {
            scanned++;
            for (const call of nativeDialogCalls(read(file))) offenders.push(`${file}:${call.line}: ${call.text.slice(0, 120)}`);
        }
    }
    assert.ok(scanned > 100, `the Database and Forge sources were read (${scanned})`);
    assert.deepEqual(offenders, [], 'use RRDialog.alert / confirm / prompt (utils/Dialog.js)');
});

test('every question names itself and its action button; every notice and prompt has a title', () => {
    const problems = [];
    const counts = { confirm: 0, alert: 0, prompt: 0 };
    for (const folder of FOLDERS) {
        for (const file of sourcesUnder(folder)) {
            const source = read(file);
            for (const call of dialogCalls(source, 'confirm')) {
                counts.confirm++;
                if (!/\btitle:/.test(call.text)) problems.push(`${file}:${call.line}: a confirm with no title`);
                if (!/\bok:/.test(call.text)) problems.push(`${file}:${call.line}: a confirm whose button is a bare OK`);
            }
            for (const call of dialogCalls(source, 'prompt')) {
                counts.prompt++;
                if (!/\btitle:/.test(call.text)) problems.push(`${file}:${call.line}: a prompt with no title`);
            }
            for (const call of dialogCalls(source, 'alert')) {
                counts.alert++;
                // The row clipboard serves every page that has traits or effects: it is titled by its kind.
                if (!/\btitle:/.test(call.text) && file !== 'database/DatabaseRowClipboard.js') problems.push(`${file}:${call.line}: an alert with no title`);
            }
        }
    }
    assert.deepEqual(problems, []);
    assert.ok(counts.confirm >= 10 && counts.alert >= 60 && counts.prompt >= 5, `the dialogs were found (${JSON.stringify(counts)})`);
});

test('a question that destroys or overwrites is a danger question', () => {
    const danger = (file, phrase) => {
        const call = dialogCalls(read(file), 'confirm').find(entry => entry.text.includes(phrase));
        assert.ok(call, `${file}: the question "${phrase}"`);
        assert.match(call.text, /danger: true/, `${file}: "${phrase}" is a danger question`);
    };
    danger('database/DatabaseAnimationEditor.js', 'Remove frame');
    danger('database/DatabaseStructureEditor.js', 'Take away floors');
    danger('database/DatabaseUserInterfaceEditor.js', 'Replace every layer');
    danger('forge/CharacterGenerator/CharacterGenerator.js', 'Clear all painted zone edits');
    danger('forge/CharacterGenerator/CharacterGenerator.js', 'outfit library. Overwrite it?');
    danger('forge/CharacterGenerator/CharacterGenerator.js', 'hair library. Overwrite it?');
    danger('forge/CharacterGenerator/CharacterGenerator.js', 'already exists in this project. Overwrite it?');
    danger('forge/EffekseerGenerator/EffekseerGenerator.js', 'already exists in this project. Overwrite it?');
});

test('the dialog is loaded before the Database pages and the Forge tools', () => {
    const index = fs.readFileSync(path.join(srcRoot, '..', 'index.html'), 'utf8');
    const scripts = [...index.matchAll(/<script src="src\/([^"]+)"><\/script>/g)].map(match => match[1]);
    const dialog = scripts.indexOf('utils/Dialog.js');
    assert.ok(dialog >= 0, 'index.html loads utils/Dialog.js');
    const users = scripts.filter(script => /^(?:database|forge)\//.test(script) && /\bRRDialog\s*\./.test(codeOnly(read(script))));
    assert.ok(users.length >= 15, `the scripts that ask through it were found (${users.length})`);
    assert.deepEqual(users.filter(script => scripts.indexOf(script) < dialog), [], 'none of them is loaded ahead of it');
    // Every tool and page that asks is a script of the editor's one page: none runs in a page of its own.
    for (const folder of FOLDERS) {
        for (const file of sourcesUnder(folder)) {
            if (/\bRRDialog\s*\./.test(codeOnly(read(file)))) assert.ok(scripts.includes(file), `${file} is loaded by index.html`);
        }
    }
});

// ---------------------------------------------------------------------------
// The answer is waited for
// ---------------------------------------------------------------------------

const QUESTIONS = /RRDialog\.(?:confirm|prompt)\(/g;
// The functions that ask and resolve the answer for a caller that acts on it.
const ASKERS = /[\w$]+\.(?:_confirmSheetOverwrite|chooseQuestLog|askRemoveFrames)\(/g;

test('the scan tells an answer that is waited for from one that is dropped', () => {
    const sample = [
        'if (!(await RRDialog.confirm(text, { title }))) return;',
        'const typed = RRDialog.prompt(label, { title });',
        'return RRDialog.confirm(text, options);',
        'RRDialog.prompt(label, { title: pick(a, b) })',
        '    .then(value => use(value));',
        'if (!(this._confirmSheetOverwrite(outPath, name))) return;',
        'if (!(await editorSelf.askRemoveFrames(animation, selected))) return;',
        '// RRDialog.confirm(in a comment)'
    ].join('\n');
    assert.deepEqual(answersWaited(sample, QUESTIONS), { total: 4, dropped: [2] });
    assert.deepEqual(answersWaited(sample, ASKERS), { total: 2, dropped: [6] });
});

test('the answer scanner recognizes awaited dialogs through an IIFE root alias', () => {
    const sample = 'const name = safeName(await root.RRDialog.prompt(text));\nif (!await root.RRDialog.confirm(text)) return;\nroot.RRDialog.prompt(text);';
    assert.deepEqual(answersWaited(sample, QUESTIONS), { total: 3, dropped: [3] });
});

test('every question and prompt has its answer waited for, and so has every function that asks for its caller', () => {
    const dropped = [];
    let questions = 0, askers = 0;
    for (const folder of FOLDERS) {
        for (const file of sourcesUnder(folder)) {
            const source = read(file);
            const asked = answersWaited(source, QUESTIONS), through = answersWaited(source, ASKERS);
            questions += asked.total;
            askers += through.total;
            for (const line of asked.dropped) dropped.push(`${file}:${line}: the answer of a question or prompt is not waited for`);
            for (const line of through.dropped) dropped.push(`${file}:${line}: the answer of a function that asks is not waited for`);
        }
    }
    assert.deepEqual(dropped, []);
    assert.ok(questions >= 16 && askers >= 4, `the calls were found (${questions} questions and prompts, ${askers} through a function)`);
});

// ---------------------------------------------------------------------------
// Converted functions, answered yes and no
// ---------------------------------------------------------------------------

/** An animation editor, for the method that asks before it removes frames. */
function animationEditor(RRDialog) {
    const Editor = loadClass('database/DatabaseAnimationEditor.js', 'DatabaseAnimationEditor', { window: {}, RRDialog, require, console });
    return Object.create(Editor.prototype);
}

test('Animations: the selected frames are removed only when the question is answered Remove Frame', async () => {
    const four = () => ({ frames: [['a'], ['b'], ['c'], ['d']] });
    const no = dialogStub({ confirm: false });
    const kept = four();
    assert.equal(await animationEditor(no).askRemoveFrames(kept, new Set([1])), false);
    assert.equal(kept.frames.length, 4, 'declined: every frame stays');
    assert.equal(no.asked[0].message, 'Remove frame 2?');
    assert.deepEqual(no.asked[0].options, { title: 'Remove Frame', ok: 'Remove Frame', danger: true });

    const yes = dialogStub({ confirm: true });
    const one = four();
    assert.equal(await animationEditor(yes).askRemoveFrames(one, new Set([1])), true);
    assert.deepEqual(one.frames.map(frame => frame[0]), ['a', 'c', 'd']);

    const several = dialogStub({ confirm: true });
    const many = four();
    assert.equal(await animationEditor(several).askRemoveFrames(many, new Set([0, 3, 1])), true);
    assert.deepEqual(many.frames.map(frame => frame[0]), ['c']);
    assert.equal(several.asked[0].message, 'Remove 3 selected frames?');
    assert.deepEqual(several.asked[0].options, { title: 'Remove Frames', ok: 'Remove Frames', danger: true });

    // The button redraws the list only after frames were removed.
    assert.match(read('database/DatabaseAnimationEditor.js'),
        /if \(!\(await editorSelf\.askRemoveFrames\(animation, selectedFrameIndices\)\)\) return;\s+selectedFrameIndices\.clear\(\);/);
});

test('Animations: every frame at once is refused, and an answer for a list that changed removes nothing', async () => {
    const all = dialogStub({ confirm: true });
    const animation = { frames: [['a'], ['b']] };
    assert.equal(await animationEditor(all).askRemoveFrames(animation, new Set([0, 1])), false);
    assert.equal(animation.frames.length, 2);
    assert.deepEqual(all.asked.map(entry => entry.kind), ['alert'], 'a notice, and no question');
    assert.match(all.asked[0].message, /at least one frame must remain/);

    let answer;
    const late = { confirm: () => new Promise(resolve => { answer = resolve; }) };
    const changed = { frames: [['a'], ['b'], ['c']] };
    const pending = animationEditor(late).askRemoveFrames(changed, new Set([2]));
    changed.frames.shift();
    answer(true);
    assert.equal(await pending, false);
    assert.deepEqual(changed.frames.map(frame => frame[0]), ['b', 'c'], 'frame 3 of the old list is not taken from the new one');
});

/** A quest editor over a small store, with an importer that offers two quests (one already here). */
function questEditor(RRDialog, found = [{ key: 'Welcome', name: 'W' }, { key: 'Fresh', name: 'F' }]) {
    const QuestImporter = {
        SOURCES: { visustella: { label: 'VS' } },
        read: () => (found ? { quests: found.map(quest => Object.assign({}, quest)) } : null),
        visustellaKeyOf: quest => quest.key || 'ReactorQuest' + quest.id,
        uniqueKey: wanted => wanted
    };
    const Editor = loadClass('database/DatabaseQuestEditor.js', 'DatabaseQuestEditor',
        { window: {}, RRDialog, QuestImporter, rrEscapeHtml: value => String(value), console });
    const store = [null, { id: 1, key: 'Welcome', name: 'W' }];
    const opened = [];
    const manager = {
        getQuests: () => store.filter(Boolean),
        addQuest: record => { const quest = Object.assign({}, record, { id: store.length }); store.push(quest); return quest; }
    };
    const parent = { currentProject: { path: 'P' }, openDatabase: type => opened.push(type), showDatabaseDetail: quest => opened.push(quest.key) };
    return { editor: new Editor(manager, {}, null, parent), store, opened, parent };
}

test('Quests: an import adds the quests only when the question is answered Import', async () => {
    const no = dialogStub({ confirm: false });
    const declined = questEditor(no);
    assert.equal(await declined.editor.importFrom('visustella', 'Lead.'), false);
    assert.equal(declined.store.length, 2, 'declined: nothing was added');
    assert.deepEqual(declined.opened, []);
    assert.equal(no.asked.length, 1);
    assert.equal(no.asked[0].kind, 'confirm');
    assert.match(no.asked[0].message, /^Lead\. Import 1 quest\(s\) from VS\? 1 already here will be left alone\.$/);
    assert.deepEqual(no.asked[0].options, { title: 'Import Quests', ok: 'Import' });

    const yes = dialogStub({ confirm: true });
    const accepted = questEditor(yes);
    assert.equal(await accepted.editor.importFrom('visustella'), true);
    assert.deepEqual(accepted.store.slice(2).map(quest => quest.key), ['Fresh'], 'accepted: the quest this database lacked');
    assert.deepEqual(accepted.opened, ['quests', 'Fresh'], 'and the tab opens on it');
});

test('Quests: nothing to import is a notice, and the import resolves false after it', async () => {
    const dialog = dialogStub({ confirm: true });
    const { editor, store } = questEditor(dialog, [{ key: 'Welcome', name: 'W' }]);
    assert.equal(await editor.importFrom('visustella'), false);
    assert.deepEqual(dialog.asked.map(entry => entry.kind), ['alert'], 'no question when every quest is already here');
    assert.match(dialog.asked[0].message, /Every quest from VS is already here/);
    assert.equal(dialog.asked[0].options.title, 'Import Quests');
    assert.equal(store.length, 2);

    const missing = dialogStub({ confirm: true });
    assert.equal(await questEditor(missing, null).editor.importFrom('visustella'), false);
    assert.match(missing.asked[0].message, /VS is not in this project\./);
});

test('Quests: an answer that arrives after another project was opened imports nothing', async () => {
    let answer;
    const RRDialog = { confirm: () => new Promise(resolve => { answer = resolve; }), alert: async () => {} };
    const { editor, store, opened, parent } = questEditor(RRDialog);
    const pending = editor.importFrom('visustella');
    parent.currentProject = { path: 'Other' };
    answer(true);
    assert.equal(await pending, false);
    assert.equal(store.length, 2);
    assert.deepEqual(opened, []);
});

test('Quests: without the switch picker the number is asked through a themed prompt', async () => {
    const dialog = dialogStub({ prompt: '12' });
    const { editor } = questEditor(dialog);
    const picked = [];
    editor.pickSwitchOrVariable('switch', 3, id => picked.push(id));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(picked, [12]);
    assert.equal(dialog.asked[0].kind, 'prompt');
    assert.deepEqual(dialog.asked[0].options, { title: 'Switch', value: '3' });

    const cancelled = dialogStub();
    const other = questEditor(cancelled).editor;
    other.pickSwitchOrVariable('variable', 0, id => picked.push(id));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(picked, [12], 'a cancelled prompt changes nothing');
    assert.equal(cancelled.asked[0].options.title, 'Variable');
});

/** A structure editor over a plan of `height` floors, floor 2 holding a piece. */
function structureEditor(RRDialog, height = 3) {
    const Editor = loadClass('database/DatabaseStructureEditor.js', 'DatabaseStructureEditor', { window: {}, RRDialog, console });
    const editor = Object.create(Editor.prototype);
    const plan = { height, occupied: new Set([2]) };
    const calls = [];
    Object.assign(editor, {
        current: { plan },
        _paint: { floor: 2 },
        floorsApi: () => ({
            isDescribed: () => false,
            hasPieces: (target, floor) => target.occupied.has(floor),
            setFloors: (target, count) => { target.height = count; }
        }),
        _floorCount: target => target.height,
        _t: (text, params = {}) => Object.entries(params).reduce((value, [key, replacement]) => value.split(`{${key}}`).join(String(replacement)), text),
        pushHistory: () => calls.push('history'),
        markDirty: () => calls.push('dirty'),
        renderBar: () => calls.push('bar'),
        renderSide: () => calls.push('side')
    });
    return { editor, plan, calls };
}

test('Structures: floors that hold pieces come off only when the question is answered Remove Floors', async () => {
    const no = dialogStub({ confirm: false });
    const kept = structureEditor(no);
    await kept.editor.setFloorCount(1);
    assert.equal(kept.plan.height, 3, 'declined: the floors stay');
    assert.deepEqual(kept.calls, ['bar'], 'and the height field is drawn again with the floors it has');
    assert.equal(no.asked[0].message, 'Take away floors 2 to 3 and everything on them?');
    assert.deepEqual(no.asked[0].options, { title: 'Remove Floors', ok: 'Remove Floors', danger: true });

    const yes = dialogStub({ confirm: true });
    const removed = structureEditor(yes);
    await removed.editor.setFloorCount(1);
    assert.equal(removed.plan.height, 1, 'accepted: the floors are gone');
    assert.deepEqual(removed.calls, ['history', 'dirty', 'bar', 'side']);
    assert.equal(removed.editor._paint.floor, 0, 'the floor being painted is one that is left');

    // One floor is asked about as one floor.
    const single = dialogStub({ confirm: true });
    const top = structureEditor(single);
    await top.editor.setFloorCount(2);
    assert.equal(single.asked[0].message, 'Take away floor 3 and everything on it?');
    assert.deepEqual(single.asked[0].options, { title: 'Remove Floor', ok: 'Remove Floor', danger: true });
    assert.equal(top.plan.height, 2);
});

test('Structures: adding a floor, or taking off an empty one, asks nothing and is done when the call returns', async () => {
    const dialog = dialogStub({ confirm: false });
    const { editor, plan, calls } = structureEditor(dialog);
    // The Add Floor button reads the plan straight after the call.
    editor.setFloorCount(4);
    assert.equal(plan.height, 4, 'done before anything is awaited');
    plan.occupied.clear();
    await editor.setFloorCount(2);
    assert.equal(plan.height, 2);
    assert.deepEqual(dialog.asked, []);
    assert.deepEqual(calls.filter(call => call === 'history').length, 2);
});

test('Structures: an answer that arrives after another structure was opened changes neither', async () => {
    let answer;
    const RRDialog = { confirm: () => new Promise(resolve => { answer = resolve; }) };
    const { editor, plan, calls } = structureEditor(RRDialog);
    const pending = editor.setFloorCount(1);
    const other = { height: 5, occupied: new Set() };
    editor.current = { plan: other };
    answer(true);
    await pending;
    assert.equal(plan.height, 3);
    assert.equal(other.height, 5);
    assert.deepEqual(calls, []);
});

test('Structures: an answer for floors that are no longer all there removes nothing', async () => {
    let answer;
    const RRDialog = { confirm: () => new Promise(resolve => { answer = resolve; }) };
    const { editor, plan, calls } = structureEditor(RRDialog);
    const pending = editor.setFloorCount(1);
    plan.height = 2;
    answer(true);
    await pending;
    assert.equal(plan.height, 2, 'the floors are left as they now are');
    assert.deepEqual(calls, ['bar'], 'and only the height field is drawn again');
});

/** A user interface editor on a record with `nodes` layers; applyStockLayout is watched, not run. */
function interfaceEditor(RRDialog, nodes) {
    const Editor = loadClass('database/DatabaseUserInterfaceEditor.js', 'DatabaseUserInterfaceEditor', { window: {}, RRDialog, console });
    const editor = Object.create(Editor.prototype);
    const applied = [];
    Object.assign(editor, {
        current: { id: 4, nodes },
        _t: text => text,
        stockLayoutKinds: () => [['item', 'Items']],
        applyStockLayout: kind => { applied.push(kind); return true; }
    });
    return { editor, applied };
}

test('User Interfaces: a stock layout replaces layers only when the question is answered Replace', async () => {
    const no = dialogStub({ confirm: false });
    const declined = interfaceEditor(no, [{ id: 1 }]);
    assert.equal(await declined.editor.askStockLayout('item'), false);
    assert.deepEqual(declined.applied, []);
    assert.equal(no.asked[0].message, 'Replace every layer with the Items layout?');
    assert.deepEqual(no.asked[0].options, { title: 'Replace Layers', ok: 'Replace', danger: true });

    const yes = dialogStub({ confirm: true });
    const accepted = interfaceEditor(yes, [{ id: 1 }]);
    assert.equal(await accepted.editor.askStockLayout('item'), true);
    assert.deepEqual(accepted.applied, ['item']);

    const empty = dialogStub({ confirm: false });
    const fresh = interfaceEditor(empty, []);
    assert.equal(await fresh.editor.askStockLayout('item'), true, 'an interface with no layers has nothing to lose');
    assert.deepEqual(empty.asked, []);
    assert.deepEqual(fresh.applied, ['item']);
});

test('User Interfaces: an answer that arrives after another interface was opened replaces nothing', async () => {
    let answer;
    const RRDialog = { confirm: () => new Promise(resolve => { answer = resolve; }) };
    const { editor, applied } = interfaceEditor(RRDialog, [{ id: 1 }]);
    const pending = editor.askStockLayout('item');
    editor.current = { id: 9, nodes: [{ id: 2 }] };
    answer(true);
    assert.equal(await pending, false);
    assert.deepEqual(applied, []);
});

test('User Interfaces: the menu asks first, and applying a layout itself asks nothing', () => {
    const source = read('database/DatabaseUserInterfaceEditor.js');
    assert.match(source, /this\.askStockLayout\(button\.dataset\.stockLayout\);/);
    const at = source.indexOf('    applyStockLayout(kind) {');
    const body = source.slice(at, source.indexOf('\n    }\n', at));
    assert.doesNotMatch(body, /RRDialog|confirm/);
});

/** A 3D Models editor whose project holds two media files and no picker to choose them with. */
function modelEditor(RRDialog) {
    class MediaSurfaceEditor { mediaFiles() { return [{ relativePath: 'intro.mp4' }, { relativePath: 'sign.png' }]; } }
    const Editor = loadClass('database/Database3DEditor.js', 'Database3DEditor', { window: {}, RRDialog, MediaSurfaceEditor, require, console });
    const editor = Object.create(Editor.prototype);
    const calls = [];
    Object.assign(editor, {
        _project: () => ({ path: 'P' }),
        _k: key => key,
        _t: (text, params = {}) => Object.entries(params).reduce((value, [key, replacement]) => value.split(`{${key}}`).join(String(replacement)), text),
        _modelRecordStatus: message => calls.push('status: ' + message),
        _playEffectPreview: () => calls.push('play'),
        renderEffectForm: () => calls.push('form')
    });
    return { editor, calls };
}

test('3D Models: without the picker a media file is asked by name, and only a file of the project is taken', async () => {
    const picked = [];
    const named = dialogStub({ prompt: 'sign.png' });
    await modelEditor(named).editor._pickMediaFile('', file => picked.push(file));
    assert.deepEqual(picked, ['sign.png']);
    assert.equal(named.asked[0].kind, 'prompt');
    assert.deepEqual(named.asked[0].options, { title: 'menu.models3d', value: 'intro.mp4' });

    for (const answer of [null, 'missing.mp4']) {
        await modelEditor(dialogStub({ prompt: answer })).editor._pickMediaFile('intro.mp4', file => picked.push(file));
    }
    assert.deepEqual(picked, ['sign.png'], 'a cancelled prompt or a name the project lacks picks nothing');
});

test('3D Models: a video named for an effect that was closed meanwhile is not applied', async () => {
    let answer;
    const { editor, calls } = modelEditor({ prompt: () => new Promise(resolve => { answer = resolve; }) });
    const work = { video: { file: '' } };
    editor._effectWork = work;
    const pending = editor._pickEffectVideo();
    editor._effectWork = { video: { file: '' } };
    answer('intro.mp4');
    await pending;
    assert.equal(work.video.file, '');
    assert.deepEqual(calls, []);

    // The same answer for the effect still being edited is taken.
    const kept = modelEditor(dialogStub({ prompt: 'intro.mp4' }));
    kept.editor._effectWork = { video: { file: '' } };
    await kept.editor._pickEffectVideo();
    assert.equal(kept.editor._effectWork.video.file, 'intro.mp4');
    assert.deepEqual(kept.calls, ['play', 'form']);
});

test('3D Models: a save that keeps failing raises one notice at a time', async () => {
    const notices = [], close = [];
    const RRDialog = { alert: (message, options) => new Promise(resolve => { notices.push({ message, options }); close.push(resolve); }) };
    const { editor, calls } = modelEditor(RRDialog);
    for (let i = 0; i < 3; i++) editor._reportModelSaveError(new Error('EACCES'));
    assert.equal(notices.length, 1, 'three failures while the first notice is unread: one notice');
    assert.deepEqual(notices[0], { message: 'Save failed: EACCES', options: { title: 'menu.models3d', kind: 'error' } });
    assert.deepEqual(calls, Array(3).fill('status: Save failed: EACCES'), 'the status line has every one');
    close[0]();
    await new Promise(resolve => setImmediate(resolve));
    editor._reportModelSaveError(new Error('EACCES'));
    assert.equal(notices.length, 2, 'a failure after the notice was read is told again');
});

/** A Character Generator whose tabs hold a sheet named Hero, in a project folder of its own. */
function characterGenerator(RRDialog, t) {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-themed-cg-'));
    t.after(() => fs.rmSync(project, { recursive: true, force: true }));
    const canvas = () => ({ getContext: () => ({ putImageData() {}, drawImage() {} }), toDataURL: () => 'data:image/png;base64,AQID' });
    const registry = [];
    const Generator = loadClass('forge/CharacterGenerator/CharacterGenerator.js', 'CharacterGenerator',
        { window: { addEventListener() {}, removeEventListener() {} }, document: { createElement: canvas }, require, RRDialog, RR_CHARACTER_REGISTRY: registry,
            CharacterRenderer: { render: () => ({}) }, console: { error() {}, log() {}, warn() {} } });
    const gen = new Generator();
    // The line under the Outfit Forge and the Hair Forge.
    const status = { textContent: '', style: {} };
    gen.root = {
        querySelector(selector) {
            if (selector === '.rr-cg-name-input' || selector === '.rr-cgp-name') return { value: 'Hero' };
            if (selector === '.rr-cg-sheet-canvas') return canvas();
            if (selector === '.rr-forge-status' || selector === '.rr-hair-status') return status;
            return null;
        }
    };
    gen._syncProjectPath = () => project;
    const outPath = path.join(project, 'img', 'characters', '$Hero.png');
    return { gen, project, outPath, status, registry };
}

test('Character Generator: a sheet that exists is overwritten only on Overwrite, and the question names the file', async t => {
    const no = dialogStub({ confirm: false });
    const kept = characterGenerator(no, t);
    fs.mkdirSync(path.dirname(kept.outPath), { recursive: true });
    fs.writeFileSync(kept.outPath, 'original');
    await kept.gen._savePartsSheet();
    assert.equal(fs.readFileSync(kept.outPath, 'utf8'), 'original', 'declined: the old sheet stays');
    assert.deepEqual(no.asked.map(entry => entry.kind), ['confirm'], 'and nothing is reported as saved');
    assert.equal(no.asked[0].message, 'img/characters/$Hero.png already exists in this project. Overwrite it?');
    assert.deepEqual(no.asked[0].options, { title: 'Overwrite File', ok: 'Overwrite', danger: true });

    const yes = dialogStub({ confirm: true });
    const replaced = characterGenerator(yes, t);
    fs.mkdirSync(path.dirname(replaced.outPath), { recursive: true });
    fs.writeFileSync(replaced.outPath, 'original');
    await replaced.gen._savePartsSheet();
    assert.deepEqual([...fs.readFileSync(replaced.outPath)], [1, 2, 3], 'accepted: replaced');
    assert.deepEqual(yes.asked.map(entry => entry.kind), ['confirm', 'alert']);
    assert.match(yes.asked[1].message, /^Saved \$Hero\.png to img\/characters\/$/);
});

test('Character Generator: the Procedural tab overwrites a sheet only on Overwrite', async t => {
    const sheet = answer => {
        const dialog = dialogStub({ confirm: answer });
        const made = characterGenerator(dialog, t);
        Object.assign(made.gen, { frameWidth: 4, frameHeight: 4, _buildActiveParts: () => [] });
        fs.mkdirSync(path.dirname(made.outPath), { recursive: true });
        fs.writeFileSync(made.outPath, 'original');
        return { dialog, gen: made.gen, outPath: made.outPath };
    };
    const kept = sheet(false);
    await kept.gen._saveProceduralSheet();
    assert.equal(fs.readFileSync(kept.outPath, 'utf8'), 'original', 'declined: the old sheet stays');
    assert.deepEqual(kept.dialog.asked.map(entry => entry.kind), ['confirm'], 'and nothing is reported as saved');
    assert.equal(kept.dialog.asked[0].message, 'img/characters/$Hero.png already exists in this project. Overwrite it?');
    assert.deepEqual(kept.dialog.asked[0].options, { title: 'Overwrite File', ok: 'Overwrite', danger: true });

    const replaced = sheet(true);
    await replaced.gen._saveProceduralSheet();
    assert.deepEqual([...fs.readFileSync(replaced.outPath)], [1, 2, 3], 'accepted: replaced');
    assert.deepEqual(replaced.dialog.asked.map(entry => entry.kind), ['confirm', 'alert']);
});

/** Set a generator up so its Outfit Forge and its Hair Forge each make a small part named Cloak; resolves the two files. */
function partForge(made) {
    const result = { palette: { a: { hex: '#000000', material: '' } }, sheet: [[['a']]] };
    Object.assign(made.gen, {
        characterStyle: 'test',
        _projectPartDescriptors: new Set(),
        _isBuiltInPartId: () => false,
        _formatTemplateRowLiteral: row => JSON.stringify(row),
        _outfitEngine: () => ({ generateOutfit: () => result }),
        _forgeBodyTemplate: () => ({}),
        _forgeConfig: () => ({ name: 'Cloak' }),
        _forgeSyncZoneLayers() {},
        _forgeTags: () => [],
        _forgeEngineConfig: () => ({}),
        _hairEngine: () => ({ generateHair: () => result }),
        _hairBodyTemplate: () => ({}),
        _hairConfig: () => ({ name: 'Cloak' }),
        _hairEngineConfig: () => ({ tags: [] })
    });
    const parts = path.join(made.project, 'forge', 'character_generator', 'styles', 'test', 'parts');
    return { outfit: path.join(parts, 'full outfits', 'full-outfits-test-cloak.js'), hair: path.join(parts, 'hair', 'hair-test-cloak.js') };
}

for (const [what, save, kind, question] of [
    ['an outfit part', '_saveForgeOutfit', 'outfit', "full-outfits-test-cloak.js already exists in this project's outfit library. Overwrite it?"],
    ['a hair part', '_saveHairPart', 'hair', "hair-test-cloak.js already exists in this project's hair library. Overwrite it?"]
]) {
    test(`Character Generator: ${what} that exists is overwritten only on Overwrite, and a declined save says so`, async t => {
        const existing = answer => {
            const dialog = dialogStub({ confirm: answer });
            const made = characterGenerator(dialog, t);
            const file = partForge(made)[kind];
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, 'original');
            made.status.textContent = 'Saved earlier';
            return { dialog, file, gen: made.gen, status: made.status, registry: made.registry };
        };
        const kept = existing(false);
        await kept.gen[save]();
        assert.equal(fs.readFileSync(kept.file, 'utf8'), 'original', 'declined: the old part stays');
        assert.equal(kept.dialog.asked[0].message, question);
        assert.deepEqual(kept.dialog.asked[0].options, { title: 'Overwrite File', ok: 'Overwrite', danger: true });
        assert.equal(kept.status.textContent, 'Save canceled', 'the line stops saying Saved');
        assert.equal(kept.registry.length, 0, 'and the part is not registered');

        const replaced = existing(true);
        await replaced.gen[save]();
        assert.match(fs.readFileSync(replaced.file, 'utf8'), /^\/\/ Procedurally generated (?:outfit|hair) "Cloak"/, 'accepted: replaced');
        assert.match(replaced.status.textContent, /^Saved “Cloak”/);
        assert.equal(replaced.registry.length, 1);
    });
}

test('Character Generator: the Import Parts summary is one notice after the loop, with the files that failed first', async t => {
    const importer = dialog => {
        const { gen } = characterGenerator(dialog, t);
        Object.assign(gen, {
            characterStyle: 'test', activePartIds: new Set(), activeLayerOrder: [], _projectPartDescriptors: new Set(),
            _requireProjectPath: gen._syncProjectPath,
            _setTemplateStatus() {}, _normalizeAllTemplates() {}, _render() {},
            _isBuiltInPartId: () => false,
            _formatPartDescriptorJs: () => '/* a part */',
            _imageFileToAsciiTemplate: async file => { if (/\.txt$/.test(file.name)) throw new Error('not a picture'); return { palette: {} }; }
        });
        return gen;
    };
    const details = message => { const lines = message.split('\n'); return lines.slice(lines.findIndex(line => /^[✗✓]/.test(line))); };

    const mixed = dialogStub();
    await importer(mixed)._bulkImportFiles([{ name: 'bob.png' }, { name: 'notes.txt' }, { name: 'braid.png' }], 'hair');
    assert.equal(mixed.asked.length, 1, 'one notice');
    assert.deepEqual(mixed.asked[0].options, { title: 'Import Parts', kind: 'warning' });
    assert.equal(mixed.asked[0].message.split('\n')[0], 'Bulk import complete: 2 succeeded, 1 failed');
    assert.deepEqual(details(mixed.asked[0].message), ['✗ notes.txt: not a picture', '', '✓ bob.png → hair-test-bob', '✓ braid.png → hair-test-braid']);

    const clean = dialogStub();
    await importer(clean)._bulkImportFiles([{ name: 'bob.png' }], 'hair');
    assert.deepEqual(clean.asked[0].options, { title: 'Import Parts', kind: 'info' });
    assert.deepEqual(details(clean.asked[0].message), ['✓ bob.png → hair-test-bob']);
});

test('Character Generator: a new sheet is written without a question, and a missing name is a notice', async t => {
    const dialog = dialogStub({ confirm: false });
    const { gen, outPath } = characterGenerator(dialog, t);
    await gen._savePartsSheet();
    assert.deepEqual([...fs.readFileSync(outPath)], [1, 2, 3]);
    assert.deepEqual(dialog.asked.map(entry => entry.kind), ['alert']);

    const unnamed = dialogStub();
    const other = characterGenerator(unnamed, t);
    other.gen.root = { querySelector: () => ({ value: '  ' }) };
    await other.gen._savePartsSheet();
    assert.equal(fs.existsSync(other.outPath), false);
    assert.equal(unnamed.asked[0].message, 'Enter a name for the character sheet.');
    assert.deepEqual(unnamed.asked[0].options, { title: 'Character Generator', kind: 'warning' });
});

test('Character Generator: bulk import asks its category through a themed prompt, and Cancel imports nothing', async t => {
    const cancelled = dialogStub();
    const { gen } = characterGenerator(cancelled, t);
    const status = [];
    gen._setTemplateStatus = text => status.push(text);
    await gen._openBulkImportChooser();
    assert.equal(cancelled.asked[0].kind, 'prompt');
    assert.match(cancelled.asked[0].message, /^Category for these parts \(e\.g\. hair, clothing, accessory\):$/);
    assert.deepEqual(cancelled.asked[0].options, { title: 'Import Parts', value: 'hair', ok: 'Choose Files' });
    assert.deepEqual(status, ['Bulk import cancelled.']);
});

/** An Effekseer generator reduced to its preset store. */
function effekseerGenerator(RRDialog) {
    const Generator = loadClass('forge/EffekseerGenerator/EffekseerGenerator.js', 'EffekseerGenerator', { window: {}, RRDialog, console });
    const gen = Object.create(Generator.prototype);
    const recipe = { id: 'fire' };
    const store = {};
    const said = [];
    Object.assign(gen, {
        _recipe: () => recipe,
        _params: () => ({ size: 3 }),
        _loadPresets: () => JSON.parse(JSON.stringify(store)),
        _writePresets: all => { Object.assign(store, all); return true; },
        _refreshPresetList: name => said.push('list:' + name),
        _status: text => said.push(text)
    });
    return { gen, store, said };
}

test('Effect Generator: a preset is saved under the name typed, and Cancel or an empty name saves nothing', async () => {
    const named = dialogStub({ prompt: '  Big Fire ' });
    const saved = effekseerGenerator(named);
    await saved.gen._savePreset();
    assert.deepEqual(saved.store, { fire: { 'Big Fire': { size: 3 } } });
    assert.deepEqual(saved.said, ['list:Big Fire', 'efk.presetSaved "Big Fire"']);
    assert.equal(named.asked[0].kind, 'prompt');
    assert.equal(named.asked[0].message, 'efk.presetName');
    assert.deepEqual(named.asked[0].options, { title: 'Save Preset', value: '', ok: 'Save' });

    for (const answer of [null, '   ']) {
        const dialog = dialogStub({ prompt: answer });
        const none = effekseerGenerator(dialog);
        await none.gen._savePreset();
        assert.deepEqual(none.store, {}, `nothing saved for ${JSON.stringify(answer)}`);
        assert.deepEqual(none.said, []);
    }
});

test('Effect Generator: a name typed after another recipe was opened saves no preset', async () => {
    let answer;
    const { gen, store, said } = effekseerGenerator({ prompt: () => new Promise(resolve => { answer = resolve; }) });
    const pending = gen._savePreset();
    gen._recipe = () => ({ id: 'ice' });
    answer('Big Fire');
    await pending;
    assert.deepEqual(store, {});
    assert.deepEqual(said, []);
});

/** An Effekseer generator ready to export an effect named Fire into a project folder of its own. */
function effectExport(RRDialog, t) {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-themed-efk-'));
    t.after(() => fs.rmSync(project, { recursive: true, force: true }));
    const Generator = loadClass('forge/EffekseerGenerator/EffekseerGenerator.js', 'EffekseerGenerator', { window: {}, RRDialog, require, console: { error() {} } });
    const gen = Object.create(Generator.prototype);
    const said = [];
    Object.assign(gen, {
        projectController: { getCurrentProject: () => ({ path: project }) },
        contentEl: { querySelector: () => ({ value: 'Fire' }) },
        _recipe: () => ({ id: 'fire' }),
        _stack: [],
        _lastComposed: null,
        _buildBytes: () => new Uint8Array([1, 2, 3]),
        _userTextMap: () => new Map(),
        _status: text => said.push(text)
    });
    return { gen, said, file: path.join(project, 'effects', 'Fire.efkefc') };
}

test('Effect Generator: an effect that exists is overwritten only on Overwrite, and a declined export says so', async t => {
    const existing = answer => {
        const dialog = dialogStub({ confirm: answer });
        const made = effectExport(dialog, t);
        fs.mkdirSync(path.dirname(made.file), { recursive: true });
        fs.writeFileSync(made.file, 'original');
        return { dialog, ...made };
    };
    const kept = existing(false);
    await kept.gen._export();
    assert.equal(fs.readFileSync(kept.file, 'utf8'), 'original', 'declined: the old effect stays');
    assert.equal(kept.dialog.asked[0].message, 'effects/Fire.efkefc already exists in this project. Overwrite it?');
    assert.deepEqual(kept.dialog.asked[0].options, { title: 'Overwrite File', ok: 'Overwrite', danger: true });
    assert.deepEqual(kept.said, ['Export canceled'], 'the line does not go on saying Exported');

    const replaced = existing(true);
    await replaced.gen._export();
    assert.deepEqual([...fs.readFileSync(replaced.file)], [1, 2, 3], 'accepted: replaced');
    assert.deepEqual(replaced.said, ['efk.exported effects/Fire.efkefc']);

    // A new effect is written without a question.
    const fresh = dialogStub({ confirm: false });
    const made = effectExport(fresh, t);
    await made.gen._export();
    assert.deepEqual([...fs.readFileSync(made.file)], [1, 2, 3]);
    assert.deepEqual(fresh.asked, []);
});

test('Project Tools: a tool runs only when the question is answered Run Tool', async () => {
    const tools = (RRDialog) => {
        const Tools = loadClass('forge/ProjectTools/ProjectTools.js', 'ProjectTools', { window: { I18n: null }, RRDialog, require, console });
        const host = new Tools();
        const opened = [];
        host._openTool = tool => opened.push(tool.relPath);
        return { host, opened };
    };
    const no = dialogStub({ confirm: false });
    const declined = tools(no);
    await declined.host._confirmAndOpen({ name: 'Hitbox', relPath: 'forge/tools/Hitbox.html' });
    assert.deepEqual(declined.opened, []);
    assert.match(no.asked[0].message, /^Run this project tool\?\n\nforge\/tools\/Hitbox\.html\n\n/);
    assert.deepEqual(no.asked[0].options, { title: 'Run Project Tool', ok: 'Run Tool' });

    const yes = dialogStub({ confirm: true });
    const accepted = tools(yes);
    await accepted.host._confirmAndOpen({ name: 'Hitbox', relPath: 'forge/tools/Hitbox.html' });
    assert.deepEqual(accepted.opened, ['forge/tools/Hitbox.html']);
});

test('Battle Test: an empty party is refused with a themed notice and nothing is launched', async () => {
    const dialog = dialogStub();
    const Modal = loadClass('database/BattleTestConfigModal.js', 'BattleTestConfigModal', { window: {}, RRDialog: dialog, require, console });
    const actors = [{ id: 1, name: 'Hero' }];
    const system = { testBattlers: [{ actorId: 0, level: 1, equips: [] }] };
    const launched = [];
    const manager = { data: { actors, system }, getSystem: () => system, getActors: () => actors, getActor: id => actors.find(actor => actor.id === id) || null };
    const modal = new Modal(manager, { path: '/proj' }, 1, '', '', { battleTest: target => launched.push(target) });
    await modal.launch();
    assert.deepEqual(launched, []);
    assert.equal(dialog.asked.length, 1);
    assert.equal(dialog.asked[0].message, 'Please select at least one party member for the battle test.');
    assert.deepEqual(dialog.asked[0].options, { title: 'Battle Test Configuration', kind: 'warning' });
});

test('the pickers\' own accept functions do not borrow the browser dialog\'s name', () => {
    for (const file of ['database/AnimationPickerModal.js', 'database/PassiveStatesSection.js', 'database/DatabaseTilesetEditor.js', 'database/DatabaseQuestEditor.js']) {
        assert.doesNotMatch(codeOnly(read(file)), /\bconst (?:confirm|alert|prompt)\b/, file);
    }
});

test('the new titles and buttons are translated in every language', () => {
    const vm = require('node:vm');
    const sandbox = {
        window: { dispatchEvent() {} },
        document: { readyState: 'complete', documentElement: {}, addEventListener() {}, querySelectorAll() { return []; } },
        localStorage: { getItem() { return null; }, setItem() {} },
        CustomEvent: class {}
    };
    sandbox.window.document = sandbox.document;
    sandbox.window.localStorage = sandbox.localStorage;
    const source = ['I18nDeepTranslations.js', 'I18nReviewedTranslations.js', 'I18nManager.js']
        .map(file => (fs.existsSync(path.join(srcRoot, file)) ? read(file) : '')).join('\n');
    const text = vm.runInNewContext(`${source}\nRR_TEXT_TRANSLATIONS;`, sandbox);
    const locales = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];
    const phrases = ['Remove Frame', 'Remove Frames', 'Remove frame {number}?', 'Remove {count} selected frames?', 'Remove Floor',
        'Take away floor {floor} and everything on it?', 'Overwrite', 'Overwrite File', 'Replace Layers', 'Remove Floors', 'Clear Zone Edits',
        'Run Project Tool', 'Run Tool', 'Save Tool Changes', 'Import Parts', 'Choose Files',
        '{file} already exists in this project. Overwrite it?', 'Save Preset', 'Export canceled', 'Save canceled'];
    const missing = [];
    for (const locale of locales) {
        for (const phrase of phrases) {
            const value = text[locale] && text[locale][phrase];
            if (!value || value === phrase) missing.push(`${locale}: ${phrase}`);
        }
    }
    assert.deepEqual(missing, []);
    // A placeholder is kept, once, in every language.
    for (const locale of locales) {
        for (const phrase of phrases) {
            const names = value => (value.match(/\{[^{}]+\}/g) || []).sort().join();
            assert.equal(names(text[locale][phrase]), names(phrase), `${locale}: the placeholders of "${phrase}"`);
        }
    }
    // An animation frame, not a picture frame.
    assert.equal(text.es['Remove Frame'], 'Quitar fotograma');
    assert.equal(text.ru['Remove Frame'], 'Удалить кадр');
    // The Animations page says one word for a frame: in its list, in its counter and in the question.
    for (const locale of locales) {
        const word = text[locale].Frame;
        assert.equal(`${word}:`, text[locale]['Frame:'], `${locale}: the frame list and the counter`);
        assert.ok(text[locale]['Remove frame {number}?'].toLowerCase().includes(word.slice(0, 5).toLowerCase()), `${locale}: the question says "${word}"`);
        // The heading over the list says it too.
        const counted = text[locale]['Frames:'].replace(/\s*[:：]\s*$/, '');
        assert.ok(text[locale].Frames.toLowerCase().includes(counted.slice(0, 5).toLowerCase()), `${locale}: the Frames heading says "${counted}"`);
    }
    // The overwrite questions read as a sentence about the file: no fragment is glued to a path any more.
    for (const file of ['forge/CharacterGenerator/CharacterGenerator.js', 'forge/EffekseerGenerator/EffekseerGenerator.js']) {
        assert.doesNotMatch(read(file), /['"`(]already exists in this project\. Overwrite it\?/, file);
    }
});

test('Animations: the Delete key asks as the Remove Frame button does, and the Frames number follows the list', () => {
    const source = read('database/DatabaseAnimationEditor.js');
    const key = source.slice(source.indexOf("if (e.key === 'Delete' && selectedFrameIndices.size > 0) {"));
    const branch = key.slice(0, key.indexOf("} else if (isCtrl && e.key.toLowerCase() === 'c'"));
    assert.match(branch, /editorSelf\.askRemoveFrames\(animation, selectedFrameIndices\)\.then\(removed => \{\s+if \(!removed\) return;/,
        'the key goes through the question');
    assert.equal((branch.match(/frames\.splice/g) || []).length, 0, 'the frames are removed by the function that asked');
    // One number, two readouts: "Frame: 1 / 29" over the preview and "Frames" under Properties.
    assert.match(source, /id="animation-frame-total">\$\{animation\.frames \? animation\.frames\.length : 0\}</);
    const counter = source.slice(source.indexOf('const updateFrameCounter = () => {'));
    assert.match(counter.slice(0, counter.indexOf('frameList.addEventListener')),
        /getElementById\('animation-frame-total'\);\s+if \(frameTotal\) frameTotal\.textContent = String\(animation\.frames\.length\);/);
});
