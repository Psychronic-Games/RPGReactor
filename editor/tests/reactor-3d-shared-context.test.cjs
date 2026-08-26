/**
 * The 3D map used to reach PIXI by copy: every pass rendered to three's own
 * canvas, drawn onto a 2D canvas, and uploaded as a full-screen texture, up
 * to three times a frame. On a shared context three renders into targets
 * on PIXI's own GL context and PIXI samples them directly. These pin the
 * pieces that make that safe: the availability check and kill switch, the
 * texture adoption (PIXI never uploads to or deletes what it did not
 * create), and the sprite side never copying a shared pass.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const r3d = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');

function withGlobals(values, fn) {
    const saved = {};
    for (const key of Object.keys(values)) { saved[key] = global[key]; global[key] = values[key]; }
    try { return fn(); } finally {
        for (const key of Object.keys(values)) {
            if (saved[key] === undefined) delete global[key]; else global[key] = saved[key];
        }
    }
}

const fakePixi = () => ({ TextureSource: class {}, Texture: class {}, groupD8: { MIRROR_VERTICAL: 8 } });
const fakeGraphics = (webGLVersion = 2) => ({ _app: { renderer: { gl: {}, context: { webGLVersion }, resetState() {}, texture: {} } } });
const fakeThree = () => ({ WebGLRenderTarget: class {} });

test('the shared context is used only when PIXI 8 has a WebGL2 context, and the kill switch wins', () => {
    const previous = Reactor3D.useSharedContext;
    try {
        Reactor3D.useSharedContext = true;
        assert.equal(withGlobals({ PIXI: fakePixi(), Graphics: fakeGraphics(), THREE: fakeThree() }, () => Reactor3D.sharedContextAvailable()), true);
        assert.equal(withGlobals({ PIXI: fakePixi(), Graphics: fakeGraphics(1), THREE: fakeThree() }, () => Reactor3D.sharedContextAvailable()), false, 'WebGL1 keeps the canvas path');
        assert.equal(withGlobals({ PIXI: { Texture: class {} }, Graphics: fakeGraphics(), THREE: fakeThree() }, () => Reactor3D.sharedContextAvailable()), false, 'PIXI 5-7 keeps the canvas path');
        assert.equal(withGlobals({ PIXI: fakePixi(), Graphics: {}, THREE: fakeThree() }, () => Reactor3D.sharedContextAvailable()), false, 'no renderer yet');
        assert.equal(withGlobals({ PIXI: fakePixi(), Graphics: fakeGraphics(), THREE: fakeThree(), location: { search: '?r3dcopy' } }, () => Reactor3D.sharedContextAvailable()), false, '?r3dcopy restores the copy path');
        Reactor3D.useSharedContext = false;
        assert.equal(withGlobals({ PIXI: fakePixi(), Graphics: fakeGraphics(), THREE: fakeThree() }, () => Reactor3D.sharedContextAvailable()), false, 'useSharedContext = false restores the copy path');
    } finally {
        Reactor3D.useSharedContext = previous;
    }
});

test('an adopted GL texture is bound by PIXI but never uploaded to or deleted by it', () => {
    const calls = { deleteTexture: 0, texImage2D: 0, texSubImage2D: 0 };
    const gl = { TEXTURE_2D: 0x0de1, UNSIGNED_BYTE: 0x1401, RGBA: 0x1908, RGBA8: 0x8058,
        deleteTexture() { calls.deleteTexture++; }, texImage2D() { calls.texImage2D++; }, texSubImage2D() { calls.texSubImage2D++; } };
    const renderer = { gl, uid: 7 };
    const handle = { id: 'three-rt-texture' };
    const source = { _gpuData: {}, pixelWidth: 1280, pixelHeight: 720, uploadMethodId: 'unknown', update() { throw new Error('would upload'); } };
    withGlobals({ PIXI: {} }, () => {
        const glTexture = Reactor3D.adoptGlTexture(renderer, source, handle);
        assert.equal(source._gpuData[7], glTexture, 'the GPU record PIXI looks up first is seeded');
        assert.equal(glTexture.texture, handle);
        assert.equal(glTexture.target, gl.TEXTURE_2D);
        assert.deepEqual([glTexture.width, glTexture.height], [1280, 720], 'sized, so nothing thinks it needs allocating');
        assert.doesNotThrow(() => source.update(), 'update() is disarmed: there is nothing to send');
        assert.equal(source.uploadMethodId, 'external', 'no upload method matches it');
        glTexture.destroy();
        assert.deepEqual(calls, { deleteTexture: 0, texImage2D: 0, texSubImage2D: 0 });
    });
});

test('three renders into targets that hold the same bytes the canvas did, and both sides reset the context', () => {
    const body = r3d.slice(r3d.indexOf('Reactor3D.Viewport.prototype._target = function'), r3d.indexOf('Reactor3D.Viewport.prototype.passTexture'));
    assert.match(body, /colorSpace: THREE\.SRGBColorSpace/);
    assert.match(body, /target\.isXRRenderTarget = true;\s*target\.texture\.internalFormat = "RGBA8";/, 'sRGB encoded in the shader into plain RGBA8, like the canvas, for the texture and the multisample buffer alike');
    assert.match(body, /samples,/);
    assert.match(body, /this\._renderer\.initRenderTarget\(target\)/, 'allocated up front so the GL handle exists to adopt');
    const render = r3d.slice(r3d.indexOf('Reactor3D.Viewport.prototype.render = function(slot)'), r3d.indexOf('Reactor3D.Viewport.prototype.renderPass'));
    assert.match(render, /this\._renderer\.resetState\(\);\s*this\._renderer\.setRenderTarget\(target\);\s*this\._renderer\.render\(this\._scene, this\._camera\);\s*this\._renderer\.setRenderTarget\(null\);\s*this\._resetPixi\(\);/);
    const pass = r3d.slice(r3d.indexOf('Reactor3D.Viewport.prototype.passTexture'), r3d.indexOf('Reactor3D.adoptGlTexture = function'));
    assert.match(pass, /rotate: PIXI\.groupD8\.MIRROR_VERTICAL/, 'a framebuffer\'s first row is its bottom');
    assert.match(pass, /alphaMode: "premultiplied-alpha"/);
    const dispose = r3d.slice(r3d.indexOf('Reactor3D.Viewport.prototype._disposeTargets'), r3d.indexOf('Reactor3D.Viewport.prototype._target = function'));
    assert.match(dispose, /delete entry\.source\._gpuData\[this\._pixi\.uid\];[\s\S]*?entry\.texture\.destroy\(true\)/, 'the GPU record is dropped before PIXI destroys the source');
});

test('a shared pass is never copied, uploaded, or destroyed by the spriteset', () => {
    const create = sprites.slice(sprites.indexOf('Spriteset_Map.prototype.createReactor3DSprite'), sprites.indexOf('Spriteset_Map.prototype.destroyReactor3DSprite'));
    assert.match(create, /if \(shared\) \{\s*const texture = viewport\.passTexture\(slot\);/);
    assert.match(create, /return \{ sprite, texture, shared: true, generation: viewport\.generation\(\) \};/);
    assert.match(sprites, /if \(!pass \|\| pass\.shared\) return;\s*\/\/ Copied off the three canvas/);
    assert.match(sprites, /if \(!pass\.shared\) pass\.texture\.destroy\(false\);/);
    assert.match(sprites, /this\._reactor3dBelow\.generation !== state\.viewport\.generation\(\)\) \{\s*this\.createReactor3DSprite\(state\.viewport, state\.scene\);/, 'a resize rebuilds the sprites off the new targets');
    for (const slot of ['below', 'above', 'lights']) {
        assert.ok(new RegExp(`renderPass\\(state\\.scene,\\s*[^;]*"${slot}"\\)`).test(sprites), `the ${slot} pass names its target`);
    }
});
