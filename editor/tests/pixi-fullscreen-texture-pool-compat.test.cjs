/**
 * v5 gave a full-screen filter a texture of exactly the screen size, so
 * vTextureCoord spanned 0..1; hand-written MV/MZ shaders that hardcode 0.5 as
 * the centre need that. PIXI 8.20 rounded every pooled texture up to a power
 * of two and the compat layer wrapped the pool; since 8.21 the pool sizes to
 * the screens registered with it, and the wrap (which read `_texturePool` and
 * `_poolKeyHash`, fields 8.22 does not have) is gone. These run the bundled
 * PIXI's own pool, with the compat layer loaded over it.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const native = require('pixi.js');

const repoRoot = path.resolve(__dirname, '..', '..');
const compat = fs.readFileSync(
    path.join(repoRoot, 'runtime', 'libs', 'pixi_compat.js'), 'utf8');

const SCREEN = 990001;

function load() {
    const PIXI = { ...native };
    const nativeGetOptimalTexture = PIXI.TexturePool.getOptimalTexture;
    vm.runInNewContext(compat, {
        PIXI, Float32Array, Uint8Array, ArrayBuffer,
        console: { log() {}, warn() {}, error() {} },
        window: { location: { search: '' }, Graphics: { _canvas: { width: 816, height: 624 } } }
    });
    return { pool: PIXI.TexturePool, nativeGetOptimalTexture };
}

const size = texture => [texture.source.pixelWidth, texture.source.pixelHeight];

test('the compat layer leaves the pool alone and reads none of the fields 8.22 dropped', () => {
    const { pool, nativeGetOptimalTexture } = load();
    assert.equal(pool.getOptimalTexture, nativeGetOptimalTexture);
    assert.equal(Object.hasOwn(pool, 'getOptimalTexture'), false);
    assert.equal('_texturePool' in pool, false);
    assert.equal('_poolKeyHash' in pool, false);
    assert.doesNotMatch(compat, /_texturePool|_poolKeyHash/);
});

test('a request matching the registered screen gets an exactly sized texture and returns to the pool', t => {
    const { pool } = load();
    pool.setScreenSize(SCREEN, 816, 624);
    t.after(() => pool.removeScreen(SCREEN));
    const full = pool.getOptimalTexture({ width: 816, height: 624, resolution: 1, antialias: false });
    assert.deepEqual(size(full), [816, 624]);
    assert.deepEqual([full.frame.width, full.frame.height], [816, 624]);
    const half = pool.getOptimalTexture({ width: 408, height: 312, resolution: 1, antialias: false });
    assert.deepEqual(size(half), [512, 512], 'a smaller request keeps the smaller power of two');
    pool.returnTexture(half);

    pool.returnTexture(full);
    const again = pool.getOptimalTexture({ width: 816, height: 624, resolution: 1, antialias: false });
    assert.equal(again.uid, full.uid, 'the pooled texture is handed back out');
    const aa = pool.getOptimalTexture({ width: 816, height: 624, resolution: 1, antialias: true });
    assert.notEqual(aa.uid, full.uid, 'antialias textures are pooled apart');
    pool.returnTexture(again);
    pool.returnTexture(aa);
});

test('a resized screen never hands the old full-screen texture out again', t => {
    const { pool } = load();
    pool.setScreenSize(SCREEN, 816, 624);
    t.after(() => pool.removeScreen(SCREEN));
    const old = pool.getOptimalTexture({ width: 816, height: 624, resolution: 1, antialias: false });
    pool.returnTexture(old);
    pool.setScreenSize(SCREEN, 1280, 720);
    const fresh = pool.getOptimalTexture({ width: 1280, height: 720, resolution: 1, antialias: false });
    assert.deepEqual(size(fresh), [1280, 720]);
    assert.notEqual(fresh.uid, old.uid);
    pool.returnTexture(fresh);
});

test('with no screen registered (the editor) a request rounds up to a power of two', () => {
    const { pool } = load();
    const texture = pool.getOptimalTexture({ width: 816, height: 624, resolution: 1, antialias: false });
    assert.deepEqual(size(texture), [1024, 1024]);
    pool.returnTexture(texture);
});

test('a resize that drops the old screen size lets go of a bound pool texture without PIXI\'s warning', t => {
    const { pool } = load();
    const warned = [];
    const realWarn = console.warn;
    console.warn = (...args) => warned.push(args.join(' '));
    t.after(() => { console.warn = realWarn; pool.removeScreen(SCREEN + 7); });
    pool.setScreenSize(SCREEN + 7, 1003, 701);
    const texture = pool.getOptimalTexture({ width: 1003, height: 701, resolution: 1, antialias: false });
    assert.deepEqual(size(texture), [1003, 701]);
    // The filter system's shared bind group: the last filter's input and its sampler stay named in it.
    const group = new native.BindGroup();
    group.setResource(texture.source, 1);
    group.setResource(texture.source.style, 2);
    const source = texture.source, style = source.style;
    pool.returnTexture(texture);
    pool.setScreenSize(SCREEN + 7, 1280, 720);
    assert.equal(source.destroyed, true, 'the pool still destroys the texture it kept for the old size');
    // The slots hold the empty texture, not nothing: a shader drawn again before it is rebound still draws.
    assert.equal(group.resources[1], native.Texture.EMPTY.source);
    assert.equal(group.resources[2], native.Texture.EMPTY.source.style);
    assert.equal(source.listenerCount ? source.listenerCount('change') : 0, 0);
    assert.equal(style.listenerCount ? style.listenerCount('change') : 0, 0);
    assert.deepEqual(warned.filter(line => /BindGroup/.test(line)), []);
});

test('a bitmap destroyed while a filter still samples it leaves that filter the empty texture, with no warning', t => {
    load();
    const warned = [];
    const realWarn = console.warn;
    console.warn = (...args) => warned.push(args.join(' '));
    t.after(() => { console.warn = realWarn; });
    // Hendrix 3D Light and Shadow: a cover mask's bitmap is destroyed on a map change, its filter still holding it.
    const source = new native.TextureSource({ width: 48, height: 96 });
    const group = new native.BindGroup();
    group.setResource(source, 1);
    group.setResource(source.style, 2);
    source.destroy();
    assert.equal(group.resources[1], native.Texture.EMPTY.source);
    assert.equal(group.resources[2], native.Texture.EMPTY.source.style);
    assert.equal(native.Texture.EMPTY.source.destroyed, false);
    assert.deepEqual(warned.filter(line => /BindGroup/.test(line)), []);
});
