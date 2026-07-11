// RPG Reactor - Database Manager
// Handles loading and managing all database JSON files

class DatabaseManager {
    constructor() {
        this.fs = null;
        this.path = null;
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
            loaded.mapInfos = await this.loadJSON(dataPath, 'MapInfos.json');
            Object.assign(this.data, loaded);
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
            const content = this.fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
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

    async saveJSON(projectPath, filename, data) {
        if (!this.fs || !this.path) {
            return false;
        }

        try {
            const dataPath = this.path.join(projectPath, 'data');
            const filePath = this.path.join(dataPath, filename);

            this.fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            const entry = this.dataFiles.find(([, file]) => file === filename);
            if (entry) this.captureSavedState(entry[0]);
            return true;
        } catch (error) {
            console.error(`Error saving ${filename}:`, error);
            return false;
        }
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
    }

    updateClass(id, data) {
        this.data.classes[id] = data;
    }

    updateSkill(id, data) {
        this.data.skills[id] = data;
    }

    updateItem(id, data) {
        this.data.items[id] = data;
    }

    updateWeapon(id, data) {
        this.data.weapons[id] = data;
    }

    updateArmor(id, data) {
        this.data.armors[id] = data;
    }

    updateEnemy(id, data) {
        this.data.enemies[id] = data;
    }

    updateState(id, data) {
        this.data.states[id] = data;
    }

    updateAnimation(id, data) {
        this.data.animations[id] = data;
    }

    updateTroop(id, data) {
        this.data.troops[id] = data;
    }

    updateTileset(id, data) {
        this.data.tilesets[id] = data;
    }

    updateCommonEvent(id, data) {
        this.data.commonEvents[id] = data;
    }

    addEntry(dataKey, template) {
        if (!this.data[dataKey]) return null;
        template.id = this.data[dataKey].length;
        this.data[dataKey].push(template);
        return template;
    }

    deleteEntry(dataKey, id) {
        if (!this.data[dataKey]) return;
        this.data[dataKey][id] = null;
    }

    /**
     * Get the current maximum count for a database type
     * (array length - 1, since index 0 is null)
     */
    getMaxEntries(dataKey) {
        if (!this.data[dataKey]) return 0;
        return Math.max(0, this.data[dataKey].length - 1);
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
        if (!this.data[dataKey] || newMax < 1) return false;

        const currentMax = this.getMaxEntries(dataKey);

        if (newMax > currentMax) {
            // Add new entries
            for (let i = currentMax + 1; i <= newMax; i++) {
                const newEntry = JSON.parse(JSON.stringify(template));
                newEntry.id = i;
                newEntry.name = '';
                this.data[dataKey][i] = newEntry;
            }
        } else if (newMax < currentMax) {
            // Truncate array
            this.data[dataKey].length = newMax + 1;
        }

        return true;
    }

    async saveAllData(projectPath) {
        if (!this.fs || !this.path) return false;

        const failed = [];
        for (const [key, filename] of this.dataFiles) {
            if (!await this.saveJSON(projectPath, filename, this.data[key])) {
                failed.push(filename);
            }
        }
        if (failed.length) console.error(`Failed to save database files: ${failed.join(', ')}`);
        return failed.length === 0;
    }
}
