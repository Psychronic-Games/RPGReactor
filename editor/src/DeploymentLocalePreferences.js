class DeploymentLocalePreferences {
    static get STORAGE_KEY() { return 'rpg-reactor.deployGameLocales'; }
    static get FALLBACK_LOCALE() { return 'en-US'; }

    static locales() {
        return [
            'af', 'am', 'ar', 'ar-XB', 'bg', 'bn', 'ca', 'cs', 'da', 'de', 'el',
            'en-GB', 'en-US', 'en-XA', 'es', 'es-419', 'et', 'fa', 'fi', 'fil',
            'fr', 'gu', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'kn', 'ko',
            'lt', 'lv', 'ml', 'mr', 'ms', 'nb', 'nl', 'pl', 'pt-BR', 'pt-PT',
            'ro', 'ru', 'sk', 'sl', 'sr', 'sv', 'sw', 'ta', 'te', 'th', 'tr',
            'uk', 'ur', 'vi', 'zh-CN', 'zh-TW',
        ];
    }

    static normalize(locales) {
        const available = new Set(this.locales());
        const selected = Array.isArray(locales) ? locales.filter(locale => available.has(locale)) : [];
        return [...new Set([this.FALLBACK_LOCALE, ...selected])];
    }

    static load(storage = localStorage) {
        try {
            const saved = JSON.parse(storage.getItem(this.STORAGE_KEY));
            if (saved && saved.mode === 'selected') {
                return { mode: 'selected', locales: this.normalize(saved.locales) };
            }
        } catch {}
        return { mode: 'all', locales: [this.FALLBACK_LOCALE] };
    }

    static save(preference, storage = localStorage) {
        const value = {
            mode: preference && preference.mode === 'selected' ? 'selected' : 'all',
            locales: this.normalize(preference && preference.locales),
        };
        try {
            storage.setItem(this.STORAGE_KEY, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }
}

if (typeof window !== 'undefined') window.DeploymentLocalePreferences = DeploymentLocalePreferences;
if (typeof module !== 'undefined' && module.exports) module.exports = DeploymentLocalePreferences;
