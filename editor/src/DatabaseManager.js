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
            animations: 1000,
            tilesets: 1000,
            commonEvents: 9999,
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
            system: null,
            mapInfos: []
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

    captureSavedState(dataKey = null) {
        const entries = dataKey
            ? this.dataFiles.filter(([key]) => key === dataKey)
            : this.dataFiles;
        for (const [key] of entries) {
            this.savedState[key] = this.serialize(this.data[key]);
        }
    }

    getDirtyKeys() {
        return this.dataFiles
            .filter(([key]) => this.savedState[key] !== undefined && this.serialize(this.data[key]) !== this.savedState[key])
            .map(([key]) => key);
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
        }

        if (newMax !== currentMax) this.mutationGeneration++;

        return true;
    }

    async saveAllData(projectPath) {
        if (!this.fs || !this.path) return false;

        const failed = [];
        for (const [key, filename] of this.dataFiles) {
            // System.json is part of dataFiles and gets its own fresh
            // versionId when its turn comes — skip the companion rewrite
            // that would otherwise re-save it after every other file.
            if (!await this.saveJSON(projectPath, filename, this.data[key], { skipVersionBump: true })) {
                failed.push(filename);
            }
        }
        if (failed.length) console.error(`Failed to save database files: ${failed.join(', ')}`);
        return failed.length === 0;
    }
}
