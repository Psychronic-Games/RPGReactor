/*:
 * @target MZ
 * @plugindesc Fog Effects (VX), for imported games
 * @author Falcao; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallFog.js
 *
 * One fog over the whole screen: a picture from img/pictures tiled across
 * it, zoomed, drifting at its own speed and scrolling with the map. It sits
 * over the map and its overlays and balloons, under the weather and the
 * pictures, and the screen's tint does not reach it. The fog stays from map
 * to map until the game changes it; a new game starts without one.
 *
 * While the scroll switch is on, the fog scrolls twice as fast as the map.
 *
 * Script call (the importer translates the game's $game_map.fog(...)):
 *   $gameMap.rrFog(name, opacity, zoom, scrollX, scrollY)
 * zoom 2 doubles the picture; scrollX/Y move it 1/8 px per frame per unit
 * (left and up for positive values). An empty name or zoom 0 shows nothing.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param scrollSwitch
 * @text Double-scroll switch
 * @type switch
 * @default 28
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallFog');
    const SCROLL_SWITCH = Number(params.scrollSwitch || 0);

    // Game_Map: the fog's settings, set up once per game and kept across maps (and in saves).
    const _setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _setup.call(this, mapId);
        if (!this._rrFog) this._rrFog = { name: '', opacity: 0, zoom: 0, sx: 0, sy: 0, ox: 0, oy: 0 };
    };
    Game_Map.prototype.rrFogData = function() {
        if (!this._rrFog) this._rrFog = { name: '', opacity: 0, zoom: 0, sx: 0, sy: 0, ox: 0, oy: 0 };
        return this._rrFog;
    };
    /** $game_map.fog(name, opacity, zoom, scroll_x, scroll_y) */
    Game_Map.prototype.rrFog = function(name, opacity, zoom, sx, sy) {
        Object.assign(this.rrFogData(), { name: String(name ?? ''), opacity: Number(opacity) || 0, zoom: Number(zoom) || 0, sx: Number(sx) || 0, sy: Number(sy) || 0 });
    };
    const _update = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        _update.call(this, sceneActive);
        const fog = this.rrFogData();
        fog.ox -= fog.sx / 8;
        fog.oy -= fog.sy / 8;
    };

    // Spriteset_Map: the plane, above the map's own layers.
    const _createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
    Spriteset_Map.prototype.createLowerLayer = function() {
        _createLowerLayer.call(this);
        const plane = new TilingSprite();
        plane.move(0, 0, Graphics.width, Graphics.height);
        const anchor = this._rrThrallBalloons || this._rrUomLayer || this._baseSprite;
        this.addChildAt(plane, this.children.indexOf(anchor) + 1);
        this._rrFogPlane = plane;
        this._rrFogName = '';
        this.rrUpdateFog();
    };
    Spriteset_Map.prototype.rrUpdateFog = function() {
        const plane = this._rrFogPlane;
        if (!plane) return;
        const fog = $gameMap.rrFogData();
        if (this._rrFogName !== fog.name) {
            this._rrFogName = fog.name;
            plane.bitmap = fog.name ? ImageManager.loadPicture(fog.name) : null;
        }
        const zoom = fog.zoom;
        plane.visible = !!fog.name && zoom > 0;
        if (plane.tileScale) plane.tileScale.set(zoom, zoom); else if (plane.tileTransform) plane.tileTransform.scale.set(zoom, zoom);
        plane.opacity = Math.max(0, Math.min(255, fog.opacity));
        const speed = SCROLL_SWITCH > 0 && $gameSwitches.value(SCROLL_SWITCH) ? 2 : 1;
        // display_x / 8 (or / 4) in VX's units: the map's scroll in pixels, once or twice over.
        plane.origin.x = Math.floor($gameMap.displayX() * $gameMap.tileWidth() * speed) + fog.ox;
        plane.origin.y = Math.floor($gameMap.displayY() * $gameMap.tileHeight() * speed) + fog.oy;
    };
    const _spritesetUpdate = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _spritesetUpdate.call(this);
        this.rrUpdateFog();
    };
})();
