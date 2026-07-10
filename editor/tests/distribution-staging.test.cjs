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
            'runtime/reactor_main.js',
            'runtime/reactor_mv_compat.js',
            'runtime/libs/pixi.js',
            'runtime/libs/pixi_compat.js',
            'runtime/libs/pako.min.js',
            'runtime/libs/localforage.min.js',
            'runtime/libs/effekseer.min.js',
            'runtime/libs/effekseer.wasm',
            'runtime/libs/vorbisdecoder.js'
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

        secondStageRoot = await stageEditor(stageRoot, outputDir);
        assert.equal(fs.existsSync(path.join(secondStageRoot, 'libs', 'gif.js')), true);
        assert.equal(fs.existsSync(path.join(secondStageRoot, 'runtime', 'reactor_main.js')), true);
    } finally {
        if (secondStageRoot) fs.rmSync(path.dirname(secondStageRoot), { recursive: true, force: true });
        if (stageRoot) fs.rmSync(path.dirname(stageRoot), { recursive: true, force: true });
        fs.rmSync(outputDir, { recursive: true, force: true });
    }
});
