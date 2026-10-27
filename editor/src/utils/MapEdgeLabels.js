/**
 * MapEdgeLabels - Passage in the 3D map view: where a character can really go.
 *
 * With the map view's Passage tick on, the 3D view marks every place a
 * character can get to, on the surface it stands on there (the ground, a
 * floor, an upper floor, a roof within reach, a bridge), and each side of it
 * by what happens there: nothing where it walks on, a row of small arrows
 * where it hops, a bar with two arrows where it pulls itself up, a ladder, a
 * dashed bar where it drops, a solid bar where it is stopped. A tile nobody
 * gets to stand on wears an X. The tile under the pointer says the same in
 * words (Walk, Hop +0.5, Mantle +1.2, Climb ladder, Drop -2.0, Blocked: Too
 * high), and a legend of the marks sits in the view's corner.
 *
 * Every answer is the game's own: `ReactorPhysics.edges` (runtime/
 * reactor_physics.js) asked with the project's and the map's physics, the
 * tileset's passage flags the way `Game_Map.isPassable` reads them, and the
 * tiles placed models and sized events cover. Nothing is loaded, built or
 * listened to while the tick is off.
 *
 * Three parts: the words (`text`, `label`), the field (`Field`: what each
 * place of the map allows, worked out a chunk at a time and kept), and the
 * view (`passage`: the meshes, the legend, the labels, and following edits).
 */
(function(root) {
    'use strict';

    const DIRS = [[8, 0, -1], [6, 1, 0], [2, 0, 1], [4, -1, 0]];
    const WORDS = { walk: 'Walk', hop: 'Hop', mantle: 'Mantle', ladder: 'Climb ladder', drop: 'Drop', blocked: 'Blocked' };
    const REASONS = { high: 'Too high', headroom: 'No room to stand', thin: 'No room to stand', overhead: 'Something overhead', steep: 'Too steep', offmap: 'Map edge',
        tile: 'Tile passage', body: 'Something stands there', water: 'Deep water', bush: 'Plants in the way', stair: 'The side of a stair', edge: 'Something in the way',
        unreached: 'No way to get here' };
    const NO_STAND = 'Nobody can stand here';
    /** The marks' colors, by what happens at a side. The stylesheet's `.rr-passage-layer` block holds the same six. */
    const COLORS = { walk: '#7bd88f', hop: '#ffd84a', mantle: '#ff9a3c', ladder: '#58b4ff', drop: '#c79bff', blocked: '#ff5a4f' };
    const LEGEND_KEY = 'rr.passageLegend';

    const KINDS = ['walk', 'hop', 'mantle', 'ladder', 'drop', 'blocked'];
    const KIND_OF = { walk: 0, hop: 1, mantle: 2, ladder: 3, drop: 4, blocked: 5 };
    const WALK = 0, HOP = 1, MANTLE = 2, LADDER = 3, DROP = 4, BLOCKED = 5;
    /** Why a side is shut or a place is nobody's, as the field keeps it (a code is an index here). Each has words in REASONS. */
    const WHY = ['', 'offmap', 'edge', 'steep', 'thin', 'headroom', 'overhead', 'high', 'tile', 'body', 'water', 'bush', 'stair', 'unreached'];
    const WHY_OF = {};
    WHY.forEach((reason, code) => { WHY_OF[reason] = code; });
    /** A tileset's passage bit for a direction, as `Game_Map.isPassable` asks it. */
    const BIT = { 2: 1, 4: 2, 6: 4, 8: 8 };

    /**
     * A place's flags: a body can stop here; it is ground to start from; somebody can get here; it is swum;
     * water lies over it; it slopes; it is come to on foot (a walk or a ladder, not only a fall); something
     * is over it (a roof, a floor, a model's body), so its marks are also drawn through what hides them.
     */
    const STAND = 1, SEED = 2, REACHED = 4, SWIM = 8, WET = 16, SLOPED = 32, WALKED = 64, COVERED = 128;
    /** A place whose sides are drawn: somebody gets there, and either can stop there or comes on foot (a doorway, a steep path). */
    const shown = flags => (flags & REACHED) !== 0 && (flags & (STAND | WALKED)) !== 0;
    /** Cells along a chunk's side; ways kept for one side of a place; how near two heights are the same place. */
    const CHUNK = 16, WAYS = 3, MATCH = 0.05;
    /** How far under a model's foot a place still meets it, and how tall a body it meets is, in tiles. */
    const BODY_UNDER = 0.5, BODY_TALL = 3;

    const api = {
        WORDS, REASONS, COLORS, NO_STAND, KINDS, WHY,
        /** Whether Passage is shown in the 3D view now: the one thing the view's pointer handler asks. */
        on: false,

        tt(text) {
            const controller = root.reactor?.projectController;
            return controller && typeof controller._tt === 'function' ? controller._tt(text) : text;
        },

        /** What the label at an edge says: the word, the height gained or lost, and why not when blocked. */
        text(option, tt = text => text) {
            if (!option) return '';
            if (option.kind === 'blocked') {
                const reason = REASONS[option.reason];
                return reason ? `${tt(WORDS.blocked)}: ${tt(reason)}` : tt(WORDS.blocked);
            }
            const rise = Math.round((option.rise || 0) * 10) / 10;
            const word = tt(WORDS[option.kind] || option.kind);
            return option.kind === 'walk' || !rise ? word : `${word} ${rise > 0 ? '+' : ''}${rise.toFixed(1)}`;
        },

        /** What a tile nobody stands on says: the words, and why. */
        noStandText(reason, tt = text => text) {
            const why = REASONS[reason];
            return why ? `${tt(NO_STAND)}: ${tt(why)}` : tt(NO_STAND);
        },

        /** The limits the game would judge this map's edges by: the project's physics with the map's own over them. */
        rules(mapData) {
            const system = root.reactor?.databaseManager?.getSystem?.() || null;
            const own = system && system.reactorPhysics && typeof system.reactorPhysics === 'object' ? system.reactorPhysics : {};
            const map = mapData && mapData.reactor3d && mapData.reactor3d.physics && typeof mapData.reactor3d.physics === 'object' ? mapData.reactor3d.physics : {};
            const all = Object.assign({}, own, map);
            const controls = system && system.reactorControls && typeof system.reactorControls === 'object' ? system.reactorControls : {};
            const out = { jump: map.jump === true ? true : all.jump !== false && controls.jump !== false, mantle: all.mantle !== false };
            for (const key of ['jumpHeight', 'mantleReach', 'fallFrom', 'fallPercent']) { const n = all[key] === null || all[key] === '' ? NaN : Number(all[key]); if (Number.isFinite(n)) out[key] = n; }
            if (all.fallDamage !== undefined) out.fallDamage = !!all.fallDamage;
            if (all.swim !== undefined) out.swim = all.swim !== false;
            return out;
        },

        /**
         * The physics settings the game would run this map with (gravity, the swim depth, whether anyone
         * swims), read by the physics itself: it looks for the game's `$dataSystem` and `$dataMap`, which
         * stand in for the length of the one call. Null without the physics.
         */
        settings(mapData, physics = root.ReactorPhysics) {
            if (!physics || typeof physics.readSettings !== 'function') return null;
            const system = root.reactor?.databaseManager?.getSystem?.() || null;
            const own = name => Object.prototype.hasOwnProperty.call(root, name);
            const hadSystem = own('$dataSystem'), wasSystem = root.$dataSystem, hadMap = own('$dataMap'), wasMap = root.$dataMap;
            try {
                root.$dataSystem = system;
                root.$dataMap = mapData;
                return physics.readSettings();
            } finally {
                if (hadSystem) root.$dataSystem = wasSystem; else delete root.$dataSystem;
                if (hadMap) root.$dataMap = wasMap; else delete root.$dataMap;
            }
        },

        /** An edge's label: each way on, the one a body takes first. */
        label(edge, tt = text => text) {
            const seen = [], out = [];
            for (const option of edge.options || [edge.option]) {
                const text = this.text(option, tt);
                if (text && !seen.includes(text)) { seen.push(text); out.push(text); }
                if (out.length >= 3) break;
            }
            return out.join(' · ');
        },

        /** The game's physics, loaded the first time Passage is shown in the 3D view. */
        async load(editor) {
            if (root.ReactorPhysics) return true;
            if (this._loading) return this._loading;
            this._loading = (async () => {
                try {
                    const host = root.RPGReactorWebHost;
                    if (host?.mode === 'web' && host.projectRoot && typeof host.assetUrl === 'function') {
                        const url = `${String(host.projectRoot).replace(/\/+$/, '')}/js/reactor_physics.js`;
                        await editor.injectScriptUrl(host.assetUrl(url), url);
                    } else {
                        const runtimePath = editor.projectController?.projectManager?.getRuntimePath?.();
                        if (!runtimePath || !editor.fs || !editor.path) return false;
                        const full = editor.path.join(runtimePath, 'reactor_physics.js');
                        if (!editor.fs.existsSync(full)) return false;
                        await editor.injectScript(editor.fs.readFileSync(full, 'utf8'), full);
                    }
                } catch (error) { console.warn('Passage:', error); }
                this._loading = null;
                return !!root.ReactorPhysics;
            })();
            return this._loading;
        },

        /** The pointer is over a tile (or nothing) in the 3D view: the words for the place under it. */
        hover(editor, clientX, clientY, tile) {
            if (!this.on) return;
            passage.hover(editor, clientX, clientY, tile);
        }
    };

    //-------------------------------------------------------------------------
    // The field: what each place of a map allows
    //
    // A place is one level of a cell (`ReactorPhysics.levelsAt`): the ground,
    // a floor over it, a roof over that. For each, the field keeps whether a
    // body can stop there and what each of its four sides does, and from the
    // places of the ground it follows every way on (a walk, a hop, a mantle,
    // a ladder, a drop) to find the places somebody can get to. Kept in
    // chunks of cells as flat arrays, worked out nearest the view first, a
    // few milliseconds at a time.

    const LIFT = 0.04, RIM = 0.022;
    const stop = (reason, x, y, d, from) => ({ kind: 'blocked', reason, x, y, d, from, to: from, rise: 0, frames: 0, cost: 0 });

    class Field {
        /**
         * `physics` is the game's (`ReactorPhysics`), or null for a map the physics does not walk (a 2D
         * map): then only the tileset speaks. `options`: `world` (Reactor3D), `rules` (overrides for
         * `edgeRules`, see `rules()`), `settings` (see `settings()`), `tile(x, y)` (the passage bits the
         * tileset blocks on a cell, 15 for all), `size` (cells along a chunk).
         */
        constructor(mapData, physics, options) {
            const o = options || {};
            this.map = mapData;
            this.world = o.world || root.Reactor3D || null;
            const walked = !!(physics && this.world && this.world.isMap3D && this.world.isMap3D(mapData));
            this.physics = walked ? physics : null;
            this.tile = typeof o.tile === 'function' ? o.tile : null;
            this.settings = o.settings || null;
            this.width = mapData.width;
            this.height = mapData.height;
            this.size = o.size > 0 ? o.size : CHUNK;
            this.cols = Math.ceil(this.width / this.size);
            this.rows = Math.ceil(this.height / this.size);
            this.chunks = new Array(this.cols * this.rows).fill(null);
            /** Chunks to work out, and chunks whose marks changed since somebody took them. */
            this.queue = new Set();
            this.changed = new Set();
            for (let index = 0; index < this.chunks.length; index++) this.queue.add(index);
            /** Tiles taken by placed models and sized events: cell key to [foot, head, ...]. */
            this.bodies = new Map();
            this.bits = new Uint8Array(this.width * this.height).fill(255);
            this.stack = [];
            this.stale = false;
            /** The chunk being worked out, when a slice of time ended inside it. */
            this.building = null;
            /** The work done so far: chunks and cells worked out, and floods run from the start. */
            this.counts = { chunks: 0, cells: 0, floods: 0 };
            /** Counts every change to what the field holds: what was read of it before is out of date. */
            this.version = 0;
            /** While set, what is reached is not found afresh (edits are still coming in: once, when they stop). */
            this.hold = false;
            this.rules = this.physics ? this.read(() => this.physics.edgeRules(o.rules || {})) : { limit: 0.75, body: BODY_TALL, swim: true, swimDepth: 2.2 };
        }

        /** Run `work` with the physics reading this map's settings (the editor has no game for it to read them from). */
        read(work) {
            const physics = this.physics, settings = this.settings;
            if (!physics || !settings) return work();
            const was = physics.settings;
            physics.settings = function() { return settings; };
            try { return work(); } finally { physics.settings = was; }
        }

        tileBits(x, y) {
            if (!this.tile) return 0;
            const at = y * this.width + x;
            let bits = this.bits[at];
            if (bits === 255) bits = this.bits[at] = this.tile(x, y) & 15;
            return bits;
        }

        bodyAt(x, y, height) {
            const spans = this.bodies.get(y * 65536 + x);
            if (!spans) return false;
            for (let i = 0; i < spans.length; i += 2) if (height >= spans[i] - BODY_UNDER && height <= spans[i + 1]) return true;
            return false;
        }

        /** The tiles bodies take, as `[{ x, y, base, top }]` (a foot and a head height). Returns how many tiles changed. */
        setBodies(tiles) {
            const next = new Map();
            for (const tile of tiles || []) {
                if (!(tile.x >= 0 && tile.y >= 0 && tile.x < this.width && tile.y < this.height)) continue;
                const key = tile.y * 65536 + tile.x;
                let spans = next.get(key);
                if (!spans) next.set(key, spans = []);
                spans.push(tile.base, tile.top);
            }
            const touched = [];
            for (const [key, spans] of next) { const was = this.bodies.get(key); if (!was || was.join() !== spans.join()) touched.push(key); }
            for (const key of this.bodies.keys()) if (!next.has(key)) touched.push(key);
            this.bodies = next;
            for (const key of touched) { const x = key % 65536, y = (key - x) / 65536; this.dirty(x, y, x, y); }
            if (touched.length) this.version++;
            return touched.length;
        }

        /** The world changed on these cells: they and the cells beside them, whose sides read them, are worked out again. */
        dirty(x0, y0, x1, y1) {
            const ax = Math.max(0, Math.floor(x0) - 1), ay = Math.max(0, Math.floor(y0) - 1);
            const bx = Math.min(this.width - 1, Math.floor(x1) + 1), by = Math.min(this.height - 1, Math.floor(y1) + 1);
            if (ax > bx || ay > by) return;
            this.version++;
            for (let y = ay; y <= by; y++) this.bits.fill(255, y * this.width + ax, y * this.width + bx + 1);
            const size = this.size;
            for (let cy = Math.floor(ay / size); cy <= Math.floor(by / size); cy++) {
                for (let cx = Math.floor(ax / size); cx <= Math.floor(bx / size); cx++) this.queue.add(cy * this.cols + cx);
            }
        }

        dirtyAll() {
            this.version++;
            this.bits.fill(255);
            for (let index = 0; index < this.chunks.length; index++) this.queue.add(index);
        }

        /** Chunks still to work out (the one in hand among them). */
        left() { return this.queue.size + (this.building ? 1 : 0); }

        /** Work still to do: chunks, and finding afresh what is reached once they are done. */
        pending() { return this.left() + (this.stale ? 1 : 0); }

        chunkOf(x, y) {
            if (!(x >= 0 && y >= 0 && x < this.width && y < this.height)) return null;
            return this.chunks[Math.floor(y / this.size) * this.cols + Math.floor(x / this.size)];
        }

        /** The ground of a cell on a map the physics does not walk. */
        flatHeight(x, y) {
            const R = this.world;
            return R && R.groundHeightAt ? R.groundHeightAt(this.map, x + 0.5, y + 0.5) : 0;
        }

        /**
         * The places of a cell, from the ground up: `[{ top, draw, from, flags, why }]`, with `low` (the
         * height its X is drawn at) and `mark` (0 no X: a wall, a tower; 1 flat at `low`: water; 2 on its
         * lowest level; 3 on the bare ground: under a rail or a post). `draw` is the surface the marks lie
         * on (the water's over a place under water), `from` the height the game judges its sides from (a
         * swimmer's float), `why` the reason nobody stops there (a code of WHY, 0 when a body can). A `mark`
         * with 8 added is under cover.
         */
        places(x, y) {
            const map = this.map, R = this.world, P = this.physics, rules = this.rules, out = [];
            const bits = this.tileBits(x, y);
            if (!P) {
                const top = this.flatHeight(x, y);
                const why = bits === 15 ? WHY_OF.tile : this.bodyAt(x, y, top) ? WHY_OF.body : 0;
                out.push({ top, draw: top, from: top, flags: (why ? 0 : STAND | SEED) | (why === WHY_OF.body ? COVERED : 0), why });
                out.low = top; out.mark = why === WHY_OF.body ? 10 : 2;
                return out;
            }
            const levels = P.levelsAt(map, x, y);
            const base = R.pieceBaseAt ? R.pieceBaseAt(map, x, y) : (levels.length ? levels[0].top : 0);
            const surface = R.hasWater && R.hasWater(map) && R.waterSurfaceAt ? R.waterSurfaceAt(map, x + 0.5, y + 0.5) : null;
            const bush = !!(map.reactor3d && map.reactor3d.foliage && R.bushBlocksCell && R.bushBlocksCell(map, x, y));
            for (let i = 0; i < levels.length; i++) {
                const level = levels[i];
                const depth = surface !== null ? Math.max(0, surface - level.top) : 0;
                const deep = depth > R.WATER_WADE, swum = deep && rules.swim && depth > rules.swimDepth;
                // The game's own test of a place to stop (`ReactorPhysics.standingAt`), with what the tiles and the bodies add.
                // Under water nobody swims the water is the reason, whatever its bed is like.
                let why = 0;
                if (deep && !rules.swim) why = WHY_OF.water;
                else if (!level.stand) why = level.narrow ? WHY_OF.thin : WHY_OF.steep;
                else if (level.ceiling - level.top < rules.body - 1e-6) why = WHY_OF.headroom;
                else if (bush) why = WHY_OF.bush;
                else if (bits === 15) why = WHY_OF.tile;
                else if (this.bodyAt(x, y, level.top)) why = WHY_OF.body;
                let flags = why ? 0 : STAND;
                if (depth > 0) flags |= WET;
                if (swum) flags |= SWIM;
                if (level.slope > 1e-3) flags |= SLOPED;
                if (Number.isFinite(level.ceiling) || why === WHY_OF.body) flags |= COVERED;
                // The ground itself, and what is laid on it within a step, is where anybody starts from.
                if ((flags & STAND) && i === 0 && level.top - base <= rules.limit + 1e-6) flags |= SEED;
                out.push({ top: level.top, draw: depth > 0 ? surface : level.top, from: swum ? surface - rules.swimDepth : level.top, flags, why });
            }
            out.low = base; out.mark = 0;
            if (levels.length) {
                const low = levels[0], under = surface !== null && surface > low.top;
                if (under) { out.low = surface; out.mark = 1; }
                else if (low.top - base <= rules.body + 1e-6) { out.low = low.narrow ? base : low.top; out.mark = low.narrow ? 3 : 2; }
                if (out.mark && (out[0].flags & COVERED)) out.mark |= 8;
            }
            return out;
        }

        /**
         * The four sides of a place, north, east, south, west, as `[{ d, dx, dy, option, options }]`: the
         * game's `edges` from the height `from`, stopped by the tileset where its flags shut the side
         * from either cell, and by a body standing on the cell beyond.
         */
        sides(x, y, from) {
            const P = this.physics, out = [], bits = this.tileBits(x, y);
            for (const [d, dx, dy] of DIRS) {
                const x2 = x + dx, y2 = y + dy;
                let options;
                if (!(x2 >= 0 && y2 >= 0 && x2 < this.width && y2 < this.height)) options = [stop('offmap', x, y, d, from)];
                else if ((bits & BIT[d]) || (this.tileBits(x2, y2) & BIT[10 - d])) options = [stop('tile', x, y, d, from)];
                else if (!P) {
                    const to = this.flatHeight(x2, y2);
                    options = this.bodyAt(x2, y2, to) ? [stop('body', x, y, d, from)] : [{ kind: 'walk', x: x2, y: y2, d, from, to, rise: to - from, frames: 16, cost: 1 }];
                } else {
                    options = P.edges(this.map, x, y, d, from, this.rules);
                    if (options[0].kind === 'blocked' && options[0].reason === 'edge') options = [Object.assign({}, options[0], { reason: this.edgeWhy(x, y, dx, dy, from) })];
                    if (this.bodies.size && options[0].kind !== 'blocked') {
                        const open = options.filter(option => !this.bodyAt(option.x, option.y, option.to));
                        options = open.length ? open : [stop('body', x, y, d, from)];
                    }
                }
                out.push({ d, dx, dy, option: options[0], options });
            }
            return out;
        }

        /**
         * What stands behind the game's "edge" (a step between two cells about level with each other that
         * it refuses, or a fall with nowhere to land): plants, deep water, the side of a stair, a rise too
         * steep at the border between them. Asked of the game's own tests; "edge" where none of them says.
         */
        edgeWhy(x, y, dx, dy, from) {
            const R = this.world, map = this.map, rules = this.rules, x2 = x + dx, y2 = y + dy;
            if (map.reactor3d && map.reactor3d.foliage && R.bushBlocksCell && R.bushBlocksCell(map, x2, y2)) return 'bush';
            if (R.hasWater && R.hasWater(map) && R.waterDepthAt && R.waterDepthAt(map, x2 + 0.5, y2 + 0.5, from) > (rules.swim ? rules.swimDepth : R.WATER_WADE)) return 'water';
            if (R.stairPieceAt && R.stairAxis) {
                for (const stair of [R.stairPieceAt(map, x, y), R.stairPieceAt(map, x2, y2)]) {
                    if (!stair) continue;
                    const axis = R.stairAxis(stair.rot);
                    if (dx * axis[0] + dy * axis[1] === 0) return 'stair';
                }
            }
            for (const level of this.physics.levelsAt(map, x2, y2)) if (Math.abs(level.top - from) <= rules.limit) return 'steep';
            return 'edge';
        }

        /** `places` and `sides` for one cell, read with the map's settings: what the pointer's label asks. */
        cell(x, y) {
            return this.read(() => {
                const places = this.places(x, y);
                const chunk = this.chunkOf(x, y);
                const first = chunk ? chunk.start[(y - chunk.y0) * chunk.cw + (x - chunk.x0)] : -1;
                places.forEach((place, i) => {
                    // Before its chunk is worked out, the ground is taken as reached.
                    const known = chunk && first + i < chunk.n && Math.abs(chunk.top[first + i] - place.top) < 1e-4;
                    place.reached = known ? shown(chunk.flags[first + i]) : !!(place.flags & SEED);
                    place.sides = this.sides(x, y, place.from);
                });
                return places;
            });
        }

        /** Start working out a chunk: the lists its places are gathered in, cell by cell. */
        begin(index) {
            const size = this.size, cx = index % this.cols, cy = (index - cx) / this.cols;
            const x0 = cx * size, y0 = cy * size, cw = Math.min(this.width, x0 + size) - x0, ch = Math.min(this.height, y0 + size) - y0;
            return { index, x0, y0, cw, ch, at: 0, start: new Uint16Array(cw * ch + 1), low: new Float32Array(cw * ch), mark: new Uint8Array(cw * ch),
                tops: [], draws: [], flags: [], cells: [], kinds: [], tos: [], ways: [] };
        }

        /** Work out the next cells of a chunk until `expired()` says the time is up. Returns whether the chunk is whole. */
        advance(work, expired) {
            const { x0, y0, cw, ch } = work, cells = cw * ch;
            while (work.at < cells) {
                const cell = work.at, x = x0 + cell % cw, y = y0 + Math.floor(cell / cw);
                work.start[cell] = work.tops.length;
                const places = this.places(x, y);
                work.low[cell] = places.low; work.mark[cell] = places.mark;
                for (const place of places) {
                    work.tops.push(place.top); work.draws.push(place.draw); work.flags.push(place.flags); work.cells.push(cell);
                    for (const side of this.sides(x, y, place.from)) {
                        work.kinds.push(KIND_OF[side.option.kind] | ((WHY_OF[side.option.reason] || 0) << 3));
                        for (let k = 0; k < WAYS; k++) {
                            const way = side.options[k], open = !!way && way.kind !== 'blocked';
                            work.tos.push(open ? way.to : NaN);
                            work.ways.push(open ? KIND_OF[way.kind] : BLOCKED);
                        }
                    }
                }
                work.at++;
                if ((work.at & 7) === 0 && work.at < cells && expired && expired()) return false;
            }
            work.start[cells] = work.tops.length;
            return true;
        }

        /** Take a worked-out chunk into the field, and follow the ground's ways into it and out of it. */
        commit(work) {
            const index = work.index;
            const chunk = { index, x0: work.x0, y0: work.y0, cw: work.cw, ch: work.ch, n: work.tops.length, start: work.start, low: work.low, mark: work.mark,
                top: Float32Array.from(work.tops), draw: Float32Array.from(work.draws), flags: Uint8Array.from(work.flags), cell: Uint16Array.from(work.cells),
                kind: Uint8Array.from(work.kinds), to: Float32Array.from(work.tos), way: Uint8Array.from(work.ways) };
            // A chunk worked out again may have taken a way away: everything reached is found afresh once the queue is empty.
            if (this.chunks[index]) this.stale = true;
            this.chunks[index] = chunk;
            this.changed.add(index);
            this.version++;
            this.counts.chunks++; this.counts.cells += chunk.cw * chunk.ch;
            for (let p = 0; p < chunk.n; p++) if (chunk.flags[p] & SEED) { chunk.flags[p] |= REACHED | WALKED; this.stack.push(index * 65536 + p); }
            // What the chunks beside it already reach comes on into this one.
            const lend = (x, y) => {
                const other = this.chunkOf(x, y);
                if (!other || other === chunk) return;
                const cell = (y - other.y0) * other.cw + (x - other.x0);
                for (let p = other.start[cell]; p < other.start[cell + 1]; p++) if (other.flags[p] & REACHED) this.stack.push(other.index * 65536 + p);
            };
            for (let x = chunk.x0; x < chunk.x0 + chunk.cw; x++) { lend(x, chunk.y0 - 1); lend(x, chunk.y0 + chunk.ch); }
            for (let y = chunk.y0; y < chunk.y0 + chunk.ch; y++) { lend(chunk.x0 - 1, y); lend(chunk.x0 + chunk.cw, y); }
            this.spread();
        }

        /** The place of a cell at a height, as an index into its chunk, or -1. */
        find(chunk, x, y, height) {
            const cell = (y - chunk.y0) * chunk.cw + (x - chunk.x0);
            let best = -1, gap = MATCH;
            for (let p = chunk.start[cell]; p < chunk.start[cell + 1]; p++) { const off = Math.abs(chunk.top[p] - height); if (off <= gap) { gap = off; best = p; } }
            return best;
        }

        /** Follow every way on from the places on the stack, marking what they reach. */
        spread() {
            const stack = this.stack;
            while (stack.length) {
                const ref = stack.pop(), chunk = this.chunks[Math.floor(ref / 65536)], p = ref % 65536;
                if (!chunk || p >= chunk.n) continue;
                const cell = chunk.cell[p], x = chunk.x0 + cell % chunk.cw, y = chunk.y0 + Math.floor(cell / chunk.cw);
                for (let side = 0; side < 4; side++) {
                    if ((chunk.kind[p * 4 + side] & 7) === BLOCKED) continue;
                    const x2 = x + DIRS[side][1], y2 = y + DIRS[side][2], target = this.chunkOf(x2, y2);
                    if (!target) continue;
                    for (let k = 0; k < WAYS; k++) {
                        const at = (p * 4 + side) * WAYS + k, to = chunk.to[at];
                        if (to !== to) break;
                        const q = this.find(target, x2, y2, to);
                        if (q < 0) continue;
                        // Come to on foot, a place is somewhere a character goes even where it could not be set down.
                        const gain = REACHED | (chunk.way[at] === WALK || chunk.way[at] === LADDER ? WALKED : 0);
                        if ((target.flags[q] & gain) === gain) continue;
                        const fresh = !(target.flags[q] & REACHED);
                        target.flags[q] |= gain;
                        this.changed.add(target.index);
                        if (fresh) stack.push(target.index * 65536 + q);
                    }
                }
            }
        }

        /** Find everything reached again from the ground, and note the chunks where it changed. */
        reflood() {
            this.stale = false;
            this.version++;
            this.counts.floods++;
            const kept = this.chunks.map(chunk => (chunk ? chunk.flags.slice() : null));
            for (const chunk of this.chunks) {
                if (!chunk) continue;
                for (let p = 0; p < chunk.n; p++) {
                    chunk.flags[p] &= ~(REACHED | WALKED);
                    if (chunk.flags[p] & SEED) { chunk.flags[p] |= REACHED | WALKED; this.stack.push(chunk.index * 65536 + p); }
                }
            }
            this.spread();
            this.chunks.forEach((chunk, index) => {
                if (!chunk) return;
                const was = kept[index];
                for (let p = 0; p < chunk.n; p++) if (was[p] !== chunk.flags[p]) { this.changed.add(index); return; }
            });
        }

        /**
         * The chunk to work out next: one in view before one that is not, the nearest of them first. With
         * `focus.group` (chunks along the side of what is drawn as one), the chunks of a group come together.
         */
        next(focus) {
            let best = -1, least = Infinity;
            for (const index of this.queue) {
                if (!focus) return index;
                const cx = index % this.cols, cy = (index - cx) / this.cols, size = this.size, group = focus.group > 1 ? focus.group : 1;
                const dx = (Math.floor(cx / group) + 0.5) * group * size - focus.x, dz = (Math.floor(cy / group) + 0.5) * group * size - focus.z;
                let score = dx * dx + dz * dz;
                if (focus.visible && !focus.visible(cx * size, cy * size, size)) score += 1e9;
                if (score < least) { least = score; best = index; }
            }
            return best;
        }

        /**
         * Work out queued chunks for up to `budget` milliseconds, going on with the one a slice ended in.
         * `focus` is `{ x, z, visible(x0, y0, size) }`, the view's middle and what it sees. Returns how
         * many chunks were finished.
         */
        work(budget, focus, clock) {
            const now = clock || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
            const started = now(), expired = () => !(now() - started < budget);
            let done = 0;
            this.read(() => {
                for (;;) {
                    if (!this.building) {
                        if (!this.queue.size) break;
                        const index = this.next(focus);
                        this.queue.delete(index);
                        this.building = this.begin(index);
                    }
                    if (!this.advance(this.building, expired)) break;
                    this.commit(this.building);
                    this.building = null;
                    done++;
                    if (expired()) break;
                }
            });
            // What is reached is found afresh in a slice of its own: after the last chunk when there is time left, else in the next.
            if (!this.left() && this.stale && !this.hold && !(done && expired())) this.reflood();
            return done;
        }

        /** Everything at once: for a small map, a test, a measurement. */
        finish() {
            this.hold = false;
            while (this.pending()) this.work(Infinity);
            return this;
        }

        /** What a side of a place does, as the field holds it: `{ kind, reason }`, or null where it holds no such place. */
        sideAt(x, y, height, d) {
            const chunk = this.chunkOf(x, y);
            if (!chunk) return null;
            const p = this.find(chunk, x, y, height), side = DIRS.findIndex(entry => entry[0] === d);
            if (p < 0 || side < 0) return null;
            const code = chunk.kind[p * 4 + side];
            return { kind: KINDS[code & 7], reason: WHY[code >> 3] || '', reached: !!(chunk.flags[p] & REACHED), stand: !!(chunk.flags[p] & STAND), shown: shown(chunk.flags[p]) };
        }

        /** Whether somebody can get to the place of a cell at a height. */
        reachedAt(x, y, height) {
            const chunk = this.chunkOf(x, y);
            if (!chunk) return false;
            const p = this.find(chunk, x, y, height);
            return p >= 0 && shown(chunk.flags[p]);
        }
    }

    //-------------------------------------------------------------------------
    // The marks: a chunk of the field as triangles
    //
    // Each mark lies on its place's surface, just inside the side it speaks
    // of, in the side's own frame: `u` along the side (-0.5 to 0.5), `v` in
    // from it. A dark shape a little larger goes under each colored one, so
    // a mark reads on grass, stone, sand and water, by day and by night; all
    // the dark shapes are drawn before all the colored ones, so a row of
    // marks along a wall is one unbroken line.

    const TRACK = [-0.5 - RIM, 0.5 + RIM, 0.03 - RIM, 0.14 + RIM];
    /** Shapes by kind: rectangles `[u0, u1, v0, v1]` and triangles `[u, half, base, tip]` (pointing at the side). */
    const SHAPES = {
        // A bar and a row of dashes lie on one dark track from end to end, so a wall and a ledge are each one line.
        [BLOCKED]: { depth: 0.165, track: TRACK, rects: [[-0.5, 0.5, 0.03, 0.14]], tris: [] },
        [DROP]: { depth: 0.165, track: TRACK, rects: [[-0.44, -0.22, 0.03, 0.14], [-0.11, 0.11, 0.03, 0.14], [0.22, 0.44, 0.03, 0.14]], tris: [] },
        [HOP]: { depth: 0.22, rects: [], tris: [[-0.333, 0.12, 0.195, 0.04], [0, 0.12, 0.195, 0.04], [0.333, 0.12, 0.195, 0.04]] },
        [MANTLE]: { depth: 0.31, rects: [[-0.5, 0.5, 0.03, 0.085]], tris: [[-0.22, 0.15, 0.29, 0.105], [0.22, 0.15, 0.29, 0.105]] },
        [LADDER]: { depth: 0.36, rects: [[-0.14, -0.095, 0.035, 0.34], [0.095, 0.14, 0.035, 0.34], [-0.095, 0.095, 0.085, 0.12], [-0.095, 0.095, 0.175, 0.21], [-0.095, 0.095, 0.265, 0.3]], tris: [] }
    };

    /** A color as the bytes a vertex holds: linear, as the renderer works in. */
    const linearBytes = hex => {
        const text = String(hex || '').trim().replace('#', '');
        const full = text.length === 3 ? text.replace(/./g, c => c + c) : text;
        const value = parseInt(full, 16);
        if (!/^[0-9a-f]{6}$/i.test(full) || !Number.isFinite(value)) return null;
        const channel = byte => { const c = byte / 255; return Math.round((c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * 255); };
        return [channel((value >> 16) & 255), channel((value >> 8) & 255), channel(value & 255), 255];
    };
    const paletteOf = colors => KINDS.map(kind => linearBytes(colors && colors[kind]) || linearBytes(COLORS[kind]));
    const DARK = [1, 1, 2, 165];

    /**
     * The marks of one chunk, or of several (a list of indexes): `{ positions, colors, indices, covered, vertices }` (three floats, four bytes,
     * triangle corners, and the corners again of the marks drawn through their cover: a cell's highest place
     * when it is under a roof, an X under a roof or a model), with `list` (`[{ x, y, d, kind, height }]`, an
     * X as kind "none") when `options.list` asks. `options.colors` are the six colors by kind.
     */
    function marks(field, index, options) {
        const o = options || {}, chunks = (Array.isArray(index) ? index : [index]).map(at => field.chunks[at]).filter(Boolean);
        const positions = [], colors = [], under = [], over = [], hidUnder = [], hidOver = [], list = o.list ? [] : null;
        const palette = paletteOf(o.colors);
        const R = field.world, map = field.map;
        const corner = (wx, h, wz, color) => { positions.push(wx, h, wz); colors.push(color[0], color[1], color[2], color[3]); return positions.length / 3 - 1; };
        const fan = (into, points, color, also) => {
            const first = corner(points[0][0], points[0][1], points[0][2], color);
            for (let i = 1; i < points.length; i++) corner(points[i][0], points[i][1], points[i][2], color);
            for (let i = 1; i + 1 < points.length; i++) { into.push(first, first + i, first + i + 1); if (also) also.push(first, first + i, first + i + 1); }
        };
        for (const chunk of chunks) for (let cell = 0; cell < chunk.cw * chunk.ch; cell++) {
            const x = chunk.x0 + cell % chunk.cw, y = chunk.y0 + Math.floor(cell / chunk.cw);
            // Through a roof one floor is read, the one next under it: the floors below would lie over it line on line.
            let reached = false, highest = -1;
            for (let p = chunk.start[cell + 1] - 1; p >= chunk.start[cell] && highest < 0; p--) if (shown(chunk.flags[p])) highest = p;
            for (let p = chunk.start[cell]; p < chunk.start[cell + 1]; p++) {
                if (!shown(chunk.flags[p])) continue;
                reached = true;
                const top = chunk.top[p], level = chunk.draw[p];
                const flat = !field.physics || (chunk.flags[p] & WET) || !(chunk.flags[p] & SLOPED);
                const covered = p === highest && (chunk.flags[p] & COVERED) !== 0, alsoUnder = covered ? hidUnder : null, alsoOver = covered ? hidOver : null;
                for (let side = 0; side < 4; side++) {
                    const kind = chunk.kind[p * 4 + side] & 7;
                    if (kind === WALK) continue;
                    const shape = SHAPES[kind], dx = DIRS[side][1], dy = DIRS[side][2], ax = -dy, ay = dx;
                    const wx = (u, v) => x + 0.5 + dx * (0.5 - v) + ax * u, wz = (u, v) => y + 0.5 + dy * (0.5 - v) + ay * u;
                    // The surface under the mark, from its four corners: a slope, a stair and a roof carry it up with them.
                    let h00 = level, h10 = level, h01 = level, h11 = level;
                    if (!flat) {
                        h00 = R.groundHeightAt(map, wx(-0.49, 0.01), wz(-0.49, 0.01), top); h10 = R.groundHeightAt(map, wx(0.49, 0.01), wz(0.49, 0.01), top);
                        h01 = R.groundHeightAt(map, wx(-0.49, shape.depth), wz(-0.49, shape.depth), top); h11 = R.groundHeightAt(map, wx(0.49, shape.depth), wz(0.49, shape.depth), top);
                    }
                    const at = (u, v) => {
                        const s = Math.max(0, Math.min(1, (u + 0.49) / 0.98)), t = Math.max(0, Math.min(1, (v - 0.01) / (shape.depth - 0.01)));
                        return [wx(u, v), (h00 * (1 - s) + h10 * s) * (1 - t) + (h01 * (1 - s) + h11 * s) * t + LIFT, wz(u, v)];
                    };
                    if (shape.track) { const [u0, u1, v0, v1] = shape.track; fan(under, [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], DARK, alsoUnder); }
                    for (const [u0, u1, v0, v1] of shape.rects) {
                        if (!shape.track) fan(under, [at(u0 - RIM, v0 - RIM), at(u1 + RIM, v0 - RIM), at(u1 + RIM, v1 + RIM), at(u0 - RIM, v1 + RIM)], DARK, alsoUnder);
                        fan(over, [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], palette[kind], alsoOver);
                    }
                    for (const [u, half, base, tip] of shape.tris) {
                        fan(under, [at(u - half - RIM * 1.8, base + RIM), at(u + half + RIM * 1.8, base + RIM), at(u, tip - RIM * 1.8)], DARK, alsoUnder);
                        fan(over, [at(u - half, base), at(u + half, base), at(u, tip)], palette[kind], alsoOver);
                    }
                    if (list) list.push({ x, y, d: DIRS[side][0], kind: KINDS[kind], height: top });
                }
            }
            if (reached || !chunk.mark[cell]) continue;
            // Nobody gets to stand on this tile: an X on it.
            const style = chunk.mark[cell] & 7, low = chunk.low[cell], hid = (chunk.mark[cell] & 8) !== 0;
            const height = (wx, wz) => (style === 1 || !field.physics ? low
                : style === 3 ? R.elevationAt(map, x, y) + (R.terrainHeightAt ? R.terrainHeightAt(map, wx, wz) : 0)
                    : R.groundHeightAt(map, wx, wz, low)) + LIFT;
            const arm = (into, sx, sz, reach, half, color, also) => {
                // One stroke of the X, corner to corner, as wide as `half` each side of its line.
                const ex = sx * reach, ez = sz * reach, nx = -sz * half * Math.SQRT1_2, nz = sx * half * Math.SQRT1_2;
                const ends = [[x + 0.5 - ex + nx, y + 0.5 - ez + nz], [x + 0.5 - ex - nx, y + 0.5 - ez - nz], [x + 0.5 + ex - nx, y + 0.5 + ez - nz], [x + 0.5 + ex + nx, y + 0.5 + ez + nz]];
                const near = height(x + 0.5 - ex, y + 0.5 - ez), far = height(x + 0.5 + ex, y + 0.5 + ez);
                fan(into, ends.map(([px, pz], i) => [px, i < 2 ? near : far, pz]), color, also);
            };
            for (const [sx, sz] of [[1, 1], [1, -1]]) { arm(under, sx, sz, 0.3 + RIM, 0.058 + RIM, DARK, hid ? hidUnder : null); }
            for (const [sx, sz] of [[1, 1], [1, -1]]) { arm(over, sx, sz, 0.3, 0.058, palette[BLOCKED], hid ? hidOver : null); }
            if (list) list.push({ x, y, d: 0, kind: 'none', height: low });
        }
        const vertices = positions.length / 3, Index = vertices > 65535 ? Uint32Array : Uint16Array;
        return { positions: Float32Array.from(positions), colors: Uint8Array.from(colors), indices: Index.from(under.concat(over)),
            covered: Index.from(hidUnder.concat(hidOver)), vertices, list };
    }

    //-------------------------------------------------------------------------
    // The view: the field drawn in the 3D map view, and kept right
    //
    // One mesh for each block of two by two chunks that has marks, and a
    // second of the marks under cover (a floor under its roof, a tile under a
    // model), drawn faintly where the cover hides them and only to a view
    // that looks down on it: a house's upper floor reads through its roof
    // from above, and nothing crosses its front seen from the street. The
    // work runs on frames of its own, a few milliseconds each, only while
    // there is something to work out; an edit is found by comparing the map
    // with what it was.

    const BUDGET_MS = 4, MESH_MS = 3;
    /** Chunks along the side of one mesh: fewer, larger meshes are fewer draws for the same marks. */
    const BLOCK = 2;
    /** How strongly a mark shows through what hides it: enough to read a floor through its roof, too little to lie over a wall's face. */
    const GHOST = 0.2;
    /**
     * How steeply the view looks down before marks show through their cover, as the sine of its pitch:
     * not at all under the first (seen from the street they would cross a house's wall and windows),
     * fully from the second (a roof seen from above).
     */
    const GHOST_FROM = 0.7, GHOST_FULL = 0.87;
    /** The render layer the marks are on: the view's camera sees it, a reflection's or a shadow's does not. */
    const LAYER = 21;
    /** How long after the last edit what is reached is found afresh, in milliseconds: once for a brush stroke, not once a frame of it. */
    const SETTLE_MS = 150;
    /** How near the height the pointer's ray met a place lies to be the place met; how far from it a place is somewhere else (the label is then put at the pointer). In tiles. */
    const ON = 0.6, APART = 1.75;
    /**
     * How far under (or over) the point met a floor is still the one pointed at, in tiles: a storey and
     * its slab. The foot of a wall from its face, the floor under a cottage's roof; not the room eleven
     * tiles under a tall roof's ridge, whose words would stand far from the pointer.
     */
    const STOREY = 5.5;
    /** The upward part of a face's unit normal from which it is a top looked down on (a roof's pitch), not a wall's face. */
    const FACE_UP = 0.25;
    /**
     * A roof is looked through to the floor under it only by a ray that comes down this steeply (the
     * downward part of its direction): the view then shows that floor's marks through the roof, and the
     * pointer is on one of them. And for no more cells than a tall roof's rise carries such a ray.
     */
    const THROUGH_FROM = (GHOST_FROM + GHOST_FULL) / 2, THROUGH_CELLS = 12;
    /** The room the labels keep from the view's left, top, right and bottom, in pixels (its scroll bars lie along the last two). */
    const EDGE = [4, 4, 16, 16];
    /** The way a side lies on the screen, in eighths of a turn clockwise from the right. */
    const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
    const LEGEND = [['walk', 'Walk'], ['hop', 'Hop'], ['mantle', 'Mantle'], ['ladder', 'Climb ladder'], ['drop', 'Drop'], ['blocked', 'Blocked'], ['none', NO_STAND]];

    function release() { this.array = null; }
    /** Whether two records of a piece say the same: field by field, and so on into a list or a record inside one. */
    function samePiece(a, b) {
        if (a === b) return true;
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
        if (Array.isArray(a)) {
            if (!Array.isArray(b) || a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) if (!samePiece(a[i], b[i])) return false;
            return true;
        }
        let fields = 0;
        for (const key in a) { fields++; if (!samePiece(a[key], b[key])) return false; }
        for (const key in b) fields--;
        return fields === 0;
    }
    const listOf = list => (Array.isArray(list) || ArrayBuffer.isView(list) ? list : null);
    /** A list of numbers as a typed copy of its own: what an edit made in place is found against. */
    function copyOf(list, Type) {
        if (!list) return null;
        const out = new Type(list.length);
        for (let i = 0; i < list.length; i++) out[i] = +list[i] || 0;
        return out;
    }
    /** Where each water sheet lies, apart from how it looks: its box, and its level and run as text, and the cells of the box it covers. */
    function sheetsOf(water) {
        return (Array.isArray(water) ? water : []).map(sheet => (sheet && typeof sheet === 'object' ? {
            x0: Math.min(sheet.x0, sheet.x1), y0: Math.min(sheet.y0, sheet.y1), x1: Math.max(sheet.x0, sheet.x1), y1: Math.max(sheet.y0, sheet.y1),
            lie: JSON.stringify([sheet.x0, sheet.y0, sheet.x1, sheet.y1, sheet.level, sheet.path || null]), mask: typeof sheet.mask === 'string' ? sheet.mask : ''
        } : null));
    }
    const overlap = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

    const passage = {
        BUDGET_MS, LAYER, SETTLE_MS,

        /** What the game would judge a map by (the project's physics and the map's own), and one text of it all to tell a change by. */
        judged(map, physics) {
            const rules = api.rules(map), settings = api.settings(map, physics);
            return { rules, settings, signature: JSON.stringify([rules, settings, map.width, map.height, !!physics]) };
        },

        /** The time, in milliseconds: what a stroke's rest and a frame's share of the work are measured by. */
        now() {
            return performance.now();
        },

        /** The Database's count of the changes made in it (the project's physics among them). */
        generation() {
            return root.reactor?.databaseManager?.mutationGeneration || 0;
        },

        /** Show, refresh or take down the picture, by the editor's own state. Returns whether it is shown. */
        sync(editor) {
            const wanted = !!(editor && editor.passageVisible && editor.enabled && typeof THREE !== 'undefined');
            if (!wanted) { this.stop(editor); return false; }
            const map = typeof editor.currentMap === 'function' ? editor.currentMap() : null;
            // Between two scenes (a rebuild) there is nothing to draw on; what was worked out is kept for the next one.
            if (!editor.mapScene || !map) return false;
            api.on = true;
            const state = editor._passage3d || (editor._passage3d = { meshes: new Map(), raf: 0, check: false, bodyCheck: false, turn: 0, bodiesKey: null, bodyTiles: new Map(), stats: null });
            state.active = true;
            // The game's rules first; a project without them (an older runtime) is read by its tiles alone.
            if (!root.ReactorPhysics && !state.noPhysics) {
                if (!state.loading) {
                    state.loading = true;
                    api.load(editor).then(found => { state.loading = false; if (!found) state.noPhysics = true; this.sync(editor); });
                }
                return true;
            }
            const physics = root.ReactorPhysics || null;
            const judged = this.judged(map, physics);
            state.database = this.generation();
            if (state.map !== map || state.signature !== judged.signature || !state.field) {
                this.dropMeshes(state);
                if (state.map !== map) state.bodyTiles.clear();
                state.map = map; state.signature = judged.signature;
                state.tiles = this.tileReader(editor, map);
                state.field = new Field(map, physics, { world: root.Reactor3D, rules: judged.rules, settings: judged.settings, tile: state.tiles ? state.tiles.read : null });
                state.snapshot = this.snapshot(map, state.tiles);
                state.bodiesKey = null;
                state.cellAt = null;
                state.hoverKey = '';
                state.stats = { startedAt: performance.now(), seenAt: 0, doneAt: 0 };
            } else {
                state.check = true;
            }
            // The meshes live on the view's renderer: on another one (the 3D view switched off and on) they are built again.
            if (state.renderer !== editor.renderer) {
                if (state.renderer) { this.dropMeshes(state); state.field.chunks.forEach((chunk, index) => { if (chunk) state.field.changed.add(index); }); }
                state.renderer = editor.renderer;
            }
            this.attach(editor, state);
            this.dom(editor, state);
            this.listen(editor, state);
            this.bodies(editor, state);
            this.run(editor, state);
            editor.requestRender?.();
            return true;
        },

        /** Take everything down: the meshes, the legend, the labels, the listeners. */
        stop(editor) {
            api.on = false;
            const state = editor && editor._passage3d;
            if (!state) return;
            state.active = false;
            if (state.raf) cancelAnimationFrame(state.raf);
            state.raf = 0;
            if (state.follow) cancelAnimationFrame(state.follow);
            state.follow = 0;
            if (state.onEdit) document.removeEventListener('rr-map-edited', state.onEdit);
            if (state.onLanguage) root.removeEventListener?.('rr-language-changed', state.onLanguage);
            state.watch?.disconnect();
            if (state.surface) for (const [type, handler] of state.surfaceHandlers || []) state.surface.removeEventListener(type, handler);
            this.dropMeshes(state);
            if (state.group) { state.group.parent?.remove(state.group); state.group = null; }
            for (const material of state.materials || []) material.dispose();
            state.layer?.remove();
            editor.camera?.layers.disable(LAYER);
            if (state.thumbnails && editor.snapshotBox === state.thumbnails.guarded) {
                if (state.thumbnails.own) editor.snapshotBox = state.thumbnails.plain; else delete editor.snapshotBox;
            }
            editor.passageGroup = null;
            editor._passage3d = null;
            editor.requestRender?.();
        },

        dropMesh(state, entry) {
            state.group?.remove(entry.front);
            if (entry.ghost) state.group?.remove(entry.ghost);
            // (The two share their corners: let go together.)
            entry.geometry.dispose();
            if (entry.shade) entry.shade.dispose();
        },

        dropMeshes(state) {
            for (const entry of state.meshes.values()) this.dropMesh(state, entry);
            state.meshes.clear();
        },

        /** The tileset's say on a cell, the way the flat view reads it (MapEditor3D.passageTiles). */
        tileReader(editor, map) {
            return typeof editor.passageTiles === 'function' ? editor.passageTiles(map) : null;
        },

        /** The group the meshes hang in, on the scene as it stands now (a rebuild makes a new one). */
        attach(editor, state) {
            const scene = editor.mapScene.scene();
            if (!state.group) {
                state.group = new THREE.Group();
                state.group.name = 'passage';
                state.group.userData.__reactorOverlay = true;
                const base = { vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
                const front = new THREE.MeshBasicMaterial(base);
                // What a roof or a model hides is drawn too, faintly: only where something nearer was drawn, and
                // only as far as the view looks down on it (the third row of the view's matrix holds how far).
                const ghost = new THREE.MeshBasicMaterial(Object.assign({}, base, { depthFunc: THREE.GreaterDepth, opacity: GHOST }));
                ghost.onBeforeCompile = shader => {
                    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>',
                        `#include <color_vertex>\n\tvColor.a *= smoothstep( ${GHOST_FROM.toFixed(2)}, ${GHOST_FULL.toFixed(2)}, viewMatrix[ 1 ][ 2 ] );`);
                };
                ghost.customProgramCacheKey = () => 'rr-passage-ghost';
                state.materials = [front, ghost];
            }
            if (state.group.parent !== scene) scene.add(state.group);
            editor.camera?.layers.enable(LAYER);
            editor.passageGroup = state.group;
            this.guardThumbnails(editor, state);
        },

        /**
         * A saved structure's thumbnail is a picture of the building, which the view draws of itself with
         * its own camera (`snapshotBox`): the marks are taken out of the scene for the length of that one
         * draw. The view's own method is put back when the picture goes.
         */
        guardThumbnails(editor, state) {
            if (state.thumbnails || typeof editor.snapshotBox !== 'function') return;
            const own = Object.prototype.hasOwnProperty.call(editor, 'snapshotBox'), plain = editor.snapshotBox;
            const guarded = function() {
                const group = state.group, shown = !!(group && group.visible);
                if (shown) group.visible = false;
                try { return plain.apply(this, arguments); } finally { if (shown) group.visible = true; }
            };
            editor.snapshotBox = guarded;
            state.thumbnails = { own, plain, guarded };
        },

        /** The colors of the marks: the stylesheet's, read where the legend shows them. */
        colors(state) {
            const out = {};
            const style = state.layer && typeof getComputedStyle === 'function' ? getComputedStyle(state.layer) : null;
            for (const kind of KINDS) out[kind] = (style && style.getPropertyValue('--rr-passage-' + kind).trim()) || COLORS[kind];
            return out;
        },

        /** The rules the map is judged by are asked again; when they changed, the picture is made anew. */
        rejudge(editor, state) {
            state.database = this.generation();
            if (state.active && state.map && this.judged(state.map, root.ReactorPhysics || null).signature !== state.signature) this.sync(editor);
        },

        /** Edits, the language, the pointer and the 3D view going are listened for while the picture is up. */
        listen(editor, state) {
            if (!state.onEdit) {
                state.onEdit = event => {
                    if (!state.active) return;
                    // A stroke of plants says where it was (they are changed in place, so nothing else shows it).
                    if (event?.detail?.foliage) (state.foliage || (state.foliage = [])).push(event.detail.region || null);
                    state.check = true;
                    this.run(editor, state);
                };
                document.addEventListener('rr-map-edited', state.onEdit);
                state.onLanguage = () => { if (state.active) { this.legend(state); this.hideLabels(state); } };
                root.addEventListener?.('rr-language-changed', state.onLanguage);
            }
            const surface = editor.inputSurface || null;
            if (surface && state.surface !== surface) {
                if (state.surface) for (const [type, handler] of state.surfaceHandlers || []) state.surface.removeEventListener(type, handler);
                state.surface = surface;
                // The 3D view switched off takes its input surface out of the page: the picture goes with it.
                state.watch?.disconnect();
                if (typeof MutationObserver !== 'undefined' && surface.parentNode) {
                    state.watch = new MutationObserver(() => { if (!surface.isConnected && editor._passage3d === state) this.sync(editor); });
                    state.watch.observe(surface.parentNode, { childList: true });
                }
                const hide = () => this.hideLabels(state);
                // A model carried, turned or sized in the view is let go with the pointer: the tiles it covers are asked again.
                const released = () => { if (state.active) { state.bodyCheck = true; this.run(editor, state); } };
                // The pointer back over the map (from the Database, from Map Properties): the rules may be new.
                const entered = () => { if (state.active) this.rejudge(editor, state); };
                state.surfaceHandlers = [['pointerleave', hide], ['pointerdown', hide], ['pointerup', released], ['pointercancel', released], ['pointerenter', entered]];
                for (const [type, handler] of state.surfaceHandlers) surface.addEventListener(type, handler);
            }
        },

        /** What the marks depend on, kept to find an edit by: the pieces as they were, and copies of the ground, the water's lie and the tiles. */
        snapshot(map, tiles) {
            const side = map.reactor3d || {};
            return { pieces: Array.isArray(side.pieces) ? side.pieces : null, terrain: copyOf(listOf(side.terrain), Float32Array), elevation: copyOf(listOf(side.elevation), Float32Array),
                water: sheetsOf(side.water), data: copyOf(listOf(map.data), Uint16Array), flags: tiles ? tiles.signature : '' };
        },

        /**
         * Find what changed on the map since the snapshot, queue the chunks around it, and bring the
         * snapshot up to the map as it is (each number that moved is written over, nothing is copied
         * whole). Returns whether anything changed.
         */
        reconcile(editor, state) {
            const map = state.map, field = state.field, side = map.reactor3d || {}, was = state.snapshot, R = root.Reactor3D;
            let found = false;
            const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
            const grow = (x0, y0, x1, y1) => { box.x0 = Math.min(box.x0, x0); box.y0 = Math.min(box.y0, y0); box.x1 = Math.max(box.x1, x1); box.y1 = Math.max(box.y1, y1); };
            const flush = () => { if (box.x0 <= box.x1) { field.dirty(box.x0, box.y0, box.x1, box.y1); found = true; } box.x0 = box.y0 = Infinity; box.x1 = box.y1 = -Infinity; };
            const all = () => { field.dirtyAll(); found = true; };
            const tiles = this.tileReader(editor, map);
            if ((tiles ? tiles.signature : '') !== was.flags) { state.tiles = tiles; field.tile = tiles ? tiles.read : null; was.flags = tiles ? tiles.signature : ''; all(); }
            // The pieces: every edit writes a new list, of new objects; a piece is the same when its fields are.
            const pieces = Array.isArray(side.pieces) ? side.pieces : null;
            if (pieces !== was.pieces) {
                const cover = piece => {
                    let cells = null;
                    try { const whole = R.normalizePiece ? R.normalizePiece(piece, map) : piece; cells = whole && R.pieceFootprint ? R.pieceFootprint(whole) : null; } catch (error) { cells = null; }
                    if (!cells || !cells.length) cells = [[piece.x, piece.y]];
                    // A rock is one mass with the rocks beside it: its surface moves a little past its own cells.
                    const reach = piece.kind === 'rock' ? 2 : 0;
                    for (const [x, y] of cells) grow(x - reach, y - reach, x + reach, y + reach);
                    flush();
                };
                const old = new Map();
                let keyed = true;
                for (const piece of was.pieces || []) { if (piece && piece.id !== undefined) old.set(piece.id, piece); else keyed = false; }
                for (const piece of pieces || []) {
                    if (!piece || piece.id === undefined) { keyed = false; continue; }
                    const before = old.get(piece.id);
                    old.delete(piece.id);
                    if (before === piece || (before && samePiece(before, piece))) continue;
                    if (before) cover(before);
                    cover(piece);
                }
                for (const gone of old.values()) cover(gone);
                if (!keyed) all();
                was.pieces = pieces;
            }
            // A grid of numbers against its copy: each one that moved is written into the copy and told to `moved`.
            const compare = (now, name, Type, moved) => {
                const kept = was[name];
                if (!now !== !kept || (now && now.length !== kept.length)) { was[name] = copyOf(now, Type); all(); return; }
                if (!now) return;
                for (let i = 0; i < now.length; i++) {
                    const before = kept[i];
                    kept[i] = +now[i] || 0;
                    if (kept[i] !== before) moved(i);
                }
            };
            // The ground: each corner that moved carries the four cells round it, and any shape that stands on one of them.
            const stride = map.width + 1;
            compare(listOf(side.terrain), 'terrain', Float32Array, i => { const x = i % stride, y = Math.floor(i / stride); grow(x - 1, y - 1, x, y); });
            if (box.x0 <= box.x1) {
                const moved = { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 };
                flush();
                for (const piece of pieces || []) {
                    if (!piece || !R.isShapeKind || !R.isShapeKind(piece.kind) || piece.x < moved.x0 || piece.x > moved.x1 || piece.y < moved.y0 || piece.y > moved.y1) continue;
                    const size = R.shapeSize ? R.shapeSize(piece) : [1, 1, 1], reach = Math.ceil(Math.hypot(size[0], size[2]) / 2) + 1;
                    field.dirty(piece.x - reach, piece.y - reach, piece.x + reach, piece.y + reach);
                }
            }
            const per = map.width * map.height;
            const cell = i => { const at = i % per, x = at % map.width, y = (at - x) / map.width; grow(x, y, x, y); };
            compare(listOf(side.elevation), 'elevation', Float32Array, cell);
            flush();
            compare(listOf(map.data), 'data', Uint16Array, cell);
            flush();
            // The water: a sheet that lies somewhere new carries its box, where it was and where it is; one whose
            // cells alone changed (a shore painted) carries those cells. How a sheet looks moves nothing.
            const sheets = sheetsOf(side.water);
            for (let i = 0; i < Math.max(sheets.length, was.water.length); i++) {
                const before = was.water[i], after = sheets[i];
                if (before && after && before.lie === after.lie) {
                    if (before.mask === after.mask) continue;
                    const wide = after.x1 - after.x0 + 1;
                    if (before.mask.length === after.mask.length && after.mask.length === wide * (after.y1 - after.y0 + 1)) {
                        for (let at = 0; at < after.mask.length; at++) if (after.mask[at] !== before.mask[at]) { const x = after.x0 + at % wide, y = after.y0 + Math.floor(at / wide); grow(x, y, x, y); }
                        continue;
                    }
                }
                for (const sheet of [before, after]) if (sheet && Number.isFinite(sheet.x0 + sheet.y0 + sheet.x1 + sheet.y1)) grow(sheet.x0, sheet.y0, sheet.x1, sheet.y1);
            }
            flush();
            was.water = sheets;
            for (const region of state.foliage || []) {
                if (region && Number.isFinite(region.x0) && Number.isFinite(region.x1)) field.dirty(region.x0 - 2, (region.y0 ?? region.z0) - 2, region.x1 + 2, (region.y1 ?? region.z1) + 2);
                else field.dirtyAll();
                found = true;
            }
            state.foliage = null;
            if (found) {
                // The physics keeps what it read of a map until its lists are replaced; ground moved in place is not.
                root.ReactorPhysics?.forgetEdges?.(map);
                if (state.stats) { state.stats.editAt = performance.now(); state.stats.editDoneAt = 0; }
            }
            return found;
        },

        /**
         * The tiles the map's placed models and sized events cover, asked of the game's body rule. Each
         * model's tiles are kept by where and how it stands, so one model moved changes its own tiles and
         * no other's; a model whose file is still loading joins when it arrives.
         */
        bodies(editor, state) {
            // (The editor's classes are script globals, not properties of the window.)
            const map = state.map, R = root.Reactor3D, T = typeof TilemapManager !== 'undefined' ? TilemapManager : null;
            const View = typeof MapEditor3D !== 'undefined' ? MapEditor3D : null;
            if (!R || !T || typeof T.modelPlacements !== 'function') return;
            const side = map.reactor3d || {}, sizes = side.eventSize || {};
            const placements = T.modelPlacements(map);
            // The page an event is judged by: the one Preview Event chose, else its first, which is what the map shows of it.
            const pageOf = event => {
                const index = View && View.previewPageIndex ? View.previewPageIndex(map, event) : 0;
                return (event.pages && event.pages[index === null ? 0 : index]) || null;
            };
            // An event is in the way as the game has it: at the characters' priority, and not walked through.
            const solid = event => { const page = pageOf(event); return !!page && page.priorityType === 1 && !page.through; };
            const foot = (x, y, z) => (R.groundHeightAt ? R.groundHeightAt(map, Math.floor(x) + 0.5, Math.floor(y) + 0.5) : 0) + (Number(z) || 0);
            // A typed size is the event's body, by the game's own reading of it (its limits, and where it lies from the event's tile).
            const sized = [], sizedIds = new Set(), sizedKey = [];
            for (const event of map.events || []) {
                if (!event || !Array.isArray(sizes[event.id]) || !solid(event)) continue;
                const [w, h] = R.eventSizeAt ? R.eventSizeAt(map, event.id) : [Math.max(1, Math.floor(Number(sizes[event.id][0])) || 1), Math.max(1, Math.floor(Number(sizes[event.id][1])) || 1)];
                if (w <= 1 && h <= 1) continue;
                const [ox, oy] = R.eventFootprintOrigin ? R.eventFootprintOrigin(map, event.id) : [0, 0];
                const base = foot(event.x, event.y, R.eventZAt ? R.eventZAt(map, event.id) : 0);
                for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) sized.push({ x: event.x + ox + i, y: event.y + oy + j, base, top: base + BODY_TALL });
                sizedIds.add(event.id);
                sizedKey.push([event.id, event.x, event.y, w, h, ox, oy]);
            }
            const models = [];
            for (const placed of placements) {
                if (placed.event && (!solid(placed.event) || sizedIds.has(placed.event.id))) continue;
                // A unit wears its model as a body: its rigid parts block to a character's height.
                const unit = !!(placed.event && (placed.event.rrUnit || /<unit\s*:/i.test(String(placed.event.note || ''))));
                models.push({ placed, unit, key: JSON.stringify([placed.spec, placed.direction, placed.x, placed.y, placed.z, unit]) });
            }
            const key = JSON.stringify([sizedKey, models.map(model => model.key)]);
            if (key === state.bodiesKey) return;
            state.bodiesKey = key;
            const turn = ++state.turn, kept = state.bodyTiles;
            // The whole list at once, so that only tiles that changed are worked out again.
            const apply = () => {
                if (turn !== state.turn || !state.active || state.map !== map) return;
                const tiles = sized.slice(), wanted = new Set();
                for (const model of models) { wanted.add(model.key); const known = kept.get(model.key); if (known) for (const tile of known) tiles.push(tile); }
                for (const known of Array.from(kept.keys())) if (!wanted.has(known)) kept.delete(known);
                if (state.field.setBodies(tiles)) this.run(editor, state);
            };
            const missing = models.filter(model => !kept.has(model.key));
            if (!missing.length || typeof RREventPreviewModels === 'undefined' || !R.blockedTilesFor) { apply(); return; }
            const project = editor.projectController?.getCurrentProject ? editor.projectController.getCurrentProject() : editor.projectController?.currentProject;
            // A model already loaded answers within this turn of the page's tasks, and those that answer together are
            // taken together: a model moved gives up its old tiles and takes its new ones in one step.
            let queued = false;
            const soon = () => { if (queued || turn !== state.turn) return; queued = true; Promise.resolve().then(() => { queued = false; apply(); }); };
            for (const { placed, unit, key: mine } of missing) {
                RREventPreviewModels.templateFor(project, placed.spec, editor).then(template => {
                    if (turn !== state.turn) return;
                    const tiles = [];
                    if (template) {
                        const base = foot(placed.x, placed.y, placed.z);
                        for (const tile of R.blockedTilesFor(template, template.userData.reactorSidecar, placed.spec, placed.direction, placed.x, placed.y, unit)) tiles.push({ x: tile.x, y: tile.y, base, top: base + BODY_TALL });
                    }
                    kept.set(mine, tiles);
                    soon();
                }).catch(() => soon());
            }
            // A file still loading does not hold back what is known for longer than a moment.
            setTimeout(soon, 120);
        },

        /** Keep frames coming while there is something to work out. */
        run(editor, state) {
            if (state.raf || !state.active) return;
            state.raf = requestAnimationFrame(() => { state.raf = 0; this.frame(editor, state); });
        },

        /** Where the view looks, and whether it sees a chunk: what is worked out first. */
        focus(editor, state) {
            const camera = editor.camera, target = editor.view && editor.view.target;
            const focus = state.focus || (state.focus = { x: 0, z: 0, group: BLOCK, visible: null, frustum: new THREE.Frustum(), matrix: new THREE.Matrix4(), box: new THREE.Box3() });
            focus.x = target ? target.x : state.map.width / 2;
            focus.z = target ? target.z : state.map.height / 2;
            if (!camera) { focus.visible = null; return focus; }
            camera.updateMatrixWorld();
            focus.frustum.setFromProjectionMatrix(focus.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
            focus.visible = focus.visible || ((x0, y0) => {
                // A chunk is in view when its block is (they are drawn together), in a box round the block's own
                // ground: tall enough for a house or a cliff, no taller.
                const map = state.map, R = root.Reactor3D, span = state.field.size * BLOCK;
                const bx = Math.floor(x0 / span) * span, by = Math.floor(y0 / span) * span;
                const x = Math.min(map.width - 1, bx + span / 2), y = Math.min(map.height - 1, by + span / 2);
                const ground = R && R.elevationAt ? R.elevationAt(map, Math.floor(x), Math.floor(y)) + (R.terrainHeightAt ? R.terrainHeightAt(map, x, y) : 0) : 0;
                focus.box.min.set(bx, ground - 16, by); focus.box.max.set(bx + span, ground + 24, by + span);
                return focus.frustum.intersectsBox(focus.box);
            });
            return focus;
        },

        /** One frame's share of the work: the edit check, a few chunks of the field, a few meshes. */
        frame(editor, state) {
            if (!state.active || editor._passage3d !== state) return;
            if (!editor.enabled || !editor.mapScene || editor.currentMap() !== state.map) { this.sync(editor); return; }
            const now = this.now();
            if (state.check) {
                state.check = false;
                // The rules first (the project's physics, the map's own): changed, the whole picture is made anew.
                if (this.judged(state.map, root.ReactorPhysics || null).signature !== state.signature) { this.sync(editor); return; }
                if (this.reconcile(editor, state)) state.editedAt = now;
            }
            if (state.bodyCheck) { state.bodyCheck = false; this.bodies(editor, state); }
            const field = state.field, focus = this.focus(editor, state);
            // While a stroke is under way its chunks are worked out as they come; what they reach is found once, when it rests.
            field.hold = now - (state.editedAt === undefined ? -Infinity : state.editedAt) < SETTLE_MS;
            if (field.pending()) field.work(BUDGET_MS, focus, () => this.now());
            if (field.changed.size && this.remesh(state, focus)) editor.requestRender?.();
            const stats = state.stats;
            if (stats) {
                const waiting = index => { const cx = index % field.cols, cy = (index - cx) / field.cols; return !focus.visible || focus.visible(cx * field.size, cy * field.size, field.size); };
                let inView = false;
                for (const index of field.queue) if (waiting(index)) { inView = true; break; }
                if (!inView) for (const index of field.changed) if (waiting(index)) { inView = true; break; }
                if (!inView && !stats.seenAt) stats.seenAt = performance.now();
                if (!inView && stats.editAt && !stats.editDoneAt) stats.editDoneAt = performance.now();
            }
            this.progress(state);
            if (field.pending() || field.changed.size || state.check || state.bodyCheck) { this.run(editor, state); return; }
            if (stats && !stats.doneAt) stats.doneAt = performance.now();
            if (state.hoverAt) this.hover(editor, state.hoverAt.x, state.hoverAt.y, null, true);
            // A material's first frames may be held back while its shader is made: one more draw once it is.
            setTimeout(() => editor.requestRender?.(), 250);
        },

        /** Build the meshes of the blocks whose chunks changed, those in view first, for a few milliseconds. */
        remesh(state, focus) {
            const field = state.field, colors = state.palette || (state.palette = this.colors(state)), started = performance.now();
            const across = Math.ceil(field.cols / BLOCK), span = field.size * BLOCK;
            const blocks = new Map();
            let drawn = 0;
            for (const index of field.changed) {
                const cx = index % field.cols, cy = (index - cx) / field.cols, block = Math.floor(cy / BLOCK) * across + Math.floor(cx / BLOCK);
                if (!blocks.has(block)) blocks.set(block, []);
            }
            const order = Array.from(blocks.keys()).map(block => {
                const bx = block % across, by = (block - bx) / across, dx = (bx + 0.5) * span - focus.x, dz = (by + 0.5) * span - focus.z;
                const members = blocks.get(block);
                for (let j = 0; j < BLOCK; j++) for (let i = 0; i < BLOCK; i++) if (bx * BLOCK + i < field.cols && by * BLOCK + j < field.rows) members.push((by * BLOCK + j) * field.cols + bx * BLOCK + i);
                return { block, members, score: dx * dx + dz * dz + (focus.visible && !focus.visible(bx * span, by * span, span) ? 1e9 : 0) };
            }).sort((a, b) => a.score - b.score);
            for (const { block: index, members } of order) {
                // A block is drawn when all its chunks are worked out: they come one after another, nearest first.
                if (members.some(member => field.queue.has(member) || (field.building && field.building.index === member))) continue;
                for (const member of members) field.changed.delete(member);
                const built = marks(field, members, { colors });
                const old = state.meshes.get(index);
                if (old) { this.dropMesh(state, old); state.meshes.delete(index); }
                if (built.vertices) {
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
                    geometry.setAttribute('color', new THREE.BufferAttribute(built.colors, 4, true));
                    geometry.setIndex(new THREE.BufferAttribute(built.indices, 1));
                    geometry.computeBoundingSphere();
                    const entry = { geometry, shade: null, front: new THREE.Mesh(geometry, state.materials[0]), ghost: null };
                    if (built.covered.length) {
                        // The same corners, and only the triangles of what is under cover.
                        entry.shade = new THREE.BufferGeometry();
                        entry.shade.setAttribute('position', geometry.attributes.position);
                        entry.shade.setAttribute('color', geometry.attributes.color);
                        entry.shade.setIndex(new THREE.BufferAttribute(built.covered, 1));
                        entry.shade.boundingSphere = geometry.boundingSphere.clone();
                        entry.ghost = new THREE.Mesh(entry.shade, state.materials[1]);
                        entry.shade.index.onUpload(release);
                    }
                    // Once on the GPU the lists are not needed here again (a mesh is built anew, never changed).
                    for (const attribute of [geometry.attributes.position, geometry.attributes.color, geometry.index]) attribute.onUpload(release);
                    for (const mesh of [entry.ghost, entry.front]) {
                        if (!mesh) continue;
                        mesh.matrixAutoUpdate = false;
                        mesh.raycast = function() {};
                        mesh.userData.__reactorOverlay = true;
                        mesh.layers.set(LAYER);
                        mesh.renderOrder = mesh === entry.front ? 996 : 995;
                        state.group.add(mesh);
                    }
                    state.meshes.set(index, entry);
                }
                drawn++;
                if (performance.now() - started > MESH_MS) break;
            }
            return drawn;
        },

        //---------------------------------------------------------------------
        // The legend and the labels (DOM, over the view)

        /** The layer over the view: inside the view's own input surface, so it goes when the 3D view does. */
        dom(editor, state) {
            const host = editor.inputSurface;
            if (!host || typeof document === 'undefined') return;
            if (state.layer && state.layer.parentNode === host) return;
            state.layer?.remove();
            const layer = state.layer = document.createElement('div');
            layer.className = 'rr-passage-layer';
            // The place the labels speak of, outlined: under a roof it is not the tile the view's own cursor is on.
            const frame = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            frame.setAttribute('class', 'rr-passage-outline');
            frame.setAttribute('aria-hidden', 'true');
            state.outline = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            frame.appendChild(state.outline);
            frame.style.display = 'none';
            layer.appendChild(frame);
            // A label at each side of the place; where the place is too small on the screen for four, one label of four rows.
            state.labels = [];
            for (let i = 0; i < 4; i++) {
                const label = document.createElement('div');
                label.className = 'rr-passage-label';
                label.hidden = true;
                layer.appendChild(label);
                state.labels.push(label);
            }
            const list = state.list = document.createElement('div');
            list.className = 'rr-passage-label rr-passage-list';
            list.hidden = true;
            state.rows = [];
            for (let i = 0; i < 4; i++) {
                const row = document.createElement('div'), way = document.createElement('span'), text = document.createElement('span');
                row.className = 'rr-passage-list-row';
                way.className = 'rr-passage-list-way';
                way.setAttribute('aria-hidden', 'true');
                row.append(way, text);
                list.appendChild(row);
                state.rows.push({ row, way, text, shown: -2 });
            }
            layer.appendChild(list);
            host.appendChild(layer);
            state.palette = null;
            state.hoverKey = '';
            this.legend(state);
        },

        /** A legend row's picture: the mark as it lies on the map. */
        swatch(kind) {
            const svg = (name, attributes) => { const node = document.createElementNS('http://www.w3.org/2000/svg', name); for (const key of Object.keys(attributes)) node.setAttribute(key, attributes[key]); return node; };
            const picture = svg('svg', { viewBox: '0 0 36 14', width: '36', height: '14', class: 'rr-passage-swatch', 'aria-hidden': 'true' });
            const fill = `var(--rr-passage-${kind === 'none' ? 'blocked' : kind})`;
            const shape = (name, attributes) => picture.appendChild(svg(name, Object.assign({ fill, stroke: 'var(--rr-passage-rim)', 'stroke-width': '1', 'stroke-linejoin': 'round' }, attributes)));
            if (kind === 'blocked') shape('rect', { x: 1, y: 5, width: 34, height: 4 });
            if (kind === 'drop') for (const x of [2, 14, 26]) shape('rect', { x, y: 5, width: 8, height: 4 });
            if (kind === 'hop') for (const x of [3, 14, 25]) shape('path', { d: `M${x} 11h8l-4-8z` });
            if (kind === 'mantle') { shape('rect', { x: 1, y: 1.5, width: 34, height: 2.5 }); for (const x of [6, 20]) shape('path', { d: `M${x} 13h10l-5-8z` }); }
            if (kind === 'ladder') { for (const x of [11, 23]) shape('rect', { x, y: 1, width: 2, height: 12 }); for (const y of [3, 6.5, 10]) shape('rect', { x: 13, y, width: 10, height: 1.5 }); }
            if (kind === 'none') picture.appendChild(svg('path', { d: 'M13 2l10 10M23 2l-10 10', fill: 'none', stroke: fill, 'stroke-width': '2.6', 'stroke-linecap': 'round' }));
            if (kind === 'walk') picture.appendChild(svg('path', { d: 'M3 7h30', fill: 'none', stroke: 'var(--color-text-dim)', 'stroke-width': '1', 'stroke-dasharray': '1 3' }));
            return picture;
        },

        /** The legend in the view's corner; closed, it stays closed for the editor session. */
        legend(state) {
            const layer = state.layer;
            if (!layer) return;
            layer.querySelector('.rr-passage-legend')?.remove();
            state.legendBox = null; state.legendFor = -1;
            // Where the line starts at the right, the corner is the one the view's scroll bar stands in: the legend keeps clear of it.
            const style = typeof getComputedStyle === 'function' ? getComputedStyle(layer) : null;
            layer.classList.toggle('rr-passage-rtl', !!style && style.direction === 'rtl');
            let closed = false;
            try { closed = root.sessionStorage?.getItem(LEGEND_KEY) === '0'; } catch (error) { closed = false; }
            if (closed) return;
            const tt = text => api.tt(text);
            const box = document.createElement('div');
            box.className = 'rr-passage-legend';
            box.setAttribute('role', 'group');
            const head = document.createElement('div');
            head.className = 'rr-passage-legend-head';
            const title = document.createElement('span');
            title.className = 'rr-passage-legend-title';
            // The tick's own word, in the language the editor speaks now.
            const tick = document.getElementById('map-passage');
            title.textContent = document.querySelector('.map-passage span')?.textContent || (root.I18n && typeof root.I18n.t === 'function' ? root.I18n.t('workspace.passage') : 'Passage');
            box.setAttribute('aria-label', title.textContent);
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'rr-passage-legend-close';
            close.textContent = '×';
            close.title = tt('Close');
            close.setAttribute('aria-label', tt('Close'));
            close.setAttribute('data-rr-i18n-skip', '');
            close.addEventListener('click', () => {
                try { root.sessionStorage?.setItem(LEGEND_KEY, '0'); } catch (error) { /* a preference only */ }
                box.remove();
                state.legendBox = null; state.legendFor = -1;
                // The keyboard stays where the legend came from: the Passage tick.
                tick?.focus?.({ preventScroll: true });
            });
            head.append(title, close);
            box.appendChild(head);
            for (const [kind, word] of LEGEND) {
                const row = document.createElement('div');
                row.className = 'rr-passage-legend-row';
                const text = document.createElement('span');
                text.textContent = tt(word);
                row.append(this.swatch(kind), text);
                box.appendChild(row);
            }
            const bar = document.createElement('div');
            bar.className = 'rr-passage-legend-progress';
            bar.hidden = true;
            box.appendChild(bar);
            // The map's tools are under it: a press on the legend is the legend's alone.
            for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click', 'dblclick', 'wheel', 'contextmenu']) box.addEventListener(type, event => event.stopPropagation());
            // Over the legend the pointer is on no tile: the last tile's words go.
            box.addEventListener('pointerenter', () => this.hideLabels(state));
            layer.appendChild(box);
            state.legendNode = box;
        },

        /** The thin line under the legend while the map is still being worked out. */
        progress(state) {
            const bar = state.layer?.querySelector('.rr-passage-legend-progress');
            if (!bar) return;
            const field = state.field, left = field.left(), total = field.chunks.length;
            bar.hidden = !left;
            if (left) bar.style.setProperty('--rr-passage-done', String(Math.round((1 - left / total) * 100)) + '%');
        },

        hideLabels(state) {
            if (!state) return;
            state.hoverAt = null; state.hoverKey = ''; state.shown = false;
            for (const label of state.labels || []) label.hidden = true;
            if (state.list) state.list.hidden = true;
            if (state.outline) state.outline.parentNode.style.display = 'none';
            if (state.follow) cancelAnimationFrame(state.follow);
            state.follow = 0;
        },

        /** A cell's places with their sides, kept while the pointer stays on the cell and the field holds the same. */
        cellOf(state, x, y) {
            const kept = state.cellAt, field = state.field;
            if (kept && kept.x === x && kept.y === y && kept.field === field && kept.version === field.version) return kept.places;
            const places = field.cell(x, y);
            state.cellAt = { x, y, field, version: field.version, places };
            return places;
        },

        /**
         * The floor a ray comes down to under the roof it met, from `from` along it: `{ x, y, place,
         * places, height }` or null. Walked cell by cell to the first place somebody gets to whose
         * surface lies between the heights the ray enters and leaves a cell at. That place is the answer
         * only when it is the one the view draws through the roof (the highest of its cell, under cover).
         * The walk stays under that roof and inside its walls: it ends where the ray is over everything
         * a cell holds, in a cell nobody gets to (a wall), and under the ground.
         */
        through(state, ray, from) {
            const field = state.field, map = state.map, R = field.world, o = ray.origin, d = ray.direction;
            if (!(d.y < -1e-3)) return null;
            let t = Math.max(0, from) + 1e-3;
            let cx = Math.floor(o.x + d.x * t), cz = Math.floor(o.z + d.z * t);
            const stepX = d.x > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1;
            const perX = d.x !== 0 ? Math.abs(1 / d.x) : Infinity, perZ = d.z !== 0 ? Math.abs(1 / d.z) : Infinity;
            let nextX = d.x !== 0 ? ((d.x > 0 ? cx + 1 : cx) - o.x) / d.x : Infinity;
            let nextZ = d.z !== 0 ? ((d.z > 0 ? cz + 1 : cz) - o.z) / d.z : Infinity;
            for (let step = 0; step < THROUGH_CELLS; step++) {
                const leave = Math.min(nextX, nextZ), enter = o.y + d.y * t, exit = leave === Infinity ? -Infinity : o.y + d.y * leave;
                const chunk = field.chunkOf(cx, cz);
                if (!chunk) return null;
                const cell = (cz - chunk.y0) * chunk.cw + (cx - chunk.x0), first = chunk.start[cell], last = chunk.start[cell + 1] - 1;
                // Past the cell where the roof was met, a ray over everything a cell holds is out from under the roof.
                if (step > 0 && (last < first || enter > chunk.top[last] + ON)) return null;
                let highest = true, any = false;
                for (let p = last; p >= first; p--) {
                    if (!shown(chunk.flags[p])) continue;
                    any = true;
                    // A slope is met somewhere along its rise, not only at its middle.
                    const level = chunk.draw[p], slack = chunk.flags[p] & SLOPED ? 0.55 : 0.05;
                    if (level > enter + slack || level < exit - slack) { highest = false; continue; }
                    if (!highest || !(chunk.flags[p] & COVERED)) return null;
                    const places = this.cellOf(state, cx, cz), place = places.find(entry => Math.abs(entry.top - chunk.top[p]) < 1e-4);
                    if (place) return { x: cx, y: cz, place, places, height: level, nobody: false, why: '' };
                }
                if (leave === Infinity || (step > 0 && !any)) return null;
                if (R && R.elevationAt && exit < R.elevationAt(map, cx, cz) + (R.terrainHeightAt ? R.terrainHeightAt(map, o.x + d.x * leave, o.z + d.z * leave) : 0) - 0.05) return null;
                t = leave;
                if (nextX < nextZ) { cx += stepX; nextX += perX; } else { cz += stepZ; nextZ += perZ; }
            }
            return null;
        },

        /**
         * What the pointer is on, as `{ x, y, place, places, height, nobody, why }`: always the cell its
         * ray met, so the words are about the thing pointed at.
         *
         * On a place somebody gets to (the ground, a floor, a stair, a bridge), that place. On water, the
         * place where the ray comes down through the surface (the view's own pick, `tile.level`): the
         * marks lie there. On a roof seen from steeply above, the floor whose marks show through it at
         * the pointer (`through`). On any other roof, a wall's face or a post, the place of the cell met
         * that lies within a storey under the point met (else over it): the floor under that piece of
         * roof, the foot of that wall. And with no such place, `nobody` with `why`, said at the pointer:
         * the reason of the place met or of one near it, "unreached" for one a body could stand on that
         * nothing leads to (a roof, a tower's top), "edge" for the side of something solid.
         */
        pick(editor, state, tile) {
            const map = state.map, R = root.Reactor3D;
            const inside = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height;
            const off = (place, height) => Math.min(Math.abs(place.top - height), Math.abs(place.draw - height));
            const answer = (x, y, height) => {
                const places = this.cellOf(state, x, y);
                if (!places.length) return null;
                let met = null, under = null, near = null, below = null;
                for (const place of places) {
                    if (!met || off(place, height) < off(met, height)) met = place;
                    if (!place.reached) { if (place.top <= height + ON) below = place; continue; }
                    if (off(place, height) > STOREY) continue;
                    if (place.draw <= height + ON && (!under || place.draw > under.draw)) under = place;
                    if (!near || off(place, height) < off(near, height)) near = place;
                }
                const on = off(met, height) <= ON;
                if (on && met.reached) return { x, y, place: met, places, height, nobody: false, why: '', on: true };
                if (under || near) return { x, y, place: under || near, places, height, nobody: false, why: '', on: false };
                // Nobody stands where the pointer is. The place met says why, or one near the pointer (a fence's rail
                // from its foot), or the one under it; the side of something tall with none of those is in the way itself.
                const said = !met.reached && (on || off(met, height) <= APART) ? met : below;
                if (!said) return { x, y, place: met, places, height, nobody: true, why: 'edge', on: false };
                return { x, y, place: said, places, height, nobody: true, why: said.why ? WHY[said.why] : 'unreached', on: false };
            };
            const hit = editor.raycastMapMeshes?.(), ray = editor._raycaster && editor._raycaster.ray;
            if (tile && Number.isFinite(tile.level) && inside(tile.x, tile.y)) {
                const found = answer(tile.x, tile.y, tile.level);
                if (found) return found;
            }
            if (hit && ray) {
                const x = Math.floor(hit.point.x + ray.direction.x * 1e-3), y = Math.floor(hit.point.z + ray.direction.z * 1e-3);
                if (inside(x, y)) {
                    const found = answer(x, y, hit.point.y);
                    if (found && !found.on && ray.direction.y <= -THROUGH_FROM) {
                        const faceUp = editor.constructor && editor.constructor.faceUp;
                        if (typeof faceUp === 'function' && faceUp(hit.object, hit.triangle) >= FACE_UP) {
                            const floor = this.through(state, ray, hit.distance);
                            if (floor) return floor;
                        }
                    }
                    if (found) return found;
                }
            }
            if (!tile || !inside(tile.x, tile.y)) return null;
            const ground = R && R.elevationAt ? R.elevationAt(map, tile.x, tile.y) + (R.terrainHeightAt ? R.terrainHeightAt(map, tile.x + 0.5, tile.y + 0.5) : 0) : 0;
            return answer(tile.x, tile.y, ground + (Number(tile.lift) || 0));
        },

        /** Write the labels for the place under the pointer. `again` asks from where the pointer last was. */
        hover(editor, clientX, clientY, tile, again) {
            const state = editor && editor._passage3d;
            if (!state || !state.active || !state.field || !state.labels) return;
            // A change made in the Database since the rules were read: they are read again before anything is said.
            if (this.generation() !== state.database) { this.rejudge(editor, state); if (!state.active) return; }
            if (again) tile = editor.tileAt?.(clientX, clientY) || null;
            const found = this.pick(editor, state, tile);
            if (!found || !found.place) { this.hideLabels(state); return; }
            const spot = state.hoverSpot || (state.hoverSpot = { x: 0, y: 0 });
            spot.x = clientX; spot.y = clientY;
            state.hoverAt = spot;
            const { x, y, place } = found;
            // A tile nobody gets to stand on says so, and why, on the place itself or (the side of a wall, whose
            // only place is its top) at the pointer; a place says what each of its sides does.
            const level = found.nobody && Math.abs(place.draw - found.height) > APART ? Math.round(found.height * 4) / 4 : place.draw;
            const key = `${x},${y},${place.top.toFixed(2)},${level.toFixed(2)},${found.nobody ? found.why : ''},${state.field.version}`;
            if (key !== state.hoverKey) {
                state.hoverKey = key;
                const tt = text => api.tt(text), words = [];
                if (found.nobody) words.push({ text: api.noStandText(found.why, tt), kind: 'blocked', wx: x + 0.5, wz: y + 0.5 });
                else for (const side of place.sides) words.push({ text: api.label(side, tt), kind: side.option.kind, wx: x + 0.5 + side.dx * 0.42, wz: y + 0.5 + side.dy * 0.42 });
                // The corners of the place, each at its own height: a stair's outline climbs with it.
                const R = root.Reactor3D, sloped = !found.nobody && (place.flags & SLOPED) && !(place.flags & WET) && state.field.physics && R && R.groundHeightAt;
                const corners = [[0.02, 0.02], [0.98, 0.02], [0.98, 0.98], [0.02, 0.98]].map(([u, v]) => [x + u, (sloped ? R.groundHeightAt(state.map, x + u, y + v, place.top) : level) + 0.05, y + v]);
                state.hoverWorld = { x: x + 0.5, y: level + 0.15, z: y + 0.5, words, corners };
                const several = words.length > 1;
                state.labels.forEach((label, i) => {
                    const word = words[i];
                    label.hidden = !word;
                    if (!word) return;
                    label.textContent = word.text;
                    label.className = 'rr-passage-label is-' + word.kind;
                    label.style.visibility = 'hidden';
                });
                state.list.hidden = !several;
                state.list.style.visibility = 'hidden';
                if (several) state.rows.forEach((entry, i) => { entry.text.textContent = words[i].text; entry.row.className = 'rr-passage-list-row is-' + words[i].kind; entry.shown = -2; });
                state.sized = false;
            }
            state.shown = true;
            this.place(editor, state);
            this.follow(editor, state);
        },

        /**
         * Put the words on the screen: a label at each side of the place, opening away from it, kept
         * inside the view; or, where those would lie over one another or over the legend (a place small
         * on the screen, or at the view's edge), one label of four rows beside the place, each row led by
         * an arrow pointing the way its side lies.
         */
        place(editor, state) {
            const world = state.hoverWorld, camera = editor.camera, layer = state.layer;
            if (!world || !camera || !layer) return;
            const width = layer.clientWidth, height = layer.clientHeight, words = world.words, labels = state.labels, list = state.list;
            if (!state.sized) {
                // A label's size is read once for what it says, never while it is being moved.
                for (let i = 0; i < words.length; i++) { labels[i].wide = labels[i].offsetWidth; labels[i].tall = labels[i].offsetHeight; }
                if (words.length > 1) { for (const entry of state.rows) entry.way.textContent = ARROWS[0]; list.wide = list.offsetWidth; list.tall = list.offsetHeight; for (const entry of state.rows) entry.shown = 0; }
                state.sized = true;
            }
            if (state.legendFor !== width * 8192 + height) {
                const node = state.legendNode && state.legendNode.isConnected ? state.legendNode : null;
                state.legendBox = node ? [node.offsetLeft, node.offsetTop, node.offsetWidth, node.offsetHeight] : null;
                state.legendFor = width * 8192 + height;
            }
            const legend = state.legendBox, right = width - EDGE[2], bottom = height - EDGE[3];
            const point = state.point || (state.point = new THREE.Vector3());
            const boxes = state.boxes || (state.boxes = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
            const onScreen = (wx, wy, wz) => { point.set(wx, wy, wz).project(camera); return !(point.z > 1 || point.z < -1); };
            let seen = onScreen(world.x, world.y, world.z), crowded = false;
            const mx = (point.x + 1) / 2 * width, my = (1 - point.y) / 2 * height;
            for (let i = 0; seen && i < words.length; i++) {
                const word = words[i], box = boxes[i], wide = labels[i].wide, tall = labels[i].tall;
                if (!onScreen(word.wx, world.y, word.wz)) { seen = false; break; }
                const ax = (point.x + 1) / 2 * width, ay = (1 - point.y) / 2 * height, dx = ax - mx, dy = ay - my;
                const middle = Math.abs(dx) < 2 && Math.abs(dy) < 2, across = Math.abs(dx) >= Math.abs(dy) * 0.8;
                const x = middle || !across ? ax - wide / 2 : dx > 0 ? ax : ax - wide, y = middle || across ? ay - tall / 2 : dy > 0 ? ay : ay - tall;
                box[0] = Math.max(EDGE[0], Math.min(right - wide, x)); box[1] = Math.max(EDGE[1], Math.min(bottom - tall, y)); box[2] = wide; box[3] = tall;
                word.way = middle ? 0 : (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
                if (legend && overlap(box, legend)) crowded = true;
                for (let j = 0; j < i && !crowded; j++) if (overlap(box, boxes[j])) crowded = true;
            }
            const listed = seen && crowded && words.length > 1;
            if (seen && crowded && !listed) {
                // The one label of a tile nobody stands on, under the legend: beside it, else below it.
                const box = boxes[0], beside = legend[0] + legend[2] + 6 + box[2] <= right ? legend[0] + legend[2] + 6 : legend[0] - 6 - box[2];
                if (beside >= EDGE[0]) box[0] = beside; else box[1] = Math.min(bottom - box[3], legend[1] + legend[3] + 6);
            }
            for (let i = 0; i < labels.length; i++) {
                const show = seen && !listed && i < words.length;
                labels[i].style.visibility = show ? 'visible' : 'hidden';
                if (show) labels[i].style.transform = `translate(${Math.round(boxes[i][0])}px, ${Math.round(boxes[i][1])}px)`;
            }
            list.style.visibility = listed ? 'visible' : 'hidden';
            if (listed) {
                for (let i = 0; i < words.length; i++) { const entry = state.rows[i]; if (entry.shown !== words[i].way) { entry.shown = words[i].way; entry.way.textContent = ARROWS[words[i].way]; } }
                // Beside the place, on the side with room, clear of the legend.
                const box = boxes[0], gap = 22;
                box[2] = list.wide; box[3] = list.tall;
                let chosen = false;
                for (let corner = 0; corner < 4 && !chosen; corner++) {
                    box[0] = corner & 1 ? mx - gap - box[2] : mx + gap; box[1] = corner & 2 ? my - gap - box[3] : my + gap;
                    chosen = box[0] >= EDGE[0] && box[1] >= EDGE[1] && box[0] + box[2] <= right && box[1] + box[3] <= bottom && !(legend && overlap(box, legend));
                }
                if (!chosen && legend) {
                    // A place under the legend itself: beside the legend, else below it.
                    box[1] = Math.max(EDGE[1], Math.min(bottom - box[3], my - box[3] / 2));
                    box[0] = legend[0] + legend[2] + 6;
                    if (box[0] + box[2] > right) box[0] = legend[0] - 6 - box[2];
                    chosen = box[0] >= EDGE[0];
                    if (!chosen) { box[0] = Math.max(EDGE[0], Math.min(right - box[2], mx - box[2] / 2)); box[1] = legend[1] + legend[3] + 6; chosen = box[1] + box[3] <= bottom; }
                }
                if (!chosen) { box[0] = Math.max(EDGE[0], Math.min(right - box[2], mx + gap)); box[1] = Math.max(EDGE[1], Math.min(bottom - box[3], my + gap)); }
                list.style.transform = `translate(${Math.round(box[0])}px, ${Math.round(box[1])}px)`;
            }
            let ring = '';
            for (const [wx, wy, wz] of world.corners) {
                if (!onScreen(wx, wy, wz)) { ring = ''; break; }
                ring += (ring ? ' ' : '') + ((point.x + 1) / 2 * width).toFixed(1) + ',' + ((1 - point.y) / 2 * height).toFixed(1);
            }
            state.outline.parentNode.style.display = ring ? '' : 'none';
            if (ring) state.outline.setAttribute('points', ring);
            const kept = state.cameraSeen || (state.cameraSeen = new Float32Array(16));
            kept.set(camera.matrixWorld.elements);
        },

        /** While labels show, keep them on their tile as the view turns, zooms or flies: one look at the camera a frame. */
        follow(editor, state) {
            if (state.follow) return;
            const tick = state.tick || (state.tick = () => {
                state.follow = 0;
                if (!state.active || !state.shown || !state.hoverWorld || !editor.camera) return;
                const now = editor.camera.matrixWorld.elements, seen = state.cameraSeen;
                let moved = !seen;
                for (let i = 0; i < 16 && !moved; i++) if (Math.abs(now[i] - seen[i]) > 1e-5) moved = true;
                if (moved) this.place(editor, state);
                state.follow = requestAnimationFrame(tick);
            });
            state.follow = requestAnimationFrame(tick);
        }
    };

    api.Field = Field;
    api.marks = marks;
    api.passage = passage;
    api.FLAGS = { STAND, SEED, REACHED, SWIM, WET, SLOPED, WALKED, COVERED };
    root.RRMapEdgeLabels = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
