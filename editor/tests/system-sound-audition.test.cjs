const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const modalPath = path.join(editorRoot, 'src', 'utils', 'SystemSoundSlotModal.js');
const modalSource = fs.readFileSync(modalPath, 'utf8');
const runtimePath = path.resolve(editorRoot, '..', 'runtime', 'reactor_managers.js');
const runtimeSource = fs.readFileSync(runtimePath, 'utf8');

function loadModal() {
    const sandbox = { console, module: { exports: {} } };
    sandbox.window = sandbox;
    vm.runInNewContext(modalSource, sandbox);
    return sandbox.RRSystemSoundSlotModal;
}

// A stub draw that hands out the given values in order, so the two draws the
// pick makes (which sound, which pitch) can each be pinned.
const draws = (...values) => {
    let index = 0;
    return () => values[Math.min(index++, values.length - 1)];
};

const SLOT = [
    { name: 'Fire1', volume: 90, pitch: 100, pan: 0 },
    { name: 'Fire2', volume: 80, pitch: 120, pan: -20 },
    { name: '', volume: 90, pitch: 100, pan: 0 }
];

test('an audition draws from the named sounds only, as the runtime does', () => {
    const { auditionPick } = loadModal();

    // SoundManager.systemSoundVariants filters on `se && se.name`, so the third
    // row is not a candidate and the two named ones split the range in half.
    assert.equal(auditionPick(SLOT, null, draws(0)).sound.name, 'Fire1');
    assert.equal(auditionPick(SLOT, null, draws(0.49)).sound.name, 'Fire1');
    assert.equal(auditionPick(SLOT, null, draws(0.5)).sound.name, 'Fire2');
    assert.equal(auditionPick(SLOT, null, draws(0.999)).sound.name, 'Fire2');

    // A draw of exactly 1 would index past the end; the pick stays in range.
    assert.equal(auditionPick(SLOT, null, draws(1)).sound.name, 'Fire2');

    // The row index is reported, not the index among the named ones.
    assert.equal(auditionPick(SLOT, null, draws(0.5)).index, 1);

    assert.equal(auditionPick([], null, draws(0)), null);
    assert.equal(auditionPick([{ name: '' }], null, draws(0)), null);
    assert.equal(auditionPick(null, null, draws(0)), null);
});

test('random pitch replaces the sound pitch over the inclusive range', () => {
    const { auditionPick } = loadModal();

    // No range: the chosen sound keeps its own pitch.
    assert.equal(auditionPick(SLOT, null, draws(0.5)).pitch, 120);
    assert.equal(auditionPick(SLOT, { min: '', max: '' }, draws(0.5)).pitch, 120);

    // With a range, both ends are reachable and the sound pitch is discarded.
    const range = { min: 95, max: 105 };
    assert.equal(auditionPick(SLOT, range, draws(0.5, 0)).pitch, 95);
    assert.equal(auditionPick(SLOT, range, draws(0.5, 0.999)).pitch, 105);
    assert.equal(auditionPick(SLOT, range, draws(0.5, 1)).pitch, 105, 'a draw of 1 stays inside');

    // pitchRange clamps to the same 50..150 the runtime clamps to.
    assert.equal(auditionPick(SLOT, { min: 10, max: 10 }, draws(0, 0)).pitch, 50);
    assert.equal(auditionPick(SLOT, { min: 400, max: 400 }, draws(0, 0)).pitch, 150);

    // An inverted range is not a range, so the sound pitch survives.
    assert.equal(auditionPick(SLOT, { min: 120, max: 90 }, draws(0.5)).pitch, 120);
});

test('the audition mirrors the runtime rules it claims to mirror', () => {
    // Guards the comment in SystemSoundSlotModal.js: if either runtime rule is
    // rewritten, this fails and the editor preview has to be revisited.
    assert.match(runtimeSource, /\.filter\(se => se && se\.name\)/);
    assert.match(runtimeSource, /variants\[Math\.floor\(Math\.random\(\) \* variants\.length\)\]/);
    assert.match(runtimeSource, /pitch: min \+ Math\.floor\(Math\.random\(\) \* \(max - min \+ 1\)\)/);
    assert.match(runtimeSource, /min = Math\.max\(50, Math\.min\(150, min\)\)/);
});

test('the slot modal auditions through the live pitch controls, not the draft', () => {
    // draft.pitchRandom is only written on OK, so reading it here would ignore
    // a Random Pitch toggle the user just made.
    assert.match(modalSource, /const livePitchRange = \(\) => \(enabled\.checked/);
    assert.match(modalSource, /auditionPick\(draft\.sounds, livePitchRange\(\)\)/);

    // Chromium caps live AudioContexts per page; every close path releases it.
    assert.match(modalSource, /const releaseAudio = \(\) => \{/);
    assert.match(modalSource, /releaseAudio\(\);\s*\n\s*overlay\.remove\(\);/);
});
