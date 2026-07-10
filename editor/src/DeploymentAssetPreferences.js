class DeploymentAssetPreferences {
    static get STORAGE_KEY() { return 'rpg-reactor.deployAssetOptimization'; }

    static normalize(value) {
        const quality = value && value.oggQuality !== '' && value.oggQuality != null
            ? Number(value.oggQuality)
            : NaN;
        const boundedQuality = Number.isFinite(quality) ? Math.max(0, Math.min(10, Math.round(quality))) : 5;
        const qualityChoices = [3, 5, 7, 10];
        return {
            png: !!(value && value.png),
            pngLevel: 3,
            ogg: !!(value && value.ogg),
            oggQuality: qualityChoices.reduce((closest, choice) =>
                Math.abs(choice - boundedQuality) < Math.abs(closest - boundedQuality) ? choice : closest, 5),
        };
    }

    static load(storage = localStorage) {
        try { return this.normalize(JSON.parse(storage.getItem(this.STORAGE_KEY))); }
        catch { return this.normalize(null); }
    }

    static save(value, storage = localStorage) {
        try {
            storage.setItem(this.STORAGE_KEY, JSON.stringify(this.normalize(value)));
            return true;
        } catch {
            return false;
        }
    }
}

if (typeof window !== 'undefined') window.DeploymentAssetPreferences = DeploymentAssetPreferences;
if (typeof module !== 'undefined' && module.exports) module.exports = DeploymentAssetPreferences;
