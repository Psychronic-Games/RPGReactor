const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_TheoScreenShake.js'), 'utf8');

const SCRIPT = "class Game_Interpreter\n  def shake_screen(duration, power)\n    $game_temp.shake_maxdur = duration\n  end\nend\nclass Spriteset_Map\n  alias theo_vlambeer_update_vport update_viewports\nend";

test('Theo screen shake: detected, shake_screen becomes the plugin call', () => {
    const families = C.scriptFamilies([SCRIPT]);
    assert.ok(families.has('theoScreenShake'));
    assert.equal(C.ruby('shake_screen(45, 10)', 'statement', { constants: {}, families }), 'this.rrShakeScreen?.(45, 10);');
});

test('the map layer jumps within the power, shrinking to nothing over the duration, and cancels the stock shake meanwhile', () => {
    function Game_Interpreter() {}
    function Spriteset_Map() { this._baseSprite = { x: 0, y: 0 }; this.scale = { x: 1 }; }
    Spriteset_Map.prototype.update = function() {};
    const ctx = { Game_Interpreter, Spriteset_Map, Math: Object.create(Math), $gameTemp: {}, $gameScreen: { shake: () => 3 } };
    let r = 0;
    const seq = [0.99, 0.2, 0.99, 0.7];   // rand(power) near the top, then the signs
    ctx.Math.random = () => seq[r++ % seq.length];
    vm.runInNewContext(source, ctx);
    new Game_Interpreter().rrShakeScreen(10, 10);
    const set = new Spriteset_Map();
    const xs = [], ys = [];
    for (let i = 0; i < 10; i++) { set.update(); xs.push(set._baseSprite.x); ys.push(set._baseSprite.y); }
    // Frame 1: rate 9/10, rand(10) = 9 → 8.1 truncated to 8, negative sign; the stock 3 px is taken back out.
    assert.equal(xs[0], -(-8) - 3);
    assert.equal(ys[0], -8);
    assert.equal(xs[9], -3);   // rate 0 on the last frame
    assert.ok(ys.every(y => Math.abs(y) <= 10));
    set.update();
    assert.deepEqual([set._baseSprite.x, set._baseSprite.y], [0, 0]);
});
