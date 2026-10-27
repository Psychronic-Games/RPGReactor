'use strict';
// Realism pass 2026-10-24: sharks, marine bodies, stingray, spider/centipede and arthropods.
const test = require('node:test'), assert = require('node:assert/strict');
const Q = require('./helpers/character-quality-matrix.cjs');
const Forms = require('../src/forge/Character3D/CreatureForms.js');
const variant = (kind, key, value) => Q.Creature.withVariant(Q.Creature.kindRecipe(kind), key, value);
const build = (r, quality = 'preview') => Q.Model.build(null, r, {}, { quality });
const part = (b, name) => b.parts.find(p => p.name === name);
const extent = (p, axis) => { let lo = Infinity, hi = -Infinity; for (let i = axis; i < p.positions.length; i += 3) { lo = Math.min(lo, p.positions[i]); hi = Math.max(hi, p.positions[i]); } return [lo, hi]; };
const lum = (d, i) => .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];

test('the shark mouth is underslung and nearly closed by default; saved open jaws still load', () => {
    const r = Q.Creature.kindRecipe('shark'), L = r.size * 2.4, b = build(r), body = part(b, 'Body'), teeth = part(b, 'Teeth');
    assert.equal(r.jawOpen, .2);
    const snout = extent(body, 2)[1], front = extent(teeth, 2)[1];
    assert.ok(snout - front > L * .03, 'the conical snout overhangs the mouth (' + ((snout - front) / L).toFixed(3) + ' L)');
    const eye = part(b, 'Eye 0'), eyeY = extent(eye, 1).reduce((a, v) => a + v / 2, 0), gums = part(b, 'Gum margins'), [g0, g1] = extent(gums, 2);
    const mean = test => { let s = 0, n = 0; for (let i = 0; i < gums.positions.length; i += 3) if (test(gums.positions[i + 2])) { s += gums.positions[i + 1]; n++; } return s / n; };
    const corner = mean(z => z < g0 + L * .015), lip = mean(z => z > g1 - L * .015);
    assert.ok(eyeY - corner > L * .015, 'the mouth corner stays low under the eye');
    assert.ok(corner - lip < L * .02, 'no grin curling up the flank');
    // Saved recipes keep their own jaw opening.
    assert.equal(Q.Model.normalize({ ...r, jawOpen: .65 }).jawOpen, .65);
    assert.ok(build({ ...r, jawOpen: .65 }).parts.some(p => p.name === 'Teeth'));
    // Two rows of serrated teeth: enamel shades from a gum-tinted base to a pale tip.
    let lo = 1, hi = 0; for (let i = 0; i < teeth.colors.length; i += 3) { const v = teeth.colors[i]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    assert.ok(hi - lo > .15, 'tooth enamel is graded, not one flat white');
});

test('shark skin is a painted chart with a crisp ragged countershading line and fine denticle relief', () => {
    for (const quality of ['preview', 'save']) {
        const b = build(variant('shark', 'sharkType', 'greatWhite'), quality), p = part(b, 'Body'), pic = b.textures[p.texture], size = quality === 'save' ? 1024 : 512;
        assert.equal(p.texture, 'creature-markings.png'); assert.equal(pic.width, size); assert.equal(pic.height, size / 2);
        assert.equal(p.normalTexCoord, 1); assert.equal(p.metallicRoughnessTexCoord, 1);
        assert.ok(Math.max(...p.uvs1) > 3, 'denticles tile finely on the second coordinates');
        // Down the upper flank (v 0..0.25) of several mid-body columns: the dark-to-light step is crisp and its height varies.
        const rows = [];
        for (const t of [.38, .44, .5, .56, .62]) {
            // Right flank from the belly (v .75) through the equator (v 1 = 0) to the spine (v .25).
            const x = Math.floor(t * pic.width), values = Array.from({ length: pic.height / 2 }, (_, j) => lum(pic.data, ((Math.floor(pic.height * .75) + j) % pic.height * pic.width + x) * 4));
            const light = Math.max(...values.slice(0, values.length / 3)), dark = Math.min(...values.slice(values.length * 2 / 3)), mid = (dark + light) / 2;
            assert.ok(light - dark > 60, 'dark back and pale belly');
            const a = values.findIndex(v => v < light - (light - dark) * .2), z = values.findIndex(v => v < light - (light - dark) * .8);
            assert.ok(z - a < pic.height * .06, 'crisp boundary at t=' + t + ': ' + (z - a) + ' px');
            rows.push(values.findIndex(v => v < mid));
        }
        assert.ok(Math.max(...rows) - Math.min(...rows) >= 2, 'the boundary is irregular along the body');
        const denticles = b.textures[p.normalTexture], scales = Forms.surfacePictures('scales', size)['creature-surface-normal.png'];
        assert.notDeepEqual(denticles.data.subarray(0, 4096), scales.data.subarray(0, 4096));
    }
});

test('lamnid sharks have caudal keels, broad falcate pectorals and small rear fins near the peduncle', () => {
    const keel = kind => { const r = variant('shark', 'sharkType', kind), L = r.size * 2.4, p = part(build(r), 'Body'); let w = 0, h = 0; for (let i = 0; i < p.positions.length; i += 3) if (Math.abs(p.positions[i + 2] + L * .43) < L * .01) { w = Math.max(w, Math.abs(p.positions[i])); h = Math.max(h, p.positions[i + 1]); } return w; };
    assert.ok(keel('greatWhite') > keel('bull') * 1.2, 'great white peduncle keel');
    const r = Q.Creature.kindRecipe('shark'), L = r.size * 2.4, b = build(r);
    const pec = part(b, 'Fin1_0'), [z0, z1] = extent(pec, 2);
    assert.ok(z1 - z0 > L * .14, 'broad-based swept pectoral');
    const second = part(b, 'Second dorsal'), [s0] = extent(second, 2);
    assert.ok(s0 < -L * .33, 'second dorsal sits just ahead of the tail');
});

test('cetaceans, fish and anglerfish carry painted markings; fish have rayed long dorsals and ringed eyes', () => {
    for (const [kind, key, type] of [['whale', 'whaleType', 'orca'], ['whale', 'whaleType', 'humpback'], ['dolphin'], ['fish', 'fishType', 'reef'], ['fish', 'fishType', 'tuna'], ['fish', 'fishType', 'salmon'], ['anglerfish']]) {
        const r = key ? variant(kind, key, type) : Q.Creature.kindRecipe(kind), b = build(r), p = part(b, 'Body');
        assert.equal(p.texture, 'creature-markings.png', kind + '/' + type);
        assert.equal(Q.inspect(b, { recipe: r }).issues.length, 0);
    }
    const orca = build(variant('whale', 'whaleType', 'orca')), pic = orca.textures['creature-markings.png'];
    let white = 0, black = 0; for (let i = 0; i < pic.data.length; i += 4) { const v = lum(pic.data, i); if (v > 200) white++; if (v < 40) black++; }
    assert.ok(white > pic.data.length / 4 * .05 && black > pic.data.length / 4 * .3, 'orca black body with crisp white patches');
    const reef = Q.Creature.kindRecipe('fish'), L = reef.size * 2.4, fish = build(reef), [d0, d1] = extent(part(fish, 'Dorsal fin'), 2);
    assert.ok(d1 - d0 > L * .3, 'long-based reef-fish dorsal');
    const eye = part(fish, 'Eye 0'); let gold = 0; for (let i = 0; i < eye.colors.length; i += 3) if (eye.colors[i] > .3 && eye.colors[i] > eye.colors[i + 2] * 2) gold++;
    assert.ok(gold > 10, 'gold iris ring around the pupil');
    const tuna = variant('fish', 'fishType', 'tuna'), [y0, y1] = extent(part(build(tuna), 'Second dorsal'), 1);
    assert.ok(y1 - y0 > tuna.size * 2.4 * .1, 'tall yellowfin second dorsal');
});

test('the stingray is a flat rhombic disc with flapping wings, spiracles, underside gills and a spined whip tail', () => {
    const r = Q.Creature.kindRecipe('stingray'), L = r.size * 2.4, b = build(r), disc = part(b, 'Body');
    const [x0, x1] = extent(disc, 0), [y0, y1] = extent(disc, 1);
    assert.ok(x1 - x0 > L * .45 && y1 - y0 < (x1 - x0) * .2, 'broad flat disc');
    for (const name of ['Tail', 'Tail spine', 'Gills and facial detail', 'Dorsal tubercles', 'Pelvic fin1', 'Pelvic fin-1']) assert.ok(part(b, name), name);
    const wings = b.bones.map((bone, i) => [bone, i]).filter(([bone]) => bone.role === 'rayWing');
    assert.equal(wings.length, 4);
    const clip = Q.Creature.poseClip(b.bones, 'swim', r), track = name => clip.tracks.find(t => t.bone === b.bones.findIndex(bone => bone.name === name)).values;
    const right = track('Fin1_0'), left = track('Fin-1_0');
    for (let f = 0; f < 33; f += 4) assert.ok(Math.abs(right[f * 4 + 2] + left[f * 4 + 2]) < 1e-6, 'both wings beat together, mirrored');
    assert.ok(Math.max(...Array.from({ length: 33 }, (_, f) => Math.abs(right[f * 4 + 2]))) > .05, 'wings flap');
    assert.equal(Q.inspect(b, { recipe: r }).issues.length, 0);
});

test('arthropods: faceted compound eyes, low spined insect legs, folded crab claws, a real spider and centipede', () => {
    for (const kind of ['fly', 'bee', 'beetle']) {
        const b = build(Q.Creature.kindRecipe(kind)), eye = part(b, 'Compound eye -1');
        assert.equal(eye.texture, 'creature-facets.png'); assert.equal(eye.normalTexture, 'creature-facets-normal.png');
        assert.ok(b.textures['creature-facets-normal.png'], kind + ' facet relief');
        assert.ok(!b.parts.some(p => p.name.endsWith(' facets')), 'no stuck-on facet dots');
    }
    const beetle = Q.Creature.kindRecipe('beetle'), bb = build(beetle), L = beetle.size * 2.4;
    assert.ok(extent(part(bb, 'Body'), 1)[0] < L * .1, 'beetle stands low on its legs');
    assert.ok(part(bb, 'Elytron 1').iridescence > 0, 'ground beetle wing cases have a thin-film sheen');
    const crab = build(Q.Creature.kindRecipe('crab')), lobster = build(Q.Creature.kindRecipe('lobster'));
    for (const s of [-1, 1]) {
        const d = crab.bones.find(b => b.name === 'Dactyl' + s); assert.ok(Math.abs(d.tail[0]) < Math.abs(d.head[0]), 'crab claws fold across the front');
        const l = lobster.bones.find(b => b.name === 'Dactyl' + s); assert.ok(l.tail[2] > l.head[2], 'lobster claws point forward');
    }
    assert.ok(part(crab, 'Carapace granules') && part(crab, 'Eye 0').facetSurface);
    const spiderRecipe = Q.Creature.kindRecipe('spider'), spider = build(spiderRecipe), top = extent(part(spider, 'Body'), 1)[1];
    for (const name of ['Chelicerae and pedipalps', 'Setae', 'Leg setae']) assert.ok(part(spider, name), name);
    assert.equal(spider.parts.filter(p => /^Eye /.test(p.name)).length, 8);
    assert.ok(spider.bones.filter(b => b.role === 'legLower').every(b => b.head[1] - spider.bones[b.parent].head[1] > spiderRecipe.size * 2.4 * .05), 'legs arch to high knees');
    const centipede = build(Q.Creature.kindRecipe('centipede'));
    assert.ok(part(centipede, 'Tergites') && part(centipede, 'Forcipules'));
    for (const b of [bb, crab, lobster, spider, centipede]) assert.equal(Q.inspect(b, { recipe: b.recipe }).issues.length, 0);
});

test('every realism-pass starting type stays within 65,000 triangles and 128 bones when saved', () => {
    const kinds = ['shark', 'whale', 'dolphin', 'fish', 'stingray', 'anglerfish', 'octopus', 'squid', 'jellyfish', 'beetle', 'tick', 'bee', 'wasp', 'mosquito', 'fly', 'butterfly', 'dragonfly', 'lobster', 'crab', 'spider', 'centipede'];
    for (const kind of kinds) {
        const r = Q.Creature.kindRecipe(kind), v = Forms.variantsFor(r)[0];
        for (const recipe of v ? v.choices.map(([id]) => Q.Creature.withVariant(r, v.key, id)) : [r]) {
            const b = build(recipe, 'save'), tris = b.parts.reduce((s, p) => s + p.index.length / 3, 0);
            assert.ok(tris < 65000, kind + ' ' + tris); assert.ok(b.bones.length <= 128, kind + ' bones');
        }
    }
});

test('round 2: shark pectorals are thick cambered foils, grey above; deeper gills and stronger denticles', () => {
    const r = Q.Creature.kindRecipe('shark'), b = build(r, 'save'), fin = part(b, 'Fin1_0'), sides = 20, at = (row, k) => Array.from(fin.positions.subarray((row * sides + k) * 3, (row * sides + k) * 3 + 3));
    const thick = (row, k) => Math.hypot(...at(row, k).map((v, c) => v - at(row, sides - k)[c]));
    assert.ok(thick(3, 3) > thick(3, 7) * 1.4, 'rounded leading edge thicker than the fine trailing edge');
    assert.ok(thick(2, 5) > r.size * 2.4 * .012, 'thick at the root');
    let up = 0, nu = 0, down = 0, nd = 0;
    for (let i = 0; i < fin.positions.length / 3; i++) { const v = fin.colors[i * 3] + fin.colors[i * 3 + 1] + fin.colors[i * 3 + 2]; if (fin.normals[i * 3 + 1] > .5) { up += v; nu++; } else if (fin.normals[i * 3 + 1] < -.5) { down += v; nd++; } }
    assert.ok(up / nu < down / nd * .8, 'upper side shares the grey back; only the underside is pale');
    assert.ok(part(b, 'Body').normalScale >= .3, 'denticle relief reads up close');
});

test('round 2: octopus/squid skin, jellyfish anatomy, tick mouthparts and worm details', () => {
    for (const kind of ['octopus', 'squid']) {
        const b = build(Q.Creature.kindRecipe(kind)), body = part(b, 'Body');
        assert.equal(body.texture, 'creature-markings.png'); assert.ok(body.uvs1);
        assert.ok(part(b, 'Siphon'), kind + ' siphon');
        const suckers = part(b, 'Arm0 suckers'); assert.ok(suckers.doubleSided && suckers.index.length / 3 > 1000, 'rimmed suckers');
        if (kind === 'octopus') assert.ok(part(b, 'Skin papillae').index.length / 3 > 3000);
        assert.ok(b.parts.reduce((s, p) => s + p.index.length / 3, 0) < 65000);
    }
    const jelly = build(Q.Creature.kindRecipe('jellyfish'));
    for (const name of ['Body', 'Subumbrella', 'Bell core', 'Bell ribs', 'Bell margin']) assert.ok(part(jelly, name), name);
    const arm = part(jelly, 'Oral arm0'), xs = extent(arm, 0), zs = extent(arm, 2);
    assert.ok(Math.max(xs[1] - xs[0], zs[1] - zs[0]) > Q.Creature.kindRecipe('jellyfish').size * 2.4 * .04, 'broad frilled oral arms');
    const tick = build(Q.Creature.kindRecipe('tick'));
    assert.ok(part(tick, 'Capitulum') && part(tick, 'Palps and barbed hypostome').index.length / 3 > 1500);
    const worm = type => build(variant('worm', 'wormType', type));
    assert.ok(part(worm('earthworm'), 'Setae and prostomium') && part(worm('earthworm'), 'Body').iridescence > 0);
    assert.ok(part(worm('tapeworm'), 'Rostellum hooks'));
    assert.ok(part(worm('roundworm'), 'Lips'));
});
