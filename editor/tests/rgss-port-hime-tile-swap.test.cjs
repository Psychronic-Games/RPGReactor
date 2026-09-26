'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_HimeTileSwap.js'), 'utf8');

const SCRIPT = `$imported = {} if $imported.nil?
$imported["TH_TileSwap"] = true
class Game_Interpreter
  def tile_swap(old_tid, new_tid, layer=0, map_id=$game_map.map_id)
  end
end`;

test('Hime Tile Swap: detected, and the swap and revert calls translate', () => {
    assert.ok(C.scriptFamilies([SCRIPT]).has('himeTileSwap'));
    assert.ok(!C.scriptFamilies(['def tile_swap(a, b)\nend']).has('himeTileSwap'));
    const ctx = { constants: {}, families: new Set(['himeTileSwap']) };
    assert.equal(C.ruby('tile_swap("A2", "B5")', 'statement', ctx), 'this.rrTileSwap?.("A2", "B5");');
    assert.equal(C.ruby('tile_swap([3, 4], "B5", 1)', 'statement', ctx), 'this.rrTileSwap?.([3, 4], "B5", 1);');
    assert.equal(C.ruby('pos_swap(5, 6, "C12", 2, 7)', 'statement', ctx), 'this.rrPosSwap?.(5, 6, "C12", 2, 7);');
    assert.equal(C.ruby('region_swap(3, "A5")', 'statement', ctx), 'this.rrRegionSwap?.(3, "A5");');
    assert.equal(C.ruby('pos_revert($game_variables[3], $game_variables[4])', 'statement', ctx), 'this.rrPosRevert?.($gameVariables.value(3), $gameVariables.value(4));');
    assert.equal(C.ruby('tile_revert("A2")', 'statement', ctx), 'this.rrTileRevert?.("A2");');
    assert.equal(C.ruby('region_revert 3', 'statement', ctx), 'this.rrRegionRevert?.(3);');
    assert.equal(C.ruby('revert_all', 'statement', ctx), 'this.rrRevertAll?.();');
});

/** A w×h map (6 layers, MZ layout) of `fill` on layer 0, with the plugin loaded over small stubs. */
function load(w = 5, h = 5, fill = 1536) {
    const data = new Array(w * h * 6).fill(0);
    for (let i = 0; i < w * h; i++) data[i] = fill;
    let refreshed = 0;
    function Game_Map() {}
    Game_Map.prototype.setup = function(id) { this._mapId = id; };
    Game_Map.prototype.update = function() {};
    Game_Map.prototype.mapId = function() { return this._mapId; };
    Game_Map.prototype.width = () => w;
    Game_Map.prototype.height = () => h;
    Game_Map.prototype.tileId = (x, y, z) => ctx.$dataMap.data[(z * h + y) * w + x];
    Game_Map.prototype.regionId = (x, y) => ctx.$dataMap.data[(5 * h + y) * w + x];
    function Scene_Map() {}
    Scene_Map.prototype.onMapLoaded = function() {};
    function Game_Interpreter() {}
    const ctx = {
        Game_Map, Scene_Map, Game_Interpreter, window: {},
        $dataMap: { data },
        $gameSystem: {},
        SceneManager: { _scene: { _spriteset: { _tilemap: { refresh: () => refreshed++ } } } }
    };
    vm.runInNewContext(source, ctx);
    ctx.$gameMap = new Game_Map();
    ctx.$gameMap.setup(1);
    ctx.$gameMap.update();
    const at = (x, y, z = 0) => ctx.$dataMap.data[(z * h + y) * w + x];
    return { ctx, at, i: new Game_Interpreter(), refreshed: () => refreshed, update: () => ctx.$gameMap.update() };
}

test('Hime Tile Swap: tile ids by page and place', () => {
    const { ctx } = load();
    const t = ctx.window.rrTileSwap.convertTid;
    assert.equal(t('A1'), 2048);
    assert.equal(t('a2'), 2096);
    assert.equal(t('A128'), 2048 + 127 * 48);
    assert.equal(t('A129'), 1536);
    assert.equal(t('B1'), 0);
    assert.equal(t('C1'), 256);
    assert.equal(t('D12'), 523);
    assert.equal(t('E256'), 1023);
    assert.equal(t([2, 3]), 1536, 'a spot on the map gives its tile');
});

test('Hime Tile Swap: a position swap applies on the next update and re-shapes the autotiles around it', () => {
    const { at, i, update, refreshed } = load();
    i.rrPosSwap(2, 2, 'A1');
    assert.equal(at(2, 2), 1536, 'not before the map updates');
    update();
    // A lone autotile surrounded by other tiles: every edge open (46).
    assert.equal(at(2, 2), 2048 + 46);
    assert.ok(refreshed() >= 1);
    i.rrPosSwap(3, 2, 'A1');
    update();
    // Two side by side: the left one open on left, top and bottom (43), the right on top, right and bottom (45).
    assert.deepEqual([at(2, 2), at(3, 2)], [2048 + 43, 2048 + 45]);
    i.rrPosRevert(3, 2);
    update();
    assert.deepEqual([at(2, 2), at(3, 2)], [2048 + 46, 1536]);
});

test('Hime Tile Swap: tile and region swaps, and the reverts shifting later entries down (Array#delete_at)', () => {
    const { ctx, at, i, update } = load();
    ctx.$dataMap.data[5 * 25 + 0] = 7;   // region 7 at (0, 0)
    i.rrRegionSwap(7, 'B3');
    update();
    assert.equal(at(0, 0), 2);
    assert.equal(at(1, 0), 1536);
    i.rrTileSwap('A129', 'B4');
    update();
    assert.equal(at(1, 0), 3, 'every A5 first tile becomes B4');
    assert.equal(at(0, 0), 2, 'the region swap was applied first and keeps its tile');
    // Reverting a tile that was never swapped still removes its slot: the 1536 entry moves to 1535.
    i.rrTileRevert('B1');
    update();
    assert.equal(at(1, 0), 1536);
    assert.deepEqual(Object.keys(ctx.$gameSystem._rrTileSwap.tiles[1][0]), ['1535']);
    i.rrRevertAll();
    update();
    assert.equal(at(0, 0), 1536);
});

test('Hime Tile Swap: swaps apply to the map as it stands (A to B, then B to C leaves C)', () => {
    const { at, i, update } = load();
    i.rrTileSwap('A129', 'B2');
    update();
    i.rrTileSwap('B2', 'B3');
    update();
    assert.equal(at(0, 0), 2);
});

test('Hime Tile Swap: a freshly loaded copy of the map gets its swapped tiles back', () => {
    const { ctx, at, i, update } = load();
    i.rrPosSwap(1, 1, 'B9');
    update();
    const cells = JSON.parse(JSON.stringify(ctx.$gameMap._rrTileSwapCells));
    assert.deepEqual(cells, { mapId: 1, data: { 6: 8 } });
    ctx.$dataMap = { data: new Array(150).fill(0).map((_, n) => (n < 25 ? 1536 : 0)) };
    new ctx.Scene_Map().onMapLoaded();
    assert.equal(at(1, 1), 8);
});
