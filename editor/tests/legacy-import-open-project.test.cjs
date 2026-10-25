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
        fs.writeFileSync(path.join(dir, '.rpgreactor.lock'), JSON.stringify({ app: 'RPG Reactor', pid: process.pid, token: 'x', project: fs.realpathSync(dir) }));
        assert.equal(Dialog.projectOpenAt(fs, path, dir), true, 'this process holds it');
        fs.writeFileSync(path.join(dir, '.rpgreactor.lock'), JSON.stringify({ app: 'RPG Reactor', pid: 2 ** 22 + 12345, token: 'x' }));
        assert.equal(Dialog.projectOpenAt(fs, path, dir), false, 'a stale lock from a closed editor');
        fs.writeFileSync(path.join(dir, '.rpgreactor.lock'), 'not json');
        assert.equal(Dialog.projectOpenAt(fs, path, dir), false);
        globalThis.reactor = { projectController: { currentProject: { path: dir + path.sep } } };
        assert.equal(Dialog.projectOpenAt(fs, path, dir), true, 'the project open here, lock or not');
    } finally { delete globalThis.reactor; fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a copied lock belongs to its original project, even while that process lives', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-import-copied-lock-'));
    try {
        const original = path.join(dir, 'original'), copy = path.join(dir, 'copy');
        fs.mkdirSync(original); fs.mkdirSync(copy);
        const lock = { app: 'RPG Reactor', pid: process.pid, project: fs.realpathSync(original), openedAt: new Date().toISOString() };
        for (const folder of [original, copy]) fs.writeFileSync(path.join(folder, '.rpgreactor.lock'), JSON.stringify(lock));
        assert.equal(Dialog.projectOpenAt(fs, path, original), true);
        assert.equal(Dialog.projectOpenAt(fs, path, copy), false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a different path to the current project still counts as open without its lock', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-import-alias-'));
    try {
        const project = path.join(dir, 'project'), alias = path.join(dir, 'alias');
        fs.mkdirSync(project);
        try { fs.symlinkSync(project, alias, process.platform === 'win32' ? 'junction' : 'dir'); }
        catch (error) { if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('Directory links unavailable'); return; } throw error; }
        globalThis.reactor = { projectController: { currentProject: { path: project } } };
        assert.equal(Dialog.projectOpenAt(fs, path, alias), true);
    } finally { delete globalThis.reactor; fs.rmSync(dir, { recursive: true, force: true }); }
});

test('deleting a current project folder keeps its in-memory ownership until the project closes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-import-deleted-'));
    try {
        const project = path.join(dir, 'project'); fs.mkdirSync(project);
        globalThis.reactor = { projectController: { currentProject: { path: project } } };
        fs.rmSync(project, { recursive: true });
        assert.equal(Dialog.projectOpenAt(fs, path, project), true);
        globalThis.reactor.projectController.currentProject = null;
        assert.equal(Dialog.projectOpenAt(fs, path, project), false, 'no name reservation remains after closing');
        assert.equal(fs.existsSync(project), false, 'checking the deleted path does not recreate it');
    } finally { delete globalThis.reactor; fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a live process alone, without a Reactor lock, does not reserve a project name', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-import-unrelated-lock-'));
    try {
        fs.writeFileSync(path.join(dir, '.rpgreactor.lock'), JSON.stringify({ app: 'other', pid: process.pid }));
        assert.equal(Dialog.projectOpenAt(fs, path, dir), false);
        for (const pid of [0, -process.pid, String(process.pid), 1.5]) {
            fs.writeFileSync(path.join(dir, '.rpgreactor.lock'), JSON.stringify({ app: 'RPG Reactor', pid }));
            assert.equal(Dialog.projectOpenAt(fs, path, dir), false);
        }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('suggested names reuse deleted folders and avoid existing copies, files and the current deleted project', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-import-available-name-'));
    try {
        const base = 'Sunset (Reactor)', first = path.join(dir, base);
        assert.equal(Dialog.availableProjectName(fs, path, dir, base), base);
        fs.mkdirSync(first);
        fs.writeFileSync(path.join(dir, base + ' 2'), 'a file also occupies a name');
        assert.equal(Dialog.availableProjectName(fs, path, dir, base), base + ' 3');
        fs.rmSync(first, { recursive: true });
        assert.equal(Dialog.availableProjectName(fs, path, dir, base), base, 'deleted names are available immediately');
        globalThis.reactor = { projectController: { currentProject: { path: first } } };
        assert.equal(Dialog.availableProjectName(fs, path, dir, base), base + ' 3', 'an open in-memory project keeps its destination');
        globalThis.reactor.projectController.currentProject = null;
        assert.equal(Dialog.availableProjectName(fs, path, dir, base), base);
        assert.equal(fs.existsSync(first), false, 'choosing a name writes nothing');
    } finally { delete globalThis.reactor; fs.rmSync(dir, { recursive: true, force: true }); }
});
