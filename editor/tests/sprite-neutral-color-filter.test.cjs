const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const core = runtimeSource('reactor_core.js');

// ColorFilter from the runtime on a stand-in ColorMatrixFilter, and a sprite
// owning one the way Sprite._createColorFilter makes it.
function fixture() {
    const start = core.indexOf('function ColorFilter() {');
    const tail = core.indexOf('ColorFilter.prototype._rebuildColorMatrix = function', start);
    const end = core.indexOf('\n};\n', tail) + 4;
    class ColorMatrixFilter {
        constructor() {
            this.resources = {};
            Object.assign(this, { enabled: true, alpha: 1, blendMode: 'normal', resolution: 1, antialias: 'off',
                padding: 0, blendRequired: false, glProgram: {}, gpuProgram: {} });
        }
        get matrix() { return this._m; }
        set matrix(m) { this._m = m; }
    }
    const PIXI = { GlProgram: class {}, ColorMatrixFilter, Filter: class {}, Texture: { WHITE: {} } };
    const ctx = { PIXI, Array, Object, Number, Math, Error, Proxy,
        _normalizeBlendMode: v => ({ 0: 'normal', 1: 'add' }[v] || v),
        PIXISuper: (C, self, args) => Object.assign(self, new C(...args)) };
    vm.createContext(ctx);
    vm.runInContext(core.slice(start, end) + '\nthis.C = ColorFilter;', ctx);
    const node = (extra = {}) => Object.assign({ visible: true, renderable: true, mask: null, filters: null,
        blendMode: 'normal', children: [] }, extra);
    const sprite = node({ _blendMode: 0 });
    const filter = new ctx.C();
    sprite.filters = [filter];
    filter.allowNeutralSpriteSkip(sprite);
    return { C: ctx.C, sprite, filter, node };
}

test('a neutral sprite colour pass is skipped and comes back for tones, flashes and hues', () => {
    const { filter } = fixture();
    assert.equal(filter.enabled, false, 'neutral: drawn straight');
    filter.setColorTone([40, 0, 0, 0]);
    assert.equal(filter.enabled, true, 'a tone');
    filter.setColorTone([0, 0, 0, 0]);
    assert.equal(filter.enabled, false);
    filter.setBlendColor([255, 255, 255, 128]);
    assert.equal(filter.enabled, true, 'a flash');
    filter.setBlendColor([0, 0, 0, 0]);
    filter.setHue(90);
    assert.equal(filter.enabled, true, 'a hue');
    filter.setHue(0);
    filter.matrix[4] = 0.2;
    assert.equal(filter.enabled, true, 'a plugin writing the matrix');
    filter.matrix[4] = 0;
    assert.equal(filter.enabled, false);
    filter.enabled = false;
    filter.setColorTone([40, 0, 0, 0]);
    assert.equal(filter.enabled, false, 'an explicit disable stays');
});

test('the pass stays where drawing straight could differ', () => {
    const cases = {
        'another filter': x => { x.sprite.filters = [x.filter, {}]; },
        'a mask': x => { x.sprite.mask = {}; },
        'filter blend unlike the sprite': x => { x.filter.blendMode = 'add'; },
        'filter alpha': x => { x.filter.alpha = 0.5; },
        'filter resolution': x => { x.filter.resolution = 0.5; },
        'a child that adds': x => { x.sprite.children.push(x.node({ blendMode: 'add' })); },
        'a child with its own filter': x => { x.sprite.children.push(x.node({ filters: [{}] })); },
        'a grandchild with a mask': x => { x.sprite.children.push(x.node({ children: [x.node({ mask: {} })] })); },
        'children under an additive sprite': x => { x.sprite._blendMode = 'add'; x.filter.blendMode = 'add'; x.sprite.children.push(x.node()); },
        'shader replaced': x => { x.filter.glProgram = {}; },
        'switch off': x => { x.C.skipNeutralSpritePasses = false; }
    };
    for (const [name, change] of Object.entries(cases)) {
        const x = fixture();
        assert.equal(x.filter.enabled, false, name);
        change(x);
        assert.equal(x.filter.enabled, true, name);
    }
});

test('plain children, hidden children and an additive leaf sprite still skip', () => {
    const x = fixture();
    x.sprite.children.push(x.node(), x.node({ blendMode: 'inherit' }), x.node({ visible: false, blendMode: 'add' }));
    assert.equal(x.filter.enabled, false);
    const y = fixture();
    y.sprite._blendMode = 'add';
    y.filter.blendMode = 'add';
    assert.equal(y.filter.enabled, false, 'a leaf draws with its own blend either way');
});

test('only a sprite-made colour filter is skipped', () => {
    const src = runtimeSource('reactor_core.js');
    const create = src.slice(src.indexOf('Sprite.prototype._createColorFilter = function'), src.indexOf('Sprite.prototype._updateColorFilter = function'));
    assert.match(create, /allowNeutralSpriteSkip\(this\)/);
    const x = fixture();
    const plain = new x.C();
    assert.equal(plain.enabled, true, 'a filter a plugin makes keeps its pass');
});

test('legacy oversaturation retains its first pass when its final colour matrix is neutral',()=>{const {filter}=fixture();filter.setLegacyTone(true);filter.setColorTone([0,0,0,-255]);assert.equal(filter.enabled,true);filter.setColorTone([0,0,0,0]);assert.equal(filter.enabled,false);});
