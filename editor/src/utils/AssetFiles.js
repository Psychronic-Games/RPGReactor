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
        '.jpg_': '.jpg', '.jpeg_': '.jpeg', '.webp_': '.webp',
        '.svg_': '.svg', '.gif_': '.gif', '.apng_': '.apng',
        '.ogg_': '.ogg', '.rpgmvo': '.ogg',
        '.m4a_': '.m4a', '.rpgmvm': '.m4a',
        '.mp3_': '.mp3', '.wav_': '.wav', '.flac_': '.flac'
    };

    // Every format the runtime can play, in resolution priority order:
    // when the same name exists in several formats, the earliest wins.
    const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.wav', '.flac', '.m4a'];
    const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.apng'];

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
                    // Callers whose files are addressed by their real recorded
                    // name — 3D models, whose sidecar stores the exact
                    // filename — opt out with `anyCase` and keep the case.
                    if (allowedSet.size && sourceExtension !== extension
                        && !options.anyCase) continue;
                }

                const relativePath = parts.concat(recordName).join('/');
                files.push({
                    name: extension ? relativePath.slice(0, -extension.length) : relativePath,
                    relativePath,
                    absolutePath: recordAbsolutePath,
                    extension,
                    sourceExtension
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
                    const physical = root.RREncryptedAssets.physicalAssetRecord
                        ? root.RREncryptedAssets.physicalAssetRecord(absolutePath)
                        : null;
                    return {
                        name: normalized,
                        relativePath: `${normalized}${extension}`,
                        absolutePath,
                        extension,
                        sourceExtension: physical?.sourceExtension || extension
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

    const imageReference = record => record.extension === '.png'
        ? record.name
        : record.relativePath;

    const listImages = (rootDir, options) => {
        const references = new Set();
        return list(rootDir, IMAGE_EXTENSIONS, options).filter(record => {
            const reference = imageReference(record);
            if (references.has(reference)) return false;
            references.add(reference);
            record.imageReference = reference;
            return true;
        });
    };

    const findImage = (rootDir, reference) => {
        const normalized = normalizeRelative(reference);
        if (!normalized || normalized.split('/').includes('..')) return null;
        const lower = normalized.toLowerCase();
        const extension = IMAGE_EXTENSIONS.find(item => lower.endsWith(item));
        let record = extension
            ? find(rootDir, normalized.slice(0, -extension.length), [extension])
            : find(rootDir, normalized, ['.png']);
        if (!record && extension) record = find(rootDir, normalized, ['.png']);
        if (record) record.imageReference = imageReference(record);
        return record;
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
        return `file://${encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
    };

    // Face sheets have four columns at the configured System 2 face size. Reactor also
    // accepts additional complete rows instead of limiting selection to two.
    const FACE_COLUMNS = 4;
    const FACE_SIZE = 144;
    const faceSizeOf = (system = root.reactor?.databaseManager?.getSystem?.()) => {
        const size = Number(typeof system === 'number' ? system : system?.faceSize);
        return Number.isInteger(size) && size > 0 ? size : FACE_SIZE;
    };
    const faceSheetMetrics = (imageOrHeight, system) => {
        const faceSize = faceSizeOf(system);
        const height = Number(imageOrHeight && typeof imageOrHeight === 'object'
            ? (imageOrHeight.naturalHeight || imageOrHeight.height)
            : imageOrHeight) || 0;
        const rows = Math.floor(height / faceSize);
        return { columns: FACE_COLUMNS, rows, count: FACE_COLUMNS * rows, faceSize };
    };
    const faceSourceRect = (index, imageOrHeight, system) => {
        const value = Number(index);
        const sheet = faceSheetMetrics(imageOrHeight, system);
        if (!Number.isInteger(value) || value < 0 || value >= sheet.count) return null;
        return {
            x: (value % FACE_COLUMNS) * sheet.faceSize,
            y: Math.floor(value / FACE_COLUMNS) * sheet.faceSize,
            width: sheet.faceSize,
            height: sheet.faceSize
        };
    };

    const api = {
        AUDIO_EXTENSIONS,
        IMAGE_EXTENSIONS,
        basename(name) {
            return normalizeRelative(name).split('/').pop() || '';
        },
        find,
        findImage,
        imageReference,
        /**
         * The frame count a file name carries: "Name[6F]", as Reactor writes it (number
         * first, like [8D]), or "Name[F6]", the Victor Engine Multi Frames spelling that
         * imported games use; either case, and beside [8D] ("$Name[8D][6F]"). 0 without one.
         */
        framesTagged(name) {
            const m = /\[(?:(\d+)F|F(\d+))\]/i.exec(normalizeRelative(name).split('/').pop() || '');
            return m ? Math.max(1, Number(m[1] || m[2])) : 0;
        },
        /** The tag for n frames per row, as Reactor names its sheets: "[6F]"; none for MZ's 3. */
        frameTag(n) {
            const f = Math.round(Number(n));
            return Number.isFinite(f) && f >= 1 && f !== 3 ? `[${f}F]` : '';
        },
        /**
         * Frames per character row: 3, or N for a "Name[6F]" (or "Name[F6]") sheet when the
         * project's System.json turns multi-frame sheets on (rrMultiFrames: Database ›
         * Reactor Features, an import of a game that used them, or an exported [NF] sheet).
         * A stock project is always 3.
         */
        characterFrameCount(name, system) {
            const sys = system || (typeof window !== 'undefined' ? window.reactor?.databaseManager?.data?.system : null);
            if (!sys || sys.rrMultiFrames !== true) return 3;
            return this.framesTagged(name) || 3;
        },
        /** A "[8D]" sheet: eight blocks of 3 x 4 frames (N x 4 with [NF]), cut as an eight-character sheet whatever its "$" says. */
        isEightDirCharacter(name) {
            return /\[8D\]/i.test(normalizeRelative(name).split('/').pop() || '');
        },
        /** A "[1D]" sheet: one row per character, shown whichever way it faces ([8D] wins over it). */
        isOneDirCharacter(name) {
            const base = normalizeRelative(name).split('/').pop() || '';
            return /\[1D\]/i.test(base) && !/\[8D\]/i.test(base);
        },
        /** Rows per character of a sheet: 1 for a [1D] sheet, else MZ's 4 (down, left, right, up). */
        characterRows(name) {
            return this.isOneDirCharacter(name) ? 1 : 4;
        },
        isBigCharacter(name) {
            const basename = normalizeRelative(name).split('/').pop() || '';
            if (/\[8D\]/i.test(basename)) return false;
            const sign = basename.match(/^[!$]+/);
            return Boolean(sign && sign[0].includes('$'));
        },
        isObjectCharacter(name) {
            const basename = normalizeRelative(name).split('/').pop() || '';
            const sign = basename.match(/^[!$]+/);
            return Boolean(sign && sign[0].includes('!'));
        },
        list,
        listImages,
        listImageReferences(rootDir, options) {
            return listImages(rootDir, options).map(record => record.imageReference);
        },
        /** Whether an image under img/materials is another material's normal or roughness map (`<Name>_normal`, `<Name>_rough`). */
        isMaterialCompanion(reference) {
            return /_(normal|rough)$/i.test(String(reference || '').replace(/\.[a-z0-9]+$/i, ''));
        },
        /** The materials in img/materials: its images, less the normal and roughness maps that go with them. */
        listMaterials(rootDir, options) {
            return listImages(rootDir, options).filter(record => !this.isMaterialCompanion(record.imageReference || record.name));
        },
        listNames(rootDir, extensions, options) {
            return unique(list(rootDir, extensions, options)).map(record => record.name);
        },
        listUnique: (rootDir, extensions, options) => unique(list(rootDir, extensions, options)),
        normalizeRelative,
        toUrl,
        urlFor(rootDir, name, extensions) {
            const record = find(rootDir, name, extensions);
            return record ? toUrl(record.absolutePath) : '';
        },
        imageUrlFor(rootDir, reference) {
            const record = findImage(rootDir, reference);
            return record ? toUrl(record.absolutePath) : '';
        }
    };

    root.RRAssetFiles = api;
    root.RRFaceSheet = {
        COLUMNS: FACE_COLUMNS,
        get FACE_SIZE() { return faceSizeOf(); },
        sizeOf: faceSizeOf,
        metrics: faceSheetMetrics,
        sourceRect: faceSourceRect
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
