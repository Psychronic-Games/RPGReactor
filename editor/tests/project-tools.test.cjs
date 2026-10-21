const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const toolSource = path.join(editorRoot, 'src', 'forge', 'ProjectTools', 'ProjectTools.js');
const ProjectTools = require(toolSource);

/**
 * Builds a throwaway project plus the small set of globals ProjectTools touches,
 * and returns a harness that drives its postMessage bridge directly.
 */
function makeHarness() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-project-tools-'));
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.mkdirSync(path.join(root, 'utilitis'), { recursive: true });
    fs.mkdirSync(path.join(root, 'img', 'sv_enemies'), { recursive: true });
    fs.writeFileSync(path.join(root, 'data', 'Enemies.json'), JSON.stringify([null, { id: 1, name: 'Bat', note: '' }]), 'utf8');
    fs.writeFileSync(path.join(root, 'data', 'States.json'), JSON.stringify([null, { id: 1, name: 'KO' }]), 'utf8');
    fs.writeFileSync(path.join(root, 'utilitis', 'HitboxEditor.html'), '<p>tool</p>', 'utf8');
    fs.writeFileSync(path.join(root, 'utilitis', 'notes.txt'), 'not a tool', 'utf8');
    fs.writeFileSync(path.join(root, 'secret.txt'), 'must never leave the project', 'utf8');
    // Smallest valid PNG.
    fs.writeFileSync(path.join(root, 'img', 'sv_enemies', 'Bat.png'), Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000000200010005fe02fea7c1b7ed0000000049454e44ae426082',
        'hex'
    ));

    const posted = [];
    const frameWindow = { postMessage: (m) => posted.push(m) };
    const state = { confirmAnswer: true };

    const previousWindow = global.window;
    const previousAlert = global.alert;
    const previousDialog = global.RRDialog;
    global.window = {
        confirm: () => state.confirmAnswer,
        alert: () => {},
        addEventListener() {},
        removeEventListener() {},
        I18n: null,
        RRWriteFileAtomicSync: require('../src/utils/FsAtomic.js')
    };
    global.alert = () => {};
    // The tool asks through the themed dialog; a test answers it by replacing window.confirm.
    global.RRDialog = { confirm: async (message, options) => global.window.confirm(message, options), alert: async () => {} };
    if (typeof globalThis.rrEscapeHtml !== 'function') {
        globalThis.rrEscapeHtml = require(path.join(editorRoot, 'src', 'utils', 'HtmlEscape.js'));
    }

    const sandbox = { require, window: global.window, nw: {}, console: { error() {} }, process };
    const loadClass = name => vm.runInNewContext(
        fs.readFileSync(path.join(editorRoot, 'src', `${name}.js`), 'utf8') + `\n${name}`, sandbox);
    const Manager = loadClass('DatabaseManager');
    const Controller = loadClass('ProjectController');
    const db = new Manager();
    db.projectPath = root;
    db.data.enemies = JSON.parse(fs.readFileSync(path.join(root, 'data', 'Enemies.json')));
    db.data.states = JSON.parse(fs.readFileSync(path.join(root, 'data', 'States.json')));
    db.data.system = { versionId: 1, gameTitle: 'Temp' };
    fs.writeFileSync(path.join(root, 'data', 'System.json'), JSON.stringify(db.data.system));
    db.captureSavedState();
    const controller = Object.create(Controller.prototype);
    Object.assign(controller, { currentProject: { path: root, name: 'Temp' }, projectLoaded: true,
        projectManager: { fs, path }, databaseManager: db,
        projectLockPath: path.join(root, '.rpgreactor.lock'), projectLockToken: 'a'.repeat(64) });
    fs.writeFileSync(controller.projectLockPath, JSON.stringify({ app: 'RPG Reactor', pid: process.pid,
        token: controller.projectLockToken, openedAt: new Date().toISOString() }));
    const tool = new ProjectTools();
    tool.projectController = controller;
    tool._syncProjectPath();
    tool.frame = { contentWindow: frameWindow };

    return {
        root, tool, posted, state, db, controller,
        send: (msg, source) => tool._onToolMessage({ source: source || frameWindow, data: msg }),
        last: () => posted[posted.length - 1],
        cleanup() {
            global.window = previousWindow;
            global.alert = previousAlert;
            if (previousDialog === undefined) delete global.RRDialog; else global.RRDialog = previousDialog;
            fs.rmSync(root, { recursive: true, force: true });
        }
    };
}

test('project tool discovery finds .html files and ignores everything else', () => {
    const h = makeHarness();
    try {
        const found = h.tool._discoverTools();
        assert.equal(found.length, 1);
        assert.equal(found[0].name, 'HitboxEditor');
        assert.equal(found[0].relPath, 'utilitis/HitboxEditor.html');
    } finally { h.cleanup(); }
});

test('the bridge answers only its own frame, and only known message types', () => {
    const h = makeHarness();
    try {
        const before = h.posted.length;
        h.send({ type: 'reactor:ready' }, { postMessage() {} });
        h.send('a string');
        h.send(null);
        h.send({ type: 'reactor:something-else' });
        assert.equal(h.posted.length, before);

        h.send({ type: 'reactor:ready' });
        const init = h.last();
        assert.equal(init.type, 'reactor:init');
        assert.equal(init.data['Enemies.json'][1].name, 'Bat');
        assert.equal(init.data['States.json'][1].name, 'KO');
    } finally { h.cleanup(); }
});

test('images are served from img/ only, and never from outside it', () => {
    const h = makeHarness();
    try {
        h.send({ type: 'reactor:image', path: 'sv_enemies/Bat' });
        assert.equal(h.last().ok, true);
        assert.ok(h.last().dataUrl.startsWith('data:image/png;base64,'));

        for (const bad of [
            '../secret.txt',
            '../../../../../../Windows/win.ini',
            'sv_enemies/Bat\u0000.png',
            ''
        ]) {
            h.send({ type: 'reactor:image', path: bad });
            assert.equal(h.last().ok, false, `expected refusal for ${JSON.stringify(bad)}`);
        }

        fs.writeFileSync(path.join(h.root, 'img', 'evil.js'), 'nope', 'utf8');
        h.send({ type: 'reactor:image', path: 'evil.js' });
        assert.equal(h.last().ok, false, 'a non-image inside img/ must be refused');
    } finally { h.cleanup(); }
});

test('saves are whitelisted, confirmed, and written as pretty JSON', async () => {
    const h = makeHarness();
    const target = path.join(h.root, 'data', 'Enemies.json');
    try {
        h.send({ type: 'reactor:ready' });
        await h.send({ type: 'reactor:save', file: '../../evil.json', data: [1] });
        assert.equal(h.last().ok, false);
        assert.equal(h.last().error, 'File not allowed');

        await h.send({ type: 'reactor:save', file: 'Enemies.json' });
        assert.equal(h.last().ok, false);

        h.state.confirmAnswer = false;
        const untouched = fs.readFileSync(target, 'utf8');
        await h.send({ type: 'reactor:save', file: 'Enemies.json', data: [null, { id: 1, name: 'CHANGED' }] });
        assert.equal(h.last().ok, false);
        assert.equal(fs.readFileSync(target, 'utf8'), untouched, 'a declined confirmation must not write');

        h.state.confirmAnswer = true;
        await h.send({ type: 'reactor:save', file: 'Enemies.json', data: [null, { id: 1, name: 'CHANGED' }] });
        assert.equal(h.last().ok, true);
        const written = fs.readFileSync(target, 'utf8');
        assert.ok(written.includes('\n  '), 'expected the two-space indentation DatabaseManager writes');
        assert.equal(JSON.parse(written)[1].name, 'CHANGED');
        assert.equal(fs.existsSync(`${target}.tmp`), false, 'the temp file must not survive');
    } finally { h.cleanup(); }
});

test('the hosting frame stays sandboxed without allow-same-origin', () => {
    // This is the whole security model. A frame that can reach the parent document
    // can use the editor's own require(), so the sandbox value must stay exactly
    // "allow-scripts". Measured under nwjs-sdk-v0.115.0; see the file header.
    const source = fs.readFileSync(toolSource, 'utf8');
    const values = [...source.matchAll(/setAttribute\(\s*['"]sandbox['"]\s*,\s*['"]([^'"]*)['"]\s*\)/g)].map(m => m[1]);
    assert.ok(values.length >= 1, 'ProjectTools must set a sandbox attribute on its frame');
    for (const value of values) {
        assert.equal(value.trim(), 'allow-scripts');
    }
    assert.ok(!/sandbox\s*\.\s*add|sandbox\s*\+=/.test(source), 'the sandbox token list must never be widened');
    assert.ok(source.includes('srcdoc'), 'the tool must be loaded through srcdoc, not a file:// src');
});

const editedEnemy = () => [null, { id: 1, name: 'Tool edit', note: '' }];
const saveEnemy = h => h.send({ type: 'reactor:save', file: 'Enemies.json', data: editedEnemy() });
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

test('a tool save survives the next ordinary database save and preserves unrelated drafts', async () => {
    const h = makeHarness();
    try {
        h.db.data.states[1].name = 'Unsaved state';
        h.db.data.enemies[1].note = 'Working note';
        h.send({ type: 'reactor:ready' });
        assert.equal(h.last().data['Enemies.json'][1].note, 'Working note', 'init includes working edits');
        const data = h.last().data['Enemies.json'];
        data[1].name = 'Tool edit';
        await h.send({ type: 'reactor:save', file: 'Enemies.json', data });
        assert.equal(h.last().ok, true);
        assert.equal(h.db.data.enemies[1].name, 'Tool edit');
        assert.equal(h.db.data.enemies[1].note, 'Working note');
        assert.notEqual(h.db.data.enemies, data, 'tool payload does not retain a live database reference');
        assert.equal(h.db.getDirtyKeys().includes('enemies'), false);
        assert.equal(h.db.getDirtyKeys().includes('states'), true);
        assert.equal(JSON.parse(fs.readFileSync(path.join(h.root, 'data/States.json')))[1].name, 'KO');
        assert.equal(h.db.data.system.versionId,
            JSON.parse(fs.readFileSync(path.join(h.root, 'data/System.json'))).versionId);
        assert.equal(h.db.dataGeneration, 1, 'late record callbacks are invalidated');

        assert.equal(await h.db.saveJSON(h.root, 'Enemies.json', h.db.data.enemies), true);
        assert.equal(JSON.parse(fs.readFileSync(path.join(h.root, 'data/Enemies.json')))[1].name, 'Tool edit');
    } finally { h.cleanup(); }
});

test('successive tool saves work without reinitializing the tool', async () => {
    const h = makeHarness();
    try {
        h.send({ type: 'reactor:ready' });
        await saveEnemy(h);
        assert.equal(h.last().ok, true);
        await h.send({ type: 'reactor:save', file: 'States.json', data: [null, { id: 1, name: 'Changed state' }] });
        assert.equal(h.last().ok, true);
        assert.equal(h.db.data.states[1].name, 'Changed state');
    } finally { h.cleanup(); }
});

for (const location of ['memory', 'disk', 'system disk']) {
    test(`a stale tool cannot overwrite newer ${location} data`, async () => {
        const h = makeHarness();
        try {
            h.send({ type: 'reactor:ready' });
            const target = path.join(h.root, 'data', location === 'system disk' ? 'System.json' : 'Enemies.json');
            if (location === 'memory') h.db.data.enemies[1].name = 'Newer edit';
            else fs.writeFileSync(target, location === 'disk' ? '[null,{"id":1,"name":"External edit"}]' : '{"gameTitle":"External"}');
            const disk = fs.readFileSync(target, 'utf8');
            const memory = JSON.stringify(h.db.data);
            await saveEnemy(h);
            assert.equal(h.last().ok, false);
            assert.match(h.last().error, /changed/);
            assert.equal(fs.readFileSync(target, 'utf8'), disk);
            assert.equal(JSON.stringify(h.db.data), memory);
        } finally { h.cleanup(); }
    });
}

test('an open Database Cancel session cannot be overwritten by a tool', async () => {
    const h = makeHarness();
    try {
        h.send({ type: 'reactor:ready' });
        global.window.reactor = { databaseEditorUI: { _dataSnapshot: JSON.stringify(h.db.data) } };
        await saveEnemy(h);
        assert.equal(h.last().ok, false);
        assert.match(h.last().error, /Close the Database/);
        assert.equal(h.db.data.enemies[1].name, 'Bat');
    } finally { h.cleanup(); }
});

for (const change of ['project', 'lock']) {
    test(`ownership is rechecked when the ${change} changes during confirmation`, async () => {
        const h = makeHarness();
        try {
            h.send({ type: 'reactor:ready' });
            global.window.confirm = () => {
                if (change === 'project') h.controller.currentProject = { path: h.root, name: 'New session' };
                else h.controller.projectLockToken = 'b'.repeat(64);
                return true;
            };
            await saveEnemy(h);
            assert.equal(h.last().ok, false);
            assert.equal(h.db.data.enemies[1].name, 'Bat');
            assert.equal(JSON.parse(fs.readFileSync(path.join(h.root, 'data/Enemies.json')))[1].name, 'Bat');
        } finally { h.cleanup(); }
    });
}

for (const failedFile of ['Enemies.json', 'System.json']) {
    test(`failed ${failedFile} replacement preserves dirty edits and can be retried`, async () => {
        const h = makeHarness();
        try {
            h.send({ type: 'reactor:ready' });
            h.db.fs = Object.assign({}, fs, {
                renameSync(from, to) {
                    if (path.basename(to) === failedFile) throw Object.assign(new Error('Disk failure'), { code: 'EIO' });
                    return fs.renameSync(from, to);
                }
            });
            await saveEnemy(h);
            assert.equal(h.last().ok, false);
            assert.equal(h.db.data.enemies[1].name, 'Tool edit');
            assert.equal(h.db.getDirtyKeys().includes('enemies'), true);
            assert.equal(fs.readdirSync(path.join(h.root, 'data')).some(name => name.includes('.tmp')), false);
            h.db.fs = fs;
            await saveEnemy(h);
            assert.equal(h.last().ok, true);
            assert.equal(h.db.getDirtyKeys().includes('enemies'), false);
        } finally { h.cleanup(); }
    });
}

test('browser saves stay dirty until persistence settles, and reject overlapping saves', async () => {
    const h = makeHarness(), flush = deferred();
    try {
        h.send({ type: 'reactor:ready' });
        global.window.RPGReactorHost = { mode: 'web', flush: () => flush.promise };
        const saving = saveEnemy(h);
        await Promise.resolve();
        assert.equal(h.db.getDirtyKeys().includes('enemies'), true);
        await saveEnemy(h);
        assert.equal(h.last().ok, false);
        assert.match(h.last().error, /in progress/);
        flush.resolve();
        await saving;
        assert.equal(h.last().ok, true);
        assert.equal(h.db.getDirtyKeys().includes('enemies'), false);
    } finally { h.cleanup(); }
});

test('browser persistence failures leave tool edits dirty for a later normal Save', async () => {
    const h = makeHarness();
    try {
        h.send({ type: 'reactor:ready' });
        global.window.RPGReactorHost = { mode: 'web', flush: async () => { throw new Error('Storage full'); } };
        await saveEnemy(h);
        assert.equal(h.last().ok, false);
        assert.equal(h.db.data.enemies[1].name, 'Tool edit');
        assert.equal(h.db.getDirtyKeys().includes('enemies'), true);
        assert.equal(await h.db.saveJSON(h.root, 'Enemies.json', h.db.data.enemies), true);
    } finally { h.cleanup(); }
});

test('an old flush cannot mark another project clean or reply to a replacement frame', async () => {
    const h = makeHarness(), flush = deferred();
    try {
        h.send({ type: 'reactor:ready' });
        global.window.RPGReactorHost = { mode: 'web', flush: () => flush.promise };
        const saving = saveEnemy(h);
        await Promise.resolve();
        h.tool.detach();
        h.controller.currentProject = { path: h.root, name: 'Another project session' };
        h.db.data = JSON.parse(JSON.stringify(h.db.data));
        h.db.savedState.enemies = 'new project baseline';
        h.tool._syncProjectPath();
        h.tool.frame = { contentWindow: { postMessage: message => h.posted.push(message) } };
        const count = h.posted.length;
        flush.resolve();
        await saving;
        assert.equal(h.db.savedState.enemies, 'new project baseline');
        assert.equal(h.posted.length, count);
    } finally { h.cleanup(); }
});

test('a newer edit during a browser flush is not marked saved', async () => {
    const h = makeHarness(), flush = deferred();
    try {
        h.send({ type: 'reactor:ready' });
        global.window.RPGReactorHost = { mode: 'web', flush: () => flush.promise };
        const saving = saveEnemy(h);
        await Promise.resolve();
        h.db.data.enemies[1].name = 'Newer edit';
        flush.resolve();
        await saving;
        assert.equal(h.db.getDirtyKeys().includes('enemies'), true);
        assert.equal(h.db.data.enemies[1].name, 'Newer edit');
    } finally { h.cleanup(); }
});

test('uninitialized and malformed tool saves cannot replace database data', async () => {
    const h = makeHarness();
    try {
        await saveEnemy(h);
        assert.equal(h.last().ok, false);
        h.send({ type: 'reactor:ready' });
        for (const data of [42, {}, 'bad', [null, 42], [{ id: 1 }]]) {
            await h.send({ type: 'reactor:save', file: 'Enemies.json', data });
            assert.equal(h.last().ok, false);
        }
        await h.send({ type: 'reactor:save', file: 'System.json', data: [] });
        assert.equal(h.last().ok, false);
        assert.equal(h.db.data.enemies[1].name, 'Bat');
    } finally { h.cleanup(); }
});

for (const link of ['file', 'parent', 'root']) {
    test(`image reads refuse a symlink in the ${link}`, () => {
        const h = makeHarness();
        try {
            let request;
            if (link === 'file') {
                fs.symlinkSync(path.join(h.root, 'secret.txt'), path.join(h.root, 'img/linked.png'));
                request = 'linked.png';
            } else if (link === 'parent') {
                fs.symlinkSync(h.root, path.join(h.root, 'img/linked'), 'junction');
                fs.writeFileSync(path.join(h.root, 'secret.png'), 'outside image folder');
                request = 'linked/secret.png';
            } else {
                fs.renameSync(path.join(h.root, 'img'), path.join(h.root, 'original-img'));
                fs.symlinkSync(path.join(h.root, 'original-img'), path.join(h.root, 'img'), 'junction');
                request = 'sv_enemies/Bat';
            }
            h.send({ type: 'reactor:image', path: request });
            assert.equal(h.last().ok, false);
            assert.equal(h.last().dataUrl, undefined);
        } finally { h.cleanup(); }
    });
}

test('database symlinks cannot leak through init or redirect writes', async () => {
    const h = makeHarness();
    try {
        h.send({ type: 'reactor:ready' });
        fs.renameSync(path.join(h.root, 'data'), path.join(h.root, 'original-data'));
        fs.symlinkSync(path.join(h.root, 'original-data'), path.join(h.root, 'data'), 'junction');
        await saveEnemy(h);
        assert.equal(h.last().ok, false);
        h.send({ type: 'reactor:ready' });
        assert.equal(Object.keys(h.last().data).length, 0);
        assert.equal(JSON.parse(fs.readFileSync(path.join(h.root, 'original-data/Enemies.json')))[1].name, 'Bat');
    } finally { h.cleanup(); }
});

test('tool discovery rejects symlinked HTML files and directories', () => {
    const h = makeHarness();
    try {
        fs.symlinkSync(path.join(h.root, 'secret.txt'), path.join(h.root, 'utilitis/linked.html'));
        fs.symlinkSync(path.join(h.root, 'utilitis'), path.join(h.root, 'tools'), 'junction');
        assert.deepEqual(h.tool._discoverTools().map(tool => tool.name), ['HitboxEditor']);
    } finally { h.cleanup(); }
});

test('a linked database file cannot be read or replaced, including dangling links', async () => {
    const h = makeHarness();
    try {
        const target = path.join(h.root, 'data/Enemies.json');
        for (const destination of ['secret.txt', 'missing.json']) {
            fs.unlinkSync(target);
            fs.symlinkSync(path.join(h.root, destination), target);
            h.send({ type: 'reactor:ready' });
            assert.equal(h.last().data['Enemies.json'], undefined);
            await saveEnemy(h);
            assert.equal(h.last().ok, false);
            assert.equal(fs.lstatSync(target).isSymbolicLink(), true);
        }
        assert.equal(fs.readFileSync(path.join(h.root, 'secret.txt'), 'utf8'), 'must never leave the project');
        assert.equal(fs.existsSync(path.join(h.root, 'missing.json')), false);
    } finally { h.cleanup(); }
});

test('an image replaced with a symlink during open is never returned', () => {
    const h = makeHarness();
    const open = fs.openSync;
    try {
        const target = path.join(h.root, 'img/sv_enemies/Bat.png');
        fs.openSync = (filename, ...args) => {
            if (filename === target) {
                fs.unlinkSync(target);
                fs.symlinkSync(path.join(h.root, 'secret.txt'), target);
            }
            return open(filename, ...args);
        };
        h.send({ type: 'reactor:image', path: 'sv_enemies/Bat.png' });
        assert.equal(h.last().ok, false);
        assert.equal(h.last().dataUrl, undefined);
    } finally { fs.openSync = open; h.cleanup(); }
});
