/**
 * What a plugin may still call on the renderer, and on a display object.
 *
 * MZ's own `WindowLayer.render` masks each window with the stencil buffer, and
 * every plugin that reimplements that method — VisuMZ's CoreEngine among them —
 * reimplements those calls too. Two of them are v5/v6/v7 APIs that v8 removed
 * outright, and a TypeError thrown inside a layer's render takes the rest of
 * that layer with it: every window on it vanishes. On a title screen that is
 * the command list not appearing, with nothing on screen to say why.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const compat = fs.readFileSync(
    path.join(repoRoot, 'runtime', 'libs', 'pixi_compat.js'), 'utf8');

test('the framebuffer can still be asked for a stencil buffer', () => {
    // `renderer.framebuffer.forceStencil()`. v8 has no framebuffer system at
    // all, and needs none: it allocates a stencil buffer for its own masking.
    const augments = compat.slice(compat.indexOf('const augments = {'));
    const framebuffer = augments.slice(augments.indexOf('framebuffer: {'));
    const body = framebuffer.slice(0, framebuffer.indexOf('},'));
    assert.match(body, /forceStencil: noop/);
    assert.match(body, /blit: noop/);
    // And the ones that were already there stay.
    assert.match(body, /reset: noop/);
    assert.match(body, /bind: noop/);
});

test('nobody\'s WindowLayer render runs on v8', () => {
    /*
     * A WindowLayer's `render` masks each window with raw GL stencil calls,
     * flushing a global batcher between them. v8 has no global batcher — each
     * render pipe defers its own — so those calls never interleave with the
     * draws they were meant to bracket, and the stencil state is simply left
     * switched on across everything v8 draws afterwards.
     *
     * Reactor's own WindowLayer returns early on v8 for exactly that reason. A
     * plugin that replaces the method does not know to: VisuMZ's CoreEngine
     * replaces it, and used to fail early with a TypeError — ugly, but harmless,
     * because the throw was caught and the rest of the stencil work never
     * happened. Shimming the missing calls so it could run to completion turned
     * a harmless failure into a silent one: the whole dance then took effect and
     * every window it was meant to reveal was rejected. The title screen's
     * command list was simply not there.
     *
     * So the rule is the class, not the call.
     */
    assert.match(compat, /&& !isWindowLayerClass\(orig\);/,
        'the bridge refuses to call it');
    const fn = compat.slice(compat.indexOf('function isWindowLayerClass(klass)'));
    const body = fn.slice(0, fn.indexOf('\n    }'));
    assert.match(body, /klass === WindowLayer/, 'the class itself');
    assert.match(body, /walk\.name === "WindowLayer"/, 'and anything deriving from it');

    // Reactor's own says the same thing in its own file, and the two must not
    // drift apart into one skipping and the other not.
    const core = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const render = core.slice(core.indexOf('WindowLayer.prototype.render = function render'));
    assert.match(render.slice(0, render.indexOf('\n};')),
        /if \(PIXI\.TextureSource\) \{\s*\n\s*return;/);
});

test('a display object is not given a render method it never had', () => {
    // Tried, and it is what caused the regression above: a no-op `render` let
    // legacy stencil walks run to completion instead of failing at the first
    // call, so their GL side effects landed on v8's pipeline.
    assert.doesNotMatch(compat, /PIXI\.Container\.prototype\.render = function/);
});

test('tilemap preparation runs once during update, never during PIXI render setup', () => {
    const hooks = compat.slice(
        compat.indexOf('const classesWithUpdateTransform = ['),
        compat.indexOf('];', compat.indexOf('const classesWithUpdateTransform = [')) + 2);
    assert.doesNotMatch(hooks, /"Tilemap"/,
        'render-group preparation cannot rerun plugin tile-layer positioning');
    assert.match(hooks, /"TilingSprite"/);
    assert.match(hooks, /"Window"/);

    const core = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const start = core.indexOf('Tilemap.prototype.update = function()');
    const body = core.slice(start, core.indexOf('\n};', start));
    assert.ok(body.indexOf('this._prepareV8Frame();') >= 0,
        'the update tail drives the shared frame preparation');

    // The preparation itself keeps the ordering this test has always
    // guarded: the whole plugin-wrapped transform chain runs before any tile
    // mesh is published. (Its frame stamp lets the Tilemap onRender fallback
    // no-op when update already prepared this frame — see
    // tilemap-update-replacement.test.cjs.)
    const prepareAt = core.indexOf('Tilemap.prototype._prepareV8Frame = function()');
    const prepare = core.slice(prepareAt, core.indexOf('\n};', prepareAt));
    assert.ok(prepare.indexOf('this.updateTransform();') >= 0);
    assert.ok(prepare.indexOf('this.updateTransform();') < prepare.indexOf('this._syncV8TileLayers();'),
        'all plugin wrappers finish before every tile mesh is published');
});

test('a texture source with no picture is not uploaded', () => {
    /*
     * MZ frees a Bitmap's canvas once it has an image to draw from, and a
     * plugin calling `update()` afterwards asks v8 to send pixels it no longer
     * holds: `texSubImage2D` is handed no canvas, WebGL raises INVALID_VALUE,
     * and it repeats every frame for the life of the map.
     *
     * The guard below it would otherwise *cause* that upload — it resizes a
     * source whose dimensions look wrong, and resizing emits.
     */
    const guard = compat.slice(compat.indexOf('renderer.texture.onSourceUpdate = function(source)'));
    const body = guard.slice(0, guard.indexOf('return originalOnSourceUpdate'));
    assert.match(body, /if \(source && source\.uploadMethodId === "image"\) \{/);
    // Not merely a missing resource: a canvas MZ has finished with is detached
    // and measures zero, and WebGL rejects that with the same "no canvas".
    assert.match(body, /const bare = !res\s*\n\s*\|\| \(!res\.width && !res\.height/);
    assert.match(body, /if \(bare\) return;/);
    // Declined before the dimension guard, which is what would trigger it.
    assert.ok(body.indexOf('uploadMethodId') < body.indexOf('source.resize('),
        'and declined before anything resizes');
    // Only the image path: a render target has no resource either and must
    // still be handled normally.
    assert.match(body, /uploadMethodId === "image"/);
});

test('effekseer effects sample the real scene as their background', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const repoRoot = path.resolve(__dirname, '..', '..');
    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    // Distortion and darkening layers sample a captured background; on the
    // transparent overlay canvas that background was empty, so those layers
    // drew solid black slabs over the map — worst on 3D maps, where the
    // scene lives on a canvas Effekseer never saw. The scene is blitted into
    // the overlay, captured, and cleared before effects draw.
    assert.match(core, /Graphics\.blitSceneBehindEffects = function/);
    assert.match(core, /getElementById\("reactor3dCanvas"\)/, 'the 3D canvas is part of the background');
    // The capture covers the effect's own square viewport — Effekseer maps
    // background UVs across the viewport, so a canvas-sized capture reads
    // back misaligned scenery — and it happens per effect, before that
    // effect's draw, then the blitted scene is cleared off the overlay.
    assert.match(sprites, /efxContext\.captureBackground\(rect\.x, rect\.y, rect\.side, rect\.side\)/);
    assert.match(sprites, /effekseerViewportRect = function/);
    const capture = sprites.indexOf('efxContext.captureBackground');
    const draw = sprites.indexOf('Graphics.effekseer.beginDraw();', capture);
    assert.ok(capture > 0 && draw > capture, 'capture precedes the effect draw');
});

test('setting blur on a BlurFilter maps to strength with no deprecation notice', () => {
    // VisuMZ_2_PictureEffects assigns `.blur` every frame; v8 kept the
    // accessor only as a deprecation wrapper that prints a console warning.
    // The compat block replaces it with a silent passthrough to `.strength`.
    const vm = require('node:vm');
    const start = compat.indexOf('if (PIXI.TextureSource && typeof PIXI.BlurFilter === "function")');
    assert.ok(start >= 0);
    const end = compat.indexOf('// ----', start);
    assert.ok(end > start);
    const block = compat.slice(start, end);

    let deprecationNotices = 0;
    class MockBlurFilter {
        constructor(options) { this.options = options; }
        get strength() { return this._strength; }
        set strength(value) { this._strength = value; }
        get blur() { deprecationNotices++; return this._strength; }
        set blur(value) { deprecationNotices++; this._strength = value; }
    }
    const context = {
        PIXI: { TextureSource: function() {}, BlurFilter: MockBlurFilter, filters: {} },
        console
    };
    vm.runInNewContext(block, context);

    // Positional v5-style construction converts to the options object.
    const filter = new context.PIXI.BlurFilter(8, 4);
    assert.equal(filter.options.strength, 8);
    assert.equal(filter.options.quality, 4);
    // The blur accessor now passes straight through to strength.
    filter.blur = 5;
    assert.equal(filter.strength, 5);
    assert.equal(filter.blur, 5);
    assert.equal(deprecationNotices, 0, 'the deprecation accessor never runs');
});
