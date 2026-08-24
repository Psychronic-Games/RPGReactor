'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const coreSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');

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
