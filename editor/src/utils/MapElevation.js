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
    const paintTerrain = (mapData, x, y, options = {}) => {
        const grid = ensureTerrain(mapData);
        if (!grid) return false;
        const mode = TERRAIN_MODES.includes(options.mode) ? options.mode : 'raise';
        const radius = Math.max(0.5, Math.min(64, Number(options.radius) || 3));
        const strength = Math.max(0.01, Math.min(4, Number(options.strength) || 0.25));
        const stride = mapData.width + 1;
        const x0 = Math.max(0, Math.floor(x - radius)), x1 = Math.min(mapData.width, Math.ceil(x + radius));
        const y0 = Math.max(0, Math.floor(y - radius)), y1 = Math.min(mapData.height, Math.ceil(y + radius));
        const before = mode === 'smooth' ? grid.slice() : null;
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
                else if (mode === 'lower') next = current - strength * falloff;
                else if (mode === 'smooth') {
                    let sum = 0, count = 0;
                    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx > mapData.width || ny > mapData.height) continue;
                        sum += Number(before[ny * stride + nx]) || 0; count++;
                    }
                    next = current + ((sum / count) - current) * Math.min(1, strength * 2) * falloff;
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
        if (isFlat(mapData) && !grouped && !media && !modeled && !lifted && !previewed && !roomed && !propped && !built && !lit
            && !(sidecar3d && sidecar3d.camera)) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return true;
        }
        const sidecar = ensure(mapData);
        if (!sidecar) return false;
        const json = JSON.stringify(sidecar, null, 2);
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

    const normalizeRoom = room => {
        const source = room && typeof room === 'object' ? room : {};
        const name = value => (typeof value === 'string' ? value.trim() : '');
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
            skyScrollY: scroll(source.skyScrollY)
        };
    };

    const isDefaultRoom = room =>
        !room.floor && !room.walls && !room.ceiling && !room.sky && !room.skyScrollX && !room.skyScrollY
        && room.height === ROOM_DEFAULT_HEIGHT;

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
            effect: names(raw.effects, raw.effect)[0] || ''
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
    const SHAPE_KINDS = ['box', 'wedge', 'pyramid', 'prism', 'cylinder', 'tube', 'cone', 'dome', 'sphere', 'arch', 'tunnel', 'ring'];
    const PIECE_KINDS = ['wall', 'block', 'floor', 'pillar', 'stair', 'ramp', 'roof', 'doorway', 'window', 'fence'].concat(SHAPE_KINDS);
    const PIECE_MAX_LEVEL = 120;
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
        }
        return piece;
    };
    const pieces = mapData => {
        const sidecar = mapData && mapData.reactor3d;
        const list = sidecar && Array.isArray(sidecar.pieces) ? sidecar.pieces : [];
        return list.map(raw => normalizePiece(raw, mapData)).filter(Boolean);
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
        const at = list.findIndex(piece => piece.x === next.x && piece.y === next.y && piece.z === next.z);
        const same = at >= 0 && list[at].kind === next.kind && list[at].rot === next.rot && list[at].material === next.material;
        if (same) return list[at].id;
        next.id = at >= 0 ? list[at].id : list.reduce((max, piece) => Math.max(max, piece.id), 0) + 1;
        if (at >= 0) list[at] = next; else list.push(next);
        return writePieces(mapData, list) ? next.id : 0;
    };
    const removePiece = (mapData, x, y, z) => {
        if (!mapData) return false;
        const list = pieces(mapData);
        const kept = list.filter(piece => !(piece.x === x && piece.y === y && piece.z === z));
        if (kept.length === list.length) return false;
        return writePieces(mapData, kept);
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
        const list = pieces(mapData).map(piece => piece.group !== group ? piece
            : Object.assign({}, piece, { x: bounds.x0 + (h - 1 - (piece.y - bounds.y0)), y: bounds.y0 + (piece.x - bounds.x0), rot: (piece.rot + 1) % 4 }));
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
    const relocatePropsOff = (mapData, x0, y0, w, h) => {
        if (!mapData || !mapData.reactor3d || !Array.isArray(mapData.reactor3d.props)) return 0;
        let moved = 0;
        for (const prop of props(mapData)) {
            if (!(prop.x >= x0 && prop.x < x0 + w && prop.y >= y0 && prop.y < y0 + h)) continue;
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
        for (const group of new Set(list.map(piece => piece.group).filter(Boolean))) {
            const bounds = pieceGroupBounds(mapData, group);
            if (bounds && x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1) return group;
        }
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
     * Water: rectangles of cells under a sheet at one height. A shore is
     * the terrain sloping below it; the runtime blocks water deeper than a
     * wade. `water: [{x0, y0, x1, y1, level, material}]` in the sidecar.
     */
    const WATER_MAX_LEVEL = 60;
    const normalizeWater = (raw, mapData) => {
        if (!raw || typeof raw !== 'object') return null;
        let x0 = Math.floor(Number(raw.x0)), y0 = Math.floor(Number(raw.y0)), x1 = Math.floor(Number(raw.x1)), y1 = Math.floor(Number(raw.y1));
        if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
        if (x1 < x0) [x0, x1] = [x1, x0];
        if (y1 < y0) [y0, y1] = [y1, y0];
        if (mapData) { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(mapData.width - 1, x1); y1 = Math.min(mapData.height - 1, y1); }
        if (x1 < x0 || y1 < y0) return null;
        const level = Math.max(-WATER_MAX_LEVEL, Math.min(WATER_MAX_LEVEL, Number(raw.level) || 0));
        return { x0, y0, x1, y1, level: Math.round(level * 100) / 100, material: typeof raw.material === 'string' ? raw.material.trim() : '' };
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
    /** Remove every sheet over a cell. */
    const removeWaterAt = (mapData, x, y) => {
        const list = water(mapData);
        const kept = list.filter(region => !(x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1));
        if (kept.length === list.length) return false;
        return writeWater(mapData, kept);
    };
    const waterSnapshot = mapData => water(mapData);
    const restoreWater = (mapData, saved) => writeWater(mapData, Array.isArray(saved) ? saved.map(raw => normalizeWater(raw, mapData)).filter(Boolean) : []);
    /** Every material the map's pieces wear, each once. */
    const pieceMaterials = mapData => Array.from(new Set(pieces(mapData).map(piece => piece.material).concat(water(mapData).map(region => region.material)).filter(Boolean))).sort();

    const api = {
        WATER_MAX_LEVEL, normalizeWater, water, hasWater, addWater, removeWaterAt, waterSnapshot, restoreWater,
        PIECE_KINDS, SHAPE_KINDS, PIECE_MAX_LEVEL, normalizePiece, pieces, hasPieces, pieceAt, setPiece, removePiece,
        piecesSnapshot, restorePieces, clearPieces, pieceMaterials,
        nextPieceGroup, pieceGroup, pieceGroupBounds, pieceGroupAt, groupConnectedPieces, movePieceGroup, removePieceGroup, rotatePieceGroup,
        structures, structureOf, setStructure, restoreStructures, removeStructure, relocatePropsOff,
        SUFFIX, VERSION, MODE_3D, MAX, MIN,
        CAMERA_MODES, camera, setCamera,
        PROP_MAX_LIFT, PROP_DIRECTIONS, normalizeProp, props, propById, addProp, updateProp, removeProp,
        NOTE_TAG, hasNote, addNote, removeNote, setMode3D,
        ROOM_DEFAULT_HEIGHT, ROOM_MIN_HEIGHT, ROOM_MAX_HEIGHT,
        clampRoomHeight, room, setRoom,
        clamp, fileNameFor, ensure, at, setAt, raiseAt,
        snapshot, restore, isFlat, save,
        TERRAIN_MAX, TERRAIN_MODES, terrain, hasTerrain, ensureTerrain, terrainAt, terrainHeightAt,
        paintTerrain, terrainSnapshot, restoreTerrain, clearTerrain
    };
    root.RRMapElevation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
