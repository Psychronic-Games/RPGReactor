'use strict';
// On Vulkan an array texture is filled a layer at a call (Graphics.LayerUploads, reactor_core.js): one texSubImage3D
// that fills many layers of a wide float array texture loses the device on ANGLE's Vulkan backend under Windows
// (Iris Xe, 2026-11-16), which is how three.js sends a mesh's morph targets.
const test = require('node:test');
const assert = require('node:assert');
const { runtimeSource } = require('./helpers/runtime-source.cjs');

const coreSource = runtimeSource('reactor_core.js');

const ARRAY = 0x8C1A, TEX_3D = 0x806F, RGBA = 0x1908, RGB = 0x1907, FLOAT = 0x1406, HALF_FLOAT = 0x140B, UNSIGNED_BYTE = 0x1401;
const VULKAN = 'ANGLE (Intel, Vulkan 1.4.323 (Intel(R) Iris(R) Xe Graphics (0x00009A49)), Intel Corporation)';
const OPENGL = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, OpenGL 4.5.0)';
const D3D11 = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)';

/** The shipped object, installed over a context class of the test's own; a context of `renderer` and the calls that reach it. */
function setup(renderer, store = {}) {
    const from = coreSource.indexOf('Graphics.LayerUploads = {'), to = coreSource.indexOf('Graphics.LayerUploads.install();', from);
    assert.ok(from >= 0 && to > from, 'Graphics.LayerUploads exists and is installed');
    class GL2 {
        constructor() { this.calls = []; this.asked = 0; }
        getExtension(name) { return name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null; }
        getParameter(key) { if (key === 0x9246) { this.asked++; return renderer; } if (key === 0x0CF5) return store[key] === undefined ? 4 : store[key]; return store[key] || 0; }
        texSubImage3D(...args) { this.calls.push(args); }
    }
    const Graphics = {};
    // eslint-disable-next-line no-new-func
    new Function('Graphics', 'WebGL2RenderingContext', coreSource.slice(from, to) + 'Graphics.LayerUploads.install();')(Graphics, GL2);
    return { gl: new GL2(), uploads: Graphics.LayerUploads };
}

test('on Vulkan a many-layer float upload goes a layer at a call, the same pixels', () => {
    const { gl, uploads } = setup(VULKAN);
    const width = 11289, height = 1, depth = 24, data = new Float32Array(width * height * depth * 4);
    gl.texSubImage3D(ARRAY, 0, 0, 0, 0, width, height, depth, RGBA, FLOAT, data);
    assert.strictEqual(gl.calls.length, depth);
    gl.calls.forEach((call, layer) => {
        assert.deepStrictEqual(call.slice(0, 10), [ARRAY, 0, 0, 0, layer, width, height, 1, RGBA, FLOAT]);
        assert.strictEqual(call[10], data, 'the same array, not a copy');
        assert.strictEqual(call[11], layer * width * height * 4, 'each layer starts where the one before ended');
    });
    assert.strictEqual(uploads.split, 1);
    // A second upload does not ask the context for its name again.
    gl.texSubImage3D(ARRAY, 0, 0, 0, 0, width, height, depth, RGBA, FLOAT, data);
    assert.strictEqual(gl.asked, 1);
});

test('the place in the texture and an offset into the array are carried', () => {
    const { gl } = setup(VULKAN);
    const data = new Uint8Array(100 + 8 * 2 * 3 * 4);
    gl.texSubImage3D(ARRAY, 2, 4, 6, 5, 8, 2, 3, RGBA, UNSIGNED_BYTE, data, 100);
    assert.deepStrictEqual(gl.calls.map(c => [c[2], c[3], c[4], c[7], c[11]]), [[4, 6, 5, 1, 100], [4, 6, 6, 1, 164], [4, 6, 7, 1, 228]]);
    assert.ok(gl.calls.every(c => c[1] === 2 && c[5] === 8 && c[6] === 2));
});

test('other backends are left as they are', () => {
    for (const renderer of [OPENGL, D3D11, '']) {
        const { gl, uploads } = setup(renderer);
        const data = new Float32Array(16 * 1 * 4 * 4);
        gl.texSubImage3D(ARRAY, 0, 0, 0, 0, 16, 1, 4, RGBA, FLOAT, data);
        assert.strictEqual(gl.calls.length, 1, renderer);
        assert.deepStrictEqual(gl.calls[0], [ARRAY, 0, 0, 0, 0, 16, 1, 4, RGBA, FLOAT, data]);
        assert.strictEqual(uploads.split, 0);
    }
});

test('on Vulkan too, what cannot be reckoned by layers goes as it came', () => {
    const whole = (store, ...args) => { const { gl } = setup(VULKAN, store); gl.texSubImage3D(...args); assert.strictEqual(gl.calls.length, 1, JSON.stringify(args.slice(0, 10))); assert.deepStrictEqual(gl.calls[0], args); };
    const floats = new Float32Array(16 * 2 * 4 * 4);
    whole({}, ARRAY, 0, 0, 0, 0, 16, 2, 1, RGBA, FLOAT, floats);                      // one layer
    whole({}, TEX_3D, 0, 0, 0, 0, 16, 2, 4, RGBA, FLOAT, floats);                     // a 3D texture
    whole({}, ARRAY, 0, 0, 0, 0, 16, 2, 4, RGBA, FLOAT, 0);                           // from a pixel buffer
    whole({}, ARRAY, 0, 0, 0, 0, 16, 2, 4, RGBA, FLOAT, null);
    whole({}, ARRAY, 0, 0, 0, 0, 16, 2, 4, RGBA, UNSIGNED_BYTE, { width: 16, height: 8 }); // from an image
    whole({}, ARRAY, 0, 0, 0, 0, 16, 2, 4, RGBA, HALF_FLOAT, floats);                 // the array is not of the pixel type
    whole({}, ARRAY, 0, 0, 0, 0, 5, 2, 4, RGB, UNSIGNED_BYTE, new Uint8Array(16 * 2 * 4)); // rows of 15 bytes, padded to 16
    whole({ 0x0CF2: 32 }, ARRAY, 0, 0, 0, 0, 16, 2, 4, RGBA, FLOAT, floats);          // UNPACK_ROW_LENGTH
    whole({ 0x806E: 4 }, ARRAY, 0, 0, 0, 0, 16, 2, 4, RGBA, FLOAT, floats);           // UNPACK_IMAGE_HEIGHT
    whole({ 0x806D: 1 }, ARRAY, 0, 0, 0, 0, 16, 2, 4, RGBA, FLOAT, floats);           // UNPACK_SKIP_IMAGES
    whole({}, ARRAY, 0, 0, 0, 0, 16, 2, 8, RGBA, FLOAT, floats);                      // not enough in the array: the driver's error to give
    whole({}, ARRAY, 0, 0, 0, 0, 16, 2, 4, RGBA, FLOAT, new DataView(floats.buffer));
});

test('rows that need no padding are split whatever the alignment says', () => {
    const { gl } = setup(VULKAN, { 0x0CF5: 1 });
    gl.texSubImage3D(ARRAY, 0, 0, 0, 0, 5, 2, 4, RGB, UNSIGNED_BYTE, new Uint8Array(5 * 3 * 2 * 4));
    assert.deepStrictEqual(gl.calls.map(c => c[11]), [0, 30, 60, 90]);
});

test('it can be switched off', () => {
    const { gl, uploads } = setup(VULKAN);
    uploads.enabled = false;
    const data = new Float32Array(16 * 1 * 4 * 4);
    gl.texSubImage3D(ARRAY, 0, 0, 0, 0, 16, 1, 4, RGBA, FLOAT, data);
    assert.strictEqual(gl.calls.length, 1);
});
