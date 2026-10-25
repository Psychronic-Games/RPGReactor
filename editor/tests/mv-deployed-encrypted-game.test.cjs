'use strict';
// A deployed, encrypted RPG Maker MV game (Savior & Religion) converted to Reactor booted to a black
// screen: MV names encrypted files .rpgmvp / .rpgmvo where MZ adds "_", MV never encrypts
// img/system/Window.png, the converter took the deployed game (no Game.rpgproject) for MZ and turned
// the MV game rules off, and MOG_TitlePictureCom hid the stock title window through a method MZ never
// calls. Each piece is held here against the code that runs it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');

const core = runtimeSource('reactor_core.js');
const compat = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_mv_compat.js'), 'utf8');

/** The source from `start` up to (not including) `end`, both located in `source`. */
function slice(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `locatable: ${start}`);
    return source.slice(from, to);
}

function bitmapWith(files) {
    const calls = [];
    const Utils = {
        resolveFileCase: url => url,
        correctFileCase: () => null,
        localAssetExists: url => (files === null ? null : files.includes(url))
    };
    function Bitmap() {}
    const context = { Bitmap, Utils };
    vm.createContext(context);
    vm.runInContext(slice(core, 'Bitmap.prototype._startDecrypting = function', 'Bitmap.prototype._requestEncrypted = function'), context);
    vm.runInContext(slice(core, 'Bitmap.prototype._onEncryptedError = function', 'Bitmap.prototype._revokeObjectUrl = function'), context);
    const bitmap = new Bitmap();
    bitmap._url = 'img/system/Window.png';
    bitmap._requestEncrypted = url => calls.push(['encrypted', url]);
    bitmap._requestBytes = url => calls.push(['plain', url]);
    bitmap._onError = () => calls.push(['error']);
    return { bitmap, calls };
}

test('an encrypted image falls back from MZ\'s name to MV\'s, then to the file left plain', () => {
    const { bitmap, calls } = bitmapWith(null); // a browser: nothing known about the disk
    bitmap._startDecrypting();
    bitmap._onEncryptedError();
    bitmap._onEncryptedError();
    bitmap._onEncryptedError();
    assert.deepEqual(calls, [
        ['encrypted', 'img/system/Window.png_'],
        ['encrypted', 'img/system/Window.rpgmvp'],
        ['plain', 'img/system/Window.png'],
        ['error']
    ]);
});

test('with the disk at hand the name that is there is asked for first', () => {
    const plain = bitmapWith(['img/system/Window.png']);
    plain.bitmap._startDecrypting();
    assert.deepEqual(plain.calls, [['plain', 'img/system/Window.png']], 'MV leaves Window.png unencrypted');

    const mv = bitmapWith(['img/system/Window.rpgmvp']);
    mv.bitmap._startDecrypting();
    assert.deepEqual(mv.calls, [['encrypted', 'img/system/Window.rpgmvp']]);

    const mz = bitmapWith(['img/system/Window.png_']);
    mz.bitmap._startDecrypting();
    assert.deepEqual(mz.calls, [['encrypted', 'img/system/Window.png_']], 'an MZ game is unchanged');
});

test('encrypted MV audio is asked for as .rpgmvo once MZ\'s name is not found', () => {
    const io = runtimeSource('reactor_core_io.js');
    function WebAudio() {}
    const context = { WebAudio, Utils: { hasEncryptedAudio: () => true, isNwjs: () => false, correctFileCase: () => null, AUDIO_EXTENSIONS: ['.ogg'] } };
    vm.createContext(context);
    vm.runInContext(slice(io, 'WebAudio.prototype._realUrl = function', 'WebAudio.prototype._startXhrLoading = function'), context);
    vm.runInContext(slice(io, 'WebAudio.prototype._onError = function', 'WebAudio.prototype._onFetchProcess = function'), context);
    const audio = new WebAudio();
    let loads = 0;
    Object.assign(audio, { _url: 'audio/bgm/3.ogg', _fetchedSize: 0, _data: null, _sourceNodes: [], _triedCaseCorrection: true, _startLoading: () => loads++ });
    assert.equal(audio._realUrl(), 'audio/bgm/3.ogg_');
    audio._onError();
    assert.equal(loads, 1, 'loaded again under the MV name');
    assert.equal(audio._realUrl(), 'audio/bgm/3.rpgmvo');
    audio._onError();
    assert.equal(loads, 1, 'asked once');
    assert.equal(audio._isError, true);
});

function titleWindowClass() {
    const placed = [];
    function Window_TitleCommand(rect) { this.initialize(rect); }
    Window_TitleCommand.prototype.initialize = function(rect) { Object.assign(this, rect); };
    const context = { global: null, Window_TitleCommand, Graphics: { boxWidth: 816, boxHeight: 624 } };
    context.global = context;
    vm.createContext(context);
    vm.runInContext(slice(compat, '    function installTitleCommandPlacementCompatibility() {', '    // TIER 2 ONLY: MV window geometry')
        + '\ninstallTitleCommandPlacementCompatibility();', context);
    return { Window_TitleCommand, placed };
}

test('a title plugin\'s updatePlacement runs from the constructor, as MV ran it', () => {
    const { Window_TitleCommand } = titleWindowClass();
    // MOG_TitlePictureCom replaces it to hide the window behind its picture commands.
    Window_TitleCommand.prototype.updatePlacement = function() { this.visible = false; };
    const hidden = new Window_TitleCommand({ x: 288, y: 372, width: 240, height: 156 });
    assert.equal(hidden.visible, false);
});

test('a chained placement starts from MV\'s, and an untouched window keeps its rectangle', () => {
    const plain = titleWindowClass();
    const kept = new plain.Window_TitleCommand({ x: 10, y: 20, width: 240, height: 156 });
    assert.deepEqual([kept.x, kept.y], [10, 20], 'no plugin: the rectangle stands');

    const offset = titleWindowClass();
    const base = offset.Window_TitleCommand.prototype.updatePlacement;
    offset.Window_TitleCommand.prototype.updatePlacement = function() { base.call(this); this.y += 30; };
    const moved = new offset.Window_TitleCommand({ x: 0, y: 0, width: 240, height: 156 });
    assert.deepEqual([moved.x, moved.y], [288, 624 - 156 - 96 + 30], 'TitleCommandPosition adds to MV\'s place');
});

function projectManager() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'ProjectManager.js'), 'utf8');
    const ProjectManager = vm.runInNewContext(`${source}\nProjectManager;`, {
        RRJson: require('../src/utils/JsonFiles.js'), console, process, require, nw: {}
    });
    return new ProjectManager();
}

test('a deployed MV game is known by its corescript, with or without a marker', () => {
    const manager = projectManager();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-mv-detect-'));
    try {
        fs.mkdirSync(path.join(root, 'js'));
        assert.equal(manager.isRpgMakerMvProject(root), false, 'nothing to go on');
        fs.writeFileSync(path.join(root, 'js', 'rpg_core.js'), '');
        assert.equal(manager.isRpgMakerMvProject(root), true, 'MV corescript, no Game.rpgproject');
        fs.writeFileSync(path.join(root, 'game.rmmzproject'), 'RPGMZ 1.0.0');
        assert.equal(manager.isRpgMakerMvProject(root), true, 'an MZ marker dropped in does not outrank the corescript');
        fs.rmSync(path.join(root, 'js', 'rpg_core.js'));
        fs.writeFileSync(path.join(root, 'js', 'rmmz_core.js'), '');
        fs.writeFileSync(path.join(root, 'Game.rpgproject'), 'RPGMV 1.6.2');
        assert.equal(manager.isRpgMakerMvProject(root), false, 'MZ corescript means MZ');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('a game converted as MZ whose backup holds MV\'s corescript is switched to MV on open', () => {
    const manager = projectManager();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-mv-repair-'));
    try {
        const index = path.join(root, 'index.html');
        fs.writeFileSync(index, '<script>window.$reactorMvCompat = false;</script>');
        assert.deepEqual({ ...manager.repairMvCompatFlag(root) }, { ok: true, repaired: false }, 'no backup: left alone');
        manager.writeZipArchive(path.join(root, 'rpgmaker-runtime-backup.zip'), [{ name: 'js/rmmz_core.js', data: Buffer.from('') }]);
        assert.equal(manager.repairMvCompatFlag(root).repaired, false, 'an MZ backup: left alone');
        manager.writeZipArchive(path.join(root, 'rpgmaker-runtime-backup-2.zip'), [{ name: 'js/rpg_core.js', data: Buffer.from('') }]);
        assert.equal(manager.repairMvCompatFlag(root).repaired, true);
        assert.equal(fs.readFileSync(index, 'utf8'), '<script>window.$reactorMvCompat = true;</script>');
        assert.equal(manager.repairMvCompatFlag(root).repaired, false, 'once');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
