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

test('picture extensions load after picture classes and before compatibility/plugins', () => {
    const { scripts } = readRuntimeManifest(path.join(runtimeRoot, 'reactor_main.js'));
    const spritesIndex = scripts.indexOf('js/reactor_sprites.js');
    const pictureIndex = scripts.indexOf('js/reactor_picture_extensions.js');
    const compatIndex = scripts.indexOf('js/reactor_mv_compat.js');
    const pluginsIndex = scripts.indexOf('js/reactor_plugins.js');

    assert.ok(spritesIndex < pictureIndex, 'picture classes load before their aliases');
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
