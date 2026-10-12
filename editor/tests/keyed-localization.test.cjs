'use strict';
// Games that keep their text in Local/<Language>.csv under keys ("[12" a line of
// the language's file, "{3" one of the map's): the language a game ships, the
// key rules, writing the chosen language into imported data, and the runtime
// plugin for the keys only a running game puts together.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const KL = require('../src/legacy/KeyedLocalization.js');

const files = (tree) => (dir) => Object.keys(tree).filter(p => p.toLowerCase().startsWith(dir.toLowerCase() + '/')).map(p => p.slice(dir.length + 1));
const tree = {
    'Local/Eng.csv': 'NEW GAME\r\nCONTINUE\r\nAttack',
    'Local/Ita.csv': 'NUOVA PARTITA\r\nCONTINUA\r\nAttacca',
    'Local/Maps-Eng/11.csv': '\\n<\\n[2]>I checked by the entrance.\r\nSecond line',
    'Local/Maps-Ita/11.csv': 'Ho controllato.\r\nSeconda'
};
const read = (rel) => (tree[rel] !== undefined ? Buffer.from(tree[rel]) : null);

test('the languages a game ships, and the one it starts in', () => {
    assert.deepEqual(KL.languages(files(tree)).sort(), ['Eng', 'Ita']);
    assert.ok(KL.usedBy(['def self.lookup_loc_text(text)\n  file = File.open("Local/" + lang + ".csv")']));
    assert.deepEqual(KL.order(['["Ita", "Eng"].each_with_index do |lang, index|']), ['Ita', 'Eng']);
    const M = { load: () => ({ __class: 'H87_Settings', settings: { language: 0 } }) };
    assert.equal(KL.shippedLanguage(() => Buffer.from('x'), M, ['Eng', 'Ita'], ['["Ita", "Eng"].each_with_index']), 'Ita', 'index 0 of the scripts\' order');
    assert.equal(KL.shippedLanguage(() => null, { load() { throw new Error('none'); } }, ['Eng', 'Ita'], []), 'Eng');
});

test('a key is replaced by its line and the rest of the string stays', () => {
    const table = KL.load('Eng', read, files(tree));
    assert.equal(KL.resolve('[1', table), 'NEW GAME');
    assert.equal(KL.resolve('[3 ', table), 'Attack ', 'what follows the key stays');
    assert.equal(KL.resolve('{2', table, table.maps[11]), 'Second line');
    assert.equal(KL.resolve('{2', table), '{2', 'a map key needs the map');
    assert.equal(KL.resolve('[99', table), '[99', 'a key past the file stays as it was');
    assert.equal(KL.resolve('Plain text [1', table), 'Plain text [1', 'only a leading key');
});

test('the import writes the language into event text, database records and terms', () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-keyed-'));
    try {
        fs.mkdirSync(path.join(dest, 'data'));
        const ev = (list) => ({ pages: [{ list }] });
        fs.writeFileSync(path.join(dest, 'data', 'Map011.json'), JSON.stringify({ events: [null, ev([{ code: 101, parameters: ['', 0, 0, 2] }, { code: 401, parameters: ['{1'] }, { code: 102, parameters: [['[1', '[2'], 1] }, { code: 355, parameters: ['$game_variables[5] = "[3"'] }, { code: 0, parameters: [] }])] }));
        fs.writeFileSync(path.join(dest, 'data', 'Items.json'), JSON.stringify([null, { id: 1, name: '[3', description: '[2', note: '[1' }]));
        fs.writeFileSync(path.join(dest, 'data', 'System.json'), JSON.stringify({ gameTitle: 'Pinnacle', terms: { basic: [], commands: ['[3'], params: [], messages: { emerge: '[1' } }, skillTypes: ['', '[2'] }));
        const n = KL.bakeProject(dest, KL.load('Eng', read, files(tree)), fs);
        const map = JSON.parse(fs.readFileSync(path.join(dest, 'data', 'Map011.json'), 'utf8')).events[1].pages[0].list;
        assert.equal(map[1].parameters[0], '\\n<\\n[2]>I checked by the entrance.', 'the map\'s own file');
        assert.deepEqual(map[2].parameters[0], ['NEW GAME', 'CONTINUE']);
        assert.equal(map[3].parameters[0], '$game_variables[5] = "[3"', 'scripts stay: their keys resolve at runtime');
        const item = JSON.parse(fs.readFileSync(path.join(dest, 'data', 'Items.json'), 'utf8'))[1];
        assert.deepEqual([item.name, item.description, item.note], ['Attack', 'CONTINUE', '[1'], 'notes are not text the player reads');
        const sys = JSON.parse(fs.readFileSync(path.join(dest, 'data', 'System.json'), 'utf8'));
        assert.deepEqual([sys.terms.commands[0], sys.terms.messages.emerge, sys.skillTypes[1]], ['Attack', 'NEW GAME', 'CONTINUE']);
        assert.equal(n, 8);
        assert.equal(JSON.parse(fs.readFileSync(path.join(dest, 'data', 'RRLocalization.json'), 'utf8')).language, 'Eng');
    } finally { fs.rmSync(dest, { recursive: true, force: true }); }
});

test('at runtime the plugin resolves keys in messages, drawn text and variables, with the current map\'s lines', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy', 'plugins', 'RR_KeyedLocalization.js'), 'utf8');
    function Window_Base() {}
    Window_Base.prototype.convertEscapeCharacters = (t) => t;
    const drawn = [];
    Window_Base.prototype.drawText = (t) => drawn.push(t);
    function Game_Message() { this.texts = []; }
    Game_Message.prototype.add = function(t) { this.texts.push(t); };
    const ctx = { PluginManager: { parameters: () => ({ language: 'Eng' }) }, DataManager: { _databaseFiles: [] }, Window_Base, Game_Message,
        $gameMap: { mapId: () => 11 }, $gameVariables: { value: (n) => (n === 5 ? '[3' : 7) } };
    ctx.window = ctx;
    vm.runInNewContext(src, ctx);
    assert.equal(ctx.DataManager._databaseFiles[0].src, 'RRLocalization.json');
    ctx.$dataRrLocalization = KL.load('Eng', read, files(tree));
    const w = new Window_Base();
    assert.equal(w.convertEscapeCharacters('{2'), 'Second line');
    assert.equal(w.convertEscapeCharacters('Won: \\V[5] / \\V[6]'), 'Won: Attack / \\V[6]', 'a variable holding a key shows its line; numbers stay for MZ');
    w.drawText('[1', 0, 0);
    assert.deepEqual(drawn, ['NEW GAME']);
    const msg = new Game_Message();
    msg.add('[2');
    assert.deepEqual(msg.texts, ['CONTINUE']);
    assert.equal(ctx.RRKeyedText.language(), 'Eng');
});

test('Script commands moving events translate', () => {
    const T = require('../src/legacy/RubyTranspiler.js');
    const js = T.transpile('wolf = $game_map.events[@event_id]\nif !wolf.collide_with_characters?(wolf.x + 1, wolf.y)\n  wolf.set_graphic("Wolf", 2)\n  wolf.set_direction(4)\n  wolf.move_straight(4)\nend', { self: 'interpreter', constants: {}, calls: {}, ivars: {} });
    assert.equal(js, 'var wolf = $gameMap.event(this._eventId);\nif (!(wolf.isCollidedWithCharacters((wolf.x + 1), wolf.y))) { wolf.setImage("Wolf", 2); wolf.setDirection(4); wolf.moveStraight(4); }');
});
