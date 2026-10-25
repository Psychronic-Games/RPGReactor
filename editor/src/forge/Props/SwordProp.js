/**
 * RRSwordProp - Weapons › Swords & Blades: a blade, its guard, grip and
 * pommel, from sliders, saved holdable.
 *
 * Built along +x from the guard (x = 0): the blade toward +x, the grip
 * and pommel toward -x; the edge side down (-y), the spine up (+y); the
 * flats facing ±z. A curve bends the blade toward its spine. The blade's
 * cross-section is twelve points round (edges, bevels, flats, a fuller's
 * groove), each face its own strip so bevels stay crisp. The saved model
 * lies flat on the floor (flat side down), centered, and carries the
 * runtime's blade markers (gripBottom, gripTop, tip, edge) in model.json,
 * so a hand holds it by its grip with its edge where it cuts.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Rand = need('RRPropRandom', './PropRandom.js');
    const Mesh = need('RRPropMesh', './PropMesh.js');
    const Paint = need('RRPropPaint', './PropPaint.js');
    const Surface=need('RRConstructionSurface','../Character3D/ConstructionSurface.js');

    const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);
    const pick = (v, list, d) => (list.includes(v) ? v : d);

    const TIPS = [['point', 'Sharp point'], ['leaf', 'Leaf-shaped'], ['swept', 'Swept to the back'], ['clip', 'Clipped'], ['round', 'Rounded'], ['square', 'Squared']];
    const EDGES = [['double', 'Double-edged'], ['single', 'Single-edged']];
    const GUARDS = [['cross', 'Crossguard'], ['disc', 'Disc'], ['basket', 'Basket'], ['none', 'None']];
    const WRAPS = [['leather', 'Leather'], ['cord', 'Cord'], ['wire', 'Wire'], ['wood', 'Wood']];
    const POMMELS = [['ball', 'Ball'], ['disc', 'Disc'], ['spike', 'Spike'], ['none', 'None']];
    const METALS = [['steel', 'Steel'], ['damascus', 'Damascus'], ['bronze', 'Bronze']];
    const TRIMS = [['steel', 'Steel'], ['gold', 'Gilded'], ['bronze', 'Bronze'], ['black', 'Black iron']];
    const LOOK = {
        steel: { color: '#c8ccd2', roughness: 0.26, metalness: 0.95 }, damascus: { color: '#ffffff', roughness: 0.3, metalness: 0.9 }, bronze: { color: '#b08a4a', roughness: 0.34, metalness: 0.9 },
        gold: { color: '#d4ad48', roughness: 0.28, metalness: 0.95 }, black: { color: '#2a2a2e', roughness: 0.45, metalness: 0.75 }
    };

    const PRESETS = [
        ['longsword', 'Longsword', { blade: { length: 0.92, width: 0.048, curve: 0, taper: 0.45, tip: 'point', edge: 'double', fuller: 0.6, serrations: 0, thickness: 0.006 }, guard: { type: 'cross', size: 1, curl: 0.1 }, grip: { length: 0.2, wrap: 'leather', color: '#4a2c1c' }, pommel: 'ball', metal: 'steel', trim: 'steel' }],
        ['katana', 'Katana', { blade: { length: 0.72, width: 0.032, curve: 0.35, taper: 0.25, tip: 'swept', edge: 'single', fuller: 0, serrations: 0, thickness: 0.007 }, guard: { type: 'disc', size: 1, curl: 0 }, grip: { length: 0.27, wrap: 'cord', color: '#1b1b22' }, pommel: 'disc', metal: 'steel', trim: 'black' }],
        ['scimitar', 'Scimitar', { blade: { length: 0.78, width: 0.05, curve: 1, taper: 0, tip: 'clip', edge: 'single', fuller: 0, serrations: 0, thickness: 0.005 }, guard: { type: 'cross', size: 0.9, curl: -0.6 }, grip: { length: 0.13, wrap: 'wood', color: '#5a3a22' }, pommel: 'ball', metal: 'steel', trim: 'gold' }],
        ['rapier', 'Rapier', { blade: { length: 1.0, width: 0.02, curve: 0, taper: 0.6, tip: 'point', edge: 'double', fuller: 0, serrations: 0, thickness: 0.006 }, guard: { type: 'basket', size: 1, curl: 0.4 }, grip: { length: 0.13, wrap: 'wire', color: '#a07a3a' }, pommel: 'ball', metal: 'steel', trim: 'steel' }],
        ['greatsword', 'Greatsword', { blade: { length: 1.35, width: 0.065, curve: 0, taper: 0.35, tip: 'point', edge: 'double', fuller: 0.7, serrations: 0, thickness: 0.008 }, guard: { type: 'cross', size: 1.6, curl: 0.25 }, grip: { length: 0.38, wrap: 'leather', color: '#2a1d15' }, pommel: 'spike', metal: 'steel', trim: 'black' }],
        ['dagger', 'Dagger', { blade: { length: 0.24, width: 0.034, curve: 0, taper: 0.5, tip: 'leaf', edge: 'double', fuller: 0.4, serrations: 0, thickness: 0.005 }, guard: { type: 'cross', size: 0.7, curl: 0.3 }, grip: { length: 0.1, wrap: 'cord', color: '#4a2c1c' }, pommel: 'ball', metal: 'steel', trim: 'bronze' }],
        ['machete', 'Machete', { blade: { length: 0.5, width: 0.06, curve: 0.08, taper: -0.2, tip: 'round', edge: 'single', fuller: 0, serrations: 0, thickness: 0.004 }, guard: { type: 'none', size: 1, curl: 0 }, grip: { length: 0.14, wrap: 'wood', color: '#3a2a1a' }, pommel: 'none', metal: 'steel', trim: 'black' }],
        ['falchion', 'Falchion', { blade: { length: 0.68, width: 0.06, curve: 0.25, taper: -0.3, tip: 'clip', edge: 'single', fuller: 0, serrations: 0.0, thickness: 0.006 }, guard: { type: 'cross', size: 1, curl: 0 }, grip: { length: 0.14, wrap: 'leather', color: '#5a2a1a' }, pommel: 'disc', metal: 'steel', trim: 'steel' }],
        ['energy', 'Energy sword', { blade: { length: 0.85, width: 0.034, curve: 0, taper: 0.1, tip: 'round', edge: 'double', fuller: 0, serrations: 0, thickness: 0.012 }, guard: { type: 'disc', size: 0.8, curl: 0 }, grip: { length: 0.26, wrap: 'wire', color: '#2a2a2e' }, pommel: 'disc', metal: 'steel', trim: 'black', glow: { on: true, color: '#58c8ff', blade: true } }]
    ];
    const PRESET_BY_ID = new Map(PRESETS.map(p => [p[0], p[2]]));

    function normalize(input) {
        const r = input && typeof input === 'object' ? input : {};
        const preset = pick(r.preset, PRESETS.map(p => p[0]), 'longsword'), base = PRESET_BY_ID.get(preset);
        const b = Object.assign({}, base.blade, r.blade || {}), g = Object.assign({}, base.guard, r.guard || {}), gr = Object.assign({}, base.grip, r.grip || {});
        const glow = Object.assign({ on: false, color: '#58c8ff', blade: false }, base.glow || {}, r.glow || {});
        return {
            kind: 'sword', preset,
            blade: {
                length: clamp(b.length, 0.12, 1.6, base.blade.length), width: clamp(b.width, 0.012, 0.12, base.blade.width), curve: clamp(b.curve, 0, 1, 0),
                taper: clamp(b.taper, -0.4, 0.9, 0.3), tip: pick(b.tip, TIPS.map(t => t[0]), 'point'), edge: pick(b.edge, EDGES.map(e => e[0]), 'double'),
                fuller: clamp(b.fuller, 0, 1, 0), serrations: clamp(b.serrations, 0, 1, 0), thickness: clamp(b.thickness, 0.003, 0.016, 0.006)
            },
            guard: { type: pick(g.type, GUARDS.map(x => x[0]), 'cross'), size: clamp(g.size, 0.4, 2.2, 1), curl: clamp(g.curl, -1, 1, 0) },
            grip: { length: clamp(gr.length, 0.06, 0.5, 0.18), wrap: pick(gr.wrap, WRAPS.map(w => w[0]), 'leather'), color: color(gr.color, '#4a2c1c') },
            pommel: pick(r.pommel ?? base.pommel, POMMELS.map(p => p[0]), 'ball'),
            metal: pick(r.metal ?? base.metal, METALS.map(m => m[0]), 'steel'), trim: pick(r.trim ?? base.trim, TRIMS.map(m => m[0]), 'steel'),
            glow: { on: !!glow.on, color: color(glow.color, '#58c8ff'), blade: !!glow.blade }
        };
    }

    // ── the blade ──────────────────────────────────────────────────────────
    /**
     * The blade's outline along its length: the centerline's height `mid(s)`
     * and how far its upper (spine) and lower (edge) sides stand from it,
     * `top(s)` and `bot(s)` (bot negative), s from 0 at the guard to `L`.
     */
    function outline(b) {
        const L = b.length, W = b.width / 2;
        const tipLen = { point: 2.4, leaf: 2, swept: 1.4, clip: 1.8, round: 1, square: 0.25 }[b.tip] * b.width;
        const tl = Math.min(L * 0.45, tipLen), start = L - tl;
        const half = s => {
            const along = s / L;
            let w = W * (1 - b.taper * 0.6 * along);
            if (b.tip === 'leaf') w *= 1 + 0.22 * Math.exp(-Math.pow((along - 0.62) / 0.16, 2));
            return Math.max(W * 0.15, w);
        };
        const mid = s => b.curve * 0.16 * L * Math.pow(s / L, 2);
        const sides = s => {
            let top = half(s), bot = -half(s);
            if (s > start) {
                const q = Math.min(1, (s - start) / tl), ws = half(start);
                if (b.tip === 'point' || b.tip === 'leaf') { const f = Math.pow(1 - q, 0.85); top = ws * f; bot = -ws * f; }
                else if (b.tip === 'swept') { top = ws * (1 - Math.pow(q, 6)); bot = ws - 2 * ws * Math.sqrt(Math.max(0, 1 - q * q)); }
                else if (b.tip === 'clip') { top = ws - ws * 1.2 * Math.pow(q, 1.3); bot = -ws + ws * 0.8 * q * q; }
                else if (b.tip === 'round') { const f = Math.sqrt(Math.max(0, 1 - q * q)); top = ws * f; bot = -ws * f; }
                else { const f = q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3 * 0.4; top = ws * f; bot = -ws * f; }
            }
            // Serrations: teeth cut into the edge, along the third of it nearest the guard.
            if (b.serrations > 0 && s > L * 0.06 && s < L * 0.4) {
                const period = Math.max(0.01, L * 0.34 / 18), q = (s / period) % 1;
                bot += b.serrations * 0.3 * W * (1 - q);
            }
            return [top, bot];
        };
        return { L, mid, sides, tl, start };
    }

    /** Where along the blade to cut it: closer together where the outline turns (the tip, the teeth). */
    function stations(b, o) {
        const out = [];
        const teeth = b.serrations > 0 ? 18 : 0, n = 26 + teeth * 3;
        for (let k = 0; k <= n; k++) {
            const t = k / n;
            // Spread so a third of the cuts fall in the tip.
            out.push(t < 0.7 ? t / 0.7 * o.start : o.start + (t - 0.7) / 0.3 * (o.L - o.start));
        }
        if (teeth) {
            const period = Math.max(0.01, o.L * 0.34 / 18);
            for (let s = Math.ceil(o.L * 0.06 / period) * period; s < o.L * 0.4; s += period) out.push(s - 1e-4, s + 1e-4, s + period * 0.5);
        }
        return [...new Set(out.map(s => Math.round(s * 1e6) / 1e6))].sort((a, b2) => a - b2);
    }

    /**
     * The blade as faces: `flats` (the flats and the fuller) and `edges` (the
     * bevels), each strip of the cross-section its own run of vertices so
     * every face shades flat and the bevels read crisp.
     */
    function blade(b) {
        const o = outline(b), S = stations(b, o), single = b.edge === 'single';
        const ring = s => {
            const [top, bot] = o.sides(s), m = o.mid(s), t = Math.max(b.thickness * 0.3, b.thickness * (1 - 0.55 * s / o.L)) * Math.min(1, (top - bot) / (b.width * 0.45) + 0.2);
            const h = t / 2, w = top - bot, bev = Math.min(w * 0.42, Math.max(w * 0.3, 0.004));
            const c = (top + bot) / 2, fw = w * 0.14, fd = s < o.L * 0.72 ? b.fuller * h * 0.55 * Math.min(1, (o.L * 0.72 - s) / (o.L * 0.08)) : 0;
            const A = single ? [top, h] : [top - bev, h], Am = single ? [top, -h] : [top - bev, -h];
            // Twelve points round: the upper edge (or the flat spine), the upper flat with the fuller's groove, the lower bevel, the edge.
            const pts = [[top, 0], A, [c + fw * 1.6, h], [c, h - fd], [c - fw * 1.6, h], [bot + bev, h], [bot, 0], [bot + bev, -h], [c - fw * 1.6, -h], [c, -h + fd], [c + fw * 1.6, -h], Am];
            // Edge strips: from the edge points to the bevel lines (indices of the segments that are bevels).
            return { pts, m };
        };
        const bevelSegs = single ? new Set([5, 6]) : new Set([0, 5, 6, 11]);
        const rings = S.map(s => Object.assign({ s }, ring(s)));
        // The centerline's direction at each station, for turning each section square to a curved blade.
        const frame = s => { const d = 1e-4, dy = (o.mid(s + d) - o.mid(s - d)) / (2 * d), l = Math.hypot(1, dy); return [1 / l, dy / l]; };
        const place = (rg, p) => { const [tx, ty] = frame(rg.s), nx = -ty, ny = tx; return [rg.s + nx * p[0], rg.m + ny * p[0], p[1]]; };
        const flats = { P: [], N: [], T: [], I: [] }, edges = { P: [], N: [], T: [], I: [] };
        for (let seg = 0; seg < 12; seg++) {
            const into = bevelSegs.has(seg) ? edges : flats;
            for (let k = 0; k + 1 < rings.length; k++) {
                const a0 = place(rings[k], rings[k].pts[seg]), a1 = place(rings[k], rings[k].pts[(seg + 1) % 12]);
                const b0 = place(rings[k + 1], rings[k + 1].pts[seg]), b1 = place(rings[k + 1], rings[k + 1].pts[(seg + 1) % 12]);
                const e1 = [b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]], e2 = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]];
                let n = [e2[1] * e1[2] - e2[2] * e1[1], e2[2] * e1[0] - e2[0] * e1[2], e2[0] * e1[1] - e2[1] * e1[0]];
                const l = Math.hypot(n[0], n[1], n[2]);
                if (l < 1e-14) { const e3 = [b1[0] - a1[0], b1[1] - a1[1], b1[2] - a1[2]]; n = [e2[1] * e3[2] - e2[2] * e3[1], e2[2] * e3[0] - e2[0] * e3[2], e2[0] * e3[1] - e2[1] * e3[0]]; }
                const nl = Math.hypot(n[0], n[1], n[2]) || 1;
                n = n.map(v => v / nl);
                const base = into.P.length / 3;
                for (const [p, u, v] of [[a0, rings[k].s / o.L, seg / 12], [a1, rings[k].s / o.L, (seg + 1) / 12], [b0, rings[k + 1].s / o.L, seg / 12], [b1, rings[k + 1].s / o.L, (seg + 1) / 12]]) { into.P.push(...p); into.N.push(...n); into.T.push(u, v); }
                into.I.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
            }
        }
        const make = m => ({ positions: Float32Array.from(m.P), normals: Float32Array.from(m.N), uvs: Float32Array.from(m.T), index: Uint32Array.from(m.I) });
        // Where the edge cuts, halfway along: the edge marker.
        const midS = o.L * 0.5, [, botMid] = o.sides(midS);
        return { flats: make(flats), edges: make(edges), outline: o, edgePoint: place({ s: midS, m: o.mid(midS) }, [botMid, 0]), tip: place({ s: o.L, m: o.mid(o.L) }, [(o.sides(o.L)[0] + o.sides(o.L)[1]) / 2, 0]) };
    }

    // ── the hilt ───────────────────────────────────────────────────────────
    function hilt(r) {
        const b = r.blade, W = b.width, gripR = Math.max(0.011, Math.min(0.018, W * 0.32)), G = r.grip.length;
        const guard = [], grip = [], pommel = [], trimExtra = [];
        const gs = r.guard.size;
        if (r.guard.type === 'cross' || r.guard.type === 'basket') {
            // A bar across the blade, its arms bent toward the blade (or the grip) by the curl, a knob at each end.
            const g = gs * Math.max(W * 1.6, 0.055), pts = [];
            for (let k = 0; k <= 16; k++) { const y = -g + 2 * g * k / 16, t = Math.abs(y) / g; pts.push([r.guard.curl * 0.45 * g * t * t, y, 0]); }
            guard.push(Mesh.polyTube(pts, k => 0.0075 * gs * (1 + 0.25 * Math.pow(Math.abs(k - 8) / 8, 3)), 8, { caps: true }));
            for (const end of [pts[0], pts[16]]) guard.push(Mesh.sphere(end, 0.012 * gs, 8));
            guard.push(Mesh.box([0, 0, 0], [0.018, Math.max(W * 1.1, 0.02), Math.max(b.thickness * 2.4, 0.014)]));
        }
        if (r.guard.type === 'basket') {
            // Bows sweeping from the guard round the hand to the pommel, and a shell at the guard.
            for (const z of [-0.035, -0.012, 0.012, 0.035]) {
                const pts = [];
                for (let k = 0; k <= 14; k++) { const t = k / 14, x = -G * t, y = -(gripR + 0.045 * gs * Math.sin(Math.PI * t)) - 0.01; pts.push([x, y + 0.012 * (1 - t), z * (1 - 0.4 * t) * gs]); }
                guard.push(Mesh.polyTube(pts, 0.0035, 6));
            }
            guard.push(Mesh.lathe([[0, 0], [0.045 * gs, 0.004], [0.04 * gs, 0.012], [0.03 * gs, 0.016]], 16, { base: [0.002, 0, 0], dir: [-1, 0, 0], sharp: 0.5 }));
        }
        if (r.guard.type === 'disc') {
            const R = gs * Math.max(W * 1.15, 0.038);
            const disc = Mesh.lathe([[gripR * 0.9, 0], [R, 0], [R * 1.02, 0.0035], [R, 0.007], [gripR * 0.9, 0.007]], 24, { base: [-0.007, 0, 0], dir: [1, 0, 0], sharp: 0.4 });
            Mesh.transform(disc, ([x, y, z]) => [x, y, z * 0.82], ([x, y, z]) => [x, y, z / 0.82]);
            guard.push(disc);
            // The collar that holds the blade (a katana's habaki).
            trimExtra.push(Mesh.box([0.015, (b.edge === 'single' ? 0.001 : 0), 0], [0.03, W * 1.05, Math.max(b.thickness * 1.8, 0.01)]));
        }
        if (r.guard.type === 'none') trimExtra.push(Mesh.lathe([[gripR * 1.15, -0.012], [gripR * 1.15, 0], [gripR * 0.8, 0.004]], 12, { base: [0, 0, 0], dir: [1, 0, 0] }));
        // The grip: a little fuller in its middle, its wrap a picture laid round it.
        const prof = [];
        for (let k = 0; k <= 10; k++) { const t = k / 10; prof.push([gripR * (0.92 + 0.12 * Math.sin(Math.PI * t)), t * G]); }
        const g = Mesh.lathe(prof, 14, { base: [0, 0, 0], dir: [-1, 0, 0], caps: false });
        grip.push(g);
        if(r.grip.wrap!=='wood'){
            const turns=Math.min(64,Math.max(4,Math.round(G/(r.grip.wrap==='wire'?.0025:.013)))),steps=turns*16,paths=r.grip.wrap==='cord'?[1,-1]:[1];
            for(const direction of paths){const path=Array.from({length:steps+1},(_,j)=>{const t=j/steps,a=t*turns*Math.PI*2*direction,rad=gripR*(.92+.12*Math.sin(t*Math.PI))+.00025;return[-G*t,Math.cos(a)*rad,Math.sin(a)*rad];});grip.push(Mesh.polyTube(path,r.grip.wrap==='wire'?.00045:.00065,8));}
        }
        for(const x of [-.004,-G+.004])trimExtra.push(Mesh.lathe([[gripR*.90,0],[gripR*1.10,0],[gripR*1.10,.004],[gripR*.90,.004],[gripR*.90,0]],40,{base:[x,0,0],dir:[-1,0,0]}));
        // The pommel at the grip's end.
        const at = [-G, 0, 0];
        if (r.pommel === 'ball') pommel.push(Mesh.sphere([-G - gripR * 1.3, 0, 0], gripR * 1.55, 12));
        else if (r.pommel === 'disc') pommel.push(Mesh.lathe([[0, 0], [gripR * 1.6, 0], [gripR * 1.7, gripR * 0.5], [gripR * 1.5, gripR], [0, gripR * 1.1]], 16, { base: at, dir: [-1, 0, 0], sharp: 0.5 }));
        else if (r.pommel === 'spike') pommel.push(Mesh.lathe([[0, 0], [gripR * 1.4, 0], [gripR * 1.1, gripR], [0, gripR * 4]], 8, { base: at, dir: [-1, 0, 0], sharp: 0.5 }));
        else pommel.push(Mesh.lathe([[gripR * 0.95, 0], [gripR * 0.95, 0.004], [0, 0.006]], 12, { base: at, dir: [-1, 0, 0] }));
        return { guard, grip, pommel, trimExtra, gripR, G };
    }

    /** The grip's wrap: leather in spiral strips, cord in diamonds, fine wire, or wood grain. */
    function wrapPicture(wrap, base) {
        const c = Paint.hex(base);
        const pic = Paint.paint(256, 1024, (u, v, out) => {
            let k;
            if (wrap === 'leather') { const f = ((u + v * 6) % 1 + 1) % 1; k = 0.75 + 0.25 * Math.sin(f * Math.PI) - (f < 0.06 ? 0.3 : 0); }
            else if (wrap === 'cord') { const a = ((u * 2 + v * 8) % 1 + 1) % 1, b = ((u * 2 - v * 8) % 1 + 1) % 1; const ridge = Math.min(Math.abs(a - 0.5), Math.abs(b - 0.5)); k = ridge < 0.08 ? 1.25 : 0.8 + 0.2 * Math.sin(a * Math.PI) * Math.sin(b * Math.PI); }
            else if (wrap === 'wire') { const f = ((v * 60 + u) % 1 + 1) % 1; k = 0.55 + 0.6 * Math.pow(Math.sin(f * Math.PI), 0.6); }
            else { k = 0.8 + 0.2 * Math.sin((v * 12 + Math.sin(u * 6.28) * 0.4) * Math.PI); }
            out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; out[3] = 255;
        }, 1);
        for (let i = 0; i < pic.data.length; i++) if (i % 4 !== 3) pic.data[i] = Math.min(255, pic.data[i]);
        pic.name = 'grip.png';
        return pic;
    }

    /** Damascus: folded layers in wavy bands along the blade, light and dark steel. */
    function damascusPicture() {
        const n = Paint.fractal(5, 6, 3);
        const pic = Paint.paint(512, 64, (u, v, out) => {
            const w = Math.sin((v * 7 + u * 3 + n(u * 2, v) * 2.6) * Math.PI * 2);
            const k = 150 + 70 * w;
            out[0] = k; out[1] = k * 1.01; out[2] = k * 1.04; out[3] = 255;
        }, 1);
        pic.name = 'damascus.png';
        return pic;
    }

    // ── the build ──────────────────────────────────────────────────────────
    const rigid = mesh => {
        const n = mesh.positions.length / 3, w = new Float32Array(n * 4);
        for (let i = 0; i < w.length; i += 4) w[i] = 1;
        return Object.assign(mesh, { joints: new Uint16Array(n * 4), weights: w });
    };

    /** Sword space to the world: lying flat, its flat face down, the spine away from the viewer. */
    const toWorld = ([x, y, z]) => [x, z, -y];

    function build(recipe, cache, options) {
        const r = normalize(recipe), c = cache || {};
        const bl = blade(r.blade), h = hilt(r);
        const metal = LOOK[r.metal], trim = LOOK[r.trim], textures = {};
        const parts = [];
        const glowBlade = r.glow.on && r.glow.blade;
        const flats = Object.assign(bl.flats, { name: 'Blade', kind: 'metal', color: glowBlade ? r.glow.color : metal.color, roughness: metal.roughness, metalness: glowBlade ? 0 : metal.metalness });
        if (r.metal === 'damascus' && !glowBlade) { if (!c.damascus) c.damascus = damascusPicture(); textures['damascus.png'] = c.damascus; flats.texture = 'damascus.png'; }
        const edges = Object.assign(bl.edges, { name: 'Edge', kind: 'metal', color: glowBlade ? r.glow.color : r.metal === 'bronze' ? '#c8a060' : '#dfe3e8', roughness: 0.18, metalness: glowBlade ? 0 : 0.95 });
        // A glowing edge (or a blade of light) shines in its own color, standard glTF emissive.
        if (r.glow.on) { edges.emissive = r.glow.color; if (glowBlade) flats.emissive = r.glow.color; }
        parts.push(flats, edges);
        const trimMeshes = h.guard.concat(h.pommel, h.trimExtra).filter(Boolean);
        if (trimMeshes.length) parts.push(Object.assign(Mesh.merge(trimMeshes), { name: 'Guard', kind: 'metal', color: trim.color, roughness: trim.roughness, metalness: trim.metalness }));
        const gripKey = r.grip.wrap + r.grip.color;
        if (c.gripKey !== gripKey) { c.grip = wrapPicture(r.grip.wrap, r.grip.color); c.gripKey = gripKey; }
        textures['grip.png'] = c.grip;
        parts.push(Object.assign(Mesh.merge(h.grip), { name: 'Grip', texture: 'grip.png', roughness: r.grip.wrap === 'wire' ? 0.35 : 0.8, metalness: r.grip.wrap === 'wire' ? 0.8 : 0 }));
        // Lying flat, centered on the floor: the game stands a model by its box, so its own origin is where it is put.
        Surface.apply(parts,textures,p=>p.name==='Grip'?'leather':p.emissive?null:'metal');
        for (const p of parts) Mesh.transform(p, toWorld, toWorld);
        let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.positions[i + k]); hi[k] = Math.max(hi[k], p.positions[i + k]); }
        const shift = [-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2];
        const move = p => [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]];
        for (const p of parts) Mesh.transform(p, move);
        for (const p of parts) { Object.assign(p, rigid(p)); Mesh.shade(p); }
        // Where it is held: the grip from the pommel end to the guard, the tip, the edge's side.
        const markers = {
            gripBottom: move(toWorld([-h.G, 0, 0])), gripTop: move(toWorld([-0.004, 0, 0])),
            tip: move(toWorld(bl.tip)), edge: move(toWorld(bl.edgePoint))
        };
        const round = v => Math.round(v * 10000) / 10000;
        for (const k of Object.keys(markers)) markers[k] = markers[k].map(round);
        let tall = 0;
        for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) tall = Math.max(tall, p.positions[i]);
        const length = round(hi[0] - lo[0]);
        return {
            kind: 'sword', recipe: r, parts, bones: [{ name: 'Prop', head: [0, 0, 0], parent: -1 }], clips: [], loop: null, textures, cloth: null,
            height: Math.max(0.1, tall), wall: null, length, markers,
            sidecarExtra: { rig: { template: 'blade', markers } }, holdable: 'blade'
        };
    }

    /**
     * A random sword: a believable blade of one family (its own when only
     * the shape or details roll), sized and bent a little off its preset;
     * details swap the fuller, teeth, guard, wrap and pommel; colors the steel, trim, grip and glow.
     */
    function random(seed, recipe, scope) {
        const R = Rand.roll(seed), cur = normalize(recipe), out = JSON.parse(JSON.stringify(cur)), has = part => Rand.covers(scope, part);
        const family = has('shape') && (!scope || scope === 'all') ? R.weighted(PRESETS.map(p => [p, p[0] === 'energy' ? 0.4 : 1])) : PRESETS.find(p => p[0] === cur.preset);
        const base = family[2], energy = family[0] === 'energy';
        out.preset = family[0];
        if (has('shape')) {
            const b = base.blade;
            out.blade = Object.assign(out.blade, {
                length: R.jitter(b.length, 0.14, 0.12, 1.6), width: R.jitter(b.width, 0.16, 0.012, 0.12), thickness: R.jitter(b.thickness, 0.12, 0.003, 0.016),
                curve: b.curve ? R.jitter(b.curve, 0.3, 0, 1) : (R.chance(0.12) ? R.range(0, 0.1) : 0), taper: Math.max(-0.4, Math.min(0.9, b.taper + R.range(-0.12, 0.12))),
                tip: b.tip, edge: b.edge
            });
            out.guard = Object.assign(out.guard, { type: base.guard.type, size: R.jitter(base.guard.size, 0.18, 0.4, 2.2), curl: Math.max(-1, Math.min(1, base.guard.curl + R.range(-0.2, 0.2))) });
            out.grip.length = R.jitter(base.grip.length, 0.15, Math.max(0.09, base.grip.length * 0.8), 0.5);
        }
        if (has('details')) {
            const single = out.blade.edge === 'single';
            out.blade.fuller = energy ? 0 : base.blade.fuller ? R.range(0.3, 0.9) : (R.chance(0.25) ? R.range(0.2, 0.6) : 0);
            out.blade.serrations = !energy && R.chance(0.1) ? R.range(0.2, 0.6) : 0;
            if (!energy && R.chance(0.3)) out.blade.tip = R.pick(single ? ['clip', 'swept', 'point', 'square'] : ['point', 'leaf', 'round']);
            if (!energy && R.chance(0.25)) out.guard.type = R.pick(out.blade.length < 0.3 ? ['cross', 'none'] : out.blade.curve > 0.25 ? ['disc', 'cross'] : ['cross', 'disc', 'basket']);
            out.grip.wrap = energy ? 'wire' : R.weighted([['leather', 3], ['cord', 2], ['wire', 1], ['wood', 1.5]]);
            out.pommel = energy ? 'disc' : out.guard.type === 'disc' ? R.pick(['disc', 'none']) : R.weighted([['ball', 3], ['disc', 2], ['spike', 1], ['none', 0.5]]);
        }
        if (has('colors')) {
            out.metal = energy ? 'steel' : R.weighted([['steel', 6], ['damascus', 2], ['bronze', out.blade.length < 0.8 ? 1.5 : 0.5]]);
            out.trim = out.metal === 'bronze' ? R.pick(['bronze', 'gold']) : R.weighted([['steel', 3], ['gold', 1.5], ['bronze', 1], ['black', 2]]);
            out.grip.color = out.grip.wrap === 'wood' ? R.pick(Rand.PALETTES.wood) : out.grip.wrap === 'wire' ? R.pick(['#a07a3a', '#2a2a2e', '#b8bcc4']) : R.pick(Rand.PALETTES.leather.concat(['#2a4a6a', '#5a1a1a']));
            out.glow = energy ? { on: true, blade: true, color: R.pick(Rand.PALETTES.glow) } : { on: R.chance(0.08), blade: false, color: R.pick(Rand.PALETTES.glow) };
        }
        return normalize(out);
    }

    const api = { TIPS, EDGES, GUARDS, WRAPS, POMMELS, METALS, TRIMS, PRESETS, normalize, outline, build, random };
    root.RRSwordProp = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const Model = root.RRPropModel, Catalog = root.RRPropCatalog || (typeof require === 'function' ? require('./PropCatalog.js') : null);
    if (Model && Model.register) Model.register({ id: 'sword', label: 'Sword', normalize, build, random, randomScopes: [Rand.SCOPES.all, Rand.SCOPES.shape, Rand.SCOPES.details, Rand.SCOPES.colors] });
    if (Catalog) {
        const icon = { katana: 'curved', scimitar: 'curved', falchion: 'curved', dagger: 'dagger', machete: 'curved' };
        for (const [id, label] of PRESETS) Catalog.add({ id: 'sword-' + id, category: id === 'energy' ? 'scifi' : 'swords', label, icon: icon[id] || 'sword', kind: 'sword', keywords: 'blade weapon melee ' + id, start: () => normalize({ preset: id }), matches: r => r.preset === id });
        Catalog.ui('sword', {
            placeholder: 'Sword',
            tabs: [['blade', 'Blade'], ['hilt', 'Hilt'], ['look', 'Look']],
            reset: recipe => normalize({ preset: recipe.preset }),
            panel(tab) {
                const r = this.recipe;
                if (tab === 'blade') {
                    return this._section('Blade') + this._slider({ path: 'blade.length', label: 'Length', range: [0.12, 1.6], step: 0.01, format: 'm' })
                        + this._slider({ path: 'blade.width', label: 'Width', range: [0.012, 0.12], step: 0.001, format: 'm' })
                        + this._slider({ path: 'blade.curve', label: 'Curve', range: [0, 1], ends: ['No curve', 'Scimitar'] })
                        + this._slider({ path: 'blade.taper', label: 'Taper', range: [-0.4, 0.9], ends: ['Wider at the tip', 'Narrow at the tip'] })
                        + this._slider({ path: 'blade.thickness', label: 'Thickness', range: [0.003, 0.016], step: 0.0005, format: 'm' })
                        + this._select('blade.tip', 'Tip', TIPS) + this._select('blade.edge', 'Edge', EDGES)
                        + this._slider({ path: 'blade.fuller', label: 'Fuller', range: [0, 1] }) + this._slider({ path: 'blade.serrations', label: 'Serrations', range: [0, 1] });
                }
                if (tab === 'hilt') {
                    return this._section('Hand guard') + this._select('guard.type', 'Hand guard', GUARDS)
                        + (r.guard.type !== 'none' ? this._slider({ path: 'guard.size', label: 'Size', range: [0.4, 2.2], format: 'x' }) : '')
                        + (r.guard.type === 'cross' || r.guard.type === 'basket' ? this._slider({ path: 'guard.curl', label: 'Bend of the arms', range: [-1, 1], ends: ['Toward the grip', 'Toward the blade'] }) : '')
                        + this._section('Grip') + this._slider({ path: 'grip.length', label: 'Length', range: [0.06, 0.5], step: 0.005, format: 'm' }) + this._select('grip.wrap', 'Grip wrap', WRAPS)
                        + this._color('grip.color', 'Color', ['#4a2c1c', '#1b1b22', '#5a2a1a', '#a07a3a', '#2a4a6a'])
                        + this._section('Pommel') + this._select('pommel', 'Pommel', POMMELS);
                }
                return this._section('Materials') + this._select('metal', 'Blade', METALS) + this._select('trim', 'Guard and pommel', TRIMS)
                    + this._section('Glow') + this._check('glow.on', 'Glowing edge') + (r.glow.on ? this._color('glow.color', 'Glow color', ['#58c8ff', '#ff4a3a', '#7aff6a', '#c86aff', '#ffd24a']) + this._check('glow.blade', 'The whole blade') : '');
            }
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
