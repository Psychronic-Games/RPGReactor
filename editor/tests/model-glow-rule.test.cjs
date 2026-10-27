/**
 * The `glow` model rule (reactor_3d_models.js): a part's emissive breathes (pulse), flickers or scrolls its
 * emissive map, by writing uniforms only — no geometry, material program or texture is made after the first
 * frame — on the instance's own materials, so another copy of the model keeps its light; an inactive trigger
 * puts the authored values back. Also: the Prop Builder writes such rules for the LED mask.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const R = require(path.join(root, 'runtime', 'reactor_3d.js'));
global.self = global; global.window = global;
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;

function model() {
    const object = new THREE.Group();
    const lit = new THREE.MeshStandardMaterial({ name: 'LED mask', emissive: 0x30c0ff, emissiveIntensity: 2 });
    lit.emissiveMap = new THREE.Texture();
    const dark = new THREE.MeshStandardMaterial({ name: 'Strap', emissive: 0x000000, emissiveIntensity: 1 });
    const face = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lit);
    face.name = 'LED mask';
    face.userData.parts = [{ name: 'LED mask', pivot: [0, 0, 0] }];
    const strap = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dark);
    strap.name = 'Strap';
    strap.userData.parts = [{ name: 'Strap', pivot: [0, 0, 0] }];
    object.add(face, strap);
    return { object, face, strap, lit, dark };
}
const rules = list => R.readModelAnimationRules({ animations: list });

test('a glow rule reads its mode, range, period and scroll speed, and keeps them in bounds', () => {
    const [pulse, flicker, scroll, odd] = rules([
        { type: 'glow', part: 'LED', mode: 'pulse', period: 90, min: 0.2, max: 1.4 },
        { type: 'glow', part: 'LED', mode: 'flicker', period: 30 },
        { type: 'glow', material: 'LED', mode: 'scroll', uv: [0.5, -0.25] },
        { type: 'glow', mode: 'sparkle', min: 2, max: 1 }
    ]);
    assert.equal(pulse.type, 'glow');
    assert.deepEqual([pulse.mode, pulse.period, pulse.min, pulse.max], ['pulse', 90, 0.2, 1.4]);
    assert.equal(flicker.mode, 'flicker');
    assert.deepEqual([scroll.mode, scroll.material, scroll.uv], ['scroll', 'LED', [0.5, -0.25]]);
    assert.deepEqual([odd.mode, odd.min, odd.max], ['pulse', 1, 2], 'an unknown mode pulses; a reversed range is put in order');
});

test('pulse breathes the part between min and max of its own intensity, on its own copy of the material', () => {
    const m = model(), binding = R.prepareModelInstance(m.object, []);
    const list = rules([{ type: 'glow', part: 'LED', mode: 'pulse', period: 60, min: 0.25, max: 1 }]);
    R.applyModelAnimation(binding, list, { frame: 0 });
    const own = m.face.material;
    assert.notEqual(own, m.lit, 'the instance lights its own material');
    assert.equal(m.lit.emissiveIntensity, 2, 'the shared material keeps its light');
    assert.equal(m.strap.material, m.dark, 'a part the rule does not name is left alone');
    assert.ok(Math.abs(own.emissiveIntensity - 2 * 0.25) < 1e-9, 'at the start of the period: min');
    R.applyModelAnimation(binding, list, { frame: 30 });
    assert.ok(Math.abs(own.emissiveIntensity - 2 * 1) < 1e-9, 'half a period on: max');
    R.applyModelAnimation(binding, list, { frame: 45 });
    assert.ok(Math.abs(own.emissiveIntensity - 2 * 0.625) < 1e-9, 'between: eased');
    assert.equal(m.face.material, own, 'the same material every frame: nothing remade');
});

test('flicker holds steps within the range and repeats the same way every run', () => {
    const [rule] = rules([{ type: 'glow', part: 'LED', mode: 'flicker', period: 40, min: 0.3, max: 0.9 }]);
    const a = [], b = [];
    for (let f = 0; f < 200; f++) { a.push(R.modelGlowValue(rule, f)); b.push(R.modelGlowValue(rule, f)); }
    assert.deepEqual(a, b);
    assert.ok(a.every(v => v >= 0.3 - 1e-9 && v <= 0.9 + 1e-9));
    assert.ok(new Set(a.map(v => v.toFixed(3))).size > 5, 'it changes');
});

test('scroll moves the emissive map offset on a texture of its own; nothing else is made after the first frame', () => {
    const m = model(), binding = R.prepareModelInstance(m.object, []);
    const list = rules([{ type: 'glow', material: 'LED', mode: 'scroll', uv: [0.5, 0] }]);
    R.applyModelAnimation(binding, list, { frame: 0 });
    const own = m.face.material, map = own.emissiveMap;
    assert.notEqual(map, m.lit.emissiveMap, 'the shared texture is not moved');
    assert.equal(map.source, m.lit.emissiveMap.source, 'the picture itself is shared, not copied');
    R.applyModelAnimation(binding, list, { frame: 60 });
    assert.ok(Math.abs(map.offset.x - 0.5) < 1e-9, 'a second at 0.5 a second');
    R.applyModelAnimation(binding, list, { frame: 150 });
    assert.ok(Math.abs(map.offset.x - 0.25) < 1e-9, 'wraps round');
    assert.equal(own.emissiveMap, map);
    assert.equal(m.lit.emissiveMap.offset.x, 0);
});

test('an inactive trigger puts the authored light back; an action plays for its period', () => {
    const m = model(), binding = R.prepareModelInstance(m.object, []);
    const list = rules([{ type: 'glow', name: 'Blink', part: 'LED', mode: 'pulse', trigger: 'action', period: 20, min: 0, max: 0.5 }]);
    R.applyModelAnimation(binding, list, { frame: 0 });
    const own = m.face.material;
    assert.equal(own.emissiveIntensity, 2, 'not playing: as authored');
    R.applyModelAnimation(binding, list, { frame: 110, action: { name: 'Blink', frame: 100 } });
    assert.ok(Math.abs(own.emissiveIntensity - 2 * 0.5) < 1e-9, 'half its period in: max');
    R.applyModelAnimation(binding, list, { frame: 140, action: { name: 'Blink', frame: 100 } });
    assert.equal(own.emissiveIntensity, 2, 'over: back as authored');
});

test('the Prop Builder writes glow rules for the LED mask, eyes, mouth and nose', async () => {
    global.rrEscapeHtml = s => String(s);
    const props = path.join(root, 'editor', 'src', 'forge', 'Props');
    for (const f of ['PropCloth', 'PropPaint', 'PropMesh', 'PropRandom', 'PropCatalog', 'PropModel', 'AccessoryProp']) require(path.join(props, f + '.js'));
    const Model = require(path.join(props, 'PropModel.js')), Acc = require(path.join(props, 'AccessoryProp.js'));
    await Acc.prepare();
    const result = Model.build(Acc.normalize({ accessory: { id: 'ledMask' } }), {});
    const side = Model.sidecar(result);
    const glows = (side.animations || []).filter(a => a.type === 'glow');
    assert.ok(glows.length >= 1, 'the LED mask carries glow rules');
    for (const g of glows) assert.ok(result.parts.some(p => p.name.toLowerCase().startsWith((g.part || g.material).toLowerCase())), `rule ${g.name} reaches a part`);
    const read = rules(glows);
    assert.ok(read.every(r => r.type === 'glow'));
    const plain = Model.build(Acc.normalize({ accessory: { id: 'glasses' } }), {});
    assert.ok(!(Model.sidecar(plain).animations || []).some(a => a.type === 'glow'), 'other equipment carries none');
});
