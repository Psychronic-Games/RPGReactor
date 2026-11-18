'use strict';
const test = require('node:test');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const coreSource = runtimeSource('reactor_core.js');

/** The shipped resolver, lifted so the real rule is what runs. */
function rendererModeName(pixi) {
    const at = coreSource.indexOf('Graphics.rendererModeName = function(renderer)');
    assert.ok(at >= 0, 'the resolver exists');
    const end = coreSource.indexOf('\n};', at);
    const body = coreSource.slice(coreSource.indexOf('{', at) + 1, end);
    // eslint-disable-next-line no-new-func
    const fn = new Function('PIXI', 'WebGLRenderingContext', 'WebGL2RenderingContext', 'renderer', body);
    class GL {}
    class GL2 {}
    return renderer => fn(pixi, GL, GL2, renderer);
}

const v8 = { RendererType: { WEBGL: 1, WEBGPU: 2, BOTH: 3, CANVAS: 4 } };
const v5 = { RENDERER_TYPE: { UNKNOWN: 0, WEBGL: 1, CANVAS: 2 } };

test('PIXI 8 renderers report by name', () => {
    const mode = rendererModeName(v8);
    assert.strictEqual(mode({ name: 'webgl', type: 1 }), 'WebGL');
    assert.strictEqual(mode({ name: 'webgpu', type: 2 }), 'WebGPU');
});

test('numeric types resolve against whichever PIXI enum is loaded (the numbers collide)', () => {
    assert.strictEqual(rendererModeName(v8)({ type: 2 }), 'WebGPU');
    assert.strictEqual(rendererModeName(v5)({ type: 2 }), 'Canvas');
    assert.strictEqual(rendererModeName(v5)({ type: 1 }), 'WebGL');
    assert.strictEqual(rendererModeName(v8)({ type: 4 }), 'Canvas');
});

test('falls back to the context when neither name nor enum is available', () => {
    const mode = rendererModeName(null);
    assert.strictEqual(mode({ gl: {} }), 'WebGL');
    assert.strictEqual(mode({ context: { fillRect() {} } }), 'Canvas');
    assert.strictEqual(mode({}), '');
    assert.strictEqual(mode(null), '');
});

test('the counter draws the mode line under the FPS label', () => {
    assert.ok(coreSource.includes('this._modeDiv.id = "fpsCounterMode"'));
    assert.ok(coreSource.includes('this._boxDiv.appendChild(this._modeDiv)'));
    assert.ok(/_update = function\(\) \{[\s\S]*?Graphics\.rendererModeName\(app\.renderer\)/.test(coreSource),
        'the mode is resolved on each update, after the async PIXI init');
});

test('the mode, the graphics device and the backend are a row each, so the box stays narrow (runtime 20261115.1)', () => {
    // One line "WebGL · Intel Iris Xe Graphics Direct3D11on12 v" made the box as wide as all of it (owner, 2026-11-15).
    assert.ok(coreSource.includes('white-space:pre-line;'), 'the mode element breaks at its line ends');
    assert.match(coreSource, /if \(device\) mode \+= "\\n" \+ device;\s*const backend = device \? Graphics\.graphicsBackendName\(\) : "";\s*if \(backend\) mode \+= "\\n" \+ backend;/);
    const at = coreSource.indexOf('Graphics.graphicsDeviceName = function(renderer)');
    const end = coreSource.indexOf('Graphics.rendererModeName = function(renderer)');
    const G = {};
    // eslint-disable-next-line no-new-func
    new Function('Graphics', coreSource.slice(at, coreSource.lastIndexOf('/**', end)))(G);
    const names = renderer => {
        delete G._deviceName; delete G._deviceString;
        const gl = { getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => renderer };
        return [G.graphicsDeviceName({ gl }), G.graphicsBackendName()];
    };
    assert.deepStrictEqual(names('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)'), ['Intel Iris Xe Graphics', 'Direct3D 11']);
    assert.deepStrictEqual(names('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11on12 vs_5_0 ps_5_0, D3D11)'), ['Intel Iris Xe Graphics', 'Direct3D 11 on 12']);
    assert.deepStrictEqual(names('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, OpenGL 4.5.0)'), ['Intel Iris Xe Graphics', 'OpenGL']);
    assert.deepStrictEqual(names('ANGLE (NVIDIA, NVIDIA GeForce RTX 5070/PCIe/SSE2, OpenGL 4.5.0)'), ['RTX 5070', 'OpenGL']);
    assert.deepStrictEqual(names('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'), ['Apple M2', 'Metal']);
    assert.deepStrictEqual(names('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'), ['software (SwiftShader)', ''], 'software drawing names no backend');
    assert.deepStrictEqual(names('ANGLE (Intel, Vulkan 1.4.323 (Intel(R) Iris(R) Xe Graphics (0x00009A49)), Intel Corporation)'), ['Intel Iris Xe Graphics', 'Vulkan']);
    assert.deepStrictEqual(names('ANGLE (NVIDIA, Vulkan 1.3.277 (NVIDIA NVIDIA GeForce RTX 5070 (0x00002F04)), NVIDIA)'), ['RTX 5070', 'Vulkan']);
    assert.deepStrictEqual(names(''), ['', '']);
});

test('the F2 box centres its rows, the number with the rest (owner, 2026-11-17)', () => {
    assert.ok(coreSource.includes('"display:none; flex-direction:column; align-items:center;"'));
});

