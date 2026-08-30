const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');

/** ColorFilter and its helpers, run against a fake PIXI. */
function loadColorFilter(PIXI) {
    const start = core.indexOf('function ColorFilter() {');
    const tail = core.indexOf('ColorFilter.prototype._rebuildColorMatrix = function', start);
    const end = core.indexOf('\n};\n', tail) + 4;
    assert.ok(start >= 0 && tail > start, 'ColorFilter is locatable');
    const sandbox = {
        PIXI, Proxy, Object, Array, Math, Error, Number,
        PIXISuper: (Base, self, args) => Object.assign(self, new Base(...args))
    };
    vm.runInNewContext(core.slice(start, end) + '\nthis.ColorFilter = ColorFilter;', sandbox);
    return sandbox.ColorFilter;
}

function fakeV8() {
    class ColorMatrixFilter {
        constructor() { this.loads = 0; this.resources = {}; }
        get matrix() { return this._m; }
        set matrix(value) { this._m = value; this.loads++; }
        _loadMatrix(m) { this._m = m; this.loads++; }
    }
    return { GlProgram: function() {}, ColorMatrixFilter, Filter: class {} };
}

test('on PIXI 8 a ColorFilter exposes the MZ-era uniforms view and writes through it', () => {
    const ColorFilter = loadColorFilter(fakeV8());
    const filter = new ColorFilter();
    assert.ok(filter.uniforms, 'the view exists');
    const before = filter.loads;

    // The idiom every VisuMZ_4_EncounterEffects transition uses.
    filter.uniforms.colorTone[0] = 40;
    assert.equal(filter._colorTone[0], 40, 'an element write reaches the backing array');
    assert.ok(filter.loads > before, 'and rebuilds the matrix');

    filter.uniforms.hue += 30;
    assert.equal(filter._hue, 30, 'read-modify-write on hue goes through setHue');

    filter.uniforms.colorTone = [1, 2, 3, 4];
    assert.deepEqual(Array.from(filter._colorTone), [1, 2, 3, 4], 'whole-array assignment routes through the setter');
    assert.equal(filter.uniforms.colorTone[1], 2, 'and the view still sees the same array');

    filter.setBlendColor([9, 8, 7, 6]);
    assert.equal(filter.uniforms.blendColor[0], 9, 'engine setters stay visible through the view (copied in place)');
    filter.uniforms.brightness = 128;
    assert.equal(filter._brightness, 128);
});

test('on PIXI 5-7 the filter keeps its own uniforms untouched', () => {
    class Filter {
        constructor() { this.uniforms = { hue: 0, colorTone: [0, 0, 0, 0], blendColor: [0, 0, 0, 0], brightness: 255 }; }
    }
    const ColorFilter = loadColorFilter({ Filter });
    // The v7 path builds a shader; only its uniforms contract is asserted here.
    assert.equal(typeof ColorFilter.prototype._defineLegacyUniforms, 'function');
    assert.doesNotThrow(() => ColorFilter.prototype._defineLegacyUniforms.call(new Filter()));
    const plain = new Filter();
    ColorFilter.prototype._defineLegacyUniforms.call(plain);
    assert.equal(plain.uniforms.hue, 0, 'an existing uniforms object is left alone');
});
