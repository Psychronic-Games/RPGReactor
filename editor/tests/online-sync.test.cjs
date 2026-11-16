'use strict';
// Build › Online Server sends only the files that changed since the deploy before (build-scripts/online-sync.cjs).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sync = require('../build-scripts/online-sync.cjs');

function folders() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-online-sync-'));
    const src = path.join(root, 'build'), dest = path.join(root, 'server');
    fs.mkdirSync(src); fs.mkdirSync(dest);
    return { root, src, dest };
}
const put = (root, rel, text) => { const at = path.join(root, rel); fs.mkdirSync(path.dirname(at), { recursive: true }); fs.writeFileSync(at, text); };
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('the first deploy sends every file; the next sends only what changed and removes what the game no longer has', () => {
    const { root, src, dest } = folders();
    try {
        put(src, 'index.html', '<html>'); put(src, 'js/reactor_main.js', 'revision 1'); put(src, 'img/a.png', 'aaaa'); put(src, 'img/old.png', 'old');
        // What is in the folder already and is not the game's: a page of the owner's, players' data.
        put(dest, 'notes.txt', 'mine'); put(dest, 'reactor-online/data/save.json', '{}');
        let r = sync.syncFolder(src, dest);
        assert.deepEqual([r.total, r.copied, r.kept, r.removed, r.first], [4, 4, 0, 0, true]);
        assert.match(sync.describe(r), /Every file sent \(4 files/);
        assert.equal(read(dest, 'js/reactor_main.js'), 'revision 1');

        r = sync.syncFolder(src, dest);
        assert.deepEqual([r.copied, r.kept, r.first], [0, 4, false], 'nothing changed: nothing sent');

        // A one-line fix of the same length, a new picture, a picture dropped.
        put(src, 'js/reactor_main.js', 'revision 2'); put(src, 'img/b.png', 'bbbb'); fs.rmSync(path.join(src, 'img/old.png'));
        const sent = [];
        r = sync.syncFolder(src, dest, { onCopy: rel => sent.push(rel) });
        assert.deepEqual(sent.sort(), ['img/b.png', 'js/reactor_main.js'], 'a change of the same size is still seen (by its contents)');
        assert.deepEqual([r.total, r.copied, r.kept, r.removed], [4, 2, 2, 1]);
        assert.match(sync.describe(r), /^2 of 4 files sent .*; 2 unchanged; 1 no longer in the game removed\.$/);
        assert.equal(read(dest, 'js/reactor_main.js'), 'revision 2');
        assert.equal(fs.existsSync(path.join(dest, 'img/old.png')), false);
        assert.equal(read(dest, 'notes.txt'), 'mine', 'what the deploy did not put there is never touched');
        assert.equal(read(dest, 'reactor-online/data/save.json'), '{}');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a file missing or cut short on the server is sent again, and a deploy that stopped halfway is made good by the next', () => {
    const { root, src, dest } = folders();
    try {
        put(src, 'a.txt', 'alpha'); put(src, 'b.txt', 'bravo'); put(src, 'c.txt', 'charlie');
        sync.syncFolder(src, dest);
        fs.rmSync(path.join(dest, 'a.txt')); fs.writeFileSync(path.join(dest, 'b.txt'), 'br');
        let r = sync.syncFolder(src, dest);
        assert.deepEqual([r.copied, r.kept], [2, 1]);
        assert.equal(read(dest, 'a.txt'), 'alpha'); assert.equal(read(dest, 'b.txt'), 'bravo');
        // Stopped halfway: one new file landed, the record was never written.
        put(src, 'a.txt', 'ALPHA'); put(src, 'c.txt', 'CHARLIE');
        fs.copyFileSync(path.join(src, 'a.txt'), path.join(dest, 'a.txt'));
        r = sync.syncFolder(src, dest);
        assert.equal(r.copied, 2, 'both differ from the record that stands: both go');
        assert.equal(read(dest, 'c.txt'), 'CHARLIE');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('`full` sends everything; a folder a whole copy has just filled can be taken as sent; the record names nothing outside the folder', () => {
    const { root, src, dest } = folders();
    try {
        put(src, 'a.txt', 'alpha'); put(src, 'js/b.js', 'bravo');
        sync.syncFolder(src, dest);
        assert.equal(sync.syncFolder(src, dest, { full: true }).copied, 2);
        // No record, the files already there from a whole copy of this build.
        fs.rmSync(path.join(dest, sync.MANIFEST));
        let r = sync.syncFolder(src, dest, { trustExisting: true });
        assert.deepEqual([r.copied, r.kept, r.first], [0, 2, true]);
        assert.ok(sync.readManifest(dest).files['js/b.js'].hash);
        // Without that word a folder with no record is sent whole.
        fs.rmSync(path.join(dest, sync.MANIFEST));
        assert.equal(sync.syncFolder(src, dest).copied, 2);
        // A record someone edited cannot make the deploy remove a file outside the folder.
        put(root, 'outside.txt', 'keep');
        const record = sync.readManifest(dest); record.files['../outside.txt'] = { size: 4, hash: 'x' };
        fs.writeFileSync(path.join(dest, sync.MANIFEST), JSON.stringify(record));
        sync.syncFolder(src, dest);
        assert.equal(read(root, 'outside.txt'), 'keep');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the Build worker sends an Online Server\'s folder through it', () => {
    const worker = fs.readFileSync(path.join(__dirname, '..', 'build-scripts', 'build-worker.js'), 'utf8');
    assert.match(worker, /platform === 'online' && !packOnline\) logGood\(onlineSync\.describe\(onlineSync\.syncFolder\(stagingDir, browserDir, \{ full: !!online\.full, trustExisting: !!online\.trustExisting \}\)\)\);/);
    assert.match(worker, /logGood\(onlineSync\.describe\(onlineSync\.syncFolder\(browserDir, platformOutDir,/);
});
