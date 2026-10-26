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

    static get ENCRYPTION_KEY() { return 'rpg-reactor.deployEncryption'; }

    static normalizeEncryption(value) {
        return {
            images: !!(value && value.images),
            audio: !!(value && value.audio),
            keyText: value && typeof value.keyText === 'string' ? value.keyText.trim().slice(0, 256) : '',
        };
    }

    static loadEncryption(storage = localStorage) {
        try { return this.normalizeEncryption(JSON.parse(storage.getItem(this.ENCRYPTION_KEY))); }
        catch { return this.normalizeEncryption(null); }
    }

    static saveEncryption(value, storage = localStorage) {
        try {
            // The key is a game's own: it is never carried over to another project's deploy.
            const { images, audio } = this.normalizeEncryption(value);
            storage.setItem(this.ENCRYPTION_KEY, JSON.stringify({ images, audio }));
            return true;
        } catch {
            return false;
        }
    }

    static get UNUSED_FILES_KEY() { return 'rpg-reactor.deployUnusedFiles'; }

    /** The editor's own distribution remembers its choice for each kind of package (web, platform, minimal). */
    static distUnusedFilesKey(packageType) { return 'rpg-reactor.distUnusedFiles.' + (packageType || 'platform'); }

    /**
     * Don't bundle unused files: on or off, `fallback` until chosen. A choice saved by the earlier
     * dropdown carries over: "every build" is on, "nothing" off, "Web builds" the fallback.
     */
    static loadUnusedFiles(storage = localStorage, key = this.UNUSED_FILES_KEY, fallback = false) {
        try {
            const value = storage.getItem(key);
            if (value === '1' || value === 'all') return true;
            if (value === '0' || value === 'off') return false;
            return !!fallback;
        } catch { return !!fallback; }
    }

    static saveUnusedFiles(on, storage = localStorage, key = this.UNUSED_FILES_KEY) {
        try { storage.setItem(key, on ? '1' : '0'); return true; }
        catch { return false; }
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
