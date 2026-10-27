/**
 * The editor's animation previews draw an HDR effect through the game's own
 * renderer (ReactorHdrRenderer, runtime/reactor_hdr_overlay.js), one per
 * WebGL context, via RRHdrPreview. Where a preview cannot, it plays the
 * sidecar's graded twin and says why; what the game refuses it refuses.
 * GPU output itself is compared on hardware, not here: these hold the
 * choices, the load, the draw order and the cleanup.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(editorRoot, rel), 'utf8');
const animationEditor = read('src/database/DatabaseAnimationEditor.js');
const sidecar = {
    version: 1, gradeInput: 'hdr', grade: 'vec3 tmOut = hdr / (hdr + vec3(1.0));', fallback: 'Fire-ldr',
    bloom: { intensity: 0.675, radiusScale: 2.4, sizes: [0.3, 1, 2, 10, 30, 64], tints: [0.3465, 0.138, 0.1176, 0.066, 0.066, 0.061] }
};

function extract(name) {
    const start = animationEditor.indexOf(`function ${name}(`);
    return animationEditor.slice(start, animationEditor.indexOf('\n}\n', start) + 3);
}

// A WebGL1 context that records what is done to it. Uniforms are read from
// the shader sources, so a uniform set by name can be found in the log.
function fakeGl({ floats = true, gradeCompiles = true } = {}) {
    const calls = [];
    const constants = new Map();
    let next = 1;
    const programs = new Map();
    const base = {
        canvas: { addEventListener() {} },
        isContextLost: () => false,
        getExtension: name => !floats ? null : name === 'OES_texture_half_float' ? { HALF_FLOAT_OES: 0x8d61 } : {},
        checkFramebufferStatus: () => gl.FRAMEBUFFER_COMPLETE,
        createShader: () => ({}),
        shaderSource: (shader, source) => { shader.source = source; },
        getShaderParameter: shader => gradeCompiles || !/tmOut/.test(shader.source),
        getShaderInfoLog: () => 'the grade does not compile',
        createProgram: () => { const p = { shaders: [] }; programs.set(p, p); return p; },
        attachShader: (p, s) => p.shaders.push(s),
        getProgramParameter: (p, name) => name === gl.ACTIVE_UNIFORMS
            ? (p.uniforms = [...p.shaders.map(s => s.source).join('\n').matchAll(/uniform\s+\w+\s+(\w+)/g)].map(m => m[1])).length
            : true,
        getActiveUniform: (p, i) => ({ name: p.uniforms[i] }),
        getUniformLocation: (p, name) => ({ name })
    };
    const gl = new Proxy(base, {
        get(target, key) {
            if (key in target) {
                const value = target[key];
                return typeof value === 'function' ? (...args) => { calls.push([key, ...args]); return value(...args); } : value;
            }
            if (typeof key === 'string' && /^[A-Z0-9_]+$/.test(key)) {
                if (!constants.has(key)) constants.set(key, next++);
                return constants.get(key);
            }
            return (...args) => { calls.push([key, ...args]); return /^create/.test(key) ? {} : undefined; };
        }
    });
    return { gl, calls };
}

function editor() {
    const context = {
        console: { info() {}, warn() {}, error() {} },
        require: name => ({ fs, path })[name],
        process, Buffer, ArrayBuffer, Uint8Array, Float32Array, performance, setTimeout: () => 0, clearTimeout() {},
        location: { pathname: path.join(editorRoot, 'index.html') }
    };
    context.window = context;
    context.document = {
        createElement: () => ({}),
        head: { appendChild: el => { if (el.text) vm.runInContext(el.text, context); } }
    };
    vm.createContext(context);
    vm.runInContext(['RR_isValidHdrSidecar', 'RR_resolveHdrPreviewTwin', 'RR_loadEffekseerEffectFromFile'].map(extract).join('\n')
        + '\nglobalThis.RR_loadEffekseerEffectFromFile = RR_loadEffekseerEffectFromFile; globalThis.RR_resolveHdrPreviewTwin = RR_resolveHdrPreviewTwin;', context);
    vm.runInContext(read('src/utils/HdrPreview.js'), context);
    return context;
}

function project() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-hdr-render-'));
    const effects = path.join(root, 'effects');
    fs.mkdirSync(effects);
    fs.writeFileSync(path.join(effects, 'Fire-hdr.efkefc'), 'HDR-BYTES');
    fs.writeFileSync(path.join(effects, 'Fire-hdr.hdr.json'), JSON.stringify(sidecar));
    fs.writeFileSync(path.join(effects, 'Fire-ldr.efkefc'), 'TWIN-BYTES');
    fs.writeFileSync(path.join(effects, 'Plain.efkefc'), 'PLAIN-BYTES');
    fs.writeFileSync(path.join(effects, 'Bad-hdr.efkefc'), 'HDR-BYTES');
    return { file: name => path.join(effects, name + '.efkefc'), done: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function effekseer() {
    const loaded = [];
    return { loaded, context: { nativeptr: 1, loadEffect(buffer) { loaded.push(Buffer.from(buffer).toString()); return {}; } } };
}

const view = { width: 960, height: 540 };

test('the editor loads the renderer from the runtime file, and not the game adapter', () => {
    const w = editor();
    assert.equal(w.ReactorHdrRenderer, undefined);
    assert.equal(w.RRHdrPreview.loadRuntime(), true);
    assert.equal(typeof w.ReactorHdrRenderer.create, 'function');
    assert.equal(w.ReactorHdrOverlay, undefined, 'no game hook can find an overlay in the editor');
});

test('a preview draws HDR when it can, and otherwise plays the twin and says why', () => {
    const p = project();
    try {
        const w = editor();
        assert.equal(w.RRHdrPreview.choose(fakeGl().gl, p.file('Plain'), 960, 540).mode, 'plain');
        const hdr = w.RRHdrPreview.choose(fakeGl().gl, p.file('Fire-hdr'), 960, 540);
        assert.equal(hdr.mode, 'hdr');
        assert.equal(hdr.sidecar.fallback, 'Fire-ldr');
        const reasons = [
            w.RRHdrPreview.choose(fakeGl().gl, p.file('Fire-hdr'), 960, 540, { sceneOwned: true }),
            w.RRHdrPreview.choose(fakeGl({ floats: false }).gl, p.file('Fire-hdr'), 960, 540),
            w.RRHdrPreview.choose(fakeGl({ gradeCompiles: false }).gl, p.file('Fire-hdr'), 960, 540)
        ];
        for (const choice of reasons) assert.equal(choice.mode, 'twin');
        assert.match(reasons[0].reason, /3D scene/);
        assert.match(reasons[1].reason, /float render targets/);
        assert.match(reasons[2].reason, /grade does not compile/);
        assert.throws(() => w.RRHdrPreview.choose(fakeGl().gl, p.file('Bad-hdr'), 960, 540), e => e.rrHdrRefused === true);
    } finally { p.done(); }
});

test('the load hands Effekseer the HDR effect itself, or its twin, and marks which', () => {
    const p = project();
    try {
        const w = editor();
        const a = effekseer();
        const hdr = w.RRHdrPreview.load(a.context, fakeGl().gl, p.file('Fire-hdr'), 1, null, null, view);
        assert.deepEqual(a.loaded, ['HDR-BYTES']);
        assert.equal(hdr.rrHdr.mode, 'hdr');
        const b = effekseer();
        const twin = w.RRHdrPreview.load(b.context, fakeGl({ floats: false }).gl, p.file('Fire-hdr'), 1, null, null, view);
        assert.deepEqual(b.loaded, ['TWIN-BYTES']);
        assert.equal(twin.rrHdrTwin.twinName, 'Fire-ldr');
        assert.match(twin.rrHdrTwin.reason, /float/);
        const c = effekseer();
        const plain = w.RRHdrPreview.load(c.context, fakeGl().gl, p.file('Plain'), 1, null, null, view);
        assert.deepEqual(c.loaded, ['PLAIN-BYTES']);
        assert.equal(plain.rrHdr, undefined);
        assert.equal(plain.rrHdrTwin, undefined);
        assert.throws(() => w.RRHdrPreview.load(c.context, fakeGl().gl, p.file('Bad-hdr'), 1, null, null, view), e => e.rrHdrRefused === true);
        assert.deepEqual(c.loaded, ['PLAIN-BYTES'], 'a refused effect never reaches Effekseer');
    } finally { p.done(); }
});

test('a frame draws into the light buffer, then composites over the canvas where the view says', () => {
    const p = project();
    try {
        const w = editor();
        const { gl, calls } = fakeGl();
        const choice = w.RRHdrPreview.choose(gl, p.file('Fire-hdr'), 1600, 900);
        calls.length = 0;
        let drawnAt = -1;
        const out = { x: -320, y: -180, w: 1600, h: 900 };
        assert.equal(w.RRHdrPreview.draw(gl, choice, { width: 1600, height: 900, out, premultiplied: true }, () => { drawnAt = calls.length; }), true);
        const clear = calls.findIndex(c => c[0] === 'clear');
        assert.ok(clear >= 0 && clear < drawnAt, 'the light buffer is cleared before the effect draws');
        const binds = calls.filter(c => c[0] === 'bindFramebuffer');
        assert.ok(binds[0][2], 'the effect draws into a framebuffer of its own');
        assert.equal(binds.at(-1)[2], null, 'the canvas is bound again afterwards');
        const composite = calls.findLastIndex(c => c[0] === 'drawArrays');
        const viewport = calls.slice(0, composite).findLast(c => c[0] === 'viewport');
        assert.deepEqual(viewport.slice(1), [out.x, out.y, out.w, out.h], 'the composite lands on the cropped window of the full view');
        const alpha = calls.find(c => c[0] === 'uniform1f' && c[1]?.name === 'uAlphaFromColor');
        assert.equal(alpha[2], 1, 'a premultiplied canvas takes its alpha from the graded colour');
        const blend = calls.findLast(c => c[0] === 'blendFunc');
        assert.deepEqual(blend.slice(1), [gl.ONE, gl.ONE_MINUS_SRC_COLOR], 'screened, as in the game');

        calls.length = 0;
        w.RRHdrPreview.draw(gl, choice, { width: 1600, height: 900 }, () => {});
        assert.equal(calls.find(c => c[0] === 'uniform1f' && c[1]?.name === 'uAlphaFromColor')[2], 0, 'an opaque backdrop keeps the game\'s alpha');
        assert.deepEqual(calls.findLast(c => c[0] === 'viewport').slice(1), [0, 0, 1600, 900]);
    } finally { p.done(); }
});

test('bloom radii follow the game screen\'s width as the preview draws it, not the canvas\'s', () => {
    const p = project();
    try {
        const w = editor();
        w.reactor = { databaseManager: { data: { system: { advanced: { screenWidth: 816, screenHeight: 624 } } } } };
        assert.equal(Math.round(w.RRHdrPreview.bloomWidth(540)), 706, '816 x 540 / 624');
        assert.equal(w.RRHdrPreview.bloomWidth(540, 0.5), 408);
        const { gl, calls } = fakeGl();
        const choice = w.RRHdrPreview.choose(gl, p.file('Fire-hdr'), 960, 540);
        const sigmas = bloomWidth => {
            calls.length = 0;
            w.RRHdrPreview.draw(gl, choice, { width: 960, height: 540, bloomWidth }, () => {});
            return calls.filter(c => c[0] === 'uniform1f' && c[1]?.name === 'uSigma').map(c => c[2]);
        };
        const canvasWide = sigmas(undefined), screenWide = sigmas(w.RRHdrPreview.bloomWidth(540));
        assert.equal(canvasWide.length, 6);
        assert.ok(screenWide[0] < canvasWide[0], 'a 706-pixel screen blooms tighter than the 960-pixel canvas would');
        w.reactor = { databaseManager: { data: { system: { advanced: {} } } } };
        assert.equal(w.RRHdrPreview.bloomWidth(540), undefined, 'no screen size: the buffer\'s own width');
    } finally { p.done(); }
});

test('releasing a context frees its targets, and the next preview starts fresh', () => {
    const p = project();
    try {
        const w = editor();
        const { gl, calls } = fakeGl();
        const first = w.RRHdrPreview.choose(gl, p.file('Fire-hdr'), 960, 540);
        calls.length = 0;
        w.RRHdrPreview.release(gl);
        assert.ok(calls.some(c => c[0] === 'deleteFramebuffer') && calls.some(c => c[0] === 'deleteProgram'));
        const second = w.RRHdrPreview.choose(gl, p.file('Fire-hdr'), 960, 540);
        assert.notEqual(second.renderer, first.renderer);
        assert.equal(w.RRHdrPreview.draw(gl, { renderer: null }, view, () => {}), false);
    } finally { p.done(); }
});

test('every animation preview loads through RRHdrPreview, which index.html loads first', () => {
    const html = read('index.html');
    const at = file => html.indexOf(`src="${file}"`);
    const surfaces = ['src/database/DatabaseAnimationEditor.js', 'src/database/AnimationPickerModal.js',
        'src/event/AnimationPicker.js', 'src/utils/AnimationPreviewLayer.js'];
    assert.ok(at('src/utils/HdrPreview.js') > 0);
    for (const file of surfaces) {
        assert.ok(at('src/utils/HdrPreview.js') < at(file), `HdrPreview.js loads before ${file}`);
        const source = read(file).replace(/function RR_loadEffekseerEffectFromFile[\s\S]*?\n}\n/, '');
        const direct = [...source.matchAll(/(?<![\w.])RR_loadEffekseerEffectFromFile\(/g)].length;
        assert.equal(direct, 0, `${file} loads effects through RRHdrPreview.load`);
        assert.match(source, /RRHdrPreview\.release\(/, `${file} frees its HDR targets with its context`);
    }
});
