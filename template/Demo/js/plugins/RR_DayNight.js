/*:
 * @target Reactor
 * @plugindesc Day and night on 3D maps: an in-game clock moves the ambient light, and tagged lamps light up at night.
 * @author Psychronic
 * @url https://psychronic.itch.io/rpg-reactor
 *
 * @param hourVariable
 * @text Hour Variable
 * @desc The variable that holds the hour (0 to 23). Events can read it and set it.
 * @type variable
 * @default 0
 *
 * @param secondsPerHour
 * @text Seconds per Hour
 * @desc How many real seconds one game hour lasts while the player is on a map. 0 stops the clock.
 * @type number
 * @min 0
 * @default 60
 *
 * @param startHour
 * @text Starting Hour
 * @type number
 * @min 0
 * @max 23
 * @default 8
 *
 * @param lampTag
 * @text Lamp Tag
 * @desc Lights with this tag (the Lighting tool's #tag) come on at night and go off by day. Empty: none.
 * @default village
 *
 * @param nightStart
 * @text Night Starts
 * @type number
 * @min 0
 * @max 23
 * @default 19
 *
 * @param nightEnd
 * @text Night Ends
 * @type number
 * @min 0
 * @max 23
 * @default 6
 *
 * @command SetHour
 * @text Set Hour
 * @desc Jump the clock to an hour (the light eases there).
 * @arg hour
 * @type number
 * @min 0
 * @max 23
 * @default 12
 *
 * @command PauseClock
 * @text Pause Clock
 *
 * @command ResumeClock
 * @text Resume Clock
 *
 * @help
 * RR_DayNight.js - an example of a plugin that only RPG Reactor can run.
 *
 * It uses Reactor's 3D lighting (Reactor3D.setMapAmbient and
 * Reactor3D.switchLight), which RPG Maker MZ and MV do not have: under them it
 * does nothing and says so in the console (F8). Under RPG Reactor, on a map
 * with 3D on, the light goes from night blue to dawn, day, dusk and night
 * again as the clock runs, and the lamps tagged with the Lamp Tag (in the
 * editor's Lighting tool, a light named "lamp #village" has the tag village)
 * come on at night.
 *
 * The clock is saved with the game. Plugin commands: Set Hour, Pause Clock,
 * Resume Clock. The guide: docs/PLUGIN-DEVELOPMENT.md in RPG Reactor.
 */
(() => {
    'use strict';
    const NAME = 'RR_DayNight';
    const params = PluginManager.parameters(NAME);
    const hourVariable = Number(params.hourVariable) || 0;
    const secondsPerHour = Math.max(0, Number(params.secondsPerHour) || 0);
    const startHour = Math.max(0, Math.min(23, Number(params.startHour) || 0));
    const lampTag = String(params.lampTag || '').trim().replace(/^#/, '');
    const nightStart = Number(params.nightStart) || 19;
    const nightEnd = Number(params.nightEnd) || 6;

    // RPG Reactor's 3D lighting is what this plugin drives: without it, it is an inert file.
    const reactor = typeof Reactor3D !== 'undefined' && typeof Reactor3D.setMapAmbient === 'function';
    if (!reactor) {
        console.warn(`${NAME}: this plugin needs RPG Reactor's 3D lighting; it does nothing in RPG Maker MZ or MV.`);
        return;
    }

    // The light at each hour: how bright, and what colour.
    const KEYS = [
        [0, 0.18, '#5a6cff'], [5, 0.22, '#6b74e0'], [6, 0.5, '#ffb27a'], [8, 0.85, '#fff1d8'],
        [12, 1.0, '#ffffff'], [17, 0.85, '#ffe2b8'], [19, 0.5, '#ff9a6b'], [21, 0.25, '#7080ff'], [24, 0.18, '#5a6cff']
    ];
    const hex = n => Math.round(n).toString(16).padStart(2, '0');
    const mix = (a, b, t) => {
        const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
        const ch = (p, s) => (p >> s) & 255;
        return '#' + [16, 8, 0].map(s => hex(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t)).join('');
    };
    function lightAt(time) {
        for (let i = 0; i < KEYS.length - 1; i++) {
            const [h0, i0, c0] = KEYS[i], [h1, i1, c1] = KEYS[i + 1];
            if (time >= h0 && time <= h1) {
                const t = (time - h0) / (h1 - h0);
                return { intensity: i0 + (i1 - i0) * t, color: mix(c0, c1, t) };
            }
        }
        return { intensity: 1, color: '#ffffff' };
    }
    const isNight = hour => (nightStart > nightEnd ? hour >= nightStart || hour < nightEnd : hour >= nightStart && hour < nightEnd);

    // The clock lives in Game_System, so it is saved and loaded with the game.
    const clock = () => {
        const sys = $gameSystem;
        if (!sys._rrDayNight) sys._rrDayNight = { time: startHour, paused: false, lamps: null };
        return sys._rrDayNight;
    };

    function apply(ease) {
        const state = clock();
        const hour = Math.floor(state.time) % 24;
        if (hourVariable > 0 && $gameVariables.value(hourVariable) !== hour) $gameVariables.setValue(hourVariable, hour);
        Reactor3D.setMapAmbient(lightAt(state.time), ease);
        const night = isNight(hour);
        if (lampTag && state.lamps !== night) {
            state.lamps = night;
            Reactor3D.switchLight('#' + lampTag, night ? 'on' : 'off');
        }
    }

    // On each map: the light of the hour at once, then a small ease each game minute.
    const _start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _start.apply(this, arguments);
        clock().lamps = null;
        apply(0);
    };
    const _update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _update.apply(this, arguments);
        const state = clock();
        if (state.paused || !secondsPerHour || !this.isActive()) return;
        // An event that set the hour variable moves the clock there.
        if (hourVariable > 0) {
            const set = $gameVariables.value(hourVariable);
            if (set !== Math.floor(state.time) % 24 && set >= 0 && set < 24) state.time = set;
        }
        const before = Math.floor(state.time * 60);
        state.time = (state.time + 1 / (60 * secondsPerHour)) % 24;
        if (Math.floor(state.time * 60) !== before) apply(30);
    };

    PluginManager.registerCommand(NAME, 'SetHour', args => {
        clock().time = Math.max(0, Math.min(23, Number(args.hour) || 0));
        apply(90);
    });
    PluginManager.registerCommand(NAME, 'PauseClock', () => { clock().paused = true; });
    PluginManager.registerCommand(NAME, 'ResumeClock', () => { clock().paused = false; });
})();
