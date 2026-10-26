'use strict';
// Deployment › Unused Files (build-scripts/unused-assets.cjs): a file is left out only when nothing could load
// it: not the data, a plugin's parameters or its code, an effect or a model that ships, a playtest, or the
// project's Always include list. The runtime writes the playtest record; both deployments prune by it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editor = path.join(__dirname, '..');
const Unused = require(path.join(editor, 'build-scripts', 'unused-assets.cjs'));
const Prefs = require(path.join(editor, 'src', 'DeploymentAssetPreferences.js'));

function project(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-unused-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const put = (rel, content = 'x') => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), content);
    };
    put('index.html', '<script src="js/main.js"></script>');
    put('js/main.js', 'PluginManager.setup($plugins);');
    put('data/Actors.json', JSON.stringify([null, { id: 1, characterName: 'Actor1', faceName: 'Hero Face', battlerName: '' }]));
    put('data/Map001.json', JSON.stringify({ bgm: { name: 'Battle1' }, events: [null, { pages: [{ list: [{ code: 231, parameters: [1, 'Sub/Banner'] }] }] }] }));
    put('data/Animations.json', JSON.stringify([null, { id: 1, effectName: 'Fire' }]));
    put('data/Map001.r3d.json', JSON.stringify({ props: [{ name: 'Props/Tree', file: 'tree', ext: '.glb' }], pieces: [{ material: 'stone' }] }));
    put('js/plugins.js', 'var $plugins = ' + JSON.stringify([
        { name: 'HudOn', status: true, parameters: { cursor: 'Cursor' } },
        { name: 'HudOff', status: false, parameters: {} },
    ]) + ';\n');
    put('js/plugins/HudOn.js', 'ImageManager.loadPicture("Face_" + actor.actorId());');
    put('js/plugins/HudOff.js', 'ImageManager.loadPicture("OnlyOff");');
    put('js/plugins/Leftover.js', '// not in the list');
    for (const name of ['Actor1.png', 'Actor10.png']) put('img/characters/' + name);
    put('img/faces/Hero Face.png');
    put('img/pictures/Sub/Banner.png');
    put('img/pictures/Cursor.png');
    put('img/pictures/Face_1.png');
    put('img/pictures/Face_2.png');
    put('img/pictures/OnlyOff.png');
    put('img/pictures/Banner.psd');
    put('img/system/Window.png');
    put('img/materials/stone.png');
    put('img/materials/stone_normal.png');
    put('img/materials/marble.png');
    for (const name of ['Battle1.ogg', 'Battle1.m4a', 'Battle10.ogg', 'Bonus.ogg']) put('audio/bgm/' + name);
    // An effect names its textures as UTF-16 text, relative to itself.
    const utf16 = text => Buffer.from(text, 'utf16le');
    put('effects/Fire.efkefc', Buffer.concat([Buffer.from('EFKE\0\0\0\0'), utf16('Texture/Flame.png'), Buffer.alloc(4)]));
    put('effects/Ice.efkefc', Buffer.concat([Buffer.from('EFKE\0\0\0\0'), utf16('Texture/Frost.png'), Buffer.alloc(4)]));
    put('effects/Texture/Flame.png');
    put('effects/Texture/Frost.png');
    put('3d/Props/Tree/source/tree.glb');
    put('3d/Props/Tree/textures/bark.png');
    put('3d/Props/Tree/source/tree.blend');
    put('3d/Props/Rock/source/rock.glb');
    return { root, put };
}

const used = (analysis, rel) => analysis.files.find(f => f.path === rel)?.used;

test('a file ships when the data, a plugin parameter or a switched-on plugin names it; not otherwise', t => {
    const { root } = project(t);
    const a = Unused.analyze(root);
    assert.equal(used(a, 'img/characters/Actor1.png'), true);
    assert.equal(used(a, 'img/characters/Actor10.png'), false, 'Actor1 is not Actor10');
    assert.equal(used(a, 'img/faces/Hero Face.png'), true, 'a name with a space');
    assert.equal(used(a, 'img/pictures/Sub/Banner.png'), true, 'a picture in a subfolder');
    assert.equal(used(a, 'img/pictures/Cursor.png'), true, 'a plugin parameter');
    assert.equal(used(a, 'img/pictures/OnlyOff.png'), false, 'only a switched-off plugin names it');
    assert.equal(used(a, 'audio/bgm/Battle1.ogg'), true);
    assert.equal(used(a, 'audio/bgm/Battle1.m4a'), true, 'every format of a name');
    assert.equal(used(a, 'audio/bgm/Battle10.ogg'), false);
    assert.equal(used(a, 'audio/bgm/Bonus.ogg'), false);
    assert.equal(used(a, 'img/system/Window.png'), true, 'the runtime loads the system sheets by name');
    assert.equal(used(a, 'img/pictures/Banner.psd'), false, 'a working file of an art program');
    assert.match(a.files.find(f => f.path === 'audio/bgm/Bonus.ogg').reason, /nothing/);
});

test('names a plugin builds from a fixed start ship: "Face_" + id keeps every Face_', t => {
    const { root } = project(t);
    const a = Unused.analyze(root);
    assert.equal(used(a, 'img/pictures/Face_1.png'), true);
    assert.equal(used(a, 'img/pictures/Face_2.png'), true);
    assert.match(a.files.find(f => f.path === 'img/pictures/Face_2.png').reason, /Face_/i);
    const starts = Unused.namePrefixes('loadpicture(`hud_${id}`); format("card_%1"); x = "short" + 1; "ab" + c', new Set());
    assert.deepEqual([...starts].sort(), ['card_', 'hud_', 'short']);
});

test('plugin files ship when the plugin list names them, switched on or off', t => {
    const { root } = project(t);
    const a = Unused.analyze(root);
    assert.equal(used(a, 'js/plugins/HudOn.js'), true);
    assert.equal(used(a, 'js/plugins/HudOff.js'), true);
    assert.equal(used(a, 'js/plugins/Leftover.js'), false);
});

test('a model ships whole when it is placed, without its working files; an effect ships with the textures it loads', t => {
    const { root } = project(t);
    const a = Unused.analyze(root);
    assert.equal(used(a, '3d/Props/Tree/source/tree.glb'), true);
    assert.equal(used(a, '3d/Props/Tree/textures/bark.png'), true);
    assert.equal(used(a, '3d/Props/Tree/source/tree.blend'), false);
    assert.equal(used(a, '3d/Props/Rock/source/rock.glb'), false);
    assert.equal(used(a, 'effects/Fire.efkefc'), true);
    assert.equal(used(a, 'effects/Texture/Flame.png'), true);
    assert.equal(used(a, 'effects/Ice.efkefc'), false);
    assert.equal(used(a, 'effects/Texture/Frost.png'), false, 'only an effect that does not ship loads it');
    assert.equal(used(a, 'img/materials/stone.png'), true);
    assert.equal(used(a, 'img/materials/stone_normal.png'), true, 'a material keeps its companions');
    assert.equal(used(a, 'img/materials/marble.png'), false);
});

test('the Always include list and the playtest record keep what nothing names', t => {
    const { root, put } = project(t);
    Unused.writeSettings(root, { keep: ['audio/bgm/Bon*', ''] });
    put(Unused.USAGE_FILE, JSON.stringify({ files: ['3d/Props/Rock/source/rock.glb', 'img/characters/Actor10.png_'] }));
    const a = Unused.analyze(root);
    assert.equal(used(a, 'audio/bgm/Bonus.ogg'), true);
    assert.equal(used(a, 'audio/bgm/Battle10.ogg'), false);
    assert.equal(used(a, '3d/Props/Rock/source/rock.glb'), true, 'a model a playtest loaded');
    assert.equal(used(a, 'img/characters/Actor10.png'), true, 'recorded encrypted, kept plain');
    assert.deepEqual(Unused.readSettings(root), { keep: ['audio/bgm/Bon*'] });
    assert.equal(a.playtestRecord, true);
    const test = Unused.patternTest(['img/pictures', 'audio/**/Theme']);
    assert.equal(test('img/pictures/Sub/A.png'), true, 'a folder keeps everything in it');
    assert.equal(test('audio/bgm/Theme.ogg'), true);
    assert.equal(test('audio/bgm/Theme2.ogg'), false);
});

test('a plugin that lists a folder keeps the folder whole', t => {
    const { root, put } = project(t);
    put('js/plugins/HudOn.js', 'const files = fs.readdirSync("audio/bgm/"); ImageManager.loadPicture("Face_" + id);');
    const a = Unused.analyze(root);
    assert.equal(used(a, 'audio/bgm/Bonus.ogg'), true);
    assert.match(a.files.find(f => f.path === 'audio/bgm/Bonus.ogg').reason, /lists/);
});

test('pruning a copy removes the same files encrypted or converted, and the folders it empties; data and code stay', t => {
    const { root } = project(t);
    const a = Unused.analyze(root);
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-unused-copy-'));
    t.after(() => fs.rmSync(copy, { recursive: true, force: true }));
    fs.cpSync(root, copy, { recursive: true });
    // An encrypted build: Bonus.ogg is Bonus.ogg_, Actor10.png is Actor10.png_.
    fs.renameSync(path.join(copy, 'audio/bgm/Bonus.ogg'), path.join(copy, 'audio/bgm/Bonus.ogg_'));
    fs.renameSync(path.join(copy, 'img/characters/Actor10.png'), path.join(copy, 'img/characters/Actor10.png_'));
    const removed = Unused.prune(copy, a);
    assert.equal(removed, a.unused.length);
    assert.equal(fs.existsSync(path.join(copy, 'audio/bgm/Bonus.ogg_')), false);
    assert.equal(fs.existsSync(path.join(copy, 'img/characters/Actor10.png_')), false);
    assert.equal(fs.existsSync(path.join(copy, 'img/characters/Actor1.png')), true);
    assert.equal(fs.existsSync(path.join(copy, '3d/Props/Tree/source/tree.glb')), true, 'the model stays beside its working file');
    assert.equal(fs.existsSync(path.join(copy, '3d/Props/Tree/source/tree.blend')), false);
    assert.equal(fs.existsSync(path.join(copy, '3d/Props/Rock')), false, 'an emptied model folder goes');
    assert.equal(fs.existsSync(path.join(copy, 'data/Actors.json')), true);
    assert.equal(fs.existsSync(path.join(copy, 'js/plugins/HudOff.js')), true);
    assert.match(Unused.describe(a), /unused files \([\d.]+ MB\) left out/);
});

test('the deploy choice is off, web or all, Web builds by default, remembered apart for the editor distribution', () => {
    const store = new Map();
    const storage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) };
    assert.equal(Prefs.loadUnusedFiles(storage), 'web');
    Prefs.saveUnusedFiles('all', storage);
    assert.equal(Prefs.loadUnusedFiles(storage), 'all');
    assert.equal(Prefs.loadUnusedFiles(storage, Prefs.DIST_UNUSED_FILES_KEY), 'web');
    assert.equal(Prefs.normalizeUnusedFiles('nonsense'), 'web');
    assert.equal(Prefs.normalizeUnusedFiles('off'), 'off');
});

test('both deployments prune with the analysis, and never ship the record or the list', () => {
    const worker = fs.readFileSync(path.join(editor, 'build-scripts', 'build-worker.js'), 'utf8');
    assert.match(worker, /unusedAssets\.prune\(stagingDir, unusedAnalysis\)/, 'every build: the staging folder');
    assert.match(worker, /unusedAssets\.prune\(platformOutDir, unusedAnalysis\)/, 'Web builds: the web copy, before its file index');
    assert.ok(worker.indexOf('unusedAssets.prune(platformOutDir') < worker.indexOf('webFileIndex.writeWebFileIndex(platformOutDir)'));
    for (const file of ['build-worker.js', 'build.js']) {
        const source = fs.readFileSync(path.join(editor, 'build-scripts', file), 'utf8');
        assert.match(source, /'deploy\.rpgreactor\.json'/, file);
        assert.match(source, /'asset-usage\.rpgreactor\.json'/, file);
    }
    const dist = fs.readFileSync(path.join(editor, 'build-scripts', 'dist-editor-worker.js'), 'utf8');
    assert.match(dist, /trimWebProject\(path\.join\(webRoot, 'project'\), log, unusedFiles !== 'off'\)/);
    assert.match(dist, /if \(unusedFiles === 'all'\)/);
});

test('test play records each asset it loads once, under the project, and keeps what earlier plays recorded', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-usage-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.writeFileSync(path.join(root, Unused.USAGE_FILE), JSON.stringify({ files: ['audio/se/Old.ogg'] }));
    const core = fs.readFileSync(path.join(editor, '..', 'runtime', 'reactor_core.js'), 'utf8');
    const block = core.slice(core.indexOf('Utils.ASSET_USAGE_FILE'), core.indexOf('Utils.startAssetUseRecord();'));
    const Utils = { isNwjs: () => true, isOptionValid: name => name === 'test' };
    const window = { location: { href: 'file:///game/index.html' }, addEventListener() {} };
    vm.runInNewContext(block, { Utils, window, URL, require, process: { mainModule: { filename: path.join(root, 'index.html') } } });
    Utils._assetUse = { seen: new Set(), fresh: new Set() };
    for (const url of ['file:///game/img/pictures/A%20B.png?v=1', 'file:///game/img/pictures/A%20B.png', 'file:///game/js/main.js', 'https://cdn.example/x.png', 'file:///game/audio/se/Old.ogg']) Utils.noteAssetUse(url);
    Utils.saveAssetUse();
    const record = JSON.parse(fs.readFileSync(path.join(root, Unused.USAGE_FILE), 'utf8'));
    assert.deepEqual(record.files, ['audio/se/Old.ogg', 'img/pictures/A B.png']);
    assert.equal(Utils._assetUse.fresh.size, 0);
});

test('the record sees every way a page fetches a file: fetch, XMLHttpRequest, an image or a sound, a font', () => {
    const core = fs.readFileSync(path.join(editor, '..', 'runtime', 'reactor_core.js'), 'utf8');
    const block = core.slice(core.indexOf('Utils.ASSET_USAGE_FILE'), core.indexOf('Utils.startAssetUseRecord();'));
    // As in a browser: each element type has its own src.
    class HTMLImageElement { set src(value) { this._src = value; } get src() { return this._src; } }
    class HTMLMediaElement { set src(value) { this._src = value; } get src() { return this._src; } }
    class XMLHttpRequest { open() {} }
    class FontFace { constructor(family, source) { this.source = source; } }
    const window = { location: { href: 'chrome-extension://abc/index.html' }, addEventListener() {}, fetch: () => Promise.resolve('ok') };
    window.FontFace = FontFace;
    const Utils = { isNwjs: () => true, isOptionValid: () => false };
    const context = { Utils, window, location: window.location, URL, XMLHttpRequest, HTMLImageElement, HTMLMediaElement, setInterval: () => 0 };
    vm.runInNewContext(block, context);
    Utils.startAssetUseRecord();
    assert.equal(Utils._assetUse, undefined, 'not outside test play');
    Utils.startAssetUseRecord(true);
    window.fetch('effects/Fire.efkefc');
    new XMLHttpRequest().open('GET', 'audio/se/Bell.ogg');
    const image = new HTMLImageElement(); image.src = 'img/pictures/A.png';
    assert.equal(image.src, 'img/pictures/A.png', 'the image still gets its picture');
    new HTMLMediaElement().src = 'movies/Intro.webm';
    new window.FontFace('Game', 'url("fonts/Game.woff")');
    new XMLHttpRequest().open('GET', 'data/System.json');
    assert.deepEqual([...Utils._assetUse.seen].sort(), ['audio/se/Bell.ogg', 'effects/Fire.efkefc', 'fonts/Game.woff', 'img/pictures/A.png', 'movies/Intro.webm']);
});

test('loading the runtime where there is no page (a test, a tool) starts no record and throws nothing', () => {
    const core = fs.readFileSync(path.join(editor, '..', 'runtime', 'reactor_core.js'), 'utf8');
    const block = core.slice(core.indexOf('Utils.ASSET_USAGE_FILE'), core.indexOf('Utils.resolveFileCase = function'));
    const Utils = { isNwjs: () => true, isOptionValid: () => { throw new Error('no location'); } };
    assert.doesNotThrow(() => vm.runInNewContext(block, { Utils, require, process }));
    assert.equal(Utils._assetUse, undefined);
});
