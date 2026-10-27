'use strict';
// Forge › 3D Character Builder: the default and random human faces lean good-looking. The brows sit on the
// orbit's rim, not up the forehead; the Proportions face gives larger, open eyes, a finer nose, a woman's
// fuller lips and softer jaw, a man's firmer jaw and chin; a random face rolls near that norm. Every slider
// keeps its full range, so a homely face is still a choice.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const C3 = path.join(__dirname, '..', 'src', 'forge', 'Character3D');
const Body = require(path.join(C3, 'HumanBody.js'));
const Model = require(path.join(C3, 'CharacterModel.js'));
const Hair = require(path.join(C3, 'CharacterHair.js'));

let pack;
test.before(async () => { pack = await Body.loadPack(); });

const quick = { quality: 'preview', static: true, skinSize: 32, atlasSize: 64, hairBudget: 0 };

/** The brows' ink (the brow picture's alpha over the brow patch) above the eyes, as a share of the eyes-to-crown height. */
function browRise(built) {
    const brows = built.parts.find(p => p.name === 'Brows'), tex = built.textures['brows.png'];
    const eyes = built.parts.find(p => p.name === 'Eyes'), body = built.parts.find(p => p.name === 'Body');
    let eye = 0, crown = -Infinity;
    for (let i = 1; i < eyes.positions.length; i += 3) eye += eyes.positions[i];
    eye /= eyes.positions.length / 3;
    for (let i = 1; i < body.positions.length; i += 3) crown = Math.max(crown, body.positions[i]);
    const P = brows.positions, U = brows.uvs, I = brows.index;
    let sw = 0, sy = 0;
    for (let t = 0; t < I.length; t += 3) {
        const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
        const u = (U[a * 2] + U[b * 2] + U[c * 2]) / 3, v = (U[a * 2 + 1] + U[b * 2 + 1] + U[c * 2 + 1]) / 3;
        const x = Math.min(tex.width - 1, Math.floor(u * tex.width)), y = Math.min(tex.height - 1, Math.floor(v * tex.height));
        const alpha = tex.data[(y * tex.width + x) * 4 + 3] / 255;
        const e1 = [0, 1, 2].map(k => P[b * 3 + k] - P[a * 3 + k]), e2 = [0, 1, 2].map(k => P[c * 3 + k] - P[a * 3 + k]);
        const area = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
        sw += alpha * area; sy += alpha * area * (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
    }
    return (sy / sw - eye) / (crown - eye);
}

test('default brows lie just above the eyes, a man\'s lower than a woman\'s, and the brow sliders still raise them', () => {
    const rise = recipe => browRise(Model.build(pack, Model.normalize(recipe), {}, quick));
    const female = rise({ gender: 0 }), male = rise({ gender: 1 });
    // About a fifth of the way from the eyes to the crown (MakeHuman's own brows sat near a third: mid-forehead).
    assert.ok(female > 0.17 && female < 0.26, 'female brow rise ' + female.toFixed(3));
    assert.ok(male > 0.14 && male < 0.23, 'male brow rise ' + male.toFixed(3));
    assert.ok(male < female, 'a man\'s brows sit lower');
    for (const recipe of [{ gender: 0, age: 70 }, { gender: 1, weight: 2 }, { gender: 1, proportions: 0 }]) {
        const r = rise(recipe);
        assert.ok(r > 0.14 && r < 0.27, JSON.stringify(recipe) + ' brow rise ' + r.toFixed(3));
    }
    // Full range kept: the shape slider and the brows' own height still carry them well up the forehead.
    const raised = rise({ gender: 0, shapes: { browHeight: 2 }, hair: { brows: { height: 0.8 } } });
    assert.ok(raised > female + 0.15, 'raised brows ' + raised.toFixed(3));
});

test('every brow style draws its line on the orbit\'s rim', () => {
    // The picture's box over each eye, in eye radii (CharacterHair BROW_BOX): 0.7 above the eye's center, 2.1 tall.
    for (const style of ['natural', 'thin', 'thick', 'arched', 'straight', 'angry', 'bushy']) {
        const tex = Hair.browTexture({ style, thickness: 0.5, height: 0 }, '#3a2a1a');
        let sw = 0, sy = 0;
        for (let y = 0; y < tex.height; y++) for (let x = 0; x < tex.width; x++) { const a = tex.data[(y * tex.width + x) * 4 + 3]; sw += a; sy += a * y; }
        const above = 0.7 + (1 - sy / sw / tex.height) * 2.1;
        assert.ok(above > 1.1 && above < 1.72, style + ' brow at ' + above.toFixed(2) + ' eye radii');
    }
});

test('the Proportions face: open eyes, lowered brows, a finer nose; fuller lips on a woman, a firmer jaw on a man', () => {
    const w = (recipe, key) => Body.targetWeights(recipe);
    const shape = (weights, key) => (weights[`shape/${key}-incr`] || 0) - (weights[`shape/${key}-decr`] || 0);
    const F = w({ gender: 0 }), M = w({ gender: 1 }), F0 = w({ gender: 0, proportions: 0 }), M0 = w({ gender: 1, proportions: 0 });
    for (const [name, a, b] of [['female', F, F0], ['male', M, M0]]) {
        assert.ok(shape(a, 'browHeight') < shape(b, 'browHeight') - 0.25, name + ' brows lowered');
        assert.ok(shape(a, 'eyeSize') > shape(b, 'eyeSize') + 0.1, name + ' eyes larger');
        assert.ok(shape(a, 'eyeOpen') > -0.15, name + ' lids not hooded');
        assert.ok(shape(a, 'noseWidth') < shape(b, 'noseWidth') && shape(a, 'noseLength') < shape(b, 'noseLength'), name + ' a finer nose');
        assert.ok(shape(a, 'cheekBones') > shape(b, 'cheekBones') + 0.3, name + ' cheekbones');
    }
    assert.ok(shape(F, 'jaw') < 0 && shape(M, 'jaw') > 0.4, 'a woman\'s softer jaw, a man\'s firmer');
    assert.ok(shape(F, 'lowerLip') + shape(F, 'upperLip') > shape(M, 'lowerLip') + shape(M, 'upperLip'), 'a woman\'s fuller lips');
    assert.ok(shape(F, 'eyeSize') > shape(M, 'eyeSize'), 'a woman\'s larger eyes');
    // Proportions 0 is still MakeHuman's plain average face: the norm moved, the range did not.
    assert.equal(shape(F0, 'browHeight'), 0);
});

test('random faces roll near the norm, the homely directions only a little way, the sliders\' range kept', () => {
    const face = ['browHeight', 'eyeSize', 'eyeSpacing', 'noseWidth', 'noseLength', 'mouthWidth', 'jaw', 'upperLip', 'lowerLip', 'eyeBags', 'headAge'];
    const seen = Object.fromEntries(face.map(k => [k, []])), props = [];
    for (let seed = 1; seed <= 400; seed++) {
        const r = Body.randomRecipe(seed);
        props.push(r.proportions);
        for (const k of face) if (r.shapes[k]) seen[k].push(r.shapes[k]);
    }
    assert.ok(Math.min(...props) >= 0.6 && props.reduce((a, b) => a + b) / props.length > 0.75, 'random faces lean refined');
    for (const k of face) {
        const v = seen[k], mean = v.reduce((a, b) => a + Math.abs(b), 0) / v.length;
        assert.ok(v.length > 40, k + ' rolled');
        assert.ok(mean < 0.22, k + ' near the norm: mean |x| ' + mean.toFixed(3));
        assert.ok(Math.max(...v.map(Math.abs)) > 0.2, k + ' still varies');
    }
    assert.ok(Math.max(...seen.browHeight) <= 0.16, 'brows never rolled far up the forehead');
    assert.ok(Math.min(...seen.eyeSize) >= -0.25, 'eyes never rolled small');
    assert.ok(Math.max(...seen.eyeBags) <= 0.19 && Math.max(...seen.headAge) <= 0.25, 'no rolled bags or aged face');
    // A face set by hand still reaches every extreme.
    const r = Body.normalizeRecipe({ shapes: { browHeight: 9, eyeSize: -9, noseWidth: 9 } });
    assert.equal(r.shapes.browHeight, Body.SLIDER_BY_KEY.get('browHeight').extreme);
    assert.equal(r.shapes.eyeSize, -Body.SLIDER_BY_KEY.get('eyeSize').extreme);
    assert.equal(r.shapes.noseWidth, Body.SLIDER_BY_KEY.get('noseWidth').extreme);
});

test('the resting mouth is closed: the lips meet in the middle, without pressing into each other', () => {
    const X = require(path.join(C3, 'CharacterExpressions.js'));
    // The gap between the lips at the mouth's middle (mm; below zero, they overlap in front view).
    const gap = recipe => {
        const result = Model.build(pack, Model.normalize(recipe), {}, quick), M = X.measure(pack, result), S = M.S, F = M.F;
        const lips = [...new Set(pack.body.source)].filter(v => (F.upperLip[v] > 0.5 || F.lowerLip[v] > 0.5) && S[v * 3 + 2] > M.mouth[2] - 0.004);
        let up = Infinity, lo = -Infinity;
        for (const v of lips) {
            if (Math.abs(S[v * 3] - M.mouth[0]) > 0.003) continue;
            const y = S[v * 3 + 1];
            if (F.upperLip[v] > F.lowerLip[v]) up = Math.min(up, y); else lo = Math.max(lo, y);
        }
        return (up - lo) * 1000;
    };
    for (const recipe of [{ gender: 0 }, { gender: 1 }, { gender: 1, ancestry: { people: 'subSaharan', african: 1, asian: 0, caucasian: 0 } }]) {
        globalThis.__lipsAtRest = {};
        const open = gap(recipe);
        delete globalThis.__lipsAtRest;
        const closed = gap(recipe);
        assert.ok(closed <= 0 && closed > -3, JSON.stringify(recipe) + ' lips meet: ' + closed.toFixed(2) + ' mm');
        assert.ok(closed < open - 1, JSON.stringify(recipe) + ' closed from MakeHuman\'s parted ' + open.toFixed(2) + ' mm');
    }
});

test('a man\'s face is not long: eyes to chin about as far as eyes to crown, the jaw broad at its angle', () => {
    const Hair = require(path.join(C3, 'CharacterHair.js'));
    const thirds = recipe => {
        const b = Body.build(pack, recipe), H = Hair._internal.measure(pack, b), P = b.shaped, F = Body.headFields(pack);
        let crown = -Infinity;
        for (let v = 0; v < F.w.length; v++) if (F.w[v] > 0.9) crown = Math.max(crown, P[v * 3 + 1]);
        return (H.eyeY - H.chin[1]) / (crown - H.eyeY);
    };
    const man = thirds({ gender: 1 }), plain = thirds({ gender: 1, proportions: 0 }), woman = thirds({ gender: 0 });
    assert.ok(man < plain - 0.05, 'shorter than MakeHuman\'s man: ' + man.toFixed(3) + ' vs ' + plain.toFixed(3));
    assert.ok(Math.abs(man - woman) < 0.04, 'about as long as a woman\'s face: ' + man.toFixed(3) + ' vs ' + woman.toFixed(3));
});
