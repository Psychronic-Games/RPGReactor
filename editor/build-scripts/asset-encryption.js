'use strict';
/**
 * Encrypts a staged game's images and audio in RPG Maker MZ's format:
 * a 16-byte "RPGMV" header, then the file with its first 16 bytes XORed with
 * the key, saved as `<name>.<ext>_`. The game reads the key and the two flags
 * (hasEncryptedImages, hasEncryptedAudio) from data/System.json.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const HEADER = Buffer.from([
    0x52, 0x50, 0x47, 0x4d, 0x56, 0x00, 0x00, 0x00,
    0x00, 0x03, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
// What the game loads as a picture (Bitmap) and as sound (WebAudio); each asks for `<file>_` when its flag is on.
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.apng']);
const AUDIO_EXTENSIONS = new Set(['.ogg', '.m4a', '.mp3', '.wav', '.flac']);

/** A 32-digit hex key: the text itself when it is one, else its MD5 (as RPG Maker MZ makes it). */
function normalizeKey(text) {
    const value = String(text || '').trim();
    if (/^[0-9a-f]{32}$/i.test(value)) return value.toLowerCase();
    return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

/** The key a deploy uses: the one typed, else the project's own, else one made from the game title. */
function resolveKey({ keyText, system, gameTitle }) {
    const own = system && typeof system.encryptionKey === 'string' ? system.encryptionKey.trim() : '';
    const ownValid = /^[0-9a-f]{32}$/i.test(own);
    // A project that already ships encrypted files keeps the key they were made with.
    if (ownValid && system && (system.hasEncryptedImages || system.hasEncryptedAudio)) return own.toLowerCase();
    if (String(keyText || '').trim()) return normalizeKey(keyText);
    if (ownValid) return own.toLowerCase();
    return normalizeKey(`rpg-reactor:${gameTitle || 'Game'}`);
}

function encryptBuffer(bytes, keyHex) {
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 16) throw new Error('The encryption key must be 32 hexadecimal digits.');
    const body = Buffer.from(bytes);
    for (let i = 0; i < 16 && i < body.length; i++) body[i] ^= key[i];
    return Buffer.concat([HEADER, body]);
}

function decryptBuffer(bytes, keyHex) {
    const source = Buffer.from(bytes);
    if (source.length < 16 || !source.subarray(0, 16).equals(HEADER)) throw new Error('Not an encrypted file.');
    const key = Buffer.from(keyHex, 'hex');
    const body = Buffer.from(source.subarray(16));
    for (let i = 0; i < 16 && i < body.length; i++) body[i] ^= key[i];
    return body;
}

function walkFiles(dir, out = []) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkFiles(full, out);
        else if (entry.isFile()) out.push(full);
    }
    return out;
}

/**
 * Replaces each image under img/ and each sound under audio/ with its encrypted copy, and turns
 * the matching flags on in the staged data/System.json. Returns { images, audio, key }.
 */
function encryptStagedAssets(stagingDir, { images = false, audio = false, keyText = '', gameTitle = '' } = {}, onFile = null) {
    const result = { images: 0, audio: 0, key: '' };
    if (!images && !audio) return result;
    const systemPath = path.join(stagingDir, 'data', 'System.json');
    if (!fs.existsSync(systemPath)) throw new Error('Encryption needs data/System.json.');
    const system = JSON.parse(fs.readFileSync(systemPath, 'utf8'));
    const key = resolveKey({ keyText, system, gameTitle });
    result.key = key;
    const groups = [];
    if (images) groups.push(['images', path.join(stagingDir, 'img'), IMAGE_EXTENSIONS]);
    if (audio) groups.push(['audio', path.join(stagingDir, 'audio'), AUDIO_EXTENSIONS]);
    for (const [kind, root, extensions] of groups) {
        const files = walkFiles(root).filter(file => extensions.has(path.extname(file).toLowerCase()));
        files.forEach((file, index) => {
            fs.writeFileSync(file + '_', encryptBuffer(fs.readFileSync(file), key));
            fs.rmSync(file);
            result[kind]++;
            if (onFile) onFile(kind, file, index + 1, files.length);
        });
    }
    system.hasEncryptedImages = !!(images || system.hasEncryptedImages);
    system.hasEncryptedAudio = !!(audio || system.hasEncryptedAudio);
    system.encryptionKey = key;
    fs.writeFileSync(systemPath, JSON.stringify(system));
    return result;
}

module.exports = {
    HEADER, IMAGE_EXTENSIONS, AUDIO_EXTENSIONS,
    normalizeKey, resolveKey, encryptBuffer, decryptBuffer, encryptStagedAssets,
};
