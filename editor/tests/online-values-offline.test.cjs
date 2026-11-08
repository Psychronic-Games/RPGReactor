// A variable write reads the value back only when a shared world or party takes it: plugins replace
// Game_Variables.value (YEP, Olivia), and a read on every write crashed three bundled games at New Game, offline.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const runtime = path.resolve(__dirname, '..', '..', 'runtime');

function load({ worldActive = false, worldShares = false, partyTakes = false } = {}) {
    const noted = [];
    let reads = 0;
    function Game_Variables() { this._data = []; }
    Game_Variables.prototype.setValue = function(id, value) { this._data[id] = value; };
    Game_Variables.prototype.value = function(id) { reads++; return this._data[id] || 0; };
    const scope = {
        Game_Variables,
        ReactorWorldState: { active: worldActive, variables: new Set(worldShares ? [5] : []), operation: undefined, note: (...args) => noted.push(['world', ...args]) },
        ReactorOnlineParty: { takesValue: () => partyTakes, noteValue: (...args) => noted.push(['party', ...args]) }
    };
    vm.createContext(scope);
    const source = fs.readFileSync(path.join(runtime, 'reactor_online_ui.js'), 'utf8');
    const start = source.indexOf('const _reactorWorldVariable'), end = source.indexOf("// Control Variables' Add and Subtract");
    assert.ok(start > 0 && end > start, 'the wrapper is found');
    vm.runInContext(source.slice(start, end), scope);
    return { variables: new Game_Variables(), noted, reads: () => reads };
}

test('offline, a variable write never reads the value back', () => {
    const { variables, noted, reads } = load();
    variables.setValue(5, 7);
    assert.equal(variables._data[5], 7);
    assert.equal(reads(), 0, 'a plugin\'s value() is not run by the write');
    assert.equal(noted.length, 0);
});

test('a shared world or party variable is read once and noted', () => {
    const { variables, noted, reads } = load({ worldActive: true, worldShares: true, partyTakes: true });
    variables.setValue(5, 7);
    assert.equal(reads(), 1);
    assert.deepEqual(noted.map(entry => [entry[0], entry[1], entry[2], entry[3]]), [['world', 'v', 5, 7], ['party', 'v', 5, 7]]);
});
