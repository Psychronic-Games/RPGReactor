// RPG Maker XP / VX / VX Ace import: the Ruby Marshal reader, the RGSS archive
// reader, the Ace → MZ conversion, and (when the local corpus is present) a
// whole-game import of The Seventh Warrior.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const M = require(path.join(legacy, 'RubyMarshal.js'));
const A = require(path.join(legacy, 'RgssArchive.js'));
const C = require(path.join(legacy, 'RgssConvert.js'));
const I = require(path.join(legacy, 'LegacyImporter.js'));

// ---- a small Marshal 4.8 writer, enough to build RGSS data -------------------
function marshal(value) {
    const out = [4, 8];
    const symbols = new Map();
    const long = (n) => {
        if (n === 0) return out.push(0);
        if (n > 0 && n < 123) return out.push(n + 5);
        if (n < 0 && n > -124) return out.push((n - 5) & 0xff);
        const bytes = []; let v = n;
        for (let i = 0; i < 4; i++) { bytes.push(v & 0xff); v >>= 8; if (n >= 0 ? v === 0 : v === -1) break; }
        out.push((n >= 0 ? bytes.length : -bytes.length) & 0xff, ...bytes);
    };
    const bytes = (b) => { long(b.length); out.push(...b); };
    const sym = (name) => {
        if (symbols.has(name)) { out.push(0x3b); return long(symbols.get(name)); }
        symbols.set(name, symbols.size); out.push(0x3a); bytes([...Buffer.from(name, 'utf8')]);
    };
    const write = (v) => {
        if (v === null || v === undefined) return out.push(0x30);
        if (v === true) return out.push(0x54);
        if (v === false) return out.push(0x46);
        if (typeof v === 'number') { out.push(0x69); return long(v); }
        if (typeof v === 'string') { out.push(0x49, 0x22); bytes([...Buffer.from(v, 'utf8')]); long(1); sym('E'); return out.push(0x54); }
        if (Array.isArray(v)) { out.push(0x5b); long(v.length); return v.forEach(write); }
        if (v.__table) {
            const { xsize, ysize = 1, zsize = 1, data } = v.__table;
            const b = Buffer.alloc(20 + data.length * 2);
            b.writeInt32LE(zsize > 1 ? 3 : ysize > 1 ? 2 : 1, 0); b.writeInt32LE(xsize, 4); b.writeInt32LE(ysize, 8); b.writeInt32LE(zsize, 12); b.writeInt32LE(data.length, 16);
            data.forEach((d, i) => b.writeInt16LE(d, 20 + i * 2));
            out.push(0x75); sym('Table'); return bytes([...b]);
        }
        if (v.__hash) { out.push(0x7b); long(v.__hash.length); for (const [k, x] of v.__hash) { write(k); write(x); } return; }
        const { __class, ...ivars } = v;
        out.push(0x6f); sym(__class); long(Object.keys(ivars).length);
        for (const [k, x] of Object.entries(ivars)) { sym('@' + k); write(x); }
    };
    write(value);
    return Uint8Array.from(out);
}

const next = (k) => (Math.imul(k, 7) + 3) >>> 0;
function archiveV1(files) {
    const out = [...Buffer.from('RGSSAD\0'), 1];
    let key = 0xDEADCAFE;
    const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); out.push(...b); };
    for (const [name, data] of Object.entries(files)) {
        const nameBytes = Buffer.from(name, 'utf8');
        u32(nameBytes.length ^ key); key = next(key);
        for (const b of nameBytes) { out.push(b ^ (key & 0xff)); key = next(key); }
        u32(data.length ^ key); key = next(key);
        let k = key;
        for (let i = 0; i < data.length; i += 4) { for (let j = 0; j < 4 && i + j < data.length; j++) out.push(data[i + j] ^ ((k >>> (8 * j)) & 0xff)); k = next(k); }
    }
    return Uint8Array.from(out);
}
function archiveV3(files) {
    const seed = 0x12345678, key = (Math.imul(seed, 9) + 3) >>> 0;
    const names = Object.keys(files), header = [];
    let offset = 12 + names.reduce((n, name) => n + 16 + Buffer.byteLength(name), 0) + 16;
    const bodies = [];
    names.forEach((name, index) => {
        const data = files[name], fileKey = 0x1000 + index, nameBytes = Buffer.from(name, 'utf8');
        const entry = Buffer.alloc(16);
        entry.writeUInt32LE((offset ^ key) >>> 0, 0); entry.writeUInt32LE((data.length ^ key) >>> 0, 4); entry.writeUInt32LE((fileKey ^ key) >>> 0, 8); entry.writeUInt32LE((nameBytes.length ^ key) >>> 0, 12);
        header.push(...entry, ...[...nameBytes].map((b, i) => b ^ ((key >>> (8 * (i % 4))) & 0xff)));
        let k = fileKey; const body = [];
        for (let i = 0; i < data.length; i += 4) { for (let j = 0; j < 4 && i + j < data.length; j++) body.push(data[i + j] ^ ((k >>> (8 * j)) & 0xff)); k = next(k); }
        bodies.push(...body); offset += data.length;
    });
    const end = Buffer.alloc(16); end.writeUInt32LE(key >>> 0, 0);   // offset 0 after XOR ends the table
    const seedBytes = Buffer.alloc(4); seedBytes.writeUInt32LE(seed);
    return Uint8Array.from([...Buffer.from('RGSSAD\0'), 3, ...seedBytes, ...header, ...end, ...bodies]);
}

test('RubyMarshal reads RGSS objects, symbols, links, hashes and Tables', () => {
    const table = { __table: { xsize: 2, ysize: 2, zsize: 1, data: [1, -2, 300, 4] } };
    const v = M.load(marshal([null, { __class: 'RPG::Actor', id: 1, name: 'Ärger', note: '', level: 1000, flags: [true, false] }, { __hash: [[3, 'three'], [1, 'one']] }, table]));
    assert.equal(v[0], null);
    assert.deepEqual({ ...v[1] }, { __class: 'RPG::Actor', id: 1, name: 'Ärger', note: '', level: 1000, flags: [true, false] });
    assert.deepEqual({ ...v[2] }, { 1: 'one', 3: 'three' });
    assert.deepEqual([v[3].xsize, v[3].ysize, Array.from(v[3].data)], [2, 2, [1, -2, 300, 4]]);
    assert.throws(() => M.load(Uint8Array.from([4, 7, 0x30])), /Marshal 4\.8/);
});

test('RgssArchive reads version 1 (XP, VX) and version 3 (VX Ace) archives', () => {
    const files = { 'Data\\Actors.rvdata2': Uint8Array.from([4, 8, 0x30]), 'Graphics\\Characters\\Hero.png': Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]) };
    for (const build of [archiveV1, archiveV3]) {
        const archive = A.open(build(files));
        assert.deepEqual(archive.list(), ['Data/Actors.rvdata2', 'Graphics/Characters/Hero.png']);
        assert.deepEqual(Array.from(archive.read('graphics/characters/HERO.png')), Array.from(files['Graphics\\Characters\\Hero.png']));
        assert.equal(archive.read('Data/Missing.rvdata2'), null);
    }
    assert.throws(() => A.open(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])), /RGSSAD/);
});

test('Ace event commands become MZ commands, Ruby translated only when certain', () => {
    C.setContext({ constants: { IDLE_SWITCH: 12 } });
    const cmd = (code, parameters, indent = 0) => ({ __class: 'RPG::EventCommand', code, indent, parameters });
    const out = C.commands([
        cmd(101, ['Face', 1, 0, 2]), cmd(401, ['Hello']),
        cmd(102, [['Yes', 'No'], 5]), cmd(102, [['Yes', 'No'], 0]), cmd(102, [['Yes', 'No'], 2]),
        cmd(111, [11, 'C']), cmd(236, [':rain', 5, 30, true]),
        cmd(355, ['$game_switches[IDLE_SWITCH] = false']), cmd(355, ['show_fog(1, "Fog")']),
        cmd(241, [{ __class: 'RPG::BGM', name: 'Town', volume: 80, pitch: 100 }])
    ], {});
    assert.deepEqual(out[0].parameters, ['Face', 1, 0, 2, '']);
    assert.deepEqual(out.filter(c => c.code === 102).map(c => c.parameters[1]), [-2, -1, 1]);
    assert.deepEqual(out.find(c => c.code === 111).parameters, [11, 'ok', 0]);
    assert.deepEqual(out.find(c => c.code === 236).parameters, ['rain', 5, 30, true]);
    assert.deepEqual(out.filter(c => c.code === 355).map(c => c.parameters[0]), ['$gameSwitches.setValue(12, false);']);
    assert.ok(out.some(c => c.code === 408 && c.parameters[0] === 'show_fog(1, "Fog")'), 'custom Ruby stays readable as a comment');
    assert.deepEqual(out.find(c => c.code === 241).parameters[0], { name: 'Town', volume: 80, pitch: 100, pan: 0 });
    assert.equal(out[out.length - 1].code, 0);
    C.setContext({});
});

test('the Ruby translator refuses what it cannot be sure of', () => {
    const ok = [
        ['$game_map.events[3].erase', 'statement', {}, '$gameMap.event(3).erase();'],
        ['$game_party.item_number($data_items[12]) >= 3', 'expression', {}, '($gameParty.numItems($dataItems[12]) >= 3)'],
        ['@move_speed = 4', 'statement', { self: 'character' }, 'this.setMoveSpeed(4);'],
        ['@animation_id = 88', 'statement', { self: 'character' }, '$gameTemp.requestAnimation([this], 88);'],
        ['x = $game_variables[2]\nif x > 3\n  $game_switches[4] = true\nend', 'statement', {}, 'var x = $gameVariables.value(2);\nif ((x > 3)) { $gameSwitches.setValue(4, true); }'],
        ['$game_party.members.any? { |a| a.state?(2) }', 'expression', {}, '$gameParty.members().some((a) => a.isStateAffected(2))']
    ];
    for (const [ruby, kind, context, js] of ok) assert.equal(C.ruby(ruby, kind, context), js, ruby);
    for (const ruby of ['set_char("$Dark",0,2,1)', '@plus_z = 2', '$game_map.events.each { |e| e.erase }', '`rm -rf /`', 'system("x")', 'eval("x")', 'require "x"', 'File.delete("x")']) {
        assert.equal(C.ruby(ruby, 'statement', { self: 'character' }), null, ruby);
    }
});

test('a Script command keeps the lines it can run and comments the rest, unless a block spans lines', () => {
    const lines = ['$game_variables[3] = 1', 'show_fog(1, "x")', '$game_switches[2] = true'];
    assert.deepEqual(C.rubyProgram(lines, {}), { code: ['$gameVariables.setValue(3, 1);', '// Ruby (did not carry over): show_fog(1, "x")', '$gameSwitches.setValue(2, true);'], partial: true });
    assert.equal(C.rubyProgram(['if $game_switches[1]', 'show_fog(1, "x")', 'end'], {}), null);
    assert.deepEqual(C.rubyProgram(['show_fog(1, "x")'], { families: new Set(['shazMultiFog']) }), { code: ['$gameScreen.rrShowFog?.(1, "x");'], partial: false });
});

test('Ace maps split the fourth layer into shadow and region; message codes follow the game\'s scripts', () => {
    const w = 2, h = 1;
    const map = C.map({ width: w, height: h, data: { __class: 'Table', xsize: w, ysize: h, zsize: 4, data: Int16Array.from([2048, 1536, 0, 0, 0, 0, 0x0305, 0]) }, events: {} }, {});
    assert.deepEqual(map.data.slice(0, 2), [2048, 1536]);
    assert.equal(map.data[(4 * h) * w], 5, 'shadow bits');
    assert.equal(map.data[(5 * h) * w], 3, 'region');
    C.setContext({ messageCodes: { nameBox: true, yeaIcons: true, messageFace: true }, names: { items: [null, { name: 'Potion', icon: 5 }] } });
    const out = C.commands([{ code: 101, indent: 0, parameters: ['F', 0, 0, 2] }, { code: 401, indent: 0, parameters: ['Take \\ii[1]. \\MF[Hero ,3]Now!\\n<\\{Master\\}>'] }], {});
    assert.equal(out[0].parameters[4], '\\{Master\\}');
    assert.equal(out[1].parameters[0], 'Take \\I[5]Potion. \\RRFACE[Hero,3]Now!');
    C.setContext({ messageCodes: {} });
    assert.equal(C.commands([{ code: 401, indent: 0, parameters: ['\\ii[1]'] }], {})[0].parameters[0], '\\ii[1]', 'a game without those scripts keeps its text');
    C.setContext({});
});

test('script settings: constants, fonts, screen size and RGSS font scale', () => {
    const scripts = ['module YEA\n  module CORE\n    RESIZE_WIDTH = 640\n    RESIZE_HEIGHT = 480\n    FONT_NAME = ["Cardo", "Arial"]\n    FONT_SIZE = 24\n  end\nend\nGraphics.resize_screen(YEA::CORE::RESIZE_WIDTH, YEA::CORE::RESIZE_HEIGHT)\nFont.default_name = YEA::CORE::FONT_NAME\nFont.default_size = YEA::CORE::FONT_SIZE'];
    const constants = C.scriptConstants(scripts);
    assert.equal(constants['YEA::CORE::RESIZE_WIDTH'], 640);
    assert.deepEqual(C.screenSize(scripts, constants), [640, 480]);
    assert.deepEqual(C.fontDefaults(scripts, constants), { name: ['Cardo', 'Arial'], size: 24 });
    assert.equal(C.screenSize(['x = 1'], {}), null);
    // A font's cell (winAscent + winDescent) against its em: RGSS sizes by the first, a browser by the second.
    const ttf = Buffer.alloc(200);
    ttf.writeUInt16BE(2, 4);
    ttf.write('head', 12, 'latin1'); ttf.writeUInt32BE(44, 20);
    ttf.write('OS/2', 28, 'latin1'); ttf.writeUInt32BE(100, 36);
    ttf.writeUInt16BE(2048, 44 + 18);
    ttf.writeUInt16BE(2028, 100 + 74); ttf.writeUInt16BE(745, 100 + 76);
    assert.equal(C.rgssFontScale(ttf).toFixed(3), '0.739');
});

test('GDS Ultimate Parallax settings become map image layers', () => {
    const script = 'module GDS_Parallax\n module Parallax\n  Parallax2 = [4,5,\n 43, #<= sky\n]\n  Ground = [43,\n 44]\n  VARIABLE_GROUND = 19\n  VARIABLE_SKY = 20\n  SWITCH_GROUND = nil\n end\nend';
    const layers = C.gdsParallaxLayers(['other', script]);
    const ground = layers.find(l => l.key === 'ground'), sky = layers.find(l => l.key === 'sky');
    assert.deepEqual([ground.maps, ground.variable, ground.switch, ground.layer], [[43, 44], 19, 0, 'ground']);
    assert.deepEqual([sky.maps, sky.variable, sky.layer], [[4, 5, 43], 20, 'over']);
    assert.equal(C.gdsParallaxLayers(['nothing here']), null);
});

const corpus = path.resolve(__dirname, '..', '..', 'template', 'The Seventh Warrior v0.9.1');
test('The Seventh Warrior (VX Ace, packed) imports whole', { skip: !fs.existsSync(path.join(corpus, 'Game.rgss3a')) && 'corpus not present' }, () => {
    assert.equal(I.probe(corpus).kind, 'ace');
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-tsw-'));
    try {
        const summary = I.importProject(corpus, dest, { force: true });
        assert.equal(summary.maps, 82);
        const system = JSON.parse(fs.readFileSync(path.join(dest, 'data', 'System.json'), 'utf8'));
        assert.deepEqual([system.advanced.screenWidth, system.advanced.screenHeight, system.advanced.mainFontFilename, system.advanced.fontSize, system.tileSize, system.rrBalloonSize, system.rrMultiFrames], [640, 480, 'Cardo-Regular.ttf', 17.7, 32, 32, true]);
        assert.equal(system.terms.messages.emerge, '%1 erscheint!', 'battle messages come from the game\'s Vocab script');
        const map43 = JSON.parse(fs.readFileSync(path.join(dest, 'data', 'Map043.json'), 'utf8'));
        assert.deepEqual(map43.rrImageLayers.map(l => l.name), ['43_Ground', '43_Layer2']);
        assert.ok(map43.events.some(e => e && e.pages.some(p => p.list.some(c => c.code === 101 && c.parameters[4]))), 'Yanfly name boxes became speaker names');
        assert.ok(fs.existsSync(path.join(dest, 'img', 'parallaxes', '43_Ground.png')));
        assert.ok(fs.readdirSync(path.join(dest, 'legacy', 'Scripts')).length > 100);
    } finally { fs.rmSync(dest, { recursive: true, force: true }); }
});

test('the runtime rules for imported games stay off in MV and MZ data', () => {
    const vm = require('node:vm');
    const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'runtime', file), 'utf8');
    const objects = read('reactor_objects.js');
    const block = objects.slice(objects.indexOf('Game_CharacterBase.rrFramesOf = function'));
    const make = (dataSystem) => {
        function Game_CharacterBase() {}
        Object.assign(Game_CharacterBase.prototype, {
            maxPattern() { return 4; }, pattern() { return this._pattern < 3 ? this._pattern : 1; },
            resetPattern() { this._pattern = 1; }, isOriginalPattern() { return this.pattern() === 1; },
            straighten() { this._pattern = 1; }, setPattern(p) { this._pattern = p; }, hasWalkAnime() { return true; }, hasStepAnime() { return false; }
        });
        const context = { Game_CharacterBase, $dataSystem: dataSystem };
        vm.runInNewContext(block, context);
        return context.Game_CharacterBase;
    };
    for (const system of [{}, { advanced: {} }]) {
        const G = make(system), c = new G(); c._characterName = 'Hero[f8]'; c._pattern = 0;
        assert.equal(c.maxPattern(), 4); c.resetPattern(); assert.equal(c._pattern, 1);
    }
    const G = make({ rrMultiFrames: true }), c = new G(); c._characterName = 'Hero[f8]'; c._pattern = 5;
    assert.equal(c.maxPattern(), 8); assert.equal(c.pattern(), 5); c.resetPattern(); assert.equal(c._pattern, 0);
    const sprites = read('reactor_sprites.js');
    assert.match(sprites, /const w = \(\$dataSystem && Number\(\$dataSystem\.rrBalloonSize\)\) \|\| 48;/);
    assert.match(sprites, /\$dataMap && Array\.isArray\(\$dataMap\.rrImageLayers\)/);
    const windows = read('reactor_windows.js');
    assert.match(windows, /if \(typeof step !== "number"\) return _reactorMakeFontBigger\.call\(this\);/);
    assert.match(windows, /if \(code !== "RRFACE"\) return _reactorMessageEscape\.call\(this, code, textState\);/);
});

test('movies an old engine played are found for conversion; the report reads back what an import did', () => {
    const media = require(path.join(legacy, 'LegacyMedia.js'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-movies-'));
    try {
        fs.mkdirSync(path.join(dir, 'movies'));
        for (const f of ['Intro.avi', 'Ending.webm', 'Ending.wmv', 'Credits.MPG', 'notes.txt']) fs.writeFileSync(path.join(dir, 'movies', f), '');
        assert.deepEqual(media.pendingMovies(dir).sort(), ['Credits.MPG', 'Intro.avi']);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    global.I18n = undefined;
    const report = require(path.resolve(__dirname, '..', 'src', 'LegacyReportDialog.js'));
    const rows = report.summarize({ engine: 'RPG Maker VX Ace', title: 'Game', maps: 3, approximations: { rubyTranslated: 5, rubyScript: 2, nameBox: 4 }, scripts: { custom: 7, customLines: 900 }, movies: { converted: ['Intro.avi'] } });
    const text = rows.map(r => r.join(': ')).join('\n');
    assert.match(text, /RPG Maker VX Ace · “Game”/);
    assert.match(text, /5 translated to JavaScript, 2 kept as comments/);
    assert.match(text, /nameBox 4/);
    assert.match(text, /7 sections, 900 lines/);
    assert.match(text, /Intro\.avi/);
});

test('map image layers round-trip through the Map Properties list', () => {
    global.rrEscapeHtml = (v) => String(v);
    const editor = require(path.resolve(__dirname, '..', 'src', 'MapImageLayersEditor.js'));
    editor.load([{ name: '43_Ground', layer: 'ground', variable: 19, variantName: '43-%1_Ground' }, { name: '9_light', layer: 'over', switch: 4 }]);
    assert.deepEqual(editor.read(), [{ name: '43_Ground', layer: 'ground', variable: 19, variantName: '43-%1_Ground' }, { name: '9_light', layer: 'over', switch: 4 }]);
    editor.load([]);
    assert.deepEqual(editor.read(), []);
});

// ---- RPG Maker XP ------------------------------------------------------------
const X = require(path.join(legacy, 'XpConvert.js'));
const XD = require(path.join(legacy, 'XpDatabase.js'));
const table = (xsize, ysize, zsize, data) => ({ xsize, ysize, zsize, data: Int16Array.from(data) });

test('XP tilesets re-cut into MZ sheets; tile ids, flags and map layers follow', () => {
    // An 8×2-tile tileset whose pixels encode their tile index, and one still and one animated autotile.
    const tileset = X.blank(256, 64);
    for (let i = 0; i < 16; i++) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) tileset.data[(((i >> 3) * 32 + y) * 256 + (i & 7) * 32 + x) * 4] = i + 1;
    const still = X.blank(96, 128), animated = X.blank(288, 128);
    const { sheets, autotiles } = X.tilesetSheets(tileset, [still, animated]);
    assert.deepEqual(autotiles, [2816, 2048]);   // still → A2 kind 0, animated → A1 kind 0
    assert.ok(sheets.A1 && sheets.A2 && sheets.B && !sheets.C);
    // XP tile 384 + 9 is the second row's second tile: MZ B id 9, at column 1 row 1 of the left half.
    assert.equal(sheets.B.data[((32 + 5) * 512 + 32 + 5) * 4], 10);
    assert.equal(X.tileId(384 + 9, autotiles), 9);
    assert.equal(X.tileId(48 + 7, autotiles), 2816 + 7);
    assert.equal(X.tileId(96 + 47, autotiles), 2048 + 47);
    const flags = X.tilesetFlags({ passages: table(8192, 1, 1, Object.assign(new Array(8192).fill(0), { 385: 0x0f, 55: 0x40 })), priorities: table(8192, 1, 1, Object.assign(new Array(8192).fill(0), { 386: 1 })), terrain_tags: table(8192, 1, 1, Object.assign(new Array(8192).fill(0), { 387: 3 })) }, autotiles);
    assert.equal(flags[1], 0x0f);              // impassable
    assert.equal(flags[2], 0x10);              // priority → star
    assert.equal(flags[3], 3 << 12);           // terrain tag
    assert.equal(flags[2816 + 7], 0x40);       // autotile bush
    const data = X.mapData(table(2, 1, 3, [384, 49, 0, 0, 0, 390]), 2, 1, autotiles);
    assert.deepEqual(data.slice(0, 6), [0, 2817, 0, 0, 0, 6]);
});

test('XP event commands become MZ commands at 60 frames a second', () => {
    const notes = {};
    const out = X.commands([
        { code: 104, indent: 0, parameters: [0, 1] },
        { code: 101, indent: 0, parameters: ['Hello'] },
        { code: 106, indent: 0, parameters: [20] },
        { code: 223, indent: 0, parameters: [{ red: -68, green: -68, blue: 0, gray: 0 }, 40] },
        { code: 208, indent: 0, parameters: [1] },
        { code: 131, indent: 0, parameters: ['Blue'] },
        { code: 222, indent: 0, parameters: ['BlindH'] },
        { code: 355, indent: 0, parameters: ['$game_switches[3] = true'] },
        { code: 999, indent: 0, parameters: [1] },
        { code: 0, indent: 0, parameters: [] }
    ], notes, (src) => C.ruby(src, 'statement', {}));
    assert.deepEqual(out[0], { code: 101, indent: 0, parameters: ['', 0, 2, 0, ''] });   // top, transparent (from 104)
    assert.deepEqual(out[1].parameters, ['Hello']);
    assert.deepEqual(out[2], { code: 230, indent: 0, parameters: [30] });
    assert.deepEqual(out[3].parameters, [[-68, -68, 0, 0], 60, false]);
    assert.deepEqual(out[4], { code: 211, indent: 0, parameters: [1] });
    assert.match(out[5].parameters[0], /rrSetWindowskin\?\.\("Blue"\)/);
    assert.match(out[6].parameters[0], /^this\.rrExecuteTransition\?\.\("BlindH", 30\)$/);
    assert.equal(out[7].code, 355);
    assert.equal(out[8].code, 108);
    assert.equal(notes.windowskinNames.Blue, 1);
    assert.ok(!Object.keys(notes).includes('windowskinNames'));   // not a report count
});

test('XP database: stats, curves, classes per actor, appended Attack and Guard', () => {
    const params = table(6, 100, 1, Array.from({ length: 600 }, (_, i) => (i % 6 + 1) * 10 + Math.floor(i / 6)));
    const xp = {
        actors: [null, { id: 1, name: 'Aluxes', class_id: 1, initial_level: 1, final_level: 99, exp_basis: 30, exp_inflation: 30, character_name: '001-Fighter01', battler_name: '001-Fighter01', parameters: params, weapon_id: 1, armor1_id: 0, armor2_id: 0, armor3_id: 0, armor4_id: 0, weapon_fix: true }],
        classes: [null, { id: 1, name: 'Fighter', weapon_set: [1], armor_set: [], element_ranks: table(3, 1, 1, [0, 1, 3]), state_ranks: table(3, 1, 1, [0, 6, 3]), learnings: [{ level: 2, skill_id: 1 }] }],
        skills: [null, { id: 1, name: 'Heal', icon_name: '044-Skill01', description: '', scope: 3, occasion: 0, animation2_id: 5, sp_cost: 10, power: -200, atk_f: 0, int_f: 100, element_set: [], plus_state_set: [], minus_state_set: [], variance: 15, hit: 100 }],
        items: [], weapons: [null, { id: 1, name: 'Sword', icon_name: '001-Weapon01', atk: 25, pdef: 0, mdef: 0, str_plus: 3, dex_plus: 0, agi_plus: 0, int_plus: 0, element_set: [], plus_state_set: [] }],
        armors: [], enemies: [null, { id: 1, name: 'Ghost', maxhp: 50, maxsp: 0, str: 30, dex: 30, agi: 30, int: 30, atk: 60, pdef: 60, mdef: 60, eva: 5, exp: 1, gold: 1, element_ranks: table(1, 1, 1, [0]), state_ranks: table(1, 1, 1, [0]), actions: [{ kind: 0, basic: 0, rating: 5, condition_hp: 100, condition_level: 1 }] }],
        states: [], animations: []
    };
    const db = XD.database(xp, {}, (name) => (name === '044-Skill01' ? 7 : 0));
    const actor = db.actors[1], cls = db.classes[1];
    assert.equal(actor.characterName, '$001-Fighter01[f4]');
    assert.equal(actor.classId, 1);
    assert.deepEqual(actor.traits, [{ code: 53, dataId: 1, value: 1 }]);
    // mhp ← maxhp, mmp ← maxsp, atk ← STR, def 0, mat ← INT, mdf 0, agi ← AGI, luk ← DEX (level 1 row).
    assert.deepEqual(cls.params.map(row => row[1]), [11, 21, 31, 0, 61, 0, 51, 41]);
    assert.ok(cls.traits.some(t => t.code === 11 && t.dataId === 1 && t.value === 2));      // element rank A
    assert.ok(cls.traits.some(t => t.code === 13 && t.dataId === 1 && t.value === 0));      // state rank F
    assert.ok(cls.traits.some(t => t.code === 35 && t.dataId === db.attackSkillId));
    assert.deepEqual(cls.learnings, [{ level: 2, note: '', skillId: 1 }]);
    assert.equal(db.classes[db.classOffset + 1].name, 'Fighter');
    const heal = db.skills[1];
    assert.equal(heal.damage.type, 3);
    assert.equal(heal.scope, 7);
    assert.equal(heal.iconIndex, 7);
    assert.equal(db.skills[db.attackSkillId].name, 'Attack');
    assert.equal(db.skills[db.guardSkillId].name, 'Guard');
    assert.equal(db.weapons[1].note, '<rrXpAtk: 25>');
    assert.deepEqual(db.weapons[1].params, [0, 0, 3, 0, 0, 0, 0, 0]);
    assert.equal(db.enemies[1].actions[0].skillId, db.attackSkillId);
    assert.ok(db.enemies[1].traits.some(t => t.code === 35 && t.dataId === db.attackSkillId));
});

test('a game script that plays other music for its BGM names rewrites the references', () => {
    const script = [
        'class Game_System',
        '  def bgm_play(bgm)',
        '    vol = 1000',
        '    case bgm.name',
        '    when "Battle_02"',
        '      name = "Audio/BGM/Kasuga/battle1.mp3"',
        '      vol = 900',
        '    else',
        '      case bgm.name',
        '      when "Town_01", "Town_02"',
        '        name = "Huwaru/no.57"',
        '        vol = 80',
        '      end',
        '    end',
        '  end',
        '  def me_play(me)',
        '    case me.name',
        '    when "Lose_01"',
        '      Audio.me_play("Audio/BGM/Azell/gameover", me.volume, me.pitch)',
        '    end',
        '  end',
        'end'
    ].join('\n');
    const aliases = C.audioAliases([script]);
    assert.deepEqual(aliases.bgm.get('battle_02'), { name: 'Kasuga/battle1', volume: 90, from: 'bgm' });
    assert.deepEqual(aliases.bgm.get('town_02'), { name: 'Huwaru/no.57', volume: 80, from: 'bgm' });
    assert.deepEqual(aliases.me.get('lose_01'), { name: 'Azell/gameover', volume: 100, from: 'bgm' });
    const map = { bgm: { name: 'Town_01', volume: 100, pitch: 100 }, events: [null, { pages: [{ list: [{ code: 241, parameters: [{ name: 'Battle_02', volume: 50, pitch: 100 }] }, { code: 249, parameters: [{ name: 'Lose_01', volume: 100, pitch: 100 }] }] }] }] };
    assert.equal(C.applyAudioAliases(map, aliases), 3);
    assert.deepEqual([map.bgm.name, map.bgm.volume], ['Huwaru/no.57', 80]);
    assert.deepEqual(map.events[1].pages[0].list[0].parameters[0].volume, 45);
});

test('file names a zip tool mangled read back as the game named them; MIDI loop points are found', () => {
    const R = require(path.join(legacy, 'RgssImporter.js'));
    assert.equal(R.repairName('Battle_01_îÄë║é╠î│é┼.mid'), 'Battle_01_月下の元で.mid');
    assert.equal(R.repairName('Town_01.ogg'), 'Town_01.ogg');
    assert.equal(R.repairName('Event_24_π⌐.mid'), 'Event_24_罠.mid');
    // Real European names stay, even where their bytes happen to decode to a kanji.
    for (const name of ['Café.png', '$Falltür (Avery Amy)[f4].png', 'Goliath Höh3', 'Credit präsentiert']) assert.equal(R.repairName(name), name);
    // One track at 120 bpm (500000 µs/quarter), 480 ticks a quarter: CC111 at beat 2, end at beat 4.
    const vlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
    const events = [...vlq(0), 0xff, 0x51, 3, 0x07, 0xa1, 0x20, ...vlq(960), 0xb0, 111, 0, ...vlq(960), 0xff, 0x2f, 0];
    const trk = Buffer.concat([Buffer.from('MTrk'), Buffer.from([0, 0, 0, events.length]), Buffer.from(events)]);
    const mid = Buffer.concat([Buffer.from('MThd'), Buffer.from([0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0]), trk]);
    const media = require(path.join(legacy, 'LegacyMedia.js'));
    assert.deepEqual(media.midiLoop(mid), { loopStart: 1, end: 2 });
});

test('the runtime reads plain PCM WAV the browser refuses, and nothing else', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'runtime', 'reactor_core.js'), 'utf8');
    const start = src.indexOf('WebAudio._decodePcmWav = function');
    const body = src.slice(start, src.indexOf('\n};\n', start) + 3);
    const WebAudio = { _context: { createBuffer: (channels, frames, rate) => { const data = Array.from({ length: channels }, () => new Float32Array(frames)); return { channels, frames, rate, getChannelData: (c) => data[c] }; } } };
    new Function('WebAudio', body)(WebAudio);
    const wav = (format, bits, samples) => {
        const data = Buffer.from(samples);
        const h = Buffer.alloc(44);
        h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
        h.writeUInt16LE(format, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(8000, 24); h.writeUInt32LE(8000 * bits / 8, 28); h.writeUInt16LE(bits / 8, 32); h.writeUInt16LE(bits, 34);
        h.write('data', 36); h.writeUInt32LE(data.length, 40);
        const b = Buffer.concat([h, data]);
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
    };
    const u8 = WebAudio._decodePcmWav(wav(1, 8, [128, 255, 0]));
    assert.equal(u8.frames, 3);
    assert.deepEqual(Array.from(u8.getChannelData(0)).map(v => Math.round(v * 128)), [0, 127, -128]);
    assert.equal(WebAudio._decodePcmWav(wav(2, 4, [1, 2, 3, 4])), null);   // MS ADPCM
});

const xpCorpus = path.resolve(__dirname, '..', '..', 'template', 'Nocturne English');
test('Nocturne: Rebirth (XP, packed) imports whole', { skip: !fs.existsSync(path.join(xpCorpus, 'Game.rgssad')) && 'corpus not present' }, () => {
    assert.equal(I.probe(xpCorpus).kind, 'xp');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-xp-'));
    try {
        const summary = I.importProject(xpCorpus, path.join(dir, 'game'), {});
        assert.equal(summary.engine, 'RPG Maker XP');
        assert.equal(summary.maps, 204);
        assert.ok(summary.plugins.includes('RR_XpCompat'));
        const game = path.join(dir, 'game');
        const sys = JSON.parse(fs.readFileSync(path.join(game, 'data', 'System.json'), 'utf8'));
        assert.equal(sys.gameTitle, 'Nocturne: Rebirth (English)');
        assert.ok(sys.rrMultiFrames && sys.rrGuardSkillId > 2);
        const tilesets = JSON.parse(fs.readFileSync(path.join(game, 'data', 'Tilesets.json'), 'utf8'));
        for (const ts of tilesets.filter(Boolean)) for (const name of ts.tilesetNames.filter(Boolean)) assert.ok(fs.existsSync(path.join(game, 'img', 'tilesets', name + '.png')), name);
        // Placeholder MIDI names resolve through the game's own BGM table; mangled file names are repaired.
        assert.ok(fs.existsSync(path.join(game, 'audio', 'bgm', 'Huwaru', 'no.57.mid')));
        assert.ok(!fs.readdirSync(path.join(game, 'audio', 'bgm')).some(f => /[╠║]/.test(f)));
        assert.ok(summary.approximations.audioAliased > 0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- RPG Maker VX ------------------------------------------------------------
const V = require(path.join(legacy, 'VxConvert.js'));

test('VX commands reshape into VX Ace\'s before conversion', () => {
    const ids = { attack: 300, guard: 301, escape: 302 };
    const out = V.aceCommands([
        { code: 311, indent: 0, parameters: [0, 1, 0, 50, false] },
        { code: 317, indent: 0, parameters: [2, 5, 0, 0, 3] },
        { code: 122, indent: 0, parameters: [4, 4, 0, 4, 1, 9] },
        { code: 122, indent: 0, parameters: [5, 5, 0, 6, -1, 0] },
        { code: 111, indent: 0, parameters: [4, 1, 2, 7] },
        { code: 111, indent: 0, parameters: [11, 13] },
        { code: 236, indent: 0, parameters: [2, 5, 60, true] },
        { code: 302, indent: 0, parameters: [1, 4, true] },
        { code: 605, indent: 0, parameters: [0, 2] },
        { code: 339, indent: 0, parameters: [0, 1, 0, 1, -1] }
    ], ids).map(c => c.parameters);
    assert.deepEqual(out, [
        [0, 0, 1, 0, 50, false],        // fixed actor 0 (whole party)
        [0, 2, 6, 0, 0, 3],             // agility is MZ param 6
        [4, 4, 0, 3, 3, 1, 10],         // actor 1's agility, as game data
        [5, 5, 0, 3, 5, -1, 0],         // the player's x
        [4, 1, 3, 7],                   // actor knows skill 7 (MZ inserts the class test before it)
        [11, 'C'],
        ['storm', 5, 60, true],
        [1, 4, 0, 0, true],
        [0, 2, 0, 0],
        [0, 1, 301, -1]                 // Force Action: guard
    ]);
    // Converted by the Ace pipeline, 319's slot index becomes an equipment type.
    const mz = C.commands([{ code: 319, indent: 0, parameters: [1, 0, 5] }], {});
    assert.deepEqual(mz[0].parameters, [1, 1, 5]);
});

test('VX passages, damage and equipment classes become MZ\'s', () => {
    const passages = table(8192, 1, 1, Object.assign(new Array(8192).fill(0), { 5: 0x01, 6: 0x10, 7: 0x40 | 0x02 }));
    const flags = V.tilesetFlags(passages);
    assert.equal(flags[5], 0x0f);
    assert.equal(flags[6], 0x10);
    assert.equal(flags[7], 0x40 | 0x200);
    assert.equal(V.damageFormula({ base_damage: 50, atk_f: 100, spi_f: 0 }), 'Math.max(0, 50 + a.atk * 4 - (b.def * 2))');
    assert.equal(V.damageFormula({ base_damage: -300, atk_f: 0, spi_f: 150 }), '300 + a.mat * 3');
    const classes = [null, { id: 1, name: 'Knight', weapon_set: [1, 2] }, { id: 2, name: 'Mage', weapon_set: [2] }];
    const types = V.equipTypes(classes, [null, { id: 1 }, { id: 2 }, { id: 3 }], 'weapon_set');
    assert.deepEqual(types.names, ['', 'Knight', 'Knight, Mage', 'Unequippable']);
    assert.deepEqual(types.forClass(2), [2]);
    assert.deepEqual(V.battlebackTable('BATTLEBACK_DIR = "Graphics/Pictures/"\nBATTLEBACK_LIST = {3 => "Grass", 7 => "Cave"}\nBATTLEBACK_TEST = "arena"'), { maps: { 3: 'Grass', 7: 'Cave' }, dir: 'img/pictures', test: 'arena' });
});

test('stock Ruby a VX game leans on translates', () => {
    const ctx = { constants: {}, families: new Set(['systemBattleback']) };
    assert.equal(C.ruby('$game_map.need_refresh = true', 'statement', ctx), 'if (true) $gameMap.requestRefresh();');
    assert.equal(C.ruby('$scene = Scene_Menu.new', 'statement', ctx), 'SceneManager.push(Scene_Menu);');
    assert.equal(C.ruby('$scene = Scene_Custom.new', 'statement', ctx), null);
    assert.equal(C.ruby('$game_system.battleback = "castle"', 'statement', ctx), '$gameSystem._rrBattleback = "castle";');
});

const vxCorpus = path.resolve(__dirname, '..', '..', 'template', 'Legionwood - Definitive Edition');
test('Legionwood (VX) imports whole', { skip: !fs.existsSync(path.join(vxCorpus, 'Data', 'System.rvdata')) && 'corpus not present' }, () => {
    assert.equal(I.probe(vxCorpus).kind, 'vx');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-vx-'));
    try {
        const summary = I.importProject(vxCorpus, path.join(dir, 'game'), {});
        assert.equal(summary.engine, 'RPG Maker VX');
        assert.equal(summary.maps, 261);
        assert.ok(summary.plugins.includes('RR_VxCompat'));
        assert.ok(summary.approximations.rubyTranslated >= 700);
        assert.equal(summary.approximations.questsImported, 42);
        for (const plugin of ['RR_WoraFog', 'RR_ShazMultiFog', 'RR_SkillShop', 'RR_NickeJournal', 'RR_ActorOptions']) assert.ok(summary.plugins.includes(plugin), plugin);
        assert.ok(summary.plugins.indexOf('RR_ShazMultiFog') < summary.plugins.indexOf('RR_WoraFog'));
        const game = path.join(dir, 'game');
        const read = (f) => JSON.parse(fs.readFileSync(path.join(game, 'data', f), 'utf8'));
        const sys = read('System.json');
        assert.equal(sys.advanced.screenWidth, 544);
        assert.ok(sys.rrGuardSkillId > 2);
        const ts = read('Tilesets.json')[1];
        for (const name of ts.tilesetNames.filter(Boolean)) assert.ok(fs.existsSync(path.join(game, 'img', 'tilesets', name + '.png')), name);
        assert.equal(read('Map003.json').battleback1Name, '001-Grassland01');
        assert.ok(fs.existsSync(path.join(game, 'img', 'battlebacks1', '001-Grassland01.png')));
        assert.equal(read('Weapons.json')[1].wtypeId > 0, true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('journal, fog, skill shop and actor option scripts become Reactor quests and plugin calls', () => {
    const journal = 'module NICKE\n  module JOURNAL_SYSTEM\n    COMPLETE_QUEST_VAR = 99\n    MAIN_Q_HEADER = "Story Quests"\n    MAIN_QUESTS = []\n    MAIN_QUESTS[0] = [1, "Market Day!", "Visit the fruitseller."]\n    SIDE_Q_HEADER = "Optional Quests"\n    SIDE_QUESTS[2] = [1, "Funeral Service", "Find a piece of Wyrmwood."]\n  end\nend\n($imported ||= {})["NICKE-SIMPLE-JOURNAL"] = true';
    const fam = C.scriptFamilies([journal, 'class Worale_Multiple_Fog\nend', 'module SKILL_SHOP\n  PRICE = {\n  0 => 100,\n  14 => 30,\n  }\n  SKILL_BUY = {\n  1 => [14,15],\n  }\nend\nclass Window_Skill_ShopBuy < Window_Selectable\nend', 'def change_actor_options (actor_id, option_id, value = -1)\nend']);
    assert.deepEqual([...fam].sort(), ['maActorOptions', 'nickeSimpleJournal', 'skillShop', 'woraMultipleFog']);
    const quests = C.FAMILIES.find(f => f.key === 'nickeSimpleJournal').quests([journal]);
    assert.deepEqual(quests, [{ key: 'main-0', name: 'Market Day!', category: 'Story Quests', description: 'Visit the fruitseller.' }, { key: 'side-2', name: 'Funeral Service', category: 'Optional Quests', description: 'Find a piece of Wyrmwood.' }]);
    const ctx = { constants: {}, families: fam };
    assert.equal(C.ruby('add_quest(2,:side)', 'statement', ctx), 'this.rrNickeQuest?.("add", 2, "side");');
    assert.equal(C.ruby('$scene = Scene_Simple_Journal.new', 'statement', ctx), 'SceneManager.push(Scene_Quest);');
    assert.equal(C.ruby('$fog.name = "mist"', 'statement', ctx), '((f) => f && (f.name = "mist"))($gameTemp.rrWoraFog?.());');
    assert.equal(C.ruby('$fog.show', 'statement', ctx), '$gameTemp.rrWoraFog?.()?.show();');
    assert.equal(C.ruby('$skill_shop =\n[14,15]', 'statement', ctx), '$gameTemp.rrSkillShopGoods = [14, 15];');
    assert.equal(C.ruby('change_actor_options (3, 2, true)', 'statement', ctx), 'this.rrActorOption?.(3, 2, true);');
    const shop = require(path.join(legacy, 'plugins', 'RR_SkillShop.params.js')).extract({ scripts: ['module SKILL_SHOP\n  PRICE = {\n  0 => 100,\n  14 => 30,\n  }\n  SKILL_BUY = {\n  1 => [14,15,14],\n  }\nend'] });
    assert.deepEqual([shop.defaultPrice, JSON.parse(shop.prices), JSON.parse(shop.learners)], ['100', { 14: 30 }, { 1: [14, 15] }]);
    assert.deepEqual(require(path.join(legacy, 'plugins', 'RR_NickeJournal.params.js')).extract({ constants: C.scriptConstants([journal]) }).completeVariable, '99');
});

test('an actor option switched in play replaces the imported trait', () => {
    const src = fs.readFileSync(path.join(legacy, 'plugins', 'RR_ActorOptions.js'), 'utf8');
    const record = { id: 1, traits: [{ code: 62, dataId: 0, value: 1 }, { code: 22, dataId: 0, value: 0.95 }] };
    function Game_Actor() { this.refresh = () => {}; }
    Game_Actor.prototype.actor = function() { return record; };
    Game_Actor.prototype.traitObjects = function() { return [this.actor(), { traits: [] }]; };
    const actor = new Game_Actor();
    const ctx = { Game_Actor, Game_Interpreter: function() {}, $gameActors: { actor: () => actor } };
    new Function(...Object.keys(ctx), src)(...Object.values(ctx));
    const traits = () => actor.traitObjects()[0].traits.map(t => `${t.code}/${t.dataId}`).sort();
    assert.equal(actor.rrHasOption(2), true);
    actor.rrSetOption(2);                               // toggle auto battle off
    assert.deepEqual(traits(), ['22/0']);
    actor.rrSetOption(0, true);                         // dual wield on
    assert.deepEqual(traits(), ['22/0', '55/1']);
    assert.equal(record.traits.length, 2);              // the database record is untouched
});

test('a Skip Title script makes the project skip its title; a stock title override does not', () => {
    assert.equal(C.skipsTitle(['class Scene_Title < Scene_Base\n  def start\n    SceneManager.clear\n    DataManager.setup_new_game\n    $game_map.autoplay\n    SceneManager.goto(Scene_Map)\n  end\nend']), true);
    assert.equal(C.skipsTitle(['class Scene_Title\n  def main\n    $game_temp = Game_Temp.new\n    command_new_game\n    $scene = Scene_Map.new\n  end\nend']), true);
    assert.equal(C.skipsTitle(['class Scene_Title < Scene_Base\n  def start\n    super\n    create_command_window\n  end\nend']), false);
    const scenes = fs.readFileSync(path.resolve(__dirname, '..', '..', 'runtime', 'reactor_scenes.js'), 'utf8');
    assert.match(scenes, /Scene_Title\.prototype\.start = function\(\) \{\s*if \(\$dataSystem && \$dataSystem\.rrSkipTitle\)/);
});

test('imported references work off Windows; dead System names clear; ME music crosses folders; RTP found by variable', () => {
    const PF = require(path.join(legacy, 'ProjectFiles.js'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-files-'));
    try {
        const put = (rel, text = 'x') => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
        put('img/pictures/Gegnerpics/Buddler A.png'); put('audio/se/Sword3.wav'); put('audio/bgm/Fanfare.ogg'); put('img/enemies/bat.png');
        put('data/Map001.json', JSON.stringify({ events: [null, { pages: [{ list: [
            { code: 231, parameters: [1, 'Gegnerpics\\Buddler A'] }, { code: 250, parameters: [{ name: 'sword3' }] },
            { code: 250, parameters: [{ name: '(Kein Sound)' }] }, { code: 249, parameters: [{ name: 'Fanfare' }] }] }] }] }));
        put('data/Enemies.json', JSON.stringify([null, { battlerName: 'Bat' }]));
        put('data/System.json', JSON.stringify({ sounds: [{ name: 'Equip1' }, { name: 'Sword3' }], victoryMe: { name: 'Fanfare' }, battleback1Name: 'GrassMaze' }));
        assert.equal(PF.copyAcrossAudio(dir), 1);
        assert.ok(fs.existsSync(path.join(dir, 'audio/me/Fanfare.ogg')));
        PF.matchFileCase(dir);
        assert.equal(PF.clearMissingSystemFiles(dir), 2);
        const list = JSON.parse(fs.readFileSync(path.join(dir, 'data/Map001.json'), 'utf8')).events[1].pages[0].list.map(c => (typeof c.parameters[1] === 'string' ? c.parameters[1] : c.parameters[0].name));
        assert.deepEqual(list, ['Gegnerpics/Buddler A', 'Sword3', '', 'Fanfare']);
        assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'data/Enemies.json'), 'utf8'))[1].battlerName, 'bat');
        const sys = JSON.parse(fs.readFileSync(path.join(dir, 'data/System.json'), 'utf8'));
        assert.deepEqual([sys.sounds[0].name, sys.sounds[1].name, sys.battleback1Name], ['', 'Sword3', '']);
        assert.deepEqual(PF.missingList(dir), []);
        fs.mkdirSync(path.join(dir, 'rtp', 'CharSet'), { recursive: true }); fs.mkdirSync(path.join(dir, 'rtp', 'ChipSet'));
        const saved = process.env.RPG2K_RTP_PATH;
        process.env.RPG2K_RTP_PATH = path.join(dir, 'rtp');
        try { assert.equal(I.findRtp('RPG Maker 2000'), path.join(dir, 'rtp')); } finally { if (saved === undefined) delete process.env.RPG2K_RTP_PATH; else process.env.RPG2K_RTP_PATH = saved; }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
