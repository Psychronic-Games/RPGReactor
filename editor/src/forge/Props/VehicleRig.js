/** RRVehicleRig - what moves on a built vehicle, and how.
 *
 * Doors swing on their front hinges, wheels roll about their axles (the
 * front pair steers), landing gear folds up into the belly, lift fans and
 * rotors spin. Each moving piece becomes its own named part ("Door left",
 * "Door left glass", "Lift fan 1", "Rotor 2", "Landing gear 3") with:
 *   - a pivot in model space and rules the game plays (model.json `pivots`
 *     and `animations`: pose rules "Doors open" / "Doors close" / "Gear up" /
 *     "Gear down" played by name, spin rules for fans and rotors), the same
 *     rules the Database 3D Models page edits;
 *   - a bone of its own, so the Prop Builder previews each motion as a loop
 *     ("Doors opening", "Driving", "Landing gear", "Rotors spinning").
 * The vehicle block already rolls the wheels and turns the steering in game.
 */
(function(root) {
    'use strict';
    const OPEN = 60, FOLD = 84, LOOP = 2.4, FPS = 30;

    /** Connected pieces of a part (triangles sharing vertices), with their boxes. */
    function piecesOf(p) {
        const I = p.index, P = p.positions, n = P.length / 3, parent = Int32Array.from({ length: n }, (_, i) => i);
        const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
        for (let t = 0; t < I.length; t += 3) for (const k of [1, 2]) { const a = find(I[t]), b = find(I[t + k]); if (a !== b) parent[a] = b; }
        const map = new Map();
        for (let t = 0; t < I.length; t += 3) {
            const r = find(I[t]);
            let g = map.get(r);
            if (!g) map.set(r, g = { tris: [], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
            g.tris.push(t);
            for (let k = 0; k < 3; k++) { const v = I[t + k]; for (let a = 0; a < 3; a++) { const x = P[v * 3 + a]; if (x < g.lo[a]) g.lo[a] = x; if (x > g.hi[a]) g.hi[a] = x; } }
        }
        return [...map.values()].map(g => Object.assign(g, { mid: g.lo.map((v, a) => (v + g.hi[a]) / 2) }));
    }
    /** A new mesh of the given triangles of p, every per-point attribute carried along. */
    function subset(p, tris) {
        const n = p.positions.length / 3, remap = new Int32Array(n).fill(-1), order = [], index = [];
        for (const t of tris) for (let k = 0; k < 3; k++) { const v = p.index[t + k]; if (remap[v] < 0) { remap[v] = order.length; order.push(v); } index.push(remap[v]); }
        const out = {};
        for (const [key, value] of Object.entries(p)) {
            if (key === 'index') continue;
            if (ArrayBuffer.isView(value) && value.length && value.length % n === 0) {
                const stride = value.length / n, copy = new value.constructor(order.length * stride);
                order.forEach((v, i) => { for (let s = 0; s < stride; s++) copy[i * stride + s] = value[v * stride + s]; });
                out[key] = copy;
            } else out[key] = value;
        }
        out.index = Uint32Array.from(index);
        return out;
    }
    /** Tags the pieces of `parts` that `test(piece, part)` picks with `code` in their first joint,
     * which survives the merge by material; finish() reads the tags back as carved regions. */
    function mark(parts, names, test, code) {
        for (const p of parts) {
            if (!names.test(p.name) || !p.index.length) continue;
            const n = p.positions.length / 3;
            if (!p.joints || p.joints.length !== n * 4) { p.joints = new Uint16Array(n * 4); p.weights = new Float32Array(n * 4); for (let i = 0; i < n; i++) p.weights[i * 4] = 1; }
            for (const g of piecesOf(p)) if (test(g, p)) for (const t of g.tris) for (let k = 0; k < 3; k++) p.joints[p.index[t + k] * 4] = code;
        }
    }
    const TAG = 1000;
    const DOOR_FITTINGS = /^(Access door|Vehicle lettering|Vehicle markings|Door handle recess|Door latch|Door hinges|Door armor plates|Door (left|right) .+)$/;

    /** Before consolidation: cuts the moving pieces out as parts of their own. Returns the rig: its pieces and pivots. */
    function pieces(parts, r, c, wheels, low) {
        const rig = [];
        const lowered = p => [p[0], p[1] - low, p[2]];
        if (['compact', 'sport', 'truck', 'rover'].includes(r.form) && c.door && c.sideAt) {
            const d = c.door, top = c.hood - low + .06, bottom = d.low - low - .02;
            for (const sign of [1, -1]) {
                const side = sign > 0 ? 'left' : 'right', y = (d.low + c.hood) / 2;
                const code = TAG + rig.length;
                mark(parts, DOOR_FITTINGS, (g, p) => sign * g.mid[0] > 0 && (p.name.startsWith('Door ' + side + ' ') ||
                    (g.lo[2] >= d.rear - .03 && g.hi[2] <= d.front + .03 && g.lo[1] >= bottom && g.hi[1] <= top && sign * (sign > 0 ? g.lo[0] : g.hi[0]) >= c.bw * .9)), code);
                rig.push({ bone: 'Door ' + side, prefix: 'Door ' + side, pivot: lowered([sign * (c.sideAt(d.front, y) - .012), y, d.front]), kind: 'door', sign });
            }
        }
        if (c.fans) c.fans.forEach((f, i) => {
            const at = lowered(f.at), name = 'Lift fan ' + (i + 1);
            mark(parts, /^Lift fan (blades|hubs)$/, g => Math.hypot(g.mid[0] - at[0], g.mid[2] - at[2]) < f.radius * 1.05 && Math.abs(g.mid[1] - at[1]) < f.radius, TAG + rig.length);
            rig.push({ bone: name, prefix: name, pivot: at, kind: 'fan', axis: [0, 1, 0] });
        });
        if (c.motors && r.form === 'drone') c.motors.forEach((m, i) => {
            const at = lowered(m), name = 'Rotor ' + (i + 1), R = Math.min(c.W, c.L) * .17 * r.engineSize;
            mark(parts, /^Twisted rotor blades$/, g => Math.hypot(g.mid[0] - at[0], g.mid[2] - at[2]) < R * 1.05, TAG + rig.length);
            rig.push({ bone: name, prefix: name, pivot: at, kind: 'fan', axis: [0, 1, 0] });
        });
        if (c.struts) c.struts.forEach((s, i) => {
            const at = lowered(s.at), name = 'Landing gear ' + (i + 1);
            const near = g => Math.sign(g.mid[0]) === Math.sign(at[0]) && Math.abs(g.mid[2] - at[2]) < s.reach * 1.2 && g.hi[1] <= at[1] + .02;
            // Leg and foot draw straight up into the hull together (one region, so the foot follows the leg exactly).
            mark(parts, /^Landing (strut housings|pistons|braces|feet|gear dampers( rods| eyes| glands)?)$/, near, TAG + rig.length);
            const leg = { bone: name, prefix: name, pivot: at, kind: 'gear', lift: s.well ? s.well.lift : at[1] };
            rig.push(leg);
            if (s.well) for (const e of [-1, 1]) {
                const w = s.well, hinge = lowered([w.x + e * w.hw, w.y, w.z]), dname = 'Landing gear door ' + (i + 1) + (e < 0 ? 'a' : 'b');
                mark(parts, /^Landing gear doors$/, g => Math.abs(g.mid[0] - hinge[0]) < w.hw * .3 && Math.abs(g.mid[2] - hinge[2]) < w.hw * 2, TAG + rig.length);
                // Each door swings up about its hinge to lie flat across the well.
                rig.push({ bone: dname, prefix: dname, pivot: hinge, kind: 'gearDoor', turn: -e * 90 });
            }
        });
        return rig;
    }

    const quat = (axis, deg) => { const h = deg * Math.PI / 360, s = Math.sin(h); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)]; };
    const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    /** 0 -> 1 -> held -> 0 over the loop, eased: a swing that opens, waits and closes. */
    const swing = t => { const u = t / LOOP, e = x => x * x * (3 - 2 * x); return u < .35 ? e(u / .35) : u < .65 ? 1 : e(1 - (u - .65) / .35); };

    /** After consolidation: bones, skin weights, preview clips, the game's pivots and rules. */
    function finish(parts, rig, r, wheels) {
        const bones = [{ name: 'Prop', head: [0, 0, 0], parent: -1 }, { name: 'Body', head: [0, 0, 0], parent: 0 }];
        const carved = rig.map(() => ({})), pivots = {}, rules = [];
        for (const piece of rig) { piece.index = bones.length; bones.push({ name: piece.bone, head: piece.pivot.slice(), parent: piece.leg ? piece.leg.index : 1 }); }
        const wheelBones = wheels.map(w => { const index = bones.length; bones.push({ name: 'Wheel ' + w.part.replace(/ tire$/, ''), head: w.at.slice(), parent: 0 }); return { w, index, front: /^Front/.test(w.part) }; });
        let mesh = 0;
        for (const p of parts) {
            if (!p.index.length) continue;
            const n = p.positions.length / 3, tag = new Int32Array(n).fill(-1);
            if (p.joints && p.joints.length === n * 4) for (let i = 0; i < n; i++) { const j = p.joints[i * 4] - TAG; if (j >= 0 && j < rig.length) tag[i] = j; }
            // The carved pieces' triangles go last, each region in one run (the region's triangles share their tag).
            const I = p.index, buckets = Array.from({ length: rig.length + 1 }, () => []);
            for (let t = 0; t < I.length; t += 3) buckets[tag[I[t]] + 1].push(I[t], I[t + 1], I[t + 2]);
            if (buckets.slice(1).some(b => b.length)) {
                let at = buckets[0].length / 3;
                buckets.slice(1).forEach((b, k) => { if (b.length) { carved[k][mesh] = [[at, b.length / 3]]; at += b.length / 3; } });
                p.index = Uint32Array.from(buckets.flat());
            }
            const wheel = wheelBones.find(b => b.w.part === p.name || (b.w.with || []).includes(p.name));
            const J = new Uint16Array(n * 4), W = new Float32Array(n * 4);
            for (let i = 0; i < n; i++) { J[i * 4] = wheel ? wheel.index : tag[i] >= 0 ? rig[tag[i]].index : 1; W[i * 4] = 1; }
            p.joints = J; p.weights = W;
            mesh++;
        }
        // Regions the game carves out of the saved meshes by triangle runs (model.json `parts`), each turning about its pivot.
        const regions = rig.map((q, k) => Object.keys(carved[k]).length ? { name: q.prefix, pivot: q.pivot.map(v => Math.round(v * 1e4) / 1e4), meshes: carved[k] } : null).filter(Boolean);
        rig = rig.filter((q, k) => Object.keys(carved[k]).length);
        const doors = rig.filter(q => q.kind === 'door'), fans = rig.filter(q => q.kind === 'fan'), gear = rig.filter(q => q.kind === 'gear'), doorsGear = rig.filter(q => q.kind === 'gearDoor');
        // The game's rules: played by name, each part turning about its own pivot.
        for (const q of doors) {
            const open = [0, -q.sign * OPEN, 0];
            rules.push({ name: 'Doors open', type: 'pose', trigger: 'action', part: q.prefix, period: 40, stay: true, keys: [{ at: 0, rotate: [0, 0, 0] }, { at: 1, rotate: open, ease: 'out' }] });
            rules.push({ name: 'Doors close', type: 'pose', trigger: 'action', part: q.prefix, period: 36, keys: [{ at: 0, rotate: open }, { at: 1, rotate: [0, 0, 0], ease: 'in' }] });
        }
        const lerp = (k, f) => k.map(v => Math.round(v * f * 1e4) / 1e4);
        // The leg telescopes up into its well (squashed toward its top mount, foot and all), then the doors shut under it.
        const STOW = .03;
        for (const q of gear) {
            const up = [1, STOW, 1];
            rules.push({ name: 'Gear up', type: 'pose', trigger: 'action', part: q.prefix, period: 70, stay: true, keys: [{ at: 0, resize: [1, 1, 1] }, { at: .65, resize: up }, { at: 1, resize: up }] });
            rules.push({ name: 'Gear down', type: 'pose', trigger: 'action', part: q.prefix, period: 70, keys: [{ at: 0, resize: up }, { at: .35, resize: up }, { at: 1, resize: [1, 1, 1] }] });
        }
        for (const q of doorsGear) {
            const shut = [0, 0, q.turn];
            rules.push({ name: 'Gear up', type: 'pose', trigger: 'action', part: q.prefix, period: 70, stay: true, keys: [{ at: 0, rotate: [0, 0, 0] }, { at: .65, rotate: [0, 0, 0] }, { at: 1, rotate: shut }] });
            rules.push({ name: 'Gear down', type: 'pose', trigger: 'action', part: q.prefix, period: 70, keys: [{ at: 0, rotate: shut }, { at: .35, rotate: [0, 0, 0] }, { at: 1, rotate: [0, 0, 0] }] });
        }
        if (fans.length) rules.push({ name: r.form === 'drone' ? 'Rotors' : 'Lift fans', type: 'spin', trigger: 'always', part: r.form === 'drone' ? 'Rotor' : 'Lift fan', axis: 'y', speed: r.form === 'drone' ? 1440 : 900 });
        // Preview loops, one bone track each.
        const times = Float32Array.from({ length: Math.round(LOOP * FPS) + 1 }, (_, f) => f / FPS), track = (bone, fn) => ({ bone, path: 'rotation', times, values: Float32Array.from(Array.from(times).flatMap(fn)) });
        const clips = [];
        if (doors.length) clips.push({ id: 'doors', name: 'Doors opening', times, tracks: doors.map(q => track(q.index, t => quat([0, 1, 0], -q.sign * OPEN * swing(t)))) });
        if (wheelBones.length) {
            const turns = 2;
            const tracks = wheelBones.map(b => track(b.index, t => { const spin = quat([1, 0, 0], 360 * turns * t / LOOP); return b.front ? qmul(quat([0, 1, 0], 14 * Math.sin(2 * Math.PI * t / LOOP)), spin) : spin; }));
            // A slight suspension bob: the body rides up and down twice a loop.
            const bob = Math.max(.004, (r.height || 1) * .006);
            tracks.push({ bone: 1, path: 'translation', times, values: Float32Array.from(Array.from(times).flatMap(t => [0, bob * Math.sin(4 * Math.PI * t / LOOP), 0])) });
            clips.push({ id: 'drive', name: 'Driving', times, tracks });
        }
        if (gear.length) {
            // Up: the legs rise (first two thirds), then the doors shut; down: the doors open, then the legs lower.
            const e = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
            const legAt = t => { const u = t / LOOP; return u < .5 ? e(u / .3) : e((1 - u) / .3); };
            const doorAt = t => { const u = t / LOOP; return u < .5 ? e((u - .3) / .15) : e((.7 - u) / .15); };
            const tracks = gear.map(q => ({ bone: q.index, path: 'scale', times, values: Float32Array.from(Array.from(times).flatMap(t => [1, 1 - (1 - STOW) * legAt(t), 1])) }));
            for (const q of doorsGear) tracks.push(track(q.index, t => quat([0, 0, 1], q.turn * doorAt(t))));
            clips.push({ id: 'gear', name: 'Landing gear', times, tracks });
        }
        if (fans.length) clips.push({ id: 'fly', name: 'Rotors spinning', times, tracks: fans.map((q, i) => track(q.index, t => quat([0, 1, 0], (i % 2 ? -1 : 1) * 360 * 3 * t / LOOP))) });
        return { bones, regions, rules, clips, preview: id => clips.filter(c => c.id === id) };
    }
    const api = { pieces, finish, piecesOf, subset, LOOP, OPEN, FOLD };
    root.RRVehicleRig = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
