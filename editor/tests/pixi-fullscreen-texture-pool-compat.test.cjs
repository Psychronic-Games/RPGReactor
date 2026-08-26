/**
 * v5 gave a full-screen filter a texture of exactly the screen size, so
 * vTextureCoord spanned 0..1; v8 rounds every pooled texture up to a power of
 * two and hand-written MV/MZ shaders that hardcode 0.5 as the centre drift
 * down and right. The compat layer restores the exact size for the one
 * request that matches the canvas and leaves every other size to v8.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const compat = fs.readFileSync(
    path.join(repoRoot, 'runtime', 'libs', 'pixi_compat.js'), 'utf8');

function applyShim(PIXI, window) {
    const start = compat.indexOf('    if (PIXI.TextureSource && PIXI.TexturePool &&');
    const end = compat.indexOf('\n    }\n', start) + '\n    }\n'.length;
    assert.ok(start >= 0 && end > start, 'the texture pool wrap is locatable');
    vm.runInNewContext(compat.slice(start, end), { PIXI, window });
}

const nextPow2 = v => { v += v === 0 ? 1 : 0; v--; v |= v >>> 1; v |= v >>> 2; v |= v >>> 4; v |= v >>> 8; v |= v >>> 16; return v + 1; };

function fakePool() {
    let uid = 0;
    const destroyed = [];
    const pool = {
        _texturePool: {},
        _poolKeyHash: Object.create(null),
        createTexture(pixelWidth, pixelHeight, antialias, autoGenerateMipmaps) {
            const texture = {
                uid: ++uid,
                source: { pixelWidth, pixelHeight, width: pixelWidth, height: pixelHeight, antialias, autoGenerateMipmaps, _resolution: 1 },
                frame: { x: 0, y: 0, width: 0, height: 0 },
                uvs: 0,
                updateUvs() { this.uvs++; },
                destroy() { destroyed.push(this.uid); }
            };
            return texture;
        },
        // v8's body, condensed.
        getOptimalTexture(frameWidth, frameHeight, resolution = 1, antialias, autoGenerateMipmaps = false) {
            const w = nextPow2(Math.ceil(frameWidth * resolution - 1e-6));
            const h = nextPow2(Math.ceil(frameHeight * resolution - 1e-6));
            const key = (w << 17) + (h << 2) + ((autoGenerateMipmaps ? 1 : 0) << 1) + (antialias ? 1 : 0);
            if (!this._texturePool[key]) this._texturePool[key] = [];
            let texture = this._texturePool[key].pop();
            if (!texture) texture = this.createTexture(w, h, antialias, autoGenerateMipmaps);
            texture.source.pixelWidth = w;
            texture.source.pixelHeight = h;
            texture.frame.width = frameWidth;
            texture.frame.height = frameHeight;
            texture.updateUvs();
            this._poolKeyHash[texture.uid] = key;
            return texture;
        },
        returnTexture(texture) {
            this._texturePool[this._poolKeyHash[texture.uid]].push(texture);
        }
    };
    return { PIXI: { TextureSource: function TextureSource() {}, TexturePool: pool }, destroyed };
}

test('a request matching the canvas gets an exactly sized texture; other sizes stay power-of-two', () => {
    const { PIXI } = fakePool();
    const window = { Graphics: { _canvas: { width: 816, height: 624 } } };
    applyShim(PIXI, window);
    const full = PIXI.TexturePool.getOptimalTexture(816, 624, 1, false);
    assert.deepEqual([full.source.pixelWidth, full.source.pixelHeight], [816, 624]);
    assert.deepEqual([full.frame.width, full.frame.height], [816, 624]);
    assert.equal(full.uvs, 1, 'uvs are refreshed like the native path');
    assert.ok(PIXI.TexturePool._poolKeyHash[full.uid] < 0, 'full-screen keys never collide with v8 keys');

    const offByOne = PIXI.TexturePool.getOptimalTexture(815, 624, 1, false);
    assert.deepEqual([offByOne.source.pixelWidth, offByOne.source.pixelHeight], [1024, 1024]);
    const half = PIXI.TexturePool.getOptimalTexture(408, 312, 1, false);
    assert.deepEqual([half.source.pixelWidth, half.source.pixelHeight], [512, 512]);
});

test('full-screen textures round-trip through the pool and antialias keys stay separate', () => {
    const { PIXI } = fakePool();
    applyShim(PIXI, { Graphics: { _canvas: { width: 1280, height: 720 } } });
    const first = PIXI.TexturePool.getOptimalTexture(1280, 720, 1, false);
    PIXI.TexturePool.returnTexture(first);
    const again = PIXI.TexturePool.getOptimalTexture(1280, 720, 1, false);
    assert.equal(again.uid, first.uid, 'the pooled texture is handed back out');
    const aa = PIXI.TexturePool.getOptimalTexture(1280, 720, 1, true);
    assert.notEqual(aa.uid, first.uid);
    assert.notEqual(PIXI.TexturePool._poolKeyHash[aa.uid], PIXI.TexturePool._poolKeyHash[first.uid]);
});

test('a resized canvas destroys the stale full-screen texture instead of reusing it', () => {
    const { PIXI, destroyed } = fakePool();
    const window = { Graphics: { _canvas: { width: 816, height: 624 } } };
    applyShim(PIXI, window);
    const old = PIXI.TexturePool.getOptimalTexture(816, 624, 1, false);
    PIXI.TexturePool.returnTexture(old);
    window.Graphics._canvas.width = 1280;
    window.Graphics._canvas.height = 720;
    const fresh = PIXI.TexturePool.getOptimalTexture(1280, 720, 1, false);
    assert.deepEqual([fresh.source.pixelWidth, fresh.source.pixelHeight], [1280, 720]);
    assert.deepEqual(destroyed, [old.uid]);
});

test('without a Graphics canvas (the editor) and on v5-7 nothing changes', () => {
    const { PIXI } = fakePool();
    applyShim(PIXI, {});
    const texture = PIXI.TexturePool.getOptimalTexture(816, 624, 1, false);
    assert.deepEqual([texture.source.pixelWidth, texture.source.pixelHeight], [1024, 1024]);

    const legacy = fakePool().PIXI;
    delete legacy.TextureSource;
    const native = legacy.TexturePool.getOptimalTexture;
    applyShim(legacy, { Graphics: { _canvas: { width: 816, height: 624 } } });
    assert.equal(legacy.TexturePool.getOptimalTexture, native);
});
