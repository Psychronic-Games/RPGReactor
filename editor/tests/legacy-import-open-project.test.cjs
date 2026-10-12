/**
 * File › Import Project… offered to import into an existing folder again
 * even when that folder is a project open in an editor (this one included):
 * confirming overwrote the open project's files under it.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const Dialog = require('../src/LegacyImportDialog.js');

test('a folder whose lock names a running editor counts as open', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-import-open-'));
    try {
        assert.equal(Dialog.projectOpenAt(fs, path, dir), false, 'no lock');
        fs.writeFileSync(path.join(dir, '.rpgreactor.lock'), JSON.stringify({ app: 'RPG Reactor', pid: process.pid, token: 'x' }));
        assert.equal(Dialog.projectOpenAt(fs, path, dir), true, 'this process holds it');
        fs.writeFileSync(path.join(dir, '.rpgreactor.lock'), JSON.stringify({ app: 'RPG Reactor', pid: 2 ** 22 + 12345, token: 'x' }));
        assert.equal(Dialog.projectOpenAt(fs, path, dir), false, 'a stale lock from a closed editor');
        fs.writeFileSync(path.join(dir, '.rpgreactor.lock'), 'not json');
        assert.equal(Dialog.projectOpenAt(fs, path, dir), false);
        globalThis.reactor = { projectController: { currentProject: { path: dir + path.sep } } };
        assert.equal(Dialog.projectOpenAt(fs, path, dir), true, 'the project open here, lock or not');
    } finally { delete globalThis.reactor; fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the re-import prompt is not offered over an open project', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'LegacyImportDialog.js'), 'utf8');
    assert.match(source, /if \(force && projectOpenAt\(fs, path, destination\)\) \{ errorEl\.textContent = tt\('That folder already exists and is not empty\.'\); return; \}\s*if \(force && !\(await RRDialog\.confirm\(/);
});
