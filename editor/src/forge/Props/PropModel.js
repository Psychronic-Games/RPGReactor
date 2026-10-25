/**
 * RRPropModel - the Prop Builder's kinds, and what every kind's build
 * becomes on Save: a skinned GLB (RRCharacterGlb) and its model.json.
 *
 * A kind is { id, label, normalize, build, random?, randomScopes?, prepare?, ready? }:
 * random(seed, recipe, scope) rolls a new recipe, scope one of randomScopes ([id, label]).
 * Optional prepare() loads its reference data once; ready() lets the view
 * wait without blocking other kinds. Saving awaits prepare() as well.
 * Build gives { parts,
 * bones, clips, textures, cloth? }. A kind with cloth carries the setup
 * its loop is baked from (RRPropCloth). The file's model.json plays the
 * loop always and puts the model's own origin (a pole's foot) where the
 * game stands it, since the game centers a model on its box.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Cloth = need('RRPropCloth', './PropCloth.js');
    const Glb = need('RRCharacterGlb', '../Character3D/CharacterGlb.js');

    const KINDS = [];
    const BY_ID = new Map();
    function register(kind) {
        if (BY_ID.has(kind.id)) KINDS.splice(KINDS.indexOf(BY_ID.get(kind.id)), 1, kind); else KINDS.push(kind);
        BY_ID.set(kind.id, kind);
    }

    function kindOf(recipe) { return BY_ID.get(recipe && recipe.kind) || KINDS[0]; }
    function normalize(recipe) { return kindOf(recipe).normalize(recipe || {}); }
    function build(recipe, cache, options) { return kindOf(recipe).build(recipe, cache, options); }

    /**
     * A build's cloths, each { setup, grid, offset }: `offset` is where its
     * bones start among the bones after the root. A flag has one.
     */
    function clothsOf(result) {
        if (result.cloths) return result.cloths;
        return result.cloth ? [{ setup: result.cloth.setup, grid: result.cloth.grid, offset: 0 }] : [];
    }

    /** Whether a build moves (a cloth in the wind, a rope that sways). */
    function moves(result) { return clothsOf(result).length > 0 || !!result.rope; }

    /**
     * One loop over every bone after the root, { times, T, Q } (3 and 4
     * numbers a key, per bone): each cloth's tracks (RRPropCloth.tracks, in
     * the order of clothsOf) at its offset, a swaying rope's own bones from
     * `result.rope.tracks(times)`, and every other bone held where it rests.
     */
    function assemble(result, perCloth) {
        const count = result.bones.length - 1, fps = 30;
        const times = perCloth[0] ? perCloth[0].times : Float32Array.from({ length: Math.round(LOOP() * fps) + 1 }, (_, f) => f / fps);
        const F = times.length, T = new Array(count), Q = new Array(count);
        clothsOf(result).forEach((c, i) => { for (let b = 0; b < c.grid.count; b++) { T[c.offset + b] = perCloth[i].T[b]; Q[c.offset + b] = perCloth[i].Q[b]; } });
        if (result.rope) {
            const rope = result.rope.tracks(times);
            rope.T.forEach((t, k) => { T[result.rope.offset + k] = t; });
        }
        for (let b = 0; b < count; b++) {
            if (!T[b]) { const head = result.bones[b + 1].head, t = new Float32Array(F * 3); for (let f = 0; f < F; f++) t.set(head, f * 3); T[b] = t; }
            if (!Q[b]) { const q = new Float32Array(F * 4); for (let f = 0; f < F; f++) q[f * 4 + 3] = 1; Q[b] = q; }
        }
        return { times, T, Q, closing: Math.max(0, ...perCloth.map(p => p.closing || 0)) };
    }
    const LOOP = () => (root.RRFlagProp && root.RRFlagProp.LOOP) || 3;

    /** A build's motion baked into its loop ({ times, T, Q }), or null when nothing on it moves. */
    function bake(result, options) {
        if (!moves(result)) return null;
        const per = clothsOf(result).map(c => {
            const baked = Cloth.bake(c.setup, options);
            const t = Cloth.tracks(baked, c.setup.rest, c.grid);
            t.closing = baked.closing;
            return t;
        });
        return assemble(result, per);
    }

    /**
     * Where the model's own origin ends up once the game has centered it:
     * the middle of its box at rest across the ground, and the lowest point
     * it reaches as it moves (sampled as the game samples it, twelve times).
     */
    function origin(result) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
        const loop = result.loop, animated = !!(loop && result.clips.length && result.restBones);
        for (const p of result.parts) {
            const P = p.positions;
            for (let i = 0; i < P.length; i += 3) {
                minX = Math.min(minX, P[i]); maxX = Math.max(maxX, P[i]); minZ = Math.min(minZ, P[i + 2]); maxZ = Math.max(maxZ, P[i + 2]);
                if (!(animated && p.moves)) minY = Math.min(minY, P[i + 1]);
            }
        }
        if (animated) {
            const count = loop.T.length, T = new Float32Array(count * 3), Q = new Float32Array(count * 4);
            const duration = loop.times[loop.times.length - 1];
            for (const part of result.parts.filter(p => p.moves)) {
                const out = new Float32Array(part.positions.length), joints = part.joints.map(j => Math.max(0, j - 1));
                // Weights on the root (a rope's fixed ends) stand still.
                const weights = Float32Array.from(part.weights, (w, i) => (part.joints[i] === 0 ? 0 : w));
                for (let s = 0; s < 12; s++) {
                    Cloth.sample(loop, duration * s / 12, T, Q);
                    Cloth.skin(part.positions, joints, weights, result.restBones, T, Q, out);
                    for (let i = 1; i < out.length; i += 3) {
                        let still = 0;
                        for (let k = 0; k < 4; k++) if (part.joints[(i - 1) / 3 * 4 + k] === 0) still += part.weights[(i - 1) / 3 * 4 + k];
                        minY = Math.min(minY, out[i] + still * part.positions[i]);
                    }
                }
            }
        }
        const round = v => Math.round(v * 10000) / 10000;
        return [round((minX + maxX) / 2), round(Number.isFinite(minY) ? minY : 0), round((minZ + maxZ) / 2)];
    }

    /** The model.json a saved prop starts with: its loop playing always, its origin where it is placed. */
    function sidecar(result) {
        const out = { transform: { offset: origin(result) } };
        if (result.sidecarExtra) Object.assign(out, result.sidecarExtra);
        if (result.clips.length) out.animations = result.clips.map(c => ({ type: 'clip', trigger: 'always', name: c.name, clip: c.name, part: '' }));
        return out;
    }

    /**
     * The GLB of a build. `loop` (from bake) becomes its clip; `encode(texture)`
     * turns a picture into PNG bytes (the page uses a canvas, node pngjs).
     */
    async function toGlb(result, name, encode) {
        const images = {};
        for (const [key, tex] of Object.entries(result.textures || {})) if (tex) images[key] = await encode(tex);
        const parts = result.parts.map(p => {
            const out = Object.assign({}, p);
            if (out.texture && !images[out.texture]) delete out.texture;
            if (out.normalTexture && !images[out.normalTexture]) delete out.normalTexture;
            if (!out.texture && !out.colors && !out.color) out.color = '#bbbbbb';
            return out;
        });
        return Glb.toGlb({ parts, bones: result.bones }, { name, clips: result.clips, images });
    }

    /** What a build costs: triangles, vertices, bones, the loop's keys and its pictures' pixels. */
    function stats(result) {
        let triangles = 0, vertices = 0;
        for (const p of result.parts) { triangles += p.index.length / 3; vertices += p.positions.length / 3; }
        const textures = Object.values(result.textures || {}).filter(Boolean).map(t => [t.width, t.height]);
        return { triangles, vertices, bones: result.bones.length, keys: result.clips[0] ? result.clips[0].times.length : 0, textures };
    }

    const api = { KINDS, BY_ID, register, kindOf, normalize, build, bake, assemble, clothsOf, moves, origin, sidecar, toGlb, stats };
    root.RRPropModel = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const flag = root.RRFlagProp || (typeof require === 'function' ? require('./FlagProp.js') : null);
    if (flag) register({ id: 'flag', label: 'Flag', normalize: flag.normalize, build: flag.build, random: flag.random, randomScopes: [['all', 'Everything'], ['shape', 'Shape'], ['details', 'Design'], ['colors', 'Colors']] });
    // From picture registers itself when it loads (after this file on the page).
    if (!root.RRPictureProp && typeof require === 'function' && typeof module !== 'undefined') require('./PictureProp.js');
    if (!root.RRSpanProp && typeof require === 'function' && typeof module !== 'undefined') require('./SpanProp.js');
    if (!root.RRSwordProp && typeof require === 'function' && typeof module !== 'undefined') require('./SwordProp.js');
    if (!root.RRGunProp && typeof require === 'function' && typeof module !== 'undefined') require('./GunProp.js');
})(typeof window !== 'undefined' ? window : globalThis);
