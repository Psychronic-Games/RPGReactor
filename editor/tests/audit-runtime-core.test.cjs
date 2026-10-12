'use strict';
// Runtime core findings from the 2026-10-02 audit, each run against the
// runtime source in a VM with stubs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');

const read = name => fs.readFileSync(path.join(runtimeRoot, name), 'utf8');

/** reactor_screen_fx.js's screen-text code and sprite, with the screen and a variable table as stubs. */
function loadScreenTexts() {
    const src = read('reactor_screen_fx.js');
    const start = src.indexOf('    /** The window text codes a screen text understands');
    const end = src.indexOf('    // ---- named sprites over pictures');
    assert.ok(start > 0 && end > start, 'the screen-text block is locatable');
    function Sprite() {}
    Sprite.prototype.initialize = function() {};
    Sprite.prototype.update = function() {};
    function Bitmap(width, height) { this.width = width; this.height = height; this.outlineWidth = 3; }
    Bitmap.prototype.measureTextWidth = text => text.length * 10;
    Bitmap.prototype.drawText = function() {};
    Bitmap.prototype.destroy = function() { this.destroyed = true; };
    const texts = {};
    const variables = {};
    const c = {
        Sprite, Bitmap, texts, variables,
        clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
        $gameSystem: {}, ColorManager: { textColor: n => n }, TextManager: { currencyUnit: 'G' },
        $gameVariables: { value: id => variables[id] || 0 }, $gameActors: { actor: () => null }, $gameParty: { members: () => [] },
        $dataItems: [], $dataWeapons: [], $dataArmors: [], $dataSkills: [],
        $gameScreen: { rrText: id => texts[id] || null, picture: () => null },
        $gameMap: null, SceneManager: {}, Scene_Map: function() {}
    };
    vm.runInNewContext(src.slice(start, end) + '\nthis.Sprite_RRText = Sprite_RRText;', c);
    return c;
}

test('a screen text without text codes is not re-expanded every frame; one with \\V[n] redraws when the variable changes', () => {
    const c = loadScreenTexts();
    c.texts.plain = { x: 0, y: 0, lines: ['Score'], color: 0, layer: 0, rev: 1 };
    c.texts.coded = { x: 0, y: 0, lines: ['HP \\V[5]'], color: 0, layer: 0, rev: 1 };
    const plain = new c.Sprite_RRText('plain');
    const coded = new c.Sprite_RRText('coded');
    let redraws = 0;
    for (const sprite of [plain, coded]) {
        const redraw = sprite.redraw;
        sprite.redraw = function(t) { redraws++; return redraw.call(this, t); };
    }
    const lines = c.texts.plain.lines;
    let reads = 0;
    c.texts.plain.lines = new Proxy(lines, { get: (t, k, r) => { if (k === 'map') reads++; return Reflect.get(t, k, r); } });
    for (let frame = 0; frame < 5; frame++) { plain.update(); coded.update(); }
    assert.equal(redraws, 2, 'each drawn once');
    assert.equal(reads, 1, 'the plain text is expanded only when drawn');
    c.variables[5] = 40;
    coded.update();
    assert.equal(redraws, 3, 'a variable the text shows redraws it');
    const before = coded.bitmap;
    c.variables[5] = 39;
    coded.update();
    assert.equal(before.destroyed, true, 'a redraw frees the picture it replaces');
    assert.notEqual(coded.bitmap, before);
    redraws--;
    c.texts.plain.rev = 2;
    plain.update();
    assert.equal(redraws, 4, 'a new revision redraws a plain text');
});

test('a window destroys the RGSS frame picture it drew, as it does its contents', () => {
    const src = read('reactor_core_display.js');
    const start = src.indexOf('Window.prototype.destroy = function');
    const body = src.slice(start, src.indexOf('\n};\n', start) + 3);
    let containerDestroyed = 0;
    function Window() {}
    const c = { Window, PIXI: { Container: { prototype: { destroy() { containerDestroyed++; } } } } };
    vm.runInNewContext(body, c);
    let destroyed = 0;
    const win = Object.assign(new Window(), { _rrFrameBitmap: { destroy() { destroyed++; } } });
    win.destroy();
    assert.equal(destroyed, 1);
    assert.equal(win._rrFrameBitmap, null);
    assert.equal(containerDestroyed, 1);
    new Window().destroy();
    assert.equal(containerDestroyed, 2, 'a window without one destroys as before');
});

test('an empty layer never decides passage, even on a tileset written with flags[0] = 0', () => {
    const { runtimeSource } = require('./helpers/runtime-source.cjs');
    const src = runtimeSource('reactor_objects.js');
    const start = src.indexOf('Game_Map.prototype.checkPassage = function');
    const body = src.slice(start, src.indexOf('\n};\n', start) + 3);
    function Game_Map() {}
    vm.runInNewContext(body, { Game_Map });
    const map = new Game_Map();
    const passage = (flags, layers) => { map.tilesetFlags = () => flags; map.allTiles = () => layers; return map.checkPassage(0, 0, 0x0f); };
    const wall = 1543, floor = 1544;
    const stale = Object.assign(new Array(8192).fill(0), { [wall]: 0x0f, [floor]: 0 });
    const written = Object.assign([...stale], { 0: 0x10 });
    for (const flags of [stale, written]) {
        const label = flags[0] ? 'flags[0] = 16' : 'flags[0] = 0';
        assert.equal(passage(flags, [0, 0, 0, wall]), false, `a wall under empty layers blocks (${label})`);
        assert.equal(passage(flags, [0, 0, 0, floor]), true, `a floor under empty layers passes (${label})`);
        assert.equal(passage(flags, [0, 0, 0, 0]), false, `a cell with no tile at all blocks, as in RPG Maker (${label})`);
    }
});
