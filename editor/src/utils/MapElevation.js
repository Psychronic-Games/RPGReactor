/**
 * A map's height field: the massing of a 3D map, painted rather than inferred.
 *
 * The 3D view shipped by working out what stands up from the 2D map — which
 * tiles are impassable, which draw above characters. That is a good first
 * guess and a bad final answer, because a guess cannot be corrected. Elevation
 * is the other half: how *high* each cell stands, said outright.
 *
 * It lives in `Map###.r3d.json` beside the map, never in `Map###.json`, so a
 * map remains ordinary RPG Maker data that the engine, the plugins and RPG
 * Maker itself all read unchanged. A 2D map never gains the file at all.
 *
 * The array is `width * height` whole tiles, matching `Reactor3D.elevationAt`.
 */
(function(root) {
    'use strict';

    const SUFFIX = '.r3d.json';
    const VERSION = 1;
    const MODE_3D = '3d';

    // Twenty tiles is about a six-storey building at RPG Maker's scale, and far
    // past anything the camera can frame. The ceiling exists so a stuck key or
    // a bad drag cannot write a spike a thousand tiles high into a project.
    const MAX = 100;
    const MIN = 0;

    const clamp = value => {
        const level = Math.round(Number(value));
        if (!Number.isFinite(level)) return MIN;
        return Math.max(MIN, Math.min(MAX, level));
    };

    const fileNameFor = mapId => `Map${String(mapId).padStart(3, '0')}${SUFFIX}`;

    /**
     * The sidecar for a map, created in memory if it has none.
     *
     * Creating it here does not write anything: a map only gains a file when
     * something is actually painted and saved.
     */
    const ensure = mapData => {
        if (!mapData || !mapData.width || !mapData.height) return null;
        const plane = mapData.width * mapData.height;
        let sidecar = mapData.reactor3d;
        if (!sidecar || typeof sidecar !== 'object') {
            sidecar = { version: VERSION, mode: MODE_3D };
            mapData.reactor3d = sidecar;
        }
        if (!Array.isArray(sidecar.elevation) || sidecar.elevation.length !== plane) {
            // A resized map keeps what it can: the cells that still exist hold
            // their height, and new ground starts at zero.
            const previous = Array.isArray(sidecar.elevation) ? sidecar.elevation : null;
            const grown = new Array(plane).fill(MIN);
            if (previous && sidecar.width && sidecar.height) {
                for (let y = 0; y < Math.min(sidecar.height, mapData.height); y++) {
                    for (let x = 0; x < Math.min(sidecar.width, mapData.width); x++) {
                        grown[y * mapData.width + x] = clamp(previous[y * sidecar.width + x]);
                    }
                }
            }
            sidecar.elevation = grown;
        }
        // The terrain grid moves with the same resize, from the width it was
        // made for; done here, before the recorded width advances, so a map
        // made larger keeps every hill it had.
        if (Array.isArray(sidecar.terrain) && sidecar.terrain.length !== (mapData.width + 1) * (mapData.height + 1)) {
            const oldWidth = Number(sidecar.terrainWidth) > 0 ? Number(sidecar.terrainWidth) : Number(sidecar.width) || 0;
            sidecar.terrain = regrowTerrain(mapData, sidecar.terrain, oldWidth);
            sidecar.terrainWidth = mapData.width;
        }
        sidecar.width = mapData.width;
        sidecar.height = mapData.height;
        return sidecar;
    };

    const at = (mapData, x, y) => {
        const sidecar = mapData && mapData.reactor3d;
        const heights = sidecar && sidecar.elevation;
        if (!Array.isArray(heights)) return MIN;
        if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) return MIN;
        const value = heights[y * mapData.width + x];
        return Number.isFinite(value) ? value : MIN;
    };

    /** Set one cell, reporting whether it moved. */
    const setAt = (mapData, x, y, level) => {
        const sidecar = ensure(mapData);
        if (!sidecar) return false;
        if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) return false;
        const index = y * mapData.width + x;
        const value = clamp(level);
        if (sidecar.elevation[index] === value) return false;
        sidecar.elevation[index] = value;
        return true;
    };

    /** Raise or lower one cell by `delta`, reporting whether it moved. */
    const raiseAt = (mapData, x, y, delta) =>
        setAt(mapData, x, y, at(mapData, x, y) + delta);

    const snapshot = mapData => {
        const sidecar = mapData && mapData.reactor3d;
        return Array.isArray(sidecar && sidecar.elevation) ? sidecar.elevation.slice() : null;
    };

    /**
     * Put a snapshot back.
     *
     * A snapshot only fits the map it was taken from — Map Properties can
     * resize a map between a stroke and its undo — so one of the wrong length
     * is refused rather than written, which would leave a sidecar that
     * disagrees with its own map about how big it is.
     */
    const restore = (mapData, heights) => {
        if (!mapData || !Array.isArray(heights)) return false;
        if (heights.length !== mapData.width * mapData.height) return false;
        const sidecar = ensure(mapData);
        if (!sidecar) return false;
        sidecar.elevation = heights.slice();
        return true;
    };

    /** Whether anything has been painted, which decides if a file is written. */
    const isFlat = mapData => {
        const heights = snapshot(mapData);
        return (!heights || heights.every(value => !value)) && !hasTerrain(mapData);
    };

    /*
     * Terrain: a fractional height at every tile corner, `(width+1)*(height+1)`
     * of them, on top of the whole-tile elevation. The runtime bends the map's
     * meshes through it (`Reactor3D.displaceByTerrain`) and stands characters
     * on it (`groundHeightAt`). Absent until painted.
     */
    const TERRAIN_MAX = 60;
    const TERRAIN_MODES = ['raise', 'lower', 'smooth', 'flatten'];
    const terrainSize = mapData => (mapData.width + 1) * (mapData.height + 1);

    /**
     * Fit a terrain grid to the map's current size, keeping every corner
     * that still exists. `oldWidth` is the width the grid was made for:
     * `terrainWidth` when the sidecar recorded it, else the elevation's own
     * recorded width, which the same resize moved. A map made larger keeps
     * its hills; a map made smaller keeps the hills that fit.
     */
    function regrowTerrain(mapData, grid, oldWidth) {
        const size = terrainSize(mapData);
        const grown = new Array(size).fill(0);
        const oldStride = oldWidth > 0 ? oldWidth + 1 : 0;
        if (Array.isArray(grid) && oldStride && grid.length % oldStride === 0) {
            const rows = Math.min(grid.length / oldStride, mapData.height + 1);
            const cols = Math.min(oldStride, mapData.width + 1);
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) grown[y * (mapData.width + 1) + x] = Number(grid[y * oldStride + x]) || 0;
            }
        }
        return grown;
    }

    /** The grid, fitted to the map on the way out if a resize left it the old size. */
    const terrain = mapData => {
        const sidecar = mapData && mapData.reactor3d;
        const grid = sidecar && sidecar.terrain;
        if (!Array.isArray(grid)) return null;
        if (grid.length !== terrainSize(mapData)) {
            const oldWidth = Number(sidecar.terrainWidth) > 0 ? Number(sidecar.terrainWidth) : Number(sidecar.width) || 0;
            sidecar.terrain = regrowTerrain(mapData, grid, oldWidth);
            sidecar.terrainWidth = mapData.width;
        }
        return sidecar.terrain;
    };

    const hasTerrain = mapData => {
        const grid = terrain(mapData);
        return !!grid && grid.some(value => value);
    };

    /** The corner grid, created flat if the map has none; resized like the elevation. */
    const ensureTerrain = mapData => {
        const sidecar = ensure(mapData);
        if (!sidecar) return null;
        const size = terrainSize(mapData);
        if (!Array.isArray(sidecar.terrain)) sidecar.terrain = new Array(size).fill(0);
        else if (sidecar.terrain.length !== size) terrain(mapData);
        sidecar.terrainWidth = mapData.width;
        return sidecar.terrain;
    };

    const terrainAt = (mapData, cx, cy) => {
        const grid = terrain(mapData);
        if (!grid || cx < 0 || cy < 0 || cx > mapData.width || cy > mapData.height) return 0;
        return Number(grid[cy * (mapData.width + 1) + cx]) || 0;
    };

    /**
     * One dab of the brush at a world point (`x`, `y` in tiles, corner space:
     * corner `i` stands at world `i`). Raise and lower move every corner within
     * `radius` by `strength` scaled by a soft falloff; smooth pulls each
     * corner towards the mean of its neighbours; flatten pulls towards
     * `reference`, the height under the stroke's first touch. Returns whether
     * anything moved.
     */
    // Dunes: long ridges across the wind, a gentle rise on the windward side and a
    // steeper slip face on the lee. `size` is a ridge to the next in tiles, `height`
    // a crest above its trough, `dir` where the wind blows toward (degrees, 0 east,
    // 90 south, as the foliage's wind), `seed` which field. Walkable keeps the slip
    // face under the slope characters climb.
    const DUNE_LEE = 0.3, DUNE_WALK_SLOPE = 0.55;
    const DUNE_DEFAULT = { dir: 30, size: 10, height: 1.6, seed: 1, walkable: true };
    const duneNoise = (x, seed) => {
        const hash = n => { const v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return v - Math.floor(v); };
        const i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f);
        return hash(i) * (1 - t) + hash(i + 1) * t;
    };
    const duneSettings = (options = {}) => {
        const number = (value, fallback, min, max) => { const n = Number(value); return value === null || value === '' || value === undefined || !Number.isFinite(n) ? fallback : Math.max(min, Math.min(max, n)); };
        const size = number(options.size, DUNE_DEFAULT.size, 4, 40), walkable = options.walkable !== false;
        const height = Math.min(number(options.height, DUNE_DEFAULT.height, 0.1, 12), walkable ? DUNE_WALK_SLOPE * DUNE_LEE * size : 12);
        return { dir: number(options.dir, DUNE_DEFAULT.dir, -360, 720), size, height, seed: Math.round(number(options.seed, DUNE_DEFAULT.seed, 0, 99999)), walkable };
    };
    /** A dune field's height over its troughs at a point (tiles), 0 to `height`. */
    const duneHeightAt = (x, y, options = {}) => {
        const d = duneSettings(options), a = d.dir * Math.PI / 180;
        const u = x * Math.cos(a) + y * Math.sin(a), v = -x * Math.sin(a) + y * Math.cos(a);
        // Crests wander across the wind and each ridge is its own height along its length.
        const phase = (u + (duneNoise(v / (d.size * 1.7), d.seed) - 0.5) * d.size * 0.9 + (duneNoise(v / (d.size * 0.6), d.seed + 7) - 0.5) * d.size * 0.25) / d.size;
        const ridge = Math.floor(phase), t = phase - ridge;
        const rise = t < 1 - DUNE_LEE ? t / (1 - DUNE_LEE) : (1 - t) / DUNE_LEE;
        const tall = 0.6 + 0.4 * duneNoise(v / (d.size * 1.3) + ridge * 17.3, d.seed + 3);
        // Rounded at the crest and in the trough, straight between.
        const shaped = rise * rise * (3 - 2 * rise) * 0.5 + rise * 0.5;
        return d.height * tall * shaped;
    };

    /** The steepest bank Lower digs, in tiles of fall per tile: under the runtime's walk limit (Reactor3D.TERRAIN_SLOPE_LIMIT, 0.75), so it is walked into. */
    const LOWER_BANK_SLOPE = 0.7;
    const paintTerrain = (mapData, x, y, options = {}) => {
        const grid = ensureTerrain(mapData);
        if (!grid) return false;
        const mode = options.mode === 'dunes' ? 'dunes' : TERRAIN_MODES.includes(options.mode) ? options.mode : 'raise';
        const radius = Math.max(0.5, Math.min(64, Number(options.radius) || 3));
        const strength = Math.max(0.01, Math.min(4, Number(options.strength) || 0.25));
        const stride = mapData.width + 1;
        const x0 = Math.max(0, Math.floor(x - radius)), x1 = Math.min(mapData.width, Math.ceil(x + radius));
        const y0 = Math.max(0, Math.floor(y - radius)), y1 = Math.min(mapData.height, Math.ceil(y + radius));
        const before = mode === 'smooth' || mode === 'lower' ? grid.slice() : null;
        // Lower keeps the banks it digs walkable: a corner sinks no further than LOWER_BANK_SLOPE below any
        // corner beside it, so a pit deepens only as far as the brush is wide and is always walked into.
        const bankFloor = (cx, cy) => {
            let top = -Infinity;
            if (cx > 0) top = Math.max(top, Number(before[cy * stride + cx - 1]) || 0);
            if (cx < mapData.width) top = Math.max(top, Number(before[cy * stride + cx + 1]) || 0);
            if (cy > 0) top = Math.max(top, Number(before[(cy - 1) * stride + cx]) || 0);
            if (cy < mapData.height) top = Math.max(top, Number(before[(cy + 1) * stride + cx]) || 0);
            return top - LOWER_BANK_SLOPE;
        };
        let changed = false;
        for (let cy = y0; cy <= y1; cy++) {
            for (let cx = x0; cx <= x1; cx++) {
                const distance = Math.hypot(cx - x, cy - y);
                if (distance > radius) continue;
                const t = 1 - distance / radius;
                const falloff = t * t * (3 - 2 * t);
                const index = cy * stride + cx;
                const current = Number(grid[index]) || 0;
                let next = current;
                if (mode === 'raise') next = current + strength * falloff;
                else if (mode === 'lower') next = Math.min(current, Math.max(current - strength * falloff, bankFloor(cx, cy)));
                else if (mode === 'smooth') {
                    let sum = 0, count = 0;
                    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx > mapData.width || ny > mapData.height) continue;
                        sum += Number(before[ny * stride + nx]) || 0; count++;
                    }
                    next = current + ((sum / count) - current) * Math.min(1, strength * 2) * falloff;
                } else if (mode === 'dunes') {
                    // Toward the field laid on the ground as the stroke found it (`base`), else on the level under the first touch.
                    const under = options.base && options.base.length === grid.length ? Number(options.base[index]) || 0 : Number(options.reference) || 0;
                    next = current + (under + duneHeightAt(cx, cy, options.dunes) - current) * Math.min(1, strength * 2) * falloff;
                } else {
                    const reference = Number(options.reference) || 0;
                    next = current + (reference - current) * Math.min(1, strength * 2) * falloff;
                }
                next = Math.max(-TERRAIN_MAX, Math.min(TERRAIN_MAX, Math.round(next * 1000) / 1000));
                if (next !== current) { grid[index] = next; changed = true; }
            }
        }
        // A vertex between two corners samples both, so the tiles either
        // side of the touched corners move as well; that is the region the
        // 3D view re-lifts in place.
        return changed ? { x0: Math.max(0, x0 - 1), x1: Math.min(mapData.width, x1 + 1), z0: Math.max(0, y0 - 1), z1: Math.min(mapData.height, y1 + 1) } : false;
    };

    /** The terrain's rise at a world point, bilinear over its corners; what the runtime asks. */
    const terrainHeightAt = (mapData, wx, wz) => {
        const grid = terrain(mapData);
        if (!grid) return 0;
        const width = mapData.width, height = mapData.height;
        const gx = Math.max(0, Math.min(width, wx)), gz = Math.max(0, Math.min(height, wz));
        const x0 = Math.min(width - 1, Math.floor(gx)), z0 = Math.min(height - 1, Math.floor(gz));
        const fx = gx - x0, fz = gz - z0, stride = width + 1;
        const h = i => Number(grid[i]) || 0;
        return (h(z0 * stride + x0) * (1 - fx) + h(z0 * stride + x0 + 1) * fx) * (1 - fz)
            + (h((z0 + 1) * stride + x0) * (1 - fx) + h((z0 + 1) * stride + x0 + 1) * fx) * fz;
    };

    const terrainSnapshot = mapData => {
        const grid = terrain(mapData);
        return grid ? grid.slice() : null;
    };

    const restoreTerrain = (mapData, saved) => {
        const sidecar = mapData && mapData.reactor3d;
        if (!sidecar) return false;
        if (!saved) { delete sidecar.terrain; delete sidecar.terrainWidth; return true; }
        sidecar.terrain = saved.slice();
        sidecar.terrainWidth = mapData.width;
        return true;
    };

    /**
     * Undo or redo one terrain edit: every corner the edit moved (where
     * `from`, the grid on the far side of it, differs from `to`) takes its
     * `to` height, and every other corner keeps what it holds now, so a
     * later edit elsewhere (a building's levelled pad) stays. Null is flat
     * ground. A grid of another size (the map was resized) goes back whole.
     */
    const restoreTerrainChanges = (mapData, from, to) => {
        const size = terrainSize(mapData);
        if ((from && from.length !== size) || (to && to.length !== size)) return restoreTerrain(mapData, to);
        const grid = ensureTerrain(mapData);
        if (!grid) return false;
        for (let i = 0; i < size; i++) {
            const before = from ? Number(from[i]) || 0 : 0, after = to ? Number(to[i]) || 0 : 0;
            if (before !== after) grid[i] = after;
        }
        if (!hasTerrain(mapData)) clearTerrain(mapData);
        return true;
    };

    /** Forget the terrain entirely: the map is its elevation again. */
    const clearTerrain = mapData => {
        const sidecar = mapData && mapData.reactor3d;
        if (!sidecar || !sidecar.terrain) return false;
        delete sidecar.terrain; delete sidecar.terrainWidth;
        return true;
    };

    /**
     * Write the sidecar, or remove it when the map has been flattened again.
     *
     * A 2D project must not accumulate files full of zeroes, and an author who
     * clears a map's elevation should not be left with a stale one that says
     * the map is 3D.
     */
    const save = (fs, path, projectPath, mapData, options = {}) => {
        if (!fs || !path || !projectPath || !mapData || !mapData.id) return false;
        const filePath = path.join(projectPath, 'data', fileNameFor(mapData.id));
        const writeAtomic = options.writeFileAtomicSync
            || (typeof root.RRWriteFileAtomicSync === 'function' ? root.RRWriteFileAtomicSync : null);

        // Height is not the only thing the sidecar carries. A map whose ground
        // is flat but whose buildings have been grouped into 3D objects still
        // needs its file, or the grouping is thrown away on every save.
        const sidecar3d = mapData.reactor3d;
        const grouped = !!(sidecar3d && sidecar3d.objects
            && Object.keys(sidecar3d.objects).some(layer =>
                Array.isArray(sidecar3d.objects[layer])
                && sidecar3d.objects[layer].some(value => value)));
        const modeled = !!(sidecar3d && sidecar3d.events
            && Object.keys(sidecar3d.events).some(id => {
                const pages = sidecar3d.events[id];
                return pages && typeof pages === 'object'
                    && Object.keys(pages).some(page => pages[page] && pages[page].name);
            }));
        const lifted = Object.values(sidecar3d?.eventZ || {}).some(value => Number.isFinite(Number(value)) && Number(value) > 0);
        const previewed = !!(sidecar3d && sidecar3d.eventPreviews
            && Object.keys(sidecar3d.eventPreviews).length);
        const roomed = !!(sidecar3d && sidecar3d.room);
        const propped = !!(sidecar3d && Array.isArray(sidecar3d.props) && sidecar3d.props.length);
        const built = !!(sidecar3d && ((Array.isArray(sidecar3d.pieces) && sidecar3d.pieces.length) || (Array.isArray(sidecar3d.structures) && sidecar3d.structures.length) || (Array.isArray(sidecar3d.water) && sidecar3d.water.length)));
        const lit = !!(sidecar3d && ((Array.isArray(sidecar3d.lights) && sidecar3d.lights.length)
            || sidecar3d.lighting));
        const media = Array.isArray(sidecar3d?.mediaSurfaces) && sidecar3d.mediaSurfaces.length > 0;
        // Events sized over several tiles, and the map's own gravity, jump and fall damage.
        const sized = !!(sidecar3d && sidecar3d.eventSize && typeof sidecar3d.eventSize === 'object' && Object.keys(sidecar3d.eventSize).length);
        const physical = !!(sidecar3d && sidecar3d.physics && typeof sidecar3d.physics === 'object' && Object.keys(sidecar3d.physics).length);
        const planted = !!(sidecar3d && sidecar3d.foliage && typeof sidecar3d.foliage === 'object' && (sidecar3d.foliage.layers || sidecar3d.foliage.bushes));
        // Ground types painted over the floor, and the land past the border.
        const grounded = !!(sidecar3d && sidecar3d.ground && Array.isArray(sidecar3d.ground.types) && sidecar3d.ground.types.length);
        const bordered = !!(sidecar3d && sidecar3d.surround && typeof sidecar3d.surround === 'object');
        // A battle mode or start an older map keeps here, which the game still reads.
        const fought = !!(sidecar3d && sidecar3d.battle && typeof sidecar3d.battle === 'object' && Object.keys(sidecar3d.battle).length);
        if (isFlat(mapData) && !grouped && !media && !modeled && !lifted && !previewed && !roomed && !propped && !built && !lit && !sized && !physical && !planted
            && !grounded && !bordered && !fought && !(sidecar3d && sidecar3d.camera)) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return true;
        }
        const sidecar = ensure(mapData);
        if (!sidecar) return false;
        const json = api.stringifySidecar(sidecar);
        if (writeAtomic) writeAtomic(fs, filePath, json, 'utf8');
        else fs.writeFileSync(filePath, json, 'utf8');
        return true;
    };

    /*
     * The note is the switch; the sidecar is the data.
     *
     * The runtime only asks for `Map###.r3d.json` when the map's note carries
     * `<3d>` — which is what keeps a project with no 3D maps from issuing a
     * request per map for a file that is not there. So a map with a painted
     * height field and no note renders flat in game however much elevation it
     * has, and the sidecar's own `mode` never gets read, because nothing
     * fetched it. The note also survives a round trip through RPG Maker
     * itself, which the sidecar does not.
     */
    const NOTE_TAG = '<3d>';
    const NOTE_PATTERN = /<3d>/i;

    const hasNote = mapData => NOTE_PATTERN.test((mapData && mapData.note) || '');

    /** Mark the map 3D, reporting whether it needed marking. */
    const addNote = mapData => {
        if (!mapData || hasNote(mapData)) return false;
        const note = typeof mapData.note === 'string' ? mapData.note : '';
        mapData.note = note && !note.endsWith('\n') ? `${note}\n${NOTE_TAG}` : `${note}${NOTE_TAG}`;
        if (mapData.meta && typeof mapData.meta === 'object') mapData.meta['3d'] = true;
        return true;
    };

    const removeNote = mapData => {
        if (!mapData || !hasNote(mapData)) return false;
        mapData.note = String(mapData.note).replace(NOTE_PATTERN, '').replace(/\n{2,}/g, '\n').trim();
        if (mapData.meta && typeof mapData.meta === 'object') delete mapData.meta['3d'];
        return true;
    };

    /**
     * Mark the map 3D or flat, reporting whether anything changed.
     *
     * The note is what the runtime reads. A sidecar that had downgraded the
     * map to 2d is brought back up with the note, or the checkbox would tick
     * and the game stay flat.
     */
    const setMode3D = (mapData, enabled) => {
        if (!mapData) return false;
        let changed = enabled ? addNote(mapData) : removeNote(mapData);
        const sidecar = mapData.reactor3d;
        if (enabled && sidecar && typeof sidecar === 'object' && sidecar.mode !== MODE_3D) {
            sidecar.mode = MODE_3D;
            changed = true;
        }
        return changed;
    };

    /*
     * The room: a floor under the parallax, walls at the map's edge and a
     * ceiling `height` tiles up, each a parallax image. `reactor3d.room` is
     * only written when some piece has an image or the height was changed,
     * so an untouched 3D map does not gain a sidecar for a room it has not
     * been given.
     */
    const ROOM_DEFAULT_HEIGHT = 4;
    const ROOM_MIN_HEIGHT = 1;
    const ROOM_MAX_HEIGHT = 512;

    const clampRoomHeight = value => {
        const height = Math.round(Number(value));
        if (!Number.isFinite(height)) return ROOM_DEFAULT_HEIGHT;
        return Math.max(ROOM_MIN_HEIGHT, Math.min(ROOM_MAX_HEIGHT, height));
    };

    // Steep shaped ground turns to a cliff material: Rock unless the room names another ("" for none),
    // from `cliffSlope` degrees. Kept in the room only when it differs.
    const ROOM_CLIFF = 'Rock';
    const ROOM_CLIFF_SLOPE = 40;
    const clampCliffSlope = value => {
        const slope = Number(value);
        if (value === null || value === '' || !Number.isFinite(slope)) return ROOM_CLIFF_SLOPE;
        return Math.max(10, Math.min(80, Math.round(slope)));
    };

    const normalizeRoom = room => {
        const source = room && typeof room === 'object' ? room : {};
        const name = value => (typeof value === 'string' ? value.trim() : '');
        const cliff = typeof source.cliff === 'string' ? source.cliff.trim() : ROOM_CLIFF;
        const cliffSlope = clampCliffSlope(source.cliffSlope);
        const cliffTint = typeof source.cliffTint === 'string' && /^#[0-9a-f]{6}$/i.test(source.cliffTint) && source.cliffTint.toLowerCase() !== '#ffffff'
            ? source.cliffTint.toLowerCase() : '';
        // Image pixels a frame, to a thousandth: a whole pixel a frame is
        // already a brisk sky, and a slow one is a fraction of that.
        const scroll = value => {
            const number = Number(value);
            return Number.isFinite(number) ? Math.max(-32, Math.min(32, Math.round(number * 1000) / 1000)) : 0;
        };
        return {
            height: clampRoomHeight(source.height),
            floor: name(source.floor),
            walls: name(source.walls),
            ceiling: name(source.ceiling),
            // The sky: beyond the room, around the camera, drifting by
            // `skyScrollX/Y` image pixels a frame as a 2D parallax scrolls.
            sky: name(source.sky),
            skyScrollX: scroll(source.skyScrollX),
            skyScrollY: scroll(source.skyScrollY),
            ...(cliff !== ROOM_CLIFF ? { cliff } : {}),
            ...(cliffSlope !== ROOM_CLIFF_SLOPE ? { cliffSlope } : {}),
            ...(cliffTint ? { cliffTint } : {})
        };
    };

    /** The material a room's steep ground wears ('' for none) and the slope it starts at. */
    const roomCliff = room => ({
        name: room && typeof room.cliff === 'string' ? room.cliff : ROOM_CLIFF,
        slope: room && room.cliffSlope !== undefined ? clampCliffSlope(room.cliffSlope) : ROOM_CLIFF_SLOPE,
        tint: room && room.cliffTint ? room.cliffTint : ''
    });

    const isDefaultRoom = room =>
        !room.floor && !room.walls && !room.ceiling && !room.sky && !room.skyScrollX && !room.skyScrollY
        && room.height === ROOM_DEFAULT_HEIGHT && room.cliff === undefined && room.cliffSlope === undefined && room.cliffTint === undefined;

    /** The map's room, defaults filled in. */
    const room = mapData => normalizeRoom(mapData && mapData.reactor3d && mapData.reactor3d.room);

    /** Set the room, dropping it from the sidecar when it is all defaults. */
    const setRoom = (mapData, values) => {
        if (!mapData) return false;
        const next = normalizeRoom(values);
        const before = JSON.stringify(room(mapData));
        if (before === JSON.stringify(next)) return false;
        if (isDefaultRoom(next)) {
            if (mapData.reactor3d) delete mapData.reactor3d.room;
            return true;
        }
        const sidecar = ensure(mapData);
        if (!sidecar) return false;
        sidecar.room = next;
        return true;
    };

    /*
     * The map's default 3D camera: a mode plus optional pitch/yaw/distance/
     * fov overrides, mirroring `reactor_camera_3d.js`. `reactor3d.camera` is
     * only written when it says more than the default view.
     */
    const CAMERA_MODES = ['fixed', 'topDown', 'isometric', 'thirdPerson', 'firstPerson'];
    const CAMERA_LIMITS = { pitch: [-89, 89], yaw: [-360, 360], distance: [0.5, 1024], fov: [5, 150] };

    const cameraMode = value => {
        const key = String(value || '').toLowerCase().replace(/[\s_-]/g, '');
        return CAMERA_MODES.find(mode => mode.toLowerCase() === key) || CAMERA_MODES[0];
    };

    const cameraNumber = (value, range) => {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        if (!Number.isFinite(number)) return null;
        return Math.max(range[0], Math.min(range[1], number));
    };

    const normalizeCamera = values => {
        const source = values && typeof values === 'object' ? values : {};
        return {
            mode: cameraMode(source.mode),
            pitch: cameraNumber(source.pitch, CAMERA_LIMITS.pitch),
            yaw: cameraNumber(source.yaw, CAMERA_LIMITS.yaw),
            distance: cameraNumber(source.distance, CAMERA_LIMITS.distance),
            fov: cameraNumber(source.fov, CAMERA_LIMITS.fov)
        };
    };

    const isDefaultCamera = camera => camera.mode === CAMERA_MODES[0]
        && camera.pitch === null && camera.yaw === null && camera.distance === null && camera.fov === null;

    /** The map's default camera, defaults filled in. */
    const camera = mapData => normalizeCamera(mapData && mapData.reactor3d && mapData.reactor3d.camera);

    /** Set the default camera, dropping it from the sidecar when it is the stock view. */
    const setCamera = (mapData, values) => {
        if (!mapData) return false;
        const next = normalizeCamera(values);
        if (JSON.stringify(camera(mapData)) === JSON.stringify(next)) return false;
        if (isDefaultCamera(next)) {
            if (mapData.reactor3d) delete mapData.reactor3d.camera;
            return true;
        }
        const sidecar = ensure(mapData);
        if (!sidecar) return false;
        // Null overrides are left out so the file reads as what was chosen.
        const stored = { mode: next.mode };
        for (const key of ['pitch', 'yaw', 'distance', 'fov']) {
            if (next[key] !== null) stored[key] = next[key];
        }
        sidecar.camera = stored;
        return true;
    };

    /*
     * Model props: 3D models placed on the map from the palette, kept in
     * `reactor3d.props`. Position in tiles (fractional when placed in 3D),
     * `z` a lift off the ground in tiles, angles in degrees, `size` the
     * model's longest side in tiles, `direction` the facing (2/4/6/8) the
     * flat map draws. The runtime stands each one in the map as a
     * model-bound event, which is what gives it collision.
     */
    const PROP_MAX_LIFT = 512;
    const PROP_DIRECTIONS = [2, 4, 6, 8];

    /** A list of names from a list or a single field, each once, in order. */
    const names = (list, single) => {
        const source = Array.isArray(list) ? list : (single ? [single] : []);
        const out = [];
        for (const entry of source) {
            const name = entry == null ? '' : String(entry).trim();
            if (name && out.indexOf(name) < 0) out.push(name);
        }
        return out;
    };

    const normalizeProp = (raw, mapData) => {
        if (!raw || typeof raw !== 'object' || !raw.name) return null;
        const number = (value, fallback) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        };
        const width = mapData && mapData.width > 0 ? mapData.width : Infinity;
        const height = mapData && mapData.height > 0 ? mapData.height : Infinity;
        const direction = Number(raw.direction);
        const size = number(raw.size, 2);
        const scale = number(raw.scale, 1);
        const wrap = value => {
            let angle = number(value, 0) % 360;
            if (angle > 180) angle -= 360;
            if (angle < -180) angle += 360;
            return Math.round(angle * 10) / 10;
        };
        return {
            id: Math.max(1, Math.floor(number(raw.id, 1))),
            name: String(raw.name),
            ext: raw.ext ? String(raw.ext) : '',
            file: raw.file ? String(raw.file) : '',
            texture: raw.texture ? String(raw.texture) : '',
            // The model's variant; left out when it wears its own look.
            ...(typeof raw.variant === 'string' && raw.variant.trim() ? { variant: raw.variant.trim() } : {}),
            x: Math.round(Math.max(0, Math.min(width - 1, number(raw.x, 0))) * 100) / 100,
            y: Math.round(Math.max(0, Math.min(height - 1, number(raw.y, 0))) * 100) / 100,
            z: Math.round(Math.max(0, Math.min(PROP_MAX_LIFT, number(raw.z, 0))) * 100) / 100,
            yaw: wrap(raw.yaw),
            pitch: wrap(raw.pitch),
            roll: wrap(raw.roll),
            direction: PROP_DIRECTIONS.indexOf(direction) >= 0 ? direction : 2,
            // Per-axis stretch on top of the size; left out when it is 1 on every axis.
            ...(() => {
                const axes = Array.isArray(raw.stretch) ? raw.stretch : [];
                const stretch = [0, 1, 2].map(i => { const v = number(axes[i], 1); return v > 0 ? Math.round(v * 100) / 100 : 1; });
                return stretch.every(v => v === 1) ? {} : { stretch };
            })(),
            size: size > 0 ? Math.round(size * 100) / 100 : 2,
            scale: scale > 0 ? Math.round(scale * 1000) / 1000 : 1,
            passable: raw.passable === true || raw.passable === 'true',
            // Several animations play in order and several effects at once;
            // the singular fields stay as the first of each for older readers.
            animations: names(raw.animations, raw.animation),
            animation: names(raw.animations, raw.animation)[0] || '',
            repeat: raw.repeat === true || raw.repeat === 'true',
            ...(raw.animationSpeed == null || Number(raw.animationSpeed) === 100 ? {}
                : { animationSpeed: Math.max(1, Math.min(1000, number(raw.animationSpeed, 100))) }),
            effects: names(raw.effects, raw.effect),
            effect: names(raw.effects, raw.effect)[0] || '',
            // The stamped building it came with, so a re-stamp or a removal takes only its own.
            ...(Number(raw.structure) > 0 ? { structure: Math.floor(Number(raw.structure)) } : {})
        };
    };

    /** The map's props, validated, in sidecar order. */
    const props = mapData => {
        const sidecar = mapData && mapData.reactor3d;
        const list = sidecar && Array.isArray(sidecar.props) ? sidecar.props : [];
        return list.map(raw => normalizeProp(raw, mapData)).filter(Boolean);
    };

    const propById = (mapData, id) => props(mapData).find(prop => prop.id === Number(id)) || null;

    const writeProps = (mapData, list) => {
        if (!list.length) {
            if (mapData.reactor3d) delete mapData.reactor3d.props;
            return true;
        }
        const sidecar = ensure(mapData);
        if (!sidecar) return false;
        sidecar.props = list;
        return true;
    };

    /** Add a prop, returning its id (or 0 when it could not be added). */
    const addProp = (mapData, values) => {
        if (!mapData) return 0;
        const list = props(mapData);
        const id = list.reduce((max, prop) => Math.max(max, prop.id), 0) + 1;
        const prop = normalizeProp(Object.assign({}, values, { id }), mapData);
        if (!prop) return 0;
        list.push(prop);
        return writeProps(mapData, list) ? id : 0;
    };

    /** Change some fields of a prop, reporting whether anything changed. */
    const updateProp = (mapData, id, patch) => {
        if (!mapData) return false;
        const list = props(mapData);
        const index = list.findIndex(prop => prop.id === Number(id));
        if (index < 0) return false;
        const next = normalizeProp(Object.assign({}, list[index], patch, { id: list[index].id }), mapData);
        if (!next || JSON.stringify(next) === JSON.stringify(list[index])) return false;
        list[index] = next;
        return writeProps(mapData, list);
    };

    const removeProp = (mapData, id) => {
        if (!mapData) return false;
        const list = props(mapData);
        const kept = list.filter(prop => prop.id !== Number(id));
        if (kept.length === list.length) return false;
        return writeProps(mapData, kept);
    };

    /*
     * Pieces: the 3D tileset. A piece is a block of one of a few kinds on a
     * cell at a level, turned in quarter turns, wearing a material (an image
     * under img/materials). The runtime lays them down (`Reactor3D.addPieces`)
     * and stands characters on their tops. One piece per cell and level: a
     * new one there replaces the old.
     */
    const SHAPE_KINDS = ['box', 'wedge', 'pyramid', 'prism', 'hull', 'spike', 'cylinder', 'capsule', 'tube', 'cone', 'dome', 'sphere', 'dish', 'fin', 'arch', 'tunnel', 'ring', 'rock'];
    const SHAPE_PARAMS = { hull: { sides: 8, taper: 0.8 }, spike: { sides: 6, taper: 0 }, capsule: { sides: 24 }, dish: { sides: 32 }, fin: { taper: 0.4 }, cylinder: { sweep: 360 }, tube: { sweep: 360, thick: 0.3 }, ring: { sweep: 360, thick: 0.2 }, rock: { rough: 0.5 } };
    /**
     * Sized events. `reactor3d.eventSize[id] = [w, h]` is a footprint set by hand, in tiles;
     * `reactor3d.eventSizeAnchor: "center"` says the footprints are centred on their events (tiles
     * x - floor((w - 1) / 2) .. x + floor(w / 2), the same for y), and a map without it (0.98.8) counts
     * them from the event's tile right and down, as the runtime still reads it. The editor converts
     * such a map when it reads it (`convertEventSizes`), so here every footprint is centred.
     * `reactor3d.eventSizeAuto[id] = [w, h, ox, oy]` is what the editor measured for an event that
     * stands as a 3D model with no size of its own (the tiles its body covers, from tile x + ox,
     * y + oy): the game works those out from the model itself, so this is the editor's picture only.
     */
    const EVENT_SIZE_MAX = 64;
    const sizeNumber = v => Math.max(1, Math.min(EVENT_SIZE_MAX, Math.floor(Number(v)) || 1));
    const eventSizeEntry = (mapData, eventId) => {
        const raw = mapData && mapData.reactor3d && mapData.reactor3d.eventSize ? mapData.reactor3d.eventSize[String(eventId)] : null;
        return Array.isArray(raw) ? [sizeNumber(raw[0]), sizeNumber(raw[1])] : null;
    };
    /** The footprint measured from an event's model, `[w, h, ox, oy]`, when it has no size set by hand; else null. */
    const eventSizeAuto = (mapData, eventId) => {
        if (eventSizeEntry(mapData, eventId)) return null;
        const raw = mapData && mapData.reactor3d && mapData.reactor3d.eventSizeAuto ? mapData.reactor3d.eventSizeAuto[String(eventId)] : null;
        if (!Array.isArray(raw)) return null;
        const w = sizeNumber(raw[0]), h = sizeNumber(raw[1]);
        const origin = (v, n) => Math.max(1 - n, Math.min(0, Math.floor(Number(v)) || 0));
        return [w, h, origin(raw[2], w), origin(raw[3], h)];
    };
    /** An event's footprint `[w, h]` in tiles: set by hand, else measured from its model, else 1 by 1. */
    const eventSize = (mapData, eventId) => {
        const own = eventSizeEntry(mapData, eventId);
        if (own) return own;
        const auto = eventSizeAuto(mapData, eventId);
        return auto ? [auto[0], auto[1]] : [1, 1];
    };
    const hasEventSizes = mapData => !!(mapData && mapData.reactor3d && mapData.reactor3d.eventSize && typeof mapData.reactor3d.eventSize === 'object' && Object.keys(mapData.reactor3d.eventSize).length);
    /** Whether hand-set footprints are centred on their events: marked so, or none yet (the next one will mark it). */
    const eventSizeCentered = mapData => !hasEventSizes(mapData) || mapData.reactor3d.eventSizeAnchor === 'center';
    /** A footprint's first tile, in tiles from the event's own (zero or less): `size` is one about to be set. */
    const eventFootprintOrigin = (mapData, eventId, size = null) => {
        if (!size) {
            const auto = eventSizeAuto(mapData, eventId);
            if (auto) return [auto[2], auto[3]];
        }
        const [w, h] = size || eventSize(mapData, eventId);
        return eventSizeCentered(mapData) ? [0 - Math.floor((w - 1) / 2), 0 - Math.floor((h - 1) / 2)] : [0, 0];
    };
    /**
     * Where a sized event's own graphic stands, in tiles from the middle of its tile: the middle of
     * its footprint. Centred, that is its own tile for an odd size and half a tile on for an even
     * one (the game draws it there too); a model's measured footprint is round the model as it stands.
     */
    const eventMarkerOffset = (mapData, eventId) => {
        if (eventSizeAuto(mapData, eventId)) return [0, 0];
        const [w, h] = eventSize(mapData, eventId);
        return eventSizeCentered(mapData) ? [w % 2 === 0 ? 0.5 : 0, h % 2 === 0 ? 0.5 : 0] : [(w - 1) / 2, (h - 1) / 2];
    };
    /** The mark follows the footprints: there with them, gone with the last. */
    const markEventSizes = mapData => {
        const sidecar = mapData && mapData.reactor3d;
        if (!sidecar) return;
        if (hasEventSizes(mapData)) sidecar.eventSizeAnchor = 'center';
        else { delete sidecar.eventSizeAnchor; if (sidecar.eventSize && !Object.keys(sidecar.eventSize).length) delete sidecar.eventSize; }
    };
    /**
     * A map saved before footprints were centred (0.98.8: from the event's tile right and down): each
     * sized event moves to the middle tile of its footprint, so the footprint covers the tiles it
     * covered, and the map is marked. True when anything changed.
     */
    const convertEventSizes = mapData => {
        if (!hasEventSizes(mapData) || mapData.reactor3d.eventSizeAnchor === 'center') return false;
        for (const event of mapData.events || []) {
            const size = event ? eventSizeEntry(mapData, event.id) : null;
            if (!size) continue;
            event.x += Math.floor((size[0] - 1) / 2);
            event.y += Math.floor((size[1] - 1) / 2);
        }
        mapData.reactor3d.eventSizeAnchor = 'center';
        return true;
    };
    const setEventSize = (mapData, eventId, size) => {
        if (!mapData || !eventId) return false;
        const w = sizeNumber(size && size[0]), h = sizeNumber(size && size[1]);
        convertEventSizes(mapData);
        const store = mapData.reactor3d && mapData.reactor3d.eventSize;
        if (w === 1 && h === 1) {
            if (store && store[String(eventId)]) { delete store[String(eventId)]; markEventSizes(mapData); return true; }
            return false;
        }
        if (!mapData.reactor3d || typeof mapData.reactor3d !== 'object') mapData.reactor3d = { version: 1 };
        if (!mapData.reactor3d.eventSize || typeof mapData.reactor3d.eventSize !== 'object') mapData.reactor3d.eventSize = {};
        mapData.reactor3d.eventSize[String(eventId)] = [w, h];
        markEventSizes(mapData);
        return true;
    };
    /** Keep (or, with null, forget) the footprint measured from an event's model. */
    const setEventSizeAuto = (mapData, eventId, rect) => {
        if (!mapData || !eventId) return false;
        const store = mapData.reactor3d && mapData.reactor3d.eventSizeAuto;
        const one = !Array.isArray(rect) || (sizeNumber(rect[0]) === 1 && sizeNumber(rect[1]) === 1);
        if (one) {
            if (!store || !store[String(eventId)]) return false;
            delete store[String(eventId)];
            if (!Object.keys(store).length) delete mapData.reactor3d.eventSizeAuto;
            return true;
        }
        if (!mapData.reactor3d || typeof mapData.reactor3d !== 'object') mapData.reactor3d = { version: 1 };
        if (!mapData.reactor3d.eventSizeAuto || typeof mapData.reactor3d.eventSizeAuto !== 'object') mapData.reactor3d.eventSizeAuto = {};
        const w = sizeNumber(rect[0]), h = sizeNumber(rect[1]);
        const next = [w, h, Math.max(1 - w, Math.min(0, Math.floor(Number(rect[2])) || 0)), Math.max(1 - h, Math.min(0, Math.floor(Number(rect[3])) || 0))];
        const was = mapData.reactor3d.eventSizeAuto[String(eventId)];
        if (Array.isArray(was) && was.join(',') === next.join(',')) return false;
        mapData.reactor3d.eventSizeAuto[String(eventId)] = next;
        return true;
    };
    /**
     * The tiles a model covers (`Reactor3D.blockedTilesFor`) as a footprint round the event at (x, y):
     * `[w, h, ox, oy]`, the box of those tiles, the event's own tile always inside it. Null with no tiles.
     */
    const footprintOfTiles = (tiles, x, y) => {
        if (!Array.isArray(tiles) || !tiles.length) return null;
        let x0 = x, y0 = y, x1 = x, y1 = y;
        for (const tile of tiles) { x0 = Math.min(x0, tile.x); y0 = Math.min(y0, tile.y); x1 = Math.max(x1, tile.x); y1 = Math.max(y1, tile.y); }
        // No wider than the limit, kept round the event.
        x0 = Math.max(x0, x - (EVENT_SIZE_MAX - 1)); y0 = Math.max(y0, y - (EVENT_SIZE_MAX - 1));
        return [Math.min(EVENT_SIZE_MAX, x1 - x0 + 1), Math.min(EVENT_SIZE_MAX, y1 - y0 + 1), x0 - x, y0 - y];
    };

    /** A piece's finish over its material (the runtime's `PIECE_FINISHES`). */
    const PIECE_FINISHES = ['mirror', 'chrome', 'polished', 'glossy', 'gold'];
    const PIECE_KINDS = ['wall', 'block', 'floor', 'pillar', 'stair', 'ramp', 'roof', 'doorway', 'window', 'fence', 'glass', 'ladder', 'door'].concat(SHAPE_KINDS);
    const PIECE_MAX_LEVEL = 240;
    /*
     * A door's own fields and a window's frame, as the runtime reads them (reactor_3d_doors.js,
     * `normalizeDoor` / `normalizeWindowFrame`; a test holds the two to the same output).
     */
    const DOOR_STYLES = ['plank', 'panelled', 'arched', 'double', 'gate'];
    const DOOR_OPENS = ['auto', 'action', 'locked'];
    const DOOR_SOUND_KEYS = ['open', 'close', 'locked'];
    const WINDOW_STYLES = ['cottage', 'two', 'arched', 'plain'];
    const SHUTTER_COLOUR = '#3f5f3a';
    const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const trimmed = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const doorSound = raw => {
        if (!raw || typeof raw !== 'object') return null;
        const out = {};
        if (typeof raw.name === 'string') out.name = raw.name.trim().slice(0, 120);
        const volume = Number(raw.volume), pitch = Number(raw.pitch);
        if (Number.isFinite(volume)) out.volume = clampTo(Math.round(volume), 0, 100);
        if (Number.isFinite(pitch)) out.pitch = clampTo(Math.round(pitch), 50, 150);
        return Object.keys(out).length ? out : null;
    };
    const normalizeDoor = raw => {
        raw = raw || {};
        const width = Math.floor(Number(raw.width));
        const out = {
            width: Number.isFinite(width) ? clampTo(width, 1, 6) : 1,
            style: DOOR_STYLES.includes(raw.style) ? raw.style : 'plank',
            hinge: raw.hinge === 'right' ? 'right' : 'left',
            swing: raw.swing === 'out' || raw.swing === 'in' ? raw.swing : 'away',
            opens: DOOR_OPENS.includes(raw.opens) ? raw.opens : 'auto'
        };
        if (out.opens === 'locked' && raw.lock && typeof raw.lock === 'object') {
            const sw = Math.floor(Number(raw.lock.switch)), item = Math.floor(Number(raw.lock.item));
            if (sw > 0) out.lock = { switch: sw };
            else if (item > 0) out.lock = { item };
        }
        if (typeof raw.message === 'string') out.message = raw.message.slice(0, 200);
        if (raw.sound && typeof raw.sound === 'object') {
            const sound = {};
            for (const key of DOOR_SOUND_KEYS) { const one = doorSound(raw.sound[key]); if (one) sound[key] = one; }
            if (Object.keys(sound).length) out.sound = sound;
        }
        const frame = trimmed(raw.frame, 80);
        if (frame) out.frame = frame;
        const tag = trimmed(raw.tag, 80);
        if (tag) out.tag = tag;
        return out;
    };
    const normalizeWindowFrame = raw => {
        if (raw === true) raw = {};
        if (!raw || typeof raw !== 'object') return null;
        const out = { style: WINDOW_STYLES.includes(raw.style) ? raw.style : 'cottage' };
        const material = trimmed(raw.material, 80);
        if (material) out.material = material;
        const colour = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
        const shutters = raw.shutters === true ? SHUTTER_COLOUR : colour(raw.shutters);
        if (shutters) out.shutters = shutters;
        if (shutters && raw.closed === true) out.closed = true;
        if (raw.flowerBox === true) out.flowerBox = true;
        return out;
    };
    const normalizePiece = (raw, mapData) => {
        if (!raw || typeof raw !== 'object' || !PIECE_KINDS.includes(raw.kind)) return null;
        const x = Math.floor(Number(raw.x)), y = Math.floor(Number(raw.y));
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return null;
        if (mapData && (x >= mapData.width || y >= mapData.height)) return null;
        const shape = SHAPE_KINDS.includes(raw.kind);
        // A shape stands at any quarter tile; a cell piece at a whole level.
        const z = Math.max(0, Math.min(PIECE_MAX_LEVEL, shape ? Math.round((Number(raw.z) || 0) * 4) / 4 : Math.floor(Number(raw.z)) || 0));
        const rot = ((Math.floor(Number(raw.rot)) || 0) % 4 + 4) % 4;
        const material = typeof raw.material === 'string' ? raw.material.trim() : '';
        const id = Number(raw.id);
        const piece = { id: Number.isFinite(id) && id > 0 ? Math.floor(id) : 0, kind: raw.kind, x, y, z, rot, material };
        // Pieces stamped from one plan share a group, so the building moves as one.
        const group = Number(raw.group);
        if (Number.isFinite(group) && group > 0) piece.group = Math.floor(group);
        if (typeof raw.finish === 'string' && PIECE_FINISHES.includes(raw.finish)) piece.finish = raw.finish;
        // A surface of its own (the Build panel's sliders), kept even at no reflection: raising it brings the rest back.
        if (raw.surface && typeof raw.surface === 'object') {
            const u = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, Math.round(n * 100) / 100)) : d; };
            piece.surface = { reflect: u(raw.surface.reflect, 0), gloss: u(raw.surface.gloss, 0.8), metal: u(raw.surface.metal, 0),
                tint: typeof raw.surface.tint === 'string' && /^#[0-9a-f]{6}$/i.test(raw.surface.tint) ? raw.surface.tint : '#ffffff', texture: u(raw.surface.texture, 0) };
        }
        // How a ladder's level is drawn: shifted across, narrower than its cell, the top one part way up.
        if (raw.kind === 'ladder') {
            if (Array.isArray(raw.offset)) {
                const shift = raw.offset.slice(0, 2).map(v => Math.max(-1, Math.min(1, Math.round((Number(v) || 0) * 1000) / 1000)));
                if (shift[0] || shift[1]) piece.offset = [shift[0] || 0, shift[1] || 0];
            }
            const span = Math.round(Number(raw.span) * 1000) / 1000, rise = Math.round(Number(raw.rise) * 1000) / 1000;
            if (span >= 0.5 && span < 1) piece.span = span;
            if (rise > 0 && rise < 1) piece.rise = rise;
        }
        // A shape has a size in tiles and a free turn in degrees.
        if (SHAPE_KINDS.includes(raw.kind)) {
            const size = Array.isArray(raw.size) ? raw.size : [];
            const n = (v, fallback) => { const k = Number(v); return Number.isFinite(k) && k > 0 ? Math.min(60, Math.round(k * 100) / 100) : fallback; };
            piece.size = [n(size[0], 1), n(size[1], 1), n(size[2], n(size[0], 1))];
            const angle = Number(raw.angle);
            piece.angle = Number.isFinite(angle) ? ((Math.round(angle) % 360) + 360) % 360 : 0;
            // A tilt, a roll and an offset only when they are something, so a plain shape stays plain.
            const turn = v => { const k = Number(v); return Number.isFinite(k) ? ((Math.round(k) % 360) + 360) % 360 : 0; };
            const tilt = turn(raw.tilt), roll = turn(raw.roll);
            if (tilt) piece.tilt = tilt;
            if (roll) piece.roll = roll;
            const offset = Array.isArray(raw.offset) ? raw.offset.slice(0, 2).map(v => Math.max(-0.5, Math.min(0.5, Math.round((Number(v) || 0) * 100) / 100))) : null;
            if (offset && (offset[0] || offset[1])) piece.offset = [offset[0] || 0, offset[1] || 0];
            const own = SHAPE_PARAMS[raw.kind] || {};
            if ('sides' in own && Number.isFinite(Number(raw.sides))) piece.sides = Math.max(3, Math.min(32, Math.round(Number(raw.sides))));
            if ('taper' in own && Number.isFinite(Number(raw.taper))) piece.taper = Math.max(0, Math.min(1, Math.round(Number(raw.taper) * 100) / 100));
            if ('sweep' in own && Number.isFinite(Number(raw.sweep))) piece.sweep = Math.max(1, Math.min(360, Math.round(Number(raw.sweep))));
            if ('thick' in own && Number.isFinite(Number(raw.thick))) piece.thick = Math.max(0.02, Math.min(1, Math.round(Number(raw.thick) * 100) / 100));
            if ('rough' in own && Number.isFinite(Number(raw.rough))) piece.rough = Math.max(0, Math.min(1, Math.round(Number(raw.rough) * 100) / 100));
        }
        // A door's leaf, how it opens and sounds; a window's frame.
        if (raw.kind === 'door') Object.assign(piece, normalizeDoor(raw));
        if (raw.kind === 'window' && raw.frame) {
            const frame = normalizeWindowFrame(raw.frame);
            if (frame) piece.frame = frame;
        }
        // A rock's top (a material, or "ground" for the map's floor) and its tint.
        if (raw.kind === 'rock') {
            if (typeof raw.cap === 'string' && raw.cap.trim()) piece.cap = raw.cap.trim();
            if (typeof raw.tint === 'string' && /^#[0-9a-f]{6}$/i.test(raw.tint) && raw.tint.toLowerCase() !== '#ffffff') piece.tint = raw.tint.toLowerCase();
        }
        return piece;
    };
    // The stored list as last read: every write stores a new array (writePieces), so the same array,
    // as long and on a map as large, reads the same. Each call still hands out pieces of its own.
    let piecesRead = null;
    const pieces = mapData => {
        const sidecar = mapData && mapData.reactor3d;
        const list = sidecar && Array.isArray(sidecar.pieces) ? sidecar.pieces : [];
        if (!list.length) return [];
        const read = piecesRead;
        if (!read || read.list !== list || read.length !== list.length || read.width !== mapData.width || read.height !== mapData.height) {
            piecesRead = { list, length: list.length, width: mapData.width, height: mapData.height, pieces: list.map(raw => normalizePiece(raw, mapData)).filter(Boolean) };
        }
        return piecesRead.pieces.map(piece => Object.assign({}, piece));
    };
    const hasPieces = mapData => pieces(mapData).length > 0;
    const pieceAt = (mapData, x, y, z) => pieces(mapData).find(piece => piece.x === x && piece.y === y && piece.z === z) || null;
    // Always a new array: the runtime indexes pieces by the array itself.
    const writePieces = (mapData, list) => {
        const sidecar = mapData.reactor3d;
        if (!list.length) {
            if (sidecar) { delete sidecar.pieces; delete sidecar.structures; }
            return true;
        }
        const target = ensure(mapData);
        if (!target) return false;
        target.pieces = list.slice();
        // A building record whose pieces are all gone is stale: a re-stamp
        // over the same footprint left one behind per run.
        if (Array.isArray(target.structures)) {
            const live = new Set(list.map(piece => piece.group).filter(Boolean));
            const kept = target.structures.filter(entry => live.has(Math.floor(Number(entry.group))));
            if (kept.length) target.structures = kept; else delete target.structures;
        }
        return true;
    };
    /** Put a piece on a cell at a level, replacing whatever was there; the piece's id, or 0. */
    const setPiece = (mapData, values) => {
        if (!mapData) return 0;
        const list = pieces(mapData);
        const next = normalizePiece(Object.assign({}, values, { id: 0 }), mapData);
        if (!next) return 0;
        // A floor slab is the ground under whatever stands on its cell: it keeps its slot beside a wall
        // or a block at the same level, and only another slab replaces it.
        // A door hangs in a doorway: it keeps a slot of its own beside it, as a slab does.
        const slot = kind => (kind === 'floor' ? 'floor' : kind === 'door' ? 'door' : 'piece');
        const at = list.findIndex(piece => piece.x === next.x && piece.y === next.y && piece.z === next.z && slot(piece.kind) === slot(next.kind));
        // The same piece again: everything it is drawn by, whatever building it belongs to.
        const drawn = ({ id, group, ...rest }) => JSON.stringify(rest);
        const same = at >= 0 && next.kind !== 'door' && drawn(list[at]) === drawn(next);
        if (same) return list[at].id;
        next.id = at >= 0 ? list[at].id : list.reduce((max, piece) => Math.max(max, piece.id), 0) + 1;
        if (at >= 0) list[at] = next; else list.push(next);
        if (!writePieces(mapData, list)) return 0;
        // What was stored is what was just read with the one piece changed: the next read need not work it out again.
        const stored = mapData.reactor3d && mapData.reactor3d.pieces;
        if (Array.isArray(stored) && stored.length === list.length) piecesRead = { list: stored, length: stored.length, width: mapData.width, height: mapData.height, pieces: list };
        return next.id;
    };
    /** Take one piece off a cell at a level: what stands on the slab first, the slab itself only when nothing does. */
    const removePiece = (mapData, x, y, z) => {
        if (!mapData) return false;
        const list = pieces(mapData);
        const here = list.filter(piece => piece.x === x && piece.y === y && piece.z === z);
        if (!here.length) return false;
        const gone = here.find(piece => piece.kind !== 'floor') || here[0];
        return writePieces(mapData, list.filter(piece => piece !== gone));
    };
    const piecesSnapshot = mapData => pieces(mapData);
    const restorePieces = (mapData, saved) => writePieces(mapData, Array.isArray(saved) ? saved.map(raw => normalizePiece(raw, mapData)).filter(Boolean) : []);
    const clearPieces = mapData => writePieces(mapData, []);
    /** The next free group number. */
    const nextPieceGroup = mapData => pieces(mapData).reduce((max, piece) => Math.max(max, piece.group || 0), 0) + 1;
    const pieceGroup = (mapData, group) => pieces(mapData).filter(piece => piece.group === group);
    /** The cells a group covers: {x0, y0, x1, y1} inclusive, or null. */
    const pieceGroupBounds = (mapData, group) => {
        const list = pieceGroup(mapData, group);
        if (!list.length) return null;
        const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        for (const piece of list) { bounds.x0 = Math.min(bounds.x0, piece.x); bounds.y0 = Math.min(bounds.y0, piece.y); bounds.x1 = Math.max(bounds.x1, piece.x); bounds.y1 = Math.max(bounds.y1, piece.y); }
        return bounds;
    };
    /**
     * Move a group so its top-left cell lands on (x, y). Refused when any
     * piece would leave the map; whatever stood on the new footprint (other
     * than the group itself) goes, as a stamp would take it.
     */
    const movePieceGroup = (mapData, group, x, y) => {
        if (!mapData) return false;
        const bounds = pieceGroupBounds(mapData, group);
        if (!bounds) return false;
        const dx = Math.floor(x) - bounds.x0, dy = Math.floor(y) - bounds.y0;
        if (!dx && !dy) return false;
        const nx0 = bounds.x0 + dx, ny0 = bounds.y0 + dy, nx1 = bounds.x1 + dx, ny1 = bounds.y1 + dy;
        if (nx0 < 0 || ny0 < 0 || nx1 >= mapData.width || ny1 >= mapData.height) return false;
        const list = pieces(mapData);
        const moved = [];
        for (const piece of list) {
            if (piece.group === group) moved.push(Object.assign({}, piece, { x: piece.x + dx, y: piece.y + dy }));
            else if (!(piece.x >= nx0 && piece.x <= nx1 && piece.y >= ny0 && piece.y <= ny1)) moved.push(piece);
        }
        return writePieces(mapData, moved);
    };
    const removePieceGroup = (mapData, group) => {
        if (!mapData) return false;
        const list = pieces(mapData);
        const kept = list.filter(piece => piece.group !== group);
        if (kept.length === list.length) return false;
        removeStructure(mapData, group);
        return writePieces(mapData, kept);
    };
    /** Turn a hand-built group a quarter turn clockwise about its footprint. */
    const rotatePieceGroup = (mapData, group) => {
        const bounds = pieceGroupBounds(mapData, group);
        if (!bounds) return false;
        const w = bounds.x1 - bounds.x0 + 1, h = bounds.y1 - bounds.y0 + 1;
        if (bounds.x0 + h > mapData.width || bounds.y0 + w > mapData.height) return false;
        const list = pieces(mapData).map(piece => {
            if (piece.group !== group) return piece;
            const next = Object.assign({}, piece, { x: bounds.x0 + (h - 1 - (piece.y - bounds.y0)), y: bounds.y0 + (piece.x - bounds.x0), rot: (piece.rot + 1) % 4 });
            // A shape's or a ladder's shift in its cell turns with it (the turn itself is the quarter turn above).
            if (piece.offset) next.offset = [-piece.offset[1] || 0, piece.offset[0] || 0];
            return next;
        });
        return writePieces(mapData, list);
    };
    /*
     * Stamped structures: which plan a group came from and how it stands,
     * so the building can be moved, turned or grown by building it again.
     * `structures: [{ group, plan, x, y, rot, scale }]` in the sidecar.
     */
    const structures = mapData => {
        const list = mapData && mapData.reactor3d && Array.isArray(mapData.reactor3d.structures) ? mapData.reactor3d.structures : [];
        return list.filter(entry => entry && Number(entry.group) > 0 && typeof entry.plan === 'string').map(entry => ({
            group: Math.floor(Number(entry.group)), plan: entry.plan, x: Math.floor(Number(entry.x)) || 0, y: Math.floor(Number(entry.y)) || 0,
            rot: ((Math.floor(Number(entry.rot)) || 0) % 4 + 4) % 4, scale: Math.max(1, Math.min(4, Math.floor(Number(entry.scale)) || 1)),
            // Named places the plan declared, in map cells: a story's "at the inn's counter".
            spots: entry.spots && typeof entry.spots === 'object' ? Object.assign({}, entry.spots) : {}
        }));
    };
    const structureOf = (mapData, group) => structures(mapData).find(entry => entry.group === group) || null;
    const setStructure = (mapData, record) => {
        const sidecar = ensure(mapData);
        if (!sidecar || !record || !(Number(record.group) > 0)) return false;
        const list = structures(mapData).filter(entry => entry.group !== record.group);
        list.push({ group: record.group, plan: record.plan, x: record.x, y: record.y, rot: record.rot || 0, scale: record.scale || 1, spots: record.spots && typeof record.spots === 'object' ? record.spots : {} });
        sidecar.structures = list;
        return true;
    };
    const restoreStructures = (mapData, list) => {
        const sidecar = mapData && mapData.reactor3d;
        if (!sidecar) return false;
        if (Array.isArray(list) && list.length) sidecar.structures = list.map(entry => Object.assign({}, entry)); else delete sidecar.structures;
        return true;
    };
    const removeStructure = (mapData, group) => {
        const sidecar = mapData && mapData.reactor3d;
        if (!sidecar) return false;
        const list = structures(mapData).filter(entry => entry.group !== group);
        if (list.length) sidecar.structures = list; else delete sidecar.structures;
        return true;
    };
    /**
     * Placed models standing on a footprint are set down just outside it,
     * on the nearest edge, so a building stamped over a tree does not
     * swallow the tree. Returns how many moved.
     */
    const relocatePropsOff = (mapData, x0, y0, w, h, ownGroup = 0) => {
        if (!mapData || !mapData.reactor3d || !Array.isArray(mapData.reactor3d.props)) return 0;
        let moved = 0;
        for (const prop of props(mapData)) {
            if (!(prop.x >= x0 && prop.x < x0 + w && prop.y >= y0 && prop.y < y0 + h)) continue;
            // The building's own models stay: the stamp lays them again where they belong.
            if (ownGroup && prop.structure === ownGroup) continue;
            const left = prop.x - x0, right = x0 + w - prop.x, top = prop.y - y0, bottom = y0 + h - prop.y;
            const nearest = Math.min(left, right, top, bottom);
            let nx = prop.x, ny = prop.y;
            // Two cells clear, so a door or a path along the wall stays open.
            if (nearest === left) nx = x0 - 2; else if (nearest === right) nx = x0 + w + 1; else if (nearest === top) ny = y0 - 2; else ny = y0 + h + 1;
            nx = Math.max(0, Math.min(mapData.width - 1, nx)); ny = Math.max(0, Math.min(mapData.height - 1, ny));
            if (updateProp(mapData, prop.id, { x: nx, y: ny })) moved++;
        }
        return moved;
    };
    /** The building a cell belongs to: a piece's group there, else a group whose footprint holds the cell. */
    const pieceGroupAt = (mapData, x, y) => {
        const list = pieces(mapData);
        const here = list.find(piece => piece.x === x && piece.y === y && piece.group);
        if (here) return here.group;
        // Every group's cells in one pass, in the order the groups first appear.
        const all = new Map();
        for (const piece of list) {
            if (!piece.group) continue;
            let bounds = all.get(piece.group);
            if (!bounds) all.set(piece.group, bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
            if (piece.x < bounds.x0) bounds.x0 = piece.x;
            if (piece.y < bounds.y0) bounds.y0 = piece.y;
            if (piece.x > bounds.x1) bounds.x1 = piece.x;
            if (piece.y > bounds.y1) bounds.y1 = piece.y;
        }
        for (const [group, bounds] of all) if (x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1) return group;
        return 0;
    };
    /**
     * Make a building of the loose pieces touching the one at a cell: every
     * ungrouped piece reachable across shared cell edges (and up and down a
     * stack) joins one new group. The group, or 0 when nothing is there.
     */
    const groupConnectedPieces = (mapData, x, y) => {
        const list = pieces(mapData);
        const byCell = new Map();
        for (const piece of list) { if (piece.group) continue; const key = piece.x + ',' + piece.y; (byCell.get(key) || byCell.set(key, []).get(key)).push(piece); }
        if (!byCell.has(x + ',' + y)) return 0;
        const group = nextPieceGroup(mapData);
        const seen = new Set([x + ',' + y]);
        const queue = [[x, y]];
        while (queue.length) {
            const [cx, cy] = queue.shift();
            for (const piece of byCell.get(cx + ',' + cy) || []) piece.group = group;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const key = (cx + dx) + ',' + (cy + dy);
                if (byCell.has(key) && !seen.has(key)) { seen.add(key); queue.push([cx + dx, cy + dy]); }
            }
        }
        return writePieces(mapData, list) ? group : 0;
    };
    /*
     * Water: poured into hollows of the ground. A sheet is the hollow's box
     * at the level the water stands, with a `mask` (one character per cell
     * of the box, row by row, '1' under water) when the hollow is not the
     * whole box; a sheet without a mask covers its box. A shore is the
     * terrain sloping below it; the runtime blocks water deeper than a
     * wade. `water: [{x0, y0, x1, y1, level, material, mask}]` in the sidecar.
     */
    // As high as ground goes: the tallest tile with the terrain raised to its top.
    const WATER_MAX_LEVEL = 160;
    const normalizeWater = (raw, mapData) => {
        if (!raw || typeof raw !== 'object') return null;
        let x0 = Math.floor(Number(raw.x0)), y0 = Math.floor(Number(raw.y0)), x1 = Math.floor(Number(raw.x1)), y1 = Math.floor(Number(raw.y1));
        if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
        if (x1 < x0) [x0, x1] = [x1, x0];
        if (y1 < y0) [y0, y1] = [y1, y0];
        const box = { x0, y0, x1, y1 };
        if (mapData) { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(mapData.width - 1, x1); y1 = Math.min(mapData.height - 1, y1); }
        if (x1 < x0 || y1 < y0) return null;
        const level = Math.max(-WATER_MAX_LEVEL, Math.min(WATER_MAX_LEVEL, Number(raw.level) || 0));
        const region = { x0, y0, x1, y1, level: Math.round(level * 100) / 100, material: typeof raw.material === 'string' ? raw.material.trim() : '' };
        if (typeof raw.mask === 'string' && raw.mask.length === (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1)) {
            const bw = box.x1 - box.x0 + 1, w = x1 - x0 + 1, h = y1 - y0 + 1;
            let mask = '', full = true;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = raw.mask[(y0 + y - box.y0) * bw + (x0 + x - box.x0)] === '1' ? '1' : '0'; if (c === '0') full = false; mask += c; }
            if (!full) region.mask = mask;
        }
        // Its look, only what was set: reflect and gloss (0-1) and the reflection's tint.
        const unit = value => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null; };
        if (unit(raw.reflect) !== null) region.reflect = unit(raw.reflect);
        if (unit(raw.gloss) !== null) region.gloss = unit(raw.gloss);
        if (typeof raw.tint === 'string' && /^#[0-9a-f]{6}$/i.test(raw.tint)) region.tint = raw.tint.toLowerCase();
        // The liquid itself: its colour, clarity (0-1), waves (0-2) and glow (0-1).
        if (typeof raw.colour === 'string' && /^#[0-9a-f]{6}$/i.test(raw.colour)) region.colour = raw.colour.toLowerCase();
        if (unit(raw.clear) !== null) region.clear = unit(raw.clear);
        const waves = Number(raw.waves);
        if (Number.isFinite(waves)) region.waves = Math.max(0, Math.min(2, Math.round(waves * 100) / 100));
        if (unit(raw.glow) !== null) region.glow = unit(raw.glow);
        // A sheet a stamped building brought (a fountain's basin): the building's group, so it goes with it.
        if (Number(raw.structure) > 0) region.structure = Math.floor(Number(raw.structure));
        const river = normalizeRiverPath(raw, mapData);
        if (river) {
            region.path = river.path;
            if (river.flow !== 1) region.flow = river.flow;
            region.level = river.path.reduce((top, point) => Math.max(top, point[2]), -Infinity);
        }
        return region;
    };
    /*
     * A river: a sheet with a `path` ([[x, y, level], ...], its centre line
     * downstream, tile units) whose surface follows those heights, and a
     * `flow` (default 1, 0 still). The runtime (Reactor3D.riverSample) works
     * out the surface; without it loaded (a bare Node check) the nearest
     * stretch's straight line stands in.
     */
    const normalizeRiverPath = (raw, mapData) => {
        if (!raw || !Array.isArray(raw.path)) return null;
        const width = mapData && mapData.width > 0 ? mapData.width : Infinity, height = mapData && mapData.height > 0 ? mapData.height : Infinity;
        const round = value => Math.round(value * 100) / 100;
        const path = [];
        for (const point of raw.path) {
            if (!Array.isArray(point) || point.length < 3) continue;
            const x = Number(point[0]), y = Number(point[1]), level = Number(point[2]);
            if (![x, y, level].every(Number.isFinite)) continue;
            const next = [round(Math.max(0, Math.min(width, x))), round(Math.max(0, Math.min(height, y))), round(Math.max(-WATER_MAX_LEVEL, Math.min(WATER_MAX_LEVEL, level)))];
            const last = path[path.length - 1];
            if (last && last[0] === next[0] && last[1] === next[1] && last[2] === next[2]) continue;
            path.push(next);
        }
        if (path.length < 2) return null;
        const flow = raw.flow === undefined || raw.flow === null || raw.flow === '' ? 1 : Number(raw.flow);
        return { path, flow: Number.isFinite(flow) ? Math.max(0, Math.min(4, Math.round(flow * 100) / 100)) : 1 };
    };
    /** A river's surface at a world point. */
    const riverLevelAt = (region, wx, wz) => {
        const R = root.Reactor3D;
        if (R && typeof R.riverSample === 'function') return R.riverSample(region, wx, wz, {}).level;
        let best = Infinity, level = region.level;
        for (let i = 0; i + 1 < region.path.length; i++) {
            const [ax, az, al] = region.path[i], [bx, bz, bl] = region.path[i + 1];
            const run = Math.hypot(bx - ax, bz - az);
            const t = run > 1e-6 ? Math.max(0, Math.min(1, ((wx - ax) * (bx - ax) + (wz - az) * (bz - az)) / (run * run))) : 0;
            const d = Math.hypot(wx - (ax + (bx - ax) * t), wz - (az + (bz - az) * t));
            if (d < best) { best = d; level = al + (bl - al) * t; }
        }
        return level;
    };
    /** A sheet's surface over a cell's middle: a pond's level, a river's height there. */
    const sheetLevelAt = (region, x, y) => region.path ? riverLevelAt(region, x + 0.5, y + 0.5) : region.level;
    /** Whether a sheet stands over a cell. */
    const waterCovers = (region, x, y) => x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1
        && (!region.mask || region.mask[(y - region.y0) * (region.x1 - region.x0 + 1) + (x - region.x0)] === '1');
    /** The highest sheet over a cell, or null. */
    const waterAt = (mapData, x, y) => water(mapData).reduce((best, region) => waterCovers(region, x, y) && (!best || sheetLevelAt(region, x, y) > sheetLevelAt(best, x, y)) ? region : best, null);
    /** Whether two sheets share a cell. */
    const waterTouches = (a, b) => {
        for (let y = Math.max(a.y0, b.y0); y <= Math.min(a.y1, b.y1); y++) for (let x = Math.max(a.x0, b.x0); x <= Math.min(a.x1, b.x1); x++) if (waterCovers(a, x, y) && waterCovers(b, x, y)) return true;
        return false;
    };
    const water = mapData => {
        const list = mapData && mapData.reactor3d && Array.isArray(mapData.reactor3d.water) ? mapData.reactor3d.water : [];
        return list.map(raw => normalizeWater(raw, mapData)).filter(Boolean);
    };
    const hasWater = mapData => water(mapData).length > 0;
    const writeWater = (mapData, list) => {
        if (!list.length) { if (mapData.reactor3d) delete mapData.reactor3d.water; return true; }
        const sidecar = ensure(mapData);
        if (!sidecar) return false;
        sidecar.water = list.slice();
        return true;
    };
    const addWater = (mapData, region) => {
        const next = normalizeWater(region, mapData);
        if (!next) return false;
        return writeWater(mapData, water(mapData).concat([next]));
    };
    /** Remove every sheet standing over a cell. */
    const removeWaterAt = (mapData, x, y) => {
        const list = water(mapData);
        const kept = list.filter(region => !waterCovers(region, x, y));
        if (kept.length === list.length) return false;
        return writeWater(mapData, kept);
    };
    /** Remove one sheet (the one drawn under the pointer, matched by its box and level). */
    const removeWaterRegion = (mapData, region) => {
        if (!region) return false;
        const list = water(mapData);
        const kept = list.filter(other => !(other.x0 === region.x0 && other.y0 === region.y0 && other.x1 === region.x1 && other.y1 === region.y1 && Math.abs(other.level - region.level) < 1e-6));
        if (kept.length === list.length) return false;
        return writeWater(mapData, kept);
    };
    /** Give one sheet a look: its reflection (reflect, gloss, tint) and its liquid (colour, clear, waves, glow). Water's own values are left unwritten. */
    const styleWaterRegion = (mapData, region, look) => {
        if (!region || !look) return false;
        const list = water(mapData);
        let found = false;
        const styled = list.map(other => {
            if (!(other.x0 === region.x0 && other.y0 === region.y0 && other.x1 === region.x1 && other.y1 === region.y1 && Math.abs(other.level - region.level) < 1e-6)) return other;
            found = true;
            const next = Object.assign({}, other);
            for (const key of ['reflect', 'gloss', 'tint', 'colour', 'clear', 'waves', 'glow']) delete next[key];
            if (Number(look.reflect) > 0) Object.assign(next, { reflect: Number(look.reflect), gloss: Number(look.gloss), tint: look.tint });
            if (look.colour) next.colour = look.colour;
            if (look.clear !== undefined && Math.abs(Number(look.clear) - 0.6) > 1e-6) next.clear = Number(look.clear);
            if (look.waves !== undefined && Math.abs(Number(look.waves) - 1) > 1e-6) next.waves = Number(look.waves);
            if (Number(look.glow) > 0) next.glow = Number(look.glow);
            return normalizeWater(next, mapData);
        });
        return found ? writeWater(mapData, styled.filter(Boolean)) : false;
    };
    /*
     * What holds water back: the solid a piece makes from its cell's ground
     * up, in tiles. A wall or a pane holds to its top, a block to its own and
     * a window to its sill; a floor slab (water stands over it), a doorway, a
     * fence, a pillar, a ladder, a stair, a ramp and a roof let water by.
     * Pieces stacked on one cell hold as one while each starts where the one
     * under it ends; a piece that starts higher (an upper storey over a
     * doorway, a bridge) holds nothing, the water passing under it. Shapes
     * and rocks hold to their tops (the hollow ones and ones thinner than a
     * post, `WATER_THIN`, not at all) when the 3D
     * runtime is loaded to say which cells they stand on.
     */
    const WATER_HOLD = new Map([['wall', 5], ['glass', 5], ['block', 1], ['window', 1.5]]);
    const WATER_OPEN_SHAPES = ['tube', 'ring', 'arch', 'tunnel'];
    // Narrower than this across (tiles, both ways) a shape lets water by.
    const WATER_THIN = 0.6;
    const WATER_SOLID_SHAPES = new Set(SHAPE_KINDS.filter(kind => !WATER_OPEN_SHAPES.includes(kind)));
    // The cell pieces' part, kept per pieces array (every edit writes a new one): a big map has tens of thousands.
    const waterHoldMemo = new WeakMap();
    const columnTop = span => {
        span.sort((a, b) => a[0] - b[0]);
        let top = 0;
        for (const [bottom, end] of span) { if (bottom > top + 0.05) break; if (end > top) top = end; }
        return top;
    };
    /** How high pieces hold water over each cell's ground, by `y * width + x`; null when nothing does. */
    const waterWalls = mapData => {
        const raw = mapData && mapData.reactor3d && mapData.reactor3d.pieces;
        if (!Array.isArray(raw) || !raw.length) return null;
        const W = mapData.width, H = mapData.height;
        let own = waterHoldMemo.get(raw);
        if (!own || own.width !== W || own.height !== H) {
            own = { width: W, height: H, spans: new Map(), walls: new Map(), shapes: false };
            for (const entry of raw) {
                if (!entry || typeof entry !== 'object') continue;
                const hold = WATER_HOLD.get(entry.kind);
                if (hold === undefined) { if (WATER_SOLID_SHAPES.has(entry.kind)) own.shapes = true; continue; }
                const x = Math.floor(Number(entry.x)), y = Math.floor(Number(entry.y));
                if (!(x >= 0 && y >= 0 && x < W && y < H)) continue;
                const z = Math.max(0, Math.min(PIECE_MAX_LEVEL, Math.floor(Number(entry.z)) || 0)), key = y * W + x;
                const span = own.spans.get(key);
                if (span) span.push([z, z + hold]); else own.spans.set(key, [[z, z + hold]]);
            }
            for (const [key, span] of own.spans) { const top = columnTop(span); if (top > 0) own.walls.set(key, top); }
            waterHoldMemo.set(raw, own);
        }
        // Shapes stand from their own cell's ground, which a terrain stroke moves: read afresh each time.
        const R = root.Reactor3D;
        if (!own.shapes || !R || typeof R.pieceIndex !== 'function') return own.walls.size ? own.walls : null;
        const index = R.pieceIndex(mapData);
        if (!index) return own.walls.size ? own.walls : null;
        const extra = new Map();
        const hold = piece => {
            if (piece.x < 0 || piece.y < 0 || piece.x >= W || piece.y >= H) return;
            // A post, a pole or a stilt is thinner than its cell: the water stands round it.
            const size = Array.isArray(piece.size) ? piece.size : null;
            if (size && Number(size[0]) < WATER_THIN && Number(size[2]) < WATER_THIN) return;
            // On a cell of its footprint lower or higher than its own, a shape starts that much up or down.
            const anchor = Array.isArray(piece.anchor) ? piece.anchor : [piece.x, piece.y];
            const shift = R.pieceBaseAt(mapData, anchor[0], anchor[1]) - R.pieceBaseAt(mapData, piece.x, piece.y);
            const bottom = piece.z + shift, top = R.pieceTop(piece, 0.5, 0.5) + shift;
            if (!(top > bottom)) return;
            const key = piece.y * W + piece.x, span = extra.get(key);
            if (span) span.push([bottom, top]); else extra.set(key, [[bottom, top]]);
        };
        // Each shape on every cell of its footprint, as the runtime stands it there (`pieceIndex`); rocks by the columns it worked out.
        let rocks = false;
        for (const piece of index.list) {
            if (!WATER_SOLID_SHAPES.has(piece.kind)) continue;
            if (piece.kind === 'rock') { rocks = true; continue; }
            for (const [fx, fy] of R.pieceFootprint(piece)) hold(fx === piece.x && fy === piece.y ? piece : Object.assign({}, piece, { x: fx, y: fy, standIn: true, anchor: [piece.x, piece.y] }));
        }
        if (rocks) for (const stack of index.cells.values()) for (const piece of stack) if (piece.kind === 'rock') hold(piece);
        if (!extra.size) return own.walls.size ? own.walls : null;
        const walls = new Map(own.walls);
        for (const [key, span] of extra) {
            const top = columnTop(span.concat(own.spans.get(key) || []));
            if (top > 0) walls.set(key, top); else walls.delete(key);
        }
        return walls.size ? walls : null;
    };
    /**
     * The hollow under a cell, as water poured there would fill it: the
     * water rises from that cell's ground a quarter tile at a time,
     * spreading to every neighbour lower than it, until it would spill —
     * over the map's edge, past `maxCells`, or out of the hollow onto open
     * ground (a rise that floods far more than what already stood, so a
     * pond does not become a lake over the whole valley). The result is the
     * box of the last level that held, its level, its cell count and a mask
     * of the cells under water. Null when the cell is not in a hollow.
     * Pieces hold the water back up to their tops (`waterWalls`), so walls
     * on flat ground make a basin of their own.
     */
    const waterBasin = (mapData, x, y, maxCells = 6000) => {
        if (!mapData) return null;
        const W = mapData.width, H = mapData.height;
        if (x < 0 || y < 0 || x >= W || y >= H) return null;
        const walls = waterWalls(mapData);
        if (!walls && !hasTerrain(mapData)) return null;
        const ground = (cx, cy) => terrainHeightAt(mapData, cx + 0.5, cy + 0.5) + (Number(at(mapData, cx, cy)) || 0) + (walls ? walls.get(cy * W + cx) || 0 : 0);
        const start = ground(x, y);
        // The cells under water at a level, or null when the water would spill.
        const flood = (level, held) => {
            const seen = new Set([y * W + x]);
            const queue = [[x, y]];
            let x0 = x, y0 = y, x1 = x, y1 = y;
            const limit = held ? Math.min(maxCells, Math.ceil(held.cells * 2.5) + 12) : maxCells;
            for (let next = 0; next < queue.length; next++) {
                const [cx, cy] = queue[next];
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return null;
                    const key = ny * W + nx;
                    if (seen.has(key) || ground(nx, ny) > level - 0.01) continue;
                    seen.add(key); queue.push([nx, ny]);
                    x0 = Math.min(x0, nx); y0 = Math.min(y0, ny); x1 = Math.max(x1, nx); y1 = Math.max(y1, ny);
                    if (seen.size > limit) return null;
                }
            }
            const w = x1 - x0 + 1, h = y1 - y0 + 1;
            let mask = '';
            for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) mask += seen.has(cy * W + cx) ? '1' : '0';
            return { x0, y0, x1, y1, level, cells: seen.size, mask: seen.size === w * h ? undefined : mask };
        };
        let held = null;
        for (let step = 1; step <= 60; step++) {
            const next = flood(Math.round((start + step * 0.25) * 100) / 100, held);
            if (!next) break;
            held = next;
        }
        // Then up to the rim in finer steps, so the water meets the bank rather than stopping a quarter tile under it.
        for (let step = 1; held && step <= 4; step++) {
            const next = flood(Math.round((held.level + 0.05) * 100) / 100, held);
            if (!next) break;
            held = next;
        }
        return held;
    };
    /** Pour into the hollow under a cell: one sheet over its cells at the level it holds; any sheet sharing a cell with it is taken away. */
    const fillWaterAt = (mapData, x, y, material) => {
        const basin = waterBasin(mapData, x, y);
        if (!basin) return null;
        const sheet = normalizeWater({ x0: basin.x0, y0: basin.y0, x1: basin.x1, y1: basin.y1, level: basin.level, material: material || '', mask: basin.mask }, mapData);
        // A river running into the pond stays: where the two meet the higher water shows.
        const kept = water(mapData).filter(region => region.path || !waterTouches(region, sheet));
        return writeWater(mapData, kept.concat([sheet])) ? sheet : null;
    };
    /**
     * Fit every sheet to the ground as it stands now: within its box and at
     * its own level, the water spreads from the cells it still covers to
     * every neighbour lower than it, and leaves ground that rose above it.
     * A sheet whose cells all rose goes. Called after the ground changes
     * shape, so a hill dug out under a pond fills instead of leaving a hole,
     * and after pieces change, so a wall built through a pond leaves its
     * cells dry. A river only dries where the ground rose over it: its
     * banks are its own, so it never spreads past them. True when any sheet
     * changed.
     */
    const refitWater = mapData => {
        const list = water(mapData);
        if (!list.length) return false;
        const walls = waterWalls(mapData), W = mapData.width;
        const ground = (cx, cy) => terrainHeightAt(mapData, cx + 0.5, cy + 0.5) + (Number(at(mapData, cx, cy)) || 0) + (walls ? walls.get(cy * W + cx) || 0 : 0);
        let changed = false;
        const next = [];
        for (const region of list) {
            const w = region.x1 - region.x0 + 1, h = region.y1 - region.y0 + 1;
            const wet = new Uint8Array(w * h), queue = [];
            // A river's own height over each cell, not its highest.
            const dry = (cx, cy) => ground(cx, cy) > sheetLevelAt(region, cx, cy) - 0.01;
            for (let cy = region.y0; cy <= region.y1; cy++) for (let cx = region.x0; cx <= region.x1; cx++) {
                if (waterCovers(region, cx, cy) && !dry(cx, cy)) { wet[(cy - region.y0) * w + (cx - region.x0)] = 1; queue.push(cx, cy); }
            }
            for (let i = 0; !region.path && i < queue.length; i += 2) {
                const cx = queue[i], cy = queue[i + 1];
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx < region.x0 || ny < region.y0 || nx > region.x1 || ny > region.y1) continue;
                    const key = (ny - region.y0) * w + (nx - region.x0);
                    if (wet[key] || dry(nx, ny)) continue;
                    wet[key] = 1; queue.push(nx, ny);
                }
            }
            if (!queue.length) { changed = true; continue; }
            let mask = '';
            for (let i = 0; i < w * h; i++) mask += wet[i] ? '1' : '0';
            const fitted = normalizeWater(Object.assign({}, region, { mask }), mapData);
            if ((fitted.mask || '') !== (region.mask || '')) changed = true;
            next.push(fitted);
        }
        return changed ? writeWater(mapData, next) : false;
    };
    /**
     * A river along a course: `course` is points in tile units ([x, y], a
     * cell's middle at x + 0.5), upstream first. The surface starts a little
     * under the ground at the source (or at the level of a lake the course
     * starts in) and follows the ground down, never up: where the ground
     * rises ahead the river keeps its height and the channel is cut through,
     * where it drops sharply (a cliff) the river falls. A course whose points
     * all carry a level ([x, y, level]) keeps those heights instead. The
     * channel is carved into the terrain (`width` tiles across, `depth`
     * under the surface at its middle, banks sloping up beside it; the
     * ground is only ever lowered), the wet cells are found on the carved
     * ground, and one sheet is written with its path. A lake the course
     * ends in takes it at its own level. Returns { sheet, region } (the
     * corners carved, `x0..x1`, `z0..z1`) or null when there is no river to
     * lay (fewer than two points, or no wet cell).
     */
    const RIVER_FREEBOARD = 0.35;
    const carveRiver = (mapData, course, options = {}) => {
        if (!mapData || !Array.isArray(course)) return null;
        const W = mapData.width, H = mapData.height;
        const points = course.filter(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
            .map(p => [Math.max(0, Math.min(W, Number(p[0]))), Math.max(0, Math.min(H, Number(p[1]))), p.length > 2 && Number.isFinite(Number(p[2])) ? Number(p[2]) : null]);
        if (points.length < 2) return null;
        const given = points.every(p => p[2] !== null);
        const width = Math.max(1, Math.min(16, Number(options.width) || 3)), half = width / 2;
        const depth = Math.max(0.3, Math.min(6, Number(options.depth) || 1));
        const ground = (wx, wz) => terrainHeightAt(mapData, wx, wz) + (Number(at(mapData, Math.max(0, Math.min(W - 1, Math.floor(wx))), Math.max(0, Math.min(H - 1, Math.floor(wz))))) || 0);
        const lakes = water(mapData).filter(region => !region.path);
        const lakeAt = (wx, wz) => lakes.reduce((best, region) => waterCovers(region, Math.floor(wx), Math.floor(wz)) && (!best || region.level > best.level) ? region : best, null);
        // The course every tile, the clicked points kept.
        const samples = [];
        for (let i = 0; i + 1 < points.length; i++) {
            const [ax, az, al] = points[i], [bx, bz, bl] = points[i + 1];
            const run = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(run));
            for (let k = 0; k < steps; k++) {
                const t = k / steps;
                samples.push([ax + (bx - ax) * t, az + (bz - az) * t, given ? al + (bl - al) * t : null]);
            }
        }
        const last = points[points.length - 1];
        samples.push([last[0], last[1], last[2]]);
        // The heights: the bank (the lowest ground across the river) less a freeboard, never rising downstream.
        if (!given) {
            // A course ending in a lake never runs below that lake: it falls into it at its level.
            const end = lakeAt(last[0], last[1]), floor = end ? end.level : -Infinity;
            let level = Infinity;
            samples.forEach((sample, i) => {
                const [x, z] = sample;
                // Across the course: square to the way from the sample before to the one after.
                const j = Math.min(samples.length - 1, i + 1), k = Math.max(0, i - 1);
                let dx = samples[j][0] - samples[k][0], dz = samples[j][1] - samples[k][1];
                const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
                let bank = Infinity;
                for (let o = -half; o <= half + 1e-6; o += 0.5) bank = Math.min(bank, ground(Math.max(0, Math.min(W, x - dz * o)), Math.max(0, Math.min(H, z + dx * o))));
                const lake = lakeAt(x, z);
                const target = Math.max(floor, lake ? lake.level : bank - RIVER_FREEBOARD);
                level = Math.min(level, target);
                sample[2] = Math.round(level * 100) / 100;
            });
        }
        // The path: the samples thinned where the river runs straight and even (a waterfall's ends always kept).
        const scale = 3;
        const keep = new Uint8Array(samples.length);
        keep[0] = keep[samples.length - 1] = 1;
        const thin = (a, b) => {
            let worst = -1, far = 0.15;
            const [ax, az, al] = samples[a], [bx, bz, bl] = samples[b];
            const run = Math.hypot(bx - ax, bz - az, (bl - al) * scale) || 1;
            for (let i = a + 1; i < b; i++) {
                const [x, z, l] = samples[i];
                const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az) + (l - al) * (bl - al) * scale * scale) / (run * run)));
                const d = Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t), (l - (al + (bl - al) * t)) * scale);
                if (d > far) { far = d; worst = i; }
            }
            if (worst < 0) return;
            keep[worst] = 1;
            thin(a, worst); thin(worst, b);
        };
        if (given) points.forEach(p => { const i = samples.findIndex(s => Math.abs(s[0] - p[0]) < 1e-9 && Math.abs(s[1] - p[1]) < 1e-9); if (i >= 0) keep[i] = 1; });
        else thin(0, samples.length - 1);
        // A step steeper than a waterfall keeps both its ends, so the fall is its own stretch.
        for (let i = 0; i + 1 < samples.length; i++) {
            const drop = samples[i][2] - samples[i + 1][2], run = Math.hypot(samples[i + 1][0] - samples[i][0], samples[i + 1][1] - samples[i][1]);
            if (drop > 0.5 && drop > run) { keep[i] = 1; keep[i + 1] = 1; }
        }
        const round = v => Math.round(v * 100) / 100;
        const path = samples.filter((_, i) => keep[i]).map(([x, z, l]) => [round(x), round(z), round(l)]);
        const shape = normalizeWater({ x0: 0, y0: 0, x1: W - 1, y1: H - 1, level: 0, path }, mapData);
        if (!shape || !shape.path) return null;
        // The line the channel follows, for distances.
        const distanceTo = (wx, wz) => {
            let best = Infinity;
            for (let i = 0; i + 1 < path.length; i++) {
                const [ax, az] = path[i], [bx, bz] = path[i + 1];
                const run2 = (bx - ax) ** 2 + (bz - az) ** 2;
                const t = run2 > 1e-9 ? Math.max(0, Math.min(1, ((wx - ax) * (bx - ax) + (wz - az) * (bz - az)) / run2)) : 0;
                best = Math.min(best, Math.hypot(wx - (ax + (bx - ax) * t), wz - (az + (bz - az) * t)));
            }
            return best;
        };
        // Carve: under the river its bed, beside it a bank sloping up out of the water; never raised.
        const bankRun = 1.5;
        const reach = half + bankRun;
        let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
        for (const [x, z] of path) { bx0 = Math.min(bx0, x); bz0 = Math.min(bz0, z); bx1 = Math.max(bx1, x); bz1 = Math.max(bz1, z); }
        const cx0 = Math.max(0, Math.floor(bx0 - reach - 1)), cz0 = Math.max(0, Math.floor(bz0 - reach - 1));
        const cx1 = Math.min(W, Math.ceil(bx1 + reach + 1)), cz1 = Math.min(H, Math.ceil(bz1 + reach + 1));
        const grid = ensureTerrain(mapData);
        if (!grid) return null;
        const stride = W + 1;
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
            const d = distanceTo(cx, cz);
            if (d > reach) continue;
            const surface = riverLevelAt(shape, cx, cz);
            const shallow = surface - 0.3 * depth;
            const bed = d <= half ? surface - depth * (1 - 0.7 * (d / half) * (d / half))
                : shallow + (d - half) / bankRun * (surface + RIVER_FREEBOARD + 0.2 - shallow);
            const index = cz * stride + cx, elevation = (Number(at(mapData, Math.min(W - 1, cx), Math.min(H - 1, cz))) || 0);
            const current = Number(grid[index]) || 0;
            const next = Math.max(-TERRAIN_MAX, Math.round((bed - elevation) * 1000) / 1000);
            if (next < current - 1e-6) {
                grid[index] = next;
                x0 = Math.min(x0, cx); z0 = Math.min(z0, cz); x1 = Math.max(x1, cx); z1 = Math.max(z1, cz);
            }
        }
        // The wet cells on the carved ground: near the line and under the surface there.
        const mx0 = Math.max(0, Math.floor(bx0 - half - 1)), mz0 = Math.max(0, Math.floor(bz0 - half - 1));
        const mx1 = Math.min(W - 1, Math.ceil(bx1 + half)), mz1 = Math.min(H - 1, Math.ceil(bz1 + half));
        const wet = [];
        let wx0 = Infinity, wz0 = Infinity, wx1 = -Infinity, wz1 = -Infinity;
        for (let z = mz0; z <= mz1; z++) for (let x = mx0; x <= mx1; x++) {
            if (distanceTo(x + 0.5, z + 0.5) > half + 0.5) continue;
            const above = riverLevelAt(shape, x + 0.5, z + 0.5) - ground(x + 0.5, z + 0.5);
            // Dry, or far over the ground (beside a lip, where a cliff falls away): not the river's.
            if (above <= 0.02 || (above > depth + 2 && !lakes.some(region => waterCovers(region, x, z)))) continue;
            wet.push([x, z]);
            wx0 = Math.min(wx0, x); wz0 = Math.min(wz0, z); wx1 = Math.max(wx1, x); wz1 = Math.max(wz1, z);
        }
        if (!wet.length) return null;
        const bw = wx1 - wx0 + 1, bh = wz1 - wz0 + 1, cells = new Uint8Array(bw * bh);
        for (const [x, z] of wet) cells[(z - wz0) * bw + (x - wx0)] = 1;
        let mask = '';
        for (let i = 0; i < cells.length; i++) mask += cells[i] ? '1' : '0';
        const raw = Object.assign({ x0: wx0, y0: wz0, x1: wx1, y1: wz1, level: 0, material: options.material || 'Water', mask, path }, options.flow !== undefined ? { flow: options.flow } : {});
        for (const key of ['reflect', 'gloss', 'tint', 'colour', 'clear', 'waves', 'glow']) if (options[key] !== undefined) raw[key] = options[key];
        const sheet = normalizeWater(raw, mapData);
        if (!sheet || !writeWater(mapData, water(mapData).concat([sheet]))) return null;
        return { sheet, region: x0 <= x1 ? { x0: Math.max(0, x0 - 1), x1: Math.min(W, x1 + 1), z0: Math.max(0, z0 - 1), z1: Math.min(H, z1 + 1) } : null };
    };

    const waterSnapshot = mapData => water(mapData);
    const restoreWater = (mapData, saved) => writeWater(mapData, Array.isArray(saved) ? saved.map(raw => normalizeWater(raw, mapData)).filter(Boolean) : []);
    /** Every material the map's pieces wear, each once. */
    const pieceMaterials = mapData => Array.from(new Set(pieces(mapData).map(piece => piece.material)
        // A rock's top is a material too, but for "ground", the map's own floor.
        .concat(pieces(mapData).map(piece => piece.cap && piece.cap !== 'ground' ? piece.cap : ''))
        .concat(water(mapData).map(region => region.material)).filter(Boolean))).sort();

    /**
     * A map resized about an anchor: everything in its sidecar that stands
     * at a map position moves by the same offset the tiles and events did
     * (`dx`, `dy`, the old map's cell 0,0 in the new map), and what falls off
     * the new edge goes as the tiles there do. Heights, terrain corners and
     * 3D object cells shift as grids; pieces, building records and their
     * spots, props, unattached lights, screens and ponds move as points.
     * Called with the map already at its new size; the old size is given.
     */
    const resizeSidecar = (mapData, oldWidth, oldHeight, dx, dy) => {
        const sidecar = mapData && mapData.reactor3d;
        const W = mapData && mapData.width, H = mapData && mapData.height;
        if (!sidecar || typeof sidecar !== 'object' || !(W > 0) || !(H > 0) || !(oldWidth > 0) || !(oldHeight > 0)) return false;
        dx = Math.floor(Number(dx) || 0); dy = Math.floor(Number(dy) || 0);
        const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
        const shiftGrid = (cells, ow, oh, nw, nh, fill) => {
            const out = new Array(nw * nh).fill(fill);
            for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
                const tx = x + dx, ty = y + dy;
                if (tx >= 0 && ty >= 0 && tx < nw && ty < nh) out[ty * nw + tx] = cells[y * ow + x];
            }
            return out;
        };
        if (Array.isArray(sidecar.elevation) && sidecar.elevation.length === oldWidth * oldHeight) {
            sidecar.elevation = shiftGrid(sidecar.elevation, oldWidth, oldHeight, W, H, MIN);
        }
        if (Array.isArray(sidecar.terrain)) {
            const tw = Number(sidecar.terrainWidth) > 0 ? Number(sidecar.terrainWidth) : oldWidth;
            if (sidecar.terrain.length % (tw + 1) === 0) {
                sidecar.terrain = shiftGrid(sidecar.terrain.map(v => Number(v) || 0), tw + 1, sidecar.terrain.length / (tw + 1), W + 1, H + 1, 0);
                sidecar.terrainWidth = W;
            }
        }
        // Foliage density and bushes move with the cells (MapFoliage.resize).
        const foliage = root.RRMapFoliage || (typeof require === 'function' && typeof module !== 'undefined' ? (() => { try { return require('./MapFoliage.js'); } catch (_) { return null; } })() : null);
        if (sidecar.foliage && foliage) foliage.resize(mapData, oldWidth, oldHeight, dx, dy);
        // The ground types' paint moves with the cells too (MapGround.resize).
        const groundTypes = root.RRMapGround || (typeof require === 'function' && typeof module !== 'undefined' ? (() => { try { return require('./MapGround.js'); } catch (_) { return null; } })() : null);
        if (sidecar.ground && groundTypes) groundTypes.resize(mapData, oldWidth, oldHeight, dx, dy);
        for (const field of ['objects', 'objectGround']) {
            const store = sidecar[field];
            if (!store || typeof store !== 'object') continue;
            for (const layer of Object.keys(store)) {
                if (Array.isArray(store[layer]) && store[layer].length === oldWidth * oldHeight) store[layer] = shiftGrid(store[layer], oldWidth, oldHeight, W, H, 0);
            }
        }
        if (Array.isArray(sidecar.pieces)) {
            sidecar.pieces = sidecar.pieces.filter(piece => piece && typeof piece === 'object')
                .map(piece => Object.assign({}, piece, { x: Number(piece.x) + dx, y: Number(piece.y) + dy }))
                .filter(piece => inside(piece.x, piece.y));
            if (!sidecar.pieces.length) delete sidecar.pieces;
        }
        if (Array.isArray(sidecar.structures)) {
            const groups = new Set((sidecar.pieces || []).map(piece => piece.group).filter(Boolean));
            sidecar.structures = sidecar.structures.filter(entry => entry && groups.has(entry.group)).map(entry => {
                const spots = {};
                for (const [name, at] of Object.entries(entry.spots || {})) if (Array.isArray(at)) spots[name] = [Number(at[0]) + dx, Number(at[1]) + dy];
                return Object.assign({}, entry, { x: (Number(entry.x) || 0) + dx, y: (Number(entry.y) || 0) + dy, spots });
            });
            if (!sidecar.structures.length) delete sidecar.structures;
        }
        if (Array.isArray(sidecar.props)) {
            sidecar.props = sidecar.props.filter(prop => prop && typeof prop === 'object')
                .map(prop => Object.assign({}, prop, { x: Number(prop.x) + dx, y: Number(prop.y) + dy }))
                .filter(prop => inside(Math.floor(prop.x), Math.floor(prop.y)));
            if (!sidecar.props.length) delete sidecar.props;
        }
        if (Array.isArray(sidecar.lights)) {
            // An attached light's x and y are offsets from what carries it, and move with that.
            sidecar.lights = sidecar.lights.filter(light => light && typeof light === 'object').map(light => {
                const attached = light.attach && (light.attach.player || Number(light.attach.event) > 0);
                return attached || light.type === 'sun' ? light : Object.assign({}, light, { x: Number(light.x) + dx, y: Number(light.y) + dy });
            }).filter(light => (light.attach && (light.attach.player || Number(light.attach.event) > 0)) || light.type === 'sun' || inside(Math.floor(light.x), Math.floor(light.y)));
            if (!sidecar.lights.length) delete sidecar.lights;
        }
        if (Array.isArray(sidecar.mediaSurfaces)) {
            sidecar.mediaSurfaces = sidecar.mediaSurfaces.filter(row => row && typeof row === 'object')
                .map(row => row.target && row.target !== 'map' ? row : Object.assign({}, row, { x: Number(row.x) + dx, y: Number(row.y) + dy }))
                .filter(row => (row.target && row.target !== 'map') || inside(Math.floor(row.x + 0.5), Math.floor(row.y + 0.5)));
            if (!sidecar.mediaSurfaces.length) delete sidecar.mediaSurfaces;
        }
        if (Array.isArray(sidecar.water)) {
            sidecar.water = sidecar.water.map(sheet => normalizeWater(sheet && Object.assign({}, sheet, { x0: Number(sheet.x0) + dx, x1: Number(sheet.x1) + dx, y0: Number(sheet.y0) + dy, y1: Number(sheet.y1) + dy },
                Array.isArray(sheet.path) ? { path: sheet.path.map(point => Array.isArray(point) ? [Number(point[0]) + dx, Number(point[1]) + dy].concat(point.slice(2)) : point) } : {}), mapData))
                .filter(sheet => sheet && (!sheet.mask || sheet.mask.includes('1')));
            if (!sidecar.water.length) delete sidecar.water;
        }
        // The recorded size stays the old one: it is how Map Properties knows the sidecar changed and writes it.
        return true;
    };

    const api = {
        resizeSidecar,
        WATER_MAX_LEVEL, normalizeWater, water, hasWater, addWater, waterCovers, waterAt, removeWaterAt, removeWaterRegion, styleWaterRegion, waterWalls, waterBasin, fillWaterAt, refitWater, waterSnapshot, restoreWater,
        normalizeRiverPath, riverLevelAt, sheetLevelAt, carveRiver,
        EVENT_SIZE_MAX, eventSize, eventSizeEntry, eventSizeAuto, eventSizeCentered, eventFootprintOrigin, eventMarkerOffset, markEventSizes, convertEventSizes, setEventSize, setEventSizeAuto, footprintOfTiles, PIECE_KINDS, PIECE_FINISHES, SHAPE_KINDS, SHAPE_PARAMS, PIECE_MAX_LEVEL, normalizePiece, normalizeDoor, normalizeWindowFrame, DOOR_STYLES, DOOR_OPENS, WINDOW_STYLES, pieces, hasPieces, pieceAt, setPiece, removePiece,
        piecesSnapshot, restorePieces, clearPieces, pieceMaterials,
        nextPieceGroup, pieceGroup, pieceGroupBounds, pieceGroupAt, groupConnectedPieces, movePieceGroup, removePieceGroup, rotatePieceGroup,
        structures, structureOf, setStructure, restoreStructures, removeStructure, relocatePropsOff,
        SUFFIX, VERSION, MODE_3D, MAX, MIN,
        CAMERA_MODES, camera, setCamera,
        PROP_MAX_LIFT, PROP_DIRECTIONS, normalizeProp, props, propById, addProp, updateProp, removeProp,
        NOTE_TAG, hasNote, addNote, removeNote, setMode3D,
        ROOM_DEFAULT_HEIGHT, ROOM_MIN_HEIGHT, ROOM_MAX_HEIGHT,
        clampRoomHeight, room, setRoom, roomCliff, clampCliffSlope, ROOM_CLIFF, ROOM_CLIFF_SLOPE,
        clamp, fileNameFor, ensure, at, setAt, raiseAt,
        snapshot, restore, isFlat, save,
        TERRAIN_MAX, TERRAIN_MODES, terrain, hasTerrain, ensureTerrain, terrainAt, terrainHeightAt,
        paintTerrain, terrainSnapshot, restoreTerrain, restoreTerrainChanges, clearTerrain,
        duneHeightAt, duneSettings, DUNE_DEFAULT, DUNE_LEE, DUNE_WALK_SLOPE, LOWER_BANK_SLOPE
    };
    /**
     * A sidecar as text: readable, and not four times its data. Each top-level
     * field on its own line; a grid of numbers one map row a line; a list of
     * records (pieces, props, lights) one record a line; anything else
     * compact. Pretty-printing put every number and every piece field on a
     * line of its own, which roughly doubled a built map's file.
     */
    api.stringifySidecar = function(sidecar) {
        if (!sidecar || typeof sidecar !== 'object' || Array.isArray(sidecar)) return JSON.stringify(sidecar);
        const rowOf = key => {
            if (key === 'elevation') return Math.floor(Number(sidecar.width)) || 0;
            // The terrain is a corner grid: `terrainWidth` is the map's width in tiles, a row one more.
            if (key === 'terrain') { const w = Math.floor(Number(sidecar.terrainWidth)) || 0; return w > 0 ? w + 1 : 0; }
            return 0;
        };
        const value = (key, v) => {
            // Foliage: its wind, then a layer or a bush a line. Ground: a type a line.
            if ((key === 'foliage' || key === 'ground') && v && typeof v === 'object' && !Array.isArray(v)) {
                const parts = Object.keys(v).map(k => '    ' + JSON.stringify(k) + ': ' + (Array.isArray(v[k]) && v[k].length && v[k].every(item => item && typeof item === 'object')
                    ? '[\n' + v[k].map(item => '      ' + JSON.stringify(item)).join(',\n') + '\n    ]' : JSON.stringify(v[k])));
                return '{\n' + parts.join(',\n') + '\n  }';
            }
            if (!Array.isArray(v) || !v.length) return JSON.stringify(v);
            const row = rowOf(key);
            if (row > 0 && v.every(n => typeof n === 'number' || n === null)) {
                const lines = [];
                for (let i = 0; i < v.length; i += row) lines.push('    ' + v.slice(i, i + row).map(n => JSON.stringify(n)).join(','));
                return '[\n' + lines.join(',\n') + '\n  ]';
            }
            if (v.every(item => item && typeof item === 'object')) return '[\n' + v.map(item => '    ' + JSON.stringify(item)).join(',\n') + '\n  ]';
            return JSON.stringify(v);
        };
        const keys = Object.keys(sidecar).filter(key => sidecar[key] !== undefined);
        return '{\n' + keys.map(key => '  ' + JSON.stringify(key) + ': ' + value(key, sidecar[key])).join(',\n') + '\n}';
    };

    root.RRMapElevation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
