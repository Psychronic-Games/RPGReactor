'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8');

function builderWith(globals = {}) {
    const scope = { window: {}, console, setTimeout, clearTimeout, ...globals };
    vm.runInNewContext(source, scope);
    return Object.create(scope.window.Character3DBuilder.prototype);
}

test('confirming deletion after a project switch cannot delete or change the newly opened character', async () => {
    let answer, removed = 0, replaced = 0;
    const b = builderWith({
        RRDialog: { confirm: () => new Promise(resolve => { answer = resolve; }) },
        RRCharacterOutfitTransfer: { removeProject: () => { removed++; } },
        RRCharacterWardrobe: { GARMENTS: [{ transfer: 'project:Uniform', label: 'Uniform' }] }
    });
    let project = { path: '/first' };
    b.root = {}; b._project = () => project; b._t = value => value; b._replace = () => { replaced++; };
    const pending = b._deleteTakenOutfit('project:Uniform');
    project = { path: '/second' };
    answer(true);
    await pending;
    assert.equal(removed, 0);
    assert.equal(replaced, 0);
});

test('confirming deletion after the builder changes roots cannot affect its replacement view', async () => {
    let answer, removed = 0;
    const b = builderWith({
        RRDialog: { confirm: () => new Promise(resolve => { answer = resolve; }) },
        RRCharacterOutfitTransfer: { removeProject: () => { removed++; } },
        RRCharacterWardrobe: { GARMENTS: [{ transfer: 'project:Uniform', label: 'Uniform' }] }
    });
    b.root = {}; b._project = () => ({ path: '/first' }); b._t = value => value;
    const pending = b._deleteTakenOutfit('project:Uniform');
    b.root = {};
    answer(true);
    await pending;
    assert.equal(removed, 0);
});

test('leaving an uninitialized builder still cancels its import', () => {
    const b = builderWith();
    let canceled = 0;
    b._closeOutfitImport = () => { canceled++; };
    b._view = null;
    b.detach();
    assert.equal(canceled, 1);
});

test('rendering a different project discards previous project undo and closes the import first', () => {
    const b = builderWith();
    let closed = 0, rendered = 0;
    b._outfitProjectPath = '/first'; b._outfitUndo = {};
    b._closeOutfitImport = () => { closed++; };
    b._renderPage = () => { assert.equal(closed, 1); rendered++; };
    b._start = () => {};
    b._bindPreviewActivity = () => {};
    b.renderInto({}, { currentProject: { path: '/second' } });
    assert.equal(b._outfitUndo, null);
    assert.equal(b._outfitProjectPath, '/second');
    assert.equal(rendered, 1);
});

function emblemBuilder(refs, urlFor = ref => 'asset:' + ref) {
    const images = [], timers = [];
    class FakeImage { constructor() { this.naturalWidth = this.naturalHeight = 32; images.push(this); } }
    const b = builderWith({
        require, Image: FakeImage, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout: () => {},
        window: { RRAssetFiles: { findImage: () => ({}), imageUrlFor: (_, ref) => urlFor(ref) } },
        document: { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(32 * 32 * 4) }) }) }) }
    });
    b._project = () => ({ path: '/project' }); b._view = {};
    b.recipe = { outfit: refs.map(ref => ({ pattern: 'emblem', emblemPicture: ref })) };
    b.cache = {}; b._thumbCache = {}; b._queueRebuild = () => {}; b._status = () => {}; b._t = text => text;
    return { b, images, timers };
}

test('all active emblems remain cached when a recipe has more than sixteen distinct references', async () => {
    const { b, images } = emblemBuilder(Array.from({ length: 17 }, (_, i) => 'logo-' + i));
    const ready = b._loadOutfitEmblems();
    assert.equal(images.length, 17);
    for (const image of images) image.onload();
    await ready;
    assert.equal(b.cache.wardrobe.emblemPictures.size, 17);
    await b._loadOutfitEmblems();
    assert.equal(images.length, 17, 'rebuilding does not repeatedly evict and decode active pictures');
    assert.equal(b._thumbCache.garment.wardrobe.emblemPictures, b.cache.wardrobe.emblemPictures);
});

test('an emblem URL failure settles loading and does not retry on every rebuild', async () => {
    const { b, images } = emblemBuilder(['logo'], () => { throw new Error('asset unavailable'); });
    await b._loadOutfitEmblems();
    assert.equal(b._emblemPending.size, 0);
    assert.equal(b._emblemFailed.has('logo'), true);
    await b._loadOutfitEmblems();
    assert.equal(images.length, 1);
});

test('the emblem watchdog settles a decode that emits no browser events', async () => {
    const { b, timers } = emblemBuilder(['logo']);
    const ready = b._loadOutfitEmblems();
    assert.equal(b._emblemPending.size, 1);
    timers[0]();
    await ready;
    assert.equal(b._emblemPending.size, 0);
    assert.equal(b._emblemFailed.has('logo'), true);
});

test('a project switch discards a late emblem decode without repainting the new project', async () => {
    const { b, images } = emblemBuilder(['logo']);
    let rebuilds = 0;
    b._queueRebuild = () => { rebuilds++; };
    const ready = b._loadOutfitEmblems();
    b._project = () => ({ path: '/other' });
    images[0].onload();
    await ready;
    assert.equal(rebuilds, 0);
    assert.equal(b._emblemPictures.size, 0);
});
