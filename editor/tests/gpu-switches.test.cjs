const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const GPU_ARGS = ['--force-high-performance-gpu', '--ignore-gpu-blocklist'];

function loadProjectManager() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'ProjectManager.js'), 'utf8');
    return vm.runInNewContext(`${source}\nProjectManager;`, {
        RRJson: require('../src/utils/JsonFiles.js'), console, process, require, nw: {}
    });
}

function tempProject(packageText, reactor = true) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-gpu-switches-'));
    fs.writeFileSync(path.join(dir, 'package.json'), packageText);
    fs.writeFileSync(path.join(dir, 'index.html'), reactor ? '<script src="js/reactor_main.js"></script>' : '<script src="js/main.js"></script>');
    return dir;
}

test('the GPU switches are the Chromium 144 spellings', () => {
    const ProjectManager = loadProjectManager();
    assert.deepEqual([...ProjectManager.GPU_CHROMIUM_ARGS], GPU_ARGS);
});

test('a new project manifest asks for the discrete GPU and hardware WebGL', () => {
    const ProjectManager = loadProjectManager();
    const args = new ProjectManager().getStarterPackage('Game', '1.0.0')['chromium-args'].split(' ');
    for (const arg of GPU_ARGS) assert.ok(args.includes(arg), arg);
    assert.ok(args.includes('--force-color-profile=srgb'));
});

test('the editor manifest carries the GPU switches', () => {
    const args = JSON.parse(fs.readFileSync(path.join(editorRoot, 'package.json'), 'utf8'))['chromium-args'].split(/\s+/);
    for (const arg of GPU_ARGS) assert.ok(args.includes(arg), arg);
});

test('applyGpuChromiumArgs appends after the project arguments, once', () => {
    const manager = new (loadProjectManager())();
    const pkg = { 'chromium-args': '--force-color-profile=srgb --window-size=816,624 --my-flag' };
    assert.equal(manager.applyGpuChromiumArgs(pkg), true);
    assert.equal(pkg['chromium-args'], '--force-color-profile=srgb --window-size=816,624 --my-flag --force-high-performance-gpu --ignore-gpu-blocklist --disable-gpu-vsync --disable-frame-rate-limit');
    assert.equal(manager.applyGpuChromiumArgs(pkg), false, 'nothing to add the second time');
    const partial = { 'chromium-args': '--ignore-gpu-blocklist' };
    manager.applyGpuChromiumArgs(partial);
    assert.equal(partial['chromium-args'], '--ignore-gpu-blocklist --force-high-performance-gpu --disable-gpu-vsync --disable-frame-rate-limit');
    const none = {};
    manager.applyGpuChromiumArgs(none);
    assert.equal(none['chromium-args'], GPU_ARGS.join(' ') + ' --disable-gpu-vsync --disable-frame-rate-limit');
});

test('reactorHighPerformanceGpu: false takes the switches out and keeps the rest', () => {
    const manager = new (loadProjectManager())();
    const pkg = { reactorHighPerformanceGpu: false, 'chromium-args': '--force-color-profile=srgb --force-high-performance-gpu --ignore-gpu-blocklist' };
    assert.equal(manager.applyGpuChromiumArgs(pkg), true);
    assert.equal(pkg['chromium-args'], '--force-color-profile=srgb --disable-gpu-vsync --disable-frame-rate-limit', 'the GPU switches go; no vsync has its own opt-out');
    assert.equal(manager.applyGpuChromiumArgs(pkg), false);
});

test('reactorVsync: true keeps vsync: the no-vsync switches stay out, the GPU ones stay in', () => {
    const manager = new (loadProjectManager())();
    const pkg = { reactorVsync: true, 'chromium-args': '--force-color-profile=srgb --force-high-performance-gpu --ignore-gpu-blocklist --disable-gpu-vsync --disable-frame-rate-limit' };
    assert.equal(manager.applyGpuChromiumArgs(pkg), true);
    assert.equal(pkg['chromium-args'], '--force-color-profile=srgb --force-high-performance-gpu --ignore-gpu-blocklist');
    assert.equal(manager.applyGpuChromiumArgs(pkg), false);
    // A new project draws uncapped.
    const starter = new (loadProjectManager())().getStarterPackage('Game', '1');
    assert.match(starter['chromium-args'], /--disable-gpu-vsync --disable-frame-rate-limit/);
});

test('opening a project adds the switches without rewriting the rest of package.json', async () => {
    const ProjectManager = loadProjectManager();
    const text = '﻿{\n    "name": "game",\n    "main": "index.html",\n    "chromium-args": "--force-color-profile=srgb --window-size=1280,720",\n    "window": { "title": "T" }\n}\n';
    const dir = tempProject(text);
    try {
        const manager = new ProjectManager();
        manager.getRuntimePath = () => null;
        await manager.refreshReactorRuntime(dir, { engineVersion: 'x' });
        const after = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
        assert.equal(after, text.replace('--window-size=1280,720"', '--window-size=1280,720 --force-high-performance-gpu --ignore-gpu-blocklist --disable-gpu-vsync --disable-frame-rate-limit"'),
            'only the chromium-args value changed: indentation, BOM and layout stay');
        const mtime = fs.statSync(path.join(dir, 'package.json')).mtimeMs;
        await manager.refreshReactorRuntime(dir, { engineVersion: 'x' });
        assert.equal(fs.statSync(path.join(dir, 'package.json')).mtimeMs, mtime, 'a second open writes nothing');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an opted-out project keeps no switches after opening', async () => {
    const ProjectManager = loadProjectManager();
    const dir = tempProject(JSON.stringify({ name: 'g', main: 'index.html', reactorHighPerformanceGpu: false,
        'chromium-args': '--force-color-profile=srgb --ignore-gpu-blocklist' }, null, 2));
    try {
        const manager = new ProjectManager();
        manager.getRuntimePath = () => null;
        await manager.refreshReactorRuntime(dir, { engineVersion: 'x' });
        assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))['chromium-args'], '--force-color-profile=srgb --disable-gpu-vsync --disable-frame-rate-limit');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a project not yet on the Reactor runtime is left alone on open', async () => {
    const ProjectManager = loadProjectManager();
    const text = JSON.stringify({ name: 'g', main: 'index.html', 'chromium-args': '--force-color-profile=srgb' });
    const dir = tempProject(text, false);
    try {
        await new ProjectManager().refreshReactorRuntime(dir, { engineVersion: 'x' });
        assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), text);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a playtest launch adds the switches too', () => {
    const ProjectManager = loadProjectManager();
    const dir = tempProject(JSON.stringify({ name: 'g', main: 'index.html', 'chromium-args': '--force-color-profile=srgb' }));
    try {
        assert.equal(new ProjectManager().ensureProjectPackageMetadata(dir).ok, true);
        const args = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))['chromium-args'].split(' ');
        for (const arg of GPU_ARGS) assert.ok(args.includes(arg), arg);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the game and editor WebGL contexts ask for the high-performance GPU', () => {
    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    assert.match(core, /Graphics\.gpuPowerPreference = "high-performance";/);
    assert.equal((core.match(/powerPreference: this\.gpuPowerPreference/g) || []).length, 3, 'PIXI v8, PIXI v5-7 and the Effekseer overlay');
    const controller = fs.readFileSync(path.join(editorRoot, 'src', 'ProjectController.js'), 'utf8');
    assert.match(controller, /powerPreference: 'high-performance'/);
    const map3d = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
    assert.doesNotMatch(map3d, /powerPreference: 'default'/);
});

test('a playtest on a weak GPU under Windows Direct3D 11 runs its WebGL through D3D11-on-12, and nothing else does', () => {
    const PlaytestManager = require('../src/PlaytestManager.js');
    const iris = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)';
    assert.deepEqual(PlaytestManager.weakAngleArgs('win32', iris, {}), ['--use-angle=d3d11on12']);
    assert.deepEqual(PlaytestManager.weakAngleArgs('win32', 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', null), ['--use-angle=d3d11on12'], 'integrated Radeon');
    assert.deepEqual(PlaytestManager.weakAngleArgs('win32', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)', {}), [], 'a discrete GPU is left alone');
    assert.deepEqual(PlaytestManager.weakAngleArgs('linux', 'ANGLE (Intel, Mesa Intel(R) Xe Graphics (TGL GT2), OpenGL 4.6)', {}), [], 'another system is left alone');
    assert.deepEqual(PlaytestManager.weakAngleArgs('win32', iris.replace('Direct3D11 ', 'Direct3D11on12 '), {}), [], 'already on D3D11-on-12');
    assert.deepEqual(PlaytestManager.weakAngleArgs('win32', iris, { reactorAngle: 'default' }), [], 'the project opts out');
    assert.deepEqual(PlaytestManager.weakAngleArgs('win32', iris, { 'chromium-args': '--use-angle=gl' }), [], 'the project chose its own backend');
    assert.deepEqual(PlaytestManager.weakAngleArgs('win32', '', {}), [], 'a GPU that will not say');
});
