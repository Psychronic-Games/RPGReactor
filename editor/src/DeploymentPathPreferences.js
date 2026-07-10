class DeploymentPathPreferences {
    static key(type) {
        const keys = {
            game: 'rpg-reactor.deployGameOutputPath',
            editor: 'rpg-reactor.deployEditorOutputPath',
        };
        if (!keys[type]) throw new Error(`Unknown deployment path type: ${type}`);
        return keys[type];
    }

    static load(type, fallback, storage = localStorage) {
        try {
            const value = storage.getItem(this.key(type));
            return typeof value === 'string' && value.trim() ? value : fallback;
        } catch {
            return fallback;
        }
    }

    static save(type, value, storage = localStorage) {
        if (typeof value !== 'string' || !value.trim()) return false;
        try {
            storage.setItem(this.key(type), value);
            return true;
        } catch {
            return false;
        }
    }
}

if (typeof window !== 'undefined') window.DeploymentPathPreferences = DeploymentPathPreferences;
if (typeof module !== 'undefined' && module.exports) module.exports = DeploymentPathPreferences;
