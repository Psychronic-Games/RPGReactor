const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workspaceRoot = path.resolve(__dirname, '..', '..');

test('MV RenderTexture and ES5 Filter compatibility preserve legacy construction', () => {
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

    assert.match(source, /const MVCompatFilter = function\(vertexSrc, fragmentSrc, uniforms\)/);
    assert.match(source, /Reflect\.ownKeys\(inst\)/);
    assert.match(source, /Object\.defineProperty\(this, key, Object\.getOwnPropertyDescriptor\(inst, key\)\)/);
});

test('MV filterArea shaders use PIXI 8 filter globals without overriding them', () => {
    const source = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');
    const start = source.indexOf('    function installPixiCompatibility()');
    const end = source.indexOf('\n    function installAudioFontCompatibility()', start);
    let programOptions = null;
    let uniformStructures = null;

    class Filter {
        constructor(options) { this.options = options; }
    }
    class UniformGroup {
        constructor(structures) {
            uniformStructures = structures;
            this.uniforms = Object.fromEntries(Object.entries(structures)
                .map(([name, entry]) => [name, entry.value]));
        }
    }
    const PIXI = {
        TextureSource: function TextureSource() {},
        Filter,
        UniformGroup,
        GlProgram: {
            from(options) {
                programOptions = options;
                return options;
            }
        }
    };
    const installer = vm.runInNewContext(
        `(function() { const global = globalThis; ${source.slice(start, end)}; return installPixiCompatibility; })()`,
        { console, PIXI }
    );
    installer();

    const fragment = `
        varying vec2 vTextureCoord;
        uniform sampler2D uSampler;
        uniform highp vec4 filterArea;
        uniform mediump vec4 filterClamp;
        uniform vec2 size;
        vec2 mapCoord(vec2 coord) {
            coord *= filterArea.xy;
            coord += filterArea.zw;
            return coord;
        }
        vec2 unmapCoord(vec2 coord) {
            coord -= filterArea.zw;
            coord /= filterArea.xy;
            return coord;
        }
        void main(void) {
            vec2 coord = unmapCoord(mapCoord(vTextureCoord));
            gl_FragColor = texture2D(uSampler, clamp(coord / size, filterClamp.xy, filterClamp.zw));
        }
    `;
    const filter = new PIXI.Filter('', fragment, { size: [320, 180] });

    assert.doesNotMatch(programOptions.fragment, /\bfilterArea\b/);
    assert.match(programOptions.fragment, /coord \*= uInputSize\.xy/);
    assert.match(programOptions.fragment, /coord \+= uOutputFrame\.xy/);
    assert.match(programOptions.fragment, /coord -= uOutputFrame\.xy/);
    assert.match(programOptions.fragment, /uniform highp vec4 uOutputFrame/);
    assert.doesNotMatch(programOptions.fragment, /\bfilterClamp\b/);
    assert.match(programOptions.fragment, /uniform highp vec4 uInputClamp/);
    assert.match(programOptions.fragment, /clamp\(coord \/ size, uInputClamp\.xy, uInputClamp\.zw\)/);
    assert.deepEqual(Object.keys(uniformStructures), ['size', 'uReactorOpaque'], 'the plugin uniform plus the bridge\'s opaque switch');
    assert.deepEqual(filter.uniforms.size, [320, 180]);
    assert.match(programOptions.fragment, /void rrCompatUserMain\(void\)/);
    assert.match(programOptions.fragment, /if \(uReactorOpaque > 0\.5\) finalColor\.a = 1\.0;/);
    for (const globalName of [
        'uInputSize', 'uInputPixel', 'uInputClamp', 'uOutputFrame',
        'uGlobalFrame', 'uOutputTexture'
    ]) {
        assert.equal(globalName in filter.uniforms, false, `${globalName} remains owned by PIXI`);
    }
});

test('PIXI 8 snapshots stay finite and game-loop startup waits for Application.init', async () => {
    const source = runtimeSource('reactor_core.js');
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

    const loopStart = source.indexOf('Graphics.startGameLoop = function()');
    const loopEnd = source.indexOf('Graphics.setStage = function(stage)', loopStart);
    const appStart = source.indexOf('Graphics._createPixiApp = async function()');
    const appEnd = source.indexOf('Graphics._setupPixi = function()', appStart);
    assert.ok(loopStart >= 0 && loopEnd > loopStart && appStart >= 0 && appEnd > appStart);

    const releases = [];
    class Application {
        constructor() {
            this.starts = 0;
            this.stops = 0;
            this.ticker = { remove() {}, add() {} };
            this.render = () => {};
            this.renderer = {};
            this.ready = new Promise(resolve => releases.push(() => {
                this.start = () => { this.starts++; };
                this.stop = () => { this.stops++; };
                resolve();
            }));
            Application.instances.push(this);
        }
        init() { return this.ready; }
    }
    Application.instances = [];

    const RaceGraphics = {
        _app: null,
        _startRequested: false,
        _canvas: {},
        _setupPixi() {},
        _onTick() {}
    };
    vm.runInNewContext(
        source.slice(loopStart, loopEnd) + source.slice(appStart, appEnd),
        { Graphics: RaceGraphics, PIXI: { Application }, window: {} }
    );

    let pending = RaceGraphics._createPixiApp();
    const earlyStartApp = Application.instances.at(-1);
    RaceGraphics.startGameLoop();
    assert.equal(RaceGraphics._app, null, 'the pre-init PIXI app is never published');
    assert.equal(typeof earlyStartApp.start, 'undefined');
    releases.shift()();
    await pending;
    assert.equal(RaceGraphics._app, earlyStartApp);
    assert.equal(earlyStartApp.starts, 1, 'an early start request runs after init');

    RaceGraphics._app = null;
    RaceGraphics._startRequested = false;
    pending = RaceGraphics._createPixiApp();
    const earlyStopApp = Application.instances.at(-1);
    RaceGraphics.startGameLoop();
    RaceGraphics.stopGameLoop();
    assert.equal(RaceGraphics._app, null);
    releases.shift()();
    await pending;
    assert.equal(earlyStopApp.starts, 0, 'the final pre-init stop request wins');
    assert.equal(earlyStopApp.stops, 0, 'stop is not called before the app is published');
});
