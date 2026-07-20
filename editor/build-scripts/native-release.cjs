'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MACOS_BUNDLE_ID = 'games.psychronic.rpgreactor';

function command(name, args, options = {}) {
    execFileSync(name, args, { stdio: 'inherit', ...options });
}

function upsertPlistString(plist, key, value) {
    const escaped = String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const entry = `<key>${key}</key>\n\t<string>${escaped}</string>`;
    const pattern = new RegExp(`<key>${key}</key>\\s*<string>[^<]*</string>`);
    if (pattern.test(plist)) return plist.replace(pattern, entry);
    if (!plist.includes('</dict>')) throw new Error(`Invalid Info.plist while setting ${key}.`);
    return plist.replace('</dict>', `\t${entry}\n</dict>`);
}

function updateMacMetadata(appBundle, version, bundleId = MACOS_BUNDLE_ID, displayName = 'RPG Reactor') {
    const plistPath = path.join(appBundle, 'Contents', 'Info.plist');
    let plist = fs.readFileSync(plistPath, 'utf8');
    for (const [key, value] of [
        ['CFBundleIdentifier', bundleId],
        ['CFBundleName', displayName],
        ['CFBundleDisplayName', displayName],
        ['CFBundleShortVersionString', version],
        ['CFBundleVersion', version],
    ]) {
        plist = upsertPlistString(plist, key, value);
    }
    fs.writeFileSync(plistPath, plist);
}

async function updateWindowsMetadata(exePath, version, reseditRoot) {
    const { load } = require(path.join(reseditRoot, 'cjs.cjs'));
    const ResEdit = await load();
    const executable = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
    const resources = ResEdit.NtExecutableResource.from(executable);
    const versionInfo = ResEdit.Resource.VersionInfo.fromEntries(resources.entries)[0];
    if (!versionInfo) throw new Error('NW.js executable has no Windows version resource.');
    const language = versionInfo.getAllLanguagesForStringValues()[0] || { lang: 1033, codepage: 1200 };
    versionInfo.setFileVersion(version, language.lang);
    versionInfo.setProductVersion(version, language.lang);
    versionInfo.setStringValues(language, {
        CompanyName: 'Psychronic Games',
        FileDescription: 'RPG Reactor',
        FileVersion: version,
        InternalName: 'RPG Reactor',
        OriginalFilename: 'RPG Reactor.exe',
        ProductName: 'RPG Reactor',
        ProductVersion: version,
    });
    versionInfo.outputToResourceEntries(resources.entries);
    resources.outputResource(executable);
    fs.writeFileSync(exePath, Buffer.from(executable.generate()));
}

function signAndVerifyWindows(exePath, env = process.env) {
    const signTool = env.WINDOWS_SIGNTOOL || 'signtool';
    const timestamp = env.WINDOWS_TIMESTAMP_URL || 'http://timestamp.digicert.com';
    command(signTool, [
        'sign', '/fd', 'SHA256', '/td', 'SHA256', '/tr', timestamp,
        '/f', env.WINDOWS_CERTIFICATE_PATH, '/p', env.WINDOWS_CERTIFICATE_PASSWORD, exePath,
    ]);
    command(signTool, ['verify', '/pa', '/v', exePath]);
}

function signNotarizeAndVerifyMac(appBundle, env = process.env) {
    const codesign = env.MACOS_CODESIGN || 'codesign';
    command(codesign, [
        '--force', '--deep', '--options', 'runtime', '--timestamp',
        '--sign', env.MACOS_SIGNING_IDENTITY, appBundle,
    ]);
    command(codesign, ['--verify', '--deep', '--strict', '--verbose=2', appBundle]);

    const notaryArchive = path.join(os.tmpdir(), `rpg-reactor-notary-${process.pid}-${Date.now()}.zip`);
    try {
        command('ditto', ['-c', '-k', '--keepParent', appBundle, notaryArchive]);
        const args = ['notarytool', 'submit', notaryArchive, '--wait'];
        if (env.MACOS_NOTARY_PROFILE) {
            args.push('--keychain-profile', env.MACOS_NOTARY_PROFILE);
        } else {
            args.push(
                '--apple-id', env.APPLE_ID,
                '--team-id', env.APPLE_TEAM_ID,
                '--password', env.APPLE_APP_PASSWORD,
            );
        }
        command('xcrun', args);
        command('xcrun', ['stapler', 'staple', appBundle]);
        command('xcrun', ['stapler', 'validate', appBundle]);
        command(codesign, ['--verify', '--deep', '--strict', '--verbose=2', appBundle]);
        command('spctl', ['--assess', '--type', 'execute', '--verbose=2', appBundle]);
    } finally {
        fs.rmSync(notaryArchive, { force: true });
    }
}

module.exports = {
    MACOS_BUNDLE_ID,
    signAndVerifyWindows,
    signNotarizeAndVerifyMac,
    updateMacMetadata,
    updateWindowsMetadata,
    upsertPlistString,
};
