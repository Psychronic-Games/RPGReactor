const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(editorRoot, 'src', 'database', 'DatabaseAnimationEditor.js'), 'utf8');

/** The shipped class, loaded for real rather than asserted on as text. */
function loadEditor() {
    const sandbox = {
        console: { debug() {}, warn() {}, log() {} },
        require,
        window: {},
        document: { createElement: () => ({ style: {}, appendChild() {} }), getElementById: () => null },
        rrEscapeHtml: value => String(value)
    };
    return vm.runInNewContext(`${source}\nDatabaseSystem1Editor_unused = null; DatabaseAnimationEditor;`, sandbox);
}

const Editor = loadEditor();
const editor = Object.create(Editor.prototype);

/** The stock Hit Fire: two SEs on frame 0, flashes on frames 0 and 2. */
const hitFire = () => ({
    id: 3, name: 'Hit Fire', effectName: 'HitFire',
    soundTimings: [
        { frame: 0, se: { name: 'Blow1', volume: 90, pitch: 100, pan: 0 } },
        { frame: 0, se: { name: 'Fire1', volume: 90, pitch: 100, pan: 0 } }
    ],
    flashTimings: [
        { frame: 0, color: [255, 128, 0, 170], duration: 10 },
        { frame: 2, color: [255, 255, 255, 90], duration: 6 }
    ]
});

test('a frame carrying two sounds is two rows, not one', () => {
    // Keyed by frame, the second SE was invisible -- and the runtime plays it,
    // so the panel disagreed with the game about what the animation was.
    // Array.from re-homes the vm realm's array: deepStrictEqual compares
    // prototypes and would reject values it otherwise likes.
    const rows = Editor.timingRows(hitFire());
    assert.deepEqual(Array.from(rows.map(r => `f${r.frame} ${r.se ? r.se.name : '-'}`)),
        ['f0 Blow1', 'f0 Fire1', 'f2 -']);
    assert.deepEqual(Array.from(rows.map(r => r.soundIndex)), [0, 1, -1]);
});

test('sound and flash pair by position within a frame', () => {
    const rows = Editor.timingRows(hitFire());
    assert.equal(rows[0].flashIndex, 0, 'the frame-0 flash rides on the first row');
    assert.equal(rows[1].flashIndex, -1, 'the second sound on that frame has no flash of its own');
    assert.equal(rows[2].flashIndex, 1);
    assert.deepEqual(Array.from(rows[0].flashColor), [255, 128, 0, 170]);
});

test('removing a row deletes that entry and nothing else on its frame', () => {
    const animation = hitFire();
    editor.removeTiming(animation, 1);            // the Fire1 row
    assert.deepEqual(Array.from(animation.soundTimings.map(st => st.se.name)), ['Blow1'],
        'the other sound on the frame survives');
    assert.equal(animation.flashTimings.length, 2, 'both flashes survive');

    editor.removeTiming(animation, 0);            // Blow1 plus the frame-0 flash
    assert.equal(animation.soundTimings.length, 0);
    assert.deepEqual(Array.from(animation.flashTimings.map(ft => ft.frame)), [2]);
});

test('removing the last row leaves the earlier ones alone', () => {
    const animation = hitFire();
    editor.removeTiming(animation, 2);
    assert.deepEqual(Array.from(animation.soundTimings.map(st => st.se.name)), ['Blow1', 'Fire1']);
    assert.deepEqual(Array.from(animation.flashTimings.map(ft => ft.frame)), [0]);
});

test('an out-of-range row is a no-op rather than a throw', () => {
    const animation = hitFire();
    editor.removeTiming(animation, 99);
    assert.equal(animation.soundTimings.length, 2);
});

test('the save path appends, so a second sound on a frame can be authored at all', () => {
    // It used to findIndex by frame and overwrite, which is what made the
    // second SE unauthorable even before the list collapsed it.
    assert.equal(source.includes('findIndex(st => st.frame === frame)'), false);
    assert.equal(source.includes('findIndex(ft => ft.frame === frame)'), false);
    assert.equal(source.includes('findIndex(t => t.frame === frame)'), false);
});

test('sprite timings stay one row per entry, including two on one frame', () => {
    const animation = {
        id: 4, name: 'MV', animation1Name: 'Sheet', frames: [[]],
        timings: [
            { frame: 0, se: { name: 'Blow1' }, flashScope: 1, flashColor: [255, 0, 0, 100], flashDuration: 5 },
            { frame: 0, se: { name: 'Fire1' }, flashScope: 0, flashColor: [0, 0, 0, 0], flashDuration: 0 }
        ]
    };
    const rows = Editor.timingRows(animation);
    assert.deepEqual(Array.from(rows.map(r => r.se.name)), ['Blow1', 'Fire1']);
    assert.deepEqual(Array.from(rows.map(r => r.timingIndex)), [0, 1]);

    editor.removeTiming(animation, 0);
    assert.deepEqual(Array.from(animation.timings.map(t => t.se.name)), ['Fire1']);
});

test('converting to the MV format keeps both sounds on the frame', () => {
    // Sprite_AnimationMV plays every timing it is given, so collapsing them
    // during the conversion would lose a sound the animation really makes.
    const animation = hitFire();
    Editor.convertAnimationFormat(animation, 'sprite');
    assert.deepEqual(Array.from(animation.timings.map(t => `f${t.frame} ${t.se.name}`)),
        ['f0 Blow1', 'f0 Fire1', 'f2 ']);
    assert.equal(animation.timings[0].flashScope, 1, 'the frame-0 flash stays with the first');
    assert.equal(animation.timings[1].flashScope, 0);
});

test('an animation with neither timing array yields no rows', () => {
    assert.equal(Editor.timingRows({ effectName: 'X' }).length, 0);
    assert.equal(Editor.timingRows({ id: 1, name: 'empty' }).length, 0);
});

test('the panel actually renders a row for each sound on the frame', () => {
    // Runs populateTimingsList rather than asserting on its source: the point
    // of the change is what appears in the list, so the list is what is built.
    const { createContext, createElement } = require('./helpers/mini-dom.cjs');
    const timingsList = createElement('div');
    timingsList.id = 'timings-list';
    const context = createContext({
        rrEscapeHtml: value => String(value),
        require
    });
    context.document.getElementById = id => (id === 'timings-list' ? timingsList : null);
    const Panel = vm.runInNewContext(`${source}\nDatabaseAnimationEditor;`, context);

    const panel = Object.create(Panel.prototype);
    panel.populateTimingsList(hitFire());

    const rows = timingsList.children.filter(child => child.className === 'anim-timing-entry');
    assert.equal(rows.length, 3, 'two sounds on frame 0 and one flash on frame 2');
    // The stub keeps a dataset value as it was assigned; a real DOM stringifies it.
    assert.deepEqual(Array.from(rows.map(row => String(row.dataset.timingIndex))), ['0', '1', '2']);

    const text = rows.map(row => row.innerHTML).join('\n');
    assert.ok(text.includes('Blow1'), 'the first sound on the frame is on screen');
    assert.ok(text.includes('Fire1'), 'and so is the second, which used to be invisible');
});

test('a previewed timing rolls its pool and pitch the way the game does', () => {
    // The previews play through an <audio> element, not AudioManager, so they
    // miss the resolver the runtime resolves variants in -- a timing with a
    // pool used to preview its first take at its authored pitch, every time.
    const modal = require(path.join(editorRoot, 'src', 'utils', 'SystemSoundSlotModal.js'));
    const Preview = vm.runInNewContext(`${source}\nDatabaseAnimationEditor;`, {
        console: { debug() {}, warn() {} },
        require,
        window: { RRSystemSoundSlotModal: modal },
        document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }) },
        rrEscapeHtml: value => String(value)
    });

    const timing = {
        name: 'Fire1', volume: 90, pitch: 100, pan: 0,
        variants: [{ name: 'Fire2', volume: 80, pitch: 105, pan: 5 }],
        pitchRandom: { min: 95, max: 105 }
    };

    // Every take in the pool is reachable, and every pitch stays in range.
    const heard = new Set();
    for (let attempt = 0; attempt < 200; attempt++) {
        const se = Preview.resolvePreviewSe(timing);
        heard.add(se.name);
        assert.ok(se.pitch >= 95 && se.pitch <= 105, `pitch ${se.pitch} is inside the range`);
    }
    assert.deepEqual([...heard].sort(), ['Fire1', 'Fire2']);
    assert.equal(timing.pitch, 100, 'the stored timing is not rewritten by a preview');
});

test('a plain SE previews as itself, and an empty one plays nothing', () => {
    const Preview = vm.runInNewContext(`${source}\nDatabaseAnimationEditor;`, {
        console: { debug() {}, warn() {} },
        require,
        window: {},
        document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }) },
        rrEscapeHtml: value => String(value)
    });
    const plain = { name: 'Blow1', volume: 90, pitch: 100, pan: 0 };
    assert.equal(Preview.resolvePreviewSe(plain), plain, 'no pool, no range, no work');
    assert.equal(Preview.resolvePreviewSe({ name: '' }), null);
    assert.equal(Preview.resolvePreviewSe(null), null);
});

test('all three animation previews go through the resolver', () => {
    // The Animations page play button, the Effekseer play button, and the
    // timing dialog's own preview.
    assert.equal((source.match(/DatabaseAnimationEditor\.resolvePreviewSe\(/g) || []).length, 3);
    assert.equal(/const se = timing\.se;\n\s+if \(!se \|\| !se\.name\) return;/.test(source), false,
        'no preview reads the stored SE straight any more');
});
