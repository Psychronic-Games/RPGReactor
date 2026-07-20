// RPG Reactor - Project Manager
// Handles project creation, loading, and saving

class ProjectManager {
    // Atomic write for project data: write a temp sibling then rename over
    // the destination, so a crash/kill/full-disk mid-write can never destroy
    // the previous good file. Falls back to a plain write when the fs
    // implementation has no renameSync (test mocks, web host shims).
    _writeFileAtomic(fs, filePath, data, options) {
        const atomic = (typeof window !== 'undefined' && window.RRWriteFileAtomicSync) || null;
        if (atomic && fs && typeof fs.renameSync === 'function') {
            atomic(fs, filePath, data, options);
        } else {
            fs.writeFileSync(filePath, data, options);
        }
    }

    constructor() {
        this.fs = null;
        this.path = null;
        this.lastLoadError = null;
        this.lastCreateError = null;

        const host = typeof window !== 'undefined' ? window.RPGReactorHost : null;
        if (host?.fs && host?.path) {
            this.fs = host.fs;
            this.path = host.path;
        }

        // Initialize Node.js modules if running in NW.js
        if (!this.fs && typeof nw !== 'undefined') {
            this.fs = require('fs');
            this.path = require('path');
        }
    }

    async _readJsonWithRetry(filePath, attempts = 3) {
        let lastError = null;
        for (let attempt = 0; attempt < attempts; attempt++) {
            try {
                const content = this.fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
                return JSON.parse(content);
            } catch (error) {
                lastError = error;
                if (attempt + 1 < attempts && typeof setTimeout === 'function') {
                    await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
                }
            }
        }

        const error = new Error(`Could not read ${this.path.basename(filePath)}: ${lastError?.message || lastError}`);
        error.code = lastError?.code;
        error.filePath = filePath;
        throw error;
    }

    getEngineVersion() {
        if (typeof window !== 'undefined' && window.RPGReactorHost?.version) {
            return window.RPGReactorHost.version;
        }
        if (!this.fs || !this.path || typeof process === 'undefined') {
            return '0.0.0';
        }

        try {
            const packagePath = this.path.join(process.cwd(), 'package.json');
            const packageData = JSON.parse(this.fs.readFileSync(packagePath, 'utf8'));
            return packageData.version || '0.0.0';
        } catch (error) {
            console.warn('Could not read RPG Reactor version from package.json:', error);
            return '0.0.0';
        }
    }

    async createNewProject(targetPath, projectName) {
        this.lastCreateError = null;
        if (!this.fs || !this.path) {
            console.error('File system not available');
            this.lastCreateError = 'File system not available';
            return false;
        }

        try {
            if (!this.isSafeProjectName(projectName)) {
                throw new Error('Project name must be a safe single folder name.');
            }
            const resolvedTarget = this.path.resolve(targetPath);

            console.log(`Creating new project: ${projectName} at ${targetPath}`);

            const engineVersion = this.getEngineVersion();
            const templatePath = this.getTemplateProjectPath();
            const runtimePath = this.getRuntimePath();

            if (this.fs.existsSync(resolvedTarget)) {
                const stat = this.fs.lstatSync ? this.fs.lstatSync(resolvedTarget) : this.fs.statSync(resolvedTarget);
                if (!stat.isDirectory() || stat.isSymbolicLink?.()) {
                    throw new Error('Project target must be an ordinary directory.');
                }
                if (this.fs.readdirSync(resolvedTarget).length > 0) {
                    throw new Error('Project target already exists and is not empty.');
                }
            } else {
                this.fs.mkdirSync(resolvedTarget);
            }
            targetPath = resolvedTarget;

            if (templatePath) {
                await this.copyDirectory(templatePath, targetPath);
                if (runtimePath) {
                    await this.copyRuntimeIntoProject(runtimePath, this.path.join(targetPath, 'js'), true);
                }
                this.updateCopiedTemplateProject(targetPath, projectName, engineVersion);
            } else {
                if (!runtimePath) {
                    console.error('Runtime corescript directory not found. Expected runtime/ beside the editor source.');
                    console.error('Current working directory:', process.cwd());
                    return false;
                }

                await this.createStarterProject(targetPath, projectName, engineVersion, runtimePath);
                this.writeProjectMetadata(targetPath, projectName, engineVersion);
            }

            console.log('Project created successfully!');
            return true;
        } catch (error) {
            console.error('Error creating project:', error);
            this.lastCreateError = error.message || String(error);
            return false;
        }
    }

    isSafeProjectName(projectName) {
        if (typeof projectName !== 'string' || !projectName || projectName !== projectName.trim()) return false;
        if (projectName === '.' || projectName === '..' || /[\\/\0-\x1f]/.test(projectName)) return false;
        if (/[. ]$/.test(projectName)) return false;
        return !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(projectName);
    }

    async copyDirectory(source, target) {
        if (!this.fs || !this.path) return;

        // Create target directory
        if (!this.fs.existsSync(target)) {
            this.fs.mkdirSync(target, { recursive: true });
        }

        // Read source directory
        const files = this.fs.readdirSync(source);

        for (const file of files) {
            const sourcePath = this.path.join(source, file);
            const targetPath = this.path.join(target, file);
            const stat = this.fs.statSync(sourcePath);

            if (stat.isDirectory()) {
                // Recursively copy subdirectories
                await this.copyDirectory(sourcePath, targetPath);
            } else {
                // Copy file
                this.fs.copyFileSync(sourcePath, targetPath);
            }
        }
    }

    async copyRuntimeIntoProject(runtimePath, jsPath, preservePluginConfig = false) {
        if (!this.fs.existsSync(jsPath)) this.fs.mkdirSync(jsPath, { recursive: true });
        for (const entry of this.fs.readdirSync(runtimePath, { withFileTypes: true })) {
            if (preservePluginConfig && entry.name === 'reactor_plugins.js') continue;
            const sourcePath = this.path.join(runtimePath, entry.name);
            const targetPath = this.path.join(jsPath, entry.name);
            if (entry.isDirectory()) {
                await this.copyDirectory(sourcePath, targetPath);
            } else {
                this.fs.copyFileSync(sourcePath, targetPath);
            }
        }
    }

    writeZipArchive(zipPath, entries) {
        const zlib = require('zlib');
        const Buffer = require('buffer').Buffer;
        const now = new Date();
        const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)) & 0xffff;
        const dosDate = ((Math.max(0, now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
        const localParts = [];
        const centralParts = [];
        let offset = 0;
        for (const entry of entries) {
            const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
            const data = entry.data;
            const deflated = zlib.deflateRawSync(data);
            const method = deflated.length < data.length ? 8 : 0;
            const compressed = method === 8 ? deflated : data;
            const crc = this.crc32(data);
            const local = Buffer.alloc(30);
            local.writeUInt32LE(0x04034b50, 0);
            local.writeUInt16LE(20, 4);
            local.writeUInt16LE(0x0800, 6); // UTF-8 file names
            local.writeUInt16LE(method, 8);
            local.writeUInt16LE(dosTime, 10);
            local.writeUInt16LE(dosDate, 12);
            local.writeUInt32LE(crc, 14);
            local.writeUInt32LE(compressed.length, 18);
            local.writeUInt32LE(data.length, 22);
            local.writeUInt16LE(name.length, 26);
            localParts.push(local, name, compressed);
            const central = Buffer.alloc(46);
            central.writeUInt32LE(0x02014b50, 0);
            central.writeUInt16LE(20, 4);
            central.writeUInt16LE(20, 6);
            central.writeUInt16LE(0x0800, 8);
            central.writeUInt16LE(method, 10);
            central.writeUInt16LE(dosTime, 12);
            central.writeUInt16LE(dosDate, 14);
            central.writeUInt32LE(crc, 16);
            central.writeUInt32LE(compressed.length, 20);
            central.writeUInt32LE(data.length, 24);
            central.writeUInt16LE(name.length, 28);
            central.writeUInt32LE(offset, 42);
            centralParts.push(central, name);
            offset += 30 + name.length + compressed.length;
        }
        const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
        const eocd = Buffer.alloc(22);
        eocd.writeUInt32LE(0x06054b50, 0);
        eocd.writeUInt16LE(entries.length, 8);
        eocd.writeUInt16LE(entries.length, 10);
        eocd.writeUInt32LE(centralSize, 12);
        eocd.writeUInt32LE(offset, 16);
        this.fs.writeFileSync(zipPath, Buffer.concat([...localParts, ...centralParts, eocd]));
    }

    collectRpgMakerRuntimeFiles(projectPath) {
        const jsPath = this.path.join(projectPath, 'js');
        const files = [];
        if (!this.fs.existsSync(jsPath)) return files;
        for (const entry of this.fs.readdirSync(jsPath, { withFileTypes: true })) {
            if (entry.isFile() && (entry.name === 'main.js' || /^(rmmz|rpg)_[\w.-]*\.js$/.test(entry.name))) {
                files.push(this.path.join('js', entry.name));
            }
        }
        // No corescript means nothing to quarantine: an already-converted
        // project's js/libs belongs to the Reactor runtime and stays put.
        if (!files.length) return files;
        const addLibs = (dir, rel) => {
            if (!this.fs.existsSync(dir)) return;
            for (const entry of this.fs.readdirSync(dir, { withFileTypes: true })) {
                const fullPath = this.path.join(dir, entry.name);
                const relPath = this.path.join(rel, entry.name);
                if (entry.isDirectory()) addLibs(fullPath, relPath);
                else files.push(relPath);
            }
        };
        addLibs(this.path.join(jsPath, 'libs'), this.path.join('js', 'libs'));
        return files;
    }

    removeEmptyDirs(dir) {
        if (!this.fs.existsSync(dir)) return;
        for (const entry of this.fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) this.removeEmptyDirs(this.path.join(dir, entry.name));
        }
        if (!this.fs.readdirSync(dir).length) this.fs.rmdirSync(dir);
    }

    async installReactorRuntime(projectPath, projectName, options = {}) {
        const tt = text => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        if (!this.fs || !this.path) {
            return { ok: false, error: tt('File system not available.') };
        }
        const runtimePath = this.getRuntimePath();
        if (!runtimePath) {
            return { ok: false, error: tt('Runtime corescript directory not found. Expected runtime/ beside the editor.') };
        }

        try {
            const displayName = projectName || this.path.basename(projectPath);
            const packageResult = this.ensureProjectPackageMetadata(projectPath, displayName);
            if (!packageResult.ok) return packageResult;

            const jsPath = this.path.join(projectPath, 'js');
            const indexPath = this.path.join(projectPath, 'index.html');
            let indexUsesReactor = false;
            if (this.fs.existsSync(indexPath)) {
                indexUsesReactor = /js\/reactor_main\.js/.test(this.fs.readFileSync(indexPath, 'utf8'));
            }

            // Quarantine the RPG Maker corescript into a zip in the project
            // root so the two runtimes never share js/. Deploy staging
            // excludes the archive.
            const oldRuntimeFiles = this.collectRpgMakerRuntimeFiles(projectPath);
            let archivedTo = null;
            if (oldRuntimeFiles.length) {
                const archiveEntries = oldRuntimeFiles.map(relPath => ({
                    name: relPath.split(this.path.sep).join('/'),
                    data: this.fs.readFileSync(this.path.join(projectPath, relPath)),
                }));
                if (!indexUsesReactor && this.fs.existsSync(indexPath)) {
                    archiveEntries.push({ name: 'index.html', data: this.fs.readFileSync(indexPath) });
                }
                let zipName = 'rpgmaker-runtime-backup.zip';
                for (let counter = 2; this.fs.existsSync(this.path.join(projectPath, zipName)); counter++) {
                    zipName = `rpgmaker-runtime-backup-${counter}.zip`;
                }
                this.writeZipArchive(this.path.join(projectPath, zipName), archiveEntries);
                for (const relPath of oldRuntimeFiles) {
                    this.fs.rmSync(this.path.join(projectPath, relPath), { force: true });
                }
                this.removeEmptyDirs(this.path.join(jsPath, 'libs'));
                archivedTo = zipName;
            }

            await this.copyRuntimeIntoProject(runtimePath, jsPath, true);

            // Seed the Reactor plugin manifest from the project's RPG Maker
            // manifest so an imported plugin configuration keeps working.
            const reactorManifest = this.path.join(jsPath, 'reactor_plugins.js');
            const rpgMakerManifest = this.path.join(jsPath, 'plugins.js');
            if (!this.fs.existsSync(reactorManifest) || options.regenerateManifest) {
                if (this.fs.existsSync(rpgMakerManifest)) {
                    this.fs.copyFileSync(rpgMakerManifest, reactorManifest);
                } else if (!this.fs.existsSync(reactorManifest)) {
                    this.writeText(reactorManifest, 'var $plugins = [];\n');
                }
            }

            if (!indexUsesReactor) {
                const isMvProject = this.fs.existsSync(this.path.join(projectPath, 'Game.rpgproject'))
                    || this.fs.existsSync(this.path.join(projectPath, 'game.rpgproject'));
                this.writeText(indexPath, this.getStarterIndexHtml(displayName, { mvCompat: isMvProject }));
            }

            return { ok: true, archivedTo, package: packageResult };
        } catch (error) {
            console.error('Error installing Reactor runtime:', error);
            return { ok: false, error: error.message };
        }
    }

    getRuntimePath() {
        if (!this.fs || !this.path || typeof process === 'undefined') return null;

        const cwd = process.cwd();
        const candidates = [
            this.path.join(cwd, 'runtime'),
            this.path.join(cwd, '..', 'runtime')
        ];

        for (const candidate of candidates) {
            if (this.fs.existsSync(this.path.join(candidate, 'reactor_main.js'))) {
                return candidate;
            }
        }

        return null;
    }

    getTemplateProjectPath() {
        if (!this.fs || !this.path || typeof process === 'undefined') return null;

        const cwd = process.cwd();
        const candidates = [
            this.path.join(cwd, 'template', 'Demo'),
            this.path.join(cwd, '..', 'template', 'Demo')
        ];

        for (const candidate of candidates) {
            if (this.fs.existsSync(this.path.join(candidate, 'project.rpgreactor'))) {
                return candidate;
            }
        }

        return null;
    }

    updateCopiedTemplateProject(targetPath, projectName, engineVersion) {
        this.writeProjectMetadata(targetPath, projectName, engineVersion);

        const packagePath = this.path.join(targetPath, 'package.json');
        if (this.fs.existsSync(packagePath)) {
            const packageData = JSON.parse(this.fs.readFileSync(packagePath, 'utf8'));
            packageData.name = this.getProjectPackageName(projectName);
            packageData.version = engineVersion;
            packageData.window = packageData.window || {};
            packageData.window.title = projectName;
            this.writeJson(packagePath, packageData);
        }

        const systemPath = this.path.join(targetPath, 'data', 'System.json');
        if (this.fs.existsSync(systemPath)) {
            const systemData = JSON.parse(this.fs.readFileSync(systemPath, 'utf8'));
            systemData.gameTitle = projectName;
            this.writeJson(systemPath, systemData);
        }
    }

    writeProjectMetadata(targetPath, projectName, engineVersion) {
        const now = new Date().toISOString();
        const projectData = {
            name: projectName,
            version: engineVersion,
            engine: 'RPG Reactor',
            engineVersion: engineVersion,
            created: now,
            modified: now
        };

        this.writeJson(this.path.join(targetPath, 'project.rpgreactor'), projectData);
    }

    async createStarterProject(targetPath, projectName, engineVersion, runtimePath) {
        const jsPath = this.path.join(targetPath, 'js');
        const dataPath = this.path.join(targetPath, 'data');

        await this.copyDirectory(runtimePath, jsPath);
        this.writeText(this.path.join(jsPath, 'reactor_plugins.js'), 'var $plugins = [];\n');

        this.ensureDirectories(targetPath, [
            'audio/bgm', 'audio/bgs', 'audio/me', 'audio/se',
            'effects', 'fonts', 'icon', 'img/animations', 'img/battlebacks1',
            'img/battlebacks2', 'img/characters', 'img/enemies', 'img/faces',
            'img/parallaxes', 'img/pictures', 'img/sv_actors', 'img/sv_enemies',
            'img/system', 'img/tilesets', 'img/titles1', 'img/titles2', 'js/plugins'
        ]);

        this.writeText(this.path.join(targetPath, 'index.html'), this.getStarterIndexHtml(projectName));
        this.writeJson(this.path.join(targetPath, 'package.json'), this.getStarterPackage(projectName, engineVersion));
        this.writeText(this.path.join(targetPath, 'game.rmmzproject'), 'RPGMZ 1.0.0');

        if (!this.fs.existsSync(dataPath)) {
            this.fs.mkdirSync(dataPath, { recursive: true });
        }

        const dataFiles = this.getStarterData(projectName);
        for (const [fileName, data] of Object.entries(dataFiles)) {
            this.writeJson(this.path.join(dataPath, fileName), data);
        }

        this.writeSolidPng(this.path.join(targetPath, 'img', 'system', 'Window.png'), 192, 192, [32, 32, 40, 255]);
        this.writeSolidPng(this.path.join(targetPath, 'img', 'system', 'IconSet.png'), 512, 512, [0, 0, 0, 0]);
        this.copyEditorIcon(targetPath);
    }

    ensureDirectories(rootPath, directories) {
        for (const directory of directories) {
            const fullPath = this.path.join(rootPath, directory);
            if (!this.fs.existsSync(fullPath)) {
                this.fs.mkdirSync(fullPath, { recursive: true });
            }
        }
    }

    writeText(filePath, contents) {
        this.fs.writeFileSync(filePath, contents, 'utf8');
    }

    writeJson(filePath, data) {
        this.writeText(filePath, JSON.stringify(data, null, 2));
    }

    crc32(buffer) {
        let crc = 0xffffffff;
        for (const byte of buffer) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) {
                crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
            }
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    writeSolidPng(filePath, width, height, rgba) {
        const zlib = require('zlib');
        const Buffer = require('buffer').Buffer;
        const rowSize = width * 4 + 1;
        const pixels = Buffer.alloc(rowSize * height);
        for (let y = 0; y < height; y++) {
            const row = y * rowSize;
            pixels[row] = 0;
            for (let x = 0; x < width; x++) {
                const offset = row + 1 + x * 4;
                pixels[offset] = rgba[0];
                pixels[offset + 1] = rgba[1];
                pixels[offset + 2] = rgba[2];
                pixels[offset + 3] = rgba[3];
            }
        }

        const crc32 = (buffer) => this.crc32(buffer);
        const chunk = (type, data) => {
            const name = Buffer.from(type, 'ascii');
            const length = Buffer.alloc(4);
            length.writeUInt32BE(data.length);
            const checksum = Buffer.alloc(4);
            checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
            return Buffer.concat([length, name, data, checksum]);
        };

        const header = Buffer.alloc(13);
        header.writeUInt32BE(width, 0);
        header.writeUInt32BE(height, 4);
        header[8] = 8;
        header[9] = 6;
        this.fs.writeFileSync(filePath, Buffer.concat([
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
            chunk('IHDR', header),
            chunk('IDAT', zlib.deflateSync(pixels)),
            chunk('IEND', Buffer.alloc(0))
        ]));
    }

    getStarterIndexHtml(projectName, options = {}) {
        // The MV compatibility layer reads this flag at boot; deployed games
        // exclude the RPG Maker project markers, so the mode must ship here.
        const mvCompatLine = typeof options.mvCompat === 'boolean'
            ? `\n        <script>window.$reactorMvCompat = ${options.mvCompat};</script>`
            : '';
        return `<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <meta name="viewport" content="user-scalable=no">
        <link rel="icon" href="icon/icon.png" type="image/png">
        <link rel="apple-touch-icon" href="icon/icon.png">
        <title>${this.escapeHtml(projectName)}</title>
    </head>
    <body style="background-color: black">${mvCompatLine}
        <script type="text/javascript" src="js/reactor_main.js"></script>
    </body>
</html>
`;
    }

    getStarterPackage(projectName, engineVersion) {
        return {
            name: this.getProjectPackageName(projectName),
            version: engineVersion,
            main: 'index.html',
            'chromium-args': '--force-color-profile=srgb --window-size=1280,720',
            window: {
                title: projectName,
                width: 1280,
                height: 720,
                min_width: 1280,
                min_height: 720,
                position: 'center',
                resizable: true,
                frame: true,
                show: true,
                icon: 'icon/icon.png'
            }
        };
    }

    getStarterData(projectName) {
        const mapWidth = 17;
        const mapHeight = 13;
        const blankMapData = new Array(mapWidth * mapHeight * 6).fill(0);
        const emptyAudio = { name: '', pan: 0, pitch: 100, volume: 90 };

        return {
            'Actors.json': [null],
            'Animations.json': [null],
            'Armors.json': [null],
            'Classes.json': [null],
            'CommonEvents.json': [null],
            'Enemies.json': [null],
            'Items.json': [null],
            'Skills.json': [null],
            'States.json': [null],
            'Tilesets.json': [null, this.getStarterTileset()],
            'Troops.json': [null],
            'Weapons.json': [null],
            'MapInfos.json': [null, {
                id: 1,
                expanded: true,
                name: 'Map001',
                order: 1,
                parentId: 0,
                scrollX: 0,
                scrollY: 0
            }],
            'Map001.json': {
                autoplayBgm: false,
                autoplayBgs: false,
                battleback1Name: '',
                battleback2Name: '',
                bgm: { ...emptyAudio },
                bgs: { ...emptyAudio },
                disableDashing: false,
                displayName: '',
                encounterList: [],
                encounterStep: 30,
                height: mapHeight,
                note: '',
                parallaxLoopX: false,
                parallaxLoopY: false,
                parallaxName: '',
                parallaxShow: true,
                parallaxSx: 0,
                parallaxSy: 0,
                scrollType: 0,
                specifyBattleback: false,
                tilesetId: 1,
                width: mapWidth,
                data: blankMapData,
                events: [null]
            },
            'MapTest.json': {
                troopId: 1,
                canEscape: true,
                canLose: false,
                actor1Id: 1,
                actor1Level: 1,
                actor2Id: 0,
                actor2Level: 1,
                actor3Id: 0,
                actor3Level: 1,
                actor4Id: 0,
                actor4Level: 1
            },
            'System.json': this.getStarterSystem(projectName)
        };
    }

    getStarterTileset() {
        return {
            id: 1,
            mode: 1,
            name: 'Default',
            note: '',
            tilesetNames: ['', '', '', '', '', '', '', '', ''],
            flags: new Array(8192).fill(0)
        };
    }

    getStarterSystem(projectName) {
        const emptyAudio = { name: '', pan: 0, pitch: 100, volume: 90 };
        return {
            gameTitle: projectName,
            versionId: 1,
            locale: 'en_US',
            editMapId: 1,
            startMapId: 1,
            startX: 8,
            startY: 6,
            boat: { bgm: { ...emptyAudio }, characterIndex: 0, characterName: '', startMapId: 0, startX: 0, startY: 0 },
            ship: { bgm: { ...emptyAudio }, characterIndex: 0, characterName: '', startMapId: 0, startX: 0, startY: 0 },
            airship: { bgm: { ...emptyAudio }, characterIndex: 0, characterName: '', startMapId: 0, startX: 0, startY: 0 },
            title1Name: '',
            title2Name: '',
            titleBgm: { ...emptyAudio },
            battleBgm: { ...emptyAudio },
            victoryMe: { ...emptyAudio },
            defeatMe: { ...emptyAudio },
            gameoverMe: { ...emptyAudio },
            battleSystem: 1,
            tileSize: 48,
            windowTone: [0, 0, 0, 0],
            menuCommands: [true, true, true, true, true, true],
            itemCategories: [true, true, true, true],
            magicSkills: [1],
            hasEncryptedImages: false,
            hasEncryptedAudio: false,
            encryptionKey: '',
            optDisplayTp: true,
            optDrawTitle: true,
            optExtraExp: false,
            optFloorDeath: false,
            optFollowers: true,
            optKeyItemsNumber: true,
            optSideView: true,
            optSlipDeath: false,
            optTransparent: false,
            partyMembers: [],
            currencyUnit: 'G',
            elements: ['', 'Physical'],
            equipTypes: ['', 'Weapon', 'Shield', 'Head', 'Body', 'Accessory'],
            skillTypes: ['', 'Magic', 'Special'],
            weaponTypes: ['', 'Sword'],
            attackMotions: new Array(13).fill(null).map((_, index) => ({
                type: index === 1 ? 1 : 0,
                weaponImageId: index === 1 ? 1 : 0
            })),
            armorTypes: ['', 'General Armor'],
            switches: ['', 'Switch 1'],
            variables: ['', 'Variable 1'],
            terms: {
                basic: ['Level', 'Lv', 'HP', 'HP', 'MP', 'MP', 'TP', 'TP', 'Experience', 'EXP'],
                commands: ['Fight', 'Escape', 'Attack', 'Guard', 'Item', 'Skill', 'Equip', 'Status', 'Formation', 'Save', 'Game End', 'Options', 'Weapon', 'Armor', 'Key Item', 'Equip', 'Optimize', 'Clear', 'New Game', 'Continue', null, 'To Title', 'Cancel', null, 'Buy', 'Sell'],
                params: ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck', 'Hit Rate', 'Evasion Rate'],
                messages: {}
            },
            sounds: new Array(24).fill(null).map(() => ({ ...emptyAudio })),
            testBattlers: [],
            testTroopId: 1,
            battleback1Name: '',
            battleback2Name: '',
            titleCommandWindow: { background: 0, offsetX: 0, offsetY: 0 },
            advanced: {
                fallbackFonts: 'Verdana, sans-serif',
                fontSize: 26,
                gameId: 0,
                mainFontFilename: '',
                numberFontFilename: '',
                screenHeight: 624,
                screenScale: 1,
                screenWidth: 816,
                uiAreaHeight: 624,
                uiAreaWidth: 816,
                windowOpacity: 192
            }
        };
    }

    copyEditorIcon(targetPath) {
        const cwd = process.cwd();
        const iconCandidates = [
            this.path.join(cwd, 'images', 'icon.png'),
            this.path.join(cwd, 'editor', 'images', 'icon.png')
        ];

        for (const iconPath of iconCandidates) {
            if (this.fs.existsSync(iconPath)) {
                this.fs.copyFileSync(iconPath, this.path.join(targetPath, 'icon', 'icon.png'));
                return;
            }
        }
    }

    slugify(value) {
        const slug = String(value || 'rpg-reactor-game')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return slug || 'rpg-reactor-game';
    }

    getProjectPackageName(projectName) {
        const name = this.slugify(projectName);
        return name === 'rmmz-game' ? 'rpg-reactor-game' : name;
    }

    ensureProjectPackageMetadata(projectPath, displayName = null) {
        if (!this.fs || !this.path) {
            return { ok: false, error: 'File system not available.' };
        }

        const packagePath = this.path.join(projectPath, 'package.json');
        const projectName = displayName || this.path.basename(projectPath) || 'RPG Reactor Game';
        let packageData;
        let created = false;
        const repaired = [];

        try {
            if (this.fs.existsSync(packagePath)) {
                const source = this.fs.readFileSync(packagePath, 'utf8').replace(/^\uFEFF/, '');
                packageData = JSON.parse(source);
                if (!packageData || typeof packageData !== 'object' || Array.isArray(packageData)) {
                    return {
                        ok: false,
                        path: packagePath,
                        error: `Cannot use ${packagePath}: expected package.json to contain a JSON object.`
                    };
                }
            } else {
                packageData = this.getStarterPackage(projectName, this.getEngineVersion());
                created = true;
            }

            if (typeof packageData.name !== 'string' || !packageData.name.trim()) {
                packageData.name = this.getProjectPackageName(projectName);
                repaired.push('name');
            }
            if (typeof packageData.main !== 'string' || !packageData.main.trim()) {
                packageData.main = 'index.html';
                repaired.push('main');
            }

            if (created || repaired.length > 0) {
                this._writeFileAtomic(this.fs, packagePath, JSON.stringify(packageData, null, 2), 'utf8');
            }
            return {
                ok: true,
                path: packagePath,
                created,
                repaired,
                packageName: packageData.name
            };
        } catch (error) {
            return {
                ok: false,
                path: packagePath,
                error: `Cannot use ${packagePath}: ${error.message || error}`
            };
        }
    }

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async loadProject(projectPath) {
        this.lastLoadError = null;
        if (!this.fs || !this.path) {
            console.error('File system not available');
            this.lastLoadError = { message: 'File system not available', filePath: projectPath };
            return null;
        }

        try {
            // Look for RPG Reactor project file
            const projectFilePath = this.path.join(projectPath, 'project.rpgreactor');

            let projectData;
            if (this.fs.existsSync(projectFilePath)) {
                // Load RPG Reactor project
                projectData = await this._readJsonWithRetry(projectFilePath);
                if (!projectData || typeof projectData !== 'object' || Array.isArray(projectData)) {
                    const error = new Error('project.rpgreactor must contain a JSON object');
                    error.filePath = projectFilePath;
                    throw error;
                }
                projectData.path = projectPath;
            } else {
                // Check if it's an RPG Maker project
                const rmmzFile = this.path.join(projectPath, 'game.rmmzproject');
                const rpgmvFile = this.path.join(projectPath, 'Game.rpgproject');
                const rpgmvLowerFile = this.path.join(projectPath, 'game.rpgproject');
                if (this.fs.existsSync(rmmzFile) || this.fs.existsSync(rpgmvFile) || this.fs.existsSync(rpgmvLowerFile)) {
                    // Import RPG Maker project
                    const engineVersion = this.getEngineVersion();
                    projectData = {
                        name: this.path.basename(projectPath),
                        version: engineVersion,
                        engine: 'RPG Reactor',
                        engineVersion: engineVersion,
                        imported: true,
                        importedFrom: this.fs.existsSync(rmmzFile) ? 'RPG Maker MZ' : 'RPG Maker MV',
                        path: projectPath
                    };
                } else {
                    console.error('No valid project file found');
                    this.lastLoadError = {
                        message: 'No project.rpgreactor, game.rmmzproject, or Game.rpgproject file was found.',
                        filePath: projectPath
                    };
                    return null;
                }
            }

            // Load map list
            const mapInfosPath = this.path.join(projectPath, 'data', 'MapInfos.json');
            if (this.fs.existsSync(mapInfosPath)) {
                projectData.maps = await this._readJsonWithRetry(mapInfosPath);
                if (!Array.isArray(projectData.maps)) {
                    const error = new Error('MapInfos.json must contain a JSON array');
                    error.filePath = mapInfosPath;
                    throw error;
                }
            } else {
                projectData.maps = [];
            }

            return projectData;
        } catch (error) {
            console.error('Error loading project:', error);
            this.lastLoadError = {
                message: error.message || String(error),
                code: error.code || null,
                filePath: error.filePath || null
            };
            return null;
        }
    }

    async saveProject(projectData) {
        if (!this.fs || !this.path) {
            console.error('File system not available');
            return false;
        }

        try {
            const projectFilePath = this.path.join(projectData.path, 'project.rpgreactor');
            projectData.modified = new Date().toISOString();

            // Don't save the path in the file
            const { path, maps, ...dataToSave } = projectData;

            this._writeFileAtomic(this.fs, projectFilePath, JSON.stringify(dataToSave, null, 2));

            // Save MapInfos.json if maps data exists
            if (maps) {
                if (!this.saveMapInfos(projectData.path, maps)) {
                    return false;
                }
            }

            console.log('Project saved successfully!');
            return true;
        } catch (error) {
            console.error('Error saving project:', error);
            return false;
        }
    }

    saveMapInfos(projectPath, mapsData) {
        if (!this.fs || !this.path) {
            console.error('File system not available');
            return false;
        }

        try {
            const mapInfosPath = this.path.join(projectPath, 'data', 'MapInfos.json');
            this._writeFileAtomic(this.fs, mapInfosPath, JSON.stringify(mapsData, null, 0)); // No formatting for RPG Maker compatibility
            console.log('MapInfos.json saved successfully!');
            return true;
        } catch (error) {
            console.error('Error saving MapInfos.json:', error);
            return false;
        }
    }
}
