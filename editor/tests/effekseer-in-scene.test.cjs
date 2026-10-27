/**
 * Screen Effekseer animations drawn inside PIXI's scene (Sprite_Animation.SceneLayer,
 * runtime/reactor_sprites.js): which animations it takes, where and how one is drawn into
 * whatever PIXI is rendering to, the state it leaves behind, HDR groups, context loss, and
 * the preload and update paths that feed it. GPU output is compared in the real game, not
 * here; these hold the decisions and the GL calls.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const runtime = path.resolve(__dirname, '../../runtime');
const sprites = fs.readFileSync(path.join(runtime, 'reactor_sprites.js'), 'utf8');
const managers = fs.readFileSync(path.join(runtime, 'reactor_managers.js'), 'utf8');

// A top-level statement of `source`, from `start` to the line that closes it.
function slice(source, start) {
    const from = source.indexOf(start);
    assert.ok(from >= 0, 'missing ' + start);
    return source.slice(from, source.indexOf('\n};\n', from) + 4);
}

// PIXI's projection for a target `w` x `h` (calculateProjection): textures are stored upside down.
function projection(w, h, flipY) {
    const sign = flipY ? 1 : -1, a = 2 / w, d = sign * 2 / h;
    return { a, b: 0, c: 0, d, tx: -1, ty: -sign };
}

function environment({ webGLVersion = 2, framebuffer = { fb: 'filter' }, flipped = true } = {}) {
    const calls = [], reads = [], drawn = [], captures = [], projections = [], loads = [];
    let lost = false, next = 1;
    const constants = new Map();
    const gl = new Proxy({
        isContextLost: () => lost,
        getFramebufferAttachmentParameter: () => gl.NONE,
        getParameter: name => { reads.push(name); return null; },
        isEnabled: name => { reads.push(name); return false; },
    }, { get(o, k) {
        if (k in o) return o[k];
        if (typeof k === 'string' && /^[A-Z0-9_]+$/.test(k)) { if (!constants.has(k)) constants.set(k, next++); return constants.get(k); }
        return (...args) => { calls.push([k, ...args]); return /^create/.test(k) ? { made: k } : undefined; };
    } });
    const resets = [];
    const system = name => ({ resetState() { resets.push(name); } });
    const renderer = {
        gl, resolution: 1,
        context: { webGLVersion },
        resetState() { resets.push('all'); },
        state: system('state'), shader: system('shader'), geometry: system('geometry'), buffer: system('buffer'),
        texture: Object.assign(system('texture'), { _boundTextures: [1, 2, 3] }),
        colorMask: { _colorMaskCache: 15 },
        stencil: { _stencilCache: { enabled: false } },
        renderTarget: {
            renderTarget: { uid: 7, pixelWidth: 800, pixelHeight: 600 },
            viewport: { x: 0, y: 0, width: 800, height: 600 },
            getGpuRenderTarget: () => ({ framebuffer })
        },
        globalUniforms: { globalUniformData: { projectionMatrix: projection(800, 600, flipped), offset: { x: 0, y: 0 } } }
    };
    const context = {
        init() {}, setRestorationOfStatesFlag() {}, _makeContextCurrent() {}, stopAll() { context.stopped = true; }, update() {},
        loadEffect(url, scale, onLoad, onError) { const e = { url, isLoaded: false, _update() {} }; loads.push({ url, onLoad, onError, effect: e }); return e; },
        captureBackground(...rect) { captures.push(rect); },
        setProjectionMatrix(m) { projections.push(Array.from(m)); },
        setCameraMatrix() {}, beginDraw() {}, endDraw() {},
        drawHandle(h) { drawn.push(h.name); }
    };
    let released = false;
    const errors = [];
    const c = {
        console: { warn() {}, info() {}, debug() {} },
        performance: { now: () => c.now }, now: 0,
        PIXI: {
            RenderContainer: class { constructor(o) { this.render = o.render; this.addBounds = o.addBounds; } toLocal(p) { return p; } },
            Point: class { constructor(x, y) { this.x = x; this.y = y; } }
        },
        effekseer: { createContext: () => context, releaseContext: () => { released = true; } },
        Graphics: {
            width: 800, height: 600, _app: { renderer }, _canvas: { listeners: {}, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); } },
            _reactorBeforeRender: new Set(), effekseer: { _makeContextCurrent() {} }
        },
        EffectManager: { makeUrl: n => 'effects/' + n + '.efkefc', onError: url => errors.push(url), PRELOAD_WAIT_MS: 8000 },
        ReactorHdrOverlay: null,
        Sprite_Animation: function() {}
    };
    c.globalThis = c;
    c.Sprite_Animation.effekseerViewportSide = h => h * 2;
    c.Sprite_Animation.effekseerProjection = () => Array.from({ length: 16 }, (_, i) => i + 1);
    c.Sprite_Animation._effekseerDrawWarned = false;
    vm.createContext(c);
    vm.runInContext(slice(sprites, 'Graphics.effekseerInScene = true;').split('\n')[0] + '\n' + slice(sprites, 'Sprite_Animation.SceneLayer = {'), c);
    const layer = c.Sprite_Animation.SceneLayer;
    let made = 0;
    function sprite(name = 'Fire', parent = 'p1') {
        const s = { name: 'sprite' + ++made, _targets: [{}], _mirror: false, parent, children: [],
            _handle: { name, exists: true, stop() { this.stopped = true; } },
            addChild(child) { this.children.push(child); },
            effekseerScreenPosition: () => ({ x: 400, y: 300 }) };
        return s;
    }
    return { c, gl, renderer, layer, context, calls, reads, drawn, captures, projections, loads, resets, errors, sprite,
        released: () => released, setLost: v => { lost = v; } };
}

test('the target mapping places a global point in the target, offset and upside down inside a filter', () => {
    const { layer } = environment();
    const root = layer.mapping(projection(1920, 1080, false), { x: 0, y: 0 }, { x: 0, y: 0, width: 1920, height: 1080 });
    assert.equal(root.flipped, false);
    assert.equal(root.ppu, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(root.project(0, 0))), { x: 0, y: 1080 }, 'the screen\'s top is the canvas\'s last GL row');
    assert.deepEqual(JSON.parse(JSON.stringify(root.project(960, 540))), { x: 960, y: 540 });
    const filter = layer.mapping(projection(800, 600, true), { x: 100, y: 50 }, { x: 0, y: 0, width: 800, height: 600 });
    assert.equal(filter.flipped, true);
    assert.deepEqual(JSON.parse(JSON.stringify(filter.project(100, 50))), { x: 0, y: 0 }, 'the filter\'s corner is its texture\'s first row');
    assert.deepEqual(JSON.parse(JSON.stringify(filter.project(500, 350))), { x: 400, y: 300 });
    const doubled = layer.mapping(projection(960, 540, false), { x: 0, y: 0 }, { x: 0, y: 0, width: 1920, height: 1080 });
    assert.equal(doubled.ppu, 2, 'a canvas at twice the game size draws two pixels a unit');
});

test('screen animations are taken where PIXI is WebGL2 and in-scene is on; anchored and WebGL1 ones are not', () => {
    const e = environment();
    const s = e.sprite();
    assert.equal(e.layer.adopt(s), true);
    assert.equal(s._effekseerInScene, true);
    assert.equal(s._effectContext, e.layer.entry);
    assert.equal(s._effectContext.context, e.context);
    assert.equal(s.children.length, 1, 'a RenderContainer draws it');
    assert.equal(e.c.Graphics._reactorBeforeRender.size, 1);
    e.c.Reactor3D = { _spawningAnchored: true };
    assert.equal(e.layer.adopt(e.sprite()), false, 'a 3D map anchors it in its world');
    delete e.c.Reactor3D;
    e.c.Graphics.effekseerInScene = false;
    assert.equal(e.layer.adopt(e.sprite()), false, 'switched off: the overlay draws it');
    e.c.Graphics.effekseerInScene = true;
    assert.equal(environment({ webGLVersion: 1 }).layer.adopt({}), false, 'a WebGL1 renderer keeps the overlay');
});

test('an animation draws into the target PIXI is rendering to, then leaves PIXI as it found it', () => {
    const e = environment();
    const s = e.sprite();
    e.layer.adopt(s);
    e.calls.length = 0;
    e.resets.length = 0;
    s.children[0].render(e.renderer);
    assert.deepEqual(e.reads, [], 'no GL state is read back: that waits on the GPU');
    assert.deepEqual(e.drawn, ['Fire']);
    const name = c => c[0];
    assert.equal(e.calls.find(c => name(c) === 'bindVertexArray')[1], null, 'PIXI\'s vertex array is unbound first');
    const attach = e.calls.filter(c => name(c) === 'framebufferRenderbuffer');
    assert.equal(attach.length, 2, 'a filter\'s texture is lent a depth buffer and given it back');
    assert.ok(attach[0][4] && attach[1][4] === null);
    assert.deepEqual(e.calls.find(c => name(c) === 'renderbufferStorage').slice(3), [800, 600], 'the size of the target');
    assert.equal(e.calls.filter(c => name(c) === 'clear').length, 1);
    // The viewport: a square twice the screen's height, on the target's pixels of the animation's place.
    assert.deepEqual(e.captures, [[-200, -300, 1200, 1200]], 'the scene beneath, for distortion, over the effect\'s own square');
    assert.deepEqual(e.calls.filter(c => name(c) === 'viewport')[0].slice(1), [-200, -300, 1200, 1200]);
    assert.deepEqual(e.projections[0].filter((_, i) => [1, 5, 9, 13].includes(i)), [-2, -6, -10, -14], 'drawn upside down into an upside-down target');
    const faces = e.calls.filter(c => name(c) === 'frontFace').map(c => c[1]);
    assert.deepEqual(faces, [e.gl.CW, e.gl.CCW], 'its winding flipped with it, then PIXI\'s again');
    const binds = e.calls.filter(c => name(c) === 'bindFramebuffer');
    assert.deepEqual(binds.at(-1)[2], { fb: 'filter' }, 'PIXI\'s framebuffer is bound again');
    assert.deepEqual(e.calls.filter(c => name(c) === 'viewport').at(-1).slice(1), [0, 0, 800, 600]);
    assert.deepEqual(e.resets.sort(), ['buffer', 'geometry', 'shader', 'state', 'texture'], 'only the caches a draw changes; not the render target');
    assert.deepEqual(Array.from(e.renderer.texture._boundTextures), [null, null, null]);

    // A second draw into the same target in the same frame shares the cleared depth buffer.
    e.calls.length = 0;
    s.children[0].render(e.renderer);
    assert.equal(e.calls.filter(c => name(c) === 'clear').length, 0);
    assert.equal(e.calls.filter(c => name(c) === 'renderbufferStorage').length, 0);
});

test('on the canvas no depth buffer is lent and the effect is drawn the right way up', () => {
    const e = environment({ framebuffer: null, flipped: false });
    const s = e.sprite();
    e.layer.adopt(s);
    e.calls.length = 0;
    s.children[0].render(e.renderer);
    assert.equal(e.calls.filter(c => c[0] === 'framebufferRenderbuffer').length, 0);
    assert.equal(e.calls.filter(c => c[0] === 'clear').length, 1, 'the canvas\'s own depth buffer, cleared once a frame');
    assert.deepEqual(e.projections[0].filter((_, i) => [1, 5, 9, 13].includes(i)), [2, 6, 10, 14]);
    assert.deepEqual(e.calls.filter(c => c[0] === 'frontFace').map(c => c[1]), [e.gl.CCW, e.gl.CCW]);
});

test('HDR animations of one grade in one container share a light pass, composited where they sit', () => {
    const e = environment();
    const passes = [], fallbacks = [];
    const R = { ensure: (w, h) => { passes.push(['ensure', w, h]); return true; }, begin: () => passes.push(['begin']), post: (s, sc, out) => passes.push(['post', s, out]) };
    e.c.ReactorHdrOverlay = { scene: { sidecar: s => ({ grade: s.grade }), renderer: () => R, settings: () => ({ bloom: 1 }), fallBack: s => fallbacks.push(s) } };
    const a = e.sprite('A'), b = e.sprite('B'), other = e.sprite('C');
    for (const s of [a, b, other]) { e.layer.adopt(s); s._hdrActive = true; s.grade = 'g'; }
    other.grade = 'h';
    e.layer.frame.push(a, b, other);
    a.children[0].render(e.renderer);
    b.children[0].render(e.renderer);
    assert.deepEqual(e.drawn, ['A', 'B'], 'both drawn by the first one\'s pass');
    assert.deepEqual(passes.map(p => p[0]), ['ensure', 'begin', 'post']);
    assert.deepEqual(passes[0].slice(1), [800, 600], 'the light at the game\'s own size');
    const post = passes[2];
    assert.deepEqual(post[1].framebuffer, { fb: 'filter' }, 'screened into the target PIXI is rendering to');
    assert.equal(post[1].bloomWidth, 800);
    assert.equal(post[1].pixelScale, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(post[2])), { x: 0, y: 0, w: 800, h: 600 });
    assert.deepEqual(e.captures, [], 'the light buffer has no scene to capture');
    other.children[0].render(e.renderer);
    assert.deepEqual(e.drawn, ['A', 'B', 'C'], 'another grade is a pass of its own');
    assert.deepEqual(fallbacks, []);

    // A pass that fails hands its animations to the twin.
    R.ensure = () => false;
    e.layer.drawn.clear();
    a.children[0].render(e.renderer);
    assert.deepEqual(fallbacks.map(s => s._handle.name), ['A', 'B']);
});

test('losing PIXI\'s context ends the scene\'s animations; the next ones wait for it to come back', () => {
    const e = environment();
    const lostScene = [];
    e.c.ReactorHdrOverlay = { scene: { lost: () => lostScene.push(1), restored() {} } };
    const s = e.sprite();
    e.layer.adopt(s);
    e.layer.load('Fire');
    s._playing = s._started = true;
    e.setLost(true);
    for (const f of e.c.Graphics._canvas.listeners.webglcontextlost) f();
    assert.equal(s._playing, false, 'a battle does not wait on a stranded handle');
    assert.equal(s._started, false);
    assert.equal(e.layer.context, null);
    assert.equal(e.layer.cache.size, 0);
    assert.equal(e.released(), true);
    assert.deepEqual(lostScene, [1]);
    assert.equal(e.layer.adopt(e.sprite()), false, 'while lost the overlay plays them');
    e.setLost(false);
    for (const f of e.c.Graphics._canvas.listeners.webglcontextrestored) f();
    assert.equal(e.layer.adopt(e.sprite()), true, 'and the scene again once it is back');
});

test('effects load once into the scene\'s context; a preload holds the scene until loaded or let go', () => {
    const e = environment();
    const first = e.layer.load('Fire');
    assert.equal(e.layer.load('Fire'), first);
    assert.equal(e.loads.length, 1);
    assert.equal(e.loads[0].url, 'effects/Fire.efkefc');
    assert.equal(e.layer.isReady(), false);
    first.isLoaded = true;
    assert.equal(e.layer.isReady(), true);
    assert.equal(e.layer.preload('Wind'), true);
    assert.equal(e.layer.preload('Wind'), false);
    assert.equal(e.layer.isReady(), false);
    e.c.now = 8001;
    assert.equal(e.layer.isReady(), true, 'a preload not loaded in PRELOAD_WAIT_MS is let go');
    e.loads[1].onError();
    assert.equal(e.layer.cache.has('Wind'), false);
    assert.deepEqual(e.errors, ['effects/Wind.efkefc']);
    // Uploads that arrive outside a draw mark PIXI for a reset before its next render.
    e.layer.dirty = false;
    first._update();
    assert.equal(e.layer.dirty, true);
    for (const hook of e.c.Graphics._reactorBeforeRender) hook();
    assert.equal(e.layer.dirty, false);
    assert.ok(e.resets.includes('all'));
});

test('the scene\'s context steps with the overlay\'s update, so battle slow motion reaches it', () => {
    const e = environment();
    e.layer.ensureContext();
    let self = null, frames = null;
    e.layer.update(function(n) { self = this; frames = n; });
    assert.equal(self, e.context);
    assert.equal(frames, undefined);
    e.layer.stopAll();
    assert.equal(e.context.stopped, true);
});

test('setup gives a screen animation to the scene layer, and _render records it instead of queueing it', () => {
    const loads = [], pending = [];
    const c = {
        Sprite_Animation: function() {},
        EffectManager: { load: n => { loads.push('overlay:' + n); return 'overlay:' + n; } },
        PIXI: { TextureSource: {} }
    };
    c.Sprite_Animation._pendingRenders = pending;
    c.Sprite_Animation.SceneLayer = { frame: [], adopt: s => c.adopt !== false && (s._effekseerInScene = true), load: n => 'scene:' + n };
    vm.createContext(c);
    vm.runInContext(slice(sprites, 'Sprite_Animation.prototype.setup = function(') + slice(sprites, 'Sprite_Animation.prototype._render = function('), c);
    const make = () => Object.assign(new c.Sprite_Animation(), { _maxTimingFrames: 0 });
    const animation = { effectName: 'Fire', soundTimings: [], flashTimings: [] };
    const s = make();
    s.setup([{}], animation, false, 0, null);
    assert.equal(s._effect, 'scene:Fire');
    s._handle = { exists: true };
    s._render({});
    assert.deepEqual(c.Sprite_Animation.SceneLayer.frame, [s]);
    assert.deepEqual(pending, [], 'never queued for the overlay, which would copy the scene for it');
    c.adopt = false;
    const t = make();
    t.setup([{}], animation, false, 0, null);
    assert.equal(t._effect, 'overlay:Fire', 'the overlay keeps what the layer does not take');
    assert.match(sprites, /globalThis\.ReactorHdrOverlay\?\.release\(this\);\s*Sprite_Animation\.SceneLayer\.release\(this\);/);
});

test('EffectManager preloads into the scene layer while screen animations play there', () => {
    const overlayLoads = [];
    const c = { Graphics: { effekseer: { loadEffect: url => { overlayLoads.push(url); return {}; } } }, Sprite_Animation: { SceneLayer: null }, EffectManager: function() {}, setTimeout() {} };
    vm.createContext(c);
    vm.runInContext(['EffectManager.sceneLayer = function(', 'EffectManager.preload = function(', 'EffectManager.isReady = function('].map(s => slice(managers, s)).join(''), c);
    c.EffectManager._cache = {};
    c.EffectManager.checkErrors = () => {};
    c.EffectManager.makeUrl = n => n;
    const preloaded = [];
    let ready = false;
    c.Sprite_Animation.SceneLayer = { active: () => true, preload: n => { preloaded.push(n); return true; }, isReady: () => ready };
    assert.equal(c.EffectManager.preload('Fire'), true);
    assert.deepEqual(preloaded, ['Fire']);
    assert.equal(c.EffectManager.isReady(), false, 'the scene waits for the layer\'s preloads');
    ready = true;
    assert.equal(c.EffectManager.isReady(), true);
    c.Sprite_Animation.SceneLayer.active = () => false;
    assert.equal(c.EffectManager.preload('Wind'), true);
    assert.deepEqual(overlayLoads, ['Wind'], 'off: the overlay\'s context loads it');
});
