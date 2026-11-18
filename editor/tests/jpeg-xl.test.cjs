'use strict';
// JPEG XL (.jxl) wherever a WebP picture is taken (2026-11-17): Chromium 157 (NW.js 0.120) decodes it. Seen in the
// game on the desktop: a lossless .jxl shown by Show Picture is the size of its PNG, with the same pixels. 3D model
// textures are left out: they are packed into GLB files, and glTF has no JPEG XL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const AssetFiles = require(path.join(editorRoot, 'src', 'utils', 'AssetFiles.js'));
const encryption = require(path.join(editorRoot, 'build-scripts', 'asset-encryption.js'));
const webPack = require(path.join(editorRoot, 'build-scripts', 'web-pack.cjs'));
const unused = require(path.join(editorRoot, 'build-scripts', 'unused-assets.cjs'));

const JXL = Buffer.from('ff0afa00112233445566778899', 'hex');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rr-jxl-'));

test('the editor and the runtime list the same picture formats, JPEG XL among them', () => {
    const runtime = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_managers.js'), 'utf8');
    const listed = JSON.parse(/ImageManager\._imageExtensions = (\[[^\]]*\]);/.exec(runtime)[1]);
    assert.deepEqual(listed, AssetFiles.IMAGE_EXTENSIONS);
    assert.ok(listed.includes('.jxl'));
});

test('a deploy encrypts a .jxl picture as it does a .webp one', () => {
    const root = temp();
    try {
        fs.mkdirSync(path.join(root, 'data'));
        fs.mkdirSync(path.join(root, 'img', 'pictures'), { recursive: true });
        fs.writeFileSync(path.join(root, 'data', 'System.json'), JSON.stringify({ gameTitle: 'T' }));
        fs.writeFileSync(path.join(root, 'img', 'pictures', 'Sky.jxl'), JXL);
        const result = encryption.encryptStagedAssets(root, { images: true, keyText: '0123456789abcdef0123456789abcdef' });
        assert.equal(result.images, 1);
        assert.equal(fs.existsSync(path.join(root, 'img', 'pictures', 'Sky.jxl')), false);
        const sealed = fs.readFileSync(path.join(root, 'img', 'pictures', 'Sky.jxl_'));
        assert.deepEqual(encryption.decryptBuffer(sealed, result.key), JXL);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a web pack stores a .jxl as it is: it is compressed already', () => {
    const big = Buffer.alloc(4096, 7);
    assert.equal(webPack.encode('img/pictures/Sky.jxl', big).method, 0);
    assert.equal(webPack.encode('img/pictures/Sky.jxl_', big).method, 0);
    assert.equal(webPack.encode('data/Map001.json', big).method, 8, 'the same bytes under another name are deflated');
});

test('Don\'t bundle unused files keeps a .jxl picture an event shows, and leaves out one nothing names', () => {
    const root = temp();
    try {
        fs.mkdirSync(path.join(root, 'data'));
        fs.mkdirSync(path.join(root, 'img', 'pictures'), { recursive: true });
        fs.writeFileSync(path.join(root, 'img', 'pictures', 'Shown.jxl'), JXL);
        fs.writeFileSync(path.join(root, 'img', 'pictures', 'Spare.jxl'), JXL);
        const show = { code: 231, indent: 0, parameters: [1, 'Shown.jxl', 0, 0, 0, 0, 100, 100, 255, 0] };
        fs.writeFileSync(path.join(root, 'data', 'Map001.json'), JSON.stringify({ events: [null, { pages: [{ list: [show] }] }] }));
        const analysis = unused.analyze(root, { usage: false });
        const left = analysis.unused.map(file => file.path);
        assert.ok(left.includes('img/pictures/Spare.jxl'), 'nothing names it: ' + JSON.stringify(left));
        assert.ok(!left.includes('img/pictures/Shown.jxl'), 'Show Picture names it');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('media screens and Battle Room effects take a .jxl picture', () => {
    const surfaces = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_media_surfaces.js'), 'utf8');
    assert.match(surfaces, /\(\?:webm\|mp4\|png\|jpe\?g\|webp\|jxl\)\$\/i/);
    assert.match(surfaces, /\(\?:png\|jpe\?g\|webp\|jxl\)\$\/i\.test\(path\)/);
    const room = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_battle_room.js'), 'utf8');
    assert.match(room, /const image=\/\\\.\(png\|jpe\?g\|webp\|jxl\)\$\/i\.test\(effect\.video\.file\)/);
});
