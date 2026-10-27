'use strict';
// Randomize › which parts (2026-10-24): any mix of a builder's parts, ticked; every box ticked is Everything.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const store = new Map();
global.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const Menu = require(path.join(__dirname, '..', 'src', 'forge', 'RandomPartsMenu.js'));
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const PARTS = [['body', 'Body'], ['face', 'Face'], ['hair', 'Hair'], ['outfit', 'Outfit'], ['colors', 'Colors']];

test('every part ticked rolls everything at once; some ticked roll just those, in the parts\' order', () => {
    assert.deepEqual(Menu.scopesFor(PARTS, new Set(PARTS.map(p => p[0]))), ['all']);
    assert.deepEqual(Menu.scopesFor(PARTS, new Set(['hair', 'face', 'body'])), ['body', 'face', 'hair']);
    assert.deepEqual(Menu.scopesFor(PARTS, new Set(['outfit'])), ['outfit']);
    assert.deepEqual(Menu.scopesFor(PARTS, new Set()), []);
    assert.equal(Menu.summary(PARTS, new Set(['face', 'hair']), t => t), 'Face, Hair');
    assert.equal(Menu.summary(PARTS, new Set(PARTS.map(p => p[0])), t => t), 'Everything');
});

test('the choice is remembered per builder, and a part added later starts ticked', () => {
    assert.deepEqual([...Menu.load('t-a', PARTS)].sort(), PARTS.map(p => p[0]).sort(), 'nothing kept: all ticked');
    Menu.save('t-a', new Set(['outfit']), PARTS);
    assert.deepEqual([...Menu.load('t-a', PARTS)], ['outfit']);
    const more = PARTS.concat([['bodyart', 'Body art']]);
    assert.deepEqual([...Menu.load('t-a', more)].sort(), ['bodyart', 'outfit'], 'a new part is ticked, the old choice kept');
    store.set('rr-random-parts:t-b', '{broken');
    assert.equal(Menu.load('t-b', PARTS).size, PARTS.length, 'a damaged choice falls back to everything');
});

test('both builders use the boxes in place of the one-scope select, and the page loads the helper first', () => {
    for (const file of ['src/forge/Character3D/Character3DBuilder.js', 'src/forge/Props/PropBuilder.js']) {
        const src = read(file);
        assert.ok(src.includes('RRRandomPartsMenu.html('), file);
        assert.ok(src.includes('RRRandomPartsMenu.scopesFor('), file);
        assert.ok(!src.includes('rr-c3d-random-scope rr-select'), file + ' has no scope select');
    }
    const page = read('index.html');
    assert.ok(page.indexOf('src/forge/RandomPartsMenu.js') > 0 && page.indexOf('src/forge/RandomPartsMenu.js') < page.indexOf('src/forge/Character3D/Character3DBuilder.js'));
    assert.ok(page.indexOf('src/forge/RandomPartsMenu.js') < page.indexOf('src/forge/Props/PropBuilder.js'));
});
