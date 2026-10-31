'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'editor/package.json')));
const { version, contents } = require('../build-scripts/vendor-pixi.cjs').pixiBundle();

test('editor, lockfile, offline runtime and Demo use the same pinned stable PixiJS bundle', () => {
    assert.equal(pkg.dependencies['pixi.js'], '8.22.0');
    assert.equal(version, pkg.dependencies['pixi.js']);
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'editor/package-lock.json')));
    assert.equal(lock.packages[''].dependencies['pixi.js'], version);
    assert.equal(lock.packages['node_modules/pixi.js'].version, version);
    for (const file of ['runtime/libs/pixi.js', 'template/Demo/js/libs/pixi.js']) {
        assert.ok(fs.readFileSync(path.join(root, file)).equals(contents), file + ' matches upstream bytes');
    }
});

test('offline classic script boots without Node or network and retains writable plugin exports', () => {
    const context = vm.createContext({ console, performance, navigator: { userAgent: 'Reactor bundle check' } });
    context.window = context; context.location = { search: '' };
    vm.runInContext(contents.toString(), context, { filename: 'pixi.js' });
    assert.equal(context.PIXI.VERSION, version);
    for (const name of ['Sprite', 'Container', 'Texture', 'BufferImageSource', 'Filter', 'Application']) {
        assert.equal(typeof context.PIXI[name], 'function', name);
    }
    assert.equal(Object.getOwnPropertyDescriptor(context.PIXI, 'Sprite').writable, true);
    vm.runInContext(fs.readFileSync(path.join(root, 'runtime/libs/pixi_compat.js'), 'utf8'), context);
    assert.equal(typeof context.PIXI.Texture.fromBuffer, 'function');
});

test('mirrored matrices preserve their visual transform when decomposed into a container', () => {
    const P = require('pixi.js');
    for (const scale of [[-2, 3], [2, -3], [-2, -3]]) {
        const matrix = new P.Matrix().setTransform(14, -3, 2, 1, ...scale, .4, 0, 0);
        const child = new P.Container(); child.pivot.set(2, 1); child.setFromMatrix(matrix); child.updateLocalTransform();
        for (const key of ['a', 'b', 'c', 'd', 'tx', 'ty']) assert.ok(Math.abs(matrix[key] - child.localTransform[key]) < 1e-6, key);
        child.destroy();
    }
});
