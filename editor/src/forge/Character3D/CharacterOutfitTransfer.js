/**
 * RRCharacterOutfitTransfer - an outfit taken from a rigged humanoid model
 * (one skinned mesh, one picture) and worn by any builder body.
 *
 *   readModel(bytes)            a GLB's skinned mesh, skeleton and picture
 *   transfer(pack, model, o)    the outfit cut from the model and bound to
 *                               the builder's body (see below)
 *   fit(pack, built, outfit, frame)
 *                               the outfit's vertices on a built body
 *   encode(outfit) / decode(json, bytes)
 *                               an outfit as a JSON layout and one binary
 *   buildAll(pack, built, items, frame, cache)
 *                               garment items worn by a built body:
 *                               [{ part, texture, hidden }]
 *
 * Taking an outfit: the body is posed and stretched onto the model's
 * skeleton (each limb bone onto the model's, the trunk between the hips
 * and the shoulders), then drawn in to the model's innermost layer of
 * clothes; the model's head, and whatever else the options leave out, is
 * cut away; every remaining vertex is bound to the nearest point of the
 * posed body's surfaces (the tights helper on the trunk and limbs, the
 * skin on the hands, feet and neck, the skirt helper for cloth hanging
 * free below the hips) by barycentric weights plus an offset in that
 * point's own frame. Laid on any body at rest, every vertex rides the same
 * point, so the outfit follows every slider and keeps its bulk.
 *
 * Colors: with no color chosen the outfit shows the model's own picture;
 * a color moves the hue of the picture's main color (its second color and
 * trim likewise), its shading kept.
 *
 * No DOM and no three.js: the builder page and the node tests share it.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Body = need('RRHumanBody', './HumanBody.js');
    const Outfit = need('RRCharacterOutfit', './CharacterOutfit.js');
    const Simplify = need('RRCharacterSimplify', './CharacterSimplify.js');

    // Garment points closer to the skin than this are lifted out to it.
    const GAP = 0.003;

    // ── small vector helpers ──────────────────────────────────────────────
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = a => Math.hypot(a[0], a[1], a[2]);
    const unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

    /** A 3x3 matrix (rows) taking unit vector a onto unit vector b by the shortest turn. */
    function turn(a, b) {
        const v = cross(a, b), c = dot(a, b);
        if (c < -0.9999) {
            const p = unit(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
            return [[2 * p[0] * p[0] - 1, 2 * p[0] * p[1], 2 * p[0] * p[2]], [2 * p[1] * p[0], 2 * p[1] * p[1] - 1, 2 * p[1] * p[2]], [2 * p[2] * p[0], 2 * p[2] * p[1], 2 * p[2] * p[2] - 1]];
        }
        const k = 1 / (1 + c);
        return [
            [c + v[0] * v[0] * k, v[0] * v[1] * k - v[2], v[0] * v[2] * k + v[1]],
            [v[1] * v[0] * k + v[2], c + v[1] * v[1] * k, v[1] * v[2] * k - v[0]],
            [v[2] * v[0] * k - v[1], v[2] * v[1] * k + v[0], c + v[2] * v[2] * k]
        ];
    }
    const apply3 = (m, v) => [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];

    // ── reading a model ───────────────────────────────────────────────────
    const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
    const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

    /**
     * A GLB's first skinned mesh (its primitives showing one picture merged):
     * { positions, uvs, index, joints, weights, bones: [{ name, parent, head }],
     * image: { mime, bytes }, roughness, metalness } in meters, facing +z,
     * or null when it holds no skinned, textured mesh.
     */
    function readModel(bytes) {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        if (u8.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) return null;
        const jsonLength = dv.getUint32(12, true);
        const json = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jsonLength)));
        let bin = null;
        const at = 20 + jsonLength;
        if (at + 8 <= u8.byteLength) bin = u8.subarray(at + 8, at + 8 + dv.getUint32(at, true));
        if (!bin) return null;
        const accessor = i => {
            const a = json.accessors[i], view = json.bufferViews[a.bufferView], Type = COMPONENT[a.componentType], n = WIDTH[a.type];
            const start = (view.byteOffset || 0) + (a.byteOffset || 0), size = Type.BYTES_PER_ELEMENT * n, stride = view.byteStride || size;
            const out = new Type(a.count * n);
            const src = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
            const get = Type === Float32Array ? o => src.getFloat32(o, true) : Type === Uint8Array ? o => src.getUint8(o) : Type === Int8Array ? o => src.getInt8(o)
                : Type === Uint16Array ? o => src.getUint16(o, true) : Type === Int16Array ? o => src.getInt16(o, true) : o => src.getUint32(o, true);
            for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = get(start + k * stride + c * Type.BYTES_PER_ELEMENT);
            if (a.normalized && Type !== Float32Array) { const m = Type === Uint8Array ? 255 : Type === Uint16Array ? 65535 : Type === Int16Array ? 32767 : 127; return Float32Array.from(out, x => x / m); }
            return out;
        };
        const skinNode = (json.nodes || []).find(n => n.mesh != null && n.skin != null);
        if (!skinNode) return null;
        const mesh = json.meshes[skinNode.mesh], skin = json.skins[skinNode.skin];
        const imageOf = prim => {
            const mat = prim.material != null ? json.materials[prim.material] : null;
            const tex = mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture;
            return tex ? json.textures[tex.index].source : -1;
        };
        const prims = mesh.primitives.filter(p => p.attributes.POSITION != null && p.attributes.TEXCOORD_0 != null && p.attributes.JOINTS_0 != null && imageOf(p) >= 0);
        if (!prims.length) return null;
        const image = imageOf(prims[0]);
        const used = prims.filter(p => imageOf(p) === image);
        const positions = [], uvs = [], index = [], joints = [], weights = [];
        for (const p of used) {
            const base = positions.length / 3;
            const P = accessor(p.attributes.POSITION), U = accessor(p.attributes.TEXCOORD_0), J = accessor(p.attributes.JOINTS_0), W = accessor(p.attributes.WEIGHTS_0);
            for (let i = 0; i < P.length; i++) positions.push(P[i]);
            for (let i = 0; i < U.length; i++) uvs.push(U[i]);
            for (let i = 0; i < J.length; i++) { joints.push(J[i]); weights.push(W[i]); }
            const I = p.indices != null ? accessor(p.indices) : Uint32Array.from({ length: P.length / 3 }, (_, i) => i);
            for (let i = 0; i < I.length; i++) index.push(I[i] + base);
        }
        // Each joint's bind position: the translation of its inverse bind matrix's inverse.
        const ibm = accessor(skin.inverseBindMatrices);
        const parentOf = new Map();
        (json.nodes || []).forEach((n, i) => (n.children || []).forEach(c => parentOf.set(c, i)));
        const bones = skin.joints.map((node, k) => {
            const m = ibm.subarray(k * 16, k * 16 + 16);
            const r = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]], t = [m[12], m[13], m[14]];
            const det = r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0]) + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]);
            const inv = [
                [(r[1][1] * r[2][2] - r[1][2] * r[2][1]) / det, -(r[0][1] * r[2][2] - r[0][2] * r[2][1]) / det, (r[0][1] * r[1][2] - r[0][2] * r[1][1]) / det],
                [-(r[1][0] * r[2][2] - r[1][2] * r[2][0]) / det, (r[0][0] * r[2][2] - r[0][2] * r[2][0]) / det, -(r[0][0] * r[1][2] - r[0][2] * r[1][0]) / det],
                [(r[1][0] * r[2][1] - r[1][1] * r[2][0]) / det, -(r[0][0] * r[2][1] - r[0][1] * r[2][0]) / det, (r[0][0] * r[1][1] - r[0][1] * r[1][0]) / det]
            ];
            return { name: json.nodes[node].name || 'Joint' + k, parent: skin.joints.indexOf(parentOf.get(node)), head: apply3(inv, t).map(x => -x) };
        });
        const img = json.images[image];
        const iv = json.bufferViews[img.bufferView];
        const mat = json.materials[used[0].material] || {};
        const pbr = mat.pbrMetallicRoughness || {};
        const model = {
            positions: Float32Array.from(positions), uvs: Float32Array.from(uvs), index: Uint32Array.from(index),
            joints: Uint16Array.from(joints), weights: Float32Array.from(weights), bones,
            image: { mime: img.mimeType || 'image/png', bytes: bin.slice((iv.byteOffset || 0), (iv.byteOffset || 0) + iv.byteLength) },
            roughness: pbr.roughnessFactor ?? 1, metalness: pbr.metallicFactor ?? (pbr.metallicRoughnessTexture ? 1 : 0)
        };
        return normalizeModel(model);
    }

    /** A model in meters, standing on y = 0 and facing +z, its left at +x. */
    function normalizeModel(m) {
        const P = m.positions, n = P.length / 3;
        let lo = Infinity, hi = -Infinity;
        for (let i = 1; i < P.length; i += 3) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); }
        // Centimeters or millimeters read as meters.
        const tall = hi - lo, k = tall > 300 ? 0.001 : tall > 3 ? 0.01 : 1;
        const roles = roleMap(m.bones);
        const find = role => m.bones.findIndex((b, i) => roles[i] === role);
        const toe = find('LeftToeBase'), foot = find('LeftFoot'), armL = find('LeftArm'), armR = find('RightArm');
        let flip = false, mirror = false;
        if (toe >= 0 && foot >= 0 && m.bones[toe].head[2] < m.bones[foot].head[2]) flip = true;
        if (armL >= 0 && armR >= 0 && (m.bones[armL].head[0] - m.bones[armR].head[0]) * (flip ? -1 : 1) < 0) mirror = true;
        const map = p => {
            let x = p[0] * k, y = (p[1] - lo) * k, z = p[2] * k;
            if (flip) { x = -x; z = -z; }
            if (mirror) x = -x;
            return [x, y, z];
        };
        for (let i = 0; i < n; i++) { const q = map([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]); P[i * 3] = q[0]; P[i * 3 + 1] = q[1]; P[i * 3 + 2] = q[2]; }
        if (mirror) for (let t = 0; t < m.index.length; t += 3) { const s = m.index[t + 1]; m.index[t + 1] = m.index[t + 2]; m.index[t + 2] = s; }
        for (const b of m.bones) b.head = map(b.head);
        m.roles = roles;
        return m;
    }

    // ── skeletons ─────────────────────────────────────────────────────────
    const LIMB = ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase'];
    /**
     * Each joint's part of the humanoid, by its name (Mixamo's and the common
     * variants) or else its parent's: Hips, Spine (any spine joint), Neck,
     * Head, Left/Right + Shoulder, Arm, ForeArm, Hand, UpLeg, Leg, Foot,
     * ToeBase; null for joints outside the humanoid (a cape's, a tail's).
     */
    function roleMap(bones) {
        const roles = bones.map(b => {
            const n = String(b.name).replace(/^.*[:|]/, '').replace(/^mixamorig/i, '').replace(/[_\s.\-]/g, '').toLowerCase();
            if (/^(hips|pelvis|hip|root)$/.test(n)) return 'Hips';
            if (/^(spine\d*|chest|upperchest)$/.test(n)) return 'Spine';
            if (/^neck\d*$/.test(n)) return 'Neck';
            if (/^head/.test(n)) return 'Head';
            const side = /^(left|l)(?=[a-z])/.test(n) ? 'Left' : /^(right|r)(?=[a-z])/.test(n) ? 'Right' : null;
            if (!side) return undefined;
            const rest = n.replace(/^(left|right|l|r)/, '');
            if (/^(shoulder|clavicle|collar)/.test(rest)) return side + 'Shoulder';
            if (/^(forearm|lowerarm|elbow)/.test(rest)) return side + 'ForeArm';
            if (/^(arm|upperarm)/.test(rest)) return side + 'Arm';
            if (/^(hand|wrist|thumb|index|middle|ring|pinky|finger)/.test(rest)) return side + 'Hand';
            if (/^(upleg|thigh|upperleg)/.test(rest)) return side + 'UpLeg';
            if (/^(leg|calf|shin|lowerleg|knee)/.test(rest)) return side + 'Leg';
            if (/^(foot|ankle)/.test(rest)) return side + 'Foot';
            if (/^(toe)/.test(rest)) return side + 'ToeBase';
            return undefined;
        });
        // Unnamed joints take their parent's part; a hand's or foot's end joints are the hand or toe.
        for (let pass = 0; pass < bones.length; pass++) {
            let changed = false;
            bones.forEach((b, i) => { if (roles[i] === undefined && b.parent >= 0 && roles[b.parent] !== undefined) { roles[i] = roles[b.parent]; changed = true; } });
            if (!changed) break;
        }
        return roles.map(r => (r === undefined ? null : r));
    }

    /** A joint's part of the humanoid on the builder's own skeleton. */
    function ownRole(name) {
        if (/^Spine/.test(name)) return 'Spine';
        const m = /^(Left|Right)(Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot|ToeBase)/.exec(name);
        if (m) return m[1] + m[2];
        return name;
    }

    /**
     * Landmarks of a skeleton (or of the builder's bones), by part: the first
     * joint of each part (the top of a limb segment), the end of each limb
     * (the mean of its farthest vertices), the pelvis and the shoulder line.
     */
    function landmarks(heads, roles, P, J, W, n, symmetric) {
        const first = {};
        heads.forEach((h, i) => { const r = roles[i]; if (r && !first[r]) first[r] = h; });
        // A limb's far end: the vertices mostly on its last part, the farthest few from its joint.
        const ends = {};
        for (const side of ['Left', 'Right']) for (const [part, from] of [['Hand', 'Hand'], ['ToeBase', 'ToeBase'], ['Head', 'Head']]) {
            const role = part === 'Head' ? 'Head' : side + part;
            if (part === 'Head' && side === 'Right') continue;
            const start = first[role];
            if (!start) continue;
            const pts = [];
            for (let v = 0; v < n; v++) {
                let w = 0;
                for (let k = 0; k < 4; k++) if (roles[J[v * 4 + k]] === role) w += W[v * 4 + k];
                if (w > 0.6) pts.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
            }
            if (!pts.length) continue;
            pts.sort((a, b) => len(sub(b, start)) - len(sub(a, start)));
            const far = pts.slice(0, Math.max(1, Math.ceil(pts.length * 0.05)));
            ends[role] = mul(far.reduce(add, [0, 0, 0]), 1 / far.length);
            void from;
        }
        // Each foot's heel: the back of its lowest vertices, on the floor.
        for (const side of ['Left', 'Right']) {
            const pts = [];
            for (let v = 0; v < n; v++) {
                let w = 0;
                for (let k = 0; k < 4; k++) { const r = roles[J[v * 4 + k]]; if (r === side + 'Foot' || r === side + 'ToeBase') w += W[v * 4 + k]; }
                if (w > 0.6) pts.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
            }
            if (!pts.length) continue;
            pts.sort((a, b) => a[1] - b[1]);
            const low = pts.slice(0, Math.max(1, Math.ceil(pts.length * 0.25)));
            low.sort((a, b) => a[2] - b[2]);
            const back = low.slice(0, Math.max(1, Math.ceil(low.length * 0.1)));
            const h = mul(back.reduce(add, [0, 0, 0]), 1 / back.length);
            ends[side + 'Heel'] = [h[0], 0, h[2]];
        }
        const L = Object.assign({}, first);
        if (symmetric) {
            // A rest pose is symmetric: each left landmark and the mirror of its right one averaged, about the trunk's middle.
            const cs = [first.Hips, first.Spine, first.Neck, first.Head].filter(Boolean);
            const cx = cs.length ? cs.reduce((a, p) => a + p[0], 0) / cs.length : 0;
            const pair = (a, b) => { if (!a || !b) return [a, b]; const m = [(a[0] - cx + (cx - b[0])) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; return [[cx + m[0], m[1], m[2]], [cx - m[0], m[1], m[2]]]; };
            for (const part of LIMB) [L['Left' + part], L['Right' + part]] = pair(L['Left' + part], L['Right' + part]);
            for (const part of ['Hand', 'ToeBase', 'Heel']) [ends['Left' + part], ends['Right' + part]] = pair(ends['Left' + part], ends['Right' + part]);
        }
        L.pelvis = L.LeftUpLeg && L.RightUpLeg ? mid(L.LeftUpLeg, L.RightUpLeg) : first.Hips;
        L.chest = L.LeftArm && L.RightArm ? mid(L.LeftArm, L.RightArm) : null;
        L.ends = ends;
        return L;
    }

    /**
     * Per builder bone, the move that lays the body on the model's skeleton:
     * { from: our joint, to: theirs, m: a 3x3 matrix (turn and stretch along
     * the bone) }. The trunk is one move from the pelvis to the shoulder
     * line; each limb bone turns and stretches onto the model's.
     */
    function skeletonMoves(ours, theirs, options) {
        options = options || {};
        const moves = {};
        const along = (a0, a1, b0, b1, radial) => {
            const da = sub(a1, a0), db = sub(b1, b0), la = len(da) || 1e-6, lb = len(db) || 1e-6;
            const R = turn(unit(da), unit(db)), s = lb / la, d = unit(db), q = radial ?? 1;
            // Stretch along the model's bone by s, across it by q, after the turn.
            const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] = (i === j ? q : 0) + (s - q) * d[i] * d[j];
            const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) m[i][j] += S[i][k] * R[k][j];
            return { from: a0, to: b0, m };
        };
        // The trunk: pelvis to shoulder line, as wide as the model's shoulders are apart.
        const wide = ours.LeftArm && theirs.LeftArm ? len(sub(theirs.LeftArm, theirs.RightArm)) / (len(sub(ours.LeftArm, ours.RightArm)) || 1) : 1;
        const trunk = along(ours.pelvis, ours.chest, theirs.pelvis, theirs.chest, options.wide ? Math.sqrt(wide) : 1);
        moves.Hips = moves.Spine = trunk;
        // Neck and head go with the trunk: rigs place their neck and head joints differently.
        moves.Neck = moves.Head = trunk;
        for (const side of ['Left', 'Right']) {
            const o = r => ours[side + r], t = r => theirs[side + r];
            // The collarbone: from where the trunk takes it to the model's shoulder joint.
            if (o('Shoulder') && o('Arm') && t('Arm')) moves[side + 'Shoulder'] = along(o('Shoulder'), o('Arm'), apply(trunk, o('Shoulder')), t('Arm'));
            else moves[side + 'Shoulder'] = trunk;
            // The foot flat on the floor: turned about the vertical and sized heel to toe, its heel on the model's;
            // the shin then ends where that puts the ankle, inside the model's boot.
            const ho = ours.ends[side + 'Heel'], ht = theirs.ends[side + 'Heel'], to = ours.ends[side + 'ToeBase'], tt = theirs.ends[side + 'ToeBase'];
            let foot = null, ankle = t('Foot');
            if (ho && ht && to && tt && o('Foot') && !options.footJoints) {
                const a = [to[0] - ho[0], 0, to[2] - ho[2]], b = [tt[0] - ht[0], 0, tt[2] - ht[2]];
                const k = (len(b) || 1) / (len(a) || 1), R = turn(unit(a), unit(b));
                foot = { from: ho, to: ht, m: R.map(row => row.map(x => x * k)) };
                ankle = apply(foot, o('Foot'));
            }
            const tt2 = r => (r === 'Foot' ? ankle : t(r));
            const chain = [['Arm', 'ForeArm', 'Shoulder'], ['ForeArm', 'Hand', 'Arm'], ['UpLeg', 'Leg', null], ['Leg', 'Foot', 'UpLeg'], ['Foot', 'ToeBase', 'Leg']];
            for (const [part, end, prev] of chain) {
                if (o(part) && o(end) && tt2(part) && tt2(end)) moves[side + part] = along(o(part), o(end), tt2(part), tt2(end));
                else moves[side + part] = prev ? moves[side + prev] : trunk;
            }
            if (foot) moves[side + 'Foot'] = foot;
            for (const [part, prev] of [['Hand', 'ForeArm'], ['ToeBase', 'Foot']]) {
                if (part === 'ToeBase' && foot) { moves[side + 'ToeBase'] = foot; continue; }
                const role = side + part, a0 = o(part), b0 = t(part);
                const a1 = ours.ends[role], b1 = theirs.ends[role];
                moves[role] = a0 && b0 && a1 && b1 ? along(a0, a1, b0, b1) : moves[side + prev];
            }
        }
        return moves;
    }
    const apply = (mv, p) => (p ? add(mv.to, apply3(mv.m, sub(p, mv.from))) : null);

    // ── re-posing the model ───────────────────────────────────────────────
    /**
     * The model re-posed into the builder's rest pose by its own skin: each
     * limb bone turned (about its joint, its length kept) to point the way
     * the builder's bone does, the trunk, neck and head left as they are.
     * Returns a copy with moved positions and joints; the cloth then lies on
     * the builder's body as it was made, not stretched across two poses.
     */
    function repose(model, ours) {
        const L = landmarks(model.bones.map(b => b.head), model.roles, model.positions, model.joints, model.weights, model.positions.length / 3, true);
        const moves = {};
        const still = { from: [0, 0, 0], to: [0, 0, 0], m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
        for (const r of ['Hips', 'Spine', 'Neck', 'Head']) moves[r] = still;
        const turnAbout = (pivotOld, pivotNew, a0, a1, b0, b1) => {
            const da = sub(a1, a0), db = sub(b1, b0);
            if (len(da) < 1e-6 || len(db) < 1e-6) return { from: pivotOld, to: pivotNew, m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
            return { from: pivotOld, to: pivotNew, m: turn(unit(da), unit(db)) };
        };
        for (const side of ['Left', 'Right']) {
            const t = r => L[side + r], o = r => ours[side + r];
            // Each bone turns from where its parent's turn left it.
            const chain = [['Shoulder', 'Arm'], ['Arm', 'ForeArm'], ['ForeArm', 'Hand']];
            let at = t('Shoulder') ? t('Shoulder') : null, parent = still;
            for (const [part, end] of chain) {
                if (!t(part) || !t(end) || !o(part) || !o(end)) { moves[side + part] = parent; continue; }
                const start = apply(parent, t(part));
                const mv = turnAbout(t(part), start, t(part), t(end), o(part), o(end));
                moves[side + part] = mv; parent = mv; at = start;
            }
            const hEnd = L.ends[side + 'Hand'], oEnd = ours.ends[side + 'Hand'];
            moves[side + 'Hand'] = t('Hand') && hEnd && o('Hand') && oEnd ? turnAbout(t('Hand'), apply(parent, t('Hand')), t('Hand'), hEnd, o('Hand'), oEnd) : parent;
            parent = still;
            for (const [part, end] of [['UpLeg', 'Leg'], ['Leg', 'Foot']]) {
                if (!t(part) || !t(end) || !o(part) || !o(end)) { moves[side + part] = parent; continue; }
                const mv = turnAbout(t(part), apply(parent, t(part)), t(part), t(end), o(part), o(end));
                moves[side + part] = mv; parent = mv;
            }
            // A rig's shin angle is not its shoe's sole angle. Carry the ankle with the shin,
            // but preserve the source sole's pitch; only align its plan direction with our foot.
            // Applying the shin's pitch here turns flat armored boots into raised toe caps.
            const heel = L.ends[side + 'Heel'], tip = L.ends[side + 'ToeBase'];
            const ownHeel = ours.ends[side + 'Heel'], ownTip = ours.ends[side + 'ToeBase'];
            const flat = (a, b) => [b[0] - a[0], 0, b[2] - a[2]];
            const b = ownHeel && ownTip ? flat(ownHeel, ownTip) : o('Foot') && o('ToeBase') ? flat(o('Foot'), o('ToeBase')) : null;
            // Toe-less source rigs have no reliable foot heading; retain their source heading and sole.
            const a = heel && tip ? flat(heel, tip) : t('Foot') && t('ToeBase') ? flat(t('Foot'), t('ToeBase')) : b;
            moves[side + 'Foot'] = moves[side + 'ToeBase'] = t('Foot') && a && b && len(a) > 1e-6 && len(b) > 1e-6
                ? { from: t('Foot'), to: apply(parent, t('Foot')), m: turn(unit(a), unit(b)) } : parent;
            void at;
        }
        const P = model.positions, n = P.length / 3, out = new Float32Array(P.length);
        const mvOf = model.bones.map((b, j) => moves[model.roles[j]] || still);
        for (let v = 0; v < n; v++) {
            const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
            let x = 0, y = 0, z = 0, ws = 0;
            for (let k = 0; k < 4; k++) {
                const w = model.weights[v * 4 + k];
                if (w <= 0) continue;
                const q = apply(mvOf[model.joints[v * 4 + k]], p);
                x += q[0] * w; y += q[1] * w; z += q[2] * w; ws += w;
            }
            if (ws <= 0) { out.set(p, v * 3); continue; }
            out[v * 3] = x / ws; out[v * 3 + 1] = y / ws; out[v * 3 + 2] = z / ws;
        }
        // Back on the floor: the legs turned may have lifted or sunk the feet.
        let lo = Infinity;
        for (let i = 1; i < out.length; i += 3) lo = Math.min(lo, out[i]);
        for (let i = 1; i < out.length; i += 3) out[i] -= lo;
        const bones = model.bones.map((b, j) => { const q = apply(mvOf[j], b.head); return Object.assign({}, b, { head: [q[0], q[1] - lo, q[2]] }); });
        return Object.assign({}, model, { positions: out, bones });
    }

    // ── surfaces ──────────────────────────────────────────────────────────
    /** The faces of a pack surface as triples of pack vertices. */
    function packFaces(surface) {
        const s = surface.source, I = surface.index, out = new Uint32Array(I.length);
        for (let i = 0; i < I.length; i++) out[i] = s[I[i]];
        return out;
    }

    /**
     * The surfaces garments are bound to: the tights helper (trunk, arms,
     * legs), the skin where the tights do not reach (hands, feet, neck and
     * head), the skirt helper. Faces as pack vertex triples, by surface.
     */
    function bindSurfaces(pack) {
        if (pack._transferSurfaces) return pack._transferSurfaces;
        const tights = packFaces(pack.helpers.tights), skirt = packFaces(pack.helpers.skirt), body = packFaces(pack.body);
        // Skin the tights lie over: what their binding rides on.
        const bind = Outfit.binding(pack, 'tights');
        const under = new Uint8Array(pack.vertexCount);
        for (let i = 0; i < bind.tri.length; i++) under[bind.tri[i]] = 1;
        // Grown by two rings, so the tights' edges overlap the skin a little.
        const ring = new Map();
        for (let t = 0; t < body.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = body[t + k], b = body[t + (k + 1) % 3];
            if (!ring.has(a)) ring.set(a, []);
            ring.get(a).push(b);
        }
        let grown = under;
        for (let r = 0; r < 2; r++) {
            const next = Uint8Array.from(grown);
            for (const [a, list] of ring) if (grown[a]) for (const b of list) next[b] = 1;
            grown = next;
        }
        // Bare skin, bound directly: only where the tights do not reach at all (hands, feet, the neck and head),
        // never a patch inside them where their coarse binding happens to miss a vertex.
        let reach = grown;
        for (let r = 0; r < 4; r++) {
            const next = Uint8Array.from(reach);
            for (const [a, list] of ring) if (reach[a]) for (const b of list) next[b] = 1;
            reach = next;
        }
        const an = Outfit.anatomy(pack);
        const beyond = v => !reach[v] || (an.member[v * 5 + 1] > 0.5 && an.s[v * 5 + 1] > 2.9) || (an.member[v * 5 + 2] > 0.5 && an.s[v * 5 + 2] > 2.9)
            || (an.member[v * 5 + 3] > 0.5 && an.s[v * 5 + 3] > 1.95) || (an.member[v * 5 + 4] > 0.5 && an.s[v * 5 + 4] > 1.95) || (an.member[v * 5] > 0.5 && an.s[v * 5] > 4.2);
        const bare = [];
        for (let t = 0; t < body.length; t += 3) if (beyond(body[t]) || beyond(body[t + 1]) || beyond(body[t + 2])) bare.push(body[t], body[t + 1], body[t + 2]);
        return (pack._transferSurfaces = { tights, skirt, skin: Uint32Array.from(bare), body });
    }

    /** Every pack vertex's position on a body: the skin as given, the tights and skirt laid on it. */
    function surfacePositions(pack, shaped, cache) {
        const key = 'transfer:surfaces';
        if (cache && cache[key]) return cache[key];
        const fake = { shaped };
        const P = Float32Array.from(shaped);
        for (const name of ['tights', 'skirt']) {
            const laid = Outfit.boundPositions(pack, fake, name, {});
            for (const v of new Set(pack.helpers[name].source)) { P[v * 3] = laid[v * 3]; P[v * 3 + 1] = laid[v * 3 + 1]; P[v * 3 + 2] = laid[v * 3 + 2]; }
        }
        if (cache) cache[key] = P;
        return P;
    }

    /** Smooth vertex normals over a set of faces (each pack vertex on one surface), relaxed `passes` times. */
    function faceNormals(P, faces, count, passes) {
        const N = new Float32Array(count * 3);
        for (let t = 0; t < faces.length; t += 3) {
            const a = faces[t] * 3, b = faces[t + 1] * 3, c = faces[t + 2] * 3;
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
            const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for (const s of [a, b, c]) { N[s] += nx; N[s + 1] += ny; N[s + 2] += nz; }
        }
        const norm = () => { for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]); if (l > 0) { N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; } } };
        norm();
        if (passes) {
            const nb = neighborLists(faces, count);
            let a = N, b = new Float32Array(N.length);
            for (let p = 0; p < passes; p++) {
                for (let v = 0; v < count; v++) {
                    const list = nb[v];
                    if (!list) { b[v * 3] = a[v * 3]; b[v * 3 + 1] = a[v * 3 + 1]; b[v * 3 + 2] = a[v * 3 + 2]; continue; }
                    let x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2];
                    for (const u of list) { x += a[u * 3]; y += a[u * 3 + 1]; z += a[u * 3 + 2]; }
                    const l = Math.hypot(x, y, z) || 1;
                    b[v * 3] = x / l; b[v * 3 + 1] = y / l; b[v * 3 + 2] = z / l;
                }
                const s = a; a = b; b = s;
            }
            return a;
        }
        return N;
    }

    function neighborLists(faces, count) {
        const sets = new Array(count);
        for (let t = 0; t < faces.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = faces[t + k];
            const s = sets[a] || (sets[a] = new Set());
            s.add(faces[t + (k + 1) % 3]); s.add(faces[t + (k + 2) % 3]);
        }
        return sets.map(s => (s ? [...s] : null));
    }

    /** All binding faces with their surface (0 tights, 1 skin, 2 skirt). */
    function allFaces(pack) {
        const S = bindSurfaces(pack);
        if (S.all) return S;
        const total = S.tights.length + S.skin.length + S.skirt.length;
        S.all = new Uint32Array(total);
        S.all.set(S.tights, 0); S.all.set(S.skin, S.tights.length); S.all.set(S.skirt, S.tights.length + S.skin.length);
        S.kind = new Uint8Array(total / 3);
        S.kind.fill(1, S.tights.length / 3, (S.tights.length + S.skin.length) / 3);
        S.kind.fill(2, (S.tights.length + S.skin.length) / 3);
        return S;
    }

    /** A source part's chain: 0 trunk, 1 left arm, 2 right arm, 3 left leg, 4 right leg. */
    function familyOfRole(role) {
        const r = role || '';
        if (/^Left(Shoulder|Arm|ForeArm|Hand)$/.test(r)) return 1;
        if (/^Right(Shoulder|Arm|ForeArm|Hand)$/.test(r)) return 2;
        if (/^Left(UpLeg|Leg|Foot|ToeBase)$/.test(r)) return 3;
        if (/^Right(UpLeg|Leg|Foot|ToeBase)$/.test(r)) return 4;
        return 0;
    }

    /** Each binding face's chain: the one most of its corners belong to (by the skin weights). */
    function faceFamilies(pack, F) {
        if (F.family) return F.family;
        const an = Outfit.anatomy(pack), out = new Uint8Array(F.all.length / 3);
        for (let t = 0; t < out.length; t++) {
            const m = [0, 0, 0, 0, 0];
            for (let k = 0; k < 3; k++) { const v = F.all[t * 3 + k]; for (let f = 0; f < 5; f++) m[f] += an.member[v * 5 + f]; }
            let best = 0;
            for (let f = 1; f < 5; f++) if (m[f] > m[best]) best = f;
            // The shoulders and hips are the trunk's as much as the limb's.
            out[t] = m[best] > m[0] * 1.5 ? best : 0;
        }
        return (F.family = out);
    }

    // ── triangle queries ──────────────────────────────────────────────────
    /** A grid over triangles (by their bounds) for nearest-point and ray queries. */
    function triangleGrid(P, faces, cell, pick) {
        const map = new Map(), key = (x, y, z) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
        for (let t = 0; t < faces.length; t += 3) {
            if (pick && !pick(t / 3)) continue;
            let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
            for (let k = 0; k < 3; k++) {
                const v = faces[t + k] * 3;
                x0 = Math.min(x0, P[v]); x1 = Math.max(x1, P[v]); y0 = Math.min(y0, P[v + 1]); y1 = Math.max(y1, P[v + 1]); z0 = Math.min(z0, P[v + 2]); z1 = Math.max(z1, P[v + 2]);
            }
            for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) for (let k = Math.floor(z0 / cell); k <= Math.floor(z1 / cell); k++) {
                const h = key(i, j, k);
                let list = map.get(h);
                if (!list) map.set(h, list = []);
                list.push(t / 3);
            }
        }
        return { map, cell, key, P, faces };
    }

    /** The closest point of triangle abc to p: { d2, bary }. */
    function closestOnTriangle(p, a, b, c) {
        const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
        const d1 = dot(ab, ap), d2 = dot(ac, ap);
        if (d1 <= 0 && d2 <= 0) return { bary: [1, 0, 0], q: a };
        const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
        if (d3 >= 0 && d4 <= d3) return { bary: [0, 1, 0], q: b };
        const vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return { bary: [1 - v, v, 0], q: add(a, mul(ab, v)) }; }
        const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
        if (d6 >= 0 && d5 <= d6) return { bary: [0, 0, 1], q: c };
        const vb = d5 * d2 - d1 * d6;
        if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return { bary: [1 - w, 0, w], q: add(a, mul(ac, w)) }; }
        const va = d3 * d6 - d5 * d4;
        if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return { bary: [0, 1 - w, w], q: add(b, mul(sub(c, b), w)) }; }
        const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
        return { bary: [1 - v - w, v, w], q: add(a, add(mul(ab, v), mul(ac, w))) };
    }

    /** The nearest triangle of the grid to p (searching out to `reach` meters), or null. */
    function nearestTriangle(grid, p, reach, pick) {
        const { cell, map, key, P, faces } = grid;
        const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
        let best = null, bd = Infinity;
        const seen = new Set();
        const rings = Math.ceil(reach / cell);
        for (let r = 0; r <= rings; r++) {
            for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
                if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r) continue;
                const list = map.get(key(cx + i, cy + j, cz + k));
                if (!list) continue;
                for (const t of list) {
                    if (seen.has(t) || (pick && !pick(t))) continue;
                    seen.add(t);
                    const a = faces[t * 3] * 3, b = faces[t * 3 + 1] * 3, c = faces[t * 3 + 2] * 3;
                    const hit = closestOnTriangle(p, [P[a], P[a + 1], P[a + 2]], [P[b], P[b + 1], P[b + 2]], [P[c], P[c + 1], P[c + 2]]);
                    const d = (hit.q[0] - p[0]) ** 2 + (hit.q[1] - p[1]) ** 2 + (hit.q[2] - p[2]) ** 2;
                    if (d < bd) { bd = d; best = { t, bary: hit.bary, q: hit.q, d: Math.sqrt(d) }; }
                }
            }
            // Anything nearer than the next ring's inner edge is the nearest.
            if (best && best.d <= r * cell) break;
        }
        return best;
    }

    /** Hits of the ray o + s d (s in [lo, hi]) with the grid's triangles: [{ s, t }]. */
    function rayHits(grid, o, d, lo, hi) {
        const { cell, map, key, P, faces } = grid;
        const out = [], seen = new Set();
        const steps = Math.ceil((hi - lo) / (cell * 0.5)) + 1;
        for (let k = 0; k <= steps; k++) {
            const s = lo + (hi - lo) * k / steps;
            const x = o[0] + d[0] * s, y = o[1] + d[1] * s, z = o[2] + d[2] * s;
            const list = map.get(key(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)));
            if (!list) continue;
            for (const t of list) {
                if (seen.has(t)) continue;
                seen.add(t);
                const a = faces[t * 3] * 3, b = faces[t * 3 + 1] * 3, c = faces[t * 3 + 2] * 3;
                const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
                const pv = cross(d, e2), det = dot(e1, pv);
                if (Math.abs(det) < 1e-12) continue;
                const tv = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]];
                const u = dot(tv, pv) / det;
                if (u < 0 || u > 1) continue;
                const qv = cross(tv, e1), v = dot(d, qv) / det;
                if (v < 0 || u + v > 1) continue;
                const sHit = dot(e2, qv) / det;
                if (sHit < lo || sHit > hi) continue;
                const n = cross(e1, e2);
                out.push({ s: sHit, t, facing: dot(n, d) / (len(n) || 1) });
            }
        }
        return out;
    }

    // ── posing the body ───────────────────────────────────────────────────
    /** The body's vertices moved by per-bone moves, blended by its skin weights. */
    function poseBody(pack, P, bones, moves) {
        const out = new Float32Array(P.length), n = pack.vertexCount;
        const mv = bones.map(b => moves[ownRole(b.name)] || moves.Spine);
        for (let v = 0; v < n; v++) {
            const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
            let x = 0, y = 0, z = 0, wsum = 0;
            for (let k = 0; k < 4; k++) {
                const w = pack.skinWeights[v * 4 + k];
                if (w <= 0) continue;
                const q = apply(mv[pack.skinJoints[v * 4 + k]], p);
                x += q[0] * w; y += q[1] * w; z += q[2] * w; wsum += w;
            }
            if (wsum <= 0) { const q = apply(moves.Spine, p); x = q[0]; y = q[1]; z = q[2]; wsum = 1; }
            out[v * 3] = x / wsum; out[v * 3 + 1] = y / wsum; out[v * 3 + 2] = z / wsum;
        }
        return out;
    }

    /**
     * Draws the posed body in to the model's innermost clothes: for each bone,
     * the shift and swelling that best put its skin `gap` under the first
     * outward-facing layer of the model along each skin normal (outliers
     * left out), then a smooth local fit within `reach`. Mutates Q (body
     * vertices; helpers are laid again after).
     */
    function drawIn(pack, Q, model, keepFace, options) {
        const gap = options.gap ?? 0.004, reach = options.reach ?? 0.012, swell = options.swell ?? 0.02, outward = options.drawReach ?? 0.04;
        const grid = triangleGrid(model.positions, model.index, 0.02, keepFace);
        const ids = pack._bodyIdsTransfer || (pack._bodyIdsTransfer = [...new Set(pack.body.source)].sort((a, b) => a - b));
        const nb = 52;
        // Growth out along the skin over all rounds, held within swell + reach.
        const grown = new Float32Array(pack.vertexCount), most = swell + reach;
        const footBone = pack.bones.map(b => /(Foot|ToeBase)$/.test(ownRole(b.name)));
        for (let round = 0; round < 3; round++) {
            const N = Body.vertexNormals(pack, Q);
            const delta = new Float32Array(pack.vertexCount), has = new Uint8Array(pack.vertexCount);
            for (const v of ids) {
                const o = [Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2]], d = [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]];
                if (!d[0] && !d[1] && !d[2]) continue;
                let best = Infinity;
                for (const h of rayHits(grid, o, d, -0.06, outward)) if (h.facing > 0.15 && h.s < best) best = h.s;
                if (best < Infinity) { delta[v] = best - gap; has[v] = 1; }
            }
            // Per bone: shift (3) and swelling (1) by least squares, twice with outliers left out.
            const sol = new Float64Array(pack.bones.length * 4);
            const bonesOf = v => { const out = []; for (let k = 0; k < 4; k++) { const w = pack.skinWeights[v * 4 + k]; if (w > 0.05) out.push([pack.skinJoints[v * 4 + k], w]); } return out; };
            for (let pass = 0; pass < 2; pass++) {
                const A = Array.from({ length: pack.bones.length }, () => new Float64Array(16)), B = Array.from({ length: pack.bones.length }, () => new Float64Array(4));
                for (const v of ids) {
                    if (!has[v]) continue;
                    const nrm = [N[v * 3], N[v * 3 + 1], N[v * 3 + 2], 1];
                    for (const [j, w] of bonesOf(v)) {
                        const pred = sol[j * 4] * nrm[0] + sol[j * 4 + 1] * nrm[1] + sol[j * 4 + 2] * nrm[2] + sol[j * 4 + 3];
                        if (pass && Math.abs(delta[v] - pred) > 0.02) continue;
                        for (let a = 0; a < 4; a++) { B[j][a] += w * nrm[a] * delta[v]; for (let b = 0; b < 4; b++) A[j][a * 4 + b] += w * nrm[a] * nrm[b]; }
                    }
                }
                for (let j = 0; j < pack.bones.length; j++) {
                    const M = A[j], R = B[j];
                    // A little pull toward no move, so a bone with few hits stays put.
                    for (let a = 0; a < 4; a++) M[a * 4 + a] += nb * 0.02;
                    const x = solve4(M, R);
                    x[3] = Math.max(-0.08, Math.min(swell, x[3]));
                    const shift = Math.hypot(x[0], x[1], x[2]);
                    if (shift > 0.03) for (let a = 0; a < 3; a++) x[a] *= 0.03 / shift;
                    sol.set(x, j * 4);
                }
            }
            // Bones of one part move together: the mean of each part's solutions.
            const byRole = new Map();
            pack.bones.forEach((b, j) => { const r = ownRole(b.name); if (!byRole.has(r)) byRole.set(r, []); byRole.get(r).push(j); });
            const part = new Float64Array(sol.length);
            for (const list of byRole.values()) {
                const m = [0, 0, 0, 0];
                for (const j of list) for (let a = 0; a < 4; a++) m[a] += sol[j * 4 + a] / list.length;
                for (const j of list) part.set(m, j * 4);
            }
            const move = new Float32Array(pack.vertexCount * 3), local = new Float32Array(pack.vertexCount);
            for (const v of ids) {
                let x = 0, y = 0, z = 0, r = 0;
                for (let k = 0; k < 4; k++) {
                    const w = pack.skinWeights[v * 4 + k], j = pack.skinJoints[v * 4 + k];
                    if (w <= 0) continue;
                    x += part[j * 4] * w; y += part[j * 4 + 1] * w; z += part[j * 4 + 2] * w; r += part[j * 4 + 3] * w;
                }
                move[v * 3] = x + N[v * 3] * r; move[v * 3 + 1] = y + N[v * 3 + 1] * r; move[v * 3 + 2] = z + N[v * 3 + 2] * r;
                if (has[v]) local[v] = delta[v] - (x * N[v * 3] + y * N[v * 3 + 1] + z * N[v * 3 + 2] + r);
            }
            // The local fit: what is left, smoothed over the skin and held within reach.
            const weight = Float32Array.from(has);
            const smooth = relaxWeighted(pack, local, weight, 12);
            for (const v of ids) {
                // Feet keep where the heel-to-toe fit put them: a boot is no layer to draw a foot in to.
                let still = 0;
                for (let q = 0; q < 4; q++) if (footBone[pack.skinJoints[v * 4 + q]]) still += pack.skinWeights[v * 4 + q];
                if (still > 0) { const keep = 1 - Math.min(1, still * 1.5); move[v * 3] *= keep; move[v * 3 + 1] *= keep; move[v * 3 + 2] *= keep; smooth[v] *= keep; }
                let k = Math.max(-reach * 2, Math.min(reach, smooth[v])) * (round === 2 ? 1 : 0.7);
                const out = move[v * 3] * N[v * 3] + move[v * 3 + 1] * N[v * 3 + 1] + move[v * 3 + 2] * N[v * 3 + 2] + k;
                if (grown[v] + out > most) k -= grown[v] + out - most;
                grown[v] += move[v * 3] * N[v * 3] + move[v * 3 + 1] * N[v * 3 + 1] + move[v * 3 + 2] * N[v * 3 + 2] + k;
                Q[v * 3] += move[v * 3] + N[v * 3] * k; Q[v * 3 + 1] += move[v * 3 + 1] + N[v * 3 + 1] * k; Q[v * 3 + 2] += move[v * 3 + 2] + N[v * 3 + 2] * k;
            }
        }
        // Helpers and joints off the skin move with their nearest skin vertex.
        return Q;
    }

    /** A value over the skin averaged with its neighbors by weight, `passes` times; unweighted vertices take their neighbors'. */
    function relaxWeighted(pack, value, weight, passes) {
        const faces = bindSurfaces(pack).body;
        const nb = pack._skinNeighbors || (pack._skinNeighbors = neighborLists(faces, pack.vertexCount));
        let a = Float32Array.from(value, (x, i) => x * weight[i]), wa = Float32Array.from(weight);
        for (let p = 0; p < passes; p++) {
            const b = new Float32Array(a.length), wb = new Float32Array(a.length);
            for (let v = 0; v < a.length; v++) {
                const list = nb[v];
                if (!list) continue;
                let s = a[v] * 2, w = wa[v] * 2;
                for (const u of list) { s += a[u]; w += wa[u]; }
                const k = 1 / (list.length + 2);
                b[v] = s * k; wb[v] = w * k;
            }
            a = b; wa = wb;
        }
        return Float32Array.from(a, (x, i) => (wa[i] > 1e-6 ? x / wa[i] : 0));
    }

    function solve4(M, R) {
        const A = Array.from({ length: 4 }, (_, i) => [M[i * 4], M[i * 4 + 1], M[i * 4 + 2], M[i * 4 + 3], R[i]]);
        for (let c = 0; c < 4; c++) {
            let p = c;
            for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
            [A[c], A[p]] = [A[p], A[c]];
            const d = A[c][c] || 1e-12;
            for (let r = 0; r < 4; r++) {
                if (r === c) continue;
                const f = A[r][c] / d;
                for (let k = c; k < 5; k++) A[r][k] -= f * A[c][k];
            }
        }
        return [0, 1, 2, 3].map(i => A[i][4] / (A[i][i] || 1e-12));
    }

    // ── cutting the outfit out of the model ───────────────────────────────
    const toLinear = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

    /**
     * Which model vertices the outfit keeps: not the head; not the hands or
     * feet when `options.hands` / `options.feet` is false; not bare skin on
     * the hands and neck (texels in the head's own colors) when
     * `options.skin` is set.
     */
    function keepVertices(model, options, picture) {
        const n = model.positions.length / 3, roles = model.roles, J = model.joints, W = model.weights;
        const keep = new Uint8Array(n).fill(1);
        const share = (v, test) => { let w = 0; for (let k = 0; k < 4; k++) if (test(roles[J[v * 4 + k]] || '')) w += W[v * 4 + k]; return w; };
        const isHead = r => r === 'Head', isHand = r => /Hand$/.test(r), isFoot = r => /Foot$|ToeBase$/.test(r);
        const headTop = options.headCut ?? 0.75;
        for (let v = 0; v < n; v++) {
            if (share(v, isHead) > headTop) keep[v] = 0;
            else if (options.hands === false && share(v, isHand) > 0.5) keep[v] = 0;
            else if (options.feet === false && share(v, isFoot) > 0.5) keep[v] = 0;
        }
        if (options.skin && picture) {
            // The head's colors: its texels' mean and spread, in linear light.
            const texel = v => {
                const x = Math.min(picture.width - 1, Math.max(0, Math.floor(model.uvs[v * 2] * picture.width)));
                const y = Math.min(picture.height - 1, Math.max(0, Math.floor(model.uvs[v * 2 + 1] * picture.height)));
                const o = (y * picture.width + x) * 4;
                return [toLinear(picture.data[o]), toLinear(picture.data[o + 1]), toLinear(picture.data[o + 2])];
            };
            const tone = options.skin;
            const near = c => Math.hypot(c[0] - tone[0], c[1] - tone[1], c[2] - tone[2]) < (options.skinReach ?? 0.06);
            for (let v = 0; v < n; v++) {
                if (!keep[v]) continue;
                const where = share(v, r => isHand(r) || r === 'Neck' || isHead(r) || /ForeArm$/.test(r));
                if (where > 0.5 && near(texel(v))) keep[v] = 0;
            }
        }
        if (options.drop) for (let v = 0; v < n; v++) if (keep[v] && options.drop(model, v)) keep[v] = 0;
        return keep;
    }

    /** Vertices welded by position: each vertex's weld id, and the count. */
    function weld(P) {
        const n = P.length / 3, map = new Map(), id = new Int32Array(n);
        let count = 0;
        for (let i = 0; i < n; i++) {
            const k = Math.round(P[i * 3] * 1e5) + ',' + Math.round(P[i * 3 + 1] * 1e5) + ',' + Math.round(P[i * 3 + 2] * 1e5);
            let w = map.get(k);
            if (w === undefined) { w = count++; map.set(k, w); }
            id[i] = w;
        }
        return { id, count };
    }

    /**
     * The model's kept triangles as a mesh of its own: render vertices (each
     * with its picture coordinate) and the welded points they share.
     */
    function cutMesh(model, keep, minPiece) {
        const I = model.index, tris = [], w = weld(model.positions), faces = new Set(), P = model.positions;
        for (let t = 0; t < I.length; t += 3) {
            const a = I[t], b = I[t + 1], c = I[t + 2];
            if (!keep[a] || !keep[b] || !keep[c]) continue;
            const ids = [w.id[a], w.id[b], w.id[c]].sort((x, y) => x - y);
            if (ids[0] === ids[1] || ids[1] === ids[2]) continue;
            const key = ids.join(':');
            if (faces.has(key)) continue;
            const u = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
            const v = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
            if (len(cross(u, v)) < 1e-12) continue;
            faces.add(key); tris.push(a, b, c);
        }
        // Crumbs (a few triangles cut loose at the edge) left out.
        const parent = new Int32Array(w.count).map((_, i) => i);
        const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
        for (let t = 0; t < tris.length; t += 3) { const a = find(w.id[tris[t]]), b = find(w.id[tris[t + 1]]), c = find(w.id[tris[t + 2]]); parent[a] = b; parent[find(c)] = find(b); }
        const size = new Map();
        for (let t = 0; t < tris.length; t += 3) { const r = find(w.id[tris[t]]); size.set(r, (size.get(r) || 0) + 1); }
        const kept = [];
        for (let t = 0; t < tris.length; t += 3) if (size.get(find(w.id[tris[t]])) >= (minPiece ?? 24)) kept.push(tris[t], tris[t + 1], tris[t + 2]);
        const remap = new Int32Array(model.positions.length / 3).fill(-1), order = [];
        const index = new Uint32Array(kept.length);
        for (let i = 0; i < kept.length; i++) {
            let r = remap[kept[i]];
            if (r < 0) { r = remap[kept[i]] = order.length; order.push(kept[i]); }
            index[i] = r;
        }
        const n = order.length, positions = new Float32Array(n * 3), uvs = new Float32Array(n * 2), joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4);
        order.forEach((v, i) => {
            positions.set(model.positions.subarray(v * 3, v * 3 + 3), i * 3);
            uvs.set(model.uvs.subarray(v * 2, v * 2 + 2), i * 2);
            joints.set(model.joints.subarray(v * 4, v * 4 + 4), i * 4);
            weights.set(model.weights.subarray(v * 4, v * 4 + 4), i * 4);
        });
        return { positions, uvs, index, joints, weights, origin: Int32Array.from(order) };
    }

    // ── taking the outfit ─────────────────────────────────────────────────
    /**
     * The outfit of a model (readModel) for the builder's body. `options`:
     *   recipe     the body it is measured on (closest to the model's own
     *              build: a woman's for a woman's clothes)
     *   hands, feet  false to leave the model's hands or feet out
     *   skin       linear rgb of bare skin to leave out (hands, neck)
     *   gap, reach, swell  how the body is drawn in to the clothes
     *   parts      [{ id, test(info) }]: which garment each vertex is in
     *              (info: { role, s, y, surface }), the first that passes;
     *              the rest is the last part
     *   picture    the model's decoded picture ({ width, height, data })
     *   simplify   (positions, uvs, index, target) => { positions, uvs, index, origin }
     *   triangles  the most triangles the outfit keeps
     * Returns the outfit: its bound points, its parts (triangles, picture
     * coordinates, the skin each hides), each point's reach down a hanging
     * skirt (`hang`, -1 off it).
     */
    function transfer(pack, model, options) {
        const o = options || {};
        const recipe = Object.assign({}, Body.DEFAULT_RECIPE, o.recipe || {});
        const built = Body.build(pack, recipe);
        const ours = built.bones;
        const roleOurs = ours.map(b => ownRole(b.name));
        // Landmarks on both skeletons, the same way.
        const S = built.shaped;
        const Lo = landmarks(ours.map(b => b.head), roleOurs, S, pack.skinJoints, pack.skinWeights, pack.vertexCount);
        // The model in the builder's rest pose first, by its own skin.
        if (o.repose !== false) model = repose(model, Lo);
        const Lt = landmarks(model.bones.map(b => b.head), model.roles, model.positions, model.joints, model.weights, model.positions.length / 3, o.symmetric !== false);
        const moves = skeletonMoves(Lo, Lt, o);

        // The outfit's own mesh: the model cut, crumbs dropped, then made lighter.
        const keep = keepVertices(model, o, o.picture);
        let mesh = cutMesh(model, keep, o.minPiece);
        const lighten = o.simplify || (Simplify && Simplify.simplify);
        if (lighten && o.triangles && mesh.index.length / 3 > o.triangles) {
            const lighter = lighten(mesh.positions, mesh.uvs, mesh.index, o.triangles, { maxEdge: o.maxEdge ?? 0.06 });
            const keepFrom = lighter.origin;
            mesh = {
                positions: lighter.positions, uvs: lighter.uvs, index: lighter.index,
                joints: Uint16Array.from({ length: keepFrom.length * 4 }, (_, i) => mesh.joints[keepFrom[i >> 2] * 4 + (i & 3)]),
                weights: Float32Array.from({ length: keepFrom.length * 4 }, (_, i) => mesh.weights[keepFrom[i >> 2] * 4 + (i & 3)]),
                origin: Int32Array.from(keepFrom, v => mesh.origin[v])
            };
        }

        // The body posed and stretched onto the model, then drawn in to its clothes.
        let Q = poseBody(pack, S, ours, moves);
        const posedOnly = Float32Array.from(Q);
        // Drawn in to the clothes only: not to what is left of the head.
        const headish = new Uint8Array(mesh.positions.length / 3);
        for (let v = 0; v < headish.length; v++) { let hs = 0; for (let k = 0; k < 4; k++) if (model.roles[mesh.joints[v * 4 + k]] === 'Head') hs += mesh.weights[v * 4 + k]; headish[v] = hs > 0.4 ? 1 : 0; }
        const cutModel = { positions: mesh.positions, index: mesh.index };
        if (o.drawIn !== false) Q = drawIn(pack, Q, cutModel, t => !(headish[mesh.index[t * 3]] || headish[mesh.index[t * 3 + 1]] || headish[mesh.index[t * 3 + 2]]), o);
        const QS = surfacePositions(pack, Q, null);
        // The skirt as the pose lays it: drawing the legs in to the trousers under a robe must not bend the robe's hang.
        {
            const plain = surfacePositions(pack, posedOnly, null);
            for (const v of new Set(pack.helpers.skirt.source)) { QS[v * 3] = plain[v * 3]; QS[v * 3 + 1] = plain[v * 3 + 1]; QS[v * 3 + 2] = plain[v * 3 + 2]; }
        }
        const F = allFaces(pack);
        const NQ = faceNormals(QS, F.all, pack.vertexCount, 2);

        // Welded points: each rides the nearest point of the posed body's surfaces.
        const w = weld(mesh.positions);
        const count = w.count, point = new Float32Array(count * 3), pointRole = new Array(count);
        const rest = new Float32Array(count * 3);
        const back = skeletonMoves(Lt, Lo, { footJoints: true }), flatBack = skeletonMoves(Lt, Lo);
        for (let i = 0; i < mesh.positions.length / 3; i++) {
            point[w.id[i] * 3] = mesh.positions[i * 3]; point[w.id[i] * 3 + 1] = mesh.positions[i * 3 + 1]; point[w.id[i] * 3 + 2] = mesh.positions[i * 3 + 2];
            if (!pointRole[w.id[i]]) {
                let best = null, bw = 0;
                for (let k = 0; k < 4; k++) { const r = model.roles[mesh.joints[i * 4 + k]]; if (mesh.weights[i * 4 + k] > bw) { bw = mesh.weights[i * 4 + k]; best = r; } }
                pointRole[w.id[i]] = best || 'Spine';
            }
            const p = Array.from(mesh.positions.subarray(i * 3, i * 3 + 3));
            let total = 0;
            const q = [0, 0, 0];
            for (let k = 0; k < 4; k++) {
                const weight = mesh.weights[i * 4 + k];
                if (weight <= 0) continue;
                const role = model.roles[mesh.joints[i * 4 + k]];
                const mv = (/Foot$|ToeBase$/.test(role) ? flatBack[role] : back[role]) || back.Spine;
                const v = apply(mv, p);
                for (let c = 0; c < 3; c++) q[c] += v[c] * weight;
                total += weight;
            }
            for (let c = 0; c < 3; c++) rest[w.id[i] * 3 + c] = total > 0 ? q[c] / total : p[c];
        }
        // Loose cloth below the hips (a coat's tails, a robe's skirt) rides the skirt helper.
        const pointColor = new Float32Array(count * 3);
        if (o.picture) for (let r = 0; r < mesh.positions.length / 3; r++) {
            const pic = o.picture, x = Math.min(pic.width - 1, Math.max(0, Math.floor(mesh.uvs[r * 2] * pic.width))), y = Math.min(pic.height - 1, Math.max(0, Math.floor(mesh.uvs[r * 2 + 1] * pic.height))), q = (y * pic.width + x) * 4;
            pointColor[w.id[r] * 3] = toLinear(pic.data[q]); pointColor[w.id[r] * 3 + 1] = toLinear(pic.data[q + 1]); pointColor[w.id[r] * 3 + 2] = toLinear(pic.data[q + 2]);
        }
        const loose = looseCloth(pack, QS, F, point, count, mesh, w, Lt, o, pointRole);
        const grid = triangleGrid(QS, F.all, 0.03);
        const an0 = Outfit.anatomy(pack);
        // `headFree`: nothing rides the head (a high collar stands on the neck and shoulders, whatever head it was made round).
        const onHead = new Uint8Array(F.all.length / 3);
        if (o.headFree) for (let t = 0; t < onHead.length; t++) { let up = 0; for (let k = 0; k < 3; k++) if (an0.member[F.all[t * 3 + k] * 5] > 0.5 && an0.s[F.all[t * 3 + k] * 5] > 4.35) up++; onHead[t] = up >= 2 ? 1 : 0; }
        const famOfFace = faceFamilies(pack, F);
        const hipAxis = Lt.pelvis, faceBearing = new Float32Array(F.all.length / 3);
        for (let t = 0; t < faceBearing.length; t++) {
            if (F.kind[t] !== 2) continue;
            let x = 0, z = 0;
            for (let k = 0; k < 3; k++) { x += QS[F.all[t * 3 + k] * 3]; z += QS[F.all[t * 3 + k] * 3 + 2]; }
            faceBearing[t] = Math.atan2(x / 3 - hipAxis[0], z / 3 - hipAxis[2]);
        }
        /** A point's binding to the posed body: on the skirt (want 2) or the body's other surfaces. */
        const bindOne = (i, want) => {
            const p = [point[i * 3], point[i * 3 + 1], point[i * 3 + 2]], fam = familyOfRole(pointRole[i]);
            // A point rides its own limb or the trunk: never a hand hanging beside a coat's tails.
            // Skirt cloth rides the skirt at its own bearing round the hips, never the far side of it.
            const bearing = Math.atan2(p[0] - hipAxis[0], p[2] - hipAxis[2]);
            const fits = t => (want === 2 ? F.kind[t] === 2 && Math.abs(Math.atan2(Math.sin(faceBearing[t] - bearing), Math.cos(faceBearing[t] - bearing))) < 0.5
                : F.kind[t] !== 2 && !(o.headFree && onHead[t]) && (famOfFace[t] === fam || famOfFace[t] === 0 || (fam === 0 && famOfFace[t] >= 3)));
            let hit = nearestTriangle(grid, p, 0.6, fits);
            if (!hit) hit = nearestTriangle(grid, p, 0.6, t => (want === 2 ? F.kind[t] === 2 : F.kind[t] !== 2));
            if (!hit) return null;
            const a = F.all[hit.t * 3], b = F.all[hit.t * 3 + 1], c = F.all[hit.t * 3 + 2];
            const fr = frameAt(QS, NQ, a, b, c, hit.bary);
            const d = sub(p, fr.o);
            // Far off the trunk or the legs the offset is kept along the world's axes: a frame's turn would swing it.
            let far = 0;
            if (fam === 0 || fam >= 3 || want === 2) far = Math.max(0, Math.min(1, (len(d) - (o.farFrom ?? 0.015)) / 0.025));
            return { tri: [a, b, c], bary: hit.bary, offset: [dot(d, fr.n), dot(d, fr.u), dot(d, fr.v)], world: far > 0 ? d : [0, 0, 0], far: Math.round(far * 255), surface: F.kind[hit.t] };
        };
        const tri = new Uint16Array(count * 3), bary = new Float32Array(count * 3), offset = new Float32Array(count * 3), surface = new Uint8Array(count);
        const world = new Float32Array(count * 3), farness = new Uint8Array(count);
        const put = (i, r, T, B, D, Wd, Fr, S) => { if (!r) return; T.set(r.tri, i * 3); B.set(r.bary, i * 3); D.set(r.offset, i * 3); Wd.set(r.world, i * 3); Fr[i] = r.far; if (S) S[i] = r.surface; };
        // How far each point rides the skirt rather than the body: 1 on loose cloth, 0 elsewhere, eased across
        // a few rings where the two meet so that seam bends instead of tearing on a body far from this one.
        // The coat leaves the body for the skirt across the hips, by height, the same all round.
        const rampTop = Lt.pelvis[1] + 0.04, rampLow = Lt.pelvis[1] - 0.12;
        const mix = Float32Array.from(loose, (l, i) => l * Math.max(0, Math.min(1, (rampTop - point[i * 3 + 1]) / (rampTop - rampLow))));
        {
            const nb = new Array(count);
            for (let t = 0; t < mesh.index.length; t += 3) for (let k = 0; k < 3; k++) {
                const x = w.id[mesh.index[t + k]], y = w.id[mesh.index[t + (k + 1) % 3]];
                if (x !== y) { (nb[x] || (nb[x] = new Set())).add(y); (nb[y] || (nb[y] = new Set())).add(x); }
            }
            for (let pass = 0; pass < (o.blendRings ?? 3); pass++) {
                const next = Float32Array.from(mix);
                for (let i = 0; i < count; i++) {
                    if (!nb[i] || point[i * 3 + 1] > Lt.pelvis[1] + 0.12) continue;
                    let sum = mix[i];
                    for (const j of nb[i]) sum += mix[j];
                    next[i] = sum / (nb[i].size + 1);
                }
                mix.set(next);
            }
        }
        // Hanging panels follow one continuous hip-to-floor map across both legs.
        for (let i = 0; i < count; i++) {
            const f = mix[i];
            if (!f) continue;
            const q = [point[i * 3] - Lt.pelvis[0] + Lo.pelvis[0], point[i * 3 + 1] * Lo.pelvis[1] / Math.max(0.1, Lt.pelvis[1]), point[i * 3 + 2] - Lt.pelvis[2] + Lo.pelvis[2]];
            for (let c = 0; c < 3; c++) rest[i * 3 + c] += (q[c] - rest[i * 3 + c]) * f;
        }
        const blendIds = [], btri = new Uint16Array(count * 3), bbary = new Float32Array(count * 3), boff = new Float32Array(count * 3), bworld = new Float32Array(count * 3), bfar = new Uint8Array(count);
        for (let i = 0; i < count; i++) {
            if (mix[i] >= 0.99) { put(i, bindOne(i, 2), tri, bary, offset, world, farness, surface); continue; }
            put(i, bindOne(i, -1), tri, bary, offset, world, farness, surface);
            if (mix[i] > 0.01) { put(i, bindOne(i, 2), btri, bbary, boff, bworld, bfar, null); blendIds.push(i); }
        }

        // Each point's skin under it and its clearance above that skin, held on any body (a bulge never comes through).
        const skinTri = new Uint16Array(count * 3), skinBary = new Float32Array(count * 3), skinH = new Float32Array(count);
        {
            const skinFaces = bindSurfaces(pack).body, sg = triangleGrid(Q, skinFaces, 0.03), NS = Body.vertexNormals(pack, Q);
            const famOfSkin = new Uint8Array(skinFaces.length / 3);
            for (let t = 0; t < famOfSkin.length; t++) {
                const m = [0, 0, 0, 0, 0];
                for (let k = 0; k < 3; k++) { const v = skinFaces[t * 3 + k]; for (let f = 0; f < 5; f++) m[f] += an0.member[v * 5 + f]; }
                let best = 0; for (let f = 1; f < 5; f++) if (m[f] > m[best]) best = f;
                famOfSkin[t] = m[best] > m[0] * 1.5 ? best : 0;
            }
            for (let i = 0; i < count; i++) {
                // Only cloth riding the body alone: what eases onto the skirt hangs by its own rules.
                if (mix[i] > 0.01 || loose[i]) continue;
                const p = [point[i * 3], point[i * 3 + 1], point[i * 3 + 2]], fam = familyOfRole(pointRole[i]);
                const hit = nearestTriangle(sg, p, 0.3, t => famOfSkin[t] === fam || famOfSkin[t] === 0 || (fam === 0 && famOfSkin[t] >= 3)) || nearestTriangle(sg, p, 0.3);
                if (!hit) continue;
                const a = skinFaces[hit.t * 3], b = skinFaces[hit.t * 3 + 1], c = skinFaces[hit.t * 3 + 2];
                skinTri.set([a, b, c], i * 3); skinBary.set(hit.bary, i * 3);
                const n = unit([0, 1, 2].map(k => NS[a * 3 + k] * hit.bary[0] + NS[b * 3 + k] * hit.bary[1] + NS[c * 3 + k] * hit.bary[2]));
                skinH[i] = dot(sub(p, hit.q), n);
            }
        }

        // `collar` [from, to] on the spine: a standing collar carried whole by the neck's joint, eased in over that span,
        // so it keeps its own shape round any neck instead of clinging to the skin under it.
        const rigidW = new Uint8Array(count), rigidOff = new Float32Array(count * 3);
        if (o.collar) {
            const neck = Body.joints(pack, Q).find(j => j.name === 'Neck').head, [c0, c1] = o.collar;
            for (let i = 0; i < count; i++) {
                if (mix[i] > 0.01) continue;
                const v = tri[i * 3], sp = an0.member[v * 5] > 0.3 ? an0.s[v * 5] : -9;
                const f = Math.max(0, Math.min(1, (sp - c0) / (c1 - c0)));
                if (f <= 0 || familyOfRole(pointRole[i]) === 1 || familyOfRole(pointRole[i]) === 2) continue;
                rigidW[i] = Math.round(f * 255);
                rigidOff[i * 3] = point[i * 3] - neck[0]; rigidOff[i * 3 + 1] = point[i * 3 + 1] - neck[1]; rigidOff[i * 3 + 2] = point[i * 3 + 2] - neck[2];
            }
        }

        // Each point's garment, or none: what rides the head's skin is the model's own head or hair.
        const partDefs = o.parts && o.parts.length ? o.parts : [{ id: 'outfit' }];
        const an = Outfit.anatomy(pack);
        const headBone = pack.bones.findIndex(b => b.name === 'Head');
        const headShare = v => { let s = 0; for (let k = 0; k < 4; k++) if (pack.skinJoints[v * 4 + k] === headBone) s += pack.skinWeights[v * 4 + k]; return s; };
        const pointUv = new Float32Array(count * 2);
        for (let i = 0; i < mesh.positions.length / 3; i++) { pointUv[w.id[i] * 2] = mesh.uvs[i * 2]; pointUv[w.id[i] * 2 + 1] = mesh.uvs[i * 2 + 1]; }
        const pic = o.picture;
        const colorAt = i => {
            if (!pic) return [0.5, 0.5, 0.5];
            const x = Math.min(pic.width - 1, Math.max(0, Math.floor(pointUv[i * 2] * pic.width))), y = Math.min(pic.height - 1, Math.max(0, Math.floor(pointUv[i * 2 + 1] * pic.height)));
            const q = (y * pic.width + x) * 4;
            return [toLinear(pic.data[q]), toLinear(pic.data[q + 1]), toLinear(pic.data[q + 2])];
        };
        const chain = (v, a, b) => Math.max(an.member[v * 5 + a] > 0.5 ? an.s[v * 5 + a] : -9, an.member[v * 5 + b] > 0.5 ? an.s[v * 5 + b] : -9);
        // Each point's garment: a part whose `test` passes takes it outright (a part without an id drops it);
        // the rest go to the part that scores it highest, smoothed over the mesh where its colors run on.
        const DROP = 255, pointPart = new Uint8Array(count), fixed = new Uint8Array(count), colors = new Float32Array(count * 3);
        const scores = new Float32Array(count * partDefs.length);
        for (let i = 0; i < count; i++) {
            const a = tri[i * 3], b = tri[i * 3 + 1], c = tri[i * 3 + 2];
            const head = headShare(a) * bary[i * 3] + headShare(b) * bary[i * 3 + 1] + headShare(c) * bary[i * 3 + 2];
            if (surface[i] === 1 && head > 0.5 && offset[i * 3] < (o.headClear ?? 0.025)) { pointPart[i] = DROP; fixed[i] = 1; continue; }
            const v = bary[i * 3] >= bary[i * 3 + 1] && bary[i * 3] >= bary[i * 3 + 2] ? a : bary[i * 3 + 1] >= bary[i * 3 + 2] ? b : c;
            const color = colorAt(i);
            colors.set(color, i * 3);
            const info = {
                role: pointRole[i], color, y: point[i * 3 + 1], surface: surface[i], loose: !!loose[i], offset: offset[i * 3], head,
                spine: an.member[v * 5] > 0.3 ? an.s[v * 5] : -9, arm: chain(v, 1, 2), leg: chain(v, 3, 4)
            };
            const forced = partDefs.findIndex(d => d.test && d.test(info));
            if (forced >= 0) { pointPart[i] = partDefs[forced].id == null ? DROP : forced; fixed[i] = 1; continue; }
            let best = -1, bs = -Infinity;
            partDefs.forEach((d, k) => {
                if (d.id == null || d.test) return;
                const sc = d.score ? d.score(info) : 0;
                scores[i * partDefs.length + k] = sc;
                if (sc > bs) { bs = sc; best = k; }
            });
            pointPart[i] = best < 0 ? DROP : best;
        }
        settleLabels(pointPart, fixed, scores, partDefs.length, colors, mesh.index, w.id, count, o.smoothParts ?? 12, o.partCohesion ?? 0.6);
        // Bare skin and hair round the neck and wrists (in the head's own colors, close on the skin) is the model's, not cloth.
        const headDropped = [], clothKept = [];
        const band = new Uint8Array(count);
        for (let i = 0; i < count; i++) {
            const v = tri[i * 3];
            const sp = an.member[v * 5] > 0.3 ? an.s[v * 5] : -9, arm = chain(v, 1, 2);
            if (pointPart[i] === DROP) continue;
            if (an.s[v * 5] > (o.neckFrom ?? 3.5) || arm > 2.7) band[i] = 1;
            else if (sp > -9 && sp < 3.3) clothKept.push(colors.subarray(i * 3, i * 3 + 3));
        }
        // The head's own colors: the model's vertices that are mostly head (its face, its hair).
        if (pic) {
            const mp = model.positions.length / 3;
            for (let v = 0; v < mp; v += 2) {
                let hs = 0;
                for (let k = 0; k < 4; k++) if (model.roles[model.joints[v * 4 + k]] === 'Head') hs += model.weights[v * 4 + k];
                if (hs < 0.8) continue;
                const x = Math.min(pic.width - 1, Math.max(0, Math.floor(model.uvs[v * 2] * pic.width))), y = Math.min(pic.height - 1, Math.max(0, Math.floor(model.uvs[v * 2 + 1] * pic.height)));
                const q = (y * pic.width + x) * 4;
                headDropped.push([toLinear(pic.data[q]), toLinear(pic.data[q + 1]), toLinear(pic.data[q + 2])]);
            }
        }
        const look = c => [Math.sqrt(c[0]), Math.sqrt(c[1]), Math.sqrt(c[2])];
        const headTones = kMeans(headDropped.map(look), 16), clothTones = kMeans(clothKept.map(look), 8);
        const nearest = (tones, c) => { let b = Infinity; for (const t of tones) b = Math.min(b, Math.hypot(t[0] - c[0], t[1] - c[1], t[2] - c[2])); return b; };
        const isHeadTone = c => { const q = look(c); return headTones.length && clothTones.length && nearest(headTones, q) < (o.headTone ?? 0.9) * nearest(clothTones, q); };
        const pointHeadish = new Uint8Array(count);
        for (let r = 0; r < headish.length; r++) if (headish[r]) pointHeadish[w.id[r]] = 1;
        if (o.skinCut !== false) for (let i = 0; i < count; i++) if (band[i] && (offset[i * 3] < 0.04 || an.s[tri[i * 3] * 5] > 3.85 || pointHeadish[i]) && isHeadTone(colors.subarray(i * 3, i * 3 + 3))) pointPart[i] = DROP;
        // Triangles by their points' garment (all three in it); crumbs left out.
        const parts = [];
        partDefs.forEach((d, k) => {
            if (d.id == null) return;
            const index = [];
            for (let t = 0; t < mesh.index.length; t += 3) {
                const pa = pointPart[w.id[mesh.index[t]]], pb = pointPart[w.id[mesh.index[t + 1]]], pc = pointPart[w.id[mesh.index[t + 2]]];
                const mine = (pa === k) + (pb === k) + (pc === k);
                if (pa === DROP || pb === DROP || pc === DROP) continue;
                // A triangle across two garments goes to the one with two of its corners.
                if (mine >= 2 || (mine === 1 && pa !== pb && pb !== pc && pa !== pc && pa === k)) index.push(mesh.index[t], mesh.index[t + 1], mesh.index[t + 2]);
            }
            parts.push({ id: d.id, index: dropCrumbs(Uint32Array.from(index), w.id, o.minPiece ?? 24) });
        });
        // Only the points and render vertices the parts use.
        const usedRender = new Int32Array(mesh.positions.length / 3).fill(-1), renderOrder = [];
        for (const part of parts) for (let i = 0; i < part.index.length; i++) { const r = part.index[i]; if (usedRender[r] < 0) { usedRender[r] = renderOrder.length; renderOrder.push(r); } }
        for (const part of parts) part.index = Uint32Array.from(part.index, r => usedRender[r]);
        const usedPoint = new Int32Array(count).fill(-1), pointOrder = [];
        for (const r of renderOrder) { const p = w.id[r]; if (usedPoint[p] < 0) { usedPoint[p] = pointOrder.length; pointOrder.push(p); } }
        const pick = (arr, k) => { const out = new arr.constructor(pointOrder.length * k); pointOrder.forEach((p, i) => { for (let j = 0; j < k; j++) out[i * k + j] = arr[p * k + j]; }); return out; };
        const hang = new Float32Array(pointOrder.length).fill(-1);
        let any = false;
        if (o.hang !== false) {
            const top = Lt.pelvis[1] + 0.08, bottom = 0.05;
            pointOrder.forEach((p, i) => { if (loose[p]) { hang[i] = Math.max(0, (top - point[p * 3 + 1]) / (top - bottom)); any = true; } });
        }
        // Hair and skin painted onto kept cloth round the neck and wrists, painted over with the cloth round it.
        let picture = null;
        const renderPoint = Array.from(renderOrder, r => usedPoint[w.id[r]]);
        let uvList = Array.from({ length: renderOrder.length * 2 }, (_, i) => mesh.uvs[renderOrder[i >> 1] * 2 + (i & 1)]);
        if (pic && o.repaint !== false && headTones.length && clothTones.length) {
            const bandRender = new Uint8Array(renderOrder.length);
            renderOrder.forEach((r, i) => { bandRender[i] = band[w.id[r]]; });
            picture = repaint(pic, uvList, parts, bandRender, c => isHeadTone(c));
        }
        // Small holes (where the model's hair or head lay on its clothes) closed in the color of the cloth round them.
        if (pic && o.fillHoles !== false) {
            picture = picture || { width: pic.width, height: pic.height, data: Uint8Array.from(pic.data) };
            const P3 = pointOrder.map(p => [point[p * 3], point[p * 3 + 1], point[p * 3 + 2]]);
            // Not the openings: the neck, and where the hands and feet were cut away.
            const opening = loop => isGarmentOpening(loop, Lt);
            fillHoles(parts, renderPoint, uvList, P3, picture, o.holeSize ?? 0.22, opening, () => true);
        }
        // The skin each part hides: skin whose outward normal meets the part within 6 cm, its edges kept.
        const NB = Body.vertexNormals(pack, Q);
        const renderPos = new Float32Array(renderPoint.length * 3);
        renderPoint.forEach((p, i) => { const q = pointOrder[p]; renderPos[i * 3] = point[q * 3]; renderPos[i * 3 + 1] = point[q * 3 + 1]; renderPos[i * 3 + 2] = point[q * 3 + 2]; });
        // Each part's covered skin, its edges judged against the whole outfit (no skin left between two of its parts).
        const raw = parts.map(part => coveredSkin(pack, Q, NB, { positions: renderPos }, part.index, o.hideReach ?? 0.14, true));
        // The skin under every point that rides close on it is covered whatever the rays found (coarse cloth over a bulge).
        {
            const via = new Map(), tb = Outfit.binding(pack, 'tights');
            tb.ids.forEach((v, i) => via.set(v, [tb.tri[i * 3], tb.tri[i * 3 + 1], tb.tri[i * 3 + 2]]));
            parts.forEach((part, k) => {
                const seen = new Set();
                for (let i = 0; i < part.index.length; i++) {
                    const p = pointOrder[renderPoint[part.index[i]]];
                    if (seen.has(p)) continue;
                    seen.add(p);
                    if (surface[p] === 2 || offset[p * 3] > 0.05) continue;
                    for (let c = 0; c < 3; c++) { const v = tri[p * 3 + c]; for (const u of via.get(v) || [v]) raw[k][u] = 1; }
                }
            });
        }
        const union = new Uint8Array(pack.vertexCount);
        for (const r of raw) for (let v = 0; v < r.length; v++) if (r[v]) union[v] = 1;
        const nbs = pack._skinNeighbors || (pack._skinNeighbors = neighborLists(bindSurfaces(pack).body, pack.vertexCount));
        parts.forEach((part, k) => {
            const out = [];
            for (let v = 0; v < raw[k].length; v++) if (raw[k][v] && (nbs[v] || []).every(u => union[u])) out.push(v);
            part.hidden = Uint16Array.from(out);
        });
        const outfit = {
            format: 1, height: built.height, recipe: o.recipe || {}, picture,
            count: pointOrder.length, tri: pick(tri, 3), bary: pick(bary, 3), offset: pick(offset, 3), surface: pick(surface, 1), hang: any ? hang : null,
            world: pick(world, 3), farness: pick(farness, 1), rest: pick(rest, 3),
            skin: { tri: pick(skinTri, 3), bary: pick(skinBary, 3), height: pick(skinH, 1) },
            rigid: rigidW.some(x => x) ? { w: pick(rigidW, 1), offset: pick(rigidOff, 3) } : null,
            blend: (() => {
                const ids = [], at = new Int32Array(count).fill(-1);
                pointOrder.forEach((p, k) => { at[p] = k; });
                const list = blendIds.filter(p => at[p] >= 0);
                const g = (arr, k) => { const out = new arr.constructor(list.length * k); list.forEach((p, n) => { for (let j = 0; j < k; j++) out[n * k + j] = arr[p * k + j]; }); return out; };
                return { ids: Uint16Array.from(list, p => at[p]), mix: Uint8Array.from(list, p => Math.round(mix[p] * 255)), tri: g(btri, 3), bary: g(bbary, 3), offset: g(boff, 3), world: g(bworld, 3), farness: g(bfar, 1) };
            })(),
            render: { point: Uint32Array.from(renderPoint), uvs: Float32Array.from(uvList) },
            parts: parts.filter(p => p.index.length),
            roughness: o.roughness ?? model.roughness ?? 0.8, metalness: o.metalness ?? 0
        };
        // Small disconnected pieces beyond the garment are left out.
        if (o.tears !== false) {
            const restFrame = {}, rest = fit(pack, built, outfit, restFrame);
            // Small pieces floating off the body (a blade beyond a hand, a lone shard) are no part of the garment.
            {
                const S = built.shaped, G = restFrame.bodyGrid, RP = outfit.render.point;
                for (const part of outfit.parts) {
                    const I = part.index, parent = new Map();
                    const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
                    for (let i = 0; i < I.length; i++) { const p = RP[I[i]]; if (!parent.has(p)) parent.set(p, p); }
                    for (let t = 0; t < I.length; t += 3) { const a = find(RP[I[t]]), b = find(RP[I[t + 1]]); parent.set(a, b); parent.set(find(RP[I[t + 2]]), find(b)); }
                    const size = new Map(), far = new Map();
                    for (let t = 0; t < I.length; t += 3) {
                        const r = find(RP[I[t]]), p = RP[I[t]];
                        size.set(r, (size.get(r) || 0) + 1);
                        const q = G.nearest(rest[p * 3], rest[p * 3 + 1], rest[p * 3 + 2], 3);
                        const d = q < 0 ? 1 : Math.hypot(rest[p * 3] - S[q * 3], rest[p * 3 + 1] - S[q * 3 + 1], rest[p * 3 + 2] - S[q * 3 + 2]);
                        far.set(r, Math.min(far.get(r) ?? 1, d));
                    }
                    const total = I.length / 3, keep = [];
                    for (let t = 0; t < I.length; t += 3) { const r = find(RP[I[t]]); if (!(size.get(r) < total * 0.03 && far.get(r) > 0.05)) keep.push(I[t], I[t + 1], I[t + 2]); }
                    part.index = Uint32Array.from(keep);
                }
            }
        }
        return outfit;
    }

    /** k-means of points (deterministic: seeded along their brightness), at most k centers. */
    function kMeans(points, k) {
        if (!points.length) return [];
        const sorted = points.slice().sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
        let centers = [];
        for (let j = 0; j < Math.min(k, sorted.length); j++) centers.push(sorted[Math.floor((j + 0.5) / k * sorted.length)].slice());
        const step = Math.max(1, Math.floor(points.length / 4000));
        for (let it = 0; it < 12; it++) {
            const sum = centers.map(() => [0, 0, 0, 0]);
            for (let i = 0; i < points.length; i += step) {
                const p = points[i];
                let b = 0, bd = Infinity;
                centers.forEach((c, j) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < bd) { bd = d; b = j; } });
                sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2] += p[2]; sum[b][3]++;
            }
            centers = centers.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
        }
        return centers;
    }

    /**
     * The picture with texels of the given triangles (only those whose
     * corners are all in `band`) that `wrong(linear rgb)` picks painted over
     * by the texels round them, grown in from the edges of each patch.
     */
    function repaint(pic, uvs, parts, band, wrong) {
        const W = pic.width, H = pic.height, data = Uint8Array.from(pic.data);
        const inside = new Uint8Array(W * H), mark = new Uint8Array(W * H);
        for (const part of parts) {
            const I = part.index;
            for (let t = 0; t < I.length; t += 3) {
                const banded = band[I[t]] && band[I[t + 1]] && band[I[t + 2]];
                const px = [0, 1, 2].map(k => uvs[I[t + k] * 2] * W), py = [0, 1, 2].map(k => uvs[I[t + k] * 2 + 1] * H);
                const area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]);
                if (Math.abs(area) < 1e-9) continue;
                const x0 = Math.max(0, Math.floor(Math.min(...px))), x1 = Math.min(W - 1, Math.ceil(Math.max(...px)));
                const y0 = Math.max(0, Math.floor(Math.min(...py))), y1 = Math.min(H - 1, Math.ceil(Math.max(...py)));
                for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                    const cx = x + 0.5, cy = y + 0.5;
                    const w0 = ((px[1] - cx) * (py[2] - cy) - (px[2] - cx) * (py[1] - cy)) / area, w1 = ((px[2] - cx) * (py[0] - cy) - (px[0] - cx) * (py[2] - cy)) / area;
                    if (w0 < -0.02 || w1 < -0.02 || 1 - w0 - w1 < -0.02) continue;
                    const q = y * W + x;
                    inside[q] = 1;
                    if (banded && !mark[q]) { const o = q * 4; if (wrong([toLinear(data[o]), toLinear(data[o + 1]), toLinear(data[o + 2])])) mark[q] = 1; }
                }
            }
        }
        // Grown in: each marked texel takes the mean of its unmarked neighbors inside the cloth, ring by ring.
        let left = 0;
        for (let q = 0; q < W * H; q++) if (mark[q]) left++;
        for (let pass = 0; pass < 96 && left; pass++) {
            const done = [];
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const q = y * W + x;
                if (!mark[q]) continue;
                let r = 0, g = 0, b = 0, n = 0;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                    const xx = x + dx, yy = y + dy;
                    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                    const u = yy * W + xx;
                    if (mark[u] || !inside[u]) continue;
                    r += data[u * 4]; g += data[u * 4 + 1]; b += data[u * 4 + 2]; n++;
                }
                if (n) done.push([q, r / n, g / n, b / n]);
            }
            if (!done.length) break;
            for (const [q, r, g, b] of done) { data[q * 4] = Math.round(r); data[q * 4 + 1] = Math.round(g); data[q * 4 + 2] = Math.round(b); mark[q] = 0; left--; }
        }
        return { width: W, height: H, data };
    }

    /**
     * Closes each part's holes shorter round than `size` meters: a fan of
     * new triangles from the hole's first corner, its picture coordinates on
     * a small square of the picture no triangle uses, painted in the mean
     * color of the cloth at the hole's edge. Mutates parts, renderPoint,
     * uvs and the picture.
     */
    function fillHoles(parts, renderPoint, uvs, P3, picture, size, opening, clothColor) {
        const W = picture.width, H = picture.height, used = new Uint8Array(W * H);
        // Texels the parts' triangles use (by their bounds, generously).
        for (const part of parts) for (let t = 0; t < part.index.length; t += 3) {
            const xs = [0, 1, 2].map(k => uvs[part.index[t + k] * 2] * W), ys = [0, 1, 2].map(k => uvs[part.index[t + k] * 2 + 1] * H);
            for (let y = Math.max(0, Math.floor(Math.min(...ys)) - 2); y <= Math.min(H - 1, Math.ceil(Math.max(...ys)) + 2); y++)
                for (let x = Math.max(0, Math.floor(Math.min(...xs)) - 2); x <= Math.min(W - 1, Math.ceil(Math.max(...xs)) + 2); x++) used[y * W + x] = 1;
        }
        const B = 8;
        const free = [];
        for (let by = 0; by + B <= H && free.length < 4096; by += B) for (let bx = 0; bx + B <= W; bx += B) {
            let ok = true;
            for (let y = by; y < by + B && ok; y++) for (let x = bx; x < bx + B; x++) if (used[y * W + x]) { ok = false; break; }
            if (ok) free.push([bx, by]);
        }
        let next = 0;
        const texel = (u, v) => { const x = Math.min(W - 1, Math.max(0, Math.floor(u * W))), y = Math.min(H - 1, Math.max(0, Math.floor(v * H))); const q = (y * W + x) * 4; return [picture.data[q], picture.data[q + 1], picture.data[q + 2]]; };
        for (const part of parts) {
            const I = part.index, edges = new Map(), sides = new Array(I.length);
            for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
                const a = renderPoint[I[t + k]], b = renderPoint[I[t + (k + 1) % 3]];
                const key = a < b ? a + ':' + b : b + ':' + a;
                const e = { a, b, r: I[t + k], t, key };
                sides[t + k] = e;
                if (!edges.has(key)) edges.set(key, []);
                edges.get(key).push(e);
            }
            // Walk through the adjacent face fan, keeping separate holes that touch at one vertex.
            const previous = edge => {
                const vertex = edge.a;
                let t = edge.t;
                for (let guard = 0; guard < 128; guard++) {
                    let corner = -1;
                    for (let k = 0; k < 3; k++) if (renderPoint[I[t + k]] === vertex) corner = k;
                    if (corner < 0) return null;
                    const incoming = sides[t + (corner + 2) % 3], list = edges.get(incoming.key);
                    if (list.length === 1) return incoming;
                    if (list.length !== 2) return null;
                    const other = list[0] === incoming ? list[1] : list[0];
                    if (other.a !== vertex) return null;
                    t = other.t;
                }
                return null;
            };
            const boundary = [...edges.values()].filter(list => list.length === 1).map(list => list[0]).sort((a, b) => a.b - b.b || a.a - b.a);
            const seen = new Set(), add = [];
            for (const start of boundary) {
                if (seen.has(start)) continue;
                const loop = [];
                let edge = start;
                while (edge && !seen.has(edge) && loop.length < 256) {
                    seen.add(edge); loop.push(edge); edge = previous(edge);
                }
                if (edge !== start || loop.length < 3) continue;
                let perimeter = 0;
                for (const e of loop) perimeter += len(sub(P3[e.a], P3[e.b]));
                if (perimeter > size || next >= free.length) continue;
                if (typeof opening === 'function' ? opening(loop.map(e => P3[e.a])) : loop.filter(e => opening[e.a]).length > loop.length * 0.3) continue;
                const mean = [0, 0, 0];
                let counted = 0;
                for (const e of loop) {
                    const c = texel(uvs[e.r * 2], uvs[e.r * 2 + 1]);
                    if (!clothColor(c.map(x => toLinear(x)))) continue;
                    mean[0] += c[0]; mean[1] += c[1]; mean[2] += c[2]; counted++;
                }
                if (!counted) continue;
                const [bx, by] = free[next++];
                for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) { const q = (y * W + x) * 4; for (let c = 0; c < 3; c++) picture.data[q + c] = Math.round(mean[c] / counted); picture.data[q + 3] = 255; }
                const u = (bx + B / 2) / W, v = (by + B / 2) / H;
                const local = triangulateLoop(loop.map(e => P3[e.b]));
                if (!local.length) continue;
                const ids = loop.map(e => { renderPoint.push(e.b); uvs.push(u, v); return renderPoint.length - 1; });
                for (const i of local) add.push(ids[i]);
            }
            if (add.length) { const merged = new Uint32Array(I.length + add.length); merged.set(I); merged.set(add, I.length); part.index = merged; }
        }
    }

    /** A neck, cuff, or ankle opening encloses its skeleton's axis; a pinhole beside it does not. */
    function isGarmentOpening(points, landmarks) {
        const center = [0, 0, 0], normal = [0, 0, 0];
        for (const p of points) for (let c = 0; c < 3; c++) center[c] += p[c] / points.length;
        for (let i = 0; i < points.length; i++) {
            const n = cross(sub(points[i], center), sub(points[(i + 1) % points.length], center));
            for (let c = 0; c < 3; c++) normal[c] += n[c];
        }
        const N = unit(normal), axis = Math.abs(N[0]) > Math.abs(N[1]) ? (Math.abs(N[0]) > Math.abs(N[2]) ? 0 : 2) : (Math.abs(N[1]) > Math.abs(N[2]) ? 1 : 2);
        const axes = [[landmarks.chest, landmarks.Head]];
        for (const side of ['Left', 'Right']) {
            axes.push([landmarks[side + 'ForeArm'], landmarks[side + 'Hand']]);
            axes.push([landmarks[side + 'Leg'], landmarks[side + 'Foot']]);
        }
        const u = (axis + 1) % 3, v = (axis + 2) % 3;
        for (const [a, b] of axes) {
            if (!a || !b) continue;
            const direction = sub(b, a), d = dot(direction, N);
            if (Math.abs(d) < len(direction) * 0.25) continue;
            const t = dot(sub(center, a), N) / d;
            // Only openings near this bone's span, not another ring reached by extending it through the body.
            if (t < -0.2 || t > 1.3) continue;
            const p = add(a, mul(direction, t));
            let inside = false;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const A = points[i], B = points[j];
                if ((A[v] > p[v]) !== (B[v] > p[v]) && p[u] < (B[u] - A[u]) * (p[v] - A[v]) / (B[v] - A[v]) + A[u]) inside = !inside;
            }
            if (inside) return true;
        }
        return false;
    }

    /** Ear clipping on the loop's dominant plane preserves concave hems and boundary winding. */
    function triangulateLoop(points) {
        const normal = [0, 0, 0];
        for (let i = 0; i < points.length; i++) {
            const a = points[i], b = points[(i + 1) % points.length];
            normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
            normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
            normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
        }
        const axis = Math.abs(normal[0]) > Math.abs(normal[1]) ? (Math.abs(normal[0]) > Math.abs(normal[2]) ? 0 : 2) : (Math.abs(normal[1]) > Math.abs(normal[2]) ? 1 : 2);
        const uv = points.map(p => [p[(axis + 1) % 3], p[(axis + 2) % 3]]);
        const area = uv.reduce((sum, p, i) => { const q = uv[(i + 1) % uv.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
        if (Math.abs(area) < 1e-12) return [];
        const sign = Math.sign(area), cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const ring = points.map((_, i) => i), out = [];
        while (ring.length > 3) {
            let found = false;
            for (let k = 0; k < ring.length; k++) {
                const a = ring[(k + ring.length - 1) % ring.length], b = ring[k], c = ring[(k + 1) % ring.length];
                if (cross2(uv[a], uv[b], uv[c]) * sign <= 1e-12) continue;
                if (ring.some(i => i !== a && i !== b && i !== c && cross2(uv[a], uv[b], uv[i]) * sign >= -1e-12 && cross2(uv[b], uv[c], uv[i]) * sign >= -1e-12 && cross2(uv[c], uv[a], uv[i]) * sign >= -1e-12)) continue;
                out.push(a, b, c); ring.splice(k, 1); found = true; break;
            }
            if (!found) return [];
        }
        out.push(...ring);
        return out;
    }

    /** Triangles in connected pieces (over shared points) of fewer than `min` left out. */
    function dropCrumbs(index, id, min) {
        if (!index.length) return index;
        const parent = new Map();
        const find = i => { let r = i; while (parent.get(r) !== r) r = parent.get(r); let x = i; while (parent.get(x) !== r) { const nx = parent.get(x); parent.set(x, r); x = nx; } return r; };
        for (let i = 0; i < index.length; i++) { const p = id[index[i]]; if (!parent.has(p)) parent.set(p, p); }
        for (let t = 0; t < index.length; t += 3) { const a = find(id[index[t]]), b = find(id[index[t + 1]]), c = find(id[index[t + 2]]); parent.set(a, b); parent.set(find(c), find(b)); }
        const size = new Map();
        for (let t = 0; t < index.length; t += 3) { const r = find(id[index[t]]); size.set(r, (size.get(r) || 0) + 1); }
        const out = [];
        for (let t = 0; t < index.length; t += 3) if (size.get(find(id[index[t]])) >= min) out.push(index[t], index[t + 1], index[t + 2]);
        return Uint32Array.from(out);
    }

    /** A point's frame on the bound surface: origin, smooth normal, and two directions across it. */
    function frameAt(P, N, a, b, c, w) {
        const A = a * 3, B = b * 3, C = c * 3;
        const o = [P[A] * w[0] + P[B] * w[1] + P[C] * w[2], P[A + 1] * w[0] + P[B + 1] * w[1] + P[C + 1] * w[2], P[A + 2] * w[0] + P[B + 2] * w[1] + P[C + 2] * w[2]];
        let n = [N[A] * w[0] + N[B] * w[1] + N[C] * w[2], N[A + 1] * w[0] + N[B + 1] * w[1] + N[C + 1] * w[2], N[A + 2] * w[0] + N[B + 2] * w[1] + N[C + 2] * w[2]];
        n = unit(n);
        let e = [P[B] - P[A], P[B + 1] - P[A + 1], P[B + 2] - P[A + 2]];
        e = sub(e, mul(n, dot(e, n)));
        if (len(e) < 1e-9) e = Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]);
        const u = unit(e), v = cross(n, u);
        return { o, n, u, v };
    }

    /**
     * Points of cloth hanging free below the hips (a coat's tails, a robe's
     * skirt): an outer layer, with more of the model's cloth between it and
     * the body (a coat over trousers), or clear of the body by `free`.
     * Trousers, boots and knee pads lie on the legs with nothing under them
     * and stay on the legs.
     */
    function looseCloth(pack, QS, F, point, count, mesh, w, Lt, o, roles) {
        const free = o.free ?? 0.03;
        const out = new Uint8Array(count);
        if (o.hang === false) return out;
        // Measured to the skin itself: the tights stand off it and may lie outside an inner layer.
        const grid = triangleGrid(QS, bindSurfaces(pack).body, 0.03);
        const cloth = triangleGrid(mesh.positions, mesh.index, 0.02);
        const skirtGrid = triangleGrid(QS, F.all, 0.04, t => F.kind[t] === 2);
        const top = Lt.pelvis[1] + 0.06;
        for (let i = 0; i < count; i++) {
            const p = [point[i * 3], point[i * 3 + 1], point[i * 3 + 2]];
            if (p[1] > top) continue;
            // An arm hanging by the hips is no skirt.
            const f = familyOfRole(roles[i]);
            if (f === 1 || f === 2 || /(?:Foot|ToeBase)$/.test(roles[i] || '')) continue;
            const hit = nearestTriangle(grid, p, free + 0.05);
            if (!hit || hit.d > free) { out[i] = 1; continue; }
            // An outer layer near where a skirt would hang (a coat's tails over trousers), not armor round a leg inside it.
            const sk = nearestTriangle(skirtGrid, p, 0.2);
            if (!sk) continue;
            const a = F.all[sk.t * 3] * 3, b = F.all[sk.t * 3 + 1] * 3, c = F.all[sk.t * 3 + 2] * 3;
            const e1 = [QS[b] - QS[a], QS[b + 1] - QS[a + 1], QS[b + 2] - QS[a + 2]], e2 = [QS[c] - QS[a], QS[c + 1] - QS[a + 1], QS[c + 2] - QS[a + 2]];
            let nrm = unit(cross(e1, e2));
            const mid3 = [(QS[a] + QS[b] + QS[c]) / 3 - Lt.pelvis[0], 0, (QS[a + 2] + QS[b + 2] + QS[c + 2]) / 3 - Lt.pelvis[2]];
            if (dot(nrm, mid3) < 0) nrm = mul(nrm, -1);
            if (dot(sub(p, sk.q), nrm) < -(o.skirtInside ?? 0.035)) continue;
            // Toward the body: another layer of cloth on the way there.
            const toward = sub(hit.q, p), d = len(toward);
            if (d < 0.006) continue;
            if (rayHits(cloth, p, mul(toward, 1 / d), 0.004, d - 0.002).length) out[i] = 1;
        }
        smoothLabels(out, mesh.index, w.id, count, 2);
        // A boot's toe cap can be far from our skin; it still rides the foot, never the skirt.
        for (let i = 0; i < count; i++) if (/(?:Foot|ToeBase)$/.test(roles[i] || '')) out[i] = 0;
        return out;
    }

    /** Labels per point made the majority of each point's neighbors, `passes` times. */
    function smoothLabels(label, index, id, count, passes) {
        const nb = new Array(count);
        for (let t = 0; t < index.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = id[index[t + k]], b = id[index[t + (k + 1) % 3]];
            if (a === b) continue;
            (nb[a] || (nb[a] = new Set())).add(b);
            (nb[b] || (nb[b] = new Set())).add(a);
        }
        for (let p = 0; p < passes; p++) {
            const next = Uint8Array.from(label);
            for (let i = 0; i < count; i++) {
                if (!nb[i]) continue;
                const votes = new Map([[label[i], 1]]);
                for (const j of nb[i]) votes.set(label[j], (votes.get(label[j]) || 0) + 1);
                let best = label[i], bv = 0;
                for (const [l, c] of votes) if (c > bv || (c === bv && l < best)) { best = l; bv = c; }
                next[i] = best;
            }
            label.set(next);
        }
    }

    /**
     * Labels settled over the mesh: each free point takes the label that
     * best trades its own score against disagreeing with its neighbors, a
     * neighbor across a change of color counting less, `passes` times.
     */
    function settleLabels(label, fixed, scores, parts, colors, index, id, count, passes, cohesion) {
        const nb = new Array(count);
        for (let t = 0; t < index.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = id[index[t + k]], b = id[index[t + (k + 1) % 3]];
            if (a === b) continue;
            (nb[a] || (nb[a] = new Set())).add(b);
            (nb[b] || (nb[b] = new Set())).add(a);
        }
        const near = (i, j) => {
            const d = Math.hypot(Math.sqrt(colors[i * 3]) - Math.sqrt(colors[j * 3]), Math.sqrt(colors[i * 3 + 1]) - Math.sqrt(colors[j * 3 + 1]), Math.sqrt(colors[i * 3 + 2]) - Math.sqrt(colors[j * 3 + 2]));
            return Math.exp(-(d * d) / 0.02);
        };
        const lists = nb.map((s, i) => (s ? [...s].map(j => [j, near(i, j)]) : []));
        for (let p = 0; p < passes; p++) {
            let changed = 0;
            for (let i = 0; i < count; i++) {
                if (fixed[i]) continue;
                let best = label[i], bc = Infinity;
                for (let k = 0; k < parts; k++) {
                    let c = -scores[i * parts + k];
                    let wsum = 0, against = 0;
                    for (const [j, w] of lists[i]) { wsum += w; if (label[j] !== k) against += w; }
                    c += cohesion * against / Math.max(1e-6, wsum) * lists[i].length;
                    if (c < bc - 1e-9) { bc = c; best = k; }
                }
                if (scores[i * parts + best] === 0 && !lists[i].length) continue;
                if (best !== label[i]) { label[i] = best; changed++; }
            }
            if (!changed) break;
        }
    }

    /** The body vertices a part covers: skin whose outward normal meets it within `reach`, one ring in from its edges kept. */
    function coveredSkin(pack, Q, N, mesh, index, reach, rawOnly) {
        if (!index.length) return rawOnly ? new Uint8Array(pack.vertexCount) : new Uint16Array(0);
        const grid = triangleGrid(mesh.positions, index, 0.02);
        const ids = pack._bodyIdsTransfer || (pack._bodyIdsTransfer = [...new Set(pack.body.source)].sort((a, b) => a - b));
        const covered = new Uint8Array(pack.vertexCount);
        for (const v of ids) {
            const d = [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]];
            if (!d[0] && !d[1] && !d[2]) continue;
            const hits = rayHits(grid, [Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2]], d, -0.01, reach);
            if (hits.length) covered[v] = 1;
        }
        const nb = pack._skinNeighbors || (pack._skinNeighbors = neighborLists(bindSurfaces(pack).body, pack.vertexCount));
        // A foot or hand mostly covered is covered whole (a boot, a gauntlet).
        const an = Outfit.anatomy(pack);
        for (const [fam, from] of [[3, 1.85], [4, 1.85], [1, 3.05], [2, 3.05]]) {
            const end = ids.filter(v => an.member[v * 5 + fam] > 0.5 && an.s[v * 5 + fam] > from);
            if (end.length && end.filter(v => covered[v]).length > end.length * 0.5) for (const v of end) covered[v] = 1;
        }
        // Small gaps closed (a vertex most of whose neighbors are covered is covered), then one ring in from the edges kept.
        for (let pass = 0; pass < 2; pass++) {
            const add = [];
            for (const v of ids) if (!covered[v] && nb[v] && nb[v].filter(u => covered[u]).length >= nb[v].length * 0.6) add.push(v);
            for (const v of add) covered[v] = 1;
        }
        if (rawOnly) return covered;
        const out = [];
        for (const v of ids) if (covered[v] && (nb[v] || []).every(u => covered[u])) out.push(v);
        return Uint16Array.from(out);
    }

    // ── wearing it ────────────────────────────────────────────────────────
    /**
     * The outfit's points on a built body: each on its bound point of the
     * body's surfaces, at its offset in that point's frame (scaled with the
     * body's height), then lifted out of the skin. `frame` is the outfit
     * build's scratch (shared with the other garments).
     */
    /** One binding laid on the body (P, smooth normals N, height ratio k): the point into out[o], its normal's x into facing. */
    function lay(P, N, k, T, Bw, D, Wd, Fr, i, out, o) {
        const A = T[i * 3] * 3, B = T[i * 3 + 1] * 3, C = T[i * 3 + 2] * 3;
        if (A === B && B === C && A === 0) return 0;
        const w0 = Bw[i * 3], w1 = Bw[i * 3 + 1], w2 = Bw[i * 3 + 2];
        const ox = P[A] * w0 + P[B] * w1 + P[C] * w2, oy = P[A + 1] * w0 + P[B + 1] * w1 + P[C + 1] * w2, oz = P[A + 2] * w0 + P[B + 2] * w1 + P[C + 2] * w2;
        let nx = N[A] * w0 + N[B] * w1 + N[C] * w2, ny = N[A + 1] * w0 + N[B + 1] * w1 + N[C + 1] * w2, nz = N[A + 2] * w0 + N[B + 2] * w1 + N[C + 2] * w2;
        let l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        let ex = P[B] - P[A], ey = P[B + 1] - P[A + 1], ez = P[B + 2] - P[A + 2];
        const d = ex * nx + ey * ny + ez * nz;
        ex -= nx * d; ey -= ny * d; ez -= nz * d;
        l = Math.hypot(ex, ey, ez);
        if (l < 1e-9) { ex = 0; ey = nz; ez = -ny; l = Math.hypot(ey, ez) || 1; }
        ex /= l; ey /= l; ez /= l;
        const vx = ny * ez - nz * ey, vy = nz * ex - nx * ez, vz = nx * ey - ny * ex;
        const h = D[i * 3] * k, u = D[i * 3 + 1] * k, v = D[i * 3 + 2] * k;
        let px = nx * h + ex * u + vx * v, py = ny * h + ey * u + vy * v, pz = nz * h + ez * u + vz * v;
        const f = Fr ? Fr[i] / 255 : 0;
        if (f > 0) { px += (Wd[i * 3] * k - px) * f; py += (Wd[i * 3 + 1] * k - py) * f; pz += (Wd[i * 3 + 2] * k - pz) * f; }
        out[o] = ox + px; out[o + 1] = oy + py; out[o + 2] = oz + pz;
        return nx;
    }

    /** Each point's neighbors over the outfit's triangles, kept on the outfit. */
    function pointGraph(outfit) {
        if (outfit._graph) return outfit._graph;
        const sets = Array.from({ length: outfit.count }, () => new Set()), R = outfit.render.point;
        for (const part of outfit.parts) for (let t = 0; t < part.index.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = R[part.index[t + k]], b = R[part.index[t + (k + 1) % 3]];
            if (a !== b) { sets[a].add(b); sets[b].add(a); }
        }
        return (outfit._graph = sets.map(x => Int32Array.from(x)));
    }

    /** The binding's displacement eased across each connected panel, with the source folds kept. */
    function relaxPanels(outfit, out, scale, passes) {
        if (!outfit.rest) return;
        const graph = pointGraph(outfit), R = outfit.rest;
        let delta = Float32Array.from(out, (v, i) => v - R[i] * scale);
        for (let pass = 0; pass < passes; pass++) {
            const next = Float32Array.from(delta);
            for (let i = 0; i < outfit.count; i++) {
                const nb = graph[i];
                if (!nb.length) continue;
                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    for (const j of nb) sum += delta[j * 3 + c];
                    next[i * 3 + c] = delta[i * 3 + c] * 0.25 + sum / nb.length * 0.75;
                }
            }
            delta = next;
        }
        for (let i = 0; i < out.length; i++) out[i] = R[i] * scale + delta[i];
    }

    /** Lift a face whose center crosses the skin, sharing its correction across its corners. */
    function clearFaces(pack, built, outfit, out, frame) {
        const S = built.shaped, N = frame.bodyNormals, grid = frame.bodyGrid, R = outfit.render.point;
        const delta = new Float32Array(out.length), strongest = new Float32Array(outfit.count);
        for (const part of outfit.parts) for (let t = 0; t < part.index.length; t += 3) {
            const a = R[part.index[t]], b = R[part.index[t + 1]], c = R[part.index[t + 2]];
            if (outfit.surface[a] === 2 && outfit.surface[b] === 2 && outfit.surface[c] === 2) continue;
            const x = (out[a * 3] + out[b * 3] + out[c * 3]) / 3, y = (out[a * 3 + 1] + out[b * 3 + 1] + out[c * 3 + 1]) / 3, z = (out[a * 3 + 2] + out[b * 3 + 2] + out[c * 3 + 2]) / 3;
            const v = grid.nearest(x, y, z, 2);
            if (v < 0) continue;
            const nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
            const d = (x - S[v * 3]) * nx + (y - S[v * 3 + 1]) * ny + (z - S[v * 3 + 2]) * nz;
            if (d >= GAP || d < -0.1) continue;
            const push = GAP - d;
            for (const p of [a, b, c]) if (push > strongest[p]) {
                strongest[p] = push;
                delta[p * 3] = nx * push; delta[p * 3 + 1] = ny * push; delta[p * 3 + 2] = nz * push;
            }
        }
        for (let i = 0; i < out.length; i++) out[i] += delta[i];
    }

    /** On a very heavy build cloth bridges skin folds with a smooth convex cross-section. */
    function smoothHeavyPanels(pack, built, outfit, out, frame, preserveLayers) {
        const an = Outfit.anatomy(pack), ids = pack._bodyIdsTransfer || [...new Set(pack.body.source)];
        let half = 0;
        for (const v of ids) if (an.member[v * 5] > 0.9 && an.s[v * 5] > 0.4 && an.s[v * 5] < 2) half = Math.max(half, Math.abs(built.shaped[v * 3]));
        if (half <= built.height * 0.15) return;
        const envelope = body => {
            const step = 0.02 * body.height / 1.7, bins = new Map(), P = body.shaped;
            for (const v of ids) {
                if (an.member[v * 5 + 1] > 0.4 || an.member[v * 5 + 2] > 0.4 || an.s[v * 5] > 3.7) continue;
                const bin = Math.floor(P[v * 3 + 1] / step);
                for (let k = bin - 1; k <= bin + 1; k++) { if (!bins.has(k)) bins.set(k, []); bins.get(k).push(v); }
            }
            return { P, bins, step, hip: body.bones.find(b => b.name === 'Hips').head, neck: body.bones.find(b => b.name === 'Neck').head };
        };
        const target = frame['transfer:envelope'] || (frame['transfer:envelope'] = envelope(built));
        const reference = outfit._envelope || (outfit._envelope = envelope(Body.build(pack, Object.assign({}, Body.DEFAULT_RECIPE, outfit.recipe))));
        const center = (e, y) => { const t = Math.max(0, Math.min(1, (y - e.hip[1]) / (e.neck[1] - e.hip[1]))); return e.hip[2] * (1 - t) + e.neck[2] * t; };
        const support = (e, y, nx, nz) => {
            const list = e.bins.get(Math.floor(y / e.step));
            if (!list?.length) return null;
            const cz = center(e, y); let radius = -Infinity;
            for (const v of list) radius = Math.max(radius, e.P[v * 3] * nx + (e.P[v * 3 + 2] - cz) * nz);
            return radius;
        };
        const k = built.height / outfit.height;
        for (let i = 0; i < outfit.count; i++) {
            const v = outfit.tri[i * 3], hanging = outfit.surface[i] === 2 || (outfit.hang && outfit.hang[i] >= 0);
            if (an.member[v * 5 + 1] > 0.4 || an.member[v * 5 + 2] > 0.4) continue;
            const y0 = outfit.rest[i * 3 + 1];
            if (y0 > reference.neck[1] - 0.04 || (!hanging && y0 < reference.hip[1] * 0.88)) continue;
            const cz0 = center(reference, y0), x0 = outfit.rest[i * 3], z0 = outfit.rest[i * 3 + 2] - cz0, distance = Math.hypot(x0, z0);
            if (distance < 1e-6) continue;
            const nx = x0 / distance, nz = z0 / distance;
            const y = y0 < reference.hip[1] ? y0 / reference.hip[1] * target.hip[1] : target.hip[1] + (y0 - reference.hip[1]) / (reference.neck[1] - reference.hip[1]) * (target.neck[1] - target.hip[1]);
            const at0 = hanging ? Math.max(y0, reference.hip[1] * 0.95) : y0, at = hanging ? Math.max(y, target.hip[1] * 0.95) : y;
            const r0 = support(reference, at0, nx, nz), radius = support(target, at, nx, nz);
            if (r0 == null || radius == null) continue;
            // Keep the signed distance between overlapping loose panels. Clamping every
            // inner fold to the same radius presses separate layers into one another.
            const extra = preserveLayers ? distance - r0 : Math.max(0.003, Math.min(0.12, distance - r0)), r = radius + extra * k + GAP;
            out[i * 3] = nx * r; out[i * 3 + 1] = y; out[i * 3 + 2] = center(target, at) + nz * r;
        }
        return true;
    }

    /** Ease the fitted lower fabric itself; restoring source creases here recreates crossings. */
    function relaxHeavyFabric(outfit, out) {
        const graph = pointGraph(outfit), hip = outfit._envelope.hip[1];
        for (let pass = 0; pass < 6; pass++) {
            const next = Float32Array.from(out);
            for (let i = 0; i < outfit.count; i++) {
                const neighbors = graph[i], weight = 0.35 * Math.max(0, Math.min(1, (hip + 0.18 - outfit.rest[i * 3 + 1]) / 0.18));
                if (!neighbors.length || !weight) continue;
                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    for (const j of neighbors) sum += out[j * 3 + c];
                    next[i * 3 + c] = out[i * 3 + c] * (1 - weight) + sum / neighbors.length * weight;
                }
            }
            out.set(next);
        }
    }

    /** Keep a formerly sound small face from collapsing during the extra fabric relaxation. */
    function retainSmallFaces(outfit, out, fallback, scale) {
        const R = outfit.render.point;
        const area = (P, a, b, c) => {
            a *= 3; b *= 3; c *= 3;
            const x = P[b] - P[a], y = P[b + 1] - P[a + 1], z = P[b + 2] - P[a + 2];
            const u = P[c] - P[a], v = P[c + 1] - P[a + 1], w = P[c + 2] - P[a + 2];
            return Math.hypot(y * w - z * v, z * u - x * w, x * v - y * u);
        };
        for (let pass = 0; pass < 8; pass++) {
            const restore = new Set();
            for (const part of outfit.parts) for (let t = 0; t < part.index.length; t += 3) {
                const a = R[part.index[t]], b = R[part.index[t + 1]], c = R[part.index[t + 2]];
                const threshold = area(outfit.rest, a, b, c) * scale * scale * 0.012;
                if (area(out, a, b, c) < threshold && area(fallback, a, b, c) >= threshold) for (const v of [a, b, c]) restore.add(v);
            }
            if (!restore.size) break;
            for (const v of restore) for (let c = 0; c < 3; c++) out[v * 3 + c] = fallback[v * 3 + c];
        }
    }

    function laidBindings(pack, built, outfit, frame) {
        frame = frame || {};
        const P = surfacePositions(pack, built.shaped, frame);
        const F = allFaces(pack);
        const N = frame['transfer:normals'] || (frame['transfer:normals'] = faceNormals(P, F.all, pack.vertexCount, 2));
        const k = built.height / (outfit.height || built.height);
        const n = outfit.count, out = new Float32Array(n * 3), facing = new Float32Array(n);
        for (let i = 0; i < n; i++) facing[i] = lay(P, N, k, outfit.tri, outfit.bary, outfit.offset, outfit.world, outfit.farness, i, out, i * 3);
        // Where cloth leaves the body for the skirt: the two bindings eased into each other.
        const B = outfit.blend;
        if (B && B.ids.length) {
            const tmp = new Float32Array(3);
            for (let j = 0; j < B.ids.length; j++) {
                const i = B.ids[j], m = B.mix[j] / 255;
                if (!lay(P, N, k, B.tri, B.bary, B.offset, B.world, B.farness, j, tmp, 0) && B.tri[j * 3] === 0 && B.tri[j * 3 + 2] === 0) continue;
                for (let c = 0; c < 3; c++) out[i * 3 + c] += (tmp[c] - out[i * 3 + c]) * m;
            }
        }
        const Rg = outfit.rigid;
        if (Rg) {
            const neck = built.bones.find(b => b.name === 'Neck').head;
            for (let i = 0; i < n; i++) {
                const f = Rg.w[i] / 255;
                if (!f) continue;
                for (let c = 0; c < 3; c++) out[i * 3 + c] += (neck[c] + Rg.offset[i * 3 + c] * k - out[i * 3 + c]) * f;
            }
        }
        return { out, facing };
    }

    function fit(pack, built, outfit, frame) {
        frame = frame || {};
        const k = built.height / (outfit.height || built.height), n = outfit.count;
        const { out, facing } = laidBindings(pack, built, outfit, frame);
        if (outfit.rest) {
            if (!outfit._reference) {
                const reference = Body.build(pack, Object.assign({}, Body.DEFAULT_RECIPE, outfit.recipe || {}));
                outfit._reference = laidBindings(pack, reference, outfit, {}).out;
            }
            for (let i = 0; i < out.length; i++) out[i] += (outfit.rest[i] - outfit._reference[i]) * k;
        }
        relaxPanels(outfit, out, k, 16);
        keepLegsApart(pack, built, outfit, out, frame, facing);
        // Cloth riding the skirt hangs free of the skin: pushing each of its points out alone would press a panel's two faces together.
        const near = outfit._near || (outfit._near = Uint32Array.from({ length: n }, (_, i) => i).filter(i => outfit.surface[i] !== 2));
        if (outfit.rest) {
            // Collision displacement is shared across a panel before the next projection.
            for (let pass = 0; pass < 8; pass++) {
                Outfit.collide(pack, built, out, 0, n, GAP, frame, near);
                relaxPanels(outfit, out, k, 4);
            }
            pushSkirtOut(pack, built, outfit, out, frame);
            for (let pass = 0; pass < 5; pass++) {
                clearFaces(pack, built, outfit, out, frame);
                relaxPanels(outfit, out, k, 4);
                Outfit.collide(pack, built, out, 0, n, GAP, frame, near);
            }
            clearFaces(pack, built, outfit, out, frame);
            const loose = outfit.surface.some(s => s === 2), beforeEnvelope = loose ? Float32Array.from(out) : null;
            if (smoothHeavyPanels(pack, built, outfit, out, frame)) {
                relaxPanels(outfit, out, k, 6);
                if (loose) {
                    const fallback = Float32Array.from(out);
                    for (let pass = 0; pass < 5; pass++) Outfit.collide(pack, built, fallback, 0, n, GAP, frame, near);
                    out.set(beforeEnvelope);
                    smoothHeavyPanels(pack, built, outfit, out, frame, true);
                    relaxHeavyFabric(outfit, out);
                    for (let pass = 0; pass < 5; pass++) Outfit.collide(pack, built, out, 0, n, GAP, frame, near);
                    retainSmallFaces(outfit, out, fallback, k);
                    tailor();
                    return out;
                }
            }
            for (let pass = 0; pass < 5; pass++) Outfit.collide(pack, built, out, 0, n, GAP, frame, near);
            tailor();
            return out;
        }
        // Twice: in a hollow the skin nearest a point pushed out is another than before.
        Outfit.collide(pack, built, out, 0, n, GAP, frame, near);
        Outfit.collide(pack, built, out, 0, n, GAP, frame, near);
        holdClearance(pack, built, outfit, out, frame);
        // Twice: a lifted point can uncover the skin by its neighbor.
        clearSkin(pack, built, outfit, out, frame);
        clearSkin(pack, built, outfit, out, frame);
        pushSkirtOut(pack, built, outfit, out, frame);
        // Lifts of a hanging panel can change the nearest skin on its attached band.
        for (let pass = 0; pass < 6; pass++) Outfit.collide(pack, built, out, 0, n, GAP, frame, near);
        return out;

        function tailor() {
            const reference=outfit._tailorBody||(outfit._tailorBody=Body.build(pack,Object.assign({},Body.DEFAULT_RECIPE,outfit.recipe)));
            Outfit.tailorTorso(pack,built,reference,outfit.rest,out,frame,{source:Array.from({length:n},(_,i)=>outfit.tri[i*3]),hanging:i=>outfit.surface[i]===2||(outfit.hang&&outfit.hang[i]>=0),lift:GAP});
            for(let pass=0;pass<5;pass++)Outfit.collide(pack,built,out,0,n,GAP,frame,near);
        }
    }

    /**
     * Each point kept most of its own clearance above the skin it was taken
     * over (its skin triangle and height, scaled with the body), so a body
     * that swells between the cloth's bindings never comes through it.
     */
    function holdClearance(pack, built, outfit, out, frame) {
        const K = outfit.skin;
        if (!K) return;
        Outfit.collide(pack, built, new Float32Array(3), 0, 0, 0, frame);
        const S = built.shaped, N = frame.bodyNormals, k = built.height / (outfit.height || built.height);
        for (let i = 0; i < outfit.count; i++) {
            const a = K.tri[i * 3], b = K.tri[i * 3 + 1], c = K.tri[i * 3 + 2];
            if (!a && !b && !c) continue;
            const w0 = K.bary[i * 3], w1 = K.bary[i * 3 + 1], w2 = K.bary[i * 3 + 2];
            let nx = N[a * 3] * w0 + N[b * 3] * w1 + N[c * 3] * w2, ny = N[a * 3 + 1] * w0 + N[b * 3 + 1] * w1 + N[c * 3 + 1] * w2, nz = N[a * 3 + 2] * w0 + N[b * 3 + 2] * w1 + N[c * 3 + 2] * w2;
            const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
            const sx = S[a * 3] * w0 + S[b * 3] * w1 + S[c * 3] * w2, sy = S[a * 3 + 1] * w0 + S[b * 3 + 1] * w1 + S[c * 3 + 1] * w2, sz = S[a * 3 + 2] * w0 + S[b * 3 + 2] * w1 + S[c * 3 + 2] * w2;
            const want = Math.max(GAP, Math.min(0.08, K.height[i] * k * 0.8));
            const d = (out[i * 3] - sx) * nx + (out[i * 3 + 1] - sy) * ny + (out[i * 3 + 2] - sz) * nz;
            if (d >= want) continue;
            out[i * 3] += nx * (want - d); out[i * 3 + 1] += ny * (want - d); out[i * 3 + 2] += nz * (want - d);
        }
    }

    /**
     * The cloth kept clear of the skin it covers between its own vertices: each
     * covered skin vertex lifts the cloth point nearest it until the cloth
     * stands `gap` off that skin (a bulge under coarse cloth), the lift spread
     * over the cloth's neighbors so it stays smooth.
     */
    function clearSkin(pack, built, outfit, out, frame) {
        const gap = 0.005;
        if (!outfit._covered) {
            const all = new Set();
            for (const part of outfit.parts) for (const v of part.hidden) all.add(v);
            outfit._covered = Uint32Array.from(all);
            const eased = new Uint8Array(outfit.count), H = outfit.hang;
            if (outfit.blend) for (const i of outfit.blend.ids) eased[i] = 1;
            outfit._close = Uint32Array.from({ length: outfit.count }, (_, i) => i).filter(i => outfit.surface[i] !== 2 && !eased[i] && !(H && H[i] >= 0) && outfit.offset[i * 3] < 0.12);
        }
        if (!outfit._covered.length || !outfit._close.length) return;
        Outfit.collide(pack, built, new Float32Array(3), 0, 0, 0, frame);
        const S = built.shaped, N = frame.bodyNormals;
        const grid = Outfit.pointGrid(out, outfit._close, 0.02);
        const need = new Float32Array(outfit.count), dir = new Float32Array(outfit.count * 3);
        let any = false;
        for (const v of outfit._covered) {
            const x = S[v * 3], y = S[v * 3 + 1], z = S[v * 3 + 2], nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
            const q = grid.nearest(x, y, z, 5);
            if (q < 0) continue;
            const e = (out[q * 3] - x) * nx + (out[q * 3 + 1] - y) * ny + (out[q * 3 + 2] - z) * nz;
            if (e >= gap || e < -0.15) continue;
            if (gap - e > need[q]) { need[q] = gap - e; dir[q * 3] = nx; dir[q * 3 + 1] = ny; dir[q * 3 + 2] = nz; any = true; }
        }
        if (!any) return;
        const G = pointGraph(outfit);
        let lift = Float32Array.from(need);
        for (let pass = 0; pass < 2; pass++) {
            const next = Float32Array.from(lift);
            for (const i of outfit._close) for (const j of G[i]) if (lift[j] * 0.7 > next[i]) { next[i] = lift[j] * 0.7; if (!need[i]) { dir[i * 3] = dir[j * 3]; dir[i * 3 + 1] = dir[j * 3 + 1]; dir[i * 3 + 2] = dir[j * 3 + 2]; } }
            lift = next;
        }
        for (const i of outfit._close) {
            if (!lift[i]) continue;
            out[i * 3] += dir[i * 3] * lift[i]; out[i * 3 + 1] += dir[i * 3 + 1] * lift[i]; out[i * 3 + 2] += dir[i * 3 + 2] * lift[i];
        }
    }

    /** The height of a body's hips' top, a little over the hip joints. */
    function hipTopOf(built) {
        const l = built.bones.find(b => b.name === 'LeftUpLeg'), r = built.bones.find(b => b.name === 'RightUpLeg');
        return (l && r ? (l.head[1] + r.head[1]) / 2 : built.height * 0.53) + 0.12;
    }

    /**
     * Skirt cloth a body swells into is lifted out of it as a whole: each
     * point's need (how far under `gap` off the skin it hangs) spread over
     * its neighbors and eased, so a panel's faces and folds move together.
     */
    function pushSkirtOut(pack, built, outfit, out, frame) {
        // The loose cloth: what hangs (a coat's tails, its eased band over the hips), or what rides the skirt.
        const H = outfit.hang;
        const ids = outfit._loose || (outfit._loose = Uint32Array.from({ length: outfit.count }, (_, i) => i).filter(i => (H ? H[i] >= 0 : false) || outfit.surface[i] === 2));
        if (!ids.length) return;
        Outfit.collide(pack, built, new Float32Array(3), 0, 0, 0, frame);
        const S = built.shaped, Nb = frame.bodyNormals, grid = frame.bodyGrid, gap = 0.012, layerGap = 0.005;
        // The outfit's own inner layer (trousers under a coat): the loose cloth stays outside it too.
        const isLoose = new Uint8Array(outfit.count);
        for (const i of ids) isLoose[i] = 1;
        const hipTop = hipTopOf(built), innerIds = [];
        for (let i = 0; i < outfit.count; i++) if (!isLoose[i] && out[i * 3 + 1] < hipTop) innerIds.push(i);
        const inner = Outfit.pointGrid(out, innerIds, 0.02);
        const need = new Float32Array(outfit.count), dir = new Float32Array(outfit.count * 3);
        let any = false;
        for (const i of ids) {
            const q = grid.nearest(out[i * 3], out[i * 3 + 1], out[i * 3 + 2], 2);
            if (q < 0) continue;
            const nx = Nb[q * 3], ny = Nb[q * 3 + 1], nz = Nb[q * 3 + 2];
            const d = (out[i * 3] - S[q * 3]) * nx + (out[i * 3 + 1] - S[q * 3 + 1]) * ny + (out[i * 3 + 2] - S[q * 3 + 2]) * nz;
            dir[i * 3] = nx; dir[i * 3 + 1] = ny; dir[i * 3 + 2] = nz;
            let k = gap - d;
            const j = innerIds.length ? inner.nearest(out[i * 3], out[i * 3 + 1], out[i * 3 + 2], 2) : -1;
            if (j >= 0) {
                const ex = out[i * 3] - out[j * 3], ey = out[i * 3 + 1] - out[j * 3 + 1], ez = out[i * 3 + 2] - out[j * 3 + 2];
                const e = ex * nx + ey * ny + ez * nz, side = Math.hypot(ex - nx * e, ey - ny * e, ez - nz * e);
                if (side < 0.02 && e < layerGap) k = Math.max(k, layerGap - e);
            }
            if (k > 0) { need[i] = k; any = true; }
        }
        if (!any) return;
        const G = pointGraph(outfit);
        // Spread: a point lifts at least most of what its neighbors need, then the lift is eased.
        let lift = Float32Array.from(need);
        for (let pass = 0; pass < 6; pass++) {
            const next = Float32Array.from(lift);
            for (const i of ids) for (const j of G[i]) if (lift[j] * 0.85 > next[i]) next[i] = lift[j] * 0.85;
            lift = next;
        }
        for (let pass = 0; pass < 3; pass++) {
            const next = Float32Array.from(lift);
            for (const i of ids) { let s = lift[i] * 2, c = 2; for (const j of G[i]) { s += lift[j]; c++; } next[i] = Math.max(need[i], s / c); }
            lift = next;
        }
        for (const i of ids) {
            if (!lift[i]) continue;
            let dx = dir[i * 3], dy = dir[i * 3 + 1], dz = dir[i * 3 + 2];
            if (!dx && !dy && !dz) continue;
            out[i * 3] += dx * lift[i]; out[i * 3 + 1] += dy * lift[i]; out[i * 3 + 2] += dz * lift[i];
        }
    }

    /**
     * Each leg's cloth kept on its own side of the gap between the legs: a
     * point nearer the other leg's skin than its own is drawn back to halfway.
     */
    function keepLegsApart(pack, built, outfit, out, frame, facing) {
        const F = allFaces(pack), an = Outfit.anatomy(pack), S = built.shaped;
        let legs = frame['transfer:legs'];
        if (!legs) {
            const ids = [[], []];
            for (const v of pack._bodyIdsTransfer || (pack._bodyIdsTransfer = [...new Set(pack.body.source)].sort((a, b) => a - b))) {
                if (an.member[v * 5 + 3] > 0.7) ids[0].push(v); else if (an.member[v * 5 + 4] > 0.7) ids[1].push(v);
            }
            legs = frame['transfer:legs'] = ids.map(list => Outfit.pointGrid(S, list, 0.04));
        }
        const side = outfit._side || (outfit._side = Uint8Array.from({ length: outfit.count }, (_, i) => {
            const v = outfit.tri[i * 3];
            if (outfit.surface[i] === 2) return 0;
            return an.member[v * 5 + 3] > 0.6 ? 1 : an.member[v * 5 + 4] > 0.6 ? 2 : 0;
        }));
        for (let i = 0; i < outfit.count; i++) {
            if (!side[i]) continue;
            // Only cloth facing the other leg (the left leg is at +x).
            if (side[i] === 1 ? facing[i] > 0.2 : facing[i] < -0.2) continue;
            if (outfit.farness && outfit.farness[i] > 128) continue;
            const x = out[i * 3], y = out[i * 3 + 1], z = out[i * 3 + 2];
            const own = legs[side[i] - 1].nearest(x, y, z, 2), other = legs[2 - side[i]].nearest(x, y, z, 2);
            if (own < 0 || other < 0) continue;
            const a = [S[own * 3], S[own * 3 + 1], S[own * 3 + 2]], b = [S[other * 3], S[other * 3 + 1], S[other * 3 + 2]];
            // The plane halfway between the two skins, across the line joining them.
            const d = sub(b, a), l = len(d);
            if (l < 1e-6) continue;
            const u = mul(d, 1 / l), past = dot(sub([x, y, z], a), u) - l / 2 + 0.004;
            if (past <= 0) continue;
            out[i * 3] -= u[0] * past; out[i * 3 + 1] -= u[1] * past; out[i * 3 + 2] -= u[2] * past;
        }
    }

    /** Skin weights per point: its three bound vertices' weights, blended. */
    function pointSkin(pack, outfit) {
        if (outfit._skin) return outfit._skin;
        const n = outfit.count, joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4), sum = new Map();
        for (let i = 0; i < n; i++) {
            sum.clear();
            for (let k = 0; k < 3; k++) {
                const v = outfit.tri[i * 3 + k], w = outfit.bary[i * 3 + k];
                for (let q = 0; q < 4; q++) {
                    const ww = pack.skinWeights[v * 4 + q] * w;
                    if (ww > 0) sum.set(pack.skinJoints[v * 4 + q], (sum.get(pack.skinJoints[v * 4 + q]) || 0) + ww);
                }
            }
            const top = [...sum.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
            const total = top.reduce((s, [, w]) => s + w, 0) || 1;
            top.forEach(([j, w], q) => { joints[i * 4 + q] = j; weights[i * 4 + q] = w / total; });
            if (!top.length) weights[i * 4] = 1;
        }
        return (outfit._skin = { joints, weights });
    }

    // ── colors ────────────────────────────────────────────────────────────
    const toHex = c => '#' + c.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
    const fromHex = h => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    function hsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0;
        if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [(h * 60 + 360) % 360, mx > 0 ? d / mx : 0, mx];
    }
    function rgb(h, s, v) {
        const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
        const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
        return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
    }

    /**
     * The outfit's own colors, by how much of it each covers: its main color,
     * its second and its trim (the brightest of the rest), as hex, from the
     * picture's texels under its points.
     */
    function colorKeys(outfit, pic) {
        const U = outfit.render.uvs, seen = [];
        for (let i = 0; i < U.length / 2; i += 3) {
            const x = Math.min(pic.width - 1, Math.max(0, Math.floor(U[i * 2] * pic.width))), y = Math.min(pic.height - 1, Math.max(0, Math.floor(U[i * 2 + 1] * pic.height)));
            const q = (y * pic.width + x) * 4;
            seen.push([pic.data[q], pic.data[q + 1], pic.data[q + 2]]);
        }
        const centers = kMeans(seen, 6), count = centers.map(() => 0);
        for (const c of seen) { let b = 0, bd = Infinity; centers.forEach((k, j) => { const d = (k[0] - c[0]) ** 2 + (k[1] - c[1]) ** 2 + (k[2] - c[2]) ** 2; if (d < bd) { bd = d; b = j; } }); count[b]++; }
        const order = centers.map((c, j) => [c, count[j]]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
        const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 40;
        const main = order[0], second = order.find(c => far(c, main)) || null;
        const rest = order.filter(c => far(c, main) && (!second || far(c, second)));
        rest.sort((a, b) => hsv(...b)[2] - hsv(...a)[2]);
        return { color: toHex(main), color2: second ? toHex(second) : null, trim: rest.length ? toHex(rest[0]) : null };
    }

    /**
     * The picture in the item's colors: each texel near one of the outfit's
     * own colors (by hue and saturation, any shade) is turned to the chosen
     * color by the same hue turn, saturation and brightness ratio, so its
     * shading, weave and paint stay. Colors not chosen keep the picture's.
     */
    function recolor(pic, keys, item) {
        const want = [['color', item.color], ['color2', item.color2], ['trim', item.trim]].filter(([k, c]) => c && keys[k] && c.toLowerCase() !== keys[k].toLowerCase());
        if (!want.length) return pic;
        const moves = want.map(([k, c]) => {
            const from = hsv(...fromHex(keys[k])), to = hsv(...fromHex(c));
            return { from, dh: to[0] - from[0], ks: from[1] > 0.04 ? to[1] / from[1] : 1, add: from[1] > 0.04 ? 0 : to[1], kv: to[2] / Math.max(0.04, from[2]) };
        });
        const all = Object.values(keys).filter(Boolean).map(h => hsv(...fromHex(h)));
        const W = pic.width, H = pic.height, src = pic.data, out = new Uint8Array(src.length);
        const dist = (a, b) => {
            const dh = Math.min(Math.abs(a[0] - b[0]), 360 - Math.abs(a[0] - b[0])) / 180, sat = Math.min(a[1], b[1]);
            return Math.hypot(dh * sat * 2.2, (a[1] - b[1]) * 1.2, (a[2] - b[2]) * 0.6);
        };
        for (let q = 0; q < W * H * 4; q += 4) {
            out[q + 3] = src[q + 3];
            const c = hsv(src[q], src[q + 1], src[q + 2]);
            // Each texel goes with the outfit color it is nearest, by a little more the nearer it is.
            let best = Infinity;
            for (const k of all) best = Math.min(best, dist(c, k));
            let r = src[q], g = src[q + 1], b = src[q + 2];
            for (const m of moves) {
                const d = dist(c, m.from);
                if (d > best + 0.08 || d > 0.45) continue;
                const w = Math.max(0, Math.min(1, 1 - (d - best) / 0.08)) * Math.max(0, Math.min(1, (0.45 - d) / 0.15));
                const t = rgb(((c[0] + m.dh) % 360 + 360) % 360, Math.min(1, c[1] * m.ks + m.add), Math.min(1, c[2] * m.kv));
                r += (t[0] - r) * w; g += (t[1] - g) * w; b += (t[2] - b) * w;
            }
            out[q] = r; out[q + 1] = g; out[q + 2] = b;
        }
        return { width: W, height: H, data: out };
    }

    // ── storage ───────────────────────────────────────────────────────────
    /** An outfit as { json, bytes }: its layout and credits, and one binary of fixed-point arrays. */
    function encode(outfit, meta) {
        const chunks = [];
        let offset = 0;
        const put = typed => {
            const pad = (4 - (offset % 4)) % 4;
            if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
            const at = offset, bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
            chunks.push(bytes); offset += bytes.length;
            return [at, typed.length];
        };
        const n = outfit.count, r = outfit.render.point.length;
        let maxOffset = 1e-6, maxWorld = 1e-6;
        for (const x of outfit.offset) maxOffset = Math.max(maxOffset, Math.abs(x));
        for (const x of outfit.world) maxWorld = Math.max(maxWorld, Math.abs(x));
        if (outfit.blend) { for (const x of outfit.blend.offset) maxOffset = Math.max(maxOffset, Math.abs(x)); for (const x of outfit.blend.world) maxWorld = Math.max(maxWorld, Math.abs(x)); }
        const offsetScale = maxOffset / 32767, worldScale = maxWorld / 32767;
        const bary = new Uint16Array(n * 2);
        for (let i = 0; i < n; i++) { bary[i * 2] = Math.round(Math.max(0, Math.min(1, outfit.bary[i * 3])) * 65535); bary[i * 2 + 1] = Math.round(Math.max(0, Math.min(1, outfit.bary[i * 3 + 1])) * 65535); }
        const Index = r > 65535 ? Uint32Array : Uint16Array;
        const worldIds = Uint16Array.from({ length: n }, (_, i) => i).filter(i => outfit.farness[i]);
        const sparseWorld = worldIds.length * 8 < n * 6;
        const layout = {
            tri: put(Uint16Array.from(outfit.tri)), bary: put(bary),
            offset: put(Int16Array.from(outfit.offset, x => Math.round(x / offsetScale))),
            world: put(sparseWorld ? Int16Array.from({ length: worldIds.length * 3 }, (_, i) => Math.round(outfit.world[worldIds[(i / 3) | 0] * 3 + i % 3] / worldScale)) : Int16Array.from(outfit.world, x => Math.round(x / worldScale))),
            farness: put(Uint8Array.from(outfit.farness)), surface: put(Uint8Array.from(outfit.surface)),
            point: put(Uint16Array.from(outfit.render.point)), uv: put(Uint16Array.from(outfit.render.uvs, x => Math.round(Math.max(0, Math.min(1, x)) * 65535)))
        };
        if (sparseWorld) layout.worldIds = put(worldIds);
        if (outfit.hang) layout.hang = put(Int16Array.from(outfit.hang, x => Math.round(Math.max(-1, Math.min(3, x)) * 10000)));
        let restScale;
        if (outfit.rest) {
            let maxRest = 1e-6;
            for (const x of outfit.rest) maxRest = Math.max(maxRest, Math.abs(x));
            restScale = maxRest / 32767;
            layout.rest = put(Int16Array.from(outfit.rest, x => Math.round(x / restScale)));
        }
        if (outfit.skin) {
            const K = outfit.skin, ids = Uint16Array.from({ length: n }, (_, i) => i).filter(i => K.tri[i * 3] || K.tri[i * 3 + 1] || K.tri[i * 3 + 2]);
            const sb = new Uint16Array(ids.length * 2);
            ids.forEach((v, i) => { sb[i * 2] = Math.round(Math.max(0, Math.min(1, K.bary[v * 3])) * 65535); sb[i * 2 + 1] = Math.round(Math.max(0, Math.min(1, K.bary[v * 3 + 1])) * 65535); });
            layout.skin = { ids: put(ids), tri: put(Uint16Array.from({ length: ids.length * 3 }, (_, i) => K.tri[ids[(i / 3) | 0] * 3 + i % 3])), bary: put(sb), height: put(Int16Array.from(ids, v => Math.round(Math.max(-0.3, Math.min(0.3, K.height[v])) / 0.3 * 32767))) };
        }
        if (outfit.rigid) {
            let mr = 1e-6;
            for (const x of outfit.rigid.offset) mr = Math.max(mr, Math.abs(x));
            const ids = Uint16Array.from({ length: n }, (_, i) => i).filter(i => outfit.rigid.w[i]);
            layout.rigid = { ids: put(ids), w: put(Uint8Array.from(ids, v => outfit.rigid.w[v])), offset: put(Int16Array.from({ length: ids.length * 3 }, (_, i) => Math.round(outfit.rigid.offset[ids[(i / 3) | 0] * 3 + i % 3] / mr * 32767))), scale: mr / 32767 };
        }
        const B = outfit.blend;
        if (B && B.ids.length) {
            const bb = new Uint16Array(B.ids.length * 2);
            for (let i = 0; i < B.ids.length; i++) { bb[i * 2] = Math.round(Math.max(0, Math.min(1, B.bary[i * 3])) * 65535); bb[i * 2 + 1] = Math.round(Math.max(0, Math.min(1, B.bary[i * 3 + 1])) * 65535); }
            layout.blend = {
                ids: put(Uint16Array.from(B.ids)), mix: put(Uint8Array.from(B.mix)), tri: put(Uint16Array.from(B.tri)), bary: put(bb),
                offset: put(Int16Array.from(B.offset, x => Math.round(Math.max(-maxOffset, Math.min(maxOffset, x)) / offsetScale))),
                world: put(Int16Array.from(B.world, x => Math.round(Math.max(-maxWorld, Math.min(maxWorld, x)) / worldScale))), farness: put(Uint8Array.from(B.farness))
            };
        }
        const parts = outfit.parts.map(p => ({ id: p.id, triangles: p.index.length / 3, index: put(Index.from(p.index)), hidden: put(Uint16Array.from(p.hidden)) }));
        const bytes = new Uint8Array(offset);
        let at = 0;
        for (const c of chunks) { bytes.set(c, at); at += c.length; }
        const json = Object.assign({ format: 1 }, meta || {}, {
            height: outfit.height, recipe: outfit.recipe || {}, count: n, render: r, wide: Index === Uint32Array, offsetScale, worldScale, restScale, keys: outfit.keys || null,
            roughness: outfit.roughness, metalness: outfit.metalness, parts, layout
        });
        return { json, bytes };
    }

    /** An outfit read back from its layout and binary. */
    function decode(json, bytes) {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        const buffer = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
        const view = (Type, [offset, length]) => new Type(buffer, offset, length);
        const L = json.layout, n = json.count;
        const expand = (values, idsLayout, width) => {
            if (!idsLayout) return values;
            const ids = view(Uint16Array, idsLayout), out = new values.constructor(n * width);
            ids.forEach((v, i) => { for (let c = 0; c < width; c++) out[v * width + c] = values[i * width + c]; });
            return out;
        };
        const raw = view(Uint16Array, L.bary), bary = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { const a = raw[i * 2] / 65535, b = raw[i * 2 + 1] / 65535; bary[i * 3] = a; bary[i * 3 + 1] = b; bary[i * 3 + 2] = Math.max(0, 1 - a - b); }
        const Index = json.wide ? Uint32Array : Uint16Array;
        return {
            id: json.id, label: json.label, height: json.height, recipe: json.recipe || {}, count: n, keys: json.keys, roughness: json.roughness, metalness: json.metalness,
            tri: view(Uint16Array, L.tri), bary,
            offset: Float32Array.from(view(Int16Array, L.offset), x => x * json.offsetScale),
            world: expand(Float32Array.from(view(Int16Array, L.world), x => x * json.worldScale), L.worldIds, 3),
            rest: L.rest ? Float32Array.from(view(Int16Array, L.rest), x => x * json.restScale) : null,
            farness: view(Uint8Array, L.farness), surface: view(Uint8Array, L.surface),
            hang: L.hang ? Float32Array.from(view(Int16Array, L.hang), x => x / 10000) : null,
            rigid: L.rigid ? { w: expand(view(Uint8Array, L.rigid.w), L.rigid.ids, 1), offset: expand(Float32Array.from(view(Int16Array, L.rigid.offset), x => x * L.rigid.scale), L.rigid.ids, 3) } : null,
            skin: L.skin ? (() => {
                const raw3 = view(Uint16Array, L.skin.bary), by = new Float32Array(raw3.length / 2 * 3);
                for (let i = 0; i < raw3.length / 2; i++) { const x = raw3[i * 2] / 65535, y = raw3[i * 2 + 1] / 65535; by[i * 3] = x; by[i * 3 + 1] = y; by[i * 3 + 2] = Math.max(0, 1 - x - y); }
                return { tri: expand(view(Uint16Array, L.skin.tri), L.skin.ids, 3), bary: expand(by, L.skin.ids, 3), height: expand(Float32Array.from(view(Int16Array, L.skin.height), x => x / 32767 * 0.3), L.skin.ids, 1) };
            })() : null,
            blend: L.blend ? (() => {
                const b = L.blend, raw2 = view(Uint16Array, b.bary), m = raw2.length / 2, by = new Float32Array(m * 3);
                for (let i = 0; i < m; i++) { const x = raw2[i * 2] / 65535, y = raw2[i * 2 + 1] / 65535; by[i * 3] = x; by[i * 3 + 1] = y; by[i * 3 + 2] = Math.max(0, 1 - x - y); }
                return { ids: view(Uint16Array, b.ids), mix: view(Uint8Array, b.mix), tri: view(Uint16Array, b.tri), bary: by,
                    offset: Float32Array.from(view(Int16Array, b.offset), x => x * json.offsetScale), world: Float32Array.from(view(Int16Array, b.world), x => x * json.worldScale), farness: view(Uint8Array, b.farness) };
            })() : null,
            render: { point: view(Uint16Array, L.point), uvs: Float32Array.from(view(Uint16Array, L.uv), x => x / 65535) },
            parts: json.parts.map(p => ({ id: p.id, index: Uint32Array.from(view(Index, p.index)), hidden: view(Uint16Array, p.hidden) })),
            picture: json.picture, size: json.size, json
        };
    }

    // ── the outfits on hand ───────────────────────────────────────────────
    /** Outfits by key: built-in ones ('carol') from the editor's data folder, a project's ('project:<folder>') from its 3d/Outfits. */
    /** The outfits the editor ships, taken from the Demo's Star Shift actors. */
    const BUILT_IN = ['carol', 'jolt', 'max', 'vay'];
    const store = { outfits: new Map(), folders: new Map(), pictures: new Map(), tints: new Map(), pending: new Map(), listeners: new Set() };

    /** Where an outfit's files are: { dir, name }, or null. */
    function filesOf(key) {
        if (store.folders.has(key)) return store.folders.get(key);
        if (typeof require !== 'function') return null;
        const path = require('path');
        return { dir: path.join(Body.dataFolder(), 'outfits'), name: key };
    }

    /** An outfit by key, read once; null when its files are missing. */
    function load(key) {
        if (store.outfits.has(key)) return store.outfits.get(key);
        let outfit = null;
        try {
            const at = filesOf(key);
            if (at && typeof require === 'function') {
                const fs = require('fs'), path = require('path');
                const file = path.join(at.dir, at.name + '.json');
                if (fs.existsSync(file)) {
                    outfit = decode(JSON.parse(fs.readFileSync(file, 'utf8')), fs.readFileSync(path.join(at.dir, at.name + '.bin')));
                    outfit.key = key;
                    outfit.pictureFile = path.join(at.dir, outfit.picture || at.name + '.jpg');
                }
            }
        } catch (error) {
            if (typeof console !== 'undefined') console.warn('[RRCharacterOutfitTransfer] outfit', key, error);
        }
        store.outfits.set(key, outfit);
        return outfit;
    }

    /** Called (once per picture) when an outfit's picture has been decoded: the page builds again. */
    function onPicture(fn) { store.listeners.add(fn); return () => store.listeners.delete(fn); }

    /**
     * An outfit's picture as RGBA: decoded (a page decodes it in the
     * background the first time, standing in its mean color meanwhile), or
     * the stand-in where nothing can decode it (node).
     */
    function picture(outfit) {
        const have = store.pictures.get(outfit.key);
        if (have) return have;
        if (!store.pending.has(outfit.key)) store.pending.set(outfit.key, decodePicture(outfit).then(pic => {
            if (!pic) return null;
            store.pictures.set(outfit.key, pic);
            for (const fn of store.listeners) { try { fn(outfit.key); } catch (e) { /* a listener's own fault */ } }
            return pic;
        }));
        const c = outfit.keys && outfit.keys.color ? fromHex(outfit.keys.color) : [128, 128, 128];
        const data = new Uint8Array(4 * 4 * 4);
        for (let i = 0; i < 16; i++) data.set([c[0], c[1], c[2], 255], i * 4);
        return { width: 4, height: 4, data, standIn: true };
    }

    /** Every listed outfit's picture decoded (a page's builder calls it while it opens). */
    function preload(keys) { return Promise.all(keys.map(k => { const o = load(k); if (!o) return null; picture(o); return store.pending.get(o.key); })); }

    async function decodePicture(outfit) {
        if (typeof createImageBitmap !== 'function' || typeof require !== 'function') return null;
        try {
            const fs = require('fs');
            const bytes = fs.readFileSync(outfit.pictureFile);
            const bitmap = await createImageBitmap(new Blob([bytes], { type: /\.png$/i.test(outfit.pictureFile) ? 'image/png' : 'image/jpeg' }));
            const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(bitmap.width, bitmap.height) : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            return { width: bitmap.width, height: bitmap.height, data: new Uint8Array(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer) };
        } catch (error) {
            if (typeof console !== 'undefined') console.warn('[RRCharacterOutfitTransfer] picture', outfit.pictureFile, error);
            return null;
        }
    }

    /** The picture an item shows: the outfit's own, or recolored to the item's colors (the last few kept). */
    function pictureFor(outfit, item) {
        const own = picture(outfit);
        const colors = [item.color || null, item.color2 || null, item.trim || null];
        const base = 'outfit-' + String(outfit.key).replace(/[^a-z0-9]+/gi, '-');
        if ((!colors[0] && !colors[1] && !colors[2]) || own.standIn || !outfit.keys) return Object.assign({}, own, { name: base + '.png' });
        const key = outfit.key + ':' + colors.join(',');
        let pic = store.tints.get(key);
        if (!pic) {
            pic = recolor(own, outfit.keys, item);
            store.tints.set(key, pic);
            if (store.tints.size > 6) store.tints.delete(store.tints.keys().next().value);
        }
        let h = 0;
        for (const ch of colors.join(',')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return Object.assign({}, pic, { name: base + '-' + h.toString(36) + '.png' });
    }

    // ── wearing items ─────────────────────────────────────────────────────
    /**
     * Garment items taken from models, on a built body: `items` with their
     * catalog entries ({ transfer: outfit key, part: part id, label }) from
     * `defOf(item)`. Returns [{ part, texture, hidden }].
     */
    function buildAll(pack, built, items, frame, defOf) {
        const out = [], lined = new Set();
        for (const item of items) {
            const def = defOf(item);
            const outfit = def && load(def.transfer);
            if (!outfit) continue;
            const piece = outfit.parts.find(p => p.id === def.part);
            if (!piece) continue;
            const fkey = 'transfer:fit:' + outfit.key;
            const pts = frame[fkey] || (frame[fkey] = fit(pack, built, outfit, frame));
            const R = outfit.render, n = R.point.length;
            const skin = pointSkin(pack, outfit);
            const texture = pictureFor(outfit, item);
            const anchor = anchors(pack, outfit);
            const hang = outfit.hang ? Float32Array.from(R.point, p => outfit.hang[p]) : null;
            const part = {
                name: def.label, positions: Body.gather(pts, R.point, 3), normals: Body.normals(pts, R.point, piece.index, outfit.count),
                uvs: R.uvs, index: piece.index, joints: Body.gather(skin.joints, R.point, 4), weights: Body.gather(skin.weights, R.point, 4),
                source: Int32Array.from(R.point, p => anchor[p]), texture: texture.name,
                roughness: def.roughness ?? outfit.roughness ?? 0.8, metalness: def.metalness ?? outfit.metalness ?? 0, doubleSided: true
            };
            if (hang && hang.some(x => x >= 0)) { part.hang = hang; part.keepShape = true; }
            const lining = liningFor(pack, built, outfit, piece, pts, def.label, texture.name, lined);
            if (lining) out.push({ part: lining, texture, hidden: piece.hidden });
            out.push({ part, texture, hidden: piece.hidden });
        }
        return out;
    }

    /** Fabric backing under covered panels shares the body's deformation and closes moving seams. */
    function liningFor(pack, built, outfit, piece, points, label, texture, drawn) {
        const body = built.parts[0], source = pack.body.source;
        const cache = outfit._linings || (outfit._linings = new Map());
        let lining = cache.get(piece.id);
        if (!lining) {
            const covered = new Set(piece.hidden), index = [];
            const neighbors = pack._skinNeighbors || (pack._skinNeighbors = neighborLists(bindSurfaces(pack).body, pack.vertexCount));
            // The backing overlaps panel edges by one skin ring so adjacent moving panels share fabric.
            const edge = new Set();
            for (const v of covered) for (const u of neighbors[v] || []) edge.add(u);
            for (const v of edge) covered.add(v);
            for (let t = 0; t < body.index.length; t += 3) {
                const a = body.index[t], b = body.index[t + 1], c = body.index[t + 2];
                if (covered.has(source[a]) && covered.has(source[b]) && covered.has(source[c])) index.push(a, b, c);
            }
            if (!index.length) { cache.set(piece.id, { index: new Uint32Array(0) }); return null; }
            const positions = Body.gather(points, outfit.render.point, 3), grid = triangleGrid(positions, piece.index, 0.025);
            const uvs = new Float32Array(source.length * 2), done = new Set();
            for (const r of index) {
                if (done.has(r)) continue;
                done.add(r);
                const p = Array.from(body.positions.subarray(r * 3, r * 3 + 3));
                const hit = nearestTriangle(grid, p, 0.2);
                if (!hit) continue;
                for (let k = 0; k < 3; k++) {
                    const v = piece.index[hit.t * 3 + k];
                    uvs[r * 2] += outfit.render.uvs[v * 2] * hit.bary[k];
                    uvs[r * 2 + 1] += outfit.render.uvs[v * 2 + 1] * hit.bary[k];
                }
            }
            lining = { index: Uint32Array.from(index), uvs };
            cache.set(piece.id, lining);
        }
        if (!lining.index.length) return null;
        const index = [];
        for (let t = 0; t < lining.index.length; t += 3) {
            const ids = [lining.index[t], lining.index[t + 1], lining.index[t + 2]];
            const key = outfit.key + ':' + ids.join(':');
            if (drawn.has(key)) continue;
            drawn.add(key); index.push(...ids);
        }
        if (!index.length) return null;
        const positions = Float32Array.from(body.positions), gap = 0.0012 * built.height / 1.7;
        for (let i = 0; i < positions.length; i++) positions[i] += body.normals[i] * gap;
        return { name: label + ' lining', positions, normals: body.normals, uvs: lining.uvs, index: Uint32Array.from(index),
            joints: body.joints, weights: body.weights, source, texture, roughness: outfit.roughness ?? 0.8, metalness: 0, doubleSided: true, rrLining: true };
    }

    /** Each point's skin vertex (the one its bound point rides, through a helper's own binding). */
    function anchors(pack, outfit) {
        if (outfit._anchor) return outfit._anchor;
        const via = new Map();
        for (const name of ['tights', 'skirt']) { const b = Outfit.binding(pack, name); b.ids.forEach((v, i) => via.set(v, b.tri[i * 3])); }
        return (outfit._anchor = Int32Array.from({ length: outfit.count }, (_, i) => { const v = outfit.tri[i * 3]; return via.has(v) ? via.get(v) : v; }));
    }

    // ── a project's own models ────────────────────────────────────────────
    /** Texels no part's triangle shows (a few past each edge kept for the smaller mip levels) made the outfit's mean color. */
    function flatten(pic, outfit) {
        const W = pic.width, H = pic.height, used = new Uint8Array(W * H), U = outfit.render.uvs;
        for (const part of outfit.parts) for (let t = 0; t < part.index.length; t += 3) {
            const px = [0, 1, 2].map(k => U[part.index[t + k] * 2] * W), py = [0, 1, 2].map(k => U[part.index[t + k] * 2 + 1] * H);
            const area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]);
            if (Math.abs(area) < 1e-9) continue;
            const tol = -3 / Math.sqrt(Math.abs(area));
            for (let y = Math.max(0, Math.floor(Math.min(...py)) - 4); y <= Math.min(H - 1, Math.ceil(Math.max(...py)) + 4); y++)
                for (let x = Math.max(0, Math.floor(Math.min(...px)) - 4); x <= Math.min(W - 1, Math.ceil(Math.max(...px)) + 4); x++) {
                    const cx = x + 0.5, cy = y + 0.5;
                    const w0 = ((px[1] - cx) * (py[2] - cy) - (px[2] - cx) * (py[1] - cy)) / area, w1 = ((px[2] - cx) * (py[0] - cy) - (px[0] - cx) * (py[2] - cy)) / area;
                    if (w0 >= tol && w1 >= tol && 1 - w0 - w1 >= tol) used[y * W + x] = 1;
                }
        }
        const mean = [0, 0, 0];
        let n = 0;
        for (let q = 0; q < W * H; q++) if (used[q]) { mean[0] += pic.data[q * 4]; mean[1] += pic.data[q * 4 + 1]; mean[2] += pic.data[q * 4 + 2]; n++; }
        const data = Uint8Array.from(pic.data);
        for (let q = 0; q < W * H; q++) if (!used[q]) { data[q * 4] = mean[0] / Math.max(1, n); data[q * 4 + 1] = mean[1] / Math.max(1, n); data[q * 4 + 2] = mean[2] / Math.max(1, n); data[q * 4 + 3] = 255; }
        return { width: W, height: H, data, used: n / (W * H) };
    }

    /** The humanoid roles an outfit can be taken from: a model needs all of them. */
    const NEEDS = ['Hips', 'Head', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];

    /** Whether a GLB holds a skinned humanoid, from its JSON alone. */
    function isHumanoid(bytes) {
        try {
            const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
            if (u8.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) return false;
            const json = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + dv.getUint32(12, true))));
            const node = (json.nodes || []).find(n => n.mesh != null && n.skin != null);
            if (!node) return false;
            const joints = json.skins[node.skin].joints, parentOf = new Map();
            json.nodes.forEach((n, i) => (n.children || []).forEach(c => parentOf.set(c, i)));
            const roles = new Set(roleMap(joints.map(j => ({ name: json.nodes[j].name || '', parent: joints.indexOf(parentOf.get(j)) }))));
            return NEEDS.every(r => roles.has(r));
        } catch (error) { return false; }
    }

    /** A project's humanoid models (under its 3d folder, not the builder's own characters): [{ name, file }]. */
    function listModels(projectPath) {
        const fs = require('fs'), path = require('path');
        const out = [], top = path.join(projectPath, '3d');
        const walk = (dir, depth) => {
            let list = [];
            try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
            for (const e of list.sort((a, b) => a.name.localeCompare(b.name))) {
                const at = path.join(dir, e.name);
                if (e.isDirectory()) { if (depth < 4 && !e.name.startsWith('.') && !(depth === 0 && (e.name === 'Characters' || e.name === 'Outfits'))) walk(at, depth + 1); continue; }
                if (!/\.glb$/i.test(e.name)) continue;
                // Only the JSON chunk is read to tell what the model is.
                let head = null, fd;
                try {
                    fd = fs.openSync(at, 'r');
                    const first = Buffer.alloc(20);
                    fs.readSync(fd, first, 0, 20, 0);
                    const size = first.readUInt32LE(12);
                    if (size > 16 * 1024 * 1024 || size + 20 > fs.fstatSync(fd).size) continue;
                    head = Buffer.alloc(20 + size);
                    fs.readSync(fd, head, 0, 20 + size, 0);
                } catch (error) { continue; }
                finally { if (fd != null) fs.closeSync(fd); }
                if (!isHumanoid(head)) continue;
                const parent = path.basename(path.dirname(at));
                const modelDir = parent === 'source' ? path.dirname(path.dirname(at)) : path.dirname(at);
                const thumbnail = ['thumbnail.png', 'thumbnail.webp', 'thumbnail.jpg', 'preview.png', 'preview.webp', 'preview.jpg'].map(n => path.join(modelDir, n)).find(f => fs.existsSync(f)) || null;
                out.push({ name: parent === 'source' ? path.basename(modelDir) : path.basename(at, path.extname(at)), file: at, thumbnail });
            }
        };
        walk(top, 0);
        return out;
    }

    /** A garment and an outfit for a taken outfit, in the wardrobe's catalog (once). */
    function register(Wardrobe, key, label) {
        const base = 'taken_' + String(key).replace(/^project:/, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
        let id = base, suffix = 2;
        while (Wardrobe.BY_ID.has(id) && Wardrobe.BY_ID.get(id).transfer !== key) id = base + '_' + suffix++;
        if (!Wardrobe.BY_ID.has(id)) {
            const g = { id, label, slot: 'dress', group: 'From 3D models', transfer: key, part: 'outfit', roughness: 0.6, metalness: 0, knobs: [], defaults: { material: 'cloth' }, pieces: () => [] };
            Wardrobe.GARMENTS.push(g);
            Wardrobe.BY_ID.set(id, g);
            Wardrobe.PRESETS.push({ id, label, group: 'From 3D models', items: [{ id }] });
        }
        return id;
    }

    /** The outfits a project has taken from its models (3d/Outfits/<name>/outfit.*), in the wardrobe's catalog. */
    function registerProject(Wardrobe, projectPath) {
        const fs = require('fs'), path = require('path');
        const dir = path.join(projectPath, '3d', 'Outfits'), ids = [];
        for (const g of [...Wardrobe.GARMENTS]) if (g.transfer && g.transfer.startsWith('project:')) unregister(Wardrobe, g.transfer);
        let list = [];
        try { list = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort(); } catch (e) { return ids; }
        for (const name of list) {
            const at = path.join(dir, name);
            if (!fs.existsSync(path.join(at, 'outfit.json'))) continue;
            const key = 'project:' + name;
            store.folders.set(key, { dir: at, name: 'outfit' });
            let label = name;
            try { label = JSON.parse(fs.readFileSync(path.join(at, 'outfit.json'), 'utf8')).label || name; } catch (e) { /* the folder's name */ }
            ids.push(register(Wardrobe, key, label));
        }
        return ids;
    }

    /** RGBA from an encoded picture (a page's decoder). */
    async function decodeBytes(bytes, mime) {
        const bitmap = await createImageBitmap(new Blob([bytes], { type: mime || 'image/png' }));
        const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(bitmap.width, bitmap.height) : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        return { width: bitmap.width, height: bitmap.height, data: new Uint8Array(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer) };
    }

    async function encodeJpeg(pic) {
        const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(pic.width, pic.height) : Object.assign(document.createElement('canvas'), { width: pic.width, height: pic.height });
        const ctx = canvas.getContext('2d');
        ctx.putImageData(new ImageData(new Uint8ClampedArray(pic.data.buffer, pic.data.byteOffset, pic.data.length), pic.width, pic.height), 0, 0);
        const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 }) : await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.88));
        return new Uint8Array(await blob.arrayBuffer());
    }

    /** Remove a project's or preview's catalog entries and decoded resources. */
    function unregister(Wardrobe, key) {
        const ids = new Set(Wardrobe.GARMENTS.filter(g => g.transfer === key).map(g => g.id));
        for (let i = Wardrobe.GARMENTS.length - 1; i >= 0; i--) if (ids.has(Wardrobe.GARMENTS[i].id)) Wardrobe.GARMENTS.splice(i, 1);
        for (let i = Wardrobe.PRESETS.length - 1; i >= 0; i--) if (ids.has(Wardrobe.PRESETS[i].id)) Wardrobe.PRESETS.splice(i, 1);
        for (const id of ids) Wardrobe.BY_ID.delete(id);
        for (const field of ['outfits', 'folders', 'pictures', 'pending']) store[field].delete(key);
        for (const k of [...store.tints.keys()]) if (k.startsWith(key + ':')) store.tints.delete(k);
    }

    const IMPORT_PARTS = [
        { id: 'body', label: 'Body' }, { id: 'arms', label: 'Arms' }, { id: 'legs', label: 'Legs' },
        { id: 'feet', label: 'Boots' }, { id: 'hands', label: 'Gloves' }
    ];
    let previewSerial = 0;

    /** Fit selected anatomical regions; callable on the page or in its import worker. */
    function importModel(pack, model, picture, recipe, parts) {
        const selected = new Set(parts || IMPORT_PARTS.filter(p => p.id !== 'hands').map(p => p.id));
        const region = i => /Hand$/.test(i.role) || i.arm > 2.95 ? 'hands'
            : i.arm > -1 ? 'arms' : i.leg > 1.8 ? 'feet' : i.leg > -1 && !i.loose ? 'legs' : 'body';
        return transfer(pack, model, {
            picture, recipe: { gender: recipe && recipe.gender != null ? recipe.gender : 0.5 }, gap: 0.004, reach: 0.008, swell: 0.008, triangles: 26000,
            parts: [{ id: null, test: i => !selected.has(region(i)) }, { id: 'outfit' }]
        });
    }

    /** Prepare an in-memory outfit for Keep/Discard; no project files are written. */
    async function prepareFrom(pack, Wardrobe, file, projectPath, recipe, options) {
        const fs = require('fs'), path = require('path'), o = options || {};
        const progress = async (stage, value) => {
            if (o.progress) o.progress(stage, value);
            await new Promise(resolve => setTimeout(resolve, 0));
        };
        await progress('read', 0.05);
        const model = readModel(fs.readFileSync(file));
        if (!model || !model.image) return null;
        if (o.parts && !o.parts.length) return null;
        const pic = await decodeBytes(model.image.bytes, model.image.mime);
        await progress('fit', 0.2);
        const outfit = o.compute ? await o.compute(model, pic, recipe, o.parts) : importModel(pack, model, pic, recipe, o.parts);
        if (!outfit.parts.length || outfit.parts.every(p => p.index.length < 3)) return null;
        await progress('picture', 0.8);
        const flat = flatten(outfit.picture || pic, outfit);
        outfit.keys = colorKeys(outfit, flat);
        const listed = listModels(projectPath).find(m => m.file === file);
        const label = (listed && listed.name) || path.basename(file, path.extname(file));
        const key = 'preview:' + ++previewSerial;
        outfit.key = key;
        store.outfits.set(key, outfit);
        store.pictures.set(key, flat);
        const id = register(Wardrobe, key, label);
        await progress('ready', 1);
        return { key, id, label, outfit, picture: flat, file, projectPath, state: 'prepared' };
    }

    /** Keep a prepared outfit under a fresh folder name; existing outfits are preserved. */
    async function keepPrepared(Wardrobe, prepared, thumbnail) {
        if (!prepared || prepared.state !== 'prepared') throw new Error('Outfit is not prepared');
        const fs = require('fs'), path = require('path');
        const { outfit, picture: pic, file, projectPath, label } = prepared;
        const stem = label.replace(/[\\/:*?"<>|]+/g, ' ').replace(/^\.+|\.+$/g, '').trim().slice(0, 80) || 'Outfit';
        const top = path.join(projectPath, '3d', 'Outfits');
        fs.mkdirSync(top, { recursive: true });
        let name = stem, suffix = 2;
        while (fs.existsSync(path.join(top, name))) name = stem + ' (' + suffix++ + ')';
        const dir = path.join(top, name);
        const { json, bytes } = encode(outfit, { id: name, label, picture: 'outfit.jpg', size: [pic.width, pic.height], source: path.relative(projectPath, file).split(path.sep).join('/') });
        const jpg = await encodeJpeg(pic);
        const staging = fs.mkdtempSync(path.join(top, '.import-'));
        try {
            fs.writeFileSync(path.join(staging, 'outfit.json'), JSON.stringify(json));
            fs.writeFileSync(path.join(staging, 'outfit.bin'), bytes);
            fs.writeFileSync(path.join(staging, 'outfit.jpg'), jpg);
            const thumbnailType = thumbnail && /^data:image\/(png|webp|jpeg);base64,/.exec(thumbnail);
            if (thumbnailType) fs.writeFileSync(path.join(staging, 'thumbnail.' + (thumbnailType[1] === 'jpeg' ? 'jpg' : thumbnailType[1])), Buffer.from(thumbnail.split(',')[1], 'base64'));
            fs.renameSync(staging, dir);
        } catch (error) { fs.rmSync(staging, { recursive: true, force: true }); throw error; }
        const key = 'project:' + name;
        store.folders.set(key, { dir, name: 'outfit' });
        store.pictures.set(key, pic);
        load(key);
        const id = register(Wardrobe, key, label);
        unregister(Wardrobe, prepared.key);
        prepared.state = 'kept';
        return id;
    }

    function discardPrepared(Wardrobe, prepared) {
        if (!prepared || prepared.state !== 'prepared') return;
        unregister(Wardrobe, prepared.key);
        prepared.state = 'discarded';
    }

    /** Move a user outfit out of Outfits; the returned undo restores its files and catalog entry. */
    function removeProject(Wardrobe, projectPath, key) {
        if (typeof key !== 'string' || !key.startsWith('project:')) throw new Error('Only project outfits can be deleted');
        const fs = require('fs'), path = require('path');
        const name = key.slice(8);
        if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new Error('Invalid outfit folder');
        const top = path.resolve(projectPath, '3d', 'Outfits'), dir = path.join(top, name);
        const def = Wardrobe.GARMENTS.find(g => g.transfer === key);
        const label = def ? def.label : name;
        const trash = path.join(projectPath, '3d', '.outfit-trash');
        fs.mkdirSync(trash, { recursive: true });
        const backup = fs.mkdtempSync(path.join(trash, 'outfit-'));
        const saved = path.join(backup, name);
        fs.renameSync(dir, saved);
        unregister(Wardrobe, key);
        let restored = false;
        return { key, label, undo() {
            if (restored) return null;
            if (fs.existsSync(dir)) throw new Error('An outfit already occupies this folder');
            fs.renameSync(saved, dir);
            fs.rmdirSync(backup);
            store.folders.set(key, { dir, name: 'outfit' });
            const id = register(Wardrobe, key, label);
            restored = true;
            return id;
        } };
    }

    /** Prepare and keep directly for callers that do not use the preview picker. */
    async function takeFrom(pack, Wardrobe, file, projectPath, recipe, options) {
        const prepared = await prepareFrom(pack, Wardrobe, file, projectPath, recipe, options);
        if (!prepared) return null;
        try { return await keepPrepared(Wardrobe, prepared); }
        catch (error) { discardPrepared(Wardrobe, prepared); throw error; }
    }

    const api = {
        GAP, readModel, normalizeModel, repose, roleMap, landmarks, skeletonMoves, poseBody, drawIn, keepVertices, cutMesh, weld,
        transfer, fit, pointSkin, frameAt, bindSurfaces, surfacePositions, triangleGrid, nearestTriangle, rayHits, fillHoles, triangulateLoop, isGarmentOpening,
        BUILT_IN, colorKeys, recolor, encode, decode, load, picture, preload, onPicture, pictureFor, buildAll, store,
        flatten, isHumanoid, listModels, register, unregister, registerProject, IMPORT_PARTS, importModel, prepareFrom, keepPrepared, discardPrepared, removeProject, takeFrom
    };
    root.RRCharacterOutfitTransfer = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
