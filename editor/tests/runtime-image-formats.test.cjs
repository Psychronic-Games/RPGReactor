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
        ['Portrait.apng', 'img/pictures/Portrait.apng'],
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

test('Bitmap supports candidate fallback, encrypted MIME, and frame-decoded animation', () => {
    assert.match(coreSource, /Bitmap\.load = function\(url, fallbackUrls\)/);
    assert.match(coreSource, /this\._urlIndex \+ 1 < this\._urls\.length/);
    assert.match(coreSource, /new Blob\(\[arrayBuffer\], \{ type: Bitmap\._mimeType\(this\._url\) \}\)/);
    assert.match(coreSource, /image\/svg\+xml/);
    assert.match(coreSource, /Bitmap\.prototype\._updateAnimatedImage = function/);
    assert.match(coreSource, /this\._animatedFrame === Graphics\.frameCount/);
    assert.match(coreSource, /this\._baseTexture\.update\(\)/);
    assert.match(coreSource, /this\._revokeObjectUrl\(\)/);
    assert.match(coreSource, /\.rpgmvp/);

    // Both formats decode through the byte route, from either seam: the
    // _startLoading branch, and the _onLoad one that catches a plugin
    // replacing _startLoading (VisuMZ_0_CoreEngine does).
    assert.match(coreSource, /Bitmap\.parseApng = function/);
    assert.match(coreSource, /Bitmap\.parseGif = function/);
    assert.match(coreSource, /Bitmap\.prototype\._requestBytes = function/);
    assert.equal(coreSource.match(/Bitmap\._isAnimatedImage\(this\._url\)/g).length, 2,
        'gated in _startLoading and in _onLoad');

    // The per-frame update must do nothing but drive a decoded animation.
    // Re-uploading an <img> was the mechanism that never worked, and its
    // return would be silent: the texture updates, the picture does not.
    const start = coreSource.indexOf('Bitmap.prototype._updateAnimatedImage = function');
    const body = coreSource.slice(start, coreSource.indexOf('\n};', start));
    assert.match(body, /this\._advanceAnimation\(\)/);
    assert.doesNotMatch(body, /this\._image/);
    assert.doesNotMatch(body, /this\._baseTexture\.update\(\)/);
});

test('Bitmap._mimeType names every format the loader can request', () => {
    const start = coreSource.indexOf('Bitmap._mimeType = function(url)');
    const end = coreSource.indexOf('\nBitmap._isAnimatedImage = function', start);
    assert.ok(start >= 0 && end > start);
    function Bitmap() {}
    new Function('Bitmap', coreSource.slice(start, end))(Bitmap);
    const expected = new Map([
        ['img/pictures/A.png', 'image/png'],
        ['img/pictures/A.jpg', 'image/jpeg'],
        ['img/pictures/A.jpeg', 'image/jpeg'],
        ['img/pictures/A.webp', 'image/webp'],
        ['img/pictures/A.svg', 'image/svg+xml'],
        ['img/pictures/A.gif', 'image/gif'],
        ['img/pictures/A.apng', 'image/apng'],
        // The encrypted suffix and a cache-busting query are both stripped.
        ['img/pictures/A.apng_', 'image/apng'],
        ['img/pictures/A.apng?v=3', 'image/apng'],
        // Anything unrecognised is served as PNG, as the loader assumes.
        ['img/pictures/A.custom', 'image/png'],
    ]);
    for (const [url, mime] of expected) {
        assert.equal(Bitmap._mimeType(url), mime, url);
    }
});

test('Reactor UI strips legacy PNG suffixes but preserves explicit modern formats', () => {
    assert.match(uiSource, /replace\(\/\\\.png\$\/i, ""\)/);
    assert.doesNotMatch(uiSource, /png\|png_\|rpgmvp\|webp/);
});
