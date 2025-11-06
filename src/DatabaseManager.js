// RPG Reactor - Database Manager
// Handles loading and managing all database JSON files

class DatabaseManager {
    constructor() {
        this.fs = null;
        this.path = null;

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
        if (typeof nw !== 'undefined') {
            this.fs = require('fs');
            this.path = require('path');
        }
    }

    async loadAllData(projectPath) {
        if (!this.fs || !this.path) {
            console.error('File system not available');
            return false;
        }

        try {
            const dataPath = this.path.join(projectPath, 'data');
            console.log('Loading database from:', dataPath);

            // Load all database files
            this.data.actors = await this.loadJSON(dataPath, 'Actors.json');
            this.data.classes = await this.loadJSON(dataPath, 'Classes.json');
            this.data.skills = await this.loadJSON(dataPath, 'Skills.json');
            this.data.items = await this.loadJSON(dataPath, 'Items.json');
            this.data.weapons = await this.loadJSON(dataPath, 'Weapons.json');
            this.data.armors = await this.loadJSON(dataPath, 'Armors.json');
            this.data.enemies = await this.loadJSON(dataPath, 'Enemies.json');
            this.data.troops = await this.loadJSON(dataPath, 'Troops.json');
            this.data.states = await this.loadJSON(dataPath, 'States.json');
            this.data.animations = await this.loadJSON(dataPath, 'Animations.json');
            this.data.tilesets = await this.loadJSON(dataPath, 'Tilesets.json');
            this.data.commonEvents = await this.loadJSON(dataPath, 'CommonEvents.json');
            this.data.system = await this.loadJSON(dataPath, 'System.json');
            this.data.mapInfos = await this.loadJSON(dataPath, 'MapInfos.json');

            console.log('Database loaded successfully!');
            console.log('Actors:', this.data.actors.filter(a => a).length);
            console.log('Classes:', this.data.classes.filter(c => c).length);
            console.log('Skills:', this.data.skills.filter(s => s).length);
            console.log('Items:', this.data.items.filter(i => i).length);
            console.log('Weapons:', this.data.weapons.filter(w => w).length);
            console.log('Armors:', this.data.armors.filter(a => a).length);

            return true;
        } catch (error) {
            console.error('Error loading database:', error);
            return false;
        }
    }

    async loadJSON(basePath, filename) {
        const filePath = this.path.join(basePath, filename);

        if (!this.fs.existsSync(filePath)) {
            console.warn(`File not found: ${filename}`);
            return filename === 'System.json' ? {} : [];
        }

        try {
            const content = this.fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`Error loading ${filename}:`, error);
            return filename === 'System.json' ? {} : [];
        }
    }

    async saveJSON(projectPath, filename, data) {
        if (!this.fs || !this.path) {
            console.error('File system not available');
            return false;
        }

        try {
            const dataPath = this.path.join(projectPath, 'data');
            const filePath = this.path.join(dataPath, filename);

            this.fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log(`Saved ${filename}`);
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

    // Add more update methods as needed...

    async saveAllData(projectPath) {
        if (!this.fs || !this.path) return false;

        try {
            await this.saveJSON(projectPath, 'Actors.json', this.data.actors);
            await this.saveJSON(projectPath, 'Classes.json', this.data.classes);
            await this.saveJSON(projectPath, 'Skills.json', this.data.skills);
            await this.saveJSON(projectPath, 'Items.json', this.data.items);
            await this.saveJSON(projectPath, 'Weapons.json', this.data.weapons);
            await this.saveJSON(projectPath, 'Armors.json', this.data.armors);
            await this.saveJSON(projectPath, 'Enemies.json', this.data.enemies);
            await this.saveJSON(projectPath, 'Troops.json', this.data.troops);
            await this.saveJSON(projectPath, 'States.json', this.data.states);
            await this.saveJSON(projectPath, 'Animations.json', this.data.animations);
            await this.saveJSON(projectPath, 'Tilesets.json', this.data.tilesets);
            await this.saveJSON(projectPath, 'CommonEvents.json', this.data.commonEvents);
            await this.saveJSON(projectPath, 'System.json', this.data.system);
            await this.saveJSON(projectPath, 'MapInfos.json', this.data.mapInfos);

            console.log('All database files saved successfully!');
            return true;
        } catch (error) {
            console.error('Error saving database:', error);
            return false;
        }
    }
}
