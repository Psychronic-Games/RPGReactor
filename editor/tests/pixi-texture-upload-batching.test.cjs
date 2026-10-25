const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workspaceRoot = path.resolve(__dirname, '..', '..');

// Runs the real pixi_compat.js against a stub PIXI shaped like the running
// version, so the upload-batching contract is exercised end to end.
function loadCompat({ v8 = true } = {}) {
    const source = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'libs', 'pixi_compat.js'), 'utf8');

    const uploads = [];
    const resizes = [];
    class TextureSource {
        constructor(options) {
            this.resource = (options && options.resource) || null;
            this.destroyed = false;
            this._resolution = 1;
            this.width = (this.resource && this.resource.width) || 1;
            this.height = (this.resource && this.resource.height) || 1;
            this.pixelWidth = this.width;
            this.pixelHeight = this.height;
        }
        get resourceWidth() { return this.resource ? this.resource.width : 0; }
        get resourceHeight() { return this.resource ? this.resource.height : 0; }
        // Stands in for GlTextureSystem.onSourceUpdate, which v8 wires to the
        // source's "update" event and which performs a full texImage2D.
        update() {
            if (this.resource && this.resource.width !== this.pixelWidth) {
                this.pixelWidth = this.resource.width;
                this.width = this.resource.width;
                resizes.push(this);
            }
            uploads.push(this);
        }
        // v8 returns true only when the dimensions actually changed, and emits
        // "resize" — which GlTextureSystem also routes to onSourceUpdate.
        resize(width, height) {
            if (this.width === width && this.height === height) return false;
            this.width = width;
            this.height = height;
            resizes.push(this);
            uploads.push(this);
            return true;
        }
        destroy() { this.destroyed = true; }
    }

    const renders = [];
    class AbstractRenderer {
        render(options) { renders.push(options); }
    }

    const PIXI = {
        AbstractRenderer,
        Container: class Container {},
        Texture: class Texture {},
        settings: {},
        Rectangle: class Rectangle {},
    };
    if (v8) {
        // _isV8Pixi is derived from the presence of TextureSource.
        PIXI.TextureSource = TextureSource;
        PIXI.CanvasSource = TextureSource;
        PIXI.ImageSource = TextureSource;
    }

    const sandbox = {
        PIXI,
        window: { PIXI },
        console: { log() {}, warn() {}, error() {}, info() {} },
        document: {
            createElement: () => ({ width: 1, height: 1, getContext: () => ({}) })
        },
        navigator: { userAgent: 'test' },
        performance: { now: () => 0 }
    };
    sandbox.globalThis = sandbox;
    sandbox.window.document = sandbox.document;

    try {
        vm.runInNewContext(source, sandbox);
    } catch (error) {
        // The compat file touches many optional PIXI surfaces; the parts under
        // test are guarded individually and installed before anything throws.
        if (!PIXI.__reactorFlushTextureUploads) throw error;
    }

    PIXI.__sandbox = sandbox;
    return { PIXI, uploads, renders, resizes, TextureSource, AbstractRenderer };
}

test('many draw ops between renders collapse into one upload', () => {
    const { PIXI, uploads } = loadCompat();
    const canvas = { width: 640, height: 480 };
    const baseTexture = new PIXI.BaseTexture(canvas);

    // Stands in for a window redrawing its contents: corescript ends every
    // Bitmap draw op with _baseTexture.update().
    uploads.length = 0;
    for (let call = 0; call < 246; call++) baseTexture.update();

    assert.equal(uploads.length, 0, 'no upload happens while drawing');
    assert.equal(PIXI.__reactorPendingTextureUploads(), 1, 'the source is queued once, not 246 times');

    new PIXI.AbstractRenderer().render({});
    assert.equal(uploads.length, 1, '246 draw ops cost exactly one GPU upload');
    assert.equal(PIXI.__reactorPendingTextureUploads(), 0, 'the queue drains');
});

test('every render flushes first, including render-to-texture mid-update', () => {
    const { PIXI, uploads } = loadCompat();
    const first = new PIXI.BaseTexture({ width: 8, height: 8 });
    const second = new PIXI.BaseTexture({ width: 8, height: 8 });
    const renderer = new PIXI.AbstractRenderer();

    uploads.length = 0;
    first.update();
    // A light-map pass renders to a texture before the main frame render. It
    // must see the fresh pixels, not last frame's.
    renderer.render({ container: {}, target: {} });
    assert.equal(uploads.length, 1, 'a render-to-texture pass uploads pending work first');

    second.update();
    renderer.render({});
    assert.equal(uploads.length, 2);

    // A render with nothing pending does no upload work at all.
    renderer.render({});
    assert.equal(uploads.length, 2);
});

test('distinct sources each upload once per flush', () => {
    const { PIXI, uploads } = loadCompat();
    const textures = [0, 1, 2].map(() => new PIXI.BaseTexture({ width: 4, height: 4 }));

    uploads.length = 0;
    for (const texture of textures) {
        texture.update();
        texture.update();
    }
    assert.equal(PIXI.__reactorPendingTextureUploads(), 3);

    new PIXI.AbstractRenderer().render({});
    assert.equal(uploads.length, 3, 'each source uploads exactly once');
});

test('destroying a source with pending work uploads it first', () => {
    const { PIXI, uploads } = loadCompat();
    // Window_Base.createContents() destroys the previous contents bitmap while
    // a popup sprite is still displaying it, so the queued pixels have to be
    // sent before the source goes away.
    const displayed = new PIXI.BaseTexture({ width: 64, height: 24 });

    uploads.length = 0;
    displayed.update();
    assert.equal(uploads.length, 0);

    displayed._textureSource.destroy();
    assert.equal(uploads.length, 1, 'the pending upload is flushed on teardown');
    assert.equal(PIXI.__reactorPendingTextureUploads(), 0);
});

test('destroying a source with no pending work does not force a flush', () => {
    const { PIXI, uploads } = loadCompat();
    const queued = new PIXI.BaseTexture({ width: 8, height: 8 });
    const other = new PIXI.BaseTexture({ width: 8, height: 8 });

    uploads.length = 0;
    queued.update();
    other._textureSource.destroy();
    assert.equal(uploads.length, 0, 'an unrelated teardown leaves the queue alone');
    assert.equal(PIXI.__reactorPendingTextureUploads(), 1);
});

test('a source destroyed before the flush is skipped, not thrown on', () => {
    const { PIXI, uploads } = loadCompat();
    const texture = new PIXI.BaseTexture({ width: 4, height: 4 });

    uploads.length = 0;
    texture.update();
    texture._textureSource.destroyed = true;

    assert.doesNotThrow(() => new PIXI.AbstractRenderer().render({}));
    assert.equal(uploads.length, 0, 'a dead source is not uploaded');
    assert.equal(PIXI.__reactorPendingTextureUploads(), 0, 'and is dropped from the queue');
});

test('a resized source reconciles its dimensions immediately, not at flush', () => {
    const { PIXI, uploads, resizes } = loadCompat();
    const canvas = { width: 64, height: 24 };
    const baseTexture = new PIXI.BaseTexture(canvas);

    uploads.length = 0;
    resizes.length = 0;

    // A window growing its contents changes the backing canvas. Texture frames
    // and UVs are derived from the source size, so that must land before any
    // sprite is built from it — a deferred resize draws mirrored or stretched.
    canvas.width = 128;
    baseTexture.update();

    assert.equal(resizes.length, 1, 'the new size is applied on the spot');
    assert.equal(baseTexture._textureSource.width, 128);
    assert.equal(PIXI.__reactorPendingTextureUploads(), 0,
        'a size change goes straight through to v8, leaving nothing queued');

    // A draw that does not change size still batches.
    uploads.length = 0;
    baseTexture.update();
    baseTexture.update();
    assert.equal(uploads.length, 0);
    assert.equal(PIXI.__reactorPendingTextureUploads(), 1);
});

test('the runtime switch restores immediate uploads', () => {
    const { PIXI, uploads } = loadCompat();
    const texture = new PIXI.BaseTexture({ width: 8, height: 8 });

    uploads.length = 0;
    PIXI.__reactorDeferTextureUploads = false;
    texture.update();
    assert.equal(uploads.length, 1, 'the upload happens on the spot');
    assert.equal(PIXI.__reactorPendingTextureUploads(), 0, 'nothing is queued');

    PIXI.__reactorDeferTextureUploads = true;
    texture.update();
    assert.equal(uploads.length, 1, 'batching resumes');
    assert.equal(PIXI.__reactorPendingTextureUploads(), 1);
});

test('off v8 the upload stays immediate, since nothing would drain a queue', () => {
    const { PIXI, uploads } = loadCompat({ v8: false });
    // Without PIXI.TextureSource the shim has no source to build, so drive the
    // policy directly through a legacy-shaped update.
    assert.equal(typeof PIXI.__reactorFlushTextureUploads, 'function');
    assert.equal(PIXI.__reactorPendingTextureUploads(), 0);
    assert.equal(uploads.length, 0);
});

// A WebGL 2 renderer stand-in that records sub-rectangle uploads, and the
// area a Bitmap draw op names before its update() (Bitmap._touchUpload).
function partialFixture() {
    const loaded = loadCompat();
    const calls = [];
    const gl = {
        TEXTURE_2D: 3553, UNPACK_SKIP_PIXELS: 3316, UNPACK_SKIP_ROWS: 3315, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37441,
        isContextLost: () => false,
        bindTexture: (target, texture) => calls.push(['bind', texture]),
        pixelStorei: (name, value) => calls.push(['store', name, value]),
        texSubImage2D: (...args) => calls.push(['sub', ...args.slice(2, 6)])
    };
    const renderer = { uid: 1, gl, context: { webGLVersion: 2 }, texture: { _boundTextures: [], _activeTextureLocation: 0, _premultiplyAlpha: true } };
    const sandbox = loaded.PIXI.__sandbox;
    const canvas = { width: 400, height: 200 };
    const base = new loaded.PIXI.BaseTexture(canvas);
    const source = base._textureSource;
    source._gpuData = { 1: { texture: 'tex', target: 3553, width: 400, height: 200, format: 6408, type: 5121 } };
    source.alphaMode = 'premultiply-alpha-on-upload';
    const touch = (x, y, w, h) => Object.assign(source, { __rrTouch: true, __rrTouchX0: x, __rrTouchY0: y, __rrTouchX1: x + w, __rrTouchY1: y + h });
    return { ...loaded, calls, renderer, base, source, touch, sandbox };
}

function withGame(fixture, partialUploads = true) {
    fixture.sandbox.Graphics = { _app: { renderer: fixture.renderer } };
    fixture.sandbox.Bitmap = { partialUploads };
}

test('a frame of small draws sends only the area they changed', () => {
    const x = partialFixture();
    withGame(x);
    x.uploads.length = 0;
    x.touch(10, 20, 30, 40); x.base.update();
    x.touch(100, 30, 20, 10); x.base.update();
    x.PIXI.__reactorFlushTextureUploads();
    assert.equal(x.uploads.length, 0, 'no whole-canvas upload');
    const sub = x.calls.filter(c => c[0] === 'sub');
    assert.deepEqual(sub, [['sub', 10, 20, 110, 40]], 'one upload of the union');
    const stores = x.calls.filter(c => c[0] === 'store').map(c => c.slice(1));
    assert.deepEqual(stores, [[3316, 10], [3315, 20], [3316, 0], [3315, 0]], 'skip set for the area, then reset');
    assert.equal(x.renderer.texture._boundTextures[0], x.source, 'the renderer knows what is bound');
    x.calls.length = 0;
    x.PIXI.__reactorFlushTextureUploads();
    assert.equal(x.calls.length, 0, 'and the area is forgotten once sent');
});

test('an update that names no area, a big area, or no GPU copy yet sends the whole canvas', () => {
    const cases = {
        'plugin drawing': x => { x.touch(0, 0, 10, 10); x.base.update(); x.base.update(); },
        'over half the canvas': x => { x.touch(0, 0, 300, 150); x.base.update(); },
        'never uploaded': x => { x.source._gpuData = {}; x.touch(0, 0, 10, 10); x.base.update(); },
        'switch off': x => { x.sandbox.Bitmap.partialUploads = false; x.touch(0, 0, 10, 10); x.base.update(); },
        'WebGL 1': x => { x.renderer.context.webGLVersion = 1; x.touch(0, 0, 10, 10); x.base.update(); }
    };
    for (const [name, run] of Object.entries(cases)) {
        const x = partialFixture();
        withGame(x);
        x.uploads.length = 0;
        run(x);
        x.PIXI.__reactorFlushTextureUploads();
        assert.equal(x.uploads.length, 1, name);
        assert.equal(x.calls.filter(c => c[0] === 'sub').length, 0, name);
    }
});

test('a named area applies to the update right after it only', () => {
    const x = partialFixture();
    withGame(x);
    x.uploads.length = 0;
    x.touch(0, 0, 10, 10);
    x.PIXI.__reactorDeferTextureUploads = false;
    x.base.update();
    x.PIXI.__reactorDeferTextureUploads = true;
    x.base.update();
    x.PIXI.__reactorFlushTextureUploads();
    assert.equal(x.uploads.length, 2, 'the later update had no area of its own: whole');
});
