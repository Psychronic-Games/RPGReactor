/**
 * Project-wide resource catalog and safe desktop asset operations.
 */
class ResourceManager {
    static folderDefinitions(audioExtensions = null) {
        const audio = audioExtensions || ['.ogg', '.mp3', '.wav', '.flac', '.m4a'];
        const images = typeof RRAssetFiles !== 'undefined' && RRAssetFiles.IMAGE_EXTENSIONS
            ? RRAssetFiles.IMAGE_EXTENSIONS : ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.apng'];
        const image = (id, label, path) => ({ id, label, path, extensions: images, preview: 'image', encryption: 'image' });
        return [
            image('animations', 'Animations', 'img/animations'),
            image('battlebacks1', 'Battlebacks 1', 'img/battlebacks1'),
            image('battlebacks2', 'Battlebacks 2', 'img/battlebacks2'),
            image('characters', 'Characters', 'img/characters'),
            image('enemies', 'Enemies', 'img/enemies'),
            image('faces', 'Faces', 'img/faces'),
            image('parallaxes', 'Parallaxes', 'img/parallaxes'),
            image('pictures', 'Pictures', 'img/pictures'),
            image('sv-actors', 'SV Actors', 'img/sv_actors'),
            image('sv-enemies', 'SV Enemies', 'img/sv_enemies'),
            image('system-images', 'System Images', 'img/system'),
            image('tilesets', 'Tilesets', 'img/tilesets'),
            image('titles1', 'Titles 1', 'img/titles1'),
            image('titles2', 'Titles 2', 'img/titles2'),
            { id: 'bgm', label: 'BGM', path: 'audio/bgm', extensions: audio, preview: 'audio', encryption: 'audio', keepExtension: true },
            { id: 'bgs', label: 'BGS', path: 'audio/bgs', extensions: audio, preview: 'audio', encryption: 'audio', keepExtension: true },
            { id: 'me', label: 'ME', path: 'audio/me', extensions: audio, preview: 'audio', encryption: 'audio', keepExtension: true },
            { id: 'se', label: 'SE', path: 'audio/se', extensions: audio, preview: 'audio', encryption: 'audio', keepExtension: true },
            { id: 'effects', label: 'Effects', path: 'effects', extensions: ['.efkefc'], preview: 'none' },
            { id: 'movies', label: 'Movies', path: 'movies', extensions: ['.webm', '.mp4'], preview: 'video', keepExtension: true },
            { id: 'fonts', label: 'Fonts', path: 'fonts', extensions: ['.woff', '.woff2', '.ttf', '.otf'], preview: 'font', keepExtension: true },
            { id: 'icon', label: 'Application Icons', path: 'icon', extensions: ['.png', '.ico'], preview: 'image', keepExtension: true },
            {
                id: 'models', label: '3D Models', path: '3d',
                extensions: ['.glb', '.obj', '.fbx', '.stl', '.usdz', '.3mf', '.dxf', '.blend'],
                preview: 'model', keepExtension: true, anyCase: true, readOnly: true, allowImport: true
            }
        ];
    }

    static sortedFolders(folders, label = folder => folder.label) {
        return folders.slice().sort((left, right) =>
            label(left).localeCompare(label(right), undefined, {
                sensitivity: 'base', numeric: true
            }));
    }

    static validateRelativePath(value, options = {}) {
        const normalized = String(value || '').replace(/\\/g, '/');
        if (!normalized) {
            if (options.allowEmpty) return '';
            throw new Error('A resource path is required.');
        }
        if (/^[A-Za-z]:/.test(normalized) || normalized.startsWith('//') || /[\0-\x1f\x7f<>:"|?*]/.test(normalized)) {
            throw new Error('The resource path is not safe.');
        }
        const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
        const parts = normalized.split('/');
        for (const part of parts) {
            if (!part || part === '.' || part === '..' || /[. ]$/.test(part) || reserved.test(part)) {
                throw new Error('The resource path is not safe.');
            }
        }
        return parts.join('/');
    }

    static safeDirectory(fs, path, projectRoot, relativePath, create = false, createdDirectories = null) {
        if (create && typeof fs.lstatSync !== 'function') {
            throw new Error('Resource mutations require a desktop filesystem.');
        }
        const statPath = typeof fs.lstatSync === 'function'
            ? filePath => fs.lstatSync(filePath)
            : filePath => fs.statSync(filePath);
        const relative = ResourceManager.validateRelativePath(relativePath);
        const root = typeof fs.realpathSync === 'function'
            ? fs.realpathSync(path.resolve(projectRoot))
            : path.resolve(projectRoot);
        let current = root;
        for (const part of relative.split('/')) {
            current = path.join(current, part);
            let stat = null;
            try {
                stat = statPath(current);
            } catch (error) {
                if (error?.code !== 'ENOENT' || !create) throw error;
                fs.mkdirSync(current);
                stat = statPath(current);
                createdDirectories?.push({
                    path: current,
                    identity: { dev: stat.dev, ino: stat.ino }
                });
            }
            if (stat.isSymbolicLink?.() || !stat.isDirectory()) {
                throw new Error('Resource folders must be ordinary project directories.');
            }
        }
        const resolved = typeof fs.realpathSync === 'function' ? fs.realpathSync(current) : path.resolve(current);
        const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
        if (resolved !== root && !resolved.startsWith(prefix)) throw new Error('The resource folder leaves the project.');
        return resolved;
    }

    static physicalRecord(record, path) {
        const logicalExtension = String(record.extension || '');
        const sourceExtension = String(record.sourceExtension || logicalExtension);
        const replaceExtension = value => logicalExtension && value.toLowerCase().endsWith(logicalExtension.toLowerCase())
            ? value.slice(0, -logicalExtension.length) + sourceExtension
            : value;
        const physicalAbsolutePath = replaceExtension(record.absolutePath);
        const physicalRelativePath = replaceExtension(record.relativePath);
        const encrypted = /^(?:\.png_|\.jpg_|\.jpeg_|\.webp_|\.svg_|\.gif_|\.rpgmvp|\.ogg_|\.rpgmvo|\.m4a_|\.rpgmvm|\.mp3_|\.wav_|\.flac_)$/i
            .test(sourceExtension);
        return {
            ...record,
            physicalAbsolutePath,
            physicalRelativePath,
            encrypted,
            sourceExtension,
            basename: path.basename(record.relativePath)
        };
    }

    static listRecords(fs, path, assetFiles, projectRoot, folder) {
        const root = path.join(projectRoot, ...folder.path.split('/'));
        const records = assetFiles.list(root, folder.extensions, { anyCase: folder.anyCase === true });
        const physical = records.map(record => ResourceManager.physicalRecord(record, path)).filter(record => {
            try {
                const stat = typeof fs.lstatSync === 'function'
                    ? fs.lstatSync(record.physicalAbsolutePath)
                    : fs.statSync(record.physicalAbsolutePath);
                if (stat.isSymbolicLink?.() || !stat.isFile()) return false;
                record.size = stat.size;
                record.mtimeMs = stat.mtimeMs;
                record.ctimeMs = stat.ctimeMs;
                record.dev = stat.dev;
                record.ino = stat.ino;
                record.logicalKey = folder.encryption === 'image'
                    ? assetFiles.imageReference(record)
                    : folder.keepExtension ? record.relativePath : record.name;
                return true;
            } catch (error) {
                return false;
            }
        });
        const displayCounts = new Map();
        for (const record of physical) {
            const base = record.encrypted ? `${record.relativePath} [encrypted]` : record.physicalRelativePath;
            displayCounts.set(base, (displayCounts.get(base) || 0) + 1);
            record.displayBase = base;
        }
        for (const record of physical) {
            record.displayName = displayCounts.get(record.displayBase) > 1
                ? `${record.displayBase} (${record.sourceExtension})`
                : record.displayBase;
        }
        return physical;
    }

    static listSubfolders(fs, path, projectRoot, folderPath) {
        let root;
        try {
            root = ResourceManager.safeDirectory(fs, path, projectRoot, folderPath, false);
        } catch (error) {
            return [];
        }
        const output = [];
        const visit = (directory, parts) => {
            let entries = [];
            try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch (error) { return; }
            for (const entry of entries) {
                if (!entry.isDirectory() || entry.isSymbolicLink?.()) continue;
                const next = parts.concat(entry.name);
                output.push(next.join('/'));
                visit(path.join(directory, entry.name), next);
            }
        };
        visit(root, []);
        return output.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
    }

    static importBytes(options) {
        const { fs, path, assetFiles, projectRoot, folder, sourceName, sourceBytes } = options;
        if (folder.readOnly) throw new Error('This resource category is browse and export only.');
        if (path.basename(sourceName) !== sourceName || /[\\/]/.test(sourceName)) {
            throw new Error('Imported resources must have a safe filename.');
        }
        const sourceExtension = path.extname(sourceName);
        const extension = sourceExtension.toLowerCase();
        if (!folder.extensions.map(item => item.toLowerCase()).includes(extension)) {
            throw new Error(`The ${sourceExtension || '(missing)'} extension is not valid for ${folder.label}.`);
        }
        const baseName = sourceName.slice(0, -sourceExtension.length);
        ResourceManager.validateRelativePath(baseName);
        const fileName = `${baseName}${folder.anyCase ? sourceExtension : extension}`;
        const subfolder = ResourceManager.validateRelativePath(options.subfolder || '', { allowEmpty: true });
        const relativePath = subfolder ? `${subfolder}/${fileName}` : fileName;
        ResourceManager.validateRelativePath(relativePath);

        const bytes = sourceBytes instanceof Uint8Array ? sourceBytes : new Uint8Array(sourceBytes || []);
        if (folder.preview === 'image') {
            const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
            const ascii = (start, length) => Buffer.from(bytes.subarray(start, start + length)).toString('ascii');
            const invalid = ['.png', '.apng'].includes(extension)
                ? bytes.length < png.length || png.some((value, index) => bytes[index] !== value)
                : ['.jpg', '.jpeg'].includes(extension)
                    ? bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff
                        || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9
                    : extension === '.webp'
                        ? bytes.length < 12 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP'
                        : extension === '.gif'
                            ? bytes.length < 10 || !['GIF87a', 'GIF89a'].includes(ascii(0, 6))
                            : false;
            if (invalid) throw new Error(`${sourceName} is not a valid ${extension.slice(1).toUpperCase()} file.`);
            if (extension === '.svg') ResourceManager.validateSvg(bytes, sourceName);
            // A still image under an .apng name costs the runtime a byte read
            // and animates nothing, so say so at import rather than at play.
            if (extension === '.apng' && !ResourceManager.hasApngAnimation(bytes)) {
                throw new Error(`${sourceName} carries no APNG animation (no acTL chunk); import it as .png instead.`);
            }
        }

        const existing = ResourceManager.listRecords(fs, path, assetFiles, projectRoot, folder);
        const logicalName = folder.encryption === 'image'
            ? (extension === '.png' ? relativePath.slice(0, -extension.length) : relativePath)
            : folder.keepExtension ? relativePath : relativePath.slice(0, -extension.length);
        const collisions = existing.filter(record => record.logicalKey.toLowerCase() === logicalName.toLowerCase());
        const approved = new Map((options.replaceRecords || []).map(record => [path.resolve(record.physicalAbsolutePath), record]));
        const sameIdentity = (record, expected) => expected
            && record.dev === expected.dev && record.ino === expected.ino
            && record.size === expected.size && record.mtimeMs === expected.mtimeMs
            && record.ctimeMs === expected.ctimeMs;
        if (collisions.length && (!approved.size || collisions.some(record =>
            !sameIdentity(record, approved.get(path.resolve(record.physicalAbsolutePath)))))) {
            return { collision: true, existing: collisions, logicalName };
        }

        options.verifyOwnership?.();
        let output = bytes;
        let destinationName = fileName;
        const system = options.system || {};
        const encrypt = folder.encryption === 'image'
            ? Boolean(system.hasEncryptedImages)
            : folder.encryption === 'audio' && Boolean(system.hasEncryptedAudio);
        if (encrypt) {
            const key = options.encryptedAssets?.encryptionKeyFor(projectRoot);
            if (!key) throw new Error('The project encryption key is missing or malformed. Import was cancelled.');
            output = options.encryptedAssets.encryptAssetBytes(bytes, key);
            const mvProject = options.project?.importedFrom === 'RPG Maker MV'
                || fs.existsSync(path.join(projectRoot, 'Game.rpgproject'))
                || fs.existsSync(path.join(projectRoot, 'game.rpgproject'));
            const mvExtension = { '.png': '.rpgmvp', '.ogg': '.rpgmvo', '.m4a': '.rpgmvm' }[extension];
            if (mvProject && folder.encryption === 'image' && !mvExtension) {
                throw new Error('RPG Maker MV encryption supports PNG images only. Use PNG or a Reactor runtime project.');
            }
            destinationName = mvProject && mvExtension
                ? `${baseName}${mvExtension}`
                : `${destinationName}_`;
        }
        const categoryPath = subfolder ? `${folder.path}/${subfolder}` : folder.path;
        const destinationDirectory = ResourceManager.safeDirectory(fs, path, projectRoot, categoryPath, true);
        const destination = path.join(destinationDirectory, destinationName);
        options.verifyOwnership?.();
        const verifiedDirectory = ResourceManager.safeDirectory(fs, path, projectRoot, categoryPath, false);
        if (verifiedDirectory !== destinationDirectory) {
            throw new Error('The resource destination changed while the import was in progress.');
        }
        try {
            const stat = fs.lstatSync(destination);
            if (stat.isSymbolicLink?.() || !stat.isFile()) {
                throw new Error('The resource destination is not an ordinary file.');
            }
            const expected = approved.get(path.resolve(destination))
                || Array.from(approved.values()).find(record => sameIdentity({
                    dev: stat.dev, ino: stat.ino, size: stat.size,
                    mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs
                }, record));
            if (!sameIdentity({
                dev: stat.dev, ino: stat.ino, size: stat.size,
                mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs
            }, expected)) {
                throw new Error('The resource destination changed while the import was in progress.');
            }
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }
        const transaction = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const moved = [];
        try {
            for (let index = 0; index < collisions.length; index++) {
                const record = collisions[index];
                const source = record.physicalAbsolutePath;
                const stat = fs.lstatSync(source);
                if (stat.isSymbolicLink?.() || !stat.isFile() || !sameIdentity({
                    dev: stat.dev, ino: stat.ino, size: stat.size,
                    mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs
                }, approved.get(path.resolve(source)))) {
                    throw new Error(`${record.physicalRelativePath} changed after replacement was approved.`);
                }
                const backup = path.join(path.dirname(source), `.rr-import-${transaction}-${index}.bak`);
                fs.renameSync(source, backup);
                moved.push({ source, backup, record });
            }
            try {
                fs.lstatSync(destination);
                throw new Error('The resource destination changed while the import was in progress.');
            } catch (error) {
                if (error?.code !== 'ENOENT') throw error;
            }
            options.writeAtomic(fs, destination, Buffer.from(output));
        } catch (error) {
            const rollbackErrors = [];
            for (const item of moved.slice().reverse()) {
                try { fs.renameSync(item.backup, item.source); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
            }
            if (!rollbackErrors.length) throw error;
            throw new Error(`${error.message} Import rollback was incomplete: ${rollbackErrors.map(item => item.message).join('; ')}`);
        }
        const cleanupErrors = [];
        for (const item of moved) {
            try { fs.unlinkSync(item.backup); } catch (error) {
                cleanupErrors.push(`${item.record.physicalRelativePath}: ${error.message}`);
            }
        }
        options.encryptedAssets?.invalidateProject(projectRoot);
        return { collision: false, destination, logicalName, cleanupErrors };
    }

    /**
     * Whether PNG bytes carry APNG animation, i.e. an `acTL` chunk ahead of
     * the first `IDAT`. Mirrors `Bitmap.hasApngAnimation` in the runtime,
     * which cannot be loaded here; `apng-support.test.cjs` holds the two to
     * the same answers.
     */
    static hasApngAnimation(bytes) {
        const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        if (!bytes || bytes.length < 8) return false;
        if (signature.some((value, index) => bytes[index] !== value)) return false;
        let offset = 8;
        while (offset + 12 <= bytes.length) {
            const length = (bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16)
                + (bytes[offset + 2] << 8) + bytes[offset + 3];
            if (length > 0x7fffffff) return false;
            const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5],
                bytes[offset + 6], bytes[offset + 7]);
            if (type === 'acTL') return true;
            if (type === 'IDAT' || type === 'IEND') return false;
            offset += 12 + length;
        }
        return false;
    }

    static validateSvg(bytes, sourceName = 'SVG') {
        if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024 || bytes.includes(0)) {
            throw new Error(`${sourceName} is not a safe SVG file.`);
        }
        const text = Buffer.from(bytes).toString('utf8');
        if (!/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(text)
            || !/(?:<\/svg>\s*|<svg[^>]*\/>)$/i.test(text)
            || /<!doctype|<!entity|<(?:(?:[a-z_][\w.-]*):)?(?:script|foreignobject|iframe|object|embed|audio|video|use|image|animate|animatemotion|animatetransform|set|discard|style)\b/i.test(text)
            || /\s(?:(?:[a-z_][\w.-]*):)?on[a-z]+\s*=|\sstyle\s*=|@import|\\/i.test(text)
            || /(?:href|xlink:href)\s*=|url\s*\(/i.test(text)) {
            throw new Error(`${sourceName} contains unsupported or unsafe SVG content.`);
        }
        return true;
    }

    static validateModelBytes(sourceBytes, extension, reactor3D) {
        const bytes = sourceBytes instanceof Uint8Array ? sourceBytes : new Uint8Array(sourceBytes || []);
        const kind = String(extension || '').toLowerCase();
        if (!bytes.length) throw new Error('The model file is empty.');
        if (kind === '.blend') throw new Error('Blend files cannot be loaded directly; export as GLB, OBJ, or FBX.');
        const readers = {
            '.obj': 'readObj', '.stl': 'readStl', '.dxf': 'readDxf',
            '.fbx': 'readFbx', '.3mf': 'read3mf', '.usdz': 'readUsdz'
        };
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        if (kind === '.glb') {
            if (!reactor3D?.readGlb) throw new Error('The 3D model validator is unavailable.');
            const parsed = reactor3D.readGlb(buffer);
            const json = parsed?.json;
            if (String(json?.asset?.version || '') !== '2.0'
                || !Array.isArray(json?.meshes) || json.meshes.length === 0) {
                throw new Error('GLB must contain a glTF 2.0 mesh.');
            }
            if ((json.buffers || []).some(bufferRecord => bufferRecord?.uri)) {
                throw new Error('GLB imports must embed their buffers.');
            }
            if ((json.images || []).some(image => image?.uri
                && !/^data:image\/[a-z0-9.+-]+;base64,/i.test(image.uri))) {
                throw new Error('GLB imports must embed their images.');
            }
            const accessors = json.accessors || [];
            const views = json.bufferViews || [];
            const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
            const typeSize = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
            const accessorFits = accessor => {
                const view = views[accessor?.bufferView];
                const bytesPerValue = componentBytes[accessor?.componentType] * typeSize[accessor?.type];
                const count = Number(accessor?.count);
                if (!view || !Number.isFinite(bytesPerValue) || !Number.isInteger(count) || count < 1) return false;
                const stride = Number(view.byteStride) || bytesPerValue;
                const start = Number(accessor.byteOffset) || 0;
                const needed = start + (count - 1) * stride + bytesPerValue;
                return start >= 0 && stride >= bytesPerValue && needed <= Number(view.byteLength);
            };
            const triangle = json.meshes.some(mesh => (mesh.primitives || []).some(primitive => {
                const position = accessors[primitive?.attributes?.POSITION];
                if (!position || position.type !== 'VEC3' || position.count < 3 || !accessorFits(position)) return false;
                if (primitive.mode !== undefined && primitive.mode !== 4) return false;
                if (primitive.indices === undefined) return position.count >= 3;
                const indices = accessors[primitive.indices];
                return indices?.type === 'SCALAR' && indices.count >= 3 && accessorFits(indices);
            }));
            if (!triangle) throw new Error('GLB contains no valid triangle geometry.');
            return true;
        }
        const reader = readers[kind];
        if (!reader) throw new Error(`The ${kind || '(missing)'} model extension is not supported.`);
        if (typeof reactor3D?.[reader] !== 'function') throw new Error('The 3D model validator is unavailable.');
        const parsed = reactor3D[reader](buffer);
        const positions = parsed?.positions;
        if (!positions || positions.length < 9
            || Array.from(positions).some(value => !Number.isFinite(value))) {
            throw new Error('The model contains no valid triangle positions.');
        }
        if (parsed.indices) {
            if (parsed.indices.length < 3 || Array.from(parsed.indices).some(index =>
                !Number.isInteger(index) || index < 0 || index * 3 + 2 >= positions.length)) {
                throw new Error('The model contains invalid triangle indices.');
            }
        } else if (positions.length % 9 !== 0) {
            throw new Error('The model contains incomplete triangle geometry.');
        }
        return true;
    }

    static importModelFolder(options) {
        const { fs, path, projectRoot, sourceName, sourceBytes } = options;
        const modelName = ResourceManager.validateRelativePath(options.modelName);
        const segments = modelName.split('/');
        if (segments.some(segment => /^(?:source|textures)$/i.test(segment)
            || /^\.rr-model-import-/i.test(segment))) {
            throw new Error('Model folder names cannot contain source, textures, or reserved import names.');
        }
        if (path.basename(sourceName) !== sourceName || /[\\/]/.test(sourceName)) {
            throw new Error('Imported models must have a safe source filename.');
        }
        const sourceExtension = path.extname(sourceName);
        const extension = sourceExtension.toLowerCase();
        const allowed = ResourceManager.folderDefinitions().find(folder => folder.id === 'models').extensions;
        if (!allowed.includes(extension)) {
            throw new Error(`The ${sourceExtension || '(missing)'} extension is not valid for 3D Models.`);
        }
        ResourceManager.validateRelativePath(sourceName.slice(0, -sourceExtension.length));
        ResourceManager.validateModelBytes(sourceBytes, extension, options.reactor3D);
        options.verifyOwnership?.();

        const parentParts = segments.slice(0, -1);
        const leaf = segments.at(-1);
        const parentRelative = parentParts.length ? `3d/${parentParts.join('/')}` : '3d';
        const createdDirectories = [];
        let parentDirectory;
        let stagingDirectory = null;
        let stagingIdentity = null;
        let stagingOwned = false;
        let sourceIdentity = null;
        let texturesIdentity = null;
        let stagedMesh = null;
        let destinationLock = null;
        let destinationLockFd = null;
        let destinationReservationIdentity = null;
        let destinationReserved = false;
        const identity = stat => ({ dev: stat.dev, ino: stat.ino });
        const sameIdentity = (stat, expected) => stat && expected
            && stat.dev === expected.dev && stat.ino === expected.ino;
        const collision = directory => fs.readdirSync(directory, { withFileTypes: true })
            .some(entry => entry.name.toLowerCase() === leaf.toLowerCase());
        const requireDirectoryIdentity = (directory, expected, message) => {
            const stat = fs.lstatSync(directory);
            if (stat.isSymbolicLink?.() || !stat.isDirectory() || !sameIdentity(stat, expected)) {
                throw new Error(message);
            }
            return stat;
        };
        const cleanupDirectory = (directory, expected) => {
            requireDirectoryIdentity(directory, expected, `Import staging directory changed: ${directory}`);
            fs.rmdirSync(directory);
        };
        const releaseDestinationLock = (strict = true) => {
            let failure = null;
            if (destinationLockFd !== null) {
                try { fs.closeSync(destinationLockFd); } catch (error) { failure = error; }
                destinationLockFd = null;
            }
            if (destinationLock) {
                try { fs.unlinkSync(destinationLock); } catch (error) {
                    if (error?.code !== 'ENOENT') failure ||= error;
                } finally {
                    destinationLock = null;
                }
            }
            if (failure && strict) throw failure;
            return failure;
        };
        try {
            parentDirectory = ResourceManager.safeDirectory(
                fs, path, projectRoot, parentRelative, true, createdDirectories);
            const parentIdentity = identity(fs.lstatSync(parentDirectory));
            const lockName = Buffer.from(leaf.toLowerCase(), 'utf8').toString('hex');
            destinationLock = path.join(parentDirectory, `.rr-model-destination-${lockName}.lock`);
            try {
                destinationLockFd = fs.openSync(destinationLock, 'wx');
            } catch (error) {
                if (error?.code === 'EEXIST') {
                    throw new Error(`A model import for ${modelName} is already in progress.`);
                }
                throw error;
            }
            if (collision(parentDirectory)) throw new Error(`A model folder named ${modelName} already exists.`);
            const transaction = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            stagingDirectory = path.join(parentDirectory, `.rr-model-import-${transaction}.tmp`);
            requireDirectoryIdentity(parentDirectory, parentIdentity,
                'The model destination changed before staging began.');
            fs.mkdirSync(stagingDirectory);
            stagingIdentity = identity(fs.lstatSync(stagingDirectory));
            stagingOwned = true;
            const sourceDirectory = path.join(stagingDirectory, 'source');
            const texturesDirectory = path.join(stagingDirectory, 'textures');
            fs.mkdirSync(sourceDirectory);
            fs.mkdirSync(texturesDirectory);
            sourceIdentity = identity(fs.lstatSync(sourceDirectory));
            texturesIdentity = identity(fs.lstatSync(texturesDirectory));
            requireDirectoryIdentity(stagingDirectory, stagingIdentity,
                'The model staging directory changed before the mesh was written.');
            requireDirectoryIdentity(sourceDirectory, sourceIdentity,
                'The model source staging directory changed before the mesh was written.');
            stagedMesh = path.join(sourceDirectory, sourceName);
            options.writeAtomic(fs, stagedMesh, Buffer.from(sourceBytes));
            const meshStat = fs.lstatSync(stagedMesh);
            if (meshStat.isSymbolicLink?.() || !meshStat.isFile()) {
                throw new Error('The staged model mesh is not an ordinary file.');
            }

            options.verifyOwnership?.();
            const verifiedParent = ResourceManager.safeDirectory(fs, path, projectRoot, parentRelative, false);
            if (verifiedParent !== parentDirectory || collision(parentDirectory)) {
                throw new Error('The model destination changed while the import was in progress.');
            }
            requireDirectoryIdentity(parentDirectory, parentIdentity,
                'The model destination changed while the import was in progress.');
            requireDirectoryIdentity(stagingDirectory, stagingIdentity,
                'The model staging directory changed while the import was in progress.');
            requireDirectoryIdentity(sourceDirectory, sourceIdentity,
                'The model source staging directory changed while the import was in progress.');
            requireDirectoryIdentity(texturesDirectory, texturesIdentity,
                'The model texture staging directory changed while the import was in progress.');
            const destination = path.join(parentDirectory, leaf);
            try {
                fs.mkdirSync(destination);
            } catch (error) {
                if (error?.code === 'EEXIST') {
                    throw new Error(`A model folder named ${modelName} already exists.`);
                }
                throw error;
            }
            destinationReservationIdentity = identity(fs.lstatSync(destination));
            destinationReserved = true;
            requireDirectoryIdentity(destination, destinationReservationIdentity,
                'The model destination reservation changed before publishing.');
            try {
                fs.renameSync(stagingDirectory, destination);
            } catch (error) {
                const platform = options.platform
                    || (typeof process !== 'undefined' ? process.platform : '');
                if (platform !== 'win32' || !['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error?.code)) {
                    throw error;
                }
                cleanupDirectory(destination, destinationReservationIdentity);
                destinationReserved = false;
                fs.renameSync(stagingDirectory, destination);
            }
            destinationReserved = false;
            stagingDirectory = null;
            stagingOwned = false;
            const lockCleanupError = releaseDestinationLock(false);
            return {
                destination,
                mesh: path.join(destination, 'source', sourceName),
                modelName,
                cleanupErrors: lockCleanupError ? [lockCleanupError.message] : []
            };
        } catch (error) {
            const rollbackErrors = [];
            try { releaseDestinationLock(); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
            if (stagingDirectory && stagingOwned) {
                try {
                    requireDirectoryIdentity(stagingDirectory, stagingIdentity,
                        'The model staging directory changed before rollback.');
                    if (sourceIdentity) {
                        requireDirectoryIdentity(path.join(stagingDirectory, 'source'), sourceIdentity,
                            'The model source staging directory changed before rollback.');
                    }
                    if (texturesIdentity) {
                        requireDirectoryIdentity(path.join(stagingDirectory, 'textures'), texturesIdentity,
                            'The model texture staging directory changed before rollback.');
                    }
                    if (stagedMesh) {
                        try { fs.unlinkSync(stagedMesh); } catch (unlinkError) {
                            if (unlinkError?.code !== 'ENOENT') throw unlinkError;
                        }
                    }
                    for (const [name, expected] of [['source', sourceIdentity], ['textures', texturesIdentity]]) {
                        if (!expected) continue;
                        try { fs.rmdirSync(path.join(stagingDirectory, name)); } catch (removeError) {
                            if (removeError?.code !== 'ENOENT') throw removeError;
                        }
                    }
                    cleanupDirectory(stagingDirectory, stagingIdentity);
                } catch (rollbackError) {
                    rollbackErrors.push(rollbackError);
                }
            }
            if (destinationReserved) {
                try {
                    cleanupDirectory(path.join(parentDirectory, leaf), destinationReservationIdentity);
                    destinationReserved = false;
                } catch (rollbackError) {
                    rollbackErrors.push(rollbackError);
                }
            }
            for (const created of createdDirectories.slice().reverse()) {
                try {
                    const stat = fs.lstatSync(created.path);
                    if (!sameIdentity(stat, created.identity)) continue;
                    fs.rmdirSync(created.path);
                } catch (rollbackError) {
                    if (!['ENOENT', 'ENOTEMPTY'].includes(rollbackError?.code)) rollbackErrors.push(rollbackError);
                }
            }
            if (!rollbackErrors.length) throw error;
            throw new Error(`${error.message} Model import rollback was incomplete: ${rollbackErrors.map(item => item.message).join('; ')}`);
        }
    }

    static deleteRecord(options) {
        const { fs, path, projectRoot, folder, record } = options;
        if (folder.readOnly) throw new Error('This resource category is browse and export only.');
        const categoryRoot = ResourceManager.safeDirectory(fs, path, projectRoot, folder.path, false);
        const parent = path.dirname(record.physicalRelativePath).replace(/\\/g, '/');
        const parentPath = parent === '.' ? folder.path : `${folder.path}/${parent}`;
        ResourceManager.safeDirectory(fs, path, projectRoot, parentPath, false);
        const target = path.resolve(record.physicalAbsolutePath);
        const prefix = categoryRoot.endsWith(path.sep) ? categoryRoot : `${categoryRoot}${path.sep}`;
        if (!target.startsWith(prefix)) throw new Error('The selected resource leaves its project folder.');
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink?.() || !stat.isFile()) throw new Error('Only ordinary resource files can be deleted.');
        if (stat.dev !== record.dev || stat.ino !== record.ino || stat.size !== record.size
            || stat.mtimeMs !== record.mtimeMs || stat.ctimeMs !== record.ctimeMs) {
            throw new Error('The selected resource changed; review it and retry the delete.');
        }
        options.verifyOwnership?.();
        fs.unlinkSync(target);
        options.encryptedAssets?.invalidateProject(projectRoot);
        return target;
    }

    static exportRelativePaths(records, path) {
        const counts = new Map();
        for (const record of records) {
            const key = record.relativePath.toLowerCase();
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        const used = new Set();
        return records.map(record => {
            let relativePath = ResourceManager.validateRelativePath(record.relativePath);
            if (counts.get(relativePath.toLowerCase()) > 1) {
                const extension = path.extname(relativePath);
                const variant = String(record.sourceExtension || extension)
                    .replace(/^\./, '').replace(/[^A-Za-z0-9_-]+/g, '-') || 'file';
                relativePath = `${relativePath.slice(0, -extension.length)}-${variant}${extension}`;
            }
            let candidate = relativePath;
            let suffix = 2;
            while (used.has(candidate.toLowerCase())) {
                const extension = path.extname(relativePath);
                candidate = `${relativePath.slice(0, -extension.length)}-${suffix++}${extension}`;
            }
            used.add(candidate.toLowerCase());
            return candidate;
        });
    }

    static inspectExportTargets(fs, path, chosenRoot, files) {
        const rootStat = fs.lstatSync(chosenRoot);
        if (rootStat.isSymbolicLink?.() || !rootStat.isDirectory()) {
            throw new Error('The export destination must be an ordinary directory.');
        }
        const root = fs.realpathSync(chosenRoot);
        const canonicalRootStat = fs.lstatSync(root);
        if (canonicalRootStat.isSymbolicLink?.() || !canonicalRootStat.isDirectory()) {
            throw new Error('The export destination must be an ordinary directory.');
        }
        if (rootStat.dev !== canonicalRootStat.dev || rootStat.ino !== canonicalRootStat.ino) {
            throw new Error('The export destination changed while it was being inspected.');
        }
        const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
        const missingDirectories = new Set();
        const targets = files.map(file => {
            const relativePath = ResourceManager.validateRelativePath(file.path);
            const target = path.resolve(root, ...relativePath.split('/'));
            if (!target.startsWith(prefix)) throw new Error('An export path leaves the selected directory.');
            const parentParts = relativePath.split('/').slice(0, -1);
            let current = root;
            let missingParent = false;
            for (const part of parentParts) {
                current = path.join(current, part);
                if (missingParent) {
                    missingDirectories.add(current);
                    continue;
                }
                try {
                    const stat = fs.lstatSync(current);
                    if (stat.isSymbolicLink?.() || !stat.isDirectory()) {
                        throw new Error('Export folders must be ordinary directories.');
                    }
                } catch (error) {
                    if (error?.code !== 'ENOENT') throw error;
                    missingParent = true;
                    missingDirectories.add(current);
                }
            }
            let exists = false;
            if (!missingParent) {
                try {
                    const stat = fs.lstatSync(target);
                    if (stat.isSymbolicLink?.() || !stat.isFile()) {
                        throw new Error('Export targets must be ordinary files.');
                    }
                    exists = true;
                } catch (error) {
                    if (error?.code !== 'ENOENT') throw error;
                }
            }
            let identity = null;
            if (exists) {
                const stat = fs.lstatSync(target);
                identity = {
                    dev: stat.dev, ino: stat.ino, size: stat.size,
                    mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs
                };
            }
            return { file, relativePath, target, exists, identity };
        });
        return {
            root,
            rootIdentity: {
                dev: canonicalRootStat.dev, ino: canonicalRootStat.ino
            },
            targets,
            existing: targets.filter(item => item.exists),
            missingDirectories: Array.from(missingDirectories).sort((left, right) => right.length - left.length)
        };
    }

    static writeExportTargetsAtomic(fs, path, inspection, writeAtomic) {
        const transaction = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const staged = [];
        const committed = [];
        const backedUp = [];
        const createdDirectories = [];
        const verifyRoot = () => {
            const stat = fs.lstatSync(inspection.root);
            const expected = inspection.rootIdentity;
            if (stat.isSymbolicLink?.() || !stat.isDirectory()
                || !expected || stat.dev !== expected.dev || stat.ino !== expected.ino) {
                throw new Error('The export destination changed before it could be written.');
            }
        };
        try {
            verifyRoot();
            for (let index = 0; index < inspection.targets.length; index++) {
                verifyRoot();
                const item = inspection.targets[index];
                const parent = path.dirname(item.relativePath).replace(/\\/g, '/');
                const directory = parent === '.'
                    ? inspection.root
                    : ResourceManager.safeDirectory(
                        fs, path, inspection.root, parent, true, createdDirectories);
                const target = path.join(directory, path.basename(item.relativePath));
                const temp = path.join(directory, `.rr-export-${transaction}-${index}.tmp`);
                const backup = item.exists
                    ? path.join(directory, `.rr-export-${transaction}-${index}.bak`)
                    : null;
                writeAtomic(fs, temp, Buffer.from(item.file.data));
                const tempStat = fs.lstatSync(temp);
                staged.push({
                    ...item, target, temp, backup,
                    tempIdentity: { dev: tempStat.dev, ino: tempStat.ino }
                });
            }
            for (const item of staged) {
                verifyRoot();
                let existsNow = false;
                let currentStat = null;
                try {
                    currentStat = fs.lstatSync(item.target);
                    if (currentStat.isSymbolicLink?.() || !currentStat.isFile()) {
                        throw new Error('An export target changed before it could be written.');
                    }
                    existsNow = true;
                } catch (error) {
                    if (error?.code !== 'ENOENT') throw error;
                }
                if (existsNow !== item.exists) {
                    throw new Error('An export target changed before it could be written.');
                }
                if (existsNow && (currentStat.dev !== item.identity.dev || currentStat.ino !== item.identity.ino
                    || currentStat.size !== item.identity.size || currentStat.mtimeMs !== item.identity.mtimeMs
                    || currentStat.ctimeMs !== item.identity.ctimeMs)) {
                    throw new Error('An export target changed before it could be written.');
                }
                if (item.backup) {
                    fs.renameSync(item.target, item.backup);
                    item.backupIdentity = { dev: currentStat.dev, ino: currentStat.ino };
                    backedUp.push(item);
                }
                fs.renameSync(item.temp, item.target);
                const writtenStat = fs.lstatSync(item.target);
                item.writtenIdentity = { dev: writtenStat.dev, ino: writtenStat.ino };
                committed.push(item);
            }
            const cleanupErrors = [];
            for (const item of committed) {
                if (item.backup) {
                    try { fs.unlinkSync(item.backup); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
                }
            }
            return cleanupErrors;
        } catch (error) {
            const rollbackErrors = [];
            for (const item of committed.slice().reverse()) {
                try {
                    if (item.backup) {
                        const backupStat = fs.lstatSync(item.backup);
                        if (backupStat.isSymbolicLink?.() || !backupStat.isFile()
                            || backupStat.dev !== item.backupIdentity.dev
                            || backupStat.ino !== item.backupIdentity.ino) {
                            throw new Error('An export backup changed before rollback could restore it.');
                        }
                    }
                    const stat = fs.lstatSync(item.target);
                    if (stat.isSymbolicLink?.() || !stat.isFile()
                        || stat.dev !== item.writtenIdentity.dev || stat.ino !== item.writtenIdentity.ino) {
                        throw new Error('An exported file changed before rollback could restore it.');
                    }
                    fs.unlinkSync(item.target);
                    if (item.backup) fs.renameSync(item.backup, item.target);
                } catch (cleanupError) {
                    rollbackErrors.push(cleanupError);
                }
            }
            for (const item of backedUp.slice().reverse()) {
                if (committed.includes(item)) continue;
                try {
                    try {
                        fs.lstatSync(item.target);
                        throw new Error('An export target appeared before rollback could restore it.');
                    } catch (targetError) {
                        if (targetError?.code !== 'ENOENT') throw targetError;
                    }
                    const stat = fs.lstatSync(item.backup);
                    if (stat.dev !== item.backupIdentity.dev || stat.ino !== item.backupIdentity.ino) {
                        throw new Error('An export backup changed before rollback could restore it.');
                    }
                    fs.renameSync(item.backup, item.target);
                } catch (cleanupError) { rollbackErrors.push(cleanupError); }
            }
            for (const item of staged) {
                try {
                    const stat = fs.lstatSync(item.temp);
                    if (stat.dev !== item.tempIdentity.dev || stat.ino !== item.tempIdentity.ino) {
                        throw new Error('An export staging file changed before cleanup.');
                    }
                    fs.unlinkSync(item.temp);
                } catch (cleanupError) {
                    if (cleanupError?.code !== 'ENOENT') rollbackErrors.push(cleanupError);
                }
            }
            for (const directory of createdDirectories.reverse()) {
                try {
                    const stat = fs.lstatSync(directory.path);
                    if (stat.isSymbolicLink?.() || !stat.isDirectory()
                        || stat.dev !== directory.identity.dev || stat.ino !== directory.identity.ino) {
                        throw new Error('An export directory changed before cleanup.');
                    }
                    fs.rmdirSync(directory.path);
                } catch (cleanupError) {
                    if (cleanupError?.code !== 'ENOENT' && cleanupError?.code !== 'ENOTEMPTY') rollbackErrors.push(cleanupError);
                }
            }
            if (!rollbackErrors.length) throw error;
            throw new Error(`${error.message} Export rollback was incomplete: ${rollbackErrors.map(item => item.message).join('; ')}`);
        }
    }

    constructor(projectController, uiManager) {
        this.projectController = projectController;
        this.uiManager = uiManager;
        this.projectManager = projectController?.projectManager;
        this.fs = this.projectManager?.fs || (typeof require === 'function' ? require('fs') : null);
        this.path = this.projectManager?.path || (typeof require === 'function' ? require('path') : null);
        this.assetFiles = typeof RRAssetFiles !== 'undefined' ? RRAssetFiles : null;
        this.encryptedAssets = typeof RREncryptedAssets !== 'undefined' ? RREncryptedAssets : null;
        this.folders = ResourceManager.folderDefinitions(this.assetFiles?.AUDIO_EXTENSIONS);
        this.folder = this.folders[0];
        this.records = [];
        this.recordByDisplay = new Map();
        this.selected = null;
        this.selectedNames = new Set();
        this.selectionAnchor = null;
        this.browser = null;
        this.previousFocus = null;
        this.loadedFont = null;
        this.modelPreview = null;
        this.previewGeneration = 0;
        this.operationGeneration = 0;
        this.previewObjectUrls = new Set();
        this._handleKeyDown = event => this.handleKeyDown(event);
        this.build();
    }

    text(value) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.tText(value) : value;
    }

    project() {
        return this.projectController?.getCurrentProject?.() || this.projectController?.currentProject || null;
    }

    isWeb() {
        return typeof window !== 'undefined' && window.RPGReactorHost?.mode === 'web';
    }

    build() {
        const overlay = document.getElementById('resource-manager-modal');
        if (!overlay) return;
        this.overlay = overlay;
        overlay.className = 'rr-modal-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML = `
            <section class="rr-modal rr-resource-modal" role="dialog" aria-modal="true" aria-labelledby="rr-resource-title">
                <header class="rr-modal-header">
                    <h2 id="rr-resource-title" class="rr-modal-title" data-i18n="menu.resourceManager">Resource Manager</h2>
                    <button type="button" class="rr-modal-close rr-resource-close" aria-label="Close">&times;</button>
                </header>
                <div class="rr-resource-body">
                    <nav class="rr-resource-folders rr-accent-scrollbar" aria-label="Resource folders"></nav>
                    <div class="rr-resource-browser-host"></div>
                    <aside class="rr-resource-preview" aria-label="Preview">
                        <div class="rr-resource-preview-stage"></div>
                        <dl class="rr-resource-metadata"></dl>
                    </aside>
                </div>
                <div class="rr-resource-destination-row">
                    <label for="rr-resource-destination">Import destination:</label>
                    <select id="rr-resource-destination"></select>
                </div>
                <footer class="rr-modal-footer rr-resource-footer">
                    <div class="rr-resource-status" role="status" aria-live="polite"></div>
                    <div class="rr-resource-actions">
                        <button type="button" class="rr-btn-secondary rr-resource-refresh">Refresh</button>
                        <button type="button" class="rr-btn-secondary rr-resource-open">Open Folder</button>
                        <button type="button" class="rr-btn-secondary rr-resource-import">Import...</button>
                        <button type="button" class="rr-btn-secondary rr-resource-export">Export...</button>
                        <button type="button" class="rr-button-danger rr-resource-delete">Delete</button>
                        <button type="button" class="rr-button-primary rr-resource-done">Close</button>
                    </div>
                </footer>
            </section>`;
        this.folderNav = overlay.querySelector('.rr-resource-folders');
        this.browserHost = overlay.querySelector('.rr-resource-browser-host');
        this.previewStage = overlay.querySelector('.rr-resource-preview-stage');
        this.metadata = overlay.querySelector('.rr-resource-metadata');
        this.destination = overlay.querySelector('#rr-resource-destination');
        this.status = overlay.querySelector('.rr-resource-status');
        this.importButton = overlay.querySelector('.rr-resource-import');
        this.exportButton = overlay.querySelector('.rr-resource-export');
        this.deleteButton = overlay.querySelector('.rr-resource-delete');
        this.openButton = overlay.querySelector('.rr-resource-open');
        overlay.querySelector('.rr-resource-close').addEventListener('click', () => this.close());
        overlay.querySelector('.rr-resource-done').addEventListener('click', () => this.close());
        overlay.querySelector('.rr-resource-refresh').addEventListener('click', () => this.refresh());
        this.openButton.addEventListener('click', () => this.openFolder());
        this.importButton.addEventListener('click', () => this.importFiles());
        this.exportButton.addEventListener('click', () => this.exportSelected());
        this.deleteButton.addEventListener('click', () => this.deleteSelected());
        // A click on the backdrop no longer closes the dialog: close deliberately.
        this.renderFolders();
    }

    renderFolders() {
        if (!this.folderNav) return;
        this.folderNav.innerHTML = '';
        const folders = ResourceManager.sortedFolders(this.folders, folder => this.text(folder.label));
        for (const folder of folders) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'rr-resource-folder';
            button.dataset.folderId = folder.id;
            button.textContent = this.text(folder.label);
            button.addEventListener('click', () => this.selectFolder(folder.id));
            this.folderNav.appendChild(button);
        }
        this.updateFolderSelection();
    }

    updateFolderSelection() {
        this.folderNav?.querySelectorAll('.rr-resource-folder').forEach(button => {
            const active = button.dataset.folderId === this.folder.id;
            button.classList.toggle('active', active);
            button.setAttribute('aria-current', active ? 'true' : 'false');
        });
    }

    show() {
        const project = this.project();
        if (!project?.path || !this.projectController?.isProjectLoaded?.()) {
            this.uiManager?.showAlert?.(this.text('Resource Manager'), this.text('Please load a project first.'));
            return;
        }
        this.previousFocus = document.activeElement;
        this.overlay.style.display = 'flex';
        document.addEventListener('keydown', this._handleKeyDown, true);
        this.refresh();
        this.folderNav.querySelector('.rr-resource-folder.active')?.focus();
    }

    close() {
        this.operationGeneration++;
        if (!this.overlay || this.overlay.style.display === 'none') return;
        this.clearPreview();
        this.overlay.style.display = 'none';
        document.removeEventListener('keydown', this._handleKeyDown, true);
        if (this.previousFocus?.isConnected !== false && typeof this.previousFocus?.focus === 'function') {
            this.previousFocus.focus();
        }
        this.previousFocus = null;
    }

    onProjectChanged() {
        this.close();
        this.records = [];
        this.selected = null;
        this.selectedNames.clear();
    }

    handleKeyDown(event) {
        if (this.overlay?.style.display === 'none' || document.getElementById('rr-themed-dialog')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(this.overlay.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]'))
            .filter(element => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    selectFolder(id) {
        const folder = this.folders.find(item => item.id === id);
        if (!folder || folder === this.folder) return;
        this.folder = folder;
        this.selected = null;
        this.selectedNames.clear();
        this.selectionAnchor = null;
        this.updateFolderSelection();
        this.refresh();
    }

    refresh() {
        const project = this.project();
        if (!project?.path || !this.fs || !this.path || !this.assetFiles) return;
        this.clearPreview();
        this.records = ResourceManager.listRecords(this.fs, this.path, this.assetFiles, project.path, this.folder);
        this.recordByDisplay = new Map(this.records.map(record => [record.displayName, record]));
        this.renderBrowser();
        this.renderDestinations();
        this.selected = null;
        this.selectedNames.clear();
        this.selectionAnchor = null;
        this.showEmptyPreview();
        this.setStatus(`${this.records.length} file${this.records.length === 1 ? '' : 's'} in ${this.folder.path}. Ctrl/Cmd-click or Shift-click to select multiple for export.`);
        this.syncActions();
    }

    renderBrowser() {
        this.browserHost.innerHTML = '';
        this.browser = RRPickerIndex.createBrowser({
            files: this.records.map(record => record.displayName),
            folders: true,
            emptyText: this.text('No files found'),
            searchPlaceholder: this.text('Search files...'),
            itemClass: 'rr-resource-file',
            onSelect: (name, item, event) => this.selectRecord(name, event),
            onRender: () => queueMicrotask(() => this.syncSelectionStyles())
        });
        this.browser.element.classList.add('rr-accent-scrollbar');
        this.browserHost.appendChild(this.browser.element);
    }

    renderDestinations() {
        const project = this.project();
        const folders = ResourceManager.listSubfolders(this.fs, this.path, project.path, this.folder.path);
        this.destination.innerHTML = '';
        const root = document.createElement('option');
        root.value = '';
        root.textContent = '(Folder root)';
        this.destination.appendChild(root);
        for (const folder of folders) {
            const option = document.createElement('option');
            option.value = folder;
            option.textContent = folder;
            this.destination.appendChild(option);
        }
        this.destination.disabled = this.folder.readOnly || this.isWeb();
    }

    selectRecord(name, event = null) {
        const record = this.recordByDisplay.get(name) || null;
        if (!record) return;
        const toggle = Boolean(event?.ctrlKey || event?.metaKey);
        const range = Boolean(event?.shiftKey && this.selectionAnchor);
        if (range) {
            const names = this.records.map(item => item.displayName);
            const from = names.indexOf(this.selectionAnchor);
            const to = names.indexOf(name);
            if (!toggle) this.selectedNames.clear();
            if (from >= 0 && to >= 0) {
                for (let index = Math.min(from, to); index <= Math.max(from, to); index++) {
                    this.selectedNames.add(names[index]);
                }
            }
        } else if (toggle) {
            if (this.selectedNames.has(name)) this.selectedNames.delete(name);
            else this.selectedNames.add(name);
            this.selectionAnchor = name;
        } else {
            this.selectedNames.clear();
            this.selectedNames.add(name);
            this.selectionAnchor = name;
        }
        this.selected = this.selectedNames.has(name)
            ? record
            : this.recordByDisplay.get(Array.from(this.selectedNames).pop()) || null;
        this.syncSelectionStyles();
        this.showPreview(this.selected);
        if (this.selected) {
            const slash = this.selected.relativePath.lastIndexOf('/');
            const parent = slash >= 0 ? this.selected.relativePath.slice(0, slash) : '';
            if (Array.from(this.destination.options).some(option => option.value === parent)) this.destination.value = parent;
        }
        const count = this.selectedNames.size;
        this.setStatus(`${count} resource${count === 1 ? '' : 's'} selected.`);
        this.syncActions();
    }

    syncSelectionStyles() {
        this.browser?.list?.querySelectorAll('.rr-resource-file').forEach(item => {
            const selected = this.selectedNames.has(item.dataset.fileName);
            item.classList.toggle('rr-resource-selected', selected);
            item.setAttribute('aria-selected', String(selected));
        });
    }

    selectedRecords() {
        return this.records.filter(record => this.selectedNames.has(record.displayName));
    }

    showEmptyPreview() {
        this.previewStage.innerHTML = '<div class="rr-resource-empty">Select a resource to preview.</div>';
        this.metadata.innerHTML = '';
    }

    clearPreview() {
        this.previewGeneration++;
        this.modelPreview?.dispose();
        this.modelPreview = null;
        this.previewStage?.querySelectorAll('audio, video').forEach(media => {
            media.pause();
            media.removeAttribute('src');
            media.load();
        });
        if (this.loadedFont && document.fonts?.delete) document.fonts.delete(this.loadedFont);
        this.loadedFont = null;
        for (const url of this.previewObjectUrls) URL.revokeObjectURL?.(url);
        this.previewObjectUrls.clear();
        if (this.previewStage) this.previewStage.innerHTML = '';
    }

    previewUrl(record) {
        return Promise.resolve(this.encryptedAssets?.resolvePhysicalAssetUrlAsync(
            record.physicalAbsolutePath, record.extension, record.encrypted)
            || this.assetFiles.toUrl(record.physicalAbsolutePath)).then(url => {
            if (!url || url.startsWith('data:')) return url;
            if (url.startsWith('blob:')) {
                this.previewObjectUrls.add(url);
                return url;
            }
            const separator = url.includes('?') ? '&' : '?';
            return `${url}${separator}rrv=${encodeURIComponent(`${record.mtimeMs}-${record.size}`)}`;
        });
    }

    async showPreview(record) {
        this.clearPreview();
        if (!record) {
            this.showEmptyPreview();
            return;
        }
        const generation = this.previewGeneration;
        this.renderMetadata(record);
        if (this.folder.preview === 'none') {
            this.previewStage.innerHTML = '<div class="rr-resource-empty">Preview is not available for this resource type.</div>';
            return;
        }
        if (this.folder.preview === 'model') {
            const wrapper = document.createElement('div');
            wrapper.className = 'rr-resource-model-preview';
            const canvas = document.createElement('canvas');
            canvas.className = 'rr-resource-model-canvas';
            const loading = document.createElement('div');
            loading.className = 'rr-resource-model-message';
            loading.textContent = 'Loading model...';
            wrapper.append(canvas, loading);
            this.previewStage.appendChild(wrapper);
            try {
                const fileUrl = this.assetFiles.toUrl(record.physicalAbsolutePath);
                let baseUrl = new URL('.', fileUrl || document.baseURI).href;
                let texture = '';
                const sourceDirectory = this.path.dirname(record.physicalAbsolutePath);
                if (this.path.basename(sourceDirectory).toLowerCase() === 'source') {
                    const textureDirectory = this.path.join(this.path.dirname(sourceDirectory), 'textures');
                    const relativeTextures = this.path.relative(this.project().path, textureDirectory).replace(/\\/g, '/');
                    try {
                        ResourceManager.safeDirectory(this.fs, this.path, this.project().path, relativeTextures, false);
                        texture = typeof ModelGraphicPicker !== 'undefined'
                            ? ModelGraphicPicker.colorTextureIn(textureDirectory) : '';
                        if (texture) {
                            const texturePath = this.path.join(textureDirectory, texture);
                            const textureUrl = await this.encryptedAssets.resolvePhysicalAssetUrlAsync(
                                texturePath, this.path.extname(texturePath), false) || '';
                            if (generation !== this.previewGeneration) {
                                if (textureUrl.startsWith('blob:')) URL.revokeObjectURL?.(textureUrl);
                                return;
                            }
                            texture = textureUrl;
                            if (texture.startsWith('blob:')) this.previewObjectUrls.add(texture);
                            baseUrl = '';
                        }
                    } catch (error) {
                        texture = '';
                    }
                }
                this.modelPreview = new ModelPreview3D(canvas, {
                    ensureLibraries: () => this.projectController.mapEditor3D?.ensureLibraries?.(),
                    readBytes: filePath => this.encryptedAssets.readAssetBytesAsync(filePath),
                    onError: error => {
                        if (generation !== this.previewGeneration) return;
                        loading.textContent = error?.message || 'Preview could not be loaded.';
                        loading.classList.add('error');
                    }
                });
                const loaded = await this.modelPreview.load({
                    filePath: record.physicalAbsolutePath,
                    extension: record.sourceExtension || record.extension,
                    baseUrl,
                    texture
                });
                if (generation === this.previewGeneration && loaded) loading.remove();
            } catch (error) {
                if (generation === this.previewGeneration) {
                    loading.textContent = error?.message || 'Preview could not be loaded.';
                    loading.classList.add('error');
                }
            }
            return;
        }
        const url = await this.previewUrl(record);
        if (generation !== this.previewGeneration) {
            if (url?.startsWith('blob:')) {
                this.previewObjectUrls.delete(url);
                URL.revokeObjectURL?.(url);
            }
            return;
        }
        if (!url) return;
        if (this.folder.preview === 'image') {
            const image = document.createElement('img');
            image.alt = record.relativePath;
            image.addEventListener('load', () => {
                if (generation === this.previewGeneration) this.renderMetadata(record, `${image.naturalWidth} x ${image.naturalHeight}`);
            });
            image.addEventListener('error', () => { if (generation === this.previewGeneration) this.previewError(); });
            image.src = url;
            this.previewStage.appendChild(image);
        } else if (this.folder.preview === 'audio') {
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.preload = 'metadata';
            audio.src = url;
            audio.addEventListener('error', () => { if (generation === this.previewGeneration) this.previewError(); });
            this.previewStage.appendChild(audio);
        } else if (this.folder.preview === 'video') {
            const video = document.createElement('video');
            video.controls = true;
            video.preload = 'metadata';
            video.playsInline = true;
            video.src = url;
            video.addEventListener('loadedmetadata', () => {
                if (generation === this.previewGeneration) this.renderMetadata(record, `${video.videoWidth} x ${video.videoHeight}`);
            });
            video.addEventListener('error', () => { if (generation === this.previewGeneration) this.previewError(); });
            this.previewStage.appendChild(video);
        } else if (this.folder.preview === 'font') {
            try {
                const family = `RRResourcePreview${generation}`;
                const face = new FontFace(family, `url("${url}")`);
                await face.load();
                if (generation !== this.previewGeneration) return;
                document.fonts.add(face);
                this.loadedFont = face;
                const sample = document.createElement('div');
                sample.className = 'rr-resource-font-sample';
                sample.style.fontFamily = `"${family}"`;
                sample.textContent = 'The quick brown fox jumps over the lazy dog. 0123456789';
                this.previewStage.appendChild(sample);
            } catch (error) {
                if (generation === this.previewGeneration) this.previewError();
            }
        }
    }

    previewError() {
        this.previewStage.innerHTML = '<div class="rr-resource-empty">Preview could not be loaded.</div>';
    }

    renderMetadata(record, dimensions = '') {
        const rows = [
            ['Name', record.relativePath],
            ['Stored as', record.physicalRelativePath],
            ['Size', ResourceManager.formatBytes(record.size)],
            ['Type', record.encrypted ? `${record.extension} (encrypted)` : record.extension]
        ];
        if (dimensions) rows.push(['Dimensions', dimensions]);
        this.metadata.innerHTML = '';
        for (const [label, value] of rows) {
            const term = document.createElement('dt');
            term.textContent = label;
            const description = document.createElement('dd');
            description.textContent = value;
            this.metadata.append(term, description);
        }
    }

    static formatBytes(value) {
        const bytes = Math.max(0, Number(value) || 0);
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    syncActions() {
        const selectedCount = this.selectedNames.size;
        const desktop = !this.isWeb();
        const canImport = desktop && (!this.folder.readOnly || this.folder.allowImport);
        const canDelete = desktop && !this.folder.readOnly;
        this.importButton.disabled = !canImport;
        this.deleteButton.disabled = selectedCount !== 1 || !canDelete;
        this.exportButton.disabled = selectedCount === 0;
        this.openButton.disabled = this.isWeb();
        const reason = this.folder.readOnly
            ? this.folder.allowImport
                ? 'New 3D model folders can be imported, but existing 3D resources cannot be deleted.'
                : '3D resources are browse and export only in this version.'
            : this.isWeb() ? 'Import and delete require the desktop editor.' : '';
        this.importButton.title = canImport ? '' : reason;
        this.deleteButton.title = reason;
    }

    setStatus(message, error = false) {
        if (!this.status) return;
        this.status.textContent = message || '';
        this.status.classList.toggle('error', error);
    }

    openFolder() {
        if (this.isWeb() || typeof nw === 'undefined') return;
        const project = this.project();
        const folderPath = this.path.join(project.path, ...this.folder.path.split('/'));
        try {
            if (this.selected) nw.Shell.showItemInFolder(this.selected.physicalAbsolutePath);
            else nw.Shell.openItem(folderPath);
        } catch (error) {
            this.setStatus(error.message, true);
        }
    }

    readImportFile(filePath) {
        const pathStat = this.fs.lstatSync(filePath);
        if (pathStat.isSymbolicLink?.() || !pathStat.isFile()) {
            throw new Error('Only ordinary files can be imported.');
        }
        const constants = this.fs.constants || {};
        const flags = constants.O_RDONLY !== undefined
            ? constants.O_RDONLY | (constants.O_NOFOLLOW || 0)
            : 'r';
        const fd = this.fs.openSync(filePath, flags);
        try {
            const sameFile = stat => stat.isFile()
                && stat.dev === pathStat.dev && stat.ino === pathStat.ino
                && stat.size === pathStat.size && stat.mtimeMs === pathStat.mtimeMs
                && stat.ctimeMs === pathStat.ctimeMs;
            if (!sameFile(this.fs.fstatSync(fd))) {
                throw new Error('The selected import file changed before it could be read.');
            }
            const bytes = this.fs.readFileSync(fd);
            if (!sameFile(this.fs.fstatSync(fd))) {
                throw new Error('The selected import file changed while it was being read.');
            }
            return bytes;
        } finally {
            this.fs.closeSync(fd);
        }
    }

    importFiles() {
        if (this.importButton.disabled) return;
        const generation = ++this.operationGeneration;
        const folder = this.folder;
        const destination = this.destination.value;
        const ownership = this.projectController.captureProjectOwnership();
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = folder.id !== 'models';
        input.accept = folder.extensions.join(',');
        input.style.display = 'none';
        const cleanup = () => input.remove();
        input.addEventListener('cancel', cleanup);
        input.addEventListener('change', async () => {
            const files = Array.from(input.files || []);
            cleanup();
            if (!files.length || generation !== this.operationGeneration) return;
            if (folder.id === 'models') {
                const file = files[0];
                try {
                    const defaultName = file.name.slice(0, -this.path.extname(file.name).length);
                    const modelName = window.prompt(this.text('Model folder name:'), defaultName);
                    if (modelName === null) return;
                    this.projectController.verifyProjectOwnership(ownership, { requireWrite: true });
                    const bytes = this.readImportFile(file.path);
                    const map3d = this.projectController.mapEditor3D;
                    if (!await map3d?.ensureLibraries?.() || !window.Reactor3D) {
                        throw new Error(map3d?.lastError || 'The 3D model validator is unavailable.');
                    }
                    if (generation !== this.operationGeneration) return;
                    // GLBs get an optional shrink before they land in the
                    // project: textures capped at 2K, float skin weights
                    // packed to 16-bit, unused tangent streams dropped, and
                    // duplicate vertices welded. The user picks the level;
                    // validateModelBytes still gates whatever comes out.
                    let importBytes = bytes;
                    let shrunkNote = '';
                    if (/\.glb$/i.test(file.name) && window.RRGlbOptimizer &&
                        typeof this.uiManager?.showModelOptimizeDialog === 'function') {
                        const analysis = window.RRGlbOptimizer.analyze(bytes);
                        if (analysis) {
                            const mode = await this.uiManager.showModelOptimizeDialog({
                                fileName: file.name, analysis });
                            if (mode === null || generation !== this.operationGeneration) return;
                            if (mode !== 'keep') {
                                const optimized = await window.RRGlbOptimizer.optimize(bytes, Object.assign({
                                    encodeImage: window.RRGlbOptimizer.canvasEncoder()
                                }, window.RRGlbOptimizer.PRESETS[mode]));
                                if (generation !== this.operationGeneration) return;
                                if (optimized.bytes !== bytes) {
                                    importBytes = optimized.bytes;
                                    shrunkNote = ` (${(bytes.length / 1048576).toFixed(1)}MB → ` +
                                        `${(importBytes.length / 1048576).toFixed(1)}MB)`;
                                }
                            }
                        }
                    }
                    const result = ResourceManager.importModelFolder({
                        fs: this.fs,
                        path: this.path,
                        projectRoot: ownership.projectPath,
                        modelName,
                        sourceName: file.name,
                        sourceBytes: importBytes,
                        reactor3D: window.Reactor3D,
                        writeAtomic: window.RRWriteFileAtomicSync,
                        verifyOwnership: () => this.projectController.verifyProjectOwnership(
                            ownership, { requireWrite: true })
                    });
                    if (generation === this.operationGeneration) {
                        this.refresh();
                        this.setStatus(`Imported model ${result.modelName}${shrunkNote}.`);
                    }
                } catch (error) {
                    if (generation === this.operationGeneration) {
                        this.refresh();
                        this.setStatus(`${file.name}: ${error.message}`, true);
                    }
                }
                return;
            }
            let imported = 0;
            const errors = [];
            for (const file of files) {
                try {
                    this.projectController.verifyProjectOwnership(ownership, { requireWrite: true });
                    const bytes = this.readImportFile(file.path);
                    const options = {
                        fs: this.fs, path: this.path, assetFiles: this.assetFiles,
                        encryptedAssets: this.encryptedAssets, projectRoot: ownership.projectPath,
                        folder, sourceName: file.name, sourceBytes: bytes,
                        subfolder: destination,
                        project: this.project(),
                        system: this.projectController.databaseManager?.data?.system || {},
                        writeAtomic: window.RRWriteFileAtomicSync,
                        verifyOwnership: () => this.projectController.verifyProjectOwnership(ownership, { requireWrite: true })
                    };
                    let result = ResourceManager.importBytes(options);
                    if (result.collision) {
                        const names = result.existing.map(item => item.physicalRelativePath).join(', ');
                        const replace = await this.uiManager.showConfirm(
                            'Replace resource?',
                            `${file.name} has the same project name as ${names}. Replace the existing resource?`,
                            'Replace', 'Cancel');
                        if (!replace) continue;
                        if (generation !== this.operationGeneration) return;
                        this.projectController.verifyProjectOwnership(ownership, { requireWrite: true });
                        result = ResourceManager.importBytes({ ...options, replaceRecords: result.existing });
                        if (result.collision) throw new Error('The colliding resources changed; review them and retry the import.');
                    }
                    imported++;
                    if (result.cleanupErrors?.length) errors.push(...result.cleanupErrors);
                } catch (error) {
                    errors.push(`${file.name}: ${error.message}`);
                }
            }
            if (generation === this.operationGeneration) {
                this.refresh();
                this.setStatus(errors.length
                    ? `${imported} imported; ${errors.length} problem(s): ${errors.join(' | ')}`
                    : `${imported} resource${imported === 1 ? '' : 's'} imported.`, errors.length > 0);
            }
        });
        document.body.appendChild(input);
        input.click();
    }

    async exportSelected() {
        const records = this.selectedRecords();
        if (!records.length) return;
        const ownership = this.projectController.captureProjectOwnership();
        try {
            const paths = ResourceManager.exportRelativePaths(records, this.path);
            const files = [];
            for (let index = 0; index < records.length; index++) {
                const bytes = await this.encryptedAssets.readPhysicalAssetBytesAsync(
                    records[index].physicalAbsolutePath, records[index].encrypted, records[index]);
                this.projectController.verifyProjectOwnership(ownership);
                if (!bytes) throw new Error(`${records[index].relativePath} could not be read.`);
                files.push({ path: paths[index], data: bytes });
            }
            if (records.length > 1) {
                await this.exportMany(files, ownership);
                return;
            }
            const record = records[0];
            const bytes = files[0].data;
            const suggestedName = this.path.basename(record.relativePath);
            if (this.isWeb()) {
                const result = await window.RPGReactorHost.saveFile({
                    data: bytes,
                    suggestedName,
                    beforeWrite: () => this.projectController.verifyProjectOwnership(ownership)
                });
                if (result) this.setStatus(`Exported ${record.relativePath}.`);
                return;
            }
            const picker = document.createElement('input');
            picker.type = 'file';
            picker.style.display = 'none';
            picker.setAttribute('nwsaveas', suggestedName);
            picker.addEventListener('cancel', () => picker.remove());
            picker.addEventListener('change', () => {
                const output = picker.files?.[0]?.path;
                picker.remove();
                if (!output) return;
                try {
                    this.projectController.verifyProjectOwnership(ownership);
                    window.RRWriteFileAtomicSync(this.fs, output, Buffer.from(bytes));
                    this.setStatus(`Exported to ${output}.`);
                } catch (error) {
                    this.setStatus(error.message, true);
                }
            });
            document.body.appendChild(picker);
            picker.click();
        } catch (error) {
            this.setStatus(error.message, true);
        }
    }

    async exportMany(files, ownership) {
        if (this.isWeb()) {
            const result = await window.RPGReactorHost.saveFiles({
                files,
                suggestedDirectoryName: `${this.project().name || 'RPG Reactor'} Resources`,
                confirmOverwrite: paths => {
                    const examples = paths.slice(0, 3).join(', ');
                    const suffix = paths.length > 3 ? ` and ${paths.length - 3} more` : '';
                    return this.uiManager.showConfirm(
                        'Replace exported files?',
                        `${paths.length} destination file${paths.length === 1 ? '' : 's'} already exist: ${examples}${suffix}. Replace them?`,
                        'Replace', 'Cancel');
                },
                beforeWrite: () => this.projectController.verifyProjectOwnership(ownership)
            });
            if (result) this.setStatus(`Exported ${files.length} resources.`);
            return;
        }
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.style.display = 'none';
        picker.setAttribute('nwdirectory', '');
        picker.addEventListener('cancel', () => picker.remove());
        picker.addEventListener('change', async () => {
            const chosenRoot = picker.files?.[0]?.path;
            picker.remove();
            if (!chosenRoot) return;
            try {
                this.projectController.verifyProjectOwnership(ownership);
                const inspection = ResourceManager.inspectExportTargets(this.fs, this.path, chosenRoot, files);
                if (inspection.existing.length) {
                    const examples = inspection.existing.slice(0, 3).map(item => item.relativePath).join(', ');
                    const suffix = inspection.existing.length > 3 ? ` and ${inspection.existing.length - 3} more` : '';
                    const overwrite = await this.uiManager.showConfirm(
                        'Replace exported files?',
                        `${inspection.existing.length} destination file${inspection.existing.length === 1 ? '' : 's'} already exist: ${examples}${suffix}. Replace them?`,
                        'Replace', 'Cancel');
                    if (!overwrite) return;
                }
                this.projectController.verifyProjectOwnership(ownership);
                const cleanupErrors = ResourceManager.writeExportTargetsAtomic(
                    this.fs, this.path, inspection, window.RRWriteFileAtomicSync);
                this.setStatus(cleanupErrors.length
                    ? `Exported ${files.length} resources, but ${cleanupErrors.length} backup file(s) could not be removed.`
                    : `Exported ${files.length} resources to ${inspection.root}.`, cleanupErrors.length > 0);
            } catch (error) {
                this.setStatus(error.message, true);
            }
        });
        document.body.appendChild(picker);
        picker.click();
    }

    async deleteSelected() {
        const record = this.selected;
        if (!record || this.deleteButton.disabled) return;
        const ownership = this.projectController.captureProjectOwnership();
        const folder = this.folder;
        const confirmed = await this.uiManager.showConfirm(
            'Delete resource?',
            `${record.relativePath} will be removed permanently. References are not checked and may break.`,
            'Delete', 'Cancel');
        if (!confirmed) return;
        try {
            this.projectController.verifyProjectOwnership(ownership, { requireWrite: true });
            if (this.folder !== folder || !this.records.includes(record)) {
                throw new Error('The selected resource changed while deletion was being confirmed.');
            }
            ResourceManager.deleteRecord({
                fs: this.fs, path: this.path, projectRoot: ownership.projectPath,
                folder, record, encryptedAssets: this.encryptedAssets,
                verifyOwnership: () => this.projectController.verifyProjectOwnership(ownership, { requireWrite: true })
            });
            this.refresh();
            this.setStatus(`Deleted ${record.relativePath}.`);
        } catch (error) {
            this.setStatus(error.message, true);
        }
    }
}

if (typeof window !== 'undefined') window.ResourceManager = ResourceManager;
if (typeof module !== 'undefined' && module.exports) module.exports = ResourceManager;
