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
        if (isFlat(mapData) && !grouped && !modeled && !(sidecar3d && sidecar3d.camera)) {
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

    const api = {
        SUFFIX, VERSION, MODE_3D, MAX, MIN,
        NOTE_TAG, hasNote, addNote, removeNote,
        clamp, fileNameFor, ensure, at, setAt, raiseAt,
        snapshot, restore, isFlat, save
    };
    root.RRMapElevation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
