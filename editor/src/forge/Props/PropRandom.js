/**
 * RRPropRandom - what Randomize rolls from: a seeded roll with picks and
 * jitters, palettes that go together for each material, and the scopes a
 * kind offers ("What Randomize changes").
 *
 * A kind's random(seed, recipe, scope) returns a new recipe; `scope` is one
 * of its `randomScopes` ids, 'all' when left out. Each scope changes only its
 * own settings: 'shape' the form and size, 'colors' the colors and finishes,
 * 'details' the parts and patterns.
 */
(function(root) {
    'use strict';

    /** A roll from a seed (mulberry32): `next()` in [0, 1). */
    function roll(seed) {
        let a = (seed >>> 0) || 1;
        const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const R = {
            next,
            range: (lo, hi) => lo + (hi - lo) * next(),
            int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
            chance: p => next() < p,
            pick: list => list[Math.floor(next() * list.length) % list.length],
            /** A pick weighted by `[value, weight]` pairs. */
            weighted: pairs => { let total = 0; for (const p of pairs) total += p[1]; let x = next() * total; for (const p of pairs) { x -= p[1]; if (x <= 0) return p[0]; } return pairs[pairs.length - 1][0]; },
            /** `v` moved by up to `share` of itself either way, kept in [lo, hi]. */
            jitter: (v, share, lo, hi) => Math.max(lo ?? -Infinity, Math.min(hi ?? Infinity, v * (1 + (next() * 2 - 1) * share)))
        };
        return R;
    }

    /** Colors that belong together, by what they are. */
    const PALETTES = {
        heraldic: [
            ['#8c1c1c', '#d9b23c', '#f2efe6', '#1f3c78', '#1d5c34'], ['#1f3c78', '#f2efe6', '#b3202a', '#d9b23c', '#1b1b1f'], ['#1d5c34', '#f2efe6', '#c8a032', '#1b1b1f', '#8c1c1c'],
            ['#2b2b30', '#c9a03c', '#8c1c1c', '#f2efe6', '#1f3c78'], ['#5a2a6e', '#e8c45a', '#f2efe6', '#1f1f24', '#0f5c78'], ['#0f5c78', '#f0e6c8', '#c84a2a', '#1b1b1f', '#d9b23c'],
            ['#c8501e', '#f2efe6', '#1f3c78', '#2b2b30', '#d9b23c'], ['#f2efe6', '#a51f2b', '#1f3c78', '#d9b23c', '#1d5c34'], ['#3a5a2a', '#d8c27a', '#7a2a1a', '#f2efe6', '#1b1b1f']
        ],
        leather: ['#4a2c1c', '#2a1d15', '#5a2a1a', '#6e4426', '#1b1b22', '#3a2a1a', '#7a5232'],
        wood: ['#6e4426', '#5a3a22', '#8a5a32', '#3a2a1a', '#a07a4a', '#4a3020'],
        felt: ['#141416', '#2a2420', '#5a4a3a', '#3a2a22', '#693530', '#2e3f8a', '#1e2a24', '#8a6a44', '#c6aa72', '#4a4a52'],
        cloth: ['#8a1a2a', '#2e3f8a', '#1d5c34', '#c8a040', '#5a2a6e', '#9abac8', '#b03030', '#f2efe6', '#24202c', '#c86a2a'],
        jewel: ['#c0203a', '#3a8ad8', '#2aa860', '#8a3ac0', '#f0c040', '#f2f2f6', '#1b1b1f'],
        precious: ['#e0b84a', '#d8d8e0', '#c87a4a', '#f0d070', '#b8bcc4'],
        dark: ['#1b1b1f', '#2a2a2e', '#3a3f4a', '#26272a', '#30333b'],
        paint: ['#d8dce4', '#3a3f4a', '#5a6a3a', '#7a2a22', '#1b1b1f', '#f0f0f2', '#2a4a6a', '#c8a032', '#6a2a5a'],
        glow: ['#58c8ff', '#ff4a3a', '#7aff6a', '#c86aff', '#ffd24a', '#38f0d8', '#ff7ad8']
    };

    const SCOPES = {
        all: ['all', 'Everything'], shape: ['shape', 'Shape'], colors: ['colors', 'Colors'], details: ['details', 'Details'], design: ['details', 'Design']
    };
    /** True when `scope` includes `part` ('shape', 'colors' or 'details'). */
    const covers = (scope, part) => !scope || scope === 'all' || scope === part;

    const api = { roll, PALETTES, SCOPES, covers };
    root.RRPropRandom = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
