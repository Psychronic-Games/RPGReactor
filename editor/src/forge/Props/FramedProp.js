/**
 * RRFramedProp - From picture › Framed: the picture on a made object.
 *
 * A painting or poster in its frame (a style's molding swept round the
 * opening, mitered at the corners; a mat, glass), hung on a wall hook,
 * standing on an easel or on a table stand. A crate with the picture on
 * its sides, a book with it on its cover. Meters; the picture faces +z,
 * a frame's back at z = 0; what stands rests on y = 0, what hangs keeps
 * its height above the floor (`wall`).
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Paint = need('RRPropPaint', './PropPaint.js');
    const Mesh = need('RRPropMesh', './PropMesh.js');

    const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);
    const pick = (v, list, d) => (list.includes(v) ? v : d);

    const OBJECTS = [['painting', 'Framed painting'], ['poster', 'Poster'], ['banner', 'Hanging banner'], ['crate', 'Crate'], ['book', 'Book']];
    const STYLES = [['modern', 'Plain modern'], ['ornate', 'Ornate gilded'], ['rustic', 'Rustic wood'], ['metal', 'Thin metal'], ['shadow', 'Shadow box'], ['clip', 'Clip frame'], ['none', 'No frame']];
    const MATERIALS = [['gold', 'Gold leaf'], ['silver', 'Silver'], ['darkwood', 'Dark wood'], ['lightwood', 'Light wood'], ['painted', 'Painted'], ['blackmetal', 'Black metal']];
    const MOUNTS = [['wall', 'Wall hook'], ['easel', 'Easel'], ['stand', 'Table stand']];
    const PROFILE_EDGES = [['round', 'Rounded'], ['bevel', 'Beveled']];
    const WOODS = [['pine', 'Pine'], ['oak', 'Oak'], ['dark', 'Dark wood']];
    const BANDINGS = [['none', 'None'], ['metal', 'Metal bands'], ['rope', 'Rope']];
    const FACES = [['all', 'All sides'], ['front', 'Front only']];
    /** Starting points for a frame: each a full set of the frame's settings. */
    const PRESETS = [
        { id: 'museum', label: 'Museum gilded', set: { style: 'ornate', width: 0.1, depth: 0.06, edge: 'round', material: 'gold', mat: false, glass: false, mount: 'wall' } },
        { id: 'gallery', label: 'Gallery modern', set: { style: 'modern', width: 0.035, depth: 0.04, edge: 'bevel', material: 'painted', paint: '#f2f0ea', mat: true, matWidth: 0.08, matColor: '#f7f5ef', glass: true, mount: 'wall' } },
        { id: 'rustic', label: 'Rustic', set: { style: 'rustic', width: 0.07, depth: 0.035, edge: 'bevel', material: 'darkwood', mat: false, glass: false, mount: 'wall' } },
        { id: 'clip', label: 'Poster in a clip frame', set: { style: 'clip', width: 0.02, depth: 0.012, material: 'silver', mat: false, glass: true, mount: 'wall' } }
    ];
    const DEFAULT = {
        object: 'painting', size: 0.8, style: 'ornate', width: 0.1, depth: 0.06, edge: 'round', material: 'gold', paint: '#2b3a55',
        mat: false, matWidth: 0.06, matColor: '#f2eee4', glass: false, mount: 'wall', color: '#5a2a22', wood: 'oak', banding: 'metal', faces: 'all', thickness: 0.05, bands: true
    };
    const LOOK = {
        gold: { color: '#c9a043', roughness: 0.32, metalness: 0.9 }, silver: { color: '#c4c8ce', roughness: 0.25, metalness: 0.9 },
        darkwood: { color: '#4a2e1a', roughness: 0.6, metalness: 0, wood: true }, lightwood: { color: '#b48a5a', roughness: 0.65, metalness: 0, wood: true },
        painted: { color: null, roughness: 0.5, metalness: 0 }, blackmetal: { color: '#1e1e22', roughness: 0.4, metalness: 0.7 }
    };
    const WOOD_COLOR = { pine: '#b9935e', oak: '#8a6440', dark: '#4e3520' };

    function normalize(f) {
        const o = f && typeof f === 'object' ? f : {}, d = DEFAULT;
        // An older recipe's single frame choice.
        const legacy = { gilded: { style: 'ornate', material: 'gold' }, wood: { style: 'rustic', material: 'darkwood' }, black: { style: 'modern', material: 'blackmetal' }, none: { style: 'none' } }[o.frame] || {};
        const v = Object.assign({}, legacy, o);
        return {
            object: pick(v.object, OBJECTS.map(x => x[0]), d.object), size: clamp(v.size, 0.1, 6, d.size),
            style: pick(v.style, STYLES.map(x => x[0]), d.style), width: clamp(v.width, 0.01, 0.3, d.width), depth: clamp(v.depth, 0.008, 0.15, d.depth),
            edge: pick(v.edge, PROFILE_EDGES.map(x => x[0]), d.edge), material: pick(v.material, MATERIALS.map(x => x[0]), d.material), paint: color(v.paint, d.paint),
            mat: !!v.mat, matWidth: clamp(v.matWidth, 0.01, 0.4, d.matWidth), matColor: color(v.matColor, d.matColor), glass: !!v.glass,
            mount: pick(v.mount, MOUNTS.map(x => x[0]), d.mount), color: color(v.color, d.color),
            wood: pick(v.wood, WOODS.map(x => x[0]), d.wood), banding: pick(v.banding, BANDINGS.map(x => x[0]), d.banding), faces: pick(v.faces, FACES.map(x => x[0]), d.faces),
            thickness: clamp(v.thickness, 0.01, 0.25, d.thickness), bands: v.bands !== false
        };
    }

    // ── pieces ─────────────────────────────────────────────────────────────
    function plane(pw, ph, z, back) {
        return {
            positions: Float32Array.from([-pw / 2, -ph / 2, z, pw / 2, -ph / 2, z, pw / 2, ph / 2, z, -pw / 2, ph / 2, z]),
            normals: Float32Array.from([0, 0, back ? -1 : 1, 0, 0, back ? -1 : 1, 0, 0, back ? -1 : 1, 0, 0, back ? -1 : 1]),
            uvs: Float32Array.from([0, 1, 1, 1, 1, 0, 0, 0]), index: Uint32Array.from(back ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3])
        };
    }

    /**
     * A molding swept round a w x h opening (centered, in the x-y plane):
     * `profile` [[out, z], ...] from the opening's edge outward, `out`
     * measured out from the opening, mitered at the corners.
     */
    function sweep(w, h, open) {
        // The profile closes behind: down its outer back edge, across the back, up to the inner lip.
        const last = open[open.length - 1], profile = open.concat([[open[0][0], last[1]], open[0]]);
        const P = [], N = [], T = [], I = [];
        const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
        for (let side = 0; side < 4; side++) {
            const a = corners[side], b = corners[(side + 1) % 4];
            const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
            const ox = dy / l, oy = -dx / l;
            const start = P.length / 3;
            profile.forEach(([out, z], k) => {
                const prev = profile[Math.max(0, k - 1)], nxt = profile[Math.min(profile.length - 1, k + 1)];
                const dOut = nxt[0] - prev[0], dz = nxt[1] - prev[1], ll = Math.hypot(dOut, dz) || 1;
                const nOut = dz / ll, nz = -dOut / ll;
                for (const [c, s] of [[a, -1], [b, 1]]) {
                    P.push(c[0] + ox * out + dx / l * s * out, c[1] + oy * out + dy / l * s * out, z);
                    N.push(-ox * nOut, -oy * nOut, -nz);
                    T.push(s < 0 ? 0 : l, out);
                }
            });
            for (let k = 0; k < profile.length - 1; k++) { const i0 = start + k * 2, i1 = i0 + 2; I.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1); }
        }
        return { positions: Float32Array.from(P), normals: Float32Array.from(N), uvs: Float32Array.from(T), index: Uint32Array.from(I) };
    }

    /** A corner of a profile rounded or beveled: replaces the point at `k` with a few. */
    function soften(profile, k, r, round) {
        const [x, z] = profile[k], a = profile[k - 1], b = profile[k + 1];
        const da = [a[0] - x, a[1] - z], db = [b[0] - x, b[1] - z], la = Math.hypot(...da) || 1, lb = Math.hypot(...db) || 1;
        const p0 = [x + da[0] / la * r, z + da[1] / la * r], p1 = [x + db[0] / lb * r, z + db[1] / lb * r];
        const pts = round ? [0, 0.25, 0.5, 0.75, 1].map(t => [(1 - t) * (1 - t) * p0[0] + 2 * t * (1 - t) * x + t * t * p1[0], (1 - t) * (1 - t) * p0[1] + 2 * t * (1 - t) * z + t * t * p1[1]]) : [p0, p1];
        return profile.slice(0, k).concat(pts, profile.slice(k + 1));
    }

    /** A frame style's molding (inner edge to outer), its front at `dep`, the picture's face at `zp`. */
    function profileFor(o, zp) {
        const fw = o.style === 'metal' ? Math.min(o.width, 0.025) : o.width, dep = o.depth, round = o.edge === 'round';
        const e = Math.min(fw, dep) * 0.3;
        if (o.style === 'ornate') {
            // A baroque molding: a lip at the picture, a bead, a cove, a carved torus, an outer step.
            return [[-0.003, zp], [0, dep * 0.55], [fw * 0.06, dep * 0.7], [fw * 0.1, dep * 0.62], [fw * 0.16, dep * 0.82], [fw * 0.22, dep * 0.9], [fw * 0.27, dep * 0.8],
                [fw * 0.36, dep * 0.95], [fw * 0.46, dep * 1.18], [fw * 0.56, dep * 1.0], [fw * 0.64, dep * 1.12], [fw * 0.74, dep * 1.35], [fw * 0.84, dep * 1.2],
                [fw * 0.92, dep * 0.98], [fw, dep * 0.75], [fw, 0]];
        }
        if (o.style === 'shadow') return soften([[0, zp], [0, dep], [fw, dep], [fw, 0]], 2, e, round);
        if (o.style === 'rustic') return [[-0.003, zp], [0, dep * 0.88], [fw * 0.08, dep], [fw * 0.92, dep * 0.97], [fw, dep * 0.84], [fw, 0]];
        return soften(soften([[-0.003, zp], [0, dep], [fw, dep], [fw, 0]], 2, e, round), 1, e * 0.6, round);
    }

    function material(o) {
        const look = LOOK[o.material];
        return { color: look.color || o.paint, roughness: look.roughness, metalness: look.metalness, wood: !!look.wood };
    }

    // ── the framed picture ─────────────────────────────────────────────────
    function framedPicture(o, w, h, picture, poster) {
        const parts = [], textures = {};
        const style = o.style, mat = o.mat && style !== 'none' && style !== 'clip' ? o.matWidth : 0;
        const ow = w + mat * 2, oh = h + mat * 2;
        let outerW = ow, outerH = oh, depth = 0;
        if (style === 'none' && poster) {
            // A sheet a little curled at its corners, pinned to the wall.
            const nx = 8, ny = 8, P = [], N = [], T = [], I = [];
            for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
                const u = i / nx, v = j / ny, curl = 0.012 * Math.max(w, h) * (Math.pow(Math.abs(u - 0.5) * 2, 4) * Math.pow(Math.abs(v - 0.5) * 2, 4));
                P.push((u - 0.5) * w, (0.5 - v) * h, 0.003 + curl); N.push(0, 0, 1); T.push(u, v);
            }
            for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const q = j * (nx + 1) + i; I.push(q, q + nx + 1, q + 1, q + 1, q + nx + 1, q + nx + 2); }
            parts.push(Object.assign(Mesh.computeNormals({ positions: Float32Array.from(P), normals: Float32Array.from(N), uvs: Float32Array.from(T), index: Uint32Array.from(I) }), { name: 'Poster', texture: 'picture.png', roughness: 0.5, doubleSided: true }));
            parts.push(Object.assign(Mesh.merge([[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => Mesh.sphere([sx * (w / 2 - 0.02), sy * (h / 2 - 0.02), 0.006], 0.006, 8))), { name: 'Pins', color: o.color, roughness: 0.4, metalness: 0.2 }));
            depth = 0.01;
        } else if (style === 'none') {
            // A canvas wrapped round its stretcher: the picture's own edge colors down its sides.
            const cd = 0.03;
            parts.push(Object.assign(plane(w, h, cd), { name: 'Painting', texture: 'picture.png', roughness: 0.6 }));
            const sides = Mesh.box([0, 0, cd / 2 - 0.0005], [w, h, cd - 0.001]);
            parts.push(Object.assign(sides, { name: 'Canvas', color: edgeColor(picture), roughness: 0.8 }));
            depth = cd;
        } else {
            const zp = style === 'shadow' ? o.depth * 0.18 : style === 'clip' ? 0.006 : Math.min(o.depth * 0.4, 0.02);
            parts.push(Object.assign(plane(w, h, zp + 0.0006), { name: poster ? 'Poster' : 'Painting', texture: 'picture.png', roughness: poster ? 0.45 : 0.6 }));
            // The backing board closing the frame's back.
            parts.push(Object.assign(Mesh.box([0, 0, zp / 2], [ow + 0.002, oh + 0.002, zp]), { name: 'Backing', color: '#3a2c20', roughness: 0.9 }));
            if (mat) parts.push(Object.assign(sweep(w, h, [[0, zp + 0.0008], [0.003, zp + 0.003], [mat + 0.0005, zp + 0.003], [mat + 0.0005, zp + 0.0008]]), { name: 'Mat', color: o.matColor, roughness: 0.9 }));
            const front = style === 'clip' ? zp + 0.004 : o.depth;
            if (o.glass) parts.push(Object.assign(plane(ow, oh, Math.min(front - 0.001, zp + (mat ? 0.006 : 0.003))), { name: 'Glass', color: '#ffffff', opacity: 0.14, roughness: 0.05, metalness: 0 }));
            const m = material(o);
            if (style === 'clip') {
                // No molding: a thin board behind the glass, four metal clips holding them.
                const c = 0.012, clips = [];
                for (const [sx, sy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) clips.push(Mesh.box([sx * (ow / 2 - c * 0.4), sy * (oh / 2 - c * 0.4), front / 2 + 0.001], [sx ? c * 0.8 : c * 2.4, sy ? c * 0.8 : c * 2.4, front + 0.003]));
                parts.push(Object.assign(Mesh.merge(clips), { name: 'Clips', color: m.color, roughness: m.roughness, metalness: m.metalness }));
                depth = front;
            } else {
                const molding = sweep(ow, oh, profileFor(o, zp));
                const frame = Object.assign(molding, { name: 'Frame', color: m.color, roughness: m.roughness, metalness: m.metalness });
                if (m.wood) { Mesh.planarUv(frame, 0.4); frame.texture = 'wood.png'; textures['wood.png'] = Paint.wood(m.color, 13); }
                parts.push(frame);
                const fw = style === 'metal' ? Math.min(o.width, 0.025) : o.width;
                outerW = ow + fw * 2; outerH = oh + fw * 2; depth = o.depth * (style === 'ornate' ? 1.35 : 1);
                if (style === 'ornate') {
                    // Carved ornaments: a rosette at each corner, a shell at the middle of the top and the foot.
                    const orn = [], r = fw * 0.42, zf = o.depth * 1.15;
                    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) orn.push(rosette([sx * (ow / 2 + fw * 0.5), sy * (oh / 2 + fw * 0.5), zf], r));
                    for (const sy of [-1, 1]) orn.push(shell([0, sy * (oh / 2 + fw * 0.55), zf], fw * 0.8, sy));
                    parts.push(Object.assign(Mesh.merge(orn), { name: 'Ornament', color: m.color, roughness: m.roughness, metalness: m.metalness, doubleSided: true }));
                    depth = o.depth * 1.35 + r * 0.6;
                }
                if (style === 'rustic') {
                    const nails = [];
                    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) nails.push(Mesh.sphere([sx * (ow / 2 + fw * 0.5), sy * (oh / 2 + fw * 0.5), o.depth + 0.001], Math.max(0.003, fw * 0.06), 8, 3));
                    parts.push(Object.assign(Mesh.merge(nails), { name: 'Nails', color: '#2a2a2c', roughness: 0.5, metalness: 0.6 }));
                }
            }
        }
        return { parts, textures, w: outerW, h: outerH, depth };
    }

    /** A carved rosette: a domed flower of petals, facing +z. */
    function rosette(at, r) {
        const profile = [[0, 0], [r, 0], [r * 0.95, r * 0.25], [r * 0.7, r * 0.35], [r * 0.55, r * 0.28], [r * 0.35, r * 0.42], [r * 0.15, r * 0.52], [0, r * 0.55]];
        const m = Mesh.lathe(profile, 10, { base: at, dir: [0, 0, 1], sharp: 0.4 });
        // Petals: the rim scalloped in and out.
        const P = m.positions;
        for (let i = 0; i < P.length; i += 3) {
            const dx = P[i] - at[0], dy = P[i + 1] - at[1], a = Math.atan2(dy, dx), k = 1 + 0.18 * Math.cos(a * 5);
            P[i] = at[0] + dx * k; P[i + 1] = at[1] + dy * k;
        }
        return Mesh.computeNormals(m);
    }

    /** A carved shell: a fan of ribs, wider than tall, opening away from the picture (`up` 1 at the top, -1 at the foot). */
    function shell(at, size, up) {
        const ribs = 7, rows = 4, P = [], I = [];
        for (let j = 0; j <= rows; j++) for (let i = 0; i <= ribs; i++) {
            const a = Math.PI * (0.1 + 0.8 * i / ribs), t = j / rows, r = size * 0.5 * t;
            const ridge = 0.5 + 0.5 * Math.cos(i * Math.PI * 2 / 2);
            P.push(at[0] + Math.cos(a) * r, at[1] + up * Math.sin(a) * r * 0.75, at[2] + size * 0.18 * (1 - t * t) + size * 0.04 * ridge * t);
        }
        for (let j = 0; j < rows; j++) for (let i = 0; i < ribs; i++) {
            const q = j * (ribs + 1) + i;
            if (up < 0) I.push(q, q + 1, q + ribs + 1, q + 1, q + ribs + 2, q + ribs + 1); else I.push(q, q + ribs + 1, q + 1, q + 1, q + ribs + 1, q + ribs + 2);
        }
        return Mesh.computeNormals({ positions: Float32Array.from(P), normals: new Float32Array(P.length), uvs: new Float32Array(P.length / 3 * 2), index: Uint32Array.from(I) });
    }

    function edgeColor(img) {
        if (!img) return '#7a7a7a';
        let r = 0, g = 0, b = 0, n = 0;
        const at = (x, y) => { const o = (y * img.width + x) * 4; r += img.data[o]; g += img.data[o + 1]; b += img.data[o + 2]; n++; };
        for (let x = 0; x < img.width; x += 4) { at(x, 0); at(x, img.height - 1); }
        for (let y = 0; y < img.height; y += 4) { at(0, y); at(img.width - 1, y); }
        const hex = v => Math.round(v / n).toString(16).padStart(2, '0');
        return '#' + hex(r) + hex(g) + hex(b);
    }

    // ── mounts ─────────────────────────────────────────────────────────────
    function move(parts, fn, nfn) { for (const p of parts) Mesh.transform(p, fn, nfn); }

    /** Tilts the parts back (top toward -z) by `angle` about the line y = y0, z = z0. */
    function tilt(parts, angle, y0, z0) {
        const c = Math.cos(angle), s = Math.sin(angle);
        move(parts, ([x, y, z]) => { const dy = y - y0, dz = z - z0; return [x, y0 + dy * c + dz * s, z0 - dy * s + dz * c]; }, ([x, y, z]) => [x, y * c + z * s, -y * s + z * c]);
    }

    /**
     * The framed picture put up: on a wall (its middle at eye height, a hook
     * and wire above it), on an easel, or leaning back on a table stand.
     */
    function mount(o, made, parts) {
        const H = made.h, W = made.w;
        if (o.mount === 'wall' || o.object === 'poster' && o.style === 'none') {
            const lift = Math.max(1.5 - H / 2, 0.3);
            move(parts, ([x, y, z]) => [x, y + H / 2 + lift, z]);
            if (o.style !== 'none' || o.object !== 'poster') {
                const top = lift + H, hook = [0, top + Math.min(0.12, H * 0.12), 0.006], hardware = [];
                hardware.push(Mesh.tube([-W * 0.3, top - Math.min(0.05, H * 0.08), 0.004], hook, 0.0012, 0.0012, 4), Mesh.tube([W * 0.3, top - Math.min(0.05, H * 0.08), 0.004], hook, 0.0012, 0.0012, 4));
                hardware.push(Mesh.box([0, hook[1] + 0.004, 0.004], [0.012, 0.018, 0.008]));
                parts.push(Object.assign(Mesh.merge(hardware), { name: 'Hook', color: '#b08a3a', roughness: 0.4, metalness: 0.8 }));
            }
            return true;
        }
        if (o.mount === 'easel') {
            // An easel: two front legs splayed, a back leg, a ledge the picture stands on, leaning back.
            const ledge = 0.55, lean = 0.2, Ht = ledge + H * 0.95 + 0.25, leg = Math.max(0.025, Math.min(0.04, W * 0.03));
            move(parts, ([x, y, z]) => [x, y + H / 2 + ledge + 0.02, z + 0.04]);
            tilt(parts, lean, ledge, 0);
            const top = [0, Ht, -Math.sin(lean) * (Ht - ledge)];
            const wood = [];
            for (const s of [-1, 1]) wood.push(Mesh.tube([s * Math.max(0.3, W * 0.45), 0, 0.12], [s * 0.04, Ht, top[2] + 0.02], leg, leg * 0.8, 6));
            wood.push(Mesh.tube([0, 0, -0.55 - Ht * 0.12], [0, Ht * 0.92, top[2] - 0.03], leg, leg * 0.8, 6));
            wood.push(Mesh.box([0, ledge - 0.005, 0.06], [Math.max(0.5, W * 0.9), 0.025, 0.07]));
            const e = Object.assign(Mesh.planarUv(Mesh.merge(wood), 0.5), { name: 'Easel', texture: 'wood.png', roughness: 0.7 });
            parts.push(e);
            return false;
        }
        // A table stand: a strut from the back to the floor behind, the frame leaning a little back on its foot.
        move(parts, ([x, y, z]) => [x, y + H / 2, z]);
        tilt(parts, 0.2, 0, 0);
        const reach = H * 0.75, strutTop = [0, Math.cos(0.2) * reach, -Math.sin(0.2) * reach - 0.006];
        parts.push(Object.assign(Mesh.merge([Mesh.tube([0, 0.005, -H * 0.42], strutTop, Math.max(0.006, W * 0.012), Math.max(0.006, W * 0.012), 6)]), { name: 'Stand', color: '#2a2420', roughness: 0.7 }));
        return false;
    }

    // ── the objects ────────────────────────────────────────────────────────
    function crate(o) {
        const s = o.size, t = s * 0.08, parts = [], textures = {};
        const woodColor = WOOD_COLOR[o.wood];
        const sides = [], plain = [];
        for (let k = 0; k < 4; k++) {
            const m = plane(s * 0.98, s * 0.98, s / 2 + 0.002, false);
            const ang = k * Math.PI / 2, c = Math.cos(ang), si = Math.sin(ang);
            Mesh.transform(m, ([x, y, z]) => [x * c + z * si, y + s / 2, -x * si + z * c], ([x, y, z]) => [x * c + z * si, y, -x * si + z * c]);
            (o.faces === 'all' || k === 0 ? sides : plain).push(m);
        }
        parts.push(Object.assign(Mesh.merge(sides), { name: 'Sides', texture: 'picture.png', roughness: 0.8 }));
        const slats = [Mesh.box([0, s / 2, 0], [s * 0.97, s * 0.97, s * 0.97])].concat(plain);
        for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) slats.push(Mesh.box([x * (s / 2 - t / 2 + 0.006), s / 2, z * (s / 2 - t / 2 + 0.006)], [t, s, t]));
        for (const y of [t / 2, s - t / 2]) slats.push(Mesh.box([0, y, s / 2 - t / 2 + 0.006], [s, t, t]), Mesh.box([0, y, -s / 2 + t / 2 - 0.006], [s, t, t]), Mesh.box([s / 2 - t / 2 + 0.006, y, 0], [t, t, s]), Mesh.box([-s / 2 + t / 2 - 0.006, y, 0], [t, t, s]));
        parts.push(Object.assign(Mesh.planarUv(Mesh.merge(slats), 0.5), { name: 'Slats', texture: 'wood.png', roughness: 0.85 }));
        textures['wood.png'] = Paint.wood(woodColor, 11);
        if (o.banding !== 'none') {
            // Two bands round the middle: metal straps with rivets, or rope.
            const bands = [], bw = o.banding === 'metal' ? s * 0.035 : s * 0.025, out = s / 2 + 0.012;
            for (const y of [s * 0.3, s * 0.7]) {
                if (o.banding === 'metal') bands.push(Mesh.box([0, y, out], [s + 0.024, bw, 0.004]), Mesh.box([0, y, -out], [s + 0.024, bw, 0.004]), Mesh.box([out, y, 0], [0.004, bw, s + 0.024]), Mesh.box([-out, y, 0], [0.004, bw, s + 0.024]));
                else { const c = [[-out, -out], [out, -out], [out, out], [-out, out]]; for (let k = 0; k < 4; k++) bands.push(Mesh.tube([c[k][0], y, c[k][1]], [c[(k + 1) % 4][0], y, c[(k + 1) % 4][1]], bw / 2, bw / 2, 6)); }
            }
            parts.push(Object.assign(Mesh.merge(bands), o.banding === 'metal' ? { name: 'Bands', color: '#3a3a3e', roughness: 0.45, metalness: 0.7 } : { name: 'Rope', color: '#b39a6a', roughness: 0.95, metalness: 0 }));
        }
        return { parts, textures };
    }

    function book(o, w, h) {
        // Lying on its back cover: boards a little larger than the pages, the picture on the front, bands across the spine.
        const bw = w, bd = h, thick = o.thickness, board = Math.max(0.003, Math.min(0.008, thick * 0.1)), parts = [];
        const cover = plane(bw, bd, 0, false);
        Mesh.transform(cover, ([x, y]) => [x, thick + 0.0005, -y], () => [0, 1, 0]);
        parts.push(Object.assign(cover, { name: 'Cover', texture: 'picture.png', roughness: 0.55 }));
        const binding = [Mesh.box([0, thick - board / 2, 0], [bw, board, bd]), Mesh.box([0, board / 2, 0], [bw, board, bd]), Mesh.box([-bw / 2 + board / 2, thick / 2, 0], [board, thick, bd])];
        if (o.bands) for (const f of [0.2, 0.4, 0.6, 0.8]) binding.push(Mesh.tube([-bw / 2 - 0.0005, thick * 0.12, (f - 0.5) * bd], [-bw / 2 - 0.0005, thick * 0.88, (f - 0.5) * bd], Math.max(0.0015, thick * 0.05), Math.max(0.0015, thick * 0.05), 6));
        parts.push(Object.assign(Mesh.merge(binding), { name: 'Binding', color: o.color, roughness: 0.6 }));
        parts.push(Object.assign(Mesh.box([board * 0.5, thick / 2, 0], [bw - board * 2.5, thick - board * 2, bd - board * 2]), { name: 'Pages', color: '#eee6d2', roughness: 0.95 }));
        return { parts, textures: {} };
    }

    /**
     * The object for a picture ({ width, height, data }): { parts, textures,
     * wall } where `wall` says it hangs (its height kept, a wall at z = 0).
     */
    function build(f, img) {
        const o = normalize(f), a = img.height / img.width;
        const w = a >= 1 ? o.size / a : o.size, h = a >= 1 ? o.size : o.size * a;
        const picture = Object.assign({}, img, { data: Uint8Array.from(img.data), name: 'picture.png' });
        for (let i = 3; i < picture.data.length; i += 4) picture.data[i] = 255;
        let made, wall = false;
        if (o.object === 'crate') made = crate(o);
        else if (o.object === 'book') made = book(o, w, h);
        else {
            made = framedPicture(o, w, h, picture, o.object === 'poster');
            wall = mount(o, made, made.parts);
            if (o.mount === 'easel' && !wall) made.textures['wood.png'] = made.textures['wood.png'] || Paint.wood('#8a6440', 17);
        }
        made.textures['picture.png'] = picture;
        return { parts: made.parts, textures: made.textures, wall };
    }

    const api = { OBJECTS, STYLES, MATERIALS, MOUNTS, PROFILE_EDGES, WOODS, BANDINGS, FACES, PRESETS, DEFAULT, normalize, build, sweep };
    root.RRFramedProp = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
