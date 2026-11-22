// RPG Reactor ships none of RPG Maker MZ's or MV's default assets, nor Dreams Circle's EVFX effects
// (removed from the Demo on 2026-11-21; its battle effects are rebuilt with the Forge Effekseer
// generator). src/steam/stock-asset-hashes.json holds their fingerprints, not the files, so this runs
// anywhere, CI included. A match means a copy came back: replace it with our own, don't add an exception.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repo = path.resolve(__dirname, '..', '..');
const { hashes } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'steam', 'stock-asset-hashes.json'), 'utf8'));
const ASSET = /\.(png|jpe?g|webp|ogg|m4a|mp3|wav|efkefc|efkmodel|efkmat|mp4|webm|rpgmvp|rpgmvo|rpgmvm)$/i;
const SKIP = new Set(['node_modules', 'save', '.git', 'reactor-builder']);

function walk(dir, out) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (ASSET.test(entry.name)) out.push(full);
    }
    return out;
}

test('the Demo, the editor and the runtime ship no RPG Maker default or EVFX asset', () => {
    const files = ['template/Demo', 'editor', 'runtime'].flatMap(d => walk(path.join(repo, d), []));
    assert.ok(files.length > 300, `expected the Demo's assets, found ${files.length} files`);
    const found = files
        .map(f => ({ f: path.relative(repo, f), h: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 20) }))
        .filter(({ h }) => hashes[h])
        .map(({ f, h }) => `${f} (${hashes[h]})`);
    assert.deepEqual(found, [], 'copies of stock assets');
});
