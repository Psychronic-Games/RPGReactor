const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_SmokePuffs.js'), 'utf8');
const params = require(path.join(legacy, 'plugins', 'RR_SmokePuffs.params.js'));

const SCRIPT = `module DirtTrail
  module CONFIG
    # Max particles alive at once per character
    PUFF_COUNT      = 6
    CHIP_W          = 3
    CHIP_H          = 2
    CHIP_BRIGHTNESS = 200
    START_OPACITY   = 220
    FADE_SPEED      = 14
    SPAWN_INTERVAL  = 4
    KICK_Y          = -1.8
    KICK_X_RANGE    = 1.4
    GRAVITY         = 0.18
    TRAIL_OFFSET    = 4
    FEET_OFFSET     = 2
  end
end
class DirtEmitter
end`;

test('DirtTrail: detected, settings read (floats too), smoke_trail assignments become the event flag', () => {
    const families = C.scriptFamilies([SCRIPT]);
    assert.ok(families.has('dirtTrail'));
    const p = params.extract({ scripts: [SCRIPT], constants: C.scriptConstants([SCRIPT]) });
    assert.deepEqual([p.puffCount, p.kickY, p.kickXRange, p.gravity, p.feetOffset], ['6', '-1.8', '1.4', '0.18', '2']);
    const o = { constants: {}, families };
    assert.equal(C.ruby('$game_map.events[5].smoke_trail = true', 'statement', o), '((c) => c && (c._rrSmokeTrail = true))($gameMap.event(5));');
    assert.equal(C.ruby('@smoke_trail = false', 'statement', Object.assign({ self: 'character' }, o)), 'this._rrSmokeTrail = false;');
});

function load(values) {
    function Bitmap() {} Bitmap.prototype.fillAll = function() {};
    function Sprite(bitmap) { this.bitmap = bitmap; this.anchor = { x: 0, y: 0 }; }
    Sprite.prototype.destroy = function() {};
    function Game_Player() {}
    function Spriteset_Map() { this._tilemap = { children: [], addChild(c) { c.parent = this; this.children.push(c); }, removeChild(c) { c.parent = null; this.children.splice(this.children.indexOf(c), 1); } }; }
    Spriteset_Map.prototype.update = function() {};
    Spriteset_Map.prototype.destroy = function() {};
    let i = 0;
    const ctx = { Bitmap, Sprite, Game_Player, Spriteset_Map, Map, Math: Object.create(Math), PluginManager: { parameters: () => values || {} },
        $gameMap: { tileWidth: () => 32, tileHeight: () => 32, adjustX: (x) => x, adjustY: (y) => y, isDashDisabled: () => false, events: () => [] } };
    ctx.Math.random = () => [0.1, 0.9, 0.5][i++ % 3];
    vm.runInNewContext(source, ctx);
    const player = new Game_Player();
    Object.assign(player, { _realX: 5, _realY: 5, _moveRouteForcing: false, moving: true, dash: true,
        isMoving() { return this.moving; }, isInVehicle: () => false, isDashButtonPressed() { return this.dash; }, isObjectCharacter: () => false,
        jumpHeight: () => 0, direction: () => 2, followers: () => ({ _data: [] }) });
    ctx.$gamePlayer = player;
    return { ctx, player, set: new Spriteset_Map() };
}

test('chips spawn behind a dashing player every few frames, fall in whole pixels and fade out', () => {
    const { player, set } = load();
    set.update();
    const chips = set._tilemap.children;
    assert.ok(chips.length >= 1);
    const c = chips[0];
    // Facing down: 4 px above the feet (5*32+32-4+2-4 = 186), ±2 / ±1 scatter.
    assert.ok(Math.abs(c.x - (5 * 32 + 16)) <= 2 && Math.abs(c.y - 186) <= 1);
    assert.deepEqual([c.opacity, c.blendMode, c.z], [220, 1, 3]);
    set.update();
    assert.ok(Number.isInteger(c.x) && Number.isInteger(c.y));
    assert.equal(c.opacity, 206);
    player.dash = false;
    for (let i = 0; i < 20; i++) set.update();
    assert.equal(set._tilemap.children.length, 0);
    // The cap: never more than PUFF_COUNT chips per character.
    player.dash = true;
    const { set: capped } = load({ puffCount: '2', fadeSpeed: '1' });
    for (let i = 0; i < 40; i++) capped.update();
    assert.ok(capped._tilemap.children.length <= 2);
});

test('a flagged event throws chips whenever it moves, dash or not', () => {
    const { ctx, player, set } = load();
    player.moving = false;
    const event = { _realX: 2, _realY: 2, _rrSmokeTrail: true, isMoving: () => true, isObjectCharacter: () => false, jumpHeight: () => 0, direction: () => 6 };
    ctx.$gameMap.events = () => [event];
    player.dash = false;
    set.update();
    assert.ok(set._tilemap.children.length >= 1);
    event._rrSmokeTrail = false;
    set.update();
    assert.equal(set._tilemap.children.length, 0);
});
