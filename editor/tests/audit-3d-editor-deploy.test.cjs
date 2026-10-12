// Audit 2026-10-02: the Deploy dialog's build lifecycle.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'BuildManager.js'), 'utf8');

function harness() {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { id, value: id === 'build-output-path' ? '/out' : 'same', checked: id === 'build-platform-web', style: {}, appendChild() {}, scrollTop: 0, scrollHeight: 0, innerHTML: '', textContent: '' });
        return elements.get(id);
    };
    const workers = [];
    class Worker {
        constructor(file, options) { this.handlers = {}; this.options = options; this.terminated = false; workers.push(this); }
        on(type, fn) { this.handlers[type] = fn; return this; }
        terminate() { this.terminated = true; }
    }
    let saves = 0; const releases = [];
    const context = {
        console, setTimeout, clearTimeout, __dirname: '/app', process: { versions: { nw: '0.107.0' }, execPath: '/nw', cwd: () => '/app' },
        alert: () => {}, confirm: () => true,
        require: name => name === 'worker_threads' ? { Worker } : name === 'fs' ? { existsSync: () => true } : require(name),
        document: { getElementById: element, createElement: () => element('x' + Math.random()), querySelector: () => ({ value: 'cache' }) },
        DeploymentPathPreferences: { save() {} },
        window: { reactor: { projectController: { getCurrentProject: () => ({ path: '/p', name: 'P' }), saveAll: () => { saves++; return new Promise(resolve => { releases.push(resolve); }); } } } }
    };
    vm.createContext(context);
    vm.runInContext(source + '\n;globalThis.BuildManager = BuildManager;', context);
    const manager = Object.create(context.BuildManager.prototype);
    Object.assign(manager, { isBuilding: false, worker: null, downloadProgressRows: new Map(), versionPicker: { load: async () => {}, hasVersion: () => true } });
    manager.selectedRuntimeLocales = () => [];
    manager.assetOptimizationSettings = () => ({});
    return { manager, workers, saved: () => saves, finishSave: () => { for (const resolve of releases.splice(0)) resolve(true); } };
}

test('a second Start Build while the project saves starts no second worker', async () => {
    const { manager, workers, saved, finishSave } = harness();
    const first = manager.startBuild();
    const second = manager.startBuild();
    finishSave();
    await Promise.all([first, second]);
    assert.equal(saved(), 1, 'the project is saved once');
    assert.equal(workers.length, 1, 'one worker');
});

test('a cancelled build\'s late exit does not end the build started after it', async () => {
    const { manager, workers, finishSave } = harness();
    let pending = manager.startBuild(); finishSave(); await pending;
    const old = workers[0];
    manager.cancelBuild();
    assert.equal(old.terminated, true);
    pending = manager.startBuild(); finishSave(); await pending;
    assert.equal(workers.length, 2);
    old.handlers.exit(1);
    assert.equal(manager.isBuilding, true, 'the new build is still running');
    assert.equal(manager.worker, workers[1]);
});
