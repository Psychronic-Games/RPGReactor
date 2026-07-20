'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const NW_VERSION = '0.107.0';
const TARGETS = Object.freeze({
    linux: { platform: 'linux', workerPlatform: 'linux', packageType: 'platform', channel: 'linux-x64' },
    windows: { platform: 'win32', workerPlatform: 'win', packageType: 'platform', channel: 'windows-x64' },
    macos: { platform: 'darwin', workerPlatform: 'osx', packageType: 'platform', channel: 'macos-x64' },
    web: { platform: null, workerPlatform: null, packageType: 'web', channel: 'web' },
});

function normalizeVersion(value) {
    const version = String(value || '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`Invalid release version: ${value || '(missing)'}`);
    }
    return version;
}

function requiredEnvironment(target, mode, env = process.env) {
    if (mode !== 'publish' || target === 'linux' || target === 'web') return;
    if (target === 'windows') {
        for (const name of ['WINDOWS_CERTIFICATE_PATH', 'WINDOWS_CERTIFICATE_PASSWORD']) {
            if (!env[name]) throw new Error(`${name} is required for a publishable Windows candidate.`);
        }
        if (!fs.existsSync(env.WINDOWS_CERTIFICATE_PATH)) {
            throw new Error(`WINDOWS_CERTIFICATE_PATH does not exist: ${env.WINDOWS_CERTIFICATE_PATH}`);
        }
        return;
    }
    if (!env.MACOS_SIGNING_IDENTITY) {
        throw new Error('MACOS_SIGNING_IDENTITY is required for a publishable macOS candidate.');
    }
    const hasProfile = Boolean(env.MACOS_NOTARY_PROFILE);
    const hasCredentials = ['APPLE_ID', 'APPLE_TEAM_ID', 'APPLE_APP_PASSWORD'].every(name => env[name]);
    if (!hasProfile && !hasCredentials) {
        throw new Error('Set MACOS_NOTARY_PROFILE or APPLE_ID, APPLE_TEAM_ID, and APPLE_APP_PASSWORD.');
    }
}

function createWorkerData({ editorRoot, target, mode, outputDir, env = process.env }) {
    const definition = TARGETS[target];
    if (!definition) throw new Error(`Unknown release target: ${target}`);
    if (!['candidate', 'publish'].includes(mode)) throw new Error(`Unknown release mode: ${mode}`);
    requiredEnvironment(target, mode, env);
    return {
        appRoot: editorRoot,
        platforms: definition.workerPlatform ? [definition.workerPlatform] : [],
        packageType: definition.packageType,
        edition: 'normal',
        nwVersion: NW_VERSION,
        nwVersionPolicy: 'exact',
        editorNwVersion: NW_VERSION,
        outputDir,
        includeProprietaryCodecs: false,
        createLinuxAppImage: false,
        releaseBuild: true,
        allowBundledRuntime: false,
        releaseHashManifestPath: path.join(editorRoot, 'build-scripts', 'release-hashes.json'),
        nativeSigning: {
            mode: mode === 'publish' && ['windows', 'macos'].includes(target) ? 'signed' : 'unsigned',
        },
    };
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function manifestFileName(target) {
    return `artifact-manifest-${target}.json`;
}

function readAndVerifyManifest(manifestPath, options = {}) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.schema !== 1) throw new Error(`${manifestPath}: unsupported manifest schema.`);
    if (options.version && manifest.version !== options.version) {
        throw new Error(`${manifestPath}: expected version ${options.version}, found ${manifest.version}.`);
    }
    if (options.mode && manifest.mode !== options.mode) {
        throw new Error(`${manifestPath}: expected mode ${options.mode}, found ${manifest.mode}.`);
    }
    if (options.commit && manifest.sourceCommit !== options.commit) {
        throw new Error(`${manifestPath}: candidate commit does not match ${options.commit}.`);
    }
    const root = path.dirname(manifestPath);
    for (const artifact of manifest.artifacts || []) {
        if (!artifact.name || path.basename(artifact.name) !== artifact.name) {
            throw new Error(`${manifestPath}: unsafe artifact name ${artifact.name || '(missing)'}.`);
        }
        const artifactPath = path.join(root, artifact.name);
        if (!fs.existsSync(artifactPath)) throw new Error(`${manifestPath}: missing ${artifact.name}.`);
        const stats = fs.statSync(artifactPath);
        if (!stats.isFile() || stats.size !== artifact.size || sha256(artifactPath) !== artifact.sha256) {
            throw new Error(`${manifestPath}: hash or size mismatch for ${artifact.name}.`);
        }
    }
    return manifest;
}

module.exports = {
    NW_VERSION,
    TARGETS,
    createWorkerData,
    manifestFileName,
    normalizeVersion,
    readAndVerifyManifest,
    requiredEnvironment,
    sha256,
};
