/*:
 * @target MZ
 * @plugindesc Woratana's Multiple Fog (VX), for imported games
 * @author Woratana; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 * @base RR_ShazMultiFog
 * @orderAfter RR_ShazMultiFog
 *
 * @help RR_WoraFog.js
 *
 * The script's calls, as the importer translates them: set up a fog on
 * $gameTemp.rrWoraFog() (id, name, opacity, blend, ox, oy, zoom, tone),
 * then show() it; opacity/blend/speed/speedPlus/zoom/tone(id, …),
 * delete(id) and clear() change fogs already shown. Fogs are drawn by
 * RR_ShazMultiFog (numbered by id, images from img/pictures), which must be
 * on and above this plugin. The staging settings return to the defaults
 * below after each show, as the script's did.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script. Turning it off leaves the calls doing nothing.
 *
 * @param name
 * @text Default image
 * @default
 * @param opacity
 * @text Default opacity
 * @type number
 * @default 100
 * @param ox
 * @text Default horizontal speed
 * @type number
 * @min -99
 * @default 1
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_WoraFog');
    const DEFAULTS = { id: 1, name: String(params.name || ''), opacity: Number(params.opacity || 100), blend: 0, ox: Number(params.ox || 1), oy: 0, zoom: 100, tone: [0, 0, 0, 0] };
    // The script moved a fog's origin by ox pixels a frame; RR_ShazMultiFog drifts by -sx/8.
    const SPEED = -8;
    // It stored the zoom as an integer division (size / 100): 150% drew at 100%.
    const zoomOf = (size) => Math.floor(Number(size) / 100) * 100;

    function WoraFog() { Object.assign(this, DEFAULTS, { tone: DEFAULTS.tone.slice() }); }
    const screen = () => $gameScreen;
    const fog = (id) => screen().rrFogs && screen().rrFogs()[Number(id)];
    WoraFog.prototype.show = function() {
        if (!screen().rrShowFog) return;
        screen().rrShowFog(Number(this.id), String(this.name), 0, Number(this.opacity), Number(this.blend), zoomOf(this.zoom), Number(this.ox) * SPEED, Number(this.oy) * SPEED, 200);
        if (this.tone && this.tone.some(Boolean)) screen().rrTintFog(Number(this.id), ...this.tone.map(Number), 0);
        Object.assign(this, new WoraFog());
    };
    WoraFog.prototype.setOpacity = function(id, opacity = 255) { const f = fog(id); if (f) { f.opacity = f.opacityTarget = Number(opacity); f.opacityDuration = 0; } };
    WoraFog.prototype.setBlend = function(id, blend = 0) { const f = fog(id); if (f) f.blendType = Number(blend); };
    WoraFog.prototype.speed = function(id, ox = 0, oy = 0) { const f = fog(id); if (f) { f.sx = Number(ox) * SPEED; f.sy = Number(oy) * SPEED; } };
    WoraFog.prototype.speedPlus = function(id, ox = 0, oy = 0) { const f = fog(id); if (f) { f.sx += Number(ox) * SPEED; f.sy += Number(oy) * SPEED; } };
    WoraFog.prototype.setZoom = function(id, size = 100) { const f = fog(id); if (f) f.zoom = zoomOf(size); };
    WoraFog.prototype.setTone = function(id, tone = [0, 0, 0, 0]) { if (screen().rrTintFog) screen().rrTintFog(Number(id), ...tone.map(Number), 0); };
    WoraFog.prototype.delete = function(id) { if (screen().rrEraseFog) screen().rrEraseFog(Number(id)); };
    WoraFog.prototype.clear = function() { if (screen().rrFogs) screen()._rrFogs = []; };

    /** The script's $fog: settings staged for the next show(). Not saved, as it was not. */
    Game_Temp.prototype.rrWoraFog = function() {
        if (!this._rrWoraFog) this._rrWoraFog = new WoraFog();
        return this._rrWoraFog;
    };
})();
