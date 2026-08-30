const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const managersSource = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_managers.js'), 'utf8');
const coreSource = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_core.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_ui.js'), 'utf8');

function imageManagerFixture() {
    const start = managersSource.indexOf('ImageManager._cache = {};');
    const end = managersSource.indexOf('\nImageManager.clear = function()', start);
    assert.ok(start >= 0 && end > start);
    const ImageManager = {};
    const loads = [];
    function Bitmap() {}
    Bitmap.load = (url, fallbacks) => {
        const bitmap = { url, fallbacks };
        loads.push(bitmap);
        return bitmap;
    };
    const Utils = { encodeURI: value => encodeURIComponent(value).replace(/%2F/gi, '/') };
    new Function('ImageManager', 'Bitmap', 'Utils', managersSource.slice(start, end))(
        ImageManager, Bitmap, Utils);
    return { ImageManager, loads };
}

test('ImageManager preserves explicit Reactor formats and legacy extensionless PNGs', () => {
    const { ImageManager } = imageManagerFixture();
    const expected = new Map([
        ['Portrait', 'img/pictures/Portrait.png'],
        ['Portrait.png', 'img/pictures/Portrait.png'],
        ['Portrait.jpg', 'img/pictures/Portrait.jpg'],
        ['Portrait.jpeg', 'img/pictures/Portrait.jpeg'],
        ['Portrait.webp', 'img/pictures/Portrait.webp'],
        ['Portrait.svg', 'img/pictures/Portrait.svg'],
        ['Portrait.gif', 'img/pictures/Portrait.gif'],
        ['Nested/Title #1.GIF', 'img/pictures/Nested/Title%20%231.GIF'],
        ['Portrait.custom', 'img/pictures/Portrait.custom.png'],
    ]);
    for (const [name, url] of expected) {
        assert.equal(ImageManager.loadPicture(name).url, url, name);
    }
    assert.equal(ImageManager.loadPicture(''), ImageManager._emptyBitmap);
    assert.equal(ImageManager.loadPicture('Portrait'), ImageManager.loadPicture('Portrait.png'),
        'legacy and explicit PNG references share the URL cache');
    assert.deepEqual(ImageManager.loadPicture('Portrait.jpg').fallbacks,
        ['img/pictures/Portrait.jpg.png']);
});

test('Bitmap supports candidate fallback, encrypted MIME, and animated GIF texture refresh', () => {
    assert.match(coreSource, /Bitmap\.load = function\(url, fallbackUrls\)/);
    assert.match(coreSource, /this\._urlIndex \+ 1 < this\._urls\.length/);
    assert.match(coreSource, /new Blob\(\[arrayBuffer\], \{ type: Bitmap\._mimeType\(this\._url\) \}\)/);
    assert.match(coreSource, /image\/svg\+xml/);
    assert.match(coreSource, /Bitmap\.prototype\._updateAnimatedImage = function/);
    assert.match(coreSource, /this\._animatedFrame === Graphics\.frameCount/);
    assert.match(coreSource, /this\._baseTexture\.update\(\)/);
    assert.match(coreSource, /this\._revokeObjectUrl\(\)/);
    assert.match(coreSource, /\.rpgmvp/);
});

test('Reactor UI strips legacy PNG suffixes but preserves explicit modern formats', () => {
    assert.match(uiSource, /replace\(\/\\\.png\$\/i, ""\)/);
    assert.doesNotMatch(uiSource, /png\|png_\|rpgmvp\|webp/);
});
