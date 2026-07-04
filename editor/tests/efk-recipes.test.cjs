// Validates every Effekseer recipe: registry + recipe files are evaluated
// with browser-style globals (same technique as outfit-engine tests), each
// recipe is built at default params, serialized, and strict-parsed. The
// parser throws on any structural error or stray bytes, so a passing build
// here is a valid .efkefc by construction.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const fmtPath = path.join(repoRoot, 'src', 'forge', 'EffekseerGenerator', 'format');
const recipesDir = path.join(repoRoot, 'src', 'forge', 'EffekseerGenerator', 'recipes');

const RR_EfkFormat = require(path.join(fmtPath, 'efk_format.js'));
const RR_EfkBuilder = require(path.join(fmtPath, 'efk_builder.js'));
const RR_EfkModel = require(path.join(fmtPath, 'efk_model.js'));
const RR_EfkSymbols = require(path.join(fmtPath, 'efk_symbols.js'));
const RR_EfkLayers = require(path.join(repoRoot, 'src', 'forge', 'EffekseerGenerator', 'layers.js'));

// Evaluate registry.js + all recipe files with shared globals.
function loadRecipes() {
    const globals = { RR_EfkFormat, RR_EfkBuilder };
    const registrySrc = fs.readFileSync(path.join(recipesDir, 'registry.js'), 'utf8');
    new Function(
        'RR_EfkFormat', 'RR_EfkBuilder',
        `${registrySrc}\n; this.RR_EFK_RECIPE_REGISTRY = RR_EFK_RECIPE_REGISTRY; this.RR_EfkRecipeUtil = RR_EfkRecipeUtil; this.buildEfkRecipeCategories = buildEfkRecipeCategories;`
    ).call(globals, RR_EfkFormat, RR_EfkBuilder);

    for (const f of fs.readdirSync(recipesDir).filter((f) => f !== 'registry.js' && f.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(recipesDir, f), 'utf8');
        new Function(
            'RR_EFK_RECIPE_REGISTRY', 'RR_EfkRecipeUtil', 'RR_EfkFormat', 'RR_EfkBuilder', 'RR_EfkModel', 'RR_EfkSymbols', 'RR_EfkLayers',
            src
        )(globals.RR_EFK_RECIPE_REGISTRY, globals.RR_EfkRecipeUtil, RR_EfkFormat, RR_EfkBuilder, RR_EfkModel, RR_EfkSymbols, RR_EfkLayers);
    }
    return globals;
}

const g = loadRecipes();

// Texture lists are either static name arrays (mapped to Texture/rr_*.png)
// or functions of params returning full paths.
function resolveTextures(r, params) {
    return typeof r.textures === 'function'
        ? r.textures(params)
        : r.textures.map((n) => `Texture/rr_${n}.png`);
}

test('recipes are registered', () => {
    assert.ok(g.RR_EFK_RECIPE_REGISTRY.length >= 2, 'expected at least 2 recipes');
    for (const r of g.RR_EFK_RECIPE_REGISTRY) {
        assert.ok(r.id && r.name && r.category, `${r.id || '?'}: missing metadata`);
        const params = g.RR_EfkRecipeUtil.resolveParams(r);
        assert.ok(resolveTextures(r, params).length > 0, `${r.id}: no textures`);
        assert.ok(Array.isArray(r.params), `${r.id}: no params schema`);
        assert.equal(typeof r.build, 'function', `${r.id}: no build()`);
    }
});

test('every recipe builds a valid, strict-parseable .efkefc at defaults', () => {
    for (const r of g.RR_EFK_RECIPE_REGISTRY) {
        const params = g.RR_EfkRecipeUtil.resolveParams(r);
        const nodes = r.build(params);
        assert.ok(nodes.length > 0, `${r.id}: build returned no nodes`);
        const effect = RR_EfkBuilder.makeEffect({
            textures: resolveTextures(r, params),
            nodes,
        });
        const bytes = RR_EfkFormat.writeEfkefc(effect);
        const back = RR_EfkFormat.parseEfkefc(bytes);   // throws on any layout error
        assert.equal(back.header.version, 1500, `${r.id}: wrong binary version`);
        assert.equal(back.root.children.length, nodes.length, `${r.id}: node count mismatch`);
        // Texture indexes must stay within the declared texture list, and
        // renderingPriority must be the DFS index 0..N-1 (the v13+ runtime
        // uses it as a rendering-list index; -1 crashes the WASM renderer).
        const texCount = resolveTextures(r, params).length;
        let dfs = 0;
        (function walk(n) {
            if (n.type !== -1) {
                if (n.rendererCommon.materialType !== 128) {
                    assert.ok(n.rendererCommon.colorTextureIndex < texCount,
                        `${r.id}: colorTextureIndex ${n.rendererCommon.colorTextureIndex} out of range`);
                }
                assert.equal(n.renderingPriority, dfs++,
                    `${r.id}: renderingPriority must be sequential DFS index`);
            }
            n.children.forEach(walk);
        })(back.root);
        assert.equal(back.header.renderingNodesCount, dfs, `${r.id}: renderingNodesCount != node count`);
    }
});

test('every recipe builds at parameter extremes', () => {
    for (const r of g.RR_EFK_RECIPE_REGISTRY) {
        for (const bound of ['min', 'max']) {
            const values = {};
            for (const s of r.params) {
                if (s.type === 'range') values[s.key] = s[bound];
                else if (s.type === 'toggle') values[s.key] = bound === 'max';
            }
            const params = g.RR_EfkRecipeUtil.resolveParams(r, values);
            const effect = RR_EfkBuilder.makeEffect({
                textures: resolveTextures(r, params),
                nodes: r.build(params),
            });
            RR_EfkFormat.parseEfkefc(RR_EfkFormat.writeEfkefc(effect));   // must not throw
        }
    }
});

// Top-level nodes must bind Always (2) to the root transform — otherwise
// handle.setLocation/setRotation (the preview's 3D gizmo and MZ's target
// steering) silently no-op. makeEffect promotes WhenCreating defaults.
test('every recipe steers: top-level nodes bind Always', () => {
    for (const r of g.RR_EFK_RECIPE_REGISTRY) {
        const params = g.RR_EfkRecipeUtil.resolveParams(r);
        const effect = RR_EfkBuilder.makeEffect({
            textures: resolveTextures(r, params),
            nodes: r.build(params),
        });
        const back = RR_EfkFormat.parseEfkefc(RR_EfkFormat.writeEfkefc(effect));
        for (const n of back.root.children) {
            assert.equal(n.commonValues.translationBindType, 2, `${r.id}: top-level translation bind`);
            assert.equal(n.commonValues.rotationBindType, 2, `${r.id}: top-level rotation bind`);
        }
    }
});

// Every EffekseerGenerator source file must be wired into index.html —
// tests inject modules directly, which once masked a missing <script> tag
// (the editor crashed with "RR_EfkLayers is not defined" while all tests
// were green). Never again.
test('every EffekseerGenerator source file is loaded by index.html', () => {
    const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    const base = path.join(repoRoot, 'src', 'forge', 'EffekseerGenerator');
    const rel = (p) => 'src/forge/EffekseerGenerator/' + p;
    const files = [
        ...fs.readdirSync(path.join(base, 'format')).filter((f) => f.endsWith('.js')).map((f) => rel('format/' + f)),
        rel('textures.js'),
        rel('layers.js'),
        rel('recipes/registry.js'),
        ...fs.readdirSync(path.join(base, 'recipes')).filter((f) => f !== 'registry.js' && f.endsWith('.js')).map((f) => rel('recipes/' + f)),
        rel('EffekseerGenerator.js'),
    ];
    for (const f of files) {
        assert.ok(indexHtml.includes(`src="${f}"`), `index.html is missing <script src="${f}">`);
    }
});

// Splicing methods out of EffekseerGenerator.js has happened (a bad patch
// deleted _initGizmo and the whole tool crashed on open). Lock the class
// surface: every method the UI flow calls must exist.
test('EffekseerGenerator class has all required methods', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'src', 'forge', 'EffekseerGenerator', 'EffekseerGenerator.js'), 'utf8');
    const cls = new Function(src + '; return EffekseerGenerator;')();
    const required = [
        'renderInto', 'detach', '_initGizmo', '_initPreview', '_teardownPreview',
        '_renderLayerBar', '_renderParams', '_refreshAfterLayerChange', '_filterSidebar',
        '_bindOrbitControls', '_refreshPresetList', '_composeStack', '_buildBytes',
        '_loadCurrentEffect', '_swapEffect', '_play', '_export', '_randomize',
        '_savePreset', '_applyPreset', '_deletePreset', '_renderLayerCards',
        '_wireLayerCards', '_composerLayers', '_bakedSheet', '_pickTexture',
        '_layer', '_values', '_stackMeta', '_retireEffect', '_flushRetired',
    ];
    for (const m of required) {
        assert.equal(typeof cls.prototype[m], 'function', `EffekseerGenerator.${m} is missing`);
    }
});

// Every declared param must actually be read somewhere in the recipe —
// a slider that exists in the UI but changes nothing is a broken promise.
test('every param is used by the recipe', () => {
    for (const r of g.RR_EFK_RECIPE_REGISTRY) {
        const src = [
            r.build, r.buildModels, r._frames,
            typeof r.textures === 'function' ? r.textures : null,
            typeof r.prewarm === 'function' ? r.prewarm : null,
            r.bake && r.bake.map,
        ].filter(Boolean).map((f) => f.toString()).join('\n');
        const hasDynamicAccess = /\bp\[/.test(src);   // e.g. Interface's p[c.key]
        for (const s of r.params) {
            const used = new RegExp(`\\bp\\.${s.key}\\b`).test(src) || hasDynamicAccess;
            assert.ok(used, `${r.id}: param '${s.key}' is never used by build/buildModels`);
        }
    }
});

// Every param swept INDIVIDUALLY (others at defaults): min/mid/max for
// ranges, every option for selects, both toggle states, and a fake custom
// texture (which flips recipes into their forced-Solid path). This is the
// "some sliders break the preview" regression net — any param value that
// makes build()/buildModels() throw or emit out-of-range texture/model
// references fails here instead of stalling the live preview.
test('every param builds at swept values (each param alone)', () => {
    for (const r of g.RR_EFK_RECIPE_REGISTRY) {
        for (const s of r.params) {
            const step = s.step || 1;
            const sweep =
                s.type === 'range' ? [s.min, s.min + Math.round((s.max - s.min) / 2 / step) * step, s.max]
                : s.type === 'select' ? s.options.map((o) => o.value)
                : s.type === 'toggle' ? [true, false]
                : s.type === 'texture' ? ['', 'sweep_test.png']
                : [];
            for (const v of sweep) {
                const tag = `${r.id}: ${s.key}=${v}`;
                const params = g.RR_EfkRecipeUtil.resolveParams(r, { [s.key]: v });
                let models = [];
                if (r.buildModels) {
                    models = r.buildModels(params, RR_EfkModel);
                    for (const m of models) {
                        RR_EfkModel.parseEfkmodel(RR_EfkModel.writeEfkmodel(m.mesh));   // must not throw
                    }
                }
                const effect = RR_EfkBuilder.makeEffect({
                    textures: resolveTextures(r, params),
                    models: models.map((m) => m.path),
                    nodes: r.build(params),
                });
                const back = RR_EfkFormat.parseEfkefc(RR_EfkFormat.writeEfkefc(effect));
                const texCount = resolveTextures(r, params).length;
                (function walk(n) {
                    if (n.type !== -1) {
                        if (n.rendererCommon.materialType !== 128) {
                            assert.ok(n.rendererCommon.colorTextureIndex < texCount,
                                `${tag}: colorTextureIndex out of range`);
                        }
                        if (n.generationLocation && n.generationLocation.type === 2) {
                            assert.ok(n.generationLocation.modelIndex < models.length,
                                `${tag}: spawn modelIndex out of range`);
                        }
                        if (n.type === 5) {
                            assert.ok(n.rendererParams.modelIndex < models.length,
                                `${tag}: render modelIndex out of range`);
                        }
                    }
                    n.children.forEach(walk);
                })(back.root);
            }
        }
    }
});

// Recipes with buildModels must produce valid .efkmodel bytes for every
// shape option, and every generation-location MODEL reference must point
// at a declared model index.
test('recipe models build and parse for every shape option', () => {
    for (const r of g.RR_EFK_RECIPE_REGISTRY) {
        if (!r.buildModels) continue;
        const shapeSchema = r.params.find((s) => s.key === 'shape');
        const shapes = shapeSchema ? shapeSchema.options.map((o) => o.value) : [null];
        const styleSchema = r.params.find((s) => s.key === 'style');
        const styles = styleSchema ? styleSchema.options.map((o) => o.value) : [null];
        for (const shape of shapes) for (const style of styles) {
            const params = g.RR_EfkRecipeUtil.resolveParams(r, {
                ...(shape ? { shape } : {}),
                ...(style ? { style } : {}),
            });
            const models = r.buildModels(params, RR_EfkModel);
            assert.ok(models.length > 0, `${r.id}/${shape}: no models`);
            for (const m of models) {
                assert.ok(/^Model\/rr_[A-Za-z0-9_-]+\.efkmodel$/.test(m.path), `${r.id}/${shape}: bad path ${m.path}`);
                RR_EfkModel.parseEfkmodel(RR_EfkModel.writeEfkmodel(m.mesh));   // must not throw
            }
            const effect = RR_EfkBuilder.makeEffect({
                textures: resolveTextures(r, params),
                models: models.map((m) => m.path),
                nodes: r.build(params),
            });
            const back = RR_EfkFormat.parseEfkefc(RR_EfkFormat.writeEfkefc(effect));
            (function walk(n) {
                if (n.type !== -1 && n.generationLocation.type === 2) {
                    assert.ok(n.generationLocation.modelIndex < models.length,
                        `${r.id}/${shape}: spawn modelIndex out of range`);
                }
                n.children.forEach(walk);
            })(back.root);
        }
    }
});
