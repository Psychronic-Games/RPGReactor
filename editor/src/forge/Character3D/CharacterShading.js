/**
 * RRCharacterShading - ambient occlusion baked into a character's vertices.
 *
 * Creases, armpits, the eye sockets, under the chin, a collar over the neck,
 * hair over the scalp: places light reaches less are darkened in the
 * vertex colors, which the game's lit materials multiply with the pictures,
 * so the depth shows whatever lights the scene has.
 *
 * Each vertex stands for a small disk of the surface (a third of the area
 * of its triangles). A receiver is shaded by every disk near it that lies
 * in front of it, by the solid angle that disk fills (Bunnell's disk
 * approximation); a second pass lets shaded disks shade less, so deep
 * creases do not go black. Neighbors are found through a grid, so the
 * whole character takes a fraction of a second.
 */
(function(root) {
    'use strict';

    /** Area each vertex stands for: a third of each of its triangles. */
    function vertexAreas(part) {
        const P = part.positions, I = part.index, A = new Float32Array(P.length / 3);
        for (let t = 0; t < I.length; t += 3) {
            const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
            const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
            const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 3;
            A[I[t]] += area; A[I[t + 1]] += area; A[I[t + 2]] += area;
        }
        return A;
    }

    /**
     * Occlusion per vertex of every part: { [partIndex]: Float32Array (1 lit .. 0 dark) }.
     * `options`: radius (meters reached, 0.12), strength (1), floor (how dark at most, 0.35).
     */
    function ambientOcclusion(parts, options) {
        // Gentle: creases deepen, never go dirty (under a bust, the collarbones, the elbows).
        const o = Object.assign({ radius: 0.08, strength: 0.72, floor: 0.8, step: 4 }, options);
        // Every vertex of every part as one cloud: position, normal, area.
        // Parts that shade nothing and are shaded by nothing (fine body hair) are left out.
        parts = parts.map(p => (p.noShade ? Object.assign({}, p, { positions: new Float32Array(0), normals: new Float32Array(0), index: new Uint32Array(0) }) : p));
        let total = 0;
        for (const p of parts) total += p.positions.length / 3;
        const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), area = new Float32Array(total), two = new Uint8Array(total);
        const starts = [];
        let at = 0;
        for (const p of parts) {
            starts.push(at);
            pos.set(p.positions, at * 3);
            nrm.set(p.normals, at * 3);
            area.set(vertexAreas(p), at);
            // A double-sided sheet (a cape, a skirt, a wing) shades from both its faces.
            if (p.doubleSided) two.fill(1, at, at + p.positions.length / 3);
            at += p.positions.length / 3;
        }
        // The grid.
        const cell = o.radius, inv = 1 / cell;
        // One key per cell, exactly (±4096 cells, ±327 m at the default radius). A hashed key gave most cells' lists to
        // several cells (371 of 399 on one character), and a receiver near two of them read a list, and was shaded by
        // its vertices, twice: creases came out darker than the disks say (owner's ruling B4, 2026-11-07).
        const key = (x, y, z) => ((x + 4096) * 8192 + (y + 4096)) * 8192 + (z + 4096);
        // Every `step`-th vertex shades, standing for the area of the ones it skips: the receivers stay
        // every vertex, the cost falls by the step.
        const grid = new Map();
        for (let i = 0; i < total; i += o.step) {
            const k = key(Math.floor(pos[i * 3] * inv), Math.floor(pos[i * 3 + 1] * inv), Math.floor(pos[i * 3 + 2] * inv));
            let list = grid.get(k);
            if (!list) grid.set(k, list = []);
            list.push(i);
        }
        const r2max = o.radius * o.radius;
        const pass = weight => {
            const out = new Float32Array(total);
            for (let i = 0; i < total; i++) {
                const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
                const nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
                const cx = Math.floor(px * inv), cy = Math.floor(py * inv), cz = Math.floor(pz * inv);
                let occ = 0;
                for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
                    const list = grid.get(key(cx + a, cy + b, cz + c));
                    if (!list) continue;
                    for (let q = 0; q < list.length; q++) {
                        const j = list[q];
                        if (j === i) continue;
                        const dx = pos[j * 3] - px, dy = pos[j * 3 + 1] - py, dz = pos[j * 3 + 2] - pz;
                        const d2 = dx * dx + dy * dy + dz * dz;
                        if (d2 > r2max || d2 < 1e-10) continue;
                        const d = Math.sqrt(d2);
                        // The disk must lie in front of the receiver.
                        const cr = (nx * dx + ny * dy + nz * dz) / d;
                        if (cr <= 0.05) continue;
                        let ce = -(nrm[j * 3] * dx + nrm[j * 3 + 1] * dy + nrm[j * 3 + 2] * dz) / d;
                        if (two[j]) ce = Math.abs(ce);
                        else ce = Math.max(0, ce) * 0.75 + 0.25;
                        const solid = 1 - 1 / Math.sqrt(1 + area[j] * o.step / (Math.PI * d2));
                        // Fade toward the radius, so the grid's reach leaves no edge.
                        const fade = 1 - d2 / r2max;
                        occ += solid * ce * Math.min(1, 4 * cr) * fade * (weight ? weight[j] : 1);
                    }
                }
                out[i] = occ;
            }
            return out;
        };
        const first = pass(null);
        const lit = first.map(x => Math.max(0, 1 - x * o.strength));
        const second = pass(lit);
        const result = {};
        parts.forEach((p, k) => {
            const n = p.positions.length / 3, ao = new Float32Array(n);
            for (let v = 0; v < n; v++) ao[v] = Math.max(o.floor, Math.min(1, 1 - second[starts[k] + v] * o.strength));
            result[k] = ao;
        });
        return result;
    }

    /**
     * The occlusion laid into the parts' colors: a part with a picture gets
     * gray vertex colors (the picture is multiplied by them), a part with
     * vertex colors has them darkened, a part with one color gets that color
     * shaded per vertex. Returns new parts.
     */
    function applyOcclusion(parts, ao) {
        const linear = hex => {
            const n = parseInt(String(hex || '#bbbbbb').slice(1), 16);
            const f = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
            return [f(((n >> 16) & 255) / 255), f(((n >> 8) & 255) / 255), f((n & 255) / 255)];
        };
        const shaded = parts.map((p, k) => {
            const a = ao[k];
            if (!a || p.noShade || a.length !== p.positions.length / 3) return p;
            const n = p.positions.length / 3, colors = new Float32Array(n * 3);
            const base = p.colors || null, flat = !base && !p.texture ? linear(p.color) : [1, 1, 1];
            for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) colors[v * 3 + c] = (base ? base[v * 3 + c] : flat[c]) * a[v];
            const out = Object.assign({}, p, { colors, shaded: true });
            if (!p.texture) delete out.color;
            return out;
        });
        // A pigment overlay shares its underlying skin's occlusion, without casting it a second time.
        for (let k = 0; k < shaded.length; k++) if (shaded[k].shadeFrom) {
            const source = shaded.find(p => p.name === shaded[k].shadeFrom);
            if (source?.colors && source.positions.length === shaded[k].positions.length) {
                shaded[k] = Object.assign({}, shaded[k], { colors: Float32Array.from(source.colors), shaded: true });
            }
        }
        return shaded;
    }

    /**
     * Smooth and deepen the body's underside shade, whether or not it has a
     * fine chest patch. The patch inherits that same field: shading its
     * denser mesh independently left dark lumps and a hard outside edge.
     */
    function chestFromBody(parts, ao, pack) {
        const bodyAt = parts.findIndex(p => p.name === 'Body'), chestAt = parts.findIndex(p => p.chestDetail && !p.decal);
        if (!pack || bodyAt < 0 || !ao[bodyAt]) return;
        const at = new Map(), under = ao[bodyAt];
        pack.body.source.forEach((v, i) => { if (!at.has(v)) at.set(v, i); });
        // Filter the coarse underside's occlusion before transferring it to
        // the detail patch. Otherwise its alternating dark rows survive the
        // normal smoothing as a segmented band under a fuller bust.
        const Body = root.RRHumanBody;
        if (Body?.bustShadingMask) {
            const field = new Float32Array(pack.vertexCount * 3), mask = Body.bustShadingMask(pack);
            for (let v = 0; v < pack.vertexCount; v++) field[v * 3] = 1;
            for (const [v, i] of at) field[v * 3] = under[i];
            const soft = Body.bustGradient(pack, Body.relax(pack, field, 6));
            pack.body.source.forEach((v, i) => {
                // Deepen the same continuous field, with extra occlusion on
                // downward-facing skin. Its normals already follow the
                // regional gradient, so this adds no coarse triangle bands.
                const t = Math.max(0, Math.min(1, (-parts[bodyAt].normals[i * 3 + 1] - .10) / .70));
                const down = t * t * (3 - 2 * t), lit = Math.max(.8, Math.min(1, soft[v * 3]));
                const shade = Math.max(.70, 1 - (1 - lit) * 1.6 - .075 * down);
                under[i] += (shade - under[i]) * mask[v];
            });
        }
        if (chestAt < 0 || !ao[chestAt] || !parts[chestAt].interpolation) return;
        const { offsets, vertices, weights } = parts[chestAt].interpolation;
        for (let i = 0; i + 1 < offsets.length; i++) {
            let sum = 0, weight = 0;
            for (let j = offsets[i]; j < offsets[i + 1]; j++) { const k = at.get(vertices[j]); if (k !== undefined && k < under.length) { sum += under[k] * weights[j]; weight += weights[j]; } }
            if (weight > 0) ao[chestAt][i] = sum / weight;
        }
    }

    /** The head's mask: toward its edge, the occlusion of the skin it lies on, so the baked shade carries across where the two meet. */
    function headFromBody(parts, ao, pack) {
        const bodyAt = parts.findIndex(p => p.name === 'Body'), headAt = parts.findIndex(p => p.name === 'Head skin');
        if (!pack || bodyAt < 0 || headAt < 0 || !ao[bodyAt] || !ao[headAt] || !parts[headAt].edge) return;
        const at = new Map(), { offsets, vertices, weights } = parts[headAt].interpolation, under = ao[bodyAt], edge = parts[headAt].edge;
        pack.body.source.forEach((v, i) => { if (!at.has(v)) at.set(v, i); });
        for (let i = 0; i + 1 < offsets.length; i++) {
            let sum = 0, weight = 0;
            for (let j = offsets[i]; j < offsets[i + 1]; j++) { const k = at.get(vertices[j]); if (k !== undefined && k < under.length) { sum += under[k] * weights[j]; weight += weights[j]; } }
            // Soften only the sculpt's own shade. Softening the inherited
            // body shade after blending left a lighter, jagged patch edge.
            const own = 1 - (1 - ao[headAt][i]) * 0.45;
            ao[headAt][i] = weight > 0 ? own * edge[i] + (sum / weight) * (1 - edge[i]) : own;
            if (parts[headAt].tone) ao[headAt][i] *= parts[headAt].tone[i];
            const inner = parts[headAt].lidWall ? parts[headAt].lidWall[i] : 0;
            if (inner) ao[headAt][i] *= inner === 2 ? 0.45 : 0.42;     // the lid's wall, and a nostril's dark
        }
    }

    const api = { ambientOcclusion, applyOcclusion, vertexAreas, chestFromBody, headFromBody };
    root.RRCharacterShading = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
