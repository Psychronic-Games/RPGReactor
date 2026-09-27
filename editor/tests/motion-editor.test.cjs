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
