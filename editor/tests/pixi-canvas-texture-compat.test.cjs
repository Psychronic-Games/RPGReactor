const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workspaceRoot = path.resolve(__dirname, '..', '..');

// A plugin that renders somewhere else and hands the result to PIXI as a canvas
// -- mz3d's babylon view, a procedural texture, a lightmap -- depends on two
// v5/v6/v7 behaviours that v8 dropped, both silently:
//
//   1. Texture.update() pushed the source to the GPU. v8's only recomputes UVs.
//   2. A Sprite always tracked its texture's "update". v8 subscribes only when
//      the texture is flagged `dynamic`, which is a v8 concept a plugin written
//      for MZ cannot know to set.
//
// Losing (1) means the picture never arrives. Losing (2) means the sprite keeps
// whatever size the canvas was when the texture was built -- 300x150 for a bare
// document.createElement -- so the picture arrives into a corner of the screen.
// Neither throws. These stubs are shaped like v8 so both contracts are checked
// against the real pixi_compat.js.
function loadCompat() {
    const source = fs.readFileSync(
        path.join(workspaceRoot, 'runtime', 'libs', 'pixi_compat.js'), 'utf8');

    const uploads = [];

    class EventEmitter {
        constructor() { this._handlers = {}; }
        on(name, fn, ctx) {
            (this._handlers[name] || (this._handlers[name] = [])).push({ fn, ctx });
        }
        off(name, fn, ctx) {
            const list = this._handlers[name];
            if (!list) return;
            this._handlers[name] = list.filter(h => h.fn !== fn || h.ctx !== ctx);
        }
        emit(name, ...args) {
            for (const h of (this._handlers[name] || []).slice()) h.fn.call(h.ctx, ...args);
        }
    }

    class TextureSource extends EventEmitter {
        constructor(options = {}) {
            super();
            this.resource = options.resource || null;
            this.destroyed = false;
            this._resolution = 1;
            this.width = options.width || (this.resource ? this.resource.width : 1);
            this.height = options.height || (this.resource ? this.resource.height : 1);
            this.pixelWidth = this.width;
            this.pixelHeight = this.height;
        }
        get resourceWidth() { return this.resource ? this.resource.width : 0; }
        get resourceHeight() { return this.resource ? this.resource.height : 0; }
        // v8: reads the element's CURRENT size back off the resource, then
        // either resizes (emitting "resize") or emits "update", which is what
        // the GL texture system listens to in order to re-upload.
        update() {
            if (this.resource) {
                const didResize = this.resize(this.resourceWidth, this.resourceHeight);
                if (didResize) return;
            }
            uploads.push(this);
            this.emit('update', this);
        }
        resize(width, height) {
            if (this.width === width && this.height === height) return false;
            this.width = this.pixelWidth = width;
            this.height = this.pixelHeight = height;
            uploads.push(this);
            this.emit('resize', this);
            return true;
        }
        destroy() { this.destroyed = true; }
    }
    class CanvasSource extends TextureSource {}

    // v8's Texture: update() touches UVs and the frame, never the source.
    class Texture extends EventEmitter {
        constructor(options = {}) {
            super();
            this.dynamic = options.dynamic || false;
            this.noFrame = !options.frame;
            this.frame = { width: 0, height: 0 };
            this.uvUpdates = 0;
            this.source = options.source || new TextureSource();
            this.source.on('resize', this.update, this);
            if (this.noFrame && this.source) {
                this.frame.width = this.source.width;
                this.frame.height = this.source.height;
            }
        }
        get width() { return this.frame.width; }
        get height() { return this.frame.height; }
        update() {
            if (this.noFrame) {
                this.frame.width = this.source.width;
                this.frame.height = this.source.height;
            }
            this.uvUpdates++;
            this.emit('update', this);
        }
        static from(resource) {
            return new Texture({ source: new CanvasSource({ resource }) });
        }
    }

    // v8's Sprite: only dynamic textures get an "update" subscription.
    class Sprite {
        constructor(texture) {
            this.quadWidth = 0;
            this.quadHeight = 0;
            this.texture = texture;
        }
        set texture(value) {
            const current = this._texture;
            if (current === value) return;
            if (current && current.dynamic) current.off('update', this.onViewUpdate, this);
            if (value && value.dynamic) value.on('update', this.onViewUpdate, this);
            this._texture = value;
            this.onViewUpdate();
        }
        get texture() { return this._texture; }
        // Stands in for the geometry rebuild: the quad the sprite actually
        // draws takes its size from the texture at the moment it is rebuilt.
        onViewUpdate() {
            this.quadWidth = this._texture ? this._texture.width : 0;
            this.quadHeight = this._texture ? this._texture.height : 0;
        }
    }

    class HTMLCanvasElement {
        constructor(width = 300, height = 150) {
            this.width = width;
            this.height = height;
        }
        getContext() { return {}; }
    }
    class HTMLVideoElement {}

    const PIXI = {
        Texture,
        TextureSource,
        CanvasSource,
        ImageSource: TextureSource,
        Sprite,
        Container: class Container {},
        Rectangle: class Rectangle {},
        AbstractRenderer: class AbstractRenderer { render() {} },
        settings: {},
    };

    const sandbox = {
        PIXI,
        HTMLCanvasElement,
        HTMLVideoElement,
        console: { log() {}, warn() {}, error() {}, info() {} },
        document: {
            createElement: () => new HTMLCanvasElement()
        },
        navigator: { userAgent: 'test' },
        performance: { now: () => 0 },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.window.PIXI = PIXI;

    try {
        vm.runInNewContext(source, sandbox);
    } catch (error) {
        // The compat file touches many optional PIXI surfaces that this stub
        // does not model; the parts under test install before anything throws.
        if (!PIXI.Texture.__videoFromWrapped) throw error;
    }

    return { PIXI, uploads, HTMLCanvasElement };
}

test('Texture.update() pushes the canvas to the GPU, as it did before v8', () => {
    const { PIXI, uploads, HTMLCanvasElement } = loadCompat();
    const canvas = new HTMLCanvasElement(816, 624);
    const texture = PIXI.Texture.from(canvas);

    uploads.length = 0;
    texture.update();

    assert.equal(uploads.length, 1, 'the source is uploaded, not just the UVs recomputed');
    assert.ok(texture.uvUpdates > 0, "v8's own UV work still happens");
});

test('a texture built before its canvas is sized catches up', () => {
    const { PIXI, HTMLCanvasElement } = loadCompat();
    // mz3d's order: make the canvas, wrap it, THEN size it to the game.
    const canvas = new HTMLCanvasElement();
    const texture = PIXI.Texture.from(canvas);
    assert.equal(texture.width, 300, 'the HTML default, which is what it measured');

    canvas.width = 816;
    canvas.height = 624;
    texture.update();

    assert.equal(texture.width, 816);
    assert.equal(texture.height, 624);
});

test('a sprite follows the canvas it was given, rather than freezing at 300x150', () => {
    const { PIXI, HTMLCanvasElement } = loadCompat();
    const canvas = new HTMLCanvasElement();
    const texture = PIXI.Texture.from(canvas);
    const sprite = new PIXI.Sprite(texture);
    assert.equal(sprite.quadWidth, 300);

    canvas.width = 816;
    canvas.height = 624;
    texture.update();

    assert.equal(sprite.quadWidth, 816, 'the drawn quad grew with the canvas');
    assert.equal(sprite.quadHeight, 624);
});

test('Texture.update() does not recurse through the source resize it triggers', () => {
    const { PIXI, HTMLCanvasElement } = loadCompat();
    // v8's Texture listens to its source's "resize" with update() itself, and
    // the source update we add resizes, so the second pass lands back here.
    const canvas = new HTMLCanvasElement();
    const texture = PIXI.Texture.from(canvas);
    canvas.width = 1920;
    canvas.height = 1080;

    let depth = 0;
    let maxDepth = 0;
    const patched = texture.update;
    texture.update = function() {
        maxDepth = Math.max(maxDepth, ++depth);
        try { return patched.apply(this, arguments); } finally { depth--; }
    };

    texture.update();

    assert.ok(maxDepth <= 2, `update nested ${maxDepth} deep`);
    assert.equal(texture.width, 1920);
});

test('the prototype is left alone, so PIXI resizes its own view', () => {
    const { PIXI, HTMLCanvasElement } = loadCompat();
    // The renderer's view is a Texture over a CanvasSource, and v8 resizes it
    // by calling source.resize() -- which emits "resize", and therefore calls
    // Texture.update(), BEFORE the canvas element has been resized to match.
    // A prototype-wide version of the fix reads the stale canvas at that
    // moment and puts the source straight back, so Graphics.resize does
    // nothing and the game draws into a corner of its own canvas. Only
    // textures Reactor hands out may carry the compat behaviour.
    assert.equal(PIXI.Texture.prototype.update.__reactorUploadsSource, undefined);

    const canvas = new HTMLCanvasElement(800, 600);
    const view = new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: canvas }) });
    // What ViewSystem.resize does, with the canvas still at its old size --
    // CanvasSource.resize emits before it calls resizeCanvas().
    view.source.resize(1280, 720);

    assert.equal(view.source.width, 1280, 'the resize stuck');
    assert.equal(view.source.height, 720);
});

test('an image-backed texture is left alone', () => {
    const { PIXI } = loadCompat();
    // v8 flags textures dynamic deliberately; only a canvas the caller can draw
    // into earns the flag here. A texture from anything else keeps v8's default.
    const texture = PIXI.Texture.from({ width: 32, height: 32 });
    assert.equal(texture.dynamic, false);
    assert.equal(texture.__reactorUploadsSource, undefined);
});

test('re-assigning the texture a sprite already has touches no listeners', () => {
    const { PIXI, HTMLCanvasElement } = loadCompat();
    // Every canvas texture Reactor hands out is dynamic, and the compat
    // texture setter re-wires an "update" listener for dynamic textures. It
    // used to do that BEFORE v8's own same-texture early return, so a pool of
    // sprites sharing one canvas texture, re-dressed every frame, paid an
    // off() that walks every listener on that texture per assignment --
    // ~105 us each with ~3000 sprites in a real game, ~300 ms a frame.
    assert.ok(PIXI.Sprite.prototype.__videoCompatTexturePatched, 'the setter wrapper is installed');
    const texture = PIXI.Texture.from(new HTMLCanvasElement(16, 16));
    assert.equal(texture.dynamic, true);
    const sprites = Array.from({ length: 50 }, () => new PIXI.Sprite(texture));
    const listenerCount = () => (texture._handlers.update || []).length;
    const before = listenerCount();

    let rewires = 0;
    const off = texture.off, on = texture.on;
    texture.off = function() { rewires++; return off.apply(this, arguments); };
    texture.on = function() { rewires++; return on.apply(this, arguments); };
    for (const sprite of sprites) sprite.texture = texture;

    assert.equal(rewires, 0, 'a same-value assignment is free');
    assert.equal(listenerCount(), before);

    // A real change still wires the sprite to its new texture's resizes
    texture.off = off;
    texture.on = on;
    const canvas = new HTMLCanvasElement(32, 32);
    const other = PIXI.Texture.from(canvas);
    sprites[0].texture = other;
    assert.equal(sprites[0].texture, other);
    canvas.width = 64;
    canvas.height = 48;
    other.update();
    assert.equal(sprites[0].quadWidth, 64, 'the sprite follows its new canvas');
    assert.equal(sprites[0].quadHeight, 48);
});
