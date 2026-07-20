#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Worker } = require('node:worker_threads');
const release = require('./release-config.cjs');

function parseArguments(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
        const [rawName, inlineValue] = argument.slice(2).split('=', 2);
        const value = inlineValue === undefined ? argv[++index] : inlineValue;
        if (value === undefined || value.startsWith('--')) throw new Error(`--${rawName} requires a value.`);
        options[rawName] = value;
    }
    return options;
}

function git(repoRoot, args) {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function assertPublishSourceClean(mode, status) {
    if (mode === 'publish' && status.trim()) {
        throw new Error(`Publish mode requires a clean checkout; git reported:\n${status}`);
    }
}

function runWorker(workerPath, workerData) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerPath, { workerData });
        worker.on('message', message => {
            if (message.type === 'log') process.stderr.write(`${message.message}\n`);
            if (message.type === 'done') {
                if (message.success) resolve();
                else reject(new Error('Editor distribution worker failed.'));
            }
        });
        worker.on('error', reject);
        worker.on('exit', code => {
            if (code !== 0) reject(new Error(`Editor distribution worker exited with ${code}.`));
        });
    });
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArguments(argv);
    const target = options.target;
    const mode = options.mode || 'candidate';
    const version = release.normalizeVersion(options.version);
    if (!release.TARGETS[target]) throw new Error(`--target must be one of: ${Object.keys(release.TARGETS).join(', ')}`);
    if (!['candidate', 'publish'].includes(mode)) throw new Error('--mode must be candidate or publish.');

    const editorRoot = path.resolve(__dirname, '..');
    const repoRoot = path.resolve(editorRoot, '..');
    const packageVersion = JSON.parse(fs.readFileSync(path.join(editorRoot, 'package.json'), 'utf8')).version;
    if (version !== packageVersion) throw new Error(`Requested version ${version} does not match editor/package.json ${packageVersion}.`);
    const status = git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
    assertPublishSourceClean(mode, status);

    const targetPlatform = release.TARGETS[target].platform;
    if (targetPlatform && process.platform !== targetPlatform) {
        throw new Error(`${target} releases must be built on ${targetPlatform}; current host is ${process.platform}.`);
    }

    const outputRoot = path.resolve(options['output-root'] || path.join(repoRoot, 'dist-editor', 'releases'));
    const outputDir = path.join(outputRoot, `v${version}`, target);
    if (fs.existsSync(outputDir)) throw new Error(`Release output already exists; use a fresh directory: ${outputDir}`);
    fs.mkdirSync(outputDir, { recursive: true });

    const workerData = release.createWorkerData({ editorRoot, target, mode, outputDir });
    await runWorker(path.join(editorRoot, 'build-scripts', 'dist-editor-worker.js'), workerData);

    const sumsPath = path.join(outputDir, 'SHA256SUMS.txt');
    if (fs.existsSync(sumsPath)) {
        fs.renameSync(sumsPath, path.join(outputDir, `SHA256SUMS-${target}.txt`));
    }
    const artifacts = fs.readdirSync(outputDir)
        .filter(name => name !== release.manifestFileName(target))
        .sort()
        .map(name => {
            const filePath = path.join(outputDir, name);
            return { name, size: fs.statSync(filePath).size, sha256: release.sha256(filePath) };
        });
    if (!artifacts.some(artifact => /\.(?:zip|AppImage)$/.test(artifact.name))) {
        throw new Error('Distribution worker produced no release archive.');
    }
    const manifest = {
        schema: 1,
        product: 'RPG Reactor',
        version,
        target,
        itchChannel: release.TARGETS[target].channel,
        mode,
        signed: mode === 'publish' && ['windows', 'macos'].includes(target),
        nwjsVersion: release.NW_VERSION,
        releaseBuild: true,
        starter: 'bundled-demo',
        sourceCommit: git(repoRoot, ['rev-parse', 'HEAD']),
        sourceDirty: Boolean(status),
        artifacts,
    };
    const manifestPath = path.join(outputDir, release.manifestFileName(target));
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`${manifestPath}\n`);
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`release-editor: ${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = { assertPublishSourceClean, main, parseArguments };
