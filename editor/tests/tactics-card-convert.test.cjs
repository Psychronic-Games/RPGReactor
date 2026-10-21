'use strict';
// build-scripts/battle-tags-to-fields.cjs: a project's battle tags moved out
// of its records' Notes into the records themselves. Without --write it only
// says what it would move; with it, only the lines of the records that
// change are rewritten, every other byte of the files stays, a PTBS block is
// never touched, the game reads every record as it did, and a second run
// finds nothing. All or nothing: one file that cannot be read, converted or
// written and no file is. A tag one of the project's own enabled plugins
// reads stays in its Note. A project an editor holds open, or whose engine
// copy would not play the moved settings, is refused.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const editorRoot = path.resolve(__dirname, '..');
const repo = path.resolve(editorRoot, '..');
const script = path.join(editorRoot, 'build-scripts', 'battle-tags-to-fields.cjs');
const Converter = require(script);
const T = require(path.join(editorRoot, 'src', 'database', 'TacticsSection.js'));
const { fightWorld } = require('./helpers/fight-world.cjs');

const PTBS = '<PTBS>\nscope: circle(3,0)\naoe: circle(2,0)\nmove_points: 4\n</PTBS>';
const lines = records => '[\n' + records.map(record => JSON.stringify(record)).join(',\n') + '\n]';
const root = typeof process.getuid === 'function' && process.getuid() === 0;

const FILES = {
    'Actors.json': [null, { id: 1, name: 'Ren', classId: 1, note: 'The lead.\n<move: 6>\n<ai: support>\n<unit character: Evil, 2>' }, { id: 2, name: 'Mira', classId: 2, note: '' }],
    'Classes.json': [null, { id: 1, name: 'Soldier', note: '<move: 5>\n<ai: ranged>' }, { id: 2, name: 'Scout', note: 'Fast.', rrBattle: { move: 7 } }],
    'Skills.json': [null,
        { id: 1, name: 'Attack', scope: 1, hitType: 1, note: 'Skill #1 corresponds to the Attack command.' },
        { id: 2, name: 'Fire', scope: 1, hitType: 2, note: 'Burns. Café ✓\n<range: 2-6> <los: no>\n<area: cone 3>\n<cooldown: 6.5>\n<move: 2>\nLast line.' },
        { id: 3, name: 'Old Bolt', scope: 1, hitType: 2, note: 'From an old game.\n' + PTBS + '\n<range: 5>' },
        null,
        { id: 5, name: 'Both', scope: 1, hitType: 2, note: '<range: 2>\n<area: line 4>', rrBattle: { range: { min: 3, max: 8 } } }],
    'Items.json': [null, { id: 1, name: 'Grenade', scope: 2, note: '<range: 2-5>\n<area: circle 1>\n<los: no>\n<cooldown: 3>' }],
    'Weapons.json': [null, { id: 1, name: 'Sword', wtypeId: 1, note: '' }, { id: 2, name: 'Carbine', wtypeId: 2, note: '<range: 1-5>\n<fire rate: 6>\n<magazine: 24>\n<reload: 1.8>\n<spread: 3>\n<projectile: bolt>\n<move: -1>' }],
    'Armors.json': [null, { id: 1, name: 'Plate', note: 'Heavy.\n<move: -1> <jump: -1>' }],
    'Enemies.json': [null, { id: 1, name: 'Wolf', battlerName: 'Wolf', note: '<move: 3>\n<ai: ranged>\n<unit character: Monster, 3>\n<ai: reckless>' }, { id: 2, name: 'Bat', battlerName: 'Bat', note: '<fire rate: 2>' }],
    'States.json': [null, { id: 1, name: 'Slowed', note: '<move: -2>' }]
};

/**
 * A project in a temp folder: the eight database files, one record a line,
 * and an engine copy that reads a record's own settings (`engine: 'old'`: one
 * from before them; `engine: false`: none).
 */
function project(change, options = {}) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-tags-to-fields-'));
    fs.mkdirSync(path.join(folder, 'data'));
    fs.mkdirSync(path.join(folder, 'js', 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'data', 'System.json'), JSON.stringify({ gameTitle: 'Tags' }));
    if (options.engine !== false) fs.writeFileSync(path.join(folder, 'js', 'reactor_fight_tactical.js'), options.engine === 'old' ? '// tactical battles, tags only\n' : '// tactical battles\nconst own = record.rrBattle;\n');
    const texts = {};
    for (const [name, records] of Object.entries(FILES)) texts[name] = lines(records);
    if (change) change(texts, folder);
    for (const [name, text] of Object.entries(texts)) if (text !== null) fs.writeFileSync(path.join(folder, 'data', name), text);
    return folder;
}
const bytes = (folder, name) => fs.readFileSync(path.join(folder, 'data', name));
const all = folder => { const out = {}; for (const name of fs.readdirSync(path.join(folder, 'data')).sort()) out[name] = bytes(folder, name).toString('latin1'); return out; };
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const plainError = text => { assert.doesNotMatch(text, /^\s+at |node:internal|Error: E[A-Z]+/m, 'a plain sentence, no stack'); return text; };

test.after(() => {
    for (const name of fs.readdirSync(os.tmpdir())) {
        if (!name.startsWith('rr-tags-to-fields-')) continue;
        const folder = path.join(os.tmpdir(), name);
        // A test may have left a folder or a file read-only.
        try { fs.chmodSync(path.join(folder, 'data'), 0o755); for (const file of fs.readdirSync(path.join(folder, 'data'))) fs.chmodSync(path.join(folder, 'data', file), 0o644); } catch (error) { /* no data folder */ }
        fs.rmSync(folder, { recursive: true, force: true });
    }
});

test('without --write it says what it would move, file by file and record by record, and changes nothing', () => {
    const folder = project(), before = all(folder), stamps = fs.readdirSync(path.join(folder, 'data')).map(name => fs.statSync(path.join(folder, 'data', name)).mtimeMs);
    const dry = run(folder);
    assert.equal(dry.status, 0, dry.stderr);
    assert.deepEqual(all(folder), before, 'no file changed');
    assert.deepEqual(fs.readdirSync(path.join(folder, 'data')).map(name => fs.statSync(path.join(folder, 'data', name)).mtimeMs), stamps, 'no file was written');
    assert.equal(dry.stdout, [
        'data/Actors.json',
        '  0001 Ren',
        '       <move: 6>  ->  move 6',
        '       <ai: support>  ->  ai support',
        'data/Classes.json',
        '  0001 Soldier',
        '       <move: 5>  ->  move 5',
        'data/Skills.json',
        '  0002 Fire',
        '       <range: 2-6>  ->  range 2-6',
        '       <area: cone 3>  ->  area cone 3',
        '       <los: no>  ->  los false',
        '       <cooldown: 6.5>  ->  cooldown 6.5',
        '  0003 Old Bolt',
        '       <range: 5>  ->  range 1-5',
        '  0005 Both',
        '       <range: 2>  ->  the record\'s own setting already stands: the tag only leaves the Note',
        '       <area: line 4>  ->  area line 4',
        'data/Items.json',
        '  0001 Grenade',
        '       <range: 2-5>  ->  range 2-5',
        '       <area: circle 1>  ->  area circle 1',
        '       <los: no>  ->  los false',
        '       <cooldown: 3>  ->  cooldown 3',
        'data/Weapons.json',
        '  0002 Carbine',
        '       <range: 1-5>  ->  range 1-5',
        '       <move: -1>  ->  move -1',
        '       <fire rate: 6>  ->  fireRate 6',
        '       <magazine: 24>  ->  magazine 24',
        '       <reload: 1.8>  ->  reload 1.8',
        '       <spread: 3>  ->  spread 3',
        '       <projectile: bolt>  ->  projectile bolt',
        'data/Armors.json',
        '  0001 Plate',
        '       <move: -1>  ->  move -1',
        '       <jump: -1>  ->  jump -1',
        'data/Enemies.json',
        '  0001 Wolf',
        '       <move: 3>  ->  move 3',
        '       <ai: ranged>  ->  ai ranged',
        '       <unit character: Monster, 3>  ->  character Monster, 3',
        'data/States.json',
        '  0001 Slowed',
        '       <move: -2>  ->  move -2',
        '27 tag(s) in 10 record(s) would move. Nothing was changed: run again with --write to move them.',
        ''
    ].join('\n'));
    // The same as data.
    const json = JSON.parse(run(folder, '--json').stdout);
    assert.deepEqual([json.write, json.moved, json.records, json.left, json.written, json.warnings, json.pluginTags], [false, 27, 10, 0, [], [], {}]);
    assert.deepEqual(json.files.find(file => file.file === 'Skills.json').records.map(record => record.id), [2, 3, 5]);
    assert.deepEqual(all(folder), before);
});

test('with --write only the records that change are rewritten, the game reads each as it did, and a second run finds nothing', () => {
    const folder = project(), before = all(folder);
    const world = fightWorld({ tactical: true, action: true, look: true }), F = world.ReactorFight, A = F.Action, L = world.ReactorFightLook;
    const plain = value => (value === null || value === undefined ? null : JSON.parse(JSON.stringify(value)));
    const reading = record => (record ? [plain(F.recordTactics(record)), plain(A.settings(record)), plain(L.recordCharacter({ record: 'enemy', id: record.id }, record))] : null);
    const played = {};
    for (const name of Object.keys(FILES)) played[name] = FILES[name].map(reading);

    const done = run(folder, '--write');
    assert.equal(done.status, 0, done.stderr);
    assert.match(done.stdout, /Moved 27 tag\(s\) in 10 record\(s\); wrote data\/Actors\.json, data\/Classes\.json, data\/Skills\.json, data\/Items\.json, data\/Weapons\.json, data\/Armors\.json, data\/Enemies\.json, data\/States\.json\.\n$/);
    assert.deepEqual(fs.readdirSync(path.join(folder, 'data')).sort(), Object.keys(before).sort(), 'no file left behind');
    for (const name of Object.keys(FILES)) {
        const was = before[name].split('\n'), now = bytes(folder, name).toString('latin1').split('\n'), records = JSON.parse(bytes(folder, name).toString('utf8'));
        assert.equal(now.length, was.length, name);
        FILES[name].forEach((record, index) => {
            const moves = record && T.convert(T.FILES[name], record).moved.length > 0;
            if (!moves) assert.equal(now[index + 1], was[index + 1], `${name} ${index}: a record with nothing to move keeps its line, byte for byte`);
            else assert.notEqual(now[index + 1], was[index + 1], `${name} ${index}`);
            assert.deepEqual(reading(records[index]), played[name][index], `${name} ${index}: the game reads it as it did`);
            if (record) assert.deepEqual(T.convert(T.FILES[name], records[index]).moved, [], `${name} ${index}: nothing left to move`);
        });
    }
    const data = name => JSON.parse(bytes(folder, name).toString('utf8'));
    // One of each kind, as it is afterward.
    assert.deepEqual(data('Skills.json')[2], { id: 2, name: 'Fire', scope: 1, hitType: 2, note: 'Burns. Café ✓\n<move: 2>\nLast line.', rrBattle: { range: { min: 2, max: 6 }, area: { shape: 'cone', size: 3 }, los: false, cooldown: 6.5 } });
    assert.deepEqual(data('Skills.json')[3], { id: 3, name: 'Old Bolt', scope: 1, hitType: 2, note: 'From an old game.\n' + PTBS, rrBattle: { range: { min: 1, max: 5 } } }, 'a PTBS block is where it was');
    assert.deepEqual(data('Skills.json')[5], { id: 5, name: 'Both', scope: 1, hitType: 2, note: '', rrBattle: { range: { min: 3, max: 8 }, area: { shape: 'line', size: 4 } } });
    assert.deepEqual(data('Items.json')[1].rrBattle, { range: { min: 2, max: 5 }, area: { shape: 'circle', size: 1 }, los: false, cooldown: 3 });
    assert.deepEqual(data('Weapons.json')[2], { id: 2, name: 'Carbine', wtypeId: 2, note: '', rrBattle: { range: { min: 1, max: 5 }, move: -1, fireRate: 6, magazine: 24, reload: 1.8, spread: 3, projectile: 'bolt' } });
    assert.deepEqual(data('Armors.json')[1], { id: 1, name: 'Plate', note: 'Heavy.', rrBattle: { move: -1, jump: -1 } });
    assert.deepEqual(data('States.json')[1], { id: 1, name: 'Slowed', note: '', rrBattle: { move: -2 } });
    assert.deepEqual(data('Actors.json')[1], { id: 1, name: 'Ren', classId: 1, note: 'The lead.\n<unit character: Evil, 2>', rrBattle: { move: 6, ai: 'support' } }, 'an actor\'s picture is its own sheet: that tag is not the game\'s');
    assert.deepEqual(data('Classes.json')[1], { id: 1, name: 'Soldier', note: '<ai: ranged>', rrBattle: { move: 5 } }, 'a class has no AI preset: that tag stays');
    assert.deepEqual(data('Enemies.json')[1], { id: 1, name: 'Wolf', battlerName: 'Wolf', note: '', rrBattle: { move: 3, ai: 'ranged', character: { name: 'Monster', index: 3 } } }, 'a second copy of a tag goes with the first: the game read the first');
    assert.deepEqual(data('Enemies.json')[2], FILES['Enemies.json'][2], 'how a weapon fires is nothing an enemy record sets');
    // Twice.
    const after = all(folder), stamps = Object.keys(after).map(name => fs.statSync(path.join(folder, 'data', name)).mtimeMs);
    const again = run(folder, '--write');
    assert.equal(again.status, 0);
    assert.equal(again.stdout, 'Nothing to move: no record keeps a battle setting in its Note.\n');
    assert.deepEqual(all(folder), after);
    assert.deepEqual(Object.keys(after).map(name => fs.statSync(path.join(folder, 'data', name)).mtimeMs), stamps, 'the second run wrote no file');
    assert.equal(run(folder).stdout, 'Nothing to move: no record keeps a battle setting in its Note.\n');
});

test('a file keeps its own line ends, its byte order mark and its mode, a link is written through, and another layout is written as the editor writes it', () => {
    const windows = lines(FILES['States.json']).replace(/\n/g, '\r\n') + '\r\n';
    const pretty = JSON.stringify(FILES['Armors.json'], null, 2);
    let elsewhere = '';
    const folder = project((texts, made) => {
        texts['States.json'] = '\uFEFF' + windows;
        texts['Armors.json'] = pretty;
        texts['Weapons.json'] = null;
        // The items file is a link to a file kept elsewhere.
        elsewhere = path.join(made, 'kept-elsewhere.json');
        fs.writeFileSync(elsewhere, texts['Items.json']);
        fs.symlinkSync(elsewhere, path.join(made, 'data', 'Items.json'));
        texts['Items.json'] = null;
    });
    fs.chmodSync(path.join(folder, 'data', 'Skills.json'), 0o640);
    fs.chmodSync(path.join(folder, 'data', 'Classes.json'), 0o600);
    const done = run(folder, '--write');
    assert.equal(done.status, 0, done.stderr);
    assert.match(done.stdout, /data\/Armors\.json \(not one record a line: written again whole, as the editor writes it\)\n/);
    assert.doesNotMatch(done.stdout, /Weapons\.json/, 'a file that is not there is nothing to say');
    assert.equal(fs.existsSync(path.join(folder, 'data', 'Weapons.json')), false);
    // The Windows file: the mark, every line end and the last empty line stay; one line changed.
    const states = bytes(folder, 'States.json');
    assert.deepEqual([...states.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
    assert.equal(states.toString('utf8').slice(1), '[\r\nnull,\r\n' + JSON.stringify({ id: 1, name: 'Slowed', note: '', rrBattle: { move: -2 } }) + '\r\n]\r\n');
    // The other layout: the editor's own afterward.
    assert.equal(bytes(folder, 'Armors.json').toString('utf8'), lines([null, { id: 1, name: 'Plate', note: 'Heavy.', rrBattle: { move: -1, jump: -1 } }]));
    // The link is still a link, and what it points at holds the change.
    assert.equal(fs.lstatSync(path.join(folder, 'data', 'Items.json')).isSymbolicLink(), true, 'the link is a link');
    assert.equal(fs.readlinkSync(path.join(folder, 'data', 'Items.json')), elsewhere);
    assert.deepEqual(JSON.parse(fs.readFileSync(elsewhere, 'utf8'))[1].rrBattle, { range: { min: 2, max: 5 }, area: { shape: 'circle', size: 1 }, los: false, cooldown: 3 });
    assert.deepEqual(fs.readdirSync(folder).filter(name => name.includes('.tmp')), [], 'no draft beside the file elsewhere');
    // Each file has the mode it had.
    assert.deepEqual(['Skills.json', 'Classes.json'].map(name => fs.statSync(path.join(folder, 'data', name)).mode & 0o777), [0o640, 0o600]);
    assert.deepEqual(fs.readdirSync(path.join(folder, 'data')).filter(name => name.includes('.tmp')), [], 'no draft left');
    // Asked of the functions themselves.
    const one = Converter.convertFile(path.join(folder, 'data', 'Classes.json'), 'class');
    assert.deepEqual([one.file, one.kind, one.records.length, one.text, one.problem], ['Classes.json', 'class', 0, null, ''], 'already moved by the run above');
    assert.equal(Converter.said('area', { shape: 'all' }), 'area all');
    assert.deepEqual(Converter.rewrite('[\nnull,\n{"id":1,"a":1},\n{"id":2,"a":2}\n]', [null, { id: 1, a: 1 }, { id: 2, a: 2 }], { 2: { id: 2, a: 3 } }), { text: '[\nnull,\n{"id":1,"a":1},\n{"id":2,"a":3}\n]', whole: false });
    assert.equal(Converter.rewrite('[\nnull,\n{"id":7,"a":1}\n]', [null, { id: 1, a: 1 }], { 1: { id: 1, a: 3 } }).whole, true, 'a line that is not the record it is taken for: the file is written whole');
});

test('all or nothing: one file that cannot be read, is not UTF-8 JSON or cannot be written, and no file is written', () => {
    const cases = [
        ['not JSON', texts => { texts['Items.json'] = '[ not json'; }, /data\/Items\.json is not JSON \(.+\)/],
        ['not a list', texts => { texts['Enemies.json'] = JSON.stringify({ not: 'a list' }); }, /data\/Enemies\.json is not a list of records/],
        ['UTF-16', (texts, made) => { fs.writeFileSync(path.join(made, 'data', 'States.json'), Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(texts['States.json'], 'utf16le')])); texts['States.json'] = null; }, /data\/States\.json is UTF-16 text, not UTF-8/],
        ['not UTF-8', (texts, made) => { fs.writeFileSync(path.join(made, 'data', 'Armors.json'), Buffer.concat([Buffer.from('[\nnull,\n{"id":1,"name":"Pl'), Buffer.from([0xE9, 0x20]), Buffer.from('","note":"<move: -1>"}\n]')])); texts['Armors.json'] = null; }, /data\/Armors\.json is not UTF-8 text/]
    ];
    for (const [label, change, sentence] of cases) {
        const folder = project(change), before = all(folder);
        const stamps = Object.keys(before).map(name => fs.statSync(path.join(folder, 'data', name)).mtimeMs);
        const done = run(folder, '--write');
        assert.equal(done.status, 1, label);
        assert.match(plainError(done.stderr), sentence, label);
        assert.match(done.stderr, /^nothing was changed: /, label);
        assert.deepEqual(all(folder), before, label + ': no file changed, the others neither');
        assert.deepEqual(Object.keys(before).map(name => fs.statSync(path.join(folder, 'data', name)).mtimeMs), stamps, label + ': no file was written');
        assert.doesNotMatch(done.stdout, /Moved \d+ tag/, label);
        // Looking says the same of that file and lists the rest.
        const dry = run(folder);
        assert.equal(dry.status, 1, label + ': a look is not a clean one either');
        assert.match(dry.stdout, /; left as it is\n/, label);
        assert.match(dry.stdout, /tag\(s\) in \d+ record\(s\) would move\./, label);
        assert.deepEqual(all(folder), before);
    }
    // A file or a folder that is read-only: said, and nothing written. (Whoever runs as root may write anything.)
    if (!root) {
        const locked = project(), before = all(locked);
        fs.chmodSync(path.join(locked, 'data', 'Skills.json'), 0o444);
        const refused = run(locked, '--write');
        assert.equal(refused.status, 1);
        assert.match(plainError(refused.stderr), /^nothing was changed: data\/Skills\.json cannot be written \(the file is read-only\)\.\n$/);
        assert.deepEqual(all(locked), before, 'the other files were not written either');
        assert.equal(fs.statSync(path.join(locked, 'data', 'Skills.json')).mode & 0o777, 0o444, 'and the file is still read-only');
        const shut = project(), was = all(shut);
        fs.chmodSync(path.join(shut, 'data'), 0o555);
        const closed = run(shut, '--write');
        fs.chmodSync(path.join(shut, 'data'), 0o755);
        assert.equal(closed.status, 1);
        assert.match(plainError(closed.stderr), /data\/Actors\.json cannot be written \(its folder is read-only\)/);
        assert.deepEqual(all(shut), was);
        assert.deepEqual(fs.readdirSync(path.join(shut, 'data')).filter(name => name.includes('.tmp')), []);
    }
    // The answer as a caller of the function gets it.
    const folder = project(texts => { texts['Items.json'] = '[ not json'; });
    const done = Converter.convertProject(folder, { write: true });
    assert.deepEqual([done.refused.code, done.written, done.refused.why.length], [1, [], 1]);
    assert.match(done.refused.why[0], /^data\/Items\.json is not JSON/);
});

test('--write refuses a project a running editor holds open, and a lock left by an editor that has gone holds nothing', () => {
    const folder = project(), before = all(folder), lock = path.join(folder, '.rpgreactor.lock');
    // This test's own process stands in for the editor: it is running.
    fs.writeFileSync(lock, JSON.stringify({ app: 'RPG Reactor', pid: process.pid }));
    assert.match(Converter.heldBy(folder), new RegExp(`^an editor \\(process ${process.pid}\\) has this project open \\(`));
    const refused = run(folder, '--write');
    assert.equal(refused.status, 3);
    assert.match(refused.stderr, /^nothing was changed: an editor \(process \d+\) has this project open \(.*\.rpgreactor\.lock\)\. Close the project there first, or run without --write to see what would move\.\n$/);
    assert.equal(refused.stdout, '');
    assert.deepEqual(all(folder), before, 'no file of the project changed');
    // Looking is allowed while it is open.
    const dry = run(folder);
    assert.equal(dry.status, 0);
    assert.match(dry.stdout, /27 tag\(s\) in 10 record\(s\) would move\. Nothing was changed/);
    // A lock that names no running process (the editor crashed), one that is not JSON, and none at all hold nothing.
    const gone = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout;
    for (const text of [JSON.stringify({ pid: Number(gone) }), '{ not json', JSON.stringify({ pid: 0 }), JSON.stringify({})]) {
        fs.writeFileSync(lock, text);
        assert.equal(Converter.heldBy(folder), '', text);
    }
    fs.unlinkSync(lock);
    assert.equal(Converter.heldBy(folder), '');
    fs.writeFileSync(lock, JSON.stringify({ pid: Number(gone) }));
    const done = run(folder, '--write');
    assert.equal(done.status, 0, done.stderr);
    assert.match(done.stdout, /Moved 27 tag\(s\) in 10 record\(s\)/);
    assert.equal(fs.readFileSync(lock, 'utf8'), JSON.stringify({ pid: Number(gone) }), 'the lock is the editor\'s: it is not touched');
});

test('--write refuses a project whose engine copy would not play the moved settings; a look warns of it first', () => {
    for (const [engine, words] of [['old', 'from before them'], [false, 'missing']]) {
        const folder = project(null, { engine }), before = all(folder);
        assert.match(Converter.oldEngine(folder), new RegExp(`js/reactor_fight_tactical\\.js is ${words}`));
        const refused = run(folder, '--write');
        assert.equal(refused.status, 4, String(engine));
        assert.equal(plainError(refused.stderr), `nothing was changed: this project's engine copy does not read settings kept in a record (js/reactor_fight_tactical.js is ${words}): `
            + 'moved settings would be lost in play. Open the project in the editor once, which refreshes its engine, then run this again.\n');
        assert.equal(refused.stdout, '');
        assert.deepEqual(all(folder), before, 'nothing was written');
        // Without --write: the same, as a warning at the top, and the list as ever.
        const dry = run(folder);
        assert.equal(dry.status, 0);
        const said = dry.stdout.split('\n');
        assert.match(said[0], new RegExp(`^warning: this project's engine copy does not read settings kept in a record \\(js/reactor_fight_tactical\\.js is ${words}\\): .* With --write this project is refused until then\\.$`));
        assert.equal(said[1], 'data/Actors.json');
        assert.match(dry.stdout, /27 tag\(s\) in 10 record\(s\) would move\./);
        assert.deepEqual(JSON.parse(run(folder, '--json').stdout).warnings.length, 1);
        assert.deepEqual(all(folder), before);
    }
    // An engine copy that reads them: no warning, and the game's own file is such a copy.
    assert.equal(Converter.oldEngine(project()), '');
    assert.match(fs.readFileSync(path.join(repo, 'runtime', 'reactor_fight_tactical.js'), 'utf8'), /rrBattle/, 'what the check looks for is in the engine');
    // The lock is asked first: an open editor is the nearer danger.
    const both = project(null, { engine: 'old' });
    fs.writeFileSync(path.join(both, '.rpgreactor.lock'), JSON.stringify({ pid: process.pid }));
    assert.equal(run(both, '--write').status, 3);
});

test('a tag one of the project\'s own enabled plugins reads stays in its Note, and is listed with the plugin', () => {
    const plugins = made => {
        // As a project lists them: one that reads <cooldown: N>, switched on; one that reads <range: N>, switched off;
        // one switched on whose file is not there; one that reads other tags.
        fs.writeFileSync(path.join(made, 'js', 'reactor_plugins.js'), '// Generated by RPG Reactor Plugin Manager\nvar $plugins =\n' + JSON.stringify([
            { name: 'Other_Tags', status: true, description: '', parameters: {} },
            { name: 'YEP_X_SkillCooldowns', status: true, description: '', parameters: {} },
            { name: 'Range_Reader', status: false, description: '', parameters: {} },
            { name: 'Not_Installed', status: true, description: '', parameters: {} }
        ], null, 4) + ';\n');
        fs.writeFileSync(path.join(made, 'js', 'plugins', 'YEP_X_SkillCooldowns.js'), ' * <Cooldown: x>\n                if (line.match(/<(?:COOLDOWN):[ ](\\d+)>/i)) {\n');
        fs.writeFileSync(path.join(made, 'js', 'plugins', 'Range_Reader.js'), 'const range = /<range\\s*:\\s*(\\d+)>/i.exec(note);\n');
        fs.writeFileSync(path.join(made, 'js', 'plugins', 'Other_Tags.js'), '/<(?:COOLDOWN RATE):[ ](\\d+)>/i; /<aoe range: (\\d+)>/; if (a < range ? b : c > d) {}\n');
    };
    const folder = project((texts, made) => plugins(made)), before = all(folder);
    const dry = run(folder);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /  0002 Fire\n       <range: 2-6>  ->  range 2-6\n       <area: cone 3>  ->  area cone 3\n       <los: no>  ->  los false\n       <cooldown: 6\.5>  stays: the plugin YEP_X_SkillCooldowns reads it\n/);
    assert.match(dry.stdout, /  0001 Grenade\n(?:       <[^\n]+\n){3}       <cooldown: 3>  stays: the plugin YEP_X_SkillCooldowns reads it\n/);
    assert.match(dry.stdout, /\n25 tag\(s\) in 10 record\(s\) would move\. 2 tag\(s\) stay in their Notes for the plugins that read them\. Nothing was changed: run again with --write to move them\.\n$/);
    assert.deepEqual(all(folder), before);
    const done = run(folder, '--write');
    assert.equal(done.status, 0, done.stderr);
    assert.match(done.stdout, /Moved 25 tag\(s\) in 10 record\(s\); wrote [^\n]+\. 2 tag\(s\) stay in their Notes for the plugins that read them\.\n$/);
    const data = name => JSON.parse(bytes(folder, name).toString('utf8'));
    assert.deepEqual(data('Skills.json')[2], { id: 2, name: 'Fire', scope: 1, hitType: 2, note: 'Burns. Café ✓\n<cooldown: 6.5>\n<move: 2>\nLast line.', rrBattle: { range: { min: 2, max: 6 }, area: { shape: 'cone', size: 3 }, los: false } },
        'the plugin\'s tag is where it was, and no setting was made of it');
    assert.deepEqual(data('Items.json')[1], { id: 1, name: 'Grenade', scope: 2, note: '<cooldown: 3>', rrBattle: { range: { min: 2, max: 5 }, area: { shape: 'circle', size: 1 }, los: false } });
    // The plugin still finds its tag: its own pattern, on the Note as it is now.
    assert.match(data('Items.json')[1].note, /<(?:COOLDOWN):[ ](\d+)>/i);
    assert.doesNotMatch(data('Skills.json')[2].note, /<range|<area|<los/, 'a tag only a switched-off plugin reads moved like any other');
    // Again: nothing more to move, and the ones that stay are still said.
    const after = all(folder), again = run(folder, '--write');
    assert.equal(again.status, 0);
    assert.match(again.stdout, /       <cooldown: 6\.5>  stays: the plugin YEP_X_SkillCooldowns reads it\n/);
    assert.match(again.stdout, /Nothing to move: no record keeps a battle setting in its Note but for those a plugin reads\. 2 tag\(s\) stay in their Notes for the plugins that read them\.\n$/);
    assert.deepEqual(all(folder), after, 'and no file is written');
    const json = JSON.parse(run(folder, '--json').stdout);
    assert.deepEqual([json.moved, json.left, json.pluginTags], [0, 2, { cooldown: 'YEP_X_SkillCooldowns' }]);
    assert.deepEqual(json.files.find(file => file.file === 'Items.json').records[0].left, [{ key: 'cooldown', tag: '<cooldown: 3>', plugin: 'YEP_X_SkillCooldowns' }]);
    // A project that lists its plugins in js/plugins.js alone is read the same; with both lists, the one the game runs.
    const older = project((texts, made) => { plugins(made); fs.renameSync(path.join(made, 'js', 'reactor_plugins.js'), path.join(made, 'js', 'plugins.js')); });
    assert.match(run(older).stdout, /<cooldown: 6\.5>  stays: the plugin YEP_X_SkillCooldowns reads it/);
    const two = project((texts, made) => { plugins(made); fs.writeFileSync(path.join(made, 'js', 'plugins.js'), 'var $plugins =\n[{"name":"Range_Reader","status":true}];\n'); });
    assert.deepEqual(JSON.parse(run(two, '--json').stdout).pluginTags, { cooldown: 'YEP_X_SkillCooldowns' });
    // No plugin list, or one that cannot be read: no tag stays.
    assert.deepEqual(JSON.parse(run(project((texts, made) => fs.writeFileSync(path.join(made, 'js', 'reactor_plugins.js'), 'var $plugins = [ not json ];')), '--json').stdout).pluginTags, {});
});

test('a Note that uses CRLF keeps CRLF on every line it keeps, and no line end is left half', () => {
    const notes = {
        2: ['Words\r\n<range: 2-5>', 'Words'],
        3: ['First\r\n<range: 2-5>\r\n<area: circle 2>\r\nLast\r\n', 'First\r\nLast\r\n'],
        4: ['<los: no>\r\nOne\r\n\r\nTwo <range: 3> words\r\n<cooldown: 4>\r\n', 'One\r\n\r\nTwo  words\r\n'],
        5: ['Mixed\n<range: 2>\r\nends\r\nstay\n', 'Mixed\nends\r\nstay\n'],
        6: ['Old Mac\r<range: 2>\rline', 'Old Mac\rline']
    };
    const folder = project(texts => {
        texts['Skills.json'] = lines([null, { id: 1, name: 'Plain', scope: 1, hitType: 2, note: 'Kept\r\nas it is\r\n' }]
            .concat(Object.keys(notes).map(id => ({ id: Number(id), name: 'S' + id, scope: 1, hitType: 2, note: notes[id][0] }))));
    });
    const was = bytes(folder, 'Skills.json').toString('utf8').split('\n');
    assert.equal(run(folder, '--write').status, 0);
    const text = bytes(folder, 'Skills.json').toString('utf8'), records = JSON.parse(text);
    for (const id of Object.keys(notes)) {
        assert.equal(records[id].note, notes[id][1], JSON.stringify(notes[id][0]));
        assert.doesNotMatch(records[id].note.replace(/\r\n/g, ''), id === '6' ? /\n/ : /\r/, `record ${id}: no lone CR`);
    }
    assert.equal(text.split('\n')[2], was[2], 'a record with nothing to move keeps its line, its \\r\\n as they were written');
    assert.ok(text.includes('"note":"First\\r\\nLast\\r\\n"'), 'in the file, byte for byte');
});

test('it wants a project folder, and says how it is used', () => {
    const none = run();
    assert.deepEqual([none.status, none.stderr], [2, 'usage: battle-tags-to-fields.cjs <project folder> [--write] [--json]\n']);
    assert.equal(run(os.tmpdir(), '--nonsense').status, 2);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-tags-to-fields-'));
    const stray = run(empty, '--write');
    assert.equal(stray.status, 2);
    assert.match(stray.stderr, /^not a project: .* \(no data\/System\.json\)\n$/);
    assert.deepEqual(fs.readdirSync(empty), [], 'nothing is made in a folder that is no project');
    // The script uses the cards' own conversion and the cards' own reading of the plugins: one rule for both.
    const source = fs.readFileSync(script, 'utf8');
    assert.match(source, /const done = T\.convert\(kind, record, context\);/);
    assert.match(source, /T\.put\(next, done\);/);
    assert.match(source, /out\.pluginTags = T\.scanPluginTags\(project, \{ fs, path \}\);/);
    assert.doesNotMatch(source, /\uFEFF/u, 'the mark is written as an escape, never as the invisible character');
});
