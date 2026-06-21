// RPG Reactor - Project Manager
// Handles project creation, loading, and saving

class ProjectManager {
    constructor() {
        this.fs = null;
        this.path = null;

        // Initialize Node.js modules if running in NW.js
        if (typeof nw !== 'undefined') {
            this.fs = require('fs');
            this.path = require('path');
        }
    }

    getEngineVersion() {
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
        if (!this.fs || !this.path) {
            console.error('File system not available');
            return false;
        }

        try {
            console.log(`Creating new project: ${projectName} at ${targetPath}`);

            const engineVersion = this.getEngineVersion();
            const templatePath = this.getTemplateProjectPath();

            // Create target directory if it doesn't exist
            if (!this.fs.existsSync(targetPath)) {
                this.fs.mkdirSync(targetPath, { recursive: true });
            }

            if (templatePath) {
                await this.copyDirectory(templatePath, targetPath);
                this.updateCopiedTemplateProject(targetPath, projectName, engineVersion);
            } else {
                const runtimePath = this.getRuntimePath();

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
            return false;
        }
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
            packageData.name = this.slugify(projectName);
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

    getStarterIndexHtml(projectName) {
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
    <body style="background-color: black">
        <script type="text/javascript" src="js/reactor_main.js"></script>
    </body>
</html>
`;
    }

    getStarterPackage(projectName, engineVersion) {
        return {
            name: this.slugify(projectName),
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
            advanced: {}
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

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async loadProject(projectPath) {
        if (!this.fs || !this.path) {
            console.error('File system not available');
            return null;
        }

        try {
            // Look for RPG Reactor project file
            const projectFilePath = this.path.join(projectPath, 'project.rpgreactor');

            let projectData;
            if (this.fs.existsSync(projectFilePath)) {
                // Load RPG Reactor project
                projectData = JSON.parse(this.fs.readFileSync(projectFilePath, 'utf8'));
                projectData.path = projectPath;
            } else {
                // Check if it's an RPG Maker project
                const rmmzFile = this.path.join(projectPath, 'game.rmmzproject');
                if (this.fs.existsSync(rmmzFile)) {
                    // Import RPG Maker project
                    const engineVersion = this.getEngineVersion();
                    projectData = {
                        name: this.path.basename(projectPath),
                        version: engineVersion,
                        engine: 'RPG Reactor',
                        engineVersion: engineVersion,
                        imported: true,
                        importedFrom: 'RPG Maker MZ',
                        path: projectPath
                    };
                } else {
                    console.error('No valid project file found');
                    return null;
                }
            }

            // Load map list
            const mapInfosPath = this.path.join(projectPath, 'data', 'MapInfos.json');
            if (this.fs.existsSync(mapInfosPath)) {
                projectData.maps = JSON.parse(this.fs.readFileSync(mapInfosPath, 'utf8'));
            }

            return projectData;
        } catch (error) {
            console.error('Error loading project:', error);
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

            this.fs.writeFileSync(projectFilePath, JSON.stringify(dataToSave, null, 2));

            // Save MapInfos.json if maps data exists
            if (maps) {
                this.saveMapInfos(projectData.path, maps);
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
            this.fs.writeFileSync(mapInfosPath, JSON.stringify(mapsData, null, 0)); // No formatting for RPG Maker compatibility
            console.log('MapInfos.json saved successfully!');
            return true;
        } catch (error) {
            console.error('Error saving MapInfos.json:', error);
            return false;
        }
    }
}
