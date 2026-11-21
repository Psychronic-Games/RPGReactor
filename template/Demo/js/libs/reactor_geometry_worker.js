// Runtime-only index levels. Original assets and vertex attributes stay intact.
import { MeshoptSimplifier } from './meshopt_simplifier.js';

// The levels worked out for a mesh are kept in the browser's own store (IndexedDB, in the game's profile), by a hash of
// what they were worked out from: the next session reads them back instead of working them out again. On a four-core
// laptop the thirteen dense models of Open Road: Forest took this worker sixteen seconds each time the game was
// started, and until a model's levels arrive it is drawn at full detail (41 to 48 world frames a second for those
// seconds, 57 after; 2026-11-11). All of it here, off the main thread; a store that cannot be opened, read or
// written is simply not used. `RECIPE` names how the levels are made: change it with the steps below, and what was
// kept under the old one is no longer found.
// levels-4 (2026-11-15): each level says whether it was made across texture seams (`loose`).
// levels-5 (2026-11-18): every level's triangles, and a copy of the whole mesh's (error 0), in vertex cache order (`cacheOrder`).
const RECIPE = 'levels-5:chained:0.00025..0.032:LockBorder+Permissive@0.8:vcache32';

/**
 * A mesh's triangles reordered so the graphics card's cache of shaded vertices serves most of each one (Tom Forsyth's
 * linear-speed vertex cache optimisation, a 32-entry cache). A card shades a vertex again whenever it has left that
 * cache; in the order a model is exported in, or that the simplifier leaves, it often has: two of the Demo party's
 * 77k-triangle bodies shaded 2.8 vertices a triangle (a 16-entry FIFO counted on their index lists), where an ordered
 * list shades 0.6 to 0.7, and their skinning was the largest part of the first room's frame on the Iris Xe laptop
 * (2026-11-18). The same triangles, the same vertices; only the order changes, so what an opaque mesh draws is the same.
 */
const CACHE = 32;
const cacheOrder = (indices, vertexCount) => {
    const triangles = indices.length / 3;
    if (triangles < 2 || !(vertexCount > 0)) return indices;
    const live = new Uint32Array(vertexCount);
    for (let i = 0; i < indices.length; i++) live[indices[i]]++;
    const start = new Uint32Array(vertexCount + 1);
    for (let v = 0; v < vertexCount; v++) start[v + 1] = start[v] + live[v];
    const adjacent = new Uint32Array(indices.length), fill = start.slice(0, vertexCount);
    for (let t = 0; t < triangles; t++) for (let k = 0; k < 3; k++) { const v = indices[t * 3 + k]; adjacent[fill[v]++] = t; }
    const position = new Int32Array(vertexCount).fill(-1), vertexScore = new Float32Array(vertexCount);
    const VALENCE = new Float32Array(64); for (let n = 1; n < 64; n++) VALENCE[n] = 2 * Math.pow(n, -0.5);
    const POSITION = new Float32Array(CACHE); for (let p = 0; p < CACHE; p++) POSITION[p] = p < 3 ? 0.75 : Math.pow(1 - (p - 3) / (CACHE - 3), 1.5);
    const score = v => { const n = live[v]; if (!n) return -1; const p = position[v]; return (p >= 0 ? POSITION[p] : 0) + (n < 64 ? VALENCE[n] : 2 * Math.pow(n, -0.5)); };
    for (let v = 0; v < vertexCount; v++) vertexScore[v] = score(v);
    const triangleScore = new Float32Array(triangles), done = new Uint8Array(triangles);
    for (let t = 0; t < triangles; t++) triangleScore[t] = vertexScore[indices[t * 3]] + vertexScore[indices[t * 3 + 1]] + vertexScore[indices[t * 3 + 2]];
    const out = new Uint32Array(indices.length);
    let written = 0, scan = 0, best = 0;
    for (let t = 1; t < triangles; t++) if (triangleScore[t] > triangleScore[best]) best = t;
    let cache = new Int32Array(CACHE + 3), next = new Int32Array(CACHE + 3), size = 0;
    while (best >= 0) {
        done[best] = 1;
        const a = indices[best * 3], b = indices[best * 3 + 1], c = indices[best * 3 + 2];
        out[written++] = a; out[written++] = b; out[written++] = c;
        // The triangle leaves each of its vertices' lists of triangles still to draw.
        for (const v of [a, b, c]) {
            const from = start[v], end = from + live[v];
            for (let i = from; i < end; i++) if (adjacent[i] === best) { adjacent[i] = adjacent[end - 1]; adjacent[end - 1] = best; break; }
            live[v]--;
        }
        // The cache: the triangle's vertices first, then what was there before, less them.
        let n = 0;
        next[n++] = a; next[n++] = b; next[n++] = c;
        for (let i = 0; i < size; i++) { const v = cache[i]; if (v !== a && v !== b && v !== c) next[n++] = v; }
        for (let i = 0; i < n; i++) { const v = next[i]; position[v] = i < CACHE ? i : -1; vertexScore[v] = score(v); }
        const swap = cache; cache = next; next = swap; size = Math.min(n, CACHE);
        // The triangles of the vertices in the cache, scored again; the best of them is next.
        best = -1; let top = -Infinity;
        for (let i = 0; i < size; i++) {
            const v = cache[i], from = start[v], end = from + live[v];
            for (let j = from; j < end; j++) {
                const t = adjacent[j];
                const s = vertexScore[indices[t * 3]] + vertexScore[indices[t * 3 + 1]] + vertexScore[indices[t * 3 + 2]];
                triangleScore[t] = s;
                if (s > top) { top = s; best = t; }
            }
        }
        if (best < 0) { while (scan < triangles && done[scan]) scan++; best = scan < triangles ? scan : -1; }
    }
    return out;
};
const STORE = 'levels';
/** Entries kept at most; past it the store is emptied and fills again from what is played. */
const MOST = 1500;
let opening = null;
const store = () => opening || (opening = new Promise(resolve => {
    try {
        if (!self.indexedDB) return resolve(null);
        const request = self.indexedDB.open('reactor-geometry-levels', 1);
        request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = request.onblocked = () => resolve(null);
    } catch (error) { resolve(null); }
}));
const asked = (db, mode, ask) => new Promise(resolve => {
    try {
        const request = ask(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(undefined);
    } catch (error) { resolve(undefined); }
});
const hex = buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
/** What a job's levels are kept under, or null where they cannot be kept. */
const keyOf = async job => {
    if (job.keep === false || !self.crypto || !self.crypto.subtle) return null;
    try {
        const parts = await Promise.all([job.indices, job.positions, job.attributes].map(array => self.crypto.subtle.digest('SHA-1', array)));
        return [RECIPE + (job.order === false ? ':unordered' : ''), job.stride, (job.weights || []).join(','), ...parts.map(hex)].join('|');
    } catch (error) { return null; }
};
const valid = (kept, job) => !!kept && Array.isArray(kept.levels) && kept.levels.every(level => level && level.indices instanceof Uint32Array && level.indices.length <= job.indices.length && Number.isFinite(level.error));

const make = job => {
    const scale = MeshoptSimplifier.getScale(job.positions, 3);
    const levels = [];
    const target = Math.floor(job.indices.length * 0.01 / 3) * 3;
    const simplify = (indices, error, flags) => MeshoptSimplifier.simplifyWithAttributes(
        indices, job.positions, 3, job.attributes, job.stride, job.weights, null, target, error, flags);
    // A mesh cut into many texture islands (a scanned or baked prop) stops shrinking long before its
    // error does: every seam vertex is pinned, and a 488k-triangle prop never went below 128k at any
    // distance. Once doubling the error removes less than a fifth of what is left, the levels from
    // there on may collapse across seams (Permissive); the texture coordinates still count in the
    // error, so the result stays inside the same distance on screen. 128k -> 18.5k at the same error.
    // That holds while the level is drawn where its error is under a pixel. A triangle that spans two islands reads
    // the picture between them, so drawn nearer than that (a Quality level allows the levels several pixels) it shows
    // as patches of another part's colour: brown leather over a coat and hair on the Demo's first actor at Auto's
    // low levels (owner, 2026-11-15). Such a level is marked `loose`, and is chosen only under the levels' own
    // pixel (Reactor3D.GeometryDetail.begin).
    //
    // Each level is made from the one before it, not from the whole mesh again: seven or more passes over a
    // 149k-triangle model took this worker 3.7 to 4.9 s on a four-core laptop, and a model is drawn at full detail
    // until its levels arrive (2026-11-11). The error of a level made that way adds to that of the level it was
    // made from, so a step is allowed only what is left of its own bound (`room`: at least half of
    // it, the bounds doubling), and what is reported is the sum: no level strays further from the mesh than its
    // bound, as before; some come out a little larger.
    let flags = ['LockBorder'], source = job.indices, spent = 0;
    // (One step past the 0.016 the unchained levels ended at: the last of them had only what was left of its bound,
    // and several models lost their coarsest level. A level is chosen by the error it reports, so a further one is
    // only ever drawn further off.)
    for (const error of [0.00025, 0.0005, 0.001, 0.002, 0.004, 0.008, 0.016, 0.032]) {
        const room = error - spent;
        if (!(room > 0) || source.length <= target) break;
        let [indices, achieved] = simplify(source, room, flags);
        if (flags.length === 1 && error >= 0.001 && indices.length > source.length * 0.8) {
            const loose = simplify(source, room, ['LockBorder', 'Permissive']);
            if (loose[0].length < indices.length * 0.8) { [indices, achieved] = loose; flags = ['LockBorder', 'Permissive']; }
        }
        if (indices.length >= source.length) continue;
        source = indices;
        spent += achieved;
        // A level that is barely smaller than the one before costs memory and buys nothing.
        const last = levels[levels.length - 1];
        if (indices.length < job.indices.length * 0.9 && (!last || indices.length < last.indices.length * 0.92)) levels.push({ indices, error: spent * scale, loose: flags.length > 1 });
    }
    // In vertex cache order, each level and (as the first level, its error none) the whole mesh: drawn near, it is that copy.
    const vertices = job.positions.length / 3;
    if (job.order !== false) for (const level of levels) level.indices = cacheOrder(level.indices, vertices);
    if (job.order !== false) levels.unshift({ indices: cacheOrder(job.indices, vertices), error: 0, loose: false, whole: true });
    return levels;
};

self.onmessage = async ({ data: job }) => {
    // A mesh's own triangle list in cache order, nothing else (a mesh with shape keys, which takes no levels).
    if (job.orderOnly) {
        try { const order = cacheOrder(job.indices, job.vertices); self.postMessage({ id: job.id, order }, [order.buffer]); }
        catch (error) { self.postMessage({ id: job.id, error: String(error?.message || error) }); }
        return;
    }
    try {
        const key = await keyOf(job), db = key ? await store() : null;
        const kept = db ? await asked(db, 'readonly', held => held.get(key)) : null;
        if (valid(kept, job)) {
            self.postMessage({ id: job.id, levels: kept.levels, kept: true }, kept.levels.map(level => level.indices.buffer));
            return;
        }
        await MeshoptSimplifier.ready;
        if (!MeshoptSimplifier.supported) throw new Error('Geometry simplifier unavailable');
        const levels = make(job);
        if (db) {
            // (Written before the lists are handed over: posting them takes their buffers away.)
            const count = await asked(db, 'readonly', held => held.count());
            if (count > MOST) await asked(db, 'readwrite', held => held.clear());
            await asked(db, 'readwrite', held => held.put({ levels }, key));
        }
        self.postMessage({ id: job.id, levels }, levels.map(level => level.indices.buffer));
    } catch (error) {
        self.postMessage({ id: job.id, error: String(error?.message || error) });
    }
};
