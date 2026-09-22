'use strict';
// The RPG Maker 2000/2003 reader: BER integers, chunk walking, records,
// event commands and move routes, read back from files this test writes
// with the format's own rules. A real project (Deep 8, not in the
// repository) is read too when it is present.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const L = require('../src/legacy/LcfReader.js');

// ---- a tiny LCF writer, enough to build fixtures ---------------------------
const enc1252 = (s) => Uint8Array.from(Buffer.from(s, 'latin1'));
function ber(n) {
    n = n >>> 0;
    const out = [n & 0x7f];
    n = Math.floor(n / 128);
    while (n > 0) { out.unshift((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
    return out;
}
const bytes = (...parts) => Uint8Array.from(parts.flatMap(p => (p instanceof Uint8Array ? Array.from(p) : Array.isArray(p) ? p : [p])));
const chunk = (id, body) => bytes(ber(id), ber(body.length), body);
const int = (id, v) => chunk(id, bytes(ber(v)));
const str = (id, s) => chunk(id, enc1252(s));
const record = (id, ...chunks) => bytes(ber(id), ...chunks, [0]);
const array = (...records) => bytes(ber(records.length), ...records);
const u16 = (list) => bytes(list.flatMap(v => [v & 0xff, (v >> 8) & 0xff]));
const command = (code, indent, s, params) => bytes(ber(code), ber(indent), ber(enc1252(s).length), enc1252(s), ber(params.length), ...params.map(ber));
const header = (name) => bytes(ber(name.length), enc1252(name));

test('BER integers decode, including multi-byte and negative values', () => {
    assert.deepEqual(L.ber(Uint8Array.from([0x05]), 0), [5, 1]);
    assert.deepEqual(L.ber(Uint8Array.from([0x81, 0x00]), 0), [128, 2]);
    assert.deepEqual(L.ber(Uint8Array.from([0x82, 0x0b]), 0), [267, 2]);
    // -5 is stored as the two's complement 0xFFFFFFFB, five BER bytes
    assert.deepEqual(L.berInt(Uint8Array.from(ber(-5)), 0), [-5, 5]);
    assert.throws(() => L.ber(Uint8Array.from([0x80]), 0), /unexpected end/);
});

test('a database round-trips: records, strings in the code page, arrays, structs, commands', () => {
    const actor = record(1, str(1, 'H\xe9r\xf4'), int(7, 3), str(15, 'Faces'), chunk(31, u16([10, 20, 30])), chunk(80, bytes([1, 0, 0, 0, 2, 0, 0, 0])));
    const ce = record(1, str(1, 'Boot'), int(11, 5), chunk(22, bytes(
        command(10220, 0, '', [0, 5, 5, 0, 1, -7]),
        command(12410, 0, '@call add_sprite, "x", 1', []),
        command(0, 0, '', [])
    )));
    const db = bytes(header('LcfDataBase'),
        chunk(11, array(actor)),
        chunk(23, array(record(1, str(1, 'Door open')), record(2))),
        chunk(21, bytes(str(132, 'Attack'), str(114, 'New Game'))),
        chunk(22, bytes(int(10, 2003), str(17, 'TitleImg'), chunk(22, u16([1, 3])))),
        chunk(25, array(ce)),
        chunk(30, array(record(1, str(1, 'Fighter')))),
        chunk(99, bytes([1, 2, 3])));
    const out = L.readDatabase(db, 'windows-1252');
    assert.equal(out.engine, 'RPG Maker 2003');
    assert.equal(out.encoding, 'windows-1252');
    assert.equal(out.actors[1].name, 'Hérô');
    assert.equal(out.actors[1].initial_level, 3);
    assert.deepEqual(out.actors[1].parameters, [10, 20, 30]);
    assert.deepEqual(out.actors[1].battle_commands, [1, 2]);
    assert.equal(out.switches[1].name, 'Door open');
    assert.equal(out.switches[2].name, undefined);
    assert.equal(out.terms.attack, 'Attack');
    assert.equal(out.terms.new_game, 'New Game');
    assert.equal(out.system.ldb_id, 2003);
    assert.deepEqual(out.system.party, [1, 3]);
    const cmds = out.commonevents[1].event_commands;
    assert.equal(cmds.length, 3);
    assert.deepEqual(cmds[0], { code: 10220, indent: 0, string: '', parameters: [0, 5, 5, 0, 1, -7] });
    assert.equal(cmds[1].string, '@call add_sprite, "x", 1');
    assert.equal(L.dynCommand(cmds[1].string), 'add_sprite');
    assert.equal(L.dynCommand('plain comment'), null);
    assert.deepEqual(out._unknown, { 99: 3 });
});

test('a map tree has no chunk wrapper: maps, order, active node, start', () => {
    const lmt = bytes(header('LcfMapTree'),
        array(record(0, str(1, 'Game'), int(4, 0)), record(1, str(1, 'Town'), int(2, 0), int(4, 1)), record(2, str(1, 'Area'), int(2, 1), int(4, 2))),
        ber(3), ber(0), ber(1), ber(2),
        ber(1),
        int(1, 1), int(2, 7), int(3, 9));
    const tree = L.readMapTree(lmt, 'windows-1252');
    assert.equal(tree.maps[1].name, 'Town');
    assert.equal(tree.maps[2].type, 2);
    assert.deepEqual(tree.treeOrder, [0, 1, 2]);
    assert.equal(tree.activeNode, 1);
    assert.deepEqual(tree.start, { party_map_id: 1, party_x: 7, party_y: 9 });
});

test('a map reads its layers, events, pages, conditions, move routes and commands', () => {
    const route = chunk(41, bytes(int(11, 3), chunk(12, bytes(ber(1), ber(34), ber(3), enc1252('Guy'), ber(2), ber(35), ber(2), enc1252('SE'), ber(100), ber(100), ber(50))), int(21, 1)));
    const page = record(1, chunk(2, bytes(int(1, 1 | 4), int(2, 12), int(4, 3), int(5, 10), int(10, 2))),
        str(21, 'Hero'), int(22, 2), int(33, 1), int(34, 1), route,
        chunk(52, bytes(command(10110, 0, 'Hello', []), command(20110, 0, 'World', []), command(0, 0, '', []))));
    const lmu = bytes(header('LcfMapUnit'),
        int(1, 4), int(2, 2), int(3, 2), int(31, 1), str(32, 'sky'),
        chunk(71, u16([5000, 5001, 10000, 0])), chunk(72, u16([10000, 10000, 10000, 10001])),
        chunk(81, array(record(7, str(1, 'EV0007'), int(2, 1), int(3, 0), chunk(5, array(page))))));
    const map = L.readMap(lmu, 'windows-1252');
    assert.equal(map.chipset_id, 4);
    assert.deepEqual([map.width, map.height], [2, 2]);
    assert.equal(map.parallax_flag, true);
    assert.equal(map.parallax_name, 'sky');
    assert.deepEqual(map.lower_layer, [5000, 5001, 10000, 0]);
    assert.deepEqual(map.upper_layer, [10000, 10000, 10000, 10001]);
    const ev = map.events[7];
    assert.equal(ev.name, 'EV0007');
    const pg = ev.pages[1];
    assert.equal(pg.character_name, 'Hero');
    assert.deepEqual(pg.condition, { flags: 5, switch_a_id: 12, variable_id: 3, variable_value: 10, compare_operator: 2 });
    assert.equal(pg.move_route.repeat, true);
    assert.deepEqual(pg.move_route.move_commands, [
        { code: 1 }, { code: 34, parameter_string: 'Guy', parameter_a: 2 },
        { code: 35, parameter_string: 'SE', parameter_a: 100, parameter_b: 100, parameter_c: 50 }
    ]);
    assert.deepEqual(pg.event_commands.map(c => [c.code, c.string]), [[10110, 'Hello'], [20110, 'World'], [0, '']]);
});

test('the code page is guessed from the text: Shift_JIS for Japanese, Windows-1252 for the rest', () => {
    assert.equal(L.detectEncoding([Uint8Array.from(Buffer.from('Attack', 'latin1'))]), 'windows-1252');
    assert.equal(L.detectEncoding([Uint8Array.from(Buffer.from('Pr\xe4vention und Ausr\xfcstung', 'latin1'))]), 'windows-1252');
    // テスト in Shift_JIS
    assert.equal(L.detectEncoding([Uint8Array.from([0x83, 0x65, 0x83, 0x58, 0x83, 0x67])]), 'shift_jis');
    assert.equal(L.normalizeEncoding('932'), 'shift_jis');
    assert.equal(L.normalizeEncoding('1252'), 'windows-1252');
    assert.deepEqual(L.parseIni('[RPG_RT]\nGameTitle=Deep 8\nEncoding=1252\n'), { RPG_RT: { GameTitle: 'Deep 8', Encoding: '1252' } });
});

test('every named command has a conversion target and every target a name', () => {
    for (const code of Object.keys(L.COMMAND_NAMES)) assert.ok(L.COMMAND_TARGETS[code], `target for ${code} ${L.COMMAND_NAMES[code]}`);
    for (const code of Object.keys(L.COMMAND_TARGETS)) assert.ok(L.COMMAND_NAMES[code], `name for ${code}`);
});

const deep8 = path.resolve(__dirname, '..', '..', 'template', 'DEEP 8');
test('Deep 8 reads whole, when the project is present', { skip: !fs.existsSync(path.join(deep8, 'RPG_RT.ldb')) }, () => {
    const files = { read: (n) => (fs.existsSync(path.join(deep8, n)) ? fs.readFileSync(path.join(deep8, n)) : null), list: () => [] };
    const project = L.readProject(files);
    const db = project.database;
    const count = (a) => a.filter(Boolean).length;
    assert.equal(project.encoding, 'windows-1252');
    assert.equal(db.engine, 'RPG Maker 2003');
    assert.equal(count(db.actors), 14);
    assert.equal(count(db.commonevents), 820);
    assert.equal(count(db.chipsets), 100);
    assert.equal(db.actors[1].name, 'Ramirez');
    assert.equal(db.terms.attack, 'Angriff');
    assert.equal(db.system.show_title, false, 'Deep 8 hides the stock title screen and runs its own');
    assert.equal(db.system.frame_name, 'Title1');
    assert.equal(Object.keys(project.maps).length, 266);
    assert.deepEqual(project.missing, []);
    const map = project.maps[13];
    assert.equal(map.lower_layer.length, map.width * map.height);
    assert.equal(count(map.events), 548);
    // No record carries a chunk this reader does not name, other than empty markers.
    for (const key of ['actors', 'items', 'enemies', 'troops', 'chipsets', 'commonevents']) {
        for (const r of db[key].filter(Boolean)) for (const [id, len] of Object.entries(r._unknown || {})) assert.ok(len <= 1, `${key} ${r.id} chunk ${id}`);
    }
});
