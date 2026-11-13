'use strict';
// Forge › 3D Character Builder › Generate Group (RRCharacterGroups): many characters to one description. A member is
// the standard random character for a seed of its own, held to what the author ticked and ranged: the same member for
// the same description whatever the count, inside every range, of a ticked species and setting, in the open
// character's outfit when the group wears a uniform.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const dir = path.join(__dirname, '..', 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody');
for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody', 'CharacterGlb']) load(name);
const Model = load('CharacterModel'), Wardrobe = load('CharacterWardrobe');
const Groups = load('CharacterGroups'), Sheet = load('CharacterSpriteSheet');

test('a description is made whole and held to its limits', () => {
    const s = Groups.normalize({ name: ' Town/Guards: ', count: 5000, species: ['elf', 'nobody', 'slimefolk'], age: [70, 12], height: [2, -1], themes: ['Nowhere'], palette: ['#123456', 'red'], walkFrame: 9000, walkFrames: 5 });
    assert.equal(s.name, 'TownGuards');
    assert.equal(s.count, Groups.MOST);
    assert.deepEqual(s.species, ['elf'], 'unknown species and those with a body of their own are left out');
    assert.deepEqual(s.age, [18, 70], 'adults, low first');
    assert.deepEqual(s.height, [0, 1]);
    assert.deepEqual(s.themes, ['Everyday']);
    assert.deepEqual(s.palette, ['#123456']);
    assert.equal(s.walkFrame, 512);
    assert.equal(s.walkFrames, 3);
    assert.deepEqual(Groups.normalize({ species: [] }).species, ['human']);
    assert.ok(!Groups.speciesChoices().some(x => ['slimefolk', 'centaur', 'merfolk'].includes(x.id)));
});

test('a member is the same for the same description, whatever the count, and members differ', () => {
    const spec = { name: 'Folk', count: 6, seed: 42 };
    const a = Groups.members(spec), b = Groups.members({ ...spec, count: 30 });
    assert.equal(a.length, 6);
    assert.deepEqual(a.map(m => m.name), ['Folk 01', 'Folk 02', 'Folk 03', 'Folk 04', 'Folk 05', 'Folk 06']);
    for (let i = 0; i < 6; i++) assert.deepEqual(a[i].recipe, b[i].recipe, 'member ' + (i + 1));
    assert.equal(new Set(a.map(m => JSON.stringify(m.recipe))).size, 6, 'six different people');
    assert.notDeepEqual(Groups.member({ ...spec, seed: 43 }, 0), a[0].recipe, 'another seed, another group');
    assert.equal(Groups.memberName(Groups.normalize({ name: 'Army', count: 150 }), 6), 'Army 007');
});

test('every member lies inside the ranges, of a ticked species and gender share', () => {
    const spec = { name: 'Dwarves', count: 40, seed: 7, species: ['dwarf', 'gnome'], female: 0, age: [30, 40], height: [0.1, 0.3], weight: [0.5, 0.9], muscle: [0.6, 1] };
    const list = Groups.members(spec);
    for (const { name, recipe: r } of list) {
        assert.ok(['dwarf', 'gnome'].includes(r.species), name + ' is a ' + r.species);
        assert.equal(Body.sexOf(r), 'male', name);
        assert.ok(r.age >= 30 && r.age <= 40, name + ' age ' + r.age);
        assert.ok(r.height >= 0.1 && r.height <= 0.3, name + ' height ' + r.height);
        assert.ok(r.weight >= 0.5 && r.weight <= 0.9, name + ' weight ' + r.weight);
        assert.ok(r.muscle >= 0.6 && r.muscle <= 1, name + ' muscle ' + r.muscle);
        assert.ok(Array.isArray(r.outfit) && Array.isArray(r.props) && r.hair && r.plan === 'human', name + ' is a whole recipe');
    }
    assert.equal(new Set(list.map(m => m.recipe.species)).size, 2, 'both species turn up in forty');
    const women = Groups.members({ ...spec, female: 100 });
    assert.ok(women.every(m => Body.sexOf(m.recipe) === 'female'));
    const mixed = Groups.members({ name: 'Mixed', count: 60, seed: 3, female: 50 }).filter(m => Body.sexOf(m.recipe) === 'female').length;
    assert.ok(mixed > 15 && mixed < 45, mixed + ' women of sixty at an even share');
});

test('a uniform: the open character\'s outfit and accessories on every member, over different people', () => {
    const base = Model.normalize({ outfit: [{ id: 'tunic', color: '#7a1f1f' }, { id: 'jeans' }, { id: 'boots' }], props: [{ id: 'cape' }] });
    const list = Groups.members({ name: 'Guards', count: 8, seed: 11, keepOutfit: true, keepProps: true }, base);
    for (const m of list) {
        assert.deepEqual(m.recipe.outfit, base.outfit, m.name + ' wears the uniform');
        assert.deepEqual(m.recipe.props, base.props, m.name + ' carries the same');
    }
    assert.ok(new Set(list.map(m => [m.recipe.age, m.recipe.height, m.recipe.skin].join())).size > 4, 'different people in it');
    // Without a base to keep from, the group dresses itself as usual.
    assert.ok(Groups.member({ name: 'Guards', seed: 11, keepOutfit: true }, 0, null).outfit.length > 0);
});

test('settings, colours and accessories follow the description', () => {
    const settings = new Map(Wardrobe.PRESETS.map(p => [p.id, p.group]));
    const plain = Groups.members({ name: 'Plain', count: 30, seed: 5, accessories: 0 });
    assert.ok(plain.every(m => m.recipe.props.length === 0), 'no accessories at 0%');
    const decked = Groups.members({ name: 'Decked', count: 30, seed: 5, accessories: 100 });
    assert.ok(decked.reduce((n, m) => n + m.recipe.props.length, 0) >= plain.reduce((n, m) => n + m.recipe.props.length, 0));
    const palette = ['#112233', '#445566'];
    const coloured = Groups.members({ name: 'Blue', count: 12, seed: 5, palette });
    for (const m of coloured) for (const item of m.recipe.outfit) if (item.color) assert.ok(palette.includes(item.color), m.name + ' ' + item.id + ' is ' + item.color);
    assert.ok(settings.size > 0);
});

test('colouring lists and species shares hold the members, and an empty description is as it was', () => {
    const plain = { name: 'Town', count: 40, seed: 9, species: ['human', 'elf'] };
    const held = Groups.members({ ...plain, skin: ['#8a5a3c'], hairColours: ['#a8432a', '#c8c8c8'], eyeColours: ['#3f6b8c'] });
    for (const { recipe } of held) {
        if ((recipe.species || 'human') === 'human') assert.equal(recipe.skin, '#8a5a3c');
        if (recipe.hair && recipe.hair.style !== 'bald') assert.ok(['#a8432a', '#c8c8c8'].includes(recipe.hair.color), recipe.hair.color);
        assert.equal(recipe.eyes.color, '#3f6b8c');
    }
    // Shares of 1 are the plain pick: nobody changes when the lists are empty and no share is set.
    assert.deepEqual(Groups.members({ ...plain, shares: { elf: 1 } }), Groups.members(plain));
    const count = list => list.filter(m => m.recipe.species === 'elf').length;
    const even = count(Groups.members(plain)), mostly = count(Groups.members({ ...plain, shares: { elf: 9 } }));
    assert.ok(mostly > even && mostly >= 30, `${even} elves of 40 at even shares, ${mostly} at nine to one`);
    const n = Groups.normalize({ species: ['human', 'elf'], shares: { elf: 40, orc: 3, human: 1 }, skin: ['red', '#112233'] });
    assert.deepEqual(n.shares, { elf: 9 });
    assert.deepEqual(n.skin, ['#112233']);
});

test('portraits are laid eight to a face sheet, and a sheet can hold the first portraits alone', () => {
    assert.deepEqual(Groups.faceSheets(8), [{ sheet: 0, from: 0, to: 8 }]);
    assert.deepEqual(Groups.faceSheets(19).map(s => [s.from, s.to]), [[0, 8], [8, 16], [16, 19]]);
    const spec = Groups.normalize({ name: 'Old Town' });
    assert.equal(Groups.faceFile(spec, 0, 1), 'Old_Town_Faces.png');
    assert.equal(Groups.faceFile(spec, 2, 3), 'Old_Town_Faces3.png');
    assert.equal(Sheet.plan('face').length, 8);
    const one = Sheet.plan('face', { only: 1, expressions: ['neutral'] });
    assert.equal(one.length, 1);
    assert.deepEqual([one[0].col, one[0].row, one[0].expression], [0, 0, 'neutral']);
});

test('a member is shown at once as a baked picture of what it wears, with no model built', () => {
    const shown = [];
    global.Character3DBuilder = { shippedPicture: (kind, tag, id) => { shown.push([kind, tag, id].join(' ')); return id === 'robe' || kind === 'species' ? 'data:image/webp;base64,AAAA' : null; } };
    try {
        const html = Groups.standIn(Model.normalize({ gender: 0.2, outfit: [{ id: 'shirt' }, { id: 'robe' }] }));
        assert.match(html, /^<img class="rr-c3d-gen-standin" src="data:image\/webp;base64,AAAA" alt="">$/);
        assert.ok(shown.includes('garment f robe'), 'the garment that says most, for a woman: ' + shown.join(', '));
        shown.length = 0;
        assert.match(Groups.standIn(Model.normalize({ gender: 0.9, species: 'elf', outfit: [] })), /^<img /);
        assert.deepEqual(shown, ['species m elf'], 'nothing worn: the species');
        const started = performance.now(), list = Groups.members(Groups.normalize({ count: 60, seed: 3 }), null);
        for (const m of list) assert.ok(Groups.standIn(m.recipe).startsWith('<img '));
        assert.ok(performance.now() - started < 500, 'sixty in ' + Math.round(performance.now() - started) + ' ms');
    } finally { delete global.Character3DBuilder; }
});

test('a group\'s sheets take the sprite view\'s settings: shadow, camera, frames and face sets', () => {
    const plain = Groups.normalize({});
    assert.deepEqual([plain.walkAngle, plain.colors, plain.shadow, plain.shadowAngle, plain.shadowDistance], [30, 12, false, 30, 100]);
    assert.deepEqual([plain.faceKind, plain.facePreset, plain.faceFrames, plain.faceHold, plain.faceView], ['one', 'everyday', 1, 'talk', 'three']);
    const held = Groups.normalize({ walkAngle: 99, colors: 2, shadow: 1, shadowAngle: 400, shadowDistance: 900, faceKind: 'set', faceFrames: 12, faceHold: 'sweep', faceView: 'front' });
    assert.deepEqual([held.walkAngle, held.colors, held.shadow, held.shadowAngle, held.shadowDistance], [60, 4, true, 180, 200]);
    assert.deepEqual([held.faceKind, held.faceFrames, held.faceHold, held.faceView], ['set', 8, 'sweep', 'front']);
    // What the walking sheets and battlers are drawn with is what the sprite view hands its renderer.
    const look = Groups.spriteLook(held), own = Sheet.settingsOf({ layout: 'mz', frame: 48, shadow: true, shadowAngle: 180, shadowDistance: 200, outline: true, style: 'realistic', look: 'smooth', colors: 4 });
    for (const key of ['shadow', 'shadowAngle', 'shadowDistance', 'outline', 'style', 'look', 'colors', 'background']) assert.equal(look[key], own[key], key);
    // A shared sheet's faces are neutral and can only talk; a member's own set talks or sweeps, and says its frames in its name.
    assert.deepEqual(Sheet.faceAnimOf(Groups.faceAnim(held)).kinds, Array(8).fill('sweep'));
    assert.deepEqual(Sheet.faceAnimOf(Groups.faceAnim(Object.assign({}, held, { faceKind: 'one' }))).kinds, Array(8).fill('talk'));
    assert.equal(Sheet.fileName('face', 'Guard 01', undefined, Groups.faceAnim(held)), 'Guard 01[8F].png');
    assert.equal(Groups.faceFile(Groups.normalize({ name: 'Old Town', faceFrames: 4 }), 1, 2), 'Old_Town_Faces2[4F].png');
    // The battlers' look is their own, and is the walking sprites' until it is said.
    assert.deepEqual(Groups.spriteLook(Groups.normalize({ look: 'pixel', shadow: true }), 'sv'), Groups.spriteLook(Groups.normalize({ look: 'pixel', shadow: true })));
    const apart = Groups.normalize({ look: 'pixel', svLook: 'smooth', svShadow: true, svShadowAngle: 90 });
    assert.deepEqual([Groups.spriteLook(apart).look, Groups.spriteLook(apart, 'sv').look, Groups.spriteLook(apart).shadow, Groups.spriteLook(apart, 'sv').shadow, Groups.spriteLook(apart, 'sv').shadowAngle], ['pixel', 'smooth', false, true, 90]);
    const one = Sheet.plan('face', { only: 1, expressions: ['neutral'], face: Sheet.faceAnimOf({ faceFrames: 3 }) });
    assert.deepEqual(one.map(c => [c.col, c.row]), [[0, 0], [1, 0], [2, 0]]);
});

test('the group page: one scrolling form, ranges as two-handled sliders, and the sprite view\'s own dial', () => {
    const fs = require('fs'), path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/CharacterGroups.js'), 'utf8');
    const sheet = fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/CharacterSpriteSheet.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../css/styles.css'), 'utf8');
    // The species list does not scroll inside the form, and a ticked species' species is a plain tick.
    const list = css.match(/\.rr-c3d-gen-ticks\[data-list="species"\] \{[^}]*\}/)[0];
    assert.doesNotMatch(list, /max-height|overflow/);
    // How common a species is is a slider of its own under the list, not a field squeezed into the tick's row.
    assert.doesNotMatch(source, /rr-c3d-gen-share/);
    assert.match(source, /data-g="mix" data-id=/);
    // No wording of the kind the owner called weird.
    assert.doesNotMatch(source, /a still face|Frames hold|to one of the others|held to these limits/);
    assert.match(css, /\.rr-c3d-gen-form::-webkit-scrollbar-thumb, \.rr-c3d-gen-grid::-webkit-scrollbar-thumb, \.rr-c3d-gen-catalog::-webkit-scrollbar-thumb \{ background: linear-gradient/);
    assert.match(source, /class="rr-c3d-gen-dual"/);
    assert.doesNotMatch(source, /type="number" class="rr-input" data-g="\$\{key\}" data-i=/);
    // One dial, the sprite view's, in both places.
    assert.match(source, /Sheet\.dialRow\(t, state\[k\('shadowAngle'\)\]\)/);
    // Each kind of sprite has its look under its own tick; there is no card of sprite settings left when none is ticked.
    assert.doesNotMatch(source, /card\('Sprite style'/);
    assert.match(source, /lookRows\(''\)/);
    assert.match(source, /lookRows\('sv'\)/);
    assert.match(source, /spriteLook\(state, 'sv'\)/);
    assert.match(source, /RRCharacterSpriteSheet\.watchDial\(panel/);
    assert.match(sheet, /watchDial\(panel, \(\) => state\.shadowAngle/);
    assert.equal(sheet.match(/addEventListener\('pointerdown'/g).length, 1);
    // Every member's walking sheet and battler are rendered with the group's sprite settings.
    assert.match(source, /const common = spriteLook\(state\);/);
    assert.match(source, /elevation: state\.walkAngle \}, common\)/);
});

test('the catalog: chosen outfits, pieces, accessories and cyber limbs dress the group, and none chosen is as before', () => {
    const plain = Groups.normalize({});
    assert.deepEqual([plain.outfits, plain.pieces, plain.gear, plain.gearMost, plain.cyberLimbs, plain.cyberLimbShare, plain.models], [[], [], [], 2, [], 50, false]);
    // Ids the catalog does not have are dropped.
    assert.deepEqual(Groups.normalize({ outfits: ['knight', 'nope', 'knight'], pieces: ['boots', 7], gear: ['cape', 'x'], cyberLimbs: ['armL', 'tail'] }).outfits, ['knight']);
    // With no outfit ticked the pool is every outfit of the group's settings.
    const everyday = Wardrobe.PRESETS.filter(p => p.group === 'Everyday' && p.items.length).map(p => p.id);
    assert.deepEqual(Groups.outfitPool(plain), everyday);
    assert.deepEqual(Groups.outfitPool(Groups.normalize({ outfits: ['knight', 'mage'] })).sort(), ['knight', 'mage']);
    const slot = id => Wardrobe.BY_ID.get(id).slot, knight = new Set(Wardrobe.PRESETS.find(p => p.id === 'knight').items.map(i => i.id));
    const list = Groups.members({ count: 30, outfits: ['knight'], pieces: ['sneakers', 'boots'], gear: ['cape', 'crown'], gearMost: 2, accessories: 100, cyberLimbs: ['armL', 'legR'], cyberLimbShare: 100 });
    const feet = new Set();
    for (const { recipe } of list) {
        // One outfit ticked: everyone wears it, but for the kind a piece was ticked for.
        const shoes = recipe.outfit.filter(i => slot(i.id) === 'feet').map(i => i.id);
        assert.equal(shoes.length, 1);
        assert.ok(['sneakers', 'boots'].includes(shoes[0]));
        feet.add(shoes[0]);
        assert.ok(recipe.outfit.filter(i => slot(i.id) !== 'feet').some(i => knight.has(i.id)));
        // Everyone wears one or two of the ticked accessories and nothing else; everyone has one of the ticked limbs.
        assert.ok(recipe.props.length >= 1 && recipe.props.length <= 2);
        assert.ok(recipe.props.every(p => ['cape', 'crown'].includes(p.id)));
        assert.equal(recipe.bodyArt.limbs.length, 1);
        assert.ok(['armL', 'legR'].includes(recipe.bodyArt.limbs[0].limb));
    }
    assert.equal(feet.size, 2);
    // A dress ticked takes the place of the outfit's top and bottom.
    for (const { recipe } of Groups.members({ count: 8, pieces: ['robe'] })) {
        assert.ok(recipe.outfit.some(i => i.id === 'robe'));
        assert.ok(!recipe.outfit.some(i => ['top', 'bottom'].includes(slot(i.id))));
    }
    assert.equal(Groups.members({ count: 20, gear: ['cape'], accessories: 0 }).filter(m => m.recipe.props.length).length, 0);
    assert.equal(Groups.members({ count: 20, cyberLimbs: ['armL'], cyberLimbShare: 0 }).filter(m => m.recipe.bodyArt.limbs.length).length, 0);
});

test('a group can create 3D models through the builder\'s own export, and the catalog is pictures to click', () => {
    const fs = require('fs'), path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/CharacterGroups.js'), 'utf8');
    const builder = fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8');
    assert.match(builder, /async _writeModel\(name, current\) \{/);
    assert.match(builder, /if \(!await this\._writeModel\(name, current\)\) return;/);
    assert.match(source, /if \(await builder\._writeModel\(modelName\(m\), alive\)\) entry\.model = '3d\/Characters\/' \+ modelName\(m\);/);
    assert.match(source, /!state\.designs && !state\.models && !state\.walk/);
    // The baked pictures the builder's own tiles use: no model is built to show the catalog.
    assert.match(source, /shot\('dress', p\.id\)/);
    assert.match(source, /shot\('garment', g\.id\)/);
    assert.match(source, /shot\('prop', x\.id\)/);
    assert.match(source, /Keep at least one outfit ticked\./);
    // Every kind of garment the wardrobe has is named in the catalog.
    const kinds = new Set(Groups.PIECE_KINDS.map(k => k[0]));
    for (const g of Wardrobe.GARMENTS) assert.ok(kinds.has(g.slot), g.slot);
    // Every outfit, garment and accessory has its baked picture.
    const pack = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/previews', name + '.json'), 'utf8')).pictures;
    const Props = require(path.join(__dirname, '../src/forge/Character3D/CharacterProps.js'));
    for (const p of Wardrobe.PRESETS.filter(p => p.items.length)) assert.ok(pack('dress-f')[p.id], p.id);
    for (const g of Wardrobe.GARMENTS) assert.ok(pack('garment-m')[g.id], g.id);
    for (const x of Props.PROPS) assert.ok(pack('prop-f')[x.id], x.id);
});

test('the group page\'s fields are themed as its dropdowns, and the Group card\'s labels are read whole', () => {
    const fs = require('fs'), path = require('path');
    const css = fs.readFileSync(path.join(__dirname, '../css/styles.css'), 'utf8');
    const source = fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/CharacterGroups.js'), 'utf8');
    assert.match(css, /\.rr-c3d-gen input\.rr-input\[type="text"\], \.rr-c3d-gen input\.rr-input\[type="number"\] \{[^}]*background: var\(--color-bg-deep\); border: 1px solid var\(--color-accent-border-strong/);
    assert.match(css, /\.rr-c3d-gen \.rr-number-stepper-auto \{[^}]*width: 100%;[^}]*background: var\(--color-bg-deep\)/);
    assert.match(css, /\.rr-c3d-row\.rr-c3d-gen-wide \{ grid-template-columns: 140px minmax\(0, 1fr\);/);
    assert.match(css, /\.rr-c3d-gen-wide > \.rr-c3d-label \{ overflow: visible;/);
    assert.equal(source.match(/rr-c3d-row rr-c3d-gen-wide/g).length, 2);
});

test('a group can take the builder\'s Extreme proportions and Anatomical detail', () => {
    const plain = Groups.normalize({ height: [-0.5, 1.5], weight: [0, 4] });
    assert.deepEqual([plain.extreme, plain.anatomy, plain.height, plain.weight], [false, false, [0, 1], [0, 1]]);
    const far = Groups.normalize({ extreme: true, height: [1.2, 1.8], weight: [3, 9], muscle: [-1, 2] });
    assert.deepEqual([far.height, far.weight, far.muscle], [[1.2, Body.MACRO_RANGES.height.extreme[1]], [3, Body.MACRO_RANGES.weight.extreme[1]], [Body.MACRO_RANGES.muscle.extreme[0], 2]]);
    for (const { recipe } of Groups.members(Object.assign({ count: 12 }, far))) {
        assert.ok(recipe.height >= 1.2 - 1e-9 && recipe.height <= 1.8 + 1e-9, String(recipe.height));
        assert.ok(recipe.weight >= 3 - 1e-9, String(recipe.weight));
    }
    assert.ok(Groups.members({ count: 6, anatomy: true }).every(m => m.recipe.anatomy.detail === true));
    assert.ok(Groups.members({ count: 6 }).every(m => m.recipe.anatomy.detail === false));
});

test('every other body and face slider of the builder can be held to a range, and one left alone is as rolled', () => {
    const catalog = Groups.rangeCatalog(), all = catalog.body.concat(catalog.face).flatMap(g => g.items);
    // Every shape slider the builder has is there once, with the build and bust sliders the group had no row for.
    assert.deepEqual(all.filter(i => i.key.startsWith('shapes.')).map(i => i.key.slice(7)).sort(), Body.SLIDERS.map(x => x.key).sort());
    for (const key of ['proportions', 'headSize', 'fatBounce', 'buttBounce', 'cup', 'firmness', 'bustBounce']) assert.ok(all.some(i => i.key === key), key);
    assert.equal(new Set(all.map(i => i.key)).size, all.length);
    // Held to natural limits unless Extreme proportions is on; unknown sliders are dropped.
    const n = Groups.normalize({ ranges: { cup: [0.8, 5], 'shapes.hips': [0.5, 0.9], nope: [0, 1], 'shapes.nope': [0, 1] } });
    assert.deepEqual(n.ranges, { cup: [0.8, 1], 'shapes.hips': [0.5, 0.9] });
    assert.deepEqual(Groups.normalize({ extreme: true, ranges: { cup: [0.8, 5] } }).ranges, { cup: [0.8, 5] });
    const plain = Groups.members({ count: 20 }), held = Groups.members({ count: 20, ranges: { cup: [0.9, 1], 'shapes.hips': [0.5, 0.9], headSize: [1.2, 1.2] } });
    held.forEach(({ recipe }, i) => {
        assert.ok(recipe.cup >= 0.9 - 1e-9 && recipe.cup <= 1 + 1e-9);
        assert.ok(recipe.shapes.hips >= 0.5 - 1e-9 && recipe.shapes.hips <= 0.9 + 1e-9);
        assert.ok(Math.abs(recipe.headSize - 1.2) < 1e-9);
        // What was not held is what the character rolled without any range.
        assert.equal(recipe.shapes.shoulders, plain[i].recipe.shapes.shoulders);
        assert.equal(recipe.firmness, plain[i].recipe.firmness);
        assert.deepEqual(recipe.outfit, plain[i].recipe.outfit);
    });
    assert.ok(new Set(held.map(m => m.recipe.cup)).size > 5);
});

test('a cyber limb\'s catalog tile is a picture of the limb, framed on it', () => {
    const fs = require('fs'), path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/CharacterGroups.js'), 'utf8');
    for (const [id] of require(path.join(dir, 'CharacterBodyArt.js')).LIMBS) {
        const r = Groups.limbRecipe(id, id.endsWith('L'));
        assert.deepEqual(r.bodyArt.limbs.map(l => l.limb), [id]);
        assert.ok(r.outfit.length > 0, 'the figure is dressed');
    }
    // Framed on the limb: the build's own box of what moves with the limb's bones, an arm's holding its hand and not the feet.
    const part = { name: 'Body', positions: new Float32Array([0.5, 1.4, 0, 0.8, 1.42, 0.02, -0.5, 1.4, 0, 0.1, 0.05, 0.1, 0.1, 0.45, 0]), joints: new Uint8Array([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 5, 0, 0, 0, 4, 0, 0, 0]), weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]) };
    const focus = Model.previewBounds({ bones: ['Head', 'LeftArm', 'LeftHand', 'RightArm', 'LeftLeg', 'LeftFoot'].map(name => ({ name })), parts: [part] });
    assert.deepEqual([focus['limb:armL'].min[0], focus['limb:armL'].max[0]].map(x => +x.toFixed(2)), [0.5, 0.8]);
    assert.deepEqual([focus['limb:handL'].min[0], focus['limb:handL'].max[0]].map(x => +x.toFixed(2)), [0.8, 0.8]);
    assert.ok(focus['limb:shinL'].max[1] < 0.5 && focus['limb:legL'].max[1] < 0.5 && focus['limb:armR'].max[0] < 0);
    assert.match(source, /frame: result\.focus && result\.focus\['limb:' \+ id\] \? 'limb:' \+ id : 'body'/);
    // Drawn once and kept: a tile's picture comes from the kept ones, and only the missing are drawn.
    assert.match(source, /url: limbShots\.get\(tag \+ ':' \+ id\) \|\| ''/);
    assert.match(source, /filter\(id => !limbShots\.has\(tag \+ ':' \+ id\)\)/);
    assert.match(source, /if \(tab === 'gear'\) limbPictures\(tag\);/);
});
