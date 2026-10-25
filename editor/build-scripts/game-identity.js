'use strict';
/**
 * A deployed game's own name and identifiers, so no two games share the
 * runtime's (`nwjs`, `io.nwjs.nwjs`).
 */
const fs = require('fs');
const path = require('path');
const nativeRelease = require('./native-release.cjs');

// Package names every new or imported project starts with: they say nothing about the game.
const GENERIC_PACKAGE_NAMES = new Set(['', 'game', 'rmmz-game', 'rmmv-game', 'rpg-reactor-game', 'project1']);

function slug(value) {
    return String(value || '')
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** The game's slug: its package name when the author gave it one, else its title. */
function gameSlug(packageName, gameTitle) {
    const fromPackage = slug(packageName);
    if (fromPackage && !GENERIC_PACKAGE_NAMES.has(fromPackage)) return fromPackage;
    return slug(gameTitle) || fromPackage || 'game';
}

/** Reverse-DNS bundle identifier (letters, digits, hyphens and periods only). */
function macBundleId(packageName, gameTitle) {
    return `games.rpgreactor.${gameSlug(packageName, gameTitle)}`;
}

/** A version macOS accepts for CFBundleShortVersionString: up to three dot-separated integers. */
function bundleVersion(version) {
    const parts = String(version || '').split(/[.+-]/).slice(0, 3).map(part => parseInt(part, 10));
    if (!parts.length || parts.some(part => !Number.isFinite(part) || part < 0)) return '1.0.0';
    while (parts.length < 3) parts.push(0);
    return parts.join('.');
}

function readStrings(filePath) {
    const raw = fs.readFileSync(filePath);
    if (raw[0] === 0xff && raw[1] === 0xfe) return { text: raw.slice(2).toString('utf16le'), encoding: 'utf16le' };
    return { text: raw.toString('utf8'), encoding: 'utf8' };
}

function writeStrings(filePath, text, encoding) {
    if (encoding === 'utf16le') {
        fs.writeFileSync(filePath, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
    } else {
        fs.writeFileSync(filePath, text);
    }
}

function quoteStrings(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Names the macOS bundle after the game: Info.plist's name, display name, identifier
 * and version, and the localized InfoPlist.strings that still say "nwjs".
 */
function applyMacGameIdentity(appBundle, { name, bundleId, version }) {
    const plistPath = path.join(appBundle, 'Contents', 'Info.plist');
    if (!fs.existsSync(plistPath)) return false;
    nativeRelease.updateMacMetadata(appBundle, bundleVersion(version), bundleId, name);
    const resources = path.join(appBundle, 'Contents', 'Resources');
    let entries = [];
    try { entries = fs.readdirSync(resources); } catch {}
    for (const dir of entries) {
        if (!dir.endsWith('.lproj')) continue;
        const stringsPath = path.join(resources, dir, 'InfoPlist.strings');
        if (!fs.existsSync(stringsPath)) continue;
        const { text, encoding } = readStrings(stringsPath);
        const next = text
            .replace(/^(\s*"?CFBundle(?:Display)?Name"?\s*=\s*)"(?:[^"\\]|\\.)*";/gm, `$1"${quoteStrings(name)}";`)
            .replace(/^(\s*"?CFBundleGetInfoString"?\s*=\s*)"(?:[^"\\]|\\.)*";/gm, `$1"${quoteStrings(name)}";`);
        if (next !== text) writeStrings(stringsPath, next, encoding);
    }
    return true;
}

module.exports = { gameSlug, macBundleId, bundleVersion, applyMacGameIdentity };
