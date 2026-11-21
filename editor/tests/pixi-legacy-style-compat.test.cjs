'use strict';
// v5 texture styles and text styles on PIXI 8: setStyle (Hendrix HUD Designer: "setStyle is not a function" on every
// loaded picture), scale mode, mipmap and wrap writes through a legacy base texture reaching the real source, and
// new Text(text, style) with strokeThickness drawn as v5 drew it, without PIXI's deprecation warnings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const native = require('pixi.js');
const compat = fs.readFileSync(path.resolve(__dirname, '../../runtime/libs/pixi_compat.js'), 'utf8');

function load() {
    const PIXI = { ...native };
    const context = { PIXI, TypeError, Reflect, Float32Array, Uint8Array, ArrayBuffer, console: { log() {}, warn() {}, error() {} }, window: { location: { search: '' } } };
    vm.runInNewContext(compat, context);
    return { P: PIXI, context };
}

/** PIXI's own deprecation warnings, printed through the real console. */
function pixiWarnings(run) {
    const warned = [], original = console.warn;
    console.warn = (...args) => warned.push(String(args[0]).split('\n')[0]);
    try { run(); } finally { console.warn = original; }
    return warned.filter(line => /PixiJS Deprecation/.test(line));
}

test('setStyle of v5 works on a legacy base texture, a texture\'s baseTexture and a v8 source', () => {
    const { P } = load();
    const source = new P.TextureSource({ width: 2, height: 2, scaleMode: 'linear' });
    const base = new P.BaseTexture(source);
    assert.equal(base.setStyle(P.SCALE_MODES.NEAREST), base, 'returns itself, as v5 did');
    assert.equal(source.scaleMode, 'nearest');
    base.setStyle(1, 2);
    assert.equal(source.scaleMode, 'linear', 'v5 numbers: 1 is LINEAR');
    assert.equal(source.autoGenerateMipmaps, true, 'MIPMAP_MODES.ON');
    const texture = new P.Texture(base);
    texture.baseTexture.setStyle(0, 0);
    assert.equal(source.scaleMode, 'nearest', '0 is NEAREST');
    assert.equal(source.autoGenerateMipmaps, false);
    assert.equal(source.setStyle('linear'), source);
    assert.equal(source.scaleMode, 'linear');
});

test('scale mode, mipmap and wrap set on a legacy base texture reach its source after it is made', () => {
    // Bitmap.smooth = false sets baseTexture.scaleMode on a texture that already exists; it was a field the GPU
    // picture never read.
    const { P } = load();
    const source = new P.TextureSource({ width: 2, height: 2, scaleMode: 'linear' });
    const base = new P.BaseTexture(source);
    base.scaleMode = P.SCALE_MODES.NEAREST;
    assert.equal(source.scaleMode, 'nearest');
    assert.equal(base.scaleMode, 'nearest');
    base.mipmap = true;
    assert.equal(source.autoGenerateMipmaps, true);
    base.wrapMode = 10497;
    assert.equal(source.addressMode, 'repeat', 'the GL enum of REPEAT');
    base.wrapMode = P.WRAP_MODES.CLAMP;
    assert.equal(source.addressMode, 'clamp-to-edge');
    const texture = new P.Texture(base);
    texture.baseTexture.scaleMode = 1;
    assert.equal(source.scaleMode, 'linear');
});

test('new Text(text, style) with v5 strokes draws as v5 did, without deprecation warnings', () => {
    const { P } = load();
    const warnings = pixiWarnings(() => {
        const outlined = new P.Text('hi', { fontSize: 10, stroke: '#000000', strokeThickness: 3 });
        assert.equal(outlined.text, 'hi');
        assert.equal(outlined.style._stroke.width, 3);
        assert.equal(outlined.style.strokeThickness, 3);
        const bare = new P.Text('x', { stroke: '#000000' });
        assert.equal(bare.style._stroke.width, 0, 'a colour with no thickness was no outline in v5 (v8 drew one pixel)');
        const noColour = new P.Text('x', { strokeThickness: 2 });
        assert.equal(noColour.style._stroke.width, 2, 'a thickness with no colour was black in v5 (v8 threw)');
        assert.equal(new P.Text(5).text, '5', 'a number is its text');
        assert.equal(new P.Text().text, '');
        const modern = new P.Text({ text: 'v8', style: { stroke: { color: 0xff0000, width: 2 } } });
        assert.equal(modern.style._stroke.width, 2, 'the v8 form is untouched');
        assert.equal(Object.keys(outlined).includes('__rrLegacyText'), false);
    });
    assert.deepEqual(warnings, []);
});

test('strokeThickness written after the text is made, and a v5 style assigned later, take effect', () => {
    const { P } = load();
    const warnings = pixiWarnings(() => {
        const text = new P.Text('a', { stroke: '#123456', strokeThickness: 1 });
        text.style.strokeThickness = 6;
        assert.equal(text.style._stroke.width, 6);
        assert.equal(text.style._stroke.color, 0x123456, 'the colour is kept');
        text.style = { fill: '#ffffff', stroke: '#000000', strokeThickness: 4 };
        assert.equal(text.style._stroke.width, 4);
    });
    assert.deepEqual(warnings, []);
});

test('a plugin\'s ES5 subclass of Text gets its text and v5 stroke', () => {
    const { P, context } = load();
    function Label() { this.initialize.apply(this, arguments); }
    Label.prototype = Object.create(P.Text.prototype);
    Label.prototype.constructor = Label;
    Label.prototype.initialize = function(s) { P.Text.call(this, s, { fill: '#ffffff', stroke: '#ff0000', strokeThickness: 2 }); };
    const label = new Label('es5');
    assert.equal(label.text, 'es5');
    assert.equal(label.style._stroke.width, 2);
    // Upgraded already (MZGlobalUpgrade constructed it): the super call's arguments are applied after.
    const upgraded = new P.Text({ text: '' });
    upgraded.__pixiInitialized = true;
    context.window.PIXISuper(P.Text, upgraded, ['up', { stroke: '#00ff00', strokeThickness: 4 }]);
    assert.equal(upgraded.text, 'up');
    assert.equal(upgraded.style._stroke.width, 4);
});

test('premultiplyTint of v5 is there for plugins that pack their own vertices', () => {
    const { P } = load();
    assert.equal(P.utils.premultiplyTint(0xff8040, 1) >>> 0, 0xffff8040);
    assert.equal(P.utils.premultiplyTint(0xff8040, 0), 0);
    assert.equal(P.utils.premultiplyTint(0xff8040, 0.5) >>> 0, (127 << 24 | 128 << 16 | 64 << 8 | 32) >>> 0);
});
