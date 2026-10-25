'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const filename = path.join(__dirname, '../src/forge/Character3D/CharacterSkin.js');
const Body = require('../src/forge/Character3D/HumanBody.js');
require('../src/forge/Character3D/CharacterHair.js');
const Skin = require(filename);
const source = fs.readFileSync(filename, 'utf8');
const referenceSource = source.replace('const raster = rasterPlan(pack, size), owners = raster.owners;', '')
    .replace('p.noise = raster.noise;', '').replace('if (owners[o] !== t + 1) continue;', '');
assert.notEqual(referenceSource, source);
function loadSource(text) {
    const previous = global.RRCharacterSkin;
    const entry = new Module(filename, module);
    entry.filename = filename; entry.paths = Module._nodeModulePaths(path.dirname(filename));
    entry._compile(text, filename);
    global.RRCharacterSkin = previous;
    return entry.exports;
}
const Reference = loadSource(referenceSource);
const hash = picture => createHash('sha256').update(picture.data).digest('hex');
let pack;
test.before(async () => { pack = await Body.loadPack(); });

test('one shade per final texel matches overlapping-triangle painting for every skin pattern', () => {
    for (const [type] of Skin.PATTERNS) {
        const settings = { type, color: '#3a6751', belly: '#e6c29c', amount: 0.8, scale: 1.2 };
        const options = { size: 64, age: 65, beard: 0.6, scalp: { style: 'sidePart', color: '#352117', recede: 0.3 } };
        assert.equal(hash(Skin.paint(pack, '#c69c7f', settings, options)), hash(Reference.paint(pack, '#c69c7f', settings, options)), type);
    }
});

test('cached raster/noise data preserves skin changes, makeup, facial hair, anatomy and texture edges', () => {
    const variants = [
        ['#e1b697', { lips: '#b02040', eyeshadow: '#46305d', blush: 0.6 }, { size: 128, scalp: { style: 'long', color: '#212030' } }],
        ['#603521', { belly: '#9f7050' }, { size: 256, beard: 0.8, facial: { style: 'fullBeard', color: '#331c12' }, age: 80 }],
        ['#9487a1', { type: 'stripes' }, { size: 128, scalp: { style: 'ponytail', color: '#6d3020', recede: 0.8 } }],
        ['#c69c7f', {}, { size: 32, earHoles: true, anatomy: { detail: true, female: true, areola: 1.3, fold: 0.8 } }],
        ['#1e372c', { type: 'scales' }, { size: 256, bodyHair: Skin.normalizeBodyHair({ amount: 0.5, fur: 0.4, color: '#392510' }) }],
        ['#c69c7f', {}, { size: 512 }]
    ];
    for (const [color, settings, options] of variants) {
        const expected = Reference.paint(pack, color, settings, options), actual = Skin.paint(pack, color, settings, options);
        assert.equal(hash(actual), hash(expected), JSON.stringify([color, settings, options]));
        assert.equal(actual.width, options.size);
        assert.equal(actual.height, options.size);
        assert.equal(hash(Skin.paint(pack, color, settings, options)), hash(expected), 'reusing cached noise is byte-identical');
    }
});

test('fur alpha and strand coverage match the original painter', () => {
    const hair = Skin.normalizeBodyHair({ amount: 0.8, fur: 0.7, color: '#533e2d' });
    assert.equal(hash(Skin.paintFur(pack, hair, { size: 32 })), hash(Reference.paintFur(pack, hair, { size: 32 })));
});

test('only two small raster/noise plans stay cached; full-resolution plans are temporary', () => {
    const loaded = loadSource(source.replace('const api = {', 'const api = { testRaster: { rasterPlan, rasterCache },'));
    const { rasterPlan, rasterCache } = loaded.testRaster;
    const first = rasterPlan(pack, 128);
    assert.equal(rasterPlan(pack, 128), first);
    rasterPlan(pack, 256); rasterPlan(pack, 64);
    assert.equal(rasterCache.get(pack).size, 2);
    assert.equal(rasterCache.get(pack).has(128), false);
    const full = rasterPlan(pack, 512);
    assert.equal(full.noise, null);
    assert.equal(rasterCache.get(pack).has(512), false);
    const foreignPack = { body: pack.body };
    assert.notEqual(rasterPlan(foreignPack, 64), rasterPlan(pack, 64), 'packs do not share cache ownership');
});
