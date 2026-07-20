#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const release = require('./release-config.cjs');

function parseArguments(argv) {
    const options = { itch: false };
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (argument === '--itch') {
            options.itch = true;
            continue;
        }
        const [name, inline] = argument.slice(2).split('=', 2);
        options[name] = inline === undefined ? argv[++index] : inline;
    }
    return options;
}

function collectManifestPaths(root) {
    const paths = [];
    const visit = directory => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(fullPath);
            else if (/^artifact-manifest-(?:linux|windows|macos|web)\.json$/.test(entry.name)) paths.push(fullPath);
        }
    };
    visit(root);
    return paths.sort();
}

function verifyCandidateSet(root, version, commit) {
    const manifestPaths = collectManifestPaths(root);
    if (manifestPaths.length !== 4) throw new Error(`Expected four candidate manifests, found ${manifestPaths.length}.`);
    const manifests = manifestPaths.map(manifestPath => ({
        path: manifestPath,
        data: release.readAndVerifyManifest(manifestPath, { version, mode: 'publish', commit }),
    }));
    const targets = manifests.map(item => item.data.target).sort();
    if (targets.join(',') !== Object.keys(release.TARGETS).sort().join(',')) {
        throw new Error(`Candidate target set is incomplete: ${targets.join(', ')}`);
    }
    for (const { data } of manifests) {
        const target = release.TARGETS[data.target];
        if (!target || data.itchChannel !== target.channel) {
            throw new Error(`${data.target || 'unknown'} candidate has an invalid itch channel.`);
        }
        if (data.nwjsVersion !== release.NW_VERSION || data.releaseBuild !== true ||
            data.starter !== 'generated-clean' || data.sourceDirty !== false) {
            throw new Error(`${data.target} candidate does not satisfy release provenance policy.`);
        }
        if (['windows', 'macos'].includes(data.target) && !data.signed) {
            throw new Error(`${data.target} candidate is not signed.`);
        }
        if (!data.artifacts.some(artifact => /\.(?:zip|AppImage)$/.test(artifact.name))) {
            throw new Error(`${data.target} candidate has no release archive.`);
        }
    }
    return manifests;
}

function main(argv = process.argv.slice(2), env = process.env) {
    const options = parseArguments(argv);
    const version = release.normalizeVersion(options.version);
    const root = path.resolve(options.candidates || 'candidate-artifacts');
    const commit = options.commit;
    if (!commit) throw new Error('--commit is required.');
    const manifests = verifyCandidateSet(root, version, commit);
    const files = manifests.flatMap(({ path: manifestPath, data }) => [
        manifestPath,
        ...data.artifacts.map(artifact => path.join(path.dirname(manifestPath), artifact.name)),
    ]);

    const tag = `v${version}`;
    execFileSync('gh', [
        'release', 'create', tag, '--verify-tag', '--title', `RPG Reactor ${version}`,
        '--generate-notes', ...files,
    ], { stdio: 'inherit' });

    if (options.itch) {
        if (!env.BUTLER_API_KEY) throw new Error('BUTLER_API_KEY is required for itch.io publication.');
        if (!env.ITCH_PROJECT) throw new Error('ITCH_PROJECT is required for itch.io publication.');
        for (const { path: manifestPath, data } of manifests) {
            const archives = data.artifacts.filter(artifact => /\.(?:zip|AppImage)$/.test(artifact.name));
            for (const artifact of archives) {
                execFileSync('butler', [
                    'push', path.join(path.dirname(manifestPath), artifact.name),
                    `${env.ITCH_PROJECT}:${data.itchChannel}`, '--userversion', version,
                ], { stdio: 'inherit', env });
            }
        }
    }
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`publish-release: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { collectManifestPaths, main, parseArguments, verifyCandidateSet };
