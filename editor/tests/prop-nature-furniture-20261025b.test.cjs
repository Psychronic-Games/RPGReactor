'use strict';
// Dense hedges, mushroom kinds with seasons that show, and furniture styles that really differ.
const test = require('node:test'), assert = require('node:assert/strict');
const Nature = require('../src/forge/Props/NatureProp.js'), Plants = require('../src/forge/Props/PlantConstruction.js');
const F = require('../src/forge/Props/FurnitureProp.js'), Catalog = require('../src/forge/Props/PropCatalog.js');

const tris = b => b.parts.reduce((n, p) => n + p.index.length / 3, 0);
const part = (b, suffix) => b.parts.find(p => p.name.endsWith(' ' + suffix));
const bounds = parts => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], p.positions[i + d]); hi[d] = Math.max(hi[d], p.positions[i + d]); } return { lo, hi }; };

/** Does a ray from `o` along `d` hit any triangle of `p`? (Moller-Trumbore) */
function hits(p, o, d) {
    const P = p.positions, I = p.index;
    for (let t = 0; t < I.length; t += 3) {
        const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
        const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
        const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
        if (Math.abs(det) < 1e-12) continue;
        const f = 1 / det, s = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]], u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
        if (u < 0 || u > 1) continue;
        const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = f * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]);
        if (v < 0 || u + v > 1) continue;
        if (f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) > 0) return true;
    }
    return false;
}

test('a hedge is a dense clipped mass: an opaque leafy core, so view rays do not pass through but at the very edge', () => {
    for (const preset of ['trimmed', 'wild', 'flowering']) for (const season of ['summer', 'bare', 'snow']) {
        const b = Nature.build({ form: 'hedge', preset, season }, {}, { textureSize: 256 }), core = part(b, 'Inner leaves');
        assert.ok(core && !core.cutout, `${preset} ${season}: an opaque inner mass`);
        assert.ok(part(b, 'Leaves'), `${preset} ${season}: leaf clusters over it`);
        const { lo, hi } = bounds([core]);
        // Rays from the front, the side and above, over the hedge inset by a fifth of each extent (the lumpy rim may be open).
        for (const [axis, d] of [[2, [0, 0, -1]], [0, [-1, 0, 0]], [1, [0, -1, 0]]]) {
            let through = 0, total = 0;
            const u = (axis + 1) % 3, v = (axis + 2) % 3;
            for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) {
                const o = [0, 0, 0];
                o[u] = lo[u] + (hi[u] - lo[u]) * (0.2 + 0.6 * i / 8); o[v] = lo[v] + (hi[v] - lo[v]) * (0.2 + 0.6 * j / 6); o[axis] = hi[axis] + 1;
                if (u === 1 || v === 1) { const k = u === 1 ? u : v; o[k] = Math.max(o[k], lo[1] + (hi[1] - lo[1]) * 0.12); }
                total++; if (!hits(core, o, d)) through++;
            }
            assert.ok(through / total <= 0.02, `${preset} ${season} axis ${axis}: ${through}/${total} rays pass through`);
        }
        assert.ok(tris(b) <= 12000, `${preset} ${season}: ${tris(b)} triangles`);
    }
    for (const r of [{ spread: 1, character: 1, size: 4 }, { spread: 0, character: 0, size: 0.4 }]) {
        const b = Nature.build(Object.assign({ form: 'hedge' }, r), {}, { textureSize: 256 });
        assert.ok(tris(b) <= 12000 && part(b, 'Leaves').index.length / 3 > 200, JSON.stringify(r) + ' keeps leaves within the budget');
    }
});

const KINDS = ['toadstool', 'porcini', 'chanterelle', 'morel', 'shiitake', 'oyster', 'puffball', 'glowcap'], SEASONS = ['spring', 'summer', 'autumn', 'bare', 'snow'];
const colorOf = p => { const s = [0, 0, 0], n = p.colors.length / 3 || 1; for (let i = 0; i < p.colors.length; i += 3) for (let k = 0; k < 3; k++) s[k] += p.colors[i + k]; return s.map(v => v / n); };

test('mushrooms come in eight kinds, each its own cap, underside, stem and colors, with spots raised and many', () => {
    const form = Nature.FORMS.find(f => f[0] === 'mushroom'), labels = form[7].map(p => p[1]);
    assert.deepEqual(form[7].map(p => p[0]), KINDS);
    assert.equal(new Set(labels).size, labels.length);
    const caps = [];
    for (const preset of KINDS) {
        const b = Nature.build({ form: 'mushroom', preset, season: 'summer' }, {}, { textureSize: 256 }), d = part(b, 'Detail');
        assert.ok(d, preset + ' has caps');
        caps.push({ preset, color: colorOf(d), height: b.height, tris: tris(b) });
        assert.ok(Plants.MUSHROOMS[preset], preset + ' has a recipe');
    }
    for (let i = 0; i < caps.length; i++) for (let j = i + 1; j < caps.length; j++) {
        const a = caps[i], c = caps[j], dc = Math.hypot(...a.color.map((v, k) => v - c.color[k])), dh = Math.abs(a.height - c.height) / Math.max(a.height, c.height), dt = Math.abs(a.tris - c.tris) / Math.max(a.tris, c.tris);
        assert.ok(dc > 0.03 || dh > 0.15 || dt > 0.08, `${a.preset} and ${c.preset} look alike`);
    }
    // The fly agaric's warts: dozens on the main cap, of varied sizes.
    const fly = Nature.build({ form: 'mushroom', preset: 'toadstool', season: 'summer', character: 0 }, {}, { textureSize: 256 });
    const det = part(fly, 'Detail'), white = [];
    for (let v = 0; v < det.colors.length / 3; v++) if (det.colors[v * 3] > 0.8 && det.colors[v * 3 + 1] > 0.8 && det.positions[v * 3 + 1] > fly.height * 0.6) white.push(v);
    assert.ok(white.length / 16 > 40, `fly agaric warts: about ${Math.round(white.length / 16)}`);
});

test('the season shows on mushrooms: young in spring, full in summer, leaf litter in autumn, decay when bare, frost in snow', () => {
    for (const preset of KINDS) {
        const by = {};
        for (const season of SEASONS) {
            for (const character of [0, 1]) for (const spread of [0, 1]) {
                const b = Nature.build({ form: 'mushroom', preset, season, character, spread }, {}, { textureSize: 256 });
                assert.ok(tris(b) <= 12000, `${preset} ${season} ${character} ${spread}: ${tris(b)} triangles`);
            }
            by[season] = Nature.build({ form: 'mushroom', preset, season }, {}, { textureSize: 256 });
        }
        assert.ok(!part(by.summer, 'Ground'), preset + ': summer stands on bare ground');
        for (const s of ['spring', 'autumn', 'bare', 'snow']) assert.ok(part(by[s], 'Ground'), `${preset} ${s}: a ground patch`);
        const ground = s => colorOf(part(by[s], 'Ground'));
        assert.ok(ground('spring')[1] > ground('spring')[0], preset + ': spring moss is green');
        assert.ok(Math.min(...ground('snow')) > 0.4 && ground('snow')[2] > ground('autumn')[2] + 0.4, preset + ': snow lies white');
        assert.ok(part(by.autumn, 'Ground').index.length > part(by.spring, 'Ground').index.length, preset + ': autumn has fallen leaves');
        if (!Plants.MUSHROOMS[preset].shelf) assert.ok(by.spring.height < by.summer.height * 0.95, preset + ': spring mushrooms are young and small');
        const cap = s => colorOf(part(by[s], 'Detail'));
        assert.ok(Math.hypot(...cap('bare').map((v, k) => v - cap('summer')[k])) > 0.02, preset + ': decay darkens the caps');
        const snowDetail = part(by.snow, 'Detail'); let frost = 0;
        for (let v = 0; v < snowDetail.colors.length / 3; v++) if (snowDetail.colors[v * 3] > 0.8 && snowDetail.colors[v * 3 + 2] > 0.85 && snowDetail.normals[v * 3 + 1] > 0.5) frost++;
        assert.ok(frost > 40, preset + ': frost on the caps');
    }
});

test('every furniture type differs by style in finish, hardware and light; sci-fi glows and picking a style sets its finish', () => {
    const sig = b => new Map(b.parts.map(p => [p.name.split(' ').pop(), [p.color || p.texture || '', p.metalness || 0, p.emissiveIntensity || 0].join('|')]));
    for (const [form] of F.FORMS) {
        const built = {};
        for (const style of ['modern', 'rustic', 'scifi']) built[style] = F.build(Object.assign(F.fromPreset(form), F.styleLook(form, style), { style }), {}, { textureSize: 256 });
        const light = built.scifi.parts.find(p => p.name.endsWith(' light'));
        assert.ok(light && light.emissiveIntensity >= 1, form + ': sci-fi carries light strips');
        assert.ok(!built.modern.parts.some(p => p.name.endsWith(' light')), form + ': modern has no light strips');
        for (const [a, c] of [['modern', 'rustic'], ['modern', 'scifi'], ['rustic', 'scifi']]) {
            const A = sig(built[a]), C = sig(built[c]), keys = new Set([...A.keys(), ...C.keys()]);
            let differ = 0; for (const k of keys) if (A.get(k) !== C.get(k)) differ++;
            assert.ok(differ >= 3, `${form}: ${a} and ${c} differ in only ${differ} materials`);
        }
    }
    // The page's style choice applies the style's finish, leaving each color editable.
    const page = Catalog.UI.furniture, set = [];
    const self = { recipe: F.fromPreset('sofa'), _set(k, v) { set.push(k); this.recipe = F.normalize(Object.assign({}, this.recipe, { [k]: v })); }, _commit() {}, _renderPanel() {}, _queueRebuild() {} };
    assert.equal(page.choose.call(self, 'style', 'scifi'), true);
    assert.equal(self.recipe.style, 'scifi');
    for (const [k, v] of Object.entries(F.styleLook('sofa', 'scifi'))) assert.equal(self.recipe[k], v);
    assert.equal(page.choose.call(self, 'color', '#ffffff'), false);
});
