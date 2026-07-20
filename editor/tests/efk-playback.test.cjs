// Plays EVERY Effekseer recipe through the REAL runtime (effekseer.min.js
// + effekseer.wasm) headlessly: Node runs the WASM simulation natively and
// a Proxy stub stands in for WebGL. Each recipe is loaded, played, stepped,
// steered, then rebuilt with a changed parameter and hot-swapped — the
// exact editor slider sequence. This is the net that catches what the
// structural tests can't: load stalls, WASM crashes, instance leaks.
//
// Two hard-won timing rules encoded here (and in EffekseerGenerator.js):
//   • onload can fire SYNCHRONOUSLY inside loadEffect() when the WASM core
//     already caches every referenced resource path (the common slider-
//     rebuild case) — loadEffectAsync handles both timings.
//   • never releaseEffect() in the same tick a handle was stopped —
//     instances die on the NEXT update(); early release is use-after-free.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');

// ── WebGL / DOM / net stubs ──────────────────────────────────────────────

function makeGLStub() {
    let nextId = 1;
    const target = {
        canvas: { width: 480, height: 480 },
        drawingBufferWidth: 480,
        drawingBufferHeight: 480,
    };
    return new Proxy(target, {
        get(t, prop) {
            if (typeof prop !== 'string' || prop === 'then') return t[prop];
            if (prop in t) return t[prop];
            const fn = (...args) => {
                switch (prop) {
                    case 'getSupportedExtensions': return [];
                    case 'getExtension': return null;
                    case 'createTexture': case 'createBuffer': case 'createFramebuffer':
                    case 'createRenderbuffer': case 'createProgram': case 'createShader':
                        return { __glid: nextId++ };
                    case 'getParameter': return 0;
                    // LINK_STATUS (35714) / COMPILE_STATUS (35713) → true;
                    // ACTIVE_UNIFORMS / ACTIVE_ATTRIBUTES counts → 0.
                    case 'getProgramParameter': return args[1] === 35714 ? true : 0;
                    case 'getShaderParameter': return args[1] === 35713 ? true : 0;
                    case 'getActiveUniform': case 'getActiveAttrib':
                        return { name: 'stub' + (nextId++), size: 1, type: 5126 };
                    case 'getShaderInfoLog': case 'getProgramInfoLog': return '';
                    case 'getUniformLocation': return { __glid: nextId++ };
                    case 'getAttribLocation': return 0;
                    case 'checkFramebufferStatus': return 36053;   // FRAMEBUFFER_COMPLETE
                    case 'getError': return 0;
                    case 'isEnabled': return false;
                    case 'getContextAttributes': return { alpha: false, premultipliedAlpha: false };
                    case 'getShaderPrecisionFormat': return { rangeMin: 127, rangeMax: 127, precision: 23 };
                    default: return undefined;
                }
            };
            t[prop] = fn;
            return fn;
        },
    });
}

class FakeImage {
    set src(v) {
        this._src = v;
        this.width = 64;
        this.height = 64;
        setImmediate(() => this.onload && this.onload());
    }
    get src() { return this._src; }
}

class FakeXHR {
    open(method, url) { this._url = url; }
    send() {
        setImmediate(() => {
            try {
                let buf;
                if (this._url.startsWith('data:')) {
                    buf = Buffer.from(this._url.split(',')[1].split('#')[0], 'base64');
                } else {
                    buf = fs.readFileSync(this._url);
                }
                this.response = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
                this.status = 200;
                if (this.onload) this.onload();
            } catch (e) {
                if (this.onerror) this.onerror(e);
            }
        });
    }
}

// ── Canvas-2D stub for exercising the AG bake pipeline ───────────────────

function make2DStub() {
    const target = { canvas: { width: 128, height: 128 } };
    return new Proxy(target, {
        get(t, prop) {
            if (typeof prop !== 'string' || prop === 'then') return t[prop];
            if (prop in t) return t[prop];
            const fn = (...args) => {
                switch (prop) {
                    case 'createLinearGradient': case 'createRadialGradient': case 'createConicGradient':
                        return { addColorStop() {} };
                    case 'measureText': return { width: 8 };
                    case 'getImageData': case 'createImageData': {
                        const w = args[2] || args[0] || 1, h = args[3] || args[1] || 1;
                        return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
                    }
                    case 'isPointInPath': return false;
                    default: return undefined;
                }
            };
            t[prop] = fn;
            return fn;
        },
        set(t, prop, v) { t[prop] = v; return true; },
    });
}

const fakeDocument = {
    currentScript: undefined,
    createElement: () => ({
        width: 0, height: 0,
        getContext: () => make2DStub(),
    }),
};

// ── Real runtime, loaded once ────────────────────────────────────────────

async function loadRuntime() {
    const src = fs.readFileSync(path.join(editorRoot, 'libs', 'effekseer.min.js'), 'utf8');
    global.window = global;
    global.document = fakeDocument;
    global.Image = FakeImage;
    global.XMLHttpRequest = FakeXHR;
    const factory = new Function(
        'window', 'document', 'Image', 'XMLHttpRequest', 'require', '__filename', '__dirname', 'exports', 'module',
        src + '\n;return effekseer;'
    );
    const effekseer = factory(global, fakeDocument, FakeImage, FakeXHR, require,
        path.join(editorRoot, 'libs', 'effekseer.min.js'), path.join(editorRoot, 'libs'), {}, { exports: {} });
    await new Promise((resolve, reject) => {
        effekseer.initRuntime(path.join(editorRoot, 'libs', 'effekseer.wasm'), resolve,
            () => reject(new Error('effekseer wasm init failed')));
    });
    return effekseer;
}

// ── Recipes (same loading technique as efk-recipes.test.cjs) ─────────────

const fmtPath = path.join(editorRoot, 'src', 'forge', 'EffekseerGenerator', 'format');
const recipesDir = path.join(editorRoot, 'src', 'forge', 'EffekseerGenerator', 'recipes');
const RR_EfkFormat = require(path.join(fmtPath, 'efk_format.js'));
const RR_EfkBuilder = require(path.join(fmtPath, 'efk_builder.js'));
const RR_EfkModel = require(path.join(fmtPath, 'efk_model.js'));
const RR_EfkSymbols = require(path.join(fmtPath, 'efk_symbols.js'));
const RR_EfkLayers = require(path.join(editorRoot, 'src', 'forge', 'EffekseerGenerator', 'layers.js'));

function loadRecipes() {
    const globals = {};
    const registrySrc = fs.readFileSync(path.join(recipesDir, 'registry.js'), 'utf8');
    new Function('RR_EfkFormat', 'RR_EfkBuilder',
        registrySrc + '\n; this.R = RR_EFK_RECIPE_REGISTRY; this.U = RR_EfkRecipeUtil;'
    ).call(globals, RR_EfkFormat, RR_EfkBuilder);
    for (const f of fs.readdirSync(recipesDir).filter((f) => f !== 'registry.js' && f.endsWith('.js'))) {
        new Function('RR_EFK_RECIPE_REGISTRY', 'RR_EfkRecipeUtil', 'RR_EfkFormat', 'RR_EfkBuilder', 'RR_EfkModel', 'RR_EfkSymbols', 'RR_EfkLayers',
            fs.readFileSync(path.join(recipesDir, f), 'utf8')
        )(globals.R, globals.U, RR_EfkFormat, RR_EfkBuilder, RR_EfkModel, RR_EfkSymbols, RR_EfkLayers);
    }
    return globals;
}

// 1×1 white PNG — textures are stubbed, only the .png extension matters.
const WHITE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function buildRecipe(g, recipe, overrides = {}) {
    const params = g.U.resolveParams(recipe, overrides);
    const models = recipe.buildModels
        ? recipe.buildModels(params, RR_EfkModel).map(({ path: mpath, mesh }) => ({
            path: mpath,
            dataUrl: 'data:application/octet-stream;base64,' +
                Buffer.from(RR_EfkModel.writeEfkmodel(mesh)).toString('base64'),
        }))
        : [];
    const textures = typeof recipe.textures === 'function'
        ? recipe.textures(params)
        : recipe.textures.map((n) => `Texture/rr_${n}.png`);
    const effect = RR_EfkBuilder.makeEffect({
        textures, models: models.map((m) => m.path), nodes: recipe.build(params),
    });
    const bytes = RR_EfkFormat.writeEfkefc(effect);
    const redirect = (p) => {
        const model = models.find((md) => p.endsWith(md.path));
        if (model) return model.dataUrl;
        return WHITE_PNG + '#.png';
    };
    return { bytes, redirect };
}

function loadEffectAsync(context, built) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('load timed out')), 8000);
        let eff = null;
        let syncLoaded = false;
        const done = () => { clearTimeout(timer); resolve(eff); };
        eff = context.loadEffect(
            built.bytes.buffer.slice(built.bytes.byteOffset, built.bytes.byteOffset + built.bytes.byteLength),
            1.0,
            () => { if (eff) done(); else syncLoaded = true; },
            (m, p) => { clearTimeout(timer); reject(new Error(`load failed: ${m} ${p}`)); },
            built.redirect
        );
        if (syncLoaded) done();
    });
}

/** Load the standard Animation Generator registry + animations in Node. */
function loadAGRegistry() {
    const agRoot = path.join(editorRoot, 'src', 'forge', 'AnimationGenerator');
    const files = [
        ...['color.js', 'rotations.js', 'rotationGizmo3D.js', 'texture.js', 'shape3D.js', 'symbol3D.js', 'object3D.js']
            .map((f) => path.join(agRoot, 'helpers', f)),
        path.join(agRoot, 'registry.js'),
        ...fs.readdirSync(path.join(agRoot, 'animations')).filter((f) => f.endsWith('.js'))
            .map((f) => path.join(agRoot, 'animations', f)),
    ];
    const sandbox = { window: global, document: fakeDocument, Image: FakeImage };
    let code = 'var window = arguments[0], document = arguments[1], Image = arguments[2];\n';
    for (const f of files) code += fs.readFileSync(f, 'utf8') + '\n';
    code += '; return RR_ANIMATION_REGISTRY;';
    return new Function(code)(sandbox.window, sandbox.document, sandbox.Image);
}

// Every baked recipe must resolve to a real Animation Generator animation
// and render its frames without throwing when driven with the
// recipe's mapped parameters — this exercises the exact bake pipeline the
// editor runs.
test('baked recipes render through the real AG animations', () => {
    const registry = loadAGRegistry();
    assert.equal(registry.length, 76, 'release Animation Generator recipe count');
    assert.equal(registry.some(animation => animation.id === 'portal'), true);
    const g = loadRecipes();
    const baked = g.R.filter((r) => r.bake);
    assert.equal(baked.length, 1, 'Portal is the baked Animation Generator recipe');
    for (const recipe of baked) {
        const anim = registry.find((a) => a.id === recipe.bake.animationId);
        assert.ok(anim, `${recipe.id}: AG animation '${recipe.bake.animationId}' not found`);
        const params = g.U.resolveParams(recipe);
        const agParams = {};
        for (const s of anim.params) agParams[s.key] = s.default;
        Object.assign(agParams, recipe.bake.map(params));
        const ctx = make2DStub();
        const frames = recipe.bake.frames || 64;
        for (const i of [0, Math.floor(frames / 3), frames - 1]) {
            try {
                anim.render(ctx, recipe.bake.cell || 128, recipe.bake.cell || 128, i, frames, agParams);
            } catch (e) {
                assert.fail(`${recipe.id}: AG '${anim.id}' render threw at frame ${i}: ${e.message}`);
            }
        }
    }
});

// Keyframe compiler: 3 keyframes with different colors/size/spin must
// compile to native FCurve tracks (one key per keyframe) and stay a
// valid, playable effect.
test('keyframes compile to FCurve color/scale/rotation tracks', async () => {
    const g = loadRecipes();
    const genSrc = fs.readFileSync(path.join(editorRoot, 'src', 'forge', 'EffekseerGenerator', 'EffekseerGenerator.js'), 'utf8');
    global.RR_EFK_RECIPE_REGISTRY = g.R;
    global.RR_EfkRecipeUtil = g.U;
    global.buildEfkRecipeCategories = () => new Map([['x', [g.R[0]]]]);
    global.RR_EfkTextures = { dataUrl: () => '', pngBytes: () => new Uint8Array(0) };
    Object.assign(global, { RR_EfkFormat, RR_EfkBuilder, RR_EfkModel, RR_EfkLayers });
    const Gen = new Function(genSrc + '; return EffekseerGenerator;')();
    const gen = new Gen();
    gen._stack = [{
        recipeId: 'energy-field', activeKf: 0, start: 0, end: 180,
        opacity: 0.5,
        keyframes: [{ color: '#ff0000' }, { color: '#00ff00', size: 10 }, { color: '#0000ff', spin: 90 }],
    }];
    gen._activeLayer = 0;
    const bytes = gen._buildBytes();
    const back = RR_EfkFormat.parseEfkefc(bytes);
    let fcColors = 0, fcRot = 0, fcScale = 0, keyCounts = new Set(), alphaKeys = [];
    (function walk(n) {
        if (n.type !== -1 && n.type !== undefined) {
            const ac = n.rendererParams && n.rendererParams.allColor;
            if (ac && ac.type === 3) {
                fcColors++;
                keyCounts.add(ac.fcurve.r.keys.length);
                alphaKeys.push(...ac.fcurve.a.keys);
            }
            if (n.rotation && n.rotation.type === 5) fcRot++;
            if (n.scaling && n.scaling.type === 5) fcScale++;
        }
        (n.children || []).forEach(walk);
    })(back.root);
    assert.ok(fcColors >= 2, 'expected FCurve colors from keyframed color param');
    assert.ok(fcRot >= 1, 'expected FCurve rotation from keyframed spin');
    assert.ok(fcScale >= 1, 'expected FCurve wrapper scale from keyframed size');
    assert.ok([...keyCounts].every((c) => c >= 3), 'color tracks must carry the keyframe curve');
    const fullOpacityGen = new Gen();
    fullOpacityGen._stack = JSON.parse(JSON.stringify(gen._stack));
    fullOpacityGen._stack[0].opacity = 1;
    fullOpacityGen._activeLayer = 0;
    const fullOpacityBack = RR_EfkFormat.parseEfkefc(fullOpacityGen._buildBytes());
    const fullOpacityAlphaKeys = [];
    (function walk(n) {
        const ac = n.rendererParams && n.rendererParams.allColor;
        if (ac && ac.type === 3) fullOpacityAlphaKeys.push(...ac.fcurve.a.keys);
        (n.children || []).forEach(walk);
    })(fullOpacityBack.root);
    assert.deepEqual(alphaKeys, fullOpacityAlphaKeys.map((a) => Math.round(a * 0.5)),
        'layer opacity must scale keyframed alpha tracks');
});

// Per-keyframe orientation: each keyframe carries its own __tilt* values
// (degrees). Differing tilts must bake to an FCurve rotation on the layer
// wrapper that tweens keyframe 1 → keyframe 2 in radians; a uniform tilt
// bakes as a fixed wrapper rotation.
test('per-keyframe tilt bakes to wrapper rotation tracks', async () => {
    const g = loadRecipes();
    const genSrc = fs.readFileSync(path.join(editorRoot, 'src', 'forge', 'EffekseerGenerator', 'EffekseerGenerator.js'), 'utf8');
    global.RR_EFK_RECIPE_REGISTRY = g.R;
    global.RR_EfkRecipeUtil = g.U;
    global.buildEfkRecipeCategories = () => new Map([['x', [g.R[0]]]]);
    global.RR_EfkTextures = { dataUrl: () => '', pngBytes: () => new Uint8Array(0) };
    Object.assign(global, { RR_EfkFormat, RR_EfkBuilder, RR_EfkModel, RR_EfkLayers });
    const Gen = new Function(genSrc + '; return EffekseerGenerator;')();
    const D2R = Math.PI / 180;

    // Keyframed tilt → FCurve rotation, 0 → 90° on X, 0 → 45° on Z.
    const gen = new Gen();
    gen._stack = [{
        recipeId: 'energy-field', activeKf: 0, start: 0, end: 180,
        keyframes: [{}, { __tiltX: 90, __tiltZ: 45 }],
    }];
    gen._activeLayer = 0;
    const back = RR_EfkFormat.parseEfkefc(gen._buildBytes());
    let fc = null;
    (function walk(n) {
        if (!fc && n.rotation && n.rotation.type === 5) fc = n.rotation.fcurve;
        (n.children || []).forEach(walk);
    })(back.root);
    assert.ok(fc, 'expected FCurve wrapper rotation from differing keyframe tilts');
    const near = (a, b) => Math.abs(a - b) < 1e-3;
    assert.ok(near(fc.x.keys[0], 0) && near(fc.x.keys[fc.x.keys.length - 1], 90 * D2R),
        'X tilt track must tween 0 → 90°(rad)');
    assert.ok(near(fc.z.keys[fc.z.keys.length - 1], 45 * D2R), 'Z tilt track must end at 45°(rad)');

    // Uniform (single-keyframe) tilt → fixed wrapper rotation in radians.
    const gen2 = new Gen();
    gen2._stack = [{
        recipeId: 'energy-field', activeKf: 0, start: 0, end: 0,
        keyframes: [{ __tiltX: 33 }],
    }];
    gen2._activeLayer = 0;
    const back2 = RR_EfkFormat.parseEfkefc(gen2._buildBytes());
    let fixed = false;
    (function walk(n) {
        if (n.rotation && n.rotation.type === 0 && near(n.rotation.rotation.x, 33 * D2R)) fixed = true;
        (n.children || []).forEach(walk);
    })(back2.root);
    assert.ok(fixed, 'expected fixed wrapper rotation from a single-keyframe tilt');

    // Both variants must actually play in the real runtime — a malformed
    // wrapper rotation track would only surface at loadEffect/update time.
    const effekseer = await loadRuntime();
    const gl = makeGLStub();
    const context = effekseer.createContext();
    context.init(gl);
    context.setRestorationOfStatesFlag(false);
    for (const it of [gen, gen2]) {
        const eff = await loadEffectAsync(context, {
            bytes: it._buildBytes(), redirect: () => WHITE_PNG + '#.png',
        });
        const handle = context.play(eff);
        assert.ok(handle, 'tilt: play failed');
        for (let i = 0; i < 60; i++) context.update();
        assert.ok(handle.exists, 'tilt: effect died within 60 frames');
        handle.stop();
        for (let i = 0; i < 5; i++) context.update();
        context.releaseEffect(eff);
    }
});

// Layer STACKING (the editor's multi-recipe compose): two recipes merged
// into one effect — texture/model indexes remapped onto the merged lists,
// the second layer offset on the timeline — must parse and play.
test('stacked layers compose into one playable effect', async () => {
    const effekseer = await loadRuntime();
    const gl = makeGLStub();
    const context = effekseer.createContext();
    context.init(gl);
    context.setRestorationOfStatesFlag(false);
    const g = loadRecipes();

    const stack = [
        { id: 'energy-ball', start: 0, end: 0 },
        { id: 'fire-burst', start: 20, end: 140 },
    ];
    const textures = [];
    const models = [];
    const texIdx = new Map();
    const modIdx = new Map();
    const nodes = [];
    const { rf } = RR_EfkBuilder;
    const allModels = [];
    for (const entry of stack) {
        const recipe = g.R.find((r) => r.id === entry.id);
        const params = g.U.resolveParams(recipe);
        const texMap = (typeof recipe.textures === 'function'
            ? recipe.textures(params) : recipe.textures.map((n) => `Texture/rr_${n}.png`))
            .map((path2) => {
                if (!texIdx.has(path2)) { texIdx.set(path2, textures.length); textures.push(path2); }
                return texIdx.get(path2);
            });
        const layerModels = recipe.buildModels ? recipe.buildModels(params, RR_EfkModel).map(({ path: mp, mesh }) => ({
            path: mp,
            dataUrl: 'data:application/octet-stream;base64,' + Buffer.from(RR_EfkModel.writeEfkmodel(mesh)).toString('base64'),
        })) : [];
        const modelMap = layerModels.map((m) => {
            if (!modIdx.has(m.path)) { modIdx.set(m.path, models.length); models.push(m.path); allModels.push(m); }
            return modIdx.get(m.path);
        });
        let layerNodes = recipe.build(params);
        (function remap(list) {
            for (const n of list) {
                if (n.rendererCommon && n.rendererCommon.colorTextureIndex >= 0) {
                    n.rendererCommon.colorTextureIndex = texMap[n.rendererCommon.colorTextureIndex] ?? -1;
                }
                if (n.rendererParams && typeof n.rendererParams.modelIndex === 'number') {
                    n.rendererParams.modelIndex = modelMap[n.rendererParams.modelIndex] ?? 0;
                }
                if (n.generationLocation && n.generationLocation.type === 2) {
                    n.generationLocation.modelIndex = modelMap[n.generationLocation.modelIndex] ?? 0;
                }
                remap(n.children || []);
            }
        })(layerNodes);
        if (entry.start > 0 || entry.end > 0) {
            for (const n of layerNodes) n.commonValues.removeWhenParentIsRemoved = 1;
            layerNodes = [RR_EfkBuilder.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: {
                    translationBindType: 2, rotationBindType: 2, scalingBindType: 2,
                    maxGeneration: 1,
                    generationTimeOffset: rf(entry.start),
                    life: rf(entry.end > entry.start ? entry.end - entry.start : 36000),
                },
                children: layerNodes,
            })];
        }
        nodes.push(...layerNodes);
    }
    const effect = RR_EfkBuilder.makeEffect({ textures, models, nodes });
    const bytes = RR_EfkFormat.writeEfkefc(effect);
    const back = RR_EfkFormat.parseEfkefc(bytes);   // strict — throws on layout errors
    const texCount = textures.length;
    (function walk(n) {
        if (n.type !== -1 && n.type !== undefined && n.rendererCommon.materialType !== 128) {
            assert.ok(n.rendererCommon.colorTextureIndex < texCount, 'stack: texture index out of merged range');
        }
        (n.children || []).forEach(walk);
    })(back.root);

    const redirect = (p2) => {
        const m = allModels.find((md) => p2.endsWith(md.path));
        return m ? m.dataUrl : WHITE_PNG + '#.png';
    };
    const eff = await loadEffectAsync(context, { bytes, redirect });
    const handle = context.play(eff);
    assert.ok(handle, 'stack: play failed');
    for (let i = 0; i < 200; i++) context.update();
    assert.ok(handle.exists, 'stack: continuous layer should keep it alive');
    handle.stop();
    for (let i = 0; i < 5; i++) context.update();
    context.releaseEffect(eff);
});

// ── The test ─────────────────────────────────────────────────────────────

test('every recipe plays and hot-swaps in the real Effekseer runtime', async () => {
    const effekseer = await loadRuntime();
    const gl = makeGLStub();
    const context = effekseer.createContext();
    context.init(gl);
    context.setRestorationOfStatesFlag(false);
    const g = loadRecipes();
    const POOL = context.getRestInstancesCount();

    for (const recipe of g.R) {
        const tag = recipe.id;

        // First load + playback, with the gizmo steering applied.
        let effect = await loadEffectAsync(context, buildRecipe(g, recipe, {}));
        assert.ok(effect.isLoaded, `${tag}: first load did not complete`);
        let handle = context.play(effect);
        assert.ok(handle, `${tag}: play() returned null`);
        handle.setLocation(0, 0, 0);
        handle.setRotation(0.3, 0.5, 0.1);
        for (let i = 0; i < 20; i++) context.update();
        assert.ok(handle.exists, `${tag}: effect died within 20 frames`);
        for (let i = 0; i < 130; i++) context.update();
        context.beginDraw();
        if (handle.exists) context.drawHandle(handle);
        context.endDraw();
        if (recipe.continuous) {
            assert.ok(handle.exists, `${tag}: continuous effect died`);
        }

        // Slider change: rebuild with one range param at its minimum and
        // hot-swap mid-playback — the exact editor sequence, including the
        // deferred release of the replaced effect.
        const rangeParam = recipe.params.find((s) => s.type === 'range');
        const variant = rangeParam ? { [rangeParam.key]: rangeParam.min } : {};
        const next = await loadEffectAsync(context, buildRecipe(g, recipe, variant));
        assert.ok(next.isLoaded, `${tag}: swap load did not complete`);
        try { handle.stop(); } catch (e) { assert.fail(`${tag}: stop threw: ${e.message}`); }
        const old = effect;
        effect = next;
        handle = context.play(effect);
        assert.ok(handle, `${tag}: replay after swap failed`);
        for (let i = 0; i < 90; i++) context.update();
        context.releaseEffect(old);   // ≥2 updates after its stop — safe
        assert.ok(handle, `${tag}: no handle after swap`);
        if (recipe.continuous) {
            assert.ok(handle.exists, `${tag}: died after slider swap`);
        }

        // Cleanup, and the pool must drain completely (instance leaks
        // eventually starve the whole preview).
        handle.stop();
        for (let i = 0; i < 8; i++) context.update();
        context.releaseEffect(effect);
        assert.equal(context.getRestInstancesCount(), POOL, `${tag}: leaked instances`);
    }
});
