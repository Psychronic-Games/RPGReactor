const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');

test('Web Forge exporters default generated files into the active project', () => {
    const animation = read('src/forge/AnimationGenerator/AnimationGenerator.js');
    const character = read('src/forge/CharacterGenerator/CharacterGenerator.js');
    const effekseer = read('src/forge/EffekseerGenerator/EffekseerGenerator.js');
    const sound = read('src/forge/SoundEffectGenerator/SoundEffectGenerator.js');

    assert.match(animation, /webHost\.saveFile/);
    assert.match(animation, /'img', 'animations'/);
    assert.match(character, /webHost\.saveFile/);
    assert.match(character, /'img', 'characters'/);
    assert.match(character, /'forge', 'character_generator'/);
    assert.match(effekseer, /webHost\.saveFiles/);
    assert.match(effekseer, /path\.join\(project\.path, 'effects'\)/);
    assert.match(sound, /webHost\.saveFile/);
    assert.match(sound, /'audio', 'se'/);
});

test('Web Forge supports projectless browser destinations and bundled character engines', () => {
    const host = read('src/web/WebHost.js');
    const worker = read('build-scripts/dist-editor-worker.js');

    assert.match(host, /showSaveFilePicker/);
    assert.match(host, /showDirectoryPicker/);
    assert.match(host, /URL\.createObjectURL/);
    assert.match(worker, /CharacterGenerator\/procgen\/outfit_engine\.js/);
    assert.match(worker, /CharacterGenerator\/procgen\/hair_engine\.js/);
    assert.match(worker, /characterStyleScripts/);
});
