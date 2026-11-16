'use strict';
// Build › Web › Play from a server: the build is one small page that shows the game from where it is hosted.
//
// A store page (itch.io) hosts a web game inside a frame of its own and limits the upload's size and file count.
// A game hosted on the author's own server (Build › Online Server, or any web host) can be shown there all the
// same: this page fills the frame with the game's own address. The upload is a few kilobytes, the game has no
// limit, and a deploy to the server is what the store's players see at once.
const fs = require('fs');
const path = require('path');
// Asked for by name: the editor's build worker (an NW.js worker thread) has no global `URL`, and every address was refused.
const { URL } = require('url');

/** The address as it will be used, or '' when it is not one a page may be sent to (only http and https). */
function remoteAddress(value) {
    let url;
    try { url = new URL(String(value || '').trim()); } catch (error) { return ''; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (!url.hostname || url.username || url.password) return '';
    return url.href;
}

const escapeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The page: the game in a frame the size of the window, and a way on when the server cannot be reached. */
function remotePage(address, title) {
    const url = remoteAddress(address);
    if (!url) throw new Error('The game address must start with https:// or http://.');
    const name = escapeHtml(title || 'Game'), link = escapeHtml(url);
    // What the game may ask the browser for through the frame: sound without a click, the whole screen, a gamepad,
    // the microphone (voice), the clipboard for a copied line. The store's own frame has to allow each as well.
    const allow = 'autoplay; fullscreen; gamepad; microphone; clipboard-write; accelerometer; gyroscope; xr-spatial-tracking; cross-origin-isolated';
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="referrer" content="origin">
<title>${name}</title>
<style>
html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
#game { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
#away { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; background: #0b0c14; color: #e8e9f2; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; text-align: center; }
#away[hidden] { display: none; }
#away a { display: inline-block; margin-top: 14px; padding: 9px 18px; border: 1px solid #7c8cff; border-radius: 6px; color: #e8e9f2; text-decoration: none; }
</style>
</head>
<body>
<iframe id="game" src="${link}" title="${name}" allow="${allow}" allowfullscreen></iframe>
<div id="away" hidden><div><div>${name} could not be reached just now.</div><a href="${link}" target="_blank" rel="noopener">Open the game in a new tab</a></div></div>
<script>
(function () {
    var frame = document.getElementById("game"), away = document.getElementById("away");
    // The keyboard goes to the game: a frame is typed into only once it has the focus.
    var focus = function () { try { frame.focus(); if (frame.contentWindow) frame.contentWindow.focus(); } catch (error) { /* another site's window: the frame's own focus is enough */ } };
    frame.addEventListener("load", focus);
    window.addEventListener("focus", focus);
    window.addEventListener("pointerdown", focus);
    // The server asked once, without reading the answer (it is another site's): only a request that cannot be made
    // at all (the server is away, the address is wrong) says so, and offers the game in a tab of its own.
    if (window.fetch) fetch(${JSON.stringify(url)}, { mode: "no-cors", cache: "no-store" }).catch(function () { away.hidden = false; });
})();
</script>
</body>
</html>
`;
}

/** Writes the build: the page alone, in a folder made empty for it. Returns { folder, address, bytes }. */
function writeRemoteBuild(folder, { url, title } = {}) {
    const page = remotePage(url, title);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'index.html'), page);
    return { folder, address: remoteAddress(url), bytes: Buffer.byteLength(page) };
}

module.exports = { remoteAddress, remotePage, writeRemoteBuild };
