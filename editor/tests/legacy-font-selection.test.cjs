'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const I = require('../src/legacy/LegacyImporter.js');
const F = require('../src/legacy/LegacyFont.js');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const source = path.resolve(__dirname, '../../template/Sunset over Imdahl');
function fixtureFont(face) {
    const b = Buffer.alloc(118 + 8 + 26 + face.length + 1);
    b.writeUInt16LE(0x200, 0); b.writeUInt16LE(11, 74); b.writeUInt16LE(13, 88);
    b[95] = b[96] = 65; b.writeUInt16LE(15, 118); b.writeUInt16LE(126, 120);
    for (let y = 1; y < 11; y++) b[126 + y] = 0x70;
    b.writeUInt32LE(152, 105); b.write(face, 152, 'latin1'); return b;
}
function pick(source, name) { const a = source.indexOf(name + ' = function'); assert.ok(a >= 0, name); return source.slice(a, source.indexOf('\n};', a) + 3); }
test('a full-package game discovers installed RTP fonts independently from image RTP and carries both families', { skip: !fs.existsSync(path.join(source, 'RPG_RT.LDB')) }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-font-selection-'));
    const saved = Object.fromEntries(['HOME', 'USERPROFILE', 'XDG_DATA_HOME', 'RPG2K_RTP_PATH', 'RPG2K3_RTP_PATH'].map(k => [k, process.env[k]]));
    try {
        process.env.HOME = path.join(root, 'home'); process.env.XDG_DATA_HOME = path.join(root, 'data');
        delete process.env.USERPROFILE; delete process.env.RPG2K_RTP_PATH; delete process.env.RPG2K3_RTP_PATH;
        const rtp = path.join(root, 'installed-rtp'); fs.mkdirSync(rtp);
        for (const face of ['RMG2000', 'RM2000']) fs.writeFileSync(path.join(rtp, face + '.fon'), fixtureFont(face));
        const dest = path.join(root, 'imported'); const lines = [];
        await I.importProject(source, dest, { maps: [11], skipAssets: true, known: [rtp], log: line => lines.push(line) });
        const system = JSON.parse(fs.readFileSync(path.join(dest, 'data/System.json')));
        assert.equal(lines.some(line => /^  RTP:/.test(line)), false, 'no image RTP was needed');
        assert.equal(system.advanced.mainFontFilename, 'RMG2000.ttf');
        assert.equal(system.rrLegacyFontId, 0, 'omitted initial selection means Gothic');
        assert.deepEqual(system.rrLegacyFonts, { 0: { filename: 'RMG2000.ttf', height: 13, ascent: 11 }, 1: { filename: 'RM2000.ttf', height: 13, ascent: 11 } });
        for (const font of Object.values(system.rrLegacyFonts)) assert.ok(fs.existsSync(path.join(dest, 'fonts', font.filename)));
        const explicit = path.join(root, 'explicit'); fs.mkdirSync(explicit);
        fs.writeFileSync(path.join(explicit, 'RMG2000.fon'), fixtureFont('AuthorGothic'));
        await I.importProject(source, dest, { maps: [11], skipAssets: true, force: true, known: [rtp], fontPath: explicit, log() {} });
        const author = JSON.parse(fs.readFileSync(path.join(dest, 'data/System.json')));
        assert.equal(author.advanced.mainFontFilename, 'AuthorGothic.ttf', 'an explicitly supplied font precedes the installed RTP');
        const gothic = fixtureFont('SharedFace'), mincho = fixtureFont('SharedFace');
        mincho[128] = 0x10; // Distinct glyph artwork despite the same internal face name.
        fs.writeFileSync(path.join(explicit, 'RMG2000.fon'), gothic);
        fs.writeFileSync(path.join(explicit, 'RM2000.fon'), mincho);
        await I.importProject(source, dest, { maps: [11], skipAssets: true, force: true, known: [rtp], fontPath: explicit, log() {} });
        const shared = JSON.parse(fs.readFileSync(path.join(dest, 'data/System.json')));
        assert.notEqual(shared.rrLegacyFonts[0].filename.toLowerCase(), shared.rrLegacyFonts[1].filename.toLowerCase(), 'a shared internal face name cannot overwrite either family');
        for (const [id, bytes] of [[0, gothic], [1, mincho]]) {
            const converted = F.convert(bytes, { decode: code => new TextDecoder('windows-1252').decode(Uint8Array.of(code)) });
            assert.deepEqual(fs.readFileSync(path.join(dest, 'fonts', shared.rrLegacyFonts[id].filename)), Buffer.from(converted.ttf), 'each family retains its own original glyph artwork');
        }
    } finally {
        for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('active font family/metrics survive saves; ordinary projects retain their configured fonts', () => {
    function Game_System() {}
    const data = { advanced: { fallbackFonts: 'sans-serif', fontSize: 26 }, rrLegacyFontId: 0, rrLegacyFonts: { 0: { filename: 'G.ttf', height: 13, ascent: 11 }, 1: { filename: 'M.ttf', height: 12, ascent: 10 } } };
    const sandbox = { Game_System, $dataSystem: data };
    const runtime = runtimeSource('reactor_objects.js');
    vm.runInNewContext(['legacyFontId', 'legacyFontInfo', 'mainFontFace', 'numberFontFace', 'mainFontSize'].map(name => pick(runtime, 'Game_System.prototype.' + name)).join('\n'), sandbox);
    let system = new Game_System(); assert.equal(system.mainFontFace(), 'rmmz-legacy-font-0, sans-serif'); assert.equal(system.mainFontSize(), 13);
    system._rrFontId = 1; system = Object.assign(new Game_System(), JSON.parse(JSON.stringify(system)));
    assert.equal(system.mainFontSize(), 12); assert.equal(system.numberFontFace(), 'rmmz-legacy-font-1, sans-serif');
    delete system._rrFontId; system._rrWindowSkin = { font: 1 }; assert.equal(system.legacyFontId(), 1, 'saved selections from the earlier skin-only implementation still apply');
    delete data.rrLegacyFonts; assert.equal(system.mainFontFace(), 'rmmz-mainfont, sans-serif'); assert.equal(system.mainFontSize(), 26);
});

test('a system-graphic font change waits for the selected font and palette together and surfaces load failures', () => {
    function Game_Interpreter() {} let fontReady = false, skinReady = false;
    Game_Interpreter.prototype.updateWaitMode = () => false;
    const loads = [], sandbox = { Game_Interpreter, $dataSystem: { rrLegacySkins: { other: 'Other' } }, $gameSystem: { legacyFontInfo: () => ({ filename: 'M.ttf' }) }, ColorManager: { loadWindowskin() {}, _windowskin: { isReady: () => skinReady } }, FontManager: { load: (...args) => loads.push(args), isReady: () => fontReady } };
    const source = fs.readFileSync(path.resolve(__dirname, '../../runtime/reactor_objects_legacy.js'), 'utf8');
    const wait = source.slice(source.indexOf('    const _updateWaitMode'), source.indexOf('\n    // Run another map event'));
    const a = source.indexOf('    Game_Interpreter.prototype.rrSystemGraphic = function'), b = source.indexOf('\n    };', a);
    vm.runInNewContext(wait + '\n' + source.slice(a, b + 7), sandbox);
    const interpreter = new Game_Interpreter(); interpreter.setWaitMode = mode => { interpreter._waitMode = mode; };
    interpreter.rrSystemGraphic('Other', 0, 1); assert.deepEqual(loads, [['rmmz-legacy-font-1', 'M.ttf']]);
    assert.equal(interpreter.updateWaitMode(), true); fontReady = true; assert.equal(interpreter.updateWaitMode(), true);
    skinReady = true; assert.equal(interpreter.updateWaitMode(), false); assert.equal(interpreter._waitMode, '');
    sandbox.FontManager.isReady = () => { throw new Error('font load failed'); }; interpreter._waitMode = 'rrSystemGraphic';
    assert.throws(() => interpreter.updateWaitMode(), /font load failed/);
});

test('boot preloads both alternate families before a saved font selection can draw a window', () => {
    function Scene_Boot() {} const loads = [];
    const data = { advanced: { mainFontFilename: 'G.ttf', numberFontFilename: 'G.ttf' }, rrLegacyFonts: { 0: { filename: 'G.ttf' }, 1: { filename: 'M.ttf' } } };
    vm.runInNewContext(pick(fs.readFileSync(path.resolve(__dirname, '../../runtime/reactor_scenes.js'), 'utf8'), 'Scene_Boot.prototype.loadGameFonts'), { Scene_Boot, $dataSystem: data, FontManager: { load: (...args) => loads.push(args) } });
    new Scene_Boot().loadGameFonts();
    assert.deepEqual(loads, [['rmmz-mainfont', 'G.ttf'], ['rmmz-numberfont', 'G.ttf'], ['rmmz-legacy-font-0', 'G.ttf'], ['rmmz-legacy-font-1', 'M.ttf']]);
    delete data.rrLegacyFonts; loads.length = 0; new Scene_Boot().loadGameFonts(); assert.equal(loads.length, 2, 'native MZ projects do not load legacy fonts');
});
