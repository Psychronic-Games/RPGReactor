'use strict';
// Forge › 3D Character Builder, reptiles and amphibians (RRCreatureReptiles): snakes, lizards, geckos and frogs
// build whole, face outward, stand (or lie) on the floor, stay within budget, carry a valid rig and their own
// motions (a snake's travelling wave, a lizard's diagonal sprawling walk, a frog's hop), and export to GLB with
// their pattern, scale tile and both sets of coordinates.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const C3 = path.join(root, 'src', 'forge', 'Character3D');
const Creature = require(path.join(C3, 'CreatureBody.js'));
const Reptiles = require(path.join(C3, 'CreatureReptiles.js'));
const Glb = require(path.join(C3, 'CharacterGlb.js'));
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));

const VARIANT = { snake: 'snakeType', lizard: 'lizardType', gecko: 'geckoType', frog: 'frogType' };
const ALL = Object.entries(VARIANT).flatMap(([kind, key]) => Reptiles.TYPES[key].choices.map(([type]) => [kind, key, type]));
const recipeOf = (kind, key, type) => Creature.withVariant(Creature.kindRecipe(kind), key, type);
const cache = new Map();
const built = (kind, key, type, quality = 'preview') => { const id = kind + type + quality; if (!cache.has(id)) cache.set(id, Creature.build(recipeOf(kind, key, type), { quality })); return cache.get(id); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const at = (p, i) => [p.positions[i * 3], p.positions[i * 3 + 1], p.positions[i * 3 + 2]];

// Posed world positions of a part's vertices for a clip at a frame (bind = translate(head), local rotations, root translation).
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const rot = (q, p) => { const t = cross(q, p).map(v => v * 2); const c = cross(q, t); return [p[0] + t[0] * q[3] + c[0], p[1] + t[1] * q[3] + c[1], p[2] + t[2] * q[3] + c[2]]; };
function posed(b, clip, frame) {
    const R = [], P = [];
    b.bones.forEach((bone, i) => {
        const tr = clip.tracks.find(t => t.bone === i && t.path !== 'translation'), q = tr ? Array.from(tr.values.subarray(frame * 4, frame * 4 + 4)) : [0, 0, 0, 1];
        if (bone.parent < 0) { const tt = clip.tracks.find(t => t.bone === i && t.path === 'translation'); R[i] = q; P[i] = tt ? Array.from(tt.values.subarray(frame * 3, frame * 3 + 3)) : bone.head; }
        else { R[i] = qmul(R[bone.parent], q); const o = rot(R[bone.parent], sub(bone.head, b.bones[bone.parent].head)); P[i] = [P[bone.parent][0] + o[0], P[bone.parent][1] + o[1], P[bone.parent][2] + o[2]]; }
    });
    return part => { const out = new Float32Array(part.positions.length); for (let v = 0; v < part.positions.length / 3; v++) { const p = at(part, v); for (let k = 0; k < 4; k++) { const w = part.weights[v * 4 + k]; if (!w) continue; const j = part.joints[v * 4 + k], q = rot(R[j], sub(p, b.bones[j].head)); for (let a = 0; a < 3; a++) out[v * 3 + a] += (q[a] + P[j][a]) * w; } } return out; };
}

test('the kinds are listed in a group of their own, each with its types, labels translated', () => {
    const mine = Creature.KINDS.filter(k => k.group === 'Reptiles and amphibians').map(k => k.kind);
    assert.deepEqual(mine, ['snake', 'lizard', 'gecko', 'frog']);
    for (const k of Creature.KINDS.filter(k => mine.includes(k.kind))) assert.equal(k.form, 'reptile');
    for (const [kind, key] of Object.entries(VARIANT)) {
        const v = Creature.variantsFor(Creature.kindRecipe(kind));
        assert.ok(v.some(x => x.key === key), kind + ' offers its ' + key);
    }
    // Every label the builder shows for them is in the translation block of every locale.
    const i18n = fs.readFileSync(path.join(root, 'src', 'I18nManager.js'), 'utf8');
    const labels = JSON.parse(i18n.match(/const RR_CHARACTER_REPTILE_LABELS = (\[[^\]]*\]);/)[1]);
    const shown = ['Reptiles and amphibians', ...Reptiles.KINDS.map(k => k.label), ...Object.values(Reptiles.TYPES).flatMap(t => [t.label, ...t.choices.map(c => c[1])])];
    for (const label of shown) assert.ok(labels.includes(label), 'translated: ' + label);
    const block = i18n.slice(i18n.indexOf('const RR_CHARACTER_REPTILE_TRANSLATIONS'), i18n.indexOf('};', i18n.indexOf('const RR_CHARACTER_REPTILE_TRANSLATIONS')));
    const locales = [...block.matchAll(/"([\w-]+)": "([^"]*)"/g)];
    assert.ok(locales.length >= 17, 'locales ' + locales.length);
    for (const [, locale, text] of locales) assert.equal(text.split('|').length, labels.length, locale);
});

test('every type builds whole: a lofted body, eyes, its own motions; on the floor and facing +z', () => {
    for (const [kind, key, type] of ALL) {
        const b = built(kind, key, type), id = kind + '/' + type;
        assert.equal(b.form, 'reptile');
        const body = b.parts.find(p => p.name === 'Body');
        assert.ok(body && body.uvs && body.uvs1, id + ' body with both coordinate sets');
        assert.equal(b.parts.filter(p => /^Eye /.test(p.name)).length, 2, id + ' two eyes');
        if (kind !== 'snake') assert.ok(b.parts.some(p => p.name === 'Legs'), id + ' legs');
        let lo = Infinity, hi = -Infinity;
        for (const p of b.parts) for (let i = 1; i < p.positions.length; i += 3) { lo = Math.min(lo, p.positions[i]); hi = Math.max(hi, p.positions[i]); }
        assert.ok(Math.abs(lo) < 1e-6, id + ' on the floor ' + lo);
        const head = b.bones.find(x => x.name === 'Head'), hips = b.bones.find(x => x.name === 'Hips');
        assert.ok(head.tail[2] > hips.head[2], id + ' faces +z');
        assert.deepEqual(b.clips.map(c => c.name), ['Idle', 'Walk', 'Run', 'Turn', 'Attack'], id + ' clips');
        for (const name of Object.values({ pattern: body.texture, normal: body.normalTexture, material: body.metallicRoughnessTexture })) assert.ok(b.textures[name], id + ' picture ' + name);
        assert.ok(!Object.keys(b.textures).some(n => /^creature-surface/.test(n)), id + ' carries no unused generic surface maps');
    }
});

test('closed skins face outward and their normals agree with their faces', () => {
    for (const [kind, key, type] of ALL) {
        const b = built(kind, key, type);
        for (const p of b.parts.filter(p => p.name !== 'Webbing')) {
            let vol = 0, agree = 0, faces = 0;
            for (let t = 0; t < p.index.length; t += 3) {
                const a = at(p, p.index[t]), c = at(p, p.index[t + 1]), d = at(p, p.index[t + 2]), n = cross(sub(c, a), sub(d, a));
                vol += dot(a, cross(c, d));
                const vn = [0, 1, 2].reduce((s, k) => { const i = p.index[t + k]; return [s[0] + p.normals[i * 3], s[1] + p.normals[i * 3 + 1], s[2] + p.normals[i * 3 + 2]]; }, [0, 0, 0]);
                if (Math.hypot(...n) > 1e-14) { faces++; if (dot(n, vn) > 0) agree++; }
            }
            if (!/Nostril|Eardrum/.test(p.name)) assert.ok(vol > 0, kind + '/' + type + ' ' + p.name + ' winds outward');
            assert.ok(agree / faces > .97, kind + '/' + type + ' ' + p.name + ' normals agree ' + (agree / faces).toFixed(4));
        }
    }
});

test('within budget: the saved model stays in a creature\'s triangle range', () => {
    for (const [kind, key, type] of [['snake', 'snakeType', 'python'], ['snake', 'snakeType', 'cobra'], ['lizard', 'lizardType', 'monitor'], ['gecko', 'geckoType', 'tokay'], ['frog', 'frogType', 'toad']]) {
        const b = built(kind, key, type, 'save'), tris = b.parts.reduce((s, p) => s + p.index.length / 3, 0);
        assert.ok(tris > 8000 && tris < 45000, kind + '/' + type + ' triangles ' + tris);
    }
});

test('the rig is valid: parents first, weights sum to one on real bones, the limbs on the Rig tool\'s quadruped names', () => {
    for (const [kind, key, type] of ALL) {
        const b = built(kind, key, type), id = kind + '/' + type;
        b.bones.forEach((x, i) => assert.ok(x.parent < i, id + ' ' + x.name + ' after its parent'));
        assert.equal(new Set(b.bones.map(x => x.name)).size, b.bones.length, id + ' unique bone names');
        for (const p of b.parts) for (let v = 0; v < p.weights.length / 4; v++) {
            let s = 0; for (let k = 0; k < 4; k++) { s += p.weights[v * 4 + k]; if (p.weights[v * 4 + k] > 0) assert.ok(p.joints[v * 4 + k] < b.bones.length); }
            assert.ok(Math.abs(s - 1) < 1e-4, id + ' ' + p.name + ' weights ' + s);
        }
        if (kind !== 'snake') for (const side of ['Left', 'Right']) for (const end of ['Front', 'Rear']) for (const seg of ['UpperLeg', 'LowerLeg', 'Foot']) assert.ok(b.bones.some(x => x.name === side + end + seg), id + ' ' + side + end + seg);
        if (kind === 'snake') assert.ok(b.bones.filter(x => /^Tail/.test(x.name)).length >= 8 && b.bones.filter(x => /^Spine/.test(x.name)).length >= 6, id + ' a long spine chain');
        const side = Creature.sidecar(b);
        assert.equal(side.creature.habitat, 'land');
        assert.ok(side.animations.some(a => a.clip === 'Walk'));
    }
});

test('motions are the animals\' own and keep the body on the ground', () => {
    // Snake: a wave travels from the head toward the tail; the belly stays down.
    const snake = built('snake', 'snakeType', 'viper'), walk = Creature.poseClip(snake.bones, 'crawl', snake.recipe);
    const body = snake.parts.find(p => p.name === 'Body'), frames = walk.times.length;
    let lowest = Infinity;
    for (let f = 0; f < frames; f += 4) { const P = posed(snake, walk.saved, f)(body); for (let i = 1; i < P.length; i += 3) lowest = Math.min(lowest, P[i]); }
    assert.ok(Math.abs(lowest) < snake.height * .08, 'snake on the ground ' + lowest);
    const yawOf = (clip, name, f) => { const i = snake.bones.findIndex(b => b.name === name), q = clip.tracks.find(t => t.bone === i).values; return 2 * Math.atan2(q[f * 4 + 1], q[f * 4 + 3]); };
    // Local bends down the tail peak later than near the hips: the wave runs backward.
    const peak = name => { let best = 0, at = 0; for (let f = 0; f < frames - 1; f++) { const v = yawOf(walk, name, f); if (v > best) { best = v; at = f; } } return at; };
    assert.notEqual(peak('Tail2'), peak('Tail6'), 'the bend travels along the body');
    // Lizard: the feet are planted through the stance (on the ground) and lifted in the swing; diagonal feet
    // (left fore with right hind) step together; the spine bends side to side.
    const liz = built('lizard', 'lizardType', 'greenLizard'), lw = Creature.poseClip(liz.bones, 'crawl', liz.recipe);
    const track = name => lw.tracks.find(t => t.bone === liz.bones.findIndex(b => b.name === name)).values;
    const footY = (name, f) => { const R = [], P = []; liz.bones.forEach((bone, i) => { const q = Array.from(lw.tracks[i].values.subarray(f * 4, f * 4 + 4)); if (bone.parent < 0) { R[i] = q; P[i] = bone.head; } else { R[i] = qmul(R[bone.parent], q); const o = rot(R[bone.parent], sub(bone.head, liz.bones[bone.parent].head)); P[i] = [P[bone.parent][0] + o[0], P[bone.parent][1] + o[1], P[bone.parent][2] + o[2]]; } }); return P[liz.bones.findIndex(b => b.name === name)][1] - liz.bones.find(b => b.name === name).head[1]; };
    const lifted = name => lw.times.map((_, f) => footY(name, f) > liz.height * .02);
    const LF = lifted('LeftFrontFoot'), RR = lifted('RightRearFoot'), RF = lifted('RightFrontFoot');
    assert.ok(LF.filter(Boolean).length > 4 && LF.filter(x => !x).length > lw.times.length * .5, 'a foot swings and is planted ' + LF.filter(Boolean).length);
    assert.ok(LF.every((x, f) => !x || !RF[f]), 'left and right fore never swing together');
    assert.ok(LF.filter((x, f) => x && RR[f]).length >= LF.filter(Boolean).length * .7, 'left fore with right hind');
    const planted = lw.times.map((_, f) => f).filter(f => !LF[f]);
    for (const f of planted) assert.ok(Math.abs(footY('LeftFrontFoot', f)) < liz.height * .03, 'planted on the ground ' + footY('LeftFrontFoot', f));
    const chestYaw = f => { const q = track('Chest'); return Math.abs(q[f * 4 + 1]); };
    assert.ok(Math.max(...lw.times.map((_, f) => chestYaw(f))) > .05, 'the spine bends');
    // Frog: the walk is a hop that leaves the ground and comes back to the sitting pose.
    const frog = built('frog', 'frogType', 'treeFrog'), hop = Creature.poseClip(frog.bones, 'crawl', frog.recipe);
    const svl = frog.bones[0].reptileFrame.SVL, top = Math.max(...hop.heights);
    assert.ok(top > svl * .15, 'the frog leaves the ground ' + top);
    assert.ok(hop.heights[0] < svl * .02 && hop.heights.at(-1) < svl * .02, 'and lands sitting');
    for (const id of ['idle', 'crawl', 'run', 'turn', 'attack']) for (const b of [snake, liz, frog]) { const c = Creature.poseClip(b.bones, id, b.recipe); assert.ok(c && c.tracks.length === b.bones.length, id); for (const tr of c.tracks) assert.ok(tr.values.every(Number.isFinite), id + ' finite'); }
    assert.deepEqual(Creature.posesFor(frog.recipe).map(p => p.id).sort(), ['attack', 'crawl', 'turn']);
});

test('the saved GLB carries the pattern, the scale tile on its second coordinates, and the clips', () => {
    const b = built('gecko', 'geckoType', 'tokay', 'save');
    const images = Object.fromEntries(Object.keys(b.textures).map(n => [n, Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])]));
    const glb = Glb.toGlb(b, { name: 'Gecko', clips: b.clips, images });
    const { json } = Optimizer.parseGlb(glb);
    const mesh = json.meshes.find(m => m.name === 'Body') || json.meshes[0];
    assert.ok(mesh.primitives[0].attributes.TEXCOORD_1 != null, 'second coordinates');
    const mat = json.materials[mesh.primitives[0].material];
    assert.equal(mat.normalTexture.texCoord, 1);
    assert.ok(mat.pbrMetallicRoughness.baseColorTexture, 'the pattern');
    assert.deepEqual(json.animations.map(a => a.name), ['Idle', 'Walk', 'Run', 'Turn', 'Attack']);
});

test('a preview build is quick enough for a live slider', () => {
    for (const [kind, key, type] of [['snake', 'snakeType', 'python'], ['lizard', 'lizardType', 'greenLizard'], ['frog', 'frogType', 'treeFrog']]) {
        const r = recipeOf(kind, key, type); Creature.build(r, { quality: 'preview' });
        const t0 = process.hrtime.bigint(); Creature.build({ ...r, girth: 1.1 }, { quality: 'preview' });
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        assert.ok(ms < 1500, kind + ' preview ' + ms.toFixed(0) + ' ms');
    }
});

// 2026-10-25b review: frog lids, frog hands, snake length and snout.
test('a frog\'s eyelids are skin over the eyeball, never its dark back showing', () => {
    for (const type of ['treeFrog', 'poisonDart', 'toad']) {
        const b = built('frog', 'frogType', type), lids = b.parts.find(p => p.name === 'Eyelids');
        assert.ok(lids && lids.colors, type + ' has lids');
        let dark = 0; for (let i = 0; i < lids.colors.length; i += 3) if (Math.max(lids.colors[i], lids.colors[i + 1], lids.colors[i + 2]) < 0.04) dark++;
        assert.equal(dark, 0, type + ' lids carry the skin color');
        // The hood covers the top of the eye: lid vertices stand above every eyeball's centre.
        const eyes = b.parts.filter(p => /^Eye /.test(p.name));
        for (const e of eyes) { let top = -1e9, cy = 0; const n = e.positions.length / 3; for (let i = 0; i < n; i++) { top = Math.max(top, e.positions[i * 3 + 1]); cy += e.positions[i * 3 + 1] / n; }
            let lidTop = -1e9; for (let i = 0; i < lids.positions.length; i += 3) lidTop = Math.max(lidTop, lids.positions[i + 1]); assert.ok(lidTop >= top - 1e-4, type + ' lid over the eye'); }
    }
});
test('a frog\'s forearm runs on into its hand: leg skin fills the wrist down to the fingers', () => {
    const b = built('frog', 'frogType', 'treeFrog'), legs = b.parts.find(p => p.name === 'Legs'), SVL = b.bones[0].reptileFrame.SVL;
    for (const side of ['Left', 'Right']) {
        const hand = b.bones.find(x => x.name === side + 'FrontFoot'), w = hand.head;
        // Every height from the fingers up to above the wrist has leg skin near the wrist (no gap).
        for (let k = 0; k <= 8; k++) {
            const y = w[1] - SVL * .02 + SVL * .04 * k / 8; let near = false;
            for (let i = 0; i < legs.positions.length && !near; i += 3) if (Math.abs(legs.positions[i + 1] - y) < SVL * .006 && Math.hypot(legs.positions[i] - w[0], legs.positions[i + 2] - w[2]) < SVL * .05) near = true;
            assert.ok(near, side + ' wrist skin at slice ' + k);
        }
    }
});
test('snakes are long for their build, a python longer and slimmer than a viper, the length slider grows the spine', () => {
    const ratio = type => { const b = built('snake', 'snakeType', type), F = b.bones[0].reptileFrame, body = b.parts.find(p => p.name === 'Body');
        // Thickness: the body's depth at mid-body (the skin bound to the Hips bone), the raised head left out.
        const hips = b.bones.findIndex(x => x.name === 'Hips');
        let lo = 1e9, hi = -1e9; for (let v = 0; v < body.positions.length / 3; v++) if (body.joints[v * 4] === hips && body.weights[v * 4] > .5) { lo = Math.min(lo, body.positions[v * 3 + 1]); hi = Math.max(hi, body.positions[v * 3 + 1]); }
        return { len: F.length, ratio: F.length / (hi - lo), head: F.headLength }; };
    const py = ratio('python'), vi = ratio('viper'), tree = ratio('treeSnake');
    assert.ok(py.ratio > 20, 'python ' + py.ratio.toFixed(1));
    assert.ok(vi.ratio > 12 && vi.ratio < py.ratio, 'viper ' + vi.ratio.toFixed(1));
    assert.ok(tree.ratio > 40, 'tree snake ' + tree.ratio.toFixed(1));
    assert.ok(py.len > vi.len, 'python longer than viper');
    const longer = Creature.build({ ...recipeOf('snake', 'snakeType', 'python'), bodyLength: 1.5 }, { quality: 'preview' }).bones[0].reptileFrame;
    assert.ok(Math.abs(longer.length / py.len - 1.5) < 0.02, 'length slider scales the spine');
    assert.ok(Math.abs(longer.headLength - py.head) < 1e-6, 'and leaves the head its size');
    // At rest it lies in S-bends, compact: across its widest it spans well under its length.
    const body = built('snake', 'snakeType', 'python').parts.find(p => p.name === 'Body');
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < body.positions.length; i += 3) { x0 = Math.min(x0, body.positions[i]); x1 = Math.max(x1, body.positions[i]); z0 = Math.min(z0, body.positions[i + 2]); z1 = Math.max(z1, body.positions[i + 2]); }
    assert.ok(Math.max(x1 - x0, z1 - z0) < py.len * .6, 'resting S is compact');
});
