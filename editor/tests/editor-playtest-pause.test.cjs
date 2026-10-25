'use strict';
/**
 * While a playtest window is in front, the editor's map views draw nothing:
 * on an integrated GPU the game and the editor shared it. Clicking back into
 * the editor gives it focus, and both views draw again at once. The 3D view
 * draws its main pass the way the game's viewport does (light volume, light
 * and haze at a quarter size, render scale with the sharpening upscale).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const src = file => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');

function loadPlaytestManager(document) {
    return vm.runInNewContext(`${src('PlaytestManager.js')}\nPlaytestManager`, { console: { log() {}, warn() {}, error() {} }, document });
}

test('the playtest owns the GPU only while it runs and the editor is not focused', () => {
    let focused = false;
    const PlaytestManager = loadPlaytestManager({ hasFocus: () => focused });
    const manager = new PlaytestManager();
    assert.equal(manager.ownsGpu(), false, 'no playtest');
    manager.playtestProcess = { pid: 1 };
    assert.equal(manager.isRunning(), true);
    assert.equal(manager.ownsGpu(), true, 'the game window in front');
    focused = true;
    assert.equal(manager.ownsGpu(), false, 'clicked back into the editor: it draws again');
    focused = false;
    manager.playtestProcess = null;
    assert.equal(manager.ownsGpu(), false, 'the playtest closed');
});

test('both map views treat a playtest in front as covered, and redraw when uncovered', () => {
    const three = src('MapEditor3D.js');
    assert.match(three, /const playtest = MapEditor3D\.playtestRunning\(\);/);
    assert.match(three, /if \(this\.suspended \|\| MapEditor3D\.coveredByDatabase\(\) \|\| playtest\) \{ this\._covered = true;/);
    assert.match(three, /static playtestRunning\(\) \{\s*return typeof window !== 'undefined' && !!window\.reactor\?\.playtestManager\?\.ownsGpu\?\.\(\);/);
    // Uncovered, whatever changed behind is drawn.
    assert.match(three, /if \(this\._covered\) \{ this\._covered = false; this\.requestRender\(\); \}/);
    const controller = src('ProjectController.js');
    assert.match(controller, /isCovered: \(\) => \(!!databaseViewer\(\)\?\.classList\?\.contains\('active'\) && !databaseViewer\(\)\.classList\.contains\('rr-database-floating'\)\)\s*\|\| !!window\.reactor\?\.playtestManager\?\.ownsGpu\?\.\(\)/);
});

test('the 3D view draws its main pass as the game does: volume, quarter-size light and haze, scaled and enlarged', () => {
    const three = src('MapEditor3D.js');
    assert.match(three, /Reactor3D\.LightVolume\.frame\(this\.renderer, this\.mapScene, this\.currentMap\(\)\)/);
    assert.match(three, /R3\.HalfLight\.begin\(renderer, scene, target\)/);
    assert.match(three, /R3\.HalfHaze\.take\(scene, target, this\.camera\)/);
    assert.match(three, /R3\.SharpUpscale\.draw\(renderer, target, null, target\.width < size\.x \? undefined : 0\)/, 'at full scale, a plain copy');
    assert.match(three, /const scale = Math\.min\(1, Math\.max\(0\.25, R3\.renderScale \|\| 1\)\);/, 'the game\'s own render scale');
    assert.match(three, /this\.renderer\.initRenderTarget\(target\);/);
    // Both main passes go through it; the later passes draw over it on the canvas.
    assert.equal((three.match(/this\.renderMainPass\(scene\);/g) || []).length, 2);
    // A still view keeps drawing while the volume bakes.
    assert.match(three, /return typeof Reactor3D !== 'undefined' && !!Reactor3D\.LightVolume\?\.baking\?\.\(\);/);
});
