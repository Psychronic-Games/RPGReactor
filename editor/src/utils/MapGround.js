/**
 * A 3D map's ground types in its sidecar (`ground`): the grounds painted over
 * the room's floor, each a material with a tint, a scale and a level 0-9 per
 * cell. The runtime draws them (reactor_3d_world.js, "Ground types"); this
 * edits the data, for the Build bar's Ground brush and for paint-ground.cjs.
 *
 * Every change writes a new `ground` object, so the runtime's memo of the old
 * one is simply left behind.
 */
(function(root) {
    'use strict';

    /** As many types as the runtime draws (Reactor3D.GROUND_TYPES_MAX). */
    const MAX = 64;
    const runtime = () => {
        if (root.Reactor3D && root.Reactor3D.decodeGroundPaint) return root.Reactor3D;
        if (typeof require === 'function' && typeof module !== 'undefined') {
            try { return require('../../../runtime/reactor_3d.js'); } catch (_) { return null; }
        }
        return null;
    };

    /** Runs to levels (the runtime's own codec when it is loaded, else this copy of it). */
    const decode = (text, size) => {
        const R = runtime();
        if (R) return R.decodeGroundPaint(text, size);
        const out = new Uint8Array(Math.max(0, size | 0));
        let i = 0;
        for (const token of String(text || '').split(/[\s,]+/)) {
            if (!token || i >= out.length) continue;
            const m = /^([0-9])(?:x(\d+))?$/.exec(token);
            if (!m) continue;
            const count = m[2] ? Math.min(Number(m[2]), out.length - i) : 1;
            if (Number(m[1])) out.fill(Number(m[1]), i, i + count);
            i += count;
        }
        return out;
    };
    const encode = levels => {
        const R = runtime();
        if (R) return R.encodeGroundPaint(levels);
        const parts = [];
        let end = levels.length;
        while (end > 0 && !levels[end - 1]) end--;
        for (let i = 0; i < end;) {
            let j = i + 1;
            while (j < end && levels[j] === levels[i]) j++;
            parts.push(j - i > 1 ? levels[i] + 'x' + (j - i) : String(levels[i]));
            i = j;
        }
        return parts.join(' ');
    };

    const raw = mapData => (mapData && mapData.reactor3d && mapData.reactor3d.ground && typeof mapData.reactor3d.ground === 'object') ? mapData.reactor3d.ground : null;
    const clone = value => JSON.parse(JSON.stringify(value));
    const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

    /** A type as it is stored: only what differs from a plain one is kept. */
    const typeRecord = (source = {}) => {
        const material = typeof source.material === 'string' ? source.material.trim() : '';
        if (!material) return null;
        const out = {};
        const name = typeof source.name === 'string' ? source.name.trim() : '';
        if (name && name !== material) out.name = name;
        out.material = material;
        if (hex(source.tint) && source.tint.toLowerCase() !== '#ffffff') out.tint = source.tint.toLowerCase();
        const scale = Number(source.scale);
        if (source.scale !== null && source.scale !== '' && source.scale !== undefined && Number.isFinite(scale) && scale > 0) out.scale = Math.round(Math.max(0.25, Math.min(32, scale)) * 100) / 100;
        if (source.bare === true) out.bare = true;
        // The ground a biome laid over the whole floor: the next biome replaces it.
        if (source.biome === true) out.biome = true;
        out.paint = typeof source.paint === 'string' ? source.paint : '';
        return out;
    };

    /** Write a new ground object (or none, when no type is left). */
    const write = (mapData, list) => {
        if (!mapData) return;
        if (!mapData.reactor3d || typeof mapData.reactor3d !== 'object') mapData.reactor3d = { version: 1, mode: '3d' };
        const types = list.map(typeRecord).filter(Boolean).slice(0, MAX);
        if (!types.length) delete mapData.reactor3d.ground;
        else mapData.reactor3d.ground = { types };
    };

    /** The map's types as stored (a copy): `[{ name?, material, tint?, scale?, bare?, paint }]`. */
    const types = mapData => { const data = raw(mapData); return data && Array.isArray(data.types) ? clone(data.types).map(typeRecord).filter(Boolean).slice(0, MAX) : []; };
    const hasGround = mapData => types(mapData).length > 0;
    const hasPaint = mapData => types(mapData).some(type => /[1-9]/.test(type.paint));
    const materials = mapData => Array.from(new Set(types(mapData).map(type => type.material)));
    const snapshot = mapData => (raw(mapData) ? clone(raw(mapData)) : null);
    const restore = (mapData, saved) => {
        if (!mapData) return false;
        if (!saved) { if (mapData.reactor3d) delete mapData.reactor3d.ground; return true; }
        if (!mapData.reactor3d) mapData.reactor3d = { version: 1, mode: '3d' };
        mapData.reactor3d.ground = clone(saved);
        return true;
    };

    /** Add a type; its place in the list, or -1 when the map has as many as it may (or no material is named). */
    const addType = (mapData, source) => {
        const list = types(mapData), record = typeRecord(Object.assign({}, source, { paint: '' }));
        if (!record || list.length >= MAX) return -1;
        list.push(record);
        write(mapData, list);
        return list.length - 1;
    };

    /** Change a type's name, material, tint, scale or bare; its paint stays. */
    const updateType = (mapData, index, patch) => {
        const list = types(mapData);
        if (!list[index]) return false;
        const next = typeRecord(Object.assign({}, list[index], patch, { paint: list[index].paint }));
        if (!next) return false;
        list[index] = next;
        write(mapData, list);
        return true;
    };

    /** Take a type away, and its paint with it. */
    const removeType = (mapData, index) => {
        const list = types(mapData);
        if (!list[index]) return false;
        list.splice(index, 1);
        write(mapData, list);
        return true;
    };

    const grow = (touched, x, y) => (touched ? { x0: Math.min(touched.x0, x), y0: Math.min(touched.y0, y), x1: Math.max(touched.x1, x), y1: Math.max(touched.y1, y) } : { x0: x, y0: y, x1: x, y1: y });

    /**
     * Paint a type round a point (tiles; a cell's middle is x + 0.5): its level
     * rises toward `level` by `strength`, whole within the brush and falling off
     * over the outer `soft` (0-1) of its radius; the types lying over it thin out
     * there by as much, so what is painted shows. `erase` thins every type, back
     * to the room's floor. Returns the cells touched, or null.
     */
    const paint = (mapData, index, cx, cy, options = {}) => paintMany(mapData, index, [[cx, cy]], options);
    /** `paint` at each of `points` ([x, y] each, tiles), read and written once: a stroke's dabs along a line together. */
    const paintMany = (mapData, index, points, options = {}) => {
        if (!mapData || !Array.isArray(points) || !points.length) return null;
        const list = types(mapData);
        if (!options.erase && !list[index]) return null;
        const W = mapData.width, H = mapData.height, size = W * H;
        const radius = Math.max(0.5, Number(options.radius) || 3), strength = Math.max(0.05, Math.min(1, Number(options.strength) || 0.5));
        const level = Math.max(1, Math.min(9, Math.round(Number(options.level) || 9)));
        const soft = Math.max(0, Math.min(1, options.soft === undefined ? 0.4 : Number(options.soft) || 0));
        const levels = list.map(type => decode(type.paint, size)), dirty = list.map(() => false);
        let touched = null;
        for (const [cx, cy] of points)
        for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(H - 1, Math.floor(cy + radius)); y++) {
            for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(W - 1, Math.floor(cx + radius)); x++) {
                const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
                if (d > radius) continue;
                const inner = radius * (1 - soft);
                const fall = d <= inner ? 1 : 1 - (d - inner) / Math.max(0.0001, radius - inner);
                const i = y * W + x, amount = Math.min(1, strength * 1.6) * fall;
                for (let t = 0; t < list.length; t++) {
                    const was = levels[t][i];
                    let now = was;
                    if (options.erase || t > index) now = Math.max(0, Math.floor(was - 9 * amount + 0.0001));
                    else if (t === index) now = Math.min(9, Math.max(was, Math.round(was + (level - was) * amount)));
                    if (now === was) continue;
                    levels[t][i] = now; dirty[t] = true;
                    touched = grow(touched, x, y);
                }
            }
        }
        if (!touched) return null;
        list.forEach((type, t) => { if (dirty[t]) type.paint = encode(levels[t]); });
        write(mapData, list);
        return touched;
    };

    /**
     * Lay a type on every cell a test passes (`test(x, y)`), at `level`; the types
     * over it are cleared there. `index` -1 clears every type there instead.
     * Returns the cells changed.
     */
    const fill = (mapData, index, test, level = 9) => {
        if (!mapData) return 0;
        const list = types(mapData);
        if (index >= 0 && !list[index]) return 0;
        const W = mapData.width, H = mapData.height, size = W * H;
        const to = Math.max(0, Math.min(9, Math.round(Number(level))));
        const levels = list.map(type => decode(type.paint, size));
        let count = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (test && !test(x, y)) continue;
            const i = y * W + x;
            let changed = false;
            for (let t = 0; t < list.length; t++) {
                const now = t === index ? to : (index < 0 || t > index) ? 0 : levels[t][i];
                if (now !== levels[t][i]) { levels[t][i] = now; changed = true; }
            }
            if (changed) count++;
        }
        if (!count) return 0;
        list.forEach((type, t) => { type.paint = encode(levels[t]); });
        write(mapData, list);
        return count;
    };

    /** The levels of one type, a byte a cell (a copy). */
    const levelsOf = (mapData, index) => {
        const list = types(mapData);
        return list[index] ? decode(list[index].paint, mapData.width * mapData.height) : null;
    };

    /** The type a cell wears (its place in the list), or -1 for the room's floor. */
    const typeAt = (mapData, x, y) => {
        const list = types(mapData);
        if (!list.length || x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) return -1;
        const size = mapData.width * mapData.height, i = y * mapData.width + x;
        for (let t = list.length - 1; t >= 0; t--) if (decode(list[t].paint, size)[i] >= 5) return t;
        return -1;
    };

    /** The map changed size: the paint moves with its cells (`dx`, `dy` the old corner's new place). */
    const resize = (mapData, oldWidth, oldHeight, dx = 0, dy = 0) => {
        const list = types(mapData);
        if (!list.length) return false;
        const W = mapData.width, H = mapData.height;
        for (const type of list) {
            const was = decode(type.paint, oldWidth * oldHeight), now = new Uint8Array(W * H);
            for (let y = 0; y < oldHeight; y++) for (let x = 0; x < oldWidth; x++) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < W && ny < H) now[ny * W + nx] = was[y * oldWidth + x];
            }
            type.paint = encode(now);
        }
        write(mapData, list);
        return true;
    };

    const api = { MAX, decode, encode, types, hasGround, hasPaint, materials, snapshot, restore, addType, updateType, removeType, paint, paintMany, fill, levelsOf, typeAt, resize, typeRecord };
    root.RRMapGround = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
