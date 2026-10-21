/**
 * reactor_core.js and reactor_objects.js are split into parts that run as one
 * script. Function declarations hoist only within a file, so a part must not
 * touch a later part's class while loading: in a browser `Window` would still
 * be the DOM's own constructor, and a static set on it would be lost when the
 * real Window arrives.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeParts, runtimeSource, runtimeRoot } = require('./helpers/runtime-source.cjs');

const SPLIT = ['reactor_core.js', 'reactor_objects.js'];
const repoRoot = path.resolve(runtimeRoot, '..');

/** Answers any property or call with another stub, so PIXI needs no real renderer. */
function stub() {
    const cache = new Map();
    return new Proxy(function () {}, {
        get(target, key) {
            if (key === Symbol.toPrimitive) return () => '';
            if (key === 'then' || key === Symbol.iterator) return undefined;
            if (key === 'prototype') {
                if (!cache.has(key)) cache.set(key, {});
                return cache.get(key);
            }
            if (!cache.has(key)) cache.set(key, stub());
            return cache.get(key);
        },
        set(target, key, value) { cache.set(key, value); return true; },
        apply: () => stub(),
        construct: () => stub(),
    });
}

test('each split file is listed whole and in order in reactor_main.js', () => {
    const main = fs.readFileSync(path.join(runtimeRoot, 'reactor_main.js'), 'utf8');
    const listed = Array.from(main.matchAll(/"js\/([^"/]+\.js)"/g), m => m[1]);
    for (const file of SPLIT) {
        const parts = runtimeParts(file);
        assert.ok(parts.length > 1, `${file} has parts`);
        const at = listed.indexOf(file);
        assert.deepEqual(listed.slice(at, at + parts.length), parts, `${file}'s parts load right after it, in order`);
    }
});

test('the deploy checks require every part', () => {
    for (const script of ['build.js', 'build-worker.js', 'dist-editor-worker.js']) {
        const source = fs.readFileSync(path.join(repoRoot, 'editor', 'build-scripts', script), 'utf8');
        for (const file of SPLIT) {
            for (const part of runtimeParts(file)) {
                assert.ok(source.includes(`'${part}'`), `${script} requires ${part}`);
            }
        }
    }
});

test('the parts load in order with nothing but PIXI supplied, each class declared once', () => {
    const context = vm.createContext({ PIXI: stub(), console: { log() {}, warn() {}, error() {} } });
    vm.runInContext('var window = globalThis;', context);
    const declaredIn = new Map();
    for (const file of SPLIT) {
        for (const part of runtimeParts(file)) {
            const source = fs.readFileSync(path.join(runtimeRoot, part), 'utf8');
            for (const m of source.matchAll(/^function ([A-Z]\w*)\(/gm)) {
                assert.ok(!declaredIn.has(m[1]), `${m[1]} is declared in ${declaredIn.get(m[1])} and ${part}`);
                declaredIn.set(m[1], part);
            }
            assert.doesNotThrow(() => new vm.Script(source, { filename: part }).runInContext(context), `${part} loads after the parts before it`);
        }
    }
    assert.equal(vm.runInContext('typeof Window.defaultMargin', context), 'function');
    assert.equal(vm.runInContext('typeof Game_CharacterBase.rrFramesOf', context), 'function');
});

test('the joined parts are still one valid script', () => {
    for (const file of SPLIT) {
        assert.doesNotThrow(() => new vm.Script(runtimeSource(file), { filename: file }), file);
    }
});
