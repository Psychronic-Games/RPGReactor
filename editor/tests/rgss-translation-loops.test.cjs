'use strict';
// Ruby loops in Script commands: n.times is a plain loop (break and next work),
// next inside a block returns from it, a wait inside a loop makes the command a
// generator the interpreter steps, and the stock calls tactics and story games
// use (transfers, region, common events, skill lists).
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const path = require('node:path');
const fs = require('node:fs');
const T = require('../src/legacy/RubyTranspiler.js');

const js = (ruby) => T.transpile(ruby, { self: 'interpreter', constants: {}, calls: {}, ivars: {} });

test('break and next inside loops and blocks', () => {
    assert.equal(js('5.times do |i|\n break if i > 2\n $game_variables[1] += 1\nend'), 'for (let i = 0; i < 5; i++) { if ((i > 2)) { break; } $gameVariables.setValue(1, $gameVariables.value(1) + (1)); };');
    const vars = { v: {}, value(n) { return this.v[n] || 0; }, setValue(n, x) { this.v[n] = x; } };
    new Function('$gameVariables', js('5.times do |i|\n next if i == 1\n break if i == 3\n $game_variables[1] += 10\nend'))(vars);
    assert.equal(vars.v[1], 20, 'i = 0 and 2 count; 1 is skipped; 3 stops it');
    assert.equal(js('$game_party.members.each do |m|\n next if m.hp > 5\n m.hp += 1\nend'), '$gameParty.members().forEach((m) => { if ((m.hp > 5)) { return; } m.setHp(m.hp + (1)); });');
    assert.equal(js('$game_party.members.each do |m|\n break\nend'), null, 'break out of a callback has no JS form');
});

test('a wait inside a loop runs as a generator the interpreter steps, a frame count per wait', () => {
    const code = js('x = 0\nwhile [x, 0] != [3, 0]\n x += 1\n $game_variables[1] = x\n wait(30)\nend\n$game_variables[2] = 9');
    assert.match(code, /^this\.rrRunScript\(function\* \(\) \{/);
    assert.equal(js('5.times do\n wait(2)\nend').includes('(yield 2)'), true);
    assert.equal(js('[1, 2].each do |i|\n wait(1)\nend'), null, 'a wait inside a callback cannot yield');
    assert.equal(js('wait(30)'), 'this.wait(30);');
    // The runtime side, on a stub interpreter.
    const runtime = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_objects_legacy.js'), 'utf8');
    const part = runtime.slice(runtime.indexOf('Game_Interpreter.prototype.rrRunScript'), runtime.indexOf('// [fN] character sheets'));
    function Game_Interpreter() { this._waitCount = 0; }
    Game_Interpreter.prototype.wait = function(n) { this._waitCount = n; };
    Game_Interpreter.prototype.updateWait = function() { if (this._waitCount > 0) { this._waitCount--; return true; } return false; };
    Game_Interpreter.prototype.clear = function() {};
    const vars = { _data: [], value(i) { return this._data[i] || 0; }, setValue(i, v) { this._data[i] = v; } };
    const ctx = { Game_Interpreter, $gameVariables: vars };
    vm.runInNewContext(part, ctx);
    const it = new Game_Interpreter();
    vm.runInNewContext('(function() { ' + code + ' })', ctx).call(it);
    assert.equal(vars.value(1), 1, 'runs to its first wait at once');
    let frames = 0;
    while (it.updateWait()) frames++;
    assert.deepEqual([vars.value(1), vars.value(2), frames], [3, 9, 90]);
});

test('transfers with Ace\'s fade, region, common events, skill lists and class checks', () => {
    assert.equal(js('$game_temp.fade_type = 2\n$game_player.reserve_transfer(5, 3, 4)'), '($gameTemp._rrFadeType = 2);\n$gamePlayer.reserveTransfer(5, 3, 4, (undefined ?? 2), ($gameTemp._rrFadeType ?? 0));');
    assert.equal(js('x = $game_map.x_with_direction(3, 4)'), 'var x = $gameMap.roundXWithDirection(3, 4);');
    assert.equal(js('$game_temp.reserve_common_event(12)'), '$gameTemp.reserveCommonEvent(12);');
    assert.equal(js('r = $game_player.region_id'), 'var r = $gamePlayer.regionId();');
    assert.equal(js('a = $game_actors[1]\nfor s in a.skills\n $game_variables[2] += 1 if s.stype_id == 1\nend'), 'var a = $gameActors.actor(1);\nfor (var s of a.skills()) { if ((s.stypeId === 1)) { $gameVariables.setValue(2, $gameVariables.value(2) + (1)); } }');
    assert.equal(js('if $game_variables[3].is_a?(Array)\n$game_variables[4] = 1\nend'), 'if (Array.isArray($gameVariables.value(3))) { $gameVariables.setValue(4, 1); }');
});

test('slices, the message\'s own settings and record fields on unknown values', () => {
    assert.deepEqual(new Function(`${js('a = [1, 2, 3, 4, 5]\nb = a[1, 2]\nc = a[-2, 2]\nd = "hello"[1, 3]')} return [b, c, d];`)(), [[2, 3], [4, 5], 'ell']);
    assert.equal(js('$game_message.position = 1\n$game_message.background = 2'), '($gameMessage._positionType = 1);\n($gameMessage._background = 2);');
    // An element of a list kept in a variable may be a database record or a battler: id and name read either.
    const run = (ruby, v11) => { const out = {}; const vars = { value: (n) => (n === 11 ? v11 : out[n] || 0), setValue: (n, x) => { out[n] = x; } }; new Function('$gameVariables', '$gameActors', js(ruby))(vars, { actor: (id) => ({ gainExp: (e) => { out.exp = [id, e]; } }) }); return out; };
    assert.deepEqual(run('$game_variables[11].each do |a|\n $game_variables[2] = a.name if a.class_id == 2\nend', [{ _classId: 1, name: () => 'Emzi' }, { _classId: 2, name: () => 'Idris' }]), { 2: 'Idris' }, 'a party list');
    assert.deepEqual(run('$game_variables[11].each do |item|\n $game_variables[3] = item.id\nend', [{ id: 7, name: 'Potion' }]), { 3: 7 }, 'a list of items');
});

test('a Script command\'s lines share their locals, and a closing Fiber.yield waits a frame', () => {
    const C = require('../src/legacy/RgssConvert.js');
    const r = C.rubyProgram(['goods = [[0,170,1,1]]', 'SceneManager.call(Scene_Shop)', 'SceneManager.scene.prepare(goods, true, 156)', 'Fiber.yield'], { constants: {}, families: new Set(['pinnacleKingdom']) });
    assert.equal(r.code[r.code.length - 1], 'this.wait(1);');
    assert.ok(r.code.some(l => /prepare\?\.\(goods, true, 156\)/.test(l)));
    const partial = C.rubyProgram(['x = 3', 'not_a_known_call(x)', '$game_variables[2] = x'], { constants: {}, families: new Set() });
    assert.deepEqual(partial.code, ['var x = 3;', '// Ruby (did not carry over): not_a_known_call(x)', '$gameVariables.setValue(2, x);']);
});

test('damage formulas: a Ruby member name is translated, and v[n] = sets the variable', () => {
    const C = require('../src/legacy/RgssConvert.js');
    const db = C.database({ skills: [null, { id: 1, name: 'S', damage: { type: 1, formula: 'a.atk - b.actor_id' } }, { id: 2, name: 'T', damage: { type: 1, formula: 'v[1] = 5; 0' } }, { id: 3, name: 'U', damage: { type: 1, formula: 'a.atk * 4 - b.def * 2' } }] }, {});
    assert.equal(db.skills[1].damage.formula, '(a.atk - b.actorId())');
    assert.equal(db.skills[2].damage.formula, '$gameVariables.setValue(1, 5);\n0');
    assert.equal(db.skills[3].damage.formula, 'a.atk * 4 - b.def * 2', 'plain arithmetic stays as written');
});

test('choice lists a script builds: setup_choices, RGSS cancel numbering, and conditions put together with sprintf', () => {
    const C = require('../src/legacy/RgssConvert.js');
    const r = C.rubyProgram(['params = [["A", "B"], 3]', 'setup_choices(params)', '$game_message.choice_cancel_type = 3', 'Fiber.yield while $game_message.choice?'], { constants: {}, families: new Set() });
    assert.equal(r.code[r.code.length - 1], 'this.setWaitMode("message");');
    let got = null;
    const msg = { _choices: ['A', 'B'] };
    new Function('$gameMessage', r.code.slice(0, -1).join('\n')).call({ setupChoices: (p) => { got = p; } }, msg);
    assert.deepEqual([got[0], got[1], msg._choiceCancelType], [['A', 'B'], -2, -2], 'one past the last choice is a cancel branch');
    const hide = C.rubyProgram(['for i in 0..1', 'text = sprintf("$game_variables[3] <= %d", i)', 'hide_choice(i+1, text)', 'end'], { constants: {}, families: new Set(['himeChoices']) });
    const hidden = [];
    new Function('$gameVariables', hide.code.join('\n')).call({ rrChoiceOption: (type, n, met) => hidden.push([n, met]) }, { value: () => 1 });
    assert.deepEqual(hidden, [[1, false], [2, true]]);
});
