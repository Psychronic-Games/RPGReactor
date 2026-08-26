/**
 * v5's `sprite.updateTransform()` forced a worldTransform recompute; v8
 * reuses the name for `updateTransform(opts)`, which reads `opts.x` and throws
 * with no arguments. VisuStella CoreEngine projects every battler animation
 * target with the v5 idiom, and because the Effekseer draw swallowed the
 * throw, every effect was invisible while its sounds still played. The compat
 * layer wraps PIXI.Sprite.prototype only: windows and tilemaps keep the
 * throwing setter on purpose.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const compat = fs.readFileSync(
    path.join(repoRoot, 'runtime', 'libs', 'pixi_compat.js'), 'utf8');

function applyShim(PIXI) {
    const start = compat.indexOf('    if (PIXI.TextureSource && PIXI.Sprite && PIXI.Sprite.prototype &&');
    const end = compat.indexOf('\n    }\n', start) + '\n    }\n'.length;
    assert.ok(start >= 0 && end > start, 'the sprite updateTransform wrap is locatable');
    vm.runInNewContext(compat.slice(start, end), { PIXI });
}

function fakeV8() {
    class Container {
        constructor() {
            this.position = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
            this.localRefreshes = 0;
        }
        updateTransform(opts) {
            this.position.set(
                typeof opts.x === 'number' ? opts.x : this.position.x,
                typeof opts.y === 'number' ? opts.y : this.position.y);
            return this;
        }
        updateLocalTransform() { this.localRefreshes++; }
    }
    class Sprite extends Container {}
    return { TextureSource: function TextureSource() {}, Container, Sprite };
}

test('the v5 no-args call succeeds on sprites and the v8 setter form still applies', () => {
    const PIXI = fakeV8();
    applyShim(PIXI);
    const sprite = new PIXI.Sprite();
    assert.doesNotThrow(() => sprite.updateTransform());
    assert.equal(sprite.localRefreshes, 1, 'the local transform is refreshed');
    assert.equal(sprite.updateTransform(), sprite, 'returns the sprite like v8 does');
    sprite.updateTransform({ x: 12, y: 34 });
    assert.deepEqual([sprite.position.x, sprite.position.y], [12, 34]);
});

test('containers keep the throwing setter so window and tilemap plugin chains are unchanged', () => {
    const PIXI = fakeV8();
    applyShim(PIXI);
    const container = new PIXI.Container();
    assert.throws(() => container.updateTransform(), TypeError);
});

test('the wrap installs once and only on a v8 PIXI', () => {
    const PIXI = fakeV8();
    applyShim(PIXI);
    const installed = PIXI.Sprite.prototype.updateTransform;
    applyShim(PIXI);
    assert.equal(PIXI.Sprite.prototype.updateTransform, installed, 'no double wrap');

    const legacy = fakeV8();
    delete legacy.TextureSource;
    applyShim(legacy);
    assert.equal(Object.prototype.hasOwnProperty.call(legacy.Sprite.prototype, 'updateTransform'),
        false, 'v5/v6/v7 sprites keep their own cascade');
});

test('the Effekseer draw reports its first throw instead of swallowing every frame', () => {
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.doesNotMatch(sprites, /inst\._doEffekseerDraw\(renderer, composited\); \} catch \(e\) \{\}/);
    assert.match(sprites, /Sprite_Animation\._effekseerDrawWarned = false;/);
    assert.match(sprites, /if \(!Sprite_Animation\._effekseerDrawWarned\) \{\s*Sprite_Animation\._effekseerDrawWarned = true;\s*console\.warn\(/);
});
