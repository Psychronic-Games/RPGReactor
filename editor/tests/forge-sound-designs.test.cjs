'use strict';
// Sound Effect Generator designs (Save Design / Open): the record, a round trip, the seeded noise, and recipes from
// other authors cleaned rather than trusted.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/forge/SoundEffectGenerator/SoundEffectGenerator.js'), 'utf8');
const escapeHtml = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// ForgeDesigns.js reads these as globals.
globalThis.rrEscapeHtml = escapeHtml;
globalThis.RRDialog = { confirm: async () => true, prompt: async () => null, alert() {} };
const RRForgeDesigns = require('../src/forge/ForgeDesigns.js');

function load() {
    const globals = {
        window: { addEventListener() {}, removeEventListener() {} },
        document: { addEventListener() {}, removeEventListener() {} },
        require, RRForgeDesigns, RRDialog: globalThis.RRDialog, rrEscapeHtml: escapeHtml, Buffer,
        console: { ...console, error() {}, warn() {} }
    };
    const names = Object.keys(globals);
    return new Function(...names, `${source}\n;return { SoundEffectGenerator, SfxSynth, sfxRandom, sfxCleanRecipe, sfxDrawPicture, PARAM_SCHEMA, ARCHETYPES };`)(...names.map(n => globals[n]));
}
const M = load();

function tempProject(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-sfx-designs-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return { path: dir, name: 'p' };
}

/** A generator mounted on a project with its page stubbed: renders are counted, not drawn. */
function mounted(project) {
    const gen = new M.SoundEffectGenerator();
    gen.renders = 0;
    gen._render = () => { gen.renders++; };
    gen._designPicture = async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    gen.renderInto({ innerHTML: '', querySelector: () => null }, { getCurrentProject: () => project });
    return gen;
}

const designsDir = project => path.join(project.path, 'forge', 'sound_effect_generator', 'designs');
const stateOf = gen => ({ archetype: gen.activeArchetypeId, params: { ...gen.params }, seed: gen.seed, mode: gen.mode, pattern: [...gen.pattern].sort(), bpm: gen.bpm });

test('Save Design writes { builder: sound, version: 1, recipe } with every param, the seed and the pattern, and a picture', async t => {
    const project = tempProject(t), gen = mounted(project);
    gen.name = 'Coin';
    assert.equal(await gen.saveDesign(), true);
    const record = JSON.parse(fs.readFileSync(path.join(designsDir(project), 'Coin.json'), 'utf8'));
    assert.equal(record.builder, 'sound');
    assert.equal(record.version, 1);
    assert.ok(record.recipe && typeof record.recipe === 'object' && !Array.isArray(record.recipe));
    assert.deepEqual(Object.keys(record.recipe).sort(), ['archetype', 'bpm', 'mode', 'params', 'pattern', 'seed']);
    assert.deepEqual(Object.keys(record.recipe.params).sort(), M.PARAM_SCHEMA.map(p => p.key).sort());
    assert.ok(Number.isInteger(record.recipe.seed) && record.recipe.seed >= 0 && record.recipe.seed < 2 ** 32);
    assert.ok(fs.existsSync(path.join(designsDir(project), 'Coin.png')));
    assert.deepEqual(gen._openedDesign, { group: '', name: 'Coin' });
});

test('a design opened into a fresh tool restores the same sound, name and group', async t => {
    const project = tempProject(t), gen = mounted(project);
    gen._seedFromArchetype('laser');
    gen._randomizeFromArchetype();
    gen.mode = 'pattern';
    gen.pattern = new Set(['3,4', '0,0', '11,15']);
    gen.bpm = 150;
    gen.name = 'Zap';
    gen.designGroup = 'Weapons';
    assert.equal(await gen.saveDesign(), true);
    assert.ok(fs.existsSync(path.join(designsDir(project), 'Weapons', 'Zap.json')));
    const before = stateOf(gen);

    // Saved, then the same recipe opens: state -> recipe -> state is the identity.
    assert.deepEqual(M.sfxCleanRecipe(gen.designRecipe()), gen.designRecipe());

    const other = mounted(project);
    other._seedFromArchetype('custom');
    other.seed = 99;
    const renders = other.renders;
    assert.equal(other.openDesign('Weapons', 'Zap'), true);
    assert.deepEqual(stateOf(other), before);
    assert.equal(other.name, 'Zap');
    assert.equal(other.designGroup, 'Weapons');
    assert.deepEqual(other._openedDesign, { group: 'Weapons', name: 'Zap' });
    assert.equal(other.renders, renders, 'no page of this tool showing, so nothing drawn into another tool');
    // The opened sound is the project's current one: the next mount reads it back.
    const config = JSON.parse(fs.readFileSync(path.join(project.path, 'forge', 'sound_effect_generator', 'config.json'), 'utf8'));
    assert.equal(config.seed, before.seed);
    assert.equal(config.activeArchetypeId, 'laser');
});

test('the same seed draws the same noise, pluck and reverb; another seed draws different ones', () => {
    const synth = new M.SfxSynth();
    const node = () => {
        const param = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
        return { frequency: { ...param }, gain: { ...param }, Q: { ...param }, playbackRate: { ...param }, connect: target => target, start() {}, stop() {} };
    };
    const capture = (params, seed) => {
        const buffers = [];
        const ctx = {
            sampleRate: 8000,
            createBuffer(channels, length) { const data = Array.from({ length: channels }, () => new Float32Array(length)); buffers.push(data); return { getChannelData: c => data[c] }; },
            createBufferSource: node, createOscillator: node, createGain: node, createBiquadFilter: node, createWaveShaper: node, createConvolver: node
        };
        synth._buildGraph(ctx, params, 0, node(), synth._rand(seed));
        return buffers.flat().map(a => Array.from(a));
    };
    for (const id of ['explosion', 'inst-piano', 'sword-hit']) {
        const params = { ...M.sfxCleanRecipe({ archetype: id }).params, reverb: 0.3, noiseMix: 0.2 };
        if (id === 'inst-piano') params.waveform = 'karplus';
        const a = capture(params, 1234), b = capture(params, 1234), c = capture(params, 1235);
        assert.ok(a.length >= 2, `${id}: a noise or pluck buffer and a reverb impulse`);
        assert.deepEqual(a, b, `${id}: same seed, same samples`);
        assert.notDeepEqual(a, c, `${id}: another seed, other samples`);
    }
    const r = M.sfxRandom(7);
    for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

test('Randomize rolls a new seed; Reset and an archetype keep it', () => {
    const gen = new M.SoundEffectGenerator();
    gen._render = () => {}; gen._saveConfig = () => {};
    gen.seed = 42;
    gen._seedFromArchetype('pickup');
    assert.equal(gen.seed, 42);
    let rolled = false;
    for (let i = 0; i < 5 && !rolled; i++) { gen._randomizeFromArchetype(); rolled = gen.seed !== 42; }
    assert.ok(rolled);
});

test('a hostile or odd recipe is cleaned: unknown fields dropped, numbers clamped, choices held to the tool\'s', () => {
    const hostile = JSON.parse(`{
        "archetype": "../../etc", "code": "require('child_process')", "seed": -12345.7, "mode": "eval", "bpm": 1e9,
        "params": { "__proto__": { "polluted": 1 }, "volume": 1e9, "baseFreq": -5, "waveform": "<img onerror=x>", "attack": "0.5",
            "release": null, "lowpassQ": 1e-9, "extra": 3, "ksDampening": 2 },
        "pattern": ["0,0", "99,1", "a,b", {}, "0,0", "11,15", "1,16", "05,3", 7] }`);
    const r = M.sfxCleanRecipe(hostile);
    assert.deepEqual(Object.keys(r).sort(), ['archetype', 'bpm', 'mode', 'params', 'pattern', 'seed']);
    assert.equal(r.archetype, 'custom');
    assert.equal(r.mode, 'sound');
    assert.equal(r.bpm, 300);
    assert.equal(r.seed, 12345);
    assert.deepEqual(Object.keys(r.params).sort(), M.PARAM_SCHEMA.map(p => p.key).sort());
    assert.equal(r.params.volume, 1);
    assert.equal(r.params.baseFreq, 20);
    assert.equal(r.params.waveform, 'square', 'the custom archetype\'s own waveform');
    assert.equal(r.params.attack, M.ARCHETYPES[0].params.attack, 'a string is not a number');
    assert.equal(r.params.release, M.ARCHETYPES[0].params.release);
    assert.equal(r.params.lowpassQ, 0.1);
    assert.equal(r.params.ksDampening, 0.9999);
    assert.equal({}.polluted, undefined);
    assert.deepEqual(r.pattern, ['0,0', '5,3', '11,15']);
    for (const schema of M.PARAM_SCHEMA) if (schema.type === 'slider') {
        assert.ok(r.params[schema.key] >= schema.min && r.params[schema.key] <= schema.max, schema.key);
    }
    for (const odd of [null, undefined, [], 'text', 5, { params: [1, 2] }, { params: 'x', pattern: 'x', seed: Infinity, bpm: NaN }]) {
        const clean = M.sfxCleanRecipe(odd);
        assert.equal(clean.archetype, 'custom');
        assert.equal(clean.seed, 1);
        assert.equal(clean.bpm, 120);
        assert.deepEqual(clean.pattern, []);
    }
    assert.equal(M.SoundEffectGenerator.cleanRecipe(hostile).params.volume, 1);
});

test('opening refuses paths out of the designs folder and other builders\' designs, and cleans what it opens', async t => {
    const project = tempProject(t), gen = mounted(project);
    fs.mkdirSync(designsDir(project), { recursive: true });
    fs.writeFileSync(path.join(designsDir(project), 'Prop.json'), JSON.stringify({ builder: 'prop3d', version: 1, recipe: { type: 'flag' } }));
    fs.writeFileSync(path.join(designsDir(project), 'Odd.json'), JSON.stringify({ builder: 'sound', version: 1, recipe: { archetype: 'hit', params: { volume: 50, waveform: 'noise' }, seed: 9, bpm: 5 } }));
    fs.writeFileSync(path.join(designsDir(project), 'Broken.json'), '{ not json');
    const before = stateOf(gen);
    assert.equal(gen.openDesign('', '../config'), false);
    assert.equal(gen.openDesign('..', 'config'), false);
    assert.equal(gen.openDesign('', 'Prop'), false);
    assert.equal(gen.openDesign('', 'Broken'), false);
    assert.equal(gen.openDesign('', 'Missing'), false);
    assert.equal(gen.openDesign('', ''), false);
    assert.deepEqual(stateOf(gen), before, 'a refused design changes nothing');
    assert.equal(gen.openDesign('', 'Odd'), true);
    assert.equal(gen.activeArchetypeId, 'hit');
    assert.equal(gen.params.volume, 1);
    assert.equal(gen.params.waveform, 'noise');
    assert.equal(gen.params.baseFreq, M.ARCHETYPES.find(a => a.id === 'hit').params.baseFreq);
    assert.equal(gen.seed, 9);
    assert.equal(gen.bpm, 40);
});

test('openDesign right after the tool is mounted draws the opened sound on its page', async t => {
    const project = tempProject(t), gen = mounted(project);
    gen._seedFromArchetype('jump');
    gen.name = 'Hop';
    await gen.saveDesign();
    const fresh = mounted(project);
    fresh.root = { querySelector: s => (s === '.rr-sfx-params' ? {} : null) };
    const renders = fresh.renders;
    assert.equal(fresh.openDesign('', 'Hop'), true);
    assert.equal(fresh.renders, renders + 1);
    assert.equal(fresh.activeArchetypeId, 'jump');
});

test('the waveform picture stays inside its square, with nothing to draw or a clipped sound', () => {
    const calls = [];
    const g = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...args) => { calls.push(args); }), set: (o, k, v) => { o[k] = v; return true; } });
    const loud = new Float32Array(5000).map((_, i) => Math.sin(i / 7) * 3);
    for (const data of [new Float32Array(0), new Float32Array(300), loud, new Float32Array(100).fill(0.001)]) {
        calls.length = 0;
        M.sfxDrawPicture(g, data, 256);
        for (const args of calls) for (const v of args) if (typeof v === 'number') assert.ok(Number.isFinite(v) && v >= 0 && v <= 256, String(v));
    }
});

test('the toolbar has Open, Group and Save Design, and play and bake use the sound\'s seed', () => {
    for (const cls of ['rr-sfx-open', 'rr-sfx-design-group', 'rr-sfx-keep', 'rr-c3d-gallery']) assert.match(source, new RegExp(cls));
    assert.match(source, /this\.synth\.play\(this\.params, this\.seed\)/);
    assert.match(source, /renderOffline\(this\.params, this\.seed\)/);
    assert.match(source, /renderPatternOffline\(this\.pattern, this\.params, this\.bpm, this\.seed\)/);
    assert.doesNotMatch(source.replace(/function sfxNewSeed[^\n]*\n/, '').replace(/rand = Math\.random/g, '').replace(/: Math\.random; \}/, ''),
        /Math\.random\(\) \* 2 - 1/, 'no unseeded noise left');
});
