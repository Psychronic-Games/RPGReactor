const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workspaceRoot = path.resolve(__dirname, '..', '..');

test('MV RenderTexture compatibility preserves Pixi defaults when resolution is omitted', () => {
    const source = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');
    const start = source.indexOf('    function installPixiCompatibility()');
    const end = source.indexOf('\n    function installAudioFontCompatibility()', start);
    assert.ok(start >= 0 && end > start);

    const calls = [];
    const PIXI = {
        TextureSource: function TextureSource() {},
        RenderTexture: {
            create(options) {
                calls.push(options);
                return { options };
            }
        }
    };
    const context = { console, PIXI };
    const installer = vm.runInNewContext(
        `(function() { const global = globalThis; ${source.slice(start, end)}; return installPixiCompatibility; })()`,
        context
    );
    installer();

    PIXI.RenderTexture.create(1280, 720);
    assert.deepEqual({ ...calls[0] }, { width: 1280, height: 720 });
    assert.equal('resolution' in calls[0], false);

    PIXI.RenderTexture.create(320, 180, 1, 2);
    assert.equal(calls[1].scaleMode, 'nearest');
    assert.equal(calls[1].resolution, 2);

    PIXI.RenderTexture.create({ width: 64, height: 32, resolution: undefined });
    assert.equal('resolution' in calls[2], false);
    assert.equal(Number.isFinite(calls[2].width), true);
    assert.equal(Number.isFinite(calls[2].height), true);
});

test('Bitmap.snap creates a finite Pixi 8 render texture before extraction', () => {
    const source = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const start = source.indexOf('Bitmap.snap = function(stage)');
    const end = source.indexOf('\nBitmap.prototype.isReady', start);
    assert.ok(start >= 0 && end > start);

    let createOptions = null;
    let renderOptions = null;
    let destroyedWith = null;
    class Bitmap {
        constructor(width, height) {
            this.width = width;
            this.height = height;
            this.context = { drawImage() {} };
            this.baseTexture = { update() {} };
        }
    }
    const renderTexture = {
        destroy(value) { destroyedWith = value; }
    };
    const PIXI = {
        TextureSource: function TextureSource() {},
        RenderTexture: {
            create(options) {
                createOptions = options;
                return renderTexture;
            }
        }
    };
    const canvas = { width: 1280, height: 720 };
    const Graphics = {
        width: 1280,
        height: 720,
        app: {
            renderer: {
                render(options) { renderOptions = options; },
                extract: { canvas: () => canvas }
            }
        }
    };
    vm.runInNewContext(source.slice(start, end), { Bitmap, Graphics, PIXI, Number, Math });

    const stage = { worldTransform: { identity() {} } };
    const bitmap = Bitmap.snap(stage);
    assert.deepEqual({ ...createOptions }, { width: 1280, height: 720, resolution: 1 });
    assert.equal(Number.isFinite(createOptions.width), true);
    assert.equal(Number.isFinite(createOptions.height), true);
    assert.equal(renderOptions.container, stage);
    assert.equal(renderOptions.target, renderTexture);
    assert.equal(bitmap.width, 1280);
    assert.equal(bitmap.height, 720);
    assert.equal(destroyedWith, true);
});
