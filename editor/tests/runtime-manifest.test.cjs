const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const runtimeRoot = path.join(workspaceRoot, 'runtime');

function readRuntimeManifest(mainPath) {
    const source = fs.readFileSync(mainPath, 'utf8');
    const scriptsMatch = source.match(/const\s+scriptUrls\s*=\s*(\[[\s\S]*?\]);/);
    const wasmMatch = source.match(/const\s+effekseerWasmUrl\s*=\s*(["'][^"']+["'])\s*;/);

    assert.ok(scriptsMatch, 'reactor_main.js declares scriptUrls');
    assert.ok(wasmMatch, 'reactor_main.js declares effekseerWasmUrl');

    return {
        scripts: Array.from(vm.runInNewContext(scriptsMatch[1])),
        wasm: vm.runInNewContext(wasmMatch[1])
    };
}

test('every reactor_main runtime manifest entry is tracked in the runtime bundle', () => {
    const manifest = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    const references = [...manifest.scripts, manifest.wasm];

    assert.equal(new Set(references).size, references.length, 'runtime manifest entries are unique');
    for (const reference of references) {
        assert.match(reference, /^js\//, `${reference} is rooted under the generated js directory`);
        const runtimePath = path.join(runtimeRoot, reference.slice('js/'.length));
        assert.equal(fs.existsSync(runtimePath), true, `${reference} resolves to ${runtimePath}`);
    }

    const required = [
        'js/reactor_picture_extensions.js',
        'js/reactor_video_surfaces.js',
        'js/reactor_mv_compat.js',
        'js/libs/effekseer.wasm',
        'js/libs/pako.min.js',
        'js/libs/lz-string.js',
        'js/libs/localforage.min.js',
        'js/libs/vorbisdecoder.js'
    ];
    for (const reference of required) {
        assert.equal(references.includes(reference), true, `${reference} is in the runtime manifest`);
    }
});

test('picture and video extensions load after sprites and before compatibility/plugins', () => {
    const { scripts } = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    const spritesIndex = scripts.indexOf('js/reactor_sprites.js');
    const pictureIndex = scripts.indexOf('js/reactor_picture_extensions.js');
    const videoIndex = scripts.indexOf('js/reactor_video_surfaces.js');
    const compatIndex = scripts.indexOf('js/reactor_mv_compat.js');
    const pluginsIndex = scripts.indexOf('js/reactor_plugins.js');

    assert.ok(spritesIndex < pictureIndex, 'picture classes load before their aliases');
    assert.ok(pictureIndex < videoIndex, 'video surfaces load after picture extensions');
    assert.ok(videoIndex < compatIndex, 'video surfaces load before compatibility');
    assert.ok(pictureIndex < compatIndex, 'picture extensions load before compatibility');
    assert.ok(pictureIndex < pluginsIndex, 'picture extensions load before plugins');
});

test('MV compatibility loads before the plugin configuration', () => {
    const { scripts } = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    const compatIndex = scripts.indexOf('js/reactor_mv_compat.js');
    const pluginsIndex = scripts.indexOf('js/reactor_plugins.js');

    assert.notEqual(compatIndex, -1, 'reactor_mv_compat.js is loaded');
    assert.notEqual(pluginsIndex, -1, 'reactor_plugins.js is loaded');
    assert.ok(compatIndex < pluginsIndex, 'MV compatibility loads before plugin setup');
});

test('MV LZString decoder loads before the compatibility layer', () => {
    const { scripts } = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    const decoderIndex = scripts.indexOf('js/libs/lz-string.js');
    const compatIndex = scripts.indexOf('js/reactor_mv_compat.js');

    assert.notEqual(decoderIndex, -1, 'lz-string.js is loaded');
    assert.ok(decoderIndex < compatIndex, 'legacy save decoder loads before MV compatibility');
});

test('bundled LZString decodes a fixed stock-MV save payload', () => {
    const source = fs.readFileSync(path.join(runtimeRoot, 'libs', 'lz-string.js'), 'utf8');
    const context = {};
    vm.runInNewContext(source, context);
    const fixture = 'N4IgzgnmAuCmC2IBcoACBjZBGAvgGhAAcBDAJ2gmTUyQCYccgAA=';
    const json = context.LZString.decompressFromBase64(fixture);

    assert.equal(json, '{"system":{"@c":1},"party":{"@c":2}}');
    assert.equal(context.LZString.decompressFromBase64(context.LZString.compressToBase64(json)), json);
    assert.equal(context.LZString.decompressFromUTF16(context.LZString.compressToUTF16(json)), json);
    assert.equal(context.LZString.decompressFromEncodedURIComponent(context.LZString.compressToEncodedURIComponent(json)), json);

    const unicodeJson = '{"name":"颤前鿣䵅䚄㫢梴钅瓊遗肌頭掤鄅摰"}';
    const stockMvBase64 = 'N4IgdghgtgpiBcJAlGYWSVDH+YUVlAhYoI65AtFoKEpgUy6DqCYDEBgtBmAlxoKCJgDiYgC+QAA=';
    assert.equal(context.LZString.compressToBase64(unicodeJson), stockMvBase64);
    assert.equal(context.LZString.decompressFromBase64(stockMvBase64), unicodeJson);
});

test('the build preflights require every script the runtime actually boots', () => {
    // `scriptUrls` is what Main waits for, so a project missing any of them
    // fails to boot. A preflight that does not check for a file cannot warn
    // about it: `reactor_3d.js` was added to the manifest and to every project,
    // but not to these lists, so a project that lost it would have passed
    // validation and then died at load.
    const manifest = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    const booted = manifest.scripts
        .filter(url => !url.startsWith('js/libs/'))
        .map(url => url.slice('js/'.length));

    const editorRoot = path.join(workspaceRoot, 'editor');
    for (const file of ['build.js', 'build-worker.js', 'dist-editor-worker.js']) {
        const source = fs.readFileSync(path.join(editorRoot, 'build-scripts', file), 'utf8');
        for (const script of booted) {
            assert.ok(source.includes(`'${script}'`),
                `${file} preflights ${script}`);
        }
    }
});

test('three.js is deliberately absent from the boot manifest', () => {
    // It is ~2 MB and only a 3D map needs it, so `Reactor3D.ensureLoaded`
    // fetches it on demand. Adding it here would charge every project for a
    // feature most never use.
    const manifest = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    assert.equal(manifest.scripts.includes('js/libs/three.js'), false);
    assert.equal(fs.existsSync(path.join(runtimeRoot, 'libs', 'three.js')), true,
        'but it does ship in the runtime bundle');
});
