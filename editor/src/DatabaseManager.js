// RPG Reactor - Database Manager
// Handles loading and managing all database JSON files

class DatabaseManager {
    static maximumEntries(dataKey) {
        const limits = globalThis.RR_LIMITS?.DATABASE_ENTRIES || {
            actors: 9999,
            classes: 9999,
            skills: 9999,
            items: 9999,
            weapons: 9999,
            armors: 9999,
            enemies: 9999,
            troops: 9999,
            states: 9999,
            animations: 5000,
            tilesets: 1000,
            commonEvents: 9999,
            userInterfaces: 9999,
            elements: 512,
            skillTypes: 128,
            weaponTypes: 256,
            armorTypes: 256,
            equipTypes: 128
        };
        return limits[dataKey] || 0;
    }

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
        this.projectPath = null;
        this.dataGeneration = 0;
        this.mutationGeneration = 0;
        this.savedState = {};
        this.tileset3DLoadError = null;
        this.editorNamesLoadError = null;
        const host = typeof window !== 'undefined' ? window.RPGReactorHost : null;
        if (host?.fs && host?.path) {
            this.fs = host.fs;
            this.path = host.path;
        }
        this.dataFiles = [
            ['actors', 'Actors.json'],
            ['classes', 'Classes.json'],
            ['skills', 'Skills.json'],
            ['items', 'Items.json'],
            ['weapons', 'Weapons.json'],
            ['armors', 'Armors.json'],
            ['enemies', 'Enemies.json'],
            ['troops', 'Troops.json'],
            ['states', 'States.json'],
            ['animations', 'Animations.json'],
            ['tilesets', 'Tilesets.json'],
            ['commonEvents', 'CommonEvents.json'],
            ['userInterfaces', 'UserInterfaces.json'],
            ['system', 'System.json']
        ];

        // Database storage
        this.data = {
            actors: [],
            classes: [],
            skills: [],
            items: [],
            weapons: [],
            armors: [],
            enemies: [],
            troops: [],
            states: [],
            animations: [],
            tilesets: [],
            commonEvents: [],
            // Reactor's own database section, stored beside the MZ files;
            // absent in projects that never authored an interface.
            userInterfaces: [],
            system: null,
            mapInfos: [],
            // Per-tile 3D classification. Not one of the dataFiles: those are
            // the MZ database format, and this is ours, stored beside them.
            tileset3d: null,
            // Editor-only labels for player-facing database entries.
            editorNames: null
        };

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
        throw lastError;
    }

    async loadAllData(projectPath) {
        if (!this.fs || !this.path) {
            return false;
        }

        try {
            const dataPath = this.path.join(projectPath, 'data');
            const loaded = {};
            for (const [key, filename] of this.dataFiles) {
                loaded[key] = await this.loadJSON(dataPath, filename);
            }
            loaded.tileset3d = await this.loadTileset3D(projectPath);
            loaded.editorNames = await this.loadEditorNames(projectPath);
            // An absent file reads as []; records start at id 1 behind the
            // null slot every other database file keeps. A project that has
            // never authored an interface opens on baselines of its stock
            // scenes (they are written with the next save; the game keeps
            // its stock scenes until one is called).
            if (!Array.isArray(loaded.userInterfaces) || loaded.userInterfaces.length === 0) {
                const stock = typeof RRStockInterfaces !== 'undefined' ? RRStockInterfaces.build(loaded) : [];
                loaded.userInterfaces = [null, ...stock];
            }
            Object.assign(this.data, loaded);
            this.projectPath = projectPath;
            this.dataGeneration++;
            this.mutationGeneration++;
            this.captureSavedState();

            return true;
        } catch (error) {
            console.error('Error loading database:', error);
            return false;
        }
    }

    async loadJSON(basePath, filename) {
        const filePath = this.path.join(basePath, filename);

        if (!this.fs.existsSync(filePath)) {
            return filename === 'System.json' ? {} : [];
        }

        try {
            return await this._readJsonWithRetry(filePath);
        } catch (error) {
            console.error(`Error loading ${filename}:`, error);
            throw new Error(`Could not parse ${filename}: ${error.message}`);
        }
    }

    serialize(data) {
        return JSON.stringify(data);
    }

    /**
     * The per-tile 3D classification module, when the page has loaded it.
     *
     * Absent in the web host and in tests that exercise the database alone, and
     * a project without classification behaves exactly as it did, so every
     * caller here treats a missing module as "nothing to do".
     */
    tileset3DClasses() {
        return (typeof globalThis !== 'undefined' && globalThis.RRTileset3DClass) || null;
    }

    /** The live classification store, created empty on first use. */
    getTileset3D() {
        const classes = this.tileset3DClasses();
        if (!classes) return null;
        if (!this.data.tileset3d) this.data.tileset3d = classes.create();
        return this.data.tileset3d;
    }

    async loadTileset3D(projectPath) {
        const classes = this.tileset3DClasses();
        if (!classes || !this.fs || !this.path) return null;
        const filePath = this.path.join(projectPath, 'data', classes.FILENAME);
        if (!this.fs.existsSync(filePath)) {
            this.tileset3DLoadError = null;
            return classes.create();
        }
        try {
            const parsed = await this._readJsonWithRetry(filePath);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
                || !parsed.tilesets || typeof parsed.tilesets !== 'object' || Array.isArray(parsed.tilesets)) {
                throw new Error(`${classes.FILENAME} must contain a 3D tileset data object`);
            }
            this.tileset3DLoadError = null;
            return classes.normalize(parsed);
        } catch (error) {
            // A damaged sidecar must not stop the database from opening: the
            // runtime falls back to its flag heuristic for anything it cannot
            // read, so the cost is a worse-looking 3D map, not a dead editor.
            console.error(`Error loading ${classes.FILENAME}:`, error);
            this.tileset3DLoadError = error;
            return classes.create();
        }
    }

    async saveTileset3D(projectPath) {
        const classes = this.tileset3DClasses();
        if (!classes || !this.fs || !this.path) return true;
        const filePath = this.path.join(projectPath, 'data', classes.FILENAME);
        if (this.tileset3DLoadError && this.fs.existsSync(filePath)) {
            console.error(`Refusing to overwrite unreadable ${classes.FILENAME}:`, this.tileset3DLoadError);
            return false;
        }
        // A project that never classifies a tile gains no file. One that had
        // classes and then cleared them keeps an empty file rather than a stale
        // one — deleting a file the author may have in version control is not
        // this function's call to make.
        const store = this.data.tileset3d;
        if (classes.isEmpty(store) && !this.fs.existsSync(filePath)) {
            // Nothing to write, but the save still happened: without this the
            // baseline stays unset and the first classification never registers
            // as unsaved work.
            this.captureSavedState('tileset3d');
            return true;
        }
        try {
            this._writeFileAtomic(this.fs, filePath, JSON.stringify(classes.normalize(store)));
            this.captureSavedState('tileset3d');
            return true;
        } catch (error) {
            console.error(`Error saving ${classes.FILENAME}:`, error);
            return false;
        }
    }

    editorNamesModule() {
        return (typeof globalThis !== 'undefined' && globalThis.RREditorNames) || null;
    }

    async loadEditorNames(projectPath) {
        const names = this.editorNamesModule();
        if (!names || !this.fs || !this.path) return null;
        const filePath = this.path.join(projectPath, 'data', names.FILENAME);
        if (!this.fs.existsSync(filePath)) {
            this.editorNamesLoadError = null;
            return names.create();
        }
        try {
            const parsed = await this._readJsonWithRetry(filePath);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error(`${names.FILENAME} must contain an editor names object`);
            }
            this.editorNamesLoadError = null;
            return names.normalize(parsed);
        } catch (error) {
            // Losing editor-only labels must not stop the project database from
            // opening, but the damaged source file must remain untouched.
            console.error(`Error loading ${names.FILENAME}:`, error);
            this.editorNamesLoadError = error;
            return names.create();
        }
    }

    async saveEditorNames(projectPath) {
        const names = this.editorNamesModule();
        if (!names || !this.fs || !this.path) return true;
        const filePath = this.path.join(projectPath, 'data', names.FILENAME);
        if (this.editorNamesLoadError && this.fs.existsSync(filePath)) {
            console.error(`Refusing to overwrite unreadable ${names.FILENAME}:`, this.editorNamesLoadError);
            return false;
        }
        const store = this.data.editorNames;
        if (names.isEmpty(store) && !this.fs.existsSync(filePath)) {
            this.captureSavedState('editorNames');
            return true;
        }
        try {
            this._writeFileAtomic(this.fs, filePath, JSON.stringify(names.normalize(store)));
            this.editorNamesLoadError = null;
            this.captureSavedState('editorNames');
            return true;
        } catch (error) {
            console.error(`Error saving ${names.FILENAME}:`, error);
            return false;
        }
    }

    canSaveEditorNames(projectPath) {
        const names = this.editorNamesModule();
        if (!names || !this.fs || !this.path) return true;
        const filePath = this.path.join(projectPath, 'data', names.FILENAME);
        if (this.editorNamesLoadError && this.fs.existsSync(filePath)) {
            console.error(`Refusing to overwrite unreadable ${names.FILENAME}:`, this.editorNamesLoadError);
            return false;
        }
        return true;
    }

    captureSavedState(dataKey = null) {
        const entries = dataKey
            ? this.dataFiles.filter(([key]) => key === dataKey)
            : this.dataFiles;
        for (const [key] of entries) {
            this.savedState[key] = this.serialize(this.data[key]);
        }
        if (!dataKey || dataKey === 'tileset3d') {
            this.savedState.tileset3d = this.serialize(this.data.tileset3d || null);
        }
        if (!dataKey || dataKey === 'editorNames') {
            this.savedState.editorNames = this.serialize(this.data.editorNames || null);
        }
    }

    getDirtyKeys() {
        const dirty = this.dataFiles
            .filter(([key]) => this.savedState[key] !== undefined && this.serialize(this.data[key]) !== this.savedState[key])
            .map(([key]) => key);
        // Classification lives outside dataFiles but is still unsaved work, and
        // the close-without-saving prompt reads this list.
        if (this.savedState.tileset3d !== undefined
            && this.serialize(this.data.tileset3d || null) !== this.savedState.tileset3d) {
            dirty.push('tileset3d');
        }
        if (this.savedState.editorNames !== undefined
            && this.serialize(this.data.editorNames || null) !== this.savedState.editorNames) {
            dirty.push('editorNames');
        }
        return dirty;
    }

    isDirty() {
        return this.getDirtyKeys().length > 0;
    }

    async saveJSON(projectPath, filename, data, options = {}) {
        if (!this.fs || !this.path) {
            return false;
        }

        try {
            const dataPath = this.path.join(projectPath, 'data');
            const filePath = this.path.join(dataPath, filename);

            // RPG Maker regenerates $dataSystem.versionId on every editor
            // save; the runtime's Scene_Load.reloadMapIfUpdated compares it
            // against the save file to force a fresh map setup when data
            // changed. Without the bump, loading a save made on an older
            // version of an edited map leaves the save's Game_Events
            // pointing at missing/renumbered $dataMap entries (per-frame
            // TypeError at map load — soft-lock).
            if (filename === 'System.json' && data) {
                data.versionId = DatabaseManager.newVersionId();
            }

            this._writeFileAtomic(this.fs, filePath, JSON.stringify(data, null, 2));
            const entry = this.dataFiles.find(([, file]) => file === filename);
            if (entry) this.captureSavedState(entry[0]);

            if (filename !== 'System.json' && !options.skipVersionBump && this.data && this.data.system) {
                this.data.system.versionId = DatabaseManager.newVersionId();
                const systemPath = this.path.join(dataPath, 'System.json');
                this._writeFileAtomic(this.fs, systemPath, JSON.stringify(this.data.system, null, 2));
                const systemEntry = this.dataFiles.find(([, file]) => file === 'System.json');
                if (systemEntry) this.captureSavedState(systemEntry[0]);
            }
            return true;
        } catch (error) {
            console.error(`Error saving ${filename}:`, error);
            return false;
        }
    }

    static newVersionId() {
        return Math.floor(Math.random() * 100000000);
    }

    // Helper methods to get specific data types
    getActors() {
        return this.data.actors.filter(a => a !== null);
    }

    getActor(id) {
        return this.data.actors[id] || null;
    }

    getClasses() {
        return this.data.classes.filter(c => c !== null);
    }

    getClass(id) {
        return this.data.classes[id] || null;
    }

    getSkills() {
        return this.data.skills.filter(s => s !== null);
    }

    getSkill(id) {
        return this.data.skills[id] || null;
    }

    getItems() {
        return this.data.items.filter(i => i !== null);
    }

    getItem(id) {
        return this.data.items[id] || null;
    }

    getWeapons() {
        return this.data.weapons.filter(w => w !== null);
    }

    getWeapon(id) {
        return this.data.weapons[id] || null;
    }

    getArmors() {
        return this.data.armors.filter(a => a !== null);
    }

    getArmor(id) {
        return this.data.armors[id] || null;
    }

    getEnemies() {
        return this.data.enemies.filter(e => e !== null);
    }

    getEnemy(id) {
        return this.data.enemies[id] || null;
    }

    getTroops() {
        return this.data.troops.filter(t => t !== null);
    }

    getTroop(id) {
        return this.data.troops[id] || null;
    }

    getStates() {
        return this.data.states.filter(s => s !== null);
    }

    getState(id) {
        return this.data.states[id] || null;
    }

    getAnimations() {
        return this.data.animations.filter(a => a !== null);
    }

    getAnimation(id) {
        return this.data.animations[id] || null;
    }

    getTilesets() {
        return this.data.tilesets.filter(t => t !== null);
    }

    getTileset(id) {
        return this.data.tilesets[id] || null;
    }

    getUserInterfaces() {
        return this.data.userInterfaces.filter(entry => entry !== null);
    }

    getUserInterface(id) {
        return this.data.userInterfaces[id];
    }

    hasUserInterfaces() {
        const list = this.data.userInterfaces;
        return Array.isArray(list) && list.some(entry => entry && typeof entry === 'object');
    }

    getCommonEvents() {
        return this.data.commonEvents.filter(c => c !== null);
    }

    getCommonEvent(id) {
        return this.data.commonEvents[id] || null;
    }

    getSystem() {
        return this.data.system;
    }

    getMapInfos() {
        return this.data.mapInfos;
    }

    // Update methods
    updateActor(id, data) {
        this.data.actors[id] = data;
        this.mutationGeneration++;
    }

    updateClass(id, data) {
        this.data.classes[id] = data;
        this.mutationGeneration++;
    }

    updateSkill(id, data) {
        this.data.skills[id] = data;
        this.mutationGeneration++;
    }

    updateItem(id, data) {
        this.data.items[id] = data;
        this.mutationGeneration++;
    }

    updateWeapon(id, data) {
        this.data.weapons[id] = data;
        this.mutationGeneration++;
    }

    updateArmor(id, data) {
        this.data.armors[id] = data;
        this.mutationGeneration++;
    }

    updateEnemy(id, data) {
        this.data.enemies[id] = data;
        this.mutationGeneration++;
    }

    updateState(id, data) {
        this.data.states[id] = data;
        this.mutationGeneration++;
    }

    updateAnimation(id, data) {
        this.data.animations[id] = data;
        this.mutationGeneration++;
    }

    updateTroop(id, data) {
        this.data.troops[id] = data;
        this.mutationGeneration++;
    }

    updateTileset(id, data) {
        this.data.tilesets[id] = data;
        this.mutationGeneration++;
    }

    updateCommonEvent(id, data) {
        this.data.commonEvents[id] = data;
        this.mutationGeneration++;
    }

    addEntry(dataKey, template) {
        if (!this.data[dataKey]) return null;
        const maximum = this.getMaximumEntries(dataKey);
        if (!maximum || this.getMaxEntries(dataKey) >= maximum) return null;
        template.id = this.data[dataKey].length;
        this.data[dataKey].push(template);
        this.mutationGeneration++;
        return template;
    }

    deleteEntry(dataKey, id) {
        if (!this.data[dataKey]) return;
        this.data[dataKey][id] = null;
        const names = this.editorNamesModule();
        if (names) this.data.editorNames = names.prune(this.data.editorNames, dataKey, this.data[dataKey]);
        this.mutationGeneration++;
    }

    /**
     * Get the current maximum count for a database type
     * (array length - 1, since index 0 is null)
     */
    getMaxEntries(dataKey) {
        if (!this.data[dataKey]) return 0;
        return Math.max(0, this.data[dataKey].length - 1);
    }

    getMaximumEntries(dataKey) {
        return DatabaseManager.maximumEntries(dataKey);
    }

    /**
     * Change the maximum number of entries for a database type.
     * If increasing, adds new default entries. If decreasing, truncates.
     * @param {string} dataKey - The database key (e.g. 'actors')
     * @param {number} newMax - The new maximum count
     * @param {object} template - Default template for new entries
     * @returns {boolean} Whether the operation succeeded
     */
    changeMaximum(dataKey, newMax, template) {
        if (!this.data[dataKey] || !Number.isInteger(newMax) || newMax < 1) return false;

        const currentMax = this.getMaxEntries(dataKey);
        const maximum = this.getMaximumEntries(dataKey);
        // Preserve imported projects that already exceed a stock limit, but
        // never let the editor grow them farther beyond it.
        if (!maximum || (newMax > maximum && newMax > currentMax)) return false;

        if (newMax > currentMax) {
            // Add new entries
            const serializedTemplate = JSON.stringify(template);
            for (let i = currentMax + 1; i <= newMax; i++) {
                const newEntry = JSON.parse(serializedTemplate);
                newEntry.id = i;
                newEntry.name = '';
                this.data[dataKey][i] = newEntry;
            }
        } else if (newMax < currentMax) {
            // Truncate array
            this.data[dataKey].length = newMax + 1;
            const names = this.editorNamesModule();
            if (names) this.data.editorNames = names.prune(this.data.editorNames, dataKey, newMax);
        }

        if (newMax !== currentMax) this.mutationGeneration++;

        return true;
    }

    async saveAllData(projectPath) {
        if (!this.fs || !this.path) return false;

        const failed = [];
        // Reject an unreadable sidecar before touching RPG Maker files, but do
        // not persist editor names until every normal database write succeeds.
        if (!this.canSaveEditorNames(projectPath)) return false;
        for (const [key, filename] of this.dataFiles) {
            // A project that never authored an interface gains no file.
            if (key === 'userInterfaces' && !this.hasUserInterfaces()
                && !this.fs.existsSync(this.path.join(projectPath, 'data', filename))) {
                continue;
            }
            // System.json is part of dataFiles and gets its own fresh
            // versionId when its turn comes — skip the companion rewrite
            // that would otherwise re-save it after every other file.
            if (!await this.saveJSON(projectPath, filename, this.data[key], { skipVersionBump: true })) {
                failed.push(filename);
            }
        }
        if (!await this.saveTileset3D(projectPath)) {
            failed.push(this.tileset3DClasses()?.FILENAME || 'Tilesets.r3d.json');
        }
        if (failed.length === 0 && !await this.saveEditorNames(projectPath)) {
            failed.push(this.editorNamesModule()?.FILENAME || 'Database.names.json');
        }
        if (failed.length) console.error(`Failed to save database files: ${failed.join(', ')}`);
        return failed.length === 0;
    }
}
