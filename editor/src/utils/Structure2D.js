/**
 * Structure2D - a 2D structure (docs/DESIGN-2D-STRUCTURES.md): its record's fields, the passability each cell
 * ends with, and its placement on a 2D map. Pure: no DOM, no files; the workshop (Structure2DWorkshop.js) builds and
 * bakes, the Database page (DatabaseStructure2DPage.js) shows it, and these rules hold for both and for the tests.
 *
 *   plan.dimension  "2d"
 *   plan.size       [width, height] in tiles
 *   plan.layers     bottom first: { kind: "tiles", name, tilesetId, tiles, hidden } (tiles: width × height × 6, as a
 *                   map's data) or { kind: "picture", name, picture, at: [px, py], opacity, hidden } (img/pictures)
 *   plan.passage    { "x,y": "X" | "O" | "*" }: blocked, open, or open with the cell's art over the characters
 *   plan.surfaces   media surfaces on the plot, as a 2D map holds them
 *   plan.baked      what the last save drew: { below, over, cells: { "x,y": 1 | 2 } } (picture names in
 *                   img/parallaxes, without extension; 1 open, 2 blocked)
 */
(function(root) {
    'use strict';

    const DIMENSION = '2d';
    const MARKS = ['X', 'O', '*'];
    // Baked at 48 px a tile into two pictures: 64 tiles is 3072 px a side (about 38 MB a picture while it is drawn).
    const SIZE_MIN = 1, SIZE_MAX = 64;
    const PICTURE_FOLDER = 'structures';
    const TILE = 48;
    const LAYER_KINDS = ['tiles', 'picture'];

    const int = (value, fallback, min, max) => {
        const n = Math.floor(Number(value));
        return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    };
    const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const key = (x, y) => `${x},${y}`;
    const cellOf = text => { const m = /^(\d+),(\d+)$/.exec(String(text)); return m ? [Number(m[1]), Number(m[2])] : null; };

    function is2D(plan) { return !!plan && plan.dimension === DIMENSION; }

    /** A tile layer of the plot's size, everything empty. */
    function emptyTiles(width, height) { return new Array(width * height * 6).fill(0); }

    /** A layer as the editor can use it; null for one that is not a layer. */
    function normalizeLayer(raw, width, height, index) {
        if (!plain(raw) || !LAYER_KINDS.includes(raw.kind)) return null;
        const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 48) : `Layer ${index + 1}`;
        const out = { kind: raw.kind, name };
        if (raw.hidden === true) out.hidden = true;
        if (raw.kind === 'tiles') {
            out.tilesetId = int(raw.tilesetId, 1, 1, 9999);
            const length = width * height * 6, given = Array.isArray(raw.tiles) ? raw.tiles : [];
            out.tiles = new Array(length);
            for (let i = 0; i < length; i++) out.tiles[i] = int(given[i], 0, 0, 0xffff);
        } else {
            out.picture = typeof raw.picture === 'string' ? raw.picture.replace(/\.(png|webp|jpe?g)$/i, '') : '';
            const at = Array.isArray(raw.at) ? raw.at : [];
            out.at = [int(at[0], 0, -100000, 100000), int(at[1], 0, -100000, 100000)];
            out.opacity = int(raw.opacity, 255, 0, 255);
        }
        return out;
    }

    /** A 2D plan's own fields made what the editor expects (in place); the plan's other fields are left alone. */
    function normalize(plan) {
        if (!plain(plan)) return plan;
        plan.dimension = DIMENSION;
        const size = Array.isArray(plan.size) ? plan.size : [];
        plan.size = [int(size[0], 12, SIZE_MIN, SIZE_MAX), int(size[1], 10, SIZE_MIN, SIZE_MAX)];
        const [W, H] = plan.size;
        plan.layers = (Array.isArray(plan.layers) ? plan.layers : []).map((layer, i) => normalizeLayer(layer, W, H, i)).filter(Boolean);
        const passage = {};
        for (const [cell, mark] of Object.entries(plain(plan.passage) ? plan.passage : {})) {
            const at = cellOf(cell);
            if (at && at[0] < W && at[1] < H && MARKS.includes(mark)) passage[key(at[0], at[1])] = mark;
        }
        plan.passage = passage;
        plan.surfaces = (Array.isArray(plan.surfaces) ? plan.surfaces : []).filter(plain).map(row => Object.assign({}, row));
        const baked = plain(plan.baked) ? plan.baked : null;
        if (baked) {
            const cells = {};
            for (const [cell, value] of Object.entries(plain(baked.cells) ? baked.cells : {})) {
                const at = cellOf(cell);
                if (at && (value === 1 || value === 2)) cells[key(at[0], at[1])] = value;
            }
            const name = value => (typeof value === 'string' && /^[\w .()-]+(\/[\w .()-]+)*$/.test(value) && !value.includes('..') ? value : '');
            plan.baked = { below: name(baked.below), over: name(baked.over), cells };
        } else delete plan.baked;
        return plan;
    }

    /** The file's 2D fields (`fields` is what DatabaseStructureEditor.trimPlan writes). */
    function trim(plan, fields) {
        fields.dimension = DIMENSION;
        fields.layers = plan.layers.map(layer => {
            const out = { kind: layer.kind, name: layer.name };
            if (layer.hidden) out.hidden = true;
            if (layer.kind === 'tiles') { out.tilesetId = layer.tilesetId; out.tiles = layer.tiles.slice(); }
            else { out.picture = layer.picture; out.at = layer.at.slice(); if (layer.opacity !== 255) out.opacity = layer.opacity; }
            return out;
        });
        if (Object.keys(plan.passage).length) fields.passage = Object.assign({}, plan.passage);
        if (plan.surfaces.length) fields.surfaces = plan.surfaces.map(row => Object.assign({}, row));
        if (plan.baked) fields.baked = { below: plan.baked.below, over: plan.baked.over, cells: Object.assign({}, plan.baked.cells) };
        return fields;
    }

    /** A new 2D plan: one tile layer of the tileset given, nothing on it. */
    function newPlan(name, width, height, tilesetId) {
        const W = int(width, 12, SIZE_MIN, SIZE_MAX), H = int(height, 10, SIZE_MIN, SIZE_MAX);
        return normalize({ name, size: [W, H], layers: [{ kind: 'tiles', name: 'Tiles', tilesetId: int(tilesetId, 1, 1, 9999), tiles: emptyTiles(W, H) }] });
    }

    /** The plot made `width` × `height`: tiles kept from the top-left corner, marks outside it dropped. */
    function resize(plan, width, height) {
        const W = int(width, plan.size[0], SIZE_MIN, SIZE_MAX), H = int(height, plan.size[1], SIZE_MIN, SIZE_MAX);
        const [oldW, oldH] = plan.size;
        if (W === oldW && H === oldH) return false;
        for (const layer of plan.layers) {
            if (layer.kind !== 'tiles') continue;
            const next = emptyTiles(W, H);
            for (let z = 0; z < 6; z++) for (let y = 0; y < Math.min(H, oldH); y++) for (let x = 0; x < Math.min(W, oldW); x++) {
                next[z * W * H + y * W + x] = layer.tiles[z * oldW * oldH + y * oldW + x];
            }
            layer.tiles = next;
        }
        for (const cell of Object.keys(plan.passage)) { const at = cellOf(cell); if (!at || at[0] >= W || at[1] >= H) delete plan.passage[cell]; }
        plan.size = [W, H];
        return true;
    }

    /**
     * How one cell of a tile layer stands, by its own tileset's flags: 1 open, 2 blocked, 0 nothing to say (no tile,
     * or only ☆ tiles). As Game_Map.checkPassage reads them: top tile first, a ☆ tile says nothing, the first other
     * tile decides; a tile that blocks every direction blocks, one that lets any through is open.
     */
    function tileCell(layer, W, H, x, y, flags) {
        for (let z = 3; z >= 0; z--) {
            const tileId = layer.tiles[z * W * H + y * W + x];
            if (!tileId) continue;
            const flag = (flags && flags[tileId]) || 0;
            if (flag & 0x10) continue;
            return (flag & 0x0f) === 0x0f ? 2 : 1;
        }
        return 0;
    }

    /** Whether a cell of a tile layer has anything drawn on it (any of the four tile layers, or a shadow). */
    function tileDrawn(layer, W, H, x, y) {
        for (let z = 0; z < 5; z++) if (layer.tiles[z * W * H + y * W + x]) return true;
        return false;
    }

    /**
     * Every cell's passability as a placement copies it ({ "x,y": 1 | 2 }): its mark (X blocked; O and * open), else
     * its tiles (the top tile layer with a tile that decides), else nothing (the map's own stays). `flagsOf(tilesetId)`
     * gives a tileset's flags. A hidden layer counts: hidden is for painting, not for the game.
     */
    function cells(plan, flagsOf) {
        const [W, H] = plan.size, out = {};
        const tileLayers = plan.layers.filter(layer => layer.kind === 'tiles').reverse();
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const mark = plan.passage[key(x, y)];
            if (mark) { out[key(x, y)] = mark === 'X' ? 2 : 1; continue; }
            for (const layer of tileLayers) {
                const value = tileCell(layer, W, H, x, y, flagsOf ? flagsOf(layer.tilesetId) : null);
                if (value) { out[key(x, y)] = value; break; }
            }
        }
        return out;
    }

    /** The picture names a bake writes, for the structure's file name and a hash of what each shows. */
    function pictureNames(file, belowHash, overHash) {
        const stem = String(file || 'Structure').replace(/\.json$/i, '').replace(/[^\w .()-]+/g, '-').slice(0, 40) || 'Structure';
        return { below: belowHash ? `${PICTURE_FOLDER}/${stem}-${belowHash}-below` : '', over: overHash ? `${PICTURE_FOLDER}/${stem}-${overHash}-over` : '' };
    }

    /**
     * A 2D structure placed on a map is an object of the map's own: `mapData.rrStructures2D = [{ id, file, at: [x, y] }]`
     * (`file`: the structure's file under 3d/Structures; `at`: its top-left tile). What the game reads is made from
     * that list and the structures as they are now (`apply`): so a structure changed in the Database (its art, its
     * passability) is changed on every map it stands on, the next time the editor applies them.
     */
    function add(mapData, file, x, y) {
        const list = Array.isArray(mapData.rrStructures2D) ? mapData.rrStructures2D : (mapData.rrStructures2D = []);
        const id = list.reduce((most, row) => Math.max(most, Number(row && row.id) || 0), 0) + 1;
        const row = { id, file: String(file || ''), at: [Math.floor(Number(x)) || 0, Math.floor(Number(y)) || 0] };
        list.push(row);
        return row;
    }

    /** The placed structure with this id taken off the map's list; answers whether there was one. */
    function remove(mapData, id) {
        const list = Array.isArray(mapData.rrStructures2D) ? mapData.rrStructures2D : [];
        const at = list.findIndex(row => row && row.id === id);
        if (at < 0) return false;
        list.splice(at, 1);
        if (!list.length) delete mapData.rrStructures2D;
        return true;
    }

    /** The placed structure whose footprint covers tile x, y (the last placed, on top), given each one's plan. */
    function at(mapData, x, y, planOf) {
        const list = Array.isArray(mapData.rrStructures2D) ? mapData.rrStructures2D : [];
        for (let i = list.length - 1; i >= 0; i--) {
            const row = list[i], plan = row && planOf(row.file);
            if (!plan || !is2D(plan)) continue;
            if (x >= row.at[0] && y >= row.at[1] && x < row.at[0] + plan.size[0] && y < row.at[1] + plan.size[1]) return row;
        }
        return null;
    }

    /**
     * What the game reads, made again from the map's placed structures (in place on `mapData`): each one's two
     * pictures as image layers lying on the map at its tile (tagged `structure2d: id`), its cells in rrPassage, its media
     * surfaces moved there (tagged the same). What an earlier apply made is replaced; everything else on the map (its
     * own image layers and surfaces) is left as it is. A structure that is gone, or not saved with pictures yet, adds
     * nothing. Answers whether anything the game reads changed.
     */
    function apply(mapData, planOf) {
        if (!mapData) return false;
        const before = JSON.stringify([mapData.rrImageLayers || null, mapData.rrPassage || null, (mapData.reactor3d && mapData.reactor3d.mediaSurfaces) || null]);
        const list = (Array.isArray(mapData.rrStructures2D) ? mapData.rrStructures2D : []).filter(row => row && row.file && Array.isArray(row.at));
        const own = row => !(row && row.structure2d);
        const layers = (Array.isArray(mapData.rrImageLayers) ? mapData.rrImageLayers : []).filter(own);
        const sidecar = mapData.reactor3d;
        const surfaces = (sidecar && Array.isArray(sidecar.mediaSurfaces) ? sidecar.mediaSurfaces : []).filter(own);
        const passage = {};
        const W = Number(mapData.width) || 0, H = Number(mapData.height) || 0;
        let nextSurface = surfaces.reduce((most, row) => Math.max(most, Number(row && row.id) || 0), 0) + 1;
        const below = [], over = [];
        for (const row of list) {
            const plan = planOf(row.file);
            if (!plan || !is2D(plan) || !plan.baked) continue;
            const [X, Y] = row.at;
            if (plan.baked.below) below.push({ name: plan.baked.below, layer: 'ground', fit: 'place', at: [X, Y], structure2d: row.id });
            if (plan.baked.over) over.push({ name: plan.baked.over, layer: 'over', fit: 'place', at: [X, Y], structure2d: row.id });
            for (const [cell, value] of Object.entries(plan.baked.cells || {})) {
                const c = cellOf(cell);
                if (!c) continue;
                const mx = c[0] + X, my = c[1] + Y;
                if (mx >= 0 && my >= 0 && mx < W && my < H) passage[key(mx, my)] = value;
            }
            for (const surface of plan.surfaces || []) {
                const copy = JSON.parse(JSON.stringify(surface));
                copy.id = nextSurface++;
                if (Number.isFinite(Number(copy.x))) copy.x = Number(copy.x) + X * TILE;
                if (Number.isFinite(Number(copy.y))) copy.y = Number(copy.y) + Y * TILE;
                copy.structure2d = row.id;
                surfaces.push(copy);
            }
        }
        // A later structure lies over an earlier one; the map's own layers keep their places, the structures' come after.
        const allLayers = layers.concat(below, over);
        if (allLayers.length) mapData.rrImageLayers = allLayers; else delete mapData.rrImageLayers;
        if (Object.keys(passage).length) mapData.rrPassage = passage; else delete mapData.rrPassage;
        if (surfaces.length) { (mapData.reactor3d || (mapData.reactor3d = { version: 1 })).mediaSurfaces = surfaces; }
        else if (sidecar && sidecar.mediaSurfaces) delete sidecar.mediaSurfaces;
        return JSON.stringify([mapData.rrImageLayers || null, mapData.rrPassage || null, (mapData.reactor3d && mapData.reactor3d.mediaSurfaces) || null]) !== before;
    }

    const api = { DIMENSION, MARKS, SIZE_MIN, SIZE_MAX, PICTURE_FOLDER, is2D, emptyTiles, normalize, trim, newPlan, resize, tileCell, tileDrawn, cells, pictureNames, add, remove, at, apply, key, cellOf };
    root.RRStructure2D = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
