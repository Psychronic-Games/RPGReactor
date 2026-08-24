class DeploymentAssetPreferences {
    static get STORAGE_KEY() { return 'rpg-reactor.deployAssetOptimization'; }

    static normalize(value) {
        const rawQuality = value && (value.audioQuality ?? value.oggQuality);
        const quality = rawQuality !== '' && rawQuality != null ? Number(rawQuality) : NaN;
        const boundedQuality = Number.isFinite(quality) ? Math.max(0, Math.min(10, Math.round(quality))) : 5;
        const qualityChoices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        return {
            png: !!(value && value.png),
            pngLevel: 3,
            // Accepts the pre-multi-format keys (ogg/oggQuality) so an old
            // saved preference keeps its quality choice.
            audio: !!(value && (value.audio ?? value.ogg)),
            audioQuality: qualityChoices.reduce((closest, choice) =>
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
