/**
 * v5-era pixi-filters override Filter.apply with multi-pass bodies that read
 * `input._frame`/`input.filterFrame`, borrow scratch textures through
 * FilterSystem.getFilterTexture/returnFilterTexture, declare array uniforms
 * sized by shader constants, bind extra sampler2D uniforms by assignment, and
 * construct ObservablePoints with the (callback, scope) signature. Each of
 * those crashed the PIXI 8 runtime a different way in Haven's "5 years later"
 * chapter until the mv_compat bridge covered them.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(
    path.join(workspaceRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');
const start = source.indexOf('    function installPixiCompatibility()');
const end = source.indexOf('\n    function installAudioFontCompatibility()', start);
assert.ok(start >= 0 && end > start, 'installPixiCompatibility is locatable');

function makePixi() {
    const captured = { structures: null, program: null };
    class Filter {
        constructor(options) {
            this.options = options;
            this.resources = Object.assign({}, options && options.resources);
        }
    }
    class UniformGroup {
        constructor(structures) {
            captured.structures = structures;
            this.uniforms = Object.fromEntries(Object.entries(structures)
                .map(([name, entry]) => [name, entry.value]));
        }
    }
    class ObservablePoint {
        constructor(observer, x, y) {
            this._observer = observer;
            this._x = x || 0;
            this._y = y || 0;
        }
        set(x, y) {
            this._x = x;
            this._y = y === undefined ? x : y;
            this._observer._onUpdate(this);
        }
    }
    class FilterSystem {}
    const whiteSource = { uploadMethodId: 'image', label: 'white' };
    const pool = { returns: [] };
    const PIXI = {
        TextureSource: function TextureSource() {},
        Filter,
        UniformGroup,
        ObservablePoint,
        FilterSystem,
        GlProgram: { from(options) { captured.program = options; return options; } },
        Texture: { WHITE: { source: whiteSource }, prototype: {} },
        TexturePool: {
            getOptimalTexture(width, height, resolution, antialias) {
                return { width, height, resolution, antialias };
            },
            returnTexture(texture) { pool.returns.push(texture); }
        }
    };
    return { PIXI, captured, pool, whiteSource };
}

function install(PIXI) {
    const installer = vm.runInNewContext(
        `(function() { const global = globalThis; ${source.slice(start, end)}; return installPixiCompatibility; })()`,
        { console, PIXI });
    installer();
}

test('array uniforms carry literal and const int sizes into the uniform group', () => {
    const { PIXI, captured } = makePixi();
    install(PIXI);
    const fragment = `
        varying vec2 vTextureCoord;
        uniform sampler2D uSampler;
        uniform float matrix[9];
        const int MAX_COLORS = 4;
        uniform vec3 originalColors[MAX_COLORS];
        uniform vec2 plainPair;
        void main(void) { gl_FragColor = texture2D(uSampler, vTextureCoord); }
    `;
    new PIXI.Filter('', fragment, {});
    assert.equal(captured.structures.matrix.size, 9);
    assert.equal(captured.structures.matrix.type, 'f32');
    assert.equal(captured.structures.originalColors.size, 4);
    assert.equal(captured.structures.originalColors.type, 'vec3<f32>');
    assert.equal('size' in captured.structures.plainPair, false,
        'scalar uniforms keep UniformGroup\'s default size');
});

test('extra sampler uniforms bind as shader resources, never as group uniforms', () => {
    const { PIXI, captured, whiteSource } = makePixi();
    install(PIXI);
    const fragment = `
        varying vec2 vTextureCoord;
        uniform sampler2D uSampler;
        uniform sampler2D uLightmap;
        uniform vec4 ambientColor;
        void main(void) { gl_FragColor = texture2D(uLightmap, vTextureCoord); }
    `;
    const filter = new PIXI.Filter('', fragment, {});
    assert.equal('uLightmap' in captured.structures, false,
        'the sampler never enters the uniform group');
    assert.equal(filter.resources.uLightmap, whiteSource,
        'unassigned samplers hold a safe placeholder');
    const lightSource = { uploadMethodId: 'image' };
    filter.uniforms.uLightmap = { source: lightSource };
    assert.equal(filter.resources.uLightmap, lightSource,
        'a v5-style uniform assignment lands as the bound resource');
    assert.equal(Object.keys(filter.uniforms).includes('uLightmap'), false,
        'the routed key stays non-enumerable so uniform sync never sees it');
});

test('a shader-local finalColor identifier is renamed clear of the output variable', () => {
    const { PIXI, captured } = makePixi();
    install(PIXI);
    const fragment = `
        varying vec2 vTextureCoord;
        uniform sampler2D uSampler;
        void main(void) {
            vec3 finalColor = texture2D(uSampler, vTextureCoord).rgb;
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `;
    new PIXI.Filter('', fragment, {});
    assert.match(captured.program.fragment, /vec3 rrPluginFinalColor = /);
    assert.match(captured.program.fragment, /finalColor = vec4\(rrPluginFinalColor, 1\.0\)/);
    assert.doesNotMatch(captured.program.fragment, /vec3 finalColor\b/);
});

test('the v5 FilterSystem scratch-texture API maps onto the v8 TexturePool', () => {
    const { PIXI, pool } = makePixi();
    install(PIXI);
    const system = new PIXI.FilterSystem();
    system._activeFilterData = { bounds: { width: 816, height: 624 }, resolution: 2 };
    const scratch = system.getFilterTexture();
    assert.deepEqual(scratch, { width: 816, height: 624, resolution: 2, antialias: false });
    assert.deepEqual(system.getFilterTexture(true), scratch,
        'a junk input argument (KawaseBlur passes true) still sizes from the pass');
    const sized = system.getFilterTexture({
        source: { uploadMethodId: 'image', _resolution: 1 },
        frame: { width: 32, height: 16 }
    });
    assert.deepEqual(sized, { width: 32, height: 16, resolution: 1, antialias: false });
    system.returnFilterTexture(scratch);
    assert.equal(pool.returns[0], scratch);
});

test('textures expose the v5 _frame and filterFrame aliases', () => {
    const { PIXI } = makePixi();
    install(PIXI);
    const texture = Object.create(PIXI.Texture.prototype);
    texture.frame = { width: 100, height: 50 };
    assert.equal(texture._frame.width, 100);
    assert.equal(texture.filterFrame.height, 50);
    texture.filterFrame = { width: 7, height: 8 };
    assert.equal(texture.filterFrame.width, 7, 'an explicit assignment wins');
    assert.equal(texture.frame.width, 100, 'the real frame is untouched');
});

test('v5 ObservablePoint callback signatures observe through v8', () => {
    const { PIXI } = makePixi();
    install(PIXI);
    let callbackHits = 0;
    const scope = {
        changed() {
            callbackHits++;
            assert.equal(this, scope, 'the callback runs on its v5 scope');
        }
    };
    const point = new PIXI.ObservablePoint(function() { this.changed(); }, scope, 1, 2);
    assert.equal(point._x, 1);
    assert.equal(point._y, 2);
    point.set(5, 6);
    assert.equal(callbackHits, 1);

    let observerHits = 0;
    const observer = { _onUpdate() { observerHits++; } };
    const modern = new PIXI.ObservablePoint(observer, 3, 4);
    assert.equal(modern._x, 3);
    modern.set(9);
    assert.equal(observerHits, 1);
});
