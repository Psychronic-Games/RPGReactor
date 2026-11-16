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

// --- 2026-11-15: a project's own Graphics Backend (Database > System 2), Auto by default.
test('a project that names its graphics backend carries it in its manifest, and Auto takes out only what the editor put there', () => {
    const ProjectManager = loadProjectManager(), manager = new ProjectManager();
    assert.deepEqual([...ProjectManager.GRAPHICS_BACKENDS], ['d3d11', 'd3d11on12', 'gl', 'vulkan'], 'Vulkan can be named; Auto never tries it');
    assert.equal(ProjectManager.normalizeGraphicsBackend('gl'), 'gl');
    assert.equal(ProjectManager.normalizeGraphicsBackend('vulkan'), 'vulkan');
    assert.equal(ProjectManager.normalizeGraphicsBackend('metal'), 'auto', 'a name that is not offered is Auto');
    assert.equal(ProjectManager.normalizeGraphicsBackend(undefined), 'auto');
    const base = '--force-color-profile=srgb --force-high-performance-gpu --ignore-gpu-blocklist --disable-gpu-vsync --disable-frame-rate-limit';
    const pkg = { 'chromium-args': base };
    assert.equal(manager.applyGpuChromiumArgs(pkg, 'auto'), false, 'Auto on a plain manifest changes nothing');
    assert.equal(manager.applyGpuChromiumArgs(pkg, 'gl'), true);
    assert.equal(pkg['chromium-args'], base + ' --use-angle=gl');
    assert.equal(pkg.reactorAngle, 'gl', 'marked as the editor\'s');
    assert.equal(manager.applyGpuChromiumArgs(pkg, 'gl'), false, 'nothing to do the second time');
    assert.equal(manager.applyGpuChromiumArgs(pkg, 'd3d11'), true);
    assert.equal(pkg['chromium-args'], base + ' --use-angle=d3d11', 'one backend, never two');
    assert.equal(pkg.reactorAngle, 'd3d11');
    assert.equal(manager.applyGpuChromiumArgs(pkg, undefined), false, 'a caller that does not know the choice leaves it');
    assert.equal(manager.applyGpuChromiumArgs(pkg, 'auto'), true);
    assert.equal(pkg['chromium-args'], base);
    assert.equal('reactorAngle' in pkg, false);
    // A switch someone wrote by hand, and the older opt-out, are theirs.
    const own = { 'chromium-args': base + ' --use-angle=swiftshader' };
    assert.equal(manager.applyGpuChromiumArgs(own, 'auto'), false);
    assert.equal(own['chromium-args'], base + ' --use-angle=swiftshader');
    const optedOut = { reactorAngle: 'default', 'chromium-args': base };
    assert.equal(manager.applyGpuChromiumArgs(optedOut, 'auto'), false);
    assert.equal(optedOut.reactorAngle, 'default');
    // Vulkan cannot take the hardware decoder's frames: its project decodes video in software, and only while it is on Vulkan.
    const vk = { 'chromium-args': base };
    assert.equal(manager.applyGpuChromiumArgs(vk, 'vulkan'), true);
    assert.equal(vk['chromium-args'], base + ' --disable-accelerated-video-decode --enable-angle-features=enableParallelCompileAndLink --use-angle=vulkan', 'software video, and shaders built on the driver\'s threads');
    assert.equal(manager.applyGpuChromiumArgs(vk, 'vulkan'), false);
    const older = { 'chromium-args': base + ' --use-angle=vulkan', reactorAngle: 'vulkan' };
    assert.equal(manager.applyGpuChromiumArgs(older, 'vulkan'), true, 'a manifest written before the switch gets it');
    assert.match(older['chromium-args'], / --disable-accelerated-video-decode --enable-angle-features=enableParallelCompileAndLink$/);
    const features = { 'chromium-args': base + ' --enable-angle-features=supportsFoo' };
    assert.equal(manager.applyGpuChromiumArgs(features, 'vulkan'), true);
    assert.doesNotMatch(features['chromium-args'], /enableParallelCompileAndLink/, 'a project that names ANGLE features itself keeps its own (a second switch would replace them)');
    assert.equal(manager.applyGpuChromiumArgs(vk, 'gl'), true);
    assert.equal(vk['chromium-args'], base + ' --use-angle=gl', 'the switch goes with Vulkan');
    assert.equal(manager.applyGpuChromiumArgs(vk, 'vulkan'), true);
    assert.equal(manager.applyGpuChromiumArgs(vk, 'auto'), true);
    assert.equal(vk['chromium-args'], base);
    const byHand = { 'chromium-args': base + ' --disable-accelerated-video-decode' };
    assert.equal(manager.applyGpuChromiumArgs(byHand, 'gl'), true);
    assert.match(byHand['chromium-args'], /--disable-accelerated-video-decode/, 'one written by hand is theirs');
    // Named in the project, it replaces one written by hand.
    assert.equal(manager.applyGpuChromiumArgs(own, 'd3d11on12'), true);
    assert.equal(own['chromium-args'], base + ' --use-angle=d3d11on12');
});

test('the manifest follows the project\'s System.json, and a playtest and the game then leave the backend alone', () => {
    const ProjectManager = loadProjectManager();
    const dir = tempProject('{\n    "name": "game",\n    "chromium-args": "--force-color-profile=srgb"\n}\n');
    try {
        fs.mkdirSync(path.join(dir, 'data'));
        const manager = new ProjectManager();
        manager.fs = fs; manager.path = path;
        const system = backend => fs.writeFileSync(path.join(dir, 'data', 'System.json'), JSON.stringify({ advanced: backend === undefined ? {} : { graphicsBackend: backend } }));
        system(undefined);
        assert.equal(manager.projectGraphicsBackend(dir), 'auto');
        manager.ensureGpuChromiumArgs(dir);
        let pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        assert.doesNotMatch(pkg['chromium-args'], /--use-angle=/);
        system('gl');
        assert.equal(manager.projectGraphicsBackend(dir), 'gl');
        assert.equal(manager.ensureGpuChromiumArgs(dir).updated, true);
        pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        assert.match(pkg['chromium-args'], / --use-angle=gl$/);
        assert.equal(pkg.reactorAngle, 'gl');
        assert.equal(pkg.name, 'game', 'the rest of the manifest is kept');
        assert.equal(manager.ensureGpuChromiumArgs(dir).updated, false);
        // The playtest adds no backend of its own, and the game's learning stands down (ReactorBackend.env: a project that names its own).
        const PlaytestManager = require('../src/PlaytestManager.js');
        const iris = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)';
        assert.deepEqual(PlaytestManager.backendArgs('win32', iris, pkg, 'd3d11on12'), []);
        assert.match(fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_main.js'), 'utf8'), /const own = \/--use-angle=\/\.test\(String\(manifest\["chromium-args"\] \|\| ""\)\);/);
        system('auto');
        assert.equal(manager.ensureGpuChromiumArgs(dir).updated, true);
        pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        assert.doesNotMatch(pkg['chromium-args'], /--use-angle=/);
        assert.equal('reactorAngle' in pkg, false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    // The playtest brings the manifest up to date before it reads it, and the setting is a row of System 2.
    const playtest = fs.readFileSync(path.join(editorRoot, 'src', 'PlaytestManager.js'), 'utf8');
    assert.ok(playtest.indexOf('this.projectManager.ensureGpuChromiumArgs(projectPath)') < playtest.indexOf("packageData = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8'))"));
    const system2 = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseSystem2Editor.js'), 'utf8');
    assert.match(system2, /label: 'Graphics Backend \(Windows\)', field: 'graphicsBackend', type: 'select'/);
    assert.match(system2, /\['auto', 'Auto \(best for each machine\)'\], \['d3d11', 'Direct3D 11'\], \['d3d11on12', 'Direct3D 11 on 12'\], \['gl', 'OpenGL'\], \['vulkan', 'Vulkan'\]/);
});

test('the editor\'s own backend is the user\'s choice where one is made, else the machine\'s plan', () => {
    const PlaytestManager = require('../src/PlaytestManager.js');
    const iris = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)';
    const E = (plan, choice) => PlaytestManager.editorBackend('win32', iris, [], plan, {}, false, choice);
    assert.equal(E('gl', null), 'gl', 'Auto: what the game found');
    assert.equal(E('gl', ''), 'gl');
    assert.equal(E('gl', 'd3d11'), '', 'Direct3D 11 is the browser\'s own: no switch');
    assert.equal(E('gl', 'default'), '', 'the older spelling');
    assert.equal(E('d3d11', 'gl'), 'gl');
    assert.equal(E(null, 'd3d11on12'), 'd3d11on12');
    assert.equal(E('d3d11on12', 'vulkan'), 'vulkan', 'Vulkan by choice');
    assert.equal(E('d3d11on12', 'metal'), 'd3d11on12', 'a name that is not offered is Auto');
    assert.equal(E('vulkan', null), '', 'and never from the machine\'s record');
    assert.match(fs.readFileSync(path.join(editorRoot, 'RPGReactor.bat'), 'utf8'), /if \/i "%RR_ANGLE%"=="vulkan" set "RR_ANGLE_ARGS=--use-angle=vulkan --rr-editor-angle=vulkan"/);
    assert.equal(require('../src/PlaytestManager.js').BACKENDS.includes('vulkan'), false, 'the game\'s planner has three backends');
    assert.equal(PlaytestManager.editorBackend('linux', iris, [], 'gl', {}, false, 'gl'), null, 'another system has nothing to choose');
    const options = fs.readFileSync(path.join(editorRoot, 'src', 'OptionsManager.js'), 'utf8');
    assert.match(options, /static EDITOR_BACKEND_KEY = 'rr\.editorBackend';/);
    assert.match(fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8'), /window\.localStorage\.getItem\('rr\.editorBackend'\)/);
    assert.match(options, /editorBackendOffered\(\) \{\s*return typeof process !== 'undefined' && process\.platform === 'win32' && typeof nw !== 'undefined';/);
});
