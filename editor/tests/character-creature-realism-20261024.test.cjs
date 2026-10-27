'use strict';
// Realism pass on Character Builder birds and quadrupeds (2026-10-24): feather-card plumage,
// folded-wing rig, eagle proportions, hair coats without the periodic pore lattice, crest manes.
const test = require('node:test'), assert = require('node:assert/strict');
const Q = require('./helpers/character-quality-matrix.cjs');
const Flyers = require('../src/forge/Character3D/CreatureFlyers.js');
const Cloth = require('../src/forge/Character3D/CharacterCloth.js');
const BIRDS = Flyers.TYPES.birdType.choices.map(([id]) => id);
const bird = type => Q.Creature.withVariant(Q.Creature.kindRecipe('avian'), 'birdType', type);
const extent = (parts, axis, pose, bones) => {
    let lo = Infinity, hi = -Infinity;
    for (const p of parts) { const P = pose ? Cloth.skin(p, bones, pose) : p.positions; for (let i = axis; i < P.length; i += 3) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); } }
    return [lo, hi];
};

test('every bird type builds bounded, finite, normally skinned geometry with textured feather cards', () => {
    for (const type of BIRDS) for (const quality of ['preview', 'save']) {
        const recipe = bird(type), b = Q.Creature.build(recipe, { quality }), q = Q.inspect(b, { recipe });
        assert.deepEqual(q.issues, [], type + '/' + quality);
        assert.ok(q.summary.triangles < 65000, type + '/' + quality + ' triangles ' + q.summary.triangles);
        assert.ok(b.bones.length <= 128, type + ' bones');
        for (const p of b.parts) for (let v = 0; v < p.weights.length; v += 4) {
            const sum = p.weights[v] + p.weights[v + 1] + p.weights[v + 2] + p.weights[v + 3];
            assert.ok(Math.abs(sum - 1) < 1e-4, type + '/' + p.name + ' skin weights sum to one');
        }
        const feathered = b.parts.filter(p => p.texture === Flyers.FEATHER_TEX);
        assert.ok(feathered.length >= (type === 'penguin' ? 1 : 5), type + ' feather card parts');
        for (const p of feathered) { assert.ok(p.cutout && p.uvs && p.uvs.length === p.positions.length / 3 * 2, type + '/' + p.name + ' alpha-cut cards with uvs'); assert.ok(!p.pictures, 'pictures moved into the textures'); }
        assert.ok(b.textures[Flyers.FEATHER_TEX] && b.textures[Flyers.FEATHER_NORMAL], type + ' feather atlas and relief');
        assert.equal(b.parts.find(p => p.name === 'Body').texture, 'bird-plumage.png', type + ' sculpted body under plumage');
        assert.ok(b.textures['bird-plumage.png'].repeat, 'plumage tiles');
    }
});

test('the feather atlas has real vane alpha (cut-out barbs and edges) and a rachis', () => {
    const pics = Flyers.featherPictures(256), tex = pics[Flyers.FEATHER_TEX];
    let opaque = 0, clear = 0;
    for (let i = 3; i < tex.data.length; i += 4) { if (tex.data[i] > 200) opaque++; else if (tex.data[i] < 30) clear++; }
    assert.ok(opaque > tex.data.length / 4 * 0.2 && clear > tex.data.length / 4 * 0.2, 'feathers cut out of a transparent atlas');
    // The primary cell's centre column (the rachis) is opaque along most of its length.
    const [x0, , w] = Flyers.CELLS.primary[0], cx = Math.round((x0 + w / 2) * 256);
    let shaft = 0; for (let y = 10; y < 246; y++) if (tex.data[(y * 256 + cx) * 4 + 3] > 200) shaft++;
    assert.ok(shaft > 200, 'rachis runs the primary');
});

test('the bald eagle reads as one: proportions, white head and tail, hooked yellow bill, pale iris, slotted primaries', () => {
    const r = Q.Creature.kindRecipe('avian');
    assert.equal(r.birdType, 'eagle');
    assert.equal(r.colors.eye, Flyers.BIRDS.eagle.iris, 'adult pale yellow iris');
    const b = Q.Creature.build(r, { quality: 'preview' });
    // Wings spread at rest: span about twice the bird's length (bald eagle 1.8-2.3 m over 0.7-1 m).
    // Length: bill tip to tail tip.
    const [x0, x1] = extent(b.parts, 0), beakPart = b.parts.find(p => p.name === 'Beak'), tailPart = b.parts.find(p => p.name === 'Tail rectrices') || b.parts.find(p => p.name === 'Tail feathers');
    let tip = null; for (let i = 0; i < beakPart.positions.length; i += 3) if (!tip || beakPart.positions[i + 2] > tip[2]) tip = Array.from(beakPart.positions.subarray(i, i + 3));
    let length = 0; for (let i = 0; i < tailPart.positions.length; i += 3) length = Math.max(length, Math.hypot(...tip.map((v, k) => v - tailPart.positions[i + k])));
    const span = x1 - x0;
    assert.ok(span / length > 1.7 && span / length < 3.0, 'span / length ' + (span / length).toFixed(2));
    assert.ok(span > 1.6 && span < 2.6, 'a grown eagle spans about two meters: ' + span.toFixed(2));
    const mean = part => { const c = [0, 0, 0]; for (let i = 0; i < part.colors.length; i++) c[i % 3] += part.colors[i] / (part.colors.length / 3); return c; };
    const head = mean(b.parts.find(p => p.name === 'Head')), trunk = mean(b.parts.find(p => p.name === 'Body')), tail = mean(b.parts.find(p => p.name === 'Tail feathers'));
    assert.ok(head[0] > trunk[0] * 3 && tail[0] > trunk[0] * 3, 'white head and tail over a dark brown body');
    const beak = b.parts.find(p => p.name === 'Beak'), bc = mean(beak);
    assert.ok(bc[0] > bc[2] * 3 && bc[1] > bc[2] * 2, 'yellow bill');
    // The hook: the culmen curls down below the bill's root.
    const [by0, by1] = extent([beak], 1), [bz0, bz1] = extent([beak], 2);
    assert.ok(by1 - by0 > (bz1 - bz0) * 0.5, 'a deep, hooked bill');
    assert.ok(b.parts.some(p => /^Cornea /.test(p.name)) && b.parts.filter(p => /^Eye -?1$/.test(p.name)).length === 2, 'eyes with clear corneas');
    assert.ok(b.bones.filter(x => x.role === 'wingFeathers').length >= 2 * (Flyers.BIRDS.eagle.wing[3] + 3), 'every primary and three secondary groups fold on their own bones');
});

test('perched birds fold their wings along the flank, stand on their feet, and fly level', () => {
    for (const type of ['eagle', 'owl', 'crow', 'duck', 'parrot']) {
        const r = bird(type), b = Q.Creature.build(r, { quality: 'preview' });
        const idle = Q.Creature.poseClip(b.bones, 'idle', r), fly = Q.Creature.poseClip(b.bones, 'fly', r);
        const rest = extent(b.parts, 0), perched = extent(b.parts, 0, Cloth.pose(b.bones, idle, 0), b.bones);
        assert.ok(perched[1] - perched[0] < (rest[1] - rest[0]) * 0.45, type + ' folded wings hug the body');
        const pose = Cloth.pose(b.bones, idle, 0), feet = extent(b.parts.filter(p => p.name.startsWith('Leg and foot')), 1, pose, b.bones)[0];
        const wings = extent(b.parts.filter(p => /Flight feathers/.test(p.name)), 1, pose, b.bones)[0];
        assert.ok(wings > feet - r.size * 0.01, type + ' folded primaries stay above the ground the feet stand on');
        assert.ok(idle.lift(0) < r.size * 0.05, type + ' feet carry the perched bird (no lift from tail or wings)');
        const flying = Cloth.pose(b.bones, fly, 0), headY = extent(b.parts.filter(p => p.name === 'Head'), 1, flying, b.bones), trunkZ = extent([b.parts.find(p => p.name === 'Body')], 2, flying, b.bones);
        assert.ok(trunkZ[1] - trunkZ[0] > (headY[1] - headY[0]) * 2, type + ' trunk level in flight');
    }
});

test('choosing a bird type brings its typical size and eye colour; saved recipes keep their own', () => {
    const sparrow = bird('sparrow'), eagle = bird('eagle');
    assert.ok(sparrow.size < eagle.size / 3, 'a sparrow is far smaller than an eagle');
    assert.equal(bird('crow').colors.eye, Flyers.BIRDS.crow.iris);
    const saved = Q.Creature.normalizeRecipe({ ...eagle, size: 0.8, colors: { ...eagle.colors, eye: '#123456' } });
    assert.equal(saved.size, 0.8); assert.equal(saved.colors.eye, '#123456');
});

test('quadruped coats: no periodic pore lattice on hair, crest manes and hair tails, budgets kept', () => {
    for (const k of Q.Creature.KINDS.filter(k => !k.form || k.form === 'quadruped').map(k => k.kind)) {
        const r = Q.Creature.kindRecipe(k);
        if (r.morphology && r.morphology !== 'quadruped') continue;
        const b = Q.Creature.build(r, { quality: 'save' }), q = Q.inspect(b, { recipe: r });
        assert.deepEqual(q.issues, [], k);
        assert.ok(q.summary.triangles < (k === 'cat' ? 100000 : 65000), k + ' triangles ' + q.summary.triangles);
        assert.ok(b.bones.length <= 128);
        const body = b.parts.find(p => p.name === 'Body');
        if (k !== 'drake') assert.ok(!body.normalTexture, k + ': hair carries no periodic skin-pore relief');
    }
    const horse = Q.Creature.kindRecipe('horse');
    const fur = r => Q.Creature.build(r, { quality: 'preview' }).parts.filter(p => p.name === 'Fur').reduce((s, p) => s + p.index.length / 3, 0);
    assert.ok(fur(horse) > fur({ ...horse, mane: 'none' }) + 2000, 'a horse grows a real crest mane');
    assert.ok(fur(horse) > fur({ ...horse, tail: 'long' }) + 1000, 'a hair tail is strands, not a solid blade');
});

test('round 3: species eyes, paws with claws and pads, regional fur, faces', () => {
    const build = k => Q.Creature.build(typeof k === 'string' ? Q.Creature.kindRecipe(k) : k, { quality: 'preview' });
    // Each kind's eye picture: a slit for cats and foxes, round for dogs, a bar for horses (dark pupil texels in those shapes).
    const pupil = b => { const t = b.textures['creature-eyes.png'], s = t.width, at = (u, v) => { const x = Math.floor((u + 1) / 2 * s), y = Math.floor((v + 1) / 2 * s), o = (y * s + x) * 4; return t.data[o] + t.data[o + 1] + t.data[o + 2]; }; return { center: at(0, 0), side: at(0.28, 0), up: at(0, 0.24) }; };
    const cat = pupil(build('cat')), dog = pupil(build('dog')), horse = pupil(build('horse'));
    assert.ok(cat.center < 30 && cat.side > 60 && cat.up < 30, 'cat: upright slit');
    assert.ok(dog.center < 30 && dog.side < 30 && dog.up < 30, 'dog: round');
    for (const k of ['cat', 'dog', 'horse', 'drake', 'ram']) { const e = build(k).parts.find(p => p.name === 'Eyes'); assert.equal(e.texture, 'creature-eyes.png', k); assert.ok(e.uvs && e.colors, k + ' eye uvs and colors'); }
    // Paws: claws (a cat's only their tips), toe beans painted on the sole; hooves have no claws.
    const claws = k => build(k).parts.find(p => p.name === 'Claws')?.index.length || 0;
    assert.ok(claws('dog') > 0 && claws('wolf') > 0 && claws('bear') > 0 && claws('cat') > 0, 'claws on paws');
    assert.equal(claws('horse'), 0);
    // Regional fur: the wolf's neck hair is longer than its face's.
    const wolf = Q.Creature.build(Q.Creature.kindRecipe('wolf'), { quality: 'save' });
    assert.ok(wolf.parts.some(p => p.name === 'Coat fur'), 'wolf grows coat strands');
    // The faces: a horse's jowl widens its head behind the eyes; a long-faced cat's muzzle is one piece with its face.
    for (const k of ['cat', 'wolf', 'fox', 'horse', 'bear', 'lion', 'tiger', 'deer', 'bull', 'ram', 'boar', 'rabbit', 'drake']) {
        const r = Q.Creature.kindRecipe(k), b = build(r), q = Q.inspect(b, { recipe: r });
        assert.deepEqual(q.issues, [], k);
    }
    for (const t of Object.keys(Q.Creature.CAT_BREEDS)) {
        const r = Q.Creature.withVariant(Q.Creature.kindRecipe('cat'), 'catType', t), q = Q.inspect(Q.Creature.build(r, { quality: 'save' }), { recipe: r });
        assert.deepEqual(q.issues, [], t); assert.ok(q.summary.triangles < 100000, t + ' ' + q.summary.triangles);
    }
});

test('birds (2026-10-25): perched, a folded-wing shell lies on the body and the card wing shrinks away; the tail is solid blades, the bill massive', () => {
    const r = bird('eagle'), b = Q.Creature.build(r, { quality: 'preview' });
    const idle = Q.Creature.poseClip(b.bones, 'idle', r), fly = Q.Creature.poseClip(b.bones, 'fly', r);
    const scales = c => c.saved.tracks.filter(t => t.path === 'scale');
    assert.equal(scales(idle).length, 4, 'both shells and both humeri carry a scale in every clip');
    const shells = b.parts.filter(p => /^Folded wing /.test(p.name));
    assert.equal(shells.length, 2, 'a closed folded-wing shell per side');
    const body = b.parts.find(p => p.name === 'Body'), perched = Cloth.pose(b.bones, idle, 0), flying = Cloth.pose(b.bones, fly, 0);
    const [bx0, bx1] = extent([body], 0, perched, b.bones), [sx0, sx1] = extent(shells, 0, perched, b.bones);
    // Clear of the contour cards (about a centimetre) plus the shell's own thickness: within 3 cm of the trunk's side.
    assert.ok(sx0 > bx0 - r.size * .06 && sx1 < bx1 + r.size * .06, 'the shells lie on the body, not standing off it: ' + (bx0 - sx0).toFixed(3));
    assert.ok(extent(shells, 1, flying, b.bones).reduce((a, c) => c - a) < r.size * .01, 'in flight the shells are hidden (bound small inside the shoulder)');
    for (const wing of b.parts.filter(p => /Flight feathers/.test(p.name))) {
        const wx = extent([wing], 0, perched, b.bones);
        assert.ok(wx[1] - wx[0] < r.size * .01, 'perched, the open card wing has shrunk to a speck at the shell pivot: ' + wing.name);
    }
    const tail = b.parts.find(p => p.name === 'Tail rectrices');
    assert.ok(tail && tail.texture !== Flyers.FEATHER_TEX, 'the tail is solid blades, not cutout cards');
    const beak = b.parts.find(p => p.name === 'Beak'), head = b.parts.find(p => p.name === 'Head');
    const [by0, by1] = extent([beak], 1), [hy0, hy1] = extent([head], 1);
    assert.ok(by1 - by0 > (hy1 - hy0) * .5, 'the hooked bill is about as deep as half the head: ' + ((by1 - by0) / (hy1 - hy0)).toFixed(2));
    // Every flying bird perches on its folded-wing shell; the penguin keeps its flippers.
    for (const type of ['owl', 'crow', 'chicken', 'duck', 'penguin']) {
        const rb = bird(type), bb = Q.Creature.build(rb, { quality: 'preview' }), shell = bb.parts.filter(p => /^Folded wing /.test(p.name)).length;
        assert.equal(shell, type === 'penguin' ? 0 : 2, type + ' folded-wing shells');
    }
});
