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
            'build-scripts/appimage-utils.js',
            'build-scripts/appimage-runtime-LICENSE.txt',
            'build-scripts/native-download.js',
            'build-scripts/release-hashes.json',
            'THIRD_PARTY_NOTICES.md',
            'THIRD_PARTY_LICENSES/pako-MIT.txt',
            'THIRD_PARTY_LICENSES/stb-MIT-or-Unlicense.txt',
            'runtime/reactor_main.js',
            'runtime/reactor_picture_extensions.js',
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
            'template/Demo/js/reactor_plugins.js'
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

        const starterRoot = path.join(stageRoot, 'template', 'Demo');
        const starterMetadata = JSON.parse(fs.readFileSync(path.join(starterRoot, 'project.rpgreactor'), 'utf8'));
        assert.equal(starterMetadata.starter, 'generated-clean');
        assert.equal(starterMetadata.created, '1980-01-01T00:00:00.000Z');
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(starterRoot, 'data', 'Actors.json'), 'utf8')), [null]);
        assert.deepEqual(fs.readdirSync(path.join(starterRoot, 'js', 'plugins')), []);
        assert.equal(fs.readFileSync(path.join(starterRoot, 'js', 'reactor_plugins.js'), 'utf8'), 'var $plugins = [];\n');
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
