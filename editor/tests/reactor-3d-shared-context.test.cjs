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
    const body = r3d.slice(r3d.indexOf('Reactor3D.Viewport.prototype.createTarget = function'), r3d.indexOf('Reactor3D.Viewport.prototype.passTexture'));
    assert.match(body, /colorSpace: THREE\.SRGBColorSpace/);
    assert.match(body, /target\.isXRRenderTarget = true;\s*target\.texture\.internalFormat = "RGBA8";/, 'sRGB encoded in the shader into plain RGBA8, like the canvas, for the texture and the multisample buffer alike');
    assert.match(body, /samples,/);
    assert.match(body, /this\._renderer\.initRenderTarget\(target\)/, 'allocated up front so the GL handle exists to adopt');
    const render = r3d.slice(r3d.indexOf('Reactor3D.Viewport.prototype.renderInto = function'), r3d.indexOf('Reactor3D.Viewport.prototype.createTarget'));
    assert.match(render, /this\._renderer\.resetState\(\);\s*this\._renderer\.setRenderTarget\(target\);\s*this\._renderer\.render\(scene, camera\);\s*this\._renderer\.setRenderTarget\(null\);\s*this\._resetPixi\(\);/);
    assert.match(r3d, /Reactor3D\.Viewport\.prototype\.render = function\(slot\) \{[\s\S]*?this\.renderInto\(this\._target\(slot \|\| "below"\), this\._scene, this\._camera\);/);
    const pass = r3d.slice(r3d.indexOf('Reactor3D.Viewport.prototype.passTexture'), r3d.indexOf('Reactor3D.adoptGlTexture = function'));
    assert.match(pass, /rotate: PIXI\.groupD8\.MIRROR_VERTICAL/, 'a framebuffer\'s first row is its bottom');
    assert.match(pass, /alphaMode: "premultiplied-alpha"/);
    const dispose = r3d.slice(r3d.indexOf('Reactor3D.Viewport.prototype._disposeTargets'), r3d.indexOf('Reactor3D.Viewport.prototype._target = function'));
    assert.match(dispose, /delete entry\.source\._gpuData\[pixi\.uid\];[\s\S]*?entry\.texture\.destroy\(true\)/, 'the GPU record is dropped before PIXI destroys the source');
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

test('battlers render into an adopted target on the shared context and release it with the sprite', () => {
    const paint = r3d.slice(r3d.indexOf('Reactor3D.paintBattlerFrame = function'), r3d.indexOf('Reactor3D.releaseBattlerState = function'));
    assert.match(paint, /if \(this\.sharedContextAvailable\(\)\) \{\s*const viewport = this\.acquireViewport\(\);\s*if \(viewport && viewport\.isShared\(\) && this\._paintBattlerShared\(viewport, state, sprite\)\) return;/);
    assert.match(paint, /context\.drawImage\(renderer\.domElement/, 'the copy path survives as the fallback');
    assert.match(paint, /state\.target = viewport\.createTarget\(pixels, pixels, scale\);/);
    assert.match(paint, /this\.adoptGlTexture\(viewport\.pixi\(\), source, handle\);/);
    assert.match(paint, /texture\.rotate = PIXI\.groupD8\.MIRROR_VERTICAL;/);
    assert.match(paint, /viewport\.renderInto\(state\.target, state\.scene, state\.camera\);/);
    // Both per-frame sites go through it; no other per-frame drawImage remains.
    const after = r3d.slice(r3d.indexOf('Reactor3D.updateEnemyModelSprite = function'));
    assert.equal((after.match(/this\.paintBattlerFrame\(state, (sprite|main)\);/g) || []).length, 2);
    assert.equal((after.match(/context\.drawImage\(renderer\.domElement/g) || []).length, 1, 'only the one-off face paint still copies');
    assert.match(r3d, /this\.releaseBattlerState\(state\);\s*sprite\._reactorBattler = state = null;/, 'an id change releases the target');
    assert.match(sprites, /Sprite_Battler\.prototype\.destroy = function\(\) \{[\s\S]*?Reactor3D\.releaseBattlerState\(this\._reactorBattler\);[\s\S]*?Reactor3D\.releaseBattlerState\(this\._mainSprite\._reactorBattler\);/);
    assert.ok(sprites.lastIndexOf('Sprite_Battler.prototype.destroy = function') > sprites.lastIndexOf('Sprite_Enemy.prototype = '), 'the wrapper follows the prototype replacement');
});

test('adopting a source PIXI already uploaded frees the texture PIXI made', () => {
    const deleted = [];
    const gl = { TEXTURE_2D: 1, UNSIGNED_BYTE: 2, RGBA: 3, RGBA8: 4, deleteTexture(t) { deleted.push(t); } };
    const renderer = { gl, uid: 3 };
    const pixiMade = { id: 'pixi' };
    const source = { _gpuData: { 3: { texture: pixiMade } }, pixelWidth: 96, pixelHeight: 96, update() {} };
    withGlobals({ PIXI: {} }, () => {
        const handle = { id: 'three' };
        Reactor3D.adoptGlTexture(renderer, source, handle);
        assert.deepEqual(deleted, [pixiMade]);
        assert.equal(source.alphaMode, 'premultiplied-alpha');
        Reactor3D.adoptGlTexture(renderer, source, handle);
        assert.deepEqual(deleted, [pixiMade], 'adopting again never deletes three\'s texture');
    });
});

test('the passes render at an adaptive scale: drop fast when the game cannot hold its refresh, climb back slowly', () => {
    const step = (ema, current, ceiling = 1, floor = 0.5) => Reactor3D.adaptScale({ ema }, current, ceiling, floor);
    assert.equal(step(16.7, 1), 1, 'holding 60 stays put');
    assert.equal(step(7, 1), 1, 'a 144 Hz display running 144 stays put');
    assert.equal(step(25, 1), 0.75, 'a 40 fps average drops a quarter');
    assert.equal(step(25, 0.75), 0.5);
    assert.equal(step(25, 0.5), 0.5, 'never below the floor');
    assert.equal(step(17, 0.5), 0.75, 'comfortable again: one step back up');
    assert.equal(step(20, 0.5), 0.5, '50 fps is neither slow enough to drop nor calm enough to climb');
    assert.equal(step(17, 1), 1, 'never above the ceiling');
    assert.equal(step(17, 0.75, 0.75), 0.75, 'a lower ceiling holds');
    assert.equal(step(0, 1), 1, 'no data, no change');
    assert.equal(Reactor3D.samplesForScale(1), 4);
    assert.equal(Reactor3D.samplesForScale(0.75), 2);
    assert.equal(Reactor3D.samplesForScale(0.5), 0);
    const viewport = r3d.slice(r3d.indexOf('Reactor3D.Viewport.prototype._trackFrame'), r3d.indexOf('Reactor3D.Viewport.prototype._disposeTargets'));
    assert.match(viewport, /if \(next < this\._scale \|\| \(next > this\._scale && stats\.since >= 300\)\)/, 'climbing back needs five calm seconds');
    assert.match(r3d, /Reactor3D\.Viewport\.prototype\.render = function\(slot\) \{[\s\S]*?this\._trackFrame\(\);\s*this\.renderInto/);
    assert.match(r3d, /const pixels = Math\.max\(16, Math\.round\(state\.size \* scale\)\);[\s\S]*?state\.target = viewport\.createTarget\(pixels, pixels, scale\);/, 'battler targets follow the scale');
    const warm = r3d.slice(r3d.indexOf('Reactor3D.warmLoadedTemplates = function'), r3d.indexOf('Templates live outside any scene'));
    assert.ok(warm.indexOf('if (!pending.length) return;') < warm.indexOf('new THREE.Scene()'), 'the per-frame warm scan allocates nothing on the steady state');
});
