/**
 * Recursively indexes project assets while preserving RPG Maker's
 * extensionless, forward-slash relative-name convention.
 */
(function(root) {
    const compare = (a, b) => a.localeCompare(b, undefined, {
        sensitivity: 'base',
        numeric: true
    }) || a.localeCompare(b, undefined, { sensitivity: 'variant', numeric: true });

    const normalizeExtensions = (extensions) => (extensions || [])
        .map(extension => String(extension).toLowerCase())
        .map(extension => extension.startsWith('.') ? extension : `.${extension}`);

    const normalizeRelative = value => String(value || '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/^\/+|\/+$/g, '');

    // RPG Maker-encrypted files stand in for their plain counterparts. They
    // are listed under the plain extension and a plain absolutePath; loading
    // goes through RPGReactorAssetUrl, which decrypts on the fly.
    const ENCRYPTED_TO_PLAIN = {
        '.png_': '.png', '.rpgmvp': '.png',
        '.ogg_': '.ogg', '.rpgmvo': '.ogg',
        '.m4a_': '.m4a', '.rpgmvm': '.m4a'
    };

    const list = (rootDir, extensions, options = {}) => {
        if (!rootDir) return [];

        const fs = require('fs');
        const path = require('path');
        const allowed = normalizeExtensions(extensions);
        const allowedSet = new Set(allowed);
        const files = [];

        if (!fs.existsSync(rootDir)) return files;

        const visit = (directory, parts) => {
            let entries;
            try {
                entries = fs.readdirSync(directory, { withFileTypes: true });
            } catch (error) {
                return;
            }

            entries.sort((a, b) => compare(a.name, b.name));
            for (const entry of entries) {
                const nextParts = parts.concat(entry.name);
                const absolutePath = path.join(directory, entry.name);
                if (entry.isDirectory()) {
                    if (options.recursive !== false) visit(absolutePath, nextParts);
                    continue;
                }
                if (!entry.isFile()) continue;

                const sourceExtension = path.extname(entry.name);
                let extension = sourceExtension.toLowerCase();
                let recordAbsolutePath = absolutePath;
                let recordName = entry.name;
                const plainExtension = ENCRYPTED_TO_PLAIN[extension];
                if (plainExtension && (!allowedSet.size || allowedSet.has(plainExtension))) {
                    recordName = entry.name.slice(0, -sourceExtension.length) + plainExtension;
                    recordAbsolutePath = absolutePath.slice(0, -sourceExtension.length) + plainExtension;
                    extension = plainExtension;
                } else {
                    if (allowedSet.size && !allowedSet.has(extension)) continue;
                    // RPG Maker reconstructs lowercase .png/.ogg/etc. URLs at
                    // runtime, so exposing uppercase variants would save a name
                    // that works on Windows but fails on Linux and the Web.
                    if (allowedSet.size && sourceExtension !== extension) continue;
                }

                const relativePath = parts.concat(recordName).join('/');
                files.push({
                    name: extension ? relativePath.slice(0, -extension.length) : relativePath,
                    relativePath,
                    absolutePath: recordAbsolutePath,
                    extension
                });
            }
        };

        visit(rootDir, []);
        const extensionRank = extension => {
            const rank = allowed.indexOf(extension);
            return rank === -1 ? allowed.length : rank;
        };
        return files.sort((a, b) => compare(a.name, b.name)
            || extensionRank(a.extension) - extensionRank(b.extension)
            || compare(a.relativePath, b.relativePath));
    };

    const unique = records => {
        const names = new Set();
        return records.filter(record => {
            if (names.has(record.name)) return false;
            names.add(record.name);
            return true;
        });
    };

    const find = (rootDir, name, extensions) => {
        const normalized = normalizeRelative(name);
        if (!normalized || normalized.split('/').includes('..')) return null;
        const fs = require('fs');
        const path = require('path');
        const allowed = normalizeExtensions(extensions);
        const resolvedRoot = path.resolve(rootDir);

        for (const extension of allowed) {
            const absolutePath = path.resolve(rootDir, ...normalized.split('/')) + extension;
            if (absolutePath !== resolvedRoot && !absolutePath.startsWith(`${resolvedRoot}${path.sep}`)) continue;
            try {
                if (!fs.existsSync(absolutePath)
                    && root.RREncryptedAssets && root.RREncryptedAssets.assetExists(absolutePath)) {
                    return {
                        name: normalized,
                        relativePath: `${normalized}${extension}`,
                        absolutePath,
                        extension
                    };
                }
                if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
                    return {
                        name: normalized,
                        relativePath: `${normalized}${extension}`,
                        absolutePath,
                        extension
                    };
                }
            } catch (error) {
                // Fall back to the recursive, case-insensitive index.
            }
        }

        const records = list(rootDir, extensions);
        return records.find(record => record.name === normalized)
            || records.find(record => record.name.toLowerCase() === normalized.toLowerCase())
            || null;
    };

    const toUrl = filePath => {
        if (!filePath || /^(file|https?):\/\//i.test(filePath)) return filePath;
        if (root.RPGReactorAssetUrl) return root.RPGReactorAssetUrl(filePath);

        try {
            const { pathToFileURL } = require('url');
            if (pathToFileURL) return pathToFileURL(filePath).href;
        } catch (error) {
            // Fall through to a minimal NW.js-safe file URL.
        }

        let normalized = String(filePath).replace(/\\/g, '/');
        if (/^[A-Za-z]:\//.test(normalized)) normalized = `/${normalized}`;
        return `file://${encodeURI(normalized).replace(/#/g, '%23')}`;
    };

    // RPG Maker face sheets always have four 144px columns. Reactor also
    // accepts additional complete rows instead of limiting selection to two.
    const FACE_COLUMNS = 4;
    const FACE_SIZE = 144;
    const faceSheetMetrics = imageOrHeight => {
        const height = Number(imageOrHeight && typeof imageOrHeight === 'object'
            ? (imageOrHeight.naturalHeight || imageOrHeight.height)
            : imageOrHeight) || 0;
        const rows = Math.floor(height / FACE_SIZE);
        return { columns: FACE_COLUMNS, rows, count: FACE_COLUMNS * rows, faceSize: FACE_SIZE };
    };
    const faceSourceRect = (index, imageOrHeight) => {
        const value = Number(index);
        const sheet = faceSheetMetrics(imageOrHeight);
        if (!Number.isInteger(value) || value < 0 || value >= sheet.count) return null;
        return {
            x: (value % FACE_COLUMNS) * FACE_SIZE,
            y: Math.floor(value / FACE_COLUMNS) * FACE_SIZE,
            width: FACE_SIZE,
            height: FACE_SIZE
        };
    };

    const api = {
        basename(name) {
            return normalizeRelative(name).split('/').pop() || '';
        },
        find,
        isBigCharacter(name) {
            const basename = normalizeRelative(name).split('/').pop() || '';
            const sign = basename.match(/^[!$]+/);
            return Boolean(sign && sign[0].includes('$'));
        },
        isObjectCharacter(name) {
            const basename = normalizeRelative(name).split('/').pop() || '';
            const sign = basename.match(/^[!$]+/);
            return Boolean(sign && sign[0].includes('!'));
        },
        list,
        listNames(rootDir, extensions, options) {
            return unique(list(rootDir, extensions, options)).map(record => record.name);
        },
        listUnique: (rootDir, extensions, options) => unique(list(rootDir, extensions, options)),
        normalizeRelative,
        toUrl,
        urlFor(rootDir, name, extensions) {
            const record = find(rootDir, name, extensions);
            return record ? toUrl(record.absolutePath) : '';
        }
    };

    root.RRAssetFiles = api;
    root.RRFaceSheet = {
        COLUMNS: FACE_COLUMNS,
        FACE_SIZE,
        metrics: faceSheetMetrics,
        sourceRect: faceSourceRect
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
