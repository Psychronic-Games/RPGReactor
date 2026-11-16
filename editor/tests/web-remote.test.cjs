'use strict';
// Build › Web › Play from a server: the build is one page that shows the game from where it is hosted
// (build-scripts/web-remote.cjs), for a store page whose uploads are limited.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const remote = require('../build-scripts/web-remote.cjs');

test('only an http or https address is one a page may be sent to', () => {
    assert.equal(remote.remoteAddress('https://demo.example.org'), 'https://demo.example.org/');
    assert.equal(remote.remoteAddress('  http://example.org/game/ '), 'http://example.org/game/');
    for (const not of ['', 'example.org', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://example.org/', 'https://name:word@example.org/', 'https://']) assert.equal(remote.remoteAddress(not), '', not);
    assert.throws(() => remote.remotePage('javascript:alert(1)', 'Game'), /must start with https/);
});

test('the address is read without a global URL: the editor\'s build worker has none', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'build-scripts', 'web-remote.cjs'), 'utf8');
    const holder = { exports: {} };
    require('node:vm').runInNewContext(source, { require, module: holder, String, Buffer });   // a context with no URL of its own
    const made = holder.exports;
    assert.equal(made.remoteAddress('https://web.example.org'), 'https://web.example.org/');
});

test('the page is the game in a frame the size of the window, with what the game asks the browser for, and a way on when the server is away', () => {
    const page = remote.remotePage('https://demo.example.org/play/?a=1&b=2', 'Reactor "One" <b>');
    assert.match(page, /<title>Reactor &quot;One&quot; &lt;b&gt;<\/title>/, 'a title is text, whatever it holds');
    assert.match(page, /<iframe id="game" src="https:\/\/demo\.example\.org\/play\/\?a=1&amp;b=2" title="[^"]*" allow="([^"]*)" allowfullscreen><\/iframe>/);
    const allow = /allow="([^"]*)"/.exec(page)[1];
    for (const wanted of ['autoplay', 'fullscreen', 'gamepad', 'microphone']) assert.ok(allow.split('; ').includes(wanted), wanted);
    assert.match(page, /#game \{ position: fixed; inset: 0; width: 100%; height: 100%; border: 0;/);
    // Keys reach the game: the frame takes the focus when it loads and when the page is clicked.
    assert.match(page, /frame\.addEventListener\("load", focus\);/);
    assert.match(page, /window\.addEventListener\("pointerdown", focus\);/);
    // The server away: said, with the game's own address to open.
    assert.match(page, /fetch\("https:\/\/demo\.example\.org\/play\/\?a=1&b=2", \{ mode: "no-cors", cache: "no-store" \}\)\.catch\(function \(\) \{ away\.hidden = false; \}\);/);
    assert.match(page, /<div id="away" hidden>.*could not be reached just now\..*<a href="https:\/\/demo\.example\.org\/play\/\?a=1&amp;b=2" target="_blank" rel="noopener">/);
    // Nothing from anywhere but the page itself and the game's address.
    assert.equal((page.match(/https?:\/\//g) || []).length, 3);
    assert.ok(!/<script[^>]+src=|<link/.test(page));
});

test('the build is that page alone', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-web-remote-'));
    try {
        const made = remote.writeRemoteBuild(path.join(folder, 'game-web'), { url: 'https://demo.example.org', title: 'Game' });
        assert.deepEqual(fs.readdirSync(made.folder), ['index.html']);
        assert.equal(made.address, 'https://demo.example.org/');
        assert.equal(made.bytes, fs.statSync(path.join(made.folder, 'index.html')).size);
        assert.ok(made.bytes < 8192, 'a few kilobytes (' + made.bytes + ')');
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('Build offers it with Web, asks for the address, remembers both, and the worker writes the page in place of the game', () => {
    const dialog = fs.readFileSync(path.join(__dirname, '..', 'src', 'BuildManager.js'), 'utf8');
    const worker = fs.readFileSync(path.join(__dirname, '..', 'build-scripts', 'build-worker.js'), 'utf8');
    for (const id of ['build-remote-option', 'build-remote-on', 'build-remote-address', 'build-remote-url']) assert.ok(dialog.includes('id="' + id + '"'), id);
    for (const words of ['Play from a server', 'Game address', 'Enter the address the game is played at. It starts with https://']) assert.ok(dialog.includes("tt('" + words + "')"), words);
    // Shown with Web; with it on there is nothing to pack.
    assert.match(dialog, /document\.getElementById\('build-pack-option'\)\.style\.display = web && !remote \? 'flex' : 'none';/);
    assert.match(dialog, /if \(webRemoteOn && !webRemoteUrl\) \{\s*await RRDialog\.alert\(tt\('Enter the address the game is played at\. It starts with https:\/\/'\)/);
    assert.match(dialog, /packWebFiles,\s*webRemoteUrl,/);
    // The same rule for the address in the dialog as in the build.
    const prefer = new Function(dialog.slice(dialog.indexOf('const WebRemotePreference = {'), dialog.indexOf("if (typeof window !== 'undefined') window.WebRemotePreference")) + '; return WebRemotePreference;')();
    for (const value of ['https://demo.example.org', 'http://example.org/game/', 'javascript:alert(1)', 'example.org', 'https://a:b@example.org/', '']) assert.equal(prefer.address(value), remote.remoteAddress(value), value);
    assert.match(worker, /if \(platform === 'web' && webRemoteUrl\) \{[\s\S]{0,400}webRemote\.writeRemoteBuild\(platformOutDir, \{ url: webRemoteUrl, title: gameTitle \}\);[\s\S]{0,900}\} else if \(browserGame\) \{/);
    // In every language the editor speaks.
    const reviewed = fs.readFileSync(path.join(__dirname, '..', 'src', 'I18nReviewedTranslations.js'), 'utf8');
    const block = reviewed.slice(reviewed.indexOf('// Build › Web › Play from a server.'));
    for (const id of ['ja', 'zh-Hant', 'zh-Hans', 'ko', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'pl', 'el', 'ar', 'tr', 'id', 'vi', 'th']) {
        const row = new RegExp('"' + id + '":\\[("(?:[^"\\\\]|\\\\.)*", ){3}"(?:[^"\\\\]|\\\\.)*"\\]').exec(block);
        assert.ok(row, id + ' has all four');
        assert.ok(row[0].includes('https://'), id + ' keeps the address form');
    }
});
