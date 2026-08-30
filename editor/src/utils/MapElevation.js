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
    const MAX = 20;
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
        return !heights || heights.every(value => !value);
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
        const previewed = !!(sidecar3d && sidecar3d.eventPreviews
            && Object.keys(sidecar3d.eventPreviews).length);
        const roomed = !!(sidecar3d && sidecar3d.room);
        const propped = !!(sidecar3d && Array.isArray(sidecar3d.props) && sidecar3d.props.length);
        if (isFlat(mapData) && !grouped && !modeled && !previewed && !roomed && !propped
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
        return {
            height: clampRoomHeight(source.height),
            floor: name(source.floor),
            walls: name(source.walls),
            ceiling: name(source.ceiling)
        };
    };

    const isDefaultRoom = room =>
        !room.floor && !room.walls && !room.ceiling && room.height === ROOM_DEFAULT_HEIGHT;

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
            animation: raw.animation ? String(raw.animation) : '',
            repeat: raw.repeat === true || raw.repeat === 'true',
            effect: raw.effect ? String(raw.effect) : ''
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

    const api = {
        SUFFIX, VERSION, MODE_3D, MAX, MIN,
        CAMERA_MODES, camera, setCamera,
        PROP_MAX_LIFT, PROP_DIRECTIONS, normalizeProp, props, propById, addProp, updateProp, removeProp,
        NOTE_TAG, hasNote, addNote, removeNote, setMode3D,
        ROOM_DEFAULT_HEIGHT, ROOM_MIN_HEIGHT, ROOM_MAX_HEIGHT,
        clampRoomHeight, room, setRoom,
        clamp, fileNameFor, ensure, at, setAt, raiseAt,
        snapshot, restore, isFlat, save
    };
    root.RRMapElevation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
