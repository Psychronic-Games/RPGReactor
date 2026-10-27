'use strict';
// Cyberware (RRCharacterCyberGear): cyber faces, masks, HUD eyewear and implants laid on the shaped body.
const assert = require('node:assert/strict');
const test = require('node:test');
const C3 = '../src/forge/Character3D/';
const Body = require(C3 + 'HumanBody.js');
const Props = require(C3 + 'CharacterProps.js');
const Cyber = require(C3 + 'CharacterCyberGear.js');
const Model = require(C3 + 'CharacterModel.js');
const Expressions = require(C3 + 'CharacterExpressions.js');

let pack;
test.before(async () => { pack = await Body.loadPack(); });

const HEADS = { man: { gender: 1 }, woman: { gender: 0 }, broad: { gender: 1, shapes: { headWidth: 1, jaw: 1 } }, child: { gender: 0, age: 11 }, narrow: { gender: 0.5, shapes: { headWidth: -1 } } };
const ALL = Cyber.PROPS.concat([Cyber.VISOR]);
const tris = parts => parts.reduce((n, p) => n + p.index.length / 3, 0);
const bounds = parts => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.positions[i + k]); hi[k] = Math.max(hi[k], p.positions[i + k]); }
    return { lo, hi, mid: lo.map((v, k) => (v + hi[k]) / 2) };
};
function sound(part, bones, label) {
    const n = part.positions.length / 3;
    assert.ok(n > 0 && part.index.length > 0, label + ' has geometry');
    for (const v of part.positions) assert.ok(Number.isFinite(v), label + ' finite');
    for (const i of part.index) assert.ok(i < n, label + ' index');
    for (let v = 0; v < n; v++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) { assert.ok(part.joints[v * 4 + k] < bones, label + ' joint'); sum += part.weights[v * 4 + k]; }
        assert.ok(Math.abs(sum - 1) < 1e-4, label + ' weights sum to one');
        assert.ok(Math.abs(Math.hypot(part.normals[v * 3], part.normals[v * 3 + 1], part.normals[v * 3 + 2]) - 1) < 0.01, label + ' unit normal');
    }
    if (part.uvs) for (const u of part.uvs) assert.ok(u >= -1e-6 && u <= 1 + 1e-6, label + ' uv in its picture');
    if (part.faceFollow) {
        assert.equal(part.faceFollow.mode.length, n, label + ' follow per vertex');
        for (let v = 0; v < n; v++) if (part.faceFollow.mode[v] === Cyber.modes.SKIN) assert.ok(part.faceFollow.source[v] >= 0, label + ' rides a real skin vertex');
    }
}

test('every piece builds sound in every style on varied heads, within its triangle budget', () => {
    for (const [name, recipe] of Object.entries(HEADS)) {
        const built = Body.build(pack, Body.normalizeRecipe(recipe));
        for (const def of ALL) for (const [style] of Cyber.STYLE_CHOICES) {
            if (name !== 'man' && style !== 'military') continue;
            const r = Props.build(pack, built, [{ id: def.id, style }], []);
            assert.ok(r.parts.length, `${def.id} ${style} on ${name}`);
            for (const p of r.parts) sound(p, built.bones.length, `${def.id} ${style} on ${name}: ${p.name}`);
            for (const p of r.parts) for (const key of ['texture', 'normalTexture', 'metallicRoughnessTexture', 'emissiveTexture']) if (p[key]) assert.ok(r.textures[p[key]], `${def.id}: ${key} delivered`);
            // Faceplates, full masks, visors and goggles up to about six thousand; the rest about four.
            const budget = ['cyberFaceplate', 'armorMask', 'ledMask', 'cyberRespirator', 'tacGoggles', 'visor'].includes(def.id) ? 6500 : 4600;
            assert.ok(tris(r.parts) <= budget, `${def.id} ${style} on ${name}: ${tris(r.parts)} triangles`);
        }
    }
});

test('pieces sit on their landmarks whatever the head', () => {
    for (const [name, recipe] of Object.entries(HEADS)) {
        const built = Body.build(pack, Body.normalizeRecipe(recipe)), L = Props.landmarks(pack, built);
        const at = (id, extra = {}) => bounds(Props.build(pack, built, [Object.assign({ id, style: 'military' }, extra)], []).parts);
        const width = Math.abs(L.eyeL.center[0] - L.eyeR.center[0]);
        // A faceplate spans the face: past both eyes, from above the brows to the chin, in front of the ears.
        const plate = at('cyberFaceplate');
        assert.ok(plate.lo[0] < L.eyeR.center[0] - width * 0.3 && plate.hi[0] > L.eyeL.center[0] + width * 0.3, name + ': faceplate covers both eyes');
        assert.ok(plate.hi[1] > L.eyeY + 0.02 && plate.lo[1] < L.mouth[1] - 0.02, name + ': faceplate from brow to chin');
        assert.ok(plate.hi[2] > L.noseTip[2], name + ': faceplate over the nose');
        // A jaw sits below the eyes; a brow plate above them.
        const jaw = at('cyberJaw'), brow = at('cyberBrow');
        assert.ok(jaw.hi[1] < L.eyeY && jaw.lo[1] < L.mouth[1], name + ': jaw on the lower face');
        assert.ok(brow.mid[1] > L.eyeY + 0.01 && brow.hi[1] < L.crown, name + ': brow plate on the forehead');
        // A monocle and a half-face plate are on the side asked for.
        assert.ok(at('hudMonocle', { side: 'left' }).mid[0] > 0 && at('hudMonocle', { side: 'right' }).mid[0] < 0, name + ': monocle side');
        assert.ok(at('cyberHalfFace', { side: 'left' }).mid[0] > 0 && at('cyberHalfFace', { side: 'right' }).mid[0] < 0, name + ': half-face side');
        // Under-eye lights under the eyes; temple jacks out at the temples; the chest core in front, the spine behind.
        const leds = at('underEyeLights');
        assert.ok(leds.hi[1] < L.eyeY && leds.lo[1] > L.noseTip[1] - 0.01, name + ': lights under the eyes');
        const jacks = Props.build(pack, built, [{ id: 'templeJacks', cables: false }], []).parts;
        const j = bounds(jacks);
        assert.ok(j.lo[0] < -width * 0.7 && j.hi[0] > width * 0.7 && j.lo[1] > L.eyeY - 0.01, name + ': jacks at both temples');
        const core = at('chestCore'), spine = at('spineImplant');
        assert.ok(core.mid[2] > L.neck.center[2] && core.hi[1] < L.neck.center[1], name + ': core on the chest');
        assert.ok(spine.mid[2] < L.neck.center[2] && spine.hi[1] > L.neck.center[1], name + ': spine up the back to the nape');
    }
});

test('face pieces follow the face: the jaw swings with the jaw, plates ride the skin, the rest stays', () => {
    const recipe = Model.normalize({ gender: 1, hair: { style: 'bald' }, props: [{ id: 'cyberJaw' }] });
    const result = Model.build(pack, recipe, {}, { quality: 'preview', skinSize: 64, atlasSize: 64 });
    const k = result.parts.findIndex(p => p.name === 'Cyber jaw'), part = result.parts[k];
    assert.ok(part && part.faceFollow, 'the jaw carries its follow modes');
    const modes = new Set(part.faceFollow.mode);
    assert.ok(modes.has(Cyber.modes.JAW) && modes.has(Cyber.modes.SKIN), 'jaw plates and cheek plates');
    const posed = Expressions.pose(pack, result, 'viseme_aa', 1);
    assert.ok(posed && posed.positions[k], 'the jaw moves with an open mouth');
    let jawDrop = 0, n = 0;
    for (let v = 0; v < part.faceFollow.mode.length; v++) if (part.faceFollow.mode[v] === Cyber.modes.JAW) { jawDrop += part.positions[v * 3 + 1] - posed.positions[k][v * 3 + 1]; n++; }
    assert.ok(jawDrop / n > 0.002, 'the jaw plates drop with the jaw: ' + (jawDrop / n));
    // The saved file carries it as morph targets.
    const morphs = Expressions.morphTargets(pack, result, ['viseme_aa']);
    assert.ok(morphs[0].parts.some(p => p.part === k), 'a viseme morph moves the jaw plates');
    // A plate with no face to follow (a visor) has no follow data.
    const visor = Props.build(pack, result.built, [{ id: 'visor' }], []).parts;
    assert.ok(visor.every(p => !p.faceFollow));
});

test('slots: a full face covering replaces glasses, masks and other face pieces; later wins', () => {
    const ids = list => Props.normalizeProps(list).map(p => p.id);
    assert.deepEqual(ids([{ id: 'glasses' }, { id: 'cyberFaceplate' }]), ['cyberFaceplate']);
    assert.deepEqual(ids([{ id: 'cyberFaceplate' }, { id: 'glasses' }]), ['glasses']);
    assert.deepEqual(ids([{ id: 'mouthMask' }, { id: 'cyberJaw' }]), ['cyberJaw']);
    assert.deepEqual(ids([{ id: 'cyberJaw' }, { id: 'cyberRespirator' }]), ['cyberRespirator']);
    assert.deepEqual(ids([{ id: 'cyberBrow' }, { id: 'cyberHalfFace' }, { id: 'underEyeLights' }, { id: 'ledMask' }]), ['ledMask']);
    assert.deepEqual(ids([{ id: 'halo' }, { id: 'haloProjector' }]), ['haloProjector']);
    assert.deepEqual(ids([{ id: 'wizardhat' }, { id: 'haloProjector' }]), ['haloProjector']);
    // Pieces in different places stay together, and an unrelated accessory is kept in its place.
    assert.deepEqual(ids([{ id: 'necklace' }, { id: 'templeJacks' }, { id: 'arGlasses' }, { id: 'spineImplant' }, { id: 'chestCore' }, { id: 'cyberJaw' }]), ['necklace', 'templeJacks', 'arGlasses', 'spineImplant', 'chestCore', 'cyberJaw']);
    // Face pieces have no face under an animal's head.
    assert.ok(!Model.fitsProp({ head: { kind: 'wolf' } }, 'cyberFaceplate') && Model.fitsProp({ head: { kind: 'wolf' } }, 'spineImplant'));
});

test('a mask over the lower face leaves the beard out while worn; the recipe keeps it', () => {
    const recipe = Model.normalize({ gender: 1, hair: { style: 'crew', facial: { style: 'fullBeard' } }, props: [{ id: 'cyberRespirator' }] });
    const masked = Model.build(pack, recipe, {}, { quality: 'preview', skinSize: 64, atlasSize: 64 });
    assert.equal(masked.recipe.hair.facial.style, 'fullBeard');
    assert.ok(!masked.parts.some(p => p.name === 'Facial hair'), 'no beard through the mask');
    const visor = Model.build(pack, Object.assign({}, recipe, { props: [{ id: 'visor' }] }), {}, { quality: 'preview', skinSize: 64, atlasSize: 64 });
    assert.ok(visor.parts.some(p => p.name === 'Facial hair'), 'eyewear keeps the beard');
});

test('recipes round-trip; styles, patterns and colors stay editable; empty colors take the style\'s', () => {
    const item = { id: 'ledMask', style: 'salvaged', pattern: 'bars', color: '', color2: '#ff3a3a', glow: 0.4, wear: 0.9 };
    const r = Model.normalize({ props: [item] });
    assert.deepEqual(Model.normalize(JSON.parse(JSON.stringify(r))).props, r.props);
    assert.equal(r.props[0].style, 'salvaged'); assert.equal(r.props[0].pattern, 'bars'); assert.equal(r.props[0].color, ''); assert.equal(r.props[0].glow, 0.4);
    // Unknown values fall back to the defaults.
    const bad = Props.normalizeProp({ id: 'armorMask', style: 'plaid', wear: 7, glow: -2 });
    assert.equal(bad.style, 'military'); assert.equal(bad.wear, 1); assert.equal(bad.glow, 0);
    // The shared style ids are the body mods'.
    assert.deepEqual(Cyber.STYLE_CHOICES.map(s => s[0]), ['sleek', 'military', 'salvaged', 'neon']);
    // The old cyber visor opens as the new one, its colors kept.
    const old = Props.normalizeProp({ id: 'visor', color: '#202024', color2: '#ff2bd6' });
    assert.equal(old.style, 'neon'); assert.equal(old.color2, '#ff2bd6');
    // Every piece has its UI fields: a style, glow, wear, colors that can be cleared, labels for its options.
    for (const def of ALL) {
        assert.ok(def.cyber && def.options.style && def.options.glow && def.options.wear && def.clearable, def.id);
        for (const key of Object.keys(def.options)) assert.ok(Cyber.LABELS[key], def.id + ' option label ' + key);
    }
});

test('looks put on matching sets; a random sci-fi character sometimes wears cyberware', () => {
    for (const look of Cyber.LOOKS) {
        const props = Props.normalizeProps(Cyber.wearLook([{ id: 'necklace' }, { id: 'visor' }], look.id));
        assert.ok(props.some(p => p.id === 'necklace') || look.props.some(p => (Props.BY_ID.get(p.id).slots || []).includes('neck')), look.id + ' keeps other accessories');
        assert.equal(props.filter(p => Cyber.isCyber(p.id)).length, look.props.length, look.id + ' wears all its pieces');
        assert.equal(new Set(look.props.map(p => p.style)).size, 1, look.id + ' is one style');
    }
    let cyber = 0;
    for (let seed = 1; seed <= 60; seed++) if (Model.random(seed).props.some(p => Cyber.isCyber(p.id))) cyber++;
    assert.ok(cyber > 0 && cyber < 40, 'some random characters wear cyberware: ' + cyber);
    assert.deepEqual(Model.random(42), Model.random(42), 'a seed gives the same character');
});

test('a combined look stays within a whole-character budget on a short-haired body', () => {
    const recipe = Model.normalize({ gender: 1, hair: { style: 'bald' }, props: Cyber.LOOKS.find(l => l.id === 'ironWarden').props });
    const result = Model.build(pack, recipe, {}, { quality: 'preview', skinSize: 64, atlasSize: 64 });
    assert.ok(tris(result.parts) < 65000, 'triangles: ' + tris(result.parts));
});

test('the builder shows a cyber piece as Style, its options, clearable colors, Glow and Wear; looks open as pictures', () => {
    const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
    const context = { window: {}, sessionStorage: { getItem: () => null }, RRCharacterProps: Props, RRCharacterCyberGear: Cyber, RRCharacterModel: Model, rrEscapeHtml: s => String(s) };
    context.window.RRCharacterCyberGear = Cyber;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8') + '\nglobalThis.B=Character3DBuilder;', context);
    const b = Object.create(context.B.prototype), pickers = [];
    Object.assign(b, { recipe: Model.normalize({ props: [{ id: 'armorMask' }, { id: 'templeJacks' }, { id: 'necklace' }] }), extreme: false,
        _t: s => s, _section: s => s, _heldModels: () => [], _project: () => null, _addPicker: (kind, label, options, act) => { pickers.push({ kind, label, options, act }); return ''; } });
    b._get = path => path.split('.').reduce((o, k) => (o == null ? o : o[k]), b.recipe);
    const html = b._propsTab();
    for (const label of ['Style', 'Shape', 'Glow color', 'Glow', 'Wear', 'Sides', 'Cables']) assert.ok(html.includes('>' + label + '<'), 'shows ' + label);
    assert.ok(html.includes('data-path="props.0.style"') && html.includes('value="military" selected'), 'the style select');
    assert.ok(html.includes('data-act="clear" data-path="props.0.color"'), 'a cleared color returns to the style');
    assert.ok(html.includes('data-path="props.2.color"') && !html.includes('data-path="props.2.style"'), 'other accessories keep their own fields');
    const looks = pickers.find(p => p.kind === 'cyberlook');
    assert.ok(looks && looks.act === 'cyber-look' && looks.options.length === Cyber.LOOKS.length, 'a picker of cyber looks');
    // A look's picture shows its pieces on the head.
    b.recipe = Model.normalize({}); b._thumbRecipe = context.B.prototype._thumbRecipe;
    const thumb = b._thumbRecipe({ kind: 'cyberlook', id: 'neonOni' });
    assert.equal(thumb.frame, 'head'); assert.deepEqual(thumb.recipe.props.map(p => p.id), Cyber.LOOKS.find(l => l.id === 'neonOni').props.map(p => p.id));
});
