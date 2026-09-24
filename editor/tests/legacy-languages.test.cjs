'use strict';
// Language packs for imported games that switch language while they play:
// LegacyLanguages diffs two conversions into set/splice ops, RR_Language.js
// applies them in the game, and a 2003 picture erases on map change unless
// its Show Picture keeps it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const LL = require('../src/legacy/LegacyLanguages.js');
const C = require('../src/legacy/LegacyCommands.js');

const repo = path.resolve(__dirname, '..', '..');
const clone = (v) => JSON.parse(JSON.stringify(v));
const c = (code, parameters, indent = 0) => ({ code, indent, parameters });

test('a pack turns the baked data into the other language and its undo turns it back', () => {
    const base = { events: [null, { pages: [{ list: [
        c(101, ['', 0, 0, 2]), c(401, ['Hallo']), c(401, ['Welt']),
        c(355, ['$gameScreen.rrWriteText("t", 1, 2, "Eins", false, 0, 0)']), c(355, ['$gameScreen.rrAppendLine("t", "Zwei")']),
        c(102, [['Ja', 'Nein'], 1, 0, 2, 0]), c(402, [0, 'Ja']), c(0, [], 1), c(404, []), c(0, [])
    ] }] }], name: 'Karte' };
    const other = { events: [null, { pages: [{ list: [
        c(101, ['', 0, 0, 2]), c(401, ['Hello']), c(401, ['there,']), c(401, ['world']),
        c(355, ['$gameScreen.rrWriteText("t", 1, 2, "One", false, 0, 0)']), c(355, ['$gameScreen.rrAppendLine("t", "Two")']), c(355, ['$gameScreen.rrAppendLine("t", "Three")']),
        c(102, [['Yes', 'No'], 1, 0, 2, 0]), c(402, [0, 'Yes']), c(0, [], 1), c(404, []), c(0, [])
    ] }] }], name: 'Map' };
    const stats = { wholeLists: 0 };
    const ops = LL.diff(base, other, stats);
    assert.equal(stats.wholeLists, 0, 'a message or screen text that changes length is a splice, not a new list');
    assert.ok(ops.some(op => op.length === 4), 'the longer message is spliced in');
    const data = clone(base);
    const undo = LL.apply(data, ops);
    assert.deepEqual(data, other);
    LL.apply(data, undo);
    assert.deepEqual(data, base);
});

test('two splices in one list run from the end, so both indices hold', () => {
    const base = { list: [c(401, ['a']), c(230, [1]), c(401, ['b']), c(0, [])] };
    const other = { list: [c(401, ['a1']), c(401, ['a2']), c(230, [1]), c(401, ['b1']), c(401, ['b2']), c(0, [])] };
    const data = clone(base);
    LL.apply(data, LL.diff(base, other));
    assert.deepEqual(data, other);
});

test('commands that do not line up replace the whole list and are counted', () => {
    const base = { list: [c(230, [1]), c(0, [])] }, other = { list: [c(221, []), c(0, [])] };
    const stats = { wholeLists: 0 };
    const data = clone(base);
    LL.apply(data, LL.diff(base, other, stats));
    assert.deepEqual(data, other);
    assert.equal(stats.wholeLists, 1);
});

test('a 2003 1.12 Show Picture that does not erase on map change keeps its picture', () => {
    const show = (flags) => ({ code: 11110, indent: 0, string: 'Pic', parameters: [5, 0, 160, 120, 0, 100, 0, 0, 100, 100, 100, 100, 0, 0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, flags] });
    const ctx = () => ({ itemKind: () => 'items', actors: {}, notes: {} });
    const kept = C.convertList([show(96), { code: 0, indent: 0, string: '', parameters: [] }], ctx());
    assert.ok(kept.list.some(x => x.code === 355 && x.parameters[0] === '$gameScreen.rrKeepPicture(5)'));
    for (const cmd of [show(97), { code: 11110, indent: 0, string: 'Pic', parameters: [5, 0, 160, 120, 0, 100, 0, 0, 100, 100, 100, 100, 0, 0] }]) {
        const erased = C.convertList([cmd, { code: 0, indent: 0, string: '', parameters: [] }], ctx());
        assert.ok(!erased.list.some(x => x.code === 355 && /rrKeepPicture/.test(x.parameters[0])), 'flag bit 0, and every older Show Picture, erases');
    }
});

test('the runtime erases pictures on a real map change only for projects that ask', () => {
    const fx = fs.readFileSync(path.join(repo, 'runtime', 'reactor_screen_fx.js'), 'utf8');
    assert.match(fx, /\$dataSystem\.rrPicturesEraseOnMapChange\s*&& this\._newMapId !== \$gameMap\.mapId\(\)/);
    assert.match(fx, /for \(let id = 1; id < base && id <= this\.maxPictures\(\); id\+\+\)/, 'named sprites above rrNamedSpriteBase are not pictures there');
    assert.match(fx, /if \(p && !p\._rrKeep\) this\.erasePicture\(id\)/);
    const convert = fs.readFileSync(path.join(repo, 'editor', 'src', 'legacy', 'LegacyConvert.js'), 'utf8');
    assert.match(convert, /out\.rrPicturesEraseOnMapChange = true;/);
});

test('RR_Language waits for a pack, patches the database and each map as it loads, and undoes it', () => {
    const src = fs.readFileSync(path.join(repo, 'editor', 'src', 'legacy', 'plugins', 'RR_Language.js'), 'utf8');
    assert.match(src, /xhr\.open\('GET', 'data\/Languages\/' \+ encodeURIComponent\(name\) \+ '\.json'\)/);
    assert.match(src, /if \(pending\) this\.setWaitMode\('rrLanguage'\)/);
    assert.match(src, /DataManager\.isMapLoaded = function\(\) \{[\s\S]*?if \(pending\) return false;[\s\S]*?patchMap\(\)/);
    // the plugin carries its own copy of apply(); it must stay the module's
    const body = (text) => /function apply\(target, ops\) \{([\s\S]*?)\n    \}/.exec(text)[1].replace(/\b(undo|out)\b/g, 'x').replace(/\s+/g, '');
    assert.equal(body(src), body(fs.readFileSync(path.join(repo, 'editor', 'src', 'legacy', 'LegacyLanguages.js'), 'utf8')));
});

const deep8 = path.join(repo, 'template', 'DEEP 8');
test('Deep 8: the English pack makes the German import match an English one', { skip: !fs.existsSync(path.join(deep8, 'Language', 'english')) && 'Deep 8 is not in this tree' }, () => {
    // Covered end to end by importing twice; here the importer's wiring is held.
    const importer = fs.readFileSync(path.join(repo, 'editor', 'src', 'legacy', 'LegacyImporter.js'), 'utf8');
    assert.match(importer, /const others = switches \? \['default', \.\.\.languages\(\)\]\.filter\(n => n !== baseName\) : \[\];/);
    assert.match(importer, /plugins\.push\('RR_Language'\)/);
});

test('RR_FastForward: every 2003 import gets EasyRPG\'s F (x3) and G (x10) keys, as whole extra game frames', () => {
    const importer = fs.readFileSync(path.join(repo, 'editor', 'src', 'legacy', 'LegacyImporter.js'), 'utf8');
    assert.match(importer, /plugins\.push\(\{ name: 'RR_FastForward', parameters: \(\) => \(\{ speedA: '3', speedB: '10' \}\) \}\);/);
    const src = fs.readFileSync(path.join(repo, 'editor', 'src', 'legacy', 'plugins', 'RR_FastForward.js'), 'utf8');
    const held = new Set();
    const counts = { frame: 0, input: 0, scene: 0 };
    const Input = { keyMapper: { 70: undefined }, isPressed: (k) => held.has(k) };
    const SceneManager = {
        _scene: { isStarted: () => true }, _nextScene: null,
        isGameActive: () => true,
        updateFrameCount() { counts.frame++; }, updateInputData() { counts.input++; }, updateEffekseer() {},
        updateScene() { counts.scene++; },
        updateMain() { this.updateFrameCount(); this.updateInputData(); this.updateScene(); }
    };
    const PluginManager = { parameters: () => ({ speedA: '3', speedB: '10' }) };
    new Function('Input', 'SceneManager', 'PluginManager', src)(Input, SceneManager, PluginManager);
    assert.equal(Input.keyMapper[70], 'rrFastForwardA');
    assert.equal(Input.keyMapper[71], 'rrFastForwardB');
    const run = () => { Object.assign(counts, { frame: 0, input: 0, scene: 0 }); SceneManager.updateMain(); return { ...counts }; };
    assert.deepEqual(run(), { frame: 1, input: 1, scene: 1 });
    held.add('rrFastForwardA');
    assert.deepEqual(run(), { frame: 3, input: 3, scene: 3 });
    held.add('rrFastForwardB');
    assert.deepEqual(run(), { frame: 10, input: 10, scene: 10 }, 'G wins');
    SceneManager._nextScene = {};
    assert.deepEqual(run(), { frame: 1, input: 1, scene: 1 }, 'a scene change ends the burst');
});
