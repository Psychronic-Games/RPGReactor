const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_TheoCharacterShadow.js'), 'utf8');

const SCRIPT = "($imported ||= {})[:Theo_CharShadow] = true\nclass Sprite_CharShadow < Sprite\n  def initialize(vport, char)\n    super(vport)\n    self.bitmap = Cache.system('Shadow')\n  end\nend";

function load() {
    function Sprite(bitmap) { this.initialize(bitmap); }
    Sprite.prototype.initialize = function(bitmap) { this.bitmap = bitmap; this.anchor = { x: 0, y: 0 }; this.visible = true; this.opacity = 255; };
    Sprite.prototype.update = function() {};
    class Game_CharacterBase {
        constructor(o) { Object.assign(this, { _characterName: 'Actor1', _transparent: false, _realX: 3, _realY: 4, _opacity: 255 }, o); }
        isObjectCharacter() { return this._characterName.startsWith('!'); }
        screenX() { return Math.floor(this._realX * 32 + 16); }
        opacity() { return this._opacity; }
    }
    class Game_Event extends Game_CharacterBase {}
    class Game_Vehicle extends Game_CharacterBase {}
    class Tilemap { constructor() { this.children = []; } addChild(c) { c.parent = this; this.children.push(c); } removeChild(c) { c.parent = null; this.children.splice(this.children.indexOf(c), 1); } }
    function Spriteset_Map() {}
    Spriteset_Map.prototype.createCharacters = function() { this._characterSprites = this._chars.map(c => ({ _character: c })); };
    Spriteset_Map.prototype.update = function() {};
    Spriteset_Map.prototype.destroy = function() {};
    const ctx = { Sprite, Game_CharacterBase, Game_Event, Game_Vehicle, Spriteset_Map, window: {},
        PluginManager: { parameters: () => ({}) }, ImageManager: { loadSystem: (n) => ({ name: n }) },
        $gameMap: { tileWidth: () => 32, tileHeight: () => 32, adjustY: (y) => y - 1 } };
    vm.runInNewContext(source, ctx);
    return Object.assign(ctx, { Tilemap });
}

test('Theo character shadow: detected, installed without calls', () => {
    assert.ok(C.scriptFamilies([SCRIPT]).has('theoCharShadow'));
    assert.ok(!C.scriptFamilies(['class Sprite_Character\nend']).has('theoCharShadow'));
});

test('a shadow sits on the bottom of the tile, ignores jumps, and follows the character\'s opacity and visibility', () => {
    const ctx = load();
    const player = new ctx.Game_CharacterBase({ jumpHeight: () => 20 });
    const tiled = new ctx.Game_Event({ _characterName: '' });
    const object = new ctx.Game_Event({ _characterName: '!Door' });
    const erased = new ctx.Game_Event({ _erased: true });
    const hidden = new ctx.Game_CharacterBase({ _transparent: true });
    const ship = new ctx.Game_Vehicle({ _characterName: 'Vehicle' });
    const set = new ctx.Spriteset_Map();
    set._tilemap = new ctx.Tilemap();
    set._chars = [player, tiled, object, erased, hidden, ship];
    set.createCharacters();
    const [s] = set._rrCharShadows;
    assert.equal(s.bitmap.name, 'Shadow');
    assert.deepEqual([s.x, s.y, s.z, s.anchor.x, s.anchor.y], [3 * 32 + 16, (4 - 1) * 32 + 32, 2, 0.5, 1]);
    player._realY = 4.5; player._opacity = 128;
    s.update();
    assert.deepEqual([s.y, s.opacity, s.visible], [Math.floor(3.5 * 32 + 32), 128, true]);
    assert.deepEqual(set._rrCharShadows.slice(1).map(x => x.visible), [false, false, false, false, false]);
    // A shadow leaves the tree with its culled character and comes back with it.
    set._characterSprites[0]._rrCulled = true;
    set.update();
    assert.equal(s.parent, null);
    set._characterSprites[0]._rrCulled = false;
    set.update();
    assert.equal(s.parent, set._tilemap);
});
