const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_KreadEventUpdate.js'), 'utf8');

test('Kread event update: detected; an event named [update] counts as near the screen anywhere', () => {
    assert.ok(C.scriptFamilies(["class Game_Event < Game_Character\n  alias_method(:krx_alfix_ge_nts?, :near_the_screen?)\nend"]).has('kreadEventUpdate'));
    function Game_Event(name) { this._name = name; }
    Game_Event.prototype.event = function() { return { name: this._name }; };
    Game_Event.prototype.isNearTheScreen = function() { return false; };
    vm.runInNewContext(source, { Game_Event, PluginManager: { parameters: () => ({}) } });
    assert.equal(new Game_Event('tracer(3) [update]').isNearTheScreen(), true);
    assert.equal(new Game_Event('tracer(3)').isNearTheScreen(), false);
});
