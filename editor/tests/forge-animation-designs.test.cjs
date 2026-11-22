// Animation Generator designs (Save Design / Open): the record written, a recipe round trip, and recipes from elsewhere cleaned.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.join(__dirname, '..');
const RRForgeDesigns = require('../src/forge/ForgeDesigns.js');

// The tool's scripts in the order index.html loads them: helpers, registry, animations, the tool.
function loadAnimationGenerator() {
    const index = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    const files = [...index.matchAll(/src="(src\/forge\/AnimationGenerator\/[^"]+\.js)"/g)].map(m => m[1]);
    assert.ok(files.at(-1).endsWith('AnimationGenerator.js'), 'the tool loads after its animations');
    const source = files.map(f => fs.readFileSync(path.join(editorRoot, f), 'utf8')).join('\n;\n');
    const globals = {
        window: { addEventListener() {}, removeEventListener() {} },
        document: { createElement: () => ({ getContext: () => null }), addEventListener() {}, removeEventListener() {} },
        Image: function() {},
        require,
        RRForgeDesigns,
        RRDialog: { alert() {}, confirm: async () => true, prompt: async () => 'Prompted' },
        requestAnimationFrame() {},
        cancelAnimationFrame() {}
    };
    const names = Object.keys(globals);
    return new Function(...names, `${source}\n;return { AnimationGenerator, RR_ANIMATION_REGISTRY };`)(...names.map(n => globals[n]));
}

const { AnimationGenerator, RR_ANIMATION_REGISTRY } = loadAnimationGenerator();
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

const made = [];
test.after(() => { for (const dir of made) fs.rmSync(dir, { recursive: true, force: true }); });

function tempProject(name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rr-ag-designs-${name}-`));
    made.push(dir);
    return { path: dir, name };
}

/** A tool mounted on a project with no page: drawing stubbed, the picture a fixed PNG. */
function mounted(project) {
    const gen = new AnimationGenerator();
    gen._render = () => {};
    gen._startPlayback = () => {};
    gen._designPicture = () => PNG;
    const status = { textContent: '', dataset: {} };
    const root = { innerHTML: '', querySelector: sel => (sel === '.rr-c3d-status' ? status : null) };
    gen.renderInto(root, { getCurrentProject: () => project });
    return { gen, status };
}

const textured = RR_ANIMATION_REGISTRY.find(a => a.params.some(p => p.type === 'texture'));
const plain = RR_ANIMATION_REGISTRY.find(a => a !== textured && a.params.some(p => p.type === 'color') && a.params.some(p => p.type === 'slider'));

/** A stack with two layers, keyframes, a texture, a blend and a hidden layer. */
function buildState(gen) {
    gen.frameWidth = 128;
    gen.frameHeight = 96;
    gen.frameCount = 24;
    gen.interpolation = 'nearest';
    gen.outputName = 'Fire Ball';
    const a = gen._makeLayer(textured.categoryId, textured.id);
    a.params.texture = 'smoke.png';
    const slider = textured.params.find(p => p.type === 'slider');
    a.params[slider.key] = slider.max;
    a.keyframes[0]._layerOpacity = 0.4;
    a.keyframes.push({ ...a.keyframes[0], [slider.key]: slider.min, _layerOpacity: 0.9 });
    a.activeKeyframe = 1;
    gen._relinkLayerParams(a);
    a.blend = 'screen';
    a.opacity = 0.9;
    const b = gen._makeLayer(plain.categoryId, plain.id);
    const color = plain.params.find(p => p.type === 'color');
    b.params[color.key] = '#12AbEf';
    b.visible = false;
    gen.layers = [a, b];
    gen.activeLayerId = a.id;
    gen.previewMode = 'composite';
    gen.previewSingle = gen._makeSingleSession(plain.categoryId, plain.id);
}

/** The tool's state without its runtime-only layer ids. */
function snapshot(gen) {
    return JSON.parse(JSON.stringify({
        frameWidth: gen.frameWidth, frameHeight: gen.frameHeight, frameCount: gen.frameCount,
        interpolation: gen.interpolation, outputName: gen.outputName,
        previewMode: gen.previewMode, previewSingle: gen.previewSingle,
        active: gen.layers.findIndex(l => l.id === gen.activeLayerId),
        layers: gen.layers.map(l => ({
            categoryId: l.categoryId, animationId: l.animationId, blend: l.blend, opacity: l.opacity, visible: l.visible,
            activeKeyframe: l.activeKeyframe, keyframes: l.keyframes, paramsIsActiveKeyframe: l.params === l.keyframes[l.activeKeyframe]
        }))
    }));
}

test('Save Design writes { builder: animation, version: 1, recipe } and its picture, with no paths', async () => {
    const project = tempProject('save');
    const { gen, status } = mounted(project);
    buildState(gen);
    gen.designGroup = 'Spells';
    assert.equal(await gen.saveDesign(), true);
    const dir = path.join(project.path, 'forge', 'animation_generator', 'designs', 'Spells');
    const text = fs.readFileSync(path.join(dir, 'Fire Ball.json'), 'utf8');
    const record = JSON.parse(text);
    assert.deepEqual(Object.keys(record).sort(), ['builder', 'recipe', 'version']);
    assert.equal(record.builder, 'animation');
    assert.equal(record.version, 1);
    assert.ok(record.recipe && typeof record.recipe === 'object' && !Array.isArray(record.recipe));
    assert.deepEqual(fs.readFileSync(path.join(dir, 'Fire Ball.png')), PNG);
    assert.equal(text.includes(project.path), false, 'no absolute path in the record');
    const r = record.recipe;
    assert.equal(r.frameWidth, 128);
    assert.equal(r.frameHeight, 96);
    assert.equal(r.frameCount, 24);
    assert.equal(r.outputName, 'Fire Ball');
    assert.equal(r.layers.length, 2);
    assert.equal(r.layers[0].blend, 'screen');
    assert.equal(r.layers[0].keyframes.length, 2);
    assert.equal(r.layers[0].keyframes[0].opacity, 0.4);
    assert.equal(r.layers[0].keyframes[1].params.texture, 'smoke.png');
    assert.equal(r.layers[1].visible, false);
    assert.deepEqual(r.textures, ['smoke.png']);
    assert.deepEqual(gen._openedDesign, { group: 'Spells', name: 'Fire Ball' });
    assert.match(status.textContent, /Fire Ball/);
});

test('A recipe opens back into the same state, and gives the same recipe again', () => {
    const { gen } = mounted(tempProject('trip-a'));
    buildState(gen);
    const before = snapshot(gen);
    const recipe = JSON.parse(JSON.stringify(gen._designRecipe()));
    const { gen: other } = mounted(tempProject('trip-b'));
    other._applyRecipe(recipe);
    assert.deepEqual(snapshot(other), before);
    assert.deepEqual(other._designRecipe(), recipe);
});

test('openDesign opens a saved design, also one asked for before the tool is on screen', async () => {
    const project = tempProject('open');
    const { gen } = mounted(project);
    buildState(gen);
    const before = snapshot(gen);
    assert.equal(await gen.saveDesign(), true);

    const { gen: reader, status } = mounted(project);
    assert.equal(reader.openDesign('', 'Fire Ball'), true);
    assert.deepEqual(snapshot(reader), before);
    assert.deepEqual(reader._openedDesign, { group: '', name: 'Fire Ball' });
    assert.match(status.textContent, /smoke\.png/, 'the missing texture is named');
    const config = JSON.parse(fs.readFileSync(path.join(project.path, 'forge', 'animation_generator', 'config.json'), 'utf8'));
    assert.equal(config.frameCount, 24, 'the opened design is the tool\'s config now');

    // Not on screen yet (the Workshop opens it right after adding an item): opened when the tool mounts.
    const fresh = new AnimationGenerator();
    fresh._render = () => {};
    fresh._startPlayback = () => {};
    assert.equal(fresh.openDesign('', 'Fire Ball'), true);
    assert.equal(fresh.layers.length, 0, 'nothing changes before the tool is on screen');
    fresh.renderInto({ innerHTML: '', querySelector: () => null }, { getCurrentProject: () => project });
    assert.deepEqual(snapshot(fresh), before);

    assert.equal(reader.openDesign('..', 'Fire Ball'), false, 'no group outside the designs folder');
    assert.equal(reader.openDesign('', '../config'), false);
    assert.equal(reader.openDesign('', ''), false);
});

test('A hostile or odd recipe is cleaned, not obeyed', () => {
    const slider = textured.params.find(p => p.type === 'slider');
    const color = textured.params.find(p => p.type === 'color');
    for (const odd of [null, undefined, 'recipe', 42, [], [{ layers: [] }], { layers: 'nope', frameWidth: {} }]) {
        const r = AnimationGenerator.cleanRecipe(odd);
        assert.deepEqual(r.layers, []);
        assert.equal(r.frameWidth, 192);
        assert.equal(r.previewMode, 'single');
    }
    const hostile = {
        frameWidth: 1e9, frameHeight: -5, frameCount: '1000000', interpolation: 'eval', outputName: '../../evil\u0000name.png',
        previewMode: 'composite', activeLayer: 1e12,
        previewSingle: { categoryId: 'nope', animationId: 'nope', params: {} },
        layers: [
            { categoryId: 'geometric', animationId: 'does-not-exist', params: {} },
            'a string', null, [1, 2],
            {
                categoryId: textured.categoryId, animationId: textured.id, blend: 'difference; alert(1)', opacity: '7', visible: 0,
                activeKeyframe: 99,
                keyframes: [
                    { params: { [slider.key]: 1e12, [color.key]: 'javascript:alert(1)', texture: '../../etc/passwd', made_up: 5, __proto__: { polluted: true } }, opacity: 'abc' },
                    { params: { [slider.key]: 'abc', texture: 'C:\\x.png' }, opacity: -3 },
                    'not a keyframe'
                ]
            }
        ]
    };
    const r = AnimationGenerator.cleanRecipe(hostile);
    assert.equal(r.frameWidth, 512);
    assert.equal(r.frameHeight, 16);
    assert.equal(r.frameCount, 100);
    assert.equal(r.interpolation, 'linear');
    assert.equal(r.outputName, '....evilname');
    assert.equal(r.previewSingle, null);
    assert.equal(r.layers.length, 1, 'only the layer of a known animation is kept');
    const layer = r.layers[0];
    assert.equal(r.activeLayer, 0);
    assert.equal(layer.blend, textured.defaultBlend || 'source-over');
    assert.equal(layer.opacity, 1);
    assert.equal(layer.visible, true);
    assert.equal(layer.keyframes.length, 3);
    assert.equal(layer.activeKeyframe, 2);
    const [k0, k1, k2] = layer.keyframes;
    assert.equal(k0.params[slider.key], slider.max);
    assert.equal(k0.params[color.key], color.default);
    assert.equal(k0.params.texture, '');
    assert.equal('made_up' in k0.params, false);
    assert.equal('opacity' in k0, false, 'a non-number opacity falls back to the layer\'s');
    assert.equal(k1.params[slider.key], slider.default);
    assert.equal(k1.params.texture, '');
    assert.equal(k1.opacity, 0);
    assert.deepEqual(Object.keys(k2.params).sort(), textured.params.map(p => p.key).sort(), 'the edited keyframe gets every param');
    assert.deepEqual(r.textures, []);
    assert.equal({}.polluted, undefined);
    assert.doesNotThrow(() => JSON.stringify(r));

    const many = AnimationGenerator.cleanRecipe({
        layers: Array.from({ length: 500 }, () => ({ categoryId: textured.categoryId, animationId: textured.id, keyframes: Array.from({ length: 500 }, () => ({})) }))
    });
    assert.equal(many.layers.length, AnimationGenerator.DESIGN_LIMITS.maxLayers);
    assert.equal(many.layers[0].keyframes.length, AnimationGenerator.DESIGN_LIMITS.maxKeyframes);

    const { gen } = mounted(tempProject('hostile'));
    assert.doesNotThrow(() => gen._applyRecipe(hostile));
    assert.equal(gen.layers.length, 1);
    assert.equal(gen.frameCount, 100);
    assert.ok(gen.previewSingle, 'a usable preview is put back');
    assert.doesNotThrow(() => gen._applyRecipe([1, 2, 3]));
    assert.equal(gen.layers.length, 0);
});

test('A file that is not an animation design does not open', () => {
    const project = tempProject('notours');
    const { gen, status } = mounted(project);
    const dir = path.join(project.path, 'forge', 'animation_generator', 'designs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Array.json'), '[1,2,3]');
    fs.writeFileSync(path.join(dir, 'Prop.json'), JSON.stringify({ builder: 'prop3d', version: 1, recipe: {} }));
    const before = snapshot(gen);
    assert.equal(gen.openDesign('', 'Array'), false);
    assert.equal(gen.openDesign('', 'Prop'), false);
    assert.equal(gen.openDesign('', 'Missing'), false);
    assert.deepEqual(snapshot(gen), before);
    assert.match(status.textContent, /could not be opened/);
});
