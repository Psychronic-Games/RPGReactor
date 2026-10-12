'use strict';
// MV's System.json lacks the fields MZ added (`advanced`, `titleCommandWindow`
// and the rest); the compatibility layer fills the absent ones with MV's own
// behaviour when the data loads, and leaves every field a project has alone.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const compat = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_mv_compat.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function load(mvGameSemantics) {
    const start = compat.indexOf('    function systemDefaults() {');
    const end = compat.indexOf('    function installSceneLayoutCompatibility() {', start);
    assert.ok(start >= 0 && end > start, 'the defaults are locatable');
    const loaded = [];
    const context = { mvGameSemantics, DataManager: { onLoad(object) { loaded.push(object); } } };
    context.global = context;
    vm.createContext(context);
    vm.runInContext(compat.slice(start, end) + '\ninstallSystemDefaults();', context);
    return { context, loaded };
}

test('an MV System.json gets the MZ fields it lacks, with MV\'s own values', () => {
    const { context, loaded } = load(true);
    const system = { gameTitle: 'SideMV', optSideView: false };
    context.$dataSystem = system;
    context.DataManager.onLoad(system);
    assert.equal(loaded[0], system, 'the original onLoad still runs');
    assert.deepEqual(plain(system.advanced), {
        gameId: 0, screenWidth: 816, screenHeight: 624, uiAreaWidth: 816, uiAreaHeight: 624,
        numberFontFilename: 'mplus-2p-bold-sub.woff', fallbackFonts: 'Verdana, sans-serif', fontSize: 28,
        mainFontFilename: 'mplus-1m-regular.woff', windowOpacity: 192, screenScale: 1
    });
    assert.deepEqual(plain(system.titleCommandWindow), { background: 0, offsetX: 0, offsetY: 0 });
    assert.deepEqual(plain(system.itemCategories), [true, true, true, true]);
    assert.equal(system.battleSystem, 0);
    assert.equal(system.tileSize, 48);
    assert.equal(system.optAutosave, false);
    assert.equal(system.optKeyItemsNumber, true);
    assert.equal(system.startDirection, undefined, 'the runtime already starts a project without one facing down');
});

test('fields a project has are never replaced, and other data is left alone', () => {
    const { context } = load(true);
    const advanced = { screenWidth: 1280, screenHeight: 720, mainFontFilename: 'Mine.ttf' };
    const system = { advanced, optAutosave: true, itemCategories: [true, false, true, false] };
    context.$dataSystem = system;
    context.DataManager.onLoad(system);
    assert.equal(system.advanced, advanced);
    assert.equal(system.optAutosave, true);
    assert.deepEqual(plain(system.itemCategories), [true, false, true, false]);
    const actors = [null, { name: 'A' }];
    context.DataManager.onLoad(actors);
    assert.equal(actors.advanced, undefined);
    assert.equal(load(false).context.DataManager.onLoad.__mvSystemDefaults, true);
});

test('an MZ-shaped project without the block gets MZ\'s font size', () => {
    const { context } = load(false);
    const system = {};
    context.$dataSystem = system;
    context.DataManager.onLoad(system);
    assert.equal(system.advanced.fontSize, 26);
});
