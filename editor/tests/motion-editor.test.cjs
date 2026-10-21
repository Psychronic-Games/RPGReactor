/**
 * The Motion editor: every pose rule sharing a name edited as one motion,
 * saved back as the same rules the game plays.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const RRMotionEditor = require('../src/database/MotionEditor.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const hostWith = animations => {
    const host = {
        rawAnimations: JSON.parse(JSON.stringify(animations)),
        partNames: ['Head', 'LeftUpperArm'],
        saved: 0,
        _t: text => text,
        saveRules() { this.saved++; },
        renderRuleList() {},
        _sim: { action: null },
        _detail: null
    };
    return host;
};

test('a motion opens as one track per part and saves back unchanged', () => {
    const wave = [
        { name: 'Wave', part: 'RightUpperArm', type: 'pose', trigger: 'action', period: 45, keys: [{ at: 0.15, rotate: [-10, 0, -120], move: [0, 0, 0] }, { at: 0.85, rotate: [-10, 0, -120], move: [0, 0, 0] }] },
        { name: 'Idle', part: '', type: 'spin', trigger: 'always', speed: 90 },
        { name: 'Wave', part: 'Head', type: 'pose', trigger: 'action', period: 45, keys: [{ at: 0.5, rotate: [0, -8, 0], move: [0, 0, 0] }], effects: [{ at: 0.5, se: { name: 'Cursor1' } }] }
    ];
    const host = hostWith(wave);
    const editor = new RRMotionEditor(host);
    editor.open('Wave');
    assert.equal(editor.motion.frames, 90);
    assert.deepEqual(editor.motion.tracks.map(t => t.part), ['RightUpperArm', 'Head']);
    editor.commit();
    assert.equal(host.saved, 1);
    // Positions and every other rule are kept, and fields the editor does not own ride along.
    assert.deepEqual(host.rawAnimations.map(r => r.name), ['Wave', 'Wave', 'Idle']);
    assert.deepEqual(host.rawAnimations[1].effects, wave[2].effects);
    assert.deepEqual(host.rawAnimations[0].keys, wave[0].keys);
});

test('renaming, retiming and a stance write every part of the motion', () => {
    const host = hostWith([
        { name: 'Guard', part: 'LeftUpperArm', type: 'pose', trigger: 'action', period: 15, hold: true, rotate: [-40, 0, 20], move: [0, 0, 0] },
        { name: 'Guard', part: 'Head', type: 'pose', trigger: 'action', period: 15, hold: true, rotate: [5, 0, 0], move: [0, 0, 0] }
    ]);
    const editor = new RRMotionEditor(host);
    editor.open('Guard');
    assert.equal(editor.motion.hold, true);
    editor.motion.name = 'Block';
    editor.motion.frames = 20;
    editor.commit();
    assert.deepEqual(host.rawAnimations.map(r => [r.name, r.period, r.hold, r.rotate]), [['Block', 10, true, [-40, 0, 20]], ['Block', 10, true, [5, 0, 0]]]);
});

test('saving replaces only the motion\'s own rules, and the list selection follows it', () => {
    const host = hostWith([
        { name: 'Spin', part: '', type: 'spin', trigger: 'always', speed: 90 },
        { name: 'Nod', part: 'Head', type: 'pose', trigger: 'action', period: 20, keys: [{ at: 0.9, rotate: [5, 0, 0] }, { at: 0.2, rotate: [20, 0, 0] }] },
        { name: 'Wave', part: 'LeftUpperArm', type: 'pose', trigger: 'action', period: 30, keys: [{ at: 0.5, rotate: [0, 0, 90] }] }
    ]);
    const editor = new RRMotionEditor(host);
    editor.open('Nod');
    assert.deepEqual(editor.motion.tracks[0].keys.map(k => k.at), [0.2, 0.9], 'keys open in order');
    // A name another motion has must not take that motion's rules with it.
    editor.motion.name = 'Wave';
    editor.commit();
    assert.equal(host.rawAnimations.filter(r => r.part === 'LeftUpperArm').length, 1);
    assert.equal(host.selectedRule, 1);
    // A new motion appends; with every track removed it leaves nothing selected.
    editor.open(null);
    editor.motion.tracks.push({ part: 'Head', keys: [{ at: 0.5, rotate: [1, 0, 0], move: [0, 0, 0] }] });
    editor.commit();
    assert.equal(host.selectedRule, 3);
    editor.motion.tracks.length = 0;
    editor.commit();
    assert.equal(host.selectedRule, -1);
    assert.equal(host.rawAnimations.length, 3);
});

test('an unnamed motion saves over its rules, not beside them', () => {
    const host = hostWith([{ part: 'Head', type: 'pose', trigger: 'action', period: 20, keys: [{ at: 0.5, rotate: [20, 0, 0] }] }]);
    const editor = new RRMotionEditor(host);
    editor.open(undefined);
    editor.commit();
    assert.equal(host.rawAnimations.length, 1);
    assert.equal(host.rawAnimations[0].name, editor.motion.name);
});

test('a slider keys the selected part at the playhead, between keys included', () => {
    global.Reactor3D = { sampleModelKeys: () => ({ rotate: [1, 2, 3], move: [0, 0, 0] }) };
    try {
        const host = hostWith([{ name: 'Nod', part: 'Head', type: 'pose', trigger: 'action', period: 20, keys: [{ at: 0.5, rotate: [20, 0, 0], move: [0, 0, 0] }] }]);
        const editor = new RRMotionEditor(host);
        editor.open('Nod');
        editor.playhead = 0.25;
        const stop = editor.keyAtPlayhead(editor.motion.tracks[0], true);
        assert.deepEqual([stop.at, stop.rotate], [0.25, [1, 2, 3]], 'a new key starts from the pose already there');
        assert.deepEqual(editor.motion.tracks[0].keys.map(k => k.at), [0.25, 0.5]);
        editor.playhead = 0.5;
        assert.equal(editor.keyAtPlayhead(editor.motion.tracks[0], false).rotate[0], 20);
    } finally {
        delete global.Reactor3D;
    }
});

test('the 3D Models page lists a motion as one row and previews it through the editor', () => {
    const db = read('src/database/Database3DEditor.js');
    assert.match(db, /const group = this\.motionGroup\(index\);\n\s*if \(group && group\[0\] !== index\) return;/);
    assert.match(db, /if \(this\.motionEditor && this\.motionEditor\.active\) rules = this\.motionEditor\.previewRules\(this\.playRules, frame\);/);
    assert.match(read('index.html'), /<script src="src\/database\/MotionEditor\.js"><\/script>\n\s*<script src="src\/utils\/AnimationPreviewLayer\.js">/);
});

test('a preset or a motion save keeps the card\'s rule and remembered work on the same rules', () => {
    const Database3DEditor = require('../src/database/Database3DEditor.js');
    const editor = Object.create(Database3DEditor.prototype);
    Object.assign(editor, {
        rawAnimations: [
            { name: 'Rifle', type: 'clip', trigger: 'action', clip: 'Rifle' },
            { name: 'Wave', part: 'Head', type: 'pose', trigger: 'action', period: 30, keys: [] },
            { name: 'Wave', part: 'Arm', type: 'pose', trigger: 'action', period: 30, keys: [] },
            { name: 'Sneak', type: 'clip', trigger: 'walking', clip: 'Sneak' }
        ],
        _editingRule: 3, selectedRule: 3, _poses: { '': { editingRule: 3 } },
        motionEditor: null, _detail: { querySelector: () => null }, _t: text => text,
        saveRules() {}, renderRuleList() {}
    });
    // Reapplying Wave moves its rules to the end: the card must still point at Sneak.
    editor.applyMotionPreset({ name: 'Wave', rules: [{ name: 'Wave', part: 'Head', type: 'pose', trigger: 'action', keys: [] }] });
    assert.equal(editor.rawAnimations[editor._editingRule].name, 'Sneak');
    assert.equal(editor.rawAnimations[editor._poses[''].editingRule].name, 'Sneak');
    // A motion saved with a part added shifts the rules after it.
    const host = Object.assign(editor, { rawAnimations: [editor.rawAnimations[0], editor.rawAnimations[2], editor.rawAnimations[1]], partNames: [], _t: text => text, _sim: { action: null } });
    host._editingRule = 2;
    const motion = new RRMotionEditor(host);
    motion.open('Wave');
    motion.motion.tracks.push({ part: 'Arm', keys: [{ at: 0.5, rotate: [1, 0, 0], move: [0, 0, 0] }] });
    motion.commit();
    assert.deepEqual(host.rawAnimations.map(r => r.name), ['Rifle', 'Wave', 'Wave', 'Sneak']);
    assert.equal(host.rawAnimations[host._editingRule].name, 'Sneak');
});

test('▶ with the Motion editor open plays its own motion there and closes it for any other', () => {
    const Database3DEditor = require('../src/database/Database3DEditor.js');
    const editor = Object.create(Database3DEditor.prototype);
    let closed = 0;
    editor.motionEditor = { active: true, motion: { original: 'Wave', name: 'Wave' }, playing: false, playhead: 0.6,
        renderPlayButton() {}, close() { closed++; this.active = false; } };
    assert.equal(editor._motionEditorTakesPlay('Wave'), true);
    assert.deepEqual([editor.motionEditor.playing, editor.motionEditor.playhead, closed], [true, 0, 0]);
    assert.equal(editor._motionEditorTakesPlay('Rifle'), false);
    assert.equal(closed, 1);
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'src/database/Database3DEditor.js'), 'utf8'),
        /playRuleAction\(name\) \{\n\s*if \(this\._motionEditorTakesPlay\(name\)\) return;/);
});

test('Escape on the 3D Models page closes the Motion editor or a dialog over it, not the database', () => {
    const Database3DEditor = require('../src/database/Database3DEditor.js');
    const editor = Object.create(Database3DEditor.prototype);
    let closed = 0;
    Object.assign(editor, { _detail: { isConnected: true }, _selectMode: false, selectedPartName: null, _modelRecordListKind: () => null,
        motionEditor: { active: true, close() { closed++; this.active = false; } } });
    const press = target => { const e = { key: 'Escape', target, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} }; editor._onKeyDown(e); return e; };
    const inDialog = { closest: selector => selector === '.rr-modal-overlay' ? {} : null };
    assert.equal(press(inDialog).prevented, false, 'the dialog handles its own Escape');
    assert.equal(closed, 0);
    assert.equal(press({ closest: () => null }).prevented, true);
    assert.equal(closed, 1);
    const source = fs.readFileSync(path.join(__dirname, '..', 'src/database/Database3DEditor.js'), 'utf8');
    assert.match(source, /RRKeyboardNavigation\.modal\(overlay, \{ onEscape: \(\) => close\(\) \}\)/, 'Preset Motions closes on its own Escape');
});

test('the play button keeps its pause glyph while playing: the language pass leaves it alone', () => {
    assert.match(read('src/database/MotionEditor.js'), /<button type="button" class="rr-btn-secondary r3d-motion-play" data-rr-i18n-skip="1"><\/button>/);
});
