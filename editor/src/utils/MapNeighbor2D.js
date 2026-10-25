/**
 * MapNeighbor2D - the maps past a map's border, drawn dimmed past its edges in the 2D map view.
 *
 * A map names the map past a side in its `surround.neighbors` (RRMapEdges). In the game a 2D
 * map's view goes half a screen past a side with a neighbor and that neighbor's tiles are drawn
 * there, not its events (Game_Map.reactorEdgeReach, Spriteset_Map.updateNeighborTilemaps). The
 * 2D map view does the same, dimmed: it pans as far past the edge as the game's screen does, and
 * shows the neighbor's tiles as its file was last saved.
 *
 * It is a picture only: nothing in it takes input (the map's own hit surface ends at its edge),
 * and nothing here writes a file. A strip is drawn in chunks as they come into view, at the
 * detail the zoom shows, once each; it is drawn again when the neighbor's file is written, its
 * shift changes or the map names another. The map bar's Surroundings tick hides it and the
 * reach past the edge with it.
 */
(function(root) {
    'use strict';

    const SIDES = ['north', 'east', 'south', 'west'];
    const R = () => root.Reactor3D;
    const frame = fn => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 0));
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const api = {
        SIDES,
        /** Tiles a side of a chunk. */
        CHUNK: 16,
        /** The neighbor's tiles are multiplied by this: plainly another map. */
        DIM: 0x7a7a7a,
        /** Milliseconds of chunk drawing a frame. */
        BUDGET_MS: 6,
        /** Chunks kept out of view before the farthest go. */
        KEEP: 48,

        //---------------------------------------------------------------------
        // The rules (the runtime's when it is loaded: a 2D session has no 3D runtime)

        /** The maps past a map's border, by side: `{ map }` or `{ map, shift }`. */
        neighborsOf(mapData) {
            const E = R();
            if (E?.neighborsOf) return E.neighborsOf(mapData);
            const raw = mapData && mapData.reactor3d && mapData.reactor3d.surround && mapData.reactor3d.surround.neighbors;
            const out = {};
            if (!raw || typeof raw !== 'object') return out;
            for (const side of SIDES) {
                const entry = raw[side], said = entry && typeof entry === 'object';
                const value = said ? entry.map : entry;
                const map = Math.round(value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? 0 : Number(value));
                if (!(map > 0)) continue;
                const rawShift = said ? Number(entry.shift) : 0;
                const shift = Math.round(Math.max(-9999, Math.min(9999, Number.isFinite(rawShift) ? rawShift : 0)));
                out[side] = shift ? { map, shift } : { map };
            }
            return out;
        },

        /** Where a neighbor `width` x `height` tiles has its first tile, in this map's tiles. */
        offsetOf(mapData, side, entry, width, height) {
            const N = R()?.Neighbors;
            if (N?.offsetOf) return N.offsetOf(mapData, side, entry, width, height);
            const shift = (entry && entry.shift) || 0;
            if (side === 'north') return { x: shift, z: -height };
            if (side === 'south') return { x: shift, z: mapData.height };
            if (side === 'west') return { x: -width, z: shift };
            return { x: mapData.width, z: shift };
        },

        /** How far the game's view goes past a side with a neighbor, in tiles: half its screen each way. */
        reachTiles(system, tileWidth, tileHeight) {
            const advanced = (system && system.advanced) || {};
            const width = Number(advanced.screenWidth) || 816, height = Number(advanced.screenHeight) || 624;
            return { x: Math.ceil(width / (tileWidth || 48) / 2), y: Math.ceil(height / (tileHeight || 48) / 2) };
        },

        /**
         * The part of a neighbor the view can show past `side`, in this map's tiles (`x1`, `y1`
         * exclusive): its rectangle, cut to the reach past that side and along it. Null when none.
         */
        stripOf(side, mapData, offset, width, height, reach) {
            const W = mapData.width, H = mapData.height;
            const view = side === 'north' ? { x0: -reach.x, y0: -reach.y, x1: W + reach.x, y1: 0 }
                : side === 'south' ? { x0: -reach.x, y0: H, x1: W + reach.x, y1: H + reach.y }
                : side === 'west' ? { x0: -reach.x, y0: -reach.y, x1: 0, y1: H + reach.y }
                : { x0: W, y0: -reach.y, x1: W + reach.x, y1: H + reach.y };
            const x0 = Math.max(view.x0, offset.x), y0 = Math.max(view.y0, offset.z);
            const x1 = Math.min(view.x1, offset.x + width), y1 = Math.min(view.y1, offset.z + height);
            return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
        },

        /** The chunks of a strip within `area` (tiles, `x1`, `y1` exclusive), as `[cx, cy]`. */
        chunksIn(strip, area, size = this.CHUNK) {
            const out = [];
            if (!strip || !area) return out;
            const x0 = Math.max(strip.x0, area.x0), y0 = Math.max(strip.y0, area.y0);
            const x1 = Math.min(strip.x1, area.x1), y1 = Math.min(strip.y1, area.y1);
            if (!(x1 > x0 && y1 > y0)) return out;
            for (let cy = Math.floor(y0 / size); cy * size < y1; cy++) {
                for (let cx = Math.floor(x0 / size); cx * size < x1; cx++) out.push([cx, cy]);
            }
            return out;
        },

        /** The detail a chunk is drawn at for a zoom: 1 (a tile's own pixels), else halved down to an eighth while the screen shows less. */
        levelFor(scale, dpr = 1) {
            const shown = (Number(scale) || 1) * (Number(dpr) || 1);
            let level = 1;
            while (level > 0.125 && shown <= level / 2) level /= 2;
            return level;
        },

        /** What a map file is now, from its `fs.Stats`: another string once it is written, '' with no file. */
        stamp(stat) {
            return stat ? `${stat.mtimeMs}:${stat.size}` : '';
        },

        //---------------------------------------------------------------------
        // What is kept for a view

        state(tm) {
            return tm._neighbor2D || (tm._neighbor2D = { owner: '', sides: {}, layer: null, frame: 0, queue: [] });
        },

        /** Whether the view shows what lies past the border (the map bar's Surroundings tick). */
        shown() {
            const box = typeof document !== 'undefined' ? document.getElementById('map-surround-view') : null;
            if (box) return !!box.checked;
            return !root.RRMapEdges || root.RRMapEdges.visible();
        },

        /** Whether the 2D view is the one on screen. */
        flat() {
            return !root.reactor?.mapEditor3D?.enabled;
        },

        /** How far the view may pan past each side, in tiles: 0 where no neighbor is shown. */
        reach(tm) {
            const out = { north: 0, east: 0, south: 0, west: 0 };
            const st = tm && tm._neighbor2D, map = tm && tm.currentMap;
            if (!st || !map || !this.shown() || st.owner !== this.ownerOf(tm)) return out;
            const reach = this.reachTiles(tm.databaseManager?.getSystem?.(), tm.TILE_WIDTH, tm.TILE_HEIGHT);
            for (const side of SIDES) if (st.sides[side]?.strip) out[side] = side === 'north' || side === 'south' ? reach.y : reach.x;
            return out;
        },

        ownerOf(tm) {
            return `${tm.projectPath || ''}|${tm.currentMap?.id || 0}|${tm.TILE_WIDTH}`;
        },

        //---------------------------------------------------------------------
        // Keeping the strips in line with the map

        /**
         * Bring the strips in line with the map as it stands: a side whose neighbor's file was
         * written, or that names another map, is read again; a changed shift moves its strip; a
         * side that names none goes. Cheap when nothing changed (one file look per neighbor).
         */
        sync(tm) {
            if (!tm || tm.destroyed) return;
            const st = this.state(tm), map = tm.currentMap;
            const owner = map ? this.ownerOf(tm) : '';
            if (st.owner !== owner) { this.clear(tm); st.owner = owner; }
            this.attach(tm);
            const shown = this.shown();
            if (st.layer) st.layer.visible = shown;
            // Hidden by the tick: what was drawn stays for when it is shown again; the reach is gone meanwhile.
            if (!shown) { this.refresh(tm); return; }
            const named = map && !map.rrWorkshop ? this.neighborsOf(map) : {};
            let moved = false;
            for (const side of SIDES) {
                const entry = named[side], held = st.sides[side];
                const file = entry ? this.fileOf(tm, entry.map) : null;
                let stat = null;
                if (file) { try { stat = tm.fs.statSync(file); } catch (error) { stat = null; } }
                const stamp = this.stamp(stat), key = entry && stamp ? `${entry.map}|${stamp}` : '';
                if (!key) {
                    if (held) { this.drop(st, side); moved = true; }
                    continue;
                }
                if (held && held.key === key) {
                    if ((held.shift || 0) !== (entry.shift || 0)) { this.place(tm, held, side, entry); moved = true; }
                    continue;
                }
                if (held) { this.drop(st, side); moved = true; }
                this.load(tm, st, side, entry, key, file);
            }
            // (Shown again by the tick: the reach comes back with the strips kept.)
            this.refresh(tm, !moved);
        },

        fileOf(tm, mapId) {
            if (!tm.fs || !tm.path || !tm.projectPath || !(mapId > 0)) return null;
            return tm.path.join(tm.projectPath, 'data', 'Map' + String(mapId).padStart(3, '0') + '.json');
        },

        /** Read a neighbor's map and the sheets its tiles are drawn from; its strip is drawn once both are in. */
        load(tm, st, side, entry, key, file) {
            const held = { key, mapId: entry.map, shift: entry.shift || 0, map: null, sheets: null, strip: null, offset: null, chunks: new Map() };
            st.sides[side] = held;
            const parse = data => (root.RRJson ? root.RRJson.parse(data) : JSON.parse(String(data)));
            const read = tm.fs.promises?.readFile ? tm.fs.promises.readFile(file) : Promise.resolve(tm.fs.readFileSync(file));
            read.then(async data => {
                const map = parse(data);
                if (!map || !(map.width > 0) || !(map.height > 0) || !Array.isArray(map.data)) throw new Error('Not a map.');
                const tileset = tm.databaseManager?.getTileset?.(map.tilesetId) || null;
                const sheets = tileset ? await this.sheets(tm, st, tileset) : [];
                if (st.sides[side] !== held || tm.destroyed) return;
                held.map = map;
                held.sheets = sheets;
                held.flags = tileset ? tileset.flags : null;
                this.place(tm, held, side, entry);
                this.refresh(tm);
            }).catch(error => {
                if (st.sides[side] === held) console.warn(`The neighboring map ${entry.map} could not be drawn.`, error);
            });
        },

        /**
         * The sheets of a tileset as pictures a canvas can draw: the view's own when the neighbor
         * shares this map's tileset (decoded once), else read once per tileset.
         */
        sheets(tm, st, tileset) {
            const names = (tileset.tilesetNames || []).join('|');
            const own = tm.currentTileset && (tm.currentTileset.tilesetNames || []).join('|') === names;
            if (own) {
                const out = [];
                for (let i = 0; i < (tileset.tilesetNames || []).length; i++) out[i] = tm.tilesetTextures?.[i]?.source?.resource || null;
                if (out.some(sheet => sheet && sheet.width > 0)) return Promise.resolve(out);
            }
            const cache = st.sheetCache || (st.sheetCache = new Map());
            if (!cache.has(names)) {
                const folder = tm.path.join(tm.projectPath, 'img', 'tilesets');
                cache.set(names, Promise.all((tileset.tilesetNames || []).map(name => new Promise(resolve => {
                    if (!name || typeof Image === 'undefined') { resolve(null); return; }
                    const image = new Image();
                    image.onload = () => resolve(image);
                    image.onerror = () => resolve(null);
                    image.src = tm.assetUrl(tm.path.join(folder, name + '.png'));
                }))));
            }
            return cache.get(names);
        },

        /** A neighbor at its place (again): its strip worked out, its chunks drawn afresh. */
        place(tm, held, side, entry) {
            this.state(tm).version = (this.state(tm).version || 0) + 1;
            held.shift = entry.shift || 0;
            for (const chunk of held.chunks.values()) this.destroyChunk(chunk);
            held.chunks.clear();
            if (!held.map) return;
            const map = tm.currentMap;
            const reach = this.reachTiles(tm.databaseManager?.getSystem?.(), tm.TILE_WIDTH, tm.TILE_HEIGHT);
            held.offset = this.offsetOf(map, side, entry, held.map.width, held.map.height);
            held.strip = this.stripOf(side, map, held.offset, held.map.width, held.map.height, reach);
        },

        /** The pan range and the canvas's crop follow the reach; the chunks in view are drawn. `quiet`: only when the reach changed. */
        refresh(tm, quiet = false) {
            if (!tm.container || tm.destroyed) return;
            const st = this.state(tm), reach = this.reach(tm), sign = SIDES.map(side => reach[side]).join(',');
            if (quiet && st.reachSign === sign) return;
            st.reachSign = sign;
            try {
                tm.updateScrollbars?.();
                tm.applyViewportCrop?.();
            } catch (error) { console.warn('Neighboring maps:', error); }
            this.view(tm);
            tm.requestRender?.();
        },

        //---------------------------------------------------------------------
        // The picture

        /** The layer the chunks stand in, first in the map's container (under everything of the map's own). */
        attach(tm) {
            const st = this.state(tm);
            if (!tm.container || typeof PIXI === 'undefined') return null;
            if (!st.layer || st.layer.destroyed) {
                st.layer = new PIXI.Container();
                st.layer.label = 'Neighboring maps';
                st.layer.eventMode = 'none';
                st.layer.interactiveChildren = false;
                // (A layer made again: its chunks went with the one before.)
                st.version = (st.version || 0) + 1;
                for (const side of Object.keys(st.sides)) {
                    for (const chunk of st.sides[side].chunks.values()) this.destroyChunk(chunk);
                    st.sides[side].chunks.clear();
                }
            }
            if (st.layer.parent !== tm.container) tm.container.addChildAt(st.layer, 0);
            return st.layer;
        },

        /** The map's container is about to be destroyed: the layer leaves it whole, for the next one. */
        detach(tm) {
            const layer = tm && tm._neighbor2D && tm._neighbor2D.layer;
            if (layer && layer.parent) layer.parent.removeChild(layer);
        },

        /** The visible part of the view, in this map's tiles, with a chunk's margin. */
        visibleTiles(tm) {
            const size = tm.viewportSize?.();
            const scale = tm.container.scale.x || 1;
            if (!size || !(size.width > 0)) return null;
            const tw = tm.TILE_WIDTH * scale, th = tm.TILE_HEIGHT * scale, m = this.CHUNK;
            return {
                x0: Math.floor(-tm.container.x / tw) - m, y0: Math.floor(-tm.container.y / th) - m,
                x1: Math.ceil((size.width - tm.container.x) / tw) + m, y1: Math.ceil((size.height - tm.container.y) / th) + m
            };
        },

        /** The chunks in view that are not yet drawn at the zoom's detail are drawn, a few a frame. */
        view(tm) {
            const st = tm && tm._neighbor2D;
            if (!st || !tm.container || tm.destroyed || !this.flat() || !this.shown()) return;
            const area = this.visibleTiles(tm);
            if (!area) return;
            const level = this.levelFor(tm.container.scale.x, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
            // A pan within the same chunks asks nothing new.
            const C = this.CHUNK, key = `${Math.floor(area.x0 / C)},${Math.floor(area.y0 / C)},${Math.ceil(area.x1 / C)},${Math.ceil(area.y1 / C)},${level},${st.version || 0}`;
            if (key === st.viewKey) return;
            st.viewKey = key;
            const queue = [];
            for (const side of SIDES) {
                const held = st.sides[side];
                if (!held || !held.strip) continue;
                const wanted = new Set();
                for (const [cx, cy] of this.chunksIn(held.strip, area)) {
                    const id = cx + ',' + cy, chunk = held.chunks.get(id);
                    wanted.add(id);
                    if (!chunk || chunk.level !== level) queue.push({ held, cx, cy, id, level });
                }
                // Out of view and over the keep: the ones drawn at another detail go first, then the rest.
                if (held.chunks.size > this.KEEP) {
                    const away = [...held.chunks.entries()].filter(([id]) => !wanted.has(id)).sort((a, b) => (a[1].level === level) - (b[1].level === level));
                    for (const [id, chunk] of away.slice(0, held.chunks.size - this.KEEP)) { this.destroyChunk(chunk); held.chunks.delete(id); }
                }
            }
            st.queue = queue;
            if (queue.length && !st.frame) st.frame = frame(() => this.drain(tm));
        },

        /** Draw queued chunks for a frame's budget; the rest on the frames after. */
        drain(tm) {
            const st = tm._neighbor2D;
            if (!st) return;
            st.frame = 0;
            if (tm.destroyed || !tm.container) return;
            const started = now();
            let drew = 0;
            while (st.queue.length && (drew === 0 || now() - started < this.BUDGET_MS)) {
                const job = st.queue.shift();
                const sides = Object.values(st.sides);
                if (!sides.includes(job.held) || !job.held.map) continue;
                this.drawChunk(tm, job.held, job.cx, job.cy, job.level);
                drew++;
            }
            if (drew) tm.requestRender?.();
            if (st.queue.length) st.frame = frame(() => this.drain(tm));
        },

        /** One chunk of a neighbor's tiles drawn into a picture of its own, dimmed, at its place past the edge. */
        drawChunk(tm, held, cx, cy, level) {
            const layer = this.attach(tm), size = this.CHUNK, strip = held.strip;
            if (!layer || typeof document === 'undefined') return;
            const x0 = Math.max(strip.x0, cx * size), y0 = Math.max(strip.y0, cy * size);
            const x1 = Math.min(strip.x1, (cx + 1) * size), y1 = Math.min(strip.y1, (cy + 1) * size);
            if (!(x1 > x0 && y1 > y0)) return;
            const T = tm.TILE_SIZE, px = Math.max(1, Math.round(T * level)), scale = px / T;
            const canvas = document.createElement('canvas');
            canvas.width = (x1 - x0) * px;
            canvas.height = (y1 - y0) * px;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            // The neighbor's own tiles: this map's tile (x, y) is the neighbor's (x - offset.x, y - offset.z).
            const map = held.map, W = map.width, size2 = W * map.height, data = map.data;
            const nx0 = x0 - held.offset.x, ny0 = y0 - held.offset.z, nx1 = x1 - held.offset.x, ny1 = y1 - held.offset.z;
            ctx.setTransform(scale, 0, 0, scale, -nx0 * T * scale, -ny0 * T * scale);
            const flags = held.flags;
            const higher = id => !!(flags && (flags[id] & 0x10));
            const plane = (z, above) => {
                for (let y = ny0; y < ny1; y++) {
                    for (let x = nx0; x < nx1; x++) {
                        const id = data[z * size2 + y * W + x];
                        if (id > 0 && higher(id) === above) tm.drawTileToCanvas(ctx, id, x, y, held.sheets, T);
                    }
                }
            };
            // The live map's order: ground, its shadows, the other planes, then every ☆ tile over them.
            plane(0, false);
            for (let y = ny0; y < ny1; y++) {
                for (let x = nx0; x < nx1; x++) {
                    const bits = data[4 * size2 + y * W + x] || 0;
                    if (bits > 0) tm.drawShadowToCanvas(ctx, bits, x, y, T);
                }
            }
            for (let z = 1; z < 4; z++) plane(z, false);
            for (let z = 0; z < 4; z++) plane(z, true);
            const sprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
            sprite.texture.source.style.scaleMode = 'nearest';
            sprite.x = x0 * tm.TILE_WIDTH;
            sprite.y = y0 * tm.TILE_HEIGHT;
            sprite.width = (x1 - x0) * tm.TILE_WIDTH;
            sprite.height = (y1 - y0) * tm.TILE_HEIGHT;
            sprite.tint = this.DIM;
            sprite.eventMode = 'none';
            const id = cx + ',' + cy, old = held.chunks.get(id);
            if (old) this.destroyChunk(old);
            layer.addChild(sprite);
            held.chunks.set(id, { sprite, level });
        },

        destroyChunk(chunk) {
            const sprite = chunk && chunk.sprite;
            if (!sprite || sprite.destroyed) return;
            sprite.parent?.removeChild(sprite);
            sprite.destroy({ texture: true, textureSource: true });
        },

        /** A side's strip goes: its chunks with it. */
        drop(st, side) {
            const held = st.sides[side];
            if (!held) return;
            st.version = (st.version || 0) + 1;
            for (const chunk of held.chunks.values()) this.destroyChunk(chunk);
            delete st.sides[side];
        },

        /** Every strip and sheet read is let go (another map or project, or the view goes). */
        clear(tm) {
            const st = this.state(tm);
            for (const side of Object.keys(st.sides)) this.drop(st, side);
            st.sheetCache = null;
            st.queue = [];
        },

        dispose(tm) {
            if (!tm || !tm._neighbor2D) return;
            this.clear(tm);
            const st = tm._neighbor2D;
            if (st.layer && !st.layer.destroyed) { st.layer.parent?.removeChild(st.layer); st.layer.destroy({ children: true }); }
            st.layer = null;
            st.owner = '';
        },

        /** The map view's tilemap, if a project is open. */
        current() {
            return root.reactor?.projectController?.tilemapManager || null;
        },

        init() {
            if (typeof document === 'undefined' || this._bound) return;
            this._bound = true;
            const again = () => { const tm = this.current(); if (tm && tm.currentMap) this.sync(tm); };
            // The tick, a neighbor picked or slid in the Terrain tools, an undo of one, and files written by another window.
            document.addEventListener('rr-surround-view', again);
            document.addEventListener('rr-map-edited', again);
            if (typeof window !== 'undefined') window.addEventListener('focus', again);
            // The 2D view back from the 3D view: the chunks in view are drawn then.
            document.getElementById('map-3d-view')?.addEventListener('change', () => setTimeout(() => { const tm = this.current(); if (tm) this.view(tm); }, 0));
        }
    };

    root.RRMapNeighbor2D = api;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => api.init());
        else api.init();
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
