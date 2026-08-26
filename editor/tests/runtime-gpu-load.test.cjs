/**
 * What hits a weak GPU: render-to-texture passes, per-frame uploads, and
 * oversized textures. Windows clip with a stencil rect instead of a filter
 * pass, billboards read a shared sheet through offset/repeat instead of
 * copying a frame into a canvas, the world's meshes are frozen once built,
 * and model textures are capped at load.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const r3d = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');

test('a billboard frame is two uniforms on a shared sheet, mirrored by a negative repeat', () => {
    global.self = global; global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    global.$gameMap = { tileWidth: () => 48, tileHeight: () => 48 };
    global.$dataMap = null;
    const sheet = { width: 432, height: 376 };            // a 3x4 character sheet
    const bitmap = { url: 'img/characters/Hero.png', _image: sheet, isReady: () => true };
    const material = new THREE.MeshBasicMaterial();
    const holder = { texture: new THREE.Texture(), object: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material), stamp: '', view: null };
    const sprite = { bitmap, _frame: { x: 288, y: 0, width: 144, height: 94 }, scale: { x: 1 } };
    const character = { isTransparent: () => false, _realX: 3, _realY: 4 };
    const scene = Object.create(Reactor3D.MapScene.prototype);
    Reactor3D._sheetTextures = null;
    try {
        scene._updateCharacterBillboard(holder, sprite, character);
    } catch (error) {
        // Position code past the frame maths needs the map; the frame maths ran first.
        assert.ok(holder.view, `frame maths ran before: ${error.message}`);
    }
    const view = holder.view;
    assert.ok(view, 'the billboard reads through its own view of the sheet');
    assert.equal(view.image, sheet, 'sharing the sheet image, so one upload serves every character on it');
    assert.equal(material.map, view);
    assert.ok(Math.abs(view.repeat.x - 144 / 432) < 1e-6 && Math.abs(view.repeat.y - 94 / 376) < 1e-6);
    assert.ok(Math.abs(view.offset.x - 288 / 432) < 1e-6, 'u from the frame\'s left edge');
    assert.ok(Math.abs(view.offset.y - (1 - 94 / 376)) < 1e-6, 'v counted from the bottom (flipY)');
    assert.equal(Reactor3D.sheetTextureFor(bitmap), Reactor3D.sheetTextureFor(bitmap), 'one sheet texture per bitmap');

    sprite.scale.x = -1;
    holder.stamp = '';
    try { scene._updateCharacterBillboard(holder, sprite, character); } catch (error) { /* as above */ }
    assert.ok(Math.abs(view.repeat.x + 144 / 432) < 1e-6, 'mirrored: columns read right to left');
    assert.ok(Math.abs(view.offset.x - (288 + 144) / 432) < 1e-6, 'starting from the frame\'s right edge');
    assert.equal(holder.view, view, 'the same view is reused; a frame change is uniforms, not a texture');
});

test('model textures over the cap are resampled down at load', async () => {
    const previous = Reactor3D.maxTextureSize;
    Reactor3D.maxTextureSize = 2048;
    try {
        const small = { width: 1024, height: 512 };
        assert.equal(Reactor3D.capBitmapSize(small), small, 'under the cap: untouched');
        const calls = [];
        global.createImageBitmap = (source, options) => { calls.push(options); return Promise.resolve({ width: options.resizeWidth, height: options.resizeHeight }); };
        const big = { width: 4096, height: 2048, close() { this.closed = true; } };
        const capped = await Reactor3D.capBitmapSize(big);
        assert.deepEqual([capped.width, capped.height], [2048, 1024], 'the longest side lands on the cap, aspect kept');
        assert.equal(calls[0].resizeQuality, 'high');
        assert.equal(big.closed, true, 'the oversized bitmap is released');
        assert.equal(Reactor3D.capImage({ naturalWidth: 4096, naturalHeight: 4096 }).naturalWidth, 4096, 'without a document the image is returned as is');
        assert.match(r3d, /loaded\.image = Reactor3D\.capImage\(loaded\.image\);/, 'embedded data-URI textures are capped');
        assert.match(r3d, /map\.image = Reactor3D\.capImage\(img\);/, 'file textures are capped');
    } finally {
        delete global.createImageBitmap;
        Reactor3D.maxTextureSize = previous;
    }
});

test('the world is frozen once built and windows clip with a stencil rect on PIXI 8', () => {
    assert.match(r3d, /this\._materials\.push\(material\);\s*\}\s*this\.freezeStaticMeshes\(\);/);
    assert.match(r3d, /mesh\.updateMatrix\(\);\s*mesh\.matrixAutoUpdate = false;/);
    assert.match(core, /Window\.clipWithMask = true;/);
    assert.match(core, /this\._clientArea\.filters = \[\];\s*this\._clientArea\.filterArea = new Rectangle\(\);\s*this\._clipMask = new PIXI\.Graphics\(\);/);
    assert.doesNotMatch(core.slice(core.indexOf('if (Window.clipWithMask && PIXI.TextureSource) {'), core.indexOf('} else {', core.indexOf('if (Window.clipWithMask && PIXI.TextureSource) {'))), /renderable = false/, 'PIXI manages the mask flags');
    assert.match(core, /Window\.prototype\._updateClipMask = function\(\) \{[\s\S]*?if \(rect\.x === x && rect\.y === y && rect\.width === width && rect\.height === height\) return;/, 'the rect is rebuilt only when it changes');
    assert.match(core, /this\._localizeFilterArea\(\);\s*if \(this\._clipMask\) this\._updateClipMask\(\);/);
});
