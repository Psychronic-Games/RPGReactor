'use strict';
// Arriving among a crowd: a player shows no body until their own character is ready, a character is warmed where
// nobody sees it before it is shown, and the name screen wears the character being made (runtime 20261105.4).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(repoRoot, 'runtime', file), 'utf8');

test('a player whose own character is on its way shows nothing, not their actor; one that cannot be had shows the actor', () => {
    const online = read('reactor_online.js');
    assert.match(online, /if \(character\.modelSpec\) return character\.modelSpec;\s*\/\/[^\n]*\n\s*if \(character\.modelId && !character\.lookFailed\) return null;/);
    assert.match(online, /if \(spec\) peer\.modelSpec = spec; else peer\.lookFailed = true;/);
    assert.match(online, /\.catch\(error => \{ if \(peer\.modelId === id\) peer\.lookFailed = true;/);
});

test('the name screen wears the character being made', () => {
    const creator = read('reactor_character_creator.js');
    assert.match(creator, /const url = typeof this\._studio\.portrait === "function" \? this\._studio\.portrait\(\) : "";\s*if \(url\) await ReactorCharacters\.wearPreviewFace\(actor, url\)/);
    assert.match(creator, /const name = "Character-preview"/);
    // The game's face loader serves every "Character-" face from the creator's own pictures.
    assert.match(creator, /if \(String\(filename\)\.startsWith\("Character-"\)\) return ReactorCharacters\.faces\.get\(filename\)/);
});

test('a merged character is warmed offscreen, through a target set up as the view\'s, on the uploads\' queue', () => {
    const models = read('reactor_3d_models.js');
    assert.match(models, /await this\.within\(this\.preload\([^)]*\)\), this\.WARM_WAIT_MS \* 4\);\s*await this\.within\(this\.warm\(template\), this\.WARM_WAIT_MS \+ 1000\);/);
    assert.match(models, /pixels\.isXRRenderTarget = true;\s*pixels\.texture\.internalFormat = "RGBA8";/);
    assert.match(models, /compiling = renderer\.compileAsync\(scene, camera, target \|\| null\)\.then\(\(\) => true\);[\s\S]{0,120}?await this\.within\(compiling, this\.WARM_WAIT_MS\);/);
    assert.match(models, /warm\(template\) \{\s*const run = \(\) => this\.warmNow\(template\);\s*const turn = \(this\._uploads \|\| Promise\.resolve\(\)\)\.then\(run, run\);/);
});

test('a built character\'s pictures are decoded in the GLB worker, not on the main thread', () => {
    const models = read('reactor_3d_models.js'), creator = read('reactor_character_creator.js');
    assert.match(models, /decode: options && options\.decode > 0 \? options\.decode : 0/);
    assert.match(models, /if \(!\(data\.decode > 0\) \|\| typeof createImageBitmap !== 'function'\) \{ send\(null\); return; \}/);
    assert.match(creator, /parseGlbAsync\(glb\.slice\(0\), preview \? undefined : \{ decode: cap \}\)/);
});

test('a reflection waits for a mesh\'s pictures as the view does, and the check reaches pictures handed over in userData', () => {
    const core = read('reactor_3d.js');
    const passHide = core.slice(core.indexOf('    passHide(renderer, scene, camera, kind) {'), core.indexOf('\n    }\n};', core.indexOf('    passHide(renderer, scene, camera, kind) {')));
    assert.match(passHide, /!this\.picturesReady\(renderer, material\)\) ready = false;\s*if \(entry && entry\.version === material\.version/, 'checked before a ready program moves on');
    const pictures = core.slice(core.indexOf('    picturesReady(renderer, material) {'), core.indexOf('    compileGuarded('));
    assert.match(pictures, /const data = material\.userData;/);
    assert.match(pictures, /value\.value\.isTexture/, 'a uniform\'s { value } as well as a texture');
    assert.match(core, /UPLOAD_BYTES_PER_FRAME: 4 \* 1024 \* 1024,/, 'a 2048 sheet goes up in bands, not whole');
});

test('a merged array\'s mip levels are made after its last layer, not after every one', () => {
    const models = read('reactor_3d_models.js');
    assert.match(models, /array\.generateMipmaps = mips && \(layer === 0 \|\| layer === depth - 1\);/);
    assert.match(models, /await this\.nextFrame\(\);\s*\}\s*array\.generateMipmaps = mips;/);
});
