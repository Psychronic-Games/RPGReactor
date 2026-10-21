const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');
const Release = require(path.join(editorRoot, 'src', 'utils', 'ModelRelease.js'));
const PreviewModels = require(path.join(editorRoot, 'src', 'utils', 'EventPreviewModels.js'));

const item = (extra = {}) => Object.assign({ disposed: 0, dispose() { this.disposed++; } }, extra);
/** A template of one mesh: its geometry, a material with a picture, and a loose picture. */
function template(shared = {}) {
    const geometry = shared.geometry || item();
    const map = shared.map || item({ isTexture: true });
    const material = item({ map });
    const node = { geometry, material };
    return { geometry, map, material, userData: { glbTextures: [map] }, traverse(visit) { visit(node); } };
}
function renderer() {
    const canvas = { width: 512, height: 512, isConnected: false };
    return { domElement: canvas, disposed: 0, lost: 0, info: { memory: { textures: 3, geometries: 2 } },
        dispose() { this.disposed++; }, forceContextLoss() { this.lost++; } };
}

test('a released template gives back everything it holds, and leaves what a kept one shares', () => {
    const kept = template();
    const going = template({ map: kept.map });
    Release.releaseTemplate(going, Release.resourcesOf(kept));
    assert.equal(going.geometry.disposed, 1);
    assert.equal(going.material.disposed, 1);
    assert.equal(kept.map.disposed, 0);
    assert.equal(kept.geometry.disposed, 0);
});

test('the template cache keeps the newest few, never releases one in use, and clears whole', () => {
    const cache = new Release.TemplateCache({ max: 1 });
    const a = template(), b = template(), c = template();
    cache.set('a', a);
    cache.pin('a');
    cache.set('b', b);
    cache.set('c', c);
    assert.deepEqual(cache.keys(), ['a', 'c']);
    assert.equal(b.geometry.disposed, 1);
    assert.equal(a.geometry.disposed, 0);
    assert.equal(cache.release('a'), false);
    // Used again, the older one is the newest: the other goes when a third arrives.
    cache.unpin('a');
    assert.deepEqual(cache.keys(), ['c']);
    assert.equal(a.geometry.disposed, 1);
    cache.clear();
    assert.equal(cache.size, 0);
    assert.equal(c.geometry.disposed, 1);
});

test('an idle renderer is made on demand, dropped with its context after the rest, and made again', () => {
    const timers = [];
    const made = [];
    const idle = new Release.IdleRenderer(() => { const r = renderer(); made.push(r); return { renderer: r }; }, {
        restMs: 4000, name: 'test',
        setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: id => { timers[id - 1] = null; }
    });
    assert.equal(idle.active, false);
    idle.use(stage => assert.equal(stage.renderer, made[0]));
    idle.use(() => {});
    assert.equal(made.length, 1);
    assert.equal(Release.stats().live, 1);
    timers.filter(Boolean).forEach(fn => fn());
    assert.equal(idle.active, false);
    assert.equal(made[0].disposed, 1);
    assert.equal(made[0].lost, 1);
    assert.equal(made[0].domElement.width, 1);
    assert.equal(Release.stats().live, 0);
    idle.use(() => {});
    assert.equal(made.length, 2);
    idle.drop();
});

test('an idle renderer calls the window timers as plain functions', () => {
    // A browser's timers throw when called as another object's methods.
    const ownSet = globalThis.setTimeout, ownClear = globalThis.clearTimeout;
    const calls = [];
    globalThis.setTimeout = function (fn, ms) { if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation'); calls.push(['set', ms]); return 7; };
    globalThis.clearTimeout = function (id) { if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation'); calls.push(['clear', id]); };
    try {
        const idle = new Release.IdleRenderer(() => ({}), { restMs: 25 });
        idle.use(() => {});
        idle.use(() => {});
        idle.drop();
    } finally { globalThis.setTimeout = ownSet; globalThis.clearTimeout = ownClear; }
    assert.deepEqual(calls, [['set', 25], ['clear', 7], ['set', 25], ['clear', 7]]);
});

test('a model copy leaving a scene disposes what was made for it alone', () => {
    const own = item(), material = item(), skeleton = item();
    const copy = { traverse(visit) { visit({ geometry: own, material, skeleton }); } };
    assert.equal(PreviewModels.disposeInstance(copy, new Set()), 1);
    assert.equal(own.disposed + material.disposed + skeleton.disposed, 3);
    const shared = item();
    const second = { traverse(visit) { visit({ geometry: shared, material: item() }); } };
    assert.equal(PreviewModels.disposeInstance(second, new Set([shared])), 0);
    assert.equal(shared.disposed, 0);
});

test('the 3D Models page bounds what it loads and gives its renderers back', () => {
    const source = read('src/database/Database3DEditor.js');
    assert.match(source, /static TEMPLATES_KEPT = 1;/);
    assert.match(source, /if \(settled && this\._thumbOnly && this\._thumbOnly\.delete\(entry\.name\)\) this\._releaseTemplate\(entry\.name\);/);
    assert.match(source, /setTimeout\(\(\) => this\._dropThumbRenderer\(\), Database3DEditor\.THUMBNAIL_RENDERER_REST_MS\)/);
    const dispose = source.slice(source.indexOf('    _disposePreview() {'));
    assert.match(dispose.slice(0, 1600), /this\._releaseAllTemplates\(\);\s+this\._dropThumbRenderer\(\);/);
    assert.match(source, /if \(!force && \(template === this\._template \|\| name === this\._pinnedTemplate\)\) return false;/);
});

test('the 3D map view frees its models\' graphics before its renderer goes', () => {
    const source = read('src/MapEditor3D.js');
    const teardown = source.slice(source.indexOf('    teardown() {'), source.indexOf('    teardown() {') + 2600);
    assert.ok(teardown.indexOf('this.releaseGraphics(renderer)') < teardown.indexOf('renderer.dispose()'));
    assert.match(teardown, /if \(release && this\._ownCanvas\) release\.dropRenderer\(renderer\);/);
    assert.equal((source.match(/this\.disposeModelCopy\(/g) || []).length, 5);
    assert.match(read('src/database/DatabaseStructureEditor.js'), /RRModelRelease\.dropRenderer\(preview\.renderer\)/);
    assert.match(read('index.html'), /src\/utils\/ModelRelease\.js[\s\S]*src\/utils\/EventPreviewModels\.js/);
});
