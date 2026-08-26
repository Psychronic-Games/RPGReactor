/**
 * The Database 3D preview stuttered in its first seconds: hover raycasts
 * over the whole mesh (~350 ms on a 600k-triangle character) fired every
 * ~330 ms while the pointer moved, and every other model in the list was
 * loaded and rendered for a 64 px thumbnail on the main thread, twice,
 * under the user's orbit. Measured with a rAF-gap and longtask probe
 * before and after (db3d-perf.mjs in the session scratchpad).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const Database3DEditor = require(path.join(repoRoot, 'src', 'database', 'Database3DEditor.js'));
const source = fs.readFileSync(path.join(repoRoot, 'src', 'database', 'Database3DEditor.js'), 'utf8');

test('hover raycasts only once the pointer rests, the camera settles, and the mesh is within budget', () => {
    const base = { now: 1000, movedAt: 700, inputAt: 500, dragging: false, triangles: 50000 };
    assert.equal(Database3DEditor.shouldRaycastHover(base), true);
    assert.equal(Database3DEditor.shouldRaycastHover({ ...base, movedAt: 900 }), false, 'pointer still moving');
    assert.equal(Database3DEditor.shouldRaycastHover({ ...base, inputAt: 850 }), false, 'orbit or zoom still settling');
    assert.equal(Database3DEditor.shouldRaycastHover({ ...base, dragging: true }), false);
    assert.equal(Database3DEditor.shouldRaycastHover({ ...base, movedAt: undefined }), false, 'no pointer yet');
    assert.equal(Database3DEditor.shouldRaycastHover({ ...base, triangles: 596464 }), false,
        'a 600k-triangle character never raycasts on hover; clicks still pick');
    assert.equal(Database3DEditor.shouldRaycastHover({ ...base, triangles: Database3DEditor.HOVER_TRIANGLE_BUDGET }), true);
    assert.equal(Database3DEditor.shouldRaycastHover({ ...base, inputAt: undefined }), true, 'never interacted is settled');
});

test('the second thumbnail render is skipped when the worker already decoded every texture', () => {
    assert.equal(Database3DEditor.texturesDecoded([]), true);
    assert.equal(Database3DEditor.texturesDecoded(undefined), true);
    assert.equal(Database3DEditor.texturesDecoded([{ image: { width: 512, height: 512 } }]), true, 'ImageBitmap');
    assert.equal(Database3DEditor.texturesDecoded([{ image: { complete: true, naturalWidth: 256 } }]), true);
    assert.equal(Database3DEditor.texturesDecoded([{ image: { complete: false, naturalWidth: 0 } }]), false);
    assert.equal(Database3DEditor.texturesDecoded([{ image: { width: 0 } }]), false);
    assert.equal(Database3DEditor.texturesDecoded([{ image: null }, { image: { width: 4 } }]), true, 'textures without pixels have nothing to decode');
});

test('thumbnails cache per machine, keyed by the source file and its stamp', () => {
    const win = Database3DEditor.thumbnailCacheRoot({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' } }, path.win32, { homedir: () => 'C:\\Users\\a' });
    assert.equal(win, 'C:\\Users\\a\\AppData\\Local\\RPGReactor\\ModelThumbnails');
    const mac = Database3DEditor.thumbnailCacheRoot({ platform: 'darwin', env: {} }, path.posix, { homedir: () => '/Users/a' });
    assert.equal(mac, '/Users/a/Library/Application Support/RPGReactor/ModelThumbnails');
    const linux = Database3DEditor.thumbnailCacheRoot({ platform: 'linux', env: {} }, path.posix, { homedir: () => '/home/a' });
    assert.equal(linux, '/home/a/.cache/rpg-reactor/model-thumbnails');
    const xdg = Database3DEditor.thumbnailCacheRoot({ platform: 'linux', env: { XDG_CACHE_HOME: '/tmp/x' } }, path.posix, { homedir: () => '/home/a' });
    assert.equal(xdg, '/tmp/x/rpg-reactor/model-thumbnails');
    const a = Database3DEditor.thumbnailCacheName('/p/3d/Hero/source/Hero.glb', 1000, 5.4);
    assert.match(a, /^[0-9a-f]{40}\.png$/);
    assert.equal(a, Database3DEditor.thumbnailCacheName('/p/3d/Hero/source/Hero.glb', 1000, 5.2), 'sub-millisecond mtime noise is ignored');
    assert.notEqual(a, Database3DEditor.thumbnailCacheName('/p/3d/Hero/source/Hero.glb', 1001, 5.4), 'a re-exported file gets a new entry');
    assert.notEqual(a, Database3DEditor.thumbnailCacheName('/q/3d/Hero/source/Hero.glb', 1000, 5.4));
});

test('cached thumbnails round-trip through the disk cache as PNG data URLs', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-thumb-cache-'));
    const projectPath = path.join(tempRoot, 'proj');
    const source = path.join(projectPath, '3d', 'Hero', 'source', 'Hero.glb');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, 'glb-bytes');
    const previousXdg = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = path.join(tempRoot, 'cache');
    try {
        const editor = Object.create(Database3DEditor.prototype);
        editor._project = () => ({ path: projectPath });
        const entry = { name: 'Hero' };
        assert.equal(editor._readCachedThumbnail(entry), null, 'nothing cached yet');
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
        const url = 'data:image/png;base64,' + png.toString('base64');
        editor._writeCachedThumbnail(entry, url);
        assert.equal(editor._readCachedThumbnail(entry), url);
        assert.equal(editor._readCachedThumbnail({ name: 'Missing' }), null, 'a model without a source file has no cache path');
        editor._writeCachedThumbnail(entry, 'data:image/jpeg;base64,AAAA');
        assert.equal(editor._readCachedThumbnail(entry), url, 'only PNG data URLs are stored');
    } finally {
        if (previousXdg === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = previousXdg;
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('the frame loop and thumbnail pass are wired to the gates', () => {
    assert.match(source, /_updateHover\(\) \{[\s\S]*?Database3DEditor\.shouldRaycastHover\(\{[\s\S]*?movedAt: this\._pointerMovedAt,[\s\S]*?inputAt: this\._lastInputAt,[\s\S]*?dragging: this\._dragging,[\s\S]*?triangles: this\._triangleCount/);
    assert.doesNotMatch(source, /const interval = 90 \+ Math\.min\(600/, 'the time-interval throttle is gone');
    assert.match(source, /this\._pointer = \{ x: event\.clientX, y: event\.clientY \};\s*this\._pointerMovedAt = performance\.now\(\);/);
    assert.match(source, /addEventListener\('wheel', event => \{\s*event\.preventDefault\(\);\s*this\._lastInputAt = performance\.now\(\);/);
    assert.match(source, /this\._dragging = true;\s*this\._lastInputAt = performance\.now\(\);/);
    assert.match(source, /async _fillThumbnails\(entries\) \{[\s\S]*?this\._thumbs\[entry\.name\] \|\| this\._readCachedThumbnail\(entry\)[\s\S]*?await this\._whenPreviewIdle\(\);[\s\S]*?const decoded = Database3DEditor\.texturesDecoded\(/);
    assert.match(source, /async _drawPreview\(entry\) \{\s*this\._loadingPreview = true;\s*try \{\s*return await this\._drawPreviewNow\(entry\);\s*\} finally \{\s*this\._loadingPreview = false;/);
    assert.match(source, /const busy = this\._loadingPreview \|\| this\._dragging\s*\|\| \(Number\.isFinite\(this\._lastInputAt\) && now - this\._lastInputAt < 600\)\s*\|\| \(Number\.isFinite\(this\._pointerMovedAt\) && now - this\._pointerMovedAt < 300\)/);
});
