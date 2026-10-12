/**
 * A 3D map's foliage in its sidecar (`foliage`): the layers of grass, flowers,
 * ferns and reeds painted as a density per cell, the bushes stood one by one,
 * and the map's wind. The runtime grows and draws them (reactor_3d_foliage.js);
 * this edits the data, for the Build bar's Foliage brushes and for
 * paint-foliage.cjs.
 *
 * Every change writes a new `foliage` object, so the runtime's memo of the
 * old one is simply left behind.
 */
(function(root) {
    'use strict';

    const KINDS = ['grass', 'flowers', 'fern', 'reeds', 'bulbs', 'tendrils', 'crystals'];
    /** The kinds whose heads take a list of colors. */
    const PALETTE_KINDS = ['flowers', 'bulbs'];
    const runtime = () => {
        if (root.Reactor3D && root.Reactor3D.decodeFoliageDensity) return root.Reactor3D;
        if (typeof require === 'function' && typeof module !== 'undefined') {
            try { return require('../../../runtime/reactor_3d.js'); } catch (_) { return null; }
        }
        return null;
    };

    /** Runs to levels (the runtime's own codec when it is loaded, else this copy of it). */
    const decode = (text, size) => {
        const R = runtime();
        if (R) return R.decodeFoliageDensity(text, size);
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
        if (R) return R.encodeFoliageDensity(levels);
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

    const raw = mapData => (mapData && mapData.reactor3d && mapData.reactor3d.foliage && typeof mapData.reactor3d.foliage === 'object') ? mapData.reactor3d.foliage : null;
    const clone = value => JSON.parse(JSON.stringify(value));

    /** Write a new foliage object (or none, when nothing is left). */
    const write = (mapData, next) => {
        if (!mapData) return;
        if (!mapData.reactor3d || typeof mapData.reactor3d !== 'object') mapData.reactor3d = { version: 1, mode: '3d' };
        const layers = (next.layers || []).filter(layer => layer && /[1-9]/.test(String(layer.density || '')));
        const bushes = next.bushes || [];
        const out = {};
        if (next.wind && Object.keys(next.wind).length) out.wind = next.wind;
        if (layers.length) out.layers = layers;
        if (bushes.length) out.bushes = bushes;
        if (!out.layers && !out.bushes) delete mapData.reactor3d.foliage;
        else mapData.reactor3d.foliage = out;
    };

    const foliage = mapData => clone(raw(mapData) || {});
    const hasFoliage = mapData => {
        const data = raw(mapData);
        return !!(data && ((Array.isArray(data.layers) && data.layers.some(layer => /[1-9]/.test(String(layer.density || '')))) || (Array.isArray(data.bushes) && data.bushes.length)));
    };
    const snapshot = mapData => (raw(mapData) ? clone(raw(mapData)) : null);
    const restore = (mapData, saved) => {
        if (!mapData) return false;
        if (!saved) { if (mapData.reactor3d) delete mapData.reactor3d.foliage; return true; }
        if (!mapData.reactor3d) mapData.reactor3d = { version: 1, mode: '3d' };
        mapData.reactor3d.foliage = clone(saved);
        return true;
    };

    /** A layer's settings as the panel and the script give them; only what differs from the kind's own look is kept. */
    const layerSettings = (kind, settings = {}) => {
        const out = {};
        for (const key of ['height', 'vary', 'seed', 'glow']) if (Number.isFinite(Number(settings[key])) && settings[key] !== '' && settings[key] !== null && settings[key] !== undefined) out[key] = Math.round(Number(settings[key]) * 100) / 100;
        for (const key of ['colour', 'tip']) if (typeof settings[key] === 'string' && /^#[0-9a-f]{6}$/i.test(settings[key])) out[key] = settings[key].toLowerCase();
        if (PALETTE_KINDS.includes(kind) && Array.isArray(settings.colours)) out.colours = settings.colours.filter(c => /^#[0-9a-f]{6}$/i.test(c)).map(c => c.toLowerCase());
        return out;
    };

    /**
     * Paint a kind round a point (tiles; the cell's middle is x + 0.5): density
     * rises toward `level` by `strength`, softly at the brush's edge; `erase`
     * lowers it instead. The layer of that kind with the same settings is the
     * one painted (a new one if none). Returns the cells touched, or null.
     */
    const paint = (mapData, kind, cx, cy, options = {}) => {
        if (!mapData || !KINDS.includes(kind)) return null;
        const W = mapData.width, H = mapData.height, size = W * H;
        const radius = Math.max(0.5, Number(options.radius) || 3), strength = Math.max(0.05, Math.min(1, Number(options.strength) || 0.5));
        const level = Math.max(1, Math.min(9, Math.round(Number(options.level) || 7)));
        const data = foliage(mapData);
        data.layers = Array.isArray(data.layers) ? data.layers : [];
        const settings = layerSettings(kind, options.settings || {});
        const same = layer => layer.kind === kind && ['height', 'colour', 'tip', 'vary', 'glow'].every(key => (layer[key] ?? null) === (settings[key] ?? null));
        let layer = data.layers.find(same);
        if (!layer && !options.erase) { layer = Object.assign({ kind }, settings, { density: '' }); data.layers.push(layer); }
        const targets = options.erase ? data.layers.filter(l => l.kind === kind) : [layer];
        let touched = null;
        for (const target of targets) {
            if (!target) continue;
            const levels = decode(target.density, size);
            let changed = false;
            for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(H - 1, Math.floor(cy + radius)); y++) {
                for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(W - 1, Math.floor(cx + radius)); x++) {
                    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
                    if (d > radius) continue;
                    const fall = d < radius * 0.6 ? 1 : 1 - (d - radius * 0.6) / (radius * 0.4);
                    const i = y * W + x, was = levels[i];
                    let now;
                    if (options.erase) now = Math.max(0, Math.floor(was - 9 * strength * fall + 0.0001));
                    else now = Math.min(level, Math.max(was, Math.round(was + (level - was) * Math.min(1, strength * 1.6) * fall)));
                    if (now === was) continue;
                    levels[i] = now; changed = true;
                    touched = touched ? { x0: Math.min(touched.x0, x), y0: Math.min(touched.y0, y), x1: Math.max(touched.x1, x), y1: Math.max(touched.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
                }
            }
            if (changed) target.density = encode(levels);
        }
        if (!touched) return null;
        write(mapData, data);
        return touched;
    };

    /** Fill cells with a kind where a test says so (the script's rule fills), at a level. Returns the count. */
    const fill = (mapData, kind, test, level, settings = {}) => {
        if (!mapData || !KINDS.includes(kind)) return 0;
        const W = mapData.width, H = mapData.height;
        const data = foliage(mapData);
        data.layers = Array.isArray(data.layers) ? data.layers : [];
        const own = layerSettings(kind, settings);
        let layer = data.layers.find(l => l.kind === kind && ['height', 'colour', 'tip', 'vary', 'glow'].every(key => (l[key] ?? null) === (own[key] ?? null)));
        if (!layer) { layer = Object.assign({ kind }, own, { density: '' }); data.layers.push(layer); }
        const levels = decode(layer.density, W * H);
        let count = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const want = test(x, y);
            if (want === false || want === null || want === undefined) continue;
            const value = Math.max(0, Math.min(9, Math.round(typeof want === 'number' ? want : level)));
            if (levels[y * W + x] !== value) { levels[y * W + x] = value; count++; }
        }
        layer.density = encode(levels);
        write(mapData, data);
        return count;
    };

    const bushes = mapData => (raw(mapData) && Array.isArray(raw(mapData).bushes) ? raw(mapData).bushes.slice() : []);

    /** Stand a bush; returns it as written. */
    const addBush = (mapData, bush) => {
        if (!mapData || !bush) return null;
        const x = Number(bush.x), y = Number(bush.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > mapData.width || y > mapData.height) return null;
        const entry = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, size: Math.round(Math.max(0.4, Math.min(8, Number(bush.size) || 1.6)) * 100) / 100 };
        if (/^#[0-9a-f]{6}$/i.test(bush.colour || '')) entry.colour = bush.colour.toLowerCase();
        if (Number.isFinite(Number(bush.tall)) && Math.abs(Number(bush.tall) - 1) > 1e-6) entry.tall = Math.round(Number(bush.tall) * 100) / 100;
        if (/^#[0-9a-f]{6}$/i.test(bush.bloom || '')) entry.bloom = bush.bloom.toLowerCase();
        entry.seed = Number.isFinite(Number(bush.seed)) ? Math.floor(Number(bush.seed)) : Math.floor(Math.random() * 100000);
        const data = foliage(mapData);
        data.bushes = Array.isArray(data.bushes) ? data.bushes : [];
        data.bushes.push(entry);
        write(mapData, data);
        return entry;
    };

    /** Take away the bushes within a radius of a point; returns how many went. */
    const removeBushes = (mapData, cx, cy, radius) => {
        const data = foliage(mapData);
        if (!Array.isArray(data.bushes) || !data.bushes.length) return 0;
        const before = data.bushes.length;
        data.bushes = data.bushes.filter(b => Math.hypot(b.x - cx, b.y - cy) > Math.max(radius, (Number(b.size) || 1.6) * 0.5));
        if (data.bushes.length === before) return 0;
        write(mapData, data);
        return before - data.bushes.length;
    };

    const wind = mapData => {
        const R = runtime();
        const own = raw(mapData) && raw(mapData).wind;
        return R ? R.normalizeWind(own) : Object.assign({ dir: 30, strength: 0.6, gust: 1 }, own || {});
    };
    /** Set the map's wind; values equal to the defaults are left out. */
    const setWind = (mapData, patch) => {
        const data = foliage(mapData);
        const next = Object.assign({}, data.wind || {}, patch || {});
        const R = runtime();
        const defaults = (R && R.WIND_DEFAULT) || { dir: 30, strength: 0.6, gust: 1 };
        for (const key of Object.keys(next)) {
            const n = Number(next[key]);
            if (!Number.isFinite(n) || Math.abs(n - defaults[key]) < 1e-6) delete next[key];
            else next[key] = Math.round(n * 100) / 100;
        }
        data.wind = next;
        // Wind alone is no foliage: it is kept while something grows.
        write(mapData, data);
        return hasFoliage(mapData);
    };

    /** How much grows: clumps per kind and bushes, and an estimate of what the near field draws. */
    const stats = mapData => {
        const data = raw(mapData) || {};
        const size = mapData.width * mapData.height;
        const R = runtime();
        const per = (R && R.FOLIAGE_LOOKS) || { grass: { perLevel: 0.9 }, flowers: { perLevel: 0.3 }, fern: { perLevel: 0.22 }, reeds: { perLevel: 0.45 }, bulbs: { perLevel: 0.22 }, tendrils: { perLevel: 0.26 }, crystals: { perLevel: 0.3 } };
        const out = { layers: [], bushes: Array.isArray(data.bushes) ? data.bushes.length : 0 };
        for (const layer of Array.isArray(data.layers) ? data.layers : []) {
            const levels = decode(layer.density, size);
            let cells = 0, clumps = 0;
            for (const v of levels) if (v) { cells++; clumps += v * per[layer.kind].perLevel; }
            out.layers.push({ kind: layer.kind, cells, clumps: Math.round(clumps) });
        }
        return out;
    };

    /** Shift and crop with a map resize (dx, dy: where the old cell 0,0 lands). */
    const resize = (mapData, oldWidth, oldHeight, dx, dy) => {
        const data = raw(mapData);
        if (!data) return false;
        const next = clone(data);
        const W = mapData.width, H = mapData.height;
        for (const layer of Array.isArray(next.layers) ? next.layers : []) {
            const old = decode(layer.density, oldWidth * oldHeight), grown = new Uint8Array(W * H);
            for (let y = 0; y < oldHeight; y++) for (let x = 0; x < oldWidth; x++) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < W && ny < H) grown[ny * W + nx] = old[y * oldWidth + x];
            }
            layer.density = encode(grown);
        }
        if (Array.isArray(next.bushes)) next.bushes = next.bushes.map(b => Object.assign({}, b, { x: Math.round((b.x + dx) * 100) / 100, y: Math.round((b.y + dy) * 100) / 100 })).filter(b => b.x >= 0 && b.y >= 0 && b.x <= W && b.y <= H);
        write(mapData, next);
        return true;
    };

    /**
     * The cells where a piece stands on the ground (the runtime's rule: its foot under 1.5), as
     * y * 65536 + x; `accept` narrows it to some pieces (a building's group, a stroke's new pieces).
     */
    const coveredCells = (mapData, accept) => {
        const R = runtime(), out = new Set();
        const index = R && R.pieceIndex ? R.pieceIndex(mapData) : null;
        if (!index) return out;
        for (const [key, stack] of index.cells) if (stack.some(piece => (piece.z || 0) < 1.5 && (!accept || accept(piece)))) out.add(key);
        return out;
    };

    // A layer by everything that makes it look as it does: the same layer before and after a clear.
    const layerKey = layer => JSON.stringify([layer.kind, layer.height ?? null, layer.colour ?? null, layer.tip ?? null, layer.vary ?? null, layer.seed ?? null, layer.colours ?? null]);
    const bushOver = (bush, cells) => {
        const r = (Number(bush.size) || 1.6) * 0.4;
        for (let y = Math.floor(bush.y - r); y <= Math.floor(bush.y + r); y++) for (let x = Math.floor(bush.x - r); x <= Math.floor(bush.x + r); x++) {
            if (!cells.has(y * 65536 + x)) continue;
            const dx = Math.max(x - bush.x, 0, bush.x - (x + 1)), dy = Math.max(y - bush.y, 0, bush.y - (y + 1));
            if (Math.hypot(dx, dy) < r) return true;
        }
        return false;
    };

    /**
     * Take what grows off cells (a set of y * 65536 + x): their density in every layer, and the bushes
     * whose body reaches over one. Returns what went, for an undo (`uncover`), or null when nothing did.
     */
    const clearCells = (mapData, cells) => {
        const data = raw(mapData);
        if (!data || !cells || !cells.size) return null;
        const W = mapData.width, H = mapData.height, size = W * H;
        const next = clone(data), record = { layers: [], bushes: [], at: [] };
        for (const layer of Array.isArray(next.layers) ? next.layers : []) {
            const levels = decode(layer.density, size), was = [];
            for (const key of cells) {
                const x = key % 65536, y = Math.floor(key / 65536);
                if (x >= W || y >= H) continue;
                const i = y * W + x;
                if (levels[i]) { was.push([i, levels[i]]); levels[i] = 0; }
            }
            if (was.length) { layer.density = encode(levels); record.layers.push({ key: layerKey(layer), cells: was }); }
        }
        if (Array.isArray(next.bushes)) {
            next.bushes = next.bushes.filter((bush, index) => { if (!bushOver(bush, cells)) return true; record.bushes.push(bush); record.at.push(index); return false; });
        }
        if (!record.layers.length && !record.bushes.length) return null;
        write(mapData, next);
        return record;
    };
    /** What grows under a map's pieces (all of them, or those `accept` takes) is taken off. */
    const clearUnderPieces = (mapData, accept) => (raw(mapData) ? clearCells(mapData, coveredCells(mapData, accept)) : null);

    /** A clear undone: the cells grow again as they were (unless painted since) and the bushes stand again. */
    const uncover = (mapData, record) => {
        if (!mapData || !record) return false;
        const size = mapData.width * mapData.height, data = foliage(mapData);
        data.layers = Array.isArray(data.layers) ? data.layers : [];
        for (const entry of record.layers) {
            let layer = data.layers.find(l => layerKey(l) === entry.key);
            if (!layer) {
                const [kind, height, colour, tip, vary, seed, colours] = JSON.parse(entry.key);
                layer = { kind };
                if (height !== null) layer.height = height;
                if (colour !== null) layer.colour = colour;
                if (tip !== null) layer.tip = tip;
                if (vary !== null) layer.vary = vary;
                if (seed !== null) layer.seed = seed;
                if (colours !== null) layer.colours = colours;
                layer.density = '';
                data.layers.push(layer);
            }
            const levels = decode(layer.density, size);
            for (const [i, level] of entry.cells) if (!levels[i]) levels[i] = level;
            layer.density = encode(levels);
        }
        // Each bush goes back to the place in the list it was taken from, so the list reads as it did.
        const bushes = Array.isArray(data.bushes) ? data.bushes.slice() : [], at = Array.isArray(record.at) ? record.at : [];
        clone(record.bushes).forEach((bush, i) => bushes.splice(Math.min(at[i] >= 0 ? at[i] : bushes.length, bushes.length), 0, bush));
        data.bushes = bushes;
        write(mapData, data);
        return true;
    };
    /** The same clear again (a redo). */
    const recover = (mapData, record) => {
        if (!mapData || !record || !raw(mapData)) return false;
        const size = mapData.width * mapData.height, data = foliage(mapData);
        for (const entry of record.layers) {
            const layer = (data.layers || []).find(l => layerKey(l) === entry.key);
            if (!layer) continue;
            const levels = decode(layer.density, size);
            for (const [i] of entry.cells) levels[i] = 0;
            layer.density = encode(levels);
        }
        const gone = new Set(record.bushes.map(bush => JSON.stringify(bush)));
        if (Array.isArray(data.bushes)) data.bushes = data.bushes.filter(bush => !gone.has(JSON.stringify(bush)));
        write(mapData, data);
        return true;
    };
    /** The cells a clear touched, as a box, for relaying only those chunks. */
    const clearedRegion = (mapData, record) => {
        if (!record) return null;
        const W = mapData.width;
        let box = null;
        const add = (x, y) => { box = box ? { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) } : { x0: x, y0: y, x1: x, y1: y }; };
        for (const entry of record.layers) for (const [i] of entry.cells) add(i % W, Math.floor(i / W));
        for (const bush of record.bushes) { const r = Math.ceil((Number(bush.size) || 1.6) / 2); add(Math.max(0, Math.floor(bush.x) - r), Math.max(0, Math.floor(bush.y) - r)); add(Math.floor(bush.x) + r, Math.floor(bush.y) + r); }
        return box;
    };

    const api = { KINDS, PALETTE_KINDS, decode, encode, foliage, hasFoliage, snapshot, restore, layerSettings, paint, fill, bushes, addBush, removeBushes, wind, setWind, stats, resize, coveredCells, clearCells, clearUnderPieces, uncover, recover, clearedRegion };
    root.RRMapFoliage = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
