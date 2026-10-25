/**
 * RRPropCloth - a sheet of cloth in the wind, simulated in the tool and
 * baked into a loop the game plays on a grid of bones.
 *
 * The sheet is a grid of particles (Verlet, position-based constraints):
 * stretch and shear held stiff, bending by fabric, tethers from the pinned
 * edge so the cloth never sags longer than it is, pushed out of the pole
 * and out of itself. Air acts on every triangle by the wind's speed through
 * it (pressure on its face, a little drag along it), so the sheet flutters
 * on its own; gusts and turbulence that travel with the wind repeat every
 * loop length, so the motion settles into a near-repeating cycle that the
 * bake closes with a short crossfade.
 *
 * The bake keeps a coarser grid of bones (every other particle): each bone
 * sits on its particle, turned with the sheet there; the drawn sheet is
 * skinned to the four bones around each vertex.
 */
(function(root) {
    'use strict';

    const AIR = 1.2;
    const ITERATIONS = 5;

    /** Fabrics by how they hang and fly: weight per square meter, bending, how quickly motion dies. */
    const FABRICS = {
        cotton: { density: 0.16, bend: 0.16, damping: 0.5, drag: 1.05 },
        silk: { density: 0.07, bend: 0.035, damping: 0.35, drag: 1.0 },
        wool: { density: 0.38, bend: 0.45, damping: 0.9, drag: 1.1 },
        tattered: { density: 0.17, bend: 0.14, damping: 0.55, drag: 1.0 }
    };

    function random(seed) {
        let s = (seed >>> 0) || 0x9e3779b9;
        s = Math.imul(s ^ 0x85ebca6b, 0xc2b2ae35) >>> 0 || 1;
        return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    }

    /**
     * The wind: a speed (m/s) along a direction in the ground plane (radians
     * from +x toward +z), gusts that swell and fall, and turbulence carried
     * along with it. Everything that varies repeats every `loop` seconds.
     */
    function makeWind(w) {
        const rand = random((w.seed || 1) * 7919 + 13);
        const loop = w.loop || 3;
        const gusts = [1, 2, 3].map((k, i) => ({ k, a: [0.55, 0.3, 0.15][i], p: rand() * Math.PI * 2 }));
        const used = new Set();
        const modes = [];
        for (let m = 0; m < 7; m++) {
            let k;
            do { k = 2 + Math.floor(rand() * 13); } while (used.has(k));
            used.add(k);
            const e = [(rand() * 2 - 1) * 0.35, rand() * 2 - 1, rand() * 2 - 1];
            const l = Math.hypot(e[0], e[1], e[2]) || 1;
            const q = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
            modes.push({ f: k / loop, amp: 1 / Math.sqrt(k), e: e.map(v => v / l), q, p: rand() * Math.PI * 2 });
        }
        const ampSum = modes.reduce((s, m) => s + m.amp, 0);
        for (const m of modes) m.amp /= ampSum / 1.6;
        // The pole's wake: pressure waves that run down the cloth from the hoist, faster and shorter in a
        // harder wind, a whole number of them each loop.
        const speed = Math.max(0, w.speed || 0), reachOf = w.length || 1.5;
        const waveSpeed = 0.45 * Math.max(speed, 0.5), waveFreq = Math.max(1, Math.round(waveSpeed / (reachOf * (speed > 8 ? 0.5 : 0.7)) * loop)) / loop;
        const flutter = { f: waveFreq, k: 2 * Math.PI * waveFreq / waveSpeed, f2: Math.max(2, Math.round(waveFreq * 1.7 * loop)) / loop, p: rand() * Math.PI * 2 };
        flutter.k2 = 2 * Math.PI * flutter.f2 / waveSpeed;
        const angle = w.angle || 0;
        return { flutter, speed: Math.max(0, w.speed || 0), gust: Math.max(0, Math.min(1, w.gust || 0)), loop, gusts, modes, dir: [Math.cos(angle), 0, Math.sin(angle)] };
    }

    function windAt(wind, x, y, z, t, out) {
        const d = wind.dir, L = wind.loop;
        let g = 0;
        for (const q of wind.gusts) g += q.a * Math.sin(2 * Math.PI * q.k * t / L + q.p);
        const base = wind.speed * Math.max(0.08, 1 + wind.gust * 0.85 * g);
        out[0] = d[0] * base; out[1] = 0; out[2] = d[2] * base;
        // Air is never quite still: a calm still stirs the cloth a little.
        const turb = Math.max(wind.speed, 0.35) * (0.1 + 0.32 * wind.gust) * Math.max(0.6, 1 + wind.gust * 0.5 * g);
        const along = x * d[0] + z * d[2];
        const reach = 2 * Math.PI / Math.max(wind.speed, 1.2);
        for (const m of wind.modes) {
            const k = reach * m.f;
            const s = turb * m.amp * Math.sin(2 * Math.PI * m.f * t - k * along - k * 0.4 * (x * m.q[0] + y * m.q[1] + z * m.q[2]) + m.p);
            out[0] += m.e[0] * s; out[1] += m.e[1] * s; out[2] += m.e[2] * s;
        }
        return out;
    }

    /**
     * A sheet ready to run. `setup`: { nx, ny, rest (Float32Array, nx*ny*3,
     * row by row: i across, j down), pinned (Uint8Array), area (m²), fabric
     * (a FABRICS key or its values), wind, holes (Uint8Array per cell: 1 lets
     * the air through), colliders ([{ a, b, r }] capsules) }.
     */
    function create(setup) {
        const nx = setup.nx, ny = setup.ny, n = nx * ny;
        const rest = Float32Array.from(setup.rest);
        const pinned = setup.pinned ? Uint8Array.from(setup.pinned) : new Uint8Array(n);
        // A flat sheet in a flat wind stays flat: it starts a hair out of true, as cloth always is.
        const pos = Float32Array.from(rest), jitter = random(nx * 131 + ny);
        for (let p = 0; p < n; p++) if (!pinned[p]) for (let k = 0; k < 3; k++) pos[p * 3 + k] += (jitter() - 0.5) * 0.004;
        const prev = Float32Array.from(pos);
        const id = (i, j) => j * nx + i;
        const dist = (a, b) => Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]);
        const ca = [], cb = [], cl = [], ck = [];
        const link = (a, b, k) => { ca.push(a); cb.push(b); cl.push(dist(a, b)); ck.push(k); };
        const state = { nx, ny, n, rest, pos, prev, pinned, time: 0, carry: 0, scratch: new Float32Array(3) };
        // Stretch and shear, then bending (every other particle).
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            if (i + 1 < nx) link(id(i, j), id(i + 1, j), 1);
            if (j + 1 < ny) link(id(i, j), id(i, j + 1), 1);
        }
        state.structural = ca.length;
        for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
            link(id(i, j), id(i + 1, j + 1), 0.6);
            link(id(i + 1, j), id(i, j + 1), 0.6);
        }
        state.shear = ca.length;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            if (i + 2 < nx) link(id(i, j), id(i + 2, j), 1);
            if (j + 2 < ny) link(id(i, j), id(i, j + 2), 1);
        }
        state.ca = Int32Array.from(ca); state.cb = Int32Array.from(cb); state.cl = Float32Array.from(cl); state.ck = Float32Array.from(ck);
        // Tethers: no particle strays farther from its nearest pin than it lies at rest.
        const pins = [];
        for (let p = 0; p < n; p++) if (pinned[p]) pins.push(p);
        state.tether = new Int32Array(n).fill(-1);
        state.tetherLength = new Float32Array(n);
        if (pins.length) for (let p = 0; p < n; p++) {
            if (pinned[p]) continue;
            let best = -1, bd = Infinity;
            for (const q of pins) { const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
            state.tether[p] = best; state.tetherLength[p] = bd;
        }
        // The air acts on every cell that holds cloth.
        const tris = [];
        for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
            if (setup.holes && setup.holes[j * (nx - 1) + i]) continue;
            const a = id(i, j), b = id(i + 1, j), c = id(i, j + 1), d = id(i + 1, j + 1);
            tris.push(a, c, b, b, c, d);
        }
        state.tris = Int32Array.from(tris);
        state.spacing = Math.min(dist(id(0, 0), id(1, 0)), dist(id(0, 0), id(0, 1)));
        state.colliders = (setup.colliders || []).map(c => ({ a: c.a.slice(), b: c.b.slice(), r: c.r }));
        state.dv = new Float32Array(n * 3);
        state.cellStart = new Int32Array(4097);
        state.cellOf = new Int32Array(n);
        state.cellItems = new Int32Array(n);
        state.area = setup.area || 1;
        configure(state, setup);
        return state;
    }

    /** New fabric or wind for a running sheet, without starting it over. */
    function configure(state, setup) {
        const fabric = typeof setup.fabric === 'string' ? FABRICS[setup.fabric] || FABRICS.cotton : Object.assign({}, FABRICS.cotton, setup.fabric || {});
        state.fabric = fabric;
        state.mass = Math.max(1e-5, fabric.density * state.area / state.n);
        for (let c = state.shear; c < state.ck.length; c++) state.ck[c] = fabric.bend;
        state.wind = makeWind(setup.wind || {});
        // Pins that move: the pinned edge swings as a whole with what it hangs from (a rope in the wind),
        // `amp` meters each way, round once a loop.
        state.sway = setup.sway && setup.sway.amp ? { amp: setup.sway.amp.slice(), phase: setup.sway.phase || 0 } : null;
        state.pin = [0, 0, 0];
        // Steps a second: more in a hard wind, where the cloth moves farthest in a step.
        state.rate = state.wind.speed > 10 ? 360 : 240;
    }

    function substep(state, h) {
        const { pos, prev, pinned, dv, n } = state;
        swayAt(state, state.time + h);
        const pin = state.pin;
        const f = state.fabric, wind = state.wind, w = state.scratch, tris = state.tris, m = state.mass;
        dv.fill(0);
        const cn = 0.5 * AIR * f.drag, ct = 0.5 * AIR * 0.03;
        const flutterPush = 0.5 * AIR * wind.speed * wind.speed * (0.08 + 0.12 * wind.gust) * (1 + Math.min(1, Math.max(0, (wind.speed - 8) / 8)));
        for (let t = 0; t < tris.length; t += 3) {
            const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
            const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
            const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (len < 1e-12) continue;
            const area = len * 0.5;
            nx /= len; ny /= len; nz /= len;
            const cx = (pos[a] + pos[b] + pos[c]) / 3, cy = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
            windAt(wind, cx, cy, cz, state.time, w);
            const rx = w[0] - ((pos[a] - prev[a]) + (pos[b] - prev[b]) + (pos[c] - prev[c])) / (3 * h);
            const ry = w[1] - ((pos[a + 1] - prev[a + 1]) + (pos[b + 1] - prev[b + 1]) + (pos[c + 1] - prev[c + 1])) / (3 * h);
            const rz = w[2] - ((pos[a + 2] - prev[a + 2]) + (pos[b + 2] - prev[b + 2]) + (pos[c + 2] - prev[c + 2])) / (3 * h);
            const vn = rx * nx + ry * ny + rz * nz;
            // The wake's push across the wind, on cloth that faces across it.
            const fl = wind.flutter, along = cx * wind.dir[0] + cz * wind.dir[2], side = Math.abs(nx * -wind.dir[2] + nz * wind.dir[0]);
            const wake = flutterPush * area * side * (Math.sin(2 * Math.PI * fl.f * state.time - fl.k * along + fl.p) + 0.45 * Math.sin(2 * Math.PI * fl.f2 * state.time - fl.k2 * along + fl.p * 1.7)) / (3 * m) * h;
            dv[a] -= wake * wind.dir[2]; dv[a + 2] += wake * wind.dir[0];
            dv[b] -= wake * wind.dir[2]; dv[b + 2] += wake * wind.dir[0];
            dv[c] -= wake * wind.dir[2]; dv[c + 2] += wake * wind.dir[0];
            // Pressure on the face, never more in one step than brings the cloth to the air's own speed.
            let push = cn * area * vn * Math.abs(vn) / (3 * m) * h;
            const most = Math.abs(vn) * 0.8;
            if (push > most) push = most; else if (push < -most) push = -most;
            const tx = rx - vn * nx, ty = ry - vn * ny, tz = rz - vn * nz, tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
            const slide = Math.min(ct * area * tl / (3 * m) * h, 0.5);
            const gx = push * nx + slide * tx, gy = push * ny + slide * ty, gz = push * nz + slide * tz;
            dv[a] += gx; dv[a + 1] += gy; dv[a + 2] += gz;
            dv[b] += gx; dv[b + 1] += gy; dv[b + 2] += gz;
            dv[c] += gx; dv[c + 1] += gy; dv[c + 2] += gz;
        }
        const keep = Math.max(0, 1 - f.damping * h), g = 9.81 * h * h;
        const most = state.spacing * 0.9;
        for (let p = 0; p < n; p++) {
            const k = p * 3;
            if (pinned[p]) { prev[k] = pos[k]; prev[k + 1] = pos[k + 1]; prev[k + 2] = pos[k + 2]; pos[k] = state.rest[k] + pin[0]; pos[k + 1] = state.rest[k + 1] + pin[1]; pos[k + 2] = state.rest[k + 2] + pin[2]; continue; }
            let mx = (pos[k] - prev[k]) * keep + dv[k] * h;
            let my = (pos[k + 1] - prev[k + 1]) * keep + dv[k + 1] * h - g;
            let mz = (pos[k + 2] - prev[k + 2]) * keep + dv[k + 2] * h;
            // A step longer than the spacing would tunnel through the sheet: held to it.
            const ml = Math.sqrt(mx * mx + my * my + mz * mz);
            if (ml > most) { const s = most / ml; mx *= s; my *= s; mz *= s; }
            prev[k] = pos[k]; prev[k + 1] = pos[k + 1]; prev[k + 2] = pos[k + 2];
            pos[k] += mx; pos[k + 1] += my; pos[k + 2] += mz;
        }
        project(state, ITERATIONS, state.ck.length);
        collide(state);
        state.time += h;
    }

    /** Constraints, tethers and pins, `iterations` times over the first `count` links. */
    function project(state, iterations, count, keepPins) {
        const { pos, pinned, ca, cb, cl, ck, tether, tetherLength } = state;
        for (let it = 0; it < iterations; it++) {
            for (let c = 0; c < count; c++) {
                const a = ca[c], b = cb[c], pa = pinned[a], pb = pinned[b];
                if (pa && pb) continue;
                const A = a * 3, B = b * 3;
                const dx = pos[B] - pos[A], dy = pos[B + 1] - pos[A + 1], dz = pos[B + 2] - pos[A + 2];
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (d < 1e-9) continue;
                const rest = cl[c];
                // Bending only resists folding tighter; it never pushes a sheet apart. Shear only holds
                // against a pull: pushed along itself, cloth folds.
                if (c >= state.shear ? d > rest : c >= state.structural && d < rest) continue;
                const diff = (d - rest) / d * (d < rest && c < state.structural ? ck[c] * 0.3 : ck[c]);
                const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
                pos[A] += dx * diff * wa; pos[A + 1] += dy * diff * wa; pos[A + 2] += dz * diff * wa;
                pos[B] -= dx * diff * wb; pos[B + 1] -= dy * diff * wb; pos[B + 2] -= dz * diff * wb;
            }
        }
        for (let p = 0; p < state.n; p++) {
            const q = tether[p];
            if (q < 0) continue;
            const P = p * 3, Q = q * 3;
            const dx = pos[P] - pos[Q], dy = pos[P + 1] - pos[Q + 1], dz = pos[P + 2] - pos[Q + 2];
            const dd = dx * dx + dy * dy + dz * dz, L = tetherLength[p] * 1.01;
            if (dd > L * L) { const d = Math.sqrt(dd); const s = L / d; pos[P] = pos[Q] + dx * s; pos[P + 1] = pos[Q + 1] + dy * s; pos[P + 2] = pos[Q + 2] + dz * s; }
        }
        if (keepPins) return;
        const pin = state.pin || [0, 0, 0];
        for (let p = 0; p < state.n; p++) if (pinned[p]) { const k = p * 3; pos[k] = state.rest[k] + pin[0]; pos[k + 1] = state.rest[k + 1] + pin[1]; pos[k + 2] = state.rest[k + 2] + pin[2]; }
    }

    /** Out of the pole (and any capsule), then out of itself. */
    function collide(state) {
        const { pos, prev, pinned, n, nx } = state;
        const margin = state.spacing * 0.12;
        for (const c of state.colliders) {
            const ax = c.a[0], ay = c.a[1], az = c.a[2];
            const sx = c.b[0] - ax, sy = c.b[1] - ay, sz = c.b[2] - az, sl = sx * sx + sy * sy + sz * sz || 1;
            const r = c.r + margin;
            for (let p = 0; p < n; p++) {
                if (pinned[p]) continue;
                const k = p * 3;
                const t = Math.max(0, Math.min(1, ((pos[k] - ax) * sx + (pos[k + 1] - ay) * sy + (pos[k + 2] - az) * sz) / sl));
                const dx = pos[k] - (ax + sx * t), dy = pos[k + 1] - (ay + sy * t), dz = pos[k + 2] - (az + sz * t);
                const dd = dx * dx + dy * dy + dz * dz;
                if (dd >= r * r || dd < 1e-18) continue;
                const s = r / Math.sqrt(dd);
                pos[k] = ax + sx * t + dx * s; pos[k + 1] = ay + sy * t + dy * s; pos[k + 2] = az + sz * t + dz * s;
                // Friction against the pole.
                prev[k] = prev[k] * 0.5 + pos[k] * 0.5; prev[k + 1] = prev[k + 1] * 0.5 + pos[k + 1] * 0.5; prev[k + 2] = prev[k + 2] * 0.5 + pos[k + 2] * 0.5;
            }
        }
        // The sheet keeps out of itself: particles far apart on the cloth stay a little apart in space.
        const rc = state.spacing * 0.55, inv = 1 / rc, T = 4096;
        const start = state.cellStart, cellOf = state.cellOf, items = state.cellItems;
        const hash = (x, y, z) => ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0) & (T - 1);
        start.fill(0);
        for (let p = 0; p < n; p++) {
            const k = p * 3;
            cellOf[p] = hash(Math.floor(pos[k] * inv), Math.floor(pos[k + 1] * inv), Math.floor(pos[k + 2] * inv));
            start[cellOf[p] + 1]++;
        }
        for (let c = 0; c < T; c++) start[c + 1] += start[c];
        const fill = state._fill || (state._fill = new Int32Array(T));
        fill.set(start.subarray(0, T));
        for (let p = 0; p < n; p++) items[fill[cellOf[p]]++] = p;
        for (let p = 0; p < n; p++) {
            const k = p * 3, pi = p % nx, pj = (p - pi) / nx;
            const cx = Math.floor(pos[k] * inv), cy = Math.floor(pos[k + 1] * inv), cz = Math.floor(pos[k + 2] * inv);
            for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const cell = hash(cx + dx, cy + dy, cz + dz);
                for (let s = start[cell]; s < start[cell + 1]; s++) {
                    const q = items[s];
                    if (q <= p) continue;
                    const qi = q % nx, qj = (q - qi) / nx;
                    if (Math.abs(qi - pi) <= 2 && Math.abs(qj - pj) <= 2) continue;
                    const K = q * 3;
                    const ex = pos[K] - pos[k], ey = pos[K + 1] - pos[k + 1], ez = pos[K + 2] - pos[k + 2];
                    const dd = ex * ex + ey * ey + ez * ez;
                    if (dd >= rc * rc || dd < 1e-18) continue;
                    const d = Math.sqrt(dd);
                    const push = (rc - d) / d;
                    const wp = pinned[p] ? 0 : pinned[q] ? 1 : 0.5, wq = pinned[q] ? 0 : pinned[p] ? 1 : 0.5;
                    pos[k] -= ex * push * wp; pos[k + 1] -= ey * push * wp; pos[k + 2] -= ez * push * wp;
                    pos[K] += ex * push * wq; pos[K + 1] += ey * push * wq; pos[K + 2] += ez * push * wq;
                }
            }
        }
    }

    /** Where a moving pinned edge is at time `t`, into `state.pin`. */
    function swayAt(state, t) {
        const s = state.sway, out = state.pin;
        if (!s) { out[0] = out[1] = out[2] = 0; return out; }
        const w = Math.sin(2 * Math.PI * t / state.wind.loop + s.phase);
        out[0] = s.amp[0] * w; out[1] = s.amp[1] * Math.abs(w); out[2] = s.amp[2] * w;
        return out;
    }

    /** Runs the sheet on by `seconds` of its own time, in fixed steps; at most `limit` steps a call. */
    function advance(state, seconds, limit) {
        const h = 1 / state.rate;
        state.carry += seconds;
        let steps = Math.floor(state.carry / h + 1e-9);
        if (limit && steps > limit) { steps = limit; state.carry = 0; } else state.carry -= steps * h;
        for (let s = 0; s < steps; s++) substep(state, h);
        return steps;
    }

    /**
     * The loop: the sheet run until it has settled, then a stretch recorded
     * at `fps`, the loop's start chosen where the sheet one loop later is
     * most nearly the same, and the last `crossfade` seconds blended into
     * the first so the end runs on into the start. Returns { frames
     * (Float32Array per frame, frame 0 repeated at the end), fps, duration }.
     */
    function bake(setup, options) {
        const o = options || {};
        const fps = o.fps || 30;
        const state = create(setup);
        const L = state.wind.loop, N = Math.round(L * fps);
        const fade = Math.max(2, Math.round((o.crossfade ?? 0.5) * fps));
        // A sheet hung from something that swings starts its loop on a whole loop, in step with it (and with any
        // other sheet on it); a still edge starts wherever the sheet comes back closest to itself.
        const search = state.sway ? 0 : Math.round(Math.min(L, 1) * fps);
        // Until it has settled: a calm cloth takes longer to fall into its folds.
        const warm = o.warm ?? 3 + 4 * Math.max(0, 1 - state.wind.speed / 3);
        advance(state, state.sway ? Math.ceil(warm / L) * L : warm);
        const recorded = [];
        for (let k = 0; k <= N + search + fade + 1; k++) {
            recorded.push(Float32Array.from(state.pos));
            advance(state, 1 / fps);
        }
        // Where the sheet comes back closest to itself, its motion too.
        let best = 0, bestCost = Infinity;
        for (let s = 0; s <= search; s++) {
            const A = recorded[s], B = recorded[s + N], A1 = recorded[s + 1], B1 = recorded[s + N + 1];
            let cost = 0;
            for (let i = 0; i < A.length; i++) {
                const d = A[i] - B[i], v = (A1[i] - A[i]) - (B1[i] - B[i]);
                cost += d * d + 4 * v * v;
            }
            if (cost < bestCost) { bestCost = cost; best = s; }
        }
        const frames = [];
        for (let k = 0; k < N; k++) {
            const here = recorded[best + k];
            if (k >= fade) { frames.push(Float32Array.from(here)); continue; }
            const later = recorded[best + N + k], w = k / fade, s = w * w * (3 - 2 * w), out = new Float32Array(here.length);
            for (let i = 0; i < out.length; i++) out[i] = later[i] + (here[i] - later[i]) * s;
            frames.push(out);
        }
        // Lengths restored on every frame alike (a blend of two sheets is a little short).
        const fix = Object.assign({}, state, { pos: null });
        for (const frame of frames) { fix.pos = frame; project(fix, 3, state.shear, true); }
        frames.push(Float32Array.from(frames[0]));
        return { frames, fps, duration: N / fps, nx: state.nx, ny: state.ny, closing: Math.sqrt(bestCost / recorded[0].length) };
    }

    // ── bones ──────────────────────────────────────────────────────────────
    /** Evenly spread indices 0..n-1, `count` of them, ends included. */
    function spread(n, count) {
        const c = Math.max(2, Math.min(n, count));
        return Array.from({ length: c }, (_, k) => Math.round(k * (n - 1) / (c - 1)));
    }

    /**
     * The bone grid for a sheet: which particles carry a bone (`bi` across,
     * `bj` down), and each drawn vertex's four bones and weights (bilinear in
     * the grid).
     */
    function boneGrid(nx, ny, maxBones, lead) {
        let bx = Math.ceil(nx / 2) + (nx % 2 ? 0 : 1), by = Math.ceil(ny / 2) + (ny % 2 ? 0 : 1);
        // Over the budget, both ways thinned alike: each keeps its share of the particles.
        while (bx * by > (maxBones || 120) && (bx > 2 || by > 2)) { if (bx / nx >= by / ny && bx > 2) bx--; else if (by > 2) by--; else bx--; }
        const bi = spread(nx, bx), bj = spread(ny, by);
        const joints = new Uint16Array(nx * ny * 4), weights = new Float32Array(nx * ny * 4);
        const cellOf = (list, v) => { let k = 0; while (k + 2 < list.length && list[k + 1] <= v) k++; return [k, (v - list[k]) / (list[k + 1] - list[k])]; };
        for (let j = 0; j < ny; j++) {
            const [l, fv] = cellOf(bj, j);
            for (let i = 0; i < nx; i++) {
                const [k, fu] = cellOf(bi, i);
                const o = (j * nx + i) * 4;
                const b = (kk, ll) => ll * bi.length + kk;
                joints[o] = b(k, l); joints[o + 1] = b(k + 1, l); joints[o + 2] = b(k, l + 1); joints[o + 3] = b(k + 1, l + 1);
                weights[o] = (1 - fu) * (1 - fv); weights[o + 1] = fu * (1 - fv); weights[o + 2] = (1 - fu) * fv; weights[o + 3] = fu * fv;
            }
        }
        return { bi, bj, count: bi.length * bj.length, joints, weights, lead: lead || 'up' };
    }

    /**
     * The sheet's frame at a particle: across (x), up the columns (y) and out
     * of the face (z). One of across or up is kept exactly as the grid runs
     * there (`lead`), the one along the pinned edge, so a vertex between two
     * pinned bones stays on the edge.
     */
    function frameAt(P, nx, ny, i, j, out, lead) {
        const at = (ii, jj) => (Math.max(0, Math.min(ny - 1, jj)) * nx + Math.max(0, Math.min(nx - 1, ii))) * 3;
        const a = at(i - 1, j), b = at(i + 1, j), u = at(i, j - 1), d = at(i, j + 1);
        let ax = P[b] - P[a], ay = P[b + 1] - P[a + 1], az = P[b + 2] - P[a + 2];
        let yx = P[u] - P[d], yy = P[u + 1] - P[d + 1], yz = P[u + 2] - P[d + 2];
        let nx_ = ay * yz - az * yy, ny_ = az * yx - ax * yz, nz_ = ax * yy - ay * yx;
        let nl = Math.sqrt(nx_ * nx_ + ny_ * ny_ + nz_ * nz_);
        if (nl < 1e-12) { nx_ = 0; ny_ = 0; nz_ = 1; nl = 1; }
        nx_ /= nl; ny_ /= nl; nz_ /= nl;
        if (lead === 'across') {
            const l = Math.sqrt(ax * ax + ay * ay + az * az) || 1; ax /= l; ay /= l; az /= l;
            // up = out × across
            yx = ny_ * az - nz_ * ay; yy = nz_ * ax - nx_ * az; yz = nx_ * ay - ny_ * ax;
        } else {
            const l = Math.sqrt(yx * yx + yy * yy + yz * yz) || 1; yx /= l; yy /= l; yz /= l;
            // across = up × out
            ax = yy * nz_ - yz * ny_; ay = yz * nx_ - yx * nz_; az = yx * ny_ - yy * nx_;
        }
        // out again, square to both
        nx_ = ay * yz - az * yy; ny_ = az * yx - ax * yz; nz_ = ax * yy - ay * yx;
        out[0] = ax; out[1] = ay; out[2] = az; out[3] = yx; out[4] = yy; out[5] = yz; out[6] = nx_; out[7] = ny_; out[8] = nz_;
        return out;
    }

    /** A rotation matrix (columns x, y, z) as a quaternion, written at `out[o..o+3]`. */
    function quatInto(m, out, o) {
        const m00 = m[0], m10 = m[1], m20 = m[2], m01 = m[3], m11 = m[4], m21 = m[5], m02 = m[6], m12 = m[7], m22 = m[8];
        const tr = m00 + m11 + m22;
        let x, y, z, w;
        if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s; }
        else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
        else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
        else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
        const l = Math.hypot(x, y, z, w) || 1;
        out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l; out[o + 3] = w / l;
    }

    /**
     * Each bone's place and turn for one state of the sheet: it stands on its
     * particle, turned from the sheet's frame at rest to its frame now.
     * Writes into `T` (3 per bone) and `Q` (4 per bone).
     */
    function posesFor(P, rest, nx, ny, grid, T, Q, scratch) {
        const S = scratch || new Float32Array(18), now = S.subarray(0, 9), m = S.subarray(9, 18);
        // The sheet's frames at rest, once per grid and rest.
        if (!grid.restFrames || grid.restOf !== rest) {
            grid.restFrames = new Float32Array(grid.count * 9);
            let r = 0;
            for (const j of grid.bj) for (const i of grid.bi) frameAt(rest, nx, ny, i, j, grid.restFrames.subarray(r * 9, r * 9 + 9), grid.lead), r++;
            grid.restOf = rest;
        }
        let b = 0;
        for (const j of grid.bj) for (const i of grid.bi) {
            const k = (j * nx + i) * 3, was = grid.restFrames.subarray(b * 9, b * 9 + 9);
            T[b * 3] = P[k]; T[b * 3 + 1] = P[k + 1]; T[b * 3 + 2] = P[k + 2];
            frameAt(P, nx, ny, i, j, now, grid.lead);
            // R = now · wasᵀ
            for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 3 + r] = now[r] * was[c] + now[3 + r] * was[3 + c] + now[6 + r] * was[6 + c];
            quatInto(m, Q, b * 4);
            b++;
        }
    }

    /** Bone tracks for a baked loop: { times, T: [Float32Array per bone], Q: [...] }, each quaternion track kept on one hemisphere. */
    function tracks(baked, rest, grid) {
        const frames = baked.frames, count = grid.count, F = frames.length;
        const times = new Float32Array(F);
        for (let f = 0; f < F; f++) times[f] = f / baked.fps;
        times[F - 1] = baked.duration;
        const T = Array.from({ length: count }, () => new Float32Array(F * 3));
        const Q = Array.from({ length: count }, () => new Float32Array(F * 4));
        const t = new Float32Array(count * 3), q = new Float32Array(count * 4), scratch = new Float32Array(18);
        for (let f = 0; f < F; f++) {
            posesFor(frames[f], rest, baked.nx, baked.ny, grid, t, q, scratch);
            for (let b = 0; b < count; b++) {
                T[b].set(t.subarray(b * 3, b * 3 + 3), f * 3);
                let x = q[b * 4], y = q[b * 4 + 1], z = q[b * 4 + 2], w = q[b * 4 + 3];
                if (f > 0) {
                    const p = Q[b], o = (f - 1) * 4;
                    if (p[o] * x + p[o + 1] * y + p[o + 2] * z + p[o + 3] * w < 0) { x = -x; y = -y; z = -z; w = -w; }
                }
                Q[b].set([x, y, z, w], f * 4);
            }
        }
        // The closing key is the opening key exactly.
        for (let b = 0; b < count; b++) { T[b].set(T[b].subarray(0, 3), (F - 1) * 3); Q[b].set(Q[b].subarray(0, 4), (F - 1) * 4); }
        return { times, T, Q };
    }

    /**
     * Linear blend skinning as the game does it: each vertex by its four
     * bones, each bone's turn applied about its rest place. `restBones` (3
     * per bone), `T`/`Q` the bones now; writes into `out`.
     */
    function skin(restPositions, joints, weights, restBones, T, Q, out) {
        const n = restPositions.length / 3;
        for (let v = 0; v < n; v++) {
            let x = 0, y = 0, z = 0;
            for (let k = 0; k < 4; k++) {
                const w = weights[v * 4 + k];
                if (!w) continue;
                const b = joints[v * 4 + k];
                const ox = restPositions[v * 3] - restBones[b * 3], oy = restPositions[v * 3 + 1] - restBones[b * 3 + 1], oz = restPositions[v * 3 + 2] - restBones[b * 3 + 2];
                const qx = Q[b * 4], qy = Q[b * 4 + 1], qz = Q[b * 4 + 2], qw = Q[b * 4 + 3];
                // v' = q v q*
                const ix = qw * ox + qy * oz - qz * oy, iy = qw * oy + qz * ox - qx * oz, iz = qw * oz + qx * oy - qy * ox, iw = -qx * ox - qy * oy - qz * oz;
                const rx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
                const ry = iy * qw + iw * -qy + iz * -qx - ix * -qz;
                const rz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
                x += w * (rx + T[b * 3]); y += w * (ry + T[b * 3 + 1]); z += w * (rz + T[b * 3 + 2]);
            }
            out[v * 3] = x; out[v * 3 + 1] = y; out[v * 3 + 2] = z;
        }
        return out;
    }

    /** Bone poses `T`/`Q` (3 and 4 per bone) at time `t` of baked tracks, as the game's mixer reads them (linear, slerp). */
    function sample(tr, t, T, Q) {
        const times = tr.times, F = times.length, d = times[F - 1];
        let tt = ((t % d) + d) % d, f = 0;
        while (f + 2 < F && times[f + 1] <= tt) f++;
        const s = Math.max(0, Math.min(1, (tt - times[f]) / (times[f + 1] - times[f])));
        for (let b = 0; b < tr.T.length; b++) {
            const A = tr.T[b], B = tr.Q[b];
            for (let k = 0; k < 3; k++) T[b * 3 + k] = A[f * 3 + k] + (A[(f + 1) * 3 + k] - A[f * 3 + k]) * s;
            let ax = B[f * 4], ay = B[f * 4 + 1], az = B[f * 4 + 2], aw = B[f * 4 + 3];
            let bx = B[f * 4 + 4], by = B[f * 4 + 5], bz = B[f * 4 + 6], bw = B[f * 4 + 7];
            let cos = ax * bx + ay * by + az * bz + aw * bw;
            if (cos < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; cos = -cos; }
            let k0 = 1 - s, k1 = s;
            if (cos < 0.9995) { const o = Math.acos(cos), so = Math.sin(o); k0 = Math.sin((1 - s) * o) / so; k1 = Math.sin(s * o) / so; }
            Q[b * 4] = ax * k0 + bx * k1; Q[b * 4 + 1] = ay * k0 + by * k1; Q[b * 4 + 2] = az * k0 + bz * k1; Q[b * 4 + 3] = aw * k0 + bw * k1;
        }
    }

    const api = { swayAt, FABRICS, create, configure, advance, bake, boneGrid, posesFor, tracks, skin, sample, windAt, makeWind };
    root.RRPropCloth = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
