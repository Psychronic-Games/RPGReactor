// Forge tools across closes and project switches, the Character Generator's
// sheet saves, and a Black Hole slider at its limit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const forgeRoot = path.join(__dirname, '..', 'src', 'forge');
const read = (rel) => fs.readFileSync(path.join(forgeRoot, rel), 'utf8');

function tempProject(name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rr-forge-${name}-`));
    return { path: dir, name };
}

function loadClass(sources, className, globals) {
    const names = Object.keys(globals);
    return new Function(...names, `${sources.join('\n')}\n;return ${className};`)(...names.map(n => globals[n]));
}

function stubWindow() {
    return { addEventListener() {}, removeEventListener() {} };
}

function animationGenerator() {
    const AnimationGenerator = loadClass([read('AnimationGenerator/registry.js'), read('AnimationGenerator/AnimationGenerator.js')],
        'AnimationGenerator', { window: stubWindow(), document: {}, require, alert() {}, requestAnimationFrame() {}, cancelAnimationFrame() {} });
    const controller = { project: null, getCurrentProject() { return this.project; } };
    const gen = new AnimationGenerator();
    gen._render = () => {};
    gen._startPlayback = () => {};
    const mount = () => gen.renderInto({ innerHTML: '' }, controller);
    // What ForgeManager.onProjectChanged does after the controller already holds the next project.
    const switchTo = (project) => { controller.project = project; gen.detach(); gen.projectPath = null; mount(); };
    return { gen, controller, mount, switchTo };
}

const configOf = (project, tool) => {
    const file = path.join(project.path, 'forge', tool, 'config.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};

test('Animation Generator: another project starts from the defaults, not the previous layer stack', () => {
    const a = tempProject('ag-a'), b = tempProject('ag-b');
    const { gen, controller, mount, switchTo } = animationGenerator();
    controller.project = a;
    mount();
    gen.layers = [gen._makeLayer('geometric', 'hypercube')];
    gen.frameCount = 12;
    gen._saveConfig();
    switchTo(b);
    assert.equal(gen.layers.length, 0, 'project B has no config, so no layers');
    assert.equal(gen.frameCount, 30);
    gen._saveConfig();
    assert.deepEqual(configOf(b, 'animation_generator').layers, [], "A's layers are not written into B");
});

test('Animation Generator: closing the Forge writes a pending save; a project switch drops it', () => {
    const a = tempProject('ag-c'), b = tempProject('ag-d');
    const { gen, controller, mount, switchTo } = animationGenerator();
    controller.project = a;
    mount();
    gen.frameCount = 17;
    gen._scheduleSaveConfig();
    gen.detach();   // ForgeManager.close()
    assert.equal(configOf(a, 'animation_generator').frameCount, 17, 'the last tweak survives a close');

    mount();
    gen.frameCount = 23;
    gen._scheduleSaveConfig();
    switchTo(b);
    assert.equal(configOf(a, 'animation_generator').frameCount, 17, 'nothing is written to the closed project');
    assert.notEqual(configOf(b, 'animation_generator')?.frameCount, 23, "nor A's value into B");
});

test('Animation Generator: closing the Forge keeps the play state the user chose', () => {
    const { gen, controller, mount } = animationGenerator();
    controller.project = tempProject('ag-e');
    mount();
    assert.equal(gen.playing, true);
    gen.detach();
    mount();
    assert.equal(gen.playing, true, 'reopened playing, not paused');
});

test('Sound Effect Generator: another project starts from the defaults', () => {
    const SoundEffectGenerator = loadClass([read('SoundEffectGenerator/SoundEffectGenerator.js')], 'SoundEffectGenerator',
        { window: stubWindow(), document: { removeEventListener() {} }, require, alert() {} });
    const controller = { project: tempProject('sfx-a'), getCurrentProject() { return this.project; } };
    const gen = new SoundEffectGenerator();
    gen._render = () => {};
    gen.renderInto({ innerHTML: '' }, controller);
    gen.bpm = 200;
    gen.pattern = new Set(['0,0', '3,4']);
    gen.saveFormat = 'mp3';
    gen._saveConfig();
    controller.project = tempProject('sfx-b');
    gen.detach();
    gen.projectPath = null;
    gen.renderInto({ innerHTML: '' }, controller);
    assert.equal(gen.bpm, 120);
    assert.equal(gen.pattern.size, 0);
    assert.equal(gen.saveFormat, 'wav');
});

function characterGenerator(window, dialog = {}) {
    // The tool asks and tells through the themed dialog.
    const RRDialog = Object.assign({ alert: async () => {}, confirm: async () => true, prompt: async () => null }, dialog);
    const CharacterGenerator = loadClass([read('CharacterGenerator/CharacterGenerator.js')], 'CharacterGenerator',
        { window, document: {}, require, RRDialog, RR_CHARACTER_REGISTRY: [], CharacterRenderer: {} });
    const gen = new CharacterGenerator();
    gen.root = {
        querySelector(selector) {
            if (selector === '.rr-cg-name-input') return { value: 'Hero' };
            if (selector === '.rr-cg-sheet-canvas') return { toDataURL: () => 'data:image/png;base64,AQID' };
            return null;
        }
    };
    return gen;
}

test('Character Generator: the Parts sheet downloads in the browser edition with no project open', async () => {
    const saved = [];
    const window = Object.assign(stubWindow(), { RPGReactorHost: { mode: 'web', saveFile: async (o) => { saved.push(o); return { project: false, path: 'Hero.png' }; } } });
    const gen = characterGenerator(window);
    gen._syncProjectPath = () => null;
    await gen._savePartsSheet();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].projectPath, null);
    assert.equal(saved[0].suggestedName, '$Hero.png');
});

test('Character Generator: a sheet already in img/characters is replaced only when confirmed', async () => {
    const project = tempProject('cg');
    const outDir = path.join(project.path, 'img', 'characters');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, '$Hero.png');
    fs.writeFileSync(outPath, 'original');
    let asked = 0, answer = false;
    const gen = characterGenerator(stubWindow(), { confirm: async () => { asked++; return answer; } });
    gen._syncProjectPath = () => project.path;
    await gen._savePartsSheet();
    assert.equal(asked, 1);
    assert.equal(fs.readFileSync(outPath, 'utf8'), 'original', 'declined: the old sheet stays');
    answer = true;
    await gen._savePartsSheet();
    assert.deepEqual([...fs.readFileSync(outPath)], [1, 2, 3], 'confirmed: replaced');
});

test('Black Hole with no particles draws no jets instead of NaN arcs', () => {
    const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const helpers = [...index.matchAll(/src="src\/forge\/(AnimationGenerator\/helpers\/[^"]+\.js)"/g)].map(m => read(m[1]));
    const registry = loadClass([...helpers, read('AnimationGenerator/registry.js'), read('AnimationGenerator/animations/BlackHole.js')],
        'RR_ANIMATION_REGISTRY', { window: stubWindow(), document: { createElement: () => ({ getContext: () => null }) }, Image: function() {} });
    const anim = registry.find(a => a.id === 'black-hole');
    const params = Object.fromEntries(anim.params.map(p => [p.key, p.default]));
    params.particleCount = 0;
    const bad = [];
    const ctx = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : (...args) => {
            if (args.some(a => typeof a === 'number' && !Number.isFinite(a))) bad.push(String(k));
            if (/Gradient$/.test(String(k))) return { addColorStop() {} };
            return undefined;
        }),
        set: (t, k, v) => { t[k] = v; return true; }
    });
    for (let frame = 0; frame < 30; frame += 7) anim.render(ctx, 192, 192, frame, 30, params);
    assert.deepEqual(bad, []);
});

test('Character Generator: a forge part never takes a built-in part id, and saved parts leave with their project', async () => {
    const project = tempProject('cg-hair');
    const builtIn = { id: 'hair-psychronic-layered-bob', category: 'hair', name: 'Layered Bob' };
    const registry = [builtIn];
    const CharacterGenerator = loadClass([read('CharacterGenerator/CharacterGenerator.js')], 'CharacterGenerator',
        { window: stubWindow(), document: {}, require, RRDialog: { alert: async () => {}, confirm: async () => true }, RR_CHARACTER_REGISTRY: registry, CharacterRenderer: {} });
    const gen = new CharacterGenerator();
    gen.projectPath = project.path;
    gen._syncProjectPath = () => project.path;
    const status = { textContent: '', style: {} };
    gen.root = { querySelector: (selector) => (selector === '.rr-hair-status' ? status : null) };
    gen._hairEngine = () => ({ generateHair: () => ({ palette: {}, sheet: [] }) });
    gen._hairBodyTemplate = () => ({});
    gen._hairEngineConfig = () => ({ tags: [] });
    const hairDir = path.join(project.path, 'forge', 'character_generator', 'styles', 'psychronic', 'parts', 'hair');

    gen._hairConfig = () => ({ name: 'Layered Bob' });   // the Hair Forge's default name
    await gen._saveHairPart();
    assert.equal(fs.existsSync(path.join(hairDir, 'hair-psychronic-layered-bob.js')), false,
        'the next launch would load the built-in part and hide this file');
    assert.deepEqual(registry, [builtIn], 'the built-in part stays in the picker');
    assert.match(status.textContent, /built-in part/);

    gen._hairConfig = () => ({ name: 'My Bob' });
    await gen._saveHairPart();
    assert.equal(fs.existsSync(path.join(hairDir, 'hair-psychronic-my-bob.js')), true);
    assert.equal(registry.length, 2);
    gen._removeProjectParts();   // the project closes or another one opens
    assert.deepEqual(registry, [builtIn], "the saved part is not offered in the next project");
});

test('Sound Effect Generator: cancelling Save As leaves no hidden file input behind', async () => {
    const body = [];
    const makeInput = () => {
        const listeners = {};
        const input = { style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(type, fn) { listeners[type] = fn; },
            remove() { body.splice(body.indexOf(input), 1); }, click() {}, fire(type) { listeners[type]?.({ target: { files: [] } }); } };
        return input;
    };
    const document = { createElement: makeInput, body: { appendChild: (el) => body.push(el) }, removeEventListener() {} };
    const SoundEffectGenerator = loadClass([read('SoundEffectGenerator/SoundEffectGenerator.js')], 'SoundEffectGenerator',
        { window: stubWindow(), document, require, alert() {} });
    const project = tempProject('sfx-save');
    const gen = new SoundEffectGenerator();
    gen.projectController = { getCurrentProject: () => project };
    gen.root = { querySelector: (selector) => (selector === '.rr-sfx-name' ? { value: 'Blip' } : null) };
    gen.synth.renderOffline = async () => ({ sampleRate: 44100, length: 4, numberOfChannels: 1, getChannelData: () => new Float32Array(4) });
    await gen._saveSfx();
    assert.equal(body.length, 1);
    body[0].fire('cancel');
    assert.equal(body.length, 0);
});

test('Effekseer Generator: two small textures of the same name are both copied', () => {
    const inputs = [];
    const document = { createElement: () => { const el = { listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; }, click() {} }; inputs.push(el); return el; } };
    const EffekseerGenerator = loadClass([read('EffekseerGenerator/EffekseerGenerator.js')], 'EffekseerGenerator',
        { window: stubWindow(), document, require, buildEfkRecipeCategories: () => new Map(), RR_EFK_RECIPE_REGISTRY: [] });
    const project = tempProject('efk-tex');
    const gen = new EffekseerGenerator();
    const values = {};
    gen.projectController = { getCurrentProject: () => project };
    gen._recipe = () => ({ params: [] });
    gen._values = () => values;
    gen._renderParams = () => {};
    gen._scheduleRebuild = () => {};
    gen._status = (msg) => { throw new Error(msg); };
    const pick = (bytes, folder) => {
        const dir = path.join(project.path, folder);
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, 'spark.png');
        fs.writeFileSync(file, Buffer.from(bytes));
        gen._pickTexture('texture');
        inputs.at(-1).listeners.change({ target: { files: [{ path: file }] } });
        return values.texture;
    };
    // Two different images under 1 KB, both starting with the PNG signature byte.
    const first = pick([0x89, 0x50, 0x4e, 0x47, 1, 2, 3], 'a');
    const second = pick([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9], 'b');
    assert.notEqual(first, second);
    const texDir = path.join(project.path, 'effects', 'Texture');
    assert.deepEqual([...fs.readFileSync(path.join(texDir, second))], [0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]);
});

test('Animation Generator: a different texture with a taken name is kept beside the first, the same one is reused', () => {
    const { gen } = animationGenerator();
    const AnimationGenerator = gen.constructor;
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ag-tex-'));
    const srcA = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ag-src-'));
    const srcB = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ag-src-'));
    fs.writeFileSync(path.join(srcA, 'smoke.png'), 'first');
    fs.writeFileSync(path.join(srcB, 'smoke.png'), 'second');
    assert.equal(AnimationGenerator.textureFileName(dest, path.join(srcA, 'smoke.png')), 'smoke.png');
    fs.copyFileSync(path.join(srcA, 'smoke.png'), path.join(dest, 'smoke.png'));
    assert.equal(AnimationGenerator.textureFileName(dest, path.join(srcA, 'smoke.png')), 'smoke.png', 'the same picture reuses its copy');
    assert.equal(AnimationGenerator.textureFileName(dest, path.join(srcB, 'smoke.png')), 'smoke-2.png', 'another picture does not replace it');
    fs.copyFileSync(path.join(srcB, 'smoke.png'), path.join(dest, 'smoke-2.png'));
    assert.equal(AnimationGenerator.textureFileName(dest, path.join(srcB, 'smoke.png')), 'smoke-2.png');
    assert.equal(AnimationGenerator.textureFileName(dest, path.join(dest, 'smoke.png')), 'smoke.png', 'a file picked from textures/ itself keeps its name');
});

test('a language change keeps a running project tool open and only relabels the workspace', () => {
    // The workspace was rebuilt on every language change, and Project Tools closes its tool whenever it is
    // mounted again: whatever the tool held unsaved was gone.
    const listeners = {};
    const win = { addEventListener(name, fn) { listeners[name] = fn; }, removeEventListener() {}, I18n: { t: key => `fr:${key}` } };
    const ForgeManager = loadClass([read('ForgeManager.js')], 'ForgeManager', { window: win, document: {}, require, alert() {} });
    const names = [{ dataset: { toolId: 'x' }, querySelector: () => null }];
    const title = { textContent: '' };
    const manager = new ForgeManager({});
    let rebuilt = 0;
    manager._renderWorkspace = () => { rebuilt++; };
    manager.workspaceModal = { style: { display: 'flex' }, querySelector: sel => sel === '.rr-modal-title' ? title : null, querySelectorAll: () => names };
    const source = read('ForgeManager.js');
    const tool = /id:\s*'([^']+)'[^}]*getter:\s*'([^']+)'/.exec(source.slice(source.indexOf('const FORGE_TOOLS')));
    assert.ok(tool, 'a Forge tool entry names its id and getter');
    manager.activeToolId = tool[1];
    // Nothing in hand: the workspace is rebuilt, so every tool's own text follows the language.
    manager[tool[2]] = { holdsWork: () => false };
    listeners['rr-language-changed']();
    assert.equal(rebuilt, 1);
    // A tool in hand: its page stays, the title takes the new language.
    manager[tool[2]] = { holdsWork: () => true };
    listeners['rr-language-changed']();
    assert.equal(rebuilt, 1, 'the page of a tool that holds work is not mounted again');
    assert.match(title.textContent, /^fr:menu\.forge \| fr:/);
    // Project Tools says so exactly while a tool's frame is up.
    const tools = read('ProjectTools/ProjectTools.js');
    assert.match(tools, /holdsWork\(\) \{\s*return !!\(this\.frame && this\.activeTool\);/);
    assert.match(source, /<span class="rr-forge-sidebar-name">\$\{name\}<\/span>/);
});

test('Effekseer Generator: the generated-texture cache is bounded, and what is in use stays', () => {
    // A parametric texture's numbers are part of its name, so every stop of a dragged slider made a canvas
    // that was kept for the life of the editor.
    const made = [];
    const context = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} })
        : key === 'getImageData' || key === 'createImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray((w || x) * (h || y) * 4), width: w || x, height: h || y })
        : key === 'measureText' ? () => ({ width: 10 }) : () => {} , set: () => true });
    const document = { createElement: () => { const canvas = { width: 0, height: 0, getContext: () => context, toDataURL: () => 'data:image/png;base64,' }; made.push(canvas); return canvas; } };
    const RR_EfkTextures = new Function('document', 'atob', `${read('EffekseerGenerator/textures.js')}\n;return RR_EfkTextures;`)(document, s => s);
    const base = RR_EfkTextures.NAMES[0];
    const first = RR_EfkTextures.get(base);
    assert.equal(RR_EfkTextures.get(base), first, 'the same texture is made once');
    for (let i = 0; i < RR_EfkTextures.CACHE_LIMIT * 3; i++) {
        RR_EfkTextures.get(`${base}_p${i}`);
        if (i % 7 === 0) assert.equal(RR_EfkTextures.get(base), first, 'a texture still asked for is never dropped');
    }
    assert.ok(RR_EfkTextures.cached() <= RR_EfkTextures.CACHE_LIMIT, `kept ${RR_EfkTextures.cached()}`);
    assert.equal(RR_EfkTextures.get(base), first);
});
