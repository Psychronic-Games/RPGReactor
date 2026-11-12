'use strict';
// Importer audit (2026-10-02): archive unpacking stays inside its folder, and
// the other fixes found reading the importers and script ports.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const legacy = path.join(__dirname, '..', 'src', 'legacy');
const RM = require(path.join(legacy, 'RtpManager.js'));

/** A stored (uncompressed) zip of [name, text] entries. */
function storedZip(entries) {
    const locals = [], centrals = [];
    let offset = 0;
    for (const [name, text] of entries) {
        const data = Buffer.from(text), nameBuf = Buffer.from(name);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
        locals.push(local, nameBuf, data); centrals.push(central, nameBuf);
        offset += 30 + nameBuf.length + data.length;
    }
    const dir = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, dir, end]);
}

test('an RTP archive entry naming a parent or an absolute path is never written outside the RTP folder', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-audit-rtp-'));
    try {
        const target = path.join(root, 'deep', 'rtp');
        const zip = storedZip([
            ['RTP/CharSet/Hero.png', 'hero'],
            ['RTP/ChipSet/World.png', 'world'],
            ['RTP/CharSet/../../escaped.png', 'out'],
            ['RTP/Music/..\\..\\escaped2.png', 'out'],
            ['RTP/Sound/C:/escaped3.png', 'out']
        ]);
        const result = RM.unpack(zip, target);
        assert.equal(result.folder, target);
        assert.ok(fs.existsSync(path.join(target, 'CharSet', 'Hero.png')));
        const written = [];
        const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else written.push(path.relative(root, p)); } };
        walk(root);
        assert.deepEqual(written.sort(), [path.join('deep', 'rtp', 'CharSet', 'Hero.png'), path.join('deep', 'rtp', 'ChipSet', 'World.png'), path.join('deep', 'rtp', 'rpg-reactor-rtp.json')].sort());
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a cancelled import stops the converters it started', { skip: process.platform === 'win32' && 'uses sleep' }, async () => {
    const media = require(path.join(legacy, 'LegacyMedia.js'));
    const started = Date.now();
    const pending = media.run('sleep', ['30']);
    media.stopAll();
    await assert.rejects(pending);
    assert.ok(Date.now() - started < 5000, 'killed, not waited for');
});

test('the import worker still exits on its own when the import ends, and stops converters on a cancel', async () => {
    const { Worker } = require('node:worker_threads');
    const workerPath = path.join(__dirname, '..', 'build-scripts', 'legacy-import-worker.js');
    const workerSource = fs.readFileSync(workerPath, 'utf8');
    assert.match(workerSource, /msg\.type !== 'cancel'[\s\S]*\.stopAll\(\)[\s\S]*parentPort\.unref\(\);/);
    const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rr-audit-worker-')), 'out');
    let timer;
    try {
        const w = new Worker(workerPath, { workerData: { source: path.join(os.tmpdir(), 'rr-no-such-game-' + process.pid), destination: dest, options: {} } });
        const seen = [];
        w.on('message', (m) => seen.push(m.type));
        const exited = new Promise((resolve) => w.on('exit', resolve));
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('worker never exited')), 10000); });
        await Promise.race([exited, timeout]);
        assert.ok(seen.includes('done'), 'the failed import still reports');
    } finally { clearTimeout(timer); fs.rmSync(path.dirname(dest), { recursive: true, force: true }); }
});

test('closing the import dialog mid-import asks first, then stops the worker and removes a folder it created', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'LegacyImportDialog.js'), 'utf8');
    assert.match(source, /const close = async \(\) => \{\s*if \(worker && !\(await RRDialog\.confirm\(tt\('Stop the import\?'\), [^\n]*\)\)\) return;\s*finish\(null\);\s*\};/);
    assert.match(source, /if \(event\.key === 'Escape'\) \{ event\.preventDefault\(\); close\(\); \}/);
    assert.match(source, /cancelButton\.addEventListener\('click', close\)/);
    assert.match(source, /created = !fs\.existsSync\(destination\);/);
    assert.match(source, /w\.postMessage\(\{ type: 'cancel' \}\)/);
});

test('an imported game whose title has no ASCII letters gets a package name of its own', () => {
    const PF = require(path.join(legacy, 'ProjectFiles.js'));
    assert.equal(PF.packageName('A Blurred Line 2.1'), 'rr-a-blurred-line-2-1', 'ASCII titles keep the name they always had');
    const a = PF.packageName('ドラゴンの塔'), b = PF.packageName('魔王の城');
    assert.match(a, /^rr-game-[0-9a-f]{8}$/);
    assert.notEqual(a, b);
    assert.equal(a, PF.packageName('ドラゴンの塔'), 'stable across imports');
    assert.match(PF.packageName('勇者 2'), /^rr-2-game-[0-9a-f]{8}$/);
    for (const f of ['LegacyImporter.js', 'RgssImporter.js', 'VxImporter.js', 'XpImporter.js']) {
        assert.doesNotMatch(fs.readFileSync(path.join(legacy, f), 'utf8'), /pkg\.name = 'rr-' \+/, f);
    }
});

test('unpacking an RTP never replaces a folder the user keeps there, only an earlier unpack', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-audit-rtp-keep-'));
    try {
        const target = path.join(root, 'rtp', '2000');
        fs.mkdirSync(path.join(target, 'ChipSet'), { recursive: true });
        fs.writeFileSync(path.join(target, 'ChipSet', 'Mine.png'), 'the user\'s own');
        const zip = storedZip([['RTP/CharSet/Hero.png', 'hero'], ['RTP/ChipSet/World.png', 'world']]);
        const first = RM.unpack(zip, target);
        assert.equal(fs.readFileSync(path.join(target, 'ChipSet', 'Mine.png'), 'utf8'), 'the user\'s own');
        assert.equal(first.folder, target + '-2');
        assert.ok(fs.existsSync(path.join(first.folder, 'ChipSet', 'World.png')));
        const second = RM.unpack(zip, target);
        assert.equal(second.folder, target + '-2', 'an earlier unpack is replaced in place');
        const I = require(path.join(legacy, 'LegacyImporter.js'));
        const downloaded = RM.downloadFolder('RPG Maker 2000');
        assert.ok(I.rtpCandidates('RPG Maker 2000').includes(downloaded + '-2'));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Ruby scripts keep Ruby arithmetic and truth: floored %, string % left as Ruby, 0 counts as true', () => {
    const T = require(path.join(legacy, 'RubyTranspiler.js'));
    const run = (ruby, vars = {}) => {
        const data = Object.assign({}, vars), switches = {};
        const $gameVariables = { value: (i) => data[i] || 0, setValue: (i, v) => { data[i] = v; } };
        const $gameSwitches = { value: (i) => !!switches[i], setValue: (i, v) => { switches[i] = v; } };
        const code = T.transpile(ruby, { self: 'interpreter' });
        assert.notEqual(code, null, ruby);
        new Function('$gameVariables', '$gameSwitches', code)($gameVariables, $gameSwitches);
        return { data, switches };
    };
    assert.equal(run('$game_variables[1] = -7 % 3').data[1], 2);
    assert.equal(run('$game_variables[1] = 7 % -3').data[1], -2);
    assert.equal(run('$game_variables[1] %= 4', { 1: -1 }).data[1], 3);
    assert.equal(T.transpile('x = "%03d" % 5', { self: 'interpreter' }), null, 'a format string is not a number');
    assert.equal(run('$game_variables[1] ||= 5', { 1: 0 }).data[1], 0, 'a variable holding 0 is set');
    assert.equal(run('$game_variables[2] = ($game_variables[1] || 9)', { 1: 0 }).data[2], 0);
    assert.equal(run('$game_variables[2] = ($game_variables[1] && 9)', { 1: 0 }).data[2], 9);
    assert.equal(run('if $game_variables[1]\n$game_switches[1] = true\nend', { 1: 0 }).switches[1], true);
    assert.equal(run('$game_switches[2] = true unless $game_variables[4]').switches[2], undefined);
    assert.equal(run('$game_variables[3] = $game_variables[1] ? 1 : 2', { 1: 0 }).data[3], 1);
});

test('Ruby the game would stop on, or run to no effect, stays a comment or is written for its engine (audit 2026-11-11)', () => {
    const T = require(path.join(legacy, 'RubyTranspiler.js'));
    const js = (ruby, options) => T.transpile(ruby, Object.assign({ self: 'interpreter' }, options));
    // eval rejects a bare return; in a stepped script (a wait inside a loop) there is a function to return from.
    assert.equal(js('if $game_switches[1]\nreturn\nend'), null);
    assert.equal(js('return if $game_switches[1]'), null);
    assert.match(js('3.times do |i|\nwait(5)\nreturn if $game_switches[1]\nend'), /rrRunScript\(function\* \(\) \{[\s\S]*return;/);
    // XP names items and skills by id and lists the party as actors; XP and VX number the weather.
    assert.equal(js('$game_party.item_number(5)', { engine: 'xp' }), '$gameParty.numItems($dataItems[5]);');
    assert.equal(js('$game_party.gain_weapon(5, 1)', { engine: 'xp' }), '$gameParty.gainItem($dataWeapons[5], 1);');
    assert.equal(js('x = $game_party.actors[0].hp', { engine: 'xp' }), 'var x = $gameParty.members()[0].hp;');
    assert.equal(js('$game_actors[1].skill_learn?(7)', { engine: 'xp' }), '$gameActors.actor(1).isLearnedSkill(7);');
    assert.equal(js('$game_screen.weather(1, 9, 0)', { engine: 'vx' }), '$gameScreen.changeWeather((["none", "rain", "storm", "snow"][1] || "none"), 9, 0);');
    assert.equal(js('$game_party.item_number($data_items[5])'), '$gameParty.numItems($dataItems[5]);', 'Ace keeps its own form');
    assert.equal(js('$game_timer.start(600)'), '$gameTimer.start(600);', 'frames, as MZ counts them');
    // The events hash: values, keys and size; nothing else called on it is guessed.
    assert.equal(js('x = $game_map.events.size > 3'), 'var x = ($gameMap.events().length > 3);');
    assert.equal(js('$game_map.events.values.each { |e| e.erase }'), '$gameMap.events().forEach((e) => e.erase());');
    assert.equal(js('$game_map.events.each { |k, e| e.erase }'), null);
    // += and -= read the current value; where there is none to read they do not translate.
    assert.equal(js('$game_player.opacity -= 50'), '$gamePlayer.setOpacity($gamePlayer.opacity() - (50));');
    assert.equal(js('$game_party.gold += 100'), '$gameParty.gainGold(($gameParty.gold() + (100)) - $gameParty.gold());');
    assert.equal(js('$game_message.position += 1'), null);
    const run = (ruby, vars = {}, switches = {}) => {
        const $gameVariables = { value: (i) => vars[i] || 0, setValue: (i, v) => { vars[i] = v; } };
        const $gameSwitches = { value: (i) => !!switches[i], setValue: (i, v) => { switches[i] = v; } };
        const code = js(ruby);
        assert.notEqual(code, null, ruby);
        new Function('$gameVariables', '$gameSwitches', code)($gameVariables, $gameSwitches);
        return { vars, switches };
    };
    // A local keeps no kind it has left: nil after a number is false, a Float after an integer divides as one.
    assert.equal(run('x = 5\nx = nil if $game_switches[1]\n$game_switches[2] = true if x', {}, { 1: true }).switches[2], undefined);
    assert.equal(run('x = 1\nx = 2.5\n$game_variables[1] = x / 2').vars[1], 1.25);
    assert.equal(run('$game_variables[1] = 10 / -4.0').vars[1], -2.5);
    assert.equal(run('$game_variables[1].upto(5) { |i| $game_variables[2] += i }', { 1: 3 }).vars[2], 12);
    assert.equal(run('x = 0\n$game_switches[1] = x.zero?').switches[1], true);
    assert.equal(run('n = 3\nfor i in 1..n do\n$game_variables[1] += i\nend').vars[1], 6);
    assert.equal(run('i = 0\nwhile i < 3 do\ni += 1\nend\n$game_variables[1] = i').vars[1], 3);
});

test('the shipped language is one the game has a text file for, spelled as its file is', () => {
    const KL = require(path.join(legacy, 'KeyedLocalization.js'));
    const settings = { load: () => new Map([[':language', 0]]) };
    assert.equal(KL.shippedLanguage(() => Buffer.from('x'), settings, ['Eng'], ['["Ita", "Eng"].each_with_index']), 'Eng', 'Ita is listed but not shipped');
    assert.equal(KL.shippedLanguage(() => Buffer.from('x'), settings, ['eng', 'ita'], ['["Ita", "Eng"].each_with_index']), 'ita');
});
