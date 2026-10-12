// Model variants: one model worn several ways. A variant in model.json says a
// color adjustment of the model's own picture, another texture, its own
// surface and what its media surfaces show; a use names it in its spec.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.resolve(repoRoot, p), 'utf8');
function loadThree() {
    global.self = global; global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    return global.THREE;
}
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const plain = value => JSON.parse(JSON.stringify(value));

const sidecar = () => ({
    surface: { reflect: 0.5, gloss: 0.8, metal: 0.2, tint: '#ffffff', texture: 1 },
    effects: [
        { name: 'flag', type: 'video', video: { file: 'flags/red.png', width: 0.3, height: 0.2 }, anchor: { part: '', offset: [0, 1, 0] } },
        { name: 'screen', type: 'video', video: { file: 'screens/a.webm', width: 0.2, height: 0.1 }, anchor: { part: '', offset: [0, 2, 0] } },
        { name: 'muzzle', animation: 12, anchor: { part: '', offset: [1, 1, 0] } }
    ],
    variants: [
        { name: 'Black', color: { mode: 'colorize', color: '#202020', strength: 1, lightness: -0.5 }, media: { flag: { file: 'flags/black.png' }, screen: false } },
        { name: 'Parade', color: { mode: 'adjust', hue: 120, saturation: 1.2, brightness: 1 }, texture: 'parade.png', surface: { reflect: 1, gloss: 0.9, metal: 1, tint: '#ffcc55', texture: 0.2 } },
        { name: 'Matte', surface: false },
        { name: 'Black', color: { mode: 'adjust', hue: 10 } },
        { name: '  ', texture: 'x.png' },
        { name: 'Sneaky', texture: '../../secret.png' }
    ]
});

test('a spec carries its variant only when it names one, and files without one read and write as before', () => {
    const bare = R._normalizeModelSpecNow({ name: 'Vehicles/Tank', size: 3 });
    assert.equal('variant' in bare, false, 'no variant key on a use that names none');
    const worn = R._normalizeModelSpecNow({ name: 'Vehicles/Tank', size: 3, variant: ' Black ' });
    assert.equal(worn.variant, 'Black');
    const { variant, ...rest } = worn;
    assert.deepEqual(plain(rest), plain(bare), 'everything else is the same spec');
    assert.equal('variant' in R._normalizeModelSpecNow({ name: 'Vehicles/Tank', variant: '' }), false);
    assert.equal('variant' in R._normalizeModelSpecNow({ name: 'Vehicles/Tank', variant: 5 }), false);
    // The cached form follows a spec whose variant changed in place.
    const raw = { name: 'Vehicles/Tank' };
    assert.equal(R.normalizeModelSpec(raw).variant, undefined);
    raw.variant = 'Parade';
    assert.equal(R.normalizeModelSpec(raw).variant, 'Parade');
    // Written with an event page's model, and only then.
    const map = { width: 4, height: 4 };
    const written = R.setEventModelSpec(map, 3, 0, { name: 'Vehicles/Tank', size: 3, variant: 'Black' });
    assert.equal(written.variant, 'Black');
    assert.equal(R.eventModelSpec(map, 3, 0).variant, 'Black');
    assert.equal('variant' in R.setEventModelSpec(map, 4, 0, { name: 'Vehicles/Tank', size: 3 }), false);
    // A placed prop the same way.
    const prop = R.normalizeProp({ id: 1, name: 'Vehicles/Tank', x: 1, y: 1, variant: 'Parade' }, map);
    assert.equal(prop.variant, 'Parade');
    assert.equal(R.propModelSpec(prop).variant, 'Parade');
    const plainProp = R.normalizeProp({ id: 2, name: 'Vehicles/Tank', x: 1, y: 1 }, map);
    assert.equal('variant' in plainProp, false);
    assert.equal('variant' in R.propModelSpec(plainProp), false);
});

test('variants are read once by name, with only what each says, and an unknown name is the model\'s own look', () => {
    const json = sidecar();
    const variants = R.readModelVariants(json);
    assert.deepEqual(variants.map(v => v.name), ['Black', 'Parade', 'Matte', 'Sneaky'], 'a name appears once; a blank name is no variant');
    assert.deepEqual(plain(variants[0]), { name: 'Black', color: { mode: 'colorize', color: '#202020', strength: 1, lightness: -0.5 }, media: { flag: { file: 'flags/black.png' }, screen: false } });
    assert.equal(variants[1].texture, 'parade.png');
    assert.equal(variants[1].surface.metal, 1);
    assert.equal(variants[2].surface, false);
    assert.equal('texture' in variants[3], false, 'a texture is a file in the model\'s own folder, never a path');
    assert.deepEqual(R.readModelVariants({}), []);
    assert.deepEqual(R.readModelVariants(null), []);
    // Color settings: only the keys the mode uses; one that changes nothing is no adjustment.
    assert.deepEqual(plain(R.readVariantColor({ mode: 'adjust', hue: 400, saturation: 5, brightness: -1 })), { mode: 'adjust', hue: 180, saturation: 2, brightness: 0 });
    assert.equal(R.readVariantColor({ mode: 'adjust', hue: 0, saturation: 1, brightness: 1 }), null);
    assert.equal(R.readVariantColor({ mode: 'colorize', color: '#ff0000', strength: 0 }), null);
    assert.equal(R.readVariantColor({ mode: 'paint' }), null);
    assert.equal(R.readVariantColor({ mode: 'colorize', color: 'red' }).color, '#ffffff');
    // Lookup, and the fallback said once.
    assert.equal(R.modelVariant(json, 'Parade').name, 'Parade');
    assert.equal(R.modelVariant(json, ''), null);
    const warned = [], warn = console.warn;
    console.warn = text => warned.push(String(text));
    try {
        assert.equal(R.modelVariant(json, 'Gone'), null);
        assert.equal(R.modelVariant(json, 'Gone'), null);
    } finally { console.warn = warn; }
    assert.equal(warned.length, 1, 'one diagnostic, never an error');
    assert.match(warned[0], /Gone/);
});

test('a use shows its variant\'s surface, picture and media, and the model\'s own for what the variant leaves alone', () => {
    const json = sidecar();
    const spec = variant => R._normalizeModelSpecNow({ name: 'Vehicles/Tank', variant });
    // Surface: the model's, the variant's own, or none.
    assert.equal(R.readModelTransform(json).surface.reflect, 0.5);
    assert.equal(R.readModelTransform(json, spec('')).surface.reflect, 0.5);
    assert.equal(R.readModelTransform(json, spec('Black')).surface.reflect, 0.5, 'Black says nothing about the surface');
    assert.equal(R.readModelTransform(json, spec('Parade')).surface.tint, '#ffcc55');
    assert.equal(R.readModelTransform(json, spec('Matte')).surface, null);
    assert.equal(R.readModelTransform(json, spec('Gone')).surface.reflect, 0.5);
    // Look: null is the model's own picture.
    assert.equal(R.readModelTransform(json).look, null);
    assert.equal(R.readModelTransform(json, spec('Matte')).look, null);
    assert.deepEqual(plain(R.readModelTransform(json, spec('Black')).look), { color: { mode: 'colorize', color: '#202020', strength: 1, lightness: -0.5 }, texture: '', model: 'Vehicles/Tank' });
    assert.equal(R.readModelTransform(json, spec('Parade')).look.texture, 'parade.png');
    // Media surfaces: another picture, or left off; other effects are the model's.
    const names = list => list.map(e => e.name + (e.video ? ':' + e.video.file : ''));
    assert.deepEqual(names(R.readModelEffects(json)), ['flag:flags/red.png', 'screen:screens/a.webm', 'muzzle']);
    assert.deepEqual(names(R.readModelEffects(json, spec('Black'))), ['flag:flags/black.png', 'muzzle']);
    assert.deepEqual(names(R.readModelEffects(json, spec('Parade'))), ['flag:flags/red.png', 'screen:screens/a.webm', 'muzzle']);
    const black = R.readModelEffects(json, spec('Black'))[0];
    assert.equal(black.video.width, 0.3, 'the surface keeps its place and size');
    assert.equal(json.effects[0].video.file, 'flags/red.png', 'the model\'s own list is not changed');
});

test('an effect names the variants that wear it; with no list every one does', () => {
    const spec = variant => R._normalizeModelSpecNow({ name: 'Vehicles/Tank', variant });
    const json = {
        effects: [
            { name: 'muzzle', animation: 12 },
            { name: 'flag', type: 'video', video: { file: 'flags/black.png' }, variants: ['Black'] },
            { name: 'lamp', type: 'light', light: { radius: 3 }, trigger: 'always', variants: ['Parade'] },
            { name: 'plate', type: 'video', video: { file: 'plate.png' }, variants: ['', 'Parade'] },
            { name: 'beacon', animation: 3, variants: [] },
            { name: 'ghost', animation: 4, variants: ['Gone'] }
        ],
        variants: [{ name: 'Black', media: { plate: false } }, { name: 'Parade', media: { muzzle: false, flag: { file: 'flags/gold.png' } } }]
    };
    const names = list => list.map(effect => effect.name);
    // A reader with no use in mind (the editor's lists, the Play 3D Effect command's choices) sees them all.
    assert.deepEqual(names(R.readModelEffects(json)), ['muzzle', 'flag', 'lamp', 'plate', 'beacon', 'ghost']);
    // The model's own look is "" in a list; an absent or empty list is every variant.
    assert.deepEqual(names(R.readModelEffects(json, spec(''))), ['muzzle', 'plate', 'beacon']);
    assert.deepEqual(names(R.readModelEffects(json, { name: 'Vehicles/Tank' })), ['muzzle', 'plate', 'beacon'], 'a use that names no variant wears the model\'s own');
    assert.deepEqual(names(R.readModelEffects(json, spec('Black'))), ['muzzle', 'flag', 'beacon'], 'only-in-one, of any type; the plate is not Black\'s');
    assert.deepEqual(names(R.readModelEffects(json, spec('Parade'))), ['muzzle', 'lamp', 'plate', 'beacon'], 'the legacy "off" is for media surfaces only');
    assert.deepEqual(names(R.readModelEffects(json, spec('Nobody'))), ['muzzle', 'plate', 'beacon'], 'a variant the model no longer has wears the model\'s own');
    // A variant change in play swaps the set, and what the new one does not wear goes out.
    const stopped = [];
    const keepSidecars = R._sidecarJson, keepStop = R.stopAnchoredAnimation;
    R._sidecarJson = { 'Vehicles/Tank': json };
    R.stopAnchoredAnimation = entry => stopped.push(entry.triggered);
    try {
        const parade = R.readModelEffects(json, spec('Parade'));
        const holder = { variant: 'Parade', object: null, effects: parade,
            lights: { lamp: { effect: parade[1], until: 0 } }, anchored: [{ triggered: 'muzzle' }, { triggered: 'lamp-glow' }, {}] };
        holder.object = {};
        const keep = [R.applyModelSurface, R.applyModelLook];
        R.applyModelSurface = R.applyModelLook = () => {};
        try { R.refreshModelVariant(holder, spec('Black')); } finally { [R.applyModelSurface, R.applyModelLook] = keep; }
        assert.equal(holder.variant, 'Black');
        assert.deepEqual(names(holder.effects), ['muzzle', 'flag', 'beacon']);
        assert.deepEqual(Object.keys(holder.lights), [], 'the Parade lamp goes out');
        assert.deepEqual(stopped, ['lamp-glow'], 'a looping animation of an effect it no longer wears stops; the others play on');
        // A rule or a command that names an effect this variant does not wear does nothing, quietly.
        assert.equal(R.modelEffectByName(holder.effects, 'lamp'), null);
        assert.doesNotThrow(() => R.fireNamedEffect(R.modelEffectByName(holder.effects, 'lamp'), null, holder));
    } finally {
        R._sidecarJson = keepSidecars; R.stopAnchoredAnimation = keepStop;
    }
});

test('colorize keeps each texel\'s light and dark and gives it the color; adjust shifts what is there', () => {
    const near = (a, b, eps = 0.02) => a.every((v, i) => Math.abs(v - b[i]) <= eps);
    const lightness = rgb => (Math.max(...rgb) + Math.min(...rgb)) / 2;
    const red = { mode: 'colorize', color: '#ff0000', strength: 1, lightness: 0 };
    for (const texel of [[0.2, 0.4, 0.2], [0.8, 0.85, 0.7], [0.1, 0.1, 0.1], [0.5, 0.5, 0.5]]) {
        const out = R.adjustLookRgb(texel, red);
        assert.ok(Math.abs(lightness(out) - lightness(texel)) < 0.01, 'the same lightness');
        assert.ok(out[0] >= out[1] && out[0] >= out[2] && Math.abs(out[1] - out[2]) < 0.01, 'and it is red');
    }
    // Strength: half way there.
    const half = R.adjustLookRgb([0.2, 0.4, 0.2], Object.assign({}, red, { strength: 0.5 }));
    const full = R.adjustLookRgb([0.2, 0.4, 0.2], red);
    assert.ok(near(half, [0.2, 0.4, 0.2].map((v, i) => (v + full[i]) / 2)));
    // Lightness: toward black or white, detail kept in order.
    const dark = { mode: 'colorize', color: '#202020', strength: 1, lightness: -0.6 };
    const a = R.adjustLookRgb([0.3, 0.5, 0.3], dark), b = R.adjustLookRgb([0.6, 0.8, 0.6], dark);
    assert.ok(lightness(a) < lightness(b), 'a darker texel stays darker');
    assert.ok(lightness(b) < 0.35, 'and the whole thing is dark');
    assert.ok(Math.abs(a[0] - a[1]) < 0.01 && Math.abs(a[1] - a[2]) < 0.01, 'a grey color takes the color out');
    // Adjust: green turned a third of the way round is blue; saturation 0 is grey; brightness scales.
    assert.ok(near(R.adjustLookRgb([0, 1, 0], { mode: 'adjust', hue: 120, saturation: 1, brightness: 1 }), [0, 0, 1]));
    assert.ok(near(R.adjustLookRgb([0.2, 0.6, 0.2], { mode: 'adjust', hue: 0, saturation: 0, brightness: 1 }), [0.4, 0.4, 0.4]));
    assert.ok(near(R.adjustLookRgb([0.2, 0.6, 0.2], { mode: 'adjust', hue: 0, saturation: 1, brightness: 0.5 }), [0.1, 0.3, 0.1]));
    assert.ok(near(R.adjustLookRgb([0.3, 0.5, 0.7], null), [0.3, 0.5, 0.7]));
    assert.deepEqual(R.hexHueSaturation('#808080'), [0, 0]);
    assert.ok(Math.abs(R.hexHueSaturation('#0000ff')[0] - 2 / 3) < 1e-6);
});

test('a look goes on an instance\'s own materials: a program of its own while it adjusts, the model\'s own again when it goes', () => {
    const THREE = loadThree();
    const map = new THREE.Texture();
    const textured = new THREE.MeshBasicMaterial({ color: 0xffffff, map });
    const flat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.2, 0.6, 0.2, THREE.SRGBColorSpace) });
    const glow = new THREE.MeshBasicMaterial({ color: 0x00ffff }); glow.__reactorSelfLit = true;
    R.litMaterial(textured);
    const object = new THREE.Group();
    for (const material of [textured, flat, glow]) object.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
    const keyBefore = textured.customProgramCacheKey();
    // No look on a model that never had one: nothing is touched or remembered.
    R.applyModelLook(object, null);
    assert.equal(R.lookOf(textured), null);
    assert.equal(textured.customProgramCacheKey(), keyBefore);
    const versions = [textured.version, flat.version];
    R.applyModelLook(object, { color: { mode: 'colorize', color: '#ff0000', strength: 0.8, lightness: -0.25 }, texture: '', model: 'Vehicles/Tank' });
    const look = R.lookOf(textured);
    assert.ok(look && look.a.isVector4, 'the textured material carries the adjustment as uniforms');
    assert.deepEqual([look.a.x, look.a.y, look.a.z], [1, 0.8, -0.25]);
    assert.ok(Math.abs(look.b.x) < 1e-6 && Math.abs(look.b.y - 1) < 1e-6, 'red: hue 0, full saturation');
    assert.notEqual(textured.customProgramCacheKey(), keyBefore, 'and a program key of its own');
    assert.match(textured.customProgramCacheKey(), /\|look/);
    assert.ok(textured.version > versions[0], 'it recompiles when the adjustment starts');
    assert.equal(textured.map, map, 'the picture is the model\'s own');
    assert.equal(textured.color.getHex(), 0xffffff, 'its color is not multiplied: the texel is adjusted in the program');
    // The flat material is adjusted on its color; the glow is left alone.
    assert.equal(R.lookOf(flat), null);
    const out = flat.color.getRGB({}, THREE.SRGBColorSpace);
    assert.ok(out.r > out.g && out.r > out.b, 'the flat green is red now');
    assert.equal(flat.userData.baseColor.getHex(), flat.color.getHex(), 'and that is its base color, so a flash or the ambient returns to it');
    assert.equal(glow.color.getHex(), 0x00ffff);
    // The same uniforms change in place for another adjustment: no new program.
    const a = look.a, version = textured.version;
    R.applyModelLook(object, { color: { mode: 'adjust', hue: 90, saturation: 1.5, brightness: 0.5 }, texture: '', model: 'Vehicles/Tank' });
    assert.equal(R.lookOf(textured).a, a);
    assert.deepEqual([a.x, R.lookOf(textured).b.x, R.lookOf(textured).b.y, R.lookOf(textured).b.z], [2, 0.25, 1.5, 0.5]);
    assert.equal(textured.version, version, 'changing the numbers does not recompile');
    // Gone: the model's own again.
    R.applyModelLook(object, null);
    assert.equal(R.lookOf(textured), null);
    assert.equal(textured.customProgramCacheKey(), keyBefore);
    assert.ok(textured.version > version);
    const back = flat.color.getRGB({}, THREE.SRGBColorSpace);
    assert.ok(Math.abs(back.r - 0.2) < 0.01 && Math.abs(back.g - 0.6) < 0.01);
    // The HalfLight twin shares all of it by inheritance.
    R.applyModelLook(object, { color: { mode: 'colorize', color: '#0000ff', strength: 1, lightness: 0 }, texture: '', model: 'Vehicles/Tank' });
    const twin = Object.create(textured);
    assert.equal(R.lookOf(twin), R.lookOf(textured));
});

test('the adjustment is placed round the texture read, once, leaving the chunk for the injections that follow it', () => {
    const THREE = loadThree();
    const material = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
    const object = new THREE.Group(); object.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
    R.applyModelLook(object, { color: { mode: 'colorize', color: '#ff0000', strength: 1, lightness: 0 }, texture: '', model: 'M' });
    assert.match(material.customProgramCacheKey(), /\|look$/, 'an unlit material keys its own program');
    const shader = { uniforms: {}, vertexShader: 'void main() {}', fragmentShader: 'void main() {\n\tvec4 diffuseColor = vec4( diffuse, opacity );\n\t#include <map_fragment>\n\t#include <color_fragment>\n}' };
    material.onBeforeCompile(shader, null);
    assert.equal(shader.uniforms.rrLookA.value, R.lookOf(material).a);
    assert.equal((shader.fragmentShader.match(/#include <map_fragment>/g) || []).length, 1);
    assert.match(shader.fragmentShader, /vec4 rrLookBase = diffuseColor;\n\tdiffuseColor = vec4\(1\.0\);\n#endif\n\t#include <map_fragment>\n#ifdef USE_MAP\n\tdiffuseColor\.rgb = rrLookAdjust\(diffuseColor\.rgb\);\n\tdiffuseColor \*= rrLookBase;/);
    const once = shader.fragmentShader;
    R.injectLook(material, shader);
    assert.equal(shader.fragmentShader, once, 'never twice');
    // A lit material's own chain places it; the wrapper stands aside.
    const lit = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
    const litObject = new THREE.Group(); litObject.add(new THREE.Mesh(new THREE.BufferGeometry(), lit));
    R.applyModelLook(litObject, { color: { mode: 'adjust', hue: 30, saturation: 1, brightness: 1 }, texture: '', model: 'M' });
    R.litMaterial(lit);
    assert.equal((lit.customProgramCacheKey().match(/\|look/g) || []).length, 1, 'one key part, lit after the look or before');
    assert.match(read('runtime/reactor_3d_lighting.js'), /Reactor3D\.injectShine\(this, shader\);\n\s+\/\/ A model variant's color adjustment, last[^\n]*\n\s+if \(Reactor3D\.injectLook\) Reactor3D\.injectLook\(this, shader\);/);
});

test('a script gives a live character another variant: its spec carries it, built once per change', () => {
    const base = R._normalizeModelSpecNow({ name: 'Vehicles/Tank', variant: 'Black' });
    const character = {};
    assert.equal(R.variantSpecOf(character, base), base, 'untouched: the spec as stored');
    R.setModelVariant(character, 'Parade');
    const worn = R.variantSpecOf(character, base);
    assert.equal(worn.variant, 'Parade');
    assert.equal(worn.name, base.name);
    assert.equal(R.variantSpecOf(character, base), worn, 'the same object every frame');
    R.setModelVariant(character, '');
    assert.equal('variant' in R.variantSpecOf(character, base), false, '"" is the model\'s own look');
    assert.deepEqual(Object.keys(character), ['_reactorModelVariant'], 'one saved field on the character');
    assert.equal(R.variantSpecOf(null, base), base);
    assert.equal(R.variantSpecOf(character, null), null);
});

// ---- The editor: the file's variants and the Variant choice at each use ----

const Panel = require(path.join(repoRoot, 'editor', 'src', 'database', 'ModelVariantsPanel.js'));
const Elevation = require(path.join(repoRoot, 'editor', 'src', 'utils', 'MapElevation.js'));

test('saving variants touches nothing else in model.json, and a file is unchanged until a variant is made', () => {
    const before = JSON.stringify({ transform: { scale: 2 }, animations: [{ name: 'Idle' }], rig: { joints: [] }, landmarks: { mouth: [0, 1, 0] }, custom: { kept: true } }, null, 2) + '\n';
    const none = JSON.parse(Panel.mergeVariants(before, []));
    assert.deepEqual(none, JSON.parse(before), 'no variants: no variants field, every other field as it was');
    const text = Panel.mergeVariants(before, [
        { name: ' Black ', color: { mode: 'colorize', color: '#202020', strength: 1, lightness: -0.4 }, media: { flag: { file: 'flags/black.png' }, screen: false, junk: 3 } },
        { name: 'Plain' },
        { name: 'Black', texture: 'dup.png' },
        { name: 'Off', color: { mode: 'colorize', color: '#ff0000', strength: 0 } },
        { name: 'Same', color: { mode: 'adjust', hue: 0, saturation: 1, brightness: 1 } },
        { name: 'Path', texture: '../x.png' }
    ]);
    const json = JSON.parse(text);
    assert.deepEqual(Object.keys(json), ['transform', 'animations', 'rig', 'landmarks', 'custom', 'variants'], 'the other fields keep their order; variants goes last');
    assert.deepEqual(json.custom, { kept: true });
    assert.deepEqual(json.variants, [
        { name: 'Black', color: { mode: 'colorize', color: '#202020', strength: 1, lightness: -0.4 }, media: { flag: { file: 'flags/black.png' }, screen: false } },
        { name: 'Plain' },
        { name: 'Off' },
        { name: 'Same' },
        { name: 'Path' }
    ], 'a name once; a color that changes nothing and a texture outside the folder are not written');
    // What the editor writes is what the game reads.
    assert.deepEqual(plain(R.readModelVariants(json)).map(v => v.name), ['Black', 'Plain', 'Off', 'Same', 'Path']);
    assert.equal(R.modelLook(json, { name: 'M', variant: 'Black' }).color.lightness, -0.4);
    // Deleting the last variant takes the field out again.
    assert.equal('variants' in JSON.parse(Panel.mergeVariants(text, [])), false);
    assert.throws(() => Panel.mergeVariants('[1]', []), /JSON object/);
});

test('a new variant gets a name of its own, and the Variant choice shows only for a model that has variants', () => {
    const list = [{ name: 'Variant' }, { name: 'Variant 2' }, { name: 'Black' }];
    assert.equal(Panel.uniqueName('Variant', list), 'Variant 3');
    assert.equal(Panel.uniqueName(' Green ', list), 'Green');
    assert.equal(Panel.uniqueName('Black', list, list[2]), 'Black', 'renaming a variant to its own name keeps it');
    assert.equal(Panel.uniqueName('', []), 'Variant');
    assert.equal(Panel.selectHtml('pick', [], '', "Model's own"), '', 'no variants: no choice');
    const html = Panel.selectHtml('pick', ['Black', 'A "B" <c>'], 'Black', "Model's own");
    assert.match(html, /^<select class="pick"/);
    assert.match(html, /<option value="">Model's own<\/option><option value="Black" selected/);
    assert.match(html, /value="A &quot;B&quot; &lt;c>"/, 'names are escaped');
    // A use that names a variant the model lost keeps the name on show.
    assert.match(Panel.selectHtml('pick', [], 'Gone', "Model's own"), /value="Gone" selected/);
    assert.match(Panel.selectHtml('pick', ['Black'], 'Gone', "Model's own"), /value="Black".*value="Gone" selected/);
});

test('the variant names a use offers come from the model\'s file on disk', () => {
    const os = require('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-variants-'));
    try {
        fs.mkdirSync(path.join(dir, '3d', 'Vehicles', 'Tank'), { recursive: true });
        fs.writeFileSync(path.join(dir, '3d', 'Vehicles', 'Tank', 'model.json'), JSON.stringify({ variants: [{ name: 'Black' }, { name: ' Desert ' }, { name: 'Black' }, { nope: 1 }] }));
        assert.deepEqual(Panel.namesFor(dir, 'Vehicles/Tank'), ['Black', 'Desert']);
        assert.deepEqual(Panel.namesFor(dir, 'Vehicles/Missing'), []);
        assert.deepEqual(Panel.namesFor('', 'Vehicles/Tank'), []);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('a placed model keeps its variant through every edit, and one without a variant is written as before', () => {
    const map = { width: 20, height: 20 };
    const bare = Elevation.normalizeProp({ id: 1, name: 'Vehicles/Tank', x: 3, y: 4 }, map);
    assert.equal('variant' in bare, false);
    assert.deepEqual(Object.keys(bare), Object.keys(Elevation.normalizeProp({ id: 1, name: 'Vehicles/Tank', x: 3, y: 4, variant: '  ' }, map)), 'an empty variant writes no key');
    const worn = Elevation.normalizeProp({ id: 2, name: 'Vehicles/Tank', x: 3, y: 4, variant: ' Black ' }, map);
    assert.equal(worn.variant, 'Black');
    assert.equal(Elevation.normalizeProp(worn, map).variant, 'Black', 'round trip');
    // The game reads the same prop the same way.
    assert.equal(R.normalizeProp(worn).variant, 'Black');
    assert.equal('variant' in R.normalizeProp(bare), false);
    assert.equal(R.propModelSpec(R.normalizeProp(worn)).variant, 'Black');
});

test('every place a model is chosen or drawn passes its variant on', () => {
    const picker = read('editor/src/event/ModelGraphicPicker.js');
    assert.match(picker, /this\.selectedVariant = \(current && current\.variant\) \|\| ''/);
    assert.match(picker, /\.\.\.\(this\.selectedVariant \? \{ variant: this\.selectedVariant \} : \{\}\)/, 'the picker returns the variant, and no key without one');
    assert.match(picker, /this\.selectedVariant = '';\s*this\._refreshVariant\(\);/, 'another model starts in its own look');
    const props = read('editor/src/ModelPropsManager.js');
    assert.match(props, /\.\.\.\(prop\.variant \? \{ variant: prop\.variant \} : null\)/, 'a placed model\'s spec');
    assert.equal((props.match(/variant: this\.model\.variant \|\| ''/g) || []).length >= 4, true, 'placing, the ghost, the panel preview and the placement spec');
    assert.match(props, /variant: prop\.variant \|\| ''/, 'selecting a placed model takes its variant in hand');
    assert.match(props, /variant: spec\.variant \|\| ''/, 'the picker\'s choice reaches the model in hand and the selected one');
    const eventEditor = read('editor/src/event/EventEditor.js');
    assert.equal((eventEditor.match(/variant/g) || []).length >= 3, true, 'an event page\'s model keeps its variant into and out of the editor');
    const previews = read('editor/src/utils/EventPreviewModels.js');
    assert.match(previews, /spec && spec\.variant && sidecar && Reactor3D\.readModelTransform\s*\? Reactor3D\.readModelTransform\(sidecar, spec\) : template\.userData\.reactorTransform/);
    assert.match(read('editor/src/MapEditor3D.js'), /Reactor3D\.readModelEffects\(sidecar, spec\)/);
    assert.match(read('editor/src/MapEditor3D.js'), /prop\.texture, prop\.variant \|\| ''/, 'a placed model is rebuilt when its variant changes');
    assert.match(read('editor/src/utils/ModelPropsPreview2D.js'), /readModelEffects\(template\.userData\.reactorSidecar \|\| \{\}, spec\)/);
    assert.match(read('editor/src/EventManager.js'), /\$\{spec\.variant \|\| ''\}@\$\{pixels\}/, 'the flat map\'s picture of an event is per variant');
    assert.match(read('editor/src/event/EventPageEditor.js'), /ModelVariantsPanel\.wear\(mesh, project\.path, model\.name, model\.variant\)/);
    // The game: every instance is prepared with its spec.
    const models = read('runtime/reactor_3d_models.js');
    assert.equal((models.match(/readModelTransform\(sidecar, spec\)/g) || []).length, 6);
    assert.equal(/readModelTransform\(sidecar\)\)/.test(models), false, 'no instance left reading the model\'s look without its spec');
    assert.match(read('runtime/reactor_battle_room.js'), /R\.readModelTransform\(sidecar, spec\)/);
    assert.match(read('runtime/reactor_battle_room.js'), /R\.readModelEffects\(sidecar, spec\)/);
});
