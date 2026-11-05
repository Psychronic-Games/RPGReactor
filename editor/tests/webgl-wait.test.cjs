'use strict';
// A graphics driver that refuses the GPU process for a moment (out of GPU channels, a reset) must not stop the game
// at "Your browser does not support WebGL" (runtime/reactor_main.js, Main.waitForWebGL): it is asked again before
// the scripts and plugins load, then the page is reloaded once, then the usual message.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_main.js'), 'utf8');
const mainClass = source.slice(source.indexOf('class Main {'), source.indexOf('const main = new Main();'));

function world({ failures, stored = {} }) {
    let asked = 0, reloads = 0, lost = 0;
    const timers = [];
    const ctx = {
        console: { warn() {} },
        document: { createElement: () => ({ getContext: () => (asked++ < failures ? null : { getExtension: () => ({ loseContext() { lost++; } }) }) }) },
        sessionStorage: { getItem: k => stored[k] ?? null, setItem: (k, v) => { stored[k] = String(v); }, removeItem: k => { delete stored[k]; } },
        location: { reload() { reloads++; } },
        setTimeout: fn => timers.push(fn),
        Date: { now: () => ctx.now }, now: 0
    };
    vm.createContext(ctx);
    vm.runInContext(mainClass + '; this.Main = Main;', ctx);
    const main = Object.create(ctx.Main.prototype);
    const step = () => { const fn = timers.shift(); ctx.now += 500; fn(); };
    return { ctx, main, timers, step, counts: () => ({ asked, reloads, lost }), stored };
}

test('WebGL there at once: on with no wait', () => {
    const w = world({ failures: 0 });
    let went = 0;
    w.main.waitForWebGL(() => went++);
    assert.equal(went, 1);
    assert.equal(w.timers.length, 0);
    assert.equal(w.counts().lost, 1, 'the test context is given back');
});

test('WebGL back after a moment: the game goes on once it is', () => {
    const w = world({ failures: 4 });
    let went = 0;
    w.main.waitForWebGL(() => went++);
    assert.equal(went, 0);
    while (w.timers.length && !went) w.step();
    assert.equal(went, 1);
    assert.equal(w.counts().reloads, 0);
});

test('never back: one reload, then the usual message', () => {
    const w = world({ failures: Infinity });
    let went = 0;
    w.main.waitForWebGL(() => went++);
    while (w.timers.length) w.step();
    assert.equal(w.counts().reloads, 1, 'a new page asks for a new GPU process');
    assert.equal(went, 0);
    const again = world({ failures: Infinity, stored: w.stored });
    again.main.waitForWebGL(() => went++);
    while (again.timers.length) again.step();
    assert.equal(again.counts().reloads, 0, 'only once');
    assert.equal(went, 1, 'then on to the usual message');
});

test('the wait comes before the scripts, so plugins see WebGL', () => {
    assert.match(source, /this\.waitForWebGL\(\(\) => this\.loadMainScripts\(\)\);/);
});
