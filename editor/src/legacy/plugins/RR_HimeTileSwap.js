/*:
 * @target MZ
 * @plugindesc Tile Swap (VX Ace), for imported games
 * @author Hime, Rycochet; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_HimeTileSwap.js
 *
 * Changes the tiles of a map from events, and changes them back. A swap is
 * kept per map (in the save) and applied again whenever the party enters it.
 * Autotiles around a changed tile are re-shaped to join their neighbours.
 *
 * A tile is named by its tileset page and its place on it, counted from 1
 * left to right, top to bottom ("A1", "B12", "E256"; A1–A128 are the
 * autotiles, A129 on the A5 tiles), or by [x, y], the tile at that spot on
 * the current map. Layer 0–2 are the map's three tile layers. The map
 * defaults to the current one.
 *
 *   this.rrTileSwap(old, new, layer, mapId)     every old tile becomes new
 *   this.rrRegionSwap(region, tile, layer, mapId) every tile in the region
 *   this.rrPosSwap(x, y, tile, layer, mapId)    one tile
 *   this.rrTileRevert(tile, layer, mapId)       undo a tile swap
 *   this.rrRegionRevert(region, layer, mapId)   undo a region swap
 *   this.rrPosRevert(x, y, layer, mapId)        undo a position swap
 *   this.rrRevertAll(mapId)                     undo every swap on the map
 *
 * (the importer writes these for the game's tile_swap, region_swap,
 * pos_swap, tile_revert, region_revert, pos_revert and revert_all).
 *
 * Kept from the original: a tile swap and a region swap are stored in lists
 * indexed by tile and region, and undoing one removes its entry from the
 * list, so every swap stored after it moves down one place (a swap of tile
 * 2096 becomes one of 2095). Swaps apply to the map as it stands, so swapping
 * A to B and then B to C leaves C. Mask swaps (Map_Mask) are not ported.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';

    //-------------------------------------------------------------------------
    // Tile ids
    //-------------------------------------------------------------------------
    /** "A1".."A128" autotiles, "A129".. the A5 page, "B1".."E256"; [x, y] reads the current map. */
    const convertTid = (tileID, layer = 0) => {
        if (Array.isArray(tileID)) return $gameMap.tileId(Number(tileID[0]), Number(tileID[1]), layer);
        if (typeof tileID === 'number') return tileID;
        const text = String(tileID);
        const page = text[0].toUpperCase();
        const tid = (parseInt(text.slice(1), 10) || 0) - 1;
        if (page === 'A') return tid < 128 ? tid * 48 + 2048 : tid - 128 + 1536;
        return tid + { B: 0, C: 256, D: 512, E: 768 }[page];
    };
    // An autotile's shape is dropped: every shape of one autotile is the same tile to a swap.
    const baseTid = (tid) => (tid >= 2048 ? tid - ((tid - 2048) % 48) : tid);
    const kind = (tid) => Math.floor((tid - 2048) / 48);

    //-------------------------------------------------------------------------
    // The swaps, per map and layer, in the save
    //-------------------------------------------------------------------------
    const store = () => {
        if (!$gameSystem._rrTileSwap) $gameSystem._rrTileSwap = { tiles: {}, pos: {}, regions: {} };
        return $gameSystem._rrTileSwap;
    };
    const list = (table, mapId, layer) => {
        const byMap = store()[table][mapId] || (store()[table][mapId] = {});
        return byMap[layer] || (byMap[layer] = {});
    };
    const listIfAny = (table, mapId, layer) => {
        const byMap = store()[table][mapId];
        const l = byMap && byMap[layer];
        return l && Object.keys(l).length ? l : null;
    };
    // Array#delete_at: the entry goes, and every later index moves down one.
    const deleteAt = (l, index) => {
        const keys = Object.keys(l).map(Number).sort((a, b) => a - b);
        if (!keys.includes(index) && !keys.some(k => k > index)) return;
        const moved = {};
        for (const k of keys) {
            if (k < index) moved[k] = l[k];
            else if (k > index) moved[k - 1] = l[k];
        }
        for (const k of keys) delete l[k];
        Object.assign(l, moved);
    };

    const Swaps = {
        addTile(mapId, layer, oldTid, newTid) {
            list('tiles', mapId, layer)[convertTid(oldTid, layer)] = convertTid(newTid, layer);
            $gameMap.rrLoadNewMapData();
        },
        addPosition(mapId, x, y, layer, tid) {
            const l = list('pos', mapId, layer);
            (l[y] || (l[y] = {}))[x] = convertTid(tid, layer);
            $gameMap.rrLoadNewMapData();
        },
        addRegion(mapId, rid, layer, tid) {
            list('regions', mapId, layer)[rid] = convertTid(tid, layer);
            $gameMap.rrLoadNewMapData();
        },
        revertTile(mapId, layer, tid) {
            deleteAt(list('tiles', mapId, layer), convertTid(tid, layer));
            $gameMap.rrReloadMap();
        },
        revertPos(mapId, x, y, layer) {
            const row = list('pos', mapId, layer)[y];
            if (row) delete row[x];
            $gameMap.rrReloadMap();
        },
        revertRegion(mapId, layer, rid) {
            deleteAt(list('regions', mapId, layer), Number(rid));
            $gameMap.rrReloadMap();
        },
        revertAll(mapId) {
            for (const table of ['tiles', 'pos', 'regions']) delete store()[table][mapId];
            $gameMap.rrReloadMap();
        }
    };

    //-------------------------------------------------------------------------
    // The map: the file's tiles, the swaps over them, autotiles re-shaped
    //-------------------------------------------------------------------------
    // The map as its file has it, per loaded map, so a revert can start again from it.
    const originals = new WeakMap();
    const original = () => {
        if (!$dataMap || !$dataMap.data) return null;
        if (!originals.has($dataMap)) originals.set($dataMap, $dataMap.data.slice());
        return originals.get($dataMap);
    };
    const refreshTilemap = () => {
        const tilemap = SceneManager._scene && SceneManager._scene._spriteset && SceneManager._scene._spriteset._tilemap;
        if (tilemap && tilemap.refresh) tilemap.refresh();
    };

    const _setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _setup.call(this, mapId);
        original();
        this._rrTileSwapCells = null;
        this.rrLoadNewMapData();
    };
    Game_Map.prototype.rrLoadNewMapData = function() {
        this._rrNeedRefreshTiles = true;
    };
    Game_Map.prototype.rrReloadMap = function() {
        const file = original();
        if (file) for (let i = 0; i < file.length; i++) $dataMap.data[i] = file[i];
        this.rrLoadNewMapData();
    };
    const _update = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        if (this._rrNeedRefreshTiles) this.rrPerformLoadNewMapData();
        _update.call(this, sceneActive);
    };

    // The swapped map is part of the save: a loaded game's map gets back the tiles it had, not a fresh pass.
    const _onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function() {
        const fresh = $dataMap && !originals.has($dataMap);
        const file = original();
        const cells = $gameMap._rrTileSwapCells;
        if (fresh && file && cells && cells.mapId === $gameMap.mapId() && !this._transfer) {
            for (const [i, tid] of Object.entries(cells.data)) $dataMap.data[Number(i)] = tid;
        }
        _onMapLoaded.call(this);
    };

    Game_Map.prototype.rrPerformLoadNewMapData = function() {
        this._rrNeedRefreshTiles = false;
        const data = $dataMap && $dataMap.data;
        if (!data) return;
        const w = this.width(), h = this.height(), mapId = this.mapId();
        const at = (x, y, z) => (z * h + y) * w + x;
        let changed = false;
        for (let z = 0; z < 3; z++) {
            const tiles = listIfAny('tiles', mapId, z), regions = listIfAny('regions', mapId, z), positions = listIfAny('pos', mapId, z);
            if (!tiles && !regions && !positions) continue;
            const updated = new Uint8Array(w * h);
            for (let y = 0; y < h; y++) {
                const row = positions ? positions[y] : null;
                for (let x = 0; x < w; x++) {
                    let tile = row && row[x] !== undefined && row[x] !== null ? row[x] : null;
                    if (tile === null && regions) tile = regions[this.regionId(x, y)] ?? null;
                    const old = baseTid(data[at(x, y, z)]);
                    if (tile === null && tiles) tile = tiles[old] ?? null;
                    if (tile === null || tile === old) continue;
                    data[at(x, y, z)] = tile;
                    updated[y * w + x] = 1;
                    changed = true;
                }
            }
            this.rrReshapeAutotiles(updated, z);
        }
        this.rrRememberSwappedCells();
        if (changed || this._rrTileSwapCells) refreshTilemap();
    };

    /** Every autotile within one tile of a changed one takes the shape its neighbours give it. */
    Game_Map.prototype.rrReshapeAutotiles = function(updated, z) {
        const data = $dataMap.data, w = this.width(), h = this.height();
        const tile = (x, y) => data[(z * h + y) * w + x];
        // The changed tiles and their eight neighbours.
        const grown = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (!updated[y * w + x]) continue;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) grown[ny * w + nx] = 1;
            }
        }
        const edge = (auto, x, y) => auto !== kind(tile(x, y));
        // (The original tests `autotile & 8` first, which Ruby reads as true for every number.)
        const wallEdge = (auto, x, y) => (kind(tile(x, y)) + 8 === auto ? false : edge(auto, x, y));
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (!grown[y * w + x]) continue;
            const auto = kind(tile(x, y));
            if (auto < 0) continue;
            const L = x > 0, T = y > 0, R = x < w - 1, B = y < h - 1;
            let index = 0;
            if ([5, 7, 9, 11, 13, 15].includes(auto)) {
                // waterfall
                if (L && edge(auto, x - 1, y)) index |= 1;
                if (R && edge(auto, x + 1, y)) index |= 2;
            } else if ((auto >= 48 && auto <= 79) || (auto >= 88 && auto <= 95) || (auto >= 104 && auto <= 111) || (auto >= 120 && auto <= 127)) {
                // wall
                if (L && wallEdge(auto, x - 1, y)) index |= 1;
                if (T && edge(auto, x, y - 1)) index |= 2;
                if (R && wallEdge(auto, x + 1, y)) index |= 4;
                if (B && edge(auto, x, y + 1)) index |= 8;
            } else {
                let e = 0;
                if (L && edge(auto, x - 1, y)) e |= 1;
                if (T && edge(auto, x, y - 1)) e |= 2;
                if (R && edge(auto, x + 1, y)) e |= 4;
                if (B && edge(auto, x, y + 1)) e |= 8;
                const tl = () => T && L && edge(auto, x - 1, y - 1), tr = () => T && R && edge(auto, x + 1, y - 1);
                const br = () => B && R && edge(auto, x + 1, y + 1), bl = () => B && L && edge(auto, x - 1, y + 1);
                switch (e) {
                    case 0: index = (tl() ? 1 : 0) | (tr() ? 2 : 0) | (br() ? 4 : 0) | (bl() ? 8 : 0); break;
                    case 1: index = 16 | (tr() ? 1 : 0) | (br() ? 2 : 0); break;
                    case 2: index = 20 | (br() ? 1 : 0) | (bl() ? 2 : 0); break;
                    case 3: index = br() ? 35 : 34; break;
                    case 4: index = 24 | (bl() ? 1 : 0) | (tl() ? 2 : 0); break;
                    case 5: index = 32; break;
                    case 6: index = bl() ? 37 : 36; break;
                    case 7: index = 42; break;
                    case 8: index = 28 | (tl() ? 1 : 0) | (tr() ? 2 : 0); break;
                    case 9: index = tr() ? 41 : 40; break;
                    case 10: index = 33; break;
                    case 11: index = 43; break;
                    case 12: index = tl() ? 39 : 38; break;
                    case 13: index = 44; break;
                    case 14: index = 45; break;
                    case 15: index = 46; break;
                    default: index = 47;
                }
            }
            data[(z * h + y) * w + x] = 2048 + 48 * auto + index;
        }
    };

    // The cells that differ from the file, kept on $gameMap so they travel in the save.
    Game_Map.prototype.rrRememberSwappedCells = function() {
        const file = original(), data = $dataMap.data;
        if (!file) return;
        const cells = {};
        let any = false;
        const n = this.width() * this.height() * 3;
        for (let i = 0; i < n; i++) if (data[i] !== file[i]) { cells[i] = data[i]; any = true; }
        this._rrTileSwapCells = any ? { mapId: this.mapId(), data: cells } : null;
    };

    //-------------------------------------------------------------------------
    // Script calls
    //-------------------------------------------------------------------------
    const here = (mapId) => (mapId === undefined || mapId === null ? $gameMap.mapId() : Number(mapId));
    Object.assign(Game_Interpreter.prototype, {
        rrTileSwap(oldTid, newTid, layer = 0, mapId) { Swaps.addTile(here(mapId), layer, oldTid, newTid); },
        rrPosSwap(x, y, tid, layer = 0, mapId) { Swaps.addPosition(here(mapId), x, y, layer, tid); },
        rrRegionSwap(rid, tid, layer = 0, mapId) { Swaps.addRegion(here(mapId), rid, layer, tid); },
        rrTileRevert(tid, layer = 0, mapId) { Swaps.revertTile(here(mapId), layer, tid); },
        rrPosRevert(x, y, layer = 0, mapId) { Swaps.revertPos(here(mapId), x, y, layer); },
        rrRegionRevert(rid, layer = 0, mapId) { Swaps.revertRegion(here(mapId), layer, rid); },
        rrRevertAll(mapId) { Swaps.revertAll(here(mapId)); }
    });
    window.rrTileSwap = { convertTid, baseTid };
})();
