/**
 * DatabaseCommonUI - Shared utilities for database editors
 * Contains common functions used across multiple database editor modules
 */
class DatabaseCommonUI {
    constructor(databaseManager, projectManager) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.currentProject = projectManager.getCurrentProject();
    }

    /**
     * Get trait name from trait code
     */
    getTraitName(traitCode) {
        const traitNames = {
            11: 'Element Rate', 12: 'Debuff Rate', 13: 'State Rate', 14: 'State Resist',
            21: 'Parameter', 22: 'Ex-Parameter', 23: 'Sp-Parameter',
            31: 'Attack Element', 32: 'Attack State', 33: 'Attack Speed', 34: 'Attack Times+',
            41: 'Add Skill Type', 42: 'Seal Skill Type', 43: 'Add Skill', 44: 'Seal Skill',
            51: 'Equip Weapon', 52: 'Equip Armor', 53: 'Lock Equip', 54: 'Seal Equip', 55: 'Slot Type',
            61: 'Action Times+', 62: 'Special Flag', 63: 'Collapse Effect', 64: 'Party Ability'
        };
        return traitNames[traitCode] || `Trait ${traitCode}`;
    }

    /**
     * Get formatted trait value based on trait type
     */
    getTraitValue(trait) {
        if (trait.code === 21) { // Parameter
            const params = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
            const change = Math.round((trait.value - 1) * 100);
            return `${params[trait.dataId] || 'Param'} ${change >= 0 ? '+' : ''}${change}%`;
        } else if (trait.code === 22) { // Ex-Parameter
            const exParams = ['Hit Rate', 'Evasion', 'Critical Rate', 'Critical Evade', 'Magic Evade', 'Magic Reflect', 'Counter', 'HP Regen', 'MP Regen', 'TP Regen'];
            return `${exParams[trait.dataId] || 'ExParam'} +${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 23) { // Sp-Parameter
            const spParams = ['Target Rate', 'Guard Rate', 'Recovery Rate', 'Pharmacology', 'MP Cost Rate', 'TP Charge Rate', 'Physical Damage', 'Magical Damage', 'Floor Damage', 'Experience'];
            return `${spParams[trait.dataId] || 'SpParam'} ${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 11) { // Element Rate
            const elements = this.databaseManager.getSystem()?.elements || [];
            const elementName = elements[trait.dataId] || `Element ${trait.dataId}`;
            return `${elementName} ${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 12) { // Debuff Rate
            const params = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
            return `${params[trait.dataId] || 'Param'} Debuff ${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 13) { // State Rate
            const state = this.databaseManager.getState(trait.dataId);
            const stateName = state ? state.name : `State ${trait.dataId}`;
            return `${stateName} ${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 14) { // State Resist
            const state = this.databaseManager.getState(trait.dataId);
            const stateName = state ? state.name : `State ${trait.dataId}`;
            return `Resist ${stateName}`;
        } else if (trait.code === 31) { // Attack Element
            const elements = this.databaseManager.getSystem()?.elements || [];
            const elementName = elements[trait.dataId] || `Element ${trait.dataId}`;
            return `Attack Element: ${elementName}`;
        } else if (trait.code === 32) { // Attack State
            const state = this.databaseManager.getState(trait.dataId);
            const stateName = state ? state.name : `State ${trait.dataId}`;
            return `${stateName} ${Math.round(trait.value * 100)}% chance`;
        } else if (trait.code === 33) { // Attack Speed
            return `Attack Speed ${trait.value >= 0 ? '+' : ''}${trait.value}`;
        } else if (trait.code === 34) { // Attack Times
            return `Attack Times +${trait.value}`;
        } else if (trait.code === 41 || trait.code === 42) { // Skill Type Add/Seal
            const skillTypes = this.databaseManager.getSystem()?.skillTypes || [];
            const skillTypeName = skillTypes[trait.dataId] || `Skill Type ${trait.dataId}`;
            return trait.code === 41 ? `Add ${skillTypeName}` : `Seal ${skillTypeName}`;
        } else if (trait.code === 43 || trait.code === 44) { // Skill Add/Seal
            const skill = this.databaseManager.getSkill(trait.dataId);
            const skillName = skill ? skill.name : `Skill ${trait.dataId}`;
            return trait.code === 43 ? `Add ${skillName}` : `Seal ${skillName}`;
        } else if (trait.code === 51 || trait.code === 52) { // Weapon/Armor Type Equip
            if (trait.code === 51) {
                const weaponTypes = this.databaseManager.getSystem()?.weaponTypes || [];
                const weaponTypeName = weaponTypes[trait.dataId] || `Weapon Type ${trait.dataId}`;
                return `Equip ${weaponTypeName}`;
            } else {
                const armorTypes = this.databaseManager.getSystem()?.armorTypes || [];
                const armorTypeName = armorTypes[trait.dataId] || `Armor Type ${trait.dataId}`;
                return `Equip ${armorTypeName}`;
            }
        } else if (trait.code === 53) { // Lock Equip
            const equipTypes = this.databaseManager.getSystem()?.equipTypes || [];
            const equipTypeName = equipTypes[trait.dataId] || `Equip ${trait.dataId}`;
            return `Lock ${equipTypeName}`;
        } else if (trait.code === 54) { // Seal Equip
            const equipTypes = this.databaseManager.getSystem()?.equipTypes || [];
            const equipTypeName = equipTypes[trait.dataId] || `Equip ${trait.dataId}`;
            return `Seal ${equipTypeName}`;
        } else if (trait.code === 55) { // Slot Type
            return trait.dataId === 0 ? 'Normal Slot' : 'Dual Wield';
        } else if (trait.code === 61) { // Action Times
            return `Action Times +${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 62) { // Special Flag
            const flags = ['Auto Battle', 'Guard', 'Substitute', 'Preserve TP'];
            return flags[trait.dataId] || `Special Flag ${trait.dataId}`;
        } else if (trait.code === 63) { // Collapse Effect
            const effects = ['Boss Collapse', 'Instant Collapse', 'No Disappear'];
            return effects[trait.dataId] || `Collapse ${trait.dataId}`;
        } else if (trait.code === 64) { // Party Ability
            const abilities = ['Encounter Half', 'Encounter None', 'Cancel Surprise', 'Raise Preemptive', 'Gold Double', 'Drop Item Double'];
            return abilities[trait.dataId] || `Party Ability ${trait.dataId}`;
        } else {
            return `Data ${trait.dataId}, Value ${trait.value}`;
        }
    }

    /**
     * Normalize file path for file:// URLs (convert backslashes to forward slashes)
     */
    normalizeFilePath(filepath) {
        return filepath.replace(/\\/g, '/');
    }

    /**
     * Create an image path for file:// protocol
     */
    createImagePath(folder, filename) {
        const path = require('path');
        return 'file://' + this.normalizeFilePath(
            path.join(this.currentProject.path, 'img', folder, filename + '.png')
        );
    }

    /**
     * Update status message
     */
    updateStatus(message) {
        const statusBar = document.getElementById('status-bar');
        if (statusBar) {
            const statusRight = statusBar.querySelector('span:last-child');
            if (statusRight) {
                statusRight.textContent = message;
            }
        }
    }
}
