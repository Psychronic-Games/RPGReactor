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
    let pathToFileURL = null;
    let hostAssetUrl = null;
    try {
        fs = require('fs');
        path = require('path');
    } catch (error) {
        fs = null;
        path = null;
    }
    try {
        pathToFileURL = require('url').pathToFileURL;
    } catch (error) {
        pathToFileURL = null;
    }

    const HEADER_BYTES = 16;
    const ENCRYPTED_HEADER = Uint8Array.from([
        0x52, 0x50, 0x47, 0x4d, 0x56, 0x00, 0x00, 0x00,
        0x00, 0x03, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
    // 89 50 4E 47 0D 0A 1A 0A + IHDR chunk length (13) + "IHDR"
    const PNG_HEADER = Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
    ]);
    const ENCRYPTED_VARIANTS = {
        '.png': ['.png_', '.rpgmvp'],
        '.jpg': ['.jpg_'],
        '.jpeg': ['.jpeg_'],
        '.webp': ['.webp_'],
        '.svg': ['.svg_'],
        '.gif': ['.gif_'],
        '.ogg': ['.ogg_', '.rpgmvo'],
        '.m4a': ['.m4a_', '.rpgmvm'],
        '.mp3': ['.mp3_'],
        '.wav': ['.wav_'],
        '.flac': ['.flac_']
    };
    const MIME = {
        '.png': 'image/png', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
        '.svg': 'image/svg+xml', '.gif': 'image/gif',
        '.webm': 'video/webm', '.mp4': 'video/mp4', '.woff': 'font/woff',
        '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
        '.ico': 'image/x-icon'
    };

    const urlByFile = new Map();    // encrypted file path -> physical identity, key, and URL

    function hasEncryptedHeader(bytes) {
        return bytes?.length >= HEADER_BYTES
            && ENCRYPTED_HEADER.every((value, index) => bytes[index] === value);
    }

    function plausibleEncryptedPng(bytes) {
        if (!hasEncryptedHeader(bytes) || bytes.length < HEADER_BYTES * 2 + 17) return false;
        const view = new DataView(bytes.buffer, bytes.byteOffset + HEADER_BYTES * 2, 8);
        const width = view.getUint32(0);
        const height = view.getUint32(4);
        if (!(width > 0 && height > 0 && width <= 100000 && height <= 100000)) return false;
        const bitDepth = bytes[HEADER_BYTES * 2 + 8];
        const colorType = bytes[HEADER_BYTES * 2 + 9];
        const validDepths = {
            0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16]
        }[colorType];
        if (!validDepths?.includes(bitDepth)
            || bytes[HEADER_BYTES * 2 + 10] !== 0
            || bytes[HEADER_BYTES * 2 + 11] !== 0
            || bytes[HEADER_BYTES * 2 + 12] > 1) return false;
        let crc = 0xffffffff;
        const updateCrc = value => {
            crc ^= value;
            for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        };
        for (const value of [0x49, 0x48, 0x44, 0x52]) updateCrc(value);
        for (let index = 0; index < 13; index++) updateCrc(bytes[HEADER_BYTES * 2 + index]);
        const storedCrc = new DataView(bytes.buffer, bytes.byteOffset + HEADER_BYTES * 2 + 13, 4).getUint32(0);
        return (crc ^ 0xffffffff) >>> 0 === storedCrc;
    }

    function fileUrl(filePath) {
        const raw = String(filePath);
        if (hostAssetUrl) return hostAssetUrl(raw);
        const nativeWindows = typeof process !== 'undefined' && process.platform === 'win32';
        const drivePath = /^[A-Za-z]:[\\/]/.test(raw);
        const backslashUnc = /^\\\\[^\\]/.test(raw);
        const forwardSlashUnc = /^\/\/[^/]/.test(raw);
        const windowsPath = drivePath || backslashUnc || (nativeWindows && forwardSlashUnc);
        if (pathToFileURL) {
            try {
                return windowsPath
                    ? pathToFileURL(raw, { windows: true }).href
                    : pathToFileURL(raw).href;
            } catch (error) {
                // Fall through for restricted hosts or paths rejected by Node.
            }
        }

        const encodePath = value => encodeURI(value)
            .replace(/#/g, '%23')
            .replace(/\?/g, '%3F');
        let normalized = raw.replace(/\\/g, '/');
        let href;
        if (windowsPath && normalized.startsWith('//')) {
            const pathStart = normalized.indexOf('/', 2);
            const host = pathStart < 0 ? normalized.slice(2) : normalized.slice(2, pathStart);
            const pathname = pathStart < 0 ? '/' : normalized.slice(pathStart);
            href = 'file://' + host + encodePath(pathname);
        } else {
            if (/^[A-Za-z]:\//.test(normalized)) normalized = '/' + normalized;
            href = 'file://' + encodePath(normalized);
        }
        try {
            return typeof URL === 'function' ? new URL(href).href : href;
        } catch (error) {
            return href;
        }
    }

    /** The project directory an asset belongs to: the nearest ancestor with data/System.json. */
    function projectRootFor(filePath) {
        if (!fs) return null;
        let dir = path.dirname(path.resolve(filePath));
        while (true) {
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

    function encryptedPngCandidates(projectRoot) {
        const files = [];
        const imageRoot = path.join(projectRoot, 'img');
        if (typeof fs.lstatSync === 'function') {
            try {
                const stat = fs.lstatSync(imageRoot);
                if (stat.isSymbolicLink?.() || !stat.isDirectory()) return files;
            } catch (error) {
                return files;
            }
        }
        const pending = [imageRoot];
        while (pending.length) {
            const directory = pending.pop();
            let entries;
            try {
                entries = fs.readdirSync(directory, { withFileTypes: true });
            } catch (error) {
                continue;
            }
            for (const entry of entries) {
                if (entry.isSymbolicLink?.()) continue;
                const target = path.join(directory, entry.name);
                if (entry.isDirectory()) pending.push(target);
                else if (entry.isFile() && /\.(png_|rpgmvp)$/i.test(entry.name)) files.push(target);
            }
        }
        return files;
    }

    function keyFromHex(hex) {
        if (typeof hex !== 'string' || !/^[0-9a-fA-F]{32}$/.test(hex)) return null;
        const pairs = hex.match(/.{2}/g);
        return Uint8Array.from(pairs, pair => parseInt(pair, 16));
    }

    /** Recover the key from an encrypted PNG's constant plaintext header. */
    function recoverKey(projectRoot) {
        for (const filePath of encryptedPngCandidates(projectRoot)) {
            try {
                const bytes = readPrefix(filePath, 64);
                if (!plausibleEncryptedPng(bytes)) continue;
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
        let key = null;
        try {
            const system = JSON.parse(
                fs.readFileSync(path.join(projectRoot, 'data', 'System.json'), 'utf8'));
            key = keyFromHex(system.encryptionKey);
        } catch (error) {
            key = null;
        }
        if (!key) key = recoverKey(projectRoot);
        return key;
    }

    async function recoverKeyAsync(projectRoot) {
        if (!fs || typeof fs.readFileAsync !== 'function') return null;
        for (const filePath of encryptedPngCandidates(projectRoot)) {
            try {
                const value = await fs.readFileAsync(filePath);
                const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
                if (!plausibleEncryptedPng(bytes)) continue;
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

    async function keyForAsync(projectRoot) {
        let key = null;
        try {
            const system = JSON.parse(
                fs.readFileSync(path.join(projectRoot, 'data', 'System.json'), 'utf8'));
            key = keyFromHex(system.encryptionKey);
        } catch (error) {
            key = null;
        }
        if (!key) key = typeof fs.openSync === 'function'
            ? recoverKey(projectRoot)
            : await recoverKeyAsync(projectRoot);
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

    function encrypt(bytes, key) {
        const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        if (!(key instanceof Uint8Array) || key.length !== HEADER_BYTES) {
            throw new Error('A 16-byte RPG Maker encryption key is required.');
        }
        const out = new Uint8Array(HEADER_BYTES + source.length);
        out.set(ENCRYPTED_HEADER);
        out.set(source, HEADER_BYTES);
        for (let i = 0; i < HEADER_BYTES && i < source.length; i++) {
            out[HEADER_BYTES + i] ^= key[i];
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

    function physicalAssetRecord(filePath) {
        if (!fs || !path || !filePath) return null;
        try {
            if (fs.existsSync(filePath)) {
                return { path: filePath, encrypted: false, sourceExtension: path.extname(filePath) };
            }
            const encrypted = encryptedPathFor(filePath);
            if (encrypted) {
                return { path: encrypted, encrypted: true, sourceExtension: path.extname(encrypted) };
            }
            const match = caseInsensitivePath(filePath);
            if (match?.plain) {
                return { path: match.plain, encrypted: false, sourceExtension: path.extname(match.plain) };
            }
            if (match?.encrypted) {
                return { path: match.encrypted, encrypted: true, sourceExtension: path.extname(match.encrypted) };
            }
        } catch (error) {
            return null;
        }
        return null;
    }

    function dataUrlFor(encryptedPath, mime) {
        let stat;
        try {
            stat = typeof fs.lstatSync === 'function'
                ? fs.lstatSync(encryptedPath)
                : fs.statSync(encryptedPath);
            if (stat.isSymbolicLink?.() || !stat.isFile()) return null;
        } catch (error) {
            return null;
        }
        const projectRoot = projectRootFor(encryptedPath);
        const key = projectRoot ? keyFor(projectRoot) : null;
        if (!key) return null;
        const keyId = Array.from(key, value => value.toString(16).padStart(2, '0')).join('');
        const identity = {
            dev: stat.dev, ino: stat.ino, size: stat.size,
            mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, keyId
        };
        const cached = urlByFile.get(encryptedPath);
        if (cached && ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'keyId']
            .every(field => cached[field] === identity[field])) {
            return cached.url;
        }
        let bytes;
        try {
            bytes = typeof fs.openSync === 'function'
                ? readPrefix(encryptedPath, Number.MAX_SAFE_INTEGER, identity)
                : fs.readFileSync(encryptedPath);
        } catch (error) {
            return null;
        }
        if (!bytes || bytes.length <= HEADER_BYTES) return null;
        const url = 'data:' + mime + ';base64,'
            + Buffer.from(decrypt(bytes, key)).toString('base64');
        urlByFile.set(encryptedPath, { ...identity, url });
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

    async function dataUrlForAsync(encryptedPath, mime) {
        const direct = dataUrlFor(encryptedPath, mime);
        if (direct) return direct;
        if (!fs || typeof fs.readFileAsync !== 'function') return null;
        const projectRoot = projectRootFor(encryptedPath);
        const key = projectRoot ? await keyForAsync(projectRoot) : null;
        if (!key) return null;
        try {
            const value = await fs.readFileAsync(encryptedPath);
            const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
            if (bytes.length <= HEADER_BYTES) return null;
            return 'data:' + mime + ';base64,'
                + Buffer.from(decrypt(bytes, key)).toString('base64');
        } catch (error) {
            return null;
        }
    }

    async function resolveAssetUrlAsync(filePath) {
        if (!fs || !filePath) return fileUrl(filePath);
        try {
            if (fs.existsSync(filePath)) return fileUrl(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const encrypted = encryptedPathFor(filePath);
            if (encrypted) return await dataUrlForAsync(encrypted, MIME[ext]) || fileUrl(filePath);
            const match = caseInsensitivePath(filePath);
            if (match?.plain) return fileUrl(match.plain);
            if (match?.encrypted) {
                return await dataUrlForAsync(match.encrypted, MIME[ext]) || fileUrl(filePath);
            }
        } catch (error) {
            // Fall through to the host or desktop URL.
        }
        return fileUrl(filePath);
    }

    /** Resolve one already-cataloged physical file without preferring an alias. */
    async function resolvePhysicalAssetUrlAsync(filePath, logicalExtension, encrypted = false) {
        const mime = MIME[String(logicalExtension || '').toLowerCase()] || 'application/octet-stream';
        const bytes = await readPhysicalAssetBytesAsync(filePath, encrypted);
        if (!bytes) return null;
        if (typeof window !== 'undefined' && typeof Blob === 'function' && URL?.createObjectURL) {
            return URL.createObjectURL(new Blob([bytes], { type: mime }));
        }
        return 'data:' + mime + ';base64,' + Buffer.from(bytes).toString('base64');
    }

    function matchesExpectedIdentity(stat, expectedIdentity) {
        if (!expectedIdentity) return true;
        return ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(field =>
            expectedIdentity[field] == null || stat[field] === expectedIdentity[field]);
    }

    function readPrefix(target, limit, expectedIdentity = null) {
        const constants = fs.constants || {};
        const flags = constants.O_RDONLY !== undefined
            ? constants.O_RDONLY | (constants.O_NOFOLLOW || 0)
            : 'r';
        const fd = fs.openSync(target, flags);
        try {
            const stat = fs.fstatSync(fd);
            if (!stat.isFile()) return null;
            if (!matchesExpectedIdentity(stat, expectedIdentity)) return null;
            const size = stat.size;
            const length = Math.min(limit, size);
            const out = Buffer.alloc(length);
            let offset = 0;
            while (offset < length) {
                const read = fs.readSync(fd, out, offset, length - offset, offset);
                if (!(read > 0)) break;
                offset += read;
            }
            if (expectedIdentity && !matchesExpectedIdentity(fs.fstatSync(fd), expectedIdentity)) return null;
            return new Uint8Array(out.buffer, out.byteOffset, offset);
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
        const record = physicalAssetRecord(filePath);
        if (record && fs && typeof fs.readFileAsync === 'function') {
            try {
                const value = await fs.readFileAsync(record.path);
                const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
                if (!record.encrypted) return bytes;
                const projectRoot = projectRootFor(record.path);
                const key = projectRoot ? await keyForAsync(projectRoot) : null;
                return key && bytes.length > HEADER_BYTES ? decrypt(bytes, key) : null;
            } catch (error) {
                return null;
            }
        }
        return null;
    }

    /** Read one already-cataloged physical file, decrypting that exact file when requested. */
    async function readPhysicalAssetBytesAsync(filePath, encrypted = false, expectedIdentity = null) {
        if (!fs || !filePath) return null;
        try {
            let value;
            if (typeof fs.openSync === 'function') {
                value = readPrefix(filePath, Number.MAX_SAFE_INTEGER, expectedIdentity);
            } else if (typeof fs.readFileAsync === 'function') {
                if (expectedIdentity && !matchesExpectedIdentity(fs.statSync(filePath), expectedIdentity)) return null;
                value = await fs.readFileAsync(filePath);
                if (expectedIdentity && !matchesExpectedIdentity(fs.statSync(filePath), expectedIdentity)) return null;
            } else {
                return null;
            }
            if (!value) return null;
            const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
            if (!encrypted) return bytes;
            const projectRoot = projectRootFor(filePath);
            const key = projectRoot ? await keyForAsync(projectRoot) : null;
            return key && bytes.length > HEADER_BYTES ? decrypt(bytes, key) : null;
        } catch (error) {
            return null;
        }
    }

    function invalidateProject(projectRoot) {
        if (!projectRoot || !path) return;
        const resolved = path.resolve(projectRoot);
        const prefix = resolved.endsWith(path.sep) ? resolved : `${resolved}${path.sep}`;
        for (const filePath of urlByFile.keys()) {
            const candidate = path.resolve(filePath);
            if (candidate === resolved || candidate.startsWith(prefix)) urlByFile.delete(filePath);
        }
    }

    function invalidateAsset(filePath) {
        if (!filePath || !path) return;
        const record = physicalAssetRecord(filePath);
        if (record) urlByFile.delete(record.path);
        urlByFile.delete(filePath);
    }

    function useFileSystem(nextFs, nextPath, nextAssetUrl = null) {
        fs = nextFs || fs;
        path = nextPath || path;
        hostAssetUrl = typeof nextAssetUrl === 'function' ? nextAssetUrl : null;
    }

    const api = {
        resolveAssetUrl,
        resolveAssetUrlAsync,
        resolvePhysicalAssetUrlAsync,
        physicalAssetRecord,
        assetExists,
        readAssetBytes,
        readAssetBytesAsync,
        readPhysicalAssetBytesAsync,
        encryptionKeyFor: keyFor,
        encryptAssetBytes: encrypt,
        invalidateAsset,
        invalidateProject,
        useFileSystem
    };
    root.RREncryptedAssets = api;

    // WebHost overwrites this with its own resolver when the editor runs in a
    // browser; on desktop this is the sole definition and every call site
    // already prefers it over building a file:// URL by hand.
    if (fs && !root.RPGReactorAssetUrl) {
        root.RPGReactorAssetUrl = resolveAssetUrl;
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
