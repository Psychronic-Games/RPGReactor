/**
 * Transparent access to RPG Maker-encrypted assets in the desktop editor.
 *
 * Encrypted projects ship `img/**.png_` / `audio/**.ogg_` (MZ) or
 * `.rpgmvp` / `.rpgmvo` / `.rpgmvm` (MV) instead of plain files. The format
 * is a 16-byte fake header followed by the original file whose first 16
 * bytes are XORed with the key from `data/System.json`. Every editor
 * surface loads images through `window.RPGReactorAssetUrl`, so defining it
 * here (desktop only — WebHost installs its own) decrypts on the fly and
 * returns a data: URL; unencrypted files keep returning plain file:// URLs.
 *
 * The key is normally `encryptionKey` in System.json. When it is absent,
 * it is recovered from any encrypted PNG: the first 16 bytes of every PNG
 * are constant, so key = payload XOR known-header (the trick Petschko's
 * RPG-Maker-MV-Decrypter uses).
 *
 * Windows-authored projects also reach us with filename case that a Linux
 * filesystem refuses, so resolution falls back to a case-insensitive
 * directory match before giving up.
 */
(function(root) {
    'use strict';

    let fs = null;
    let path = null;
    try {
        fs = require('fs');
        path = require('path');
    } catch (error) {
        fs = null;
    }

    const HEADER_BYTES = 16;
    // 89 50 4E 47 0D 0A 1A 0A + IHDR chunk length (13) + "IHDR"
    const PNG_HEADER = Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
    ]);
    const ENCRYPTED_VARIANTS = {
        '.png': ['.png_', '.rpgmvp'],
        '.ogg': ['.ogg_', '.rpgmvo'],
        '.m4a': ['.m4a_', '.rpgmvm'],
        '.mp3': ['.mp3_'],
        '.wav': ['.wav_'],
        '.flac': ['.flac_']
    };
    const MIME = {
        '.png': 'image/png', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac'
    };

    const keyByProject = new Map(); // project root -> Uint8Array | null
    const urlByFile = new Map();    // encrypted file path -> { mtimeMs, size, url }

    function fileUrl(filePath) {
        return 'file://' + String(filePath).replace(/\\/g, '/');
    }

    /** The project directory an asset belongs to: the nearest ancestor with data/System.json. */
    function projectRootFor(filePath) {
        if (!fs) return null;
        let dir = path.dirname(path.resolve(filePath));
        for (let depth = 0; depth < 12; depth++) {
            try {
                if (fs.existsSync(path.join(dir, 'data', 'System.json'))) return dir;
            } catch (error) {
                return null;
            }
            const parent = path.dirname(dir);
            if (parent === dir) return null;
            dir = parent;
        }
        return null;
    }

    function keyFromHex(hex) {
        const pairs = typeof hex === 'string' ? hex.match(/.{2}/g) : null;
        if (!pairs || pairs.length < HEADER_BYTES) return null;
        return Uint8Array.from(pairs.slice(0, HEADER_BYTES), pair => parseInt(pair, 16));
    }

    /** Recover the key from an encrypted PNG's constant plaintext header. */
    function recoverKey(projectRoot) {
        const probeDirs = ['img/system', 'img/tilesets', 'img/characters', 'img/pictures', 'img/faces'];
        for (const rel of probeDirs) {
            const dir = path.join(projectRoot, rel);
            let entries;
            try {
                entries = fs.readdirSync(dir);
            } catch (error) {
                continue;
            }
            const name = entries.find(entry => /\.(png_|rpgmvp)$/i.test(entry));
            if (!name) continue;
            try {
                const bytes = fs.readFileSync(path.join(dir, name));
                if (bytes.length < HEADER_BYTES * 2) continue;
                const key = new Uint8Array(HEADER_BYTES);
                for (let i = 0; i < HEADER_BYTES; i++) {
                    key[i] = bytes[HEADER_BYTES + i] ^ PNG_HEADER[i];
                }
                return key;
            } catch (error) {
                continue;
            }
        }
        return null;
    }

    function keyFor(projectRoot) {
        if (keyByProject.has(projectRoot)) return keyByProject.get(projectRoot);
        let key = null;
        try {
            const system = JSON.parse(
                fs.readFileSync(path.join(projectRoot, 'data', 'System.json'), 'utf8'));
            key = keyFromHex(system.encryptionKey);
        } catch (error) {
            key = null;
        }
        if (!key) key = recoverKey(projectRoot);
        keyByProject.set(projectRoot, key);
        return key;
    }

    function decrypt(bytes, key) {
        const out = new Uint8Array(bytes.length - HEADER_BYTES);
        out.set(bytes.subarray(HEADER_BYTES));
        for (let i = 0; i < HEADER_BYTES && i < out.length; i++) {
            out[i] ^= key[i];
        }
        return out;
    }

    /** Locate the on-disk encrypted counterpart of a plain asset path, if any. */
    function encryptedPathFor(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const variants = ENCRYPTED_VARIANTS[ext];
        if (!variants) return null;
        const base = filePath.slice(0, filePath.length - ext.length);
        for (const variant of variants) {
            const candidate = base + variant;
            try {
                if (fs.existsSync(candidate)) return candidate;
            } catch (error) {
                return null;
            }
        }
        return null;
    }

    /** Case-insensitive lookup of the plain or encrypted file within its directory. */
    function caseInsensitivePath(filePath) {
        const dir = path.dirname(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const wanted = path.basename(filePath).toLowerCase();
        const wantedEncrypted = (ENCRYPTED_VARIANTS[ext] || []).map(
            variant => wanted.slice(0, wanted.length - ext.length) + variant);
        let entries;
        try {
            entries = fs.readdirSync(dir);
        } catch (error) {
            return null;
        }
        for (const entry of entries) {
            const lower = entry.toLowerCase();
            if (lower === wanted) return { plain: path.join(dir, entry) };
            if (wantedEncrypted.includes(lower)) return { encrypted: path.join(dir, entry) };
        }
        return null;
    }

    function dataUrlFor(encryptedPath, mime) {
        let stat;
        try {
            stat = fs.statSync(encryptedPath);
        } catch (error) {
            return null;
        }
        const cached = urlByFile.get(encryptedPath);
        if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
            return cached.url;
        }
        const projectRoot = projectRootFor(encryptedPath);
        const key = projectRoot ? keyFor(projectRoot) : null;
        if (!key) return null;
        let bytes;
        try {
            bytes = fs.readFileSync(encryptedPath);
        } catch (error) {
            return null;
        }
        if (bytes.length <= HEADER_BYTES) return null;
        const url = 'data:' + mime + ';base64,'
            + Buffer.from(decrypt(bytes, key)).toString('base64');
        urlByFile.set(encryptedPath, { mtimeMs: stat.mtimeMs, size: stat.size, url });
        return url;
    }

    /**
     * URL an editor surface can load `filePath` from: the file itself when it
     * exists, otherwise its decrypted counterpart as a data: URL, otherwise a
     * case-insensitive match — and as a last resort the plain file:// URL so
     * callers keep their existing error handling.
     */
    function resolveAssetUrl(filePath) {
        if (!fs || !filePath) return fileUrl(filePath);
        try {
            if (fs.existsSync(filePath)) return fileUrl(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const encrypted = encryptedPathFor(filePath);
            if (encrypted) return dataUrlFor(encrypted, MIME[ext]) || fileUrl(filePath);
            const match = caseInsensitivePath(filePath);
            if (match && match.plain) return fileUrl(match.plain);
            if (match && match.encrypted) return dataUrlFor(match.encrypted, MIME[ext]) || fileUrl(filePath);
        } catch (error) {
            // Fall through to the plain URL.
        }
        return fileUrl(filePath);
    }

    function readPrefix(target, limit) {
        const fd = fs.openSync(target, 'r');
        try {
            const size = fs.fstatSync(fd).size;
            const length = Math.min(limit, size);
            const out = Buffer.alloc(length);
            fs.readSync(fd, out, 0, length, 0);
            return new Uint8Array(out.buffer, out.byteOffset, length);
        } finally {
            fs.closeSync(fd);
        }
    }

    function readEncryptedPrefix(target, limit) {
        const projectRoot = projectRootFor(target);
        const key = projectRoot ? keyFor(projectRoot) : null;
        if (!key) return null;
        // Only the first 16 bytes after the fake header are XORed, so a
        // prefix decrypts without reading the rest of the file.
        const raw = readPrefix(target, limit + HEADER_BYTES);
        if (!raw || raw.length <= HEADER_BYTES) return null;
        return decrypt(raw, key);
    }

    /**
     * The first `maxBytes` decrypted bytes of an asset, for header and
     * metadata sniffing without loading whole multi-megabyte files.
     * Resolves plain, encrypted, and differently-cased files like
     * resolveAssetUrl does. Returns a Uint8Array or null.
     */
    function readAssetBytes(filePath, maxBytes) {
        const limit = Math.floor(Number(maxBytes));
        if (!fs || !filePath || !(limit > 0)) return null;
        try {
            if (fs.existsSync(filePath)) return readPrefix(filePath, limit);
            const encrypted = encryptedPathFor(filePath);
            if (encrypted) return readEncryptedPrefix(encrypted, limit);
            const match = caseInsensitivePath(filePath);
            if (match && match.plain) return readPrefix(match.plain, limit);
            if (match && match.encrypted) return readEncryptedPrefix(match.encrypted, limit);
        } catch (error) {
            // Unreadable file — callers treat null as "no metadata".
        }
        return null;
    }

    /** Whether the asset exists in plain, encrypted, or differently-cased form. */
    function assetExists(filePath) {
        if (!fs || !filePath) return false;
        try {
            if (fs.existsSync(filePath)) return true;
            if (encryptedPathFor(filePath)) return true;
            return !!caseInsensitivePath(filePath);
        } catch (error) {
            return false;
        }
    }

    /**
     * The whole asset as bytes, asynchronously: the synchronous reader on
     * desktop, a fetch of the served file in the browser (where sync byte
     * access does not exist). Returns a Uint8Array or null.
     */
    async function readAssetBytesAsync(filePath) {
        const sync = readAssetBytes(filePath, Number.MAX_SAFE_INTEGER);
        if (sync) return sync;
        const host = typeof window !== 'undefined' ? window.RPGReactorWebHost : null;
        if (host && host.fs && typeof host.fs.readFileAsync === 'function' && filePath) {
            try {
                const bytes = await host.fs.readFileAsync(filePath);
                return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            } catch (error) {
                return null;
            }
        }
        return null;
    }

    const api = { resolveAssetUrl, assetExists, readAssetBytes, readAssetBytesAsync };
    root.RREncryptedAssets = api;

    // WebHost overwrites this with its own resolver when the editor runs in a
    // browser; on desktop this is the sole definition and every call site
    // already prefers it over building a file:// URL by hand.
    if (fs && !root.RPGReactorAssetUrl) {
        root.RPGReactorAssetUrl = resolveAssetUrl;
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
