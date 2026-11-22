//=============================================================================
// reactor_steam.js - Steam for games made with RPG Reactor
//
// Off unless the project set it up on Database > System 2 > Steam
// (data/ReactorSteam.json): its own Steam App ID. Achievements are made in
// Steamworks > Stats & Achievements and unlocked by the event command Steam
// Achievement, by API name. Nothing here is RPG Reactor's own Steam app.
//
//   ReactorSteam.available()                  Steam is running for this game
//   ReactorSteam.unlock(apiName)              unlock an achievement
//   ReactorSteam.clear(apiName)               lock it again (for testing)
//   ReactorSteam.isUnlocked(apiName)
//   ReactorSteam.stat(name) / setStat(name, value)   integer stats
//
// Plugin command (plugin "RPGReactor"): SteamAchievement { api, action:
// "unlock" | "clear" } - the event editor offers it under Reactor > Game Flow.
//
// Steam is reached through steamworks.js (node_modules/steamworks.js, put in
// a desktop build by the editor when the project uses Steam). A browser game,
// a game started without Steam running, or a playtest (unless "Use Steam in
// playtests" is on) carries on without it: every call does nothing, and an
// achievement only notes itself in the console.
//=============================================================================

(function() {
    "use strict";

    const ReactorSteam = {};
    window.ReactorSteam = ReactorSteam;
    ReactorSteam.DATA_URL = "data/ReactorSteam.json";
    ReactorSteam.config = null;
    ReactorSteam.client = null;
    ReactorSteam.reason = "not loaded";

    /** The project's settings, with every field present; null when it never set up Steam. */
    ReactorSteam.settings = function(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const appId = Math.floor(Number(raw.appId));
        return {
            enabled: raw.enabled === true && appId > 0,
            appId: appId > 0 ? appId : 0,
            playtest: raw.playtest === true,
            requireSteam: raw.requireSteam === true
        };
    };

    ReactorSteam.isPlaytest = function() {
        return typeof Utils !== "undefined" && (Utils.isOptionValid("test") || Utils.isOptionValid("btest") || Utils.isOptionValid("etest"));
    };

    /** Where steamworks.js is: in the game, or (a playtest) where the editor said. */
    ReactorSteam.modulePath = function() {
        const env = (typeof process !== "undefined" && process.env) || {};
        if (ReactorSteam.isPlaytest() && env.RR_STEAMWORKS) return env.RR_STEAMWORKS;
        return "steamworks.js";
    };

    /** Connect to Steam once the settings are in; answers whether it did. */
    ReactorSteam.start = function(config) {
        ReactorSteam.config = config;
        ReactorSteam.client = null;
        if (!config || !config.enabled) { ReactorSteam.reason = "off"; return false; }
        if (typeof Utils === "undefined" || !Utils.isNwjs() || typeof require !== "function") { ReactorSteam.reason = "not desktop"; return false; }
        if (ReactorSteam.isPlaytest() && !config.playtest) { ReactorSteam.reason = "playtest"; return false; }
        let steamworks;
        try { steamworks = require(ReactorSteam.modulePath()); } catch (error) { ReactorSteam.reason = "no steamworks.js"; console.warn("[Steam] steamworks.js is not in this build:", error.message); return false; }
        // Started outside Steam: hand over to Steam, which starts the game again (the setting "Start through Steam").
        if (config.requireSteam && !ReactorSteam.isPlaytest()) {
            try {
                if (steamworks.restartAppIfNecessary(config.appId)) { ReactorSteam.reason = "restarting through Steam"; nw.App.quit(); return false; }
            } catch (error) { console.warn("[Steam] restart check:", error.message); }
        }
        try {
            ReactorSteam.client = steamworks.init(config.appId);
            ReactorSteam.reason = "";
        } catch (error) {
            // Steam isn't running, or this account doesn't own the game: play on without it.
            ReactorSteam.reason = "not connected";
            console.warn("[Steam] could not connect:", error.message);
            return false;
        }
        return true;
    };

    ReactorSteam.available = function() { return !!ReactorSteam.client; };

    ReactorSteam.unlock = function(api) {
        if (!api || !/^[A-Za-z0-9_.-]{1,128}$/.test(api)) return false;
        const client = ReactorSteam.client;
        if (!client) { console.log("[Steam] achievement " + api + " (Steam not connected: " + ReactorSteam.reason + ")"); return false; }
        try { return client.achievement.isActivated(api) || client.achievement.activate(api); }
        catch (error) { console.warn("[Steam] achievement " + api + ":", error.message); return false; }
    };

    ReactorSteam.clear = function(api) {
        const client = ReactorSteam.client;
        if (!client || !api) return false;
        try { return client.achievement.clear(api); } catch (error) { console.warn("[Steam] clear " + api + ":", error.message); return false; }
    };

    ReactorSteam.isUnlocked = function(api) {
        const client = ReactorSteam.client;
        if (!client || !api) return false;
        try { return client.achievement.isActivated(api); } catch (error) { return false; }
    };

    ReactorSteam.stat = function(name) {
        const client = ReactorSteam.client;
        if (!client || !name) return null;
        try { return client.stats.getInt(name); } catch (error) { return null; }
    };

    ReactorSteam.setStat = function(name, value) {
        const client = ReactorSteam.client;
        if (!client || !name) return false;
        try { return client.stats.setInt(name, Math.floor(Number(value)) || 0) && client.stats.store(); }
        catch (error) { console.warn("[Steam] stat " + name + ":", error.message); return false; }
    };

    //-------------------------------------------------------------------------
    // Data

    ReactorSteam.load = function() {
        if (ReactorSteam._loading) return;
        ReactorSteam._loading = true;
        const xhr = new XMLHttpRequest();
        xhr.open("GET", ReactorSteam.DATA_URL);
        xhr.overrideMimeType("application/json");
        xhr.onload = () => {
            let raw = null;
            if (xhr.status < 400) { try { raw = JSON.parse(xhr.responseText); } catch (error) { raw = null; } }
            ReactorSteam.start(ReactorSteam.settings(raw));
        };
        xhr.onerror = () => ReactorSteam.start(null);
        xhr.send();
    };

    //-------------------------------------------------------------------------
    // Event command

    PluginManager.registerCommand("RPGReactor", "SteamAchievement", function(args) {
        const api = String((args && args.api) || "").trim();
        if (String((args && args.action) || "unlock") === "clear") ReactorSteam.clear(api);
        else ReactorSteam.unlock(api);
    });

    ReactorSteam.load();
})();
