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
    assert.deepEqual(out.filter(c => c.code === 355).map(c => c.parameters[0]), ['$gameSwitches.setValue(12, false)']);
    assert.ok(out.some(c => c.code === 408 && c.parameters[0] === 'show_fog(1, "Fog")'), 'custom Ruby stays readable as a comment');
    assert.deepEqual(out.find(c => c.code === 241).parameters[0], { name: 'Town', volume: 80, pitch: 100, pan: 0 });
    assert.equal(out[out.length - 1].code, 0);
    C.setContext({});
});

test('the Ruby translator refuses what it cannot be sure of', () => {
    const ok = [
        ['$game_map.events[3].erase', 'statement', {}, '$gameMap.event(3).erase()'],
        ['$game_party.item_number($data_items[12]) >= 3', 'expression', {}, '$gameParty.numItems($dataItems[12]) >= 3'],
        ['$game_self_switches[[5, 7, \'A\']] == false', 'expression', {}, "$gameSelfSwitches.value([5, 7, 'A']) == false"],
        ['@move_speed = 4', 'statement', { self: 'character' }, 'this.setMoveSpeed(4)'],
        ['@animation_id = 88', 'statement', { self: 'character' }, '$gameTemp.requestAnimation([this], 88)']
    ];
    for (const [ruby, kind, context, js] of ok) assert.equal(C.ruby(ruby, kind, context), js, ruby);
    for (const ruby of ['set_char("$Dark",0,2,1)', '@plus_z = 2', 'loop do\nx\nend', '$game_map.events.each { |e| e.erase }', '`rm -rf /`', 'system("x")']) {
        assert.equal(C.ruby(ruby, 'statement', { self: 'character' }), null, ruby);
    }
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
