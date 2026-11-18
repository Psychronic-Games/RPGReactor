'use strict';
// Filters and masks set on a destroyed object (players' report, 2026-11-17): Hendrix 3D Light and Shadow's rim
// light sets filters again on sprites it lit before, and one destroyed in between stopped the game with
// "Cannot read properties of null (reading 'indexOf')" in PIXI 8's addEffect. Under MZ's PIXI 5 that did nothing.
// Seen in the game on the desktop: all four cases below threw before the fix and do nothing after it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const PIXI = require('pixi.js');

const compat = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'libs', 'pixi_compat.js'), 'utf8');

function applyGuard() {
    const start = compat.indexOf('    if (_isV8Pixi && PIXI.Container && PIXI.Container.prototype &&\n        typeof PIXI.Container.prototype.addEffect');
    const end = compat.indexOf('    if (_isV8Pixi && PIXI.Container && PIXI.Container.prototype &&\n        typeof Proxy', start);
    assert.ok(start >= 0 && end > start, 'the guard is where it was');
    vm.runInNewContext(compat.slice(start, end), { PIXI, _isV8Pixi: true });
}

test('a destroyed object takes filters and masks without stopping the game; a live one keeps them', () => {
    const dead = () => { const sprite = new PIXI.Container(); sprite.destroy(); return sprite; };
    const cases = [
        ['filters', s => { s.filters = [{ enabled: true }]; }],
        ['mask', s => { s.mask = new PIXI.Container(); }]
    ];
    for (const [label, act] of cases) assert.throws(() => act(dead()), /reading 'indexOf'/, 'PIXI 8 as it is: ' + label);
    applyGuard();
    applyGuard(); // once only, however often the layer is loaded
    assert.equal(PIXI.Container.prototype.addEffect.__reactorDestroyedSafe, true);
    for (const [label, act] of cases) {
        const sprite = dead();
        assert.doesNotThrow(() => act(sprite), label);
        assert.doesNotThrow(() => { sprite.filters = null; sprite.mask = null; }, label + ' cleared');
    }
    const live = new PIXI.Container();
    live.filters = [{ enabled: true }];
    assert.equal(live.effects.length, 1, 'a live sprite still gets its filter');
    live.filters = null;
    assert.equal(live.effects.length, 0, 'and loses it');
    live.mask = new PIXI.Container();
    assert.equal(live.effects.length, 1);
    live.destroy();
});
