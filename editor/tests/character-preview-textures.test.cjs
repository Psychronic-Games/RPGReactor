'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PreviewTextures = require('../src/forge/Character3D/CharacterPreviewTextures.js');
const { renderPayload } = require('../src/forge/Character3D/CharacterPreviewWorker.cjs');

test('thumbnail textures average coverage without dark fringes and preserve their sources', () => {
    const source = { name: 'hair', width: 2, height: 2,
        data: Uint8Array.from([255, 120, 0, 255, 0, 0, 0, 0, 255, 120, 0, 255, 0, 0, 0, 0]) };
    const original = source.data.slice();
    const small = PreviewTextures.thumbnail(source, 1);
    assert.equal(small.width, 1); assert.equal(small.height, 1);
    assert.deepEqual(Array.from(small.data), [255, 120, 0, 128]);
    assert.deepEqual(source.data, original);
    assert.equal(PreviewTextures.thumbnail(source, 1), small, 'immutable pictures are reduced once, not once per variant');
    assert.equal(PreviewTextures.thumbnail(source, 2), source, 'small pictures do not need another buffer');
    assert.equal(PreviewTextures.thumbnail(null), null);
});

test('non-square pictures retain aspect and odd dimensions cover every source pixel', () => {
    const source = { width: 5, height: 3, data: new Uint8Array(5 * 3 * 4).fill(255) };
    const small = PreviewTextures.thumbnail(source, 3);
    assert.equal(small.width, 3); assert.equal(small.height, 1);
    assert.ok(small.data.every(value => value === 255));
    const transparent = PreviewTextures.thumbnail({ width: 2, height: 2, data: new Uint8Array(16) }, 1);
    assert.ok(transparent.data.every(value => value === 0));
});

test('static payloads send only small visible maps; ordinary previews retain full textures and relief', () => {
    const diffuse = { width: 512, height: 256, data: new Uint8Array(512 * 256 * 4).fill(255) };
    const source = { height: 1, parts: [{ texture: 'color', normalTexture: 'relief', emissiveTexture: 'glow' }],
        textures: { color: diffuse, relief: diffuse, glow: diffuse, unused: diffuse } };
    const thumb = renderPayload(source, { static: true, atlasSize: 128 });
    assert.deepEqual(Object.keys(thumb.result.textures), ['color', 'relief', 'glow']);
    assert.equal(thumb.result.textures.color.width, 128);
    assert.equal(thumb.result.textures.color.height, 64);
    assert.equal(source.textures.color.width, 512);
    assert.equal(source.textures.color.data.length, 512 * 256 * 4);
    const full = renderPayload(source);
    assert.deepEqual(Object.keys(full.result.textures), ['color', 'relief', 'glow', 'unused']);
    assert.equal(full.result.textures.color.width, 512);
    assert.ok(thumb.bytes < full.bytes / 16);
});

test('worker payloads retain constant hardware emission and its brightness', () => {
    for (const intensity of [0,.35,1]) {
        const payload = renderPayload({height:1,parts:[{name:'indicator',emissive:'#82e5ff',emissiveIntensity:intensity}],textures:{}},{static:true});
        assert.equal(payload.result.parts[0].emissive,'#82e5ff');
        assert.equal(payload.result.parts[0].emissiveIntensity,intensity);
    }
});

test('the browser worker loads the same texture reducer as the Node worker', () => {
    const scope = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/CharacterPreviewTextures.js'), 'utf8'), scope);
    const source = { width: 2, height: 2, data: new Uint8Array(16).fill(255) };
    assert.deepEqual(Array.from(scope.RRCharacterPreviewTextures.thumbnail(source, 1).data), Array.from(PreviewTextures.thumbnail(source, 1).data));
});
