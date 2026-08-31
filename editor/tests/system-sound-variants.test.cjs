const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const modal = require(path.join(editorRoot, 'src', 'utils', 'SystemSoundSlotModal.js'));

function soundManager(system, randomValues = [0]) {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_managers.js'), 'utf8');
    const start = source.indexOf('function SoundManager()');
    const end = source.indexOf('//-----------------------------------------------------------------------------\n// TextManager', start);
    const loaded = [];
    const played = [];
    let randomIndex = 0;
    let randomCalls = 0;
    const math = Object.create(Math);
    math.random = () => {
        randomCalls += 1;
        return randomValues[Math.min(randomIndex++, randomValues.length - 1)];
    };
    const sandbox = {
        $dataSystem: system,
        AudioManager: {
            loadStaticSe: se => loaded.push(se),
            playStaticSe: se => played.push(se)
        },
        Error,
        Math,
        Number
    };
    sandbox.Math = math;
    vm.runInNewContext(`${source.slice(start, end)}; this.SoundManager = SoundManager;`, sandbox);
    return { SoundManager: sandbox.SoundManager, loaded, played, randomCalls: () => randomCalls };
}

test('all 24 stock system sound slots are authorable, plus the two typed recovery slots', () => {
    assert.equal(modal.SOUND_LABELS.length, 26);
    assert.deepEqual(modal.SOUND_LABELS.slice(17, 24), [
        'Miss', 'Evasion', 'Magic Evasion', 'Reflection', 'Shop', 'Use Item', 'Use Skill'
    ]);
    assert.deepEqual(modal.SOUND_LABELS.slice(24), ['MP Recovery', 'TP Recovery']);
});

test('the two typed recovery rows render directly under Recovery', () => {
    // Display order is deliberately not slot order. MP and TP Recovery are
    // appended at 24-25 so every older slot keeps the index a saved project
    // already wrote it at, but on screen they belong beside Recovery (16),
    // which is where anyone setting up healing audio looks for them.
    assert.deepEqual([...modal.SOUND_ORDER].sort((a, b) => a - b),
        Array.from({ length: 26 }, (unused, i) => i),
        'SOUND_ORDER is a permutation of every slot, so none is dropped or shown twice');
    assert.deepEqual(modal.SOUND_ORDER.slice(16, 19), [16, 24, 25]);
});

test('slot drafts are isolated and preserve unknown keys when applied', () => {
    const slot = {
        name: 'Cursor1', volume: 90, pitch: 100, pan: 0,
        variants: [{ name: 'Cursor2', volume: 80, pitch: 110, pan: -10, futureVariant: 9 }],
        pitchRandom: { min: 95, max: 105 }, pluginValue: 7
    };
    const draft = modal.draftFor(slot);
    draft.sounds[0].name = 'Cursor3';
    assert.equal(slot.name, 'Cursor1', 'editing the draft does not mutate System.json');
    const result = modal.applyDraft(slot, draft);
    assert.equal(result.name, 'Cursor3');
    assert.equal(result.pluginValue, 7);
    assert.deepEqual(result.variants, [{ name: 'Cursor2', volume: 80, pitch: 110, pan: -10, futureVariant: 9 }]);
    assert.deepEqual(result.pitchRandom, { min: 95, max: 105 });
});

test('clearing optional controls removes only the known extension keys', () => {
    const slot = { name: 'Ok1', volume: 90, pitch: 100, pan: 0, variants: [{}], pitchRandom: {}, future: true };
    const result = modal.applyDraft(slot, { sounds: [slot], pitchRandom: null });
    assert.equal('variants' in result, false);
    assert.equal('pitchRandom' in result, false);
    assert.equal(result.future, true);
});

test('blank variant rows are not persisted as playable pool entries', () => {
    const slot = { name: 'Ok1', volume: 90, pitch: 100, pan: 0 };
    const result = modal.applyDraft(slot, {
        sounds: [slot, { name: '', volume: 90, pitch: 100, pan: 0 }],
        pitchRandom: null
    });
    assert.equal('variants' in result, false);
});

test('runtime resolves the primary and valid variants and preloads the complete pool', () => {
    const primary = { name: 'Cursor1', volume: 90, pitch: 100, pan: 0 };
    primary.variants = [
        { name: '', volume: 90, pitch: 100, pan: 0 },
        { name: 'Cursor2', volume: 80, pitch: 95, pan: 10 }
    ];
    const runtime = soundManager({ sounds: [primary] });
    assert.equal(runtime.SoundManager.systemSoundVariants(0).length, 2);
    runtime.SoundManager.loadSystemSound(0);
    assert.deepEqual(runtime.loaded.map(se => se.name), ['Cursor1', 'Cursor2']);
});

test('runtime uniformly selects candidates while preserving authored levels', () => {
    const primary = { name: 'Cursor1', volume: 90, pitch: 100, pan: 0 };
    primary.variants = [{ name: 'Cursor2', volume: 65, pitch: 87, pan: -20 }];
    const runtime = soundManager({ sounds: [primary] }, [0.999]);
    runtime.SoundManager.playSystemSound(0);
    assert.deepEqual(runtime.played[0], primary.variants[0]);
});

test('pitch randomization is inclusive, clamped, and never mutates database sounds', () => {
    const primary = { name: 'Cursor1', volume: 75, pitch: 91, pan: 12, pitchRandom: { min: 0, max: 200 } };
    const low = soundManager({ sounds: [primary] }, [0, 0]);
    low.SoundManager.playSystemSound(0);
    assert.equal(low.played[0].pitch, 50);

    const high = soundManager({ sounds: [primary] }, [0.999999]);
    high.SoundManager.playSystemSound(0);
    assert.equal(high.played[0].pitch, 150);
    assert.equal(high.played[0].volume, 75);
    assert.equal(high.played[0].pan, 12);
    assert.equal(primary.pitch, 91);
});

test('absent or malformed ranges preserve exact stock pitch behavior without consuming RNG', () => {
    for (const pitchRandom of [undefined, null, { min: '', max: 100 }, { min: '  ', max: 100 }, { min: 110, max: 90 }, { min: 'bad', max: 100 }]) {
        const primary = { name: 'Ok1', volume: 90, pitch: 83, pan: 0, pitchRandom };
        const runtime = soundManager({ sounds: [primary] });
        runtime.SoundManager.playSystemSound(0);
        assert.equal(runtime.played[0], primary);
        assert.equal(runtime.played[0].pitch, 83);
        assert.equal(runtime.randomCalls(), 0);
    }
});

test('missing system sound data is a safe no-op', () => {
    for (const system of [null, {}, { sounds: [] }]) {
        const runtime = soundManager(system);
        runtime.SoundManager.loadSystemSound(0);
        runtime.SoundManager.playSystemSound(0);
        assert.equal(runtime.loaded.length, 0);
        assert.equal(runtime.played.length, 0);
    }
});

test('System 1 loads the slot modal after its dependencies and merges legacy picker results', () => {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.ok(html.indexOf('src/utils/AudioPickerModal.js') < html.indexOf('src/utils/SystemSoundSlotModal.js'));
    assert.ok(html.indexOf('src/utils/SystemSoundSlotModal.js') < html.indexOf('src/database/DatabaseSystem1Editor.js'));
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseSystem1Editor.js'), 'utf8');
    assert.match(source, /system\.sounds\[identifier\] = \{ \.\.\.system\.sounds\[identifier\], \.\.\.result \}/);
});

// Renders the real createColumn3 rather than asserting on its source, so the
// row a user actually sees is what gets checked.
function renderSoundTable(sounds) {
    const system1Source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseSystem1Editor.js'), 'utf8');
    const newElement = () => ({
        style: {}, className: '', innerHTML: '', children: [],
        appendChild(child) { this.children.push(child); }
    });
    const sandbox = {
        console,
        require,
        window: {},
        RRSystemSoundSlotModal: modal,
        rrEscapeHtml: value => String(value),
        document: { createElement: newElement }
    };
    const Editor = vm.runInNewContext(`${system1Source}\nDatabaseSystem1Editor;`, sandbox);
    const editor = Object.create(Editor.prototype);
    const column = editor.createColumn3({ sounds });
    // Column 3 is Music then Sound; the sound table is the second section.
    return column.children[1].innerHTML;
}

const stockSounds = () => Array.from({ length: 24 },
    (unused, i) => ({ name: `Slot${i}`, volume: 90, pitch: 100, pan: 0 }));

test('an untouched MP or TP recovery row names the slot it borrows, not "(None)"', () => {
    // The runtime falls back to Recovery while 24-25 are absent, so a row
    // reading `(None)` there would describe a silence that does not happen.
    const html = renderSoundTable(stockSounds());

    for (const idx of [24, 25]) {
        const row = html.split('<tr').find(chunk => chunk.includes(`data-sound-index="${idx}"`));
        assert.ok(row, `slot ${idx} has a row`);
        assert.ok(row.includes('(Recovery)'), `slot ${idx} says it borrows Recovery`);
        assert.ok(!row.includes('(None)'), `slot ${idx} does not claim to be silent`);
    }

    assert.ok(html.includes('MP Recovery'));
    assert.ok(html.includes('TP Recovery'));
});

test('a picked-then-blanked MP recovery row reads as silent, because it is', () => {
    const sounds = stockSounds().concat([{ name: '', volume: 90, pitch: 100, pan: 0 }]);
    const html = renderSoundTable(sounds);
    const row = html.split('<tr').find(chunk => chunk.includes('data-sound-index="24"'));
    assert.ok(row.includes('(None)'), 'a written-but-blank slot is a real silence');
    assert.ok(!row.includes('(Recovery)'));
});

test('MP and TP recovery fall back to Recovery only when their slot is absent', () => {
    // Slots 24-25 postdate the 24-slot MZ schema, so a project last saved
    // before they existed has no entry at them and has to keep playing the
    // chime its heals already played. A slot that is present with a blank name
    // is a deliberate silence and must not fall back.
    const namesFor = sounds => {
        const { SoundManager, played } = soundManager({ sounds });
        SoundManager.playMpRecovery();
        SoundManager.playTpRecovery();
        return played.map(se => se.name);
    };

    assert.deepEqual(namesFor(stockSounds()), ['Slot16', 'Slot16'],
        'a 24-slot project keeps the generic chime');
    assert.deepEqual(namesFor(stockSounds().concat([{ name: 'MpHeal', volume: 90, pitch: 100, pan: 0 }])),
        ['MpHeal', 'Slot16'], 'MP set, TP still absent');
    assert.deepEqual(namesFor(stockSounds().concat([null, null])), ['Slot16', 'Slot16'],
        'a JSON hole reads as absent');
    assert.deepEqual(namesFor(stockSounds().concat([{ name: '' }, { name: '' }])), [],
        'a present-but-blank slot is a deliberate silence, not a fallback');
});
