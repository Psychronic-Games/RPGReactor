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

    // The shared audio picker modal serves System 1, the audio commands,
    // movement-route SE, and map properties — the release lives there.
    const audioPicker = read('src', 'utils', 'AudioPickerModal.js');
    assert.match(audioPicker, /audioContext\.close\(\)/);
    // Every close path releases, not just stops.
    assert.doesNotMatch(audioPicker, /stopAudio\(\);\s*\n\s*document\.body\.removeChild\(overlay\)/);
    const system1 = read('src', 'database', 'DatabaseSystem1Editor.js');
    assert.match(system1, /RRAudioPickerModal\.open\(/);

    const animEditor = read('src', 'database', 'DatabaseAnimationEditor.js');
    assert.match(animEditor, /_runDetailCleanups\(\)/);
    assert.match(animEditor, /removeEventListener\('keydown', handleKeyDown\)/);
    assert.match(animEditor, /removeEventListener\('mouseup', onSheetDragMouseUp\)/);
    assert.match(animEditor, /effekseer\.releaseContext\(effekseerContext\)/);
    assert.match(animEditor, /effekseer\.releaseContext\(previewEffekseerContext\)/);
    assert.match(animEditor, /loadedEffects\.add\(pending\)/);
    assert.match(animEditor, /previewEffekseerContext\.releaseEffect\(pending\)/);
    assert.match(animEditor, /currentPreviewEffect !== effectName/,
        'stale effect loads cannot replace or report over the current preview');
    assert.match(animEditor, /RRAudioPickerModal\.open\(/,
        'animation timing sounds use the shared picker that closes its AudioContext');

    const animPicker = read('src', 'event', 'AnimationPicker.js');
    assert.match(animPicker, /WEBGL_lose_context/);

    const modelPreview = read('src', 'utils', 'ModelPreview3D.js');
    assert.match(modelPreview, /cancelAnimationFrame\(this\.raf\)/);
    assert.match(modelPreview, /removeEventListener\('pointermove', this\.pointerMove\)/);
    assert.match(modelPreview, /WEBGL_lose_context/);
    assert.match(modelPreview, /reactorObjectUrl[\s\S]{0,80}?URL\.revokeObjectURL/);
    assert.match(modelPreview, /getPixelRatio\(\)[\s\S]{0,180}?bufferWidth/,
        'high-DPI drawing-buffer dimensions are compared instead of CSS dimensions');
    assert.match(modelPreview, /value !== Reactor3D\._studioEnv/,
        'preview cleanup does not dispose the shared environment texture');
    assert.match(modelPreview, /root\.userData\?\.glbTextures/,
        'preview cleanup includes decoded textures not attached to a scene mesh');
    assert.match(modelPreview, /beforeBuild/,
        'superseded worker results are rejected before main-thread model construction');
    const reactor3d = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(reactor3d, /releaseObjectUrl[\s\S]{0,500}?TextureLoader\(\)\.load[\s\S]{0,300}?releaseObjectUrl/,
        'embedded GLB object URLs are released after decode and on load failure');
    assert.match(reactor3d, /Object\.values\(\(parsed && parsed\.bitmaps\)[\s\S]{0,160}?bitmap\.close\(\)/,
        'superseded worker-decoded images are closed before template construction');
    const resources = read('src', 'ResourceManager.js');
    assert.match(resources, /this\.modelPreview\?\.dispose\(\)/);
    assert.match(resources, /generation !== this\.previewGeneration[\s\S]{0,180}?URL\.revokeObjectURL/);

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
