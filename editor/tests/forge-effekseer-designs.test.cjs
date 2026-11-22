'use strict';
// Save Design / Open in the Effekseer Animation Generator: the record kept under
// <project>/forge/effekseer_generator/designs/, opened back to the same state (the same
// .efkefc bytes), and a recipe from another user (Workshop) cleaned, never trusted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const efkDir = path.join(repoRoot, 'src', 'forge', 'EffekseerGenerator');
const RR_EfkFormat = require(path.join(efkDir, 'format', 'efk_format.js'));
const RR_EfkBuilder = require(path.join(efkDir, 'format', 'efk_builder.js'));
const RR_EfkModel = require(path.join(efkDir, 'format', 'efk_model.js'));
const RR_EfkSymbols = require(path.join(efkDir, 'format', 'efk_symbols.js'));
const RR_EfkLayers = require(path.join(efkDir, 'layers.js'));

global.rrEscapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const prompts = [];
global.RRDialog = { confirm: async () => true, prompt: async () => prompts.shift() || '' };
const RRForgeDesigns = require('../src/forge/ForgeDesigns.js');

function loadRecipes() {
    const g = {};
    const recipesDir = path.join(efkDir, 'recipes');
    new Function('RR_EfkFormat', 'RR_EfkBuilder',
        `${fs.readFileSync(path.join(recipesDir, 'registry.js'), 'utf8')}\n; this.RR_EFK_RECIPE_REGISTRY = RR_EFK_RECIPE_REGISTRY; this.RR_EfkRecipeUtil = RR_EfkRecipeUtil; this.buildEfkRecipeCategories = buildEfkRecipeCategories;`
    ).call(g, RR_EfkFormat, RR_EfkBuilder);
    for (const f of fs.readdirSync(recipesDir).filter(f => f !== 'registry.js' && f.endsWith('.js'))) {
        new Function('RR_EFK_RECIPE_REGISTRY', 'RR_EfkRecipeUtil', 'RR_EfkFormat', 'RR_EfkBuilder', 'RR_EfkModel', 'RR_EfkSymbols', 'RR_EfkLayers',
            fs.readFileSync(path.join(recipesDir, f), 'utf8'))(g.RR_EFK_RECIPE_REGISTRY, g.RR_EfkRecipeUtil, RR_EfkFormat, RR_EfkBuilder, RR_EfkModel, RR_EfkSymbols, RR_EfkLayers);
    }
    return g;
}
const recipes = loadRecipes();
const globals = { ...recipes, RR_EfkFormat, RR_EfkBuilder, RR_EfkModel, RR_EfkSymbols, RR_EfkLayers, RRForgeDesigns, RRDialog: global.RRDialog, require };
const Generator = new Function(...Object.keys(globals),
    fs.readFileSync(path.join(efkDir, 'EffekseerGenerator.js'), 'utf8') + '; return EffekseerGenerator;')(...Object.values(globals));

function generator(projectPath = null) {
    const gen = new Generator();
    gen._status = (msg, error) => { gen.lastStatus = { msg, error }; };
    if (projectPath) gen.projectController = { getCurrentProject: () => ({ path: projectPath }) };
    return gen;
}

/** A stack with three layers: keyframes, tilt, a project texture, a hidden layer, the Composer's own layers. */
function designedGenerator() {
    const gen = generator();
    gen._stack = [{ recipeId: 'geo-cube', keyframes: [{}], activeKf: 0, start: 0, end: 0, opacity: 1, hidden: false }];
    gen._activeLayer = 0;
    let values = gen._values();
    Object.assign(values, { customTex: 'earth_k3j9.png', __tiltX: 30, __tiltY: -15 });
    gen._addKeyframe(0);
    gen._setKeyframeTime(0, 1, 90);
    values = gen._values();
    values.__tiltZ = 45;
    gen._stack.push({ recipeId: 'fire-burst', keyframes: [{}], activeKf: 0, start: 12, end: 70, opacity: 0.6, hidden: false });
    gen._activeLayer = 1;
    const fire = gen._recipe();
    const range = fire.params.find(s => s.type === 'range');
    gen._values()[range.key] = range.max;
    gen._stack.push({ recipeId: 'composer', keyframes: [{}], activeKf: 0, start: 0, end: 0, opacity: 1, hidden: true });
    gen._activeLayer = 2;
    const composer = gen._recipe();
    const layers = gen._composerLayers(composer);
    layers.splice(1, 1);
    layers[0].color = '#123456';
    gen._activeLayer = 1;
    gen._effectDuration = 137;
    gen._loopPreview = false;
    gen._pendingName = 'MyEffect';
    return gen;
}

const visible = gen => { for (const e of gen._stack) e.hidden = false; };

test('the design record: builder, version and a plain, self-contained recipe', () => {
    const gen = designedGenerator();
    const record = gen.designRecord();
    assert.equal(record.builder, 'effekseer');
    assert.equal(record.version, 1);
    const r = record.recipe;
    assert.ok(r && typeof r === 'object' && !Array.isArray(r));
    assert.deepEqual(JSON.parse(JSON.stringify(record)), record, 'plain JSON: no functions, no shared objects lost');
    assert.equal(r.exportName, 'MyEffect');
    assert.equal(r.duration, 137);
    assert.equal(r.loop, false);
    assert.equal(r.activeLayer, 1);
    assert.deepEqual(r.layers.map(l => l.effect), ['geo-cube', 'fire-burst', 'composer']);
    assert.deepEqual(r.layers[0].keyframes.map(k => k.frame), [0, 90]);
    assert.deepEqual(r.layers[0].keyframes[0].tilt, { x: 30, y: -15, z: 0 });
    assert.equal(r.layers[1].opacity, 0.6);
    assert.equal(r.layers[2].hidden, true);
    assert.deepEqual(r.textureFiles, ['earth_k3j9.png']);
    assert.equal(r.layers[0].keyframes[0].values.customTex, 'earth_k3j9.png');
    // Every param of the recipe is written, so a later change of a default does not change the design.
    const cube = recipes.RR_EFK_RECIPE_REGISTRY.find(x => x.id === 'geo-cube');
    assert.deepEqual(Object.keys(r.layers[0].keyframes[0].values).sort(), cube.params.map(s => s.key).sort());
    assert.ok(!JSON.stringify(r).includes('__tilt'), 'tilt is its own field');
    assert.ok(Buffer.byteLength(JSON.stringify(record)) < 64 * 1024);
});

test('a design opens back to the same state and the same effect bytes', () => {
    const gen = designedGenerator();
    visible(gen);
    const before = gen._buildBytes();
    const recipe = JSON.parse(JSON.stringify(gen.designRecipe()));
    const opened = generator();
    opened._applyDesign(recipe, 'Ignored');
    assert.equal(opened._pendingName, 'MyEffect');
    assert.equal(opened._effectDuration, 137);
    assert.equal(opened._loopPreview, false);
    assert.equal(opened._activeLayer, 1);
    assert.deepEqual(Buffer.from(opened._buildBytes()), Buffer.from(before), 'exported again, the same .efkefc');
    assert.deepEqual(opened.designRecipe(), recipe, 'state -> recipe -> open -> same recipe');
    // The active keyframe's values are the panel's values, as the tool keeps them.
    for (const entry of opened._stack) assert.equal(entry.values, entry.keyframes[entry.activeKf]);
});

test('Save Design writes the record into its group, and openDesign opens it', async () => {
    const project = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'rr-efk-designs-'));
    const logError = console.error;
    console.error = () => {};   // the failed opens below are expected
    try {
        const gen = designedGenerator();
        gen.projectController = { getCurrentProject: () => ({ path: project }) };
        gen._pendingName = null;
        gen.designGroup = 'Spells';
        prompts.push('Ember Cube');
        assert.equal(await gen.saveDesign(), true);
        const base = path.join(project, 'forge', 'effekseer_generator', 'designs');
        const record = JSON.parse(fs.readFileSync(path.join(base, 'Spells', 'Ember Cube.json'), 'utf8'));
        assert.equal(record.builder, 'effekseer');
        assert.equal(record.recipe.layers.length, 3);
        const opened = generator(project);
        assert.equal(opened.openDesign('Spells', 'Ember Cube'), true);
        assert.equal(opened.designGroup, 'Spells');
        assert.deepEqual(opened._openedDesign, { group: 'Spells', name: 'Ember Cube', typed: opened._pendingName });
        assert.deepEqual(opened.designRecipe().layers, record.recipe.layers);
        assert.match(opened.lastStatus.msg, /earth_k3j9\.png/, 'a texture file missing from effects/Texture is named');
        assert.equal(opened.openDesign('Spells', 'Nothing Here'), false);
        assert.equal(opened.lastStatus.error, true);
        // Another builder's record is not an effect.
        await RRForgeDesigns.save(base, '', 'Chair', { builder: 'prop3d', version: 1, recipe: { kind: 'chair' } }, null, null, s => s);
        assert.equal(opened.openDesign('', 'Chair'), false);
    } finally { console.error = logError; fs.rmSync(project, { recursive: true, force: true }); }
});

test('a hostile or odd recipe is cleaned, not trusted, and never crashes', () => {
    const fire = recipes.RR_EFK_RECIPE_REGISTRY.find(x => x.id === 'fire-burst');
    const range = fire.params.find(s => s.type === 'range');
    const color = fire.params.find(s => s.type === 'color');
    const hostile = JSON.parse(JSON.stringify({
        exportName: '../../evil/<script>name',
        duration: 1e12, loop: 'yes', activeLayer: 999,
        layers: [
            { effect: 'no-such-effect', keyframes: [{ values: {} }] },
            'not a layer', null, [],
            {
                effect: 'fire-burst', start: -50, end: 1e9, opacity: 7, hidden: 'true', activeKeyframe: 99,
                keyframes: [
                    { frame: 'abc', values: { [range.key]: 1e9, [color.key]: 'javascript:alert(1)', notAParam: 'x', __proto__x: 1 }, tilt: { x: 1e9, y: 'NaN', z: {} } },
                    'bad keyframe',
                ],
            },
            {
                effect: 'geo-cube',
                keyframes: [{ values: { customTex: '../../../etc/passwd.png', texScale: '3', style: 'nonsense' } },
                    { values: { customTex: 'C:\\Windows\\x.png' } }, { values: { customTex: '/abs/x.png' } }],
            },
            { effect: 'composer', keyframes: [{ values: { layers: [{ kind: 'nope' }, { kind: 'flash', size: -100, color: 42 }, 'x'] } }] },
            { effect: 'composer', keyframes: [{ values: { layers: 'not an array' } }] },
        ],
    }));
    hostile.layers[4].keyframes[0].values.__proto__ = { polluted: true };
    const gen = generator();
    const clean = gen._applyDesign(hostile);
    assert.equal(({}).polluted, undefined);
    assert.deepEqual(gen._stack.map(e => e.recipeId), ['fire-burst', 'geo-cube', 'composer', 'composer']);
    assert.equal(gen._effectDuration, 3600);
    assert.equal(gen._loopPreview, true);
    assert.equal(gen._activeLayer, 0);
    assert.equal(clean.name, 'evilscriptname');
    const [f, cube, comp, comp2] = gen._stack;
    assert.equal(f.start, 0); assert.equal(f.end, 4800); assert.equal(f.opacity, 1); assert.equal(f.hidden, false);
    assert.equal(f.activeKf, 1);
    assert.equal(f.keyframes[0][range.key], range.max);
    assert.equal(f.keyframes[0][color.key], color.default);
    assert.ok(!('notAParam' in f.keyframes[0]) && !('__proto__x' in f.keyframes[0]));
    assert.equal(f.keyframes[0].__tiltX, 36000);
    assert.ok(!('__tiltY' in f.keyframes[0]) && !('__tiltZ' in f.keyframes[0]));
    assert.ok(f.kfTimes.every(Number.isFinite));
    assert.deepEqual(cube.keyframes.map(k => k.customTex), ['', '', ''], 'no folders, no "..", no absolute paths');
    assert.equal(cube.keyframes[0].texScale, 3);
    assert.equal(cube.keyframes[0].style, 'wire');
    const flash = comp.keyframes[0].layers;
    assert.equal(flash.length, 1);
    assert.equal(flash[0].kind, 'flash');
    assert.equal(flash[0].color, recipes.RR_EFK_RECIPE_REGISTRY.find(x => x.id === 'composer').composer.schemas.flash.find(s => s.key === 'color').default);
    assert.ok(Array.isArray(comp2.keyframes[0].layers) && comp2.keyframes[0].layers.length > 0, 'a broken layer list is the default one');
    assert.notEqual(comp2.keyframes[0].layers, recipes.RR_EFK_RECIPE_REGISTRY.find(x => x.id === 'composer').composer.defaults, 'never the shared default');
    assert.ok(gen._buildBytes().length > 0, 'the cleaned design builds');
    // Nothing usable, or not a recipe at all: refused without touching the tool.
    for (const bad of [null, [], 'recipe', 42, { layers: [{ effect: 'nope' }] }, { layers: 'x' }]) {
        assert.throws(() => gen._applyDesign(bad), /no effect/);
    }
    assert.deepEqual(gen._stack.map(e => e.recipeId), ['fire-burst', 'geo-cube', 'composer', 'composer']);
});

test('a design\'s picture is framed on the effect, not the whole preview', () => {
    const EffekseerGenerator = Generator;
    const w = 400, h = 200, data = new Uint8ClampedArray(w * h * 4);
    for (let y = 90; y < 110; y++) for (let x = 300; x < 320; x++) data[(y * w + x) * 4] = 255;
    const c = EffekseerGenerator.designPictureCrop(data, w, h);
    assert.ok(c.size >= 50 && c.size <= 60, 'a quarter of the short side at least: ' + c.size);
    assert.ok(c.x <= 300 && c.x + c.size >= 320 && c.y <= 90 && c.y + c.size >= 110, 'the lit pixels inside');
    assert.deepEqual(EffekseerGenerator.designPictureCrop(new Uint8ClampedArray(w * h * 4), w, h), { x: 100, y: 0, size: 200 }, 'nothing lit: the middle');
});
