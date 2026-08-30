const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const AssetFiles = require(path.join(editorRoot, 'src', 'utils', 'AssetFiles.js'));
const EncryptedAssets = require(path.join(editorRoot, 'src', 'utils', 'EncryptedAssets.js'));
const writeAtomic = require(path.join(editorRoot, 'src', 'utils', 'FsAtomic.js'));
const ResourceManager = require(path.join(editorRoot, 'src', 'ResourceManager.js'));

const KEY_HEX = 'd41d8cd98f00b204e9800998ecf8427e';
const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');
const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9]);
const TINY_WEBP = Buffer.from('524946460400000057454250', 'hex');
const TINY_GIF = Buffer.from('GIF89a\u0001\u0000\u0001\u0000', 'binary');
const SAFE_SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>');
const TINY_OBJ = Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
const MODEL_READER = {
    readObj(buffer) {
        const text = Buffer.from(buffer).toString('utf8');
        if (!/^f\s/m.test(text)) throw new Error('OBJ has no faces');
        return { positions: new Float32Array(9), indices: [0, 1, 2] };
    }
};

function makeProject(system = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-resources-'));
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.mkdirSync(path.join(root, 'img', 'pictures'), { recursive: true });
    fs.writeFileSync(path.join(root, 'data', 'System.json'), JSON.stringify({
        gameTitle: 'Resource Fixture',
        hasEncryptedImages: false,
        hasEncryptedAudio: false,
        ...system
    }));
    return root;
}

function folder(id) {
    const match = ResourceManager.folderDefinitions(AssetFiles.AUDIO_EXTENSIONS)
        .find(item => item.id === id);
    assert.ok(match, `folder ${id} exists`);
    return match;
}

test('resource categories cover RPG Maker, Reactor, and read-only 3D roots', () => {
    const folders = ResourceManager.folderDefinitions(AssetFiles.AUDIO_EXTENSIONS);
    const paths = new Set(folders.map(item => item.path));
    for (const expected of [
        'img/animations', 'img/characters', 'img/system', 'audio/bgm',
        'audio/se', 'effects', 'movies', 'fonts', 'icon', '3d'
    ]) {
        assert.ok(paths.has(expected), expected);
    }
    const models = folders.find(item => item.path === '3d');
    assert.equal(models.readOnly, true);
    assert.equal(models.allowImport, true);
    assert.equal(models.preview, 'model');
    assert.deepEqual(folders.find(item => item.path === 'img/pictures').extensions,
        ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif']);
    const sorted = ResourceManager.sortedFolders(folders).map(item => item.label);
    assert.deepEqual(sorted, sorted.slice().sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })));
});

test('model import publishes one complete user-named folder atomically', () => {
    const root = makeProject();
    let ownershipChecks = 0;
    try {
        const result = ResourceManager.importModelFolder({
            fs, path, projectRoot: root,
            modelName: 'Vehicles/Roadster',
            sourceName: 'Body.OBJ',
            sourceBytes: TINY_OBJ,
            reactor3D: MODEL_READER,
            writeAtomic,
            verifyOwnership: () => ownershipChecks++
        });
        assert.equal(result.destination, path.join(root, '3d', 'Vehicles', 'Roadster'));
        assert.equal(result.mesh, path.join(result.destination, 'source', 'Body.OBJ'));
        assert.deepEqual(fs.readdirSync(result.destination).sort(), ['source', 'textures']);
        assert.deepEqual(fs.readFileSync(result.mesh), TINY_OBJ);
        assert.deepEqual(fs.readdirSync(path.join(result.destination, 'textures')), []);
        assert.equal(fs.readdirSync(path.dirname(result.destination))
            .some(name => name.startsWith('.rr-model-import-')), false);
        assert.equal(ownershipChecks, 2);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('model import validates names and never merges or replaces a model folder', () => {
    const root = makeProject();
    const options = {
        fs, path, projectRoot: root, sourceName: 'Body.obj', sourceBytes: TINY_OBJ,
        reactor3D: MODEL_READER, writeAtomic
    };
    try {
        for (const modelName of ['', '../outside', '/absolute', 'CON', 'Cars/source/Body',
            'Cars/textures/Body', 'Cars/.rr-model-import-bad']) {
            assert.throws(() => ResourceManager.importModelFolder({ ...options, modelName }),
                /required|safe|cannot contain|reserved/i, modelName);
        }
        assert.throws(() => ResourceManager.importModelFolder({
            ...options, modelName: 'Blend', sourceName: 'Body.blend'
        }), /export as GLB/i);
        assert.throws(() => ResourceManager.importModelFolder({
            ...options, modelName: 'Broken', sourceBytes: Buffer.from('v 0 0 0')
        }), /no faces/i);
        assert.equal(fs.existsSync(path.join(root, '3d', 'Broken')), false);

        const existing = path.join(root, '3d', 'Roadster');
        fs.mkdirSync(path.join(existing, 'source'), { recursive: true });
        fs.mkdirSync(path.join(existing, 'textures'));
        fs.writeFileSync(path.join(existing, 'source', 'old.obj'), 'old');
        fs.writeFileSync(path.join(existing, 'textures', 'keep.png'), 'keep');
        assert.throws(() => ResourceManager.importModelFolder({
            ...options, modelName: 'roadster'
        }), /already exists/i);
        assert.equal(fs.readFileSync(path.join(existing, 'source', 'old.obj'), 'utf8'), 'old');
        assert.equal(fs.readFileSync(path.join(existing, 'textures', 'keep.png'), 'utf8'), 'keep');
        assert.equal(fs.readdirSync(path.join(root, '3d'))
            .some(name => name.startsWith('.rr-model-import-')), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('model import preserves a concurrent destination winner at publish time', () => {
    const root = makeProject();
    const destination = path.join(root, '3d', 'Vehicles', 'Roadster');
    const competingFile = path.join(destination, 'winner.txt');
    let injected = false;
    const racingFs = Object.create(fs);
    racingFs.mkdirSync = (directory, options) => {
        if (directory === destination && !injected) {
            injected = true;
            fs.mkdirSync(destination);
            fs.writeFileSync(competingFile, 'keep');
        }
        return fs.mkdirSync(directory, options);
    };
    try {
        assert.throws(() => ResourceManager.importModelFolder({
            fs: racingFs,
            path,
            projectRoot: root,
            modelName: 'Vehicles/Roadster',
            sourceName: 'Body.obj',
            sourceBytes: TINY_OBJ,
            reactor3D: MODEL_READER,
            writeAtomic
        }), /already exists/i);
        assert.equal(injected, true);
        assert.equal(fs.readFileSync(competingFile, 'utf8'), 'keep');
        assert.equal(fs.readdirSync(path.dirname(destination))
            .some(name => name.startsWith('.rr-model-import-')), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('model import publishes through its owned reservation on Windows', () => {
    const root = makeProject();
    let publishAttempts = 0;
    const windowsFs = Object.create(fs);
    windowsFs.renameSync = (from, to) => {
        if (path.basename(from).startsWith('.rr-model-import-')) {
            publishAttempts++;
            if (publishAttempts === 1) {
                const error = new Error('destination exists');
                error.code = 'EEXIST';
                throw error;
            }
        }
        return fs.renameSync(from, to);
    };
    try {
        const result = ResourceManager.importModelFolder({
            fs: windowsFs,
            path,
            platform: 'win32',
            projectRoot: root,
            modelName: 'Vehicles/Roadster',
            sourceName: 'Body.obj',
            sourceBytes: TINY_OBJ,
            reactor3D: MODEL_READER,
            writeAtomic
        });
        assert.equal(publishAttempts, 2);
        assert.deepEqual(fs.readFileSync(result.mesh), TINY_OBJ);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('model import rolls back staging and newly created parents on write or commit failure', () => {
    for (const failAt of ['write', 'commit']) {
        const root = makeProject();
        try {
            const failingFs = Object.create(fs);
            if (failAt === 'commit') {
                failingFs.renameSync = (from, to) => {
                    if (path.basename(from).startsWith('.rr-model-import-')
                        && path.basename(to) === 'Roadster') throw new Error('commit failed');
                    return fs.renameSync(from, to);
                };
            }
            assert.throws(() => ResourceManager.importModelFolder({
                fs: failingFs,
                path,
                projectRoot: root,
                modelName: 'Vehicles/Roadster',
                sourceName: 'Body.obj',
                sourceBytes: TINY_OBJ,
                reactor3D: MODEL_READER,
                writeAtomic: failAt === 'write' ? () => { throw new Error('disk full'); } : writeAtomic
            }), failAt === 'write' ? /disk full/ : /commit failed/);
            assert.equal(fs.existsSync(path.join(root, '3d', 'Vehicles', 'Roadster')), false);
            assert.equal(fs.existsSync(path.join(root, '3d')), false,
                'new empty category and organization folders are removed');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    }
});

test('image imports validate modern formats and keep same-stem references distinct', () => {
    const root = makeProject();
    const pictures = folder('pictures');
    try {
        const base = {
            fs, path, assetFiles: AssetFiles, encryptedAssets: EncryptedAssets,
            projectRoot: root, folder: pictures, subfolder: '', system: {}, writeAtomic
        };
        for (const [sourceName, sourceBytes] of [
            ['Poster.png', TINY_PNG], ['Poster.jpg', TINY_JPEG], ['Card.jpeg', TINY_JPEG],
            ['Panel.webp', TINY_WEBP], ['Badge.svg', SAFE_SVG], ['Spark.gif', TINY_GIF]
        ]) {
            const result = ResourceManager.importBytes({ ...base, sourceName, sourceBytes });
            assert.equal(result.collision, false, sourceName);
        }
        const records = ResourceManager.listRecords(fs, path, AssetFiles, root, pictures);
        assert.deepEqual(records.map(record => record.logicalKey),
            ['Badge.svg', 'Card.jpeg', 'Panel.webp', 'Poster', 'Poster.jpg', 'Spark.gif']);
        assert.throws(() => ResourceManager.importBytes({
            ...base, sourceName: 'Wrong.webp', sourceBytes: TINY_PNG
        }), /not a valid WEBP/);
        for (const svg of [
            '<svg><script>alert(1)</script></svg>',
            '<svg onload="alert(1)"></svg>',
            '<svg><image href="https://example.com/a.png"/></svg>',
            '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
            '<svg><foreignObject><div>unsafe</div></foreignObject></svg>'
            , '<svg><x:script>alert(1)</x:script></svg>'
            , '<svg><style>.x{fill:u\\72l(https://example.com/x)}</style></svg>'
            , '<svg><set attributeName="href" to="javascript:alert(1)"/></svg>'
        ]) {
            assert.throws(() => ResourceManager.importBytes({
                ...base, sourceName: 'Unsafe.svg', sourceBytes: Buffer.from(svg)
            }), /unsafe|unsupported/i, svg);
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('resource paths reject traversal, absolute paths, reserved names, and unsafe segments', () => {
    assert.equal(ResourceManager.validateRelativePath('portraits/heroes'), 'portraits/heroes');
    assert.equal(ResourceManager.validateRelativePath('', { allowEmpty: true }), '');
    for (const unsafe of [
        '', '.', '..', '../outside', 'nested/../outside', '/absolute',
        'C:\\outside', 'folder//file', 'folder/trailing.', 'folder/CON', 'bad\0name',
        'portrait:night.png', 'bad<name.png', 'bad>name.png', 'bad"name.png',
        'bad|name.png', 'bad?name.png', 'bad*name.png'
    ]) {
        assert.throws(() => ResourceManager.validateRelativePath(unsafe), /path|required|safe/i, unsafe);
    }
});

test('the catalog preserves nested physical identities and encrypted aliases', () => {
    const root = makeProject({
        hasEncryptedImages: true,
        encryptionKey: KEY_HEX
    });
    try {
        fs.mkdirSync(path.join(root, 'img', 'pictures', 'portraits'));
        fs.writeFileSync(path.join(root, 'img', 'pictures', 'Plain.png'), TINY_PNG);
        fs.writeFileSync(
            path.join(root, 'img', 'pictures', 'portraits', 'Cipher.png_'),
            Buffer.from(EncryptedAssets.encryptAssetBytes(TINY_PNG, Buffer.from(KEY_HEX, 'hex'))));

        const records = ResourceManager.listRecords(
            fs, path, AssetFiles, root, folder('pictures'));
        assert.deepEqual(records.map(record => record.relativePath), [
            'Plain.png', 'portraits/Cipher.png'
        ]);
        const encrypted = records.find(record => record.encrypted);
        assert.equal(encrypted.physicalRelativePath, 'portraits/Cipher.png_');
        assert.equal(encrypted.displayName, 'portraits/Cipher.png [encrypted]');
        assert.equal(encrypted.logicalKey, 'portraits/Cipher');

        const webStyleFs = { statSync: fs.statSync, realpathSync: fs.realpathSync };
        assert.equal(ResourceManager.listRecords(
            webStyleFs, path, AssetFiles, root, folder('pictures')).length, 2,
        'read-only browser hosts do not need lstatSync');

        assert.deepEqual(ResourceManager.exportRelativePaths([
            { relativePath: 'Same.png', sourceExtension: '.png' },
            { relativePath: 'Same.png', sourceExtension: '.png_' }
        ], path), ['Same-png.png', 'Same-png_.png']);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('plain imports are atomic, nested, collision-aware, and replace only on approval', () => {
    const root = makeProject();
    const pictures = folder('pictures');
    let ownershipChecks = 0;
    try {
        const options = {
            fs, path, assetFiles: AssetFiles, encryptedAssets: EncryptedAssets,
            projectRoot: root, folder: pictures, sourceName: 'Hero.PNG',
            sourceBytes: TINY_PNG, subfolder: 'portraits', system: {}, writeAtomic,
            verifyOwnership: () => ownershipChecks++
        };
        const imported = ResourceManager.importBytes(options);
        const destination = path.join(root, 'img', 'pictures', 'portraits', 'Hero.png');
        assert.equal(imported.destination, destination);
        assert.deepEqual(fs.readFileSync(destination), TINY_PNG);
        assert.equal(ownershipChecks, 2, 'ownership is checked before directory creation and before writing');

        const collision = ResourceManager.importBytes({ ...options, sourceBytes: Buffer.concat([TINY_PNG, Buffer.from('new')]) });
        assert.equal(collision.collision, true);
        assert.deepEqual(fs.readFileSync(destination), TINY_PNG, 'unapproved collision leaves the file untouched');

        const replacement = Buffer.from(TINY_PNG);
        replacement[replacement.length - 1] ^= 1;
        const surprise = path.join(root, 'img', 'pictures', 'portraits', 'Hero.rpgmvp');
        fs.writeFileSync(surprise, Buffer.alloc(48));
        const staleApproval = ResourceManager.importBytes({
            ...options, sourceBytes: replacement, replaceRecords: collision.existing
        });
        assert.equal(staleApproval.collision, true, 'a newly appeared alias needs fresh approval');
        assert.deepEqual(fs.readFileSync(destination), TINY_PNG);
        assert.equal(fs.existsSync(surprise), true);
        fs.unlinkSync(surprise);
        ResourceManager.importBytes({ ...options, sourceBytes: replacement, replaceRecords: collision.existing });
        assert.deepEqual(fs.readFileSync(destination), replacement);
        assert.equal(ownershipChecks, 4);

        const rollbackPath = path.join(root, 'img', 'pictures', 'portraits', 'Rollback.png');
        fs.writeFileSync(rollbackPath, TINY_PNG);
        const rollbackCollision = ResourceManager.importBytes({
            ...options, sourceName: 'Rollback.png', sourceBytes: replacement
        });
        assert.equal(rollbackCollision.collision, true);
        assert.throws(() => ResourceManager.importBytes({
            ...options,
            sourceName: 'Rollback.png',
            sourceBytes: replacement,
            replaceRecords: rollbackCollision.existing,
            writeAtomic: () => { throw new Error('disk full'); }
        }), /disk full/);
        assert.deepEqual(fs.readFileSync(rollbackPath), TINY_PNG, 'a failed replacement restores its approved alias');
        assert.equal(fs.readdirSync(path.dirname(rollbackPath)).some(name => name.startsWith('.rr-import-')), false);

        const sounds = folder('se');
        for (const sourceName of ['Chime.ogg', 'Chime.mp3']) {
            const result = ResourceManager.importBytes({
                ...options, folder: sounds, sourceName,
                sourceBytes: Buffer.from(sourceName), subfolder: ''
            });
            assert.equal(result.collision, false, 'alternate runtime formats may coexist');
        }
        assert.equal(fs.existsSync(path.join(root, 'audio', 'se', 'Chime.ogg')), true);
        assert.equal(fs.existsSync(path.join(root, 'audio', 'se', 'Chime.mp3')), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('encrypted projects import encrypted bytes and expose decrypted export bytes', async () => {
    const root = makeProject({
        hasEncryptedImages: true,
        encryptionKey: KEY_HEX
    });
    try {
        const result = ResourceManager.importBytes({
            fs, path, assetFiles: AssetFiles, encryptedAssets: EncryptedAssets,
            projectRoot: root, folder: folder('pictures'), sourceName: 'Secret.png',
            sourceBytes: TINY_PNG, subfolder: '',
            system: { hasEncryptedImages: true }, writeAtomic
        });
        assert.match(result.destination, /Secret\.png_$/);
        const stored = fs.readFileSync(result.destination);
        assert.equal(stored.subarray(0, 6).toString('ascii'), 'RPGMV\0');
        assert.notDeepEqual(stored.subarray(16), TINY_PNG);
        const exported = await EncryptedAssets.readAssetBytesAsync(
            path.join(root, 'img', 'pictures', 'Secret.png'));
        assert.deepEqual(Buffer.from(exported), TINY_PNG);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Reactor encrypted projects preserve alternate image extensions while MV rejects them', async () => {
    const root = makeProject({ hasEncryptedImages: true, encryptionKey: KEY_HEX });
    const base = {
        fs, path, assetFiles: AssetFiles, encryptedAssets: EncryptedAssets,
        projectRoot: root, folder: folder('pictures'), sourceName: 'Poster.webp',
        sourceBytes: TINY_WEBP, subfolder: '', system: { hasEncryptedImages: true }, writeAtomic
    };
    try {
        const result = ResourceManager.importBytes(base);
        assert.match(result.destination, /Poster\.webp_$/);
        assert.deepEqual(Buffer.from(await EncryptedAssets.readAssetBytesAsync(
            path.join(root, 'img', 'pictures', 'Poster.webp'))), TINY_WEBP);
        fs.writeFileSync(path.join(root, 'Game.rpgproject'), 'RPGMV 1.6.2');
        assert.throws(() => ResourceManager.importBytes({
            ...base, sourceName: 'Legacy.webp', project: { importedFrom: 'RPG Maker MV' }
        }), /MV encryption supports PNG/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('MV encrypted imports use runtime-compatible physical extensions', () => {
    const root = makeProject({ hasEncryptedImages: true, encryptionKey: KEY_HEX });
    try {
        fs.writeFileSync(path.join(root, 'Game.rpgproject'), 'RPGMV 1.6.2');
        const result = ResourceManager.importBytes({
            fs, path, assetFiles: AssetFiles, encryptedAssets: EncryptedAssets,
            projectRoot: root, folder: folder('pictures'), sourceName: 'Legacy.png',
            sourceBytes: TINY_PNG, subfolder: '', project: { importedFrom: 'RPG Maker MV' },
            system: { hasEncryptedImages: true }, writeAtomic
        });
        assert.match(result.destination, /Legacy\.rpgmvp$/);
        assert.equal(fs.existsSync(path.join(root, 'img', 'pictures', 'Legacy.png_')), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('physical reads keep coexisting plain and encrypted aliases distinct', async () => {
    const root = makeProject({ hasEncryptedImages: true, encryptionKey: KEY_HEX });
    const plain = Buffer.from(TINY_PNG);
    const secret = Buffer.from(TINY_PNG);
    secret[secret.length - 1] ^= 1;
    try {
        const logicalPath = path.join(root, 'img', 'pictures', 'Twin.png');
        const encryptedPath = `${logicalPath}_`;
        fs.writeFileSync(logicalPath, plain);
        fs.writeFileSync(encryptedPath,
            Buffer.from(EncryptedAssets.encryptAssetBytes(secret, Buffer.from(KEY_HEX, 'hex'))));
        const records = ResourceManager.listRecords(fs, path, AssetFiles, root, folder('pictures'));
        assert.equal(records.length, 2);
        const outputs = await Promise.all(records.map(record =>
            EncryptedAssets.readPhysicalAssetBytesAsync(record.physicalAbsolutePath, record.encrypted)));
        const plainRecord = records.findIndex(record => !record.encrypted);
        const encryptedRecord = records.findIndex(record => record.encrypted);
        assert.deepEqual(Buffer.from(outputs[plainRecord]), plain);
        assert.deepEqual(Buffer.from(outputs[encryptedRecord]), secret);

        fs.writeFileSync(logicalPath, Buffer.concat([plain, Buffer.from('changed')]));
        assert.equal(await EncryptedAssets.readPhysicalAssetBytesAsync(
            logicalPath, false, records[plainRecord]), null);

        const outside = path.join(root, 'outside.png');
        fs.writeFileSync(outside, Buffer.from('outside'));
        fs.unlinkSync(logicalPath);
        fs.symlinkSync(outside, logicalPath);
        assert.equal(await EncryptedAssets.readPhysicalAssetBytesAsync(logicalPath, false), null);
        assert.equal(await EncryptedAssets.resolvePhysicalAssetUrlAsync(logicalPath, '.png', false), null);

        let fstatCalls = 0;
        const racingFs = Object.create(fs);
        racingFs.fstatSync = fd => {
            const stat = fs.fstatSync(fd);
            fstatCalls++;
            if (fstatCalls < 2) return stat;
            return new Proxy(stat, {
                get(target, property) {
                    if (property === 'ctimeMs') return target.ctimeMs + 1;
                    const value = Reflect.get(target, property, target);
                    return typeof value === 'function' ? value.bind(target) : value;
                }
            });
        };
        EncryptedAssets.useFileSystem(racingFs, path);
        assert.equal(await EncryptedAssets.readPhysicalAssetBytesAsync(
            encryptedPath, true, records[encryptedRecord]), null,
        'a physical file identity change during the read is rejected');
    } finally {
        EncryptedAssets.useFileSystem(fs, path);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('batch export preflights collisions and rolls back a failed commit', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-resource-export-'));
    try {
        fs.mkdirSync(path.join(root, 'nested'));
        fs.writeFileSync(path.join(root, 'nested', 'keep.txt'), 'original');
        const files = [
            { path: 'nested/keep.txt', data: Buffer.from('replacement') },
            { path: 'new.txt', data: Buffer.from('new') }
        ];
        const inspection = ResourceManager.inspectExportTargets(fs, path, root, files);
        assert.deepEqual(inspection.existing.map(item => item.relativePath), ['nested/keep.txt']);

        let targetRenames = 0;
        const failingFs = Object.create(fs);
        failingFs.renameSync = (from, to) => {
            if (/\.tmp$/.test(from)) {
                targetRenames++;
                if (targetRenames === 2) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
            }
            return fs.renameSync(from, to);
        };
        assert.throws(() => ResourceManager.writeExportTargetsAtomic(
            failingFs, path, inspection, writeAtomic), /disk full/);
        assert.equal(fs.readFileSync(path.join(root, 'nested', 'keep.txt'), 'utf8'), 'original');
        assert.equal(fs.existsSync(path.join(root, 'new.txt')), false);
        assert.equal(fs.readdirSync(root).some(name => name.startsWith('.rr-export-')), false);
        assert.equal(fs.readdirSync(path.join(root, 'nested')).some(name => name.startsWith('.rr-export-')), false);

        const staleInspection = ResourceManager.inspectExportTargets(fs, path, root, files);
        const approvedRoot = `${root}-approved`;
        fs.renameSync(root, approvedRoot);
        fs.mkdirSync(root);
        try {
            assert.throws(() => ResourceManager.writeExportTargetsAtomic(
                fs, path, staleInspection, writeAtomic), /export destination changed/i);
            assert.deepEqual(fs.readdirSync(root), []);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.renameSync(approvedRoot, root);
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('encrypted import fails closed when no valid key can be recovered', () => {
    const root = makeProject({ hasEncryptedImages: true, encryptionKey: 'not-a-key' });
    try {
        const corrupt = Buffer.from(EncryptedAssets.encryptAssetBytes(TINY_PNG, Buffer.from(KEY_HEX, 'hex')));
        corrupt[45] ^= 0xff;
        fs.writeFileSync(path.join(root, 'img', 'pictures', 'Corrupt.png_'), corrupt);
        assert.throws(() => ResourceManager.importBytes({
            fs, path, assetFiles: AssetFiles, encryptedAssets: EncryptedAssets,
            projectRoot: root, folder: folder('pictures'), sourceName: 'Secret.png',
            sourceBytes: TINY_PNG, subfolder: '',
            system: { hasEncryptedImages: true }, writeAtomic
        }), /key is missing or malformed/i);
        assert.equal(fs.existsSync(path.join(root, 'img', 'pictures', 'Secret.png')), false);
        assert.equal(fs.existsSync(path.join(root, 'img', 'pictures', 'Secret.png_')), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('delete rejects read-only categories and symlink escapes', () => {
    const root = makeProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-resource-outside-'));
    const pictures = folder('pictures');
    try {
        const ordinary = path.join(root, 'img', 'pictures', 'Delete.png');
        fs.writeFileSync(ordinary, TINY_PNG);
        const ordinaryRecord = ResourceManager.listRecords(fs, path, AssetFiles, root, pictures)
            .find(record => record.physicalAbsolutePath === ordinary);
        ResourceManager.deleteRecord({
            fs, path, projectRoot: root, folder: pictures,
            record: ordinaryRecord,
            encryptedAssets: EncryptedAssets
        });
        assert.equal(fs.existsSync(ordinary), false);

        const changed = path.join(root, 'img', 'pictures', 'Changed.png');
        fs.writeFileSync(changed, TINY_PNG);
        const changedRecord = ResourceManager.listRecords(fs, path, AssetFiles, root, pictures)
            .find(record => record.physicalAbsolutePath === changed);
        fs.writeFileSync(changed, Buffer.concat([TINY_PNG, Buffer.from('changed')]));
        assert.throws(() => ResourceManager.deleteRecord({
            fs, path, projectRoot: root, folder: pictures, record: changedRecord
        }), /selected resource changed/i);
        assert.equal(fs.existsSync(changed), true);

        const outsideFile = path.join(outside, 'keep.png');
        fs.writeFileSync(outsideFile, TINY_PNG);
        fs.symlinkSync(outside, path.join(root, 'img', 'pictures', 'escape'));
        assert.throws(() => ResourceManager.deleteRecord({
            fs, path, projectRoot: root, folder: pictures,
            record: {
                physicalAbsolutePath: path.join(root, 'img', 'pictures', 'escape', 'keep.png'),
                physicalRelativePath: 'escape/keep.png'
            }
        }), /ordinary project directories/i);
        assert.equal(fs.existsSync(outsideFile), true);

        assert.throws(() => ResourceManager.deleteRecord({
            fs, path, projectRoot: root, folder: folder('models'),
            record: { physicalAbsolutePath: outsideFile, physicalRelativePath: 'keep.glb' }
        }), /browse and export only/i);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
    }
});

test('the application shell loads and dispatches the Resource Manager', () => {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    const main = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');
    const ui = fs.readFileSync(path.join(editorRoot, 'src', 'UIManager.js'), 'utf8');
    const css = fs.readFileSync(path.join(editorRoot, 'css', 'theme.css'), 'utf8');
    const preview = fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'ModelPreview3D.js'), 'utf8');
    const resources = fs.readFileSync(path.join(editorRoot, 'src', 'ResourceManager.js'), 'utf8');
    const webHost = fs.readFileSync(path.join(editorRoot, 'src', 'web', 'WebHost.js'), 'utf8');
    assert.match(html, /data-action="resource-manager"[^>]+data-i18n="menu\.resourceManager"/);
    assert.match(html, /id="resource-manager-modal"/);
    assert.match(html, /id="toolbar-resource-manager-btn"[^>]+data-action="resource-manager"/);
    assert.match(html, /images\/icon-resource-manager\.svg/);
    assert.equal(fs.existsSync(path.join(editorRoot, 'images', 'icon-resource-manager.svg')), true);
    assert.ok(html.indexOf('src/MapEditor3D.js') < html.indexOf('src/utils/ModelPreview3D.js'));
    assert.ok(html.indexOf('src/utils/ModelPreview3D.js') < html.indexOf('src/ResourceManager.js'));
    assert.ok(html.indexOf('src/ResourceManager.js') < html.indexOf('src/main.js'));
    assert.match(main, /new ResourceManager\(this\.projectController, this\.uiManager\)/);
    assert.match(main, /showResourceManager: \(\) => this\.resourceManager\?\.show\(\)/);
    assert.match(ui, /case 'resource-manager':/);
    assert.match(preview, /Reactor3D\.readModelAsync/);
    assert.match(preview, /Resource previews never let model metadata fetch local or remote sidecars/);
    assert.match(preview, /Reactor3D\.cloneModelTemplate/);
    assert.match(preview, /Reactor3D\.aimCamera/);
    const deletion = resources.slice(resources.indexOf('async deleteSelected()'));
    assert.ok(deletion.indexOf('captureProjectOwnership()') < deletion.indexOf('await this.uiManager.showConfirm('),
        'delete ownership is captured before confirmation');
    assert.match(webHost, /function safeRelativePath\(value\)/);
    assert.match(webHost, /An export target changed before it could be written/);
    assert.match(webHost, /for \(const item of written\.reverse\(\)\)/);
    assert.match(webHost, /window\.confirm\(tt\('\{count\} destination file\(s\) already exist/);
    assert.match(css, /\.rr-resource-body[\s\S]*grid-template-columns/);
    assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.rr-resource-preview/);

    const manager = Object.create(ResourceManager.prototype);
    manager.records = ['Alpha', 'Beta', 'Gamma'].map(displayName => ({
        displayName, relativePath: `${displayName}.png`
    }));
    manager.recordByDisplay = new Map(manager.records.map(record => [record.displayName, record]));
    manager.selectedNames = new Set();
    manager.selectionAnchor = null;
    manager.browser = null;
    manager.destination = { options: [], value: '' };
    manager.showPreview = () => {};
    manager.setStatus = () => {};
    manager.syncActions = () => {};
    manager.selectRecord('Alpha');
    manager.selectRecord('Gamma', { ctrlKey: true });
    assert.deepEqual(Array.from(manager.selectedNames), ['Alpha', 'Gamma']);
    manager.selectRecord('Beta', { shiftKey: true });
    assert.deepEqual(Array.from(manager.selectedNames), ['Beta', 'Gamma']);
});
