const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Worker } = require('node:worker_threads');

const editorRoot = path.resolve(__dirname, '..');

async function stageEditor(appRoot, outputDir) {
    let stageRoot = null;
    const result = await new Promise((resolve, reject) => {
        const worker = new Worker(path.join(editorRoot, 'build-scripts', 'dist-editor-worker.js'), {
            workerData: {
                appRoot,
                platforms: [],
                packageType: 'minimal',
                edition: 'normal',
                nwVersion: '0.92.0',
                outputDir,
                stageOnly: true,
                includeTemplate: false
            }
        });

        worker.on('message', (message) => {
            if (message.type === 'staged') stageRoot = message.stageRoot;
            if (message.type === 'done') resolve(message);
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`distribution worker exited with code ${code}`));
        });
    });
    assert.equal(result.success, true);
    assert.ok(stageRoot, 'worker reports its stage-only output');
    return stageRoot;
}

// Scripts that only package the editor itself; they run from a source checkout.
const PACKAGING_ONLY = new Set(['build-scripts/build.js', 'build-scripts/convert-icon.js']);

function unresolvedPackages(stageRoot) {
    const builtins = new Set(require('node:module').builtinModules);
    const missing = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            const relative = path.relative(stageRoot, full).split(path.sep).join('/');
            if (!/\.c?js$/.test(entry.name) || PACKAGING_ONLY.has(relative)) continue;
            const source = fs.readFileSync(full, 'utf8');
            for (const match of source.matchAll(/\brequire\(\s*['"]([^'"\s]+)['"]\s*\)/g)) {
                const name = match[1].replace(/^node:/, '');
                // nw.gui and electron come from the host, not from node_modules.
                if (name.startsWith('.') || name.startsWith('/') || name.startsWith('nw.') || name === 'electron') continue;
                const parts = name.split('/');
                const packageName = name.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
                if (builtins.has(packageName)) continue;
                if (!fs.existsSync(path.join(stageRoot, 'node_modules', packageName, 'package.json'))) {
                    missing.push(`${relative} requires ${packageName}`);
                }
            }
        }
    };
    walk(path.join(stageRoot, 'src'));
    walk(path.join(stageRoot, 'build-scripts'));
    return missing;
}

test('editor distribution staging includes runtime asset dependencies', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-dist-stage-output-'));
    let stageRoot = null;
    let secondStageRoot = null;

    try {
        stageRoot = await stageEditor(editorRoot, outputDir);

        const required = [
            'libs/gif.js',
            'libs/gif.worker.js',
            'node_modules/gif.js/dist/gif.js',
            'node_modules/gifuct-js/lib/index.js',
            'node_modules/js-binary-schema-parser/lib/index.js',
            'node_modules/@jsquash/oxipng/optimise.js',
            'node_modules/@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm',
            'node_modules/wasm-feature-detect/dist/umd/index.js',
            'node_modules/pngjs/lib/png.js',
            'build-scripts/legacy-import-worker.js',
            'src/legacy/skeleton/data/System.json',
            'src/legacy/skeleton-shared.json',
            'build-scripts/appimage-utils.js',
            'build-scripts/appimage-runtime-LICENSE.txt',
            'build-scripts/native-download.js',
            'build-scripts/release-hashes.json',
            'THIRD_PARTY_NOTICES.md',
            'runtime/reactor_main.js',
            'runtime/reactor_picture_extensions.js',
            'runtime/reactor_screen_fx.js',
            'runtime/reactor_media_surfaces.js',
            'runtime/reactor_mv_compat.js',
            'runtime/libs/pixi.js',
            'runtime/libs/pixi_compat.js',
            'runtime/libs/pako.min.js',
            'runtime/libs/lz-string.js',
            'runtime/libs/localforage.min.js',
            'runtime/libs/effekseer.min.js',
            'runtime/libs/effekseer.wasm',
            'runtime/libs/vorbisdecoder.js',
            'template/Demo/project.rpgreactor',
            'template/Demo/data/System.json',
            'template/Demo/js/reactor_main.js',
            'template/Demo/js/reactor_media_surfaces.js',
            'template/Demo/js/reactor_plugins.js',
            'src/event/commands/MediaSurfaceEditor.js',
            'template/Demo/audio/bgm/Psychronic - Acoustic Circuits.ogg',
            'template/Demo/effects/Absorb.efkefc',
            'template/Demo/img/system/Window.png'
        ];
        for (const relativePath of required) {
            assert.equal(fs.existsSync(path.join(stageRoot, relativePath)), true, `${relativePath} is staged`);
        }

        assert.equal(fs.existsSync(path.join(stageRoot, 'node_modules', 'nw-builder')), false);
        assert.equal(fs.existsSync(path.join(stageRoot, 'node_modules', 'pixi.js')), false);

        const packageJson = JSON.parse(fs.readFileSync(path.join(stageRoot, 'package.json'), 'utf8'));
        assert.equal(packageJson.dependencies['gif.js'], '^0.2.0');
        assert.equal(packageJson.dependencies['gifuct-js'], '^2.1.2');
        assert.equal(packageJson.dependencies['@jsquash/oxipng'], '2.3.0');

        // The stage carries no full node_modules tree, so every package the
        // shipped code requires must have been staged by name.
        assert.deepEqual(unresolvedPackages(stageRoot), []);

        // A packaged editor imports old projects from its own folder: its
        // package.json, runtime and import skeleton are all inside the stage.
        const stagedPaths = require(path.join(stageRoot, 'src', 'legacy', 'EditorPaths.js'));
        assert.equal(stagedPaths.editorPackage().version, packageJson.version);
        assert.equal(stagedPaths.runtime(), path.join(stageRoot, 'runtime'));
        for (const [relativePath, file] of stagedPaths.skeletonFiles()) {
            assert.equal(path.relative(stageRoot, file).startsWith('..'), false, `${relativePath} comes from inside the stage`);
        }
        require(path.join(stageRoot, 'src', 'legacy', 'LegacyImporter.js'));

        const starterRoot = path.join(stageRoot, 'template', 'Demo');
        const starterMetadata = JSON.parse(fs.readFileSync(path.join(starterRoot, 'project.rpgreactor'), 'utf8'));
        assert.deepEqual(starterMetadata, JSON.parse(fs.readFileSync(
            path.resolve(editorRoot, '..', 'template', 'Demo', 'project.rpgreactor'), 'utf8')));
        assert.ok(JSON.parse(fs.readFileSync(path.join(starterRoot, 'data', 'Actors.json'), 'utf8')).length > 1);
        assert.ok(fs.readdirSync(path.join(starterRoot, 'js', 'plugins')).length > 0);
        for (const entry of fs.readdirSync(path.join(stageRoot, 'runtime'), { withFileTypes: true })) {
            if (entry.isFile() && entry.name !== 'reactor_plugins.js') {
                assert.deepEqual(
                    fs.readFileSync(path.join(starterRoot, 'js', entry.name)),
                    fs.readFileSync(path.join(stageRoot, 'runtime', entry.name)),
                    `${entry.name} is refreshed from staged runtime`
                );
            }
        }

        secondStageRoot = await stageEditor(stageRoot, outputDir);
        assert.equal(fs.existsSync(path.join(secondStageRoot, 'libs', 'gif.js')), true);
        assert.equal(fs.existsSync(path.join(secondStageRoot, 'runtime', 'reactor_main.js')), true);
    } finally {
        if (secondStageRoot) fs.rmSync(path.dirname(secondStageRoot), { recursive: true, force: true });
        if (stageRoot) fs.rmSync(path.dirname(stageRoot), { recursive: true, force: true });
        fs.rmSync(outputDir, { recursive: true, force: true });
    }
});
