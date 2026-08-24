/**
 * ModelRigger - fit a humanoid skeleton to a static mesh and bind skin
 * weights, entirely in the editor. Pure math, no three.js: positions come
 * in as arrays, weights go out as quantized bytes, so the solver is
 * testable headless and the runtime replays the result without solving.
 *
 * The rig lives in model.json as
 *   rig: {
 *     markers: { headTop:[x,y,z], chin:[...], ... },       // editor fit points
 *     bones:   [{ name, parent, head:[x,y,z], tail:[x,y,z] }, ...],
 *     weights: { "<meshIndex>": { count, indices, weights } }   // base64
 *   }
 * with every position in model space — the same space carve pivots use —
 * and mesh indices counted by Reactor3D.carveTargetMeshes' enumeration.
 * A model uses a rig OR carved parts, never both: both key mesh indices
 * and geometry against the uncarved model.
 */
(function(root) {
    'use strict';

    const lerp3 = (a, b, t) => [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t
    ];

    function boneBuilder(bones) {
        return (name, parentName, head, tail) => {
            const parent = bones.findIndex(bone => bone.name === parentName);
            bones.push({ name, parent, head: head.slice(), tail: tail.slice() });
        };
    }

    /**
     * Rig templates: each fits a family of models. Markers are what the
     * user drags (mirrored pairs move together); bones derive from them.
     * Preset motions target these standard bone names, so a correctly
     * fitted rig gets the whole motion library plug-and-play.
     */
    const TEMPLATES = {
        humanoid: {
            label: 'Humanoid',
            markers: [
                { key: 'headTop', label: 'Head top' },
                { key: 'chin', label: 'Chin' },
                { key: 'hips', label: 'Hips' },
                { key: 'shoulderL', label: 'Left shoulder', mirror: 'shoulderR' },
                { key: 'shoulderR', label: 'Right shoulder', mirror: 'shoulderL' },
                { key: 'elbowL', label: 'Left elbow', mirror: 'elbowR' },
                { key: 'elbowR', label: 'Right elbow', mirror: 'elbowL' },
                { key: 'wristL', label: 'Left wrist', mirror: 'wristR' },
                { key: 'wristR', label: 'Right wrist', mirror: 'wristL' },
                { key: 'kneeL', label: 'Left knee', mirror: 'kneeR' },
                { key: 'kneeR', label: 'Right knee', mirror: 'kneeL' },
                { key: 'ankleL', label: 'Left ankle', mirror: 'ankleR' },
                { key: 'ankleR', label: 'Right ankle', mirror: 'ankleL' }
            ],
            defaults(h, halfW, halfD) {
                const at = (fx, fy) => [halfW * fx, h * fy, 0];
                return {
                    headTop: at(0, 1.0), chin: at(0, 0.86), hips: at(0, 0.51),
                    shoulderL: at(0.42, 0.8), shoulderR: at(-0.42, 0.8),
                    elbowL: at(0.62, 0.62), elbowR: at(-0.62, 0.62),
                    wristL: at(0.68, 0.45), wristR: at(-0.68, 0.45),
                    kneeL: at(0.2, 0.27), kneeR: at(-0.2, 0.27),
                    ankleL: at(0.22, 0.05), ankleR: at(-0.22, 0.05)
                };
            },
            bones(m) {
                const bones = [];
                const add = boneBuilder(bones);
                const neckBase = lerp3(m.shoulderL, m.shoulderR, 0.5);
                add('Hips', null, m.hips, lerp3(m.hips, neckBase, 0.33));
                add('Spine', 'Hips', lerp3(m.hips, neckBase, 0.33), lerp3(m.hips, neckBase, 0.66));
                add('Chest', 'Spine', lerp3(m.hips, neckBase, 0.66), neckBase);
                add('Neck', 'Chest', neckBase, m.chin);
                add('Head', 'Neck', m.chin, m.headTop);
                for (const side of ['L', 'R']) {
                    const name = part => (side === 'L' ? 'Left' : 'Right') + part;
                    add(name('UpperArm'), 'Chest', m['shoulder' + side], m['elbow' + side]);
                    add(name('LowerArm'), name('UpperArm'), m['elbow' + side], m['wrist' + side]);
                    add(name('Hand'), name('LowerArm'), m['wrist' + side],
                        lerp3(m['elbow' + side], m['wrist' + side], 1.35));
                    const knee = m['knee' + side];
                    const ankle = m['ankle' + side];
                    add(name('UpperLeg'), 'Hips', [knee[0], m.hips[1], knee[2]], knee);
                    add(name('LowerLeg'), name('UpperLeg'), knee, ankle);
                    add(name('Foot'), name('LowerLeg'), ankle, [ankle[0], 0, ankle[2]]);
                }
                return bones;
            }
        },
        quadruped: {
            label: 'Quadruped',
            markers: [
                { key: 'head', label: 'Head' },
                { key: 'neck', label: 'Neck base' },
                { key: 'hips', label: 'Hips' },
                { key: 'tailTip', label: 'Tail tip' },
                { key: 'frontLegL', label: 'Left front leg top', mirror: 'frontLegR' },
                { key: 'frontLegR', label: 'Right front leg top', mirror: 'frontLegL' },
                { key: 'frontKneeL', label: 'Left front knee', mirror: 'frontKneeR' },
                { key: 'frontKneeR', label: 'Right front knee', mirror: 'frontKneeL' },
                { key: 'frontAnkleL', label: 'Left front ankle', mirror: 'frontAnkleR' },
                { key: 'frontAnkleR', label: 'Right front ankle', mirror: 'frontAnkleL' },
                { key: 'rearLegL', label: 'Left rear leg top', mirror: 'rearLegR' },
                { key: 'rearLegR', label: 'Right rear leg top', mirror: 'rearLegL' },
                { key: 'rearKneeL', label: 'Left rear knee', mirror: 'rearKneeR' },
                { key: 'rearKneeR', label: 'Right rear knee', mirror: 'rearKneeL' },
                { key: 'rearAnkleL', label: 'Left rear ankle', mirror: 'rearAnkleR' },
                { key: 'rearAnkleR', label: 'Right rear ankle', mirror: 'rearAnkleL' }
            ],
            // Body along z: head toward +z, tail toward -z.
            defaults(h, halfW, halfD) {
                return {
                    head: [0, h * 0.85, halfD * 0.75],
                    neck: [0, h * 0.72, halfD * 0.45],
                    hips: [0, h * 0.68, -halfD * 0.5],
                    tailTip: [0, h * 0.62, -halfD * 0.95],
                    frontLegL: [halfW * 0.4, h * 0.55, halfD * 0.45],
                    frontLegR: [-halfW * 0.4, h * 0.55, halfD * 0.45],
                    frontKneeL: [halfW * 0.42, h * 0.3, halfD * 0.45],
                    frontKneeR: [-halfW * 0.42, h * 0.3, halfD * 0.45],
                    frontAnkleL: [halfW * 0.42, h * 0.08, halfD * 0.45],
                    frontAnkleR: [-halfW * 0.42, h * 0.08, halfD * 0.45],
                    rearLegL: [halfW * 0.4, h * 0.55, -halfD * 0.5],
                    rearLegR: [-halfW * 0.4, h * 0.55, -halfD * 0.5],
                    rearKneeL: [halfW * 0.42, h * 0.3, -halfD * 0.52],
                    rearKneeR: [-halfW * 0.42, h * 0.3, -halfD * 0.52],
                    rearAnkleL: [halfW * 0.42, h * 0.08, -halfD * 0.52],
                    rearAnkleR: [-halfW * 0.42, h * 0.08, -halfD * 0.52]
                };
            },
            bones(m) {
                const bones = [];
                const add = boneBuilder(bones);
                add('Hips', null, m.hips, lerp3(m.hips, m.neck, 0.4));
                add('Spine', 'Hips', lerp3(m.hips, m.neck, 0.4), lerp3(m.hips, m.neck, 0.75));
                add('Chest', 'Spine', lerp3(m.hips, m.neck, 0.75), m.neck);
                add('Neck', 'Chest', m.neck, lerp3(m.neck, m.head, 0.7));
                add('Head', 'Neck', lerp3(m.neck, m.head, 0.7), m.head);
                add('Tail', 'Hips', m.hips, m.tailTip);
                for (const side of ['L', 'R']) {
                    const name = part => (side === 'L' ? 'Left' : 'Right') + part;
                    add(name('FrontUpperLeg'), 'Chest', m['frontLeg' + side], m['frontKnee' + side]);
                    add(name('FrontLowerLeg'), name('FrontUpperLeg'), m['frontKnee' + side], m['frontAnkle' + side]);
                    add(name('FrontFoot'), name('FrontLowerLeg'), m['frontAnkle' + side],
                        [m['frontAnkle' + side][0], 0, m['frontAnkle' + side][2]]);
                    add(name('RearUpperLeg'), 'Hips', m['rearLeg' + side], m['rearKnee' + side]);
                    add(name('RearLowerLeg'), name('RearUpperLeg'), m['rearKnee' + side], m['rearAnkle' + side]);
                    add(name('RearFoot'), name('RearLowerLeg'), m['rearAnkle' + side],
                        [m['rearAnkle' + side][0], 0, m['rearAnkle' + side][2]]);
                }
                return bones;
            }
        },
        plant: {
            label: 'Plant / Tree',
            markers: [
                { key: 'base', label: 'Base' },
                { key: 'trunkTop', label: 'Trunk top' },
                { key: 'crownTop', label: 'Crown top' }
            ],
            defaults(h) {
                return {
                    base: [0, 0, 0],
                    trunkTop: [0, h * 0.55, 0],
                    crownTop: [0, h * 0.98, 0]
                };
            },
            bones(m) {
                const bones = [];
                const add = boneBuilder(bones);
                add('Base', null, m.base, lerp3(m.base, m.trunkTop, 0.5));
                add('Trunk', 'Base', lerp3(m.base, m.trunkTop, 0.5), m.trunkTop);
                add('Crown', 'Trunk', m.trunkTop, m.crownTop);
                return bones;
            }
        },
        vehicle: {
            label: 'Vehicle',
            markers: [
                { key: 'wheelFrontL', label: 'Left front wheel', mirror: 'wheelFrontR' },
                { key: 'wheelFrontR', label: 'Right front wheel', mirror: 'wheelFrontL' },
                { key: 'wheelRearL', label: 'Left rear wheel', mirror: 'wheelRearR' },
                { key: 'wheelRearR', label: 'Right rear wheel', mirror: 'wheelRearL' }
            ],
            defaults(h, halfW, halfD) {
                return {
                    wheelFrontL: [halfW * 0.7, h * 0.18, halfD * 0.6],
                    wheelFrontR: [-halfW * 0.7, h * 0.18, halfD * 0.6],
                    wheelRearL: [halfW * 0.7, h * 0.18, -halfD * 0.6],
                    wheelRearR: [-halfW * 0.7, h * 0.18, -halfD * 0.6]
                };
            },
            bones(m) {
                const bones = [];
                const add = boneBuilder(bones);
                const center = lerp3(lerp3(m.wheelFrontL, m.wheelFrontR, 0.5),
                    lerp3(m.wheelRearL, m.wheelRearR, 0.5), 0.5);
                const body = [center[0], center[1] * 2.2, center[2]];
                add('Body', null, body,
                    [body[0], body[1], lerp3(m.wheelFrontL, m.wheelFrontR, 0.5)[2]]);
                // Point-like wheel bones: each claims the sphere around its
                // hub, which is exactly what a tire is.
                add('FrontLeftWheel', 'Body', m.wheelFrontL, m.wheelFrontL);
                add('FrontRightWheel', 'Body', m.wheelFrontR, m.wheelFrontR);
                add('RearLeftWheel', 'Body', m.wheelRearL, m.wheelRearL);
                add('RearRightWheel', 'Body', m.wheelRearR, m.wheelRearR);
                return bones;
            }
        }
    };

    function templates() {
        return Object.keys(TEMPLATES).map(id => ({ id, label: TEMPLATES[id].label }));
    }

    function markersFor(template) {
        return (TEMPLATES[template] || TEMPLATES.humanoid).markers;
    }

    /**
     * First-guess marker positions from the model's bounds (model space:
     * feet on y=0, centred on x/z). The user drags them onto the model.
     */
    function defaultMarkers(size, template) {
        const h = Math.max(0.0001, Number(size && size.y) || 1);
        const halfW = Math.max(0.0001, (Number(size && size.x) || 0.5) / 2);
        const halfD = Math.max(0.0001, (Number(size && size.z) || 0.5) / 2);
        return (TEMPLATES[template] || TEMPLATES.humanoid).defaults(h, halfW, halfD);
    }

    /** Derive the template's skeleton from its fitted markers. */
    function bonesFromMarkers(markers, template) {
        return (TEMPLATES[template] || TEMPLATES.humanoid).bones(markers);
    }

    const MARKERS = TEMPLATES.humanoid.markers;

    function distanceSqToSegment(px, py, pz, a, b) {
        const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
        const apx = px - a[0], apy = py - a[1], apz = pz - a[2];
        const len2 = abx * abx + aby * aby + abz * abz;
        let t = len2 > 0 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
        return dx * dx + dy * dy + dz * dz;
    }

    /**
     * Skin-weight solve for one or more meshes against a bone list.
     *
     * meshes: [{ positions: Float32Array (model space, xyz triplets),
     *            index: array-like of vertex indices or null }]
     * Returns per mesh { indices: Uint8Array(4N), weights: Uint8Array(4N) },
     * four influences per vertex, weights quantized to sum 255.
     *
     * Method: distance-to-bone-segment falloff (d^-4) with a side gate —
     * a bone living on one side of the x axis barely claims vertices on
     * the other, which stops a left thigh from grabbing the right leg —
     * followed by Laplacian smoothing over the mesh's edges. Vertices are
     * welded by position first so UV-seam duplicates get identical
     * weights and posing never cracks the skin open.
     */
    function computeWeights(meshes, bones, options) {
        const opts = options || {};
        const height = Math.max(0.0001, Number(opts.height) || boneSpanHeight(bones));
        const eps2 = Math.pow(0.02 * height, 2);
        const smoothPasses = opts.smoothPasses != null ? opts.smoothPasses : 6;
        const boneCount = bones.length;
        // Side gates on x (left/right) and z (front/rear): a bone clearly
        // living on one side barely claims vertices on the other, which
        // keeps a left thigh off the right leg and a quadruped's front leg
        // off its rear. The threshold is a share of the skeleton's own
        // spread on that axis, so a spine marker nudged slightly off
        // centre never gates the torso against half the body.
        const spread = axis => {
            let min = Infinity, max = -Infinity;
            for (const bone of bones) {
                min = Math.min(min, bone.head[axis], bone.tail[axis]);
                max = Math.max(max, bone.head[axis], bone.tail[axis]);
            }
            return max > min ? max - min : 0;
        };
        const gateAxes = [0, 2].map(axis => {
            const span = spread(axis);
            return {
                axis,
                threshold: span * 0.12,
                margin: span * 0.06,
                sides: bones.map(bone => {
                    const mid = (bone.head[axis] + bone.tail[axis]) / 2;
                    return span > 0 && Math.abs(mid) > span * 0.12 ? Math.sign(mid) : 0;
                })
            };
        });

        return meshes.map(mesh => {
            const positions = mesh.positions;
            const vertexCount = Math.floor(positions.length / 3);

            // Weld duplicate positions (UV seams) into groups.
            const groupOf = new Int32Array(vertexCount);
            const groupSeed = [];
            const byKey = new Map();
            const q = 1e4 / height;
            for (let v = 0; v < vertexCount; v++) {
                const key = Math.round(positions[v * 3] * q) + ','
                    + Math.round(positions[v * 3 + 1] * q) + ','
                    + Math.round(positions[v * 3 + 2] * q);
                let group = byKey.get(key);
                if (group === undefined) {
                    group = groupSeed.length;
                    byKey.set(key, group);
                    groupSeed.push(v);
                }
                groupOf[v] = group;
            }
            const groupCount = groupSeed.length;

            // Dense group × bone scores.
            const dense = new Float32Array(groupCount * boneCount);
            for (let g = 0; g < groupCount; g++) {
                const v = groupSeed[g];
                const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
                const p = [px, py, pz];
                for (let b = 0; b < boneCount; b++) {
                    const d2 = distanceSqToSegment(px, py, pz, bones[b].head, bones[b].tail);
                    let score = 1 / ((d2 + eps2) * (d2 + eps2));
                    for (const gate of gateAxes) {
                        const side = gate.sides[b];
                        if (side !== 0 && p[gate.axis] * side < -gate.margin) score *= 0.02;
                    }
                    dense[g * boneCount + b] = score;
                }
            }
            normalizeRows(dense, groupCount, boneCount);

            // Neighbour groups from triangle edges (sequential triples
            // when the geometry is unindexed).
            const index = mesh.index;
            const triVertices = index ? index.length : vertexCount;
            const neighbours = Array.from({ length: groupCount }, () => new Set());
            for (let t = 0; t + 2 < triVertices; t += 3) {
                const a = groupOf[index ? index[t] : t];
                const b = groupOf[index ? index[t + 1] : t + 1];
                const c = groupOf[index ? index[t + 2] : t + 2];
                if (a !== b) { neighbours[a].add(b); neighbours[b].add(a); }
                if (b !== c) { neighbours[b].add(c); neighbours[c].add(b); }
                if (a !== c) { neighbours[a].add(c); neighbours[c].add(a); }
            }

            let current = dense;
            let next = new Float32Array(groupCount * boneCount);
            for (let pass = 0; pass < smoothPasses; pass++) {
                for (let g = 0; g < groupCount; g++) {
                    const near = neighbours[g];
                    const base = g * boneCount;
                    if (!near.size) {
                        for (let b = 0; b < boneCount; b++) next[base + b] = current[base + b];
                        continue;
                    }
                    for (let b = 0; b < boneCount; b++) {
                        let sum = 0;
                        for (const n of near) sum += current[n * boneCount + b];
                        next[base + b] = current[base + b] * 0.5 + (sum / near.size) * 0.5;
                    }
                }
                const swap = current; current = next; next = swap;
            }
            normalizeRows(current, groupCount, boneCount);

            // Top four influences per group, quantized; every duplicate
            // vertex copies its group's result.
            const outIndices = new Uint8Array(vertexCount * 4);
            const outWeights = new Uint8Array(vertexCount * 4);
            const groupIndices = new Uint8Array(groupCount * 4);
            const groupWeights = new Uint8Array(groupCount * 4);
            for (let g = 0; g < groupCount; g++) {
                const base = g * boneCount;
                const order = [];
                for (let b = 0; b < boneCount; b++) order.push(b);
                order.sort((a, b) => current[base + b] - current[base + a]);
                let total = 0;
                for (let k = 0; k < 4 && k < boneCount; k++) total += current[base + order[k]];
                let assigned = 0;
                for (let k = 0; k < 4; k++) {
                    const bone = k < boneCount ? order[k] : 0;
                    const share = k < boneCount && total > 0
                        ? Math.round(current[base + bone] / total * 255) : 0;
                    groupIndices[g * 4 + k] = bone;
                    groupWeights[g * 4 + k] = k === 0 ? 0 : Math.min(share, 255 - assigned);
                    if (k > 0) assigned += groupWeights[g * 4 + k];
                }
                groupWeights[g * 4] = 255 - assigned; // dominant bone absorbs rounding
            }
            for (let v = 0; v < vertexCount; v++) {
                const g = groupOf[v];
                for (let k = 0; k < 4; k++) {
                    outIndices[v * 4 + k] = groupIndices[g * 4 + k];
                    outWeights[v * 4 + k] = groupWeights[g * 4 + k];
                }
            }
            return { indices: outIndices, weights: outWeights };
        });
    }

    function normalizeRows(matrix, rows, cols) {
        for (let r = 0; r < rows; r++) {
            let sum = 0;
            const base = r * cols;
            for (let c = 0; c < cols; c++) sum += matrix[base + c];
            if (sum > 0) for (let c = 0; c < cols; c++) matrix[base + c] /= sum;
        }
    }

    function boneSpanHeight(bones) {
        let min = Infinity, max = -Infinity;
        for (const bone of bones || []) {
            min = Math.min(min, bone.head[1], bone.tail[1]);
            max = Math.max(max, bone.head[1], bone.tail[1]);
        }
        return Number.isFinite(max - min) && max > min ? max - min : 1;
    }

    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    function encodeBytes(bytes) {
        let out = '';
        for (let i = 0; i < bytes.length; i += 3) {
            const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0,
                c = i + 2 < bytes.length ? bytes[i + 2] : 0;
            out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)]
                + (i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=')
                + (i + 2 < bytes.length ? B64[c & 63] : '=');
        }
        return out;
    }

    function decodeBytes(text) {
        const clean = String(text || '').replace(/[^A-Za-z0-9+/]/g, '');
        const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
        let o = 0;
        for (let i = 0; i + 1 < clean.length; i += 4) {
            const a = B64.indexOf(clean[i]), b = B64.indexOf(clean[i + 1]),
                c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : -1,
                d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : -1;
            out[o++] = (a << 2) | (b >> 4);
            if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
            if (d >= 0) out[o++] = ((c & 3) << 6) | d;
        }
        return out;
    }

    /** Assemble the model.json rig block from solve results. */
    function buildRig(markers, bones, weightResults, template) {
        const weights = {};
        weightResults.forEach((result, meshIndex) => {
            if (!result) return;
            weights[String(meshIndex)] = {
                count: result.indices.length / 4,
                indices: encodeBytes(result.indices),
                weights: encodeBytes(result.weights)
            };
        });
        return { template: TEMPLATES[template] ? template : 'humanoid', markers, bones, weights };
    }

    /**
     * Skin weights as a compact binary sidecar (model.rig.bin) instead of
     * base64 inside model.json — a big rig made the JSON tens of
     * megabytes and its parse a visible stall. Layout, little-endian:
     *   u32 magic 0x42575252 ("RRWB")  u32 version  u32 meshCount
     *   per mesh: u32 meshIndex  u32 vertexCount
     *             vertexCount*4 bytes indices  vertexCount*4 bytes weights
     */
    const WEIGHTS_MAGIC = 0x42575252;

    function encodeWeightsBinary(weightResults) {
        const entries = [];
        weightResults.forEach((result, meshIndex) => {
            if (!result || !result.indices || !result.indices.length) return;
            entries.push({ meshIndex, indices: result.indices, weights: result.weights });
        });
        let size = 12;
        for (const entry of entries) size += 8 + entry.indices.length + entry.weights.length;
        const buffer = new ArrayBuffer(size);
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);
        view.setUint32(0, WEIGHTS_MAGIC, true);
        view.setUint32(4, 1, true);
        view.setUint32(8, entries.length, true);
        let at = 12;
        for (const entry of entries) {
            view.setUint32(at, entry.meshIndex, true);
            view.setUint32(at + 4, entry.indices.length / 4, true);
            at += 8;
            bytes.set(entry.indices, at);
            at += entry.indices.length;
            bytes.set(entry.weights, at);
            at += entry.weights.length;
        }
        return buffer;
    }

    function decodeWeightsBinary(buffer) {
        const view = new DataView(buffer);
        if (view.byteLength < 12 || view.getUint32(0, true) !== WEIGHTS_MAGIC) return null;
        if (view.getUint32(4, true) !== 1) return null;
        const meshCount = view.getUint32(8, true);
        const out = {};
        let at = 12;
        for (let i = 0; i < meshCount; i++) {
            if (at + 8 > view.byteLength) return null;
            const meshIndex = view.getUint32(at, true);
            const count = view.getUint32(at + 4, true);
            at += 8;
            const span = count * 4;
            if (at + span * 2 > view.byteLength) return null;
            out[String(meshIndex)] = {
                count,
                indices: new Uint8Array(buffer, at, span).slice(),
                weights: new Uint8Array(buffer, at + span, span).slice()
            };
            at += span * 2;
        }
        return out;
    }

    /**
     * The rig for the binary era: the JSON carries markers, bones and a
     * pointer to the weights file; the weights travel beside it.
     */
    function buildRigBinary(markers, bones, weightResults, template) {
        return {
            rig: {
                template: TEMPLATES[template] ? template : 'humanoid',
                markers,
                bones,
                weightsFile: 'model.rig.bin'
            },
            binary: encodeWeightsBinary(weightResults)
        };
    }

    const api = {
        MARKERS,
        TEMPLATES,
        templates,
        markersFor,
        defaultMarkers,
        bonesFromMarkers,
        computeWeights,
        distanceSqToSegment,
        encodeBytes,
        decodeBytes,
        buildRig,
        encodeWeightsBinary,
        decodeWeightsBinary,
        buildRigBinary
    };

    root.ModelRigger = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
