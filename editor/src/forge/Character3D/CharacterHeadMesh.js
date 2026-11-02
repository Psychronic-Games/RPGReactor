/**
 * The visible human face: a mask (RR_HEAD_MESH), forehead to under the chin and in front of the ears, carried by the body's own head skin, which is hidden
 * beneath it and goes on taking every slider and expression; scalp, ears and neck stay the body's. Each vertex follows a few skin vertices plus its own offset,
 * settling exactly onto the skin at the mask's edge. The lips, brows, lashes, eyeballs and the dark of the open mouth are all fitted to this surface here.
 */
(function (root) {
    'use strict';
    const dataOf = () => root.RR_HEAD_MESH || (typeof require === 'function' ? require('./HeadMeshData.js') : null);
    const Body = () => root.RRHumanBody || require('./HumanBody.js');
    const bindingCount = () => dataOf().K || 6;
    const IRIS = [[0.708, 0.259], [0.292, 0.671]];     // each iris's middle in the eye picture (CharacterSkin.js)
    const LID_THICKNESS = 0.004;     // eyes-to-chin: how far a lid's edge stands off the ball (headmesh.py lays it there)
    /** Whether this recipe wears the head (the human species, with no head of its own). */
    const applies = r => !root.RR_NO_HEAD_MESH && (!r.species || r.species === 'human') && !(r.head && r.head.kind) && !!dataOf();
    let blended = null;
    function setOf(r) {
        const d = dataOf(), g = Math.max(0, Math.min(1, r.gender ?? 0.5));
        if (d.version !== 2) return g < 0.5 ? d.F : d.M;
        if (blended?.data === d && blended.gender === g) return blended.value;
        const mix = (a, b) => a + (b - a) * g;
        const lip = { ...d.F.lip };
        for (const key of ['corner', 'line', 'midY', 'endX']) lip[key] = mix(d.F.lip[key], d.M.lip[key]);
        for (const key of ['drop', 'up', 'low']) lip[key] = d.F.lip[key].map((v, i) => mix(v, d.M.lip[key][i]));
        const value = { ...d.common, ...d.F, lip, off: d.F.off.map((v, i) => mix(v, d.M.off[i])),
            tone: d.F.tone.map((v, i) => mix(v, d.M.tone[i])) };
        value.radii = d.F.radii.map((r, k) => r.map((v, a) => mix(v, d.M.radii[k][a])));
        value.eyeHeight = d.F.eyeHeight.map((v, k) => mix(v, d.M.eyeHeight[k]));
        for (const key of ['authoredNormals', 'restNormals']) if (d.F[key]) value[key] = d.F[key].map((v, i) => mix(v, d.M[key][i]));
        blended = { data: d, gender: g, value };
        return value;
    }
    const hidden = r => new Set(setOf(r).hide);
    const normalRest = new WeakMap();
    const boundaries = new WeakMap();
    function boundaryOf(index) {
        if (boundaries.has(index)) return boundaries.get(index);
        const edges = new Map();
        for (let i = 0; i < index.length; i += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
            const x = index[i + a], y = index[i + b], key = Math.min(x, y) + ':' + Math.max(x, y);
            edges.set(key, (edges.get(key) || 0) + 1);
        }
        const ids = [...new Set([...edges].filter(([, count]) => count === 1).flatMap(([key]) => key.split(':').map(Number)))];
        boundaries.set(index, ids);
        return ids;
    }
    function globeFront(eye, c, x, y) {
        const [rx, ry, rz] = eye.r, tilt = eye.tilt || 0, co = Math.cos(tilt), si = Math.sin(tilt), dy = y - c[1];
        const A = si * si / (ry * ry) + co * co / (rz * rz);
        const B = 2 * dy * co * si * (1 / (ry * ry) - 1 / (rz * rz));
        const C = ((x - c[0]) / rx) ** 2 + dy * dy * (co * co / (ry * ry) + si * si / (rz * rz)) - 1;
        return c[2] + (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
    }
    function posedNormals(part, positions) {
        let rest = normalRest.get(part);
        if (!rest) { rest = normalsOf(part.positions, part.index); normalRest.set(part, rest); }
        const out = normalsOf(positions, part.index);
        for (let i = 0; i < out.length; i += 3) {
            for (let k = 0; k < 3; k++) out[i + k] += part.normals[i + k] - rest[i + k];
            const length = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
            for (let k = 0; k < 3; k++) out[i + k] /= length;
        }
        return out;
    }
    /** Close the actual sculpted lids over their globe, carrying the lashes.
     * The native cage's eyelid vertices belong to a different opening. */
    function closeLids(head, part, posed, units) {
        if (!head.ocular || !(part.lidRows || part.name === 'Lashes')) return false;
        const weights = ['L', 'R'].map(side => Math.max(0, Math.min(1, units['eyeClose' + side] || 0)));
        if (!weights.some(Boolean)) return false;
        const clamp = x => Math.max(0, Math.min(1, x));
        if (part.lidRows) {
            part.lidRows.forEach((row, v) => {
                const eye = head.ocular[row.eye], weight = weights[row.eye];
                if (!weight) return;
                const shift = [0, 1, 2].map(a => head.positions[eye.anchor * 3 + a] - eye.at[a]);
                const c = eye.c.map((x, a) => x + shift[a]), r = eye.r;
                const closed = row.low + (row.up - row.low) * 0.18, edge = row.upper ? row.up : row.low;
                const x = row.x + shift[0], y = edge + (closed - edge) * row.t * weight + shift[1];
                const z = globeFront(eye, c, x, y) + 0.0012;
                for (let a = 0; a < 3; a++) posed[v * 3 + a] = [x, y, z][a];
            });
            return true;
        }
        const atX = (points, x) => {
            let a = points[0], b = points.at(-1);
            for (let i = 0; i + 1 < points.length; i++) if (x >= points[i][0] && x <= points[i + 1][0]) { a = points[i]; b = points[i + 1]; break; }
            const t = clamp((x - a[0]) / Math.max(1e-8, b[0] - a[0]));
            return a[1] + (b[1] - a[1]) * t;
        };
        for (let i = 0; i < posed.length; i += 3) {
            const k = part.positions[i] >= 0 ? 0 : 1, eye = head.ocular[k], close = weights[k];
            if (!close) continue;
            const shift = [0, 1, 2].map(a => head.positions[eye.anchor * 3 + a] - eye.at[a]);
            const c = eye.c.map((v, a) => v + shift[a]), r = eye.r;
            const x = part.positions[i] - shift[0], y = part.positions[i + 1] - shift[1], z = part.positions[i + 2];
            const dx = Math.abs((part.positions[i] - c[0]) / r[0]);
            if (dx > 1.25 || z < c[2] - r[2] * 0.4) continue;
            const up = atX(eye.upper, x), low = atX(eye.lower, x), upper = y > (up + low) / 2;
            const edge = upper ? up : low, distance = Math.abs(y - edge) / r[1];
            const fade = clamp((1.4 - distance) / 0.9), falloff = fade * fade * (3 - 2 * fade) * clamp((1.25 - dx) / 0.2), weight = close * falloff;
            if (!weight) continue;
            const closed = low + (up - low) * 0.18;
            const targetY = closed + shift[1] + (part.positions[i + 1] - shift[1] - edge) * 0.15;
            const globe = globeFront(eye, c, part.positions[i], targetY) + 0.0014;
            posed[i + 1] += (targetY - posed[i + 1]) * weight;
            posed[i + 2] += (Math.max(part.positions[i + 2], globe) - posed[i + 2]) * weight;
        }
        return true;
    }
    /** Folded lid surfaces stay behind the eyes at rest and unfold over them
     * for blinking. The face above the lids stays still. */
    function lidPart(head) {
        const K = bindingCount(), COLUMNS = 24, ROWS = 3, s = dataOf().common || setOf({});
        const pos = [], uv = [], index = [], joints = [], weights = [], vertices = [], factors = [], offsets = [0], lidRows = [];
        const point = (row, x) => {
            const sorted = row.slice().sort((a, b) => head.positions[a * 3] - head.positions[b * 3]);
            let a = sorted[0], b = sorted.at(-1);
            for (let i = 0; i + 1 < sorted.length; i++) if (x >= head.positions[sorted[i] * 3] && x <= head.positions[sorted[i + 1] * 3]) { a = sorted[i]; b = sorted[i + 1]; break; }
            const t = Math.max(0, Math.min(1, (x - head.positions[a * 3]) / Math.max(1e-8, head.positions[b * 3] - head.positions[a * 3])));
            return { id: t < 0.5 ? a : b, p: [0, 1, 2].map(k => head.positions[a * 3 + k] + (head.positions[b * 3 + k] - head.positions[a * 3 + k]) * t) };
        };
        const curveY = (points, x) => {
            for (let i = 0; i + 1 < points.length; i++) if (x >= points[i][0] && x <= points[i + 1][0]) {
                const t = (x - points[i][0]) / Math.max(1e-8, points[i + 1][0] - points[i][0]);
                return points[i][1] + (points[i + 1][1] - points[i][1]) * t;
            }
            return x < points[0][0] ? points[0][1] : points.at(-1)[1];
        };
        for (let eye = 0; eye < 2; eye++) for (const upper of [true, false]) {
            const frame = head.ocular[eye], start = pos.length / 3;
            const xs = s.rim[eye].map(v => head.positions[v * 3]), lo = Math.min(...xs), hi = Math.max(...xs);
            for (let row = 0; row <= ROWS; row++) for (let col = 0; col <= COLUMNS; col++) {
                const x = lo + (hi - lo) * col / COLUMNS, up = point(s.rim[eye], x), low = point(s.low[eye], x), root = upper ? up : low, t = row / ROWS;
                // Park the folded sheet straight behind the rim. Pulling
                // rows towards the globe centre leaves broad
                // triangular flaps exposed beside it at the tear duct.
                // closeLids unfolds the sheet onto the globe during blinking.
                pos.push(x, root.p[1], root.p[2] - t * 0.006);
                uv.push(head.uvs[root.id * 2], head.uvs[root.id * 2 + 1]);
                for (let k = 0; k < 4; k++) { joints.push(head.joints[root.id * 4 + k]); weights.push(head.weights[root.id * 4 + k]); }
                const at = head.interpolation.offsets[root.id];
                for (let k = 0; k < K; k++) { vertices.push(head.interpolation.vertices[at + k]); factors.push(head.interpolation.weights[at + k]); }
                offsets.push(vertices.length); lidRows.push({ eye, upper, t, x, up: curveY(frame.upper, x), low: curveY(frame.lower, x) });
            }
            for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLUMNS; col++) {
                const a = start + row * (COLUMNS + 1) + col, b = a + COLUMNS + 1;
                index.push(a, b, b + 1, a, b + 1, a + 1);
            }
        }
        const positions = Float32Array.from(pos), tris = Uint32Array.from(index);
        const uvs1 = new Float32Array(positions.length / 3 * 2);
        for (let i = 0; i < positions.length / 3; i++) { uvs1[i * 2] = positions[i * 3] * 40; uvs1[i * 2 + 1] = positions[i * 3 + 1] * 40; }
        const part = { name: 'Eyelids', headMesh: true, kind: 'skin', doubleSided: true, noShade: true, positions, normals: normalsOf(positions, tris), uvs: Float32Array.from(uv), uvs1, index: tris,
            normalTexture: head.normalTexture, normalTexCoord: head.normalTexCoord, normalScale: head.normalScale,
            joints: Uint8Array.from(joints), weights: Float32Array.from(weights), texture: head.texture, roughness: head.roughness, lidRows,
            interpolation: { offsets: Uint32Array.from(offsets), vertices: Int32Array.from(vertices), weights: Float32Array.from(factors) } };
        // At rest these folds are hidden behind the eyes. Author their normals
        // on the visible, unfolded surface: saved position morphs retain the
        // base normals, and the hidden folds would shade a closed lid in bars.
        const closed = Float32Array.from(positions);
        closeLids(head, part, closed, { eyeCloseL: 1, eyeCloseR: 1 });
        const visibleNormals = normalsOf(closed, tris);
        for (let i = 0; i < visibleNormals.length; i += 3) if (Math.hypot(...visibleNormals.subarray(i, i + 3)) > 0.5) part.normals.set(visibleNormals.subarray(i, i + 3), i);
        return part;
    }
    function scaleOf(pack, P) {
        const F = Body().headFields(pack);
        let eye = 0, chin = Infinity;
        for (const v of F.eyeIds) eye += P[v * 3 + 1] / F.eyeIds.length;
        for (const v of pack.body.source) if (F.w[v] > 0.3 && Math.abs(P[v * 3]) < 0.012 && P[v * 3 + 2] > 0.02 && P[v * 3 + 1] < chin) chin = P[v * 3 + 1];
        return eye - chin;
    }
    function eyeLevel(pack, P) {
        const F = Body().headFields(pack);
        let eye = 0;
        for (const v of F.eyeIds) eye += P[v * 3 + 1] / F.eyeIds.length;
        return eye;
    }
    /** Separate the upper ridge from the broad cheek beside the nose. Native
     * targets mostly resize the cage beneath this sculpt, leaving its fixed
     * anterior bulges. Both controls need their own projection field on the
     * visible skin, with lids, nose, mouth and seam outside their support. */
    const cheekReferences = new WeakMap();
    function boundPositions(s, P, scale) {
        const K = bindingCount(), n = s.off.length / 3, out = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            let x = 0, y = 0, z = 0, sum = 0;
            for (let k = 0; k < K; k++) sum += s.w[i * K + k];
            for (let k = 0; k < K; k++) {
                const v = s.bind[i * K + k] * 3, w = s.w[i * K + k] / sum;
                x += P[v] * w; y += P[v + 1] * w; z += P[v + 2] * w;
            }
            out[i * 3] = x + s.off[i * 3] * scale;
            out[i * 3 + 1] = y - s.off[i * 3 + 1] * scale;
            out[i * 3 + 2] = z + s.off[i * 3 + 2] * scale;
        }
        return out;
    }
    function cheekFields(pack, s, r) {
        const gender = Math.max(0, Math.min(1, r.gender ?? .5)), data = dataOf(), cached = cheekReferences.get(pack);
        if (cached?.data === data && cached.gender === gender) return cached.fields;
        // Reference-space weights follow these same vertices as sliders move.
        // Re-evaluating a mask on narrowed cheeks moves the correction away
        // from its own target and weakens/reverses the slider's response.
        const reference = Body().shape(pack, Body().normalizeRecipe({ gender })), scale = scaleOf(pack, reference);
        const P = boundPositions(s, reference, scale);
        const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * t * (t * (t * 6 - 15) + 10); };
        const rim = s.rim.flat(), eye = rim.reduce((sum, v) => sum + P[v * 3 + 1], 0) / rim.length;
        const ridge = new Float32Array(P.length / 3), cheek = new Float32Array(ridge.length);
        for (let v = 0; v < ridge.length; v++) {
            const x = Math.abs(P[v * 3]) / scale, y = (eye - P[v * 3 + 1]) / scale;
            ridge[v] = Math.exp(-(((x - .48) / .20) ** 2 + ((y - .25) / .15) ** 2))
                * smooth(.18, .30, x) * (1 - smooth(.70, .84, x))
                * smooth(.065, .13, y) * (1 - smooth(.48, .65, y)) * s.fade[v];
            cheek[v] = Math.exp(-(((x - .42) / .32) ** 2 + ((y - .42) / .30) ** 2))
                * smooth(.18, .30, x) * (1 - smooth(.82, .98, x))
                * smooth(.10, .22, y) * (1 - smooth(.72, .95, y)) * s.fade[v];
        }
        const fields = { ridge, cheek };
        cheekReferences.set(pack, { data, gender, fields });
        return fields;
    }
    function positions(pack, P, r) {
        const s = setOf(r), n = s.off.length / 3, E = scaleOf(pack, P), out = boundPositions(s, P, E);
        const { ridge, cheek } = cheekFields(pack, s, r), value = 1.5 * Math.tanh((r.shapes?.cheekBones || 0) / 1.5);
        const fullness = 1.5 * Math.tanh((r.shapes?.cheeks || 0) / 1.5);
        for (let i = 0; i < n; i++) {
            out[i * 3] += Math.sign(out[i * 3]) * E * (-.008 + .015 * value) * ridge[i];
            out[i * 3 + 2] += E * ((-.020 + .035 * value) * ridge[i]
                + (-.050 + .018 * value + .045 * fullness) * cheek[i]);
        }
        // The transition is bound barycentrically to native skin triangles.
        // Retraction must not pass underneath that skin while it is still
        // drawn at the join: its exposed triangle edges look like nodules.
        const K = bindingCount(), cage = boundPositions(s, P, 0);
        const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        for (let i = 0; i < n; i++) {
            const fade = s.fade[i];
            if (fade <= 0 || fade >= .9999 || !cheek[i]) continue;
            const a = s.bind[i * K] * 3, b = s.bind[i * K + 1] * 3, c = s.bind[i * K + 2] * 3;
            const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
            const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], length = Math.hypot(...normal);
            if (length < 1e-12) continue;
            for (let k = 0; k < 3; k++) normal[k] /= length;
            const clearance = normal.reduce((sum, x, k) => sum + x * (out[i * 3 + k] - cage[i * 3 + k]), 0);
            const edge = 1 - smooth(.95, .9999, fade), support = Math.min(1, cheek[i] / fade * 2);
            // A small positive separation avoids coplanar native/face
            // triangles fighting for the same pixel after the correction.
            const margin = .0003 * smooth(0, .15, fade) * edge * support, deficit = margin - clearance;
            if (deficit <= 0) continue;
            const blend = smooth(0, .0005, deficit) * edge;
            for (let k = 0; k < 3; k++) out[i * 3 + k] += normal[k] * deficit * blend;
        }
        return out;
    }
    const cheekNeighbors = new WeakMap();
    function smoothCheekNormals(normal, index, amount) {
        let neighbors = cheekNeighbors.get(index);
        if (!neighbors) {
            const sets = Array.from({ length: normal.length / 3 }, () => new Set());
            for (let t = 0; t < index.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
                sets[index[t + a]].add(index[t + b]); sets[index[t + b]].add(index[t + a]);
            }
            neighbors = sets.map(s => [...s]); cheekNeighbors.set(index, neighbors);
        }
        let current = normal.slice(), next = normal.slice();
        for (let pass = 0; pass < 6; pass++) {
            for (let v = 0; v < amount.length; v++) {
                const weight = amount[v] * .7, list = neighbors[v];
                if (!weight || !list.length) continue;
                const sum = [0, 0, 0];
                for (const u of list) for (let k = 0; k < 3; k++) sum[k] += current[u * 3 + k] / list.length;
                for (let k = 0; k < 3; k++) next[v * 3 + k] = current[v * 3 + k] * (1 - weight) + sum[k] * weight;
                const length = Math.hypot(...next.subarray(v * 3, v * 3 + 3)) || 1;
                for (let k = 0; k < 3; k++) next[v * 3 + k] /= length;
            }
            [current, next] = [next, current];
        }
        normal.set(current);
    }
    function normalsOf(p, I) {
        const n = new Float32Array(p.length);
        for (let t = 0; t < I.length; t += 3) {
            const [a, b, c] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3], e = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], f = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
            const x = e[1] * f[2] - e[2] * f[1], y = e[2] * f[0] - e[0] * f[2], z = e[0] * f[1] - e[1] * f[0];
            for (const q of [a, b, c]) { n[q] += x; n[q + 1] += y; n[q + 2] += z; }
        }
        for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
        return n;
    }
    let skinRelief;
    /** Fine, seamless pores shared by the studio and saved model. Coordinates are in metres. */
    function detailTexture() {
        if (skinRelief) return skinRelief;
        const size = 128, h = new Float32Array(size * size), data = new Uint8Array(size * size * 4);
        let seed = 917;
        const rand = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
        for (let i = 0; i < 220; i++) {
            const cx = rand() * size, cy = rand() * size, radius = 0.7 + rand() * 1.1;
            for (let y = Math.floor(cy - radius); y <= cy + radius; y++) for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
                const d = Math.hypot(x - cx, y - cy) / radius;
                if (d < 1) h[((y + size) % size) * size + (x + size) % size] -= 0.12 * (1 - d * d) ** 2;
            }
        }
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const dx = h[y * size + (x + 1) % size] - h[y * size + (x + size - 1) % size];
            const dy = h[((y + 1) % size) * size + x] - h[((y + size - 1) % size) * size + x];
            const length = Math.hypot(dx, dy, 1), at = (y * size + x) * 4;
            data[at] = Math.round(127.5 - dx / length * 127.5); data[at + 1] = Math.round(127.5 - dy / length * 127.5);
            data[at + 2] = Math.round(127.5 + 127.5 / length); data[at + 3] = 255;
        }
        return skinRelief = { name: 'face-detail.png', width: size, height: size, data, repeat: true };
    }
    function part(pack, built, r, body) {
        const K = bindingCount(), s = setOf(r), n = s.off.length / 3, index = Uint32Array.from(s.index), pos = positions(pack, built.shaped, r);
        const extra = [], uvs = new Float32Array(n * 2), joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4), offsets = new Uint32Array(n + 1), vertices = new Int32Array(n * K), factors = new Float32Array(n * K);
        for (let i = 0; i < n; i++) {
            offsets[i + 1] = (i + 1) * K;
            uvs[i * 2] = s.uv[i * 2]; uvs[i * 2 + 1] = s.uv[i * 2 + 1];
            const joint = new Map();
            let total = 0;
            for (let k = 0; k < K; k++) total += s.w[i * K + k];
            for (let k = 0; k < K; k++) {
                const v = s.bind[i * K + k], f = s.w[i * K + k] / total;
                vertices[i * K + k] = v; factors[i * K + k] = f;
                for (let q = 0; q < 4; q++) { const bone = pack.skinJoints[v * 4 + q], wt = pack.skinWeights[v * 4 + q] * f; if (wt) joint.set(bone, (joint.get(bone) || 0) + wt); }
            }
            const top = [...joint].sort((a, b) => b[1] - a[1]).slice(0, 4), all = top.reduce((a, b) => a + b[1], 0) || 1;
            top.forEach(([bone, wt], q) => { joints[i * 4 + q] = bone; weights[i * 4 + q] = wt / all; });
        }
        // Where a face crosses a seam of the skin picture, all of it takes one side's place: stretched across the seam it drew a hard line.
        for (let t = 0; t < index.length; t += 3) {
            const [a, b, c] = [index[t], index[t + 1], index[t + 2]], far = (p, q) => Math.hypot(uvs[p * 2] - uvs[q * 2], uvs[p * 2 + 1] - uvs[q * 2 + 1]) > 0.16;
            if (!far(a, b) && !far(a, c)) continue;
            extra.push([t + 1, a], [t + 2, a]);
        }
        const count = n + extra.length, grow = (A, size) => { const o = new A.constructor(count * size); o.set(A); return o; };
        const P2 = grow(pos, 3), U2 = grow(uvs, 2), J2 = grow(joints, 4), W2 = grow(weights, 4), O2 = new Uint32Array(count + 1), V2 = new Int32Array(count * K), F2 = new Float32Array(count * K), map = new Int32Array(count);
        for (let i = 0; i < n; i++) map[i] = i;
        O2.set(offsets); V2.set(vertices); F2.set(factors);
        extra.forEach(([slot, keep], e) => {
            const i = n + e, was = index[slot];
            map[i] = was; index[slot] = i; O2[i + 1] = (i + 1) * K;
            for (let k = 0; k < 3; k++) P2[i * 3 + k] = pos[was * 3 + k];
            for (let k = 0; k < 2; k++) U2[i * 2 + k] = uvs[keep * 2 + k];
            for (let k = 0; k < 4; k++) { J2[i * 4 + k] = joints[was * 4 + k]; W2[i * 4 + k] = weights[was * 4 + k]; }
            for (let k = 0; k < K; k++) { V2[i * K + k] = vertices[was * K + k]; F2[i * K + k] = factors[was * K + k]; }
        });
        // Normals across seams of the picture as one surface, and toward the mask's edge those of the skin it settles onto, so no line shows where it ends.
        const baseN = normalsOf(pos, index.map(i => map[i])), skinN = new Float32Array(pack.vertexCount * 3), N2 = new Float32Array(count * 3), edge = new Float32Array(count);
        // Inherit the body's actual shaded normals. Its cheek transition is
        // smoothed too; raw cage normals reintroduced a visible angular ridge.
        pack.body.source.forEach((v, i) => skinN.set(body.normals.subarray(i * 3, i * 3 + 3), v * 3));
        const cheek = cheekFields(pack, s, r);
        if (s.authoredNormals) for (let v = 0; v < n; v++) {
            const own = 1 - Math.max(cheek.ridge[v], cheek.cheek[v]);
            for (let a = 0; a < 3; a++) baseN[v * 3 + a] += (s.authoredNormals[v * 3 + a] - s.restNormals[v * 3 + a]) * own;
            const length = Math.hypot(...baseN.subarray(v * 3, v * 3 + 3)) || 1;
            for (let a = 0; a < 3; a++) baseN[v * 3 + a] /= length;
        }
        // The broad corrected skin spans relatively few source triangles.
        // Average its normals so satin highlights do not expose their edges.
        smoothCheekNormals(baseN, s.index, cheek.cheek);
        for (let i = 0; i < count; i++) {
            // Geometry, normals and baked shade share the whole join. The
            // former clamped 2.2x fade finished shading halfway across it,
            // leaving a visible patch on the temple and upper forehead.
            const v = map[i], u = s.fade[v], t = u * u * u * (u * (u * 6 - 15) + 10), m = [0, 0, 0];
            edge[i] = t;
            for (let k = 0; k < K; k++) { const q = s.bind[v * K + k] * 3; for (let a = 0; a < 3; a++) m[a] += skinN[q + a] * s.w[v * K + k]; }
            const x = baseN[v * 3] * t + m[0] * (1 - t), y = baseN[v * 3 + 1] * t + m[1] * (1 - t), z = baseN[v * 3 + 2] * t + m[2] * (1 - t), l = Math.hypot(x, y, z) || 1;
            N2[i * 3] = x / l; N2[i * 3 + 1] = y / l; N2[i * 3 + 2] = z / l;
        }
        const lidWall = new Uint8Array(count);
        for (let i = 0; i < count; i++) lidWall[i] = map[i] >= s.lidFrom ? 1 : 0;
        const tone = new Float32Array(count);
        // Legacy heads have a depth tint; the shared sculpt instead supplies
        // bounded local visibility in tone, using the same skin material.
        const deep = new Map(s.nostril);
        for (let i = 0; i < count; i++) { const d = deep.get(map[i]) || 0; tone[i] = s.tone[map[i]] * (1 - 0.86 * d * d * (3 - 2 * d)); }
        const uvs1 = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) { uvs1[i * 2] = P2[i * 3] * 40; uvs1[i * 2 + 1] = P2[i * 3 + 1] * 40; }
        const normal = body.normalTexture ? { normalTexture: body.normalTexture, normalTexCoord: body.normalTexCoord || 0, normalScale: (body.normalScale ?? 1) * 0.25 }
            : { normalTexture: 'face-detail.png', normalTexCoord: 1, normalScale: 0.12 };
        return { name: 'Head skin', headMesh: true, kind: 'skin', doubleSided: true, positions: P2, normals: N2, edge, lidWall, tone, uvs: U2, uvs1, index, joints: J2, weights: W2, seamMap: map, texture: body.texture, ...normal, roughness: body.roughness,
            ...(body.emissive ? { emissive: body.emissive, emissiveTexture: body.emissiveTexture, emissiveIntensity: body.emissiveIntensity } : {}),
            interpolation: { offsets: O2, vertices: V2, weights: F2 } };
    }
    /** The lips' outline on this head: as its surface was measured, anchored to the skin so it stays with the mouth under every slider. */
    function lipFit(pack, P, r, head) {
        const data = setOf(r), s = data.lip, E = scaleOf(pack, P), Q = head.positions, corner = s.corner / s.endX * Math.abs(Q[s.ends[0] * 3] - Q[s.ends[1] * 3]) / 2;
        let center = Q[s.mid * 3 + 1] + (s.midY - s.line) * E;
        // The visible opening, rather than a lip-roll anchor, defines the bite.
        // Ancestry can move that roll differently and expose teeth at rest.
        const rim = boundaryOf(data.index).filter(v => Math.abs(Q[v * 3]) < corner * 0.25 && Math.abs(Q[v * 3 + 1] - center) < E * 0.1);
        if (rim.length > 1) {
            const ys = rim.map(v => Q[v * 3 + 1]);
            center = (Math.min(...ys) + Math.max(...ys)) / 2;
        }
        const H = Math.max(...s.up, ...s.low) * E, bins = a => a.map(v => +(v * E / H).toFixed(3));
        const front = rim.length ? Math.max(...rim.map(v => Q[v * 3 + 2])) : Q[s.mid * 3 + 2];
        return { gender: r.gender ?? 0.5, center, corner, front, H, upper: Math.max(...s.up) * E / H, lower: Math.max(...s.low) * E / H, bend: 0, measured: true, up: bins(s.up), low: bins(s.low), drop: s.drop.map(v => v * E), span: [corner * 2.4, H * 3] };
    }
    /** The lips as a patch of the head's own surface, a hair forward of it. */
    function lipPart(head, fit) {
        const P = head.positions, I = head.index, at = new Map(), ids = [], index = [];
        // The mouth's line is no straight one: heights in the picture count from it.
        const lineAt = x => { const q = Math.min(0.9999, Math.abs(x) / fit.corner) * (fit.drop.length - 1), i = Math.floor(q); return fit.center - (fit.drop[i] + (fit.drop[i + 1] - fit.drop[i]) * (q - i)); };
        const inside = v => head.tone[v] > 0.9 && Math.abs(P[v * 3] / fit.corner) < 1.18 && Math.abs(P[v * 3 + 1] - lineAt(P[v * 3])) < fit.H * 1.45;
        for (let t = 0; t < I.length; t += 3) {
            const tri = [I[t], I[t + 1], I[t + 2]];
            if (!tri.every(inside)) continue;
            for (const v of tri) { if (!at.has(v)) { at.set(v, ids.length); ids.push(v); } index.push(at.get(v)); }
        }
        const { positions, normals, uvs, joints, weights, interpolation, index: tris } = sheet(head, ids, index, 0, 0.0004, v => [0.5 + P[v * 3] / fit.corner / 2.4, 0.5 - (P[v * 3 + 1] - lineAt(P[v * 3])) / (3 * fit.H)]);
        const colors = new Float32Array(ids.length * 3);
        ids.forEach((v, i) => { for (let a = 0; a < 3; a++) colors[i * 3 + a] = head.tone[v]; });
        return { name: 'Lips', headMesh: true, doubleSided: true, positions, normals, colors, keepColors: true, uvs, index: tris, joints, weights, texture: 'lips.png', opacity: 0.999, roughness: 0.4, kind: 'skin', decal: true, noShade: true, interpolation };
    }
    /** Vertices of the head as a sheet of their own, following it: a hair forward of it, each its own place in a picture. */
    function sheet(head, ids, index, lift, forward, place) {
        const K = bindingCount(), P = head.positions, n = ids.length, b = head.interpolation, positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), uvs = new Float32Array(n * 2), joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4), offsets = new Uint32Array(n + 1), vertices = new Int32Array(n * K), factors = new Float32Array(n * K);
        ids.forEach((v, i) => {
            for (let k = 0; k < 3; k++) { positions[i * 3 + k] = P[v * 3 + k] + head.normals[v * 3 + k] * lift + (k === 2 ? forward : 0); normals[i * 3 + k] = head.normals[v * 3 + k]; }
            uvs.set(place(v), i * 2);
            for (let k = 0; k < 4; k++) { joints[i * 4 + k] = head.joints[v * 4 + k]; weights[i * 4 + k] = head.weights[v * 4 + k]; }
            offsets[i + 1] = (i + 1) * K;
            for (let k = 0; k < K; k++) { vertices[i * K + k] = b.vertices[v * K + k]; factors[i * K + k] = b.weights[v * K + k]; }
        });
        return { positions, normals, uvs, joints, weights, index: Uint32Array.from(index), interpolation: { offsets, vertices, weights: factors } };
    }
    /** The brows as a sheet of this head, in the brow picture's box (in eye radii) round each of its own lid openings. */
    function browPart(head, brows, r, BOX) {
        const P = head.positions, I = head.index, ids = [], index = [], at = new Map(), uv = new Map(), g = Math.max(0, Math.min(1, r.gender ?? 0.5));
        for (const [eyeIndex, [outer, inner]] of setOf(r).opening.entries()) {
            const er = Math.abs(P[outer * 3] - P[inner * 3]) / 2 / 1.05, cx = (P[outer * 3] + P[inner * 3]) / 2, cy = (P[outer * 3 + 1] + P[inner * 3 + 1]) / 2, side = Math.sign(cx) || 1, x0 = cx - side * er * BOX[0], y0 = cy + er * BOX[2];
            // Low over the eye and full, as on the finished references, rising a little outward.
            const lift = er * (-0.08 + 0.14 * g + (r.hair?.brows?.height || 0)), rise = er * (0.2 - 0.12 * g), fat = 0.85 + 0.15 * g, place = v => { const u = side * (P[v * 3] - x0) / (er * BOX[1]), w = 1 - (P[v * 3 + 1] - y0 - lift - rise * (u - 0.3)) / (er * BOX[3]); return [u, 0.62 + (w - 0.62) / fat]; };
            // A front-plane box also catches the temple behind the eye.
            // Those triangles projected the brow texture as horizontal bars
            // across the side of the skull.
            const back = (head.ocular?.[eyeIndex]?.c[2] ?? Math.min(P[outer * 3 + 2], P[inner * 3 + 2])) - 0.010;
            const fits = v => { if (P[v * 3] * side <= 0 || head.normals[v * 3 + 2] < 0.1 || P[v * 3 + 2] < back) return false; const q = place(v); return q[0] > -0.08 && q[0] < 1.08 && q[1] > -0.08 && q[1] < 1.08; };
            for (let t = 0; t < I.length; t += 3) {
                const tri = [I[t], I[t + 1], I[t + 2]];
                if (!tri.every(fits)) continue;
                for (const v of tri) { if (!at.has(v)) { at.set(v, ids.length); ids.push(v); uv.set(v, place(v).map(q => Math.max(0, Math.min(1, q)))); } index.push(at.get(v)); }
            }
        }
        const made = sheet(head, ids, index, 0.0003, 0, v => uv.get(v)), { source, ...rest } = brows;
        return { ...rest, ...made, colors: new Float32Array(ids.length * 3).fill(1), headMesh: true };
    }
    /**
     * This head's eyeballs: one clean sphere each, the iris lying on it. The eye mesh is a shell over an inner ball with its iris dished in; at the size these
     * eyes must be to fill the lids, the ball's rim cuts across that dish whenever the eye is seen from the side. Vertices are kept, so sliders still find them.
     */
    function sphereEyes(eyes, head, r, pack, shaped) {
        const P = Float32Array.from(eyes.positions), N = Float32Array.from(eyes.normals), U = eyes.uvs, n = P.length / 3, Q = head.positions, s = setOf(r);
        head.ocular = [];
        // The lids shade the ball, heaviest under the upper one and toward the corners: a bright white ball with no shadow on it is what reads as a doll's eye.
        const shade = new Float32Array(n * 3), glow = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        [1, -1].forEach((side, k) => {
            // The ball from the lids themselves, as they stand on this body: each lid's thickness runs from its edge straight at the ball's middle (a third of the way), so
            // the middle reads straight back off them, and the ball can never disagree with the lids under any slider, age or blend.
            const c = [0, 0, 0], rims = s.rim[k].concat(s.low[k]), walls = s.rimIn[k].concat(s.lowIn[k]);
            rims.forEach((v, i) => { for (let a = 0; a < 3; a++) c[a] += (Q[v * 3 + a] + (Q[walls[i] * 3 + a] - Q[v * 3 + a]) / 0.35) / rims.length; });
            let radius = 0;
            for (const v of rims) radius += Math.hypot(Q[v * 3] - c[0], Q[v * 3 + 1] - c[1], Q[v * 3 + 2] - c[2]) / rims.length;
            radius -= LID_THICKNESS * scaleOf(pack, shaped);
            const E = scaleOf(pack, shaped), width = Math.abs(Q[s.opening[k][0] * 3] - Q[s.opening[k][1] * 3]);
            const ys0 = rims.map(v => Q[v * 3 + 1]), height = Math.max(...ys0) - Math.min(...ys0);
            const radii = s.radii ? s.radii[k].map((v, a) => v * E * (a === 0 ? width / (s.opening[k][2] * E) : a === 1 ? height / (s.eyeHeight[k] * E) : 1)) : null;
            const points = ids => {
                const rows = ids.map(v => Array.from(Q.subarray(v * 3, v * 3 + 3))).sort((a, b) => a[0] - b[0]);
                for (let pass = 0; pass < 6; pass++) {
                    const before = rows.map(p => p.slice());
                    for (let i = 1; i + 1 < rows.length; i++) for (let a = 1; a < 3; a++) rows[i][a] = (before[i - 1][a] + 2 * before[i][a] + before[i + 1][a]) / 4;
                }
                return rows;
            };
            const anchor = s.rim[k][0];
            head.ocular.push({ c: c.slice(), r: radii || [radius, radius, radius], upper: points(s.rim[k]), lower: points(s.low[k]), anchor, at: Array.from(Q.subarray(anchor * 3, anchor * 3 + 3)) });
            // And never larger than the skin round it leaves room for: sliders can draw a lid in closer than its edge stands.
            const floor = radius * 0.95;
            for (let v = 0; !radii && v < s.lidFrom; v++) {
                if (Q[v * 3 + 2] <= c[2] || Math.abs(Q[v * 3] - c[0]) > radius * 0.5 || Math.abs(Q[v * 3 + 1] - c[1]) > radius * 0.8) continue;    // (the lids' middle: the corners fold in on their own)
                const d = Math.hypot(Q[v * 3] - c[0], Q[v * 3 + 1] - c[1], Q[v * 3 + 2] - c[2]);
                if (d < radius + 0.0003 && d > floor) radius = d - 0.0003;
            }
            const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity], own = [];
            for (let i = 0; i < n; i++) if (P[i * 3] * side > 0) { own.push(i); for (let a = 0; a < 3; a++) { low[a] = Math.min(low[a], P[i * 3 + a]); high[a] = Math.max(high[a], P[i * 3 + a]); } }
            const r0 = (high[0] - low[0]) / 2, c0 = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, high[2] - r0];
            for (const i of own) {
                const d = [P[i * 3] - c0[0], P[i * 3 + 1] - c0[1], P[i * 3 + 2] - c0[2]], l = Math.hypot(...d) || 1;
                const normal = d.map((v, a) => v / l / (radii ? radii[a] : radius)), normalLength = Math.hypot(...normal);
                for (let a = 0; a < 3; a++) { N[i * 3 + a] = normal[a] / normalLength; P[i * 3 + a] = c[a] + d[a] / l * (radii ? radii[a] : radius); }
                const dim = (1 - 0.5 * glow(0.08, 0.5, d[1] / l)) * (1 - 0.32 * glow(0.42, 0.9, Math.abs(d[0]) / l));
                for (let a = 0; a < 3; a++) shade[i * 3 + a] = (eyes.colors ? eyes.colors[i * 3 + a] : 1) * dim * [0.93, 0.92, 0.94][a];
            }
            // Then turned in its socket, as an eye is, until it looks straight out of the middle of its opening: a shade above it, the upper lid lapping the iris and the lower just meeting it.
            let middle = own[0], best = Infinity;
            for (const i of own) for (const [u, v] of IRIS) { const e = Math.hypot(U[i * 2] - u, U[i * 2 + 1] - v); if (e < best) { best = e; middle = i; } }
            const ys = s.rim[k].map(v => Q[v * 3 + 1]), yl = s.low[k].map(v => Q[v * 3 + 1]), goal = (Math.max(...ys) + Math.min(...yl)) / 2 + radius * 0.03;
            const tilt = Math.asin(Math.max(-0.5, Math.min(0.5, (P[middle * 3 + 1] - goal) / radius))), co = Math.cos(tilt), si = Math.sin(tilt);
            head.ocular[k].tilt = tilt;
            for (const i of own) for (const A of [P, N]) {
                const at = A === P ? [c[1], c[2]] : [0, 0], y = A[i * 3 + 1] - at[0], z = A[i * 3 + 2] - at[1];
                A[i * 3 + 1] = at[0] + y * co - z * si; A[i * 3 + 2] = at[1] + y * si + z * co;
            }
        });
        // The ball, not the shell: of each joined piece, the one spanning the picture's eye (the shell and its bits take only a corner of it). By that, not by where in the picture: each eye has its own place there.
        const I = eyes.index, root_ = Int32Array.from({ length: n }, (_, i) => i), find = v => { while (root_[v] !== v) { root_[v] = root_[root_[v]]; v = root_[v]; } return v; };
        for (let t = 0; t < I.length; t += 3) { root_[find(I[t + 1])] = find(I[t]); root_[find(I[t + 2])] = find(I[t]); }
        const span = new Map();
        for (let i = 0; i < n; i++) { const q = find(i), b = span.get(q) || [Infinity, -Infinity]; b[0] = Math.min(b[0], U[i * 2]); b[1] = Math.max(b[1], U[i * 2]); span.set(q, b); }
        const keep = [];
        for (let t = 0; t < I.length; t += 3) { const b = span.get(find(I[t])); if (b[1] - b[0] > 0.2) keep.push(I[t], I[t + 1], I[t + 2]); }
        eyes.colors = shade; eyes.keepColors = true; eyes.positions = P; eyes.normals = N; eyes.index = Uint32Array.from(keep); eyes.softGloss = true;
    }
    /** The dark behind an open mouth: a shallow bowl just inside the lips, round the teeth and tongue, so nothing shows through the head. */
    function mouthPart(head, fit, r, pack) {
        const K = bindingCount(), s = setOf(r).lip, P = head.positions, mid = s.mid, rim = Math.min(P[s.ends[0] * 3 + 2], P[s.ends[1] * 3 + 2]) - 0.02, a = fit.corner * 1.12, b = fit.H * 1.9, RINGS = 6, SIDES = 18, depth = fit.corner * 2.4;
        const pts = [[0, 0]], index = [];
        for (let ring = 1; ring <= RINGS; ring++) for (let k = 0; k < SIDES; k++) { const t = k / SIDES * Math.PI * 2, q = ring / RINGS; pts.push([Math.cos(t) * q, Math.sin(t) * q]); }
        for (let k = 0; k < SIDES; k++) index.push(0, 1 + k, 1 + (k + 1) % SIDES);
        for (let ring = 0; ring + 1 < RINGS; ring++) for (let k = 0; k < SIDES; k++) {
            const p = 1 + ring * SIDES + k, q = 1 + ring * SIDES + (k + 1) % SIDES, u = p + SIDES, v = q + SIDES;
            index.push(p, u, v, p, v, q);
        }
        // Independent inner lip folds meet behind the slit at rest. Each
        // follows its own lip driver, so speech separates them instead of
        // stretching a single cap across the mouth.
        const candidates = boundaryOf(setOf(r).index).filter(v => Math.abs(P[v * 3]) < fit.corner * 1.3 && Math.abs(P[v * 3 + 1] - fit.center) < fit.H * 2);
        const upper = pack && Body().maskOf(pack, ['shape/upperLip-incr'], 2), lower = pack && Body().maskOf(pack, ['shape/lowerLip-incr'], 2), bind = head.interpolation;
        const sideOf = v => {
            let side = 0;
            if (upper) for (let j = bind.offsets[v]; j < bind.offsets[v + 1]; j++) side += bind.weights[j] * (upper[bind.vertices[j]] - lower[bind.vertices[j]]);
            return side ? side > 0 : P[v * 3 + 1] >= fit.center;
        };
        const edges = [candidates.filter(sideOf), candidates.filter(v => !sideOf(v))], seal = [], steps = 24, from = pts.length;
        if (edges.every(row => row.length)) {
            const rootAt = (row, x) => row.slice().sort((a, b) => Math.abs(P[a * 3] - x) - Math.abs(P[b * 3] - x)).slice(0, 4).sort((a, b) => P[b * 3 + 2] - P[a * 3 + 2])[0];
            const roots = edges.map(row => {
                const chosen = [...new Set(Array.from({ length: steps + 1 }, (_, col) => rootAt(row, (col / steps * 2 - 1) * fit.corner * 0.98)))].sort((a, b) => P[a * 3] - P[b * 3]);
                const kept = [];
                for (const id of chosen) {
                    if (kept.length && P[id * 3] - P[kept.at(-1) * 3] < 0.00015) { if (P[id * 3 + 2] > P[kept.at(-1) * 3 + 2]) kept[kept.length - 1] = id; }
                    else kept.push(id);
                }
                return kept;
            });
            roots.forEach((row, side) => {
                const start = from + seal.length;
                for (const id of row) {
                    const x = P[id * 3], other = rootAt(roots[1 - side], x), line = (P[id * 3 + 1] + P[other * 3 + 1]) / 2;
                    const back = Math.min(P[id * 3 + 2], P[other * 3 + 2]) - Math.max(0.004, fit.H * 0.9);
                    // Root exactly on the measured rim: moving it to an ideal
                    // sampling column let the dark fold pierce a mouth corner.
                    seal.push({ id, p: [x, P[id * 3 + 1], P[id * 3 + 2] - 0.0004] });
                    seal.push({ id, p: [x, line + (side ? 1 : -1) * fit.H * 0.35, back] });
                }
                for (let col = 0; col + 1 < row.length; col++) {
                    const a = start + col * 2, b = a + 1, c = b + 2, d = a + 2;
                    index.push(a, b, c, a, c, d);
                }
            });
        }
        const n = pts.length + seal.length, positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4), colors = new Float32Array(n * 3);
        const midB = head.interpolation, offsets = new Uint32Array(n + 1), vertices = new Int32Array(n * K), factors = new Float32Array(n * K);
        pts.forEach(([u, v], i) => {
            positions[i * 3] = a * u; positions[i * 3 + 1] = fit.center + b * v; positions[i * 3 + 2] = rim - depth * (1 - u * u - v * v);
            normals[i * 3 + 2] = 1;
            colors[i * 3] = 0.05; colors[i * 3 + 1] = 0.018; colors[i * 3 + 2] = 0.02;
            for (let k = 0; k < 4; k++) { joints[i * 4 + k] = head.joints[mid * 4 + k]; weights[i * 4 + k] = head.weights[mid * 4 + k]; }
            offsets[i + 1] = (i + 1) * K;
            for (let k = 0; k < K; k++) { vertices[i * K + k] = midB.vertices[mid * K + k]; factors[i * K + k] = midB.weights[mid * K + k]; }
        });
        seal.forEach(({ id, p }, at) => {
            const i = from + at;
            positions.set(p, i * 3); normals[i * 3 + 2] = 1; colors.set([0.05, 0.018, 0.02], i * 3);
            joints.set(head.joints.subarray(id * 4, id * 4 + 4), i * 4); weights.set(head.weights.subarray(id * 4, id * 4 + 4), i * 4);
            offsets[i + 1] = (i + 1) * K;
            for (let k = 0; k < K; k++) { vertices[i * K + k] = bind.vertices[id * K + k]; factors[i * K + k] = bind.weights[id * K + k]; }
        });
        return { name: 'Mouth inside', headMesh: true, doubleSided: true, positions, normals, index: Uint32Array.from(index), colors, keepColors: true, joints, weights, roughness: 0.9, noShade: true, interpolation: { offsets, vertices, weights: factors } };
    }
    /** Each lid's edge on this head, outer corner to inner, in even steps, with the way out of the eyeball at each point: where the lashes root. */
    function lashRim(head, r) {
        const P = head.positions, s = setOf(r), edge = (ids, inner) => {
            const pts = ids.map(v => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]), out = ids.map((v, i) => { const q = [0, 1, 2].map(a => P[v * 3 + a] - P[inner[i] * 3 + a]), l = Math.hypot(...q) || 1; return q.map(c => c / l); }), along = [0];
            for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
            const len = along.at(-1), STEPS = 16, line = [];
            for (let j = 0, i = 0; j <= STEPS; j++) {
                const at = len * j / STEPS;
                while (i + 2 < pts.length && along[i + 1] < at) i++;
                const f = (at - along[i]) / Math.max(1e-6, along[i + 1] - along[i]), p = [0, 1, 2].map(a => pts[i][a] + (pts[i + 1][a] - pts[i][a]) * f);
                p.out = [0, 1, 2].map(a => out[i][a] + (out[i + 1][a] - out[i][a]) * f);
                line.push(p);
            }
            return line;
        };
        const lines = { low: {} };
        s.rim.forEach((ids, k) => { lines[k ? -1 : 1] = edge(ids, s.rimIn[k]); lines.low[k ? -1 : 1] = edge(s.low[k], s.lowIn[k]); });
        return lines;
    }
    const api = { applies, hidden, part, positions, normalsOf, posedNormals, closeLids, lidPart, detailTexture, lipFit, lipPart, browPart, mouthPart, sphereEyes, lashRim };
    root.RRHeadMesh = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
