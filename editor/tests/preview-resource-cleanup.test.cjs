const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const DatabaseAnimationEditor = require(path.join(
    editorRoot, 'src', 'database', 'DatabaseAnimationEditor.js'));

test('detail cleanups run once each, in order, and survive a throwing entry', () => {
    const editor = Object.create(DatabaseAnimationEditor.prototype);
    const ran = [];

    editor._registerDetailCleanup(() => ran.push('a'));
    editor._registerDetailCleanup(() => { ran.push('b'); throw new Error('boom'); });
    editor._registerDetailCleanup(() => ran.push('c'));

    editor._runDetailCleanups();
    assert.deepEqual(ran, ['a', 'b', 'c']);

    // The registry is cleared: a second run must not re-fire anything.
    editor._runDetailCleanups();
    assert.deepEqual(ran, ['a', 'b', 'c']);
});

test('preview surfaces release capped resources and audio sections support Unicode', () => {
    // Chromium caps live WebGL contexts (~16) and AudioContexts (~6) per
    // page; every preview open/close cycle must release what it allocated.
    // These are DOM/GL code paths, so assert the teardown calls are wired
    // in the source rather than executing them headless.
    const read = (...parts) => fs.readFileSync(path.join(editorRoot, ...parts), 'utf8');

    const pickerModal = read('src', 'database', 'AnimationPickerModal.js');
    assert.match(pickerModal, /effekseer\.releaseContext\(fx\.ctx\)/);
    assert.match(pickerModal, /WEBGL_lose_context/);

    const system1 = read('src', 'database', 'DatabaseSystem1Editor.js');
    assert.match(system1, /audioContext\.close\(\)/);
    // Every close path releases, not just stops.
    assert.doesNotMatch(system1, /stopAudio\(\);\s*\n\s*document\.body\.removeChild\(overlay\)/);

    const animEditor = read('src', 'database', 'DatabaseAnimationEditor.js');
    assert.match(animEditor, /_runDetailCleanups\(\)/);
    assert.match(animEditor, /removeEventListener\('keydown', handleKeyDown\)/);
    assert.match(animEditor, /removeEventListener\('mouseup', onSheetDragMouseUp\)/);
    assert.match(animEditor, /effekseer\.releaseContext\(effekseerContext\)/);
    assert.match(animEditor, /effekseer\.releaseContext\(previewEffekseerContext\)/);

    const animPicker = read('src', 'event', 'AnimationPicker.js');
    assert.match(animPicker, /WEBGL_lose_context/);

    const pageEditor = read('src', 'event', 'EventPageEditor.js');
    assert.match(pageEditor, /canvas\.isConnected/);

    const dbUI = read('src', 'DatabaseEditorUI.js');
    assert.match(dbUI, /clearInterval\(walkInterval\)/);

    const efkGen = read('src', 'forge', 'EffekseerGenerator', 'EffekseerGenerator.js');
    assert.match(efkGen, /removeEventListener\('mousemove', onOrbitMouseMove\)/);
    assert.match(efkGen, /removeEventListener\('mouseup', onOrbitMouseUp\)/);

    const audioSource = read('src', 'AudioPlayer.js');
    const AudioPlayer = vm.runInNewContext(`${audioSource}\nAudioPlayer;`, { console, Intl, Symbol });
    const audioPlayer = Object.create(AudioPlayer.prototype);
    const sectionCases = [
        ['Battle.ogg', 'B'],
        ['étoile.ogg', 'É'],
        ['E\u0301cho.ogg', 'É'],
        ['über.ogg', 'Ü'],
        ['ωδή.ogg', 'Ω'],
        ['жук.ogg', 'Ж'],
        ['不染.ogg', '不'],
        ['あさ.ogg', 'あ'],
        ['한강.ogg', '한'],
        ['05拳打声.ogg', '#'],
        ['🎵 Theme.ogg', '#']
    ];
    for (const [name, section] of sectionCases) {
        assert.equal(audioPlayer.getAudioSectionKey(name), section);
    }

    const names = sectionCases.map(([name]) => name).sort((a, b) => audioPlayer.compareAudioTrackNames(a, b));
    const completedSections = new Set();
    let currentSection = null;
    for (const name of names) {
        const section = audioPlayer.getAudioSectionKey(name);
        if (section === currentSection) continue;
        assert.equal(completedSections.has(section), false, `${section} section must remain contiguous`);
        if (currentSection !== null) completedSections.add(currentSection);
        currentSection = section;
    }
});
