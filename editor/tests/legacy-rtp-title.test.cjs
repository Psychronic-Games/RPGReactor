'use strict';
// RPG Maker 2000/2003 imports: finding the RTP and the game font where the
// old engines installed them, the title as the old engines drew it, and
// windows with no area (a closed choice list) drawing nothing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.join(__dirname, '..');
const runtime = path.join(editorRoot, '..', 'runtime');
const I = require(path.join(editorRoot, 'src', 'legacy', 'LegacyImporter.js'));
const K = require(path.join(editorRoot, 'src', 'legacy', 'LegacyConvert.js'));

function rtpFolder(dir) {
    fs.mkdirSync(path.join(dir, 'CharSet'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'ChipSet'), { recursive: true });
    return dir;
}

test('an RTP kept beside the game, or in EasyRPG\'s folder, is found without being named', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-rtp-'));
    const saved = { HOME: process.env.HOME, XDG_DATA_HOME: process.env.XDG_DATA_HOME, RPG2K_RTP_PATH: process.env.RPG2K_RTP_PATH, RPG2K3_RTP_PATH: process.env.RPG2K3_RTP_PATH };
    try {
        process.env.HOME = path.join(root, 'home');
        process.env.XDG_DATA_HOME = path.join(root, 'xdg');
        delete process.env.RPG2K_RTP_PATH; delete process.env.RPG2K3_RTP_PATH;
        const game = path.join(root, 'games', 'Some Game');
        fs.mkdirSync(game, { recursive: true });
        assert.equal(I.findRtp('RPG Maker 2000', { source: game }), null);
        const beside = rtpFolder(path.join(root, 'games', 'RTP'));
        assert.equal(I.findRtp('RPG Maker 2000', { source: game }), beside);
        fs.rmSync(beside, { recursive: true });
        const easyrpg = rtpFolder(path.join(root, 'xdg', 'rtp', '2003'));
        assert.equal(I.findRtp('RPG Maker 2003', { source: game }), easyrpg);
        assert.equal(I.findRtp('RPG Maker 2003', { source: game, rtpPath: rtpFolder(path.join(root, 'named')) }), path.join(root, 'named'), 'a named folder comes first');
        assert.ok(I.rtpCandidates('RPG Maker 2000', {}).some(p => /ASCII.RPG2000.RTP$/.test(p)), 'the installers\' own folders are still looked in');
    } finally {
        for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('the game font is found in a named file, the RTP\'s folder or the user\'s fonts, whatever its case', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-font-'));
    const savedHome = process.env.HOME;
    try {
        process.env.HOME = path.join(root, 'home');
        const wanted = ['RM2000.fon', 'RMG2000.fon'];
        assert.equal(I.findLegacyFont(wanted, []), null);
        const named = path.join(root, 'elsewhere', 'RM2000.fon');
        fs.mkdirSync(path.dirname(named), { recursive: true }); fs.writeFileSync(named, 'x');
        assert.equal(I.findLegacyFont(wanted, [named]), named);
        const rtp = rtpFolder(path.join(root, 'RPG Maker 2000', 'RTP'));
        const besideRtp = path.join(path.dirname(rtp), 'rmg2000.FON');
        fs.writeFileSync(besideRtp, 'x');
        assert.equal(I.findLegacyFont(wanted, [rtp, path.dirname(rtp)]), besideRtp);
        const userFonts = path.join(root, 'home', '.local', 'share', 'fonts', 'bitmap');
        fs.mkdirSync(userFonts, { recursive: true }); fs.writeFileSync(path.join(userFonts, 'RM2000.fon'), 'x');
        assert.equal(I.findLegacyFont(wanted, []), path.join(userFonts, 'RM2000.fon'));
    } finally {
        if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('probe says whether a 2000/2003 game takes files from the RTP', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-probe-'));
    try {
        fs.writeFileSync(path.join(root, 'RPG_RT.ldb'), 'not a database');
        fs.writeFileSync(path.join(root, 'RPG_RT.ini'), '[RPG_RT]\r\nGameTitle=Game\r\n');
        assert.equal(I.probe(root).needsRtp, true);
        fs.writeFileSync(path.join(root, 'RPG_RT.ini'), '[RPG_RT]\r\nGameTitle=Game\r\nFullPackageFlag=1\r\n');
        assert.equal(I.probe(root).needsRtp, false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('an imported 2000/2003 title is the game\'s picture and the old engines\' menu', () => {
    const system = K.systemJson({ advanced: {}, titleCommandWindow: { background: 0, offsetX: 0, offsetY: 0 } }, { system: {}, engine: 'RPG Maker 2000' }, null, null);
    assert.equal(system.optDrawTitle, false, 'no game title drawn over the picture');
    assert.equal(system.rrLegacyTitle, true);
    const dialog = fs.readFileSync(path.join(editorRoot, 'src', 'LegacyImportDialog.js'), 'utf8');
    assert.match(dialog, /findRtp\(probed\.engine/, 'the dialog looks for the RTP as soon as a game is picked');
    assert.match(dialog, /Import without the RTP\?/, 'and asks before importing without it');
    assert.match(fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseSystem2Editor.js'), 'utf8'), /path: 'rrLegacyTitle'/, 'System 2 shows the rule');
});

function loadTitle(system) {
    const src = fs.readFileSync(path.join(runtime, 'reactor_windows.js'), 'utf8');
    const start = src.indexOf('// The RPG Maker 2000/2003 title (System.json rrLegacyTitle');
    const end = src.indexOf('})();', start) + '})();'.length;
    assert.ok(start >= 0 && end > start, 'the legacy title block is locatable');
    function Window_Selectable() {}
    Window_Selectable.prototype.itemHeight = function() { return this.lineHeight() + 8; };
    Window_Selectable.prototype.rowSpacing = () => 4;
    Window_Selectable.prototype.itemPadding = () => 8;
    function Window_Command() {}
    Window_Command.prototype = Object.create(Window_Selectable.prototype);
    Window_Command.prototype.itemTextAlign = () => 'center';
    function Window_TitleCommand() {}
    Window_TitleCommand.prototype = Object.create(Window_Command.prototype);
    Window_TitleCommand.prototype.makeCommandList = function() {
        this._list = [{ name: 'New', symbol: 'newGame' }, { name: 'Continue', symbol: 'continue' }, { name: 'End', symbol: 'shutdown' }, { name: 'Options', symbol: 'options' }];
    };
    Object.assign(Window_TitleCommand.prototype, {
        lineHeight: () => 16, textWidth: text => text.length * 6, padding: 8,
        fittingHeight(n) { return n * this.itemHeight() + this.padding * 2; },
        move(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); }, createContents() {}, refresh() {}
    });
    function Scene_Title() {}
    Scene_Title.prototype.createCommandWindow = function() { this._commandWindow = new Window_TitleCommand(); this._commandWindow.makeCommandList(); };
    const context = { Window_TitleCommand, Scene_Title, $dataSystem: system, Graphics: { width: 320, height: 240, boxWidth: 312, boxHeight: 232 } };
    vm.runInNewContext(src.slice(start, end), context);
    return context;
}

test('the old engines\' title menu: three one-line commands as wide as the widest, centred low on the screen', () => {
    const { Scene_Title } = loadTitle({ rrLegacyTitle: true, titleCommandWindow: {} });
    const scene = new Scene_Title();
    scene.createCommandWindow();
    const w = scene._commandWindow;
    assert.deepEqual(w._list.map(c => c.symbol), ['newGame', 'continue', 'shutdown'], 'no Options');
    assert.deepEqual([w.itemHeight(), w.rowSpacing(), w.itemPadding(), w.itemTextAlign()], [16, 0, 0, 'left']);
    // 'Continue' is 48 px wide: the window is 64 x 64; on screen at (128, 212 - 64), inside a layer inset 4 px.
    assert.deepEqual([w.x + 4, w.y + 4, w.width, w.height], [128, 148, 64, 64]);
    const mz = loadTitle({ titleCommandWindow: {} });
    const plain = new mz.Scene_Title();
    plain.createCommandWindow();
    assert.equal(plain._commandWindow._list.length, 4, 'other projects keep their commands');
    assert.deepEqual([plain._commandWindow.itemHeight(), plain._commandWindow.itemTextAlign()], [24, 'center']);
});

test('a window with no width or height tiles no back', () => {
    const src = fs.readFileSync(path.join(runtime, 'reactor_core_display.js'), 'utf8');
    const start = src.indexOf('Window.prototype._refreshBack = function() {');
    const end = src.indexOf('\n};\n', start) + 4;
    function Window() {}
    vm.runInNewContext(src.slice(start, end), { Window });
    const tiling = { visible: true, scale: {}, setFrame() {}, move(x, y, w, h) { this.size = [w, h]; } };
    const back = { children: [tiling], scale: {}, move() {}, setFrame() {}, setColorTone() {} };
    const win = Object.assign(new Window(), { _backSprite: back, _margin: 0, _width: 0, _height: 0, _windowskin: {}, _colorTone: [0, 0, 0, 0] });
    win._refreshBack();
    assert.equal(tiling.visible, false);
    assert.ok(Number.isFinite(tiling.scale.x) && Number.isFinite(tiling.scale.y), 'no infinite scale');
    Object.assign(win, { _width: 190, _height: 95 });
    win._refreshBack();
    assert.equal(tiling.visible, true);
    assert.deepEqual([tiling.scale.x, tiling.scale.y], [0.5, 1]);
});

test('the RTP is chosen afresh for each game: a folder picked in the dialog is a place to look, and clearing means none', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-known-'));
    const saved = { HOME: process.env.HOME, XDG_DATA_HOME: process.env.XDG_DATA_HOME, RPG2K_RTP_PATH: process.env.RPG2K_RTP_PATH, RPG2K3_RTP_PATH: process.env.RPG2K3_RTP_PATH };
    try {
        process.env.HOME = path.join(root, 'home'); process.env.XDG_DATA_HOME = path.join(root, 'xdg');
        delete process.env.RPG2K_RTP_PATH; delete process.env.RPG2K3_RTP_PATH;
        const game = path.join(root, 'games', 'Game');
        fs.mkdirSync(game, { recursive: true });
        const used = rtpFolder(path.join(root, 'elsewhere', 'My RTP'));
        assert.equal(I.findRtp('RPG Maker 2000', { source: game }), null);
        assert.equal(I.findRtp('RPG Maker 2000', { source: game, known: [path.join(root, 'gone'), used] }), used, 'a folder chosen before is found again; one since removed is passed over');
        assert.equal(I.findRtp('RPG Maker 2000', { source: game, known: [used], noRtp: true }), null, 'cleared: none');
        const dialog = fs.readFileSync(path.join(editorRoot, 'src', 'LegacyImportDialog.js'), 'utf8');
        assert.doesNotMatch(dialog, /rtpInput\.value = localStorage|setItem\('rrLegacyImportRtp/, 'nothing about the RTP is kept between imports');
        assert.match(dialog, /rtpMode = 'auto';\n\s+updateRtp\(\);/, 'picking a game finds its RTP afresh');
        assert.match(dialog, /noRtp: rtpMode === 'none'/);
    } finally {
        for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        fs.rmSync(root, { recursive: true, force: true });
    }
});
