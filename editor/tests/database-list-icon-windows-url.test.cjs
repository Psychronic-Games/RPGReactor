'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'DatabaseEditorUI.js'), 'utf8');
require(path.join(__dirname, '..', 'src', 'utils', 'EncryptedAssets.js'));
const RRAssetFiles = require(path.join(__dirname, '..', 'src', 'utils', 'AssetFiles.js'));

/** The list-icon URL builder, lifted from applyListIcon so the shipped rule runs. */
function imageUrl(isWeb, host) {
    const at = source.indexOf('const imageUrl = p =>');
    assert.ok(at >= 0, 'the builder exists');
    const end = source.indexOf(';', at);
    const expr = source.slice(at + 'const imageUrl = '.length, end);
    // eslint-disable-next-line no-new-func
    return new Function('window', 'RRAssetFiles', `return ${expr};`)(host, RRAssetFiles);
}

test('a Windows project path becomes a file URL Chromium can open', () => {
    const url = imageUrl(false, {})('E:\\Game Dev\\RPG Maker\\Projects\\Reactor One\\img\\faces\\Actor1.png');
    assert.strictEqual(url, 'file:///E:/Game%20Dev/RPG%20Maker/Projects/Reactor%20One/img/faces/Actor1.png');
    assert.ok(!url.includes('%5C'), 'backslashes are separators, never percent-encoded');
});

test('POSIX paths and # characters survive', () => {
    const url = imageUrl(false, {})('/home/me/proj/img/faces/Set #2.png');
    assert.strictEqual(url, 'file:///home/me/proj/img/faces/Set%20%232.png');
});

test('the browser host resolves through its own asset bridge', () => {
    const seen = [];
    const url = imageUrl(true, { RPGReactorAssetUrl: p => { seen.push(p); return 'data:x'; } })('img/faces/A.png');
    assert.strictEqual(url, 'data:x');
    assert.deepStrictEqual(seen, ['img/faces/A.png']);
});
