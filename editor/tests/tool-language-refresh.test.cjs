/**
 * A language switch with a tool up: the Build bar, its Models panel and the
 * Lighting panel are built from keys when they open, so they are built again;
 * and the map name in the info bar is not replaced by "No Map Loaded".
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(editorRoot, rel), 'utf8');
const LightingManager = require(path.join(editorRoot, 'src', 'LightingManager.js'));

test('the lighting panel is rebuilt only while the tool is up', () => {
    const manager = new LightingManager({});
    const calls = [];
    for (const name of ['_buildPanel', 'render', '_syncPanel', '_syncAddButtons', '_syncDiskNotice']) manager[name] = () => calls.push(name);
    manager.refreshLanguage();
    assert.deepEqual(calls, [], 'put down: nothing to rebuild');
    manager.active = true; manager._panel = {};
    manager.refreshLanguage();
    assert.deepEqual(calls, ['_buildPanel', 'render', '_syncPanel', '_syncAddButtons', '_syncDiskNotice']);
});

test('the editor rebuilds the open tool panels on rr-language-changed', () => {
    const main = read('src/main.js');
    const listener = main.match(/window\.addEventListener\('rr-language-changed', \(\) => \{[\s\S]*?\n        \}\);/);
    assert.ok(listener, 'one listener for the tool panels');
    assert.match(listener[0], /this\.buildHotbar\._modelsBody = null;/);
    assert.match(listener[0], /if \(this\.buildHotbar\?\.visible\) this\.buildHotbar\.render\(\);/);
    assert.match(listener[0], /this\.lightingManager\?\.refreshLanguage\?\.\(\);/);
    assert.match(read('src/BuildHotbar.js'), /if \(this\._modelsBody && panel\.contains\(this\._modelsBody\) && props\.panel === this\._modelsBody\) \{ props\._syncPanel\?\.\(\); return; \}/, 'the bar mounts the Models panel again once _modelsBody is dropped');
});

test('the loaded map\'s name loses the "No Map Loaded" key', () => {
    assert.match(read('index.html'), /id="map-name" data-i18n="workspace\.noMapLoaded"/);
    assert.match(read('src/main.js'), /mapNameEl\.textContent = mapName;\s*\/\/[^\n]*\n\s*mapNameEl\.removeAttribute\('data-i18n'\);/);
});
