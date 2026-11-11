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
