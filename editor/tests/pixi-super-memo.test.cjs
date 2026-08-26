/**
 * PIXISuper bridges MZ's ES5 `PIXI.X.call(this, ...)` super calls onto v8's
 * ES6 classes. It used to learn "this is a class" by throwing on every
 * call; a CPU profile of eight seconds of walking showed half a second
 * inside it, from the hundreds of Points and Rectangles MZ constructs per
 * frame. The answer is per class, so it is learned once.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const compat = fs.readFileSync(path.join(repoRoot, 'runtime', 'libs', 'pixi_compat.js'), 'utf8');

function loadPixiSuper() {
    const start = compat.indexOf('    window.PIXISuper = function(PixiClass, instance, args) {');
    const end = compat.indexOf('\n    };\n', start) + '\n    };\n'.length;
    assert.ok(start >= 0 && end > start, 'PIXISuper is locatable');
    const window = {};
    vm.runInNewContext(compat.slice(start, end), { window, Reflect, WeakSet, TypeError, Object });
    return window.PIXISuper;
}

test('an ES6 class is applied once, then constructed directly on every later call', () => {
    const PIXISuper = loadPixiSuper();
    let applies = 0;
    class Point {
        constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    }
    const Spied = new Proxy(Point, {
        apply() { applies++; throw new TypeError("Class constructor Point cannot be invoked without 'new'"); }
    });
    const a = Object.create(Point.prototype);
    assert.equal(PIXISuper(Spied, a, [1, 2]), a);
    assert.deepEqual([a.x, a.y], [1, 2]);
    assert.equal(applies, 1, 'the first call discovers the class by applying it');
    const b = Object.create(Point.prototype);
    PIXISuper(Spied, b, [3, 4]);
    const c = Object.create(Point.prototype);
    PIXISuper(Spied, c, [5, 6]);
    assert.equal(applies, 1, 'later calls never throw to find out again');
    assert.deepEqual([b.x, b.y, c.x, c.y], [3, 4, 5, 6]);
    assert.equal(Spied.__rrEs6Class, true);
});

test('an ES5 function is applied every time, and unrelated errors still surface', () => {
    const PIXISuper = loadPixiSuper();
    let applies = 0;
    function Legacy(x) { applies++; this.x = x; }
    const a = {};
    PIXISuper(Legacy, a, [7]);
    PIXISuper(Legacy, a, [8]);
    assert.equal(applies, 2);
    assert.equal(a.x, 8);
    function Broken() { throw new TypeError('something else'); }
    assert.throws(() => PIXISuper(Broken, {}, []), /something else/);
    assert.equal(Broken.__rrEs6Class, undefined, 'only the class-constructor error marks a class');
});
