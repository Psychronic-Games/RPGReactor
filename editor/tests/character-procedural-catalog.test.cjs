'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const dir = path.resolve(__dirname, '../src/forge/Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody'), Wardrobe = load('CharacterWardrobe'), Props = load('CharacterProps');
const Hair = load('CharacterHair'), Skin = load('CharacterSkin'), Species = load('CharacterSpecies'), Glb = load('CharacterGlb');
const garments = 'polo cardigan cropTop offShoulder flaredTrousers capri pleatedSkirt pencilSkirt ballGown eveningGown tailcoat apron coveralls scrubs uniform swimBriefs swimTrunks bikiniTop swimsuit briefs boxers bra sportsBra socks stockings tights operaGloves fingerlessGloves qipao balletDress tennisDress wetsuit triathlonSuit cargoTrousers'.split(' ');
const props = 'eyeMask mouthMask respirator nails claws satchel beltPouch canteen sword dagger axe spear staff bow shield hammer pickaxe lantern book umbrella beret sunhat neckTie suitcase microphone guitar tennisRacket headset stethoscope'.split(' ');
let pack, bodies;
test.before(async () => {
    pack = await Body.loadPack();
    bodies = [Body.build(pack, { gender: 0 }), Body.build(pack, { gender: 1, weight: 1.4, muscle: 1.3, shapes: { shoulders: 1.7, handSize: 1.2, headWidth: 1 } })];
});

function sound(parts, bones, label) {
    assert.ok(parts.length, label + ' has geometry');
    for (const p of parts) {
        const count = p.positions.length / 3;
        assert.ok(count > 0 && p.index.length > 0, label + ': nonempty mesh');
        assert.ok([...p.positions, ...p.normals].every(Number.isFinite), label + ': finite positions and normals');
        assert.ok([...p.index].every(i => i >= 0 && i < count), label + ': valid indices');
        for (let v = 0; v < count; v++) {
            let weight = 0;
            for (let k = 0; k < 4; k++) {
                assert.ok(p.joints[v * 4 + k] < bones.length, label + ': bone index');
                weight += p.weights[v * 4 + k];
            }
            assert.ok(Math.abs(weight - 1) < 0.001, label + ': normalized skin weights');
        }
    }
}

test('every new garment cut builds on average and extreme bodies without external asset data', () => {
    for (const body of bodies) for (const id of garments) {
        const def = Wardrobe.BY_ID.get(id);
        assert.ok(def && !def.modeled && !def.transfer, id + ' uses generated cuts');
        const result = Wardrobe.build(pack, body, [{ id }], { atlasSize: 64 });
        sound(result.parts, body.bones, id);
    }
});

test('underwear and hosiery layer under separate outer garments and footwear', () => {
    const input = [{ id: 'shoes' }, { id: 'socks' }, { id: 'jeans' }, { id: 'briefs' }, { id: 'bra' }, { id: 'shirt' }];
    const normalized = Wardrobe.normalizeOutfit(input);
    assert.equal(normalized.length, input.length);
    assert.ok(normalized.findIndex(x => x.id === 'briefs') < normalized.findIndex(x => x.id === 'jeans'));
    assert.ok(normalized.findIndex(x => x.id === 'socks') < normalized.findIndex(x => x.id === 'shoes'));
    sound(Wardrobe.build(pack, bodies[0], normalized, { atlasSize: 64 }).parts, bodies[0].bones, 'layered outfit');
    const apron = Wardrobe.build(pack, bodies[0], [{ id: 'apron' }], { atlasSize: 64 });
    for (const part of apron.parts) for (let i = 1; i < part.positions.length; i += 3) assert.ok(part.positions[i] > bodies[0].height * 0.12, 'an apron does not also cut sleeves or cover feet');
});

test('the Bikini preset has independent swimwear separates that cover anatomical detail on every build', () => {
    const preset = Wardrobe.PRESETS.find(p => p.id === 'bikini');
    assert.equal(preset.group, 'Swimwear');
    assert.deepEqual(preset.items.map(i => i.id), ['bikiniTop', 'bikiniBottom']);
    const recipes = [{ gender: 0 }, { gender: 1 }, { gender: 0, extreme: true, weight: 4, cup: 2 }, { gender: 1, extreme: true, muscle: 2, weight: 0 }];
    for (const recipe of recipes) {
        const built = Body.build(pack, Body.normalizeRecipe(recipe));
        const out = Wardrobe.build(pack, built, preset.items, { atlasSize: 64 });
        sound(out.parts, built.bones, 'bikini on ' + JSON.stringify(recipe));
        const fields = Body.anatomyFields(pack);
        assert.ok(out.hidden.has(fields.low), 'the bottom covers the genital detail anchor');
        assert.ok(fields.nipples.every(n => out.hidden.has(n.v)), 'the top covers both nipple detail anchors');
        const normalized = load('CharacterModel').normalize(JSON.parse(JSON.stringify(Object.assign({}, recipe, { outfit: preset.items }))));
        assert.deepEqual(normalized.outfit.map(i => i.id), ['bikiniBottom', 'bikiniTop']);
    }
});

test('project emblems keep their picture reference and paint the decoded project picture', () => {
    const item = { id: 'tshirt', pattern: 'emblem', emblemPicture: 'Logos/Crew' };
    assert.equal(Wardrobe.normalizeItem(item).emblemPicture, item.emblemPicture, 'canonical PNG references have no extension');
    for (const ref of ['../Private.png', '/tmp/Badge.png', 'https://example.com/Badge.png', 'Badge.txt']) assert.equal(Wardrobe.normalizeItem(Object.assign({}, item, { emblemPicture: ref })).emblemPicture, undefined);
    const atlas = rgb => Wardrobe.build(pack, bodies[0], [item], { atlasSize: 256, emblemPictures: new Map([[item.emblemPicture, { width: 1, height: 1, data: Uint8Array.from([...rgb, 255]) }]]) }).texture;
    assert.notDeepEqual(atlas([240, 30, 20]).data, atlas([20, 40, 240]).data, 'the selected raster changes the emblem pixels');
    assert.equal(load('CharacterModel').normalize({ outfit: [item] }).outfit[0].emblemPicture, item.emblemPicture, 'the picture reference survives the recipe');
});

test('hair density, frizz and lock thickness change generated strands and preserve old defaults', () => {
    const build = settings => Hair.build(pack, bodies[0], Object.assign({ style: 'sidePart', lashes: false, brows: { style: 'none' } }, settings), { seed: 74, budget: 0.5 });
    const sparse = build({ density: 0.3 }), dense = build({ density: 1.5 });
    const triangles = parts => parts.reduce((sum, p) => sum + p.index.length / 3, 0);
    assert.ok(triangles(dense) > triangles(sparse) * 1.5);
    const normal = build({}), frizz = build({ frizz: 1 }), wide = build({ strandWidth: 1.8 });
    assert.notDeepEqual(frizz[0].positions, normal[0].positions);
    assert.notDeepEqual(wide[0].positions, normal[0].positions);
    assert.deepEqual(build({ density: 1, frizz: 0, strandWidth: 1 })[0].positions, normal[0].positions);
    for (const parts of [sparse, dense, frizz, wide]) sound(parts, bodies[0].bones, 'hair controls');
});

test('every new accessory builds finite, weighted geometry on both body shapes', () => {
    for (const body of bodies) for (const id of props) {
        const def = Props.BY_ID.get(id);
        assert.ok(def && def.frame, id + ' has a picker camera');
        sound(Props.build(pack, body, [{ id }]).parts, body.bones, id);
    }
});

test('tie styles stay finite through the full blade, on bare and clothed torsos', () => {
    for (const body of bodies) {
        const outfitParts = Wardrobe.build(pack, body, [{ id: 'shirt' }], { atlasSize: 64 }).parts;
        for (const shape of ['straight', 'bow', 'cravat']) for (const worn of [[], outfitParts]) {
            const made = Props.build(pack, body, [{ id: 'necktie', shape, length: 1.2 }], [], { outfitParts: worn });
            sound(made.parts, body.bones, shape + ' tie');
            for (const part of made.parts) for (let i = 2; i < part.positions.length; i += 3) assert.ok(Math.abs(part.positions[i]) < body.height, 'the blade stays near the torso');
        }
    }
});

test('closed power helmets enclose the face and suppress the mouth helpers', () => {
    const Expressions = load('CharacterExpressions');
    const HumanModel = load('CharacterModel');
    for (const body of bodies) {
        const helmet = Wardrobe.build(pack, body, [{ id: 'powerhelm' }], { atlasSize: 64 });
        sound(helmet.parts, body.bones, 'power helmet');
        assert.ok(Expressions.mouthCovered(pack, helmet.hidden), 'the lips are inside the helmet');
    }
    const result = HumanModel.build(pack, { outfit: [{ id: 'powerarmor' }, { id: 'powerhelm' }] }, {}, { quality: 'preview', skinSize: 64 });
    assert.ok(!result.parts.some(p => /teeth|tongue|mouth/i.test(p.name)), 'mouth helpers follow the covered face');
});

test('equipment uses one slot per hand and follows that hand in the saved GLB', () => {
    const chosen = Props.normalizeProps([{ id: 'sword', side: 'right' }, { id: 'shield', side: 'left' }, { id: 'nails' }]);
    assert.equal(chosen.length, 3);
    assert.deepEqual(Props.normalizeProps([...chosen, { id: 'staff', side: 'right' }]).map(x => x.id).sort(), ['nails', 'shield', 'staff']);
    assert.equal(Props.normalizeProp({ id: 'sword', side: 'bad' }).side, 'right');
    const made = Props.build(pack, bodies[0], [{ id: 'sword', side: 'left' }]);
    const joint = bodies[0].bones.findIndex(b => b.name === 'LeftHand');
    for (const p of made.parts) for (let v = 0; v < p.positions.length / 3; v++) assert.equal(p.joints[v * 4], joint);
    const bytes = Glb.toGlb({ parts: made.parts, bones: bodies[0].bones }, { name: 'Generated sword' });
    const data = Buffer.from(bytes);
    const json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
    assert.ok(json.skins[0].joints.length > joint);
    assert.ok(json.meshes.some(mesh => mesh.primitives.length));
});

test('fantasy additions build antennae, upper fangs and insect wings with valid skinning', () => {
    for (const body of bodies) {
        const features = Species.build(pack, body, { antennae: { type: 'moth' }, fangs: { type: 'long' }, wings: { type: 'insect' } });
        sound(features.parts, body.bones, 'insect and fangs');
    }
    assert.equal(Species.speciesRecipe('vampire').features.fangs.type, 'small');
    assert.equal(Species.speciesRecipe('insectfolk').features.wings.type, 'insect');
});

test('each added skin pattern paints deterministic pixels and distinct finishes', () => {
    const hashes = new Set();
    const { createHash } = require('node:crypto');
    for (const type of ['moles', 'scars', 'veins', 'stone', 'marble', 'lava']) {
        const settings = { type, color: '#e26537', scale: 1.2 };
        const first = Skin.paint(pack, '#514f57', settings, { size: 64 });
        const second = Skin.paint(pack, '#514f57', settings, { size: 64 });
        assert.deepEqual(first.data, second.data, type + ' is deterministic');
        hashes.add(createHash('sha256').update(first.data).digest('hex'));
    }
    assert.equal(hashes.size, 6);
});

test('applying a skin finish changes its colors once while preserving the rest of the recipe', () => {
    const Builder = vm.runInNewContext(fs.readFileSync(path.join(dir, 'Character3DBuilder.js'), 'utf8') + '\nCharacter3DBuilder;', { RRCharacterSkin: Skin });
    const builder = Object.create(Builder.prototype);
    builder.recipe = { skin: '#8a5a3c', hair: { style: 'cornrows' }, props: [{ id: 'sword' }], skinPattern: { type: 'freckles', lips: '#803543' } };
    let changed;
    builder._replace = value => { changed = value; };
    builder._onInput({ target: { tagName: 'SELECT', value: 'lava', dataset: { path: 'skinLook' } } }, true);
    assert.equal(changed.skinPattern.type, 'lava');
    assert.equal(changed.skin, Skin.LOOKS.find(x => x.id === 'lava').skin);
    assert.equal(changed.hair.style, 'cornrows');
    assert.equal(changed.props[0].id, 'sword');
    assert.equal(changed.skinPattern.lips, '#803543', 'a skin finish preserves chosen makeup');
    assert.equal(builder.recipe.skinPattern.type, 'freckles', 'the previous undo snapshot is untouched');
});

test('fangs remain seated at the lips and chest accessories clear the shaped torso', () => {
    for (const body of bodies) {
        const L = Props.landmarks(pack, body);
        const fangs = Species.build(pack, body, { fangs: { type: 'long' } }).parts[0];
        const lips = L.headIds.filter(v => Math.abs(L.P[v * 3 + 1] - L.mouth[1]) < 0.01 && Math.abs(L.P[v * 3]) < 0.04);
        const lipFront = Math.max(...lips.map(v => L.P[v * 3 + 2]));
        const toothFront = Math.max(...Array.from(fangs.positions).filter((_, i) => i % 3 === 2));
        assert.ok(toothFront <= lipFront+.004, 'upper teeth stay at the lips instead of floating ahead of the face');
        assert.ok(toothFront > L.mouth[2]-.02,'teeth remain at the mouth rather than buried in the skull');
        const chestY = L.neck.center[1] - 0.24, skinFront = L.frontAt(chestY, L.neck.center[0]);
        const part = Props.build(pack, body, [{ id: 'stethoscope' }]).parts[0];
        const front = [];
        for (let i = 0; i < part.positions.length; i += 3) if (Math.abs(part.positions[i + 1] - chestY) < 0.01) front.push(part.positions[i + 2]);
        assert.ok(Math.max(...front) > skinFront + 0.02, 'the chest piece is outside this body, including a full bust');
        const uniform = Wardrobe.build(pack, body, [{ id: 'scrubs' }], { atlasSize: 64 });
        let clothFront = -Infinity;
        for (const p of uniform.parts) for (let i = 0; i < p.positions.length; i += 3) if (Math.abs(p.positions[i]) < 0.04 && Math.abs(p.positions[i + 1] - chestY) < 0.03) clothFront = Math.max(clothFront, p.positions[i + 2]);
        const worn = Props.build(pack, body, [{ id: 'stethoscope' }], [], { outfitParts: uniform.parts }).parts[0];
        let badgeFront = -Infinity;
        for (let i = 0; i < worn.positions.length; i += 3) if (Math.abs(worn.positions[i + 1] - chestY) < 0.01) badgeFront = Math.max(badgeFront, worn.positions[i + 2]);
        assert.ok(badgeFront > clothFront + 0.02, 'the chest piece clears loose clothing as well as skin');
    }
});

test('new choices survive a recipe round trip; full gloves hide nails and fingerless gloves keep them', () => {
    const Model = load('CharacterModel');
    const recipe = Model.normalize({ hair: { style: 'cornrows', facial: { style: 'anchorBeard' } }, outfit: [{ id: 'polo' }, { id: 'briefs' }, { id: 'cargoTrousers' }], props: [{ id: 'sword' }, { id: 'shield' }], features: { antennae: { type: 'moth' } }, skinPattern: { type: 'marble' } });
    assert.deepEqual(Model.normalize(JSON.parse(JSON.stringify(recipe))), recipe);
    for (const id of ['gloves', 'fingerlessGloves']) {
        const result = Model.build(pack, { hair: { style: 'bald' }, outfit: [{ id }], props: [{ id: 'nails' }] }, {}, { quality: 'preview', skinSize: 64, atlasSize: 64 });
        assert.equal(result.parts.some(part => part.name === 'Plastic'), id === 'fingerlessGloves');
        assert.equal(result.recipe.props[0].id, 'nails', 'covering nails preserves them in the recipe');
    }
});
