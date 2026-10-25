/**
 * ModelAutoRig - first positions for the humanoid rig's markers, read off the
 * model itself. Pure math, no three.js: the editor hands in the model's
 * triangles and the joints of its own skeleton (both in model space, the frame
 * the markers live in) and gets markers back, with which ones were found and
 * which were guessed.
 *
 * Two readings, the surer first:
 *  - a skeleton of the model's own (Mixamo, VRM, VRoid, Unreal, Rigify, Daz,
 *    Biped, ...): each marker sits on the bone of its name; a fingertip on the
 *    finger's last joint, or one segment past it;
 *  - the shape: the model is voxelized and filled, and distances are measured
 *    through it from the middle of the torso. The far ends of that distance
 *    (the persistent maxima) are the head, the hands and the feet; each limb is
 *    the region that ends there, traced as a line of cross-section centers. A
 *    hand is read again at a finer grid, measured from the forearm: the wrist
 *    is its narrowest cross-section, each fingertip a far end, each finger's
 *    base where it joins the palm, and the thumb the finger that joins nearest
 *    the wrist.
 * Whatever neither finds keeps the proportional guess (ModelRigger's).
 */
(function(root) {
    'use strict';

    const Rigger = root.ModelRigger || (typeof require === 'function' ? require('./ModelRigger.js') : null);
    const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    const fingerKey = (finger, end, side) => finger + (end === 'base' ? 'Base' : 'Tip') + side;

    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const length = a => Math.hypot(a[0], a[1], a[2]);
    const unit = a => { const l = length(a); return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0]; };
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const mean = list => list.length ? scale(list.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / list.length) : null;

    // ------------------------------------------------------------------
    // Bone names

    const NOISE_PREFIX = new Set(['def', 'org', 'mch', 'drv', 'j', 'bip', 'bip01', 'mixamorig', 'cc', 'rig', 'armature', 'skeleton']);
    const SEGMENT_WORDS = { metacarpal: 0, proximal: 1, intermediate: 2, medial: 2, distal: 3 };
    const END_WORDS = new Set(['end', 'tip', 'nub', 'top']);
    const FINGER_WORDS = { thumb: 'thumb', index: 'index', pointer: 'index', middle: 'middle', mid: 'middle', ring: 'ring', pinky: 'pinky', pinkie: 'pinky', little: 'pinky', small: 'pinky' };
    const BIPED_FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    const BODY_WORDS = {
        hips: ['hips', 'pelvis', 'hip'],
        headTop: ['headtop', 'headtopend', 'headend', 'headnub', 'headtip'],
        head: ['head'],
        upperArm: ['arm', 'upperarm', 'uparm', 'shldrbend', 'shoulderbend', 'humerus'],
        lowerArm: ['forearm', 'lowerarm', 'forearmbend', 'loarm', 'elbow'],
        hand: ['hand', 'wrist'],
        upperLeg: ['upleg', 'upperleg', 'thigh', 'thighbend'],
        lowerLeg: ['leg', 'lowerleg', 'calf', 'shin', 'knee', 'loleg'],
        foot: ['foot', 'ankle'],
        toe: ['toe', 'toebase', 'toes', 'ball']
    };
    const BODY_LOOKUP = {};
    for (const part of Object.keys(BODY_WORDS)) for (const word of BODY_WORDS[part]) BODY_LOOKUP[word] = part;

    /** A bone name in lower-case words, namespace and exporter prefixes dropped: "mixamorig:LeftHandIndex1" reads left hand index 1. */
    function nameTokens(name) {
        let text = String(name || '').replace(/^.*[:|]/, '').replace(/^mixamorig\d*_?/i, '');
        text = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
            .replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2');
        const tokens = [];
        for (const raw of text.split(/[\s_.\-]+/)) {
            const token = raw.toLowerCase();
            if (!token) continue;
            // All-lower-case names run their words together: "leftarm".
            const glued = /^(left|right)(.+)$/.exec(token);
            if (glued) tokens.push(glued[1], glued[2]); else tokens.push(token);
        }
        while (tokens.length > 1 && (NOISE_PREFIX.has(tokens[0]) || (/^\d+$/.test(tokens[0]) && tokens.length > 2))) {
            tokens.shift();
            if (tokens[0] === 'base' && tokens.length > 1) tokens.shift();  // CC_Base_
        }
        return tokens;
    }

    /**
     * What a bone is: { side: 'L'|'R'|'', part } with part a BODY_WORDS key, or
     * { finger, segment, end } for a finger joint; null when its name says nothing.
     */
    function parseBoneName(name) {
        const tokens = nameTokens(name);
        let side = '';
        const words = [];
        for (const token of tokens) {
            if (token === 'left' || token === 'l') side = 'L';
            else if (token === 'right' || token === 'r') side = 'R';
            else if (token === 'c' || token === 'center' || token === 'centre') continue;
            else words.push(token);
        }
        // A finger: its word, then a number or a segment word.
        for (let i = 0; i < words.length; i++) {
            let finger = FINGER_WORDS[words[i]], segment = null;
            if (!finger && words[i] === 'finger' && /^\d+$/.test(words[i + 1] || '')) {
                // 3ds Max Biped: Finger0 is the thumb, Finger01 its second joint.
                const digits = words[i + 1];
                finger = BIPED_FINGERS[Number(digits[0])];
                segment = digits.length > 1 ? Number(digits.slice(1)) : 0;
                if (finger) {
                    const end = words.slice(i + 2).some(word => END_WORDS.has(word));
                    return { side, finger, segment: end ? 9 : segment, end };
                }
            }
            if (!finger) continue;
            if (finger === 'middle' && words[i] === 'mid' && words[i + 1] && !/^\d+$/.test(words[i + 1]) && !SEGMENT_WORDS.hasOwnProperty(words[i + 1])) continue;
            const rest = words.slice(i + 1);
            const end = rest.some(word => END_WORDS.has(word));
            for (const word of rest) {
                if (/^\d+$/.test(word)) { segment = Number(word); break; }
                if (SEGMENT_WORDS.hasOwnProperty(word)) { segment = SEGMENT_WORDS[word]; break; }
            }
            return { side, finger, segment: end ? 9 : segment, end, metacarpal: rest.indexOf('metacarpal') >= 0 };
        }
        const plain = words.filter(word => !/^\d+$/.test(word));
        const joined = plain.join('');
        if (BODY_LOOKUP[joined]) return { side, part: BODY_LOOKUP[joined] };
        // "HeadTop_End", "head_end": a head word with an end word.
        if (plain[0] === 'head' && plain.slice(1).some(word => END_WORDS.has(word))) return { side, part: 'headTop' };
        return null;
    }

    /**
     * Markers from the model's own skeleton. `joints`: [{ name, parent (index or -1), position: [x,y,z] }].
     * Returns { markers, found: [keys], humanoid, front } where front is +1/-1 (toes toward +z or -z) or 0.
     */
    function markersFromSkeleton(joints) {
        const out = { markers: {}, found: [], humanoid: false, front: 0 };
        if (!Array.isArray(joints) || !joints.length) return out;
        const depth = joints.map(() => -1);
        const depthOf = i => {
            if (depth[i] >= 0) return depth[i];
            let d = 0;
            for (let at = joints[i].parent, guard = 0; at >= 0 && at < joints.length && guard < 512; at = joints[at].parent, guard++) d++;
            return (depth[i] = d);
        };
        const body = {}, fingers = {};
        joints.forEach((joint, i) => {
            if (!joint || !Array.isArray(joint.position) || !joint.position.every(Number.isFinite)) return;
            const read = parseBoneName(joint.name);
            if (!read) return;
            if (read.finger) {
                if (!read.side) return;
                const key = read.side + read.finger;
                (fingers[key] || (fingers[key] = [])).push({ i, read, depth: depthOf(i) });
                return;
            }
            const key = read.part + (read.part === 'hips' || read.part === 'head' || read.part === 'headTop' ? '' : read.side);
            if (read.part !== 'hips' && read.part !== 'head' && read.part !== 'headTop' && !read.side) return;
            const best = body[key];
            if (!best || depthOf(i) < best.depth) body[key] = { i, depth: depthOf(i) };
        });
        const at = key => body[key] ? joints[body[key].i].position.slice(0, 3) : null;
        const place = (marker, point) => { if (point) { out.markers[marker] = point; out.found.push(marker); } };
        place('hips', at('hips'));
        place('chin', at('head'));
        place('headTop', at('headTop'));
        for (const side of ['L', 'R']) {
            place('shoulder' + side, at('upperArm' + side));
            place('elbow' + side, at('lowerArm' + side));
            place('wrist' + side, at('hand' + side));
            place('knee' + side, at('lowerLeg' + side));
            place('ankle' + side, at('foot' + side));
            for (const finger of FINGERS) {
                let chain = (fingers[side + finger] || []).slice().sort((a, b) => a.depth - b.depth || (a.read.segment || 0) - (b.read.segment || 0));
                // A finger's base is its knuckle: a metacarpal before it is not (a thumb's first bone is its base).
                if (finger !== 'thumb' && chain.length > 1 && (chain[0].read.metacarpal || chain[0].read.segment === 0)) chain = chain.slice(1);
                if (!chain.length) continue;
                const points = chain.map(entry => joints[entry.i].position.slice(0, 3));
                const last = chain[chain.length - 1];
                const lastIsEnd = last.read.end || last.read.segment >= 4 || (finger !== 'thumb' && chain.length >= 4) || (finger === 'thumb' && chain.length >= 4);
                if (chain.length === 1) {
                    if (lastIsEnd) place(fingerKey(finger, 'tip', side), points[0]);
                    else place(fingerKey(finger, 'base', side), points[0]);
                    continue;
                }
                place(fingerKey(finger, 'base', side), points[0]);
                if (lastIsEnd) place(fingerKey(finger, 'tip', side), points[points.length - 1]);
                else {
                    // No end joint: the tip lies about one more segment past the last joint.
                    const a = points[points.length - 2], b = points[points.length - 1];
                    place(fingerKey(finger, 'tip', side), add(b, scale(sub(b, a), 0.85)));
                }
            }
        }
        const legs = ['L', 'R'].filter(side => body['lowerLeg' + side] || body['foot' + side]).length;
        const arms = ['L', 'R'].filter(side => body['upperArm' + side] || body['hand' + side]).length;
        out.humanoid = !!body.hips && legs === 2 && arms >= 1;
        // Which way the model faces: its toes are ahead of its ankles.
        let ahead = 0;
        for (const side of ['L', 'R']) {
            const foot = at('foot' + side), toe = at('toe' + side);
            if (foot && toe) ahead += toe[2] - foot[2];
        }
        out.front = ahead > 1e-6 ? 1 : (ahead < -1e-6 ? -1 : 0);
        return out;
    }

    // ------------------------------------------------------------------
    // Voxels

    /** An empty grid over a box, `pad` empty cells round it, at most `cap` cells (the cell grows to fit). */
    function makeGrid(min, max, cell, pad, cap) {
        let v = cell;
        const dims = () => [0, 1, 2].map(a => Math.max(1, Math.ceil((max[a] - min[a]) / v)) + pad * 2);
        let d = dims();
        while (cap && d[0] * d[1] * d[2] > cap) { v *= 1.15; d = dims(); }
        const grid = { nx: d[0], ny: d[1], nz: d[2], v, ox: min[0] - pad * v, oy: min[1] - pad * v, oz: min[2] - pad * v };
        grid.n = grid.nx * grid.ny * grid.nz;
        grid.solid = new Uint8Array(grid.n);
        return grid;
    }
    const cellOf = (grid, x, y, z) => {
        const i = Math.floor((x - grid.ox) / grid.v), j = Math.floor((y - grid.oy) / grid.v), k = Math.floor((z - grid.oz) / grid.v);
        if (i < 1 || j < 1 || k < 1 || i >= grid.nx - 1 || j >= grid.ny - 1 || k >= grid.nz - 1) return -1;
        return i + grid.nx * (j + grid.ny * k);
    };
    const centerOf = (grid, index) => {
        const i = index % grid.nx, rest = (index - i) / grid.nx, j = rest % grid.ny, k = (rest - j) / grid.ny;
        return [grid.ox + (i + 0.5) * grid.v, grid.oy + (j + 0.5) * grid.v, grid.oz + (k + 0.5) * grid.v];
    };

    /** Mark every cell a triangle's surface passes through (triangles: nine floats each). */
    function rasterize(grid, tris) {
        const step = grid.v * 0.6;
        const maxX = grid.ox + grid.nx * grid.v, maxY = grid.oy + grid.ny * grid.v, maxZ = grid.oz + grid.nz * grid.v;
        const count = Math.floor(tris.length / 9);
        for (let t = 0; t < count; t++) {
            const o = t * 9;
            const ax = tris[o], ay = tris[o + 1], az = tris[o + 2], bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5], cx = tris[o + 6], cy = tris[o + 7], cz = tris[o + 8];
            if (Math.max(ax, bx, cx) < grid.ox || Math.min(ax, bx, cx) > maxX || Math.max(ay, by, cy) < grid.oy || Math.min(ay, by, cy) > maxY
                || Math.max(az, bz, cz) < grid.oz || Math.min(az, bz, cz) > maxZ) continue;
            const edge = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - ax, cy - ay, cz - az), Math.hypot(cx - bx, cy - by, cz - bz));
            const n = Math.min(400, Math.ceil(edge / step));
            if (n <= 1) {
                let c = cellOf(grid, ax, ay, az); if (c >= 0) grid.solid[c] = 1;
                c = cellOf(grid, bx, by, bz); if (c >= 0) grid.solid[c] = 1;
                c = cellOf(grid, cx, cy, cz); if (c >= 0) grid.solid[c] = 1;
                continue;
            }
            for (let i = 0; i <= n; i++) {
                for (let j = 0; j <= n - i; j++) {
                    const u = i / n, w = j / n;
                    const c = cellOf(grid, ax + (bx - ax) * u + (cx - ax) * w, ay + (by - ay) * u + (cy - ay) * w, az + (bz - az) * u + (cz - az) * w);
                    if (c >= 0) grid.solid[c] = 1;
                }
            }
        }
    }

    /** Fill what the surface closes in: every cell the outside cannot reach becomes solid. */
    function fill(grid) {
        const { nx, ny, n, solid } = grid;
        const outside = new Uint8Array(n);
        const stack = new Int32Array(n);
        let top = 0;
        stack[top++] = 0; outside[0] = 1;
        const plane = nx * ny;
        while (top) {
            const c = stack[--top];
            const i = c % nx, j = ((c - i) / nx) % ny, k = Math.floor(c / plane);
            if (i > 0) { const u = c - 1; if (!outside[u] && !solid[u]) { outside[u] = 1; stack[top++] = u; } }
            if (i < nx - 1) { const u = c + 1; if (!outside[u] && !solid[u]) { outside[u] = 1; stack[top++] = u; } }
            if (j > 0) { const u = c - nx; if (!outside[u] && !solid[u]) { outside[u] = 1; stack[top++] = u; } }
            if (j < ny - 1) { const u = c + nx; if (!outside[u] && !solid[u]) { outside[u] = 1; stack[top++] = u; } }
            if (k > 0) { const u = c - plane; if (!outside[u] && !solid[u]) { outside[u] = 1; stack[top++] = u; } }
            if (k < grid.nz - 1) { const u = c + plane; if (!outside[u] && !solid[u]) { outside[u] = 1; stack[top++] = u; } }
        }
        for (let c = 0; c < n; c++) if (!outside[c]) solid[c] = 1;
    }

    /** Peel one layer of cells off the solid (a cell stays when all six neighbors are solid). */
    function erode(grid) {
        const { nx, ny, n, solid } = grid, plane = nx * ny;
        const keep = new Uint8Array(n);
        for (let c = plane; c < n - plane; c++) {
            if (solid[c] && solid[c - 1] && solid[c + 1] && solid[c - nx] && solid[c + nx] && solid[c - plane] && solid[c + plane]) keep[c] = 1;
        }
        grid.solid = keep;
    }

    /** The 26 neighbors of a cell as index offsets, with their distances (10 a face, 14 an edge, 17 a corner). */
    function neighborOffsets(grid) {
        const offsets = [], weights = [];
        for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const kind = Math.abs(di) + Math.abs(dj) + Math.abs(dk);
            if (!kind) continue;
            offsets.push(di + grid.nx * (dj + grid.ny * dk));
            weights.push(kind === 1 ? 10 : kind === 2 ? 14 : 17);
        }
        return { offsets: Int32Array.from(offsets), weights: Int32Array.from(weights) };
    }

    /** Distance through the solid from the seed cells (ten units a cell); -1 where it cannot reach. */
    function geodesic(grid, seeds) {
        const dist = new Int32Array(grid.n).fill(-1);
        const { offsets, weights } = neighborOffsets(grid);
        const buckets = Array.from({ length: 18 }, () => []);
        let pending = 0;
        for (const s of seeds) if (grid.solid[s] && dist[s] < 0) { dist[s] = 0; buckets[0].push(s); pending++; }
        let maxD = 0;
        for (let d = 0; pending > 0; d++) {
            const bucket = buckets[d % 18];
            while (bucket.length) {
                const c = bucket.pop();
                pending--;
                if (dist[c] !== d) continue;
                if (d > maxD) maxD = d;
                for (let e = 0; e < 26; e++) {
                    const u = c + offsets[e];
                    if (!grid.solid[u]) continue;
                    const nd = d + weights[e];
                    if (dist[u] < 0 || nd < dist[u]) { dist[u] = nd; buckets[nd % 18].push(u); pending++; }
                }
            }
        }
        return { dist, maxD };
    }

    /**
     * The far ends of a distance field: maxima that stand out by at least `minRise` above where they join a
     * farther one (persistence). Each comes with the cells that end there (its limb, up to that junction).
     * [{ peak, birth, death, cells: Int32Array }], farthest first.
     */
    function extremities(grid, field, minRise) {
        const { dist, maxD } = field;
        const n = grid.n;
        const counts = new Int32Array(maxD + 2);
        let reached = 0;
        for (let c = 0; c < n; c++) if (dist[c] >= 0) { counts[dist[c]]++; reached++; }
        // Highest distance first (a counting sort).
        const starts = new Int32Array(maxD + 2);
        for (let d = maxD, at = 0; d >= 0; d--) { starts[d] = at; at += counts[d]; }
        const order = new Int32Array(reached);
        for (let c = 0; c < n; c++) if (dist[c] >= 0) order[starts[dist[c]]++] = c;
        const parent = new Int32Array(n).fill(-1), birth = new Int32Array(n), peak = new Int32Array(n), tail = new Int32Array(n), next = new Int32Array(n).fill(-1);
        const snapped = new Uint8Array(n);
        const label = new Int32Array(n).fill(-1);
        const found = [];
        const find = c => { while (parent[c] !== c) { parent[c] = parent[parent[c]]; c = parent[c]; } return c; };
        const snapshot = (rootCell, death, at) => {
            if (snapped[rootCell]) return;
            snapped[rootCell] = 1;
            const id = found.length;
            found.push({ peak: peak[rootCell], birth: birth[rootCell], death, joint: at });
            for (let c = rootCell; c >= 0; c = next[c]) if (label[c] < 0) label[c] = id;
        };
        const { offsets } = neighborOffsets(grid);
        const roots = [];
        for (let o = 0; o < reached; o++) {
            const c = order[o];
            parent[c] = c; birth[c] = dist[c]; peak[c] = c; tail[c] = c;
            roots.length = 0;
            for (let e = 0; e < 26; e++) {
                const u = c + offsets[e];
                if (parent[u] < 0) continue;
                const r = find(u);
                if (r !== c && roots.indexOf(r) < 0) roots.push(r);
            }
            if (!roots.length) continue;
            let eldest = roots[0];
            for (const r of roots) if (birth[r] > birth[eldest]) eldest = r;
            for (const r of roots) {
                if (r === eldest) continue;
                if (birth[r] - dist[c] >= minRise) { snapshot(eldest, dist[c], c); snapshot(r, dist[c], c); }
            }
            for (const r of roots) {
                if (r === eldest) continue;
                parent[r] = eldest; next[tail[eldest]] = r; tail[eldest] = tail[r];
            }
            parent[c] = eldest; next[tail[eldest]] = c; tail[eldest] = c;
        }
        // A far end that never met another stands alone (a single limb, or the whole of the model).
        for (let o = 0; o < reached; o++) { const r = find(order[o]); if (!snapped[r]) snapshot(r, 0, -1); }
        const lists = found.map(() => []);
        for (let c = 0; c < n; c++) if (label[c] >= 0) lists[label[c]].push(c);
        found.forEach((entry, i) => { entry.cells = Int32Array.from(lists[i]); });
        return found.filter(entry => entry.birth - entry.death >= minRise || entry.death === 0).sort((a, b) => b.birth - a.birth);
    }

    /** A limb's cross-sections from its junction out to its far end: center, cell count and half-width per band. */
    function bandsOf(grid, dist, cells, from, to, width) {
        const count = Math.max(1, Math.ceil((to - from + 1) / width));
        const sums = new Float64Array(count * 3), counts = new Int32Array(count);
        const points = new Array(cells.length);
        for (let i = 0; i < cells.length; i++) {
            const c = cells[i], b = Math.min(count - 1, Math.max(0, Math.floor((dist[c] - from) / width)));
            const p = centerOf(grid, c);
            points[i] = p;
            sums[b * 3] += p[0]; sums[b * 3 + 1] += p[1]; sums[b * 3 + 2] += p[2]; counts[b]++;
        }
        const bands = [];
        for (let b = 0; b < count; b++) bands.push({ d: from + (b + 0.5) * width, n: counts[b], c: counts[b] ? [sums[b * 3] / counts[b], sums[b * 3 + 1] / counts[b], sums[b * 3 + 2] / counts[b]] : null, r: 0 });
        for (let i = 0; i < cells.length; i++) {
            const b = Math.min(count - 1, Math.max(0, Math.floor((dist[cells[i]] - from) / width)));
            const band = bands[b];
            const r = length(sub(points[i], band.c));
            if (r > band.r) band.r = r;
        }
        return bands.filter(band => band.n > 0);
    }

    /** The point along a line of band centers at arc length `s` from its start. */
    function alongLine(line, s) {
        let travelled = 0;
        for (let i = 1; i < line.length; i++) {
            const step = length(sub(line[i], line[i - 1]));
            if (travelled + step >= s) return lerp(line[i - 1], line[i], step > 0 ? (s - travelled) / step : 0);
            travelled += step;
        }
        return line[line.length - 1].slice();
    }
    const lineLength = line => { let s = 0; for (let i = 1; i < line.length; i++) s += length(sub(line[i], line[i - 1])); return s; };
    const arcOf = (line, point) => {
        let best = 0, bestD = Infinity, s = 0;
        for (let i = 0; i < line.length; i++) {
            if (i) s += length(sub(line[i], line[i - 1]));
            const d = length(sub(line[i], point));
            if (d < bestD) { bestD = d; best = s; }
        }
        return best;
    };

    function boundsOf(tris) {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i + 2 < tris.length; i += 3) for (let a = 0; a < 3; a++) {
            const value = tris[i + a];
            if (value < min[a]) min[a] = value;
            if (value > max[a]) max[a] = value;
        }
        return { min, max };
    }

    // ------------------------------------------------------------------
    // The body

    /**
     * The limbs of a standing figure, measured through it from the top of its head: { humanoid, front,
     * minY, height, legs: {L,R}, arms: {L,R}, markers } where each found arm carries its band line (from
     * where it leaves the body out to the fingertips).
     */
    function analyzeBody(tris, options) {
        const opts = options || {};
        const { min, max } = boundsOf(tris);
        const height = max[1] - min[1];
        const out = { humanoid: false, front: 0, minY: min[1], height, legs: {}, arms: {}, markers: {} };
        if (!(height > 0) || !Number.isFinite(height)) return out;
        const grid = makeGrid(min, max, height / (opts.resolution || 128), 2, 1500000);
        rasterize(grid, tris);
        fill(grid);
        // One cell off the outside: an arm resting against the side, or legs close together, part again.
        if (opts.erode !== 0) erode(grid);
        out.grid = grid;
        const mx = (min[0] + max[0]) / 2;
        const Y = f => min[1] + height * f;
        // Solid cells by height, in the middle column (the head, the neck, the torso), for the head's profile.
        const rows = grid.ny;
        const rowLo = new Float64Array(rows).fill(Infinity), rowHi = new Float64Array(rows).fill(-Infinity), rowZ = new Float64Array(rows), rowN = new Int32Array(rows);
        let seed = -1, seedY = -Infinity;
        for (let c = 0; c < grid.n; c++) {
            if (!grid.solid[c]) continue;
            const p = centerOf(grid, c);
            if (Math.abs(p[0] - mx) > height * 0.12) continue;
            const j = Math.floor((p[1] - grid.oy) / grid.v);
            if (p[0] < rowLo[j]) rowLo[j] = p[0];
            if (p[0] > rowHi[j]) rowHi[j] = p[0];
            rowZ[j] += p[2]; rowN[j]++;
            // The seed: the top of the head.
            if (p[1] > seedY) { seedY = p[1]; seed = c; }
        }
        if (seed < 0) return out;
        const field = geodesic(grid, [seed]);
        out.field = field;
        const unitsPer = 10 / grid.v;  // distance units a model unit
        const ends = extremities(grid, field, height * 0.1 * unitsPer).map(entry => {
            const peak = centerOf(grid, entry.peak);
            return Object.assign(entry, { at: peak, rise: (entry.birth - entry.death) / unitsPer });
        });
        out.ends = ends;
        // Feet are the far ends on the floor, one each side; four strong ones are a four-legged thing.
        const low = ends.filter(e => e.at[1] < Y(0.15));
        const strongLow = low.filter(e => e.rise > height * 0.2);
        let legs = null;
        if (strongLow.length <= 3 && low.length >= 2) {
            const plus = low.filter(e => e.at[0] > mx).sort((a, b) => b.rise - a.rise)[0];
            const minus = low.filter(e => e.at[0] < mx).sort((a, b) => b.rise - a.rise)[0];
            if (plus && minus) legs = [plus, minus];
        }
        const quadruped = strongLow.length >= 4;
        // Hands are the far ends out to each side, off the floor.
        // An arm leaves the body high up (a holster or a coat's tail hangs from lower down) and is long.
        const armEnds = ends.filter(e => {
            if ((legs && legs.indexOf(e) >= 0) || e.at[1] < Y(0.25) || Math.abs(e.at[0] - mx) < height * 0.12) return false;
            let rootY = Infinity;
            for (let i = 0; i < e.cells.length; i++) if (field.dist[e.cells[i]] <= e.death + 15) rootY = Math.min(rootY, centerOf(grid, e.cells[i])[1]);
            return rootY >= Y(0.6) && e.rise >= height * 0.2;
        });
        const armPlus = armEnds.filter(e => e.at[0] > mx).sort((a, b) => b.rise - a.rise)[0] || null;
        const armMinus = armEnds.filter(e => e.at[0] < mx).sort((a, b) => b.rise - a.rise)[0] || null;
        // The neck: the narrowest of the middle column between the shoulders and the top of the head.
        const widthAt = j => (rowN[j] ? rowHi[j] - rowLo[j] : 0);
        let neck = -1;
        const j0 = Math.floor((Y(0.74) - grid.oy) / grid.v), j1 = Math.floor((Y(0.95) - grid.oy) / grid.v);
        for (let j = j0; j <= j1 && j < rows; j++) if (rowN[j] && (neck < 0 || widthAt(j) < widthAt(neck))) neck = j;
        let neckFound = false;
        if (neck >= 0) {
            let above = 0, below = 0;
            for (let j = neck; j < rows; j++) above = Math.max(above, widthAt(j));
            for (let j = Math.max(0, neck - Math.round(height * 0.12 / grid.v)); j < neck; j++) below = Math.max(below, widthAt(j));
            neckFound = widthAt(neck) < above * 0.8 && widthAt(neck) < below * 0.6;
        }
        out.humanoid = !quadruped && !!legs && ((!!armPlus && !!armMinus) || neckFound);
        if (!out.humanoid) return out;
        // Which way it faces: the feet reach ahead of the shins.
        let ahead = 0;
        const legOf = end => {
            const cells = end.cells;
            const slab = (ya, yb) => {
                let sum = [0, 0, 0], k = 0;
                for (let i = 0; i < cells.length; i++) {
                    const p = centerOf(grid, cells[i]);
                    if (p[1] >= ya && p[1] <= yb) { sum = add(sum, p); k++; }
                }
                return k ? scale(sum, 1 / k) : null;
            };
            const shin = slab(Y(0.08), Y(0.12));
            const foot = slab(min[1], Y(0.035));
            if (shin && foot) ahead += foot[2] - shin[2];
            let top = -Infinity;
            for (let i = 0; i < cells.length; i++) top = Math.max(top, centerOf(grid, cells[i])[1]);
            return { end, slab, shin, top };
        };
        const legInfo = legs.map(legOf);
        out.front = ahead > height * 0.005 ? 1 : (ahead < -height * 0.005 ? -1 : 1);
        const leftSign = out.front;  // the figure's own left: +x when it faces +z
        const sideOf = x => ((x - mx) * leftSign > 0 ? 'L' : 'R');
        // Where the legs part. A robe or a long coat closes them lower than a body would: then the
        // hips and knees keep their usual heights.
        const parted = Math.min(...legInfo.map(info => info.top));
        const crotch = parted >= Y(0.38) && parted <= Y(0.6) ? parted : null;
        out.legsParted = !!crotch;
        // The hips root a little above where the legs part, kept to a body's range (a coat's tails part lower).
        const hipsY = crotch ? Math.max(Y(0.5), Math.min(Y(0.62), crotch + height * 0.06)) : Y(0.565);
        const ankleY = Y(0.095);
        const kneeY = ankleY + (hipsY - ankleY) * 0.55;
        for (const info of legInfo) {
            const side = sideOf(info.end.at[0]);
            const shin = info.shin || info.slab(Y(0.06), Y(0.16));
            if (!shin) continue;
            out.legs[side] = info;
            out.markers['ankle' + side] = [shin[0], ankleY, shin[2]];
            const knee = info.slab(kneeY - grid.v * 1.5, kneeY + grid.v * 1.5);
            if (knee && crotch) out.markers['knee' + side] = [knee[0], kneeY, knee[2]];
        }
        // The hips: the root, just above where the legs part, in the middle of the body there.
        if (crotch) {
            let zSum = 0, k = 0;
            for (let c = 0; c < grid.n; c++) {
                if (!grid.solid[c]) continue;
                const p = centerOf(grid, c);
                if (Math.abs(p[1] - hipsY) <= grid.v && Math.abs(p[0] - mx) < height * 0.1) { zSum += p[2]; k++; }
            }
            if (k) out.markers.hips = [mx, hipsY, zSum / k];
        }
        for (const end of [armPlus, armMinus]) {
            if (!end) continue;
            const side = sideOf(end.at[0]);
            const bands = bandsOf(grid, field.dist, end.cells, end.death, end.birth, 10);
            if (bands.length < 4) continue;
            const line = bands.map(b => b.c);
            line.push(end.at.slice());
            out.arms[side] = { end, bands, line, length: lineLength(line) };
            // The shoulder joint sits in the top of the arm where it leaves the body.
            const root = bands[0];
            out.markers['shoulder' + side] = [root.c[0], root.c[1] + height * 0.07, root.c[2]];
        }
        // The head: its top over the neck; the chin a little above the neck's narrowest.
        const rowZAt = j => (rowN[j] ? rowZ[j] / rowN[j] : 0);
        const topJ = Math.floor((seedY - grid.oy) / grid.v);
        out.markers.headTop = [mx, seedY + grid.v * 0.5, neck >= 0 ? rowZAt(Math.round((neck + topJ) / 2)) : rowZAt(topJ)];
        if (neckFound) {
            const neckY = grid.oy + (neck + 0.5) * grid.v;
            const chinY = neckY + (seedY - neckY) * 0.15;
            out.markers.chin = [mx, chinY, rowZAt(Math.floor((chinY - grid.oy) / grid.v))];
        }
        return out;
    }

    // ------------------------------------------------------------------
    // A hand

    /**
     * A hand read at a finer grid. `box` {min,max} holds the far forearm and the hand; seeds are the cells
     * within `seedRadius` of `seedCenter` on the plane across `seedDir` (the forearm cut). `wrist` may be
     * given (a skeleton's); else it is the narrowest cross-section. `front` is the way the figure faces
     * (thumbs lean that way when nothing else says where the thumb is).
     * Returns { wrist, wristFound, tipFar, length, fingers: {finger: {base, tip}}, found: [fingers], axis, across, normal, width } or null.
     */
    function analyzeHand(tris, options) {
        const { box, seedCenter, seedDir, seedRadius } = options;
        const span = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]);
        if (!(span > 0)) return null;
        const grid = makeGrid(box.min, box.max, options.cell || span / (options.resolution || 110), 2, 900000);
        rasterize(grid, tris);
        fill(grid);
        const dir = unit(seedDir);
        const seeds = [];
        if (options.seedNear) {
            // The hand alone (its own skin): measured from its end nearest the forearm.
            // (A slab, not a sheet: the skin's edge at the wrist is ragged, and a corner left unseeded reads as a far end.)
            let near = Infinity, far = -Infinity;
            for (let c = 0; c < grid.n; c++) {
                if (!grid.solid[c]) continue;
                const t = dot(sub(centerOf(grid, c), seedCenter), dir);
                if (t < near) near = t;
                if (t > far) far = t;
            }
            const slab = Math.max(grid.v * 1.5, (far - near) * 0.12);
            for (let c = 0; c < grid.n; c++) if (grid.solid[c] && dot(sub(centerOf(grid, c), seedCenter), dir) <= near + slab) seeds.push(c);
        } else {
            for (let c = 0; c < grid.n; c++) {
                if (!grid.solid[c]) continue;
                const offset = sub(centerOf(grid, c), seedCenter);
                if (Math.abs(dot(offset, dir)) <= grid.v * 1.2 && length(offset) <= seedRadius) seeds.push(c);
            }
        }
        if (!seeds.length) return null;
        const field = geodesic(grid, seeds);
        const { dist, maxD } = field;
        if (maxD <= 0) return null;
        // Cross-sections along the distance from the cut.
        const reachedCells = [];
        for (let c = 0; c < grid.n; c++) if (dist[c] >= 0) reachedCells.push(c);
        const bands = bandsOf(grid, dist, Int32Array.from(reachedCells), 0, maxD, 10);
        let wrist = null, wristD = 0, wristFound = false;
        if (options.wrist) {
            const at = cellNear(grid, dist, options.wrist);
            if (at >= 0) { wrist = options.wrist.slice(); wristD = dist[at]; wristFound = true; }
        }
        if (!wrist) {
            // The narrowest cross-section about where a wrist falls (half way from the forearm cut to the
            // fingertips), widths smoothed over three bands, the farther from half way the less likely.
            const smooth = bands.map((b, i) => (bands[Math.max(0, i - 1)].r + b.r + bands[Math.min(bands.length - 1, i + 1)].r) / 3);
            let best = -1, bestCost = Infinity;
            for (let i = 0; i < bands.length; i++) {
                const f = bands[i].d / maxD;
                if (f < 0.3 || f > 0.7) continue;
                const cost = smooth[i] * (1 + 1.5 * Math.abs(f - 0.5));
                if (cost < bestCost) { bestCost = cost; best = i; }
            }
            if (best < 0) return null;
            wrist = bands[best].c.slice(); wristD = bands[best].d; wristFound = true;
        }
        if (maxD - wristD <= 30) return null;
        const unitsPer = 10 / grid.v;
        const ends = extremities(grid, field, (maxD - wristD) * 0.12).filter(e => e.birth > wristD + (maxD - wristD) * 0.3);
        if (!ends.length) return null;
        const far = ends[0];
        const tipOf = e => {
            let s = [0, 0, 0], k = 0;
            for (let i = 0; i < e.cells.length; i++) if (dist[e.cells[i]] >= e.birth - 15) { s = add(s, centerOf(grid, e.cells[i])); k++; }
            return k ? scale(s, 1 / k) : centerOf(grid, e.peak);
        };
        const baseOf = e => {
            let s = [0, 0, 0], k = 0;
            for (let i = 0; i < e.cells.length; i++) if (dist[e.cells[i]] <= e.death + 15) { s = add(s, centerOf(grid, e.cells[i])); k++; }
            return k ? scale(s, 1 / k) : centerOf(grid, e.peak);
        };
        const tipFar = tipOf(far);
        let axis = unit(sub(tipFar, wrist));
        let handLength = length(sub(tipFar, wrist));
        if (!(handLength > 0)) return null;
        // A wrist read off the shape that leaves a hand longer than a hand (a gauntlet or a cuff flares past
        // the forearm's narrowest) moves out to a hand's length from the fingertips.
        if (!options.wrist && options.height && handLength > options.height * 0.14) {
            wrist = sub(tipFar, scale(axis, options.height * 0.12));
            const at = cellNear(grid, dist, wrist);
            if (at >= 0) wristD = dist[at];
            handLength = options.height * 0.12;
        }
        const handD = maxD - wristD;
        // A finger reaches well out from the wrist; a knob by the wrist (a bone, a cuff) is no finger.
        let tips = ends.map(e => ({ e, tip: tipOf(e), base: baseOf(e), death: e.death, birth: e.birth, rise: e.birth - e.death }))
            .filter(t => t.birth - wristD >= handD * 0.35 && dot(sub(t.tip, wrist), axis) >= handLength * 0.3);
        // Keep the five that stand out most.
        tips.sort((a, b) => b.rise - a.rise);
        tips = tips.slice(0, 5);
        const result = { wrist, wristFound, tipFar, length: handLength, fingers: {}, found: [], axis, cell: grid.v, handD,
            ends: tips.map(t => ({ tip: t.tip, base: t.base, death: t.death - wristD, birth: t.birth - wristD })) };
        // The thumb: the finger that joins the hand nearest the wrist, well before the others.
        let thumb = null;
        if (tips.length >= 2) {
            const byDeath = tips.slice().sort((a, b) => a.death - b.death || a.birth - b.birth);
            const others = byDeath.slice(1).map(t => t.death).sort((a, b) => a - b);
            const median = others[Math.floor(others.length / 2)];
            if (tips.length === 2) thumb = tips[0].birth < tips[1].birth ? tips[0] : tips[1];
            else if (byDeath[0].death < median - handD * 0.1) thumb = byDeath[0];
        }
        // The hand's frame: along it, across the palm (its widest way, toward the thumb or else the front), and
        // the way the palm faces. The width is read where the fingers start, the thumb left out.
        const thumbCells = new Uint8Array(grid.n);
        if (thumb) for (let i = 0; i < thumb.e.cells.length; i++) thumbCells[thumb.e.cells[i]] = 1;
        const e1 = unit(Math.abs(axis[1]) < 0.9 ? cross(axis, [0, 1, 0]) : cross(axis, [1, 0, 0])), e2 = cross(axis, e1);
        const spreadCells = [];
        for (let c = 0; c < grid.n; c++) {
            const d = dist[c];
            if (d >= wristD + handD * 0.45 && d <= wristD + handD * 0.8 && !thumbCells[c]) spreadCells.push(c);
        }
        let sxx = 0, sxy = 0, syy = 0, mx = 0, my = 0;
        const offsets = spreadCells.map(c => { const off = sub(centerOf(grid, c), wrist); const p = [dot(off, e1), dot(off, e2)]; mx += p[0]; my += p[1]; return p; });
        if (offsets.length) { mx /= offsets.length; my /= offsets.length; }
        for (const p of offsets) { sxx += (p[0] - mx) * (p[0] - mx); sxy += (p[0] - mx) * (p[1] - my); syy += (p[1] - my) * (p[1] - my); }
        const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        let across = offsets.length > 3 ? unit(add(scale(e1, Math.cos(angle)), scale(e2, Math.sin(angle)))) : e1;
        const toward = thumb ? sub(thumb.base, wrist) : [0, 0, options.front || 1];
        if (dot(across, toward) < 0) across = scale(across, -1);
        const normal = unit(cross(axis, across));
        let lo = Infinity, hi = -Infinity, depth = 0;
        for (const c of spreadCells) {
            const off = sub(centerOf(grid, c), wrist), t = dot(off, across);
            if (t < lo) lo = t;
            if (t > hi) hi = t;
            depth += dot(off, normal);
        }
        const width = hi > lo ? hi - lo : handLength * 0.45;
        if (!(hi > lo)) { hi = width / 2; lo = -width / 2; }
        const middleN = spreadCells.length ? depth / spreadCells.length : 0;
        Object.assign(result, { across, normal, width });
        if (thumb) {
            result.fingers.thumb = { base: thumb.base, tip: thumb.tip };
            result.found.push('thumb');
        }
        // Four places across the hand, the index's nearest the thumb (or the front). A finger the skeleton
        // names takes the end nearest its own tip, and the places line up from it; the others take the
        // nearest free place.
        const four = FINGERS.slice(1);
        const rest = tips.filter(t => t !== thumb).slice(0, 4);
        const tOf = point => dot(sub(point, wrist), across);
        const claimed = {};
        const known = options.known || {};
        // A finger the skeleton names fixes where the places lie; else they spread over the hand's width.
        const spacing = (hi - lo) / 4;
        let anchorK = -1, anchorT = 0;
        for (const finger of four) {
            if (anchorK < 0 && known[finger] && known[finger].tip) { anchorK = four.indexOf(finger); anchorT = tOf(known[finger].tip); }
        }
        const slotT = k => (anchorK >= 0 ? anchorT - (k - anchorK) * spacing : hi - (k + 0.5) * spacing);
        // The ends keep their order across the hand: they take places in that order, the closest fit of all.
        const ordered = rest.slice().sort((a, b) => tOf(b.tip) - tOf(a.tip));
        let bestPick = null, bestCost = Infinity;
        const choose = (from, picked) => {
            if (picked.length === ordered.length) {
                const cost = picked.reduce((sum, k, i) => sum + Math.abs(tOf(ordered[i].tip) - slotT(k)), 0);
                if (cost < bestCost) { bestCost = cost; bestPick = picked.slice(); }
                return;
            }
            for (let k = from; k < 4; k++) { picked.push(k); choose(k + 1, picked); picked.pop(); }
        };
        if (ordered.length === 4) bestPick = [0, 1, 2, 3];
        else if (ordered.length) choose(0, []);
        if (bestPick) bestPick.forEach((k, i) => { claimed[four[k]] = ordered[i]; });
        for (const finger of four) {
            const t = claimed[finger];
            if (!t) continue;
            // A finger's base is its knuckle, below the web where it parts from the next: about two thirds
            // of its free length further in, and never nearer the wrist than two fifths of the hand.
            const freeLength = length(sub(t.tip, t.base));
            let base = sub(t.base, scale(axis, freeLength * 0.65));
            const along = dot(sub(base, wrist), axis);
            if (along < handLength * 0.4) base = add(base, scale(axis, handLength * 0.4 - along));
            result.fingers[finger] = { base, tip: t.tip };
            result.found.push(finger);
        }
        // Whatever was not found is laid across the hand's own width and length.
        const at = (along, t) => add(wrist, add(scale(axis, along * handLength), add(scale(across, t), scale(normal, middleN))));
        four.forEach((finger, k) => {
            if (result.fingers[finger]) return;
            result.fingers[finger] = { base: at(0.55, slotT(k)), tip: at(0.95, slotT(k)) };
        });
        if (!result.fingers.thumb) result.fingers.thumb = { base: at(0.22, hi + width * 0.1), tip: at(0.55, hi + width * 0.35) };
        void unitsPer;
        return result;
    }

    /** The reached cell nearest a point, -1 when none is near. */
    function cellNear(grid, dist, point) {
        const c = cellOf(grid, point[0], point[1], point[2]);
        if (c >= 0 && dist[c] >= 0) return c;
        let best = -1, bestD = Infinity;
        for (let i = 0; i < grid.n; i++) {
            if (dist[i] < 0) continue;
            const d = length(sub(centerOf(grid, i), point));
            if (d < bestD) { bestD = d; best = i; }
        }
        return bestD < Math.max(grid.v * 8, grid.v * Math.max(grid.nx, grid.ny, grid.nz) * 0.2) ? best : -1;
    }

    /** The box a hand and the far half of its forearm fit in, from an elbow and a wrist. */
    function handBoxFrom(elbow, wrist) {
        const forearm = Math.max(1e-6, length(sub(wrist, elbow)));
        const dir = unit(sub(wrist, elbow));
        const start = lerp(elbow, wrist, 0.75), end = add(wrist, scale(dir, forearm * 1.05));
        const pad = forearm * 0.4;
        return {
            cell: forearm / 80,
            box: { min: [0, 1, 2].map(a => Math.min(start[a], end[a]) - pad), max: [0, 1, 2].map(a => Math.max(start[a], end[a]) + pad) },
            seedCenter: start, seedDir: dir, seedRadius: forearm * 0.6
        };
    }

    // ------------------------------------------------------------------
    // Together

    /**
     * The humanoid markers for a model. input: { triangles: Float32Array (nine floats a triangle, model space),
     * joints: [{ name, parent, position }] (the model's own skeleton, model space), size: {x,y,z} }.
     * Returns { markers, found: { key: 'skeleton'|'shape' }, guessed: [keys], humanoid, ms }.
     */
    function autoMarkers(input) {
        const started = Date.now();
        const tris = input && input.triangles && input.triangles.length >= 9 ? input.triangles : null;
        const size = (input && input.size) || null;
        const skeleton = markersFromSkeleton(input && input.joints);
        const found = {};
        const markers = {};
        const take = (key, point, from) => {
            if (found[key] || !Array.isArray(point) || point.length < 3 || !point.every(Number.isFinite)) return;
            markers[key] = point.slice(0, 3); found[key] = from;
        };
        for (const key of skeleton.found) take(key, skeleton.markers[key], 'skeleton');
        let body = null;
        if (tris) {
            try { body = analyzeBody(tris, input.options); } catch (error) { body = null; }
        }
        const humanoid = skeleton.humanoid || !!(body && body.humanoid);
        const front = skeleton.front || (body && body.front) || 1;
        if (body && body.humanoid) for (const key of Object.keys(body.markers)) take(key, body.markers[key], 'shape');
        const shaped = {}, hands = {};
        const knownFingers = side => {
            const out = {};
            for (const finger of FINGERS) {
                const tip = found[fingerKey(finger, 'tip', side)] ? markers[fingerKey(finger, 'tip', side)] : null;
                if (tip) out[finger] = { tip };
            }
            return out;
        };
        if (humanoid && tris) {
            for (const side of ['L', 'R']) {
                const arm = body && body.arms[side];
                let hand = null, elbowGuess = null;
                const own = input.hands && input.hands[side];
                try {
                    if (own && own.length >= 9 * 20 && found['wrist' + side] && found['elbow' + side]) {
                        // The triangles the hand's own bones carry: nothing else (a thigh beside it) is read as a finger.
                        const { min, max } = boundsOf(own), pad = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * 0.05;
                        hand = analyzeHand(own, { box: { min: min.map(x => x - pad), max: max.map(x => x + pad) }, seedCenter: markers['wrist' + side],
                            seedDir: sub(markers['wrist' + side], markers['elbow' + side]), seedNear: true, wrist: markers['wrist' + side], front, known: knownFingers(side) });
                    } else if (found['wrist' + side] && found['elbow' + side]) {
                        hand = analyzeHand(tris, Object.assign(handBoxFrom(markers['elbow' + side], markers['wrist' + side]), { wrist: markers['wrist' + side], front, known: knownFingers(side) }));
                    } else if (arm) {
                        // The far half of the arm the body found: its box, cut across at the middle.
                        const half = arm.length * 0.45;
                        const start = alongLine(arm.line, half), next = alongLine(arm.line, half + body.grid.v * 2);
                        const pts = [start, arm.line[arm.line.length - 1]];
                        for (const b of arm.bands) if (arcOf(arm.line, b.c) >= half) pts.push(b.c);
                        const reach = Math.max(...arm.bands.map(b => b.r)) + body.grid.v * 3;
                        const box = { min: [0, 1, 2].map(a => Math.min(...pts.map(p => p[a])) - reach), max: [0, 1, 2].map(a => Math.max(...pts.map(p => p[a])) + reach) };
                        const radius = arm.bands.reduce((r, b) => (Math.abs(arcOf(arm.line, b.c) - half) < arm.length * 0.1 ? Math.max(r, b.r) : r), 0) + body.grid.v * 2;
                        hand = analyzeHand(tris, { box, seedCenter: start, seedDir: sub(next, start), seedRadius: radius, wrist: found['wrist' + side] ? markers['wrist' + side] : null, front, height: body.height });
                    }
                } catch (error) { hand = null; }
                if (!hand) continue;
                hands[side] = hand;
                take('wrist' + side, hand.wrist, 'shape');
                if (arm && !found['elbow' + side]) {
                    const shoulder = markers['shoulder' + side] || arm.line[0];
                    const wristArc = arcOf(arm.line, markers['wrist' + side]), shoulderArc = arcOf(arm.line, shoulder);
                    elbowGuess = alongLine(arm.line, shoulderArc + (wristArc - shoulderArc) * 0.56);
                    take('elbow' + side, elbowGuess, 'shape');
                }
                for (const finger of FINGERS) {
                    const read = hand.fingers[finger];
                    const sure = hand.found.indexOf(finger) >= 0;
                    for (const end of ['base', 'tip']) {
                        const key = fingerKey(finger, end, side);
                        if (sure) take(key, read[end], 'shape');
                        else if (!found[key]) shaped[key] = read[end].slice();
                    }
                }
                const bases = FINGERS.slice(1).map(f => markers[fingerKey(f, 'base', side)] || shaped[fingerKey(f, 'base', side)]).filter(Boolean);
                if (bases.length && markers['wrist' + side]) {
                    const palm = lerp(markers['wrist' + side], mean(bases), 0.5);
                    const sure = FINGERS.slice(1).filter(f => found[fingerKey(f, 'base', side)]).length >= 3;
                    if (sure) take('palm' + side, palm, 'shape'); else shaped['palm' + side] = palm;
                }
            }
        }
        // A found part with its twin unfound: the twin starts mirrored across the middle (a guess all the same).
        const mirrorKey = key => (/L$/.test(key) ? key.slice(0, -1) + 'R' : (/R$/.test(key) ? key.slice(0, -1) + 'L' : null));
        const centerX = markers.hips ? markers.hips[0] : 0;
        const guessed = {};
        if (humanoid) {
            for (const key of Object.keys(found)) {
                const twin = mirrorKey(key);
                if (twin && !found[twin] && !shaped[twin]) guessed[twin] = [2 * centerX - markers[key][0], markers[key][1], markers[key][2]];
            }
        }
        const placed = Object.assign({}, guessed, shaped, markers);
        const complete = Rigger ? Rigger.completeMarkers(placed, 'humanoid', size) : placed;
        const keys = Rigger ? Rigger.markersFor('humanoid').map(m => m.key) : Object.keys(complete);
        const out = {};
        for (const key of keys) if (complete[key]) out[key] = complete[key].map(value => Math.round(value * 1e5) / 1e5);
        return {
            markers: out,
            found,
            guessed: keys.filter(key => !found[key]),
            humanoid,
            fromSkeleton: skeleton.found.length > 0,
            fromShape: Object.values(found).indexOf('shape') >= 0,
            hands,
            ms: Date.now() - started
        };
    }

    /**
     * The markers named in a few words for the Rig bar: { found: [groups], guessed: [groups] }, a group
     * guessed when any marker in it is.
     */
    const GROUPS = [
        ['Head', ['headTop', 'chin']], ['Hips', ['hips']],
        ['Left arm', ['shoulderL', 'elbowL', 'wristL']], ['Right arm', ['shoulderR', 'elbowR', 'wristR']],
        ['Left hand', ['palmL']], ['Right hand', ['palmR']],
        ['Left thumb', ['thumbBaseL', 'thumbTipL']], ['Right thumb', ['thumbBaseR', 'thumbTipR']],
        ['Left fingers', ['index', 'middle', 'ring', 'pinky'].flatMap(f => [f + 'BaseL', f + 'TipL'])],
        ['Right fingers', ['index', 'middle', 'ring', 'pinky'].flatMap(f => [f + 'BaseR', f + 'TipR'])],
        ['Left leg', ['kneeL', 'ankleL']], ['Right leg', ['kneeR', 'ankleR']]
    ];
    function summarize(guessedKeys) {
        const guessed = new Set(guessedKeys || []);
        const out = { found: [], guessed: [] };
        for (const [label, keys] of GROUPS) (keys.some(key => guessed.has(key)) ? out.guessed : out.found).push(label);
        return out;
    }

    /**
     * What autoMarkers reads, from a three.js model as it stands (skinned meshes posed), in its own frame:
     * { triangles, joints, hands: { L, R } }, the hands being the triangles each hand's bones carry most of.
     * Joints the editor's rig made (a bound rig's bones, the finger joints laid on a file's hands) are left
     * out: they say where the markers were, not where the model's joints are.
     */
    function inputFromObject(object, THREE, skip) {
        object.updateMatrixWorld(true);
        const toModel = new THREE.Matrix4().copy(object.matrixWorld).invert();
        const bones = [], seen = new Set(), meshes = [];
        object.traverse(node => {
            if (!node.isMesh || !node.geometry || (skip && skip(node))) return;
            meshes.push(node);
            if (!node.isSkinnedMesh || !node.skeleton) return;
            for (const bone of node.skeleton.bones) {
                if (!bone || seen.has(bone)) continue;
                seen.add(bone);
                const made = bone.userData && (bone.userData.__reactorFinger || (bone.userData.__reactorRigBone && !bone.userData.__reactorClipBone));
                if (!made) bones.push(bone);
            }
        });
        const v = new THREE.Vector3();
        const joints = bones.map(bone => ({ name: bone.name, parent: bones.indexOf(bone.parent), position: bone.getWorldPosition(v).applyMatrix4(toModel).toArray() }));
        // Each hand's bones: the hand joint and all under it.
        const handBones = { L: new Set(), R: new Set() };
        for (const bone of bones) {
            const read = parseBoneName(bone.name);
            if (!read || read.part !== 'hand' || !read.side || handBones[read.side].size) continue;
            bone.traverse(node => handBones[read.side].add(node));
        }
        const chunks = [], handChunks = { L: [], R: [] };
        let total = 0;
        const handTotals = { L: 0, R: 0 };
        for (const mesh of meshes) {
            const geometry = mesh.geometry, position = geometry.getAttribute('position');
            if (!position) continue;
            const index = geometry.getIndex();
            const count = index ? index.count : position.count;
            const toLocal = new THREE.Matrix4().multiplyMatrices(toModel, mesh.matrixWorld);
            const skinned = mesh.isSkinnedMesh && typeof mesh.getVertexPosition === 'function';
            const placed = new Float32Array(position.count * 3);
            for (let i = 0; i < position.count; i++) {
                if (skinned) mesh.getVertexPosition(i, v); else v.fromBufferAttribute(position, i);
                v.applyMatrix4(toLocal);
                placed[i * 3] = v.x; placed[i * 3 + 1] = v.y; placed[i * 3 + 2] = v.z;
            }
            const out = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                const at = index ? index.getX(i) : i;
                out[i * 3] = placed[at * 3]; out[i * 3 + 1] = placed[at * 3 + 1]; out[i * 3 + 2] = placed[at * 3 + 2];
            }
            chunks.push(out); total += out.length;
            const skinIndex = geometry.getAttribute('skinIndex'), skinWeight = geometry.getAttribute('skinWeight');
            if (!skinned || !skinIndex || !skinWeight) continue;
            for (const side of ['L', 'R']) {
                if (!handBones[side].size) continue;
                const mine = mesh.skeleton.bones.map(bone => handBones[side].has(bone));
                if (mine.indexOf(true) < 0) continue;
                const share = new Float32Array(position.count);
                for (let i = 0; i < position.count; i++) {
                    let sum = 0;
                    for (let k = 0; k < 4; k++) if (mine[skinIndex.getComponent(i, k)]) sum += skinWeight.getComponent(i, k);
                    share[i] = sum;
                }
                const picked = [];
                for (let t = 0; t + 2 < count; t += 3) {
                    const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
                    if (share[a] + share[b] + share[c] < 1.5) continue;
                    for (const vertex of [a, b, c]) picked.push(placed[vertex * 3], placed[vertex * 3 + 1], placed[vertex * 3 + 2]);
                }
                if (picked.length) { const chunk = Float32Array.from(picked); handChunks[side].push(chunk); handTotals[side] += chunk.length; }
            }
        }
        const join = (list, size) => { const all = new Float32Array(size); let at = 0; for (const chunk of list) { all.set(chunk, at); at += chunk.length; } return all; };
        return {
            triangles: join(chunks, total),
            joints,
            hands: { L: handTotals.L ? join(handChunks.L, handTotals.L) : null, R: handTotals.R ? join(handChunks.R, handTotals.R) : null }
        };
    }

    const api = { inputFromObject, parseBoneName, nameTokens, markersFromSkeleton, analyzeBody, analyzeHand, handBoxFrom, autoMarkers, summarize, GROUPS };
    root.ModelAutoRig = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
