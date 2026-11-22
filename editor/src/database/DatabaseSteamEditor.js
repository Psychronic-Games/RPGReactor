/**
 * DatabaseSteamEditor - the Steam card on Database › System 2: a game sold on Steam under the author's own Steam
 * App ID (never RPG Reactor's). Kept in data/ReactorSteam.json, which only exists once a project has set something
 * here; the game reads it in runtime/reactor_steam.js, and a desktop build of a game that uses Steam carries
 * steamworks.js.
 *
 * Achievements are made in Steamworks only; the event command Steam Achievement unlocks one by its API name. No list
 * of them is kept here (owner, 2026-11-21: listing each achievement a second time was confusing, and a page of its
 * own made the Database sidebar scroll at 1080p).
 */
class DatabaseSteamEditor {
    static DEFAULTS = Object.freeze({ enabled: false, appId: 0, playtest: false, requireSteam: false });

    constructor(databaseManager) {
        this.databaseManager = databaseManager;
    }

    /** A copy with every field present. Nothing reaches the project until something is changed. */
    settings(saved) {
        const out = { ...DatabaseSteamEditor.DEFAULTS };
        if (saved && typeof saved === 'object') {
            out.enabled = saved.enabled === true;
            const appId = Math.floor(Number(saved.appId));
            out.appId = appId > 0 ? appId : 0;
            out.playtest = saved.playtest === true;
            out.requireSteam = saved.requireSteam === true;
        }
        return out;
    }

    /** The card, wired: a change writes the whole settings object (the first one creates the project's file). */
    createSection() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const settings = this.settings(this.databaseManager.getSteamSettings());
        const row = (label, input, tip = '') => `<label class="rr-steam-field"${tip ? ` title="${esc(tip)}"` : ''}>${input}<span>${esc(label)}</span></label>`;
        const section = document.createElement('div');
        section.className = 'database-section rr-steam-card';
        section.innerHTML = `
            <div class="database-section-header" data-section-key="steam">${esc(tt('Steam'))}</div>
            <div class="database-section-content">
                ${row(tt('This game uses Steam'), `<input type="checkbox" class="system-checkbox" data-steam="enabled"${settings.enabled ? ' checked' : ''}>`)}
                <label class="rr-steam-field rr-steam-appid" title="${esc(tt('Your game\'s App ID from Steamworks, a number such as 480.'))}"><span>${esc(tt('Steam App ID'))}</span><input type="number" class="database-field-value" data-steam="appId" min="0" max="99999999" value="${settings.appId || ''}"></label>
                ${row(tt('Use Steam in playtests'), `<input type="checkbox" class="system-checkbox" data-steam="playtest"${settings.playtest ? ' checked' : ''}>`, tt('Achievements unlock on your own Steam account while you test. Steam must be running, with this game in your library.'))}
                ${row(tt('Start through Steam'), `<input type="checkbox" class="system-checkbox" data-steam="requireSteam"${settings.requireSteam ? ' checked' : ''}>`, tt('A copy started outside Steam closes and Steam starts it again. Leave this off while testing.'))}
                <div class="rr-steam-note">${esc(tt('Make achievements in Steamworks, then unlock each with the event command Steam Achievement, by its API name. Desktop builds carry what Steam needs.'))}</div>
            </div>`;
        const enable = () => section.querySelectorAll('[data-steam]:not([data-steam="enabled"])').forEach(input => { input.disabled = !settings.enabled; });
        enable();
        section.addEventListener('change', event => {
            const input = event.target.closest('[data-steam]');
            if (!input) return;
            const key = input.dataset.steam;
            if (key === 'appId') {
                const value = Math.floor(Number(input.value));
                settings.appId = Number.isFinite(value) && value > 0 ? Math.min(value, 99999999) : 0;
                input.value = settings.appId || '';
            } else settings[key] = input.checked;
            enable();
            this.databaseManager.data.steam = { ...settings };
        });
        return section;
    }
}

if (typeof window !== 'undefined') window.DatabaseSteamEditor = DatabaseSteamEditor;
if (typeof module !== 'undefined' && module.exports) module.exports = DatabaseSteamEditor;
