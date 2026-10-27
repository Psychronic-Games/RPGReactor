'use strict';
// Forge › Prop Builder emblems (2026-10-24): a shield carries a flag's design (RRFlagDesign) and shows the
// flags' Design page — preset, background and emblem tiles as pictures, custom picture emblems, layers.
// A shield saved before designs opens looking exactly as it did; a design survives normalize, JSON and
// prop.json; a picture emblem paints again when its picture loads or changes; emblems keep to the face;
// bare steel and the energy shield show emblems only; Randomize rolls designs as the flags do.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..'), repo = path.join(root, '..');
global.self = global; global.window = global;
require(path.join(repo, 'runtime', 'libs', 'three.js'));
global.rrEscapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const props = path.join(root, 'src', 'forge', 'Props');
for (const f of ['PropCloth', 'PropPaint', 'PropMesh', 'PropRandom', 'PropCatalog', 'FlagDesign', 'FlagProp', 'PropModel', 'SpanProp', 'FramedProp', 'PictureProp', 'AccessoryProp', 'SwordProp', 'GunProp', 'ContainerProp', 'WeaponKit']) require(path.join(props, f + '.js'));
const Shield = require(path.join(props, 'ShieldProp.js'));
const Design = require(path.join(props, 'FlagDesign.js'));
const Paint = require(path.join(props, 'PropPaint.js'));
const Model = require(path.join(props, 'PropModel.js'));
const Catalog = require(path.join(props, 'PropCatalog.js'));
const K = require(path.join(props, 'WeaponKit.js'));
require(path.join(props, 'PropBuilder.js'));
const PropBuilder = global.PropBuilder;

/** A picture as the Prop Builder keeps one (RGBA, its version bumped when it is read again). */
function picture(w, h, version, fill) {
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4, on = Math.hypot(x - w / 2, y - h / 2) < w * 0.4;
        data.set(on ? fill : [0, 0, 0, 0], o);
    }
    return { width: w, height: h, data, version };
}

/**
 * The face as the shield painted it before designs (ShieldProp up to 2026-10-24): its pattern in two colors,
 * one emblem at a place of the shape's, planks and wear. Kept here word for word so old recipes are held to it.
 */
function oldFace(r, box, O) {
    const W = box.hi[1] - box.lo[1], H = box.hi[0] - box.lo[0], a = H / W;
    const colors = r.pattern === 'quartered' ? [r.colors[0], r.colors[1], r.colors[1], r.colors[0]] : r.pattern === 'cross' ? [r.colors[0], r.colors[1], r.colors[1]] : r.pattern === 'bands' ? [r.colors[0], r.colors[1], r.colors[0]] : [r.colors[0], r.colors[1], r.colors[0], r.colors[1], r.colors[0]];
    const design = Design.normalize({ field: { layout: r.pattern, colors, count: 3, orient: 'v', arm: 0.2, border: 0.09 }, layers: r.emblem === 'none' ? [] : [{ source: 'shape', shape: r.emblem, color: r.emblemColor, size: r.preset === 'kite' || r.preset === 'tower' ? 0.42 : 0.55, place: 'free', x: 0.5, y: r.preset === 'heater' ? 0.42 : r.preset === 'kite' ? 0.36 : r.preset === 'tower' ? 0.3 : 0.5 }] });
    const P = Design.prepare(design, a, {}), out = [0, 0, 0, 255];
    const n1 = Paint.fractal(17, 8, 4), n2 = Paint.fractal(41, 32, 3), wood = r.face === 'wood', bare = r.face === 'bare';
    const under = Paint.hex(wood ? '#8a6038' : '#9aa0a8'), size = 512, planks = r.preset === 'round' ? 7 : r.preset === 'buckler' ? 1 : 6;
    const rim = (u, v) => { const x = box.hi[0] - v * H, y = box.lo[1] + u * W; let d = Infinity; for (let i = 0; i < O.length; i += 3) d = Math.min(d, Math.hypot(O[i][0] - x, O[i][1] - y)); return d; };
    return Paint.paint(size, size, (u, v, o) => {
        let c;
        if (bare) c = Paint.hex(K.look('steel').color);
        else { Design.colorAt(P, u, v, out); c = [out[0], out[1], out[2]]; }
        let k = 1, worn = 0;
        if (wood) {
            const pu = u * planks, f = pu - Math.floor(pu), seam = Math.min(f, 1 - f) * W / planks;
            const grain = 0.5 + 0.5 * Math.sin((u * planks * 7 + n1(u * 3, v) * 4 + Math.floor(pu) * 1.7) * Math.PI * 2);
            k *= seam < 0.0025 ? 0.45 : 0.93 + 0.07 * grain;
        }
        const d = rim(u, v), chip = n2(u * 2, v * 2) + (0.06 - Math.min(0.06, d)) * 8 * r.wear;
        if (!bare && chip > 1.02 - r.wear * 0.42) worn = 1;
        const scratch = Math.abs(Math.sin((u * 37 + v * 11 + n1(u, v) * 3) * Math.PI)) < 0.012 * r.wear ? 1 : 0;
        if (worn) c = under.map(x => x * (0.8 + 0.25 * n1(u * 5, v * 5)));
        k *= 1 + 0.18 * scratch - 0.1 * r.wear * n2(u * 4, v * 4);
        o[0] = Math.min(255, c[0] * k); o[1] = Math.min(255, c[1] * k); o[2] = Math.min(255, c[2] * k); o[3] = 255;
    }, 1);
}
/** The face outline the build paints against (its board's, densified). */
function faceOf(preset, size) {
    const O = Shield.outline(preset, size), box = Shield.bounds(O);
    return { O, box, out: K.wind(K.densify(O, Math.max(0.03, size / 22) * 0.9), true) };
}
const differing = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };

test('a shield saved before designs opens as the same picture', () => {
    const old = [
        { preset: 'round', size: 0.8, shape: 0.35, face: 'wood', pattern: 'quartered', colors: ['#8c1c1c', '#f2efe6'], emblem: 'none', emblemColor: '#d9b23c', metal: 'iron', wear: 0.45 },
        { preset: 'heater', size: 0.85, shape: 0.45, face: 'wood', pattern: 'solid', colors: ['#1f3c78', '#d9b23c'], emblem: 'crown', emblemColor: '#d9b23c', metal: 'steel', wear: 0.3 },
        { preset: 'kite', size: 1.1, shape: 0.5, face: 'metal', pattern: 'bend', colors: ['#f2efe6', '#1d5c34'], emblem: 'cross', emblemColor: '#8c1c1c', metal: 'bronze', wear: 0.8 },
        { preset: 'tower', size: 1.35, shape: 0.6, face: 'metal', pattern: 'cross', colors: ['#5a2a6e', '#d9b23c'], emblem: 'eagle', emblemColor: '#d9b23c', metal: 'gold', wear: 0.2 },
        { preset: 'round', size: 0.7, shape: 0.5, face: 'wood', pattern: 'checker', colors: ['#123456', '#abcdef'], emblem: 'skull', emblemColor: '#ff8800', metal: 'steel', wear: 0.6 },
        { preset: 'buckler', size: 0.34, shape: 0.6, face: 'bare', pattern: 'solid', colors: ['#3a3f4a', '#d9b23c'], emblem: 'sun', emblemColor: '#d9b23c', metal: 'bronze', wear: 0.3 }
    ];
    for (const rec of old) {
        const r = Shield.normalize(rec), what = rec.preset + ' ' + rec.pattern + ' ' + rec.emblem;
        assert.ok(r.design && Array.isArray(r.design.layers), what + ' has a design');
        for (const k of ['pattern', 'colors', 'emblem', 'emblemColor']) assert.equal(r[k], undefined, what + ': ' + k + ' is in the design now');
        for (const k of ['size', 'shape', 'face', 'metal', 'wear']) assert.equal(r[k], rec[k], what + ' keeps its ' + k);
        assert.equal(r.design.layers.length, rec.emblem === 'none' || rec.face === 'bare' ? 0 : 1, what + ': its emblem (none on bare steel, which showed none)');
        const f = faceOf(rec.preset, r.size), was = oldFace(Object.assign({}, rec, { size: r.size }), f.box, f.out);
        const now = Model.build(r).textures['shield-face.png'];
        assert.equal(differing(was, now), 0, what + ' paints exactly as before');
    }
    // A preset as it starts is the old preset's picture too, and the energy shield its old glow.
    assert.deepEqual(Shield.normalize({ preset: 'heater' }).design, Shield.legacyDesign('heater', { pattern: 'solid', colors: ['#1f3c78', '#d9b23c'], emblem: 'crown', emblemColor: '#d9b23c', face: 'wood' }));
    assert.equal(Shield.normalize({ preset: 'energy', colors: ['#2e3036', '#7aff6a'], emblem: 'skull' }).glow, '#7aff6a');
    assert.equal(Shield.normalize({ preset: 'energy', colors: ['#2e3036', '#7aff6a'], emblem: 'skull' }).design.layers.length, 0, 'an old energy shield showed no emblem');
    // The Border pattern now follows the rim: a round shield's band is all the way round, not four slivers at its box.
    const ring = Shield.normalize({ preset: 'round', pattern: 'border', colors: ['#000000', '#ffffff'], emblem: 'none', wear: 0, face: 'metal' });
    const tex = Model.build(ring).textures['shield-face.png'], at = (u, v) => tex.data[(Math.floor(v * 512) * 512 + Math.floor(u * 512)) * 4];
    const d = 0.5 - 0.47 / Math.SQRT2; // just inside the rim, at 45 degrees
    assert.ok(at(d, d) > 120 && at(1 - d, 1 - d) > 120, 'the border at the diagonal');
    assert.ok(at(0.5, 0.5) < 60, 'the field inside it');
});

test('a design survives normalize, JSON and prop.json; the shield keeps its own settings', () => {
    const design = { field: { layout: 'canton', canton: 0.4, rows: 2, cols: 3, colors: ['#f2efe6', '#5a2a6e', '#e8c45a'] }, layers: [{ shape: 'laurel', color: '#5a2a6e', size: 0.55 }, { source: 'picture', image: 'Crest.png', recolor: false, place: 'free', x: 0.3, y: 0.6, size: 0.3, rotate: 15, mirror: true }, { shape: 'star', repeat: 'ring', count: 8, spread: 0.7, size: 0.1 }] };
    const r = Shield.normalize({ preset: 'kite', face: 'metal', metal: 'gold', wear: 0.7, size: 1.2, shape: 0.2, design });
    assert.deepEqual(Shield.normalize(JSON.parse(JSON.stringify(r))), r);
    assert.deepEqual(Model.normalize(JSON.parse(JSON.stringify({ builder: 'prop', version: 1, recipe: r })).recipe), r);
    assert.deepEqual(r.design, Design.normalize(design), 'the design as a flag reads it');
    assert.equal(r.design.layers[1].image, 'Crest.png');
    assert.deepEqual([r.face, r.metal, r.wear, r.size, r.shape], ['metal', 'gold', 0.7, 1.2, 0.2]);
    assert.deepEqual(Design.pictures(r.design), ['Crest.png']);
    // Another style from the tiles keeps the design.
    const ui = Catalog.UI.shield, fake = { recipe: r, _replace(n) { this.recipe = Model.normalize(n); } };
    ui.act.call(fake, 'weapon-style', { dataset: { id: 'heater' } });
    assert.equal(fake.recipe.preset, 'heater');
    assert.deepEqual(fake.recipe.design, r.design, 'a new style keeps the design');
});

test('a picture emblem: asked for, painted when it is in, painted again when it changes', () => {
    const cache = {}, recipe = Shield.normalize({ preset: 'heater', face: 'metal', wear: 0, design: { field: { layout: 'solid', colors: ['#000000'] }, layers: [{ source: 'picture', image: 'Crest.png', recolor: false, size: 0.8 }] } });
    const before = Model.build(recipe, cache, { images: {} });
    assert.equal(before.imageMissing, true); assert.equal(before.imageName, 'Crest.png', 'the view is told which picture to load');
    const key0 = cache.faceKey;
    const red = picture(32, 32, 1, [255, 0, 0, 255]);
    const after = Model.build(recipe, cache, { images: { 'Crest.png': red } });
    assert.equal(after.imageMissing, false);
    assert.notEqual(cache.faceKey, key0, 'its picture is in the key');
    assert.ok(cache.faceKey.includes('Crest.png') && cache.faceKey.includes('[32,32,1]') || /"Crest\.png",32,32,1/.test(cache.faceKey), 'by name, size and version');
    const tex = after.textures['shield-face.png'], mid = (Math.floor(512 * 0.42) * 512 + 256) * 4;
    assert.ok(tex.data[mid] > 150 && tex.data[mid + 1] < 80, 'the picture painted at the middle of the face: ' + Array.from(tex.data.slice(mid, mid + 3)));
    assert.equal(Model.build(recipe, cache, { images: { 'Crest.png': red } }).textures['shield-face.png'], tex, 'the same picture: the face kept');
    const blue = picture(32, 32, 2, [0, 0, 255, 255]);
    const again = Model.build(recipe, cache, { images: { 'Crest.png': blue } }).textures['shield-face.png'];
    assert.notEqual(again, tex, 'read again (a new version): painted again');
    assert.ok(again.data[mid + 2] > 150 && again.data[mid] < 80);
    // A picture as the whole field, too.
    const field = Shield.normalize({ preset: 'round', design: { field: { layout: 'image' }, image: 'Crest.png', layers: [] } });
    assert.equal(Model.build(field, {}, { images: {} }).imageName, 'Crest.png');
});

test('emblems keep to the face: Center is the shape\'s middle, a corner is drawn in onto it', () => {
    for (const preset of ['round', 'heater', 'kite', 'tower', 'buckler']) {
        const r = Shield.normalize({ preset }), O = Shield.outline(preset, r.size), box = Shield.bounds(O), W = box.hi[1] - box.lo[1], H = box.hi[0] - box.lo[0];
        const flat = O.flat();
        for (const place of ['center', 'tl', 'tr', 'bl', 'br', 'hoist', 'fly']) {
            const d = Shield.faceDesign(r, { field: { layout: 'solid' }, layers: [{ shape: 'star', place, size: 0.3 }] }, O, box), l = d.layers[0];
            assert.equal(l.place, 'free');
            assert.ok(Paint.pointInPolygon(flat, box.hi[0] - l.y * H, box.lo[1] + l.x * W), `${preset} ${place} on the face`);
            if (place === 'center') assert.deepEqual([l.x, l.y], [0.5, Shield.CENTER[preset]]);
        }
        // Free placement is the user's own.
        assert.deepEqual(Shield.faceDesign(r, { layers: [{ place: 'free', x: 0.1, y: 0.9 }] }, O, box).layers[0].x, 0.1);
    }
});

test('bare steel shows its emblems on the steel; an energy shield its emblems glowing over the field', () => {
    const bare = Model.build(Shield.normalize({ preset: 'buckler', wear: 0, design: { field: { layout: 'solid', colors: ['#ff0000'] }, layers: [{ shape: 'circle', color: '#000000', size: 0.5 }] } }));
    const t = bare.textures['shield-face.png'], px = (u, v) => Array.from(t.data.slice((Math.floor(v * 512) * 512 + Math.floor(u * 512)) * 4, (Math.floor(v * 512) * 512 + Math.floor(u * 512)) * 4 + 3));
    assert.ok(px(0.5, 0.5).every(c => c < 40), 'the emblem painted: ' + px(0.5, 0.5));
    const steel = px(0.5, 0.9);
    assert.ok(Math.abs(steel[0] - steel[2]) < 30 && steel[0] > 120, 'no red field on bare steel: ' + steel);
    const plain = Model.build(Shield.normalize({ preset: 'energy' }));
    assert.ok(!plain.parts.some(p => p.name === 'Emblem'));
    const lit = Model.build(Shield.normalize({ preset: 'energy', glow: '#ff4a3a', design: { layers: [{ shape: 'skull', color: '#ffffff', size: 0.6 }] } }));
    const emblem = lit.parts.find(p => p.name === 'Emblem');
    assert.ok(emblem && emblem.cutout && emblem.emissiveTexture === 'shield-emblem.png' && lit.textures['shield-emblem.png'], 'a glowing cut-out');
    assert.ok(lit.parts.some(p => p.name === 'Glow' && p.emissive === '#ff4a3a'), 'the cells still glow in the glow color');
    const e = lit.textures['shield-emblem.png'], a = e.data[(256 * 512 + 256) * 4 + 3], corner = e.data[3];
    assert.ok(a > 200 && corner === 0, 'the emblem solid, clear round it');
});

test('Randomize: Design rolls a design as a flag does; Colors recolors it; a seed always rolls the same', () => {
    const start = Shield.normalize({ preset: 'heater' });
    const seen = new Set();
    for (let seed = 1; seed <= 12; seed++) {
        const r = Shield.random(seed, start, 'details');
        assert.equal(r.preset, 'heater'); assert.equal(r.size, start.size);
        assert.deepEqual(r, Shield.random(seed, start, 'details'), 'the same seed, the same shield');
        seen.add(r.design.field.layout);
        assert.deepEqual(r.design, Design.normalize(r.design));
    }
    assert.ok(seen.size >= 4, 'many backgrounds: ' + [...seen]);
    const recolor = Shield.random(5, start, 'colors');
    assert.equal(recolor.design.field.layout, start.design.field.layout, 'Colors keeps the pattern');
    assert.equal(recolor.design.layers.length, start.design.layers.length, 'and the emblems');
    assert.ok(Shield.random(9, start, 'all').design, 'Everything rolls a whole shield');
});

test('the Design page: preset, background and emblem tiles as pictures on the shield, a custom picture last', () => {
    const pb = Object.create(PropBuilder.prototype);
    Object.assign(pb, { recipe: Model.normalize({ kind: 'shield', preset: 'kite' }), _images: {}, _minis: new Map(), folded: {} });
    const html = Catalog.UI.shield.panel.call(pb, 'design');
    const count = act => (html.match(new RegExp(`data-act="${act}"`, 'g')) || []).length;
    assert.equal(count('design-preset'), Design.PRESETS.length, 'the flags\' presets');
    assert.equal(count('field'), Design.LAYOUTS.length, 'every background pattern, the picture one too');
    assert.equal(count('layer-shape'), Design.SHAPES.length, 'every emblem shape as a tile');
    assert.ok(html.includes('rr-prop-owntile') && count('layer-picture') >= 1, 'a project picture of your own as the last tile');
    assert.ok(count('layer-add') === 1 && /Source/.test(html), 'layers and their source');
    assert.ok(!/data-path="(pattern|emblem|emblemColor)"/.test(html), 'no plain selects');
    // A picture emblem: the tile chosen, the picture's row with Choose….
    pb.recipe = Model.normalize({ kind: 'shield', preset: 'kite', design: { layers: [{ source: 'picture', image: 'Crest.png' }] } });
    const pic = Catalog.UI.shield.panel.call(pb, 'design');
    assert.ok(/rr-prop-owntile is-active/.test(pic) && pic.includes('Crest.png'));
    // Bare steel: the emblems only; the Look tab keeps face, metal and wear.
    pb.recipe = Model.normalize({ kind: 'shield', preset: 'heater', face: 'bare', design: { layers: [{ shape: 'crown' }] } });
    const bare = Catalog.UI.shield.panel.call(pb, 'design');
    assert.ok(!bare.includes('data-act="design-preset"') && bare.includes('data-act="layer-shape"'));
    const look = Catalog.UI.shield.panel.call(pb, 'look');
    for (const p of ['face', 'metal', 'wear']) assert.ok(look.includes(`data-path="${p}"`), 'Look: ' + p);
    // Design buttons reach _designAct: a shape tile picks the emblem's shape.
    pb.recipe = Model.normalize({ kind: 'shield', preset: 'heater' });
    Catalog.UI.shield.panel.call(pb, 'design');
    pb._replace = function(n) { this.recipe = Model.normalize(n); };
    Catalog.UI.shield.act.call(pb, 'layer-shape', { dataset: { id: 'skull' } });
    assert.equal(pb.recipe.design.layers[0].shape, 'skull');
    Catalog.UI.shield.act.call(pb, 'design-preset', { dataset: { id: 'guild' } });
    assert.equal(pb.recipe.design.layers.length, 2, 'a preset design');
});

test('a tile preview: the design on the shield\'s own outline, its boss over it, clear round it', () => {
    const img = Shield.facePreview({ preset: 'round' }, { field: { layout: 'solid', colors: ['#ff0000'] }, layers: [] }, 64, 40);
    assert.equal(img.width, 64); assert.equal(img.height, 40);
    const at = (x, y) => Array.from(img.data.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
    assert.equal(at(1, 1)[3], 0, 'clear outside the outline');
    assert.deepEqual(at(32, 8), [255, 0, 0, 255], 'the field on the face');
    assert.notDeepEqual(at(32, 20).slice(0, 3), [255, 0, 0], 'the boss in the middle');
    const kite = Shield.facePreview({ preset: 'kite' }, Design.PRESETS[0].design, 64, 40);
    assert.equal(kite.data[(20 * 64 + 2) * 4 + 3], 0, 'a kite is narrow: clear at its sides');
});
