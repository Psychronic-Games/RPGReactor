/**
 * RRCharacterClothes - modeled garments: MakeHuman's own CC0 clothes
 * (data/clothes.json, clothes.bin and clothes/<id>.png, built by
 * build-scripts/build-clothes-pack.cjs), fitted to any body the way MakeHuman
 * fits them.
 *
 * Every garment vertex rides on three base-mesh vertices (weights summing to
 * about one) plus an offset scaled by the body's size along each axis, so it
 * follows every slider as the eyes do. The tights helper it mostly rides on is
 * first laid on the skin (RRCharacterOutfit.boundPositions), and whatever a
 * slider still pushes into the body is lifted out. Its skin weights are its
 * three base vertices' weights, blended. The body vertices it covers are
 * listed (`hidden`) so the skin under it is left out.
 *
 * Colors: with no color chosen a garment shows its own picture; a color
 * recolors its picture by luminance (the cloth's weave, folds and seams kept),
 * the second color the second region (the trousers of a suit, the socks in a
 * shoe) where the garment has one.
 *
 * No DOM and no three.js: the builder page and the node tests share it. The
 * data is read from disk on first use (NW.js, node); a page without the file
 * system calls preload() first.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Body = need('RRHumanBody', './HumanBody.js');
    const Outfit = need('RRCharacterOutfit', './CharacterOutfit.js');

    // Garment points closer to the skin than this are lifted out to it.
    const GAP = 0.003;

    /** The pack's typed views over the clothes binary. */
    function open(json, bytes) {
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const view = (Type, [offset, length]) => new Type(buffer, offset, length);
        const garments = new Map();
        for (const [id, g] of Object.entries(json.garments || {})) {
            const L = g.layout;
            garments.set(id, Object.assign({}, g, {
                id,
                refs: view(Uint16Array, L.refs), weights: view(Int16Array, L.weights), offsets: view(Int16Array, L.offsets),
                anchor: view(Uint16Array, L.anchor), source: view(Uint16Array, L.source), uvRaw: view(Uint16Array, L.uv),
                indexRaw: view(Uint16Array, L.index), region: view(Uint8Array, L.region), hidden: view(Uint16Array, L.hidden)
            }));
        }
        return { json, garments, pictures: new Map(), tints: new Map(), folder: null };
    }

    /** The clothes for a pack, read from disk once; null where there is no file system and nothing was preloaded. */
    function load(pack) {
        if (pack._clothes !== undefined) return pack._clothes;
        pack._clothes = null;
        if (typeof require !== 'function') return null;
        try {
            const fs = require('fs'), path = require('path');
            const folder = Body.dataFolder();
            const file = path.join(folder, 'clothes.json');
            if (!fs.existsSync(file)) return null;
            const clothes = open(JSON.parse(fs.readFileSync(file, 'utf8')), fs.readFileSync(path.join(folder, 'clothes.bin')));
            clothes.folder = folder;
            pack._clothes = clothes;
        } catch (error) {
            if (typeof console !== 'undefined') console.warn('[RRCharacterClothes] clothes data', error);
        }
        return pack._clothes;
    }

    /** Reads the clothes and decodes their pictures over fetch (a page without the file system). */
    async function preload(pack, dir) {
        const base = dir || Body.DATA_PATH;
        const json = await (await fetch(base + '/clothes.json')).json();
        const bytes = new Uint8Array(await (await fetch(base + '/clothes.bin')).arrayBuffer());
        const clothes = open(json, bytes);
        for (const g of clothes.garments.values()) {
            const blob = await (await fetch(base + '/' + g.texture)).blob();
            const bitmap = await createImageBitmap(blob);
            const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(bitmap.width, bitmap.height) : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            clothes.pictures.set(g.id, { width: bitmap.width, height: bitmap.height, data: new Uint8Array(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer) });
        }
        pack._clothes = clothes;
        return clothes;
    }

    /** A garment's own picture as RGBA, decoded once. */
    function picture(clothes, g) {
        let pic = clothes.pictures.get(g.id);
        if (pic) return pic;
        const fs = require('fs'), path = require('path'), { PNG } = require('pngjs');
        const png = PNG.sync.read(fs.readFileSync(path.join(clothes.folder, g.texture)));
        pic = { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) };
        clothes.pictures.set(g.id, pic);
        return pic;
    }

    /** What never changes with the body: picture coordinates, triangles, blended skin weights. */
    function fixed(pack, g) {
        if (g._fixed) return g._fixed;
        const n = g.refs.length / 3;
        const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
        const sum = new Map();
        for (let i = 0; i < n; i++) {
            sum.clear();
            for (let k = 0; k < 3; k++) {
                const v = g.refs[i * 3 + k], w = Math.max(0, g.weights[i * 3 + k] * g.weightScale);
                for (let q = 0; q < 4; q++) {
                    const ww = pack.skinWeights[v * 4 + q] * w;
                    if (ww > 0) sum.set(pack.skinJoints[v * 4 + q], (sum.get(pack.skinJoints[v * 4 + q]) || 0) + ww);
                }
            }
            // No influence at all (an unrigged helper): the skin vertex nearest it.
            if (!sum.size) { const a = g.anchor[i]; for (let q = 0; q < 4; q++) if (pack.skinWeights[a * 4 + q] > 0) sum.set(pack.skinJoints[a * 4 + q], pack.skinWeights[a * 4 + q]); }
            const top = [...sum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
            const total = top.reduce((s, [, w]) => s + w, 0) || 1;
            top.forEach(([j, w], k) => { joints[i * 4 + k] = j; weights[i * 4 + k] = w / total; });
            if (!top.length) weights[i * 4] = 1;
        }
        const src = g.source;
        g._fixed = {
            count: n,
            uvs: Float32Array.from(g.uvRaw, x => x / 65535),
            index: Uint32Array.from(g.indexRaw),
            joints: Body.gather(joints, src, 4), weights: Body.gather(weights, src, 4),
            // Each render vertex's skin vertex, for the builder's drag (it moves with the skin under it).
            source: Int32Array.from(src, v => g.anchor[v])
        };
        return g._fixed;
    }

    /** The garment's vertices (one per source vertex) on a built body. `frame` is the outfit build's scratch. */
    function fit(pack, built, g, frame) {
        const P = Outfit.boundPositions(pack, built, 'tights', frame), S = built.shaped;
        const axis = (name, k) => {
            const s = g.scale[name];
            if (!s || !s[2]) return 1;
            return Math.abs(S[s[0] * 3 + k] - S[s[1] * 3 + k]) / s[2];
        };
        const sx = axis('x', 0) * g.offsetScale, sy = axis('y', 1) * g.offsetScale, sz = axis('z', 2) * g.offsetScale;
        const n = g.refs.length / 3, out = new Float32Array(n * 3), ws = g.weightScale;
        for (let i = 0; i < n; i++) {
            let x = 0, y = 0, z = 0;
            for (let k = 0; k < 3; k++) {
                const v = g.refs[i * 3 + k] * 3, w = g.weights[i * 3 + k] * ws;
                x += P[v] * w; y += P[v + 1] * w; z += P[v + 2] * w;
            }
            out[i * 3] = x + g.offsets[i * 3] * sx;
            out[i * 3 + 1] = y + g.offsets[i * 3 + 1] * sy;
            out[i * 3 + 2] = z + g.offsets[i * 3 + 2] * sz;
        }
        Outfit.collide(pack, built, out, 0, n, GAP, frame);
        const reference=pack._tailorReference||(pack._tailorReference=Body.build(pack,Body.DEFAULT_RECIPE));
        // Broad-body tailoring re-seats rows by bearing and height; the skin clearance is applied again after it.
        if(Outfit.tailorTorso(pack,built,reference,()=>g._tailorRest||(g._tailorRest=fit(pack,reference,g,{})),out,frame,
            {source:Array.from({length:n},(_,i)=>g.refs[i*3]),hanging:i=>{
                if(!g._tailorPanels){
                    const parent=Array.from({length:n},(_,j)=>j),find=j=>parent[j]===j?j:(parent[j]=find(parent[j]));
                    for(let t=0;t<g.indexRaw.length;t+=3){const a=find(g.source[g.indexRaw[t]]);for(let k=1;k<3;k++)parent[find(g.source[g.indexRaw[t+k]])]=a;}
                    const tops=new Map(),bottoms=new Map();for(let j=0;j<n;j++){const root=find(j),y=g._tailorRest[j*3+1];tops.set(root,Math.max(tops.get(root)||0,y));bottoms.set(root,Math.min(bottoms.get(root)??Infinity,y));}
                    g._tailorPanels=Uint8Array.from({length:n},(_,j)=>tops.get(find(j))>reference.bones.find(b=>b.name==='Neck').head[1]-.2&&(/dress|skirt/i.test(g.id)||bottoms.get(find(j))>reference.bones.find(b=>b.name==='Hips').head[1]-.3)?1:0);
                }
                return g._tailorPanels[i]&&g._tailorRest[i*3+1]<reference.bones.find(b=>b.name==='Hips').head[1]+.1;
            },legged:!/dress|skirt/i.test(g.id),lift:GAP,clearance:.05}))Outfit.collide(pack, built, out, 0, n, GAP, frame);
        return out;
    }

    // ── colors ────────────────────────────────────────────────────────────
    const TO_LINEAR = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const c = i / 255; TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    const TO_SRGB = new Uint8Array(4097);
    for (let i = 0; i <= 4096; i++) { const c = i / 4096; TO_SRGB[i] = Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255); }
    const hexLinear = hex => { const n = parseInt(hex.slice(1), 16); return [TO_LINEAR[(n >> 16) & 255], TO_LINEAR[(n >> 8) & 255], TO_LINEAR[n & 255]]; };

    /** Which region each texel is in (1 for the second), drawn from the garment's triangles. */
    function regionMask(g, size) {
        const f = g._fixed, mask = new Uint8Array(size * size);
        const U = f.uvs, I = f.index;
        for (let t = 0; t < I.length; t += 3) {
            if (!g.region[I[t]]) continue;
            const px = [U[I[t] * 2] * size, U[I[t + 1] * 2] * size, U[I[t + 2] * 2] * size];
            const py = [U[I[t] * 2 + 1] * size, U[I[t + 1] * 2 + 1] * size, U[I[t + 2] * 2 + 1] * size];
            const area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]);
            if (Math.abs(area) < 1e-9) continue;
            const tol = -1.5 / Math.sqrt(Math.abs(area));
            const x0 = Math.max(0, Math.floor(Math.min(...px)) - 1), x1 = Math.min(size - 1, Math.ceil(Math.max(...px)) + 1);
            const y0 = Math.max(0, Math.floor(Math.min(...py)) - 1), y1 = Math.min(size - 1, Math.ceil(Math.max(...py)) + 1);
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const cx = x + 0.5, cy = y + 0.5;
                const w0 = ((px[1] - cx) * (py[2] - cy) - (px[2] - cx) * (py[1] - cy)) / area;
                const w1 = ((px[2] - cx) * (py[0] - cy) - (px[0] - cx) * (py[2] - cy)) / area;
                if (w0 >= tol && w1 >= tol && 1 - w0 - w1 >= tol) mask[y * size + x] = 1;
            }
        }
        return mask;
    }

    /**
     * The garment's picture in the item's colors: each region's texels take
     * the color times their luminance over the region's mean, so the mean
     * comes out as the color chosen. A region without a color keeps its own.
     */
    function tinted(clothes, g, item) {
        const colors = [item.color || null, g.regions > 1 ? item.color2 || null : null];
        const name = 'cloth-' + g.id + '.png';
        const own = picture(clothes, g);
        if (!colors[0] && !colors[1]) return Object.assign({ name }, own);
        const key = JSON.stringify(colors);
        const kept = clothes.tints.get(g.id);
        if (kept && kept.key === key) return kept.picture;
        const size = own.width, src = own.data, data = new Uint8Array(src.length);
        const mask = g.regions > 1 ? (g._mask || (g._mask = regionMask(g, size))) : null;
        const target = colors.map(c => (c ? hexLinear(c) : null));
        const mean = [0, 1].map(r => Math.max(0.02, (g.luminance && g.luminance[r]) || 0.2));
        for (let i = 0, n = size * size; i < n; i++) {
            const r = mask ? mask[i] : 0, o = i * 4, c = target[r];
            data[o + 3] = src[o + 3];
            if (!c) { data[o] = src[o]; data[o + 1] = src[o + 1]; data[o + 2] = src[o + 2]; continue; }
            const l = (0.2126 * TO_LINEAR[src[o]] + 0.7152 * TO_LINEAR[src[o + 1]] + 0.0722 * TO_LINEAR[src[o + 2]]) / mean[r];
            data[o] = TO_SRGB[Math.min(4096, Math.round(c[0] * l * 4096))];
            data[o + 1] = TO_SRGB[Math.min(4096, Math.round(c[1] * l * 4096))];
            data[o + 2] = TO_SRGB[Math.min(4096, Math.round(c[2] * l * 4096))];
        }
        const pic = { name, width: size, height: own.height, data };
        clothes.tints.set(g.id, { key, picture: pic });
        return pic;
    }

    /** Each body vertex's neighbors over the body faces, as offsets into one list. */
    function bodyRing(pack) {
        if (pack._bodyRing) return pack._bodyRing;
        const sets = new Map(), s = pack.body.source, I = pack.body.index;
        for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = s[I[t + k]], b = s[I[t + (k + 1) % 3]];
            if (!sets.has(a)) sets.set(a, new Set());
            if (!sets.has(b)) sets.set(b, new Set());
            sets.get(a).add(b); sets.get(b).add(a);
        }
        return (pack._bodyRing = sets);
    }

    /**
     * An inner garment kept inside an outer one where the outer covers the
     * skin: each inner vertex over skin the outer hides stands no further off
     * that skin than the outer's lowest vertex there (or within two rings of
     * it), less a few millimeters. Trouser legs tuck into boots, socks under
     * trouser hems.
     */
    function tuck(pack, built, inner, outer, frame) {
        const S = built.shaped, N = frame.bodyNormals, ring = bodyRing(pack);
        const height = (P, i, a) => (P[i * 3] - S[a * 3]) * N[a * 3] + (P[i * 3 + 1] - S[a * 3 + 1]) * N[a * 3 + 1] + (P[i * 3 + 2] - S[a * 3 + 2]) * N[a * 3 + 2];
        const lowest = new Map();
        const on = outer.g.anchor;
        for (let i = 0; i < on.length; i++) {
            const a = on[i], h = height(outer.verts, i, a);
            if (!(lowest.get(a) <= h)) lowest.set(a, h);
        }
        const covered = outer.covers;
        const limitAt = a => {
            if (lowest.has(a)) return lowest.get(a);
            let best = Infinity;
            for (const b of ring.get(a) || []) {
                if (lowest.has(b)) best = Math.min(best, lowest.get(b));
                else for (const c of ring.get(b) || []) if (lowest.has(c)) best = Math.min(best, lowest.get(c));
            }
            return best;
        };
        const P = inner.verts, an = inner.g.anchor;
        for (let i = 0; i < an.length; i++) {
            const a = an[i];
            if (!covered.has(a)) continue;
            const limit = Math.max(GAP * 0.5, limitAt(a) - 0.003);
            if (!isFinite(limit)) continue;
            const h = height(P, i, a);
            if (h <= limit) continue;
            const k = h - limit;
            P[i * 3] -= N[a * 3] * k; P[i * 3 + 1] -= N[a * 3 + 1] * k; P[i * 3 + 2] -= N[a * 3 + 2] * k;
        }
    }

    /**
     * Modeled garments on a built body, `wear`: [{ item, look, rank }] (look:
     * { name, roughness, metalness }; a garment of higher rank is worn over
     * one of lower rank). Returns [{ part, texture, hidden }] (hidden: the
     * body vertices it covers), leaving out garments the pack does not hold.
     */
    function buildAll(pack, built, wear, frame) {
        const clothes = load(pack);
        if (!clothes) return [];
        const fitted = [];
        for (const w of wear) {
            const g = clothes.garments.get(w.item.id);
            if (!g || (!clothes.pictures.has(g.id) && !clothes.folder)) continue;
            fitted.push({ w, g, verts: fit(pack, built, g, frame), covers: new Set(g.hidden) });
        }
        for (const inner of fitted) {
            const over = fitted.filter(outer => (outer.w.rank || 0) > (inner.w.rank || 0));
            for (const outer of over) tuck(pack, built, inner, outer, frame);
            // Triangles wholly over skin an outer garment hides are under it: not drawn.
            if (over.length) inner.under = a => over.some(outer => outer.covers.has(a));
        }
        const out = [];
        for (const { w, g, verts, under } of fitted) {
            const made = make(pack, clothes, g, verts, w.item, w.look, under);
            out.push(made);
            const lining = innerFabric(pack, built, g, made.part, under, frame);
            if (lining) out.push({ part: lining, texture: made.texture, hidden: g.hidden });
        }
        return out;
    }

    /** A real fabric backing follows the skin under the modeled shell, including through bends.
     * Its triangles stay wholly inside the garment author's coverage; necklines, cuffs and hems
     * remain open. The original shell and its detailed silhouette are left intact. */
    function innerFabric(pack, built, g, outer, under, frame) {
        if (!g.hidden.length) return null;
        if (!g._innerFabric) {
            const covered = new Set(g.hidden), S = pack.body.source, I = pack.body.index;
            // The Viking shell's sleeve/body seam opens at the underarm as
            // the arm rises. A small fitted gusset spans that articulation;
            // keep the neck, sleeve opening and hem outside its coverage.
            if (g.id === 'mh_viking_tunic') {
                const an=Outfit.anatomy(pack);
                for(const v of S){const arm=an.member[v*5+1]+an.member[v*5+2];
                    if(arm>.04&&arm<.97&&an.s[v*5]>2.6&&an.s[v*5]<3.6)covered.add(v);
                }
            }
            const ids = [], index = [], seen = new Set(), remap = new Map();
            const vertex = v => { if (!remap.has(v)) { remap.set(v, ids.length); ids.push(v); } return remap.get(v); };
            for (let i = 0; i < I.length; i += 3) {
                const a = S[I[i]], b = S[I[i + 1]], c = S[I[i + 2]];
                if (!covered.has(a) || !covered.has(b) || !covered.has(c)) continue;
                const key = [a, b, c].sort((x, y) => x - y).join(':');
                if (seen.has(key)) continue;
                seen.add(key); index.push(vertex(a), vertex(b), vertex(c));
            }
            if (!index.length) { g._innerFabric = { ids: new Uint16Array(), index: new Uint32Array(), uvs: new Float32Array() }; return null; }
            // Project once in the reference shape: a distorted extreme fit must not choose a
            // different texture island every time a slider moves.
            const Taken = root.RRCharacterOutfitTransfer || (typeof require === 'function' ? require('./CharacterOutfitTransfer.js') : null);
            if (!Taken) return null;
            const reference = pack._clothesFabricReference || (pack._clothesFabricReference = Body.build(pack, Body.DEFAULT_RECIPE));
            const fixedPart = fixed(pack, g), fitted = fit(pack, reference, g, {});
            const positions = Body.gather(fitted, g.source, 3), grid = Taken.triangleGrid(positions, fixedPart.index, 0.04);
            const uvs = new Float32Array(ids.length * 2);
            const regionAt = t => {
                const values = [0, 1, 2].map(k => g.region[fixedPart.index[t * 3 + k]] || 0);
                return values[0] === values[1] || values[0] === values[2] ? values[0] : values[1];
            };
            const regions = new Uint8Array(ids.length);
            const projectedUV = (i, region) => {
                const hit = Taken.nearestTriangle(grid, reference.shaped.subarray(ids[i] * 3, ids[i] * 3 + 3), 0.5,
                    region === undefined ? null : t => regionAt(t) === region);
                if (!hit) return null;
                const uv = [0, 0];
                for (let k = 0; k < 3; k++) for (let c = 0; c < 2; c++) uv[c] += fixedPart.uvs[fixedPart.index[hit.t * 3 + k] * 2 + c] * hit.bary[k];
                return { uv, region: regionAt(hit.t) };
            };
            for (let i = 0; i < ids.length; i++) {
                const hit = projectedUV(i);
                if (!hit) continue;
                uvs.set(hit.uv, i * 2); regions[i] = hit.region;
            }
            // A shirt/trouser color boundary must not interpolate through unrelated atlas islands.
            const splitIds = [], splitUVs = [], splitRegions = [], splitIndex = [], split = new Map();
            for (let i = 0; i < index.length; i += 3) {
                const v = index.slice(i, i + 3), r = v.map(k => regions[k]);
                const region = r[0] === r[1] || r[0] === r[2] ? r[0] : r[1];
                for (const old of v) {
                    const key = old + ':' + region;
                    if (!split.has(key)) {
                        split.set(key, splitIds.length); splitIds.push(ids[old]); splitRegions.push(region);
                        const uv = regions[old] === region ? uvs.subarray(old * 2, old * 2 + 2) : projectedUV(old, region)?.uv || uvs.subarray(old * 2, old * 2 + 2);
                        splitUVs.push(...uv);
                    }
                    splitIndex.push(split.get(key));
                }
            }
            g._innerFabric = { ids: Uint16Array.from(splitIds), index: Uint32Array.from(splitIndex), uvs: Float32Array.from(splitUVs), regions: Uint8Array.from(splitRegions) };
        }
        const template = g._innerFabric;
        let index = template.index;
        if (under) index = index.filter((v, i) => {
            const first = i - i % 3;
            return ![0, 1, 2].every(k => under(template.ids[template.index[first + k]]));
        });
        if (!index.length) return null;
        let ids = template.ids, uvs = template.uvs;
        if (index.length < template.index.length) {
            const used = [...new Set(index)], remap = new Map(used.map((v, i) => [v, i]));
            ids = Uint16Array.from(used, i => template.ids[i]); uvs = Body.gather(template.uvs, used, 2);
            index = Uint32Array.from(index, i => remap.get(i));
        }
        const normals = frame.bodyNormals || (frame.bodyNormals = Body.vertexNormals(pack, built.shaped));
        const positions = Body.gather(built.shaped, ids, 3), N = Body.gather(normals, ids, 3);
        const lift = GAP * 0.15;
        for (let i = 0; i < positions.length; i++) positions[i] += N[i] * lift;
        return { name: outer.name + ' inner fabric', positions, normals: N, index, uvs,
            joints: Body.gather(pack.skinJoints, ids, 4), weights: Body.gather(pack.skinWeights, ids, 4),
            source: Int32Array.from(ids), texture: outer.texture, roughness: outer.roughness, metalness: outer.metalness,
            doubleSided: true, rrLining: true, ...(g.cutout ? { cutout: true, alphaCutoff: 0.5 } : {}) };
    }

    /** One modeled garment on a built body: { part, texture, hidden }, or null when the pack has no such garment. */
    function build(pack, built, item, frame, look) {
        return buildAll(pack, built, [{ item, look }], frame)[0] || null;
    }

    function make(pack, clothes, g, verts, item, look, under) {
        const f = fixed(pack, g);
        const texture = tinted(clothes, g, item);
        let index = f.index;
        if (under) {
            const S = f.source, keep = [];
            for (let t = 0; t < index.length; t += 3) if (!(under(S[index[t]]) && under(S[index[t + 1]]) && under(S[index[t + 2]]))) keep.push(index[t], index[t + 1], index[t + 2]);
            if (keep.length < index.length) index = Uint32Array.from(keep);
        }
        const part = {
            name: (look && look.name) || g.id,
            positions: Body.gather(verts, g.source, 3),
            normals: Body.normals(verts, g.source, f.index, f.count),
            uvs: f.uvs, index, joints: f.joints, weights: f.weights, source: f.source,
            texture: texture.name, roughness: look ? look.roughness : 0.9, metalness: look ? look.metalness : 0,
            // Open hems, collars and brims show their inside.
            doubleSided: true
        };
        if (g.cutout) { part.cutout = true; part.alphaCutoff = 0.5; }
        return { part, texture, hidden: g.hidden };
    }

    /** The modeled garments the pack holds, with their credits. */
    function list(pack) {
        const clothes = load(pack);
        return clothes ? [...clothes.garments.values()].map(g => ({ id: g.id, credit: g.credit, triangles: g.triangles })) : [];
    }

    const api = { GAP, open, load, preload, picture, fit, tinted, build, buildAll, list };
    root.RRCharacterClothes = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
