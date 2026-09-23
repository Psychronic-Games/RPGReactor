/*:
 * @target MZ
 * @plugindesc Shaz's Multi Layer Fog (VX Ace), for imported games
 * @author Shaz; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ShazMultiFog.js
 *
 * Script calls: show_fog(number, name, hue, opacity, blend, zoom, sx, sy, z),
 * tint_fog(number, r, g, b, gray, duration), fade_fog(number, opacity,
 * duration), erase_fog(number): numbered tiling fog planes that scroll with
 * the map and drift. z defaults to over everything on the map; a negative z
 * puts the fog over the parallax and under the tiles. Kept on $gameScreen, so
 * a save keeps them.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * below. Turning the plugin off leaves those calls doing nothing.
 *
 * @param keepOnTransfer
 * @text Keep fogs on transfer
 * @type boolean
 * @default false
 * @desc The original cleared fogs when the player changes maps unless the game set CLEAR_ON_TRANSFER = false.
 *
 * @param folder
 * @text Fog image folder
 * @default img/Fogs/
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ShazMultiFog');
    const KEEP_ON_TRANSFER = params.keepOnTransfer === 'true';
    const FOLDER = (params.folder || 'img/Fogs/').replace(/\/?$/, '/');

    Game_Screen.prototype.rrFogs = function() {
        if (!this._rrFogs) this._rrFogs = [];
        return this._rrFogs;
    };

    Game_Screen.prototype.rrShowFog = function(number, name, hue = 90, opacity = 64, blendType = 0, zoom = 200, sx = 0, sy = 0, z = null) {
        const fogs = this.rrFogs();
        fogs[number] = { number, name: String(name || ""), hue, opacity, opacityTarget: opacity, opacityDuration: 0, blendType, zoom, sx, sy, driftX: 0, driftY: 0,
            z: z === null || z === undefined ? 300 + number : z, tone: [0, 0, 0, 0], toneTarget: [0, 0, 0, 0], toneDuration: 0 };
    };

    Game_Screen.prototype.rrTintFog = function(number, red, green, blue, gray, duration) {
        const fog = this.rrFogs()[number];
        if (!fog) return;
        fog.toneTarget = [red, green, blue, gray];
        fog.toneDuration = duration;
        if (!duration) fog.tone = fog.toneTarget.slice();
    };

    Game_Screen.prototype.rrFadeFog = function(number, opacity, duration) {
        const fog = this.rrFogs()[number];
        if (!fog) return;
        fog.opacityTarget = opacity;
        fog.opacityDuration = duration;
        if (!duration) fog.opacity = opacity;
    };

    Game_Screen.prototype.rrEraseFog = function(number) {
        const fogs = this.rrFogs();
        if (fogs[number]) fogs[number] = null;
    };

    const _rrFogScreenUpdate = Game_Screen.prototype.update;
    Game_Screen.prototype.update = function() {
        _rrFogScreenUpdate.call(this);
        if (!this._rrFogs) return;
        for (const fog of this._rrFogs) {
            if (!fog) continue;
            fog.driftX -= fog.sx / 8;
            fog.driftY -= fog.sy / 8;
            if (fog.toneDuration > 0) {
                const d = fog.toneDuration--;
                fog.tone = fog.tone.map((v, i) => (v * (d - 1) + fog.toneTarget[i]) / d);
            }
            if (fog.opacityDuration > 0) {
                const d = fog.opacityDuration--;
                fog.opacity = (fog.opacity * (d - 1) + fog.opacityTarget) / d;
            }
        }
    };

    // Fogs belong to the map they were shown on unless the game said otherwise.
    const _rrFogMapSetup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        if ($gameScreen && $gameScreen._rrFogs && !KEEP_ON_TRANSFER) $gameScreen._rrFogs = [];
        _rrFogMapSetup.call(this, mapId);
    };

    Spriteset_Map.prototype.updateRrFogs = function() {
        const fogs = $gameScreen._rrFogs;
        if (!fogs && !this._rrFogPlanes) return;
        if (!this._rrFogPlanes) this._rrFogPlanes = [];
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        const count = Math.max(this._rrFogPlanes.length, fogs ? fogs.length : 0);
        for (let i = 0; i < count; i++) {
            const fog = fogs && fogs[i];
            let plane = this._rrFogPlanes[i];
            if (!fog || !fog.name) {
                if (plane) plane.visible = false;
                continue;
            }
            if (!plane) {
                plane = new TilingSprite();
                plane.move(0, 0, Graphics.width, Graphics.height);
                plane._rrColor = new ColorFilter();
                plane.filters = [plane._rrColor];
                this._rrFogPlanes[i] = plane;
            }
            const under = fog.z < 0;
            const parent = under ? this._baseSprite : this._tilemap;
            if (plane.parent !== parent) {
                if (plane.parent) plane.parent.removeChild(plane);
                if (under) parent.addChildAt(plane, parent.children.indexOf(this._parallax) + 1);
                else parent.addChild(plane);
            }
            if (plane._rrName !== fog.name) {
                plane._rrName = fog.name;
                plane.bitmap = ImageManager.loadBitmap(FOLDER, fog.name);
            }
            plane.visible = true;
            plane.z = under ? 0 : 9 + fog.z / 1000;
            const scale = (fog.zoom || 100) / 100;
            plane.scale.set(1, 1);
            if (plane.tileScale) plane.tileScale.set(scale, scale); else if (plane.tileTransform) plane.tileTransform.scale.set(scale, scale);
            plane.origin.x = $gameMap.displayX() * tw + fog.driftX;
            plane.origin.y = $gameMap.displayY() * th + fog.driftY;
            plane.opacity = fog.opacity;
            plane.blendMode = fog.blendType === 1 ? 1 : fog.blendType === 2 ? 2 : 0;
            plane._rrColor.setHue(fog.hue || 0);
            plane._rrColor.setColorTone(fog.tone);
        }
    };

    const _rrFogsSpritesetUpdate = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _rrFogsSpritesetUpdate.call(this);
        if ($gameScreen && ($gameScreen._rrFogs || this._rrFogPlanes)) this.updateRrFogs();
    };
})();
