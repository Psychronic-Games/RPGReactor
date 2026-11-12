// Runtime-only index levels. Original assets and vertex attributes stay intact.
import { MeshoptSimplifier } from './meshopt_simplifier.js';

// The levels worked out for a mesh are kept in the browser's own store (IndexedDB, in the game's profile), by a hash of
// what they were worked out from: the next session reads them back instead of working them out again. On a four-core
// laptop the thirteen dense models of Open Road: Forest took this worker sixteen seconds each time the game was
// started, and until a model's levels arrive it is drawn at full detail (41 to 48 world frames a second for those
// seconds, 57 after; 2026-11-11). All of it here, off the main thread; a store that cannot be opened, read or
// written is simply not used. `RECIPE` names how the levels are made: change it with the steps below, and what was
// kept under the old one is no longer found.
const RECIPE = 'levels-3:chained:0.00025..0.032:LockBorder+Permissive@0.8';
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
        return [RECIPE, job.stride, (job.weights || []).join(','), ...parts.map(hex)].join('|');
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
        if (indices.length < job.indices.length * 0.9 && (!last || indices.length < last.indices.length * 0.92)) levels.push({ indices, error: spent * scale });
    }
    return levels;
};

self.onmessage = async ({ data: job }) => {
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
