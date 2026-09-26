/*:
 * @target MZ
 * @plugindesc CP Terrain Tags (VX Ace), for imported games
 * @author Neon Black; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_NeonTerrainTags.js
 *
 * Regions that change the tiles under them:
 *  - Block: nothing passes the cell, in any direction.
 *  - Cover: the cell's ground tile is drawn above characters and the cell
 *    can be walked through. The tile is raised to the upper layer, which
 *    wipes what that layer had there.
 * As in the original, raising a cover tile marks that tile "above
 * characters" in the tileset for the rest of the session, wherever it is
 * used: the maps entered first keep its old passage on their other cells,
 * a map entered after it (or a loaded game) takes the changed one.
 * Followers turn to the way the one ahead faces before they follow it.
 *
 * The script's slopes and bridges are not ported: no map of the game uses
 * their regions.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param cover
 * @text Cover region
 * @type number
 * @default 18
 *
 * @param block
 * @text Block region
 * @type number
 * @default 19
 *
 * @param bridge
 * @text Bridge region
 * @type number
 * @default 20
 *
 * @param upper
 * @text Bridge upper entrance region
 * @type number
 * @default 23
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_NeonTerrainTags');
    const num = (s, d) => (s === undefined || s === '' ? d : Number(s));
    const COVER = num(params.cover, 18), BLOCK = num(params.block, 19);
    const BRIDGE = num(params.bridge, 20), UPPER = num(params.upper, 23);

    // Every time the map's data is read (a transfer, and coming back from the menu or a battle, which the
    // original never re-read), a cover cell's ground tile moves up to the upper layer. The tiles the
    // original remembers passage for are kept with the data, in its order (x across, then y down).
    const raiseCover = (map) => {
        const w = map.width, h = map.height, d = map.data;
        const at = (x, y, z) => (z * h + y) * w + x;
        const tiles = [];
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                const region = d[at(x, y, 5)] || 0;
                if (region === BRIDGE || region === UPPER) tiles.push([d[at(x, y, 0)] || 0, false]);
                if (region !== COVER) continue;
                tiles.push([d[at(x, y, 0)] || 0, true]);
                d[at(x, y, 2)] = d[at(x, y, 0)] || 0;
                d[at(x, y, 0)] = 0;
            }
        }
        map._rrTerrainTiles = tiles;
    };
    const _onLoad = DataManager.onLoad;
    DataManager.onLoad = function(object) {
        _onLoad.call(this, object);
        if (object && object === window.$dataMap && Array.isArray(object.data) && object.width > 0) raiseCover(object);
    };

    // The tileset's flags are the session's own (the original changed them in place): a raised tile is
    // "above characters" everywhere, and a tile's flag is remembered the first time the map setup sees it.
    Game_Map.prototype.rrTerrainApply = function() {
        this._rrTileFlags = {};
        const flags = this.tilesetFlags();
        for (const [id, cover] of this._rrTerrainTiles || []) {
            if (!Object.prototype.hasOwnProperty.call(this._rrTileFlags, id)) this._rrTileFlags[id] = flags[id] || 0;
            if (cover) flags[id] = 0x10;
        }
    };
    const _setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _setup.call(this, mapId);
        this._rrTerrainTiles = (($dataMap && $dataMap._rrTerrainTiles) || []).map(t => t.slice());
        this.rrTerrainApply();
    };
    // A loaded game sets its map up again from the flags as they are now.
    const _extract = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _extract.call(this, contents);
        if ($gameMap && $gameMap.rrTerrainApply) $gameMap.rrTerrainApply();
    };

    const own = Object.prototype.hasOwnProperty;
    const _checkPassage = Game_Map.prototype.checkPassage;
    Game_Map.prototype.checkPassage = function(x, y, bit) {
        const region = this.regionId(x, y);
        if (region === BLOCK) return false;
        const remembered = this._rrTileFlags || {};
        if (region !== COVER && Object.keys(remembered).length === 0) return _checkPassage.call(this, x, y, bit);
        const flags = this.tilesetFlags();
        const tiles = this.tileEventsXy(x, y).map(event => event.tileId());
        // RGSS maps have three tile layers; MZ's fourth is empty in an import.
        if (this.tileId(x, y, 3)) tiles.push(this.tileId(x, y, 3));
        tiles.push(this.tileId(x, y, 2), this.tileId(x, y, 1), this.tileId(x, y, 0));
        for (const tile of tiles) {
            let flag;
            if (region === COVER && tile === 0) flag = 0x600;
            else if (region !== COVER && own.call(remembered, tile)) flag = remembered[tile];
            else flag = flags[tile] || 0;
            if (flag & 0x10) continue;
            if ((flag & bit) === 0) return true;
            if ((flag & bit) === bit) return false;
        }
        return false;
    };

    const _chase = Game_Follower.prototype.chaseCharacter;
    Game_Follower.prototype.chaseCharacter = function(character) {
        if (!this.isMoving()) this.setDirection(character.direction());
        _chase.call(this, character);
    };
})();
