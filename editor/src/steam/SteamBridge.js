/**
 * RPG Reactor's link to Steam: achievements and the Workshop, through steamworks.js (a Node-API addon with Valve's
 * steam_api library beside it, in node_modules/steamworks.js).
 *
 * It wakes only under NW.js and only when Steam launched the editor (Steam sets SteamAppId for what it starts), or
 * with RR_STEAM=1 for a developer run with the Steam client open. Everywhere else (the web editor, the release zips
 * run on their own, tests) every call answers "not available" and nothing is loaded. It never calls
 * RestartAppIfNecessary: the same editor ships outside Steam, and must open there without it.
 */
(function(root) {
    'use strict';
    const APP_ID = 4817110;
    const WORKSHOP_LEGAL = 'https://steamcommunity.com/sharedfiles/workshoplegalagreement';
    const VISIBILITY = { public: 0, friends: 1, private: 2, unlisted: 3 };
    let client = null, why = '', tried = false;

    /** Steam started this editor (or a developer asked for Steam with RR_STEAM=1; RR_STEAM=0 turns it off). */
    function launchedBySteam(env) {
        const e = env || (typeof process !== 'undefined' && process.env) || {};
        if (e.RR_STEAM === '0') return false;
        return e.RR_STEAM === '1' || String(e.SteamAppId || '') === String(APP_ID) || String(e.SteamGameId || '') === String(APP_ID);
    }

    function init() {
        if (tried) return client;
        tried = true;
        if (typeof require !== 'function' || typeof nw === 'undefined') { why = 'not-desktop'; return null; }
        if (!launchedBySteam()) { why = 'not-steam'; return null; }
        try {
            client = require('steamworks.js').init(APP_ID);
            why = '';
        } catch (error) {
            // Steam isn't running, the account doesn't own the app, or the addon is missing from this build.
            client = null; why = 'init-failed';
            console.warn('[Steam] could not connect:', error && error.message);
        }
        return client;
    }

    function need() {
        const c = init();
        if (!c) throw new Error('Steam is not available.');
        return c;
    }

    /** A steam:// link opens in the Steam client; without Steam the same page opens in the browser. */
    function open(steamUrl, webUrl) {
        const url = init() ? steamUrl : webUrl;
        if (typeof nw !== 'undefined' && nw.Shell && nw.Shell.openExternal) nw.Shell.openExternal(url);
        else if (typeof window !== 'undefined' && window.open) window.open(webUrl, '_blank', 'noopener');
    }

    const api = {
        APP_ID, WORKSHOP_LEGAL, VISIBILITY, launchedBySteam,

        available() { return !!init(); },
        /** Why Steam isn't available: 'not-desktop', 'not-steam', 'init-failed', or '' when it is. */
        reason() { init(); return why; },
        playerName() { try { return init() ? client.localplayer.getName() : ''; } catch (_) { return ''; } },

        /** Unlock an achievement by its API name. Answers whether Steam has it unlocked. */
        unlock(name) {
            const c = init();
            if (!c) return false;
            try { return c.achievement.isActivated(name) || c.achievement.activate(name); } catch (error) { console.warn('[Steam] achievement', name, error && error.message); return false; }
        },

        /**
         * Create (when no itemId) and upload a Workshop item. `onCreated(id)` hears the new item's id before the
         * upload starts, so a failed upload can be retried as an update instead of leaving an empty item behind.
         * Answers { itemId, needsAgreement }: needsAgreement means the author hasn't accepted the Workshop terms,
         * and the item stays hidden until they do.
         */
        async publish(details, { onCreated, onProgress } = {}) {
            const c = need();
            let id = details.itemId ? BigInt(details.itemId) : null, agreement = false;
            if (id === null) {
                const made = await c.workshop.createItem(APP_ID);
                id = made.itemId; agreement = !!made.needsToAcceptAgreement;
                if (onCreated) onCreated(String(id));
            }
            const update = {};
            for (const key of ['title', 'description', 'changeNote', 'contentPath', 'previewPath', 'tags']) if (details[key]) update[key] = details[key];
            if (details.visibility in VISIBILITY) update.visibility = VISIBILITY[details.visibility];
            const done = await new Promise((resolve, reject) => c.workshop.updateItemWithCallback(id, update, APP_ID, resolve, reject,
                progress => { if (onProgress) onProgress({ status: progress.status, done: Number(progress.progress), total: Number(progress.total) }); }, 250));
            return { itemId: String(id), needsAgreement: agreement || !!(done && done.needsToAcceptAgreement) };
        },

        /** The items this account subscribes to: { id, installed, folder, downloading }. */
        subscribed() {
            const c = need();
            return c.workshop.getSubscribedItems().map(id => {
                const state = c.workshop.state(id), info = c.workshop.installInfo(id);
                // EItemState: 4 installed, 8 needs update, 16 downloading, 32 download pending.
                return { id: String(id), installed: !!(state & 4) && !!info, folder: info ? info.folder : '', downloading: !!(state & 48) };
            });
        },

        /** Titles, tags and preview links of items, by id: { [id]: { title, tags, previewUrl, owner } }. */
        async details(ids) {
            const c = need(), out = {};
            if (!ids.length) return out;
            const result = await c.workshop.getItems(ids.map(id => BigInt(id)), { includeLongDescription: false });
            for (const item of result.items || []) {
                if (item) out[String(item.publishedFileId)] = { title: item.title, tags: item.tags || [], previewUrl: item.previewUrl || '', description: item.description || '' };
            }
            return out;
        },

        download(id) { try { return need().workshop.download(BigInt(id), true); } catch (_) { return false; } },
        async subscribe(id) { await need().workshop.subscribe(BigInt(id)); },
        async unsubscribe(id) { await need().workshop.unsubscribe(BigInt(id)); },

        openWorkshop() { open('steam://url/SteamWorkshopPage/' + APP_ID, `https://steamcommunity.com/app/${APP_ID}/workshop/`); },
        openItem(id) { open('steam://url/CommunityFilePage/' + id, `https://steamcommunity.com/sharedfiles/filedetails/?id=${encodeURIComponent(id)}`); },
        /** The Workshop terms: a web page, opened in the Steam client's browser when Steam is there. */
        openAgreement() { open('steam://openurl/' + WORKSHOP_LEGAL, WORKSHOP_LEGAL); }
    };

    root.RRSteam = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
